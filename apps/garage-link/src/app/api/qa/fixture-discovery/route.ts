import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { readReleaseQaFixture } from '@/lib/auth/releaseQaFixture';

export const dynamic = 'force-dynamic';

const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const STAGING_HOST = /^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i;
const EMAIL_MARKER = /^garage-link-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

function stagingRuntime(request: Request) {
  const url = new URL(request.url);
  const targetEnvironment = process.env.VERCEL_TARGET_ENV?.toLowerCase();
  // Preview deployments can retain a project target of "production". The
  // runtime environment is authoritative unless the target is explicitly safe.
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
  let body: { email_marker?: unknown };
  try { body = await request.json(); } catch { return new Response(null, { status: 400 }); }
  const emailMarker = typeof body.email_marker === 'string' && EMAIL_MARKER.test(body.email_marker)
    ? body.email_marker.toLowerCase()
    : null;
  if (!emailMarker) return new Response(null, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !anonKey) return new Response(null, { status: 404 });
  const verifier = createSupabaseClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data.user || !data.user.email?.toLowerCase().includes(`+${emailMarker}@`)) return new Response(null, { status: 403 });

  const fixture = await readReleaseQaFixture({ url, anonKey, accessToken: token, userId: data.user.id });
  if (!fixture) return new Response(null, { status: 409 });
  return Response.json({
    membership_id: fixture.membershipId,
    tenant_id: fixture.tenantId,
    store_id: fixture.storeId,
    tenant_name: fixture.tenantName,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
