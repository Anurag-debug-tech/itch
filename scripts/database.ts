import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const { migrate, closeDb } = await import('../src/lib/db');
const { seedDemo, resetDemo } = await import('../src/lib/seed');
try {
  const command = process.argv[2] || 'migrate';
  migrate();
  if (command === 'seed') console.log(seedDemo());
  else if (command === 'reset') console.log(resetDemo());
  else if (command === 'migrate') console.log('Database migrations applied.');
  else throw new Error('Use migrate, seed, or reset');
} finally {
  closeDb();
}
