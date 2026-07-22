# Draft: chunked-delivery — plan the review surface up front and give chunks a merge home

- **Origin:** [internal] — extracted from `pr-decomposition` on 2026-07-21 at its `assess-cohort-fit` re-read,
  which returned a two-member cut (flat siblings + one dependency edge, no cohort node). The origin retains the
  chunk-boundary doctrine and the review-only retrofit; this member takes the up-front planning half and the merge
  topology. The cut-map and its rationale are recorded in `draft-pr-decomposition.md` § Decomposition.
- **Purpose:** Make a work unit able to **plan** its review surface during task generation and **land** the
  resulting chunks through a merge topology that keeps `main` coherent. Two halves, both deferred out of the
  origin because their consumers are future work units rather than today's integration backlog: **(A) up-front
  chunk planning** at `generate-tasks` — chunk boundaries authored into the task list, spec-time element → chunk
  mapping, per-chunk PR descriptions; and **(Axis 2) merge topology** — chunk-PRs targeting a WU-scoped
  integration branch by default (WU → `main` once), with an optional bottom-up stack to `main` for genuinely
  bisectable work. Carries the **assurance core**: the terminal-aggregation + tree-exact membership proof that the
  WU → `main` merge equals the sum of reviewed chunks with no unreviewed delta. This is the member that lands the
  amended invariant `1 WU = 1 branch, emitting ≥ 1 PR`.
- **Seeded by extraction, not groomed.** The material below carried from the origin's draft at the cut. It needs a
  `--plan chunked-delivery` pass before formalization.

---

## Grooming status (continuity)

> _Updated each `--plan chunked-delivery` pass — see `draft-design` § Re-synthesize. This is the resume anchor._

- **Readiness:** `rough` — the direction is inherited and stable, but no design has been authored under this
  slug. The open items below are genuine forks, not detail.
- **Resolved (inherited from the origin, through 2026-07-21):**
    - **Chunking ⊥ stacking.** Review chunking is the primary mechanism and belongs to the origin; _stacking_ is
      only one **merge topology** and carries all the flagged fragility (not GA-native, tool-lock, rebase cascade,
      squash-identity, ~3–4 depth ceiling). This member owns topology; it must never re-couple the two.
    - **Default topology = WU-scoped integration branch.** Chunk-PRs target a WU integration branch, not `main`;
      each PR's diff is just its chunk; the chunks accumulate; the **WU integrates to `main` once**. No per-chunk
      green-on-`main`, no rebase cascade against `main`, no squash-identity breakage — intermediate states never
      touch `main`.
    - **Optional topology = stack to `main`.** Opt-in for genuinely bisectable work that wants incremental
      landing, gated by the stack-eligibility test, a depth cap (~3–4), tool-neutrality, and squash-merge
      awareness. The flagged stacking costs apply only here.
    - **Assurance: core in, coalescing out.** The _core_ (terminal aggregation + membership / tree-exact proof) is
      likely v1-needed — the WU → `main` merge must prove it equals the sum of reviewed chunks. The elaborate
      group / seam / series **coalescing** machinery stays **provisional v2** (someday/maybe, not committed). The
      2026-07-20 idiom research corroborated the commit-identity / tree-exact core specifically: squash and rebase
      merge genuinely break cross-stack commit identity, so that part is validated rather than over-engineered.
      Full verbatim algebra preserved in `notes-chunked-delivery.md`.
    - **gh-stack is the forward-compat north star.** GitHub-native stacked PRs (private preview, 2026-04-13,
      waitlist-gated): chain-of-PRs model, native stack-map UI with focused per-layer diffs, branch protection
      evaluated against the _final_ target, and atomic merge-down — merging any PR merges it and every unmerged PR
      below in one operation, which is this member's terminal-aggregation semantics on native rails. At GA it may
      subsume the custom integration-branch mechanic. Posture: never design against the preview API; keep chunk
      identity/order data in ARC artifacts with topology as a projection; keep the orchestration verb thin so it
      can later drive `gh stack init/add/submit`.
    - **Chunk refs carry no ARC state.** The append-only rule protects SHA-keyed user notes on _pushed_ branches;
      host-tool stacking rebases rewrite chunk branches by design. Reconcile by construction: chunk/review refs are
      disposable projections — no notes anchoring, no meta state, no lifecycle records — while ARC state anchors
      only to the WU branch / integration ref, which merges append-only.
    - **Class = Heavy.** Composition from mature prior art (integration branch, kernel patch-series, small-PR
      doctrine); the invented-feeling assurance algebra is deferred to provisional v2. Confirm at grooming.
