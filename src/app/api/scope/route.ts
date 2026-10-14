import { NextRequest } from 'next/server';
import { scopeSuggestions } from '@/lib/service';
import { suggestScope, aiConfigured } from '@/lib/ai';
import { rateLimit } from '@/lib/auth';
import { route, guard, body } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return route(async () => {
    const user = guard(req);
    if (aiConfigured()) rateLimit('scope-ai:' + user.id, 10);
    const b = await body(req);
    const fallback = scopeSuggestions(b.category, b.description);
    return suggestScope(String(b.category), b.description, fallback.criteria);
  });
}
