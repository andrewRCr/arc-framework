# PRD: Foundational Gap Closure (WU1.5)

**Type:** Technical
**Updated:** 2026-02-25

---

## Introduction

WU1 produced the right foundational artifacts: 6 ADRs, a philosophy strategy, and a
configurability architecture strategy. But WU1's scope was anchored to philosophy and
configurability — operational and mechanical concerns that didn't fall neatly into those
categories were deferred or unnoticed.

A systematic audit (4 independent discovery methods, cross-referenced against all WU1 ADRs)
identified 11 foundational gaps requiring design decisions before WU2 implementation begins.
The dominant theme is session lifecycle — 5 of 11 gaps cluster around how ARC handles session
state across different boundary types (portability, bootstrap, team transfer, mismatch recovery,
staleness). A secondary theme is reference and coordination mechanisms (task anchors, archive
triggers, method dependencies). A third theme — planning document lifecycle — addresses the
undocumented pre-PRD planning pipeline that ARC relies on heavily but has never codified.

These are design questions, not implementation tasks. WU1.5 produces ADRs, strategy updates,
and workflow change specifications. WU2 implements them.

**Audit methodology:** Gaps were identified via 4 independent discovery methods (scenario walks,
assumption extraction, pre-mortem, WU1 output review), cross-referenced against all WU1 ADRs.
Findings were classified as genuinely new, already decided, or partially addressed. The audit
artifact was consumed during PRD creation; all actionable content is captured in this PRD and
the notes file.

## Goals

1. **Resolve all identified foundational gaps** — Produce design decisions for each of the 11
   gaps plus 3 partially addressed findings, so WU2 can implement without needing to pause for
   design work
2. **Ground research-dependent decisions empirically** — For gaps where external patterns exist
   (session state, context loading, planning artifacts), research established approaches before
   designing ARC's solution
3. **Strengthen the pre-PRD planning pipeline** — Codify the plan-\* document convention and
   evaluate it against established SE planning practices, including producing a PRD template for
   adopter use
4. **Update WU2 as a downstream consumer** — Annotate the WU2 plan to consume WU1.5 outputs,
   correct stale references, and flag affected clusters
5. **Maintain WU2 readiness** — Ensure every WU1.5 output is specific enough for WU2 to
   implement without further design decisions

## Use Cases

These scenarios illustrate the gaps this work resolves. Each represents a real situation where
ARC's current documentation goes silent or makes implicit assumptions.

1. **Solo developer, two machines** — Hands off work on a desktop, opens laptop to continue.
   CURRENT-SESSION.md is gitignored. Session state — blockers, next action, debugging context —
   exists only on the desktop. The developer must reconstruct context from git log and task list
   checkboxes. (Gaps 1, 10)

2. **New adopter, first session** — Completes ARC setup (initialize-arc, define-project), runs
   session-init. Step 8 says "MUST READ IN FULL" for CURRENT-SESSION.md. File doesn't exist.
   No workflow bridges setup completion to first productive session. (Gap 3)

3. **Team member picking up someone else's work** — Developer A goes on vacation mid-work-unit.
   Developer B takes over. Session handoff was written but CURRENT-SESSION.md is gitignored —
   B can't access it. Even if they could, the _process_ of work transfer (what A prepares, what
   B needs, how context gaps are identified) is undefined. (Gaps 1, 5)

4. **Multi-session task list navigation** — Session N hands off with "Current Task: Task 5.5
   (line 1903)." Between sessions, task descriptions are edited and a subtask is added. Session
   N+1 jumps to line 1903, which now points to a different task. Agent starts working on the
   wrong item. (Gap 4)

5. **Skipped handoff recovery** — Developer closes terminal without running session handoff.
   Next session, session-init reads stale CURRENT-SESSION.md from two sessions ago. The
   staleness doesn't produce a detectable mismatch (task hasn't changed, just work was done and
   committed). Agent initializes against outdated context. (Gaps 9, 10)

