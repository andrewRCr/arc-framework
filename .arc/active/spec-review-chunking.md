# Spec (`detailed` · `RFC`): review-chunking

- **Origin:** [internal] — surfaced 2026-06-23 during `lifecycle-closeout` planning: why ARC work units run
  broader than the industry small-PR norm, and whether the large review surface that follows is a coupling artifact
  rather than a deliberate stance.

- **Purpose:** Make a large but coherent single-concern change **actually reviewable** by carving its review
  surface into bounded, contract-cohesive **chunks** — without changing merge topology. One branch, one PR, merging
  once; only the review surface is decomposed.

---

## Introduction / Context

ARC welds two separable boundaries together: the _concern_ boundary (the work unit — correctly broad when one
uniform concern spans a wide surface) and the _review_ boundary (today forced to equal it). The instinct that
groups work into a broad work unit is right; only the review surface it emits is sometimes too large to review
well.

Review defect-detection degrades with diff size — the evidence is strong for review _thoroughness_ and defect
detection (distinct from merge speed), and the degradation applies to AI review as much as to human, since
attention dilutes across a large diff rather than scaling with it. AI review is the **acute forcing case**: a large
diff cannot be navigated, only diluted, and adding supporting material _increases_ the surface, so the only lever
that helps is _less surface per invocation_. For a solo developer the agent is often the only reviewer, which makes
the gap operational rather than theoretical.

The live driving case is concrete. Several `Heavy` work units are mid-implementation that correctly did **not**
decompose into siblings — each is one concern — but by size alone will be hard to review meaningfully at
integration. `lifecycle-closeout` is the trigger: one work unit bundling a ~20-file two-mirror doc sweep, several
code-wiring legs, a new ceremony, a CLI removal, and a terminal audit — correctly one concern, but landing as one
large diff at integration. The hope motivating this work is to let such units reach integration and become
reviewable **at that point**: an integration-time retrofit that needs no merge-topology change, which is what makes
it tractable for work already built.

This work unit owns two things: the **chunk-boundary doctrine** (what makes a good review boundary) and **Mode B**,
the review-only retrofit (carving an already-built branch). Planned-up-front chunking and the merge topology that
would let chunks land separately belong to the sibling `chunked-delivery`. Grounding evidence — including the field
run that motivated the doctrine — lives in `research-review-chunking.md`.

## Goals

- **Reviewability of large coherent changes, reviewer-agnostic.** Reduce the review surface a single review
  invocation must hold, so defect detection does not degrade with change-set size — for human and AI reviewers
  alike. The goal is review quality, never merge speed.
- **No merge-topology change.** The mechanism must apply to an already-built branch that still merges once as a
  single PR. `1 WU = 1 branch = 1 PR` survives intact; the review surface is carved beneath it.
- **A boundary doctrine usable today.** A chunk is an agent-curated file/hunk set drawn and reviewed by judgment
  now — the doctrine cannot be gated on tooling that does not yet exist.
- **Fewer false findings from bad boundaries.** A boundary that splits a symbol's declaration from its consumers
  manufactures false "undefined symbol" findings; the doctrine must make such a boundary malformed by construction.
- **No holistic-coherence loss.** Distributing the surface across chunks must not lose whole-concern review — the
  cross-chunk contracts, cross-chunk coherence / maintainability, and the whole-concern coherence must still be
  reviewed.

## Non-Goals

- **Merge topology / stacking.** Whether a chunk can also be an independent _merge_ unit, integration branches, and
  the amended `≥ 1 PR` invariant are `chunked-delivery`'s, not this WU's.
- **Automated per-chunk review invocation.** Per-chunk review scoping and an external-symbol annotation channel are
  a deferred follow-on carved to the `chunk-scope-binding` planned stub (re-homed from `review-surface-binding`).
  The doctrine is agent-applied in the interim; the automation is started only after this WU ships and is not a
  prerequisite for it.
- **Hosted bounded review.** A hosted PR review sees the whole-PR diff and cannot be scoped to a curated chunk
  without splitting the PR — a merge-topology change. Bounded chunking is local by construction; the hosted channel
  stays whole-PR.
- **The cover letter / reviewer's guide.** A human-navigation aid that reduces no surface (so it does not help AI
  review) and is storage-sensitive; deferred and coordinated PR-side later. Its holistic-frame role is already
  carried by the spec (below).
- **Narrowing work units or pushing more sibling decomposition.** That is `assess-cohort-fit` /
  `decomposition-doctrine`'s separate question; this WU changes no concern boundary.

