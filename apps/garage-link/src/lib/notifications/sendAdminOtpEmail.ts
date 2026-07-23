import 'server-only';

export async function sendAdminOtpEmail(email: string, code: string) {
  const apiKey = process.env.GARAGE_RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  const from = process.env.GARAGE_SECURITY_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false as const, error: 'email_not_configured' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'GARAGE LINK 管理者ログイン確認コード',
        html: `<div style="font-family:sans-serif;color:#0f172a;line-height:1.7"><p>GARAGE LINKの管理者ログイン確認コードです。</p><p style="font-size:28px;font-weight:700;letter-spacing:0.25em">${code}</p><p>このコードは10分で失効します。心当たりがない場合は入力せず、パスワードを変更してください。</p></div>`,
      }),
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false as const, error: `resend_${response.status}` };
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: 'email_network_error' };
  }
}
