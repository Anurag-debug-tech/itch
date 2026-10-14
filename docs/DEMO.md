# Four-scenario demonstration guide

Run the setup, migration, seed, and development commands in the README. Keep `npm run jobs:watch` running in a second terminal for automatic background checks, or use the administrator's **Run accountability checks** control. Use [localhost:3000](http://localhost:3000) consistently; the exact configured origin is enforced for writes.

All money is simulated. No real payment credentials are needed. Sign out to switch roles, or use separate browser profiles for client, freelancer, replacement, and administrator. The sign-in page has demo role buttons. All demo passwords are `DemoPass123!`.

## Presentation preparation

Use Node 24.8 or newer. Run `npm run build` and `npm start` for the optimized demo at http://localhost:3000, with `npm run jobs:watch` in a second terminal. Check the four accounts in separate browser profiles before presenting. Prepare a short nonempty `design-evidence.txt` file to upload. For a clean presentation, intentionally reset the local demo before opening the profiles; reset ends existing sessions. Allow roughly 8–10 minutes for all four scenarios, or 3–4 minutes for normal completion plus the seeded recovery/dispute examples.

All four scenarios below were executed through Chrome against the production server on 14 October 2026. [Verification](VERIFICATION.md) records the exact test scope and [screenshots](screenshots/) retain the resulting desktop/mobile and workflow views.

## Starting dataset

The seed contains seven clearly fictional projects: completed Campus Fest, active Brew & Bean with a requested revision, overdue Student Society, Tech Club with missing check-ins, disputed Craft Studio, College Launch rescue with a replacement invitation, and Design Sprint partial settlement. Payments, evidence, audit events, and dashboard numbers come from those records.

`npm run db:reset` deletes the configured demo records and re-seeds them. The administrator's reset control does the same and ends existing sessions. Use reset only when you intend to discard the current demonstration state.

## A. A normal ₹12,000 website project

1. Sign in as **Client** and choose **New project**. Choose Website Development, edit the title, invite `freelancer@milestoneguard.demo`, and set the total to ₹12,000.
2. Set three milestones to ₹3,000, ₹4,000, and ₹5,000. Keep deadlines within the project dates. Use **Suggest criteria** to show Scope Doctor's rule-based suggestions, then edit and approve the checklist yourself. The suggestions do not bind either party yet.
3. Finish the wizard and open **Agreement**. Inspect the immutable snapshot and content hash. Choose **Accept agreement**.
4. Sign in as **Freelancer**, open the same project, review the same version, and choose **Accept agreement**. Both signatures must be present before funding becomes available.
5. As **Client**, open **Milestones** and choose **Fund milestone** for the first milestone. Show its recorded simulated funding and protected balance.
6. As **Freelancer**, choose **Start milestone**, then **Submit deliverable**. Upload a nonempty `.txt`, PDF, image, or other file type permitted by the milestone. A text document explaining the agreed page names and mobile behavior is sufficient to demonstrate the upload mechanism.
7. Inspect file/type/size/hash checks and the checklist's human-review status. A valid file does not prove subjective completeness and does not release payment.
8. As **Client**, choose **Review deliverable**, read/download the evidence, and accept. Then choose **Release simulated payment**. Show the ledger's funding and single payout record, plus the project activity history.
9. Refresh the page to demonstrate persistence. Repeat requests cannot create a second payout.

## B. Inactivity and project rescue

1. Open **Tech Club — missing check-ins**, or fund and start a new milestone. Its risk view explains the last meaningful activity and missed check-ins.
2. For a new active project, sign in as **Administrator**, open **Admin controls**, advance the clock by 73 hours, and run accountability checks. Viewing a page is not a check-in.
3. As **Client**, inspect **Progress & risk** and notifications. The warning reports inactivity; it is not an accusation or automatic refund.
4. Open the project, request an intervention and record a reason. Start recovery when the project is at risk or intervention/withdrawal has been recorded.
5. Open **Rescue center** and download the handover. It includes authorized accepted evidence and outstanding requirements. Earlier unaccepted submission versions are excluded from replacement access.
6. Invite `replacement@milestoneguard.demo`. Original funds and original freelancer obligations remain separate. Replacement milestones start unfunded and require a new agreement.
7. Both the client and replacement accept the new agreement. Fund the fresh milestone, then sign in as **Replacement** and start the work. Show the resumed recovery status and retained history.
8. To demonstrate this without setup, open the seeded **College Launch — project rescue** invitation and finish its new signatures and funding.

## C. Disputed work and an authorized settlement

1. Open **Craft Studio — disputed deliverable**, or submit work and raise a dispute with a reason tied to the agreement.
2. Show the blocked payment state and preserved evidence. Client and freelancer can add statements; neither can resolve the dispute as administrator.
3. Sign in as **Administrator**, open **Disputes**, inspect agreement versions, submissions, progress, and payment history, then record a resolution rationale.
4. Choose release, refund, partial settlement, revision, continue, or cancellation as appropriate. A release needs evidence. For a ₹3,000 milestone, a ₹1,800 payout with ₹1,200 refund demonstrates a partial settlement.
5. Show the resulting single payout/refund ledger entries and the administrator's audit event. The total can never exceed funded funds. The seeded **Design Sprint — partial settlement** provides a completed example.

## D. Client inactivity and review escalation

1. Create/fund/start a milestone with a 72-hour review window and submit evidence. Leave it unreviewed.
2. As **Administrator**, advance the demo clock 36 hours and run checks to generate the mid-window reminder. Then advance another 37 hours and run checks again.
3. Show the automatically opened review-timeout dispute, notifications, and blocked payment. Neither upload nor time passage has paid the freelancer.
4. Review the evidence as administrator and record a supported resolution with a rationale. Only an authorized release or settlement moves the simulated balance.

## What to say accurately

The default assistance is rule-based, the financial adapter is simulated, and the local SQLite database is persistent. Optional configured LLM assistance is advisory and sends only scope/submission metadata; it is not required or live-tested. File checks establish basic technical properties, not malware freedom or creative quality. Hosted storage, real payments, account verification, and production operations remain future integration work.
