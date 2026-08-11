#!/usr/bin/env node
import { appendFile } from 'node:fs/promises';

const PRODUCTION_AUTH_SETTINGS='https://wmlpuzuskfiwdipluglz.supabase.co/auth/v1/settings';

async function main(){
  let status=0;
  try {
    const response=await fetch(PRODUCTION_AUTH_SETTINGS,{redirect:'manual'});
    status=response.status;
  } catch {}
  // The public Hosted Auth settings surface intentionally does not disclose
  // SMTP credentials or provider state. A non-secret read can prove neither a
  // custom transport nor default SMTP, so it must never manufacture a PASS.
  const classification='PRODUCTION_TRANSPORT_UNKNOWN';
  const evidence={state:classification,read_only:true,settings_http_status:status,reason:'NO_MACHINE_READABLE_SMTP_EVIDENCE'};
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`classification=${classification}\n`);
}

await main();
