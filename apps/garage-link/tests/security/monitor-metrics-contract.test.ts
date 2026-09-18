import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { hasValidMonitorBearer } from '@/lib/monitor/garageMetrics';

test.describe('internal monitor metrics contract', () => {
  test('requires a dedicated server-only bearer and forbids cache', async () => {
    const route = await readFile('src/app/internal/monitor/metrics/route.ts', 'utf8');
    const metrics = await readFile('src/lib/monitor/garageMetrics.ts', 'utf8');

    expect(route).toContain("hasValidMonitorBearer(request, 'GARAGE_LINK_MONITOR_TOKEN')");
    expect(route).toContain("'Cache-Control': 'no-store, max-age=0'");
    expect(metrics).toContain('timingSafeEqual');
    expect(metrics).toContain('GARAGE_LINK_MONITOR_EXCLUDED_TENANT_IDS');
  });

  test('accepts standard HTTP Bearer syntax and rejects malformed credentials at runtime', () => {
    const token = 'a'.repeat(64);
    const request = (authorization?: string) => new Request('https://example.test/internal/monitor/metrics', {
      headers: authorization ? { Authorization: authorization } : undefined,
    });

    const previous = process.env.GARAGE_LINK_MONITOR_TOKEN;
    process.env.GARAGE_LINK_MONITOR_TOKEN = token;
    try {
      expect(hasValidMonitorBearer(request(`Bearer ${token}`), 'GARAGE_LINK_MONITOR_TOKEN')).toBe(true);
      expect(hasValidMonitorBearer(request(), 'GARAGE_LINK_MONITOR_TOKEN')).toBe(false);
      expect(hasValidMonitorBearer(request(`Bearer ${'b'.repeat(64)}`), 'GARAGE_LINK_MONITOR_TOKEN')).toBe(false);
      expect(hasValidMonitorBearer(request('Bearer '), 'GARAGE_LINK_MONITOR_TOKEN')).toBe(false);
      expect(hasValidMonitorBearer(request('Bearer short'), 'GARAGE_LINK_MONITOR_TOKEN')).toBe(false);
      expect(hasValidMonitorBearer(request(`Bearer\\s${token}`), 'GARAGE_LINK_MONITOR_TOKEN')).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.GARAGE_LINK_MONITOR_TOKEN;
      else process.env.GARAGE_LINK_MONITOR_TOKEN = previous;
    }
  });

  test('returns aggregates only and fails closed for incomplete source attribution', async () => {
    const metrics = await readFile('src/lib/monitor/garageMetrics.ts', 'utf8');

    for (const forbiddenField of ['email', 'customer_id', 'stripe_customer_id', 'stripe_subscription_id', 'user_id']) {
      expect(metrics).not.toContain(`export type MonitorMetrics = {\n  ${forbiddenField}`);
    }
    expect(metrics).toContain("sourceStatus: 'partial'");
    expect(metrics).toContain('fullyAttributableInvoices');
    expect(metrics).toContain('refundsByInvoice');
    expect(metrics).toContain("admin.rpc('garage_monitor_active_tenant_ids')");
    expect(metrics).not.toContain("admin.from('tenants')");
  });

  test('tenant monitor bridge is execute-only and keeps direct tenant reads closed', async () => {
    const migration = await readFile('supabase/migrations/20260918000100_monitor_metrics_read_bridge.sql', 'utf8');
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain('from public.tenants');
    expect(migration).toContain('revoke all on function public.garage_monitor_active_tenant_ids()');
    expect(migration).toContain('grant execute on function public.garage_monitor_active_tenant_ids()');
    expect(migration).not.toMatch(/grant\s+select\s+on\s+(?:table\s+)?public\.tenants\s+to\s+service_role/i);
  });
});
