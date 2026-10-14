import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  Account,
  Contract,
  Keypair,
  StrKey,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { closeDb, getDb, get, put, all, type Row } from '../src/lib/db';
import { register, type User } from '../src/lib/auth';
import { action, bootstrap, now } from '../src/lib/service';
import { projectInput } from './fixtures';
import { chainConfig, PASSPHRASE } from '../src/lib/stellar/config';
import { chainId } from '../src/lib/stellar/store';
import { contractArgs, StellarRpc, type Receipt } from '../src/lib/stellar/rpc';
import {
  prepareChainTransaction,
  submitChainTransaction,
  reconcileChainTransaction,
} from '../src/lib/stellar/transactions';

let directory: string,
  client: User,
  worker: User,
  admin: User,
  replacement: User,
  keys: Map<string, Keypair>,
  project: Row,
  agreement: Row,
  gateway: StellarRpc,
  remoteAccepted: boolean,
  remoteStates: Map<string, Row>;
const query = (sql: string, ...args: string[]) =>
  getDb()
    .prepare(sql)
    .get(...args) as Row;
beforeEach(() => {
  closeDb();
  directory = mkdtempSync(path.join(tmpdir(), 'mg-transactions-'));
  process.env.DATABASE_PATH = path.join(directory, 'db.sqlite');
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.DEMO_MODE = 'true';
  process.env.STELLAR_TESTNET_ENABLED = 'true';
  process.env.STELLAR_ESCROW_CONTRACT_ID = StrKey.encodeContract(new Uint8Array(32).fill(8));
  const account = (name: string, role = 'CLIENT') =>
    register({
      name,
      email: name.toLowerCase() + '@example.test',
      password: 'SecureTest123!',
      role,
    });
  client = account('Client');
  worker = account('Worker', 'FREELANCER');
  replacement = account('Replacement', 'FREELANCER');
  admin = account('Resolver');
  getDb().prepare("UPDATE users SET role='ADMIN' WHERE id=?").run(admin.id);
  admin.role = 'ADMIN';
  keys = new Map();
  for (const user of [client, worker, admin, replacement]) {
    const key = Keypair.random();
    keys.set(user.id, key);
    getDb()
      .prepare('INSERT INTO wallet_links VALUES (?,?,?,?,?,NULL)')
      .run(user.id, user.id, 'STELLAR_TESTNET', key.publicKey(), new Date().toISOString());
  }
  const input = projectInput(worker.id, now());
  const created = action(client, {
    ...input,
    financialMode: 'STELLAR_TESTNET',
    currency: 'XLM',
    resolverUserId: admin.id,
    budgetAtomic: '20000000',
    milestones: input.milestones.map((m) => ({ ...m, amountAtomic: '10000000' })),
  });
  project = created.project;
  agreement = created.agreement;
  for (const user of [client, worker])
    action(user, { type: 'acceptAgreement', projectId: project.id, agreementId: agreement.id });
  remoteAccepted = false;
  remoteStates = new Map();
  gateway = {
    config: chainConfig(),
    prepare: vi.fn(async (address: string, method: string, e: Row, expected: Row) => {
      const tx = new TransactionBuilder(new Account(address, '100'), {
        fee: '100',
        networkPassphrase: PASSPHRASE,
      })
        .addOperation(new Contract(e.contractId).call(method, ...contractArgs(method, e, expected)))
        .setTimeout(180)
        .build();
      return {
        xdr: tx.toXDR(),
        hash: Buffer.from(tx.hash()).toString('hex'),
        expiresAt: Number(tx.timeBounds!.maxTime) * 1000,
      };
    }),
    send: vi.fn(async (xdr: string) => {
      const tx = TransactionBuilder.fromXDR(xdr, PASSPHRASE);
      const hash = Buffer.from(tx.hash()).toString('hex');
      expect(query('SELECT status FROM chain_transactions WHERE txHash=?', hash).status).toMatch(
        /SUBMITTED|PENDING|RECONCILIATION_REQUIRED/,
      );
      return { status: 'PENDING', hash };
    }),
    receipt: vi.fn(),
    read: vi.fn(async (e: Row, method: string, id?: string) =>
      method === 'get_agreement'
        ? {
            client: e.clientAddress,
            freelancer: e.freelancerAddress,
            resolver: e.resolverAddress,
            token: e.assetId,
            terms_hash: e.termsHash,
            accepted: remoteAccepted,
            milestones: (
              getDb()
                .prepare('SELECT chainId FROM chain_milestones WHERE escrowRef=? ORDER BY rowid')
                .all(e.id) as Row[]
            ).map((m) => m.chainId),
          }
        : remoteStates.get(id!) || {
            amount: '10000000',
            funded: '0',
            paid: '0',
            refunded: '0',
            state: ['AwaitingFunding'],
            submission_hash: '0'.repeat(64),
          },
    ),
  } as unknown as StellarRpc;
});
afterEach(() => {
  closeDb();
  rmSync(directory, { recursive: true, force: true });
  delete process.env.STELLAR_TESTNET_ENABLED;
  delete process.env.STELLAR_ESCROW_CONTRACT_ID;
});
async function send(user: User, input: Row) {
  const prepared = await prepareChainTransaction(user, input, gateway);
  const tx = TransactionBuilder.fromXDR(prepared.xdr, PASSPHRASE) as Transaction;
  tx.sign(keys.get(user.id)!);
  await submitChainTransaction(user, prepared.id, tx.toXDR(), gateway);
  return query('SELECT * FROM chain_transactions WHERE id=?', prepared.id);
}
function receipt(t: Row, actionName: string): Receipt {
  const e = query('SELECT * FROM chain_escrows WHERE id=?', t.escrowRef),
    expected = JSON.parse(t.expected);
  return {
    status: 'SUCCESS',
    hash: t.txHash,
    envelopeHash: t.txHash,
    ledger: 123,
    events: [
      {
        topics: [
          'escrow',
          e.escrowId,
          expected.chainId || chainId(agreement.snapshot.milestones[0].id),
        ],
        data: { action: actionName },
      },
    ],
  };
}
async function confirm(t: Row, actionName: string) {
  vi.mocked(gateway.receipt).mockResolvedValue(receipt(t, actionName));
  return reconcileChainTransaction(t.id, client, gateway);
}
async function activeEscrow() {
  const c = await send(client, { method: 'create_agreement', agreementId: agreement.id });
  await confirm(c, 'created');
  const a = await send(worker, { method: 'accept_agreement', escrowRef: c.escrowRef });
  remoteAccepted = true;
  await confirm(a, 'accepted');
  return query('SELECT * FROM chain_escrows WHERE id=?', c.escrowRef);
}
it('persists intent before wallet authorization and does not move simulated funds', async () => {
  const t = await prepareChainTransaction(
    client,
    { method: 'create_agreement', agreementId: agreement.id },
    gateway,
  );
  expect(t.status).toBe('AWAITING_SIGNATURE');
  expect(
    query('SELECT txHash,signedXdr FROM chain_transactions WHERE id=?', t.id).signedXdr,
  ).toBeNull();
  expect(all('ledger')).toHaveLength(0);
  expect(vi.mocked(gateway.send)).not.toHaveBeenCalled();
});
it('rejects stale agreement creation while a newer mutual amendment is pending', async () => {
  action(client, {
    type: 'amend',
    projectId: project.id,
    scope: 'A revised mutually reviewed responsive scope.',
    reason: 'Clarify the agreed scope before any escrow is created.',
  });
  await expect(
    prepareChainTransaction(
      client,
      { method: 'create_agreement', agreementId: agreement.id },
      gateway,
    ),
  ).rejects.toThrow(/current agreement/);
  expect(query('SELECT count(*) AS n FROM chain_escrows').n).toBe(0);
  expect(vi.mocked(gateway.prepare)).not.toHaveBeenCalled();
});
it('deduplicates concurrent preparations and repeated submissions', async () => {
  const input = { method: 'create_agreement', agreementId: agreement.id };
  const [a, b] = await Promise.all([
    prepareChainTransaction(client, input, gateway),
    prepareChainTransaction(client, input, gateway),
  ]);
  expect(a.id).toBe(b.id);
  expect(vi.mocked(gateway.prepare)).toHaveBeenCalledTimes(1);
  const tx = TransactionBuilder.fromXDR(a.xdr, PASSPHRASE) as Transaction;
  tx.sign(keys.get(client.id)!);
  await Promise.all([
    submitChainTransaction(client, a.id, tx.toXDR(), gateway),
    submitChainTransaction(client, a.id, tx.toXDR(), gateway),
  ]);
  expect(vi.mocked(gateway.send)).toHaveBeenCalledTimes(1);
});
it('rejects modified envelopes and missing wallet signatures', async () => {
  const a = await prepareChainTransaction(
    client,
    { method: 'create_agreement', agreementId: agreement.id },
    gateway,
  );
  await expect(submitChainTransaction(client, a.id, a.xdr, gateway)).rejects.toThrow(/signature/);
  const different = new TransactionBuilder(new Account(keys.get(client.id)!.publicKey(), '100'), {
    fee: '200',
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(
      new Contract(process.env.STELLAR_ESCROW_CONTRACT_ID!).call(
        'get_agreement',
        ...contractArgs('accept_agreement', query('SELECT * FROM chain_escrows LIMIT 1'), {}).slice(
          0,
          1,
        ),
      ),
    )
    .setTimeout(180)
    .build();
  different.sign(keys.get(client.id)!);
  await expect(submitChainTransaction(client, a.id, different.toXDR(), gateway)).rejects.toThrow(
    /differs/,
  );
  expect(vi.mocked(gateway.send)).not.toHaveBeenCalled();
});
it('serializes different milestone intents using the same wallet sequence stream', async () => {
  const e = await activeEscrow();
  const [first, second] = agreement.snapshot.milestones;
  await prepareChainTransaction(
    client,
    { method: 'fund_milestone', escrowRef: e.id, milestoneId: first.id },
    gateway,
  );
  await expect(
    prepareChainTransaction(
      client,
      { method: 'fund_milestone', escrowRef: e.id, milestoneId: second.id },
      gateway,
    ),
  ).rejects.toThrow(/pending transaction for this wallet/);
  expect(
    query("SELECT count(*) AS n FROM chain_transactions WHERE status='AWAITING_SIGNATURE'").n,
  ).toBe(1);
});
it('keeps pending operations out of the confirmed read model', async () => {
  const t = await send(client, { method: 'create_agreement', agreementId: agreement.id });
  vi.mocked(gateway.receipt).mockResolvedValue({ status: 'NOT_FOUND', hash: t.txHash });
  await reconcileChainTransaction(t.id, client, gateway);
  expect(query('SELECT count(*) AS n FROM chain_confirmations').n).toBe(0);
  expect(query('SELECT funded FROM chain_milestones LIMIT 1').funded).toBe('0');
});
it('reconciles successful receipts once and resumes from persistent storage', async () => {
  const t = await send(client, { method: 'create_agreement', agreementId: agreement.id });
  closeDb();
  await confirm(t, 'created');
  await confirm(t, 'created');
  expect(query('SELECT count(*) AS n FROM chain_confirmations').n).toBe(1);
  expect(query('SELECT count(*) AS n FROM chain_events').n).toBe(1);
  expect(query('SELECT state FROM chain_escrows').state).toBe('CREATED_ON_CHAIN');
});
it('does not confirm a mismatched network receipt/event', async () => {
  const t = await send(client, { method: 'create_agreement', agreementId: agreement.id });
  const bad = receipt(t, 'released');
  vi.mocked(gateway.receipt).mockResolvedValue(bad);
  expect((await reconcileChainTransaction(t.id, client, gateway)).status).toBe(
    'RECONCILIATION_REQUIRED',
  );
  expect(query('SELECT count(*) AS n FROM chain_confirmations').n).toBe(0);
});
it('records failed execution without changing balances', async () => {
  const t = await send(client, { method: 'create_agreement', agreementId: agreement.id });
  vi.mocked(gateway.receipt).mockResolvedValue({ status: 'FAILED', hash: t.txHash });
  expect((await reconcileChainTransaction(t.id, client, gateway)).status).toBe('FAILED');
  expect(query('SELECT funded FROM chain_milestones LIMIT 1').funded).toBe('0');
});
it('does not expire an uncertain signed attempt without sufficient network history', async () => {
  const t = await send(client, { method: 'create_agreement', agreementId: agreement.id });
  getDb()
    .prepare('UPDATE chain_transactions SET expiresAt=? WHERE id=?')
    .run(Date.now() - 1, t.id);
  vi.mocked(gateway.receipt).mockResolvedValue({ status: 'NOT_FOUND', hash: t.txHash });
  expect((await reconcileChainTransaction(t.id, client, gateway)).status).toBe(
    'RECONCILIATION_REQUIRED',
  );
  expect(query('SELECT count(*) AS n FROM chain_confirmations').n).toBe(0);
});
it('allows expiry only when retained network history proves absence through the deadline', async () => {
  const t = await send(client, { method: 'create_agreement', agreementId: agreement.id });
  getDb()
    .prepare('UPDATE chain_transactions SET expiresAt=? WHERE id=?')
    .run(Date.now() - 1, t.id);
  vi.mocked(gateway.receipt).mockResolvedValue({
    status: 'NOT_FOUND',
    hash: t.txHash,
    oldestLedgerCloseTime: Math.floor(Date.parse(t.createdAt) / 1000) - 1,
    latestLedgerCloseTime: Math.floor(Date.now() / 1000) + 60,
  });
  expect((await reconcileChainTransaction(t.id, client, gateway)).status).toBe('EXPIRED');
});
it('recovers a wallet-broadcast transaction even if its signature never reached the application', async () => {
  const prepared = await prepareChainTransaction(
    client,
    { method: 'create_agreement', agreementId: agreement.id },
    gateway,
  );
  const t = query('SELECT * FROM chain_transactions WHERE id=?', prepared.id);
  getDb()
    .prepare('UPDATE chain_transactions SET expiresAt=? WHERE id=?')
    .run(Date.now() - 1, t.id);
  await confirm(t, 'created');
  expect(query('SELECT status FROM chain_transactions WHERE id=?', t.id).status).toBe('CONFIRMED');
  expect(query('SELECT signedXdr FROM chain_transactions WHERE id=?', t.id).signedXdr).toBeNull();
});
it('updates exact XLM funding only after verified execution', async () => {
  const e = await activeEscrow();
  const mid = agreement.snapshot.milestones[0].id;
  const t = await send(client, { method: 'fund_milestone', escrowRef: e.id, milestoneId: mid });
  expect(query('SELECT funded FROM chain_milestones WHERE milestoneId=?', mid).funded).toBe('0');
  remoteStates.set(chainId(mid), {
    amount: '10000000',
    funded: '10000000',
    paid: '0',
    refunded: '0',
    state: ['Funded'],
    submission_hash: '0'.repeat(64),
  });
  await confirm(t, 'funded');
  expect(get('milestones', mid)?.status).toBe('READY_TO_START');
  expect(get('milestones', mid)?.funded).toBe(0);
  expect(
    (bootstrap(client) as Row).blockchain.milestones.find((m: Row) => m.milestoneId === mid).funded,
  ).toBe('10000000');
  expect(all('ledger')).toHaveLength(0);
});
it('rejects local financial actions and financial-mode conversion', () => {
  const mid = agreement.snapshot.milestones[0].id;
  expect(() => action(client, { type: 'fund', milestoneId: mid })).toThrow(/wallet-authorized/);
  expect(() =>
    put('projects', { ...get('projects', project.id), financialMode: 'LOCAL_DEMO' }),
  ).toThrow(/immutable/);
});
it('preserves original escrow entitlements across replacement recovery', async () => {
  const e = await activeEscrow();
  action(client, {
    type: 'intervene',
    projectId: project.id,
    reason: 'Requested a progress response before moving to recovery.',
  });
  const recovered = action(client, {
    type: 'recover',
    projectId: project.id,
    reason: 'Original freelancer requested a mutually reviewed project recovery.',
  });
  const invited = action(client, {
    type: 'inviteReplacement',
    recoveryId: recovered.recovery.id,
    freelancerId: replacement.id,
  });
  for (const user of [client, replacement])
    action(user, {
      type: 'acceptAgreement',
      projectId: project.id,
      agreementId: invited.agreement.id,
    });
  await prepareChainTransaction(
    client,
    { method: 'create_agreement', agreementId: invited.agreement.id },
    gateway,
  );
  const original = query('SELECT * FROM chain_escrows WHERE id=?', e.id),
    fresh = query('SELECT * FROM chain_escrows WHERE agreementId=?', invited.agreement.id);
  expect(original.freelancerAddress).toBe(keys.get(worker.id)!.publicKey());
  expect(fresh.freelancerAddress).toBe(keys.get(replacement.id)!.publicKey());
  expect(fresh.escrowId).not.toBe(original.escrowId);
  expect(
    query('SELECT funded FROM chain_milestones WHERE escrowRef=? LIMIT 1', fresh.id).funded,
  ).toBe('0');
});
