# Pitch alignment review

Reviewed on 14 October 2026 (Asia/Kolkata).

Source: the supplied eight-slide `MilestoneGuard_Hackathon_Pitch_Deck (2).pptx`. This review inspected the slide XML, rendered slide previews (including text embedded in images), application source, the original project brief, and the existing verification record. The original presentation and application code were not modified. Tests were not rerun for this content review; test counts below refer to the recorded verification on 14 October 2026 and the retained passing Playwright result.

## Assessment

The problem, mutual agreements, milestone review, simulated payment protection, risk monitoring, disputes, and project recovery match the implemented application. The pitch is a good account of the product concept. Its implementation evidence is outdated: four slides need substantive updates (4, 5, 7, and 8). A percentage would imply more precision than this qualitative review supports.

The application does not need Supabase or new features to support this pitch. The original brief explicitly permits persistent SQLite, local authentication, and private local storage when external services are unavailable. Present the implemented local demo and place hosted services on the roadmap.

## Slide-by-slide decisions

| Slide                 | Assessment                                                                                 | Action                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: Title/team         | Product name and capability summary fit the build                                          | Keep. Team names and registration numbers cannot be verified from application code. The blue illustration differs from the green interface branding, which is a minor visual consistency issue.                                          |
| 2: Problem            | Fits the implemented accountability and recovery workflows                                 | Keep the selected problem statement. Explain that protection applies to unreleased simulated milestone funds. Previously released payments are not automatically clawed back.                                                            |
| 3: Empathy            | Consistent with the project brief                                                          | Keep. The severity 4.5/5 and frequency 4.0/5 values are present in the supplied brief, and the deck correctly labels them as brief ratings rather than independent research.                                                             |
| 4: Work logic         | Lifecycle is broadly correct; stack is outdated                                            | Replace Supabase/PostgreSQL with the actual local stack. Keep the explicit simulated-payment disclosure.                                                                                                                                 |
| 5: Execution          | Illustrative diagrams omit working implementation evidence; AI wording needs qualification | Use actual screenshots and recorded test results. The sample milestone row “Backend + tests: At risk” can look like a build-status claim, so remove it from the implementation slide or clearly identify it as fictional milestone data. |
| 6: Viability          | Target users and possible fee/subscription model are reasonable hypotheses                 | Keep them as proposed benefits and a potential business model. No pilots, revenue, measured dispute reduction, or willingness-to-pay results are established by the repository.                                                          |
| 7: Research/resources | Research caveats are sound; implementation references are incomplete                       | Keep the brief attribution and planned interviews. Replace the current-stack Supabase reference with Node SQLite. Describe Vercel AI SDK/Gateway as the implemented optional AI connector. Add Vitest.                                   |
| 8: Closing/demo       | Product summary fits; demo order is misleading                                             | Split normal completion and recovery into separate scenarios. Remove the presenter instruction about replacing team placeholders: names are already populated.                                                                           |

## Ready-to-paste replacement copy

### Slide 4: Approach & Work Logic

Keep the prevention, detection, and recovery explanation. Replace the stack line with:

> Implemented stack: Next.js, React and TypeScript. Persistent SQLite database. Local password/session authentication. Private files with authorized downloads. Zod validation. Optional Vercel AI SDK/Gateway assistance.

If that is too much for the existing text area, use two lines:

> Current demo: Next.js + TypeScript, SQLite, local authentication and private file storage
>
> Optional AI: Vercel AI SDK/Gateway. Hosted Postgres and object storage are future integrations.

Keep a visible disclosure:

> All funds are simulated. The demo makes no real transfers and provides no live escrow service.

The lifecycle should distinguish human acceptance from payment release. Both parties sign the same agreement before funding and work. The client accepts submitted evidence, then separately authorizes the simulated release.

### Slide 5: Working Prototype & Verification

Replace the illustrative product-flow panel with one real application screenshot. The completed project ledger is useful because it displays the ₹12,000 total, separate funding and payout entries, completed state, and simulation label. Use the recovery or dispute screenshot as supporting evidence if space permits.

Suggested copy:

> Working demo: client, freelancer, replacement and administrator workflows
>
> Signed agreements, evidence uploads and private downloads
>
> Human acceptance and separate simulated payment release
>
> Inactivity alerts, administrator dispute settlements and replacement recovery
>
> Verified: 25 Vitest tests and 6 Playwright tests passed. Browser suite passed against development and production servers. TypeScript, ESLint and the production build passed.

Replace the unqualified AI support text with:

> Automated file checks support human review. The default demo uses rules. Optional LLM advice uses scope or submission metadata and has not been live-tested.

File verification currently checks presence, allowed extension, basic content signatures, size and duplicate hashes. It does not inspect creative quality or prove that all requirements are satisfied. Client review or an authorized administrator resolution determines acceptance/payment authority.

Remove the red instruction about replacing visuals from the presented slide. It is an editing reminder rather than audience-facing product content.

Available screenshots, already captured from the verified production run:

