# PRD: Methodology Completion (WU2)

**Type:** Technical
**Updated:** 2026-02-26

**Related Work:**

- Complete: WU1 (Philosophy & Configurability) — 6 ADRs, 2 strategy documents
- Complete: WU1.5 (Foundational Gap Closure) — ADR-007, strategy updates, workflow change specs

---

## Introduction

WU1 and WU1.5 produced all the design decisions ARC's methodology needs: what's configurable vs.
non-negotiable (ADR-001), how sessions work across agents and machines (ADR-002, ADR-007), how
configuration, extensions, and method overrides compose (ADR-003, ADR-005), how adoption scales
(ADR-004), how external tools integrate (ADR-005, ADR-006), and how session state, context loading,
and operational workflows handle real-world edge cases (WU1.5 Gaps 1-11).

None of these decisions are implemented yet. The design artifacts exist in ADRs and strategy
documents; the actual workflows, hooks, templates, and methodology docs still reflect pre-WU1
assumptions. WU2 turns decisions into concrete changes — updating existing files, creating new
infrastructure (config expansion, extension points, method overrides), and closing every convention
and workflow gap identified across two rounds of systematic audit.

The work is predominantly mechanical: applying known decisions to known files. Two full work units
of dedicated design (WU1, WU1.5) deliberately front-loaded the unknowns. What remains is execution
with bounded scope per item, though the aggregate volume is substantial (~55 items across 14
clusters).

**Why now:** WU3 (CLI design) depends on the completed methodology to reason about what gets
templated, updated, and user-owned. WU4 (public release) depends on methodology docs being
accurate and complete. Every session of framework development currently operates under workflows
that don't reflect the design decisions already made.

## Goals

1. **Implement all WU1/WU1.5 design decisions** — Every ADR decision and workflow change
   specification becomes concrete changes in `.arc/` files
2. **Restructure core documents per context loading architecture** — Split DEVELOPMENT-RULES
   into ARC/project halves, slim the development methodology strategy to domain reference,
   redesign session-init's loading sequence (WU1.5 Gap 2 specifications)
3. **Make hooks configurable** — Commit format, context footer, and merge strategy read from
   `arc-config.yml` with sensible defaults (ADR-003 dealbreaker resolutions)
4. **Build extension and method override infrastructure** — Scaffold `arc-extensions.md` and
   `arc-methods.md` with preset points, insert markers into workflows (ADR-003, ADR-005)
5. **Close all workflow and convention gaps** — Multi-branch coupling fixes, team mode
   adaptations, archive ceremony scaling, deferred review bounds, and remaining audit findings

## Use Cases

1. **Solo adopter with Conventional Commits** — Installs ARC, hooks enforce commit format and
   context footer out of the box. Their existing workflow continues with ARC layered on top.
   (Clusters A, B)

2. **Team using Jira with squash merges** — Overrides task-completion method to update Jira,
   commit-context-format to reference tickets, merge strategy to squash. Method dependency
   guidance flags the coupling. Hooks validate against custom patterns. (Clusters A, B, K, O)

3. **Agent reading session-init for the first time** — Loads DEV-RULES.ARC (behavioral rules)
   and DEV-RULES.PROJECT (project-specific gates) instead of a monolithic DEVELOPMENT-RULES.
   Fewer documents, fewer instructions, Tier 2a triggers for on-demand depth. (Cluster C)

4. **New project, first session after setup** — WORK-STATUS.md exists with "no active work"
   state. Session-init detects this, reports it cleanly, and points to create-prd workflow.
   No file-not-found errors, no mismatch false positives. (Cluster C)

5. **Multi-branch work unit mid-rotation** — Developer finishes a phase, merges current branch
   via rotate-branch workflow (Rotate operation), creates next branch from updated base.
   Archive-completed runs only after all tasks complete (Complete + Archive operations).
   (Cluster D)

6. **Skipped handoff recovery** — Session-init detects SESSION-NOTES.md staleness via commit hash
   anchor (3 commits behind). Reports informational warning. Mismatch recovery auto-corrects
   where git + task list agree, stops and asks where intent is ambiguous. (Cluster C)

## Requirements

### P0: Core Infrastructure

These requirements enable other changes or resolve adoption blockers.

