# GARAGE LINK DB-004 store tenant repair plan

- 実施日: 2026-07-27
- 対象: Current Supabase `stores.tenant_id IS NULL` 4件
- 環境: `controlled_test`
- 実施範囲: Current REST GET、post-DB-002 backupのnetwork-none clone、実装・migration静的照合
- Current data変更: **0件**
- migration適用: **0件**
- 結論: **4件すべてC分類。operator repair承認文案は作成せず、安全停止**

## 1. DB-004概要

Currentの5 store中4件で`tenant_id IS NULL`であり、G1-Cは`G1C_PRECHECK_STORE_WITHOUT_TENANT`で必ず停止する。単一active tenant、店舗名、旧`store_members`を根拠に割り当てず、Current GETとbackup cloneを照合した。

今回からstore fingerprintは`SHA-256(store.id文字列)`の先頭12桁で固定する。`21`で使ったfingerprintは生成方式が記録されていないため、operator承認の対象識別には使用しない。

## 2. 対象store

| Store fingerprint | Name fingerprint | Status | Created at (UTC) | created_by / updated_by | canonical membership | old-only store_members | store audit | Subscription |
|---|---|---|---|---|---:|---:|---:|---|
| `2c127637ea1c` | `56780d5d844f` | trial | 2026-07-05 15:52:14 | NULL / NULL | 0 | 1 | 0 | 1件、tenant NULL |
| `b7c22a4ee049` | `ce9361368991` | active | 2026-07-19 05:20:50 | NULL / NULL | 0 | 1 | 0 | 1件、tenant NULL |
| `eb2bcbf525ea` | `ce9361368991` | active | 2026-07-19 05:22:07 | NULL / NULL | 0 | 1 | 0 | 1件、tenant NULL |
| `c4ff77ffe6b2` | `798ab25827ee` | active | 2026-07-23 10:01:52 | NULL / NULL | 0 | 1 | 0 | 1件、tenant NULL |

`stores`には`owner_user_id`とsoft-delete列がない。4件ともAuth userは存在してemail確認済みだが、Auth metadataにtenant/store scopeはなく、招待日時・対応Auth auditもない。店舗名fingerprintが同じ2件もあり、名称は識別根拠にならない。

## 3. tenant候補

Currentに存在するtenantはactive 1件、fingerprint `cbc9a4f71eee`。ただし4 storeとの次の関連はすべて0である。

- store直結canonical membership
- 旧store member userとcanonical membershipのuser一致
- created_by / updated_by経由membership
- store create audit・operation・event
- audit JSON内tenant/company ID
- tenant付き子レコード
- tenant付きcompany subscription
- Auth metadata上のtenant/store claim

active tenantが1件だけであることは、依頼の禁止条件どおり所属根拠に採用しない。したがって4件に設定できる既存tenant ID候補は**0件**である。

## 4. 根拠

旧`20260706000000_signup_onboarding.sql`の`create_store_for_current_user`は、tenantを作らず、store、`store_members`、`company_subscriptions(company_id=store.id, tenant_id=NULL)`を作る。4件はそれぞれ次を満たし、この旧signup経路と一致する。

- Auth user作成・確認直後にstoreが作成された。
- storeと旧store memberの`created_at`が一致する。
- active 3件ではcompany subscriptionも同時刻。trial 1件もsubscription 1件が存在する。
- 4 store memberのuserは互いに異なり、唯一のcanonical owner membership userとも異なる。
- subscriptionは各storeを別`company_id`として保持し、tenant IDはない。

後続G1-A版signupはtenant、store、canonical owner membership、subscriptionを同一transactionで作る。この差から、対象4件は「既存1 tenant配下の複数store」とは証明できず、**必要tenant行そのものが未作成である可能性が高い**。

## 5. 関連データ整合

### store別分布

| Store | tenant-less業務データ | tenant付きデータ | 複数tenant混在 | cross-store | orphan |
|---|---|---:|---:|---:|---:|
| `2c127637ea1c` | customer 1、vehicle 1、deal 1、quote/item各1、invoice/item各1、maintenance 1、inventory count 1、repair part 2 | 0 | 0 | 0 | 0 |
| `b7c22a4ee049` | なし | 0 | 0 | 0 | 0 |
| `eb2bcbf525ea` | なし | 0 | 0 | 0 | 0 |
| `c4ff77ffe6b2` | なし | 0 | 0 | 0 | 0 |

対象環境に独立payment tableはなく、対象invoiceはlegacy payment列だけを持つ。L-LINK connection/candidate、import/export、uploaded file、tenant付きLINE rowは4 storeとも0。関連行はstore内では整合するが、tenant列を持たないため正式tenantの証拠にはならない。

各storeに`company_subscriptions`が1件ずつあり、いずれも`company_id=store.id`、`tenant_id=NULL`。G1-Cはstore tenant確定後に一意backfillする設計だが、その前提となる正式tenantが現状存在しない。

## 6. repair可否分類

| Store | 分類 | 理由 | 現在のrepair候補 |
|---|---|---|---|
| `2c127637ea1c` | **C** | 業務データはあるが全てtenant-less。canonical membership、audit、tenant付き設定なし | なし |
| `b7c22a4ee049` | **C** | 旧signup行だけ。正式作成履歴・tenant候補なし | なし |
| `eb2bcbf525ea` | **C** | 旧signup行だけ。別user・別subscriptionであり、同名は根拠にできない | なし |
| `c4ff77ffe6b2` | **C** | 旧signup行だけ。Auth metadataはtest用途を示すがtenantを示さない | なし |

