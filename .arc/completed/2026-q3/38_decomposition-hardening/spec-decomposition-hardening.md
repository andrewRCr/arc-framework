# Spec (`detailed` · `RFC`): decomposition-hardening

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the housekeep drain (2026-07-07);
  consolidated from the original cohort-less-split concern plus three transform-hardening captures, then widened
  (2026-07-23) from "harden `decompose`" to "harden the shared lifecycle-transform **substrate**" once an audit
  found the same parallel-era failure classes across `decompose`, `rename`, `abandon`, and `park`. Task grounding
  absorbed the unstarted retirement-record relocation concern once schema evolution and subject discovery made
  the store contract part of the same change.

- **Purpose:** Make ARC's shared **lifecycle-transform substrate** — the machinery `decompose`, `rename`,
  `abandon`, and `park` all run over — correct under parallel multi-worktree operation. Fix the parallel-era
  assumptions once in the shared code, before decomposition frequency rises and more verbs re-discover the same
  gaps.

---

## Introduction / Context

`decompose`, `rename`, `abandon`, and `park` are not four independent verbs. They are **identity/retirement
transforms over one shared substrate**: retirement authority plus content-addressed receipts
(`.arc/system/.internal/retirement-receipts/`, `wx`-exclusive and already concurrency-safe by construction), the
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
defers the origin branch reap to a post-merge receipt-backed `teardown`, so `origin/plan/<slug>` persists across the whole
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
- **G4 — Husk-consistent, self-healing terminal.** Once a transform's receipt is authoritative, its residue
  (orphaned branch, worktree, user subdir; a renamed identity whose worktree directory lags) re-enters the _same_
  evidence-backed teardown / sweep substrate the shipped-WU terminal uses, rather than a force-mode cleanup the
  developer must remember.
- **G5 — Deterministic shared-artifact regen.** The in-transform ROADMAP renders from the staged tracked-index
  projection, so it never shows a phantom row for a branch the transform is in the act of retiring.
- **G6 — Complete reference conservation, split by rewritability.** References to a renamed or retired slug are
  reconciled everywhere they can be mechanically rewritten 1:1, and surfaced (never silently left stale, never
  falsely auto-rewritten) everywhere they cannot.
- **G7 — One substrate, all verbs.** The fixes land in the shared code so `abandon` and `park` inherit them; where
  a verb does zero handling today (`abandon`'s incoming edges), it joins the shared mechanism rather than staying a
  latent gap.
- **G8 — Canonical retirement-record storage.** New records write only beneath
  `.arc/system/.internal/retirement-receipts/`; existing evidence remains readable and the tracked tree never
  recreates a root-level `.arc/.internal/`.

## Non-Goals

- **Not a rewrite of the transform verbs.** The verbs' command surfaces, authority model, and receipt-recording
  path stay as shipped; this hardens the shared substrate they call, and switches inventory sources.
- **Not new lifecycle-state vocabulary.** Area 3's rename-move sweep uses an **operational stamped marker** (a
  derived projection reusing the shipped husk-stamp mechanics), not a new terminal-state term —
  `wu-lifecycle-state-model` owns that vocabulary and is unsettled; this WU consumes its names where they exist and
  mints none.
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
today. The transform switches inventory source; it does not author a new index. The composed result retains two
orthogonal projections per slug: the selected semantic record for inventory, and the current-tree candidate needed
to prove optional exact current-checkout `writablePath` authority. Agreement means equality after canonical
normalization across the complete project-readiness semantic payload — slug, location, state, owner, priority,
cohort, `Depends On`, and scheduling — not merely the selected source kind or path. Only an agreeing current-tree
candidate contributes `writablePath`; ref-only, linked-worktree, remote-only, and divergent candidates extend
knowledge but never filesystem authority. A transform subject itself must have that authority before any artifact
or meta read/mutation; a remote-only or divergent subject refuses rather than treating a ref-qualified source path
as a checkout path.

This satisfies the storage check-doc directly: the transform resolves against the WU-record abstraction, not a
git-worktree / ref enumeration the backend target dissolves.

**Degraded read.** The composed index is `unreachable`-degradable (a failed remote read falls back to local / tree
truth). Every new receipt is schema v2 and records the prepare-time read as the required closed field
`inventoryRead: "not-applicable" | "tree-only" | "reachable" | "degraded"`; transform receipts carry one of the
last three values, while generic non-WU retirement uses `not-applicable`. Exact v1 receipts remain decodable
without synthetic fields or changed identity; the subject-query projection treats their absent read quality as
`unknown`. On degrade, **proceed, conserving against the reachable set** — do not hard-refuse.
Rename therefore has no separate mandatory fetch-and-throw gate before composed resolution: the composed oracle
owns its bounded refresh, and an unreachable remote flows into `degraded` quality while rename continues against
the reachable local / tree set.

