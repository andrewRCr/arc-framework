# Notes: plan-segmentation

## Contents

- [Worked example — segmented task-list shape](#worked-example--segmented-task-list-shape)
- [Segmentation scan interface](#segmentation-scan-interface)
- [Mode-classification cases](#mode-classification-cases)
- [Prior-art citations](#prior-art-citations)
- [Planning-close capture set](#planning-close-capture-set)
- [Assumptions carried into execution](#assumptions-carried-into-execution)

## Worked example — segmented task-list shape

Illustrative excerpt over a constructed work unit, in the settled grammar: `_Mode:_` and `_Exit criterion:_` sit
between `_Purpose:_` and any `_Design decisions:_`; the segment verifier's suffix sits outside the bold; a `layer`
phase carries no verifier; a stub's `_Retired in:_` bullet sits beneath the stub's task. Everything stays inside the
existing task-list grammar, so the cursor, tallies, and compaction seed see a normal task list.

```markdown
# Task List: import-profiles

- **Design:** `spec-import-profiles.md`

---

## **Phase 1:** Profile record substrate

_Purpose:_ the shared record both slices build on.

_Mode:_ `layer` — closes on a complete, settled layer.

_Exit criterion:_ `ProfileRecord` schema and storage round-trip settled and tested; no consumer yet — Phase 2
wires the first production caller.

### `[ ]` **1.1 Define `ProfileRecord` schema and storage round-trip**

- _Goal:_ typed record with load/save; validation errors surfaced as typed results.

## **Phase 2:** Happy-path import, end to end

_Purpose:_ the thinnest real import a user can run.

_Mode:_ `slice` — closes on exercisable end-to-end capability.

_Exit criterion:_ `arc profiles import <file>` exercised against a real fixture — lifecycle row "valid file →
stored profile → typed success" wired to its production callsite and proven by task 2.3.

### `[ ]` **2.1 Wire the `import` command to `ProfileRecord` (production callsite)**

- _Goal:_ the CLI path exists — no orphaned module.

    - `[ ]` **2.1.a Stub conflict resolution as pass-through**
        - _Retired in:_ Phase 3

### `[ ]` **2.2 Surface import results in command output**

- _Goal:_ success and failure paths render typed results.

### `[ ]` **2.3 Import a fixture through the real CLI path** — validate exit criterion at segment scope

- _Goal:_ the executable scenario for the phase's `_Exit criterion:_`; Phase 2 is not done until it passes.

## **Phase 3:** Conflict handling

_Purpose:_ conflict resolution becomes real behavior.

_Mode:_ `slice` — closes on exercisable end-to-end capability.

_Exit criterion:_ duplicate-profile import exercised end to end; retires stub 2.1.a.
```

The `pilot-then-replicate` composition, over a constructed two-mirror verb-rename sweep:

```markdown
## **Phase 2:** Rename pilot — one verb, both mirrors

_Purpose:_ prove the rename transform on one real instance.

_Mode:_ `slice` — closes on exercisable end-to-end capability (pilot: the transform proven before mass
application).

_Exit criterion:_ one verb renamed across both mirrors with gates green.

## **Phase 3:** Replicate across the remaining verbs

_Purpose:_ apply the proven transform across the corpus.

_Mode:_ `replication` — closes on the enumerated surface exhausted, batch-verified.

_Exit criterion:_ all remaining verbs renamed; the segment verifier runs the full-corpus check — zero stragglers.
```

When a delivery plan is present and a member boundary coincides with a segment boundary, the segment verifier is
the last parent that does not carry the member suffix, and the member verifier follows it as the phase's final
parent.

## Segmentation scan interface

The module exports these stable cross-task boundaries:

- `TaskListSegmentMode = "slice" | "layer" | "replication"`
- `TaskListPhaseReference` with `id: string` and one-based `line: number`
- `TaskListSegment` with `mode`, `openingPhase`, `closingPhase`, ordered `phaseIds`, and `exitCriterion` carrying
  one-based `line` plus unwrapped prose `text`
- `TaskListRetiringPhaseReference` with `taskId`, one-based `line`, and named `phaseId`
- `TaskListSegmentationDiagnostic` with closed `code`, repository-relative `path`, one-based `line`, and precomposed
  `message`
- `TaskListSegmentationResult` with ordered `segments`, ordered `retiringPhaseReferences`, and ordered `diagnostics`
- `scanTaskListSegmentation(document: { path: string; content: string }): TaskListSegmentationResult`
- `hasSegmentVerifierSuffix(line: string): boolean` and `hasMemberVerifierSuffix(line: string): boolean`, each
  taking a raw parent-heading line and matching its role suffix only at the line's end, allowing trailing whitespace

Fire sites render `message` without decoration, so its exact shape is `{path}:{line}: {body}` and the code-specific
body is:

- `task-list-malformed` — `Task-list structure is malformed: {scannerMessage}`
- `phase-outside-segment` — `Phase {phaseId} belongs to no declared segment`
- `phase-id-duplicate` — `Phase {phaseId} is declared more than once`
- `mode-malformed` — `Phase {phaseId} has malformed _Mode:_ syntax`
- `mode-unknown` — `Phase {phaseId} declares unknown segment mode {mode}`
- `span-invalid` — `Phase {phaseId} declares an invalid segment span through Phase {targetPhaseId}`
- `segment-missing-exit-criterion` — `Segment closing at Phase {phaseId} has no _Exit criterion:_`
- `segment-verifier-missing` — `Segment closing at Phase {phaseId} requires a final non-member task with the
  segment-verifier suffix`
- `segment-verifier-orphan` — `Task {taskId} carries the segment-verifier suffix outside a segment-closing position`
- `segment-overlap` — `Phase {phaseId} opens a segment inside the span opened at Phase {openingPhaseId}`
- `mode-duplicate` — `Phase {phaseId} carries more than one _Mode:_ declaration`
- `exit-criterion-empty` — `Phase {phaseId} has an empty _Exit criterion:_ declaration`
- `exit-criterion-duplicate` — `Phase {phaseId} carries more than one _Exit criterion:_ declaration`
- `exit-criterion-orphan` — `Phase {phaseId} carries _Exit criterion:_ but closes no segment`
- `terminal-phase-segmented` — `Terminal Verification phase must not carry _Mode:_ or _Exit criterion:_`
- `segment-verifier-terminal` — `Task {taskId} places a segment verifier in the terminal Verification phase`
- `retiring-phase-missing` — `Task {taskId} names missing retiring Phase {targetPhaseId}`

The diagnostic line is the structural scanner's error line or the offending declaration, heading, verifier, or
retiring-phase bullet. A missing exit criterion or verifier uses the closing phase heading; a phase outside every
segment uses that phase heading. Duplicate findings use the second declaration or phase heading. Placeholder values
are rendered as their source tokens without backtick decoration.

Only `content` events after a phase and before its first parent form the preamble-declaration window. A `_Mode:_` or
`_Exit criterion:_` label outside that window is inert: it neither opts the list into the contract nor satisfies a
declaration. Inside the window, any line beginning the exact `_Mode:_` label opts in; the remainder must carry a
backticked token, optional `through Phase N`, em dash, and non-empty gloss. An exact `_Exit criterion:_` label must
carry non-whitespace prose. `_Retired in:_` deliberately uses the task-body window instead.

## Mode-classification cases

The three cases the discriminator was derived and checked against. Only the first is a real task plan.

- `review-architecture` — the one corpus case with a real task plan whose ordering can be read. Residual risk was
  composition; its problems were discovered at review. Classifies as `slice`, matching its own postmortem.
- A two-mirror documentation verb-rename sweep — constructed. The design is trivial, the mechanics are the risk.
  Classifies as `pilot-then-replicate` (`slice` pilot, then `replication`).
- `chunked-delivery` — residual risk in the substrate contract (the delivery plan and its identity model), but it
  carried no task list, so this reads its design sequencing rather than a task plan. Suggestive of `layer`, not a
  validation.

Mode-classification practice is the thin part of the grounding: no second corpus task plan has been classified
against the three modes. This work unit's own task list is the first authored under the contract.

## Prior-art citations

- **Walking skeleton** (Cockburn; Freeman and Pryce, _Growing Object-Oriented Software, Guided by Tests_) — the
  anchor citation for the thin, real, kept, end-to-end-first idiom. "Tracer bullet" (Hunt and Thomas, _The
  Pragmatic Programmer_) and "steel thread" are the same idiom under other names; steel thread's notability is
  contested, so it is not cited as an anchor.
- **Acceptance test per slice** (Freeman and Pryce) — an executable end-to-end test reads each increment's
  done-ness rather than structural assertions; the strongest sourced form of the executable exit criterion.
- **SPIDR** (Cohn) — the published discriminator "if no cut produces a shippable slice, it is a scope problem, not
  a splitting problem"; with enabler work, layer-first, canary, and expand-contract, externally validates the
  three-mode taxonomy.
- **Large-scale changes** (_Software Engineering at Google_, ch. 22) — the institutional precedent for
  prove-once-then-mass-apply; "done" is explicitly case-per-change, so the `replication` completion criterion
  ("enumerated surface exhausted, batch-verified") is coined into a real gap.
- **Parallel Change** (Fowler: expand, migrate, contract) — the staged-composition precedent; canary and progressive
  delivery are the deployment-side analogue.
- **Do not cite** Rule of Three or Spike-and-Stabilize as prior art here; both are commonly mis-cited analogues of
  the wrong shape.

## Planning-close capture set

Routed via `arc-inbox` at planning close (the generate-tasks boundary), never by editing sibling work units'
tracked buffers:

- `plan-amendment` — the verifier-as-evidence-sink property and where a failed exit criterion's corrective work
  lands. Three captures carrying the archived delivery task list's evidence (revision anchoring, report replay,
  amendment-trail linkage) are already routed (2026-09-07).
- `review-orchestration-right-sizing` — the vocabulary boundary: `segment` is a task-plan boundary, never a delivery
  member; that work unit owns member "resegmentation".
- `synthesis-modality` — the `spike` / `slice` attestation boundary and the parallel-shape expectation between its
  spike-disposition contract and the retiring-owner clause. No dependency edge; light coordination only.
- `knowledge-architecture` — heads-up that its fire-site placement principle was applied here (inline at the
  operation, extracted on fan-in), and that this work unit is not yet in its coordination siblings.
- `task-list-conventions` — owns the formatting strategy, template, and generate-tasks formatting surfaces this
  work unit edits; its "verification-as-spine versus terminal verification phase" item is the territory this
  doctrine mechanizes. Confirm edit ownership if it activates first.
- `decomposition-doctrine` — the residual-risk axis offered as input to the concern-to-work-unit test, claiming no
  authority.
- `composable-workflows` — the inlined `resolve-plan-segmentation` procedure is method-shaped and lifts into its
  private-method cell at the generate-tasks procedure-library cut.
- `workflow-eval-harness` — eval coverage for the task-generation judgment prose this work unit edits.

Two concerns surfaced while grounding the task plan and were routed to `USER-INBOX` rather than folded in:

- The install set is hand-maintained and roughly a dozen files carry no recipe disposition, so they reach no
  project. The testing-standards instance is owned here — three installed surfaces declared or linked it while
  nothing installed it, and D10's fire-point split is inert without it — so the capture holds the residual
  population and the general defect behind it.
- The canonical task-descriptor fixture is inert: the template is selected by both lint fire sites, but its whole
  example sits inside a fence the structural scanner skips, so nothing validates the shipped skeleton. The fence
  is load-bearing, which makes the fix a fork rather than a repair.

## Assumptions carried into execution

- The cost of authoring a vertical plan is lower than the expected cost of late discovery on the work units where
  the discriminator says vertical. Unvalidated, and hard to validate other than by use.
- The triage between "a stub" and "an ordinary partial implementation" is decidable by the author at task
  generation; the scan checks only that a named retiring phase exists.
- `runtime-composition-seams`' wiring-obligation capture (deterministic reachability: exported symbols with no
  non-test importer) complements rather than substitutes for lifecycle scenario ownership. Keep the two distinct
  when authoring exit-criterion content.
- `unit-scoped-review`'s batch-eligibility predicate keys on determinacy and does not detect composition risk;
  segmentation is not evidence against batch eligibility. What a segment boundary offers a batch reviewer is where
  to look.

---
