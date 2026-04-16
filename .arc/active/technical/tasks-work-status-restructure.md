# Task List: Work-Status Restructure

**PRD:** `.arc/active/technical/prd-work-status-restructure.md`
**Created:** 2026-04-15
**Branch(es):** `technical/work-status-restructure`
**Base Branch:** `main`
**Status:** In Progress

## Overview

**Purpose:** Replace the singular tracked `.arc/active/WORK-STATUS.md` with a per-work-unit
status file pattern (`.arc/active/{category}/status-{name}.md`), disentangling the project
pointer from the session pointer and eliminating the parallel-WU concurrency flaw and
base-branch staleness dead-ends under full protection.

**Reference material:** Detailed rationale (historical ADR-007 conflation, alternatives,
stress-test battery, harmony-with-shift-lifecycle walk, deactivation case matrix) lives in
`notes-work-status-restructure.md` alongside the PRD. Task execution should consult the notes
file for source material during Phases 1, 4, and 5.

**Strategies:** `strategy-package-project-sync.md` (every framework file edit requires dual-copy
sync), `strategy-task-list-formatting.md` (Phase 2 task list template edit),
`strategy-adr-methodology.md` (Phase 1 ADR-007 amendment), `strategy-session-operations.md`
(Phase 1 update target), `strategy-team-coordination.md` (Phase 1 rewrite target).

## Scope

### Will Do

- Replace singular WORK-STATUS.md with per-WU `status-{name}.md` files (Full mode) +
  `status.md` singular for Lite mode
- Edit 5 foundation docs (ADR-007 amendment, 2 strategies, DEV-RULES.ARC, arc-methods)
- Edit 3 templates (new status file template; SESSION-NOTES adds `**Working On:**`;
  task list template removes `**Status:**` header) and 9 workflow files
- Author new `deactivate-work-unit.md` workflow (Case A primary + routing pointers)
- Update 4 plan-\* docs (substantive `plan-arc-modes.md`; header-level notes on others)
- Update 4 agent/project reference docs
- Live-migrate this WU's own state from `.arc/active/WORK-STATUS.md` to
  `.arc/active/technical/status-work-status-restructure.md` (Phase 3 cutover)
- Remove ATOMIC-INBOX items #1–#3 at verification (resolved-by-design)
- Sync every framework file edit to both `.arc/` and `packages/arc-framework/arc/`
  (see `strategy-package-project-sync.md`)

### Won't Do

- Edit `tasks-arcd-rebrand.md` in any way (absorbed during rebrand reactivation after this
  WU merges — deliberately out of scope)
- Edit historical archived task lists in `.arc/reference/archive/` (immutable historical
  record — only templates and active task lists receive the `**Status:**` header removal)
- Change SESSION-NOTES model or location (adding `**Working On:**` is an extension, not a
  model change)
- Change `PROJECT-STATUS.md` structure (reference updates only)
- Rename `arc-resume` / `arc-handoff` skills
- Retrofit git notes-stored state or historical session state

---

## Tasks

### **Phase 1:** Foundation Docs

**Purpose:** "What the model is" documents land first so subsequent workflow edits in
Phase 2 reference established guidance.

**Classification and sync discipline:** Task 1.1 edits ADR-007, which is `.arc/`-scoped
— ADR files have no package counterpart per `strategy-package-project-sync.md` § File
Inventory (the inventory lists only `reference/adr/README.md` as Framework; individual
ADRs are project-owned historical record). Tasks 1.2–1.6 edit Framework and Configurable
files — edit package source first, then sync to `.arc/`. Task 1.7 edits machinery:
root `.gitattributes` (project-owned, no package source) and the pre-commit hook
(Framework file, dual-copy). Task 1.8 runs the framework-sync integration test to
enforce the sync claim for Framework/Configurable files edited in 1.2–1.7.

**Phase 1 scope expansion (2026-04-15, mid-batch):** Task 1.3 was originally scoped to
rewrite only § Concurrent Sessions of `strategy-team-coordination.md`. Mid-batch
discovery surfaced 16 WORK-STATUS references spread through the file (intro prose,
shared resources table, § Session State Merge Behavior documenting `.gitattributes`
`merge=ours`, § Concurrent Sessions, and others), plus 7 more in
`strategy-work-organization.md` (completely unscoped in the original plan), plus the
pre-commit hook CHECK 10 hard-coded path and root `.gitattributes`
`merge=ours` rule on the retired singular path. Phase 1 widened to cover all four
surfaces: 1.3 rewrites `strategy-team-coordination.md` shipping-clean (full file),
new 1.4 does `strategy-work-organization.md` shipping-clean (full file), and new 1.7
retires the `merge=ours` rule entirely and rewrites CHECK 10 to derive the sibling
status file from the staged task list's directory. Design rationale for the retirement
(not a repath) is documented in the notes file § Consequences subsection, landed as
the first bullet of 1.3. Decisions made during scope expansion: retire `merge=ours`
rather than repath it (silent-discard behavior is a footgun under the new model; see
notes file); rewrite CHECK 10 rather than retire (commit-time feedback loop is
load-bearing under the new model and derivation from task list directory is trivial).

**Strategies:** `strategy-adr-methodology.md`, `strategy-session-operations.md`,
`strategy-team-coordination.md`, `strategy-work-organization.md`,
`strategy-package-project-sync.md`.

- [x] **1.1 ADR-007 Tier 2 Amendment**

    Appended `**Amendment (2026-04-15):** …` block to the existing `### Amendments`
    subsection inside `## Consequences` of
    `adr-007-design-session-state-portability-and-team-transfer.md`, directly below the
    2026-03-05 "Current Task → Next Task" amendment. Format matches existing ADR-007
    and ADR-012 precedent per `strategy-adr-methodology.md` Tier 2 convention (H3 inside
    Consequences, not a new top-level section).

    Amendment body documents the conflation in two parts: (1) ADR-012 already refined
    Parts 1–3 for the unified `user/{identity}/` model but preserved the singular
    `active/WORK-STATUS.md` path — the project-pointer scope question was never
    re-examined; (2) the Work-Status Restructure WU splits the project pointer out to
    per-WU `active/{category}/status-{name}.md` files, eliminating parallel-WU
    integration conflict and base-branch staleness flaws by construction. Cross-references
    `prd-work-status-restructure.md` and `notes-work-status-restructure.md` § Historical
    context for the full analysis.

    Original Decision / Context / Consequences prose unchanged. ADR-007 is `.arc/`-only
    — no package source sync. Tier 1 lint passed (one inline fix: `*emphasis*` →
    `_emphasis_` per MD049 project style).

- [x] **1.2 `strategy-session-operations.md` — update WORK-STATUS references**

    Replaced the single T2 State bullet at line 50 (`- WORK-STATUS.md (branch, task
    list, next task, blockers)`) with `- status-{name}.md (per-WU tracked project
    pointer in active/{category}/; holds State, Branch, Task List, Next Task, Last
    Completed, Blockers, Next Action)`, wrapped at a natural phrase boundary for the
    120-char line limit. No other WORK-STATUS references existed in the file
    (pre-execution grep confirmed, re-grep at edit time confirmed). Left
    `### Session State Portability` unchanged — it covers `user/{identity}/` and git
    notes, out of scope for this WU.

    **Full/Lite mode variance scope:** Resolved per default interpretation (user
    confirmed at session start). File stays mode-agnostic; Full/Lite mode variance
    prose is deferred to Task 1.6 (`arc-methods.md` § session-state.default) and
    Phase 2 workflow edits (`session-init.template.md`) where mode logic has a
    natural home. `strategy-session-operations.md` does not mention Full/Lite and
    should not start here.

    **Sync:** Framework file — edited package source
    (`packages/arc-framework/arc/reference/strategies/arc/strategy-session-operations.md`)
    first, then mirrored to `.arc/`. Tier 1 lint clean on `.arc/` copy (package
    source is excluded from project lint scope by design, not double-linted).
    `framework-sync.test.ts` at Task 1.8 will enforce the mirror.

