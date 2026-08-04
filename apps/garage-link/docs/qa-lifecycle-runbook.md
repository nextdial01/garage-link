# GARAGE LINK QA Lifecycle Runbook

Staging QAは `scripts/qa/lifecycle.mjs` だけを正規経路とする。手書きSQL、trigger disable、`session_replication_role`変更、service_role・tenant prefix・custom GUC単独の削除許可は禁止する。

## 固定境界

- Supabase: `gaytoojzwqkpuvfofeql`
- Canonical URL: `https://garage-link-staging.vercel.app`
- Vercel project: `garage-link-staging`
- Production ref/domain、Stripe Live、実LINE、実顧客はdenylistで拒否する
- service-roleはmacOS Keychain `kannagi.garage-link.staging-service-role`からだけ取得し、出力・checkpoint保存しない

## Release Gate

QA開始前にrun IDと目的を発行し、次をすべて満たす。

- `preflight`が`PREFLIGHT_READY`
- cleanup readiness PASS
- fixtureを作る前にregistry登録
- canonical host、Vercel protection/bypass、Chromium/WebKit、Auth Admin API、plan capacity PASS

QA終了時は次をすべて満たす。

- `TEST_COMPLETE`後に`teardown-dry-run` PASS
- actual DB teardown commit後にだけAdmin Auth API hard-delete
- temporary bypass、storageState、checkpointを削除
- `verify-clean`がDB/Auth/session/artifact 0を確認し、runが`COMPLETE`
- QA prefix・exact ID・Storage・public text列の横断確認が0

## Commands

各commandに同じUUIDv4を渡す。fixture作成・削除を伴うrunで別run IDへ切り替えない。

```bash
pnpm qa:lifecycle preflight --run-id <uuid> --purpose <purpose>
pnpm qa:lifecycle provision --run-id <uuid> --purpose <purpose>
pnpm qa:lifecycle auth --run-id <uuid> --purpose <purpose>
pnpm qa:lifecycle run --run-id <uuid> --purpose <purpose>
pnpm qa:lifecycle teardown-dry-run --run-id <uuid> --purpose <purpose>
pnpm qa:lifecycle teardown --run-id <uuid> --purpose <purpose>
pnpm qa:lifecycle verify-clean --run-id <uuid> --purpose <purpose>
```

中断後は`status`で確認し、`resume`で最後に成功したstateの次から再開する。fixtureが存在するrunを放棄しない。失敗時は同じrunでRCA・修正・resumeし、新しいfixtureを増やさない。

既存残存fixtureを採用する場合だけ、`provision --adopt true`にexact tenant/store/membership/Auth user、expected tenant名、fixture type、markerを渡す。DB内adopt RPCが全値と依存を照合するまでregistryへ登録しない。

## Security contract

operator RPCはPUBLIC／anon／authenticatedから実行不可で、service_role callerに加えてregistry、run、tenant、expected name、marker、teardown state、transaction-local run contextを複合照合する。通常のlast-owner guardは常時有効で、未登録tenantはservice_roleでも削除できない。

## Required verification

```bash
pnpm test:qa:lifecycle
pnpm --filter @apps/garage-link test:db:fresh
pnpm --filter @apps/garage-link lint
pnpm --filter @apps/garage-link typecheck
pnpm --filter @apps/garage-link test:security
pnpm --filter @apps/garage-link build
```
# QA lifecycle — isolated staging lane

## Safety contract

QA DDL is never applied through `supabase db push` or the normal baseline manifest. The only source of truth is `supabase/qa/manifest.json`; run `node scripts/qa/check-migration-lane.mjs` before any QA-lane operation. The QA runner must first establish the actual connection identity as `gaytoojzwqkpuvfofeql`; a Production identity, a missing identity, a checksum mismatch, partial ledger, or any conflicting fixture relationship is a hard stop.

The runner requires (without defaults): `--source-sha`, `--branch`, `--vercel-team-id`, `--vercel-project-id`, `--deployment-id`, `--deployment-url`, `--supabase-project-ref`, and `--run-id`. It verifies the ready deployment's SHA, branch and staging project through the Vercel API. Credentials are supplied through the documented environment/Keychain contract only; do not read CLI authentication files or print credentials.

## Existing staging reconciliation

The four pre-separation QA migrations may already be recorded in staging. Before an isolated-lane apply, the operator must read-only compare each `supabase_migrations.schema_migrations` version and checksum to `supabase/qa/manifest.json`. Matching entries are adopted into the QA ledger without reapplying DDL; missing, partial or mismatched entries stop the run. No Production drop migration is created or executed.

## Rollback and completion

Apply QA rollbacks in reverse manifest order. The canary rollback restores the seven-function cleanup-readiness definition, including owner, `SECURITY DEFINER`, `search_path`, grants and comments; it must be checked by `to_regprocedure` before and after rollback.

Completion is ordered `DB_CLEANED → AUTH_CLEANED → STORAGE_CLEANED → ARTIFACTS_CLEANED → VERIFIED_CLEAN → COMPLETE`. Each external check must record the current run ID, target identity, timestamp and result. A missing Storage, public-text, local-artifact, provenance or zero-residual proof blocks `COMPLETE`; evidence from another run cannot be reused.
