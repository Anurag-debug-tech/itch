import { test, expect, type Browser, type Page, type Locator } from '@playwright/test';
import { Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import type { Bootstrap } from '../../src/components/types';
import { PASSPHRASE } from '../../src/lib/stellar/config';
import { evidence } from '../fixtures';

test.skip(
  process.env.RUN_STELLAR_TESTNET_TESTS !== '1',
  'Explicit opt-in required: uses free Testnet XLM',
);

test('missing wallet and wrong-network selection fail before requesting a server challenge', async ({
  browser,
}) => {
  for (const wrongNetwork of [false, true]) {
    const context = await browser.newContext();
    if (wrongNetwork)
      await context.addInitScript(() => {
        Reflect.set(window, 'freighter', true);
        window.addEventListener('message', (event) => {
          if (event.source !== window || event.data?.source !== 'FREIGHTER_EXTERNAL_MSG_REQUEST')
            return;
          window.postMessage(
            {
              source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE',
              messagedId: event.data.messageId,
              networkDetails: {
                network: 'UNSUPPORTED',
                networkUrl: '',
                networkPassphrase: 'unsupported-test-fixture',
              },
            },
            window.location.origin,
          );
        });
      });
    const page = await context.newPage();
    let challenges = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/wallet')) challenges++;
    });
    await page.goto('/#login');
    await page.getByLabel('Email address').fill('client@browser.test');
    await page.getByLabel('Password').fill('TestnetFixturePass123!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: /^(Connect|Reconnect) Wallet$/ }).click();
    await expect(
      page.getByRole('status').filter({
        hasText: wrongNetwork
          ? 'Switch Freighter to Stellar Testnet'
          : 'Install or unlock the Freighter browser extension',
      }),
    ).toBeVisible();
    expect(challenges).toBe(0);
    await context.close();
  }
});

