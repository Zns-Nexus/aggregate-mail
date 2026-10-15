# ADR 0027: Encrypted local drafts with revision-checked recovery

Date: 2026-10-15
Status: Implementation decision for the authorized backend slice; verification and independent review are recorded in its PR.

## Problem

Compose and reply content currently exists only in renderer memory. The owner
requested encrypted local draft recovery after close or crash. Delayed saves
must not replace newer acknowledged content or restore explicitly deleted
drafts. An unknown send outcome must survive edits and restart.

## Decision

Reuse the encrypted SQLite record store and its current key. Add a `draft`
record kind without changing existing account/mail records or protected keys.
Use WAL with explicit FULL synchronization. Return success only after the
synchronous write transaction commits. Recovery reads local records and never
sends, syncs or contacts a provider.

Use account-scoped routes with strict, bounded snapshot validation. Allow
incomplete fields independently of the send schema. Limit live drafts to 100
per account, refuse overflow without eviction and list summaries without bodies.
The exact routes, limits and caller sequence are in
[the repository knowledge](../KB.md#encrypted-local-draft-api).

POST creates a server-generated UUID at revision 1. PUT and DELETE require the
current positive integer revision and an existing record in that account.
Perform account lookup, revision check and mutation under one SQLite writer
transaction. Successful PUT increments the revision. Stale requests return a
conflict. DELETE removes the record; PUT cannot recreate it. Creation never
accepts a caller-supplied ID. This lifecycle needs no tombstones or retention
timer. A later compose receives a new ID. Explicit account removal atomically
removes its drafts and account/cache records, so it cannot leave recoverable
orphan drafts after a process crash.

Once `sendUnknown` is true, omission preserves it and attempts to set false
fail. Deletion requires both the current revision and `confirmUnknown: true`.
There is no send-status resolution endpoint. This deliberately retains a
conservative warning after a send that may not have started. Account removal
is an explicit purge of its drafts, including uncertain drafts.

Draft writes can run during sync because they do not change provider/cache
state. Keep the existing updater admission guard ahead of those routes. Their
synchronous transactions leave no asynchronous draft work to drain. Existing
send endpoints, renderer, desktop, provider transports and MCP remain unchanged.

## Caller integration and limits

The future renderer must serialize saves and reconcile lost acknowledgements.
It must not overwrite recovered content with an old local snapshot after a
conflict. Cancel queued autosaves before deletion. Keep unsaved text and close
warnings until its latest snapshot is acknowledged. No debounce policy can
guarantee recovery of text that never reached a committed save.

Before sending, freeze editing, drain saves, persist `sendUnknown: true` on
the exact snapshot and await acknowledgement. Then invoke `/api/send` once.
After an acknowledged provider acceptance, delete that exact revision with
explicit uncertainty confirmation. A Sent-copy warning still means provider
acceptance, never recipient delivery. A lost response or crash preserves the
marker; recovery never retries. Resend requires duplicate-risk confirmation.
No backend receipt engine or outbox is introduced.

This backend cannot enforce that sequence for existing send callers. Implementing
UI autosave, native close behavior and coordinated send cleanup requires separate
work in excluded caller files. Do not claim the app already saves replies on close.

Synthetic HTTP tests and fresh-process fixtures cover encryption, conflicts,
account behavior, uncertainty and sync/update guards. A hard-killed process
checks committed WAL recovery without graceful store shutdown. These checks
do not establish recipient delivery, live-provider behavior, native integration,
power-loss durability or recovery from disk/key loss. Full-suite and isolated
desktop checks belong to the Controller.
