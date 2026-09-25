# GARAGE LINK mobile V2 verification ledger (2026-09-25)

Base: `1b60f5fc9951c615a4eeb15256adae48b2b9869e`. Prototype checkpoint: `b2b25c5ad453b2968cbcd603602b1bd0b551182c`. Scope: dedicated `codex/garage-mobile-v2-ui-prototype-20260924` worktree. Shared checkout changes were not copied. Production and Production DB were not changed.

## Executed checks

- Server TypeScript and mobile TypeScript: pass.
- Server ESLint: zero errors, three warnings outside this diff. Mobile ESLint: pass.
- Server security tests: 367/367. Lifecycle tests: 66/66. Trusted-device contract: 9/9.
- Six V2 migrations applied twice in a disposable Docker PostgreSQL database; migration contract and transactional business/security contract passed. The runner rolls back fixture transactions and destroys its disposable database.
- Next production build compiled with inert QA placeholder URL/key; Expo web export passed. This is a build check, not a live Supabase/API operation.
- Browser operation at 360 and 390 px used the shipping V2 component with an in-memory API fixture: five tabs, empty state, customer create/readback, vehicle quick purchase/readback, customer-to-deal and maintenance reception. No horizontal overflow was observed. The fixture deliberately did not write live business data.
- iOS Simulator debug build succeeded. In the native UI fixture, Today/Customer navigation, keyboard, save, back, reopen and readback were operated. Android emulator debug build/install succeeded. Android UI operation was not confirmed: its GUI is not exposed by the available CUA app inventory, and the debug runtime showed a QA-entry render error. The automatic approval review rejected `adb shell input` as an alternate UI control path; no further tap/key workaround was used. Real camera was not operated.
- PR #32 patch reverse-applies cleanly to the candidate tree, proving its three-file changes are included. PR #32 itself was not merged.

## Twelve counterevidence rounds

| Round | Could be wrong if... | Counterevidence actually executed | Limit |
| --- | --- | --- | --- |
| 1. Workflow | One business step still requires Web. | Route/UI inventory includes purchase, customer, appointment, deal, trade-in, quote, sale, invoice, payment and delivery; transactional DB fixture executes that order. | Entire chain was not operated against a live mobile backend. |
| 2. Density | The app copies a desktop page. | Browser at both widths showed five bottom destinations, bounded first view and detail sections. | Long forms were not all operated. |
| 3. Taps | Quick tasks became longer than the prototype. | Fixture UI operated customer, vehicle, deal and maintenance quick paths. | Every requested tap count was not instrumented; do not label unmeasured flows pass. |
| 4. Cost | Zero, missing or large numbers break totals. | Vehicle cost and quote unit tests cover zero/invalid/large numbers; migration SQL readback covers full cost sum. | Production data variation is not represented. |
| 5. Sale | Only vehicle status changes on a failed sale. | Disposable DB transaction exercises reserve with price, replay and rollback behavior via atomic RPC. | No live API call. |
| 6. Payment | A retry records twice or overpays. | Disposable DB exercises replay, partial/full payment and overpayment denial. | No network timeout injection through the app. |
| 7. Maintenance | Full detail is required at reception. | Fixture UI saved a minimal reception; disposable DB accepted minimal job and status replay. | Full 39-tap path not natively operated. |
| 8. Store | A foreign store ID reads or updates records. | Disposable DB fixture tests cross-store vehicle read/update denial; API routes compare selected store to active membership. | Other resource route handlers were reviewed statically. |
| 9. Role | Viewer writes finances or sales. | Disposable DB tests viewer sale/invoice denial; security tests check route gates. | No real viewer account operation. |
| 10. Photos | A photo attaches to a foreign record. | Storage/API source verifies both record and store before upload, and photo list filters by store and related ID; security contract test covers the boundary. | No real camera/upload operation. |
| 11. Layout | Keyboard, back or narrow width hides controls. | Browser 360/390 fixture interaction and iOS Simulator customer keyboard/save/back/reopen performed. | Android UI, native date entry, photo picker and real camera not confirmed. |
| 12. Regression | Authentication or existing modules break. | Trusted-device contract 9/9, mobile pre-owner check, security 367/367, builds and TypeScript pass. | Full live authenticated E2E was not executed. |

## As-Is / To-Be

| Destination | Base behavior | V2 behavior | Evidence |
| --- | --- | --- | --- |
| Today | App task summary | Due and scheduled work first, finance/inventory expansion | Source and browser fixture |
| Vehicle | Basic list/detail and photo | Purchase, full cost, inventory age, categories, related work | Isolated DB, unit tests, browser fixture |
| Deal | No complete native flow | Deal, appraisal, quote, sale, invoice, payment, delivery | Isolated DB and partial browser fixture |
| Maintenance | Status centered | Minimal reception plus work/date/parts/cost/photo sections | Isolated DB and browser fixture |
| Customer | Basic lookup | Quick create, edit, related appointments/deals/history | Isolated DB, browser and iOS fixture |

