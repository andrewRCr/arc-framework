# Plan: Methodology Completion & Structural Validation (WU2)

**Purpose:** Implement all methodology changes that WU1's design decisions make possible, then
validate the result with a structural inventory of the `.arc/` file tree.

**Status:** Draft
**Created:** 2026-02-22

---

## Context

WU1 (Core Philosophy & Configurability Architecture) produces ADRs and strategy documents that
answer every design question ARC's methodology changes depend on: what's configurable vs.
non-negotiable, what goes in `arc-config.yml`, how extension points work, how the session model
is framed, how team and external-tool users are accommodated. WU2 consumes those outputs and
turns them into concrete changes across existing docs, hooks, and templates.

WU2 also absorbs the structural validation pass that was originally conceived as a separate work
unit. Running it at the end of WU2 — after all methodology changes land — produces an accurate
inventory that reflects the final state, not an intermediate snapshot. The inventory directly
feeds WU3 (CLI design), which needs file classification to reason about what gets templated,
what gets updated, and what users own.

---

## Inputs

**Primary (WU1 outputs):**

- ADR 1: Core Identity / Non-Negotiables — constrains what can be configurable; every
  doc change that relaxes or enforces a constraint must align with this decision
- ADR 2: Session Model — determines whether session workflow changes are framing adjustments
  or structural opt-out mechanisms (significant scope difference for WU2)
- ADR 3: Agent-Agnosticism Assessment — scopes which workflow assumptions are fixed vs. variant
- ADR 4: Configurability Architecture — the `arc-config.yml` schema; hooks read from this
- ADR 5: Extension Point Conventions — the format/placement for prose extension points in
  workflows; WU2 adds them
- ADR 6: Progressive Adoption Tiers — determines whether tier differences are config-driven
  (WU2 scope) or documentation-driven (WU4 scope)
- ADR 7: External Tool Compatibility — shapes how Jira/Linear workflow guidance is written
- ADR 8: Merge Strategy Support — shapes the squash merge guidance and `archive-completed.md`
  merge command

**Source material consumed and superseded by this plan:**

- `temp-audit-adopter-experience.md` — dealbreaker and friction inventory
- `temp-audit-multi-branch-team.md` — multi-branch and team workflow gap inventory
- `plan-arc-methodology-gaps.md` — workflow and convention gaps from the structural readiness
  pass; the configurability architecture item from this plan graduates to WU1

These three documents should not be consulted directly during WU2 execution. This plan distills
their change inventories into actionable work items, with WU1 ADRs providing the design
decisions that resolve open questions.

---

## Change Inventory

Changes are grouped by cluster. Within each cluster, items are ordered by dependency and
severity. All changes listed here assume WU1 ADR decisions are available; specific behavior
at edges (e.g., exactly what `arc-config.yml` settings are added) follows WU1 outputs.

### Cluster A: Dealbreaker Resolutions (Hook Configurability)

These three items would prevent adoption for common team configurations. Resolution in each
case is: update the relevant hook(s) to read from `arc-config.yml` using the schema WU1
defines, and update documentation to describe the new behavior.

**A1. Commit format configurability** (resolves Audit 1 D1)

- Update `.arc/system/githooks/commit-msg` and `.arc-internal/system/githooks/commit-msg`
  to read a `commit_format` setting (Conventional Commits as default, pattern override
  as alternative)
- Consider whether format check, Context footer check, and subject length check should be
  independently toggleable (ADR 4 decision)
- Update hook inline comments to explain the config-reading behavior

**A2. Context footer configurability** (resolves Audit 1 D2)

- Update both `commit-msg` hooks to read a `context_footer` setting:
  `required` (current default) | `recommended` (warn only) | `disabled` (skip)
- Consider a `context_pattern` setting allowing custom footer formats (e.g., Jira ticket
  reference) per ADR 7 external tool compatibility decision
- Update hooks to support the configured behavior at each level

**A3. Merge strategy support** (resolves Audit 1 D3)

- Remove or qualify "no squash merge" as a blanket rule in:
    - `atomic-commit.md` (Branch Practices section)
    - `strategy-work-organization.md` (Branch Practices section)
- Update `archive-completed.md` merge command to reference `merge_strategy` config rather
  than hardcoding `--merge`
- Add prose explaining how ARC's value survives squash merging: task list is the detailed
  record, PR description (derived from completion doc) carries context for squash scenarios