- **Open (developer calls):**
    - **Task-list chunk-annotation shape** — (A) thin orthogonal `Chunk: N` tag on phases, consecutive phases
      sharing a tag forming one review chunk _(lean — same decouple move as the feature itself, and an added
      `Land: stack | integration` marker can carry topology per chunk)_; (B) `Phase 3A / 3B` renaming above the
      phase; (C) a `Subphase 3A / 3B` level above the parent task. Default assumption either way: **phase =
      chunk**, barring the always-present verification phase.
    - **Merge-orchestration surface** — what drives the integration-branch mechanic: an `arc` verb that opens the
      WU integration branch, targets chunk-PRs at it, and performs the single WU → `main` integration, versus
      leaning on host tooling. How does it compose with `integrate-work-unit` and `integration-lane`'s exclusive
      window? The heaviest open item.
    - **Config posture** — ARC default-**on** with a project-level opt-out toggle _(lean)_ vs. opt-in. Weaker risk
      now that the default topology is the low-cost integration-branch mechanic rather than fragile stacking.
      Toggle existence + placement weighs `principle-anchored-core` / `scalable-core` and the configuration cohort.
      Recorded as an open question in the release-gates posture, to confirm at this grooming.
    - **PR-surface naming** — the group key is the work-unit slug (the deliverable / branch name, already public in
      `feat/<slug>` and legible without ARC context — not a planning-ID leak), lean `<slug> [n/N]: <chunk title>`.
      Grouping _identity_ rides structure (base branch plus a label), never title parsing — titles are a
      list-scanning courtesy, disposable once native stack UI exists. The work-unit → `main` PR keeps the canonical
      conventional title (the cover-letter / `[0/N]` slot). `[n/N]` drift under up-front planning (kernel-style
      series re-versioning vs. bare `[n]`) settles with the terminology call below.
    - **Ship-variant terminology** — the origin owns the review unit's name; this member owns the name for the
      optional ship-to-`main` variant (`deliverable` / `stack` reserved for it). Settle after the origin's call so
      the two read together.
    - **Assurance-core minimum** — the slim terminal-aggregation + membership / tree-exact proof actually needed
      for v1, specified as a mechanism rather than a scope boundary.
    - **Mechanical stack-eligibility** — can "leaves the tree green + semantically consistent" be derived
      automatically? Build-green is checkable; semantic consistency is the hard half. Gates only whether a chunk
      _may_ stack to `main`.
    - **Spec-time structure** — does the spec form need a design-element → chunk mapping so a chunk-PR description
      generator can scope one chunk? Lighter now that cover-letter composition is deferred; the minimum is that
      `generate-tasks` can derive chunk boundaries and per-chunk descriptions from the task list.
- **Next:** first `--plan` pass — settle the annotation shape and the orchestration surface together (they
  co-determine each other), then config posture, then the assurance-core minimum. Drain the inbound buffer against
  the shipped review-obligation contract.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Coordinate multi-PR review cardinality with the reviewed-lane gate contract**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); captured during
  `reviewed-lane-review-gate` task-generation reviewability assessment. Carried from `pr-decomposition` at the
  2026-07-21 cut — the concern is explicitly multi-PR, so it follows the topology half.
- _Concern:_ each deliverable can reuse the proven per-change-request review contract, but stack-level review
  cardinality and usage policy remain unsettled. More PRs must not automatically multiply expensive review passes.
- _Approach:_ settle which deliverables auto-admit versus wait for checkpoints, where independent/adversarial
  review runs, and how findings and approvals compose without one PR erasing another's evidence. Preserve each
  deliverable's truthful `merge-ok` while keeping WU-terminal aggregation outside `ReviewCore`. `review-architecture`
  shipped 2026-07-21, so its settled, topology-neutral review-obligation contract is now a readable input rather
  than a projected one — consume it rather than duplicating the decision.

### `[ ]` **Coordinate adversarial verify cardinality and partition criteria**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-03); captured during `adversarial-review`
  create-spec. Carried from `pr-decomposition` at the 2026-07-21 cut.
