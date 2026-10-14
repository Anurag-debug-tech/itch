import { NextRequest } from 'next/server';
import { body, guard, route } from '@/lib/http';
import { assert } from '@/lib/errors';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return route(async () => {
    const user = guard(req),
      b = await body(req);
    const {
      prepareChainTransaction,
      submitChainTransaction,
      reconcileChainTransaction,
      resumeChainTransaction,
    } = await import('@/lib/stellar/transactions');
    if (b.type === 'prepare') return prepareChainTransaction(user, b);
    if (b.type === 'submit') return submitChainTransaction(user, String(b.id), String(b.signedXdr));
    if (b.type === 'resume') return resumeChainTransaction(user, String(b.id));
    assert(b.type === 'reconcile', 'Unknown blockchain action');
    return reconcileChainTransaction(String(b.id), user);
  });
}
