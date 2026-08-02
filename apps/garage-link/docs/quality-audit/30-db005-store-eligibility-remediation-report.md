# DB-005 Store authorization eligibility修正報告

実施日: 2026-07-27  
対象: GARAGE LINK / G1-A〜G1-D / R1 / C5 / C6 preflight  
Current project: `wmlpuzuskfiwdipluglz` / fingerprint `5b41e1af2add`

## 1. 結論

DB-005はローカルで解消し、Current C5 read-only監査もPASSした。Currentの業務データ変更とmigration適用はともに0件。C6は更新版snapshotとchecksumに対するoperator承認後に再開できる。

## 2. 共通store eligibility仕様

| store status | 認可候補 |
|---|---|
| `active` | 可 |
| `trial` | 可 |
| `inactive` / `suspended` / `cancelled` / `deleted` | 不可 |
| NULL / 未知値 | 不可 |

store statusは権限の十分条件ではない。canonical `memberships`のactive・承認済み・disabled/deletedなし、許可role、active tenant、tenant/store一致、assignment要件を引き続き必要とする。`store_members` fallbackは使用しない。

## 3. 根本原因と修正

DB-004 R1/C5はtrialを有効とした一方、未適用G1-A〜Dの複数箇所に`store.status='active'`が分散していた。G1-A migration先頭へ純粋なfail-closed関数`public.store_is_authorization_eligible(text)`を追加し、G1-A precheck、G1-A/B/C/DのRLS/RPC helperを同関数へ置換した。

R1 precheck/postcheckとC5はCurrentでG1-A未適用でも実行できる必要があるため、同一の明示条件`status not in ('active','trial')`で検査する。

## 4. Migration・manifest

変更した未適用migration SHA-256:

| Version | SHA-256 |
|---|---|
| `20260726000100` | `bc4ee96e10a8b4bac09215474fd75418a8d6d9c7bef9d39c8a687d1289769fcc` |
| `20260726000200` | `6cf299750d0d647926975edb864732ac1f5fb11ac6d810553b51f64c9c315064` |
| `20260726000500` | `a73c1fd2701f8dd004677bcbc23dc157f05204384f24a3dbfbaab384009efcdb` |
| `20260727000100` | `edae573430ecdb52b0b86eb02898941027e964188cb15c31375e39d67d0c04a3` |

- manifest entries: 47
- manifest SHA-256: `3f0358fcb993071ba6def9c8bdb2e81a901b300c4301dabb8dd33ca1dbfb24f0`
- snapshot: `docs/quality-audit/db005-current-supabase-c6-snapshot-manifest.json`
- snapshot fingerprint: `44eae79c4403741e1c3cd9cf6fc199b5baeb392f0c2cd88078d3b003cc3387a5`
- remote ledger: 39（変更なし）

## 5. ローカル検証

| 検査 | 結果 |
|---|---|
| DB-005 static | PASS 4/4 |
| active＋active membership | PASS |
| trial＋active membership | PASS（owner/admin/implementer/staff/viewerの既存範囲） |
| trial＋inactive membership | 拒否PASS |
| trial＋old-only membership | 拒否PASS |
| trial＋他tenant membership | 拒否PASS |
| inactive/deleted/unknown/NULL | 拒否PASS |
| fresh 47 migration | PASS |
| upgrade 38→47 | PASS |
| rollback 8 / reapply 9 | PASS |
| backup/restore | PASS |
| G1-A〜G1-D / G3 / G4-A / G4-B | PASS |
| concurrency/process kill | PASS（2/10/100 worker対象を含む） |
| Security suite | PASS 233/233 |
| API smoke | PASS |
| L-LINK mock/static・問い合わせ管理 | PASS |
| lint / TypeScript / production build | PASS |

## 6. Current C5

- SQL SHA-256: `f454cf023f625af0cdeb3f07fcbf8dbbd96b936769e7b61db33440bd6419faeb`
- read-only: PASS
- C5: **PASS**
- trial store: canonical active membershipとscope整合を満たしPASS
- 新規不整合: 0
- ledger / RLS / policy: `39 / 103 / 364`
- Current data変更 / migration適用: `0 / 0`

