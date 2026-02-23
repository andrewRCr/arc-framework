# Task List: Core Philosophy & Configurability Architecture

**PRD:** `.arc-internal/backlog/technical/prd-philosophy-configurability.md`
**Notes:** `.arc-internal/backlog/technical/notes-philosophy-configurability.md`
**Created:** 2026-02-23
**Branch:** `technical/philosophy-configurability`
**Base Branch:** `main`
**Status:** Pending

## Overview

**Purpose:** Resolve all foundational design decisions for ARC 1.0 through ADRs and strategy
documents, enabling downstream work units (WU2-WU4) to implement with clear architectural
guidance.

## Scope

### Will Do

- External research on agent landscape, context degradation, and development methodologies
- 9 ADR candidate discussions, each producing a documented decision (may consolidate into fewer
  ADRs)
- Strategy document synthesis (minimum: core philosophy + configurability architecture)
- Light adopter-scenario validation against PRD use cases
- Core internal document refresh (META-PRD, AGENTS.md, agent files)

### Won't Do

- Edit existing workflows, hooks, or templates (WU2)
- CLI or distribution tooling (WU3)
- Documentation site content or repo-root README (WU4)
- Structural file reorganization

**Research output convention:** Each research task produces a `research-*.md` file in
`active/technical/` containing the full research agent summary with references. Research is
gathered, evaluated for sufficiency, and supplemented if needed before moving on.

---

## Tasks

### **Phase 1:** Research Foundation

**Purpose:** Gather external evidence to ground ADR discussions in facts rather than assumptions.

- [ ] **1.1 Research agent landscape**

    **Goal:** Understand how IDE, cloud/remote, and factory-style agents work to inform session
    model and agent-agnosticism decisions (PRD requirements 1, 3).

    - [ ] **1.1.a Gather agent landscape research**
        - Prompt external research agent covering:
            - IDE agents (Cursor, Windsurf) — context persistence, session boundaries,
              file-level collaboration model
            - Cloud/remote agents (Claude web, Codex desktop) — branching workflows,
              async work patterns, handoff to humans
            - Factory-style agents (Devin, SWE-agent, Copilot Workspace) — capabilities,
              typical workflows, level of autonomy, human handoff points
        - Save full output with references to `research-agent-landscape.md` in
          `active/technical/`

    - [ ] **1.1.b Evaluate and supplement**
        - Review research quality and coverage together
        - Identify gaps or weak areas
        - Run follow-up research prompts if needed
        - Mark complete when evidence base is sufficient for requirements 1 and 3

- [ ] **1.2 Research context degradation in large windows**

    **Goal:** Verify claims about context quality degradation before codifying session length
    guidance (PRD requirements 2, 3).

    - [ ] **1.2.a Gather context degradation research**
        - Prompt external research agent covering:
            - Empirical evidence on LLM performance degradation as context length increases
            - Studies or benchmarks comparing output quality at different context utilization
              levels (e.g., 25% vs 50% vs 75% of window)
            - Vendor guidance on optimal context usage from Anthropic, Google, OpenAI
            - Relevance to session management in agentic coding workflows
        - Save full output with references to `research-context-degradation.md` in
          `active/technical/`

    - [ ] **1.2.b Evaluate and supplement**
        - Review research quality and coverage together
        - Assess whether evidence supports ~200k focused session guidance or suggests
          a different threshold
        - Run follow-up prompts if needed
        - Mark complete when evidence base is sufficient for requirements 2 and 3

- [ ] **1.3 Research development methodology landscape**

    **Goal:** Understand Scrum/Kanban/hybrid prevalence and how structured documentation
    frameworks integrate with established methodologies (PRD requirement 9).

    - [ ] **1.3.a Gather methodology landscape research**
        - Prompt external research agent covering:
            - Prevalence of Scrum, Kanban, hybrid, and other methodologies in professional
              software teams (recent survey data if available)
            - Key constructs: sprints, stories, story points, velocity, WIP limits,
              ceremonies, backlogs, epics
            - How structured documentation/planning frameworks layer on top of agile
              workflows (precedents, patterns)
            - Common friction points when introducing structured processes into agile teams
        - Save full output with references to `research-dev-methodology.md` in
          `active/technical/`

    - [ ] **1.3.b Evaluate and supplement**
        - Review research quality and coverage together
        - Identify concrete integration patterns applicable to ARC's constructs
        - Run follow-up prompts if needed
        - Mark complete when evidence base is sufficient for requirement 9

