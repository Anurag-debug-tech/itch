import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
let db: DatabaseSync | undefined;
export function demoMode() {
  return process.env.DEMO_MODE === 'true';
}
export function getDb() {
  if (!demoMode())
    throw new Error(
      'Local database requires explicit DEMO_MODE=true. A hosted production adapter is not configured.',
    );
  if (!db) {
    const path = process.env.DATABASE_PATH || 'data/milestoneguard.sqlite';
    if (path !== ':memory:')
      mkdirSync(dirname(resolve(/* turbopackIgnore: true */ path)), { recursive: true });
    db = new DatabaseSync(path);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    db.exec(readFileSync(resolve('migrations/001_initial.sql'), 'utf8'));
  }
  return db;
}
export function migrate() {
  getDb();
}
export function closeDb() {
  db?.close();
  db = undefined;
}
let transactionDepth = 0;
export function transaction<T>(fn: () => T): T {
  const d = getDb();
  const nested = transactionDepth > 0;
  const savepoint = `nested_${transactionDepth}`;
  d.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
  transactionDepth++;
  try {
    const result = fn();
    d.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT');
    return result;
  } catch (e) {
    d.exec(nested ? `ROLLBACK TO SAVEPOINT ${savepoint}` : 'ROLLBACK');
    if (nested) d.exec(`RELEASE SAVEPOINT ${savepoint}`);
    throw e;
  } finally {
    transactionDepth--;
  }
}
export type Row = Record<string, any>;
const tables = new Set([
  'projects',
  'milestones',
  'agreements',
  'submissions',
  'ledger',
  'disputes',
  'recoveries',
  'checkins',
  'notifications',
  'audit',
]);
function table(t: string) {
  if (!tables.has(t)) throw new Error('Invalid table');
  return t;
}
export function all(t: string): Row[] {
  return (
    getDb()
      .prepare(`SELECT * FROM ${table(t)}`)
      .all() as Row[]
  ).map(decode);
}
function decode(row: Row): Row {
  const data = JSON.parse(row.data);
  delete row.data;
  return { ...data, ...row };
}
export function get(t: string, id: string): Row | undefined {
  const row = getDb()
    .prepare(`SELECT * FROM ${table(t)} WHERE id=?`)
    .get(id) as Row | undefined;
  return row ? decode(row) : undefined;
}
export function put(t: string, row: Row) {
  const indexed: Record<string, string[]> = {
    projects: ['clientId', 'freelancerId'],
    milestones: ['projectId', 'budget', 'funded', 'paid', 'refunded'],
    submissions: ['projectId', 'milestoneId'],
    ledger: ['projectId', 'milestoneId', 'type', 'amount', 'reference'],
    notifications: ['userId', 'projectId'],
  };
  const cols = ['id', ...(indexed[t] || ['projectId']), 'data'];
  const vals = cols.map((k) => (k === 'data' ? JSON.stringify(row) : (row[k] ?? null)));
  getDb()
    .prepare(
      `INSERT INTO ${table(t)} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${cols
        .slice(1)
        .map((k) => `${k}=excluded.${k}`)
        .join(',')}`,
    )
    .run(...vals);
}