## 7. 更新版C6 operator承認文案

> GARAGE LINK Current SupabaseのC6 migration適用を承認します。
>
> - project ref: `wmlpuzuskfiwdipluglz`
> - project fingerprint: `5b41e1af2add`
> - post-R1 backup: `/Users/ksk/garage-link-backups/post-r1-20260727-214232`
> - backup set SHA-256: `f88c814c8bb1253f15c635ced14637874fb54872dfdcf001da704240653eec00`
> - snapshot fingerprint: `44eae79c4403741e1c3cd9cf6fc199b5baeb392f0c2cd88078d3b003cc3387a5`
> - remote ledger: 39
> - local manifest: 47
> - manifest checksum: `3f0358fcb993071ba6def9c8bdb2e81a901b300c4301dabb8dd33ca1dbfb24f0`
> - C5: PASS
>
> 次の9 migrationを順番に個別transactionで適用することを承認します: `20260726000100`, `20260726000200`, `20260726000300`, `20260726000400`, `20260726000450`, `20260726000500`, `20260727000100`, `20260727000200`, `20260727000300`。
>
> lock timeoutは3秒、statement timeoutは120秒、maintenance windowは最大30分とします。各migration後にledger、expected relation/function、FK/UNIQUE/CHECK、RLS/policy、function owner/EXECUTE、row count、backfill、grantを確認してください。`20260726000450`の4 required relationのshape・RLS・policyがPASSするまで`20260726000500`へ進まないでください。
>
> fingerprint/checksum/ledger drift、backup不備、timeout、shape/row count不一致、想定外backfill、constraint/RLS/RPC/owner/grant/ledger失敗、外部通信、Current想定外変更があれば後続を停止してください。単純rollbackで旧脆弱経路を復活させず、security-preservingまたは機能停止型rollbackを使用してください。
>
> 9件後にG1-A〜G1-D、G3、G4-A、G4-B、DB-003、RLS/RPC、Security、API smoke、lint、TypeScript、buildを再検証してください。この承認にdeploy、外部送信、正式公開は含みません。

## 8. 公開可否

- C6開始: 上記文案へのoperator明示承認後に可
- 本番migration: 不可
- deploy: 不可
- 正式公開: 不可

## 9. DB-005変更ファイル

製品・DB検査:

- `supabase/migrations/20260726000100_membership_admission_lock.sql`
- `supabase/migrations/20260726000200_role_aware_business_write_lock.sql`
- `supabase/migrations/20260726000500_service_role_tenant_store_integrity.sql`
- `supabase/migrations/20260727000100_active_store_preference.sql`
- `supabase/tests/db005_store_eligibility_regression.sql`
- `tests/security/store-authorization-eligibility-db005.test.ts`
- `tests/security/active-store-preference-g1d.test.ts`
- `scripts/db/run-g0b-ci.sh`
- `supabase/baseline/manifest.json`

運用検査・証拠:

- `docs/quality-audit/operator/db004-r1/01-read-only-precheck.sql`
- `docs/quality-audit/operator/db004-r1/06-read-only-postcheck.sql`
- `docs/quality-audit/operator/db004-r1/10-c6-migration-runbook.md`
- `docs/quality-audit/db005-current-supabase-c6-snapshot-manifest.json`
- `docs/quality-audit/04-findings.md`
- `docs/quality-audit/07-remediation-plan.md`
- `docs/quality-audit/17-current-supabase-integration-report.md`
- `docs/quality-audit/28-post-r1-c5-read-only-report.md`
- `docs/quality-audit/29-current-c6-migration-execution-report.md`
- `docs/quality-audit/30-db005-store-eligibility-remediation-report.md`

開始時から存在した未コミット差分は保持し、DB-005対象外の製品修正、Current data、Current migration、deploy、外部送信は変更していない。