- [x] **1.3 `strategy-team-coordination.md` — shipping-clean full-file sweep**

    Full-file rewrite. 16 WORK-STATUS references removed or replaced across intro
    prose, § Workflow Adaptations table, § Key distinction callout,
    § Person-to-Person Task Handoff (incoming bootstrap + async conventions),
    § Session State Merge Behavior, and § Concurrent Sessions. Table rebuilt with
    wider data cells (36/50 internal widths, 115-char row total) to fit
    `active/{category}/status-{name}.md` paths.

    § Session State Merge Behavior retired: the subsection documenting
    `.gitattributes` `merge=ours`, sub-branch caveats, and the platform note
    replaced with a 7-line forward-clean paragraph describing per-WU merge
    behavior under normal git conflict resolution, cross-referencing `(@name)`
    marker discipline for the within-WU sub-branch case.

    § Concurrent Sessions rewritten per notes § Resolved decisions #3, now
    addressing two axes explicitly: (a) parallel WUs on independent branches —
    different files, no coordination at the status-file layer, dominant pattern;
    (b) within-WU team sub-branches sharing one `status-{name}.md` with three
    coordination mechanisms (task list, status file, SESSION-NOTES).

    Notes file § Consequences subsection landed as part of this task (first
    edit, before the strategy doc) — rationale surface for the `merge=ours`
    retirement and CHECK 10 rewrite, referenced implicitly by this task and by
    Tasks 1.4 / 1.7.

    Framework file dual-copy sync via `cp` after package source edit. Grep
    sweep for `WORK-STATUS|merge=ours|gitattributes` returns zero hits in both
    copies.

- [x] **1.4 `strategy-work-organization.md` — shipping-clean full-file sweep**

    Seven WORK-STATUS references rewritten or retired. § Task Lists and
    Branches: dropped the redundant "WORK-STATUS reflects whichever WU is
    currently active" sentence; rewrote the merge-behavior paragraph as "Per-WU
    status file behavior on branches" (6 lines — file lifecycle via
    activate/archive-work-unit, no cross-branch collision by construction,
    cross-reference to strategy-team-coordination § Session State Merge Behavior
    for within-WU sub-branches). § Planning Branches: Delivery bullet and Batch
    transitions parenthetical updated to name `status-{name}.md` creation in
    place of WORK-STATUS updates. § Directory Structure: rewrote the `active/`
    ASCII tree — removed the top-level `WORK-STATUS.md` line, added
    `status-<name>.md` to each category's file list, wrapped long lists across
    two lines for readability. Removed the now-orphaned `[rotate-branch]:` link
    definition (MD053 flagged it after the merge-behavior paragraph retirement
    removed its inline reference).

    Framework file dual-copy sync. Grep sweep returns zero hits in both copies.

- [x] **1.5 `DEV-RULES.ARC.md` § Session state — per-WU model update**

    Four reference updates across Commit Discipline, Session Management,
    Documentation Boundaries, and When to Load Additional Guidance:

    1. **§ Commit Discipline — Work status accuracy bullet** rewritten to name
       the active WU's `status-{name}.md` (at `active/{category}/`) as the
       update target. Contributor override rephrased to "project-level status
       files" (model-agnostic).
    2. **§ Session state control — two-file model first bullet** rewritten:
       `status-{name}.md` at `active/{category}/` as the active WU's project
       pointer, with commit-time and next-session-recovery sub-bullets updated
       to match. Rule substance unchanged.
    3. **§ Documentation Boundaries — "Also applies to communication
       artifacts"** paragraph: "belongs in WORK-STATUS and SESSION-NOTES"
       replaced with "belongs in the active WU's `status-{name}.md` and
       SESSION-NOTES".
    4. **§ When to Load Additional Guidance — process-task-loop promotion
       signal** now keyed on the active `status-{name}.md` instead of
       fixed-path WORK-STATUS.

    Framework file dual-copy sync. Grep sweep returns zero hits in both copies.

- [x] **1.6 `arc-methods.md` § session-state default — per-WU pattern, option (b)**

    Replaced the single-line `.default` bullet `**WORK-STATUS.md** (`active/`)
    — tracked project state, updated at commit time and handoff` with a
    three-line bullet naming `` `status-{name}.md` `` at `active/{category}/`
    as the tracked per-WU project pointer, calling out `**State:**` as the
    load-bearing lifecycle field, and pointing at the status file template for
    the full field set. No inline 7-field enumeration (per option (b)).

    `.override` empty placeholder, method dependencies table, contract, and
    workflow references all preserved unchanged. Method stays mode-agnostic —
    Full/Lite mode variance prose deferred to Phase 2 workflow edits where
    session-init templates have a natural home.

    Template pointer is template-generic ("the status file template" with no
    specific path) since the new template lands at Task 2.2. Interim dangling
    reference absorbed by the Phase 2 SESSION-NOTES Persistent Context guard
    installed at Task 2.1.

    Configurable file dual-copy sync (framework section only). Grep sweep
    returns zero hits in both copies.

- [x] **1.7 Retire `merge=ours` and rewrite pre-commit hook CHECK 10**

    Root `.gitattributes`: deleted the `.arc/active/WORK-STATUS.md merge=ours`
    line. No replacement rule added — retirement, not repath, per notes
    § Consequences rationale. Project-owned file, no package source counterpart.

    Pre-commit hook CHECK 10 rewritten from hard-coded singular path to
    sibling-derivation: for each staged `active/{category}/tasks-{name}.md`
    with checkbox completions, derive `active/{category}/status-{name}.md` and
    check whether it's also staged. Task list regex tightened from
    `^\.arc/active/.*/tasks-.*\.md$` to `^\.arc/active/[^/]+/tasks-[^/]+\.md$`
    — strict single-depth match, explicitly excludes backlog and atomic edits.

    Added a **pre-activation guard** (not in the original task bullet): only
    warn when the derived `expected_status` exists in the working tree
    (`[ -f "$expected_status" ]`). Skips false positives during pre-activation,
    mid-restructure, and early-planning states where the file legitimately
    doesn't exist yet. Refinement added after a derivation-logic walkthrough
    predicted false positives on this batch's own commits.

    Staged-file lookup rewritten to use
    `printf '%s\n' "$staged_files" | grep -qxF "$expected_status"` — cleaner
    shell, single `SC2086` directive retained for the intentional
    newline-separated iteration on `$staged_task_lists_for_ws`. Updated the
    CHECK 10 header comment and the line-34 contributor-mode-notice comment to
    name "status file co-staging" in place of "WORK-STATUS co-staging".

    Framework file dual-copy sync via `cp`. `chmod +x` preserved on both
    copies. `npm run lint:sh` clean. Derivation walkthrough against the
    current task list confirms the pre-activation guard skips the warning as
    designed. Full end-to-end hook validation deferred to Phase 3 cutover when
    the new status file first exists.

