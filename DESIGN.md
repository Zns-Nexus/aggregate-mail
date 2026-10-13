---
name: Emc²
colors:
  background: "#000"
  surface: "#0c0c0e"
  raised: "#19191c"
  hover: "rgba(255,255,255,0.03)"
  selected: "rgba(255,255,255,0.055)"
  line: "rgba(255,255,255,0.07)"
  control-border: "rgba(255,255,255,0.12)"
  text: "#fff"
  text-secondary: "#a0a0a6"
  text-muted: "#88888f"
  text-faint: "#82828a"
  accent: "#6b9cff"
  link: "#8ab0ff"
  reason: "#e3a08b"
  veil: "#1d1d1d"
  veil-hover: "#262626"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI Variable Text, Segoe UI, Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  control: "8px"
  pane: "16px"
  menu: "12px"
  dialog: "18px"
  avatar: "50%"
---

# Aggregate interface

## Direction

A roomier macOS-style working interface across all desktop platforms. Black outer background, near-black working surfaces, white primary text and restrained secondary text. Rounded mail and sender panes, grouped Settings controls, and consistent curved menus and dialogs. Blue belongs to current selection, links and switches. No decorative cards, pills, glass effects or slogans.

## Layout

- Top bar 56px and, apart from its controls, drags the window. On Windows and Linux there are no traffic lights, so the window runs frameless with no caption overlay and the bar draws its own three dots (12px, `#ff5f57` / `#febc2e` / `#28c840`) that close, minimize and maximize over IPC; they grey to `#3a3a3a` while another window has focus. Settings, Appearance moves them to the right, where the close dot takes the corner.
- On macOS, the native traffic lights start at (16px, 16px). The app draws no dots of its own there; the top bar reserves 96px on the left and uses its normal 16px right padding. Native application, File, Edit and Window menus provide standard Command shortcuts.
- Tabs are plain text (Important, Other, Snoozed, Archive) with muted counts; a 1.5px white underline slides to the active tab on the bar's bottom edge.
- Right side, all plain text or icons: account filters (provider mark plus name), sync status, search icon (opens a rounded field), address-blur eye, Settings.
- Mail and sender panes sit within a 16px workspace gutter, separated by 16px, with 16px corner radii. Rows have 8px horizontal insets, 8px corner radii and 18px padding: high relevance 62px on two lines, medium 40px inline, low 34px; compact density uses 28px rows and tighter vertical spacing. Sender sits in a 170px column so subjects align; two-line previews align under the subject. Circular avatars (22px, 18px on low rows): the sender's company logo on a light disc when the domain has one, otherwise a gray initial, each with a small provider badge. The sender is context and stays muted while the subject carries the message in near-white; unread is a bold subject plus a white time. The selected row is a 5.5% white wash with a 1px inset accent bar on its left edge; hover is a 3% wash. High-relevance reasons are plain faint text before the time.
- Sticky date headers (Today, Yesterday, This week, This month, Earlier) in 12px faint text.
- Sender panel 280px with a hairline left border: 44px avatar, 15px name, address, account, message count, salmon reason text, then category and relevance as faint text, followed by "Recent with" and "Recently opened" lists.
- Gmail label filter follows account filters and applies within the current view. When all accounts are shown, label names include their account. Opened Gmail mail shows custom labels as plain text and offers Edit labels in a checkbox dialog. System labels are available for filtering but cannot be edited here.
- No shortcut bar. Current shortcuts appear in the help dialog and can be edited in Settings, Interaction. Conflict checks preserve editing, Escape, Tab, account-number and system shortcuts.
- Notices float as a small bordered toast at the bottom.
- Settings: a 680px column of grouped sections on rounded surfaces, existing section headings, 52px account and provider rows, plain status text, outlined buttons and small outline switches. Connection fields state what is already on disk: a ticked `Saved · <client ID>` line under the ID field, `Saved · ••••••••••••` under the secret, the Jev key and the OpenAI key, and `Not saved yet` when nothing is stored. A key is only ever shown as dots. The decision-model provider is a dropdown drawn by the app, because the native select popup ignores the dark theme. MCP shows one line at rest and folds its endpoint, token and client configs behind a `Show options` disclosure, which opens when MCP is on and closes when it is off.
- Dialogs: 18px radius, hairline border, dimmed backdrop.
- Account setup opens directly from the empty inbox and from Settings. Use the same provider choice and connection form in both places. Show known providers with their server settings already filled in; show host and port fields only for custom IMAP. Offer configured Google sign-in first and label the separate app-password option clearly. Keep errors in the form, preserve input on failure and disable duplicate submissions while checking the connection. Developer OAuth settings belong in an advanced disclosure.

