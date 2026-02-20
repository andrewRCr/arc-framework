# Plan: Structural Analysis Pass

**Roadmap Reference:** Phase B.3 — Structural analysis pass
**Predecessor:** `tasks-content-refinement-pass.md` (B.2 — content is now clean; evaluate structure)
**Related:** `feature/plan-distribution-and-update-system.md` (structural decisions feed the manifest/update system)

**Purpose:** Audit all `.arc/` files for structural soundness and distribution readiness. Classify files,
identify mixed-concern interleaving, map cross-cutting concept dependencies, and propose section-level
separation to minimize merge conflicts during updates. Results become a focused PRD + task list for the
combined B.3+B.4 structural optimization work.

---

## Scoping Decisions

Resolved during planning (2026-02-19). Updated post-audit with design decisions from analysis
discussion (2026-02-19).

### Combined work unit (B.3 audit → B.4 execution)

The audit (B.3) and structural optimization (B.4) will produce a single PRD + task list. The audit is
a token-heavy analysis session run from a prepared prompt; its results feed directly into PRD creation.
The roadmap B.3/B.4 distinction reflects sequencing (analyze, then execute), not separate work units.

### Concern clusters — what the post-audit work unit covers

**Full execution (A+B+C):**

- **A: File-level restructuring** — Split DEVELOPMENT-RULES (confirmed: ~230 lines framework methodology
  → `strategies/arc/strategy-development-methodology.md`, ~170 lines project content stays). Extract
  backlog organization from strategy-work-organization.md (~55 lines →
  `strategies/arc/strategy-backlog-organization.md`). No splits needed for QUICK-REFERENCE, agent files,
  ATOMIC-TASKS, TASK-INBOX (audit confirmed clean section-level separation is sufficient).
- **B: Directory/naming/metadata** — Extract `system/` from `reference/` (agent/, workflows/, githooks/,
  future commands/). Rename `.example.md` → `.template.md` (16 files). Remove maintain-docs.md version
  footer. Reframe DEVELOPMENT-RULES version header as project rule evolution tracking. Add `team/`
  directory template for team mode.
- **C: Cross-cutting concept management** — Dependency map complete (7 concepts mapped with blast
  radius). Create `strategy-file-classification.md` as canonical home for file classification taxonomy.
  Deduplicate DEVELOPMENT-RULES tier table to summary with cross-reference. Decouple branch-to-task-list
  1:1 rule — update strategy-work-organization.md, activate-work-unit.md, archive-completed.md, and
  template headers to reflect many-to-one model (branches serve task lists, not the reverse).

**First pass (D+F):**

- **D: Workflow/coverage gaps** — Establish placement and rough shape for convention definitions,
  onboarding skeleton (`getting-started.md`), workflow gap fixes (ROADMAP in define-constitution,
  audience indicators). Explicitly not-final — polish deferred until CLI work clarifies actual
  onboarding needs.
- **F: Team adaptation guidance** — Document team coordination conventions: task ownership markers
  (`@name`), team branching patterns (shared integration branch, personal sub-branches, stacked PRs),
  integration point acknowledgment for external trackers (Jira, Linear, GitHub Issues). First-pass
  content — refined when actual team usage provides feedback.

**Deferred:**

- **D polish** — Post-CLI, when onboarding needs are concrete
- **E: Slash command dedup** — Phase C (CLI), needs generation script

### Open questions resolved

1. **Scope boundary:** Combined — distribution-readiness structure AND broader concerns (workflow
   gaps, conventions, team readiness), with broader concerns scoped to first-pass placement only.
2. **DEVELOPMENT-RULES split:** Confirmed by audit. ~230 lines framework methodology →
   strategy doc. ~170 lines project content stays in DEVELOPMENT-RULES.
3. **Directory restructuring:** Decided. `reference/` splits into `reference/` (knowledge) +
   `system/` (ARC operational machinery). Not just githooks extraction — agent/, workflows/, and
   githooks/ all move to `system/`.
4. **Naming convention timing:** Part of this work unit (Cluster B), not deferred to CLI.
5. **Branch-task list coupling:** Reworked. 1:1 "Key rule" replaced with many-to-one model. Task
   lists are the unit of work; branches are the unit of delivery. Archive triggers on task
   completion, not branch deletion.
6. **Team workspace model:** Communal `active/` (shared task lists, PRDs) + personal `team/`
   (per-developer session state, atomic tasks). Solo mode keeps current structure; team mode
   adds `team/` top-level directory.
7. **constitution/ naming:** Retained. The DEVELOPMENT-RULES split strengthens the grouping —
   post-split, constitution/ holds genuinely constitutional project governance documents.
