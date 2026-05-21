# Task List: Foundational Gap Closure

**PRD:** `.arc-internal/active/technical/prd-foundational-gap-closure.md`
**Created:** 2026-02-25
**Branch(es):** `technical/foundational-gap-closure`
**Base Branch:** `main`
**Status:** Complete
**Completed:** 2026-02-26

## Overview

**Purpose:** Resolve 11 foundational design gaps (plus 3 partially addressed findings) identified
by the Phase 1 audit, producing ADRs, strategy updates, and workflow change specifications that
WU2 consumes.

**Strategies:** `strategy-adr-methodology.md`, `strategy-development-methodology.md`,
`strategy-work-organization.md`

## Scope

### Will Do

- External research for 4 gaps (session state, context loading, planning lifecycle, team transfer)
- First-principles design decisions for 7 gaps (fast-track, no research needed)
- Resolution of 3 partially addressed audit findings
- ADRs and strategy updates written directly; workflow change specs added to WU2 plan
- PRD template for adopter use (part of Gap 11 planning lifecycle)

### Won't Do

- Implementation of workflow changes (WU2 scope) — workflow specs go into the WU2 plan doc
- WU2 plan restructuring (light annotations only)
- Structural file changes to existing `.arc/` files
- Planning methodology overhaul (validate and improve within existing lifecycle shape)

### Completed During Planning

- **PRD Requirement 13** (file reclassification checkpoint): Added to WU2 plan Cluster M
- **PRD Requirement 14** (WU2 plan annotations): WU1.5 added as upstream dependency, "8 ADRs"
  corrected, affected clusters flagged

### Output Placement

- **ADRs** → `.arc-internal/reference/adr/` (direct, per ADR strategy)
- **Strategy updates** → direct edits to existing strategy files (documenting design choices)
- **Workflow change specs** → `plan-wu2-methodology-completion.md` (consumed by WU2)
- **Research syntheses** → dedicated `research-*` files (archivable to `reference/research/`)
- **PRD template** → `.arc/` template system (per file classification conventions)

---

## Tasks

### **Phase 1:** Session Lifecycle Design (Gaps 1, 5)

**Purpose:** Research and resolve session state portability and team work transfer — the largest
and most architecturally significant gap cluster.

- [x] **1.1 Research session state patterns (Gaps 1, 5)**

    **Goal:** Gather evidence on how other frameworks handle session state portability, team
    handoff, and the local-vs-shared state split.

    - Research scope: development frameworks, IDE state management, collaboration tools
    - Evaluate the "project state vs. session state" decomposition against found patterns
    - Cover all three PRD scenarios: multi-machine single dev, team handoff, team awareness
    - See `notes-foundational-gap-closure.md` § Session State Portability for problem analysis
      and analogous domains (Terraform state, dotenv, IDE workspace files)
    - Output: `research-session-lifecycle.md`
    - Lint output file
    - Completed: authored `research-session-lifecycle.md` synthesizing state portability and
      team handoff patterns across dotenv/IDE configs, Terraform/Pulumi backends, Git-native
      mechanisms, and handoff workflow models.

- [x] **1.2 Design session state architecture and team transfer (Gaps 1, 5; PRD Req 1)**

    **Goal:** Produce an ADR resolving session state portability and team transfer process.
    Resolved as ADR-007: two-file decomposition (tracked WORK-STATUS.md + gitignored SESSION.md)
    with git notes for portability via per-developer namespaces.

    - [x] **1.2.a Synthesize research into design options**
        - Consumed `research-session-lifecycle.md`, mapped 9 pattern categories to ARC's
          three scenarios (multi-machine solo, team handoff, team awareness)
        - Validated project-state / session-state decomposition against cross-industry evidence
        - Evaluated 3 options: (A) formalize gitignored single file + reconstruction,
          (B) two-file decomposition with git notes portability, (C) promote state into task list
        - Option C eliminated (couples to task list implementation, breaks for external trackers)
        - Option B selected with refinements: per-developer note namespaces, configurable push
          behavior, work-unit + branch fields in WORK-STATUS.md
        - Iterative design exploration traced branch-switch seam, shared-branch scenarios,
          team directory structure, and graceful degradation model
        - Design exploration doc (`design-session-state-architecture.md`) created for
          walkthrough, then deleted after ADR captured the decision

    - [x] **1.2.b Draft ADR (session state architecture)**
        - ADR-007: `adr-007-design-session-state-portability-and-team-transfer.md`
        - Six-part decision: two-file decomposition, git notes portability, configurable push,
          workflow integration (session-init/handoff/rotate-branch/archival), setup/tooling,
          graceful degradation
        - Covers Gap 1 (portability via git notes + tracked WORK-STATUS.md) and Gap 5
          (team transfer via per-developer note namespaces + structured handoff ceremony)
        - Consequences address PRD scenarios, rebase limitation, HEAD-advancing edge case,
          note accumulation, refspec misconfiguration
        - `rotate-branch.md` (WU2 D6) identified as handler for multi-work-unit branch switching
        - Automated note cleanup on archival specified (not optional)

    - [x] **1.2.c Cross-reference and lint**
        - ADR-002: consistent — builds on session definition, mechanism-level changes classified
          as incidental per workflow assumption table, terminology refined not contradicted
        - ADR-003: consistent — new config settings follow dotted-key convention and satisfy
          programmatic-consumption criteria; noted file classification update needed for WU2
          (CURRENT-SESSION → WORK-STATUS + SESSION replacement in strategy-file-classification.md)
        - Added file classification consequence to ADR-007 Negative section
        - All modified files lint clean (ADR-007, task list, session-init)

