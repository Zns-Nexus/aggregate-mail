# Changelog

## Unreleased

- On Linux without system credential encryption, start fresh profiles with a local 0600 mail key and show a persistent weaker-protection warning instead of failing. Profiles protected by the system keyring still stop, now with a clear keyring/reset message instead of a raw decrypt error. macOS and Windows still stop when encryption is unavailable. See ADR 0027.

- Rebase the sidebar redesign onto current main, preserving macOS key migration and test timeouts. Reconcile contributor guidance, component links and ADR numbering.

- Add a macOS migration path that wraps the existing mail key under Emc² and preserves the original protected key, identity metadata and encrypted mail for rollback. Later starts prefer a validated current record; migration errors stop before opening mail. Native Keychain labels and reinstall behavior still require separate verification.

- Limit macOS filesystem test fixtures to supported hosts while retaining portable protocol checks and Windows startup coverage.

- Put the sidebar toggle first in the top-left corner, before drawn window controls, at the same spot whether the sidebar is open or closed. Tint the selected row with the accent while the list has focus instead of filling it, keeping the row's own text colors.

- Let Windows and Linux choose between the drawn macOS-style window controls and the system's own caption buttons, switched from Settings, Appearance by reopening the window in place. Use native context menus for mail rows on the desktop. Make the email toolbar icon-only in Mail-style groups and add Move to Trash to it. Mark unread mail with an accent dot, divide rows with hairlines and fill the selected row with the accent while the list has focus. Tint sidebar icons with the accent and let its sections fold. Arrange Settings in System Settings-style groups.

- Render quoted replies with one inset and bar per level instead of the browser's 40px margins on both sides, so deep threads no longer shrink to a narrow column. Center newsletter layouts that use `align="center"`, `<center>` or `margin: 0 auto`, read `ex` and `ch` lengths and borders in any word order. Move the filter controls into a popover under the Filters button, which stays lit while the list is filtered. Draw the Inbox categories as a larger segmented row that fills the list column beside the reader.

- Add light mode with System, Light and Dark choices; every theme now has a light palette, and the window material and native menus follow the mode. Keep the mail list, reader and sender panel near neutral so themes tint only the window frame and sidebar. Open mail beside the list by default, with the email actions in the reader's header and the list as two- or three-line cards; Full width keeps the earlier in-place reader. Redesign the opened email around one sender line, a short date and a quieter image-consent strip, and let the sender panel be hidden. Remove Search from the sidebar now that the mail header has a search field. Split the renderer into components by area and the stylesheet into token and area files.

- Replace Important and Other with one Inbox split into Primary, Social, Promotions, Newsletters, Transactions and Updates tabs, using Gmail's own categories where available. Keep codes, security notices, support threads and replies in Primary, and mark security mail important in the local sorter. Add a hover wash that follows the pointer in the sidebar, Settings and tabs, and let more of the window material show through the sidebar.

- Replace the top bar and rail with a full-height sidebar and per-pane headers, closer to a native macOS mail layout. Fold the mail filter row behind a Filters button. Offer Transparency as Off, Subtle (Mica) or Glass (Acrylic) on Windows, switched live; Glass restores the see-through blur. Window controls sit inside the pane headers so they stay clickable, in close, minimize, maximize order, with the sidebar toggle fixed beside them. Search is a field centered in the mail header.

- Check Gmail API mailbox revisions every 15 seconds and sync changed accounts through the existing queue, with backoff, account replacement guards and updater/shutdown cleanup. Keep IMAP inbox events and the five-minute recovery sync.
- Reduce mail-interface redraw work by reusing unchanged snapshot records and memoizing privacy text and avatars. Remove duplicate desktop polling and defer cache notifications to hidden windows until they are shown. Use Windows Mica instead of live Acrylic, and reduce floating-layer CSS blur. Add a synthetic 1,800-message benchmark.

- Fix Today/Yesterday headings retaining the removed history toolbar's sticky offset. Tighten date-heading padding, mail rows, sender-to-subject spacing, filter/action spacing, pane gutters and sender-panel padding while preserving both density modes.

