import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    env: { OPENAI_API_KEY: '', OPENAI_MODEL: '', AI_GATEWAY_API_KEY: '', AI_MODEL: '' },
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
