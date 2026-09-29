import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function harness(options: {
  signedIn?: boolean; role?: string; memberError?: boolean; lockError?: boolean;
  lockedUntil?: unknown; service?: boolean; enabled?: string; siteKey?: string; omitSiteKey?: boolean;
} = {}) {
  const reads: unknown[] = [];
  const privileged: unknown[] = [];
  const hashes: unknown[] = [];
  const chain = {
    select: () => chain,
    eq: (key: string, value: string) => { reads.push([key, value]); return chain; },
    maybeSingle: async () => ({ data: { role: options.role ?? 'owner', store_id: 'current-store' }, error: options.memberError ? { message: 'private database failure' } : null }),
  };
  const env = {
    NEXT_PUBLIC_ENABLE_BOT_PROTECTION: options.enabled ?? 'false',
    NEXT_PUBLIC_BOT_PROTECTION_SITE_KEY: options.omitSiteKey ? undefined : options.siteKey ?? 'synthetic-site-key',
    GARAGE_LOGIN_SECURITY_SECRET: 'synthetic-private-secret',
  };
  const exports: { getAccountSecurityOverview?: () => Promise<Record<string, unknown>> } = {};
  const code = ts.transpileModule(readFileSync(resolve('src/lib/security/accountSecurityOverview.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, process: { env }, Date,
    require: (id: string) => {
      if (id === 'server-only') return {};
      if (id.endsWith('/supabase/server')) return { createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: options.signedIn === false ? null : { id: 'current-user', email: '  Owner@Example.Invalid ' } }, error: null }) },
        from: (table: string) => { reads.push(table); return chain; },
      }) };
      if (id.endsWith('/supabase/admin')) return { createAdminClient: () => {
        privileged.push('create');
        return options.service === false ? null : { rpc: async (name: string, args: unknown) => {
          privileged.push({ name, args });
          return { data: options.lockedUntil ?? null, error: options.lockError ? { message: 'private RPC failure' } : null };
        } };
      } };
      if (id.endsWith('/authSecurity')) return { loginIdentityHash: async (secret: string, email: string) => { hashes.push([secret, email]); return 'synthetic-private-hash'; } };
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  return { load: () => exports.getAccountSecurityOverview!(), reads, privileged, hashes };
}

test('current authenticated owner gets only safe runtime states and own lock read', async () => {
  const h = harness({ enabled: 'true' });
  const result = await h.load();
  expect(result).toMatchObject({ kind: 'ready', role: 'owner', botProtection: 'enabled', loginRestriction: 'available' });
  expect(h.reads).toEqual(['current_user_active_store_membership', ['user_id', 'current-user'], ['status', 'active']]);
  expect(h.hashes).toEqual([['synthetic-private-secret', 'owner@example.invalid']]);
  expect(h.privileged).toEqual(['create', { name: 'get_login_lock', args: { p_identity_hash: 'synthetic-private-hash' } }]);
  expect(JSON.stringify(result)).not.toMatch(/synthetic-private|synthetic-site-key|SUPABASE|SECRET/);
});

for (const role of ['staff', 'viewer', 'implementer', 'unrecognised']) {
  test(`current-store ${role} cannot trigger a privileged read`, async () => {
    const h = harness({ role });
    expect(await h.load()).toEqual({ kind: 'forbidden' });
    expect(h.privileged).toEqual([]);
  });
}

test('unauthenticated request never reads membership or privileged status', async () => {
  const h = harness({ signedIn: false });
  expect(await h.load()).toEqual({ kind: 'unauthenticated' });
  expect(h.reads).toEqual([]);
  expect(h.privileged).toEqual([]);
});

test('membership failure is unknown, without raw error or privileged read', async () => {
  const h = harness({ memberError: true });
  expect(await h.load()).toEqual({ kind: 'unavailable' });
  expect(h.privileged).toEqual([]);
});

test('admin sees current lock and the actual disabled app captcha flag', async () => {
  const h = harness({ role: 'admin', lockedUntil: new Date(Date.now() + 60_000).toISOString() });
  expect(await h.load()).toMatchObject({ kind: 'ready', botProtection: 'disabled', loginRestriction: 'locked' });
});

test('RPC failure, missing service, and malformed lock never claim verified protection', async () => {
  for (const options of [{ lockError: true }, { service: false }, { lockedUntil: 'not-a-date' }]) {
    expect(await harness(options).load()).toMatchObject({ kind: 'ready', loginRestriction: 'unavailable' });
  }
});

test('enabled captcha with invalid site key is explicitly unavailable', async () => {
  expect(await harness({ enabled: 'true', siteKey: '' }).load()).toMatchObject({ kind: 'ready', botProtection: 'unavailable' });
});

test('missing Web site key reports its actual test fallback, without exposing its value', async () => {
  const result = await harness({ enabled: 'true', omitSiteKey: true }).load();
  expect(result).toMatchObject({ kind: 'ready', botProtection: 'test' });
  expect(JSON.stringify(result)).not.toContain('1x00000000000000000000AA');
});
