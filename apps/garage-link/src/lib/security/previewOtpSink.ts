import 'server-only';

const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const STAGING_HOST = /^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i;

export function getPreviewOtpSinkContext(request: Request) {
  const secret = process.env.GARAGE_PREVIEW_OTP_SINK_SECRET?.trim() ?? '';
  let requestHostname = '';
  try {
    requestHostname = new URL(request.url).hostname.toLowerCase();
  } catch {
    return { requested: process.env.VERCEL_ENV === 'preview', authorized: false } as const;
  }

  const requested = process.env.VERCEL_ENV === 'preview';
  const authorized =
    requested &&
    process.env.VERCEL_PROJECT_ID === STAGING_PROJECT_ID &&
    process.env.VERCEL_ENV === 'preview' &&
    process.env.NODE_ENV === 'production' &&
    secret.length >= 32 &&
    STAGING_HOST.test(requestHostname);

  return { requested, authorized } as const;
}
