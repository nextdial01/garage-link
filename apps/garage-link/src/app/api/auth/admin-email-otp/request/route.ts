import { type NextRequest, NextResponse } from 'next/server';
import { sendAdminOtpEmail } from '@/lib/notifications/sendAdminOtpEmail';
import { emailHash, getAdminEmailOtpSecret, maskEmail, otpHash, randomOtpCode } from '@/lib/security/adminEmailOtp';
import { getAuthenticatedAdminContext } from '@/lib/security/adminEmailOtpServer';

export async function POST(request: NextRequest) {
  const context = await getAuthenticatedAdminContext(request);
  const secret = getAdminEmailOtpSecret();
  if (!context || !secret) return NextResponse.json({ error: '管理者メール認証を利用できません。' }, { status: 403 });
  const code = randomOtpCode();
  const [hashedEmail, hashedCode] = await Promise.all([
    emailHash(secret, context.email),
    otpHash(secret, context.userId, context.sessionId, code),
  ]);
  const { data: challengeId, error: challengeError } = await context.service.rpc('create_admin_email_otp_challenge', {
    p_user_id: context.userId,
    p_session_id: context.sessionId,
    p_email_hash: hashedEmail,
    p_code_hash: hashedCode,
  });
  if (challengeError) {
    const message = challengeError.message ?? '';
    const status = message.includes('otp_resend_too_soon') || message.includes('otp_rate_limited') ? 429 : 503;
    return NextResponse.json({ error: status === 429 ? '確認コードは1分後に再送できます。' : '確認コードを作成できませんでした。' }, { status });
  }
  const sent = await sendAdminOtpEmail(context.email, code);
  if (!sent.ok) {
    if (typeof challengeId === 'string') await context.service.from('admin_email_otp_challenges').update({ consumed_at: new Date().toISOString() }).eq('id', challengeId);
    return NextResponse.json({ error: '確認メールを送信できませんでした。管理者に連絡してください。' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, maskedEmail: maskEmail(context.email), retryAfter: 60 });
}

