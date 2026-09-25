# Overhaul DB implementation result

Classification: CODEX_ONLY (schema, RLS, migration, accounting snapshot guard). No local LLM was assigned these risk-sensitive files. No commit, stage, push, Production, remote DB, or GitHub Actions operation.

Changed product files:

- apps/garage-link/supabase/migrations/20260925171308_garage_business_master_and_document_contract.sql
- apps/garage-link/supabase/tests/overhaul_legacy_fixture.sql
- apps/garage-link/supabase/tests/overhaul_business_contract.sql

Candidate hashes: overhaul-db-candidate.sha256. Baseline HEAD: 8893ebb8ce131b22aed0e87ee8ad3f5596410048.

## Implemented

Store-scoped generic masters with six approved kinds, owner/admin insert/update and eligible active-store member reads, immutable scope, no authenticated/service-role physical deletion grant, exact legacy maker/category seed. No vehicle or part legacy strings rewritten. Stores without legacy labels receive no rows.

Nullable vehicle liability date, store included/excluded mode default included, nullable historical document mode snapshots, maintenance JSON work_details/version alongside unchanged work_items, nullable unit/note/tax_category on document lines. No customer NOT NULL constraint.

Integer stock/threshold/reorder/minimum fields, maintenance part quantity, and movement delta widened to numeric(15,3). Existing unconstrained numeric quote/invoice quantities are not narrowed. New decimal adjust RPC retains latest owner/admin authorization and row locks; old integer public signature delegates to it, preserving already fractional stock. Invoice stock private implementations now retain decimals in sums, JSON snapshots and returns; public authorization wrappers remain unchanged. Stable part locking order used. Invalid fractional stock quantities beyond three decimals and non-finite/negative invoice part quantities are rejected.

Invoice and committed sale quote snapshot guards now protect tax_display_mode without weakening existing amount/status checks. Historical SQL files and baseline manifest were not changed. Monetary calculations were deliberately left for parent integration.

## Actual DB tests

Both final runs exited 0 against newly created network-none Docker containers using Supabase postgres 17.6.1.136, with cleanup on EXIT:

- overhaul-db.log: baseline -> synthetic legacy records -> migration -> reapply -> contract assertions.
- overhaul-db-fresh.log: baseline empty business DB -> migration -> fixtures -> reapply -> contract assertions.

Assertions passed for legacy NULL birthday/string/work-array preservation, zero masters for empty store, seeded masters, owner create/edit/disable/order, staff read/write denial, other-tenant read/write denial, immutable scope, denied physical delete, 10-1.5=8.5, integer compatibility retaining 9.5, fractional return to 10, invoice confirm/cancel repeated idempotently, liability date, comma-containing structured work, store mode switch leaving old quote snapshot NULL, issued invoice tax-mode edit rejection.

Initial test failure was fixture setup: owner had multiple eligible stores and no active selection, so RLS correctly rejected writes. Added explicit synthetic membership assignments/preferences, not a permission bypass. A separate initial scope-unchanged code review confirmed no older quantity precision was narrowed.

Safe application rollback leaves additive columns and decimal data intact; do not revert populated numeric columns to integer. No destructive rollback SQL provided.

## Remaining integration

The dedicated browser runtime was subsequently updated with the business migration and the inline RPC described below. Logs: runtime/overhaul-apply.log and runtime/inline-apply.log. SQL tests do not substitute for app/mobile full-route interaction or calculated totals. No whole-product PASS claim is made.

## Follow-up: discount input snapshot and atomic inline save

Added nullable discount_input_amount numeric to quotes, invoices and maintenance_jobs, and protected it in existing invoice/sale-quote snapshot guards.

Created via Supabase CLI: migrations/20260925172207_garage_maintenance_inline_atomic.sql. Added tests/overhaul_inline_contract.sql. The RPC save_maintenance_with_links is SECURITY INVOKER and checks current_user_can_write_store. Strict allowed-key validation excludes id/store/tenant/actor and workflow control columns; typed jsonb_populate_record populates only explicit business fields. Absent fields preserve defaults/current values. New customer requires name/birth date; new vehicle requires VIN/model and an active same-store maker. Existing links require same-store, non-deleted records. Work detail structure and numeric ranges are validated. SQL exceptions propagate and roll back all inserts.

overhaul-inline-db.log records final fresh application plus business and inline contract PASS. Successful new linked records, partial update, comma description, missing birthday rejection, prohibited keys, other-tenant links, viewer access and malformed details were tested. Deliberate final job-number collision and invalid maker each left zero orphan records. Future-date rejection exists in code; no separate future-date assertion was executed. Both migrations notify PostgREST to reload schema. All candidate hashes were refreshed.

The browser database contains the newly applied RPC and has received the schema reload notification. It remains running for parent integration. No tests/assertions wrote into browser fixtures: the mutation contract tests ran only in disposable network-none containers.
