# Development

## Setup

```sh
nvm use               # Node version from .nvmrc
npm install           # also installs the git hooks (lefthook)
npx playwright install firefox   # browser for the E2E suite
```

gitleaks must be on your `PATH` for the pre-commit hook.

## Commands

See the table in [AGENTS.md](../AGENTS.md#commands).

## Loading the add-on by hand

Run `npm run build`, then:

- **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on →
  `dist/manifest.json`. It stays until Firefox restarts.
- **Chrome:** `chrome://extensions` → Developer mode → Load unpacked → `dist/`.

## How the build works

`npm run build` (`scripts/build.mjs`) runs Vite three times into `dist/`: the popup and the
background script (ES modules, shared chunks), then each content script (`content.js`,
`page.js`) as one self-contained file, because content scripts can't load modules. `static/`
(manifest, icons) is copied as it is. Output
file names are stable (no hashes) and the code isn't minified, so store reviewers can read it.
Third-party code goes into `chunks/vendor.js`.

Because the add-on is bundled, a Mozilla Add-ons (AMO) submission needs the source code
uploaded alongside it, with these build steps: `npm ci && npm run build`.

## Tests

- **Unit:** Vitest with jsdom, next to the code (`*.test.ts(x)`). The coverage gate is 80%
  for lines, branches, functions and statements.
- **E2E:** `npm run test:e2e` builds `dist/`, starts Firefox with a fresh profile, installs
  the add-on and runs `e2e/tests/`. YouTube embed requests are answered with a local fake
  player (`e2e/pages/fake-player.html`), so it needs no network.
- **Live E2E (opt-in):** `LIVE_STREAM=<id of a stream that is live now> npm run test:e2e:live`
  plays that stream in two real embeds, opens a gap and checks the add-on closes it. YouTube
  watch pages ask automated browsers to sign in, so it uses embeds. See the `e2e-test` guide in `.claude/skills/` for the
  harness details and its quirks.
