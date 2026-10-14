# MilestoneGuard live demo guide

Use fictional data only. **DEMO MODE — NO REAL MONEY IS HELD OR TRANSFERRED.** Optional Testnet XLM is separate and never means real INR escrow. Ghosting monitoring uses explainable rules, not a trained predictive model.

## Launch and starting state

```sh
npm ci
npm run setup
npm run db:migrate
npm run db:seed
npm run dev
# Second terminal: process accountability rules on the server
npm run jobs:watch
```

Open http://localhost:3000. Seeded password for all roles: `DemoPass123!`.

| Role        | Email                           |
| ----------- | ------------------------------- |
| Client      | client@milestoneguard.demo      |
| Freelancer  | freelancer@milestoneguard.demo  |
| Replacement | replacement@milestoneguard.demo |
| Admin       | admin@milestoneguard.demo       |

Use separate browser profiles/private contexts for independent sessions. Seed creates seven fictional scenarios idempotently; it does not erase an existing workspace. Current development config uses `data/blockchain-dev.sqlite` and `data/blockchain-uploads`; fresh setup uses `data/milestoneguard.sqlite` and `data/uploads`. Neither requires a database API key.

For a completely reproducible **disposable local** demo, run in a separate terminal with explicit paths (existing main storage is preserved):

```sh
DEMO_MODE=true STELLAR_TESTNET_ENABLED=false DATABASE_PATH=./data/judge-demo.sqlite UPLOAD_DIR=./data/judge-uploads APP_ORIGIN=http://localhost:3300 npm run db:reset
DEMO_MODE=true STELLAR_TESTNET_ENABLED=false DATABASE_PATH=./data/judge-demo.sqlite UPLOAD_DIR=./data/judge-uploads APP_ORIGIN=http://localhost:3300 npm run dev -- --port 3300
```

Open http://localhost:3300 for that dataset. `db:reset` is destructive to the configured demo storage. Never reset the preserved original or a database containing blockchain history; the application blocks reset with escrow history. The legal receipt date uses real calendar time; the demo clock changes workflow time only.

## A. Creation through completion

Client → New project → Website Development → choose freelancer → title and total INR budget → Continue → milestone titles/budgets/due dates/criteria (sum must match total) → optionally Suggest criteria → inspect/edit Scope Doctor proposals → Continue → review agreement → Create project.

Agreement tab → Accept agreement. In freelancer session open the same project → Agreement → Accept agreement. Client → Milestones → Fund milestone. Freelancer → Start milestone → Submit deliverable → select a nonempty permitted text file → describe work → Submit deliverable. A safe sample `.txt`:

```text
Pages: Home, About, Events, Registration, Contact.
Mobile behavior: responsive navigation and single-column forms.
Registration fields are validated against the agreed checklist.
```

Client → Submissions → Download and inspect → Milestones → Review deliverable → Accept → check review attestation → Accept deliverable → **Release simulated payment**. Acceptance alone must leave paid amount at zero. Repeat required milestones; project becomes completed only after all original/current obligations, disputes and pending operations are resolved.

Records: projects, milestones, agreement snapshots/acknowledgements, private submissions/hashes, payment intents/events, immutable ledger, audit/notifications. Expected financial result: one funding and one payout per milestone; paid+refunded never exceed funded.

## B. Empty, corrupt, irrelevant and duplicate files

During wizard milestone setup expand Objective verification rules. Add required phrase `Registration fields are validated`; optionally agree a required filename or minimum PNG/JPEG dimensions. These rules become part of the mutual agreement.

Submit a zero-byte `.txt`, malformed `.pdf`, or wrong extension: reject with explanation; no submission/ledger entry. Submit valid unrelated text: store evidence with a literal objective `FAIL`, block ordinary acceptance, and keep money protected. Client requests a revision linked to an agreed criterion. Freelancer submits a corrected file; objective pass still requires human review and separate payment. Reupload unchanged content during a permitted revision: duplicate-hash warning and a new version, never automatic acceptance. Without agreed semantic rules, valid unrelated content remains human `NEEDS_REVIEW`, not automatically rejected as structurally invalid.

Evidence: `tests/readiness-verification.test.ts`, `tests/e2e/readiness.spec.ts`. Full image decoding and basic PDF structure are supported; no universal semantic understanding or malware scanner is claimed.

## C. Freelancer inactivity and explained monitoring

Fund and start an unfinished milestone. Admin → Admin controls → Advance clock by hours `73` → Advance time → Run accountability checks. Client → project → Progress. Expect `AT_RISK`, last meaningful activity timestamp and named 72-hour inactivity rule, plus missed check-in/deadline facts where applicable. Nothing pays/refunds. Admin Monitoring policy allows validated threshold changes; signed deadlines still require mutual extension.

New accepted extension resets the activity episode and uses the newly acknowledged due date. Released work and client-review-only work do not produce freelancer inactivity warnings. These cases are regression-tested. Warnings are signals requiring contact/review, not proof of fraud.

## D–E. Client silence and disputed payment

Submit funded work and leave it unreviewed. Advance 36 hours/run jobs for a reminder, then another 37/run jobs for overdue escalation under the default 72-hour window. Expect a dispute or designated-wallet dispute prompt in Testnet, **zero payout**. Either milestone party can raise a dispute while unresolved funds remain. Client payout stays blocked.

Admin → Admin controls → Milestones with open disputes → Inspect criteria, submission versions and reviewer. Read criteria, private evidence links/hashes, both claims and missing evidence. Assign reviewer → Prepare evidence brief. Optional AI is disabled without credentials. Disputes → Record resolution → choose permitted release/refund/partial local settlement → rationale → attestation → Confirm resolution. Actor/time/outcome/rationale persist. This is demo contractual review, not a court judgment.