### Cluster B: arc-config.yml Expansion

This is the enabling infrastructure for Cluster A and several items in other clusters.

**B1. Expand arc-config.yml settings** (resolves Audit 1 S6)

- Add settings for all behaviors that WU1 ADR 4 designates as configurable:
  at minimum `commit_format`, `context_footer`, `merge_strategy`, plus any hook toggle
  settings ADR 4 specifies
- Maintain flat key-value / shallow-nesting format (shell-parseable without a YAML library)
- Update `.arc-internal/system/githooks/` equivalents in parallel with `.arc/system/githooks/`
- Document each setting, its values, and its default in `arc-config.yml` inline comments or
  a companion reference doc per WU1's documentation approach decision

**B2. Pre-commit hook language pattern extensibility** (resolves Audit 1 S7)

- Make debug statement patterns (currently JS/Python only) configurable in `arc-config.yml`
  or a dedicated hook config
- Make meta-project reference file extensions configurable for the same reason
- Add hook comments noting that adopters may need to adjust patterns for their domain
  (resolves the template usability gap from `plan-arc-methodology-gaps.md`)
- Scope per ADR 4: this is a method (language-specific checks), not a principle

### Cluster C: Session Model Reframing

Scope depends on ADR 2 output. The minimum is a framing/documentation change. If ADR 2
designates sessions as a configurable method, the scope expands to structural changes in
workflow files.

**C1. Reframe session model documentation** (resolves Audit 1 S4; per ADR 2 decision)

- In `strategy-development-methodology.md` (Session Context Management section): clearly
  distinguish the principle (context must be recoverable across work boundaries) from the
  mechanism (CURRENT-SESSION.md as current implementation for ephemeral-context agents)
- In session workflow docs (`session-init.md`, `session-handoff.md`): position
  CURRENT-SESSION.md as "the current best approach for ephemeral-context agents," not as
  a fundamental methodology element
- If ADR 2 designates sessions as a configurable method: add appropriate config-driven
  opt-out or extensibility per the ADR decision; update workflow steps to reflect
  `session_model` configuration options

### Cluster D: Multi-Branch Workflow Fixes

Items that resolve residual 1:1 branch-to-task-list coupling language and add missing
guidance for multi-branch work unit scenarios.

**D1. Fix process-task-loop.md coupling language** (Audit 2 Gap 1 — blocks adoption)

- Rewrite lines 14-16: replace "branch exists ↔ task list active" with language reflecting
  the many-to-one model (task lists archived when all tasks complete, not when any branch
  merges)
- Replace "archive immediately when branch deleted" with "archive when all tasks marked
  complete"
- The existing "See Work Organization Strategy for details" link is good; ensure the summary
  no longer contradicts the source

**D2. Add multi-branch archive guidance to archive-completed.md** (Audit 2 Gap 2)

- Add a "Multi-Branch Archive" section or callout in Phase 1 explaining the sequence:
    - Intermediate branch merges: branch cleanup only (delete branch, no archive move)
    - Full archive workflow (docs cleanup, completion doc, archive move) runs once after
      the final branch merges and all tasks are complete
    - Completion doc covers the entire task list scope across all branches
- The Archive Timing section (lines 11-18) is already correct; the procedural steps
  need to match it

**D3. Fix atomic-commit.md blanket incidental statement** (Audit 2 Gap 3)

- Line 125: replace "Incidental work commits to the current branch (no separate branches)"
  with: "Trivial incidental work commits to the current branch. Substantial incidental work
  with dedicated task lists gets its own branch — see manage-incidental-work.md and
  work-organization.md § Incidental Work Model."

**D4. Fix manage-incidental-work.md coupling language** (Audit 2 Gap 4)

- Line 136: replace "Archive immediately after branch merge — task list in `.arc/active/`
  ↔ branch exists" with "Archive when all tasks complete — see archive-completed.md for
  timing"
- Incidental work is typically 1:1 so practical impact is minimal, but language must be
  consistent with the established model

**D5. Fix work-organization.md lifecycle inconsistency** (Audit 2 Gap 5)

- Lines 352-375: the lifecycle steps show branch deletion → archival as sequential/causal
  steps, while the text immediately below correctly states archival triggers on task
  completion
- Add parenthetical to the archive step: "(all tasks complete — in 1:1 scenarios this
  coincides with branch deletion)" or restructure to separate the two as independent
  actions