- [Completed project and payment ledger](screenshots/normal-project-ledger-desktop.png)
- [Administrator partial settlement](screenshots/dispute-authorized-resolution.png)
- [Resumed replacement recovery](screenshots/recovery-resumed.png)
- [Blocked review-timeout dispute](screenshots/review-timeout-blocked.png)
- [Mobile dashboard](screenshots/dashboard-mobile.png)

These screenshots contain fictional test projects and demo accounts. They show the real application rather than the deck's illustrative interface.

### Slide 6: Business Viability & Real-World Utility

No material implementation correction is needed. For the value proposition, use intended outcomes:

> Designed to surface project risk earlier and make acceptance and payment decisions easier to audit.

Retain “potential model” and “validate with pilots.” If asked about evidence, distinguish passing software workflows from customer validation. Interview plans are future work.

### Slide 7: Research, Validation & Technical Resources

Keep:

> Problem-brief ratings: severity 4.5/5, frequency 4.0/5. These are supplied ratings, not independent market research.

> Customer validation next: interview 5–10 clients/freelancers and measure review delays, dispute frequency and willingness to use.

Technical references should match what is implemented:

- Next.js and React
- Node.js built-in SQLite
- Zod
- Vitest and Playwright
- Vercel AI SDK/Gateway, optional and not live-tested

Supabase can appear in a clearly labeled “future hosted adapter” roadmap. The current connector does not establish a direct OpenAI integration or live use of an OpenAI model.

Remove the red “Do not include...” editing reminder from the presentation. Preserve its underlying distinction by labeling claims and evidence accurately.

### Slide 8: Live Demo & Q&A

Replace the single continuous demo path with:

> Normal completion: create a project, both parties sign, simulate funding, submit evidence, review and accept, then release the simulated payment.
>
> Recovery scenario: use a second project with unfinished work. Advance the administrator demo clock, run checks, inspect the inactivity warning, initiate recovery and invite a replacement under a new agreement.

Optional supporting line:

> Demonstrated locally with persistent data. All funds are simulated. Hosted services and live payments remain future work.

Remove the instruction about replacing team placeholders and verifying features. Keep those checks in preparation notes instead.

## Accurate demo sequence

1. Complete one milestone or the normal project and show its separate acceptance and payout records.
2. Switch to a second active project with a funded/in-progress unfinished milestone. A fully completed project is not a valid inactivity demonstration.
3. As administrator, advance the clock by 73 hours and run accountability checks. Active work without meaningful freelancer activity warns at 48 hours and becomes at risk at 72 hours. Thresholds describe inactivity, not proof of misconduct.
4. As client, inspect the reasons, record intervention, and initiate recovery.
5. Show the handover containing only the accepted submission version and remaining requirements. Original unresolved funds stay separate from replacement entitlements.
6. Invite the replacement, obtain both signatures on the new agreement, provide fresh simulated funding and start work.
7. For a dispute demonstration, show the seeded disputed project or a separately submitted milestone. Administrator resolution can release, refund or split the remaining simulated balance with a recorded rationale.

For a short pitch, use the seeded Tech Club and College Launch scenarios rather than trying to create every prerequisite live. Keep [DEMO.md](DEMO.md) as the detailed rehearsal guide.

## Judge questions and truthful answers

**Is AI deciding whether work is good enough or releasing money?**

No. The default demo uses rules for scope suggestions and technical file checks. An optional connector can provide advisory scope/metadata observations. Live AI is untested. A client or authorized administrator makes the binding decision, and a separate operation moves simulated funds.

**Are you using Supabase or real escrow?**

The delivered local demo uses SQLite and private files, as allowed by the brief. All balances and transactions are simulated. Hosted adapters and a live payment provider would require separate implementation and verification.

**What does ghosting detection actually detect?**

It reports missing meaningful updates and deadline signals according to explicit rules. Administrators can advance a demo clock to demonstrate those rules. It does not infer a person's intent, and time passage never authorizes payment or a refund.

**Does recovery automatically find and pay a new freelancer?**

No. The client invites a registered replacement. The handover exposes authorized accepted evidence and remaining work. A fresh agreement and separate funding govern replacement work.

**What evidence shows that the application works?**

The recorded verification includes 25 passing Vitest tests and six passing Playwright scenario tests on both development and production servers. These cover real UI actions across four role sessions, persistence, private downloads, settlements, recovery and duplicate-payout prevention. This establishes tested demo behavior, not customer demand or production readiness.

## Evidence in the repository

- `src/lib/db.ts`: actual SQLite runtime and explicit demo-mode requirement.
- `src/lib/auth.ts`: local password hashing, roles and opaque sessions.
- `src/lib/ai.ts`: optional connector, rule fallback and advisory limitations.
- `src/lib/uploads.ts`: file checks, human-review markers and authorized evidence access.
- `src/lib/service.ts`: agreement/funding/release separation, inactivity thresholds, disputes and recovery.
- `tests/e2e/ui-workflows.spec.ts`: actual browser journeys and scenario prerequisites.
- `docs/VERIFICATION.md`: recorded test results, environment and limitations.

No application changes are required to resolve the pitch mismatches identified here.
