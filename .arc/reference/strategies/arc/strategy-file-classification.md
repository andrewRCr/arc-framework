# Strategy: File Classification

**Purpose:** Define the canonical file classification taxonomy for all `.arc/` template files.
The CLI update system uses these classifications to determine merge strategy per file during
`arc update`.

**Scope:** Classification definitions, merge strategy implications, and complete file inventory.
For directory structure and work organization, see
[Work Organization Strategy](strategy-work-organization.md).

---

## Taxonomy

### Framework

ARC methodology files. Rarely customized by adopters. Updated via three-way merge during
`arc update` — conflicts are rare since users shouldn't modify these.

**Examples:** Workflows, strategies, READMEs, githooks, ADR template.

**Update behavior:** Auto-merge. Flag conflicts for review (indicates unexpected customization).

### Configurable

Framework structure combined with project-specific content. Contains both ARC methodology
(sections, rules, processing guidance) and user content (project stack, quality gate commands,
custom sections). Clean section-level separation in most files.

**Examples:** DEV-RULES.PROJECT, AGENTS, CLAUDE, QUICK-REFERENCE, STRATEGY-INDEX.

**Update behavior:** Three-way merge. Conflicts expected in project-specific sections — CLI
highlights for user resolution. Framework sections auto-merge cleanly when separation is
section-level.

### Scaffolded

Created once during `arc init` from template. User replaces all placeholder content with
project-specific content. Never touched by framework updates.

**Examples:** META-PRD, PROJECT-STATUS, WORK-STATUS, ROADMAP, backlog files.

**Update behavior:** Skip entirely. These are project-owned after initialization.

### Project-Owned

Created by users during project development. Not part of the `.arc/` template system.
Never included in or affected by framework updates.

**Examples:** ADRs, task lists, PRDs, notes files, project strategy docs, research docs.

**Update behavior:** Ignore. CLI never reads or writes these files.

---

## File Inventory

All paths relative to `.arc/`.

The **Layer** column indicates which framework layer owns each file: **Core** (always
installed) or **arc-in-git** (`pm.mode: arc-in-git`). Layer classification is orthogonal
to update classification — both axes apply independently.

### Root

| File        | Classification | Layer | Notes                                       |
|-------------|----------------|-------|---------------------------------------------|
| `README.md` | Framework      | Core  | Directory overview. Users rarely customize. |

### active/

| File                                      | Classification       | Layer      | Notes                                                                          |
|-------------------------------------------|----------------------|------------|--------------------------------------------------------------------------------|
| `ATOMIC-TASKS.template.md`                | Configurable (light) | arc-in-git | Framework processing rules + user task content. Clean section separation.      |
| `SESSION-NOTES.template.md`               | Framework            | Core       | Reference structure for gitignored SESSION-NOTES.md. Agents follow at handoff. |
| `WORK-STATUS.template.md`                 | Scaffolded           | Core       | Template structure replaced entirely by user. Project-owned after init.        |
| `{feature,technical,incidental}/.gitkeep` | Scaffolded           | Core       | Directory structure scaffolding.                                               |

### backlog/

| File                                      | Classification       | Layer      | Notes                                                                |
|-------------------------------------------|----------------------|------------|----------------------------------------------------------------------|
| `ROADMAP.template.md`                     | Scaffolded           | arc-in-git | All placeholders replaced by user content.                           |
| `feature/BACKLOG-FEATURE.template.md`     | Scaffolded           | arc-in-git | Template structure replaced entirely.                                |
| `technical/BACKLOG-TECHNICAL.template.md` | Scaffolded           | arc-in-git | Template structure replaced entirely.                                |

### team/

| File                        | Classification       | Layer      | Notes                                                                          |
|-----------------------------|----------------------|------------|--------------------------------------------------------------------------------|
| `README.md`                 | Framework            | Core       | Team directory overview and structure guidance.                                |
| `ATOMIC-TASKS.template.md`  | Configurable (light) | arc-in-git | Per-member atomic tasks. Same structure as `active/` variant.                  |
| `SESSION-NOTES.template.md` | Framework            | Core       | Reference structure for gitignored SESSION-NOTES.md. Agents follow at handoff. |

### reference/

| File                          | Classification | Layer | Notes                                                                                 |
|-------------------------------|----------------|-------|---------------------------------------------------------------------------------------|
| `QUICK-REFERENCE.template.md` | Configurable   | Core  | Framework structure + project-specific commands and paths. Moderate conflict surface. |

### reference/adr/

| File        | Classification | Layer | Notes            |
|-------------|----------------|-------|------------------|
| `README.md` | Framework      | Core  | ADR conventions. |

### reference/templates/

| File               | Classification | Layer | Notes                                      |
|--------------------|----------------|-------|--------------------------------------------|
| `template-adr.md`  | Framework      | Core  | Copy-ready ADR template.                   |
| `template-prd.md`  | Framework      | Core  | Copy-ready PRD template.                   |
| `template-plan.md` | Framework      | Core  | Optional plan document starting structure. |

### reference/archive/

| File                            | Classification       | Layer | Notes                                                |
|---------------------------------|----------------------|-------|------------------------------------------------------|
| `README.md`                     | Configurable (light) | Core  | Framework archive guidance + user-populated section. |
| `{feature,incidental}/.gitkeep` | Scaffolded           | Core  | Directory scaffolding.                               |

### reference/constitution/

| File                             | Classification | Layer      | Notes                                                                   |
|----------------------------------|----------------|------------|-------------------------------------------------------------------------|
| `DEV-RULES.ARC.md`               | Framework      | Core       | ARC development methodology (commit, verification, session/task rules). |
| `DEV-RULES.PROJECT.md`           | Configurable   | Core       | Project quality gates, testing requirements, architecture rules.        |
| `META-PRD.template.md`           | Scaffolded     | Core       | All content replaced by user.                                           |
| `PROJECT-STATUS.template.md`     | Scaffolded     | arc-in-git | All content replaced by user.                                           |
| `TECHNICAL-OVERVIEW.template.md` | Scaffolded     | Core       | All content replaced by user.                                           |

