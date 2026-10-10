# ADR 0004: Distinct CI build versions

Date: 2026-10-10
Status: Accepted

## Context

The maintainer requires a version bump for each build. Repeated CI runs and reruns must produce identifiable installer candidates while version tags continue to match releases.

## Decision

Before installing dependencies, CI sets non-tag application versions to `<release>-ci.<GITHUB_RUN_ID>.<GITHUB_RUN_ATTEMPT>` in the runner checkout. The workflow run ID distinguishes runs across workflows; the attempt distinguishes reruns. Update both root lockfile versions with the application version. Use numeric native build metadata for Windows and macOS.

For tagged builds, require the tag to match the committed release version and retain that version. Commit a release-version bump before each new release tag. CI does not push version commits, create tags, or publish from a pull request.

## Consequences

Installer filenames and application versions identify each CI candidate without repository write permission. Local production builds and packaging use the committed version; release version bumps remain explicit. All platform jobs in one run attempt use the same application version. A rerun changes the application version, macOS bundle build version and Windows file version. Partial reruns replace rebuilt platform artifacts and preserve earlier successful artifacts.