**1. Create DEV-RULES.ARC.md**
Extract always-applicable behavioral rules from `strategy-development-methodology.md` into a new
`.arc/reference/constitution/DEV-RULES.ARC.md`. Two visible categories: non-negotiable
(principle-backed, no override) and strong defaults (convention-level, inline method-override
pointer to `arc-methods.md`). Include Tier 2a triggers for on-demand content. Target ~15-20
distinct instructions. Filter each rule against P1-P11 traceability during extraction.

**2. Rename and slim DEVELOPMENT-RULES.md to DEV-RULES.PROJECT.md**
Rename to `.arc/reference/constitution/DEV-RULES.PROJECT.md`. Remove ARC methodology content
(now in DEV-RULES.ARC). Retain project-specific content: quality gates, testing requirements,
file organization, architecture documentation guidance. Update all references throughout the
codebase.

**3. Evaluate and restructure strategy-development-methodology.md**
Remove always-applicable rules (moved to DEV-RULES.ARC). Then evaluate whether the remaining
content justifies a standalone document. The residual content (commit format details, test-first
tree, code documentation standards, session context management, context loading architecture)
may be better absorbed into other homes (DEV-RULES.ARC elaboration sections, relevant workflow
docs, a new context-loading-focused doc) than kept as a strategy document that's neither
obviously discoverable nor configurable. If it survives: add Context Loading Architecture
section (tier model formalization with evidence confidence classification), becomes Tier 2a
content. If it doesn't: redistribute content to appropriate homes and remove.

This connects to a broader question — see requirement 54 (strategy configurability audit).

**4. Redesign session-init loading sequence**
Rewrite `session-init.md` Step 2 to reflect the new Tier 1: AGENTS.md → agent-specific file →
DEV-RULES.ARC → DEV-RULES.PROJECT → STRATEGY-INDEX → QUICK-REFERENCE → WORK-STATUS.md →
active task list. process-task-loop and strategy-dev-methodology move to Tier 2a (triggered from
DEV-RULES.ARC). Net effect: 8 documents (down from 9), reduced instruction density. Include
agent-switching awareness note per ADR-007.

**5. Formalize Tier 2a trigger pattern**
Audit all Tier 1 documents for ad-hoc cross-references to Tier 2 content. Convert to consistent
trigger format: brief, explicit, actionable ("Before X, load Y"). Strengthen STRATEGY-INDEX
entries with "when working on X" phrasing.

**6. Expand arc-config.yml settings**
Add all settings designated configurable by ADR-003: `commit.format`, `commit.context_footer`,
`merge.strategy`, `hooks.pre_commit`, `hooks.commit_msg`, plus `platform.type` (ADR-005) and
custom pattern settings (`commit.custom_pattern`, `commit.context_pattern`). Maintain flat/shallow
format (shell-parseable). Document each setting inline. Update both `.arc/` and `.arc-internal/`
copies in parallel.

**7. Make commit hooks configurable**
Update `commit-msg` hooks (both copies) to read `commit.format` and `commit.context_footer`
settings from `arc-config.yml`. Support: conventional (default), custom pattern, and disabled.
Context footer: required (default), recommended (warn only), disabled. Remove or qualify "no
squash merge" blanket rule; update `archive-completed.md` merge command to reference
`merge.strategy` config. Add prose on how ARC's value survives squash merging.

**8. Make pre-commit hook patterns extensible**
Make debug statement patterns and meta-project reference file extensions configurable in
`arc-config.yml`. Add hook comments noting adopter adjustment needs. Scope per ADR-003:
language-specific checks are methods, not principles.

**9. Scaffold arc-extensions.md**
New file: `.arc/system/workflows/arc-extensions.md`. One section per preset extension point
with workflow reference, trigger condition, contract, and placeholder. Preset points:
`post-task-quality`, `post-unit-quality`, `post-context-load`, `pre-stage-review`. Evaluate and
finalize during implementation (target 0-3 per workflow).

**10. Scaffold arc-methods.md**
New file: `.arc/system/workflows/arc-methods.md`. One section per preset method: workflow
reference, trigger, contract, default, and project override placeholder. Preset methods:
task-completion tracking, quality gate commands, session state mechanism, commit context format.
Include `Related:` field documenting method dependencies per WU1.5 Gap 6 specification
(task-completion ↔ commit-context-format coupling).

**11. Insert extension and method markers into workflows**
Add block-style markers at each preset location in workflow files, bounded by horizontal rules.
Extension markers: name, anchor, contract, link to arc-extensions.md. Method markers: name,
anchor, contract, default, link to arc-methods.md. Consistent visual pattern for both.

