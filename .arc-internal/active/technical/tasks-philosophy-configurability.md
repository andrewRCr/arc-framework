# Task List: Core Philosophy & Configurability Architecture

**PRD:** `.arc-internal/active/technical/prd-philosophy-configurability.md`
**Notes:** `.arc-internal/active/technical/notes-philosophy-configurability.md`
**Created:** 2026-02-23
**Branch:** `technical/philosophy-configurability`
**Base Branch:** `main`
**Status:** In Progress

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

- [x] **1.1 Research agent landscape**

    **Goal:** Understand how IDE, cloud/remote, and factory-style agents work to inform session
    model and agent-agnosticism decisions (PRD requirements 1, 3).

    - [x] **1.1.a Gather agent landscape research**
        - Two research passes: (1) training-knowledge baseline, (2) web-verified supplemental
          covering gaps identified in evaluation
        - 17 tools across 4 categories: IDE-integrated (Cursor, Windsurf, Copilot,
          Antigravity, Claude Code, Cline/Roo, Amazon Q, Augment Code), CLI (Aider),
          cloud/remote (Codex, Jules, Warp Oz, Claude headless), factory-style (Devin,
          SWE-Agent, OpenHands, Bolt.new/Lovable/v0)
        - Merged into single `research-agent-landscape.md` in `active/technical/`

    - [x] **1.1.b Evaluate and supplement**
        - Initial pass was training-knowledge only (web unavailable); identified gaps in
          Codex, Copilot, Cursor, Jules coverage + missing tools (Antigravity, Warp Oz,
          Aider, Amazon Q, Augment Code)
        - Supplemental pass filled all gaps with web-verified sources
        - Merged two docs into single authoritative file; trimmed to focus on ARC-relevant
          operational details
        - Mapped research against all downstream consumers (Phase 2 tasks 2.1/2.2.b/2.2.c,
          Phase 3 tasks 3.1/3.2); coverage strong across all needs
        - Two minor gaps (slash commands, deferred review patterns) assessed as better
          addressed during ADR discussions than via additional research

- [x] **1.2 Research context degradation in large windows**

    **Goal:** Verify claims about context quality degradation before codifying session length
    guidance (PRD requirements 2, 3).

    - [x] **1.2.a Gather context degradation research**
        - External research agent gathered 28 sources: 12 peer-reviewed papers (TACL, EMNLP,
          COLM venues), 6 vendor sources (Anthropic, OpenAI, Google), 8 practitioner reports
        - Key landmark papers: Lost in the Middle (Liu et al.), RULER (NVIDIA), Context Rot
          (Chroma), Context Length Alone Hurts (Amazon/EMNLP 2025)
        - Saved to `research-context-degradation.md` in `active/technical/`

    - [x] **1.2.b Evaluate and supplement**
        - Evidence strongly supports threshold-based session management: 75-80% utilization
          sweet spot for general agentic work, 60-70% for complex reasoning
        - No vendor provides explicit "stop at X%" — threshold derives from academic synthesis
          and practitioner guidance (important nuance for ADR discussions)
        - Counterintuitive finding: shorter windows with good compression outperform massive
          windows with naive accumulation — directly supports ARC's session-bounded model
        - Coverage sufficient for requirements 2 and 3; no follow-up needed

- [x] **1.3 Research development methodology landscape**

    **Goal:** Understand Scrum/Kanban/hybrid prevalence and how structured documentation
    frameworks integrate with established methodologies (PRD requirement 9).

    - [x] **1.3.a Gather methodology landscape research**
        - External research agent produced two documents: comprehensive methodology
          inventory (`research-dev-methodology.md`) and supplemental integration mapping
          (`research-dev-methodology-integration-mapping.md`), both in `active/technical/`
        - 25+ methodologies across agile, plan-driven, lean, and modern/emerging categories
        - Tiered prevalence data from State of Agile (3k+), Stack Overflow (49k),
          VersionOne, and other credible surveys
        - Key constructs mapped per methodology family (planning artifacts, estimation,
          ceremonies, tracking, roles, Definition of Done)
        - Integration patterns analysis: what works (lightweight overlays, ceremony-neutral)
          vs. what fails (heavyweight, prescriptive, ceremony-adding)
        - AI-assisted development impact on methodology (velocity metrics, estimation,
          code review bottlenecks)

    - [x] **1.3.b Evaluate and supplement**
        - Comprehensive coverage confirmed across all tiers: Scrum (87%), Kanban (56%),
          Scrumban (27%), SAFe (44% enterprise), Shape Up, Dual-Track, DevOps/SRE, XP,
          Lean, plus niche frameworks (FDD, DSDM, Crystal, RUP, V-Model, Spiral)
        - Supplemented with notable names initially absent: Spotify Model, Lean Startup,
          Disciplined Agile (DA/DAD), Prince2 Agile
        - Key finding for requirement 9: hybrid approaches winning (31.5% and growing),
          ceremony fatigue is real, lightweight composable overlays succeed
        - Integration mapping flagged as research input (not validated decisions) with
          disclaimers added to prevent misinterpretation during ADR process
        - Coverage sufficient for requirement 9