8. **Header metadata convention:** Resolved — no new convention needed. Manifest handles framework
   versioning. DEVELOPMENT-RULES keeps its version header for project rule evolution tracking.

---

## Observations from B.2 Refinement Pass

Gathered during Phases 1-5 of `tasks-content-refinement-pass.md`. Organized by concern area.
These observations fed the audit prompt and are retained here as reasoning-chain context.

### File-Level Mixed Concerns

Files containing multiple distinct topics that may benefit from separation.

**DEVELOPMENT-RULES.example.md** — ARC-opinionated operational content (session management, verification
protocol, core document reference protocol) mixed with genuinely project-constitutional content (quality
gates, code quality principles, architecture rules, commit standards). Some sections may be better served
closer to workflows or as separate concerns. Key question: what in DEVELOPMENT-RULES is framework
methodology vs. what is the adopter's project constitution?

**strategy-work-organization.md** — Covers 5 distinct concerns in one file: work categorization, git
workflow (branching model), directory structure, incidental work model, and backlog organization.

- Backlog Organization (~55 lines after B.2 trimming) is essentially a separate strategy embedded in
  the doc — candidate for extraction.
- Incidental Work Model (~85 lines) straddles strategy and workflow territory.

### Directory-Level Mixed Concerns

**`.arc/reference/` mixes documentation with infrastructure.** Constitution, workflows, and strategies
are project reference material. Githooks, agent configs, and future additions (commands/, source-of-truth
mechanisms) are tooling ARC provides. These are different concerns — infrastructure is operational tooling,
not reference documentation. Candidate for top-level separation (e.g., `.arc/infrastructure/`), but
balance against directory bloat and adoption complexity.

### Cross-Cutting Concept Management

**Slash command content duplication.** `.claude/commands/`, `.codex/prompts/`, `.gemini/commands/` contain
duplicated content across agent-specific directories. Needs single source of truth + generation script.
Natural fit for the distribution CLI. Source could live in `.arc/` (commands/ or infrastructure/commands/).
**Deferred to Phase C (Cluster E).**

**Version footers.** Being removed during B.2 — the update system will handle versioning via manifest.
Structural pass should verify all version footers are gone and that no versioning mechanism is needed
in-file.

**`.example.md` naming convention.** Files are evolving from "filled-in examples" (old CineXplorer content)
to "templates with guidance scaffolding" (structure + guidance + tokens). `.template.md` may be more
accurate. Separately-provided filled-in examples (in package/docs, not install directory) could help
adopters see what a mature document looks like. (Also captured in BACKLOG-TECHNICAL.md.)

### Metadata and Convention Inconsistencies

**Header metadata convention gap.** PRDs and task lists have a consistent header metadata pattern
(Created, Updated, Status, Branch, etc.). Workflow and strategy docs lack any equivalent convention.
Inconsistency to evaluate — does a convention add value here, or is it unnecessary ceremony?

**Footer vs. header versioning.** Workflow docs historically used footer-style version stamps while
PRDs/task lists use header metadata. Moot once version footers are fully removed, but the structural
pass should establish whether any per-file metadata convention replaces them (likely: manifest handles
this externally).

### Workflow Coverage Gaps

**ROADMAP.md not covered by `0_define-constitution.md`.** The define-constitution workflow only covers
PROJECT-STATUS setup. ROADMAP is a planning artifact that currently has no creation workflow. Needs
either a broader "project bootstrap" workflow or explicit coverage in define-constitution.

**Working directory context management.** Currently addressed in session-handoff.md, but may belong
in CURRENT-SESSION template guidance instead — the template is where adopters set up their working
context, not the handoff workflow.

### Adoption and Onboarding Gaps

**File placement and loading model.** ARC manages agent config loading via session-init rather than
relying on tool auto-discovery. This is documented in `agent/README.md` but not in any onboarding
material. First-time adopters need to understand this design choice.

**Audience indicator convention.** Deferred from B.2 Task 1.1 — some documents serve dual audiences
(human contributors + AI agents). A lightweight convention for indicating primary audience could help
adopters understand which docs to customize vs. which to leave as-is. Structural concern, not content.

### Team Adaptation Concerns

**Added 2026-02-19.** The framework was built entirely in a solo-dev context. Structural decisions
made now either enable or block team adaptation later. The audit should evaluate friction points and
blockers — not to solve team usage, but to ensure restructuring doesn't make it harder.

**Core model clarification:** The single-threaded task execution model (one task at a time, mandatory
stop for review) is correct *per human-agent pair* — it reflects that a human can't multi-thread
attention. This model doesn't conflict with team usage. The friction is that current file structures
and workflows assume only one such pair exists.

