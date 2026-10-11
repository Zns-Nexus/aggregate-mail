---
name: Emc²
colors:
  background: "#0a0a0a"
  raised: "#161616"
  hover: "rgba(255,255,255,0.03)"
  selected: "rgba(255,255,255,0.055)"
  line: "rgba(255,255,255,0.07)"
  control-border: "rgba(255,255,255,0.12)"
  text: "#ededed"
  text-secondary: "#b4b4b4"
  text-muted: "#7d7d7d"
  text-faint: "#5a5a5a"
  accent: "#6b9cff"
  link: "#8ab0ff"
  reason: "#e3a08b"
  veil: "#1d1d1d"
  veil-hover: "#262626"
typography:
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, -apple-system, SF Pro Text, Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  control: "6px"
  dialog: "10px"
  avatar: "50%"
---

# Aggregate interface

## Direction

Quiet and flat. Ryan Vogel's layout at a readable size: near-black background, hairline dividers, gray text steps for relevance, and one blue accent used only for the selected row's edge, links and switches. No cards, pills, shadows or colored surfaces.

## Layout

- Top bar 48px and, apart from its controls, drags the window. On Windows and Linux there are no traffic lights, so the window runs frameless with no caption overlay and the bar draws its own three dots (12px, `#ff5f57` / `#febc2e` / `#28c840`) that close, minimize and maximize over IPC; they grey to `#3a3a3a` while another window has focus. Settings, Appearance moves them to the right, where the close dot takes the corner.
- On macOS, the native traffic lights start at (16px, 16px). The app draws no dots of its own there; the top bar reserves 96px on the left and uses its normal 16px right padding. Native application, File, Edit and Window menus provide standard Command shortcuts.
- Tabs are plain text (Important, Other, Snoozed, Archive) with muted counts; a 1.5px white underline slides to the active tab on the bar's bottom edge.
- Right side, all plain text or icons: account filters (provider mark plus name), sync status, search icon (opens an underlined field), address-blur eye, Settings.
- Rows run edge to edge with 16px padding: high relevance 46px on two lines, medium 28px inline, low 24px; compact density uses 24px rows. Sender sits in a 170px column so subjects align; two-line previews align under the subject. Circular avatars (22px, 18px on low rows): the sender's company logo on a light disc when the domain has one, otherwise a gray initial, each with a small provider badge. The sender is context and stays muted while the subject carries the message in near-white; unread is a bold subject plus a white time. The selected row is a 5.5% white wash with a 2px accent bar on its left edge; hover is a 3% wash. High-relevance reasons are plain faint text before the time.
- Sticky date headers (Today, Yesterday, This week, This month, Earlier) in 12px faint text.
- Sender panel 280px with a hairline left border: 44px avatar, 15px name, address, account, message count, salmon reason text, then category and relevance as faint text, followed by "Recent with" and "Recently opened" lists.
- No shortcut bar. Shortcuts remain on the keyboard and in the `?` dialog.
- Notices float as a small bordered toast at the bottom.
- Settings: a 640px column of sections separated by hairlines, numbered headings, 44px account and provider rows, plain status text, outlined buttons and small outline switches. Connection fields state what is already on disk: a ticked `Saved · <client ID>` line under the ID field, `Saved · ••••••••••••` under the secret, the Jev key and the OpenAI key, and `Not saved yet` when nothing is stored. A key is only ever shown as dots. The decision-model provider is a dropdown drawn by the app, because the native select popup ignores the dark theme. MCP shows one line at rest and folds its endpoint, token and client configs behind a `Show options` disclosure, which opens when MCP is on and closes when it is off.
- Dialogs: 10px radius, hairline border, dimmed backdrop.

## Privacy

Hidden-address bars are 0.9em high and fit within the text line. Each bar stays on one line, is capped at its container width and can wrap as a unit after a label. This leaves space between consecutive sender-detail rows without exposing the hidden text.

`p` or the eye button toggles address hiding, remembered between launches. While on, every email address becomes a solid rounded bar (`--veil` with a hairline edge) wherever it appears: account chips, Settings accounts, the saved Google OAuth client ID, sender details, To lines, and addresses inside sender names, subjects, previews, bodies, rules, notices, account tooltips and the disconnect prompt. A bar, never a blur: a 5px blur on 13px text stays guessable. Names, subjects and message text stay readable, and the client secret and OpenAI key are only ever shown as dots. Clicking a hidden address reveals it everywhere; clicking a revealed address hides it again; turning the blur on again hides them all. Compose's From and To fields are the one exception: an input value is blurred (5px) until focused.

## Typography

Segoe UI Variable on Windows, SF Pro on macOS. 13px throughout the inbox, 15px sender name and Settings headings, 20px message heading, 15px message body at 1.45 line height. Body paragraphs use 0.85em spacing within a 65ch column. Empty lines form one paragraph break; single line breaks and indentation stay visible. The sender header wraps its date below long sender and recipient lines.

## Behavior

Back and Forward use labeled arrow buttons in secondary text, pinned above the inbox and reader, with date headings below them. The reader shows a separate muted `Esc` hint for closing the email. Navigation restores the view, account filter, search text and selected or opened message. Row selection alone creates no visit; editing a search creates one visit for the edit sequence. A new visit after Back clears Forward. History stays in memory for the current window. Compose, Teach, Snooze, shortcut help and Settings block history traversal. Returning to an email starts with images blocked again. If a visited message disappears, navigation shows the list instead of opening another message; a missing account filter returns to All.

Motion is short and eased out (cubic-bezier(0.22, 1, 0.36, 1)), never looping. The tab underline slides in 320ms. Switching views slides the list 14px toward the chosen tab with rows fading in on a 12ms stagger capped at six rows so the list settles with the pane; opening mail rises 8px; Settings rises 10px; the sender panel crossfades; dialogs scale up from 0.98. Reduced-motion settings turn all of it off. Focus shows a 1px accent outline. Message bodies render as plain text. Images stay blocked until the reader activates Show images for that message. Remote images appear separately below the text, fit the reader width and send no referrer. The control warns that loading can tell the sender the email was opened. Loading, failure and no-supported-images states use plain status text. Switching messages or closing the reader clears consent. Embedded CID images are not shown.
