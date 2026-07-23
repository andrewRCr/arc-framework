# Spec (`detailed` · `RFC`): decomposition-hardening

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the housekeep drain (2026-07-07);
  consolidated from the original cohort-less-split concern plus three transform-hardening captures, then widened
  (2026-07-23) from "harden `decompose`" to "harden the shared lifecycle-transform **substrate**" once an audit
  found the same parallel-era failure classes across `decompose`, `rename`, `abandon`, and `park`.

- **Purpose:** Make ARC's shared **lifecycle-transform substrate** — the machinery `decompose`, `rename`,
  `abandon`, and `park` all run over — correct under parallel multi-worktree operation. Fix the parallel-era
  assumptions once in the shared code, before decomposition frequency rises and more verbs re-discover the same
  gaps.

---

## Introduction / Context

`decompose`, `rename`, `abandon`, and `park` are not four independent verbs. They are **identity/retirement
transforms over one shared substrate**: retirement authority plus content-addressed receipts
(`.arc/.internal/retirement-receipts/`, `wx`-exclusive and already concurrency-safe by construction), the
`reconcile-roadmap` side-effect, the lifecycle executor and its `lifecycle-index`, and the husk / `teardown`
terminal. That substrate was authored for a single-worktree, single-active-WU, cohort-always ARC. Under
multi-worktree operation its assumptions fail the same way regardless of which verb trips them, and two verbs have
already surfaced the same failure classes from opposite directions:

- **`decompose`** — the first live cohort decomposition (`cli-substrate-adoption`, 2026-07-18) could not execute
  the documented base-run contract (it stopped `conservation-unproven`), missed a live cross-worktree dependent
  (`session-locus-model`, on another linked worktree) in its cut map, and ended with no owned terminal (the
  successor member was launched by hand a session later). Adjacently, the cohort-always outcome forces a vacuous
  cohort node onto a flat-sibling split (`roadmap-tooling`, whose cohort-fit verdict was "two flat siblings plus
  one dependency edge, not a cohort" — a shape the cut-map primitive cannot express).
- **`rename`** (shipped `wu-rename`) — its first live spawned-worktree rename left post-ship residue: a **phantom
  ROADMAP row** (regen read a live/remote-ref oracle before the old branch was gone), an **incomplete reference
  sweep** (structured refs only; prose slug mentions and non-meta self-title headings left stale), and an
  **occupied-worktree move that isn't husk-consistent** (POSIX slips the self-move guard, relocating the live
  worktree out from under the running session).

These are the _same_ failure classes, and `decompose` is _more_ exposed on the ROADMAP-oracle one, not less: it
defers the origin branch reap to a post-merge `teardown --force`, so `origin/plan/<slug>` persists across the whole
transform and merge. With decomposition set to become more frequent and parallelism now the default, the substrate
must become boring, correct machinery — fixed once in the shared code, not re-patched per verb as each rediscovers
the gap.

**Root cause, stated once.** The transforms read a single **checkout-local** `lifecycle-index` (source units and
both edge directions all come from one `cwd`-scoped scan), regenerate **shared artifacts** (ROADMAP) from
**live / remote-ref oracles** rather than the staged tree, and leave **residue that does not self-heal** (the husk
self-healing sweep is stamp-gated, and only `teardown` stamps today). The conservation gate then proves
completeness _against the run checkout only_ — internally consistent, silently partial across worktrees.

Three forward-compat check-docs (`strategy-storage-evolution.md`, `strategy-procedure-evolution.md`,
`strategy-knowledge-evolution.md`) independently adjudicated the open forks and all push the fixes _into the shared
CLI substrate_ — per-verb prose patches would violate them, which is itself confirmation that the concern is one
substrate, not four verb-local bugs.

## Goals

- **G1 — Cross-worktree-authoritative inventory.** A transform resolves its source-unit and dependency-edge
  inventories against the same composed, cross-worktree view `arc status --project` uses, so it never misses a
  live dependent that lives on another worktree or a remote-only branch.
- **G2 — Conserved dependency edges without cross-branch writes.** When a transform retires or renames a unit,
  every dependent's `Depends On` edge is reconciled — repointed, dropped, or surfaced — without the transform
  committing to a branch that is not its own, and without a dependent silently merging a dangling edge.
