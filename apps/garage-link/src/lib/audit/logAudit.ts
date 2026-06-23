import { redactValue } from '@/lib/security/redact';

type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'login'
  | 'logout'
  | 'issue_quote'
  | 'issue_invoice'
  | 'cancel_quote'
  | 'cancel_invoice'
  | 'send_line'
  | 'message_draft_created'
  | 'message_draft_updated'
  | 'test_delivery_sent'
  | 'delivery_confirmed'
  | 'delivery_sent'
  | 'delivery_scheduled'
  | 'delivery_cancelled'
  | 'delivery_failed'
  | 'data_export_started'
  | 'data_export_completed'
  | 'data_export_failed'
  | 'data_import_previewed'
  | 'data_import_committed'
  | 'data_import_failed'
  | 'file_uploaded'
  | 'file_deleted'
  | 'file_signed_url_created'
  | 'export_settings'
  | 'import_settings'
  | 'change_role'
  | 'upload_file';

type AuditTargetType =
  | 'vehicle'
  | 'customer'
  | 'deal'
  | 'quote'
  | 'invoice'
  | 'maintenance_job'
  | 'inventory_count'
  | 'line_friend'
  | 'line_tag'
  | 'line_template'
  | 'line_campaign'
  | 'line_step'
  | 'line_form'
  | 'line_rich_menu'
  | 'line_auto_reply'
  | 'line_route'
  | 'line_message'
  | 'settings'
  | 'store_member'
  | 'uploaded_file'
  | 'repair_part';

type AuditLogInsert = {
  store_id: string | null;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  user_display_name: string | null;
  action: AuditAction;
  target_type: AuditTargetType | null;
  target_id: string | null;
  target_label: string | null;
  before_data: unknown | null;
  after_data: unknown | null;
  metadata: unknown | null;
  ip_address: string | null;
  user_agent: string | null;
};

type SupabaseLike = {
  from(table: string): {
    insert(row: object): unknown;
  };
};

export async function logAudit({
  supabase,
  storeId,
  userId = null,
  userEmail = null,
  userRole = null,
  userDisplayName = null,
  action,
  targetType = null,
  targetId = null,
  targetLabel = null,
  beforeData = null,
  afterData = null,
  metadata = null,
  ipAddress = null,
  userAgent = null,
}: {
  supabase: SupabaseLike;
  storeId: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  userDisplayName?: string | null;
  action: AuditAction;
  targetType?: AuditTargetType | null;
  targetId?: string | null;
  targetLabel?: string | null;
  beforeData?: unknown | null;
  afterData?: unknown | null;
  metadata?: unknown | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  try {
    const payload: AuditLogInsert = {
      store_id: storeId,
      user_id: userId,
      user_email: userEmail,
      user_role: userRole,
      user_display_name: userDisplayName,
      action,
      target_type: targetType,
      target_id: targetId,
      target_label: targetLabel,
      before_data: redactValue(beforeData),
      after_data: redactValue(afterData),
      metadata: redactValue(metadata),
      ip_address: ipAddress,
      user_agent: userAgent,
    };

    const result = await supabase.from('audit_logs').insert(payload);
    const { error } = result as { error?: { message: string } | null };
    if (error) {
      console.error('audit log insert failed', error.message);
    }
  } catch (error) {
    console.error('audit log insert failed', error instanceof Error ? error.message : 'unknown error');
  }
}