async function state(page: Page): Promise<Bootstrap> {
  const response = await page.request.get('/api/bootstrap');
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function fixtureWallet(browser: Browser, role: string, errors: string[]) {
  const key = Keypair.random();
  const funding = await fetch(`https://friendbot.stellar.org/?addr=${key.publicKey()}`, {
    signal: AbortSignal.timeout(60_000),
  });
  expect(funding.ok).toBeTruthy();
  const context = await browser.newContext();
  // An explicit test double for the extension transport. Secrets remain in this test process.
  // Production code still calls the unmodified official Freighter API.
  await context.exposeBinding('__stellarFixtureSign', (_, request: Record<string, string>) => {
    expect(request.networkPassphrase).toBe(PASSPHRASE);
    expect(request.accountToSign).toBe(key.publicKey());
    const tx = TransactionBuilder.fromXDR(request.transactionXdr, PASSPHRASE) as Transaction;
    tx.sign(key);
    return { signedTransaction: tx.toXDR(), signerAddress: key.publicKey() };
  });
  await context.addInitScript(
    ({ address, passphrase }) => {
      window.addEventListener('message', async (event) => {
        if (event.source !== window || event.data?.source !== 'FREIGHTER_EXTERNAL_MSG_REQUEST')
          return;
        const request = event.data;
        let result: Record<string, unknown> = {};
        if (request.type === 'REQUEST_CONNECTION_STATUS') result = { isConnected: true };
        if (['REQUEST_PUBLIC_KEY', 'REQUEST_ACCESS'].includes(request.type))
          result = { publicKey: address };
        if (request.type === 'REQUEST_NETWORK_DETAILS')
          result = {
            networkDetails: {
              network: 'TESTNET',
              networkUrl: 'https://horizon-testnet.stellar.org',
              networkPassphrase: passphrase,
              sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
            },
          };
        if (request.type === 'SUBMIT_TRANSACTION')
          result = await (
            window as unknown as {
              __stellarFixtureSign(r: unknown): Promise<Record<string, unknown>>;
            }
          ).__stellarFixtureSign(request);
        window.postMessage(
          { source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE', messagedId: request.messageId, ...result },
          window.location.origin,
        );
      });
    },
    { address: key.publicKey(), passphrase: PASSPHRASE },
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/#login');
  await page.getByLabel('Email address').fill(`${role}@browser.test`);
  await page.getByLabel('Password').fill('TestnetFixturePass123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect Wallet', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Connect Wallet', exact: true }).click();
  await expect(
    page.getByText('Wallet ownership verified on Testnet', { exact: true }),
  ).toBeVisible();
  expect((await state(page)).blockchain?.wallet?.address).toBe(key.publicKey());
  return page;
}
async function openProject(page: Page, projectId: string, tab = 'Milestones') {
  await page.goto(`/#project/${projectId}`);
  await page.reload();
  await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
}
async function mutate(page: Page, button: Locator, route = '/api/actions') {
  const response = page.waitForResponse(
    (r) => r.url().endsWith(route) && r.request().method() === 'POST',
  );
  await button.click();
  const r = await response;
  expect(r.ok(), await r.text()).toBeTruthy();
}
async function chainClick(page: Page, button: Locator) {
  const submitted = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/stellar') &&
      r.request().method() === 'POST' &&
      r.request().postDataJSON().type === 'submit',
    { timeout: 90_000 },
  );
  await button.click();
  const response = await submitted;
  expect(response.ok(), await response.text()).toBeTruthy();
  const attempt = await response.json();
  await expect
    .poll(
      async () =>
        (await state(page)).blockchain?.transactions.find((t) => t.id === attempt.id)?.status,
      { timeout: 100_000, intervals: [2000, 3000, 5000] },
    )
    .toBe('CONFIRMED');
  await page.reload();
  return attempt.txHash;
}

test('real Testnet UI lifecycle, wallet proof, escrow accounting and resolver refund (extension transport fixture)', async ({
  browser,
}, info) => {
  const errors: string[] = [],
    pages: Page[] = [],
    hashes: string[] = [];
  try {
    const client = await fixtureWallet(browser, 'client', errors);
    pages.push(client);
    const worker = await fixtureWallet(browser, 'freelancer', errors);
    pages.push(worker);
    const admin = await fixtureWallet(browser, 'admin', errors);
    pages.push(admin);
    const users = (await state(client)).users;
    const workerId = users.find((u) => u.role === 'FREELANCER')!.id;
    const adminId = users.find((u) => u.role === 'ADMIN')!.id;
    await client.getByRole('button', { name: 'New project', exact: true }).click();
    await client
      .getByRole('button', {
        name: /01Website Development|01 Website Development|Website Development/,
      })
      .click();
    await client.getByLabel('Payment mode').selectOption('STELLAR_TESTNET');
    await client.getByLabel('Dispute resolver').selectOption(adminId);
    const title = `Live Testnet browser ${Date.now()}`;
    await client.getByLabel('Project title').fill(title);
    await client.getByLabel('Invite a freelancer').selectOption(workerId);
    await client.getByLabel('Total budget (Testnet XLM)').fill('0.2');
    await client.getByRole('button', { name: 'Continue', exact: true }).click();
    await client.getByRole('button', { name: 'Remove', exact: true }).last().click();
    for (let i = 1; i <= 2; i++) {
      await client.getByLabel(`Milestone ${i} title`).fill(`Browser XLM ${i}`);
      await client.getByLabel(`Milestone ${i} budget (Testnet XLM)`).fill('0.1');
    }
    await client.getByRole('button', { name: 'Continue', exact: true }).click();
    await mutate(client, client.getByRole('button', { name: 'Create project', exact: true }));
    await expect(client.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const created = await state(client),
      project = created.projects.find((p) => p.title === title)!;
    expect(project.budgetAtomic).toBe('2000000');
    for (const page of [client, worker]) {
      await openProject(page, project.id, 'Agreement');
      await mutate(page, page.getByRole('button', { name: 'Accept agreement', exact: true }));
    }
    await openProject(client, project.id);
    hashes.push(
      await chainClick(
        client,
        client.getByRole('button', { name: 'Create On-Chain Agreement', exact: true }),
      ),
    );
    await openProject(worker, project.id);
    hashes.push(
      await chainClick(
        worker,
        worker.getByRole('button', { name: 'Accept On-Chain Agreement', exact: true }),
      ),
    );
    await openProject(client, project.id);
    for (let i = 0; i < 2; i++)
      hashes.push(
        await chainClick(
          client,
          client.getByRole('button', { name: 'Fund Milestone On-Chain', exact: true }).first(),
        ),
      );
    await openProject(worker, project.id);
    const card = worker
      .locator('article.milestone-card')
      .filter({ has: worker.getByRole('heading', { name: 'Browser XLM 1', exact: true }) });
    await mutate(worker, card.getByRole('button', { name: 'Start milestone', exact: true }));
    await card.getByRole('button', { name: 'Submit deliverable', exact: true }).click();
    const upload = worker.getByRole('dialog', { name: 'Submit your deliverable' });
    await upload
      .getByLabel('Deliverable file')
      .setInputFiles({ name: 'evidence.txt', mimeType: 'text/plain', buffer: evidence });
    await upload
      .getByLabel('Description of completed work')
      .fill('Agreed evidence is ready for human review.');
    await mutate(
      worker,
      upload.getByRole('button', { name: 'Submit deliverable', exact: true }),
      '/api/uploads',
    );
    hashes.push(
      await chainClick(
        worker,
        worker.getByRole('button', { name: 'Record Submission Commitment', exact: true }),
      ),
    );
    await openProject(client, project.id);
    const reviewCard = client
      .locator('article.milestone-card')
      .filter({ has: client.getByRole('heading', { name: 'Browser XLM 1', exact: true }) });
    await reviewCard.getByRole('button', { name: 'Review deliverable', exact: true }).click();
    const review = client.getByRole('dialog', { name: 'Review this milestone' });
    await review.getByLabel('Review decision').selectOption('ACCEPT');
    await review.getByRole('checkbox').check();
    await mutate(client, review.getByRole('button', { name: 'Accept deliverable', exact: true }));
    hashes.push(
      await chainClick(
        client,
        client.getByRole('button', { name: 'Approve and Release Testnet XLM', exact: true }),
      ),
    );
    await client
      .getByLabel('Dispute reason or resolver rationale')
      .fill('Independent resolver should review the unfinished second milestone.');
    hashes.push(
      await chainClick(
        client,
        client.getByRole('button', { name: 'Raise On-Chain Dispute', exact: true }),
      ),
    );
    await expect(
      client.getByRole('button', { name: 'Approve and Release Testnet XLM', exact: true }),
    ).toHaveCount(0);
    await openProject(admin, project.id, 'Disputes');
    await admin
      .getByLabel('Dispute reason or resolver rationale')
      .fill('Reviewed both parties and authorized refund of the unfinished milestone.');
    await admin.getByLabel('On-chain settlement outcome').selectOption('REFUND');
    hashes.push(
      await chainClick(
        admin,
        admin.getByRole('button', { name: 'Authorize Testnet Settlement', exact: true }),
      ),
    );
    await openProject(client, project.id);
    const final = await state(client),
      ms = final.blockchain!.milestones;
    expect(ms.map((m) => m.state).sort()).toEqual(['Paid', 'Refunded']);
    expect(ms.reduce((sum, m) => sum + BigInt(m.funded), 0n)).toBe(2_000_000n);
    expect(final.ledger.filter((l) => l.projectId === project.id)).toHaveLength(0);
    await expect(client.getByText('Transaction Confirmed', { exact: true })).toHaveCount(8);
    await expect(
      client.getByRole('link', { name: /View on Stellar Explorer/ }).first(),
    ).toHaveAttribute('href', /stellar\.expert\/explorer\/testnet\/tx\/[a-f0-9]{64}/);
    await client.screenshot({
      path: info.outputPath('testnet-escrow-desktop.png'),
      fullPage: true,
    });
    await client.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => client.locator('aside').evaluate((el) => el.getBoundingClientRect().right))
      .toBeLessThanOrEqual(0);
    await expect(client.locator('footer')).toContainText('INR and Testnet XLM shown separately');
    expect(
      await client.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await client.screenshot({ path: info.outputPath('testnet-escrow-mobile.png'), fullPage: true });
    await info.attach('confirmed-testnet-transactions', {
      body: JSON.stringify(
        { hashes, signing: 'Freighter extension transport fixture; actual extension unverified' },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    expect(errors).toEqual([]);
  } finally {
    for (const page of pages) await page.context().close();
  }
});
