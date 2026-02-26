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

### Cluster C: Session Model and Context Loading Architecture

Scope depends on ADR 2 output for session model items. Context loading items are
specified by WU1.5 Gap 2 resolution (see `notes-foundational-gap-closure.md` § Evaluation:
Context Loading Design for full analysis and evidence base).

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

**C2. Create `DEV-RULES.ARC.md`** (WU1.5 Gap 2 — core document restructure)

- New file: `.arc/reference/constitution/DEV-RULES.ARC.md`
- Classification: Reference (framework-owned, updated through merge)
- Extract always-applicable behavioral rules from `strategy-dev-methodology.md`:
  commit control, verification protocol, session documentation control, task management
  protocol, strategy document protocol, core document reference protocol
- Each rule is brief and actionable — a few lines, not a full reference section
- Two categories of rules, visibly distinguished:
    - **Non-negotiable** (principle-backed, P1-P11): no override path
    - **Strong defaults** (convention-level): inline method-override pointer
      ("Default: X. Override: `arc-methods.md#Y`")
- Target: ~15-20 distinct instructions total
- Include explicit Tier 2a triggers for on-demand content:
    - "Before starting task execution, load the process-task-loop workflow"
    - "Before complex commits, load the atomic-commit workflow"
    - "For detailed format specs and elaboration, consult strategy-dev-methodology"
- **Defaults filter:** During extraction, evaluate each rule against P1-P11 traceability.
  Rules that don't trace to a principle are either (a) positioned as conventions with
  explicit configurability paths, or (b) removed as author preference leakage

**C3. Rename and slim `DEVELOPMENT-RULES.md` → `DEV-RULES.PROJECT.md`** (WU1.5 Gap 2)

- Rename: `.arc/reference/constitution/DEV-RULES.PROJECT.md`
- Classification: Scaffolded (project-owned after init, unchanged)
- Remove all ARC methodology content (now in DEV-RULES.ARC)
- Retain only project-specific content: quality gates and commands, testing
  requirements, file organization rules, architecture documentation guidance
- Update references throughout codebase (session-init, CLAUDE.md, etc.)

**C4. Slim `strategy-development-methodology.md` to domain reference** (WU1.5 Gap 2)

- Remove always-applicable rules (moved to DEV-RULES.ARC)
- Retain domain-specific reference elaboration:
    - Commit message format details, examples, and edge cases
    - Test-first decision tree and detailed protocol
    - Code documentation standards and conventions
    - Session context management detailed guidance
