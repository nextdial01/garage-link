# GARAGE LINK DB-004 independent tenant recovery plan

- 作成日: 2026-07-27
- 対象環境: Current Supabase (`controlled_test`)
- project fingerprint: `5b41e1af2add`
- DB host fingerprint: `a0a021f40732`
- 対象: tenant未設定の4 store
- 本工程: read-only調査とoperator実行承認文案まで
- Current data変更: **0件**
- migration適用: **0件**
- 結論: **1 store = 1 independent tenantを採用。owner候補はA 0 / B 4 / C 0で、実行はowner確認と資格情報措置を待ちBLOCKED**

## 1. 採用方針

4 storeを既存tenantへ統合せず、storeごとに新しいtenantを1件作成する。tenant、契約、canonical membership、将来のassignment/preference、業務scopeをstore単位で分離する。`stores.tenant_id`だけの単純repair、`store_members`の認可復活、複数storeの同一tenant化は行わない。

Currentへの再GETで4 storeのfingerprint、status、`tenant_id IS NULL`、old-only memberを再確認した。post-DB-002 backupではcanonical membership 0、store audit 0、company subscription各1件・tenant NULL、cross-store 0、orphan 0を確認済みである。

## 2. 対象store

fingerprintは`SHA-256(store.id文字列)[:12]`である。店舗名、メール、Auth IDの生値は記録しない。

| Store fingerprint | Status | Legacy user fingerprint | Legacy role | Auth存在・確認 | 利用実績 | Public/Auth audit | 分類 |
|---|---|---|---|---|---|---|---|
| `2c127637ea1c` | trial | `4a0360984dc0` | owner | 1 / confirmed | last sign-inあり、session 2 | 0 / 0 | B |
| `b7c22a4ee049` | active | `a7350f6f0933` | owner | 1 / confirmed | last sign-inあり、session 1 | 0 / 0 | B |
| `eb2bcbf525ea` | active | `dc5e4dbb6ea5` | owner | 1 / confirmed | last sign-inあり、session 1 | 0 / 0 | B |
| `c4ff77ffe6b2` | active | `e9d226b2af53` | staff | 1 / confirmed | last sign-inあり、session 0 | 0 / 0 | B |

3件はlegacy owner・Auth利用・競合候補0だが、owner権限での監査可能な操作がないためAにはしない。1件はlegacy roleがstaffであり、owner昇格を客観的に証明できない。4件ともuser/store関係は強いがowner確定にはoperator確認が必要なためBとする。永続的に特定不能なCは0件である。

旧`22`のA/B/Cは「割当可能な既存tenant候補」の分類であり、本書のA/B/Cは「owner候補」の分類である。独立tenant方針の承認により既存tenant候補問題は解消したが、ownerの明示確認は未了である。

## 3. owner候補

owner候補Aは0、Bは4、Cは0。operatorは各storeについて上表のuser fingerprintが正規ownerであることを個別に承認する必要がある。`c4ff77ffe6b2`はlegacy staffからownerへの権限付与になるため、他3件より強い確認を必須とする。

owner確認が得られないstoreはそのstore単位transactionを開始しない。別ownerを推測追加せず、正式な本人確認・招待・承認へ回す。

## 4. 新tenant

- storeごとのtransaction内で`gen_random_uuid()`により新規UUIDを1件生成する。
- 生成前のtenant fingerprintは固定しない。commit前に`SHA-256(new tenant id)[:12]`を算出してauditと実行記録へ保存する。
- tenant名はPIIを含まない`GARAGE LINK recovered tenant <store fingerprint>`形式とする。
- statusは既存正式値`active`。planはstore/subscriptionの既存値から一意に一致する場合だけ維持し、矛盾時は停止する。
- 同一tenantを複数storeへ使わず、既存tenant `cbc9a4f71eee`へは関連付けない。

予定新規tenantは4件。ただしowner B承認がない現時点の実行可能件数は0件である。

## 5. canonical membership

ownerが明示承認されたstoreだけ、new tenant・対象store・対象userでcanonical `memberships`を1件作成する。

- role=`owner`、status=`active`
- `joined_at`と承認済みを示す正式列はrecovery実行時刻
- legacy `store_members`を認可根拠へ戻さない
- user/tenant active、store/tenant一致、canonical重複0、active owner 1をpostcheckする
- auditに`legacy tenant recoveryによるcanonical membership作成`と明記する

予定4件。`c4ff77ffe6b2`はoperatorがstaff候補をownerとして明示承認しない限り作成しない。

## 6. store assignment

Currentには`membership_store_assignments`が存在せず、read-only RESTは404だった。このtableは未適用G1-D migration `20260727000100`が作成し、canonical `memberships.store_id`から1件だけ決定的にbackfillする。

したがってDDL禁止・migration別工程の現時点で、recovery transaction内へassignment INSERTを含めることは不可能である。安全な順序は次の二段階とする。

1. Recovery R1: canonical membershipの`store_id`を唯一の対象storeとして作成する（assignment予定をauditへ記録）。
2. 別承認のC6: G1-D migrationが`membership_id + store_id`を1件backfillする。G1-D直後に各store 1件、合計4件を検証する。

