import { NextRequest, NextResponse } from 'next/server';
import { sessionUser, rateLimit, type User } from './auth';
import { AppError, assert } from './errors';

export const SESSION_COOKIE = 'mg_session';
export function currentUser(req: NextRequest): User {
  const user = sessionUser(req.cookies.get(SESSION_COOKIE)?.value);
  assert(user, 'Sign in to continue', 401);
  return user;
}
export function checkOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const expected = process.env.APP_ORIGIN || 'http://localhost:3000';
  assert(origin === expected, 'Invalid or missing request origin', 403);
  assert(req.headers.get('sec-fetch-site') !== 'cross-site', 'Cross-site request rejected', 403);
}
export function guard(req: NextRequest) {
  checkOrigin(req);
  const user = currentUser(req);
  rateLimit(`action:${user.id}`, 100);
  return user;
}
/** Enforce the limit on bytes actually read, including chunked requests with no Content-Length. */
export async function readLimited(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = req.headers.get('content-length');
  if (declared !== null)
    assert(/^\d+$/.test(declared) && Number(declared) <= maxBytes, 'Request body too large', 413);
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError('Request body too large', 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
export async function body(req: NextRequest) {
  const bytes = await readLimited(req, 100_000);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new AppError('Invalid JSON');
  }
  assert(
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed),
    'Request body must be a JSON object',
  );
  return parsed as Record<string, any>;
}
export async function route(fn: () => unknown | Promise<unknown>) {
  try {
    return NextResponse.json(await fn(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    // Never log request bodies, credentials, or provider responses.
    console.error('API operation failed:', error instanceof Error ? error.name : 'Unknown error');
    return NextResponse.json(
      { error: 'The operation could not be completed. Please try again.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export const cookieOptions = () => ({
  httpOnly: true,
  secure: (process.env.APP_ORIGIN || '').startsWith('https://'),
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 86400,
});
