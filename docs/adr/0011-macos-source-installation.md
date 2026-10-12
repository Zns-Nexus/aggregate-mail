# ADR 0011: Install macOS builds from source without an Apple account

Date: 2026-10-12
Status: Accepted by the owner for source-build installation.
Supersedes: ADR 0010's use of electron-builder's `mac.identity: "-"` selector.
Its local ad-hoc signing, privacy and release boundaries remain in effect.

## Context

No project Apple Developer team is available, and the owner excludes their
personal developer account. The owner selected source installation with local
build tools, replacing the earlier binary-download requirement. Ad-hoc signing
repairs bundle integrity but cannot provide a notarized public download.

Independent review found that the locked electron-builder 26.17.0 searches
certificates before treating `"-"` as ad-hoc identity. A synthetic certificate
with a hyphen in its name can be selected. The stable 26.15.3 has the same
defect. Disabling automatic discovery does not stop explicit-identity lookup.

## Decision

Reuse `npm run package:mac:dir` on the user's Mac. Document Git, Node 24 or
newer, npm and Xcode Command Line Tools as prerequisites. Build for the current
architecture and verify the finished app signature before launch. Keep local
DMG and ZIP commands available with the same signing behavior.

Keep builder app signing disabled with `mac.identity: null`. Use an `afterPack`
hook and the existing locked `@electron/osx-sign` library to sign explicitly
with `identity: "-"` and `identityValidation: false`. Disable provisioning-profile
discovery and automatic entitlement rewriting. Use the library's default
Electron entitlements, with hardened runtime disabled and no timestamp.
No signing certificate, Apple login or notarization is needed. Propagate signing
failure so packaging cannot report success with an invalid signature.

The hook skips other platforms. No Electron fuses are configured; any future
fuse mutation must happen before signing. Preserve storage, Keychain identity,
saved accounts, Windows/Linux packaging and release workflows.

## Verification

Exercise the actual signing library against a synthetic app with mocked native
commands and a synthetic developer identity. Require zero certificate and
provisioning-profile lookups and only `codesign --sign -` signing operations.
Verify that the builder returns before accessing its signing keychain, other
platforms skip the hook and signing failures propagate.

Build the app on a matching Mac, run strict deep signature verification, then
launch through the logged-in desktop with a migration-blocking temporary
profile. Require encrypted database startup, renderer load, desktop API
isolation, native menus and separate process exit. Keep Intel runtime and
downloaded-app trust acceptance separate from Apple silicon startup proof.

## Consequences

Users need build tools to install and update from source. The finished app
includes its runtime. Keep the previous app until the replacement works and
preserve its saved data. Do not remove quarantine or disable Gatekeeper if a
build is blocked; report the failure.

Existing GitHub macOS release assets stay unchanged. Copying a local build to
another Mac does not prove its trust acceptance there. Public binary publishing
with a verified publisher still needs an authorized Apple team and separate
release scope. No credentials, publishing or release-workflow changes are
authorized by this decision.
