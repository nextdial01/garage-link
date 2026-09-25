import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  isBillingRecoveryAllowedPath,
  parseContractAccess,
  resolveEffectiveContractAccess,
} from '@/lib/billing/contractAccess';
import { resolvePostAuthPath } from '@/lib/auth/post-auth-redirect';
import { getSupabaseAuthCookieNames, isRecoverableStaleSessionError } from '@/lib/auth/stale-session-recovery';

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
  '/api/auth/mobile-captcha',
  '/api/auth/confirm',
  '/api/health',
  '/help',
  '/logout',
  '/legal/terms',
  '/legal/privacy',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/.well-known/kannagi-release.json',
  '/manifest.webmanifest',
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
  // Native mobile handlers validate the bearer and store/tenant scope themselves.
  if (pathname.startsWith('/api/mobile/')) return true;
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
  // Retired endpoints return a side-effect-free 410, including for stale clients.
  if (pathname === '/api/auth/admin-email-otp/request' || pathname === '/api/auth/admin-email-otp/verify') return true;
  return false;
}

// Let App Router produce its normal 404 for paths this application does not
// own. Middleware otherwise turns every typo into a successful /login page.
function isKnownApplicationPath(pathname: string) {
  if (isPublicPath(pathname) || pathname.startsWith('/api/')) return true;
  return [
    '/analytics', '/appointments', '/customers', '/dashboard', '/deals',
    '/inquiries', '/inventory-counts', '/invoices', '/line', '/line-package',
    '/maintenance', '/menu', '/onboarding', '/parts', '/quotes', '/settings',
    '/supabase-test', '/vehicle-management', '/vehicles', '/security',
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isProductionVercelRequest(request: NextRequest) {
  return process.env.VERCEL_ENV === 'production' && request.nextUrl.hostname.endsWith('.vercel.app');
}

function redirectToCanonicalDomain(request: NextRequest) {
  return NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, 'https://garage-link.tech'), 308);
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

function responseWithSessionCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

function clearStaleSupabaseAuthCookies(response: NextResponse, request: NextRequest) {
  getSupabaseAuthCookieNames(request.cookies.getAll()).forEach((name) => {
    response.cookies.set({
      name,
      value: '',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
  });
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Vercel production deployment hosts are aliases only. Preview remains
  // unaffected because it has VERCEL_ENV=preview.
  if (isProductionVercelRequest(request)) return redirectToCanonicalDomain(request);
  if (!isKnownApplicationPath(pathname)) return NextResponse.next({ request });

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
          const priorCookies = response.cookies.getAll();
          response = NextResponse.next({ request });
          priorCookies.forEach((cookie) => response.cookies.set(cookie));
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

  if (!user && isRecoverableStaleSessionError(authError)) {
    clearStaleSupabaseAuthCookies(response, request);
  }

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith('/api/')) {
      return attachReleaseQaAuthBoundary(
        request,
        responseWithSessionCookies(NextResponse.json({ error: 'unauthorized' }, { status: 401 }), response),
        getSupabaseAuthCookieNames(request.cookies.getAll()).length > 0,
        authError?.code,
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return attachReleaseQaAuthBoundary(
      request,
      redirectWithSessionCookies(loginUrl, response),
      getSupabaseAuthCookieNames(request.cookies.getAll()).length > 0,
      authError?.code,
    );
  }

  // Public recovery/callback routes remain usable while store context is unavailable.
  if (user && (!isPublicPath(pathname) || pathname === '/login' || pathname === '/signup')) {
    let postAuthPath: string;
    try {
      postAuthPath = isSecurityGate(pathname) ? '/dashboard' : await resolvePostAuthPath(supabase, user.id, {
        nextPath: request.nextUrl.searchParams.get('next'),
      });
    } catch {
      const unavailable = pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'store_context_unavailable' }, { status: 503 })
        : new NextResponse('店舗情報を確認できませんでした。時間をおいてページを再読み込みしてください。', {
            status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
          });
      return responseWithSessionCookies(unavailable, response);
    }

    if (pathname === '/login' || pathname === '/signup') {
      if (postAuthPath.split('?')[0] === pathname) {
        return response;
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = postAuthPath.split('?')[0] ?? postAuthPath;
      redirectUrl.search = postAuthPath.includes('?')
        ? postAuthPath.slice(postAuthPath.indexOf('?'))
        : '';
      return redirectWithSessionCookies(redirectUrl, response);
    }

    if (pathname === '/onboarding' && postAuthPath.startsWith('/dashboard')) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/dashboard';
      dashboardUrl.search = '';
      return redirectWithSessionCookies(dashboardUrl, response);
    }

    if (
      !isPublicPath(pathname) &&
      pathname !== '/api/stores/active' &&
      pathname !== '/onboarding' &&
      (postAuthPath.startsWith('/onboarding') || postAuthPath.startsWith('/signup'))
    ) {
      if (pathname.startsWith('/api/')) {
        return responseWithSessionCookies(NextResponse.json({ error: 'forbidden' }, { status: 403 }), response);
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = postAuthPath.split('?')[0] ?? postAuthPath;
      redirectUrl.search = postAuthPath.includes('?')
        ? postAuthPath.slice(postAuthPath.indexOf('?'))
        : '';
      return redirectWithSessionCookies(redirectUrl, response);
    }

    if (!isPublicPath(pathname) && !isSecurityGate(pathname)) {
      const { data: contractAccess } = await supabase.rpc('get_member_contract_access', {});
      const accessState = resolveEffectiveContractAccess(
        parseContractAccess(contractAccess),
      ).state;

      if (accessState === 'cancelled_retention' && !isCancelledRetentionAllowedPath(pathname)) {
        const billingUrl = new URL('/settings/billing', request.url);
        billingUrl.searchParams.set('contract', 'cancelled');
        return redirectWithSessionCookies(billingUrl, response);
      }

      if (
        ['checkout_pending', 'initial_payment_pending', 'restricted', 'unpaid', 'canceled', 'reconciliation_required'].includes(accessState)
        && !isBillingRecoveryAllowedPath(pathname)
      ) {
        if (pathname.startsWith('/api/')) {
          return responseWithSessionCookies(NextResponse.json({ error: 'billing_access_restricted' }, { status: 402 }), response);
        }
        const billingUrl = new URL('/settings/billing', request.url);
        billingUrl.searchParams.set('contract', accessState);
        return redirectWithSessionCookies(billingUrl, response);
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
