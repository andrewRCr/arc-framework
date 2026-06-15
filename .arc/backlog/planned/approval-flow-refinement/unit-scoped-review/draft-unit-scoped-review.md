# Draft: Unit-Scoped Review (deferring the review increment to the whole work unit)

**Cohort:** `approval-flow-refinement`

**Purpose:** Make "widen the review increment to the whole work unit" a first-class, principle-aligned, opt-in
capability — the user may authorize an activated WU to execute its entire task list through the validation phase
and stop there (at the success-criteria / integration boundary) rather than at each leaf, with the structured
approval gate relocated to the WU boundary rather than abandoned. Not the default; advisory guidance frames when
it fits and when it doesn't; hard floors and a runtime break-out discipline keep it identity-consistent rather
than a concession to "anything-goes" autonomy.

- **State:** Draft — captured 2026-06-15. Pre-PRD.
- **Created:** 2026-06-15
- **Origin:** Surfaced 2026-06-15 in an exploratory session-init discussion (intended as an errand; routed to a
  planned stub given the design density). The premise: the bulk of the industry has moved toward more autonomous
  execution, often bypassing review entirely; ARC won't cross the no-human-gate line, but a middle ground —
  rigorous planning + agent-side execution discipline preserved, with the *review increment* widened on request —
  is far less out-of-step with ARC's principles than it first appears, given ARC's maturity (right-sized WUs,
  decomposition discipline, spec-directedness) and improved agent capability.

**Naming note.** `unit-scoped-review` is provisional. The term is coupled to `commit-increments`, which is
already reconsidering the "review increment" vocabulary; settle the two together (this WU introduces "review
increment = whole WU," the limit of that axis) rather than minting a canonical-but-inconsistent gap. Avoid
"skip review" / "autonomous execution" framings — the capability is scope-*widening*, not a bypass.

---

## Problem / Motivation

ARC's default review increment is one leaf task: the agent stops, reports, and waits at every checkbox. That
per-leaf co-development loop is the right default and stays the default. But two pressures make a wider option
worth making first-class:

**a) Genuine, principle-consistent use cases.** For a determinate, bounded WU — a `Light` WU, or a `Heavy` one
whose weight is *scale* rather than *derivation* — where the design is fully settled in the spec and the task
list is concrete (three phases, not seven; no investigation/spike tasks), it is reasonable to say: "unless
something unexpected comes up, implement this and let me review it in one pass." Crucially, the
review-increment invariant (DEV-RULES.ARC § Review-Increment Invariant) is **not** violated — it is applied at a
wider boundary; the
spec-directed discipline is **unchanged** (and is the most important part); and ARC's agent-side execution
protocol (process-task-loop, quality gates, commit discipline) holds identically. ARC has also gotten much
better at keeping WUs right-sized and single-concern, so reviewing a whole WU at once — once near-absurd — is
far less so now.

**b) Realistic idiom.** Much of the industry has moved this way, to varying degrees of autonomy; many bypass
human review entirely (including the PR). ARC won't do that. But offering a *governed* middle ground — the
rigorous planning stages, the agent-side discipline, and a preserved human gate at the WU boundary — lets ARC
stay meaningfully different from "full autonomy" while meeting practitioners where they are. ARC has enough
load-bearing process besides the per-leaf task interlock (spec-directed planning, quality gates, the
integration interlock) that relaxing review *frequency* is not the same as relaxing review.

**Why this is net-new, not "users can already do this."** Today's deferred review is user-scoped to a *named
range* ("proceed to 3.4") and explicitly "a bounded convenience, not an autonomy mode." Widening to the whole
WU changes the *character*: it pre-authorizes phases not yet examined and the validation phase itself, across a
stretch with no human checkpoint. The safety machinery has to *scale up* accordingly (the break-out matrix
below). So this is a real design — and that scaling is also the answer to "an agent would comply with a wide
range anyway": compliance *without* the matrix is the unsafe version this WU exists to replace.

## Proposed Shape

### The reframe: the review increment is a graduated scope

