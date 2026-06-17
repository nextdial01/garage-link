import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export type LLinkSupabase = SupabaseClient;

export function createLLinkServiceClient(): LLinkSupabase | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.L_LINK_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.L_LINK_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getDemoCompanyId() {
  return process.env.L_LINK_DEMO_COMPANY_ID ?? null;
}

export async function createLLinkUserClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.L_LINK_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.L_LINK_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(
                name,
                value,
                options as Parameters<typeof cookieStore.set>[2],
              );
            });
          } catch (error) {
            void error;
          }
        },
      },
    },
  );
}

export type CurrentLLinkCompany = {
  companyId: string;
  userId: string | null;
  role: string | null;
  source: 'll_staff_roles' | 'store_members' | 'demo_env';
};

export async function getCurrentLLinkCompany(): Promise<CurrentLLinkCompany | null> {
  const service = createLLinkServiceClient();
  const demoCompanyId = getDemoCompanyId();

  const userClient = await createLLinkUserClient();
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData.user?.id ?? null;

  if (!service) {
    return demoCompanyId
      ? { companyId: demoCompanyId, userId, role: null, source: 'demo_env' }
      : null;
  }

  if (userId) {
    const { data: lLinkRole } = await service
      .from('ll_staff_roles')
      .select('company_id, role')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (lLinkRole?.company_id) {
      return {
        companyId: lLinkRole.company_id as string,
        userId,
        role: (lLinkRole.role as string | null) ?? null,
        source: 'll_staff_roles',
      };
    }

    const { data: storeMember } = await service
      .from('store_members')
      .select('store_id, role')
      .eq('user_id', userId)
      .in('status', ['active', 'member'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (storeMember?.store_id) {
      return {
        companyId: storeMember.store_id as string,
        userId,
        role: (storeMember.role as string | null) ?? null,
        source: 'store_members',
      };
    }
  }

  return demoCompanyId
    ? { companyId: demoCompanyId, userId, role: null, source: 'demo_env' }
    : null;
}

export async function getPrimaryLineAccount(companyId?: string | null) {
  const supabase = createLLinkServiceClient();

  if (!supabase || !companyId) {
    return null;
  }

  const { data } = await supabase
    .from('ll_line_accounts')
    .select('id, company_id, account_name, channel_id, basic_id, line_bot_user_id, webhook_url, is_connected, connection_status, verified_at, last_connection_error, channel_secret_last4, channel_access_token_last4')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data;
}

export async function listLineAccountsForWebhook(companyId?: string | null) {
  const supabase = createLLinkServiceClient();

  if (!supabase) {
    return [];
  }

  let query = supabase
    .from('ll_line_accounts')
    .select('id, company_id, line_bot_user_id, channel_secret_encrypted, channel_access_token_encrypted')
    .order('created_at', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data } = await query;

  return data ?? [];
}
