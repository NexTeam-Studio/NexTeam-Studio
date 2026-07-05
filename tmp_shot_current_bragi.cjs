const { chromium } = require('playwright');
(async() => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });
  await page.goto('http://127.0.0.1:4173/mission-control/aquatrace/workspace?tab=bragi', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'C:/Users/Peyto/NexTeam-Studio/tmp-proof/bragi-current-state.png', fullPage: true });
  console.log('C:/Users/Peyto/NexTeam-Studio/tmp-proof/bragi-current-state.png');
  await browser.close();
})();