## Proposed Design

### Three nested levels

The design introduces one new level between two existing ones:

- **Work unit = the concern unit** — planning, ownership, the spec. Unchanged.
- **Chunk = the review unit** — a bounded, contract-cohesive slice of a change set reviewed in one pass. The new
  level. It is **not** a merge unit here, and it is distinct from the **review increment** (the execution-time
  approval act on a leaf task): a chunk is an integration-time review _scope_.
- **Phase = the impl increment** — the task-list model. Unchanged.

### `chunk` — the review unit

`chunk` is the minted controlled-vocabulary noun for the review unit: a contract-cohesive slice of a change set
reviewed in one pass — a **review** boundary, review-only by definition (delivery-neutral, not inherited from any
existing usage). Reserved seam for `chunked-delivery`, which finalizes them: `deliverable ⊂ chunk` (a chunk given an
independent _merge_ boundary) and `stack` = a dependency-ordering over a _set_ of deliverables (a topology, not a
unit). This WU binds only `chunk` and the seam shape.

### Boundary doctrine — declaration→consumer closure (the core rule)

A chunk is well-formed when it is **closed under the declaration→consumer relation for every referenced symbol whose
declaration lives in the change set**: each such symbol is either declared **inside** the chunk or explicitly
flagged to the reviewer as external / pre-existing. Stdlib, third-party, and pre-existing-repo symbols are external
by definition and are never split across chunks. A boundary that leaves a consumer inside while its declaration sits
outside is malformed by construction — the field run's three false Criticals were exactly this failure (a symbol
asserted undeclared because its declaration sat in a different chunk).

**Cohesion, not line budget, is the metric.** The most self-contained chunk in the field run (372 lines) reviewed
most accurately, while false positives concentrated in chunks that cross-reference their neighbors. Boundaries are
drawn on contract cohesion, never a line count.

### Test cohesion

Behavior and the tests that exercise it belong in the **same chunk**. A chunk carrying code but not its tests makes
every verification-dimension finding unreliable — a reviewer blind to the tests reports proven behavior as unproven.

### Derivation — seed → judgment → guard

Boundaries are drawn by judgment, bracketed by cheap mechanism so no run starts blind or ships the closure failure.
The tiers name existing tools and build **no clustering engine**:

