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
- Update 5 agent/project reference docs (including `AGENT-BRIEFING.CONTRIBUTOR.md`
  for the contributor-personal rename)
- Rename the contributor's optional personal status file from
  `user/{identity}/WORK-STATUS.md` to `user/{identity}/status-contributor.md` —
  retires the last `WORK-STATUS.md` filename in the repo and aligns with the
  `status-{scope}.md` family established elsewhere in this WU
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

- [x] **2.7 `activate-work-unit.md` — Step 5 creates status file from template**

    Step 5 rewritten from "Update WORK-STATUS.md" (7 field-update bullets on the
    singular file) to "Create Status File" (create `.arc/active/{category}/status-{name}.md`
    from `template-status.md` with the initial field set: `State: In Progress`,
    `Branch`, `Task List`, `Next Task`, `Last Completed: Work unit activated`,
    `Blockers: [none]`, `Next Action`). Stale `Following Task List` reference
    retired. Optional pointer fields (`Interrupts:`, `Paused At:`, `Paused To:`)
    kept commented out per template — they populate only on incidental interrupt
    per Task 2.13.

    Step 8 staging blocks updated on both paths (`arc-in-git` and `none`/`external`) —
    they now stage `.arc/active/{category}/status-{name}.md` instead of
    `.arc/active/WORK-STATUS.md`. Commit body line changed to
    "Create status file and update task list status". Mode Detection summary line
    ("branch creation, status update, WORK-STATUS, …") and Checklist Summary
    ("WORK-STATUS.md updated") updated in parallel. Team-mode callout reworded
    to "per-WU status file tracked in `active/{category}/`".

    **Incidental activation routing pointer:** Placed as a `>` callout immediately
    after `**When to use:**` in Purpose — the activation entry fork is at workflow
    entry, not Step 5. Points to `manage-incidental-work.md` § Coordinated
    Pause/Resume (forward reference to Task 2.13). Normal activation flow
    unchanged.

    **Link defs added:** `[template-status]`, `[incidental]`.

    **Scope boundary:** Step 4 ("Change `Status: Not Started` → `Status: In Progress`")
    and the Prerequisites bullet "Task list has `Status: Not Started`" both left
    untouched — they remain valid until Task 2.14 retires the `**Status:**` header
    from `2_generate-tasks.template.md`.

    **Sync:** Framework file — edited package source first, copied to `.arc/`,
    post-sync diff empty. Markdown lint clean on `.arc/` copy (package source
    excluded from project lint scope by design). `framework-sync.test.ts`
    (Task 1.8) enforces the mirror on commit.

- [x] **2.8 `archive-work-unit.md` — delete per-WU file, do not reset**

    Step 5 rewritten from "Update WORK-STATUS.md" (a two-case block covering
    reset-to-defaults on base branch and restore-to-parent-context for stacked
    incidentals) to "Delete Status File" — `git rm .arc/active/{category}/status-{name}.md`.
    Both legacy cases collapsed: under the new model, parent state lives in the
    parent's own per-WU status file (still on disk after incidental archive), so
    no restoration is needed; and there are no "no active work" defaults to reset
    to, because session-init's zero-file case handles the between-WUs state
    naturally.

    **Incidental archive routing callout** placed inside Step 5 — points to
    `manage-incidental-work.md` § Coordinated Pause/Resume for the parent state
    flip (State: Paused → In Progress, remove `Paused At:` / `Paused To:`). That
    workflow (Task 2.13) orchestrates both status files in the same atomic
    commit. `archive-work-unit.md` alone only `git rm`s the incidental file.

    **Step 8 staging:** Dropped `git add .arc/active/WORK-STATUS.md` — the `git rm`
    in Step 5 auto-stages the deletion, and the `.arc/active/{category}/`
    directory-level add already captures it. Added inline comment noting this.

    **Next Step cleanup:** Partial-protection line dropped the "(or follow
    WORK-STATUS.md Next Action if different)" parenthetical. Full-protection
    standalone-archival line dropped "Update WORK-STATUS.md Next Action..." —
    there's no between-WU file to update under the new model. Common Pitfalls
    entry rewritten: "Skip WORK-STATUS.md reset" → "Skip status file deletion →
    dangling state file in active/".

    **Link defs added:** `[incidental]`.

    **Sync:** Framework file — edited package source first, copied to `.arc/`,
    post-sync diff empty. Markdown lint clean on `.arc/` copy.

