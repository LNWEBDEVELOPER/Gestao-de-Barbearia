-- Define 50% como comissão padrão e corrige contas que receberam o padrão antigo de 0%.
-- Execute uma vez após 003_contas_individuais.sql no SQL Editor do Supabase.
begin;

alter table personal.accounts
  alter column commission_rate set default 50;

update personal.accounts
set commission_rate = 50
where commission_rate = 0;

commit;

