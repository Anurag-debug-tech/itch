# MilestoneGuard user and presentation guide

MilestoneGuard helps clients and freelancers finish projects through clear agreements, evidence-based reviews, controlled payments, early risk warnings and project recovery.

## The problem and our approach

A client hires a freelancer, work begins, communication stops and the client is left with unfinished work and uncertain payments. Freelancers also face delayed reviews, changed requirements and unsupported refusals to pay. MilestoneGuard connects the agreement, evidence, review, financial history and recovery process so both parties have an accountable path forward.

| Problem                       | Implemented response                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| Vague requirements            | Agreed scope, deliverables, acceptance criteria and editable Scope Doctor suggestions      |
| Changed expectations          | Versioned amendments requiring fresh acknowledgement from both parties                     |
| Missed updates or deadlines   | Configurable server rules with activity timestamps and explained warnings                  |
| Client silence                | Reminders and escalation without timer-triggered payment                                   |
| Unsupported completion claims | Private evidence, practical file/objective checks and separate human review                |
| Disagreement                  | Payment blocking, both parties' claims, evidence versions and authorized reasoned outcomes |
| Failed engagement             | Accepted-only handover, preserved original obligations and a fresh replacement agreement   |

## Approximately two-minute pitch

> Imagine hiring a freelancer to build your website. You agree on a price, work begins, and halfway through the project, communication stops. You are left with unfinished work, uncertain payments, and no clear recovery process.
>
> Freelancers face the opposite problem too: they deliver work, but clients delay reviews, change requirements, or refuse payment.
>
> MilestoneGuard addresses both sides of this trust problem.
>
> The client divides a project into milestones with budgets, deadlines, deliverables, and acceptance criteria. Both parties acknowledge the same agreement before work begins. Changes require fresh approval from both sides.
>
> The freelancer submits private, versioned evidence. The application checks file validity and agreed objective requirements, while the client reviews the actual quality. Uploading a file never automatically releases payment.
>
> If communication stops, configurable monitoring identifies missed updates and deadlines, explaining exactly why the project needs attention. These warnings trigger human intervention rather than accusations or automatic financial decisions.
>
> If a dispute occurs, payment stays blocked while an authorized reviewer examines the agreement, evidence, and both parties' statements.
>
> If the project needs recovery, accepted work and original payment history are preserved. A replacement freelancer receives a new agreement and separate payment entitlement.
>
> Optional AI helps clarify vague scope and summarize evidence; humans retain contractual and financial authority.
>
> Our current application demonstrates simulated INR payments and a deployed Stellar Testnet escrow integration. Real-money payments require further provider and legal approval.
>
> MilestoneGuard connects agreement, evidence, accountability, payment, and recovery throughout the project lifecycle.

## Complete working flow

1. **Create and invite.** The client selects a registered freelancer and enters project scope, total budget, dates and milestones. Milestone budgets must match the total. Scope Doctor proposes editable requirements; suggestions alone never alter an acknowledged agreement.
2. **Agree.** Client and freelancer separately acknowledge the same version. Work requires an active mutual agreement. Amendments retain history and require both parties' fresh approval.
3. **Fund.** Local INR is recorded by the simulated adapter. Testnet funding requires wallet authorization and confirmed contract execution. Request and confirmation are different facts.
4. **Track work.** The freelancer starts funded work and posts updates. Defaults include attention after 48 inactive hours and escalation after 72 when actionable work remains. Agreed extensions and completed-work exclusions prevent inappropriate warnings.
5. **Submit evidence.** Private file versions and hashes persist. Empty, unsupported and corrupt supported files are rejected. Agreed text, filename or image-dimension checks are explained; passing them does not prove overall quality. Subjective/unsupported properties require review.
6. **Review or revise.** The client inspects evidence, accepts, requests a criterion-linked bounded revision or raises a dispute. An agreed objective failure blocks ordinary acceptance. Uploading never pays automatically.
7. **Authorize and confirm payment.** Acceptance and payout are separate actions. Funding, state and dispute checks apply; the adapter must confirm the outcome. Unique references and transactional checks prevent repeated requests from duplicating payout. Recipient acknowledgement records receipt without transferring again.
8. **Resolve disagreement.** Open disputes block ordinary payout. The reviewer sees criteria, versions, claims and verification facts. Outcomes record actor, time and rationale. Local simulation supports partial settlement; current on-chain settlement supports full release or refund.
9. **Recover.** Earned payments remain preserved. Unfinished original funding requires a separately authorized settlement. Handover includes accepted, authorized material. A replacement receives new milestone IDs, an agreement and separate funding; no automatic replacement search or old-fund transfer occurs.
10. **Complete.** Current milestones, original financial obligations, disputes and pending agreements/payments must be resolved. The system cannot prematurely complete a project because replacement work alone is finished.

