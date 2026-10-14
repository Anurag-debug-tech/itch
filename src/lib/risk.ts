import { z } from 'zod';
import { getDb, type Row } from './db';
import { assert } from './errors';
export const defaultRiskPolicy = {
  checkinHours: 48,
  attentionHours: 48,
  riskHours: 72,
  deadlineGraceHours: 48,
};
const schema = z
  .object({
    checkinHours: z.number().int().min(1).max(720),
    attentionHours: z.number().int().min(1).max(720),
    riskHours: z.number().int().min(1).max(720),
    deadlineGraceHours: z.number().int().min(0).max(720),
  })
  .strict()
  .refine((p) => p.riskHours >= p.attentionHours);
export type RiskPolicy = z.infer<typeof schema>;
export function parseRiskPolicy(value: unknown) {
  const parsed = schema.safeParse(value);
  assert(
    parsed.success,
    'Use valid monitoring hours; at-risk threshold must follow attention threshold',
  );
  return parsed.data;
}
export function readRiskPolicy(): RiskPolicy {
  const row = getDb().prepare("SELECT value FROM settings WHERE key='riskPolicy'").get() as
    Row | undefined;
  if (!row) return { ...defaultRiskPolicy };
  try {
    return parseRiskPolicy(JSON.parse(row.value));
  } catch {
    return { ...defaultRiskPolicy };
  }
}
export function normalizedRisk(value: string, status?: string) {
  return status === 'RECOVERY_PENDING'
    ? 'RECOVERY_INITIATED'
    : value === 'HEALTHY' || value === 'LOW'
      ? 'ON_TRACK'
      : value === 'WARNING'
        ? 'NEEDS_ATTENTION'
        : value;
}
export function evaluateRisk(project: Row, milestones: Row[], at: string, policy: RiskPolicy) {
  const current = Date.parse(at),
    idle = Math.max(0, (current - Date.parse(project.lastActivityAt)) / 3600000);
  const actionable = milestones.filter(
    (m) =>
      !m.archived && ['READY_TO_START', 'IN_PROGRESS', 'REVISION_REQUESTED'].includes(m.status),
  );
  const signals: {
    rule: string;
    activityAt: string;
    thresholdHours: number;
    milestoneId?: string;
    explanation: string;
  }[] = [];
  if (actionable.length && idle >= policy.attentionHours)
    signals.push({
      rule: 'MEANINGFUL_ACTIVITY_GAP',
      activityAt: project.lastActivityAt,
      thresholdHours: policy.attentionHours,
      explanation: `Last meaningful freelancer activity: ${project.lastActivityAt}. ${Math.floor(idle)} inactive hours meets the ${policy.attentionHours}-hour attention rule.`,
    });
  if (actionable.length && idle >= policy.checkinHours)
    signals.push({
      rule: 'CHECKIN_MISSED',
      activityAt: project.lastActivityAt,
      thresholdHours: policy.checkinHours,
      explanation: `${Math.floor(idle / policy.checkinHours)} progress check-in interval(s) missed since ${project.lastActivityAt}; interval ${policy.checkinHours} hours.`,
    });
  const overdue = actionable.filter((m) => Date.parse(m.dueDate) < current);
  for (const m of overdue)
    signals.push({
      rule: 'AGREED_DEADLINE_PASSED',
      activityAt: m.dueDate,
      thresholdHours: policy.deadlineGraceHours,
      milestoneId: m.id,
      explanation: `“${m.title}” passed its currently acknowledged deadline ${m.dueDate}; escalation grace ${policy.deadlineGraceHours} hours. An approved extension replaces this date.`,
    });
  if (project.withdrawalRequestedAt)
    signals.push({
      rule: 'EXPLICIT_WITHDRAWAL',
      activityAt: project.withdrawalRequestedAt,
      thresholdHours: 0,
      explanation: `Freelancer requested withdrawal at ${project.withdrawalRequestedAt}. A human must review the remaining obligations.`,
    });
  const risk =
    project.status === 'RECOVERY_PENDING'
      ? 'RECOVERY_INITIATED'
      : project.withdrawalRequestedAt ||
          (actionable.length && idle >= policy.riskHours) ||
          overdue.some((m) => current - Date.parse(m.dueDate) > policy.deadlineGraceHours * 3600000)
        ? 'AT_RISK'
        : signals.length
          ? 'NEEDS_ATTENTION'
          : 'ON_TRACK';
  if (risk === 'AT_RISK' && actionable.length && idle >= policy.riskHours)
    signals.push({
      rule: 'INACTIVITY_ESCALATION',
      activityAt: project.lastActivityAt,
      thresholdHours: policy.riskHours,
      explanation: `${Math.floor(idle)} inactive hours since ${project.lastActivityAt} meets the ${policy.riskHours}-hour at-risk rule. This is not proof of fraud and never authorizes payment.`,
    });
  return {
    risk,
    riskSignals: signals,
    riskReasons: signals.map((s) => s.explanation),
    missedCheckins: actionable.length ? Math.floor(idle / policy.checkinHours) : 0,
  };
}
