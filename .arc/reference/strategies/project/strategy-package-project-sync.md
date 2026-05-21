# Strategy: Package-Project Sync

**Purpose:** Document the two-copy architecture, edit flow rules, and safeguards that prevent
content drift between the package source (`packages/arc-framework/arc/`) and the project
instance (`.arc/`). Project-level strategy — not shipped to adopters.

**Scope:** Files under `.arc/reference/` and `.arc/system/` that have counterparts in the
package source. Does not apply to `active/`, `backlog/`, `user/`, or `completed/` —
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

**Configurable file sync — never `cp`.** Schema, key, or comment changes that need to land in
both copies of a Configurable file must be applied with targeted edits, not `cp`. Configurable
files diverge by design: the package source carries template defaults; the `.arc/` instance
carries this project's overrides. A blind `cp` from package to instance silently regresses
every project-specific value (`branch.protection`, interlock policies, `hooks.*_patterns`
extensions, etc.).

**To propagate a schema change correctly:**

1. Edit the package source first (the change ships to adopters via `arc update`).
2. Edit `.arc/` separately with the same diff, preserving the project-specific lines untouched.
3. Verify with `diff <package-copy> <instance-copy>` — the remaining diff should show only
   project overrides, never schema, key, or comment differences.

The `cp` shortcut is the highest-frequency failure mode for Configurable files. The pre-commit
hook (see Safeguards) catches it at staging time, but the blast already touched the working
tree by then. Use targeted edits from the start.

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
| `AGENT-BRIEF.PROJECT.template.md`    | Token substitution only       |

**Editing template files:** When editing a workflow that has a `.template.md` counterpart,
edit the template in the package source. The `.arc/` rendered copy reflects this project's
config (`team.mode: false`, `pm.mode: arc-in-git`) — conditional blocks for other modes are
absent. Don't copy `.arc/` content back to the template without re-adding the conditionals.

**Remaining 6 templates** (ROADMAP, backlogs, PROJECT-PRD,
TECHNICAL-OVERVIEW, QUICK-REFERENCE) are Scaffolded or Configurable — project-owned content,
no sync concern.

## Safeguards

### Pre-commit hook (automated)

`scripts/check-package-sync.sh` runs via `.husky/pre-commit` after the ARC hook. Two checks,
each scoped by `manifest.json` classification:

1. **Framework wrong-direction** (warning): a Framework file is staged in `.arc/` without its
   package-source counterpart also staged.
2. **Configurable blind-`cp`** (error, blocks commit): a Configurable file is staged
   byte-identical to its package-source counterpart after diverging at HEAD. This is the
   `cp pkg/<f> .arc/<f>` signature — staged content matches package, but HEAD content didn't,
   so the commit just wiped project-specific overrides. Files already byte-identical at HEAD
   (project inherits the template default for that file) don't trigger.

**What it catches:**

- Wrong-direction edits to Framework files (editing `.arc/` instead of package source).
- Blind `cp` of Configurable files from package source to `.arc/` (clobbers project overrides).

**What it can't catch:**

- Editing package source without syncing to `.arc/` (reverse direction — less dangerous,
  caught on next `arc update` self-test).
- Section-level drift within Configurable files where the file remains non-identical to the
  package source (too nuanced for byte-equality).
- Manual `cp` then manual partial-edit that leaves the file non-identical but still missing
  some overrides. Same nuance gap as the previous bullet — discipline > tooling here.

### DEV-RULES.PROJECT guard (session-loaded)

A short section in DEV-RULES.PROJECT reminds every session that methodology edits go through
package source. Points here for the full architecture.

### Hook separation pattern

Dev-only checks live in the husky layer (`.husky/pre-commit` → `scripts/*.sh`), not in the
ARC pre-commit hook (`.arc/system/.internal/githooks/pre-commit`). The ARC hook is a Framework file
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
- `system/rules/DEV-RULES.ARC.md`
- `system/rules/README.md`
- `reference/strategies/README.md`
- `reference/supplemental/analysis/README.md`
- `reference/supplemental/research/README.md`
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
- `reference/templates/template-contributing.md`
- `reference/templates/template-plan.md`
- `reference/templates/template-prd.md`

**System:**

