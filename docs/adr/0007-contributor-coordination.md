# 0007: Coordinate contributions through task records

Date: 2026-10-10
Status: proposed; takes effect when the contribution-policy PR is merged.

## Decision

Contributors search upstream issues and pull requests before claiming work, use
one issue or pull request as the shared task record, and confirm ownership
before starting, resuming or pushing. Independent tasks use separate feature branches
and worktrees.

## Reason

The project accepts contributions from people and AI agents. A shared record
and explicit ownership make duplicate work and conflicting edits easier to
detect before they reach the same branch.

## Consequences

Contributors must stop when upstream work cannot be inspected or ownership
conflicts. A maintainer resolves conflicting claims. This process reduces
coordination errors but cannot guarantee that work will not overlap. Existing
privacy, verification, review and release boundaries remain in force.
The detailed steps live in [CONTRIBUTING.md](../../CONTRIBUTING.md#coordinate-shared-work).
This extends the coordination around [ADR 0005](0005-task-worktrees.md) without
changing its worktree decision.
