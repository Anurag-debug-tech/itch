import { NextRequest } from 'next/server';
import { uploadSubmission } from '@/lib/uploads';
import { AppError, assert } from '@/lib/errors';
import { route, guard, readLimited } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return route(async () => {
    const user = guard(req);
    const bytes = await readLimited(req, 22_000_000);
    let form: FormData;
    try {
      form = await new Response(bytes as BodyInit, {
        headers: { 'Content-Type': req.headers.get('content-type') || '' },
      }).formData();
    } catch {
      throw new AppError('Invalid multipart upload');
    }
    const file = form.get('file');
    assert(file instanceof File, 'A file is required');
    const submission = await uploadSubmission(user, {
      milestoneId: String(form.get('milestoneId') || ''),
      description: String(form.get('description') || ''),
      url: String(form.get('url') || '') || undefined,
      file,
    });
    return { ok: true, submission };
  });
}