**Known friction areas:**

- **Session state is singleton.** CURRENT-SESSION.md assumes one developer-agent pair. Team usage
  needs per-developer session scoping. Structural question: does the directory layout support
  multiple concurrent sessions without breaking workflows?
- **Task list coordination.** Multiple developer-agent pairs working from one task list need
  ownership/assignment conventions. Multiple concurrent task lists need coordination patterns.
  The single-threaded model is fine per-pair; the gap is multi-pair awareness.
- **ATOMIC-TASKS is a single shared file.** Concurrent edits from multiple devs = merge conflicts.
  May need per-developer splitting.
- **Branch-to-task-list coupling is 1:1.** Current convention: one branch ↔ one task list in active/.
  Team usage might need multiple devs on one branch, or parallel branches for one work unit.
- **Workflows assume sole occupancy.** session-init loads one CURRENT-SESSION, session-handoff
  writes to one CURRENT-SESSION. These workflows need to at minimum not break when multiple
  developer-agent pairs are active concurrently.
- **Archive workflow assumes linear completion.** With multiple pairs, work units may complete out of
  order or overlap. Sequence numbering and archive structure should accommodate this (likely already
  fine, but verify).

**Design principle:** Forward-compatible, not over-engineered. Restructuring should use patterns that
naturally extend to team usage (e.g., directory structures that allow per-developer subdirectories)
without building team features now.

---

## Audit Results Summary

**Audit executed:** 2026-02-19
**Findings document:** `audit-structural-analysis-findings.md` (same directory)
**Scope:** All 46 `.arc/` markdown files, 2 shell scripts, 5 .gitkeep files, plus distribution plan

All 8 deliverables produced. Key outcomes by category:

### Confirmed (audit aligned with B.2 observations)

- DEVELOPMENT-RULES is the highest-impact mixed-concern file (paragraph-level interleaving, ~230
  lines framework, ~100 lines project, ~70 lines mixed)
- Work-organization backlog extraction warranted (~55 lines, low impact)
- Infrastructure separation from reference/ warranted (githooks are tooling, not documentation)
- `.example.md` → `.template.md` rename confirmed (16 files + 1 special case)
- Version footers nearly eliminated (only 2 remain; B.2 cleaned the rest)
- All structural proposals neutral to positive for team adaptation

### Scope narrowing (audit ruled out work)

- **No split needed** for: QUICK-REFERENCE, agent files, ATOMIC-TASKS, TASK-INBOX (clean
  section-level separation is sufficient for three-way merge in all cases)

### New deliverables surfaced

- **File classification strategy doc** (`strategy-file-classification.md`) — taxonomy
  (framework/configurable/scaffolded/project-owned) needs a canonical home in `.arc/`
- **Getting-started.md** — onboarding entry point, placed at `reference/getting-started.md`

### Refinements

- **completion-sample.example.md** special case — this is a sample, not a template. Rename to
  drop `.example` or use `.sample.md`
- **DEVELOPMENT-RULES version header** — keep, but reframe as project rule evolution tracking
  (manifest handles framework versioning)
- **Quality Gate Tiers table** in DEVELOPMENT-RULES — replace full duplicate with summary and
  cross-reference to strategy doc

### Audit assessment corrected post-discussion