## Privacy

Hidden-address bars are 0.9em high and fit within the text line. Each bar stays on one line, is capped at its container width and can wrap as a unit after a label. This leaves space between consecutive sender-detail rows without exposing the hidden text.

`p` or the eye button toggles personal-information hiding, remembered between launches. Email addresses and known connected-recipient names become solid bars. Names come from account display names when available and the current message's To/Cc headers tied to connected addresses. Full names, first names and surnames are hidden with case-insensitive whole-word matching, including previews, subjects, recipient headers, bodies, notices and text attributes. Sender company labels remain readable unless they match a known private name. Names absent from these sources cannot be inferred reliably.

A hidden bar contains no private text in its DOM children or labels. Clicking or using Enter/Space on a bar explicitly reveals that token; re-enabling privacy clears reveals. Each bar fits on one line. Private link destinations are suppressed while privacy is on, including encoded destinations. Show images can explicitly display supported images while private text stays hidden. Alt text and captions stay redacted; image URLs containing detected private information remain blocked. Image pixels cannot be redacted. Enabling privacy clears existing image consent, but the user can select Show images again. Compose's editable From/To fields keep the existing focus-to-reveal exception. Secrets stay dots.

## Typography

Formatted email uses the app's dark surfaces, readable text, blue links and subtle borders. Sender tables, headings, lists, emphasis, spacing and bounded dimensions remain intact. Normalize sender colors, including legacy presentation attributes, without changing image pixels or privacy bars. Keep the 15px body default and 1.45 line height; supported sender font sizes still provide hierarchy.

Client action icons use local outline SVGs with a consistent 24px grid, 1.75px stroke and rounded ends. Close uses a plain cross; Settings uses sliders. Gmail uses a multicolor vector mark, and custom IMAP uses an outline envelope without a colored tile. Button labels and keyboard behavior stay unchanged.

Sender provider badges are small rounded squares with opaque backgrounds; Gmail and IMAP use the raised dark surface. Their glyphs remain visible in both comfortable and compact rows, so reduced density never leaves an empty outline over the sender logo.

Segoe UI Variable on Windows, SF Pro on macOS. 14px in comfortable inbox rows, 13px in compact rows, 15px sender name and Settings headings, 20px message heading, 15px message body at 1.45 line height, with 0.85em paragraph spacing in a 65ch column.

## Behavior

An app-update notice below the top bar shows the current check result, download progress or a fixed recovery message. A compatible release offers Download, install and restart. The app checks once at startup; users can check again explicitly. Download starts only after the click. Installation waits for mail work and any renderer send result, then uses the existing native draft-discard prompt. Keep editing cancels installation and resumes mail. No ordinary quit installs an update. Unsupported builds explain the limit without an install button, including the current macOS source-build route. Progress uses the native progress element and status text; it adds no animation.

Selected and opened mail has a visible action group above the message list or reader: Mark as read, Reply, Done, Snooze and Move to Trash. Snoozed mail shows Return to inbox. The group wraps at narrow widths and uses the existing button and focus styles. Read requests show a pending label, coalesce duplicate actions and apply confirmed state immediately; a later refresh failure does not turn a successful read into a failed action. Selection alone still leaves unread state unchanged.

Move to Trash requires a confirmation dialog and remains distinct from Done. It removes the selected email from the local cache only after the provider confirms the move. Failure keeps the email and the dialog available, with a notice to check the provider before retrying. The confirmation contains no subject or address. The app never permanently deletes mail, and recovery uses the provider's Trash. Unsupported IMAP MOVE, missing or ambiguous special-use folders, and unsafe message identities fail without guessing. Archived IMAP mail without a Message-ID shows an explanation and disables the action.

Right-click a mail row or opened message for Open, Mark as read, Reply, Done, Snooze and Teach sorting; snoozed mail also offers Return to inbox. Right-click selects the target without marking it read. Shift+F10 or the Menu key opens the same menu at the focused message. Arrow keys, Home and End navigate enabled actions; Escape or Tab dismisses and restores focus. The menu stays within the viewport and closes on outside pointer input, external scrolling, resize, window blur, or a view change. Archive, snooze and sorting writes are disabled while busy or syncing. Mark as read is disabled on already-read mail and shares the queued read-on-open request without opening the message. Explicit reads can wait behind sync; failures show a notice and remain retryable.