- [x] **1.8 Phase 1 Tier 2 quality gates**
    - [x] 1.8.a `npm run -s lint:md` — **0 errors across 176 files**
    - [x] 1.8.b `npm run lint:sh` — **clean** (pre-commit hook rewrite in 1.7.b
          passes shellcheck with existing SC2086 directive for newline-separated
          iteration)
    - [x] 1.8.c Package/project sync verification — `diff -q` across the 6
          Framework/Configurable files returned no differences:
          `strategy-session-operations.md`, `strategy-team-coordination.md`,
          `strategy-work-organization.md`, `DEV-RULES.ARC.md`, `arc-methods.md`,
          `system/githooks/pre-commit`. ADR-007 and root `.gitattributes` excluded
          — project-owned, no package counterpart.
    - [x] 1.8.d `npm run test:integration` — **104/104 tests passed** across 7
          test files. `framework-sync.test.ts` specifically passed (confirms
          package source ↔ `.arc/` mirror for all Framework files).

### **Phase 2:** Templates and Workflows

**Purpose:** Land the mechanical rewire of templates and workflow files that reference
the new model. Templates first (so workflows can reference them), then session lifecycle,
then work unit lifecycle, then planning workflows.

**Strategies:** `strategy-package-project-sync.md` (dual-copy discipline for every edit),
`strategy-task-list-formatting.md` (template content reference for 2.4).

**Note — interim-state risk during this phase:** Workflow files in this phase will
describe the new model while `.arc/active/WORK-STATUS.md` still exists on this branch
until Phase 3 cutover. Task 2.1 writes a SESSION-NOTES Persistent Context entry
*before* any workflow edit lands, warning future sessions to trust old-path live state
over edited workflow instructions until Phase 3 completes. Task 3.3 removes the entry
at cutover.

- [x] **2.1 Write Persistent Context entry to SESSION-NOTES**

    Installed the interim-state guard. Added entry to
    `.arc/user/andrew/SESSION-NOTES.md` § Persistent Context naming the
    "Mid-restructure interim state (WORK-STATUS path)" condition and pointing
    future sessions at the old-path live state (`.arc/active/WORK-STATUS.md`) over
    Phase 2 workflow edit instructions. Explicit `*Remove when: Phase 3 cutover
    commit lands.*` removal trigger. Replaces the prior `_(none — ...)_`
    placeholder — which was the workflow anti-pattern *"explanatory paragraphs
    where the template expects whitespace"* landed in the preceding incidental
    (`4d11c1f` session-handoff signal tightening), dogfooded immediately.
    Persistence to git notes via `arc sync` runs at task commit time so the guard
    survives the SESSION-NOTES gitignore.