**12. Add session-init config awareness step**
After standard document loading in `session-init.md`, read `arc-config.yml` and `arc-methods.md`.
Note non-default values and populated method overrides. Ensure consistency between
DEV-RULES.ARC method-override pointers and arc-methods.md preset methods.

### P0: Session Workflow Overhaul

**13. Reframe session model documentation**
Per ADR-002: in `strategy-development-methodology.md`, distinguish the principle (context must be
recoverable) from the mechanism (CURRENT-SESSION-NOTES.md / WORK-STATUS.md). In session workflows,
position current approach as "best approach for ephemeral-context agents," not a fundamental
methodology element. Add config-driven session model opt-out/extensibility per ADR-002.

**14. Handle first-session bootstrap and "no active work" state**
Per ADR-007: scaffold WORK-STATUS.md during `01_initialize-arc.md` with "no active work" defaults.
Add detection path in session-init for `Work Unit: [none]` state — skip task list loading, report
state, point to appropriate next workflow. Update `activate-work-unit.md` and
`archive-completed.md` to write/reset WORK-STATUS.md. Handle SESSION-NOTES.md gracefully per ADR-007
Part 4 (check local → check git notes → clean template).

**15. Stabilize task references**
Replace line-number-based task anchors with triple-anchor format: task title snippet (stable) +
task number (semi-stable) + approximate line number with tilde (disposable hint). Update
session-init with graduated lookup protocol (line hint → verify task number → search for number →
search for title → report to user). Update session-handoff, activate-work-unit, and
WORK-STATUS.md template.

**16. Add mismatch recovery protocol**
Replace session-init's flat "stop and ask for everything" with a tiered model. Trust hierarchy:
git state > task list > WORK-STATUS.md > SESSION-NOTES.md. Auto-recover with notice when git + task list
agree and session doc is the outlier (staleness, not ambiguity). Stop and ask when intent is
ambiguous. Reports include diagnostics (what each source says, which agree/disagree).

**17. Add staleness detection**
Add commit hash anchor to SESSION-NOTES.md (written during handoff: `git rev-parse HEAD`). Session-init
compares anchor against current HEAD; report commit gap count. For WORK-STATUS.md: compare last
commit touching it against HEAD. Staleness is informational (not blocking) — feeds confidence
levels into mismatch recovery. Runs between context loading and mismatch detection in session-init
sequence.

### P0: Multi-Branch Workflow Fixes

**18. Fix coupling language across workflow docs**
Rewrite `process-task-loop.md` lines 14-16: replace "branch exists ↔ task list active" with
many-to-one model. Fix `atomic-commit.md` blanket incidental statement (line 125). Fix
`manage-incidental-work.md` coupling language (line 136). Fix `work-organization.md` lifecycle
inconsistency (lines 352-375). All should reference "archive when all tasks complete."

**19. Create rotate-branch.md**
New supplemental workflow: `.arc/system/workflows/arc/supplemental/rotate-branch.md`. The
"Rotate" operation in the three-operation model (Rotate → Complete → Archive). Covers mid-work-unit
branch handoff: decision criteria (when to rotate), pre-merge checklist, next branch setup, session
state update. Explicitly distinct from archive-completed. Reference from work-organization strategy
and process-task-loop.

**20. Add multi-branch archive guidance**
Add guidance to `archive-completed.md` explaining the three-operation model per WU1.5 Gap 8:
intermediate merges use rotate-branch (no archive), full archive runs once after final merge when
all tasks complete. Phase 2→3 gate enforces merge verification.

**21. Port atomicity check to canonical process-task-loop**
Review the atomicity check added to the internal `process-task-loop.md` during WU1. Port to the
canonical `.arc/` copy with consistent language matching Commit Standards in
strategy-development-methodology.md.

**22. Add Branch(es) field update guidance**
Add guidance to `rotate-branch.md` and `process-task-loop.md` for updating the `Branch(es)` field
when creating additional branches for a task list.

### P1: Team Workflow Adaptation

**23. Add Workflow Adaptations section to team coordination strategy**
Add a concise mapping of workflow changes for team mode to `strategy-team-coordination.md`:
which files change path, how "one task at a time" scopes per pair, when integration vs. personal
branch is used. Brief reference table sufficient.

**24. Add team mode callouts to session workflows**
Add "Team Mode" notes to `session-handoff.md`, `activate-work-unit.md`, and `session-init.md`
where each references session state files. In team mode, update `team/{name}/` paths. Reference
session model config setting per ADR-002.

