#!/usr/bin/env node
import { appendFile, readFile } from 'node:fs/promises';

const PRODUCTION_AUTH_SETTINGS='https://wmlpuzuskfiwdipluglz.supabase.co/auth/v1/settings';
const HISTORICAL_EVIDENCE_SOURCES=[
  'apps/garage-link/docs/quality-audit/evidence/current-backed-preview-validation.json',
  'apps/garage-link/docs/quality-audit/35-current-backed-preview-validation-report.md',
  'apps/garage-link/docs/quality-audit/operator/g7-high-remediation/04-staging-environment-matrix.md',
];

async function main(){
  let status=0;
  try {
    const response=await fetch(PRODUCTION_AUTH_SETTINGS,{redirect:'manual'});
    status=response.status;
  } catch {}
  const historical=(await Promise.all(HISTORICAL_EVIDENCE_SOURCES.map(path=>readFile(path,'utf8').catch(()=>'')))).join('\n');
  const historicalAuthDelivery=/supabase.{0,80}(smtp|confirmation|recovery)|(?:smtp|confirmation|recovery).{0,80}supabase/i.test(historical);
  const productionResendOnly=/resend credential.{0,40}production.?only|resendCredential.{0,40}production.?only/i.test(historical);
  // The public Hosted Auth settings surface intentionally does not disclose
  // SMTP credentials or provider state. A non-secret read can prove neither a
  // custom transport nor default SMTP, so it must never manufacture a PASS.
  const classification='PRODUCTION_TRANSPORT_UNKNOWN';
  const evidence={state:classification,read_only:true,settings_http_status:status,historical_evidence_sources_scanned:HISTORICAL_EVIDENCE_SOURCES.length,historical_auth_delivery_evidence:historicalAuthDelivery?'PRESENT':'ABSENT',app_resend_production_only_evidence:productionResendOnly?'PRESENT_UNRELATED_TO_HOSTED_AUTH':'ABSENT',reason:'NO_MACHINE_READABLE_HOSTED_AUTH_SMTP_EVIDENCE'};
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`classification=${classification}\n`);
}

await main();
