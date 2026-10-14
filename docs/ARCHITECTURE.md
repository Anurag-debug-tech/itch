# Architecture and trust boundaries

MilestoneGuard is a single Next.js application using React, TypeScript, Node.js 24, and a persistent SQLite database. It runs without external database, AI, payment, or storage API keys. Demo mode is explicit. All displayed financial balances are **SIMULATED FUNDS — DEMONSTRATION MODE**; no bank transfer or regulated escrow occurs.

## Components

- `src/app`: browser interface and same-origin API route handlers.
- `src/lib/db.ts`: schema migration and SQLite connection.
- `src/lib/auth.ts`: password verification and session helpers.
- `src/lib/service.ts`: server-authorized domain operations and scoped read models.
- `src/lib/seed.ts`: repeatable demo dataset.
- Private storage: uploaded evidence is served through an authorized API endpoint rather than the public directory.
- `scripts`: setup, migration, seeding, reset, and scheduled job entry points.
- `tests`: database-backed integration tests and Playwright flows.

The browser requests operations; the server independently checks identity, project membership, role, and allowed state. A hidden button is not an authorization control. Bootstrap data is scoped to the authenticated user. Administrators receive the oversight view.

## Records and invariants

Users participate in projects through client/freelancer assignments. Projects contain milestones, versioned agreements, submissions, ledger records, check-ins, disputes, recovery cases, notifications, and audit events. Money is stored as integer paise, and milestone budgets must add up to the project budget.

Work begins only after both parties accept the same immutable agreement version. Amendments create a new version, retain history, and require fresh signatures. Submission versions and hashes preserve evidence. Automated file checks supply evidence and mark subjective criteria for human review; they never approve a payout.

Funding, acceptance, and release are distinct operations. Uploads and expired review timers cannot release funds. Active disputes restrict payout. Authorized settlements constrain paid plus refunded amounts to funded amounts. Repeated requests cannot multiply the released balance.

Recovery preserves original assignments and financial obligations. Replacement work receives fresh assignments and a new agreement. A replacement does not inherit an original freelancer's funded payment entitlement. Handover access is limited to authorized completed material; unresolved submissions are not automatically transferred.

## Time and processing

Domain processing uses the server clock abstraction. Demo administrators can advance the clock and run jobs without waiting for real deadlines. Jobs detect missed check-ins, inactivity, deadlines, and overdue client reviews. Warnings describe observed events and do not declare misconduct. A review timeout escalates to an authorized decision; it never authorizes payment itself.

Run the documented jobs command from a persistent host scheduler for unattended processing. Browser timers are not the source of truth. Demo clock controls and reset operations require both demo mode and administrator authorization.

## Deployment model

SQLite and private evidence storage require persistent writable disk. Use one Node.js application instance with an attached volume and regular consistent backups. A stateless serverless deployment will lose or split data and is not suitable for this storage adapter. A hosted Postgres/object-storage adapter, distributed sessions/rate limits, migrations, and provider-specific access controls must be implemented and verified before scaling across hosts.