**25. Add person-to-person task handoff protocol**
Lightweight protocol for task ownership transfer: outgoing developer writes enhanced handoff,
incoming developer reads and bootstraps. Add to `strategy-team-coordination.md` or as a team
variant in `session-handoff.md`. Builds on ADR-007 infrastructure.

**26. Add per-pair qualifications**
In `strategy-development-methodology.md`: Session Documentation Control references personal
session file in team mode. Task Management Protocol: "one task at a time" is per developer-agent
pair, not global.

**27. Add team mode to activate-work-unit and weekly-review**
activate-work-unit: note multiple branches for team sub-branches, each developer updates own
session file. weekly-review: each developer also reviews `team/{name}/ATOMIC-TASKS.md`; in fully
protected mode, micro-branch needed for review commits.

### P1: Convention and Workflow Gaps

**28. Add verification section to completion doc template**
Update completion doc template in `archive-completed.md` with explicit "Verification" section.
Makes verified results visible in archive output and supports PR test plan convention.

**29. Close post-review quality gate gap**
Add post-review quality gate re-run to `archive-completed.md` Phase 2. Evaluate: mandatory Tier 1
after any review-driven commits (likely sufficient), escalating to Tier 2/3 for larger changes.

**30. Establish document evolution guidance**
Research ADR amendment practices before designing. Define conventions for ADR amendments (minor
corrections vs. supersession) and PRD updates post-implementation. Add "Amending This Document"
section convention to relevant templates. **Note: requires research before writing.**

**31. Add intermediate work-unit status**
Define a status for the "done but unmerged" state. Standardize across all referencing docs
(archive-completed, agent-pre-merge-review, PROJECT-STATUS template, ROADMAP). Set intermediate
status in Phase 1, final status in Phase 3.

**32. Address version reference drift**
Evaluate options: behavioral norm (agent cascades updates), hook validation, or both. Implement
selected approach for versioned source-of-truth documents.

**33. Expand incidental context patterns**
Expand commit-msg hook's accepted incidental patterns beyond current two. Evaluate: specific
patterns for common activities vs. generalized `(incidental - discovered during <freetext>)`.
Assess overlap with requirement 7 (context footer configurability) before implementing separately.

**34. Reconsider PROJECT-STATUS location**
Evaluate: `.arc/` root, `reference/` root (not `constitution/`), or leave it. If moved, update all
references. PROJECT-STATUS is operational state, not constitutional.

**35. Extract PRD format from create-prd to template reference**
Replace inline format definition in `1_create-prd.md` Step 4 with reference to
`template-prd.md`, keeping brief orientation summary in workflow.

**36. Strengthen create-prd discovery step**
Reference discovery checklist from `strategy-work-planning.md` as "must-ask" questions in
`1_create-prd.md` Step 3. Especially relevant for AI agents.

**37. Reference planning lifecycle from create-prd**
Add reference to `strategy-work-planning.md` in `1_create-prd.md` Step 1 for plan-\* doc naming,
purpose, and lifecycle.

**38. Enumerate deferred review stop conditions**
Add enumerated threshold to `3_process-task-loop.md` deferred review section per WU1.5
specification. "Must stop" conditions (QG failure, blocking dependency, unanticipated design
decisions, scope excess) and "continue with note" conditions (auto-fixed lint, longer than
expected, minor deviation).

**39. Add research file routing to archive workflow**
Add a decision point to `archive-completed.md` Phase 3: "Do any files have reference value beyond
this work unit?" Route reference material to `reference/research/` (or adopter equivalent) rather
than bundling with work unit archive.

### P1: Guidance Discovery and Skills

**40. Enrich STRATEGY-INDEX with trigger hints**
Add one-line "Consult when:" annotations to each STRATEGY-INDEX entry. Low-cost, high
discoverability. Dual-audience: agents match task context to strategies, humans scan quickly.

