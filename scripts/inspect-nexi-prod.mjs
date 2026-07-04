import { chromium } from 'playwright';

const BASE_URL = 'https://nexteam-studio-production.up.railway.app';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(45000);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  console.log('HOME_TEXT_START');
  console.log((await page.locator('body').innerText()).slice(0, 4000));
  console.log('HOME_TEXT_END');

  const start = page.getByRole('button', { name: /start conversation/i });
  console.log('START_BUTTON_COUNT', await start.count());
  if (await start.count()) {
    await start.click();
    await page.waitForTimeout(5000);
  }

  console.log('AFTER_CLICK_TEXT_START');
  console.log((await page.locator('body').innerText()).slice(0, 6000));
  console.log('AFTER_CLICK_TEXT_END');

  const textareaCount = await page.locator('textarea').count();
  const inputCount = await page.locator('input').count();
  const buttons = await page.getByRole('button').allInnerTexts();
  console.log(JSON.stringify({ textareaCount, inputCount, buttons }, null, 2));

  await browser.close();
}

main();