Decompose's durable preparation envelope advances separately to exact schema v2 and persists the prepare-time
`inventoryRead`. Its locator derives the future receipt ID with receipt schema v2, so prepare, process restart,
mutation, and finalize address one identity. Exact preparation v1 remains decodable and may finalize through its
unchanged v1 receipt contract; every new preparation writes v2. Finalization compares a fresh composed read with
the persisted prepare-time quality and never substitutes the fresh quality for the fact preparation observed.
Completeness is not forfeited, because the write-side reconcile is **dependent-pull** (1b): the receipt records the
origin's retirement and every authored dependent-specific mapping the transform could establish. Each enumerated
dependent repoints against its own mapping when next touched. A dependent invisible to a degraded origin read has
no safe decompose mapping to guess, so it surfaces an explicit `unmapped-dependent` conflict on its next touch and
fails closed at integration. A transient network failure therefore never bricks the transform and never silently
drops or misroutes a dependent; completeness includes safe surfacing, not fabricated repair.

**Finalization guard.** The finalize compare-and-set re-resolves composed truth and derives a fresh inventory; it
never projects the stored preparation inventory back as current truth. It is a **match / no-regression guard over
the enumerated set**: it refuses if the prepared repoints no longer hold, a reachable preparation can establish
only degraded truth at finalization, or a now-reachable read has _enlarged_ the inventory since preparation. It is
not the completeness mechanism for un-enumerated remote dependents (that is dependent-pull); it is the guard
against the reachable set changing under the transform mid-run.

The finalized v2 decompose receipt embeds the canonical source, incoming-edge, and outgoing-edge inventories in
addition to their digests. Post-landing teardown authenticates those exact composed facts instead of attempting to
reconstruct cross-ref truth from the origin branch alone; v1 canonical receipts retain their historical
source-branch derivation path.

#### 1b. Write — a receipt-driven `Depends On` reconcile

**Hard constraint:** branch isolation _plus_ review-atomicity. The transform must not commit to a dependent's
branch — both because that branch is not the transform's to write, and because such a commit would land outside the
dependent's own review increment. So the reconcile splits by where the dependent's meta is visible:

- **Shared-visible dependents** whose selected semantic record has an agreeing current-tree `writablePath` repoint
  **in-transform**, inside the transform's own commit — this preserves `decompose`'s existing Leg 3 and `rename`'s
  existing `rewriteDependsOn` (`src/lib/work-unit/rename-reference-sweep.ts`). The composed read adds remote
  knowledge without removing the checkout-local fast path.
- **Branch-private dependents** (meta only on another branch) are **not touched** on their branch. The transform
  records the repoint mapping in the retirement receipt — for `decompose`, the cut-map already carries it as
  `incomingEdges[].disposition` (`{ kind: "replace"; replacementTargets } | { kind: "drop"; reason }` in
  `src/lib/work-unit/decompose-cut-map.ts`). Ref-only, linked-worktree, remote-only, or divergent local candidates
  carry no `writablePath`; each such dependent reconciles against the receipt only when its own flow next touches
  it.

**The dependent-pull reconcile** generalizes the existing `dischargeDepEdges` side-effect
(`src/lib/work-unit/side-effects/discharge-dep-edges.ts`), which already rewrites a WU's _own_ `Depends On`
unprompted at activation via `resolveDepStates` + `setMetaBulletFields`. That precedent supplies the own-edge
**rewrite**. What is **new machinery** is the **receipt-discovery read** it needs: a
`{ retiredSubject, dependentSlug }` query answering "does this edge target carry a retirement receipt, and what
was authored for this dependent?" The lifecycle index resolves a retired origin only to
`nonexistent`, and the content-addressed receipt store (`retirement-record-store.ts`, keyed by
subject + transition + source head) cannot answer that dependent-specific subject query today. The adapter enumerates
canonical records in the dependent branch's current committed tree and projects them through the storage-agnostic
query (storage check-doc Principle 2); consumers never receive or infer a receipt path. Evidence on an arbitrary
live or remote branch is not actionable: the receipt introduction commit must be reachable from the dependent's own
branch, which also brings its replacement projection into that history.