- `system/README.md`
- `reference/briefs/AGENT-BRIEF.ARC.md`
- `reference/briefs/AGENT-BRIEF.CONTRIBUTOR.md`
- `reference/briefs/README.md`
- `system/.internal/githooks/README.md`
- `system/.internal/githooks/commit-msg`
- `system/.internal/githooks/pre-commit`
- `system/.internal/scripts/README.md`
- `system/.internal/scripts/arc-lib.sh`
- `system/.internal/skills/README.md`
- `system/.internal/skills/arc-commit/SKILL.md`
- `system/.internal/skills/arc-handoff/SKILL.md`
- `system/.internal/skills/arc-plan/SKILL.md`
- `system/.internal/skills/arc-resume/SKILL.md`
- `system/.internal/skills/arc-setup/SKILL.md`
- `system/.internal/skills/arc-task-audit/SKILL.md`
- `system/.internal/skills/arc-task-review/SKILL.md`
- `system/.internal/skills/arc-verify/SKILL.md`
- `system/workflows/arc/1_create-prd.md`
- `system/workflows/arc/initial-setup/01_verify-and-configure.md`
- `system/workflows/arc/session-lifecycle/session-loop.md`
- `system/workflows/arc/supplemental/add-agent.md`
- `system/workflows/arc/supplemental/clean-work-unit.md`
- `system/workflows/arc/supplemental/integrate-external-content.md`
- `system/workflows/arc/supplemental/maintain-project-docs.md`
- `system/workflows/arc/supplemental/manage-incidental-work.md`
- `system/workflows/arc/supplemental/prepare-commits.md`
- `system/workflows/arc/supplemental/verify-arc-integrity.md`
- `system/workflows/arc/work-unit-lifecycle/activate-work-unit.md`
- `system/workflows/arc/work-unit-lifecycle/archive-work-unit.md`
- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md`
- `system/workflows/arc/work-unit-lifecycle/planning/init-work-unit.md`
- `system/workflows/arc/work-unit-lifecycle/verify-work-unit.md`
- `system/workflows/project/README.md`
- `user/README.md`

### Configurable files (project sections expected to differ) — 25

- `completed/README.md`
- `system/rules/DEV-RULES.PROJECT.md`
- `reference/QUICK-REFERENCE.md` · template counterpart
- `reference/strategies/STRATEGY-INDEX.md`
- `reference/briefs/AGENT-BRIEF.PROJECT.md` · template counterpart
- `system/arc-config.yml`
- `system/extensions/post-context-load.md`
- `system/extensions/post-task-completion.md`
- `system/extensions/post-task-quality.md`
- `system/extensions/post-unit-quality.md`
- `system/extensions/post-work-unit-activate.md`
- `system/extensions/post-work-unit-archive.md`
- `system/extensions/pre-activation.md`
- `system/extensions/pre-commit-review.md`
- `system/extensions/pre-merge-review.md`
- `system/extensions/pre-pr-review.md`
- `system/extensions/pre-push-review.md`
- `system/methods/commit-footer.md`
- `system/methods/commit-format.md`
- `system/methods/diff-review.md`
- `system/methods/issue-triage.md`
- `system/methods/quality-gate-commands.md`
- `system/methods/review-triage.md`
- `system/methods/session-state.md`
- `system/methods/test-first.md`

### Package-only files (not in `.arc/` — expected)

**Conditionally installed** (`pm.mode: external` only):

- `system/workflows/arc/initial-setup/03_configure-external-integration.md`

### Template counterparts (package `.template.md` → `.arc/` `.md`)

- `backlog/ROADMAP.template.md` → `backlog/ROADMAP.md` (Scaffolded · arc-in-git)
- `backlog/BACKLOG-INBOX.template.md` → `backlog/BACKLOG-INBOX.md` (Scaffolded · arc-in-git)
- `reference/PROJECT-PRD.template.md` → `reference/PROJECT-PRD.md` (Scaffolded)
- `reference/QUICK-REFERENCE.template.md` → `reference/QUICK-REFERENCE.md` (Configurable)
- `reference/TECHNICAL-OVERVIEW.template.md` → `reference/TECHNICAL-OVERVIEW.md` (Scaffolded)
- `reference/briefs/AGENT-BRIEF.PROJECT.template.md` → `reference/briefs/AGENT-BRIEF.PROJECT.md` (Configurable)
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
