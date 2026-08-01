#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const classificationIndex = process.argv.indexOf('--classifications');
const classificationPath = classificationIndex >= 0 ? process.argv[classificationIndex + 1] : null;
const graph = JSON.parse(fs.readFileSync(path.join(root, 'operations/commercial/phase-a-checkpoints.json'), 'utf8'));
const contract = JSON.parse(fs.readFileSync(path.join(root, 'packages/billing/contract/garage-commercial-contract.json'), 'utf8'));
const fail = (message) => { throw new Error(message); };
const expectedCheckpoints = ['A01','A02','A03','A04','A05','A06','A07'];
if (graph.checkpoints.map((item) => item.id).join(',') !== expectedCheckpoints.join(',')) fail('PHASE_A_GRAPH_INCOMPLETE');
if (new Set(graph.checkpoints.map((item) => item.executor)).size !== expectedCheckpoints.length) fail('CHECKPOINT_EXECUTOR_NOT_UNIQUE');
for (const item of graph.checkpoints) {
  if (!item.executor || !item.name) fail(`CHECKPOINT_EXECUTOR_MISSING:${item.id}`);
}
const runnerText = fs.readFileSync(path.join(root, 'operations/scripts/run-garage-link-commercial-gate.sh'), 'utf8');
for (const item of graph.checkpoints) {
  if (!new RegExp(`^${item.executor}\\(\\) \\{`, 'm').test(runnerText)) fail(`CHECKPOINT_EXECUTOR_UNDEFINED:${item.id}`);
}
for (const required of [
  "KEYCHAIN_SERVICE='kannagi.garage-link.staging-db-url'",
  'KEYCHAIN_ACCOUNT="$(id -un)"',
  "readonly SECURITY_BIN='/usr/bin/security'",
  'keychain_find_credential()',
  'keychain_store_credential()',
  'credential_self_test()',
  '--reset-credential) RESET_CREDENTIAL=1',
  'KEYCHAIN_CREDENTIAL_SELF_TEST_PASS',
]) {
  if (!runnerText.includes(required)) fail(`KEYCHAIN_CONTRACT_MISSING:${required}`);
}
for (const forbidden of ['pb'+'paste', 'vercel env '+'pull', '/private/'+'tmp/', '/'+'tmp/']) {
  if (runnerText.includes(forbidden)) fail(`KEYCHAIN_FORBIDDEN_SOURCE:${forbidden}`);
}
if (/add-generic-password[^\n]*-w\s+["$]/.test(runnerText)) fail('KEYCHAIN_SECRET_COMMAND_ARGUMENT');
if (!/printf '%s\\n%s\\n' "\$value" "\$value" \| \\\n\s+"\$SECURITY_BIN" add-generic-password -a "\$KEYCHAIN_ACCOUNT" -s "\$KEYCHAIN_SERVICE" -w >\/dev\/null 2>\/dev\/null/.test(runnerText)) fail('KEYCHAIN_INITIAL_CREATE_CONTRACT_MISSING');
if (!/printf '%s\\n%s\\n' "\$value" "\$value" \| \\\n\s+"\$SECURITY_BIN" add-generic-password -U -a "\$KEYCHAIN_ACCOUNT" -s "\$KEYCHAIN_SERVICE" -w >\/dev\/null 2>\/dev\/null/.test(runnerText)) fail('KEYCHAIN_EXPLICIT_UPDATE_CONTRACT_MISSING');
if (!runnerText.includes('keychain_store_credential "$CREDENTIAL_INPUT_VALUE" "$reset"')) fail('KEYCHAIN_UPDATE_MODE_NOT_BOUND_TO_RESET');
for (const required of ['FINGERPRINT_MISMATCH','MISSING_REQUIRED_GRANT','EXCESSIVE_GRANT','UNKNOWN','SECURITY_RELEVANT']) {
  if (!graph.blockingClassifications.includes(required)) fail(`BLOCKING_CLASSIFICATION_MISSING:${required}`);
}
const expectedPrices = { starter: 7480, standard: 16280, pro: 32780 };
for (const [code, amount] of Object.entries(expectedPrices)) {
  if (contract.plans[code]?.monthlyPrice !== amount) fail(`PLAN_PRICE_DRIFT:${code}`);
}
const addonPrices = { extra_staff: 1100, extra_store: 5500, extra_storage_10gb: 550 };
for (const [code, amount] of Object.entries(addonPrices)) {
  if (contract.addons[code]?.grossMonthlyPrice !== amount) fail(`ADDON_PRICE_DRIFT:${code}`);
}
const publicFiles = [
  'apps/garage-link/public/llms.txt',
  'apps/garage-link/src/components/public-site/GaragePublicPage.tsx',
  'apps/garage-link/src/components/public-site/GarageRouteBody.tsx',
  'apps/garage-link/src/app/settings/store/page.tsx',
  'apps/garage-link/src/app/settings/members/page.tsx',
].map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]);
const llmsText = publicFiles.find(([file]) => file.endsWith('public/llms.txt'))[1];
for (const value of ['7,480','16,280','32,780','1,100','5,500','550']) {
  if (!llmsText.includes(value)) fail(`LLMS_PRICE_MISSING:${value}`);
}
for (const component of publicFiles.filter(([file]) => file.includes('/components/public-site/'))) {
  for (const value of ['1,100','5,500','550']) {
    if (!component[1].includes(value)) fail(`PUBLIC_ADDON_PRICE_MISSING:${component[0]}:${value}`);
  }
}
const publicText = publicFiles.map(([, text]) => text).join('\n');
for (const forbidden of ['11,000円','¥6,800','¥14,800']) {
  if (publicText.includes(forbidden)) fail(`UNAPPROVED_OR_NET_PUBLIC_PRICE:${forbidden}`);
}
const storePage = publicFiles.find(([file]) => file.endsWith('settings/store/page.tsx'))[1];
const memberPage = publicFiles.find(([file]) => file.endsWith('settings/members/page.tsx'))[1];
if (!storePage.includes('GARAGE_PLANS.standard.extraStorePrice')) fail('STORE_ADDON_NOT_CANONICAL');
if (!memberPage.includes('GARAGE_PLANS.starter.extraStaffPrice')) fail('STAFF_ADDON_NOT_CANONICAL');
if (/formatGarageYen\((?:5000|1000)\)/.test(`${storePage}\n${memberPage}`)) fail('NET_ADDON_DISPLAY_PRESENT');
const executionFiles = [
  'operations/scripts/run-garage-link-commercial-gate.sh',
  'operations/scripts/verify-garage-link-commercial-local-gate.sh',
  'operations/scripts/build-garage-link-local-bundle.mjs',
  'operations/tests/verify-garage-link-commercial-contract.mjs',
];
for (const file of executionFiles) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const incomplete = new RegExp(`\\b(?:${['TO'+'DO','NOT_'+'IMPLEMENTED','PLACE'+'HOLDER'].join('|')})\\b`, 'i');
  if (incomplete.test(text)) fail(`INCOMPLETE_MARKER:${file}`);
}
const rejects = (classification) => graph.blockingClassifications.includes(classification);
for (const classification of ['UNKNOWN','SECURITY_RELEVANT','MISSING_REQUIRED_GRANT','EXCESSIVE_GRANT','FINGERPRINT_MISMATCH']) {
  if (!rejects(classification)) fail(`NEGATIVE_GATE_ACCEPTED:${classification}`);
}
if (classificationPath) {
  const rows = JSON.parse(fs.readFileSync(path.resolve(classificationPath), 'utf8'));
  if (!Array.isArray(rows)) fail('PROVIDER_CLASSIFICATION_INVALID_ROOT');
  for (const row of rows) {
    if (!row || typeof row.classification !== 'string') fail('PROVIDER_CLASSIFICATION_INVALID');
    if (rejects(row.classification)) fail(`PROVIDER_CLASSIFICATION_BLOCKED:${row.classification}`);
  }
}
for (const [provider, identity] of Object.entries(graph.providerIdentities)) {
  if (!identity.image || !/^sha256:[0-9a-f]{64}$/.test(identity.digest)) fail(`PROVIDER_IDENTITY_INVALID:${provider}`);
}
process.stdout.write(`${JSON.stringify({status:'PASS',checkpoints:graph.checkpoints.length,incompleteMarkers:0,pricing:'PASS',negativeGates:'PASS',observedClassifications:classificationPath?'PASS':'NOT_SUPPLIED'})}\n`);
