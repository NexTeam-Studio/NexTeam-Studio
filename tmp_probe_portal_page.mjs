import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await page.goto('http://localhost:5173/portal/accept-invite?client=aquatrace&token=aquatrace-v1-invite', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL', page.url());
  console.log('TITLE', await page.title());
  console.log('BODY_START');
  const text = await page.locator('body').innerText();
  console.log(text.slice(0, 4000));
  console.log('BODY_END');
} finally {
  await browser.close();
}