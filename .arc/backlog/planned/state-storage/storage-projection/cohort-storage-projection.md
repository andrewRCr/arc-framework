# Cohort: `storage-projection`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Parent:** `state-storage`

**Purpose:** Build the projection: the gitignored working copy of the store at the familiar `.arc/` paths, which every
worktree holds and every `arc` command writes back and refreshes. One specification designed it whole; the members
deliver it in three work units in order, each landing single-branch with chunked review, so the pieces that need no
store land while `storage-ref-hardening` does.

---

## Coordination

```text
projection-substrate     the ignore strategy, the engine's state, reading and replacing, and the worktree lock
└── projection-write-back  write-back and conflicts with `arc save`, edit rights, the `active/` layout, adoption,
    │                      the settings, and the selection; after storage-ref-hardening
    └── projection-worktrees  refresh, fan-out, materialization and the tripwires, the removal slots and the
                              release step, the user surfaces in every worktree, and scratch
```

Each member's `Depends On` edges are the source of truth: `projection-write-back` depends on `projection-substrate` and
`storage-ref-hardening`, `projection-worktrees` on `projection-write-back`, and `storage-cutover` on all three. These
orderings are not edges:

- **Review chunks.** Each member lands its chunks in the order § Review chunks gives, `projection-substrate`'s worktree
  lock last, live before the flip.
- **The take-in port.** `projection-substrate` defines the port its reading and replacing hand an edit to, with a test
  double; `projection-write-back` binds it to write-back. The first member needs nothing `storage-ref-hardening`
  changes.
- **The start's refresh.** `projection-write-back` builds the command's start, end, and report with the start's refresh
  as a slot; `projection-worktrees` fills it, with the fan-out and the changed mark a verb's write sets.
- **The selection.** `projected-markdown-checks` has shipped its `selection` mode over `readProjectedSelection`;
  `projection-write-back` fills the reader's body.

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
    1. **Refresh, fan-out, materialization, and the tripwires** (§ 2.5, § 15), the start's refresh of what the store
       changed and the fan-out among them (§ 2.2, § 15.2), with the `createStore` wrapper, the changed mark a verb's
       fan-out sets (§ 11.7), reprojection on a changed view setting, identity, claim, or `layout.active` (§ 10.3,
       § 10.4), the isolation test (§ 10.5), the multi-process lane (§ 1.5), and the `.worktreeinclude` copy's
       regression test (§ 11.6).
    2. **The removal slots and the release step** (§ 12.2, § 12.3), with the multi-process lane's saves into a persist
       step (§ 1.5), the user surfaces in every worktree (§ 12.8), and scratch (§ 12.9).

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

---