6. **Jira team overriding task completion** — Team overrides task-completion method to update
   Jira. Commit-context-format method still references `tasks-*.md`. Commit footers point to
   files nobody is using for tracking. No guidance identifies this as a coupled override. (Gap 6)

7. **New project, first PRD** — Adopter wants to write their first PRD. No template exists —
   format guidance is embedded in the create-prd workflow. Plan-\* conventions are undocumented.
   The adopter doesn't know whether to draft a plan doc first or go straight to PRD, or what
   structure either should follow. (Gap 11)

## Requirements

### Research-Dependent Decisions

These gaps require external research to inform design. Research precedes design decisions.

1. **Resolve session state portability and team work transfer (Gaps 1, 5)** — Design how ARC
   handles session state across machine boundaries and developer boundaries. Research how other
   development frameworks handle the local-vs-shared state split, first examining whether the
   "project state + session state" decomposition is the right framing. The solution must address
   three scenarios: multi-machine single developer, team handoff (work unit ownership change),
   and team collaboration (shared project awareness). Gap 5 (team work transfer process) is
   researched alongside Gap 1 because the process design depends on what state is shareable.
   **Expected output:** ADR (significant architectural decision with alternatives worth
   documenting).

2. **Evaluate context loading architecture (Gap 2)** — Assess ARC's session-init document
   loading model against empirical evidence on LLM context effectiveness. ARC currently loads
   8-9 documents in a specific order across three implicit tiers (upfront mandatory, indexed
   on-demand, discoverable via search). Key questions: volume vs. relevance tradeoffs,
   instruction type effectiveness profiles (rules vs. environment vs. workflow vs. project
   state), indexing effectiveness (does Tier 2 awareness result in appropriate on-demand
   consultation), structured chains vs. monolithic context, and mid-session refresh triggers.
   See `notes-foundational-gap-closure.md` for the full three-tier model description, detailed
   research questions, and seed sources. **Expected output:** ADR or strategy update, depending
   on whether findings call for architectural change or validate the current approach.

3. **Codify planning document lifecycle (Gap 11)** — Validate and potentially improve ARC's
   existing pre-PRD planning pipeline (backlog buckets → ephemeral `plan-*` docs → PRD → task
   list) against established SE planning practices. The current lifecycle shape is right-sized —
   research should look for improvements _within_ each stage, not additional stages or ceremony.
   Specific deliverables: codify the plan-\* convention (structure, when to create, when it
   graduates to PRD, ephemeral nature), create a PRD template for adopter use (analogous to
   the existing ADR template), and evaluate whether the create-prd workflow's discovery step
   needs strengthening to prevent agents from skipping clarifying questions. Research scope is
   ARC-anchored: start from what we do, look for proven techniques that enhance it, don't survey
   radically different planning philosophies. **Expected output:** depends on research — may be
   a new strategy document, updates to existing workflows, and/or a template file.

### First-Principles Decisions

These gaps are resolvable without external research — options are clear, evidence is internal.

4. **Design first-session bootstrap (Gap 3)** — Define what happens on the first session after
   ARC adoption. Session-init currently assumes CURRENT-SESSION.md exists; no workflow bridges
   setup completion to first productive session. Options include: session-init gracefully handles
   missing file, setup workflow creates initial session state, or a separate first-session
   workflow. **Expected output:** workflow update specification for session-init and/or setup
   workflows.

5. **Stabilize task references (Gap 4)** — Replace line-number-based task anchors in
   CURRENT-SESSION.md with a stable referencing mechanism. Line numbers shift when tasks are
   edited between sessions, silently breaking handoff references. Options include: stable task
   IDs, markdown heading anchors, or verification guidance. **Expected output:** strategy or
   workflow update defining the referencing convention.

