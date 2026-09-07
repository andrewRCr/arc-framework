# Draft: Loadset Composition

**Purpose:** Re-evaluate ARC's always-loaded (T1) session-init document set against the
recognition-reliability evidence, demoting content to explicit-trigger loading where a reliable
trigger exists — and codify the decision rule so T1 membership stays principled going forward. Fourth
sibling in the agent-context-optimization cohort (renaming to `instruction-discipline`), alongside
`plan-instruction-optimization.md`, `plan-documentation-surface-routing.md`, and
`plan-handoff-optimization.md`.

- **State:** Draft — pre-PRD exploration captured 2026-05-21; re-anchored 2026-07-02 (grooming session):
  Layers 2–3 re-based on the shipped `loadSet` manifest, the loop canon framed as a `composable-workflows`
  pattern instance (joint design), buffer items integrated. The decision rule (§ Working Framing) is
  unchanged — it survived the re-anchor intact and remains this WU's durable contribution.
- **Created:** 2026-05-21
- **Origin:** Surfaced 2026-05-21 revisiting whether QUICK-REFERENCE earns always-loaded status, and
  more broadly whether improved models change ARC's prior "don't go all-in on JIT" stance. The revisit
  grounded itself in the existing context-loading research and found the answer is sharper than
  load-vs-lazy — see § Working Framing.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[x]` **Document-tier placement thresholds for always-loaded surfaces**

- _Disposition (2026-07-02):_ Integrated into Layer 1 — the placement thresholds land in
  `strategy-session-operations.md` together with the demotion rule **and** instruction-optimization's
  tier-aware dedup principle as one coherent section (the three are the same principle family; the
  cross-surface-matrix contingency still routes to `documentation-surface-routing` if it outgrows
  load-set membership).

- _Routed from:_ `USER-INBOX § Backlog`, housekeep drain (2026-06-06); captured during
  `class-model-foundation` task generation.
- _Concern:_ codify the placement thresholds that keep always-loaded surfaces tight: `DEV-RULES` carries only
  minimum viable operational non-negotiables, on-demand strategies carry the what/how deep dive, and the docs site
  carries deep why/rationale. The rule should also name the heuristic that an operation may need to be performed
  correctly without always loading every explanation of what the thing is or why it exists.
- _Coordination:_ if this becomes a cross-surface routing matrix rather than a load-set membership rule, coordinate
  with `documentation-surface-routing`; the immediate drift surfaced in always-loaded `DEV-RULES` content.

### `[x]` **Cohort coordination doc: does it earn always-loaded (full) status at session-init?**

- _Disposition (2026-07-02):_ Integrated into the Layer 2 audit scope. With the `loadSet` manifest
  shipped, the re-tier is a one-policy-point edit (projection + `session-init.md` item 11 together, per
  the parity coordination below) — decide it by the recognition-reliability rule during the audit, not
  as a standalone question.

- _Routed from:_ `compaction-recovery` generate-tasks grounding audit (2026-06-28); surfaced while building the
  load-set projection.
- _Concern:_ `session-init.md` Step 3 item 11 reads the active WU's `cohort-*.md` **in full** every init when a
  backing doc exists (gated on `cohortDocPath`) — heavier than the on-demand treatment every other sometimes-relevant
  coordination surface gets (strategies, domain rules, methods). The probe already emits `cohortDocPath` as
  awareness, so the full read is the demotable part. Apply the recognition-reliability rule: is the cross-member
  sequencing the doc carries a **constraint the agent can't afford to miss** (→ earns T1/full), or
  explicit-trigger / awareness-demotable? Genuinely open — a sufficiently **operationally lean** coordination doc may
  _earn_ the full load; the point is to decide it by the rule, not by accretion.
- _Coordination:_ `compaction-recovery`'s load-set projection faithfully mirrors current item-11 policy (cohort doc
  as a `full` member when present), so recovery and init stay parity-identical; when this WU re-tiers the cohort
  doc it updates `session-init.md` item 11 **and** the projection entry together (one policy, two consumers). Same
  `session-init.md` Step 3 + `strategy-session-operations.md` § Context Loading Model surface as the entries above.

### `[ ]` **Process-task-loop's four config-coupled seams (input to the loop-canon content split)**

- _Routed from:_ `local-mode` re-scope groom (2026-07-03); source analysis in `draft-arc-modes.md` prior to that
  re-scope (git history) § Lite Process-Task-Loop.
- _Concern:_ the dissolved Lite analysis validated exactly four places where the task loop couples to the
  WU-lifecycle / Planning-Module surface: (1) branch ↔ task-list coupling at loop entry, (2) the verification
  pointer, (3) the `## Next Step` → integrate-work-unit handoff, and (4) Incidental Work Management — whose
  "for later" capture arm still lacks a module-off specification (scalable-core owns the _drain_ conditional,
  not this in-loop capture arm). These are **config-static** seams, a different cut from the state-dependent
  sub-protocols the Loop Canon already lists (crash recovery, deferred review, gate failure, completion notes) —
  useful when deciding core-vs-fragment-vs-install-render per `composable-workflows`' binding-time rule. The
  line-number anchors in the source are stale; the seam identities are the payload.

