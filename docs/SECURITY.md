# Security and operational checklist

## Application boundaries

- All sensitive reads and mutations require a server-validated authenticated session.
- Project membership and actor roles are checked on the server, including direct API requests.
- Self-registration cannot create an administrator.
- Passwords are hashed; raw passwords and session tokens are not application evidence.
- Cookie sessions use HTTP-only settings and same-site restrictions. Deployment must use HTTPS.
- Unsafe cross-origin writes are rejected. File downloads still require authorization.
- Uploaded content is kept outside `public`, uses generated storage names, and is never executed.
- Upload size, extensions, and detected content are constrained by the agreement and server.
- Financial actions are transactional and preserve an append-only ledger and audit history.
- Demo controls require explicit demo mode and an administrator; demo data uses only fictional identities.

## Before exposing a deployment

1. Use HTTPS through a trusted reverse proxy and set the documented application origin.
2. Keep the database and upload directories outside static hosting and restrict filesystem permissions.
3. Remove public demo credentials and disable demo controls for any non-demo environment.
4. Test database and evidence backup restoration together; exclude secrets and private evidence from Git.
5. Configure job scheduling and alerting, verify failed jobs, and define retention/deletion policies.
6. Add malware scanning and robust archive/media inspection before accepting untrusted public uploads at scale.
7. Add distributed abuse controls, account verification, recovery, and session lifecycle management before broad public access.
8. Perform an independent security review, concurrency/load testing, and legal review before handling real commercial contracts or funds.

## Explicit limitations

Optional Stellar Testnet mode uses fixed on-chain participants, signed session/origin-bound wallet challenges, exact XLM units and confirmed-state reconciliation. Only the fixed resolver wallet can settle a dispute; application administration does not grant that key. No private user signing keys are stored. See [the wallet and transaction trust boundaries](BLOCKCHAIN.md). Actual Freighter popup signing remains an unverified external setup step; no independent smart-contract audit has been performed.

This is a local hackathon implementation, not a claim of production readiness. Simulated balances are neither custodial assets nor escrow. The default Scope Doctor uses rules; optional configured OpenAI/gateway assistance is advisory and has no financial tools. Subjective acceptance remains a human decision. Inactivity warnings are explainable signals, not fraud findings or automatic reputation penalties.

No hosted Supabase adapter, live payment provider, email delivery, malware scanner, or production identity verification is provisioned. API keys cannot be fabricated: adding those services requires a real provider account and appropriately scoped credentials. This application's local database requires no database API key.

## Readiness additions

Objective rules are mutually snapshotted. Full PNG/JPEG decoding and an isolated bounded PDF worker improve validity checks; they are not malware certification. Text excerpt sharing requires server enablement and explicit uploader consent. Provider outputs require schema validation plus actual substring/reference checks, but still require human review.

Payment events and receipt acknowledgements are persistent and idempotent; acknowledgement never authorizes another transfer. The shared completion gate checks archived obligations as well as current work. The legal-order register records external findings and links existing confirmed settlements only; no document grants payment authority. See [readiness boundaries](../LEGAL_AND_PAYMENT_READINESS.md).
