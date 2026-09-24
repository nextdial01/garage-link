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
