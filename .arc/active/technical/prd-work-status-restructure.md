# PRD: Work-Status Restructure

**Type:** Technical
**Updated:** 2026-04-15

---

## Introduction

ARC's current session state model uses a singular tracked file at a fixed path —
`.arc/active/WORK-STATUS.md` — as the project pointer for the active work unit. This
singular-file design is structurally unsound in two ways that no workflow-level patch
can fix:

1. **Parallel-WU concurrency flaw.** In team mode, two developers running independent
   work units on parallel branches both mutate the same tracked path. At integration,
   the base branch receives diverging content that describes *different* work units —
   a lossy merge with no semantically correct resolution.
2. **Staleness under full protection.** Under `branch.protection: full`, the base
   branch can't be edited directly, creating dead-end workflow guidance at lifecycle
   seams — `session-handoff.md` says "commit WORK-STATUS update" but the file on main
   can't be committed to; `integrate-planning-branch.md` § Step 5 leaves stale state
   across chained planning cycles; `rotate-branch.md` doesn't name the session-boundary
   sub-pattern when an external action splits a rotation across sessions.

The root cause is a conflation: **personal session context** (correctly per-developer
via SESSION-NOTES and git notes) and **project state pointer** (incorrectly frozen at
singular branch scope instead of per-WU scope) were treated as one concern. ADR-007
established the correct portability model for the former but carried the singular
pattern for the latter as an unexamined assumption. The gap passed conceptual muster
multiple times because "WORK-STATUS is branch-scoped" sounded like "scales with
branches" when it actually meant "fits on one branch at a time." See
[notes-work-status-restructure.md](notes-work-status-restructure.md) § Historical
context for the full analysis.

**Why now:** This WU blocks the ARCd Rebrand work unit. Rebrand's phased-delivery
model uses five branches with multiple `rotate-branch` cycles — each rotation
exercises the singular-file concurrency flaw during execution. Rebrand was activated
on 2026-04-14 and cleanly deactivated the same session once the structural flaw was
surfaced, specifically to reorder: restructure first, rebrand second. Rebrand will
serve as the first real exercise of the new model across rotating branches.

## Goals

- **Eliminate the parallel-WU concurrency flaw by design** — no shared tracked path,
  no cross-branch mutation of the same file.
- **Eliminate base-branch staleness by design** — the project pointer never exists on
  the base branch between work units, so there is nothing to go stale.
- **Disentangle project pointer from session pointer** — restore the conceptual split
  ADR-007 missed: per-WU tracked state for the project pointer, per-developer
  portable state for the session pointer, distinct concerns in distinct files.
- **Align with arc-shift's metadata-in-place philosophy** — the new model harmonizes
  with the shift lifecycle (pause / resume / rotate) designed in `plan-arc-modes.md`.
- **Unblock the ARCd Rebrand work unit** — rebrand reactivates post-merge with the
  new model and runs naturally across rotating branches.

## Use Cases

System scenarios illustrating the change and its impact. The full stress-test battery
(8 scenarios) lives in [notes-work-status-restructure.md](notes-work-status-restructure.md)
§ Stress-test battery; the canonical cases are:

