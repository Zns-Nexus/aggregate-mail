# ADR 0031: Full sidebar branch integration

Date: 2026-10-15
Status: Accepted for the requested local port and Mac rebuild.

## Decision

Integrate the complete `feat/sidebar-design` interface from commit `6cd5122b2ff2d9b748242c385eba12691f23992c` into the newer local Emc² candidate. Apply its changes relative to the shared base, preserving newer storage and behavior corrections. Keep version 0.1.8 and the early Keychain helper entry. Source records 0021 through 0025 were initially imported as 0026 through 0030 because those numbers already identified local decisions. After the source branch merged into main, its canonical records are 0022 through 0026. The three local decisions now use 0032 through 0034; duplicate source copies are consolidated into the canonical records.

The full sidebar, Settings navigation, category tabs, themes, light mode, native materials, per-pane headers, toolbar and reading pane replace the earlier sidebar-only layout. Inbox tabs are derived locally; Important/Other remain server categories for Teach, relevance and MCP.

Preserve the icon-only updater and dismissible details, visible custom account labels with hidden addresses, menu-only history with transient reader return, density shortcuts and viewport windowing. These override conflicting source behavior. Source historical benchmark and Windows receipts are not proof for this integrated candidate. Window-control changes use normal native closure and its draft guard before recreating the window; new native IPC validates both the main frame and app origin.

## Verification and limits

Require the complete synthetic suite, strict production build, focused privacy/navigation checks and an independent review of the integrated diff. Build and verify an ad-hoc signed package on Mac, then check isolated encrypted startup and process/listener exit before replacing the installed app. Retain the previous bundle and exact saved key wrappers; verify the installed artifact and normal-profile launch without reading private mail. Source tests do not prove physical mouse input, native smoothness, provider delivery or encryption interoperability.

No developer account, certificate, notarization, release, public commit or push is part of this work. Encryption remains unchanged; [the research report](../encryption-research.md) records future options and compatibility limits.

## Rebase reconciliation

The current main release version supersedes the version pinned during the local port. Preserve the corner sidebar toggle and softer selected-row tint from main. ADR 0023 retains the source benchmark history; its fully mounted list timings do not measure this candidate's viewport windowing. The draft-safe recreation and main-frame IPC checks above supersede ADR 0026's original window replacement path. Later PR delivery authorization supersedes the earlier local-only publication hold; merging and releasing remain outside this task.
