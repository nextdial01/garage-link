import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logAudit';
import { logSecurityEvent } from '@/lib/audit/logSecurityEvent';

export const CSV_EXPORT_ROW_LIMIT = 5000;
export const CSV_IMPORT_ROW_LIMIT = 1000;
export const CSV_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export type CsvTarget = 'customers' | 'vehicles' | 'line_friends';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
  stores: {
    tenant_id: string | null;
  } | null;
};

export function clientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  );
}

export function userAgent(request: Request) {
  return request.headers.get('user-agent');
}

export function canExportCsv(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}

export function canImportCsv(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}

export async function getCsvAuthContext(request: Request) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user?.id) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: 'ログイン情報を取得できませんでした。' }, { status: 401 }),
    };
  }

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role, display_name, email, stores(tenant_id)')
    .eq('user_id', userData.user.id)
    .single();

  if (memberError || !member?.store_id) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: '所属店舗を取得できませんでした。' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    supabase,
    user: userData.user,
    member: {
      storeId: member.store_id,
      tenantId: member.stores?.tenant_id ?? null,
      role: member.role ?? 'viewer',
      displayName: member.display_name,
      email: member.email ?? userData.user.email ?? null,
    },
    ipAddress: clientIp(request),
    userAgent: userAgent(request),
  };
}

export async function denyCsvOperation({
  supabase,
  tenantId,
  userId,
  eventType,
  ipAddress,
  details,
  message = '権限がありません',
  status = 403,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string | null;
  userId: string;
  eventType:
    | 'export_access_denied'
    | 'import_access_denied'
    | 'cross_tenant_export_blocked'
    | 'cross_tenant_import_blocked'
    | 'large_export_requested'
    | 'csv_formula_injection_detected'
    | 'csv_invalid_format';
  ipAddress: string | null;
  details?: Record<string, unknown>;
  message?: string;
  status?: number;
}) {
  await logSecurityEvent({
    supabase,
    tenantId,
    userId,
    eventType,
    severity: eventType === 'large_export_requested' ? 'high' : 'critical',
    ipAddress,
    details,
  });

  return Response.json({ ok: false, error: message }, { status });
}

export async function logDataExport({
  supabase,
  tenantId,
  storeId,
  userId,
  targetTable,
  rowCount,
  columnsExported,
  ipAddress,
  userAgentValue,
  status = 'completed',
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string | null;
  storeId: string;
  userId: string;
  targetTable: string;
  rowCount: number;
  columnsExported: string[];
  ipAddress: string | null;
  userAgentValue: string | null;
  status?: string;
}) {
  await supabase.from('data_export_logs').insert({
    tenant_id: tenantId,
    store_id: storeId,
    user_id: userId,
    export_type: 'csv',
    target_table: targetTable,
    row_count: rowCount,
    columns_exported: columnsExported,
    filters_snapshot: { scope: 'current_store' },
    status,
    ip_address: ipAddress,
    user_agent: userAgentValue,
  });
}

export async function logDataImport({
  supabase,
  tenantId,
  storeId,
  userId,
  targetTable,
  rowCount,
  successCount,
  failedCount,
  ipAddress,
  userAgentValue,
  status = 'completed',
  errorSummary = null,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string | null;
  storeId: string;
  userId: string;
  targetTable: string;
  rowCount: number;
  successCount: number;
  failedCount: number;
  ipAddress: string | null;
  userAgentValue: string | null;
  status?: string;
  errorSummary?: unknown;
}) {
  await supabase.from('data_import_logs').insert({
    tenant_id: tenantId,
    store_id: storeId,
    user_id: userId,
    import_type: 'csv',
    target_table: targetTable,
    row_count: rowCount,
    success_count: successCount,
    failed_count: failedCount,
    status,
    error_summary: errorSummary,
    ip_address: ipAddress,
    user_agent: userAgentValue,
  });
}

export async function logCsvAudit({
  supabase,
  storeId,
  userId,
  userEmail,
  userRole,
  userDisplayName,
  action,
  targetTable,
  rowCount,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  storeId: string;
  userId: string;
  userEmail: string | null;
  userRole: string | null;
  userDisplayName: string | null;
  action: 'data_export_completed' | 'data_export_failed' | 'data_import_previewed' | 'data_import_committed' | 'data_import_failed';
  targetTable: string;
  rowCount: number;
}) {
  await logAudit({
    supabase,
    storeId,
    userId,
    userEmail,
    userRole,
    userDisplayName,
    action,
    targetType: 'settings',
    targetLabel: 'CSVデータ操作',
    metadata: {
      target_table: targetTable,
      row_count: rowCount,
    },
  });
}
