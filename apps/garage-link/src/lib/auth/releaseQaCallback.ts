import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'garage-link-release-qa-run';
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReleaseQaCallbackPhase = 'callback' | 'arrival' | 'store_created' | 'password_updated';

export function releaseQaRunId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return RUN_ID.test(normalized) ? normalized.toLowerCase() : null;
}

export function releaseQaNextPath(path: string, runId: string | null): string {
  if (!runId) return path;
  const url = new URL(path, 'https://garage-link.invalid');
  url.searchParams.set('qa_run', runId);
  return `${url.pathname}${url.search}`;
}

export function rememberReleaseQaRun(runId: string | null) {
  if (!runId || typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORAGE_KEY, runId);
}

export function rememberedReleaseQaRun(): string | null {
  if (typeof window === 'undefined') return null;
  return releaseQaRunId(window.sessionStorage.getItem(STORAGE_KEY));
}

export async function recordReleaseQaCallback(runId: string | null, phase: ReleaseQaCallbackPhase, nextPath: string): Promise<boolean> {
  if (!runId) return false;
  const { data, error } = await createClient().auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) throw error ?? new Error('RELEASE_QA_CALLBACK_SESSION_MISSING');
  const response = await fetch('/api/qa/callback-evidence', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ run_id: runId, phase, next_path: nextPath }),
    cache: 'no-store',
  });
  // The evidence route is deliberately absent from Production. A forged
  // qa_run query parameter must never make a real user's callback fail.
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`RELEASE_QA_CALLBACK_EVIDENCE_FAILED:${response.status}`);
  return true;
}
