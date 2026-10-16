# ADR 0032: Mail controls above the inbox and on each row

Date: 2026-10-14
Status: Owner-requested implementation; verification and review belong to task #45.
Supersedes: The selected-inbox action placement in [ADR 0017](0017-safe-trash-and-visible-mail-actions.md). The update banner becomes an icon and panel; the installation safeguards in [ADR 0019](0019-app-update-prompt.md) remain in force.

## Decision

Show existing mail actions on the hovered or keyboard-focused row. Keep them outside the row button so each action targets its own message without triggering selection or opening. Touch devices show the controls below each row. Opened mail retains the same actions inside the reader. Done remains archive, Snooze remains local, and Trash keeps its confirmation and provider checks.

Keep history, filtering and sorting above the scrolling mail content. Reader Previous email and Next email reuse the existing filtered order, Unread anchor and `openMail` path. Connected accounts use the existing public email field; privacy mode keeps numbered provider labels.

Replace the persistent update banner with a top-bar icon and dismissible details panel. Opening details issues no update command. Preserve command admission, installation blocking, progress, unsupported states, native draft guards and all existing updater checks.

## Proof and boundaries

Use synthetic mounted renderer tests for message identity, pending and failed actions, privacy, history, reader edges and update commands. Layout and physical input on an installed desktop remain separate proof. Live browser tests, saved accounts and real-provider operations are outside this task.

The maintainer authorized this separate branch while the reader-performance owner retains its own checkout. The maintainer later prohibited UI PR delivery because another team member owns it. Keep this candidate local and uncommitted for that owner; do not publish installers or modify release workflows.
