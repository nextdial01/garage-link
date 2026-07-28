# GARAGE LINK 発見事項

更新日: 2026-07-28  
正本: `/Users/ksk/garage-link/apps/garage-link/docs/quality-audit`（現在の製品修正・検証状態）

| ID | 重大度 | 優先度 | 種別 | 対象 | 問題 | 根拠 | 影響 | 修正案 | 状態 |
| -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| TENANT-001 | Critical | P0 | Confirmed Security Issue | membership admission | 修正前は任意storeへの自己所属が可能だった | `20260726000100_membership_admission_lock.sql`、G1-A DB/security回帰 | remote未適用環境ではtenant越境 | G1-Aをfresh/upgrade Gate後に適用 | **コード修正済・分離DB PASS・remote未適用** |
| AUTH-001 | Critical | P0 | Confirmed Security Issue | role-aware write | 修正前はviewerが主要業務表へ直接writeできた | `20260726000200_role_aware_business_write_lock.sql`、G1-B DB/security回帰 | remote未適用環境では業務データ改変 | G1-Bをfresh/upgrade Gate後に適用 | **コード修正済・分離DB PASS・remote未適用** |
| AUTH-002 | High | P1 | Confirmed Security Issue | 旧membership互換 | canonical化後もlegacy write/RPCが残っていた | `20260728000100`でwrite revoke・canonical RPC再定義、old-only動的拒否 | 将来のfallback復活 | forward migrationをCurrentへ適用 | **Local Resolved / Current確認待ち** |
| AUTH-003 | High | P1 | Confirmed Security Issue | 会計CSV export | 修正前はviewer/staffも会計・顧客情報をexportできた | `accounting-export/route.ts`のowner/admin/implementer guard、監査log、Route smoke viewer=403 | remote未適用環境では会計・PII持出し | G1-Cをremote Gate後に適用 | **コード修正済・local API PASS・remote未適用** |
| AUTH-004 | High | P0 | Confirmed Release Blocker | 管理者メールOTP bootstrap | canonical admin context取得自体がDB pre-request OTP enforcementに拒否され、外部メール停止下でchallenge作成・検証へ到達できない循環依存がある | `20260728000200`のservice-only canonical helper、trusted-session invalidation、Preview QA negative fixture、Current ledger 51 | owner/admin/implementerの認証後Preview回帰とProduction smokeを安全に完了できない | canonical membershipだけを参照するservice-role限定helperとPreview限定sinkを使用する | **Resolved / Current Applied / Preview regression待ち** |
| TENANT-002 | High | P1 | Confirmed Data Integrity Issue | 親子scope | 修正前は自store childへ他store parent IDを関連付け可能だった | `20260726000500...sql`の複合FK 61件、cross-store fixture拒否 | remote未適用環境では関係汚染 | 事前不整合0を確認してG1-C適用 | **コード修正済・fresh/upgrade/rollback/restore PASS・remote未適用** |
| TENANT-003 | High | P1 | Confirmed Data Integrity Issue | active store | 修正前はmembership/store scopeを書き換える旧切替がG1-Cで停止され、複数storeの安全な選択経路がなかった | `20260727000100_active_store_preference.sql`、`13-active-store-preference-report.md`、2/10 worker・Chrome smoke | remote未適用環境では正規切替不能または旧実装のscope事故 | 44-entry precheck後にG1-Dをremote Gateで適用 | **コード修正済・fresh/upgrade/rollback/browser PASS・remote未適用** |
| LLINK-001 | High | P1 | Potential Risk | S2S credential scope | 修正前は共有key IDとtenant/storeの対応がなかった | `line_link_connections`、nonce tenant複合FK、Route mockで正scope 200・他tenant 403・replay 401 | remote未適用環境では正しい共有鍵によるstore改ざん余地 | connection行・key rotation手順をstagingで構成後に適用 | **コード修正済・mock/DB PASS・remote未適用** |
| VEHICLE-001 | Critical | P0 | Confirmed Data Integrity Issue | 車両売約 | 修正前は同一車両を複数商談で同時成約できた | `20260726000300_vehicle_sale_atomicity.sql`、2/10/100 worker各成功1、active claim 1 | remote未適用環境では二重販売・二重納車 | G3をfresh/upgrade Gate後に適用 | **コード修正済・分離DB PASS・remote未適用** |
| VEHICLE-002 | High | P1 | Confirmed Data Integrity Issue | 売約取消・会計・納車 | 修正前は納車後返品・契約訂正の正本がなく、手動処理で元履歴破壊・二重返金・検品前在庫復帰の余地があった | `20260727000300_delivered_sale_correction.sql`、case/refund/restock 2/10/100 worker、process-kill、API回帰 | remote未適用環境では納車後処理の状態不一致 | G4-Bをremote Gate後に適用。法務・外部手続きは手動確認を維持 | **コード修正済・分離DB/API PASS・remote未適用** |
| QUOTE-001 | High | P1 | Confirmed Data Integrity Issue | 売約見積 | 修正前は売約に使用した見積のsnapshotがなく、別商談見積もactiveのまま残った | sale claimの`quote_id`、snapshot guard、競合見積`expired` trigger、G4-A DB回帰 | 売約根拠金額の改変・重複提案 | G4-Aをremote Gate後に適用 | **コード修正済・分離DB PASS・remote未適用** |
| INVOICE-001 | High | P1 | Confirmed Data Integrity Issue | 請求発行・取消 | 修正前は発行済み請求の金額・状態を直接変更でき、売約取消と請求取消が分割されていた | invoice header/item guard、issue/void RPC、cancel sale統合、Route smoke | 請求金額改変・部分取消・番号再利用事故 | G4-Aをremote Gate後に適用 | **コード修正済・分離DB/API PASS・remote未適用** |
| PAYMENT-001 | High | P1 | Confirmed Data Integrity Issue | 入金・返金 | 修正前は請求の`paid_amount`直接更新で履歴・冪等性・返金上限を保証できなかった | append-only ledger、payment/reversal RPC、2/10/100 worker、過入金/過剰返金拒否 | 二重入金・二重返金・証跡消失 | G4-Aをremote Gate後に適用 | **コード修正済・分離DB/API PASS・remote未適用** |
| DB-001 | High | P0 | Confirmed Bug | fresh baseline / DR | 通常PostgreSQLにはSupabase標準schema・roleがなく、さらに公式DBでは`pgcrypto`が`extensions`配下のためG1-A/G3関数が未修飾`digest()`を解決できなかった | `001_initial_core_tables.sql:63`、`20260726000400_fresh_supabase_extension_compatibility.sql`、G0-B fresh/upgrade/restore CI | 修正前は新環境構築・DR・招待・売約が失敗 | 公式Supabase PostgreSQL bootstrap、manifest/ledger、repair、catalog fingerprintをCI固定 | **ローカル修正済・fresh/upgrade/rollback/restore PASS・remote未適用** |
| DB-002 | Critical | P0 | Confirmed Data Integrity Issue | 現行テスト環境のmembership承認状態 | 唯一のactive owner membershipで`joined_at`がNULLであり、G1-Aのactive membership成立条件を満たさなかった | fingerprint tenant `cbc9a4f71eee`、membership `096c2c207e42`。operatorが正規owner/招待承認済みを確認。correlation `dec35909-f204-4914-8b94-53bf35ae79cb`で`joined_at`をrepair実行時刻へ1行更新し、audit 1行。C5はNULL 0、invalid 0、owner 1、duplicate 0、scope mismatch 0 | 修復前はG1-A適用不能。修復後はC5を通過 | 緊急rollback runbookを保持し、C6以降は別工程で実施 | **Resolved in Current Data / C5 PASS / migration 0** |
| DB-003 | High | P0 | Confirmed Bug | Current Supabase upgrade compatibility | Current Supabaseにはcanonical fresh schemaで必須の`payment_items`、`trade_in_vehicles`、`delivery_overage_logs`、`delivery_usage_logs`がなく、G1-C migrationが4 relationを無条件参照していた | `20260726000450_restore_required_baseline_relations.sql`をG1-C直前へ追加。4表をrequired-present contract化し、全欠落・各1表のみ存在・全存在・不正shapeのupgrade fixtureを検証。`pnpm test:db:db003`、`pnpm test:db:fresh`、`pnpm verify:g0b` PASS | 修正前はC6がG1-Cで停止。修正後のlocal upgradeは4表をexpand作成してG1-Cへ到達 | 新snapshot、post-repair backup、Current read-only preflight、operator承認後に00450を含む9 migrationを適用する | **Local Resolved / Current未適用 / C6再preflight待ち** |
| DB-004 | High | P0 | Confirmed Data Integrity Issue | Current store tenant scope | Currentの5店舗中4店舗で`stores.tenant_id IS NULL`。G1-Cは`G1C_PRECHECK_STORE_WITHOUT_TENANT`で明示停止する | post-DB-002 backupのnetwork-none監査とCurrent REST read-onlyを二重照合。safe store fingerprint 4件、active 3・trial 1。`21-g5r-c6-repreflight-report.md` | G1-C以降の9 migrationを安全に開始できず、所属tenantを推測すると越境scopeを作る | 各店舗の正式tenant所属を人間確認し、別operator承認・監査付きdata repair・backup・C5再監査を行う | **Open / C6 BLOCKED / Current変更0** |
| DB-005 | High | P0 | Confirmed Bug | G1-A Current upgrade compatibility | DB-004 R1/C5は`trial` store上のactive membershipを有効とするが、G1-A precheckはstore statusを`active`限定で拒否していた | `store_is_authorization_eligible(text)`へ集約し、active/trialのみ許可、NULL・inactive・suspended・cancelled・deleted・未知値を拒否。G1-A〜D、R1、C5を統一。fresh/upgrade/rollback/reapply/restore、Security 233件、API、lint/type/build PASS。Current C5 PASS、ledger 39、RLS 103、policy 364 | 修正前は9 migrationの1件目から適用不能。修正後はCurrent dataを変えずC6再承認直前まで到達 | 新snapshot・manifest checksumを固定し、別operator承認後に9 migrationを個別適用する | **Local Resolved / Current C5 PASS / C6再承認待ち / Current変更0** |
| OPS-001 | Medium | P1 | Operation Risk | migration順序 | `supabase/schema`の番号`037`が2件で、schema snapshotとtimestamp migrationの正本が分離している | `037_delivery_candidate_event_types.sql`、`037_signup_onboarding.sql` | 誤順序・環境差異 | 一意なbaselineとmigration ledgerへ統合 | Open |
| OPS-003 | Medium | P1 | Operation Risk | endpoint分類 | production buildは`NEXT_PUBLIC_SUPABASE_URL`を埋め込むため、runtime overrideだけでは接続先を分離できない | 最初のlocal smokeで既存の未分類loopback listener `127.0.0.1:54321`を検出。dummy token 1件以外は送らず、55432向けに再build | staging誤分類・誤接続 | build artifactへenvironment fingerprintを付与し、接続先allowlistをGate化 | Open / データ変更証跡なし |
| OPS-004 | Medium | P0 | Operation Risk | Preview safety | PreviewとProductionが同じCurrentを参照する方式をオーナー承認。実顧客投入前のtest-only期間に限定し、外部送信・automation・Stripe liveをアプリとVercelの二層で停止する必要がある | `35-current-backed-preview-validation-report.md`、`evidence/current-backed-preview-validation.json`。3 safety variables設定、release guard、Security 240、API/build PASS | guard未反映の既存deploymentで外部送信credentialが利用可能 | release commitをpushして新Previewへguardを反映し、外部送信0とruntime回帰を確認 | **Remediated locally/configured / Preview deploy待ち** |
| OPS-005 | Medium | P0 | Operation Risk | Supabase CLI logging | `supabase db dump --dry-run`が一時DB login passwordを標準出力へ含める | C6再preflight中に発生。値は再掲・文書保存せず、以後dry-run禁止。DB変更0 | log閲覧者が一時資格情報の有効期間中にDBへ接続できる可能性 | dry-run禁止、CLI資格情報の失効/revoke確認、secret redaction wrapperをGate化 | **Open / expiry・revoke人間確認待ち** |
| OPS-006 | Medium | P0 | Operation Risk | C6 runbook checksum | DB-005後のmanifest総SHAは更新されたが、runbookのmigration別checksum 4件が旧値のままだった | manifest参照＋自動生成blockへ変更し、`check-c6-migration-integrity.mjs`で9/9 PASS | 解消。手動転記driftを再発防止 | 正本2点から機械生成・検査を継続 | **Resolved / 9/9 PASS** |
| OPS-008 | Medium | P0 | Release Operation Gap | Preview認証・環境scope | Preview callback allowlist、Preview限定OTP sink、Preview app URL、test webhook、role fixture/cleanupが未完成で、メールcredentialもPreviewへ過剰scopeされている | callback allowlist、Preview-only sink/mock variables、external-send deny、fixture/cleanup contract | 認証後回帰を実行不能、設定誤用時の外部送信リスク | 新PreviewへBatch commitを反映しFull Regressionする | **Remediated / Preview deploy待ち** |
| BILL-003 | High | P1 | Confirmed Runtime Bug | Stripe server-side store scope | checkout/change-plan/change-options/downloadと一部webhookがservice-role clientで`stores`を直接SELECTするが、Current ACLはservice roleへ同表SELECTを許可していない | canonical membership/subscription scopeへ置換、service-only billing helper、Current ledger 51 | plan変更・請求書download・一部webhook処理が権限エラーになり得る | tenant-scoped helperと既存G7 idempotency/reconciliationを維持 | **Resolved / Current Applied / Preview regression待ち** |
| CRON-001 | Medium | P1 | Confirmed Runtime Bug | automation store enumeration | service-role automationが`stores`を直接列挙するがCurrent ACLはSELECTを許可しない | service-only eligible-store RPC、automation disabled guard | automation解禁時に処理不能。現在はautomation guardで停止中 | 外部送信解禁前Gateでmanual smokeする | **Resolved in code/DB / automation再開は別Gate** |
| DB-006 | High | P0 | Confirmed Bug | G1-A owner precheck / legacy compatibility | canonical active owner判定へlegacy `store_members`一致条件が混入し、正規ownerを0件と誤判定した | `memberships`のみでactive ownerを判定し、legacy driftはNOTICEへ変更。9 fixture、fresh/upgrade/rollback/reapply、Current targeted precheck PASS。Currentへ9 migrationを適用しledger 48 | C6を誤停止していたが、認可正本・RLSを弱めず解消 | migration SQL実体＋manifestをchecksum正本とし、legacy driftは監査情報として継続観測 | **Resolved / Current Applied / C6 PASS** |
| TEST-001 | Medium | P2 | Test Gap | 問い合わせ管理check | 旧文字列検査は前回の最小修正で現実装を検査するよう更新済み | `pnpm test:inquiry-response-management` PASS | なし（今回回帰範囲） | DB fixture検査へ段階移行 | **Resolved / PASS** |
| TEST-002 | High | P1 | Test Gap | DB・Browser E2E | DB fresh/upgrade/rollback/restoreと実Route Handler API smokeはCI化済み。通常browser E2Eのbundled Chromium固定だけ未完 | `pnpm verify:g0b`、`run-g0b-ci.sh`、`run-g0b-api-smoke.sh`。G3-R時の通常E2Eはbrowser executable欠如 | UI回帰は既存Chromeでの手動確認に依存 | browser artifactを別jobへ固定し、容量・checksumを管理 | **DB/API範囲修正済・Browser範囲Open** |
| TEST-003 | High | P1 | Test Gap | C5 read-only Gate SQL | `DECLARE v record`が`public.vehicles v` aliasを隠し、C5が`record \"v\" is not assigned yet`で停止する | table aliasだけを`vehicle_row`へ変更。旧表現へ戻したstreamのSHAが旧正本と一致し、検査条件差分0を確認。新SHA `f454cf02...`でCurrent C5全体PASS、ledger 39、RLS 103、policy 364 | 解消。Current data変更0、migration 0 | 9 migrationは別operator承認後に個別適用・各回検証する | **Resolved / Current C5 PASS** |
| UX-002 | Medium | P2 | UX | viewer操作表示 | viewerの売約APIは403だが、商談詳細の保存操作が表示されたまま | 既存Chrome mobile smoke: `buttonVisible=true`, mutation 403, error表示あり | 誤操作・不要なエラー | UI Batchでroleに応じて無効化し理由を表示 | Open / 今回は未修正 |

