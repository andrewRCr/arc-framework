# Strategy: Package-Project Sync

**Purpose:** Document the two-copy architecture, edit flow rules, and safeguards that prevent
content drift between the package source (`packages/arc-framework/arc/`) and the project
instance (`.arc/`). Project-level strategy — not shipped to adopters.

**Scope:** Files under `.arc/reference/` and `.arc/system/` that have counterparts in the
package source. Does not apply to `active/`, `backlog/`, `user/`, or `reference/archive/` —
those are project-owned with no package counterparts.

---

## Two-Copy Architecture

This repo has two copies of the ARC framework content:

| Copy                 | Location                      | Role                                                                         |
|----------------------|-------------------------------|------------------------------------------------------------------------------|
| **Package source**   | `packages/arc-framework/arc/` | Authoritative. What adopters receive via `arc init` and `arc update`.        |
| **Project instance** | `.arc/`                       | Rendered output of the package source, plus project-specific customizations. |

The package source is what ships. The project instance is a self-hosted installation — this
project uses ARC to develop ARC. Edits to methodology content must flow through the package
source to reach adopters.

## Edit Flow Rules

Edit direction depends on file classification (per [strategy-file-classification.md][file-class]):

| Classification    | Edit direction    | Rationale                                                                             |
|-------------------|-------------------|---------------------------------------------------------------------------------------|
| **Framework**     | Package → `.arc/` | `.arc/` copy should match package. Edits here are methodology changes that must ship. |
| **Configurable**  | Both (by section) | Framework sections from package; project-specific sections in `.arc/` only.           |
| **Scaffolded**    | `.arc/` only      | Project-owned after init. Package has template, `.arc/` has rendered content.         |
| **Project-Owned** | `.arc/` only      | No package counterpart exists.                                                        |

**When uncertain which copy to edit:** Default to package source for anything in `reference/`
or `system/` that isn't clearly project-specific content. Check the manifest
(`.arc/system/.internal/manifest.json`) for classification.

**When `.arc/` has a better version** (intentional edit not propagated): Check `git log` on
both copies to confirm the `.arc/` edit was intentional. Propagate to package source. If
ambiguous, ask.

## Template Counterparts

14 files in the package use a `.template.md` suffix, stripped at init time. 6 of these contain
`<!-- arc:if -->` conditionals resolved during rendering:

| Template file                        | Conditions                    |
|--------------------------------------|-------------------------------|
| `3_process-task-loop.template.md`    | team.mode, pm.mode (3 blocks) |
| `session-init.template.md`           | team.mode, pm.mode (5 blocks) |
| `session-handoff.template.md`        | team.mode (1 block)           |
| `2_generate-tasks.template.md`       | team.mode (2 blocks)          |
| `02_define-project.template.md`      | pm.mode (3 blocks)            |
| `AGENT-BRIEFING.PROJECT.template.md` | Token substitution only       |

**Editing template files:** When editing a workflow that has a `.template.md` counterpart,
edit the template in the package source. The `.arc/` rendered copy reflects this project's
config (`team.mode: false`, `pm.mode: arc-in-git`) — conditional blocks for other modes are
absent. Don't copy `.arc/` content back to the template without re-adding the conditionals.

**Remaining 7 templates** (ROADMAP, backlogs, META-PRD, PROJECT-STATUS,
TECHNICAL-OVERVIEW, QUICK-REFERENCE) are Scaffolded or Configurable — project-owned content,
no sync concern.

## Safeguards

### Pre-commit hook (automated)

`scripts/check-package-sync.sh` runs via `.husky/pre-commit` after the ARC hook. Warns when
Framework files under `.arc/reference/` or `.arc/system/` are staged without their package
counterpart also staged. Uses manifest.json classification to avoid false positives on
Configurable and Scaffolded files.

**What it catches:** Wrong-direction edits to Framework files (editing `.arc/` instead of
package source).

**What it can't catch:** Editing package source without syncing to `.arc/` (reverse direction —
less dangerous, caught on next `arc update` self-test). Framework-section drift within
Configurable files (too nuanced for line-based matching).

### DEV-RULES.PROJECT guard (session-loaded)

A short section in DEV-RULES.PROJECT reminds every session that methodology edits go through
package source. Points here for the full architecture.

### Hook separation pattern

