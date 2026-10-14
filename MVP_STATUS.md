# MilestoneGuard MVP status

14 October 2026. Scope: a persistent local hackathon application plus optional Stellar Testnet escrow. This is not a public production, legal-compliance or real-money release. [Audit](AUDIT_REPORT.md), [executed results](docs/VERIFICATION.md), [demo steps](DEMO_GUIDE.md).

## Implemented and tested

- Client/freelancer registration/login, opaque cookie sessions, server-enforced roles and project/file access. Public registration cannot grant admin; role/CSRF/IDOR checks exist in domain and HTTP tests.
- Invitation-based projects, balanced milestone budgets/dates, acceptance criteria and objective rules, separate acknowledgements of immutable agreement versions, mutually approved amendments.
- Persistent simulated INR funding/payout/refund request and confirmation events, exact integer units, unique references and transactional ledger updates. Separate recipient payment acknowledgements never move funds. Six concurrent HTTP payouts must produce one ledger entry.
- Nonempty/type/size/hash checks and private versioned files; bounded PNG/JPEG decoding and basic PDF parsing; agreed filename/literal text/minimum dimensions; objective failures block ordinary acceptance. Subjective/unsupported checks remain human review. Eight verification tests cover empty/corrupt/spoofed/irrelevant/duplicate/pass/fail cases.
- Criterion-linked bounded revisions, separate human acceptance/payment, blocked disputes and reasoned authorized local partial settlements. Admin sees open disputes, both claims, criteria, submission versions, checks/hashes, reviewer assignment and evidence briefs.
- Configurable server-side inactivity/check-in/deadline/withdrawal rules, timestamped reasons, canonical risk states and deterministic demo clock. Tests exclude released work and acknowledge approved extensions. Client silence escalates without paying on a timer; episode keys prevent repeated reminders for unchanged facts.
- Recovery accepted-version handover, original financial preservation, fresh replacement invitations/agreement/entitlements and shared completion checks across original/current obligations. Finance regression verifies replacement payment cannot prematurely complete a project with unsettled original funding.
- In-app notifications, accountability counts from actual records, scoped cursor-paginated audit history and additive domain/history indexes. No fabricated ratings, predictive model or replacement guarantee.
- Optional direct OpenAI or AI Gateway with schema validation, timeout/failure fallback, editable Scope Doctor proposals, quote/reference-grounded advisory output and explicit consent for selected text excerpts. Offline/mock tests verify behavior; no financial tools exist.
- Admin-only legal-order **recordkeeping**: initially unverified, named external findings with scope/authentication assessment, actor/time, and unique links to existing confirmed settlements. Scope/amount/auth tests verify records cannot create or duplicate payment.
- Versioned SQLite migrations, private disk, repeatable seed/reset, isolated tests and backup. Optional deployed Soroban escrow retains fixed participants, wallet proofs, exact XLM, confirmed reconciliation and replacement isolation; contract and recorded network tests cover those invariants.

## Implemented but unverified or incomplete

- Real Freighter popup connection/approval: extension was absent in the inspected Chrome profile. Automated browser signing uses an explicit transport fixture with real application/network/contract execution; it does not prove real extension UX.
- Live OpenAI provider output with owner credentials: no configured-key success run. Success/malformed/error cases are mocked; rule fallback is executed. AI summaries and quote checks remain advisory and can still be wrong.
- Legal findings are recorded by an admin, not independently authenticated by software. No automatic legal-order execution, genuine counsel sign-off, provider approval or regulatory determination exists.
- Runtime/security verification is local Chrome and Node, not multi-browser accessibility certification, hostile parser fuzzing, independent audit, high-load/multi-host operations or full disaster-recovery certification. SQLite writes serialize and some read models remain unbounded.
- ZIP/PPTX/MP4 only have signature/size checks. No malware scanning, comprehensive archive analysis, arbitrary file semantic verification or plagiarism/authorship proof.

## Not implemented / future scope

Live INR/mainnet/provider escrow, signed provider webhook adapter, on-chain split settlements, multisig/smart wallets, a historical blockchain indexer/automatic archived-state restoration, Supabase/PostgreSQL/private object storage, production KYC/account recovery/email verification, external email/SMS, verified skills/portfolio/ratings directory, automated skills matching/rescue pool, trained/evaluated risk prediction and public production deployment.

## Practical roadmap

1. Controlled fictional-data pilot; restore-test database+files, monitor jobs/reconciliation, improve support/error observability and complete real wallet UI verification.
2. Qualified legal/privacy/tax review and written provider approval for the exact conditional settlement model; approved sandbox integration with raw-signature verification/deduplication/out-of-order reconciliation and operational responsibilities.
3. Harden identity/account recovery/abuse controls, independent security review, scanning, retention/deletion and consent processes; test accessibility and browser coverage.
4. Migrate explicitly to managed PostgreSQL/private object storage, benchmark indexes/read models and add bounded pagination throughout; durable outbox/queues/workers when justified.
5. Strengthen format-specific evidence verification and build a consented verified skills dataset before matching. Evaluate any future predictive model on appropriate real outcomes, including false positives/fairness; do not relabel today's rules as AI prediction.

No percentage is used: external approvals and unverified integrations cannot honestly be folded into a claim of “100% production complete.” The feasible local MVP is judged by executed workflows and the stated boundaries.
