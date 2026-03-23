# ADR-008: Decompose Framework into Core Methodology and Optional PM Layers

## Status

Accepted (Parts 1, 3, 5, 6 superseded by ADR-009; ATOMIC-TASKS.md path references superseded by ADR-012)

## Context

ADR-004 established same-files, config-driven adoption profiles — every ARC installation receives the same ~55 files
regardless of enforcement level (Essentials, Recommended, Custom). The tier distinction is expressed through
`arc-config.yml` values, not file presence. ADR-007 established the two-file session state split (WORK-STATUS.md
tracked + SESSION-NOTES.md gitignored), resolving session portability and team transfer.

During WU2 methodology completion work, a fundamental tension surfaced: ARC's project management artifacts —
BACKLOG-FEATURE.md, BACKLOG-TECHNICAL.md, ROADMAP.md, TASK-INBOX.md, ATOMIC-TASKS.md, and their associated workflows —
are project-scoped files that conflict with git's branching model.

**The problem:** These files are "everyone's files" — they need to be current regardless of which branch you're on, and
editable by anyone. Git branching doesn't support this:

- On a 3-week feature branch, BACKLOG-TECHNICAL.md is frozen at branch point
- Other people's changes on main are invisible until merge
- Merge creates conflicts on files nobody thinks of as contentious
- Even in solo mode, switching between branches means backlog state diverges
- In branch-protected configurations, you can't commit to main directly — yet the weekly-review workflow, TASK-INBOX
  processing, and atomic task management all assume direct base-branch commits

Attempting to solve this within the unified framework leads to cascading complexity: hook-based file protection,
conditional team-mode paths in every workflow that touches these files, micro-branch conventions for backlog edits in
protected mode, and team-mode path awareness threaded through workflows that are currently simple. Each accommodation
weakens the system for users who don't need it.

**The discovery that reframed the problem:** An audit of all `.arc/` files revealed that 85-90% of the framework has
zero dependencies on project management artifacts. The session management, task execution, commit discipline, code
review, specification, and branch management workflows are entirely self-contained. The entanglements that exist are
mechanical and bounded:

- `activate-work-unit.md`: two steps updating PROJECT-STATUS.md and ROADMAP.md
- `archive-completed.md`: one step updating the same files (already conditionally qualified)
- `setup/02_define-project.md`: two steps creating ROADMAP.md and PROJECT-STATUS.md
- `process-task-loop.md`: one bounded section referencing ATOMIC-TASKS.md
- `strategy-work-organization.md`: PM artifact bullets in branch protection mode exception lists

This clean boundary is evidence that the methodology (how you execute work) and the project management layer (how you
plan and prioritize work) were always distinct concerns that happened to be delivered in one package.

**Relationship to ADR-004:** ADR-004's "same files" decision addressed a specific axis — enforcement depth (how strictly
you follow conventions). Essentials and Recommended users get the same files, different config. The tension discovered
here is on a different axis — functionality scope (what features are installed). These axes are orthogonal. ADR-004's
concern about cross-reference breakage does not apply: the audit confirmed Core files never reference PM files. PM files
reference Core files (downward dependency — always intact). Extension points (ADR-003) bridge the interface where
workflows previously had direct PM steps. Within each layer, all cross-references are intact.

**Evidence base:**

- Full inventory audit of every `.arc/` file's PM artifact references (85-90% clean)
- Entanglement analysis per file (clean / low / moderate / PM-only classification)
- Review of WU3 CLI distribution plan for forward-compatibility
- Evaluation of the project-scoped vs. branch-scoped file tension across solo and team scenarios
- Analysis of existing configurability architecture (ADR-003) as the interface mechanism

The evaluation context that led to this decision was captured in working documents during the WU2 methodology
completion work and is preserved in SESSION-NOTES.md and this ADR.

## Decision

### Part 1: Three-Layer Decomposition

We will decompose the ARC framework into a Core methodology layer (always installed) and two optional, independent PM
layers:

**Core** — the methodology engine. Session management, task execution, commit discipline, specification workflows,
branch management, code review, strategies, and configuration infrastructure. Works identically for solo developers and
teams. Contains no project management opinions — no backlog files, no roadmap, no standalone task tracking outside of
task lists (ATOMIC-TASKS.md is PM), no weekly review ceremony.

