# ADR 0010: Replace invalid macOS signatures with local ad-hoc signing

Date: 2026-10-11
Status: Accepted by the owner for the downloaded-app repair and packaging fix.
Supersedes: The disabled app-signing requirement in ADR 0001. Its DMG-signing,
notarization, privacy and release boundaries remain in effect.

## Context

The published 0.1.4 Apple silicon DMG matches its release checksum. Its app and
Electron framework fail `codesign --verify --deep --strict` with `code has no
resources but signature indicates they must be present`. The existing
`mac.identity: null` skips signing after Electron's bundle is repackaged and
renamed, leaving invalid inherited signatures. macOS reports the downloaded
app as damaged before application startup.

## Decision

Set `mac.identity: "-"` in the existing electron-builder configuration. Use
its local ad-hoc signing and strict signature verification, without a
developer certificate. Keep notarization and DMG signing disabled. Preserve
the Windows and Linux targets and the release workflow.

Verify the packaged bundle's signature and launch it with a temporary profile.
Create the profile's migration marker before launch to prevent saved legacy
mail from moving into the check. Keep signature validity, native startup and
downloaded-app Gatekeeper acceptance as separate proof.

## Consequences

The owner also approved local ad-hoc repair of the downloaded installed app.
This changes bundle signatures, not mail or settings. Ad-hoc signing provides
bundle integrity, not a verified publisher or notarization. Gatekeeper can
still require Open Anyway in System Settings after a user verifies a download.
Do not disable Gatekeeper globally. Existing published assets remain unchanged
until a separately authorized release publishes corrected packages.

## Public distribution limit

The owner later required public downloads that need no security override and
excluded using their personal developer account. Ad-hoc signing does not meet
that requirement. The owner confirmed that no Apple Developer team is
available. Preserve this integrity repair as an intermediate change; do not
publish it as a complete Gatekeeper fix.

Apple's [notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
require a Developer ID certificate, hardened runtime and secure timestamp for
new software. A project organization or authorized upstream publisher must
provide the signing identity before a notarized release can proceed.
