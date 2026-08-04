import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const STAGING_REF = 'gaytoojzwqkpuvfofeql';
const PURPOSE = 'owner-preview';
const MARKER = '[OWNER PREVIEW QA 20260804]';
const SYNTHETIC_EMAIL = 'owner.preview.qa@gaytoojzwqkpuvfofeql.invalid';

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
  if (listError) return NextResponse.json({ error: 'Preview session unavailable' }, { status: 503 });
  const matching = users.users.filter((user) => user.email?.toLowerCase() === SYNTHETIC_EMAIL && user.user_metadata?.purpose === PURPOSE);
  if (matching.length > 1) return notFound();
  let user = matching[0];
  if (!user) {
    const temporaryPassword = `${crypto.randomUUID()}-${crypto.randomUUID()}-Aa1!`;
    const created = await admin.auth.admin.createUser({
      email: SYNTHETIC_EMAIL,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { purpose: PURPOSE, marker: MARKER, synthetic: true },
    });
    if (created.error || !created.data.user) return NextResponse.json({ error: 'Preview session unavailable' }, { status: 503 });
    user = created.data.user;
  }

  const fixture = await admin.rpc('qa_owner_preview_ensure_fixture', {
    p_environment: 'preview',
    p_project_ref: STAGING_REF,
    p_purpose: PURPOSE,
    p_marker: MARKER,
    p_user_id: user.id,
  });
  if (fixture.error || !fixture.data) return NextResponse.json({ error: 'Preview fixture unavailable' }, { status: 503 });

  const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email: SYNTHETIC_EMAIL, options: { redirectTo: `${request.nextUrl.origin}/staging-preview` } });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || typeof tokenHash !== 'string' || !tokenHash) return NextResponse.json({ error: 'Preview session unavailable' }, { status: 503 });

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
  if (verified.error || !verified.data.session || verified.data.user?.id !== user.id) return NextResponse.json({ error: 'Preview session unavailable' }, { status: 503 });

  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  authCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]));
  response.cookies.set('garage_owner_preview', '1', { httpOnly: false, secure: true, sameSite: 'lax', path: '/', maxAge: 3600 });
  return response;
}
