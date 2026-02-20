# Notes: Structural Readiness Pass

**Source:** B.3 structural analysis audit (2026-02-19)
**PRD:** `prd-structural-readiness-pass.md` (same directory)

**Purpose:** Reference data for task execution — lookup tables and inventories needed during
implementation. The PRD defines requirements; this doc provides the detail. Deliverables 3, 5-8
from the original audit are captured in the PRD's design decisions and requirements; only the
actively-referenced deliverables are retained here.

**Path convention:** Deliverable 1 section headers reflect the post-restructure directory layout
(decided 2026-02-20): `reference/{agent,workflows,githooks}/` → `system/{agent,githooks}/` and
`system/workflows/{arc,project}/`. File names within tables retain pre-restructure names
(`.example.md` suffixes) — the rename to `.template.md` is a separate Phase 2 change. Deliverable
4 paths use pre-restructure shorthand; apply the same mapping when using for grep verification.

---

## Deliverable 1: File Classification Inventory

Reference for requirement C1 (creating `strategy-file-classification.md`).

**Classification key:**

- **Framework** — ARC methodology. Rarely customized. Updated via three-way merge.
- **Configurable** — Framework structure + project content. Auto-merge, conflicts expected in project sections.
- **Scaffolded** — Created once during init, never touched by updates.
- **Project-owned** — User-created from scratch, never touched by updates.

### Root

| File             | Classification | Mixed Concerns | Notes                                       |
|------------------|----------------|----------------|---------------------------------------------|
| `.arc/README.md` | Framework      | No             | Directory overview. Users rarely customize. |

### active/

| File                                      | Classification       | Mixed Concerns      | Notes                                                                                      |
|-------------------------------------------|----------------------|---------------------|--------------------------------------------------------------------------------------------|
| `ATOMIC-TASKS.example.md`                 | Configurable (light) | Yes — section-level | Framework processing rules (lines 1-26) + user task content (lines 28+). Clean separation. |
| `CURRENT-SESSION.example.md`              | Scaffolded           | No                  | Template structure replaced entirely by user. Session state is project-owned after init.   |
| `{feature,technical,incidental}/.gitkeep` | Scaffolded           | No                  | Directory structure scaffolding.                                                           |

### backlog/

| File                                     | Classification       | Mixed Concerns      | Notes                                                                             |
|------------------------------------------|----------------------|---------------------|-----------------------------------------------------------------------------------|
| `ROADMAP.example.md`                     | Scaffolded           | No                  | All placeholders replaced by user content.                                        |
| `TASK-INBOX.example.md`                  | Configurable (light) | Yes — section-level | Framework processing rules (lines 1-14) + user content (below). Clean separation. |
| `feature/BACKLOG-FEATURE.example.md`     | Scaffolded           | No                  | Template structure replaced entirely.                                             |
| `technical/BACKLOG-TECHNICAL.example.md` | Scaffolded           | No                  | Template structure replaced entirely.                                             |

### reference/

| File                         | Classification | Mixed Concerns         | Notes                                                                                                                           |
|------------------------------|----------------|------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `QUICK-REFERENCE.example.md` | Configurable   | Yes — subsection-level | Framework structure + anti-patterns interspersed with project-specific commands, paths, and runtime. Moderate conflict surface. |

### reference/adr/

| File              | Classification | Mixed Concerns | Notes                                                                    |
|-------------------|----------------|----------------|--------------------------------------------------------------------------|
| `README.md`       | Framework      | No             | ADR conventions. Users don't modify.                                     |
| `adr-template.md` | Framework      | No             | Copy-ready template. Users copy to create ADRs, don't edit the template. |

### system/agent/

| File                              | Classification | Mixed Concerns      | Notes                                                                                                                    |
|-----------------------------------|----------------|---------------------|--------------------------------------------------------------------------------------------------------------------------|
| `AGENTS.example.md`               | Configurable   | Yes — section-level | Framework collaboration principles + project-specific stack/layout/friction points. Section-level separation is clean.   |
| `CLAUDE.example.md`               | Configurable   | Yes — section-level | Framework guidance (context management, deferred review) + project-specific (MCP servers, sub-agents). Clean separation. |
| `GEMINI.example.md`               | Configurable   | Minimal             | Mostly framework guidance with light customization expected.                                                             |
| `WARP.example.md`                 | Configurable   | Minimal             | Mostly framework guidance with light customization expected.                                                             |
| `copilot-instructions.example.md` | Configurable   | Minimal             | Mostly framework guidance with light customization expected.                                                             |
| `README.md`                       | Framework      | No                  | Architecture documentation for agent system.                                                                             |

