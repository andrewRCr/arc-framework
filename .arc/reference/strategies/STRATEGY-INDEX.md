# Strategy Document Index

**Purpose:** Quick reference to codified strategy guidance. Consult relevant strategies before implementing
work in their domains.

**Location:** `.arc/reference/strategies/` — `arc/` for framework methodology (ships with ARC),
`project/` for your project-specific patterns (you create these).

**Naming:** All strategy files use the `strategy-` prefix for fuzzy-find grouping — typing
`@strategy` surfaces all strategies regardless of directory. See
[File Classification][file-classification] § Why Prefixes Matter.

## ARC Framework Strategies

These ship with the framework and cover development methodology applicable to any project.
Strategies marked **(arc-in-git)** are only present when arc-in-git Project Management
mode is active (`pm.mode: arc-in-git` in `arc-config.yml`).

- `arc/strategy-adr-methodology.md` - When/how to write Architecture Decision Records
    - Consult when: writing an ADR, deciding whether a decision warrants one
- `arc/strategy-agent-hooks.md` - Agent lifecycle hooks as optional automation/enforcement alongside ARC
    - Consult when: considering agent hooks for session automation, deterministic enforcement, or platform integration
- `arc/strategy-backlog-organization.md` **(arc-in-git)** - Backlog structure, processing flow, atomic task conventions
    - Consult when: creating or reorganizing backlog structure, processing queued items
- `arc/strategy-configurability-architecture.md` - Customization model, config/extensions/methods, adoption defaults
    - Consult when: working on config, extensions, or methods infrastructure
- `arc/strategy-context-loading.md` - Three-tier loading model, instruction density, method/extension on-demand patterns
    - Consult when: adding new guidance content, deciding loading tier, working on session-init or method loading
- `arc/strategy-core-philosophy.md` - Principles (P1-P11), philosophical foundation, positioning
    - Consult when: resolving principle conflicts, checking P1–P11 definitions or rationale
- `arc/strategy-file-classification.md` - File taxonomy, naming conventions, merge strategies, complete inventory
    - Consult when: classifying new files, naming new artifacts, determining merge strategies
- `arc/strategy-work-planning.md` - Planning pipeline, plan-\* conventions, discovery checklist, PRD guidance
    - Consult when: creating PRDs, setting up discovery phases, planning work units
- `arc/strategy-quality-gates.md` - Tiered quality gate system, integration checkpoints
    - Consult when: running quality gates beyond Tier 1, understanding tier boundaries or escalation
- `arc/strategy-session-management.md` - Focused sessions, context degradation evidence, monitoring responsibility
    - Consult when: configuring session management, deciding session duration thresholds, understanding the evidence base
- `arc/strategy-task-list-formatting.md` - Task list structure, formatting conventions
    - Consult when: creating or restructuring task lists, formatting task entries
- `arc/strategy-team-coordination.md` - Task ownership, team branching patterns, external tracker integration
    - Consult when: working in team mode, setting up multi-agent coordination
- `arc/strategy-work-organization.md` - Work categories, branching model (protection modes, planning branches), archival
    - Consult when: creating branches, deciding work unit types, archiving completed work

## Project Strategies

Create project-specific strategies in `project/` as your project's patterns emerge.
See `project/README.md` for guidance on when to create one.

- `project/strategy-package-project-sync.md` - Two-copy architecture, edit flow rules, dependency map, template handling
    - Consult when: editing methodology content in `.arc/` or `packages/arc-framework/arc/`, syncing between copies
- `project/strategy-testing-methodology.md` - TDD approach, test tiers, mocking rules, design-for-testability
    - Consult when: writing tests, deciding test-first vs test-after, choosing mock boundaries

**Example strategies adopters might create** (illustrations — these files don't exist until you
create them):

- `project/strategy-authentication.md` - Auth flow, session management
- `project/strategy-service-layer.md` - Business logic organization, DI patterns
- `project/strategy-type-safety.md` - Type checking approach, policy decisions
- `project/style/strategy-component-styling.md` - Component patterns, design system
- `project/style/strategy-color-tokens.md` - Color token reference, naming conventions

## Usage Protocol

**Before implementing:**

1. Identify domain (theming, auth, testing, etc.)
2. Check this index for relevant strategy documents
3. Read relevant section(s) of the strategy
4. Implement following guidance

**When uncertain if strategy applies:** Ask. "Does this work touch [domain] where we have strategy guidance?"

**For broad, multi-topic strategies:** Search for the specific topic rather than reading the entire
doc upfront.

---

**Maintenance:** Update this index when adding new strategy documents. Keep descriptions to one line;
add a "Consult when:" sub-item with trigger conditions.

---

[file-classification]: arc/strategy-file-classification.md
