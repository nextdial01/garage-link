export const dynamic = 'force-dynamic';

const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const PRODUCTION_PROJECT_ID = 'prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64';
const BLOCKED_PROJECT_IDS = new Set([PRODUCTION_PROJECT_ID]);
const PRODUCTION_HOSTS = new Set(['garage-link.tech', 'www.garage-link.tech']);
const STAGING_HOST = /^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i;

function value(name: string) {
  return process.env[name]?.trim() ?? '';
}

function isProductionHost(hostname: string) {
  return PRODUCTION_HOSTS.has(hostname) || hostname.endsWith('.garage-link.tech');
}

function deploymentUrl(hostname: string) {
  if (!hostname || !hostname.endsWith('.vercel.app') || isProductionHost(hostname)) return null;
  return `https://${hostname}`;
}

export async function GET(request: Request) {
  const runtimeHost = new URL(request.url).hostname.toLowerCase();
  const projectId = value('VERCEL_PROJECT_ID');
  const deploymentId = value('VERCEL_DEPLOYMENT_ID');
  // Vercel only injects VERCEL_GIT_* for Git-triggered deployments. The
  // Staging-only Closure lane intentionally uses an explicitly authorised
  // manual preview deploy, so it supplies these two immutable, non-secret
  // provenance values at deploy time instead. They are accepted only after
  // the Staging project/host checks below; Production never exposes this API.
  const gitCommitSha = value('VERCEL_GIT_COMMIT_SHA') || value('GARAGE_STAGING_RELEASE_SHA');
  const gitCommitRef = value('VERCEL_GIT_COMMIT_REF') || value('GARAGE_STAGING_RELEASE_REF');
  const url = value('VERCEL_URL').toLowerCase();
  const vercelEnvironment = value('VERCEL_ENV');
  const targetEnvironment = value('VERCEL_TARGET_ENV');
  // A manual preview can retain a project-level target value (for example
  // "production") while VERCEL_ENV correctly identifies the deployment as a
  // preview. Only an explicitly safe target may override that runtime value.
  const environment = ['preview', 'staging'].includes(targetEnvironment)
    ? targetEnvironment
    : vercelEnvironment;
  const urlValue = deploymentUrl(url);

  const checks = [
    [projectId === STAGING_PROJECT_ID && !BLOCKED_PROJECT_IDS.has(projectId), 'PROJECT'],
    [!isProductionHost(runtimeHost) && STAGING_HOST.test(runtimeHost), 'HOST'],
    [/^dpl_[A-Za-z0-9]+$/.test(deploymentId), 'DEPLOYMENT_ID'],
    [/^[0-9a-f]{40}$/i.test(gitCommitSha), 'GIT_SHA'],
    [/^[A-Za-z0-9._/-]{1,255}$/.test(gitCommitRef), 'GIT_REF'],
    [Boolean(urlValue), 'DEPLOYMENT_URL'],
    [Boolean(environment), 'ENVIRONMENT'],
  ] as const;
  const failed = checks.find(([passed]) => !passed)?.[1];
  if (failed) {
    const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    // Only an already-identified Staging project and hostname may disclose a
    // non-secret format category. Production and ambiguous runtimes stay 404-only.
    if (projectId === STAGING_PROJECT_ID && STAGING_HOST.test(runtimeHost)) {
      headers['x-garage-qa-provenance-error'] = failed;
    }
    return new Response(null, { status: 404, headers });
  }

  return Response.json({
    project_id: projectId,
    deployment_id: deploymentId,
    git_commit_sha: gitCommitSha,
    git_commit_ref: gitCommitRef,
    deployment_url: urlValue,
    environment,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