### reference/archive/

| File                                     | Classification       | Mixed Concerns      | Notes                                                                                   |
|------------------------------------------|----------------------|---------------------|-----------------------------------------------------------------------------------------|
| `README.md`                              | Configurable (light) | Yes — section-level | Framework archive guidance + user-populated "Completed Work" section. Clean separation. |
| `technical/completion-sample.example.md` | Framework            | No                  | Sample completion document. Users copy when creating completion docs.                   |
| `{feature,incidental}/.gitkeep`          | Scaffolded           | No                  | Directory scaffolding.                                                                  |

### reference/constitution/

| File                            | Classification | Mixed Concerns                         | Notes                                                                                                                                                                                                                                                                              |
|---------------------------------|----------------|----------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `DEVELOPMENT-RULES.example.md`  | Configurable   | **Yes — paragraph-level interleaving** | **Highest-impact mixed-concern file.** Framework methodology (commit control, verification, session management, task protocols) interleaved with project-specific content (quality gate commands, testing requirements, architecture rules). See Deliverable 2 for split proposal. |
| `META-PRD.example.md`           | Scaffolded     | No                                     | All content replaced by user.                                                                                                                                                                                                                                                      |
| `PROJECT-STATUS.example.md`     | Scaffolded     | No                                     | All content replaced by user.                                                                                                                                                                                                                                                      |
| `TECHNICAL-OVERVIEW.example.md` | Scaffolded     | No                                     | All content replaced by user.                                                                                                                                                                                                                                                      |

### system/githooks/

| File         | Classification | Mixed Concerns | Notes                                                                    |
|--------------|----------------|----------------|--------------------------------------------------------------------------|
| `README.md`  | Framework      | No             | Hook setup documentation.                                                |
| `commit-msg` | Framework      | No             | Commit validation script. Customization points documented in README.     |
| `pre-commit` | Framework      | No             | Pre-commit validation script. Customization points documented in README. |

### reference/research/

| File        | Classification | Mixed Concerns | Notes                 |
|-------------|----------------|----------------|-----------------------|
| `README.md` | Framework      | No             | Research conventions. |

### reference/strategies/

| File                                   | Classification | Mixed Concerns      | Notes                                                                                           |
|----------------------------------------|----------------|---------------------|-------------------------------------------------------------------------------------------------|
| `README.md`                            | Framework      | No                  | Directory overview.                                                                             |
| `STRATEGY-INDEX.md`                    | Configurable   | Yes — section-level | ARC strategies section (framework) + Project strategies section (user-added). Clean separation. |
| `arc/strategy-adr-methodology.md`      | Framework      | No                  | ARC methodology.                                                                                |
| `arc/strategy-quality-gates.md`        | Framework      | No                  | ARC methodology.                                                                                |
| `arc/strategy-task-list-formatting.md` | Framework      | No                  | ARC methodology.                                                                                |
| `arc/strategy-work-organization.md`    | Framework      | No                  | ARC methodology. Contains 5 concerns (see Deliverable 2).                                       |
| `project/README.md`                    | Framework      | No                  | Guidance for creating project strategies.                                                       |
| `project/style/README.md`              | Framework      | No                  | Guidance for style strategies.                                                                  |

### system/workflows/arc/

| File                     | Classification | Mixed Concerns | Notes |
|--------------------------|----------------|----------------|-------|
| `1_create-prd.md`        | Framework      | No             |       |
| `2_generate-tasks.md`    | Framework      | No             |       |
| `3_process-task-loop.md` | Framework      | No             |       |

### system/workflows/arc/setup/

| File                     | Classification | Mixed Concerns | Notes                                    |
|--------------------------|----------------|----------------|------------------------------------------|
| `define-constitution.md` | Framework      | No             | Renamed from `0_define-constitution.md`. |

### system/workflows/arc/supplemental/

| File                        | Classification | Mixed Concerns | Notes |
|-----------------------------|----------------|----------------|-------|
| `activate-work-unit.md`     | Framework      | No             |       |
| `agent-pre-merge-review.md` | Framework      | No             |       |
| `archive-completed.md`      | Framework      | No             |       |
| `atomic-commit.md`          | Framework      | No             |       |
| `maintain-docs.md`          | Framework      | No             |       |
| `maintain-task-notes.md`    | Framework      | No             |       |
| `manage-incidental-work.md` | Framework      | No             |       |
| `session-handoff.md`        | Framework      | No             |       |
| `session-init.md`           | Framework      | No             |       |
| `weekly-review.md`          | Framework      | No             |       |

