import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { all, get, put, transaction, type Row } from './db';
import { type User } from './auth';
import { assert } from './errors';
import { projectFor, milestoneFor, text, now, audit, notify, meaningfulActivity } from './service';
import { assistVerification } from './ai';
export interface UploadFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export function canReadSubmission(user: User, s: Row) {
  const p = projectFor(user, s.projectId);
  if (user.role === 'ADMIN' || user.id === p.clientId || user.id === s.freelancerId) return true;
  const m = get('milestones', s.milestoneId)!;
  return user.id === p.freelancerId && m.acceptedSubmissionId === s.id;
}
export function getSubmissionFile(user: User, id: string) {
  const submission = get('submissions', id);
  assert(submission, 'Submission not found', 404);
  assert(
    canReadSubmission(user, submission),
    'This deliverable is not authorized for handover',
    403,
  );
  assert(
    submission.storageName && /^[a-f0-9-]+$/.test(submission.storageName),
    'File unavailable',
    404,
  );
  return {
    submission,
    path: resolve(process.env.UPLOAD_DIR || 'data/uploads', submission.storageName),
  };
}
function detected(bytes: Buffer, ext: string) {
  if (ext === 'pdf' && bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (ext === 'png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (['jpg', 'jpeg'].includes(ext) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  if (['zip', 'pptx'].includes(ext) && bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])))
    return ext === 'zip'
      ? 'application/zip'
      : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (ext === 'mp4' && bytes.subarray(4, 8).toString() === 'ftyp') return 'video/mp4';
  if (ext === 'txt' && !bytes.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return 'text/plain';
    } catch {}
  }
  return null;
}
export async function uploadSubmission(
  user: User,
  input: {
    milestoneId: string;
    description: string;
    url?: string;
    file?: UploadFile;
  },
) {
  const m = milestoneFor(user, input.milestoneId);
  const p = projectFor(user, m.projectId);
  assert(
    p.freelancerId === user.id && m.assignedFreelancerId === user.id && !m.archived,
    'Only the assigned freelancer may submit',
    403,
  );
  assert(p.status === 'ACTIVE', 'Project must have an active agreement');
  assert(
    ['READY_TO_START', 'IN_PROGRESS', 'REVISION_REQUESTED'].includes(m.status),
    'Milestone is not accepting submissions',
  );
  const description = text(input.description, 'Submission description', 10000);
  assert(input.file, 'A deliverable file is required');
  const file = input.file;
  assert(
    file.size > 0 && file.size <= m.maxFileSize && file.size <= 20971520,
    'File is empty or exceeds the agreed size limit',
  );
  const ext = extname(file.name).slice(1).toLowerCase();
  assert(m.allowedTypes.includes(ext), 'File extension is not allowed by the agreement');
  const bytes = Buffer.from(await file.arrayBuffer());
  assert(bytes.length === file.size && bytes.length <= m.maxFileSize, 'File size mismatch');
  const mime = detected(bytes, ext);
  assert(mime, 'File content does not match an allowed safe file type');
  let url: string | undefined;
  if (input.url) {
    let parsed: URL;
    try {
      parsed = new URL(input.url);
    } catch {
      assert(false, 'Use a valid http(s) repository or preview URL');
    }
    assert(
      ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password,
      'Use an http(s) repository or preview URL',
    );
    url = parsed.toString().slice(0, 2000);
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  const duplicate = all('submissions').some((s) => s.milestoneId === m.id && s.hash === hash);
  const checks = [
    { name: 'File present', result: 'PASS', explanation: 'Non-empty deliverable attached.' },
    {
      name: 'File type',
      result: 'PASS',
      explanation: `Detected ${mime}; extension allowed by agreement.`,
    },
    {
      name: 'File size',
      result: 'PASS',
      explanation: `${bytes.length} bytes within the ${m.maxFileSize} byte limit.`,
    },
    {
      name: 'Duplicate content',
      result: duplicate ? 'WARNING' : 'PASS',
      explanation: duplicate
        ? 'Matches an earlier submission; review changes carefully.'
        : 'No identical submission for this milestone.',
    },
  ];
  const ai = await assistVerification(m.criteria, {
    fileName: basename(file.name),
    mime,
    size: file.size,
    description,
  });
  const verification = {
    source: ai?.source || 'Rule-based checks — human review required',
    checks,
    criteria:
      ai?.criteria ||
      m.criteria.map((criterion: string) => ({
        criterion,
        result: 'NEEDS_REVIEW',
        explanation:
          'Requires human review against the signed agreement; no automated quality approval.',
      })),
  };
  const storageName = randomUUID();
  const dir = resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || 'data/uploads');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = resolve(dir, storageName);
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  try {
    return transaction(() => {
      const current = milestoneFor(user, m.id);
      const project = projectFor(user, p.id);
      assert(
        project.freelancerId === user.id && !current.archived && project.status === 'ACTIVE',
        'Assignment changed during upload',
        409,
      );
      assert(
        ['READY_TO_START', 'IN_PROGRESS', 'REVISION_REQUESTED'].includes(current.status),
        'Milestone state changed during upload',
        409,
      );
      const submission = {
        id: randomUUID(),
        projectId: p.id,
        milestoneId: m.id,
        freelancerId: user.id,
        version: all('submissions').filter((s) => s.milestoneId === m.id).length + 1,
        fileName: basename(file.name)
          .replace(/[\r\n\x00-\x1f]/g, '')
          .slice(0, 150),
        mime,
        size: bytes.length,
        hash,
        description,
        url,
        verification,
        storageName,
        createdAt: now(),
      };
      put('submissions', submission);
      current.status = 'SUBMITTED';
      current.submittedAt = now();
      put('milestones', current);
      meaningfulActivity(project);
      audit(p.id, user.id, 'DELIVERABLE_SUBMITTED', {
        milestoneId: m.id,
        submissionId: submission.id,
        hash,
      });
      notify(project, 'A deliverable is ready for review. No payment has been released.');
      const visible: Row = { ...submission };
      delete visible.storageName;
      return visible;
    });
  } catch (e) {
    unlinkSync(path);
    throw e;
  }
}