**D6. Create rotate-branch.md supplemental workflow** (Audit 2 Gap 8; methodology-gaps plan)

- New file: `.arc/system/workflows/arc/supplemental/rotate-branch.md`
- Cover the clean handoff from one branch to the next within a work unit (no archival,
  no completion doc, no PROJECT-STATUS/ROADMAP — those are end-of-work-unit concerns)
- Required sections: decision criteria (when to rotate: phase boundary, diff size,
  reviewability), pre-merge checklist (quality gate tier, task list Branch(es) field
  update, PR description pattern for partial work), next branch setup (create from
  updated base after merge), session state update
- Reference from `strategy-work-organization.md` section 5 and `process-task-loop.md`

**D7. Canonicalize atomicity check in process-task-loop.md** (WU1 incidental)

- An atomicity check was added to step 4 of the internal `process-task-loop.md` during
  WU1 to address recurring non-atomic commits (task work + unrelated fixes bundled)
- WU2 should review the internal version and port to the canonical `.arc/` copy,
  ensuring consistent language with the Commit Standards in
  `strategy-development-methodology.md`
- The check is lightweight (a prompt before staging, not a workflow invocation) and
  complements the existing atomic-commit supplemental workflow for complex cases

**D8. Add Branch(es) field update guidance** (Audit 2 Gap 9)

- Add guidance to `rotate-branch.md` (new, D6) and `process-task-loop.md`: "When creating
  additional branches for a task list, update the `Branch(es)` field in the task list header"
- Covers all scenarios where additional branches are created after initial activation

### Cluster E: Team Workflow Adaptation

Items that make workflows aware of team mode (per-member session files, concurrent pairs,
workflow adaptations connecting team conventions to execution).

**E1. Add Workflow Adaptations section to strategy-team-coordination.md** (Audit 2 Gap 13 —
blocks adoption)

- The strategy establishes conventions but doesn't describe how existing workflows change
  in team mode — a team adopter must independently figure this out
- Add a "Workflow Adaptations" section with a concise mapping of workflow changes for team
  mode: which files change path (shared → `team/{name}/`), how "one task at a time" scopes
  per pair, when integration branch vs. personal branch is used
- A brief reference table is sufficient; depth exists in the referenced workflows

**E2. Add team mode callouts to session workflows** (Audit 2 Gap 6 — blocks adoption)

- `session-handoff.md`, `activate-work-unit.md` Step 7, `session-init.md` Step 2 item 8:
  add brief "Team Mode" notes where each references `CURRENT-SESSION.md`
- Note: in team mode, update `team/{your-name}/CURRENT-SESSION.md` instead of the shared
  file; reference `strategy-team-coordination.md § Session State`
- Per ADR 2: if sessions are a configurable method, the team mode notes should reference
  the config setting rather than being hardcoded conditionals

**E3. Add person-to-person task handoff protocol** (Audit 2 Gap 7)

- A lightweight protocol for task ownership transfer mid-work-unit:
    - Outgoing developer writes an enhanced session handoff with implementation context
    - Incoming developer reads it during session-init, updates ownership markers, bootstraps
      their own session file
- Add as a section to `strategy-team-coordination.md` or as a "Team Handoff" variant in
  `session-handoff.md`; the existing handoff format already captures most of what's needed,
  the gap is where the incoming developer finds the notes and how they bootstrap

**E4. Add per-pair qualification to strategy-development-methodology.md** (Audit 2 Gap 10)

- Session Documentation Control (line 138-140): add that in team mode, the reference is to
  the developer's personal session file
- Task Management Protocol (line 267-274): add that "complete one task at a time" is per
  developer-agent pair, not a global constraint in team mode

**E5. Add team mode adaptation to activate-work-unit.md** (Audit 2 Gap 12)

- Step 5: note that PROJECT-STATUS may list multiple branches when using team sub-branches,
  and the integration branch is what gets listed
- Step 7: note that in team mode each developer updates their own session file; reference
  `strategy-team-coordination.md` for team branching patterns

**E6. Add team ATOMIC-TASKS path to weekly-review.md** (Audit 2 Gap 11)

- Step 2: add team mode note that each developer also reviews `team/{name}/ATOMIC-TASKS.md`
  for personal tasks
- Post-review commit: in fully protected mode, a micro-branch is needed for review commits
  (this also resolves Gap 17)

