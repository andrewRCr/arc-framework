# Cohort: `storage-cutover`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Parent:** `state-storage`

**Purpose:** Cut this repository over to the ref store and finish the program: rehearse, quiesce, import, flip, and
retire Git notes in one window, then delete what the flip made dead and rewrite the documentation to the new model. One
draft designed the cutover whole; the members deliver it in five work units, the flip first and four follow-ons in
parallel after it.

---

## Coordination

```text
cutover-flip                       the rehearsal, the window, the flip change, the workflow rewrite, and notes
│                                  retirement
├── cutover-tracked-state-removal  the in-repo store and its arms, the branch-tree readers, lifecycle
│                                  classification, the lifecycle hook checks, and the CI planning classifier
├── cutover-notes-removal          notes-specific sync and its configuration keys
├── cutover-decompose-removal      the old decomposition machine
└── cutover-documentation          the strategy rewrites and the ADR supersessions and amendments
```

Each member's `Depends On` edges are the source of truth: `cutover-flip` depends on `cohort-identity-verbs`,
`projection-worktrees`, `projection-write-back`, and `storage-ref-hardening`, and each follow-on on `cutover-flip`.
These orderings are not edges:

- **Gate B placement** (Owner, 2026-11-03):
    - `cutover-flip`, `cutover-tracked-state-removal`, `cutover-notes-removal`, and `cutover-documentation` are Musts;
      `cutover-decompose-removal` is a Should.
    - The follow-ons are planned to implementation-ready before `cutover-flip` lands. They land between the flip and the
      start of the product-renames sweep, which waits on them through `naming-conventions`' edges.
    - If `cutover-decompose-removal` has not landed by the sweep's start, it waits until after the deadline, and its
      `naming-conventions` edge is dropped then, at the Owner's call.
- **Tracked-state removal builds first** among the follow-ons. It is not pure deletion: it first moves surviving start,
  teardown, `lib/delivery/`, and the review gate's pre-publication code onto store reads.
- **What the old decomposition machine still imports.** `cutover-tracked-state-removal` leaves in place every module
  the old machine imports: the transition-record cluster (`git-transition-record-enumeration.ts`,
  `terminal-transition-record-writer.ts`, `transition-record-store.ts`), `transition-overlay.ts`, `artifactMatcher` and
  `pruneEmptyBacklogSource` (`mutators/relocate-artifacts.ts`), `resolveProjectReadinessViewInput`
  (`lib/status/project-view.ts`), and the `ProtectionMode` type (`lib/git/write-context.ts`). It moves their other
  callers onto store reads, and `cutover-decompose-removal` deletes each with its last caller, so the two land in
  either order.
- **The ROADMAP conflict remedy** (`arc hook-remedy-roadmap-conflict`) goes only after every live branch's tracked
  pre-commit hook has been refreshed, since its hook fallback errors when it is missing.
- **Inbound item numbers.** Each member's inbound items keep the number they had in `storage-cutover`'s buffer, shown
  in their headings, so a number cited in one member's draft finds its item in another's.
- **Inbound items that span two members.** Each lives in one member's draft; the other member takes the share named
  here:
    - #1, "Delete the code `cli-substrate-complete-migration` carves out": `cutover-tracked-state-removal` holds it;
      `cutover-notes-removal` takes its notes-specific sync and survivor list.
    - #10, "Delete the import's transform, the suites that target retired substrates, and the sync-state ref":
      `cutover-tracked-state-removal` holds it; `cutover-notes-removal` takes the sync-state ref and the suites that
      target notes.
    - #25, "Take `seam-decomposition`'s deletion set, rehearsal cut, and workflow end state":
      `cutover-decompose-removal` holds it; `cutover-flip` takes the representative rehearsal cut and the workflow end
      state.
    - #26, "Take `seam-status-roadmap`'s two-step ROADMAP removal and its in-repo arms": `cutover-flip` holds it;
      `cutover-tracked-state-removal` takes the in-repo arms, `DERIVED_VIEWS`, and the conflict remedy.

### Why five

The cutover's change set crosses `assess-boundary-fit`'s size mark on deletion alone, and its own seam runs between the
flip and the deletion the flip makes due (Owner, 2026-11-03). The flip carries everything that would break or mislead
once state leaves the branch; the rest follows. Three deletion members follow the code's coupling: the in-repo store,
the branch-tree readers, and the hook checks over tracked files come out as one path, since the readers' surviving
callers are the seam members' in-repo arms, while notes sync and the old decomposition machine each stand alone.
`cutover-notes-removal` and `cutover-decompose-removal` each cross the mark of about 10,000 changed lines and stay whole
(Owner, 2026-11-03): each is a pure deletion of one self-contained subsystem, and a split adds a branch and a review
without shrinking what a reviewer checks.

### Closeout criteria

Every member has shipped, and every row of `cohort-state-storage.md`'s storage-coupling register that names
`storage-cutover` as its owner is closed.

## Members

### `cutover-flip`

_Exposes:_ the flipped repository: the rehearsal, the quiesce and its check, the import and its second run, the flip
change, every workflow rewritten onto the store, and Git notes retired.

_Consumes:_ every other `state-storage` member, landed, the last of them `cohort-identity-verbs`,
`projection-worktrees`, `projection-write-back`, and `storage-ref-hardening`.

### `cutover-tracked-state-removal`

_Exposes:_ the in-repo store implementation and every in-repo arm the seam members left, removed; the branch-tree
readers, lifecycle classification and exclusion, the lifecycle hook checks, and the CI planning classifier, removed;
and the residue refs and the retired `archive.cadence`, `hooks.contributor_protected_paths`, and `hooks.task_numbering`
keys gone.

_Consumes:_ `cutover-flip`.

### `cutover-notes-removal`

_Exposes:_ notes-specific sync removed, its survivors kept; the sync-state ref, the suites that target notes, the notes
configuration keys, and the notes residue refs gone.

_Consumes:_ `cutover-flip`.

### `cutover-decompose-removal`

_Exposes:_ the old decomposition machine removed, with its callers in teardown and in-flight derivation and the modules
`cutover-tracked-state-removal` leaves for it.

_Consumes:_ `cutover-flip`.

### `cutover-documentation`

_Exposes:_ the strategies and ADRs rewritten to the store model, among them § Per-Worktree Isolation and its acceptance
test, the errata convention, and the `storage.backing_repository` comment.

_Consumes:_ `cutover-flip`.

---