- **G3 — First-class flat-sibling split.** `decompose` can express and execute an N-sibling split joined only by
  dependency edges, with no cohort node, across the cohort-fit verdict, the cut-map schema, and the scaffold.
- **G4 — Husk-consistent, self-healing terminal.** Each transform's residue (orphaned branch, worktree, user
  subdir; a renamed identity whose worktree directory lags) self-heals through the _same_ stamped-husk sweep the
  shipped-WU terminal uses, rather than a manual cleanup the developer must remember.
- **G5 — Deterministic shared-artifact regen.** The in-transform ROADMAP renders from the staged tracked-index
  projection, so it never shows a phantom row for a branch the transform is in the act of retiring.
- **G6 — Complete reference conservation, split by rewritability.** References to a renamed or retired slug are
  reconciled everywhere they can be mechanically rewritten 1:1, and surfaced (never silently left stale, never
  falsely auto-rewritten) everywhere they cannot.
- **G7 — One substrate, all verbs.** The fixes land in the shared code so `abandon` and `park` inherit them; where
  a verb does zero handling today (`abandon`'s incoming edges), it joins the shared mechanism rather than staying a
  latent gap.

## Non-Goals

- **Not a rewrite of the transform verbs.** The verbs' command surfaces, authority model, and receipt-recording
  path stay as shipped; this hardens the shared substrate they call, and switches inventory sources.
- **Not new lifecycle-state vocabulary.** Area 3's rename-move sweep uses an **operational stamped marker** (a
  derived projection reusing the shipped husk-stamp mechanics), not a new terminal-state term —
  `wu-lifecycle-state-model` owns that vocabulary and is unsettled; this WU consumes its names where they exist and
  mints none.
- **Not the retirement-record store's location.** `retirement-record-relocation` owns where the store lives; this
  WU keeps the store access-path abstract and coordinates the one new read it needs (below), rather than pinning a
  concrete location.