- [x] **2.2 Status file template (new) — retire the old**

    Created `packages/arc-framework/arc/reference/templates/template-status.md`
    with the pinned shape: `# Status: [Work Name]` heading (matching existing
    `[Work Name]` placeholder convention), 7-line streamlined About callout, 7
    required R2 fields (`State`, `Branch`, `Task List`, `Next Task`, `Last
    Completed`, `Blockers`, `Next Action`), 3 optional pointer fields documented
    in HTML comment (`Interrupts`, `Paused At`, `Paused To`), trailing State
    enum comment. No `Last Updated`, no `Following Task List` per R17. Synced
    to `.arc/reference/templates/template-status.md`.

    **Retirement executed:** `git rm` on
    `packages/arc-framework/arc/active/WORK-STATUS.template.md`. Pre-task grep
    surfaced scaffolding references in `init-recipe.json`, `src/lib/classification.ts`
    (`SCAFFOLDED_FILES`), `src/lib/setup.ts` (`.gitattributes` `merge=ours` write +
    merge driver config — Task 1.7 had retired these from hooks/docs but left
    the scaffolding code writing them for new adopters; retirement completed
    here as explicitly anticipated in this task's scope), and 10 test files
    asserting WORK-STATUS-specific behavior. All updated: swapped test fixtures
    to `reference/META-PRD.template.md` for Scaffolded-file assertions,
    removed `merge=ours` / merge-driver assertions entirely, replaced WORK-STATUS
    content-presence test with a template-status presence test.

    **Dead utility cleanup:** `writeArcGitattributesBlock` had no remaining
    callers post-retirement — removed from `src/lib/template/files.ts`,
    `src/lib/template/index.ts` barrel, and its direct unit test. Git history
    preserves it if Lite mode ever reintroduces gitattributes management.

    **active/ directory lifecycle:** Init no longer creates `.arc/active/` —
    the directory is lazily created by `activate-work-unit.md` at first WU
    activation (`mkdir -p .arc/active/{category}/` is already in that workflow).
    Pattern: filesystem mirrors state, empty = no work, populated = active work.
    Removed `active` from the integration test's `expectedDirs` list and added
    a positive-pin assertion that `.arc/active/` does NOT exist after a clean
    init (regression guard for the intended state).

    **Init → first-session bridge folded in:** The retired WORK-STATUS template
    populated a `Next Action` pointing to `01_verify-and-configure.md`; that
    bridge would otherwise be lost. Folded into
    `packages/arc-framework/templates/user/SESSION-NOTES.md` (scaffolding template,
    no `.arc/` mirror): (a) fixed the stale `[WORK-STATUS.md](../active/WORK-STATUS.md)`
    link in the About callout to reference `status-{name}.md` in
    `active/{category}/`; (b) dropped the Customization line to match the new
    status template's streamlining; (c) pre-populated a Persistent Context
    entry pointing at the initial-setup sequence ("starting at
    `01_verify-and-configure.md`. The workflow guides onward steps.") with a
    `Remove when: initial-setup sequence complete` trigger. Session-init already
    reads Persistent Context and treats entries as active constraints, so the
    first `/arc-resume` after init surfaces the pointer in orientation without
    new machinery. Phrasing is mode-agnostic (01 is the universal entry; it
    chains to 02 and optionally 03 internally). Task 2.3 will add
    `**Working On:**` on top — see its pre-execution note for folding guidance.

    **Quality gates:** Tier 1 markdown lint clean, TypeScript lint/typecheck
    clean, full test suite passes (616 tests: 470 unit + 102 integration + 43
    e2e, including `framework-sync.test.ts` which verifies package source ↔
    `.arc/` mirror parity for the new template). tsup build succeeds.

- [x] **2.3 SESSION-NOTES — add `**Working On:**` field across both surfaces**

    **Goal:** Install the session-pointer field that session-init reads as the primary
    disambiguation signal. Two surfaces must be updated.

    **Prior-task folding (Task 2.2):** Task 2.2 already edited Surface 1 to (a) fix the
    stale WORK-STATUS link in the About callout (now points to `status-{name}.md` in
    `active/{category}/`), (b) drop the Customization line (streamlining consistent with
    the new status template), and (c) pre-populate a Persistent Context entry for the
    init → first-session bridge (post-install setup pointer with explicit removal
    trigger). Task 2.3 adds `**Working On:**` on top of this baseline — the bootstrap
    entry stays as-is (it's a runtime content concern, orthogonal to the field
    structure). No re-work needed; just build on what 2.2 landed.

    **Surface 1 — Scaffolding template:**
    `packages/arc-framework/templates/user/SESSION-NOTES.md`

    *Note on location:* This file lives in a sibling `templates/` tree at the package
    root, OUTSIDE the `arc/` mirror. It has no `.template.md` suffix and uses
    `{{short-hash}}` / `{{YYYY-MM-DD}}` moustache placeholders (populated at
    `arc init` / `arc join` time). The scaffolding template has no `.arc/` mirror —
    the live per-identity file at `.arc/user/{identity}/SESSION-NOTES.md` is created
    once at join time and evolves independently.

    **Surface 2 — Embedded template skeleton:** the "Template skeleton:" fenced code
    block in
    `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-handoff.template.md`
    (lines ~148–179 per current state — search for the fenced markdown block
    containing `**Commit at Handoff**`).

    **Edits at both surfaces:**

    - Add `**Working On:**` field near the top alongside `**Commit at Handoff:**`
    - Add comment block documenting the marker vocabulary (decided here per PRD Q1):
        - `[none]` — no active work
        - `[planning: {category}/{name}]` — in a planning cycle, no WU yet
        - `[between work units]` — between activation and archive of adjacent WUs
        - `status-{name}.md` — normal case, file reference
    - Drop the `**Last Updated**` field (consistency with Task 2.2 status template —
      git log is source of truth; removes brittle churn)

    **Three-surface contract:** This is the "definition" surface. Task 2.6 writes the
    value per these markers in `session-handoff.md`; Task 2.5 reads and interprets
    them in `session-init.md`. All three surfaces must use **identical marker
    strings** — Task 2.15.g (quality gates) verifies this.

    Sync Surface 2 to `.arc/system/workflows/arc/session-lifecycle/session-handoff.md`.
    Surface 1 has no `.arc/` mirror (scaffolding-only).

    **Completion:** Both surfaces updated identically. `**Working On:**` and
    `**Commit at Handoff:**` now sit as a paired metadata block at the top of the
    template (after the About callout on Surface 1; before `### Completed Work` in
    Surface 2's fenced skeleton). Marker vocabulary documented as a multi-line HTML
    comment block directly below `**Working On:**` — identical text on both surfaces
    to satisfy the three-surface contract. `**Last Updated**` dropped from both
    surfaces (git log is source of truth, consistent with Task 2.2 status template).
    The trailing `---` separator was removed alongside the bottom metadata block —
    SESSION-NOTES carries no reference-link definitions, so the horizontal rule was
    purely separating the footer fields that no longer exist. Surface 1's
    Persistent Context bootstrap entry (Task 2.2) preserved as-is. Surface 2 synced
    to `.arc/` mirror. Tier 1 quality gates: markdown lint clean on all three edited
    files; framework-sync integration test passes (package source ↔ `.arc/` mirror
    parity verified for session-handoff.md).

    **Post-review amendment (2026-04-16):** The bare `**Working On:**` / `**Commit at
    Handoff:**` metadata block gave insufficient visual separation from the
    bold-heavy About callout above it. Wrapped the pair in a `## Handoff Metadata`
    H2 across all three surfaces (scaffolding template, embedded skeleton in
    `session-handoff.template.md`, live `user/{identity}/SESSION-NOTES.md`). H2
    gives the block a grep anchor (`## Handoff Metadata`), symmetric structure with
    `## Completed Work` / `## Remaining Work Before Returning to Task List` /
    `## Additional Context` / `## Persistent Context`, and top-of-document position
    preserved for session-init ergonomics. Incidental leave-it-cleaner fix applied
    during the same pass: the embedded skeleton in `session-handoff.template.md`
    used H3 for `Remaining Work` / `Additional Context` / `Persistent Context`
    while the scaffolding template uses H2 — normalized the embedded skeleton and
    Handoff Examples blocks to H2 to match, eliminating pre-existing drift between
    the three surfaces. Also normalized the live SESSION-NOTES `**Commit at
    Handoff**:` punctuation (colon inside the bold) to match the template form.

- [x] **2.4 Task list template — remove WU-lifecycle state across all 7 surfaces**

    **Goal:** Remove WU-lifecycle state from task list templates per R16; lifecycle
    relocates to the status file `**State:**` field. Pause/resume coordination
    (previously in task list headers) relocates to Task 2.13
    (`manage-incidental-work.md`) + the Task 2.2 status template's optional pointer
    fields.

    **Note:** No separate `template-task-list.md` file exists. The task list template
    is embedded as fenced code blocks inside `strategy-task-list-formatting.md`. This
    task edits that strategy file exclusively.

    File: `packages/arc-framework/arc/reference/strategies/arc/strategy-task-list-formatting.md`

    **Seven surfaces to edit** (line numbers approximate; use graduated lookup):

    - **Line ~68** — Feature/Technical template block: remove `**Status:**` header
      line
    - **Line ~99** — Feature/Technical Rules bullet describing Status values: remove
      the bullet
    - **Line ~119** — Incidental template block: remove `**Status:**` header line AND
      `**Interrupts:**` field (Interrupts moves to status file per Task 2.13)
    - **Line ~153** — Incidental Rules bullet describing Status values: remove the
      bullet
    - **Lines ~156–158** — Incidental "When pausing parent work" / "When resuming"
      rules: remove entirely (pause/resume coordination moves to Task 2.13
      `manage-incidental-work.md` + status file pointer fields)
    - **Lines ~163–197** — Worked Incidental example: remove `**Status:** In Progress`
      line and `**Interrupts:**` field
    - **Lines ~199–204** — Entire `### Status Field Values` H3 section: remove (field
      no longer exists on task lists)

    **Scope guard:** This subtask only edits the strategy document. Existing task
    lists in `.arc/backlog/` (`tasks-arcd-rebrand.md`) and `.arc/reference/archive/`
    are NOT touched — rebrand absorbs the cleanup at reactivation; archives are
    immutable historical record.

    Sync to `.arc/` counterpart.

    **Completion:** All seven surfaces edited in the package source and synced
    to `.arc/`. Feature/Technical template lost its `**Status:**` header (Surface
    1) and rules bullet (Surface 2). Incidental template lost `**Status:**` and
    `**Interrupts:**` fields (Surface 3); its rules block lost the Status bullet,
    the Interrupts rule, and both pause/resume coordination rules (Surfaces 4–5
    consolidated — the Interrupts rule was orphaned once the field was removed
    from the template, so it went with the pause/resume cluster). Worked
    Incidental example lost `**Status:** In Progress` and the `**Interrupts:**`
    field (Surface 6). Entire `### Status Field Values` H3 section removed
    (Surface 7). Sync executed via file copy (Framework file, package source
    authoritative); post-sync diff returned empty. Quality gates: markdown lint
    clean on the edited `.arc/` file; framework-sync integration test passes
    (471 tests green). Scope honored: `tasks-arcd-rebrand.md` and archived task
    lists untouched.

- [x] **2.5 `session-init.template.md` — scan strategy and disambiguation precedence**

    **Goal:** Replace fixed-path loading with directory scan + disambiguation.

    File: `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-init.template.md`

    **Preserve existing conditional blocks (6 blocks in this file):**

    1. Lines ~100–117 — `arc:if team.mode == true`
    2. Lines ~301–306 — `arc:if team.mode == true`
    3. Lines ~308–315 — `arc:if pm.mode == arc-in-git`
    4. Lines ~323–335 — `arc:if pm.mode == arc-in-git`
    5. Lines ~337–344 — `arc:if pm.mode != arc-in-git`
    6. Lines ~438–440 — `arc:if pm.mode == arc-in-git`

    **Core edit:** Replace fixed-path `.arc/active/WORK-STATUS.md` load with Full mode
    scan: `.arc/active/**/status-*.md`.

    **Disambiguation precedence for the many-file case:**

    1. SESSION-NOTES `**Working On:**` field (primary, per-session intent signal)
    2. `**Branch:**` field match against current git branch
    3. `**State:** In Progress` filter (rules out delayed-archive stragglers)
    4. Prompt user (last resort — see pinned format below)

    **Zero-file case:** no active work → consult ROADMAP (existing pattern, unchanged).
    **One-file case:** load directly (no disambiguation needed).

    **Lite mode variant:** fixed path `.arc/active/status.md`; same field set; no
    scan. Zero/one-file cases only (many-file case doesn't exist under Lite).

    **Q2 pinned — ambiguous-discovery prompt format:**

    ```text
    Multiple status files matched. Select one:
      [1] status-work-status-restructure.md · technical/work-status-restructure
          Next Task: 2.2 — Status file template (new) — retire the old
          State:    In Progress
      [2] status-arcd-rebrand.md · feature/arcd-rebrand
          Next Task: 1.3 — Rename CLI package
          State:    Paused (2026-04-12) — waiting for restructure
      [q] Abort session-init
    Your choice:
    ```

    Each candidate shows filename, Branch field, Next Task (truncated to ~60 chars),
    and State. User types the number; `q` aborts cleanly. Fallback if user dismisses:
    abort session-init with an error surfacing the candidate list in the terminal so
    the user can resolve manually.

    Sync rendered output to `.arc/system/workflows/arc/session-lifecycle/session-init.md`
    with this project's config (`team.mode: false`, `pm.mode: arc-in-git`).

    **Completion:** Rewrote the package template's active-work loading model around a
    resolved status file instead of the retired singular `WORK-STATUS.md` path.
    Item 8 now defines Full-mode scan semantics (`.arc/active/**/status-*.md`) with
    zero/one/many-file handling, the pinned four-step disambiguation precedence
    (SESSION-NOTES `**Working On:**` → `**Branch:**` match → `**State:** In Progress`
    → user prompt), the exact ambiguous-selection prompt block, and the Lite-mode
    fixed-path variant (`.arc/active/status.md`). Downstream workflow language was
    updated to consume the resolved active status file consistently: batching notes,
    task-list/task-workflow gating, freshness-check example command, next-work
    discovery skip condition, orientation wording, trust hierarchy, and mismatch
    examples. The existing 6 conditional blocks were preserved in the template.
    Rendered output synced to `.arc/` in this project's current config shape
    (`team.mode: false`, `pm.mode: arc-in-git`). Tier 1 quality gate: markdown lint
    clean on the edited `.arc` workflow file.

    **Post-review amendment (2026-04-16):** Item 8's many-file disambiguation
    precedence read `**Working On:**` from SESSION-NOTES (Item 9, Batch 2) to
    resolve which candidate file to load — creating a latent batch-ordering
    dependency that the template didn't spell out. In zero/one-file cases the
    scan resolves in Batch 1 without needing SESSION-NOTES; only the rare
    many-file case needed deferred resolution. Added two surgical clarifications:
    a sentence at the end of the Execution Strategy paragraph flagging the
    exception, and a preface to Item 8's many-file case explaining that the scan
    completes in Batch 1 but the load defers until SESSION-NOTES is available in
    Batch 2. No batch restructuring — agents hitting the common zero/one-file
    path never read the caveat. Synced template → `.arc/`.

- [x] **2.6 `session-handoff.template.md` — dead-end removal, Working On: write, R18 guard**

    **Goal:** Remove the base-branch dead-end; add the `**Working On:**` write step;
    extend the existing Anti-patterns section with the R18 anti-duplication guard.

    File: `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-handoff.template.md`

    **Preserve existing `team.mode` conditional block** (1 block: lines ~81–89).

    **Edits:**

    - **Remove the dead-end instruction:** the "commit WORK-STATUS update on main
      under full protection" step (replaced by per-WU file semantics — no tracked
      file on main between WUs, nothing to commit)
    - **Add explicit step:** write the SESSION-NOTES `**Working On:**` field per the
      marker vocabulary established in Task 2.3 (status filename, or `[none]` /
      `[planning: ...]` / `[between work units]` markers)
    - **Extend the existing § Anti-patterns section** (lines ~227–245, currently 6
      bullets) with the R18 guard bullet and minimum-viable-SESSION-NOTES bullet set.
      This is an EXTENSION — do NOT create a new section. See details below.

    **R18 bullet to add to the anti-pattern list:**

    - ❌ **Restating committed content.** If it's in a committed file (WU status
      file, task list, commit message, notes-\*.md), don't restate it here. The next
      session reads tracked state first; SESSION-NOTES is the delta.

    **Minimum-viable-SESSION-NOTES bullet set** (positive counterweight, placed
    directly after the anti-patterns as a "what belongs here" list):

    - Things tried that didn't work (not yet captured in a commit or notes file)
    - Decisions not captured in tracked state
    - Observed risks
    - "Currently mid-X with concrete next action Y" when stopping mid-task

    **Embedded SESSION-NOTES template skeleton** (lines ~148–179) is updated by
    Task 2.3 (both-surfaces edit), not here. Do not duplicate that edit.

    Sync rendered output to `.arc/system/workflows/arc/session-lifecycle/session-handoff.md`.

    **Completion:** Rewrote the handoff workflow forward-clean around the new
    active-status-file model without touching the Task 2.3-owned SESSION-NOTES
    skeleton block. Broad singular `WORK-STATUS.md` framing was replaced with
    active status file language throughout: What to Update, the tracked-state update
    section, examples, completion/archival guidance, the conditional standalone
    commit fallback, and the closing "Next session" pointer. The procedural step list
    now includes an explicit `**Working On:**` write step with the four approved
    marker shapes (`status-{name}.md`, `[none]`, `[planning: {category}/{name}]`,
    `[between work units]`). The existing Anti-patterns section gained the pinned
    R18 anti-duplication bullet ("Restating committed content") plus a short
    positive "Minimum viable SESSION-NOTES" list immediately after it. Status-file
    examples now use the Task 2.2 field set (`State`, `Branch`, `Task List`,
    `Next Task`, `Last Completed`, `Blockers`, `Next Action`) rather than the
    retired singular WORK-STATUS shape. Existing `team.mode` conditional preserved.
    Rendered output synced to `.arc/`. Tier 1 quality gate: markdown lint clean on
    the edited `.arc` handoff workflow.

    **Post-review amendment (2026-04-16):** The original pass addressed the
    dead-end by renaming the standalone `### Conditional WORK-STATUS.md Commit`
    section to `### Conditional Active Status File Commit` and adding a "skip
    when no active WU exists" clause. Functionally correct, but the section sat
    *after* the SESSION-NOTES write and `arc user save` — meaning a late-surfaced
    dirty status file would be committed with a hash that the already-written
    `**Commit at Handoff:**` value no longer pointed at. Restructured the numbered
    handoff format as six steps (was four, with the update-tracked-state-and-
    SESSION-NOTES step conflated): (1) review persistent context, (2) check
    working dir paths, (3) write `**Working On:**`, (4) update status file
    content, (5) safety-check commit if status file is still dirty, (6) write
    SESSION-NOTES capturing the post-commit HEAD. Deleted the standalone
    `### Conditional Active Status File Commit` H3 section entirely — its content
    collapsed into step 5 as a lightweight catch-all paragraph with explicit
    "most handoffs skip this; commit-time is primary per DEV-RULES.ARC § Work
    status accuracy" framing and a "no ask — handoff invocation is the approval"
    note. Contributor callout updated to reference the new step numbers
    (skip steps 4–5 instead of the named deleted section). Added `[dev-rules-arc]`
    reference link definition in both template and rendered surfaces. Synced
    template → `.arc/`.

    - Edit `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/
      activate-work-unit.md`
    - Step 5: create per-WU status file at
      `.arc/active/{category}/status-{name}.md` from the new template (Task 2.2), with
      `State: In Progress`, `Branch: {impl-branch}`, `Task List: tasks-{name}.md`,
      initial `Next Task`, `Last Completed` ("Work unit activated"), `Blockers: [none]`,
      `Next Action` (e.g., "Begin Phase 1")
    - Step 8 commit references: stage the new status file alongside other activation
      artifacts; remove any references to updating a singular WORK-STATUS.md
    - **Incidental activation routing:** add an explicit "For incidental activation
      that interrupts active work, see `manage-incidental-work.md` § Coordinated
      Pause/Resume" pointer at Step 5 (or earlier, wherever the activation entry
      fork is most natural). Normal (non-incidental) activation flow is unchanged.
    - Sync to `.arc/`

- [ ] **2.8 `archive-work-unit.md` — delete per-WU file, do not reset**

    - Edit package source and sync to `.arc/`
    - Replace any "reset WORK-STATUS content" language with "`git rm` the per-WU status
      file" — archive deletes, does not reset
    - Preserve archival of task list and atomic companion file (unchanged)
    - **Incidental archive routing:** add a note that archiving an incidental WU
      alone does not handle the parent WU state flip (State: Paused → In Progress,
      Paused At / Paused To removal). Callers interrupting an active WU with an
      incidental must route archival through `manage-incidental-work.md` §
      Coordinated Pause/Resume, which orchestrates both status files in the same
      commit.

- [ ] **2.9 `clean-work-unit.md` — relocate terminal `State: Complete` write**

    - Edit package source and sync to `.arc/`
    - Terminal write target changes from task list `**Status:**` header to the status
      file `**State:**` field
    - Workflow ownership and behavior otherwise unchanged — `clean-work-unit.md` still
      owns the `State: Complete` write (arc-shift never writes `Complete`)

- [ ] **2.10 `integrate-work-unit.md` — references and Rotate → Integrate → Archive header update**

    - Edit package source and sync to `.arc/`
    - Replace WORK-STATUS references with status file references throughout
    - Update the Rotate → Integrate → Archive header language to reflect the per-WU
      file traveling through rotations (no more "reset on main" mid-integration)

- [ ] **2.11 `integrate-planning-branch.md` — Step 5 simplification**

    - Edit package source and sync to `.arc/`
    - Step 5 becomes trivial: no WORK-STATUS absorb needed. The chain-of-planning-cycles
      confusion is gone because planning branches don't carry a status file — they
      carry PRD/notes/tasks, all of which merge cleanly to the base branch's
      `backlog/{category}/` directory
    - Remove any prose acknowledging the staleness edge case

- [ ] **2.12 `rotate-branch.md` — per-WU file travel and session-boundary sub-pattern**

    - Edit package source and sync to `.arc/`
    - Update examples to show the per-WU status file traveling through rotations via
      normal merge flow
    - Resolve the session-boundary sub-pattern gap (previously ATOMIC-INBOX item #3):
      when an external action (npm publish, GitHub repo rename, smoke test) splits a
      rotation across sessions, the status file on the rotation branch carries state
      across the gap — session-init on the new session loads it by `Branch:` match

- [ ] **2.13 `manage-incidental-work.md` — paired status-file pause/resume**

    **Goal:** Relocate pause/resume coordination from task list header fields to
    coordinated updates across two status files (parent + incidental). Completes R16
    pointer migration — the task list carries structural metadata only; all dynamic
    state (including interrupt relationships) lives in status files.

    File: `packages/arc-framework/arc/system/workflows/arc/supplemental/manage-incidental-work.md`

    **Design principle** (lead of new § Coordinated Pause/Resume subsection):

    > Interrupt coordination is symmetric — every pause has a corresponding resume,
    > and both surfaces update in the same commit as the triggering lifecycle event.
    > The task list carries structural metadata only; dynamic interrupt state lives
    > in status files per R16.

    **Activation-side (incidental interrupts active WU):**

    - Create `.arc/active/incidental/status-{name}.md` from the Task 2.2 template
    - Populate incidental status file with the optional `**Interrupts:**` pointer:
      `**Interrupts:** tasks-{parent}.md — Task X.Y`
    - Update parent status file:
        - `**State:**` → `Paused (YYYY-MM-DD) — interrupted by incidental-{name}`
        - Add `**Paused At:** Task X.Y`
        - Add `**Paused To:** status-{incidental}.md`
    - Commit: parent status file update + new incidental artifacts in ONE atomic
      operation (the paired flip must not straddle commits)

    **Completion-side (incidental archives cleanly):**

    - Archive incidental via existing `archive-work-unit.md` → deletes
      `status-{incidental}.md` per Task 2.8
    - Update parent status file:
        - `**State:**` → `In Progress`
        - Remove `**Paused At:**` field entirely
        - Remove `**Paused To:**` field entirely
    - Commit: parent status file update alongside incidental archive in ONE atomic
      operation

    **Abandonment-side (incidental deactivates without work executed):**

    - Deactivate via Phase 4 `deactivate-work-unit.md` Case A workflow
    - If incidental status file was already created, it is deleted as part of
      deactivation; if never created, nothing to delete
    - Update parent status file: same flip as completion side (State → In Progress,
      remove pointer fields)
    - Same atomic-commit requirement

    **Cross-references to update in this task:**

    - Task 2.7 adds the routing pointer on `activate-work-unit.md`'s side
    - Task 2.8 adds the routing note on `archive-work-unit.md`'s side
    - This task ensures `manage-incidental-work.md` itself documents the full
      coordination protocol that those other workflows reference

    **Scope addition (2026-04-15, from Task 2.4 evaluation):** After Task 2.4
    stripped Status/Interrupts/pause-resume rules from `strategy-task-list-formatting.md`
    § Incidental Task Lists, standalone readers of that strategy doc have no
    forward pointer indicating that lifecycle state now lives in the status file.
    Add a one-line back-pointer to the Incidental Rules block there as part of
    this task's scope (paired with the new coordination protocol here so the
    pointer target is accurate on landing):

    > "- Lifecycle state (Status, Interrupts, Paused At/Paused To) lives in
    > the status file, not the task list — see `manage-incidental-work.md`
    > for the pause/resume protocol"

    Exact phrasing TBD during execution; sync the strategy file to `.arc/`
    alongside the workflow sync.

    Sync to `.arc/` counterpart.

- [ ] **2.14 `1_create-prd.md` and `2_generate-tasks.md` — reference updates**

    - Edit package source (both `2_generate-tasks.template.md` and the non-template
      `1_create-prd.md`) and sync to `.arc/`
    - Replace any `WORK-STATUS.md` references with `status-{name}.md` references
    - These workflows don't directly write status files (activation does), so edits
      are reference-updates only

- [ ] **2.15 Phase 2 Tier 2 quality gates**
    - [ ] 2.15.a Run `npm run -s lint:md` (full markdown lint)
    - [ ] 2.15.b Run `npm run lint:ts` (framework source may reference template paths)
    - [ ] 2.15.c Run `npm run lint:sh` (githooks hygiene)
    - [ ] 2.15.d Run `npm run typecheck`
    - [ ] 2.15.e Run `npm test` (CLI tests may cover init scaffolding; expect some to
          require updating if they reference retired WORK-STATUS.template.md)
    - [ ] 2.15.f Package-project sync verification across all edited files (including
          the new template, renamed files, and retired templates)
    - [ ] 2.15.g Marker vocabulary agreement check — grep the three SESSION-NOTES
          `**Working On:**` surfaces (scaffolding template at
          `packages/arc-framework/templates/user/SESSION-NOTES.md`, the embedded
          skeleton in `session-handoff.template.md`, and the read logic in
          `session-init.template.md`) and verify identical marker strings: `[none]`,
          `[planning: {category}/{name}]`, `[between work units]`, and the
          `status-{name}.md` filename reference pattern. Any drift in punctuation,
          whitespace, or token shape → fix the outlier to match the other two.
    - [ ] 2.15.h `Last Updated` field removal consistency check — grep the new status
          file template and SESSION-NOTES scaffolding template for `Last Updated` →
          expect zero hits. Grep the embedded SESSION-NOTES skeleton in
          `session-handoff.template.md` → expect zero hits. Any hit → surface for
          triage.

### **Phase 3:** Live Migration Cutover

**Purpose:** Meta-circular validation. Move this WU's own live state from the retiring
singular path to the new per-WU shape, and exercise the new loading strategy end-to-end
before the change reaches main.

- [ ] **3.1 Cutover: create new status file, delete the old**

    **Goal:** Single atomic cutover. After this task, `.arc/active/WORK-STATUS.md` no
    longer exists on this branch; `.arc/active/technical/status-work-status-restructure.md`
    exists and holds the project pointer.

    - Create `.arc/active/technical/status-work-status-restructure.md` from the new
      template (Task 2.2)
    - Populate fields from pre-cutover WORK-STATUS.md state:
        - `**State:**` `In Progress`
        - `**Branch:**` `technical/work-status-restructure`
        - `**Task List:**` `tasks-work-status-restructure.md`
        - `**Next Task:**` Task 3.2 (triple-anchor)
        - `**Last Completed:**` Task 3.1 (cutover summary)
        - `**Blockers:**` `[none]`
        - `**Next Action:**` "Run end-to-end session-init loading validation (Task 3.2)"
    - `git rm .arc/active/WORK-STATUS.md`
    - Commit as a single atomic operation

- [ ] **3.2 End-to-end session-init loading validation (dry-run)**

    **Goal:** Prove the new loading strategy resolves correctly against live state on
    this branch before the change reaches main.

    - Walk through the Task 2.5 session-init scan logic manually against current state:
        - Full mode scan of `.arc/active/**/status-*.md` → expect exactly one file
        - Verify `Branch:` field matches current git branch
        - Verify zero-file case handling (temporarily rename the file; re-run scan;
          rename back)
    - Exercise disambiguation precedence against SESSION-NOTES `**Working On:**` value
      (should resolve cleanly to the single extant status file)
    - Document any discovered friction in `notes-work-status-restructure.md` or atomic
      companion for Phase 7 verification review
    - No actual session boundary required — this is a logic walk, not a session restart

- [ ] **3.3 Remove Persistent Context entry from SESSION-NOTES**

    **Goal:** Removal trigger met — Phase 3 cutover commit has landed. Edited workflow
    instructions now match live state on this branch.

    - Remove the entry added in Task 2.1 from `.arc/user/andrew/SESSION-NOTES.md` §
      Persistent Context
    - Leave the section back to `[none]` unless other persistent entries exist

- [ ] **3.4 Phase 3 Tier 2 quality gates**
    - [ ] 3.4.a Run `npm run -s lint:md`
    - [ ] 3.4.b Verify no references to `.arc/active/WORK-STATUS.md` remain in any
          workflow, strategy, or reference doc (grep sweep)

### **Phase 4:** `deactivate-work-unit.md` (New Workflow)

**Purpose:** Author the new deactivation workflow from scratch. Case A (no work, not
merged) is the primary shipping procedure; Cases B/C/D route to other workflows with
explanatory blocks.

**Strategies:** `strategy-task-list-formatting.md` (workflow file format conventions),
`notes-work-status-restructure.md` § Deactivation reshape (source for design principle
and case matrix rationale).

- [ ] **4.1 Draft `deactivate-work-unit.md` — Case A primary procedure**

    **Goal:** Ship a complete workflow for the only genuine deactivation case.

    - Create `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/
      deactivate-work-unit.md`
    - Lead with the design-principle headline: *"Deactivation means undo-activation of
      a WU that didn't meaningfully start."*
    - Document Case A preconditions: no task work executed; not merged to main
    - Procedure: delete implementation branch (local + remote); git handles the revert
      automatically; main is already in pre-activation state
    - Move PRD/notes/tasks artifacts back to `backlog/{category}/` if activation moved
      them (verify against `activate-work-unit.md`'s moves)
    - Document postconditions: main matches pre-activation state; artifacts back in
      backlog; no status file exists
    - Sync to `.arc/`

- [ ] **4.2 Routing pointers for Cases B / C / D**

    - Add a "When NOT to deactivate" section after the Case A procedure
    - **Case B (not merged, some work):** Route to future `arc-shift` pause — metadata-
      in-place pattern, `State:` field flip to `Paused`, no file relocation. Note that
      `arc-shift` is not yet implemented (plan-arc-modes); for now, the recommendation
      is to complete or abandon via existing workflows rather than attempting manual
      parking
    - **Case C (merged, no work — rare edge case):** Document as a noted edge case.
      Requires a deactivation PR with inverse changes (move files back to backlog,
      reset roadmap). Under full protection this needs its own branch + PR. Retain as
      documented procedure; do not ship a separate workflow for it
    - **Case D (merged, some work):** Route to `integrate-work-unit.md` (complete and
      integrate) or `clean-work-unit.md` (archive with abandoned status)
    - Each routing block includes a one-sentence rationale for why the case is not
      deactivation in the restructure-era sense

- [ ] **4.3 Register new workflow in indexes**

    - Update `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/
      README.md` (if one exists) to list `deactivate-work-unit.md`
    - Update any workflow index or cross-reference in related workflows
      (`activate-work-unit.md` may want a "see also" pointer)
    - Check `.arc/system/.internal/manifest.json` — if the package sync manifest
      enumerates Framework workflow files, add the new file
    - Sync to `.arc/`

- [ ] **4.4 Phase 4 Tier 2 quality gates**
    - [ ] 4.4.a Run `npm run -s lint:md`
    - [ ] 4.4.b Internal link checking — new file has outbound refs to other workflows;
          other workflows may gain inbound refs. Verify no broken links
    - [ ] 4.4.c Package-project sync verification

### **Phase 5:** Plan-\* Doc Updates

**Purpose:** Queued WUs' planning documents reflect the new model before they progress
toward PRD/execution. `plan-arc-modes.md` receives substantive cross-reference work;
the other two get header-level notes only.

**Strategies:** `notes-work-status-restructure.md` § Harmony with shift lifecycle (source
for Task 5.4 subsection).

- [ ] **5.1 `plan-arc-modes.md` — Finding #4 carve-out update**

    **Goal:** Explicitly hand the `Following Task List` (FTL) field removal resolution
    to this WU.

    - Locate Finding #4 / Lite session management resolution (plan doc lines
      approximately 2597–2605 per PRD R17 reference)
    - Update the finding to reference this WU (`prd-work-status-restructure.md`) as
      the resolution point instead of being a standalone finding
    - **Explicit note in the carve-out text:** *"The `Following Task List` field is
      removed as part of the Work-Status Restructure WU's R17 — the new status file
      template does NOT carry this field. Future edits to status file templates or
      field sets must not re-introduce it."* (This phrasing exists so a future editor
      re-reading plan-arc-modes sees the prohibition at the source of truth for the
      decision)