### reference/research/

| File        | Classification | Layer | Notes                 |
|-------------|----------------|-------|-----------------------|
| `README.md` | Framework      | Core  | Research conventions. |

### reference/strategies/

| File                                   | Classification | Layer      | Notes                                                |
|----------------------------------------|----------------|------------|------------------------------------------------------|
| `README.md`                            | Framework      | Core       | Directory overview.                                  |
| `STRATEGY-INDEX.md`                    | Configurable   | Core       | ARC strategies section + project strategies section. |
| `arc/strategy-adr-methodology.md`      | Framework      | Core       | ARC methodology.                                     |
| `arc/strategy-backlog-organization.md` | Framework      | arc-in-git | ARC methodology.                                     |
| `arc/strategy-file-classification.md`  | Framework      | Core       | ARC methodology (this document).                     |
| `arc/strategy-quality-gates.md`        | Framework      | Core       | ARC methodology.                                     |
| `arc/strategy-task-list-formatting.md` | Framework      | Core       | ARC methodology.                                     |
| `arc/strategy-work-organization.md`    | Framework      | Core       | ARC methodology.                                     |
| `project/README.md`                    | Framework      | Core       | Guidance for creating project strategies.            |
| `project/style/README.md`              | Framework      | Core       | Guidance for style strategies.                       |

### system/

| File             | Classification | Layer | Notes                                                             |
|------------------|----------------|-------|-------------------------------------------------------------------|
| `README.md`      | Framework      | Core  | System directory overview.                                        |
| `arc-config.yml` | Configurable   | Core  | Project settings (base branch, protection mode). Shell-parseable. |

### system/agent/

| File                               | Classification | Layer | Notes                                                        |
|------------------------------------|----------------|-------|--------------------------------------------------------------|
| `AGENTS.template.md`               | Configurable   | Core  | Framework principles + project-specific stack/layout.        |
| `CLAUDE.template.md`               | Configurable   | Core  | Framework guidance + project-specific (MCP servers, agents). |
| `CODEX.template.md`                | Configurable   | Core  | Mostly framework guidance with light customization.          |
| `GEMINI.template.md`               | Configurable   | Core  | Mostly framework guidance with light customization.          |
| `WARP.template.md`                 | Configurable   | Core  | Mostly framework guidance with light customization.          |
| `copilot-instructions.template.md` | Configurable   | Core  | Mostly framework guidance with light customization.          |
| `README.md`                        | Framework      | Core  | Agent system architecture documentation.                     |

### system/commands/

| File        | Classification | Layer | Notes                     |
|-------------|----------------|-------|---------------------------|
| `README.md` | Framework      | Core  | Commands directory guide. |
| `.gitkeep`  | Scaffolded     | Core  | Directory scaffolding.    |

### system/githooks/

| File         | Classification | Layer | Notes                                                         |
|--------------|----------------|-------|---------------------------------------------------------------|
| `README.md`  | Framework      | Core  | Hook setup documentation.                                     |
| `commit-msg` | Framework      | Core  | Commit validation script. Customization points in README.     |
| `pre-commit` | Framework      | Core  | Pre-commit validation script. Customization points in README. |

### system/workflows/

| File                                         | Classification | Layer      | Notes                      |
|----------------------------------------------|----------------|------------|----------------------------|
| `arc/1_create-prd.md`                        | Framework      | Core       | Core workflow.             |
| `arc/2_generate-tasks.md`                    | Framework      | Core       | Core workflow.             |
| `arc/3_process-task-loop.md`                 | Framework      | Core       | Core workflow.             |
| `arc/setup/01_initialize-arc.md`             | Framework      | Core       | Setup workflow.            |
| `arc/setup/02_define-project.md`             | Framework      | Core       | Setup workflow.            |
| `arc/supplemental/activate-work-unit.md`     | Framework      | Core       | Supplemental workflow.     |
| `arc/supplemental/agent-pre-merge-review.md` | Framework      | Core       | Supplemental workflow.     |
| `arc/supplemental/archive-completed.md`      | Framework      | Core       | Supplemental workflow.     |
| `arc/supplemental/atomic-commit.md`          | Framework      | Core       | Supplemental workflow.     |
| `arc/supplemental/maintain-docs.md`          | Framework      | Core       | Supplemental workflow.     |
| `arc/supplemental/maintain-task-notes.md`    | Framework      | Core       | Supplemental workflow.     |
| `arc/supplemental/manage-incidental-work.md` | Framework      | Core       | Supplemental workflow.     |
| `arc/supplemental/session-handoff.md`        | Framework      | Core       | Supplemental workflow.     |
| `arc/supplemental/session-init.md`           | Framework      | Core       | Supplemental workflow.     |
| `project/README.md`                          | Framework      | Core       | Project workflow guidance. |

---

## Summary

| Classification | Count | Update Behavior                                       |
|----------------|-------|-------------------------------------------------------|
| Framework      | 40    | Three-way merge. Conflicts rare.                      |
| Configurable   | 12    | Three-way merge. Conflicts expected in user sections. |
| Scaffolded     | 11    | Skip. Project-owned after init.                       |
| Project-owned  | 0     | Ignore. User-created, not in template.                |

**Total template files:** 63.

---

## Related Documentation

- [Work Organization Strategy](strategy-work-organization.md) — Directory structure, work categories
- [DEV-RULES.PROJECT](../../constitution/DEV-RULES.PROJECT.md) — Project quality standards