## G3-R再集計

- コード未修正Critical: **0件**
- remote未適用Critical: **3件**（TENANT-001、AUTH-001、VEHICLE-001）
- 全体のコード未修正・未完了High: **16件**（AUTH-002、AUTH-003、BILL-001、BILL-002、INVENTORY-001、INVOICE-001、MEMBER-001、PAYMENT-001、PII-001、QUOTE-001、SERVICE-001、STRIPE-001、STRIPE-002、TENANT-002、TENANT-003、VEHICLE-002）
- コード修正済み・remote確認待ちHigh: **1件**（DB-001。Critical 3件は上段で別集計）
- 動的確認待ちHigh: **1件**（LLINK-001）
- 仕様確認High: **1件**（VEHICLE-002会計連動、コード未完了17件との重複分類）
- High Test Gap: **1件**（TEST-002）

全体のopen Highは重複なしで19件（DB-001とTEST-002は残存範囲を含む）。対象外Highは会社OS側の初回監査版の根拠・状態をcarry-overし、削除・解決扱いにはしていない。

## G1-C再集計（本節を現在状態の正本とする）

- コード未修正Critical: **0件**
- remote未適用Critical: **3件**（TENANT-001、AUTH-001、VEHICLE-001）
- コード未修正・未完了High: **14件**（AUTH-002、BILL-001、BILL-002、INVENTORY-001、INVOICE-001、MEMBER-001、PAYMENT-001、PII-001、QUOTE-001、SERVICE-001、STRIPE-001、STRIPE-002、TENANT-003、VEHICLE-002）
- コード修正済み・remote確認待ちHigh: **4件**（AUTH-003、DB-001、LLINK-001、TENANT-002）
- High Test Gap: **1件**（TEST-002のbrowser範囲）
- 全体open High: **19件**。G1-Cで解消したIDもremote未適用のためopen分類を維持する。