Model the review-increment boundary as a small enum — **leaf / phase / WU** — where the leaf is the default and
the WU is the maximum. Deferred review already widens leaf → a named range; this generalizes the axis and names
its endpoints. "Review increment = phase" is a lower-stakes intermediate setting (stop at each phase boundary
with the deviation ledger so far) and a natural stepping stone; "review increment = WU" runs the whole task list
through the validation phase and stops at the integration boundary. The task interlock is **not bypassed** — it
fires once, at the widened boundary; the increment still closes with a structured approval gate.

### What is preserved (the floors)

- **Spec-directed discipline — and it becomes *more* load-bearing, not unchanged.** Per-leaf, a thin/wrong spec
  is caught at increment one. WU-scoped, a spec gap propagates through the whole implementation before any human
  sees it — blast radius = the whole WU. So spec completeness is now load-bearing in a way it wasn't, which is
  why eligibility keys on spec determinacy (below). The self-regulating consequence is the strongest safety
  argument: **a spec too thin to support batching forces break-outs that collapse the run back to per-leaf
  review** — the safe mode. The blast radius is bounded by the break-out discipline.
- **The integration interlock is untouched — the hard floor.** Even in full WU-scoped deferral, the agent runs
  to the validation phase and **stops at the integration boundary**; merge requires explicit human authorization
  (the always-stop integration interlock — never inferred from task approval, review completion, or passing
  checks). "lgtm, integrate" *is* that authorization: an explicit, structured decision at exactly the gate ARC
  wants the human. ARC guarantees the *gate*, never *diligence* — and never has, for any mode. So this weakens
  nothing. (You cannot force a human to read a diff; you can guarantee an explicit gate at the WU boundary, and
  this preserves it.)
- **Planning stages cannot be batched or routed autonomously.** Draft → spec → tasks stay human-gated; there is
  no autonomous path through them and there must not be. This floor needs no enforcement effort — ARC supports
  no other approach — but state it explicitly.
- **Quality gates and commit cadence are unchanged.** Per-task (T1) and per-phase (T2) gates still run during
  the run; a gate failure is a hard break (see below). Commits still land per-leaf during the run — this is
  exactly `commit-increments`' "deferred review releases commits at leaf boundaries; the scope declaration is
  the approval signal." That keeps a clean, bisectable, atomic commit history for the reviewer at the WU
  boundary (no entangled multi-task diff). Only the *human approval stop* relocates; commit and quality-gate
  cadence do not.

### The break-out matrix (the safety mechanism — the crux)

In per-leaf mode the human is the safety valve every increment. In WU-scoped mode the human has delegated that,
so the **agent's pause-and-signal discipline becomes the substitute safety mechanism** — and the feature is
principle-consistent *only* to the degree that discipline is rigorous and first-class.

The gate point does not disappear; it becomes a **conditional stop**. At each task completion the agent runs a
lightweight break-out check instead of a full stop-and-ask: did anything cross a hard trigger? If yes → stop,
surface, re-raise the human. If no → log any discretionary calls (ledger, below) and continue.

**Hard triggers (mandatory; the pre-authorization does not override them)** — note every one is *already* a
mandatory stop in ARC, so this collects rather than invents:

- An emergent design question / spec gap. Spec-directedness already forbids resolving design autonomously, so
  "something unexpected" is precisely "an unsettled design question surfaced" — and stopping is already
  mandated. **The spec-directedness floor doubles as the pause trigger.**
- A quality-gate failure not trivially auto-fixable (already "never proceed until resolved or approved").
- The plan/spec turns out wrong against reality — the determinacy premise the run rests on has failed.
- Out-of-WU scope surfacing that would change the WU boundary (already routed — errand/capture).

**Soft deviations (resolve + log, do not stop):** a minor ambiguity resolved with a defensible reading, a
same-concern inline cleanup, a small assumption. The materiality line between "log" and "stop" *is* the existing
design/implementation boundary ARC already draws: implementation-detail latitude → log; anything that forecloses
a design alternative or is hard to reverse → hard break.

**The decision / deviation ledger (net-new, load-bearing).** In per-leaf review the human sees every judgment
call. In a WU batch they do not — so the agent must *accumulate* its discretionary calls and surface them at the
terminal validation gate: not just "here's the diff" but "here's every place I exercised latitude, and why."
The ledger is the co-development substitute for the suspended per-leaf stops; without it, "review the whole WU"
really is just "trust me."

