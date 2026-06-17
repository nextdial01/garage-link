# GARAGE LINK / L-Link 導線分離計画

## 方針

GARAGE LINKは在庫管理SaaS、L-LinkはLINE外部ツールSaaSとして分離する。

GARAGE LINK側には、LINE配信、シナリオ配信、回答フォーム、リッチメニュー管理などのL-Link本体機能を新規追加しない。

GARAGE LINK側に残すのは以下に限定する。

- L-Link連携可否
- L-Link契約状態
- L-Linkアプリへの導線
- GARAGE LINKプラン上のL-Link連携表示

## GARAGE LINK側に残っているLINE関連ルート

### GARAGE LINK側に残す

| 対象 | 理由 | 今回の対応 |
| --- | --- | --- |
| `/settings/l-link` | GARAGE LINK側のL-Link連携状態確認ページ | 新規作成 |
| `/settings/billing` | GARAGE LINK契約プラン上のL-Link連携可否を表示 | `L-Link連携` に統一済み |
| `/api/line/webhook` | 既存連携互換。段階移行中のため即削除しない | 通常メニューからは導線を出さない |
| `/api/line/settings` | 既存連携互換。Secret非返却などの安全化済み | 通常メニューからは導線を出さない |

### L-Link側へ移す

| 対象 | 移行先候補 | 備考 |
| --- | --- | --- |
| `/line/friends` | `apps/l-link` の友だち管理 | LINE userIdは表示しない |
| `/line/drafts` | `apps/l-link` のメッセージ配信 | 配信前確認、権限制御を維持 |
| `/line/campaigns` | `apps/l-link` のメッセージ配信 | GARAGE LINK専用導線を外す |
| `/line/steps` | `apps/l-link` のステップ配信 | line-core / adapter経由へ移行 |
| `/line/forms` | `apps/l-link` の回答フォーム | 回答内容のexport制限を維持 |
| `/line/rich-menus` | `apps/l-link` のリッチメニュー | Storage制限を維持 |
| `/line/auto-replies` | `apps/l-link` の自動応答 | L-Link本体機能 |
| `/line/routes` | `apps/l-link` の流入経路 | L-Link本体機能 |
| `/line/message-logs` | `apps/l-link` の配信履歴 | PII最小化を維持 |
| `/line/webhook-events` | `apps/l-link` のWebhookイベント | raw_event非表示を維持 |
| `/line/settings` | `apps/l-link/settings` | Secret / Tokenはマスク表示のみ |
| `/line-package/*` | `apps/l-link/*` | 旧内部検証ルート。移行後は削除候補 |

### 削除候補

| 対象 | 条件 |
| --- | --- |
| GARAGE LINK側の `/line-package/*` | L-Link側の同等ページに移行後 |
| GARAGE LINK側の `/line/*` UIページ | L-Link側への移行と運用確認後 |
| GARAGE LINK側のLINE料金表ページ | L-Link側の料金設計確定後 |
| `packages/billing/src/linePlans.ts` のGARAGE LINK側参照 | L-Linkの課金設計を別パッケージ境界へ整理後 |

## 今回の導線整理

- GARAGE LINKの管理切替からLINE本体機能への入口を外し、`L-Link連携` へ変更した。
- GARAGE LINKのサイドバーに `L-Link連携` を追加した。
- GARAGE LINKのサイドバーからLINE本体機能メニューを通常導線として出さないようにした。
- 既存 `/line` ルートは削除せず、直接アクセス互換として残す。
- L-Link側に `/line`、`/line-package`、`/billing` を追加し、今後の移行先の受け皿にした。

## 本番前の残対応

- GARAGE LINK側 `/line/*` の利用実態を確認する。
- L-Link側に実データ対応ページを移す。
- GARAGE LINK側 `/line-package/*` をL-Link側へ完全移行する。
- GARAGE LINK側APIで必要な互換期間を決める。
- 022〜027 migrationをstaging Supabaseで実適用確認する。
- A社/B社 tenant分離を実DBで確認する。
