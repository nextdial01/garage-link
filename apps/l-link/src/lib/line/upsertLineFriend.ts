import 'server-only';
import type { LLinkSupabase } from '@/lib/supabase/server';
import { getLineProfile } from './getLineProfile';
import { sanitizeErrorMessage } from './security';

export type UpsertLineFriendInput = {
  supabase: LLinkSupabase;
  companyId: string;
  lineAccountId: string;
  lineUserId: string;
  channelAccessToken?: string | null;
  eventType: 'follow' | 'message' | 'unfollow' | 'postback';
  messageText?: string | null;
  receivedAt?: string;
};

export async function ensureFriendProfile({
  supabase,
  companyId,
  lineFriendId,
}: {
  supabase: LLinkSupabase;
  companyId: string;
  lineFriendId: string;
}) {
  await supabase.from('ll_friend_profiles').upsert(
    {
      company_id: companyId,
      line_friend_id: lineFriendId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'line_friend_id' }
  );
}

export async function upsertLineFriend({
  supabase,
  companyId,
  lineAccountId,
  lineUserId,
  channelAccessToken,
  eventType,
  messageText,
  receivedAt = new Date().toISOString(),
}: UpsertLineFriendInput) {
  const existing = await supabase
    .from('ll_line_friends')
    .select('id, display_name, profile_fetched_at')
    .eq('company_id', companyId)
    .eq('line_account_id', lineAccountId)
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  const baseUpdate: Record<string, string | null> = {
    company_id: companyId,
    line_account_id: lineAccountId,
    line_user_id: lineUserId,
    last_interaction_at: receivedAt,
    updated_at: receivedAt,
  };

  if (eventType === 'follow') {
    baseUpdate.friend_status = 'active';
    baseUpdate.followed_at = receivedAt;
  }

  if (eventType === 'message') {
    baseUpdate.last_message_at = receivedAt;
    baseUpdate.last_message_text = messageText?.slice(0, 1000) ?? null;
  }

  if (eventType === 'unfollow') {
    baseUpdate.friend_status = 'unfollowed';
    baseUpdate.unfollowed_at = receivedAt;
  }

  const shouldFetchProfile = eventType === 'follow' || !existing.data?.display_name || !existing.data?.profile_fetched_at;
  if (shouldFetchProfile && eventType !== 'unfollow') {
    try {
      const { profile, error } = await getLineProfile({ channelAccessToken, lineUserId });
      baseUpdate.profile_fetched_at = receivedAt;
      baseUpdate.profile_fetch_error = error;

      if (profile) {
        baseUpdate.display_name = profile.displayName ?? null;
        baseUpdate.picture_url = profile.pictureUrl ?? null;
        baseUpdate.status_message = profile.statusMessage ?? null;
        baseUpdate.language = profile.language ?? null;
      }
    } catch {
      baseUpdate.profile_fetched_at = receivedAt;
      baseUpdate.profile_fetch_error = 'profile_fetch_failed';
    }
  }

  const { data, error } = await supabase
    .from('ll_line_friends')
    .upsert(baseUpdate, { onConflict: 'company_id,line_account_id,line_user_id' })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(sanitizeErrorMessage(error));
  }

  await ensureFriendProfile({ supabase, companyId, lineFriendId: data.id });

  return data;
}
