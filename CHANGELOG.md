# Changelog

## Unreleased

- Close the desktop window to the tray instead of exiting, keep the mail service and a five-minute sync running while it is hidden, and show one native notification for the new unread mail a sync finds. Reopen from the tray, its menu or a second launch, and quit from the tray. Fields and selected text keep a native right-click menu.

- Preserve macOS Keychain identity for existing protected mail keys, with one bounded legacy retry and no replacement of unreadable keys. Keep explicit startup-check profiles isolated from saved accounts.

- Match formatted email text, backgrounds, borders and links to the app's dark theme while preserving sender layout, emphasis and image controls.

- Add a macOS source-installation route with Git, Node and Xcode Command Line Tools, requiring no Apple Developer account. Replace invalid inherited signatures through explicit local ad-hoc signing without certificate or provisioning-profile discovery. Keep notarization, DMG signing and existing public release assets unchanged.

- Hide a sender avatar initial when it is a known private name component, while keeping ordinary company initials visible.

- Hide known recipient names in Gmail label controls, including single-letter Unicode name components and encoded destinations. Close Interaction settings with Escape from a focused shortcut field.

- Integrate account setup, sync recovery, uncertain-send protection and reader navigation while preserving every original PR commit. Keep connection forms available during sync, context-menu Open working, and read-on-open active for history and Gmail IMAP All Mail.

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
- Allow connecting additional mailboxes during sync and preserve renewed account credentials when an older sync finishes.
- Show fetched mail with local sorting while sync continues, then apply the configured AI sorting.
- Keep the opened message and reply target when background sorting moves mail to another category.
- Replace cached Gmail metadata reads with unread-ID lists, skip cached IMAP body downloads, and bound Gmail read and token-refresh waits.
- Add Retry connection in Settings using encrypted saved credentials. Duplicate requests share account work; a failed account can retry while another account syncs.
- Report fixed sync error categories and safe failure details. Contain IMAP transport errors, reject incomplete mailbox listings before archiving cached mail, and keep cleanup warnings separate from the sync outcome.
- Skip unchanged mail writes, commit changed batches in one transaction, and coalesce renderer refreshes. Keep fresh Gmail batches visible while later downloads run, including a final refresh queued during a failed read.
- Keep AI sorting limited to committed mail after a batch rollback and classify IMAP connection/greeting timeouts and closed connections as transient failures.
- Make the background AI-failure regression wait for sync completion without starting another sync that can clear the expected warning.
- Recover formatted email for older cached mail through the authenticated content API without changing body text or current mailbox state. Render a bounded safe subset of sender formatting; Show images remains blocked until per-opening activation.
- Add editable keyboard shortcuts and a single-click or double-click opening choice in Settings, with double-click as the default.
- Hide connected recipient names, first names and surnames alongside addresses in previews, headers and email content. Remove hidden values from rendered text, tooltips and accessibility labels; suppress private link destinations and body images in privacy mode.
- Keep recipient names hidden in Snooze, preserve supported images when empty or rejected formatted content falls back, and retain 15px paragraph text without image-status styling.
- Add visible Back and Forward controls and side mouse buttons for visited inbox contexts and emails, with session-only history and draft/dialog guards.
- Keep hidden-address bars within their text lines so adjacent sender details do not overlap.
- Make email bodies easier to read with bounded paragraph spacing, 15px text and a wrapping sender header, without changing stored text.
- Add per-message Show images for supported remote HTTPS images, blocked by default. Older cached mail loads image metadata on demand; older archived IMAP mail fails safely instead of reusing an INBOX UID.
- Preserve cached image metadata when an overlapping read or archive operation completes, and do not restore messages removed during that wait.

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