- [x] **1.4 Research human attention and single-tasking**

    **Goal:** Gather empirical evidence that human attention is single-threaded — the cognitive
    science foundation for ARC's minimal parallelism and one-task-at-a-time principles
    (PRD requirement 1, core philosophy strategy document).

    - [x] **1.4.a Gather attention/single-tasking research**
        - External research agent produced comprehensive report covering all 4 areas:
          task-switching costs (Rogers & Monsell, Rubinstein/Meyer/Evans), attention
          bottleneck theories (Broadbent, Welford, Pashler, Kahneman), multitasking
          myth (Ophir/Nass/Wagner, Leroy attention residue, Gloria Mark interruptions),
          and automation monitoring (vigilance decrement, ATC, supervisory control)
        - ~20 peer-reviewed sources, multiple landmark studies and meta-analyses
        - Saved to `research-attention-single-tasking.md` in `active/technical/`

    - [x] **1.4.b Evaluate and supplement**
        - Initial pass had confirmation bias risk (asked for supporting evidence only);
          ran targeted follow-up for counterevidence: supertaskers (Watson & Strayer),
          EPIC model (Schumacher et al.), threaded cognition (Salvucci & Taatgen),
          real-world domains (ATC, surgery), Ophir replication failures (Wiradhany &
          Nieuwenstein)
        - Integrated counterevidence as section 7 in research file; updated synthesis
          (section 8) and references to reflect both passes
        - Key refinement: strongest framing is "multitasking in novel knowledge work has
          well-documented costs" rather than "humans can't multitask" — exceptions exist
          but don't generalize to AI-assisted development
        - Ophir et al. noted as weak pillar (replication issues); bottleneck, recovery
          time, vigilance decrement, and ATC evidence are the strongest pillars
        - Evidence base is citable for philosophy document and ADRs

- [x] **1.5 Run quality gates on research files**
    - All 5 research files pass markdownlint with zero violations

### **Phase 2:** Core Identity

**Purpose:** Define ARC's non-negotiable principles vs. configurable methods — the keystone
decision that everything else depends on. (PRD Requirement 1)

- [x] **2.1 Prepare core identity discussion**

    **Goal:** Ground the discussion in what ARC actually is today, not what we assume it is.

    - Read all identity-defining sources: META-PRD philosophy, AGENTS.md principles,
      development methodology strategy, process task loop, aspirational README, PRD use
      cases. Cross-referenced with audit findings and Phase 1 research.
    - Produced working catalog in `notes-philosophy-configurability.md` § "Working
      Catalog: ARC Practice Classifications" — 30 practices across 5 groups (core
      philosophy, task execution, commit/VCS, documentation, agent interaction) with
      initial P/C/D classifications: 12 proposed principles, 14 proposed conventions,
      4 needing discussion (focused execution scope, mandatory review stop granularity,
      atomic commits vs. merge strategy, co-development model). Identified 4 key
      discussion threads for Task 2.2.

