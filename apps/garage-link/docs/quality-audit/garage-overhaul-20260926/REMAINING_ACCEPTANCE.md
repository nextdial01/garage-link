# 残る受入条件

全124画面を棚卸し・操作対象にし、78画面PASS、46画面BLOCKEDです。表示だけでPASSにしていません。製品の通常業務の変更は実装・検査しましたが、全画面の主操作完了という条件は満たしていません。

移行案内42画面と未実装設定2画面について、現行の案内画面として受け入れる範囲か、別途機能実装が必要かの判断が残ります。親の判断だけで既存の移行方針を覆したり、案内表示を主操作PASSへ変更していません。外部副作用2画面は入力・確認まで行い、実送信・実課金は要求どおり実行していません。

| 画面 | 状態 | 操作／保存の範囲 |
|---|---|---|
| `/deals/[id]/line/new` | BLOCKED_FEATURE_MOVED | 移行案内→L-LINK設定→戻る→dashboard→再開・reload。layoutが旧child画面を抑止、主業務未実施 / 未確認 |
| `/line` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/billing` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/dashboard` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/delivery-logs` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/forms` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/friends` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/inquiries` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/messages` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/messages/new` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/rich-menus` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/scenarios` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/settings` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/steps` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line-package/users` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/analytics` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/auto-replies` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/auto-replies/[id]` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/campaigns` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/campaigns/[id]` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/delivery-settings` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/drafts` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/forms` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/forms/[id]` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/friends` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/friends/[id]` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/message-logs` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/reservations` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/rich-menus` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/rich-menus/[id]` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/routes` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/routes/[id]` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/settings` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/steps` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/steps/[id]` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/tags` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/tags/[id]` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/templates` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/templates/[id]` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/webhook-events` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/line/webhook-settings` | BLOCKED_FEATURE_MOVED | 現行移行案内→L-LINK設定→戻る→車両管理→再開確認。旧child画面はlayoutで未描画 / 対象外（非更新操作） |
| `/settings/billing` | BLOCKED_EXTERNAL_SIDE_EFFECT | 希望プラン・備考・利用規約確認入力→送信直前で停止→戻る→再開。Stripe申込未送信 / 未確認 |
| `/settings/documents` | BLOCKED_NOT_IMPLEMENTED | 主要関連リンク→戻る→再開・再読込 / 対象外（非更新案内） |
| `/settings/l-link` | BLOCKED_EXTERNAL_SIDE_EFFECT | 別SaaS連携案内確認→設定戻る→再開。外部L-LINK接続変更未実施 / 未確認 |
| `/settings/security` | BLOCKED_NOT_IMPLEMENTED | 主要関連リンク→戻る→再開・再読込 / 対象外（非更新案内） |

Android実機・物理カメラ・実人間CAPTCHAは追加の未確認範囲です。公式CAPTCHAテストwidget、iOS Simulator、React Native Webの証拠をそれらへ拡張して主張しません。Native追加UIの全console・全HTTP監視は採取しておらず、Web/RNWeb監視と区別します。