G1-Dをmanifest順序外で先行適用したり、同名tableをrecovery SQLで作成したりしない。assignment予定は4件で、Currentでの作成は本工程0件である。

## 7. preference

Currentには`user_active_store_preferences`も存在せず、read-only RESTは404だった。各新tenantは1 storeだけなので、G1-D適用後にuser/tenant/storeが一意と検証できる4件を、別のR2 transactionで作成する。

preferenceは権限正本にせず、active membershipとassignmentを毎回再確認する。recovery前またはG1-D migrationと同じ工程では作成しない。予定4件、現時点0件。

## 8. subscription

post-DB-002 backup上、各storeは`company_id=store.id`のcompany subscriptionを1件だけ持ち、全4件がtenant NULLである。status/plan/期間/Stripe識別子を変更せず、`tenant_id`だけをnew tenantへ設定する。

- 対象0件または2件以上ならそのstoreを停止
- `company_id`が対象storeと一致しない場合は停止
- 外部Stripe通信、新規customer/subscription発行は0
- tenant更新予定4件

## 9. tenant-less業務データ

`2c127637ea1c`にはcustomer 1、vehicle 1、deal 1、quote/item各1、invoice/item各1、maintenance 1、inventory count 1、repair part 2の計11行がある。他3 storeは0行である。11行は親子が同一store、cross-store 0、orphan 0である。

Current schemaではこれら11行に直接更新すべきtenant列がなく、store scopeからtenantを解決する設計である。したがってrecovery R1での業務行UPDATE予定は**0件**。storeのtenant確定後に同じデータが新tenantへ一意に帰属することをpostcheckする。

G1-Cがtenant列をbackfillする対象のうち、4 storeに該当するのはcompany subscription 4件だけで、これはR1で先に設定するためG1-C想定backfillは0件になる。将来のprecheckで他のtenant列付き行が1件でも出現した場合は推測更新せず、そのstore transactionを停止する。

## 10. transaction

4 storeは独立transactionとし、各store内はall-or-nothingにする。

1. project fingerprint、store fingerprint、row versionを確認しadvisory transaction lockを取得
2. store active/trial、tenant NULL、legacy user、Auth user、operator owner承認を再確認
3. cross-store/orphan/tenant候補/duplicate recovery 0を確認
4. tenant作成
5. `stores.tenant_id`だけ更新（triggerの`updated_at`を許容）
6. canonical owner membership作成
7. assignment/preferenceのR2予定をaudit metadataへ固定（tableがないためINSERTしない）
8. company subscription 1件の`tenant_id`だけ更新
9. 業務データは更新せず、新tenantへの一意帰属を検査
10. append-only audit 1件
11. tenant/store 1対1、owner 1、subscription 1、cross-scope/orphan 0をpostcheckしてcommit

assignment/preferenceを含むR2はG1-D適用後の別transaction・別検査になる。この制約を受け入れない限り、現行manifest順序を維持したrecoveryは実行不可である。

## 11. idempotency

batch correlation ID案: `820a4de6-15fe-43ae-9779-a87e79998ddf`。

| Store | Recovery key fingerprint |
|---|---|
| `2c127637ea1c` | `079dd4c23908` |
| `b7c22a4ee049` | `06c3f3c874c3` |
| `eb2bcbf525ea` | `dbe342055dc9` |
| `c4ff77ffe6b2` | `eecf0a3ad617` |

store UUID由来のadvisory transaction lockとstore row `FOR UPDATE`で同一storeを直列化する。開始時に`tenant_id`とrecovery audit metadataを照合し、同key・同結果は既存tenantを返し、同key・異tenantまたはtenant既設定でaudit不一致は409相当で停止する。tenant作成前後を同じtransactionに含めるためprocess kill時に孤立tenantを残さない。

## 12. audit

R1 commitごとに`audit_logs`へ1行、合計4行を予定する。

- store/new tenant/owner userのfingerprint
- operator承認識別、recovery理由
- old/new scope、subscription更新件数、業務直接backfill 0
- assignment/preference pending状態
- correlation ID、recovery key fingerprint、実施日時

PII、token、subscription ID全文、SQL、店舗名は記録しない。R2はassignment/preference作成のauditを別に記録するため、R1の予定audit 4件とは分離する。

## 13. rollback

store単位runbookとする。通常rollbackはG1-C適用前かつ、correlation/recovery key一致、recovery後の正当な業務更新0、対象tenantが本recovery作成、他store/user利用0、別operator承認を満たす場合だけ実施する。

1. 対象行をlockし事後更新0を確認
2. subscription tenantをNULLへ戻す
3. recoveryで作成したcanonical membershipを無効化または削除候補へ隔離
4. store tenantをNULLへ戻す
5. 未使用recovery tenantを削除
6. recovery auditは削除せずrollback auditを追記

G1-C適用後はNULL復帰を通常rollbackにしない。tenantをinactive化し、新機能をfail-closed停止してrestore判断へ進む。old-only認可を復活させない。

## 14. 一時資格情報

