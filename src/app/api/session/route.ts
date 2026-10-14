import { NextRequest } from 'next/server';
import { sessionUser } from '@/lib/auth';
import { demoMode } from '@/lib/db';
import { route, SESSION_COOKIE } from '@/lib/http';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  return route(() => ({
    user: sessionUser(req.cookies.get(SESSION_COOKIE)?.value),
    demoMode: demoMode(),
  }));
}
