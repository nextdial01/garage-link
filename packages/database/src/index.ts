import { createClient } from '@supabase/supabase-js';

export type SupabaseEnv = {
  url: string;
  anonKey: string;
};

export type CompanyScopedRow = {
  company_id: string;
};

export type LLinkLineAccountRow = CompanyScopedRow & {
  id: string;
  account_name: string | null;
  channel_id: string | null;
  basic_id: string | null;
  webhook_url: string | null;
  is_connected: boolean;
};

export type LLinkFriendRow = CompanyScopedRow & {
  id: string;
  line_account_id: string;
  line_user_id: string;
  display_name: string | null;
  friend_status: string;
};

export function createSharedSupabaseClient({ url, anonKey }: SupabaseEnv) {
  return createClient(url, anonKey);
}