### Cluster F: Cosmetic Fixes (One-Line Edits)

These are trivially small and can be applied directly. No design decision from WU1 is needed.

**F1. task-list-formatting.md incidental Branch field** (Audit 2 Gap 14)

- Lines 116-117: change incidental task list header from `**Branch:**` to `**Branch(es):**`
- Add the same "additional branches comma-separated" note from the feature/technical rules

**F2. CURRENT-SESSION.template.md team comment** (Audit 2 Gap 15)

- Add an HTML comment near the top noting: "In team mode, each developer maintains their
  own copy at `team/{name}/CURRENT-SESSION.md`. See strategy-team-coordination.md."

**F3. AGENTS.template.md one-task-at-a-time qualification** (Audit 2 Gap 16)

- Line 58: append "(per developer-agent pair in team mode)" to the one-task-at-a-time
  principle

### Cluster G: Convention and Workflow Gaps

Items from `plan-arc-methodology-gaps.md` that are workflow completeness or convention
concerns (not adopter experience friction — those are Clusters A-F).

**G1. Add verification section to completion doc template** (methodology-gaps plan)

- Update the completion doc template in `archive-completed.md` to include an explicit
  "Verification" section
- Makes it obvious during the archive workflow that verified results belong in the
  completion doc, and that this section is what PR authors use for the test plan convention
- Possibly update `verify-completion.md` with output format guidance pointing to this section

**G2. Close the post-review quality gate gap** (methodology-gaps plan)

- `archive-completed.md` Phase 2, Step 7: currently no mechanism ensures quality gates
  are re-run after review-driven changes
- Evaluate options: mandatory Tier 1 re-run after any review-driven commits (lightweight);
  full Tier 2/3 re-run if changes exceed a threshold; success criteria spot-check
- Add the selected approach to Phase 2 of the archive workflow
- Possibly update `agent-pre-merge-review.md` and `verify-completion.md` as needed

**G3. Establish evolution guidance for semi-immutable documents** (methodology-gaps plan)

- ADRs: amendment mechanics for minor corrections vs. full supersession are undocumented;
  research ADR amendment practices (RFC 2119-style, ADR tools ecosystem) before designing
- PRDs: no formal guidance; completed PRDs may drift from implementation with no documented
  convention for whether to amend, annotate, or leave as historical record
- Key design question to answer first: inline annotations vs. separate amendment sections;
  ADRs have prior art, PRDs likely need a lighter touch
- Output: add an "Amending This Document" section convention (or equivalent) to relevant
  templates and reference it from the development methodology

**G4. Add intermediate work-unit status** (methodology-gaps plan)

- Three realities that two states can't represent: actively being worked on, done but
  unmerged, merged and archived
- Select a label for the intermediate state (options: "In Review", "Pending Merge",
  "Awaiting Review", "Complete (unmerged)")
- Standardize canonical status values across all docs that reference them
  (`maintain-task-notes.md`, `archive-completed.md`, `agent-pre-merge-review.md`,
  PROJECT-STATUS template, ROADMAP conventions)
- Update `archive-completed.md` to set the intermediate status in Phase 1 (pre-merge)
  and final status in Phase 3 (post-merge)

**G5. Prevent version reference drift** (methodology-gaps plan)

- When a versioned source-of-truth doc (e.g., `DEVELOPMENT-RULES.md`) gets its version
  bumped, downstream files that reference the version can silently drift
- Evaluate options: behavioral norm in development methodology (agent cascades version
  updates), githook validation (automated check that references match source), or both
- Implement the selected approach; start with the concrete version reference case,
  potentially broaden to other cross-doc references

**G6. Expand incidental context patterns in commit-msg hook** (methodology-gaps plan)

- Current hook accepts only two incidental patterns: `discovered during Task X.Y` and
  `discovered during code review`; incidental issues surface during other activities too
  (archival, PR preparation, quality gate runs, session initialization)
- Options: add specific patterns for common activities, or generalize to
  `(incidental - discovered during <freetext>)` with a broader regex
- Touchpoints: both `commit-msg` hooks (`.arc/system/` and `.arc-internal/system/`)
- Note: if A2 (context footer configurability) ships a custom pattern option, this may
  be partially resolved; evaluate overlap before implementing separately

**G7. Reconsider PROJECT-STATUS location** (methodology-gaps plan)

