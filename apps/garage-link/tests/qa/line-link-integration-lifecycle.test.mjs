import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const appRoot=resolve(import.meta.dirname,'../..');
const migration=await readFile(resolve(appRoot,'supabase/qa/migrations/20261020150000_line_link_integration_lifecycle.sql'),'utf8');
const runner=await readFile(resolve(appRoot,'scripts/qa/lifecycle.mjs'),'utf8');
const contract=await readFile(resolve(appRoot,'scripts/qa/release-critical-qa-lifecycle-contract.mjs'),'utf8');

test('L-LINK acceptance fixture is run-bound and restricted to the staging canary lifecycle',()=>{
  assert.match(migration,/r\.project_ref<>'gaytoojzwqkpuvfofeql'/);
  assert.match(migration,/r\.purpose<>'garage-link-l-link-integration-acceptance'/);
  assert.match(migration,/r\.state<>'PROVISIONED'/);
  assert.match(migration,/f\.fixture_type<>'canary'/);
  assert.match(migration,/qa-garage-link:'\|\|p_run_id::text/);
  assert.match(migration,/values\(\(select connection_id from qa_internal\.line_link_integration_runs/);
  assert.match(migration,/l_link_integration_enabled=true/);
  assert.match(migration,/status in \('pending','completed'\)/);
});

test('event retry can only reset an acknowledged event registered to this run',()=>{
  const reset=migration.slice(migration.indexOf('function public.qa_l_link_integration_reset_event'),migration.indexOf('function public.qa_l_link_integration_dry_run'));
  assert.match(reset,/p_event_id=any\(i\.event_ids\)/);
  assert.match(reset,/v_status<>'completed'/);
  assert.match(reset,/external_reference_id is not null/);
  assert.match(reset,/status='pending',external_reference_id=null,error_detail=null/);
});

test('cleanup has a dry-run gate and verifies zero fixture residues',()=>{
  const cleanup=migration.slice(migration.indexOf('function public.qa_l_link_integration_cleanup'),migration.indexOf('function public.qa_l_link_integration_verify_clean'));
  assert.match(cleanup,/qa_l_link_integration_dry_run\(p_run_id\)/);
  assert.match(cleanup,/delete from public\.line_link_inbound_nonces where store_id=i\.store_id and tenant_id=i\.tenant_id and key_id=i\.key_id/);
  assert.match(cleanup,/where id=any\(i\.event_ids\) and store_id=i\.store_id and company_id=i\.tenant_id/);
  assert.match(cleanup,/where id=i\.connection_id and tenant_id=i\.tenant_id and store_id=i\.store_id and key_id=i\.key_id/);
  assert.match(migration,/key_id text not null check \(key_id ~ '\^\[a-z0-9_-\]\{1,32\}\$'\)/);
  assert.match(cleanup,/set l_link_integration_enabled=false/);
  assert.match(migration,/v_service_execute=21/);
  assert.match(migration,/line_link_integration_lifecycle','service_role_only'/);
  assert.match(contract,/service_execute_count===21/);
  assert.match(runner,/qa_l_link_integration_verify_clean/);
  assert.match(runner,/line-link-reset/);
});