Core provides everything needed to execute work: create specifications (PRDs), generate task lists, execute tasks one at
a time with quality gates, manage sessions with structured handoffs, commit with discipline, rotate branches, and
archive completed work. A team with Jira, Linear, or GitHub Issues uses Core and brings their own planning.

**Solo PM** — in-git project management for solo developers. The proven, simple system:

| Artifact                         | Purpose                                  |
| -------------------------------- | ---------------------------------------- |
| ATOMIC-TASKS.md (in `active/`)   | Standalone actionable tasks, main-scoped |
| BACKLOG-FEATURE.md               | Feature planning bucket                  |
| BACKLOG-TECHNICAL.md             | Technical planning bucket                |
| ROADMAP.md                       | Sequencing and dependency tracking       |
| PROJECT-STATUS.md                | Project-level status visibility          |
| completed-atomic-{quarter}.md    | Atomic task completion archive           |
| strategy-backlog-organization.md | Backlog management guidance              |

All files are main-scoped with no branch protection needed — a solo developer is the only writer. No merge conflicts by
definition. Solo PM extends the activate-work-unit and archive-completed workflows via extension points to update
PROJECT-STATUS.md and ROADMAP.md at work unit transitions.

**Team PM** — team-specific conventions and integration. Not a superset of Solo PM — a purpose-built layer for team
constraints:

| Artifact                               | Purpose                                                |
| -------------------------------------- | ------------------------------------------------------ |
| team/{name}/ATOMIC-TASKS.md            | Per-developer standalone tasks                         |
| Branch inbox (arc-method, overridable) | WU-scoped capture for cross-concern discoveries        |
| External tracker integration           | Arc-methods overrides for task completion, status sync |
| Honest boundaries document             | What in-git PM can and cannot do for teams             |

Team PM does not include backlog bucket files, roadmap, or PROJECT-STATUS. Teams use external tools for project-level
planning — this is the honest acknowledgment that shared mutable files in git don't scale across branches and
developers. The value of Team PM is conventions and integration, not file proliferation.

Solo PM and Team PM are independent layers. Teams install Core + Team PM. Solo developers install Core + Solo PM (or
Core only). Neither PM layer is a superset of the other. Each provides what works for its context.

**Escape hatch:** A very small team (2-3 people) that wants in-git backlogs without external tools can install Solo PM
and manage with informal coordination. Not officially supported for team scenarios, but not blocked. Merge conflicts are
rare with very few writers.

### Part 2: The Boundary Between Core and PM

The decomposition follows a natural boundary between two questions:

**Core answers: "Here's what we're working on — how do we execute it?"**

- Specification: PRDs define what to build
- Execution: task lists track how to build it
- Session management: WORK-STATUS.md and SESSION-NOTES.md maintain continuity
- Commit discipline: atomic commits with traceability
- Branch management: work unit lifecycle from activation through archival

**PM answers: "What should we work on next?"**

- Planning: backlog buckets organize future work
- Prioritization: roadmap sequences work units
- Standalone tasks: atomic tasks track one-off work outside task lists
- Status: PROJECT-STATUS.md provides project-level visibility

