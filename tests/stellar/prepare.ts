// Trusted local test fixture only. No privileged registration/signing API is added to the app.
import { register } from '../../src/lib/auth';
import { closeDb, getDb } from '../../src/lib/db';
for (const [name, role] of [
  ['client', 'CLIENT'],
  ['freelancer', 'FREELANCER'],
  ['admin', 'CLIENT'],
]) {
  const user = register({
    name: `Browser ${name}`,
    email: `${name}@browser.test`,
    password: 'TestnetFixturePass123!',
    role,
  });
  if (name === 'admin') getDb().prepare("UPDATE users SET role='ADMIN' WHERE id=?").run(user.id);
}
closeDb();
