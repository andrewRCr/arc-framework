# Draft: review-chunking

- **Origin:** [internal] — surfaced 2026-06-23 during `lifecycle-closeout` planning, reflecting on why ARC's
  work units run broader than the industry small-PR norm and whether that is a coupling artifact rather than a
  deliberate stance.
- **Retitled `pr-decomposition` → `review-chunking`** — executed 2026-07-22 via `wu-rename` (its first real use),
  after the 2026-07-21 cohort-fit cut (§ Decomposition) moved the multi-PR half to `chunked-delivery`. The retained
  scope emits exactly one PR, so "PR decomposition" named the sibling's shape rather than this one's.
- **Purpose:** Make a large but coherent single-concern change **actually reviewable** by carving its review
  surface into bounded, cohesive scopes — **without changing merge topology**. One branch, one PR, merging once;
  only the review surface is decomposed. This is **reviewer-agnostic** — the small-PR doctrine, strongly evidenced
  for human review quality, with **AI review as the acute forcing case** (it cannot navigate a large diff and is
  often a solo developer's only reviewer). Two things are owned here: the **chunk-boundary doctrine** (what makes a
  good review boundary) and **Mode B, the review-only retrofit** (carving an already-built branch). Planned-up-front
  chunking and the merge topology that would let chunks land separately are the sibling `chunked-delivery`'s.
  **Maturing draft under active grooming.** Grounding research lives in `research-review-chunking.md`.

---

## Grooming status (continuity)

> _Updated each `--plan review-chunking` pass — see `draft-design` § Re-synthesize. This is the resume anchor._

- **Readiness:** `maturing` — the frame, core mechanism, and `Class` (Heavy) are settled, and the 2026-07-21 cut
  narrowed the scope to one arm. Open items are detail-design (boundary doctrine, invocation surface, terminology).
  Not yet formalization-ready: the success signal is unstated and the inbound buffer holds one entry.
- **Resolved (through 2026-07-21):**
    - **Goal** = _reviewability of large coherent changes_, **reviewer-agnostic** (human + AI; AI review is the
      acute forcing case, especially for solo developers). Not "emit multiple PRs" as an end.
    - **Chunking ⊥ stacking (the core unlock).** _Review chunking_ — decomposing the review surface into
      bounded-diff units — is the primary mechanism and needs no merge-topology change at all. _Stacking_ is only
      one merge topology, carrying all the flagged fragility; it lives with the sibling.
    - **Mode B is the whole of this work unit's delivery.** Carve an already-built branch's change set into
      bounded review scopes; the work unit still merges once. No re-architecting, no bisectability requirement —
      this is _review_ scoping, not the _merge_-retrofit that the research rejects. Serves the live driving case:
      heavy work units already mid-implementation.
    - **This work unit changes no invariant.** `1 WU = 1 branch = 1 PR` survives intact here — the review surface
      is carved beneath it. The amendment to `≥ 1 PR` belongs to `chunked-delivery`.
    - **Cover letter / reviewer's guide is deferred, out of scope** — a human-_navigation_ aid (it doesn't reduce
      surface, so it doesn't help AI review), and storage-sensitive (it reads `meta` / `spec` / `cohort`, which
      `strategy-storage-evolution` moves to a separate backing store). Coordinate PR-side composition later.
    - Idiom re-examination **ran** (heavy-research, 2026-07-20; `research-review-chunking.md` § Idiom
      re-examination). It corroborates the retrofit conclusion directly: for an already-built coherent change, the
      industry-aligned answer is a **review decomposition**, not a re-split into a mergeable stack.
    - **Class = Heavy** (settled 2026-07-20; re-confirmed at the cut) — composition from mature prior art. The
      extraction removed the invented-feeling assurance algebra along with the topology half, so nothing pulls
      toward `Novel`.
    - **Cohort-fit: cut into two flat siblings** (2026-07-21) — see § Decomposition.
