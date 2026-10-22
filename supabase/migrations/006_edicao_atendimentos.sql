-- Permite registrar horário e corrigir todos os dados de um atendimento existente.
begin;

alter table personal.services add column if not exists service_time time;

create or replace function public.update_personal_service(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid := auth.uid();
 me personal.accounts%rowtype;
 entity_id uuid;
 client uuid;
 previous_client uuid;
 service_day date;
 service_clock time;
 new_amount numeric;
 previous_amount numeric;
 previous_commission numeric;
 service_label text;
 payment_method text;
begin
 if uid is null then raise exception 'Entre na sua conta para continuar.'; end if;
 select * into me from personal.accounts where id=uid and approved;
 if not found then raise exception 'Sua conta aguarda a aprovação do administrador.'; end if;

 entity_id:=nullif(payload->>'id','')::uuid;
 select s.client_id,s.amount,s.commission into previous_client,previous_amount,previous_commission
 from personal.services s
 where s.id=entity_id and s.account_id=uid and not s.canceled
 for update;
 if not found then raise exception 'Atendimento não encontrado ou já cancelado.'; end if;

 client:=coalesce(nullif(payload->>'client_id','')::uuid,previous_client);
 if not exists(select 1 from personal.clients c where c.id=client and c.account_id=uid and (c.active or c.id=previous_client)) then
   raise exception 'Selecione um cliente ativo desta conta.';
 end if;
 service_label:=trim(coalesce(payload->>'service_name',''));
 if length(service_label) not between 1 and 1000 then raise exception 'Informe o serviço realizado.'; end if;
 new_amount:=(payload->>'amount')::numeric;
 if new_amount is null or new_amount<=0 or new_amount>1000000 then raise exception 'Informe um valor válido para o serviço.'; end if;
 service_day:=(payload->>'day')::date;
 if service_day is null or service_day>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data do atendimento não pode ser futura.'; end if;
 service_clock:=nullif(payload->>'service_time','')::time;
 -- O horário é opcional para preservar a edição de registros históricos sem esse dado.
 payment_method:=payload->>'payment';
 if payment_method is null or payment_method not in ('Pix','Dinheiro','Cartão','Outro') then raise exception 'Selecione uma forma de pagamento válida.'; end if;

 update personal.services
 set client_id=client,
     service_name=service_label,
     amount=new_amount,
     commission=case when new_amount=previous_amount then previous_commission else round(new_amount*me.commission_rate/100,2) end,
     day=service_day,
     service_time=service_clock,
     payment=payment_method
 where id=entity_id and account_id=uid and not canceled;
 insert into personal.audit(account_id,action,target) values(uid,'service_update',entity_id::text);
 return jsonb_build_object('ok',true,'id',entity_id);
exception
 when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
   raise exception 'Confira o cliente, o serviço, a data, o horário e o valor informados.';
end;
$$;
revoke all on function public.update_personal_service(jsonb) from public,anon,authenticated;

-- A API pública continua validando e-mail e aprovação antes de qualquer ação.
create or replace function public.barber_account_api(action text,payload jsonb default '{}'::jsonb)
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

  if action='service_update' then
    return public.update_personal_service(payload);
  end if;

  result:=public.barber_account_api_data(action,payload);
  if action='service_add' and (result ? 'id') and nullif(payload->>'service_time','') is not null then
    update personal.services
    set service_time=(payload->>'service_time')::time
    where id=(result->>'id')::uuid and account_id=uid;
  end if;
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

