# Draft: Spawn Rollback Personal Files

- **Origin:** [internal] — minted at the 2026-11-16 housekeep drain from a `USER-INBOX` capture made during
  `projection-worktrees`' criteria verification pass 2 (2026-11-13), an Owner-accepted residual there.
- **Purpose:** Make the cleanup after a failed work-unit spawn keep the personal files a `post_create` script wrote, as
  the projection's own rollback does, instead of deleting them with the checkout.
- **State:** provisional stub. Concern recorded with a candidate model; the work-unit-checkout question is open.

---

## Problem / Motivation

- _Observation:_ Three cleanups after a failed work-unit spawn — `rollbackFreshSpawn`
  (`lib/work-unit/mutators/reconcile-work-unit-worktree.ts`), `rejectCreateNewScaffold` (`commands/start.ts`), and the
  occupation rollback in `lib/work-unit/atomic-graduation.ts` (reached from `commands/start-store.ts`) — all call
  `removeDisposableSpawn` (`lib/work-unit/spawned-worktree-claim.ts`). It erases the marker generation and runs a plain
  `git worktree remove`, which deletes ignored personal files under `.arc/user/<id>/` that a `post_create` script wrote;
  no residual check runs. Before `projection-worktrees`, a script-written file is simply lost when the spawn fails.
  Since it, the spawn's materialization first reports that file as withheld, then a later scaffold or graduation
  failure deletes the checkout anyway.

- _Observation:_ A naive fix fails: the bound removal check answers `unobservable` for a work-unit checkout with no
  index (`lib/store/projection/ownership.ts` gives a work-unit marker a projection), which would block every cleanup.
  Open question: once the flip gives work-unit checkouts an index, does that obstacle go away?

- _Approach:_ Model on A6 in `spec-projection-worktrees.md`: `rollbackSpawn`'s required `checkRollback` dependency and
  `observeUnprojectedPersonalFiles`, retaining marker, checkout and branch on refusal. Needs design — three cleanup
  paths moved onto a check, plus an answer for a work-unit checkout with no index — so a Work Unit, not an Errand. Not
  needed before the flip (project manager, 2026-11-13): the bytes are regenerable script output from seconds earlier,
  and no current `post_create` script here or in CineXplorer writes under `.arc/user/`.

- _Evidence:_ the 4c2 leaf, 4c seam and aggregate reports, kept outside the repository, and the finding's disposition
  from `projection-worktrees` criteria verification pass 2 at `812fec5432` (F5), recorded there as an Owner-accepted
  residual.

- _Captured during:_ `projection-worktrees` Task 3.1, criteria verification pass 2 (Owner-approved deferral,
  2026-11-13).
