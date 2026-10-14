import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { passwordHash, register, type User } from '../src/lib/auth';
import { closeDb, getDb, migrate } from '../src/lib/db';
import { action, bootstrap as rawBootstrap, handoverFor, now, runJobs } from '../src/lib/service';
import type { Bootstrap } from '../src/components/types';
import { getSubmissionFile, uploadSubmission } from '../src/lib/uploads';
import { evidence, projectInput } from './fixtures';

let directory: string;
let client: User, freelancer: User, replacement: User, outsider: User, admin: User;
const bootstrap = (user: User) => rawBootstrap(user) as Bootstrap;
beforeEach(() => {
  closeDb();
  directory = mkdtempSync(path.join(tmpdir(), 'milestoneguard-workflow-'));
  process.env.DEMO_MODE = 'true';
  process.env.DATABASE_PATH = path.join(directory, 'test.sqlite');
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  migrate();
  const account = (name: string, role: 'CLIENT' | 'FREELANCER') =>
    register({
      name,
      email: `${name.toLowerCase()}@example.test`,
      role,
      password: 'SecureTest123!',
    });
  client = account('Client', 'CLIENT');
  freelancer = account('Freelancer', 'FREELANCER');
  replacement = account('Replacement', 'FREELANCER');
  outsider = account('Outsider', 'CLIENT');
  admin = { id: randomUUID(), name: 'Administrator', email: 'admin@example.test', role: 'ADMIN' };
  getDb()
    .prepare('INSERT INTO users VALUES (?,?,?,?,?,?)')
    .run(admin.id, admin.name, admin.email, admin.role, passwordHash('SecureTest123!'), now());
});
afterEach(() => {
  closeDb();
  rmSync(directory, { recursive: true, force: true });
});

function createProject() {
  action(client, projectInput(freelancer.id, now()));
  const data = bootstrap(client);
  const project = data.projects.at(-1)!;
  const milestone = data.milestones.find((m) => m.projectId === project.id)!;
  const agreement = data.agreements.find((a) => a.projectId === project.id)!;
  return { project, milestone, agreement };
}
function agreed() {
  const entities = createProject();
  for (const user of [client, freelancer])
    action(user, {
      type: 'acceptAgreement',
      projectId: entities.project.id,
      agreementId: entities.agreement.id,
    });
  return entities;
}
function funded() {
  const entities = agreed();
  action(client, { type: 'fund', milestoneId: entities.milestone.id });
  action(freelancer, { type: 'start', milestoneId: entities.milestone.id });
  return entities;
}
async function submit(milestoneId: string, content: Buffer = evidence, fileName = 'design.txt') {
  return uploadSubmission(freelancer, {
    milestoneId,
    description: 'All agreed pages and responsive behavior are documented for review.',
    file: {
      name: fileName,
      type: 'text/plain',
      size: content.length,
      arrayBuffer: async () => Uint8Array.from(content).buffer,
    },
  });
}
const milestoneState = (id: string) => bootstrap(client).milestones.find((m) => m.id === id)!;
const milestoneLedger = (id: string) =>
  bootstrap(client).ledger.filter((l) => l.milestoneId === id);

