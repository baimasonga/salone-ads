// Run against an isolated in-memory PostgreSQL engine, never the live project.
// Install @electric-sql/pglite outside the checkout, then set PGLITE_MODULE_PATH
// to its dist/index.js. No test-only dependency is added to the application.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PGLITE_MODULE_PATH;
if (!modulePath) throw new Error('Set PGLITE_MODULE_PATH to an installed @electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const user = '00000000-0000-4000-8000-000000000001';
let checks = 0;
const check = (value, expected) => { assert.deepEqual(value, expected); checks++; };
const value = async sql => (await db.query(sql)).rows[0].value;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage;
create table auth.users(id uuid primary key);
insert into auth.users values ('${user}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb $$;
select set_config('test.user','${user}',false);
select set_config('test.jwt','{"aal":"aal2"}',false);
create table public.backend_command_requests(
 id uuid primary key default gen_random_uuid(), actor_id uuid not null, command_name text not null,
 idempotency_key text not null, payload_hash text not null, status text default 'processing',
 result jsonb, error_code text, request_id text, started_at timestamptz default now(),
 completed_at timestamptz,updated_at timestamptz default now(),attempt_count integer default 1,
 unique(actor_id,command_name,idempotency_key));
create function public.claim_backend_command(text,text,text,text) returns void language sql as $$ select $$;
create function public.complete_backend_command(uuid,jsonb) returns void language sql as $$ select $$;
create function public.fail_backend_command(uuid,text) returns void language sql as $$ select $$;
create table public.test_effects(amount numeric);
create function public.record_commercial_payment(p_invoice_id uuid,p_reference text,p_method text,p_amount numeric)
returns uuid language plpgsql as $$ begin
 insert into public.test_effects values(p_amount);
 if p_reference='fail' then raise exception 'simulated mutation failure'; end if;
 return p_invoice_id;
end; $$;
create function public.admin_create_commercial_invoice(p_org_id uuid,p_currency_code text,p_due_at date,p_notes text,p_tax_amount numeric,p_lines jsonb)
returns jsonb language sql as $$ select jsonb_build_object('notes',p_notes,'lines',p_lines,'tax',p_tax_amount) $$;
create function public.admin_transition_organization(p_org_id uuid,p_action text,p_reason text)
returns void language plpgsql as $$ begin insert into public.test_effects values(0); end; $$;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant usage on schema storage,auth to authenticated;
grant select,insert,update on storage.objects to authenticated;
-- Representative existing bucket policy: destination ownership is still required.
create policy existing_insert on storage.objects for insert to authenticated with check (name like 'allowed/%');
create policy existing_select on storage.objects for select to authenticated using (true);
create policy existing_update on storage.objects for update to authenticated using (true) with check (true);
`);
await db.exec(await readFile('migrations/manohub-new-project/96_protected_storage_uploads.sql','utf8'));
await db.exec(await readFile('migrations/manohub-new-project/97_atomic_backend_commands.sql','utf8'));
const params = reference => JSON.stringify({ p_invoice_id: user, p_reference: reference, p_method: 'cash', p_amount: 5 });
const execute = async (key, reference = 'ok') => (await db.query('select public.execute_backend_command($1,$2,$3::jsonb,$4) as value', ['billing.payment.record',key,params(reference),'request-test'])).rows[0].value;
try {
  await assert.rejects(execute('failed-key','fail'), /simulated mutation failure/); checks++;
  check(await value('select count(*)::int as value from public.test_effects'),0);
  check(await value('select count(*)::int as value from public.backend_command_requests'),0);
  const first = await execute('success-key'); check(first.cached,false);
  const second = await execute('success-key'); check(second.cached,true); check(first.commandId,second.commandId);
  check(await value('select count(*)::int as value from public.test_effects'),1);
  await assert.rejects(execute('success-key','different'),/already used/); checks++;
  await db.exec(`select set_config('test.jwt','{"aal":"aal1"}',false)`);
  await assert.rejects(execute('mfa-test'),/Additional verification/); checks++;
  await db.exec(`select set_config('test.jwt','{"aal":"aal2"}',false)`);
  const invoiceParams = { p_org_id:user,p_currency_code:'SLE',p_due_at:'2026-12-01',p_notes:null,p_tax_amount:0,p_lines:[{ description:'A', quantity:1, unit_amount:10 }] };
  const invoice = (await db.query('select public.execute_backend_command($1,$2,$3::jsonb,$4) as value',['billing.invoice.create','invoice-key',JSON.stringify(invoiceParams),'request-test'])).rows[0].value;
  check(invoice.result,{ notes:null,tax:0,lines:invoiceParams.p_lines });
  const voidParams = JSON.stringify({ p_org_id:user, p_action:'suspend', p_reason:'Test' });
  const runVoid = async () => (await db.query('select public.execute_backend_command($1,$2,$3::jsonb,$4) as value',['organization.transition','void-test',voidParams,'request-test'])).rows[0].value;
  check((await runVoid()).result,null);
  check((await runVoid()).cached,true);
  check(await value('select count(*)::int as value from public.test_effects where amount=0'),1);
  await assert.rejects(db.query('select public.execute_backend_command($1,$2,$3::jsonb,$4)', ['billing.payment.record','bad-params','{"unexpected":"value"}','request']),/Invalid command parameters/); checks++;
  await db.exec(`select set_config('test.user','',false)`);
  await assert.rejects(execute('no-user-key'),/Authentication required/); checks++;
  await db.exec(`select set_config('test.user','${user}',false)`);
  await db.exec(`insert into public.protected_upload_authorizations(user_id,bucket_id,object_path) values ('${user}','bid-submissions','allowed/scanned.pdf'),('${user}','bid-submissions','forbidden/scanned.pdf');
    insert into public.protected_upload_authorizations(user_id,bucket_id,object_path,expires_at) values ('${user}','bid-submissions','allowed/expired.pdf',now()-interval '1 minute');
    set role authenticated;`);
  await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values ('bid-submissions','allowed/unscanned.pdf')`),/row-level security/); checks++;
  await db.exec(`insert into storage.objects(bucket_id,name) values ('bid-submissions','allowed/scanned.pdf')`);
  check(await value('select count(*)::int as value from storage.objects'),1);
  await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values ('bid-submissions','forbidden/scanned.pdf')`),/row-level security/); checks++;
  await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values ('bid-submissions','allowed/expired.pdf')`),/row-level security/); checks++;
  await db.exec(`update storage.objects set name='allowed/replaced.pdf'`);
  check(await value(`select name as value from storage.objects limit 1`),'allowed/scanned.pdf');
  await assert.rejects(db.exec('select * from public.protected_upload_authorizations'),/permission denied/); checks++;
  await db.exec('reset role');
  await db.exec(`select set_config('test.user','00000000-0000-4000-8000-000000000002',false); set role authenticated;`);
  await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values ('bid-submissions','allowed/scanned.pdf')`),/row-level security/); checks++;
  console.log(`PostgreSQL migration regression checks passed: ${checks}`);
} finally { await db.close(); }
