# GARAGE LINK G1-C Service role・tenant/store integrity report

実施日: 2026-07-26  
製品root: `/Users/ksk/garage-link/apps/garage-link`  
開始commit: `f45b0e924f611756e9f5d99e5534d73726f4c75a`  
環境: `public.ecr.aws/supabase/postgres:17.6.1.136`、`--network none`、remote接続なし  
判定: **G1-C local Completed / remote未適用 / 正式公開不可**

## 1. 対象ID

| ID | 開始時 | 今回範囲 | 結果 |
| -- | -- | -- | -- |
| TENANT-002 | High/P1 Confirmed | parent/child cross-store、scope列変更 | ローカル解消、remote未適用 |
| TENANT-003 | High/P1 Confirmed | active-store context再確認 | G1-Dでassignment＋preferenceを実装しローカル解消。remote未適用 |
| DB-001 | High/P0 remote待ち | tenant/store constraintとledger | 43-entry fresh/upgrade/rollback/restore PASS |
| AUTH-003 | High/P1 Confirmed | 会計CSV role・監査 | owner/admin/implementerのみ、viewer/staff 403 |
| LLINK-001 | High/P1 Potential | credential tenant/store binding | ローカルDB/mock解消、remote接続設定待ち |
| AUTH-002 | High/P1残存 | 背景旧表参照の再確認 | G1-C High経路の認可参照0。旧表廃止自体は未実施 |

## 2. service role一覧

ASTで31ファイルを抽出した。完全な1行単位一覧と分類は`supabase/tests/g1c_service_role_inventory.csv`を正本とする。

| 分類 | 件数 | 状態 |
| -- | --: | -- |
| G1-CでTenantContext・scope bindingを修正 | 11 | PASS |
| Stripe/billing（今回対象外） | 8 | 未変更、独立Batch |
| user-scoped auth | 5 | tenant非依存、現状維持 |
| diagnostic（service mutationなし） | 3 | 現状維持 |
| UIの環境変数ラベル | 2 | service role実行なし |
| central client factory | 1 | caller側contextを必須化する段階移行 |
| 停止済みLINE legacy送信 | 1 | route先頭で停止、到達不能。削除は対象外 |

G1-C修正対象11ファイルは、inspection Cron、retention Cron、LINE settings 2本、L-LINK S2S 3本、Google feed、L-LINK契約確認、S2S認証、Storage認証contextである。

危険な組合せの現在結果:

- public API + service role + client指定storeのみ: 0
- G1-C High経路 + contextなし: 0
- L-LINK共通key + 任意store: DB connection不一致で403
- Cron + `p_store_id=null`: 0
- service role + scope列UPDATE: immutable triggerで拒否
- service role参照を含むStripe/billing 8経路は今回未変更で、STRIPE/BILL IDとして残存

## 3. TenantContext

`src/lib/security/garageTenantContext.ts`へ`GarageTenantContext`を追加した。

- `tenantId`と`correlationId`は必須。
- store処理は`storeId`必須。
- API sourceはactor user/role必須。
- actorはsession由来、Cron/worker/L-LINKは明示source。
- `resolveStoreTenantContext`がactive storeとexpected tenantをservice DBで再確認。
- `assertServiceTenantStoreContext`が処理直前にDB RPCでtenant/storeを再確認。
- NULL、未知role、inactive store、scope不一致はfail-closed。

## 4. API scope

- `/api/accounting-export`: active membershipのtenant/store/roleを取得し、owner/admin/implementerだけ許可。viewer/staffは403。成功前に`data_export_logs`が保存できなければ503。
- `/api/line/settings`、`migrate-secrets`: session actorとmembershipからcontextを作成し、service query直前にactive store/tenantを再確認。
- `/api/vehicles/google-feed`: `VEHICLE_FEED_TENANT_ID`と`VEHICLE_FEED_STORE_ID`の両方を必須化し、DB一致を確認。tokenだけで別storeへ切替不可。
- Storage: active membership・tenant RPCに加え、service clientでstore/tenantを再確認してcontextを返す。

Route smoke結果は未認証401、viewer売約403、他scope403、売約競合409、DB障害503、会計viewer403。内部SQL・constraint・stack traceのレスポンス漏えい0。

## 5. Cron・Webhook・worker

| 経路 | 修正 | 結果 |
| -- | -- | -- |
| inspection reminder Cron | active storeをtenant/store順で列挙し、storeごとのcontextとRPCへ分割 | PASS、null scope 0 |
| expired data purge Cron | 対象tenantを列挙し、`purge_expired_store_data_for_tenant`をtenantごとに実行 | PASS、global purge EXECUTE revoke |
| Google feed worker API | env tenant/storeとDBを照合 | PASS |
| Stripe webhook | 今回対象外 | STRIPE-001/002残存 |
| LINE webhook stub | service role mutationなし | N/A、既存停止状態維持 |

複数tenant Cronは1店舗/1tenant単位でscopeと失敗を分離する。lease/run tableはCRON-001の運用改善として残す。

## 6. L-LINK連携

