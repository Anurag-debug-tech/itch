import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('ai', () => ({ generateText: vi.fn(), Output: { object: vi.fn() } }));
import { generateText } from 'ai';
import { assistVerification, suggestScope } from '../src/lib/ai';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('optional AI advice', () => {
  it('uses labelled local criteria without a key and makes no external call', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('AI_MODEL', '');
    const result = await suggestScope('Website', 'Festival website', ['A reviewable requirement']);
    expect(result).toEqual({
      source: 'Rule-based suggestions',
      criteria: ['A reviewable requirement'],
    });
    expect(generateText).not.toHaveBeenCalled();
    expect(
      await assistVerification(['Criterion'], {
        fileName: 'test.txt',
        mime: 'text/plain',
        size: 20,
        description: 'Work',
      }),
    ).toBeNull();
  });
  it('falls back when the provider is unavailable', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-only-placeholder');
    vi.stubEnv('AI_MODEL', 'test/model');
    vi.mocked(generateText).mockRejectedValue(new Error('Provider unavailable'));
    expect(
      (await suggestScope('Website', 'Festival', ['Reviewable requirement'])).source,
    ).toContain('AI unavailable');
  });
  it('never treats metadata-only model advice as acceptance evidence', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-only-placeholder');
    vi.stubEnv('AI_MODEL', 'test/model');
    vi.mocked(generateText).mockResolvedValue({
      output: { observations: [{ index: 0, explanation: 'Inspect the navigation links.' }] },
    } as never);
    const result = await assistVerification(['Navigation works', 'Mobile layout'], {
      fileName: 'site.zip',
      mime: 'application/zip',
      size: 100,
      description: 'All finished',
    });
    expect(result?.criteria).toHaveLength(2);
    expect(result?.criteria.every((item) => item.result === 'NEEDS_REVIEW')).toBe(true);
  });
});