- **Seed (existing signals).** Start from the branch's **logical commit structure** (the author's own concern
  grouping) and the **module / directory tree** (today's path-shaped floor) — read from `git` and the file tree,
  not computed by a new engine.
- **Judgment (operator / agent).** Adjust the seed by contract cohesion: merge chunks that cross-reference heavily,
  split chunks that bundle unrelated contracts. Irreducibly judgment; not all boundaries are obvious.
- **Guard (existing tools).** Validate the proposed boundary for closure leaks: a full **type-check** refutes the
  whole "undeclared symbol" false class in seconds (the build already compiles), and an LSP **find-references /
  go-to-definition** pass surfaces declaration→consumer edges directly, flagging symbols
  referenced-inside-but-declared-outside to pull in or annotate. Run against current HEAD, so a branch that moves
  during review is handled by re-running the guard — no separate staleness mechanism.
- **Coverage (existing tools).** A completeness check, not a proof: `change-set − ⋃chunks = ∅`, computed from
  `git diff` against the base. Nothing merges separately, so an uncovered hunk is only _unreviewed_ — a gap to
  close, reported to the operator, **never gated**.

### Prose and doc change sets

The closure **principle** is domain-general: a well-formed doc chunk keeps a term or method definition with the docs
that reference it (a workflow citing a method, an ADR cited across strategies), never splitting the two. The
**mechanical** guard is code-specific — there is no type-checker or LSP for prose — so for doc chunks the guard
degrades to judgment (or a lighter reference check: does this chunk reference a heading, term, or artifact defined
outside it?). ARC's own flagship trigger is a doc-heavy sweep spanning both the package source and the markdown
project instance, so the doctrine must carry the doc case by principle, not leave it out for want of a code-shaped
tool.

### Holistic coherence and the seam chunk

Chunking optimizes _local_ defect detection; whole-_concern_ coherence is reviewed at a different altitude, not by
re-reading the whole diff (which dilutes any reviewer — the premise for chunking). Two mechanisms carry it:

- The **design / spec review** is the whole-concern pass. ARC's spec is the cover-letter analog: coherence is
  settled at design time, not re-derived from the diff.
- A dedicated **seam chunk** reviews what spans chunks: the cross-chunk contracts (does B use A's interface
  correctly, is the interface right) _and_ the cross-chunk coherence / maintainability surface — the abstractions,
  helpers, and naming each chunk introduces at its boundary, where duplication or inconsistency across chunks would
  show and no single chunk's local pass can see it. It reviews that between-chunk surface at focused attention rather
  than re-scanning every chunk body; it is the carrier for the review dimensions that live _between_ chunks rather
  than inside one.

The pairing completes the coverage story: _closure_ prevents **false** findings from bad boundaries; the _seam
chunk_ prevents **missed** cross-chunk findings — both contract breaks and cross-chunk coherence defects; integration
/ E2E tests carry holistic _correctness_. Chunking plus an explicit seam pass is not weaker than a nominal whole-diff
read on the between-chunk dimensions either: a diluted whole-diff pass only _skims_ the seams, whereas the seam chunk
names and reviews them at focused attention.

### Reviewer model — local by construction

A chunk is an agent-curated set of files / hunks, not a tool directory-scope, so a closure-respecting boundary may
span directories and carry a `src/` change with its separate-tree tests. Reviewing such a set needs a reviewer that
accepts a **curated multi-file scope**, which is inherently **local**: an agent (subagent or a local review verb)
assembles the set, annotates external symbols in the review it drives, and runs the type-check guard. Hosted bounded
review is out of scope by construction (above).

### Where chunking attaches in the review pipeline

Chunking is a property of a local, curated-scope review _invocation_: it **adds no review pass**, only reshapes the
surface each existing pass sees. The integration pipeline has up to two passes, and chunking distributes each pass's
surface per chunk:

- **Frontline** (`frontline-review` / `implementation-audit`) — the advisory, opt-in, pre-publication local pass.
  When enabled it is the natural chunk carrier, and chunking it is **free of receipt concerns**: a frontline pass is
  advisory and never enters review receipts or gate reduction.
- **Independent-analysis** (`independent-analysis` — being renamed `standard-review`; see § Cross-cutting) — the
  post-PR, obligation-bearing pass. Chunked **only on its local channel** (a local fresh-context carrier via
  `adversarial-review`); its **hosted channel stays whole-PR** by construction. Chunking the local channel must
  preserve `independent-analysis`'s **Coverage** requirement — the
  complete exact change set, not a sample — which the coverage guard (`change-set − ⋃chunks = ∅`) plus the seam
  chunk together satisfy: the closure chunks cover every hunk in at least one review pass, and the seam chunk
  additionally reviews the cross-chunk surface (contracts and coherence), so the union of passes covers the whole
  change set.

The frontline + independent two-pass is the existing design (`integrate-work-unit`); this WU reshapes each pass's
surface, it does not add or reorder passes.

### Artifacts this WU produces

- A **boundary-doctrine method** under `system/methods/` (authored in the package source, synced to the `.arc/`
  instance) capturing the closure rule, test cohesion, the seed → judgment → guard + coverage derivation, the
  prose/doc generality, and the holistic-coherence + seam-chunk model. Referenced (not re-authored) by the review
  methods and `integrate-work-unit` at the attach points above.
- The **`chunk` vocabulary entry** in `AGENT-BRIEF.ARC` § Vocabulary, plus the reserved seam note for
  `chunked-delivery`.
- The **`chunk` terminology cascade** (below).

### `chunk` terminology cascade

`chunk` becomes a load-bearing controlled term, so every generic "chunk of work" / "bounded chunk of autonomous
execution" partitive that would collide with it is reconciled — both the **Work Unit** noun and the
**review-increment** gloss — across the constitution (`adr-001`), rules (`DEV-RULES.ARC`), briefs, ADRs, strategies,
workflows, templates, and `PROJECT-PRD`, in **both** the package source and the project instance. The existing
"**chunk** a routing sweep into multiple same-lane PRs" usage (`strategy-work-organization`, `drain-inbox`) is a
_delivery_ split, not the review-only `chunk`, and is reconciled too. The authoritative locus set is a **grep at
implementation time**, never a hand list (which mis-files and omits) — the reconcile is a controlled-vocabulary
sweep, not a fixed file enumeration.

## Alternatives & Rationale

- **Chunking vs. re-splitting into a mergeable stack.** For an already-built coherent change, the industry-aligned
  answer is a _review_ decomposition, not a _merge_ re-split: Google's guidance for an unavoidably large change is
  advance reviewer consent plus heightened scrutiny, not a retroactive re-split. Re-splitting carries all the
  merge-topology fragility (stacking) and does not apply to work already built. The idiom re-examination
  (heavy-research; `research-review-chunking.md` § Idiom re-examination) corroborates this directly. Stacking is one
  merge topology; it lives with the sibling.
- **Contract-cohesion (closure) vs. line-budget boundaries.** Line-budget boundaries split declarations from
  consumers and manufacture false findings; the field run's false Criticals concentrated in cross-referencing
  chunks, while the most self-contained chunk reviewed most accurately. Closure is the metric because it is the one
  that predicted review accuracy in the evidence.
- **Chunk + seam pass vs. a whole-diff read.** A whole-diff read dilutes any reviewer — the same effect that
  motivates chunking. Closure prevents false findings, the seam chunk prevents missed cross-chunk findings, and
  tests carry correctness, so the pairing dominates the diluted whole-diff pass rather than trading against it.
- **Local vs. hosted reviewer.** A curated multi-file scope requires a reviewer that accepts one; a hosted PR review
  cannot be scoped without splitting the PR. Local is not a preference but a construction constraint; hosted bounded
  review is therefore the sibling's topology question.
- **`chunk` vs. `slice` / `segment`.** `slice` carries the vertical-slice _delivery_ connotation ARC ascribes to the
  WU; `segment` is spent on cohort-path structure. `chunk` has no fixed delivery idiom of its own and harmonizes
  both WU names, so the minted noun can be defined review-only without fighting existing usage.
- **Build the automation now vs. defer it.** The automated per-chunk path needs new source-semantics +
  target-identity beyond `review-surface-binding`'s whole-range `local prepare` / `git-object-range` source, and —
  the real design — a **scope-aware receipt binding**, since its `ReviewReceiptV2` is scope-blind and its reduction
  reads every receipt per target, so two chunk scopes over one head cannot otherwise be told apart. That is an
  ergonomics upgrade the agent-driven path does not wait on; building it now would prepay a mechanism the doctrine
  does not require. Carved to `chunk-scope-binding`, started after this WU ships.
- **Heavy, not Novel.** The doctrine _composes_ from mature prior art (the small-PR / patch-series literature) and
  _names_ existing tools (compiler, `git`, LSP); it invents no model and builds no clustering engine. The
  invented-feeling assurance algebra left with the topology half at the cut, so nothing pulls toward Novel.

## Cross-cutting Considerations

- **Compatibility (invariants).** `1 WU = 1 branch = 1 PR` survives intact — the review surface is carved beneath
  it. `independent-analysis`'s complete-coverage requirement is preserved under local chunking by the coverage guard
  (union-completeness) plus the seam chunk; the hosted channel is unchanged. The amendment to `≥ 1 PR` belongs to
  `chunked-delivery`, not here.
- **Testing / validation.** The design's own validation instrument is the success signal below — a paired
  comparison measured on first application (n=1 directional evidence, not proof). Boundary-_drawing_ is judgment and
  is not unit-testable; the deterministic guard/coverage checks are validated by the tools they name (type-check,
  `git diff`).
- **Migration / rollout.** The doctrine ships **agent-applied** — no tooling gate, usable on the first parked
  oversized WU. Rollout carries one mechanical sweep: the `chunk` terminology cascade (a controlled-vocabulary
  reconcile across both copies, grep-resolved at implementation time). No runtime migration and no config axis (the
  config axis moved to `chunked-delivery` at the cut).
- **User-facing impact.** The boundary doctrine is an adopter-facing method (it ships via the package source). It
  adds a review-boundary technique and changes no invariant, so adoption is additive — a team applies it to an
  oversized change or ignores it.
- **Dependencies, seams, and integration points** (routed at planning close; none a hard blocker — the doctrine is
  agent-applicable today):
    - `chunked-delivery` — **consumer**, `Depends On: review-chunking`. The boundary doctrine and the `chunk`
      vocabulary (with the reserved `deliverable` / `stack` seam) are authored here and consumed there; the sibling
      finalizes the merge layer, never re-authoring these.
    - `review-surface-binding` → `chunk-scope-binding` — the ergonomic per-chunk review verbs + annotation surface,
      **deferred** to the `chunk-scope-binding` follow-on (re-homed from RSB, which shipped its advisory local lane
      without it). Its real design is a scope-aware receipt binding; RSB's Non-Goal already fences off that
      target-algebra family, naming `review-chunking` as the deferral target.
    - `review-surface-binding` / `review-gate-right-sizing` — **`independent-analysis` → `standard-review` rename
      (live-closure coordination).** The obligation-bearing review pass this WU attaches chunking to is being renamed
      (method / rubric identity `standard-review/v1`, obligation field `standardReview`, `policy/standard-review*.ts`
      modules) — a clean pre-GA forward rename with no alias or migration, **owned by `review-surface-binding` as its
      first implementation increment** and integrated before `review-gate-right-sizing` consumes the renamed surface
      (an integration-order constraint, not a `Depends On` edge). RSB names this WU's references inside the rename's
      blast radius, and this WU's attach-point edit lands on that same live-closure surface, so the attach-point
      reference uses the name live at implementation time — `independent-analysis` today, `standard-review` once RSB
      lands it — and reconciles against whichever of the rename and the attach-point edit integrates second. No hard
      ordering edge for this WU.
    - `session-locus-model` — its `routingLane` / reviewed-lane vocabulary says a WU's PR is "classified by
      strictest lane, never splits into per-lane PRs"; reconcile with review-scope carving (scope ⊥ lane — a chunk
      is a review scope, not a routing lane). No collision on this WU's core surfaces.
    - `composable-workflows` / `workflow-eval-harness` — **conform, not scope-add**: a chunked-review procedure, if
      authored, rides the compiled agenda model; the boundary-drawing judgment is a candidate eval.
    - `review-architecture` — **shipped**; its integration reshape, Review-Increment Invariant, and
      review-obligation contract are the settled baseline this layers on. No dependency edge (satisfied before
      implementation began).
