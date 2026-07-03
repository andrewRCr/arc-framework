# Draft: planning-iteration-mechanics

- **Origin:** [internal] — spun off from `planning-pipeline-readiness` (PPR) at its scope-split planning
  (2026-06-17), to keep PPR spine-focused on the formalization-ready judgment + planning-stage-pointer mechanics.
  This WU holds the planning-_content_ concerns the cohort doc anticipated splitting: the iteration-time mechanics
  of how a planner drains a draft and corrects sizing mis-calls between draft-design entry and spec formalization.
- **Purpose:** Make the planning pipeline's **iteration & sizing mechanics** coherent — the three concerns that
  govern how a draft is _worked_ (distinct from PPR's spine, which owns _when it is ready_ and _where the stage
  pointer lives_): (1) the iteration-time Inbound Buffer integration ceremony (the drain ceiling), (2) depth-aware
  navigation as the correction mechanism for `Class` lane mis-calls, and (3) a grounded "oversized increment"
  granularity detector for `arc-task-audit`. Concerns (2) and (3) are twins — the same sizing-miscall correction
  at stage/`Class` granularity and at leaf granularity — and (1) is the iteration-time drain ceremony they share
  the facilitation moment with.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Co-design the generate-tasks boundary with `adversarial-review`**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: planning-iteration-mechanics`), housekeep drain
  (2026-07-03); captured during `adversarial-review` planning.
- _Concern:_ `adversarial-review` wires an adversarial `task-audit` pass at generate-tasks finalization, while
  this WU owns the adjacent question of whether generate-tasks needs an entry/spec-readiness gate. These are
  adjacent decisions at the same stage boundary, not one duplicated question.
- _Fold-in:_ co-design entry gate vs finalization pass vs both. Keep the leaf-magnitude detector's landing spot
  this WU's call, with the adversarial task-generation rubric as a second consumer.

### `[ ]` **Codify planning closeout and keep task lists implementation-only**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: planning-iteration-mechanics`), housekeep drain
  (2026-07-03); captured during `adversarial-review` task generation.
- _Concern:_ coordination-seam routing is planning-stage work whose evidence lives in the planning record and
  gitignored captures, not in the implementation task list. Success criteria should be tracked at the earliest
  boundary whose validator can see the evidence.
- _Fold-in:_ add a planning-closeout gate at the generate-tasks finalization boundary that verifies coordination
  seams/captures are routed. Derive the task-list-formatting rule that task-list success criteria stay
  implementation-verifiable.

