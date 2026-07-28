# GARAGE LINK G1-D Active store preference report

実施日: 2026-07-27  
製品root: `/Users/ksk/garage-link/apps/garage-link`  
開始commit: `f45b0e924f611756e9f5d99e5534d73726f4c75a`  
環境: `public.ecr.aws/supabase/postgres:17.6.1.136`、Docker `--network none`、remote接続なし  
判定: **G1-D Local Completed / TENANT-003コード解消 / remote未適用 / 正式公開不可**

## 1. TENANT-003問題経路

G1-C以前の店舗切替はmembershipまたは旧`store_members.store_id`を更新し、認可のscope自体を移動させる設計だった。G1-Cのimmutable guardで越境につながる更新は拒否されたが、複数store所属者が正規に操作店舗を切り替える経路も停止していた。

G1-Dは、オーナー承認済みの「active membership＋store assignment」方式を実装した。`memberships`をtenant所属・roleの唯一の正本として維持し、利用可能店舗と現在店舗を別データへ分離した。

## 2. 旧店舗切替

- 旧1引数`switch_active_garage_store(uuid)`はfail-closed実装へ置換し、authenticatedのEXECUTEを剥奪した。
- user-facing認可で`store_members`を参照する経路は0件。
- 店舗切替による`memberships.store_id`、role、業務データのtenant/store変更は0件。
- 既存`memberships.store_id`は削除せず、互換列・決定的backfill元としてのみ保持する。

## 3. preferenceモデル

| データ | 正本範囲 | 権限付与 |
| -- | -- | -- |
| `memberships` | user＋tenantのactive membership、role | tenant所属・roleの正本 |
| `membership_store_assignments` | implementer/staff/viewerが利用可能なstore | 単独では付与しない。active membershipとactive storeが必須 |
| `user_active_store_preferences` | user＋tenantの現在操作store | 付与しない。毎回membership/assignmentを再検査 |

owner/adminはtenant内の全active store、implementer/staff/viewerはassignmentされたactive storeを利用できる。`UNIQUE(membership_id, store_id)`、`UNIQUE(user_id, tenant_id)`、membership/storeとtenantの複合FKを設けた。

## 4. active store解決

serverは、認証user、active tenant membership、保存preference、active store、membershipまたはtenant-wide role、tenant/store一致の順に検査する。有効なpreferenceがなければ、利用可能storeが全tenantを通じて1件だけの場合のみ安全に候補を自動解決する。複数なら選択待ち、0件なら権限なしとする。URL、Cookie、localStorage、`store_members`、inactive membershipへのfallbackはない。

## 5. switch RPC

`switch_active_garage_store(tenant_id, store_id, correlation_id)`は`auth.uid()`をactorとし、tenant/store、active/accepted membership、role、assignmentをDB内で再確認する。user IDやroleは引数に持たない。user＋tenant advisory lockとunique upsertにより同時要求を1 preferenceへ収束し、同一store retryは`changed=false`で冪等成功する。

Route Handler `/api/stores/active`はsession actorを確定し、UUIDとscopeを検査後にRPCを呼ぶ。未認証401、権限不足・他scope 403、競合409、DB一時障害503、想定外500を安全な本文で返す。

## 6. RLS・制約

- 2新tableともRLS有効。
- authenticatedは本人行をSELECT可能だが、直接INSERT/UPDATE/DELETE grantは0。mutationはRPC限定。
- SECURITY DEFINERは`search_path=public, pg_temp`固定。
- switch/assignment RPC以外の不要なEXECUTEを付与しない。
- preference残存中にmembershipをinactive/deleteしても`current_user_active_store_id()`はNULLとなり、権限は残らない。

## 7. UI

`AppShell`のstore selectorは`get_garage_ui_context_v2`が返す利用可能storeだけをtenant別に表示する。選択中、切替中overlay、二重click防止、安全なエラー表示を実装した。切替完了後はserver再取得とcache refreshを行い、未選択・無権限・切替中は旧storeのchildrenを表示しない。viewerもassigned store間の切替が可能である。

## 8. API scope

dashboard、analytics、vehicle、customer、deal、quote、invoice、payment、service、inventory、settings、LINE/L-LINK、search/count系のcurrent membership読取を`current_user_active_store_membership`またはv2 payloadへ移行した。API認可はpreference単独に依存せず、G1-C TenantContext、active membership、target record scopeを維持する。

## 9. cache

server側の共有`unstable_cache`/`cache`は該当経路0件。切替時はrouter refreshと対象routeの再検証を行い、BroadcastChannel/localStorageは他tabへ「再取得」を通知するヒントとしてのみ使う。保存値を認可やactive storeの正本として読まない。Chrome smokeでA1→A2、tab間通知、reload、console error 0を確認した。

## 10. 複数タブ

- 2/10 worker同一store: 全要求成功、preference 1件、version 1。
- 2/10 worker異store: 全要求は直列化され、最終preference 1件。最後のcommitがserver正本。
- 古いtabの旧store UPDATE: active-store RLSにより更新0件。
- URLに旧storeが残る場合も、対象行と最新membership/preferenceをDBで再検査するため越境しない。

