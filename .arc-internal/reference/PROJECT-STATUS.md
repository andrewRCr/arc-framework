# ARC Framework Project Status

Project state and record — what's been accomplished, what's actively in progress, and
what's next. This is the document to share when someone asks "where does the project
stand?" For planning and reasoning (sequencing strategy, dependency analysis, scoping
decisions), see [ROADMAP.md][roadmap].

## Status Snapshot

**Last Completed:**

- Foundational Gap Closure (technical) — Resolved 11 foundational design gaps, ADR-007,
  context loading architecture, planning lifecycle strategy
    - [Archive](archive/2026-q1/technical/04_foundational-gap-closure/)

**Currently Active:**

- Methodology Completion (technical) — Apply WU1/WU1.5 design decisions across ARC
  methodology documentation: infrastructure files, core document restructuring, convention
  and workflow gap closure
    - Task list: `.arc-internal/active/technical/tasks-methodology-completion.md`
    - Branch: `technical/methodology-completion`

**Next Priority:**

- Structural Validation (technical) — File classification, mixed-concern audit,
  cross-cutting dependency mapping
    - [PRD](../active/technical/prd-structural-validation.md)

## Completed Major Work

### Core Philosophy & Configurability Architecture (February 2026)

[Archive](archive/2026-q1/technical/03_philosophy-configurability/)

Resolved all foundational 1.0 design decisions.

- 6 ADRs (ADR-001 through ADR-006) covering principles, configurability, file taxonomy
- Core philosophy strategy: 11 principles (P1-P11), philosophical foundation, positioning
- Configurability architecture strategy: 19 conventions, 3 customization mechanisms
- 5 research files (agent landscape, context degradation, methodology)
- Constitutional doc refresh: META-PRD rewrite, AGENT-BRIEFING.PROJECT.md update

### Structural Readiness Pass (February 2026)

[Archive](archive/2026-q1/technical/02_structural-readiness-pass/)

Restructured the framework for distribution readiness.

- Directory restructuring: `reference/` split into `reference/` + `system/`
- File naming: 16 `.example.md` → `.template.md`
- DEVELOPMENT-RULES separation: methodology extracted to strategy doc (template -68%)
- New strategies: file-classification, backlog-organization, team-coordination
- Configurable branching model: `arc-config.yml`, planning branches, three protection modes
- Team mode structure: `team/` directory, `(@name)` ownership, external tracker integration

### Content Refinement Pass (February 2026)

[Archive](archive/2026-q1/technical/01_content-refinement-pass/)

Systematic content quality improvement across all `.arc/` template files.

- 37 files reviewed and improved for agnosticism and template quality
- Streamlined heavyweight docs: atomic-commit (-70%), maintain-task-notes (-58%)
- Co-development guidance, deferred review protocol, layered commit architecture

### Dual-Maintenance Sync (February 2026)

Accumulated improvements from arc-portfolio project development.

- Tiered quality gates strategy (Tier 1/2/3 system)
- Letter numbering standardization at third level (X.Y.a)
- Expanded commit format skill and githook validation
- New workflows: activate-work-unit, PRD header metadata

### CineXplorer Sync (December 2025)

Synced 2+ months of refinements from CineXplorer project usage.

- Infrastructure, workflows, agent files, constitution, and strategies aligned
- Multi-agent support added (.claude, .codex, .gemini directories)

### Foundation (October 2024)

Initial framework structure and infrastructure.

- Repository migration from Windows to WSL, `.arc/` + `.arc-internal/` split
- Template-first constitutional documents (META-PRD, AGENTS, DEV-RULES, etc.)
- Terminology refactoring (Sub-PRD → PRD)
- Framework development infrastructure: markdown linting, CI, atomic commits, session management

## Project Health Indicators

- **Quality**: 100% markdown linting compliance, clean git history
- **Maturity**: Battle-tested through multi-project usage (CineXplorer, arc-portfolio)
- **Documentation**: Comprehensive templates with inline guidance
- **Self-Hosting**: Framework successfully develops itself using ARC methodology

---

[roadmap]: ../../backlog/ROADMAP.md
