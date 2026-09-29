# GARAGE LINK 全体改修 実行台帳

状態: 実装・自動検証済み、最終実操作と受入未達の記録中（未完了）

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

### 2026-09-26 04:25 JST — frozen code and draft PR
- candidate04 source hash 8d88faf93fbcb85941980f0034510f5e0e96905516148a336bbf0ef2c12c0798, build/lint/type/security388/QA99 PASS. Mobile14files/144SSR and DB6suites inherited only after exact source match.
- Web124 inventory:78PASS,42BLOCKED_FEATURE_MOVED,2BLOCKED_NOT_IMPLEMENTED,2BLOCKED_EXTERNAL_SIDE_EFFECT. Mobile36 RNWeb real-API screens passed save/reopen. Native iOS final logout/one-tap login/process restart session restore passed; native business checks continuing.
- Feature commit a7cf7d75fb0dadcf3439c1565ad3e5a612fe08d5 pushed, Draft PR https://github.com/nextdial01/garage-link/pull/36 created and attached. Read-back confirms draft/open/main base/correct head, Actions runs0. No Production or main modification.
- Full acceptance remains blocked; no complete/PASS declaration. Remaining evidence-only additions will keep the code candidate unchanged.

### 2026-09-26 04:40 JST — legacy NULL lifecycle regression resolved
- Confirmed that the DOB requirement incorrectly blocked unchanged legacy customers from archive/restore. Added a narrowly scoped trigger exception; normal edit/create, future date, mixed field changes and cross-store/viewer writes remain rejected.
- Candidate05 DB all6 suites PASS, including fresh/upgrade positive/negative lifecycle cases. Application700files match04, so build/Web/Mobile evidence inherited transparently. Actual UI archive→trash→restore→reopen/reload passed, normal-save PATCH remained blocked, error counters0. No UI change required.
- Native iOS business verification continues; full route acceptance stays BLOCKED. PR remains draft.

### 2026-09-26 04:47 JST — repeatable verification gaps
- Final review found that the new overhaul SQL contracts were only in the dedicated audit runner, not package test:db:fresh. Added isolated fresh/upgrade lanes to the existing standard runner; baseline coverage and owned-container cleanup preserved. Standard command rerun underway, candidate06.
- Standard Web tests/e2e suite had not been executed in this run despite custom real Playwright operation evidence. Auth auditor is running safe local cases and will update obsolete DOB/maker expectations without weakening assertions. External Stripe lifecycle remains prohibited/BLOCKED.

### 2026-09-26 04:49 JST — first-login hydration cause reproduced
- Standard E2E initial32:25PASS,5FAIL,2SKIP. Several failures were obsolete selectors, but delayed JS experiment proved real product behavior: SSR login fields accepted text while React state stayed empty after hydration, leaving submit disabled. LP menu also accepted a pre-handler click without opening.
- Auth auditor is adding a shared hydration readiness guard and regression tests; final candidate/build/auth sweep will be renewed. No claim that an added test delay fixes the product. Official Turnstile test-widget network validation is being investigated on a separate local runtime; human challenge remains distinct.
- Native iOS customer/vehicle/deal12 plus appointment3 routes have persisted/reopened successfully. Remaining native operations continue.

### 2026-09-26 05:10 JST — native upload and CAPTCHA regressions
- Official Turnstile always-pass test widget plus separate CAPTCHA-enabled GoTrue: initial/relogin passed, client route return exposed missing widget. Auth component now renders an already-loaded widget and cleans up its own instance; independent recheck passed. Missing token401 verified. Human challenge and invalid-token rejection are not claimed from always-pass test keys. Existing-runtime-env clone was rejected by automatic review and not executed; isolated local project alternative completed and stopped.
- Native photo URI descriptor failed in installed Expo57 converter before reaching API. Added bytes-compatible File helper preserving original filename/MIME. Initial dynamic import variant passed automated suites but raised native HMRClient setup error; candidate07 superseded. Static platform-specific helper fixes both, native upload now succeeds; reopen and remaining native screens ongoing.
- Candidate08 fixed-source build/full suites started; DB contracts unchanged from verified06. Standard E2E wait now verifies save response before navigation instead of assuming completion under5s.

## 最終写真・帳票検証の再開記録

