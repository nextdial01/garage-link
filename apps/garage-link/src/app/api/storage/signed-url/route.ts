import { canReadFile, getStorageAuthContext } from '@/lib/storage/auth';
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
  deleted_at: string | null;
};

export async function POST(request: Request) {
  const context = await getStorageAuthContext(request);
  if (!context.ok) return context.response;

  if (!canReadFile(context.member.role)) {
    await logStorageSecurityEvent({
      context: {
        supabase: context.supabase,
        tenantId: context.member.tenantId,
        userId: context.user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      eventType: 'file_access_denied',
      severity: 'high',
      details: { reason: 'role_not_allowed' },
    });
    return Response.json({ ok: false, error: 'ファイル閲覧権限がありません。', code: 'forbidden_role' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { fileId?: string; path?: string } | null;
  const fileId = typeof body?.fileId === 'string' ? body.fileId : null;
  const requestedPath = typeof body?.path === 'string' ? body.path : null;

  if (!fileId && !requestedPath) {
    return Response.json({ ok: false, error: 'ファイル指定がありません。', code: 'invalid_request' }, { status: 400 });
  }

  let query = context.service
    .from('uploaded_files')
    .select('id, tenant_id, store_id, bucket, path, purpose, file_type, size_bytes, deleted_at')
    .eq('store_id', context.member.storeId)
    .is('deleted_at', null);

  if (fileId) {
    query = query.eq('id', fileId);
  } else if (requestedPath) {
    query = query.eq('path', requestedPath);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    await logStorageSecurityEvent({
      context: {
        supabase: context.supabase,
        tenantId: context.member.tenantId,
        userId: context.user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      eventType: 'file_access_denied',
      severity: 'medium',
      details: { reason: 'not_found_or_not_in_store' },
    });
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
      details: { reason: 'path_scope_mismatch' },
    });
    return Response.json({ ok: false, error: 'ファイルにアクセスできません。', code: 'cross_tenant_blocked' }, { status: 403 });
  }

  const { data: signed, error: signedError } = await context.service.storage
    .from(row.bucket)
    .createSignedUrl(row.path, 5 * 60);

  if (signedError || !signed?.signedUrl) {
    logServerError('signed_url_failed', {
      route: '/api/storage/signed-url',
      method: 'POST',
      tenantId: context.member.tenantId,
      storeId: context.member.storeId,
    }, signedError);
    return Response.json({ ok: false, error: '署名URLの発行に失敗しました。', code: 'signed_url_failed' }, { status: 500 });
  }

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
    action: 'file_signed_url_created',
    fileId: row.id,
    purpose: row.purpose,
    fileType: row.file_type,
    sizeBytes: row.size_bytes,
  });

  return Response.json({
    ok: true,
    signedUrl: signed.signedUrl,
    expiresIn: 300,
  });
}
