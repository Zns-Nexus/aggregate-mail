# ADR 0035: Compose autosave and recovery

Date: 2026-10-15
Status: Implementation decision; verification and independent review are recorded in its PR.

## Problem

The encrypted draft API in [ADR 0027](0027-encrypted-local-drafts.md) needs
renderer callers. A saved reply must be recoverable after close or crash,
without stale writes or automatic duplicate sends.

## Decision

Use one in-memory draft session per open compose dialog. Start saving on each
edit, serialize requests and coalesce edits while a request is pending. Show
saved only after the current snapshot is acknowledged. Keep no plaintext
draft in browser storage. Preserve incomplete recipients and reply metadata.

After an unacknowledged PUT, GET the same ID. Continue only if its revision
and snapshot match either the acknowledged version or the attempted update.
Never attach a newer revision to stale local text. After an unacknowledged
POST, stop and retain the text. Retry never creates again. An explicitly
confirmed separate copy can create a new draft while preserving the possible
original. Changing accounts follows the same copy rule after a saved draft.

Close, Escape and Keep draft wait for saves and retain the record. Discard
requires confirmation, stops queued saves and deletes only the known revision.
The Drafts button lists summaries; selecting one loads its body. Private
summary text is absent from the picker DOM in privacy mode. Recovery never
sends. Unsaved changes and uncertain sends protect unload. The native close
prompt explains saved retention and the risk to unacknowledged changes.

Before sending, freeze fields, drain saves and persist `sendUnknown: true`
on the exact snapshot. Send once only after acknowledgement. Only explicit
`ok: true` counts as provider acceptance. Delete the known revision afterward.
Cleanup and refresh errors remain warnings after acceptance. Dropped send
responses retain the draft and durable uncertainty. Editing cannot clear it;
resending requires duplicate-risk confirmation. No outbox or automatic resend
is added. MCP and provider transports keep their existing contracts.

The renderer updater drain waits for draft actions and the current save as
well as sending. Existing updater checks and native cancellation remain intact.

## Verification and limits

Focused session and mounted DOM tests cover encrypted HTTP persistence,
pending-save unload protection, remount recovery, lost acknowledgements,
copies, conflicts, account switching, private summaries, exact send preparation,
unknown outcomes and confirmed cleanup. Service subprocess tests separately
cover committed SQLite recovery after a hard kill. The repository knowledge
lists [verification commands](../KB.md#encrypted-local-draft-api).

Text that never reaches an acknowledged commit can still be lost in a crash.
Disk/key loss and power-loss durability are not established by these tests.
Mounted DOM tests do not prove native close prompts, installed-app recovery,
provider delivery or update installation. Those require separate acceptance.
