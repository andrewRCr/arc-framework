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

### `[ ]` **Planning-stage-pointer mechanics: a code-owned `Current Workflow` field + event-driven `Design`**

- *Routed from:* `lifecycle-transition-core` determinism/judgment-boundary review (2026-06-16). This is the
  **mechanics** half of #2 (the `init-work-unit` Next-Action pointer) — folded in when the boundary review found that
  PPR's "point `Next Action` at the readiness owner" is a *workaround* for the absence of a code-owned stage pointer.
  PPR owns the readiness *judgment* (#1 `assess-draft-readiness`); this entry adds the *pointer mechanics* it gates.
- *Concern:* session-init resolves the lifecycle workflow deterministically *between* phases (`State` → coarse
  bucket: `execution` → `process-task-loop`, `integration` → `integrate-work-unit`) but **prose-parses the planning
  sub-stage**: at `sessionType: planning` it reads the free-form meta `**Next Action:**` to pick
  `draft-design` / `create-spec` / `generate-tasks`, with an artifact-existence guess as fallback. The probe computes
  no sub-stage. The fallback is lossy (a draft + no spec can't distinguish "still drafting" from "drafting done,
  starting spec") — exactly why `Next Action` ends up overloaded as a workflow pointer and "lies about where the work
  is" (#2).
- *Approach (the field model):* split the **operational substrate pointer** from free-form judgment:
    - **`Current Workflow`** — a new code-owned **encoding** field naming the active lifecycle workflow, written by
      the executor at every transition (single-owner; never hand-edited). session-init then reads one deterministic
      field, no prose-parse. Redundant-but-machine-verified beats derived-but-fragile: the encoding-consistency test
      asserts it matches `(State, sub-stage)`.
    - **`Next Action`** drops the pointer and becomes pure within-stage judgment, or a bracketed sentinel at a clean
      boundary — `[begin current workflow]` (semantically correct, unlike `[none]` which reads as parked; the
      workflow *name* lives in `Current Workflow`, so no duplication; a disposition `reset` constant).
    - **`Design`** becomes an **event-driven pointer** (not a presence-scan): `[none] → draft-<name>` at draft
      creation; `draft-<name> → spec-<name>` **at create-spec finalization** (not spec existence — a spec can exist
      half-written while the draft is authoritative). The optional `notes-*` content migration is orthogonal (Design
      never points at `notes-*`); the mandatory draft-delete + repoint is mechanical at the finalization edge. No
      forced draft-first — a Light WU may go `[none] → spec` directly.
- *Enabling dependency:* requires the planning sub-stages (`draft-design` / `create-spec` / `generate-tasks`,
  incl. create-spec finalization) to become **CLI-recognized events** so the executor can advance the pointers —
  they are markdown-only today. Builds on `lifecycle-transition-core`'s executor encoding pattern (the `Branch`-field
  encoding write is the worked precedent) + the resolver. **Principle:** resolve-don't-store for reads (drift
  impossible — nothing stored), CLI-mutate + consistency-hook for writes (drift caught at commit). Interim until this
  lands: session-init reads `Current Workflow` for coarse buckets and keeps the Next-Action/artifact fallback **only**
  for the planning sub-stage (a narrowed surface, not the whole pointer).
- *Note:* this is a **spine** concern (consistency-on-exit: the lifecycle isn't coherent while the planning sub-stage
  is prose-parsed) — it stays even if the planning-*content* concerns (#3, #5) split off.

### `[ ]` **Add a grounded "oversized increment" granularity category to `arc-task-audit`**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: TBD` → `planning-pipeline-readiness` at drain, 2026-06-17);
  captured during `lifecycle-transition-core` session-init reviewing how Task 5.1 was under-decomposed (2026-06-15).
- *Concern:* the DEV-RULES.ARC § Task granularity thresholds (>3 files / >50 lines core logic / interdependent /
  complex) have **no detector** pointed at them at the one moment a too-big leaf becomes visible — once grounded in
  the code. Root cause of Task 5.1 slipping through under-decomposed: the first production executor binder (reused
  across a whole phase) hid behind a "`start` dispatch" headline and read as one atomic leaf. The gap is a hole in
  the audit's lens set, not in the standard.
- *Approach:* add a grounded "oversized increment / decomposition pressure" category to `arc-task-audit`, tied to
  § Task granularity. It must be **grounding-derived** (magnitude only shows in code → leans on the audit's step 2)
  and **survive `grounding-only` depth** (the `low` default + never-dropped floor, exactly where a small-looking
  leaf hides — likely fold a lightweight magnitude check into step 2, not only step 3). On a hit, **route into
  existing machinery**: gen-time → split in structural-decomposition or escalate via `resolve-planning-depth`;
  impl-time → `process-task-loop`'s agent-proposed-batch or a split. The audit's only new job is to *surface* the
  leaf-magnitude signal.
- *Why existing mechanisms miss it:* `generate-tasks` Structural-decomposition "Asymmetry" lens runs pre-grounding
  and keys off subtask-count (a no-subtask leaf draws no signal); `arc-task-audit` step 3's categories carry no
  magnitude axis; `resolve-planning-depth` responds at stage / list granularity, not leaf.
- *Home note:* landed here at drain as the nearest live owner of the grounding / planning seam; the capture flagged
  this sits "one seam over" at the spec→tasks scale-detection seam, so a dedicated stub stays a reasonable
  alternative if PPR's scope tightens.