### **Phase 2:** Context Loading Architecture (Gap 2)

**Purpose:** Research and resolve whether ARC's context loading model is empirically grounded.

- [x] **2.1 Research LLM context effectiveness (Gap 2)**

    **Goal:** Assess ARC's three-tier context loading model against empirical evidence.

    - Two-pass external research: (1) Gloaguen et al. paper + HN practitioner discussion,
      (2) targeted research on 5 research questions from notes file
    - Synthesized into `research-context-loading.md` — 31 sources across peer-reviewed
      benchmarks, vendor guidance, practitioner reports, and bug reports
    - Key finding shift: instruction count and conflict density matter more than token volume
    - Evidence validates tiered structure, flags instruction conflict risk in Tier 1 and
      procedural content vulnerability, identifies Tier 2 empirical gap
    - Companion to existing `research-context-degradation.md` (general window behavior)

- [x] **2.2 Evaluate and resolve context loading design (Gap 2, PRD Req 2)**

    **Goal:** Produce decided design changes for WU2 resolving the context loading question.

    - [x] **2.2.a Evaluate ARC's model against findings**
        - Consumed three research inputs: `research-context-loading.md` (31 sources),
          `research-context-degradation.md` (28 sources), and new
          `research-instruction-reliability.md` (17+ sources on delivery mechanisms,
          skill recognition, explicit vs. implicit triggers)
        - Key reframing: instruction budget, not token/document count, is the primary
          constraint. Current Tier 1 imposes ~80-125 instructions, approaching the
          150-200 threshold where frontier models degrade
        - Produced five design decisions: (1) formalize tier model with 2a/2b
          distinction, (2) demote process-task-loop to Tier 2a, (3) restructure
          dev-rules/strategy as co-located twin core docs (DEV-RULES.ARC/PROJECT),
          (4) formalize explicit trigger mechanism, (5) instruction density audit
        - Cross-document conflict audit resolved — all four overlap areas eliminated
          by the restructure
        - Full evaluation: `notes-foundational-gap-closure.md` § Evaluation: Context
          Loading Design

    - [x] **2.2.b Write research file, WU2 change specs, and verify**
        - Created `research-instruction-reliability.md` — reliability research
          synthesis following established pattern (companion to context-loading and
          context-degradation research docs)
        - Added WU2 plan doc change specs: Cluster C expanded with C2-C6 (core
          document restructure, strategy slimming, session-init redesign, tier
          model formalization, Tier 2a trigger pattern)
        - Annotated Cluster O (method-override interaction with DEV-RULES.ARC)
        - Updated WU1.5 dependency section with specific Gap 2 outputs
        - Verification (absorbed 2.2.c — no direct workflow/strategy edits to
          cross-reference): all files linted clean, consistent terminology across
          files, WU2 additions verified against existing clusters

### **Phase 3:** Planning Document Lifecycle (Gap 11)

**Purpose:** Research, codify the planning pipeline convention, and create a PRD template.

