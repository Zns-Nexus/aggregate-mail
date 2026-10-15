# ADR 0026: Choice of window controls and native context menus

Date: 2026-10-14
Status: Accepted by the owner, who asked for a toggle between macOS-style and
native Windows window controls and for a more macOS-native interface.

## Context

Outside macOS the window is frameless and the renderer draws macOS-style
traffic lights. Some users prefer the operating system's own caption buttons,
which on Windows 11 also offer snap layouts. Electron draws those buttons only
when a window is created with `titleBarOverlay`; it cannot be turned on or off
on an existing window. Mail rows used a menu drawn by the app, which looks
foreign next to native menus elsewhere in the system.

## Decision

Settings, Appearance offers macOS style (the default) or Windows style on
Windows and Linux. The choice is stored by the main process in `window.json`
in the app data folder, because it must be known before the window exists.
Switching opens a new window at the same bounds and closes the old one; the
renderer refuses while a draft is open or sending, since the old page is
discarded. In Windows style the rightmost pane header leaves room for the
buttons, and the renderer sends its surface and text colors so the buttons match
the theme. Both new IPC messages accept input only from the app window and
validate it.

Mail rows use a native context menu on the desktop. The renderer sends the item
list (ids, labels, enabled flags, display-only shortcuts and position); the main
process validates it, shows the menu and returns the chosen id, and the renderer
runs that action. The browser target keeps the drawn menu.

## Consequences

- A window-controls switch reloads the renderer: in-memory navigation history,
  search and image consent reset.
- Native caption buttons and menus need a manual look on Windows and Linux;
  automated tests cover validation and the renderer side only.
- Double-clicking a header to maximize is left to the system in Windows style.
