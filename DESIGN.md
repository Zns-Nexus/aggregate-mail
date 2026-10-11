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
  scrollbar: "#38383d"
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

A macOS-style working interface across all desktop platforms. Black outer background, near-black working surfaces, white primary text and restrained secondary text. Rounded mail and sender panes, grouped Settings controls, and consistent curved menus and dialogs. Blue belongs to current selection, links and switches. No decorative cards, pills, glass effects or slogans.

## Layout

- Top bar 52px and, apart from its controls, drags the window. On Windows and Linux there are no traffic lights, so the window runs frameless with no caption overlay and the bar draws its own three dots (12px, `#ff5f57` / `#febc2e` / `#28c840`) that close, minimize and maximize over IPC; they grey to `#3a3a3a` while another window has focus. Settings, Appearance moves them to the right, where the close dot takes the corner.
- On macOS, the native traffic lights start at (16px, 16px). The app draws no dots of its own there; the top bar reserves 96px on the left and uses its normal 16px right padding. Native application, File, Edit and Window menus provide standard Command shortcuts.
- Tabs are plain text (Important, Other, Snoozed, Archive) with muted counts; a 1.5px white underline slides to the active tab on the bar's bottom edge.
- Right side, all plain text or icons: account filters (provider mark plus name), sync status, search icon (opens a rounded field), address-blur eye, Settings.
- Mail and sender panes sit within a 12px workspace gutter, separated by 12px, with 16px corner radii. Rows have 6px horizontal insets, 8px corner radii and 16px padding: high relevance 46px on two lines, medium 28px inline, low 24px; compact density uses 24px rows. Sender sits in a 170px column so subjects align; two-line previews align under the subject. Circular avatars (22px, 18px on low rows): the sender's company logo on a light disc when the domain has one, otherwise a gray initial, each with a small provider badge. The sender is context and stays muted while the subject carries the message in near-white; unread is a bold subject plus a white time. The selected row is a 5.5% white wash with a 1px inset accent bar on its left edge; hover is a 3% wash. High-relevance reasons are plain faint text before the time.
- Sticky date headers (Today, Yesterday, This week, This month, Earlier) in 12px faint text.
- Sender panel 280px in a rounded surface with a hairline border: 44px avatar, 15px name, address, account, message count, salmon reason text, then category and relevance as faint text, followed by "Recent with" and "Recently opened" lists.
- Gmail label filter follows account filters and applies within the current view. When all accounts are shown, label names include their account. Opened Gmail mail shows custom labels as plain text and offers Edit labels in a checkbox dialog. System labels are available for filtering but cannot be edited here.
- No shortcut bar. Shortcuts remain on the keyboard and in the `?` dialog.
- Notices float as a small bordered toast at the bottom.
- Settings: a 640px column of grouped sections on rounded surfaces, existing section headings, 44px account and provider rows, plain status text, outlined buttons and small outline switches. Connection fields state what is already on disk: a ticked `Saved · <client ID>` line under the ID field, `Saved · ••••••••••••` under the secret, the Jev key and the OpenAI key, and `Not saved yet` when nothing is stored. A key is only ever shown as dots. The decision-model provider is a dropdown drawn by the app, because the native select popup ignores the dark theme. MCP shows one line at rest and folds its endpoint, token and client configs behind a `Show options` disclosure, which opens when MCP is on and closes when it is off.
- Dialogs: 18px radius, hairline border, dimmed backdrop.

## Privacy

`p` or the eye button toggles address hiding, remembered between launches. While on, every email address becomes a solid rounded bar (`--veil` with a hairline edge) wherever it appears: account chips, Settings accounts, the saved Google OAuth client ID, sender details, To lines, and addresses inside sender names, subjects, previews, bodies, rules, notices, account tooltips and the disconnect prompt. A bar, never a blur: a 5px blur on 13px text stays guessable. Names, subjects and message text stay readable, and the client secret and OpenAI key are only ever shown as dots. Clicking a hidden address reveals it everywhere; clicking a revealed address hides it again; turning the blur on again hides them all. Compose's From and To fields are the one exception: an input value is blurred (5px) until focused.

## Typography

Client action icons use local outline SVGs with a consistent 24px grid, 1.75px stroke and rounded ends. Close uses a plain cross; Settings uses sliders. Gmail uses a multicolor vector mark, and custom IMAP uses an outline envelope without a colored tile. Button labels and keyboard behavior stay unchanged.

Segoe UI Variable on Windows, SF Pro on macOS. 13px throughout the inbox, 15px sender name and Settings headings, 20px message heading, 14px message body at 1.7 line height.

## Behavior

Right-click a mail row or opened message for Open, Mark as read, Reply, Done, Snooze and Teach sorting; snoozed mail also offers Return to inbox. Right-click selects the target without marking it read. Shift+F10 or the Menu key opens the same menu at the focused message. Arrow keys, Home and End navigate enabled actions; Escape or Tab dismisses and restores focus. The menu stays within the viewport and closes on outside pointer input, external scrolling, resize, window blur, or a view change. Archive, snooze and sorting writes are disabled while busy or syncing. Mark as read is disabled on already-read mail and shares the queued read-on-open request without opening the message. Explicit reads can wait behind sync; failures show a notice and remain retryable.

Ctrl+Plus (including Ctrl+Equals and numpad Plus) chooses comfortable rows; Ctrl+Minus chooses compact rows. These shortcuts suppress page zoom outside editable fields and dialogs; `d` still toggles density. Opening mail requests provider read status independently of other UI actions. Merely selecting a row does not mark it read. Failed read requests leave the message unread and show a notice; reopening retries.

Motion uses short ease-out transitions (cubic-bezier(0.22, 1, 0.36, 1)), never loops. The tab underline and list panes settle in 220ms; opened mail rises 8px, Settings rises 10px, menus reveal over 160ms, and dialogs scale from 0.98 over 240ms. Rows appear together, without stagger. Native smooth scrolling follows programmatic selection in mail lists, sender context, Settings, dialogs and dropdowns. Wheel and trackpad input stay with the platform; there are no wheel interceptors. New panes reset instantly. Reduced-motion preferences shorten transitions and restore immediate scrolling. Focus shows a 1px accent outline. Message bodies render as plain text; remote images are never loaded.