- [ ] **1.4 Research human attention and single-tasking**

    **Goal:** Gather empirical evidence that human attention is single-threaded — the cognitive
    science foundation for ARC's minimal parallelism and one-task-at-a-time principles
    (PRD requirement 1, core philosophy strategy document).

    - [ ] **1.4.a Gather attention/single-tasking research**
        - Prompt external research agent covering:
            - Empirical research on task-switching costs (cognitive psychology)
            - Studies on attention splitting and concurrent task performance
            - The multi-tasking myth — evidence that single-tasking outperforms
              multi-tasking in knowledge work
            - Any research specifically on monitoring multiple concurrent automated
              processes (relevant to multi-agent supervision)
            - Prefer peer-reviewed sources; note meta-analyses or landmark studies
        - Save full output with references to `research-attention-single-tasking.md`
          in `active/technical/`

    - [ ] **1.4.b Evaluate and supplement**
        - Review research quality — prioritize peer-reviewed, empirical sources
        - Assess whether evidence is strong enough to cite in a philosophy document
          (not just blog posts or conventional wisdom)
        - Run follow-up prompts if needed (e.g., narrow to specific landmark studies)
        - Mark complete when evidence base provides citable support for the
          single-threaded attention claim

- [ ] **1.5 Run quality gates on research files**
    - Lint all new research files

### **Phase 2:** Core Identity

**Purpose:** Define ARC's non-negotiable principles vs. configurable methods — the keystone
decision that everything else depends on. (PRD Requirement 1)

- [ ] **2.1 Prepare core identity discussion**

    **Goal:** Ground the discussion in what ARC actually is today, not what we assume it is.

    - Read current identity-defining docs:
        - META-PRD philosophy section
        - AGENTS.md collaboration principles
        - `strategy-development-methodology.md` behavioral constraints
        - Process task loop (one-task-at-a-time, review gates, deferred review)
    - Read `notes-philosophy-configurability.md` — candidate non-negotiables, audit
      findings (3 dealbreakers, 7 friction points, principle-vs-method analysis)
    - Read `research-agent-landscape.md` — multi-agent and co-development context
    - Read `research-attention-single-tasking.md` — empirical basis for
      single-threaded attention claim
    - Produce a working catalog: each current ARC practice listed with initial
      principle/method classification for discussion

- [ ] **2.2 Discuss and draft core identity ADR**

    - [ ] **2.2.a Classify each candidate principle**
        - Work through each candidate: spec-driven development, granular task tracking,
          human-agent pairing, minimal parallelism, quality gates, session documentation,
          git-native workflows
        - For each: principle (tier 1 non-negotiable), convention (tier 2 configurable),
          or escape hatch territory (tier 3)?
        - Apply the audit's analytical lens: does blurring this boundary cause adoption
          friction?
        - Document rationale for each classification

    - [ ] **2.2.b Position on multi-agent and autonomy spectrum**
        - Ground the single-threaded attention claim in `research-attention-single-tasking.md`
          evidence — cite, don't just assert
        - Articulate why ARC favors human-agent coupling and single-threaded execution
        - Acknowledge where orchestration and factory-style agents provide value
        - Define where sequential agent handoffs fit (compatible with ARC)
        - Establish tone: clear and honest, not preachy or dismissive

    - [ ] **2.2.c Resolve co-development model question**
        - Is "local CLI agent with filesystem co-development" a principle or a method?
        - What's the deeper principle if it's a method?
        - How does this affect cloud/remote agent compatibility?

    - [ ] **2.2.d Draft ADR**
        - Write ADR following `strategy-adr-methodology.md` format
        - File: `.arc-internal/reference/adr/adr-001-*.md` (title TBD based on discussion)
        - Include all classifications, rationale, and consequences

- [ ] **2.3 Review and finalize core identity ADR**
    - Iterate based on review feedback
    - Ensure consequences section identifies what becomes easier/harder for WU2-WU4
    - Lint ADR file

### **Phase 3:** Session & Agent Model

**Purpose:** Resolve whether ARC's session model is a principle or method, and map workflow
assumptions against the full agent spectrum. (PRD Requirements 2, 3)

- [ ] **3.1 Evaluate session model**

    **Goal:** Determine if the principle is "sessions with explicit boundaries" or "context must
    be recoverable." (PRD Requirement 2)

    - Read current session docs: `session-init.md`, `session-handoff.md`,
      `CURRENT-SESSION.template.md`, CLAUDE.md context window section
    - Read `research-context-degradation.md` for session length evidence
    - Read `research-agent-landscape.md` for how other agent types handle context
    - Consider: IDE agents with persistent memory, large-context agents, cloud agents
      with own-branch workflows
    - Identify WU2 scope implications for each possible answer (method = make
      configurable/optional; principle = clean up framing)
    - Draft ADR (session model evaluation)

