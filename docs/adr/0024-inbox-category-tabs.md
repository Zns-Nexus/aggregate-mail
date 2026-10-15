# ADR 0024: Inbox category tabs replace Important and Other

Date: 2026-10-14
Status: Accepted by the owner, who asked for Gmail-style inbox categories
instead of the Important and Other split.

## Context

The interface split mail into Important and Other views from the sorter's
`category`. The local sorter put verification codes and security notices in
Other (at high relevance), and anything unmatched in Important. In practice,
codes and support threads landed in Other while routine mail filled Important.
The owner asked for one inbox, or inbox categories such as Primary, Social,
Promotions, Newsletters, Transactions and Updates.

Gmail already returns its own category labels (`CATEGORY_PERSONAL`, `_SOCIAL`,
`_PROMOTIONS`, `_FORUMS`, `_UPDATES`) on each message, and the app stores them
in `labelIds`. IMAP mail has no such labels.

## Decision

Replace the Important and Other views with one Inbox, plus Snoozed and Archive.
Inbox has six category tabs: Primary, Social, Promotions, Newsletters,
Transactions and Updates. A message's tab is derived on the client by
[`inboxTab`](../../shared/inbox-tabs.ts); nothing new is stored. Order of trust:

1. A Teach rule that marks the sender important pins it to Primary.
2. Codes, sign-in and security notices, support tickets and replies go to Primary.
3. Gmail's own category label.
4. The AI sorter's reason (Receipt, Promotion, Newsletter, Notification and so on).
5. Sender and subject patterns; anything unsure stays in Primary.

Search spans all tabs. The selected tab is part of the in-memory navigation
history. The server keeps its `important`/`other` category and relevance: MCP,
row height and Teach still use them. Teach's choice now reads "Primary" or
"Sort by type". The local sorter marks security and code mail as important.
Keyboard actions keep their stored ids: `i` opens Inbox and `o` (or Tab in the
list) moves to the next category.

## Consequences

- Gmail mail follows Gmail's categories; IMAP mail relies on patterns and the
  AI reason, so some IMAP mail will land in the wrong tab until taught.
- Teaching a sender as Primary is the correction path; there is no per-tab rule yet.
- This supersedes the Important/Other view semantics named in AGENTS.md and
  PRODUCT.md. Snoozed, Archive, Done and Teach keep their meaning.