- [x] **3.1 Research SE planning practices (Gap 11)**

    **Goal:** Evaluate ARC's plan→PRD→tasks pipeline against established patterns.

    - Researched design doc conventions (Google, Amazon, Stripe), RFC processes (Rust,
      Ember), development methodologies (Shape Up, Agile), progressive elaboration,
      discovery/scoping techniques, PRD template evolution, and the codification spectrum
    - Key finding: pre-requirements phase benefits most from *input quality guardrails*
      (discovery checklists, problem framing) over *output templates* (mandatory sections)
    - Shape Up's "pitch" is the closest analogue to ARC's plan-\* docs
    - ARC's PRD template is well-aligned with modern practice; marginal improvements only
    - Codification spectrum: light structure for exploration, heavy for execution — value
      curve flattens quickly in exploratory phases
    - Output: `research-planning-lifecycle.md` (30+ sources across 6 topic areas)
    - Linted clean

- [x] **3.2 Codify planning lifecycle and create PRD template (Gap 11, PRD Req 3)**

    **Goal:** Document the planning pipeline convention and produce a PRD template.

    - [x] **3.2.a Draft planning lifecycle convention**
        - Created `strategy-work-planning.md` — new strategy doc covering the full
          pipeline (backlog → plan-\* → PRD → tasks), plan-\* doc conventions (naming,
          ephemeral lifecycle with delete-on-graduation default, many-to-one PRD
          relationship), discovery checklist (7 critical questions), PRD readiness
          signals, PRD conventions, and anti-patterns
        - Home decided: new strategy named to pair with `strategy-work-organization.md`
          (both about work units). Added to STRATEGY-INDEX.

    - [x] **3.2.b Create PRD template and establish templates directory**
        - Created `reference/templates/` as centralized template home with `template-`
          prefix naming convention (enables fuzzy-find)
        - Moved `adr-template.md` → `templates/template-adr.md` (updated references in
          DEVELOPMENT-RULES.template.md, strategy-adr-methodology.md ×2); added new
          `reference/templates/` section to strategy-file-classification.md
        - Created `template-prd.md` — copy-ready PRD template based on create-prd
          workflow format with research-informed improvements: "why now" framing in
          Introduction, P0/P1/P2 prioritization option for Requirements,
          strengthened measurability guidance for Success Criteria, Open Questions
          triage (pre-start vs. during-work)
        - Created `template-plan.md` — optional lightweight plan structure
          (Problem/Motivation, Alternatives, Unknowns/Assumptions, Scope Estimate)

    - [x] **3.2.c Evaluate create-prd workflow improvements**
        - Added three WU2 specs to plan doc Cluster G: G8 (extract PRD format from
          workflow to template reference), G9 (strengthen discovery step with
          checklist reference), G10 (reference planning lifecycle strategy from
          Step 1)
        - Updated WU1.5 dependency section with Gap 11 outputs and affected cluster

    - [x] **3.2.d Lint all Phase 3 outputs**
        - All 9 created/modified files lint clean (zero violations)

### **Phase 4:** Fast-Track Design Decisions

**Purpose:** Resolve the 7 gaps that don't require external research. Strategy updates are
written directly; workflow change specs are added to the WU2 plan doc for implementation.

