# GARAGE LINK 全体改修 実行台帳

状態: 調査中・未完了

- Owner依頼: 2026-09-26、38節の全体改修。全画面の主操作・保存・再表示が合格条件。
- 正本: registry garage-link canonical_realpath のGit common dirから作成した専用worktree。
- Repository: nextdial01/garage-link
- Base: 8893ebb8ce131b22aed0e87ee8ad3f5596410048 (fetch済み最新origin/main)
- Branch: codex/garage-link-overhaul-20260926
- Worktree: /Users/ksk/kannagi/projects/garage-link/worktrees/garage-link-overhaul-20260926
- Production/main変更、Orca、GitHub Actions、実顧客送信、実決済: 禁止。
- 通常branch push/PR、local/Preview/Staging安全検証: Owner依頼の範囲。push前に本番連動設定確認。
- Existing canonical checkout dirty: 触らず保持。

## 分解と担当
1. 全体調査: LOCAL_SAFE 業務画面読み取りをQwen先行。認証/DB/検証環境はCODEX_ONLY監査。
2. 計算/数量/履歴スナップショット → DB/RPC → 共通フォーム → 各業務画面 の依存関係。認証改修は独立枝。
3. マスター候補分類・10設計案比較・安全環境の成立確認後に実装。
4. 最終凍結候補で自動試験、Web全画面、Mobile全画面、fresh session再回帰 → commit/PR。

## 現在の事実
- Web page.tsx: 123。PAGE_INVENTORY.csvを生成。すべてNOT_TESTED。
- Mobile: App.tsx / src/v2 独自状態遷移。Expo Routerのapp directoryは存在しない。到達画面の抽出中。
- Qwen初回: sandbox内loopback probe URLError、Aider未起動。復旧診断を権限付きで実施し成功。旧記録を保持し明示的input revisionで再開。現在正式runner実行中。
- Docker: 29.5.2接続確認、必要なSupabase postgresイメージ既存。
- pnpm offline install: tarball不足。lockfile固定で通常installへ。

## 計測
Qwen割当: 数量・金額の意味・重複計算・固定選択肢の独立調査。単独完了/採用/追加補修/所要時間: 結果待ち。
Codex追加: 現時点は実装なし。
テスト/build/DB/実操作: 未実施。

## 次の再開点
ローカルLLM調査結果の全件review、認証/DB監査回収、Mobile inventory、独立local-safe実装抽出。

## 02:09 JST 追加証拠
- baseline Web: typecheck PASS、lint 0error/3warning、QA unit71 PASS、security367 PASS。
- baseline DB: 57件fresh/upgrade/rollback/restore PASS、mobile追加7件 PASS、runner4 PASS。最新manual snapshot migrationは別途検証必要。
- baseline build: FAIL（Supabase環境変数未設定）。実Auth環境準備後に再試験。
- baseline Mobile: cwd修正後も既存font/preview loader/trusted-device契約のFAILあり。typecheck PASS。全画面実操作とは別証拠。
- Mobile静的route候補37件、全NOT_TESTED。wizard step/detail tabも操作契約へ追加。
- 実装前のローカルLLM調査実行中。次の独立editはPartLineItemsEditorの小数入力/表示のみ（別clean worktree準備済み、未dispatch）。

## 2026-09-26 02:38 JST integration progress (not accepted)
- Local part-form attempt: Aider372s/runner378s produced duplicated nested filenames; canonical runner rejected scope_violation, child clean/HEAD/stage/remote unchanged; review handoff recorded. Codex supplements two forms. Next brief must validate worker-relative filenames.
- Codex added shared money/master/customer/work-row helpers, master page, DOB/postal validation and atomic maintenance new link creation. Maintenance edit now work_details snapshots, legacy work name commas preserved. Part quantities use decimal validation, stock calls numeric RPC. Tax helper7unit PASS; Webtypecheck PASS before latest filter/hook changes.
- Local DB fresh+upgrade+reapply business/inline migrations tested; no production connection. Parent review still pending.
- Actual browser auth5roles initiallogin/reload PASS reported; ownerlogout/relogin/sessionrestore/wrongpassword recovery PASS. Reset callback hostname mismatch found, being fixed and retested. No fullscreen acceptance yet.
- Dedicated agents own vehicle/UI and quote/invoice integration; no commits/push. Generated Next AGENTS/CLAUDE produced by devserver, not unrelated manual policy change.

