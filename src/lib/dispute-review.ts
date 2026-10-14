import { all, get, type Row } from './db';
import { assert } from './errors';
import type { User } from './auth';
import { audit, projectFor } from './service';
import { disputeBrief } from './ai';
export async function reviewBrief(user: User, disputeId: string, useAi = false) {
  const dispute = get('disputes', disputeId);
  assert(dispute, 'Dispute not found', 404);
  const project = projectFor(user, dispute.projectId),
    milestone = get('milestones', dispute.milestoneId)!;
  assert(
    user.role === 'ADMIN' ||
      user.id === project.clientId ||
      user.id === milestone.assignedFreelancerId,
    'Only the dispute parties may inspect this evidence brief',
    403,
  );
  const agreement = all('agreements')
    .filter(
      (a) =>
        a.projectId === project.id && a.snapshot.milestones.some((m: Row) => m.id === milestone.id),
    )
    .sort((a, b) => b.version - a.version)[0];
  assert(agreement, 'Agreed evidence context is missing', 409);
  const submissions = all('submissions')
    .filter((s) => s.milestoneId === milestone.id)
    .sort((a, b) => a.version - b.version);
  const result = await disputeBrief(
    {
      agreement: {
        reference: 'agreement:' + agreement.id,
        hash: agreement.hash,
        scope: agreement.snapshot.project.scope,
        criteria: milestone.criteria,
      },
      claims: [
        { reference: 'dispute:' + dispute.id, text: dispute.reason },
        ...(dispute.statements || []).slice(-30).map((s: Row, i: number) => ({
          reference: `statement:${dispute.id}:${i}`,
          text: s.text,
        })),
      ],
      evidence: submissions.map((s) => ({
        reference: 'submission:' + s.id,
        fileName: s.fileName,
        hash: s.hash,
        checks: s.verification,
      })),
    },
    useAi,
  );
  audit(project.id, user.id, 'DISPUTE_BRIEF_GENERATED', { disputeId, source: result.source });
  return result;
}
