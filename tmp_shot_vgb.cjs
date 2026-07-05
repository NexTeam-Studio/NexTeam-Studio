const { chromium } = require('playwright');
(async() => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
  await page.goto('http://127.0.0.1:4173/mission-control/aquatrace/workspace?tab=vgb-campaign', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'C:/Users/Peyto/NexTeam-Studio/tmp-proof/vgb-send-button.png', fullPage: true });
  console.log('C:/Users/Peyto/NexTeam-Studio/tmp-proof/vgb-send-button.png');
  await browser.close();
})();
