import 'server-only';
import { isControlledStagingReleaseQaRuntime } from '@/lib/security/stagingReleaseQaHost';

export function getPreviewOtpSinkContext(request: Request) {
  let requestHostname = '';
  try {
    requestHostname = new URL(request.url).hostname.toLowerCase();
  } catch {
    return { requested: process.env.VERCEL_ENV === 'preview', authorized: false } as const;
  }

  const requested = process.env.VERCEL_ENV === 'preview';
  const authorized = requested && isControlledStagingReleaseQaRuntime({
    hostname: requestHostname,
    projectId: process.env.VERCEL_PROJECT_ID,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    previewOtpSecret: process.env.GARAGE_PREVIEW_OTP_SINK_SECRET,
  });

  return { requested, authorized } as const;
}
