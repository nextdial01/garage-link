import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import {
  isBillingRecoveryAllowedPath,
  parseContractAccess,
  resolveEffectiveContractAccess,
} from '@/lib/billing/contractAccess';
import { resolvePostAuthPath } from '@/lib/auth/post-auth-redirect';
import { ADMIN_EMAIL_OTP_COOKIE, deviceTokenHash, getAdminEmailOtpSecret, hasEffectiveAdminRole, readTrustedDeviceCookieValue } from '@/lib/security/adminEmailOtp';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/staging-preview',
  '/signup',
  '/forgot-password',
  '/auth/confirm',
  '/auth/callback',
  '/auth/reset-password',
  '/membership/accept',
  '/api/auth/password-login',
  '/api/auth/confirm',
  '/api/health',
  '/help',
  '/logout',
  '/legal/terms',
  '/legal/privacy',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/features',
  '/pricing',
  '/faq',
];

const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';

const CANCELLED_RETENTION_ALLOWED = [
  '/settings/billing',
  '/onboarding',
  '/logout',
];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Vercel Preview Toolbar injects this revisioned asset into preview pages.
  // Keep the bypass preview-only and exact so arbitrary application routes
  // never inherit public access.
  if (process.env.VERCEL_ENV === 'preview' && /^\/[a-f0-9]{16}\/script\.js$/.test(pathname)) return true;
  if (pathname.startsWith('/legal/')) return true;
  if (pathname.startsWith('/industries/')) return true;
  // L-LINK からのサーバー間通信は各ルートで HMAC 署名・timestamp・nonce を検証する。
  // Supabase セッションを持たないため、ログイン画面へ転送せずルート自身の認証へ渡す。
  if (pathname.startsWith('/api/s2s/line-link/')) return true;
  // Stripe webhookはSupabaseセッションを持たないため、ルート内の署名検証へ直接渡す。
  if (pathname === '/api/billing/webhook') return true;
  // Google向け在庫フィードはBearerトークン/クエリトークンで自前認証するため、
  // セッションCookieを持たないクローラーからのアクセスをここで弾かない。
  if (pathname === '/api/vehicles/google-feed') return true;
  // Vercel Cronジョブ（/api/jobs/*, /api/cron/*）はSupabaseセッションを持たず
  // CRON_SECRETのBearer認証を各ルート自身で行うため、ここで先に401にしない。
  if (pathname.startsWith('/api/jobs/')) return true;
  if (pathname.startsWith('/api/cron/')) return true;
  // 非本番環境の provenance 確認用。CRON_SECRET のBearer認証をルート自身で行い、
  // 本番判定時は404を返すため、ここでセッション必須にしない。
  if (pathname === '/api/commercial-staging-fingerprint') return true;
  // Staging runtime provenance is fail-closed in the route itself using the
  // Vercel project ID and Production host deny-list. The Release Critical
  // runner reaches it through Vercel Automation Bypass, not a user session.
  if (pathname === '/api/qa/provenance') return true;
  // These two QA routes enforce a Staging-preview runtime, an exact synthetic
  // marker, and a bearer session in the route itself. They must reach that
  // route-level contract rather than being rejected by middleware before the
  // synthetic owner's token can be verified. Production still returns 404.
  if (pathname === '/api/qa/callback-evidence' || pathname === '/api/qa/fixture-discovery') return true;
  // These routes authenticate again inside the handler. Keeping the exact
  // endpoints reachable lets a Staging-only synthetic Bearer session satisfy
  // the same administrator OTP pre-request gate; Production Bearer access is
  // still rejected by the route's staging runtime contract.
  if (pathname === '/api/auth/admin-email-otp/request' || pathname === '/api/auth/admin-email-otp/verify') return true;
  return false;
}

function isCancelledRetentionAllowedPath(pathname: string) {
  if (CANCELLED_RETENTION_ALLOWED.includes(pathname)) return true;
  if (pathname.startsWith('/legal/')) return true;
  return false;
}

function isSecurityGate(pathname: string) {
  return pathname === '/security/mfa'
    || pathname === '/security/email-otp'
    || pathname.startsWith('/api/auth/admin-email-otp/')
    || pathname === '/api/auth/logout';
}

function redirectWithSessionCookies(url: URL, source: NextResponse) {
  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

function attachReleaseQaAuthBoundary(
  request: NextRequest,
  response: NextResponse,
  authCookiePresent: boolean,
  authErrorCode: string | undefined,
) {
  // This is deliberately a Staging-preview-only, opt-in QA diagnostic. It
  // carries no token, email, user ID, or error text; it only separates an
  // expired/invalid SSR session from a route-level redirect during the
  // Release Critical synthetic journey. Production never emits this header.
  if (
    request.headers.get('x-garage-release-qa') === '1'
    && process.env.VERCEL_ENV === 'preview'
    && process.env.VERCEL_PROJECT_ID === STAGING_PROJECT_ID
  ) {
    const code = (authErrorCode ?? 'NONE').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32) || 'NONE';
    response.headers.set(
      'x-garage-release-qa-auth-boundary',
      `USER_ABSENT:${authCookiePresent ? 'AUTH_COOKIE_PRESENT' : 'AUTH_COOKIE_ABSENT'}:${code}`,
    );
  }
  return response;
}

