import { createHash } from 'node:crypto';
import { all, getDb, type Row } from '../db';
import { NETWORK, enabled } from './config';
import { AppError } from '../errors';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  if (typeof value === 'bigint' || (typeof value === 'number' && !Number.isSafeInteger(value)))
    throw new Error('Canonical commitments require exact integer values or strings');
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error('Unsupported commitment value');
  return text;
}
export const commitment = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
export const chainId = (id: string) =>
  createHash('sha256')
    .update('milestoneguard:' + id)
    .digest('hex');
export function walletFor(userId: string): Row | undefined {
  return getDb()
    .prepare(
      'SELECT id,address,network,verifiedAt FROM wallet_links WHERE userId=? AND network=? AND disconnectedAt IS NULL',
    )
    .get(userId, NETWORK) as Row | undefined;
}
export function chainReadModel(userId: string, projectIds: Set<string>) {
  const isAdmin =
    (getDb().prepare('SELECT role FROM users WHERE id=?').get(userId) as Row)?.role === 'ADMIN';
  const escrows = (getDb().prepare('SELECT * FROM chain_escrows').all() as Row[]).filter((e) => {
    if (!projectIds.has(e.projectId)) return false;
    const roles = JSON.parse(e.data);
    return isAdmin || roles.clientUserId === userId || roles.freelancerUserId === userId;
  });
  const ids = new Set(escrows.map((e) => e.id));
  const milestones = (getDb().prepare('SELECT * FROM chain_milestones').all() as Row[]).filter(
    (m) => ids.has(m.escrowRef),
  );
  const transactions = (
    getDb()
      .prepare(
        'SELECT id,userId,projectId,escrowRef,milestoneId,method,status,txHash,error,createdAt,updatedAt FROM chain_transactions ORDER BY createdAt DESC',
      )
      .all() as Row[]
  ).filter((t) => ids.has(t.escrowRef));
  // No signed transaction envelopes or authentication challenges enter the bootstrap response.
  return {
    enabled: enabled(),
    configured: Boolean(process.env.STELLAR_ESCROW_CONTRACT_ID),
    network: NETWORK,
    wallet: walletFor(userId) || null,
    escrows: escrows.map(({ data, ...e }) => ({ ...JSON.parse(data), ...e })),
    milestones,
    transactions,
  };
}
export function assertResetSafe() {
  const row = getDb().prepare('SELECT count(*) AS count FROM chain_escrows').get() as Row;
  if (row.count > 0)
    throw new AppError(
      'Reset blocked: Testnet escrow history must be preserved. On-chain state persists after local resets. Reconcile existing records or select a separate local demo database.',
      409,
    );
}
export function chainParties(projectId: string, userId: string) {
  const project = all('projects').find((p) => p.id === projectId);
  const user = getDb().prepare('SELECT role FROM users WHERE id=?').get(userId) as Row | undefined;
  return Boolean(
    project &&
    (user?.role === 'ADMIN' ||
      project.clientId === userId ||
      project.freelancerId === userId ||
      project.priorFreelancerIds?.includes(userId)),
  );
}
