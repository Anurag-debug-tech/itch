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

This is a local hackathon implementation, not a claim of production readiness. Simulated balances are neither custodial assets nor escrow. The rule-based Scope Doctor is not an LLM. Subjective acceptance remains a human decision. Inactivity warnings are explainable signals, not fraud findings or automatic reputation penalties.

No hosted Supabase adapter, live payment provider, email delivery, malware scanner, or production identity verification is provisioned. API keys cannot be fabricated: adding those services requires a real provider account and appropriately scoped credentials. This application's local database requires no database API key.
