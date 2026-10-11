# Changelog

## Unreleased

- Add explicit Mark as read to the mail context menu, sharing queued provider updates and retryable errors with read-on-open.
- Adopt macOS-style dark chrome across the toolbar, inbox, sender pane, Settings, menus and dialogs, with rounded controls, smooth programmatic scrolling and reduced-motion support.

- Restore the mail context menu in the feature client: right-click or Shift+F10 on rows and opened messages for existing mail actions.

- Replace client action icons with consistent rounded outlines and use a vector Gmail mark in account filters, Settings and sender badges.

- Sync Gmail labels, filter cached mail by label, and edit existing custom labels on opened messages.
- Add Ctrl+Plus and Ctrl+Minus shortcuts for comfortable and compact inbox density.
- Mark opened unread mail read without dropping requests during other actions or sync; include archived Gmail mail and safely locate archived IMAP mail by Message-ID, with retryable errors.
- Add contributor coordination guidance and issue templates to reduce duplicate and overlapping work.

## 0.1.4

- Show total GitHub installer downloads across Windows, macOS and Linux on the showcase website, with a ten-minute cache and the last successful count retained during GitHub outages.
- Rename the application to Emc². Installers are published as `Emc²-0.1.4-win-x64.exe`, `Emc²-0.1.4-mac-arm64.dmg`, `Emc²-0.1.4-mac-x64.dmg` and `Emc²-0.1.4-linux-x64.AppImage`.
- Carry an existing installation across the rename in one automatic step: the first launch under the new name moves `mail`, `settings.env` and `Local State` from the old app-data folder into the new one and marks the migration so it runs once. The old folder is left in place.
- Rename the local MCP server to `emc2`, so existing `claude mcp add --transport http` registrations must use the new name.
- Keep the Windows application id and the installer identity unchanged, so an installed copy is upgraded rather than installed alongside the old one.

## 0.1.3

- Add cross-platform CI and version-tag releases for Windows x64, macOS Apple silicon and Intel, and Linux x64 installers. Retain CI artifacts for one day and attach installer checksums to releases.
- Give each CI run and rerun a distinct application version and installer filename. Replace rebuilt platform artifacts on reruns. Keep tagged releases at the matching release version.
- Make HTTP and HTTPS URLs in email bodies clickable and keyboard accessible.
- Keep surrounding curly quotes outside email link destinations.
- Open HTTP links through the existing desktop browser handoff. Keep local API routes and unsupported protocols blocked.
- Keep message HTML escaped. In address privacy mode, mask URLs containing email addresses and omit their link targets.
- Record the inbox and Settings review in [repository knowledge](docs/KB.md).
- Document the synthetic browser checks and the untested native Windows handoff.
- Add project agent instructions and contributor guidelines with repository links, verification commands and mail privacy safeguards.
- Add unsigned macOS DMG and ZIP packaging with a macOS icon derived from the existing artwork. The Windows installer command is unchanged.
- Add native macOS menus and spacing for window controls. Keep the mail service running when a user cancels quitting with an unsent draft.
- Use platform-neutral encryption errors and document macOS app-data storage.
- Exclude local environment files, private keys, mail databases and session records from packages, and expand Git ignore rules.

## 0.1.2

- Existing Windows release with sender logos, address privacy controls and MCP settings.
