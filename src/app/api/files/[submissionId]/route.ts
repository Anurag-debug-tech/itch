import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { getSubmissionFile } from '@/lib/uploads';
import { currentUser, route } from '@/lib/http';
export const runtime = 'nodejs';
export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{
      submissionId: string;
    }>;
  },
) {
  let result: NextResponse | undefined;
  const error = await route(async () => {
    const { submissionId } = await context.params;
    const { submission, path } = getSubmissionFile(currentUser(req), submissionId);
    result = new NextResponse(readFileSync(path), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(submission.fileName)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
    return {};
  });
  return result || error;
}
