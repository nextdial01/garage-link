import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_EMAIL_OTP_COOKIE, createTrustedDeviceCookieValue, deviceTokenHash, getAdminEmailOtpSecret, randomDeviceToken, trustedDeviceCookieOptions } from '@/lib/security/adminEmailOtp';

const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const STAGING_REF = 'gaytoojzwqkpuvfofeql';
const PURPOSE = 'owner-preview';
const MARKER = '[OWNER PREVIEW QA 20260804]';
const SYNTHETIC_EMAIL = 'owner.preview.qa@gaytoojzwqkpuvfofeql.invalid';

function unavailable(code: string) {
  console.error(`[${code}]`);
  return NextResponse.json({ error: 'Preview session unavailable' }, { status: 503 });
}

function readSessionClaims(session: unknown) {
  const accessToken = session && typeof session === 'object' && 'access_token' in session && typeof session.access_token === 'string'
    ? session.access_token
    : '';
  const encoded = accessToken.split('.')[1];
  if (!encoded) return null;
  try {
    const payload = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as { sub?: unknown; session_id?: unknown };
    if (typeof payload.sub !== 'string' || typeof payload.session_id !== 'string') return null;
    return { userId: payload.sub, sessionId: payload.session_id };
  } catch {
    return null;
  }
}

function notFound() {
  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}

function isStagingRequest(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const projectId = process.env.VERCEL_PROJECT_ID ?? '';
  const vercelUrl = (process.env.VERCEL_URL ?? '').toLowerCase();
  const hostAllowed = host.endsWith('.vercel.app') && (host.startsWith('garage-link-staging-') || host === vercelUrl);
  return process.env.VERCEL_ENV === 'preview'
    && projectId === STAGING_PROJECT_ID
    && supabaseUrl.includes(`${STAGING_REF}.supabase.co`)
    && !supabaseUrl.includes('wmlpuzuskfiwdipluglz')
    && host !== 'garage-link.tech'
    && hostAllowed;
}

export async function GET(request: NextRequest) {
  if (!isStagingRequest(request)) return notFound();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const admin = createAdminClient();
  if (!url || !anonKey || !admin) return notFound();

  const { data: users, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return unavailable('OWNER_PREVIEW_LIST_USERS_FAILED');
  const matching = users.users.filter((user) => user.email?.toLowerCase() === SYNTHETIC_EMAIL && user.user_metadata?.purpose === PURPOSE);
  if (matching.length > 1) return notFound();
  let user = matching[0];
  if (!user) {
    const temporaryPassword = `${crypto.randomUUID()}Aa1!`;
    const created = await admin.auth.admin.createUser({
      email: SYNTHETIC_EMAIL,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { purpose: PURPOSE, marker: MARKER, synthetic: true },
    });
    if (created.error || !created.data.user) return unavailable('OWNER_PREVIEW_CREATE_USER_FAILED');
    user = created.data.user;
  }

  const fixture = await admin.rpc('qa_owner_preview_ensure_fixture', {
    p_environment: 'preview',
    p_project_ref: STAGING_REF,
    p_purpose: PURPOSE,
    p_marker: MARKER,
    p_user_id: user.id,
  });
  if (fixture.error || !fixture.data) return unavailable('OWNER_PREVIEW_FIXTURE_FAILED');

  const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email: SYNTHETIC_EMAIL, options: { redirectTo: `${request.nextUrl.origin}/staging-preview` } });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || typeof tokenHash !== 'string' || !tokenHash) return unavailable('OWNER_PREVIEW_GENERATE_LINK_FAILED');

  const authCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        authCookies.splice(0, authCookies.length, ...cookiesToSet);
      },
    },
  });
  const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (verified.error || !verified.data.session || verified.data.user?.id !== user.id) return unavailable('OWNER_PREVIEW_VERIFY_OTP_FAILED');
  const claims = readSessionClaims(verified.data.session);
  const secret = getAdminEmailOtpSecret();
  if (!claims || claims.userId !== user.id || !secret) return unavailable('OWNER_PREVIEW_TRUSTED_SESSION_FAILED');
  const deviceToken = randomDeviceToken();
  const deviceTokenDigest = await deviceTokenHash(secret, deviceToken);
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const trusted = await admin.from('admin_trusted_sessions').upsert({
    user_id: claims.userId,
    session_id: claims.sessionId,
    device_token_hash: deviceTokenDigest,
    expires_at: new Date(expiresAt).toISOString(),
    revoked_at: null,
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'session_id' });
  if (trusted.error) return unavailable('OWNER_PREVIEW_TRUSTED_SESSION_FAILED');
  const trustedCookie = await createTrustedDeviceCookieValue(secret, {
    userId: claims.userId,
    sessionId: claims.sessionId,
    token: deviceToken,
    expiresAt,
  });

  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  authCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]));
  response.cookies.set(ADMIN_EMAIL_OTP_COOKIE, trustedCookie, trustedDeviceCookieOptions());
  response.cookies.set('garage_owner_preview', '1', { httpOnly: false, secure: true, sameSite: 'lax', path: '/', maxAge: 3600 });
  return response;
}
