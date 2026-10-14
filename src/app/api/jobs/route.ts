import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runJobs } from '@/lib/service';
import { assert } from '@/lib/errors';
import { route } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return route(() => {
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
    return { ok: true, ...runJobs() };
  });
}
