# Repository knowledge

## Contribution guides

[AGENTS.md](../AGENTS.md) defines the project map, change boundaries, mail privacy safeguards and verification requirements for agents. [CONTRIBUTING.md](../CONTRIBUTING.md) provides setup, focused-change and pull-request steps for people and AI contributors. Read these before changing the repository.

Before shared work starts or resumes, follow the issue search, ownership and
worktree steps in [CONTRIBUTING.md](../CONTRIBUTING.md). The issue or pull
request is the task record for scope, owner, branches, checks and status. See
[ADR 0007](adr/0007-contributor-coordination.md) for the reason for this process.

## Desktop targets

Emc² shares its React renderer, Electron main process and bundled mail service across Windows and macOS. `npm run package` builds Windows NSIS; `npm run package:mac` builds macOS DMG and ZIP files on a Mac. Package names include the macOS architecture. See [installation and storage](../README.md), [product scope](../PRODUCT.md) and [ADR 0001](adr/0001-unsigned-macos-packaging.md).

The macOS target disables app and DMG signing and notarization. The release workflow calls cross-platform CI and publishes installers for version tags. Building a package does not publish it or prove Gatekeeper acceptance.

## Verification

### Mailbox sync

The [sync service](../server/index.ts) allows validated IMAP registration and
Google OAuth callbacks during a pending sync. Each connection schedules its
account immediately. Up to two accounts run at once; an additional account
waits for a slot. Overlapping sync requests share that run. Replacing an
active account's credentials queues one subsequent run with its current
credentials. An old run cannot restore old credentials or recreate a removed account. Mail actions,
account removal, configuration and Teach keep their existing sync guards.

Settings, Retry connection calls `POST /api/accounts/:id/reconnect` with no
account data. The route reads the encrypted saved credentials server-side and
calls `requestSync([id])`; it does not validate SMTP or replace credentials.
Desktop-session, Host, origin and CSRF checks still apply. Unknown IDs return
404 and account data returns 400. Accepted requests return 202 with only the
target account's queued/running status and prior failure. Duplicate requests
share work; an account that has finished can retry while peers remain active.
Its previous error remains until that account finishes. Authentication rejection
requires Google sign-in or an app-password replacement through the existing
connection form. No new automatic provider retry is added.

[Provider listing](../server/providers.ts) saves fetched batches before later
pages or AI sorting finish. New mail first uses local sorting, then receives
the configured AI classification. Cached sorting and snooze state are retained.
Only a successful complete inbox listing marks absent cached messages archived.
A partial failure retains cached mail and fetched batches, sorts new fetched
mail, and reports an account error. AI failures keep local sorting and return
a warning. Sync failures use fixed messages for authentication, access,
transient connection/provider, message-read and unknown failures. Stored details
contain only an operation, allowlisted code and optional numeric HTTP status;
raw exceptions, response bodies and credentials are excluded. IMAP error
emissions reject the pending listing operation and close its connection.
Throwing or false logout produces a separate cleanup warning and preserves
the primary listing result or failure.

Mail batches skip deeply equal cached records and write changed records in one
SQLite transaction using the existing encryption. A failed transaction rolls
back the whole batch. The [renderer](../src/App.tsx) reloads state during sync,
including once per second while pending. Reload notifications share one active
read and one pending refresh. A failed active read still services a refresh
requested during that read; failure alone does not schedule a retry.
The service owns connection-triggered sync so connection callbacks do not
start duplicate runs.

An opened message is selected by ID from the full current cache, so background
classification cannot switch the reader or reply to another message. Closing
the reader restores selection within the filtered list. If the opened message
is removed, it has no reply target. The [selection tests](../src/mail-selection.test.tsx)
cover category changes with remaining or empty lists, removal and closed-reader
selection. Run them with `node --import tsx --test src/mail-selection.test.tsx`.
They check the message used by the reader and reply logic; they do not mount
the UI or execute a reply.