- **Forward-compat (procedure substrate).** Judgment stays prose (eval-gated via `workflow-eval-harness`); the
  deterministic seed / closure-leak / coverage checks are **verb-gaps** whose compiled home is `arc review` verbs,
  riding the deferred `chunk-scope-binding` follow-on — agent-run is the interim, not the design endpoint. No
  agent-interpreted control flow is introduced: the seed → judgment → guard tiers are a conceptual model, not a
  prose procedure the agent steps through. `chunk` is a Principle-7 controlled-vocabulary term (the cascade).

## Success Criteria

- **Primary falsifiable signal — a paired comparison, one reviewer, comparable granularity.** On a held-out
  oversized change set, run two arms with the **same local reviewer** at comparable granularity: a **baseline arm**
  drawing naive path-scoped boundaries and a **treatment arm** drawing closure-respecting boundaries. The treatment
  arm yields **materially fewer declaration-split false Criticals** (in raw, _pre-triage_ output) than the baseline
  arm. The field run's 3-of-3 false Criticals are the **prior directional observation** that motivates the
  hypothesis — a hosted, path-scoped run on a different change set, so it seeds the baseline expectation but is not
  itself an arm of this same-reviewer comparison. Three constraints keep the comparison testing the design and
  nothing else: _pre-triage_ (type-check-before-triage would zero that class post-triage regardless of boundaries);
  _same reviewer_ on both arms (so the delta is not reviewer identity); and _comparable granularity_ (similar chunk
  count / size, so a single whole-diff chunk cannot game it — it is closed by construction, scores zero, and reduces
  no surface).
