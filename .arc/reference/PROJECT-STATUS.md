# ARC Framework Project Status

Project state and record — what's been accomplished, what's actively in progress, and
what's next. This is the document to share when someone asks "where does the project
stand?" For planning and reasoning (sequencing strategy, dependency analysis, scoping
decisions), see [ROADMAP.md][roadmap].

## Status Snapshot

Current state at a glance. Updated when work is activated, completed, or archived.

**Last Completed:**

- Work-Status Restructure (technical) — Per-WU `active/{category}/status-{name}.md` files
  replacing the singular `active/WORK-STATUS.md`, disentangling the project pointer from the
  session pointer and eliminating the parallel-WU concurrency flaw and base-branch staleness
  dead-ends under full protection
    - Archive: `archive/2026-q2/technical/03_work-status-restructure/`

**Currently Active:**

- Session-Init Optimization (technical) — Reduce session-init token cost from ~75–80k
  toward a ≤60k observation target (≥25% reduction). Per-file methods/extensions with YAML
  frontmatter index replace full-file reads; operational-context audit trims always-loaded
  docs; session-type conditional loading formalizes the `Working On:` prefix
    - Task list: `.arc/active/technical/tasks-session-init-optimization.md`
    - Branch: `technical/session-init-optimization`

**Next Priority:**

- ARCd Rebrand — Public product brand split (ARCd for product surface, ARC for methodology),
  with absorbed config-key renames and CLI command cleanup
- Then: Expanded Planning Path — Optional pre-PRD planning path for high-novelty, high-coupling work
- Then: ARC Operating Modes — Lightweight mode (ARC Lite) + local/untracked mode + shift lifecycle

## Completed Major Work

### Work-Status Restructure (April 2026)

Replaced singular `active/WORK-STATUS.md` with per-WU `active/{category}/status-{name}.md` files,
disentangling the project pointer from the session pointer.

- ADR-007 Tier 2 Amendment: per-WU project pointer distinct from per-developer session state
- New `template-status.md` with `**State:**` as the load-bearing lifecycle marker
- New `deactivate-work-unit.md` workflow (Case A primary; B/C/D via routing pointers)
- Nine workflow files updated for per-WU status discovery, travel across rotating branches, archive deletion
- SESSION-NOTES `**Working On:**` field with four-marker vocabulary
- Meta-circular dogfood: Phase 3 live migration of this WU's own state onto the new model
- Six atomic tasks alongside planned work (husky pre-commit fix, CI framework-sync drift check, etc.)

### Methodology Maturation (April 2026)

Settled methodology/implementation boundary, content architecture, and update behavior.

- Standalone methodology summary with 10 grey area resolutions (methodology vs convention)
- CLI update fix: Framework files wholesale-replaced, eliminating merge conflicts
- Strategy docs split: ~5,350 → ~2,970 local / ~2,380 docs site. 13 strategies consolidated to 9
- Two new skills: arc-task-review (post-task structured review), arc-plan (collaborative exploration)
- Package-project sync safeguard: dependency map, pre-commit hook, DEV-RULES.PROJECT guard
- Docs site restructured: Methodology/Framework/Customization nav split

### Beta Readiness (April 2026)

Prepared the framework for multi-week beta testing on an external project.

- Migrated dev repo from ad-hoc `.arc/` to a real `arc init` installation
- Contributor role support: ADR-014, AGENT-BRIEF.CONTRIBUTOR, role-aware hooks and session-init
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
- Constitutional doc refresh: META-PRD rewrite, AGENT-BRIEF.PROJECT.md update

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

[roadmap]: ../backlog/ROADMAP.md