- **Not a merge-guard sub-criterion.** Area 1's `integrate`-time fail-closed reconcile lands at the integrate
  workflow's existing integration-interlock, not in `review-gate-right-sizing`'s readiness check (a deliberately
  closed request union that reads only the integrating WU's own products).
- **Not the `pr-decomposition` review-surface axis.** Concern-splitting (this WU's cut-map) and review-surface
  carving are orthogonal; the cut-map and chunk vocabularies stay distinct.
- **Not adopter-facing or `completed/` reference rewriting.** `completed/` is inert history; adopter-facing
  `system/` and `reference/` must not carry WU slugs at all. Both are out of the reconcile scope by construction.

## Proposed Design

The design has four areas over the shared substrate. They are one coherent concern — areas 1 and 4 share the
receipt and surface machinery; areas 3 and 4 share the husk-stamp / sweep mechanics; all four read the same
composed index and `reconcile-roadmap` path — and the sub-parts below are the enumerable substrate the task list is
built from and validated against.

### Area 1 — Authoritative cross-worktree inventory + receipt-driven edge reconcile

Two halves: the transform's **read** of what exists, and the **write** that reconciles dependents.

#### 1a. Read — resolve inventories against the composed lifecycle-index

Today `decompose` builds its source-unit and dependency-edge inventories from `buildLifecycleIndex(cwd)`
(`src/lib/work-unit/lifecycle-index.ts`), a checkout-local scan. Switch the transform's inventory source to
`resolveComposedLifecycleIndex` (`src/lib/work-unit/composed-lifecycle-index.ts`) — the project-readiness
composition over the shared tree plus in-flight WUs across local and remote refs, already the index
`arc status --project` consumes, and already able to see the cross-worktree dependents `arc decompose` misses
today. The transform switches inventory source; it does not author a new index.

This satisfies the storage check-doc directly: the transform resolves against the WU-record abstraction, not a
git-worktree / ref enumeration the backend target dissolves.

**Degraded read.** The composed index is `unreachable`-degradable (a failed remote read falls back to local / tree
truth). On degrade, record the degrade state as a **new field on the retirement receipt** (the composed-index
reachability at prepare time — the receipt's closed `RECEIPT_KEYS` schema gains one field; concrete shape and
schema-bump call in Open Questions) and **proceed, conserving against the reachable set** — do not hard-refuse.
Completeness is not forfeited, because the write-side reconcile is **dependent-pull** (1b): the receipt records the
origin's retirement plus its replacement set, consultable by any dependent, and each
dependent repoints against the receipt keyed on _its own_ `Depends On` edge when next touched. A dependent
invisible to a degraded origin read is therefore never silently dropped — it self-reconciles or surfaces on its own
next touch. So a transient network failure never bricks the transform and never silently drops a dependent.

**Finalization guard.** The finalize compare-and-set is a **match / no-regression guard over the enumerated set**:
it refuses if the prepared repoints no longer hold, or if a now-reachable read has _enlarged_ the inventory since
preparation. It is not the completeness mechanism for un-enumerated remote dependents (that is dependent-pull); it
is the guard against the reachable set changing under the transform mid-run.

#### 1b. Write — a receipt-driven `Depends On` reconcile side-effect

**Hard constraint:** branch isolation _plus_ review-atomicity. The transform must not commit to a dependent's
branch — both because that branch is not the transform's to write, and because such a commit would land outside the
dependent's own review increment. So the reconcile splits by where the dependent's meta is visible:

- **Shared-visible dependents** (meta on the shared base / run checkout) repoint **in-transform**, inside the
  transform's own commit — this is `decompose`'s existing Leg 3 and `rename`'s existing `rewriteDependsOn`
  (`src/lib/work-unit/rename-reference-sweep.ts`), unchanged.
- **Branch-private dependents** (meta only on another branch) are **not touched** on their branch. The transform
  records the repoint mapping in the retirement receipt — for `decompose`, the cut-map already carries it as
  `incomingEdges[].disposition` (`{ kind: "replace"; replacementTargets } | { kind: "drop"; reason }` in
  `src/lib/work-unit/decompose-cut-map.ts`). Each such dependent then **auto-reconciles against the receipt** when
  its own flow next touches it.

**The dependent-pull reconcile** generalizes the existing `dischargeDepEdges` side-effect
(`src/lib/work-unit/side-effects/discharge-dep-edges.ts`), which already rewrites a WU's _own_ `Depends On`
unprompted at activation via `resolveDepStates` + `setMetaBulletFields`. That precedent supplies the own-edge
**rewrite**. What is **new machinery** is the **receipt-discovery read** it needs: a subject-keyed "does this
edge-target carry a retirement receipt?" lookup. The lifecycle index resolves a retired origin only to
`nonexistent`, and the content-addressed receipt store (`retirement-record-store.ts`, keyed by
subject + transition + source head) cannot answer a subject-only query today. Keep the read's access-path abstract
(storage check-doc Principle 2) and coordinate its concrete shape (receipt-dir enumerate / a maintained subject
index / a decompose-time push) with `retirement-record-relocation`.

**Disposition set — one mechanism, per-verb dispositions** derived from the edge-target's receipt:

- `replace` — `decompose`: repoint the edge to the delivering member(s) from `incomingEdges[].replacementTargets`.
  `decompose`'s authored per-dependent `drop` (the other cut-map `incomingEdges` disposition) reconciles like
  `abandoned` below — the edge is dropped and surfaced, with the cut-map's `reason` as the record.
- `abandoned` — `abandon`: drop the edge and surface it, no replacement. `abandon` does zero incoming-edge
  handling today, so this brings it onto the shared mechanism instead of leaving dependents dangling with no
  record.
- `retarget` — `rename`: repoint 1:1 old→new. `rename`'s shared-visible dependents already sweep in-transform;
  its branch-private dependents ride this reconcile.
- `park` needs none — the slug persists, so there is no incoming-edge concern; it inherits area 1's read and
  `reconcile-roadmap` fixes for free.

**Apply ceremonies and triggers — one reconcile, multiple fire points.** The reconcile _applies and commits_ only
at the write ceremonies that already touch the dependent's branch, landing the meta rewrite in that ceremony's
commit (a dedicated `chore(arc):` commit when it is the only staged change):

- **`activate` / `resume`** — apply the pending reconcile for the WU being activated / resumed.
- **`integrate`** — the **fail-closed** leg. A dependent whose receipt-recorded repoint cannot complete (the
  target member is gone, or a real conflict exists) **fails its own integration** rather than merging a dangling
  edge. This is enforced at the integrate workflow's existing integration-interlock — the established integration
  path failing closed — **not** a new merge-guard sub-criterion in `review-gate-right-sizing`.
- **`session-init`** — a **detect-and-surface** point only, never a silent-apply one. It is a non-committing recon
  stage: it flags a pending reconcile (or a conflict) for the developer and defers the apply to the next write
  ceremony, never leaving an uncommitted meta edit to ride an unrelated increment.

The tracked/committed `Depends On` edge must ride a review increment, which is why `session-init` defers its apply.
Area 4's gitignored per-developer `WU_Target` reconcile (below) carries no commit and no increment, so it may and
does auto-apply at `session-init` without atomicity concern. Owned-and-clean reconciles are invisible at the apply
ceremony; a genuine conflict (an edge changed incompatibly, or an un-enumerated dependent whose target member is
ambiguous) surfaces as a version-checked reconcile.

**Decompose-time advisory.** The composed index already carries each dependent's in-flight state, so a dependent
that is _mid-integration_ with a live edge to the retiring origin is surfaced at the transform's own interlock for
the developer to coordinate — the transform does not silently proceed against it. (`Depends On` is a shrinking
live-blocker list, so a still-present edge to a `Planning` origin is a real blocker, not stale lineage.)

**Backend-forward.** The receipt plus reconcile _is_ what a version-checked store write becomes: today it applies
in the dependent's own git flow; under the materialized backing store it is the store's version-checked write
applied at sync. The same receipt and mapping carry over — no lock-in (storage check-doc Principle 3).

### Area 2 — First-class cohort-less (flat-sibling) split shape

A split into N siblings joined only by a dependency edge, with no cohort node, across three surfaces:

- **Cohort-fit verdict.** `assess-cohort-fit` can already return a flat-sibling cut; the schema is what blocks
  expressing it.
- **Cut-map schema.** Add a new **`parentPosition` value** — the cohort-_placement_ axis
  (`ParentPosition = "standalone" | "in-cohort" | "at-cap"` in `src/lib/work-unit/decompose-cut-map.ts`) gains a
  no-cohort value. It is **not** a new `shape` (the orthogonal origin-disposition axis — a cohort-less split can
  itself be `symmetric` or `extraction`) and **not** a boolean. The new value omits `cohort` _and_ places siblings
  flat rather than under a cohort directory. This disambiguates today's overloaded "cohort omitted" case, which
  currently means only `at-cap` (siblings fan out into an _existing_ parent). The chosen value name is
  **`cohortless`** — it reads clearly against the placement axis alongside `standalone` / `in-cohort` / `at-cap`
  (`flat` was the considered alternative; see Alternatives).
- **Parse constraints.** `parseCutMap` currently requires `cohort` for every non-`at-cap` position
  (`"${parentPosition} decomposition requires a cohort placement"`) and rejects `cohort` for `at-cap`. Extend the
  gate so `cohortless` — like `at-cap` — must _omit_ `cohort`, while remaining distinct from `at-cap` in the
  scaffold (no existing parent; flat siblings).
- **Scaffold.** `scaffoldCohortMembers` always nests members under a cohort directory today. The `cohortless` arm
  scaffolds the members as **flat siblings** (each its own `meta-* + spec-* + tasks-*`, one branch) with **no
  cohort-mint** and **no `cohort-*.md`**, their inter-sibling order carried in `Depends On` only.

Live instance: `roadmap-tooling`'s cohort-fit verdict. This is an adjacent rail to `cohort-cut-coherence` (what a
cohort absorbs on exit) — coordinate, do not fold.

### Area 3 — Husk-consistent, self-healing transform terminal

Make each transform's residue self-heal via the _same_ stamped-husk sweep the shipped-WU terminal uses
(`src/lib/session-init/stale-worktree-sweep.ts` + the husk-stamp mechanics in
`src/lib/git/worktree-marker.ts`), rather than a manual cleanup the developer must remember.

**Terminal (retirement verbs).** The transform terminal **stamps a husk** — the same
self-teardown-defer `teardown` uses — so `runStaleWorktreeSweep` reaps it at `session-init`. The verb emits **one
CLI-owned lifecycle-complete result** covering branch / worktree teardown and user-workspace close; ready
zero-dependency members are derived from the cut graph as a **CLI slot** with a spawn-anchored launch **remedy** on
a unique head (candidates surfaced, never auto-started). Sequencing is CLI-computed, not workflow prose
orchestrating it (procedure check-doc Principle 1).

**Rename facet.** The identity rename already runs in place from any locus — branch, artifacts, remote, notes,
marker — and `runRename` (`src/lib/work-unit/verbs/rename.ts`) gates the marker + worktree legs behind
`plan.shape === "spawned"`. Two fixes:

- **Always-defer the worktree-directory move.** Today the directory move is attempted unconditionally in
  `reconcileWorktree` (reached via `moveWorktree`) and defers only when the move throws an OS-reported occupied-dir
  lock on a self-move; on POSIX a **self-move** succeeds and `chdir`s into the new path, relocating the live
  worktree and stranding the running session. Mirror `reconcileWorktree`'s own teardown branch — which already
  categorically refuses a self-teardown — by refusing / deferring the self-move **unconditionally**, resolved as a
  precondition (e.g. `resolveRenameWorktreeMove` returning a defer status) for the `spawned` shape. `rename` stays
  invokable from the to-be-renamed worktree, never primary-only.
- **Stamp a self-healing marker for the deferred move.** The deferred directory move stamps a **new
  session-init sweep surface** — "worktree path lags renamed identity → `git worktree move` from outside" — that
  **reuses the shipped husk-stamp / `stale-worktree-sweep` mechanics as an operational stamped marker** (a derived
  projection), **not** a new lifecycle-state term. It consumes no unsettled `wu-lifecycle-state-model` vocabulary;
  that WU may later re-vocabulary the marker into a named terminal state without schema churn. The exact marker
  name / shape is spec-polish, patterned on the existing husk stamp (a `rename-move-pending` husk-stamp variant is
  the leaning shape).

Tier scope: the always-defer + sweep fix applies to the **`spawned`** shape (an active WU with a live worktree);
`in-place` and `stub` shapes have no worktree and are unaffected.

Boundary: the harness skills-directory registration going stale on rename is an adjacent **harness-integration**
residue, likely not ARC-substrate scope — flag, do not silently absorb (see Open Questions).

### Area 4 — Shared-artifact regen + reference conservation

Two halves.

#### 4a. Regen timing — render ROADMAP from the staged tracked-index projection

The in-transform ROADMAP renders from the **staged tracked-index projection** — deterministic, with no dependency
on remote-ref timing — in the shared `reconcile-roadmap` path. This fixes `rename`'s confirmed phantom row (regen
read a live / remote oracle and saw `origin/plan/<slug>` before the old branch was gone) _and_ `decompose`'s
more-exposed latent one (its origin branch persists across the whole transform and merge) in one place.

