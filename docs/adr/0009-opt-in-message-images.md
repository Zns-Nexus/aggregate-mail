# ADR 0009: Show remote email images only after per-message activation

Date: 2026-10-11
Status: proposed implementation for the owner-authorized reader change; pending Controller review.

## Context

The owner asked for readable email text and a Show images control. The reader
previously displayed only plain text, and MIME parsing discarded image sources.
Existing cached Gmail messages receive metadata-only refreshes, so changing
initial parsing alone would leave those messages without images. IMAP UIDs
identify mail within one mailbox and UIDVALIDITY; archive moves invalidate
using the old INBOX UID as an archive identifier.

## Decision

Keep the text renderer and store the original body. Display bounded paragraphs
and extract only image URL and alt metadata with the existing HTML parser,
declared as a direct dependency. Show supported HTTPS images separately after
a native button activation. Validate sources in both parser and renderer,
apply no-referrer and clear consent on reader closure or message change.
Never render sender HTML or fetch image URLs on the server.

Add optional image metadata to the encrypted JSON mail record. New MIME parses
populate it. For old records, retrieve just the requested source on activation
through the existing authenticated, origin-checked and CSRF-protected API.
Use the stable Gmail ID. For unarchived IMAP mail, require matching INBOX
UIDVALIDITY and check cached Message-ID when present. Refuse older archived
IMAP retrieval before connecting; never reinterpret its old UID in another
folder. Preserve body strings and concurrent local mail actions when caching.

## Consequences

Cached mail needs no migration or inbox-wide raw refetch. HTTPS images can
still track opens, receive cookies, expose text inside pixels and redirect;
the control states the tracking risk. Public-looking DNS names do not prove
public DNS resolution. HTTP, CID, data, relative and IP-literal image sources
remain unsupported. CID support needs a separate bounded attachment design.
Visual layout, real provider retrieval and installed desktop behavior need
separate proof. Automated checks use synthetic mail and mounted DOM tests.

See [reader behavior](../../DESIGN.md) and [repository knowledge](../KB.md).
