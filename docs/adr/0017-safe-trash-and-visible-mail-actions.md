# ADR 0017: Visible mail actions and provider Trash

Date: 2026-10-13
Status: Implementation decision for the owner-requested mail UX stack; verification and independent review pending.

## Context

The owner requested immediate read feedback and easy snooze/delete access. Existing read, archive and snooze operations are reached through opening mail, shortcuts or a context menu. Done means archive and must retain that meaning. The app has no permanent-delete or Trash-management view.

## Decision

Expose existing operations in one visible action group for the selected message or open reader. Keep provider-confirmed read state separate from pending work and inbox refresh. A read failure leaves mail unread; a refresh failure after a confirmed read does not claim the read failed.

Add Move to Trash as a distinct confirmed action. Gmail uses its message-trash API. IMAP requires native MOVE support, including active IMAP4rev2, and a unique server-declared Trash folder, with checked mailbox/message identity. Do not permit ImapFlow to fall back to COPY, a Deleted flag and EXPUNGE. Count raw server flags because the library can infer special-use names and hide duplicate candidates. Do not guess a Trash folder or create one. Existing archive Message-ID verification supports archived mail when identity is available.

Remove the cached message only after provider success. A confirmed move remains successful if IMAP cleanup fails. A lost or failed response retains local mail and asks the user to check the provider before retrying. Do not retry automatically. Keep the confirmation free of message text and personal details.

## Consequences

Users can discover common actions without a shortcut. Done still archives, Snooze remains local and Move to Trash never requests permanent deletion. Providers can apply their own Trash retention rules. Recovery takes place in the provider; a local Trash view and Undo are separate proposals.

Some IMAP servers lack native MOVE or special-use metadata. The app refuses those Trash operations rather than using an unsafe fallback. Synthetic provider and renderer checks must cover pending, failure, duplicate action, identity and account isolation. Native interaction and real-provider behavior require separate proof. This decision grants no release, credential or real-mailbox verification authority.