Supabase CLI dry-runで表示された一時PostgreSQL login credentialは、文書、backup、shell history、trace、残存scriptへのliteral保存0を確認済みである。Currentの有効性・明示revokeはローカルから証明できず、rotationも本工程では実行していない。

operatorはSupabase側で旧credentialのrevoke/expiryを確認し、証明不能ならdatabase credentialをrotationして安全保管する必要がある。この確認が完了するまでrecoveryとC6はBLOCKED。credential値は記録しない。

## 15. operator承認文案

以下は**実行承認の文案**であり、本書作成時点では未承認である。

> DB-004 independent tenant recovery R1をCurrent Supabase project fingerprint `5b41e1af2add`で実行することを承認します。対象storeは`2c127637ea1c`、`b7c22a4ee049`、`eb2bcbf525ea`、`c4ff77ffe6b2`の4件です。各storeを別々のnew UUID tenantへ1対1で復旧し、既存tenantへ統合しません。
>
> owner候補は順に`4a0360984dc0`、`a7350f6f0933`、`dc5e4dbb6ea5`、`e9d226b2af53`です。私は各候補が対象storeの正規ownerであることを個別に確認し、legacy staffである最後の候補をownerとしてcanonical化することも明示承認します。
>
> tenant UUIDは各store transaction内で`gen_random_uuid()`により生成し、commit前にfingerprintを監査記録へ保存します。correlation IDは`820a4de6-15fe-43ae-9779-a87e79998ddf`、recovery key fingerprintは順に`079dd4c23908`、`06c3f3c874c3`、`dbe342055dc9`、`eecf0a3ad617`です。
>
> 各storeは独立transactionとし、予定変更はtenant 1 INSERT、store 1 UPDATE、membership 1 INSERT、subscription 1 UPDATE、audit 1 INSERTです。業務行の直接UPDATEは0です。G1-D表がCurrentに未存在のためassignment/preferenceはR1で作成せず、別承認のC6でG1-D適用後、各1件を検証・作成する二段階方式を承認します。
>
> store/owner/subscription/tenant-less data/cross-store/orphan/row versionの不一致、二重recovery、更新件数不一致、外部通信、資格情報措置未完の場合は当該storeをrollbackして停止します。通常rollbackはcorrelation一致、事後更新0、別operator承認、G1-C未適用の場合だけ行い、G1-C後はinactive化する機能停止型とします。
>
> recovery後にpost-recovery backup、C5 read-only、DB-003/G1-C precheck、C6再preflightを行います。migration適用、Vercel deploy、本番適用、外部送信はこの承認に含みません。

この文案に加え、CLI一時credentialのrevoke/rotation確認が必要である。

## 16. C5・C6再開条件

- owner候補B 4件の個別明示承認
- G1-D未存在tableを二段階化する計画の承認
- 一時credentialのrevoke/expiryまたはrotation確認
- 最新backup保持、project fingerprint一致、外部worker停止
- store別R1成功後のpost-recovery backup
- store tenant NULL 0、新tenant 4、owner各1、subscription一致、business cross-scope/orphan 0
- migration ledger/RLS/policy不変
- C5 read-only PASS
- snapshot/manifest/checksum、DB-003 PENDING_CREATE、pending migration順序の再照合
- C6 migrationは別operator承認

現時点ではR1、C5、C6とも開始不可である。

## 17. 公開可否への影響

- DB-004: **Recovery design approved / execution BLOCKED / High / P0**
- recovery実行可能store: 0（owner B承認前）
- Current data変更: 0
- migration適用: 0
- Current未適用Critical: 3
- 本番migration: 不可
- 本番deploy: 不可
- 正式公開: 不可

## 18. R1 operator承認と実行停止（2026-07-27）

owner候補4件、R1 scope、correlation ID `820a4de6-15fe-43ae-9779-a87e79998ddf`はoperator承認済みとなった。一方、実行前必須条件の一時DB credential revoke/expiry/rotation完了を示す証拠はなく、incident状態も`失効確認待ち`のままである。

停止条件どおり4 storeともtransaction開始0、Current data変更0、audit 0、migration 0。post-R1 backupとC5は未実施。実行記録は`24-db004-r1-execution-report.md`を参照する。

## 19. SQL Editor operator package（2026-07-27）

資格情報・CLI調査を終了し、Current Supabaseへ接続しない方針へ切り替えた。承認済みowner対応、subscription対応、correlation IDを固定したSQL Editor用パッケージを`operator/db004-r1/`へ作成した。

- store別の独立transaction、all-or-nothing、冪等再実行を実装
- 許可DMLは`tenants` 1 INSERT、`stores` 1 UPDATE、`memberships` 1 INSERT、`company_subscriptions` 1 UPDATE、`audit_logs` 1 INSERTのみ
- assignment、preference、業務データ、`store_members`、migration、外部通信は対象外
- Current相当fixtureで4件成功、1件失敗時の局所rollback、再実行0変更、process kill相当0部分更新を確認
- 実DBでのR1は未実行。operatorが`00-README.md`の順序と停止条件に従ってSQL Editorで行う
