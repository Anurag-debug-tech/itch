import {
  test,
  expect,
  type Browser,
  type Page,
  type Locator,
  type TestInfo,
} from '@playwright/test';
import type { Bootstrap } from '../../src/components/types';
import { evidence } from '../fixtures';

test.setTimeout(180_000);
let browserErrors: string[] = [];
test.beforeEach(() => {
  browserErrors = [];
});
test.afterEach(() => {
  expect(browserErrors, 'No browser runtime or console errors').toEqual([]);
});

function observe(page: Page) {
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
}

async function account(browser: Browser, role: 'client' | 'freelancer' | 'replacement' | 'admin') {
  const context = await browser.newContext();
  const page = await context.newPage();
  observe(page);
  await page.goto('/#login');
  await page.getByLabel('Email address').fill(`${role}@milestoneguard.demo`);
  await page.getByLabel('Password').fill('DemoPass123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  return page;
}

async function state(page: Page): Promise<Bootstrap> {
  const response = await page.request.get('/api/bootstrap');
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function mutation(page: Page, button: Locator, route = '/api/actions') {
  const response = page.waitForResponse(
    (r) => r.url().endsWith(route) && r.request().method() === 'POST',
  );
  const refresh = page.waitForResponse(
    (r) => r.url().endsWith('/api/bootstrap') && r.request().method() === 'GET',
  );
  await button.click();
  const result = await response;
  expect(result.ok(), await result.text()).toBeTruthy();
  await refresh;
}

async function openProject(page: Page, projectId: string, tab = 'Milestones') {
  await page.goto(`/#project/${projectId}`);
  await page.reload();
  await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
}

async function createProject(page: Page, scenario: string, budgets: number[]) {
  const title = `Browser ${scenario} ${Date.now()}`;
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page
    .getByRole('button', {
      name: /01Website Development|01 Website Development|Website Development/,
    })
    .click();
  await page.getByLabel('Project title').fill(title);
  await page.getByLabel('Invite a freelancer').selectOption('demo-freelancer');
  await page.getByLabel('Total budget (INR)').fill(String(budgets.reduce((a, b) => a + b, 0)));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  for (let count = 3; count > budgets.length; count--)
    await page.getByRole('button', { name: 'Remove', exact: true }).last().click();
  for (let index = 0; index < budgets.length; index++) {
    await page
      .getByLabel(`Milestone ${index + 1} title`)
      .fill(`${scenario} milestone ${index + 1}`);
    await page.getByLabel(`Milestone ${index + 1} budget (INR)`).fill(String(budgets[index]));
    await page.getByLabel('Review window (hours)').nth(index).fill('72');
  }
  if (scenario === 'normal') {
    const suggested = page.waitForResponse((r) => r.url().endsWith('/api/scope'));
    await page.getByRole('button', { name: 'Suggest criteria', exact: true }).first().click();
    expect((await suggested).ok()).toBeTruthy();
    await expect(page.getByLabel(/Acceptance criteria — one per line/).first()).not.toHaveValue('');
  }
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page
    .getByLabel('Acceptance policy')
    .fill(
      'Review within 72 hours. No automatic release: human acceptance or authorized dispute resolution is required.',
    );
  await mutation(page, page.getByRole('button', { name: 'Create project', exact: true }));
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const data = await state(page);
  const project = data.projects.find((p) => p.title === title)!;
  expect(project).toBeTruthy();
  const milestones = data.milestones.filter((m) => m.projectId === project.id);
  expect(milestones.map((m) => m.budget)).toEqual(budgets.map((n) => n * 100));
  return { project, milestones };
}

async function sign(page: Page, id: string) {
  await openProject(page, id, 'Agreement');
  await mutation(page, page.getByRole('button', { name: 'Accept agreement', exact: true }));
  await expect(page.getByRole('button', { name: 'Accept agreement', exact: true })).toHaveCount(0);
}

const milestoneCard = (page: Page, title: string) =>
  page
    .locator('article.milestone-card')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });

async function fund(client: Page, projectId: string, title: string) {
  await openProject(client, projectId);
  await mutation(
    client,
    milestoneCard(client, title).getByRole('button', { name: 'Fund milestone', exact: true }),
  );
}

async function start(worker: Page, projectId: string, title: string) {
  await openProject(worker, projectId);
  await mutation(
    worker,
    milestoneCard(worker, title).getByRole('button', { name: 'Start milestone', exact: true }),
  );
}

