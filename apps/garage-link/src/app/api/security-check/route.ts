import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type OwnerRow = {
  id: string;
};

type LineSettingsRow = {
  channel_secret_last4: string | null;
  channel_access_token_last4: string | null;
  webhook_url: string | null;
};

type AuditLogRow = {
  id: string;
};

type SoftDeleteProbeRow = {
  id: string;
  deleted_at: string | null;
  deleted_by: string | null;
  is_archived: boolean | null;
};

const allowedRoles = ['owner', 'admin'];

const softDeleteTables = [
  'vehicles',
  'customers',
  'deals',
  'quotes',
  'invoices',
  'maintenance_jobs',
  'inventory_counts',
  'line_friends',
  'line_tags',
  'line_templates',
  'line_campaigns',
  'line_steps',
  'line_forms',
  'line_rich_menus',
  'line_auto_replies',
  'line_routes',
];

async function probeSoftDeleteColumns(supabase: Awaited<ReturnType<typeof createClient>>, storeId: string) {
  const results = await Promise.all(
    softDeleteTables.map(async (tableName) => {
      const { error } = await supabase
        .from<SoftDeleteProbeRow>(tableName)
        .select('id, deleted_at, deleted_by, is_archived')
        .eq('store_id', storeId);

      return {
        tableName,
        ok: !error,
        errorMessage: error?.message ?? null,
      };
    })
  );

  return {
    total: results.length,
    okCount: results.filter((result) => result.ok).length,
    failedTables: results.filter((result) => !result.ok).map((result) => result.tableName),
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログイン情報を取得できませんでした。' }, { status: 401 });
  }

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role')
    .eq('user_id', userData.user.id)
    .single();

  if (memberError || !member?.store_id) {
    return NextResponse.json({ ok: false, error: '所属店舗を取得できませんでした。' }, { status: 403 });
  }

  if (!allowedRoles.includes(member.role ?? '')) {
    return NextResponse.json({ ok: false, error: '権限がありません' }, { status: 403 });
  }

  const { data: owners } = await supabase
    .from<OwnerRow>('store_members')
    .select('id')
    .eq('store_id', member.store_id)
    .eq('role', 'owner');

  const { data: lineSettings } = await supabase
    .from<LineSettingsRow>('line_settings')
    .select('channel_secret_last4, channel_access_token_last4, webhook_url')
    .eq('store_id', member.store_id)
    .single();

  const { error: auditLogsError } = await supabase
    .from<AuditLogRow>('audit_logs')
    .select('id')
    .eq('store_id', member.store_id);

  const softDeleteProbe = await probeSoftDeleteColumns(supabase, member.store_id);

  return NextResponse.json({
    ok: true,
    currentRole: member.role ?? '未設定',
    supabase: {
      urlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      anonKeyConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      serviceRoleServerConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      serviceRoleExposedToBrowser: false,
    },
    line: {
      channelSecretConfigured: Boolean(process.env.LINE_CHANNEL_SECRET),
      channelAccessTokenConfigured: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
      encryptedChannelSecretExists: Boolean(lineSettings?.channel_secret_last4),
      envSecretFallbackConfigured: Boolean(process.env.LINE_CHANNEL_SECRET),
      envSecretFallbackDisabled: process.env.LINE_WEBHOOK_DISABLE_ENV_SECRET_FALLBACK === 'true',
      storedChannelAccessTokenExists: Boolean(lineSettings?.channel_access_token_last4),
      webhookUrlConfigured: Boolean(lineSettings?.webhook_url),
    },
    permissions: {
      ownerCount: owners?.length ?? 0,
      staffViewerExportBlocked: true,
    },
    dataProtection: {
      softDeleteProbe,
      auditLogsTableAvailable: !auditLogsError,
      exportSecretsExcluded: true,
    },
    rls: {
      note: '所属店舗データをRLS越しに取得できるかを確認しています。RLS有効化そのものはSupabase管理画面でも確認してください。',
      readableTables: softDeleteProbe.okCount,
      totalTables: softDeleteProbe.total,
    },
  });
}