**41. Create WORKFLOW-INDEX**
New file in `.arc/system/workflows/`: lightweight catalog of available workflows with
descriptions, organized by category. Co-located with the workflows it indexes (parallels
STRATEGY-INDEX's placement in `reference/strategies/`). Add to session-init load sequence.
Include project workflows section (initially empty).

**42. Add strategy declaration guidance to generate-tasks**
In `2_generate-tasks.md`: when writing task entries, note relevant strategies from STRATEGY-INDEX.
Lightweight convention, not mandatory field.

**43. Formalize trigger/content separation convention**
Document the pattern: ARC content in `.arc/`, agent-specific trigger files as thin dispatchers.
Skills (SKILL.md with frontmatter) as the standardizing format per N annotation on skills
convergence. Note slash commands as legacy/back-compat variant. Research current CLI behavior
before finalizing. Feeds WU3 generation script design.

**44. Create integrate-skill workflow**
New supplemental workflow for bringing external skills into ARC: agent reads skill, classifies
(procedural → workflow, reference → strategy), assesses integration, proposes placement. Single
interaction target: "I found this skill, integrate it."

**45. Clarify project/ directories as skills landing zone**
Update READMEs in `.arc/reference/strategies/project/` and `.arc/system/workflows/project/` to
articulate their role for team-specific patterns including adapted external skills.

### P1: Naming and Discoverability Conventions

**54. Audit strategy configurability and opt-out paths**
ARC ships strategies that are loaded into agent context and applied during sessions. Unlike hooks
(configurable via `arc-config.yml`), conventions (overridable via `arc-methods.md`), and workflows
(extensible via `arc-extensions.md`), strategies have no explicit opt-out or override mechanism.
Audit all ARC-included strategies for content that could be problematic if applied without
configurability: prescriptive guidance that conflicts with team norms, conventions presented as
requirements without principle backing, or guidance that assumes a specific toolchain. For any
such content: extract to a mechanism that supports override (method in `arc-methods.md`,
config setting, or convention with explicit opt-out), or reframe as recommendation rather than
instruction. This ensures the configurability architecture (ADR-003) covers all guidance
delivery channels, not just hooks and workflows.

**55. Document ARC naming conventions**
ARC uses naming conventions that have emerged organically but are undocumented: ALL-CAPS for
core documents (AGENTS.md, DEVELOPMENT-RULES.md, CURRENT-SESSION-NOTES.md), `prd-{name}.md` and
`tasks-{name}.md` prefixes for standardized artifact types, `strategy-*` prefix for fuzzy-find
discoverability, `template-*` for copy-ready starting points, `plan-*` for exploration docs.
Workflows are an exception — numbered (`1_create-prd.md`, `3_process-task-loop.md`) without a
`workflow-` prefix. Document the reasoning behind each convention: what purpose it serves, why
exceptions exist, and guidance for adopters naming their own artifacts. Natural home is likely
a brief section in an existing document (file-classification strategy, development methodology,
or a conventions section in DEV-RULES.ARC) rather than a standalone document.

### P2: Minor Adjustments and Scaling

**46. Apply cosmetic fixes**
One-line edits: `task-list-formatting.md` Branch field for incidentals (F1),
`CURRENT-SESSION.template.md` team comment (F2), `AGENTS.template.md` one-task-at-a-time
per-pair qualification (F3).

**47. Clarify reference-style link convention scope**
Adjust from requirement to recommendation, or scope enforcement to `.arc/` files only.

**48. Evaluate planning branch independence**
Assess whether a `planning_branches` setting independent of protection mode adds value.

**49. Separate parseable minimum from full task list format**
In `strategy-task-list-formatting.md`: document the "parseable minimum" (what agents require)
as distinct from recommended full format. Make pre-commit task numbering check configurable
(error/warning/off) via `arc-config.yml`.

**50. Relax emoji prohibition**
Change emoji prohibition in task planning from "prohibited" to "discouraged."

**51. Scale archive ceremony to work size**
Define simplified archive path for incidental work below a complexity threshold: move task file
to archive, update listing, done — no completion doc. Reserve full ceremony for planned and
substantial incidental work.

**52. Streamline dual-tracker workflow guidance**
Per ADR-005/ADR-006: document ARC task lists as "working scratchpad" alongside external trackers.
Update workflow prose to reference practice rather than tool where appropriate. Add extension
points at task completion and status reporting touchpoints if warranted.

**53. Implement config-driven adoption tier behavior**
Per ADR-004: tiers are config-driven profiles (Essentials, Recommended, Custom) applied to
identical files. Update workflow steps to reflect `adoption_tier` configuration, reducing
ceremony for Essentials tier. Document "one task at a time" deferred review escape hatch
more prominently for experienced users.

## Non-Goals

- **No new ADRs** — All design decisions are made (WU1 + WU1.5). WU2 implements them.
- **No CLI tooling** — Hooks are shell scripts, not CLI commands. CLI is WU3 scope.
- **No docs site content** — Public-facing documentation is WU4 scope.
- **No structural validation** — File classification inventory, dependency mapping, and
  de-duplication audit are a separate work unit (WU2b) that runs after all methodology
  changes land.
- **No self-testing for config combinations** — Noted as future concern; out of scope for 1.0.
- **No agent-agnosticism overhaul** — ADR-002 classified workflow assumptions as incidental;
  WU2 applies that classification, it doesn't create alternate workflow versions.

## Technical Considerations

**Sequencing:** The plan's Approach section defines the dependency-aware ordering: cosmetic fixes
(F) first to reduce noise, then multi-branch fixes (D) to establish correct mental model, then
session/core restructure (C) as the biggest structural change, then config/hooks/extensions
(A, B, O), then team (E), then remaining gaps (G, H, I, J, K, L, N). This ordering should
inform task list generation.

**Paired hook updates:** Every hook change must update both `.arc/system/githooks/` and
`.arc-internal/system/githooks/` in the same commit.

**CURRENT-SESSION-NOTES.md → WORK-STATUS.md + SESSION-NOTES.md:** ADR-007 replaces CURRENT-SESSION-NOTES.md with
two files. All Cluster C requirements that reference session state files use the ADR-007 model.
The transition itself (renaming, migrating content, updating all references) is part of this work.

**Research prerequisite (G3 only):** Document evolution guidance (requirement 30) requires
researching ADR amendment practices before designing. This is the only item with a
research-first prerequisite.

**Skills ecosystem research (N4):** Before implementing trigger/content separation, verify
current CLI behavior for Claude Code, Codex, Gemini CLI, and Copilot. The ecosystem moves
fast — the N cluster annotation in the plan documents the current understanding but recommends
verification at execution time.

**Terminology lens:** WU2 doc edits are an opportunity to strengthen consistent use of key terms
(ARC session, work unit, review increment). Not a separate requirement — a lens applied during
execution per the plan's forward-looking note.

**Conditional branch resolutions (plan → ADR mapping):**

| Plan Reference                                 | Resolved By | Decision                                                      |
| ---------------------------------------------- | ----------- | ------------------------------------------------------------- |
| "If ADR 2 designates sessions as configurable" | ADR-002     | Yes — mechanism is configurable, sessions are principle-level |
| "If ADR 6 designates tiers as config-driven"   | ADR-004     | Yes — config profiles (Essentials/Recommended/Custom)         |
| "per ADR 4 decision" on hook toggles           | ADR-003     | 7 initial settings defined including commit/hook toggles      |
| "per ADR 7 external tool compatibility"        | ADR-005     | Method override system (`arc-methods.md`)                     |
| "per ADR 8 merge strategy"                     | ADR-003     | Merge strategy consolidated into config                       |

## Success Criteria

1. **All WU1/WU1.5 design decisions implemented** — Every ADR decision and workflow change
   specification has corresponding concrete changes in `.arc/` files
2. **Core document restructure complete** — DEV-RULES.ARC and DEV-RULES.PROJECT exist,
   strategy-dev-methodology is slimmed, session-init uses the new loading sequence
3. **Hooks are configurable** — Commit format, context footer, and merge strategy read from
   `arc-config.yml`; custom pattern support works
4. **Extension and method infrastructure exists** — `arc-extensions.md` and `arc-methods.md`
   scaffolded with preset points; markers visible in workflow files
5. **Session workflows handle real-world edge cases** — Bootstrap, staleness detection,
   mismatch recovery, and stable task references all operational
6. **Multi-branch model is consistent** — No coupling language contradictions across workflow
   and strategy docs; rotate-branch workflow exists
7. **All audit findings addressed** — Every item from the adopter experience audit, multi-branch
   audit, and methodology gaps plan is resolved or has a documented disposition
8. **Markdown linting passes** — Zero violations across all modified and new files
9. **Internal consistency** — No contradictions between modified documents; cross-references
   are accurate

## Open Questions

1. **PROJECT-STATUS final location** — Stays in `constitution/`, moves to `reference/` root,
   or moves to `.arc/` root? Evaluate during implementation. (G7)

2. **Incidental pattern approach** — Specific patterns vs. generalized freetext regex for
   commit-msg hook incidental context? Depends on overlap with context footer configurability.
   (G6, intersects A2)

3. **strategy-development-methodology.md survival** — Does the slimmed document justify its
   existence as a standalone strategy, or should residual content be redistributed? Depends on
   what remains after DEV-RULES.ARC extraction. (Req 3)
