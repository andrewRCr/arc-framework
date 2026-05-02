# ARC Framework Project Status

Project state and record — what's been accomplished, what's actively in progress, and
what's next. This is the document to share when someone asks "where does the project
stand?" For planning and reasoning (sequencing strategy, dependency analysis, scoping
decisions), see [ROADMAP.md][roadmap].

## Status Snapshot

Current state at a glance. Updated when work is activated, completed, or archived.

**Last Completed:**

- Session-Operational Flow (technical) — Operationalizes the Interlock Foundation frame with
  independent commit/push interlock settings, handoff-interior toggle consumers, deferred-review
  safe-accumulation, status Integration metadata, and recovery guidance for configured release
  cascades.
    - Archive: `archive/2026-q2/technical/06_session-operational-flow/`

**Currently Active:**

- User Sync UX Polish (technical) — Planning. State-machine unification, directional copy audit,
  HEAD-independent notes discovery, and scoped auto-push design against the handoff-interior toggle
  framework.
    - Plan: `.arc/active/technical/plan-user-sync-ux.md`
    - Branch: `technical/plan-user-sync-ux`

**Next Priority:**

- Continue User Sync UX Polish planning; Coord Probe and Worktree Foundation remain parallelizable
  siblings on the new session-operational frame
- Then: Agile WU Lifecycle (after Worktree Foundation), Concurrent Work Conventions
  (after Agile WU Lifecycle), Quality Gate Tiers + Hook Integration (after Concurrent
  Work Conventions)
- Then: ARCd Rebrand — Public product brand split (ARCd for product, ARC for
  methodology) with absorbed config-key renames and CLI command cleanup
- Then: arc-plan Conductor (parallelizable with Worktree Foundation and Agile WU
  Lifecycle), ARC Operating Modes (ARC Lite + local/untracked)

## Completed Major Work

### Interlock Foundation (April 2026)

Constitutional frame for ARC's interlock model — vocabulary, configuration axis, probe
surface, structured prompts, and timing rules — that downstream session-operational
plans build on.

- DEV-RULES.ARC redrafted under at-session-relevance filter; interlock vocabulary woven
  into existing rule sections; new invariants (integration-interlock, cascade-undo);
  commit/push triggering reframed around configurable autonomy
- `session.autonomy: manual-commit | auto-commit | auto-push` configuration axis
  (`arc-config.yml` + per-developer `git config arc.autonomy` override); resolver
  surfaces on session-init probe with provenance
- Composite handoff probe (`arc status --session-handoff --json`) — self-contained
  envelope (8 slots) so `arc-handoff` is fresh-load safe; new `lib/git/dirty-state.ts`
  and `lib/git/head-hash.ts` resolvers
- Planning-session active surface — `template-status.md` adds Spec, Sibling Work
  Unit(s), and `State: Planning`; `activate-planning-branch.md` creates status file at
  planning activation; probe `sessionType` inference reads `Planning` as primary signal
- Status-file timing rule — task completion no longer touches the status file; lifecycle
  workflows stage status updates with their ceremony commits per the staging-as-test rule
- Structured task-completion prompts as base behavior across all autonomy modes; prefix
  reads `session.autonomy` for forward-compat with auto-commit modes
- Pre-commit CHECK 16 (`validate-status-spec.ts`) enforces pinned Spec shapes on staged
  active status files

### Session-Init Optimization (April 2026)

Reduced session-init token cost from ~75–80k baseline toward a ≤60k orientation target,
with constitutional and CI machinery in place to prevent drift recurrence.

- Per-file methods/extensions architecture (`system/methods/*.md`, `system/extensions/*.md`)
  replacing the legacy aggregate files; method bodies load on workflow trigger, extensions
  enumerated once at session-init
- Workflow YAML frontmatter trigger contract (`arc.methods`, `arc.extensions`); constitutional
  rule pair anchors compliance (DEV-RULES.ARC § Verification + strategy-workflow-authoring
  § Author-side Declaration Rule); pre-commit + CI enforcement (CHECK 11/13/15, lint:arc:*)
- Probe-side `sessionType` inference computed from tracked status fields (`planning |
  execution | integration | null`) drives conditional item-9 / item-10 loadsets in
  session-init.md; SESSION-NOTES `**Session Type:**` is opt-in personal-layer override
- Partial-read narrowing: QUICK-REFERENCE scoped to Environment & Path Context; status file
  to `## Work Unit Metadata`; task list strategic partial read with triple-anchor task references
- Worktree-sync completion in composite probe; research-validated rejection of an `always`
  worktree-pull mode
- Operational-context audit (Tier 1–3) across constitution, briefs, strategies, workflows;
  template extractions (template-tasks.md); ADR-013 Tier 2 amendment

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