### `[ ]` **`assess-spec-readiness` — codify the spec-readiness check + open-questions discipline (draft/spec asymmetry)**

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: planning-iteration-mechanics`), housekeep drain (2026-06-19);
  captured during `lifecycle-mechanics-tail` create-spec, Open Questions discussion (2026-06-18).
- _Concern:_ the draft has a reusable `assess-draft-readiness` method (fires at draft-design exit + create-spec
  entry); the spec has no symmetric one. Spec readiness is asserted by `spec-review` + the human Gate 1 at
  create-spec (producer) and only backstopped _reactively_ at generate-tasks (consumer) by the grounding-audit
  re-entry valve — no proactive consumer-entry gate. Diagnosed ~80% principled (the spec gets human Gate 1/2 the
  draft never does; the two spec boundaries ask different questions, weakening the shared-method pull) + ~20% real
  gap.
- _Scope:_ the genuine gap is that the **open-questions discipline has no single home** — the "legitimately open
  vs. masked decision?" line lives implicitly in three places (`assess-draft-readiness` criterion 1 / the
  divergence test, create-spec's `detailed` "open for the right reason" prose, DEV-RULES § Design before
  implementation). PPR owns `assess-draft-readiness` + the create-spec interlock split, so this is its lineage;
  this WU already owns the planning-content split + a buffer-drain contract with that method.
- _Approach (lean, not decided):_ don't mint a full `assess-spec-readiness` method just for symmetry — codify the
  open-questions discipline in one home (sharpen `assess-draft-readiness` criterion 1) and add the
  **decide-now-vs-false-precision** test there: an open question is legitimately open iff leaving it open won't
  change the task list / scope; it's a masked decision iff deciding it now would. A full method only earns its keep
  if generate-tasks should gate _proactively_ at entry (symmetric to create-spec's draft-readiness entry gate) vs.
  relying on the grounding-audit backstop — a planning-time call for this WU.
- _2nd live instance (housekeep drain 2026-06-21; from errand-lattice create-spec, 2026-06-19):_ second
  confirmation of the same open-questions-discipline gap. errand-lattice create-spec first parked the state-ref
  tree-merge as an "implementation detail" Open Question; on review it was a **masked design decision** — the merge
  algorithm had to be authored before any impl task could be written — so it was pulled into Proposed Design. Two
  sibling open questions were also wrong as first written (legacy-errand backfill → dropped; decompose-as-errand →
  re-cut to a dependency seam). Three open questions, none legitimately open as drafted.
- _Sharper operational handle (the net-new — fold into the Approach above):_ alongside the
  decide-now-vs-false-precision test, add the **writable-task** framing — an open question is genuine impl latitude
  iff a concrete implementation task can be written against it now; if the only task you could write is "figure this
  out, then implement," it is settle-able design masquerading as impl detail → resolve it into the spec (or fire the
  re-entry valve), never park it.

### `[ ]` **Re-validate planning readiness at the planning→init boundary (declarations decay over time)**

- _Routed from:_ USER-INBOX housekeep drain (2026-06-24); captured during `lifecycle-closeout` planning
  (2026-06-22). A temporal-validity extension of this WU's `assess-draft-readiness` / `assess-spec-readiness`
  lineage, adjacent to but distinct from Concern 1's buffer-drain seam.
- _Concern:_ a draft's point-in-time readiness / forward-action declarations ("formalization-ready",
  "Next: create-spec") and the code-owned `Current Workflow` stage pointer persist as if durable — but a backlog
  stub is typically initialized/activated **weeks** later, once dependencies shipped and the codebase drifted.
  Nothing re-validates them at the init/activation boundary, so a long-sitting draft can be graduated on a stale
  "ready."
- _Two halves:_ (a) **Draft-side guard** — don't preemptively persist forward-action as durable. PPR built half
  (the `[begin current workflow]` `Next Action` sentinel + code-owned `Current Workflow` pointer); the missing
  piece is a convention that the _draft itself_ not assert a standing next-stage / readiness — the meta pointer is
  authoritative. (b) **Init-side backstop** — `init-work-unit` (and session-init resume of a long-sitting stub)
  should **re-validate** readiness against current state, a natural **third fire-point** for
  `assess-draft-readiness` (at init/activation), alongside its draft-design-exit and create-spec-entry firings.
- _Scope:_ planning-readiness machinery (`assess-draft-readiness` + a new init-time fire-point), the draft
  convention (`draft-design` / template), `init-work-unit`, and `session-init`'s resume / discovery arms; both
  copies. Design fork (where the re-validation lives, what the staleness signal is) → reviewed lane.

### `[ ]` **Planning-stage recovery after compaction: harness summary vs. stale `Current Workflow`**

- _Routed from:_ `compaction-recovery` Phase 4.R (2026-06-28).
- _Concern:_ after harness compaction, `Current Workflow` is a soft active-meta field just like `Next Task` /
  `Next Action`: it may reflect the last handoff rather than the interrupted planning leaf. Recovery now treats
  execution cursor state as task-list-derived, but planning has no equivalent deterministic task-list cursor.
- _Coordination:_ when this WU defines planning-stage pointer mechanics, include the recovery case: the harness
  compaction summary is the volatile source of truth, and `arc recover audit --json` can only flag
  `planning-workflow-uncertain`. Define what counts as a verifiable summary-stage anchor so agents ask the user
  only when the summary is missing, vague, or contradictory.

### `[ ]` **Cohort-scoped grooming entry — groom a cohort doc + ≥2 member drafts on one backlog branch**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: planning-iteration-mechanics`), housekeep drain
  (2026-06-25); surfaced grooming `cross-machine-coherence` (no cohort doc, both member drafts stale).
- _Concern:_ no first-class entry grooms a whole cohort in one pass. `--plan <stub>` / `arc-plan` is single-stub
  (one committable grooming branch per stub). `decompose-work-unit`'s `backlog-stub-source` arm has the right
  branch model (short-lived `chore/decompose-<name>` off base, backlog-only, auto-merge lane, ROADMAP regen) and
  a cohort-doc _mint_ (from `template-cohort.md`), but is gated to the one-origin→N transform and only _creates_ a
  doc — no path to **backfill** a `cohort-*.md` onto an existing doc-less cohort, nor to re-ground multiple member
  drafts together. Today: N separate `--plan <stub>` sessions or a hand-rolled branch.
