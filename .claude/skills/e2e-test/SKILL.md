---
name: e2e-test
description: Add or update end-to-end tests for yt-stream-sync (Firefox with the built add-on). Use when adding a user-facing feature or fixing a UI bug.
---

# E2E test

How the harness works:

- Playwright is only the **test runner**. Playwright can't install add-ons into
  Firefox, so `e2e/fixtures/firefox.ts` launches Playwright's Firefox build with
  **puppeteer-core over WebDriver BiDi** and installs `dist/` with
  `browser.installExtension()`. `e2e/global-setup.ts` builds `dist/` before every run.
- Each test gets a fresh Firefox profile. The add-on's `moz-extension://` UUID is
  pinned by a pref, so extension page URLs are stable.
- Open extension pages with `openExtensionPage(page, "popup/index.html")` (or the
  `openPopup` fixture). Plain `page.goto()` to a `moz-extension://` URL never
  reports completion because the page moves to another process; the helper waits
  on the document instead.
- Known Firefox/BiDi quirks: `browser.newPage()` hangs, so use the first tab
  (`firefoxPage`). Background tabs stall video, so put several players as iframes
  on one page instead of in several tabs.

Writing tests:

- Tests live in `e2e/tests/<area>.spec.ts`, one file per view or flow. Import
  `test` and `expect` from `../fixtures/test.ts`.
- The page object is puppeteer's `Page`, not Playwright's: use `waitForSelector`,
  `evaluate` and `locator` from puppeteer, and Playwright's `expect` on plain values.
- Select by role or label (`::-p-aria(Name)` in puppeteer, or `getByRole`-style
  queries in `evaluate`). Add `data-testid` only when there's no accessible handle.
- **No network.** Players are local fake pages served by the suite (from milestone 3,
  under `e2e/pages/`) that mimic the YouTube player API. Only an opt-in `live`
  project may load YouTube.
- Cover the happy path, the main error state, and persistence where it applies.
- Before calling it done, break the expectation once and see the test fail.
