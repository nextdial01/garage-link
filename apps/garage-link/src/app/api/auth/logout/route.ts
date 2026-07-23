import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { ADMIN_EMAIL_OTP_COOKIE, trustedDeviceCookieOptions } from '@/lib/security/adminEmailOtp';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const authCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', {
    cookies: { getAll: () => request.cookies.getAll(), setAll: (cookiesToSet) => { authCookies.splice(0, authCookies.length, ...cookiesToSet); } },
  });
  const [{ data: userData }, { data: claimsData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getClaims()]);
  const sessionId = typeof claimsData?.claims?.session_id === 'string' ? claimsData.claims.session_id : '';
  const service = createAdminClient();
  if (service && userData.user?.id && sessionId) await service.from('admin_trusted_sessions').delete().eq('user_id', userData.user.id).eq('session_id', sessionId);
  await supabase.auth.signOut();
  const response = NextResponse.json({ ok: true });
  authCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]));
  response.cookies.set(ADMIN_EMAIL_OTP_COOKIE, '', { ...trustedDeviceCookieOptions(), maxAge: 0 });
  return response;
}

