# Task List: Foundational Gap Closure

**PRD:** `.arc-internal/active/technical/prd-foundational-gap-closure.md`
**Created:** 2026-02-25
**Branch(es):** `technical/foundational-gap-closure`
**Base Branch:** `main`
**Status:** In Progress

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

- [ ] **1.1 Research session state patterns (Gaps 1, 5)**

    **Goal:** Gather evidence on how other frameworks handle session state portability, team
    handoff, and the local-vs-shared state split.

    - Research scope: development frameworks, IDE state management, collaboration tools
    - Evaluate the "project state vs. session state" decomposition against found patterns
    - Cover all three PRD scenarios: multi-machine single dev, team handoff, team awareness
    - See `notes-foundational-gap-closure.md` § Session State Portability for problem analysis
      and analogous domains (Terraform state, dotenv, IDE workspace files)
    - Output: `research-session-lifecycle.md`
    - Lint output file

- [ ] **1.2 Design session state architecture and team transfer (Gaps 1, 5; PRD Req 1)**

    **Goal:** Produce an ADR resolving session state portability and team transfer process.

    - [ ] **1.2.a Synthesize research into design options**
        - Consume `research-session-lifecycle.md`
        - Map found patterns to ARC's three scenarios
        - Evaluate "project state + session state" decomposition against research
        - Document 2-3 viable options with tradeoffs

    - [ ] **1.2.b Draft ADR (session state architecture)**
        - Follow ADR strategy: Nygard five-section format, ADR-007+
        - Cover both Gap 1 (portability mechanism) and Gap 5 (transfer process)
        - Include consequences for session-init, session-handoff, and team-coordination workflows
        - Evaluate against PRD use cases 1, 3, 5

    - [ ] **1.2.c Cross-reference and lint**
        - Verify consistency with ADR-002 (session model) and ADR-003 (config architecture)
        - Lint all modified/created files

### **Phase 2:** Context Loading Architecture (Gap 2)

**Purpose:** Research and resolve whether ARC's context loading model is empirically grounded.

- [ ] **2.1 Research LLM context effectiveness (Gap 2)**

    **Goal:** Assess ARC's three-tier context loading model against empirical evidence.

    - See `notes-foundational-gap-closure.md` § Context Loading Architecture for the full
      three-tier model, 5 research questions, and seed sources
    - Key seed: Gloaguen et al. (2026), "Evaluating AGENTS.md" + internal
      `research-context-degradation.md`
    - Research scope: LLM context window utilization, instruction-following with context volume,
      "lost in the middle" effects, structured vs. monolithic context delivery
    - Output: `research-context-loading.md`
    - Lint output file

- [ ] **2.2 Evaluate and resolve context loading design (Gap 2, PRD Req 2)**

    **Goal:** Produce an ADR or strategy update resolving the context loading design question.

    - [ ] **2.2.a Evaluate ARC's model against findings**
        - Consume `research-context-loading.md`
        - Assess each tier against empirical evidence
        - Identify any documents that evidence suggests should move between tiers
        - Determine output format: ADR (if architectural change) or strategy update (if validation)

    - [ ] **2.2.b Draft ADR or strategy update**
        - If ADR: Nygard format, sequential numbering
        - If strategy update: identify target document and section
        - Address all 5 research questions from `notes-foundational-gap-closure.md`

    - [ ] **2.2.c Cross-reference and lint**
        - Verify consistency with session-init workflow and strategy document protocol
        - Lint all modified/created files

### **Phase 3:** Planning Document Lifecycle (Gap 11)

**Purpose:** Research, codify the planning pipeline convention, and create a PRD template.

- [ ] **3.1 Research SE planning practices (Gap 11)**

    **Goal:** Evaluate ARC's plan→PRD→tasks pipeline against established patterns.

    - ARC-anchored scope: start from what ARC does, look for proven improvements, don't survey
      radically different approaches
    - Current lifecycle: backlog buckets → ephemeral `plan-*` docs → PRD → task list
    - Research areas: design docs (Google, Amazon, Stripe conventions), RFCs, progressive
      elaboration, pre-requirements planning artifacts in development frameworks
    - Focus: techniques that improve content quality within existing stages, not additional
      stages or ceremony
    - Output: `research-planning-lifecycle.md`
    - Lint output file

- [ ] **3.2 Codify planning lifecycle and create PRD template (Gap 11, PRD Req 3)**

    **Goal:** Document the planning pipeline convention and produce a PRD template.

    - [ ] **3.2.a Draft planning lifecycle convention**
        - Consume `research-planning-lifecycle.md`
        - Codify `plan-*` doc convention: purpose, structure, when to create, ephemeral nature,
          graduation to PRD, many-to-one grouping
        - Determine home: new strategy, or additions to development methodology / work organization
        - Incorporate proven SE planning techniques identified in research

    - [ ] **3.2.b Create PRD template**
        - `prd-template.md` analogous to existing `adr-template.md`
        - Inline guidance for each section (Introduction, Goals, Use Cases, Requirements, etc.)
        - Reflect any improvements from research findings
        - Place in `.arc/` template system (location per file classification conventions)

    - [ ] **3.2.c Evaluate create-prd workflow improvements**
        - Assess whether discovery step (Step 3) needs strengthening
        - Review workflow against research findings for other improvements
        - Output: workflow update specification in WU2 plan doc

    - [ ] **3.2.d Lint all Phase 3 outputs**

