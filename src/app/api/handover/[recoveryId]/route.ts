import { NextRequest } from 'next/server';
import { handoverFor } from '@/lib/service';
import { currentUser, route } from '@/lib/http';
export const runtime = 'nodejs';
export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{
      recoveryId: string;
    }>;
  },
) {
  return route(async () => handoverFor(currentUser(req), (await context.params).recoveryId));
}
