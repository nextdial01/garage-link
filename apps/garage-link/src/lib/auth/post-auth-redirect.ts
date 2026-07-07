type PostAuthQueryResult = {
  data: { store_id?: string; onboarding_completed_at?: string | null } | null;
};

type PostAuthSupabaseClient = {
  from: (relation: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<PostAuthQueryResult>;
      };
    };
  };
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
  userId: string,
  options: PostAuthRedirectOptions = {}
): Promise<string> {
  const nextPath = normalizeNextPath(options.nextPath);

  const { data: member } = await supabase
    .from('store_members')
    .select('store_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!member?.store_id) {
    return '/signup?resume=1';
  }

  const { onboardingCompleted } = await fetchStoreOnboardingStatus(supabase, member.store_id);

  if (!onboardingCompleted) {
    return '/onboarding';
  }

  return nextPath ?? '/dashboard';
}
