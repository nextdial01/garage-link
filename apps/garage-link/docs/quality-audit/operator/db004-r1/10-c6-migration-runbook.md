# G5-R C6 migration runbook（今回実行禁止）

本書はR1、post-R1 backup、C5がすべてPASSした後の別工程です。今回のSQLパッケージ作成ではmigrationを実行しません。deployも別承認です。

## 固定条件

- manifest entry: 47件
- manifest checksum: `3f0358fcb993071ba6def9c8bdb2e81a901b300c4301dabb8dd33ca1dbfb24f0`
- DB-005 snapshot: `44eae79c4403741e1c3cd9cf6fc199b5baeb392f0c2cd88078d3b003cc3387a5`
- Current ledger開始値: 39件
- 未適用: 9件
- `lock_timeout`: 3秒
- `statement_timeout`: 120秒
- maintenance window: 最大30分
- post-R1 durable backup: 必須
- operatorのC6実行承認: 必須

## 適用順

| 順番 | Version | Name | Checksum | 主要検査 |
|---:|---|---|---|---|
| 1 | `20260726000100` | membership admission lock | manifest参照 | active owner、direct write拒否、helper |
| 2 | `20260726000200` | role-aware business write lock | manifest参照 | viewer write 0、USING/WITH CHECK |
| 3 | `20260726000300` | vehicle sale atomicity | manifest参照 | claim/RPC/UNIQUE/RLS |
| 4 | `20260726000400` | extension compatibility repair | manifest参照 | digest/search_path/owner |
| 5 | `20260726000450` | restore required baseline relations | manifest参照 | 4 required relationのshape/RLS/policy |
| 6 | `20260726000500` | service-role tenant/store integrity | manifest参照 | TenantContext、複合FK、immutable guard |
| 7 | `20260727000100` | active store preference | manifest参照 | assignment backfill各owner 1、preference/RLS |
| 8 | `20260727000200` | accounting integrity | manifest参照 | invoice/payment ledger、immutable、RPC |
| 9 | `20260727000300` | delivered sale correction | manifest参照 | case/refund/ownership/RLS |

checksumの正本はmigration SQL実体と`supabase/baseline/manifest.json`である。次のブロックは機械生成し、C6前に9/9一致を検査する。

<!-- C6_MANIFEST_CHECKSUMS_START -->
<!-- scripts/check-c6-migration-integrity.mjs --write-runbook でmanifestから生成。手作業で編集しない。 -->
| Version | Manifest SHA-256 |
|---|---|
| `20260726000100` | `d8c4f1ffd0380b4af6a01cb59bbe55ac666c402cc957b41c4268066e71c49482` |
| `20260726000200` | `6cf299750d0d647926975edb864732ac1f5fb11ac6d810553b51f64c9c315064` |
| `20260726000300` | `fd1c3f44fd7c8050484325865d2f5c8ca3ec517eb681e48bb897db9ad7246606` |
| `20260726000400` | `268ae491e1e567677c0f513bacdd5212b821a10c7511fb15c9bbbd7380aaf5eb` |
| `20260726000450` | `e6b31cd773f48632964ccc01580eff18b315f9d5f17c99c7b5e741a6fe99718d` |
| `20260726000500` | `a73c1fd2701f8dd004677bcbc23dc157f05204384f24a3dbfbaab384009efcdb` |
| `20260727000100` | `edae573430ecdb52b0b86eb02898941027e964188cb15c31375e39d67d0c04a3` |
| `20260727000200` | `07f2f7389fcd2b323ec0444ec718b963bef66affd6063a972a98ca7448b8f5af` |
| `20260727000300` | `108f648f01b10f0cdbe333126562e0ef44d97226f8218c1abcc8c3287e5e515c` |
<!-- C6_MANIFEST_CHECKSUMS_END -->

`20260726000450`の4 relationすべてについて、required column、constraint、owner、grant、RLS、policyがPASSするまで`20260726000500`へ進みません。

## migrationごとの手順

1. `node scripts/check-c6-migration-integrity.mjs`でmigration実体・manifest・runbookを9/9照合
2. remote ledgerに同versionがないことを確認
3. `lock_timeout=3s`、`statement_timeout=120s`を設定
4. 1 migrationだけ適用
5. ledgerが1件だけ増えたことを確認
6. expected table/column/function/RPCを確認
7. FK/UNIQUE/CHECK、RLS/policy、owner/grant、EXECUTEを確認
8. row countとbackfill数を記録
9. 次migrationのdependencyを確認

## 即時停止条件

- project/snapshot/manifest/ledger/checksum不一致
- backup不備
- lock timeoutまたはstatement timeout
- 想定外の既存row・backfill
- FK/UNIQUE/CHECK失敗
- RLS/policy/RPC/owner/grant消失
- ledger書込み失敗
- `00450` shape不一致
- 外部worker・Cron・Webhook・外部通信の起動

停止時は後続versionを実行しません。

## rollback

- SQL transaction内の失敗: transaction rollback
- commit後の問題: security-preserving / 機能停止型rollbackを優先
- G1-A/G1-Bの脆弱経路、旧`store_members`認可、viewer writeを復活させない
- append-only claim/payment/audit/correction dataは削除せずarchiveまたは機能停止
- Current上での破壊的rollbackは行わず、必要ならbackup restore cloneで検証
- 再適用前にledger stateとchecksumを再確認

## migration完了後

G1-A〜G4-B、DB-003、RLS/RPC、Security、API/browser smoke、lint、TypeScript、production buildを実施します。Vercel deploy、本番migration、外部送信、正式公開は別の明示承認が必要です。