- **Branch-to-task-list coupling**: Audit assessed as "no structural change needed" (Deliverable 5).
  Post-audit analysis found this underestimates the issue — the 1:1 coupling is expressed as a
  "Key rule" in strategy-work-organization.md, baked into activate-work-unit workflow, and used as
  archive trigger. Requires content and workflow changes.
  See [Branch-task list decoupling](#3-branch-task-list-decoupling).
- **Directory structure**: Audit proposed narrow extraction (githooks only → `infrastructure/`).
  Post-audit analysis identified a broader concern — `reference/` conflates passive knowledge with
  operational machinery (agent config, workflows). Agent files are mechanically loaded config;
  workflows are procedures agents execute. These are operationally closer to hooks than to ADRs or
  research notes. Decided on `reference/` + `system/` split.
  See [Directory structure](#1-directory-structure-reference--reference--system).

---

## Post-Audit Design Decisions

Decisions made during post-audit analysis discussion (2026-02-19). These go beyond the audit's
recommendations where discussion revealed deeper structural concerns.

### 1. Directory structure: `reference/` → `reference/` + `system/`

**Decision:** Split `reference/` into two top-level directories based on function.

**`reference/`** — Project knowledge base (things you read for understanding):

- `adr/` — Architecture decision records
- `archive/` — Completed work history
- `constitution/` — Project governance (META-PRD, DEVELOPMENT-RULES, PROJECT-STATUS, TECHNICAL-OVERVIEW)
- `research/` — Research notes
- `strategies/` — Codified patterns (arc/ and project/)

**`system/`** — ARC operational machinery (things that drive development sessions):

- `agent/` — Agent configuration files (loaded at session-init, configure agent behavior)
- `commands/` — Future CLI command source
- `githooks/` — Git enforcement scripts
- `workflows/` — Procedural workflows (executed by agents step-by-step)

**Rationale:** `reference/` was a catch-all for all stable content, conflating passive knowledge
(constitution, strategies, ADRs) with operational machinery (agent config, workflows, hooks). The
split creates directories with clear, distinct roles. `system/` naturally sorts to the bottom of
file explorers.

**Why not the audit's narrower proposal:** The audit proposed extracting only githooks as
`infrastructure/`. But agent files and workflows are more operational than knowledge — agent files
are config loaded mechanically, workflows are procedures agents execute. They have more in common
with hooks (making ARC sessions work) than with ADRs and research (things you consult for context).

**Impact:** All cross-references to `reference/agent/`, `reference/workflows/`, and
`reference/githooks/` update. Session-init reading list paths change. `.arc/README.md` directory
tree updates. `git config core.hooksPath` changes.

### 2. Communal `active/` + personal `team/` for team mode

**Decision:** Separate shared work artifacts from per-developer workspace.

**Solo mode (default):** No change from current structure. CURRENT-SESSION.md and ATOMIC-TASKS.md
live in active/. No `team/` directory.

**Team mode (CLI option):**

- `active/` becomes purely communal — task lists, PRDs, supporting docs. Any team member can work
  on any task list. No ownership coupling between task lists and team members.
- `team/` is a new top-level directory with per-developer workspaces: `team/{name}/` holds
  CURRENT-SESSION.md, ATOMIC-TASKS.md, and personal notes/scratch.
- CURRENT-SESSION points *into* active/ (personal state references communal work), not the reverse.

**Why separate from active/:** Embedding personal workspaces inside `active/` (the previously
discussed `active/team/{name}/` approach) couples team members to task list locations. When multiple
devs work on the same task list, it can't live in any one person's workspace. Separating `team/`
as a top-level peer keeps both concerns clean.

**ATOMIC-TASKS in team mode:** Personal. "I'm doing this quick thing" is inherently per-developer.
Communal quick tasks go to `backlog/TASK-INBOX.md` for capture, then during weekly review get
assigned to a team member's ATOMIC-TASKS.md or promoted to a backlog bucket — you don't execute
tasks directly from the inbox (unless trivial with no completion documentation/tracking need).

**Solo → team transition:** Mechanical. Create `team/` directory, move session/atomic files to
`team/{name}/`, `active/` becomes purely communal. CLI manages this.

### 3. Branch-task list decoupling

**Decision:** Replace the 1:1 "Key rule" with a many-to-one model.

**Problem:** ARC currently enforces 1:1 branch-to-task-list coupling:

- strategy-work-organization.md line 349: "Task list in `.arc/active/` ↔ Git branch exists.
  Archive immediately when branch is deleted."
- activate-work-unit.md assumes one branch per task list
- Archive triggers on branch deletion

This is naive. It breaks for: large features decomposed into stacked PRs (multiple branches, one
task list), team collaboration via personal sub-branches, and even the existing stacked incidental
branch model (which already partially breaks the rule).

**New model:**

- **Task lists are the unit of work planning.** A work unit is identified by its task list/PRD.
- **Branches are the unit of code delivery.** One or more branches serve a task list.
- **The 1:1 pattern is the default**, not a rule. Solo dev, one feature, one branch remains the
  common case and requires no extra thought.
- **Multi-branch patterns are supported:** stacked PRs, team sub-branches, the existing incidental
  stacked branch model (which generalizes naturally to planned work).
- **Archive triggers on task completion**, not branch deletion. All tasks done → archive. Branches
  are cleaned up independently as PRs merge.

**Changes required:**

- **strategy-work-organization.md:** Remove "Key rule" (line 349). Replace with guidance that task
  lists track work, branches deliver code. Add multi-branch patterns section.
- **activate-work-unit.md:** Create primary/integration branch. Acknowledge additional branches
  may be created during work.
- **archive-completed.md:** Trigger changes from "branch deleted" to "all tasks complete."
- **Task list template header:** Support multiple branches (e.g., `Branch(es):` field).
- **PROJECT-STATUS template:** Track by work unit name, branches as metadata.

**What stays the same:** Commit context footers (already reference task lists, not branches —
correct design), category-based organization, branch naming conventions.

### 4. Team coordination conventions

**Decision:** Lightweight conventions, not machinery. Git handles file conflicts, conventions handle
task coordination, communication handles everything else. This is how the industry works — no need
for checkout systems, locking, or custom tooling.

**Task ownership markers:**

```markdown
- [ ] Task 3.1: Implement auth middleware (@alice)
- [ ] Task 3.2: Add rate limiting (@bob)
```

Simple `(@name)` convention. Visible in markdown, no tooling required.

**Team branching patterns:**

- **Shared integration branch:** Team creates `feature/auth`, devs create personal branches off it
  (`feature/auth-alice`, `feature/auth-bob`), merge via PRs. Integration branch merges to main.
- **Direct shared branch:** Push/pull on same branch. Simpler, for small teams or non-overlapping tasks.
- **Stacked PRs per developer:** Chain of branches for reviewability, all serving the same task list.

**Integration point acknowledgment:** Teams using external trackers (Jira, Linear, GitHub Issues)
can use those for assignment and high-level status while ARC task lists handle implementation detail.
These coexist — the external tool is the assignment layer, ARC is the execution layer.

**Task list merge conflicts:** When multiple devs edit the same task list, git handles it. Task list
conflicts are trivially resolvable — different people checking different boxes in different parts of
the file. Document this in team guidance to set expectations.

### 5. Other structural decisions

- **constitution/ naming:** Retained. The DEVELOPMENT-RULES split strengthens the grouping — post-split,
  constitution/ holds genuinely constitutional project governance documents.
- **archive/ placement:** Stays in `reference/`. Considered top-level to create a temporal trio
  (backlog → active → archive), but not worth a 5th (or 6th with team/) top-level directory for
  rarely-accessed content.
- **active/ flat mode:** Available as CLI init option. Removes category directories for solo devs who
  don't need the three-way split. Existing scope — no new decisions needed.
- **CURRENT-SESSION placement (solo mode):** Stays in `active/`. File explorers sort directories above
  files, putting it below category dirs — effectively out of the way, which suits agent material.

---

## Proposed `.arc/` Structure (Post-Restructuring)

Target state after B.3+B.4 execution.

### Solo mode (default)

```text
.arc/
├── active/                       # Current work
│   ├── ATOMIC-TASKS.md
│   ├── CURRENT-SESSION.md
│   ├── feature/
│   ├── technical/
│   └── incidental/
├── backlog/                      # Future work
│   ├── ROADMAP.md
│   ├── TASK-INBOX.md
│   ├── feature/
│   └── technical/
├── reference/                    # Project knowledge base
│   ├── adr/
│   ├── archive/
│   ├── constitution/
│   ├── getting-started.md        # NEW — onboarding entry point (Cluster D, first-pass)
│   ├── research/
│   └── strategies/
│       ├── STRATEGY-INDEX.md
│       ├── arc/
│       │   ├── strategy-adr-methodology.md
│       │   ├── strategy-backlog-organization.md   # NEW — extracted from work-organization
│       │   ├── strategy-development-methodology.md # NEW — extracted from DEVELOPMENT-RULES
│       │   ├── strategy-file-classification.md     # NEW — file taxonomy
│       │   ├── strategy-quality-gates.md
│       │   ├── strategy-task-list-formatting.md
│       │   └── strategy-work-organization.md       # MODIFIED — backlog extracted, branch decoupled
│       └── project/
└── system/                       # ARC operational machinery
    ├── agent/                    # MOVED from reference/agent/
    ├── commands/                 # NEW — future CLI command source
    ├── githooks/                 # MOVED from reference/githooks/
    └── workflows/                # MOVED from reference/workflows/
```

### Team mode additions

```text
.arc/
├── active/                       # Communal — no CURRENT-SESSION or ATOMIC-TASKS
│   ├── feature/
│   ├── technical/
│   └── incidental/
├── backlog/                      # (unchanged)
├── reference/                    # (unchanged)
├── system/                       # (unchanged)
└── team/                         # NEW — per-developer workspaces
    ├── alice/
    │   ├── ATOMIC-TASKS.md
    │   ├── CURRENT-SESSION.md
    │   └── (personal notes)
    └── bob/
        ├── ATOMIC-TASKS.md
        └── CURRENT-SESSION.md
```

---

## Audit Session Prompt

**Executed:** 2026-02-19. Full prompt preserved in git history. Output written to
`audit-structural-analysis-findings.md` (same directory).

---

**Created:** 2026-02-19
**Status:** Post-audit — design decisions complete, ready for PRD creation