- _Concern:_ `adversarial-review` wires an adversarial pass at `verify-work-unit`; this work unit owns whether that
  verify runs once at the terminal deliverable or per deliverable in a multi-PR work unit. It also owns the
  distinction between work-unit/cohort orthogonality and PR-stack bisectability: the same seam can be "do not cut
  here" for PRs but "cover carefully" for review.
- _Fold-in:_ decide terminal-vs-per-deliverable adversarial verify and integrate the
  orthogonality-vs-bisectability distinction into this work unit's partition/coherency pass.

### `[x]` **Carry the assurance-group contract into PR decomposition (own the full seam algebra)**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-19); captured during `review-architecture`
  draft-design joint reconciliation (2026-07-18), then re-scoped at its `create-spec` re-examination (2026-07-19).
  Carried from `pr-decomposition` at the 2026-07-21 cut with its disposition intact.
- _Concern:_ `review-architecture` judged the full multi-PR assurance-group / seam / series-membership algebra
  overengineered _for that work unit_ and ahead of the delivery shape it depended on, so it extracted the algebra
  and routed it onward as inherited input. It retains only the single-deliverable obligation contract, the
  no-weakening principle, and the per-requirement projection seam.
- _Disposition:_ **Accepted as inherited input — consume-not-adopt.** Settle v1 delivery mechanics and the simplest
  industry-aligned reviewability mechanism first, then measure the algebra against that v1. If a simpler solution
  meets v1 needs, park the full algebra as a durable **provisional v2** — preserving its provenance — rather than
  adopting it wholesale or discarding it. The verbatim algebra stays in `notes-chunked-delivery.md` until that call
  is made.

---

## Problem / Motivation

ARC welds two separable boundaries together: the _concern_ boundary (the work unit — correctly broad for one
uniform concern) and the _review / merge_ boundary (the PR — currently forced to equal the work unit). Industry
separates them: one concern ships as many small, individually-reviewable parts, planned up front.

The origin work unit narrows that gap for changes that are **already built** — carving an existing branch's review
surface without touching merge topology. This member closes the other half: letting a work unit decide its chunk
boundaries **during planning**, and giving those chunks somewhere to land that keeps `main` coherent.

Both mature precedents decompose up front — Google's splitting strategies plus its implementation-plan grid where
"each cell is its own standalone CL", and the Linux kernel's patch-series with its hard bisectability rule (every
intermediate state must build and run, which implies expand → migrate → contract ordering that must be _planned_).
So the chunk boundary belongs where ARC already decomposes: `generate-tasks`. Grounding research is captured in
`research-pr-decomposition.md` (retained by the origin).

The cost of the coupling shows up on cross-cutting work units — `lifecycle-closeout` is the trigger case: one work
unit bundling a ~20-file two-mirror doc sweep, several code-wiring legs, a new ceremony, a CLI removal, and a
terminal audit. By ARC's own criteria it is correctly _one concern_, but it lands as _one large diff_ at
integration.

## Proposed direction

**Three nested levels (concern / review / impl)** — inherited framing, unchanged:

- **Work unit = the concern unit.** Planning, ownership, the spec. Unchanged by this work.
- **Chunk = the review unit.** Defined by the origin; consumed here.
- **Phase = the impl increment.** Unchanged from today's task-list model; the natural source of chunk boundaries.

**(A) Up-front chunk planning.** Plan the change into ordered chunks at `generate-tasks`; each becomes a
bounded-diff PR. Touches `generate-tasks`, the task-list strategy and template (chunk tagging), and the spec form
(element → chunk mapping, if the open item resolves that way).

**(Axis 2) Merge topology.** Where chunk-PRs merge, independent of how the review surface is chunked:

- **Default — WU-scoped integration branch.** Chunk-PRs target a work-unit integration branch, not `main`; the
  chunks accumulate; the work unit integrates to `main` once. Dovetails with `integration-lane`'s
  single-exclusive-window model. The WU → `main` merge is the sum of already-reviewed chunks — exactly what the
  assurance core's terminal aggregation proves.
- **Optional — stack to `main`.** Chunk-PRs stack bottom-up to `main` for work that wants incremental landing.

**Stack-eligibility test** (gates only the optional stack variant, never chunking): a chunk can land independently
to `main` iff it leaves the tree **green + semantically consistent** on its own.

