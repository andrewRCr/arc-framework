# Draft: Execution Delegation Doctrine (judgment/attention economy for implementation)

**Purpose:** Establish ARC's constitutional model for subagent delegation during implementation — replacing the
blanket DEV-RULES.ARC § Sub-agent scope prohibition with a conditions-based doctrine grounded in a refined
two-half invariant: **no judgment without a gate; no gate without a decision.** Owns the ADR-002 modernization
(the two-axis reframe of delegation), the four-flow delegability rubric, the trust-boundary floors, and a
minimal general-execution delegation capability inside ordinary per-leaf mode. Upstream substrate for
`unit-scoped-review` (which applies it at WU scope), and the principle anchor the `approval-flow-refinement`
members consume.

- **State:** Draft — captured 2026-07-02. Pre-PRD.
- **Created:** 2026-07-02
- **Origin:** [internal] — surfaced in a `--plan` freeform grooming session (2026-07-02) challenging the
  "delegation bypasses the co-development loop" posture. The reframe, rubric, floors, and capability shape were
  all settled in that conversation; this stub captures them at grooming quality.

---

## Problem / Motivation

**The per-leaf stop was always a proxy.** What ARC actually protects — traceable through P2, P11, and the
review-increment invariant — is that no judgment gets exercised without a human gate. Stopping at every leaf was
a good proxy under early conditions (thin specs, weaker agents, judgment leaking into implementation at every
step). ARC's planning pipeline now systematically drains judgment out of implementation ("settle all settle-able
design up front"), so the judgment density of impl has dropped — and the proxy has decoupled from the thing it
measured. The observable symptom: a human answering "commit and proceed?" prompts that carry no decision, which
wastes exactly the attention and judgment capacity ARC's own automation principle exists to preserve. Under
parallel work-in-flight this stops being an efficiency nicety: the operator becomes a scheduler of a
single-threaded attention resource, and undifferentiated per-leaf stops across concurrent WUs are an interrupt
storm.

**The current rule conflates three concerns with different statuses.** DEV-RULES.ARC § Sub-agent scope forbids
delegating task-list work because it "bypasses the co-development loop and the mandatory review stop." Decomposed:

- **(a) Review-stop integrity** — an invariant. But delegation done right doesn't touch it: if the primary
  delegates the *production* of one mechanical task, validates the diff, and stops at the same leaf boundary for
  the same human review, nothing was bypassed. The rule prohibits something that violates zero invariants.
- **(b) Human visibility / legibility** — real, but a property of *artifacts*, not of who typed. Trust the diff,
  never the subagent's prose; require legibility artifacts. Engineerable.
- **(c) Primary-context continuity** — the quiet third concern: the primary accumulates execution understanding
  that improves later tasks and later debugging. A real *cost* the fit-check prices in (see rubric), not a
  principle that gates.

