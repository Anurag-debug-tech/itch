import { Worker } from 'node:worker_threads';
import { resolve, basename } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { assert, AppError } from './errors';

const rulesSchema = z
  .object({
    requiredFileName: z
      .string()
      .min(1)
      .max(150)
      .refine((s) => basename(s) === s && !/[\x00-\x1f\\]/.test(s))
      .optional(),
    requiredText: z.array(z.string().trim().min(1).max(250)).max(12).optional(),
    minImageWidth: z.number().int().min(1).max(16000).optional(),
    minImageHeight: z.number().int().min(1).max(16000).optional(),
  })
  .strict();
export type VerificationRules = z.infer<typeof rulesSchema>;
export type VerificationCheck = {
  name: string;
  result: 'PASS' | 'FAIL' | 'NEEDS_REVIEW';
  explanation: string;
  reference: string;
};
export function verificationRules(value: unknown): VerificationRules {
  const result = rulesSchema.safeParse(value ?? {});
  assert(result.success, 'Invalid objective verification rules');
  return result.data;
}
function pdfPages(bytes: Buffer): Promise<number> {
  assert(
    bytes.length <= 5 * 1024 * 1024,
    'PDF structural verification supports documents up to 5 MiB',
  );
  assert(
    bytes.subarray(-2048).toString('latin1').includes('%%EOF'),
    'Corrupt PDF: end-of-file marker missing',
  );
  return new Promise((accept, reject) => {
    let done = false;
    const worker = new Worker(resolve(/* turbopackIgnore: true */ 'scripts/verify-pdf.cjs'), {
      workerData: Uint8Array.from(bytes),
      resourceLimits: { maxOldGenerationSizeMb: 96, stackSizeMb: 4 },
    });
    const finish = (pages?: number) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void worker.terminate();
      if (pages) accept(pages);
      else
        reject(
          new AppError('Corrupt, encrypted or unsupported PDF; structural verification failed'),
        );
    };
    const timer = setTimeout(() => finish(), 3000);
    worker.once('message', (result) => finish(result.ok ? result.pages : undefined));
    worker.once('error', () => finish());
    worker.once('exit', () => finish());
  });
}
export async function inspectEvidence(
  bytes: Buffer,
  mime: string,
  fileName: string,
  hash: string,
  rules: VerificationRules,
) {
  const checks: VerificationCheck[] = [],
    objective: VerificationCheck[] = [];
  const facts: { width?: number; height?: number; pages?: number; textInspected: boolean } = {
    textInspected: false,
  };
  let text: string | undefined;
  const reference = 'sha256:' + hash;
  if (['image/png', 'image/jpeg'].includes(mime)) {
    try {
      const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 25_000_000 });
      const meta = await image.metadata();
      await image.stats();
      assert(meta.width && meta.height, 'Invalid image dimensions');
      facts.width = meta.width;
      facts.height = meta.height;
    } catch {
      throw new AppError('Corrupt or oversized image; full image decoding failed');
    }
    checks.push({
      name: 'Image validity',
      result: 'PASS',
      explanation: `Decoded ${facts.width} × ${facts.height} pixels within the 25-million-pixel safety limit.`,
      reference,
    });
  } else if (mime === 'application/pdf') {
    facts.pages = await pdfPages(bytes);
    checks.push({
      name: 'PDF structure',
      result: 'PASS',
      explanation: `Parsed ${facts.pages} page(s). This verifies basic document structure, not meaning, authorship or malware safety.`,
      reference,
    });
  } else if (mime === 'text/plain' && bytes.length <= 262144) {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    facts.textInspected = true;
  }
  if (rules.requiredFileName)
    objective.push({
      name: 'Required filename',
      result: basename(fileName) === rules.requiredFileName ? 'PASS' : 'FAIL',
      explanation: `Agreement requires the filename “${rules.requiredFileName}”. Received “${basename(fileName)}”.`,
      reference,
    });
  for (const phrase of rules.requiredText || []) {
    const found = text
      ?.normalize('NFKC')
      .toLowerCase()
      .includes(phrase.normalize('NFKC').toLowerCase());
    objective.push({
      name: 'Required text',
      result: text === undefined ? 'NEEDS_REVIEW' : found ? 'PASS' : 'FAIL',
      explanation:
        text === undefined
          ? 'Text rules require a UTF-8 .txt file up to 256 KiB; inspect this format manually.'
          : `${found ? 'Found' : 'Missing'} agreed phrase “${phrase}” (case-insensitive literal check; this does not prove semantic quality).`,
      reference,
    });
  }
  for (const [rule, dimension] of [
    ['minImageWidth', 'width'],
    ['minImageHeight', 'height'],
  ] as const) {
    if (!rules[rule]) continue;
    const actual = facts[dimension];
    objective.push({
      name: `Minimum image ${dimension}`,
      result: actual === undefined ? 'NEEDS_REVIEW' : actual >= rules[rule]! ? 'PASS' : 'FAIL',
      explanation:
        actual === undefined
          ? 'This rule requires a decodable PNG or JPEG.'
          : `Actual ${dimension}: ${actual}px; agreed minimum: ${rules[rule]}px.`,
      reference,
    });
  }
  return { checks, objective, facts, text };
}
export function assertObjectiveReviewable(submission: Record<string, any>) {
  assert(
    !submission.verification?.objective?.some((c: VerificationCheck) => c.result === 'FAIL'),
    'Objective checks failed. Request a revision or independent dispute review.',
    409,
  );
}