- **Open (developer calls):**
    - **Chunk-boundary doctrine** — the retained core. The field evidence (Inbound Buffer) says cohesion, not line
      budget, predicts review accuracy; that needs authoring into an actual rule a planner or operator can apply.
    - **Terminology** — the review unit needs a name that does **not** imply independent delivery to `main`;
      candidates `slice` / `segment` / `chunk`. This work unit owns the review unit's name; `chunked-delivery`
      reserves `deliverable` / `stack` for its optional ship-to-`main` variant. Settle here first so both read
      together.
    - **Review-scope identity** — how a carved scope is named and addressed at invocation. Today the only bounded
      scoping axis is path-shaped (a directory plus a base ref), which effectively makes a scope one directory;
      the commit-range flag scopes a suffix to HEAD rather than a bounded range.
    - **Invocation surface** — how an operator or agent actually drives a chunked review. Direct seam with
      `review-surface-binding`, which owns where local review verbs live and how an agent drives them without a
      resident orchestrator.
    - **Coverage** — whether the union of review scopes provably covered the whole change set. The Mode B cousin of
      the sibling's terminal aggregation, and much lighter: no merge-consumption proof is needed when nothing
      merges separately.
- **Next:** fold the first-run field evidence (Inbound Buffer) into an authored boundary doctrine; settle
  terminology; then the invocation surface against `review-surface-binding`. State a success signal — currently
  missing, and one of the three readiness criteria. Reconcile the `session-locus-model` seam at planning close.
- **Coordination seams (rechecked 2026-07-21; route at planning close):**
    - `chunked-delivery` (**sibling**, the other half of the cut) — it depends on this work unit for the boundary
      doctrine and the review unit's name. Author them here; never re-author them there.
    - `review-surface-binding` (**coordination**, Planning / Heavy) — owns where local review verbs live and how an
      agent invokes them. That is the surface a chunked review invocation would ride on; settle the seam before
      designing a parallel invocation path.
    - `review-architecture` — **shipped 2026-07-21**. Its integration reshape, Review-Increment Invariant, and
      review-obligation contract are the settled baseline this layers on. No dependency edge recorded: the
      dependency was satisfied before implementation began.
    - `session-locus-model` (**coordination**, Active): no collision on this work unit's core surfaces. One seam
      remains — its `routingLane` / reviewed-lane vocabulary says a work unit's PR is "classified by strictest
      lane, never splits into per-lane PRs"; reconcile with review-scope carving (scope ⊥ lane). The
      `strategy-work-organization` § Single branch seam moved to `chunked-delivery` with the amended invariant.
    - `decomposition-doctrine` — adjacent, born from the same postmortem; it governs when a _concern_ decomposes
      into work units, this one governs how a _review surface_ is carved. Its stack-vs-coupling test overlaps
      `chunked-delivery`'s stack-eligibility test, not this work unit's scope.

---

## Decomposition

> _Recorded 2026-07-21 at an `assess-cohort-fit` re-read during `draft-design`. Retained here as the origin's cut
> record._

**Verdict: cut — two flat siblings, one dependency edge, no cohort node.**

**Discriminator.** The design had matured into arms with **disjoint consumers and disjoint file surfaces**: the
review-only retrofit serves today's integration backlog; up-front chunk planning and merge topology serve future
work units. The cut runs along the axis the design itself asserts — chunking ⊥ merge topology — so splitting here
expresses the design rather than violating it.

**The decisive argument was the invariant under amendment, not orthogonality.** Under today's
`1 WU = 1 branch = 1 PR`, nothing this work unit builds becomes usable until _all_ of it merges; the retrofit
cannot land as an early phase. At a week-plus scope that held the integration backlog behind the whole span. Soft
block rather than hard — the retrofit ran ad hoc once already with no tooling — but at a cost profile worth
designing against.

**Guard rails.** Lower rail clears: the retained half independently trips the derivation trigger (invocation
surface, boundary derivation, coverage). Upper rail clears: the split is not for size — the shared kernel (what
makes a good boundary) is small and largely settled by the field evidence, and it is authored here and consumed by
the sibling. Maturity gate clears for this cut specifically: the two-modes distinction has been stable since
2026-07-20 and was validated by a live run. The finer split of the sibling's own halves was **not** made — it is
unproven, and `chunked-delivery` may recurse at its own grooming.

**Cut-map:**

| Entry              | Kind                             | Scope                                                                 | Deliverable boundary                                                                  |
| ------------------ | -------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `review-chunking`  | surviving-origin (`keep-active`) | chunk-boundary doctrine; Mode B review-only retrofit                  | a chunked review of an already-built change set; no topology change                   |
| `chunked-delivery` | new member                       | Mode A up-front chunk planning; Axis 2 merge topology; assurance core | `1 WU = 1 branch, emitting ≥ 1 PR`, with chunks landing through an integration branch |

