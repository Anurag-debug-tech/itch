import { test, expect, type Browser, type Page, type Locator } from '@playwright/test';
import type { Bootstrap } from '../../src/components/types';
import { projectInput } from '../fixtures';
import { PDFDocument } from 'pdf-lib';

const origin = 'http://127.0.0.1:3100';
test.setTimeout(180_000);
async function state(page: Page): Promise<Bootstrap> {
  const r = await page.request.get('/api/bootstrap');
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function post(page: Page, path: string, data: unknown) {
  return page.request.post(path, { data, headers: { Origin: origin } });
}
async function action(page: Page, data: unknown) {
  const r = await post(page, '/api/actions', data);
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function clickMutation(page: Page, button: Locator, route = '/api/actions') {
  const response = page.waitForResponse(
    (r) => r.url().endsWith(route) && r.request().method() === 'POST',
  );
  await button.click();
  const result = await response;
  expect(result.ok(), await result.text()).toBe(true);
}
async function open(page: Page, projectId: string, tab = 'Milestones') {
  await page.goto(`/#project/${projectId}`);
  await page.reload();
  await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
}
async function setup(browser: Browser, objective = true) {
  const client = await (await browser.newContext()).newPage();
  const worker = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  const runtimeErrors: string[] = [];
  for (const page of [client, worker, admin]) {
    page.setDefaultTimeout(15_000);
    page.on('pageerror', (e) => runtimeErrors.push(e.message));
  }
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  for (const [page, role] of [
    [client, 'CLIENT'],
    [worker, 'FREELANCER'],
  ] as const) {
    const r = await post(page, '/api/auth/register', {
      name: `Readiness ${role}`,
      email: `${role}-${suffix}@example.test`,
      password: 'SecureTest123!',
      role,
    });
    expect(r.ok(), await r.text()).toBe(true);
  }
  expect(
    (
      await post(admin, '/api/auth/login', {
        email: 'admin@milestoneguard.demo',
        password: 'DemoPass123!',
      })
    ).ok(),
  ).toBe(true);
  const w = (await state(worker)).user;
  const input = projectInput(w.id, (await state(client)).now);
  input.title = `Readiness ${suffix}`;
  input.budget = 300_000;
  input.milestones = [input.milestones[0]];
  const payload = {
    ...input,
    milestones: input.milestones.map((m) => ({
      ...m,
      verificationRules: objective
        ? { requiredText: ['Home About Events Registration Contact'] }
        : {},
    })),
  };
  const { project, agreement } = await action(client, payload);
  for (const p of [client, worker])
    await action(p, { type: 'acceptAgreement', projectId: project.id, agreementId: agreement.id });
  const milestone = (await state(client)).milestones.find((m) => m.projectId === project.id)!;
  await action(client, { type: 'fund', milestoneId: milestone.id });
  await action(worker, { type: 'start', milestoneId: milestone.id });
  return { client, worker, admin, project, milestone, runtimeErrors };
}
async function upload(
  page: Page,
  name: string,
  mimeType: string,
  buffer: Buffer,
  expected: number,
) {
  await page.getByRole('button', { name: 'Submit deliverable', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Submit your deliverable' });
  await dialog.getByLabel('Deliverable file').setInputFiles({ name, mimeType, buffer });
  await dialog
    .getByLabel('Description of completed work')
    .fill('Review this submission against the mutually agreed acceptance checklist.');
  const r = page.waitForResponse(
    (r) => r.url().endsWith('/api/uploads') && r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Submit deliverable', exact: true }).click();
  expect((await r).status()).toBe(expected);
  if (expected !== 200) await dialog.getByRole('button', { name: /Cancel/ }).click();
  else await expect(dialog).toHaveCount(0);
}

test('UI rejects invalid files, explains objective failure, permits a corrected revision and separate receipt acknowledgements', async ({
  browser,
}) => {
  const { client, worker, admin, project, milestone, runtimeErrors } = await setup(browser);
  try {
    await open(worker, project.id, 'Payments');
    await clickMutation(
      worker,
      worker.getByRole('button', { name: 'Acknowledge funding', exact: true }),
    );
    await expect(worker.getByText(/Acknowledgement recorded/)).toBeVisible();
    await open(worker, project.id);
    await upload(worker, 'empty.txt', 'text/plain', Buffer.alloc(0), 400);
    await upload(
      worker,
      'broken.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.7\nnot a document\n%%EOF'),
      400,
    );
    await upload(
      worker,
      'wrong.exe',
      'application/octet-stream',
      Buffer.from('MZ executable file content'),
      400,
    );
    await upload(
      worker,
      'irrelevant.txt',
      'text/plain',
      Buffer.from('This document discusses a completely unrelated grocery list.'),
      200,
    );
    const failed = (await state(client)).submissions.find((s) => s.milestoneId === milestone.id)!;
    expect(failed.verification.objective?.[0].result).toBe('FAIL');
    await open(client, project.id);
    await client.getByRole('button', { name: 'Review deliverable', exact: true }).click();
    let dialog = client.getByRole('dialog', { name: 'Review this milestone' });
    await expect(dialog.getByText(/Required text/).first()).toBeVisible();
    await dialog.getByRole('checkbox').check();
    const rejected = client.waitForResponse(
      (r) => r.url().endsWith('/api/actions') && r.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Accept deliverable', exact: true }).click();
    expect((await rejected).status()).toBe(409);
    await dialog.getByLabel('Review decision').selectOption('REVISION');
    await dialog
      .getByLabel('Unmet acceptance criterion')
      .selectOption('Five agreed page names are documented');
    await dialog
      .getByLabel('Revision request')
      .fill('Provide the agreed page names in the deliverable; the current file is unrelated.');
    await clickMutation(
      client,
      dialog.getByRole('button', { name: 'Request revision', exact: true }),
    );
    await open(worker, project.id);
    await upload(
      worker,
      'corrected.txt',
      'text/plain',
      Buffer.from(
        'Home About Events Registration Contact. Mobile behavior: responsive navigation and forms.',
      ),
      200,
    );
    await open(client, project.id);
    await client.getByRole('button', { name: 'Review deliverable', exact: true }).click();
    dialog = client.getByRole('dialog', { name: 'Review this milestone' });
    await dialog.getByRole('checkbox').check();
    await clickMutation(
      client,
      dialog.getByRole('button', { name: 'Accept deliverable', exact: true }),
    );
    await expect(dialog).toHaveCount(0);
    expect((await state(client)).milestones.find((m) => m.id === milestone.id)?.paid).toBe(0);
    await clickMutation(
      client,
      client.getByRole('button', { name: 'Release simulated payment', exact: true }),
    );
    await open(worker, project.id, 'Payments');
    await clickMutation(
      worker,
      worker.getByRole('button', { name: 'Acknowledge payout', exact: true }),
    );
    await worker.reload();
    const final = await state(worker);
    expect(final.projects.find((p) => p.id === project.id)?.status).toBe('COMPLETED');
    const history = final.paymentHistory!.filter((r) => r.projectId === project.id);
    expect(history).toHaveLength(2);
    expect(history.every((r) => r.acknowledgedBy === final.user.id)).toBe(true);
    expect(
      history.every((r) => r.events.map((e) => e.phase).join(',') === 'REQUESTED,CONFIRMED'),
    ).toBe(true);
    expect(final.submissions.filter((s) => s.milestoneId === milestone.id)).toHaveLength(2);
    expect(runtimeErrors).toEqual([]);
  } finally {
    for (const p of [client, worker, admin]) await p.context().close();
  }
});

test('admin UI reviews open disputes and records fictional legal review without creating financial authority', async ({
  browser,
}) => {
  const { client, worker, admin, project, milestone, runtimeErrors } = await setup(browser, false);
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 200]);
    await open(worker, project.id);
    await upload(worker, 'review.pdf', 'application/pdf', Buffer.from(await pdf.save()), 200);
    expect(
      (await state(client)).submissions.find((s) => s.milestoneId === milestone.id)?.verification
        .facts?.pages,
    ).toBe(1);
    await open(client, project.id);
    await client.getByRole('button', { name: 'Raise a dispute', exact: true }).click();
    let dialog = client.getByRole('dialog', { name: 'Raise a milestone dispute' });
    await dialog
      .getByLabel('Reason')
      .fill('The funded milestone has no accepted evidence; request an authorized refund review.');
    await clickMutation(client, dialog.getByRole('button', { name: 'Confirm', exact: true }));
    await admin.goto('/');
    await admin.getByRole('button', { name: 'Admin controls', exact: true }).click();
    // Open disputes are directly inspectable in the admin dashboard.
    const disputeCard = admin
      .getByText(
        'The funded milestone has no accepted evidence; request an authorized refund review.',
        { exact: true },
      )
      .locator('xpath=ancestor::section[1]');
    const inspect = disputeCard.getByText('Inspect criteria, submission versions and reviewer', {
      exact: true,
    });
    await inspect.click();
    const panel = inspect.locator('..');
    await panel.getByLabel('Dispute reviewer').selectOption('demo-admin');
    await clickMutation(admin, panel.getByRole('button', { name: 'Assign reviewer', exact: true }));
    await clickMutation(
      admin,
      panel.getByRole('button', { name: 'Prepare evidence brief', exact: true }),
      '/api/disputes',
    );
    await expect(panel.getByText('Missing evidence', { exact: true })).toBeVisible();
    expect((await state(client)).milestones.find((m) => m.id === milestone.id)?.paid).toBe(0);
    const legal = admin
      .getByRole('heading', { name: 'External legal-order register' })
      .locator('xpath=ancestor::section[1]');
    await legal.getByText('Record an external order', { exact: true }).click();
    await legal.getByLabel('Order project').selectOption(project.id);
    await legal.getByLabel('Order reference', { exact: true }).fill('FICTIONAL-HACKATHON-ORDER');
    await legal
      .getByLabel('Issuing authority', { exact: true })
      .fill('Fictional demonstration authority');
    await legal
      .getByLabel('Private document or record location')
      .fill('fictional://demo/no-real-order');
    await legal
      .getByLabel('Claimed authorized scope')
      .fill(
        'Fictional reviewer exercise: refund only this milestone, with no real money involved.',
      );
    await legal.getByLabel('Affected milestones').selectOption([milestone.id]);
    await legal.getByLabel('Claimed permitted outcomes').selectOption('REFUND');
    await legal.getByLabel('Maximum authorized amount (INR)').fill('3000');
    await clickMutation(
      admin,
      legal.getByRole('button', { name: 'Save unverified order' }),
      '/api/legal-orders',
    );
    await expect(legal.getByText(/FICTIONAL-HACKATHON-ORDER/)).toBeVisible();
    await legal
      .getByLabel('Qualified external reviewer name')
      .fill('Fictional reviewer — test data only');
    await legal
      .getByLabel('Authentication method and supporting evidence')
      .fill('Fictional demonstration finding; not a real authenticated legal order.');
    await legal
      .getByLabel('Jurisdiction and authorized scope assessment')
      .fill('Test-only metadata exercise limited to this fictional milestone refund.');
    await legal.getByLabel('External reviewer finding').selectOption('VERIFIED');
    await legal.getByLabel(/I am recording a qualified/).check();
    await clickMutation(
      admin,
      legal.getByRole('button', { name: 'Record external review' }),
      '/api/legal-orders',
    );
    expect(
      (await state(client)).ledger.filter((l) => l.projectId === project.id && l.type === 'REFUND'),
    ).toHaveLength(0);
    await open(admin, project.id, 'Disputes');
    await admin.getByRole('button', { name: 'Record resolution', exact: true }).click();
    dialog = admin.getByRole('dialog', { name: 'Record an authorized resolution' });
    await dialog.getByLabel('Settlement outcome').selectOption('REFUND');
    await dialog
      .getByLabel('Decision rationale')
      .fill(
        'Independently authorized demo dispute resolution: no completed work, refund the funded milestone.',
      );
    await dialog.getByRole('checkbox').check();
    await clickMutation(
      admin,
      dialog.getByRole('button', { name: 'Confirm resolution', exact: true }),
    );
    const after = await state(admin);
    const refund = after.paymentHistory!.find(
      (r) => r.projectId === project.id && r.kind === 'REFUND',
    )!;
    expect(refund.amountMinor).toBe('300000');
    await admin.getByRole('button', { name: 'Admin controls', exact: true }).click();
    await admin.getByLabel('Existing confirmed settlement').selectOption(refund.reference);
    await clickMutation(
      admin,
      admin.getByRole('button', { name: 'Link confirmed execution' }),
      '/api/legal-orders',
    );
    const final = await state(admin);
    expect(final.legalOrders!.find((o) => o.projectId === project.id)?.executions).toHaveLength(1);
    expect(
      final.ledger.filter((l) => l.projectId === project.id && l.type === 'REFUND'),
    ).toHaveLength(1);
    expect((await post(client, '/api/legal-orders', { type: 'recordExecution' })).status()).toBe(
      403,
    );
    expect((await state(client)).legalOrders).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  } finally {
    for (const p of [client, worker, admin]) await p.context().close();
  }
});