#### 4b. Reference conservation — split by mechanical 1:1-rewritability

The machine-vs-author boundary is drawn at **mechanical 1:1-rewritability**, and it falls differently per verb
(`rename` is 1:1 old→new; `decompose` is 1:N-then-gone — an origin reference has no single target). By reference
kind:

- **Structured, unambiguous target** (`Depends On`, backticked artifact filenames, cohort member headings):
  machine-swept for `rename` (the existing `sweepRenameReferences` already rewrites backticked `` `<kind>-<slug>.md` ``
  spans, `Depends On`, and cohort member headings); for `decompose`, `Depends On` rides area 1's receipt reconcile.
- **Self-title H1 across every WU artifact + the `--plan` anchor** (the WU's own identity): machine-swept for
  `rename` symmetrically over _all_ `*-{slug}` artifacts. The meta's `# Metadata:` heading is already rewritten;
  extend the sweep to `# Draft:` / `# Spec:` / `# Tasks:` / `# Notes:` / `# Research:` (any `# <Kind>: <slug>`)
  plus the `--plan <slug>` resume anchor, so no artifact lands self-titled with the old slug (this closes the
  observed self-title gap). N/A for `decompose` (origin artifacts are removed).
- **Backticked ref to a gone origin artifact** (`decompose`): machine-_detected_ as dangling but **surfaced**, not
  auto-retargeted — there is no single member to point at.
- **Prose / narrative slug mention** (both verbs): **surfaced, never auto-rewritten** — the target is ambiguous
  and common-word slugs invite false positives. This is an advisory reconcile, replacing today's silent-stale.
  False-positive scoping: match the whole slug on word boundaries within the three lifecycle tiers, exclude spans
  already handled by the structured sweep, and present the hits as an advisory list for the author to act on
  (never a rewrite).

**Three reconcile loci, one mechanism throughout** (reusing area 1's receipt + surface machinery, split by mode —
mechanical refs reconcile automatically, judgment refs surface):

1. **Tracked lifecycle tiers** (`active/`, `backlog/planned/`, `backlog/provisional/` — the existing
   `isLifecycleTierFile` scope in `rename-reference-sweep.ts`): swept in-transform.
2. **Other WU branches**: recorded in the receipt, reconciled in that WU's own flow (area 1's dependent-pull).
3. **User state** (`USER-INBOX` / `WORKING-MEMORY` / `SESSION-NOTES`): carries _live, load-bearing_ cross-WU
   coordination (`WU_Target:` captures, ordering obligations) that does **not** regen and that the transform
   cannot sweep (gitignored, per-machine). It reconciles at the per-developer `session-init` locus — the same
   locus wall, one level out: structured `WU_Target` auto-reconciles in the owner's `session-init` under `rename`
   (surfaces under `decompose`), prose mentions surface. This user-state reconcile carries no commit and no
   increment, so it **auto-applies** at `session-init` with no new config axis (storage check-doc: no new
   per-artifact or per-machine config booleans).

