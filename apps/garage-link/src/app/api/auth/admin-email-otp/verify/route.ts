import { type NextRequest, NextResponse } from 'next/server';
import { ADMIN_EMAIL_OTP_COOKIE, createTrustedDeviceCookieValue, deviceTokenHash, getAdminEmailOtpSecret, otpHash, randomDeviceToken, trustedDeviceCookieOptions } from '@/lib/security/adminEmailOtp';
import { getAuthenticatedAdminContext } from '@/lib/security/adminEmailOtpServer';

export async function POST(request: NextRequest) {
  const context = await getAuthenticatedAdminContext(request);
  const secret = getAdminEmailOtpSecret();
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '') : '';
  if (!context || !secret) return NextResponse.json({ error: '管理者メール認証を利用できません。' }, { status: 403 });
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: '6桁の確認コードを入力してください。' }, { status: 400 });
  const deviceToken = randomDeviceToken();
  const [hashedCode, hashedDeviceToken] = await Promise.all([
    otpHash(secret, context.userId, context.sessionId, code),
    deviceTokenHash(secret, deviceToken),
  ]);
  const { data, error } = await context.service.rpc('verify_admin_email_otp_challenge', {
    p_user_id: context.userId,
    p_session_id: context.sessionId,
    p_code_hash: hashedCode,
    p_device_token_hash: hashedDeviceToken,
  });
  if (error || data !== 'ok') {
    const locked = data === 'locked';
    return NextResponse.json({ error: locked ? '確認コードの試行上限に達しました。新しいコードを再送してください。' : '確認コードが正しくないか、期限が切れています。' }, { status: locked ? 429 : 401 });
  }
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const cookieValue = await createTrustedDeviceCookieValue(secret, { userId: context.userId, sessionId: context.sessionId, token: deviceToken, expiresAt });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_EMAIL_OTP_COOKIE, cookieValue, trustedDeviceCookieOptions());
  return response;
}

