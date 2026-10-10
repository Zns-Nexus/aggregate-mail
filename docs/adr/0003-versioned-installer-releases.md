# ADR 0003: Versioned installer releases

Date: 2026-10-10
Status: Accepted
Supersedes: The Windows-only release lane in ADR 0001 and release exclusion in ADR 0002.

## Context

The maintainer requested a version bump and new builds attached to that version after approving cross-platform CI. Version 0.1.3 must include the merged macOS target and keep Windows and Linux packaging in the same build path.

## Decision

Make CI reusable by the tag-release workflow. A `v*` tag must match the version in `package.json`. All four platform jobs must pass before a separate release job downloads the installers, creates SHA-256 checksums and attaches them to the tagged GitHub release.

Keep build jobs read-only. Only the publishing job receives repository write permission. Manual runs create installer artifacts without publishing unless the selected ref is a version tag. Keep unsigned packaging and one-day CI artifact retention.

## Consequences

PR checks and releases use one packaging definition. Published release downloads remain available after the temporary CI artifacts expire. This workflow does not sign or notarize installers, publish to app stores, or verify native account operations. Local `scripts/release.mjs` remains a separate Windows-only convenience command.
