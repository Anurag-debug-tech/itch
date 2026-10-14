import { NextRequest } from 'next/server';
import { body, guard, route, SESSION_COOKIE } from '@/lib/http';
import { tokenHash } from '@/lib/auth';
import { assert } from '@/lib/errors';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return route(async () => {
    const user = guard(req),
      b = await body(req);
    const { createWalletChallenge, verifyWalletChallenge, disconnectWallet } =
      await import('@/lib/stellar/wallet');
    const session = tokenHash(req.cookies.get(SESSION_COOKIE)!.value);
    if (b.type === 'challenge') return createWalletChallenge(user, session, String(b.address));
    if (b.type === 'verify')
      return verifyWalletChallenge(user, session, String(b.id), String(b.signedXdr));
    assert(b.type === 'disconnect', 'Unknown wallet action');
    return disconnectWallet(user);
  });
}
