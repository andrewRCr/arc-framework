# Plan: Loadset Composition

**Purpose:** Re-evaluate ARC's always-loaded (T1) session-init document set against the
recognition-reliability evidence, demoting content to explicit-trigger loading where a reliable
trigger exists — and codify the decision rule so T1 membership stays principled going forward. Fourth
sibling in the agent-context-optimization cohort (renaming to `instruction-discipline`), alongside
`plan-instruction-optimization.md`, `plan-documentation-surface-routing.md`, and
`plan-handoff-optimization.md`.

- **State:** Draft — pre-PRD exploration captured 2026-05-21 from a maintainer-side exploratory session.
- **Created:** 2026-05-21
- **Origin:** Surfaced 2026-05-21 revisiting whether QUICK-REFERENCE earns always-loaded status, and
  more broadly whether improved models change ARC's prior "don't go all-in on JIT" stance. The revisit
  grounded itself in the existing context-loading research and found the answer is sharper than
  load-vs-lazy — see § Working Framing.

---

## Problem / Motivation

ARC front-loads a fixed set of constitutional + state documents at every session-init (T1/T2 in
`strategy-session-operations.md` § Context Loading Model). The set has grown by accretion; each
addition is principled in isolation, but the set as a whole has not been re-audited against the
question "does each document earn a slot in the every-session baseline?" The cost is not raw tokens —
it is instruction-budget pressure (the "curse of instructions", `research-instruction-reliability.md`)
and the dilution of genuinely load-bearing constraints by lower-value always-present content.

Two concrete observations motivate the audit:

1. **QUICK-REFERENCE is already half-demoted, and its residual largely duplicates other T1 docs.**
   session-init reads only `## Environment & Path Context` (~35 lines); the rest is already
   explicit-trigger ("load on demand when workflow steps reference them"). The residual environment
   section overlaps `AGENT-BRIEF.PROJECT.md` (repo-root rule, hybrid-project / npm-workspaces note,
   repository layout) and `DEV-RULES.PROJECT.md` (quality-gate commands) — both already T1.

2. **process-task-loop is the highest-cost T1 inclusion by the research's own measure.**
   `research-context-loading.md` flags detailed imperative workflow procedure as the most
   distraction-prone Tier-1 content and names process-task-loop as the prime Tier-2-demotion
   candidate. It is already state-conditionally promoted (execution sessions only), but loads whole.

## Working Framing

### The recognition-reliability lens (why this isn't load-vs-lazy)

`research-instruction-reliability.md` resolves the prior "don't go all-in on JIT" caution into a
precise spectrum of *recognition* reliability — whether the agent loads the content at the moment it
needs it:

- Always-present (T1): ~100%
- **Explicit trigger** ("when X, load Y", embedded in a loaded workflow/skill step): 85–95%
- Indexed / implicit awareness (STRATEGY-INDEX-style "you know this exists, notice when relevant"): 60–75%
- Search discovery: 20–40%

The prior caution was really a caution against *implicit awareness* (60–75%). It does not apply to
*explicit triggers*, which are nearly T1-grade. Maintainer experience corroborates: across months of
ARC sessions, explicit "load X" steps inside workflows fire reliably ~95%+; deviation is rare and
concentrated in **loop-style workflows** (today, `process-task-loop.md`), which still adhere highly
but occasionally slip on a sub-step.

The decision rule that falls out:

> Demote a T1 document only to an **explicit trigger**, never to implicit awareness — and never demote
> a **constraint** the agent cannot afford to have missed. Procedural content with a clean trigger
> point is the safe demotion target; constitutional constraints stay T1.

This rule is the WU's durable contribution — it sharpens the existing coarse heuristic ("when
uncertain, prefer T1") in `strategy-session-operations.md` § Classification Criteria.

### Canonical vs. instance (scope honesty)

A trap to avoid: `QUICK-REFERENCE.md` and `AGENT-BRIEF.PROJECT.md` both ship to adopters as near-empty
templates they fill themselves. Relocating *this repo's* environment content from one to the other is
**instance hygiene** — no adopter inherits the move. It must not be mistaken for a structural win.

The genuinely **canonical** deliverables — the ones that ship and affect every project — are:

