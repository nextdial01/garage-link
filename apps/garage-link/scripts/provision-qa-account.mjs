import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

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

function required(values, key) {
  const value = values[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

const appEnvPath = process.argv[2];
const outputPath = process.argv[3];
if (!appEnvPath || !outputPath) {
  throw new Error('Usage: node scripts/provision-qa-account.mjs <app-env-file> <qa-env-output>');
}

const env = parseEnvFile(await readFile(appEnvPath, 'utf8'));
const supabaseUrl = required(env, 'NEXT_PUBLIC_SUPABASE_URL');
const anonKey = required(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
const serviceRoleKey = required(env, 'SUPABASE_SERVICE_ROLE_KEY');
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let existingQa = null;
try {
  existingQa = parseEnvFile(await readFile(outputPath, 'utf8'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

if (existingQa) {
  const existingUserId = required(existingQa, 'GARAGE_QA_USER_ID');
  const existingStoreId = required(existingQa, 'GARAGE_QA_STORE_ID');
  const updates = await Promise.all([
    admin.from('stores').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', existingStoreId),
    admin.from('store_members').update({ role: 'staff', status: 'active' }).eq('store_id', existingStoreId).eq('user_id', existingUserId),
  ]);
  const failed = updates.find((update) => update.error);
  if (failed?.error) throw failed.error;
  console.log(JSON.stringify({ ok: true, reused: true, userId: existingUserId, storeId: existingStoreId, role: 'staff' }));
  process.exit(0);
}

const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `garage-link-qa-${runId}@example.com`;
const password = randomBytes(30).toString('base64url');

const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { purpose: 'garage-link-qa', run_id: runId },
});
if (createUserError || !createdUser.user) throw createUserError ?? new Error('QA user creation failed');
const userId = createdUser.user.id;

const qaClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error: signInError } = await qaClient.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;

const { data: storeId, error: storeError } = await qaClient.rpc('create_store_for_current_user', {
  store_name: '[QA] GARAGE LINK Automated Tests',
  owner_display_name: 'QA Automation',
});
if (storeError || !storeId) throw storeError ?? new Error('QA store creation failed');

const { error: storeUpdateError } = await admin
  .from('stores')
  .update({ onboarding_completed_at: new Date().toISOString() })
  .eq('id', storeId);
if (storeUpdateError) throw storeUpdateError;

const { error: memberUpdateError } = await admin
  .from('store_members')
  .update({ role: 'staff', status: 'active', memo: 'Dedicated automated QA account' })
  .eq('store_id', storeId)
  .eq('user_id', userId);
if (memberUpdateError) throw memberUpdateError;

const credentialFile = [
  '# GARAGE LINK automated QA account. Never commit this file.',
  `GARAGE_QA_EMAIL=${JSON.stringify(email)}`,
  `GARAGE_QA_PASSWORD=${JSON.stringify(password)}`,
  `GARAGE_QA_USER_ID=${JSON.stringify(userId)}`,
  `GARAGE_QA_STORE_ID=${JSON.stringify(storeId)}`,
  '',
].join('\n');
await writeFile(outputPath, credentialFile, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
await chmod(outputPath, 0o600);

console.log(JSON.stringify({ ok: true, email, userId, storeId, role: 'staff' }));
