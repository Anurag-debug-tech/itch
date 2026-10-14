import { randomUUID } from 'node:crypto';
import { Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { all, get, getDb, put, transaction, type Row } from '../db';
import { assert, AppError } from '../errors';
import type { User } from '../auth';
import { completeProjectIfReady } from '../completion';
import { audit, createDispute, notify, projectFor } from '../service';
import { atomic } from './amounts';
import { chainConfig, NETWORK, PASSPHRASE } from './config';
import { chainId, commitment, walletFor } from './store';
import { nativeAsset, StellarRpc, type Receipt } from './rpc';

export type ChainMethod =
  | 'create_agreement'
  | 'accept_agreement'
  | 'fund_milestone'
  | 'submit_work'
  | 'approve_and_release'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'refund_authorized';
const methods: ChainMethod[] = [
  'create_agreement',
  'accept_agreement',
  'fund_milestone',
  'submit_work',
  'approve_and_release',
  'raise_dispute',
  'resolve_dispute',
  'refund_authorized',
];
const stamp = () => new Date().toISOString(); // Actual wall clock, never the administrator demo clock.
const json = (value: unknown) => JSON.stringify(value);
const one = (sql: string, ...args: (string | number)[]) =>
  getDb()
    .prepare(sql)
    .get(...args) as Row | undefined;
export const submissionCommitment = (s: Row, e: Row) =>
  commitment({ agreement: e.termsHash, submissionId: s.id, version: s.version, fileHash: s.hash });
function escrowForCreation(user: User, agreementId: string) {
  const config = chainConfig();
  const a = get('agreements', agreementId);
  assert(a, 'Agreement not found', 404);
  const p = projectFor(user, a.projectId);
  assert(p.financialMode === 'STELLAR_TESTNET', 'Choose a Testnet project');
  assert(
    p.clientId === user.id &&
      p.status === 'ACTIVE' &&
      a.status === 'ACTIVE' &&
      a.snapshot.project.clientId === p.clientId &&
      a.snapshot.project.freelancerId === p.freelancerId &&
      !all('agreements').some(
        (v) =>
          v.projectId === p.id && v.version > a.version && ['PENDING', 'ACTIVE'].includes(v.status),
      ),
    'Both application parties must accept the current agreement first',
    409,
  );
  const prior = one('SELECT * FROM chain_escrows WHERE agreementId=?', a.id);
  if (prior) return prior;
  const client = walletFor(p.clientId),
    worker = walletFor(p.freelancerId),
    resolver = walletFor(p.resolverUserId);
  assert(
    client && worker && resolver,
    'Client, freelancer and designated resolver must verify their Testnet wallets',
    409,
  );
  assert(
    new Set([client.address, worker.address, resolver.address]).size === 3,
    'Three independent wallets are required',
  );
  const specs = a.snapshot.milestones.map((m: Row) => ({
    milestoneId: m.id,
    chainId: chainId(m.id),
    amount: atomic(m.amountAtomic),
  }));
  const id = randomUUID(),
    escrowId = chainId(a.id),
    assetId = nativeAsset();
  const termsHash = commitment({
    network: NETWORK,
    contract: config.contractId,
    asset: assetId,
    client: client.address,
    freelancer: worker.address,
    resolver: resolver.address,
    agreement: a.snapshot,
  });
  transaction(() => {
    getDb()
      .prepare('INSERT INTO chain_escrows VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        id,
        p.id,
        a.id,
        NETWORK,
        config.contractId,
        escrowId,
        termsHash,
        client.address,
        worker.address,
        resolver.address,
        assetId,
        'CREATED',
        stamp(),
        json({
          accepted: false,
          assetDecimals: 7,
          clientUserId: p.clientId,
          freelancerUserId: p.freelancerId,
          resolverUserId: p.resolverUserId,
        }),
      );
    for (const m of specs)
      getDb()
        .prepare(
          'INSERT INTO chain_milestones(escrowRef,milestoneId,chainId,amount) VALUES (?,?,?,?)',
        )
        .run(id, m.milestoneId, m.chainId, m.amount);
  });
  return one('SELECT * FROM chain_escrows WHERE id=?', id)!;
}
export async function prepareChainTransaction(user: User, input: Row, gateway = new StellarRpc()) {
  const method = input.method as ChainMethod;
  assert(methods.includes(method), 'Unsupported blockchain operation');
  const e =
    method === 'create_agreement'
      ? escrowForCreation(user, String(input.agreementId))
      : one('SELECT * FROM chain_escrows WHERE id=?', String(input.escrowRef));
  assert(e, 'Create the on-chain agreement first', 409);
  const p = projectFor(user, e.projectId),
    config = chainConfig();
  assert(
    e.network === NETWORK && e.contractId === config.contractId && e.assetId === nativeAsset(),
    'Escrow configuration changed. Restore its original Testnet contract before continuing.',
    409,
  );
  const wallet = walletFor(user.id);
  assert(wallet, 'Verify your Testnet wallet first', 409);
  const m = input.milestoneId
    ? one(
        'SELECT * FROM chain_milestones WHERE escrowRef=? AND milestoneId=?',
        e.id,
        String(input.milestoneId),
      )
    : undefined;
  const expected: Row = { actor: wallet.address, termsHash: e.termsHash };
  if (method === 'create_agreement') {
    assert(wallet.address === e.clientAddress, 'The fixed client wallet must sign', 403);
    expected.milestones = getDb()
      .prepare(
        'SELECT milestoneId,chainId,amount FROM chain_milestones WHERE escrowRef=? ORDER BY rowid',
      )
      .all(e.id);
  } else if (method === 'accept_agreement') {
    assert(wallet.address === e.freelancerAddress, 'The fixed freelancer wallet must sign', 403);
    assert(e.state !== 'CREATED', 'Confirm agreement creation first', 409);
  } else {
    assert(m, 'Milestone not found', 404);
    expected.chainId = m.chainId;
    expected.amount = m.amount;
    const local = get('milestones', m.milestoneId)!;
    assert(
      ['create_agreement', 'accept_agreement'].includes(method) || e.state === 'ACTIVE',
      'Confirm freelancer acceptance first',
      409,
    );
    if (['fund_milestone', 'approve_and_release'].includes(method))
      assert(
        user.id === p.clientId && wallet.address === e.clientAddress,
        'Fixed client wallet required',
        403,
      );
    if (method === 'fund_milestone')
      assert(
        m.state === 'AwaitingFunding' && !local.archived && p.status === 'ACTIVE',
        'Milestone cannot be funded',
        409,
      );
    if (method === 'submit_work')
      assert(
        local.assignedFreelancerId === user.id &&
          wallet.address === e.freelancerAddress &&
          !local.archived &&
          p.status === 'ACTIVE',
        'Assigned freelancer wallet required',
        403,
      );
    if (method === 'submit_work' || method === 'approve_and_release') {
      const s = all('submissions')
        .filter((s) => s.milestoneId === m.milestoneId)
        .sort((a, b) => b.version - a.version)[0];
      assert(s, 'Upload a deliverable first', 409);
      expected.submissionId = s.id;
      expected.submissionHash = submissionCommitment(s, e);
      if (method === 'submit_work')
        assert(['Funded', 'Submitted'].includes(m.state), 'Funded undisputed work required', 409);
      if (method === 'approve_and_release')
        assert(
          local.status === 'ACCEPTED' &&
            local.acceptedSubmissionId === s.id &&
            m.state === 'Submitted' &&
            m.submissionHash === expected.submissionHash &&
            !local.archived,
          'Review and accept the committed deliverable first',
          409,
        );
    }
    if (method === 'raise_dispute') {
      assert(
        (user.id === p.clientId && wallet.address === e.clientAddress) ||
          (user.id === local.assignedFreelancerId && wallet.address === e.freelancerAddress),
        'Original dispute party wallet required',
        403,
      );
      assert(
        ['Funded', 'Submitted'].includes(m.state),
        'Only unsettled funded work can be disputed',
        409,
      );
      assert(
        typeof input.reason === 'string' &&
          input.reason.trim().length >= 10 &&
          input.reason.length <= 3000,
        'Describe the dispute in 10–3000 characters',
      );
      expected.reason = input.reason.trim();
    }
    if (method === 'resolve_dispute' || method === 'refund_authorized') {
      assert(
        user.role === 'ADMIN' && wallet.address === e.resolverAddress,
        'The designated resolver wallet must authorize settlement',
        403,
      );
      assert(m.state === 'Disputed', 'Confirmed on-chain dispute required', 409);
      assert(
        typeof input.rationale === 'string' &&
          input.rationale.trim().length >= 10 &&
          input.rationale.length <= 3000,
        'Record a settlement rationale',
      );
      expected.rationale = input.rationale.trim();
      expected.release = method === 'resolve_dispute' && input.release === true;
    }
  }
  const op = `${NETWORK}:${e.contractId}:${e.escrowId}:${method}:${m?.chainId || ''}:${expected.submissionHash || ''}`;
  const id = transaction(() => {
    const prior = one(
      "SELECT * FROM chain_transactions WHERE operationKey=? AND status NOT IN ('FAILED','EXPIRED')",
      op,
    );
    if (prior) {
      assert(prior.userId === user.id, 'This operation already has a pending signer', 409);
      return { id: prior.id, created: false };
    }
    // A conventional account has one sequence stream across projects/tabs. Reserve it
    // within the same SQLite write lock so parallel intents cannot share a sequence.
    const other = one(
      "SELECT id FROM chain_transactions WHERE network=? AND json_extract(expected,'$.actor')=? AND status NOT IN ('CONFIRMED','FAILED','EXPIRED') LIMIT 1",
      NETWORK,
      wallet.address,
    );
    assert(!other, 'Finish or reconcile the pending transaction for this wallet first', 409);
    const id = randomUUID();
    getDb()
      .prepare(
        'INSERT INTO chain_transactions(id,userId,projectId,escrowRef,milestoneId,network,contractId,method,operationKey,status,expected,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        user.id,
        e.projectId,
        e.id,
        m?.milestoneId || null,
        NETWORK,
        e.contractId,
        method,
        op,
        'CREATED',
        json(expected),
        stamp(),
        stamp(),
      );
    return { id, created: true };
  });
  const existing = one('SELECT * FROM chain_transactions WHERE id=?', id.id)!;
  if (!id.created) return publicAttempt(existing);
  try {
    const prepared = await gateway.prepare(wallet.address, method, e, expected);
    getDb()
      .prepare(
        "UPDATE chain_transactions SET status='AWAITING_SIGNATURE',xdr=?,txHash=?,expiresAt=?,updatedAt=? WHERE id=? AND status='CREATED'",
      )
      .run(prepared.xdr, prepared.hash, prepared.expiresAt, stamp(), id.id);
    return publicAttempt(one('SELECT * FROM chain_transactions WHERE id=?', id.id)!);
  } catch (error) {
    getDb()
      .prepare(
        "UPDATE chain_transactions SET status='FAILED',error=?,updatedAt=? WHERE id=? AND status='CREATED'",
      )
      .run(
        'Transaction preparation failed. Check wallet funding, contract configuration and RPC availability.',
        stamp(),
        id.id,
      );
    if (error instanceof AppError) throw error;
    throw new AppError(
      'Stellar preparation failed. Check that your Testnet account is funded and retry.',
      502,
    );
  }
}
export function publicAttempt(row: Row) {
  return {
    id: row.id,
    method: row.method,
    status: row.status,
    xdr: row.status === 'AWAITING_SIGNATURE' ? row.xdr : undefined,
    txHash: row.txHash,
    error: row.error,
    network: NETWORK,
    networkPassphrase: PASSPHRASE,
    expiresAt: row.expiresAt,
  };
}
export function resumeChainTransaction(user: User, id: string) {
  const row = one('SELECT * FROM chain_transactions WHERE id=?', id);
  assert(row && row.userId === user.id, 'Transaction not found', 404);
  assert(
    row.status === 'AWAITING_SIGNATURE' && row.expiresAt > Date.now(),
    'This transaction is not awaiting a valid wallet signature. Reconcile it first.',
    409,
  );
  return publicAttempt(row);
}
export async function submitChainTransaction(
  user: User,
  id: string,
  signedXdr: string,
  gateway = new StellarRpc(),
) {
  const t = one('SELECT * FROM chain_transactions WHERE id=?', id);
  assert(t && t.userId === user.id, 'Transaction not found', 404);
  if (t.status !== 'AWAITING_SIGNATURE') return publicAttempt(t);
  assert(typeof signedXdr === 'string' && signedXdr.length <= 90_000, 'Invalid signed transaction');
  let signed: Transaction;
  try {
    const parsed = TransactionBuilder.fromXDR(signedXdr, PASSPHRASE);
    assert(parsed instanceof Transaction, 'Only standard transaction envelopes are supported');
    signed = parsed;
  } catch {
    throw new AppError('Invalid signed transaction envelope');
  }
  const expected = JSON.parse(t.expected);
  assert(
    Buffer.from(signed.hash()).toString('hex') === t.txHash && signed.source === expected.actor,
    'Signed transaction differs from the prepared intent',
    409,
  );
  assert(
    signed.signatures.some((signature) =>
      Keypair.fromPublicKey(expected.actor).verify(signed.hash(), signature.signature.toBytes()),
    ),
    'Expected wallet signature missing',
    403,
  );
  assert(
    walletFor(user.id)?.address === expected.actor,
    'Reconnect the original signing wallet',
    409,
  );
  if (Date.now() > t.expiresAt) {
    // The wallet may have broadcast outside this tab before the API received its signature.
    // Prove the network outcome before allowing this operation to be prepared again.
    return reconcileChainTransaction(id, user, gateway);
  }
  const changed = getDb()
    .prepare(
      "UPDATE chain_transactions SET status='SIGNED',signedXdr=?,updatedAt=? WHERE id=? AND status='AWAITING_SIGNATURE'",
    )
    .run(signedXdr, stamp(), id);
  if (!changed.changes)
    return publicAttempt(one('SELECT * FROM chain_transactions WHERE id=?', id)!);
  getDb()
    .prepare("UPDATE chain_transactions SET status='SUBMITTED',updatedAt=? WHERE id=?")
    .run(stamp(), id);
  try {
    const sent = await gateway.send(signedXdr);
    assert(sent.hash === t.txHash, 'RPC returned an unexpected transaction hash', 502);
    const state = sent.status === 'ERROR' ? 'RECONCILIATION_REQUIRED' : 'PENDING';
    getDb()
      .prepare('UPDATE chain_transactions SET status=?,error=?,updatedAt=? WHERE id=?')
      .run(
        state,
        sent.status === 'ERROR'
          ? 'RPC rejected submission; reconcile before another attempt.'
          : null,
        stamp(),
        id,
      );
  } catch {
    getDb()
      .prepare(
        "UPDATE chain_transactions SET status='RECONCILIATION_REQUIRED',error=?,updatedAt=? WHERE id=?",
      )
      .run(
        'Submission outcome uncertain. Reconcile this transaction before retrying.',
        stamp(),
        id,
      );
  }
  return publicAttempt(one('SELECT * FROM chain_transactions WHERE id=?', id)!);
}

const actions: Record<string, string> = {
  create_agreement: 'created',
  accept_agreement: 'accepted',
  fund_milestone: 'funded',
  submit_work: 'submitted',
  approve_and_release: 'released',
  raise_dispute: 'disputed',
  refund_authorized: 'resolved_refund',
};
export function validateReceipt(t: Row, e: Row, receipt: Receipt) {
  const expected = JSON.parse(t.expected);
  const action =
    t.method === 'resolve_dispute'
      ? expected.release
        ? 'resolved_pay'
        : 'resolved_refund'
      : actions[t.method];
  assert(
    receipt.status === 'SUCCESS' &&
      receipt.hash === t.txHash &&
      receipt.envelopeHash === t.txHash &&
      Number.isSafeInteger(receipt.ledger) &&
      receipt.ledger! > 0,
    'Transaction execution could not be verified',
    502,
  );
  assert(
    receipt.events?.some(
      (event: any) =>
        event.topics[0] === 'escrow' &&
        event.topics[1] === e.escrowId &&
        (!expected.chainId || event.topics[2] === expected.chainId) &&
        event.data.action === action,
    ),
    'Expected escrow event missing',
    502,
  );
}
export function applyConfirmation(
  t: Row,
  e: Row,
  receipt: Receipt,
  chainAgreement: Row,
  states: Row[],
) {
  validateReceipt(t, e, receipt);
  assert(
    chainAgreement.client === e.clientAddress &&
      chainAgreement.freelancer === e.freelancerAddress &&
      chainAgreement.resolver === e.resolverAddress &&
      chainAgreement.token === e.assetId &&
      chainAgreement.terms_hash === e.termsHash,
    'Contract parties or commitment do not match',
    502,
  );
  transaction(() => {
    if (one("SELECT id FROM chain_transactions WHERE id=? AND status='CONFIRMED'", t.id)) return;
    const expected = JSON.parse(t.expected);
    const rows = getDb()
      .prepare('SELECT * FROM chain_milestones WHERE escrowRef=? ORDER BY rowid')
      .all(e.id) as Row[];
    assert(
      states.length === rows.length &&
        chainAgreement.milestones.length === rows.length &&
        rows.every((r) => chainAgreement.milestones.includes(r.chainId)),
      'Contract milestone set changed',
      502,
    );
    for (let i = 0; i < rows.length; i++) {
      const m = states[i],
        row = rows[i];
      for (const field of ['amount', 'funded', 'paid', 'refunded'])
        atomic(m[field], field !== 'amount');
      assert(
        m.amount === row.amount &&
          BigInt(m.paid) + BigInt(m.refunded) <= BigInt(m.funded) &&
          BigInt(m.funded) <= BigInt(m.amount),
        'Invalid confirmed token accounting',
        502,
      );
      assert(
        BigInt(m.funded) >= BigInt(row.funded) &&
          BigInt(m.paid) >= BigInt(row.paid) &&
          BigInt(m.refunded) >= BigInt(row.refunded),
        'Stale chain state. Reconcile again.',
        409,
      );
      const state = Array.isArray(m.state) ? m.state[0] : m.state;
      assert(
        ['AwaitingFunding', 'Funded', 'Submitted', 'Disputed', 'Paid', 'Refunded'].includes(state),
        'Unknown escrow state',
        502,
      );
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i],
        m = states[i],
        state = Array.isArray(m.state) ? m.state[0] : m.state;
      getDb()
        .prepare(
          'UPDATE chain_milestones SET funded=?,paid=?,refunded=?,state=?,submissionHash=? WHERE escrowRef=? AND milestoneId=?',
        )
        .run(m.funded, m.paid, m.refunded, state, m.submission_hash, e.id, row.milestoneId);
      const local = get('milestones', row.milestoneId)!,
        p = get('projects', e.projectId)!;
      if (
        state === 'Disputed' &&
        !all('disputes').some((d) => d.milestoneId === local.id && d.status === 'OPEN')
      )
        createDispute(
          p,
          local,
          t.userId,
          expected.reason || 'Dispute confirmed on Stellar Testnet.',
        );
      if (!local.archived && p.status === 'ACTIVE') {
        if (state === 'Funded' && ['AWAITING_FUNDING', 'AWAITING_AGREEMENT'].includes(local.status))
          local.status = 'READY_TO_START';
        if (state === 'Submitted' && local.status !== 'ACCEPTED') local.status = 'SUBMITTED';
      }
      if (state === 'Paid' || state === 'Refunded') {
        local.status = state === 'Paid' ? 'RELEASED' : 'REFUNDED';
        for (const d of all('disputes').filter(
          (d) => d.milestoneId === local.id && d.status === 'OPEN',
        )) {
          Object.assign(d, {
            status: 'RESOLVED',
            outcome: state === 'Paid' ? 'RELEASE' : 'REFUND',
            rationale: expected.rationale || 'Authorized on-chain settlement',
            resolvedBy: t.userId,
            resolvedAt: stamp(),
            transactionHash: t.txHash,
          });
          put('disputes', d);
        }
      }
      if (state === 'Disputed') local.status = 'DISPUTED';
      local.paymentStatus =
        state === 'Paid'
          ? 'RELEASED'
          : state === 'Refunded'
            ? 'REFUNDED'
            : state === 'Disputed'
              ? 'BLOCKED'
              : m.funded !== '0'
                ? 'FUNDED'
                : 'UNFUNDED';
      put('milestones', local);
    }
    getDb()
      .prepare('UPDATE chain_escrows SET state=?,data=? WHERE id=?')
      .run(
        chainAgreement.accepted ? 'ACTIVE' : 'CREATED_ON_CHAIN',
        json({ ...JSON.parse(e.data), accepted: chainAgreement.accepted }),
        e.id,
      );
    for (const [index, event] of (receipt.events || []).entries())
      getDb()
        .prepare('INSERT OR IGNORE INTO chain_events VALUES (?,?,?,?,?,?,?)')
        .run(
          NETWORK,
          t.txHash,
          index,
          e.contractId,
          receipt.ledger!,
          json(event.topics),
          json(event.data),
        );
    getDb()
      .prepare('INSERT INTO chain_confirmations VALUES (?,?,?,?,?,?)')
      .run(
        t.id,
        NETWORK,
        t.txHash,
        receipt.ledger!,
        stamp(),
        json({ agreement: chainAgreement, milestones: states }),
      );
    getDb()
      .prepare(
        "UPDATE chain_transactions SET status='CONFIRMED',result=?,error=NULL,updatedAt=? WHERE id=?",
      )
      .run(json({ ledger: receipt.ledger }), stamp(), t.id);
    getDb()
      .prepare(
        'INSERT INTO chain_sync VALUES (?,?,?,?) ON CONFLICT(network,contractId) DO UPDATE SET lastLedger=MAX(lastLedger,excluded.lastLedger),updatedAt=excluded.updatedAt',
      )
      .run(NETWORK, e.contractId, receipt.ledger!, stamp());
    const p = get('projects', e.projectId)!;
    completeProjectIfReady(p.id);
    audit(p.id, t.userId, 'STELLAR_TRANSACTION_CONFIRMED', {
      method: t.method,
      transactionHash: t.txHash,
      ledger: receipt.ledger,
    });
    notify(p, `Testnet transaction confirmed: ${t.method}. No real money. ${t.txHash}`);
  });
}
export async function reconcileChainTransaction(
  id: string,
  user?: User,
  gateway = new StellarRpc(),
) {
  const t = one('SELECT * FROM chain_transactions WHERE id=?', id);
  assert(t, 'Transaction not found', 404);
  if (user) projectFor(user, t.projectId);
  if (['CONFIRMED', 'FAILED', 'EXPIRED'].includes(t.status)) return publicAttempt(t);
  if (t.status === 'CREATED') {
    if (Date.now() - Date.parse(t.createdAt) > 60_000)
      getDb()
        .prepare(
          "UPDATE chain_transactions SET status='FAILED',error='Preparation interrupted; prepare again.',updatedAt=? WHERE id=? AND status='CREATED'",
        )
        .run(stamp(), id);
    return publicAttempt(one('SELECT * FROM chain_transactions WHERE id=?', id)!);
  }
  if (t.status === 'AWAITING_SIGNATURE' && Date.now() <= t.expiresAt) return publicAttempt(t);
  const e = one('SELECT * FROM chain_escrows WHERE id=?', t.escrowRef)!;
  assert(
    e.contractId === gateway.config.contractId && t.network === NETWORK,
    'Restore the original Testnet configuration to reconcile',
    409,
  );
  try {
    const receipt = await gateway.receipt(t.txHash);
    assert(receipt.hash === t.txHash, 'RPC returned a different transaction receipt', 502);
    if (receipt.status === 'FAILED')
      getDb()
        .prepare(
          "UPDATE chain_transactions SET status='FAILED',error=?,updatedAt=? WHERE id=? AND status<>'CONFIRMED'",
        )
        .run(receipt.error || 'Network execution failed', stamp(), id);
    else if (receipt.status === 'NOT_FOUND') {
      // Same signed envelope/hash may be safely re-submitted. Never build another financial intent.
      if (t.signedXdr && Date.now() < t.expiresAt) await gateway.send(t.signedXdr);
      const expired = Date.now() > t.expiresAt;
      const provenAbsent =
        expired &&
        Number.isFinite(receipt.oldestLedgerCloseTime) &&
        Number.isFinite(receipt.latestLedgerCloseTime) &&
        receipt.oldestLedgerCloseTime! * 1000 <= Date.parse(t.createdAt) &&
        receipt.latestLedgerCloseTime! * 1000 > t.expiresAt;
      getDb()
        .prepare(
          "UPDATE chain_transactions SET status=?,error=?,updatedAt=? WHERE id=? AND status<>'CONFIRMED'",
        )
        .run(
          provenAbsent ? 'EXPIRED' : expired ? 'RECONCILIATION_REQUIRED' : 'PENDING',
          provenAbsent
            ? 'Network history covers this intent through expiry without execution. A fresh attempt is safe.'
            : expired
              ? 'Receipt history cannot prove non-execution. Preserve this intent and reconcile before retrying.'
              : null,
          stamp(),
          id,
        );
    } else {
      validateReceipt(t, e, receipt);
      const a = await gateway.read(e, 'get_agreement');
      const ms = getDb()
        .prepare('SELECT chainId FROM chain_milestones WHERE escrowRef=? ORDER BY rowid')
        .all(e.id) as Row[];
      const states: Row[] = [];
      for (const m of ms) states.push(await gateway.read(e, 'get_milestone', m.chainId));
      applyConfirmation(t, e, receipt, a, states);
    }
  } catch (error) {
    getDb()
      .prepare(
        "UPDATE chain_transactions SET status='RECONCILIATION_REQUIRED',error=?,updatedAt=? WHERE id=? AND status<>'CONFIRMED'",
      )
      .run(
        error instanceof AppError
          ? error.message
          : 'RPC confirmation unavailable. No financial state changed.',
        stamp(),
        id,
      );
  }
  return publicAttempt(one('SELECT * FROM chain_transactions WHERE id=?', id)!);
}
export async function reconcilePending() {
  const rows = getDb()
    .prepare(
      "SELECT id FROM chain_transactions WHERE status NOT IN ('CONFIRMED','FAILED','EXPIRED') ORDER BY createdAt LIMIT 30",
    )
    .all() as Row[];
  const results = [];
  for (const row of rows) results.push(await reconcileChainTransaction(row.id));
  return results;
}
