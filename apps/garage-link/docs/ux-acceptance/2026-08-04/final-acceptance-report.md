# GARAGE LINK UX Acceptance 最終工程

## 判定対象

- baseline: `dbf031b150d2b91c466c83a5d1354902acf58a9d`
- branch: `codex/garage-link-ux-final-20260804`
- canonical staging: `https://garage-link-staging.vercel.app`
- Vercel project: `garage-link-staging` / `prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3`
- staging Supabase: `gaytoojzwqkpuvfofeql`
- Production denylist: `wmlpuzuskfiwdipluglz` / `garage-link.tech`

deployment IDとdeployed SHAは、このcommitから作成されるためCompany OS側の最終execution evidenceを正本とする。本ファイルは製品コードと同じcommitに含める受入・回帰仕様の正本である。

## 引き継いだ合格証拠

- admin主要8業務: 8/8 PASS
- staff主要業務: 7/8 PASS（棚卸し競合の回復表示だけをfinding化）
- full security: 333/333 PASS
- OTP request／verify／trusted session: PASS
- Chromium／WebKit起動、Modal、keyboard、focus、200% zoom、axe baseline: PASS

## PHASE 1 / FINDING FREEZE

`FINDING_FREEZE = COMPLETE`

- owner／admin／staffのrole別navigation、設定、契約表示、URL直打ちを確認
- staffの設定5 routeは権限理由と安全な戻り先を表示
- staffの設定API／契約変更API直接requestは403
- tenant／store ID差替えは403かつ同一の安全な拒否理由
- ownerによるmember追加、admin／staffの権限外招待拒否をrollback transactionで確認
- member→admin、admin→member、active→inactive、既存sessionの即時再評価、最後のowner保護をrollback transactionで確認
- `window.confirm`／`window.prompt`: 0

## Frozen findings

| ID | Severity | 原因 | 対応 |
|---|---|---|---|
| UX-ROLE-001 | High | 棚卸しの一意制約競合を共通error translatorが回復可能な状態として扱っていない | 既存棚卸しを一覧から再開する案内へ変換 |
| UX-ROLE-002 | High | 編集後stateを変更前snapshotとして再利用し、role／status RPCをskipする | 永続化snapshotを分離し、RPCの`ok` payloadを確認 |
| UX-ROLE-003 | Medium | no-row判定がerror message文字列へ依存 | 情報漏洩・主要業務阻害なしのためbacklog |

## 旧worktree差分の扱い

- `settings/members/page.tsx`: A（frozen findingに対応する正しい共通修正）としてhunk単位で移植し、RPC payload確認を追加
- `translate-db-error.ts`: Aとして制約名をremote DBで再確認後に移植
- 旧worktreeの一時Playwright、provision／cleanup script、migration: Cまたは一時監査物として不採用
- 旧`findings.md`: Dとして事実だけを本reportへ統合
- 旧worktree自体へのreset／stash／clean／上書き: 0

## Local regression

- targeted security／role／error tests: 20/20 PASS
- lint: PASS
- typecheck: PASS
- build: PASS（132/132 pages）
- full security: 335/335 PASS

初回remote targeted regressionで、DBの最後のowner拒否文が安全な共通error boundaryにより汎用fallbackへ置換される残件を検出した。既知のmembership guard文だけを具体的な復旧案内へ変換し、targeted regression後にremote-only defect対応として2回目のstaging deploymentを許可する。

## Release gate

次をCompany OS側の最終execution evidenceで満たした場合だけ `LIMITED SALES READY` とする。

- clean commitからstagingへ1回deployし、READY／canonical alias／deployed SHA一致
- remote targeted role regression、Chromium、WebKit、axe、direct request、tenant/store boundary PASS
- independent black-box PASS
- QA fixture、Auth user、storageState、trace、screenshot、video、一時runner、secret fileの残存0
- Critical 0 / High 0
- Production／Stripe Live／LINE／実顧客変更0

Medium `UX-ROLE-003` はstale URLの文言精度であり、主要業務、認可、復旧導線、データ保全を遮断しないためLimited Salesのblockerにはしない。