- Currently in `reference/constitution/` alongside identity docs (META-PRD,
  TECHNICAL-OVERVIEW, DEVELOPMENT-RULES); PROJECT-STATUS is operational state that
  changes regularly, closer in nature to ROADMAP than to constitutional docs
- Options: `.arc/` root (visible within ARC directory, not buried), `reference/` root
  (not `constitution/`), or leave it
- If moved: update all references in `02_define-project.md`, `archive-completed.md`,
  `weekly-review.md`, PROJECT-STATUS template, and any workflow referencing the
  current path

### Cluster H: Minor Convention Adjustments

**H1. Clarify reference-style link convention scope** (Audit 1 M1)

- `strategy-development-methodology.md` currently requires reference-style links for all
  cross-file references. This is a style preference, not a principle.
- Adjust to recommendation rather than requirement, or scope enforcement to `.arc/` directory
  files only. Teams used to inline links shouldn't face friction over link syntax.

**H2. Evaluate planning branch independence from protection modes** (Audit 1 M2)

- Currently, planning branches are required in partially and fully protected modes. There's no
  way to use partial protection without planning branches.
- Already configurable at the protection mode level, so this is low friction. Consider whether a
  `planning_branches` setting independent of protection mode adds value, or whether this is
  adequately served by existing modes.

### Cluster I: Task List Formatting (Configurable Strictness)

**I1. Separate parseable minimum from recommended full format** (resolves Audit 1 S2)

- `strategy-task-list-formatting.md`: identify and document the "parseable minimum"
  (checkboxes with identifiers sufficient for agent parsing) as distinct from the
  "recommended full format" (current complete spec)
- The 800+ line formatting guide remains the recommended approach; the parseable minimum
  is what agents actually require and what hooks enforce
- Make the pre-commit task numbering check configurable per ADR 4: error (current
  default) | warning | off
- Update hook behavior to read the configured strictness level from `arc-config.yml`

**I2. Relax emoji prohibition to discouraged** (resolves Audit 1 M5)

- `strategy-task-list-formatting.md`: change emoji prohibition in task planning from
  "prohibited" to "discouraged"
- Small change with meaningful effect: teams that use emojis as visual priority or
  status indicators are no longer explicitly non-compliant

### Cluster J: Archive Workflow Ceremony Scaling

**J1. Scale archive ceremony to work size** (resolves Audit 1 S5, M4)

- `archive-completed.md`: define a simplified archive path for incidental work below a
  complexity threshold (e.g., single-phase, under 2 hours of effort)
- Simplified path: move task file to archive directory, update active directory listing,
  done — no completion doc required
- Reserve the full ceremony (completion doc, claim verification, completion doc verification
  section from G1) for planned work and substantial incidental work
- Update "All work gets a completion document (feature, technical, AND incidental)"
  language to reflect the new optional threshold

### Cluster K: External Tool and Dual-Tracker Guidance

Per ADR 7 decisions.

**K1. Streamline dual-tracker workflow guidance** (resolves Audit 1 S3)

- Document a streamlined pattern for teams with external trackers: ARC task lists as
  "working scratchpad," external tracker as "status record"