The boundary rule: **task lists are execution artifacts, not planning artifacts.** They don't exist until someone
decides to work on something (that decision belongs to PM or to the team's external tools). Once the decision is made
and a work unit is activated, task lists are how the work gets done — that's Core.

PRDs are Core (specifications, branch-scoped). WORK-STATUS.md and SESSION-NOTES.md are Core (session state). Workflows
that execute work (process-task-loop, session-init, session-handoff, activate-work-unit, archive-completed) are Core —
with PM-specific steps extracted to extension points.

### Part 3: Artifact Classification

Complete classification of every artifact across layers:

#### Core Artifacts (always installed)

| Category          | Artifacts                                                              |
| ----------------- | ---------------------------------------------------------------------- |
| Session state     | WORK-STATUS.md, SESSION-NOTES.md                                       |
| Execution         | Task lists (tasks-\*.md), PRDs (prd-\*.md), plan-\* docs               |
| Task list section | "Atomic Tasks — {name}" for WU off-plan work                           |
| Configuration     | arc-config.yml, arc-methods.md, arc-extensions.md                      |
| Workflows         | All except weekly-review (with PM steps extension-pointed)             |
| Strategies        | All except strategy-backlog-organization.md                            |
| Constitution      | DEV-RULES.ARC.md, DEV-RULES.PROJECT template                           |
| Team (personal)   | team/{name}/SESSION-NOTES.md                                           |
| Setup             | 01_verify-and-configure.md, 02_define-project.md (Core steps only)     |

#### Solo PM Artifacts (optional, solo developers)

| Category | Artifacts                                  |
| -------- | ------------------------------------------ |
| Active   | ATOMIC-TASKS.md (standalone, in `active/`) |
| Backlog  | BACKLOG-FEATURE.md, BACKLOG-TECHNICAL.md   |
| Planning | ROADMAP.md                                 |
| Status   | PROJECT-STATUS.md                          |
| Archive  | completed-atomic-{quarter}.md              |
| Strategy | strategy-backlog-organization.md           |

#### Team PM Artifacts (optional, teams)

| Category       | Artifacts                                         |
| -------------- | ------------------------------------------------- |
| Personal PM    | team/{name}/ATOMIC-TASKS.md (per-developer)       |
| Branch capture | Branch inbox (arc-method, WU-scoped, overridable) |
| Integration    | External tracker arc-methods overrides            |
| Guidance       | Honest boundaries document                        |

#### Removed from Framework

| Artifact         | Rationale                                                                             |
| ---------------- | ------------------------------------------------------------------------------------- |
| TASK-INBOX.md    | Rarely used in practice; captures go directly to backlogs or are acted on immediately |
| weekly-review.md | Depends on TASK-INBOX as primary input; entire workflow is PM-only                    |

Both may be reintroduced if demand emerges. Their removal shrinks the project-scoped file surface area and eliminates
the weekly-review workflow's branch-protection gaps.

### Part 4: Core Workflow Adjustments

Three workflows require mechanical edits to remove direct PM artifact references. The interface mechanism is extension
points (ADR-003): Core workflows fire named hooks, PM layers populate the steps.

**activate-work-unit.md** — Steps 5 (update PROJECT-STATUS.md) and 6 (update ROADMAP.md) become a
`post-work-unit-activate` extension point. Solo PM populates these steps. Without a PM layer installed, the extension
point fires with no registered handlers and the workflow skips those steps naturally. The commit in step 8 no longer
stages PM files unconditionally.

**archive-completed.md** — Step 11 (update PROJECT-STATUS.md and ROADMAP.md) becomes a `post-work-unit-archive`
extension point. This step is already conditionally qualified ("skip for small incidental fixes"), making the extension
point a natural fit. Solo PM populates the handler.

**setup/02_define-project.md** — Steps 4 (create ROADMAP.md) and 5 (create PROJECT-STATUS.md) move to the PM layer's
initialization. Core setup covers META-PRD, TECHNICAL-OVERVIEW, and DEV-RULES.PROJECT — three steps instead of five. The
"Maintaining Project Documents" section also simplifies.

**Additional cleanup:**

- `process-task-loop.md`: Remove the bounded ATOMIC-TASKS.md section (lines ~163-180). Its function is replaced by the
  task list "Atomic Tasks — {name}" section, which is Core.
- `commit-guide.md` (formerly `atomic-commit.md`): Remove single ATOMIC-TASKS.md reference in the complex analysis path.
- `strategy-work-organization.md`: Remove PM artifact bullets (TASK-INBOX, ATOMIC-TASKS) from branch protection mode
  exception lists. The protection mode concept is Core; the PM-specific exceptions are simply absent without PM.
- `STRATEGY-INDEX.md`: strategy-backlog-organization.md is listed only when Solo PM is installed. The index is otherwise
  complete — all other strategies are Core.

### Part 5: Relationship to ADR-004

ADR-004 established two principles: same files regardless of adoption profile, and config-driven enforcement. This ADR
introduces a second axis without conflicting with the first:

| Axis                | What varies                           | Mechanism                       | ADR     |
| ------------------- | ------------------------------------- | ------------------------------- | ------- |
| Enforcement depth   | How strictly conventions are followed | Config values (arc-config.yml)  | ADR-004 |
| Functionality scope | What features are installed           | File presence (layer selection) | ADR-008 |

These axes are orthogonal. An Essentials-profile user can be Core-only or Core + Solo PM. A Recommended-profile user can
be Core-only or Core + Team PM. The adoption profile controls enforcement *within* whatever layers are installed.

ADR-004's cross-reference concern — "removing files creates broken references" — does not manifest here. The audit
confirmed that Core files never reference PM files. The dependency is one-directional: PM depends on Core, never the
reverse. Extension points replace the few workflow steps where Core previously referenced PM artifacts directly. Within
each layer, all cross-references are intact.

ADR-004's "same files within a layer" principle holds: all Core installations are identical, all Solo PM installations
are identical, all Team PM installations are identical. The layer selection is a structural choice made at init time;
the enforcement profile is a config choice that can change at any time. Both are independent and composable.

### Part 6: CLI Forward-Compatibility

The decomposition maps to the WU3 `arc init` interactive flow (plan-wu3-cli-distribution.md):

**Init prompts extend naturally:**

1. Existing: Solo or team? (controls `team/` directory installation)
2. New: Include in-git project management? (controls PM layer installation)
    - Solo + yes → installs Solo PM artifacts
    - Team + yes → installs Team PM artifacts
    - Either + no → Core only

**Configuration:**

`arc-config.yml` gains a PM mode setting (e.g., `pm.mode: none | solo | team`) that controls which PM layer is active.
This integrates with the existing config parsing infrastructure.

**Manifest and update:**

`.arc-manifest.json` tracks which layer's files are installed. Each file's layer membership is recorded alongside its
existing classification (Framework, Configurable, Scaffolded, Project-Owned). `arc update` only touches files in the
manifest — layer-aware by design. PM files absent from the manifest are never created or modified by updates.

**Layer switching:**

`arc init --reconfigure` adds or removes PM layers without reinstalling Core. Adding Solo PM installs backlog templates
and the backlog organization strategy. Removing PM deletes PM-layer files (with confirmation). Switching from Solo PM to
Team PM is a reconfigure operation — Solo PM files are removed, Team PM files are installed.

**Pristine tracking:**

`.pristine/` tracks PM files separately from Core files. Updates to Solo PM strategy-backlog-organization.md use the
same three-way merge as Core files: base (pristine) + theirs (new version) + ours (adopter customizations).

**Adoption profiles (ADR-004) are unaffected.** The Essentials / Recommended / Custom profile selection applies to
whatever layers are installed. A Core + Solo PM installation at the Essentials profile gets relaxed enforcement for both
Core and PM conventions.

### Part 7: Subordinate Decisions

These decisions were resolved during the evaluation that led to this ADR:

#### 7a. Task List "Atomic Tasks — {name}" Section

Task lists gain a dedicated section for WU off-plan work: discoveries, small fixes, and items that don't fit the planned
task structure. The section is defined in the task list formatting strategy, present in the template (empty by default),
and uses "Atomic Tasks — {wu-name}" as the section header to distinguish from the standalone ATOMIC-TASKS.md file in PM
layers.

Items can be captured and completed in this section. It archives with the work unit. This replaces the need for
ATOMIC-TASKS.md during WU execution — the standalone file (in PM layers) is for work between or alongside WUs that
doesn't belong to any task list.

#### 7b. TASK-INBOX.md and weekly-review.md Removed

Both artifacts are cut from the framework entirely — not made opt-in, removed. TASK-INBOX was rarely used in practice
(captures go directly to backlogs or are acted on immediately). The weekly-review workflow depends on TASK-INBOX as its
primary input and is entirely PM-scoped. Both add project-scoped file surface area without proportional value. If demand
emerges, they can be reintroduced as Solo PM components.

#### 7c. WORK-STATUS.md Team Mode Location Corrected

WORK-STATUS.md is shared in `active/` (one per branch), not per-developer in `team/{name}/`. The team/ templates and
README currently showing per-developer WORK-STATUS.md are a documentation error originating from the CURRENT-SESSION →
WORK-STATUS.md + SESSION-NOTES.md split (ADR-007). WORK-STATUS.md is branch-scoped factual state — it doesn't vary by
developer on a shared branch. Per-developer files are for personal state (SESSION-NOTES.md in Core) and personal PM
artifacts (ATOMIC-TASKS.md in Team PM).

#### 7d. Session Handoff Conditional WORK-STATUS.md Commit

The session-handoff workflow gains a conditional step: if WORK-STATUS.md is dirty and no other commits are pending,
commit it standalone before presenting the handoff summary. This resolves the "dangling WORK-STATUS.md" gap during
off-task-list work (evaluation sessions, design discussions, pre-planning). The commit is agent-initiated, predictable,
and still under manual commit control — permission-gated like all commits. It does not violate ARC's commit control
principles; it is a documented, intentional step in the handoff workflow.

## Consequences

### Positive

- **User choice without compromise.** Core-only minimalists, solo devs with full in-git PM, and teams with external tool
  integration all get exactly what they need. This is a feature addition (flexibility), not a feature removal.
- **Core stays simple and universal.** No cascading protection conventions, no conditional team-mode paths in
  methodology workflows, no "skip this if you don't have backlog files" logic. Workflows are clean and focused.
- **Natural boundary, not forced separation.** The audit evidence (85-90% already clean) demonstrates that Core and PM
  were always distinct concerns. The decomposition names and formalizes what was already true.
- **Forward-compatible with WU3 CLI.** Extends the existing init flow, manifest tracking, and update system. The layer
  selection integrates naturally alongside the existing solo/team choice.
- **Honest about limitations.** Solo PM works because you're the only writer. Team PM works because it provides
  conventions and integration rather than pretending shared mutable files scale across branches. Each layer's scope is
  truthful about what in-git files can and cannot do.
- **ADR-004 model preserved.** Same-files, config-driven enforcement holds within each layer. The new functionality axis
  is orthogonal, not conflicting. Both axes compose cleanly.
- **Existing architecture provides the interface.** Extension points (ADR-003) bridge Core and PM workflows. No new
  architectural concepts are introduced.

### Negative

- **Three layers introduce packaging complexity.** WU3 must handle layer-aware init, update, reconfigure, and switching.
  The manifest, pristine tracking, and update system all gain a layer dimension.
- **PM layers need their own documentation and onboarding.** Strategy references, workflow guidance, and getting-
  started content must be layer-aware. This is a documentation maintenance cost.
- **Perception risk for Core-only users.** Teams may perceive Core without PM as "incomplete" rather than "focused."
  Onboarding must frame Core-only as a deliberate, supported choice — not a stripped-down version.
- **Two-axis model is more complex.** "Profiles control enforcement, layers control functionality" is clean once
  understood but is more conceptual overhead than "install ARC, you're done." Documentation must make this intuitive
  without requiring users to understand the model abstractly.
- **STRATEGY-INDEX varies by layer.** strategy-backlog-organization.md is present only with Solo PM. This is a minor
  break in the "everything is always present" guarantee from ADR-004, though it affects exactly one entry.

### Risks

- **PM layer maintenance burden.** Two optional layers to maintain, test, and keep compatible with Core evolution.
  Changes to Core extension points must not break PM layer handlers. Regression testing needs layer-aware coverage.
- **Layer boundary drift.** Future Core changes might inadvertently introduce PM dependencies. This requires ongoing
  discipline — the audit provides the baseline, but the boundary must be maintained as the framework evolves.
- **Solo-to-team migration.** A solo developer growing into a team needs to switch from Solo PM to Team PM (or drop PM
  entirely). The mechanics (`arc init --reconfigure`) exist, but data migration (atomic tasks moving from `active/` to
  `team/{name}/`, backlog items moving to external tracker) needs design in WU3.
- **WU3 plan requires updating.** plan-wu3-cli-distribution.md currently describes binary solo/team with identical file
  sets per ADR-004. This ADR extends that model with the PM dimension. The WU3 plan must be updated before
  implementation begins.
- **Team PM may feel thin.** Per-developer ATOMIC-TASKS, a branch inbox, external tracker integration guidance, and an
  honest boundaries document is a small deliverable. The value is real (conventions and integration) but may not feel
  substantial enough to justify a named layer. If this proves true, Team PM could be folded into Core as optional team
  conventions rather than a separate layer.

---

Context: tasks-methodology-completion.md (Pre-Task 4.1 evaluation — backlog infrastructure)
