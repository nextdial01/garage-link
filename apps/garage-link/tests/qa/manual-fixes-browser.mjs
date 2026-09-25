// Local-only regression: real application + PostgREST + disposable Postgres.
// Authentication is synthetic; this is not evidence of a Production deploy.
import { chromium, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const origin='http://127.0.0.1:3019';
const api='http://127.0.0.1:55438/rest/v1';
const uid='50000000-0000-0000-0000-000000000001';
const encode=(v)=>Buffer.from(JSON.stringify(v)).toString('base64url');
const payload={sub:uid,aud:'authenticated',role:'authenticated',session_id:'59000000-0000-4000-8000-000000000003',exp:Math.floor(Date.now()/1000)+7200};
const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode(payload);
const token=unsigned+'.'+createHmac('sha256','manual-local-fixture-jwt-secret-only-20260925').update(unsigned).digest('base64url');
const session={access_token:token,refresh_token:'local-fixture-refresh',token_type:'bearer',expires_in:7200,expires_at:payload.exp,user:{id:uid,aud:'authenticated',role:'authenticated'}};
const output=process.env.MANUAL_FIX_SCREENSHOTS || '/private/tmp/garage-manual-fix-screenshots';
await mkdir(output,{recursive:true});
const headers={authorization:`Bearer ${token}`,apikey:'manual-local-anon-only'};
async function rows(table,query){const r=await fetch(`${api}/${table}?${query}`,{headers});if(!r.ok)throw new Error(await r.text());return r.json();}
const [storePreflight]=await rows('stores','id=eq.51100000-0000-0000-0000-000000000001&select=onboarding_completed_at');
expect(storePreflight?.onboarding_completed_at).toBeTruthy();
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={environment:'LOCAL',authentication:'synthetic fixture',business_api:'real PostgREST',database:'disposable PostgreSQL',checks:[],requests:[]};
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+encode(session),domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
  const page=await context.newPage();
  const select=(label)=>page.locator('label').filter({has:page.locator('span').filter({hasText:new RegExp(`^${label}$`)})}).locator('select');
  page.on('pageerror',error=>console.log('PAGE_ERROR',error.message));
  page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER_ERROR',msg.text());});
  page.on('requestfailed',req=>console.log('REQUEST_FAILED',req.url(),req.failure()?.errorText));
  page.on('request',r=>{if(r.url().includes('/rest/v1/')&&['POST','PATCH'].includes(r.method())&&/\/(maintenance_jobs|quotes|quote_items|invoices|invoice_items)(\?|$)/.test(r.url()))report.requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postDataJSON()});});
  const tag=Date.now().toString();
  for(const cost of [0,1000,12345]){
    console.log('MAINTENANCE_CREATE',cost);
    await page.goto(`${origin}/maintenance/new`);
    await page.getByLabel('受付番号', {exact:true}).fill(`FIX-${tag}-${cost}`);
    await select('受付種別').selectOption('一般整備');
    await select('顧客選択').selectOption('59000000-0000-4000-8000-000000000002');
    await select('車両選択').selectOption('53000000-0000-0000-0000-000000000001');
    await page.getByLabel('工賃', {exact:true}).fill('5000');
    await page.getByLabel('部品代', {exact:true}).fill(String(cost));
    await page.getByLabel('見積合計', {exact:true}).fill(String(5000+cost));
    await page.getByRole('button',{name:'整備・車検を登録する',exact:true}).click();
    await expect(page).toHaveURL(`${origin}/maintenance`,{timeout:15000});
    const [saved]=await rows('maintenance_jobs',`job_no=eq.FIX-${tag}-${cost}&select=id,job_type,parts_amount,estimated_total_amount`);
    expect(saved.job_type).toBe('一般整備');expect(saved.parts_amount).toBe(cost);
    await page.goto(`${origin}/maintenance/${saved.id}`);
    await expect(select('種別')).toHaveValue('一般整備');
    await expect(page.getByText('使用部品がまだ登録されていません')).toBeVisible();
    await expect(page.getByLabel('部品代',{exact:true})).toHaveValue(String(cost));
    await page.getByRole('button',{name:'保存する',exact:true}).click();
    await expect(page).toHaveURL(`${origin}/maintenance`,{timeout:15000});
    await page.goto(`${origin}/maintenance`);
    await page.goto(`${origin}/maintenance/${saved.id}`);
    await expect(select('種別')).toHaveValue('一般整備');
    await expect(page.getByText('使用部品がまだ登録されていません')).toBeVisible();
    await expect(page.getByLabel('部品代',{exact:true})).toHaveValue(String(cost));
    const [readback]=await rows('maintenance_jobs',`id=eq.${saved.id}&select=job_type,parts_amount,estimated_total_amount`);
    expect(readback.job_type).toBe('一般整備');expect(readback.parts_amount).toBe(cost);
    report.checks.push({operation:'maintenance_create_save_reopen',cost,saved,readback,result:'PASS'});
    if(cost===1000){
      await page.screenshot({path:`${output}/05-maintenance-fixed-detail.png`,fullPage:true});
      await page.locator('section').filter({has:page.getByRole('heading',{name:'基本情報',exact:true})}).last().screenshot({path:`${output}/05-maintenance-fixed-type.png`});
      await page.locator('section').filter({has:page.getByRole('heading',{name:'金額',exact:true})}).last().screenshot({path:`${output}/05-maintenance-fixed-cost.png`});
      for(const doc of ['quotes','invoices']){
        await page.goto(`${origin}/${doc}/new?jobId=${saved.id}`);
        await expect(page.getByRole('heading',{name:/見積|請求/}).first()).toBeVisible();
        await expect(page.locator('input[value="部品代"]')).toBeVisible();
        await expect(page.locator('input[value="1000"]').first()).toBeVisible();
        const singular=doc==='quotes'?'quote':'invoice';
        const number=`FIX-${singular.toUpperCase()}-PARTS-${tag}`;
        await page.locator(`#${singular}_no`).fill(number);
        await page.getByRole('button',{name:doc==='quotes'?'見積書を作成する':'請求書を作成する',exact:true}).click();
        await expect(page).toHaveURL(`${origin}/${doc}`,{timeout:15000});
        const [document]=await rows(doc,`${singular}_no=eq.${number}&select=id,total_amount`);
        expect(document.total_amount).toBe(6000);
        const items=await rows(`${singular}_items`,`${singular}_id=eq.${document.id}&select=name,unit_price,amount`);
        expect(items.find(item=>item.name==='部品代')).toMatchObject({unit_price:1000,amount:1000});
        await page.goto(`${origin}/${doc}/${document.id}`);
        if(doc==='quotes') await expect(page.getByText('部品代',{exact:true})).toBeVisible();
        await expect(page.getByText('6,000円',{exact:true}).first()).toBeVisible();
        report.checks.push({operation:`maintenance_to_${doc}_save_reopen`,parts_amount:1000,document,items,result:'PASS'});
      }
    }
  }
  console.log('QUOTE_CREATE_EDIT_STATUS');
  await page.goto(`${origin}/quotes/new`);
  await page.getByLabel('見積番号',{exact:true}).fill(`FIX-QUOTE-${tag}`);
  await page.locator('#title').fill('手順書デモ 修正確認');
  await page.getByRole('button',{name:'見積書を作成する',exact:true}).click();
  await expect(page).toHaveURL(`${origin}/quotes`,{timeout:15000});
  const [quote]=await rows('quotes',`quote_no=eq.FIX-QUOTE-${tag}&select=id,title,status`);
  await page.goto(`${origin}/quotes/${quote.id}`);
  await page.getByRole('link',{name:'編集',exact:true}).click();
  await page.locator('#title').fill('手順書デモ 更新確認済み');
  await page.getByRole('button',{name:'見積書を更新する',exact:true}).click();
  await expect(page).toHaveURL(`${origin}/quotes`,{timeout:15000});
  await page.goto(`${origin}/quotes/${quote.id}`);
  await expect(page.getByText('手順書デモ 更新確認済み',{exact:true})).toBeVisible();
  await page.screenshot({path:`${output}/09-quotes-fixed-detail.png`,fullPage:true});
  await page.getByRole('link',{name:'編集',exact:true}).click();
  await page.locator('#status').selectOption('送付済み');
  await page.getByRole('button',{name:'見積書を更新する',exact:true}).click();
  await expect(page).toHaveURL(`${origin}/quotes`,{timeout:15000});
  await expect(page.getByText(`FIX-QUOTE-${tag}`,{exact:true})).toBeVisible();
  await expect(page.getByRole('row').filter({has:page.getByText(`FIX-QUOTE-${tag}`,{exact:true})})).toContainText('送付済み');
  const [readback]=await rows('quotes',`id=eq.${quote.id}&select=title,status`);
  expect(readback.title).toBe('手順書デモ 更新確認済み');expect(readback.status).toBe('送付済み');
  await page.screenshot({path:`${output}/09-quotes-fixed-list.png`,fullPage:true});
  report.checks.push({operation:'quote_edit_and_status',readback,result:'PASS'});
  await writeFile(`${output}/runtime-report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.checks));
} catch(error){
  const page=browser.contexts()[0]?.pages()[0];
  console.log('FAILURE',error.message);
  if(page){console.log('FAILED_URL',page.url());console.log((await page.locator('body').innerText()).slice(-2000));}
  report.error=error.message;await writeFile(`${output}/runtime-report.json`,JSON.stringify(report,null,2));
  throw error;
} finally {await browser.close();}