### `[ ]` **A demotion trigger must name the residual question, not the domain**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ where a lean operational surface already covers the common case, pointing at the deeper surface
  with a domain-scoped trigger fires on the 95% the method already served. Measured instance (2026-07-24):
  execution sessions load `strategy-quality-gates` (966 words) and `strategy-testing-methodology` (1,230) on top
  of the `quality-gate-commands` / `testing-standards` / `test-first` methods that answer the operational
  question — **~2,200 words (~3k tokens) per task loop, recurring every session**. Comparable to the entire yield
  of `recovery-load-scoping`'s disposition axis, and it fires more often. It is instructed behavior, not agent
  drift: `process-task-loop` fired a `Tier boundaries` pointer inside the per-task completion step, and
  `STRATEGY-INDEX` triggered on "writing tests, choosing test tier" — the methods' own territory.

- _Approach:_ the two named instances are corrected by the `strategy-trigger-overfire` errand (PR #342), which
  rescopes each trigger to the residual question. The **general rule** is this WU's: it owns the demotion rule
  ("demote only to an explicit trigger, never implicit awareness") and the adherence bands the diagnosis rests
  on, so the trigger-scoping requirement belongs alongside them rather than as errand-local prose.

- _Why it constrains the sibling:_ this is a counterexample bounding `recovery-load-scoping`'s `aware`-demotion
  precondition. `STRATEGY-INDEX` would **pass** a trigger-existence check — `DEV-RULES.ARC` § Consult strategy
  guidance is always loaded and imperatively says to check it — yet demoting it converts a load into a _search_
  (20–40% band) while leaving the over-firing intact. So existence is CLI-checkable; correct scoping is an
  authoring judgment no check can make. That WU records the partial precondition and defers the rule here.

- _Captured during:_ `recovery-load-scoping` grooming (2026-07-24), from a field observation during the
  procedural-substrate forward-compat read.

### `[ ]` **Read `analysis-load-set-scoping` before deciding demotions — one is mutually exclusive with yours**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ A retired planning investigation (`recovery-load-scoping`, 2026-07-24) audited every universal
  load-set entry for position-conditional demotability and left the evidence in
  `.arc/reference/supplemental/analysis/analysis-load-set-scoping.md`. Four items bear on LC, the first two
  materially:

    1. **A hard mutual exclusion.** LC proposes demoting `QUICK-REFERENCE`'s environment residual on redundancy
       with `AGENT-BRIEF.PROJECT`. The reverse demotion rests on the same redundancy in the other direction, and
       `DEV-RULES.PROJECT` § Quality Gates carries the gate commands but **not** the repo-root rule or the
       hybrid-layout note. Both must not land. Whichever is second re-derives its basis against what actually
       remains loaded, or drops the demotion. Separately: `AGENT-BRIEF.PROJECT`'s "Development Environment:
       Cross-platform (Windows/WSL/Linux/Mac)" line appears **nowhere else** in the loaded set, and is
       operational at execution in a CLI that branches on `posix`/`win32`.
    2. **A coordination note in `draft-loadset-composition.md` is factually wrong** — the claim that
       "`compaction-recovery`'s load-set projection faithfully mirrors current item-11 policy … so recovery and
       init stay parity-identical … one policy, two consumers." Three verified differences: init does not consume
       the manifest programmatically (Step 3 is a hand-written enumeration; `session-recover` loops
       `loadSet.value.entries`); init already carries its own read policy in prose (its errand-resume arm loads
       universal context only); and a transient position is CLI-representable in the recover envelope but not
       the init one. A demotion decided once does **not** apply identically to both.
    3. **The measured audit result:** four of the five universal entries do not vary by lifecycle position —
       `AGENT-BRIEF.ARC` (no trigger, 52% constraint), `QUICK-REFERENCE` § Env, the cohort doc (constraint), and
       `AGENT-BRIEF.PROJECT` (contested per item 1). The fifth, `STRATEGY-INDEX`, is safely demotable but of
       **unmeasured** value: its trigger reads "Before _implementing_ work in codified domains," and execution is
       exactly that condition, so the read may relocate rather than disappear. Measuring it needs the
       judgment-layer adherence instrument `workflow-eval-harness` owns.
    4. **A two-clause demotion precondition, with a defect stated and unresolved.** Reachability **or**
       never-needed (redundancy, strong / irrelevance, weak). Irrelevance was drafted as requiring two
       independent signals, the second being "the entry's trigger condition excludes the position" — which is
       unproducible for a trigger-less entry, i.e. exactly the orientation content clause (b) exists to serve.
       Adopting the precondition means settling whether absence-of-trigger satisfies that signal vacuously.

    Also relevant: the unsafe-vs-pointless distinction (a demotion can be safe yet worthless when the trigger
    over-fires), with commit `63d31c796` as the worked fix — scope the trigger to the **residual** question, not
    the domain.

- _Captured during:_ `recovery-load-scoping` retirement (2026-07-24). The analysis doc is the record-of-record;
  this capture is the pointer.

### `[ ]` **Retire the vestigial `session-state` method**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: loadset-composition`), housekeep drain
  (2026-07-30); captured during `judgment-authority-model` Phase 2.
- _Concern:_ the method's three bullets duplicate always-loaded session-state rules, while its apparent override
  seam is nonfunctional: session-init hard-codes its load set and the method default contains no document set.
  Core session state is no longer a swappable mechanism; only specific elements are configurable.
- _Fold-in:_ decide whether any genuine configurable residue survives and what it configures, then remove the
  method from both copies, the install recipe and manifest, classification configuration, both lifecycle
  workflows, and the session-init template. Keep this with the load-set owner rather than treating deletion as
  a standalone cleanup.

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
precise spectrum of _recognition_ reliability — whether the agent loads the content at the moment it
needs it:

- Always-present (T1): ~100%
- **Explicit trigger** ("when X, load Y", embedded in a loaded workflow/skill step): 85–95%
- Indexed / implicit awareness (STRATEGY-INDEX-style "you know this exists, notice when relevant"): 60–75%
- Search discovery: 20–40%

The prior caution was really a caution against _implicit awareness_ (60–75%). It does not apply to
_explicit triggers_, which are nearly T1-grade. Maintainer experience corroborates: across months of
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
templates they fill themselves. Relocating _this repo's_ environment content from one to the other is
**instance hygiene** — no adopter inherits the move. It must not be mistaken for a structural win.

The genuinely **canonical** deliverables — the ones that ship and affect every project — are:

- the **load-set membership decision** for each document _role_ (does the environment-context role,
  the command-reference role, etc. earn T1?), expressed in `session-init.md` +
  `strategy-session-operations.md`;
- the **templates + placement guidance** that codify what content belongs in which surface
  (`template-*` for the affected docs, plus the guidance the templates carry).

Our own duplication is the _motivating instance_ and a dogfooding case to validate the guidance — not
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
_Re-base (2026-07-02):_ the audit's object is now the shipped **`loadSet` manifest** — the probe's
projection of Step 3 policy (with read-modes), parity-tested against the workflow's inline enumeration.
Audit the manifest entries, not prose recollections of the load set; include the cohort-doc entry (from
the buffer) and WORKING-MEMORY (whose per-session read cost `handoff-optimization`'s structured-trigger
item attacks from the other side).

**Layer 3 — Execution.** The demotions that pass the rule:

- **QUICK-REFERENCE residual** — decide whether the environment-context role earns T1 at all. If not,
  drop the session-init partial read, fold the role's canonical guidance into the appropriate
  template(s), and (instance hygiene) relocate this repo's content. Small, clean.
- **process-task-loop core/detail split** — see § The Loop Canon.

_Execution note (2026-07-02):_ every demotion or re-tier lands as a policy edit to the `loadSet`
projection + the `session-init.md` Step 3 surface together (one policy, two consumers, parity-tested) —
materially cheaper than the pre-manifest assumption, and the same seam `composable-workflows`' Step 3
rewire later consumes.

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

_Re-anchor (2026-07-02):_ this split is a **`composable-workflows` pattern instance** — the thin core is
a D1 bounded spine, the sub-protocols are D2 fragments (likely the procedure-library shape), and the
explicit triggers are exactly D2's fragment gates. Design it jointly: CW owns the mechanism (fragment
model, contract shape, loading), this WU owns the loop's _content_ policy (what's core, what's
triggered, where the stops sit) and remains the loop canon's author. The former "DRY loop-template"
open question folds into CW's D1 template deliverable.