Out of scope by construction: `completed/` (inert history) and adopter-facing `system/` / `reference/` (WU slugs
must not appear there); `STATUS.USER` / `ROADMAP` stay out only because they regen.

## Alternatives & Rationale

- **Per-verb prose patches vs. one shared-substrate fix (chosen).** The failures surfaced verb-by-verb, so the
  cheap-looking path is to patch each verb's workflow prose as it breaks. Rejected: the three evolution check-docs
  independently require the fixes to land in the shared CLI substrate (procedure-evolution: terminal / dispatch /
  regen are CLI-computed, not prose conditionals), and per-verb patches guarantee the next verb rediscovers the
  same gap. The shared fix is the _least_ elaborate design that satisfies the forward-compat constraints — fewer
  total mechanisms, not more.
- **Flat-sibling as a new `parentPosition` value vs. a new `shape` vs. a boolean (chose `parentPosition` value).**
  A boolean (`isCohortless`) is the check-doc anti-pattern (a second axis smuggled into a flag). A new `shape`
  value conflates two orthogonal axes — origin-disposition (`symmetric` / `extraction` / …) is independent of
  cohort-placement, and a cohort-less split can be either. The cohort-placement axis (`parentPosition`) is exactly
  where "no cohort node" belongs, and the schema already models it as a closed enum, so the addition is a clean
  extension with no new axis. Value name `cohortless` over `flat`: `cohortless` reads unambiguously against the
  placement axis and against `at-cap` (which is _also_ cohort-omitting but places into an existing parent);
  `flat` describes the sibling layout but not the placement decision.
