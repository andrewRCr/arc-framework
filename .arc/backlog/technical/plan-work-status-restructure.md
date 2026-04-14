# Plan: Work-Status Restructure

**Type:** Technical
**Created:** 2026-04-14
**Status:** Formalization-ready — iterated through all open questions in 2026-04-14 follow-up
session. Suitable input for `1_create-prd.md`.

---

## Problem

The current WORK-STATUS.md model is a singular tracked file at a fixed path
(`.arc/active/WORK-STATUS.md`), mutated by whoever touches the active work unit. This
model is structurally unsound in two ways that no workflow-level patch can fix:

### 1. Concurrency flaw at parallel-WU integration (team mode)

Two developers running independent work units in parallel both mutate the same tracked
path on their respective branches. On integration, main receives two diverging versions
of the same file whose content describes *different* work units — there is no correct
merge. Example:

- WU-A on `feature/a`, WU-B on `feature/b`, both branched from main at T0
- Each branch updates its own WORK-STATUS through normal work (different task lists,
  different Next Task fields, different blockers)
- T3: WU-A integrates → main's WORK-STATUS reflects WU-A's end state
- T4: WU-B integrates → **merge conflict on WORK-STATUS**, because both branches
  independently mutated the same tracked path
- Resolution is lossy: theirs/ours picks one side, neither is semantically correct

Archive-timing tricks (reset content between integrations) delay the collision but don't
remove it — the underlying model assumes one WU at a time.

### 2. Staleness on base branch under `branch.protection: full`

Under full protection, the base branch cannot be edited directly. This creates
impossible-to-follow workflow guidance at lifecycle seams:

- `session-handoff.md` says "commit WORK-STATUS update" unconditionally, but on the base
  branch under full protection, this can't happen — the instruction is a dead-end
- `integrate-planning-branch.md` § Step 5 acknowledges WORK-STATUS goes stale after
  planning-branch merges, with the expectation that the next `activate-work-unit` call
  absorbs the update. But when the next step is another planning cycle (not activation),
  the "absorb" mechanism doesn't fire, and WORK-STATUS stays stale through the entire
  new planning cycle
- `rotate-branch.md` § Scenarios documents phased delivery but doesn't name the
  split-session sub-pattern when an intermediate external action (npm publish, GitHub
  repo rename, smoke test) splits a rotation across sessions

Current ATOMIC-INBOX items #1, #2, #3 track these as methodology gaps. They are
**symptoms**, not the root cause. The root cause is the singular-file design.

## Historical context

An explore-agent search of ADRs, strategies, and git history surfaced the following:

- **ADR-007 (session state portability and team transfer, Feb 2026)** is the most
  directly overlapping decision. It established WORK-STATUS as branch-scoped (singular,
  tracked) with the constraint "session state identity is per-developer, not per-branch
  or per-work-unit." This constraint was about *who owns the context* (per-developer
  session notes, portable via git notes), NOT about how the project pointer scopes.
- **No ADR, strategy, or design note explicitly considered per-WU or per-branch
  alternatives** for WORK-STATUS. The singular pattern was assumed from the start.
- **Team concurrency was considered** in `strategy-team-coordination.md` § Concurrent
  Sessions, but only as "concurrent sessions on the same branch" with a last-committer-
  wins mitigation. This addresses the wrong scenario: the parallel-branch parallel-WU
  case is never named.
- **Two distinct concepts were conflated**: *personal session context* (correctly
  per-developer via SESSION-NOTES and git notes) vs *project state pointer* (incorrectly
  frozen at singular branch scope instead of per-WU scope).

**Read:** Not a deliberate rejection of alternatives — a design oversight shaped by
solo-dev experience, where the singular pattern is indistinguishable from correct. The
team-concurrency doc addressed the wrong scenario and created an illusion that
concurrency was handled. The gap passed conceptual muster multiple times because the
framing "WORK-STATUS is branch-scoped" sounded like "scales with branches" when it
actually meant "fits on one branch at a time."

ADR-007 needs amendment (refinement, not supersession): personal session context stays
per-developer via git notes; project pointer splits out to per-WU files.

## Proposed solution

Move WORK-STATUS from a singular tracked path to a WU-scoped artifact co-located with
the WU's other files.

**Path:** `.arc/active/{category}/status-{name}.md`

