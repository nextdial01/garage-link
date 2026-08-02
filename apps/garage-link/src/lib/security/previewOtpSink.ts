import 'server-only';

export function getPreviewOtpSinkContext(request: Request) {
  const secret = process.env.GARAGE_PREVIEW_OTP_SINK_SECRET?.trim() ?? '';
  const vercelUrl = process.env.VERCEL_URL?.trim().toLowerCase() ?? '';
  let requestHost = '';
  try {
    requestHost = new URL(request.url).host.toLowerCase();
  } catch {
    return { requested: process.env.VERCEL_ENV === 'preview', authorized: false } as const;
  }

  const requested = process.env.VERCEL_ENV === 'preview';
  const authorized =
    requested &&
    process.env.VERCEL_ENV === 'preview' &&
    process.env.NODE_ENV === 'production' &&
    secret.length >= 32 &&
    vercelUrl.length > 0 &&
    requestHost === vercelUrl;

  return { requested, authorized } as const;
}