### Summary Counts

| Classification | Count           | Examples                                                                                                                       |
|----------------|-----------------|--------------------------------------------------------------------------------------------------------------------------------|
| Framework      | 30              | Workflows, strategies, READMEs, hooks, adr-template                                                                            |
| Configurable   | 10              | DEVELOPMENT-RULES, AGENTS, CLAUDE, QUICK-REFERENCE, STRATEGY-INDEX, ATOMIC-TASKS, TASK-INBOX, archive README, agent tool files |
| Scaffolded     | 11              | CURRENT-SESSION, ROADMAP, META-PRD, PROJECT-STATUS, TECHNICAL-OVERVIEW, backlogs, .gitkeep files                               |
| Project-owned  | 0 (in template) | Project strategies, ADRs, task lists, PRDs are created by users post-init                                                      |

---

## Deliverable 2: Split/Separation Proposals

Reference for requirements A1-A4.

### Proposal A: DEVELOPMENT-RULES — Extract Framework Methodology

**Problem:** DEVELOPMENT-RULES is the highest-impact configurable file. It interleaves framework-universal
methodology with project-specific configuration at the paragraph level. Every framework update to methodology
sections risks merge conflicts with adjacent project-specific content.

**Current content map** (DEVELOPMENT-RULES.example.md, 401 lines):

| Lines   | Content                                             | Classification                                       |
|---------|-----------------------------------------------------|------------------------------------------------------|
| 1-10    | Header metadata (version, hash)                     | Configurable                                         |
| 11-67   | Commit Standards (control, format, atomicity)       | **Framework**                                        |
| 69-106  | Quality Gates (tiered approach + specific commands) | **Mixed** — framework tier policy + project commands |
| 107-114 | Quality Gate Failure Protocol                       | **Framework**                                        |
| 115-139 | Leave It Cleaner Protocol                           | **Framework**                                        |
| 141-148 | Session Documentation Control                       | **Framework**                                        |
| 149-173 | Verification Protocol                               | **Framework**                                        |
| 174-194 | Strategy Document Protocol                          | **Framework**                                        |
| 196-229 | Session Context Management                          | **Framework**                                        |
| 231-251 | Core Document Reference Protocol                    | **Framework**                                        |
| 253-299 | Task Management Protocol + Test-First               | **Framework**                                        |
| 301-309 | Testing Requirements                                | **Configurable**                                     |
| 310-341 | Code Quality Principles + Architecture Rules        | **Mixed** — framework principles + project rules     |
| 343-401 | Architecture Documentation + References             | **Framework** + configurable links                   |

**~230 lines are pure framework methodology.** ~100 lines are project-configurable. ~70 lines are mixed.

**Proposed split:**

**File 1: `strategies/arc/strategy-development-methodology.md`** (Framework — new file, ~230 lines)

Contains all framework-universal operational rules:

- Commit Standards (control rules, message format, atomicity, enforcement)
- Quality Gate Failure Protocol
- Leave It Cleaner Protocol
- Session Documentation Control
- Verification Protocol
- Strategy Document Protocol
- Session Context Management
- Core Document Reference Protocol
- Task Management Protocol (one task at a time, granularity, implied permission)
- Test-First Protocol
- Code Documentation Standards (no meta-project refs, task references, collaborative voice)

**File 2: `constitution/DEVELOPMENT-RULES.example.md`** (Configurable — reduced, ~170 lines)

Contains project-constitutional content that adopters customize:

- Header metadata (version, project name)
- Quality Gates (zero-tolerance policy, tier table with project-specific commands)
- Testing Requirements (project-specific)
- Code Quality Principles (DRY/SOLID/KISS/YAGNI + project architecture subsections)
- Architecture Documentation (ADR section, references)
- Reference Documentation links
- Cross-reference to methodology strategy for framework rules

**Why strategy doc, not workflow?** These rules are behavioral constraints (how to work), not step-by-step
procedures (what to do). They're analogous to quality-gates and work-organization — codified methodology.
A strategy doc is the natural home.

**Impact:**

