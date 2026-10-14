import { randomUUID } from 'node:crypto';
import { getDb, get, put, all, transaction, type Row } from './db';
import { now } from './time';
import { assert, AppError } from './errors';
export interface PaymentAdapter {
  createFundingIntent(milestoneId: string, amount: number, reference: string): Row;
  confirmFunding(id: string): Row;
  requestPayout(milestoneId: string, amount: number, reference: string): Row;
  confirmPayout(id: string): Row;
  requestRefund(milestoneId: string, amount: number, reference: string): Row;
  confirmRefund(id: string): Row;
  getTransactionStatus(id: string): Row;
  processVerifiedWebhook(): never;
}
function request(kind: string, milestoneId: string, amount: number, reference: string): Row {
  const milestone = get('milestones', milestoneId);
  assert(
    milestone && get('projects', milestone.projectId)?.financialMode !== 'STELLAR_TESTNET',
    'Simulated payments cannot operate on Testnet projects',
    409,
  );
  const d = getDb();
  const prior = d.prepare('SELECT * FROM payment_intents WHERE reference=?').get(reference) as
    Row | undefined;
  if (prior) {
    assert(
      prior.milestoneId === milestoneId && prior.kind === kind && prior.amount === amount,
      'Idempotency conflict',
      409,
    );
    return prior;
  }
  assert(
    !d
      .prepare('SELECT id FROM payment_intents WHERE milestoneId=? AND kind=?')
      .get(milestoneId, kind),
    'This milestone operation already has a transaction; use its original reference',
    409,
  );
  assert(Number.isSafeInteger(amount) && amount > 0, 'Invalid payment amount');
  const result = { id: randomUUID(), milestoneId, kind, amount, status: 'PENDING', reference };
  d.prepare('INSERT INTO payment_intents VALUES (?,?,?,?,?,?)').run(
    result.id,
    milestoneId,
    kind,
    amount,
    result.status,
    reference,
  );
  recordEvent(result, 'REQUESTED');
  return result;
}
function recordEvent(intent: Row, phase: 'REQUESTED' | 'CONFIRMED') {
  getDb()
    .prepare('INSERT INTO payment_events VALUES (?,?,?,?)')
    .run(randomUUID(), intent.id, phase, now());
  const milestone = get('milestones', intent.milestoneId)!;
  put('audit', {
    id: randomUUID(),
    projectId: milestone.projectId,
    actorId: 'adapter:LOCAL_DEMO',
    action: `SIMULATED_${intent.kind}_${phase}`,
    detail: {
      intentId: intent.id,
      reference: intent.reference,
      amount: intent.amount,
      currency: 'INR',
    },
    createdAt: now(),
  });
}
function confirm(id: string, kind: string): Row {
  const d = getDb();
  const intent = d.prepare('SELECT * FROM payment_intents WHERE id=?').get(id) as Row | undefined;
  assert(intent && intent.kind === kind, 'Invalid simulated transaction');
  if (intent.status === 'CONFIRMED') return intent;
  const m = get('milestones', intent.milestoneId)!;
  const amount = intent.amount;
  if (kind === 'FUNDING') {
    assert(m.funded === 0 && amount === m.budget, 'Milestone already funded or amount invalid');
    m.funded = amount;
    m.paymentStatus = 'FUNDED';
  } else if (kind === 'PAYOUT') {
    assert(
      !all('disputes').some((d) => d.milestoneId === m.id && d.status === 'OPEN'),
      'Open dispute blocks payment',
    );
    assert(
      all('submissions').some((s) => s.milestoneId === m.id),
      'Deliverable evidence is required',
    );
    assert(
      m.status === 'ACCEPTED' ||
        all('disputes').some(
          (d) =>
            d.milestoneId === m.id &&
            d.status === 'RESOLVED' &&
            ['RELEASE', 'PARTIAL'].includes(d.outcome) &&
            d.payoutAmount === amount,
        ),
      'Payment requires acceptance or authorized settlement',
    );
    assert(m.paid === 0 && amount <= m.funded - m.refunded, 'Payout exceeds protected balance');
    m.paid = amount;
    m.paymentStatus = 'RELEASED';
  } else {
    assert(
      all('disputes').some(
        (d) =>
          d.milestoneId === m.id &&
          d.status === 'RESOLVED' &&
          ['REFUND', 'PARTIAL', 'CANCEL'].includes(d.outcome),
      ),
      'Refund requires authorized settlement',
    );
    assert(m.refunded === 0 && amount <= m.funded - m.paid, 'Refund exceeds remaining balance');
    m.refunded = amount;
    m.paymentStatus = m.paid ? 'PARTIALLY_SETTLED' : 'REFUNDED';
  }
  put('milestones', m);
  const row = {
    id: randomUUID(),
    projectId: m.projectId,
    milestoneId: m.id,
    type: kind,
    amount,
    status: 'SIMULATED_CONFIRMED',
    createdAt: now(),
    reference: intent.reference,
  };
  put('ledger', row);
  d.prepare("UPDATE payment_intents SET status='CONFIRMED' WHERE id=?").run(id);
  recordEvent(intent, 'CONFIRMED');
  return { ...intent, status: 'CONFIRMED' };
}
export const paymentAdapter: PaymentAdapter = {
  createFundingIntent: (m, a, r) => transaction(() => request('FUNDING', m, a, r)),
  confirmFunding: (id) => transaction(() => confirm(id, 'FUNDING')),
  requestPayout: (m, a, r) => transaction(() => request('PAYOUT', m, a, r)),
  confirmPayout: (id) => transaction(() => confirm(id, 'PAYOUT')),
  requestRefund: (m, a, r) => transaction(() => request('REFUND', m, a, r)),
  confirmRefund: (id) => transaction(() => confirm(id, 'REFUND')),
  getTransactionStatus(id) {
    const r = getDb().prepare('SELECT * FROM payment_intents WHERE id=?').get(id) as
      Row | undefined;
    assert(r, 'Transaction not found', 404);
    return r;
  },
  processVerifiedWebhook() {
    throw new AppError('Demo adapter does not accept external payment webhooks', 400);
  },
};
