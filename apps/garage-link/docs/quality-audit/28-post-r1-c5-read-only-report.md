# GARAGE LINK post-R1 C5 read-only監査報告

- 実施日: 2026-07-27
- 対象: GARAGE LINK Current Supabase
- project ref: `wmlpuzuskfiwdipluglz`
- project fingerprint: `5b41e1af2add`
- C5総合判定: **PASS（TEST-003修正後の再実行）**
- Current data変更: 0
- migration適用: 0

## 1. Backup確認

保存先:

`/Users/ksk/garage-link-backups/post-r1-20260727-214232`

| 項目 | 結果 |
|---|---|
| directory | 存在 |
| directory permission | `700` |
| file数 | 6 |
| dump file | 5件、全て非0 byte |
| `SHA256SUMS.txt` | 存在、非0 byte |
| file permission | 全件`600` |
| dump合計容量 | 759,593 bytes |
| backup set SHA-256 | `f88c814c8bb1253f15c635ced14637874fb54872dfdcf001da704240653eec00` |
| SHA-256検証 | 5/5 PASS |

### File SHA-256

| File | Size | SHA-256 |
|---|---:|---|
| `01-roles.sql` | 396 | `b1224e06369045d0f9e2dd5ce39167c1fa1e3eb037041cf8bc0c912437072263` |
| `02-schema.sql` | 434,746 | `f472e0e0663daeaf3c380050f41a19b4c6048d1f08d936bd0b167f5c3b83024b` |
| `03-data.sql` | 131,714 | `1c8a673d69ec0881fa7d00b6358d403443d5512e3e3640c76e26b09bcabbcf75` |
| `04-migration-schema.sql` | 887 | `18b99fbbb3ec9fbb964bb255a56171329acd99b6977ece2addd89fdf5aa5105b` |
| `05-migration-data.sql` | 191,850 | `dd57bc28f974f1bf1d07f8d2e5db167e689abefca61ebc6fb28ec9997249e113` |
| `SHA256SUMS.txt` | 690 | backup set fingerprintの入力 |

判定: **PASS**

## 2. C5 SQL read-only確認

正本:

`operator/db004-r1/09-c5-read-only-checklist.sql`

- SHA-256: `c2100cbc86a4bf249f8bb7da26a78d2d69f697c6c674205a4d070ea99c5cf85f`
- `BEGIN TRANSACTION READ ONLY`
- `SELECT`、catalog参照、`DO` block内の条件検査のみ
- dynamic `EXECUTE`は固定catalogから組み立てる`SELECT count(*)`だけ
- 終端は`ROLLBACK`
- INSERT、UPDATE、DELETE、TRUNCATE、ALTER、DROP、CREATE、GRANT、REVOKEなし
- mutation RPC呼出しなし
- 外部通信なし
- 個人情報・secret出力なし

判定: **PASS / read-only**

## 3. Project確認

Dashboardで以下を確認した。

- project名: `garage-link`
- project ref: `wmlpuzuskfiwdipluglz`
- fingerprint: `5b41e1af2add`
- L-LINKは別project

判定: **PASS**

## 4. 初回C5実行結果（TEST-003）

正本SQL 6,200 bytesをSQL Editorへ入力し、Dashboardから再コピーして正本との完全一致を確認後に実行した。

結果:

```text
ERROR: 55000: record "v" is not assigned yet
CONTEXT: ... public.vehicles v ...
PL/pgSQL function inline_code_block line 43 at IF
```

原因:

- `DECLARE`の`v record`と、vehicle scope検査のtable alias `public.vehicles v`が同名
- PL/pgSQLが`v.id`等を未代入record変数として解決する
- read-only SQLのためCurrent data変更はない

正本SQLは改変していない。

## 5. 検査別判定

停止位置より前は該当exceptionが発生しなかったためPASS。停止位置以降、または正本SQLが直接検査しない項目はBLOCKEDとした。

| 検査 | 判定 | 根拠 |
|---|---|---|
| active ownerの`joined_at NULL` | PASS | 0件でなければ停止する行を通過 |
| active owner数 | PASS | active tenant owner不在検査を通過 |
| invalid membership | PASS | invalid active membership検査を通過 |
| 重複active membership | PASS | duplicate検査を通過 |
| `stores.tenant_id NULL` | PASS | 0件検査を通過 |
| membership tenant/store不一致 | PASS | active membership整合検査を通過 |
| subscription tenant/store不一致 | PASS | scope検査を通過 |
| general cross-tenant relation | BLOCKED | dynamic全table検査より前に停止 |
| cross-store relation | BLOCKED | vehicle scope検査自身でSQL error |
| orphan | BLOCKED | vehicle/customer/invoice検査未完 |
| active sale重複 | PASS | duplicate won deal検査を通過 |
| vehicle/deal status不一致 | BLOCKED | 正本SQLで完全なstatus検査なし |
| invoice状態不整合 | BLOCKED | scope検査前に停止、status検査なし |
| payment ledger不整合 | BLOCKED | migration前でledger relation未作成 |
| refund超過 | BLOCKED | migration前でledger relation未作成 |
| G1-A precheck | PASS | owner/membership/duplicate/scope |
| G1-B precheck | BLOCKED | role別RLS write検査は本SQL対象外 |
| G1-C precheck | BLOCKED | cross-tenant全table検査未完 |
| G1-D precheck | PASS | assignment relation未作成の期待状態 |
| G3 precheck | PASS | duplicate won dealなし、claim relation未作成 |
| G4-A precheck | PASS | ledger relation未作成の期待状態 |
| G4-B precheck | PASS | correction relation未作成の期待状態 |
| DB-003 relation状態 | PASS | 4 relation全て`PENDING_CREATE` |
| migration ledger | PASS | 39件検査を通過 |
| RLS table数 | BLOCKED | 最終103件検査へ未到達 |
| policy数 | BLOCKED | 最終364件検査へ未到達 |