- Session-init reading list adds one file (the methodology strategy)
- All cross-references from agent files, workflows, etc. that say "see DEVELOPMENT-RULES" need routing
  to the right file
- The commit-msg hook references "DEVELOPMENT-RULES.md" in help text — update to reference methodology
  strategy for format details
- AGENTS.example.md and CLAUDE.example.md reference DEVELOPMENT-RULES — update to reference both files

### Proposal B: strategy-work-organization.md — Extract Backlog Organization

**Problem:** The work organization strategy covers 5 distinct concerns. Backlog Organization (~55 lines,
section 11) is a self-contained concern referenced independently by weekly-review.md.

**Proposed:** Extract to `strategies/arc/strategy-backlog-organization.md`.

Content to extract:

- Structure (directory layout for backlog/)
- Processing Flow (TASK-INBOX → buckets → plan → PRD graduation)
- Key Design Points (no incidental in backlog, ATOMIC-TASKS placement, ROADMAP role)
- Commit Context for Atomic Tasks

**What stays in strategy-work-organization.md:** Work Categories, Decision Rules, Incidental Work Model,
Git Workflow, Directory Structure (for active/ and archive/), Anti-Patterns, Migration Guide.

**Impact:** Low — one new file, update STRATEGY-INDEX.md, update cross-references from weekly-review.md
and ATOMIC-TASKS.example.md.

### No-Split Decisions

**ATOMIC-TASKS.example.md and TASK-INBOX.example.md:** Framework guidance at top, user content below.
Clean section-level separation is sufficient for three-way merge. No split needed.

**Agent tool-specific files (CLAUDE, GEMINI, WARP, copilot):** Section-level separation between framework
guidance and project configuration is adequate. No split needed.

**QUICK-REFERENCE.example.md:** Framework structure interspersed with project commands. The interleaving
is at the subsection level (command sections alternate framework markdown linting with project-specific
linting/testing). Splitting would be over-engineering — the file is already organized by concern (linting,
type checking, testing, quality gates), and users customize within those sections. Three-way merge handles
this adequately.

---

## Deliverable 4: Cross-Cutting Concept Dependency Map

Reference for cross-reference verification during structural moves (B2, C2-C6). Use these tables to
ensure no references are missed when paths change.

### Concept: Work Organization Categories (Feature / Technical / Incidental)

**Canonical definition:** `strategies/arc/strategy-work-organization.md`

| File                                               | How it references                                | Impact if changed            |
|----------------------------------------------------|--------------------------------------------------|------------------------------|
| `.arc/` directory structure                        | `active/{feature,technical,incidental}/`         | Directory rename/restructure |
| `.arc/README.md`                                   | Directory tree shows categories                  | Tree update                  |
| `constitution/DEVELOPMENT-RULES.example.md`        | Commit context categories                        | Context footer format        |
| `workflows/1_create-prd.md`                        | Feature vs technical classification              | Category paths               |
| `workflows/2_generate-tasks.md`                    | Save paths by category                           | File paths                   |
| `workflows/supplemental/activate-work-unit.md`     | Category-based paths throughout                  | Paths, branch naming         |
| `workflows/supplemental/archive-completed.md`      | Archive paths include category                   | Archive directory names      |
| `workflows/supplemental/manage-incidental-work.md` | Full incidental workflow                         | File naming, branch naming   |
| `workflows/supplemental/weekly-review.md`          | Backlog processing by category                   | Bucket file references       |
| `reference/archive/README.md`                      | Archive structure by category                    | Category directory names     |
| `strategies/arc/strategy-work-organization.md`     | Self (canonical)                                 | —                            |
| `strategies/arc/strategy-task-list-formatting.md`  | Incidental header format                         | Template header              |
| `reference/githooks/commit-msg`                    | Task list path validation searches category dirs | Path patterns in hook        |
| `reference/githooks/pre-commit`                    | Task list path validation (Check 6, 7)           | Path patterns in hook        |
| Active/backlog `.gitkeep` files                    | Maintain category directories                    | Directory creation           |

**Blast radius:** **Very high** (15+ files).

### Concept: Quality Gate Tiers (1 / 2 / 3)

**Canonical definition:** `strategies/arc/strategy-quality-gates.md`