async function upload(worker: Page, projectId: string, title: string) {
  await openProject(worker, projectId);
  await milestoneCard(worker, title)
    .getByRole('button', { name: 'Submit deliverable', exact: true })
    .click();
  const dialog = worker.getByRole('dialog', { name: 'Submit your deliverable' });
  await dialog
    .getByLabel('Deliverable file')
    .setInputFiles({ name: 'design-evidence.txt', mimeType: 'text/plain', buffer: evidence });
  await dialog
    .getByLabel('Description of completed work')
    .fill('Five pages, mobile behavior, and form validation are documented for client review.');
  await mutation(
    worker,
    dialog.getByRole('button', { name: 'Submit deliverable', exact: true }),
    '/api/uploads',
  );
  await expect(dialog).toHaveCount(0);
}

async function acceptAndPay(client: Page, projectId: string, title: string) {
  await openProject(client, projectId);
  const card = milestoneCard(client, title);
  await card.getByRole('button', { name: 'Review deliverable', exact: true }).click();
  const dialog = client.getByRole('dialog', { name: 'Review this milestone' });
  await expect(dialog.getByText('Human acceptance required', { exact: false })).toBeVisible();
  await dialog.getByLabel('Review decision').selectOption('ACCEPT');
  await dialog.getByRole('checkbox').check();
  await mutation(client, dialog.getByRole('button', { name: 'Accept deliverable', exact: true }));
  await mutation(
    client,
    card.getByRole('button', { name: 'Release simulated payment', exact: true }),
  );
}

async function reasonDialog(page: Page, title: string, reason: string) {
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await dialog.getByLabel('Reason').fill(reason);
  await mutation(page, dialog.getByRole('button', { name: 'Confirm', exact: true }));
  await expect(dialog).toHaveCount(0);
}

async function advance(admin: Page, hours: number) {
  await admin.getByRole('button', { name: 'Admin controls', exact: true }).click();
  await admin.getByLabel('Advance clock by hours').fill(String(hours));
  await mutation(admin, admin.getByRole('button', { name: 'Advance time', exact: true }));
  await mutation(
    admin,
    admin.getByRole('button', { name: 'Run accountability checks', exact: true }),
  );
}

async function resolve(
  admin: Page,
  projectId: string,
  outcome: 'RELEASE' | 'PARTIAL',
  rupees?: number,
) {
  await openProject(admin, projectId, 'Disputes');
  await admin.getByRole('button', { name: 'Record resolution', exact: true }).click();
  const dialog = admin.getByRole('dialog', {
    name: 'Record an authorized resolution',
    exact: true,
  });
  await dialog.getByLabel('Settlement outcome').selectOption(outcome);
  if (rupees) await dialog.getByLabel(/Amount to release \(INR\)/).fill(String(rupees));
  await dialog
    .getByLabel('Decision rationale')
    .fill(
      'Reviewed the signed agreement, submitted evidence and statements; this outcome reflects the supported completed work.',
    );
  await dialog.getByRole('checkbox').check();
  await mutation(admin, dialog.getByRole('button', { name: 'Confirm resolution', exact: true }));
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  const filename = info.outputPath(`${name}.png`);
  await page.screenshot({ path: filename, fullPage: true });
  await info.attach(name, { path: filename, contentType: 'image/png' });
}

