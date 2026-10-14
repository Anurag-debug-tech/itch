import { NextRequest } from 'next/server';
import { register, createSession, rateLimit } from '@/lib/auth';
import { route, checkOrigin, body, SESSION_COOKIE, cookieOptions } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let token = '';
  const response = await route(async () => {
    checkOrigin(req);
    rateLimit('register:global', 20, 60000);
    const user = register(await body(req));
    token = createSession(user);
    return { user };
  });
  if (token) response.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return response;
}
