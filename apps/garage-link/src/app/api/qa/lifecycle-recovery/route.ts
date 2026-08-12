import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const STAGING_REF = 'gaytoojzwqkpuvfofeql';
const STAGING_HOST = /^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RELEASE_STORE = /^\[RELEASE QA \d{8}\]/;

function stagingRuntime(request: Request) {
  const url = new URL(request.url);
  const targetEnvironment = process.env.VERCEL_TARGET_ENV?.toLowerCase();
  const environment = ['preview', 'staging'].includes(targetEnvironment ?? '')
    ? targetEnvironment
    : process.env.VERCEL_ENV?.toLowerCase();
  return process.env.VERCEL_PROJECT_ID === STAGING_PROJECT_ID
    && ['preview', 'staging'].includes(environment ?? '')
    && STAGING_HOST.test(url.hostname);
}

export async function POST(request: Request) {
  if (!stagingRuntime(request)) return new Response(null, { status: 404 });
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null) as { run_id?: unknown } | null;
  const runId = typeof body?.run_id === 'string' && RUN_ID.test(body.run_id) ? body.run_id.toLowerCase() : null;
  if (!runId) return new Response(null, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !anonKey || new URL(url).hostname !== `${STAGING_REF}.supabase.co`) return new Response(null, { status: 404 });
  const verifier = createSupabaseClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data.user || data.user.app_metadata?.release_qa_run_id !== runId) return new Response(null, { status: 403 });

  // This route is not an application authorization shortcut. It is a
  // Staging-only, run-bound recovery read for lifecycle adoption after a
  // pre-request OTP rejection made the normal user-JWT Data API lookup
  // unavailable. The same synthetic subject is still verified by Auth, and
  // no mutation occurs here.
  const admin = createAdminClient();
  if (!admin) return new Response(null, { status: 404 });
  const { data: memberships, error: membershipError } = await admin
    .from('memberships')
    .select('id,tenant_id,store_id,user_id,role,status,disabled_at,deleted_at')
    .eq('user_id', data.user.id)
    .eq('status', 'active')
    .is('disabled_at', null)
    .is('deleted_at', null);
  if (membershipError) return new Response(null, { status: 503 });
  if ((memberships?.length ?? 0) === 0) return Response.json({ state: 'AUTH_ONLY_ABSENT' }, { headers: { 'Cache-Control': 'no-store' } });
  if (memberships?.length !== 1) return new Response(null, { status: 409 });
  const membership = memberships[0];
  if (!membership.id || !membership.tenant_id || !membership.store_id || !['owner', 'admin', 'implementer'].includes(membership.role ?? '')) return new Response(null, { status: 409 });
  const { data: stores, error: storeError } = await admin
    .from('stores')
    .select('id,tenant_id,name,onboarding_completed_at')
    .eq('id', membership.store_id)
    .eq('tenant_id', membership.tenant_id);
  if (storeError) return new Response(null, { status: 503 });
  if (stores?.length !== 1 || !RELEASE_STORE.test(stores[0].name ?? '')) return new Response(null, { status: 409 });
  const { data: subscriptions, error: subscriptionError } = await admin
    .from('company_subscriptions')
    .select('tenant_id')
    .eq('tenant_id', membership.tenant_id);
  if (subscriptionError || (subscriptions?.length ?? 0) < 1) return new Response(null, { status: 409 });

  return Response.json({
    state: 'RUN_BOUND_FIXTURE',
    membership_id: membership.id,
    tenant_id: membership.tenant_id,
    store_id: membership.store_id,
    tenant_name: stores[0].name,
    account_state: {
      garage_ui_context: stores[0].onboarding_completed_at ? 'active' : 'selection_required',
      active_store: 'YES',
      onboarding_completed: stores[0].onboarding_completed_at ? 'YES' : 'NO',
      membership_role: membership.role,
      membership_status: 'active',
      contract_access_state: 'recovery_bound',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
