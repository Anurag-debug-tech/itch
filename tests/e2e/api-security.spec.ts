import { expect, test, type APIRequestContext } from '@playwright/test';
import { evidence, projectInput } from '../fixtures';
import type { Bootstrap } from '../../src/components/types';

const origin = 'http://127.0.0.1:3100';
async function post(api: APIRequestContext, path: string, payload: unknown) {
  return api.post(path, { data: payload, headers: { Origin: origin } });
}
async function login(api: APIRequestContext, role: string) {
  const response = await post(api, '/api/auth/login', {
    email: `${role}@milestoneguard.demo`,
    password: 'DemoPass123!',
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test('HTTP authorization, CSRF rejection, private file access, and dispute payment blocking', async ({
  playwright,
}) => {
  const client = await playwright.request.newContext({ baseURL: origin });
  const freelancer = await playwright.request.newContext({ baseURL: origin });
  const admin = await playwright.request.newContext({ baseURL: origin });
  const outsider = await playwright.request.newContext({ baseURL: origin });
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  try {
    expect((await anonymous.get('/api/bootstrap')).status()).toBe(401);
    const forbiddenRegistration = await post(anonymous, '/api/auth/register', {
      name: 'Forged Admin',
      email: 'forged-admin@example.test',
      password: 'StrongTest123!',
      role: 'ADMIN',
    });
    expect(forbiddenRegistration.status()).toBe(400);
    await login(client, 'client');
    await login(freelancer, 'freelancer');
    await login(admin, 'admin');
    await login(outsider, 'replacement');
    const initial: Bootstrap = await (await client.get('/api/bootstrap')).json();
    const worker = initial.users.find((u) => u.email === 'freelancer@milestoneguard.demo')!;
    const created = await post(client, '/api/actions', projectInput(worker.id, initial.now));
    expect(created.ok(), await created.text()).toBeTruthy();
    const { project, agreement } = await created.json();
    for (const api of [client, freelancer])
      expect(
        (
          await post(api, '/api/actions', {
            type: 'acceptAgreement',
            projectId: project.id,
            agreementId: agreement.id,
          })
        ).ok(),
      ).toBeTruthy();
    const data: Bootstrap = await (await client.get('/api/bootstrap')).json();
    const milestone = data.milestones.find((m) => m.projectId === project.id)!;
    expect(
      (await post(client, '/api/actions', { type: 'fund', milestoneId: milestone.id })).ok(),
    ).toBeTruthy();
    expect(
      (await post(freelancer, '/api/actions', { type: 'start', milestoneId: milestone.id })).ok(),
    ).toBeTruthy();
    const upload = await freelancer.post('/api/uploads', {
      headers: { Origin: origin },
      multipart: {
        milestoneId: milestone.id,
        description: 'Five pages and responsive behavior documented for human review.',
        file: { name: 'evidence.txt', mimeType: 'text/plain', buffer: evidence },
      },
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    const { submission } = await upload.json();
    expect((await client.get(`/api/files/${submission.id}`)).ok()).toBeTruthy();
    expect((await anonymous.get(`/api/files/${submission.id}`)).status()).toBe(401);
    expect((await outsider.get(`/api/files/${submission.id}`)).status()).toBe(403);
    expect(
      (await post(outsider, '/api/actions', { type: 'fund', milestoneId: milestone.id })).status(),
    ).toBe(403);
    expect(
      (
        await post(freelancer, '/api/actions', {
          type: 'review',
          milestoneId: milestone.id,
          decision: 'ACCEPT',
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await client.post('/api/actions', {
          data: { type: 'payout', milestoneId: milestone.id },
          headers: { Origin: 'https://attacker.example' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await client.post('/api/actions', { data: { type: 'payout', milestoneId: milestone.id } })
      ).status(),
    ).toBe(403);
    const opened = await post(client, '/api/actions', {
      type: 'dispute',
      milestoneId: milestone.id,
      reason: 'The evidence does not establish every agreed acceptance criterion.',
    });
    expect(opened.ok()).toBeTruthy();
    const { dispute } = await opened.json();
    const blocked = await post(client, '/api/actions', {
      type: 'payout',
      milestoneId: milestone.id,
    });
    expect(blocked.status()).toBe(409);
    const unauthorizedResolution = await post(client, '/api/actions', {
      type: 'resolve',
      disputeId: dispute.id,
      outcome: 'RELEASE',
      rationale: 'Client cannot act as administrator.',
    });
    expect(unauthorizedResolution.status()).toBe(403);
    const approved = await post(admin, '/api/actions', {
      type: 'resolve',
      disputeId: dispute.id,
      outcome: 'PARTIAL',
      payoutAmount: 200_000,
      rationale: 'Reviewed evidence: pay for accepted work and refund the remaining portion.',
    });
    expect(approved.ok(), await approved.text()).toBeTruthy();
    const after: Bootstrap = await (await client.get('/api/bootstrap')).json();
    expect(after.milestones.find((m) => m.id === milestone.id)?.paid).toBe(200_000);
    expect(after.milestones.find((m) => m.id === milestone.id)?.refunded).toBe(100_000);
    expect(
      after.ledger.filter((l) => l.milestoneId === milestone.id && l.type === 'PAYOUT'),
    ).toHaveLength(1);
    const second = data.milestones.find(
      (m) => m.projectId === project.id && m.id !== milestone.id,
    )!;
    expect(
      (await post(client, '/api/actions', { type: 'fund', milestoneId: second.id })).ok(),
    ).toBeTruthy();
    expect(
      (await post(freelancer, '/api/actions', { type: 'start', milestoneId: second.id })).ok(),
    ).toBeTruthy();
    expect(
      (
        await freelancer.post('/api/uploads', {
          headers: { Origin: origin },
          multipart: {
            milestoneId: second.id,
            description: 'Implementation evidence for review and authorized release.',
            file: { name: 'implementation.txt', mimeType: 'text/plain', buffer: evidence },
          },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await post(client, '/api/actions', {
          type: 'review',
          milestoneId: second.id,
          decision: 'ACCEPT',
        })
      ).ok(),
    ).toBeTruthy();
    const simultaneous = await Promise.all(
      Array.from({ length: 6 }, () =>
        post(client, '/api/actions', { type: 'payout', milestoneId: second.id }),
      ),
    );
    expect(simultaneous.every((response) => response.ok())).toBe(true);
    const final: Bootstrap = await (await client.get('/api/bootstrap')).json();
    expect(
      final.ledger.filter((l) => l.milestoneId === second.id && l.type === 'PAYOUT'),
    ).toHaveLength(1);
    expect(final.milestones.find((m) => m.id === second.id)?.paid).toBe(second.budget);
  } finally {
    for (const api of [client, freelancer, admin, outsider, anonymous]) await api.dispose();
  }
});
