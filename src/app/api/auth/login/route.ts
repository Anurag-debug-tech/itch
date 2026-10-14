import { NextRequest } from 'next/server';
import { authenticate, createSession, rateLimit } from '@/lib/auth';
import { route, checkOrigin, body, SESSION_COOKIE, cookieOptions } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let token = '';
  const response = await route(async () => {
    checkOrigin(req);
    rateLimit('login:global', 120, 60000);
    const b = await body(req);
    rateLimit(`login:${String(b.email).slice(0, 254).trim().toLowerCase()}`, 12, 60000);
    const user = authenticate(b.email, b.password);
    token = createSession(user);
    return { user };
  });
  if (token) response.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return response;
}
