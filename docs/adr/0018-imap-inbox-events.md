# ADR 0018: Refresh IMAP inboxes from server events

Date: 2026-10-13
Status: Implementation decision for the requested live-mail layer; source verification and review are recorded in its PR.
Extends: [ADR 0016](0016-background-running-and-notifications.md). Its tray, notification and quit behavior remains unchanged.

## Context

The five-minute sync can delay visible arrivals and remote read changes. The owner requested real-time mail updates and notifications across multiple IMAP accounts.

## Decision

Open one read-only INBOX watcher per IMAP account using the existing ImapFlow connection safeguards. Keep watcher connections separate from fetch connections. Coalesce inbox exists, flags and expunge events into the existing account scheduler, with at most two concurrent syncs and serialized mail mutations. Sync once after a watcher opens or reconnects to catch missed changes.

Retain periodic sync for recovery and for Gmail API accounts. Bound automatic reconnect attempts to five per recovery window. Manual or periodic sync may reopen an exhausted window. Stop old watchers when account identity or credentials change, when an account is removed, and when the server closes. Ignore stale account results after replacement.

Use the existing new-mail callback and native notification path. A failed or partial first import must not enable arrival notifications. A successful complete import records the boundary; later successful runs may notify for new unread mail. Preserve compatibility for older caches without the stored boundary.

## Consequences

Each connected IMAP account uses one additional read-only connection. Event support and timing depend on the server; the application does not promise immediate delivery on every provider. The watcher observes INBOX only. Gmail API push services, archived-folder watching and notification preferences are outside this layer.

Synthetic tests exercise the production service entry with injected provider IO. Live-provider behavior and native notification delivery require separate proof. This decision grants no account, credential, merge or release authority.
