import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { body, checkOrigin, readLimited } from '../src/lib/http';
afterEach(() => vi.unstubAllEnvs());
describe('HTTP trust boundaries', () => {
  it('rejects chunked bodies that exceed limits without trusting Content-Length', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
        controller.close();
      },
    });
    const req = new Request('http://localhost/api/uploads', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    await expect(readLimited(req, 10)).rejects.toThrow('Request body too large');
  });
  it('accepts bounded bytes and rejects a declared oversized body', async () => {
    expect(
      new TextDecoder().decode(
        await readLimited(new Request('http://localhost', { method: 'POST', body: 'hello' }), 5),
      ),
    ).toBe('hello');
    await expect(
      readLimited(
        new Request('http://localhost', {
          method: 'POST',
          body: 'ok',
          headers: { 'Content-Length': '900' },
        }),
        10,
      ),
    ).rejects.toThrow();
  });
  it('rejects non-object JSON with a safe input error', async () => {
    for (const value of ['null', '[]', 'true', '"text"', '{bad']) {
      await expect(
        body(new NextRequest('http://localhost/api/actions', { method: 'POST', body: value })),
      ).rejects.toThrow();
    }
  });
  it('requires the exact configured origin and rejects cross-site posts', () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
    expect(() =>
      checkOrigin(
        new NextRequest('http://localhost:3000/api/actions', {
          method: 'POST',
          headers: { Origin: 'https://attacker.example' },
        }),
      ),
    ).toThrow();
    expect(() =>
      checkOrigin(new NextRequest('http://localhost:3000/api/actions', { method: 'POST' })),
    ).toThrow();
    expect(() =>
      checkOrigin(
        new NextRequest('http://localhost:3000/api/actions', {
          method: 'POST',
          headers: { Origin: 'http://localhost:3000', 'Sec-Fetch-Site': 'cross-site' },
        }),
      ),
    ).toThrow();
    expect(() =>
      checkOrigin(
        new NextRequest('http://localhost:3000/api/actions', {
          method: 'POST',
          headers: { Origin: 'http://localhost:3000' },
        }),
      ),
    ).not.toThrow();
  });
});
