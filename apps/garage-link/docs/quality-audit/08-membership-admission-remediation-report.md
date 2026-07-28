# G1-A Membership admission remediation report — G3回帰追補

更新日: 2026-07-26

本ファイルはG3開始時に存在しなかったため、G3で確認したG1-A/G1-B不変条件だけを記録する。

- membership正本は`memberships`のまま。
- G3 RPCは`current_user_store_role`を使用し、`store_members`を参照しない。
- inactive membership、old-only membership、他tenant ownerは売約RPCで`SCOPE_FORBIDDEN`。
- viewer/implementerは`ROLE_FORBIDDEN`。
- authenticatedからmembership直接write不可というG1-A制約は変更していない。
- G1-B role regression SQLはG3適用後もPASS。
- G3 migration/rollbackはG1-A/G1-B helper・policyを変更しない。

結論: G3によるG1-A/G1-Bの巻き戻しは確認されていない。

## G3-R統合回帰追補

- G3適用済みDB、G3 rollback後、再適用後、backup restore後の各時点でG1-B DB role regressionはPASS。
- authenticatedから`memberships`と`store_members`へのINSERT/UPDATE/DELETE grantは0。
- inactive userとold-only userの`current_user_store_ids()`は0件。
- 最後のowner無効化はcheck violationとして拒否。
- ambiguousなactive売約を含むupgradeはG3 migration全体をrollbackし、G1-A/G1-Bを変更しなかった。
- security suite 202/202 PASS。

G0-Bで公式Supabase PostgreSQL bootstrapからG1-Aを含む全42 entryを適用し、fresh・upgrade・rollback後再適用・restore後のmembership回帰をPASSした。未招待自己所属、inactive、old-only、直接writeはいずれも拒否を維持する。

## G1-C統合追補

- manifestは43 entryへ更新。G1-C fresh/upgrade/rollback/restore後もG1-A回帰PASS。
- `memberships`が唯一の認可正本で、G1-C High経路の`store_members`認可参照は0。
- membershipの`tenant_id`/`store_id`にもscope不変guardが追加され、通常UPDATEで別scopeへ移動できない。
- active/inactive/old-only、最後のowner、直接membership writeの拒否は維持。
- `TENANT-003`のactive-store preference設計はG1-A再設計を避けるため未変更。

## G1-D統合追補（2026-07-27）

- `memberships`はuser＋tenantのactive membershipとroleの唯一の正本。
- `membership_store_assignments`は利用可能storeの関係であり、active/accepted membershipなしには権限を付与しない。
- owner/adminはtenant内全active store、implementer/staff/viewerはassignment済みstoreだけを利用する。
- active-store preferenceは認可の正本ではなく、切替時・利用時にmembership/assignment/store/tenantを再検査する。
- `memberships.store_id`から既存1 storeだけを決定的backfillし、追加storeやpreferenceを推測しない。
- 店舗切替によるmembership/role更新は0件。inactive、old-only、他tenant、自己assignmentを拒否し、最後owner保護も維持した。
- fresh/upgrade/rollback/restore、2/10 worker、security 216/216、API/browser smoke、Lint/型/buildはPASS。

結論: G1-DはG1-Aの正本・招待・role変更・最後owner保護を変更せず、複数store選択を別レイヤーとして追加した。
