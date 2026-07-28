# GARAGE LINK Current C6 migration実行報告（DB-006解消後）

- 実施日: 2026-07-27
- 対象: GARAGE LINK Current Supabase (`wmlpuzuskfiwdipluglz` / fingerprint `5b41e1af2add`)
- operator承認: DB-006修正、9 migration、Current回帰
- 最終判定: **C6 migration PASS / Current回帰 PASS WITH MANUAL VERIFICATION / deploy未実行**
- 外部通信: 0件

## 1. DB-006と実行前Gate

DB-006はCurrentデータrepairを要する問題ではなく、G1-A precheckがcanonical owner判定へlegacy `store_members`一致を混入していた`MIGRATION-PRECHECK-001`であった。`memberships`だけでactive owner、tenant/store、role、active/trial storeを判定し、legacy driftはNOTICEへ記録する最小変更を行った。

| Gate | 結果 | 証拠 |
|---|---|---|
| migration / manifest / runbook | PASS | 9/9一致 |
| manifest | PASS | 47件、SHA-256 `fcd990a8e9ff135fa897f5d1f017e8d962c3ed3b4e0c5813cc75851c41dcc677` |
| snapshot | PASS | `9e786d4c29ba9ff9bdb94c88df33cb525eed265c4a2f9ceda4d7e1e3b4258a21` |
| backup | PASS | post-R1 5 dump、`SHA256SUMS.txt` SHA-256 `f88c814c8bb1253f15c635ced14637874fb54872dfdcf001da704240653eec00` |
| Current targeted precheck | PASS | canonical owner 1、scope issue 0、legacy-only path 0、legacy mismatch 1、ledger 39 |
| 単一preflight | PASS | `evidence/c6-final-preflight.json` |

## 2. Migration結果

すべて`lock_timeout=3s`、`statement_timeout=120s`、個別transactionで適用した。SQL Editor UIを含む経過時間であり、DB lock waitそのものは計測できない。lock timeoutは全件0、したがってlock待ちは各3秒未満である。

| # | Version | 結果 | UI含む経過 | Ledger |
|---:|---|---|---:|---:|
| 1 | `20260726000100` | PASS | 5.444秒 | 40 |
| 2 | `20260726000200` | PASS | 6.501秒 | 41 |
| 3 | `20260726000300` | PASS | 6.142秒 | 42 |
| 4 | `20260726000400` | PASS | 6.037秒 | 43 |
| 5 | `20260726000450` | PASS | 6.226秒 | 44 |
| 6 | `20260726000500` | PASS | 6.478秒 | 45 |
| 7 | `20260727000100` | PASS | 6.364秒 | 46 |
| 8 | `20260727000200` | PASS | 6.214秒 | 47 |
| 9 | `20260727000300` | PASS | 6.451秒 | 48 |

- 最大観測経過: 6.501秒
- 最大lock待ち: 正確値はSQL Editor非表示。timeoutなし、上限3秒未満
- rollback/停止: なし
- 想定外backfill: 0件
- 想定backfill: `membership_store_assignments` 5件
- legacy compatibility projection: 不一致1件を`suspended`へ隔離（権限付与なし）

G1-A直後の最初の補助Gateは検査側が旧案の不存在関数名を参照して`false`となった。後続を開始せず`pg_proc`をread-only確認し、SQL実体の正式関数へGateを訂正してPASSを確認した。製品関数欠落ではなく検査記述のfalse negativeであり、Currentへの追加変更はない。

## 3. 00450 / DB-003

`20260726000450`後、次の4 relationを検査してからG1-Cへ進んだ。

| Relation | Columns | Constraints | Policies | RLS |
|---|---:|---:|---:|---|
| `payment_items` | 12 | 4 | 4 | enabled |
| `trade_in_vehicles` | 20 | 4 | 4 | enabled |
| `delivery_usage_logs` | 9 | 3 | 2 | enabled |
| `delivery_overage_logs` | 15 | 3 | 2 | enabled |