describe('agreement and input invariants', () => {
  it('requires positive integer budgets, matching totals, valid dates, and criteria', () => {
    const invalid = [
      { ...projectInput(freelancer.id, now()), budget: 1 },
      { ...projectInput(freelancer.id, now()), budget: 1_200_000.5 },
      { ...projectInput(freelancer.id, now()), freelancerId: outsider.id },
    ];
    for (const payload of invalid) expect(() => action(client, payload)).toThrow();
    for (const change of [{ budget: 0 }, { criteria: [] }, { dueDate: '1999-01-01' }]) {
      const payload = projectInput(freelancer.id, now());
      Object.assign(payload.milestones[0], change);
      expect(() => action(client, payload)).toThrow();
    }
    expect(bootstrap(client).projects).toHaveLength(0);
  });

  it('requires both parties to accept the same agreement before funding and work', () => {
    const { project, milestone, agreement } = createProject();
    expect(() => action(client, { type: 'fund', milestoneId: milestone.id })).toThrow();
    action(client, { type: 'acceptAgreement', projectId: project.id, agreementId: agreement.id });
    expect(() => action(freelancer, { type: 'start', milestoneId: milestone.id })).toThrow();
    expect(() => action(client, { type: 'fund', milestoneId: milestone.id })).toThrow();
    action(freelancer, {
      type: 'acceptAgreement',
      projectId: project.id,
      agreementId: agreement.id,
    });
    action(client, { type: 'fund', milestoneId: milestone.id });
    expect(milestoneState(milestone.id).funded).toBe(milestone.budget);
  });

  it('preserves signed agreement versions and pauses work until an amendment is mutually accepted', () => {
    const { project, milestone, agreement } = agreed();
    const previous = bootstrap(client).agreements.find((a) => a.id === agreement.id)!;
    action(client, {
      type: 'amend',
      projectId: project.id,
      scope: 'Revised scope with an accessibility checklist.',
      reason: 'Both parties must review the accessibility addition.',
    });
    const versions = bootstrap(client)
      .agreements.filter((a) => a.projectId === project.id)
      .sort((a, b) => a.version - b.version);
    expect(versions).toHaveLength(2);
    expect(versions[0].hash).toBe(previous.hash);
    expect(versions[0].snapshot).toEqual(previous.snapshot);
    expect(versions[1].hash).not.toBe(previous.hash);
    expect(versions[1].version).toBe(2);
    expect(() => action(client, { type: 'fund', milestoneId: milestone.id })).toThrow();
    expect(() =>
      action(freelancer, {
        type: 'acceptAgreement',
        projectId: project.id,
        agreementId: agreement.id,
      }),
    ).toThrow(/newer agreement/);
    expect(() => action(client, { type: 'fund', milestoneId: milestone.id })).toThrow();
    for (const user of [client, freelancer])
      action(user, { type: 'acceptAgreement', projectId: project.id, agreementId: versions[1].id });
    action(client, { type: 'fund', milestoneId: milestone.id });
    expect(milestoneState(milestone.id).funded).toBe(milestone.budget);
  });
});