**Naming rationale:** Single-word prefix aligns with existing convention
(`prd-`, `tasks-`, `notes-`, `atomic-`). Collision with the `arc-status` skill is
nominal only — different namespace (skill/command name vs file prefix), same precedent
as `tasks-*.md` not colliding with the `arc-task-audit` skill. Directory context
(sibling files in the WU's active directory) makes `status-arcd-rebrand.md` unambiguous.

**Status vs. State — semantic split:** The file is named `status-*.md` because
"status" captures the broad concern — "how is this WU doing?" — which encompasses
both the lifecycle enum and the pointer data (branch, task, blockers, next action).
The lifecycle enum itself lives in a field named `**State:**` inside the file,
carrying values like `In Progress` / `Paused (date) — reason` / `Waiting-For {cat}` /
`Complete`. The file is about status (broad); the field is state (specific enum).

This split avoids three different collisions:

1. **With the `arc-status` skill** — skill reads the file; file name reflects its role
2. **With PRD document headers** — PRDs use `**Status:** Draft|Approved|Superseded` for
   document lifecycle. WU lifecycle uses a different word (`State:`) in a different
   document, preventing "same word, two concepts" muddle
3. **With task list headers** — task lists currently carry a `**Status:** In Progress`
   header for WU lifecycle. Under this restructure, that header is removed entirely
   (see § Task list cleanup below) and WU lifecycle relocates to the status file's
   `State:` field, which is its natural home

**File set per WU** (maximum 5, graduated by scope):

| File               | Status         | Purpose                  |
|--------------------|----------------|--------------------------|
| `prd-{name}.md`    | Required       | Spec                     |
| `tasks-{name}.md`  | Required       | Execution plan           |
| `status-{name}.md` | Required (new) | Branch-local pointer     |
| `notes-{name}.md`  | Optional       | Scratchpad               |
| `atomic-{name}.md` | Optional       | Deferred capture surface |

### Lifecycle

- **Created**: by `activate-work-unit.md` Step 5 (on the implementation branch)
- **Updated**: unchanged from today — commit time (alongside task list changes) and
  session handoff (fallback)
- **Deleted**: by `archive-work-unit.md` (not reset — deletion)
- **Travels across rotating branches**: the file is a single WU artifact, carries a
  "Current Branch" field, follows the task list through rotations
- **Never exists on main between WUs**: no stale pointer, no dead-end workflow

### Session-init discovery

**Full mode** (scan `.arc/active/**/status-*.md`):

- **Zero files**: "no active work" → consult ROADMAP for next queued item
- **One file**: load it directly
- **Many files**: apply disambiguation precedence below

**Lite mode**: read the fixed path `.arc/active/status.md` if exists; otherwise "no
active work." No scan, no precedence.

**Disambiguation precedence (Full, many-file case):**

1. **SESSION-NOTES `**Working On:**` field** (primary) — per-user, per-session intent
   signal written at handoff. If SESSION-NOTES exists and the named file still exists,
   load it. If the named file doesn't exist (e.g., archived since handoff), fall
   through with a warning
2. **`Branch:` field match** — filter status files whose `Branch:` value equals the
   current git branch. Exactly one match → load it
3. **`State: In Progress` filter** — rules out delayed-archive stragglers whose
   `State:` is `Complete` but haven't been archived yet
4. **Prompt user to select** — last resort

**Why SESSION-NOTES is the primary signal, despite being the lowest-trust source in
the conflict-resolution hierarchy:** trust hierarchy ranks sources for **conflict
resolution** ("when two sources disagree, which one wins"). For **disambiguation**
("which of these candidates is the one I'm working on right now?"), SESSION-NOTES has
the opposite property — it's the most recently written document in the system by
construction (handoff writes it at T=N, init reads it at T=N+1), and it explicitly
captures the developer's current-session intent. It's the single surface in ARC that
answers "which WU are you on?" without requiring cross-referencing tracked state.

Trust hierarchy still applies on conflict: if SESSION-NOTES says `Working On: X` but
tracked state unambiguously shows `Y`, proceed with `Y` and report the discrepancy per
session-init § 7 protocol.

### Field set

Shape of `status-{name}.md` (Full) / `status.md` (Lite):

```markdown
# Work Unit Status: {name}

**State:** In Progress
**Branch:** {current-branch}
**Task List:** tasks-{name}.md
**Next Task:** {triple-anchor}
**Last Completed:** {summary}
**Blockers:** {list or [none]}
**Next Action:** {description}
```

Seven fields + title. Three categories:

1. **`State`** — WU lifecycle enum. Values: `In Progress` / `Paused (date) — reason` /
   `Waiting-For {category} (date) — reason` / `Complete`. Relocated from the task list
   `**Status:**` header per plan-arc-modes' shift-lifecycle alignment (see § Harmony
   with shift lifecycle).
2. **`Branch`** — current branch. Supports rotating/sub-branch scenarios; used by
   session-init discovery precedence as a fallback signal.
