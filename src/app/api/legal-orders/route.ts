import { NextRequest } from 'next/server';
import { body, guard, route } from '@/lib/http';
import { legalOrderAction } from '@/lib/legal-orders';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return route(async () => legalOrderAction(guard(req), await body(req)));
}