- [x] **4.1 Design first-session bootstrap (Gap 3, PRD Req 4)**

    Resolved as WU2 plan spec C7. Decision: Option A — init scaffolds `WORK-STATUS.md`
    (ADR-007's tracked replacement for `CURRENT-SESSION.md`) with a "no active work" default
    state. Session-init detects this state and provides orientation guidance rather than
    failing. The same state recurs between work units (post-archive, pre-activate), so this
    is a recurring lifecycle state, not a one-time bootstrap.

    - Spec covers 4 workflows: `01_initialize-arc.md` (scaffold), `session-init.md` (detect),
      `activate-work-unit.md` (populate), `archive-completed.md` (reset)
    - `SESSION.md` (gitignored) needs no special handling — ADR-007 Part 4 already specifies
      graceful degradation for missing file
    - Lint: zero violations

- [x] **4.2 Stabilize task references (Gap 4, PRD Req 5)**

    Resolved as WU2 plan spec C8. Decision: triple-anchor reference format — task title
    snippet (stable) + task number (semi-stable) + line number with tilde (disposable hint).
    Example: `Task 4.1 — Design first-session bootstrap (line ~228)`.

    - Session-init gets a graceful fallback lookup: line hint → verify number → search
      number → search title → report mismatch. Handles both routine line drift and
      occasional phase restructuring without hard-failing.
    - No structural change to task list format — task numbering and hierarchy unaffected.
      Numbers are human-readable IDs, not stable database keys.
    - Commit message `Context:` references unaffected — historical record, not navigational.
    - Spec integrates with C5 (session-init redesign) and C7 (WORK-STATUS.md bootstrap).
    - Lint: zero violations

- [x] **4.3 Document method override dependencies (Gap 6, PRD Req 6)**

    Resolved as dependency guidance addition to WU2 plan spec O2 (`arc-methods.md`
    scaffolding). Analysis: only one genuine coupling exists among the 4 preset methods —
    `task-completion` ↔ `commit-context-format` (both reference the task tracking system).
    The other two methods (`session-state`, `quality-gate-commands`) are independent.

    - Added `Related:` field to method definition structure — advisory note listing
      typically co-overridden methods with rationale
    - Agent notes coupling during session-init config awareness (ADR-005 Part 6)
    - Dependency map table in O2 makes all couplings (and independences) explicit
    - Validation Scenario A already demonstrates correct pattern; guidance makes it
      discoverable rather than implicit in examples
    - Lint: zero violations

- [x] **4.4 Clarify config semantics in team mode (Gap 7, PRD Req 7)**

    Resolved as strategy update. Decision: `arc-config.yml` is **project-wide by design**.
    Per-developer values (session identity) route through git config, which is already
    per-developer. No layered config mechanism needed — YAGNI for 1-2 settings.

    - Added "Config scope: project-wide by design" section to
      `strategy-configurability-architecture.md` with rationale and upgrade path note
    - Updated ADR-007 Part 5 setup: `session.identity` now uses `git config
      arc.session.identity` instead of `arc-config.yml`
    - Door left open: `team/{name}/` noted as future home for personal config if needs grow
    - Lint: zero violations

- [x] **4.5 Clarify archive trigger for stacked branches (Gap 8, PRD Req 8)**

    Resolved as workflow change spec in WU2 plan doc. Decision: archive trigger
    stays "all tasks `[x]`" (unchanged). The gap was missing merge verification —
    resolved via three-operation model that separates intermediate and final merges:

    - **Rotate** (mid-work-unit): `rotate-branch.md` (D6) — merge current branch,
      create next, no archival
    - **Complete** (all tasks `[x]`): write completion doc, enter archive-completed
    - **Archive** (after final merge): Phase 2→3 gate enforces merge before `git mv`

    Annotated D2 (multi-branch archive guidance) and D6 (rotate-branch role) in
    WU2 plan. Updated dependency section: Gap 8 annotation replaced speculative
    "may land as" with concrete decision.
    - Lint: zero violations

- [x] **4.6 Design session state mismatch recovery (Gap 9, PRD Req 9)**

    Resolved as workflow change spec C9 in WU2 plan doc. Decision: tiered recovery
    based on source reliability, replacing the flat "stop and ask for everything" model.

    - **Trust hierarchy**: git state > task list > WORK-STATUS.md > SESSION.md
    - **Auto-recover with notice**: when git + task list agree and only the session
      doc is behind (unambiguous staleness — e.g., session doc says "uncommitted" but
      git shows clean, or says "Task 3.2 current" but task list shows 3.2 `[x]`)
    - **Stop and ask**: when correct state requires human judgment (wrong branch,
      missing task list, unexplained uncommitted changes)
    - ADR-007 interaction: WORK-STATUS.md updates atomically with commits, making
      auto-recoverable scenarios rarer; protocol primarily fires for SESSION.md
      staleness or skipped handoffs
    - Added C9 to Cluster C in WU2 plan; updated dependency section with concrete spec
    - Lint: zero violations

- [x] **4.7 Design staleness detection (Gap 10, PRD Req 10)**

    Resolved as workflow change spec C10 in WU2 plan doc. Decision: commit hash anchor
    for objective staleness detection, informational (not blocking), feeding into C9's
    mismatch recovery trust hierarchy.

    - **Staleness signal**: SESSION.md gets a "Commit at Handoff" field (HEAD hash at
      session end). Session-init compares anchor against current HEAD — mismatch means
      commits happened after last handoff. WORK-STATUS.md checked via last-touching
      commit vs HEAD (drift is unusual under ADR-007's atomic update model).
    - **Informational, not blocking**: staleness alone doesn't prevent initialization.
      Agent reports gap count and proceeds with awareness. Staleness lowers confidence
      in session doc, increasing reliance on git/task list per C9's trust hierarchy.
    - **Sequence**: freshness check slots between context loading (C5) and mismatch
      detection (C9) in session-init. C10 alongside C5/C7/C8/C9 implementation.
    - **Handoff update**: session-handoff.md adds "Commit at Handoff" field to template
    - Added C10 to Cluster C in WU2 plan; updated dependency section with concrete spec
    - Lint: zero violations

### **Phase 5:** Partially Addressed Findings

**Purpose:** Resolve the 3 remaining audit findings not fully covered by existing decisions.

- [x] **5.1 Define agent switching operational guidance (PRD Req 11)**

    Resolved as light annotation on C5 in WU2 plan doc. ADR-007's two-file split
    inherently handles agent switching: WORK-STATUS.md is factual project state
    (fully agent-agnostic), SESSION.md carries qualitative context about the work
    (not the agent). Agent-specific content in SESSION.md would be unusual in
    practice. Spec: add brief acknowledgment in session-init's SESSION.md loading
    step — extract factual content, disregard agent-specific references. No
    structural changes needed.
    - Lint: zero violations

- [x] **5.2 Clarify deferred review scope bounds (PRD Req 12)**

    Resolved as workflow change spec G11 in WU2 plan doc. Enumerates the
    "unexpected" threshold as two tiers:

    - **Must stop**: quality gate failure (not auto-fixable), blocking dependency
      outside deferred scope, unanticipated design decisions needed, scope
      significantly exceeds task description
    - **Continue with note**: minor auto-fixed issues, task took longer than
      expected, minor plan deviation not affecting subsequent tasks
    - Principle: stop when continuing would produce work the user hasn't approved
    - Lint: zero violations

### **Phase 6:** Verification

- [x] **6.1 Run Tier 3 quality gates**
    - Full-project markdown lint: 0 errors across 123 files
- [x] **6.2 Validate success criteria against PRD**
    - All 7 success criteria met (`[x]`), evidence traced per criterion below

---

## Success Criteria

- [x] All 11 gaps have documented design decisions (ADR, strategy update, or workflow spec)
    - Gaps 1+5: ADR-007 (session state + team transfer)
    - Gap 2: C2-C6 workflow specs (context loading restructure)
    - Gap 3: C7 (first-session bootstrap)
    - Gap 4: C8 (task reference stability)
    - Gap 6: O2 strategy update (method dependencies)
    - Gap 7: strategy update (config scope)
    - Gap 8: D2/D6 workflow specs (archive trigger, three-operation model)
    - Gap 9: C9 (mismatch recovery, tiered with trust hierarchy)
    - Gap 10: C10 (staleness detection, commit hash anchor)
    - Gap 11: strategy-work-planning.md + template-prd.md + G8-G10
- [x] All 3 partially addressed findings resolved
    - Req 11 (agent switching): C5 annotation — ADR-007 inherently solves
    - Req 12 (deferred review bounds): G11 — enumerated stop conditions
    - Req 13 (file reclassification): added to Cluster M during planning
    - Req 14 (WU2 plan annotations): completed during planning, maintained throughout
- [x] Research-grounded decisions (Gaps 1, 2, 5, 11) informed by external evidence
    - Gap 1+5: `research-session-lifecycle.md` (dotenv/IDE/Terraform/Git patterns)
    - Gap 2: `research-context-loading.md` (LLM context effectiveness studies)
    - Gap 11: `research-planning-practices.md` (SE planning methodologies)
- [x] All outputs specific enough for WU2 to implement without further design decisions
    - Each WU2 plan annotation includes concrete spec: what to change, where, why
    - ADRs provide six-part decisions with implementation guidance
    - Strategy updates written directly (no deferred design)
- [x] Planning pipeline codified: `plan-*` convention documented, PRD template created
    - `strategy-work-planning.md` created with full lifecycle
    - `template-prd.md` created in `reference/templates/`
    - G8-G10 specs for workflow integration
- [x] Outputs internally consistent and consistent with WU1 ADRs
    - ADR-007 builds on ADR-002 (session model) and ADR-005 (tool compatibility)
    - Config scope (Gap 7) consistent with ADR-003 (configurability architecture)
    - Method dependencies (Gap 6) consistent with ADR-005 (external tools)
    - All WU2 plan annotations reference specific ADR decisions
- [x] All quality gates pass (markdown linting, zero violations)
    - Tier 3 full-project lint: 0 errors across 123 files

---