3. **Pointer fields** (`Task List`, `Next Task`, `Last Completed`, `Blockers`,
   `Next Action`) — execution state. Unchanged in role from today's WORK-STATUS.md.
   `Following Task List` removed per plan-arc-modes Finding #4 rationale (redundant with
   Next Task + Next Action pair). `Task List` reference is by filename, not path —
   resolves via directory scan.

### Lite mode variant

Lite mode uses a fixed singular path: `.arc/active/status.md`. Same field set, same
structure. Rationale:

- Lite's scaling axis is solo, single-WU-at-a-time. The parallel-WU concurrency flaw
  that per-WU files fix in Full doesn't exist in Lite, so the singular-file pattern is
  sound — deliberate trade-off, not structural flaw.
- Collision with the `**State:**` field is collision-free in Lite for the same reason
  as Full (different layer of abstraction).
- Mode switch from Lite to Full (via the future mode-switch workflow in plan-arc-modes)
  is a rename: `status.md` → `status-{name}.md`. Trivial.
- Lite defaults to `branch.protection: partial` per its lighter-ceremony philosophy.
  Lite + full protection is an unusual combination; plan-arc-modes' cross-reference
  section will note that Lite's simplification assumes partial protection.

### Conceptual separation across three surfaces

The restructure clarifies a split that the current singular-WORK-STATUS model muddles.
Each surface carries a different kind of state:

| Surface              | Role                 | Scope                                     |
|----------------------|----------------------|-------------------------------------------|
| `status-{name}.md`   | Project pointer      | Per-WU, tracked, shared across developers |
| SESSION-NOTES.md     | Session pointer      | Per-developer, ephemeral, portable        |
| `tasks-{name}.md`    | Execution plan       | Per-WU, tracked, shared                   |

The previous model conflated "project pointer" and "session pointer" into one tracked
singular file. Under this restructure:

- **Project pointer** = `status-{name}.md`. Answers "what's the state of this WU?" —
  any developer on the branch sees the same answer. Branch-scoped, co-located with
  the WU's other files.
- **Session pointer** = SESSION-NOTES `**Working On:**` field. Answers "what's this
  developer currently doing right now?" — personal, cross-WU, written at handoff and
  read at init. Different concern, different layer.
- **Execution plan** = task list. Answers "what are the tasks and which are done?" —
  unchanged in role, but the existing WU-lifecycle `**Status:**` header is removed
  (see § Task list cleanup).

These are three different questions and it is right for them to live in three
different places. The singular-WORK-STATUS model forced the first two into one file,
which is why it required lossy compromises at parallel-WU integration and stale-state
edge cases.

### Task list cleanup

Task lists currently carry a `**Status:** In Progress` header line that tracks WU
lifecycle state. Under this restructure that header is removed:

- WU lifecycle state relocates to `status-{name}.md`'s `**State:**` field (its natural
  home given the semantic split above)
- Task list lifecycle becomes implicit: location-as-state (`backlog/` = planned,
  `active/` = active, `archive/` = complete). No explicit header needed
- Task list templates (package source + existing files) have the header line removed
  as part of this WU's implementation phase

**Interaction with shift lifecycle (plan-arc-modes):** The shift-lifecycle design in
plan-arc-modes currently designates task list headers as the sole source of truth for
shift state (Pure Option C resolution, 2026-04-09). That resolution's actual concerns
(no registry file, no per-dev cache, no session-init multi-WU noise) are all
preserved and arguably strengthened under relocation — see § Harmony with shift
lifecycle below.

### Harmony with shift lifecycle

plan-arc-modes defines a cross-cutting shift lifecycle (pause / resume / rotate) via
the `arc-shift` skill and `shift-work-unit.md` workflow. That design's core premise:
**metadata-in-place, not file relocation**. A paused WU stays where it is; its state
header flips; session-init reads it.

The restructure is strongly aligned with this premise:

- **Per-WU file harmonizes with metadata-in-place.** A paused WU's `status-{name}.md`
  stays in `active/{category}/` alongside its task list. The `State:` field flips to
  `Paused (date) — reason`. No rename, no relocation.
- **Source-of-truth simplifies.** plan-arc-modes originally chose task list headers
  as the sole source of truth *because no per-WU WORK-STATUS file existed* — task list
  headers were the only per-WU surface. The restructure changes that premise by
  introducing `status-{name}.md` as an explicit per-WU surface. Under the new
  premise, the `**State:**` field lives in `status-{name}.md` and the task list
  header is removed. Pure Option C's concerns (no registry, no cache, no session-init
  noise) remain fully satisfied — the status file is per-WU and single-slot, not a
  cross-WU registry, and session-init still reads one file per WU.