**Conductor disposition (resolved 2026-07-02).** arc-plan-conductor was decomposed and its central idea —
a pre-implementation planning-stage orchestrator — abandoned in favor of the three structured
planning-stage workflows (`draft-design`, `create-spec`, `generate-tasks`). Its planned `refine-plan-loop`
/ `refine-prototype-loop` contracts no longer exist as consumers. **Re-derived consumer set for the loop
canon:** `process-task-loop` (the execution loop) plus the loop-shaped passes already inside the planning
stages — `draft-design`'s `high`-path iterative shaping loop and `generate-tasks`' depth-sliced pass
structure. Three-plus live loops still justify the canon on the original "three loops sharing a pattern"
test; what dissolves is the _sequencing_ motivation ("land before conductor") — this WU's early-run case
now rests on its own T1-trim merits. Design the canon against the live loops, not execution-only
assumptions.

**DRY loop-template (open).** Whether to extract the pattern into a codified artifact (a loop-flavored
companion to `template-workflow.md`, plus a `strategy-workflow-authoring.md` section) is left open —
see § Open Questions. Lean: this WU redesigns the canonical loop and _flags_ the pattern; the
shared-template build is a kickoff coordination call with arc-plan-conductor, not committed to this
WU's scope. (Tangential: `plan-workflow-template-loads.md` is about _runtime_ loading of authoring
templates via `arc.templates` frontmatter — a possible delivery mechanism, not the same concern as
authoring a loop template.)