- **Dependent-pull reconcile vs. transform-pushes-to-dependent-branches vs. a bolt-on merge-gate (chose
  dependent-pull).** Pushing repoints onto dependent branches violates branch isolation and review-atomicity (a
  commit outside the dependent's own increment). A standalone dangling-dep merge-gate is a competing enforcement
  path colliding with the established integration-interlock. Dependent-pull generalizes the existing
  `dischargeDepEdges` precedent and folds three earlier candidates (record-and-defer, an owned-dep convenience, a
  merge-gate) into one reconcile fired at multiple triggers — no nudge-to-authorize, no bolt-on gate.
- **Hard-refuse on degraded read vs. proceed-conserving (chose proceed-conserving).** Hard-refusing on a transient
  remote-read failure bricks the transform for a network blip. Because the reconcile is dependent-pull, a dependent
  invisible to a degraded origin read is never dropped — it self-reconciles on its own next touch — so
  proceed-conserving loses no completeness while staying available. Rigor concentrates at `integrate` (fail-closed,
  irreversible), not at the transform's retryable read.
- **`integrate`-interlock enforcement vs. an `arc-cleared` merge-guard sub-criterion (chose the interlock).**
  `review-gate-right-sizing`'s readiness check is a deliberately closed `work-unit` / `errand` request union that
  reads only the integrating WU's own products; a cross-receipt edge reconcile has no socket there and would break
  that containment. The integrate workflow's existing integration-interlock is already the sole merge authority
  that surfaces the candidate for approval, so the fail-closed incoming-edge check lands **at** that interlock
  (extending the established path) rather than as a new competing gate — the check itself is this WU's new
  machinery, not a pre-existing one. Any later host-side defense-in-depth rides RGRS's existing
  project-readiness-view product, never a new merge-guard sub-criterion.
- **Operational stamped marker vs. a new lifecycle-state term for the rename-move sweep (chose the marker).**
  `wu-lifecycle-state-model` owns terminal-state vocabulary and is unsettled. Minting a state term now would
  collide with it and risk schema churn when it settles. A derived projection over the shipped husk-stamp mechanics
  delivers the self-heal with zero new vocabulary and lets that WU re-vocabulary later without churn.
- **Staged-index render vs. live/remote-ref oracle for ROADMAP regen (chose staged-index).** The live-ref oracle
  is exactly the phantom-row source: it sees a branch mid-retirement. Rendering from the staged tracked-index
  projection is deterministic and reflects the transform's own staged tree — the only correct oracle at regen time.

## Cross-cutting Considerations

- **Testing.** The load-bearing cases are **linked-worktree**: a cross-worktree dependent (area 1 read), a
  branch-private dependent reconciling at each of `activate` / `resume` / `integrate` and detected-only at
  `session-init` (area 1 write), a `spawned` rename invoked _from the to-be-renamed worktree_ proving the live
  worktree is not relocated (area 3), and a transform whose origin branch still exists at regen proving no phantom
  row (area 4a). A **confirmation pass** covers the parent-position arms and non-symmetric shapes that have never
  run under parallelism (`in-cohort` → sub-cohort, `at-cap` → lateral fan-out; `extraction` incl.
  extraction-from-Active, `backlog-stub-source`, `heterogeneous-home`): they read the same checkout-local index and
  `reconcile-roadmap` path, so the root-cause fixes cover them structurally, but each cell gets an explicit test
  rather than an assumed-covered claim. Follows the three-tier structure (unit / integration / e2e); the
  cross-worktree and regen-timing behaviors are integration/e2e against real temporary git repos.
- **Migration / rollout.** The receipt schema is pre-GA and has no external consumers; the cut-map is at
  `DECOMPOSE_SCHEMA_VERSION = 2` and the receipt at `schemaVersion: 1` with a closed `RECEIPT_KEYS` decoder.
  Whether the `cohortless` addition, an `abandoned`/`retarget` disposition, or the new degraded-read reachability
  field needs a schema-version bump is a Finalize/task-time call (an additive enum value on a closed set that
  existing records never carry may not require one; a new receipt key does touch the exact-keys decoder). The
  receipt-discovery read's concrete shape is coordinated with `retirement-record-relocation` before it lands.
- **Package-project sync.** Framework edits go through `packages/arc-framework/arc/` source and sync to `.arc/`;
  any workflow-prose changes (integrate / session-init detect-and-surface wording) are two-copy per the sync
  discipline.
- **Security / trust boundaries.** The cut-map and receipt decoders are the untrusted-JSON boundary
  (`parseCutMap`, `parseRetirementReceipt`); new enum values and the disposition set extend those closed schemas
  and must keep exact-keys / closed-set validation. No new trust boundary is introduced.
- **User-facing impact.** The developer stops hitting phantom ROADMAP rows, stale slug references, stranded
  worktrees, and hand-launched successor members; degraded-network transforms proceed instead of hard-refusing.
  The new `session-init` surfaces (pending reconcile, rename-move-pending, cohort-less scaffold) are advisory, not
  gates.
- **Concurrency / user-notes.** The area 4 user-state reconcile mutates gitignored per-developer state at
  `session-init`; it must follow the user-notes shared-state write discipline (`strategy-user-notes-concurrency.md`)
  since `WU_Target` captures live in identity-global surfaces.

## Success Criteria

Validated at work-unit completion:

- **SC1 (G1).** A `decompose` / `rename` run whose only dependent lives on a second linked worktree includes that
  dependent in its inventory — reproduced by the `session-locus-model`-class case that `cli-substrate-adoption`
  missed. A degraded (remote-unreachable) read proceeds and records its reachability state in the new receipt
  field rather than refusing.
- **SC2 (G2).** A branch-private dependent's `Depends On` edge is repointed (`replace`/`retarget`) or dropped
  (`abandoned`) by the dependent-pull reconcile at `activate` / `resume` / `integrate`, landing in that ceremony's
  commit; `session-init` detects and surfaces the pending reconcile without writing an uncommitted meta edit; and
  a dependent whose repoint cannot complete **fails integration** at the interlock rather than merging a dangling
  edge. No transform commits to a branch that is not its own.
- **SC3 (G3).** `assess-cohort-fit` → `decompose` executes a `cohortless` cut end-to-end: `parseCutMap` accepts the
  new `parentPosition` value with `cohort` omitted, the scaffold produces flat siblings with no `cohort-*.md`, and
  the `roadmap-tooling`-class verdict is expressible.
- **SC4 (G4).** After a retirement transform, `session-init`'s stale-worktree sweep reaps the stamped husk (branch
  / worktree / user subdir) with no manual `teardown --force`; ready zero-dependency members are surfaced as
  spawn-anchored launch candidates from the CLI, not workflow prose.