`line_link_connections`をservice-only tableとして追加し、key IDをactiveなtenant/store 1組へ固定した。署名済みstore IDだけを正本にせず、署名後にkey/store DB bindingを検査する。nonceはtenant/store/keyを保存し、store/tenant複合FKで拘束する。

loopback Route mock:

- 正常key/store: 200、候補0件
- 同nonce retry: 401 `replayed_nonce`
- 同じsecret/keyでtenant B storeへ改ざん: 403 `invalid_key_id`
- DB回帰: cross-tenant connection INSERTはFK violation
- ACK/inquiry/candidate静的契約: 3件PASS
- 実L-LINK通信: 未実施

## 7. parent/child scope

単一ID FKだけだった主要関係をDB catalogから抽出し、61件の複合FKを追加した。対象はcustomer/vehicle/deal/quote/invoice/payment/maintenance/inventory/LINE form・message・campaign/inspection event等である。

代表例:

- `(deals.customer_id, deals.store_id) -> customers(id, store_id)`
- `(deals.vehicle_id, deals.store_id) -> vehicles(id, store_id)`
- `(quotes.deal_id, quotes.store_id) -> deals(id, store_id)`
- `(invoices.deal_id, invoices.store_id) -> deals(id, store_id)`
- `(payment_items.invoice_id, payment_items.store_id) -> invoices(id, store_id)`
- `(maintenance_jobs.customer_id, maintenance_jobs.store_id) -> customers(id, store_id)`
- `(inventory_count_items.inventory_count_id, store_id) -> inventory_counts(id, store_id)`
- `(line_form_responses.form_id, store_id) -> line_forms(id, store_id)`

cross-store dealとcross-store inquiryをservice roleで直接INSERTしてもforeign key violationとなる。

## 8. 複合FK

- 親側unique index: 13
- parent/child複合FK: 45
- store/tenant alias複合FK: 16
- G1-C追加複合FK合計: 61
- G3既存を含む`*_store_fk` catalog総数: 65
- `line_link_connections`とnonceはstore/tenant複合FKを持つ。

追加は`NOT VALID`後に同transactionで`VALIDATE CONSTRAINT`する。既存不整合があればmigration全体をrollbackする。

## 9. tenant/store immutable

`guard_scope_columns_immutable`を57 public tableへ付与した。通常UPDATE・service roleのどちらでも`tenant_id`、`store_id`、`company_id`変更を`42501 / G1C_SCOPE_IMMUTABLE`で拒否する。tenant移管RPCは追加していない。

このため、旧`store_members.store_id`を書き換える店舗切替は安全側に拒否される。G1-Dではmembership行のscopeを変えないassignment＋active-store preferenceを追加し、正規な複数store切替を復旧した。

G3の売約status、請求状態等の非scope列は変更可能で、既存業務回帰はPASSした。

## 10. cache・集計

- AST検査でservice-role server cache (`unstable_cache`/`cache`) は0件。
- dashboard/analytics/plan usageはG1-Bのmembership-only wrapperを維持。
- A/B tenant、A1/A2/B1のRLS・role fixtureで他scope write 0。
- 会計exportはstore filterとroleを両方検査。
- CSV/PDF新規生成や仕様変更は行っていない。

G1-Dで既存Google Chromeによるstore切替、PC/mobile、複数tab、viewer/inactive、console smokeをPASSした。server cache自体は0件で、client側の通知値は再取得hintに限定し認可へ使用しない。

## 11. 既存データ監査

| 項目 | clean fresh/upgrade fixture |
| -- | --: |
| tenant/store不一致 | 0 |
| cross-tenant/cross-store parent | 0 |
| orphan | 0 |
| scope不明nonce | 0 |
| L-LINK connection不一致 | 0 |
| 決定的backfill | 0 |
| 隔離 | 0 |

不整合fixtureとして`deals.customer_id`のcross-store行を1件作成したpre-G1-C DBでは、migrationは`G1C_PRECHECK_CROSS_SCOPE`で停止した。ledger 00500行は0、既存deal/customer各1件は変更されず、推測修復0である。

## 12. migration

`20260726000500_service_role_tenant_store_integrity.sql`:

1. cross-scope read-only precheck
2. 一意に決定可能なtenant alias backfill
3. parent unique index
4. parent/child複合FK
5. store/tenant alias複合FK
6. L-LINK connection/nonce scope
7. immutable guard
8. service context RPC
9. tenant単位purge RPC
10. EXECUTE/table grant最小化

manifestは43 entry、番号衝突0、checksum PASS。runnerはlock timeout 3秒・statement timeout 120秒。fresh/upgradeでlock timeoutや待ちを観測していないが、実データ量での最大lock時間はremote staging前に計測が必要。

## 13. 動的テスト

- 2 tenant / 3 store / owner・admin・implementer・staff・viewer・inactive・old-only
- cross-store deal/inquiry: 拒否
- service correct context: true、wrong tenant: false
- tenant/store column UPDATE: 拒否
- L-LINK connection wrong tenant: 拒否
- viewer/inactive/old-only write: 0
- owner/admin正常業務: PASS
- G3 sale regression: PASS
- Route mock: 会計viewer403、L-LINK正常200/replay401/cross-tenant403

