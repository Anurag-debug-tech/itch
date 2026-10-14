import { NextRequest } from 'next/server';
import { scopeSuggestions } from '@/lib/service';
import { suggestScope } from '@/lib/ai';
import { route, guard, body } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return route(async () => {
    guard(req);
    const b = await body(req);
    const fallback = scopeSuggestions(b.category, b.description);
    return suggestScope(String(b.category), b.description, fallback.criteria);
  });
}
