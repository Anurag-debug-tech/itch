import { NextRequest } from 'next/server';
import { body, guard, route } from '@/lib/http';
import { rateLimit } from '@/lib/auth';
import { reviewBrief } from '@/lib/dispute-review';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return route(async () => {
    const user = guard(req),
      b = await body(req);
    rateLimit('dispute-brief:' + user.id, 10);
    return reviewBrief(user, String(b.disputeId), b.useAi === true);
  });
}
