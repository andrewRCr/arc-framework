# Plan: Foundational Gap Closure (WU1.5)

**Purpose:** Identify and resolve foundational design gaps that were not addressed in WU1
but must be resolved before WU2 implementation begins. WU1 focused on philosophy and
configurability architecture; WU1.5 catches operational and mechanical gaps that slipped
through — questions that need design decisions, not implementation.

**Status:** Phase 1 complete, Phase 2 pending
**Created:** 2026-02-24
**Phase 1 completed:** 2026-02-25

---

## Motivation

WU1 produced the right foundational artifacts: 6 ADRs resolving core design decisions, a
philosophy strategy, and a configurability architecture strategy. But the scope was anchored
to philosophy and configurability — operational concerns that didn't fall neatly into those
categories were deferred or unnoticed.

Two gaps have surfaced organically:

1. **Session state management** — CURRENT-SESSION.md is gitignored by default, which works
   for single-dev/single-machine. But multi-machine developers can't sync session state, and
   team handoffs (reassigning a work unit to another developer) have no mechanism for sharing
   session context. The framework has a well-designed handoff format with no way to transfer it.

2. **Context loading architecture** — ARC loads 8-9 documents at session start. The approach
   works in practice but has never been empirically grounded. Recent research (Gloaguen et al.,
   2026) on repository-level context files raises questions about what information actually
   helps LLM agents and when they should receive it.

Both are pre-implementation design questions. WU2 will touch session workflows and context
loading patterns — building on unresolved foundations risks rework.

Beyond these two, there may be other gaps. WU1's scope was deliberately narrow (philosophy +
configurability), and the methodology has grown significantly through WU1's outputs. An audit
pass before WU2 is prudent — cheaper to find gaps now than to discover them mid-implementation.

---

## Known Gaps

### Gap 1: Session State Management

**Problem:** CURRENT-SESSION.md captures transient session state (what was being worked on,
debugging context, blockers, next action). It's gitignored by default, which means:

- **Multi-machine (single dev):** No way to sync session state between workstations. A
  developer who hands off on their desktop cannot resume on their laptop.
- **Team handoff:** When work unit ownership changes (vacation, reassignment), the handoff
  document — specifically designed for context transfer — cannot be shared.
