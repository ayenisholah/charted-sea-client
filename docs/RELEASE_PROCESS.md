# Release process

## Versioning

[SemVer](https://semver.org). Before 1.0, minor versions may break the API and the changelog says how to migrate. 1.0 ships once open questions 1–5 are answered and the API shape is confirmed with Charted Sea.

## How a release happens

`main` only changes through pull requests, including releases.

1. Each PR with a user-visible change includes a changeset (`npx changeset`): patch, minor or major, plus one line for the changelog.
2. To release, branch `release/X.Y.Z` from `main`, run `npx changeset version` (bumps `package.json`, writes `CHANGELOG.md`, removes the changesets), and open a PR titled `chore: release X.Y.Z`.
3. Merging it runs `release.yml`: because `package.json` now holds a version that isn't on npm, it publishes with `--provenance` through npm trusted publishing (OIDC; no stored npm token), then tags `vX.Y.Z` and creates the GitHub release from the changelog.
4. Check the npm page shows the provenance badge linking to the workflow run.

## Before the first publish (0.1.0): done 2026-11-22

0.1.0 was published by hand (`npm publish`), so it has no provenance; trusted publishing is used from 0.2.0.

- [ ] Marc has agreed to the name `charted-sea-client` (or a different name is chosen).
- [ ] M2 done: full surface, TypeDoc site, examples.
- [ ] Live smoke test passed once with a real token.
- [ ] npm package configured for trusted publishing from this repository's `release.yml`.
- [ ] README says "unofficial" above the fold.

## Hotfixes

Branch from `main`, fix with a test, add a patch changeset, merge. There are no release branches before 1.0.

## Deprecation

A removed or renamed method is deprecated (JSDoc `@deprecated` plus a one-time debug log) for at least one minor release before removal.
