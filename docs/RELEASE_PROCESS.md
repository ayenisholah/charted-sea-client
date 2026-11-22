# Release process

## Versioning

[SemVer](https://semver.org). Before 1.0, minor versions may break the API and the changelog says how to migrate. 1.0 ships once open questions 1–5 are answered and the API shape is confirmed with Charted Sea.

## How a release happens

1. Each PR with a user-visible change includes a changeset (`npx changeset`): patch, minor or major, plus one line for the changelog.
2. On merge to `main`, `release.yml` opens or updates a "Version packages" PR that bumps `package.json` and writes `CHANGELOG.md`.
3. Merging that PR publishes to npm with `--provenance` from GitHub Actions (OIDC; no long-lived npm token), creates the `vX.Y.Z` tag and the GitHub release.
4. Check the npm page shows the provenance badge linking to the workflow run.

## Before the first publish (0.1.0)

- [ ] Marc has agreed to the name `charted-sea-client` (or a different name is chosen).
- [ ] M2 done: full surface, TypeDoc site, examples.
- [ ] Live smoke test passed once with a real token.
- [ ] npm package configured for trusted publishing from this repository's `release.yml`.
- [ ] README says "unofficial" above the fold.

## Hotfixes

Branch from `main`, fix with a test, add a patch changeset, merge. There are no release branches before 1.0.

## Deprecation

A removed or renamed method is deprecated (JSDoc `@deprecated` plus a one-time debug log) for at least one minor release before removal.
