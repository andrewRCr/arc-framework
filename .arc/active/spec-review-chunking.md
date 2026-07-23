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
that helps is _less surface per evaluator context_. For a solo developer the agent is often the only reviewer,
which makes the gap operational rather than theoretical.

The live driving case is concrete. Several `Heavy` work units are mid-implementation that correctly did **not**
decompose into siblings — each is one concern — but by size alone will be hard to review meaningfully at
integration. `lifecycle-closeout` is the trigger: one work unit bundling a ~20-file two-mirror doc sweep, several
code-wiring legs, a new ceremony, a CLI removal, and a terminal audit — correctly one concern, but landing as one
large diff at integration. The hope motivating this work is to let such units reach integration and become
reviewable **at that point**: an integration-time retrofit that needs no merge-topology change, which is what makes
it tractable for work already built.

This work unit owns two things: the **chunk-boundary doctrine** (what makes a good review boundary) and **Mode B**,
the review-only retrofit (carving an already-built branch). Planned-up-front chunking and the merge topology that
would let chunks land separately belong to the sibling `chunked-delivery`. External-research synthesis lives in
`research-review-chunking.md`; the internal field run that motivated the doctrine lives in
`analysis-review-chunking.md`.

The doctrine also needs a discovery path. A method that exists only on disk leaves every caller to remember when a
change has become too large for reliable whole-target review. A typed resolver therefore measures the exact review
target and emits a silent-by-default chunking advisory when project-configured size tripwires fire. Lifecycle
consumers can apply that recommendation before source selection; the measurement assists judgment and does not
replace the contract-cohesion rule that actually draws chunks.

## Goals

- **Reviewability of large coherent changes, reviewer-agnostic.** Reduce the review surface a single evaluator
  context must hold, so defect detection does not degrade with change-set size — for human and AI reviewers
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
- **Assisted selection without routine friction.** Supply exact-target facts and a typed recommendation that a
  lifecycle consumer can apply before source selection without a new approval stop. Projects that do not want
  automatic consideration must experience no prompt or behavior change.

## Non-Goals

- **Merge topology / stacking.** Whether a chunk can also be an independent _merge_ unit, integration branches, and
  the amended `≥ 1 PR` invariant are `chunked-delivery`'s, not this WU's.
- **Typed per-chunk scope binding and evidence.** Automated construction/transport of chunk scopes, an
  external-symbol annotation channel, durable per-chunk scope identities, receipts, and independently authoritative
  per-chunk results are a deferred follow-on carved to the `chunk-scope-binding` planned stub (re-homed from
  `review-surface-binding`). The doctrine's interim carrier is agent-applied and may run fresh bounded evaluator
  contexts; no per-chunk output gains standalone review authority.
- **Universal size policy or provider-limit registry.** ARC does not claim one line/file threshold is correct for
  every project, and this WU does not encode mutable hosted-plan limits as generic chunking policy. Project
  thresholds are advisory; review-source eligibility owns any provider-specific hard constraint.
- **Hosted bounded review.** A hosted PR review sees the whole-PR diff and cannot be scoped to a curated chunk
  without splitting the PR — a merge-topology change. Bounded chunking is local by construction; the hosted channel
  stays whole-PR.
- **The cover letter / reviewer's guide.** A human-navigation aid that reduces no surface (so it does not help AI
  review) and is storage-sensitive; deferred and coordinated PR-side later. Its holistic-frame role is already
  carried by the spec (below).
- **Narrowing work units or pushing more sibling decomposition.** That is `assess-cohort-fit` /
  `decomposition-doctrine`'s separate question; this WU changes no concern boundary.

## Proposed Design

### Four orthogonal boundaries

The design adds a review boundary without pretending ARC's existing boundaries form one nesting hierarchy:

- **Work unit = the concern, ownership, and merge unit** — planning, the spec, one branch, and one PR. Unchanged.
- **Phase = the task-plan grouping** — an ordered group of implementation tasks. Unchanged; it is not itself a
  review scope.