## Coordination

### With `instruction-optimization`

- **process-task-loop ownership.** This WU absorbs the process-task-loop _structural_ (re-tiering /
  core-detail split) work. `plan-instruction-optimization.md` Pillar 1's prose-compression of that
  same file folds in or sequences _after_ the split — compressing a doc about to be restructured is
  wasted. Mirrors the precedent where `plan-documentation-surface-routing.md` absorbed IO Pillar 2.
- **Pillar 4 adjacency.** IO Pillar 4 (conditional loading of `session-init.md`'s own edge-case
  _sections_) shares this WU's "load less at init" philosophy but operates on a different axis
  (sections of an already-loaded workflow, not whole-doc tiering). Stays in IO; cross-ref.
- **Shared edit surface.** Both touch `strategy-session-operations.md` § Context Loading Model (this
  WU's decision rule; IO's tier-aware-dedup principle). Whoever lands first establishes the section;
  the other extends. Coordinate.

### With the planning-stage workflows (formerly `arc-plan-conductor`)

- Conductor was decomposed and abandoned (see § The Loop Canon, Conductor disposition); the loop canon's
  planning-side consumers are now the loop-shaped passes inside `draft-design` and `generate-tasks`.
  When the canon lands, evaluate whether those passes adopt it as-is or only inherit its shape via
  `composable-workflows` D1 — the residual seam worth checking, since the old conductor coordination
  notes assumed consumers that no longer exist.

