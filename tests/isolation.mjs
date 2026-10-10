import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const db=await PGlite.create();
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
for(const file of ['001_barbearia.sql','002_importacao.sql'])await db.exec(await readFile(root+'supabase/migrations/'+file,'utf8'));
const a=randomUUID(),b=randomUUID(),unconfirmed=randomUUID();
await db.query(`insert into auth.users values($1,'a@example.test',now()),($2,'b@example.test',now()),($3,'unconfirmed@example.test',null)`,[a,b,unconfirmed]);
await db.query(`insert into barber.profiles(auth_id,email,name,role) values($1,'a@example.test','Legacy owner','owner')`,[a]);
await db.exec(await readFile(root+'supabase/migrations/003_contas_individuais.sql','utf8'));
assert.equal((await db.query('select count(*)::int as n from barber.profiles')).rows[0].n,1);
let checks=1;
async function identity(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);}
async function api(action,payload={}){return (await db.query('select public.barber_account_api($1,$2::jsonb) as result',[action,JSON.stringify(payload)])).rows[0].result;}
async function denied(action,payload){await assert.rejects(()=>api(action,payload));checks++;}
await identity(null,'anon');await denied('state');
await identity(null);await denied('state');
await identity(unconfirmed);await denied('state');
await identity(a);
let state=await api('state');
for(const key of ['clients','catalog','services','goals'])assert.deepEqual(state[key],[]);
assert.equal(state.shop.name,'');assert.equal(state.profiles.length,1);checks++;
const today=state.today,clientA=(await api('client_save',{name:'Cliente A'})).id;
const catalogA=(await api('catalog_save',{name:'Corte',price:30})).id;
await api('profile_save',{name:'Conta A',commission_rate:50});
await api('settings_save',{name:'Negócio A'});
await api('goals_save',{daily:100,weekly:500,monthly:2000});
const request=randomUUID(),servicePayload={request_id:request,client_id:clientA,catalog_ids:[catalogA],day:today,payment:'Pix'};
const serviceA=(await api('service_add',servicePayload)).id;
await api('service_add',servicePayload);
assert.equal((await api('report',{start:today,end:today})).length,1);checks++;
assert.equal((await api('report',{start:today,end:today}))[0].commission,15);checks++;
const snapshotA=await api('backup');
await identity(b);
state=await api('state');
for(const key of ['clients','catalog','services','goals'])assert.deepEqual(state[key],[]);
assert.equal(state.shop.name,'');checks++;
assert.deepEqual(await api('history',{client_id:clientA}),[]);
assert.deepEqual(await api('report',{start:today,end:today,barber_id:a}),[]);
assert.deepEqual(await api('audit'),[]);checks+=3;
const backupB=await api('backup');assert.deepEqual(backupB.services,[]);assert.equal(backupB.profile.id,b);checks++;
for(const [action,payload] of [
 ['client_save',{id:clientA,name:'Attack'}],['client_active',{id:clientA,active:false}],
 ['catalog_save',{id:catalogA,name:'Attack',price:1}],['service_cancel',{id:serviceA,reason:'Attack cancel'}],
 ['goals_save',{profile_id:a,daily:1,weekly:1,monthly:1}],['profile_save',{id:a,name:'Attack',commission_rate:99}],
 ['profile_active',{id:a,active:false}],['service_add',{...servicePayload,request_id:randomUUID()}],
 ])await denied(action,payload);
const clientB=(await api('client_save',{name:'Cliente A'})).id,catalogB=(await api('catalog_save',{name:'Corte',price:40})).id;
await denied('service_add',{...servicePayload,client_id:clientB,request_id:randomUUID()});
await denied('service_add',{...servicePayload,client_id:clientB,catalog_ids:[catalogB],barber_id:a});
await denied('service_add',{...servicePayload,client_id:clientB,catalog_ids:null});
await denied('service_add',{...servicePayload,client_id:clientB,catalog_ids:[catalogB,catalogB]});
await api('service_add',{...servicePayload,client_id:clientB,catalog_ids:[catalogB],account_id:a,amount:1,commission:1});
assert.equal((await api('report',{start:today,end:today}))[0].amount,40);checks++;
await assert.rejects(()=>db.query('select * from personal.clients'));checks++;
await assert.rejects(()=>db.query("select public.barber_api('state')"));checks++;
await assert.rejects(()=>db.query("select public.barber_import('{}'::jsonb)"));checks++;
await identity(a);
const after=await api('backup');delete after.exported_at;delete snapshotA.exported_at;
assert.deepEqual(after,snapshotA);checks++;
await api('client_save',{id:clientA,name:'Cliente atualizado'});
await api('catalog_save',{id:catalogA,name:'Corte',price:35});
await api('service_cancel',{id:serviceA,reason:'Cancelado em teste'});
assert.equal((await api('state')).services[0].canceled,true);checks++;
console.log(JSON.stringify({result:'passed',checks,coverage:'Migration preserves legacy records; empty accounts; account isolation across reads, writes, reports, exports, audit; anonymous/unconfirmed/direct/legacy access denied; server pricing; idempotency; own CRUD.'}));
await db.close();
