# Cohort: `approval-flow-refinement`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Purpose:** Refine ARC's approval flow around one question: **what is the unit of approval, and how does
widening or routing it compose across the review, commit, and integration boundaries?** Today ARC conflates the
unit (one leaf = one review checkpoint = one commit = one approval signal), and the rules that touch any one of
those boundaries reach across all of them. The members separate the axes and refine each: `commit-increments`
decouples the _commit_ boundary from the _review_ boundary; `interlock-release-refinement` settles _routing_
("approval is approval; routing follows opt-in + interlock mode"); `unit-scoped-review` widens the _review_
increment to its maximum (the whole work unit) as a first-class, principle-aligned option. The shared concern is
the unit of approval — not a pile of loosely-related interlock tweaks.

---

## Coordination

```text
commit-increments            (decouples review/commit increments; establishes the vocabulary)
  └─> unit-scoped-review     (widens the review increment to WU scope; rests on the decoupling)
interlock-release-refinement (routing: "approval is approval"; parallel-able — coordinates, doesn't gate)
```

`commit-increments` is the substrate member: `unit-scoped-review` carries a hard `Depends On` edge to it (a
WU-scoped run needs per-leaf commits _during_ the batch — exactly `commit-increments`' deferred-review-releases-
commits fix — to keep a clean, bisectable PR history rather than an entangled diff). `interlock-release-refinement`
is parallel-able; it shares machinery with both but gates neither.

### Shared contracts

- **The review-increment / commit-increment vocabulary.** The two orthogonal boundaries (where the agent stops to
  ask vs. where work crystallizes into history) and the term reconsideration around "review increment." Owned by
  **`commit-increments`**. Consumed by **`unit-scoped-review`**, which introduces "review increment = whole WU"
  (the limit of that axis) and must settle its naming jointly — not mint a canonical-but-inconsistent gap.
- **"One approval releases the tail."** A single, wider approval signal arming a sequence of downstream fires
  instead of re-prompting each. Surfaces in **`interlock-release-refinement`** as the _errand_ approval-collapse
  (one increment-approval → commit + push + merge + delete at errand scope) and in **`unit-scoped-review`** as the
  _WU_-scoped batch (one authorization → the whole task list's per-leaf commits, **stopping at validation** — it
  does not collapse the merge; the integration interlock holds). Same concept, two scopes; align the framing.
- **Approval-provenance as first-class state.** The "what approval surface authorized this fire?" state captured
  for evaluation in `commit-increments` § Unknowns and re-surfaced from the wrapper angle in
  `interlock-release-refinement`. `unit-scoped-review`'s batch authorization is a provenance source with WU scope;
  its deviation ledger composes with this. Genuinely cross-member — settle the home at PRD.

### Soft coordination

- **The integration interlock is the cohort's invariant floor.** None of these members relaxes it — merge always
  requires explicit human authorization, never inferred. `unit-scoped-review` relaxes review _frequency_ up to the
  WU boundary and stops there; the errand-collapse is opt-in and self-review-scoped. The floor is what keeps
  "refine the approval flow" from sliding into "remove the approval."
- **Forward-compat with `composable-workflows`.** Express the relevant workflow procedures parametrically (e.g.
  process-task-loop over an increment-scope parameter; the wrapper-routing as a fixed procedure). The members
  define the parameters/contracts; CW owns extracting the loop into fragments — coordinate, don't pre-empt.

### Cross-cohort

- **`compaction-recovery` (`agent-context-optimization`)** — `unit-scoped-review`'s long-run backstop (not a
  blocker). A two-way alignment is open: that draft's blanket anti-long-session framing is likely overcautious
  against an orchestrated, bounded-context batch mode; reconcile rather than work around. Flagged into that draft.
  _Resolved 2026-06-28:_ `compaction-recovery` reframed compaction as first-class re-hydration with long-session
  viability and `session-recover` as the orchestration backstop — the alignment closed in `unit-scoped-review`'s
  favor.
- **`out-of-wu-entry` (`agile-parallelism`)** — owns the explicit-intent entry-signal family (`--errand` /
  `--housekeep` / `--new`, and a discussed `--plan`). `unit-scoped-review`'s "activate in batch mode" request is a
  sibling signal — sequence, don't duplicate.
- **The ADR-002 / P5 reckoning** — `unit-scoped-review` pushes against the bounded-session model and likely
  warrants an ADR (amend ADR-002 or a companion). The decision record's home is the WU; recorded here as the
  cohort's most consequential constitutional seam. _Update 2026-07-02:_ the constitutional layer moved upstream
  to `execution-delegation-doctrine` (below); the reckoning's home follows it, and `unit-scoped-review` applies
  the resulting doctrine at WU scope.
- **`execution-delegation-doctrine` (standalone)** — upstream constitutional substrate minted 2026-07-02: the
  two-half invariant (no judgment without a gate; no gate without a decision), the DEV-RULES.ARC § Sub-agent
  scope rewrite (prohibition → conditions), the ADR-002 two-axis reframe (execution locus × gate presence), and
  the four-flow delegability rubric. All three members consume it: `unit-scoped-review`'s orchestration +
  eligibility become the WU-grain application (upstream edge — land the doctrine before its planning iteration);
  `interlock-release-refinement`'s stacking collapse + provenance gain the principle anchor, and its wrapper
  coverage gap is upgraded to delegation-critical; `commit-increments`' gate-shaping + vocabulary likewise. It
  does **not** gate `interlock-release-refinement` or reorder the cohort; buffer entries in each member's draft
  carry the specifics.

### Closeout criteria

Complete when all three members ship **and** the unit-of-approval model is coherent across the review, commit,
and integration boundaries — the shared vocabulary settled, no boundary's rule still reaching across the others
by default, and the integration-interlock floor intact.

## Members

### `commit-increments`

_Exposes:_ the review-increment / commit-increment vocabulary and the decoupling of the two boundaries; the
deferred-review-releases-commits fix (per-leaf commits during a batch); the signal-triggered commit-bundling
overlay; the candidate first-class approval-provenance state.

_Consumes:_ nothing hard from siblings (the substrate member); composes with `interlock-release-refinement` on
provenance.

### `interlock-release-refinement`

_Exposes:_ the "approval is approval; routing follows opt-in + interlock mode" model — wrapper-routing migration,
the approval-provenance guard, the commit-interlock inclusive-semantic clarification, and the errand
approval-collapse (one increment-approval releases the full errand tail).

_Consumes:_ composes with `commit-increments`' provenance framing; coordinates with `unit-scoped-review`'s
pre-flight config gate (which depends on a non-blocking release path).

### `unit-scoped-review`

_Exposes:_ the graduated review-increment scope (leaf / phase / WU); the break-out matrix + deviation ledger (the
co-development substitute for suspended per-leaf stops); the advisory eligibility predicate; the pre-flight
config gate; the orchestration architecture (judgment in the primary, execution delegated to bounded subagents)
and the DEV-RULES.ARC § Sub-agent scope carve-out it implies.

_Consumes:_ `commit-increments`' commit/review decoupling (hard `Depends On`); `interlock-release-refinement`'s
non-blocking release path + provenance work (coordination); `compaction-recovery` as a cross-cohort backstop.

## ADR anchors

- `adr-002` — session model + agent-compatibility envelope; P5 context-preservation and the bounded-session
  posture `unit-scoped-review` reckons with (and may amend).

---
