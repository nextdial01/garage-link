# 候補10 label補修 独立レビュー・検証

Codex独立検査、原本source編集なし。最初の10freezeは親のlegacy NULL表示ガード追加により途中候補としてsuperseded-prefinal-*へ保存。最終は見積/請求の両方でNULL数量/単価を「未設定」にする版へ同期して全Mobile検証を再実行。

新P1/P2指摘なし。documentLineAmountLabelは既知modeの保存net額を税抜、未知modeは保存時とし、非課税/税対象外を優先。documentUnitPriceLabelはsnapshot入力方式に従い税込/税抜/保存時、非課税/対象外優先。加減算/再保存を一切追加しない。detail表示に保存済み小計/消費税/値引/下取/支払額を追加し、元明細amountと総額の値はそのまま。旧NULLを0円に見せる追加表示は避ける。React Fragmentのkeyで行識別維持。

LOCAL_SAFEの独立helper委譲は正式runnerのprovider_circuit_openによりmodel未起動0秒でhandoff。追加probe/retry/model変更なし。親Codexがbounded補完し、このレビューで検査。Qwen単独完了には計上しない。次回はprovider正常性の正式回復後に同じ小範囲ラベルsubtaskをLocal候補として維持。

検証: Mobile15テストファイル全PASS、型/lint PASS、SSR144ケースPASS、写真converter4件PASS。document-htmlの既存金額/escape/legacy検査を保持し、5mode×3categoryのlabel両関数を追加検査。新しい実Native表示確認は親/doc担当が実施。

候補08との違いは以下3ファイルのみ。
- apps/garage-link-mobile/src/v2/GarageMobileV2.tsx
- apps/garage-link-mobile/src/v2/documentHtml.ts
- apps/garage-link-mobile/scripts/document-html.test.mjs

Web・DB・API・auth・lock・共通money・他試験は全て候補08と一致。Webbuild/型/lint/security390/QA99とDB fresh/upgrade全契約の既存証拠を継承し、不要なWeb rebuildは行わない。公開local origin補完版09ともWeb同一。

最終936コードmanifest: candidate10-code-files.json。digest f8b7ae5df5acf15b80216101a059c963da38f842ae58566f0554d6f6be0f1b55。現在原本drift0。candidate10-code-summary.jsonに継承関係と全Mobile結果を記録。
