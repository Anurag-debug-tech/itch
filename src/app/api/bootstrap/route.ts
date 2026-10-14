import { NextRequest } from 'next/server';
import { bootstrap } from '@/lib/service';
import { currentUser, route } from '@/lib/http';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  return route(() => bootstrap(currentUser(req)));
}