**Pre-authorization does not survive a hard break.** A hard break is evidence the determinacy premise was
violated, so resuming the wide scope requires re-affirmation — the human resolves the issue and explicitly
chooses "keep deferring" or "go per-leaf from here." Silent resume would re-arm an assumption that just proved
false.

### The eligibility predicate (advisory)

Advisory, not a gate (the user owns their PR). The agent *asserts a read* and the human overrides freely. Inputs,
sharpest first:

- **Derivation axis, not scale.** Eligibility is roughly inverse to the *derivation* half of `Class`, not `Class`
  wholesale: a scale-`Heavy` WU (big but determinate) is fine to batch; an inventive small one is not. `Novel`
  → strong caution; low-derivation `Light`/`Heavy` → green.
- **Spec determinacy — *not* spec length.** Completeness is relative to the work's actual derivation demand. A
  `Light` WU's appropriately-thin spec is *complete* and *more* batch-eligible, not less. The predicate is "the
  spec leaves no open design question for the work it covers," never "the spec is heavy."
- **Task-list shape — the mechanical signal.** A determinate task list has concrete, verb-bounded leaves with
  clear success criteria; the presence of *investigate / spike / "figure out" / "design"* tasks is a near-objective
  batch-ineligibility flag. Cheap to check; the front-line gate.
- **Context budget (see Phasing).** Whether the WU plausibly completes within one context window on the target
  harness — correlated with the determinacy signals above (small, determinate, few-phase WUs both batch well and
  fit).

Advisory for judgment calls; a **structural hard-no** only when a floor is implicated (e.g., the task list still
has spike tasks — that is "not eligible, here's why," not a caution). Batch mode is **session state** (sticky,
like a deferred-review scope spanning the WU), surfaced at handoff so a resumed session continues in the right
mode.

### The pre-flight config gate

In batch mode commits release per-leaf, so if the harness throws an interactive permission prompt at the first
commit while the user has stepped away, the premise collapses (worse than per-leaf — they expected to be gone).
So batch mode has a hard precondition: **the agent's path through the run must be non-blocking.** A pre-flight
check verifies the *posture* before entering batch mode:

- **Commit/push slice (ARC-owned):** the release wrappers (`arc release commit` / `arc release push`) — the
  recommended, audited, non-blocking path. **Bypass is not required.** "Normal harness config + release wrappers"
  is fully viable and is probably the *more* common shape: a user who trusts ARC's workflow-emitted commits
  specifically (narrowly allowlist the wrapper commands) + `releaseOptedIn: true`, without granting broad
  autonomy. The probe already surfaces `commit.interlock` / `push.interlock` / `releaseRouting`; the gap is the
  harness allowlist (settings.json), which ARC sees only partially — so the gate is part config-verify, part
  confirm-with-user.
- **Edit/gate slice (harness-owned):** file edits and quality-gate commands (lint/test/build) must also not
  block — under a non-bypass config that means an edit-accepting posture + the usual dev commands allowlisted,
  which for an established ARC user is typically already true.

