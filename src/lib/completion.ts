import { all, get, getDb, put, type Row } from './db';

/** One completion gate across current work, original obligations, disputes and both adapters. */
export function completeProjectIfReady(projectId: string) {
  const project = get('projects', projectId);
  if (!project) return false;
  const milestones = all('milestones').filter((m) => m.projectId === projectId);
  const current = milestones.filter((m) => !m.archived);
  if (
    !current.length ||
    current.some((m) => !['RELEASED', 'REFUNDED', 'SETTLED', 'CANCELLED'].includes(m.status))
  )
    return false;
  if (milestones.some((m) => m.funded !== m.paid + m.refunded)) return false;
  if (all('disputes').some((d) => d.projectId === projectId && d.status === 'OPEN')) return false;
  if (all('agreements').some((a) => a.projectId === projectId && a.status === 'PENDING'))
    return false;
  const db = getDb();
  if (
    db
      .prepare(
        "SELECT 1 FROM payment_intents i JOIN milestones m ON m.id=i.milestoneId WHERE m.projectId=? AND i.status='PENDING' LIMIT 1",
      )
      .get(projectId)
  )
    return false;
  const chain = db
    .prepare(
      'SELECT cm.* FROM chain_milestones cm JOIN chain_escrows e ON e.id=cm.escrowRef WHERE e.projectId=?',
    )
    .all(projectId) as Row[];
  if (chain.some((m) => BigInt(m.funded) !== BigInt(m.paid) + BigInt(m.refunded))) return false;
  if (
    db
      .prepare(
        "SELECT 1 FROM chain_transactions WHERE projectId=? AND method IN ('fund_milestone','approve_and_release','resolve_dispute','refund_authorized') AND status NOT IN ('CONFIRMED','FAILED','EXPIRED') LIMIT 1",
      )
      .get(projectId)
  )
    return false;
  project.status = current.every((m) => ['REFUNDED', 'CANCELLED'].includes(m.status))
    ? 'CANCELLED'
    : 'COMPLETED';
  put('projects', project);
  return true;
}
