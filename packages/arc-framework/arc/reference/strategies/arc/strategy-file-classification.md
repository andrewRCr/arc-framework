# Strategy: File Classification

**Purpose:** Define the canonical file classification taxonomy for all `.arc/` template files.
The CLI update system uses these classifications to determine merge strategy per file during
`arc update`.

**Scope:** Classification definitions, naming conventions, and merge strategy implications.
For the complete file inventory with layer annotations, see the project's package-project-sync
strategy. For directory structure and work organization, see
[Work Organization Strategy](strategy-work-organization.md).

---

## Taxonomy

### Framework

ARC methodology files. Not customized by adopters — wholesale replaced during `arc update`.
Adopter modifications are overwritten; customization uses the override surfaces below.

**Examples:** Workflows, strategies, READMEs, githooks, ADR template.

**Update behavior:** Wholesale replaced. Adopter modifications overwritten. No conflicts possible.

**If you need to customize:** Framework files shouldn't be edited directly — changes are
overwritten on every update. See [Configurability Architecture][config-arch] §
[Which mechanism do I use?][config-arch-which] for the right customization surface (config
settings, method overrides, extensions, or Configurable files).

### Configurable

Framework structure combined with project-specific content. Contains both ARC methodology
(sections, rules, processing guidance) and user content (project stack, quality gate commands,
custom sections). Clean section-level separation in most files.

**Examples:** DEV-RULES.PROJECT, AGENT-BRIEF.PROJECT, QUICK-REFERENCE, STRATEGY-INDEX.

**Update behavior:** Three-way merge. Conflicts expected in project-specific sections — CLI
highlights for user resolution. Framework sections auto-merge cleanly when separation is
section-level.

### Scaffolded

Created once during `arc init` from template. User replaces all placeholder content with
project-specific content. Never touched by framework updates.

**Examples:** META-PRD, PROJECT-STATUS, ROADMAP, backlog files.

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

Examples: `AGENT-BRIEF.PROJECT.md`, `QUICK-REFERENCE.md`, `DEV-RULES.ARC.md`,
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
| `atomic-`     | Atomic companion file    | Agent      | `atomic-api-modernization.md`     |
| `plan-`       | Work plan (pre-PRD)      | User/agent | `plan-api-migration.md`           |
| `working-`    | Working doc for `plan-*` | User/agent | `working-modes-gap-resolution.md` |
| `strategy-`   | Strategy document        | Framework  | `strategy-work-organization.md`   |
| `research-`   | Research document        | User/agent | `research-context-loading.md`     |
| `adr-`        | Architecture Decision    | User/agent | `adr-001-define-core-identity.md` |
| `template-`   | Copy-ready template      | Framework  | `template-prd.md`                 |

Work unit artifacts (`prd-`, `tasks-`, `completion-`, `notes-`) share a slug across files — the
slug is the work unit's identity. `prd-authentication.md` and `tasks-authentication.md` belong to
the same work unit.

### Working docs (optional)

`working-*` is an optional convention for tracked working docs that support a `plan-*` doc when
the plan itself isn't enough workspace. The plan doc is normally the primary working surface for
pre-PRD exploration, so many efforts won't need a working doc — but deeper analytical or
multi-axis work can benefit from separation.

**Positioning:**

- `plan-*` is the starting point and "working record of intent" — what the work is and why.
- `working-*` is the workspace for refining that intent when the refinement is too large or too
  noisy to stay in the plan doc itself.
- `notes-*` is different polarity: `notes-*` captures extracted reference content from *retired*
  `plan-*` docs (post-PRD-creation, durable). `working-*` is pre-resolution workspace that
  drains into the plan.

**Lifecycle:**

- **Tracked** (committed to git), unlike `temp-*` files which are gitignored. Multi-session work
  needs git history for traceability.
- **Temporal, not archived** — when findings drain into the plan doc (or the eventual PRD), the
  working doc can be deleted. Its reasoning lives in commit history and the plan itself. Unlike
  `analysis-*` and `research-*` files in `reference/` which are durable reference, working docs
  are not preserved long-term.
- **Retention past drain** is at author's discretion — delete for cleanliness or keep as a
  working record, either is valid.

**When to use:** Reach for `working-*` when a plan refinement generates enough discrete findings
or multi-session state that keeping it in the plan doc would hurt the plan's readability as
intent. If the plan doc can carry the work without degrading, keep it there.

**Location:** Alongside the plan doc being supported (same directory).

### Template suffix: `.template.md`

Files that go through the CLI render engine during `arc init` — token substitution (`{{TOKEN}}`),
conditional content (`<!-- arc:if -->`), or full placeholder replacement — use a `.template.md`
suffix. The suffix is stripped at init time: `ROADMAP.template.md` becomes `ROADMAP.md`,
`AGENT-BRIEF.PROJECT.template.md` becomes `AGENT-BRIEF.PROJECT.md`.

The suffix marks render-engine input, not classification. Both Configurable and Scaffolded files
can carry it — the common trait is that the source file contains placeholders that produce a
different output file. Configurable files that ship as functional content and are customized in
place (e.g., `DEV-RULES.PROJECT.md`, `STRATEGY-INDEX.md`, `system/methods/commit-format.md`) don't use the suffix
because no rendering transformation occurs — they're copied as-is during init and edited directly
by adopters.

The `template-` *prefix* (in `reference/templates/`) is different — those are copy-ready document
templates used during work (e.g., `template-prd.md` is copied when creating a new PRD). They keep
the prefix in use, not just at init time.

### Workflow numbering

Core pipeline workflows are numbered to indicate execution sequence:

- `1_create-prd.md` → `2_generate-tasks.md` → `3_process-task-loop.md`

Setup workflows use zero-padded numbers: `01_verify-and-configure.md`, `02_define-project.md`,
`03_configure-external-integration.md`.

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

## Related Documentation

- [Configurability Architecture Strategy][config-arch] — Customization mechanisms and adopter guidance
- [Work Organization Strategy](strategy-work-organization.md) — Directory structure, work categories
- [DEV-RULES.PROJECT](../../constitution/DEV-RULES.PROJECT.md) — Project quality standards

---

[config-arch]: strategy-configurability-architecture.md
[config-arch-which]: strategy-configurability-architecture.md#which-mechanism-do-i-use
