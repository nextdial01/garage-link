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
  });
});
