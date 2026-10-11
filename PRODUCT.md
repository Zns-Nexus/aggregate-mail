# Emc²

<!-- impeccable:product-schema 1 -->

## Platform

Windows desktop and a macOS build target

## Stack

Electron with React and TypeScript. Bundled mail service and local SQLite persistence. The user explicitly corrected the initial browser implementation and requested a desktop app matching the video frames.

## Product Purpose

Build the email aggregation client demonstrated in Ryan Vogel's supplied video. The user requested real inbox connections with OAuth setup.

## Capabilities and Constraints

One inbox across accounts. Important and Other categories. Variable row heights reflect relevance. Keyboard navigation and account filtering. Teachable sorting. Gmail OAuth and IMAP providers. Installable Windows application with its own runtime and local app-data storage. Optional local MCP access lets AI clients read cached mail and reply through the running app. MCP is off by default, uses an encrypted persistent bearer token, and requires a separate opt-in for sending replies. Settings sections: Accounts, Sorting, Connection, MCP, About.

The macOS target packages the same application as unsigned DMG and ZIP files. It uses native menus, Command editing shortcuts and Keychain-backed database-key protection. This is a maintainer-led open-source project. Public contributions must exclude personal information, local machine details, credentials and private runtime data. See [the desktop packaging decision](docs/adr/0001-unsigned-macos-packaging.md).

## Evidence on Hand

qsgWf9eTSH3hwijq.mp4. Full machine transcript in .reference/transcript.txt. Gmail, iCloud, Fastmail, Yahoo, and custom IMAP are described in the video. Cloudflare mailbox creation is a future idea, outside this implementation.

## Brand Commitments

Use a roomier macOS-style dark interface with white primary text, rounded working panes and controls, and short, smooth state transitions. Keep compact inbox density available, and preserve keyboard navigation and reduced-motion support. No decorative cards, pills, or slogans. No live browser testing, per user instruction.