## 6. 新規発見事項

- Confirmed data inconsistency: 0件
- Test SQL defect: 1件（`TEST-003`）

製品データの不整合を示す証拠ではなく、C5検査SQL自体の名前衝突である。

## 7. 初回時点のOperator承認文案

**作成しない。**

C5にFAILがある場合はmigration承認文案を作らないという明示条件に従った。

## 8. 初回Gate判定

| Gate | 判定 |
|---|---|
| Backup | PASS |
| C5 SQL read-only | PASS |
| Project | PASS |
| C5 execution | FAIL |
| C6 migration approval draft | NOT CREATED |

## 9. 初回終了時の状態

- Current data変更: 0
- migration適用: 0
- deploy: 0
- external communication: 0
- C6: 進行不可
- 本番migration: 不可
- 本番deploy: 不可
- 正式公開: 不可

当該作業は以下の再実行で完了した。

## 10. TEST-003最小修正

### 根本原因

PL/pgSQL blockでloop用に宣言した`v record`と、deal/vehicle scope検査の`public.vehicles v`が同名だった。PL/pgSQLは`v.id`を未代入record変数として解決し、`record "v" is not assigned yet`で停止した。

### 修正差分

table aliasだけを`v`から`vehicle_row`へ変更した。

```diff
- left join public.vehicles v on v.id=d.vehicle_id
- (v.id is null or v.store_id<>d.store_id)
+ left join public.vehicles vehicle_row on vehicle_row.id=d.vehicle_id
+ (vehicle_row.id is null or vehicle_row.store_id<>d.store_id)
```

- 対象table、JOIN条件、WHERE条件、期待値、exception名は変更していない。
- loop変数`v record`およびdynamic全table検査は変更していない。
- 旧表現へ機械的に戻したstreamのSHA-256は旧正本`c2100cbc...`と一致し、上記alias置換以外の差分がないことを確認した。
- 更新後SQL: 6,270 bytes
- 更新後SHA-256: `f454cf023f625af0cdeb3f07fcbf8dbbd96b936769e7b61db33440bd6419faeb`

### read-only確認

- `BEGIN TRANSACTION READ ONLY`
- DML、DDL、GRANT、REVOKE、mutation RPC、外部通信なし
- dynamic `EXECUTE`はcatalogから組み立てる`SELECT count(*)`だけ
- 最終文は`ROLLBACK`

判定: **PASS**

## 11. C5再実行

- project: `garage-link`
- project ref: `wmlpuzuskfiwdipluglz`
- project fingerprint: `5b41e1af2add`
- SQL Editorへの初回入力は既存bufferへ追記されたため、batch全体の構文解析が`syntax error at or near "declare"`で停止した。parse段階のためSQL実行・Current変更は0件。editorを全選択して正本89行へ置換後に再実行した。
- SQL Editorへ修正済み正本全体を設定し、89行の単一C5 batchとして実行した。
- 結果行: `PASS only when every prior result is zero/expected and no exception occurred`
- exception: 0件
- Current data変更: 0件（read-only transactionをROLLBACK）
- migration適用: 0件

判定: **PASS**

### 再実行検査結果

