---
name: e2e-test
description: Add or update end-to-end tests for yt-stream-sync (Firefox with the built add-on). Use when adding a user-facing feature or fixing a UI bug.
---

# E2E test

How the harness works:

- Playwright is only the **test runner**. Playwright can't install add-ons into
  Firefox, so `e2e/fixtures/firefox.ts` launches Playwright's Firefox build with
  **puppeteer-core over WebDriver BiDi** and installs `dist/` with
  `browser.installExtension()`. `e2e/global-setup.ts` runs `npm run build` first.
- Each test gets a fresh Firefox profile. The add-on's `moz-extension://` UUID is
  pinned by a pref, so extension page URLs are stable.
- **Fake YouTube:** `openMultiview(page, streams)` (`e2e/fixtures/youtube.ts`) intercepts
  requests: a multiview page with one iframe per stream, and every
  `https://www.youtube.com/embed/…` request answered with `e2e/pages/fake-player.html`
  (live, `{ id, latency }`) or `e2e/pages/fake-archive.html` (archive,
  `{ id, position, start? }`; `start` stands in for a watch page's broadcast start).
  `readArchive()` reads an archive's position, and `userAction()` seeks, pauses or plays it
  the way a user would (popup helpers are in `e2e/fixtures/popup.ts`).
  The real manifest's content scripts run on it; everything else is blocked (no network).
  `streamFrame()` and `readStream()` read a fake player's latency, rate and state.
- The fake player mimics YouTube: latency grows by `1 - playbackRate` per second while
  playing and by 1 per second while paused, and stats report 0 while paused. When the page
  script starts using more of YouTube's player, add it to the fake (and to
  `src/test/fake-youtube.ts`).
- **The popup** opens with the `openPopup` fixture, in its own window. A real popup acts on
  the active tab; as a page it takes `?tab=<id>` instead. `addAllStreams(popup, n)` goes
  tab by tab like a user (opens the popup for each stream's tab and clicks **Add**);
  `groupRows`, `addButtons` and `removeStream` read and change the sync group.

Quirks of Firefox over BiDi (Playwright 1.65 / Firefox 159):

- `browser.newPage()` for a tab hangs; `newPage({ type: "window" })` works. The first tab
  is the `firefoxPage` fixture.
- `moz-extension://` navigation needs the env var `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` (set by
  the launcher), and puppeteer never sees it finish, so use `openExtensionPage()`, which
  waits on the document instead.
- After that navigation puppeteer loses track of the tab's frames and requests, and request
  interception can't be switched on from an extension page. Keep players in a normal page.
- Background tabs stall real video, so put several real players as iframes on one page.

Writing tests:

- Tests live in `e2e/tests/<area>.spec.ts`, one file per view or flow. Import
  `test` and `expect` from `../fixtures/test.ts`.
- Page objects are puppeteer's `Page`/`Frame`, not Playwright's: use `evaluate`,
  `waitForSelector`, `waitForFrame`, and Playwright's `expect` / `expect.poll` on values.
- Don't depend on the order players joined (it varies under parallel runs); sort first.
- Cover the happy path, the main error state, and persistence where it applies.
- Before calling it done, break the expectation once and see the test fail, and run
  `npm run test:e2e -- --repeat-each 3` for anything timing-based.
- **Live project** (`e2e/live/`, opt-in, network): `LIVE_STREAM=<live id>` (two real
  embeds) and/or `ARCHIVE_STREAMS=<id>,<id>` (two real watch pages, each in its own window;
  close the popup after adding, because media in unfocused headless windows stops). Run
  with `npm run test:e2e:live`. Live watch pages ask automated browsers to sign in; embeds
  and archive watch pages don't.