- **Ownership of terminal transition unchanged.** `integrate-work-unit.md` via
  `clean-work-unit.md` still owns the `State: Complete` write, it just writes to the
  status file instead of the task list header. `arc-shift` still never writes
  `State: Complete` — mid-flight transitions only.
- **Vocabulary unchanged.** plan-arc-modes' shift vocabulary (`Paused (date) — reason`,
  `Waiting-For {category} (date) — reason`) is preserved verbatim — only the host
  field changes from task list `**Status:**` header to status file `**State:**` field.
  Mechanical find-and-replace in plan-arc-modes' shift-lifecycle section during this
  WU's implementation.
- **Scenario battery re-validation.** plan-arc-modes' 9-scenario battery was
  evaluated under task-list-header-as-home. Under status-file-as-home, each scenario's
  answer stays identical or simplifies — status files are per-WU, tracked, travel
  with branches (Scenarios 3/4/5), disambiguated by current branch field (Scenario 1),
  pause-timestamp read natively from `State:` field (Scenario 8). Full re-validation
  walk deferred to PRD drafting; no case identified in this session's analysis that
  breaks.

### Deactivation reshape under arc-shift alignment

The original deactivation protocol sketch (see § Deactivation protocol sketch below)
predated the arc-shift analysis. Under alignment with plan-arc-modes:

- **Case B** (some work, not merged) — originally sketched as "preserve via rename to
  `archive/{category}/{name}-parked-YYYY-MM-DD`". This is **file relocation**, which
  contradicts arc-shift's metadata-in-place design. Reframe: Case B is not
  deactivation at all — it is `arc-shift` pause territory (future workflow). A WU with
  partial work that the developer wants to park stays in place, its `State:` field
  flips to `Paused`, and `arc-shift` handles resume.
- **Case A** (no work, not merged) — remains the only genuine deactivation case. The
  WU never entered the shift lifecycle; there is nothing to preserve and no meaningful
  history to pause. Activation-undo is the correct operation.
- **Case C** (merged, no work) — rare edge case. Retained as noted in the sketch.
- **Case D** (merged, some work) — strengthened framing: "this is either integrate-to-
  Complete or `clean-work-unit.md` archive-with-abandoned-status. Not deactivation."

Updated design principle: **deactivation means "undo activation of a WU that didn't
meaningfully start."** If work has happened, the correct operation is pause
(`arc-shift`), completion (`integrate-work-unit`), or abandonment (`clean-work-unit`) —
not deactivation. The `deactivate-work-unit.md` workflow this WU ships covers Case A
primarily, with explicit routing pointers for B/C/D.

## What this fixes (resolved by design)

- **Parallel-WU merge conflicts** at integration → gone (different files, no shared
  mutation)
- **WORK-STATUS staleness on main under full protection** → gone (file never exists
  there between WUs)
- **`session-handoff.md` dead-end on main under full protection** → gone (nothing to
  commit)