Dev-only checks live in the husky layer (`.husky/pre-commit` → `scripts/*.sh`), not in the
ARC pre-commit hook (`.arc/system/githooks/pre-commit`). The ARC hook is a Framework file
shipped to adopters — only universal checks belong there. This supersedes the prior
`.arc-internal/` dual-hook approach from WU2.

## Documentation Architecture

**Strategy documents** and **ADRs** serve complementary roles in ARC's documentation system:

| Aspect     | Strategy documents                            | ADRs                                       |
|------------|-----------------------------------------------|--------------------------------------------|
| Content    | Synthesized approaches to problem domains     | Specific decisions made at a point in time |
| Style      | "How we think about X"                        | "What we chose for X situation"            |
| Mutability | Updated as understanding evolves              | Immutable once accepted (supersession)     |
| Origin     | Extracted from multiple experiences/decisions | Raw material that can inform strategies    |

Multiple related ADRs may reveal patterns worth extracting into a strategy. This separation
operationalizes a widely-recognized principle: ADRs should remain point-in-time records, not
evolve into prescriptive design guides. See [ADR Methodology Strategy][adr-methodology] for
the full ADR lifecycle.

## File Inventory and Dependency Map

Consolidated listing of all `.arc/` template files with classification, layer, and sync
status. Paths relative to their respective roots (`.arc/` or `packages/arc-framework/arc/`).

**Classification** determines update behavior (see [File Classification Strategy][file-class]
for taxonomy definitions). **Layer** indicates which framework layer owns the file: **Core**
(always installed) or **arc-in-git** (`pm.mode: arc-in-git` only). Most files are Core;
arc-in-git files are annotated explicitly.

### Framework files (must match between copies)

**Reference:**

- `README.md` (root)
- `reference/adr/README.md`
- `reference/analysis/README.md`
- `reference/constitution/DEV-RULES.ARC.md`
- `reference/constitution/README.md`
- `reference/research/README.md`
- `reference/strategies/README.md`
- `reference/strategies/arc/strategy-adr-methodology.md`
- `reference/strategies/arc/strategy-configurability-architecture.md`
- `reference/strategies/arc/strategy-file-classification.md`
- `reference/strategies/arc/strategy-planning-module.md` · arc-in-git
- `reference/strategies/arc/strategy-quality-gates.md`
- `reference/strategies/arc/strategy-session-operations.md`
- `reference/strategies/arc/strategy-task-list-formatting.md`
- `reference/strategies/arc/strategy-team-coordination.md`
- `reference/strategies/arc/strategy-work-organization.md`
- `reference/strategies/arc/strategy-work-planning.md`
- `reference/strategies/project/README.md`
- `reference/strategies/project/style/README.md`
- `reference/templates/template-adr.md`
- `reference/templates/template-agent.md`
- `reference/templates/template-completion-doc.md`
- `reference/templates/template-contributing.md`
- `reference/templates/template-plan.md`
- `reference/templates/template-prd.md`

**System:**

