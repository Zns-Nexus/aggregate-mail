# Repository knowledge

## Contribution guides

[AGENTS.md](../AGENTS.md) defines the project map, change boundaries, mail privacy safeguards and verification requirements for agents. [CONTRIBUTING.md](../CONTRIBUTING.md) provides setup, focused-change and pull-request steps for people and AI contributors. Read these before changing the repository.

Before shared work starts or resumes, follow the issue search, ownership and
worktree steps in [CONTRIBUTING.md](../CONTRIBUTING.md). The issue or pull
request is the task record for scope, owner, branches, checks and status. See
[ADR 0007](adr/0007-contributor-coordination.md) for the reason for this process.

## Client appearance and read actions

The renderer uses macOS-style dark chrome on every desktop platform: black outer background, rounded mail/sender panes, grouped Settings controls and rounded menus/dialogs. Native window-control spacing and IPC remain unchanged. `src/style.css` defines shared surface/radius tokens. Pane and menu transitions are brief opacity/transform animations; there are no looping effects or wheel-event handlers. Scroll containers use native smooth programmatic scrolling and contained overscroll. New panes reset instantly, and reduced-motion preferences disable smooth scrolling and shorten animations.

Right-click mail rows or opened messages to use Mark as read without opening the message. Already-read mail disables that item. Explicit read and read-on-open both use `markMailRead` in `src/mail-ui.ts`, coalesce pending requests and call the existing read endpoint independently of other UI busy state. Requests wait behind server sync; failures keep unread state and can be retried from the menu or by reopening mail. Other context-menu provider writes remain disabled during sync.

The visible mail-action group offers the same read, reply, archive and snooze paths for selected and opened mail. Pending reads have a visible status. A successful read invalidates earlier state snapshots and updates only the matching message/account/provider identity before refreshing the inbox. Refresh failure reports the already-confirmed outcome separately.

Move to Trash uses the existing authenticated message action route and serialized mail-work queue. Gmail uses `messages.trash`. IMAP requires native MOVE support (including active IMAP4rev2) and exactly one server-declared Trash folder; it does not use ImapFlow's COPY/Deleted/EXPUNGE fallback. Inbox actions validate UIDVALIDITY and UID, plus Message-ID when available. Folder checks compare raw server flags case-insensitively, reject mixed-case duplicate declarations and exclude name-based guesses. Archived mail is resolved through a unique server-declared archive folder and an exact Message-ID match. The encrypted cache entry is removed only after provider success. Confirmed IMAP moves remain successful if connection cleanup throws. Missing folders, unsupported MOVE and unsafe identities fail without a mailbox mutation. See [ADR 0017](adr/0017-safe-trash-and-visible-mail-actions.md).

The [public-feedback report](ux-feedback-2026-10-12.md) records 13 inspected reports, their age/resolution limits and proposed UX priorities. It does not establish complaint prevalence, native behavior or live-provider verification.

## Account selection and cached-mail controls

Multiple IMAP accounts use the existing account store and provider setup. The top-bar Add account button reopens that setup, and the account picker shows all accounts or one account. Privacy mode uses account numbers and provider names instead of names, email addresses or raw errors. Choosing an account also resets its Gmail label filter; composing uses the selected account as From.

`src/mail-ui.ts` filters the cached messages by view, account, Gmail label, search, unread status and relevance, then applies newest, oldest or relevance ordering with date and message-ID ties. These controls do not fetch additional provider history. `src/navigation.ts` keeps their state in window memory and restores it on Back/Forward. Explicit control changes close the reader; automatic read-on-open updates retain its message. Reset clears all controls within the current view. Reader j/k navigation temporarily includes the opened message as a sorting anchor when automatic read removes it from the filtered results; the rendered Unread list still excludes read mail.

Synthetic mounted-App tests cover combined controls, empty-result reset, privacy-safe account labels, account-specific compose, setup entry, keyboard ownership, read-on-open and history. They do not prove actual account connections or native appearance.

## Desktop targets

### Background running and notifications

The desktop window hides to a tray icon when it is closed; the app, its mail
service and its five-minute main-process sync keep running, and only the tray's
Quit item, a system session end or an application quit ends the process. The
tray reopens the window, and a second launch restores it.

