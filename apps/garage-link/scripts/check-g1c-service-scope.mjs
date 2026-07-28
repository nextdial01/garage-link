import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const failures = [];
const references = [];

function visit(directory) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) visit(relative);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const source = readFileSync(resolve(root, relative), 'utf8');
      const tree = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true,
        entry.name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      let found = false;
      function inspect(node) {
        if ((ts.isStringLiteralLike(node) && node.text === 'SUPABASE_SERVICE_ROLE_KEY')
          || (ts.isIdentifier(node) && (node.text === 'createAdminClient' || node.text === 'SUPABASE_SERVICE_ROLE_KEY'))) found = true;
        ts.forEachChild(node, inspect);
      }
      inspect(tree);
      if (found) references.push(relative);
    }
  }
}
visit('src');

const inventoryPath = resolve(root, 'supabase/tests/g1c_service_role_inventory.csv');
if (!existsSync(inventoryPath)) failures.push('service-role inventory is missing');
const inventory = readFileSync(inventoryPath, 'utf8').trim().split('\n').slice(1).map((line) => line.split(',')[0]).sort();
references.sort();
if (JSON.stringify(inventory) !== JSON.stringify(references)) {
  const missing = references.filter((path) => !inventory.includes(path));
  const stale = inventory.filter((path) => !references.includes(path));
  failures.push(`service-role inventory does not match AST extraction missing=${missing.join('|')} stale=${stale.join('|')}`);
}

const scopedHighPaths = [
  'src/app/api/cron/purge-expired-store-data/route.ts',
  'src/app/api/jobs/inspection-reminders/route.ts',
  'src/app/api/line/settings/migrate-secrets/route.ts',
  'src/app/api/line/settings/route.ts',
  'src/app/api/s2s/line-link/delivery-candidates/ack/route.ts',
  'src/app/api/s2s/line-link/delivery-candidates/route.ts',
  'src/app/api/s2s/line-link/inquiries/route.ts',
  'src/app/api/vehicles/google-feed/route.ts',
  'src/lib/billing/lLinkContract.ts',
  'src/lib/line-link/s2sAuth.ts',
  'src/lib/storage/auth.ts',
];
for (const path of scopedHighPaths) {
  const source = readFileSync(resolve(root, path), 'utf8');
  if (!/GarageTenantContext|tenantContext|auth\.context|line_link_connections/.test(source)) failures.push(`${path}: TenantContext missing`);
  if (/\.from\(['"]store_members['"]\)/.test(source)) failures.push(`${path}: legacy authorization fallback`);
}

const sourceText = references.map((path) => readFileSync(resolve(root, path), 'utf8')).join('\n');
if (/unstable_cache|\bcache\(/.test(sourceText)) failures.push('service-role path uses an unscoped server cache');

if (failures.length) {
  console.error('[check-g1c-service-scope] FAIL');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log(`[check-g1c-service-scope] OK references=${references.length} scoped_high=${scopedHighPaths.length} server_cache=0`);
