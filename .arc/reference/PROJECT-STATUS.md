# ARC Framework Project Status

Project state and record — what's been accomplished, what's actively in progress, and
what's next. This is the document to share when someone asks "where does the project
stand?" For planning and reasoning (sequencing strategy, dependency analysis, scoping
decisions), see [ROADMAP.md][roadmap].

## Status Snapshot

Current state at a glance. Updated when work is activated, completed, or archived.

**Last Completed:**

- Beta Readiness (feature) — Migrated dev repo to real ARC installation, contributor role
  support (ADR-014), docs site skeleton, npm beta publish, public-facing scaffolding
    - Archive: `archive/2026-q2/feature/01_beta-readiness/`

**Currently Active:**

- None — between work units (ARC Lite planning in progress)

**Next Priority:**

- ARC Lite — Lightweight project mode preserving execution discipline without lifecycle ceremony
- Dogfooding — Install beta CLI in a real project, battle-test full workflow

## Completed Major Work

### Beta Readiness (April 2026)

Prepared the framework for multi-week beta testing on an external project.

- Migrated dev repo from ad-hoc `.arc/` to a real `arc init` installation
- Contributor role support: ADR-014, AGENT-BRIEFING.CONTRIBUTOR, role-aware hooks and session-init
- Docs site skeleton: MkDocs Material + GitHub Pages, navigation structure, CI deployment
- npm beta publish: `@arc-framework/cli@0.1.0-beta`, granular token auth
- Public-facing scaffolding: repo rename, README rewrite, license, branding (ARC tagline)

### CLI Implementation Beta (March 2026)

Built the `@arc-framework/cli` npm package (`0.x` beta).

- TypeScript CLI with Commander: `init`, `update`, `status`, `diff`, `user`, `log` commands
- Interactive init via @clack/prompts: project config, tool selection, PM mode, team mode
- Three-way merge update system with pristine store and manifest tracking
- Agent tooling generation: skills and config files for Claude, Codex, Gemini, Copilot, etc.
- 358+ tests across unit, integration, and E2E tiers

### Core Philosophy & Configurability Architecture (February 2026)

Resolved all foundational 1.0 design decisions.

- 6 ADRs (ADR-001 through ADR-006) covering principles, configurability, file taxonomy
- Core philosophy strategy: 11 principles (P1-P11), philosophical foundation, positioning
- Configurability architecture strategy: 19 conventions, 3 customization mechanisms
- 5 research files (agent landscape, context degradation, methodology)
- Constitutional doc refresh: META-PRD rewrite, AGENT-BRIEFING.PROJECT.md update

### Structural Readiness Pass (February 2026)

Restructured the framework for distribution readiness.

- Directory restructuring: `reference/` split into `reference/` + `system/`
- File naming: 16 `.example.md` → `.template.md`
- DEVELOPMENT-RULES separation: methodology extracted to strategy doc (template -68%)
- New strategies: file-classification, backlog-organization, team-coordination
- Configurable branching model: `arc-config.yml`, planning branches, three protection modes
- Team mode structure: `team/` directory, `(@name)` ownership, external tracker integration

### Content Refinement Pass (February 2026)

Systematic content quality improvement across all template files.

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

- Repository migration from Windows to WSL
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
