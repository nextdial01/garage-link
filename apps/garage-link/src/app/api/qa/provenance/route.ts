export const dynamic = 'force-dynamic';

const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const PRODUCTION_PROJECT_ID = 'prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64';
const BLOCKED_PROJECT_IDS = new Set([PRODUCTION_PROJECT_ID]);
const PRODUCTION_HOSTS = new Set(['garage-link.tech', 'www.garage-link.tech']);

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
  const gitCommitSha = value('VERCEL_GIT_COMMIT_SHA');
  const gitCommitRef = value('VERCEL_GIT_COMMIT_REF');
  const url = value('VERCEL_URL').toLowerCase();
  const environment = value('VERCEL_TARGET_ENV') || value('VERCEL_ENV');
  const urlValue = deploymentUrl(url);

  const valid = projectId === STAGING_PROJECT_ID
    && !BLOCKED_PROJECT_IDS.has(projectId)
    && !isProductionHost(runtimeHost)
    && /^dpl_[A-Za-z0-9]+$/.test(deploymentId)
    && /^[0-9a-f]{40}$/i.test(gitCommitSha)
    && /^[A-Za-z0-9._/-]{1,255}$/.test(gitCommitRef)
    && Boolean(urlValue)
    && Boolean(environment);

  if (!valid) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

  return Response.json({
    project_id: projectId,
    deployment_id: deploymentId,
    git_commit_sha: gitCommitSha,
    git_commit_ref: gitCommitRef,
    deployment_url: urlValue,
    environment,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
