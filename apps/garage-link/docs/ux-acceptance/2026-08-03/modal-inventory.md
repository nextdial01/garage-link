# Modal／Dialog inventory

## 共通primitiveへ統合したもの

| UI | 旧実装 | 対応 | 判定 |
|---|---|---|---|
| ContextHelp | 独自fixed layer | 共通 `Modal` | source/test PASS、remote auth BLOCKED |
| PartPickerModal | 独自fixed layer | 共通 `Modal` | source/test PASS、remote auth BLOCKED |
| ResponsiveDetailPanel（mobile） | 独自dialog | 共通 `Modal`。desktop asideは維持 | source/test PASS、remote auth BLOCKED |
| SoftDeleteButton | `window.confirm/alert` | `ConfirmDialog`、復元可能性と失敗理由を表示 | source/test PASS、remote auth BLOCKED |

共通 `Modal` はbody portal、背景全面遮蔽、z-index token、safe-area、内部scroll、body scroll lock、初期focus、Tab循環、Escape、close button、focus return、`aria-modal`とaccessible nameを実装した。

## 残るnative confirm/prompt

| 対象 | 種別 | Severity | 理由 |
|---|---|---:|---|
| deal cancel | confirm/prompt | Medium | 理由入力は可能だが共通説明・回復導線が弱い |
| trash restore | confirm | Medium | 復元操作で破壊性は低い |
| invoice issue/unissue | confirm | Medium | 状態変更の説明を共通化できていない |
| maintenance complete | confirm | Medium | 完了後の戻し方が明示されない |
| LINE legacy delete | confirm | Medium | 削除結果と回復可否の説明が画面ごとに不統一 |

認証fixture未成立のため、残存dialogを実データで操作した最終判定は保留する。

