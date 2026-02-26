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