- **Review increment = the execution approval unit** — the bounded work closed by a structured approval gate,
  normally one leaf task. Unchanged.
- **Chunk = the integration review unit** — a bounded, contract-cohesive slice of an exact change set reviewed in
  one pass. New. It is not a merge unit here and may cross phase/task boundaries when contract closure requires it.

### `chunk` — the review unit

`chunk` is the minted controlled-vocabulary noun for the review unit: a contract-cohesive slice of a change set
reviewed in one pass — a **review** boundary, review-only by definition (delivery-neutral, not inherited from any
existing usage). Reserved seam for `chunked-delivery`, which finalizes them: `deliverable ⊂ chunk` (a chunk given an
independent _merge_ boundary) and `stack` = a dependency-ordering over a _set_ of deliverables (a topology, not a
unit). This WU binds only `chunk` and the seam shape; the existing Cohort gloss remains about leaf work units, not
the reserved delivery term.

### Boundary doctrine — consumer→declaration dependency closure (the core rule)

A chunk is well-formed when it is **closed from each in-chunk consumer to the declaration it depends on whenever
that declaration lives in the change set**: the declaration is either **inside** the chunk or explicitly flagged
to the reviewer as external / pre-existing. Stdlib, third-party, and pre-existing-repo symbols are external by
definition and are never split across chunks. A boundary that leaves a consumer inside while its declaration sits
outside is malformed by construction — the field run's three false Criticals were exactly this failure (a symbol
asserted undeclared because its declaration sat in a different chunk).

**Cohesion, not line budget, is the metric.** The most self-contained chunk in the field run (372 lines) reviewed
most accurately, while false positives concentrated in chunks that cross-reference their neighbors. Boundaries are
drawn on contract cohesion, never a line count.

### Selection preflight — deterministic tripwire, judgmental boundary

Before any frontline or standard review of an exact target, a typed CLI resolver under `arc review chunking`
accepts ARC's canonical `ReviewTarget`, validates its derived identity, and returns one of three dispositions:
automatic consideration disabled, below the configured tripwires, or consider chunks. When either tripwire is
enabled, it measures the target's `diffBaseSha..headSha` range and reports the measured values and every tripped
dimension so the caller never has to recompute or infer the recommendation in prose. A moved `HEAD` creates a new
canonical target that requires a fresh resolver call.

Two flat project settings control the resolver:

- `review.chunking_threshold_lines` — additions plus deletions across the exact target.
- `review.chunking_threshold_files` — logical changed-file entries across the exact target.

Each accepts a config-normalized, unsigned base-10 safe integer. `0` disables that dimension; both `0` disables
automatic consideration entirely and returns without invoking Git or claiming measured facts. A missing or
unreadable project config uses the documented `0` / `0` fallback with a diagnostic; an explicitly malformed
threshold is a typed config error rather than a silent fallback. At or above either positive threshold returns
**consider chunks** (OR semantics). Binary changes contribute to the file count even when no numeric line count is
available. Package defaults are `0` / `0`, so a fresh installation gains no prompt, review call, measurement
failure, or changed behavior. This repository dogfoods `5000` changed lines and `150` changed files as
project-specific operating experience, not framework policy.

The public result extends the common registered review-command envelope rather than defining a parallel protocol.
Its variants distinguish disabled (no metrics or advisory), below-threshold (measured metrics, no advisory), and
consider-chunks (measured metrics, all tripped dimensions, precomposed advisory). Invalid target identity, an
explicitly invalid threshold, an unavailable Git object, malformed numeric-stat framing, or an unsafe aggregate
returns the common typed error envelope and a nonzero exit.

