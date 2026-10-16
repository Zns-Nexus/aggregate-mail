# ADR 0041: Create automatic release tags after builds

Date: 2026-10-16
Status: Proposed
Extends: [ADR 0004](0004-ci-build-versions.md)

## Context

The automatic patch workflow committed a package and lockfile version bump to
`main` before building. A protected-branch rejection could leave the release
tag behind while the version commit failed, and the release never reached its
build and publish jobs.

## Decision

For automatic patch releases, calculate the next patch above the source version
and existing stable tags. Build the immutable triggering commit SHA and stamp
the selected version only in the runner checkout. Verify the selected version
again in the build workflow. Create and push the tag only after all four
platform jobs pass, then publish the existing installers and updater assets.
Do not write a version commit to `main`.

Manual stable tags retain the existing source-version match. CI suffixes,
platform targets, integrity checks, updater manifests and signing policy stay
unchanged. ADR 0004's source-version bump-before-tag rule continues to apply to
manual releases; this decision changes only the automatic patch lane.
Manual version commits starting with `Release ` still skip the automatic lane.

## Consequences and proof limits

Protected-branch version writes are removed from the automatic lane. A failed
build creates no automatic release tag. Source tests and workflow checks do
not prove a hosted GitHub run, tag push, asset publication or downloaded
installer behavior.

Retry automatic releases through their original workflow run. Their tags point
at source with the older committed version, which the strict manual tag workflow
rejects. A publish retry accepts an existing tag only at the same source commit.
