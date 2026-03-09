# Strategy: File Classification

**Purpose:** Define the canonical file classification taxonomy for all `.arc/` template files.
The CLI update system uses these classifications to determine merge strategy per file during
`arc update`.

**Scope:** Classification definitions, naming conventions, merge strategy implications, and
complete file inventory. For directory structure and work organization, see
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

## Naming Conventions

ARC uses consistent naming patterns across all files. Understanding these patterns helps adopters
name their own artifacts and recognize what a file is from its name alone.

### ALL-CAPS vs. lowercase

**ALL-CAPS** files are organizational hubs — files you navigate *to* for project-wide context.
They're dashboards, indexes, and governance documents that serve as stable reference points.

Examples: `WORK-STATUS.md`, `AGENTS.md`, `QUICK-REFERENCE.md`, `DEV-RULES.ARC.md`,
`STRATEGY-INDEX.md`, `README.md`, `META-PRD.md`, `ROADMAP.md`

**Lowercase with prefix** files are instances of a pattern — files you create *from* a convention.
They're work artifacts that follow a naming template.

Examples: `prd-authentication.md`, `tasks-api-modernization.md`, `strategy-work-organization.md`

**The distinction:** ALL-CAPS signals "there's one of these per project/directory, and it's a
coordination point." Lowercase prefix signals "there can be many of these, and the prefix tells
you what kind."

### Prefix patterns

| Prefix        | What It Is               | Created By | Example                           |
|---------------|--------------------------|------------|-----------------------------------|
| `prd-`        | Product Requirements Doc | User/agent | `prd-authentication.md`           |
| `tasks-`      | Task list                | User/agent | `tasks-api-modernization.md`      |
| `completion-` | Completion record        | Agent      | `completion-api-modernization.md` |
| `notes-`      | Work unit notes          | Agent      | `notes-api-modernization.md`      |
| `plan-`       | Work plan (pre-PRD)      | User/agent | `plan-wu3-cli-distribution.md`    |
| `strategy-`   | Strategy document        | Framework  | `strategy-work-organization.md`   |
| `research-`   | Research document        | User/agent | `research-context-loading.md`     |
| `adr-`        | Architecture Decision    | User/agent | `adr-001-define-core-identity.md` |
| `template-`   | Copy-ready template      | Framework  | `template-prd.md`                 |
| `completed-`  | Quarterly summary        | Agent      | `completed-atomic-2026-q1.md`     |

Work unit artifacts (`prd-`, `tasks-`, `completion-`, `notes-`) share a slug across files — the
slug is the work unit's identity. `prd-authentication.md` and `tasks-authentication.md` belong to
the same work unit.

### Why prefixes matter

Prefixes serve two purposes that directory structure alone cannot:

**Fuzzy-find grouping.** Strategies, PRDs, and research docs are frequently invoked manually —
typing `@strategy` in an editor or prompt file picker groups all strategy documents together
regardless of their directory. Without the prefix, you'd search by domain keyword (`@auth`) and get
unrelated results from across the repository. The prefix creates a reliable type-based filter at the
filename level.

**Context-independent type marking.** Filenames appear without full paths in git log, search
results, diff stats, and link reference definitions. `strategy-work-organization.md` communicates
its type anywhere; `work-organization.md` does not. This matters most for artifacts that move
between directories during their lifecycle (active → archive) or are referenced from distant parts
of the tree.

**Why workflows don't use a prefix.** Workflows are the notable exception — they don't carry a
`workflow-` prefix. The reason is access pattern: workflows are activated mechanically by agents
following embedded cross-references with full paths (one workflow links to the next). They're rarely
invoked via fuzzy-find or seen outside their path context. Core pipeline workflows use number
prefixes (`1_`, `2_`, `3_`) that already provide grouping signal, and lifecycle/supplemental
workflows live in purpose-named directories that communicate their role. The prefix would add
redundancy without the discoverability benefit that other artifact types get.