The tripwires select **attention**, not boundaries. They never cap a chunk or make a line/file budget a validity
rule. Below threshold the normal choice is whole-target review; at **consider chunks**, the agent applies the
closure/cohesion doctrine and selects whole-target or chunked review. The preflight facts are target-level and may
be reused while the exact target is unchanged, but the selection is made per review-role invocation because source
capability and the value of chunking can differ by role. An explicit caller or operator direction may select either
mode. The CLI precomposes the advisory text; a lifecycle consumer can surface it and continue unless redirected,
without creating a routine approval interlock.

Review-scope selection then constrains source eligibility. A chunked selection requires a curated-scope-capable
local carrier; locality alone is insufficient, so hosted sources and whole-target-only local sources are ineligible
for that invocation. A whole-target selection may use any otherwise eligible configured source. Provider-specific
hard limits remain an independent source-capability fact. When a source cannot accept the exact target, source
resolution falls through under its ordinary rules; it does not reinterpret the generic advisory threshold as
provider truth.

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
  go-to-definition** pass surfaces consumer→declaration dependency edges directly, flagging symbols
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

Chunking is a property of one curated-scope-capable local review-role _invocation_: it **adds no logical review
pass**, only reshapes how an existing role evaluates its surface. The carrier orchestration retains the canonical
immutable target, partition map, coverage state, and stable evaluator profile/rubric, but it never loads the whole
diff into one evaluator context. It runs one fresh bounded context per closure chunk plus a bounded seam context;
each context receives only its current scope and explicit external/pre-existing annotations, and records structured
findings before the next context begins.

A final non-author aggregate context receives the partition map, coverage result, structured chunk/seam reports,
and targeted source loci needed to reconcile them — not every chunk body wholesale — and emits one aggregate
whole-target result. A partial chunk report cannot complete the role invocation. The aggregate is one logical pass
for accounting even though the carrier uses multiple bounded evaluator calls. Typed scope transport, per-chunk
scope identities/receipts, and independently authoritative per-chunk results remain deferred to
`chunk-scope-binding`.

The integration pipeline has two independent roles whose configured cycles may repeat. One target-level preflight
can inform both, but whole-target versus chunked is selected separately for each role invocation before that role's
source resolution:

- **Frontline** (`frontline-review` / `implementation-audit`) — the advisory, opt-in, pre-publication local pass.
  A curated-scope-capable source can orchestrate the bounded chunk/seam contexts and non-author aggregation within
  one logical role invocation, returning one aggregate advisory result. The role remains free of receipt concerns:
  a frontline pass is advisory and never enters review receipts or gate reduction.
- **Independent-analysis** (`independent-analysis` — being renamed `standard-review`; see § Cross-cutting) — the
  ordinary obligation-bearing role. Chunked **only through a curated-scope-capable local carrier** (a local
  fresh-context carrier via `adversarial-review`); its **hosted channel stays whole-PR** by construction and begins
  only once a PR supplies its target. The local carrier uses fresh bounded evaluator contexts plus a non-author
  aggregate context; it never substitutes a single accumulating context. The aggregate result can participate in
  ordinary human-disposition-anchored completion only after every hunk and the cross-chunk contract/coherence
  surface have been reviewed. The coverage guard (`change-set − ⋃chunks = ∅`) plus the seam chunk supply that
  completeness; no partial result can settle the role.

Frontline + independent analysis are the existing roles (`integrate-work-unit`); this WU reshapes their
evaluations, it does not add or reorder review roles. One complete aggregate invocation is one logical pass for
pass-ceiling accounting, not one pass per bounded evaluator context.

### Artifacts this WU produces

- A **boundary-doctrine method** under `system/methods/` (authored in the package source, synced to the `.arc/`
  instance) capturing the closure rule, test cohesion, the seed → judgment → guard + coverage derivation, the
  prose/doc generality, and the holistic-coherence + seam-chunk model. Referenced (not re-authored) by the review
  methods at the attach points above.