4表の既存行・backfillは0件。G1-Cの必須relation前提を満たした。

## 4. Current DB回帰

### Catalog・データ整合

| 項目 | 結果 |
|---|---|
| migration ledger | PASS、48件 |
| RLS / policy | PASS、119 table / 363 policy |
| active owner | PASS、5件 |
| invalid membership | 0 |
| old-only authorization | 0 |
| store tenant NULL | 0 |
| cross-tenant / cross-store / orphan | 0 / 0 / 0 |
| active sale duplicate | 0 |
| invoice/payment不整合・refund超過 | 0 |
| active correction case duplicate | 0 |
| target RPC missing | 0 |
| SECURITY DEFINER search_path不足 | 0 |
| authenticated/anon membership direct write | denied |
| authenticated legacy membership write | denied |
| service-only context RPCのauthenticated EXECUTE | denied |
| G1-C immutable trigger | 104件 |

### G1-A〜G4-B

| Batch | Current結果 | Local dynamic結果 |
|---|---|---|
| G1-A | canonical owner、membership write revoke、helper PASS | PASS |
| G1-B | owner role helper・write/admin capability、RLS/ACL PASS | viewer/staff/implementerを含めPASS |
| G1-C | correct scope PASS、wrong tenant context denied、複合FK/immutable guard PASS | PASS |
| G1-D | ownerのassignment store解決・switch RPCをrollback transactionでPASS | role別・2/10 worker PASS |
| G3 | active unique index・RPC・guard・Current不整合0 | 2/10/100 worker PASS |
| G4-A | append-only guard・invoice guard・Current不整合0 | 2/10/100 worker PASS |
| G4-B | active case unique・RPC・Current不整合0 | 2/10/100 worker PASS |

Currentにはactive roleがowner 5件だけで、viewer/staff/implementerおよび売約・会計・訂正の動的fixtureがない。Current上で実データを作らず、該当動的ケースは未実行としてローカル分離DB結果と明確に分離した。

## 5. 品質検査

| 検査 | 結果 |
|---|---|
| DB fresh / upgrade / rollback / reapply / restore | PASS |
| DB-006 9 fixture | PASS |
| Security suite | PASS、234件 |
| API smoke | PASS（401/403/409/503、G3/G4-A/G4-B、store switch、L-LINK mock） |
| L-LINK静的mock | PASS |
| 問い合わせ管理 | PASS |
| lint | PASS |
| TypeScript | PASS |
| production build | PASS、129 routes |
| browser smoke | PASS、localhost `/`・`/login` |

API smokeの最初の並列実行はbuildとの競合でserver ready待ちに失敗した。build完了後の単独再実行はPASSで、製品不具合ではない。

## 6. 変更・公開判断

- Currentへの期待変更: 9 schema migration、ledger 39→48、assignment backfill 5、legacy projection隔離1
- Currentへの想定外変更: **0件**
- Vercel deploy: **0件 / 未承認**
- 外部送信: **0件**
- Current未適用Critical: **0件**
- コード未修正Critical: **0件**
- コード未修正High: **9件（既存対象外）**

C6 migrationは完了した。Current回帰はcatalog・owner・データ整合がPASSだが、Currentにowner以外のfixtureがないため**PASS WITH MANUAL VERIFICATION**である。残存High 9件もあるため、deploy・正式公開は不可。次は`INVENTORY-001`を中心とする整備・部品在庫・棚卸しの修正Batch、その後にStripe・PII・L-LINK・テスト負債と最終公開Gateを行う。

## 7. 2026-07-28 High remediation追記

残存High 9件は`20260728000100_high_remediation_batch.sql`とアプリ修正によりローカル解消した。非owner dynamic、fresh/upgrade/rollback/restore、2/10/100 worker、process-kill、Security 239、API、L-LINK mock、build、既存Chrome smokeはPASS。Currentへは未適用で、ledger 48・Current変更0を維持する。次は単一forward migrationの別operator承認・Current回帰であり、完了前のdeployは不可。詳細は`33-high-remediation-batch-report.md`。