### **Phase 4:** Fast-Track Design Decisions

**Purpose:** Resolve the 7 gaps that don't require external research. Strategy updates are
written directly; workflow change specs are added to the WU2 plan doc for implementation.

- [ ] **4.1 Design first-session bootstrap (Gap 3, PRD Req 4)**

    - Session-init assumes CURRENT-SESSION.md exists; no workflow bridges setup to first session
    - Options: graceful handling in session-init, setup creates initial state, separate workflow
    - Read: `session-init.md`, `01_initialize-arc.md`, `02_define-project.md`,
      `CURRENT-SESSION.template.md`
    - Output: workflow change spec in WU2 plan doc
    - Lint modified files

- [ ] **4.2 Stabilize task references (Gap 4, PRD Req 5)**

    - Line-number-based task anchors in CURRENT-SESSION.md break when tasks are edited
    - Options: stable task IDs, markdown heading anchors, verification guidance
    - Read: `session-init.md` (line number references), `session-handoff.md` (anchor format),
      `strategy-task-list-formatting.md` (task numbering scheme)
    - Output: convention decision (strategy update or WU2 plan spec depending on scope)
    - Lint modified files

- [ ] **4.3 Document method override dependencies (Gap 6, PRD Req 6)**

    - Coupled methods (task-completion ↔ commit-context-format) documented as independent
    - Read: `strategy-configurability-architecture.md` (method overrides section), ADR-005
    - Output: dependency guidance spec for `arc-methods.md` in WU2 plan doc (WU2 creates file)
    - Lint modified files

- [ ] **4.4 Clarify config semantics in team mode (Gap 7, PRD Req 7)**

    - `arc-config.yml` described as singular project-level file; team mode config undefined
    - Read: `strategy-configurability-architecture.md` (agent discovery), ADR-003,
      `strategy-team-coordination.md`
    - Output: strategy update (if project-wide by design) or ADR note (if layered needed)
    - Lint modified files

- [ ] **4.5 Clarify archive trigger for stacked branches (Gap 8, PRD Req 8)**

    - "Archive when all tasks complete" doesn't verify branch merge state
    - Read: `strategy-work-organization.md` (archive timing), `archive-completed.md`
    - Output: workflow change spec in WU2 plan doc
    - Lint modified files

- [ ] **4.6 Design session state mismatch recovery (Gap 9, PRD Req 9)**

    - Session-init detects mismatches but only offers "stop and ask" — no recovery protocol
    - Define trust hierarchy: git status vs. task list vs. CURRENT-SESSION.md
    - Define tiered recovery: minor (auto-correct with notice) vs. major (stop and ask)
    - Read: `session-init.md` (step 4, mismatch detection)
    - Output: workflow change spec in WU2 plan doc
    - Lint modified files

- [ ] **4.7 Design staleness detection (Gap 10, PRD Req 10)**

    - CURRENT-SESSION.md read without freshness check; stale state from skipped handoffs
    - Define "stale": timestamp drift, commit count since last update, other signals
    - Read: `session-init.md`, `strategy-development-methodology.md` (session documentation)
    - Output: workflow change spec in WU2 plan doc
    - Lint modified files

### **Phase 5:** Partially Addressed Findings

**Purpose:** Resolve the 3 remaining audit findings not fully covered by existing decisions.

- [ ] **5.1 Define agent switching operational guidance (PRD Req 11)**

    - ADR-002 supports switching architecturally; operational guidance is missing
    - Define how incoming agent handles prior agent's context in CURRENT-SESSION.md
    - Read: ADR-002 (Part 3, Part 5), `session-init.md`
    - Output: workflow change spec in WU2 plan doc
    - Lint modified files

- [ ] **5.2 Clarify deferred review scope bounds (PRD Req 12)**

    - "Stop if anything unexpected arises" — threshold undefined
    - Define what qualifies as "unexpected": quality gate failure, scope exceeding estimate,
      blocking dependency, etc.
    - Read: `3_process-task-loop.md` (deferred review section)
    - Output: workflow change spec in WU2 plan doc
    - Lint modified files

### **Phase 6:** Verification

- [ ] **6.1 Run Tier 3 quality gates**
- [ ] **6.2 Validate success criteria against PRD**

---

## Success Criteria

- [ ] All 11 gaps have documented design decisions (ADR, strategy update, or workflow spec)
- [ ] All 3 partially addressed findings resolved
- [ ] Research-grounded decisions (Gaps 1, 2, 5, 11) informed by external evidence
- [ ] All outputs specific enough for WU2 to implement without further design decisions
- [ ] Planning pipeline codified: `plan-*` convention documented, PRD template created
- [ ] Outputs internally consistent and consistent with WU1 ADRs
- [ ] All quality gates pass (markdown linting, zero violations)

---