- A **typed chunking-selection resolver** under `arc review chunking`, backed by the two flat runtime settings and
  exact-target diff facts. It emits measured values, tripped dimensions, disposition, and precomposed advisory text;
  it does not draw chunks, select a reviewer, invoke review, or create review evidence.
- The **`chunk` vocabulary entry** in `AGENT-BRIEF.ARC` § Vocabulary, plus the reserved seam note for
  `chunked-delivery`.
- The **`chunk` terminology cascade** (below).

### `chunk` terminology cascade

`chunk` becomes a load-bearing controlled term, so every generic "chunk of work" / "bounded chunk of autonomous
execution" partitive that would collide with it is reconciled — the **Work Unit** noun, **Cohort** gloss, and
**review-increment** gloss — across the constitution (`adr-001`), rules (`DEV-RULES.ARC`), briefs, ADRs, strategies,
workflows, templates, and `PROJECT-PRD`, in **both** the package source and the project instance. The existing
"**chunk** a routing sweep into multiple same-lane PRs" usage (`strategy-work-organization`, `drain-inbox`) is a
_delivery_ split, not the review-only `chunk`, and is reconciled too. Accepted ADR edits are limited to exact,
meaning-preserving terminology corrections; their decisions and point-in-time framing do not change. The
authoritative locus set is a **grep at implementation time**, never a hand list (which mis-files and omits) — the
reconcile is a controlled-vocabulary sweep, not a fixed file enumeration.

The public `docs/` tree is intentionally outside this private-development cascade. It is not a maintained surface
during the current development stage and will be reconciled as one coherent publication sweep by
`docs-content-sweep`, rather than accumulating piecemeal edits here.

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
- **Two advisory dimensions vs. one size metric.** Changed lines and changed files expose different attention
  failures: a concentrated implementation can be line-heavy while a sweep or rename can spread modest text across
  too many files. Either is sufficient to recommend consideration, while judgment prevents a broad but trivial
  change from being partitioned mechanically.
- **Two integer settings vs. enable flag plus thresholds.** `0` already means that a dimension is disabled, so a
  third boolean would create contradictory states without adding policy. Independent sentinels also let a project
  care about only one dimension.
- **Non-blocking advisory vs. mandatory operator approval.** A routine question would add friction precisely for
  users who configured the system to make the mechanical call. Typed measurement plus agent judgment keeps the
  operator informed and redirectable without turning review preparation into another interlock.
- **Chunk + seam pass vs. a whole-diff read.** A whole-diff read dilutes any reviewer — the same effect that
  motivates chunking. Closure prevents false findings, the seam chunk prevents missed cross-chunk findings, and
  tests carry correctness, so the pairing dominates the diluted whole-diff pass rather than trading against it.
- **Curated-scope-capable local vs. whole-target carrier.** A curated multi-file scope requires a reviewer that
  accepts one. Hosted PR review cannot be scoped without splitting the PR, while a local carrier that exposes only a
  whole Git range is still incapable of carrying chunks. Locality is necessary but not sufficient; bounded hosted
  review remains the sibling's topology question.
- **`chunk` vs. `slice` / `segment`.** `slice` carries the vertical-slice _delivery_ connotation ARC ascribes to the
  WU; `segment` is spent on cohort-path structure. `chunk` has no fixed delivery idiom of its own and harmonizes
  both WU names, so the minted noun can be defined review-only without fighting existing usage.
- **Build typed scope/evidence automation now vs. defer it.** The authoritative per-chunk path needs new
  source-semantics + target-identity beyond `review-surface-binding`'s whole-range `local prepare` /
  `git-object-range` source, and — the real design — a **scope-aware receipt binding**, since its `ReviewReceiptV2`
  is scope-blind and its reduction reads every receipt per target, so two chunk scopes over one head cannot
  otherwise be told apart. That is an ergonomics upgrade the agent-driven bounded-context carrier does not wait on;
  building it now would prepay a mechanism the doctrine does not require. Carved to `chunk-scope-binding`, started
  after this WU ships.
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
  `git diff`). Unit tests own config parsing, byte-framed numeric-stat parsing, and the disposition matrix;
  integration tests own real Git/config composition; the E2E boundary proves file/stdin transport, one exact JSON
  envelope, and no prompt or provider effect.
