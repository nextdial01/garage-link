type PostAuthQueryResult = {
  data: { onboarding_completed_at?: string | null } | null;
};

type PostAuthSupabaseClient = {
  from: (relation: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<PostAuthQueryResult>;
      };
    };
  };
  rpc: (
    functionName: string,
    args: Record<string, never>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

import { fetchStoreOnboardingStatus } from '@/lib/auth/store-onboarding';

export type PostAuthRedirectOptions = {
  /** ログイン後に戻したいパス（/login 等は無視） */
  nextPath?: string | null;
};

const IGNORED_NEXT_PATHS = new Set(['/login', '/signup', '/forgot-password', '/']);

function normalizeNextPath(nextPath?: string | null): string | null {
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return null;
  }
  if (IGNORED_NEXT_PATHS.has(nextPath)) {
    return null;
  }
  return nextPath;
}

/**
 * 認証済みユーザーの遷移先を決定する。
 * - 店舗未作成 → /signup（店舗作成フロー）
 * - オンボーディング未完了 → /onboarding
 * - 完了済み → nextPath または /dashboard
 */
export async function resolvePostAuthPath(
  supabase: PostAuthSupabaseClient,
  _userId: string,
  options: PostAuthRedirectOptions = {}
): Promise<string> {
  const nextPath = normalizeNextPath(options.nextPath);

  const { data: rawContext, error: scopeError } = await supabase.rpc(
    'get_garage_ui_context_v2',
    {}
  );
  const context = rawContext && typeof rawContext === 'object' && !Array.isArray(rawContext)
    ? rawContext as { state?: string; store_id?: string }
    : null;

  if (scopeError || !context || context.state === 'no_access') {
    return '/signup?resume=1';
  }

  if (context.state === 'selection_required' || !context.store_id) {
    return nextPath ?? '/dashboard';
  }

  const { onboardingCompleted } = await fetchStoreOnboardingStatus(supabase, context.store_id);

  if (!onboardingCompleted) {
    return '/onboarding';
  }

  return nextPath ?? '/dashboard';
}