- 候補08: Native静的File importと元ファイル名/MIME保持。Native下取り・車両写真再表示PASS、RNWeb3種写真upload→戻る→再表示PASS。
- RNWeb写真の最初の再実行は店舗切替の5秒assert待機不足で写真操作前に停止。40秒待機へ検証側を補正し同操作を再実行。
- 帳票実操作は入金後1秒でreloadする検証が失敗。保存値0を確認し、HTTP応答を待たず中断した可能性を検証中。製品PASSにはまだ読み替えず、200応答とDB500円一致を待つ検証に補正。
- 固定ビルドでメール確認用NEXT_PUBLIC_AUTH_CONFIRM_ORIGIN不足を検出。同じ候補08sourceでローカルpublic設定を補い再build中。既存dev確認成功だけで固定ビルドPASSとはしません。

- 入金の切り分け: 固定08ローカルbuild63001で同じ請求書を開き、500円を登録→API200→DBpaid_amount500→reload→コピー導線再表示PASS、監視issues0。検証の早すぎるreloadを除くと正常。フル帳票journeyでも同じ成功応答待機へ統一して再実行します。

- メール確認origin診断の訂正: 公開設定不足だけではなく、releaseのHTTPSドメインallowlistとdevelopmentの3001/62321限定が正しく作動していた。63002設定補完で迂回できず、安全制約を維持。auth mail6routeは同一候補sourceの許可済みdev3001で最終実操作し、release63001/63002の業務操作と環境を分けて記録する。

## 固定コード候補08のWeb最終照合

担当104画面58PASS/46BLOCKEDと、親の20業務・帳票画面PASSを統合。Web124画面=78PASS/46BLOCKED。移行案内42、未実装設定2、外部副作用2をPASSへ変換しない。親の入金・部品保存は成功応答と正規一覧遷移を待ち、再表示で保存値一致。Web監視のNext prefetch/明示reload中断はヘッダーと同画面の値一致から分類し、元の観測履歴を維持。

同一候補code936ファイルdrift0。独立17ファイルreviewで新P1/P2なし、既存E2E入力検査の弱化なし。PR候補245ファイルの既知secret照合0、JWT型値0。最終native結果と追加証跡統合後に再スキャンする。

## Native詳細の税区分不足を検出し候補10へ

Nativeの見積詳細で1364円という税抜内訳が無区分で表示される実不具合を検出。見積/請求detailへ数量・snapshot単価区分、net行区分、保存済み小計・値引・消費税・下取り・支払済額の内訳を追加する。amountへtax_amountを足して税込行額を再計算しない（tax_amountは全体値引後の配賦値である）。DB保存値・合計・API・認証・Web・migrationは変更しない。

MIXED_RISK分類: 会計の意味・履歴・統合はCodex。独立した純粋ラベル2関数と既存回帰試験のLOCAL_SAFE childを正式Qwen runnerへ先行委譲。exact clean child/原本HEAD一致/2path存在・realpath検査を通したがprovider_circuit_openでモデル実行前停止。追加probe/retry/model切替をせず正式handoff。Codexがラベルhelperと表示を補完した。

既存quote_items.quantity/unit_priceはNULL許容のため、新追加の数量/単価表示はNULLを『未設定』とし、0円に意味を変えない。候補10の初回freeze後にこの防御を追加したため途中freezeを不採用とし、最新を再固定。最終候補は08ではなく10。Web/DB/lock不変の継承照合、Mobile全自動試験とRNWeb36実操作を再実行する。

- 候補10 final: Mobile15suite/型/lint/SSR144 PASS、独立review新P1/P2なし。936code digest f8b7ae5df5acf15b80216101a059c963da38f842ae58566f0554d6f6be0f1b55、Web/DB/API/auth/lock一致。
- fresh owner contextでRNWeb36全画面を再実操作しPASS。写真3/PDF2/API契約10もPASS。console/pageerror/failedrequest/HTTP監視の最終観測errors0。製品patch3file前後hash差分0。税額の検証側455円固定期待は行丸めと違ったため保存小計4546/税454/合計5000とUIの一致へ補正し、計算仕様を変更していない。

## 最終実操作の統合
Native33業務＋3auth/store/today=36route主操作・再開PASS。候補10のquote/invoiceは明示Reload後に税区分と保存額を照合し、元quote4500/元invoice5000不変、copy5500/paid500/unpaid5000一致。写真3種decoded再開PASS。Native PDFはquote実印刷前previewとinvoice UI生成cache PDFのrender照合、OS請求preview成功とはしない。全console/HTTP監視の未確認を維持。Web124=78PASS46BLOCKED、fresh RNWeb36=36PASS。全受入はBLOCKEDのまま、Draft PR36へ最終コード/証跡を反映する。