## G1-D後の再集計（2026-07-27）

- コード未修正Critical: **0件**
- remote未適用Critical: **3件**（TENANT-001、AUTH-001、VEHICLE-001）
- コード未修正・未完了High: **13件**（AUTH-002、BILL-001、BILL-002、INVENTORY-001、INVOICE-001、MEMBER-001、PAYMENT-001、PII-001、QUOTE-001、SERVICE-001、STRIPE-001、STRIPE-002、VEHICLE-002）
- コード修正済み・remote確認待ちHigh: **5件**（AUTH-003、DB-001、LLINK-001、TENANT-002、TENANT-003）
- High Test Gap: **1件**（TEST-002のbundled browser artifact範囲）
- 全体open High: **19件**。TENANT-003はローカル解消したがremote未適用のためopen分類を維持する。

## G4-A後の再集計（2026-07-27・現在状態の正本）

- コード未修正Critical: **0件**
- remote未適用Critical: **3件**（TENANT-001、AUTH-001、VEHICLE-001）
- コード未修正・未完了High: **10件**（AUTH-002、BILL-001、BILL-002、INVENTORY-001、MEMBER-001、PII-001、SERVICE-001、STRIPE-001、STRIPE-002、VEHICLE-002の納車後仕様）
- コード修正済み・remote確認待ちHigh: **8件**（AUTH-003、DB-001、INVOICE-001、LLINK-001、PAYMENT-001、QUOTE-001、TENANT-002、TENANT-003）
- High Test Gap: **1件**（TEST-002のbundled browser artifact範囲）
- 全体open High: **19件**。QUOTE-001、INVOICE-001、PAYMENT-001はローカル解消、VEHICLE-002は会計取消範囲を解消したが納車後の返品・契約訂正仕様が残る。

