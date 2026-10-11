# Changelog

## Unreleased

- Verify the exact archived IMAP Message-ID before marking mail read; reject missing or mismatched search candidates.
- Mark mail read when moving through the open reader with j/k, and close the old reader when a number shortcut changes accounts.
- Keep the synthetic IMAP store until process exit so Windows does not try to delete an open SQLite file during test cleanup.

- Keep sender provider badges visible in compact rows and give Gmail/IMAP badges opaque rounded-square backgrounds instead of empty circular outlines.

- Add explicit Mark as read to the mail context menu, sharing queued provider updates and retryable errors with read-on-open.
- Adopt roomier macOS-style dark chrome across the toolbar, inbox, sender pane, Settings, menus and dialogs, with rounded controls, smooth programmatic scrolling and reduced-motion support; keep compact density available.

- Restore the mail context menu in the feature client: right-click or Shift+F10 on rows and opened messages for existing mail actions.

- Replace client action icons with consistent rounded outlines and use a vector Gmail mark in account filters, Settings and sender badges.

- Sync Gmail labels, filter cached mail by label, and edit existing custom labels on opened messages.
- Add Ctrl+Plus and Ctrl+Minus shortcuts for comfortable and compact inbox density.
- Mark opened unread mail read without dropping requests during other actions or sync; include archived Gmail mail and safely locate archived IMAP mail by Message-ID, with retryable errors.
- Open guided account setup directly from the inbox, with provider defaults, app-password help and errors that keep the form open for correction.
- Keep another provider's connection form open when Google sign-in finishes, including while its connection check is pending.
- Close the onboarding test database before removing its temporary directory so fixture cleanup works on Windows.
- Add Gmail and Google Workspace connections through TLS IMAP/SMTP with a Google app password, alongside configured Google sign-in. Keep the two connection methods separate and avoid duplicate Gmail Sent copies.
- Add contributor coordination guidance and issue templates to reduce duplicate and overlapping work.
- Keep uncertain sends as "Send status unknown" with the draft and a possible-delivery warning. Require duplicate-risk confirmation before sending again, including keyboard submission, and retain uncertainty through draft edits.
- Keep the native application-close prompt neutral about whether a draft was sent.
- Preserve confirmed send success when saving the Sent copy, closing its connection or refreshing the inbox fails. Treat an IMAP logout result of `false` as a cleanup warning.
- Close the synthetic send-test database before deleting its temporary files so Windows cleanup can release the directory.

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