describe('private workflow and ledger', () => {
  it('completes funding, evidence, acceptance, and exactly one persisted simulated payout', async () => {
    const { milestone } = funded();
    await submit(milestone.id);
    expect(milestoneState(milestone.id).paid).toBe(0);
    expect(() => action(client, { type: 'payout', milestoneId: milestone.id })).toThrow();
    const submissions = bootstrap(client).submissions.filter((s) => s.milestoneId === milestone.id);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].hash).toMatch(/^[a-f0-9]{64}$/);
    expect(submissions[0].verification.checks.length).toBeGreaterThan(0);
    expect(submissions[0].verification.criteria.every((c) => c.result === 'NEEDS_REVIEW')).toBe(
      true,
    );
    action(client, { type: 'review', milestoneId: milestone.id, decision: 'ACCEPT' });
    action(client, { type: 'payout', milestoneId: milestone.id });
    action(client, { type: 'payout', milestoneId: milestone.id });
    expect(milestoneState(milestone.id).paid).toBe(milestone.budget);
    expect(milestoneLedger(milestone.id).filter((l) => l.type === 'PAYOUT')).toHaveLength(1);
    closeDb();
    expect(milestoneState(milestone.id).paid).toBe(milestone.budget);
    expect(() => getDb().prepare('UPDATE ledger SET amount=1').run()).toThrow(/immutable/i);
    expect(() => getDb().prepare('DELETE FROM ledger').run()).toThrow(/immutable/i);
  });

  it('rejects unauthorized project, evidence, approval, funding, and administrator operations', async () => {
    const { project, milestone } = funded();
    await submit(milestone.id);
    const submission = bootstrap(client).submissions.find((s) => s.milestoneId === milestone.id)!;
    expect(bootstrap(outsider).projects).toHaveLength(0);
    expect(bootstrap(outsider).submissions).toHaveLength(0);
    expect(bootstrap(outsider).ledger).toHaveLength(0);
    expect(() => action(outsider, { type: 'fund', milestoneId: milestone.id })).toThrow();
    expect(() =>
      action(freelancer, { type: 'review', milestoneId: milestone.id, decision: 'ACCEPT' }),
    ).toThrow();
    expect(() =>
      action(outsider, {
        type: 'recover',
        projectId: project.id,
        reason: 'Trying to access another project.',
      }),
    ).toThrow();
    expect(() => getSubmissionFile(outsider, submission.id)).toThrow();
    expect(() => getSubmissionFile(replacement, submission.id)).toThrow();
    const file = getSubmissionFile(client, submission.id);
    expect(readFileSync(file.path)).toEqual(evidence);
    expect(() => action(client, { type: 'advanceClock', hours: 72 })).toThrow();
    expect(() => action(freelancer, { type: 'runJobs' })).toThrow();
    expect(() => action(client, { type: 'resetDemo' })).toThrow();
  });

  it('requires checklist-specific revisions, preserves versions, and enforces the revision limit', async () => {
    const { milestone } = funded();
    await submit(milestone.id);
    expect(() =>
      action(client, {
        type: 'review',
        milestoneId: milestone.id,
        decision: 'REVISION',
        reason: 'Add a completely new feature.',
        criterion: 'Not an agreed requirement',
      }),
    ).toThrow();
    for (let revision = 1; revision <= 2; revision++) {
      action(client, {
        type: 'review',
        milestoneId: milestone.id,
        decision: 'REVISION',
        reason: 'Clarify all five agreed page names.',
        criterion: milestone.criteria[0],
      });
      await submit(milestone.id, Buffer.from(`${evidence.toString()} Revision ${revision}.`));
    }
    expect(() =>
      action(client, {
        type: 'review',
        milestoneId: milestone.id,
        decision: 'REVISION',
        reason: 'Another clarification request.',
        criterion: milestone.criteria[0],
      }),
    ).toThrow();
    const versions = bootstrap(client)
      .submissions.filter((s) => s.milestoneId === milestone.id)
      .map((s) => s.version)
      .sort();
    expect(versions).toEqual([1, 2, 3]);
    expect(milestoneState(milestone.id).paid).toBe(0);
  });

  it('rejects empty, unsupported, spoofed, and oversized evidence', async () => {
    const { milestone } = funded();
    await expect(submit(milestone.id, Buffer.alloc(0))).rejects.toThrow();
    await expect(submit(milestone.id, evidence, 'malware.exe')).rejects.toThrow();
    await expect(submit(milestone.id, evidence, 'spoofed.png')).rejects.toThrow();
    await expect(submit(milestone.id, Buffer.alloc(6 * 1024 * 1024, 65))).rejects.toThrow();
    expect(bootstrap(client).submissions).toHaveLength(0);
  });
});

