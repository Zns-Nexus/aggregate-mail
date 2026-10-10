# Aggregate Mail

<!-- impeccable:product-schema 1 -->

## Platform

Windows desktop

## Stack

Electron with React and TypeScript. Bundled mail service and local SQLite persistence. The user explicitly corrected the initial browser implementation and requested a desktop app matching the video frames.

## Product Purpose

Build the email aggregation client demonstrated in Ryan Vogel's supplied video. The user requested real inbox connections with OAuth setup.

## Capabilities and Constraints

One inbox across accounts. Important and Other categories. Variable row heights reflect relevance. Keyboard navigation and account filtering. Teachable sorting. Gmail OAuth and IMAP providers. Installable Windows application with its own runtime and local app-data storage. Optional local MCP access lets AI clients read cached mail and reply through the running app. MCP is off by default, uses an encrypted persistent bearer token, and requires a separate opt-in for sending replies. Settings sections: Accounts, Sorting, Connection, MCP, About.

## Evidence on Hand

qsgWf9eTSH3hwijq.mp4. Full machine transcript in .reference/transcript.txt. Gmail, iCloud, Fastmail, Yahoo, and custom IMAP are described in the video. Cloudflare mailbox creation is a future idea, outside this implementation.

## Brand Commitments

Follow the video's compact black interface. White text. No decorative cards, pills, or slogans. No live browser testing, per user instruction.
