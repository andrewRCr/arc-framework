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

Resolved during planning (2026-02-19 session).

### Combined work unit (B.3 audit → B.4 execution)

The audit (B.3) and structural optimization (B.4) will produce a single PRD + task list. The audit is
a token-heavy analysis session run from a prepared prompt; its results feed directly into PRD creation.
The roadmap B.3/B.4 distinction reflects sequencing (analyze, then execute), not separate work units.

### Concern clusters — what the post-audit work unit covers

**Full execution (A+B+C):**

- **A: File-level restructuring** — Split mixed-concern files (DEVELOPMENT-RULES, work-organization),
  section-level separation in configurable files to reduce merge conflict surface
- **B: Directory/naming/metadata** — Evaluate infrastructure separation from reference/, `.example.md`
  → `.template.md` rename, version footer removal, header metadata conventions
- **C: Cross-cutting concept management** — Dependency mapping, centralized definitions, file
  classification markers for manifest

**First pass only (D):**

- **D: Workflow/coverage gaps** — Establish placement and rough shape for convention definitions,
  onboarding skeleton, workflow gap fixes (ROADMAP in define-constitution, working directory context
  placement, audience indicators). Explicitly not-final — polish deferred until CLI work clarifies
  actual onboarding needs.

**First pass only (F):**

- **F: Team adaptation readiness** — Identify structural decisions that would block or enable team
  usage. Establish forward-compatible patterns where possible without over-engineering for a use case
  that isn't the current priority. See [Team Adaptation Concerns](#team-adaptation-concerns) below.

**Deferred:**

- **D polish** — Post-CLI, when onboarding needs are concrete
- **E: Slash command dedup** — Phase C (CLI), needs generation script. Audit should document
  current duplication state but execution is a CLI concern.

### Open questions resolved

1. **Scope boundary:** Combined — distribution-readiness structure AND broader concerns (workflow
   gaps, conventions, team readiness), with broader concerns scoped to first-pass placement only.
2. **DEVELOPMENT-RULES split:** Audit will propose specific split. Execution decides aggressiveness
   based on audit findings.
3. **Directory restructuring:** Audit will evaluate and recommend. Decision deferred to audit findings.
4. **Naming convention timing:** Part of this work unit (Cluster B), not deferred to CLI.

---

## Observations from B.2 Refinement Pass

Gathered during Phases 1-5 of `tasks-content-refinement-pass.md`. Organized by concern area.

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
  needs per-developer session scoping (e.g., `active/team/{name}/` as mentioned in distribution plan).
  Structural question: does the directory layout support multiple concurrent sessions without breaking
  workflows?
- **Task list coordination.** Multiple developer-agent pairs working from one task list need
  ownership/assignment conventions. Multiple concurrent task lists need coordination patterns.
  The single-threaded model is fine per-pair; the gap is multi-pair awareness.
- **ATOMIC-TASKS is a single shared file.** Concurrent edits from multiple devs = merge conflicts.
  May need per-developer or per-category splitting.
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

## Audit Approach

The audit is a dedicated session run from a prepared prompt (below). It produces findings that get
folded back into this plan doc, which then evolves into the PRD.

### What the audit must produce

1. **File classification inventory** — Every `.arc/` file classified as framework / configurable /
   scaffolded / project-owned, with mixed-concern annotations where applicable
2. **Split/separation proposals** — Concrete recommendations for high-impact files (DEVELOPMENT-RULES,
   work-organization, any others identified). Section-level granularity: what stays, what moves, where.
3. **Directory structure recommendation** — Infrastructure separation (yes/no, what form), with
   rationale weighing adoption simplicity vs. concern separation
4. **Cross-cutting concept dependency map** — Which concepts span multiple files, what's the blast
   radius of changing each one, where canonical definitions live
5. **Team adaptation assessment** — For each structural decision proposed, note whether it enables,
   blocks, or is neutral for team adaptation. Flag any restructuring that would make team support
   harder later.
6. **Placement recommendations for Cluster D** — Where convention definitions, onboarding content,
   and workflow gap fixes should live in the restructured layout
7. **Naming convention assessment** — `.example.md` → `.template.md` implications, any other
   naming concerns
8. **Version footer inventory** — Verify removal status, confirm no in-file versioning needed

### Audit prompt

See [Audit Session Prompt](#audit-session-prompt) below. To be used as the starting prompt for a
fresh session dedicated to the audit.

---

## Audit Session Prompt

**Usage:** Copy this section as the opening prompt for a dedicated audit session. The session should
read all `.arc/` files systematically and produce findings for each deliverable listed above.

---

### Prompt

You are performing a structural analysis audit of the ARC Agentic Development Framework. This is
Roadmap Phase B.3 — an analysis step whose findings will become the basis for a PRD and task list
covering structural optimization (B.4).

**Context:** Read these documents first to establish full context:

1. `.arc-internal/reference/agent/AGENTS.md` — Project overview
2. `.arc-internal/reference/agent/CLAUDE.md` — Agent-specific guidance
3. `.arc-internal/reference/constitution/DEVELOPMENT-RULES.md` — Quality standards
4. `.arc-internal/reference/QUICK-REFERENCE.md` — Environment context
5. `.arc-internal/backlog/technical/plan-structural-analysis-pass.md` — **This plan doc** (contains
   B.2 observations, scoping decisions, concern clusters, team adaptation concerns, and the full
   specification of what this audit must produce)
6. `.arc-internal/backlog/feature/plan-distribution-and-update-system.md` — Distribution plan
   (structural decisions must enable the three-way merge update system)

**Your task:** Systematically audit every file in `.arc/` (the template/deployable system) to produce
the 8 deliverables specified in the "What the audit must produce" section of the plan doc. Work
through files methodically — by directory, then by file within each directory.

**For each file, assess:**

- **Classification:** Framework / configurable / scaffolded / project-owned
- **Mixed concerns:** Does this file interleave framework-stable content with project-specific content?
  At what granularity (section-level, paragraph-level, line-level)?
- **Cross-cutting concepts:** What framework-wide concepts does this file reference or define?
- **Team readiness:** Would this file's structure cause problems in a multi-developer context?
- **Merge conflict surface:** If a user customizes this file, where would framework updates likely
  conflict?

**For the overall assessment, produce:**

- Concrete split/separation proposals for mixed-concern files (not just "consider splitting" —
  specify what content moves where)
- A directory structure recommendation with rationale
- A cross-cutting concept dependency map (concept → files that reference it → canonical definition
  location)
- Team adaptation assessment for each proposed structural change
- Placement recommendations for workflow gaps, conventions, and onboarding content

**Important constraints:**

- This is analysis only — do not modify any files
- Produce findings as structured markdown that can be appended to the plan doc
- Be specific and concrete — "DEVELOPMENT-RULES lines 45-89 are framework methodology, lines 90-150
  are project constitution" is useful; "DEVELOPMENT-RULES has mixed concerns" is not
- Consider the distribution plan's three-way merge system when evaluating merge conflict surface
- Consider team adaptation as a forward-compatibility concern, not a current requirement

**Output format:** Structure your findings using the 8 deliverable headings from the plan doc's
"What the audit must produce" section. Within each deliverable, organize by file or by concern area
as appropriate.

---

**Created:** 2026-02-19
**Status:** Planning — scoping complete, audit prompt ready, awaiting audit session execution
