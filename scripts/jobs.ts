import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const { runJobs, audit } = await import('../src/lib/service');
const { closeDb } = await import('../src/lib/db');
function execute() {
  try {
    console.log(runJobs());
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown failure';
    console.error('Scheduled job failed:', message);
    try {
      audit(null, 'system', 'JOBS_FAILED', { message });
    } catch {}
    if (!process.argv.includes('--watch')) process.exitCode = 1;
  }
}
execute();
if (process.argv.includes('--watch')) {
  setInterval(execute, 60000);
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      closeDb();
      process.exit(0);
    });
} else closeDb();