test('normal browser journey creates a three-milestone project, signs, uploads, reviews and pays', async ({
  browser,
}, info) => {
  const client = await account(browser, 'client');
  const worker = await account(browser, 'freelancer');
  try {
    const { project, milestones } = await createProject(client, 'normal', [3000, 4000, 5000]);
    await sign(client, project.id);
    await sign(worker, project.id);
    for (const milestone of milestones) {
      await fund(client, project.id, milestone.title);
      await start(worker, project.id, milestone.title);
      if (milestone.id === milestones[0].id) {
        await openProject(worker, project.id, 'Progress');
        await worker.getByRole('button', { name: 'Post a check-in', exact: true }).click();
        const checkin = worker.getByRole('dialog', {
          name: 'Share a progress update',
          exact: true,
        });
        await checkin
          .getByLabel('Progress update')
          .fill('The agreed pages are implemented and ready for documented client review.');
        await mutation(worker, checkin.getByRole('button', { name: 'Confirm', exact: true }));
        expect((await state(worker)).checkins.some((c) => c.projectId === project.id)).toBe(true);
      }
      await upload(worker, project.id, milestone.title);
      await openProject(client, project.id, 'Submissions');
      const downloadEvent = client.waitForEvent('download');
      await client.getByRole('link', { name: 'Download', exact: true }).last().click();
      const downloaded = await downloadEvent;
      expect(downloaded.suggestedFilename()).toBe('design-evidence.txt');
      expect(await downloaded.failure()).toBeNull();
      expect((await state(client)).milestones.find((m) => m.id === milestone.id)?.paid).toBe(0);
      await acceptAndPay(client, project.id, milestone.title);
    }
    await client.reload();
    const completed = await state(client);
    expect(completed.projects.find((p) => p.id === project.id)?.status).toBe('COMPLETED');
    expect(
      completed.ledger.filter((l) => l.projectId === project.id && l.type === 'PAYOUT'),
    ).toHaveLength(3);
    await client.getByRole('tab', { name: 'Payments', exact: true }).click();
    await expect(
      client.getByRole('heading', { name: 'Transaction ledger', exact: true }),
    ).toBeVisible();
    await screenshot(client, info, 'normal-project-ledger-desktop');
    await client.setViewportSize({ width: 390, height: 844 });
    await expect(
      client.getByRole('button', { name: 'Open navigation', exact: true }),
    ).toBeVisible();
    await client.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await client.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(client.locator('aside')).not.toHaveClass(/mobile-open/);
    await expect
      .poll(() => client.locator('aside').evaluate((el) => el.getBoundingClientRect().right))
      .toBeLessThanOrEqual(0);
    await expect(client.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await client.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await screenshot(client, info, 'dashboard-mobile');
  } finally {
    await client.context().close();
    await worker.context().close();
  }
});

test('browser dispute flow blocks payment and administrator records a partial settlement', async ({
  browser,
}, info) => {
  const client = await account(browser, 'client'),
    worker = await account(browser, 'freelancer'),
    admin = await account(browser, 'admin');
  try {
    const {
      project,
      milestones: [milestone],
    } = await createProject(client, 'dispute', [3000]);
    await sign(client, project.id);
    await sign(worker, project.id);
    await fund(client, project.id, milestone.title);
    await start(worker, project.id, milestone.title);
    await upload(worker, project.id, milestone.title);
    await openProject(client, project.id);
    await milestoneCard(client, milestone.title)
      .getByRole('button', { name: 'Raise a dispute', exact: true })
      .click();
    await reasonDialog(
      client,
      'Raise a milestone dispute',
      'The supplied text does not fully establish the approved mobile navigation behavior.',
    );
    await expect(
      milestoneCard(client, milestone.title).getByText('Blocked', { exact: true }),
    ).toBeVisible();
    await expect(
      client.getByRole('button', { name: 'Release simulated payment', exact: true }),
    ).toHaveCount(0);
    expect((await state(client)).milestones.find((m) => m.id === milestone.id)?.paid).toBe(0);
    await openProject(worker, project.id, 'Disputes');
    await worker.getByRole('button', { name: 'Add statement', exact: true }).click();
    await worker
      .getByRole('dialog')
      .getByLabel('Your statement')
      .fill(
        'I agree the supplied source covers part of the scope; please settle the completed portion.',
      );
    await mutation(
      worker,
      worker.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }),
    );
    await resolve(admin, project.id, 'PARTIAL', 1800);
    const data = await state(admin),
      settled = data.milestones.find((m) => m.id === milestone.id)!;
    expect(settled.paid).toBe(180000);
    expect(settled.refunded).toBe(120000);
    expect(data.disputes.find((d) => d.milestoneId === milestone.id)?.status).toBe('RESOLVED');
    await screenshot(admin, info, 'dispute-authorized-resolution');
  } finally {
    for (const page of [client, worker, admin]) await page.context().close();
  }
});

