# 0002: Use a new worktree for each task

Status: accepted by the owner on 2026-10-09.

## Decision

Create a new Git worktree and feature branch for every new Aggregate Mail task. Switch the T3 Code thread binding to that checkout before task work. Continue the same task in its existing worktree after an interruption.

## Reason

The owner requires task work to stay off `main`. The T3 Code binding and terminal directory must identify the same checkout so tools and agents do not act on different files.

## Consequences

Preserve the main checkout and other worktrees. Deliver owned changes through the normal review and PR gates. A worktree switch grants no additional task, release or deployment authority.
