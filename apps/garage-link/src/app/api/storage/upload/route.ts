import { canUploadFile, getStorageAuthContext } from '@/lib/storage/auth';
import { logStorageAudit, logStorageSecurityEvent } from '@/lib/storage/audit';
import {
  buildStoragePath,
  isPathInStoreScope,
  isValidUuid,
  privateStorageBucket,
} from '@/lib/storage/paths';
import { validateUploadFile, type UploadPurpose } from '@/lib/storage/validateFile';
import { enforceSecurityRateLimit } from '@/lib/security/rateLimit';
import { apiError, logServerError } from '@/lib/observability/logServerError';

const allowedRelatedTypes = new Set(['vehicle']);

type UploadedFileRow = {
  id: string;
  bucket: string;
  path: string;
  purpose: string;
  file_type: string;
  mime_type: string;
  size_bytes: number;
};

const allowedPurposes = new Set<UploadPurpose>([
  'company_logo',
  'company_seal',
  'vehicle_image',
  'line_rich_menu',
  'line_message_image',
  'csv_import',
  'inquiry_attachment',
  'other',
]);

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export async function POST(request: Request) {
  const context = await getStorageAuthContext(request);
  if (!context.ok) return context.response;

  if (!canUploadFile(context.member.role)) {
    await logStorageSecurityEvent({
      context: {
        supabase: context.supabase,
        tenantId: context.member.tenantId,
        userId: context.user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      eventType: 'file_upload_rejected',
      severity: 'high',
      details: { reason: 'role_not_allowed' },
    });
    return Response.json({ ok: false, error: 'アップロード権限がありません。', code: 'forbidden_role' }, { status: 403 });
  }

  try {
    await enforceSecurityRateLimit({
      supabase: context.supabase,
      tenantId: context.member.tenantId,
      userId: context.user.id,
      ipAddress: context.ipAddress,
      action: 'file_upload',
    });

    const formData = await request.formData();
    const file = formData.get('file');
    const purposeValue = formValue(formData, 'purpose') as UploadPurpose | null;
    const relatedType = formValue(formData, 'related_type');
    const relatedId = formValue(formData, 'related_id');

    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: 'ファイルを選択してください。' }, { status: 400 });
    }

    const purpose = purposeValue && allowedPurposes.has(purposeValue) ? purposeValue : null;
    if (!purpose) {
      return Response.json({ ok: false, error: 'アップロード用途が正しくありません。' }, { status: 400 });
    }

    const safeRelatedType =
      relatedType && allowedRelatedTypes.has(relatedType) ? relatedType : null;
    const safeRelatedId = isValidUuid(relatedId) ? relatedId : null;

    if ((relatedType && !safeRelatedType) || (relatedId && !safeRelatedId)) {
      await logStorageSecurityEvent({
        context: {
          supabase: context.supabase,
          tenantId: context.member.tenantId,
          userId: context.user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        eventType: 'file_upload_rejected',
        severity: 'high',
        details: { reason: 'invalid_related_reference' },
      });
      return Response.json(
        { ok: false, error: '関連リソース指定が正しくありません。' },
        { status: 400 }
      );
    }

    const validation = validateUploadFile({ file, purpose });
    if (!validation.ok) {
      await logStorageSecurityEvent({
        context: {
          supabase: context.supabase,
          tenantId: context.member.tenantId,
          userId: context.user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        eventType: validation.reason === 'file_too_large' ? 'file_size_rejected' : 'file_type_rejected',
        severity: 'medium',
        details: {
          purpose,
          reason: validation.reason,
          size_bytes: file.size,
        },
      });
      return Response.json({ ok: false, error: validation.message }, { status: 400 });
    }

    const generated = buildStoragePath({
      tenantId: context.member.tenantId,
      storeId: context.member.storeId,
      purpose,
      originalFileName: file.name,
      relatedType: safeRelatedType,
      relatedId: safeRelatedId,
    });

    if (
      !isPathInStoreScope({
        path: generated.path,
        tenantId: context.member.tenantId,
        storeId: context.member.storeId,
      })
    ) {
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
        details: { reason: 'generated_path_scope_mismatch' },
      });
      return Response.json(
        { ok: false, error: 'アップロードpathが安全条件を満たしません。' },
        { status: 400 }
      );
    }

    const { error: uploadError } = await context.service.storage
      .from(privateStorageBucket)
      .upload(generated.path, file, {
        upsert: false,
        contentType: validation.mimeType,
      });

    if (uploadError) {
      return apiError({
        code: 'storage_upload_failed',
        message: 'ファイルの保存に失敗しました。private bucketを確認してください。',
        status: 500,
        context: { route: '/api/storage/upload', method: 'POST', tenantId: context.member.tenantId, storeId: context.member.storeId },
        error: uploadError,
      });
    }

    const { data: inserted, error: insertError } = await context.service
      .from('uploaded_files')
      .insert({
        tenant_id: context.member.tenantId,
        store_id: context.member.storeId,
        bucket: privateStorageBucket,
        path: generated.path,
        original_filename: file.name,
        safe_filename: generated.safeFilename,
        mime_type: validation.mimeType,
        size_bytes: validation.sizeBytes,
        file_type: validation.rule.fileType,
        purpose,
        related_type: safeRelatedType,
        related_id: safeRelatedId,
        uploaded_by: context.user.id,
      })
      .select('id, bucket, path, purpose, file_type, mime_type, size_bytes')
      .single();

    if (insertError || !inserted) {
      await context.service.storage.from(privateStorageBucket).remove([generated.path]);
      return apiError({
        code: 'db_insert_failed',
        message: 'ファイルメタデータの保存に失敗しました。',
        status: 500,
        context: { route: '/api/storage/upload', method: 'POST', tenantId: context.member.tenantId, storeId: context.member.storeId },
        error: insertError,
      });
    }

    const row = inserted as UploadedFileRow;
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
      action: 'file_uploaded',
      fileId: row.id,
      purpose: row.purpose,
      fileType: row.file_type,
      sizeBytes: row.size_bytes,
    });

    return Response.json({
      ok: true,
      file: {
        id: row.id,
        bucket: row.bucket,
        path: row.path,
        purpose: row.purpose,
        file_type: row.file_type,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
      },
    });
  } catch (error) {
    await logStorageSecurityEvent({
      context: {
        supabase: context.supabase,
        tenantId: context.member.tenantId,
        userId: context.user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      eventType: 'file_upload_rejected',
      severity: 'medium',
      details: { reason: 'upload_failed' },
    });
    logServerError('upload_failed', {
      route: '/api/storage/upload',
      method: 'POST',
      tenantId: context.member.tenantId,
      storeId: context.member.storeId,
    }, error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'アップロードに失敗しました。', code: 'upload_failed' }, { status: 500 });
  }
}