- **Additive / layered / vertical** work → stack-eligible (most feature work; the additive parts of a mixed unit).
- **Atomic consistency sweep with no consistency-preserving intermediate** → not stack-eligible; it still _chunks_
  for review, it just merges once. A doc verb-rename is the clean example: no "both names coexist" intermediate, so
  it cannot land half-renamed on `main` — but its review surface can still be carved into tractable pieces.
- **Mixed work unit** → chunk for review throughout; land the additive legs as an optional stack and the atomic
  core as one merge, with the **audit as the terminal review chunk** (it sees the whole).

**Amended invariant.** This member lands `1 WU = 1 branch, emitting ≥ 1 PR`, rewriting `strategy-work-organization`
§ Single branch per work unit and touching the integration ceremony (`integrate-work-unit`), `generate-tasks`, the
task-list strategy and template, the spec form, and `assess-cohort-fit` (whose cohort / stack / delivery framing —
"delivers as a stack of WUs along natural deliverable/phase boundaries" — needs a coherency pass once the invariant
lands). Deep change; an enhancement, not a bug-fix.

**Deferred — the cover letter / reviewer's guide.** Composing `meta` / `spec` / `cohort` into a PR-side guide is a
human-_navigation_ aid, not a surface reducer (so it does not help AI review), and it is storage-sensitive
(`strategy-storage-evolution` moves those artifacts to a separate backing store). Out of scope here; coordinate
later.

## Unknowns and Assumptions

- **Orchestration surface cost** — the integration-branch mechanic is lower-fragility than stacking, but it is a
  new orchestration surface. Whether it warrants its own verb or can ride existing host tooling is unsettled.
- **Composition with the exclusive merge window** — a work unit that integrates once composes cleanly with
  `integration-lane`'s single exclusive window; chunk-PRs targeting the integration branch should not consume that
  window, but this needs confirming against that work unit's design.
- **Class expectation:** Heavy. Confirm via `classify-work-unit` at grooming — the extraction removed the
  retrofit half, so the estimate should be re-read rather than inherited unexamined.
- **Relationships:** `Depends On: pr-decomposition` (the chunk-boundary doctrine and review-unit vocabulary are
  authored there and consumed here).

## Coordination

- **`pr-decomposition`** — the sibling this was cut from; owns the chunk-boundary cohesion doctrine, the review
  unit's name, and the review-only retrofit. Keep chunking and merge topology decoupled across the seam; consume
  the doctrine, never re-author it.
- **`decomposition-doctrine`** — its stated scope includes codifying "the stack-vs-coupling test", and the
  stack-eligibility test above is the same subject matter. **Settle ownership explicitly at grooming** rather than
  letting both work units author a test. Adjacent but distinct: that work unit governs when a _concern_ decomposes
  into work units; this one governs when a _chunk_ may land independently.
- **`session-locus-model`** — two seams: both edit `strategy-work-organization` (likely different sections —
  coordinate), and its `routingLane` / reviewed-lane vocabulary says a work unit's PR is "classified by strictest
  lane, never splits into per-lane PRs", which must be reconciled with chunk-splitting (chunk ⊥ lane).
- **`integration-lane`** — chunk-PRs versus the final-integration window.
- **`review-architecture`** — shipped 2026-07-21. Its integration reshape, Review-Increment Invariant, and
  review-obligation contract are the baseline this layers on (sequential layering, not a concurrent collision).
- **`strategy-storage-evolution` / `arc-backend`** — the deferred cover-letter composition reads artifacts those
  move to a separate backing store.
- **`principle-anchored-core` / `scalable-core` and the configuration cohort** — the config-posture toggle's
  existence and placement.
- **`assess-cohort-fit` has multiple pending editors** — sequence the method edits at each work unit's grooming
  close so one surface doesn't churn several ways. This work unit's edit is the delivery-framing coherency pass.

## Scope Estimate

**Large** (week+). Spans methodology (the amended invariant plus a new rules / strategy section), the task-list
model (`generate-tasks`, task-list strategy and template — chunk tagging), the spec form, the integration ceremony
(the integration-branch mechanic and the single WU → `main` merge), the slim assurance core, and a config axis —
across both the package source and the project instance. The elaborate assurance-group algebra is out of v1 (parked
provisional v2) and the cover-letter composition is deferred, which bounds the surface.