## Demo access and roles

Open http://localhost:3000. Use separate browser profiles/private contexts for independent roles. All fictional accounts use **`DemoPass123!`**.

| Role        | Email                           | Demonstrate                                                                   |
| ----------- | ------------------------------- | ----------------------------------------------------------------------------- |
| Client      | client@milestoneguard.demo      | Scope, funding, review, disputes and replacement invitation                   |
| Freelancer  | freelancer@milestoneguard.demo  | Agreement, progress, private evidence, revisions and receipt acknowledgements |
| Replacement | replacement@milestoneguard.demo | Fresh agreement, authorized handover and separate entitlement                 |
| Admin       | admin@milestoneguard.demo       | Explainable monitoring, demo clock, evidence review and reasoned settlement   |

## Practical presentation story

Use a simulated ₹12,000 website project with a ₹3,000 design milestone and a ₹9,000 implementation milestone.

| Action                                           | Explain to judges                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Create scope and approve from both accounts      | Both parties acknowledge what completion means before work starts.            |
| Fund, submit, review and release design          | Submission, acceptance and confirmed payment are separate steps.              |
| Fund unfinished implementation                   | The original freelancer's earned design payment remains recorded.             |
| Admin advances 73 hours and runs checks          | The demo clock shows an explained risk warning without waiting three days.    |
| Client records intervention and starts recovery  | The warning leads to a controlled human recovery process.                     |
| Reviewer settles unfinished original funding     | Recovery alone does not refund or transfer someone's entitlement.             |
| Invite replacement and acknowledge new agreement | Replacement work has fresh obligations and separate funding.                  |
| Complete and separately pay replacement work     | The project finishes with original and replacement engagements accounted for. |

Show an invalid upload and an objective failure if time permits. Explain that valid but unrelated work is not automatically understood by the application: agreed objective checks and human review remain essential. Detailed starting states, exact clicks, records and pass/fail criteria: [DEMO_GUIDE.md](DEMO_GUIDE.md).

## Accurate wording for technical questions

- **AI:** Optional assistance drafts scope and summarizes evidence. The core works without a key. Live provider output remains unverified; it never controls liability or money.
- **Ghosting:** Explainable configurable rules, not a trained prediction model or proof of fraud.
- **Blockchain:** A deployed Soroban contract on Stellar Testnet enforces the demonstrated escrow rules. Private deliverable files remain off-chain. Actual Freighter popup signing remains unverified; automated tests use a labelled transport fixture with real network execution.
- **Money:** Local INR is simulated and Testnet XLM is test currency. No live regulated escrow or mainnet integration is claimed.
- **Replacement:** Registered-user invitation; automatic skills matching and a verified rescue pool are future scope.
- **Legal orders:** Admin recordkeeping for external findings and existing confirmed settlements. A document claiming legal authority does not initiate payment.
- **Stack:** Next.js/TypeScript interface and API, SQLite records, private local evidence, server jobs and a separate Soroban Testnet adapter. Supabase is not implemented.

Recorded readiness evidence: 78 unit/integration tests, 28 contract tests, eight production local browser tests and two Testnet browser checks passed; the final live CLI regression confirmed 17 transactions. These results support the tested MVP, not a claim of perfect software or public production/legal readiness. Full evidence: [VERIFICATION.md](docs/VERIFICATION.md). Rehearse [26 judge questions and answers](JUDGE_QA.md); review [MVP limitations](MVP_STATUS.md) and [legal/payment readiness](LEGAL_AND_PAYMENT_READINESS.md).
