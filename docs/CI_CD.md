# CI/CD

Planned workflows. Every third-party action is pinned to a full commit SHA with the version in a comment. Workflows default to `permissions: contents: read` and widen per job only where needed.

## Workflows

| File | Trigger | What it does |
|---|---|---|
| `ci.yml` | push to `main`, every PR | `verify` job: commitlint (PRs), `format:check`, `lint`, `typecheck`, `check:deps`, `check:dupes`, `check:unused`, `check:no-deps`. `test` job: `test:coverage` on Node 20, 22, 24; uploads coverage to Codecov from Node 24. `package` job: `build`, `publint`, `attw --pack`, `size-limit`, ESM and CJS import smoke tests. |
| `codeql.yml` | PR, push, weekly | CodeQL for JavaScript/TypeScript (`security-and-quality`). |
| `security.yml` | PR, push | gitleaks over the full history; `actions/dependency-review-action` on PRs (fails on high-severity advisories or non-permissive licences). |
| `scorecard.yml` | weekly, push to `main` | OpenSSF Scorecard; results to code scanning and the README badge. |
| `release.yml` | push to `main` | If `package.json` holds a version not yet on npm (merged from a `release/X.Y.Z` PR), `npm publish --provenance --access public` via trusted publishing (`id-token: write`, environment `npm`), then tag and GitHub release from the changelog. Otherwise a no-op. |
| `docs.yml` | push to `main` | TypeDoc → GitHub Pages. |
| `live-smoke.yml` | `workflow_dispatch` only | Live smoke test with the `CHARTED_SEA_TOKEN` secret in a protected `live` environment (manual approval). |
| `mutation.yml` | weekly | Stryker; report as an artifact, not a gate (M2). |

## Gates on `main`

Branch protection requires `verify`, `test (20, 22, 24)`, `package`, CodeQL and gitleaks to pass, one approving review for outside contributors, and linear history (squash merge).

## Local gate

`npm run check` runs the same steps as the `verify` and `package` jobs, plus `test:coverage`, so a green local run means a green CI run.

```jsonc
// package.json scripts (planned)
"format:check": "prettier --check .",
"lint": "eslint .",
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:coverage": "vitest run --coverage",
"test:live": "vitest run --config vitest.live.config.ts",
"build": "tsup",
"check:deps": "depcruise src --config .dependency-cruiser.cjs",
"check:dupes": "jscpd src",
"check:unused": "knip",
"check:no-deps": "node scripts/assert-no-runtime-deps.mjs",
"check:package": "npm run build && publint && attw --pack . && size-limit",
"check": "npm run format:check && npm run lint && npm run typecheck && npm run check:deps && npm run check:dupes && npm run check:unused && npm run check:no-deps && npm run test:coverage && npm run check:package"
```

## Dependabot

Weekly updates for `npm` (dev dependencies grouped) and `github-actions`. Updates go through the same gates; nothing auto-merges.

## Repository files

`.github/ISSUE_TEMPLATE/{bug,feature}.yml`, `.github/pull_request_template.md` (checklist: tests, changeset, docs, spec updated), `CODEOWNERS`, `.nvmrc` (24), `.editorconfig`.
