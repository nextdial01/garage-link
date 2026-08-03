import { createClient } from '@supabase/supabase-js';

const projectRef = 'gaytoojzwqkpuvfofeql';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!url.includes(projectRef) || !key) throw new Error('STAGING_SERVICE_ROLE_UNAVAILABLE_OR_PROJECT_MISMATCH');

const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (error) throw error;
const users = data.users.filter((user) => user.email?.toLowerCase().startsWith('ux.qa.20260803.'));
const user = users.find((candidate) => candidate.email?.toLowerCase().endsWith('.invalid'));
if (!user) throw new Error('CANONICAL_QA_OWNER_NOT_FOUND');

const sessionId = '00000000-0000-0000-0000-000000000001';
const [{ data: adminContext, error: adminError }, { data: releaseContext, error: releaseError }] = await Promise.all([
  service.rpc('admin_email_otp_bootstrap_context', { p_user_id: user.id, p_session_id: sessionId }),
  service.rpc('release_qa_admin_bootstrap_context', { p_user_id: user.id, p_session_id: sessionId, p_environment: 'preview' }),
]);
if (adminError) throw adminError;
if (releaseError) throw releaseError;

process.stdout.write(`${JSON.stringify({
  project_ref: projectRef,
  canonical_user_unique: users.filter((candidate) => candidate.email?.toLowerCase().endsWith('.invalid')).length === 1,
  email_invalid_marker: user.email?.toLowerCase().endsWith('.invalid') ?? false,
  app_metadata_purpose: user.app_metadata?.purpose ?? null,
  general_admin_context_present: Boolean(adminContext),
  general_admin_role: adminContext?.role ?? null,
  preview_release_context_present: Boolean(releaseContext),
  known_tenant_store_marker: '[UX QA 20260803]',
  required_release_marker: '[RELEASE QA]',
})}\n`);
