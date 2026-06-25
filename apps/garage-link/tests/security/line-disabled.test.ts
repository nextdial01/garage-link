import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  LINE_MOVED_NOTICE_TEXT,
  isLineDeliveryDisabled,
  lineMovedApiResponse,
} from '../../src/lib/line/lineDisabled';

test.describe('LINE自前運用の無効化（L-LINK分離）', () => {
  test('LINE直接送信は無効化フラグで止まる', () => {
    expect(isLineDeliveryDisabled()).toBe(true);
  });

  test('LINE系APIは410 Goneの安全応答を返す', async () => {
    const response = lineMovedApiResponse('/api/line/send');
    expect(response.status).toBe(410);
    const body = (await response.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe('line_feature_moved');
  });

  test('案内文言は要件どおりの説明を含む', () => {
    expect(LINE_MOVED_NOTICE_TEXT).toContain('LINE運用機能は、L-LINKで管理します');
    expect(LINE_MOVED_NOTICE_TEXT).toContain('L-LINKへ配信候補を連携します');
  });

  test('/api/line/send は配信ロジックの前で送信を停止する', async () => {
    const source = await readFile('src/app/api/line/send/route.ts', 'utf8');
    // POST直後にキルスイッチが入っていること（実送信 sendLineTextMessage より前）。
    const guardIndex = source.indexOf('isLineDeliveryDisabled()');
    const sendIndex = source.indexOf('sendLineTextMessage({');
    expect(guardIndex).toBeGreaterThan(0);
    expect(sendIndex).toBeGreaterThan(guardIndex);
    expect(source).toContain("lineMovedApiResponse('/api/line/send')");
  });

  test('/api/line/webhook は署名検証・DB保存・返信を行わない', async () => {
    const source = await readFile('src/app/api/line/webhook/route.ts', 'utf8');
    expect(source).toContain('lineMovedApiResponse');
    // 受信イベントの保存・解析・署名検証を行わない（コメントではなく実処理が無いこと）。
    expect(source).not.toContain(".from('line_webhook_events')");
    expect(source).not.toContain('.insert(');
    expect(source).not.toContain('verifyLineSignature(');
    expect(source).not.toContain('JSON.parse(');
  });

  test('LINE運用画面はレイアウトで移行案内に置き換える', async () => {
    const [lineLayout, packageLayout, dealLineLayout] = await Promise.all([
      readFile('src/app/line/layout.tsx', 'utf8'),
      readFile('src/app/line-package/layout.tsx', 'utf8'),
      readFile('src/app/deals/[id]/line/layout.tsx', 'utf8'),
    ]);
    expect(lineLayout).toContain('LineFeatureMovedNotice');
    expect(packageLayout).toContain('LineFeatureMovedNotice');
    expect(dealLineLayout).toContain('LineFeatureMovedNotice');
  });

  test('商談詳細・帳票プレビューに /line/new への直接導線が残っていない', async () => {
    const [dealPage, invoicePreview, quotePreview] = await Promise.all([
      readFile('src/app/deals/[id]/page.tsx', 'utf8'),
      readFile('src/app/deals/[id]/invoices/preview/page.tsx', 'utf8'),
      readFile('src/app/deals/[id]/quotes/preview/page.tsx', 'utf8'),
    ]);
    for (const source of [dealPage, invoicePreview, quotePreview]) {
      expect(source).not.toContain('/line/new');
      expect(source).toContain('/settings/l-link');
    }
  });
});
