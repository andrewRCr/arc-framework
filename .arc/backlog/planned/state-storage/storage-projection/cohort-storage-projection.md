# Cohort: `storage-projection`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Parent:** `state-storage`

**Purpose:** Build the projection: the gitignored working copy of the store at the familiar `.arc/` paths, which every
worktree holds and every `arc` command writes back and refreshes. One specification designed it whole; three members
deliver it in order, each landing single-branch with chunked review, so the pieces that need no store land while
`storage-ref-hardening` does. A fourth, split from the third, keeps the projection's cost bounded at team scale.

---

## Coordination

```text
projection-substrate     the ignore strategy, the engine's state, reading and replacing, and the worktree lock
└── projection-write-back  write-back and conflicts with `arc save`, edit rights, the `active/` layout, adoption,
    │                      the settings, and the selection; after storage-ref-hardening
    └── projection-worktrees  refresh, fan-out, materialization and the tripwires, the removal slots and the
        │                     release step, the user surfaces in every worktree, and scratch
        └── projection-team-scale  the backlog and archive view narrowed by size, and the archive laid read-only and
                                   amended through a command
```

Each member's `Depends On` edges are the source of truth: `projection-write-back` depends on `projection-substrate` and
`storage-ref-hardening`, `projection-worktrees` on `projection-write-back`, `projection-team-scale` on
`projection-worktrees`, and `storage-cutover` on all four; `cutover-flip` records its edge on `projection-team-scale`
with its specification. These orderings are not edges:

- **Review chunks.** Each member lands its chunks in the order § Review chunks gives, `projection-substrate`'s worktree
  lock last, live before the flip.
- **The take-in port.** `projection-substrate` defines the port its reading and replacing hand an edit to, with a test
  double; `projection-write-back` binds it to write-back. The first member needs nothing `storage-ref-hardening`
  changes.
- **The start's refresh.** `projection-write-back` builds the command's start, end, and report with the start's refresh
  as a slot; `projection-worktrees` fills it, with the fan-out and the changed mark a verb's write sets.
- **The selection.** `projected-markdown-checks` has shipped its `selection` mode over `readProjectedSelection`;
  `projection-write-back` fills the reader's body.
- **The index's seams.** `projection-worktrees` designs the index's partitions (its § 3.1) as the seams
  `projection-team-scale` builds on: a narrower view or a read-only archive changes the entries a partition holds,
  never how entries are grouped, named, or committed.

### Why three

This project's boundary-fit override returns the call to the Owner above about 1,500 specification lines, 1,000
task-list lines, or six phases, where coupling alone does not keep a work unit whole. At the decision the design ran
2,374 lines and its task list 2,525 lines across eight phases, past every mark. The design's own seams cut it. The first
member's store reads, over the reference backend, are the current version the replace guard restages
(`spec-projection-substrate.md` § 5.1) and a record's `history` in base-stamp recovery and, for a file other than
Markdown, at the version a stopped replacement replaced, whose `state-unresolvable` arms pull nothing (its § 3.5,
§ 3.7); it reaches write-back only through the take-in port it defines and the second member binds (its § 5.1), so it
needs nothing `storage-ref-hardening` changes, and builds and lands while that work does, shortening the cutover's
critical path by its length. The second is the first to observe hardening's surfaces, and the third builds the
cross-worktree machinery over the second's write path.

After the cut, `projection-write-back`'s specification ran 1,635 lines and its task list 1,158, and
`projection-substrate`'s task list 1,037, at or just past their marks, with no member above five phases. None has a
change-set forecast against the third mark, about 10,000 changed lines. The Owner kept the three members (2026-10-31):
each sits at its marks rather than well past them, its task list holds only the origin's tasks for its sections, and its
specification's growth past them is the terms and sibling contracts a member needs to stand alone, not added scope, so
one review of each member's change set can hold it.

`projection-worktrees` passed all three marks at its own task generation: its specification ran about 1,750 lines and
its task list about 1,470, and its change set is forecast at about 15,000 lines with its tests. The one cut its design
suggests, the removal slots and the release step, consumes contracts shaped around it, so that part could be built only
on a branch stacked on this member, landing after it either way. The Owner kept the member whole (2026-11-07), its
change set reviewed in the four chunks below, each in one pass, with a review of the seams between them
(`spec-projection-worktrees.md` § 1.1).

### Why a fourth

A Windows scale assessment on 2026-11-07 (`~/dev/arc-evidence/projection-worktrees/SCALE-SUMMARY.md`) led the Owner to
approve five scale changes to `projection-worktrees`, which with all five would have landed about 2026-11-26 to 12-01.
The Owner split them the same day. `projection-worktrees` keeps the index split by root and the archive by quarter,
with plain JSON on the hot path, and shared protection reads, landing about 11-23 to 11-27; a third change it kept,
later catch-up after a pull, was reverted that day, since holding a pull's merges does not avoid their cost.
`projection-team-scale` takes the backlog and archive view narrowed by size, the read-only archive amended through a
command, and the growth-relative scale criterion; it is planned during `projection-worktrees`' build and built right
after it lands. The held design text for the view and the archive moves to it as written, and `cutover-flip`'s
specification writes its errata convention for the archive's unlock command from the start.

### Review chunks

