# ADR 0022: Window materials and dark themes

Date: 2026-10-13
Status: Accepted by the owner, who requested custom themes and macOS-style
transparency.

The Windows Acrylic choice is superseded by
[ADR 0023](0023-mail-freshness-and-render-cost.md), and the dark-only themes and forced dark
native theme by [ADR 0025](0025-light-mode-and-reading-pane.md); this record retains the original decision.

## Context

The owner asked for a more native macOS look with custom themes and
translucent, glass-like surfaces. CSS `backdrop-filter` can only blur the page's
own content, so it cannot show the desktop behind the window. A blur on a
scrolling list also repaints on every scroll frame, which the owner wants to
avoid on high-refresh displays.

Electron exposes the operating system's own materials: `vibrancy` on macOS and
`backgroundMaterial` on Windows 11 22H2 and later. The compositor draws them, so
they cost the renderer nothing while the page is still.

## Decision

Create the window with `vibrancy: "under-window"` on macOS and
`backgroundMaterial: "acrylic"` on Windows, with a transparent window
background on both. Linux keeps its opaque background. The material is always
present; the renderer paints an opaque theme over it unless Transparency is on.
This keeps the switch entirely in the renderer, with no new IPC command.

The preload reports `materials` so the renderer can disable Transparency where
no material exists. When it is on, only the top bar, rail and sidebar become
translucent. Reading panes stay opaque. Floating layers use a CSS blur that is
drawn only while they are open.

Themes are CSS variable sets on `:root[data-theme]`. Text tones are shared, so
every theme keeps the same contrast. Appearance is stored per device in
localStorage.

## Consequences

- Windows 10 and early Windows 11 builds show the opaque theme only.
- On Windows the window background is transparent before the first paint. The
  window stays hidden until ready, so this is not visible.
- Native appearance of the materials needs manual checks on macOS and Windows 11.
  The startup check proves that the window opens, not how it looks.
