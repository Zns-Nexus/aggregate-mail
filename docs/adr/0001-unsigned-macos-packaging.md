# ADR 0001: Unsigned macOS packaging

Status: Accepted

## Context

Aggregate Mail has a Windows Electron application. A macOS version should reuse the existing renderer, mail service and storage format. The maintainer requires unsigned packages and public contributions that contain no private operational or personal information.

## Decision

Add a macOS DMG and ZIP target using the installed Electron builder. Build for the selected architecture on macOS. Disable app signing, DMG signing and notarization explicitly. Preserve Windows packaging and the existing release workflow.

Use Electron's native macOS menu roles and window controls. Keep the existing close-to-quit behavior and draft confirmation. Close the mail service only after quitting proceeds, so cancelling a draft warning leaves it available.

Keep runtime data outside the repository and package. Publish only portable project documentation and reviewed source. Credentials, personal details, host configuration and local execution records are excluded.

## Consequences

The macOS build needs no maintainer signing identity or store credentials. Downloaded copies can be blocked by Gatekeeper. Packaging and native startup need separate verification. Signing, notarization, auto-updates and automated macOS releases require a later decision.
