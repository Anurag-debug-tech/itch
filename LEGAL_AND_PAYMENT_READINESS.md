# Legal and payment readiness — India review checklist

**DEMO MODE — NO REAL MONEY IS HELD OR TRANSFERRED.** Local INR balances are fictional ledger entries. Optional Stellar escrow uses free **Testnet** XLM only. Neither implementation demonstrates a live bank/payment-provider escrow arrangement, regulatory authorization, enforceable legal advice, or independent contract/security certification.

This document identifies questions for qualified Indian counsel, compliance specialists and prospective providers. It does not conclude that the platform complies with applicable law.

## Current implemented safeguards

Mutual versioned scope, criteria, deadlines and revision limits; separate funding, acceptance and payout; scoped evidence access; overdue review escalation without timer-triggered release; reasoned admin settlements with bounded balances; original/replacement entitlement separation; persistent request/confirmation/acknowledgement records; replay/idempotency constraints. These are technical controls, not substitutes for legal/provider approval.

## External legal-order register

Admin controls → External legal-order register stores reference, issuing authority, receipt date, private document/reference location, affected milestones, claimed outcomes and exact maximum amount. Every new record is **UNVERIFIED**. A qualified external reviewer's finding can be recorded with name, authentication basis, jurisdiction/scope assessment, actor, timestamp and attestation. `REVIEW_RECORDED` means an administrator recorded an external finding; the application has not independently verified qualifications, authenticity or jurisdiction.

There is no legal-document upload that executes funds. The register can link only an **already confirmed, separately authorized** payout/refund, constrained to the recorded project, milestones, outcome and cumulative maximum. Unique references prevent linking the same transaction twice. Linking records history and never initiates another transfer. Unverified/rejected orders cannot support execution records. Corrections require retaining history and creating a corrected record.

Fictional examples must stay labelled fictional. Production needs a real authenticity/authority process, separation of duties, secure document retention, provider/legal instructions and escalation procedures. Current local admin dispute authority is a demo role; Testnet settlements additionally require the contract's fixed resolver wallet. Ordinary contractual disputes and binding external legal orders are distinct processes. This MVP **does not implement automatic legal-order enforcement**.

## Required review before commercial launch

| Area                              | Questions / evidence required                                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider and regulatory structure | Obtain written provider approval for the precise marketplace, conditional release, refund, cancellation, dispute and settlement flows. Determine who receives/holds funds, legal roles and applicable authorization. Do not equate split settlement with escrow.                     |
| Agreements and fairness           | Counsel-approved client/freelancer/platform terms; acknowledgement evidence, scope amendments, reasonable review periods, criterion-linked revision limits, cancellation and appeals.                                                                                                |
| Disputes and orders               | Who may decide what, consent and limits of any resolver, conflicts of interest, evidence standards, review/appeal channels and external-order authentication/jurisdiction.                                                                                                           |
| Original work and replacement     | Preserve earned entitlements; authorized treatment of unfinished funds; no automatic transfer/refund; IP ownership, licensing and confidential handover permissions.                                                                                                                 |
| Privacy and AI                    | Determine applicable privacy obligations and notified commencement; notice, purpose/consent, processor contracts, lawful sharing, data-subject requests, breach response, cross-border issues and retention. AI excerpts require specific product consent and provider terms review. |
| Security and records              | Identity checks, privileged access and separation of duties, encrypted backups, retention/legal holds, deletion exceptions, evidence integrity, independent security testing and incident response.                                                                                  |
| Taxes/accounting                  | Professional review of invoicing, fees, GST/TDS or other applicable treatment, reporting, refunds and reconciliation; no tax conclusion assumed.                                                                                                                                     |
| Liability and operations          | Service descriptions, prohibited work, liability allocation, complaints, support, provider failure/chargebacks, reconciliation, insolvency/termination and continuity.                                                                                                               |

The RBI [Master Direction on Regulation of Payment Aggregators, 2025](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12896) addresses payment-aggregator regulation and related settlement/escrow requirements. A qualified reviewer must determine its applicability to the intended business structure and current amendments. The official MeitY [Digital Personal Data Protection Rules, 2025 index](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa) is a starting point to verify operative notifications; no blanket commencement or compliance claim is made here.

## Provider integration acceptance criteria

An approved provider implementation must map request IDs, verified signed webhooks, deduplication, settlement/refund references, pending/failed/confirmed states and reconciliation to the same application invariants. Verify provider signatures against raw bytes and secrets, reject replay, reconcile out-of-order events, enforce balance limits transactionally, and test uncertain/network outcomes. These are requirements for a future implementation; the current simulated adapter has no live webhook endpoint.

Use sandbox contract tests first, then a controlled approved pilot with monitored reconciliation and rollback procedures. No provider account, production approval, legal sign-off or live INR credentials have been provisioned. Mainnet, custody and public production are outside the verified hackathon scope.
