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
      `DEV-RULES.ARC` § Commit Discipline and § Handoff carry the state-file write rules themselves.
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

- `project/strategy-package-project-sync.md`
    - ALWAYS load when a sync question outruns the always-loaded rule — the file inventory and dependency map,
      template-counterpart handling, what each safeguard actually checks; `DEV-RULES.PROJECT` § Package-Project
      Sync covers the routine edit-flow and never-copy rules.
- `project/strategy-testing-methodology.md` - TDD decision tree, test tiers, vertical slice workflow, mocking rules
    - Consult when: the `test-first` / `testing-standards` methods don't settle it — TDD rationale, tier
      boundaries, worked examples
- `project/strategy-user-notes-concurrency.md`
    - Consult when: adding or modifying any mutator of shared user-notes state — canonical notes ref,
      identity-global disk, `.sync-state.json`, partial-push markers, sync-state refs, temp refs, or notes locks
- `project/strategy-storage-evolution.md` - **In-development.**
    - Consult when: authoring or iterating plans / PRDs that affect WU-artifact storage, multi-user / multi-machine
      concerns, external-tool integration boundaries, WU/branch coupling, or new configuration axes
- `project/strategy-knowledge-evolution.md` - **In-development.**
    - Consult when: authoring or iterating plans / PRDs that place or relocate agent-facing guidance content, grow
      always-loaded context, add trigger / index / description surfaces, name new doc families, or add loading /
      awareness mechanics
- `project/strategy-procedure-evolution.md` - **In-development.**
    - Consult when: authoring or iterating plans / PRDs / workflows that add conditional or dispatch logic to
      prose, mint agent-interpreted markup, reshape workflow or skill authoring conventions, move logic across the
      CLI↔agent boundary, or add correctness machinery for procedural content
- `project/strategy-pm-composition-evolution.md` - **Provisional.**
    - Consult when: authoring or iterating plans / specs / workflows that add PM fields, external tracker bindings,
      lifecycle sync, provider adapters, or Planning Module boundaries; do not deepen duplicate authority or
      provider-specific workflow mechanics before checking it
