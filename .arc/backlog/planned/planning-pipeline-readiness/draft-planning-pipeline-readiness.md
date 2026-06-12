# Draft: Planning-Pipeline Readiness

- **Origin:** [internal]
- **Purpose:** Consolidate the cluster of concerns that all sit on the **planning-pipeline readiness-and-iteration
  surface** — the `draft-design` → `create-spec` entry gates and the iteration mechanics between them. Five
  concerns, routed here from the retired `arc-plan-conductor` draft and two USER-INBOX captures, share one logical
  seam: *when is a draft formalization-ready, who decides, and how does iteration drain a draft's pending inputs
  before it feeds a spec?* The unifying thesis to settle: a single formalization-ready judgment, consumed at the
  workflow that owns each fire point, with the readiness call landing in the consuming session against the draft's
  actual state — never pre-judged by a mechanical upstream step.

---

## Problem / Motivation

The readiness judgment ("is this draft ready to formalize into a spec?") is currently **duplicated, mis-placed,
and under-gated** across the planning pipeline:

- It is re-implemented in two places (`draft-design` owns the maturity ladder + formalization-ready bar;
  `create-spec` re-implements a lighter entry backstop and separately owns the inbound-buffer drain).
- `init-work-unit` pre-judges it mechanically, writing a `Next Action` pointer that often lies about where the
  work actually is.
- `create-spec` Finalize collapses spec-review and proceed-to-finalize into a single interlock, leaving no clean
  gate for a full spec read or iteration.

These were separate captures until the conductor decomposition surfaced that they are one concern. This stub
holds them together so a single iteration can cut them coherently rather than patching each in isolation.

## Scope Estimate

Medium (days-week) — load-bearing planning-workflow design touching `draft-design.md`, `create-spec.md`, and
`init-work-unit.md` across both the package source and the `.arc/` copy, plus a likely new shared method. Settle
the arm interactions (where the formalization-ready judgment lives; where the inbound-buffer drain fires) at spec
time before committing the cut.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's first planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Extract `assess-draft-readiness` as a shared formalization-ready method**

- *Routed from:* `USER-INBOX § Backlog`, `arc-plan-conductor` decomposition drain (2026-06-12); originally captured
  during `async-merge-lifecycle` session-init discussion.
- *Observation:* the "is this draft formalization-ready?" judgment is duplicated — `draft-design` owns the
  `fresh/rough/maturing/formalization-ready` ladder + the formalization-ready bar, while `create-spec`
  re-implements a lighter version as an entry backstop and separately owns the inbound-buffer drain.
- *Approach:* extract one method (formalization-ready bar + inbound-buffer-drained + no-open-settle-able-design)
  consumed at two live fire points: `draft-design` loop-exit and `create-spec` entry gate. Consolidates the check
  and gives the inbound-buffer drain a single home. Seam to resolve: the drain currently fires at `create-spec`
  entry, not `draft-design`, so routing not-ready work through `arc-plan` first means the method (or draft-design)
  must surface the buffer too.

### `[ ]` **`init-work-unit`: stop pre-judging spec-readiness — point `Next Action` at the readiness owner**

- *Routed from:* `USER-INBOX § Atomic`, `arc-plan-conductor` decomposition drain (2026-06-12); originally captured
  during `async-merge-lifecycle` session-init review of the meta `Next Action`.
- *Observation:* `init-work-unit.md` Step 4 fills the freeform `**Next Action:**` field and routinely writes
  "Run `create-spec.md`" even when the draft still has `## Inbound Buffer` entries or needs iteration — a
  mechanical workflow making a design judgment (is this draft spec-ready?) it shouldn't own. The pointer ends up
  lying about where the work actually is.
