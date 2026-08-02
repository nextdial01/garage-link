import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const checker = join(process.cwd(),'scripts/db/check-g1c-relation-contract.mjs');
const columns = {
  payment_items: ['id','store_id','deal_id','quote_id','invoice_id','payment_order','payment_method','amount','scheduled_date','note','created_at','updated_at'],
  trade_in_vehicles: ['id','store_id','deal_id','customer_id','maker','model_name','grade','model_year','mileage_km','vin','registration_no','inspection_expiry_date','color','condition_status','appraisal_amount','loan_balance','trade_in_amount','memo','created_at','updated_at'],
  delivery_usage_logs: ['id','tenant_id','store_id','line_account_id','message_id','delivery_id','delivery_count','billing_month','created_at'],
  delivery_overage_logs: ['id','tenant_id','store_id','line_account_id','delivery_id','included_limit','used_before','delivery_count','overage_count','overage_unit','overage_unit_price','estimated_overage_amount','billing_month','status','created_at'],
};

function run(catalog,phase='post-upgrade',applied='20260727000300') {
  const dir=mkdtempSync(join(tmpdir(),'db003-contract-'));
  const path=join(dir,'catalog.json');
  writeFileSync(path,JSON.stringify({ relations:catalog }));
  return spawnSync(process.execPath,[checker,'--catalog',path,'--phase',phase,'--applied-through',applied],{cwd:process.cwd(),encoding:'utf8'});
}

test('39-ledger pre-upgradeではcreator pendingの4欠落を明示する',()=>{
  const result=run([],'pre-upgrade','20260725010000');
  assert.equal(result.status,0,result.stderr);
  assert.equal((JSON.parse(result.stdout).results ?? []).filter((row)=>row.result==='PENDING_CREATE').length,4);
});

test('post-upgradeでは4 relation・列・RLSを必須にする',()=>{
  const catalog=Object.entries(columns).map(([name,value])=>({name,exists:true,columns:value,rls:true}));
  const result=run(catalog);
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).results.length,4);
});

test('required relation・列・RLS不足はfail-closed',()=>{
  const complete=Object.entries(columns).map(([name,value])=>({name,exists:true,columns:value,rls:true}));
  const absent=run(complete.slice(1));
  assert.equal(absent.status,2);
  assert.match(absent.stderr,/DB003_REQUIRED_RELATION_ABSENT/);
  const columnMissing=structuredClone(complete);
  columnMissing[0].columns=columnMissing[0].columns.filter((column)=>column!=='store_id');
  assert.match(run(columnMissing).stderr,/DB003_REQUIRED_COLUMN_ABSENT/);
  const rlsMissing=structuredClone(complete);
  rlsMissing[0].rls=false;
  assert.match(run(rlsMissing).stderr,/DB003_REQUIRED_RLS_DISABLED/);
});
