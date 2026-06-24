import { canDeleteFile, getStorageAuthContext } from '@/lib/storage/auth';
import { logStorageAudit, logStorageSecurityEvent } from '@/lib/storage/audit';
import { isPathInStoreScope } from '@/lib/storage/paths';
import { logServerError } from '@/lib/observability/logServerError';

type UploadedFileRow = {
  id: string;
  tenant_id: string | null;
  store_id: string;
  bucket: string;
  path: string;
  purpose: string;
  file_type: string;
  size_bytes: number;
  uploaded_by: string | null;
};

export async function POST(request: Request) {
  const context = await getStorageAuthContext(request);
  if (!context.ok) return context.response;

  if (!canDeleteFile(context.member.role)) {
    await logStorageSecurityEvent({
      context: {
        supabase: context.supabase,
        tenantId: context.member.tenantId,
        userId: context.user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      eventType: 'file_delete_denied',
      severity: 'high',
      details: { reason: 'role_not_allowed' },
    });
    return Response.json({ ok: false, error: 'ファイル削除権限がありません。', code: 'forbidden_role' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { fileId?: string } | null;
  const fileId = typeof body?.fileId === 'string' ? body.fileId : null;
  if (!fileId) {
    return Response.json({ ok: false, error: 'ファイル指定がありません。', code: 'invalid_request' }, { status: 400 });
  }

  const { data, error } = await context.service
    .from('uploaded_files')
    .select('id, tenant_id, store_id, bucket, path, purpose, file_type, size_bytes, uploaded_by')
    .eq('id', fileId)
    .eq('store_id', context.member.storeId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) {
    return Response.json({ ok: false, error: 'ファイルが見つかりません。', code: 'not_found' }, { status: 404 });
  }

  const row = data as UploadedFileRow;
  if (row.tenant_id !== context.member.tenantId || !isPathInStoreScope({ path: row.path, tenantId: context.member.tenantId, storeId: context.member.storeId })) {
    await logStorageSecurityEvent({
      context: {
        supabase: context.supabase,
        tenantId: context.member.tenantId,
        userId: context.user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      eventType: 'cross_tenant_file_access_blocked',
      severity: 'critical',
      details: { reason: 'delete_path_scope_mismatch' },
    });
    return Response.json({ ok: false, error: 'ファイルを削除できません。', code: 'cross_tenant_blocked' }, { status: 403 });
  }

  const deletedAt = new Date().toISOString();
  const { error: updateError } = await context.service
    .from('uploaded_files')
    .update({ deleted_at: deletedAt, deleted_by: context.user.id })
    .eq('id', row.id)
    .eq('store_id', context.member.storeId);

  if (updateError) {
    logServerError('db_update_failed', {
      route: '/api/storage/delete',
      method: 'POST',
      tenantId: context.member.tenantId,
      storeId: context.member.storeId,
    }, updateError);
    return Response.json({ ok: false, error: 'ファイル削除記録の保存に失敗しました。', code: 'db_update_failed' }, { status: 500 });
  }

  await context.service.storage.from(row.bucket).remove([row.path]);

  await logStorageAudit({
    context: {
      supabase: context.supabase,
      tenantId: context.member.tenantId,
      storeId: context.member.storeId,
      userId: context.user.id,
      userEmail: context.member.email,
      userRole: context.member.role,
      userDisplayName: context.member.displayName,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
    action: 'file_deleted',
    fileId: row.id,
    purpose: row.purpose,
    fileType: row.file_type,
    sizeBytes: row.size_bytes,
  });

  return Response.json({ ok: true, deletedAt });
}