## G4-B後の再集計（2026-07-27・現在状態の正本）

- コード未修正Critical: **0件**
- remote未適用Critical: **3件**（TENANT-001、AUTH-001、VEHICLE-001）
- コード未修正・未完了High: **9件**（AUTH-002、BILL-001、BILL-002、INVENTORY-001、MEMBER-001、PII-001、SERVICE-001、STRIPE-001、STRIPE-002）
- コード修正済み・remote確認待ちHigh: **9件**（AUTH-003、DB-001、INVOICE-001、LLINK-001、PAYMENT-001、QUOTE-001、TENANT-002、TENANT-003、VEHICLE-002）
- High Test Gap: **1件**（TEST-002のbundled browser artifact範囲）
- 全体open High: **19件**。VEHICLE-002はG4-Bでローカル解消したが、remote未適用と残存法務・外部手続き仕様のためopenを維持する。

## Current Supabase controlled-test rehearsal後の再集計（2026-07-27・現在状態の正本）

- コード未修正Critical: **0件**
- current Supabase未適用Critical: **3件**（TENANT-001、AUTH-001、VEHICLE-001）
- current data Critical: **0件**（DB-002はoperator承認repair後にC5 PASS）
- コード未修正・未完了High: **10件**（既存9件＋DB-003）
- コード修正済み・current確認待ちHigh: **9件**
- High Test Gap: **1件**（TEST-002のbundled browser artifact範囲）
- migration適用数: **0件**。DB-002 repairのみmembership 1行＋audit 1行を変更し、migrationは別工程に維持。

