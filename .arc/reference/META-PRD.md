# ARC Framework Meta Product Requirements Document (META-PRD)

The META-PRD is the product vision document — the single source of truth for what your project
is, what it does, and what success looks like. Work-level PRDs (created via the PRD workflow)
reference this for context.

## 1. Purpose

The ARC Framework is a development methodology for human-AI collaboration. It structures how a
developer and an AI agent work together through implementation — planning, executing, verifying,
and preserving context across work sessions.

ARC is built on a specific premise: that focused, iterative collaboration between a human and an
agent produces better work than either delegation or ad-hoc prompting, for the kinds of work where
quality, judgment, and maintainability matter. This premise has real costs — ARC optimizes for the
quality of the collaboration, not for raw throughput. The framework is honest about that tradeoff.

The methodology is expressed as 11 non-negotiable principles that define its identity, and a set
of configurable conventions that implement those principles. Principles are what make ARC *ARC* —
conventions are strong defaults that teams adapt to their context without leaving the framework.

### Philosophical basis

Three observations inform ARC's design:

- **Cognitive reality** — Human attention is single-threaded for novel knowledge work. ARC's
  sequential execution model works with this constraint rather than treating it as a bottleneck
  to optimize around.
- **Human-for-humans** — Software is overwhelmingly produced for human consumption. Deep human
  involvement during development is quality input, not just quality control. Developers who
  participate in building maintain familiarity that delegation-based approaches risk losing.
- **Complementary strengths** — Human and agent bring fundamentally different capabilities.
  The robustness of their combined output scales with interaction frequency — each exchange is
  an opportunity for both to contribute what they're good at.

The full philosophical argument, with research grounding, is in the
[core philosophy strategy][core-philosophy].

## 2. Core Features

### Methodology

- 11 principles (P1-P11) defining ARC's identity — spec-driven development, human-agent
  co-development, focused sequential execution, quality gate enforcement, context preservation,
  traceability, granular task tracking, agent-agnostic design, dual-audience documentation,
  recursive improvement, shared-context co-development
- Three-tier flexibility model: principles (non-negotiable), conventions (configurable with
  defaults), escape hatches (acknowledged without active design investment)
- Sharp principle/convention boundary — the test: "if an adopter changed this, would they still
  be meaningfully using ARC?"

### Configurability

- Three customization mechanisms: config settings (toggle enforcement), extension points (add
  workflow steps), method overrides (substitute convention implementations)
- Adoption profiles (essentials / recommended / custom) as CLI init convenience — same files,
  different enforcement calibration
- Platform command variation absorbed by existing QUICK-REFERENCE documentation
- Full convention inventory: 19 conventions across 11 principles, each with a defined
  configurability path

### Workflows

- Spec-driven planning pipeline: META-PRD → PRD → task list → execution
- Task processing loop with iterative review increments (co-development, not review-at-merge)
- Supplemental workflows: atomic commits, session handoff, incidental work management
- Extension points at workflow boundaries for project-specific steps

### Agent architecture

- Agent-agnostic core: methodology defined independently of any specific AI tool
- Hub-spoke file model: AGENT-BRIEFING.ARC.md (framework orientation) and
  AGENT-BRIEFING.PROJECT.md (project context) as shared entry points, agent-specific files
  (CLAUDE.ARC.md, etc.) for tool-specific guidance
- Multi-agent support: different agents can work within the same project, each loading shared
  methodology plus their own guidance

### Context preservation

- Session model: bounded, intentional periods of agent-assisted work with explicit start and
  end states
- Structured handoff documents (WORK-STATUS.md + SESSION-NOTES.md) — human-controlled,
  transparent, and predictable recovery across session boundaries
- Active context quality management: monitoring utilization and recognizing degradation during
  work, not just recovering at boundaries

### Quality system

- Tiered quality gates: per-task (Tier 1), per-coherent-unit (Tier 2), per-phase/pre-PR
  (Tier 3)
- Automated verification as a required step before work is considered complete
- "Leave it cleaner" protocol: discovered issues are at minimum documented, never silently
  ignored

## 3. Out-of-Scope Features

- **Runtime tooling or code generation** — ARC is a methodology expressed as documentation.
  CLI tooling (`arc init`, config management) supports adoption but does not produce application
  code.
- **Team coordination methodology** — ARC does not prescribe sprint length, story format,
  estimation approach, or backlog prioritization. It governs the execution pair (developer +
  agent), not the team.
- **Throughput optimization** — ARC optimizes for collaboration quality. Teams that primarily
  need to maximize code output velocity on deterministic, bounded work may find delegation-based
  approaches more appropriate.

## 4. User Flow (Target)

### Adopter journey

1. Initialize ARC in project (`arc init`) — select adoption profile, configure conventions
2. Define project: constitutional documents (META-PRD, TECHNICAL-OVERVIEW, DEV-RULES.PROJECT),
   roadmap, project status
3. First feature cycle: create PRD → generate task list → process tasks through the
   co-development loop with iterative review
4. Progressive adoption: essentials profile demonstrates conventions through agent behavior;
   adopter tightens enforcement as comfort grows

### Framework development (self-hosting)

1. ARC develops itself using its own methodology
2. Design decisions captured as ADRs, synthesized into strategy documents
3. Strategy documents inform workflow and template updates
4. Framework changes validated against adopter scenarios before release

## 5. Success Metrics

### Methodology coherence

- All principles internally consistent — no contradictions across decisions
- Sharp principle/convention boundary — every practice unambiguously classified
- Strategy documents actionable for implementation without further design decisions

### Adopter self-sufficiency

- Adopters can configure the framework to their context through documented mechanisms
- Scaling between profiles (essentials → recommended) requires config changes only, not
  reinstallation or file additions
- External methodology integration (Scrum, Kanban) works through documented patterns

### Framework quality

- All documentation passes quality gates (markdown linting, zero violations)
- Cross-references between documents are accurate and navigable
- Templates are copy-ready with comprehensive inline guidance

## 6. Technical Requirements

- **Format**: Markdown for all documents, zero-tolerance linting policy
- **Version control**: Git-based, atomic commits with traceability to intent
- **Agent compatibility**: Agent-agnostic design; methodology works with any conversational
  agent that supports shared filesystem context
- **Platform compatibility**: Git hosting agnostic (GitHub default, GitLab/Bitbucket through
  QUICK-REFERENCE customization), cross-OS (Windows/WSL/Linux/Mac)
- **Dependencies**: Minimal — Git, Node.js (for markdown linting via npx). No runtime
  containers, no services.
- **Distribution**: `.arc/` directory is the deployable unit. CLI tooling (`arc init`)
  provides guided setup but is not required.

---

[core-philosophy]: strategies/arc/strategy-core-philosophy.md
