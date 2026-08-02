import { createAdminClient } from '@/lib/supabase/admin';

export async function recordStripeCheckoutCompletion(input: {
  companyId: string;
  requestedBy: string;
  planCode: string;
  stripeSessionId: string;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error('admin_client_unavailable');
  }

  const { data: companyStore, error: storeError } = await admin
    .rpc('service_resolve_garage_store_scope', { p_store_id: input.companyId })
    .single();
  if (storeError || !companyStore) throw new Error('checkout_store_lookup_failed');

  const { error: insertError } = await admin.from('plan_change_requests').upsert({
    company_id: input.companyId,
    tenant_id: (companyStore as { tenant_id: string | null } | null)?.tenant_id ?? null,
    requested_by: input.requestedBy,
    request_type: 'plan_change',
    current_plan: null,
    requested_plan: input.planCode,
    message: `Stripe Checkout 完了 (${input.stripeSessionId})`,
    stripe_session_id: input.stripeSessionId,
    status: 'completed',
    completed_at: new Date().toISOString(),
  }, { onConflict: 'stripe_session_id', ignoreDuplicates: true });
  if (insertError) throw new Error('checkout_completion_record_failed');
}