- [ ] **5.2 `plan-arc-modes.md` — shift-lifecycle vocabulary find-and-replace**

    - Locate the shift-lifecycle section
    - Replace task-list `**Status:**` header references with status file `**State:**`
      field references
    - Preserve shift vocabulary verbatim: `Paused (date) — reason`, `Waiting-For
      {category} (date) — reason`, `In Progress`, `Complete`
    - Mechanical edit — only the host field changes, not the values

- [ ] **5.3 `plan-arc-modes.md` — line ~4016 language alignment**

    - Locate the "WORK-STATUS.md remains branch status, single-slot" language
    - Update to reflect per-WU `status-{name}.md` shape
    - Align surrounding prose with the per-WU model

- [ ] **5.4 `plan-arc-modes.md` — new "Alignment with Work-Status Restructure WU" subsection**

    - Add a new subsection documenting harmony with the shift lifecycle
    - Source material: `notes-work-status-restructure.md` § Harmony with shift lifecycle
      (covers: per-WU file harmonizes with metadata-in-place, source-of-truth
      simplification, ownership of terminal transition unchanged, vocabulary unchanged,
      scenario battery re-validation)
    - Include Pure Option C re-validation statement: Pure Option C's concerns (no
      registry, no cache, no session-init noise) remain fully satisfied under the new
      premise; task list header removal is the mechanical complement
    - Reference the restructure WU's PRD and notes as primary sources