**ADR-002 conflates two orthogonal axes.** Its Tier 3 "off-label" framing was defined by async-delegation tools
where *execution locus* (primary vs. delegated) and *gate presence* (human gates vs. none) traveled together —
dispatch to an opaque sandbox meant losing the gates. A synchronous, bounded, primary-supervised subagent on a
shared filesystem is a quadrant the ADR has no name for: **delegated locus, full gates**. The compatibility
spectrum classifies *the agent the human collaborates with* — still the Tier 1 primary; the subagent is a bounded
tool that primary wields. ADR-002 even blessed the shape in embryo ("ARC's own research sub-agent uses this
pattern"): the doctrine was never "no delegation," it was "no *ungated* delegation" — it just never got stated
that way.

## Proposed Shape

### The refined invariant (two halves)

1. **No judgment without a gate** — unchanged, identity-level. Judgment is never exercised autonomously;
   structured gates exist wherever judgment enters or a determinacy premise fails.
2. **No gate without a decision** — the new half. A stop that carries no decision is not discipline; it is waste
   on both sides of the loop (the human's attention, the agent's tokens/context). Human involvement scales with
   **judgment density, not activity volume** — the same axis `Class` already prices, extended to attention
   placement.

The review-increment invariant survives intact: every increment closes with a structured approval gate. What was
blunt is the implicit fixed reading "increment = leaf, always" — scope is the parameter (`unit-scoped-review`'s
leaf / phase / WU enum), and the default stays leaf.

### The § Sub-agent scope rewrite: prohibition → conditions

Mechanics may delegate; judgment may not. Delegation is permitted when:

- the gates are unmoved (or explicitly widened by the user through the graduated-scope machinery — never by
  delegation itself);
- the primary validates returned work **against the actual diff** (never the subagent's report) plus quality
  gates and success criteria;
- the work passes the four-flow rubric below (agent asserts a fit-read; the human overrides freely);
- the run's mutating operations stay inside the non-blocking posture floors below.

### The four-flow delegability rubric

A task is delegable when all four flows run favorable:

- **Judgment-in** — does the task contain unsettled decisions? Mechanical signal: concrete, verb-bounded leaves
  with clear success criteria; investigate / spike / design verbs are a near-objective no.
- **Context-in** — how much *unexternalized* session context does correct execution need? A task depending on
  conversation-only decisions delegates badly. Corollary: ARC's discipline of writing decisions into artifacts is
  precisely what creates delegability — delegation-readiness measures how well context has been externalized.
- **Verification-out** — can the primary validate the result cheaply (diff + gates + criteria)? A bulk rename
  verifies mechanically; a subtle semantics-preserving refactor doesn't — validation cost converges on
  doing-it-yourself, so delegation buys nothing.
- **Learning-out** — does executing this teach the primary something later tasks need? **Delegate the Nth
  instance of an established pattern, never the 1st.** Pattern-setting stays in the primary; pattern-following is
  the sweet spot. This is concern (c) operationalized — continuity enters the rubric, not the floors.

Worked boundary cases: debugging mostly fails judgment-in (investigation is judgment formation), though bounded
reproduction passes; test-writing fails verification-out deceptively (bad tests pass review easily; choosing what
to assert is judgment-adjacent); "fix all lint errors" passes everything. Spike work (see `synthesis-modality`):
spike *contract authoring* is judgment — never delegable; spike *execution against a settled contract* is
arguably the most delegable work in ARC (bounded, hypothesis-framed, acceptance-criteria-verifiable, learning
captured in artifacts by design).

### General-execution delegation (the v1 capability)

Inside ordinary per-leaf mode: the primary may propose delegating the production of a mechanical task, validate
the diff, and stop at the unchanged leaf gate. Proposal shape follows the advisory-fork pattern (fit-read +
recommendation; user decides). Posture knob: `off / propose / standing-consent-within-conditions`, default
`propose`. Grain: per-task here; per-phase under `unit-scoped-review`'s orchestration (a phase is a coherence
unit — coherence units don't split across contexts).

### Agent-role taxonomy (`worker` / `peer`)

Delegation's economics fail if every spawn burns primary-tier capability on work the rubric has certified as
judgment-drained — **capability follows judgment density**, the same axis that prices attention placement. The
inverse invariant is sharper: verification and adversarial roles need capability **parity** — a weaker skeptic is
worse than none (it manufactures false confidence at exactly the gate that was widened). Two spawn roles cover
the load-bearing cut; workflows and methods reference **roles, never model names** (model slugs rot in months —
the indirection is staleness-proofing as much as harness-agnosticism):

- **`worker`** — mechanical execution under a settled contract; capability step-down *permitted* (the work is
  rubric-passed by definition).
- **`peer`** — parity-critical: adversarial review, WU verification, anything whose output substitutes for
  judgment scrutiny; inherits the primary's capability. The adversarial planning-review mechanism's fresh
  verification subagents are this role's first named consumer.

**Resolution semantics.** Unmapped role → inherit the primary (parity is the always-safe fallback);
**step-down is configured, never inferred** — ARC cannot rank models across vendors and doesn't try; it states
the contract, the user maps. Mapping is per-harness config, not doctrine (the right `worker` on one harness is a
smaller model; on another it may be the primary's own model until a cheaper tier exists).

**Mechanism — named agent profiles, not prose model requests.** Harnesses don't reliably honor an in-prose
"spawn model X" (an agent may affirm and still spawn at peer capability); the reliable cross-harness primitive is
a **named agent definition/profile** carrying model + tool scope. ARC already regenerates the harness integration
layer deterministically (`arc update` → skills etc.); default `arc-worker` / `arc-peer` profiles ship through the
same per-harness generation pipeline (the adapters — reference implementations for the primary harnesses), with
an arc-config registry parameterizing each harness's model value (e.g. `agents.<harness>.worker`). Registry
values also accept a custom profile name, so swapping a team's own agent into a role is a config edit, not
machinery. Confirmation wires into `verify-and-configure` (init/join) and the `add-agent` surface (wiring a
later-adopted harness). Where a harness offers no model-scoped spawn primitive, degrade to inherit (P8).

### The floors

- **Integration interlock untouched** — merge always requires explicit human authorization; never inferred.
- **Planning gates human-gated** — planning is the judgment-dense zone, the *last* place to automate; out of
  scope here. (Adversarial planning review strengthens the agent's contribution *within* human gates — the right
  direction for that zone.)
- **Quality gates and commit discipline unchanged** — cadence holds whether primary or subagent produced the work.
- **Trust boundary: ARC never self-escalates.** The harness permission boundary is the user's, configured
  deliberately, ahead of time. Wrappers stay constitutionally narrow (refuse destructive flags; validate
  interlock state; audit) — a batch/delegation mode may teach a wrapper to *recognize new provenance shapes*
  (e.g., a batch authorization with declared scope); it never validates *less*. ARC's answer to "just disengage
  the permission gates" is differential trust: **make the trusted paths wide enough that broad permissiveness is
  unnecessary.**

### Non-blocking posture (precondition of any delegated or batched run)

- **Capability envelope, front-loaded.** Batch/delegation mode front-loads judgment; it front-loads trust
  decisions the same way. At entry, compute-request-verify the run's needed capability set (edit surface from the
  spec's file scope, quality-gate commands from DEV-RULES.PROJECT, wrapper commands) as one deliberate grant
  moment. ARC *reads* (partially), *requests*, *advises* — never *sets*; the user stays the grantor. Mechanism
  home: `unit-scoped-review`'s pre-flight gate (buffer-carried there).
- **Bounded command vocabulary.** Workflow-emitted operations come from a small, stable, documented command set —
  that is what makes narrow allowlisting possible. Binding on the orchestrator *and* its subagents (subagent tool
  calls flow through the same harness permission system; delegation doesn't escape prompts).
- **Stalls ≠ break-outs.** A mid-run harness permission prompt is a *stall* (capability gap → grant-and-resume),
  not a break-out trigger (premise failure); it never collapses a batch. End-of-run stall report feeds the
  allowlist so runs converge toward prompt-free.
- **P8 degradation.** Subagent facilities vary by harness; the machinery is capability-conditional and degrades
  gracefully to primary-executes. A convention, never a hard dependency.

## Composition / Dependencies

- **`adversarial-review` (in-flight) — sequencing edge.** It is independently modifying DEV-RULES.ARC
  § Sub-agent scope for its verification-subagent mechanism; this WU's rewrite lands after (and coordinates
  with) that edit. Recorded as the `Depends On`.
- **`approval-flow-refinement` (cross-cohort; consumed by all three members).** `unit-scoped-review`: its
  ADR-002 reckoning shrinks to "apply the doctrine at WU scope"; orchestration becomes an instance of this
  model; eligibility predicate = the WU-grain rubric reading; land this WU before its planning iteration.
  `interlock-release-refinement`: stacking collapse + approval-provenance gain the principle anchor; the wrapper
  coverage gap (merge / branch-delete) is upgraded to delegation-critical. `commit-increments`: gate-shaping +
  the vocabulary reconsideration accommodate the graduated-scope framing. All buffer-carried in those drafts;
  cross-cohort entry in `cohort-approval-flow-refinement.md`.
- **`comprehension-preservation` (new sibling stub) — the doctrine names the lever; that WU builds it.** The
  human-declared ride-along posture (orientation artifacts vs. audit artifacts) that defends the operator's
  mental model under delegated/batched execution.
- **`configuration` cohort — posture knob surface.** Where the delegation posture and any user-scoped levers
  live; consume whatever `config-storage-architecture` / `customization-arch-realign` land.
- **`agile-parallelism` — motivation, not a gate, in either direction.** Parallelism works mechanically without
  this; its attention payoff flows mostly through the `approval-flow-refinement` members. `finalize-parallelism`
  takes precedence; its draft sequence is deliberately untouched.
- **Research delegation** — the external-research delegation pattern (multi-tier research subagents) is a
  separate capability gap captured to `USER-INBOX`; this doctrine provides its grounding when picked up.

## Sequencing (recorded call, 2026-07-02)

- **Not before `interlock-release-refinement`** — IRR's routing/provenance core doesn't structurally consume the
  doctrine (the provenance schema already accommodates scoped sources per the cohort contract); the buffer entry
  carries the framing into its iteration. IRR stays next after `adversarial-review`.
- **Before `unit-scoped-review`'s planning iteration** — the one genuine upstream edge; slots naturally into the
  gap behind `commit-increments` without reordering anything.
- **`finalize-parallelism` takes precedence** — this WU is "valuable soon," not "parallelism blocks on it."

## Unknowns and Assumptions (for PRD)

- **ADR treatment:** amend ADR-002 or a companion ADR. The two-axis reframe plus the two-half invariant likely
  earn a companion; settle against `strategy-adr-methodology`'s amendment-vs-supersession model.
- **Principle-level text:** does the attention-economy half earn principle-level wording (PROJECT-PRD already
  carries the automation form), or does it stay constitutional-rules-level?
- **Rubric calibration:** the four flows are grounded in worked cases; beta usage may tune the mechanical signals
  (especially verification-out's "cheap to validate" line).
- **Posture knob surface:** project-level (team governance), user-level (personal), or both — note
  `unit-scoped-review`'s batch knob is project-level while `comprehension-preservation`'s lever is user-level;
  the delegation posture may be genuinely two-axis. Coordinate with the `configuration` cohort.
- **Legibility floor in per-leaf delegation:** probably nothing beyond diff + unchanged gate (the ledger is
  batch-scope machinery) — confirm.
- **Agent-role machinery split:** the enum + resolution semantics are constitutional and stay here; the profile
  generation + registry (adapters, config keys, `verify-and-configure` / `add-agent` wiring) may split to a
  build WU at PRD if scope grows. Codex-side per-spawn model control is unverified — adapter-level uncertainty
  to resolve at build.

## Provenance

Shaped end-to-end in a `--plan` freeform grooming session (2026-07-02): the proxy diagnosis, the two-half
invariant, the § Sub-agent scope decomposition (a/b/c) and wedge case, the two-axis ADR-002 reframe, the
four-flow rubric, the continuity-as-rubric-factor resolution, the trust-boundary floor, and the capability
envelope / stall taxonomy. Captured as a planned stub directly (no inbox graduation) given the design density.

---