## DB-003ローカル修正後の再集計（2026-07-27・現在状態の正本）

- データC5: PASS（Critical不整合0、old-only 4は自動移行なし）。
- C6 migration readiness: **再preflight待ち**。ローカルでは欠落4 relationをG1-C前にexpandする互換migrationとfail-closed contractを実装済みだが、Current Supabaseへは未適用。
- コード未修正Critical: **0件**。
- current Supabase未適用Critical: **3件**。
- コード未修正High: **9件**。
- コード修正済み・current確認待ちHigh: **10件**（既存9件＋DB-003）。
- migration適用数: **0件**。Current Supabase変更0件。

## G5-R C6再preflight後の再集計（2026-07-27・現在状態の正本）

- C5/C6 readiness: **FAIL-CLOSED**。DB-002は維持、DB-003の4 relationは予定どおり`PENDING_CREATE`だが、`stores.tenant_id NULL`4件でG1-C precheck不合格。
- コード未修正Critical: **0件**。
- Current未適用Critical: **3件**。
- コード・Current data未修正High: **10件**（既存9件＋DB-004）。
- コード修正済み・Current確認待ちHigh: **10件**（DB-003を含む）。
- migration適用: **0件**、Current data変更: **0件**。
- `OPS-005`はMedium/P0でHigh集計外。CLI一時資格情報の失効確認までC6を停止する。

## DB-004 repair準備後の判定（2026-07-27・現在状態の正本）