- [ ] **5.5 `plan-post-release-methodology.md` — header-level note**

    - Add a single header-level note (or top-of-file banner) acknowledging that the
      `arc-plan` skill reference in this plan aligns with the new per-WU status file
      model; no substantive content change
    - Source: PRD § Plan-\* doc updates

- [ ] **5.6 `plan-expanded-planning-path.md` — header-level note**

    - Add a single header-level note acknowledging alignment with the new model;
      the existing session-pointer list reference resolves naturally

- [ ] **5.7 Phase 5 Tier 2 quality gates**
    - [ ] 5.7.a Run `npm run -s lint:md` (all edited plan-\* docs)
    - [ ] 5.7.b Internal link checking (cross-references between plan-\* docs and the
          restructure PRD)

### **Phase 6:** Remaining Reference Cleanup

**Purpose:** Sweep agent-facing and project-level reference docs for any residual
`WORK-STATUS.md` language. Mostly reference updates; no substantive content changes.

- [ ] **6.1 `AGENT-BRIEFING.ARC.md` — WORK-STATUS reference updates**

    - Update the Key Documents table row for WORK-STATUS (if present)
    - Replace any prose references to the singular file with per-WU status file
      references
    - Both copies (Framework file — edit package source first)

- [ ] **6.2 `AGENT-BRIEFING.PROJECT.md` — reference updates (if any)**

    - Scan for WORK-STATUS references; update if present
    - Configurable file — edit project section only

