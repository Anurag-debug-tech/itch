import { beforeEach, afterEach, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Keypair, TransactionBuilder, Transaction } from '@stellar/stellar-sdk';
import { closeDb, getDb } from '../src/lib/db';
import { register, type User } from '../src/lib/auth';
import {
  createWalletChallenge,
  verifyWalletChallenge,
  disconnectWallet,
} from '../src/lib/stellar/wallet';
import { walletFor } from '../src/lib/stellar/store';
import { PASSPHRASE } from '../src/lib/stellar/config';

let directory: string, user: User, other: User, key: Keypair;
beforeEach(() => {
  closeDb();
  directory = mkdtempSync(path.join(tmpdir(), 'mg-wallet-'));
  process.env.DATABASE_PATH = path.join(directory, 'db.sqlite');
  process.env.DEMO_MODE = 'true';
  process.env.STELLAR_TESTNET_ENABLED = 'true';
  process.env.APP_ORIGIN = 'http://localhost:3000';
  user = register({
    name: 'Wallet Client',
    email: 'wallet@example.test',
    password: 'SecureTest123!',
    role: 'CLIENT',
  });
  other = register({
    name: 'Another Client',
    email: 'other@example.test',
    password: 'SecureTest123!',
    role: 'CLIENT',
  });
  key = Keypair.random();
});
afterEach(() => {
  closeDb();
  rmSync(directory, { recursive: true, force: true });
  delete process.env.STELLAR_TESTNET_ENABLED;
});
const lookup = async (address: string) => ({
  signers: [{ key: address, weight: 1, type: 'ed25519_public_key' }],
  thresholds: { high_threshold: 1 },
});
function signed(challenge: { xdr: string }, signer = key) {
  const tx = TransactionBuilder.fromXDR(challenge.xdr, PASSPHRASE) as Transaction;
  tx.sign(signer);
  return tx.toXDR();
}
it('links a verified wallet without storing any private key', async () => {
  const c = createWalletChallenge(user, 'session-a', key.publicKey());
  const result = await verifyWalletChallenge(user, 'session-a', c.id, signed(c), lookup);
  expect(result.address).toBe(key.publicKey());
  expect(walletFor(user.id)?.address).toBe(key.publicKey());
  const row = getDb().prepare('SELECT * FROM wallet_challenges').get();
  expect(JSON.stringify(row)).not.toContain(key.secret());
});
it('rejects an unsigned address claim', async () => {
  const c = createWalletChallenge(user, 'session-a', key.publicKey());
  await expect(verifyWalletChallenge(user, 'session-a', c.id, c.xdr, lookup)).rejects.toThrow(
    /signature/i,
  );
  expect(walletFor(user.id)).toBeUndefined();
});
it('rejects a different wallet signature', async () => {
  const c = createWalletChallenge(user, 'session-a', key.publicKey());
  await expect(
    verifyWalletChallenge(user, 'session-a', c.id, signed(c, Keypair.random()), lookup),
  ).rejects.toThrow();
});
it('binds proofs to both user and session', async () => {
  const c = createWalletChallenge(user, 'session-a', key.publicKey());
  await expect(verifyWalletChallenge(other, 'session-a', c.id, signed(c), lookup)).rejects.toThrow(
    /session/,
  );
  await expect(verifyWalletChallenge(user, 'session-b', c.id, signed(c), lookup)).rejects.toThrow(
    /session/,
  );
});
it('rejects challenge replay', async () => {
  const c = createWalletChallenge(user, 'session-a', key.publicKey());
  await verifyWalletChallenge(user, 'session-a', c.id, signed(c), lookup);
  await expect(verifyWalletChallenge(user, 'session-a', c.id, signed(c), lookup)).rejects.toThrow(
    /replayed/,
  );
});
it('rejects expired and origin-mismatched proofs', async () => {
  const c = createWalletChallenge(user, 'session-a', key.publicKey());
  process.env.APP_ORIGIN = 'http://attacker.test';
  await expect(verifyWalletChallenge(user, 'session-a', c.id, signed(c), lookup)).rejects.toThrow();
  process.env.APP_ORIGIN = 'http://localhost:3000';
  getDb().prepare('UPDATE wallet_challenges SET expiresAt=0 WHERE id=?').run(c.id);
  await expect(verifyWalletChallenge(user, 'session-a', c.id, signed(c), lookup)).rejects.toThrow(
    /expired/,
  );
});
it('does not let one wallet attach to two active users', async () => {
  const c = createWalletChallenge(user, 'a', key.publicKey());
  await verifyWalletChallenge(user, 'a', c.id, signed(c), lookup);
  const d = createWalletChallenge(other, 'b', key.publicKey());
  await expect(verifyWalletChallenge(other, 'b', d.id, signed(d), lookup)).rejects.toThrow(
    /another account/,
  );
  expect(walletFor(user.id)?.address).toBe(key.publicKey());
});
it('retains wallet ownership history on disconnect', async () => {
  const c = createWalletChallenge(user, 'a', key.publicKey());
  await verifyWalletChallenge(user, 'a', c.id, signed(c), lookup);
  disconnectWallet(user);
  expect(walletFor(user.id)).toBeUndefined();
  expect(
    getDb().prepare('SELECT disconnectedAt FROM wallet_links WHERE userId=?').get(user.id)
      ?.disconnectedAt,
  ).toBeTruthy();
});
it('rejects accounts whose primary signer cannot meet the threshold', async () => {
  const c = createWalletChallenge(user, 'a', key.publicKey());
  await expect(
    verifyWalletChallenge(user, 'a', c.id, signed(c), async (a) => ({
      signers: [{ key: a, weight: 1, type: 'ed25519_public_key' }],
      thresholds: { high_threshold: 2 },
    })),
  ).rejects.toThrow(/threshold/);
});