6. **Document method override dependencies (Gap 6)** — Add dependency guidance to coupled
   method overrides. Currently, methods are documented as independent; overriding
   task-completion to use Jira implies commit-context-format should also change, but no guidance
   connects them. **Expected output:** guidance additions to the `arc-methods.md` template
   specification (WU2 creates the file; WU1.5 specifies the dependency content).

7. **Clarify config semantics in team mode (Gap 7)** — Document whether `arc-config.yml` is
   always project-wide or supports layered resolution (project → personal). The configurability
   strategy and team coordination strategy don't intersect on this question. Most config values
   are project-wide; the design question is whether to document this as an explicit choice or
   design a layering mechanism. **Expected output:** strategy update or brief ADR note,
   depending on whether the answer is "project-wide by design" (strategy update) or "layered
   resolution needed" (ADR).

8. **Clarify archive trigger for stacked branches (Gap 8)** — Resolve ambiguity in the archive
   trigger when multiple branches serve one task list. Current guidance says "archive when all
   tasks complete" but doesn't verify branch merge state. Premature archival is possible.
   **Expected output:** workflow update to archive-completed and/or strategy update to
   work-organization.

9. **Design session state mismatch recovery (Gap 9)** — Add a recovery protocol to
   session-init's mismatch detection. Currently, mismatches trigger "stop and ask" with no
   self-recovery path. Define a trust hierarchy among sources of truth (git status, task list,
   CURRENT-SESSION.md) and tiered recovery (minor mismatches: auto-correct with notice; major:
   stop and ask). **Expected output:** workflow update specification for session-init.

10. **Add CURRENT-SESSION staleness detection (Gap 10)** — Add a freshness check to
    session-init. Currently, CURRENT-SESSION.md is read without verifying it reflects recent
    work. If a developer skipped handoff, the file may be sessions old with no warning. Define
    what "stale" means (timestamp drift, commit count since last update) and how to flag it.
    **Expected output:** workflow update specification for session-init.

### Partially Addressed Findings

These findings from the Phase 1 audit are partially covered by existing decisions but have
remaining design surface. Include in WU1.5 to fully resolve rather than leaving for WU2 to
discover mid-implementation.

11. **Define agent switching operational guidance** — ADR-002 supports agent switching
    architecturally (hub-spoke file model, incidental workflow assumptions). Missing: operational
    guidance for "I used Claude last session, switching to Gemini this session." Specifically,
    how the incoming agent handles agent-specific context in CURRENT-SESSION.md (e.g., token
    threshold references meaningless to a different agent). **Expected output:** workflow
    update note or session-init addition.

12. **Clarify deferred review scope bounds** — process-task-loop allows user-defined deferred
    review scope with "stop if anything unexpected arises." The threshold for "unexpected" is
    undefined. Define what qualifies: quality gate failure, scope significantly exceeding
    estimate, blocking dependency discovered, etc. **Expected output:** workflow clarification
    in process-task-loop.

13. **Add file reclassification checkpoint to WU2** — WU2 changes may alter file
    classifications. Cluster M's structural validation should catch this, but the plan doesn't
    explicitly include a reclassification pass. **Expected output:** checkpoint note added to
    WU2 plan annotations.

### Cross-Cutting

14. **Annotate WU2 plan as downstream consumer** — Update `plan-wu2-methodology-completion.md`
    to reflect WU1.5 as an upstream dependency: correct "8 ADRs" to "6 ADRs," flag clusters
    affected by WU1.5 outputs (C, E, D2, session workflows), and note that WU1.5 design
    decisions may reshape or preempt specific WU2 items.

## Non-Goals

- **No implementation** — No editing existing workflows, strategies, hooks, or templates to
  apply design decisions. That is WU2 scope. WU1.5 produces specifications; WU2 implements
  them.
- **No WU2 plan restructuring** — WU2 plan receives annotations (new upstream dependency,
  affected clusters), not a rewrite. Full WU2 plan evaluation happens after WU1.5 completes.
