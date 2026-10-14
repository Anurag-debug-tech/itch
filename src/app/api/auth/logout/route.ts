import { NextRequest } from 'next/server';
import { deleteSession } from '@/lib/auth';
import { route, checkOrigin, SESSION_COOKIE, cookieOptions } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const response = await route(() => {
    checkOrigin(req);
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) deleteSession(token);
    return { ok: true };
  });
  if (response.ok) response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  return response;
}