### Template suffix: `.template.md`

Files in the `.arc/` template system that get instantiated during `arc init` use a `.template.md`
suffix: `WORK-STATUS.template.md` becomes `WORK-STATUS.md`, `AGENTS.template.md` becomes
`AGENTS.md`. The suffix distinguishes "copy this to create yours" from "this is the actual file."

The `template-` *prefix* (in `reference/templates/`) is different — those are copy-ready document
templates used during work (e.g., `template-prd.md` is copied when creating a new PRD). They keep
the prefix in use, not just at init time.

### Workflow numbering

Core pipeline workflows are numbered to indicate execution sequence:

- `1_create-prd.md` → `2_generate-tasks.md` → `3_process-task-loop.md`

Setup workflows use zero-padded numbers: `01_initialize-arc.md`, `02_define-project.md`.

Supplemental workflows are **unnumbered** — they're invoked on demand at various points, not in a
fixed sequence. The absence of a number signals "this is called when needed, not as a pipeline
step."

### Directory naming

Lowercase, hyphenated, functional names throughout. Work categories (`feature/`, `technical/`,
`incidental/`) are consistent across `active/`, `backlog/`, and `archive/`. Archive adds
quarter-based grouping (`2026-q1/`) and sequence-numbered directories (`01_work-name/`) for
completion ordering.

### Adopter guidance

When creating project-specific artifacts:

- **Project strategies** follow the same `strategy-` prefix: `strategy-authentication.md`
- **Project workflows** use descriptive names without numbers (unless they form a pipeline)
- **Domain-specific dev-rules** follow `DEV-RULES.{DOMAIN}.md` in ALL-CAPS: `DEV-RULES.FRONTEND.md`
- **ADRs** continue the sequential numbering: `adr-011-your-decision.md`
- **Research docs** use the `research-` prefix: `research-performance-benchmarks.md`
- **Work unit artifacts** always use the matching prefixes (`prd-`, `tasks-`, etc.) with a shared
  slug

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

| File                                      | Classification | Layer      | Notes                                      |
|-------------------------------------------|----------------|------------|--------------------------------------------|
| `ROADMAP.template.md`                     | Scaffolded     | arc-in-git | All placeholders replaced by user content. |
| `feature/BACKLOG-FEATURE.template.md`     | Scaffolded     | arc-in-git | Template structure replaced entirely.      |
| `technical/BACKLOG-TECHNICAL.template.md` | Scaffolded     | arc-in-git | Template structure replaced entirely.      |

### team/

| File                        | Classification       | Layer      | Notes                                                                          |
|-----------------------------|----------------------|------------|--------------------------------------------------------------------------------|
| `README.md`                 | Framework            | Core       | Team directory overview and structure guidance.                                |
| `ATOMIC-TASKS.template.md`  | Configurable (light) | arc-in-git | Per-member atomic tasks. Same structure as `active/` variant.                  |
| `SESSION-NOTES.template.md` | Framework            | Core       | Reference structure for gitignored SESSION-NOTES.md. Agents follow at handoff. |

### reference/

| File                             | Classification | Layer      | Notes                                                                                 |
|----------------------------------|----------------|------------|---------------------------------------------------------------------------------------|
| `QUICK-REFERENCE.template.md`    | Configurable   | Core       | Framework structure + project-specific commands and paths. Moderate conflict surface. |
| `META-PRD.template.md`           | Scaffolded     | Core       | All content replaced by user.                                                         |
| `PROJECT-STATUS.template.md`     | Scaffolded     | arc-in-git | All content replaced by user.                                                         |
| `TECHNICAL-OVERVIEW.template.md` | Scaffolded     | Core       | All content replaced by user.                                                         |

### reference/adr/

| File        | Classification | Layer | Notes            |
|-------------|----------------|-------|------------------|
| `README.md` | Framework      | Core  | ADR conventions. |