- _Proposed:_ a "groom cohort" entry — generalize `--plan` to accept a cohort, or a sibling signal — opening one
  `chore/groom-<cohort>` off base, scoped to the cohort doc + named members, landing one backlog PR owned by no
  member's WU branch. Lift the cohort-doc backfill out of `decompose-work-unit` as a shared ceremony; define the
  ownership boundary with decompose (which owns the branch pattern + mint); reuse the cohort-consistency guard.
- _Reframe (2026-07-03 housekeep):_ branch-containment/grooming teardown friction sharpened this from
  cohort-only to a more general **planning-grooming entry**: one committable branch may need to cover an arbitrary
  set of stubs/cohort docs, not just one cohort. Coordinate with `skill-infrastructure-cleanup`'s typed
  grooming-branch record item; the future mint primitive should identify the grooming target set and avoid bare
  `chore/` branches being misread as errands.
- _Forward-compat:_ the shared-ceremony lift should compose with `composable-workflows`' conditional-fragment
  composition (the same substrate the adjacent `--plan` gate-suppression entry routes to) — treat the
  cohort-doc-author fragment as a candidate early consumer.
- _Scope:_ Heavy — design (entry shape + decompose ownership boundary) plus multi-surface impl (session-init
  signal-leaf, `draft-design` grooming-entry, `arc-plan` skill, a CLI surface, the backfill ceremony, tests).

### `[ ]` **Seam: `adversarial-review` consumes this WU's readiness criteria + leaf-magnitude lens**

- _Routed from:_ housekeep drain (2026-07-01), scoping the new `adversarial-review` WU.
- _Concern:_ `adversarial-review` delivers the fresh-subagent _mechanism_ that runs planning-stage rubrics
  adversarially; this WU owns the _rubrics / criteria_ it runs — the `assess-spec-readiness` / open-questions
  discipline and the leaf-magnitude / oversized-increment detector. They compose (mechanism × rubric), so
  co-design the boundary rather than duplicating.
- _Load-bearing overlap:_ this WU's open question **"should generate-tasks gate proactively at entry?"** is the
  **same** question as "does an adversarial task-gen pass fire at that boundary" in `adversarial-review`. Settle
  it once, across both.

---

## Problem / Motivation

The planning pipeline's _readiness_ surface (when is a draft spec-ready, who decides, how the stage pointer
advances) is PPR's spine. Orthogonal to it is the _iteration_ surface: the mechanics a planner applies **while**
working a draft. Three of these are under-built today and were carried in PPR's Inbound Buffer until the
scope-split routed them here so PPR stays spine-focused. They cohere as one concern — "how a draft is iterated and
right-sized" — and (2)+(3) are a matched pair, so splitting them apart would fragment a single sizing-correction
idea across two homes.

## Concern 1 — Iteration-time Inbound Buffer integration ceremony (drain integration-mode ceiling)

- _Routed from:_ `arc-plan-conductor` draft Inbound Buffer (origin: work-routing-discipline Phase 6.R,
  2026-06-01), re-homed at the conductor decomposition (2026-06-12), then to this WU at PPR's scope-split
  (2026-06-17).
- _Concern:_ work-routing-discipline landed the **floor** — the two-mode routing rule, the `## Inbound Buffer —
  Pending Integration` convention, and a minimal forcing hook in `create-spec.md` § Resolve depth & Class
  (integrate the buffer before the plan feeds the spec). The **ceiling**: a first-class buffer-drain step in the
  `draft-design` / iteration moment that _mandatorily_ integrates a draft's `Inbound Buffer` into the body and
  **supersedes** the minimal `create-spec` hook.
- _Also:_ placement / visibility refinement (the buffer is an interstitial after Origin / Purpose, set off by
  `---`) and any structured-buffer schema belong here.
- _Seam with PPR:_ PPR's `assess-draft-readiness` method owns the readiness _criterion_ ("inbound-buffer
  drained" is a formalization-ready gate); this WU owns the drain _ceremony_ (the integration step that satisfies
  it). The contract to hold: the method requires "buffer empty," this WU builds the how — so the drain is not left
  homeless by the split.

## Concern 2 — Depth-aware navigation as the correction mechanism for `Class` lane mis-calls

