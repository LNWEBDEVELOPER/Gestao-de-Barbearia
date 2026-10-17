-- Contas independentes. O schema barber antigo é preservado, sem acesso pelo app.
-- Execute após 001 e 002, antes de publicar o frontend v3.
begin;
create schema personal;
revoke all on schema personal from public, anon, authenticated;
create table personal.accounts (
 id uuid primary key references auth.users(id),
 name text not null default 'Minha conta' check(length(trim(name)) between 2 and 100),
 commission_rate numeric(5,2) not null default 50 check(commission_rate between 0 and 100),
 shop_name text not null default '' check(length(shop_name)<=100),
 phone text not null default '' check(length(phone)<=20),
 address text not null default '' check(length(address)<=300)
);
create table personal.clients (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references personal.accounts(id),
 name text not null check(length(trim(name)) between 2 and 100),
 phone text not null default '' check(length(phone)<=20),
 notes text not null default '' check(length(notes)<=2000), active boolean not null default true,
 created_at timestamptz not null default now(), unique(account_id,id)
);
create unique index personal_client_identity on personal.clients(account_id,lower(trim(name)),phone);
create table personal.catalog (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references personal.accounts(id),
 name text not null check(length(trim(name)) between 2 and 100),
 price numeric(12,2) not null check(price>0 and price<=1000000), active boolean not null default true,
 unique(account_id,name)
);
create table personal.services (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references personal.accounts(id),
 request_id uuid not null, client_id uuid not null,
 service_name text not null check(length(service_name) between 1 and 1000),
 amount numeric(12,2) not null check(amount>0 and amount<=1000000),
 commission numeric(12,2) not null check(commission>=0 and commission<=amount),
 day date not null, payment text not null check(payment in ('Pix','Dinheiro','Cartão','Outro')),
 canceled boolean not null default false, cancel_reason text,
 created_at timestamptz not null default now(), unique(account_id,request_id),
 foreign key(account_id,client_id) references personal.clients(account_id,id)
);
create index personal_service_day on personal.services(account_id,day desc);
create table personal.goals (
 account_id uuid not null references personal.accounts(id), month date not null check(extract(day from month)=1),
 daily numeric(12,2) not null check(daily>0 and daily<=1000000),
 weekly numeric(12,2) not null check(weekly>0 and weekly<=1000000),
 monthly numeric(12,2) not null check(monthly>0 and monthly<=1000000),
 updated_at timestamptz not null default now(), primary key(account_id,month)
);
create table personal.audit (
 id bigint generated always as identity primary key,
 account_id uuid not null references personal.accounts(id), action text not null, target text,
 created_at timestamptz not null default now()
);
-- Sem acesso direto às tabelas. A função abaixo verifica auth.uid() em toda operação.
alter table personal.accounts enable row level security;
alter table personal.clients enable row level security;
alter table personal.catalog enable row level security;
alter table personal.services enable row level security;
alter table personal.goals enable row level security;
alter table personal.audit enable row level security;
revoke all on all tables in schema personal from public,anon,authenticated;
revoke all on all sequences in schema personal from public,anon,authenticated;