- [x] **2.9 `clean-work-unit.md` — relocate terminal `State: Complete` write**

    Two surfaces updated — both the Mode 2 terminal write targets the status
    file's `**State:**` field instead of the task list's retired `**Status:**`
    header:

    - Step 1 (§ Confirm Pairing and Status): Mode 2 bullet rewritten to "Update
      the per-WU status file `**State:**` field to `Complete`" with a note that
      lifecycle state lives in `active/{category}/status-{name}.md`, not the task
      list.
    - Step 6 (§ Update Cross References): "task file `**Status**: Complete`" →
      "status file `**State:** Complete`". Notes file `**Status**: Complete`
      unchanged — notes files track their own state separately, orthogonal to
      this task's scope.

    **Workflow ownership preserved:** `clean-work-unit.md` Mode 2 still owns the
    terminal `State: Complete` write. Mode 1 (mid-work cleanup) remains
    non-lifecycle per its existing semantics.

    **Scope boundary:** Step 3's "Standard task list structure to preserve"
    header list (line ~192, lists `Status` among preserved metadata) left
    untouched — it's a transitional reference consistent with Task 2.7's
    deferral of Step 4 (both depend on Task 2.14 retiring
    `2_generate-tasks.template.md`'s `**Status:** Not Started` emission).

    **Sync:** Framework file — edited package source first, copied to `.arc/`,
    post-sync diff empty. Markdown lint clean on `.arc/` copy.

- [x] **2.10 `integrate-work-unit.md` — references and Rotate → Integrate → Archive header update**

    Four surfaces updated:

    - **Rotate → Integrate → Archive header block** (top of file): "reset tracking
      state" → "delete the per-WU status file"; "update tracking" in the Archive
      bullet → "delete the status file". Added a trailing sentence: "The per-WU
      status file travels with the task list across rotations via normal merge
      flow — no mid-lifecycle resets or absorbs." Directly addresses the
      "no more 'reset on main' mid-integration" clarification from the task
      description.
    - **Step 1 (Verify Work Completion):** "Task list header `**Status:**`
      updated to `Complete`" → "Status file `**State:**` updated to `Complete`
      (written by `clean-work-unit.md` Mode 2)". PRD header `**Status:**` line
      left as-is — PRDs retain their own Status field independently.
    - **Step 6c:** Title renamed "Update WORK-STATUS.md" → "Update Status File".
      Body rewrites all WORK-STATUS mentions to target the per-WU status file
      path `.arc/active/{category}/status-{name}.md`. Bundle-with-6b commit
      guidance preserved; the "resets automated PR reviews" rationale preserved.
    - **Step 7 (PR body scoping):** "those belong in WORK-STATUS and
      SESSION-NOTES" → "those belong in the status file and SESSION-NOTES".

    No new link defs needed — `[clean-work-unit.md](clean-work-unit.md)` added
    inline matching the file's existing pattern for same-directory references.

    **Sync:** Framework file — edited package source first, copied to `.arc/`,
    post-sync diff empty. Markdown lint clean on `.arc/` copy.

- [x] **2.11 `integrate-planning-branch.md` — Step 5 simplification**

    Three surfaces updated:

    - **Scope Boundaries § Does NOT belong:** "WORK-STATUS updates pointing to the
      new work unit (activate-work-unit Step 5)" → "Status file creation for the
      new work unit (activate-work-unit Step 5)". Matches the new Task 2.7 Step 5.
    - **Step 2 (PR description § Scope of PR body):** "belongs in WORK-STATUS and
      SESSION-NOTES" → "belongs in SESSION-NOTES" (status file doesn't apply here
      — planning branches precede activation, so no status file exists yet).
    - **Step 5 (Transition to Activation § Session boundary):** Full paragraph
      rewritten. Dropped the "WORK-STATUS on the base branch may be stale after
      merge (auto-resolved to the pre-merge base version — activate-work-unit
      overwrites it)" staleness-edge-case prose. New version states plainly that
      the base branch has no status file for this WU yet; `activate-work-unit.md`
      Step 5 creates it. The chain-of-planning-cycles confusion evaporates
      because planning branches don't carry a status file.

    **Verification checklist bullet** "Task list `**Status:**` is `Not Started`"
    (Step 1) left untouched — same transitional scope as Task 2.7's Step 4
    deferral (cascades with Task 2.14's retirement of the emission).

    **Sync:** Framework file — edited package source first, copied to `.arc/`,
    post-sync diff empty. Markdown lint clean on `.arc/` copy.

- [x] **2.12 `rotate-branch.md` — per-WU file travel and session-boundary sub-pattern**

    Two scoped changes, both inside Step 5 (Update Tracking):

    - **Checklist extended:** Replaced the single "WORK-STATUS.md updated to
      reflect the new branch and current task" bullet with two bullets —
      one for the status file field updates (`**Branch:**` + advance
      `**Next Task:**` / `**Next Action:**`) and one confirming both the task
      list and status file are present on the new branch (both travel via
      normal merge flow). No new "examples" section needed — the checklist
      bullet is the example, and the existing step 3-4 merge/next-branch
      mechanics already describe the merge flow that carries both files.
    - **Rotation-across-sessions callout** added as a `>` block immediately
      after the existing "If the session is ending after rotation..." line —
      the natural fork point for session-continuity guidance. Covers the
      ATOMIC-INBOX item #3 gap: external action splits a rotation across
      sessions → status file on the rotation branch carries state across
      the gap → session-init's `**Branch:**` match resolves the active WU
      with no special handling. Frames as "no special handling needed
      beyond the normal session-handoff / session-init cycle" — reassures
      the reader the common path already covers this case.

    **Sync:** Framework file — edited package source first, copied to `.arc/`,
    post-sync diff empty. Markdown lint clean on `.arc/` copy.

- [x] **2.13 `manage-incidental-work.md` — paired status-file pause/resume**

    Added new `## Coordinated Pause/Resume` top-level section to
    `manage-incidental-work.md`, positioned between "Git Branch for Incidental
    Work" and "Execution, Completion, and Archival" — the natural flow point
    after branching conventions and before execution/archival pointers. Section
    opens with the symmetry principle and a hoisted atomic-commit requirement,
    then three H3 subsections (Activation, Completion, Abandonment) covering
    the full lifecycle. Each subsection names the triggering workflow, lists
    the numbered steps, and calls out the exact field updates required on the
    parent status file. Completes R16 pointer migration — task list carries
    structural metadata only, dynamic interrupt state lives in status files.

    **Pointer format aligned with Task 2.2 template** (interpretation call):
    This task's original draft (2026-04-15, pre-dating 2.2) specified
    `**Interrupts:** tasks-{parent}.md — Task X.Y` and
    `**Paused To:** status-{incidental}.md`. Task 2.2 subsequently shipped
    `template-status.md` with the bare `{category}/{name}` convention for both
    pointers — that template is authoritative. Used `{parent-category}/{parent-name}`
    for `Interrupts:` and `incidental/{incidental-name}` for `Paused To:`.
    Task identity is carried by `**Paused At:** Task X.Y` on the parent side;
    no duplication needed on the incidental side.

    **Forward link to `deactivate-work-unit.md`:** Abandonment subsection uses
    an inline link even though the target file doesn't land until Phase 4
    (Task 4.1). Broken window is intra-WU only; resolves before integration.
    Matches house-style inline linking for sibling work-unit-lifecycle files.

    **Back-pointer in `strategy-task-list-formatting.md`:** Added one-line
    bullet to the Incidental Task Lists Rules block pointing at the new
    § Coordinated Pause/Resume — closes the gap left when Task 2.4 stripped
    lifecycle state rules from that section.

    **Sync:** Framework files — edited package source first, copied to `.arc/`,
    post-sync diff empty on both files. Tier 1 markdown lint clean on both
    `.arc/` copies. Added `[template-status]` reference link to
    `manage-incidental-work.md`'s link block for the new template citation.

- [x] **2.14 `1_create-prd.md` and `2_generate-tasks.md` — reference updates**

    **`1_create-prd.md`:** No edits needed. Pre-task grep for `WORK-STATUS`,
    `status file`, `**Status:**`, and related project-pointer semantics
    returned zero hits. The file stays entirely within its scope (PRD
    creation + plan retirement) and doesn't reference session or project
    pointer state.

    **`2_generate-tasks.template.md`:** Two edits in the Task List Header
    example block — both aligning this surface with the post-Task-2.4
    strategy doc (authoritative):

    - Removed `**Status:** Not Started` line. Task 2.4 retired `**Status:**`
      from task list headers; WU-lifecycle state now lives on the per-WU
      status file's `**State:**` field. This surface was the last stale
      copy of the retired field.
    - `**Branch:**` → `**Branch(es):**`. Aligns with strategy doc's
      authoritative plural form (supports stacked PRs / team sub-branches).
      Minor drift fix done inline per "leave it cleaner" since it was in
      the same block.

    **Sync:** Edited package source first. The file carries `arc:if team.mode`
    conditionals that are stripped in `.arc/`, so can't straight-copy — applied
    the same edit to the `.arc/` rendered copy directly. Post-edit diff between
    template and `.arc/` shows only the expected conditional-block drift (team
    ownership block + `[team-coordination]` link reference). Tier 1 markdown
    lint clean on `.arc/` copy. Task 2.15.f (Phase 2 Tier 2 quality gates) will
    run the framework-sync integration test for cross-file verification.

- [x] **2.15 Phase 2 Tier 2 quality gates**
    - [x] 2.15.a `npm run -s lint:md` — 0 errors across 178 files
    - [x] 2.15.b `npm run lint:ts` — clean
    - [x] 2.15.c `npm run lint:sh` — clean
    - [x] 2.15.d `npm run typecheck` + `npm run typecheck:test` — clean
    - [x] 2.15.e `npm test` — 573 unit/integration tests + 43 e2e tests, all pass. No
          CLI tests required updating — WORK-STATUS.template.md retirement assertions
          were already swept in Task 2.2's test-fixture updates
    - [x] 2.15.f Package-project sync verification — `framework-sync.test.ts`
          (integration) passes, confirming package source ↔ `.arc/` parity across all
          Framework/Configurable files edited in Phase 1 and Phase 2
    - [x] 2.15.g Marker vocabulary agreement — all four strings (`[none]`,
          `[planning: {category}/{name}]`, `[between work units]`, `status-{name}.md`)
          match byte-for-byte across the three surfaces: scaffolding template comment
          block, `session-handoff.template.md` embedded skeleton comment block, and
          the prose write-instructions in `session-handoff.template.md`. Session-init
          only references `**Working On:**` as a field name (by design — it reads
          the value but doesn't enumerate markers)
    - [x] 2.15.h `Last Updated` removal — zero hits in `template-status.md`, scaffolding
          `SESSION-NOTES.md`, and `session-handoff.template.md`

### **Phase 3:** Live Migration Cutover

**Purpose:** Meta-circular validation. Move this WU's own live state from the retiring
singular path to the new per-WU shape, and exercise the new loading strategy end-to-end
before the change reaches main.

- [x] **3.1 Cutover: create new status file, delete the old**

    **Outcome:** Single atomic cutover complete. `.arc/active/WORK-STATUS.md` no
    longer exists on this branch; `.arc/active/technical/status-work-status-restructure.md`
    now holds the project pointer, populated from the new template (Task 2.2) with
    pre-cutover state. Per-WU state lives at the new location for the remainder of
    this WU.

- [x] **3.2 End-to-end session-init loading validation (dry-run)**

    **Outcome:** New loading strategy resolves correctly against live state on this
    branch. Scan of `.arc/active/**/status-*.md` returns exactly one file; `Branch:`
    field matches current git branch; zero-file case confirmed via temporary rename
    (empty scan result). Disambiguation precedence not exercised by a single-file
    case (correct per workflow — step 1 bypassed), but `**Working On:**` value in
    SESSION-NOTES matches the filename if it had been needed. No friction discovered.

- [x] **3.3 Remove Persistent Context entry from SESSION-NOTES**

    **Outcome:** Persistent Context entry removed from
    `.arc/user/andrew/SESSION-NOTES.md`; section reset to `[none]`. Removal trigger
    met — edited workflow instructions now match live state on this branch.

    **Note:** Technically executed ahead of the Phase 3 cutover commit landing
    (this commit is still pending user approval), but the cutover changes are
    staged atomically with this task list update, so the trigger effectively
    resolves as part of the same commit operation.

- [x] **3.4 Phase 3 Tier 2 quality gates**
    - [x] 3.4.a `npm run -s lint:md` — 0 errors across 178 files
    - [x] 3.4.b Grep sweep complete. Findings classified: active WU artifacts
          describe the retirement by design (legitimate); ROADMAP names both paths
          in the WU summary (legitimate); archived task list untouched per scope.
          Analysis docs (`analysis-modes-*.md`) document ruled-out options against
          the pre-restructure path as historical fact — left as-is. Live broken
          references identified in 5 surfaces + 3 demo scripts — out-of-scope for
          Phase 2's edit set; new Task 3.5 inserted to sweep them in a separate
          atomic commit.

- [x] **3.5 Sweep live WORK-STATUS path references missed in Phase 2**

    **Outcome:** Swept the live workflow/skill/demo surfaces surfaced by 3.4.b.
    All user-facing post-merge touch points now describe the per-WU status file
    model.

    - `arc-handoff/SKILL.md` (package source + `.arc/` mirror): session-handoff
      target rewritten from the fixed singular path to "the active status file
      (resolved at session init)". Step 3 header and body reworded from
      "WORK-STATUS.md" → "the status file".
    - `initial-setup/01_verify-and-configure.md` (package source + `.arc/`
      mirror): § Verify Directory Structure `active/` bullet reframed as
      "created lazily at first work unit activation; absent immediately after
      init". § Verify Session State rewritten — there is no file to verify at
      init; instead, confirm the SESSION-NOTES bootstrap Persistent Context
      entry (pre-populated by `arc init` per Task 2.2) with an example block.
    - `plan-arc-modes.md` line 2621: Lite cascade forward-pointer updated
      `.arc/active/WORK-STATUS.md` → `.arc/active/status.md`. Other WORK-STATUS
      references in the doc describe pre-restructure state as part of the
      historical planning analysis — left as-is.
    - `docs/demos/` (5 scripts, expanded from the 3 named in the original
      scope — 3.4.b's grep used the full path; a broader `WORK-STATUS` sweep
      surfaced textual references in `arc-handoff.sh` and `arc-commit.sh`):
      `first-session-init.sh` replaced the WORK-STATUS read with the
      `Glob .arc/active/**/status-*.md` scan (zero-file case implicit in the
      "no active work" flow). `session-init.sh` and `session-init-readme.sh`
      replaced the WORK-STATUS read with a scan + read-of-resolved-file pair,
      and the agent log line "Active task work in WORK-STATUS" → "in status
      file". `arc-handoff.sh` and `arc-commit.sh` updated their bare
      "WORK-STATUS.md" text references to "active status file".

    **Deferred (no edit):**

    - `.arc/reference/analysis/analysis-modes-*.md` — historical analysis.
    - `.arc/reference/archive/…` — archived, out of scope per § Won't Do.
    - Additional `WORK-STATUS` mentions in `plan-arc-modes.md` (historical
      planning context).

    **Quality gates:** `lint:md` clean on all modified `.md` files;
    framework-sync integration test passes as part of full test suite
    (573 tests green); shell lint (`lint:sh`) clean on system scripts.
    Demo-script edits were string replacements only — no structural shell
    changes, low-risk.

- [x] **3.6 Live stale-reference sweep — workflow/skill/strategy/hook surfaces**

    **Outcome:** Closed the broader `WORK-STATUS` textual reference sweep gap
    surfaced after Task 3.5. All live surfaces not explicitly scoped by Phase
    5/6 now describe the per-WU status file model. 43 file touches across
    18 package-source edits, 19 `.arc/` mirror/instance syncs, and 6
    agent-tool skill re-syncs.

    **In scope — 19 surfaces, dual-copy sync for Framework files:**

    Live workflows (7):

    - `3_process-task-loop.md` — commit-time WORK-STATUS staging
      instruction
    - `arc-extensions.md` — activation output description
    - `initial-setup/02_define-project.md` — first-session discovery-mode
      prose (note: init no longer creates `.arc/active/`)
    - `supplemental/maintain-project-docs.md` — core-docs list
    - `supplemental/prepare-commits.md` — commit-time instruction (2 refs)
    - `supplemental/verify-arc-integrity.md` — `### Session State` health
      check section (documentation side of the script rewrite in
      `verify-integrity.sh` below)

    Live skills (3):

    - `skills/README.md` — arc-commit description
    - `skills/arc-commit/SKILL.md` — active agent instruction (2 refs)
    - `skills/arc-task-audit/SKILL.md` — active agent instruction

    Hook/script logic (3 — non-trivial):

    - `githooks/commit-msg` **RULE 7 rewrite** — currently hard-codes
      `.arc/active/WORK-STATUS.md` in the freshness warning. Pattern-match
      off Task 1.7's pre-commit CHECK 10 rewrite: derive the sibling
      status file from the staged task list's directory.
    - `githooks/README.md` — rule descriptions (multiple)
    - `scripts/verify-integrity.sh` **Session State section rewrite** —
      currently hard-coded path existence check + Task List field read;
      new model needs glob-scan `.arc/active/**/status-*.md` + field
      resolution (plus possible Lite-mode branch for `.arc/active/status.md`)

    Strategy docs with factual updates (3):

    - `strategies/arc/strategy-file-classification.md` — 3 refs using
      WORK-STATUS as Scaffolded exemplar; replacement exemplar (ROADMAP
      or META-PRD) since file retired
    - `strategies/project/strategy-package-project-sync.md` — 2 refs
      listing `WORK-STATUS.template.md` as Scaffolded counterpart (Task 2.2
      retired this template; `template-status.md` is Framework, different
      sync semantics — strategy needs factual update)
    - `strategies/arc/strategy-configurability-architecture.md` — defaults
      table row for session state mechanism

    Top-level refs (2):

    - `META-PRD.md` — session state mechanism description
    - `TECHNICAL-OVERVIEW.md` — active workspace parenthetical

    Agent-tool copies (2, plus re-sync of 4 others):

    - `.claude/skills/arc-handoff/SKILL.md` — drifted from `.arc/` after
      Task 3.5 edit; resync
    - `.codex/skills/arc-handoff/SKILL.md` — same
    - After `.arc/` edits land for arc-commit/SKILL.md and
      arc-task-audit/SKILL.md, the `.claude/` and `.codex/` copies need
      resync (4 additional file touches)

    **Sync discipline:** Framework files (all the above except .arc/-only
    items like the contributor rename target) require package-source-first
    edit then sync to `.arc/`. Some workflow files have `.template.md`
    variants in package source with `arc:if` conditionals; preserve them.

    **Scope additions discovered during execution:** Mid-task grep (run on
    the package tree) surfaced three additional live surfaces beyond the
    initial 19: `packages/arc-framework/arc/README.md` (directory-tree
    diagram listing `WORK-STATUS.md`), `packages/arc-framework/arc/user/README.md`
    (project-level file description and "What Lives Where" table — two refs;
    the contributor-personal line 63 was deferred to Phase 6.5 per scope),
    `system/workflows/arc/initial-setup/03_configure-external-integration.md`
    (activation-output description; package-only for our `pm.mode: arc-in-git`),
    and `reference/QUICK-REFERENCE.template.md` (three refs pointing
    developers to the active status file for working-directory context —
    template source for adopter's rendered QUICK-REFERENCE; our project's
    `.arc/reference/QUICK-REFERENCE.md` was already clean from prior edits).
    All folded in under the same sweep logic.

    **Post-edit MD060 fixes:** Table alignment issues surfaced in lint after
    edits in `strategy-configurability-architecture.md` (row wider than
    column) and `user/README.md` (same issue). Resolved by shortening row
    content to fit existing column widths — no column-width changes needed.

    **Quality gates executed:**

    - `lint:md`: 0 errors across 178 files
    - `lint:sh`: clean (shellcheck on githooks + system scripts, including
      the rewritten `commit-msg` RULE 7 and `verify-integrity.sh` Session
      State section)
    - `lint:ts`: clean
    - `typecheck` + `typecheck:test`: clean
    - `npm test`: 616 tests green (573 unit/integration + 43 e2e),
      including framework-sync integration test confirming package ↔ `.arc/`
      parity across Framework files
    - Manual: ran `bash .arc/system/scripts/verify-integrity.sh` post-rewrite
      to confirm the new glob-scan logic correctly resolves this WU's
      `status-work-status-restructure.md` and its Next Task field

    **Out of scope (confirmed by verification grep):**

    - ADR bodies (immutable historical decisions — amendments already done
      where applicable per Task 1.1)
    - `.arc/reference/analysis/*` (historical design analysis)
    - `.arc/reference/archive/*` (archived, out of scope per § Won't Do)
    - `.arc/system/.internal/manifest.json` and `pristine.json` (generated
      artifacts; pristine.json is the three-way merge baseline and
      intentionally preserves old content)
    - `tasks-arcd-rebrand.md` (out of scope per § Won't Do)
    - Plan docs with WORK-STATUS references as historical planning context
      (`plan-arc-modes.md`, `plan-session-init-optimization.md`,
      `plan-post-release-methodology.md`, `plan-expanded-planning-path.md`)
    - Phase 5/6 scoped surfaces (agent briefings, PROJECT-STATUS,
      contributor personal-file rename, session-init.md contributor section,
      user/README.md contributor-pipeline line)
    - Active WU artifacts and ROADMAP WU description (describe the
      restructure by design)

### **Phase 4:** `deactivate-work-unit.md` (New Workflow)

**Purpose:** Author the new deactivation workflow from scratch. Case A (no work, not
merged) is the primary shipping procedure; Cases B/C/D route to other workflows with
explanatory blocks.

**Strategies:** `strategy-task-list-formatting.md` (workflow file format conventions),
`notes-work-status-restructure.md` § Deactivation reshape (source for design principle
and case matrix rationale).

- [x] **4.1 Draft `deactivate-work-unit.md` — Case A primary procedure**

    Created `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/deactivate-work-unit.md`
    and mirrored to `.arc/`. Workflow leads with the design-principle headline
    (*"Deactivation means undo-activation of a work unit that didn't meaningfully
    start."*) and ships Case A end-to-end: PR closure, branch deletion (local +
    remote), then mode-specific cleanup split across three terminal steps.

    **Mode variance (key design decision):** Case A's reversion semantics differ
    by `pm.mode`. Under `arc-in-git`, branch deletion auto-reverts the `backlog/` →
    `active/` moves and discards status file / PROJECT-STATUS / ROADMAP updates —
    Step 4 is verification only. Under `external` and `none`, activation never moved
    artifacts (no `backlog/` directory), so main retains them in `active/` after
    branch deletion; Steps 5 and 6 handle explicit deletion with mode-appropriate
    guidance — `external` treats local copies as tracker-cached scaffold (delete +
    tracker state flip), `none` treats them as the only copies (delete, with
    optional preserve-outside-`.arc/` note acknowledging `none` does not track
    dormant plans). Rejected the "leave dormant in `active/`" option as semantically
    incoherent (`active/` should mean in-flight) and Case B-adjacent.

    **Structural content:** 4-cell Case Matrix near the top for reader context;
    Prerequisites, Mode Detection, Steps, Checklist Summary, Postconditions, and
    Next Step block follow the `activate-work-unit.md` shape. Incidental-WU pointer
    added under Purpose (deactivating an incidental requires resuming the paused
    parent via `manage-incidental-work.md`). Context footer for external/none
    deletion commits uses `tasks-{name}.md (deactivation)` following the
    lifecycle-phase pattern (`activation` / `archival`).

    **Scope boundary:** Task 4.1 ships Case A only — the "When NOT to Deactivate"
    section with Case B/C/D routing lands in Task 4.2.

    **Sync:** Framework file — edited package source first, then mirrored to `.arc/`
    (byte-identical, confirmed via `diff -q`). Tier 1 lint clean on `.arc/` copy
    (package source is excluded from project lint scope by design).

- [x] **4.2 Routing pointers for Cases B / C / D**

    Added `## When NOT to Deactivate` section between the Case A procedure and the
    Checklist Summary, with three `### Case X` subsections. Each opens with a
    one-sentence **Why this isn't deactivation** rationale, per the task spec.

    **Case B** routes to future `arc-shift` pause with a status callout noting that
    `arc-shift` is unimplemented (plan-arc-modes); until then, completion via
    `integrate-work-unit.md` or abandonment via `clean-work-unit.md` is
    recommended over manual parking.

    **Case C** is treated as a noted edge case with a concrete 3-step procedure
    (new branch from main; reverse activation's `git mv` / `git rm` / PROJECT-STATUS
    / ROADMAP changes; deactivation PR). Explicitly notes "no separate workflow
    ships for Case C — use this section as the reference" per task spec.

    **Case D** routes to `integrate-work-unit.md` (complete and ship) or
    `clean-work-unit.md` (archive with abandoned status), with bulleted pointers.

    **Sync:** Package source edited first, mirrored to `.arc/` (byte-identical).
    Tier 1 lint clean on `.arc/` copy.

- [x] **4.3 Register new workflow in indexes**

    **README scan:** No `README.md` exists in `work-unit-lifecycle/`, `workflows/arc/`,
    or `workflows/`. `.arc/system/README.md` describes `workflows/` at a directory
    level without enumerating files. No README updates needed.

    **Manifest entry:** Added
    `system/workflows/arc/work-unit-lifecycle/deactivate-work-unit.md` to
    `.arc/system/.internal/manifest.json` in alphabetical position (between
    `clean-work-unit.md` and `integrate-work-unit.md`) with
    `classification: "Framework"`, `layer: "core"`,
    `pristine_hash: 0ee60e33…` (sha256 of current file contents). JSON validated
    via `python3 -c "import json; json.load(...)"`. This enables the
    pre-commit package-sync warning and the `framework-sync.test.ts` drift check
    for this file.

    **pristine.json deliberately NOT updated.** pristine.json is a
    content-addressable store populated by `arc init` / `arc update` at
    install/update time (see `packages/arc-framework/src/commands/init.ts` L184,
    `update.ts` L248). No test enforces manifest ⇔ pristine key equality; the
    self-hosted sync discipline here maintains manifest.json manually at
    structural edit points (new files, classification changes) while pristine.json
    catches up on the next `arc update` self-test against a new framework
    version. Manual JSON-string embedding of a 172-line markdown file into a
    122K-token JSON was judged error-prone for zero current benefit.

    **Cross-reference:** Added a `## Related Workflows` section to
    `activate-work-unit.md` (above the reference links) with a one-line pointer to
    `deactivate-work-unit.md`. The deactivate workflow already back-references
    activate via `[activate]` in its Mode Detection block; this completes the
    bidirectional link. Added `[deactivate]` reference-link entry in alphabetical
    position among existing refs.

    **Sync:** `activate-work-unit.md` edited in package source first, then
    mirrored to `.arc/` (byte-identical). Manifest is project-instance-only (no
    package counterpart). Tier 1 lint clean on `activate-work-unit.md` `.arc/`
    copy.

- [x] **4.4 Phase 4 Tier 2 quality gates**
    - [x] 4.4.a `npm run -s lint:md` — 179 files, 0 errors
    - [x] 4.4.b Internal link checking — manual verification (no dedicated link
          checker in CI; markdownlint catches reference-definition issues but
          not path resolution). Outbound refs from `deactivate-work-unit.md`
          (5 reference links) all resolve:
          `activate-work-unit.md`, `../../../arc-config.yml`,
          `clean-work-unit.md`, `../supplemental/manage-incidental-work.md`,
          `integrate-work-unit.md`. Outbound ref from `activate-work-unit.md`'s
          new `[deactivate]` resolves to sibling file. Inbound refs:
          `manage-incidental-work.md` already contains an anticipatory
          `[deactivate-work-unit.md](../work-unit-lifecycle/deactivate-work-unit.md)`
          link at § "Abandonment — incidental deactivates without work executed"
          (lines 199, 203) — previously a dangling link, now resolves.
    - [x] 4.4.c Package-project sync verification — `framework-sync.test.ts`
          passed (103 integration tests, 0 failures). The new manifest entry
          for `deactivate-work-unit.md` was recognized and the package source
          ↔ `.arc/` mirror was verified byte-identical. `activate-work-unit.md`
          sync also verified (edited package-first, mirrored to `.arc/`).

### **Phase 5:** Plan-\* Doc Updates

**Purpose:** Queued WUs' planning documents reflect the new model before they progress
toward PRD/execution. `plan-arc-modes.md` receives substantive cross-reference work;
the other two get header-level notes only.

**Strategies:** `notes-work-status-restructure.md` § Harmony with shift lifecycle (source
for Task 5.4 subsection).

- [x] **5.1 `plan-arc-modes.md` — Finding #4 carve-out update**

    Replaced the "Following Task List field removed from both modes" rationale block
    (within § Lite Session Management > WORK-STATUS field set) with a carve-out
    callout pointing to `prd-work-status-restructure.md` as the current source of
    truth, plus a forward-looking prohibition blockquote ("The `Following Task List`
    field is removed … Future edits to status file templates or field sets must not
    re-introduce it."). Added `[restructure-prd]` reference link at file-end. The
    carve-out preserves the FTL-redundancy framing in one sentence while redirecting
    readers to the restructure WU for the full analysis, scope, and live-migration
    plan. Historical reasoning in the Finding #4 narrative above and below stays
    intact per the scope guard.

- [x] **5.2 `plan-arc-modes.md` — shift-lifecycle vocabulary swap**

    Swept the § Shift Lifecycle section (§ State Lives in Task List Headers through
    § Integration Interaction with Shift States) replacing task-list-host
    `**Status:**` references with status-file-host `**State:**`. Shift vocabulary
    (`Paused (date) — reason`, `Waiting-For {category} (date) — reason`, `In Progress`,
    `Complete`) preserved verbatim. Touched: Pure Option C body code blocks and
    supporting prose (Valid values wording, Scenario 5/8/9 host references), Header
    format code block, Scope bullet host-field names (PRD `**Status:**` header vs.
    status file `**State:**` field), workflow Step 3, resume-side pause-timestamp
    source, session-init drift-detection language, integrate acceptance-matrix
    language, Step 1 imperative line. PRD `**Status:**` header references kept
    verbatim where the host is actually a PRD (unchanged per restructure Non-Goals).
    Section heading § State Lives in Task List Headers (Pure Option C) preserved
    verbatim — anchor preserves historical decision label; 5.4's Alignment subsection
    carries the re-validation under the new substrate.

- [x] **5.3 `plan-arc-modes.md` — forward-looking language alignment**

    Updated the enumerated forward-looking WORK-STATUS statements. Pure Option C
    supplementary block (old L4016/L4019) rewritten as "Branch-local WU pointer is
    per-WU, single-slot" — describes per-WU status file substrate, preserves
    Clarification #2's branch-local WU pointer semantic, notes pre-restructure
    singular-file precedent as the retired form. Scenario 7 (old L4049) rewrite:
    two status file `**State:**` writes, no separate per-branch registry pointer,
    atomicity local to two writes (down from three). "What this decision removes"
    bullet (old L4062): "Template redesign for WORK-STATUS.md (unchanged from today)"
    → "Multi-WU registry template (none needed — the per-WU status file is single-slot
    by construction)", and "Cross-file atomicity between registry and task list
    headers" → "between registry and per-WU state". Lite+Local walkthrough (old
    L4662): `active/WORK-STATUS.md` → `active/status.md` per PRD Technical
    Considerations. Finding #4 / Lite session management narrative (~2093–3102)
    untouched per scope guard — historical reasoning stays.

- [x] **5.4 `plan-arc-modes.md` — new "Alignment with Work-Status Restructure WU" subsection**

    Inserted new `### Alignment with Work-Status Restructure WU` subsection at the end
    of § Shift Lifecycle (after § Out of Scope, before the `---` separator). Documents
    the substrate change (task list header → status file `**State:**`), Pure Option C
    re-validation (all concerns still satisfied — no registry, no cache, no session-init
    multi-WU noise; status file is per-WU single-slot, not cross-WU registry),
    metadata-in-place harmony (status file and task list co-located in
    `active/{category}/`, travel together under full protection), ownership of
    terminal transition unchanged (`integrate-work-unit.md` via `clean-work-unit.md`
    Mode 2 still writes Complete; `/arc-shift` still never writes Complete),
    vocabulary unchanged (value set preserved verbatim; only host field name
    changed), and scenario battery re-validation (nine scenarios condensed to five
    bullet groups; none break, Scenario 7 simplifies from three writes to two).
    Added scope caveat for § Mid-Session Orientation below: `/arc-status` skill
    references retain pre-restructure WORK-STATUS language because the skill will be
    re-designed in its own PRD at activation time. Added `[restructure-notes]`
    reference link at file-end alongside `[restructure-prd]`.

- [x] **5.5 `plan-post-release-methodology.md` — header-level note**

    Added a blockquote note after the `**Created:**` line (before the `---`
    separator) acknowledging the Work-Status Restructure WU's per-WU status file
    model. Inline link to `prd-work-status-restructure.md`. Notes that WORK-STATUS
    references in plan items should be read as "the active WU's status file" and
    that specific references will be updated when items promote to PRDs. No
    substantive content change to the plan items.

- [x] **5.6 `plan-expanded-planning-path.md` — header-level note**

    Added a blockquote note after the `**Origin:**` paragraph (before the `---`
    separator) acknowledging the restructure WU. Inline link to
    `prd-work-status-restructure.md`. Notes that the § 12 "Existing session
    pointers" detection-order logic is unchanged and the `WORK-STATUS.md` mention
    should be read as "the active WU's status file Next Action" under the new
    model.

- [x] **5.7 Phase 5 Tier 2 quality gates**
    - [x] 5.7.a `npm run -s lint:md` — full-repo pass green (179 files, 0 errors)
    - [x] 5.7.b Internal link checking — manually verified:
          - `[restructure-prd]` → `../../active/technical/prd-work-status-restructure.md` ✓
          - `[restructure-notes]` → `../../active/technical/notes-work-status-restructure.md` ✓
          - Inline links in `plan-post-release-methodology.md` and
            `plan-expanded-planning-path.md` resolve to the same PRD ✓
          - Intra-file anchor `#alignment-with-work-status-restructure-wu` (L4018 ref)
            matches the inserted `### Alignment with Work-Status Restructure WU`
            heading (L4400) ✓
          - No package-project sync required — all three edited plan docs are
            project-owned backlog files (no package counterparts per
            `strategy-package-project-sync.md`)

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

- [ ] **6.5 Contributor personal status file — rename `WORK-STATUS.md` → `status-contributor.md`**

    **Goal:** Retire the last `WORK-STATUS.md` filename in the repo. The contributor's
    optional personal planning state lives at `user/{identity}/WORK-STATUS.md` under the
    old naming convention; rename to `status-contributor.md` to align with the
    `status-{scope}.md` sibling family established in this WU (per PRD R19). Separate
    concept from the project-level file (different directory, different role) — not a
    fundamental change, just a name that fits the new taxonomy.

    **Naming rationale:** `status-contributor.md` rather than `status-contribution.md`
    — the file holds ongoing personal planning state, not a single contribution in
    flight. Aligns 1:1 with the `arc.role = contributor` config string. No filename
    collision with Lite mode's `active/status.md` — different path root.

    **Files to edit:**

    - `packages/arc-framework/arc/system/agent/AGENT-BRIEFING.CONTRIBUTOR.md` — rename
      all `user/{identity}/WORK-STATUS.md` references to
      `user/{identity}/status-contributor.md` (~9 references: prose, file list,
      directory tree, handoff instructions); update descriptive prose that mentions
      the old name (`your personal WORK-STATUS.md` → `your personal status-contributor.md`)
    - `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/
      session-init.template.md` — contributor session path (currently line ~178):
      update the `user/{identity}/WORK-STATUS.md` check reference
    - Sync both to `.arc/` counterparts
    - `.arc/reference/adr/adr-014-support-contributor-role-for-open-source.md` — Tier
      3 correction to the one-line reference (around line 110) updating the
      implementation-detail filename. ADR decision unchanged; this is a
      post-amendment text fix per `strategy-adr-methodology.md` § Three-tier model.
      ADR is `.arc/`-only (no package counterpart) per Phase 1's Task 1.1 precedent

    **Scope guard:** Analysis files in `.arc/reference/analysis/` and archive files
    in `.arc/reference/archive/` are NOT edited — historical record with original
    filename is correct for those surfaces. Phase 6 grep sweep (Task 6.6 below)
    accounts for legitimate historical references via its "evaluate and fix" rule.

    **Live contributor files:** No contributor `WORK-STATUS.md` exists in this repo's
    `user/andrew/` (the primary identity is maintainer, not contributor). If any exist
    on another clone, `arc join --reconfigure` does not rename in place — callers
    maintaining one are advised via commit message to rename manually.

    Sync to `.arc/` counterpart.

- [ ] **6.6 Grep sweep — catch any remaining references**
    - [ ] 6.6.a Grep `.arc/` for `WORK-STATUS.md` — expect zero hits after Phases 1–5
          and Task 6.5 (analysis/archive files excluded)
    - [ ] 6.6.b Grep `packages/arc-framework/arc/` for `WORK-STATUS.md` — expect zero
          hits
    - [ ] 6.6.c Grep both trees for `active/WORK-STATUS` — expect zero hits
    - [ ] 6.6.d Grep both trees for `user/{identity}/WORK-STATUS` — expect zero hits
          after Task 6.5
    - [ ] 6.6.e Any hits found: evaluate and fix (may be legitimate historical
          references in ADRs or archive; otherwise update)
    - [ ] 6.6.f Grep both trees for `Following Task List` — expect zero hits
          post-R17. FTL field was removed; any residual references (e.g., the
          State-Conditional Promotion table in `strategy-session-operations.md`
          carrying `Following Task List: Yes + Next Task populated` as a load
          signal) must be retired. Framework-tree residuals require dual-copy
          sync.

- [ ] **6.7 Phase 6 Tier 2 quality gates**
    - [ ] 6.7.a Run `npm run -s lint:md`
    - [ ] 6.7.b Package-project sync verification

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