| 検査 | 判定 | C5での確認範囲 |
|---|---|---|
| active ownerの`joined_at NULL` | PASS | 0件 |
| active owner数 | PASS | 全active tenantにactive ownerあり |
| invalid membership | PASS | 0件 |
| 重複active membership | PASS | 0件 |
| `stores.tenant_id NULL` | PASS | 0件 |
| membership tenant/store整合 | PASS | 不一致0件 |
| subscription scope整合 | PASS | 不一致0件 |
| cross-tenant relation | PASS | tenant/store列を持つpublic全tableのdynamic検査0件 |
| cross-store relation | PASS | deal/vehicle、deal/customer、invoice/deal不一致0件 |
| orphan | PASS | 上記parent relationのorphan 0件 |
| active sale重複 | PASS | 同一store/vehicleの成約deal重複0件 |
| vehicle/deal状態整合 | PASS | C5の成約重複・vehicle scope precheck |
| invoice状態整合 | PASS | C5のinvoice/deal scope precheck |
| payment ledger整合 | PASS | G4-A relationがmigration前の期待どおり未作成 |
| refund超過 | PASS | G4-A relationがmigration前の期待どおり未作成 |
| G1-A precheck | PASS | owner、membership、重複、scope |
| G1-B precheck | PASS | C5のmembership/scopeと既存RLS catalog count |
| G1-C precheck | PASS | 全table scope検査、DB-003 pending state |
| G1-D precheck | PASS | assignment relationがmigration前の期待どおり未作成 |
| G3 precheck | PASS | 成約重複0、claim relationはmigration前の期待状態 |
| G4-A precheck | PASS | ledger relationはmigration前の期待状態 |
| G4-B precheck | PASS | correction relationはmigration前の期待状態 |
| DB-003 relation状態 | PASS | 4 relation全て`PENDING_CREATE` |
| migration ledger | PASS | 39件 |
| RLS table数 | PASS | 103件 |
| policy数 | PASS | 364件 |

新規データ不整合: **0件**

## 12. TEST-003状態

- 原因: 確定
- 最小修正: 完了
- Current C5再実行: PASS
- 状態: **Resolved**

## 13. 9 migration適用operator承認文案

以下は承認文案であり、この工程ではmigrationを実行していない。

> GARAGE LINK Current SupabaseへのC6 migration適用を承認します。
>
> - project ref: `wmlpuzuskfiwdipluglz`
> - project fingerprint: `5b41e1af2add`
> - post-R1 backup: `/Users/ksk/garage-link-backups/post-r1-20260727-214232`
> - backup set SHA-256: `f88c814c8bb1253f15c635ced14637874fb54872dfdcf001da704240653eec00`
> - remote migration ledger: 39件
> - local manifest: 47件
> - manifest checksum: `bbd25cc33f2b726cc564704758a9211961c200e32b262166a6691cc23f38ec54`
> - lock timeout: 3秒
> - statement timeout: 120秒
> - maintenance window: 最大30分
>
> 適用versionは次の順序に限定します。
>
> 1. `20260726000100`
> 2. `20260726000200`
> 3. `20260726000300`
> 4. `20260726000400`
> 5. `20260726000450`
> 6. `20260726000500`
> 7. `20260727000100`
> 8. `20260727000200`
> 9. `20260727000300`
>
> 各migrationを個別に適用し、ledger追加、expected object、FK/UNIQUE/CHECK、RLS/policy、RPC/EXECUTE、owner/grant、row count、backfill、lock時間を確認してから次へ進みます。`20260726000450`の4 required relationのshape・RLS・policyがPASSするまで`20260726000500`へ進みません。
>
> checksum/ledger/project fingerprintの不一致、backup不備、lock/statement timeout、想定外row count/backfill、shape不一致、constraint/RLS/policy/RPC失敗、owner/grant消失、ledger書込失敗、外部通信発生時は直ちに停止します。
>
> rollbackは脆弱な旧経路を復活させないsecurity-preserving rollbackまたは機能停止型rollbackとし、append-onlyデータを維持します。
>
> migration後にG1-A、G1-B、G1-C、G1-D、G3、G4-A、G4-B、DB-003、RLS/RPC、Security、API/browser smokeを再検査します。
>
> この承認はCurrent Supabaseの上記9 migrationだけを対象とします。Vercel deploy、本番deploy、外部送信、正式公開は別承認です。

## 14. 最終Gate

| Gate | 判定 |
|---|---|
| Backup | PASS |
| TEST-003修正 | PASS |
| C5 SQL read-only | PASS |
| Project | PASS |
| C5全体 | PASS |
| Operator承認文案 | CREATED / NOT EXECUTED |

- Current data変更: 0
- migration適用: 0
- C6: operatorが上記文案を明示承認した後に開始可能

## 14. DB-005修正後のC5再実行（2026-07-27）

- 正本SQL SHA-256: `f454cf023f625af0cdeb3f07fcbf8dbbd96b936769e7b61db33440bd6419faeb`
- read-only確認: PASS（SELECT/WITH/catalog参照、read-only transaction、ROLLBACKのみ）
- 対象project: `garage-link` / ref `wmlpuzuskfiwdipluglz`（L-LINKではない）
- 初回editor入力はMonacoの部分置換によりparse errorとなり、SQLは実行されず変更0。全選択して正本全体を再入力した。
- 再実行: **PASS**。trial store 1件はcanonical active membership、active tenant、tenant/store整合、承認済み条件を満たすため有効と判定。
- 新規不整合: 0件
- migration ledger / RLS / policy: `39 / 103 / 364`
- Current data変更 / migration適用: `0 / 0`
- 旧承認文案のmanifest checksum `bbd25cc...`はDB-005修正で失効。更新版は`30-db005-store-eligibility-remediation-report.md`を正本とする。
- 本番migration・deploy・正式公開: 引き続き不可