- **SC5 (G4, rename).** A `spawned` rename invoked _from the to-be-renamed worktree_ never relocates the live
  worktree; the directory move defers unconditionally, stamps the rename-move-pending marker, and a subsequent
  `session-init` surfaces the `git worktree move`-from-outside remedy.
- **SC6 (G5).** A transform whose origin branch still exists on `origin` at regen time renders **no phantom
  ROADMAP row** — reproduced against the `wu-rename` case and the more-exposed `decompose` deferred-reap case.
- **SC7 (G6).** A `rename` reconciles every mechanically-rewritable reference — `Depends On`, backticked artifact
  filenames, cohort member headings, and **all** `# <Kind>: <slug>` self-title H1s plus the `--plan` anchor — in
  the three lifecycle tiers; prose mentions and dangling `decompose` origin refs are **surfaced, not rewritten**;
  structured `WU_Target` captures auto-reconcile at the owner's `session-init`, prose captures surface. No
  adopter-facing or `completed/` file is touched.
- **SC8 (G7).** `abandon` reconciles its dependents via the shared mechanism with the `abandoned` disposition
  (previously zero handling); `park` inherits the read + regen fixes with no incoming-edge work. The confirmation
  pass over the never-run parent-position arms and non-symmetric shapes passes.

## Open Questions

Implementation detail, resolved during the work — none is a resolve-before-starting design blocker:

- **Receipt-discovery read's concrete shape** — receipt-dir enumerate vs. a maintained subject index vs. a
  decompose-time push. Access-path stays abstract; the concrete choice is coordinated with
  `retirement-record-relocation` at task time.
- **Schema-version bump** — whether the `cohortless` `parentPosition` value, the `abandoned`/`retarget`
  disposition, and the degraded-read reachability receipt field warrant a `DECOMPOSE_SCHEMA_VERSION` / receipt
  schema bump, or land as additive fields on records that never carried them. The reachability field's carrier
  (a receipt key vs. a run-local surface) is settled here at task time.
- **Rename-move-pending marker name / shape** — exact enum name and stamp fields, patterned on the existing husk
  stamp (`rename-move-pending` is the leaning shape).
- **Harness skills-dir registration staleness on rename** — an adjacent harness-integration residue; confirm it is
  out of ARC-substrate scope (flag-not-absorb) or route it to a harness-integration concern rather than widening
  this WU.
