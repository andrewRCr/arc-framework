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

### Root

| File        | Classification | Notes                                       |
|-------------|----------------|---------------------------------------------|
| `README.md` | Framework      | Directory overview. Users rarely customize. |

### active/

| File                                      | Classification       | Notes                                                                     |
|-------------------------------------------|----------------------|---------------------------------------------------------------------------|
| `ATOMIC-TASKS.template.md`                | Configurable (light) | Framework processing rules + user task content. Clean section separation. |
| `WORK-STATUS.template.md`                 | Scaffolded           | Template structure replaced entirely by user. Project-owned after init.   |
| `{feature,technical,incidental}/.gitkeep` | Scaffolded           | Directory structure scaffolding.                                          |

### backlog/

| File                                      | Classification       | Notes                                                                |
|-------------------------------------------|----------------------|----------------------------------------------------------------------|
| `ROADMAP.template.md`                     | Scaffolded           | All placeholders replaced by user content.                           |
| `TASK-INBOX.template.md`                  | Configurable (light) | Framework processing rules + user content. Clean section separation. |
| `feature/BACKLOG-FEATURE.template.md`     | Scaffolded           | Template structure replaced entirely.                                |
| `technical/BACKLOG-TECHNICAL.template.md` | Scaffolded           | Template structure replaced entirely.                                |

### reference/

| File                          | Classification | Notes                                                                                 |
|-------------------------------|----------------|---------------------------------------------------------------------------------------|
| `QUICK-REFERENCE.template.md` | Configurable   | Framework structure + project-specific commands and paths. Moderate conflict surface. |

### reference/adr/

| File        | Classification | Notes            |
|-------------|----------------|------------------|
| `README.md` | Framework      | ADR conventions. |

### reference/templates/

| File               | Classification | Notes                                      |
|--------------------|----------------|--------------------------------------------|
| `template-adr.md`  | Framework      | Copy-ready ADR template.                   |
| `template-prd.md`  | Framework      | Copy-ready PRD template.                   |
| `template-plan.md` | Framework      | Optional plan document starting structure. |

### reference/archive/

| File                            | Classification       | Notes                                                |
|---------------------------------|----------------------|------------------------------------------------------|
| `README.md`                     | Configurable (light) | Framework archive guidance + user-populated section. |
| `{feature,incidental}/.gitkeep` | Scaffolded           | Directory scaffolding.                               |

### reference/constitution/

| File                             | Classification | Notes                                                            |
|----------------------------------|----------------|------------------------------------------------------------------|
| `DEV-RULES.ARC.md`               | Framework      | ARC development methodology (commit, verification, session/task rules). |
| `DEV-RULES.PROJECT.md`           | Configurable   | Project quality gates, testing requirements, architecture rules.        |
| `META-PRD.template.md`           | Scaffolded     | All content replaced by user.                                    |
| `PROJECT-STATUS.template.md`     | Scaffolded     | All content replaced by user.                                    |
| `TECHNICAL-OVERVIEW.template.md` | Scaffolded     | All content replaced by user.                                    |

### reference/research/

| File        | Classification | Notes                 |
|-------------|----------------|-----------------------|
| `README.md` | Framework      | Research conventions. |

### reference/strategies/

| File                                      | Classification | Notes                                                |
|-------------------------------------------|----------------|------------------------------------------------------|
| `README.md`                               | Framework      | Directory overview.                                  |
| `STRATEGY-INDEX.md`                       | Configurable   | ARC strategies section + project strategies section. |
| `arc/strategy-adr-methodology.md`         | Framework      | ARC methodology.                                     |
| `arc/strategy-backlog-organization.md`    | Framework      | ARC methodology.                                     |
| `arc/strategy-file-classification.md`     | Framework      | ARC methodology (this document).                     |
| `arc/strategy-quality-gates.md`           | Framework      | ARC methodology.                                     |
| `arc/strategy-task-list-formatting.md`    | Framework      | ARC methodology.                                     |
| `arc/strategy-work-organization.md`       | Framework      | ARC methodology.                                     |
| `project/README.md`                       | Framework      | Guidance for creating project strategies.            |
| `project/style/README.md`                 | Framework      | Guidance for style strategies.                       |