- [ ] **6.3 `CLAUDE.ARC.md` — reference updates (if any)**

    - Scan for WORK-STATUS references; update if present
    - Configurable file — edit project section only

- [ ] **6.4 `PROJECT-STATUS.md` — reference updates**

    - PROJECT-STATUS structure unchanged (stays as portfolio-level index)
    - Reference updates only — replace any WORK-STATUS.md prose references with
      per-WU status file language
    - Both copies if Framework; project-owned if Scaffolded (check classification)

- [ ] **6.5 Grep sweep — catch any remaining references**
    - [ ] 6.5.a Grep `.arc/` for `WORK-STATUS.md` — expect zero hits after Phases 1–5
    - [ ] 6.5.b Grep `packages/arc-framework/arc/` for `WORK-STATUS.md` — expect zero
          hits
    - [ ] 6.5.c Grep both trees for `active/WORK-STATUS` — expect zero hits
    - [ ] 6.5.d Any hits found: evaluate and fix (may be legitimate historical
          references in ADRs or archive; otherwise update)

- [ ] **6.6 Phase 6 Tier 2 quality gates**
    - [ ] 6.6.a Run `npm run -s lint:md`
    - [ ] 6.6.b Package-project sync verification

### **Phase 7:** Verification

- [ ] **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

### Design flaws eliminated

