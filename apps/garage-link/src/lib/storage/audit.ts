import 'server-only';
import { logAudit } from '@/lib/audit/logAudit';
import { logSecurityEvent } from '@/lib/audit/logSecurityEvent';

type StorageContext = {
  supabase: Parameters<typeof logSecurityEvent>[0]['supabase'];
  tenantId: string;
  storeId: string;
  userId: string;
  userEmail: string | null;
  userRole: string | null;
  userDisplayName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export async function logStorageAudit({
  context,
  action,
  fileId,
  purpose,
  fileType,
  sizeBytes,
}: {
  context: StorageContext;
  action: 'file_uploaded' | 'file_deleted' | 'file_signed_url_created';
  fileId: string | null;
  purpose: string;
  fileType: string;
  sizeBytes?: number;
}) {
  await logAudit({
    supabase: context.supabase,
    storeId: context.storeId,
    userId: context.userId,
    userEmail: context.userEmail,
    userRole: context.userRole,
    userDisplayName: context.userDisplayName,
    action,
    targetType: 'uploaded_file',
    targetId: fileId,
    targetLabel: 'Storage file',
    metadata: {
      purpose,
      file_type: fileType,
      size_bytes: sizeBytes ?? null,
    },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
}

export async function logStorageSecurityEvent({
  context,
  eventType,
  severity = 'medium',
  details,
}: {
  context: Pick<StorageContext, 'supabase' | 'tenantId' | 'userId' | 'ipAddress' | 'userAgent'>;
  eventType:
    | 'file_upload_rejected'
    | 'file_upload_rate_limited'
    | 'file_access_denied'
    | 'file_delete_denied'
    | 'file_type_rejected'
    | 'file_size_rejected'
    | 'cross_tenant_file_access_blocked';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  details?: Record<string, unknown>;
}) {
  await logSecurityEvent({
    supabase: context.supabase,
    tenantId: context.tenantId,
    userId: context.userId,
    eventType,
    severity,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    details,
  });
}
