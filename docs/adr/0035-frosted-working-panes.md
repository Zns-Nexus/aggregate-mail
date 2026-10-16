# ADR 0035: Frosted working panes

Date: 2026-10-15
Status: Accepted by the owner, who requested the frosted window background in the supplied reference.

## Context

The native material already shows through the window frame and sidebar, but opaque working panes hide it across most of the window. The owner requested the same frosted background through the main content while foreground text stays sharp.

## Decision

Extend the existing `data-glass` styles to the mail list, reader, sender context and Settings pane. Mix the neutral `--surface` color with transparent at 55% in dark mode and 72% in light mode, over the existing window-frame tint. The stronger light tint limits background interference with text.

Keep the current appearance choices, support gate and native materials. Off and unsupported platforms remain opaque. Change background colors only; do not apply element opacity, text filters or CSS blur to scrolling panes. Sticky date headings, Settings control groups, privacy masks and mail image consent retain their existing behavior.

This supersedes the opaque-working-pane choice in [ADR 0022](0022-window-materials-and-themes.md), [ADR 0023](0023-mail-freshness-and-render-cost.md) and [ADR 0025](0025-light-mode-and-reading-pane.md). Their other decisions remain in effect.

## Verification limits

Existing appearance tests exercise material selection and Off; privacy tests exercise content behavior. The build compiles the stylesheet. Neither proves native material appearance, contrast over desktop content or movement smoothness. Those require macOS and Windows 11 acceptance. Live browser application testing remains prohibited by PRODUCT.md; no saved accounts are opened for this change.
