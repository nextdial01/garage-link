export const STAGING_RELEASE_QA_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
export const STAGING_RELEASE_QA_CONTROLLED_HOST = 'staging.garage-link.tech';

const STAGING_RELEASE_QA_VERCEL_HOST = /^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i;
const RELEASE_QA_RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StagingReleaseQaRuntime = {
  hostname: string;
  projectId: string | undefined;
  vercelEnv: string | undefined;
  nodeEnv: string | undefined;
  previewOtpSecret: string | undefined;
};

export function isControlledStagingReleaseQaHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === STAGING_RELEASE_QA_CONTROLLED_HOST || STAGING_RELEASE_QA_VERCEL_HOST.test(normalized);
}

export function isControlledStagingReleaseQaRuntime(runtime: StagingReleaseQaRuntime) {
  return runtime.projectId === STAGING_RELEASE_QA_PROJECT_ID
    && runtime.vercelEnv === 'preview'
    && runtime.nodeEnv === 'production'
    && (runtime.previewOtpSecret?.trim().length ?? 0) >= 32
    && isControlledStagingReleaseQaHost(runtime.hostname);
}

export function hasValidStagingReleaseQaRunBinding(runId: unknown) {
  return typeof runId === 'string' && RELEASE_QA_RUN_ID.test(runId);
}