create function public.barber_account_api(action text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid := auth.uid(); email_value text; me personal.accounts%rowtype;
 today date := (now() at time zone 'America/Sao_Paulo')::date;
 month_start date := date_trunc('month',now() at time zone 'America/Sao_Paulo')::date;
 entity_id uuid; client uuid; request uuid; start_day date; end_day date; service_day date;
 count_value int; total numeric; label text; result jsonb; profile jsonb;
begin
 if uid is null then raise exception 'Entre na sua conta para continuar.'; end if;
 select lower(email) into email_value from auth.users where id=uid and email_confirmed_at is not null;
 if email_value is null then raise exception 'Confirme seu e-mail antes de entrar.'; end if;
 insert into personal.accounts(id) values(uid) on conflict(id) do nothing;
 select * into me from personal.accounts where id=uid;
 profile := jsonb_build_object('id',uid,'name',me.name,'email',email_value,'role','owner','active',true,'commission_rate',me.commission_rate);
 if action='state' then
   return jsonb_build_object('me',profile,'profiles',jsonb_build_array(profile),'today',today,'month',to_char(month_start,'YYYY-MM'),
     'shop',jsonb_build_object('name',me.shop_name,'phone',me.phone,'address',me.address),
     'clients',coalesce((select jsonb_agg(to_jsonb(c)-'account_id'||jsonb_build_object('created_by',uid,'last_day',(select max(s.day) from personal.services s where s.account_id=uid and s.client_id=c.id and not s.canceled)) order by c.name) from personal.clients c where c.account_id=uid),'[]'::jsonb),
     'catalog',coalesce((select jsonb_agg(to_jsonb(c)-'account_id' order by c.name) from personal.catalog c where c.account_id=uid),'[]'::jsonb),
     'goals',coalesce((select jsonb_agg(to_jsonb(g)-'account_id'||jsonb_build_object('profile_id',uid)) from personal.goals g where g.account_id=uid and g.month=month_start),'[]'::jsonb),
     'services',coalesce((select jsonb_agg(to_jsonb(s)-'account_id'||jsonb_build_object('barber_id',uid,'barber_name',me.name,'client_name',c.name) order by s.day desc,s.created_at desc) from personal.services s join personal.clients c on c.id=s.client_id and c.account_id=uid where s.account_id=uid and s.day>=month_start-7),'[]'::jsonb));
 elsif action='client_save' then
   entity_id:=nullif(payload->>'id','')::uuid;
   if entity_id is null then
     insert into personal.clients(account_id,name,phone,notes) values(uid,trim(payload->>'name'),regexp_replace(coalesce(payload->>'phone',''),'[^0-9+]','','g'),coalesce(payload->>'notes','')) returning id into entity_id;
   else
     update personal.clients set name=trim(payload->>'name'),phone=regexp_replace(coalesce(payload->>'phone',''),'[^0-9+]','','g'),notes=coalesce(payload->>'notes','') where id=entity_id and account_id=uid;
     if not found then raise exception 'Cliente não encontrado nesta conta.'; end if;
   end if;
 elsif action='client_active' then
   entity_id:=(payload->>'id')::uuid;
   update personal.clients set active=(payload->>'active')::boolean where id=entity_id and account_id=uid;
   if not found then raise exception 'Cliente não encontrado nesta conta.'; end if;
 elsif action='catalog_save' then
   entity_id:=nullif(payload->>'id','')::uuid;
   if entity_id is null then
     insert into personal.catalog(account_id,name,price,active) values(uid,trim(payload->>'name'),(payload->>'price')::numeric,coalesce((payload->>'active')::boolean,true)) returning id into entity_id;
   else
     update personal.catalog set name=trim(payload->>'name'),price=(payload->>'price')::numeric,active=coalesce((payload->>'active')::boolean,true) where id=entity_id and account_id=uid;
     if not found then raise exception 'Serviço não encontrado nesta conta.'; end if;
   end if;
 elsif action='service_add' then
   request:=(payload->>'request_id')::uuid;
   -- Serializa somente repetições da mesma requisição desta conta.
   perform pg_advisory_xact_lock(hashtextextended(uid::text||request::text,0));
   if exists(select 1 from personal.services s where s.account_id=uid and s.request_id=request) then return jsonb_build_object('ok',true); end if;
   if nullif(payload->>'barber_id','') is not null and (payload->>'barber_id')::uuid<>uid then raise exception 'Profissional não pertence a esta conta.'; end if;
   client:=(payload->>'client_id')::uuid;
   if not exists(select 1 from personal.clients c where c.id=client and c.account_id=uid and c.active) then raise exception 'Selecione um cliente desta conta.'; end if;
   service_day:=(payload->>'day')::date;
   if service_day is null or service_day>today then raise exception 'Data inválida.'; end if;
   if jsonb_typeof(payload->'catalog_ids') is distinct from 'array' then raise exception 'Selecione serviços desta conta.'; end if;
   if jsonb_array_length(payload->'catalog_ids') not between 1 and 20 then raise exception 'Selecione de 1 a 20 serviços.'; end if;
   select count(*),sum(c.price),string_agg(c.name,' + ' order by c.name) into count_value,total,label from personal.catalog c where c.account_id=uid and c.active and c.id in(select value::uuid from jsonb_array_elements_text(payload->'catalog_ids'));
   if count_value<>jsonb_array_length(payload->'catalog_ids') then raise exception 'Selecione serviços ativos desta conta.'; end if;
   insert into personal.services(account_id,request_id,client_id,service_name,amount,commission,day,payment) values(uid,request,client,label,total,round(total*me.commission_rate/100,2),service_day,payload->>'payment') returning id into entity_id;
 elsif action='service_cancel' then
   entity_id:=(payload->>'id')::uuid;
   if length(trim(coalesce(payload->>'reason',''))) not between 5 and 500 then raise exception 'Informe um motivo de 5 a 500 caracteres.'; end if;
   update personal.services set canceled=true,cancel_reason=trim(payload->>'reason') where id=entity_id and account_id=uid and not canceled;
   if not found then raise exception 'Atendimento não encontrado ou já cancelado.'; end if;
 elsif action='goals_save' then
   if nullif(payload->>'profile_id','') is not null and (payload->>'profile_id')::uuid<>uid then raise exception 'Metas não pertencem a esta conta.'; end if;
   insert into personal.goals(account_id,month,daily,weekly,monthly) values(uid,month_start,(payload->>'daily')::numeric,(payload->>'weekly')::numeric,(payload->>'monthly')::numeric)
   on conflict(account_id,month) do update set daily=excluded.daily,weekly=excluded.weekly,monthly=excluded.monthly,updated_at=now();
 elsif action='profile_save' then
   if nullif(payload->>'id','') is not null and (payload->>'id')::uuid<>uid then raise exception 'Perfil não pertence a esta conta.'; end if;
   update personal.accounts set name=trim(payload->>'name'),commission_rate=(payload->>'commission_rate')::numeric where id=uid;
 elsif action='settings_save' then
   update personal.accounts set shop_name=trim(coalesce(payload->>'name','')),phone=coalesce(payload->>'phone',''),address=coalesce(payload->>'address','') where id=uid;
 elsif action='history' then
   entity_id:=(payload->>'client_id')::uuid;
   return coalesce((select jsonb_agg(to_jsonb(s)-'account_id'||jsonb_build_object('barber_name',me.name,'barber_id',uid) order by s.day desc,s.created_at desc) from personal.services s where s.account_id=uid and s.client_id=entity_id and not s.canceled),'[]'::jsonb);
 elsif action='report' then
   start_day:=(payload->>'start')::date;end_day:=(payload->>'end')::date;
   if start_day is null or end_day is null or start_day>end_day or end_day-start_day>3660 then raise exception 'Escolha um intervalo válido de até 10 anos.'; end if;
   return coalesce((select jsonb_agg(to_jsonb(s)-'account_id'||jsonb_build_object('barber_id',uid,'barber_name',me.name,'client_name',c.name) order by s.day desc,s.created_at desc) from personal.services s join personal.clients c on c.id=s.client_id and c.account_id=uid where s.account_id=uid and s.day between start_day and end_day and (nullif(payload->>'barber_id','') is null or (payload->>'barber_id')::uuid=uid)),'[]'::jsonb);
 elsif action='audit' then
   return coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('actor_name',me.name)) from(select a.action,a.target,a.created_at from personal.audit a where a.account_id=uid order by a.id desc limit 100) a),'[]'::jsonb);
 elsif action='backup' then
   return jsonb_build_object('format','barber-account-v1','exported_at',now(),'profile',profile,
    'clients',coalesce((select jsonb_agg(to_jsonb(c)-'account_id') from personal.clients c where c.account_id=uid),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(to_jsonb(c)-'account_id') from personal.catalog c where c.account_id=uid),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(to_jsonb(s)-'account_id') from personal.services s where s.account_id=uid),'[]'::jsonb),
    'goals',coalesce((select jsonb_agg(to_jsonb(g)-'account_id') from personal.goals g where g.account_id=uid),'[]'::jsonb),
    'shop',jsonb_build_object('name',me.shop_name,'phone',me.phone,'address',me.address),
    'audit',coalesce((select jsonb_agg(to_jsonb(a)-'account_id') from personal.audit a where a.account_id=uid),'[]'::jsonb));
 else raise exception 'Ação desconhecida.';
 end if;
 insert into personal.audit(account_id,action,target) values(uid,action,entity_id::text);
 return jsonb_build_object('ok',true,'id',entity_id);
exception
 when unique_violation then raise exception 'Já existe um cadastro com esses dados nesta conta.';
 when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then raise exception 'Confira os campos obrigatórios, datas e valores informados.';
end;
$$;
revoke all on function public.barber_account_api(text,jsonb) from public,anon;
grant execute on function public.barber_account_api(text,jsonb) to authenticated;
-- Clientes antigos não podem continuar acessando a base compartilhada.
revoke all on function public.barber_api(text,jsonb) from public,anon,authenticated;
revoke all on function public.barber_import(jsonb) from public,anon,authenticated;
commit;