Gmail reuses cached bodies and refreshes unread state with paginated inbox and
unread-ID lists instead of one metadata request per cached message. Fresh raw
reads run in batches of ten and publish before later groups in the same page
settle. Cached-only batches publish once per inbox page. Gmail reads and token
refresh have a 30-second request timeout that aborts transport. Read batches settle every in-flight
request before releasing their account slot. IMAP drains UID/flag enumeration
before fetching missing bodies by UID, with no cached-body download. Before
reconciling absent cache entries, IMAP requires unique UIDs and flags, an
enumeration matching EXISTS, stable UIDVALIDITY/UIDNEXT, no observed mailbox
change and every requested body UID exactly once. Missing bodies report a
message-read failure. Incomplete snapshots retain cached mail. Neither
provider caps the inbox or drops older mail.

Run the synthetic service and provider regressions with:

```sh
node --import tsx --test server/sync.test.ts server/providers.test.ts server/sync-recovery.test.ts src/sync-reload.test.tsx src/mail-selection.test.tsx
```

The [service tests](../server/sync.test.ts) cover registration during pending
sync, the mocked Google callback, credential continuity, coalescing, progressive
visibility, configured AI completion, cache preservation, retry and deleted
accounts. The [provider tests](../server/providers.test.ts) check cached work,
pagination, progressive batches, IMAP command order and actual transport abort
against a synthetic loopback endpoint. They shorten the timeout clock while
asserting the configured 30-second bound. The
[recovery tests](../server/sync-recovery.test.ts) exercise the actual loopback
service with synthetic OAuth transport and ImapFlow command/emitter fixtures.
They cover safe failures, guarded saved-credential reconnect, duplicate clicks,
retry while a peer runs, incomplete listings, four library throttle attempts,
cleanup outcomes, transaction rollback and unchanged/changed cache operation
counts. They also block a later Gmail download group and check that earlier
fresh mail is already in state. The
[reload tests](../src/sync-reload.test.tsx) check the exported coalescing seam,
including a queued refresh after rejection; they do not mount Settings.
These checks use synthetic accounts and mail. They do not prove real Gmail or Workspace authentication, real mailbox
latency, native UI behavior, deployment or release readiness.

### Desktop startup

Run `npm test` and `npm run build` before packaging. The desktop startup check opens the encrypted database, loads the renderer, requires the desktop token for API access and checks native menu roles on macOS. Use a temporary user-data directory so checks cannot open a maintainer's accounts:

```sh
check_dir=$(mktemp -d)
npm run check:desktop -- --user-data-dir="$check_dir"
```

For a packaged Apple silicon build, use the logged-in macOS desktop session. Quit any running copy first, since the mail service uses a fixed port:

```sh
check_dir=$(mktemp -d)
open -n -W "release/mac-arm64/Emc².app" \
  --stdout "$check_dir/stdout.log" --stderr "$check_dir/stderr.log" \
  --args --check-startup --user-data-dir="$check_dir/profile"
cat "$check_dir/stdout.log" "$check_dir/stderr.log"
```

Require a `startup: passed` JSON result and process exit, then remove only the temporary directory created for that check. An `open` exit alone is insufficient. Intel builds use `release/mac/`. These checks do not drive the UI, authenticate real accounts or send mail. A direct SSH executable launch can lack Keychain access even when desktop launch works. Keychain availability is required; an access failure is a blocker, not a reason to replace encryption.

The repository has no `scripts/documentation.py`; documentation checks currently require link and diff review.

## Public contribution boundary

Keep credentials, personal contact details, absolute machine paths, private hostnames, session records and mailbox contents out of source, commits, PRs and release attachments. Use synthetic test data and portable commands. Preserve the project's existing identity. Review commit author and committer metadata before pushing. Ignore rules and package exclusions are preventive controls; scan the final source diff and package contents too. A pattern scan cannot prove the absence of all sensitive information.

## CI