- tenant NULL 4 storeは、旧signupがtenantなしで個別作成したstore・old-only owner・subscriptionの組である。
- canonical membership、created/updated actor、store audit、Auth scope metadata、tenant付き子データ、tenant付きsubscriptionは全て0。
- 唯一のactive tenant `cbc9a4f71eee`と4 storeを結ぶ客観的証拠は0。singleton tenantを割り当て根拠にしない。
- A 0件、B 0件、C 4件。`stores.tenant_id`だけを更新できるrepair候補は0件。
- DB-004は**Open / High / P0**を維持。正式tenantが不存在ならtenant recoveryは別Batch・別承認とする。
- Current data変更0、migration 0。詳細は`22-db004-store-tenant-repair-plan.md`。

## DB-004 independent tenant recovery設計後の判定（2026-07-27・現在状態の正本）

- オーナーは4 storeを既存tenantへ統合せず、各storeに新tenantを1件作成する方針を承認した。これにより「割当可能な既存tenant候補なし」という旧C分類は設計上解消した。
- owner候補は別評価でA 0、B 4、C 0。3件はlegacy owner、1件はlegacy staffで、いずれもAuth確認・sign-in実績はあるがowner操作auditが0のため、Current変更前に個別のowner明示承認が必要。
- CurrentにはG1-Dのassignment/preference tableが未存在（read-only REST 404）。manifest順序を壊さず、R1 tenant recovery後、別承認のC6/G1-Dでassignment・preferenceを完成する二段階方式が必要。
- `DB-004`は **Recovery design approved / execution BLOCKED / High / P0**。Current data変更0、migration 0。詳細は`23-db004-independent-tenant-recovery-plan.md`。

## DB-004 R1承認後の判定（2026-07-27・現在状態の正本）

- owner候補4件とR1 scopeはoperator承認済み。
- 一時DB credentialのrevoke/expiry/rotation確認がなく、明示停止条件によりtransaction開始前でBLOCKED。
- tenants/store/membership/subscription/auditの変更は全て0、migration 0、post-R1 backup/C5はNOT TESTED。
- 詳細は`24-db004-r1-execution-report.md`。
- 追記: Currentへ接続せずSQL Editor operator packageを作成し、Current相当fixtureでtransaction独立性・冪等性・部分更新0を確認した。DB-004は **Open / operator execution pending / High / P0**、C6は引き続きBLOCKED。
- 実行追記: SQL Editorで4 store R1とpostcheckがPASS。tenant/store/membership/subscription/auditの許可20行操作を完了し、store tenant NULL 0、recovery tenant 4、audit 4、ledger 39、RLS 103、policy 364を確認した。DB-004 data repairはCurrentでResolved。Free Planでpost-R1 backupを取得できずC5はNOT TESTED、C6はBLOCKEDを維持する。

## Current R1-C6一括承認後の判定（2026-07-27・現在状態の正本）

- R1〜C6と条件付き9 migrationのscopeは承認済み。
- credential措置種別・日時・operator欄が未入力で、Phase 1をBLOCKED。
- Current接続0、data/audit/migration変更0、後続Gateは全てNOT TESTED/BLOCKED。
- 詳細は`25-current-supabase-r1-c6-integrated-execution-report.md`。

## Current C6実行後の再集計（2026-07-27・最新正本）

- DB-004 R1、post-R1 backup、C5はPASS。
- C6直前GateもPASSしたが、1件目G1-Aがactive membership＋trial store 1件を拒否しtransaction rollbackした。
- migration適用: **0件**、ledger: **39件**、Current想定外変更: **0件**。
- RLS table: **103件**、policy: **364件**（不変）。
- コード未修正Critical: **0件**。
- Current未適用Critical: **3件**。
- コード・upgrade contract未修正High: **10件**（既存9件＋DB-005）。
- DB-005解消、local upgrade回帰、manifest/snapshot更新、再承認までC6、本番migration、deploy、正式公開は不可。

## DB-005修正・C5再実行後の再集計（2026-07-27・最新正本）

- DB-005: **Local Resolved**。store authorization eligibilityは`active`/`trial`のみ。trial単独では権限を付与せず、canonical active membership・role・tenant/store整合が必須。
- Current C5: **PASS**。既存trial store 1件を含むactive membership、scope、sale/accounting、DB-003 pending stateに新規不整合0件。
- Current migration適用: **0件**、Current data変更: **0件**、ledger: **39件**、RLS/policy: **103/364**。
- コード未修正Critical: **0件**。Current未適用Critical: **3件**。
- コード未修正High: **9件**。DB-005はコード修正済み・Current適用待ちHighへ移動。
- C6は新snapshot `44eae79c...`とmanifest checksum `3f0358fc...`に対するoperator再承認待ち。
- 詳細は`29-current-c6-migration-execution-report.md`。

