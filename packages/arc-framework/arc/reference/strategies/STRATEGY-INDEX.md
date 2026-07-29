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
    - ALWAYS load when the planning workflow in hand does not settle it — which spec form fits, how layered specs
      compose, where the pipeline's stage boundaries fall; the `resolve-planning-depth` method and the
      `draft-design` / `create-spec` workflows cover routine depth resolution and authoring.
- `arc/strategy-quality-gates.md` - Tiered quality gate system, checkpoint identification, task list integration
    - Consult when: escalating a gate failure, or identifying a non-obvious integration checkpoint — routine
      per-task and per-unit gate runs are covered by the `quality-gate-commands` method
- `arc/strategy-session-operations.md`
    - ALWAYS load before placing new guidance content in a loading tier, or authoring an interlock, recovery, or
      handoff step — the tier classification criteria and loading mechanisms have no leaner surface;
      `DEV-RULES.ARC` § Session Management covers the state-file write rules themselves.
- `arc/strategy-interlock-release-wrappers.md`
    - ALWAYS load when deciding whether to adopt the release wrappers, or composing them with harness permission
      or hook layers — the trust model, the non-fit cases, the universal route for a harness with no reference
      implementation; `DEV-RULES.ARC` § Commit Discipline covers routine invocation and class-tag routing.
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
    - ALWAYS load when the routine path does not settle it — the `Class` model's worked examples, the
      Errand-versus-work-unit boundary, branch protection modes, spec-flow invariants, cohort nesting; the
      `classify-work-unit` / `assess-cohort-fit` methods and the work-unit lifecycle workflows cover routine
      classification, branch, and archival calls.

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
the operation, not to the workflow it usually runs in. Where a leaner surface already covers the common case, name
the **residual** question the entry answers and say which surface holds the rest; a condition that fires as often
as the load would have relocates the read instead of removing it. Add a one-line description only when it carries
content-shape the condition does not.
