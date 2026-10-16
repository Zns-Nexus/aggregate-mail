# ADR 0040: Customizable in-app notifications

Date: 2026-10-16
Status: Implementation decision for the maintainer-requested notification controls.

## Decision

Reuse the existing floating notification stack for confirmed Snooze, Return to
inbox, Archive and Trash outcomes. Snooze includes its chosen local return date
and time. Publish success only after the action completes. A later inbox-refresh
failure keeps that confirmed outcome and adds a separate warning to refresh the
inbox, rather than implying that the action must be repeated.

Add Settings, Notifications with independent switches for in-app new-mail counts
and action confirmations. Offer Bottom right, Bottom center and Top right, and
3, 6 or 10 seconds or Until dismissed. Defaults retain Bottom right and six
seconds with both switches enabled. Provide a generic preview and reset.

Store only validated display choices in versioned localStorage. These choices
contain no mailbox data. A failed write keeps the current in-memory selection
and reports that it could not be saved. Invalid stored values fall back to
defaults.

Errors, uncertain sends and Sent-copy warnings stay visible until dismissed
regardless of the switches or duration. Keep privacy masking, queued outcomes,
hover/focus pause, dismissal and keyboard focus behavior. The new-mail switch
applies to in-app arrivals; native operating-system notifications retain their
existing behavior.

## Verification

Require mounted synthetic action, Settings and notification tests for confirmed,
pending and failed operations, refresh failure, persistence and invalid values,
switches, positions, durations, preview, reset and error persistence. Run the
application test suite and strict build, then review the exact diff independently.
PRODUCT.md prohibits live browser application testing. Native appearance,
physical input and live-provider delivery remain separate acceptance work.