test('browser inactivity and recovery preserves accepted work and resumes fresh replacement milestones', async ({
  browser,
}, info) => {
  const client = await account(browser, 'client'),
    worker = await account(browser, 'freelancer'),
    admin = await account(browser, 'admin'),
    replacement = await account(browser, 'replacement');
  try {
    const { project, milestones } = await createProject(client, 'recovery', [3000, 9000]);
    await sign(client, project.id);
    await sign(worker, project.id);
    await fund(client, project.id, milestones[0].title);
    await start(worker, project.id, milestones[0].title);
    await upload(worker, project.id, milestones[0].title);
    await acceptAndPay(client, project.id, milestones[0].title);
    await fund(client, project.id, milestones[1].title);
    await start(worker, project.id, milestones[1].title);
    await advance(admin, 73);
    await openProject(client, project.id, 'Progress');
    await expect(client.getByText('At Risk', { exact: true }).first()).toBeVisible();
    await client.getByRole('button', { name: 'Record intervention', exact: true }).click();
    await reasonDialog(
      client,
      'Record an intervention',
      'Requested a progress response after 73 hours without meaningful activity.',
    );
    await client.getByRole('tab', { name: 'Recovery', exact: true }).click();
    await client.getByRole('button', { name: 'Initiate recovery', exact: true }).click();
    await reasonDialog(
      client,
      'Start project recovery',
      'Continue the unfinished implementation through a mutually agreed replacement engagement.',
    );
    await client.getByText('Inspect authorized handover', { exact: true }).click();
    await expect(client.locator('.snapshot pre')).toContainText('design-evidence.txt');
    await client.getByRole('button', { name: 'Invite replacement', exact: true }).click();
    await client
      .getByRole('dialog')
      .getByLabel('Replacement freelancer')
      .selectOption('demo-replacement');
    await mutation(
      client,
      client.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }),
    );
    const invited = await state(client);
    const fresh = invited.milestones.find(
      (m) => m.projectId === project.id && m.assignedFreelancerId === 'demo-replacement',
    )!;
    expect(fresh.funded).toBe(0);
    expect(invited.milestones.find((m) => m.id === milestones[1].id)?.funded).toBe(900000);
    expect(invited.milestones.find((m) => m.id === milestones[1].id)?.paid).toBe(0);
    await sign(client, project.id);
    await sign(replacement, project.id);
    await openProject(client, project.id);
    await mutation(client, client.getByRole('button', { name: 'Fund milestone', exact: true }));
    await openProject(replacement, project.id);
    await mutation(
      replacement,
      replacement.getByRole('button', { name: 'Start milestone', exact: true }),
    );
    expect((await state(replacement)).milestones.find((m) => m.id === fresh.id)?.status).toBe(
      'IN_PROGRESS',
    );
    expect((await state(client)).recoveries.find((r) => r.projectId === project.id)?.status).toBe(
      'RESUMED',
    );
    await openProject(client, project.id, 'Recovery');
    await screenshot(client, info, 'recovery-resumed');
  } finally {
    for (const page of [client, worker, admin, replacement]) await page.context().close();
  }
});

test('browser client-inactivity flow escalates review without payment and requires an administrator decision', async ({
  browser,
}, info) => {
  const client = await account(browser, 'client'),
    worker = await account(browser, 'freelancer'),
    admin = await account(browser, 'admin');
  try {
    const {
      project,
      milestones: [milestone],
    } = await createProject(client, 'review-timeout', [3000]);
    await sign(client, project.id);
    await sign(worker, project.id);
    await fund(client, project.id, milestone.title);
    await start(worker, project.id, milestone.title);
    await upload(worker, project.id, milestone.title);
    await advance(admin, 36);
    expect(
      (await state(client)).notifications.some(
        (n) => n.projectId === project.id && /review/i.test(n.message),
      ),
    ).toBe(true);
    await advance(admin, 37);
    const escalated = await state(admin);
    expect(
      escalated.disputes.some(
        (d) =>
          d.milestoneId === milestone.id &&
          d.status === 'OPEN' &&
          /review window expired/i.test(d.reason),
      ),
    ).toBe(true);
    expect(escalated.milestones.find((m) => m.id === milestone.id)?.paid).toBe(0);
    await openProject(client, project.id, 'Disputes');
    await expect(client.getByText(/Client review window expired/)).toBeVisible();
    await screenshot(client, info, 'review-timeout-blocked');
    await resolve(admin, project.id, 'RELEASE');
    const resolved = await state(admin);
    expect(resolved.milestones.find((m) => m.id === milestone.id)?.paid).toBe(300000);
    expect(
      resolved.ledger.filter((l) => l.milestoneId === milestone.id && l.type === 'PAYOUT'),
    ).toHaveLength(1);
  } finally {
    for (const page of [client, worker, admin]) await page.context().close();
  }
});

