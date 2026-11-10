# Contributing to yt-stream-sync

Thanks for helping! Bug reports, ideas, docs fixes and code are all welcome.

## Reporting bugs

[Open an issue](https://github.com/ZXY101/yt-stream-sync/issues/new/choose) with the
add-on and browser versions, where the streams were playing (YouTube tabs or Holodex), what
you did, what you expected and what happened. Security problems: please follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## Suggesting features

Open a feature request and describe the problem you want solved, not only the solution.
Search the existing issues first; it may already be planned or decided against.

## Pull requests

1. Read [AGENTS.md](AGENTS.md) (code style, structure, security rules; it's for humans too)
   and the [development guide](docs/development.md).
2. For anything bigger than a small fix, open an issue first so we can agree on the approach.
3. Keep each pull request to one logical change, with tests:
   - logic and components → Vitest
   - every user-facing flow → an E2E test
   - every bug fix → a regression test that fails without the fix
4. Update the docs in the same pull request when behaviour, settings or permissions change.
5. Run the checks before pushing:

   ```sh
   npm run check && npm run typecheck && npm run test:coverage
   npm run build && npm run lint:ext && npm run test:e2e
   ```

6. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat(popup): …`,
   `fix(controller): …`). The changelog is generated from them, so never edit `CHANGELOG.md`
   by hand.