- **`integrate-planning-branch.md` § Step 5 planning-cycle chain confusion** → gone
  (WORK-STATUS isn't part of planning)
- **`rotate-branch.md` session-boundary sub-pattern gap** → gone (per-WU file travels
  through rotations via normal merge flow; no shared-path concurrency)
- **Archive content conflicts** → gone (archive deletes a file; no content merge)
- **ATOMIC-INBOX items #1, #2, #3** → all collapse to "resolved-by-design." Remove from
  inbox as part of this WU's integration.

## Alternatives considered

### A. Keep singular, add auto-reset on merge/archive

Half-fix. Addresses staleness but not concurrency. Parallel-WU merge conflict remains.
**Rejected.**

### B. Per-developer work-status in `user/{identity}/`

Conflates with SESSION-NOTES's role (personal context). Loses the "shared read" property
(anyone on the branch sees the same state). **Rejected.**

### C. Eliminate WORK-STATUS entirely, rely on task list

Task list doesn't carry branch, blockers, or next-action. Loses explicit state that
session-init depends on for orientation. **Rejected.**

### D. Per-branch file (not per-WU)

Handles team sub-branches at file level. Complicates naming (branch-slug is ugly),
introduces discovery cases we don't need for the common path. Team sub-branches within
one WU are a legitimate coordination concern, not a structural flaw — the within-WU
shared state represents real coordination that devs need to resolve manually anyway.
**Rejected** in favor of per-WU with a "Current Branch" field.

### E. Inserted Phase 0 in the rebrand WU

Fold this restructure into the ARCd Rebrand WU as a Phase 0. Thematically pollutes the
rebrand WU (two independent structural themes in one PR chain). Doesn't give the
restructure proper planning treatment (PRD, considered alternatives, ADR amendment).
**Rejected.**

### F. Stacked incidental WU under rebrand

Treat as incidental work on a stacked branch off `technical/arcd-rebrand`. Entangles two
independent WUs. Since rebrand hasn't executed any tasks, there's no work on the rebrand
branch to preserve — the stacked-branch justification doesn't apply. **Rejected** in
favor of clean deactivation.

## Stress tests passed

1. Parallel WUs, different devs, independent branches → different files, no conflict ✓
2. One WU, team sub-branches (shared coordination) → single WU file with "Current
   Branch" field; within-WU collisions represent legitimate coordination, not structural
   flaw ✓
3. Rotating branches (rebrand's phased delivery) → sequential, file travels through
   merges ✓
4. Fresh clone mid-WU → session-init scans active/, matches current branch, loads
   correct file ✓
5. Delayed archive (stale file lingers on main) → new WU branch disambiguates via
   branch-match; stale file is noise, not breakage. Integrity check warns on mismatch
   with ROADMAP ✓
6. Planning cycles → no status file exists (no WU yet); SESSION-NOTES + plan/PRD
   existence carries state. Planning-cycle chain confusion resolved ✓
7. Atomic commits to main under partial protection → no status file on main to update,
   no conflict ✓
8. Branch rename/rebase → branch-field goes stale; fallback to "single file in active/"
   still works ✓

No unbroken stress tests surfaced during 2026-04-14 discussion. If review surfaces
additional edge cases, update the stress-test matrix before PRD.

## Scope

### Will do

**Structural change:**

- New path convention: `.arc/active/{category}/status-{name}.md`
- ADR-007 amendment: add a section documenting the refinement — session state identity
  stays per-developer, project pointer splits to per-WU files
- Live migration of current `.arc/active/WORK-STATUS.md` into the new shape (as part of
  the WU's own integration)

**Workflow edits** (both `.arc/` and package-source mirrors):

- `session-init.md` — change loading strategy from fixed path to active/-directory scan;
  handle zero/one/many file cases; implement disambiguation precedence (SESSION-NOTES
  `Working On:` primary → `Branch:` match → `State: In Progress` filter → prompt)
- `session-handoff.md` — remove "commit WORK-STATUS on main" dead-end; update file
  references; add anti-duplication guard for SESSION-NOTES (fold-in, see below);
  **add step to write SESSION-NOTES `**Working On:**` field** at handoff
- `activate-work-unit.md` — Step 5 creates the per-WU status file with `State:
  In Progress`; update Step 8 commit references
- `archive-work-unit.md` — delete the per-WU file (not reset)
- `clean-work-unit.md` — terminal `State: Complete` write relocates from task list
  header to status file field (ownership and behavior unchanged; file target changes)
- `integrate-work-unit.md` — update references and the Rotate → Integrate → Archive
  header
- `integrate-planning-branch.md` — Step 5 becomes trivial (no WORK-STATUS absorb needed)
- `rotate-branch.md` — per-WU file travels through rotations; update examples and
  resolve the session-boundary sub-pattern gap
- `1_create-prd.md`, `2_generate-tasks.md` — update any WORK-STATUS references
- **New workflow**: `deactivate-work-unit.md` — Case A primary (no work, not merged);
  Case C as noted edge case; explicit routing pointers for Case B → future `arc-shift`
  and Case D → integrate/clean-work-unit. Design principle header: "deactivation means
  undo-activation of a WU that didn't meaningfully start." See § Deactivation reshape
  above for full framing.

**Rules and methods:**

- `DEV-RULES.ARC.md` § Session state — update the two-file model description
- `arc-methods.md` § session-state default — update the default's path references and
  field set

**Strategies:**

- `strategy-session-operations.md` — update the WORK-STATUS section
- `strategy-team-coordination.md` § Concurrent Sessions — rewrite to reflect the real
  model (within-WU coordination, not cross-WU concurrency); document the parallel-WU
  handling under the new design

**Agent and project docs:**

- `AGENT-BRIEFING.ARC.md`, `AGENT-BRIEFING.PROJECT.md`, `CLAUDE.ARC.md` — update
  references as needed
- `PROJECT-STATUS.md` — confirm its role as portfolio-level index (unchanged structure;
  just reference updates)

**Template updates:**

- **SESSION-NOTES template** (package source + `.arc/user/{identity}/SESSION-NOTES.md`)
  — add `**Working On:**` field near the top alongside the existing
  `**Commit at Handoff:**` line. Field value shape is deferred to implementation
  (see § Deferred to implementation below) but must be *defined*, not freeform.
- **Task list template** (package source) — remove the `**Status:**` header line. WU
  lifecycle relocates to the status file `**State:**` field per § Task list cleanup.
- **Status file template** (new) — `packages/arc-framework/arc/active/templates/
  status-template.md` or equivalent. 7-field set per § Field set.

**Plan-\* doc updates** (backlog docs that reference WORK-STATUS substantively):

- **`plan-arc-modes.md`** — substantive cross-reference section. Carve out Finding #4
  (FTL removal) → reference this WU as resolution. Update shift-lifecycle vocabulary
  (Status: → State: find-and-replace). Update line 4016's "`WORK-STATUS.md` remains
  branch status, single-slot" to align with per-WU `status-{name}.md` shape. Add
  "Alignment with Work-Status Restructure WU" subsection documenting harmony with
  shift lifecycle (Pure Option C re-validation under new premise).
- **`plan-post-release-methodology.md`** — header-level note only (single reference
  describes hypothetical `arc-plan` skill behavior; aligns naturally with new model).
- **`plan-expanded-planning-path.md`** — header-level note only (single pointer
  reference in existing session-pointer list).
- **`tasks-arcd-rebrand.md`** — edits to WORK-STATUS update subtasks (6 occurrences)
  absorbed during rebrand reactivation, not in this WU's scope. The status file
  becomes `status-arcd-rebrand.md`; field references update accordingly. Called out
  here so the absorption is intentional, not accidental.

**Package-source mirrors:** everything above has a counterpart in
`packages/arc-framework/arc/` that must sync per `strategy-package-project-sync.md`.

**Resolution of captured gaps:**

- ATOMIC-INBOX item #1 (session-handoff.md full-protection gap) → resolved by design
- ATOMIC-INBOX item #2 (integrate-planning-branch.md § Step 5 chain enumeration) →
  resolved by design
- ATOMIC-INBOX item #3 (rotate-branch.md session-boundary sub-pattern) → resolved by
  design
- All three removed from inbox as part of WU integration

### Scope additions (fold-ins)

These are items currently scoped elsewhere that belong in this WU:

1. **`Following Task List` field removal** — currently scoped in `plan-arc-modes.md` as
   Finding #4 / Lite session management resolution (lines 2597–2605). Rationale from
   plan-arc-modes: "The Yes/No flag is redundant with the Next Task + Next Action pair:
   an off-task-list detour is readable from the mismatch between Next Action's subject
   and Next Task's subject; on-task-list preparation is readable from their alignment;
   mid-task resume is readable from Next Action referencing the same task as Next Task."
   Carve this out of plan-arc-modes into this WU during PRD drafting. Update
   plan-arc-modes to reference this WU as the resolution point instead of Finding #4.

2. **Session-handoff anti-duplication guard** — small doc change to `session-handoff.md`
   adding an explicit anti-pattern block: "if it's in a committed file, don't restate it
   here." Session-handoff is already being edited for the structural change; adding this
   guard is trivial incremental scope. Includes a minimum-viable-SESSION-NOTES bullet
   set (things tried that didn't work, decisions not captured in tracked state, observed
   risks, "currently mid-X with concrete next action Y").

3. **SESSION-NOTES `**Working On:**` field** — new structured field on SESSION-NOTES
   template, written at handoff, read at init as the primary disambiguation signal for
   session-init's discovery precedence. Role-agnostic (works in maintainer and
   contributor modes). See § Session-init discovery above for the role; see § Deferred
   to implementation below for the value-shape constraint.

4. **Task list `**Status:**` header removal** — remove the WU-lifecycle status header
   line from task list templates (package source) and existing task lists. Relocation
   to status file `**State:**` field is the home; task list cleanup is the mechanical
   side. Part of § Task list cleanup above.

5. **Plan-\* doc updates** — substantive cross-reference section in
   `plan-arc-modes.md`, header-level notes on `plan-post-release-methodology.md` and
   `plan-expanded-planning-path.md`. See § Will do → Plan-\* doc updates for the
   full scope breakdown. Ensures queued WUs' planning documents reflect the new
   model before they progress toward PRD/execution.

### Won't do

- Changes to the SESSION-NOTES model or location (unchanged — per-developer,
  git-notes portable). Adding a `**Working On:**` field is an *extension*, not a
  change to the model.
- Changes to PROJECT-STATUS.md structure (stays as portfolio-level index)
- Changes to ADR format or template
- Rename of WORK-STATUS-mentioning skills (`arc-resume`, `arc-handoff`)
- Any touch to the rebrand WU's artifacts beyond what's necessary for the restructure to
  land cleanly on main (rebrand reactivates post-restructure)
- Retrofit of git notes-stored state or historical session state

## Dependencies and sequencing

**This WU blocks**: ARCd Rebrand. The rebrand WU's phased-delivery model (five branches
with multiple rotate-branch cycles) exercises the singular-file concurrency flaw during
execution. The rebrand WU was activated this session (2026-04-14) and then cleanly
deactivated when the structural flaw was surfaced, specifically to reorder:

1. ~~Rebrand activation (2026-04-14, commit `9763994` on `technical/arcd-rebrand`)~~ —
   **deactivated**, branch deleted local + remote
2. **Work-Status Restructure WU** (this plan) — runs first
3. **ARCd Rebrand WU** — re-activated from updated main, runs second, serves as first
   real exercise of the per-WU status file across rotating branches

**Upstream dependencies**: None beyond what already lives on main
(`16561a2`, post-PR-#17 merge).

**Downstream dependencies**: All WUs after this land on the new model. Rebrand's
reactivation will use the new pattern naturally — no re-planning required since rebrand
PRD and task list are model-agnostic (they reference WORK-STATUS by role, not by path).
The task list may need minor reference updates during reactivation.

## Deactivation protocol sketch

Post-iteration shape (see § Deactivation reshape under arc-shift alignment above for
full rationale): `deactivate-work-unit.md` covers **Case A as the primary workflow**,
with routing pointers for B/C/D.

|                        | No task work executed                                                                                                                                                             | Some task work executed                                                                                                                                             |
|------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Not merged to main** | **Case A (primary)**: delete branch, git handles revert automatically. Main is already in pre-activation state. Trivial. *This is the only genuine deactivation case.*            | **Case B → future `arc-shift`**: not deactivation. A WU with partial work that the developer wants to park uses metadata-in-place pause (`State:` field flip).      |
| **Merged to main**     | **Case C (noted edge case)**: deactivation PR with inverse changes — move files back to backlog, reset status/roadmap/task-list — under full protection, requires own branch + PR | **Case D → integrate or clean-work-unit**: not deactivation. Either complete-and-integrate the WU, or archive-with-abandoned-status via `clean-work-unit.md`.       |

**Design principle:** deactivation means *undo-activation of a WU that didn't
meaningfully start*. If work has happened, the correct operation is pause
(`arc-shift`), completion (`integrate-work-unit`), or abandonment (`clean-work-unit`) —
not deactivation. The workflow's "when NOT to deactivate" section is as important as
its procedure.

Case A is the only procedure this WU ships in full. Case C is included as a noted
edge case since it's genuinely activation-undo (just with added branch/PR ceremony
under full protection). Cases B and D route to other workflows, with short
explanatory blocks documenting the routing decision.

## Resolved decisions (2026-04-14 iteration)

All open questions from the initial draft resolved in the 2026-04-14 follow-up
session. Summary pointers:

1. **Migration sequencing** → late-phase (Phase 3 of this WU's execution), with
   throwaway early-phase tests only if specific Phase 2 tasks require the new path
   to validate scan behavior. Late-phase keeps the WU on the old path until one
   deliberate cutover, avoiding half-converted-system cognitive load.

2. **ADR-007 amendment format** → Tier 2 Amendment per `strategy-adr-methodology.md`,
   in a new `## Amendments` section at the bottom of ADR-007. No modification to
   Decision / Context / Consequences sections. Mention amendment in commit message.
   Rationale: ADR-007's actual decision was per-developer session state portability,
   not the singular WORK-STATUS pattern (which was a pre-existing assumption carried
   along without examination). Refinement disentangles two conflated concepts
   without contradicting the actual decision. Supersession would be inaccurate.

3. **Team-coordination strategy rewrite** → narrow rewrite (Option A), shipping-clean.
   Two axes addressed explicitly:
   - Parallel work units on independent branches: isolated by per-WU status files —
     no coordination at the status-file layer.
   - Within-work-unit team sub-branches: shared state on one `status-{name}.md`,
     coordinated via `(@name)` markers / last-committer-wins (existing convention,
     now correctly scoped).

   No references to the old singular-file model — strategy docs at `strategies/arc/`
   ship to adopters who see the doc fresh with no "before" to contextualize. Historical
   context lives in the commit message and ADR-007 amendment, not in the strategy doc.

4. **Naming** → settled before session (`status-{name}.md` Full / `status.md` Lite).
   Semantic collision with task list `Status:` header resolved via field-level rename
   (`**State:**` enum field inside `status-*.md`) + task list header removal.

5. **Deactivation workflow priority** → Case A primary + routing pointers. See
   § Deactivation protocol sketch above.

6. **Session-init discovery precedence** → SESSION-NOTES `**Working On:**` field as
   primary signal, `Branch:` field match as fallback, `State: In Progress` filter as
   tiebreaker, prompt as last resort. See § Session-init discovery above.

## Deferred to implementation

Items where the decision direction is clear but the exact shape is best pinned during
implementation, not pre-declared in the PRD. Each item below must be **defined** by
the end of implementation, not left freeform or undocumented.

1. **SESSION-NOTES `**Working On:**` field value format.** Direction: filename when
   applicable (`status-arcd-rebrand.md`), *defined markers* for edge cases (between
   work units, planning cycle in progress, no active work). Constraint: markers must
   be lightweight, consistent, and unambiguous — not freeform prose. Candidate
   marker shapes to decide during implementation:
   - `[none]` — no active work
   - `[planning: {category}/{name}]` — in a planning cycle, no WU yet
   - `[between work units]` — between activation and archive of adjacent WUs
   - `status-{name}.md` — normal case, file reference

   Final decision codified in: (a) `session-handoff.md` write instruction,
   (b) `session-init.md` read/interpret logic, (c) SESSION-NOTES template comment
   block. All three must agree.

2. **Exact ambiguous-discovery prompt format.** When session-init's discovery
   precedence falls through to the prompt step, what does the prompt look like? Does
   it list candidates with one-line summaries? What's the fallback if the user dismisses
   the prompt? Decide during `session-init.md` edit.

3. **ADR-007 amendment prose.** Format settled (Tier 2 Amendment in `## Amendments`
   section); content is drafted during Phase 1 of implementation, not pre-drafted in
   the PRD. PRD captures intent ("amend ADR-007 to clarify the conflation and
   reference the new model"); actual prose is Phase 1 task.

4. **`strategy-team-coordination.md` § Concurrent Sessions rewrite prose.** Same
   pattern as #3 — direction settled (narrow, two-axis, shipping-clean), prose
   drafted during implementation.

5. **Cross-reference section in `plan-arc-modes.md`.** Structure known (harmony
   documentation, Pure Option C re-validation, Finding #4 carve-out reference).
   Prose drafted during implementation.

## Scope estimate

**Medium**. Touches many files but each touch is targeted (path rename, loading
strategy, ADR amendment, template updates). Not a full-content rewrite anywhere.
Mechanical sweep plus four substantive doc additions: `deactivate-work-unit.md`,
ADR-007 amendment, `strategy-team-coordination.md` § Concurrent Sessions rewrite,
`plan-arc-modes.md` cross-reference section.

Estimated phases when task list is generated:

- **Phase 1: Foundation docs** — ADR-007 amendment + strategy updates
  (`strategy-session-operations.md`, `strategy-team-coordination.md`). "What the model
  is" documents land first so subsequent workflow edits can reference them.
- **Phase 2: Core workflow edits** — session-init, session-handoff, activate/archive/
  clean/integrate/rotate/planning-branch, 1_create-prd, 2_generate-tasks. Both `.arc/`
  and package-source mirrors. Templates updated (SESSION-NOTES adds `Working On:`,
  task list removes `Status:` header, status file template added).
- **Phase 3: Live migration** — move `.arc/active/WORK-STATUS.md` to
  `.arc/active/{category}/status-{name}.md` shape on this branch, prove the loading
  strategy works end-to-end. Meta-circular validation step: the WU dogfoods its own
  output at the cutover point.
- **Phase 4: `deactivate-work-unit.md`** — author Case A primary workflow + routing
  pointers for B/C/D. Includes design-principle header.
- **Phase 5: Plan-\* doc updates** — substantive cross-reference section in
  `plan-arc-modes.md` (including Finding #4 carve-out update, shift-lifecycle
  vocabulary find-and-replace, line 4016 alignment); header-level notes on
  `plan-post-release-methodology.md` and `plan-expanded-planning-path.md`.
- **Phase 6: Supporting cleanup** — FTL field removal fold-in, session-handoff
  anti-duplication guard, ATOMIC-INBOX items #1–#3 removal, any remaining
  `AGENT-BRIEFING.*` / `CLAUDE.ARC.md` reference updates.
- **Phase 7: Integration and archival** — pre-merge review, integrate, archive.

Exact phase structure and branch model decided at PRD + task generation time. Single
branch sufficient — no phased delivery needed because there are no external actions,
unlike the rebrand WU. Seven phases on one implementation branch.

---
