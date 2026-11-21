---
name: browser-qa-playwright
description: End-to-end testing of the static app in headless Chromium with Playwright. Use when verifying features, reproducing bugs, taking screenshots, or checking persistence, responsiveness and console errors.
---

# Browser QA with Playwright

- Serve statically (`python3 -m http.server 8080` or `npx http-server`). Never test via `file://` (workers and modules fail there).
- In this environment Chromium is pre-installed: `const { chromium } = require('playwright')`. Don't run `playwright install`.
- Upload: `page.setInputFiles('input[type=file]', 'samples/receipt.jpg')`.
- Wait on app state, not sleeps: `await page.waitForSelector('[data-state="done"]', {timeout: 60000})`.
- Persistence: scan → `page.reload()` → assert the library count is the same.
- Responsiveness: during a scan, `page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(performance.now()))))` must return quickly. Or use a PerformanceObserver for `longtask`.
- Collect `page.on('console')` and `page.on('pageerror')`. Zero errors is the bar.
- Screenshots at `deviceScaleFactor: 1` for checks, 2 for ones a person will look at.
- Record results in `docs/qa-report.md` (test, expected, actual, pass/fail, evidence).
