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

Vite builds from `src/` into `dist/` and copies `static/` (manifest, icons) as it is. Output
file names are stable (no hashes) and the code isn't minified, so store reviewers can read it.
Third-party code goes into `chunks/vendor.js`.

Because the add-on is bundled, a Mozilla Add-ons (AMO) submission needs the source code
uploaded alongside it, with these build steps: `npm ci && npm run build`.

## Tests

- **Unit:** Vitest with jsdom, next to the code (`*.test.ts(x)`). The coverage gate is 80%
  for lines, branches, functions and statements.
- **E2E:** `npm run test:e2e` builds `dist/`, starts Firefox with a fresh profile, installs
  the add-on and runs `e2e/tests/`. See the `e2e-test` guide in `.claude/skills/` for the
  harness details and its quirks.
