import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDb, get, put, all, demoMode, transaction } from './db';
import { passwordHash, publicUser } from './auth';
import { action, now, runJobs } from './service';
import { assert } from './errors';
export function seedDemo() {
  return transaction(seedInternal);
}
function seedInternal() {
  assert(demoMode(), 'Seeding requires DEMO_MODE=true');
  if (getDb().prepare('SELECT id FROM users LIMIT 1').get()) return { seeded: false };
  const roles = ['CLIENT', 'FREELANCER', 'FREELANCER', 'ADMIN'];
  const names = ['Ananya Sharma', 'Arjun Mehta', 'Priya Iyer', 'Samira Rao'];
  const emails = ['client', 'freelancer', 'replacement', 'admin'];
  const users = emails.map((email, i) => {
    const id = `demo-${email}`;
    getDb()
      .prepare('INSERT INTO users VALUES (?,?,?,?,?,?)')
      .run(
        id,
        names[i],
        `${email}@milestoneguard.demo`,
        roles[i],
        passwordHash('DemoPass123!'),
        now(),
      );
    return publicUser({
      id,
      name: names[i],
      email: `${email}@milestoneguard.demo`,
      role: roles[i],
    });
  });
  const [client, freelancer, replacement, admin] = users;
  const day = (delta: number) => new Date(Date.parse(now()) + delta * 86400000).toISOString();
  function project(title: string, count = 1, firstDue = 7) {
    const result = action(client, {
      type: 'createProject',
      title,
      description:
        'Reproducible demonstration project for an Indian student team. All funds are simulated.',
      category: 'Website Development',
      freelancerId: freelancer.id,
      budget: count * 300000,
      currency: 'INR',
      startDate: day(-14),
      deadline: day(21),
      scope: 'Build and deliver the agreed responsive website pages with editable source files.',
      exclusions: 'Hosting fees and ongoing maintenance are excluded.',
      revisionPolicy: 'Two revisions against the signed criteria.',
      acceptancePolicy:
        'Client reviews each submission within 72 hours; delays escalate to an administrator.',
      disputePolicy: 'Administrator reviews agreement, evidence and statements before settlement.',
      milestones: Array.from({ length: count }, (_, i) => ({
        title: ['Design and source handover', 'Implementation and testing'][i] || 'Delivery',
        description: 'Provide the agreed source deliverable and review notes.',
        requirements: 'Include approved content and editable source files.',
        budget: 300000,
        dueDate: day(firstDue + i * 4),
        criteria: ['Include approved project content.', 'Provide editable source files.'],
        allowedTypes: ['txt', 'pdf', 'png', 'zip'],
        maxFileSize: 10485760,
        revisionLimit: 2,
        reviewHours: 72,
      })),
    });
    action(client, {
      type: 'acceptAgreement',
      projectId: result.project.id,
      agreementId: result.agreement.id,
    });
    action(freelancer, {
      type: 'acceptAgreement',
      projectId: result.project.id,
      agreementId: result.agreement.id,
    });
    return {
      p: result.project,
      ms: all('milestones').filter((m) => m.projectId === result.project.id),
    };
  }
  function submit(mId: string) {
    const m = get('milestones', mId)!;
    action(client, { type: 'fund', milestoneId: mId });
    action(freelancer, { type: 'start', milestoneId: mId });
    const bytes = Buffer.from(
      `MilestoneGuard demonstration deliverable\nProject: ${get('projects', m.projectId)!.title}\nApproved project content and editable source files are represented by this text demonstration. Human review is still required.\n`,
    );
    const storageName = randomUUID();
    const dir = resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || 'data/uploads');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(resolve(dir, storageName), bytes, { mode: 0o600, flag: 'wx' });
    const s = {
      id: randomUUID(),
      projectId: m.projectId,
      milestoneId: mId,
      freelancerId: freelancer.id,
      version: 1,
      fileName: 'demo-deliverable.txt',
      mime: 'text/plain',
      size: bytes.length,
      hash: createHash('sha256').update(bytes).digest('hex'),
      description: 'Demonstration handover with approved project content and editable source.',
      verification: {
        source: 'Rule-based checks — human review required',
        checks: [{ name: 'File content', result: 'PASS', explanation: 'Valid UTF-8 text file.' }],
        criteria: m.criteria.map((criterion: string) => ({
          criterion,
          result: 'NEEDS_REVIEW',
          explanation: 'Reviewer must compare to the agreement.',
        })),
      },
      storageName,
      createdAt: day(-1),
    };
    put('submissions', s);
    const current = get('milestones', mId)!;
    current.status = 'SUBMITTED';
    current.submittedAt = day(-1);
    put('milestones', current);
    return s;
  }
  const completed = project('Campus Fest — completed');
  submit(completed.ms[0].id);
  action(client, { type: 'review', milestoneId: completed.ms[0].id, decision: 'ACCEPT' });
  action(client, { type: 'payout', milestoneId: completed.ms[0].id });
  const active = project('Brew & Bean — active website', 2);
  submit(active.ms[0].id);
  action(client, {
    type: 'review',
    milestoneId: active.ms[0].id,
    decision: 'REVISION',
    reason: 'Add the approved menu copy to the source file.',
    criterion: 'Include approved project content.',
  });
  action(client, { type: 'fund', milestoneId: active.ms[1].id });
  action(freelancer, {
    type: 'checkin',
    projectId: active.p.id,
    status: 'ON_TRACK',
    comment: 'Menu content revision is in progress; next milestone is funded.',
  });
  const overdue = project('Student Society — overdue milestone', 1, -1);
  action(client, { type: 'fund', milestoneId: overdue.ms[0].id });
  action(freelancer, { type: 'start', milestoneId: overdue.ms[0].id });
  const ghost = project('Tech Club — missing check-ins');
  action(client, { type: 'fund', milestoneId: ghost.ms[0].id });
  action(freelancer, { type: 'start', milestoneId: ghost.ms[0].id });
  const gp = get('projects', ghost.p.id)!;
  gp.lastActivityAt = day(-4);
  put('projects', gp);
  const disputed = project('Craft Studio — disputed deliverable');
  submit(disputed.ms[0].id);
  action(client, {
    type: 'dispute',
    milestoneId: disputed.ms[0].id,
    reason:
      'The delivered source lacks approved project content. Please review the signed checklist.',
  });
  const recovery = project('College Launch — project rescue', 2);
  submit(recovery.ms[0].id);
  action(client, { type: 'review', milestoneId: recovery.ms[0].id, decision: 'ACCEPT' });
  action(client, { type: 'payout', milestoneId: recovery.ms[0].id });
  action(client, { type: 'fund', milestoneId: recovery.ms[1].id });
  action(freelancer, {
    type: 'withdraw',
    projectId: recovery.p.id,
    reason: 'Unable to complete remaining work; requesting a structured handover.',
  });
  const rescue = action(client, {
    type: 'recover',
    projectId: recovery.p.id,
    reason: 'Resume remaining work with a replacement while preserving accepted work.',
  });
  const dispute = action(client, {
    type: 'dispute',
    milestoneId: recovery.ms[1].id,
    reason: 'Refund unfinished milestone after freelancer withdrawal.',
  });
  action(admin, {
    type: 'resolve',
    disputeId: dispute.dispute.id,
    outcome: 'REFUND',
    rationale: 'Both parties confirm no work was submitted for this remaining milestone.',
  });
  action(client, {
    type: 'inviteReplacement',
    recoveryId: rescue.recovery.id,
    freelancerId: replacement.id,
  });
  const partial = project('Design Sprint — partial settlement');
  submit(partial.ms[0].id);
  const pd = action(client, {
    type: 'dispute',
    milestoneId: partial.ms[0].id,
    reason: 'Partially delivered agreed scope; requesting proportional settlement.',
  });
  action(admin, {
    type: 'resolve',
    disputeId: pd.dispute.id,
    outcome: 'PARTIAL',
    payoutAmount: 180000,
    rationale:
      'Accepted source content accounts for 60% of the agreed milestone; refund remaining 40%.',
  });
  const pp = get('projects', partial.p.id)!;
  pp.status = 'COMPLETED';
  put('projects', pp);
  runJobs();
  return { seeded: true, projects: all('projects').length };
}
export function resetDemo() {
  assert(demoMode(), 'Reset requires DEMO_MODE=true');
  return transaction(() => {
    const d = getDb();
    d.exec('DROP TRIGGER immutable_ledger_delete;');
    for (const table of [
      'sessions',
      'payment_intents',
      'ledger',
      'submissions',
      'agreements',
      'disputes',
      'recoveries',
      'checkins',
      'notifications',
      'audit',
      'milestones',
      'projects',
      'users',
      'settings',
      'rate_limits',
    ])
      d.exec(`DELETE FROM ${table}`);
    d.exec(
      "CREATE TRIGGER immutable_ledger_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger is immutable'); END;",
    );
    return seedInternal();
  });
}
