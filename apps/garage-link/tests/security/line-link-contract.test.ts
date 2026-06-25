import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  CANDIDATE_EVENT_TYPES,
  CANDIDATE_EVENT_TYPE_LABELS,
} from '../../src/lib/line-link/deliveryCandidates';

test.describe('L-LINK 配信候補 連携契約', () => {
  test('配信候補種別は6種で車検案内を含む', () => {
    expect(CANDIDATE_EVENT_TYPES).toContain('inspection_reminder');
    expect(CANDIDATE_EVENT_TYPES).toContain('post_delivery_follow_up');
    expect(CANDIDATE_EVENT_TYPES.length).toBe(6);
    for (const t of CANDIDATE_EVENT_TYPES) {
      expect(CANDIDATE_EVENT_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  test('配信候補APIは読み取り専用・pendingのみ・店舗スコープ・LINE送信なし', async () => {
    const src = await readFile('src/app/api/line-link/delivery-candidates/route.ts', 'utf8');
    // 読み取り専用（GETのみ、書き込みメソッドを持たない）
    expect(src).toContain('export async function GET');
    expect(src).not.toContain('export async function POST');
    expect(src).not.toContain('export async function PUT');
    expect(src).not.toContain('export async function DELETE');
    // pending のみ・店舗スコープ
    expect(src).toContain(".eq('status', 'pending')");
    expect(src).toContain(".eq('store_id', member.store_id)");
    // 認証セッション（service_role 非依存）
    expect(src).toContain("from '@/lib/supabase/server'");
    expect(src).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    // 実LINE送信・Messaging APIを一切含まない
    expect(src).not.toContain('api.line.me');
    expect(src).not.toContain('sendLineTextMessage');
    expect(src).not.toContain('/v2/bot/message');
    // PII最小化: line_user_id を返さない
    expect(src).not.toContain('line_user_id');
  });

  test('037: event_type CHECK は inspection_reminder を維持しつつ拡張する', async () => {
    const sql = await readFile('supabase/schema/037_delivery_candidate_event_types.sql', 'utf8');
    expect(sql).toContain("'inspection_reminder'");
    expect(sql).toContain("'post_delivery_follow_up'");
    expect(sql).toContain('inspection_reminder_events_type_check');
    // 既存テーブル構造を壊す破壊的操作を含まない
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/truncate/i);
    expect(sql).not.toMatch(/delete\s+from/i);
  });
});