- [ ] Parallel-WU merge conflicts at integration gone (different files, no shared mutation)
- [ ] WORK-STATUS staleness on main under full protection gone (file never exists there
      between WUs)
- [ ] `session-handoff.md` dead-end on main under full protection gone (nothing to commit
      when no active WU)
- [ ] `integrate-planning-branch.md` § Step 5 planning-cycle chain confusion gone
      (WORK-STATUS isn't part of planning state)
- [ ] `rotate-branch.md` session-boundary sub-pattern gap gone (per-WU file travels
      through rotations via normal merge flow)
- [ ] Archive content conflicts gone (archive deletes a file; no content merge)

### Post-migration invariants

- [ ] No tracked path exists at `.arc/active/WORK-STATUS.md`
- [ ] `packages/arc-framework/arc/active/WORK-STATUS.template.md` retired from package
      source (no scaffolding at init)
- [ ] Every active work unit has exactly one `status-{name}.md` file in its category
      directory
- [ ] Session-init correctly resolves the active status file across the 8 stress-test
      scenarios in `notes-work-status-restructure.md` § Stress-test battery (at minimum:
      zero/one/many-file cases validated during Phase 3)
- [ ] `**State:**` field is the sole source of truth for WU lifecycle — task list
      `**Status:**` header removed from the task list template
- [ ] Status file is deleted (not reset) at archive per `archive-work-unit.md`
- [ ] ATOMIC-INBOX items #1, #2, #3 removed from `.arc/user/andrew/ATOMIC-INBOX.md`
      (resolved-by-design via this WU)
- [ ] SESSION-NOTES template carries the `**Working On:**` field with defined marker
      vocabulary per PRD Q1 resolution
- [ ] `session-handoff.md` writes `**Working On:**`; `session-init.md` reads it as
      primary disambiguation signal; SESSION-NOTES template documents the marker
      vocabulary — all three surfaces agree
- [ ] Package-source mirrors synced per `strategy-package-project-sync.md` — every
      `.arc/` edit has its package-source counterpart staged in this WU's commits
- [ ] ADR-007 carries a `## Amendments` section documenting the refinement
- [ ] `plan-arc-modes.md` carries the substantive cross-reference section, the
      Finding #4 carve-out reference with the explicit "do not re-introduce FTL"
      prohibition, shift-lifecycle vocabulary find-and-replace, and line ~4016
      alignment
- [ ] `deactivate-work-unit.md` exists in both `.arc/` and package source, ships Case A
      primary procedure, and documents routing pointers for Cases B/C/D
- [ ] Rebrand WU reactivates cleanly on the new model (first real exercise across
      rotating branches) — validated when rebrand WU's next session begins post-merge
- [ ] All quality gates pass (markdown lint, TypeScript lint, shell lint, typecheck,
      test suite, build — 0 violations)
- [ ] Ready for `integrate-work-unit.md`

---

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
