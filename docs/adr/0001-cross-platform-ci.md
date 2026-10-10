# ADR 0001: Cross-platform installer CI

Date: 2026-10-09
Status: Accepted

## Context

Aggregate Mail has a Windows tag-release workflow but no pull-request validation. The requested CI must create installers across desktop platforms and remain free or very low cost. A separate branch owns macOS application changes.

## Decision

Use standard GitHub-hosted runners for Windows x64, macOS arm64 and x64, and Linux x64. Run the existing tests and production build before invoking the installed electron-builder directly for NSIS, DMG or AppImage. Keep application code and the existing release workflow outside this change.

Run on pull requests, pushes to `main` and manual dispatch. Cancel superseded runs, limit jobs to 20 minutes and retain only installer artifacts for one day. Use read-only repository permissions and disable publishing and signing-certificate discovery.

## Consequences

Runner execution is free while this public repository uses standard runners. Artifact storage can incur charges above the owner's shared allowance. A one-day retention period limits storage duration; it does not guarantee a zero bill. No paid service, larger runner or persistent self-hosted runner is needed.

CI verifies tests, compilation and installer creation on each target host. Native application behavior, OS trust acceptance and provider operations require separate proof. This CI does not publish releases or supply signing credentials.