- [ ] **3.2 Assess agent-agnosticism**

    **Goal:** Map ARC's workflow assumptions against the full agent spectrum and classify each
    as load-bearing vs. incidental. (PRD Requirement 3)

    - Read current agent-specific docs: AGENTS.md, CLAUDE.md, GEMINI.md, WARP.md,
      `copilot-instructions.template.md`
    - Read `research-agent-landscape.md` for the full agent spectrum
    - Evaluate each assumption against each agent type:
        - Conversational interaction
        - Context window loading
        - Turn-based execution
        - Terminal-based co-development
        - Local filesystem access
        - Slash commands / skill invocation
        - Deferred review protocol
    - Classify each: load-bearing (fundamental) vs. incidental (Claude Code artifact)
    - Identify adaptation points where workflows need flexibility
    - Draft ADR (agent-agnosticism assessment)

- [ ] **3.3 Review and finalize Phase 3 ADRs**
    - Iterate based on review feedback
    - Ensure session model and agent-agnosticism ADRs are consistent with core identity ADR
    - Lint all new ADR files

### **Phase 4:** Configurability Mechanisms

**Purpose:** Design the config system and extension point conventions that implement the
principle/method distinction. (PRD Requirements 4, 5)

- [ ] **4.1 Design configuration system**

    **Goal:** Define what goes in `arc-config.yml`, the schema, and format constraints.
    (PRD Requirement 4)

    - Read current `arc-config.yml` and hook scripts that parse it
    - Read `notes-philosophy-configurability.md` — config starting positions (current
      2 settings, priority additions, format constraints, A+B hybrid decision)
    - Consume principle/method classifications from Phase 2 ADR — only conventions
      (tier 2) appear in config
    - Design: setting categories, schema structure, shell-parseability approach
    - Address tier 3 (escape hatch) design pattern — distinct from standard config?
    - Consider consolidation: merge strategy (requirement 8) as a config setting
    - Draft ADR (configuration system)

- [ ] **4.2 Define extension point conventions**

    **Goal:** Design how extension points work in prose workflows.
    (PRD Requirement 5)

    - Read `notes-philosophy-configurability.md` — extension point starting positions
      ("insert your steps here" markers)
    - Read several existing workflow docs to understand current prose structure
      (process task loop, session init, atomic commit)
    - Design: format, contract, placement conventions
    - Clarify when to use extension points (add behavior) vs. config switches
      (toggle behavior)
    - Consider relationship to tier 3 escape hatches
    - Draft ADR (extension point conventions)
    - Evaluate whether requirements 4 and 5 should consolidate into a single ADR

- [ ] **4.3 Review and finalize Phase 4 ADRs**
    - Iterate based on review feedback
    - Ensure config and extension point designs are consistent and complementary
    - If consolidated: verify both design questions are fully addressed
    - Lint all new ADR files

### **Phase 5:** Adoption & Compatibility

**Purpose:** Apply the configurability architecture to specific adoption scenarios.
(PRD Requirements 6, 7, 8, 9)

- [ ] **5.1 Define progressive adoption tiers**

    **Goal:** Specify what's in basic vs. full ARC and how the distinction is implemented.
    (PRD Requirement 6)

    - Consume all prior ADRs for principle/method boundary and config schema
    - Resolve: structural difference (different files), documentation/framing difference
      (same files, guided onboarding), or config-driven (`adoption_tier` setting)?
    - Define what "basic" includes and what "full" adds
    - Identify downstream impact: WU2 (workflow changes), WU3 (CLI init), WU4 (docs site)
    - Draft ADR (progressive adoption tiers)

- [ ] **5.2 Design external tool and platform compatibility**

    **Goal:** Define how ARC coexists with external trackers and non-GitHub platforms.
    (PRD Requirement 7)

    - Read `notes-philosophy-configurability.md` — team workflow gaps from audit
    - Catalog platform-specific assumptions in current docs (GitHub Actions, `gh` CLI,
      PR-based workflows)
    - Design: workflows reference practices not tools, extension points at tool
      boundaries, config declares tool choices
    - Ensure ARC built-in methods remain first-class
    - Draft ADR (external tool and platform compatibility)

- [ ] **5.3 Resolve merge strategy support**

    **Goal:** Define how ARC's value proposition survives squash merging.
    (PRD Requirement 8)

    - Read current commit docs: `strategy-development-methodology.md` commit standards,
      `atomic-commit.md` workflow
    - Read `notes-philosophy-configurability.md` — squash merge dealbreaker finding
    - Evaluate: standalone ADR or fold into config system ADR (Phase 4) as a
      `merge_strategy` setting?
    - If standalone: draft ADR addressing commit philosophy, archive adaptations,
      documentation guidance
    - If folded: update config system ADR and document decision here

