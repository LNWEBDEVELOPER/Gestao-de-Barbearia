-- Novas contas precisam de aprovação de Luan antes de acessar a gestão.
-- Contas e usuários existentes antes desta migração mantêm o acesso.
begin;

alter table personal.accounts
  add column approved boolean not null default false;

update personal.accounts set approved=true;

-- Preserva o acesso de usuários que já existiam no Auth antes da mudança,
-- inclusive quem ainda não havia aberto o painel para criar sua conta.
insert into personal.accounts(id,approved)
select id,true from auth.users where created_at < transaction_timestamp()
on conflict(id) do update set approved=true;

create function public.create_personal_account_for_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into personal.accounts(id,approved)
  values(new.id,lower(coalesce(new.email,''))='luannascimentopsp@gmail.com')
  on conflict(id) do nothing;
  return new;
end;
$$;

create trigger create_personal_account_after_signup
after insert on auth.users
for each row execute function public.create_personal_account_for_new_user();
revoke all on function public.create_personal_account_for_new_user() from public,anon,authenticated;

-- Mantém a implementação de dados atual e acrescenta uma barreira de acesso
-- e duas operações administrativas verificadas pelo e-mail confirmado.
alter function public.barber_account_api(text,jsonb) rename to barber_account_api_data;
revoke all on function public.barber_account_api_data(text,jsonb) from public,anon,authenticated;

create function public.barber_account_api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  email_value text;
  account_approved boolean;
  admin_access boolean;
  target_id uuid;
  result jsonb;
begin
  if uid is null then raise exception 'Entre na sua conta para continuar.'; end if;

  select lower(email) into email_value
  from auth.users
  where id=uid and email_confirmed_at is not null;
  if email_value is null then raise exception 'Confirme seu e-mail antes de entrar.'; end if;

  admin_access := email_value='luannascimentopsp@gmail.com';
  insert into personal.accounts(id,approved)
  values(uid,admin_access)
  on conflict(id) do nothing;
  if admin_access then
    update personal.accounts set approved=true where id=uid;
  end if;
  select approved into account_approved from personal.accounts where id=uid;

  if action='admin_pending' then
    if not admin_access then raise exception 'Acesso reservado ao administrador.'; end if;
    return coalesce((
      select jsonb_agg(jsonb_build_object('id',a.id,'email',lower(u.email),'created_at',u.created_at) order by u.created_at)
      from personal.accounts a
      join auth.users u on u.id=a.id
      where not a.approved and u.email_confirmed_at is not null
        and lower(u.email)<>'luannascimentopsp@gmail.com'
    ),'[]'::jsonb);
  elsif action='admin_approve' then
    if not admin_access then raise exception 'Acesso reservado ao administrador.'; end if;
    target_id:=nullif(payload->>'id','')::uuid;
    update personal.accounts a set approved=true
    where a.id=target_id and exists(select 1 from auth.users u where u.id=a.id and u.email_confirmed_at is not null);
    if not found then raise exception 'Solicitação não encontrada ou e-mail ainda não confirmado.'; end if;
    return jsonb_build_object('ok',true,'id',target_id);
  end if;

  if not account_approved then
    if action='state' then
      return jsonb_build_object('access','pending','email',email_value);
    end if;
    raise exception 'Sua conta aguarda a aprovação do administrador.';
  end if;

  result:=public.barber_account_api_data(action,payload);
  if action='state' then
    return result || jsonb_build_object('access','approved','is_admin',admin_access,
      'pending_requests',case when admin_access then public.barber_account_api('admin_pending','{}'::jsonb) else '[]'::jsonb end);
  end if;
  return result;
end;
$$;

revoke all on function public.barber_account_api(text,jsonb) from public,anon;
grant execute on function public.barber_account_api(text,jsonb) to authenticated;

notify pgrst,'reload schema';

commit;
