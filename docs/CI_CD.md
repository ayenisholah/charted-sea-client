# CI/CD

Every third-party action is pinned to a full commit SHA with the version in a comment. Workflows default to `permissions: contents: read` and widen per job only where needed.

## Workflows

| File | Trigger | What it does |
|---|---|---|
| `ci.yml` | push to `main`, every PR | `verify` job: commitlint (PRs), `format:check`, `lint`, `typecheck`, `check:deps`, `check:dupes`, `check:unused`, `check:no-deps`, `check:fixtures`. `test` job: `test:coverage` on Node 20, 22, 24; uploads coverage to Codecov from Node 24. `package` job: `build`, `publint`, `attw --pack`, `size-limit`, ESM and CJS import smoke tests. |
| `codeql.yml` | PR, push, weekly | CodeQL for JavaScript/TypeScript (`security-and-quality`). |
| `security.yml` | PR, push | gitleaks over the full history; `actions/dependency-review-action` on PRs (fails on high-severity advisories or non-permissive licences). |
| `scorecard.yml` | weekly, push to `main` | OpenSSF Scorecard; results to code scanning and the README badge. |
| `release.yml` | push to `main` | If `package.json` holds a version not yet on npm (merged from a `release/X.Y.Z` PR), `npm publish --provenance --access public` via trusted publishing (`id-token: write`, environment `npm`), then tag and GitHub release from the changelog. Otherwise a no-op. |
| `docs.yml` | push to `main` | TypeDoc → GitHub Pages. |
| `live-smoke.yml` | `workflow_dispatch` only | Live smoke test with the `CHARTED_SEA_TOKEN` secret in a protected `live` environment (manual approval). |
| `mutation.yml` | weekly, manual | Stryker; HTML report as an artifact, not a gate. |

## Gates on `main`

`main` accepts only pull requests, admins included. Required checks: `verify`, `test (20)`, `test (22)`, `test (24)`, `package`, `analyze` (CodeQL) and `gitleaks`. Squash merges only, with linear history; branches are deleted on merge.

## Local gate

`npm run check` runs the same steps as the `verify` and `package` jobs, plus `test:coverage`, so a green local run means a green CI run.

```jsonc
// package.json scripts (the ones the gate uses)
"check:lockfile": "npm ci --dry-run --ignore-scripts --no-audit --no-fund",
"format:check": "prettier --check .",
"lint": "eslint .",
"typecheck": "tsc --noEmit",
"check:deps": "depcruise src --config .dependency-cruiser.cjs",
"check:dupes": "jscpd src",
"check:unused": "knip",
"check:no-deps": "node scripts/assert-no-runtime-deps.mjs",
"check:fixtures": "node scripts/hash-fixtures.mjs",
"test:coverage": "vitest run --coverage",
"check:package": "npm run build && publint && attw --pack . && size-limit",
"check": "all of the above, in that order",
"test:live": "vitest run --config vitest.live.config.ts",   // needs CHARTED_SEA_TOKEN; never in PR CI
"test:mutation": "stryker run",
"docs": "typedoc --out docs-site src/index.ts",
"example": "tsx"                                           // npm run example -- examples/<file>.ts
```

## Dependabot

Weekly updates for `npm` (dev dependencies grouped) and `github-actions`. Updates go through the same gates; nothing auto-merges.

## Repository files

`.github/ISSUE_TEMPLATE/{bug,feature}.yml`, `.github/pull_request_template.md` (checklist: tests, changeset, docs, spec updated), `CODEOWNERS`, `.nvmrc` (24), `.editorconfig`.
