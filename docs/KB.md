# Repository knowledge

## Contribution guides

[AGENTS.md](../AGENTS.md) defines the project map, change boundaries, mail privacy safeguards and verification requirements for agents. [CONTRIBUTING.md](../CONTRIBUTING.md) provides setup, focused-change and pull-request steps for people and AI contributors. Read these before changing the repository.

## Desktop targets

Aggregate Mail shares its React renderer, Electron main process and bundled mail service across Windows and macOS. `npm run package` builds Windows NSIS; `npm run package:mac` builds macOS DMG and ZIP files on a Mac. Package names include the macOS architecture. See [installation and storage](../README.md), [product scope](../PRODUCT.md) and [ADR 0001](adr/0001-unsigned-macos-packaging.md).

The macOS target disables app and DMG signing and notarization. The Windows release workflow is unchanged. Building a package does not publish it or prove Gatekeeper acceptance.

## Verification

Run `npm test` and `npm run build` before packaging. The desktop startup check opens the encrypted database, loads the renderer, requires the desktop token for API access and checks native menu roles on macOS. Use a temporary user-data directory so checks cannot open a maintainer's accounts:

```sh
check_dir=$(mktemp -d)
npm run check:desktop -- --user-data-dir="$check_dir"
```

For a packaged Apple silicon build, use the logged-in macOS desktop session. Quit any running copy first, since the mail service uses a fixed port:

```sh
check_dir=$(mktemp -d)
open -n -W "release/mac-arm64/Aggregate Mail.app" \
  --stdout "$check_dir/stdout.log" --stderr "$check_dir/stderr.log" \
  --args --check-startup --user-data-dir="$check_dir/profile"
cat "$check_dir/stdout.log" "$check_dir/stderr.log"
```

Require a `startup: passed` JSON result and process exit, then remove only the temporary directory created for that check. An `open` exit alone is insufficient. Intel builds use `release/mac/`. These checks do not drive the UI, authenticate real accounts or send mail. A direct SSH executable launch can lack Keychain access even when desktop launch works. Keychain availability is required; an access failure is a blocker, not a reason to replace encryption.

The repository has no `scripts/documentation.py`; documentation checks currently require link and diff review.

## Public contribution boundary

Keep credentials, personal contact details, absolute machine paths, private hostnames, session records and mailbox contents out of source, commits, PRs and release attachments. Use synthetic test data and portable commands. Preserve the project's existing identity. Review commit author and committer metadata before pushing. Ignore rules and package exclusions are preventive controls; scan the final source diff and package contents too. A pattern scan cannot prove the absence of all sensitive information.

## Email links

Message bodies stay plain text. Explicit HTTP and HTTPS URLs become links when the message opens. The renderer preserves query strings and balanced parentheses, and leaves surrounding prose punctuation and curly quotes outside the link. Bare domains and mailto links remain text. The app never renders email HTML or loads body images.

The existing mailparser dependency converts HTML-only email links to text containing their destinations. No mailbox resync or storage migration is needed for URLs already in cached bodies.

Address privacy mode masks URLs containing literal or percent-encoded email addresses and omits their anchors. Turn address privacy off to open these links. Other address masking behavior stays unchanged.

The desktop navigation policy allows HTTP and HTTPS destinations outside the mail service origin. On the mail service origin, only the Google OAuth entry route may open externally. Local API routes and other URL schemes stay blocked.

Verification for source revision `dbe8b870e3ec1140c1385d49118fcbf8f5b917a9`: seven renderer tests and the production build passed. Earlier navigation and server test results apply because their inputs are unchanged. T3 Code browser checks used synthetic mail and covered mouse/keyboard link activation, address privacy, escaped HTML and the exact destination of a URL surrounded by curly quotes. This does not prove native Windows browser handoff, real mailbox operations or release readiness.

Sources: [message rendering](../src/App.tsx), [navigation policy](../desktop/navigation.ts), [mail parsing](../server/providers.ts), [design](../DESIGN.md).

## UI review, 2026-10-09

Baseline: `b04679ac3e6fa62e60acd37dab1d03c1d3f2f981`. Scope: inbox, open message, address privacy, and Settings provider dropdown. Method: source inspection and T3 Code browser interaction using synthetic mail at 1280 x 800 and 900 x 600. The Windows application and real mailbox operations were not exercised.

Guidance: Nielsen usability heuristics and [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), retrieved during this review. This is a focused review, not a full WCAG audit.

These findings remain outside the link repair:

| Before | Recommended after | Why |
| --- | --- | --- |
| Compose, reply, archive, snooze and Teach have keyboard shortcuts but no visible action controls. The shortcut list itself requires `?`. | Add visible access to primary mail actions and shortcut help. | Major: pointer users cannot discover or invoke core actions. See `App` keyboard handler. |
| Address reveal uses a clickable span with no keyboard focus or key handler. | Provide keyboard access to each address reveal control, with valid semantics in both text and mail rows. | Major: keyboard users cannot reveal one address while keeping the others hidden. See `Address`. |
| The provider listbox references a label ID that does not exist. Focus stays on the button, while the active option is declared on the unfocused list. | Connect the label and expose the active option through the focused control. | Major: assistive technology cannot reliably identify the list or current option. See `Dropdown`. |
| Faint text uses `#5a5a5a` on `#0a0a0a`, about 2.87:1 contrast. | Raise contrast for small status, date and context labels to at least 4.5:1. | Minor: these labels are hard to read. See `--text-4` in `style.css`. |
| The compose textarea removes its focus outline without a visible replacement. | Add a visible keyboard focus indicator. | Major: keyboard users cannot see when the message editor has focus. See `.compose-form textarea:focus-visible` in `style.css`. Source finding; not tested in the browser. |

The hierarchy, restrained colors, button focus outlines and reduced-motion rule support the intended dense inbox. The reviewed message and Settings layouts did not overflow at 900px. This review does not claim measured improvements in usability.

## Working checkout

Create a new worktree and feature branch for each new Aggregate Mail task. Bind the T3 Code thread to that worktree before task work. Preserve the main checkout. See [ADR 0002](adr/0002-task-worktrees.md), based on the owner's instruction from 2026-10-09.