- [ ] **5.4 Design development methodology compatibility**

    **Goal:** Define how ARC coexists with Scrum, Kanban, and other established
    methodologies. High priority. (PRD Requirement 9)

    - Read `research-dev-methodology.md` for methodology landscape and integration patterns
    - Read current ARC work organization docs: `strategy-work-organization.md`,
      `strategy-task-list-formatting.md`, `2_generate-tasks.md`, `3_process-task-loop.md`
    - Map ARC constructs to methodology constructs:
        - PRDs ↔ epics/stories
        - Task lists ↔ sprint backlogs
        - Tasks ↔ sprint items / Kanban cards
        - One-task-at-a-time ↔ WIP limits / sprint velocity
        - Quality gates ↔ definition of done
    - Resolve: complementary layer (alongside Scrum/Kanban) or competing model?
    - Aim for strong explicit support, not edge-case accommodation
    - Draft ADR (development methodology compatibility)

- [ ] **5.5 Review and finalize Phase 5 ADRs**
    - Iterate based on review feedback
    - Ensure all four design questions are resolved (even if consolidated into fewer ADRs)
    - Check consistency with Phase 2-4 ADRs
    - Lint all new ADR files

### **Phase 6:** Synthesis & Documentation

**Purpose:** Synthesize ADRs into strategy documents, validate against adopter scenarios, and
refresh constitutional docs. (PRD Requirements 10, 11, 12)

- [ ] **6.1 Produce core philosophy strategy document**

    **Goal:** Create the authoritative document defining what ARC IS.
    (PRD Requirement 10, part 1)

    - Synthesize across all ADRs: non-negotiable principles, philosophical positioning
      (multi-agent, co-development), identity and purpose
    - Resolve open question: abstract principles only, or principles demonstrated
      through architecture?
    - File: `.arc-internal/reference/strategies/` (exact path TBD)
    - Must be readable standalone — an evaluating team should understand ARC's identity
      from this document alone

- [ ] **6.2 Produce configurability architecture strategy document**

    **Goal:** Create the authoritative reference for ARC's configurability system.
    (PRD Requirement 10, part 2)

    - Synthesize across config, extension point, tier, and compatibility ADRs
    - Cover: three-tier model, config schema, extension point conventions, adoption
      tiers, external tool model, dev methodology mapping
    - Must be actionable for WU2 (implement changes) and WU3 (CLI design)
    - Evaluate whether a standalone config schema spec is warranted

- [ ] **6.3 Light adopter-scenario validation**

    **Goal:** Stress-test decisions against real adoption scenarios before handing off
    to WU2. (PRD Requirement 11)

    - Walk through PRD use cases (or representative subset) against completed ADRs and
      strategy docs
    - For each scenario: do decisions hold? Gaps? Contradictions? Under-specified areas?
    - Focus on high-risk scenarios:
        - Scrum team (use case 4)
        - Factory-style agent (use case 8)
        - Team evaluating ARC (use case 12)
    - Document gaps found; determine if they require ADR amendments or are WU2 concerns

- [ ] **6.4 Update core internal documents**

    **Goal:** Ensure WU2 inherits accurate constitutional context.
    (PRD Requirement 12)

    - [ ] **6.4.a Update META-PRD**
        - Refresh adoption model (stale "copies .arc/" language)
        - Update philosophy framing to reflect principle/method distinction
        - Remove "vibe coding" positioning — let philosophy stand on own terms
        - Align with core philosophy strategy document

    - [ ] **6.4.b Update AGENTS.md**
        - Refresh project overview to reflect 1.0 direction
        - Update collaboration principles based on core identity ADR
        - Ensure AI collaboration section reflects agent-agnosticism findings

    - [ ] **6.4.c Update agent-specific files as needed**
        - Review CLAUDE.md, GEMINI.md, WARP.md, `copilot-instructions.template.md`
        - Update sections that conflict with WU1 decisions
        - Scope: only changes driven by WU1 ADRs, not general cleanup

- [ ] **6.5 Run quality gates on all Phase 6 deliverables**
    - Lint all new and modified files
    - Verify cross-references between strategy docs and ADRs

### **Phase 7:** Verification

- [ ] **7.1 Run Tier 3 quality gates**
- [ ] **7.2 Validate success criteria against PRD**

---

## Success Criteria

- [ ] All 9 design questions resolved with documented decisions (ADRs in
  `.arc-internal/reference/adr/`)
- [ ] Sharp principle/method boundary — every current ARC practice unambiguously classified
  using the three-tier model (non-negotiable / convention / escape hatch)
- [ ] Strategy documents actionable for WU2 (methodology implementation without further design
  decisions needed)
- [ ] Config schema actionable for WU3 (CLI tooling can implement `arc init` and config
  management)
- [ ] Adopter scenarios validated — decisions hold for PRD use cases without obvious gaps
- [ ] ADRs internally consistent — no contradictions across decisions
- [ ] Constitutional docs current — META-PRD, AGENTS.md, and agent files reflect WU1 decisions
- [ ] All quality gates pass (markdown linting — 0 violations)
- [ ] Ready for archival and WU2 activation

---
