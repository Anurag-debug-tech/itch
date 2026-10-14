import { beforeEach, afterEach, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { register, type User } from '../src/lib/auth';
import { closeDb, get, getDb, all } from '../src/lib/db';
import { action, bootstrap, now, audit, auditPage } from '../src/lib/service';
import { legalOrderAction } from '../src/lib/legal-orders';
import { reviewBrief } from '../src/lib/dispute-review';
import { paymentAdapter } from '../src/lib/payments';
import { uploadSubmission } from '../src/lib/uploads';
import { projectInput, evidence } from './fixtures';
let directory: string, client: User, worker: User, replacement: User, admin: User;
beforeEach(() => {
  closeDb();
  directory = mkdtempSync(path.join(tmpdir(), 'mg-readiness-finance-'));
  process.env.DEMO_MODE = 'true';
  process.env.DATABASE_PATH = path.join(directory, 'app.sqlite');
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  const account = (name: string, role = 'CLIENT') =>
    register({ name, email: name + '@finance.test', password: 'SecureTest123!', role });
  client = account('Client');
  worker = account('Worker', 'FREELANCER');
  replacement = account('Replacement', 'FREELANCER');
  admin = account('Admin');
  getDb().prepare("UPDATE users SET role='ADMIN' WHERE id=?").run(admin.id);
  admin.role = 'ADMIN';
});
afterEach(() => {
  closeDb();
  rmSync(directory, { recursive: true, force: true });
});
function agreed() {
  const created = action(client, projectInput(worker.id, now()));
  for (const user of [client, worker])
    action(user, {
      type: 'acceptAgreement',
      projectId: created.project.id,
      agreementId: created.agreement.id,
    });
  return created;
}
async function finish(user: User, milestoneId: string) {
  action(client, { type: 'fund', milestoneId });
  action(user, { type: 'start', milestoneId });
  await uploadSubmission(user, {
    milestoneId,
    description: 'Completed scope supplied for human review.',
    file: {
      name: 'evidence.txt',
      type: 'text/plain',
      size: evidence.length,
      arrayBuffer: async () => Uint8Array.from(evidence).buffer,
    },
  });
  action(client, { type: 'review', milestoneId, decision: 'ACCEPT' });
  action(client, { type: 'payout', milestoneId });
}
it('persists requested and confirmed stages separately, without premature financial success', () => {
  const { agreement } = agreed(),
    m = agreement.snapshot.milestones[0];
  const intent = paymentAdapter.createFundingIntent(m.id, m.budget, 'fund:' + m.id);
  expect(intent.status).toBe('PENDING');
  expect(get('milestones', m.id)!.funded).toBe(0);
  expect(all('ledger')).toHaveLength(0);
  expect(
    getDb().prepare('SELECT phase FROM payment_events WHERE intentId=?').all(intent.id),
  ).toEqual([{ phase: 'REQUESTED' }]);
  paymentAdapter.confirmFunding(intent.id);
  paymentAdapter.confirmFunding(intent.id);
  expect(get('milestones', m.id)!.funded).toBe(m.budget);
  expect(
    getDb()
      .prepare('SELECT phase FROM payment_events WHERE intentId=? ORDER BY rowid')
      .all(intent.id),
  ).toEqual([{ phase: 'REQUESTED' }, { phase: 'CONFIRMED' }]);
  expect(() => paymentAdapter.createFundingIntent(m.id, m.budget, 'different-reference')).toThrow(
    /original reference/,
  );
});
it('records an original recipient acknowledgement once and never changes money or authorizes payout', () => {
  const { agreement } = agreed(),
    m = agreement.snapshot.milestones[0];
  action(client, { type: 'fund', milestoneId: m.id });
  const row = bootstrap(client).paymentHistory[0];
  expect(() => action(client, { type: 'acknowledgePayment', reference: row.reference })).toThrow(
    /recipient/,
  );
  action(worker, { type: 'acknowledgePayment', reference: row.reference });
  action(worker, { type: 'acknowledgePayment', reference: row.reference });
  expect(bootstrap(client).paymentHistory[0].acknowledgedBy).toBe(worker.id);
  expect(getDb().prepare('SELECT count(*) AS n FROM payment_acknowledgements').get()).toEqual({
    n: 1,
  });
  expect(get('milestones', m.id)!.paid).toBe(0);
  expect(all('ledger')).toHaveLength(1);
});
it('keeps recovery open after replacement payout until original obligations receive an authorized settlement', async () => {
  const { project, agreement } = agreed(),
    [first, second] = agreement.snapshot.milestones;
  await finish(worker, first.id);
  action(client, { type: 'fund', milestoneId: second.id });
  action(worker, {
    type: 'withdraw',
    projectId: project.id,
    reason: 'Unable to continue the remaining implementation work.',
  });
  const { recovery } = action(client, {
    type: 'recover',
    projectId: project.id,
    reason: 'Preserve accepted work and arrange replacement implementation.',
  });
  const invited = action(client, {
    type: 'inviteReplacement',
    recoveryId: recovery.id,
    freelancerId: replacement.id,
  });
  for (const user of [client, replacement])
    action(user, {
      type: 'acceptAgreement',
      projectId: project.id,
      agreementId: invited.agreement.id,
    });
  await finish(replacement, invited.agreement.snapshot.milestones[0].id);
  expect(get('projects', project.id)!.status).toBe('ACTIVE');
  expect(get('milestones', first.id)!.paid).toBe(first.budget);
  expect(get('milestones', second.id)!.paid).toBe(0);
  const { dispute } = action(client, {
    type: 'dispute',
    milestoneId: second.id,
    reason: 'Original unfinished funding needs independent settlement.',
  });
  action(admin, {
    type: 'resolve',
    disputeId: dispute.id,
    outcome: 'REFUND',
    rationale: 'Reviewed original obligation and explicitly refund only unfinished funding.',
  });
  expect(get('projects', project.id)!.status).toBe('COMPLETED');
  expect(get('milestones', first.id)!.paid).toBe(first.budget);
  expect(get('milestones', second.id)!.refunded).toBe(second.budget);
});
it('records qualified legal review and confirmed execution history without granting financial authority', async () => {
  const { project, agreement } = agreed(),
    m = agreement.snapshot.milestones[0];
  await finish(worker, m.id);
  const payout = bootstrap(admin).paymentHistory.find((p: { kind: string }) => p.kind === 'PAYOUT');
  const count = all('ledger').length;
  const record = {
    type: 'record',
    projectId: project.id,
    reference: 'FICTIONAL-ORDER-001',
    authority: 'Fictional demonstration authority',
    documentReference: 'Private fictional case record',
    receivedAt: new Date().toISOString().slice(0, 10),
    scope: 'Demonstrate reviewed payout recordkeeping only.',
    milestoneIds: [m.id],
    outcomes: ['RELEASE'],
    maxAmountMinor: String(m.budget),
    fictional: true,
  };
  expect(() => legalOrderAction(client, record)).toThrow(/Administrator/);
  const { id } = legalOrderAction(admin, record);
  expect(() =>
    legalOrderAction(admin, { type: 'recordExecution', orderId: id, reference: payout.reference }),
  ).toThrow(/unverified/);
  expect(all('ledger')).toHaveLength(count);
  legalOrderAction(admin, {
    type: 'review',
    orderId: id,
    verdict: 'VERIFIED',
    attestation: true,
    reviewerName: 'Fictional qualified external reviewer',
    authenticationBasis: 'Fictional external registry and signed record were reviewed.',
    jurisdictionAndScope: 'Qualified reviewer confirmed the stated fictional scope.',
  });
  for (let i = 0; i < 2; i++)
    legalOrderAction(admin, { type: 'recordExecution', orderId: id, reference: payout.reference });
  expect(getDb().prepare('SELECT count(*) AS n FROM legal_order_executions').get()).toEqual({
    n: 1,
  });
  expect(all('ledger')).toHaveLength(count);
  expect(bootstrap(client).legalOrders).toEqual([]);
  expect(bootstrap(admin).legalOrders[0].executions[0].sourceRef).toBe(payout.reference);
});
it('rejects legal associations outside reviewed outcomes or amount scope', async () => {
  const { project, agreement } = agreed(),
    m = agreement.snapshot.milestones[0];
  await finish(worker, m.id);
  const payout = bootstrap(admin).paymentHistory.find((p: { kind: string }) => p.kind === 'PAYOUT');
  for (const outcomes of [['REFUND'], ['RELEASE']]) {
    const { id } = legalOrderAction(admin, {
      type: 'record',
      projectId: project.id,
      reference: 'FICTIONAL-SCOPE',
      authority: 'Fictional authority',
      documentReference: 'Private fictional record',
      receivedAt: new Date().toISOString().slice(0, 10),
      scope: 'Limited fictional scope.',
      milestoneIds: [m.id],
      outcomes,
      maxAmountMinor: String(m.budget - 1),
      fictional: true,
    });
    legalOrderAction(admin, {
      type: 'review',
      orderId: id,
      verdict: 'VERIFIED',
      attestation: true,
      reviewerName: 'Fictional reviewer',
      authenticationBasis: 'Fictional authentication evidence.',
      jurisdictionAndScope: 'Only the recorded scope is supported.',
    });
    expect(() =>
      legalOrderAction(admin, {
        type: 'recordExecution',
        orderId: id,
        reference: payout.reference,
      }),
    ).toThrow(/scope/);
  }
});
it('shows missing evidence in dispute briefs, enforces reviewer assignment and denies outsiders', async () => {
  const { agreement } = agreed(),
    m = agreement.snapshot.milestones[0];
  action(client, { type: 'fund', milestoneId: m.id });
  const { dispute } = action(worker, {
    type: 'dispute',
    milestoneId: m.id,
    reason: 'Request independent review of the funding and required work.',
  });
  expect(() =>
    action(client, { type: 'assignDispute', disputeId: dispute.id, reviewerId: admin.id }),
  ).toThrow(/Administrator/);
  action(admin, { type: 'assignDispute', disputeId: dispute.id, reviewerId: admin.id });
  expect(get('disputes', dispute.id)!.assignedReviewerId).toBe(admin.id);
  const brief = await reviewBrief(worker, dispute.id);
  expect(brief.missingEvidence).toContain('No deliverable evidence is recorded.');
  await expect(reviewBrief(replacement, dispute.id)).rejects.toThrow();
  expect(get('milestones', m.id)!.paid).toBe(0);
});
it('paginates authorized history without duplicates, missing entries or cross-project access', () => {
  const { project } = agreed();
  for (let i = 0; i < 120; i++)
    audit(project.id, worker.id, 'RECORDED_TEST_ACTIVITY', { index: i });
  let cursor: string | undefined;
  const seen: string[] = [];
  do {
    const page = auditPage(client, { projectId: project.id, cursor, limit: 17 });
    seen.push(...page.items.map((r: { id: string }) => r.id));
    cursor = page.nextCursor || undefined;
  } while (cursor);
  expect(new Set(seen).size).toBe(seen.length);
  expect(seen).toHaveLength(
    (
      getDb().prepare('SELECT count(*) AS n FROM audit WHERE projectId=?').get(project.id) as {
        n: number;
      }
    ).n,
  );
  expect(() => auditPage(replacement, { projectId: project.id })).toThrow();
  expect(() => auditPage(client, { limit: 1000 })).toThrow();
  expect(() => auditPage(client, { cursor: 'invalid' })).toThrow(/cursor/);
});
