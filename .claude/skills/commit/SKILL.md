---
name: commit
description: Make a clean Conventional Commit in yt-stream-sync. Use whenever committing changes in this repo.
---

# Commit

1. `git status` / `git diff` — split unrelated changes into separate commits.
2. Run `npm run check`, `npm run typecheck` and `npm run test:coverage`; for UI or
   manifest changes also `npm run build && npm run lint:ext` and `npm run test:e2e`.
   lefthook re-runs Prettier, oxlint, tsc, gitleaks and commitlint on commit.
3. Check the staged diff for secrets or personal data before committing.
4. Message format: `type(scope): summary` in the imperative, ≤ 72 chars.
   - types: feat, fix, perf, refactor, docs, test, build, ci, chore
   - scopes: controller, popup, background, content, page, e2e, ci, deps, docs, release
   - breaking change: `feat(background)!: …` + a `BREAKING CHANGE:` footer
   - `feat`/`fix` lines land in the changelog, so write them for users.
   - wrap body lines at 100 characters (commitlint enforces it).
5. Body (optional): why, not what.
6. Never `--no-verify`. If a hook fails, fix the cause.
7. Never stage `docs/PLAN.md` or `docs/PROGRESS.md` (local symlinks, gitignored).
