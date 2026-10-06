# 公開CV設計の根拠

Owner 2026-10-06最新指示を正本とする。旧コピー・構成は正本ではない。

## 商用と利用可能機能の区別
- Free/Starter: L-LINK付帯なし。Standard: Owner承認のL-LINK Basic追加料金なし。
- Standard/Proデータ連携はpackages/billing/contract/garage-commercial-contract.jsonとgaragePlans.tsが提供準備中。Basic付帯と分けて明示。Pro付帯の契約根拠なし、Basic/Auto等を創作しない。Backend契約・権限は変更しない。
- 全価格・上限はGARAGE_PLANSから参照。追加オプション単価は定義があるが、change-optionsが拒否するため購入可と案内しない。

## 法務
- hosted Stripe Checkoutのcard指定、period-end cancellation、1年retentionをコードと契約で確認。将来形だけ現在の顧客向け文章に変更。カード番号等非保持を決済情報全体へ拡張しない。
- 保管起算は課金終了時点の既存挙動に合わせて明確化、1年間は維持。免税/インボイス非発行、原則返金不可、Free復帰不可、責任制限等の法的条件とconsent versionは変更しない。
- 公的確認: https://www.no-trouble.caa.go.jp/what/mailorder/advertising.html （支払方法・時期・価格・解除条件の明瞭な表示）。新しい法的条件は作らない。

## 設計と安全境界
- 1製品theatre＋5タブ、専用demoへ操作を分離。theatreの実UI内部はinertにし操作誤認を排除。製品業務ロジックと計測は維持。
- Hero→実UI→次の仕事→Free→StandardのBasic付帯→4料金→CSV→FAQ→Final。カード連続・架空実績・サービス販売への退出は採用しない。
- ローカルの純粋な表示確認。DB/Auth/Stripe/LINEの実送信・fixture作成なし。QA staging laneはDB操作を伴うstagingQAのみで、このpublic Preview表示監査へ流用しない。
- PreviewのみOwner承認済み。commit/push/main/Production禁止。最終合格はHEAD＋未commitソースhashで凍結。

## 委譲
MIXED_RISK。全体の結合した多ファイル変更、billing/legal/authとremote PreviewはCodex。1ファイルのcaption/ARIA/analytics読取監査をLOCAL_SAFEとしてQwenへ。Qwen49秒単独完了、runner55秒、採用review済み。提案のうち曖昧なアクション表現は使わずCodexが顧客向けに短く具体化。独立QAでkeyboard操作誤認を検出し親が表示のみinert補修。次回もこの小さな分析スコープを利用可能。