- [x] **2.2 Discuss and draft core identity ADR**

    - [x] **2.2.a Classify each candidate principle**
        - All 7 candidates classified through interactive discussion. Decisions recorded in
          `notes-philosophy-configurability.md` § "Task 2.2 Classification Decisions":
        - **Spec-driven development:** P — foundational (not most distinctive). Planning
          leads execution. Threshold left to team discretion; quick fixes can rely on
          well-crafted git commits. Doc hierarchy is convention.
        - **Human-agent pairing:** P — ARC's most distinctive characteristic. Tight
          iterative feedback loops, micro-level review, co-development not delegation.
          Review increment granularity is convention (per-task default, per-parent-task
          acceptable; per-phase too loose). Terminology gap identified: "review increment"
          proposed for the bounded autonomous chunk between reviews (distinct from "work
          unit").
        - **Focused execution:** P — separate from pairing but deeply linked. Three
          pillars: cognitive science, human-for-humans, complementary strengths amplified
          by frequency. "Feature, not a bug" reframe. Between strong and moderate framing.
        - **Quality gates:** P (narrowly: verification required). Zero-tolerance, tiers,
          tools all convention. "Leave it cleaner" is convention with a capture floor.
        - **Context preservation:** P — recoverability through structured, human-controlled,
          transparent mechanisms. Two types acknowledged (session-level, project-level).
          Criteria on the mechanism's qualities, not the mechanism itself.
        - **Git-native / traceability:** P (traceability principle); nearly all methods
          are convention. Git assumed; non-git is escape hatch. All 3 audit dealbreakers
          (commit format, footer, atomic/squash) resolved as convention. C6 (branch/task
          coupling) demoted from default — artifact of solo workflow.
        - **Granular task tracking:** P — planning leads execution at every level, never
          the reverse. Markdown checkboxes are convention; external trackers acceptable.

    - [x] **2.2.b Position on multi-agent and autonomy spectrum**
        - Position recorded in notes § "2.2.b." Core reframe: human single-threaded
          attention is a feature, not a bug. Throughput is not the gold standard.
        - Three-pillar evidence basis established. Orchestration value acknowledged for
          bounded/deterministic domains. Sequential agent handoffs confirmed compatible.
        - Tone: positive value claim ("if this is what you care about, ARC delivers"),
          not comparative ("our approach is better"). No future predictions. Evidence-cited,
          not dogmatic.
        - Portfolio description captured as reference language for ADR drafting.

    - [x] **2.2.c Resolve co-development model question**
        - **Decision:** Shared context with mutual visibility is principle; local CLI
          mechanism is convention. CLI and IDE agents are within principle; async delegation
          agents are outside ARC's design envelope.
        - "Bookend pattern" acknowledged but not promoted: ARC planning + ARC integration
          with delegation execution in between. Valid for bounded work, not the default
          path. If delegation becomes the norm, ARC's distinctive value is lost.
        - Key reframe: "co-developing rather than simply reviewing."

    - [x] **2.2.d Draft ADR**
        - Drafted `adr-001-define-core-identity-and-principle-method-boundary.md` in
          `.arc-internal/reference/adr/` following Nygard five-section format
        - Single ADR covering all classifications (11 principles, 19 conventions),
          multi-agent/autonomy positioning, and co-development model resolution
        - Status: Proposed (pending review in Task 2.3)
        - Passes markdownlint with zero violations

- [x] **2.3 Review and finalize core identity ADR**
    - One revision: reframed "countercultural/will face resistance" negative consequence
      to "value proposition self-selects audience" — meaningful distinction between
      resistance to ARC's philosophy (unlikely) vs. choosing different tradeoffs (natural)
    - ADR status updated from Proposed to Accepted
    - Consequences section covers WU2-WU4 implications (all dealbreakers resolved,
      friction points addressed, clear agent compatibility envelope, convention count
      flagged for WU2 design work)
    - Zero lint violations

### **Phase 3:** Session & Agent Model

**Purpose:** Resolve whether ARC's session model is a principle or method, and map workflow
assumptions against the full agent spectrum. (PRD Requirements 2, 3)

- [x] **3.1 Evaluate session model**

    **Goal:** Determine if the principle is "sessions with explicit boundaries" or "context must
    be recoverable." (PRD Requirement 2)

    **Outcome:** Both — at different levels. The session *concept* (bounded, intentional work
    periods) is principle-level, reinforcing focused execution (P3), context preservation (P5),
    and the tight feedback loop (P2). Session *ceremonies* (init/handoff, specific docs, length
    thresholds) are convention. Context quality management during sessions identified as a P5
    expansion — preservation includes proactive quality management, not just recovery at
    boundaries. Decided to consolidate Tasks 3.1 + 3.2 into a single ADR-002 (session model +
    agent compatibility) since the session model IS the deepest agent-agnosticism question and
    both share the same evidence base. Full analysis in `notes-philosophy-configurability.md`
    (section "Task 3.1").

- [x] **3.2 Assess agent-agnosticism + draft combined ADR-002**

    **Goal:** Map ARC's workflow assumptions against the full agent spectrum, classify each as
    load-bearing vs. incidental, and draft the combined ADR covering both session model (3.1
    findings) and agent compatibility. (PRD Requirements 2, 3)

    **Outcome:** All seven workflow assumptions classified as incidental — each traces to a
    load-bearing principle already in ADR-001, but the specific mechanism is shaped by Claude
    Code. Combined ADR-002 drafted with five parts: (1) session as first-class concept, (2) P5
    expansion for context quality management, (3) workflow assumption classification table,
    (4) three-tier agent compatibility spectrum (CLI primary, IDE compatible, cloud/async
    off-label), (5) agent file architecture confirmation. Key positioning: CLI conversational
    agents are the natural fit and primary design target; cloud/async is explicitly "off-label"
    for bounded work, not forbidden but not the expected norm. WARP.md staleness flagged for
    WU2. Analysis captured in `notes-philosophy-configurability.md` (section "Task 3.2").
    ADR-002 at `adr-002-session-model-and-agent-compatibility.md`, zero lint violations.

- [x] **3.3 Review and finalize ADR-002**
    Reviewed, one revision (session justification reframed: agent performance degradation as
    primary evidence-based driver, removed false "infinite context" premise, corrected
    misapplied cognitive science). Tier 2 risk updated to note planned pre-release IDE
    validation. Terminology/branding opportunity captured in notes for strategy/WU4 phase.
    Status set to Accepted.

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
