import { chromium } from 'playwright';

const BASE_URL = 'https://nexteam-studio-production.up.railway.app';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fillComposer(page, text) {
  const input = page.locator('input').first();
  await input.waitFor({ state: 'visible', timeout: 45000 });
  await input.fill(text);
  await page.keyboard.press('Enter');
}

async function fillConversation(page) {
  const steps = [
    'Acme Plumbing',
    'Plumbing',
    '4 technicians',
    'Around 80 jobs a month',
    'Tampa Bay area',
    'Dispatch and scheduling chaos',
    'We use Jobber and Google Calendar',
    'I want help with scheduling and work orders',
    'Scheduling dispatcher',
    'PlumbFlow',
    'Yes, build it'
  ];

  for (const text of steps) {
    await fillComposer(page, text);
    await wait(3500);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(45000);

  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console:${msg.type()}: ${msg.text()}`);
    }
  });
  page.on('response', async (response) => {
    if (response.status() >= 400) {
      errors.push(`response:${response.status()}:${response.url()}`);
    }
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'scripts/artifacts/nexi-prod-01-home.png', fullPage: true });

    await page.getByRole('button', { name: /start conversation/i }).click();
    await page.locator('input').first().waitFor({ state: 'visible', timeout: 45000 });
    await page.screenshot({ path: 'scripts/artifacts/nexi-prod-02-chat-started.png', fullPage: true });

    await fillConversation(page);
    await page.waitForTimeout(15000);

    const bodyText = await page.locator('body').innerText();
    await page.screenshot({ path: 'scripts/artifacts/nexi-prod-03-after-flow.png', fullPage: true });

    const checks = {
      reachedBlueprintHeader: /Your Blueprint is Ready/i.test(bodyText),
      reachedBusinessOverview: /Business overview/i.test(bodyText),
      reachedWhatYourAgentWillDo: /What your agent will do/i.test(bodyText),
      renderedBusinessName: /Acme Plumbing/i.test(bodyText),
      renderedTrade: /Plumbing/i.test(bodyText),
      noFriendlyErrorBanner: !/Nexi had trouble responding/i.test(bodyText)
    };

    console.log(JSON.stringify({ ok: Object.values(checks).every(Boolean), checks, errors, excerpt: bodyText.slice(0, 5000) }, null, 2));
  } catch (error) {
    await page.screenshot({ path: 'scripts/artifacts/nexi-prod-error.png', fullPage: true }).catch(() => {});
    console.log(JSON.stringify({ ok: false, fatal: error.message, errors }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