- **Migration / rollout.** The doctrine ships **agent-applied** — no tooling gate, usable on the first parked
  oversized WU. Rollout carries one mechanical sweep: the `chunk` terminology cascade (a controlled-vocabulary
  reconcile across both maintained ARC copies, grep-resolved at implementation time; the stale public `docs/` tree
  remains untouched for its dedicated publication sweep). The two new runtime settings are additive, default to
  `0`, and require no migration; this repository opts into `5000` / `150` independently of the package defaults.
  Delivery/topology configuration remains with `chunked-delivery`.
- **User-facing impact.** The boundary doctrine is an adopter-facing method (it ships via the package source). It
  adds a review-boundary technique and two off-by-default runtime settings while changing no invariant. A project
  can request chunking explicitly without configuration, enable automatic consideration on either size dimension,
  or retain the current whole-target behavior unchanged.
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
      blast radius, and this WU's new method is absent from RSB's completed rename sweep. Task 1.1 therefore has an
      execution precondition: reconcile onto a mainline containing RSB's rename before authoring related metadata,
      then use `standard-review` with no alias. This task-scoped ordering prevents a newly created method from
      retaining the retired identity without adding a hard WU dependency.
    - `review-surface-binding` — **canonical target and command-envelope seam.** The resolver consumes the existing
      `ReviewTarget` identity and measures `diffBaseSha..headSha`; it never mints raw base/head target semantics.
      Its public result extends RSB's registered common review-command envelope after that increment lands, including
      the shared mode/state/next-action/diagnostic and schema-registration conventions. Task 2.2 therefore has an
      execution precondition: reconcile onto a mainline containing that envelope before starting the public command
      work. This is task-local integration order, not a WU-level dependency; the doctrine and earlier resolver model
      remain independently executable.
    - `review-gate-right-sizing` — **typed driver and source-capability seam.** This WU owns the exact-target
      chunking resolver, its configuration, and the per-role whole/chunked selection contract. That WU owns
      automatic lifecycle consumption in both work-unit and Errand integration, including invoking preflight for a
      new exact target, accepting the selected scope before each role's source resolution, filtering by
      curated-scope capability, fallback, and pass accounting. This WU does not duplicate its workflow or driver
      changes. The ownership contract must be reconciled into that WU's live planning artifacts before automatic
      lifecycle consumption is claimed; this WU lands the standalone resolver and agent-applied method, not the
      workflow caller. Those artifacts keep the doctrine usable without making this WU depend on that driver's
      merge order.
    - `session-locus-model` — its `routingLane` / reviewed-lane vocabulary says a WU's PR is "classified by
      strictest lane, never splits into per-lane PRs"; reconcile with review-scope carving (scope ⊥ lane — a chunk
      is a review scope, not a routing lane). No collision on this WU's core surfaces.
    - `composable-workflows` / `workflow-eval-harness` — **conform, not scope-add**: a chunked-review procedure, if
      authored, rides the compiled agenda model; the boundary-drawing judgment is a candidate eval.
    - `review-architecture` — **shipped**; its integration reshape, Review-Increment Invariant, and
      review-obligation contract are the settled baseline this layers on. No dependency edge (satisfied before
      implementation began).
- **Forward-compat (procedure substrate).** The CLI computes the exact-target metrics, threshold comparison,
  disposition, and rendered advisory; a lifecycle consumer dispatches on the typed result and retains only the
  per-role whole-vs-chunked cohesion judgment. The deterministic seed / closure-leak / coverage checks remain
  **verb-gaps** whose compiled home is the deferred `chunk-scope-binding` follow-on — agent-run is the interim, not
  the design endpoint. No agent-interpreted control flow is introduced: the seed → judgment → guard tiers are a
  conceptual model, not a prose procedure the agent steps through. `chunk` is a Principle-7 controlled-vocabulary
  term.

