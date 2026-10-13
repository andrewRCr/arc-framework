# Draft: Errand Launchpads

- **Origin:** [internal] — design discussion on 2026-10-09 while planning two concurrent Errand sessions from one
  repository.
- **Purpose:** Let several sessions drain a set of Errands side by side, each from its own managed checkout that
  behaves like a free primary, without two sessions taking the same Errand and without per-Errand provisioning.

---

## Problem / Motivation

A long Errand queue drains faster with two or more sessions working it at once, but ARC has one launchpad: the
physical primary. `arc errand open` refuses from a checkout that already holds an active Errand, so a second session
cannot launch from an occupied primary. `arc errand open --isolate` (PR #846) keeps the primary free by giving every
Errand its own provisioned worktree. That unblocks concurrent sessions but leaves three gaps:

- **Per-Errand provisioning.** Every Errand pays worktree creation and its post-create install.
- **Claude Code recovery.** Claude Code's compaction hooks seed the directory the session launched in, so a session
  launched in the primary and working in a spawned Errand worktree recovers against the free primary and stops.
  `recovery-hardening` owns the general fix; a launchpad avoids the mismatch for its own layout, because the launch
  directory is the working checkout.
- **Contention.** Nothing stops two sessions from taking the same Errand. `arc errand next` returns the first
  execute-bound capture in file order without skipping one an open Errand already holds, and the Errand identity is
  keyed by slug, so two slugs can adopt the same capture. Today a hand-kept allowlist splits the queue between sessions.

## Direction

### A managed launchpad lifecycle

A launchpad is a registered worktree that ARC treats like a free primary: a session launches there and runs its Errands
in place, one at a time, returning to base between them. It exists for a drain, not indefinitely — opened when a
session wants one and closed when the drain is done and it holds no live Errand. Keeping one warm between drains may be
a user preference; closing is the default. This keeps ARC's rule that it defines no permanent administrative worktree.

- **Reuse:** creation and teardown can reuse the linked-worktree spawn, provisioning, and teardown code.
- **New role:** the free-primary role is special-cased in checkout-role derivation, `open`'s warm-parent check, the
  `primary | spawned` allocation kinds, and `close` / `leave` restoration. Today a launchpad derives as an unmanaged
  checkout and `open` refuses there, so it needs its own checkout-locus role.
- **Open decisions:** the open and close verbs and where the session's launchpad is recorded; how a launchpad stays at
  base and refreshes itself and its dev build when base moves; how `arc status` and the recovery roster show it; whether
  `--isolate` from a launchpad still spawns.

### Claiming a batch without a queue claim

The storage contract settles that starting is the only claim (`spec-storage-contract.md` D11; Principle 12 in
`strategy-storage-evolution.md`): a queue that reserves entries before they start hides work when it goes unrun, the
failure that retired ADR-021's queue file. A launchpad session claims a batch through what the contract allows:

- **Partition, then start late** (proposed default): each queued Errand carries a kind label set at drain, and a
  session's next offer takes the first start-able entry of its kind. Sessions draw from separate slices, and the
  contract's one-live-Errand-per-entry rule settles a race inside one slice — the later start yields.
- **Batch start**: start the set up front, claiming each entry visibly as live work, then run the started Errands in
  place. It needs starting an Errand separated from occupying a checkout, which `open` combines today, and it leaves
  started Errands stalled until their owner abandons them if the session dies.

Both build on the contract's work items and one-live-Errand rule rather than on a claim record the cutover would retire.
Settle which the launchpad supports, and whether batch start earns its cost, in planning.

## Coordination

- **`storage-seam`:** its "Locus and session-init" partition rewrites locus derivation from the checkout marker plus
  the store — the code this role extends. Plan this with that partition's member once `storage-seam` decomposes.
- **`shared-inbox-model`:** owns the queue semantics this consumes — the kind label and next-of-my-kind offer (its
  buffer item "Let a session ask for the next queued Errand of its kind"), skipping in-flight entries, and taking over
  a stalled Errand. Launchpads supply the checkouts, not the queue discipline.
- **`storage-cutover`:** brings the work items and one-live-Errand-per-entry rule both claim routes rely on; until it
  lands, contention between sessions stays the allowlist workaround.
- **`recovery-hardening`:** "Bind compaction recovery to the live directed-worktree locus" fixes recovery for spawned
  Errands generally; launchpads only avoid the mismatch for their own layout. Neither replaces the other.
