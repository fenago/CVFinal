# Playwright Page API (used in our e2e test)

Source: https://playwright.dev/docs/api/class-page

- `page.goto(url)`: "Returns the main resource response."
- `page.setInputFiles(selector, files)` / `locator.setInputFiles(files)`: "Sets the value of the file input to these file paths or files." Relative paths resolve from the current working directory.
- `page.waitForSelector(selector, {state, timeout})`: returns when the element satisfies the state.
- `page.waitForFunction(fn, arg, {timeout})`: resolves when `fn` returns a truthy value.
- `page.evaluate(fn, arg)`: returns the value of the function, run in the page.
- `page.reload()`: "reloads the current page, in the same way as if the user had triggered a browser refresh."
- `page.screenshot({path, fullPage})`.
- `page.on('console')` and `page.on('pageerror')` ("Emitted when an uncaught exception happens within the page").
- `page.on('dialog')`: the listener "**must** either dialog.accept() or dialog.dismiss() the dialog - otherwise the page will freeze".
- Environment note: Chromium is pre-installed. Use `require('playwright')`, and don't run `playwright install`.