- the **load-set membership decision** for each document *role* (does the environment-context role,
  the command-reference role, etc. earn T1?), expressed in `session-init.md` +
  `strategy-session-operations.md`;
- the **templates + placement guidance** that codify what content belongs in which surface
  (`template-*` for the affected docs, plus the guidance the templates carry).

Our own duplication is the *motivating instance* and a dogfooding case to validate the guidance — not
the deliverable. The WU operates at the canonical layer; the instance shuffle rides along as hygiene,
explicitly tagged as such.

## Proposed Shape (three layers)

**Layer 1 — Principle.** Codify the demotion decision rule (above) into `strategy-session-operations.md`
§ Context Loading Model / § Classification Criteria. Coordinate with the tier-aware-dedup principle
`plan-instruction-optimization.md` Pillar 1 already routes to the same section (operational decision
tree self-contained at tier-0/1; rationale + edge cases at tier-2) — the two principles are
complementary and should land coherently.

**Layer 2 — Audit.** Apply the rule to the current T1/T2 set; document keep-vs-demote per document with
the reason. Expected outcome: briefs and DEV-RULES stay (constraints / low-cost narrative — demoting
constraints is the riskiest move and the rule forbids it); QUICK-REFERENCE's residual demotes;
process-task-loop splits (Layer 3).

**Layer 3 — Execution.** The demotions that pass the rule:

- **QUICK-REFERENCE residual** — decide whether the environment-context role earns T1 at all. If not,
  drop the session-init partial read, fold the role's canonical guidance into the appropriate
  template(s), and (instance hygiene) relocate this repo's content. Small, clean.
- **process-task-loop core/detail split** — see § The Loop Canon.

## The Loop Canon

The process-task-loop split is not just a load-set tweak — it is the **canonical-loop redesign** that
ARC's other loop-style workflows inherit. Today there is one agent-executed loop
(`process-task-loop.md`); `plan-arc-plan-conductor.md` adds two more (`refine-plan-loop.md`,
`refine-prototype-loop.md`) and explicitly models them on "ARC's existing loop-style workflows" and
"the execution loop pattern." Three agent loops sharing a pattern is the condition where codification
earns its keep.

> `session-loop.md` is **not** part of this canon — it is a human-facing explainer of ARC's session
> flow, not an agent-executed/read workflow. Its own disposition (keep as human grounding, or extract
> into `strategy-session-operations.md` / retire) is a separate minor question, out of scope here but
> worth a look when this WU or the docs-organization work is in flight.

Shape: a thin always-loaded core loop (the per-task rhythm, mandatory stop, completion-protocol
skeleton) plus detailed sub-protocols (crash recovery, deferred-review mechanics, quality-gate-failure
handling, completion-notes discipline) pulled by explicit triggers at their step. This both trims the
T1 execution-session baseline and tightens the loop where adherence wobbles — the structural fix
expected to resolve the occasional loop-step slip.

**Forward-compat with arc-plan-conductor.** Because conductor's planning loops will consume this
pattern, the loop-canon design must be *informed by* conductor's intent — read
`plan-arc-plan-conductor.md` §§ 10, 17 and the `refine-plan-loop` / `refine-prototype-loop` contracts
during design so the canon generalizes cleanly rather than baking in execution-only assumptions.

**DRY loop-template (open).** Whether to extract the pattern into a codified artifact (a loop-flavored
companion to `template-workflow.md`, plus a `strategy-workflow-authoring.md` section) is left open —
see § Open Questions. Lean: this WU redesigns the canonical loop and *flags* the pattern; the
shared-template build is a kickoff coordination call with arc-plan-conductor, not committed to this
WU's scope. (Tangential: `plan-workflow-template-loads.md` is about *runtime* loading of authoring
templates via `arc.templates` frontmatter — a possible delivery mechanism, not the same concern as
authoring a loop template.)

## Coordination

### With `instruction-optimization`

- **process-task-loop ownership.** This WU absorbs the process-task-loop *structural* (re-tiering /
  core-detail split) work. `plan-instruction-optimization.md` Pillar 1's prose-compression of that
  same file folds in or sequences *after* the split — compressing a doc about to be restructured is
  wasted. Mirrors the precedent where `plan-documentation-surface-routing.md` absorbed IO Pillar 2.