test('browser registration, profile, amendment, revision, notifications and explicit demo reset', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const client = await context.newPage();
  observe(client);
  await client.goto('/#register');
  await client.getByLabel('Full name').fill('Browser New Client');
  await client.getByLabel('Email address').fill(`browser-${Date.now()}@example.test`);
  await client.getByLabel('Password').fill('BrowserTest123!');
  await client.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(client.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  const worker = await account(browser, 'freelancer'),
    admin = await account(browser, 'admin');
  try {
    await client.getByRole('button', { name: 'Settings', exact: true }).click();
    await client.getByLabel('Full name').fill('Browser Updated Client');
    await mutation(client, client.getByRole('button', { name: 'Save changes', exact: true }));
    expect((await state(client)).user.name).toBe('Browser Updated Client');
    await client.getByRole('button', { name: 'Overview', exact: true }).click();
    const {
      project,
      milestones: [milestone],
    } = await createProject(client, 'revision-amendment', [3000]);
    await sign(client, project.id);
    await sign(worker, project.id);
    await openProject(client, project.id, 'Agreement');
    await client.getByRole('button', { name: 'Propose amendment', exact: true }).click();
    const amendment = client.getByRole('dialog', {
      name: 'Propose an agreement amendment',
      exact: true,
    });
    await amendment
      .getByLabel('Reason for amendment')
      .fill('Both parties will clarify the mobile accessibility acceptance scope.');
    await amendment
      .getByLabel('Updated scope')
      .fill('Five responsive festival pages with documented accessible mobile navigation.');
    await mutation(client, amendment.getByRole('button', { name: 'Confirm', exact: true }));
    expect((await state(client)).projects.find((p) => p.id === project.id)?.status).toBe(
      'AMENDMENT_PENDING',
    );
    await sign(client, project.id);
    await sign(worker, project.id);
    expect((await state(client)).agreements.filter((a) => a.projectId === project.id)).toHaveLength(
      2,
    );
    await fund(client, project.id, milestone.title);
    await start(worker, project.id, milestone.title);
    await upload(worker, project.id, milestone.title);
    await openProject(client, project.id);
    await milestoneCard(client, milestone.title)
      .getByRole('button', { name: 'Review deliverable', exact: true })
      .click();
    const review = client.getByRole('dialog', { name: 'Review this milestone', exact: true });
    await review.getByLabel('Review decision').selectOption('REVISION');
    await review.getByLabel('Unmet acceptance criterion').selectOption({ index: 1 });
    await review
      .getByLabel('Revision request')
      .fill(
        'Please clarify the page names and approved mobile navigation behavior in this agreed criterion.',
      );
    await review.getByRole('checkbox').check();
    await mutation(client, review.getByRole('button', { name: 'Request revision', exact: true }));
    expect((await state(client)).milestones.find((m) => m.id === milestone.id)?.revisionCount).toBe(
      1,
    );
    await upload(worker, project.id, milestone.title);
    expect(
      (await state(client)).submissions.filter((s) => s.milestoneId === milestone.id),
    ).toHaveLength(2);
    await acceptAndPay(client, project.id, milestone.title);
    await client
      .locator('aside')
      .getByRole('button', { name: /^Notifications/ })
      .click();
    await mutation(client, client.getByRole('button', { name: 'Mark all read', exact: true }));
    expect((await state(client)).notifications.every((n) => n.read)).toBe(true);
    await admin.getByRole('button', { name: 'Admin controls', exact: true }).click();
    await admin.getByRole('button', { name: 'Reset demo workspace', exact: true }).click();
    const reset = admin.getByRole('dialog', {
      name: 'Reset the demonstration workspace',
      exact: true,
    });
    await reset.getByRole('checkbox').check();
    const resetResponse = admin.waitForResponse(
      (r) => r.url().endsWith('/api/actions') && r.request().method() === 'POST',
    );
    await reset.getByRole('button', { name: 'Reset demo', exact: true }).click();
    expect((await resetResponse).ok()).toBeTruthy();
    await expect(admin.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible();
    expect((await admin.request.get('/api/bootstrap')).status()).toBe(401);
    await admin.getByRole('button', { name: 'Administrator', exact: true }).click();
    await expect(admin.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    expect((await state(admin)).projects).toHaveLength(7);
  } finally {
    for (const page of [client, worker, admin]) await page.context().close();
  }
});