- `system/README.md`
- `system/agent/AGENT-BRIEFING.ARC.md`
- `system/agent/AGENT-BRIEFING.CONTRIBUTOR.md`
- `system/agent/README.md`
- `system/githooks/README.md`
- `system/githooks/commit-msg`
- `system/githooks/pre-commit`
- `system/scripts/README.md`
- `system/scripts/arc-lib.sh`
- `system/skills/README.md`
- `system/skills/arc-commit/SKILL.md`
- `system/skills/arc-handoff/SKILL.md`
- `system/skills/arc-plan/SKILL.md`
- `system/skills/arc-resume/SKILL.md`
- `system/skills/arc-setup/SKILL.md`
- `system/skills/arc-task-audit/SKILL.md`
- `system/skills/arc-task-review/SKILL.md`
- `system/skills/arc-verify/SKILL.md`
- `system/workflows/arc/1_create-prd.md`
- `system/workflows/arc/initial-setup/01_verify-and-configure.md`
- `system/workflows/arc/session-lifecycle/session-loop.md`
- `system/workflows/arc/supplemental/add-agent.md`
- `system/workflows/arc/supplemental/integrate-external-content.md`
- `system/workflows/arc/supplemental/maintain-project-docs.md`
- `system/workflows/arc/supplemental/manage-incidental-work.md`
- `system/workflows/arc/supplemental/prepare-commits.md`
- `system/workflows/arc/supplemental/verify-arc-integrity.md`
- `system/workflows/arc/work-unit-lifecycle/activate-work-unit.md`
- `system/workflows/arc/work-unit-lifecycle/archive-work-unit.md`
- `system/workflows/arc/work-unit-lifecycle/clean-work-unit.md`
- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md`
- `system/workflows/arc/work-unit-lifecycle/planning/activate-planning-branch.md`
- `system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md`
- `system/workflows/arc/work-unit-lifecycle/rotate-branch.md`
- `system/workflows/arc/work-unit-lifecycle/verify-work-unit.md`
- `system/workflows/project/README.md`
- `user/README.md`

### Configurable files (project sections expected to differ)

- `reference/archive/README.md`
- `reference/constitution/DEV-RULES.PROJECT.md`
- `reference/QUICK-REFERENCE.md` · template counterpart
- `reference/strategies/STRATEGY-INDEX.md`
- `system/agent/AGENT-BRIEFING.PROJECT.md` · template counterpart
- `system/agent/CLAUDE.ARC.md`
- `system/agent/CODEX.ARC.md`
- `system/arc-config.yml`
- `system/workflows/arc-extensions.md`
- `system/workflows/arc-methods.md`

### Package-only files (not in `.arc/` — expected)

**Init-selected agent files** (this project selected Claude + Codex):

- `system/agent/COPILOT.ARC.md`
- `system/agent/CURSOR.ARC.md`
- `system/agent/GEMINI.ARC.md`
- `system/agent/WARP.ARC.md`
- `system/agent/WINDSURF.ARC.md`

**Conditionally installed** (`pm.mode: external` only):

- `system/workflows/arc/initial-setup/03_configure-external-integration.md`

### Template counterparts (package `.template.md` → `.arc/` `.md`)

- `backlog/ROADMAP.template.md` → `backlog/ROADMAP.md` (Scaffolded · arc-in-git)
- `backlog/feature/BACKLOG-FEATURE.template.md` → `backlog/feature/BACKLOG-FEATURE.md` (Scaffolded · arc-in-git)
- `backlog/technical/BACKLOG-TECHNICAL.template.md` → `backlog/technical/BACKLOG-TECHNICAL.md` (Scaffolded · arc-in-git)
- `reference/META-PRD.template.md` → `reference/META-PRD.md` (Scaffolded)
- `reference/PROJECT-STATUS.template.md` → `reference/PROJECT-STATUS.md` (Scaffolded · arc-in-git)
- `reference/QUICK-REFERENCE.template.md` → `reference/QUICK-REFERENCE.md` (Configurable)
- `reference/TECHNICAL-OVERVIEW.template.md` → `reference/TECHNICAL-OVERVIEW.md` (Scaffolded)
- `system/agent/AGENT-BRIEFING.PROJECT.template.md` → `system/agent/AGENT-BRIEFING.PROJECT.md` (Configurable)
- `system/workflows/arc/2_generate-tasks.template.md` → `system/workflows/arc/2_generate-tasks.md` (Framework)
- `system/workflows/arc/3_process-task-loop.template.md` → `system/workflows/arc/3_process-task-loop.md` (Framework)
- `system/workflows/arc/initial-setup/02_define-project.template.md` →
  `system/workflows/arc/initial-setup/02_define-project.md` (Framework)
- `system/workflows/arc/session-lifecycle/session-handoff.template.md` →
  `system/workflows/arc/session-lifecycle/session-handoff.md` (Framework)
- `system/workflows/arc/session-lifecycle/session-init.template.md` →
  `system/workflows/arc/session-lifecycle/session-init.md` (Framework)

### Summary

| Classification | Count | Update Behavior                                       |
|----------------|-------|-------------------------------------------------------|
| Framework      | 67    | Wholesale replaced. No conflicts.                     |
| Configurable   | 15    | Three-way merge. Conflicts expected in user sections. |
| Scaffolded     | 7     | Skip. Project-owned after init.                       |
| Project-owned  | 0     | Ignore. User-created, not in template.                |

**Total template files:** 89.

*`DEV-RULES.{DOMAIN}.md` is a naming convention for adopter-created files and is not counted.*

---

[file-class]: ../arc/strategy-file-classification.md
[adr-methodology]: ../arc/strategy-adr-methodology.md