Screenshots generated outside the repository: `/private/tmp/garage-v2-web-360-qa.png`, `/private/tmp/garage-v2-web-390-customer-qa.png`, `/private/tmp/garage-v2-ios-native-qa.png`. They document fixture UI only. No secret, OTP or real customer data was used for these screenshots.

## Gate interpretation

Static/build/database checks passed. Web UI fixture checks passed for the operated paths. Android UI operation, real camera and full authenticated mobile-to-server E2E remain unconfirmed. These must not be reported as PASS.

## Final candidate follow-up (2026-09-25)

An isolated Supabase stack was built from the repository's baseline manifest and the V2 migrations. A disposable staff user signed in through local Supabase Auth. Against the actual local Next route handlers and PostgREST, the following HTTP sequence saved, reopened and read back records: customer, appointment, purchase, deal, appraisal, two-line quote, sale, invoice, partial payment, payment replay, full payment, delivery, maintenance reception, cost edit, maintenance quote/invoice and completion. Purchase and invoice replay returned the original records. Overpayment returned 409. An invalid bearer returned 401, a foreign store header returned 403 for reads and writes, and a viewer could read but received 403 on write. These are HTTP/API/DB checks; the full sequence was not operated from a native app.

The same isolated stack exposed a release-blocking photo defect: the authenticated upload route stored the object, then failed to insert its metadata because `service_role` lacked `SELECT` and `INSERT` on `public.uploaded_files`. The added migration grants only those server-side privileges; `anon` and `authenticated` retain no direct insert. With the grant, vehicle and maintenance photos uploaded, retained their category, appeared in the API readback and loaded through signed URLs. A real camera and native photo picker remain unconfirmed. Security advisor reported no errors.

The four unchanged Web preview/landing type errors that also failed PR #32 staging were fixed narrowly. Local Next build and Vercel staging at the corresponding PR head passed. The full local verify command passed. An automatic GitHub verify run initially stopped at an external Docker registry rate limit; its normal retry completed successfully. Production was not changed.

Production rollout order after Owner SHA approval: apply the six V2 additive migrations in timestamp order, then `20260925013046_mobile_photo_metadata_service_grant.sql`; verify each migration and the contract query before deploying the approved SHA. Capture the pre-apply ACL for `uploaded_files`. Rollback server/mobile first, retain additive data and operation receipts, then revoke the added service privileges only if the pre-apply ACL proves they were absent. Drop new fields or operation tables only after data and callers are migrated away. No Production migration was applied during this candidate verification.

### Final eight counterevidence rounds

| Round | Failure hypothesis | Executed counterevidence | Unconfirmed limit |
| --- | --- | --- | --- |
| 1. Business chain | A step between purchase and delivery or reception and invoice is missing. | Local authenticated HTTP/API/DB sequence completed both chains with readback. | Native whole-chain operation. |
| 2. Mobile density | V2 is a scaled desktop form. | 360/390 px fixture operations showed five tabs, short create forms and bounded first view. | Every detailed form was not operated. |
| 3. Quick actions | Important tasks take more steps than the prototype. | Quick customer, purchase, deal and reception were operated in the UI fixture; route labels and transitions were reviewed. | Quote, sale, payment and delivery tap totals were not instrumented end to end. |
| 4. Financial consistency | A replay or excess payment corrupts balances. | Purchase, quote, invoice and payment replay, partial/full settlement and 409 overpayment were exercised through HTTP; SQL transactional contracts passed. | Network partition during an in-flight mobile write. |
| 5. Store and role | A substituted store or viewer can write. | Actual HTTP read/write with a foreign store header returned 403; viewer write returned 403 while viewer read worked. | Other role combinations not all operated. |
| 6. Photos | A photo loses its category or is linked elsewhere. | Initial metadata 500 was repaired; vehicle and maintenance upload/category/signed readback passed with a store-scoped route; a foreign related ID returned 403. | Native picker/camera not operated. |
| 7. Screen behavior | Narrow width, keyboard or back blocks saving. | Existing 360/390 browser fixture and iOS customer keyboard/save/back/reopen operation passed. | Android GUI and all native screens remain unconfirmed. |
| 8. Regression | Existing login or business routes fail. | Local Auth sign-in, store context, server/mobile type checks, lint, security tests, pre-owner gate and local Next build passed; Vercel staging passed. | Production and store builds were intentionally not published. |