一意確定Aは0件、operator確認で既存候補を確定できるBも0件、Cは4件。現時点で`stores.tenant_id`だけを更新できる対象は0件である。

## 7. repair transaction

### 現時点

実行計画は**BLOCKED**。4 storeに対応する正式tenant recordが存在しないため、既存1 tenantを割り当てるSQLは作成しない。

### 正式構成確認後の推奨

1. operatorが各storeの正式会社・契約単位を確認する。
2. 対応tenantが不存在なら、tenant・owner membership・subscriptionを含む別のtenant recovery Batchとして設計・承認する。これは`tenant_id`1列repairの範囲外。
3. 対応tenantが既存すると客観的に確認された場合だけ、4件全てを1 transactionで修復する。
4. `FOR UPDATE`をstore fingerprint順に取得し、store 4件、tenant active、tenant NULL、row version、関連tenant候補混在0、operator correlation IDを再確認する。
5. 更新列は`stores.tenant_id`のみ。既存triggerによる`updated_at`更新だけを許容する。
6. 1件でも条件不一致、更新件数不一致、別tenant候補出現ならtransaction全体をrollbackする。

4件を店舗別transactionにすると途中状態でG1-Cを開始できず、部分repairの判断が残る。全件の正式対応が確定した後の**4件all-or-nothing transaction**を推奨する。対象4件なのでrow lock負荷は小さい。

## 8. 監査ログ

repairが別途承認された場合、storeごとにappend-only audit 1件、合計4件を予定する。

- store/tenant fingerprint
- actorとoperator承認
- `before tenant = NULL`、`after tenant`
- 修復理由、根拠分類
- correlation ID、実施日時

PII、token、店舗名、SQL全文は記録しない。correlation IDはoperator承認時に新規採番し、現時点では未採番。

## 9. rollback

通常rollbackはrepair直後かつG1-C適用前だけを想定する。store ID、repair correlation ID、repair後の別更新なし、migration未適用、別operator承認を全て確認する。

G1-C適用後はsubscription等へtenantがbackfillされ、複合FK・NOT NULL・scope guardが入るため、storeをNULLへ戻す操作を通常rollbackにしない。feature stopとbackup restore判断を優先する。

## 10. 一時資格情報

- 種別: Supabase CLIがdry-run時に出力した一時PostgreSQL login password（`PGPASSWORD`形式）。
- 保存: Codex tool transcriptに表示された。値は監査文書、governance、backupへ転記していない。
- shell history: `PGPASSWORD` assignment 0、dry-run command 0。
- Supabase trace 6 file: password/URI/dry-run marker 0。
- backup: password/connection URI marker 0。
- `/tmp`の旧query script 3件: runtime変数名への参照だけでliteral credentialなし。
- `.temp/pooler-url`: passwordなし。
- 有効期限・現在の有効性・明示revoke: ローカルから安全に証明できず未確認。

資格情報の実値を再利用して有効性試験は行わない。operatorがSupabase側で一時role/credentialの失効を確認できない場合はrevokeまたはdatabase credential rotationを推奨する。確認完了までC6停止条件を維持する。

## 11. operator承認文案

**未作成**。4 store全てがC分類で、正式tenant IDを確定できていないためである。

代わりに次の人間確認が必要である。

| Store | 確認事項 |
|---|---|
| `2c127637ea1c` | 独立tenantとして復旧するか、正式に既存tenant配下か |
| `b7c22a4ee049` | 独立tenantとして復旧するか、正式に既存tenant配下か |
| `eb2bcbf525ea` | 同名別storeとの関係、独立契約か同一tenant配下か |
| `c4ff77ffe6b2` | test storeの保持要否と正式tenant |

一部だけ確定してもC6のNULL 0条件を満たさない。partial repairより全4件確認まで停止する案を推奨する。

## 12. C5・C6再開条件

- 4 store全ての正式tenant構成を人間確認
- 必要tenant recordの存在。不存在なら別tenant recoveryの設計・承認・実行
- store/tenant対応のoperator明示承認
- 監査・rollback・correlation ID
- repair後backup
- store tenant NULL 0、subscription alias、canonical membership/owner、cross-tenant/store 0
- G1-C precheck、G1-D assignment/preference、vehicle/deal、invoice/payment、L-LINK scope
- migration ledger/RLS/policy不変
- CLI一時資格情報の失効またはrotation確認

上記が揃うまでC5全体とC6は再開しない。

## 13. 公開可否への影響

- DB-004: **Open / High / P0 / repair不可**
- Current data変更: 0
- migration適用: 0
- 本番migration: 不可
- 本番deploy: 不可
- 正式公開: 不可

## 14. 後続方針決定（2026-07-27）

オーナーは4 storeをそれぞれ独立tenantとして復旧する方針を承認した。本書のC 4件は「既存tenantへ一意に割当できない」という旧repair分類であり、誤りではない。後続では既存tenant割当を行わずnew tenantを4件作る。

owner候補は別軸でA 0/B 4/C 0。owner個別承認とCurrentに未存在のG1-D tableを二段階化する承認が必要なため、実行はBLOCKED。新しい正本は`23-db004-independent-tenant-recovery-plan.md`。Current data変更0、migration 0。
