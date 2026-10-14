import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { getDb, type Row } from './db';
import { assert } from './errors';
export type User = {
  id: string;
  name: string;
  email: string;
  role: 'CLIENT' | 'FREELANCER' | 'ADMIN';
};
export const publicUser = (u: Row): User => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function register(input: Row): User {
  const { name, email, password, role } = input;
  assert(
    typeof name === 'string' && name.trim().length >= 2 && name.length <= 100,
    'Name must contain 2–100 characters',
  );
  assert(
    typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254,
    'A valid email is required',
  );
  assert(
    typeof password === 'string' && password.length >= 10 && password.length <= 128,
    'Password must contain 10–128 characters',
  );
  assert(['CLIENT', 'FREELANCER'].includes(role), 'Invalid registration role');
  assert(
    !getDb().prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase().trim()),
    'Email already registered',
    409,
  );
  const user = { id: randomUUID(), name: name.trim(), email: email.trim().toLowerCase(), role };
  getDb()
    .prepare('INSERT INTO users VALUES (?,?,?,?,?,?)')
    .run(
      user.id,
      user.name,
      user.email,
      user.role,
      passwordHash(password),
      new Date().toISOString(),
    );
  return user as User;
}
export function authenticate(email: unknown, password: unknown): User {
  assert(
    typeof email === 'string' &&
      email.length <= 254 &&
      typeof password === 'string' &&
      password.length > 0 &&
      password.length <= 128,
    'Invalid credentials',
    401,
  );
  const row = getDb()
    .prepare('SELECT * FROM users WHERE email=?')
    .get(email.trim().toLowerCase()) as Row | undefined;
  const [salt, hash] = (row?.password || 'invalid:'.concat('00'.repeat(64))).split(':');
  const actual = scryptSync(password, salt, 64);
  assert(timingSafeEqual(actual, Buffer.from(hash, 'hex')) && row, 'Invalid credentials', 401);
  return publicUser(row);
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function createSession(user: User) {
  const token = randomBytes(32).toString('base64url');
  getDb().prepare('DELETE FROM sessions WHERE expiresAt<?').run(Date.now());
  getDb()
    .prepare('INSERT INTO sessions VALUES (?,?,?)')
    .run(tokenHash(token), user.id, Date.now() + 7 * 86400000);
  return token;
}
export function sessionUser(token?: string): User | null {
  if (!token) return null;
  const u = getDb()
    .prepare(
      'SELECT users.* FROM sessions JOIN users ON users.id=sessions.userId WHERE tokenHash=? AND expiresAt>?',
    )
    .get(tokenHash(token), Date.now()) as Row | undefined;
  return u ? publicUser(u) : null;
}
export function deleteSession(token: string) {
  getDb().prepare('DELETE FROM sessions WHERE tokenHash=?').run(tokenHash(token));
}
export function rateLimit(key: string, limit = 30, windowMs = 60000) {
  const d = getDb();
  const row = d.prepare('SELECT * FROM rate_limits WHERE key=?').get(key) as Row | undefined;
  const now = Date.now();
  if (!row || row.resetAt <= now) {
    d.prepare(
      'INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,resetAt=excluded.resetAt',
    ).run(key, now + windowMs);
  } else {
    assert(row.count < limit, 'Too many requests. Try again shortly.', 429);
    d.prepare('UPDATE rate_limits SET count=count+1 WHERE key=?').run(key);
  }
}