## F. Duplicate/concurrent payment safety

The ordinary payout button is separate and disappears once settled. For reproducible concurrency evidence run:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- tests/e2e/api-security.spec.ts
npm test -- tests/readiness-finance.test.ts
```

The HTTP test fires six simultaneous payout requests; pass means one payout ledger record with exact amount. Adapter replay returns the original intent; a different reference for the same operation is rejected. No live provider webhook exists; simulated webhook processing is deliberately unsupported. Stellar network replay/receipt reconciliation is separately tested.

## G. Recovery and original entitlements

Create two milestones ₹3,000/₹9,000. Complete, accept and release the first. Fund/start the second but leave unfinished. Advance 73 hours and run jobs. Client → Progress → Record intervention with reason → Recovery → Initiate recovery. Inspect authorized handover: scope, accepted file/version/hash, outstanding criteria and restrictions; private unaccepted drafts must not be included.

Unfinished funding stays with the original engagement until a reasoned authorized settlement. Raise a dispute on that milestone and ask admin to resolve explicitly; the first ₹3,000 payout must remain unchanged. Client → Recovery → Invite replacement → choose registered replacement → Confirm. Fresh milestone IDs start unfunded and require a new agreement signed by client and replacement. Fund separately, resume work, submit/review/pay. Original and replacement amounts remain distinct. If replacement finishes before the original obligation is settled, the completion gate must keep the project open (database-backed regression test).

Evidence: browser recovery journey plus `readiness-finance.test.ts` and live Testnet replacement receipts. No automatic refund, transfer or replacement search occurs.

## H–I. Timeline, acknowledgement and permissions

Project → Payments shows actual REQUESTED/CONFIRMED stages. Freelancer can Acknowledge funding and Acknowledge payout; client acknowledges a confirmed refund. This is a receipt confirmation, not a transfer or a prerequisite to adapter confirmation. Reload to prove persistence. Historical entries lacking request timestamps are explicitly identified rather than invented.

Use replacement/outsider account to request another engagement's private evidence or mutation: expect 403; signed-out access expects 401. Public registration cannot choose admin. These are exercised through direct HTTP tests as well as separate UI role sessions.

## J. AI with and without credentials

Default: no external credential needed. Suggest criteria returns editable rule-based deliverables/criteria, ambiguities, missing requirements and milestone suggestions. Evidence briefs summarize recorded facts/missing evidence using rules. Uploads never trigger payments.

Optional direct OpenAI: owner supplies `OPENAI_API_KEY` and an available explicit `OPENAI_MODEL` in private `.env.local`, restart server. Optional gateway uses `AI_GATEWAY_API_KEY` + `AI_MODEL`. No default paid model is selected. To permit text assistance, also set `AI_ALLOW_EVIDENCE_TEXT=true`; uploader must explicitly check consent. Only UTF-8 text excerpt up to 8,000 characters is shared, never arbitrary raw private files. Model output is schema validated, exact quotes/reference IDs checked, timeouts/errors fall back to rules. `store:false` requests no response storage; it does not promise zero retention under all provider policies.

Live credential success is **not verified in this environment**. Tests mock provider success, malformed/instructional output, nonexistent evidence, and failure; do not present these as a live OpenAI demonstration. See official [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [data controls](https://developers.openai.com/api/docs/guides/your-data).

## K–M. Admin visibility, persistence and fictional legal records

K: Admin controls displays open disputed milestones inline, with versions, claims, blocking status and assignment. Resolutions record human rationale/time/actor. No model settles liability.

L: Reload after a payment/check-in to confirm persisted state. Restart the server using the same configured SQLite/file paths and repeat login/read. Audit → Load older activity uses scoped cursor pagination. There is no Supabase connection or hosted storage configured.

M: Admin → External legal-order register → Record an external order. Use a fictional reference/authority/private location, today's receipt date, project/milestone, claimed scope/outcomes/maximum and retain Fictional hackathon example. Save unverified order: money must stay unchanged. Record fictional external-review findings with authentication basis/jurisdiction/scope and attestation, clearly labelled test data. Independently resolve the contractual demo dispute, then link its existing confirmed settlement. Link again: one execution record, no extra ledger transfer. A client cannot access admin recording APIs. This demonstrates recordkeeping only; no legal authenticity or real qualified review is established.

## Reproduce the verification

```sh
npm run typecheck
npm run lint
npm test
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
npm run build
PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_SERVER_MODE=production npm run test:e2e
npm run test:contract
# Optional live Testnet, disposable fixture accounts, retained isolated storage:
RUN_STELLAR_TESTNET_TESTS=1 PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_SERVER_MODE=production npm run test:stellar:browser
npm run test:stellar:smoke
```

Use `npx playwright install chromium` and omit `PLAYWRIGHT_CHANNEL` if Chrome is unavailable. Local browser tests use isolated storage on port 3100; Testnet browser tests use port 3200. Scope/default credentials are intentionally fictional; do not expose them publicly.

The full result matrix, failures fixed and remaining blockers are in [verification](docs/VERIFICATION.md), [audit](AUDIT_REPORT.md), [MVP status](MVP_STATUS.md) and [legal readiness](LEGAL_AND_PAYMENT_READINESS.md). Actual Freighter popup signing remains unverified; the automated Testnet browser uses an explicitly labelled signing transport fixture with real network execution.
