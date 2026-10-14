import { randomUUID, createHash } from 'node:crypto';
import { all, get, put, getDb, transaction, demoMode, type Row } from './db';
import { assert } from './errors';
import { publicUser, type User } from './auth';
import { paymentAdapter } from './payments';
export { now } from './time';
import { now } from './time';
const stamp = () => now();
export function text(v: unknown, label: string, max = 10000) {
  assert(
    typeof v === 'string' && v.trim().length > 0 && v.length <= max,
    `${label} is required (maximum ${max} characters)`,
  );
  return v.trim();
}
function number(v: unknown, label: string, min = 1, max = 1000000000) {
  assert(
    typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max,
    `${label} must be an integer between ${min} and ${max}`,
  );
  return v;
}
function date(v: unknown, label: string) {
  const value = text(v, label, 50);
  assert(Number.isFinite(Date.parse(value)), `Invalid ${label}`);
  return new Date(value).toISOString();
}
export function projectFor(user: User, id: string) {
  const p = get('projects', id);
  assert(p, 'Project not found', 404);
  assert(
    user.role === 'ADMIN' ||
      p.clientId === user.id ||
      p.freelancerId === user.id ||
      p.priorFreelancerIds?.includes(user.id),
    'Not authorized for this project',
    403,
  );
  return p;
}
export function milestoneFor(user: User, id: string) {
  const m = get('milestones', id);
  assert(m, 'Milestone not found', 404);
  projectFor(user, m.projectId);
  return m;
}
const client = (u: User, p: Row) =>
  assert(u.id === p.clientId, 'Only the project client may perform this action', 403);
const freelancer = (u: User, p: Row) =>
  assert(u.id === p.freelancerId, 'Only the assigned freelancer may perform this action', 403);