### 2026-09-26 03:15 JST — integration and actual operations
- Document reviewer reports 13 Web document routes operated with persistence/reopen; tax included/excluded switching and frozen snapshot 4 scenarios passed. Canonical evidence DOCUMENT_INTEGRATION.md and runtime/document-operations-results.json.
- Independent suites: security 385, QA 90, mobile 16 (144 SSR cases), DB migration fresh/update/rollback checks passed; baseline initial concurrent failure retained then isolated rerun passed. No GitHub Actions.
- Independent review found legacy mobile work_details=[] could erase labor; correction underway. Price storage 2-decimal precision vs 4-decimal UI mismatch needs additive precision migration. Stock guard cancellation compatibility under review.
- iOS Expo Go local runtime started via loopback-only IPv4 proxy to Expo IPv6. Maestro MCP safe wrapper injects synthetic credential only in memory, log content suppressed; no successful authentication acceptance yet. Executed commands alone do not count as PASS.
- Native forms: maker selector extended to trade-in, vehicle taxable-price display/storage conversion and unchanged-value preservation; inline edit atomic API support in progress. All changes uncommitted/unaccepted until final review.

### 2026-09-26 03:36 JST — mobile actual operations and independent findings
- Native iOS one-button login and process close/reopen session restoration verified; initial pre-API failure was stale Expo CI bundle. runtime/native-auth-results.json records scope; navigation-only is not full screen PASS.
- RN Web real local API customer create/edit/list/reopen PASS. Vehicle 4-decimal price/date/maker save/reopen verified after fresh per-ID purchase read; further stale-detail race found during customer→deal: back displayed previous entity while loading. Parent now clears views on back and requires current.id===route.id for detail rendering; retest pending.
- Decimal stock UI 10.5→9→10.5 complete, no critical errors. Maintenance responsive 390px overflow resolved. A canceled /parts navigation is retained as noncritical ERR_ABORTED, not an HTTP/server failure.
- Independent review found fee/option mobile quote allowlist gap, legacy labor loss, mixed-rate parts aggregate error, decimal price storage precision, cancel-stock guard compatibility, and service-owned reminder skip403. Corrected with focused automated/actual tests; evidence in independent-final-review.md/review-test-recovery.md/DOCUMENT_INTEGRATION.md.
- Line discount snapshot added to document lines to preserve original qty/unit price and mixed-rate tax during maintenance→quote/invoice/copy; UI/API/DB roundtrip tests passed.
- Independent build snapshot01 succeeded (QA94/Security385/Mobile20), but later fixes mean this is not final frozen-candidate build acceptance.
- CAPTCHA enabled native login originally had no challenge UI. Hosted configuration unverified; bounded challenge-only implementation selected in NATIVE_CAPTCHA_PLAN.md. Human challenge verification remains separate from local CAPTCHA-disabled success.
- Local QA output wrapper now redacts known generated fixture secrets and JWT-shaped values even on unhandled tool errors. No secrets entered into Local LLM context.
- Remote read-only preflight: GitHub Actions is enabled. Existing workflows trigger push/pull_request/schedule/manual, no pull_request_target found. Any authorized feature-branch commit/push/PR will include [skip ci] on HEAD to suppress push/PR workflow execution, per https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs . No workflow/config mutation or Actions execution is planned.

### 2026-09-26 03:56 JST — final candidate verification
- Mobile real React Native Web API journeys completed customer/vehicle/deal/appointment/trade-in create/edit/save/reopen, sale and cancellation; native iOS auth is separately verified. Stock/photo/documents have distinct persisted-operation evidence. No native-all-screen claim.
- Lost-deal resale409 is a correct pre-existing constraint; reviewed G3 contract. Corrected enabled UI action for lost deals, with a reopen instruction. Delivery verification uses a separate synthetic deal.
- Web parts and maintenance list main operations passed including save→reload→detail→back, after fixing test navigation-await selectors.
- Shared fixture global logout invalidated parallel browser sessions; sequential per-role scheduling prevents test interference. Synthetic CAPTCHA UI contract passes, actual hosted human CAPTCHA remains unverified.
- Final isolated snapshot02 build/full suites underway. Source code frozen after lost-deal UI correction; final inventory/PR evidence still pending.
