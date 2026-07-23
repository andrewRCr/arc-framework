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

- **Readiness:** `formalization-ready` — three adversarial passes converged (pass 3: PASS, only minor coherence
  residue, folded). All settle-able design settled, the success signal is stated, the inbound buffer is drained, and
  the `review-surface-binding` seam is composed and captured. Crossing into `create-spec`.
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
    - **Terminology: `chunk` = the review unit** (settled 2026-07-22, rationale corrected pass 2). A
      contract-cohesive slice of a change set reviewed in one pass — a **review** boundary. The minted noun is
      review-only _by definition_ (delivery-neutral as defined, not inherited from existing usage). Chosen over
      `slice` (carries the vertical-slice _delivery_ connotation — the shape ARC ascribes to the WU) and `segment`
      (spent on cohort-path structure); the case for `chunk` rests on that absence of a fixed delivery idiom plus
      harmonizing both WU names, not on its existing verb (which the cascade below shows is itself mixed). **Reserved
      seam** for `chunked-delivery`: `deliverable` ⊂ `chunk` (a chunk given an independent **merge** boundary) and
      `stack` = a dependency-ordering over a _set_ of deliverables (a topology, not a unit) — the sibling finalizes
      these; this WU binds only `chunk` and the seam shape. **Cascade (ship with this WU) — a controlled-vocabulary
      reconcile, not a file list:** `chunk` is a load-bearing term, so reconcile _every_ generic "chunk of work" /
      "bounded chunk of autonomous execution" partitive — both the **Work Unit** noun and the **review-increment**
      gloss — wherever it occurs across the constitution (`adr-001`), rules (`DEV-RULES.ARC`), briefs, ADRs,
      strategies, workflows, and `PROJECT-PRD`, in **both** the package source and the project instance. The
      authoritative locus set is a grep at spec / implementation time, not a hand list (which mis-files and omits).
      Also reconcile the existing "**chunk** a routing sweep into multiple same-lane PRs" usage
      (`strategy-work-organization`, `drain-inbox`) — a _delivery_ split, not the review-only `chunk`.
    - **Boundary doctrine + derivation** (settled 2026-07-22) — see § Boundary doctrine. Core rule: a chunk is
      **closed under declaration→consumer** for every symbol it references (cohesion, not line budget). Derivation is
      a tiered seed → judgment → guard model that names existing tools (commit structure + module tree; full
      type-check + LSP find-references) and builds no clustering engine — keeping this `Heavy`, not `Novel`. Test
      cohesion: behavior rides with its tests. The mechanical guard is code-specific; for prose/doc change sets the
      closure _principle_ holds but the guard degrades to judgment. A chunk is an agent-curated file/hunk set applied
      by judgment today (see Invocation, below), so the doctrine is usable now, not gated on tooling.
    - **Invocation: agent-applicable today; local-only mechanism; ergonomic automation is a bounded RSB add**
      (settled 2026-07-22, refined pass 2). A chunk is an agent-curated file/hunk set reviewed by a **local**
      reviewer (agent or CLI) — a hosted PR review is whole-PR and can't be scoped without splitting the PR
      (`chunked-delivery`'s topology change), so bounded chunking is local by construction. The doctrine is usable
      now (the field run is the _motivating failure_, not a demo). The automated path — per-chunk scoping + an
      external-symbol annotation channel — is a candidate add `review-surface-binding` will size (a curated hunk
      subset needs new source-semantics + target-identity beyond its whole-range `local prepare`, the same
      target-algebra family as its Non-Goal 64), captured to USER-INBOX; not a hard dependency.
    - **Coverage** (settled 2026-07-22) — a completeness guard in the doctrine's guard tier, not a proof:
      `change-set − ⋃chunks = ∅` from `git diff`. An uncovered hunk is only unreviewed (nothing merges separately),
      so it is reported, never gated.
    - **Success signal** (settled 2026-07-22, refined pass 2) — a **paired comparison, one reviewer, comparable
      granularity**: closure-respecting boundaries yield materially fewer declaration-split false Criticals (raw
      pre-triage) than naive path-scoped boundaries on the same change set (baseline: the field run's 3/3). Same
      reviewer + comparable granularity defeat reviewer-identity and one-big-chunk gaming. Doc analog: zero false
      dangling-reference findings from cross-chunk definition splits. Measured on first application as directional
      evidence. See § Boundary doctrine.
    - **Holistic coherence** (settled 2026-07-22, pass-2 grooming) — whole-concern coherence is reviewed at the
      design/spec layer (the spec is the cover-letter analog), plus a dedicated **seam chunk** for cross-chunk
      contracts. Closure prevents _false_ findings; the seam chunk prevents _missed_ cross-chunk findings; tests
      carry holistic correctness. Chunking + a seam pass is not weaker than a diluted whole-diff read.
    - **Forward-compat (procedure substrate)** (settled 2026-07-22) — see § Forward-compat & seams. Judgment stays
      prose (eval-gated via `workflow-eval-harness`); the deterministic checks are verb-gaps whose home is compiled
      `arc review` verbs (captured to `review-surface-binding`), agent-run in the interim; no agent-interpreted
      control flow. `chunk` is a Principle-7 controlled-vocabulary term (the cascade).
- **Open (developer calls):** [none] — all settle-able decisions are settled; the invocation concrete-path and the
  `session-locus-model` reconcile are seam-deferred (other WUs'), not open items here.
- **Next:** captured and advanced to `create-spec` — a fresh session resumes there off the handoff. Reconcile the
  `session-locus-model` seam and route the doctrine + `chunk` to `chunked-delivery` at planning close; the
  `review-surface-binding` chunk-scope ask is captured (USER-INBOX).
- **Coordination seams (rechecked 2026-07-21; route at planning close):**
    - `chunked-delivery` (**sibling**, the other half of the cut) — depends on this WU for the boundary doctrine and
      the review-unit name (now `chunk`, settled 2026-07-22). Reserved seam: `deliverable` ⊂ `chunk` (a chunk given a
      merge boundary), `stack` = a dependency-ordering over a set of deliverables (not a unit). Author the doctrine
      and `chunk` here; the sibling finalizes the merge layer, never re-authoring these.
    - `review-surface-binding` (**coordination**, Planning — spec mostly settled) — owns the local `arc review`
      verbs. Our chunk-scope + annotation is a candidate add RSB will size: a curated hunk subset needs new
      source-semantics + target-identity beyond its whole-range `local prepare` (D4) / `git-object-range` source
      (D5), the same target-algebra family its Non-Goal 64 fences off (that Non-Goal still cross-refs the old
      `pr-decomposition` slug — flag when routing). Orthogonal to the evidence-grade tier `review-gate-right-sizing`
      is shedding. Captured to USER-INBOX (`WU_Target: review-surface-binding`); no parallel path built here.
    - `composable-workflows` / `workflow-eval-harness` (**forward-compat**, conform not scope-add) — a chunked-review
      procedure rides the compiled agenda model; the boundary-drawing judgment is a candidate eval. See
      § Forward-compat & seams.
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
  work introduces. It is **not** a merge unit here (whether a chunk can also be an independent merge unit is
  `chunked-delivery`'s question), and it is distinct from the **review increment**: a chunk is an integration-time
  review _scope_, the review increment is the execution-time approval act on a leaf task.
- **Phase = the impl increment** — unchanged from today's task-list model.

**Mode B — review-only retrofit.** Carve an already-built branch's change set into bounded review scopes and run
one review invocation per scope; the work unit still merges once as a single PR. No re-architecting and no
bisectability requirement. This is _review_ scoping, not the _merge_-retrofit (re-splitting into independently
mergeable parts) that industry rejects — Google's guidance for an unavoidably large change is advance reviewer
consent plus heightened scrutiny, not a re-split; the kernel decomposes up front rather than retroactively.

**Boundary doctrine.** Boundaries are drawn on **contract cohesion**, not line budget — the retained core. The full
rule and its derivation model are in § Boundary doctrine; in short, a chunk must be _closed under
declaration→consumer_ for every symbol it references, drawn by judgment but bracketed by a cheap seed (commit
structure + module tree) and a cheap guard (type-check + find-references).

**Deferred — the cover letter / reviewer's guide.** A human-navigation aid rather than a surface reducer, and
storage-sensitive. Out of scope; coordinate later. Its _holistic-frame_ role is already covered — ARC's spec is the
cover-letter analog (§ Boundary doctrine, Holistic coherence) — so deferring the PR-side artifact loses no
whole-concern review.

## Boundary doctrine

> _The retained core — a methodology surface (an ARC method this WU owns), consumed by `chunked-delivery`. Authored
> from the first-run field evidence in `research-review-chunking.md`._

**Core rule — declaration→consumer closure.** A chunk is well-formed when it is _closed under the
declaration→consumer relation for every referenced symbol whose declaration lives in the change set_ (public
contracts and internal helpers alike — but not stdlib / third-party / pre-existing-repo symbols, which are external
by definition and never split across chunks): each such symbol is either declared **inside** the chunk, or
explicitly flagged to the reviewer as external / pre-existing. A boundary that leaves a
consumer inside while its declaration sits outside is malformed by construction — the field run's three false
Criticals were all this failure (a symbol asserted undeclared because its declaration sat in a different chunk).
Cohesion, not line budget, is the metric: the most self-contained chunk (372 lines) reviewed most accurately, while
false positives concentrated in chunks that cross-reference their neighbors.

**Test cohesion.** Behavior and the tests that exercise it belong in the same chunk. A chunk carrying code but not
its tests makes every verification-dimension finding unreliable — a reviewer blind to the tests reports proven
behavior as unproven.

**Derivation — a tiered model (seed → judgment → guard).** Boundaries are drawn by judgment, but bracketed by cheap
mechanism so no run starts blind or ships the closure failure:

- **Seed (cheap, existing signals).** Start from what the environment already provides, not a blank change set: the
  branch's **logical commit structure** (the author's own concern grouping — the kernel patch-series / standalone-CL
  prior art) and the **module / directory tree** (today's path-shaped floor). No clustering engine — an agent reads
  these from `git` and the file tree.
- **Judgment (the operator / agent).** Adjust the seed by contract cohesion — merge chunks that cross-reference
  heavily, split chunks that bundle unrelated contracts. Irreducibly judgment; not all boundaries are obvious.
- **Guard (cheap, existing tools).** Validate the proposed boundary for closure leaks: a full **type-check** refutes
  the whole "undeclared symbol" false class in seconds (the build already compiles), and an LSP **find-references /
  go-to-definition** pass surfaces the declaration→consumer edges directly, flagging symbols
  referenced-inside-but-declared-outside to pull in or annotate. Run against current HEAD, so a branch that moves
  during review is handled by re-running the guard — no separate staleness mechanism.
- **Coverage (cheap, existing tools).** A completeness check, not a proof: `change-set − ⋃chunks = ∅`, computed from
  `git diff` against the base. Nothing merges separately, so an uncovered hunk is only _unreviewed_ — a gap to close,
  not a correctness hazard — reported to the operator, never gated.

**Prose and doc change sets.** The closure _principle_ is domain-general — a well-formed chunk of a documentation
sweep keeps a term or method definition with the docs that reference it (a workflow citing a method, an ADR cited
across strategies), never splitting the two. The _mechanical_ guard is code-specific, though: there is no
type-checker or LSP for prose, so for doc chunks the guard degrades to judgment (or a lighter reference check — does
this chunk reference a heading, term, or artifact defined outside it?). ARC's own flagship trigger is a doc-heavy
sweep and the doctrine applies across both the package source and the markdown project instance, so the doc half is
covered by the principle, not left out for want of a code-shaped tool.

**Holistic coherence and the seam chunk.** Chunking optimizes _local_ defect detection; whole-_concern_ coherence is
reviewed at a different altitude, not by re-reading the whole diff (which dilutes any reviewer — the premise for
chunking). Two mechanisms carry it: the **design / spec review** is the whole-concern pass (ARC's spec is the
cover-letter analog — coherence is settled at design time, not re-derived from the diff), and a dedicated **seam
chunk** reviews the cross-chunk contracts (does B use A's interface correctly; is the interface right). The pairing
completes the coverage story: _closure_ prevents **false** findings from bad boundaries, the _seam chunk_ prevents
**missed** cross-chunk findings, and integration / E2E tests carry holistic _correctness_. So chunking plus an
explicit seam pass is not weaker than a nominal whole-diff read — it names and reviews the seams a diluted
24k-line pass only skims.

**Scope guard.** The method _names_ existing tools (compiler, `git`, LSP); it builds no cohesion-clustering engine.
That keeps the work `Heavy` (composition from prior art), not `Novel`. Any new verb — e.g. a one-shot closure-leak
check — is a forward path captured for the `review-surface-binding` seam, not built here.

**Routed to `review-surface-binding` (execution adjuncts, not boundary rules).** Two field-evidence lessons are about
_running_ a review, not _drawing_ a boundary, so they ride the invocation seam: (1) **type-check before triage** —
discard compile-error findings wholesale before spending judgment; (2) **guidance must read distinct from code
criteria** — injected review guidance bled into judgement in the field run (the rubric was applied as a spec the
_code_ must satisfy), so the surface must present guidance and code-criteria as separable to the reviewer.

**Applicability, and the reviewer model.** A chunk is an agent-curated set of files / hunks — not a tool
directory-scope — so a closure-respecting boundary may span directories and carry a `src/` change with its
separate-tree tests. Reviewing such a set needs a reviewer that accepts a **curated multi-file scope**, which is
inherently **local**: an **agent** (subagent or a local review verb) does it today, ad hoc, by assembling the set,
annotating external symbols in the review it drives, and running the type-check guard. A **hosted** PR review sees
the whole-PR diff and cannot be scoped to a closure-respecting chunk without splitting the PR — a merge-topology
change, which is `chunked-delivery`'s, not this WU's. So chunking is a **local review mechanism**; hosted bounded
review is out of scope here by construction.

The field run is the _motivating failure_, not a demonstration: it used the path-scoped, rate-limited provider (one
directory per pass, tests excluded) — the exact regime the doctrine corrects. The _automated_ ergonomic path —
per-chunk scoping, an external-symbol annotation channel, type-check-before-triage — is a **candidate add
`review-surface-binding` will size**: a curated hunk subset is neither the whole-range target its `local prepare`
(D4) derives nor the `git-object-range` its source (D5) binds, so it needs new source-semantics + target-identity —
the same target-algebra family RSB currently fences off (Non-Goal 64, which still cross-refs the old
`pr-decomposition` slug). Captured to the inbox for planning-close routing. It is an ergonomics upgrade the
agent-driven path does not wait on, not a prerequisite.

**Success signal.** The falsifiable observable is a **paired comparison — one reviewer, comparable granularity**: on
a held-out oversized change set, closure-respecting boundaries yield **materially fewer declaration-split false
Criticals** (in raw, pre-triage output) than the naive path-scoped boundaries the field run used — its 3-of-3 false
Criticals are the baseline arm. Three constraints make it test the design and nothing else: _pre-triage_, because
type-check-before-triage zeroes that class post-triage regardless of boundaries; _same reviewer_ on both arms, so
the delta is not reviewer identity; and _comparable granularity_ (similar chunk count / size), so it cannot be gamed
by one whole-diff chunk — which is closed by construction, scores zero, and reduces no surface. For a **doc-heavy**
change set the analog holds: zero false _"undefined / dangling reference"_ findings caused by a term, section, or
artifact defined in another chunk (judgment-checked, no type-checker). Measured on **first application** (the first
parked oversized WU's integration review) as directional initial evidence — n=1, not proof.

## Unknowns and Assumptions

- **Class:** **Heavy**, re-confirmed at the 2026-07-21 cut. Composition from mature prior art; the invented-feeling
  assurance algebra left with the topology half.
- **Relationships:** standalone (`Cohort: [none]`, `Depends On: [none]`). `review-architecture` shipped before
  implementation began, so its contract is a baseline rather than a recorded edge. `chunked-delivery` depends on
  this work unit. Likely coordinations — `review-surface-binding` (invocation surface), `session-locus-model`
  (lane-vs-scope coherence), `decomposition-doctrine` (adjacent axis).

## Forward-compat & seams

**Procedure-substrate check (`strategy-procedure-evolution` Self-Check).** This WU authors a method and touches the
CLI↔agent boundary, so it must compose with the layered execution model — deterministic logic in the CLI, structure
in typed contracts, judgment in minimal prose:

- **Judgment stays prose.** Boundary-_drawing_ is irreducibly judgment (the Derivation model says so); its
  correctness instrument is eventually an **eval** (`workflow-eval-harness`, Principle 5). Aligned.
- **Deterministic checks are verb-gaps, not permanent agent mechanics.** The seed, closure-leak, and coverage checks
  are narrated as agent-run today, but their target home is compiled `arc review` verbs (Principles 1 & 3). Captured
  to `review-surface-binding` as the verb owner; agent-run is the interim, not the design endpoint.
- **No agent-interpreted control flow.** The seed → judgment → guard tiers are a _conceptual_ model, not a prose
  procedure the agent steps through (Principle 2). A chunked-review _procedure_, if authored, rides
  `composable-workflows`' compiled agenda (D3), never grown as prose control-flow.

**Seam map.** _Owned here:_ the boundary doctrine (method) and the `chunk` concept. _Owed as forward seams_ — none a
hard dependency, since the doctrine is agent-applicable today: `review-surface-binding` (the ergonomic per-chunk
review verbs + annotation surface — captured to the inbox; a candidate add RSB will size, in the same target-algebra
family as its Non-Goal 64); `composable-workflows` (any chunked-review procedure conforms to its agenda model);
`workflow-eval-harness` (the judgment layer as a candidate eval); the briefs' vocabulary (`chunk` as a Principle-7
controlled term — the terminology cascade).

## Scope Estimate

**Medium.** Narrowed by the 2026-07-21 cut from the original week-plus estimate: the task-list model, spec form,
integration ceremony, merge-topology mechanic, assurance core, and config axis all moved to `chunked-delivery`.
What remains is the boundary doctrine (a methodology surface — closure rule, seam chunk, doc generality), the
chunk-scope invocation add to `review-surface-binding`'s local core (captured, not built twice), and a coverage +
seam-coverage check — across both the package source and the project instance. Only the ergonomic-automation add's
sequencing depends on the `review-surface-binding` seam; the doctrine itself ships independently (agent-applied).