Each member lands as review chunks on its own branch, each chunk with its tests, in this order; each list's section
numbers are its own specification's:

- **`projection-substrate`** (`spec-projection-substrate.md` § 1.3):
    1. **The ignore strategy** — the exclude writer and its guard (§ 11.1, § 11.2) — with ARC's managed `.ignore` block
       and this repository's `.gitignore` change, which go live before the flip (§ 11.3, § 11.5).
    2. **The engine's state** — the index, the projection lock, change detection, blob ids and the configuration
       read, and base-stamp recovery (§ 3, § 15.3), with the test store that wraps the reference backend to refuse
       `history` (§ 1.5).
    3. **Reading and replacing** — the settle rule, the replace guard, the aside folder and its sweep, rebuilds, and
       removals (§ 4, § 5), each taking an edit in through the take-in port, a test double until the second member
       binds it to write-back.
    4. **The worktree lock** (§ 12.1), last, with the relock after a failed retirement and the rewritten printed and
       documented removals (§ 12.6) — live before the flip.
- **`projection-write-back`** (`spec-projection-write-back.md` § 1.3):
    1. **Write-back and conflicts** — the command's start, its end, and the report (§ 2.2), the start's refresh a slot
       the third member fills; parse and send, the store's merge read back, a clash found in the checkout, the store's
       refusals, the check, the `after` view, provenance, conflicts placed and parsed back, and the roots write-back
       scans (§ 15.1); with `arc save` and its `--resolve` and decomposition's remedy naming it (§ 2.4, § 6, § 7).
    2. **Edit rights, the `active/` layout, adoption, and settings** (§ 8, § 9, § 10), with the checkout-rooted path
       function, its callers, and the capability recorded for each root (§ 10.2), `arc editor` and the skip switch
       (§ 2.3, § 11.4), and the selection and its reader (§ 11.7); the isolation test and reprojection are the third
       member's.
- **`projection-worktrees`** (`spec-projection-worktrees.md` § 1.3):
    1. **The engine's state in any worktree** — which checkouts hold a projection (§ 2.5), the index's header and
       partitions (§ 3.1) with § 16.2's amendment of the index and § 16.3's of edit rights and of the start's index
       read, and the binder for any worktree (§ 2.1, § 14).
    2. **Refresh, materialization, and fan-out** (§ 2.2, § 2.5, § 15.2) — the start's refresh of what the store
       changed, over the index the start holds from its sweep (§ 15.3), protection read once per round (§ 15.5) with
       § 16.3's amendment of a refresh's protection, a full materialization and the rebuild with the checkout's
       scratch folder (§ 12.9), the `createStore` wrapper and the fan-out, the changed mark a verb's fan-out sets
       (§ 11.7), reprojection on a changed view setting, identity, claim, or `layout.active` (§ 10.3, § 10.4),
       `arc sync`'s rebuild (§ 2.4), the isolation test (§ 10.5), and the `.worktreeinclude` copy's regression test
       (§ 11.6).
    3. **The budget and the tripwires** (§ 15.3, § 15.4, § 15.5), with the start's order, § 16.2's amendment of the
       lease steps' confirmation and § 16.3's of the end's lock, the tripwire suite, and the multi-process lane's
       bursts (§ 1.5).
    4. **The removal slots and the release step** (§ 12.2, § 12.3), with the fan-out's skip of a checkout they mark
       retiring (§ 2.2), the multi-process lane's saves into a persist step (§ 1.5), the user surfaces in every
       worktree (§ 12.8), and the machine-local paths (§ 12.9).
- **`projection-team-scale`**: its specification, when written, sets its chunks and their order.

### Closeout criteria

Every member has shipped, and every row of `cohort-state-storage.md`'s storage-coupling register that names
`storage-projection` as its owner is closed.

## Members

### `projection-substrate`

_Exposes:_ the exclude writer, its guard, and ARC's managed `.ignore` block; the engine's index, projection lock, change
detection, and base-stamp recovery; the replace guard, the aside folder, rebuilds, and removals, each handing an edit to
the take-in port; and the worktree lock, live before the flip.

_Consumes:_ `seam-lifecycle`'s removal function and `seam-locus`'s marker writers, shipped.

### `projection-write-back`

_Exposes:_ write-back and conflicts, `arc save` with `--resolve`, edit rights, the `active/` layout and the
checkout-rooted path function, adoption, the settings, `arc editor`, the skip switch, and the selection.

_Consumes:_ `projection-substrate`'s engine and take-in port, and `storage-ref-hardening`'s listing scope, fault
classes, and pull-result sweep.

### `projection-worktrees`

_Exposes:_ refresh, fan-out, materialization, and the tripwires; the removal slots and the release step; the user
surfaces in every worktree; and scratch.

_Consumes:_ `projection-write-back`'s write path and the start's refresh slot.

### `projection-team-scale`

_Exposes:_ the backlog and archive views (`arc.backlogView`, `arc.archiveView`), narrowed by size with a notice; the
archive laid read-only, with the command that unlocks one archived file for an in-place correction; `arc save` walking
only unlocked archive entries; and the growth-relative scale criterion.

_Consumes:_ `projection-worktrees`' index partitions and their seams, reprojection on a changed view setting, and the
removal and release steps' walk of the archive; `projection-write-back`'s edit rights, protection, and `arc save`.

---