## Success Criteria

- **Primary falsifiable experiment — paired independent carrier runs, controlled evaluators, comparable
  granularity.**
  On one held-out oversized canonical target, run a baseline arm with naive path-scoped boundaries and a treatment
  arm with closure-respecting boundaries. Each arm is one independent local carrier run; both use the same evaluator
  profile/capability, effective rubric, and protocol. Within an arm, a separate fresh bounded evaluator context
  reviews each chunk, another bounded context reviews the arm-specific seam, each captures structured raw findings
  before triage or aggregation, and then a fresh non-author aggregate context emits one whole-target result from the
  partition/coverage facts and structured reports. The other arm's map and findings remain hidden.

  The falsifiable hypothesis is that the treatment yields strictly fewer declaration-split false `blocker`
  findings than the baseline; any positive reduction is material because the findings are blocker-level. The field
  run's 3-of-3 false Criticals are the prior directional observation, not a result-schema precedent. Comparable
  chunk count/size prevents a whole-diff treatment from gaming the signal, and identical per-arm seam protocol
  leaves the boundary map as the changed variable.

  A valid comparison closes with one honest outcome: strict reduction is supportive; treatment at or above a
  nonzero baseline is contrary; and zero/zero or a compromised comparison is inconclusive. Contrary evidence
  requires doctrine correction before the work unit completes. Inconclusive evidence may close only by explicit
  operator acceptance and must remain labeled inconclusive; do not select repeated targets merely to obtain a
  supportive result. Any declaration-split false blocker in the treatment independently exposes a closure defect
  even when the aggregate count is lower.
- **Doc-heavy analog.** For a maintained doc-heavy change set outside `docs/`: zero false "undefined / dangling
  reference" findings caused by a term, section, or artifact defined in another chunk (judgment-checked, no
  type-checker).
- **Completeness holds.** The coverage guard `change-set − ⋃chunks = ∅` reports no uncovered hunk (or surfaces the
  gap), and a **seam chunk is present whenever chunk boundaries create cross-chunk surface** — reviewing both the
  cross-chunk contracts and the cross-chunk coherence / maintainability surface (duplication, inconsistent
  abstraction / naming), so no review dimension a _diluted_ whole-diff pass would carry is dropped by the
  decomposition.
- **Artifacts landed.** The boundary doctrine ships as a `system/methods/` method in **both** copies; the `chunk`
  vocabulary entry and reserved seam are in `AGENT-BRIEF.ARC`; the terminology cascade leaves no generic "chunk of
  work" partitive colliding with the load-bearing term; the typed selection resolver and off-by-default config ship;
  and the review-method attach points reference the doctrine without adding a role, pass, or approval stop.
- **Selection is measured and quiet by default.** With package defaults `0` / `0`, the resolver performs no Git
  measurement and returns no advisory. With either threshold enabled, it validates the canonical target, measures
  `diffBaseSha..headSha`, trips at equality, reports every firing dimension, and independently resolves a new
  canonical target after the head moves while leaving per-role whole-vs-chunked selection to cohesion judgment.
- **Self-host policy is explicit.** The project instance configures `5000` changed lines and `150` changed files,
  while the package remains neutral; a tripped chunked selection excludes hosted and whole-target-only local
  carriers without treating either project threshold as a universal provider limit.
- **Measured on first application.** The signal is recorded in `analysis-review-chunking.md` from the first parked
  oversized WU's integration review as directional initial evidence — n=1, explicitly not proof. The experiment is
  evaluation-only for review authority: neither arm satisfies a review obligation or authorizes target mutation.

## Open Questions

No settle-able design is open. The cascade's exact locus set remains a grep-resolved implementation detail by
design, never a hand-maintained list.
