# MilestoneGuard

**Verify the work. Protect the payment. Finish the project.**

A full-stack freelancer accountability demonstration with versioned mutual agreements, private deliverable evidence, human review, simulated payment protection, risk monitoring, disputes, and project recovery. Data persists in SQLite and private local files. Optional Stellar Soroban Testnet escrow adds wallet-authorized XLM funding, payouts and resolver settlements to the existing application. No external API key or provider account is needed for the local INR demo.

**NO REAL MONEY.** `LOCAL_DEMO` uses simulated INR. Explicitly selected `STELLAR_TESTNET` projects transfer free Testnet XLM through the deployed escrow contract. The two modes have separate accounting; no mainnet or live INR service is provided. Scope suggestions use rules unless an optional AI provider is explicitly configured. Acceptance and financial decisions remain with authorized humans.

## Verified status

The readiness pass adds structural/objective evidence checks, payment receipts and timelines, configurable risk rules, admin dispute review, optional direct OpenAI and a non-executing legal-order register. **78 Vitest tests and 28 Soroban tests pass**; production browser results and precise external limits are in [verification](docs/VERIFICATION.md). No percentage or public production-readiness claim is made. Real Freighter popup signing and live AI with owner credentials remain unverified.

Start with the [complete A–M demonstration](DEMO_GUIDE.md), [MVP status](MVP_STATUS.md), [architecture](ARCHITECTURE.md), [audit](AUDIT_REPORT.md), [legal/payment readiness](LEGAL_AND_PAYMENT_READINESS.md) and [26 judge answers](JUDGE_QA.md).

The Testnet contract is `CDQODC2CCYGKCUKTXXN24BQK4GMKJLUK4QQOWKJP2POD5W3B5NDC27ID`. [View deployment](https://stellar.expert/explorer/testnet/tx/142e2bcf4471b33426772824168efecd615c7813949635879e8e16e5b61bb16f). Public network/asset/version details and transaction proof are in `deployments/`.

## Run locally

Requires **Node.js 24.8 or newer** and npm. Node 24 supplies the built-in SQLite runtime used by this application.

```sh
npm ci
npm run setup
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `setup` creates `.env.local` once with random local secrets and private filesystem permissions. Existing configuration is preserved. It does not create a cloud database or live payment account. Keep `.env.local`, `data/`, and uploaded files out of source control.

To configure manually, copy `.env.example` to `.env.local`, explicitly enable `DEMO_MODE=true`, and set the database, upload directory, and origin. The database requires an explicit demo or Testnet flag; it never silently enables either. For Testnet, follow [the separate-storage configuration](docs/BLOCKCHAIN.md). On the current development machine that configuration is already present, and the original database/uploads remain preserved.

## Demo access

All four local demo accounts use the password **`DemoPass123!`**.

| Role                   | Email                             |
| ---------------------- | --------------------------------- |
| Client                 | `client@milestoneguard.demo`      |
| Freelancer             | `freelancer@milestoneguard.demo`  |
| Replacement freelancer | `replacement@milestoneguard.demo` |
| Administrator          | `admin@milestoneguard.demo`       |

Sign out and sign in with another account to switch roles. Use separate browser profiles or private windows to keep multiple roles open simultaneously. These credentials belong only to the fictional local dataset.

```sh
# Destructive only to this configured local demo database and demo records:
npm run db:reset

# Process reminders and risk/review escalation immediately:
npm run jobs

# Or keep the background processor running in a second terminal:
npm run jobs:watch
```

The administrator can also use the demo clock and job controls in the interface. A timer never releases money on its own. Reset is blocked whenever escrow history exists; Testnet state survives a local reset and must be preserved/reconciled.

## Validate

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
# Verify the same E2E suite against the optimized server:
PLAYWRIGHT_SERVER_MODE=production npm run test:e2e
# Start the optimized app on port 3000:
npm start
```

Vitest uses a disposable database for domain and security integration tests. Playwright starts a separate server on port 3100, resets only its isolated test database, and uses `data/e2e.sqlite` plus `data/e2e-uploads`; it does not reset the main demo database. If browser installation requires network access, install Chromium before running E2E tests. Tests exercise simulated transactions only. See [verification notes](docs/VERIFICATION.md) for the checks actually executed and their scope.

If Google Chrome is already installed, run `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` instead of downloading a browser. For production verification use `PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_SERVER_MODE=production npm run test:e2e` after building. Port 3100 must be free. Inspect the latest browser report with `npx playwright show-report`.

The optional blockchain checks are `npm run test:contract`, `npm run test:stellar:smoke`, and `RUN_STELLAR_TESTNET_TESTS=1 PLAYWRIGHT_CHANNEL=chrome npm run test:stellar:browser`. The latter two contact Testnet with disposable fixture accounts and create fresh retained storage. The browser suite uses port 3200 and clearly identifies its Freighter transport test double. See [blockchain verification details](docs/BLOCKCHAIN.md).

## Structure

| Path           | Purpose                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `src/app/`     | Responsive interface and API routes                                                               |
| `src/lib/`     | Authentication, database, authorization, workflow services, verification, payment and AI adapters |
| `migrations/`  | SQLite schema and integrity constraints                                                           |
| `scripts/`     | Setup, migrations, deterministic seeding, reset, scheduled processing                             |
| `tests/`       | Workflow/security integration tests and Playwright E2E coverage                                   |
| `data/`        | Ignored persistent database and private evidence                                                  |
| `docs/`        | Architecture, security, deployment, demonstration, and verification                               |
| `contracts/`   | Pinned Rust Soroban escrow and security/lifecycle tests                                           |
| `deployments/` | Public Testnet deployment configuration and confirmed transaction proof                           |

Read the [full demo guide](DEMO_GUIDE.md), [architecture](ARCHITECTURE.md), [security checklist](docs/SECURITY.md), and [deployment guide](docs/DEPLOYMENT.md).

## Boundaries

This implementation is designed for a hackathon demonstration. Actual Freighter wallet setup remains required. On-chain settlements support full release or full refund; split settlements remain local-demo-only. Multisig/smart wallets, a historical indexer and automated archived-state restoration are outside scope. It has no mainnet/live INR payments, Supabase adapter, production identity verification, external email delivery, or malware scanning service. It must run on a persistent Node host with a writable volume; stateless serverless hosting does not fit the local storage adapter. No production-readiness or independent contract-audit claim is made.

## Optional AI

No key is needed for the complete rule-based workflow. For direct OpenAI, set private `OPENAI_API_KEY` and explicit `OPENAI_MODEL`; for the existing gateway set `AI_GATEWAY_API_KEY` and `AI_MODEL`. Restart the server. No paid model is chosen automatically. Scope Doctor proposals remain editable and disputes remain human decisions. Evidence text sharing additionally requires `AI_ALLOW_EVIDENCE_TEXT=true` and the uploader's consent; only a supported text excerpt up to 8,000 characters is selected. Metadata/claims may be shared when optional assistance is configured. Timeouts, invalid outputs and unsupported evidence fall back to rules. Provider tests are mocked; live API success is not claimed. See [privacy and provider controls](LEGAL_AND_PAYMENT_READINESS.md).
