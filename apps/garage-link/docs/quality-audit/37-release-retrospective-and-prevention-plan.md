# GARAGE LINK release retrospective・再発防止計画

実施日: 2026-07-28

## 主要反省点

製品DBとローカル品質Gateは完了していた。初回は一般的な専用staging構成を優先し、既に確定していた「Currentはテスト専用」という運用前提を反映できず不要なSupabase project枠をblockerにした。最新方針へ修正後は外部送信をアプリとVercelの二層で停止しcommitまで到達したが、大量の監査資料を含むGitHub pushについて送信先・内容の明示承認粒度が不足し、Preview直前で停止した。

## 恒久的な再発防止

1. 環境方式（専用staging／controlled-test Current）をdirectiveとenvironment matrixの単一正本で固定する。
2. 外部送信、automation、Stripe liveをapplication guardとVercel variableの二層でdefault denyにする。
3. deploy sourceへ監査報告を含める範囲をrelease前に固定し、remote・branch・file countを明示承認へ含める。
4. release commit前にsecret/backup除外、全品質検査、working tree cleanを機械確認する。
5. Preview fixtureは明確なtest命名とcleanup runbookを持ち、実顧客投入前のCurrentだけで使用する。
6. 外部送信解禁はproduction smokeとmonitoring後の別Gateにする。
7. 管理者OTPは「認可context取得→challenge作成→trusted session」のbootstrap契約をDB/API/Previewの統合fixtureでrelease前に検証する。
8. service roleのtable直接参照を静的検査とCurrent ACL contractで照合し、許可されない参照をCIでFAILにする。
9. Auth redirect、Preview app URL、webhook secret、credential scopeをenvironment contractとして機械検査し、Preview作成前に不足を列挙する。
10. release discoveryはGit、environment、Auth、外部送信、全route、rollbackまで横断してから修正Batchへ入る。最初の症状だけを局所修正しない。

## 今回の安全成果

- Current DB変更0、追加migration0
- Vercel environment変更0、deploy0
- Production/L-LINK既存projectのpause/delete/流用0
- Stripe/LINE/L-LINK/email/Push送信0
- rollback不要

## Full Discoveryで得た追加反省

管理者OTPが「配送手段不足」だけに見えていたが、実際はDB pre-request enforcementがcanonical admin context取得を先に拒否するbootstrap循環だった。sinkのUI/APIだけを実装していれば認可を弱める危険な回避へ進むところだった。また、service roleを安全の同義語として扱わずACLを実環境と照合したことで、StripeとCronの直接`stores`参照もProduction直前に発見できた。今後は機能テストPASSに加え、runtime identityごとのDB grant contractをrelease Gateへ固定する。