- **No planning methodology overhaul** — Gap 11 validates and improves ARC's existing planning
  pipeline. The lifecycle shape (backlog → plan-\* → PRD → tasks) is preserved. Research informs
  improvements within stages, not additional stages or ceremony.
- **No universal session portability** — The session state design aims for minimum viable
  solutions that unblock multi-machine and team scenarios. Purpose-built sync infrastructure is
  out of scope.
- **No structural file changes** — No moving, renaming, or reorganizing existing `.arc/` files.

## Technical Considerations

**Output types (hybrid approach):** Requirements with high-confidence output types have them
prescribed. Research-dependent requirements leave output format to emerge from findings.
Prescribed types can be revised during execution if the resolution warrants it.

**Research execution:** Research tracks are independent and can run in parallel via
external-research-analyst subagents:

- Track 1: Session lifecycle (Gaps 1, 5) — session state patterns in development frameworks
- Track 2: Context loading (Gap 2) — LLM context effectiveness research
- Track 3: Planning lifecycle (Gap 11) — SE planning artifacts and pre-requirements conventions

**Fast-track execution:** First-principles decisions (requirements 4-10) can proceed in
parallel with or ahead of research tracks, as they don't depend on research findings.
Research results may _inform_ these designs (e.g., session lifecycle research may suggest
improvements to the mismatch recovery protocol) but don't _block_ them.

**ADR methodology:** Follow the established ADR strategy — Nygard five-section format,
sequential numbering continuing from WU1 (ADR-007+), immutable once accepted. ADRs land in
`.arc-internal/reference/adr/`.

**Reference artifacts:**

- `notes-foundational-gap-closure.md` — context loading three-tier model, research seed
  sources, session state problem analysis, and analogous domain patterns.

**Dependency ordering:**

- Research tracks (requirements 1-3) should start early — findings inform design quality
- Fast-track decisions (requirements 4-10) are independent of each other and of research
- Partially addressed findings (requirements 11-13) are low-effort, no dependencies
- WU2 annotations (requirement 14) can happen at any point
- Gap 11 deliverables (PRD template, plan-\* convention) should be validated against ARC's own
  pipeline experience before finalizing

## Success Criteria

1. **All 11 gaps resolved** — Every gap has a documented design decision with rationale, either
   as an ADR, strategy update, or workflow change specification
2. **All 3 partially addressed findings resolved** — Each has either a concrete resolution or a
   documented WU2 implementation note
3. **Research-grounded where warranted** — Gaps 1, 2, 5, and 11 have design decisions informed
   by external evidence, not just internal reasoning
4. **Actionable for WU2** — Every output is specific enough for WU2 to implement without
   further design decisions. Workflow change specs describe what the change should be, not just
   that a change is needed
5. **WU2 plan annotated** — WU2 plan reflects WU1.5 as upstream dependency with affected
   clusters flagged
6. **Planning pipeline codified** — Plan-\* convention documented, PRD template created, planning
   lifecycle has the same level of codification as task execution
7. **Internally consistent** — WU1.5 outputs don't contradict WU1 ADRs or each other

## Open Questions

1. **How many ADRs will WU1.5 produce?** — Minimum 1 (session state portability is clearly
   ADR-level). Context loading may warrant an ADR or may validate the current approach (strategy
   update). Planning lifecycle output format depends on research. Consolidation possible where
   gaps share design space (e.g., Gaps 1+5 as one ADR). Leave to emerge during execution.

2. **Does solving session state portability (Gap 1) fully resolve team work transfer (Gap 5)?**
   — Partially, at minimum. If session state becomes shareable, the transfer mechanism exists.
   But the _process_ (what outgoing dev prepares, what incoming dev does) may still need
   separate specification. Research findings will clarify.

3. **What is the right home for planning lifecycle codification?** — Options: new strategy
   document (`strategy-planning-lifecycle.md`), additions to the development methodology
   strategy, or additions to the work organization strategy. Depends on scope of findings.

---
