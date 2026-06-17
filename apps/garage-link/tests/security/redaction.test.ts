import { expect, test } from '@playwright/test';
import { logSecurityEvent } from '../../src/lib/audit/logSecurityEvent';
import { redactRecord, redactValue } from '../../src/lib/security/redact';
import { createFakeSupabase } from './fixtures';

test.describe('Redaction / PII minimization', () => {
  test('security event detailsから本文・個人情報・secretをredactする', async () => {
    const fake = createFakeSupabase();

    await logSecurityEvent({
      supabase: fake.client,
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'webhook_signature_invalid',
      severity: 'high',
      ipAddress: '127.0.0.1',
      details: {
        channel_secret: 'secret-value',
        channel_access_token: 'token-value',
        email: 'customer@example.com',
        phone: '09000000000',
        address: 'Tokyo',
        line_user_id: 'Uxxxxxxxx',
        message_text: '問い合わせ本文',
        raw_event: { source: { userId: 'Uxxxxxxxx' } },
        reason_code: 'invalid_signature',
        row_count: 12,
      },
    });

    expect(fake.inserts).toHaveLength(1);
    const payload = fake.inserts[0].payload as {
      details: Record<string, unknown>;
    };

    expect(payload.details.channel_secret).toBe('[redacted]');
    expect(payload.details.channel_access_token).toBe('[redacted]');
    expect(payload.details.email).toBe('[redacted]');
    expect(payload.details.phone).toBe('[redacted]');
    expect(payload.details.address).toBe('[redacted]');
    expect(payload.details.line_user_id).toBe('[redacted]');
    expect(payload.details.message_text).toBe('[redacted]');
    expect(payload.details.raw_event).toBe('[redacted]');
    expect(payload.details.reason_code).toBe('invalid_signature');
    expect(payload.details.row_count).toBe(12);
  });

  test('ネストしたmetadataでも危険keyをredactする', () => {
    const redacted = redactValue({
      target_type: 'line_webhook_events',
      nested: {
        body: '本文',
        form_answer: '回答全文',
        status: 'failed',
      },
    }) as Record<string, unknown>;

    expect(redacted).toEqual({
      target_type: 'line_webhook_events',
      nested: {
        body: '[redacted]',
        form_answer: '[redacted]',
        status: 'failed',
      },
    });
  });

  test('record redactionは非プリミティブ値をomittedにする', () => {
    expect(redactRecord({
      target_table: 'customers',
      raw_event: { secret: 'value' },
      filters_snapshot: { q: 'customer name' },
    })).toEqual({
      target_table: 'customers',
      raw_event: '[redacted]',
      filters_snapshot: '[omitted]',
    });
  });
});