**Edge:** `chunked-delivery` → `Depends On: review-chunking` (boundary doctrine and review-unit vocabulary are
authored here, consumed there).

**Executed manually**, not via `arc decompose`. That verb would have tripped three of the five gaps
`cohortless-decomposition` records: it mints a cohort node on every non-at-cap arm (forcing a vacuous one onto a
flat-sibling split), its base-run contract cannot resolve an authoritative origin when a stale base stub coexists
with live active artifacts, and it has no lifecycle-complete terminal. Incoming-edge conservation was checked by
hand across all worktrees — no incoming `Depends On` edges existed. The origin kept its slug at the cut; the retitle to
`review-chunking` executed later — 2026-07-22, via `wu-rename` (its first real use).

**Carried to `chunked-delivery`:** the `notes-*` companion holding the inherited assurance algebra, and inbound
buffer entries for multi-PR review cardinality, adversarial-verify cardinality, and the assurance-group contract —
all multi-PR-shaped. `research-review-chunking.md` stays here and is cited by the sibling.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Fold first-run field evidence into the review-chunking design**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: pr-decomposition`), direct route during the
  decomposition-program grooming session (2026-07-21); captured during `review-architecture` pre-integration
  review (2026-07-21).
- _Observation:_ Mode B (review-only retrofit) ran ad hoc against `review-architecture`'s 307-file / ~24.4k-
  insertion change set. Eight path-scoped passes covered 10,789 lines and produced 37 findings: 12 real,
  7 advisory, 13 false, 5 unresolved. The mechanism works — but its cost profile is specific enough to design
  against rather than rediscover.
- _Observation:_ **chunk cohesion predicts accuracy far better than chunk size.** The smallest, most
  self-contained chunk (372 lines, provider adapters) scored 5 real / 1 false. False positives concentrated in
  chunks that cross-reference other chunks — decisively in the _critical_ band: all three Criticals were false,
  each asserting a symbol undeclared when its declaration sat in a different chunk. Draw boundaries on contract
  cohesion, not line budget; a boundary splitting a declaration from its consumers manufactures high-severity
  noise.
- _Observation:_ a full type check refutes that entire class in seconds — run one before triage and discard
  compile-error claims wholesale (three Criticals became three dismissals at near-zero cost). Excluding test
  directories from the chunk set makes every verification-dimension finding unreliable: a reviewer blind to the
  tests reports proven behavior as unproven.
- _Observation:_ injected review guidance bled into the judgement — the rubric was applied as a specification
  the _code_ must satisfy, producing a finding that a baseline constant lacked a dimension actually contributed
  by a separate augmentation layer. Guidance injection and code criteria need to read as distinct to the
  reviewer.
- _Approach:_ the only bounded scoping axis available today is path-shaped (a directory plus a base ref); the
  commit-range flag scopes a suffix to HEAD, not a bounded range, so a chunk is effectively one directory.
  Provider rate limiting (five reviews per hour) is a real planning constraint on chunk count. Weigh whether
  the design should emit chunk boundaries a reviewer invocation can consume directly, rather than leaving
  operators to approximate them with directory paths.
- _Observation:_ the run corroborates the research's retrofit conclusion — a review decomposition with no
  merge-topology change. One branch, one PR, merging once; only the review surface was carved. No stacking, no
  integration branch, nothing rewritten.

---

## Problem / Motivation

**The live driving case.** Several `Heavy` work units are mid-implementation right now that, for good reason, did
**not** decompose into sibling work units — each is correctly one concern. But by size alone they will be hard to
review meaningfully when they reach integration. The concrete hope motivating this work: let those units reach
integration and become **reviewable at that point** — an **integration-time retrofit**. The work-unit / decompose /
cohort model works well for _logical grouping_; the gap is narrow — that logical grouping **sometimes** (not
always) emits a review surface too large to review well.

ARC welds two separable boundaries together: the _concern_ boundary (the work unit — correctly broad for one
uniform concern) and the _review_ boundary (currently forced to equal it). The instinct that groups work into a
broad work unit is right; only the review surface it emits is sometimes too large.

The cost shows up on cross-cutting work. `lifecycle-closeout` is the trigger case: one work unit bundling a
~20-file two-mirror doc sweep, several code-wiring legs, a new ceremony, a CLI removal, and a terminal audit. By
ARC's own criteria it is correctly _one concern_ — but it lands as _one large diff_ at integration, and review
quality degrades with diff size. The research is strong on this for **review thoroughness / defect detection** (not
merge speed), and the degradation applies to AI review as much as human, since attention dilutes across a large
diff.

**Why the mechanism is chunking and not splitting.** Smaller review surface is the small-PR doctrine, and **AI
review is the acute forcing case**: a large diff can't be navigated, only diluted, and adding supporting docs
_increases_ surface — so the only thing that helps is _less surface per invocation_. Crucially, that needs no
merge-topology change at all, which is what makes the retrofit tractable for work already built.

## Proposed direction

**Three nested levels (concern / review / impl):**

- **Work unit = the concern unit** — planning, ownership, the spec. Unchanged. This draft does **not** narrow work
  units or push toward more sibling decomposition (that is `decompose` / `assess-cohort-fit`'s separate question,
  and `decomposition-doctrine`'s).
- **Chunk = the review unit** — a bounded, cohesive slice of a change set reviewed in isolation. The new level this
  work introduces. It is **not** a merge unit here; whether a chunk can also be an independent merge unit is
  `chunked-delivery`'s question.
- **Phase = the impl increment** — unchanged from today's task-list model.

**Mode B — review-only retrofit.** Carve an already-built branch's change set into bounded review scopes and run
one review invocation per scope; the work unit still merges once as a single PR. No re-architecting and no
bisectability requirement. This is _review_ scoping, not the _merge_-retrofit (re-splitting into independently
mergeable parts) that industry rejects — Google's guidance for an unavoidably large change is advance reviewer
consent plus heightened scrutiny, not a re-split; the kernel decomposes up front rather than retroactively.

**Boundary doctrine.** Boundaries are drawn on **contract cohesion**, not line budget — the retained core, to be
authored from the field evidence in the Inbound Buffer. A boundary that separates a declaration from its consumers
manufactures high-severity false findings; a self-contained scope reviews accurately even when it is not the
smallest.

**Deferred — the cover letter / reviewer's guide.** A human-navigation aid rather than a surface reducer, and
storage-sensitive. Out of scope; coordinate later.

## Alternatives (open)

- **Terminology:** the review unit needs a name that does **not** imply independent delivery to `main`. Candidates
  — `slice`, `segment`, `chunk`. `deliverable` / `stack` are reserved for `chunked-delivery`'s optional
  ship-to-`main` variant. Settle here; the sibling follows.
- **Where boundaries come from in the retrofit case:** derived mechanically from the change set (module or
  contract clustering) versus authored by the operator per run, with the tooling only enforcing them. The field
  evidence constrains this — path-shaped scoping is the only bounded axis available today — but does not settle it.

## Unknowns and Assumptions

- **Invocation surface** — how a chunked review is actually driven, and whether it belongs to the review verbs
  `review-surface-binding` is designing rather than to a new surface here. Settle the seam before designing.
- **Coverage** — whether and how to prove the union of review scopes covered the whole change set. Much lighter
  than the sibling's terminal aggregation: nothing merges separately, so there is no unreviewed-delta risk at a
  merge boundary — only a gap-in-coverage risk within one diff.
- **Boundary derivation** — can contract cohesion be computed, or is it a judgment the planner records? Mechanical
  derivation would also answer how boundaries survive a branch that keeps moving during review.
- **Success signal** — not yet stated. A concrete observable is needed before this can formalize; the field
  evidence offers candidates (false-positive rate per scope, critical-band precision) but none has been chosen.
- **Class:** **Heavy**, re-confirmed at the 2026-07-21 cut. Composition from mature prior art; the invented-feeling
  assurance algebra left with the topology half.
- **Relationships:** standalone (`Cohort: [none]`, `Depends On: [none]`). `review-architecture` shipped before
  implementation began, so its contract is a baseline rather than a recorded edge. `chunked-delivery` depends on
  this work unit. Likely coordinations — `review-surface-binding` (invocation surface), `session-locus-model`
  (lane-vs-scope coherence), `decomposition-doctrine` (adjacent axis).

## Scope Estimate

**Medium.** Narrowed by the 2026-07-21 cut from the original week-plus estimate: the task-list model, spec form,
integration ceremony, merge-topology mechanic, assurance core, and config axis all moved to `chunked-delivery`.
What remains is the boundary doctrine (a methodology surface), the review-scope invocation path (coordinated with
`review-surface-binding` rather than built twice), and a coverage check — across both the package source and the
project instance. Sequencing depends on the terminology call and the `review-surface-binding` seam.
