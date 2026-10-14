/** Explicit, private CLI integration test. Never imported by application/API code.
 * Uses disposable in-memory keys, free Testnet XLM, and a fresh retained SQLite database.
 * This verifies the real network adapter, not the Freighter browser extension.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { register, type User } from '../src/lib/auth';
import { all, closeDb, get, getDb, type Row } from '../src/lib/db';
import { action, now } from '../src/lib/service';
import { uploadSubmission } from '../src/lib/uploads';
import { createWalletChallenge, verifyWalletChallenge } from '../src/lib/stellar/wallet';
import { PASSPHRASE } from '../src/lib/stellar/config';
import { StellarRpc } from '../src/lib/stellar/rpc';
import {
  prepareChainTransaction,
  submitChainTransaction,
  reconcileChainTransaction,
} from '../src/lib/stellar/transactions';
import { projectInput, evidence } from '../tests/fixtures';

const deployment = JSON.parse(readFileSync('deployments/stellar-testnet.json', 'utf8'));
const run = new Date().toISOString().replaceAll(/[:.]/g, '-');
const directory = path.resolve('data', 'testnet-smoke', run);
mkdirSync(directory, { recursive: true, mode: 0o700 });
process.env.DATABASE_PATH = path.join(directory, 'app.sqlite');
process.env.UPLOAD_DIR = path.join(directory, 'uploads');
process.env.DEMO_MODE = 'true';
process.env.STELLAR_TESTNET_ENABLED = 'true';
process.env.STELLAR_ESCROW_CONTRACT_ID = deployment.contractId;
process.env.APP_ORIGIN = 'http://127.0.0.1:3200';
const keys = new Map<string, Keypair>();
const report: Row = {
  network: 'STELLAR_TESTNET',
  contractId: deployment.contractId,
  startedAt: new Date().toISOString(),
  database: path.relative(process.cwd(), process.env.DATABASE_PATH),
  signing: 'Disposable CLI fixture keys; real Freighter extension not exercised',
  wallets: {},
  transactions: [],
  assertions: [],
};
const save = () =>
  writeFileSync(path.join(directory, 'receipts.json'), JSON.stringify(report, null, 2));
const gateway = new StellarRpc();
const originalPrepare = gateway.prepare.bind(gateway);
gateway.prepare = async (...args) => {
  try {
    return await originalPrepare(...args);
  } catch (error) {
    console.error('RPC preparation:', error instanceof Error ? error.message : 'failed');
    throw error;
  }
};
async function account(name: string, role: User['role']) {
  const key = Keypair.random();
  const user = register({
    name,
    email: `${name.toLowerCase()}@smoke.test`,
    password: randomBytes(24).toString('base64url'),
    role: role === 'ADMIN' ? 'CLIENT' : role,
  });
  if (role === 'ADMIN') {
    getDb().prepare("UPDATE users SET role='ADMIN' WHERE id=?").run(user.id);
    user.role = 'ADMIN';
  }
  keys.set(user.id, key);
  const funded = await fetch(`https://friendbot.stellar.org/?addr=${key.publicKey()}`, {
    signal: AbortSignal.timeout(60_000),
  });
  assert(funded.ok, `Friendbot failed for ${name}: ${funded.status}`);
  const c = createWalletChallenge(user, `smoke-session-${user.id}`, key.publicKey());
  const tx = TransactionBuilder.fromXDR(c.xdr, PASSPHRASE) as Transaction;
  tx.sign(key);
  await verifyWalletChallenge(user, `smoke-session-${user.id}`, c.id, tx.toXDR());
  report.wallets[name] = key.publicKey();
  save();
  console.log(`Verified funded Testnet wallet: ${name}`);
  return user;
}
async function invoke(user: User, input: Row) {
  const prepared = await prepareChainTransaction(user, input, gateway);
  assert.equal(prepared.status, 'AWAITING_SIGNATURE');
  const tx = TransactionBuilder.fromXDR(prepared.xdr, PASSPHRASE) as Transaction;
  tx.sign(keys.get(user.id)!);
  await submitChainTransaction(user, prepared.id, tx.toXDR(), gateway);
  let result: Row = {};
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    result = await reconcileChainTransaction(prepared.id, user, gateway);
    if (['CONFIRMED', 'FAILED'].includes(result.status)) break;
  }
  assert.equal(result.status, 'CONFIRMED', `${input.method}: ${result.error || result.status}`);
  const stored = getDb()
    .prepare('SELECT escrowRef,result FROM chain_transactions WHERE id=?')
    .get(prepared.id) as Row;
  report.transactions.push({
    method: input.method,
    hash: result.txHash,
    ledger: JSON.parse(stored.result).ledger,
    escrowRef: stored.escrowRef,
    explorer: `https://stellar.expert/explorer/testnet/tx/${result.txHash}`,
  });
  save();
  console.log(`Confirmed ${input.method}: ${result.txHash}`);
  return stored.escrowRef as string;
}
async function deliver(
  worker: User,
  client: User,
  projectId: string,
  milestoneId: string,
  escrowRef: string,
) {
  action(worker, { type: 'start', projectId, milestoneId });
  await uploadSubmission(worker, {
    milestoneId,
    description: 'All agreed pages and mobile behavior documented.',
    file: {
      name: 'evidence.txt',
      type: 'text/plain',
      size: evidence.length,
      arrayBuffer: async () => Uint8Array.from(evidence).buffer,
    },
  });
  await invoke(worker, { method: 'submit_work', escrowRef, milestoneId });
  action(client, { type: 'review', projectId, milestoneId, decision: 'ACCEPT' });
}
try {
  await gateway.network();
  const client = await account('Client', 'CLIENT');
  const worker = await account('Worker', 'FREELANCER');
  const resolver = await account('Resolver', 'ADMIN');
  const replacement = await account('Replacement', 'FREELANCER');
  const base = projectInput(worker.id, now());
  const input = {
    ...base,
    financialMode: 'STELLAR_TESTNET',
    currency: 'XLM',
    resolverUserId: resolver.id,
    budgetAtomic: '30000000',
    milestones: [base.milestones[0], base.milestones[0], base.milestones[1]].map((m, i) => ({
      ...m,
      title: `Testnet milestone ${i + 1}`,
      amountAtomic: '10000000',
    })),
  };
  const { project, agreement } = action(client, input);
  for (const user of [client, worker])
    action(user, { type: 'acceptAgreement', projectId: project.id, agreementId: agreement.id });
  const escrowRef = await invoke(client, { method: 'create_agreement', agreementId: agreement.id });
  await invoke(worker, { method: 'accept_agreement', escrowRef });
  const milestones = agreement.snapshot.milestones as Row[];
  for (const m of milestones)
    await invoke(client, { method: 'fund_milestone', escrowRef, milestoneId: m.id });
  await deliver(worker, client, project.id, milestones[0].id, escrowRef);
  await invoke(client, { method: 'approve_and_release', escrowRef, milestoneId: milestones[0].id });
  assert.equal(get('milestones', milestones[0].id)!.status, 'RELEASED');
  await assert.rejects(
    prepareChainTransaction(client, {
      method: 'approve_and_release',
      escrowRef,
      milestoneId: milestones[0].id,
    }),
    /Review|accept/,
  );
  report.assertions.push('Confirmed normal release; duplicate payout rejected');
  await deliver(worker, client, project.id, milestones[1].id, escrowRef);
  await invoke(client, {
    method: 'raise_dispute',
    escrowRef,
    milestoneId: milestones[1].id,
    reason: 'Request independent review of submitted implementation.',
  });
  await assert.rejects(
    prepareChainTransaction(client, {
      method: 'approve_and_release',
      escrowRef,
      milestoneId: milestones[1].id,
    }),
    /Review|accept/,
  );
  await invoke(resolver, {
    method: 'resolve_dispute',
    escrowRef,
    milestoneId: milestones[1].id,
    release: true,
    rationale: 'Reviewed private evidence and approved original freelancer entitlement.',
  });
  report.assertions.push('Dispute blocked ordinary payout; designated resolver release confirmed');
  action(worker, { type: 'start', projectId: project.id, milestoneId: milestones[2].id });
  action(resolver, { type: 'advanceClock', hours: 73 });
  action(client, {
    type: 'intervene',
    projectId: project.id,
    reason: 'Requested a progress update after missing check-ins.',
  });
  action(client, {
    type: 'recover',
    projectId: project.id,
    reason: 'Preserve evidence and continue unfinished work with a replacement.',
  });
  const recovery = all('recoveries').find((r) => r.projectId === project.id)!;
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
  const freshRef = await invoke(client, {
    method: 'create_agreement',
    agreementId: invited.agreement.id,
  });
  await invoke(replacement, { method: 'accept_agreement', escrowRef: freshRef });
  assert.notEqual(freshRef, escrowRef);
  const old = getDb().prepare('SELECT * FROM chain_escrows WHERE id=?').get(escrowRef) as Row;
  const oldState = await gateway.read(
    old,
    'get_milestone',
    (
      getDb()
        .prepare('SELECT chainId FROM chain_milestones WHERE milestoneId=?')
        .get(milestones[2].id) as Row
    ).chainId,
  );
  assert.equal(old.freelancerAddress, keys.get(worker.id)!.publicKey());
  assert.equal(oldState.funded, '10000000');
  assert.equal(oldState.paid, '0');
  assert.equal(oldState.refunded, '0');
  report.assertions.push('Ghosting/recovery/new escrow left original funded entitlement unchanged');
  await invoke(client, {
    method: 'raise_dispute',
    escrowRef,
    milestoneId: milestones[2].id,
    reason: 'Original unfinished obligation requires explicit resolver review.',
  });
  await invoke(resolver, {
    method: 'refund_authorized',
    escrowRef,
    milestoneId: milestones[2].id,
    rationale: 'Reviewed missing work and explicitly authorized refund to the original client.',
  });
  const fresh = invited.agreement.snapshot.milestones[0];
  await invoke(client, { method: 'fund_milestone', escrowRef: freshRef, milestoneId: fresh.id });
  await deliver(replacement, client, project.id, fresh.id, freshRef);
  await invoke(client, {
    method: 'approve_and_release',
    escrowRef: freshRef,
    milestoneId: fresh.id,
  });
  const totals = (getDb().prepare('SELECT * FROM chain_milestones').all() as Row[]).reduce(
    (a, m) => ({
      funded: a.funded + BigInt(m.funded),
      paid: a.paid + BigInt(m.paid),
      refunded: a.refunded + BigInt(m.refunded),
    }),
    { funded: 0n, paid: 0n, refunded: 0n },
  );
  assert.equal(totals.funded, totals.paid + totals.refunded);
  assert.equal(all('ledger').length, 0);
  report.assertions.push(
    'Explicit refund and replacement payout confirmed; exact conservation; simulated ledger unchanged',
  );
  report.status = 'PASSED';
  report.finishedAt = new Date().toISOString();
  save();
  console.log(`Testnet smoke PASSED. Public receipts: ${path.join(directory, 'receipts.json')}`);
} catch (error) {
  report.status = 'FAILED';
  report.error = error instanceof Error ? error.message : 'Smoke failed';
  save();
  console.error(report.error);
  process.exitCode = 1;
} finally {
  keys.clear();
  closeDb();
}