The macOS tray uses a 16-pixel template image so the system renders it for the
menu bar appearance. Linux resizes the application icon to 22 pixels; Windows
keeps it unchanged. `desktop/main.test.ts` checks platform image selection, size
and macOS template mode. These source tests do not prove behavior in a Linux
desktop panel.

`startServer` accepts an `onNewMail` callback and the server emits `new-mail`
with the number of new unread messages found by a completed sync run. The
desktop main process turns that into one native notification, which reopens the
window when clicked. The first sync of a mailbox, which imports the cache, and
a sync that failed for an account report no arrivals. `StoredAccount.hasSynced`
records the first successful sync for that decision. See
[ADR 0016](adr/0016-background-running-and-notifications.md).

### IMAP inbox events

`server/imap-watch.ts` opens one read-only INBOX watch per IMAP account, including Gmail IMAP. It reuses the protected provider connection setup and ImapFlow's idle handling. Exists, flags and expunge events coalesce over 100 ms before requesting an account-specific sync. A watcher never fetches mail, so sync fetch responses cannot trigger its own events. Opening or reconnecting also requests sync to recover changes missed while disconnected. Gmail API accounts continue polling.

The existing scheduler keeps at most two account syncs active and serializes mail actions. Events during an active account sync request one pending follow-up. Watch identity includes account, provider, email and credentials; replacement/removal stops the old connection and prevents stale sync batches from overwriting current data. Disconnects allow five automatic reconnect attempts with exponential delays; manual or periodic sync can start a new recovery window. Server close removes watcher listeners and timers and closes its clients.

The first complete import enables later arrival notifications. A partial first import saves fetched mail but keeps that notification boundary closed. Existing caches without a stored boundary retain migration compatibility. See [ADR 0018](adr/0018-imap-inbox-events.md). Synthetic service tests cover events through cache refresh and the existing new-mail callback, account isolation, bursts, read serialization, partial failures, credential replacement/removal and shutdown. They do not prove live-provider event behavior or native notification delivery.

### Protected mail keys on macOS

Electron selects its macOS Keychain item from the application name before
startup. Moving `Local State` preserves Windows protection but does not carry
the old macOS `Aggregate Mail` identity into `Emc²`. The desktop startup path
keeps the Emc² profile location, tries its current identity and permits one
legacy-identity relaunch for an unconfirmed existing key. It validates the
decrypted 32-byte key before opening the mail service. Successful decryption
records the identity with the protected-file digest for later starts. An
unreadable or missing key stops startup without replacing encrypted data.

Use `--user-data-dir=<nonempty path>` before `--` for isolated checks. Explicit
profiles skip both saved-profile migration and development `.data` imports;
invalid profile switches stop before the default profile is accessed. The
startup regression tests use synthetic profiles and do not establish access
to a user's saved Keychain item. See [ADR 0015](adr/0015-macos-keychain-identity.md).

Emc² shares its React renderer, Electron main process and bundled mail service across Windows and macOS. `npm run package` builds Windows NSIS; `npm run package:mac` builds macOS DMG and ZIP files on a Mac. Package names include the macOS architecture. See [installation and storage](../README.md), [product scope](../PRODUCT.md) and [ADR 0001](adr/0001-unsigned-macos-packaging.md).

The macOS source-installation route uses `npm run package:mac:dir` on the target
Mac with Git, Node 24 or newer and Xcode Command Line Tools. It creates
`release/mac-arm64/Emc².app` on Apple silicon or `release/mac/Emc².app` on Intel.
The installed app includes its runtime. See [README](../README.md) for setup.

`scripts/sign-mac.cjs` runs after packaging and replaces inherited signatures
using the locked `@electron/osx-sign` dependency already supplied by
electron-builder. It sets `identity: "-"`, `identityValidation: false`, disables
provisioning-profile discovery and automatic entitlement rewriting, and uses
the library's default Electron entitlements without hardened runtime or a
timestamp. The builder's own `mac.identity` stays `null`: in the locked
26.17.0 implementation, `"-"` can select a certificate containing a hyphen.
The hook avoids that lookup. There are no configured Electron fuse mutations;
signing must follow those mutations if they are added later. Windows and Linux
skip the hook. DMG signing and notarization remain disabled. Regression checks
exercise the actual signing library with synthetic certificate data and mocked
native commands, verify ad-hoc-only arguments, and check failure propagation.
See [ADR 0011](adr/0011-macos-source-installation.md).

