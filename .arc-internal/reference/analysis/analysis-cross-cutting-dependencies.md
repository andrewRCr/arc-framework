# Analysis: Cross-Cutting Dependencies

## Purpose

Reference map of concepts that span multiple files in the ARC framework. Each concept has an
authoritative source and a set of files that consume, enforce, or branch on it. Use this map
when assessing blast radius of changes, planning CLI tooling (WU3), or tracing how a concept
propagates through the system.

**Audience:** Framework developers and CLI tooling authors.

## How to Use

- **Before changing a concept:** Find it in this map and check all consuming files
- **Before adding a new cross-cutting concept:** Add it here so future changes are traceable
- **Blast radius column:** Estimates how many files need updating if the concept's shape changes.
  "Low" = 1-3 consumers, "Medium" = 4-7, "High" = 8+

---

## Concept Map

### 1. File Classifications

**Authority:** `strategy-file-classification.md`\
**Blast Radius:** Medium

The classification taxonomy (Framework, Configurable, Scaffolded, Project-Owned) and the
orthogonal layer system (Core, arc-in-git) govern merge behavior, installation scope, and
update strategy.

| Consumer | What It References | Role |
| --- | --- | --- |
| `STRATEGY-INDEX.md` | Prefix naming rationale | Links to § Why Prefixes Matter |
| `strategies/README.md` | `strategy-` prefix convention | Explains naming rationale |
| `arc-config.yml` (template) | Self-declares as Configurable | Header comment |
| `arc-methods.md` | Self-declares as Configurable | Header comment |
| `arc-extensions.md` | Self-declares as Configurable | Header comment |
| `strategy-configurability-architecture.md` | Full taxonomy + layer model | Consumer and contributor |
| `session-init.md` | Reading strategy per classification | Reads-in-full vs on-demand |
| ADR-008, ADR-009 | Layer architecture decisions | Architectural foundation |

**WU3 relevance:** CLI tooling needs the file inventory (classification + layer) to know which
files to install per `pm.mode` and how to handle updates (overwrite vs three-way merge vs skip).

---

### 2. Configuration Settings (`arc-config.yml`)

**Authority:** `arc-config.yml` (template in `.arc/system/`, internal in `.arc-internal/system/`)\
**Blast Radius:** High (collectively)

Twelve config keys with varying reach. The table below shows only keys with 5+ consumers —
the full set is in arc-config.yml inline comments.

| Config Key | Consumers | Enforcement | Blast Radius |
| --- | --- | --- | --- |
| `pm.mode` | 14 files | Agent reads at session-init and workflow branch points | High |
| `branch.protection` | 10 files | `pre-commit` githook + workflow conditionals | High |
| `merge.strategy` | 11 files | Agent reads during integration workflows | High |
| `commit.format` | 10 files | `commit-msg` githook | High |
| `commit.context_footer` | 8 files | `commit-msg` githook | Medium |
| `hooks.commit_msg` | 7 files | `commit-msg` githook (self-gating) | Medium |
| `branch.base` | 7 files | `pre-commit` githook + workflow references | Medium |
| `platform.type` | 5 files | Agent reads for CLI command selection | Low |

**Enforcement pattern:** Githooks read config at runtime via `arc_config_get`. Workflows
document behavior. Strategies explain design rationale. Methods define overridable defaults.

**Key coupling:** `commit.format` and `commit.context_footer` are consumed together by the
`commit-msg` hook and by `arc-methods.md` (commit-format, commit-context-format methods).

---

### 3. Method References (`arc-methods.md`)

**Authority:** `arc-methods.md`\
**Blast Radius:** Medium

Eight configurable methods. Each follows a consistent pattern: DEV-RULES.ARC defines the rule,
a specific workflow invokes the method, and `strategy-configurability-architecture.md` documents
the override path.

| Method | Invoking Workflow | Rule Source | Other Consumers |
| --- | --- | --- | --- |
| `commit-format` | `prepare-commits.md` | DEV-RULES.ARC § Commit format | `arc-commit` SKILL |
| `commit-context-format` | `prepare-commits.md` | DEV-RULES.ARC § Commit format | `arc-commit` SKILL |
| `leave-it-cleaner` | `3_process-task-loop.md` | DEV-RULES.ARC § Leave it cleaner | — |
| `test-first` | `3_process-task-loop.md` | DEV-RULES.ARC § Test-first | `2_generate-tasks.md`, `manage-incidental-work.md` |
| `session-state` | `session-init.md`, `session-handoff.md` | DEV-RULES.ARC § Session state | Templates, `integrate-external-content.md` |
| `pre-merge-review` | `integrate-work-unit.md` | — | `arc-extensions.md`, `arc-config.yml` (gated) |
| `review-triage` | `integrate-work-unit.md` | — | `arc-extensions.md` |
| `quality-gate-commands` | `3_process-task-loop.md` | DEV-RULES.PROJECT § Quality Gates | — |

**Override coupling** (from arc-methods.md § Method Dependencies):

- `commit-format` ↔ `commit-context-format` — both govern commit messages
- `pre-merge-review` → `review-triage` — review uses triage for finding classification

