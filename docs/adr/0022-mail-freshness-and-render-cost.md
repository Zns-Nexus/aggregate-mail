# ADR 0022: Mail freshness and transparency rendering cost

Date: 2026-10-14
Status: Implemented for the owner-requested sync and transparency improvements.

## Context

IMAP already watches INBOX events. Gmail API accounts otherwise wait for the
five-minute recovery sync. Running full inbox and label listings every few
seconds would create unnecessary provider and renderer work.

The synthetic 1,800-message App benchmark also showed costly redraws during
selection and unchanged cache refresh. Windows Acrylic samples content behind
the window; the owner reports lag with transparency enabled.

## Decision

Poll Gmail's `users.getProfile` for `historyId` every 15 seconds after the
previous poll and any triggered sync complete. Use a 10-second request and
token-refresh timeout with SDK retries disabled. A changed marker uses the
existing account sync queue, preserving its two-account concurrency and ordered
mail actions. Advance the marker only after that account sync succeeds.
Failures back off through 30, 60, 120 and 240 seconds to a five-minute ceiling.

Markers remain in memory. Account identity includes the provider, address and
credentials. Replacement, removal, updater quiescence and shutdown discard
timers and late responses. IMAP events and the five-minute full recovery sync
remain. Polling matches Google's recommendation for installed clients; true
Gmail push requires a Cloud Pub/Sub setup outside this local-only change.

Reuse unchanged records and whole snapshots in the renderer. Stable privacy
contexts and memoized text/avatar components avoid repeating work during
selection; changed mail, recipient names, image metadata and privacy settings
still invalidate their output. Native desktop cache-change events replace its
renderer polling timers. Hidden/minimized windows catch up when shown/restored.
Browser-target timers remain as a fallback.

Use Windows Mica instead of Acrylic. This supersedes only the Windows material
choice in [ADR 0021](0021-window-materials-and-themes.md). Mica samples the
wallpaper rather than continuously blurring other windows. Keep macOS vibrancy,
opaque reading panes, the existing material support gate and appearance switch.
Reduce floating-layer CSS blur to 12px for menus/notices and 16px for dialogs.

Amendment, 2026-10-14: the owner found Mica alone did not read as transparency. Appearance now offers
Off, Subtle (Mica) and Glass (Acrylic) on Windows and switches the material live through a validated
`window-material` IPC message. Glass is the default and may lag while the window moves; Subtle keeps
Mica's lower cost. The window starts with Mica until the renderer applies the stored choice.

## Evidence and limits

`npx tsx scripts/benchmark-mail-ui.tsx` mounts the actual App in JSDOM with
development React, synthetic mail and transparency enabled. Seven measured
samples follow two warm-ups. Matched median elapsed times in the same environment:

| Operation | Before | After |
| --- | ---: | ---: |
| Select next mail | 1,445 ms | 393 ms |
| Unchanged cache refresh | 1,741 ms | 51 ms |

The unchanged refresh has no React commit after record reuse. These numbers
measure synthetic React/DOM work, not native frame rate or GPU/compositor cost.
All rows remain mounted; independent inbox virtualization remains separate.

Synthetic tests cover minimal bounded revision reads, unchanged markers,
pending sync, failed sync/backoff, credential replacement, removal, shutdown,
encrypted cache arrivals, notification callbacks and updater drain/resume.
Privacy/image and navigation regressions remain required. Native startup proves
loading and isolation, not animation smoothness, live-provider delivery or macOS
material appearance. Mica trades live behind-window blur for wallpaper-based
appearance. No saved account access, real mailbox changes, sending or release
authority is granted.

Sources: [Gmail installed-client and push guidance](https://developers.google.com/workspace/gmail/api/guides/push),
[profile revision field](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile),
[Electron window materials](https://www.electronjs.org/docs/latest/api/browser-window#winsetbackgroundmaterialmaterial-windows),
[Microsoft Mica](https://learn.microsoft.com/en-us/windows/apps/design/style/mica).