- **Pillar 4 adjacency.** IO Pillar 4 (conditional loading of `session-init.md`'s own edge-case
  *sections*) shares this WU's "load less at init" philosophy but operates on a different axis
  (sections of an already-loaded workflow, not whole-doc tiering). Stays in IO; cross-ref.
- **Shared edit surface.** Both touch `strategy-session-operations.md` § Context Loading Model (this
  WU's decision rule; IO's tier-aware-dedup principle). Whoever lands first establishes the section;
  the other extends. Coordinate.

### With `arc-plan-conductor`

- **Inverted dependency.** Conductor *depends on* this WU for the loop canon; this WU does not depend
  on conductor. This WU should land first (at least the loop-canon piece) — conductor cannot consume a
  pattern that does not yet exist. Capture as a depends-on note on conductor's meta at kickoff.
- Relative scope: this WU is the smaller, more bounded effort; conductor is large. The ordering is
  feasible precisely because of that asymmetry.

### Cohort

- Cohort renames `agent-context-optimization` → `instruction-discipline` at planning kickoff (shared
  with the existing siblings). This WU's directory + meta join that batch rename.

## Sequencing

- **Hard prereq: post-WOR integration.** WOR reshapes lifecycle workflows, the `active/` structure,
  meta-file shape, and session-init item numbering — concurrent work tangles.
- **Not gated on handoff-opt.** Unlike its cohort siblings, this WU does not share handoff-opt's
  session-handoff surfaces or the `recommendedSummaryLine` symmetry. Its only hard prereq is post-WOR.
  This decoupling is what lets it slot in early enough to **precede arc-plan-conductor**.
- **Soft coordination with instruction-optimization** on the shared `strategy-session-operations.md`
  section and process-task-loop ownership (above).

## Scope Estimate

**Bounded — feels small-to-medium**, lighter than the conductor work it unblocks. Precise scope
deferred to PRD time (the loop split is the heaviest single piece and could be split out if scope
balloons). Rough shape: Layer 1 principle (~0.5 session), Layer 2 audit (~0.5), Layer 3 QUICK-REFERENCE
(~0.5), process-task-loop core/detail split + loop-canon (~1–1.5), verification (~0.5).

## Open Questions (PRD-time)

- **DRY loop-template ownership** — extract the loop pattern into a codified template +
  `strategy-workflow-authoring.md` section here, leave it to arc-plan-conductor, or treat as a
  standalone? Lean: flag here, decide owner at kickoff.
- **QUICK-REFERENCE end state** — drop the env-context T1 read entirely, or keep a minimal
  always-loaded stub? Depends on whether any environment fact is needed pervasively enough to earn T1
  independent of an explicit trigger.
- **process-task-loop split granularity** — how thin is the core, and which sub-protocols become
  triggered? Design with conductor's loop needs in view.
- **Audit verdicts** — confirm briefs / DEV-RULES stay; surface any surprise demotion candidate the
  audit turns up.

## Alternatives / Considered

- **Demote constraints (DEV-RULES) to on-demand.** Rejected by the decision rule — constraints are the
  content you most want present; "when uncertain, prefer T1." Their cost is moderate and their
  miss-cost is high.
- **Demote to implicit index-awareness instead of explicit triggers.** Rejected — 60–75% recognition
  is the exact reliability cliff the prior "don't go all-in on JIT" finding warned about.
- **Mid-session `arc-refresh` to reload core T1 against drift.** Out of scope here (it addresses "lost
  in the middle" mid-session decay, not load-set composition). Captured — leaning reject — in
  `plan-compaction-seed.md`, alongside the related mid-session context-health idea.

## Sibling Work Units

- `instruction-optimization` — direct sibling. process-task-loop structural work moves here; IO Pillar
  1 prose-compression folds/sequences; Pillar 4 stays in IO. Shared `strategy-session-operations.md`
  edit surface.
- `documentation-surface-routing` — cohort sibling. Precedent for the absorb-a-sibling's-pillar move.
- `handoff-optimization` — cohort sibling. Not a prereq for this WU (surfaces don't overlap).
- `arc-plan-conductor` — downstream consumer of the loop canon; this WU sequences ahead of it.
- `workflow-template-loads` (provisional) — possible runtime-loading mechanism for a loop template;
  distinct concern (template *loading*, not loop *authoring*).

---
