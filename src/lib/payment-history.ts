import { randomUUID } from 'node:crypto';
import { all, get, getDb, put, transaction, type Row } from './db';
import { assert } from './errors';
import { now } from './time';
import type { User } from './auth';

export type PaymentRecord = {
  reference: string;
  projectId: string;
  milestoneId: string;
  kind: 'FUNDING' | 'PAYOUT' | 'REFUND';
  mode: 'LOCAL_DEMO' | 'STELLAR_TESTNET';
  amountMinor: string;
  currency: 'INR' | 'XLM';
  status: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  eligibleUserId: string;
  events: { phase: string; createdAt: string | null }[];
  txHash?: string;
};
function target(
  reference: string,
): (PaymentRecord & { clientId: string; workerId: string }) | undefined {
  const db = getDb();
  if (reference.startsWith('ledger:')) {
    const ledger = get('ledger', reference.slice(7));
    if (!ledger) return;
    const milestone = get('milestones', ledger.milestoneId)!,
      project = get('projects', ledger.projectId)!;
    const intent = db
      .prepare('SELECT * FROM payment_intents WHERE reference=?')
      .get(ledger.reference) as Row | undefined;
    const events = intent
      ? (db
          .prepare(
            'SELECT phase,createdAt FROM payment_events WHERE intentId=? ORDER BY createdAt,rowid',
          )
          .all(intent.id) as PaymentRecord['events'])
      : [];
    return {
      reference,
      projectId: project.id,
      milestoneId: milestone.id,
      kind: ledger.type,
      mode: 'LOCAL_DEMO',
      amountMinor: String(ledger.amount),
      currency: 'INR',
      status: ledger.status,
      clientId: project.clientId,
      workerId: milestone.assignedFreelancerId,
      eligibleUserId: ledger.type === 'REFUND' ? project.clientId : milestone.assignedFreelancerId,
      events: events.length
        ? events
        : [{ phase: 'CONFIRMED', createdAt: ledger.createdAt || null }],
      acknowledgedBy: null,
      acknowledgedAt: null,
    };
  }
  if (reference.startsWith('chain:')) {
    const t = db.prepare('SELECT * FROM chain_transactions WHERE id=?').get(reference.slice(6)) as
      Row | undefined;
    if (
      !t ||
      t.status !== 'CONFIRMED' ||
      !['fund_milestone', 'approve_and_release', 'resolve_dispute', 'refund_authorized'].includes(
        t.method,
      )
    )
      return;
    const e = db.prepare('SELECT * FROM chain_escrows WHERE id=?').get(t.escrowRef) as Row;
    const parties = JSON.parse(e.data),
      expected = JSON.parse(t.expected);
    const m = db
      .prepare('SELECT amount FROM chain_milestones WHERE escrowRef=? AND milestoneId=?')
      .get(e.id, t.milestoneId) as Row;
    const kind =
      t.method === 'fund_milestone'
        ? 'FUNDING'
        : t.method === 'refund_authorized' || (t.method === 'resolve_dispute' && !expected.release)
          ? 'REFUND'
          : 'PAYOUT';
    return {
      reference,
      projectId: e.projectId,
      milestoneId: t.milestoneId,
      kind,
      mode: 'STELLAR_TESTNET',
      amountMinor: m.amount,
      currency: 'XLM',
      status: 'CONFIRMED',
      clientId: parties.clientUserId,
      workerId: parties.freelancerUserId,
      eligibleUserId: kind === 'REFUND' ? parties.clientUserId : parties.freelancerUserId,
      events: [
        { phase: 'REQUESTED', createdAt: t.createdAt },
        { phase: 'CONFIRMED', createdAt: t.updatedAt },
      ],
      txHash: t.txHash,
      acknowledgedBy: null,
      acknowledgedAt: null,
    };
  }
}
export function paymentHistory(user: User, projectIds: Set<string>): PaymentRecord[] {
  const db = getDb();
  const refs = [
    ...all('ledger')
      .filter((l) => projectIds.has(l.projectId))
      .map((l) => 'ledger:' + l.id),
    ...(
      db
        .prepare("SELECT id,projectId FROM chain_transactions WHERE status='CONFIRMED'")
        .all() as Row[]
    )
      .filter((t) => projectIds.has(t.projectId))
      .map((t) => 'chain:' + t.id),
  ];
  const result: PaymentRecord[] = [];
  for (const ref of refs) {
    const row = target(ref);
    if (!row) continue;
    const { clientId, workerId, ...visible } = row;
    if (!(user.role === 'ADMIN' || user.id === clientId || user.id === workerId)) continue;
    const ack = db
      .prepare(
        `SELECT actorId,createdAt FROM payment_acknowledgements WHERE ${row.mode === 'LOCAL_DEMO' ? 'ledgerId' : 'chainTransactionId'}=? AND actorId=?`,
      )
      .get(ref.slice(row.mode === 'LOCAL_DEMO' ? 7 : 6), row.eligibleUserId) as Row | undefined;
    result.push({
      ...visible,
      acknowledgedBy: ack?.actorId || null,
      acknowledgedAt: ack?.createdAt || null,
    });
  }
  // Interrupted requested operations remain visible and are never labelled confirmed.
  for (const i of db
    .prepare(
      "SELECT i.*,m.projectId,m.data AS milestoneData,p.clientId FROM payment_intents i JOIN milestones m ON m.id=i.milestoneId JOIN projects p ON p.id=m.projectId WHERE i.status<>'CONFIRMED'",
    )
    .all() as Row[]) {
    const worker = JSON.parse(i.milestoneData).assignedFreelancerId;
    if (
      !projectIds.has(i.projectId) ||
      !(user.role === 'ADMIN' || user.id === i.clientId || user.id === worker)
    )
      continue;
    result.push({
      reference: 'intent:' + i.id,
      projectId: i.projectId,
      milestoneId: i.milestoneId,
      kind: i.kind,
      mode: 'LOCAL_DEMO',
      amountMinor: String(i.amount),
      currency: 'INR',
      status: i.status,
      eligibleUserId: '',
      acknowledgedBy: null,
      acknowledgedAt: null,
      events: db
        .prepare('SELECT phase,createdAt FROM payment_events WHERE intentId=? ORDER BY rowid')
        .all(i.id) as PaymentRecord['events'],
    });
  }
  return result.sort((a, b) =>
    (b.events.at(-1)?.createdAt || '').localeCompare(a.events.at(-1)?.createdAt || ''),
  );
}
export function acknowledgePayment(user: User, reference: string) {
  return transaction(() => {
    const row = target(reference);
    assert(row, 'Confirmed payment not found', 404);
    assert(
      ['SIMULATED_CONFIRMED', 'CONFIRMED'].includes(row.status),
      'Only confirmed payments may be acknowledged',
      409,
    );
    assert(
      row.eligibleUserId === user.id,
      'Only the original payment recipient may acknowledge this transaction',
      403,
    );
    const result = getDb()
      .prepare('INSERT OR IGNORE INTO payment_acknowledgements VALUES (?,?,?,?,?)')
      .run(
        randomUUID(),
        row.mode === 'LOCAL_DEMO' ? reference.slice(7) : null,
        row.mode === 'STELLAR_TESTNET' ? reference.slice(6) : null,
        user.id,
        now(),
      );
    if (result.changes)
      put('audit', {
        id: randomUUID(),
        projectId: row.projectId,
        actorId: user.id,
        action: 'PAYMENT_ACKNOWLEDGED',
        detail: { reference, kind: row.kind, mode: row.mode },
        createdAt: now(),
      });
    return { ok: true };
  });
}
export function confirmedPayment(user: User, reference: string) {
  const row = target(reference);
  assert(row, 'Confirmed transaction not found', 404);
  assert(
    user.role === 'ADMIN' || user.id === row.clientId || user.id === row.workerId,
    'Transaction access denied',
    403,
  );
  assert(
    ['SIMULATED_CONFIRMED', 'CONFIRMED'].includes(row.status),
    'Transaction is not confirmed',
    409,
  );
  return row;
}
