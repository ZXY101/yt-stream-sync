# Hand tests in a remote Firefox

Automated browsers on the dev server get YouTube's sign-in wall on watch pages, and its IP
gets throttled after a few live loads. For tests on real watch pages, a maintainer's own
machine runs a separate Firefox profile that the dev server drives over WebDriver BiDi
(`scripts/remote-firefox.mjs`).

## Safety

- Use a **separate, empty profile**: whoever reaches the debugging port controls that browser.
  Never sign in to anything important in it.
- Firefox listens on the test machine's **localhost only**. The test machine opens an SSH
  tunnel to the dev server (`-R 127.0.0.1:9222:127.0.0.1:9222`), so only the dev server can
  reach it, and only while the tunnel window is open.

## On the test machine (Windows example)

1. Start Firefox with its own profile and remote debugging:
   `firefox.exe -profile <dir> -no-remote --remote-debugging-port 9222`, with the environment
   variable `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` (lets BiDi open the add-on's pages).
2. In that profile's `user.js`, pin the add-on UUID (same value as `e2e/fixtures/firefox.ts`):
   `user_pref("extensions.webextensions.uuids", "{\"yt-stream-sync@zxy101.github.io\":\"6f1c2b7e-0d3a-4e59-9a61-2c8f4b5d7e10\"}");`
   The maintainer's launcher also drops uBlock Origin (signed, from AMO) into the profile's
   `extensions` folder with `extensions.autoDisableScopes` set to 0, so tests match how the
   add-on is really used. `webExtension.install` over BiDi only makes temporary installs.
3. Open the tunnel: `ssh -N -R 127.0.0.1:9222:127.0.0.1:9222 <user>@<dev server>`.

## On the dev server

```sh
npm run build
node scripts/remote-firefox.mjs install          # temporary add-on, gone when Firefox closes
node scripts/remote-firefox.mjs open <id> <id>   # watch pages in background tabs
node scripts/remote-firefox.mjs status           # sync status as JSON
node scripts/remote-firefox.mjs log              # the popup's debug log
```

Firefox only accepts a `Host` header naming its own port, so the tunnel uses 9222 on both
ends. `REMOTE_FIREFOX=ws://host:port/session` points the script elsewhere. Only one BiDi session at a time:
each command ends its session when done.

Known: creating a foreground tab over BiDi hangs in headless Firefox, so tabs open in the
background. The browser may set `navigator.webdriver`; if YouTube still shows a sign-in wall
there, that's why.