async function requiresAdminSecurity(
  userId: string,
  sessionId: string
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return true;
  const service = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await service.rpc('admin_email_otp_bootstrap_context', {
    p_user_id: userId,
    // The helper uses this argument as a non-null bootstrap contract. A real
    // administrator without a JWT session_id is still blocked below because
    // hasTrustedAdminDevice is never called with this sentinel.
    p_session_id: sessionId || '00000000-0000-0000-0000-000000000000',
  });
  if (error) return true;
  const context = data && typeof data === 'object' && !Array.isArray(data)
    ? data as { role?: string }
    : null;
  if (!context) return false;
  return hasEffectiveAdminRole([{ role: context.role ?? '' }], []);
}

async function hasTrustedAdminDevice(request: NextRequest, userId: string, sessionId: string) {
  const secret = getAdminEmailOtpSecret();
  const cookie = await readTrustedDeviceCookieValue(secret, request.cookies.get(ADMIN_EMAIL_OTP_COOKIE)?.value, userId, sessionId);
  if (!cookie) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return false;
  const service = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const hash = await deviceTokenHash(secret, cookie.token);
  const { data, error } = await service
    .from('admin_trusted_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .eq('device_token_hash', hash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  return !error && Boolean(data);
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const { data: claimData } = user ? await supabase.auth.getClaims() : { data: null };

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith('/api/')) {
      return attachReleaseQaAuthBoundary(
        request,
        NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
        request.cookies.getAll().some((cookie) => /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(cookie.name)),
        authError?.code,
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return attachReleaseQaAuthBoundary(
      request,
      NextResponse.redirect(loginUrl),
      request.cookies.getAll().some((cookie) => /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(cookie.name)),
      authError?.code,
    );
  }

  if (user) {
    const isAuthEntry = pathname === '/login' || pathname === '/signup';
    const shouldCheckAdminSecurity = isAuthEntry || (!isPublicPath(pathname) && !isSecurityGate(pathname));

    if (shouldCheckAdminSecurity) {
      const sessionId = typeof claimData?.claims?.session_id === 'string' ? claimData.claims.session_id : '';
      const adminSecurityRequired = await requiresAdminSecurity(user.id, sessionId);
      if (adminSecurityRequired) {
        const returnPath = isAuthEntry ? '/dashboard' : `${pathname}${request.nextUrl.search}`;
        if (!sessionId || !await hasTrustedAdminDevice(request, user.id, sessionId)) {
          const verificationUrl = new URL('/security/email-otp', request.url);
          verificationUrl.searchParams.set('from', returnPath);
          return redirectWithSessionCookies(verificationUrl, response);
        }
      }
    }

    const postAuthPath = isSecurityGate(pathname)
      ? '/dashboard'
      : await resolvePostAuthPath(supabase, user.id, {
          nextPath: request.nextUrl.searchParams.get('next'),
        });

    if (pathname === '/login' || pathname === '/signup') {
      if (postAuthPath.split('?')[0] === pathname) {
        return response;
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = postAuthPath.split('?')[0] ?? postAuthPath;
      redirectUrl.search = postAuthPath.includes('?')
        ? postAuthPath.slice(postAuthPath.indexOf('?'))
        : '';
      return NextResponse.redirect(redirectUrl);
    }

    if (pathname === '/onboarding' && postAuthPath.startsWith('/dashboard')) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/dashboard';
      dashboardUrl.search = '';
      return NextResponse.redirect(dashboardUrl);
    }

    if (
      !isPublicPath(pathname) &&
      pathname !== '/onboarding' &&
      (postAuthPath.startsWith('/onboarding') || postAuthPath.startsWith('/signup'))
    ) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = postAuthPath.split('?')[0] ?? postAuthPath;
      redirectUrl.search = postAuthPath.includes('?')
        ? postAuthPath.slice(postAuthPath.indexOf('?'))
        : '';
      return NextResponse.redirect(redirectUrl);
    }

    if (!isPublicPath(pathname) && !isSecurityGate(pathname)) {
      // security gate は常に billing 制限より優先する。ここを除外しないと、
      // admin security 必須 かつ billing 制限中のアカウントが
      // /security/email-otp <-> /settings/billing を無限に往復し、
      // clone() が前段の from を引き継ぐたびに from が二重エンコードされ続けて
      // 指数的に肥大化するリダイレクトループになる。
      const { data: contractAccess } = await supabase.rpc('get_member_contract_access', {});
      const accessState = resolveEffectiveContractAccess(
        parseContractAccess(contractAccess),
      ).state;

      if (accessState === 'cancelled_retention' && !isCancelledRetentionAllowedPath(pathname)) {
        const billingUrl = new URL('/settings/billing', request.url);
        billingUrl.searchParams.set('contract', 'cancelled');
        return NextResponse.redirect(billingUrl);
      }

      if (
        ['checkout_pending', 'initial_payment_pending', 'restricted', 'unpaid', 'canceled', 'reconciliation_required'].includes(accessState)
        && !isBillingRecoveryAllowedPath(pathname)
      ) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'billing_access_restricted' }, { status: 402 });
        }
        const billingUrl = new URL('/settings/billing', request.url);
        billingUrl.searchParams.set('contract', accessState);
        return NextResponse.redirect(billingUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_vercel|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