### reference/templates/

| File                         | Classification | Layer | Notes                                      |
|------------------------------|----------------|-------|--------------------------------------------|
| `template-adr.md`            | Framework      | Core  | Copy-ready ADR template.                   |
| `template-prd.md`            | Framework      | Core  | Copy-ready PRD template.                   |
| `template-plan.md`           | Framework      | Core  | Optional plan document starting structure. |
| `template-completion-doc.md` | Framework      | Core  | Completion doc templates and guidance.     |

### reference/archive/

| File                                      | Classification       | Layer | Notes                                                |
|-------------------------------------------|----------------------|-------|------------------------------------------------------|
| `README.md`                               | Configurable (light) | Core  | Framework archive guidance + user-populated section. |
| `{feature,technical,incidental}/.gitkeep` | Scaffolded           | Core  | Directory scaffolding.                               |

### reference/constitution/

| File                    | Classification | Layer | Notes                                                                       |
|-------------------------|----------------|-------|-----------------------------------------------------------------------------|
| `DEV-RULES.ARC.md`      | Framework      | Core  | ARC development methodology (commit, verification, session/task rules).     |
| `DEV-RULES.PROJECT.md`  | Configurable   | Core  | Project quality gates, testing requirements, architecture rules.            |
| `DEV-RULES.{DOMAIN}.md` | Configurable   | Core  | Optional domain-scoped rules (e.g., FRONTEND, AUTH). Not counted in totals. |
| `README.md`             | Framework      | Core  | Constitution directory overview and domain-scoped dev-rules guidance.       |

### reference/research/

| File        | Classification | Layer | Notes                 |
|-------------|----------------|-------|-----------------------|
| `README.md` | Framework      | Core  | Research conventions. |

### reference/strategies/

| File                                           | Classification | Layer      | Notes                                                |
|------------------------------------------------|----------------|------------|------------------------------------------------------|
| `README.md`                                    | Framework      | Core       | Directory overview.                                  |
| `STRATEGY-INDEX.md`                            | Configurable   | Core       | ARC strategies section + project strategies section. |
| `arc/strategy-adr-methodology.md`              | Framework      | Core       | ARC methodology.                                     |
| `arc/strategy-backlog-organization.md`         | Framework      | arc-in-git | ARC methodology.                                     |
| `arc/strategy-configurability-architecture.md` | Framework      | Core       | ARC methodology.                                     |
| `arc/strategy-core-philosophy.md`              | Framework      | Core       | ARC methodology.                                     |
| `arc/strategy-file-classification.md`          | Framework      | Core       | ARC methodology (this document).                     |
| `arc/strategy-quality-gates.md`                | Framework      | Core       | ARC methodology.                                     |
| `arc/strategy-task-list-formatting.md`         | Framework      | Core       | ARC methodology.                                     |
| `arc/strategy-team-coordination.md`            | Framework      | Core       | ARC methodology.                                     |
| `arc/strategy-work-organization.md`            | Framework      | Core       | ARC methodology.                                     |
| `arc/strategy-work-planning.md`                | Framework      | Core       | ARC methodology.                                     |
| `project/README.md`                            | Framework      | Core       | Guidance for creating project strategies.            |
| `project/style/README.md`                      | Framework      | Core       | Guidance for style strategies.                       |

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

### system/skills/

| File                   | Classification | Layer | Notes                                                            |
|------------------------|----------------|-------|------------------------------------------------------------------|
| `README.md`            | Framework      | Core  | Skills directory guide.                                          |
| `arc-resume/SKILL.md`  | Framework      | Core  | Session initialization trigger. Generated to tool-specific dirs. |
| `arc-commit/SKILL.md`  | Framework      | Core  | Atomic commit trigger. Generated to tool-specific dirs.          |
| `arc-handoff/SKILL.md` | Framework      | Core  | Session handoff trigger. Generated to tool-specific dirs.        |