- **Doc-heavy analog.** For a doc-heavy change set: zero false "undefined / dangling reference" findings caused by a
  term, section, or artifact defined in another chunk (judgment-checked, no type-checker).
- **Completeness holds.** The coverage guard `change-set − ⋃chunks = ∅` reports no uncovered hunk (or surfaces the
  gap), and a **seam chunk is present whenever chunk boundaries create cross-chunk surface** — reviewing both the
  cross-chunk contracts and the cross-chunk coherence / maintainability surface (duplication, inconsistent
  abstraction / naming), so no review dimension a _diluted_ whole-diff pass would carry is dropped by the
  decomposition.
- **Artifacts landed.** The boundary doctrine ships as a `system/methods/` method in **both** copies; the `chunk`
  vocabulary entry and reserved seam are in `AGENT-BRIEF.ARC`; the terminology cascade leaves no generic "chunk of
  work" partitive colliding with the load-bearing term; and the review-pipeline attach points reference the doctrine
  without adding a pass.
- **Measured on first application.** The signal is taken on the first parked oversized WU's integration review as
  directional initial evidence — n=1, explicitly not proof.

## Open Questions

No settle-able design is open — all decisions are settled (per the draft's convergence). What remains is genuine
implementation detail, resolved during the work, not a resolve-before-starting blocker:

- The concrete method filename/slug and the exact wording of the one-line references the review methods /
  `integrate-work-unit` carry to it — resolved at task time against the settled attach-point design.
- The cascade's exact locus set — resolved by grep at implementation time by design, never pre-listed.
