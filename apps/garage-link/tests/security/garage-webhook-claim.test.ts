import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';

type Row = { status: string; lease_expires_at: string | null; lease_owner?: string };
function harness(initial: Row, completedDuringRead = false) {
  const row = { ...initial };
  let updates = 0;
  const admin = { from: () => {
    let patch: Partial<Row> | null = null;
    const equals: Record<string, unknown> = {};
    let leaseCondition = '';
    let lteOnly: string | null = null;
    const chain = {
      insert: async () => ({ error: { code: '23505' } }),
      select: () => chain,
      eq: (key: string, value: unknown) => { equals[key] = value; return chain; },
      update: (value: Partial<Row>) => { patch = value; return chain; },
      or: (value: string) => { leaseCondition = value; return chain; },
      lte: (_key: string, value: string) => { lteOnly = value; return chain; },
      single: async () => {
        const observed = { ...row };
        if (completedDuringRead) { row.status = 'completed'; row.lease_expires_at = null; }
        return { data: observed, error: null };
      },
      maybeSingle: async () => {
        const expectedStateMatches = !equals.status || equals.status === row.status;
        const expiryMatches = leaseCondition.startsWith('lease_expires_at.is.null,lease_expires_at.lte.')
          ? row.lease_expires_at === null || Date.parse(row.lease_expires_at) <= Date.now()
          : lteOnly !== null && row.lease_expires_at !== null && Date.parse(row.lease_expires_at) <= Date.parse(lteOnly);
        if (!patch || !expectedStateMatches || !expiryMatches) return { data: null, error: null };
        Object.assign(row, patch); updates += 1;
        return { data: { id: 'synthetic-event' }, error: null };
      },
    };
    return chain;
  } };
  const exported = {} as { claimStripeEvent: (event: unknown) => Promise<{ state: string }> };
  const source = fs.readFileSync('src/app/api/billing/webhook/route.ts', 'utf8') + '\nexport { claimStripeEvent };';
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: exported, crypto: { randomUUID }, Date,
    require: (name: string) => {
      if (name === '@/lib/supabase/admin') return { createAdminClient: () => admin };
      if (['next/server', 'stripe', '@/lib/stripe/garageWebhookProcessor', '@/lib/stripe/garageWebhookOwnership', '@/lib/stripe/client'].includes(name)) return {};
      throw new Error('Unexpected dependency ' + name);
    },
  });
  return { claim: () => exported.claimStripeEvent({ id: 'evt_synthetic', type: 'invoice.paid', created: 1, data: { object: { id: 'in_synthetic' } } }), row, updates: () => updates };
}
for (const status of ['failed', 'retry_scheduled']) {
  test(`${status} with released NULL lease is reclaimed`, async () => {
    const h = harness({ status, lease_expires_at: null });
    expect((await h.claim()).state).toBe('claimed');
    expect(h.row.status).toBe('processing');
    expect(h.updates()).toBe(1);
  });
}
test('concurrent retries grant exactly one lease', async () => {
  const h = harness({ status: 'retry_scheduled', lease_expires_at: null });
  const results = await Promise.all([h.claim(), h.claim()]);
  expect(results.map(r => r.state).sort()).toEqual(['claimed', 'in_progress']);
  expect(h.updates()).toBe(1);
});
for (const status of ['completed', 'dead_letter']) {
  test(`${status} remains terminal`, async () => {
    const h = harness({ status, lease_expires_at: null });
    expect((await h.claim()).state).toBe(status === 'completed' ? 'completed' : 'in_progress');
    expect(h.updates()).toBe(0);
  });
}
test('completion between read and CAS cannot be reclaimed', async () => {
  const h = harness({ status: 'retry_scheduled', lease_expires_at: null }, true);
  expect((await h.claim()).state).toBe('in_progress');
  expect(h.row.status).toBe('completed');
  expect(h.updates()).toBe(0);
});
test('unexpired processing lease remains protected', async () => {
  const h = harness({ status: 'processing', lease_expires_at: new Date(Date.now() + 60_000).toISOString() });
  expect((await h.claim()).state).toBe('in_progress');
  expect(h.updates()).toBe(0);
});
test('expired processing lease can be reclaimed', async () => {
  const h = harness({ status: 'processing', lease_expires_at: new Date(Date.now() - 60_000).toISOString() });
  expect((await h.claim()).state).toBe('claimed');
});