Ctrl+Plus (including Ctrl+Equals and numpad Plus) chooses comfortable rows; Ctrl+Minus chooses compact rows. These shortcuts suppress page zoom outside editable fields and dialogs; `d` still toggles density. Opening unread mail requests provider read status independently of other UI actions. Pending read requests coalesce. This includes reader navigation and cached archived Gmail mail. Merely selecting a row does not mark it read. Failed read requests leave the message unread and show a notice; reopening retries. Archived IMAP mail is located by Message-ID, with exact candidate verification before changing remote flags.

Motion uses short ease-out transitions (cubic-bezier(0.22, 1, 0.36, 1)), never loops. The tab underline and list panes settle in 220ms; opened mail rises 8px, Settings rises 10px, menus reveal over 160ms, and dialogs scale from 0.98 over 240ms. Rows appear together, without stagger. Native smooth scrolling follows programmatic selection in mail lists, sender context, Settings, dialogs and dropdowns. Scrollbar indicators are hidden throughout the interface; scrollable regions keep their existing overflow and keyboard behavior. Wheel and trackpad input stay with the platform; there are no wheel interceptors. New panes reset instantly. Reduced-motion preferences shorten transitions and restore immediate scrolling. Focus shows a 1px accent outline. Message bodies preserve supported sender tables, headings, emphasis, spacing and HTTP(S) links, with colors matched to the app theme through bounded safe rendering. Sender scripts, forms, embedded documents, global stylesheets and remote fonts are discarded. Oversized or unsupported content falls back to readable cached text. Show images appears above the body. Images stay blocked until activation for this opening, appear in formatted-content order or below plain text, fit the reader width and send no referrer. Enabling privacy removes body images and clears consent. Show images remains enabled and can grant new consent while text, captions and alt descriptions stay hidden. The control warns that loading can tell the sender the email was opened. Loading, failure and no-supported-images states use plain status text. Switching messages or closing the reader clears consent. Embedded CID images are not shown.

An uncertain send keeps the compose dialog and draft open with "Send status unknown" and a warning that the message may already have been sent. Editing the draft keeps this status. Every subsequent Send submission requires confirmation that another send may create a duplicate. Closing compose asks to discard this draft and warns about possible delivery; it does not call the draft unsent. The native application-close prompt also avoids calling the draft unsent. Form validation blocks invalid input before submission. Confirmed send success closes compose. Sent-copy, connection cleanup and inbox-refresh failures appear as warnings without changing the send outcome.

Back and Forward use labeled arrow buttons in secondary text, pinned above the inbox and reader, with date headings below them. The reader shows a separate muted `Esc` hint for closing the email. Navigation restores the view, account and Gmail label filters, search text and selected or opened message. Row selection alone creates no visit; editing a search creates one visit for the edit sequence. A new visit after Back clears Forward. History stays in memory for the current window. Compose, Teach, Snooze, shortcut help and Settings block history traversal. Returning to an email starts with images blocked again. If a visited message disappears, navigation shows the list instead of opening another message; a missing account filter returns to All.

Closing the desktop window hides it to a tray icon instead of exiting, so the app, its mail service and its five-minute sync keep running. The tray menu reopens the window or quits, a second launch restores the window, and the system session end still exits. A sync that finds new unread mail shows one native notification for the run, naming the count and reopening the window when clicked; the first import of a mailbox never notifies, and a failed sync reports no arrivals. Editable fields and selected text keep a native right-click menu for undo, redo, cut, copy, paste and select all, with items enabled from the platform's edit flags; mail rows keep the app's own menu.

The top bar has a compact All accounts picker and a visible Add account button that opens the existing provider setup dialog. Privacy mode labels accounts by number and provider, with a plain Needs attention indicator for account errors. Account number shortcuts still work outside controls. The picker owns its keyboard input.

A wrapping control row above mail combines All mail/Unread, relevance, sort and Gmail labels with the current account, view and search. Newest is the default; Oldest reverses date order and Relevance puts higher relevance first, then newest. Message ID breaks ties. Relevance order omits date headings. Explicit control changes close the reader and enter navigation history; automatic read updates keep the opened message visible. Back/Forward restores each control. Empty results show Reset filters and sort, which returns to all accounts, all labels, all read/relevance values, no search and newest order within the current view. Controls remain in memory for this window.

While Emc² runs, each IMAP account watches its inbox for arrival, flag and removal events. These events request the existing sync and notification path; Gmail API accounts keep the five-minute poll. Event bursts coalesce. The first complete import and failed syncs do not notify, including recovery after a partial first import. Account removal or replacement closes the old watcher. Periodic sync remains a recovery path when a connection or server does not deliver prompt events. Native notification timing depends on the provider and operating system.