[The CI workflow](../.github/workflows/ci.yml) runs on pull requests, pushes to `main` and manual dispatch. The tag-release workflow calls the same build jobs. Each matrix job uses Node 24, installs the lockfile with `npm ci`, runs `npm test`, runs the TypeScript and production build, runs an isolated production-startup check on Windows and macOS, then packages an installer without publishing. Linux runtime behavior needs separate proof.

| Platform | Architecture | Installer | Standard runner |
| --- | --- | --- | --- |
| Windows | x64 | NSIS `.exe` | `windows-latest` |
| macOS | Apple silicon arm64 | `.dmg` | `macos-15` |
| macOS | Intel x64 | `.dmg` | `macos-15-intel` |
| Linux | x64 | `.AppImage` | `ubuntu-24.04` |

Download `installer-<platform>` from the workflow run's Artifacts section. Each artifact expires after one day. Reruns replace artifacts for rebuilt platforms; successful platform jobs that are not rerun retain their earlier artifacts. Missing installer files fail the job. Superseded runs are canceled, and each job has a 20-minute limit.

[The build-version step](../scripts/set-build-version.mjs) gives non-tag runs the version `<release>-ci.<GITHUB_RUN_ID>.<GITHUB_RUN_ATTEMPT>`. It updates `package.json` and both root lockfile versions only in the runner checkout. Each new run or rerun has a distinct application version and installer filename. The macOS bundle build version and Windows file version use the workflow run number and attempt. Tagged builds keep the exact release version and reject a mismatched tag. Bump and commit the source release version before each new release tag. See [ADR 0004](adr/0004-ci-build-versions.md).

The repository is public. Standard GitHub-hosted runner execution is free under [GitHub's Actions billing policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Artifact storage shares the owner's plan allowance with GitHub Packages; excess artifact storage is billed at $0.25 USD per GB-month. npm cache storage has a separate 10 GB included allowance per repository. One-day artifact retention limits storage use but does not set an account spending cap. Recheck billing before making the repository private or selecting larger runners.

CI has read-only repository permissions, disables signing-certificate discovery, and passes `--publish never` to packaging. It needs no mail-provider keys or signing credentials. Installer creation proves packaging; it does not prove native launch, account sign-in, OS trust acceptance or mail delivery. Windows installers are unsigned; macOS installers are unsigned and not notarized. The [release workflow](../.github/workflows/release.yml) publishes all four installers and SHA-256 checksums only after every build job passes. The version tag must match `package.json`. Only its publishing job has repository write permission.

See [README](../README.md#ci) for usage and [ADR 0002](adr/0002-cross-platform-ci.md) for the decision.

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

Create a new worktree and feature branch for each new Emc² task. Bind the T3 Code thread to that worktree before task work. Preserve the main checkout. See [ADR 0005](adr/0005-task-worktrees.md), based on the owner's instruction from 2026-10-09.

## Showcase downloads

The [showcase website](../website/README.md#download-count) displays a combined download total for Windows,
macOS and Linux installers from all published GitHub releases. Its public query follows pagination and
caches complete totals for ten minutes, retaining the last count on failed requests. It adds no desktop
telemetry. `npm test` includes `scripts/website-downloads.test.mjs`; the website build is separate:
`cd website` followed by `npx lakebed build --target claimed`. Hosted outbound requests require a claimed
deployment. Browser and live deployment verification remain separate from these checks.

## Application rename

Version 0.1.4 publishes the application as Emc². `desktop/migrate.ts` moves `mail`, `settings.env` and `Local State` from the pre-rename app-data folder into the new one on first launch and writes `.renamed-to-emc2` so the step never repeats. `desktop/migrate.test.ts` covers the carry, the single run, the no-overwrite case and the two no-op cases; run it with `npm test`. Installers are named `Emc²-<version>-<os>-<arch>.<ext>`. The Windows application id stays `dev.screen.aggregate-mail`, and the local MCP server is named `emc2`.
