import { randomUUID } from 'node:crypto';
import { Keypair, StrKey, TransactionBuilder, Transaction, WebAuth } from '@stellar/stellar-sdk';
import { getDb, transaction, type Row } from '../db';
import { assert, AppError } from '../errors';
import type { User } from '../auth';
import { NETWORK, PASSPHRASE, HORIZON_URL, enabled } from './config';

export function createWalletChallenge(user: User, sessionHash: string, address: string) {
  assert(enabled(), 'Stellar Testnet wallet linking is disabled', 503);
  assert(StrKey.isValidEd25519PublicKey(address), 'Use a conventional G-account wallet');
  const origin = process.env.APP_ORIGIN || 'http://localhost:3000',
    domain = new URL(origin).host;
  // A one-use challenge signer is discarded immediately. No wallet/deployment private key is stored.
  const server = Keypair.random();
  const xdr = WebAuth.buildChallengeTx(server, address, domain, 300, PASSPHRASE, domain);
  const tx = TransactionBuilder.fromXDR(xdr, PASSPHRASE) as Transaction;
  const id = randomUUID(),
    expiresAt = Number(tx.timeBounds!.maxTime) * 1000;
  getDb()
    .prepare('INSERT INTO wallet_challenges VALUES (?,?,?,?,?,?,?,?,?,?,NULL)')
    .run(
      id,
      user.id,
      sessionHash,
      origin,
      NETWORK,
      address,
      Buffer.from(tx.hash()).toString('hex'),
      xdr,
      server.publicKey(),
      expiresAt,
    );
  return {
    id,
    xdr,
    serverKey: server.publicKey(),
    address,
    network: NETWORK,
    networkPassphrase: PASSPHRASE,
    domain,
    expiresAt,
  };
}
type AccountProof = {
  signers: { key: string; weight: number; type: string }[];
  thresholds: { high_threshold: number };
};
async function accountProof(address: string): Promise<AccountProof> {
  const response = await fetch(`${HORIZON_URL}/accounts/${address}`, {
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  assert(response.ok, 'Fund this Testnet account with Friendbot before verifying ownership', 409);
  return response.json();
}
export async function verifyWalletChallenge(
  user: User,
  sessionHash: string,
  id: string,
  signedXdr: string,
  lookup = accountProof,
) {
  assert(enabled(), 'Stellar Testnet wallet linking is disabled', 503);
  assert(typeof signedXdr === 'string' && signedXdr.length <= 30_000, 'Invalid wallet proof');
  const row = getDb().prepare('SELECT * FROM wallet_challenges WHERE id=?').get(id) as
    Row | undefined;
  const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
  assert(
    row &&
      row.userId === user.id &&
      row.sessionHash === sessionHash &&
      row.origin === origin &&
      row.network === NETWORK &&
      !row.usedAt &&
      row.expiresAt > Date.now(),
    'Wallet challenge expired, replayed or belongs to another session',
    403,
  );
  const domain = new URL(origin).host;
  let account: AccountProof;
  try {
    const proof = WebAuth.readChallengeTx(signedXdr, row.serverKey, PASSPHRASE, domain, domain);
    assert(
      proof.clientAccountID === row.address &&
        Buffer.from(proof.tx.hash()).toString('hex') === row.nonce,
      'Wallet challenge was modified',
      403,
    );
    account = await lookup(row.address);
    const threshold = Math.max(1, account.thresholds.high_threshold);
    assert(
      account.signers.some(
        (s) => s.key === row.address && s.type === 'ed25519_public_key' && s.weight >= threshold,
      ),
      'This demo requires a primary wallet authorized for the account threshold',
      403,
    );
    WebAuth.verifyChallengeTxThreshold(
      signedXdr,
      row.serverKey,
      PASSPHRASE,
      threshold,
      account.signers,
      domain,
      domain,
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Wallet signature verification failed', 403);
  }
  transaction(() => {
    const consumed = getDb()
      .prepare(
        'UPDATE wallet_challenges SET usedAt=? WHERE id=? AND usedAt IS NULL AND expiresAt>?',
      )
      .run(new Date().toISOString(), id, Date.now());
    assert(consumed.changes === 1, 'Wallet challenge already consumed', 409);
    const owner = getDb()
      .prepare(
        'SELECT userId FROM wallet_links WHERE network=? AND address=? AND disconnectedAt IS NULL',
      )
      .get(NETWORK, row.address) as Row | undefined;
    assert(!owner || owner.userId === user.id, 'This wallet is linked to another account', 409);
    const now = new Date().toISOString();
    getDb()
      .prepare(
        'UPDATE wallet_links SET disconnectedAt=? WHERE userId=? AND network=? AND disconnectedAt IS NULL',
      )
      .run(now, user.id, NETWORK);
    getDb()
      .prepare('INSERT INTO wallet_links VALUES (?,?,?,?,?,NULL)')
      .run(randomUUID(), user.id, NETWORK, row.address, now);
  });
  return { address: row.address, network: NETWORK };
}
export function disconnectWallet(user: User) {
  transaction(() => {
    const now = new Date().toISOString();
    getDb()
      .prepare('UPDATE wallet_links SET disconnectedAt=? WHERE userId=? AND disconnectedAt IS NULL')
      .run(now, user.id);
    getDb()
      .prepare('UPDATE wallet_challenges SET usedAt=? WHERE userId=? AND usedAt IS NULL')
      .run(now, user.id);
  });
  return { ok: true };
}
