# Strategy Document Index

**Purpose:** Quick reference to codified strategy guidance. Consult relevant strategies before implementing
work in their domains.

## ARC Framework Strategies

These ship with the framework and cover development methodology applicable to any project.
Strategies marked **(arc-in-git)** are only present when arc-in-git Project Management mode is active
(`pm.mode: arc-in-git`); those marked **(team mode)** only when `team.mode: true` — both in `arc-config.yml`.

- `arc/strategy-adr-methodology.md`
    - Consult when: writing an ADR, deciding whether a decision warrants one
- `arc/strategy-configurability-architecture.md`
    - Consult when: working on config, extensions, or methods infrastructure
- `arc/strategy-planning-module.md` **(arc-in-git)** - What arc-in-git installs, routing/promotion, scaling
  boundaries
    - Consult when: working with backlog structure, routing deferred work, evaluating PM mode fit
- `arc/strategy-file-classification.md`
    - Consult when: classifying new files, naming new artifacts, determining merge strategies
- `arc/strategy-work-planning.md` - Planning pipeline, depth model, spec forms (brief/outline/detailed), layered
  specs
    - ALWAYS load before authoring a draft or spec, resolving planning depth, or moving a work unit between
      planning stages; do not draft, or settle depth, from the artifact templates alone.
- `arc/strategy-quality-gates.md` - Tiered quality gate system, checkpoint identification, task list integration
    - Consult when: escalating a gate failure, or identifying a non-obvious integration checkpoint — routine
      per-task and per-unit gate runs are covered by the `quality-gate-commands` method
- `arc/strategy-session-operations.md`
    - ALWAYS load before placing new guidance content in a loading tier, changing when session state is written, or
      authoring an interlock or handoff step; do not place content, or pick a write point, by matching where
      similar content already sits.
- `arc/strategy-interlock-release-wrappers.md`
    - ALWAYS load before enabling, configuring, or troubleshooting `arc release commit` / `arc release push`, or
      composing them with harness permission or hook layers; do not infer wrapper behavior from the interlock
      configuration values alone.
- `arc/strategy-task-list-formatting.md` - Task list formatting rules — structure, ownership, verification, success
  criteria
    - Consult when: creating or restructuring task lists, formatting task entries, checking structural requirements
    - Companion: `template-tasks.md` for skeletons; `generate-tasks.md` § Finalize the task list for the pre-save
      checklist
- `arc/strategy-workflow-authoring.md`
    - ALWAYS load before authoring or editing a workflow file — frontmatter, method or extension declarations,
      interlock markers, routing class tags; do not copy the shape from an existing workflow.
- `arc/strategy-team-coordination.md` **(team mode)**
    - ALWAYS load before assigning or transferring work-unit ownership across developers, or setting
      interlock-release configuration in a shared repository; do not resolve cross-person coordination from the
      single-owner conventions.
- `arc/strategy-concurrent-work.md`
    - Consult when: running multiple work units at once, deciding whether to parallelize, integrating concurrent work
- `arc/strategy-work-organization.md`
    - ALWAYS load before categorizing work, resolving a work unit's `Class`, cutting or naming a branch, forming a
      cohort, rendering ROADMAP, or archiving completed work; do not infer the category, branch name, or archive
      location from surrounding examples.

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

**Maintenance:** Update this index when adding new strategy documents. Write each entry's firing condition as a
directive — name the operation that triggers the load and the default behavior it suppresses ("ALWAYS load X
before {operation}; do not {default} directly") — rather than a title or a passive summary. Anchor the trigger to
the operation, not to the workflow it usually runs in. Add a one-line description only when it carries
content-shape the condition does not.
