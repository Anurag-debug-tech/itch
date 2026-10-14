import { randomUUID } from 'node:crypto';
import { get, getDb, transaction, type Row } from './db';
import { assert } from './errors';
import type { User } from './auth';
import { audit, text } from './service';
import { confirmedPayment } from './payment-history';
const wallTime = () => new Date().toISOString();
function minorAmount(value: unknown) {
  assert(
    typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value),
    'Enter the authorized amount in exact minor units',
  );
  assert(BigInt(value) <= 1_000_000_000_000_000_000n, 'Authorized amount is too large');
  return value;
}
export function legalOrders(user: User) {
  if (user.role !== 'ADMIN') return [];
  return (getDb().prepare('SELECT * FROM legal_orders ORDER BY createdAt DESC').all() as Row[]).map(
    (r) => ({
      ...JSON.parse(r.data),
      id: r.id,
      projectId: r.projectId,
      status: r.status,
      recordedBy: r.recordedBy,
      createdAt: r.createdAt,
      executions: getDb()
        .prepare('SELECT * FROM legal_order_executions WHERE orderId=? ORDER BY createdAt')
        .all(r.id),
    }),
  );
}
/** Administrative recordkeeping only. This module deliberately imports no payment execution adapter. */
export function legalOrderAction(user: User, b: Row) {
  assert(user.role === 'ADMIN', 'Administrator access required', 403);
  return transaction(() => {
    const db = getDb();
    if (b.type === 'record') {
      const project = get('projects', String(b.projectId));
      assert(project, 'Project not found', 404);
      assert(
        typeof b.receivedAt === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(b.receivedAt) &&
          Number.isFinite(Date.parse(b.receivedAt)) &&
          new Date(b.receivedAt).toISOString().slice(0, 10) === b.receivedAt,
        'Use a valid receipt date',
      );
      assert(b.receivedAt <= wallTime().slice(0, 10), 'Receipt date cannot be in the future');
      assert(
        Array.isArray(b.milestoneIds) &&
          b.milestoneIds.length > 0 &&
          b.milestoneIds.length <= 30 &&
          new Set(b.milestoneIds).size === b.milestoneIds.length,
        'Select the affected milestones',
      );
      for (const id of b.milestoneIds)
        assert(
          get('milestones', String(id))?.projectId === project.id,
          'Affected milestone does not belong to this project',
        );
      assert(
        Array.isArray(b.outcomes) &&
          b.outcomes.length > 0 &&
          b.outcomes.every((s: unknown) => ['RELEASE', 'REFUND'].includes(String(s))),
        'Select the claimed permitted outcomes',
      );
      const id = randomUUID(),
        data = {
          reference: text(b.reference, 'Order reference', 250),
          authority: text(b.authority, 'Issuing authority', 250),
          documentReference: text(b.documentReference, 'Private document/reference location', 500),
          receivedAt: b.receivedAt,
          scope: text(b.scope, 'Claimed authorized scope', 4000),
          milestoneIds: b.milestoneIds,
          outcomes: [...new Set(b.outcomes)],
          maxAmountMinor: minorAmount(b.maxAmountMinor),
          currency: project.financialMode === 'STELLAR_TESTNET' ? 'XLM' : 'INR',
          fictional: b.fictional === true,
          authenticationStatus: 'UNVERIFIED',
          review: null,
        };
      db.prepare('INSERT INTO legal_orders VALUES (?,?,?,?,?,?)').run(
        id,
        project.id,
        user.id,
        'UNVERIFIED',
        wallTime(),
        JSON.stringify(data),
      );
      audit(project.id, user.id, 'LEGAL_ORDER_RECORDED', {
        orderId: id,
        authenticationStatus: 'UNVERIFIED',
        noFinancialAction: true,
      });
      return { ok: true, id };
    }
    const row = db.prepare('SELECT * FROM legal_orders WHERE id=?').get(String(b.orderId)) as
      Row | undefined;
    assert(row, 'Legal-order record not found', 404);
    const data = JSON.parse(row.data);
    if (b.type === 'review') {
      assert(
        row.status === 'UNVERIFIED',
        'Review has already been recorded; retain history and create a corrected record',
        409,
      );
      assert(['VERIFIED', 'REJECTED'].includes(b.verdict), 'Choose the external reviewer finding');
      assert(
        b.attestation === true,
        'Confirm that this records a qualified reviewer finding and grants no payment authority',
      );
      data.review = {
        reviewerName: text(b.reviewerName, 'Qualified reviewer name', 250),
        recordedBy: user.id,
        recordedAt: wallTime(),
        verdict: b.verdict,
        authenticationBasis: text(
          b.authenticationBasis,
          'Authentication method and evidence',
          4000,
        ),
        jurisdictionAndScope: text(
          b.jurisdictionAndScope,
          'Jurisdiction and authorized scope review',
          4000,
        ),
      };
      data.authenticationStatus =
        b.verdict === 'VERIFIED' ? 'EXTERNAL_VERIFICATION_RECORDED' : 'REJECTED';
      db.prepare('UPDATE legal_orders SET status=?,data=? WHERE id=?').run(
        b.verdict === 'VERIFIED' ? 'REVIEW_RECORDED' : 'REJECTED',
        JSON.stringify(data),
        row.id,
      );
      audit(row.projectId, user.id, 'LEGAL_ORDER_REVIEW_RECORDED', {
        orderId: row.id,
        verdict: b.verdict,
        noFinancialAction: true,
      });
      return { ok: true };
    }
    assert(b.type === 'recordExecution', 'Unknown legal-order operation');
    assert(
      row.status === 'REVIEW_RECORDED' && data.review?.verdict === 'VERIFIED',
      'An unverified or rejected document cannot support an execution record',
      409,
    );
    const payment = confirmedPayment(user, String(b.reference));
    assert(payment.kind !== 'FUNDING', 'Funding is not a legal settlement execution');
    const outcome = payment.kind === 'PAYOUT' ? 'RELEASE' : 'REFUND';
    assert(
      payment.projectId === row.projectId &&
        data.milestoneIds.includes(payment.milestoneId) &&
        data.outcomes.includes(outcome),
      'Transaction is outside the reviewed order scope',
      409,
    );
    const prior = db
      .prepare('SELECT * FROM legal_order_executions WHERE sourceRef=?')
      .get(payment.reference) as Row | undefined;
    if (prior) {
      assert(
        prior.orderId === row.id,
        'Transaction execution is already associated with another order',
        409,
      );
      return { ok: true };
    }
    const executed = (
      db
        .prepare('SELECT amountMinor FROM legal_order_executions WHERE orderId=?')
        .all(row.id) as Row[]
    ).reduce((sum, r) => sum + BigInt(r.amountMinor), 0n);
    assert(
      executed + BigInt(payment.amountMinor) <= BigInt(data.maxAmountMinor),
      'Confirmed amount exceeds the recorded authorized scope',
      409,
    );
    db.prepare('INSERT INTO legal_order_executions VALUES (?,?,?,?,?,?,?)').run(
      randomUUID(),
      row.id,
      payment.reference,
      payment.amountMinor,
      outcome,
      user.id,
      wallTime(),
    );
    audit(row.projectId, user.id, 'LEGAL_ORDER_EXECUTION_LINKED', {
      orderId: row.id,
      reference: payment.reference,
      outcome,
      amountMinor: payment.amountMinor,
      noNewFinancialAction: true,
    });
    return { ok: true };
  });
}