| File                                        | How it references                                          | Impact if changed               |
|---------------------------------------------|------------------------------------------------------------|---------------------------------|
| `constitution/DEVELOPMENT-RULES.example.md` | Tier table (lines 76-84), "Commits and quality gates" note | Table update, tier descriptions |
| `workflows/3_process-task-loop.md`          | "Tier 1" (line 26), "Tier 2" (line 74)                     | Tier name references            |
| `workflows/2_generate-tasks.md`             | References strategy for tier guidance                      | Indirect (link only)            |
| `reference/QUICK-REFERENCE.example.md`      | "Tier 1" and "Tier 3" command section headers              | Section naming                  |
| `strategies/arc/strategy-quality-gates.md`  | Self (canonical)                                           | —                               |

**Blast radius:** **Medium** (5 files).

### Concept: Commit Format (Conventional Commits + Context footer)

**Canonical definition:** `constitution/DEVELOPMENT-RULES.example.md` (Commit Message Format section)

| File                                               | How it references            | Impact if changed              |
|----------------------------------------------------|------------------------------|--------------------------------|
| `reference/githooks/commit-msg`                    | Validates format (all rules) | Regex patterns, error messages |
| `reference/githooks/README.md`                     | Documents validation rules   | Rule descriptions              |
| `workflows/supplemental/atomic-commit.md`          | Commit message examples      | Example format                 |
| `workflows/supplemental/archive-completed.md`      | Commit message examples      | Example format                 |
| `workflows/supplemental/activate-work-unit.md`     | Commit message example       | Example format                 |
| `workflows/supplemental/manage-incidental-work.md` | Commit message format        | Example format                 |
| `strategies/arc/strategy-work-organization.md`     | Commit patterns (section 7)  | Examples                       |
| `strategies/arc/strategy-task-list-formatting.md`  | References commit context    | Indirect                       |

**Blast radius:** **Medium-high** (8 files).

### Concept: Task Numbering Convention (X.Y, X.Y.a, X.Y.a.1)

**Canonical definition:** `strategies/arc/strategy-task-list-formatting.md`

| File                               | How it references                     | Impact if changed |
|------------------------------------|---------------------------------------|-------------------|
| `reference/githooks/pre-commit`    | Check 7 validates third-level letters | Regex pattern     |
| `reference/githooks/commit-msg`    | Validates task reference format       | Regex patterns    |
| `workflows/2_generate-tasks.md`    | References formatting strategy        | Indirect (link)   |
| `workflows/3_process-task-loop.md` | "each checkbox" as work unit          | Implicit          |

**Blast radius:** **Medium** (4 files).

### Concept: Session Lifecycle (init → work → handoff)

**Canonical definition:** `workflows/supplemental/session-init.md` + `session-handoff.md`

| File                                        | How it references                  | Impact if changed    |
|---------------------------------------------|------------------------------------|----------------------|
| `constitution/DEVELOPMENT-RULES.example.md` | Session Context Management section | Protocol description |
| `agent/AGENTS.example.md`                   | Collaboration principles           | Session mentions     |
| `agent/CLAUDE.example.md`                   | Context window tied to session     | Threshold protocol   |
| `agent/GEMINI.example.md`                   | Cross-tool handoff                 | Handoff mention      |
| `agent/WARP.example.md`                     | Handoff mention                    | Brief reference      |
| `active/CURRENT-SESSION.example.md`         | The session state document         | Template structure   |
| `workflows/supplemental/maintain-docs.md`   | Session-init reading list          | Document hierarchy   |

**Blast radius:** **Medium** (7 files).

### Concept: Archive Structure (quarterly + sequence-numbered)

**Canonical definition:** `strategies/arc/strategy-work-organization.md` (Directory Structure) +
`reference/archive/README.md`

| File                                          | How it references                  | Impact if changed |
|-----------------------------------------------|------------------------------------|-------------------|
| `workflows/supplemental/archive-completed.md` | Archive execution paths            | Path patterns     |
| `active/ATOMIC-TASKS.example.md`              | Archive path for completed atomics | Path reference    |
| `reference/archive/README.md`                 | Self (co-canonical)                | —                 |
| Backlog templates                             | Archive path references            | Path patterns     |

**Blast radius:** **Low-medium** (4-5 files).

### Concept: File Classification (Framework / Configurable / Scaffolded / Project-owned)

**Canonical definition:** Not yet codified in `.arc/`. Will be created as
`strategies/arc/strategy-file-classification.md` (requirement C1).

**Blast radius:** Currently zero (not yet referenced). After C1, the strategy doc becomes the
canonical source for the CLI update system's merge strategy.