The published 0.1.4 arm64 DMG matches its release checksum but its app fails
strict signature verification with `code has no resources but signature
indicates they must be present`. Existing release assets remain unchanged.
The release workflow publishes installers for version tags. Local packaging
does not publish or prove downloaded-app Gatekeeper acceptance.

Ad-hoc signing repairs bundle integrity but does not satisfy Apple's public
distribution requirements. Source installation builds and runs on the user's
Mac and needs no Apple Developer account. Public binary distribution with
normal first-open confirmation requires a project-authorized
Developer ID Application certificate, hardened runtime, secure timestamp,
Apple notarization and a stapled ticket. The publisher can be an organization
or an authorized maintainer's team; users installing the app need no developer
account. See [Apple's notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution),
[organization enrollment](https://developer.apple.com/programs/enroll/) and
[Electron's release guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing).

## Account setup

The empty inbox opens the account connection dialog directly. Settings uses
the same connection path. Known providers supply their server settings; users
enter an email address and provider-issued app password. Only custom IMAP
requires manual hosts and ports. Connection errors stay in the dialog so users
can correct their input.

Google sign-in completion dismisses the provider chooser only. It preserves
another provider's open form and any pending connection check. A pending check
blocks duplicate submissions and form dismissal; a failed check leaves the
entered details available for correction and retry.

`src/onboarding.test.tsx` mounts the React forms in a synthetic DOM with the
test-only `happy-dom` dependency. It exercises the desktop callback, pending
submissions, retained input, inline errors and retry without a browser or accounts.

The server onboarding fixture stops its HTTP server and calls `closeStore()`
before removing the temporary directory. Windows requires the SQLite handle
to be closed before its files can be deleted. The application does not call
this test cleanup helper.

Gmail supports two separate transports: `gmail` uses the existing Gmail API
OAuth flow; `gmail-imap` uses `imap.gmail.com:993` and `smtp.gmail.com:465` over
TLS. The latter accepts personal Gmail and Workspace addresses when Google
permits app passwords. It does not require a Google Cloud project. Google
recommends OAuth, and administrators or account security policy can prevent
app-password access. See [Google's requirements](https://support.google.com/accounts/answer/185833).

Account creation validates incoming and outgoing access before writing the
encrypted account record. Reconnecting cannot silently change between Google
transports or mix their cached message IDs. Gmail IMAP sends rely on Google's
Sent copy and do not append a second copy. Other providers retain the existing
Sent-copy behavior, including the warning after successful delivery when
copying to Sent fails.

Source builds still require OAuth client configuration for Google browser
sign-in. No shared client, cloud relay or provider-registration automation is
included. See [connection instructions](../README.md#connect-an-account) and
[ADR 0008](adr/0008-guided-account-connections.md). Synthetic tests do not prove
live provider eligibility, login, mail delivery or installed desktop behavior.

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
Known IMAP connection and greeting timeouts normalize to `ETIMEDOUT`;
`NoConnection` and `EConnectionClosed` normalize to `CONNECTION_CLOSED`.
These failures remain transient, including disconnects during message reads.
Throwing or false logout produces a separate cleanup warning and preserves
the primary listing result or failure.

Mail batches skip deeply equal cached records and write changed records in one
SQLite transaction using the existing encryption. A failed transaction rolls
back the whole batch. Only committed fresh mail enters AI sorting, so sorting
cannot restore a failed batch. Earlier committed batches still receive AI
sorting after a later batch fails. The [renderer](../src/App.tsx) reloads state during sync,
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
accounts. The background AI-failure case waits for the service's completion
notification after AI starts and asserts one provider run. It does not issue
another sync as a wait, which could arrive late and clear the expected warning.
The [provider tests](../server/providers.test.ts) check cached work,
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

Run `npm test` and `npm run build` before packaging. The desktop startup check opens the encrypted database, loads the renderer, requires the desktop token for API access, checks native menu roles on macOS and closes the window to confirm the tray and the hidden service survive. Use a temporary user-data directory so checks cannot open a maintainer's accounts:

```sh
check_dir=$(mktemp -d)
npm run check:desktop -- --user-data-dir="$check_dir"
```

For a packaged Apple silicon build, use the logged-in macOS desktop session. Quit any running copy first, since the mail service uses a fixed port:

```sh
check_dir=$(mktemp -d)
mkdir "$check_dir/profile"
open -n -W "release/mac-arm64/Emc².app" \
  --stdout "$check_dir/stdout.log" --stderr "$check_dir/stderr.log" \
  --args --check-startup --user-data-dir="$check_dir/profile"
cat "$check_dir/stdout.log" "$check_dir/stderr.log"
```

Require a `startup: passed` JSON result and process exit, then remove only the temporary directory created for that check. An `open` exit alone is insufficient. Intel builds use `release/mac/`. The explicit profile argument prevents migration or import of saved accounts into the check. Verify the packaged app with `codesign --verify --deep --strict --verbose=2 "release/mac-arm64/Emc².app"` before startup. These checks do not drive the UI, authenticate real accounts or send mail. A direct SSH executable launch can lack Keychain access even when desktop launch works. Keychain availability is required; an access failure is a blocker, not a reason to replace encryption.

The repository has no `scripts/documentation.py`; documentation checks currently require link and diff review.

## Send outcomes

Compose retains the draft after an untyped send failure, including transport loss, an unreadable response or HTTP 400. HTTP 400 alone does not establish rejection: the API uses that status for provider exceptions too. The draft shows "Send status unknown" and possible delivery. Editing fields does not clear this status. All form submissions share a duplicate-risk confirmation; canceling it makes no send request. Native form validation blocks invalid input before submission. The in-flight send lock prevents overlapping submissions before the busy state renders.

After SMTP accepts the message, Sent-copy and connection cleanup failures become `SentCopyError` warnings. An IMAP append or logout result of `false` also produces a warning. The shared mail operation retains `{ ok: true, warning }` for both the API and MCP. A successful send clears compose before refreshing the inbox; a refresh failure adds a separate warning and preserves send success and any provider warning. These outcomes confirm provider acceptance, not recipient delivery.

Focused synthetic regressions:

```sh
node --import tsx --test src/compose-send.test.tsx server/send-provider.test.ts
```

[Renderer regressions](../src/compose-send.test.tsx) execute the compose submission function, form event handlers and rendered status text. A loopback HTTP server records a submission and drops its response, then verifies canceled and confirmed resends. Tests cover uncertainty through edits, shared pointer/keyboard form handling, validation, close prompts, overlapping submissions and refresh failure. [Provider regressions](../server/send-provider.test.ts) run the real provider and shared send operation with synthetic SMTP and IMAP adapters. They cover accepted SMTP, Sent-copy and cleanup warnings, invalid input and SMTP failure without an IMAP connection. These tests do not drive a native window, verify browser event dispatch or prove real mail delivery.

Attempt identifiers, persistent receipts, automatic recovery, automatic retries and a durable outbox are deferred. Send uncertainty exists only on the open in-memory draft. Sources: [compose](../src/App.tsx), [providers](../server/providers.ts), [shared send operation](../server/mail-actions.ts) and [interface behavior](../DESIGN.md).

The provider fixture calls [closeStore](../server/store.ts) before deleting its temporary database directory. Windows cannot remove the directory while SQLite holds its files open.

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

CI has read-only repository permissions, disables signing-certificate discovery, and passes `--publish never` to packaging. It needs no mail-provider keys or signing credentials. Installer creation proves packaging; it does not prove native launch, account sign-in, OS trust acceptance or mail delivery. Windows installers are unsigned; macOS apps use local ad-hoc signatures, while DMGs stay unsigned and not notarized. The [release workflow](../.github/workflows/release.yml) publishes all four installers and SHA-256 checksums only after every build job passes. The version tag must match `package.json`. Only its publishing job has repository write permission.

See [README](../README.md#ci) for usage and [ADR 0002](adr/0002-cross-platform-ci.md) for the decision.

## Email links

Plain-text fallback bodies stay text. Explicit HTTP and HTTPS URLs become links when the message opens. The renderer preserves query strings and balanced parentheses, and leaves surrounding prose punctuation and curly quotes outside the link. Bare domains and mailto links remain text. The bounded formatted reader described below now supports a safe subset of sender layout. Remote body images require per-message activation, as described below.

The existing mailparser dependency converts HTML-only email links to text containing their destinations. No mailbox resync or storage migration is needed for URLs already in cached bodies.

Address privacy mode masks URLs containing literal or percent-encoded email addresses and omits their anchors. Turn address privacy off to open these links. Personal-information hiding also covers known connected-recipient names and suppresses private destinations.

The desktop navigation policy allows HTTP and HTTPS destinations outside the mail service origin. On the mail service origin, only the Google OAuth entry route may open externally. Local API routes and other URL schemes stay blocked.

Verification for source revision `dbe8b870e3ec1140c1385d49118fcbf8f5b917a9`: seven renderer tests and the production build passed. Earlier navigation and server test results apply because their inputs are unchanged. T3 Code browser checks used synthetic mail and covered mouse/keyboard link activation, address privacy, escaped HTML and the exact destination of a URL surrounded by curly quotes. This does not prove native Windows browser handoff, real mailbox operations or release readiness.

Sources: [message rendering](../src/App.tsx), [navigation policy](../desktop/navigation.ts), [mail parsing](../server/providers.ts), [design](../DESIGN.md).

## Email reader and opt-in images

### Back and Forward

The [navigation hook](../src/navigation.ts) keeps visited view, account, Gmail label filter, search,
selection and reader state in memory. [App](../src/App.tsx) records tab and
account changes, search edits and intentional message opens. Selecting a row
does not add a visit. Consecutive search edits share one visit. Back and Forward
restore context and request read status when reopening unread mail. A new
visit after Back removes the forward branch. Missing messages return to the
list; missing account filters return to All. Drafts and dialogs block traversal.
Escape retains the existing close-email, close-dialog and draft-confirmation
behavior. Closing or changing the reader clears remote-image consent.

On Windows and Linux, [Electron main](../desktop/main.ts) forwards the
documented `app-command` values `browser-backward` and `browser-forward`
through the [preload bridge](../desktop/preload.ts). The renderer suppresses
DOM side-button events on those platforms so one gesture cannot traverse
twice. Elsewhere, DOM mouse button 3 means Back and button 4 means Forward;
only mouseup traverses, while mousedown and auxclick suppress defaults.

Synthetic mounted [App tests](../src/navigation.test.tsx) exercise traversal,
mail-to-mail visits, filter/search restoration, forward truncation, missing or
changed mail, consent reset, guards, source selection and listener cleanup.
The [preload test](../desktop/preload.test.ts) checks direction validation and
unsubscribe behavior. Run `npm test`, `npm run build` and the isolated
`npm run check:desktop` recipe above for desktop changes. DOM and bridge tests
do not prove physical mouse delivery, native Windows/macOS behavior or visual
layout. Installed-app proof remains separate.

The reader splits blank-line runs, including whitespace-only lines, into one
paragraph break. It preserves single line breaks, indentation, text links and
address masking. This changes display only; cached body strings are unchanged.
The body uses 15px text at 1.45 line height within a 65ch column. Sender details
and the date wrap within the header.

Show images is a native button. Before activation the reader creates no body
image elements and makes no image-metadata request. Activation shows loading,
then responsive images, a failure message or a no-supported-images message.
Hide images removes them. Message changes and reader closure clear consent;
late responses cannot reveal images in a different message.

New MIME parsing records at most 50 unique image URLs and 500 characters of alt
text per image. Only explicit HTTPS sources with public-looking DNS names, no
credentials and the default port are accepted. HTTP, local hostnames, IP
literals, relative URLs, data URLs and CID sources are excluded. The renderer
checks sources again. Images use `referrerPolicy="no-referrer"`; the server never
fetches an image URL. The formatted reader stores bounded HTML in encrypted mail JSON and constructs allowed React elements. It discards scripts, active elements, sender stylesheets, event handlers and resource-loading CSS. See the formatted-content decision below. The renderer CSP permits HTTPS in `img-src`
while retaining the existing script, connection and sandbox restrictions.

Loading remote images can expose the reader's IP address and send cookies to
the image host. URL filtering does not verify DNS resolution or redirect
chains. Consent therefore applies only to the current reader opening and is
never saved as a preference. Images can contain readable personal information, so privacy mode disables activation and removes all body images. Embedded CID images remain
unsupported; showing them would require a separate bounded attachment path.

Older cached mail lacks image metadata. The authenticated, CSRF-protected
`POST /api/messages/:id/images` retrieves only the requested message, writes
optional image metadata to its existing encrypted JSON record and leaves its
body and current mailbox state intact. Later requests reuse that metadata,
including an empty list. Gmail retrieves raw MIME by the stable Gmail ID; its
cached inbox sync refreshes unread status and label membership using lists, without downloading cached bodies. IMAP validates INBOX
UIDVALIDITY and fetches that UID without setting Seen. It also checks Message-ID
when one is cached. Older archived IMAP messages fail before connecting because
the stored UID belongs to the former INBOX. Newly parsed images remain usable
after archive. No bulk cache refill or database migration is needed.

Read and archive operations reread the cached message after the provider
responds. Image metadata saved during that wait survives the action, and a
message removed during the wait is not recreated. Deferred-provider tests
cover both completion orders between image caching and mail actions.

Automated synthetic scenarios cover paragraph normalization, existing links and
masking, MIME extraction, URL rejection, cached Gmail metadata sync, targeted
Gmail retrieval, IMAP identity failures, API authentication/origin/CSRF gates,
cache reuse, and preservation of text and concurrent archive/read state.
Mounted DOM scenarios cover blocked entry, activation, loading, image failure,
provider failure and manual retry, no images, and switching during a pending
request. Run `npm test` and `npm run build`. DOM tests do not load remote images
or prove native keyboard activation, visual layout, live providers or installed
desktop behavior. Browser testing remains prohibited by PRODUCT.md.

Sources: [reader](../src/App.tsx), [styles](../src/style.css),
[shared image policy](../shared/types.ts), [providers](../server/providers.ts),
[API](../server/index.ts), [image decision](adr/0009-opt-in-message-images.md).

## Formatted content, privacy and interaction settings

[ADR 0013](adr/0013-safe-formatted-mail-and-personal-privacy.md) supersedes the plain-text-only part of ADR 0009 for the owner's approved formatted reader. `Mail.html` is optional: undefined means old cache, null means no supported HTML. The existing encrypted JSON store retains at most 256,000 UTF-16 code units. `POST /api/messages/:id/content` recovers one old record through the same authenticated, origin/CSRF-checked provider path as image metadata. It refuses unsafe old IMAP identities, rereads current records and preserves concurrent read/archive/image state. HTML recovery never fetches sender assets or changes provider read state.

[The content parser](../shared/mail-content.ts) allows a bounded element, attribute and inline-style subset. It rejects scripts, forms, frames, SVG, sender stylesheets, fonts, event handlers, srcset, resource CSS, positioning and transforms. Node, depth and dimension limits bound work and layout. [FormattedMail](../src/FormattedMail.tsx) constructs React elements; it never injects sender HTML. Table layout, heading hierarchy, emphasis and safe HTTP(S) links remain supported. The renderer maps sender text, backgrounds and borders to app colors, and links use the app's blue. This includes legacy color attributes and validated border shorthand. Image pixels and privacy bars remain unchanged. See [ADR 0014](adr/0014-themed-formatted-mail.md). Missing or rejected content uses cached plain text. CID attachments remain unsupported.

[The reader](../src/App.tsx) loads missing formatting on open, shows cached text during loading or failure and offers one manual retry. Show images sits above the body. No body image element exists until activation; consent resets on closure, message change or privacy activation. Delayed content and image responses cannot reveal another message. Formatted images stay inline without a duplicate gallery. Privacy mode suppresses body images and private link destinations.

[Privacy matching](../src/privacy.ts) learns names from optional account display names and the current To/Cc display names tied to connected account addresses. It covers full names, first names and surnames, including one-letter Unicode components, with Unicode-aware boundaries, case/whitespace variation and URL encoding. The opened message's dictionary also protects Gmail label filter options and the label editor. A sender avatar uses a neutral dot when its displayed initial matches a known private name component; ordinary company initials stay visible. Sender-markup splits cannot expose a known name. Hidden bars have no private children, title or accessibility text. Explicit reveal applies to the clicked token; re-enabling privacy clears it. Unknown names that appear only in a body cannot be identified. A name that is also an ordinary word can hide that word while privacy is on. Editable compose fields retain their focus-to-reveal behavior.

[Interaction preferences](../src/interaction.ts) store only opening mode and validated shortcuts under `emc2.interaction.v1` in localStorage. Double-click is the default. Single-click opens and marks unread mail read once; keyboard Enter remains available. Settings capture rejects conflicts, account-number keys, editing/system keys and consumed, repeated or composing events. Unmodified Escape closes Interaction settings even from a focused shortcut input. Inbox matching excludes editable fields and dialogs. Help and tooltips reflect the saved bindings; Escape, body-only Tab, account filters and Mac Cmd+[ / Cmd+] retain fixed roles. Storage failure shows a notice and keeps the current in-memory choice.

Tests use synthetic messages and accounts. The mounted App path covers Settings changes, custom-key dispatch, double/single-click transitions, read counts, history keys, recipient names in lists/headers/formatted content/attributes, image placement and privacy. Provider/API tests cover authentication, identity and cache races. Run `npm test` and `npm run build`. Native rendering, physical input, live providers and downloaded-app acceptance need separate proof. Browser testing remains prohibited by PRODUCT.md.

## UI review, 2026-10-09

The reader follow-up caps hidden-address bars at 0.9em high and one line, with the existing container-width limit. A synthetic CSS comparison at 728px and 360px confirmed that normal and long bars fit inside their line boxes without horizontal overflow. This checks isolated layout, not the installed application.

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

## Gmail labels, density and read-on-open

Gmail sync caches its label catalog as encrypted `label` records, keyed by account and label ID, and stores `labelIds` on mail. Existing mail without that optional field remains readable and gets labels on its next inbox sync. Disconnect removes the account's label cache. The filter is account-scoped and applies to the current view of cached mail. Sync still fetches Gmail's inbox; it does not backfill the remote archive. Label creation, renaming and deletion remain in Gmail.

Edit labels on an opened Gmail message to replace its known custom labels. The server validates every requested label against that account's cached catalog and reads current provider metadata before modifying it. System labels and unknown labels are preserved. Gmail's existing `gmail.modify` permission is sufficient. Sources: [label listing](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/list) and [message modification](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/modify).

Ctrl+Plus, Ctrl+Equals and numpad Plus choose comfortable density; Ctrl+Minus and numpad Minus choose compact density. Editing fields and dialogs keep their normal key behavior. Opening unread mail uses the shared provider read operation independently of the UI busy gate. This includes reader navigation and cached archived Gmail mail. Repeated opens coalesce while a request is pending. Read failures leave the unread flag intact and reopening retries. An opened message stays visible if marking it read removes it from the Unread label filter. An explicit number-key change to a different account clears the reader and selection; selecting the same account leaves them intact. Archived IMAP messages are located by a Message-ID search in the provider archive instead of reusing their old inbox UID. Because IMAP header search matches substrings, the sole candidate must also have an exactly matching parsed Message-ID before its read flag changes. Missing, ambiguous or mismatched candidates report an error without changing remote flags or local unread state. Sync and message mutations run in order on the server so stale sync metadata cannot undo a read. Other writes still return a sync conflict instead of bypassing the existing boundary.

`server/gmail.test.ts` uses mocked Gmail API methods with a temporary encrypted store to cover catalog refresh, message label sync, account isolation, custom label edits, provider failures, sync/read ordering, idempotent reads and disconnect cleanup. `server/imap-read.test.ts` covers inbox UID validation and exact archive Message-ID verification without a connection, including substring false positives and preservation of cached unread state on failure. The store holds SQLite open until process exit, so these tests leave synthetic files in the system temporary directory for the host or CI runner to clean up. `src/mail-ui.test.tsx` covers key recognition, account-scoped filters, label rendering/privacy and duplicate/retry read requests. `src/reader-keyboard.test.tsx` executes the App keyboard and open handlers with synthetic state to cover reader navigation, account changes, coalescing, retry and input guards. These tests do not mount the interface, authenticate real accounts or drive a browser.

Snooze retains its message-specific privacy context. Rejected formatted trees and wrappers without readable text or supported images use the same readable text and consent-controlled gallery. Supported image-only mail keeps its inline image presentation. Image status styles do not override body paragraph sizing.
