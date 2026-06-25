// GARAGE LINK の LINE 自前運用機能（配信・友だち管理・Webhook 等）を無効化するための
// 共通スイッチと案内文・APIレスポンスをまとめます。
// 方針: LINE 運用は L-LINK 側へ集約し、GARAGE LINK からは LINE を直接送信しない。
// 既存テーブル・ライブラリ・APIコードは将来移行のため残し、ここで「到達不可・実行不可」にします。

// 無効状態は固定ですが、リテラル型に絞らないことで呼び出し側の後続コードを
// 「到達不能コード」と誤検知させず、将来の移行で値を差し替えやすくしています。
export function isLineDeliveryDisabled(): boolean {
  return true;
}

// 利用者向けの説明文（画面で表示する正式文言）。
export const LINE_MOVED_NOTICE_TEXT =
  'LINE配信・友だち管理・リッチメニュー・フォームなどのLINE運用機能は、L-LINKで管理します。' +
  'GARAGE LINKでは車両・顧客・整備・商談データを管理し、必要に応じてL-LINKへ配信候補を連携します。';

// L-LINK連携状態の確認・遷移先（アプリ内）。
export const L_LINK_SETTINGS_PATH = '/settings/l-link';

// LINE系APIへ到達した場合に返す安全なレスポンス（410 Gone）。
// 送信・Webhook処理は一切行わず、移管済みであることだけを返します。
export function lineMovedApiResponse(route: string) {
  return Response.json(
    {
      ok: false,
      code: 'line_feature_moved',
      error:
        'このLINE機能はL-LINKへ移行しました。GARAGE LINKからLINEの直接送信・Webhook処理は行いません。',
      route,
    },
    { status: 410 }
  );
}
