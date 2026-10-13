# ADR 0019: App update prompt and guarded installer handoff

Date: 2026-10-13
Status: Implementation decision for the requested updater layer; verification and independent review are recorded in its PR.
Extends: [ADR 0016](0016-background-running-and-notifications.md) and [ADR 0018](0018-imap-inbox-events.md). The signing and publication boundaries in [ADR 0011](0011-macos-source-installation.md) remain in force.

## Context

The owner requested a new-version prompt with one click to download, install and restart. Mail can be syncing or sending while the desktop window is hidden. A draft can have an unknown send result. An installer must not bypass those boundaries or run during ordinary quit.

Current published releases do not provide the required updater manifests. The observed stable-tag installers carry CI version suffixes. macOS uses local ad-hoc signing and has no supported automatic installation route in this change. Release workflows, signatures, credentials and publishing remain outside this task.

## Decision

Use pinned `electron-updater` 6.8.10 for compatible Windows NSIS and Linux AppImage handoffs. The main process checks the fixed canonical GitHub repository once at startup and when requested. Reject prereleases, downgrades, mismatched versions or process architectures, ambiguous installers, unsupported metadata and missing integrity fields before download. macOS, development and non-AppImage Linux builds report their unsupported state.

Keep the renderer bridge narrow and authenticated to the current main frame. Download only after the user selects Download, install and restart. Disable automatic download, install on normal quit, web installers and differential updates. Bound remote reads and downloads; verify the cached regular nonsymlink file's size and SHA512 after download and immediately before handoff. Preserve the library's configured Windows publisher verification.

Before handoff, reject new mail mutations and sends, close live watchers, drain admitted work and let the renderer apply its send result. Use normal native close and its existing draft/unknown-send confirmation. A cancellation resumes mail without invoking an installer. A failure resumes mail and restores the window when necessary. Leave mail paused only after successful platform handoff. Never force window destruction or exit to bypass cancellation.

## Consequences and proof limits

The UI can offer the requested action only when the installed build and published release meet the compatibility checks. It explains unavailable states instead of selecting a fallback installer. Existing releases and macOS source installations do not acquire automatic update support merely by adding this code.

Synthetic tests can prove state transitions, service draining, IPC restrictions and launch arguments. Startup checks prove only their recorded launch checks and disable update traffic. A real two-version install and restart remains separate proof. Release metadata, stable artifact versions and any future macOS signing route need separate authorized work; this decision grants none of it.
