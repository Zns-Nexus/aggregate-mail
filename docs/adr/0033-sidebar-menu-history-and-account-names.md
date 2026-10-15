# ADR 0033: Sidebar, menu history and local account names

Date: 2026-10-15
Status: Accepted by the maintainer for the local UI candidate.
Supersedes ADR 0032 only for account-control placement and reader navigation entering history.

## Context

The maintainer supplied a sidebar reference and clarified that Back/Forward
navigates menus, while up/down navigates emails. The earlier reader controls
were oversized and opening emails also entered Back/Forward history. Users
also need account labels they can choose themselves.

## Decision

Put compose, search, Settings, mail views and account filters in a collapsible
sidebar. Preserve Snoozed, existing mail-action semantics, fixed filtering,
native window controls and the sender context panel. Use synthetic mail when
checking the interface; the supplied reference is layout evidence only.

Keep menu history in memory. Record view, Settings, account and explicit
filter/search changes. Opening, closing, selecting or traversing emails does
not create a menu visit or clear Forward. Back/Forward returns to a menu or
mail list rather than reopening a historical email. Email navigation follows
the complete filtered sort order independently, through compact up/down
controls beside the reader's existing actions. Preserve keyboard focus,
Unread anchoring and per-opening image consent.

Store an optional account `name` in the existing encrypted account record.
The authenticated account PATCH route changes only that name. Trim it, limit
it to 80 characters and clear it for an empty value. Preserve the account's
identity and credentials, including when reconnect or sync completes later.
Settings offers Rename with Save and Cancel. Use the name or fall back to the
email address; privacy mode uses a numbered provider label instead.

## Consequences and verification

No schema migration, dependency, provider operation or encryption change is
needed for a local label. Old account records remain readable. Names are
local labels, not changes to provider identity or outgoing sender names.

Require mounted menu-history and reader-focus regressions, account-label and
privacy coverage, and synthetic API checks for validation, persistence and
reconnect/sync continuity. Run the full suite and strict build. Package and
start an isolated candidate on macOS arm64 before showing the local preview.
Keep native appearance, real providers and downloaded-app trust separate.
This decision authorizes no PR, merge, installed-app replacement or release.
