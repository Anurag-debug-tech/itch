import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runJobs } from '@/lib/service';
import { assert } from '@/lib/errors';
import { route } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return route(async () => {
    const token = process.env.JOBS_TOKEN;
    const received = req.headers.get('authorization') || '';
    assert(token && token.length >= 32, 'Scheduled jobs token not configured', 503);
    const expected = `Bearer ${token}`;
    assert(
      received.length === expected.length &&
        timingSafeEqual(Buffer.from(received), Buffer.from(expected)),
      'Unauthorized',
      401,
    );
    const result = runJobs();
    const chain =
      process.env.STELLAR_TESTNET_ENABLED === 'true'
        ? (await import('@/lib/stellar/transactions')).reconcilePending
        : undefined;
    return { ok: true, ...result, ...(chain ? { blockchain: await chain() } : {}) };
  });
}