## Credential措置後のPhase 1判定（2026-07-27・現在状態の正本）

- PAT revokeの日時/operatorと旧credential無効を確認。
- snapshot/manifest/local project・host fingerprintは一致。
- 新credentialがCodexのCLI profile/process環境に未構成でremote read-only query不可。Phase 1はBLOCKED。
- Current DB接続、R1、data/audit/migration変更は0。

## DB-006解消・Current C6完了後の再集計（2026-07-27・最新正本）

- DB-006は**A: precheck contract bug**。canonical `memberships`だけでowner admissionを判定し、legacy driftは監査情報へ変更した。
- Currentへ9 migrationを個別適用し、ledgerは39→48。DB-003の4 relation、G1-C/G1-D/G4-A/G4-Bのschema/data GateはPASS。
- Current整合: active owner 5、invalid membership 0、cross-tenant/cross-store/orphan 0、active sale重複0、会計不整合0。
- RLS/policy: **119/363**。target RPC missing 0、SECURITY DEFINER search_path不足0。
- Security 234、API smoke、L-LINK mock、問い合わせ管理、lint、typecheck、build、localhost browser smoke PASS。
- Current未適用Critical: **0件**。コード未修正Critical: **0件**。コード未修正High: **9件**。
- Currentはowner roleのみであるためrole別および多workerの動的Current試験は未実行。ローカル分離DB PASSと区別して最終公開Gateへ引き継ぐ。
- deploy、外部送信、正式公開は未実行・不可。詳細は`31-current-c6-migration-execution-report.md`と`32-db006-canonical-owner-remediation-report.md`。

## High remediation Batch後の再集計（2026-07-28・最新正本）

- 開始時コード未修正High 9件: AUTH-002、BILL-001、BILL-002、INVENTORY-001、MEMBER-001、PII-001、SERVICE-001、STRIPE-001、STRIPE-002。
- 9件すべて: **Local Resolved / Current確認待ち**。forward migration `20260728000100`はCurrent未適用。
- 非owner gap: admin/staff/viewer/inactive/old-only/他tenant/assignment外を分離DBで動的確認しPASS。Currentへfixture作成なし。
- TEST-002: 既存Chrome固定の`test:e2e:local-chrome`を追加し、localhost 9 route PASS。今回のstaging Gate範囲はResolved。
- Security 239、API、L-LINK mock、問い合わせ管理、lint、typecheck、build、fresh/upgrade/rollback/reapply/restore、2/10/100 worker、process-kill PASS。
- 未解消Critical 0、コード未修正High 0、Current確認待ちHigh 9。
- Current data/migration変更0、deploy/外部送信0。詳細は`33-high-remediation-batch-report.md`。

## 2026-07-28 G7 Current適用試行

- migration/manifest/snapshotは正本間で一致した。
- 新規Current backupの最初のread-only dumpがDB接続前の401で停止し、backup file 0件だった。
- backup不備の停止条件によりprecheck、migration、Current回帰は未実行。Current query/write、migration、deploy、外部送信は0件。
- High 9件はコード上Local Resolvedを維持するが、Current確認待ちのためstaging deployは不可。詳細は`34-g7-current-migration-execution-report.md`。

## 2026-07-28 OPS-007直接PostgreSQL runner

- 401となったSupabase管理API/PAT/profile/link依存を廃止し、operatorのTTY非表示入力と一時pgpassを使う直接PostgreSQL backup経路へ固定した。
- URL/passwordは引数・ログ・evidence/reportへ保存せず、終了・異常終了時に一時ファイルと環境変数を削除する。
- runner静的検査とnetwork-none使い捨てDBでのprecheck→G7 migration→postcheckはPASS。Current実行はoperator待ちで、Current変更/migration/deploy/外部送信は0件。
- `OPS-007`は運用経路の修正として**Resolved / runner ready**。High 9件はCurrent確認待ちを維持し、staging deployと正式公開は不可。

### connection_identity停止後の訂正

- 初版parserはproject refをhostだけで判定したため、refを`postgres.<ref>` usernameへ持つSession pooler URIをDB接続前に誤拒否した。製品・Current DB不具合ではなくrunner contract bug。
- Direct URIは厳密な`db.<ref>.supabase.co` host、Session pooler URIは厳密なpooler host＋usernameで判定するよう修正。別project、host suffix偽装、transaction pooler、malformed URIをfail-closedにした。
- 接続後はread-only SQLでDB user、ledger、G7未適用、GARAGE LINK固有schemaを再照合し、PASS後だけbackupを開始する。
- URI fixture 10回、異常終了pgpass cleanup、identity FAIL時DB変更0、network-none使い捨てDBのidentity→precheck→migration→postcheck、Lint、型検査がPASS。operator再実行は全テスト完了まで保留し、現在は再実行可能状態。

