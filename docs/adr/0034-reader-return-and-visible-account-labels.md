# ADR 0034: Reader return and visible account labels

Date: 2026-10-15
Status: Accepted for the local correction by explicit user direction.
Supersedes ADR 0033 only for immediate reader Back/Forward and custom-label visibility in privacy mode.

## Decision

Back from a reader returns to its list even when menu history is empty. Immediate
Forward restores that latest reader. Mail-to-mail traversal changes no menu
history; further Back traverses menus. A new reader action clears the transient
return. Validate the message and owning account before reopening. Preserve draft
and dialog guards, focus ownership, Unread anchoring and fresh image consent.

Show custom account labels in the sidebar and Settings while privacy is enabled.
Use the existing address redaction for email addresses within labels. Unnamed
accounts retain numbered provider labels. Other private mail text and addresses
keep existing redaction; editing a name retains explicit focus-to-reveal.

Bound mounted list rows to the viewport plus overscan and retain selected and
focused rows outside it. Keep the full filtered data for ordering, counts and
reader navigation. Returning from a reader restores its row; passive scrolling
does not change focus or selection. Share measured density and relevance sizes
with CSS and account for date headers and wrapped touch controls.

## Verification

Require mounted full-App reader/list return, mouse and density shortcut coverage,
custom-label/address privacy, complete tail reachability, bounded mounts, sort
and filter changes, and focus preservation. Run full tests and the strict build,
then packaged isolated startup before the authorized local Mac installation.
Synthetic layout does not prove physical mouse input or native latency.

Encryption remains research only, documented in the
[research report](../encryption-research.md). This decision changes no database,
key, provider, signing or publication policy.