### Cohort

- Cohort renames `agent-context-optimization` → `instruction-discipline` at planning kickoff (shared
  with the existing siblings). This WU's directory + meta join that batch rename.

## Sequencing

- **Hard prereq satisfied (2026-07-02):** WOR shipped; the post-WOR integration condition is met.
- **Not gated on handoff-opt.** Unlike its cohort siblings, this WU does not share handoff-opt's
  session-handoff surfaces or the `recommendedSummaryLine` symmetry. Its only hard prereq is post-WOR.
  This decoupling is what lets it slot in early enough to **precede arc-plan-conductor**.
- **Soft coordination with instruction-optimization** on the shared `strategy-session-operations.md`
  section and process-task-loop ownership (above).

## Scope Estimate

**Bounded — feels small-to-medium.** Precise scope
deferred to PRD time (the loop split is the heaviest single piece and could be split out if scope
balloons). Rough shape: Layer 1 principle (~0.5 session), Layer 2 audit (~0.5), Layer 3 QUICK-REFERENCE
(~0.5), process-task-loop core/detail split + loop-canon (~1–1.5), verification (~0.5).

## Open Questions (PRD-time)

- **DRY loop-template ownership** — _resolved 2026-07-02:_ the template/strategy codification is
  `composable-workflows`' D1 deliverable; this WU authors the canonical loop _content_ against it (see
  § The Loop Canon re-anchor).
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
  `draft-compaction-recovery.md`, alongside the related mid-session context-health idea.

## Sibling Work Units

- `composable-workflows` — cohort keystone (joined 2026-07-02; see `cohort-agent-context-optimization.md`).
  Owns the fragment mechanism the loop split instantiates and the Step 3 rewire consuming the `loadSet`
  seam; this WU's Layers 1–2 are CW-independent and run early.
- `instruction-optimization` — direct sibling. process-task-loop structural work moves here; IO Pillar
  1 prose-compression folds/sequences after the split; IO's former Pillar 4 now lives in
  `composable-workflows`. Shared `strategy-session-operations.md` edit surface (see the integrated
  thresholds buffer item above).
- `documentation-surface-routing` — cohort sibling. Precedent for the absorb-a-sibling's-pillar move.
- `handoff-optimization` — cohort sibling. Not a prereq for this WU (surfaces don't overlap).
- planning-stage workflows (`draft-design` / `generate-tasks`) — the loop canon's planning-side
  consumers after conductor's decomposition; see § Coordination.
- `workflow-template-loads` (provisional) — possible runtime-loading mechanism for a loop template;
  distinct concern (template _loading_, not loop _authoring_).

---

## Coordination — ADR-022

`SESSION-NOTES` structure is code-owned per ADR-022; the freshness-probe field (`Commit at Handoff`)
reads from the managed-doc record/schema, not a parsed markdown template. Audit T1 membership against
the schema as the canonical source. See `adr-022-managed-operational-state-documents.md` § Coordination.