The query's closed resolution states are `absent | unique | ambiguous | unmapped-dependent | version-conflict |
namespace-corrupt`. `inventoryRead` is evidence metadata, not a competing resolution state: `unique` and
`unmapped-dependent` carry `unknown | tree-only | reachable | degraded`. An authenticated mapped disposition
remains actionable when its receipt records `degraded` or comes from an exact v1 receipt projected as `unknown`;
`unmapped-dependent` remains a conflict at every evidence quality.

For each dependency edge, the planner follows a unique acyclic chain of reachable `rename` receipts before
deciding the edge's terminal disposition. It preserves every hop's evidence quality and stops only at a live slug
or a non-rename retirement: a live slug receives one final retarget, while a terminal `decompose` or `abandon`
applies that receipt's mapped replace/drop disposition. A missing hop, ambiguity, cycle, version conflict, or
unmapped terminal receipt refuses the whole edge plan; no intermediate retired slug is written.

**Disposition set — one mechanism, per-verb dispositions** derived from the edge-target's receipt:

- `replace` — `decompose`: repoint the edge to the delivering member(s) from `incomingEdges[].replacementTargets`.
  `decompose`'s authored per-dependent `drop` (the other cut-map `incomingEdges` disposition) reconciles like
  `abandoned` below — the edge is dropped and surfaced, with the cut-map's `reason` as the record.
  A valid decompose receipt with no entry for the querying dependent yields `unmapped-dependent`; no
  transform-wide fallback is inferred.
- `abandoned` — `abandon`: drop the edge and surface it, no replacement. `abandon` does zero incoming-edge
  handling today, so this brings it onto the shared mechanism instead of leaving dependents dangling with no
  record.
- `retarget` — `rename`: repoint 1:1 old→new. `rename`'s shared-visible dependents already sweep in-transform;
  its branch-private dependents ride this reconcile.
- `park` needs none — the slug persists, so there is no incoming-edge concern; it inherits area 1's read and
  `reconcile-roadmap` fixes for free.

**Apply ceremonies and triggers — one reconcile, multiple fire points.** The existing `dischargeDepEdges`
mechanism evolves in place into one typed planner/applier, also exposed as the CLI verb
`arc wu reconcile [slug] --json` with an explicit `--apply` mode. Its closed plan has dependency,
tracked-reference, and advisory components: area 1 supplies the dependency component, and area 4 extends that
same plan with current-WU artifact edits and prose/dangling findings. The read-only form reports every component;
`--apply` validates the exact content version of every affected current-WU path before writing, stages only the
plan-declared paths as one bounded batch, and leaves advisory findings untouched. Any stale path refuses before
the first write or stage. No sibling dependency- or reference-reconcile core exists. It applies and commits only
from the dependent's own checkout:

- **`activate` / initial `integrate` entry** — compute and validate the plan before `executeTransition()` mutates
  phase or branch, then carry that exact plan into the ceremony's apply/stage path. Refusal-capable work no longer
  first runs as a post-encoding side effect.
- **`resume`** — preserve the real two-branch ceremony. First land the tracked-base pointer removal; once the
  preserved branch is reattached, invoke the same apply from that WU checkout and land a separate dependent-branch
  `chore(arc):` commit. The spawned arm runs it in the new worktree; `--here` runs it after the deferred checkout.
- **Final `integrate` recheck** — after authoritative base reconciliation and before the stable exact-head
  pre-merge checkpoint, invoke the same apply again. A new repair commits and pushes as a candidate correction,
  invalidating and rebuilding exact-head review evidence; an unavailable replacement or real conflict stops the
  WU unmerged, though it may correctly remain `Integrating`. This extends the integrate workflow's existing
  integration-interlock path, **not** `review-gate-right-sizing`'s merge-guard union.
- **`session-init`** — a **detect-and-surface** point only, never a silent-apply one. It is a non-committing recon
  stage: it flags pending dependency or tracked-reference edits, conflicts, and advisory findings. A precomposed
  `arc wu reconcile --apply --json` remedy may run as its own current-WU review increment or at the next write
  ceremony; session entry never leaves an uncommitted tracked edit to ride unrelated work.

Tracked/committed dependency and reference edits must ride a review increment, which is why `session-init` defers
their apply. Area 4's gitignored per-developer `WU_Target` reconcile (below) carries no commit and no increment: the
`session-init` probe remains read-only, then the workflow may invoke its dedicated lock-serialized disk verb for
an authoritative, unambiguous rename. Owned-and-clean reconciles are invisible at the apply ceremony; a genuine
conflict (an edge changed incompatibly, or an un-enumerated dependent whose target member is ambiguous) surfaces
as a version-checked reconcile.

**Decompose-time advisory.** The composed index already carries each dependent's in-flight state, so a dependent
that is _mid-integration_ with a live edge to the retiring origin is surfaced at the transform's own interlock for
the developer to coordinate — the transform does not silently proceed against it. (`Depends On` is a shrinking
live-blocker list, so a still-present edge to a `Planning` origin is a real blocker, not stale lineage.)

**Backend-forward.** The receipt plus reconcile _is_ what a version-checked store write becomes: today it applies
in the dependent's own git flow; under the materialized backing store it is the store's version-checked write
applied at sync. The same receipt and mapping carry over — no lock-in (storage check-doc Principle 3).

#### 1c. Store — canonical namespace only

The in-repo adapter writes retirement records only under
`.arc/system/.internal/retirement-receipts/`. This is the established internal machinery namespace; a root-level
`.arc/.internal/` has no valid role and is rejected by the retirement-record commit-validation surface.

The repository's existing decompose, rename, and absorbed-stub abandon receipts move byte-for-byte into the
canonical namespace. Their v1 schema, filenames, canonical JSON, and receipt identities remain unchanged. The
pre-public repository has no external installations or compatibility obligation, so readers and validators expose
no legacy-path lane. Any staged path beneath root-level `.arc/.internal/` is invalid.

The digest filename carries no trustworthy subject. Namespace enumeration therefore validates every filename /
digest / canonical-content triple before answering any subject-keyed query. One malformed, unknown-version,
digest-mismatched, symlinked, or otherwise undecodable reachable entry makes the enumeration
`namespace-corrupt` and fails every subject query closed; the adapter does not guess whether the corrupt entry is
related to the requested subject. Mixed valid-plus-corrupt namespaces surface the same global result.

### Area 2 — First-class cohort-less (flat-sibling) split shape

A split into N siblings joined only by authored dependency edges, with no cohort node:

- **Cohort-fit verdict.** Extend `assess-cohort-fit`'s cut-map result with the explicit placement decision:
  `parentPosition`, plus `cohort` only where that position requires one. The discriminator and guard rails still
  decide whether the concern stays one WU or becomes multiple WUs; the placement fields state how an affirmative
  cut is organized.
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
  placement projection (no existing parent; flat siblings). A `cohortless` map also forbids
  `cohort-coordination` entries and `cohort-shared` source ownership: any conserved material must have a
  destination-owned home. A cut with genuinely ownerless shared coordination uses a cohort-backed position.
- **Placement projection.** Resolve the parent-position semantics through one shared pure projection to the
  existing `WorkUnitPlacement` type: cohort-backed positions use their resolved cohort segments, `at-cap` uses
  the origin's existing parent, and `cohortless` uses the already-supported empty cohort coordinate. Both the
  scaffold and retirement preparation/finalization consume this projection; neither derives its own path rules.
- **Scaffold.** `scaffoldCohortMembers` always nests members under a cohort directory today. The `cohortless` arm
  scaffolds the members as **flat planned siblings** (each its own `meta-* + draft-*` skeleton) with **no
  cohort-mint** and **no `cohort-*.md`**. Its canonical meta still carries `Cohort: [none]` as the managed
  no-membership sentinel; its draft omits the cohort header. Inter-sibling order lives in `Depends On` only.
- **Workflow projection.** The CLI-computed placement drives coordination authoring, structural verification, and
  result text. Cohortless skips cohort-document authoring, verifies the flat layout and no-membership projection,
  and describes a flat-sibling split rather than a cohort; workflow prose does not re-derive placement or paths.

Live instance: `roadmap-tooling`'s cohort-fit verdict. This is an adjacent rail to `cohort-cut-coherence` (what a
cohort absorbs on exit) — coordinate, do not fold.

### Area 3 — Husk-consistent, self-healing transform terminal

Make each transform's landed residue re-enter the _same_ evidence-backed teardown planner and stamp-gated sweep the
shipped-WU terminal uses (`src/lib/work-unit/verbs/teardown.ts`,
`src/lib/session-init/stale-worktree-sweep.ts`, and `src/lib/git/worktree-marker.ts`), rather than a manual cleanup
the developer must remember.

**Transform recording is not terminal cleanup.** `decompose --finalize` and `abandon` record their receipt before
the ceremony commit; neither that receipt nor the transformed tracked tree is authoritative yet. They therefore
must not stamp or detach the live worktree, delete refs, or close the per-WU user workspace. Each returns one typed
`RetirementLifecycleResult` containing:

- the subject slug / branch and transition;
- a discriminated authority projection:
  `{ kind: "receipt-backed", receiptId, authorityVersion } |
  { kind: "not-applicable", reason: "extraction" }`;
- independent `branch`, `worktree`, and `userWorkspace` cleanup projections, each
  `not-applicable | pending | completed | blocked`; and
- a successor-readiness projection for decompose.

Extraction uses the same result contract with authority and all retirement-cleanup legs `not-applicable`, while
new-member readiness may still be present. Receipt identity and authority version exist only on the
`receipt-backed` arm; extraction never synthesizes or null-fills them. An interrupted or unmerged transform retains
its worktree and per-WU session context.

**Landed retirement cleanup.** At `session-init`, the protection-aware base is the authority (`origin/<base>` after
refresh under full protection; the local integrating base under partial). Only a committed receipt and transformed
result reachable from that authority may turn a still-branched registered subject into an actionable cleanup
candidate. The session probe remains read-only and offer-driven: it classifies the residue and precomposes
`arc teardown <slug>`; it never deletes automatically.

The cleanup command factors and reuses `runTeardown`'s existing retirement planner, receipt-evidence
revalidation, exact-head / cleanliness checks, remote proof, husk stamping, ref cleanup, and replay behavior. The
command infers receipt-authorized non-shipped mode from authoritative evidence; `--force` remains a compatibility
spelling only and grants no authority. The same plan adds the idempotent per-WU `runUserClose` leg after landing,
distinct from teardown's existing identity-global user-surface reconciliation. A self-targeting worktree still
stamps and detaches through the existing husk path for later physical removal; the stale-worktree sweep continues
to classify and offer that cleanup.

**Successor readiness.** For a finalized decompose allocation, a candidate is a new member whose complete derived
`Depends On` set is empty, including internal cut edges and allocated external dependencies. The transform result
may report the projection before landing, but `session-init` surfaces it as actionable only after both the receipt
and member artifacts are authoritative on the protection-aware base. One candidate receives a CLI-precomposed,
spawn-anchored `arc start <slug>` remedy; multiple candidates are listed without selecting one. Candidates are
never auto-started, and workflow prose does not derive their ordering.

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
- **Stamp a self-healing marker for the deferred move.** Only a valid ARC-owned marker for the renamed worktree may
  gain `renameMovePending`: a closed projection binding the old/new subject identity, renamed branch, exact `HEAD`,
  registered `from` path, and intended `to` path. It is mutually exclusive with `husk`; a terminal husk supersedes
  and clears it. A successful or already-completed move clears it. At `session-init`, the read-only sweep
revalidates marker ownership, branch / `HEAD`, and the live worktree registry, then emits typed argv plus
CLI-precomposed descriptive text for an outside-worktree invocation; structured argv remains executable authority.
It never executes the move
  automatically. This is an operational projection over the shipped marker mechanics, **not** a new lifecycle
  state; `wu-lifecycle-state-model` may later re-vocabulary it without changing the stored facts.

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
more-exposed latent one (its origin branch persists across the whole transform and merge) in one place. The
ordering contract is explicit: the complete intended tracked transition is staged **before** ROADMAP composition.
For lifecycle-executor transitions, `reconcile-roadmap` runs after branch/current-workflow/soft-field writes and
the final meta stage. Direct-retirement drivers split regen from their mutation leg, stage source/result/additional
paths first, render through the existing index-backed `renderRoadmapFromIndexViewResult`, then write/stage ROADMAP
before receipt recording. No renderer may silently fall back to worktree content at this fire point.

The existing prospective composition already lets a staged same-slug record supersede its own current-branch
oracle candidate. Retirement and rename additionally pass the explicitly superseded source `{ slug, branch }`,
because staged absence cannot by itself distinguish a deliberate removal from a missing input. Rename uses the
same advisory `reconcile-roadmap` adapter as the lifecycle executor rather than its verb-local renderer/write.

#### 4b. Reference conservation — split by mechanical 1:1-rewritability

The machine-vs-author boundary is drawn at **mechanical 1:1-rewritability**, and it falls differently per verb
(`rename` is 1:1 old→new; `decompose` is 1:N-then-gone — an origin reference has no single target). By reference
kind:

- **Structured, unambiguous target** (`Depends On`, backticked artifact filenames, cohort member headings):
  machine-swept for `rename` (the existing `sweepRenameReferences` already rewrites backticked `` `<kind>-<slug>.md` ``
  spans, `Depends On`, and cohort member headings); for `decompose`, `Depends On` rides area 1's receipt reconcile.
- **Self-title H1 across every WU artifact + the `--plan` anchor** (the WU's own identity): machine-swept for
  `rename` through a closed self-title registry separate from both `WorkUnitArtifactKindSchema` and the broader
  companion-file relocation matcher. The registry pairs basename prefixes with canonical first-H1 grammars:
  `meta`→`Metadata`, `draft`→`Draft`, `spec`→the canonical brief/outline/detailed `Spec (...)` forms,
  `tasks`→`Task List|Tasks`, `notes`→`Notes`, `research`→`Research`, and `analysis`→`Analysis`. A file qualifies
  only when its basename is `<registered-prefix>-<sourceSlug>.md`; within it, only the first exact identity H1 is
  rewritten, plus the exact `--plan <slug>` resume anchor. The existing meta-title rewrite remains intact. Later
  headings, examples, unknown companions, and unrelated H1s remain content. N/A for `decompose` (origin artifacts
  are removed).
- **Backticked ref to a gone origin artifact** (`decompose`): machine-_detected_ as dangling but **surfaced**, not
  auto-retargeted — there is no single member to point at.
- **Prose / narrative slug mention** (both verbs): **surfaced, never auto-rewritten** — the target is ambiguous
  and common-word slugs invite false positives. This is an advisory reconcile, replacing today's silent-stale.
  False-positive scoping follows the ARC slug alphabet rather than JavaScript word boundaries: a match has no
  adjacent `[a-z0-9-]` character. Exclude spans already handled by the structured sweep, and present the hits as
  an advisory list for the author to act on (never a rewrite).

**Three reconcile loci, one mechanism throughout** (reusing area 1's receipt + surface machinery, split by mode —
mechanical refs reconcile automatically, judgment refs surface):

1. **Tracked lifecycle tiers** (`active/`, `backlog/planned/`, `backlog/provisional/` — the existing
   `isLifecycleTierFile` scope in `rename-reference-sweep.ts`): swept in-transform.
2. **Other WU branches**: the current WU enumerates valid retirement transitions reachable from its own committed
   history through a storage-agnostic query, independently of whether it has a `Depends On` edge to the retired
   subject. It scans its own artifact group for structured and advisory references. A unique acyclic rename chain
   composes old→intermediate transitions to the final target; ambiguous or cyclic history surfaces instead of
   selecting a target. Mechanically rewritable refs join the tracked-reference component of the shared
   `arc wu reconcile` plan; the same per-file version guards and bounded current-WU staging apply whether the WU
   invokes the remedy as a dedicated review increment or through a lifecycle write ceremony. Prose and dangling
   decompose refs remain in the plan's read-only advisory component. No sibling checkout is read as write
   authority or mutated.
3. **User state** carries live cross-WU coordination that does not regen and is gitignored / per-machine. Only
   an exact managed `WU_Target` field in a `USER-INBOX` **Work Unit** entry is mechanically retargetable, preserving
   its optional `(planned|provisional)` suffix. `WORKING-MEMORY` and the current WU's `SESSION-NOTES` are prose /
   advisory scan surfaces; sibling WU workspaces are neither scanned nor mutated. Identity-global discovery trusts
   only rename evidence reachable from the protection-aware base. The `session-init` status probe emits typed
   findings and a precomposed `arc user reconcile-references --apply` action; it never writes. For one authoritative,
   unambiguous rename the workflow may invoke that dedicated verb, which acquires the per-identity notes lock,
   re-reads the selected disk surfaces, and writes atomically. It does not mutate the canonical notes ref or the
   materialized-baseline stamp, so the edit remains truthfully visible as disk-ahead drift until a later
   `arc user save` / `load`. Decompose, ambiguous/cyclic history, and prose mentions only surface. This adds no
   config axis.

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
  invisible to a degraded origin read is never dropped or guessed: it surfaces `unmapped-dependent` on its own next
  touch and fails closed before merge. Proceed-conserving keeps the retryable transform available while preserving
  completeness as repair-or-explicit-conflict; rigor concentrates at irreversible integration.
- **Source-path selection vs. exact semantic agreement for writability (chose exact agreement).** The composed
  winner may come from a ref-qualified source path, while mutation requires the current checkout. Retaining the
  selected semantic record plus the current-tree candidate and comparing their complete normalized payload keeps
  inventory broad without laundering ref provenance into filesystem authority.
- **Recompute prepare-time quality vs. persist preparation v2 (chose persistence).** Prepare and finalize are
  separate invocations, so recomputing at finalize loses what preparation actually observed. A versioned durable
  envelope carries the fact across process restart; exact v1 preparation remains executable without rewriting its
  identity.
- **`integrate`-interlock enforcement vs. an `arc-cleared` merge-guard sub-criterion (chose the interlock).**
  `review-gate-right-sizing`'s readiness check is a deliberately closed `work-unit` / `errand` request union that
  reads only the integrating WU's own products; a cross-receipt edge reconcile has no socket there and would break
  that containment. The integrate workflow's existing integration-interlock is already the sole merge authority
  that surfaces the candidate for approval, so the fail-closed incoming-edge check lands after Step 13's base
  reconcile and before its stable exact-head checkpoint (extending the established path) rather than as a new
  competing gate. A repair restarts exact-head review; a conflict stops unmerged. Any later host-side
  defense-in-depth rides RGRS's existing project-readiness-view product, never a new merge-guard sub-criterion.
- **Operational stamped marker vs. a new lifecycle-state term for the rename-move sweep (chose the marker).**
  `wu-lifecycle-state-model` owns terminal-state vocabulary and is unsettled. Minting a state term now would
  collide with it and risk schema churn when it settles. A derived projection over the shipped husk-stamp mechanics
  delivers the self-heal with zero new vocabulary and lets that WU re-vocabulary later without churn. The
  `renameMovePending` projection is exact-head, registered-path evidence rather than cleanup authority, and is
  mutually exclusive with the terminal `husk` projection.
- **Staged-index render vs. live/remote-ref oracle for ROADMAP regen (chose staged-index).** The live-ref oracle
  is exactly the phantom-row source: it sees a branch mid-retirement. Rendering from the staged tracked-index
  projection is deterministic and reflects the transform's own staged tree — the only correct oracle at regen
  time. The complete transition stages before rendering; a partial-snapshot overlay would duplicate transition
  semantics inside the renderer.
- **System-internal receipt namespace vs. root-level `.arc/.internal/` (chose system-internal).** Retirement
  receipts are tracked adapter machinery, so `.arc/system/.internal/retirement-receipts/` uses an established
  internal namespace without minting a new root category. Readers and writers have one canonical location;
  root-level `.arc/.internal/` is invalid.
- **Ignore unrelated corrupt receipts vs. fail the namespace closed (chose fail-closed).** A digest filename does
  not authenticate a subject, so an undecodable entry cannot safely be classified as unrelated. Global
  `namespace-corrupt` preserves authority integrity; availability returns when the corrupt record is repaired.
- **Nullable extraction receipt fields vs. a discriminated authority projection (chose the projection).**
  Extraction deliberately creates no retirement receipt. A `receipt-backed | not-applicable` union makes that
  absence structural and keeps downstream cleanup consumers from treating `null` as evidence.
- **Reuse an existing artifact registry vs. a dedicated self-title registry (chose dedicated).** The layout enum
  omits valid `research-*` / `analysis-*` companions, while the relocation matcher intentionally admits arbitrary
  companion prefixes. A narrow H1 grammar registry covers identity-bearing titles without widening layout
  semantics or rewriting unknown companion content.
- **Separate dependency/reference commands vs. one current-WU tracked reconcile (chose one operation).** Both
  components trust the current WU's reachable history, require current-checkout ownership, share session/lifecycle
  triggers, and must guard one bounded staged result. Splitting them would duplicate discovery and leave
  reference-only WUs without a canonical apply path. `arc wu reconcile` therefore exposes separate dependency,
  tracked-reference, and advisory components in one result; identity-global gitignored user state remains a
  separate verb because its authority and notes-locking discipline differ.
- **Status-probe mutation vs. a dedicated user-reference apply verb (chose the verb).** User-status and
  `session-init` probes are read-only by contract, while identity-global mutation must lock and re-read. Folding
  the write into the probe would violate that contract; advancing the materialized-baseline stamp after a disk-only
  rewrite would instead hide real unsaved drift. The probe therefore emits typed findings and precomposed argv,
  and the workflow invokes the dedicated verb only for protection-aware-base-authoritative, unambiguous evidence.

## Cross-cutting Considerations

- **Testing.** The load-bearing cases are **linked-worktree**: a cross-worktree dependent (area 1 read), a
  branch-private dependent reconciling at `activate`, both resume arms' dependent-branch second leg, initial and
  final `integrate`, a multi-hop rename ending in a live/decomposed/abandoned terminal, and detected-only at
  `session-init` (area 1 write); a reference-only WU's guarded shared-command apply plus advisory-only result
  (area 4b); unmerged / merged full-protection and direct-base partial-protection retirement cleanup, including
  per-WU workspace retention, exact replay, and one vs. multiple ready successors; a `spawned` rename invoked
  _from the to-be-renamed worktree_ proving the live worktree is not relocated (area 3); and a transform whose
  origin branch still exists at regen proving no phantom row (area 4a). A **confirmation pass** covers the
  parent-position arms
  and non-symmetric shapes that have never run under parallelism (`in-cohort` → sub-cohort, `at-cap` → lateral
  fan-out, `cohortless` → flat planned siblings; `extraction` incl.
  extraction-from-Active, `backlog-stub-source`, `heterogeneous-home`): they consume the same composed lifecycle
  truth and staged-index `reconcile-roadmap` path, so the root-cause fixes cover them structurally, but each cell
  gets an explicit test rather than an assumed-covered claim. The cohortless retirement cases exercise preparation,
  allowed-path
  derivation, destination resolution, and finalization in addition to the scaffold. Follows the three-tier
  structure (unit / integration / e2e); the cross-worktree and regen-timing behaviors are integration/e2e against
  real temporary git repos.
- **Migration / rollout.** The cut-map remains at `DECOMPOSE_SCHEMA_VERSION = 2` unless its additive
  `cohortless` value exposes an implementation-time incompatibility. New retirement receipts use schema v2 because
  the required `inventoryRead` key changes the exact top-level shape and receipt identity; new decompose
  preparations likewise use schema v2 and point at that v2 receipt identity. Exact v1 decoding stays supported for
  the repository's live canonical receipts and any canonical in-flight preparation, which may finalize through its
  unchanged v1 contract. Higher-level discovery projects absent v1 read quality as `unknown`. Every ID derivation,
  teardown/relation reader, result validator, and introduction-history lookup resolves the applicable v1/v2
  identity in the canonical namespace. Existing records move byte-for-byte to that system-internal namespace.
- **Package-project sync.** Framework edits go through `packages/arc-framework/arc/` source and sync to `.arc/`;
  any workflow-prose changes (integrate / session-init detect-and-surface wording) are two-copy per the sync
  discipline.
- **Security / trust boundaries.** The cut-map and receipt decoders are the untrusted-JSON boundary
  (`parseCutMap`, `parseRetirementReceipt`); new enum values and the disposition set extend those closed schemas
  and must keep exact-keys / closed-set validation. Namespace enumeration validates every
  filename/digest/canonical-content triple, rejects symlinked or divergent records, fails all subject queries
  `namespace-corrupt` when any reachable entry cannot authenticate, never exposes paths through the domain query,
  and accepts actionable tracked-reference evidence only from the current WU branch's reachable committed history.
  Unique rename chains compose; ambiguous or cyclic histories do not grant a rewrite. Identity-global user
  mutation instead requires rename evidence reachable from the protection-aware base. Retirement cleanup and
  successor remedies require the receipt / result to be reachable from that same base; pending-move remedies
  additionally require a valid ARC-owned marker whose exact branch, `HEAD`, and paths match the registry.
- **User-facing impact.** The developer stops hitting phantom ROADMAP rows, stale slug references, stranded
  worktrees, and hand-launched successor members; degraded-network transforms proceed instead of hard-refusing.
  Session entry offers evidence-backed retirement cleanup and rename-move remedies without requiring remembered
  force-mode commands. Its probes remain read-only; the one mechanical user-state repair is a separately invoked,
  precomposed apply verb for an authoritative unambiguous rename.
- **Concurrency / user-notes.** The area 4 user-state apply verb mutates an exact managed `USER-INBOX`
  `WU_Target` on gitignored identity-global disk under the user-notes shared-state write discipline
  (`strategy-user-notes-concurrency.md`): lock, re-read, atomic write, no notes-ref or materialized-baseline update.
  `WORKING-MEMORY` and current-WU session notes remain advisory, and sibling WU workspaces remain untouched.
  Area 3's per-WU close is a separate idempotent filesystem leg, deferred until authoritative retirement cleanup
  so an interrupted transform retains its session context.

## Success Criteria

Validated at work-unit completion:

- **SC1 (G1).** A `decompose` / `rename` run whose only dependent lives on a second linked worktree includes that
  dependent in its inventory — reproduced by the `session-locus-model`-class case that `cli-substrate-adoption`
  missed. A degraded (remote-unreachable) read proceeds and records its reachability state in the new receipt
  field rather than refusing, including rename after its composed oracle's refresh fails. Only a complete
  semantically agreeing current-tree candidate grants `writablePath`; a remote-only or divergent transform subject
  refuses before filesystem access.
- **SC2 (G2).** A branch-private dependent's `Depends On` edge is repointed (`replace`/`retarget`) or dropped
  (`abandoned`) by the dependent-pull reconcile at `activate`, the resumed branch's post-pointer ceremony, or
  initial/final `integrate`. A unique acyclic rename chain resolves to its final live slug or terminal
  decompose/abandon disposition without writing an intermediate retired slug. `session-init` detects and surfaces
  the pending reconcile without writing an uncommitted tracked edit; an unenumerated dependent surfaces
  `unmapped-dependent`; and any repair that cannot complete **fails integration** at the interlock rather than
  merging a dangling edge. No transform commits to a branch that is not its own.
- **SC3 (G3).** `assess-cohort-fit` → `decompose` executes a `cohortless` cut end-to-end: `parseCutMap` accepts the
  new `parentPosition` value with `cohort` omitted and rejects cohort coordination/shared ownership; the shared
  placement projection carries flat paths through preparation, scaffold, and finalization; each member meta
  records `Cohort: [none]`, drafts omit the cohort header, and no cohort directory or `cohort-*.md` exists. The
  `roadmap-tooling`-class verdict is expressible.
- **SC4 (G4).** An unmerged retirement receipt grants no cleanup or launch authority. After the receipt and
  transformed artifacts reach the protection-aware base, `session-init` offers ordinary `arc teardown <slug>` for
  the still-branched residue; that command reuses exact receipt / `HEAD` / cleanliness proof, closes the per-WU
  workspace, and enters the existing husk cleanup path without requiring `--force`. Ready members are computed
  from their complete dependency sets and surfaced only after the member artifacts are authoritative; one
  candidate receives a spawn-anchored remedy, while multiple candidates receive no selected action. Extraction
  returns the same lifecycle-result union with authority and cleanup explicitly `not-applicable`, never synthetic
  receipt fields.
- **SC5 (G4, rename).** A `spawned` rename invoked _from the to-be-renamed worktree_ never relocates the live
  worktree; the directory move defers before any git move, stamps the exact `renameMovePending` projection on a
  valid ARC-owned marker, and a subsequent `session-init` surfaces typed outside-worktree argv / guidance. Invalid,
  foreign, or stale projections grant no move remedy; successful / already-completed moves clear the projection.
- **SC6 (G5).** A transform whose origin branch still exists on `origin` at regen time renders **no phantom
  ROADMAP row** — reproduced against the `wu-rename` case and the more-exposed `decompose` deferred-reap case.
  The complete transition is staged before the existing index renderer runs, and an intentionally divergent
  worktree cannot influence its output.
- **SC7 (G6).** A `rename` reconciles every mechanically rewritable reference — `Depends On`, backticked artifact
  filenames, cohort member headings, and the basename-bound first registered self-title H1 (including
  `research-*` and `analysis-*`) plus the `--plan` anchor — in the three lifecycle tiers. A current WU discovers
  reference-only transitions from its own reachable history without requiring a `Depends On` edge, composes a
  unique acyclic rename chain to its final target, and exposes mechanical edits plus ambiguity, cycles, prose, or
  dangling `decompose` origin refs through the shared `arc wu reconcile` result. Its guarded apply validates the
  complete current-WU path set, stages only that bounded set, and never rewrites advisory findings. Slug-token
  matching rejects adjacent `[a-z0-9-]`. Only exact managed `USER-INBOX` Work Unit `WU_Target` fields
  auto-reconcile, preserving `(planned|provisional)`, through the dedicated lock-serialized verb after
  protection-aware-base discovery; the canonical notes ref and materialized baseline remain unchanged so
  disk-ahead drift is visible. `WORKING-MEMORY`, current-WU `SESSION-NOTES`, sibling workspaces, adopter-facing
  content, and `completed/` are never auto-mutated.
- **SC8 (G7).** `abandon` reconciles its dependents via the shared mechanism with the `abandoned` disposition
  (previously zero handling); `park` inherits the read + regen fixes with no incoming-edge work. The confirmation
  pass over the never-run parent-position arms and non-symmetric shapes passes.
- **SC9 (G8).** Every new receipt writes under `.arc/system/.internal/retirement-receipts/`; the repository's
  existing v1 receipts remain canonical and usable after their byte-preserving move, and no reader, writer, or
  validator compatibility lane accepts root-level `.arc/.internal/`. Any undecodable reachable canonical entry
  makes the namespace `namespace-corrupt` and fails every subject query closed.

## Open Questions

Implementation detail, resolved during the work — not a resolve-before-starting design blocker:

- **Harness skills-dir registration staleness on rename** — an adjacent harness-integration residue; confirm it is
  out of ARC-substrate scope (flag-not-absorb) or route it to a harness-integration concern rather than widening
  this WU.
