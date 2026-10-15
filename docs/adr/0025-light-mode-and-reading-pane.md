# ADR 0025: Light mode and a reading pane beside the list

Date: 2026-10-14
Status: Accepted by the owner, who asked for light mode, side-by-side reading
and calmer main panels before settling the interface design.

## Context

The interface was dark only. The brand commitment in PRODUCT.md named a dark
interface, and the main process forced `nativeTheme.themeSource` to `dark` so
Windows Mica and Acrylic never took a pale tint. Themes tinted every surface,
including the mail and reader panes, which the owner found too colorful there.

An opened email replaced the mail list in the same pane. The owner wanted the
list and the email side by side, as in most desktop mail clients, and a reading
layout that felt less improvised.

## Decision

Appearance gains a Mode (System, Light, Dark; Dark by default, so existing
installs look the same) and a Reading pane choice (Side by side, the default,
or Full width). Every color is a token in `src/styles/tokens.css`, defined for
both schemes and each theme. Themes tint the window frame and sidebar; working
panes stay close to neutral in both schemes. Light mode uses deeper accent
shades so links and selection keep their contrast on white.

The renderer sets `data-scheme` on the document root and sends the mode over a
new `window-scheme` IPC message. The main process accepts it only from the app
window and sets `nativeTheme.themeSource`, so the window material, native menus
and the System preference follow the mode. It still starts dark until the
renderer reports.

Side by side keeps the list in a column and shows the opened email in a reader
pane with its actions in the pane header. Rows in that column become two- or
three-line cards. Panes drop out as the window narrows: the sender panel (now
toggled by Sender details), then the reader beside the list, then the sidebar.
These decisions move from CSS media rules into the renderer, so the window
controls can follow the pane in each corner.

The reader shows the subject, one sender line with the recipient beneath and a
short date at the right, then a single quiet image-consent strip above the
body. Image consent, privacy and formatting rules are unchanged
([ADR 0020](0020-explicit-images-with-hidden-text.md)).

## Consequences

- The dark-only brand commitment and the forced dark native theme in
  [ADR 0022](0022-window-materials-and-themes.md) are superseded. Light glass
  depends on the operating system's light material; it needs a manual look on
  Windows 11 and macOS.
- Sender formatting is still mapped to app colors, so formatted mail follows
  the scheme. Images keep their own pixels, which can look heavy on white.
- In jsdom there is no `matchMedia`, so tests see every pane. Narrow-window
  behavior is not covered by automated tests.