**Parallel work units, two developers, independent branches.** WU-A on `feature/a`
and WU-B on `feature/b` each have their own `status-{a,b}.md` files in distinct
directories. At integration there is nothing to merge — different files, no shared
mutation. *(Fixes flaw #1.)*

**Rotating branches through phased delivery** (rebrand's execution pattern). The
status file is a single WU artifact that carries a `Branch:` field and travels
through normal merge flow as phases complete. Session-boundary transitions are no
longer a special case. *(Fixes `rotate-branch.md` gap.)*

**Paused work unit under future arc-shift.** A WU being paused stays in place;
its `State:` field flips from `In Progress` to `Paused (date) — reason`. No file
rename, no relocation — exactly aligned with arc-shift's metadata-in-place design.

**Planning cycles.** Between work units (draft plan, draft PRD, task generation),
no status file exists — planning doesn't need one. SESSION-NOTES `**Working On:**`
field + plan/PRD existence carries state. *(Fixes `integrate-planning-branch.md`
Step 5 chain confusion.)*

**Fresh clone mid-WU.** A new machine or agent session runs session-init, which
scans `.arc/active/**/status-*.md`, matches the current branch via the `Branch:`
field, and loads the correct file. No external state required.

## Requirements

### P0 — must-have for work unit completion

**R1. New status file path convention.** Per-work-unit status files live at
`.arc/active/{category}/status-{name}.md` (Full mode). The singular path
`.arc/active/WORK-STATUS.md` is retired.

**R2. Status file field set.** Seven fields + title:

- `**State:**` — WU lifecycle enum (`In Progress` / `Paused (date) — reason` /
  `Waiting-For {category} (date) — reason` / `Complete`)
- `**Branch:**` — current branch (supports rotating/sub-branch scenarios)
- `**Task List:**` — filename reference (not path)
- `**Next Task:**` — triple-anchor format
- `**Last Completed:**` — summary
- `**Blockers:**` — list or `[none]`
- `**Next Action:**` — description

The `Following Task List` field from the previous model is removed (R17, folded in
from `plan-arc-modes.md` Finding #4).

**R3. Status vs. State semantic split.** The file is `status-*.md` (broad concern:
"how is this WU doing?"); the enum field is `**State:**` (specific: lifecycle value).
This split resolves three collisions: with the `arc-status` skill, with PRD document
`Status:` headers, and with the task list `**Status:**` header (R16).

**R4. Session-init discovery strategy.** Full mode: scan `.arc/active/**/status-*.md`
and handle the zero / one / many cases. Zero-file case continues to "no active work →
consult ROADMAP." Many-file disambiguation precedence:

1. SESSION-NOTES `**Working On:**` field (primary, per-session intent signal)
2. `Branch:` field match (current git branch)
3. `State: In Progress` filter (rules out delayed-archive stragglers)
4. Prompt user (last resort)

Lite mode continues to use a fixed singular path: `.arc/active/status.md`.

**R5. Workflow edits.** Update the following workflows — both `.arc/` and
package-source mirrors per `strategy-package-project-sync.md`:

- `session-init.md` — change loading from fixed path to active/-directory scan;
  implement disambiguation precedence
- `session-handoff.md` — remove the "commit WORK-STATUS on main" dead-end; add the
  step to write SESSION-NOTES `**Working On:**` field; add anti-duplication guard
  (R18)
- `activate-work-unit.md` — Step 5 creates the per-WU status file with
  `State: In Progress`; Step 8 commit references updated
- `archive-work-unit.md` — delete the per-WU file (not reset)
- `clean-work-unit.md` — terminal `State: Complete` write relocates from task list
  header to status file `**State:**` field (ownership unchanged; target file changes)
- `integrate-work-unit.md` — update references and the Rotate → Integrate → Archive
  header
- `integrate-planning-branch.md` — Step 5 becomes trivial (no WORK-STATUS absorb)
- `rotate-branch.md` — per-WU file travels through rotations; update examples and
  resolve the session-boundary sub-pattern gap
- `1_create-prd.md`, `2_generate-tasks.md` — update any WORK-STATUS references

**R6. New workflow: `deactivate-work-unit.md`.** Case A primary (no work executed,
not merged — delete branch, trivial); Case C as noted edge case (merged but no work,
rare); routing pointers for Case B → future `arc-shift` pause and Case D →
`integrate-work-unit` or `clean-work-unit`. Design principle header: *deactivation
means undo-activation of a WU that didn't meaningfully start.* See
[notes-work-status-restructure.md](notes-work-status-restructure.md) § Deactivation
reshape for the full case matrix rationale.

**R7. ADR-007 Tier 2 Amendment.** Add a new `## Amendments` section at the bottom of
`adr-007-session-state-portability-and-team-transfer.md` documenting the conflation
refinement: personal session context stays per-developer via git notes (unchanged);
project pointer splits out to per-WU files (new). No modification to the original
Decision / Context / Consequences sections. Amendment follows the Tier 2 convention
in `strategy-adr-methodology.md`.

**R8. Strategy updates:**

- `strategy-session-operations.md` — update the WORK-STATUS section to describe the
  per-WU model
- `strategy-team-coordination.md` § Concurrent Sessions — rewrite to reflect the real
  model (parallel WUs isolated by per-WU files; within-WU team sub-branches as a
  shared-state coordination case). Narrow rewrite, shipping-clean — no references to
  the retired singular-file model

**R9. Rules and methods updates:**

- `DEV-RULES.ARC.md` § Session state — update the two-file model description
- `arc-methods.md` § session-state default — update path references and field set

**R10. Template updates:**

- **Status file template** (new): `packages/arc-framework/arc/active/templates/
  status-template.md` (or equivalent location per package sync convention). Seven
  fields per R2.
- **SESSION-NOTES template** (package source + `.arc/user/{identity}/SESSION-NOTES.md`):
  add `**Working On:**` field near the top alongside the existing
  `**Commit at Handoff:**` line. Value shape is defined (see Q1), not freeform.
- **Task list template** (package source): remove the `**Status:**` header line.
  WU lifecycle relocates to the status file `**State:**` field (R16).

**R11. Plan-\* doc updates** (backlog docs that reference WORK-STATUS substantively):

- **`plan-arc-modes.md`** — substantive cross-reference section. Carve out Finding #4
  (FTL field removal) to reference this WU as the resolution point. Update
  shift-lifecycle vocabulary (`Status:` → `State:` find-and-replace). Update line
  4016's "WORK-STATUS.md remains branch status, single-slot" language to align with
  the per-WU `status-{name}.md` shape. Add an "Alignment with Work-Status Restructure
  WU" subsection documenting harmony with the shift lifecycle (Pure Option C
  re-validation under the new premise).
- **`plan-post-release-methodology.md`** — header-level note only (single reference
  to hypothetical `arc-plan` skill behavior aligns naturally with the new model).
- **`plan-expanded-planning-path.md`** — header-level note only (single pointer
  reference in existing session-pointer list).
- **`tasks-arcd-rebrand.md`** — edits absorbed during rebrand reactivation, *not* in
  this WU's scope. Called out so the absorption is intentional.

**R12. Live migration.** Migrate the current `.arc/active/WORK-STATUS.md` into the
new shape on this WU's implementation branch as part of Phase 3. The WU dogfoods its
own output at the cutover point — meta-circular validation that the loading strategy
works end-to-end before the change reaches main.

**R13. Package-source mirrors synced.** Every `.arc/` edit in this WU has a
counterpart in `packages/arc-framework/arc/` per `strategy-package-project-sync.md`.
Two-copy discipline is non-negotiable for framework files.

**R14. ATOMIC-INBOX cleanup.** Items #1, #2, #3 (session-handoff full-protection
gap; integrate-planning-branch Step 5 chain enumeration; rotate-branch session-
boundary sub-pattern) all collapse to resolved-by-design. Remove from inbox at this
WU's integration.

**R15. Agent and project doc references.** `AGENT-BRIEFING.ARC.md`,
`AGENT-BRIEFING.PROJECT.md`, `CLAUDE.ARC.md` — update WORK-STATUS references as
needed. `PROJECT-STATUS.md` role unchanged (portfolio-level index) — reference
updates only.

**R16. Task list `**Status:**` header removal.** Remove the WU-lifecycle status
header line from task list templates (package source) and all existing task lists.
Lifecycle relocates to the status file `**State:**` field. Task list lifecycle
becomes implicit: location-as-state (`backlog/` = planned, `active/` = active,
`archive/` = complete).

### P1 — fold-ins from adjacent concerns

**R17. `Following Task List` field removal.** Currently scoped in `plan-arc-modes.md`
as Finding #4. Rationale: the Yes/No flag is redundant with the Next Task + Next
Action pair — an off-task-list detour is readable from the mismatch between Next
Action's subject and Next Task's subject; on-task-list preparation is readable from
their alignment; mid-task resume is readable from Next Action referencing the same
task as Next Task. Carve out of plan-arc-modes into this WU; update plan-arc-modes
to reference this WU as the resolution point instead of Finding #4.

**R18. session-handoff anti-duplication guard.** Add an explicit anti-pattern block
to `session-handoff.md`: "if it's in a committed file, don't restate it here."
Include a minimum-viable-SESSION-NOTES bullet set (things tried that didn't work,
decisions not captured in tracked state, observed risks, "currently mid-X with
concrete next action Y"). Trivial incremental scope since `session-handoff.md` is
already being edited for the structural change.

## Non-Goals

- **No changes to the SESSION-NOTES model or location.** Per-developer, gitignored,
  git-notes portable — unchanged. Adding a `**Working On:**` field is an *extension*,
  not a change to the model.
- **No changes to `PROJECT-STATUS.md` structure.** Stays as portfolio-level index.
  Reference updates only.
- **No changes to ADR format or template.** Tier 2 Amendment uses the existing
  convention documented in `strategy-adr-methodology.md`.
- **No skill renames.** `arc-resume` and `arc-handoff` keep their names regardless
  of file path changes.
- **No touch to the rebrand WU's artifacts beyond minimum reference updates.**
  Rebrand reactivates post-restructure; status file becomes `status-arcd-rebrand.md`
  naturally; task list reference edits absorbed at reactivation, not in this WU.
- **No retrofit of git notes-stored state or historical session state.** The new
  model applies going forward.

## Technical Considerations

**Full vs. Lite mode variance.** Full scans `.arc/active/**/status-*.md` with
disambiguation precedence; Lite uses the fixed path `.arc/active/status.md`. Lite's
singular-file pattern is a deliberate trade-off — Lite assumes solo, single-WU-at-
a-time work where the parallel-WU flaw doesn't exist. Mode switch Lite→Full is a
rename: `status.md` → `status-{name}.md`. Plan-arc-modes' mode-switch workflow
handles this when that work lands; this WU ships both shapes.

**Harmony with plan-arc-modes shift lifecycle.** The shift lifecycle's core
premise — *metadata-in-place, not file relocation* — is strongly reinforced by the
per-WU status file pattern. A paused WU's status file stays in `active/{category}/`
alongside its task list; only the `**State:**` field flips. plan-arc-modes' Pure
Option C resolution (2026-04-09, task list headers as sole source of truth) was
chosen because no per-WU WORK-STATUS surface existed. The new model changes that
premise without breaking Pure Option C's concerns (no registry, no per-dev cache,
no session-init multi-WU noise) — the status file is per-WU and single-slot, not a
cross-WU registry, and session-init still reads one file per WU. Full harmony walk
in [notes-work-status-restructure.md](notes-work-status-restructure.md) § Harmony
with shift lifecycle.

**Ownership of terminal transition unchanged.** `integrate-work-unit.md` via
`clean-work-unit.md` still owns the `State: Complete` write — the target file
changes from task list header to status file field, but the workflow ownership and
behavior are unchanged. `arc-shift` (future) still never writes `State: Complete` —
mid-flight transitions only.

**Meta-circular validation (Phase 3).** Live migration happens on this WU's own
implementation branch as a deliberate cutover point. The WU's in-flight state
itself becomes the first instance of the new model, validating the loading strategy
end-to-end before the change reaches main.

**Dependencies and sequencing:**

- **Blocks**: ARCd Rebrand WU (phased-delivery model exercises the singular-file
  flaw during execution).
- **Upstream**: None beyond what already lives on main (`16561a2`, post-PR-#17 merge).
- **Downstream**: All WUs after this land on the new model. Rebrand's reactivation
  will use the new pattern naturally — rebrand PRD and task list reference
  WORK-STATUS by role, not by path, so reactivation only requires minor reference
  updates in the task list.

**Branch model.** Single implementation branch (`technical/work-status-restructure`).
No phased delivery needed — unlike rebrand, there are no external actions that
require splitting rotation across sessions. Seven phases on one branch.

**Estimated phase structure** (finalized at task generation):

1. **Phase 1: Foundation docs** — ADR-007 amendment, `strategy-session-operations.md`,
   `strategy-team-coordination.md`. "What the model is" documents land first so
   subsequent workflow edits can reference them.
2. **Phase 2: Core workflow edits** — session-init, session-handoff, activate /
   archive / clean / integrate / rotate / planning-branch, 1_create-prd,
   2_generate-tasks. Templates updated (status file template created,
   SESSION-NOTES adds `Working On:`, task list removes `Status:` header). Both
   `.arc/` and package-source mirrors.
3. **Phase 3: Live migration** — cutover current WORK-STATUS.md to
   `status-work-status-restructure.md` on this branch; prove the loading strategy
   end-to-end.
4. **Phase 4: `deactivate-work-unit.md`** — Case A primary workflow + routing
   pointers for B/C/D; design-principle header.
5. **Phase 5: Plan-\* doc updates** — substantive cross-reference section in
   `plan-arc-modes.md` (Finding #4 carve-out, shift-lifecycle vocabulary
   find-and-replace, line 4016 alignment); header-level notes on
   `plan-post-release-methodology.md` and `plan-expanded-planning-path.md`.
6. **Phase 6: Supporting cleanup** — FTL field removal (R17), session-handoff
   anti-duplication guard (R18), ATOMIC-INBOX items #1–#3 removal, any remaining
   `AGENT-BRIEFING.*` / `CLAUDE.ARC.md` reference updates (R15).
7. **Phase 7: Integration and archival** — pre-merge review, integrate, archive.

## Success Criteria

Two lists — design flaws eliminated (derived from the root-cause analysis) and
post-migration invariants (observable conditions that must hold after Phase 3
cutover).

### Design flaws eliminated

- [ ] **Parallel-WU merge conflicts** at integration — gone by construction
  (different files, no shared mutation)
- [ ] **WORK-STATUS staleness on main under full protection** — gone by
  construction (file never exists on main between WUs)
- [ ] **`session-handoff.md` dead-end on main under full protection** — gone
  (nothing to commit when no active WU)
- [ ] **`integrate-planning-branch.md` § Step 5 planning-cycle chain confusion** —
  gone (WORK-STATUS isn't part of planning state)
- [ ] **`rotate-branch.md` session-boundary sub-pattern gap** — gone (per-WU file
  travels through rotations via normal merge flow)
- [ ] **Archive content conflicts** — gone (archive deletes a file; no content
  merge)

Each bullet maps to a stress-test scenario (see
[notes-work-status-restructure.md](notes-work-status-restructure.md) § Stress-test
battery); validation for each occurs during Phase 3 live migration and Phase 7
pre-merge review.

### Post-migration invariants

- [ ] No tracked path exists at `.arc/active/WORK-STATUS.md`
- [ ] Every active work unit has exactly one `status-{name}.md` file in its
  category directory
- [ ] Session-init resolves the correct status file across all 8 stress-test
  scenarios (parallel WUs, team sub-branches, rotating branches, fresh clone,
  delayed archive, planning cycles, atomic commits, branch rename/rebase)
- [ ] `**State:**` field is the sole source of truth for WU lifecycle (task list
  `**Status:**` header removed from templates and all existing task lists)
- [ ] Status file is **deleted** (not reset) at archive
- [ ] ATOMIC-INBOX items #1, #2, #3 removed from `user/{identity}/ATOMIC-INBOX.md`
- [ ] SESSION-NOTES template carries the `**Working On:**` field with defined
  value shape (per Q1 resolution during implementation)
- [ ] `session-handoff.md` writes `**Working On:**` at handoff; `session-init.md`
  reads it as primary disambiguation signal; SESSION-NOTES template documents the
  marker vocabulary — all three agree
- [ ] Package-source mirrors synced per `strategy-package-project-sync.md` — every
  `.arc/` edit has its package-source counterpart
- [ ] ADR-007 carries a `## Amendments` section documenting the refinement
- [ ] `plan-arc-modes.md` cross-reference section exists with harmony walk and
  Finding #4 carve-out reference
- [ ] Rebrand WU reactivates cleanly on the new model (first real exercise across
  rotating branches) — validated when rebrand WU's next session begins post-merge

## Open Questions

All items below are deferred to implementation with clear direction. Each must be
**defined** by WU completion — not left freeform or undocumented. No blockers for
starting task generation.

### Resolve during work

**Q1. SESSION-NOTES `**Working On:**` field value format.** Direction: filename
when applicable (`status-arcd-rebrand.md`); defined markers for edge cases. Must
be lightweight, consistent, unambiguous — not freeform prose. Candidate marker
shapes to decide during `session-handoff.md` / `session-init.md` / SESSION-NOTES
template work:

- `[none]` — no active work
- `[planning: {category}/{name}]` — in a planning cycle, no WU yet
- `[between work units]` — between activation and archive of adjacent WUs
- `status-{name}.md` — normal case, file reference

Final decision codified in three surfaces that must agree: (a) `session-handoff.md`
write instruction, (b) `session-init.md` read/interpret logic, (c) SESSION-NOTES
template comment block.

**Q2. Ambiguous-discovery prompt format.** When session-init's discovery precedence
falls through to the prompt step (R4, last resort), what does the prompt show?
List candidates with one-line summaries? Fallback if the user dismisses? Decide
during `session-init.md` edit (Phase 2).

**Q3. ADR-007 amendment prose.** Format settled (Tier 2 Amendment in `## Amendments`
section, per R7); content drafted during Phase 1. PRD captures intent; actual
prose is a Phase 1 task deliverable.

**Q4. `strategy-team-coordination.md` § Concurrent Sessions rewrite prose.**
Direction settled (narrow rewrite, two-axis, shipping-clean, per R8); prose drafted
during Phase 1.

**Q5. `plan-arc-modes.md` cross-reference section prose.** Structure known (harmony
walk, Pure Option C re-validation, Finding #4 carve-out reference, per R11); prose
drafted during Phase 5.

## Document History

<!-- PRDs are living documents — update them as understanding evolves during
planning and implementation. Use the table below to track significant changes.
Typo fixes and minor formatting don't need entries.

When implementation completes, add a final row marking the PRD as "Implementation
complete" and note any material deviations from the original plan. The PRD then
serves as a historical record of what was planned, how it evolved, and what
actually shipped. -->

| Date       | Change                                                            |
| ---------- | ----------------------------------------------------------------- |
| 2026-04-15 | Initial draft — formalized from `plan-work-status-restructure.md` |
