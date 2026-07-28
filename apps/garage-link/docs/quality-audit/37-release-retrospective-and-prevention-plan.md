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

## 今回の安全成果

- Current DB変更0、追加migration0
- Vercel environment変更0、deploy0
- Production/L-LINK既存projectのpause/delete/流用0
- Stripe/LINE/L-LINK/email/Push送信0
- rollback不要
