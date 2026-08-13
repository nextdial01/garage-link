import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createActualEmailTransportSession, createManualGmailSession, fetchVerifiedVercelRequest, manualGmailCheckpoint, pollManualGmailConfirmation, readAuthConfig, readManagementProfile, releaseCriticalBaseUrl, validateActualEmailTransportRecipient, verifyManualGmailCallbackReach } from '../../scripts/qa/release-critical-preflight.mjs';
import { classifyCtaTrace, createActualEmailCheckpoint, createReleaseCriticalRun, installVercelBrowserBypass, isAuthOnlyLifecycleAbortEligible, isExpiredLifecycleReclaimState, isLifecycleCleanupResumableState, recoverableLifecycleStatus, releaseCriticalSyntheticPassword, validateActualEmailCheckpoint, validateClientAuthRedirect, validateHostedGeneratedLink, validateReleaseCriticalProvenance } from '../../scripts/qa/release-critical-journeys.mjs';
import { applyStagingPasswordMinimum } from '../../scripts/qa/release-critical-stage-auth.mjs';
import { ensureReleaseCriticalCtaMatrix } from '../../scripts/qa/release-critical-qa-lifecycle-contract.mjs';

const appRoot=resolve(import.meta.dirname,'../..');

test('remote release-critical preflight is Staging-only and non-billing',async()=>{
  const [runner,journeys,workflow,qaLifecycleContract,signup,trackedSignupLink,callback,recovery,middleware,callbackEvidence,fixtureDiscovery,provenanceRoute,adminOtpServer,ctaMatrixMigration,ctaMatrixRollback,expiredFixtureRecovery,expiredFixtureRecoveryRollback]=await Promise.all([
    readFile(resolve(appRoot,'scripts/qa/release-critical-preflight.mjs'),'utf8'),
    readFile(resolve(appRoot,'scripts/qa/release-critical-journeys.mjs'),'utf8'),
    readFile(resolve(appRoot,'../../.github/workflows/garage-link-release-critical.yml'),'utf8'),
    readFile(resolve(appRoot,'scripts/qa/release-critical-qa-lifecycle-contract.mjs'),'utf8'),
    readFile(resolve(appRoot,'src/app/signup/page.tsx'),'utf8'),
    readFile(resolve(appRoot,'src/components/landing/TrackedSignupLink.tsx'),'utf8'),
    readFile(resolve(appRoot,'src/app/auth/callback/page.tsx'),'utf8'),
    readFile(resolve(appRoot,'src/app/auth/reset-password/page.tsx'),'utf8'),
    readFile(resolve(appRoot,'src/middleware.ts'),'utf8'),
    readFile(resolve(appRoot,'src/app/api/qa/callback-evidence/route.ts'),'utf8'),
    readFile(resolve(appRoot,'src/app/api/qa/fixture-discovery/route.ts'),'utf8'),
    readFile(resolve(appRoot,'src/app/api/qa/provenance/route.ts'),'utf8'),
    readFile(resolve(appRoot,'src/lib/security/adminEmailOtpServer.ts'),'utf8'),
    readFile(resolve(appRoot,'supabase/qa/migrations/20260812000100_qa_lifecycle_cta_account_state_matrix.sql'),'utf8'),
    readFile(resolve(appRoot,'supabase/qa/rollback/20260812000100_qa_lifecycle_cta_account_state_matrix.down.sql'),'utf8'),
    readFile(resolve(appRoot,'supabase/qa/migrations/20260812101500_qa_lifecycle_expired_release_fixture_recovery.sql'),'utf8'),
    readFile(resolve(appRoot,'supabase/qa/rollback/20260812101500_qa_lifecycle_expired_release_fixture_recovery.down.sql'),'utf8'),
  ]);
  assert.match(runner,/gaytoojzwqkpuvfofeql/);
  assert.match(runner,/wmlpuzuskfiwdipluglz/);
  assert.match(runner,/auth\.admin\.listUsers/);
  assert.match(runner,/config\/auth/);
  assert.match(runner,/x-vercel-protection-bypass/);
  assert.doesNotMatch(runner,/const bypassHeaders=\{'x-vercel-protection-bypass':bypassSecret,'x-vercel-set-bypass-cookie'/);
  assert.match(runner,/\/api\/health/);
  assert.match(runner,/bypass\.status<200\|\|bypass\.status>=300/);
  assert.match(runner,/VERCEL_AUTOMATION_BYPASS_PASS/);
  assert.match(runner,/manual_gmail/);
  assert.match(runner,/MANUAL_GMAIL_CHECKPOINT_SIGNUP/);
  assert.match(runner,/MANUAL_GMAIL_CHECKPOINT_RESET/);
  assert.match(runner,/MANUAL_GMAIL_CHECKPOINT_TIMEOUT/);
  assert.match(runner,/auth\.admin\.getUserById/);
  assert.match(runner,/REDACTED_MANUAL_GMAIL_ADDRESS/);
  assert.match(runner,/GITHUB_EVENT_PATH/);
  assert.doesNotMatch(runner,/RELEASE_CRITICAL_MANUAL_GMAIL_ADDRESS/);
  assert.doesNotMatch(runner,/manual_gmail_address/);
  assert.match(runner,/RUNTIME_PROVENANCE_ACCESS_FAILED/);
  assert.match(runner,/PREFLIGHT_VERCEL_REDIRECT_DIAGNOSTIC/);
  assert.match(runner,/x-garage-qa-provenance-error/);
  assert.match(runner,/fetchVerifiedVercelRequest/);
  assert.match(runner,/verifyManualGmailCallbackReach/);
  assert.match(runner,/MANUAL_GMAIL_CALLBACK_UNREACHED/);
  assert.match(runner,/\/api\/qa\/provenance/);
  assert.match(runner,/RUNTIME_PROVENANCE_RESPONSE_SHAPE_INVALID/);
  assert.match(runner,/readManagementProfile/);
  assert.match(runner,/redirect:'manual'/);
  assert.match(runner,/SUPABASE_MANAGEMENT_REDIRECT_UNSAFE/);
  assert.match(runner,/provenance\.git_commit_sha/);
  assert.doesNotMatch(runner,/\/v9\/projects\//);
  assert.doesNotMatch(runner,/api\.vercel\.com\/v13\/deployments/);
  assert.doesNotMatch(runner,/GARAGE_STAGING_QA_MAILBOX/);
  assert.doesNotMatch(runner,/method:'PATCH'/);
  assert.doesNotMatch(runner,/STRIPE_SECRET_KEY|sk_live_|api\.line\.me/);
  assert.match(journeys,/qa_lifecycle_adopt_fixture/);
  assert.match(journeys,/qa_lifecycle_verify_clean/);
  assert.match(journeys,/RELEASE_CRITICAL_ACTUAL_EMAIL_CHECKPOINT_PREPARED/);
  assert.match(journeys,/RELEASE_CRITICAL_SIGNUP_REQUEST_UNOBSERVED/);
  assert.match(journeys,/RELEASE_CRITICAL_SIGNUP_RESPONSE_UNOBSERVED/);
  assert.match(journeys,/RELEASE_CRITICAL_SIGNUP_QA_RUN_CONTEXT_LOST/);
  assert.match(journeys,/Wait for the client-owned CTA href to carry the run context/);
  assert.match(trackedSignupLink,/useSyncExternalStore\(subscribeReleaseQaRun, releaseQaRunSnapshot, \(\) => null\)/);
  assert.match(trackedSignupLink,/qa_run=\$\{encodeURIComponent\(qaRunId\)\}/);
  assert.doesNotMatch(trackedSignupLink,/window\.location\.assign/);
  assert.match(journeys,/recoverExplicitUnboundActualEmailFixture/);
  assert.match(journeys,/RELEASE_CRITICAL_UNBOUND_RECOVERY_AGE_UNPROVEN/);
  assert.match(journeys,/RELEASE_CRITICAL_UNBOUND_RECOVERY_AUTH_STATE_UNPROVEN:CONFIRMED/);
  assert.match(journeys,/RELEASE_CRITICAL_UNBOUND_RECOVERY_AUTH_STATE_UNPROVEN:CALLBACK_EVIDENCE/);
  assert.match(journeys,/one_time_unbound_actual_email_recovery/);
  assert.match(workflow,/recover_unbound_actual_email/);
  assert.match(workflow,/RELEASE_CRITICAL_ALLOW_UNBOUND_ACTUAL_EMAIL_RECOVERY/);
  assert.match(journeys,/requestRecoveryForPreparedSession/);
  assert.doesNotMatch(journeys,/run\.emailMarker}-contract/);
  assert.match(journeys,/requireOnboardingCompleted:true/);
  assert.match(journeys,/requireStoreCreated:true/);
  assert.match(journeys,/user\?\?=await maybeFindUser/);
  assert.match(journeys,/requirePasswordUpdate:true/);
  assert.match(journeys,/notice=password_updated/);
  assert.doesNotMatch(journeys,/getByRole\('link',\{name:'ログインへ戻る'\}\)\.click/);
  assert.match(journeys,/beginLifecycle\(life,run,provenance\)/);
  assert.match(journeys,/qa_lifecycle_abort_clean/);
  assert.match(journeys,/isAuthOnlyLifecycleAbortEligible/);
  assert.match(journeys,/RELEASE_CRITICAL_AUTH_ONLY_SCOPE_UNPROVEN/);
  assert.ok(journeys.indexOf("qa_lifecycle_abort_clean',{p_run_id:runId") < journeys.indexOf('admin.auth.admin.deleteUser(user.id,false)'));
  assert.match(journeys,/recoverKnownPartialFixture\(admin,provenance,baseUrl,supabaseUrl,serviceRole,bypassSecret\)/);
  assert.match(journeys,/ownerFixtureForBrowserSession/);
  assert.match(journeys,/RELEASE_CRITICAL_FIXTURE_DISCOVERY_SAME_OTP_SESSION_PASS/);
  assert.match(journeys,/verifyFreshOtpGuard/);
  assert.match(journeys,/RELEASE_CRITICAL_FIXTURE_RECOVERY_SAME_OTP_SESSION_PASS/);
  assert.match(journeys,/RELEASE_CRITICAL_FRESH_SESSION_OTP_GUARD_PASS/);
  assert.match(journeys,/qa_lifecycle_reclaim_expired_release_fixture/);
  assert.match(journeys,/reclaimExpiredCleanupLifecycleIfRequired/);
  assert.match(journeys,/RELEASE_CRITICAL_EXPIRED_CLEANUP_RECOVERY_PASS/);
  assert.match(journeys,/RELEASE_CRITICAL_INTERRUPTED_POST_AUTH_CLEANUP_RESUMED/);
  assert.match(journeys,/RELEASE_CRITICAL_INTERRUPTED_AUTH_ABSENT_SCOPE_UNPROVEN/);
  assert.match(journeys,/existing\?\.state==='COMPLETE'\)return verifyKnownPartialLifecycle/);
  assert.match(journeys,/'FIXTURE_LIFECYCLE'/);
  assert.match(journeys,/RELEASE_CRITICAL_LIFECYCLE_\$\{name\}:\$\{safeProviderCode\(error\)\}:\$\{safeErrorCode\(error\)\}/);
  assert.match(journeys,/RELEASE_CRITICAL_EXPIRED_LIFECYCLE_RECOVERY_PASS/);
  assert.match(journeys,/48\*60\*60_000/);
  assert.match(journeys,/24\*60\*60_000/);
  assert.match(journeys,/recoverInterruptedFixture/);
  assert.match(journeys,/INTERRUPTED_RUN_ID/);
  assert.doesNotMatch(journeys,/RELEASE_CRITICAL_MACHINE_EARLY_AUTH_DELETE|RELEASE_CRITICAL_EARLY_AUTH_DELETE/);
  assert.match(journeys,/\/api\/qa\/fixture-discovery/);
  assert.match(await readFile(resolve(appRoot,'src/lib/auth/releaseQaFixture.ts'),'utf8'),/current_user_active_store_membership/);
  assert.match(await readFile(resolve(appRoot,'src/lib/auth/releaseQaFixture.ts'),'utf8'),/store\.name\.trim\(\)\.length > 0/);
  assert.match(fixtureDiscovery,/STAGING_PROJECT_ID/);
  assert.match(fixtureDiscovery,/targetEnvironment/);
  assert.match(fixtureDiscovery,/process\.env\.VERCEL_ENV/);
  assert.match(fixtureDiscovery,/readReleaseQaFixture/);
  assert.match(await readFile(resolve(appRoot,'src/lib/auth/releaseQaFixture.ts'),'utf8'),/POSTGREST_MEMBERSHIP/);
  assert.match(fixtureDiscovery,/ROUTE_AUTH/);
  assert.match(fixtureDiscovery,/marker_hash/);
  assert.match(fixtureDiscovery,/postgrest_provider_error_code/);
  assert.match(fixtureDiscovery,/account_state/);
  assert.match(fixtureDiscovery,/createServerClient/);
  assert.match(fixtureDiscovery,/request\.cookies\.getAll/);
  assert.match(fixtureDiscovery,/status: 404/);
  assert.doesNotMatch(fixtureDiscovery,/createAdminClient|STRIPE_SECRET_KEY|sk_live_|api\.line\.me/);
  assert.match(callbackEvidence,/readReleaseQaFixture/);
  assert.match(callbackEvidence,/phase === 'onboarding_completed'/);
  assert.match(callbackEvidence,/fixture = \{/);
  assert.match(provenanceRoute,/x-garage-qa-provenance-error/);
  assert.match(provenanceRoute,/projectId === STAGING_PROJECT_ID && STAGING_HOST\.test\(runtimeHost\)/);
  assert.match(journeys,/RELEASE_CRITICAL_PARTIAL_FIXTURE_CLEAN/);
  assert.match(journeys,/PARTIAL_USER_ID/);
  assert.match(journeys,/RELEASE_CRITICAL_PARTIAL_AUTH_ABSENT_STATE/);
  assert.match(journeys,/temporary_protection_mutation:false/);
  assert.match(journeys,/life\.evidence\('BYPASS'/);
  assert.match(journeys,/RELEASE_CRITICAL_SIGNUP_SUBMIT_ALERT/);
  assert.match(journeys,/REDIRECT_URL_NOT_ALLOWED/);
  assert.match(journeys,/UNKNOWN_MESSAGE_SHA256/);
  assert.match(journeys,/REDACTED_EMAIL/);
  assert.match(journeys,/PASSWORD_6_NOT_REJECTED/);
  assert.match(journeys,/isDisabled\(\)/);
  assert.match(journeys,/RELEASE_CRITICAL_SIGNUP_AUTO_CONFIRMED/);
  assert.match(journeys,/RELEASE_CRITICAL_SIGNUP_OUTCOME_UNOBSERVED/);
  assert.match(journeys,/Do not create long-lived response waiters before the form is ready/);
  assert.match(journeys,/const \[observedSignupRequest,response\]=await Promise\.all/);
  assert.match(journeys,/Bind it to this lifecycle immediately so a later redirect/);
  assert.match(journeys,/user=await bindSyntheticIdentity\(admin,await findUser\(admin,session\.emailAddress\),run\);/);
  assert.match(journeys,/RELEASE_CRITICAL_INQUIRY_ROUTE_UNAVAILABLE/);
  assert.match(journeys,/RELEASE_CRITICAL_CANDIDATE_SHA_INPUT_INVALID/);
  assert.match(journeys,/VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(journeys,/'x-vercel-protection-bypass':bypassSecret/);
  assert.match(journeys,/fetchVerifiedVercelRequest/);
  assert.match(journeys,/RELEASE_CRITICAL_FIXTURE_DISCOVERY_DIAGNOSTIC/);
  assert.doesNotMatch(journeys,/trustReleaseQaAdminSession/);
  assert.match(journeys,/RELEASE_CRITICAL_OTP_PREVIEW_SINK_UI_REACH/);
  assert.match(journeys,/OTP_REQUEST_EMITTED/);
  assert.match(journeys,/OTP_REQUEST_FAILED/);
  assert.match(journeys,/RELEASE_CRITICAL_OTP_PREVIEW_SINK_RATE_LIMIT/);
  assert.match(journeys,/WAIT_THEN_VISIBLE_RESEND/);
  assert.match(journeys,/WAIT_THEN_CURRENT_ROUTE_RELOAD/);
  assert.match(journeys,/確認コードを再送する/);
  assert.match(journeys,/postgrest_provider_error_code/);
  assert.match(journeys,/RELEASE_CRITICAL_CTA_TRACE/);
  assert.match(journeys,/document\.addEventListener\('click'/);
  assert.match(journeys,/React may replace the Link/);
  assert.match(journeys,/VEHICLE_CREATE/);
  assert.match(journeys,/VEHICLE_DETAIL/);
  assert.match(journeys,/getByRole\('link',\{name:'車両一覧に戻る',exact:true\}\)\.first\(\)\.click/);
  assert.match(journeys,/CUSTOMER_CREATE/);
  assert.match(journeys,/getByLabel\('顧客\/会社名',\{exact:true\}\)/);
  assert.match(journeys,/DEAL_CREATE/);
  assert.match(journeys,/QUOTE_CREATE/);
  assert.match(journeys,/INVOICE_CREATE/);
  assert.match(journeys,/APPOINTMENT_CREATE/);
  assert.match(journeys,/customer_equivalence:reproduced\?'ACTIVE_NON_OWNER_REPRODUCED':'NOT_ASSERTED'/);
  assert.match(journeys,/middleware_final_destination/);
  assert.match(journeys,/browser_runtime_error_count/);
  assert.match(journeys,/destination_request_auth_cookie/);
  assert.match(journeys,/auth_cookie_clear_paths/);
  assert.match(journeys,/supabase_auth_responses/);
  assert.match(journeys,/AUTH_PRESENT/);
  assert.match(journeys,/navigation_request_paths/);
  assert.match(journeys,/same_origin_redirects/);
  assert.match(journeys,/pointer_click_delivered/);
  assert.match(journeys,/dom_click_event_observed/);
  assert.match(journeys,/middleware_auth_boundaries/);
  assert.match(journeys,/x-garage-release-qa/);
  assert.match(journeys,/establishFreshBrowserSession/);
  assert.match(journeys,/RELEASE_CRITICAL_CTA_SESSION_HANDOFF_PASS/);
  assert.match(journeys,/Never inspect or emit a cookie value/);
  assert.match(journeys,/Never inspect or emit a cookie value/);
  assert.match(journeys,/browser_runtime_error_classes/);
  assert.match(journeys,/failed_response_paths/);
  assert.match(journeys,/isHostedInstrumentationScript/);
  assert.match(journeys,/ignored_hosted_instrumentation_404s/);
  assert.match(journeys,/RELEASE_CRITICAL_CTA_MATRIX_STATE_EXECUTION/);
  assert.match(journeys,/loginMatrixSubject/);
  assert.match(journeys,/login_outcome/);
  assert.match(journeys,/api\/auth\/password-login/);
  assert.match(journeys,/errorClass:sha256/);
  assert.match(journeys,/supported next\s+\/\/ contract/);
  assert.match(journeys,/router\.replace/);
  assert.match(journeys,/CTA trace starts only after the real login handler has committed/);
  assert.match(journeys,/get_garage_ui_context_v2/);
  assert.doesNotMatch(journeys,/\.goto\(new URL\('\/vehicles',baseUrl\),/);
  assert.match(journeys,/url=>new URL\(url\)\.pathname!==['"]\/login/);
  assert.match(journeys,/new URL\(url\)\.pathname!==['"]\/login/);
  assert.match(journeys,/garage_ui_context/);
  assert.match(journeys,/contract_access_state/);
  assert.match(journeys,/RELEASE_CRITICAL_HOSTED_AUTH_REDIRECT_PASS/);
  assert.match(journeys,/management_pat_required:false/);
  const browserClient=await readFile(resolve(appRoot,'src/lib/supabase/client.ts'),'utf8');
  assert.match(browserClient,/createReleaseQaManualEmailClient/);
  assert.match(browserClient,/createSupabaseClient/);
  assert.match(browserClient,/flowType: 'implicit'/);
  assert.match(browserClient,/storage: createReleaseQaCookieStorage\(\)/);
  assert.match(browserClient,/createReleaseQaCookieStorage/);
  assert.match(browserClient,/QA_COOKIE_PREFIX/);
  assert.match(browserClient,/STAGING_RELEASE_QA_HOST/);
  assert.match(browserClient,/return createClient\(\);/);
  assert.match(signup,/trackConversion\('signup_submit'\);\s*\n\s*setIsSubmitting\(true\);\s*\n\s*const supabase = createReleaseQaManualEmailClient\(qaRunId\);/);
  assert.match(signup,/release_qa_marker/);
  assert.match(signup,/isStagingReleaseQaImplicitFlow\(qaRunId, window\.location\.hostname\)/);
  assert.match(await readFile(resolve(appRoot,'src/app/forgot-password/page.tsx'),'utf8'),/createReleaseQaManualEmailClient\(qaRunId\)/);
  assert.match(callback,/createReleaseQaManualEmailClient\(qaRunId\)/);
  assert.match(journeys,/current_user_active_store_membership/);
  assert.match(journeys,/final\.final_evidence/);
  assert.doesNotMatch(journeys,/admin\.from\('memberships'\)/);
  assert.match(journeys,/server_bound_continuation/);
  assert.match(journeys,/allowRunBoundUnmarked/);
  assert.match(journeys,/RELEASE_CRITICAL_RUN_BOUND_UNMARKED_FIXTURE_RECOVERY_PASS/);
  assert.doesNotMatch(journeys,/STRIPE_SECRET_KEY|sk_live_|api\.line\.me/);
  assert.match(workflow,/environment: garage-link-commercial-staging/);
  assert.match(workflow,/GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN/);
  const preflightJob=workflow.slice(workflow.indexOf('\n  preflight:'),workflow.indexOf('\n  stage-auth-contract:'));
  assert.doesNotMatch(preflightJob,/GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN/);
  const qaLifecycleJob=workflow.slice(workflow.indexOf('\n  qa-lifecycle-contract:'),workflow.indexOf('\n  machine-gates:'));
  assert.doesNotMatch(qaLifecycleJob,/GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN/);
  assert.match(workflow,/auth_config_mode/);
  assert.match(workflow,/verify_by_journey/);
  assert.match(workflow,/repair_staging_once/);
  assert.match(workflow,/inputs\.auth_config_mode == 'repair_staging_once'/);
  assert.match(workflow,/email-transport-state/);
  assert.match(workflow,/EMAIL_TRANSPORT_WAITING/);
  assert.match(workflow,/RELEASE_CRITICAL_EXECUTION_MODE: machine_only/);
  const machineGateJob=workflow.slice(workflow.indexOf('\n  machine-gates:'),workflow.indexOf('\n  email-transport-state:'));
  assert.doesNotMatch(machineGateJob,/GARAGE_STAGING_RELEASE_QA_EMAIL|RELEASE_CRITICAL_MANUAL_GMAIL_ADDRESS/);
  assert.match(workflow,/staging_base_url/);
  assert.match(workflow,/description: Exact garage-link-staging preview URL/);
  assert.match(workflow,/required: true/);
  assert.equal((workflow.match(/PLAYWRIGHT_BASE_URL: \$\{\{ inputs\.staging_base_url \}\}/g)??[]).length,1);
  assert.equal((workflow.match(/PLAYWRIGHT_BASE_URL: \$\{\{ needs\.preflight\.outputs\.base_url \}\}/g)??[]).length,2);
  assert.doesNotMatch(workflow,/PLAYWRIGHT_BASE_URL: \$\{\{ secrets\.GARAGE_STAGING_BASE_URL \}\}/);
  assert.doesNotMatch(workflow,/candidate_sha/);
  assert.match(workflow,/RELEASE_CRITICAL_EXPECTED_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow,/source_sha: \$\{\{ steps\.contract\.outputs\.source_sha \}\}/);
  assert.match(runner,/RUNTIME_PROVENANCE_SHA_MISMATCH/);
  assert.match(runner,/PREFLIGHT_RUNTIME_PROVENANCE_SHA_MISMATCH/);
  assert.match(runner,/expected_sha:expectedSha/);
  assert.match(runner,/runtime:\{deployment_id:provenance\.deployment_id/);
  assert.doesNotMatch(workflow,/manual_gmail_address/);
  assert.doesNotMatch(workflow,/GARAGE_STAGING_VERCEL_READ_TOKEN|GARAGE_STAGING_VERCEL_PROJECT_ID|GARAGE_STAGING_VERCEL_TEAM_ID/);
  assert.doesNotMatch(workflow,/release_sha|release_branch|EXPECTED_RELEASE_SHA|EXPECTED_RELEASE_BRANCH/);
  assert.doesNotMatch(workflow,/GARAGE_STAGING_MAILSLURP_API_KEY/);
  assert.doesNotMatch(workflow,/GARAGE_STAGING_QA_MAILBOX/);
  assert.match(qaLifecycleContract,/CTA_MATRIX_BOOTSTRAP_REQUIRED/);
  assert.match(qaLifecycleContract,/EXTERNAL_ADMIN_ONETIME/);
  assert.doesNotMatch(qaLifecycleContract,/GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN|api\.supabase\.com|database\/query|fetch\(/);
  assert.doesNotMatch(workflow,/STRIPE_SECRET_KEY|E2E_ALLOW_BILLING_MUTATIONS|STRIPE_WEBHOOK_SECRET/);
  assert.match(workflow,/Release-critical machine-only gates/);
  assert.match(expiredFixtureRecovery,/EXPIRED_RELEASE_RECOVERY_RUN_CONTRACT_INVALID/);
  assert.match(expiredFixtureRecovery,/EXPIRED_RELEASE_RECOVERY_SCOPE_UNPROVEN/);
  assert.match(expiredFixtureRecovery,/r\.environment<>'staging'/);
  assert.match(expiredFixtureRecovery,/r\.project_ref<>'gaytoojzwqkpuvfofeql'/);
  assert.match(expiredFixtureRecovery,/qa_lifecycle_reclaim_expired_release_fixture/);
  assert.match(expiredFixtureRecovery,/revoke all on function public\.qa_lifecycle_reclaim_expired_release_fixture\(uuid\) from public, anon, authenticated/);
  assert.match(expiredFixtureRecovery,/grant execute on function public\.qa_lifecycle_reclaim_expired_release_fixture\(uuid\) to service_role/);
  assert.match(expiredFixtureRecovery,/perform 1 from public\.tenants where id=f\.tenant_id for update/);
  assert.match(expiredFixtureRecovery,/v_service_execute=15/);
  assert.match(qaLifecycleContract,/service_execute_count===15/);
  assert.match(qaLifecycleContract,/expired_release_recovery==='service_role_only'/);
  assert.doesNotMatch(expiredFixtureRecovery,/stripe_customer_id\s*:=|stripe_subscription_id\s*:=|api\.line\.me/);
  assert.match(expiredFixtureRecoveryRollback,/create or replace function public\.qa_lifecycle_cleanup_readiness/);
  assert.match(expiredFixtureRecoveryRollback,/v_service_execute=14/);
  assert.match(expiredFixtureRecoveryRollback,/drop function if exists public\.qa_lifecycle_reclaim_expired_release_fixture\(uuid\)/);
  assert.match(workflow,/release-critical-journeys\.mjs/);
  assert.match(workflow,/stage-auth-contract/);
  assert.match(workflow,/qa-lifecycle-contract/);
  assert.match(workflow,/release-critical-qa-lifecycle-contract\.mjs/);
  assert.match(workflow,/actual-email-gates/);
  assert.match(workflow,/execution_scope/);
  assert.match(workflow,/actual_email_prepare/);
  assert.match(workflow,/actual_email_resume/);
  assert.doesNotMatch(workflow,/actual_email_only/);
  assert.match(workflow,/RELEASE_CRITICAL_WAITING_MANUAL_GMAIL/);
  assert.match(workflow,/ACTUAL_EMAIL_PHASE/);
  assert.match(workflow,/final-clean-verdict/);
  assert.match(workflow,/production-email-transport/);
  assert.match(await readFile(resolve(appRoot,'scripts/qa/release-critical-production-transport.mjs'),'utf8'),/HISTORICAL_EVIDENCE_SOURCES/);
  assert.match(await readFile(resolve(appRoot,'scripts/qa/release-critical-production-transport.mjs'),'utf8'),/NO_MACHINE_READABLE_HOSTED_AUTH_SMTP_EVIDENCE/);
  assert.match(workflow,/RELEASE_CRITICAL_WAITING_PRODUCTION_TRANSPORT/);
  assert.match(workflow,/RELEASE_CRITICAL_WAITING_TRANSPORT/);
  assert.match(workflow,/RELEASE_CRITICAL_CONVERGED_PASS/);
  assert.doesNotMatch(workflow,/apply_staging_password_minimum/);
  assert.match(signup,/qa_run/);
  assert.match(callback,/recordReleaseQaCallback\(qaRunId, 'callback', nextPath\)/);
  assert.match(recovery,/recordReleaseQaCallback\(qaRunId, 'password_updated'/);
  assert.match(callbackEvidence,/STAGING_PROJECT_ID/);
  assert.match(callbackEvidence,/targetEnvironment/);
  assert.match(callbackEvidence,/process\.env\.VERCEL_ENV/);
  assert.match(callbackEvidence,/release_qa_callback/);
  assert.match(callbackEvidence,/store_created/);
  assert.match(await readFile(resolve(appRoot,'src/app/api/auth/admin-email-otp/request/route.ts'),'utf8'),/Retry-After/);
  assert.match(await readFile(resolve(appRoot,'src/app/api/auth/admin-email-otp/request/route.ts'),'utf8'),/retryAfter: 60/);
  assert.match(callbackEvidence,/onboarding_completed/);
  assert.match(callbackEvidence,/validCallbackChain/);
  assert.match(callbackEvidence,/server_bound_continuation: true/);
  assert.match(callbackEvidence,/release_qa_run_id/);
  assert.match(fixtureDiscovery,/release_qa_run_id/);
  assert.match(journeys,/executionMode==='machine_only'/);
  assert.match(journeys,/EMAIL_TRANSPORT_WAITING/);
  assert.match(journeys,/auth_callback_mechanics:'PASS'/);
  assert.match(journeys,/qa\.machine\./);
  assert.match(journeys,/createActualEmailCheckpoint/);
  assert.match(journeys,/RELEASE_CRITICAL_ACTUAL_EMAIL_CHECKPOINT_ALREADY_PREPARED/);
  assert.match(journeys,/RELEASE_CRITICAL_STALE_EMAIL_CHECKPOINT_CLEAN/);
  assert.match(journeys,/RELEASE_CRITICAL_EMAIL_CONFIRMATION_UNPROVEN/);
  assert.doesNotMatch(journeys,/pollManualGmailConfirmation\(/);
  assert.match(workflow,/GARAGE_STAGING_E2E_EMAIL/);
  assert.match(workflow,/EMAIL_TRANSPORT_NOT_CONFIGURED/);
  assert.match(workflow,/release-critical-email-transport\.mjs/);
  assert.match(workflow,/email-transport-state:[\s\S]*actions\/checkout@v4/);
  assert.doesNotMatch(workflow,/RELEASE_CRITICAL_PERSISTENT_E2E_/);
  assert.match(journeys,/VEHICLE_CREATE_MATRIX_\$\{state\.toUpperCase\(\)\}/);
  assert.match(journeys,/customer_equivalence:reproduced/);
  assert.match(journeys,/admin_security_requirement/);
  assert.match(journeys,/CTA_MATRIX_STATES/);
  assert.match(journeys,/release_qa_cta_matrix_run_id:run\.runId,release_qa_run_id:run\.runId/);
  for(const state of ['active_owner','active_non_owner','selection_required','onboarding_incomplete','contract_restricted','admin_security_unverified']) assert.match(journeys,new RegExp(`'${state}'`));
  assert.match(journeys,/qa_lifecycle_cta_matrix/);
  assert.match(journeys,/matrixFixtureContractState/);
  assert.match(journeys,/registry-bound lifecycle RPC/);
  assert.match(journeys,/new URL\('\/login',baseUrl\)/);
  assert.match(journeys,/loginUrl\.searchParams\.set\('next','\/vehicles'\)/);
  assert.doesNotMatch(journeys,/E2E_TEST_SUPABASE_ANON_KEY/);
  assert.match(journeys,/RELEASE_CRITICAL_CTA_ACCOUNT_STATE_MATRIX/);
  assert.match(journeys,/customer_equivalence:reproduced\?'ACTIVE_NON_OWNER_REPRODUCED':'NOT_ASSERTED'/);
  assert.match(journeys,/root_cause:reproduced\?'ACTIVE_NON_OWNER_GATE':'NOT_REPRODUCED'/);
  assert.match(ctaMatrixMigration,/qa_internal\.cta_matrix_fixtures/);
  assert.match(ctaMatrixMigration,/qa_lifecycle_cta_matrix/);
  assert.match(ctaMatrixMigration,/grant execute on function public\.qa_lifecycle_cta_matrix\(uuid,text,jsonb\) to service_role/);
  assert.doesNotMatch(ctaMatrixMigration,/disable\s+trigger|session_replication_role|grant\s+(?:all|select|insert|update|delete)\b[^;]*\bto\s+(?:anon|authenticated)/i);
  assert.match(ctaMatrixRollback,/drop function if exists public\.qa_lifecycle_cta_matrix\(uuid,text,jsonb\)/);
  assert.doesNotMatch(ctaMatrixRollback,/disable\s+trigger|session_replication_role/i);
  assert.match(adminOtpServer,/release_qa_run_id/);
  assert.match(adminOtpServer,/RELEASE_QA_RUN_ID/);
  assert.doesNotMatch(callbackEvidence,/PRODUCTION_PROJECT_ID/);
  assert.match(middleware,/pathname === '\/api\/qa\/callback-evidence'/);
  assert.match(middleware,/pathname === '\/api\/qa\/fixture-discovery'/);
});

test('Vercel bypass carries the issued cookie once for a same-origin same-path redirect',async()=>{
  const calls=[];
  const url=new URL('https://garage-link-staging.example.vercel.app/api/qa/provenance');
  const headers={'x-vercel-protection-bypass':'secret'};
  const result=await fetchVerifiedVercelRequest(url,headers,async(requestUrl,requestOptions)=>{
    calls.push({url:String(requestUrl),options:requestOptions});
    if(calls.length===1)return new Response(null,{status:307,headers:{location:`${url}?__vercel_retry=1`,'set-cookie':'__vercel_bypass=issued; Path=/; HttpOnly'}});
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
  });
  assert.equal(result.initial.same_origin,true);
  assert.equal(result.initial.same_path,true);
  assert.equal(result.response.status,200);
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.headers,headers);
  assert.equal(calls[1].options.headers['x-vercel-protection-bypass'],'secret');
  assert.equal(calls[1].options.headers.cookie,'__vercel_bypass=issued');
  assert.ok(calls.every(call=>call.options.redirect==='manual'));
});

test('Vercel bypass preserves a marker-bound POST body across its one safe retry',async()=>{
  const calls=[];
  const url=new URL('https://garage-link-staging.example.vercel.app/api/qa/fixture-discovery');
  const result=await fetchVerifiedVercelRequest(url,{'x-vercel-protection-bypass':'secret'},async(requestUrl,requestOptions)=>{
    calls.push({url:String(requestUrl),options:requestOptions});
    if(calls.length===1)return new Response(null,{status:307,headers:{location:`${url}?__vercel_retry=1`,'set-cookie':'__vercel_bypass=issued; Path=/; HttpOnly'}});
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
  },{method:'POST',body:'{"email_marker":"garage-link-01234567-89ab-4cde-8123-456789abcdef"}'});
  assert.equal(result.response.status,200);
  assert.equal(calls.length,2);
  assert.equal(calls[1].options.method,'POST');
  assert.equal(calls[1].options.body,calls[0].options.body);
  assert.match(calls[1].options.headers.cookie,/__vercel_bypass=issued/);
});

test('browser bypass is scoped to the exact Staging deployment origin',async()=>{
  let matcher; let handler;
  const context={route:async(nextMatcher,nextHandler)=>{matcher=nextMatcher;handler=nextHandler;}};
  await installVercelBrowserBypass(context,'https://garage-link-staging-candidate-altos-projects-fa55063c.vercel.app','test-secret');
  assert.equal(matcher(new URL('https://garage-link-staging-candidate-altos-projects-fa55063c.vercel.app/signup')),true);
  assert.equal(matcher(new URL('https://gaytoojzwqkpuvfofeql.supabase.co/auth/v1/signup')),false);
  assert.equal(matcher(new URL('https://garage-link.tech/signup')),false);
  let continued;
  await handler({request:()=>({headers:()=>({accept:'text/html'})}),continue:async options=>{continued=options;}});
  assert.equal(continued.headers.accept,'text/html');
  assert.equal(continued.headers['x-vercel-protection-bypass'],'test-secret');
  assert.equal(continued.headers['x-vercel-set-bypass-cookie'],'true');
});

test('Vercel bypass does not follow a cross-origin redirect',async()=>{
  const calls=[];
  const result=await fetchVerifiedVercelRequest(new URL('https://garage-link-staging.example.vercel.app/api/qa/provenance'),{},async(url,options)=>{
    calls.push({url:String(url),options});
    return new Response(null,{status:307,headers:{location:'https://vercel.com/login'}});
  });
  assert.equal(result.initial.same_origin,false);
  assert.equal(calls.length,1);
  assert.equal(result.response.status,307);
});

test('Management API diagnosis reads profile once and follows only a same-origin canonical Auth redirect',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).endsWith('/v1/profile'))return new Response('{}',{status:200});
    if(String(url).endsWith('/config/auth'))return new Response(null,{status:307,headers:{location:`${String(url)}/`}});
    if(String(url).endsWith('/config/auth/'))return new Response(JSON.stringify({password_min_length:6}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error('unexpected request');
  };
  const profile=await readManagementProfile('secret',fetchImpl);
  assert.equal(profile.status,200);
  const auth=await readAuthConfig('gaytoojzwqkpuvfofeql','secret',fetchImpl);
  assert.equal(auth.initial.status,307);
  assert.deepEqual(auth.initial.location,{origin:'https://api.supabase.com',pathname:'/v1/projects/gaytoojzwqkpuvfofeql/config/auth/'});
  assert.equal(auth.initial.same_origin,true);
  assert.equal(auth.initial.same_path,false);
  assert.equal(auth.config.password_min_length,6);
  assert.equal(calls.length,3);
  assert.ok(calls.every(call=>call.options.redirect==='manual'));
  assert.ok(calls.every(call=>call.options.headers.authorization==='Bearer secret'));
});

test('Management API diagnosis fails closed without forwarding Authorization across origins',async()=>{
  const calls=[];
  await assert.rejects(()=>readAuthConfig('gaytoojzwqkpuvfofeql','secret',async(url,options)=>{
    calls.push({url:String(url),options});
    return new Response(null,{status:307,headers:{location:'https://example.invalid/config/auth'}});
  }),/SUPABASE_MANAGEMENT_REDIRECT_UNSAFE/);
  assert.equal(calls.length,1);
});

test('Manual Gmail Bridge creates a plus address, redacts checkpoints, and polls Auth confirmation',async()=>{
  const marker='g123456';
  const session=createManualGmailSession('Owner.Name+old@kannagi-co.com',marker);
  assert.equal(session.emailAddress,'owner.name+g123456@kannagi-co.com');
  const exactSession=createManualGmailSession('Owner.Name+old@kannagi-co.com',marker,{plusAddressing:false});
  assert.equal(exactSession.emailAddress,'owner.name@kannagi-co.com');
  assert.equal(exactSession.plusAddressing,false);
  assert.deepEqual(manualGmailCheckpoint(session,'signup'),{state:'MANUAL_GMAIL_CHECKPOINT_SIGNUP',email_mode:'manual_gmail',run_marker:marker,recipient:'REDACTED_MANUAL_GMAIL_ADDRESS',operator_action:'Open the matching Staging-only Gmail message and click its Supabase confirmation link.'});
  assert.equal(manualGmailCheckpoint(session,'recovery').state,'MANUAL_GMAIL_CHECKPOINT_RESET');
  const admin={auth:{admin:{getUserById:async()=>({data:{user:{email:session.emailAddress,email_confirmed_at:'2026-08-10T00:00:00.000Z'}},error:null})}}};
  assert.deepEqual(await pollManualGmailConfirmation({admin,userId:'staging-user',session,purpose:'signup'}),{state:'MANUAL_GMAIL_CONFIRMED',email_mode:'manual_gmail',run_marker:marker,purpose:'signup'});
  const requestedAt='2026-08-10T00:00:00.000Z';
  const resetAdmin={auth:{admin:{getUserById:async()=>({data:{user:{email:session.emailAddress,email_confirmed_at:'2026-08-10T00:00:00.000Z',updated_at:'2026-08-10T00:00:01.000Z'}},error:null})}}};
  assert.deepEqual(await pollManualGmailConfirmation({admin:resetAdmin,userId:'staging-user',session,purpose:'recovery',requestedAt}),{state:'MANUAL_GMAIL_CONFIRMED',email_mode:'manual_gmail',run_marker:marker,purpose:'recovery'});
  await assert.rejects(()=>pollManualGmailConfirmation({admin:{auth:{admin:{getUserById:async()=>({data:{user:{email:session.emailAddress,email_confirmed_at:'2026-08-10T00:00:00.000Z',updated_at:requestedAt}},error:null})}}},userId:'staging-user',session,purpose:'recovery',requestedAt,timeoutMs:0}),/MANUAL_GMAIL_CHECKPOINT_TIMEOUT:recovery/);
  assert.throws(()=>createManualGmailSession('not an email',marker),/MANUAL_GMAIL_PLUS_ADDRESS_UNAVAILABLE/);
  const actual=createActualEmailTransportSession('Owner.Name+old@kannagi-co.com',marker);
  assert.equal(actual.emailAddress,'owner.name@kannagi-co.com');
  assert.equal(actual.plusAddressing,false);
  assert.equal(actual.recipient,'REDACTED_APPROVED_QA_MAILBOX');
  for(const address of ['qa@example.invalid','qa@example.com','qa@example.net','qa@example.org','qa@localhost','qa@node.localhost','qa@mailinator.com']){
    assert.throws(()=>validateActualEmailTransportRecipient(address),/EMAIL_TRANSPORT_NOT_CONFIGURED:NON_DELIVERABLE_RECIPIENT/);
  }
  assert.deepEqual(validateActualEmailTransportRecipient('Release.QA@kannagi-co.com'),{emailAddress:'release.qa@kannagi-co.com',recipient:'REDACTED_APPROVED_QA_MAILBOX',plusAddressing:false});
  assert.equal(await releaseCriticalBaseUrl('/github/event.json','https://fallback.invalid',async()=>JSON.stringify({inputs:{staging_base_url:'https://garage-link-staging-3ilbylboz-altos-projects-fa55063c.vercel.app'}})),'https://garage-link-staging-3ilbylboz-altos-projects-fa55063c.vercel.app/');
  await assert.rejects(()=>releaseCriticalBaseUrl('/github/event.json','https://fallback.invalid',async()=>JSON.stringify({inputs:{staging_base_url:'https://example.invalid'}})),/RELEASE_CRITICAL_STAGING_BASE_URL_DENIED/);
});

test('release-critical journeys accept only the Staging runtime and marker-bound synthetic fixtures',()=>{
  const run=createReleaseCriticalRun('550e8400-e29b-41d4-a716-446655440000');
  assert.equal(run.marker,'[RELEASE QA 20260811]');
  assert.equal(run.emailMarker,'g550e84');
  assert.match(releaseCriticalSyntheticPassword(run.emailMarker),/^GL-[a-z0-9-]+-8!$/);
  assert.deepEqual(validateReleaseCriticalProvenance({
    project_id:'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3',deployment_id:'dpl_Abc123',git_commit_sha:'d7974d6b9adc78064010cc6b4502f54adbc39ba5',git_commit_ref:'codex/garage-link-supabase-redirect-rca',deployment_url:'https://garage-link-staging-test.vercel.app',environment:'preview',
  },'https://garage-link-staging-test.vercel.app'),{
    projectId:'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3',deploymentId:'dpl_Abc123',sourceSha:'d7974d6b9adc78064010cc6b4502f54adbc39ba5',branch:'codex/garage-link-supabase-redirect-rca',deploymentUrl:'https://garage-link-staging-test.vercel.app',
  });
  assert.throws(()=>validateReleaseCriticalProvenance({
    project_id:'prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64',deployment_id:'dpl_Abc123',git_commit_sha:'d7974d6b9adc78064010cc6b4502f54adbc39ba5',git_commit_ref:'main',deployment_url:'https://garage-link.tech',environment:'production',
  },'https://garage-link.tech'),/RELEASE_CRITICAL_PROVENANCE_DENIED/);
});

test('actual-email checkpoint binds one recipient to the exact run and deployment without storing an address',()=>{
  const run=createReleaseCriticalRun('550e8400-e29b-41d4-a716-446655440000');
  const provenance={sourceSha:'d7974d6b9adc78064010cc6b4502f54adbc39ba5',deploymentId:'dpl_Abc123'};
  const checkpoint=createActualEmailCheckpoint({run,provenance,userId:'staging-user',emailAddress:'release.qa@kannagi-co.com',generatedAt:'2026-08-13T10:00:00.000Z',recoveryRequestedAt:'2026-08-13T10:00:01.000Z'});
  assert.equal(checkpoint.state,'PREPARED');
  assert.equal(checkpoint.run_id,run.runId);
  assert.equal(checkpoint.candidate_sha,provenance.sourceSha);
  assert.equal(checkpoint.deployment_id,provenance.deploymentId);
  assert.equal('emailAddress' in checkpoint,false);
  assert.match(checkpoint.recipient_sha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(validateActualEmailCheckpoint(checkpoint,{run,provenance,userId:'staging-user',emailAddress:'release.qa@kannagi-co.com'}),checkpoint);
  assert.throws(()=>validateActualEmailCheckpoint(checkpoint,{run,provenance,userId:'staging-user',emailAddress:'other@kannagi-co.com'}),/RELEASE_CRITICAL_EMAIL_CHECKPOINT_MISMATCH/);
});

test('an interrupted registered fixture resumes only its formal cleanup states',()=>{
  for(const state of ['TEST_COMPLETE','TEARDOWN_DRY_RUN','TEARDOWN_READY','TEARING_DOWN','DB_CLEANED','AUTH_CLEANED','STORAGE_CLEANED','ARTIFACTS_CLEANED','VERIFIED_CLEAN'])assert.equal(isLifecycleCleanupResumableState(state),true);
  for(const state of ['CREATED','PREFLIGHT_READY','PROVISIONING','PROVISIONED','AUTH_READY','TEST_RUNNING','FAILED_RECOVERABLE','COMPLETE'])assert.equal(isLifecycleCleanupResumableState(state),false);
});

test('interrupted lifecycle recovery registers a missing run before it is reused',async()=>{
  const calls=[];
  const statusLife={
    maybeStatus:async()=>{calls.push('maybe');return null;},
    status:async()=>{calls.push('status');return {state:'PROVISIONING'};},
  };
  const recovered=await recoverableLifecycleStatus(statusLife,async()=>{calls.push('begin');});
  assert.deepEqual(calls,['maybe','begin','status']);
  assert.deepEqual(recovered,{state:'PROVISIONING'});
});

test('actual-email reruns recover only a run-bound address conflict through lifecycle cleanup',async()=>{
  const journeys=await readFile(resolve(appRoot,'scripts/qa/release-critical-journeys.mjs'),'utf8');
  assert.match(journeys,/recoverAddressBoundActualEmailFixture/);
  assert.match(journeys,/release_qa_run_id/);
  assert.match(journeys,/RELEASE_CRITICAL_MANUAL_GMAIL_ADDRESS_CONFLICT_UNBOUND/);
  assert.match(journeys,/RELEASE_CRITICAL_ADDRESS_BOUND_FIXTURE_RECOVERY_PASS/);
  assert.match(journeys,/await cleanupLifecycle\(recovered\.life,admin,user\.id,run\.runId\)/);
});

test('manual Gmail emails are sent only when the exact Staging callback is directly reachable',async()=>{
  const base='https://garage-link-staging-test-altos-projects-fa55063c.vercel.app';
  const pass=await verifyManualGmailCallbackReach(base,async(url,options)=>{
    assert.equal(options.redirect,'manual');
    assert.equal(new URL(url).pathname,'/auth/callback');
    return new Response('<html/>',{status:200});
  });
  assert.deepEqual(pass,{state:'MANUAL_GMAIL_CALLBACK_REACH_PASS',http_status:200,redirect:false});
  await assert.rejects(()=>verifyManualGmailCallbackReach(base,async()=>new Response('',{status:302,headers:{location:'https://vercel.com/sso-api'}})),/MANUAL_GMAIL_CALLBACK_UNREACHED:302/);
});

test('auth-only lifecycle abort is limited to an unadopted provisioning run',()=>{
  assert.equal(isAuthOnlyLifecycleAbortEligible({state:'PROVISIONING',fixtures:[]}),true);
  assert.equal(isAuthOnlyLifecycleAbortEligible({state:'PROVISIONING',fixtures:[{fixture_type:'release'}]}),false);
  assert.equal(isAuthOnlyLifecycleAbortEligible({state:'TEST_RUNNING',fixtures:[]}),false);
});

test('expired cleanup reclaim only resets registered pre-delete lifecycle states',()=>{
  for(const state of ['TEST_COMPLETE','TEARDOWN_DRY_RUN','TEARDOWN_READY','TEARING_DOWN'])assert.equal(isExpiredLifecycleReclaimState(state),true);
  for(const state of ['CREATED','PREFLIGHT_READY','PROVISIONING','PROVISIONED','AUTH_READY','TEST_RUNNING','DB_CLEANED','AUTH_CLEANED','STORAGE_CLEANED','ARTIFACTS_CLEANED','VERIFIED_CLEAN','COMPLETE'])assert.equal(isExpiredLifecycleReclaimState(state),false);
});

test('CTA trace separates pointer non-delivery, route redirects, and runtime errors',()=>{
  assert.equal(classifyCtaTrace({pointerClickDelivered:false,domClick:false,expected:false,navigationRequestCount:0,runtimeErrorCount:0,initialPath:'/vehicles',finalPath:'/vehicles'}),'CLICK_NOT_FIRED');
  assert.equal(classifyCtaTrace({pointerClickDelivered:true,domClick:true,expected:false,navigationRequestCount:1,runtimeErrorCount:0,initialPath:'/vehicles',finalPath:'/onboarding'}),'ROUTE_STARTED_REDIRECTED');
  assert.equal(classifyCtaTrace({pointerClickDelivered:true,domClick:true,expected:false,navigationRequestCount:0,runtimeErrorCount:0,initialPath:'/vehicles',finalPath:'/vehicles'}),'CLICK_FIRED_ROUTER_UNOBSERVED');
  assert.equal(classifyCtaTrace({pointerClickDelivered:true,domClick:true,expected:true,navigationRequestCount:1,runtimeErrorCount:0,initialPath:'/vehicles',finalPath:'/vehicles/new'}),'PASS');
  assert.equal(classifyCtaTrace({pointerClickDelivered:true,domClick:true,expected:true,navigationRequestCount:1,runtimeErrorCount:1,initialPath:'/vehicles',finalPath:'/vehicles/new'}),'RUNTIME_ERROR');
});

test('normal release runs fail closed on Hosted Auth and client redirect drift without a Management PAT',()=>{
  const project='https://gaytoojzwqkpuvfofeql.supabase.co';
  const expected='https://garage-link-staging-test.vercel.app/auth/callback?next=%2Fsignup%3Fresume%3D1';
  const action=`${project}/auth/v1/verify?token=redacted&type=recovery&redirect_to=${encodeURIComponent(expected)}`;
  assert.deepEqual(validateHostedGeneratedLink(action,expected,project),{origin:'https://garage-link-staging-test.vercel.app',path:'/auth/callback',localhost:false});
  assert.deepEqual(validateClientAuthRedirect(`${project}/auth/v1/signup?redirect_to=${encodeURIComponent(expected)}`,expected,project),{origin:'https://garage-link-staging-test.vercel.app',path:'/auth/callback'});
  assert.throws(()=>validateHostedGeneratedLink(`${project}/auth/v1/verify?redirect_to=${encodeURIComponent('http://localhost:3000/auth/callback')}`,expected,project),/RELEASE_CRITICAL_HOSTED_AUTH_REDIRECT_DRIFT/);
  assert.throws(()=>validateClientAuthRedirect(`${project}/auth/v1/signup?redirect_to=${encodeURIComponent('http://localhost:3000/auth/callback')}`,expected,project),/RELEASE_CRITICAL_CLIENT_REDIRECT_INVALID:LOCALHOST/);
  assert.throws(()=>validateClientAuthRedirect(`${project}/auth/v1/signup?redirect_to=${encodeURIComponent('https://garage-link-staging-test.vercel.app/auth/callback?next=%2Fsignup')}`,expected,project),/RELEASE_CRITICAL_CLIENT_REDIRECT_INVALID:QUERY/);
});

test('hosted Auth update is Staging-only and requires password plus confirmation read-back',async()=>{
  const calls=[];
  await applyStagingPasswordMinimum('token',async(url,options)=>{
    calls.push({url:String(url),options});
    if(options.method==='PATCH')return new Response('{}',{status:200});
    return new Response(JSON.stringify({password_min_length:8,mailer_autoconfirm:false,site_url:'https://garage-link-staging-nextdial01-altos-projects-fa55063c.vercel.app',uri_allow_list:'https://*-altos-projects-fa55063c.vercel.app/**'}),{status:200,headers:{'content-type':'application/json'}});
  },'https://garage-link-staging-test-altos-projects-fa55063c.vercel.app');
  assert.equal(calls.length,3);
  assert.equal(calls[1].options.method,'PATCH');
  assert.deepEqual(JSON.parse(calls[1].options.body),{password_min_length:8,mailer_autoconfirm:false,site_url:'https://garage-link-staging-nextdial01-altos-projects-fa55063c.vercel.app',uri_allow_list:'https://*-altos-projects-fa55063c.vercel.app/**'});
  assert.ok(calls.every(call=>call.url.includes('gaytoojzwqkpuvfofeql')));
  await assert.rejects(()=>applyStagingPasswordMinimum('token',async()=>new Response(JSON.stringify({password_min_length:8,mailer_autoconfirm:true}),{status:200,headers:{'content-type':'application/json'}}),'https://garage-link-staging-test-altos-projects-fa55063c.vercel.app'),/STAGING_AUTH_CONTRACT_READBACK_FAILED/);
});

test('hosted Auth contract preserves non-local redirects but removes localhost fallbacks',async()=>{
  const calls=[];
  await applyStagingPasswordMinimum('token',async(url,options)=>{
    calls.push({url:String(url),options});
    if(options.method==='PATCH')return new Response('{}',{status:200});
    const firstRead=calls.length===1;
    return new Response(JSON.stringify({password_min_length:8,mailer_autoconfirm:false,site_url:firstRead?'https://garage-link-staging-test.vercel.app':'https://garage-link-staging-nextdial01-altos-projects-fa55063c.vercel.app',uri_allow_list:firstRead?'http://localhost:3000,https://external.example/callback,https://garage-link-staging-test.vercel.app/auth/callback,https://garage-link-staging-old.vercel.app/auth/callback**':'https://external.example/callback,https://*-altos-projects-fa55063c.vercel.app/**'}),{status:200,headers:{'content-type':'application/json'}});
  },'https://garage-link-staging-test-altos-projects-fa55063c.vercel.app');
  assert.equal(JSON.parse(calls[1].options.body).uri_allow_list,'https://external.example/callback,https://*-altos-projects-fa55063c.vercel.app/**');
});

test('hosted Auth contract reads the local additional_redirect_urls alias but PATCHes the Management API uri_allow_list field',async()=>{
  const calls=[];
  await applyStagingPasswordMinimum('token',async(url,options)=>{
    calls.push({url:String(url),options});
    if(options.method==='PATCH')return new Response('{}',{status:200});
    return new Response(JSON.stringify({password_min_length:8,mailer_autoconfirm:false,site_url:'https://garage-link-staging-nextdial01-altos-projects-fa55063c.vercel.app',additional_redirect_urls:'https://*-altos-projects-fa55063c.vercel.app/**',uri_allow_list:'https://*-altos-projects-fa55063c.vercel.app/**'}),{status:200,headers:{'content-type':'application/json'}});
  },'https://garage-link-staging-test-altos-projects-fa55063c.vercel.app');
  const payload=JSON.parse(calls[1].options.body);
  assert.equal(payload.uri_allow_list,'https://*-altos-projects-fa55063c.vercel.app/**');
  assert.equal(payload.additional_redirect_urls,undefined);
});

test('hosted Auth contract compacts stale Staging preview callbacks before the Management PATCH',async()=>{
  const calls=[];
  const stale=Array.from({length:24},(_,index)=>`https://garage-link-staging-${index.toString(16).padStart(8,'a')}.vercel.app/auth/callback**`).join(',');
  await applyStagingPasswordMinimum('token',async(url,options)=>{
    calls.push({url:String(url),options});
    if(options.method==='PATCH')return new Response('{}',{status:200});
    return new Response(JSON.stringify({password_min_length:8,mailer_autoconfirm:false,site_url:calls.length===1?'https://garage-link-staging-test.vercel.app':'https://garage-link-staging-nextdial01-altos-projects-fa55063c.vercel.app',uri_allow_list:calls.length===1?stale:'https://*-altos-projects-fa55063c.vercel.app/**'}),{status:200,headers:{'content-type':'application/json'}});
  },'https://garage-link-staging-test-altos-projects-fa55063c.vercel.app');
  assert.equal(JSON.parse(calls[1].options.body).uri_allow_list,'https://*-altos-projects-fa55063c.vercel.app/**');
});

test('CTA matrix contract requires the one-time external bootstrap when readiness is absent',async()=>{
  await assert.rejects(()=>ensureReleaseCriticalCtaMatrix({
    supabaseUrl:'https://gaytoojzwqkpuvfofeql.supabase.co',serviceRole:'staging-only-service-role',
    createClientImpl:()=>({rpc:async()=>({data:{ready:false},error:null})}),
  }),/CTA_MATRIX_BOOTSTRAP_REQUIRED:READBACK/);
});

test('CTA matrix contract is Management-PAT-independent after the external Staging bootstrap',async()=>{
  const result=await ensureReleaseCriticalCtaMatrix({
    supabaseUrl:'https://gaytoojzwqkpuvfofeql.supabase.co',serviceRole:'staging-only-service-role',
    createClientImpl:()=>({rpc:async()=>({data:{ready:true,private_schema:true,last_owner_guard_enabled:true,public_execute_count:0,service_execute_count:15,cta_matrix:'registry_bound',expired_release_recovery:'service_role_only'},error:null})}),
  });
  assert.deepEqual(result,{state:'RELEASE_CRITICAL_QA_MATRIX_READY',bootstrap:'EXTERNAL_ADMIN_ONETIME',management_pat_required:false,readiness:{ready:true,cta_matrix:'registry_bound',private_schema:true,last_owner_guard_enabled:true,public_execute_count:0,service_execute_count:15,expired_release_recovery:'service_role_only'}});
});

test('CTA matrix contract rejects incomplete service-role security read-back',async()=>{
  await assert.rejects(()=>ensureReleaseCriticalCtaMatrix({
    supabaseUrl:'https://gaytoojzwqkpuvfofeql.supabase.co',serviceRole:'staging-only-service-role',
    createClientImpl:()=>({rpc:async()=>({data:{ready:true,private_schema:true,last_owner_guard_enabled:true,public_execute_count:1,service_execute_count:15,cta_matrix:'registry_bound',expired_release_recovery:'service_role_only'},error:null})}),
  }),/CTA_MATRIX_BOOTSTRAP_REQUIRED:READBACK/);
});