- *Approach:* init-work-unit never decides readiness — point `Next Action` at `arc-plan` whenever a `draft-*`
  exists, and at `create-spec` only when there is no draft / determinacy was confirmed. `arc-plan` (→
  `draft-design`) already does assess-then-route, so the readiness call lands in the consuming session against the
  draft's actual state, by the workflow that owns it. You point a `Next Action` at a skill/workflow, not a method,
  so this is **conductor-independent** (the readiness owner is `arc-plan` → `draft-design`). Reject the
  "extractable judgment block inside init-work-unit" shape — wrong altitude.
- *Note:* coupled-but-separable from the `assess-draft-readiness` item above (that is the shared method; this is
  just the pointer wording). Touches `.arc/system/**` — single-concern but load-bearing.

### `[ ]` **Iteration-time `Inbound Buffer` integration ceremony (drain integration-mode ceiling)**

- *Routed from:* `arc-plan-conductor` draft Inbound Buffer (origin: work-routing-discipline Phase 6.R, 2026-06-01),
  re-homed here at the conductor decomposition (2026-06-12).
- *Concern:* work-routing-discipline landed the **floor** — the two-mode routing rule, the `## Inbound Buffer —
  Pending Integration` convention, and a minimal forcing hook in `create-spec.md` § Resolve depth & Class
  (integrate the buffer before the plan feeds the spec). The **ceiling**: a first-class buffer-drain step in the
  draft-design / iteration moment that mandatorily integrates a draft's `Inbound Buffer` into the body and
  **supersedes** the minimal create-spec hook.
- *Also:* placement/visibility refinement (the buffer is an interstitial after Origin/Purpose, set off by `---`)
  and any structured-buffer schema belong here. (Was homed in the conductor as "the planning-iteration owner";
  that owner is now the `draft-design` / `arc-plan` iteration surface this stub consolidates.)

### `[ ]` **Split `create-spec` review/proceed interlocks + recommend on overlay prompts**

- *Routed from:* `arc-plan-conductor` draft Inbound Buffer (origin: `USER-INBOX § Atomic`, 2026-06-10, during the
  first latest-form `create-spec` run for `spec-decomposition-machinery.md`), re-homed here at the conductor
  decomposition (2026-06-12).
- *Concern:* `create-spec.md` Finalize collapses spec-review / iteration approval and proceed-to-finalize approval
  (draft retirement + meta update + commit) into one workflow-interlock. In practice, answering a Novel-overlay ADR
  scope question read as authorization to finish Finalize, leaving no clean gate for a full spec read, feedback, or
  iteration.
- *Also:* accept-or-decline overlay prompts (including the Novel ADR companion prompt) should carry the agent's
  recommendation plus brief rationale instead of presenting a fork without judgment.
- *Scope:* the likely outcome is two gates — review / iterate, then proceed-to-finalize. Decide whether this lands
  in `create-spec` or in overlay-bearing methods (`spec-review`, `resolve-planning-depth`).

### `[ ]` **Depth-aware navigation as the correction mechanism for `Class` lane mis-calls**

- *Routed from:* `arc-plan-conductor` draft Inbound Buffer (origin: `USER-INBOX § Backlog`, captured during
  `agile-wu-lifecycle` planning 2026-06-04), re-homed here at the conductor decomposition (2026-06-12). The
  vocabulary-realignment half of the original capture was already integrated into the conductor body and is
  **dismissed as done**; only the depth-aware-navigation design below survives.
- *Concern:* depth-aware planning navigation can serve as the correction mechanism when a WU's `Class` is mis-called
  against the two decorrelating axes (derivation / scale) — a too-light or too-heavy lane surfaces during
  facilitation, and planning depth ratchets (routing a `Class` re-read) accordingly. The boundary-test thresholds
  themselves are `class-model-foundation`'s (shipped); this is only the planning-side navigation that consumes them.
- *Note:* this was the conductor's depth-aware-navigation design; with the monolithic conductor retired, its natural
  home is whatever owns planning-depth selection (`resolve-planning-depth` + `draft-design`). Carried here as the
  nearest planning-pipeline home — confirm the fit at iteration.
