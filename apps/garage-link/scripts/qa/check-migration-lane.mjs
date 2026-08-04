#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'../..');
const qaRoot=resolve(root,'supabase/qa');
const productionRoot=resolve(root,'supabase/migrations');
const manifest=JSON.parse(await readFile(resolve(qaRoot,'manifest.json'),'utf8'));
if(manifest.lane!=='staging-qa-only'||manifest.requiredProjectRef!=='gaytoojzwqkpuvfofeql'||manifest.denylistedProjectRefs?.includes(manifest.requiredProjectRef))throw new Error('QA_LANE_IDENTITY_CONTRACT_INVALID');
const productionFiles=await readdir(productionRoot);
for(const entry of manifest.entries){
  if(productionFiles.some(file=>file.startsWith(entry.version)))throw new Error(`QA_DDL_IN_PRODUCTION_PATH:${entry.version}`);
  const content=await readFile(resolve(qaRoot,entry.file));
  const checksum=createHash('sha256').update(content).digest('hex');
  if(checksum!==entry.checksum)throw new Error(`QA_CHECKSUM_MISMATCH:${entry.version}`);
}
for(const rollback of manifest.rollbacks){
  const content=await readFile(resolve(qaRoot,rollback.file));
  const checksum=createHash('sha256').update(content).digest('hex');
  if(checksum!==rollback.checksum)throw new Error(`QA_ROLLBACK_CHECKSUM_MISMATCH:${rollback.version}`);
}
process.stdout.write(JSON.stringify({ok:true,lane:manifest.lane,entries:manifest.entries.length,rollbacks:manifest.rollbacks.length})+'\n');
