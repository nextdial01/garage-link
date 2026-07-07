import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { resolvePostAuthPath } from '@/lib/auth/post-auth-redirect';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/logout',
  '/legal/terms',
  '/legal/privacy',
];

const CANCELLED_RETENTION_ALLOWED = [
  '/settings/billing',
  '/logout',
];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith('/legal/')) return true;
  return false;
}

function isCancelledRetentionAllowedPath(pathname: string) {
  if (CANCELLED_RETENTION_ALLOWED.includes(pathname)) return true;
  if (pathname.startsWith('/legal/')) return true;
  return false;
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
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    const postAuthPath = await resolvePostAuthPath(supabase, user.id, {
      nextPath: request.nextUrl.searchParams.get('next'),
    });

    if (pathname === '/login' || pathname === '/signup') {
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
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = postAuthPath.split('?')[0] ?? postAuthPath;
      redirectUrl.search = postAuthPath.includes('?')
        ? postAuthPath.slice(postAuthPath.indexOf('?'))
        : '';
      return NextResponse.redirect(redirectUrl);
    }

    if (!isPublicPath(pathname)) {
      const { data: contractAccess } = await supabase.rpc('get_member_contract_access');
      const accessState =
        contractAccess &&
        typeof contractAccess === 'object' &&
        'state' in contractAccess &&
        typeof (contractAccess as { state?: string }).state === 'string'
          ? (contractAccess as { state: string }).state
          : 'active';

      if (accessState === 'cancelled_retention' && !isCancelledRetentionAllowedPath(pathname)) {
        const billingUrl = request.nextUrl.clone();
        billingUrl.pathname = '/settings/billing';
        billingUrl.searchParams.set('contract', 'cancelled');
        return NextResponse.redirect(billingUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