### system/githooks/

| File         | Classification | Layer | Notes                                                         |
|--------------|----------------|-------|---------------------------------------------------------------|
| `README.md`  | Framework      | Core  | Hook setup documentation.                                     |
| `commit-msg` | Framework      | Core  | Commit validation script. Customization points in README.     |
| `pre-commit` | Framework      | Core  | Pre-commit validation script. Customization points in README. |

### system/workflows/

| File                                                            | Classification | Layer | Notes                                 |
|-----------------------------------------------------------------|----------------|-------|---------------------------------------|
| `arc-extensions.md`                                             | Configurable   | Core  | Extension points for team ceremonies. |
| `arc-methods.md`                                                | Configurable   | Core  | Method defaults and override slots.   |
| `arc/1_create-prd.md`                                           | Framework      | Core  | Core workflow.                        |
| `arc/2_generate-tasks.md`                                       | Framework      | Core  | Core workflow.                        |
| `arc/3_process-task-loop.md`                                    | Framework      | Core  | Core workflow.                        |
| `arc/initial-setup/01_initialize-arc.md`                        | Framework      | Core  | Setup workflow.                       |
| `arc/initial-setup/02_define-project.md`                        | Framework      | Core  | Setup workflow.                       |
| `arc/session-lifecycle/session-handoff.md`                      | Framework      | Core  | Session lifecycle workflow.           |
| `arc/session-lifecycle/session-init.md`                         | Framework      | Core  | Session lifecycle workflow.           |
| `arc/supplemental/maintain-project-docs.md`                     | Framework      | Core  | Supplemental workflow.                |
| `arc/supplemental/manage-incidental-work.md`                    | Framework      | Core  | Supplemental workflow.                |
| `arc/supplemental/prepare-commits.md`                           | Framework      | Core  | Supplemental workflow.                |
| `arc/work-unit-lifecycle/activate-work-unit.md`                 | Framework      | Core  | Lifecycle workflow.                   |
| `arc/work-unit-lifecycle/archive-work-unit.md`                  | Framework      | Core  | Lifecycle workflow.                   |
| `arc/work-unit-lifecycle/clean-work-unit.md`                    | Framework      | Core  | Lifecycle workflow.                   |
| `arc/work-unit-lifecycle/integrate-work-unit.md`                | Framework      | Core  | Lifecycle workflow.                   |
| `arc/work-unit-lifecycle/rotate-branch.md`                      | Framework      | Core  | Lifecycle workflow.                   |
| `arc/work-unit-lifecycle/verify-work-unit.md`                   | Framework      | Core  | Lifecycle workflow.                   |
| `arc/work-unit-lifecycle/planning/activate-planning-branch.md`  | Framework      | Core  | Planning workflow (full protection).  |
| `arc/work-unit-lifecycle/planning/integrate-planning-branch.md` | Framework      | Core  | Planning workflow (full protection).  |
| `project/README.md`                                             | Framework      | Core  | Project workflow guidance.            |

---

## Summary

| Classification | Count | Update Behavior                                       |
|----------------|-------|-------------------------------------------------------|
| Framework      | 53    | Three-way merge. Conflicts rare.                      |
| Configurable   | 15    | Three-way merge. Conflicts expected in user sections. |
| Scaffolded     | 13    | Skip. Project-owned after init.                       |
| Project-owned  | 0     | Ignore. User-created, not in template.                |

**Total template files:** 81.

*Counts reflect actual files on disk. Wildcard rows (e.g., `{feature,technical,incidental}/.gitkeep`)
are expanded. `DEV-RULES.{DOMAIN}.md` is a naming convention for adopter-created files and is not
counted.*

---

## Related Documentation

- [Work Organization Strategy](strategy-work-organization.md) — Directory structure, work categories
- [DEV-RULES.PROJECT](../../constitution/DEV-RULES.PROJECT.md) — Project quality standards
