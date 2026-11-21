// Minimal smoke test pattern (run against a static server on :8080).
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('[data-cv-state="ready"]', { timeout: 60000 });
  await page.setInputFiles('input[type=file]', 'samples/receipt.jpg');
  await page.waitForSelector('[data-scan-state="done"]', { timeout: 60000 });
  const before = await page.locator('#library li').count();
  await page.reload();
  await page.waitForSelector('[data-cv-state="ready"]', { timeout: 60000 });
  const after = await page.locator('#library li').count();
  console.log({ before, after, errors });
  await browser.close();
  process.exit(before > 0 && after === before && errors.length === 0 ? 0 : 1);
})();
