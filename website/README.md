# Emc² showcase site

One screen for the Emc² desktop mail client: the headline and download button on the left, and on the right
the mail providers the app connects to, drawn around the app itself and joined by lines with a dot running
inward along each one.

```sh
npx lakebed dev
npx lakebed deploy
```

It is a Lakebed capsule with no app npm dependencies. `server/index.ts` serves public star and download
counts without sign-in, and Tailwind classes compile from `client/index.tsx`.

## Download count

The website sums GitHub's `download_count` across `.exe`, `.dmg` and `.AppImage` assets in all published
releases, including both Mac architectures and older app versions. Source archives, checksums and update
metadata are excluded. Counts describe downloads, not unique users or successful installations.

The server follows release pagination, shares concurrent reads and caches results for ten minutes. Failed
or invalid responses retain the last complete count; before any successful read, the count stays hidden.
This cache resets when the server restarts. Outbound fetch requires a claimed Lakebed deployment.

Run the focused check from the repository root with `node --test scripts/website-downloads.test.mjs`.
Build the website from this directory with `npx lakebed build --target claimed`.

## Provider marks

`shared/providers.ts` holds the marks for Gmail, iCloud Mail, Proton Mail, Zoho Mail, HEY and Mail.com, taken
from [Simple Icons](https://simpleicons.org) (CC0). The app reaches each of them with Google OAuth or its
Custom IMAP path. Regenerate or extend the file by fetching `https://cdn.simpleicons.org/<slug>` and copying
the `d` attribute and `fill` into an entry.

The line-and-dot connectors follow the tracing-beam pattern Col verifies in
[Aceternity UI](https://ui.aceternity.com/components/tracing-beam), reimplemented in Preact with SVG
`animateMotion` because a capsule cannot import npm components.

## Screenshots

`assets/inbox.jpg` and `assets/settings.jpg` are the demo-mail captures used for the showcase images shared in
chat. Nothing imports them, so they do not affect the deployed bundle.