const admin = (u: User) => assert(u.role === 'ADMIN', 'Administrator access required', 403);
export function audit(projectId: string | null, actorId: string, action: string, detail: unknown) {
  put('audit', { id: randomUUID(), projectId, actorId, action, detail, createdAt: stamp() });
}
export function notify(p: Row, message: string) {
  for (const userId of new Set([p.clientId, p.freelancerId]))
    put('notifications', {
      id: randomUUID(),
      userId,
      projectId: p.id,
      message,
      read: false,
      createdAt: stamp(),
    });
}
export function meaningfulActivity(p: Row) {
  p.lastActivityAt = stamp();
  p.missedCheckins = 0;
  put('projects', p);
}
function active(p: Row) {
  assert(p.status === 'ACTIVE', 'Project requires an active, mutually signed agreement');
}
function undisputed(m: Row) {
  assert(
    !all('disputes').some((d) => d.milestoneId === m.id && d.status === 'OPEN'),
    'Open dispute blocks this action',
    409,
  );
}
export function snapshot(p: Row, ms: Row[]) {
  return {
    project: {
      title: p.title,
      description: p.description,
      scope: p.scope,
      exclusions: p.exclusions,
      revisionPolicy: p.revisionPolicy,
      acceptancePolicy: p.acceptancePolicy,
      disputePolicy: p.disputePolicy,
      budget: p.budget,
      currency: p.currency,
      startDate: p.startDate,
      deadline: p.deadline,
      clientId: p.clientId,
      freelancerId: p.freelancerId,
    },
    milestones: ms.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      requirements: m.requirements,
      budget: m.budget,
      dueDate: m.dueDate,
      criteria: m.criteria,
      allowedTypes: m.allowedTypes,
      maxFileSize: m.maxFileSize,
      revisionLimit: m.revisionLimit,
      reviewHours: m.reviewHours,
      assignedFreelancerId: m.assignedFreelancerId,
    })),
  };
}
export function agreement(p: Row, snap: Row, reason?: string) {
  const a = {
    id: randomUUID(),
    projectId: p.id,
    version: all('agreements').filter((a) => a.projectId === p.id).length + 1,
    snapshot: snap,
    hash: createHash('sha256').update(JSON.stringify(snap)).digest('hex'),
    clientAcceptedAt: null,
    freelancerAcceptedAt: null,
    createdAt: stamp(),
    status: 'PENDING',
    reason,
  };
  put('agreements', a);
  return a;
}
function createProject(user: User, b: Row) {
  assert(user.role === 'CLIENT', 'Client access required', 403);
  const target = getDb()
    .prepare("SELECT id FROM users WHERE id=? AND role='FREELANCER'")
    .get(b.freelancerId || '');
  assert(target, 'Choose a registered freelancer');
  const p: Row = {
    id: randomUUID(),
    clientId: user.id,
    freelancerId: b.freelancerId,
    title: text(b.title, 'Title', 200),
    description: text(b.description, 'Description'),
    category: text(b.category, 'Category', 100),
    budget: number(b.budget, 'Budget'),
    currency: 'INR',
    startDate: date(b.startDate, 'start date'),
    deadline: date(b.deadline, 'deadline'),
    scope: text(b.scope, 'Scope'),
    exclusions: typeof b.exclusions === 'string' ? b.exclusions.slice(0, 10000) : '',
    revisionPolicy: text(b.revisionPolicy, 'Revision policy'),
    acceptancePolicy: text(b.acceptancePolicy, 'Acceptance policy'),
    disputePolicy: text(b.disputePolicy, 'Dispute policy'),
    status: 'AWAITING_AGREEMENT',
    risk: 'HEALTHY',
    riskReasons: [],
    lastActivityAt: stamp(),
    createdAt: stamp(),
    priorFreelancerIds: [],
  };
  assert(!b.currency || b.currency === 'INR', 'Only INR is supported');
  assert(p.deadline >= p.startDate, 'Deadline must follow project start');
  assert(
    Array.isArray(b.milestones) && b.milestones.length > 0 && b.milestones.length <= 30,
    'Add 1–30 milestones',
  );
  const ms = b.milestones.map((v: Row) => {
    assert(
      Array.isArray(v.criteria) && v.criteria.length > 0 && v.criteria.length <= 30,
      'Acceptance criteria are required',
    );
    assert(
      Array.isArray(v.allowedTypes) &&
        v.allowedTypes.length > 0 &&
        v.allowedTypes.every(
          (t: unknown) =>
            typeof t === 'string' &&
            ['pdf', 'png', 'jpg', 'jpeg', 'txt', 'zip', 'pptx', 'mp4'].includes(
              t.replace(/^\./, '').toLowerCase(),
            ),
        ),
      'Choose supported upload extensions',
    );
    const m = {
      id: randomUUID(),
      projectId: p.id,
      title: text(v.title, 'Milestone title', 200),
      description: text(v.description, 'Milestone description'),
      requirements: text(v.requirements, 'Requirements'),
      budget: number(v.budget, 'Milestone budget'),
      dueDate: date(v.dueDate, 'milestone due date'),
      criteria: v.criteria.map((c: unknown) => text(c, 'Criterion', 500)),
      allowedTypes: v.allowedTypes.map((t: string) => t.replace(/^\./, '').toLowerCase()),
      maxFileSize: number(v.maxFileSize ?? 10485760, 'Maximum file size', 1, 20971520),
      revisionLimit: number(v.revisionLimit ?? 2, 'Revision limit', 0, 10),
      reviewHours: number(v.reviewHours ?? 72, 'Review window', 1, 720),
      status: 'AWAITING_AGREEMENT',
      paymentStatus: 'UNFUNDED',
      funded: 0,
      paid: 0,
      refunded: 0,
      revisionCount: 0,
      assignedFreelancerId: p.freelancerId,
    };
    assert(
      m.dueDate >= p.startDate && m.dueDate <= p.deadline,
      'Milestone dates must be within project dates',
    );
    return m;
  });
  assert(
    ms.reduce((s: number, m: Row) => s + m.budget, 0) === p.budget,
    'Milestone budgets must equal the project budget',
  );
  put('projects', p);
  ms.forEach((m: Row) => put('milestones', m));
  const a = agreement(p, snapshot(p, ms));
  audit(p.id, user.id, 'PROJECT_CREATED', 'Project and agreement created');
  notify(p, 'A new project agreement is ready for both parties to review.');
  return { project: p, agreement: a };
}
function payout(m: Row) {
  undisputed(m);
  assert(
    m.status === 'ACCEPTED' || m.status === 'RELEASED',
    'Client acceptance or authorized settlement is required',
  );
  assert(
    all('submissions').some((s) => s.milestoneId === m.id),
    'Deliverable evidence is required',
  );
  if (m.paid > 0) return;
  assert(m.funded === m.budget && m.refunded === 0, 'Milestone must be fully funded');
  const intent = paymentAdapter.requestPayout(m.id, m.funded, `payout:${m.id}`);
  paymentAdapter.confirmPayout(intent.id);
  m = get('milestones', m.id)!;
  m.status = 'RELEASED';
  put('milestones', m);
  const p = get('projects', m.projectId)!;
  const ms = all('milestones').filter((v) => v.projectId === p.id && !v.archived);
  if (ms.every((v) => v.status === 'RELEASED')) {
    p.status = 'COMPLETED';
    put('projects', p);
  }
}
export function bootstrap(user: User) {
  const projects = all('projects').filter(
    (p) =>
      user.role === 'ADMIN' ||
      p.clientId === user.id ||
      p.freelancerId === user.id ||
      p.priorFreelancerIds?.includes(user.id),
  );
  const byId = new Map(projects.map((p) => [p.id, p]));
  const data: Row = {
    user,
    projects: projects.map((p) => {
      if (user.role === 'ADMIN' || p.clientId === user.id || p.freelancerId === user.id) return p;
      const old = all('agreements')
        .filter((a) => a.projectId === p.id && a.snapshot.project.freelancerId === user.id)
        .sort((a, b) => b.version - a.version)[0];
      return {
        ...p,
        ...old?.snapshot.project,
        status: 'RECOVERY_PENDING',
        riskReasons: ['Your original engagement is in recovery.'],
      };
    }),
    users: (getDb().prepare('SELECT * FROM users').all() as Row[])
      .filter(
        (u) =>
          u.role === 'FREELANCER' ||
          u.id === user.id ||
          user.role === 'ADMIN' ||
          projects.some((p) => p.clientId === u.id),
      )
      .map(publicUser),
    now: now(),
    demoMode: demoMode(),
  };
  function permitted(r: Row, table: string) {
    const p = byId.get(r.projectId);
    if (!p) return user.role === 'ADMIN' && !r.projectId;
    if (user.role === 'ADMIN' || p.clientId === user.id) return true;
    const prior = p.priorFreelancerIds?.includes(user.id);
    const m = r.milestoneId ? get('milestones', r.milestoneId) : undefined;
    if (table === 'submissions')
      return (
        r.freelancerId === user.id ||
        (p.freelancerId === user.id && m?.acceptedSubmissionId === r.id)
      );
    if (table === 'milestones')
      return (
        r.assignedFreelancerId === user.id ||
        (p.freelancerId === user.id && Boolean(r.acceptedSubmissionId))
      );
    if (table === 'agreements') return r.snapshot.project.freelancerId === user.id;
    if (table === 'ledger' || table === 'disputes') return m?.assignedFreelancerId === user.id;
    if (table === 'checkins') return r.freelancerId === user.id;
    if (table === 'audit')
      return r.actorId === user.id || (!prior && !p.priorFreelancerIds?.length);
    if (table === 'recoveries') return !prior;
    return !prior;
  }
  for (const table of [
    'milestones',
    'agreements',
    'submissions',
    'ledger',
    'disputes',
    'recoveries',
    'checkins',
    'audit',
  ])
    data[table] = all(table)
      .filter((r) => permitted(r, table))
      .map((r) => {
        const clean = { ...r };
        delete clean.storageName;
        return clean;
      });
  data.notifications = all('notifications').filter((r) => r.userId === user.id);
  return data;
}
export function action(user: User, b: Row): Row {
  assert(b && typeof b === 'object', 'Invalid action');
  if (b.type === 'resetDemo') {
    admin(user);
    assert(demoMode(), 'Demo controls disabled');
    throw new Error('Use the resetDemo route handler');
  }
  return transaction(() => perform(user, b));
}
function perform(user: User, b: Row): Row {
  if (b.type === 'createProject') return { ok: true, ...createProject(user, b) };
  if (b.type === 'updateProfile') {
    const name = text(b.name, 'Name', 100);
    getDb().prepare('UPDATE users SET name=? WHERE id=?').run(name, user.id);
    return { ok: true };
  }
  if (b.type === 'markRead') {
    for (const n of all('notifications').filter(
      (n) => n.userId === user.id && (b.notificationId === 'all' || n.id === b.notificationId),
    )) {
      n.read = true;
      put('notifications', n);
    }
    return { ok: true };
  }
  if (b.type === 'advanceClock') {
    admin(user);
    assert(demoMode(), 'Demo controls disabled');
    const hours = number(b.hours, 'Hours', 1, 720);
    const current = Number(
      (
        getDb().prepare("SELECT value FROM settings WHERE key='clockOffset'").get() as
          Row | undefined
      )?.value || 0,
    );
    getDb()
      .prepare(
        "INSERT INTO settings VALUES ('clockOffset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(String(current + hours * 3600000));
    const result = runJobsInternal();
    audit(null, user.id, 'DEMO_CLOCK_ADVANCED', { hours });
    return { ok: true, ...result };
  }
  if (b.type === 'runJobs') {
    admin(user);
    return { ok: true, ...runJobsInternal() };
  }
  if (b.type === 'statement' || b.type === 'resolve') {
    const d = get('disputes', b.disputeId);
    assert(d, 'Dispute not found', 404);
    const p = projectFor(user, d.projectId);
    assert(d.status === 'OPEN', 'Dispute is already resolved', 409);
    if (b.type === 'statement') {
      const disputed = get('milestones', d.milestoneId)!;
      assert(
        user.role === 'ADMIN' ||
          user.id === p.clientId ||
          user.id === disputed.assignedFreelancerId,
        'Only dispute parties may submit statements',
        403,
      );
      d.statements.push({ userId: user.id, text: text(b.text, 'Statement'), createdAt: stamp() });
      put('disputes', d);
      audit(p.id, user.id, 'DISPUTE_STATEMENT', { disputeId: d.id });
      return { ok: true };
    }
    admin(user);
    return resolveDispute(user, d, p, b);
  }
  if (b.type === 'inviteReplacement') {
    const r = get('recoveries', b.recoveryId);
    assert(r, 'Recovery not found', 404);
    const p = projectFor(user, r.projectId);
    client(user, p);
    assert(r.status === 'OPEN', 'Replacement already invited');
    assert(
      getDb()
        .prepare("SELECT id FROM users WHERE id=? AND role='FREELANCER'")
        .get(b.freelancerId || ''),
      'Select a registered freelancer',
    );
    assert(b.freelancerId !== p.freelancerId, 'Choose a different freelancer');
    assert(
      !all('agreements').some((a) => a.projectId === p.id && a.status === 'PENDING'),
      'Resolve pending agreement first',
    );
    const remaining = all('milestones').filter(
      (m) =>
        m.projectId === p.id &&
        !m.archived &&
        !['RELEASED', 'SETTLED'].includes(m.status) &&
        !m.acceptedAt,
    );
    assert(remaining.length > 0, 'No work remains to transfer');
    const old = p.freelancerId;
    p.priorFreelancerIds = [...new Set([...(p.priorFreelancerIds || []), old])];
    p.freelancerId = b.freelancerId;
    p.status = 'AWAITING_AGREEMENT';
    p.budget = remaining.reduce((sum: number, m: Row) => sum + m.budget, 0);
    p.startDate = stamp();
    p.deadline = new Date(Date.parse(stamp()) + 30 * 86400000).toISOString();
    p.risk = 'HEALTHY';
    delete p.withdrawalRequestedAt;
    delete p.withdrawalReason;
    delete p.interventionAt;
    delete p.interventionReason;
    p.riskReasons = [];
    p.lastActivityAt = stamp();
    put('projects', p);
    const fresh = remaining.map((m) => {
      m.archived = true;
      if (m.funded > m.paid + m.refunded) m.status = 'RECOVERY_PENDING';
      put('milestones', m);
      const copy = {
        ...m,
        id: randomUUID(),
        assignedFreelancerId: b.freelancerId,
        status: 'AWAITING_AGREEMENT',
        paymentStatus: 'UNFUNDED',
        funded: 0,
        paid: 0,
        refunded: 0,
        revisionCount: 0,
        archived: false,
        sourceMilestoneId: m.id,
        submittedAt: null,
        acceptedAt: null,
        acceptedSubmissionId: null,
        acceptedBy: null,
        revisionReason: null,
        revisionCriterion: null,
        dueDate: new Date(Date.parse(stamp()) + 14 * 86400000).toISOString(),
      };
      put('milestones', copy);
      return copy;
    });
    const a = agreement(
      p,
      snapshot(p, fresh),
      'Replacement engagement; no prior funds or entitlement transfer',
    );
    r.status = 'REPLACEMENT_INVITED';
    r.replacementId = b.freelancerId;
    r.agreementId = a.id;
    put('recoveries', r);
    notify(p, 'Replacement agreement created. New work requires separate simulated funding.');
    audit(p.id, user.id, 'REPLACEMENT_INVITED', {
      recoveryId: r.id,
      previousFreelancer: old,
      replacementId: b.freelancerId,
    });
    return { ok: true, agreement: a };
  }
  const m = b.milestoneId ? milestoneFor(user, b.milestoneId) : undefined;
  const p = projectFor(user, b.projectId || m?.projectId);
  if (m) assert(m.projectId === p.id, 'Milestone does not belong to project');
  switch (b.type) {
    case 'acceptAgreement': {
      assert(
        user.id === p.clientId || user.id === p.freelancerId,
        'Only contract parties may sign',
        403,
      );
      const a = get('agreements', b.agreementId);
      assert(a && a.projectId === p.id, 'Agreement not found', 404);
      assert(a.status === 'PENDING' || a.status === 'ACTIVE', 'Agreement is not pending');
      assert(
        a.snapshot.project.clientId === p.clientId &&
          a.snapshot.project.freelancerId === p.freelancerId,
        'Agreement belongs to previous parties',
      );
      assert(
        createHash('sha256').update(JSON.stringify(a.snapshot)).digest('hex') === a.hash,
        'Agreement integrity check failed',
        409,
      );
      if (a.status === 'ACTIVE') {
        assert(
          !all('agreements').some(
            (v) => v.projectId === p.id && v.version > a.version && v.status === 'PENDING',
          ),
          'A newer agreement requires review',
          409,
        );
        return { ok: true };
      }
      const field = user.id === p.clientId ? 'clientAcceptedAt' : 'freelancerAcceptedAt';
      a[field] ||= stamp();
      if (a.clientAcceptedAt && a.freelancerAcceptedAt) {
        for (const old of all('agreements').filter(
          (x) => x.projectId === p.id && x.status === 'ACTIVE',
        )) {
          old.status = 'SUPERSEDED';
          put('agreements', old);
        }
        a.status = 'ACTIVE';
        Object.assign(p, a.snapshot.project, { status: 'ACTIVE', lastActivityAt: stamp() });
        put('projects', p);
        for (const agreed of a.snapshot.milestones) {
          const current = get('milestones', agreed.id)!;
          assert(current, 'Agreement milestone missing');
          Object.assign(current, agreed);
          if (current.status === 'AWAITING_AGREEMENT') current.status = 'AWAITING_FUNDING';
          put('milestones', current);
        }
        for (const recovery of all('recoveries').filter((r) => r.agreementId === a.id)) {
          recovery.status = 'RESUMED';
          put('recoveries', recovery);
        }
      }
      put('agreements', a);
      audit(p.id, user.id, 'AGREEMENT_ACCEPTED', {
        agreementId: a.id,
        version: a.version,
        hash: a.hash,
      });
      notify(
        p,
        `Agreement v${a.version} ${a.status === 'ACTIVE' ? 'is active' : 'received a signature'}.`,
      );
      break;
    }
    case 'rejectAgreement': {
      assert(
        user.id === p.clientId || user.id === p.freelancerId,
        'Only contract parties may reject',
        403,
      );
      const a = get('agreements', b.agreementId);
      assert(a && a.projectId === p.id && a.status === 'PENDING', 'Pending agreement not found');
      a.status = 'REJECTED';
      a.rejectionReason = text(b.reason, 'Rejection reason');
      put('agreements', a);
      p.status = all('agreements').some((a) => a.projectId === p.id && a.status === 'ACTIVE')
        ? 'ACTIVE'
        : 'CANCELLED';
      put('projects', p);
      audit(p.id, user.id, 'AGREEMENT_REJECTED', a.rejectionReason);
      break;
    }
    case 'fund': {
      client(user, p);
      assert(m && !m.archived, 'Current milestone required');
      if (m.funded > 0) return { ok: true };
      active(p);
      assert(m.status === 'AWAITING_FUNDING', 'Milestone cannot be funded in its current state');
      const intent = paymentAdapter.createFundingIntent(m.id, m.budget, `fund:${m.id}`);
      paymentAdapter.confirmFunding(intent.id);
      const funded = get('milestones', m.id)!;
      funded.status = 'READY_TO_START';
      put('milestones', funded);
      notify(p, 'Simulated funding confirmed. Milestone is ready to start.');
      audit(p.id, user.id, 'SIMULATED_FUNDING_CONFIRMED', { milestoneId: m.id, amount: m.budget });
      break;
    }
    case 'start': {
      freelancer(user, p);
      active(p);
      assert(
        m && !m.archived && m.assignedFreelancerId === user.id,
        'Assigned current milestone required',
        403,
      );
      assert(m.status === 'READY_TO_START', 'Milestone must be funded before starting');
      m.status = 'IN_PROGRESS';
      put('milestones', m);
      meaningfulActivity(p);
      audit(p.id, user.id, 'WORK_STARTED', { milestoneId: m.id });
      break;
    }
    case 'checkin': {
      freelancer(user, p);
      active(p);
      assert(
        ['ON_TRACK', 'BLOCKED', 'NEED_EXTENSION'].includes(b.status),
        'Invalid check-in status',
      );
      const c = {
        id: randomUUID(),
        projectId: p.id,
        freelancerId: user.id,
        status: b.status,
        comment: text(b.comment, 'Progress update', 3000),
        createdAt: stamp(),
      };
      put('checkins', c);
      meaningfulActivity(p);
      audit(p.id, user.id, 'PROGRESS_CHECKIN', c);
      notify(p, `Progress update: ${b.status.replaceAll('_', ' ')}.`);
      break;
    }
    case 'review': {
      client(user, p);
      active(p);
      assert(m && !m.archived, 'Current milestone required');
      undisputed(m);
      assert(['SUBMITTED', 'IN_REVIEW'].includes(m.status), 'Milestone is not awaiting review');
      assert(['ACCEPT', 'REVISION'].includes(b.decision), 'Invalid review decision');
      assert(
        all('submissions').some((s) => s.milestoneId === m.id),
        'Evidence is required',
      );
      if (b.decision === 'ACCEPT') {
        m.status = 'ACCEPTED';
        m.acceptedAt = stamp();
        m.acceptedBy = user.id;
        m.acceptedSubmissionId = all('submissions')
          .filter((s) => s.milestoneId === m.id)
          .sort((a, b) => b.version - a.version)[0].id;
      } else {
        assert(
          m.revisionCount < m.revisionLimit,
          'Revision limit reached. Use a dispute for unresolved concerns.',
        );
        const reason = text(b.reason, 'Revision reason');
        const criterion = text(b.criterion, 'Agreed acceptance criterion');
        assert(
          m.criteria.includes(criterion),
          'Revision must identify an existing acceptance criterion',
        );
        m.status = 'REVISION_REQUESTED';
        m.revisionCount++;
        m.revisionReason = reason;
        m.revisionCriterion = criterion;
      }
      put('milestones', m);
      audit(p.id, user.id, b.decision === 'ACCEPT' ? 'MILESTONE_ACCEPTED' : 'REVISION_REQUESTED', {
        milestoneId: m.id,
        reason: b.reason,
        criterion: b.criterion,
      });
      notify(
        p,
        b.decision === 'ACCEPT'
          ? 'Milestone accepted. Simulated payout is eligible.'
          : 'A revision was requested against an agreed criterion.',
      );
      break;
    }
    case 'payout': {
      assert(
        user.id === p.clientId || user.id === m?.assignedFreelancerId || user.role === 'ADMIN',
        'Not authorized to request payout',
        403,
      );
      assert(m && !m.archived, 'Current milestone required');
      if (m.paid > 0 && m.status === 'RELEASED') return { ok: true };
      active(p);
      payout(m);
      notify(p, 'Simulated payout confirmed. No real bank transfer was made.');
      audit(p.id, user.id, 'SIMULATED_PAYOUT_CONFIRMED', { milestoneId: m.id });
      break;
    }
    case 'amend': {
      assert(
        user.id === p.clientId || user.id === p.freelancerId,
        'Only contract parties may propose amendments',
        403,
      );
      active(p);
      assert(
        !all('agreements').some((a) => a.projectId === p.id && a.status === 'PENDING'),
        'An amendment is already pending',
      );
      const reason = text(b.reason, 'Amendment reason');
      assert(b.scope || b.dueDate, 'Specify a scope or due-date amendment');
      const snap = snapshot(
        p,
        all('milestones').filter((m) => m.projectId === p.id && !m.archived),
      );
      if (b.scope) snap.project.scope = text(b.scope, 'Scope');
      if (b.dueDate) {
        assert(m && !m.archived, 'Current milestone required');
        assert(
          !['ACCEPTED', 'RELEASED', 'REFUNDED', 'CANCELLED'].includes(m.status),
          'Cannot amend a settled milestone',
        );
        const due = date(b.dueDate, 'due date');
        assert(
          due >= p.startDate && due <= p.deadline,
          'Due date must remain within project dates',
        );
        snap.milestones.find((v: Row) => v.id === m.id)!.dueDate = due;
      }
      const a = agreement(p, snap, reason);
      p.status = 'AMENDMENT_PENDING';
      put('projects', p);
      audit(p.id, user.id, 'AMENDMENT_PROPOSED', { agreementId: a.id, reason });
      notify(p, 'An amendment needs both signatures. Work is paused.');
      return { ok: true, agreement: a };
    }
    case 'dispute': {
      assert(m, 'Milestone required');
      assert(
        user.id === p.clientId || user.id === m.assignedFreelancerId,
        'Only milestone parties may dispute',
        403,
      );
      assert(m.funded > m.paid + m.refunded, 'No unresolved protected funds remain');
      undisputed(m);
      const d = createDispute(p, m, user.id, text(b.reason, 'Dispute reason'));
      return { ok: true, dispute: d };
    }
    case 'intervene': {
      assert(
        user.id === p.clientId || user.role === 'ADMIN',
        'Client or administrator required',
        403,
      );
      assert(!['COMPLETED', 'CANCELLED'].includes(p.status), 'Project is closed');
      p.interventionAt = stamp();
      p.interventionReason = text(b.reason, 'Intervention reason');
      put('projects', p);
      audit(p.id, user.id, 'INTERVENTION_REQUESTED', p.interventionReason);
      notify(p, 'An intervention has been requested. Please post a progress update.');
      break;
    }
    case 'withdraw': {
      freelancer(user, p);
      assert(!['COMPLETED', 'CANCELLED'].includes(p.status), 'Project is closed');
      const reason = text(b.reason, 'Withdrawal reason');
      p.withdrawalRequestedAt = stamp();
      p.withdrawalReason = reason;
      p.risk = 'AT_RISK';
      p.riskReasons = ['Freelancer requested withdrawal'];
      put('projects', p);
      audit(p.id, user.id, 'WITHDRAWAL_REQUESTED', reason);
      notify(p, 'Freelancer requested withdrawal. Client can initiate recovery.');
      break;
    }
    case 'recover': {
      assert(
        user.id === p.clientId || user.role === 'ADMIN',
        'Client or administrator required',
        403,
      );
      assert(
        ['ACTIVE', 'AMENDMENT_PENDING'].includes(p.status),
        'Project cannot enter recovery in its current state',
      );
      assert(
        !all('recoveries').some((r) => r.projectId === p.id && r.status === 'OPEN'),
        'Recovery already open',
      );
      const reason = text(b.reason, 'Recovery reason');
      assert(
        p.risk === 'AT_RISK' || p.interventionAt || p.withdrawalRequestedAt,
        'Request an intervention or document an at-risk state first',
      );
      for (const a of all('agreements').filter(
        (a) => a.projectId === p.id && a.status === 'PENDING',
      )) {
        a.status = 'WITHDRAWN';
        put('agreements', a);
      }
      const milestones = all('milestones').filter((m) => m.projectId === p.id && !m.archived);
      const completedIds = new Set(
        milestones.filter((m) => ['ACCEPTED', 'RELEASED'].includes(m.status)).map((m) => m.id),
      );
      const handover = {
        projectTitle: p.title,
        scope: p.scope,
        generatedAt: stamp(),
        completedMilestones: milestones.filter((m) => completedIds.has(m.id)),
        remainingWork: milestones
          .filter((m) => !completedIds.has(m.id))
          .map((m) => ({
            id: m.id,
            title: m.title,
            requirements: m.requirements,
            criteria: m.criteria,
          })),
        authorizedSubmissions: all('submissions')
          .filter(
            (s) =>
              s.projectId === p.id &&
              completedIds.has(s.milestoneId) &&
              milestones.some((m) => m.id === s.milestoneId && m.acceptedSubmissionId === s.id),
          )
          .map((s) => ({
            id: s.id,
            fileName: s.fileName,
            hash: s.hash,
            description: s.description,
          })),
        restriction:
          'Only accepted deliverables are included. Unresolved funds and previous freelancer entitlements remain separate.',
      };
      const r = {
        id: randomUUID(),
        projectId: p.id,
        reason,
        status: 'OPEN',
        handover,
        createdAt: stamp(),
      };
      put('recoveries', r);
      p.status = 'RECOVERY_PENDING';
      put('projects', p);
      for (const current of milestones.filter(
        (m) => !['ACCEPTED', 'RELEASED', 'REFUNDED', 'CANCELLED', 'SETTLED'].includes(m.status),
      )) {
        current.status = 'RECOVERY_PENDING';
        put('milestones', current);
      }
      audit(p.id, user.id, 'RECOVERY_CREATED', { recoveryId: r.id, reason });
      notify(p, 'Recovery opened. Unresolved simulated funds are restricted.');
      return { ok: true, recovery: r };
    }
    default:
      assert(false, 'Unknown action');
  }
  return { ok: true };
}
export function createDispute(p: Row, m: Row, openedBy: string, reason: string) {
  const d = {
    id: randomUUID(),
    projectId: p.id,
    milestoneId: m.id,
    openedBy,
    reason,
    status: 'OPEN',
    previousStatus: m.status,
    statements: [],
    createdAt: stamp(),
  };
  put('disputes', d);
  m.status = 'DISPUTED';
  m.paymentStatus = 'BLOCKED';
  put('milestones', m);
  audit(p.id, openedBy, 'DISPUTE_OPENED', { disputeId: d.id, reason });
  notify(p, 'A dispute is open. Payment release is blocked pending authorized resolution.');
  return d;
}
function resolveDispute(user: User, d: Row, p: Row, b: Row) {
  const m = get('milestones', d.milestoneId)!;
  const outcome = b.outcome;
  assert(
    ['RELEASE', 'REFUND', 'PARTIAL', 'REVISION', 'CONTINUE', 'CANCEL'].includes(outcome),
    'Unsupported resolution',
  );
  const rationale = text(b.rationale, 'Resolution rationale');
  const remaining = m.funded - m.paid - m.refunded;
  assert(remaining > 0, 'No unsettled funds');
  let pay = 0,
    refund = 0;
  if (outcome === 'RELEASE') pay = remaining;
  if (['REFUND', 'CANCEL'].includes(outcome)) refund = remaining;
  if (outcome === 'PARTIAL') {
    pay = number(b.payoutAmount, 'Payout amount', 1, remaining - 1);
    refund = remaining - pay;
  }
  if (pay > 0)
    assert(
      all('submissions').some((s) => s.milestoneId === m.id),
      'Deliverable evidence is required for payout',
    );
  if (outcome === 'REVISION' || outcome === 'CONTINUE')
    assert(
      !m.archived && p.status === 'ACTIVE',
      'Archived or recovering work cannot return to revision',
    );
  d.status = 'RESOLVED';
  d.outcome = outcome;
  d.rationale = rationale;
  d.resolvedBy = user.id;
  d.resolvedAt = stamp();
  d.payoutAmount = pay;
  put('disputes', d);
  if (pay) {
    const intent = paymentAdapter.requestPayout(m.id, pay, `payout:${m.id}`);
    paymentAdapter.confirmPayout(intent.id);
  }
  if (refund) {
    const intent = paymentAdapter.requestRefund(m.id, refund, `refund:${m.id}`);
    paymentAdapter.confirmRefund(intent.id);
  }
  const updated = get('milestones', m.id)!;
  if (pay) {
    updated.acceptedAt = stamp();
    updated.acceptedBy = user.id;
    updated.acceptedSubmissionId = all('submissions')
      .filter((s) => s.milestoneId === m.id)
      .sort((a, b) => b.version - a.version)[0].id;
  }
  updated.status = pay
    ? refund
      ? 'SETTLED'
      : 'RELEASED'
    : refund
      ? 'REFUNDED'
      : outcome === 'REVISION'
        ? 'REVISION_REQUESTED'
        : d.previousStatus;
  updated.paymentStatus = pay
    ? refund
      ? 'PARTIALLY_SETTLED'
      : 'RELEASED'
    : refund
      ? 'REFUNDED'
      : 'FUNDED';
  if (outcome === 'REVISION') {
    updated.revisionReason = rationale;
    updated.revisionCount++;
  }
  put('milestones', updated);
  audit(p.id, user.id, 'DISPUTE_RESOLVED', {
    disputeId: d.id,
    outcome,
    rationale,
    payoutAmount: pay,
    refundAmount: refund,
  });
  notify(p, `Dispute resolved: ${outcome}. The administrator recorded a rationale.`);
  return { ok: true, dispute: d };
}
function once(p: Row, key: string, message: string) {
  const exists = all('audit').some((a) => a.projectId === p.id && a.action === key);
  if (!exists) {
    audit(p.id, 'system', key, message);
    notify(p, message);
  }
}
function runJobsInternal() {
  let evaluated = 0;
  for (const p of all('projects').filter((p) => p.status === 'ACTIVE')) {
    evaluated++;
    const current = Date.parse(stamp());
    const idle = (current - Date.parse(p.lastActivityAt)) / 3600000;
    const ms = all('milestones').filter(
      (m) =>
        m.projectId === p.id &&
        !m.archived &&
        !['RELEASED', 'REFUNDED', 'CANCELLED', 'SETTLED'].includes(m.status),
    );
    const overdue = ms.filter(
      (m) =>
        Date.parse(m.dueDate) < current &&
        !['ACCEPTED', 'SUBMITTED', 'IN_REVIEW', 'DISPUTED'].includes(m.status),
    );
    const needsActivity = ms.some((m) =>
      ['READY_TO_START', 'IN_PROGRESS', 'REVISION_REQUESTED'].includes(m.status),
    );
    const reasons: string[] = [];
    if (needsActivity && idle >= 48)
      reasons.push(`No meaningful freelancer update for ${Math.floor(idle)} hours`);
    if (needsActivity && idle >= 96) reasons.push('Two 48-hour progress check-ins missed');
    if (overdue.length) reasons.push(`${overdue.length} milestone deadline(s) overdue`);
    if (p.withdrawalRequestedAt) reasons.push('Freelancer requested withdrawal');
    p.risk =
      p.withdrawalRequestedAt ||
      (needsActivity && idle >= 72) ||
      overdue.some((m) => current - Date.parse(m.dueDate) > 48 * 3600000)
        ? 'AT_RISK'
        : reasons.length
          ? 'WARNING'
          : 'HEALTHY';
    p.riskReasons = reasons;
    p.missedCheckins = needsActivity ? Math.floor(idle / 48) : 0;
    put('projects', p);
    if (p.risk !== 'HEALTHY')
      once(p, `RISK_${p.risk}`, `Project risk: ${p.risk}. ${reasons.join('; ')}`);
    for (const m of ms) {
      if (Date.parse(m.dueDate) - current <= 24 * 3600000 && Date.parse(m.dueDate) > current)
        once(p, `DEADLINE_REMINDER_${m.id}`, `Milestone “${m.title}” is due within 24 hours.`);
      if (['SUBMITTED', 'IN_REVIEW'].includes(m.status) && m.submittedAt) {
        const elapsed = (current - Date.parse(m.submittedAt)) / 3600000;
        if (elapsed >= m.reviewHours / 2)
          once(
            p,
            `REVIEW_REMINDER_${m.id}_${m.submittedAt}`,
            `Please review “${m.title}” within the agreed window.`,
          );
        if (elapsed >= m.reviewHours) {
          if (!all('disputes').some((d) => d.milestoneId === m.id && d.status === 'OPEN')) {
            createDispute(
              p,
              m,
              'system',
              'Client review window expired; authorized reviewer must decide. No automatic payout.',
            );
            once(
              p,
              `REVIEW_ESCALATED_${m.id}_${m.submittedAt}`,
              `Review of “${m.title}” escalated to an administrator. Funds remain blocked.`,
            );
          }
        }
      }
    }
  }
  audit(null, 'system', 'JOBS_COMPLETED', { evaluated });
  return { evaluated, now: stamp() };
}
export function runJobs() {
  return transaction(runJobsInternal);
}
export function handoverFor(user: User, id: string) {
  const r = get('recoveries', id);
  assert(r, 'Recovery not found', 404);
  const p = projectFor(user, r.projectId);
  assert(
    user.role === 'ADMIN' || p.clientId === user.id || p.freelancerId === user.id,
    'Handover is available only to current project parties',
    403,
  );
  return r.handover;
}
export function scopeSuggestions(category: unknown, description: unknown) {
  text(description, 'Description', 5000);
  const c = String(category).toLowerCase();
  const criteria =
    c.includes('graphic') || c.includes('design')
      ? [
          'Deliver final artwork in the agreed dimensions and resolution.',
          'Include editable source files and export previews.',
          'Use only the approved brand colours, fonts, and content.',
        ]
      : c.includes('video')
        ? [
            'Deliver the agreed video duration and aspect ratio.',
            'Ensure dialogue is intelligible and audio levels are consistent.',
            'Include approved titles, captions, and licensed assets.',
          ]
        : c.includes('social')
          ? [
              'Deliver the agreed number of posts in platform-ready dimensions.',
              'Include approved copy, captions, and publishing schedule.',
              'Provide editable source files and final exports.',
            ]
          : c.includes('presentation') || c.includes('report')
            ? [
                'Deliver the agreed number of pages or slides.',
                'Include all approved sections and referenced sources.',
                'Provide editable source and a PDF export.',
              ]
            : [
                'Include all agreed pages and supplied event information.',
                'Verify layout at mobile and desktop widths.',
                'Validate required form fields and show useful error messages.',
                'Check that navigation links work and include source files.',
              ];
  return { source: 'Rule-based suggestions', criteria };
}
