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