### system/

| File             | Classification | Notes                                                             |
|------------------|----------------|-------------------------------------------------------------------|
| `README.md`      | Framework      | System directory overview.                                        |
| `arc-config.yml` | Configurable   | Project settings (base branch, protection mode). Shell-parseable. |

### system/agent/

| File                               | Classification | Notes                                                        |
|------------------------------------|----------------|--------------------------------------------------------------|
| `AGENTS.template.md`               | Configurable   | Framework principles + project-specific stack/layout.        |
| `CLAUDE.template.md`               | Configurable   | Framework guidance + project-specific (MCP servers, agents). |
| `CODEX.template.md`                | Configurable   | Mostly framework guidance with light customization.          |
| `GEMINI.template.md`               | Configurable   | Mostly framework guidance with light customization.          |
| `WARP.template.md`                 | Configurable   | Mostly framework guidance with light customization.          |
| `copilot-instructions.template.md` | Configurable   | Mostly framework guidance with light customization.          |
| `README.md`                        | Framework      | Agent system architecture documentation.                     |

### system/commands/

| File        | Classification | Notes                     |
|-------------|----------------|---------------------------|
| `README.md` | Framework      | Commands directory guide. |
| `.gitkeep`  | Scaffolded     | Directory scaffolding.    |

### system/githooks/

| File         | Classification | Notes                                                         |
|--------------|----------------|---------------------------------------------------------------|
| `README.md`  | Framework      | Hook setup documentation.                                     |
| `commit-msg` | Framework      | Commit validation script. Customization points in README.     |
| `pre-commit` | Framework      | Pre-commit validation script. Customization points in README. |

### system/workflows/

| File                                         | Classification | Notes                      |
|----------------------------------------------|----------------|----------------------------|
| `arc/1_create-prd.md`                        | Framework      | Core workflow.             |
| `arc/2_generate-tasks.md`                    | Framework      | Core workflow.             |
| `arc/3_process-task-loop.md`                 | Framework      | Core workflow.             |
| `arc/setup/01_initialize-arc.md`             | Framework      | Setup workflow.            |
| `arc/setup/02_define-project.md`             | Framework      | Setup workflow.            |
| `arc/supplemental/activate-work-unit.md`     | Framework      | Supplemental workflow.     |
| `arc/supplemental/agent-pre-merge-review.md` | Framework      | Supplemental workflow.     |
| `arc/supplemental/archive-completed.md`      | Framework      | Supplemental workflow.     |
| `arc/supplemental/atomic-commit.md`          | Framework      | Supplemental workflow.     |
| `arc/supplemental/maintain-docs.md`          | Framework      | Supplemental workflow.     |
| `arc/supplemental/maintain-task-notes.md`    | Framework      | Supplemental workflow.     |
| `arc/supplemental/manage-incidental-work.md` | Framework      | Supplemental workflow.     |
| `arc/supplemental/session-handoff.md`        | Framework      | Supplemental workflow.     |
| `arc/supplemental/session-init.md`           | Framework      | Supplemental workflow.     |
| `arc/supplemental/weekly-review.md`          | Framework      | Supplemental workflow.     |
| `project/README.md`                          | Framework      | Project workflow guidance. |

---

## Summary

| Classification | Count | Update Behavior                                       |
|----------------|-------|-------------------------------------------------------|
| Framework      | 38    | Three-way merge. Conflicts rare.                      |
| Configurable   | 12    | Three-way merge. Conflicts expected in user sections. |
| Scaffolded     | 11    | Skip. Project-owned after init.                       |
| Project-owned  | 0     | Ignore. User-created, not in template.                |

**Total template files:** 61.

---

## Related Documentation

- [Work Organization Strategy](strategy-work-organization.md) — Directory structure, work categories
- [DEV-RULES.PROJECT](../../constitution/DEV-RULES.PROJECT.md) — Project quality standards
