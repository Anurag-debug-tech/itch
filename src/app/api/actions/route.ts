import { NextRequest } from 'next/server';
import { action } from '@/lib/service';
import { resetDemo } from '@/lib/seed';
import { demoMode } from '@/lib/db';
import { assert } from '@/lib/errors';
import { route, guard, body } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return route(async () => {
    const user = guard(req);
    const b = await body(req);
    if (b.type === 'resetDemo') {
      assert(user.role === 'ADMIN' && demoMode(), 'Demo administrator access required', 403);
      resetDemo();
      return { ok: true, requiresLogin: true };
    }
    return action(user, b);
  });
}
