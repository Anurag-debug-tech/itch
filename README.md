# MilestoneGuard

**Verify the work. Protect the payment. Finish the project.**

A full-stack freelancer accountability demonstration with versioned mutual agreements, private deliverable evidence, human review, simulated payment protection, risk monitoring, disputes, and project recovery. Data persists in SQLite and private local files. No external API key or provider account is needed to run the local demo.

**SIMULATED FUNDS — DEMONSTRATION MODE.** The application never transfers real money and does not offer regulated escrow. Scope suggestions use rules unless an optional AI provider is explicitly configured. Acceptance and financial decisions remain with authorized humans.

## Verified status

The local hackathon workflows are complete. On 14 October 2026, TypeScript, ESLint (zero warnings), 25 Vitest tests, six Playwright tests on development and production servers, and the optimized build passed. Browser coverage includes all four roles, simulated payments, ghosting/recovery, disputes, revisions/amendments, private downloads, registration, settings, notifications, and reset. See [actual test results and limitations](docs/VERIFICATION.md) and [build progress](BUILD_PROGRESS.md).

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

To configure manually, copy `.env.example` to `.env.local`, explicitly enable `DEMO_MODE=true`, and set the database, upload directory, and origin. Startup refuses the local adapter when demo mode is disabled; it never silently enables demo behavior in production.

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

The administrator can also use the demo clock and job controls in the interface. A timer never releases money on its own.

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

## Structure

| Path          | Purpose                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `src/app/`    | Responsive interface and API routes                                                               |
| `src/lib/`    | Authentication, database, authorization, workflow services, verification, payment and AI adapters |
| `migrations/` | SQLite schema and integrity constraints                                                           |
| `scripts/`    | Setup, migrations, deterministic seeding, reset, scheduled processing                             |
| `tests/`      | Workflow/security integration tests and Playwright E2E coverage                                   |
| `data/`       | Ignored persistent database and private evidence                                                  |
| `docs/`       | Architecture, security, deployment, demonstration, and verification                               |

Read the [four-scenario demo guide](docs/DEMO.md), [architecture](docs/ARCHITECTURE.md), [security checklist](docs/SECURITY.md), and [deployment guide](docs/DEPLOYMENT.md).

## Boundaries

This implementation is designed for a reliable hackathon demonstration. It has no live payment processing, Supabase adapter, production identity verification, external email delivery, or malware scanning service. It must run on a persistent Node host with a writable volume; stateless serverless hosting does not fit the local storage adapter. A production launch requires provider integrations, access-control review, operations, and legal assessment. No production-readiness claim is made.