- _Routed from:_ `arc-plan-conductor` draft Inbound Buffer (origin: `USER-INBOX § Backlog`, captured during
  `agile-wu-lifecycle` planning 2026-06-04), re-homed at the conductor decomposition (2026-06-12), then here at
  PPR's scope-split (2026-06-17). The vocabulary-realignment half of the original capture was already integrated
  into the conductor body and is **dismissed as done**; only the depth-aware-navigation design below survives.
- _Concern:_ depth-aware planning navigation can serve as the correction mechanism when a WU's `Class` is
  mis-called against the two decorrelating axes (derivation / scale) — a too-light or too-heavy lane surfaces
  during facilitation, and planning depth ratchets (routing a `Class` re-read) accordingly. The boundary-test
  thresholds themselves are `class-model-foundation`'s (shipped); this is only the planning-side navigation that
  consumes them.
- _Home note:_ the natural home is whatever owns planning-depth selection (`resolve-planning-depth` +
  `draft-design`). Carried here as the nearest planning-pipeline home — confirm the fit at iteration.

## Concern 3 — Grounded "oversized increment" granularity category for `arc-task-audit`

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: TBD` → `planning-pipeline-readiness` at drain, 2026-06-17);
  captured during `lifecycle-transition-core` session-init reviewing how Task 5.1 was under-decomposed
  (2026-06-15). Folded into this WU at PPR's scope-split (2026-06-17) as Concern 2's twin.
- _Concern:_ the DEV-RULES.ARC § Task granularity thresholds (>3 files / >50 lines core logic / interdependent /
  complex) have **no detector** pointed at them at the one moment a too-big leaf becomes visible — once grounded
  in the code. Root cause of Task 5.1 slipping through under-decomposed: the first production executor binder
  (reused across a whole phase) hid behind a "`start` dispatch" headline and read as one atomic leaf. The gap is a
  hole in the audit's lens set, not in the standard.
- _Approach:_ add a grounded "oversized increment / decomposition pressure" category to `arc-task-audit`, tied to
  § Task granularity. It must be **grounding-derived** (magnitude only shows in code → leans on the audit's
  step 2) and **survive `grounding-only` depth** (the `low` default + never-dropped floor, exactly where a
  small-looking leaf hides — likely fold a lightweight magnitude check into step 2, not only step 3). On a hit,
  **route into existing machinery**: gen-time → split in structural-decomposition or escalate via
  `resolve-planning-depth`; impl-time → `process-task-loop`'s agent-proposed-batch or a split. The audit's only
  new job is to _surface_ the leaf-magnitude signal.
- _Why existing mechanisms miss it:_ `generate-tasks` Structural-decomposition "Asymmetry" lens runs pre-grounding
  and keys off subtask-count (a no-subtask leaf draws no signal); `arc-task-audit` step 3's categories carry no
  magnitude axis; `resolve-planning-depth` responds at stage / list granularity, not leaf.
- _Home note:_ the capture flagged this sits "one seam over" at the spec→tasks scale-detection seam, so a
  dedicated stub stays a reasonable alternative if this WU's scope tightens. Folded here at PPR's scope-split as
  Concern 2's leaf-granularity twin (both route corrections through `resolve-planning-depth`); revisit the cut if
  the spec→tasks seam pulls it back out.

## Scope Estimate

Medium (days-week) — planning-workflow design touching `draft-design.md` / `create-spec.md` (the drain ceiling),
`resolve-planning-depth` + `draft-design` (depth-aware navigation), and `arc-task-audit` / `generate-tasks` (the
leaf-magnitude detector), across both the package source and the `.arc/` copy. `Class` resolves at draft-design
entry; likely `Heavy` given the multi-surface workflow design, but confirm against the derivation read.

## Dependencies

- **Coordination (not blockers):** `planning-pipeline-readiness` — the buffer-drain contract (Concern 1's seam)
  composes with PPR's `assess-draft-readiness` method; sequence so the readiness _criterion_ and the drain
  _ceremony_ agree. No hard dependency edge — the seam is a contract, not a gate.

## Continuity

- **Readiness:** stub-shaped. Three carried concerns with their origins and approaches preserved; the unifying
  thesis (iteration & sizing mechanics, with (2)/(3) as twins) is the design's spine to confirm at first
  iteration.
- **Next:** activate via `init-work-unit` Path A → iterate via `arc-plan` → `draft-design`. First move: confirm
  the three concerns cohere as one WU (or split Concern 3 back out if the spec→tasks seam pulls it), and settle
  the Concern 1 buffer-drain contract with PPR's readiness method.

---
