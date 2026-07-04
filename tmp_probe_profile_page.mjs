import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const email='owner@aquatrace.com';
const password='PortalV1!234';
try {
  await page.goto('http://localhost:5173/portal/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/portal\/aquatrace(\/profile)?/, { timeout: 30000 });
  await page.goto('http://localhost:5173/portal/aquatrace/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('URL', page.url());
  console.log('BODY_START');
  console.log((await page.locator('body').innerText()).slice(0,5000));
  console.log('BODY_END');
} finally { await browser.close(); }