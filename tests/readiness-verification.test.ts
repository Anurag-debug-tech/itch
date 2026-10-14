import { beforeEach, afterEach, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { register, type User } from '../src/lib/auth';
import { closeDb, get, getDb } from '../src/lib/db';
import { action, now } from '../src/lib/service';
import { uploadSubmission } from '../src/lib/uploads';
import { projectInput, evidence } from './fixtures';
let directory: string, client: User, worker: User;
beforeEach(() => {
  closeDb();
  directory = mkdtempSync(path.join(tmpdir(), 'mg-evidence-'));
  process.env.DEMO_MODE = 'true';
  process.env.DATABASE_PATH = path.join(directory, 'app.sqlite');
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  client = register({
    name: 'Client',
    email: 'client@evidence.test',
    role: 'CLIENT',
    password: 'SecureTest123!',
  });
  worker = register({
    name: 'Worker',
    email: 'worker@evidence.test',
    role: 'FREELANCER',
    password: 'SecureTest123!',
  });
});
afterEach(() => {
  closeDb();
  rmSync(directory, { recursive: true, force: true });
});
function funded(rules: Record<string, unknown> = {}) {
  const input = projectInput(worker.id, now());
  Object.assign(input.milestones[0], { verificationRules: rules });
  const created = action(client, input);
  for (const user of [client, worker])
    action(user, {
      type: 'acceptAgreement',
      projectId: created.project.id,
      agreementId: created.agreement.id,
    });
  const mid = created.agreement.snapshot.milestones[0].id;
  action(client, { type: 'fund', milestoneId: mid });
  action(worker, { type: 'start', milestoneId: mid });
  return mid;
}
const upload = (mid: string, bytes: Uint8Array, name: string) =>
  uploadSubmission(worker, {
    milestoneId: mid,
    description: 'Deliverable submitted for objective and human review.',
    file: {
      name,
      type: 'application/octet-stream',
      size: bytes.length,
      arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    },
  });
it('rejects zero bytes and wrong file types without storing submissions or moving funds', async () => {
  const mid = funded();
  await expect(upload(mid, new Uint8Array(), 'empty.txt')).rejects.toThrow(/empty/);
  await expect(upload(mid, evidence, 'disguised.pdf')).rejects.toThrow(/content/);
  expect(getDb().prepare('SELECT count(*) AS n FROM submissions').get()).toEqual({ n: 0 });
  expect(get('milestones', mid)!.paid).toBe(0);
});
it('rejects corrupt PDF structure even with valid magic bytes and EOF marker', async () => {
  const mid = funded();
  await expect(
    upload(mid, Buffer.from('%PDF-1.7\nthis is not a valid page tree\n%%EOF'), 'corrupt.pdf'),
  ).rejects.toThrow(/Corrupt/);
});
it('parses real PDF pages while keeping semantic criteria pending human review', async () => {
  const mid = funded();
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  const submission = await upload(mid, await pdf.save(), 'valid.pdf');
  expect(submission.verification.facts.pages).toBe(1);
  expect(
    submission.verification.criteria.every((c: { result: string }) => c.result === 'NEEDS_REVIEW'),
  ).toBe(true);
  expect(get('milestones', mid)!.paid).toBe(0);
});
it('fully decodes image content and rejects a truncated PNG with a valid header', async () => {
  const mid = funded();
  const image = await sharp({
    create: { width: 20, height: 15, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  await expect(upload(mid, image.subarray(0, 33), 'truncated.png')).rejects.toThrow(/Corrupt/);
});
it('flags irrelevant but structurally valid text against an agreed phrase and blocks ordinary acceptance', async () => {
  const mid = funded({ requiredText: ['Registration fields are validated'] });
  const s = await upload(mid, Buffer.from('A recipe for making breakfast.'), 'unrelated.txt');
  expect(s.verification.objective[0].result).toBe('FAIL');
  expect(s.verification.objective[0].explanation).toContain('Missing');
  expect(() => action(client, { type: 'review', milestoneId: mid, decision: 'ACCEPT' })).toThrow(
    /Objective checks failed/,
  );
  expect(() => action(client, { type: 'payout', milestoneId: mid })).toThrow();
});
it('passes literal objective evidence while requiring separate human acceptance and payment authorization', async () => {
  const mid = funded({ requiredText: ['Mobile behavior'], requiredFileName: 'evidence.txt' });
  const s = await upload(mid, evidence, 'evidence.txt');
  expect(s.verification.objective.every((c: { result: string }) => c.result === 'PASS')).toBe(true);
  expect(s.verification.objective[0].reference).toContain(s.hash);
  expect(get('milestones', mid)!.paid).toBe(0);
  action(client, { type: 'review', milestoneId: mid, decision: 'ACCEPT' });
  expect(get('milestones', mid)!.paid).toBe(0);
  action(client, { type: 'payout', milestoneId: mid });
  expect(get('milestones', mid)!.paid).toBe(get('milestones', mid)!.budget);
});
it('explains an agreed minimum image dimension failure using decoded dimensions', async () => {
  const mid = funded({ minImageWidth: 100, minImageHeight: 10 });
  const image = await sharp({
    create: { width: 20, height: 15, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  const s = await upload(mid, image, 'small.png');
  expect(s.verification.objective.map((c: { result: string }) => c.result)).toEqual([
    'FAIL',
    'PASS',
  ]);
  expect(s.verification.facts).toMatchObject({ width: 20, height: 15 });
});
it('retains duplicate hashes as a warning and immutable version history after a permitted revision', async () => {
  const mid = funded();
  const first = await upload(mid, evidence, 'first.txt');
  action(client, {
    type: 'review',
    milestoneId: mid,
    decision: 'REVISION',
    criterion: 'Five agreed page names are documented',
    reason: 'Please clarify the agreed page names in the document.',
  });
  const second = await upload(mid, evidence, 'second.txt');
  expect(second.version).toBe(2);
  expect(second.hash).toBe(first.hash);
  expect(
    second.verification.checks.find((c: { name: string }) => c.name === 'Duplicate content').result,
  ).toBe('WARNING');
});
