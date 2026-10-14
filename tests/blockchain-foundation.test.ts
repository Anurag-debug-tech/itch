import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { closeDb, getDb } from '../src/lib/db';
import { atomic, parseXlm, formatXlm } from '../src/lib/stellar/amounts';
import { canonical, commitment, assertResetSafe } from '../src/lib/stellar/store';
import { seedDemo, resetDemo } from '../src/lib/seed';

let directory: string;
beforeEach(() => {
  closeDb();
  directory = mkdtempSync(path.join(tmpdir(), 'mg-chain-foundation-'));
  process.env.DEMO_MODE = 'true';
  process.env.DATABASE_PATH = path.join(directory, 'db.sqlite');
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
});
afterEach(() => {
  closeDb();
  rmSync(directory, { recursive: true, force: true });
});
describe('exact XLM amounts', () => {
  it('round trips values beyond Number.MAX_SAFE_INTEGER without rounding', () => {
    const n = parseXlm('999999999.1234567');
    expect(n).toBe('9999999991234567');
    expect(formatXlm(n)).toBe('999999999.1234567 XLM');
  });
  it('rejects floating point, exponents, excess precision, zero and oversized deposits', () => {
    for (const input of [0.1, '1e7', '01', '-1', '0', '1000000000000000001'])
      expect(() => atomic(input)).toThrow();
    for (const input of ['0.00000001', '1e2', '-1']) expect(() => parseXlm(input)).toThrow();
  });
  it('preserves a single stroop and zero read-model balances', () => {
    expect(parseXlm('0.0000001')).toBe('1');
    expect(formatXlm('0')).toBe('0 XLM');
  });
  it('formats aggregate balances beyond a single-deposit limit without rounding', () => {
    expect(formatXlm('2000000000000000001')).toBe('200000000000.0000001 XLM');
    expect(() => atomic('2000000000000000001')).toThrow();
  });
});
it('canonical commitments are stable across object insertion order', () => {
  expect(commitment({ b: '10', a: { z: 1, c: 2 } })).toBe(
    commitment({ a: { c: 2, z: 1 }, b: '10' }),
  );
  expect(canonical({ n: '9999999991234567' })).toContain('"9999999991234567"');
  expect(() => canonical({ n: 1.1 })).toThrow();
});
it('upgrades an unversioned database without changing existing financial records', () => {
  const old = new DatabaseSync(process.env.DATABASE_PATH!);
  old.exec(readFileSync('migrations/001_initial.sql', 'utf8'));
  old
    .prepare('INSERT INTO users VALUES (?,?,?,?,?,?)')
    .run('u', 'Existing', 'old@example.test', 'CLIENT', 'hash', '2026-01-01');
  old.prepare('INSERT INTO projects VALUES (?,?,?,?)').run('p', 'u', 'u', '{}');
  old
    .prepare('INSERT INTO milestones VALUES (?,?,?,?,?,?,?)')
    .run('m', 'p', 100, 100, 100, 0, '{}');
  old
    .prepare('INSERT INTO ledger VALUES (?,?,?,?,?,?,?)')
    .run('l', 'p', 'm', 'PAYOUT', 100, 'legacy-reference', '{"status":"SIMULATED_CONFIRMED"}');
  old.close();
  const db = getDb();
  expect(db.prepare('SELECT amount,reference,data FROM ledger').get()).toEqual({
    amount: 100,
    reference: 'legacy-reference',
    data: '{"status":"SIMULATED_CONFIRMED"}',
  });
  expect(db.prepare('SELECT name FROM schema_migrations ORDER BY name').all()).toHaveLength(2);
  closeDb();
  expect(getDb().prepare('SELECT count(*) AS n FROM ledger').get()).toEqual({ n: 1 });
});
it('blocks demo reset before deleting any linked escrow history', () => {
  seedDemo();
  const db = getDb();
  const p = db.prepare('SELECT id FROM projects LIMIT 1').get() as { id: string };
  const a = db.prepare('SELECT id FROM agreements WHERE projectId=? LIMIT 1').get(p.id) as {
    id: string;
  };
  db.prepare('INSERT INTO chain_escrows VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'e',
    p.id,
    a.id,
    'STELLAR_TESTNET',
    'C-test',
    'id',
    'hash',
    'client',
    'worker',
    'resolver',
    'XLM',
    'CREATED',
    'now',
    '{}',
  );
  const before = db.prepare('SELECT count(*) AS n FROM ledger').get();
  expect(() => assertResetSafe()).toThrow(/Reset blocked/);
  expect(() => resetDemo()).toThrow(/Reset blocked/);
  expect(db.prepare('SELECT count(*) AS n FROM ledger').get()).toEqual(before);
  expect(db.prepare('SELECT count(*) AS n FROM chain_escrows').get()).toEqual({ n: 1 });
});