- Rename Done to Archive throughout the mail interface and shortcut labels. Move Trash out of the action toolbar into an outline icon revealed on each mail row by hover or keyboard focus, retaining confirmation and provider safeguards. Remove Back/Forward buttons from the mail pane while preserving history shortcuts and mouse side buttons.

- Move the app-update notice off the top of the window. It now lives in Settings, About, and appears above the mail pane only when an update can be downloaded or installed, or that action fails. Development and unsupported builds no longer show a permanent "Automatic update unavailable" bar.

- Turn off scroll bouncing (overscroll rubber-banding) on the showcase website.

- Show the Settings sections in the sidebar instead of mail, one section at a time. Add Settings, Appearance with four dark themes, six accent colors and a Transparency switch that uses macOS vibrancy or Windows 11 acrylic behind the window chrome and sidebar. Make menus, dropdowns, notices and dialogs glass, and move the sidebar selection and collapse on a spring.

- Replace the top-bar tabs and account filters with a navigation rail and a collapsible sidebar in the macOS source-list style. The sidebar holds New message, the mail views, the account list with Add account (replacing the top-bar account picker) and sync status, and remembers whether it is open. Refresh the dark design tokens for a more native macOS look.

- Render newsletter layouts closer to the sender's design: accept sender styles marked `!important`, keep block, inline-block and table display modes and floats, stop underlining links the sender marks as undecorated, align small icons with their text, keep the height of images sized only by height, parse newsletters nested up to 96 levels deep instead of falling back to plain text, show hidden preview text as one line, and draw blocked images as empty boxes at their size instead of squeezed text.

- Trigger synthetic Gmail timeout tests after the loopback request arrives, preserving real connection-close and no-retry checks. Add a negative control for lost transport cancellation.

- Hide scrollbar indicators without disabling scrolling. Allow Show images while personal text is hidden, with per-opening consent and masked text, captions and image descriptions. Image URLs containing detected private information remain blocked. Keep captions and inline images in order when private text spans sender markup or image boundaries. Redact image descriptions before truncating them; use a generic description when privacy-mode gallery metadata may already be cut mid-token.

- Check cached updater files before reading them, limit hashing to the expected size, and stop hashing on cancellation or timeout. Ignore cached metadata paths and recheck cache contents before reuse.

- Preserve the installed AppImage and any existing destination when update replacement or launch fails. Enforce download size limits before writing excess bytes, including responses without a Content-Length header, and abort cancelled requests before headers arrive.

- Add an app-update notice with download progress and a single download, install and restart action for compatible Windows NSIS and Linux AppImage releases. Verify release and file identity, drain mail work and honor draft cancellation before installer handoff. Show unavailable states for unsupported builds and release metadata; automatic macOS installation remains disabled under local ad-hoc signing.

- Watch IMAP inbox events to refresh arrivals and read flags through the existing account sync queue. Keep Gmail API polling, bounded reconnect recovery and one notification per successful run; suppress notifications until the first complete import succeeds.

- Keep reader keyboard navigation in the chosen sort order when read-on-open removes the current message from Unread results.

- Add a visible account setup button and a compact picker for multiple accounts. Combine unread, relevance, account, label and search filters; sort by newest, oldest or relevance and restore controls with Back/Forward. Keep account names and addresses hidden in privacy mode.

- Use a 16-pixel template image for the macOS tray and a 22-pixel tray image on Linux. Keep the Windows tray image unchanged.
- Add visible Read, Reply, Done, Snooze and Move to Trash controls for selected and opened mail. Show pending reads and apply confirmed read state before an inbox refresh completes. Report failed actions without removing mail.
- Move mail to the provider's Trash only after confirmation. Require safe IMAP MOVE support and a unique server-declared Trash folder, counting mixed-case duplicates; preserve Done as archive and never permanently delete mail.
- Document 13 public email-client feedback reports, their evidence limits and priorities for the mail UX stack.

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

## 0.1.5

- Ship the background tray, native new-mail notifications, shortcut bar, context menus, brand logos and UI refresh with Windows, macOS and Linux installers.
- Release every merged main push automatically as a patch version with published installers; minor and major releases stay manual.

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
