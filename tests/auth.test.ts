import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  authenticate,
  createSession,
  deleteSession,
  rateLimit,
  register,
  sessionUser,
  tokenHash,
} from '../src/lib/auth';
import { closeDb, getDb, migrate } from '../src/lib/db';

let directory: string;
beforeEach(() => {
  closeDb();
  directory = mkdtempSync(path.join(tmpdir(), 'milestoneguard-auth-'));
  process.env.DEMO_MODE = 'true';
  process.env.DATABASE_PATH = path.join(directory, 'test.sqlite');
  migrate();
});
afterEach(() => {
  closeDb();
  rmSync(directory, { recursive: true, force: true });
});

const input = {
  name: 'Test Client',
  email: 'test@example.test',
  password: 'SecureTest123!',
  role: 'CLIENT',
};

describe('authentication and server session boundaries', () => {
  it('hashes passwords and returns only public identity fields', () => {
    const user = register(input);
    const stored = getDb().prepare('SELECT password FROM users WHERE id=?').get(user.id) as {
      password: string;
    };
    expect(stored.password).not.toBe(input.password);
    expect(stored.password).not.toContain(input.password);
    expect(authenticate('TEST@example.test', input.password)).toEqual(user);
    expect(Object.keys(user).sort()).toEqual(['email', 'id', 'name', 'role']);
    expect(() => authenticate(input.email, 'wrong password')).toThrow();
    expect(() => authenticate('unknown@example.test', input.password)).toThrow();
  });

  it('rejects self-assigned administrator access and invalid registration fields', () => {
    expect(() => register({ ...input, role: 'ADMIN' })).toThrow();
    expect(() => register({ ...input, email: 'not-an-email' })).toThrow();
    expect(() => register({ ...input, password: 'short' })).toThrow();
    register(input);
    expect(() => register(input)).toThrow();
  });

  it('stores only a session token hash and honors revocation and expiration', () => {
    const user = register(input);
    const token = createSession(user);
    expect(token.length).toBeGreaterThanOrEqual(32);
    const stored = getDb().prepare('SELECT tokenHash FROM sessions').get() as { tokenHash: string };
    expect(stored.tokenHash).toBe(tokenHash(token));
    expect(stored.tokenHash).not.toBe(token);
    expect(sessionUser(token)).toEqual(user);
    expect(sessionUser('forged-token')).toBeNull();
    deleteSession(token);
    expect(sessionUser(token)).toBeNull();
    const expired = createSession(user);
    getDb()
      .prepare('UPDATE sessions SET expiresAt=? WHERE tokenHash=?')
      .run(Date.now() - 1, tokenHash(expired));
    expect(sessionUser(expired)).toBeNull();
  });

  it('enforces a persisted request limit', () => {
    rateLimit('test-login', 2);
    rateLimit('test-login', 2);
    expect(() => rateLimit('test-login', 2)).toThrow(/too many/i);
    rateLimit('different-login', 2);
  });

  it('refuses an implicit fallback to demo database when demo mode is disabled', () => {
    closeDb();
    process.env.DEMO_MODE = 'false';
    expect(() => getDb()).toThrow(/DEMO_MODE/);
    process.env.DEMO_MODE = 'true';
  });
});
