import { redactRecord } from '@/lib/security/redact';

type SecurityEventType =
  | 'webhook_signature_invalid'
  | 'webhook_secret_missing'
  | 'webhook_env_secret_fallback_used'
  | 'tenant_access_denied'
  | 'role_access_denied'
  | 'feature_access_denied'
  | 'rate_limit_exceeded'
  | 'suspicious_request'
  | 'cross_tenant_delivery_blocked'
  | 'delivery_rate_limited'
  | 'delivery_target_mismatch'
  | 'delivery_plan_limit_exceeded'
  | 'line_token_decrypt_failed'
  | 'line_token_missing'
  | 'export_access_denied'
  | 'import_access_denied'
  | 'cross_tenant_export_blocked'
  | 'cross_tenant_import_blocked'
  | 'large_export_requested'
  | 'csv_formula_injection_detected'
  | 'csv_invalid_format'
  | 'csv_import_rate_limited'
  | 'csv_export_rate_limited'
  | 'file_upload_rejected'
  | 'file_upload_rate_limited'
  | 'file_access_denied'
  | 'file_delete_denied'
  | 'file_type_rejected'
  | 'file_size_rejected'
  | 'cross_tenant_file_access_blocked';

type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

type SecurityEventInsert = {
  tenant_id: string | null;
  user_id: string | null;
  event_type: SecurityEventType;
  severity: SecuritySeverity;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, string | number | boolean | null>;
};

type InsertResult = {
  error: { message: string } | null;
};

type SupabaseLike = {
  from: (tableName: string) => {
    insert: (payload: SecurityEventInsert) => PromiseLike<InsertResult>;
  };
};

export async function logSecurityEvent({
  supabase,
  tenantId = null,
  userId = null,
  eventType,
  severity = 'medium',
  ipAddress = null,
  userAgent = null,
  details,
}: {
  supabase: SupabaseLike;
  tenantId?: string | null;
  userId?: string | null;
  eventType: SecurityEventType;
  severity?: SecuritySeverity;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}) {
  const payload: SecurityEventInsert = {
    tenant_id: tenantId,
    user_id: userId,
    event_type: eventType,
    severity,
    ip_address: ipAddress,
    user_agent: userAgent,
    details: redactRecord(details),
  };

  try {
    const { error } = await supabase.from('security_events').insert(payload);

    if (error) {
      console.warn('Security event log failed', {
        eventType,
        error: error.message,
      });
    }
  } catch (error) {
    console.warn('Security event log failed', {
      eventType,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
  }
}
