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
- `arc/strategy-backlog-organization.md` **(arc-in-git)** - Backlog structure, processing flow, atomic task conventions
    - Consult when: creating or reorganizing backlog structure, processing queued items
- `arc/strategy-configurability-architecture.md` - Customization model, config/extensions/methods, adoption defaults
    - Consult when: working on config, extensions, or methods infrastructure
- `arc/strategy-context-loading.md` - Three-tier loading model, classification criteria, method/extension on-demand patterns
    - Consult when: adding new guidance content, deciding loading tier, working on session-init or method loading
- `arc/strategy-file-classification.md` - File taxonomy, naming conventions, merge strategies, complete inventory
    - Consult when: classifying new files, naming new artifacts, determining merge strategies
- `arc/strategy-work-planning.md` - Planning pipeline, plan-\* conventions, discovery checklist, PRD guidance
    - Consult when: creating PRDs, setting up discovery phases, planning work units
- `arc/strategy-quality-gates.md` - Tiered quality gate system, checkpoint identification, task list integration
    - Consult when: running quality gates beyond Tier 1, identifying integration checkpoints, escalation decisions
- `arc/strategy-session-management.md` - Monitoring responsibility, session state portability, auto-compaction guidance
    - Consult when: configuring session state portability, understanding monitoring roles, working on session workflows
- `arc/strategy-task-list-formatting.md` - Task list formatting specification, header templates, element rules
    - Consult when: creating or restructuring task lists, formatting task entries, checking structural requirements
- `arc/strategy-team-coordination.md` - Task ownership, team branching patterns, merge conflicts, external trackers
    - Consult when: working in team mode, setting up multi-developer coordination
- `arc/strategy-work-organization.md` - Work categories, branching model (protection modes, planning branches), archival
    - Consult when: creating branches, deciding work unit types, archiving completed work

## Project Strategies

Create project-specific strategies in `project/` as your project's patterns emerge.
See `project/README.md` for guidance on when to create one.

**Example strategies adopters might create** (illustrations — these files don't exist until you
create them):

- `project/strategy-authentication.md` - Auth flow, session management
- `project/strategy-testing-methodology.md` - Testing patterns, coverage expectations
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
