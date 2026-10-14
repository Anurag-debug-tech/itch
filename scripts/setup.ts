import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
const root = process.cwd();
mkdirSync(resolve(root, 'data/uploads'), { recursive: true, mode: 0o700 });
const file = resolve(root, '.env.local');
if (!existsSync(file)) {
  const secret = () => randomBytes(32).toString('hex');
  writeFileSync(
    file,
    [
      '# Local demonstration only. Never commit this file.',
      'DEMO_MODE=true',
      'DATABASE_PATH=./data/milestoneguard.sqlite',
      'UPLOAD_DIR=./data/uploads',
      'APP_ORIGIN=http://localhost:3000',
      `SESSION_SECRET=${secret()}`,
      `JOBS_TOKEN=${secret()}`,
      '',
    ].join('\n'),
    { mode: 0o600, flag: 'wx' },
  );
  console.log(
    'Created private .env.local with cryptographically random local secrets. Values are not printed.',
  );
} else {
  console.log('Existing .env.local preserved.');
}
console.log('Local database requires no API key. Next: npm run db:migrate && npm run db:seed');
