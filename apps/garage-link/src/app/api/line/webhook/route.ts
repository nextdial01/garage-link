import { lineMovedApiResponse } from '@/lib/line/lineDisabled';

// GARAGE LINK の LINE Webhook 受信は L-LINK へ移行済み。
// 外部（LINEプラットフォーム）から到達しても、署名検証・DB保存・自動返信・
// 顧客紐付け等の処理は一切行わず、安全な 410 応答のみ返します。
// 既存の line_webhook_events テーブル・過去ログは参照/監査/移行のため削除しません。

export async function GET() {
  return lineMovedApiResponse('/api/line/webhook');
}

export async function POST() {
  // 本文の読み取り・解析・保存・返信を行わない（意図しない処理・DB更新・返信送信を防ぐ）。
  return lineMovedApiResponse('/api/line/webhook');
}
