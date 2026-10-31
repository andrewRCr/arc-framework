# Draft: Errand Launchpads

- **Origin:** [internal] — design discussion on 2026-10-09 while planning two concurrent Errand sessions from one
  repository.
- **Purpose:** Let several sessions drain a set of Errands side by side, each from its own managed checkout that
  behaves like a free primary, without two sessions taking the same Errand and without per-Errand provisioning.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Close a spawned Errand without a foreign-generation prompt or a deleted working directory**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ § Direction, "A managed launchpad lifecycle" — `close` / `leave` restoration and where a session runs them.

- _Observation:_ Closing a merged `--isolate` Errand has no clean place to run from. From the primary checkout,
  `arc errand close <slug> --json` returns `confirmation-required` with "Retry with:
  `arc errand close <slug> --confirm-foreign-generation <generation>`" for a destructive effect, though the Errand
  merged through its own verb a moment earlier. From the Errand's own checkout it applies without asking, then reaps
  that checkout, so the shell is left in a deleted directory (`getcwd: cannot access parent directories`). The prompt
  appeared closing PR #1087's Errand from the primary; the deleted directory followed both #1086's and #1087's closes.

- _Approach:_ A launchpad returns to base on close rather than being reaped, which removes the deleted-directory half
  for Errands run there; the foreign-generation prompt still needs a decision for a session that opened the Errand from
  the primary: either recognize the session's own Errand there or name the checkout to close from.

- _Captured during:_ Errand `test-cost-diagnosis-method` close, 2026-10-21.

### `[ ]` **Keep the next Errand launch reachable from a stale restored base**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ § Direction, "A managed launchpad lifecycle" — the open decision on how a launchpad stays at base and
  refreshes when base moves, and `close` / `leave` restoration.

- _Observation:_ After PR #1057 merged, closing `decomposition-refusal-scan-cost` correctly retired its exact claim and
  restored primary `main` at `9c550dc60`. Remote main already included the sibling archive in PR #1056 at `0988de5a6`.
  The stale local checkout still contained the active `seam-status-roadmap` meta, whose expected branch failed topology
  corroboration. The next Errand open refused with `role-conflict` and “settle or leave the active transient”, although
  the marker and Errand identity were absent.

- _Cause:_ Close restores the branch through `git checkout <base>` without advancing it. Open reads the locus and
  rejects the unresolved row before allocation or refresh. The fallback message conflates an unresolved work-unit
  checkout with an active transient. A clean fast-forward to merged main `9f36ded00` made the same checkout
  `free-primary`, and retrying the ordinary open succeeded.

- _Approach:_ Settle with the launchpad's refresh decision whether freshness belongs at restoration, launch, or an
  explicit typed remedy, and report the actual unresolved condition rather than an active transient. The tracked-meta
  trigger goes away once `storage-seam` derives the locus from the marker plus the store (its register row); stale code
  and the dev build remain the freshness question. Preserve warm-parent ownership, dirty-checkout protection, exact
  claim retirement, and conservative locus authority.

- _Interim:_ A working-memory entry carries the fast-forward workaround until this lands. Not run as an Errand: the
  freshness choice is the target's open decision, and a fix shaped around tracked metas would be rewritten by the
  storage seam.

- _Files:_ `src/lib/errand/close-runtime.ts`, `terminal-occupancy.ts`, and `open.ts` under `packages/arc-framework/`;
  unchanged since capture (re-checked 2026-10-21).

- _Evidence:_ Identity-global `.internal/investigations/errand-close-next-launch-2026-10-19/` retains the successful
  close, refused open, old and refreshed locus reports, and successful ordinary retry. Source anchors:
  `close-runtime.ts:253`, `terminal-occupancy.ts:70`, and `open.ts:123,351-380`.

- _Captured during:_ Sequential execute-bound Errand batch, entering declaration-registry projection; requested by
  andrew on 2026-10-19. Re-targeted to `errand-launchpads` on 2026-10-21 for routing at the next drain.

### `[ ]` **Let a session open an isolated Errand beside another session's live Errand**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ Problem / Motivation's occupied-primary refusal, and the open decision on whether `--isolate` from a
  launchpad still spawns.

- _Observation:_ On 2026-10-20 a session sharing the primary with a live `markdown-table-padding-merge` Errand, whose
  own session was still committing there, ran `arc errand open disposition-report-trim` with and without `--isolate`.
  Both refused `role-conflict`. The only remedy named was to checkpoint and `leave` the other Errand as `awaiting-merge`
  or `paused`, which pulls the checkout from under the session that owns it. `--isolate` keeps the primary free only
  when the first session used it; a second session arriving later has no undisruptive route until the first Errand
  ships.

- _Approach:_ Decide whether an `--isolate` open from an occupied checkout may provision its own transient without
  touching the occupying Errand, and which warm-return parent it records. If it may not, name a remedy that leaves the
  owning session undisturbed. The draft's Coordination plans this with the storage seam's locus partition; `seam-locus`
  has shipped, so it can be planned now.

- _Captured during:_ `disposition-report-trim` Errand launch, 2026-10-20.

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
