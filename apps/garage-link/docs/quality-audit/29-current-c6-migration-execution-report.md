# GARAGE LINK Current C6 migration実行報告

- 実施日: 2026-07-27
- 対象project ref: `wmlpuzuskfiwdipluglz`
- project fingerprint: `5b41e1af2add`
- operator承認: あり
- C6判定: **FAIL / 1件目precheckで安全停止**
- migration適用件数: **0件**
- Current想定外変更: **0件**

## 1. 変更直前Gate

| 項目 | 結果 | 根拠 |
|---|---|---|
| GARAGE LINK project | PASS | Dashboard project名`garage-link`、ref一致。L-LINKとは別project |
| backup | PASS | 5 dump fileのSHA-256 5/5一致、permission 700/600 |
| backup set SHA-256 | PASS | `f88c814c8bb1253f15c635ced14637874fb54872dfdcf001da704240653eec00` |
| remote ledger | PASS | 39件 |
| approved 9 version適用済み | PASS | 0件 |
| local manifest | PASS | 47件 |
| manifest checksum | PASS | `bbd25cc33f2b726cc564704758a9211961c200e32b262166a6691cc23f38ec54` |
| 9 migration checksum | PASS | baseline manifestと9/9一致 |
| C5 | PASS | `28-post-r1-c5-read-only-report.md` |
| stores tenant NULL | PASS | 0件 |
| active owner joined_at NULL | PASS | 0件 |
| DB-003 relation | PASS | 4表すべて未作成 |
| Cron | PASS | `cron.job` relationなし |
| Edge Functions | PASS | Dashboardに配備済みfunctionなし |

## 2. 適用方式

- 1 migrationごとの独立transaction
- `SET LOCAL lock_timeout='3s'`
- `SET LOCAL statement_timeout='120s'`
- migration SQLとledger追加を同一transactionへ配置
- SQL Editorのdestructive query確認後に実行
- migration sourceはlocal fileのままledger `statements`へ保存する構成

## 3. Migration結果

| 順番 | Version | 結果 | 実行時間 | Ledger | 備考 |
|---:|---|---|---|---:|---|
| 1 | `20260726000100` | **FAIL / transaction rollback** | DB応答は確認後2.2秒以内。UI操作込み59.817秒 | 39のまま | `G1A_PRECHECK`がtrial store上のactive membership 1件を拒否 |
| 2 | `20260726000200` | NOT RUN | - | 39 | 即時停止条件 |
| 3 | `20260726000300` | NOT RUN | - | 39 | 即時停止条件 |
| 4 | `20260726000400` | NOT RUN | - | 39 | 即時停止条件 |
| 5 | `20260726000450` | NOT RUN | - | 39 | 即時停止条件 |
| 6 | `20260726000500` | NOT RUN | - | 39 | 即時停止条件 |
| 7 | `20260727000100` | NOT RUN | - | 39 | 即時停止条件 |
| 8 | `20260727000200` | NOT RUN | - | 39 | 即時停止条件 |
| 9 | `20260727000300` | NOT RUN | - | 39 | 即時停止条件 |

適用済みversion: **なし**

## 4. 停止原因 DB-005

G1-Aはactive membershipのstoreについて次を要求する。

```sql
s.status is distinct from 'active'
```

Currentには次の組み合わせが1件ある。

- membership: `active`
- store: `trial`
- tenant/store/user/scope/joined_atは有効

DB-004 R1とC5はstore status `active`または`trial`を有効扱いしていたが、G1-A migrationだけが`active`限定であり、upgrade contractが一致していない。

エラー:

```text
G1A_PRECHECK: active membership のuser/tenant/store/承認状態に不整合があります。
```

分類: `DB-005` / High / P0 / Current upgrade compatibility。

曖昧なdata repairやRLS・制約の弱体化は行っていない。trial storeを正式な認可対象として維持するか、activeへ移行するかの仕様を確定したうえで別Batchとする。

## 5. Rollback確認

G1-Aは同一transaction内のprecheckで停止したため、PostgreSQLがtransaction全体をrollbackした。

| 確認 | 結果 |
|---|---:|
| ledger count | 39 |
| `20260726000100` ledger row | 0 |
| G1-A追加列`invite_token_hash` | 0 |
| legacy suspended row | 0（実行前後不変） |
| RLS table | 103（不変） |
| policy | 364（不変） |
| stores tenant NULL | 0 |
| owner joined_at NULL | 0 |

security-preserving rollback SQLの追加実行は不要であり、実行していない。

## 6. Lock・backfill

- lock timeout: 発生なし
- 最大lock時間: 実測不可。`lock_timeout=3s`内でprecheck停止し、lock timeoutなし
- statement timeout: 発生なし
- backfill: 0件（transaction rollback）
- 想定外data変更: 0件

## 7. 00450・00500

- `20260726000450`: NOT RUN。4 required relationは引き続き未作成
- `20260726000500`: NOT RUN。G1-C Current検査は未実施

## 8. Current回帰

9 migration完了が開始条件のため、次は実行していない。

| 対象 | 結果 |
|---|---|
| G1-A | FAIL（migration precheck） |
| G1-B | BLOCKED |
| G1-C | BLOCKED |
| G1-D | BLOCKED |
| G3 | BLOCKED |
| G4-A | BLOCKED |
| G4-B | BLOCKED |
| Security suite | NOT RUN |
| API smoke | NOT RUN |
| Browser smoke | NOT RUN |
| Lint / TypeScript / build | NOT RUN |

未実行項目をPASSとしていない。

## 9. 最終状態

- C6: **FAIL / SAFE STOP**
- migration適用: 0件
- ledger: 39件
- RLS/policy: 103/364、変更なし
- Current想定外変更: 0件
- rollback追加操作: 0件
- deploy: 0件
- 外部通信: 0件
- Current未適用Critical: 3件
- コード未修正Critical: 0件
- コード未修正High: 10件（DB-005を追加）
- 本番deploy: 不可
- 正式公開: 不可

## 10. 次工程

1. trial storeを認可上の有効storeとして扱う正式仕様を確認する。
2. G1-A、C5、R1、後続helperのstore status contractを統一する最小expand-compatible修正を作る。
3. fresh/upgrade/rollback、G1-A〜G4-Bをローカル回帰する。
4. migration checksum・manifest・snapshotを更新する。
5. post-R1 backupを維持したままCurrent C5/C6を別承認で再実行する。

既存Currentデータを推測変更しない。

## 11. DB-005後続対応（2026-07-27）

- 正式仕様: store status `active`/`trial`のみ認可候補。inactive/suspended/cancelled/deleted/NULL/未知値は拒否。
- `public.store_is_authorization_eligible(text)`へG1-A〜Dのstore判定を集約した。trial単独で権限を付与せず、canonical active membership・role・tenant/store整合は維持。
- G1-A precheck、R1 pre/post、C5のcontractを統一した。
- fresh/upgrade/security-preserving rollback/reapply/restore、G1-A〜G4-B、Security 233件、API、lint/type/buildはPASS。
- Current C5再実行はPASS。ledger 39、RLS 103、policy 364、data変更0、migration 0。
- 新snapshot `44eae79c4403741e1c3cd9cf6fc199b5baeb392f0c2cd88078d3b003cc3387a5`、manifest checksum `3f0358fcb993071ba6def9c8bdb2e81a901b300c4301dabb8dd33ca1dbfb24f0`。
- 本報告の旧C6承認はchecksum変更により失効。更新版operator承認後のみC6を再開する。
