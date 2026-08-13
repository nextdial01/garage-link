import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { parseControlledEmailConfirmation } from '@/lib/auth/controlledEmailConfirmation';

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const confirmation = parseControlledEmailConfirmation({
    tokenHash: typeof form?.get('token_hash') === 'string' ? String(form.get('token_hash')) : null,
    type: typeof form?.get('type') === 'string' ? String(form.get('type')) : null,
    next: typeof form?.get('next') === 'string' ? String(form.get('next')) : null,
  });
  if (!confirmation) {
    return NextResponse.redirect(new URL('/auth/confirm?error=invalid_link', request.url), 303);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !anonKey) {
    return NextResponse.redirect(new URL('/auth/confirm?error=unavailable', request.url), 303);
  }

  const authCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        authCookies.splice(0, authCookies.length, ...cookiesToSet);
      },
    },
  });
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: confirmation.tokenHash,
    type: confirmation.type,
  });
  if (error || !data.session || !data.user) {
    return NextResponse.redirect(new URL('/auth/confirm?error=expired_or_invalid', request.url), 303);
  }

  const response = NextResponse.redirect(new URL(confirmation.next, request.url), 303);
  authCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });
  return response;
}