- Update relevant workflow prose to reference the practice rather than the tool where
  ADR 7 indicates (e.g., "update your task tracking" rather than "mark `[x]` in the
  task list") with ARC-specific examples as defaults
- If ADR 7 designates extension points at tool boundaries, add them to workflow docs
  at the task completion, spec management, and status reporting touchpoints
- If ADR 4 adds a `task_tracking` config setting, update hook behavior to reduce
  ARC task list reference insistence when an external tracker ID pattern is configured

### Cluster L: Progressive Adoption Tier Implementation

Per ADR 6 decisions. Scope depends significantly on whether tiers are config-driven (WU2
scope), documentation-driven (WU4 scope), or structural (WU3/CLI scope).

**L1. Implement basic vs. full tier behavior** (resolves Audit 1 S1, partially S5)

- If ADR 6 designates tiers as config-driven: update workflow steps to reflect
  `adoption_tier` configuration, reducing mandatory ceremony for basic tier
  (specifically: activate-work-unit ceremony, PROJECT-STATUS/ROADMAP update requirements,
  archive workflow steps)
- If ADR 6 designates tiers as documentation-driven: this item moves to WU4 (docs site
  content) and is excluded from WU2 scope
- If ADR 6 designates tiers as structural (different files installed): this item moves
  to WU3 (CLI) and is excluded from WU2 scope
- Minimum regardless of ADR 6 outcome: document the "one task at a time" deferred
  review escape hatch more prominently for experienced users (resolves Audit 1 M3)

### Cluster M: Structural Validation Pass

Runs at the end of WU2, after all methodology changes are in place. Produces the inventory
WU3 (CLI design) needs to reason about file classification and update mechanics.

**L1. File classification inventory**

- Categorize every `.arc/` file as one of: framework (ARC-owned, update freely),
  configurable (method layer, merge carefully), scaffolded (project-owned after init),
  project-owned (never touched by ARC updates)
- Output: a classification table or annotated file tree; format TBD during execution

**L2. Mixed-concern identification**

- Flag files that interleave framework-stable and project-configurable content at the
  paragraph level (the original motivation for this pass in `BACKLOG-TECHNICAL.md`)
- For each flagged file: note the specific paragraphs and propose whether separation is
  warranted or whether a comment/marker is sufficient
- WU2's methodology changes may have introduced new mixed-concern sections; validate
  the post-WU2 state, not the pre-WU2 state

**L3. Cross-cutting dependency mapping**

- Identify concepts that span multiple files and map their blast radius
- Which concepts, if changed, would require updates across N+ files?
- Output informs WU3 CLI design: update commands need to know which files move together

---

## Deliverables

### Modified Files

All existing files listed under Clusters A-K that receive edits. The exact set is
determined during execution as WU1 ADR decisions clarify scope; the inventory above
identifies the candidates.

### New Files

- `rotate-branch.md` — supplemental workflow for mid-work-unit branch rotation (D6)
- Any new `arc-config.yml` settings documentation if WU1 designates a companion
  reference doc rather than inline comments

### Structural Validation Outputs (Cluster M)

- File classification inventory (L1)
- Mixed-concern report (L2)
- Cross-cutting dependency map (L3)

Format for these outputs TBD during execution — they may be a single document, separate
documents, or inline annotations. They are consumed by WU3 and do not need to be
user-facing.

---

## Approach

1. **Read WU1 outputs first.** All ADR decisions must be in hand before starting
   Cluster A (hooks read from config), Cluster C (session model scope), Cluster K
   (external tool extension points), and Cluster L (tier implementation scope). Clusters
   F, D (except D6), and G items G1-G2 are independent of WU1 and can proceed in
   parallel if sequencing permits.

2. **Apply trivial fixes early** (Cluster F). These are one-line edits with no design
   dependencies. Applying them first reduces noise in subsequent reviews.

3. **Hook changes require paired updates.** Every hook change must update both
   `.arc/system/githooks/` and `.arc-internal/system/githooks/` in the same commit.
   Config reading behavior must be consistent across both copies.

4. **Cluster D before Cluster E.** The multi-branch coupling fixes (D) establish the
   correct mental model in workflow files before the team adaptation callouts (E) build
   on top of it.

5. **G3 (doc evolution guidance) requires research before writing.** Research ADR
   amendment practices before designing the convention. This is the only item in WU2
   that has a research-first prerequisite internal to the work unit.

6. **Structural validation (Cluster M) runs last**, after all other changes are
   committed. It validates the final state.

---

## Dependencies

**Upstream:**

- WU1 (Core Philosophy & Configurability Architecture) — all 8 ADRs must be
  available before WU2 begins; specific clusters that block on specific ADRs are
  noted in the change inventory above

**Downstream:**

- WU3 (CLI Design) — consumes the structural validation output (Cluster M) and
  references the `arc-config.yml` schema implemented in Cluster B
- WU4 (Public Release) — if ADR 6 designates tiers as documentation-driven,
  Cluster L scope shifts to WU4

---

## Exclusions

- No new ADRs — design decisions are WU1's scope; WU2 implements them
- No CLI tooling — hooks are shell scripts, not CLI commands; that is WU3 scope
- No docs site content — that is WU4 scope
- No framework self-testing for configuration combinations — noted as a future
  concern in `plan-arc-methodology-gaps.md`; remains out of scope for 1.0
- No agent-agnosticism overhaul beyond what ADR 3 specifies — the audit item
  identified it as a lens, not a mandate for alternate workflow versions

---

**Created:** 2026-02-22