- **Team collaboration:** No mechanism for shared project state ("what's blocked, what's
  next") without exposing individual session noise.

**Why tracking it in git is not straightforward:**

- **Ordering problem:** Session handoff happens *after* commits (it assesses git state and
  reports on committed work). If tracked, the handoff always dirties the tree after clean
  commits. Options are all problematic: trailing "session state" commits pollute history;
  accepting perpetual dirty state confuses session-init; reordering handoff before commits
  defeats the purpose.
- **Merge conflicts with yourself:** Different session states from different machines diverge.
  The file content is inherently ephemeral — it changes every session on every machine.
- **Privacy/comfort:** Session state is often messy — "tried X, didn't work, suspect Y" —
  which is valuable for continuity but uncomfortable for visibility. Some developers may
  not want this in version control where teammates or managers can read it.

**Analogous problem domains:**

- **Terraform state:** Local state file that causes merge conflicts → industry moved to
  remote state backends. State is shared but through a purpose-built mechanism, not git.
- **Dotenv pattern:** `.env.example` (template/schema) is tracked, `.env` (local instance)
  is gitignored. Everyone knows the shape; no one shares their values.
- **IDE workspace files:** Shared config (`.vscode/extensions.json`) tracked; personal state
  (`.vscode/settings.json`) gitignored. Split: project-relevant vs. personal.
- **Git itself:** Refs are shared (push/pull), working tree state is local. Architectural
  separation of shareable from local.

**Key observation:** CURRENT-SESSION.md may be two things conflated into one:

- **Project state** — what's next for the work, blockers that affect anyone, task pointer.
  Much of this is already tracked elsewhere (task list checkboxes, commit messages). The
  unique additions: blockers, next-action pointer, off-task-list work path.
- **Session state** — where I personally am, what I tried, debugging insights, context that
  helps *my* next session but is inherently local and ephemeral.

The first is shareable and arguably should be shared. The second is personal and arguably
should stay local. Whether the solution is splitting the file, redesigning the handoff
mechanism, or something else entirely is the design question.

**What already exists in ARC:**

- Configurability strategy (line 83): CURRENT-SESSION is a P5 convention with "Method
  override — substitute session mechanism" as the configurability path
- File classification strategy: classified as "Scaffolded" (project-owned after init)
- Session handoff workflow: one passing mention of gitignore (line 269); otherwise assumes
  untracked
- `.gitignore` comment: "Session handoff file (transient)" — design intent hiding in a
  comment, not codified as a reasoned decision

**Research questions:**

- How do other development frameworks / methodologies handle session state portability?
- Is the "split into project state + session state" decomposition the right framing, or
  is there a better model?
- What's the minimum viable solution that unblocks multi-machine and team handoff without
  over-engineering?
- Should the solution be a single mechanism or scenario-specific guidance?

### Gap 2: Context Loading Architecture

**Problem:** ARC's session initialization loads 8-9 documents in a specific order. The
approach emerged from developer experience and iterative refinement. It works well, but the
design reasoning is implicit — never grounded against empirical evidence on LLM context
effectiveness.

**Full analysis:** See `plan-context-loading-architecture.md` (same directory). That plan
doc contains the complete problem statement, research questions, seed sources, and expected
outputs. WU1.5 subsumes it — the research and evaluation described there becomes part of
this broader effort.

**Key questions (from the existing plan):**

1. Volume vs. relevance — is there a point where upfront context degrades performance?
2. Instruction type effectiveness — do rules, environment context, workflow procedures, and
   project state show different profiles when loaded upfront vs. on-demand?
3. Indexing effectiveness — does tier 2 awareness (knowing docs exist) actually result in
   appropriate on-demand consultation?
4. Structured chains vs. single files — does multi-document loading perform differently
   than monolithic context?

### Gap 3: First-Session Bootstrap

**Problem:** Session-init assumes CURRENT-SESSION.md exists. No workflow addresses the
first-ever session after ARC adoption — new adopters hit a dead end at step 8 ("MUST
READ IN FULL") when the file doesn't exist. More broadly, no onboarding sequence connects
setup completion (01_initialize-arc, 02_define-project) to productive work.

**Discovered by:** Phase 1 audit (3 methods: scenario walks, assumption extraction,
pre-mortem). See `audit-wu1.5-gap-discovery.md` Gap 3.

**Design question:** What should happen on the first session? Graceful handling in
session-init, a separate first-session workflow, or setup creates initial session state?

### Gap 4: Task Reference Stability

**Problem:** CURRENT-SESSION.md uses line numbers as task anchors ("Task 5.5 (line 1903)").
Line numbers shift when tasks are added or edited between sessions, silently breaking
handoff references.

**Discovered by:** Phase 1 audit (2 methods: scenario walks, assumption extraction).
See `audit-wu1.5-gap-discovery.md` Gap 4.

**Design question:** Replace with stable IDs/heading anchors, add verification guidance,
or a different referencing mechanism?

### Gap 5: Team Work Transfer Protocol

**Problem:** No workflow exists for developer-to-developer handoff. Session-handoff
captures state for the same developer's next session. Even with session state sharing
solved (Gap 1), the *process* of work transfer is undefined.

**Discovered by:** Phase 1 audit (2 methods: both scenario walk agents independently).
See `audit-wu1.5-gap-discovery.md` Gap 5.

**Design question:** Does ARC need a team handoff workflow distinct from session handoff?
Does solving Gap 1 (session state portability) also solve this?

### Additional Gaps (Phase 1 Audit)

The audit surfaced 5 additional gaps of moderate severity. Full analysis in
`audit-wu1.5-gap-discovery.md`:

- **Gap 6: Method override dependencies** — interdependent methods treated as independent
- **Gap 7: Config semantics in team mode** — personal vs. project-wide config unspecified
- **Gap 8: Archive trigger with stacked branches** — ambiguous when multiple branches
  serve one task list
- **Gap 9: Session state mismatch recovery** — detected but no recovery protocol
- **Gap 10: CURRENT-SESSION staleness detection** — no freshness check

Gaps 6-7 are pre-mortem unique finds (lower confidence, may be addressable during WU2).
Gaps 8-10 are assumption extraction finds (operational, likely resolvable through
documentation updates).

### Audit Target Resolution

The following pre-audit candidates were evaluated:

- **Cross-platform path handling** — Not confirmed as a foundational gap. QUICK-REFERENCE
  is file-customizable (project-owned). ADR-005 handles platform variation through
  QUICK-REFERENCE + `platform.type` config. Operational, not design-level.
- **Session-init / agent-specific file interaction** — Partially addressed. ADR-002
  classifies workflow assumptions as incidental; architecture supports agent switching.
  Operational guidance missing but not a design gap. See audit doc "Partially Addressed."
- **Workflow completeness for session lifecycle** — Confirmed as multiple gaps. First-
  session bootstrap (#3), team work transfer (#5), mismatch recovery (#9), and staleness
  detection (#10) are all session lifecycle gaps. The lifecycle has significant holes at
  transitions.

---

## Approach

### Phase 1: Audit — Identify All Foundational Gaps

Systematic discovery of pre-implementation design gaps beyond the two already known.

#### The discovery problem

Finding gaps in a framework you built is hard — the documentation feels complete because
it doesn't reference what's missing. The gaps found so far weren't discovered by reading
docs; they were discovered by imagining concrete scenarios the docs don't account for
("what if I clone on my laptop?"). The scenario is the probe; the gap is what the probe
reveals.

Relying on a single method ("read the docs carefully") is the same analytical mode that
produced the docs — it's unlikely to find what that mode already missed. Instead, the audit
uses **multiple independent discovery methods** and tracks convergence across them.

#### Discovery methods

**Method 1 — Scenario walks (persona × environment × lifecycle matrix)**

Define representative scenarios by combining personas, environments, and lifecycle stages.
Walk each scenario through ARC's workflows, watching where guidance goes silent, makes
implicit assumptions, or breaks.

*Personas (who):*

- Solo dev, single machine (current default)
- Solo dev, multi-machine (macOS + WSL)
- Small team, same agent (2-3 devs, all Claude)
- Small team, mixed agents (Claude + Gemini + Cursor)
- New adopter (first day with ARC)
- Returning contributor (away 2 weeks, picking up someone else's work)
- Async/factory agent (Codex/Devin — bookend pattern)

*Environment axes (where):*

- OS: macOS, Windows/WSL, Linux
- Agent: Claude, Gemini, Cursor, other
- Git workflow: feature branches, trunk-based, squash merge

*Lifecycle stages (when):*

- First-time setup
- Session init
- Task execution (mid-session)
- Session handoff
- Work transfer between developers
- Multi-session continuity (same dev, same work, 5+ sessions deep)
- Branch management (switching, merging, archival)

Not every cell in the matrix needs testing — the full product is thousands of combinations.
Select 5-7 representative scenarios that maximize axis coverage, focusing on combinations
that differ most from the implicit default (solo dev, single desktop, Claude, feature
branch). Each scenario walks: "this persona, in this environment, at this lifecycle
stage — what does ARC tell them to do? Where does it go silent?"

**Method 2 — Assumption extraction**

For each key workflow and strategy document, explicitly list the assumptions it makes.
Each assumption is a candidate gap. This is a different analytical lens than scenario
walks — it works from the documents outward rather than from scenarios inward.

Target documents: session-init, session-handoff, process-task-loop, atomic-commit,
development-methodology, work-organization, configurability-architecture.

**Method 3 — Pre-mortem**

"It's 3 sessions into WU2 and we've had to pause implementation because a foundational
gap was discovered that requires design work. What was the gap?" This reframing — assuming
failure already happened and explaining it — reliably surfaces risks that forward-looking
analysis misses (Gary Klein's prospective hindsight research). Generate candidate gaps,
cross-reference against scenario walk and assumption extraction results.

**Method 4 — WU1 output review**

Review each WU1 output (6 ADRs, 2 strategy docs) for forward-looking items, open
questions noted but not resolved, and "future work" markers. Also check the WU2 plan
doc's change inventory for items that actually require design decisions rather than
pure implementation.

#### Convergence: knowing when to stop

The goal is not exhaustive completeness — it's reasonable confidence that WU2 won't be
derailed by discovered foundational gaps. Convergence criteria:

- **Within-method saturation:** When a full pass of scenario walks finds zero new gaps,
  that method is approaching saturation.
- **Cross-method convergence:** If methods 1, 2, and 3 independently surface the same
  set of gaps (and no unique findings from later methods), confidence is high. If method
  3 surfaces gaps that methods 1 and 2 missed, we're not saturated — run another pass.
- **Bounded confidence:** Two passes with no new findings across different methods is
  sufficient. Perfection is not the standard; "WU2 can proceed without foundational
  rework" is.

#### Operational approach: subagent parallelism

The audit is token-intensive — each scenario walk requires reading significant portions
of ARC's documentation corpus, and multiple independent walks are needed. Running these
in the main session context would consume most of a session on reading alone.

**Subagents are well-suited here for two reasons:**

1. **Token economics:** Each subagent reads only the docs relevant to its specific
   scenario or method, rather than the main context carrying the full corpus for all
   walks. Multiple walks can run in parallel.

2. **Fresh-eyes effect:** Each subagent starts with zero prior assumptions about how
   ARC works. It encounters the documentation as written — closer to the perspective
   of an actual adopter — rather than through the lens of having built the framework
   over multiple sessions. This is exactly the perspective most likely to find gaps.

**Execution shape:**

- Each subagent receives a self-contained brief: what ARC is (sufficient framing),
  which scenario/method to execute, which documents to read, and what constitutes a
  "gap" (a design question that must be resolved before implementation, not a missing
  feature or implementation task).
- Each returns a structured report: scenario/method, documents examined, gaps found
  (with evidence), assumptions encountered, and confidence assessment.
- Main context synthesizes across reports: convergence analysis, gap deduplication,
  severity assessment, and updated gap inventory.

**Subagent assignments (representative, adjust based on scenario selection):**

- 2-3 agents for scenario walks (different personas/environments each)
- 1 agent for assumption extraction across key workflows
- 1 agent for pre-mortem analysis
- WU1 output review done in main context (requires cross-referencing prior session
  knowledge)

**Output:** `audit-wu1.5-gap-discovery.md` — complete synthesis with provenance tracking,
convergence analysis, and classification against WU1 ADRs. Gap inventory updated in
this plan doc (Known Gaps section above).

**Phase 1 result:** 10 gaps identified (2 previously known, 8 new). 5 "already decided"
findings filtered out via ADR cross-referencing. 3 partially addressed findings noted.
Dominant theme: session lifecycle gaps (5 of 10 gaps cluster around session state at
different boundary types). See `audit-wu1.5-gap-discovery.md` for full analysis.

### Phase 2: Research — Empirical Grounding

External research where needed to inform design decisions. Not every gap requires
research — some are resolvable from first principles or existing analogies.

**Research track 1 — Session lifecycle design (Gaps 1, 3, 5, 9, 10):**

Research how other frameworks handle session state portability, first-session bootstrap,
developer handoff, and the local-vs-shared state split. These are facets of a single
design space — one research effort covering the full session lifecycle is more efficient
than separate investigations per gap. Look for established patterns rather than inventing
from scratch.

**Research track 2 — Context loading architecture (Gap 2):**

Execute the research plan from `plan-context-loading-architecture.md` — synthesize
empirical findings on LLM context effectiveness, evaluate ARC's current model against
evidence. Independent of session lifecycle research.

**Resolvable without research (Phase 2 → Phase 3 fast-track):**

- Gap 4 (task reference stability) — decidable from first principles
- Gap 6 (method override dependencies) — documentable as guidance
- Gap 7 (config team semantics) — likely resolvable by documenting explicit choice
- Gap 8 (archive trigger) — small scope strategy/workflow update

**Output:** Research synthesis for each gap that required it. Research subagents
(external-research-analyst) can run in parallel for independent investigations.

### Phase 3: Design Decisions

Resolve each gap with a design decision. Expected output formats:

- **ADR** — if the decision is significant, has alternatives worth documenting, and
  future developers will ask "why did we do it this way?"
- **Strategy update** — if the finding validates the current approach and just needs the
  reasoning made explicit, or if the resolution is a refinement to existing guidance
- **Workflow update** — if the gap is a missing step or implicit assumption in an
  existing workflow (implementation deferred to WU2, but the *design* of what the step
  should be is WU1.5 scope)

**Output:** ADRs and/or strategy updates for each resolved gap, plus any workflow change
specifications that WU2 will implement.

---

## Relationship to Other Work

### Subsumes

- `plan-context-loading-architecture.md` — that plan's full scope becomes Phase 2 + Phase 3
  of this effort for Gap 2. The plan doc is preserved as reference but this plan is the
  governing document.

### Feeds Into

- `plan-wu2-methodology-completion.md` — WU1.5 outputs (ADRs, strategy updates, workflow
  specs) become additional inputs for WU2, alongside WU1's outputs. WU2 plan evaluation
  should happen *after* WU1.5 completes, not before.

### Does Not Include

- Implementation of any design decisions (that's WU2)
- Research archival workflow gap (already scoped in WU2 plan, lines 758-770 — pure
  implementation, no design decision needed)
- `arc-methods.md` / `arc-extensions.md` template creation (intentional WU2 deferral)

---

## Scope and Format

This is a bounded research-and-design effort. No task list unless the audit surfaces
enough gaps to warrant formal tracking. Expected work profile:

1. **Audit** (~1 session) — subagent-parallel scenario walks + assumption extraction +
   pre-mortem, synthesized in main context. Token-heavy reading delegated to subagents;
   main context focuses on synthesis and convergence analysis.
2. **Research** (~1-2 sessions) — external research for gaps that need it. Research
   subagents can investigate independent gaps in parallel.
3. **Design** (~1-2 sessions) — produce ADRs and/or strategy updates. This phase
   requires main-context depth and cross-referencing, less amenable to subagent
   delegation.

If scope expands significantly during the audit (many gaps found), reassess whether this
needs a formal task list and potentially a dedicated branch.

---

**Created:** 2026-02-24
