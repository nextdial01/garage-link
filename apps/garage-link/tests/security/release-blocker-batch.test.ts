import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const MIGRATION = 'supabase/migrations/20260728000200_auth_billing_release_blocker_batch.sql';

test.describe('AUTH-004 / BILL-003 / CRON-001 release contracts', () => {
  test('OTP bootstrap is canonical, service-only, preview-only and revocable', async () => {
    const [sql, context, requestRoute, middleware] = await Promise.all([
      readFile(MIGRATION, 'utf8'),
      readFile('src/lib/security/adminEmailOtpServer.ts', 'utf8'),
      readFile('src/app/api/auth/admin-email-otp/request/route.ts', 'utf8'),
      readFile('src/middleware.ts', 'utf8'),
    ]);

    expect(sql).toContain('admin_email_otp_bootstrap_context');
    expect(sql).toContain('release_qa_admin_bootstrap_context');
    expect(sql).toContain('from public.memberships m');
    expect(sql).not.toContain('from public.store_members');
    expect(sql).toContain("p_environment <> 'preview'");
    expect(sql).toContain("raw_user_meta_data ->> 'purpose'");
    expect(sql).toContain('membership_store_assignments');
    expect(sql).toContain('revoke all on function public.release_qa_admin_bootstrap_context');
    expect(sql).toContain('grant execute on function public.release_qa_admin_bootstrap_context');
    expect(sql).toContain('revoke_admin_trusted_sessions_for_user');
    expect(sql).toContain('invalidate_admin_trusted_sessions_from_membership');
    expect(sql).toContain('invalidate_admin_trusted_sessions_from_assignment');
    expect(sql).toContain('invalidate_admin_trusted_sessions_from_store');

    expect(context).toContain("'admin_email_otp_bootstrap_context'");
    expect(context).toContain("'release_qa_admin_bootstrap_context'");
    expect(requestRoute).toContain('getPreviewAdminContext(request)');
    expect(requestRoute).toContain('requireReleaseQa: true');
    expect(requestRoute).toContain('getPreviewUxAcceptanceAdminContext');
    expect(context).not.toContain("supabase.rpc('current_user_tenant_ids'");
    expect(requestRoute).toContain('getPreviewOtpSinkContext');
    expect(requestRoute).toContain('previewOtp');
    expect(middleware).toContain("service.rpc('admin_email_otp_bootstrap_context'");
    expect(middleware).not.toContain(".from('memberships')");
    expect(middleware).not.toContain("supabase.rpc('current_user_tenant_ids'");
  });

  test('service store scope is RPC-only for billing and automation', async () => {
    const [sql, applyPlan, checkout, changePlan, changeOptions, invoiceDownload, webhook, cron] =
      await Promise.all([
        readFile(MIGRATION, 'utf8'),
        readFile('src/lib/stripe/applyPlan.ts', 'utf8'),
        readFile('src/app/api/billing/checkout/route.ts', 'utf8'),
        readFile('src/app/api/billing/change-plan/route.ts', 'utf8'),
        readFile('src/app/api/billing/change-options/route.ts', 'utf8'),
        readFile('src/app/api/billing/invoices/[invoiceId]/download/route.ts', 'utf8'),
        readFile('src/app/api/billing/webhook/route.ts', 'utf8'),
        readFile('src/app/api/jobs/inspection-reminders/route.ts', 'utf8'),
      ]);

    expect(sql).toContain('service_resolve_garage_store_scope');
    expect(sql).toContain('service_list_eligible_garage_stores');
    expect(sql).toContain('grant execute on function public.service_resolve_garage_store_scope');
    expect(sql).toContain('grant execute on function public.service_list_eligible_garage_stores');

    for (const source of [applyPlan, checkout, changePlan, changeOptions, invoiceDownload, webhook, cron]) {
      expect(source).not.toMatch(/admin\s*\.from\(['"]stores['"]\)/);
      expect(source).not.toMatch(/service\s*\.from\(['"]stores['"]\)/);
    }
    expect(applyPlan).toMatch(/admin\s*\.rpc\('service_resolve_garage_store_scope'/);
    expect(cron).toMatch(/service\s*\.rpc\('service_list_eligible_garage_stores'/);
  });

  test('legacy QA provisioner cannot restore store_members authorization', async () => {
    const provisioner = await readFile('scripts/provision-qa-account.mjs', 'utf8');
    expect(provisioner).not.toContain(".from('store_members')");
    expect(provisioner).toContain('LEGACY_QA_PROVISIONER_DISABLED');
    expect(provisioner).toContain('canonical memberships');
    expect(provisioner).toContain('membership_store_assignments');
  });

  test('Preview Stripe mock is external-send denied and unavailable in Production', async () => {
    const [client, safety] = await Promise.all([
      readFile('src/lib/stripe/client.ts', 'utf8'),
      readFile('src/lib/security/runtimeSafety.ts', 'utf8'),
    ]);
    expect(safety).toContain("process.env.VERCEL_ENV === 'preview'");
    expect(safety).toContain("process.env.NODE_ENV === 'production'");
    expect(safety).toContain('areExternalSendsDisabled()');
    expect(safety).toContain("enabled('GARAGE_STRIPE_MOCK_MODE')");
    expect(client).toContain('isPreviewStripeMockEnabled()');
    expect(client).toContain('https://example.invalid/garage-link/stripe-test/');
  });
});