The requirement **self-selects the right audience**: anyone who'd *want* batch mode already runs fairly
autonomously; a user on full interactive per-commit approval doesn't want batch mode anyway. The gate guards the
*mismatch* case (wants batch, hasn't configured), not the feature's natural users. Ownership split: the
*precondition check* is this WU's; the *friction fixes* (no-active-WU wrapper refusals, prompt-prefix, etc.)
belong to `interlock-release-refinement`.

### Orchestration architecture (the reconciliation with the bounded-session model)

A WU-scoped run will tend to span more tasks than a bounded session comfortably holds — which collides head-on
with ARC's session model (see § ADR-002 / P5 reckoning). The resolution is architectural: in batch mode the
primary agent does **not** execute most tasks itself — it **delegates execution per phase to subagents**, then
validates the returned work *against the actual diff* (Axis-1: trust git, not the subagent's prose), marks the
task list, runs the break-out check, updates the ledger, and writes completion notes itself. The primary takes
the human's vacated per-increment seat.

Why this is the *correct* shape, not a hack:

- It keeps the **judgment/safety layer lean and in the primary** (spec + matrix + ledger + phase-summaries),
  while pushing **context-heavy mechanical execution to disposable, inherently-bounded subagents** (one phase,
  then discarded). So *every* context stays bounded — which honors the session model's actual concern ("no single
  context holding too much"), rather than fighting it.
- It maps onto the cohort north star and ARC's delegation rule: **mechanics (execution) may delegate; judgment
  (break-out detection, validation, ledger, the terminal gate) may not.**
- It **sidesteps** the compaction problem rather than depending on solving it.

This requires a principled carve-out to DEV-RULES.ARC § Sub-agent scope, which today forbids delegating
task-list work because doing so "bypasses the co-development loop and the mandatory review stop." That rationale
is **already waived by the batch authorization** — the user consented to suspend per-leaf review and
co-development — so delegating execution in batch mode bypasses nothing still in force; it is the *implementation*
of what was opted into, *provided* the primary retains the break-out matrix and validates against the real diff.
Caveats: **per-phase grain, not per-leaf** (per-leaf delegation is overhead-heavy); the **primary owns commits**
(so the config gate still applies, cleanly, to one orchestrator).

### Config gating (project-level governance)

A project-level config knob is a **team-governance** concern (a lead may deny WU-scoped deferral so all PRs get
incremental co-development), not a personal-preference one — user-level makes no sense (the user already chooses
per-invocation). Default should be permissive-on-request (solo adopters, the dominant early case, shouldn't flip
config to use a legitimate feature); a team can downgrade to denied. Genuinely arguable whether this is v1 or a
**forward-compat seam designed-toward and built when team mode matures** — the capability + matrices + methodology
framing are the irreducible core; the governance knob can follow. Decide at PRD.

## ADR-002 / P5 reckoning (named deliverable)

This WU pushes against ADR-002 P5 — bounded, human-controlled, transparent sessions whose per-leaf stops create
natural review points. The reckoning is owed directly (the `compaction-recovery` draft, the corpus's loudest
defender of the bounded-session stance, will object — see Composition). Prior assertions (ADR-002 is early;
`compaction-recovery` is recent but its anti-long-session framing is arguably overcautious) are evolving
best-thinking, not scripture; this is an evolution of ARC, and the move is to *align* them, not work around them.

The defensible position, made tractable by orchestration: WU-scoped review is a **scoped, opt-in relaxation of
review *frequency*** that preserves the load-bearing properties — bounded *contexts* (via orchestration),
human-controlled *gates* (the terminal validation gate + the untouched integration interlock), and transparency
(the deviation ledger). It is not "long monolithic autonomous sessions are fine" (which P5 rightly rejects); it
is "bounded sub-sessions under a lean human-seat orchestrator, with the human's gate relocated to the WU
boundary." Likely warrants an ADR — an amendment to ADR-002 or a companion — appropriate weight for a `Novel` WU
touching the spine. Settle at PRD whether the ADR + the orchestration architecture land in this WU or split to a
follow-up.

## Phasing

- **v1 — primary-executes, within-context-window, small/determinate WUs.** No orchestration, no compaction
  dependence (it fits the window and finishes fast), barely stresses P5 (a small WU fits a bounded session
  anyway). Proves the matrices + eligibility + config gate + integration-interlock preservation + the ledger.
  Minimal, honest, shippable.
- **v2 — orchestration.** The real ceiling-raise *and* the principled reconciliation with the bounded-session
  model. Where the full ADR-002 treatment + the § Sub-agent scope carve-out land.
- **`compaction-recovery` — backstop throughout, never the primary enabler.** Even orchestrated, the orchestrator
  reads each phase's diff to validate, so on a very large WU it can still compact; `session-recover` (the
  recovery-after-discontinuity half that draft endorses — *not* the rejected routine `arc-refresh`) is the safety
  net, exactly as for any long session. Cross-cohort dependency edge, not a blocker.

## Composition / Dependencies

- **Depends On `commit-increments` (hard).** The per-leaf-commits-during-batch property *is* that member's
  "deferred review releases commits at leaf boundaries" fix; without it a batch accumulates an entangled diff —
  the exact problem `commit-increments` solves. Also vocabulary-coupled (review-increment term).
- **Tight coordination with `interlock-release-refinement`.** Shares the "widen the approval unit / release the
  tail" machinery — its **errand approval-collapse** ("one increment-approval releases the full tail") is the
  sibling shape at *errand* scope; this is the same concept at *WU* scope (but stops at validation; it does
  **not** collapse the merge — the integration interlock holds). The pre-flight config gate consumes its
  wrapper-routing + approval-provenance work. Its first-class approval-provenance state composes: a batch
  authorization is a provenance source with WU scope.
- **`compaction-recovery` (`agent-context-optimization`) — backstop, cross-cohort.** See Phasing; also the
  two-way alignment note below.
- **Implies a methodology change to DEV-RULES.ARC § Sub-agent scope** if orchestration is adopted (the carve-out).
- **Forward-compat with `composable-workflows`.** Express process-task-loop *parametrically over increment scope*
  (the leaf/phase/WU enum) — the stop-and-gate is the fixed procedure; the boundary is the parameter. Do not
  rearchitect the loop into fragments here (that is CW's job) — define the parameter, coordinate the shape.
- **Coordinate with `out-of-wu-entry` (`agile-parallelism`) on the entry/activation signal.** Requesting batch
  mode at activation is an explicit-intent signal in the family `out-of-wu-entry` owns (`--errand` / `--housekeep`
  / `--new`, and a discussed `--plan`); sequence, don't duplicate.

**Two-way alignment with `compaction-recovery`.** Its current framing — "emergency bridge only," "disable
auto-compaction default unchanged," and the `arc-refresh` rejection rationale ("drift is from sessions running
too long / spanning too many tasks") — is in tension with a deliberately-long batch mode and is likely
overcautious. The resolution is alignment, not workaround: orchestration reconciles the bounded-*context*
concern (every context stays bounded), so `compaction-recovery`'s blanket anti-long-session stance should soften
from "no" to "a scoped, orchestrated exception exists, with `session-recover` as its backstop." Flagged into that
draft's coordination surface for reconciliation at its next planning iteration. Neither draft is more
authoritative than the other; align them.

## Alternatives

- **Full autonomy (auto-merge / skip the integration gate).** Rejected — crosses the no-human-gate line. The
  integration interlock is the hard floor that keeps this a middle ground, not "anything goes."
- **Primary-executes with `compaction-recovery` as the *primary* enabler of long runs.** Rejected — it fights
  ADR-002/P5, misuses `compaction-recovery` against its own stated scope, and would require the very ADR-002
  amendment that draft is at pains to avoid. Orchestration is the right enabler; recovery stays a backstop.
- **Per-leaf delegation in orchestration.** Rejected for overhead — per-phase is the right grain.
- **"Just use deferred review with a wide range."** Insufficient — today's deferred review is a bounded
  convenience, not an autonomy mode; at WU scale the safety machinery (break-out matrix, ledger, eligibility,
  config gate) must scale up. The wide range without that machinery is the unsafe version.
- **Strictly all-or-nothing (no phase scope).** Rejected — the graduated leaf/phase/WU enum gives a lower-stakes
  intermediate and a place for marginal eligibility cases to land.

## Unknowns and Assumptions (for PRD)

- **Naming / vocabulary.** Settle "review increment = WU" jointly with `commit-increments`' term reconsideration.
- **Config: v1 or forward-compat seam?** Project-level governance knob now, or designed-toward and built at team
  maturity.
- **Ledger ownership.** Owned here (the review-axis artifact) but composes with `commit-increments`' approval-
  provenance state — confirm the boundary.
- **Break-out taxonomy calibration.** The hard/soft split is grounded in the design/implementation boundary;
  beta usage may reveal triggers that need adding or materiality thresholds that need tuning.
- **ADR + orchestration split.** Whether the ADR-002 reckoning and the orchestration architecture land in this
  WU or a follow-up.
- **Phase scope in v1?** Whether the intermediate phase-scope ships in v1 or arrives with orchestration.
- **Entry-signal home.** Where the "activate in batch mode" signal lives — coordinate with `out-of-wu-entry`.

## Provenance

Surfaced 2026-06-15 in an exploratory session-init discussion (invoked as `--errand`; the errand flow is not yet
supported from an active-WU primary worktree — `out-of-wu-entry` territory — so routed to a planned stub off a
short-lived branch). Captured as a plan doc directly (no inbox graduation) given the design density: the reframe
(scope-widening, not bypass), the break-out matrix + ledger, the eligibility predicate, the config gate, the
orchestration reconciliation, and the ADR-002 reckoning were all shaped in that conversation.

---