### 旧runner打ち切りと一回限りpassword方式

- 実接続で一時pgpassからlibpqへpasswordが渡らず、`psql -w`相当で`fe_sendauth: no password supplied`となった。Current接続・DB変更は0件。
- 旧`run-g7-current.sh`は起動直後に廃止終了するよう固定し、追加修正・再実行対象から除外した。
- 新`run-g7-current-once.sh`は既知のSession pooler host/port/database/userを固定し、TTYでDatabase Passwordだけを非表示入力する。`PGPASSWORD`をDocker内libpqへ環境変数として渡し、全Current `psql`/`pg_dump`/`pg_dumpall`に`-w`を付与。PGPASSFILE・URI parserは不使用。
- 実PostgreSQLへ別client containerから接続し、passwordなし即時失敗、誤password即時失敗、正passwordの`psql`/`pg_dump`成功、prompt/secret非出力、正常/異常cleanup、identity→backup→precheck→migration→postcheckをPASSした。

## DB-007 G7 upgrade compatibility（2026-07-28）

- **分類**: High / P0 / Confirmed Bug / Current migration BLOCKED
- **対象**: `20260728000100_high_remediation_batch.sql`とCurrent相当`public.inventory_count_items`
- **問題**: G7 migrationは`inventory_count_items.deleted_at`と`inventory_count_items.is_archived`を参照するが、post-R1 Current backupの正式schemaには両列が存在しない。
- **根拠**: Current backup cloneへSQL Editor packageを適用すると、G7 DDL開始前の互換性precheckが必須列2件の欠落を検出してfail-closedとなった。ledgerは48件のまま、G7 schema/data変更は0件。
- **影響**: 現行packageをCurrent SQL Editorで実行しても安全に停止するが、G7 migrationは適用できず、Current確認待ちHigh 9件を解消できない。
- **原因**: G7 migrationが前提とするsoft-delete列と、Currentへ適用済み48 migrationで形成された実schemaの間にupgrade contract不足がある。`auth` schema ownership errorおよび`invoice_payment_ledger`循環FK warningとは別問題。
- **修正案**: 両列を安全に追加するforward-only compatibility migrationを新規作成し、Current backup cloneでfresh/upgrade/rollback/reapplyとG7 packageを再検証する。適用済みmigrationやRLS・constraintを弱体化しない。
- **状態**: Local Resolved / Current適用待ち。forward-only `20260728000050`とG7を単一transaction packageへ統合し、Current backup cloneでledger 48→50、全rollback、契約不一致fail-closedを確認した。Current接続・migration・deploy・外部送信は未実行。詳細は`34-g7-current-migration-execution-report.md`、`evidence/g7-schema-contract.json`、`evidence/g7-backup-validation.json`。

## G7 Current適用後・staging Gate（2026-07-28・最新正本）

- Current Supabase: compatibility＋G7をCOMMIT、ledger 50、想定外変更0。
- 製品Critical: **0件**。製品High: **0件**。
- Security 239、API smoke、L-LINK mock、問い合わせ管理、lint、typecheck、production build: PASS。
- OPS-004は製品HighではなくMedium/P0のrelease operation blocker。Vercel PreviewのProduction credential共有とSupabase staging project capacity未確保によりstaging deployをfail-closedで停止。
- staging deploy、production deploy、外部送信、Current追加migration: 0件。正式公開不可。

## Release Full Discovery後の再集計（2026-07-28・最新正本）

- A〜Hのrelease prerequisiteを164項目確認。PASS 127、REMEDIATABLE 24、OPERATOR REQUIRED 2、RELEASE BLOCKER 11。
- `AUTH-004` High/P0: 管理者OTP bootstrap循環。安全なPreview sinkの前提となるcanonical admin-context helperはCurrent追加migrationを必要とするため、今回の禁止事項で即時停止。
- `BILL-003` High/P1: Stripe server routeのservice-role direct `stores` readがCurrent ACLと不整合。アプリ修正可能だがAUTH-004停止によりBatch未着手。
- `OPS-008` Medium/P0: Preview redirect/app URL/test webhook/credential scope/fixture cleanup不足。
- `CRON-001` Medium/P1: automationのservice-role store列挙がCurrent ACLと不整合。automation guard中のため外部処理は未起動。
- 新規Critical **0件**、未解消High **2件**。Current ledger 50、Current write/migration 0、追加commit/push/deploy 0、外部送信0。
- Production GateはFAIL。既存Preview `16df90b`をProductionへ昇格しない。詳細は`evidence/release-full-discovery.json`。