## 11. membership変化

選択後にmembershipをinactive化すると、preference行は保持されるがactive store解決はNULL、writeは0件となる。membership削除、invite未承認、old-only membership、inactive/deleted storeも同じく拒否する。他に利用可能storeが1件だけなら候補を解決し、複数なら再選択とする。最後owner保護はG1-Aを維持した。

## 12. 監査ログ

成功・拒否とも、user、tenant、変更前後store、actor role、source、correlation ID、日時、拒否分類を記録する。token、Cookie、session本文、顧客情報、SQL、stack traceは記録しない。correlation IDは1〜128文字のDB制約を持つ。

## 13. migration

`20260727000100_active_store_preference.sql`は次を追加した。

1. assignment/preference table、複合FK、UNIQUE、index
2. `memberships.store_id`から1件だけの決定的assignment backfill
3. role-aware accessible-store/active-store helper
4. active-store read modelとUI/dashboard/analytics v2 RPC
5. switch/assignment RPCとaudit
6. RLS、grant、固定search_path
7. 旧switch停止

manifestは44 entry、番号重複0、checksum一致。既存membershipから追加storeを推測せず、preferenceの推測backfillは0件。security-preserving rollbackは脆弱な旧切替を復活させず、G1-D機能だけを停止した後に再適用できる。

## 14. 動的テスト

2 tenant、3 store、owner/admin/implementer/staff/viewer/inactive/old-only fixtureで実施した。

| 項目 | 結果 |
| -- | -- |
| owner/admin A1→A2 | PASS、tenant-wide access維持 |
| implementer/staff/viewer A1→A2 | PASS、assignmentありのみ |
| 未所属/inactive/pending/deleted/old-only | PASS、拒否 |
| tenant A user→B1 | PASS、拒否 |
| client user/tenant/store改ざん | PASS、拒否 |
| membership/業務scope不変 | PASS |
| 2/10 worker | PASS、preference 1件 |
| process kill | PASS、commit前0件、commit後retry 1件 |

## 15. browserテスト

新規browser downloadは行わず、既存Google Chromeを外向き通信遮断のlocalhost環境で使用した。PC、mobile幅、複数tab、viewer切替、inactive拒否、console errorを確認し、`G1D_BROWSER_SMOKE_PASS pc=PASS mobile=PASS tabs=PASS viewer=PASS inactive=PASS console=PASS`となった。固定bundled ChromiumをCI artifactとして管理するTEST-002は別のtest debtとして残る。

## 16. 機械検査

| 検査 | 結果 |
| -- | -- |
| migration ledger/checksum | 44/44 PASS |
| public table/RLS | 65/65 |
| policy | 176 |
| user-facing `store_members`認可 | 0 |
| membershipを書換えるswitch | 0 |
| preferenceを認可正本にする経路 | 0 |
| SECURITY DEFINER search_path未固定 | 0 |
| preference直接mutation grant | 0 |
| tenant/store複合FK | PASS |
| static security suite | 216/216 PASS |

## 17. 回帰

| 検査 | 結果 |
| -- | -- |
| fresh / 再実行 | PASS、44 applied / 44 skipped |
| upgrade | PASS、38→44、決定的assignment 1・preference 0 |
| rollback / 再適用 | PASS、5 rollback / 6 reapply（依存repairを含む） |
| backup / restore catalog fingerprint | PASS |
| G0-B / G1-A / G1-B / G1-C / G3 | 全PASS |
| API smoke | PASS、switch 401/200/403、既存G3/L-LINK維持 |
| L-LINK static/mock / 問い合わせ管理 | PASS |
| Lint / TypeScript / production build | 全PASS |

## 18. 残存リスク

- remote staging・本番にはG1-A/B/C/D/G3が未適用。
- managed Supabase上の実データprecheck、lock時間、backup/restore、Auth/Storage DRは未確認。
- `memberships.store_id`と旧`store_members`のcontract廃止はAUTH-002として残る。
- 固定bundled browser artifactはTEST-002として残る。
- VEHICLE-002の会計連動取消は仕様未承認。

コード未修正Criticalは0件。コード未修正・未完了Highは13件、コード修正済みremote待ちHighは5件、High Test Gapは1件、全体open Highは19件である。

## 19. remote staging項目

- project ref/DB host fingerprintと本番との差を二者確認
- 44-entry ledger/checksum、assignment backfill候補、不整合のread-only precheck
- 匿名backupとACL保持restore、rollback bundle、lock監視
- test tenant A/B、A1/A2/B1、5 role、inactive/old-only account
- outbound deny/mock、実顧客データ不使用、operator承認
- DB/API/ChromeでG1-A/B/C/D/G3回帰

unknown、本番と区別不能、backupなし、曖昧backfill候補ありなら適用しない。

## 20. 公開可否への影響

TENANT-003のコード経路はローカルで解消し、複数store切替をmembership・role・業務scope変更なしで実現した。remote staging preflight準備へは進めるが、remote migration適用は別承認が必要である。本番適用・正式公開は、remote未適用Critical 3件とopen High 19件があるため不可。