describe('dispute, time, and recovery protections', () => {
  it('hands over only the accepted submission version while preserving private earlier drafts', async () => {
    const { project, milestone } = funded();
    await submit(milestone.id, Buffer.from('Private incomplete design draft.'));
    const draft = bootstrap(client).submissions.find((s) => s.milestoneId === milestone.id)!;
    action(client, {
      type: 'review',
      milestoneId: milestone.id,
      decision: 'REVISION',
      reason: 'Document the agreed pages and mobile behavior.',
      criterion: milestone.criteria[0],
    });
    await submit(milestone.id);
    const accepted = bootstrap(client).submissions.find(
      (s) => s.milestoneId === milestone.id && s.version === 2,
    )!;
    action(client, { type: 'review', milestoneId: milestone.id, decision: 'ACCEPT' });
    action(freelancer, {
      type: 'withdraw',
      projectId: project.id,
      reason: 'Unable to complete the remaining implementation.',
    });
    action(client, {
      type: 'recover',
      projectId: project.id,
      reason: 'Preserve approved design and reassign the unfinished implementation.',
    });
    const recovery = bootstrap(client).recoveries[0];
    const handover = JSON.stringify(handoverFor(client, recovery.id));
    expect(handover).toContain(accepted.id);
    expect(handover).not.toContain(draft.id);
    action(client, {
      type: 'inviteReplacement',
      recoveryId: recovery.id,
      freelancerId: replacement.id,
    });
    expect(() => getSubmissionFile(replacement, draft.id)).toThrow();
    expect(readFileSync(getSubmissionFile(replacement, accepted.id).path)).toEqual(evidence);
    const visible = bootstrap(replacement).submissions;
    expect(visible.some((s) => s.id === accepted.id)).toBe(true);
    expect(visible.some((s) => s.id === draft.id)).toBe(false);
    expect(milestoneState(milestone.id).paid).toBe(0);
  });

  it('blocks disputed payouts and restricts partial settlement to an administrator', async () => {
    const { milestone } = funded();
    await submit(milestone.id);
    action(client, {
      type: 'dispute',
      milestoneId: milestone.id,
      reason: 'The agreed responsive behavior is missing from the evidence.',
    });
    const dispute = bootstrap(client).disputes[0];
    expect(() => action(client, { type: 'payout', milestoneId: milestone.id })).toThrow();
    expect(() =>
      action(client, { type: 'review', milestoneId: milestone.id, decision: 'ACCEPT' }),
    ).toThrow();
    const settlement = {
      type: 'resolve',
      disputeId: dispute.id,
      outcome: 'PARTIAL',
      payoutAmount: 175_000,
      rationale: 'Reviewed the evidence and agreed partial work; return the remainder.',
    };
    expect(() => action(client, settlement)).toThrow();
    expect(() => action(freelancer, settlement)).toThrow();
    expect(() => action(admin, { ...settlement, payoutAmount: milestone.budget + 1 })).toThrow();
    action(admin, settlement);
    expect(milestoneState(milestone.id).paid).toBe(175_000);
    expect(milestoneState(milestone.id).refunded).toBe(125_000);
    const count = milestoneLedger(milestone.id).length;
    try {
      action(admin, settlement);
    } catch {
      /* Rejection or idempotent success is safe. */
    }
    expect(milestoneLedger(milestone.id)).toHaveLength(count);
    expect(milestoneState(milestone.id).paid + milestoneState(milestone.id).refunded).toBe(
      milestone.budget,
    );
  });

  it('refunds at most the remaining funded balance and records only one refund', () => {
    const { milestone } = funded();
    action(client, {
      type: 'dispute',
      milestoneId: milestone.id,
      reason: 'Work cannot continue; request reviewer-authorized refund.',
    });
    const dispute = bootstrap(client).disputes[0];
    const payload = {
      type: 'resolve',
      disputeId: dispute.id,
      outcome: 'REFUND',
      rationale: 'No accepted work is payable; return the funded balance.',
    };
    action(admin, payload);
    try {
      action(admin, payload);
    } catch {
      /* Settled disputes may reject retries. */
    }
    expect(milestoneState(milestone.id).refunded).toBe(milestone.budget);
    expect(milestoneState(milestone.id).paid).toBe(0);
    expect(milestoneLedger(milestone.id).filter((l) => l.type === 'REFUND')).toHaveLength(1);
    expect(() => action(client, { type: 'payout', milestoneId: milestone.id })).toThrow();
  });

  it('records meaningful check-ins, detects inactivity, and never moves money on elapsed time', () => {
    const { project, milestone } = funded();
    expect(() =>
      action(client, {
        type: 'checkin',
        projectId: project.id,
        status: 'ON_TRACK',
        comment: 'Wrong role.',
      }),
    ).toThrow();
    action(freelancer, {
      type: 'checkin',
      projectId: project.id,
      status: 'ON_TRACK',
      comment: 'Responsive design is progressing.',
    });
    action(admin, { type: 'advanceClock', hours: 73 });
    runJobs();
    const data = bootstrap(client);
    expect(data.projects.find((p) => p.id === project.id)!.risk).toBe('AT_RISK');
    expect(data.projects.find((p) => p.id === project.id)!.riskReasons.length).toBeGreaterThan(0);
    expect(data.notifications.length).toBeGreaterThan(0);
    expect(milestoneState(milestone.id).paid).toBe(0);
    expect(milestoneState(milestone.id).refunded).toBe(0);
  });

  it('escalates overdue client review without automatically paying the freelancer', async () => {
    const { milestone } = funded();
    await submit(milestone.id);
    action(admin, { type: 'advanceClock', hours: 73 });
    runJobs();
    const data = bootstrap(admin);
    expect(bootstrap(client).notifications.some((n) => /review|overdue/i.test(n.message))).toBe(
      true,
    );
    expect(data.disputes.some((d) => d.milestoneId === milestone.id && d.status === 'OPEN')).toBe(
      true,
    );
    expect(milestoneState(milestone.id).paid).toBe(0);
    expect(milestoneLedger(milestone.id).filter((l) => l.type === 'PAYOUT')).toHaveLength(0);
  });

  it('protects original funds and unaccepted evidence when inviting a replacement', async () => {
    const { project, milestone } = funded();
    await submit(milestone.id);
    const unaccepted = bootstrap(client).submissions[0];
    action(freelancer, {
      type: 'withdraw',
      projectId: project.id,
      reason: 'Unable to complete the remaining engagement.',
    });
    action(client, {
      type: 'recover',
      projectId: project.id,
      reason: 'Original freelancer requested project withdrawal.',
    });
    const recovery = bootstrap(client).recoveries[0];
    expect(() => handoverFor(outsider, recovery.id)).toThrow();
    const handover = handoverFor(client, recovery.id);
    expect(JSON.stringify(handover)).not.toContain(unaccepted.id);
    expect(() => action(client, { type: 'payout', milestoneId: milestone.id })).toThrow();
    action(client, {
      type: 'inviteReplacement',
      recoveryId: recovery.id,
      freelancerId: replacement.id,
    });
    const updated = bootstrap(client);
    const fresh = updated.milestones.filter(
      (m) => m.projectId === project.id && m.assignedFreelancerId === replacement.id,
    );
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((m) => m.funded === 0 && m.paid === 0)).toBe(true);
    expect(milestoneState(milestone.id).assignedFreelancerId).toBe(freelancer.id);
    expect(milestoneState(milestone.id).funded).toBe(milestone.budget);
    expect(milestoneState(milestone.id).paid).toBe(0);
    expect(() => getSubmissionFile(replacement, unaccepted.id)).toThrow();
    expect(bootstrap(replacement).submissions.some((s) => s.id === unaccepted.id)).toBe(false);
    expect(() => action(replacement, { type: 'start', milestoneId: fresh[0].id })).toThrow();
    const agreement = updated.agreements
      .filter((a) => a.projectId === project.id)
      .sort((a, b) => b.version - a.version)[0];
    for (const user of [client, replacement])
      action(user, { type: 'acceptAgreement', projectId: project.id, agreementId: agreement.id });
    action(client, { type: 'fund', milestoneId: fresh[0].id });
    action(replacement, { type: 'start', milestoneId: fresh[0].id });
    expect(milestoneState(fresh[0].id).funded).toBe(fresh[0].budget);
    expect(milestoneState(milestone.id).paid).toBe(0);
  });
});
