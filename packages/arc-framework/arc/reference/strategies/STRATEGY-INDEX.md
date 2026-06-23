# Strategy Document Index

**Purpose:** Quick reference to codified strategy guidance. Consult relevant strategies before implementing
work in their domains.

## ARC Framework Strategies

These ship with the framework and cover development methodology applicable to any project.
Strategies marked **(arc-in-git)** are only present when arc-in-git Project Management
mode is active (`pm.mode: arc-in-git` in `arc-config.yml`).

- `arc/strategy-adr-methodology.md` - When/how to write Architecture Decision Records
    - Consult when: writing an ADR, deciding whether a decision warrants one
- `arc/strategy-configurability-architecture.md` - Customization model, config/extensions/methods, adoption defaults
    - Consult when: working on config, extensions, or methods infrastructure
- `arc/strategy-planning-module.md` **(arc-in-git)** - What arc-in-git installs, routing/promotion, scaling boundaries
    - Consult when: working with backlog structure, routing deferred work, evaluating PM mode fit
- `arc/strategy-file-classification.md` - File taxonomy and naming conventions
    - Consult when: classifying new files, naming new artifacts, determining merge strategies
- `arc/strategy-work-planning.md` - Planning pipeline, depth model, spec forms (brief/outline/detailed), layered specs
    - Consult when: authoring specs, resolving planning depth, planning work units
- `arc/strategy-quality-gates.md` - Tiered quality gate system, checkpoint identification, task list integration
    - Consult when: running quality gates beyond Tier 1, identifying integration checkpoints, escalation decisions
- `arc/strategy-session-operations.md` - Context loading model, monitoring, auto-compaction, session state portability
    - Consult when: adding new guidance content, deciding loading tier, configuring session state, working on session workflows
- `arc/strategy-task-list-formatting.md` - Task list formatting rules — structure, ownership, verification, success criteria
    - Consult when: creating or restructuring task lists, formatting task entries, checking structural requirements
    - Companion: `template-tasks.md` for skeletons; `generate-tasks.md` § Finalize the task list for the pre-save checklist
- `arc/strategy-workflow-authoring.md` - Workflow frontmatter schema, author-side declaration rule, body conventions
    - Consult when: authoring a framework or project workflow file
- `arc/strategy-team-coordination.md` - Task ownership, team branching patterns, merge conflicts, external trackers
    - Consult when: working in team mode, setting up multi-developer coordination
- `arc/strategy-concurrent-work.md` - Concurrency doctrine — parallelize, rebase/merge discipline, worktree ops
    - Consult when: running multiple work units at once, deciding whether to parallelize, integrating concurrent work
- `arc/strategy-work-organization.md` - Work categories, branching model (protection modes, planning branches), archival
    - Consult when: creating branches, deciding work unit types, archiving completed work

## Project Strategies

Create project-specific strategies in `project/` as your project's patterns emerge.
See `project/README.md` for guidance on when to create one.

**Example project strategies** (illustrations — these files don't exist until you
create them):

- `project/strategy-authentication.md` - Auth flow, session management
- `project/strategy-testing-methodology.md` - Testing patterns, coverage expectations
- `project/strategy-service-layer.md` - Business logic organization, DI patterns
- `project/strategy-type-safety.md` - Type checking approach, policy decisions
- `project/style/strategy-component-styling.md` - Component patterns, design system
- `project/style/strategy-color-tokens.md` - Color token reference, naming conventions

---

**Maintenance:** Update this index when adding new strategy documents. Keep descriptions to one line;
add a "Consult when:" sub-item with trigger conditions.
