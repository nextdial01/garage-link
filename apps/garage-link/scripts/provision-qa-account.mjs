import { readFile } from 'node:fs/promises';

function parseEnvFile(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      try {
        values[key] = JSON.parse(rawValue);
        continue;
      } catch {
        // JSON形式でなければ外側の引用符だけ外す。
      }
    }
    values[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
  return values;
}

const appEnvPath = process.argv[2];
const outputPath = process.argv[3];
if (!appEnvPath || !outputPath) {
  throw new Error('Usage: node scripts/provision-qa-account.mjs <app-env-file> <qa-env-output>');
}

const env = parseEnvFile(await readFile(appEnvPath, 'utf8'));
void env;
void outputPath;

// Legacy provisioning mutated store_members and role state with a service key.
// It is permanently disabled. Release fixtures must be created through the
// canonical memberships admission UI/RPC and membership_store_assignments.
throw new Error(
  'LEGACY_QA_PROVISIONER_DISABLED: use canonical memberships and membership_store_assignments release fixture workflow',
);
