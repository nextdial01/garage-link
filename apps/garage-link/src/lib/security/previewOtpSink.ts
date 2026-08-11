import 'server-only';

const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';

export function getPreviewOtpSinkContext(request: Request) {
  const secret = process.env.GARAGE_PREVIEW_OTP_SINK_SECRET?.trim() ?? '';
  const vercelUrl = process.env.VERCEL_URL?.trim().toLowerCase() ?? '';
  const projectProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim().toLowerCase() ?? '';
  let requestHost = '';
  try {
    requestHost = new URL(request.url).host.toLowerCase();
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
    vercelUrl.length > 0 &&
    (requestHost === vercelUrl || (projectProductionUrl.length > 0 && requestHost === projectProductionUrl));

  return { requested, authorized } as const;
}
