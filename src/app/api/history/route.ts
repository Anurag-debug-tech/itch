import { NextRequest } from 'next/server';
import { currentUser, route } from '@/lib/http';
import { auditPage } from '@/lib/service';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  return route(() =>
    auditPage(currentUser(req), {
      projectId: req.nextUrl.searchParams.get('projectId') || undefined,
      cursor: req.nextUrl.searchParams.get('cursor') || undefined,
      limit: Number(req.nextUrl.searchParams.get('limit') || 25),
    }),
  );
}
