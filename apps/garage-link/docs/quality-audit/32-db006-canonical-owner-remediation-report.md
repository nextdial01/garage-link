# DB-006 canonical owner remediation report

## 1. 判定

- 分類: **A — precheck contract bug**
- 新ID: `MIGRATION-PRECHECK-001`
- Current data repair: 不要、実行0件
- legacy `store_members` repair: 不要、実行0件

canonical `memberships`にactive ownerが存在し、tenant/store/role/store statusも正常だった。G1-A precheckだけがlegacy projectionとの一致をowner admission条件へ混入し、valid ownerを0件としていた。

## 2. 依存関係

### Migration

`20260726000100`にはlegacy tableの隔離・互換projection同期・旧API停止用参照があるが、owner admission、認可正本、必須backfillの入力ではない。後続G1-Bは主要role helperを`memberships`だけで再定義し、G1-Dはv2 contextを使用する。

9 migrationのdata backfillは`store_members`をcanonical入力として使用しない。legacy mismatchは複合FK、UNIQUE、CHECK、G3/G4-A/G4-Bのbackfillを壊さない。

### Runtime

- `src`のuser-facing authorization queryに`.from('store_members')`: 0件
- core authorization helperのlegacy fallback: 0件
- deprecated compatibility read: fail-closedで内部互換用途のみ
- `store_members` direct write: anon/authenticatedともrevoke

## 3. 最小修正

`20260726000100_membership_admission_lock.sql`のowner precheckを次へ変更した。

- 必須: active canonical membership、owner role、tenant/store一致、active/trial store、`coalesce(invite_accepted_at, joined_at)`
- 非依存: legacy rowの有無・role・status
- legacy drift: blocking errorではなく`G1A_PRECHECK_LEGACY_DRIFT_COUNT` NOTICE
- inactive/deleted/unknown status、canonical owner 0、scope不一致は従来どおりFAIL

RLS、role、constraint、runtime permissionは弱体化していない。

## 4. 追加fixture

| # | ケース | 結果 |
|---:|---|---|
| 1 | canonical owner / legacyなし | PASS |
| 2 | canonical owner / legacy role不一致 | PASS + drift記録 |
| 3 | legacy ownerのみ | FAIL（期待どおり） |
| 4 | canonical inactive / legacy active | FAIL（期待どおり） |
| 5 | canonical tenant不一致 | FK拒否 |
| 6 | canonical store不一致 | FK拒否 |
| 7 | trial store / canonical active owner | PASS |
| 8 | inactive store / canonical owner | FAIL（期待どおり） |
| 9 | last canonical owner削除 | FAIL（期待どおり） |

fresh、upgrade、rollback、再適用、backup/restore、G1-A〜G4-B、2/10/100 workerもPASSした。

## 5. 再生成物

- G1-A migration checksum: `d8c4f1ffd0380b4af6a01cb59bbe55ac666c402cc957b41c4268066e71c49482`
- manifest entries: 47
- manifest SHA-256: `fcd990a8e9ff135fa897f5d1f017e8d962c3ed3b4e0c5813cc75851c41dcc677`
- snapshot fingerprint: `9e786d4c29ba9ff9bdb94c88df33cb525eed265c4a2f9ceda4d7e1e3b4258a21`
- snapshot file SHA-256: `b06fd0fabb8c3201d4f0a800c704045759518f2ab76f7055fcc4990963ea3653`
- migration integrity: 9/9 PASS
- single preflight: PASS

checksum正本はmigration SQL実体とmanifestだけである。runbookはmanifest参照の生成blockを使用する。

## 6. Current targeted precheck

tenant fingerprint `b24a1a657ea6`について、適用前に次を確認した。

- canonical active owner: 1
- canonical owner scope issue: 0
- ineligible store: 0
- legacy-only authorization path: 0
- legacy mismatch: 1（audit information）
- target migration applied: 0
- ledger: 39

## 7. Current C6結果

9 migrationはすべて個別transactionでPASSし、ledgerは48件。G1-A適用直後、legacy mismatch 1件は互換projection隔離処理で`suspended`となり、権限を付与していない。canonical membershipは変更していない。

Currentのactive owner 5、invalid membership 0、cross-tenant/cross-store/orphan 0、required relation 4、RLS 119、policy 363、target RPC missing 0を確認した。詳細は`31-current-c6-migration-execution-report.md`を参照する。

## 8. 残存リスク

Currentはownerのみ5件で、role別動的fixtureがない。viewer/staff/implementer、G3/G4-A/G4-Bの多worker試験はローカル分離DB PASSで、Currentではschema/ACL/guard/整合性まで確認した。これは未実行範囲として公開Gateに引き継ぐ。

DB-006は**Resolved / Current Applied**。deployと正式公開は、残存High修正および別承認の最終Gateまで不可。
