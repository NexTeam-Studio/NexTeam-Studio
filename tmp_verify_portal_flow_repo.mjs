import { chromium } from 'playwright';

const base = 'http://localhost:5173';
const email = 'owner@aquatrace.com';
const password = 'PortalV1!234';
const results = [];

function record(step, ok, details) {
  results.push({ step, ok, details });
  console.log(`${ok ? 'OK' : 'FAIL'} :: ${step} :: ${details}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${base}/portal/accept-invite?client=aquatrace&token=aquatrace-v1-invite`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('text=Activate portal access', { timeout: 20000 });
  record('invite page load', true, page.url());

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').nth(0).fill(password);
  await page.locator('input[type="password"]').nth(1).fill(password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(/\/portal\/aquatrace\/profile\/setup/, { timeout: 30000 });
  record('invite acceptance works', true, page.url());
  record('redirect to profile setup works', /\/portal\/aquatrace\/profile\/setup$/.test(page.url()), page.url());

  await page.waitForSelector('text=Finish your company profile', { timeout: 20000 });
  await page.locator('input[name="companyName"]').fill('Aquatrace Verified');
  await page.locator('input[name="legalName"]').fill('Aquatrace Verified LLC');
  await page.locator('input[name="industry"]').fill('Leak detection');
  await page.locator('input[name="serviceArea"]').fill('South Florida');
  await page.locator('input[name="teamSize"]').fill('5');
  await page.locator('input[name="website"]').fill('https://aquatrace.example.com');
  await page.locator('input[name="primaryContactName"]').fill('Owner Verified');
  await page.locator('input[name="primaryContactEmail"]').fill(email);
  await page.locator('input[name="primaryContactPhone"]').fill('555-010-9999');
  await page.locator('textarea[name="businessSummary"]').fill('Portal verification run completed.');
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(/\/portal\/aquatrace\/profile$/, { timeout: 30000 });
  record('profile setup save works', true, page.url());

  const profileVisible = await page.locator('text=Edit company profile').count();
  record('profile page loads after save', profileVisible > 0, profileVisible > 0 ? page.url() : 'Profile editor not visible');

  await page.goto(`${base}/portal/aquatrace/mission-control`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('text=Mission Control will mount here next', { timeout: 20000 });
  record('/portal/aquatrace/mission-control placeholder reachable', true, page.url());
} catch (error) {
  record('fatal', false, error.message);
} finally {
  await browser.close();
}

console.log('\nJSON_RESULTS_START');
console.log(JSON.stringify(results, null, 2));
console.log('JSON_RESULTS_END');