---

### 4. Session State Model

**Authority:** `arc-methods.md` § session-state (contract), `session-init.md` / `session-handoff.md`
(implementation)\
**Blast Radius:** Medium

Two files with different update triggers:

- **WORK-STATUS.md** (tracked) — updated at commit time and session handoff
- **SESSION-NOTES.md** (gitignored) — written only at session handoff

| File | Interaction | What It Does |
| --- | --- | --- |
| `session-init.md` | Reads both | Loads project state + personal context at session start |
| `session-handoff.md` | Writes both | Captures state at session end |
| `activate-work-unit.md` | Writes WORK-STATUS | Transitions to active work unit |
| `archive-work-unit.md` | Writes WORK-STATUS | Resets to "no active work" defaults |
| `3_process-task-loop.md` | References WORK-STATUS | Commit-time update rule (stage with task commits) |
| `prepare-commits.md` | Reads SESSION-NOTES | Uses for uncommitted work context |
| DEV-RULES.ARC | Defines rule | § Work status accuracy — must update at commit time |
| ADR-007 | Defines architecture | Two-file split, git notes portability, team mode |
| `strategy-team-coordination.md` | Documents adaptation | Team paths: `team/{name}/SESSION-NOTES.md` |

**Lifecycle flow:** init reads → task loop references → handoff writes. WORK-STATUS is the
primary state mechanism; SESSION-NOTES is supplemental context that may not exist.

---

### 5. PM Mode Conditionals (`pm.mode`)

**Authority:** `arc-config.yml` → `pm.mode`\
**Blast Radius:** High

The most complex cross-cutting concept. Three values (`none`, `arc-in-git`, `external`) that
change artifact locations, workflow steps, and which files are installed.

#### Workflows with conditional logic

| Workflow | What Changes by Mode |
| --- | --- |
| `session-init.md` § Step 5 | Discovery path: ROADMAP + backlog (arc-in-git) vs `active/` check (none/external) |
| `1_create-prd.md` § Steps 1, 4 | Plan lookup and PRD save location |
| `2_generate-tasks.md` § Step 4 | Task list save location |
| `activate-work-unit.md` § Steps 1, 3, 7 | File move from backlog (arc-in-git) vs skip (none/external) |
| `02_define-project.md` § Steps 4-5 | ROADMAP and PROJECT-STATUS creation (arc-in-git only) |
| `archive-work-unit.md` § Step 5 | Next Action guidance text |

#### Strategies with mode-specific content

| Strategy | Mode Dependency |
| --- | --- |
| `strategy-backlog-organization.md` | Entire strategy is arc-in-git only |
| `strategy-work-planning.md` | Core concepts + arc-in-git extensions (split content) |
| `strategy-file-classification.md` | Layer column marks files as Core or arc-in-git |
| `strategy-team-coordination.md` | ATOMIC-TASKS.md file requires arc-in-git |
| `STRATEGY-INDEX.md` | Marks strategies with **(arc-in-git)** tag |

#### arc-in-git exclusive artifacts

ROADMAP.md, PROJECT-STATUS.md, ATOMIC-TASKS.md (standalone file), BACKLOG-FEATURE.md,
BACKLOG-TECHNICAL.md, `strategy-backlog-organization.md`, backlog directory structure.

**none vs external:** Identical artifact paths. `external` differs only in extension-point
behavior — `post-task-completion`, `post-work-unit-activate`, and `post-work-unit-archive`
extensions can sync with external trackers.

---

### 6. Branch Protection Mode (`branch.protection`)

**Authority:** `arc-config.yml` → `branch.protection`\
**Blast Radius:** High

Two values (`partial`, `full`) that determine what work requires branches and PRs.

| File | What Changes by Mode |
| --- | --- |
| `pre-commit` githook (both) | `partial` warns, `full` blocks direct base branch commits |
| `strategy-work-organization.md` | Mode definitions, comparison table, choosing guidance |
| `activate-planning-branch.md` | Planning branch mandatory (full) vs optional (partial solo) |
| `1_create-prd.md` | Branch context note — planning branch required (full) vs optional |
| `2_generate-tasks.md` | Branch context note — same pattern as create-prd |
| `activate-work-unit.md` | Prerequisites — how artifacts arrived on base branch |
| `archive-work-unit.md` | Step 0 branch requirement (full) vs direct commit (partial) |
| `integrate-work-unit.md` | Archival routing in Next Step |
| `manage-incidental-work.md` | Branch requirement for all changes under full protection |

**Key behavioral difference:** Under full protection, lifecycle transitions (archival, planning,
activation) all need branches. The natural pattern is batch branches that combine archival
with planning for the next work unit, merged via a single PR.

---

## Maintenance

Update this map when:

- Adding a new cross-cutting concept (new config key, new method, new conditional axis)
- Changing a concept's shape (adding/removing values, changing authority location)
- Discovering that a concept's blast radius has grown beyond what's documented here

This map is descriptive, not prescriptive — it documents what exists so changes can be
assessed. Keep entries factual and current.

---