- Add new section: **Context Loading Architecture** — tier model formalization:
    - Define Tiers 1, 2a, 2b, 3 with reliability characteristics
    - Evidence confidence classification (empirically validated / experience-validated
      / first-principles) visible inline with each tier's description
    - Instruction budget guideline: target <80 distinct instructions in Tier 1
    - Adopter customization guidance (their project's Tier 1 may differ from
      ARC's defaults)
    - Maintenance practice: audit for instruction density and cross-document conflicts
      when modifying Tier 1 documents
- Document becomes Tier 2a content (triggered from DEV-RULES.ARC, no longer Tier 1)

**C5. Redesign session-init document loading sequence** (WU1.5 Gap 2)

- Rewrite `session-init.md` Step 2 (Load AI Context) to reflect the new Tier 1:
    1. `AGENTS.md` — project identity, tech stack, working guidelines
    2. Agent-specific file (e.g., `CLAUDE.md`) — capabilities, thresholds
    3. `DEV-RULES.ARC.md` — ARC behavioral rules (replaces strategy-dev-methodology)
    4. `DEV-RULES.PROJECT.md` — project-specific rules (replaces DEVELOPMENT-RULES)
    5. `STRATEGY-INDEX.md` — index of strategy guidance (enables Tier 2b awareness)
    6. `QUICK-REFERENCE.md` — environment context, command patterns
    7. `CURRENT-SESSION.md` — active work state
    8. Active task list (partial: overview + current task)
- process-task-loop no longer in Tier 1 loading sequence; Tier 2a trigger in
  DEV-RULES.ARC covers it ("before starting task execution, load the process-task-loop")
- strategy-dev-methodology no longer in Tier 1; Tier 2a trigger in DEV-RULES.ARC
  covers it ("for detailed format specs and elaboration")
- Net effect: 8 documents (down from 9), ~47-73 instructions (down from ~80-125)
- ⚑ **Agent switching note (WU1.5 PRD Req 11):** ADR-007's two-file split inherently
  handles agent switching. `WORK-STATUS.md` is factual project state — fully agent-
  agnostic, no adaptation needed. `SESSION.md` carries qualitative context about the
  work, not the agent — agent-specific content there would be unusual in practice.
  Add a brief acknowledgment in session-init's SESSION.md loading step: if SESSION.md
  was written by a different agent, extract factual content and disregard any agent-
  specific references (the incoming agent has its own guidance in its agent file).
  No structural changes, no new workflow items — just awareness.

**C6. Formalize Tier 2a trigger pattern in existing workflows** (WU1.5 Gap 2)

- Audit all Tier 1 documents for ad-hoc cross-references to Tier 2 content
- Convert to consistent Tier 2a trigger format: brief, explicit, actionable
  ("Before X, load Y")
- Ensure STRATEGY-INDEX entries include brief "when working on X" phrasing for
  each strategy (strengthens Tier 2b → Tier 2a for the most common domains)
- Interacts with Cluster O `post-context-load` extension point (O1) — that's
  where adopters add their own Tier 2a triggers

**C7. Handle first-session bootstrap and "no active work" state** (WU1.5 Gap 3)

ADR-007 replaces `CURRENT-SESSION.md` with `WORK-STATUS.md` (tracked) + `SESSION.md`
(gitignored). Session-init reads `WORK-STATUS.md` for orientation — but after initial
setup (`01_initialize-arc.md` → `02_define-project.md`), no work unit is active yet. The
same state recurs between work units (after archiving one, before activating the next).

Changes:

- **`01_initialize-arc.md`**: Scaffold `WORK-STATUS.md` during init verification with a
  "no active work" default state. All fields present with empty/placeholder values:

  ```markdown
  **Work Unit**: [none]
  **Branch**: main
  **Task List**: [none]
  **Current Task**: —
  **Blockers**: [none]
  **Next Action**: Create first PRD (see 1_create-prd.md)
  ```

  This makes `WORK-STATUS.md` always exist from first init — no "file missing" edge case.

- **`session-init.md`**: Add a detection path for the "no active work" state in Step 2
  (active work context). When `WORK-STATUS.md` has `Work Unit: [none]` or equivalent:
    - Skip task list loading (no task list to load)
    - In Step 3 (Confirm Orientation), report the state and point to the appropriate
      next workflow: `1_create-prd.md` if no PRDs exist, `activate-work-unit.md` if a
      backlog task list exists but isn't activated
    - This is not a failure or mismatch — it's a legitimate, recurring project state

- **`activate-work-unit.md`** Step 7: Update to reference `WORK-STATUS.md` instead of
  `CURRENT-SESSION.md`. Activation populates the "no active work" placeholder with real
  values (work unit name, branch, task list path, first task).

- **`archive-completed.md`**: After archival, reset `WORK-STATUS.md` back to the "no
  active work" state. This completes the lifecycle: init → activate → work → archive →
  back to "no active work."

- **`SESSION.md` handling**: Session-init already handles missing `SESSION.md` gracefully
  per ADR-007 Part 4 (check local file → check git notes → start with clean template).
  No additional first-session spec needed for `SESSION.md`.

Note: C5 (session-init loading sequence redesign) currently references `CURRENT-SESSION.md`
at step 7. When implementing C5 + C7 together, replace with `WORK-STATUS.md` and
incorporate the "no active work" detection described here.

**C8. Stabilize task references in WORK-STATUS.md** (WU1.5 Gap 4)

`WORK-STATUS.md` (ADR-007's replacement for `CURRENT-SESSION.md`) references the current
task. The existing convention uses task number + line number (e.g., "Task 4.1 (line 228)").
Line numbers break on any edit above the referenced line — a routine occurrence during
implementation. Task numbers break on phase restructuring — less common but not rare.
Both are fragile anchors.

**Convention change — triple-anchor reference format:**

```
Current Task: Task 4.1 — Design first-session bootstrap (line ~228)
```

Three signals with decreasing fragility:

1. **Task title snippet** (stable) — survives renumbering and line shifts. Only changes
   if the task's identity changes, which warrants updating the reference anyway. The
   truly stable anchor.
2. **Task number** (semi-stable) — survives line edits, breaks on phase restructure.
   The primary search key for grep-based lookup.
3. **Line number with tilde** (disposable hint) — `~` signals "approximate." Enables
   the agent's Read tool offset parameter for fast direct-jump, but is not trusted as
   authoritative.

**Session-init lookup behavior (specify in `session-init.md`):**

1. Jump to line hint (fast path — usually correct)
2. Verify task number pattern at that location
3. If mismatch: search file for task number pattern (handles line drift)
4. If task number not found: search for title snippet (handles renumbering)
5. If nothing matches: report to user — something fundamental changed

Steps 1-2 cover the common case (line hint is still valid). Steps 3-4 handle the
restructuring cases gracefully. Step 5 is the safety net.

**Session-handoff write behavior (specify in `session-handoff.md`):**

When writing the "Current Task" field, include all three anchors. The line number is
best-effort — the agent reads the task list during handoff anyway, so capturing the
current line number is trivial.

**Workflow updates:**

- **`session-init.md`**: Replace the hard requirement "VERIFY: Current Task field must
  include line number" with the triple-anchor lookup protocol above. The current hard-stop
  on missing line numbers becomes unnecessary — the title snippet provides a reliable
  fallback.
- **`session-handoff.md`**: Update the "Current Task" format in the handoff template and
  examples to use triple-anchor format. Current examples show `Task 3.3 (line 247)` —
  change to `Task 3.3 — Write unit tests (line ~247)`.
- **`activate-work-unit.md`** Step 7: Update the "Current Task" format guidance to match.
- **`WORK-STATUS.md` template** (from C7): Use triple-anchor format in the template and
  field documentation.
- **`strategy-task-list-formatting.md`**: No structural change to task list format itself.
  Task numbering, letter scheme, and hierarchy are unaffected. Consider adding a brief
  note under Task List Headers clarifying that task numbers are human-readable IDs, not
  stable database keys — they may shift during implementation restructuring.

**Commit message references unaffected:** The `Context: tasks-foo.md (Task 4.1)` format
in commit messages is a historical record, not a navigational anchor. Task numbers in
committed messages don't need updating when phases restructure — they're accurate as of
the commit date. No change needed.

Note: Implement C8 alongside C5 and C7 — all three touch session-init's active work
context loading. The triple-anchor format applies to `WORK-STATUS.md` (C7's new file),
read by the redesigned session-init sequence (C5), with the lookup protocol defined here.

**C9. Add mismatch recovery protocol to session-init** (WU1.5 Gap 9)

Session-init Step 4 currently treats all mismatches identically: stop and ask. No trust
hierarchy, no severity classification, no self-recovery path. Gap 9 adds tiered recovery
based on source reliability.

**Trust hierarchy (highest to lowest):**

1. **Git state** (`git status`, `git log`, branch existence) — live system, can't be stale
2. **Task list checkboxes** — tracked file, committed atomically with work
3. **WORK-STATUS.md** — tracked, updates with commits (ADR-007); high reliability
4. **SESSION.md** — gitignored, only as fresh as last handoff; variable reliability

**Tiered recovery model:**

- **Auto-recover with notice** — when git state and task list agree, and only the session
  document is behind. The correct state is unambiguous; session doc is simply stale.
  Agent proceeds with the authoritative state and reports what it corrected.

  Scenarios:
    - Session doc says "uncommitted files" but `git status` shows clean → work was committed
    - Session doc says "Task 3.2 current" but task list shows 3.2 `[x]`, 3.3 `[ ]` → task
      was completed
    - Session doc describes WIP but `git log` shows it committed → same as first scenario

  Pattern: git + task list agree, session doc is the outlier. Not ambiguity — staleness.

- **Stop and ask** — when the correct state requires human judgment. Agent reports the
  mismatch with diagnostics (what each source says, which sources agree/disagree) but does
  not act.

  Scenarios:
    - Session doc says branch X but current branch is Y → can't infer intent
    - Session doc references a task list that doesn't exist → archived? deleted? moved?
    - Git status shows uncommitted changes not mentioned in session doc → user's parallel
      work? crashed session leftovers?

  Pattern: ambiguous intent, multiple plausible explanations.

**Workflow update (specify in `session-init.md`):**

- Restructure Step 4 from a flat "stop and ask for everything" into the two-tier model
- Add the trust hierarchy as a reference (agents use it to diagnose and report)
- Auto-recovery reports use a consistent format: "Session doc said X. Git/task list show Y.
  Proceeding with Y." — visible to user, not silent
- Stop-and-ask reports include diagnostics: what each source says, which agree/disagree,
  and possible explanations
- Preserve the existing safety principle: "do not attempt to fix state on your own" for
  the stop-and-ask tier; auto-recovery tier adds a bounded exception for unambiguous
  staleness

**ADR-007 interaction:** WORK-STATUS.md updates atomically with commits, so the
auto-recoverable scenarios (1-3) become much rarer — the tracked state file stays
current. The recovery protocol primarily fires for SESSION.md staleness or edge cases
where handoff was skipped entirely. The trust hierarchy still applies: git > task list >
WORK-STATUS.md > SESSION.md.

Note: Implement C9 alongside C5 and C7 — session-init redesign (C5) is the natural home
for this protocol. The mismatch detection step comes after context loading (C5's scope)
and after task reference lookup (C8's scope), so it runs with full context available.

**C10. Add staleness detection to session-init** (WU1.5 Gap 10)

Session-init reads session state without freshness verification. If a developer skips
handoff, the session doc may be sessions old with no warning — and the staleness may not
produce a detectable mismatch (task hasn't changed, just context is missing from the
skipped session). Gap 10 adds proactive staleness detection that runs before C9's
mismatch recovery.

**How ADR-007 narrows the problem:**

- WORK-STATUS.md updates atomically with commits → inherently fresh for task state.
  Staleness signals a workflow violation (rare) or non-task commits (normal).
- SESSION.md (gitignored) only updates at handoff → staleness is the expected failure
  mode when handoff is skipped. Missing qualitative context (debugging insights,
  approach decisions, things tried) from the skipped session.

**Staleness signal — commit hash anchor:**

- `session-handoff.md` writes a "Commit at Handoff" field into SESSION.md with the
  hash of HEAD at session end. Objective, no filesystem timestamp dependency.
- Session-init compares this anchor against current HEAD:
    - **Match**: SESSION.md is current — no staleness
    - **Mismatch**: commits happened after the last handoff. Count the gap:
      `git rev-list --count <anchor>..HEAD`
- For WORK-STATUS.md: compare the last commit that touched it against HEAD:
  `git log -1 --format=%H -- .arc/active/WORK-STATUS.md` vs HEAD.
  Under ADR-007 these should match (atomic updates); drift is noteworthy.

**Staleness is informational, not blocking:**

- Staleness alone doesn't prevent initialization — incomplete context is better than
  no context. The agent proceeds but with awareness.
- Report format: "SESSION.md was last updated at `<hash>` ([N] commits ago).
  Session context may be incomplete."
- For WORK-STATUS.md drift: "WORK-STATUS.md last updated in `<hash>`, but HEAD is
  [N] commits ahead. Task state may not reflect recent work." (This is the unusual
  case — more prominent warning.)

**Relationship to C9 (mismatch recovery):**

- Staleness detection runs BEFORE mismatch recovery in the session-init sequence
- If staleness is detected, the agent carries lower confidence in session doc content,
  naturally increasing reliance on git state and task list (higher-trust sources in
  C9's hierarchy)
- Staleness without mismatch = "session doc is incomplete but not wrong" (report,
  proceed). Staleness WITH mismatch = C9 handles it with informed confidence levels.

**Workflow updates:**

- **`session-init.md`**: Add a freshness check step between context loading (C5) and
  mismatch detection (C9). Sequence: load context → check freshness → detect
  mismatches → confirm orientation.
- **`session-handoff.md`**: Add "Commit at Handoff" field to the handoff template.
  Written automatically during handoff: `git rev-parse HEAD`. Lightweight addition
  to existing handoff protocol.
- **Orientation output (Step 3)**: If staleness detected, include in the orientation
  summary (existing "Blockers" or a new "Warnings" line). Not a blocker — just
  awareness.

Note: Implement C10 alongside C5, C7, C8, and C9 — all touch the session-init
sequence. C10 slots between context loading and mismatch detection.

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

**D2. Add multi-branch archive guidance to archive-completed.md** (Audit 2 Gap 2; WU1.5 Gap 8)

- ⚑ **WU1.5 Gap 8 design decision**: Archive trigger remains "all tasks `[x]`" — this
  starts the end-of-work-unit sequence. The Phase 2→3 gate in archive-completed enforces
  merge verification before the archive move (`git mv`). Three-operation model:
    - **Rotate** (mid-work-unit): merge current branch, create next — `rotate-branch.md` (D6)
    - **Complete** (all tasks `[x]`): write completion doc, enter archive-completed Phase 1
    - **Archive** (after final merge): Phase 3 `git mv` — gated on Phase 2 merge
- Add a "Multi-Branch Archive" section or callout in Phase 1 explaining the sequence:
    - Intermediate branch merges: rotate-branch workflow (branch cleanup, no archive move)
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

**D6. Create rotate-branch.md supplemental workflow** (Audit 2 Gap 8; methodology-gaps plan; WU1.5 Gap 8)

- ⚑ **WU1.5 Gap 8 role**: rotate-branch is the "Rotate" operation in the three-operation
  model (Rotate → Complete → Archive). It handles intermediate branch merges within a
  work unit — explicitly distinct from archive-completed, which handles end-of-work-unit.
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

**G8. Extract PRD format from create-prd workflow to template** (WU1.5 Gap 11)

- `1_create-prd.md` Step 4 currently defines the PRD format inline (~50 lines of section
  descriptions). WU1.5 created `reference/templates/template-prd.md` as a copy-ready
  template, so the workflow now duplicates the template
- Replace inline format definition with reference to `template-prd.md`, keeping a brief
  section summary in the workflow for orientation
- Touchpoints: `1_create-prd.md` (Step 4 and PRD Format section)

**G9. Strengthen create-prd discovery step** (WU1.5 Gap 11)

- `1_create-prd.md` Step 3 provides question categories (Problem/Goal, Scope,
  Requirements, Technical context, Unknowns) but no structured discovery protocol
- Reference the discovery checklist from `strategy-work-planning.md` as the
  "must-ask" questions before plan-to-PRD transition
- Especially relevant for AI agents, who benefit from explicit prompts to ask
  questions before generating output
- Touchpoints: `1_create-prd.md` (Step 3)

**G10. Reference planning lifecycle strategy from create-prd workflow** (WU1.5 Gap 11)

- `1_create-prd.md` Step 1 mentions plan documents exist but provides no reference to
  their convention
- Add reference to `strategy-work-planning.md` for plan-\* doc naming, purpose,
  and lifecycle conventions
- Touchpoints: `1_create-prd.md` (Step 1)

**G11. Enumerate deferred review stop conditions** (WU1.5 PRD Req 12)

- `3_process-task-loop.md` deferred review section says "stop if anything unexpected
  arises" without defining "unexpected." Agents interpret this inconsistently —
  too cautious (stop on every minor issue) or too optimistic (plow through problems).
- Add an enumerated threshold after the existing deferred review paragraph:

  **Must stop** (continuing would waste work or create problems):
    - Quality gate failure that can't be auto-fixed
    - Blocking dependency on work outside the deferred scope
    - Task requires design decisions not anticipated in the task description
    - Scope significantly exceeds what the task description implies

  **Continue with note** (unexpected but not blocking):
    - Minor quality gate issues fixed inline (e.g., lint auto-fix)
    - Task took longer than expected but completed successfully
    - Minor deviation from task plan that doesn't affect subsequent tasks

- Keep the enumeration concise — it's guidance, not an exhaustive ruleset. The
  principle is: stop when continuing would produce work the user hasn't approved.
- Touchpoints: `3_process-task-loop.md` (deferred review paragraph, lines 57-63)

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

### Cluster N: Guidance Discovery & Skill Integration

Items that improve how agents and humans discover relevant guidance, and formalize
ARC's relationship with portable behavioral guidance conventions (skills). Informed by
analysis comparing ARC's doc types (workflows, strategies) with the emerging Skills
convention across agent tools.

**Context:** ARC strategies and external skills share the same discovery weakness — both
rely on the agent recognizing "I'm doing X and there's guidance for X." ARC's
STRATEGY-INDEX is already a better solution than ambient skill discovery (explicit,
loaded into context), but can be improved. Meanwhile, teams adopting ARC will bring
existing skills and need a clear path for integration. The trigger/content separation
already working in `.claude/commands/` (thin dispatchers pointing to `.arc/` workflows)
is the right architectural pattern to formalize.

**N1. Enrich STRATEGY-INDEX with trigger hints**

- Add one-line "Consult when:" annotations to each entry in STRATEGY-INDEX, giving
  agents (and humans) sharper matching criteria than a description alone
- Example: `strategy-adr-methodology.md` — "Consult when: drafting or reviewing an ADR,
  deciding whether to write one"
- Dual-audience: helps agents connect task context to relevant strategies; helps humans
  scanning the index quickly identify what's relevant to their current work
- Low cost (one line per entry), high discoverability payoff

**N2. Create WORKFLOW-INDEX**

- New file: `.arc/system/workflows/WORKFLOW-INDEX.md` (or alongside STRATEGY-INDEX in
  `reference/strategies/` — location TBD during execution)
- Same pattern as STRATEGY-INDEX: lightweight catalog of available workflows with
  one-line descriptions, organized by category (core lifecycle, supplemental)
- Add to session-init.md load sequence (read every session for ambient awareness)
- Purpose: agent connects user intent ("let's archive this") to the right workflow
  (`archive-completed.md`) reliably, without having to memorize workflow names from
  scattered document references
- Also serves humans: new team members see the full workflow catalog at a glance
- Include project workflows section (initially empty, populated by teams)

**N3. Add strategy declaration guidance to generate-tasks workflow**

- Small addition to `2_generate-tasks.md`: when writing task entries, note relevant
  strategies from STRATEGY-INDEX (e.g., `**Strategies:** strategy-adr-methodology.md`)
- Already happens informally in well-written task lists; codifying it makes the
  connection reliable and explicit
- The person writing the task list understands the domain — they're the right one to
  connect task to strategy at planning time
- Lightweight convention, not a mandatory field

**N4. Formalize trigger/content separation convention**

- Document the pattern: ARC content lives in `.arc/`, agent-specific trigger files
  (slash commands, skills) are thin dispatchers in tool directories (`.claude/`,
  `.codex/`, etc.)
- This is how ARC's own skills already work — `resume-current.md` in `.claude/commands/`
  is two lines pointing to `session-init.md`
- Articulate as a convention in the development methodology or in a dedicated section
  of the relevant strategy doc
- Feeds WU3's slash command generation design (WU3 builds the automation; WU2
  establishes the convention)

**N5. Create integrate-skill supplemental workflow**

- New file: `.arc/system/workflows/arc/supplemental/integrate-skill.md`
- Agent-driven workflow for bringing external portable skills into ARC:
    1. Agent reads the skill content
    2. Classifies: procedural (→ project workflow), reference (→ project strategy),
       blend (→ strategy with workflow aspects)
    3. Assesses ARC integration: conflicts, complements, or fills gaps in existing
       guidance
    4. Proposes placement, adaptation scope, and trigger file creation to user
    5. On approval: creates dual-audience ARC doc, creates thin trigger file(s),
       updates STRATEGY-INDEX or WORKFLOW-INDEX as appropriate
- The agent itself is the automation layer for the intelligence (classification,
  adaptation); WU3's generation scripts handle the mechanical parts (generating
  equivalent trigger files for multiple agent tools)
- Key design goal: frictionless enough to actually be used — "I found this skill,
  integrate it" as a single interaction, not a 7-step manual process

**N6. Clarify `project/` directories as the skills landing zone**

- Update READMEs in `.arc/reference/strategies/project/` and
  `.arc/system/workflows/project/` to articulate their role as the home for
  team-specific patterns, including adapted external skills
- Currently these READMEs exist but don't connect to the skills story
- After N5's workflow runs, adapted content lands here — making this explicit helps
  teams understand the directory's purpose

> **Annotation (2026-02-25): Skills convergence and trigger mechanism design**
>
> Since ADR-005 and this plan were written, the Skills convention has accelerated
> as the convergent trigger mechanism across major agent CLIs. Codex CLI deprecated
> custom prompts entirely in favor of Skills. Claude Code now presents slash
> commands as "loading a Skill" in the UI, suggesting internal convergence even
> where the legacy format is preserved for backward compatibility.
>
> **Implications for N4 and WU3:**
>
> - The plan currently references "slash commands" as the trigger format in several
>   places. Skills (SKILL.md with frontmatter metadata) are the more durable target.
>   N4 should formalize trigger/content separation with Skills as the standardizing
>   format, noting slash commands as a legacy/back-compat variant.
> - Agent-specific *layout* remains divergent: Claude uses flat files in
>   `.claude/commands/`, Codex uses nested directories in
>   `.codex/skills/{name}/` with an additional `agents/openai.yaml` for UI
>   metadata. Claude may already support (or soon introduce) a dedicated skills
>   directory — the `.claude/commands/` path may be back-compat rather than the
>   intended long-term location. This divergence confirms the WU3 generation
>   script is necessary, not a convenience.
> - **Research prerequisite**: Before implementing N4 or the WU3 generator, verify
>   current behavior and format expectations for at least all common CLIs (Claude
>   Code, Codex, Gemini CLI, Copilot). This ecosystem moves fast — assumptions
>   from early 2026 may already be stale by execution time.
> - The existing `.codex/skills/` files created during a Codex session serve as a
>   concrete proof-of-concept for the trigger/content separation pattern across
>   two agents.
>
> **Invocation model distinction — critical for ARC alignment:**
>
> Skills across all current agent tools are *user-triggered* (`/` for Claude,
> `$` for Codex, etc.) — the user explicitly invokes them. They are not
> "agent-invoked when applicable." This is an important distinction: ARC's
> workflows and strategies are loaded into context and followed by the agent as
> part of its operating instructions. Skills are manual dispatch. The trigger
> files should be understood as user-facing entry points that invoke ARC content,
> not as a mechanism for the agent to autonomously discover and apply guidance.
> ARC's context-loading model (session-init reads strategies/workflows into
> context) remains the primary guidance delivery mechanism; skills/triggers are
> a complementary convenience layer for user-initiated actions.
>
> **Agent sandbox and tooling observation:**
>
> Codex CLI's sandboxed execution model exposed a fragility in session-init:
> the `npx --yes markdownlint-cli2` verification step hung due to network
> restrictions. Resolution was to pin the linting tool locally via
> `package.json` and `npm install`, then rewrite the verification to prefer
> local binaries with a timeout guard. This is the correct pattern — any
> tooling referenced in
> workflows should work offline after one-time setup. The trigger mechanism
> design (N4, WU3) should carry this principle: generated trigger files must
> not assume network access or tool-specific installation beyond what the
> project's setup step provides.

### Cluster O: Extension Point and Method Override Infrastructure

Per ADR-003 (config + extensions) and ADR-005 (external compat + method overrides).
Implements the two customization mechanisms beyond config settings: extension points
(add behavior at workflow locations) and method overrides (replace default convention
implementations). These are the mechanisms that complete the customization model
alongside Cluster B's config expansion.

**O1. Scaffold `arc-extensions.md`**

- New file: `.arc/system/workflows/arc-extensions.md`
- Classification: Configurable (preserved through three-way merge)
- One section per preset extension point: workflow reference, trigger condition,
  contract, and `[No extension configured]` placeholder
- Candidate preset extension points (evaluate and finalize during implementation;
  target 0-3 per workflow):

  | Workflow          | Extension Point     | Contract Summary                                    |
  |-------------------|---------------------|-----------------------------------------------------|
  | process-task-loop | `post-task-quality` | Additional checks after Tier 1, before marking done |
  | process-task-loop | `post-unit-quality` | Additional checks after Tier 2 at unit boundaries   |
  | session-init      | `post-context-load` | Additional context loading after standard docs      |
  | atomic-commit     | `pre-stage-review`  | Additional staging verification before commit       |

**O2. Scaffold `arc-methods.md`**

- New file: `.arc/system/workflows/arc-methods.md`
- Classification: Configurable
- Co-located with `arc-extensions.md` (both modify workflow behavior)
- One section per preset method: workflow reference, trigger, contract, default
  behavior, and `### Project Override` with `[No override configured]` placeholder
- Candidate preset methods (evaluate and finalize during implementation; target
  3-5 total across all workflows):

  | Method                   | Workflow             | Default                          | Common Override               |
  |--------------------------|----------------------|----------------------------------|-------------------------------|
  | Task completion tracking | process-task-loop    | Mark `[x]` in markdown task list | Update Jira/Linear status     |
  | Quality gate commands    | process-task-loop    | Project-specific lint/test/build | Team CI suite, security scans |
  | Session state mechanism  | session-init/handoff | CURRENT-SESSION.md read/write    | IDE persistent memory, etc.   |
  | Commit context format    | atomic-commit        | `Context: tasks-*.md (Task X.Y)` | `Closes JIRA-XXX`, `Fixes #N` |

- **Method dependency guidance** (WU1.5 Gap 6): Methods are presented as independent
  choices, but some have dependencies. The `task-completion` and `commit-context-format`
  methods are coupled — the default commit context format (`Context: tasks-*.md (Task X.Y)`)
  assumes markdown task lists. Overriding task completion to use Jira/Linear without also
  overriding commit context creates an inconsistency: commits reference a tracking system
  the team doesn't use.

  Include in each method definition:
    - **`Related:`** field listing methods that are typically overridden together, with a
      one-line explanation of why. Advisory — not a constraint, but a prompt for teams to
      consider the coupling when overriding.
    - For the `task-completion` / `commit-context-format` pair: "Overriding one typically
      requires overriding the other — both reference the task tracking system."

  The dependency guidance is advisory, consistent with how contracts work (ADR-005: "the
  team is responsible for ensuring their override meets the contract"). The agent notes
  the coupling during session-init config awareness (ADR-005 Part 6) and can flag it if
  only one of a coupled pair is overridden.

  Dependency map across preset methods:

  | Method                 | Related                | Nature of coupling                          |
  |------------------------|------------------------|---------------------------------------------|
  | task-completion        | commit-context-format  | Both reference the task tracking system      |
  | commit-context-format  | task-completion        | Both reference the task tracking system      |
  | session-state          | (none)                 | Independent — mechanism is self-contained    |
  | quality-gate-commands  | (none)                 | Independent — project-specific commands      |

  Validation Scenario A in `strategy-configurability-architecture.md` already demonstrates
  the correct pattern (Jira team overrides both). The dependency guidance makes this
  coupling explicit and discoverable rather than implicit in examples.

**O3. Insert extension point markers into workflows**

- Block-style markers at each preset location, bounded by horizontal rules:

  ```markdown
  ---
  **Extension Point — [Name]** · `#[anchor]`
  Contract: [when it fires and what it's allowed to do]
  See: [arc-extensions.md](../arc-extensions.md#[anchor])
  ---
  ```

**O4. Insert method markers into workflows**

- Same visual pattern as extension points:

  ```markdown
  ---
  **Method — [Name]** · `#[anchor]`
  Contract: [invariant that both default and override must satisfy]
  Default: [ARC's built-in behavior]
  See: [arc-methods.md](../arc-methods.md#[anchor])
  ---
  ```

**O5. Add session-init config awareness step**

- After standard document loading in `session-init.md`, add a lightweight step:
  read `arc-config.yml` (note platform, custom patterns, non-default values) and
  `arc-methods.md` (note any populated project overrides). Read-and-note — no
  additional documents to internalize, just awareness carried through session.
- **WU1.5 interaction (Gap 2):** DEV-RULES.ARC includes inline method-override
  pointers for convention-level rules (e.g., "Default: X. Override:
  `arc-methods.md#Y`"). Ensure arc-methods.md preset methods (O2) are consistent
  with the override pointers in DEV-RULES.ARC. The agent encounters the pointer
  when reading DEV-RULES.ARC in Tier 1 and checks arc-methods.md during this
  config awareness step.

**O6. Add custom pattern config settings** (extends Cluster B1)

- `commit.format: custom` as new valid value (alongside `conventional`, `any`) —
  triggers hook validation against `commit.custom_pattern` regex
- `commit.custom_pattern` — regex setting for custom commit format validation
- `commit.context_footer: custom` as new valid value — triggers validation against
  `commit.context_pattern` regex
- `commit.context_pattern` — regex setting for custom context footer validation
- `platform.type` — informational platform declaration (`github` / `gitlab` /
  `bitbucket`); agent-read, not consumed by hooks
- Inline comment examples for common regex patterns (Jira prefix, ticket + type,
  issue reference) to reduce authoring friction

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
- **Reclassification checkpoint (WU1.5):** Include an explicit reclassification pass —
  WU2 changes may shift file classifications (e.g., expanded `arc-config.yml` from
  Configurable toward Framework). Verify classifications against WU1.5's
  file-classification strategy after all methodology changes land

**L3. Cross-cutting dependency mapping**

- Identify concepts that span multiple files and map their blast radius
- Which concepts, if changed, would require updates across N+ files?
- Output informs WU3 CLI design: update commands need to know which files move together

---

## Deliverables

### Modified Files

All existing files listed under Clusters A-K and N that receive edits. The exact set is
determined during execution as WU1 ADR decisions clarify scope; the inventory above
identifies the candidates.

### New Files

- `rotate-branch.md` — supplemental workflow for mid-work-unit branch rotation (D6)
- `WORKFLOW-INDEX.md` — workflow catalog for session-init ambient awareness (N2)
- `integrate-skill.md` — supplemental workflow for external skill integration (N5)
- `arc-extensions.md` — extension point scaffolding at `system/workflows/` (O1)
- `arc-methods.md` — method override scaffolding at `system/workflows/` (O2)
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

- WU1 (Core Philosophy & Configurability Architecture) — 6 ADRs + 2 strategy
  documents must be available before WU2 begins; specific clusters that block on
  specific ADRs are noted in the change inventory above
- WU1.5 (Foundational Gap Closure) — ADRs, strategy updates, and workflow change
  specifications that WU2 implements. Affected clusters:
    - **Cluster C** (Session Model + Context Loading): Gap 1 (session state
      portability, ADR-007) and Gap 2 (context loading) outputs expand Cluster C
      significantly. Gap 2 resolution adds C2-C6: core document restructure
      (DEV-RULES.ARC/PROJECT twin docs), strategy-dev-methodology slimming,
      session-init loading sequence redesign, tier model formalization, and
      Tier 2a trigger pattern. See `notes-foundational-gap-closure.md`
      § Evaluation: Context Loading Design for the full evidence base and
      five design decisions.
    - **Cluster E** (Team Workflow): Gap 5 (team work transfer) and Gap 7 (config
      team semantics) may reshape E3 and related items
    - **Cluster D**: Gap 8 (archive trigger) resolved — three-operation model
      (Rotate → Complete → Archive). Archive trigger stays "all tasks `[x]`";
      Phase 2→3 gate enforces merge before archive move. Annotated on D2
      (multi-branch guidance) and D6 (rotate-branch as intermediate operation)
    - **Cluster C** (continued): Gap 4 (task reference stability) is specified as
      C8 — triple-anchor reference format (title + number + ~line) with graceful
      fallback lookup in session-init. Affects session-init, session-handoff,
      activate-work-unit, and WORK-STATUS.md template
    - **Cluster O** (Extensions/Methods): Gap 2 resolution specifies that
      DEV-RULES.ARC includes inline method-override pointers — ensure
      arc-methods.md preset methods (O2) are consistent with these pointers
    - **Cluster G** (Convention/Workflow Gaps): Gap 11 (planning lifecycle) adds
      G8-G10: extract PRD format to template, strengthen discovery step, reference
      new planning lifecycle strategy from create-prd workflow. Also created
      `reference/templates/` directory with centralized templates (template-adr,
      template-prd, template-plan) and `strategy-work-planning.md`.
    - **Session workflows generally**: Gaps 3, 9, 10 (bootstrap, mismatch recovery,
      staleness detection) produce session-init change specifications. Gap 3
      (bootstrap) is specified as C7 — first-session bootstrap and "no active work"
      state handling across init, session-init, activate-work-unit, and archive
      workflows. Gap 9 (mismatch recovery) is specified as C9 — tiered recovery
      model with trust hierarchy (git > task list > WORK-STATUS > SESSION); auto-
      recover when git + task list agree and session doc is the outlier, stop-and-ask
      for ambiguous cases. Gap 10 (staleness detection) is specified as C10 —
      commit hash anchor in SESSION.md, freshness check before mismatch detection;
      informational (not blocking), feeds confidence levels into C9's trust hierarchy.

**Downstream:**

- WU3 (CLI Design) — consumes the structural validation output (Cluster M) and
  references the `arc-config.yml` schema implemented in Cluster B
- WU4 (Public Release) — if ADR 6 designates tiers as documentation-driven,
  Cluster L scope shifts to WU4

---

## Exclusions

- No new ADRs — design decisions are WU1 and WU1.5 scope; WU2 implements them
- No CLI tooling — hooks are shell scripts, not CLI commands; that is WU3 scope
- No docs site content — that is WU4 scope
- No framework self-testing for configuration combinations — noted as a future
  concern in `plan-arc-methodology-gaps.md`; remains out of scope for 1.0
- No agent-agnosticism overhaul beyond what ADR 3 specifies — the audit item
  identified it as a lens, not a mandate for alternate workflow versions

---

## Forward-Looking: Terminology Pass

ARC's key concepts — session, review increment, work unit — would benefit from a deliberate
terminology review during or after WU2. Memorable, consistently used terms reinforce concepts
through repeated use and help adopters build shared vocabulary. Examples:

- **"ARC session"** as a branded term with the specific meaning established in ADR-002
  (bounded, intentional work period)
- **"Review increment"** proposed in ADR-001 but not yet tested with adopters
- **"Work unit"** established but could be more distinctive
- Session-init's "ARC session initialized" confirmation already reinforces the session concept

This is not a separate work item — it's a lens to apply during WU2 doc edits and WU4
public-facing writing. When touching a document, consider whether key terms are used
consistently and whether there are opportunities to strengthen recognition. The strategy
document synthesis (WU1 Requirement 10) or WU4 adoption guides are natural homes for a
consolidated terminology reference if one emerges.

Origin: ADR-002 review discussion (`notes-philosophy-configurability.md`, "Forward-Looking:
Terminology and Branding").

### Workflow gap: research file archival

The archive-completed workflow moves all active directory files to the work unit's archive
directory. This doesn't account for reference material (research files) that has ongoing value
beyond the source work unit. During WU1 archival, 5 research files were moved to a new
`reference/research/` directory rather than bundled with the work unit archive — research is
topic-organized and discoverable, not coupled to the work unit that commissioned it.

The archive-completed workflow needs a step for routing reference material to `reference/research/`
(or the adopter equivalent). This is a light addition — a decision point during Phase 3 archival:
"Do any files in the active directory have reference value beyond this work unit?"

Origin: WU1 archival (2026-02-24).

---

**Created:** 2026-02-22