## 14. 機械的検査

| 検査 | 結果 |
| -- | -- |
| AST service role inventory | 31/31一致 |
| High scope context | 11/11 |
| user-facing `store_members`認可 | 0 |
| service-role server cache | 0 |
| SECURITY DEFINER search_path未固定 | 0 |
| `line_link_connections` authenticated/anon grant | 0 |
| public table/RLS | 63/63 |
| policy | 171 |
| migration ledger/integrity | 43/43 |
| composite scope FK | G1-C 61、catalog 65 |
| immutable guard | 57 |

## 15. 回帰結果

| 検査 | 結果 |
| -- | -- |
| fresh / 再実行 | PASS、43 applied / 43 skipped |
| upgrade | PASS |
| rollback / 再適用 | PASS、4 rollback / 5 reapply（repair依存を含む） |
| backup / restore fingerprint | PASS |
| G0-B | PASS |
| G1-A | PASS |
| G1-B | PASS |
| G3 | PASS |
| Security suite | 209/209 PASS |
| L-LINK static/mock | PASS |
| 問い合わせ管理 | PASS |
| migration runner | 4/4 PASS |
| Lint | PASS |
| TypeScript | PASS |
| production build | PASS、127 static generation完了 |

## 16. 残存High

G1-D後のコード未修正・未完了Highは13件: AUTH-002のcontract廃止、BILL-001/002、INVENTORY-001、INVOICE-001、MEMBER-001、PAYMENT-001、PII-001、QUOTE-001、SERVICE-001、STRIPE-001/002、VEHICLE-002。TENANT-003はローカル解消しremote待ちへ移行した。

コード修正済みremote待ちHighはAUTH-003、DB-001、LLINK-001、TENANT-002、TENANT-003の5件。TEST-002の固定bundled browser artifact範囲はHigh Test Gapとして残る。

## 17. remote staging項目

- project ref/DB host fingerprintを本番と二者照合
- 43-entry ledger/checksum read-only監査
- cross-scope、store tenant NULL、orphan、nonce、connection precheck全0
- L-LINK key IDと匿名test storeのconnectionをsecure operatorが登録
- backupとACL保持restore証跡
- lock監視と3秒timeout適合性
- outbound deny/mock
- 2 tenant/3 storeの匿名account
- G1-A/G1-B/G3/G1-C DB/API/browser回帰

不明・本番と区別不能・backupなし・precheck 1件以上なら適用しない。

## 18. rollback

G1-C rollbackはsecurity-preservingで、複合FK、immutable guard、credential bindingを削除しない。これらを落とすとHigh経路が復活するためである。ledgerをrolled_backにした後もG1-A/G1-B/G3/G1-C拒否試験はPASSし、再適用も冪等PASS。

本当にschemaを縮退するcontract rollbackは、対象データの人間確認と停止時間を伴う別migrationにする。

## 19. 公開可否への影響

G1-Cはローカルで完了し、TENANT-002、AUTH-003、LLINK-001のコード経路を閉じた。コード未修正Criticalは0。ただしremote未適用Critical 3件、コード未修正High 14件、remote待ちHigh 4件、browser Test Gapがある。

- remote stagingへ進むか: **接続前preflight準備のみ可**
- remote staging適用: operator承認・backup・precheck 0後のみ可
- 本番適用: **不可**
- 正式公開: **不可**

## G1-D互換性追補（2026-07-27）

- G1-Cのimmutable guardを維持したまま、`membership_store_assignments`と`user_active_store_preferences`を追加した。
- active storeの切替はpreferenceだけを更新し、service role TenantContext、membership、role、target scopeの確認を省略しない。
- owner/adminのtenant-wide store accessを維持し、lower roleはassignment済みstoreだけを解決する。
- G1-C service High経路11/11、L-LINK mock、Cron、会計export、複合FK、immutable guardはG1-D適用後もPASS。
- manifest 44、table/RLS 65/65、policy 176、security 216/216。fresh/upgrade/rollback/restore、Lint/型/buildもPASS。

## DB-003 Current upgrade互換追補（2026-07-27）

G1-Cがrequiredとして扱う`payment_items`、`trade_in_vehicles`、`delivery_usage_logs`、`delivery_overage_logs`は、canonical schemaには存在したがtimestamp upgrade chainに作成migrationがなかった。4表はoptional legacyではなくrequired-presentと分類した。

G1-C本体`20260726000500`は変更せず、直前の`20260726000450`で不足表をexpandし、既存表はrequired columnを検証する。G1-Bがすでに適用済みのupgrade順を考慮し、作成直後からrole-aware write policyとRLSを再設定する。その後G1-Cが複合FK、immutable scope guardを通常どおり付与する。

全欠落・各1表のみ存在・全存在のupgradeはPASS。不正shapeはfail-closed。G1-C service High 11経路、親子scope、L-LINK mock、Security、API smokeは回帰PASS。Current Supabase適用は0件で、C6再preflight待ちである。
