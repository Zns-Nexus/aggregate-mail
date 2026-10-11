# Emc²

An installable desktop email client for Windows, with a macOS build target, based on Ryan Vogel's video. Electron with React and TypeScript, a bundled mail service, and encrypted SQLite storage. The installed app needs no browser, terminal, or separate Node installation.

## Install

Download the newest published Windows setup installer from [Releases](https://github.com/Zns-Nexus/aggregate-mail/releases). The next release is `0.1.4`, published as `Emc²-0.1.4-win-x64.exe`. It installs for the current user and creates Start menu and desktop shortcuts. Launch Emc² and connect accounts in Settings.

To build it yourself instead, run `npm run package` and open the installer it writes to `release/`. You can also run `release/win-unpacked/Emc².exe` directly; keep its surrounding files together. The installer is unsigned, so Windows may show an unknown-publisher or SmartScreen warning.

### macOS

Build on a Mac with Node 24 or newer:

```sh
npm ci
npm run package:mac
```

The command creates `release/Emc²-0.1.4-mac-<arch>.dmg` and a ZIP for the build machine's architecture (`arm64` on Apple silicon, `x64` on Intel). Open the DMG and drag Emc² to Applications, or extract the ZIP. `npm run package:mac:dir` creates only the app bundle. Add `-- --arm64` or `-- --x64` to select an architecture explicitly; runtime verification must use a matching Mac.

These packages are unsigned and not notarized. Packaging explicitly skips signing, certificate discovery, and notarization. Gatekeeper may block downloaded copies; a local startup check does not prove downloaded-app acceptance. Local packaging does not publish downloads. The version-tag release workflow publishes both macOS architectures alongside Windows and Linux.

The macOS menu provides standard Command shortcuts for editing, closing and quitting. The window controls sit to the left of the inbox tabs. Closing the window quits the app on both platforms; unsent drafts still require confirmation.

## Connect an account

Select **Connect an account** in the empty inbox or add an account from Settings.
Choose your provider. Known providers fill in the incoming and outgoing server
settings; custom IMAP keeps those fields available.

For Gmail and Google Workspace, use **Continue with Google** when Google OAuth
is configured. Otherwise, the connection dialog offers an app-password option
with a link to Google's account settings. Enter your email address and a
dedicated [Google app password](https://support.google.com/accounts/answer/185833),
not your normal Google password. This option needs no Google Cloud project.
It requires 2-Step Verification and may be unavailable because of Workspace
administrator policy, security-key-only verification or Advanced Protection.
Google recommends OAuth when it is available.

The app checks both incoming and outgoing access before saving an IMAP account.
If a check fails, correct the connection form and retry. Account credentials
stay in the encrypted local store. Gmail saves its own Sent copies; the
app-password connection does not append another copy.

Existing Gmail OAuth accounts keep their connection method and cached mail.
The app does not switch an existing account between OAuth and IMAP during
reconnection, because those methods use different message identifiers.

### Advanced Google OAuth setup

The source build does not include a shared Google OAuth client. A maintainer
or self-hosting user can configure one once, then use Google sign-in for
eligible personal Gmail and Workspace accounts.

1. Create a project in [Google Cloud](https://console.cloud.google.com/apis/credentials) and enable the Gmail API.
2. Configure the consent screen and add your Google accounts as test users.
3. Create an OAuth client of type Web application.
4. Register `http://127.0.0.1:32145/api/oauth/google/callback` as its authorized redirect URI.
5. In Emc², save the client ID and secret under Settings, Connection. A ticked `Saved` line under each field shows what is on disk, so an existing client ID never needs re-entering. Use Continue with Google for each account.

Sign-in opens in your default browser. After consent, the desktop app refreshes and syncs the account. Access includes reading mail, marking it read, archiving and sending. Google apps left in external testing may require periodic reconnection. See [Google's authorization documentation](https://developers.google.com/workspace/gmail/api/auth/web-server).

## Jev sorting

Jev classifies mail into Important and Other and rates relevance in one call per message. It is a decision model: it returns one option from a list you define rather than generated prose, which is why rows show a fixed label such as "Needs a reply".

Pick the provider under Settings, Connection, then save that provider's API key beneath it. Sender rules still take priority, and Teach still overrides any classification.

| Provider | Key from | Endpoint and model |
| --- | --- | --- |
| TypeSafe | `console.typesafe.ai` | `api.typesafe.ai/v1/systemone`, `jev-latest` |
| Vercel AI Gateway | the Vercel AI Gateway in your Vercel dashboard | `ai-gateway.vercel.sh/typesafe/v1/systemone`, `typesafe-ai/jev` |
| OpenRouter | `openrouter.ai/keys` | `openrouter.ai/api/alpha/decisions`, `typesafe/jev-1.13` |

All three serve Jev and accept the same request and answer shapes, so switching provider only changes the URL, the model name and which key you paste. TypeSafe paused new signups in September 2026; OpenRouter is the quickest route if you cannot get an account there.

For any other endpoint that speaks this protocol, set the URL and model yourself in the app-data folder's `settings.env` (see Local storage):

```
TYPESAFE_API_KEY=<that endpoint's key>
TYPESAFE_ENDPOINT=https://example.com/v1/systemone
TYPESAFE_MODEL=<model id>
```

A call sends `state` (sender, subject and up to 220 characters of preview) with typed `questions` asking for a category, a relevance level and a row label. `server/sorting.ts` holds those questions, and a non-`http(s)` endpoint is refused before anything is sent.

## Other providers

Choose iCloud, Fastmail or Yahoo and follow the dialog's app-password link.
Custom IMAP supports a separate incoming username, a TLS IMAP host/port, and
SMTP on port 465 with TLS or 587 with required STARTTLS.

iCloud requires an [app-specific password](https://support.apple.com/en-ie/102525). Enter credentials only in the connection form, never in source or chat.

### Sync recovery

Use Retry connection beside an account in Settings to sync with its encrypted saved credentials. It keeps the account ID, cached mail, taught sorting and snooze state. Duplicate clicks share queued or running work. A failed account can retry while another account is still syncing. The account shows Retry queued or Syncing and retains its previous error until its run finishes.

Retry connection cannot repair rejected credentials. For a Google sign-in rejection, use Continue with Google. For an IMAP authentication rejection, use Connect to replace the app password. Access failures point to provider permissions or administrator policy. Connection failures can be retried later; unreadable mail has a separate error. Failure details show only a fixed category, operation, allowlisted code and optional HTTP status, without raw provider errors or credentials.

A partial listing retains cached mail and batches already fetched. Only a complete inbox listing archives cached messages absent from the provider. A cleanup warning preserves the sync result. Fresh Gmail mail appears in groups of up to ten while later downloads run; cached-only changes share page writes. Unchanged messages are not rewritten. Renderer notifications share one active read and one pending refresh, including a refresh requested during a failed read. These changes add no automatic provider retry. Real account recovery and native Settings interaction still need separate verification.

## Inbox

- Important and Other combine all connected inboxes. Numbered account controls filter the view. Each sender shows its company logo, fetched once by the app from a favicon service and cached on this computer; senders on Gmail, Outlook, iCloud and similar hosts keep their initial, because their favicon would be the provider's logo rather than their own.
- Comfortable rows use 34px for low relevance, 40px for medium, and 62px on two lines for high relevance. Compact mode uses uniform 28px rows. A 300px sender panel shows context, recent mail from the sender and recently opened mail. Measurements are recorded in `DESIGN.md`.
- Search opens in the top strip with `/` or the small search icon. The normal inbox has no permanent search toolbar. Snoozed and Archive are quiet tabs beside Important and Other.
- Local sorting works without an AI service. Add a Jev or OpenAI key under Settings, Connection to classify new mail with Jev by TypeSafe AI (used when its key is set) or OpenAI. Sender, subject and up to 220 characters of preview text go to that provider, a few messages at a time so a first sync stays quick. A failed call names the provider, then falls back to local sorting for the rest of that account's sync.
- Teach applies an exact sender rule to existing and future mail. Removing a rule reapplies local sorting.
- Done archives in Gmail or moves IMAP mail to an archive folder. It does not delete mail.
- Snooze is local to this client. Messages return to their category after the chosen time.
- Compose and reply send plain text from the selected account. IMAP mail gets a Sent copy. If copying fails after delivery, the draft closes with a warning rather than encouraging a duplicate send.
- Sync runs on opening, manually, and every five minutes while open. It fetches the full inbox; large mailboxes can take time. Gmail reuses cached bodies and checks labels. Incremental mailbox sync is not included.
- Bodies render as text without executing sender scripts. Remote images stay blocked until you activate Show images for that message; loading them can tell the sender you opened it. HTTP and HTTPS URLs are clickable and open in your default browser on desktop. Address privacy mode masks URLs containing email addresses; turn it off to open those links. Attachments and rich-text composition are not included. Search covers synced mail and retained archived messages.
- Drafts remain in memory. Closing warns about unsent content; a crash does not preserve drafts.

## MCP

AI clients can read synced mail and reply through the running app at `http://127.0.0.1:32145/mcp`. The server uses MCP Streamable HTTP. It shares the app's encrypted store and provider operations; no separate database process is needed.

1. Open Settings, MCP and turn on Enable MCP. It is off by default.
2. Copy the endpoint and bearer token, or copy a client configuration directly from Settings.
3. Enable Allow sending replies only if you want clients to send real email immediately. It is separately off by default. Reading can optionally mark a message read, and archive/mark-read tools can change mailbox state even when sending is disabled.

For Claude Code:

```sh
claude mcp add --transport http emc2 http://127.0.0.1:32145/mcp --header "Authorization: Bearer <token>"
```

For JSON-config clients that support Streamable HTTP `url` and `headers` entries, including compatible Claude Desktop/Cursor configurations:

```json
{
  "mcpServers": {
    "emc2": {
      "url": "http://127.0.0.1:32145/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Replace `<token>` with the token from Settings. Client support and configuration locations vary by version. Codex and other MCP clients should use the same HTTP URL and Authorization header through their HTTP-server settings. The app must remain running.

Tools: `list_accounts`, `list_emails`, `search_emails`, `read_email`, `get_thread`, `reply_to_email`, `archive_email`, and `mark_read`. Lists return summaries with ISO dates and numeric offset pagination (25 by default, maximum 100). Search matches sender, address, subject and plain-text body in synced mail. Threads contain only cached messages from the same account; Gmail supplies thread IDs, while mail without one returns only the selected message. Older cached mail may lack Reply-To, Cc or References until fetched again. Reply-all includes the original To/Cc addresses except your own, plus optional extra Cc. IMAP replies save a Sent copy; a Sent-copy warning means delivery succeeded and you must not resend.

The listener is bound to `127.0.0.1`. A separate random bearer token is encrypted in the same SQLite store as mail and credentials, protected by Electron safeStorage on desktop. It is never stored in `settings.env`. Requests with browser origins or non-local hostnames are rejected. Disabling MCP blocks access immediately; regenerating the token invalidates the previous token on the next request. Keep copied client configurations private because they contain the token. Anyone with it can read your cached mail and change read/archive state; opt-in sending also lets them send replies. Mail text is untrusted input: an email's instructions should not authorize actions by your AI client.

MCP changes notify the open desktop UI to refresh. Replies use the same send path as the compose window. Sent messages are not added to the local inbox cache, matching the existing UI send behavior.

## Keyboard

`j` / `k`: move; Enter: open; Escape: back; `i` / `o`, or Tab when the page body is focused: Important/Other; `0` to `9`: account filters; `/`: search; `c`: compose; `r`: reply; `e`: Done; `s`: snooze; `m` (or `t`): Teach; `d`: Comfortable/Compact; `p`: blur email addresses (click one to reveal it); comma: Settings; `?`: shortcuts. Standard Tab navigation remains available on controls.

## Local storage

Mail, account credentials, rules and sync metadata are AES-256-GCM encrypted in the app-data folder's `mail` directory. The app-data folder is `%APPDATA%/Emc²` on Windows and `~/Library/Application Support/Emc²` on macOS. Renamed from Aggregate Mail in `0.1.4`. The first launch under the new name moves the `mail` directory, `settings.env` and `Local State` from the old app-data folder into the new one, leaves the old folder behind, and records `.renamed-to-emc2` so it never runs twice. Electron safeStorage protects the database key using Windows DPAPI or the macOS Keychain. The renderer is sandboxed and has no Node access. Mail/configuration endpoints require a random desktop-session token, in addition to origin and CSRF checks.

Developer OAuth settings and any optional Jev or OpenAI key are stored in the app-data folder's `settings.env`. Protect your operating-system account and app-data folder; these settings are not encrypted. Never commit them or attach them to issues. Ignore rules and packaging exclusions cover local environment files, private keys and mail databases. `.env.example` contains placeholders only. Review source changes, commit metadata, logs, screenshots and packaged contents before sharing; exclusions cannot detect every secret embedded in source.

The first development launch copies the earlier `.data` database using SQLite's backup API and preserves the original files. Packaged and development desktop builds share the app-data folder. `.data` and `.env` remain available to the earlier browser development target.

This is a single-user desktop client. Its mail service runs while its window is open and stops when you quit. This version has no tray service, automatic updater or public-hosting configuration.

## Development

Node 24 or newer is needed only for development:

```powershell
npm install
npm run dev
```

`npm run dev` launches the desktop app with React Fast Refresh and live CSS updates. Close the app to stop its development server. Restart this command after changing desktop or backend code. UI changes that require a full reload can reset an unsent draft. OAuth keeps the callback address above in development. `npm start` opens the last production build, created with `npm run build`. `npm run package` creates the Windows installer. `npm run check:desktop` checks production startup, database access and API isolation without driving the UI; `npm run dev -- --check-startup` also checks the hot reload client and development API proxy. `npm run dev:web` retains the earlier browser development target; it is not needed to use the app.

## CI

GitHub Actions runs tests, TypeScript checks, production builds and installer packaging on every pull request and push to `main`. Windows and macOS also run an isolated production-startup check before packaging. Linux runtime behavior is not checked by this workflow. You can also run `CI` manually from the Actions tab.

Download the run's `installer-windows-x64` artifact for the Windows setup `.exe`, `installer-macos-arm64` or `installer-macos-x64` for a macOS `.dmg`, or `installer-linux-x64` for a Linux `.AppImage`. Artifacts expire after one day. These unsigned packages are build candidates; packaging does not verify native startup or account operations. macOS candidates are not notarized.

Each CI run uses a distinct version such as `0.1.3-ci.123456.1`, where the last two numbers identify the workflow run and attempt. Reruns increment the attempt. This version appears in the application metadata and installer filename. Tagged releases retain the matching `package.json` version. Bump and commit that release version before creating each new release tag.

This public repository uses free standard GitHub-hosted runners. Excess artifact storage above the owner's shared allowance costs $0.25 USD per GB-month under [GitHub's billing policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions). One-day retention, npm caching, job timeouts and cancellation of superseded runs keep usage low. See [the CI contract](docs/KB.md#ci).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, verification and pull requests.
AI contributors must also read the project instructions in [AGENTS.md](AGENTS.md).

## Releasing

GitHub hosts CI and release downloads. Pushing a `v*` tag runs `.github/workflows/release.yml`, which calls the CI build jobs and attaches the Windows setup installer, both macOS DMGs, the Linux AppImage and `SHA256SUMS.txt` to the GitHub release after all jobs pass. The tag must match `package.json`. Manual workflow runs create build artifacts; only version-tag runs publish releases.

To cut a Windows build locally:

```powershell
node scripts/release.mjs --patch
```

That bumps the version, packages, prints the installer's SHA-256, and uploads it to the GitHub release when a GitHub remote exists. Delete the superseded installers in `release/` — `release/` is ignored by git, so nothing there reaches either host.

The installer is unsigned, so Windows SmartScreen warns on first run. There is no auto-updater; installing a newer version over an older one keeps your mail and settings.

## Verification

The macOS Apple silicon candidate builds as a DMG and ZIP. Its packaged startup check passed through the desktop launch path, including encrypted database access, renderer loading, native menu roles and API isolation. A maintainer confirmed the inbox window was visible. Intel runtime, live account operations and downloaded-app Gatekeeper acceptance remain unverified.

Strict TypeScript and production builds pass. Tests cover sender-rule precedence, visual classification, header validation, message-link rendering and privacy, desktop navigation restrictions, configuration preservation, and MCP authentication, mail reads and mocked reply operations. `node scripts/check-mcp.mjs` checks an MCP initialize/tools-list handshake against a separate temporary server and verifies requests without a token get 401. Development and packaged native startup checks passed, including encrypted database access and rejection of requests outside the desktop session. The email-link repair was tested in the T3 Code browser with synthetic mail: mouse and keyboard activation, quoted URLs, address privacy and escaped HTML. Native Windows and macOS browser handoff were not tested for this repair. Real account sign-in, mailbox operations and delivery remain unverified until provider credentials are supplied.

Video frames at 25s, 65s, 104s, 140s and 178s were inspected and measured at native resolution. The transcript is `.reference/transcript.txt`. The video's future Cloudflare mailbox idea is outside this version.
