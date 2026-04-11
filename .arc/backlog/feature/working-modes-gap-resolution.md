# Working: Modes Gap Resolution

**Purpose:** Tracks unresolved gaps surfaced in the pre-PRD audit (2026-04-10) for
`plan-arc-modes.md`. Findings drain into the plan doc as they resolve; this file shrinks
accordingly. When the last finding drains, this file is deleted.

**Decision history** for resolved findings lives in `plan-arc-modes.md` § Resolved Decisions
(compressed decision records) and the corresponding section bodies (full evaluation trails).
Commit-level history is available via `git log .arc/backlog/feature/plan-arc-modes.md`.
Session-scoped context lives in `user/{identity}/SESSION-NOTES.md`.

---

## Status legend

- 🔴 **Open** — no position yet
- 🟡 **In-discussion** — user thoughts captured, analysis pending
- 🟢 **Resolved** — decision landed, awaiting migration into plan doc. Removed from this file
  once migrated.
- ⚪ **Parked** — out of scope for pre-PRD, revisit later (not blocking formalization)

---

## Sequencing

Findings are ordered by number for traceability, but should be worked in the tier order below.
Tier determines what unblocks what.

**Tier 1 — gates most downstream:** Drained. #1 (Lite PRD) and #8 (recipe architecture)
resolved and migrated 2026-04-10.

**Tier 2 — drained:** #3 (Ship step), #13 (Integrate × non-complete states), #16 (Full → Lite
downgrade), #7 (Guardrail firing mechanism — rejected categorically), #19 (Mode fit
communication — scope lifted pre-PRD) all resolved and migrated. Scope composition from #16:
`pm.mode` → `pm.layer` and `team.mode` → `team.enabled` key renames absorbed into ARCd Rebrand
WU. See [`plan-arc-modes.md`][plan-doc] § Resolved Decisions rows for specific landing points.

**Tier 3 — detail once Tier 1 lands:**

- **#2, #4, #5, #6** — All gate on #1 (now resolved and migrated).
- *#9 (Conditional prompts orchestration) and #10 (Lite `arc-config.yml` reduction mechanism)
  resolved and migrated 2026-04-10. See [`plan-arc-modes.md`][plan-doc] § Prompt Orchestration
  and Recipe Authority, § Lite Config Template Mechanism.*
- **#12, R6** (OQ15 initial-setup workflows) — gate on #8 (now resolved and migrated).

**Tier 4 — validation + inventory:**

- **#11** — install_config precision. Quick now that #8 is migrated.
- **A1, A4** — Remaining unvalidated assumptions. Correct directly in the plan doc. (A2 and
  A3 resolved and migrated in the 2026-04-10 Tier 1 batch.)
- **R4** — Consolidated deliverable inventory. Once Tier 1–3 decisions have landed.

**Parking lot (revisit when touched, not blocking formalization):** Lite + external PM (plan
OQ10), waiting-for taxonomy finalization (OQ12), long-pause staleness threshold (OQ13),
`/arc-status` drift detection threshold (OQ14).

---

## Masked Design Decisions

### Finding 2 — Lite task list template · ✅

**Resolution** (2026-04-11): Lite task list uses the **same format as Full**, with four surgical
trims only: header `Status:` values restrict to `{Pending | In Progress | Complete}` (`Integrated`
and `Paused` drop — both ride on Full-only concepts); `PRD:` path is `.arc/active/prd.md` (singular);
verification phase task points to a new Lite-only `verify-work.md` workflow (parallel-named to
Full's `verify-work-unit.md`, two dedicated files over one unified-with-`arc:if`); atomic companion
file retained in Lite, named `atomic-tasks.md` (paralleling `tasks.md`, with "tasks" filling the
`{wu-name}` slot of Full's `atomic-{wu-name}.md` convention). Phases required in Lite, minimum two
(work + verification), multi-phase normal — "single-phase default" rejected because it would force
retroactive phase addition on graduation, violating "graduation is relocation, not content rewrite".

**Strategy classification correction absorbed:** `strategy-task-list-formatting` reclassified
applies-as-is → needs-variant (corrects Finding #6's 2026-04-11 migration). Four `arc:if`-gated
surfaces: Verification Phase example pointer, Atomic Companion File archival sub-rule, Atomic
Companion File "all work unit types" phrasing, Status values `Paused` and `Integrated`. Naming
convention (Full `atomic-{wu-name}.md` vs Lite `atomic-tasks.md`) handled via mode-aware prose,
no gate.

**Finding #5 interaction:** This resolution revises Finding #5's 2026-04-10 cut list. Atomic
companion references stay in Lite's process-task-loop variant. Remaining cuts: incidental routing
to backlog, coherent-unit protocol's WU-lifecycle framing.

**Migrated to plan doc:** New § The Lite Task List subsection under § Mode 1: ARC Lite, between
§ The Lite PRD and § Graduation / Downgrade Paths. § What Changes "Task list structure" bullet
updated. § Strategy Applicability Mapping rationale cell and Finding #2/#5 follow-ons updated.
§ Enforced Sequence § Ship step "Protocol location" deferral resolved. Feedforward "Lite ship step
deliverable" resolved. Cascades bullet updated. OQ4 marked resolved. Four new Resolved Decisions
rows (phases, verify workflow, atomic naming, strategy reclassification correction).

---

### Finding 4 — Lite session-init + session-handoff · 🟡

**Original:** Plan hedges "simplified Lite variants... likely separate template files" — no
commitment.

**User position (2026-04-10):** Depends on what's cut elsewhere — "anything cut from full that's
normally loaded at init or a step in handoff." Parking until Finding #1 resolves.

**Outstanding analysis (deferred until #1 lands):**

- Session-init document load order: which items in the current session-init workflow don't
  apply in Lite? (Candidates: WORK-STATUS fields that don't exist in Lite, work-unit discovery
  step, task list loading from WORK-STATUS path.)
- Session-handoff ceremony: does the full handoff protocol apply, or does Lite use a lighter
  version?
- Variant vs conditional — the density threshold from the conditional content analysis (5+
  in-prose conditionals on the same axis) suggests variant for session-init.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 5 — Lite process-task-loop · 🟢

**Original:** Variant-vs-conditional hedged in plan.

**User decision (2026-04-10):** **Variant over conditional, committed.** Process-task-loop is a
core agent operating doc referenced constantly during task execution — noise in that document is
expensive. Cuts should be minimal to zero: only remove "wrong info" (references to ARC docs or
processes that don't exist in Lite — ~~atomic companion files~~, incidental work routing to
backlog, coherent unit protocol referencing lifecycle). Underlying loop is identical.

**Cut list narrowed (2026-04-11, Finding #2 interaction):** Atomic companion files are retained
in Lite as `atomic-tasks.md` (see Finding #2 resolution). The earlier "atomic companion files"
entry in the cut list was premised on atomic being Full-only; with the concept retained, those
references stay in the Lite process-task-loop variant. Final cut list: **incidental work routing
to backlog** (no backlog in Lite) and **coherent-unit protocol's WU-lifecycle framing**
(no lifecycle in Lite). Tier 1/2/3 quality gate structure retained. `atomic-tasks.md` references
stay.

**Outstanding analysis:**

- Exact list of "wrong info" references in current `3_process-task-loop.md` — produces the diff
  for the Lite variant. Runs after Finding #1 lands (since some cuts depend on Lite scope
  around incidental work routing, etc.).

**Resolution:** Variant over conditional. Minimal cuts. Underlying loop identical across modes.
Cut list: incidental routing to backlog, coherent-unit WU-lifecycle framing.

**Migrated to plan doc:** *pending* (cut list narrowing absorbed into Finding #2 migration
2026-04-11 via Finding #2/#5 follow-on bullet update in § Strategy Applicability Mapping; full
variant contents still pending as part of Finding #5's own migration).

---

### Finding 6 — Strategy applicability mapping for Lite · ✅

**Resolution** (2026-04-11): All 10 framework strategies classified. 6 applies-as-is
(adr-methodology, configurability-architecture, file-classification, quality-gates,
session-operations, ~~task-list-formatting~~); 2 needs-variant via inline
`<!-- arc:if install.type == full -->` blocks (work-organization retains Branch Protection
Modes as universal git convention; work-planning retains Discovery Checklist, PRD Readiness,
and PRD Conventions); 2 excluded (team-coordination forced solo in Lite; planning-module
excluded by composition via `pm.layer` gate). Mechanism for needs-variant: same render
pipeline as `arc-config.template.yml`, `.template.md` rename so `needsRendering()` picks them
up. Upgrades plan doc's prior "pure Excluded" label on `work-organization` to needs-variant.
Unblocks Findings #2, #4, #5.

**Correction absorbed (2026-04-11, Finding #2):** `strategy-task-list-formatting` reclassified
applies-as-is → needs-variant. The original classification was based on "core format is
universal" reasoning without auditing the strategy's example blocks and Status value rules.
Finding #2's Lite task list spec design surfaced four Full-coupled surfaces requiring
`arc:if` gating (Verification Phase example pointer, Atomic Companion File archival sub-rule,
Atomic Companion File "all work unit types" phrasing, Status values `Paused` and `Integrated`).
Corrected count: **5 applies-as-is / 3 needs-variant / 2 excluded**. Plan doc rationale cell
and Resolved Decisions row updated in place during Finding #2 migration.

**Migrated to plan doc:** § Strategy Applicability Mapping (under § Content Audit). Resolved
Decisions table adds three rows: "Strategy applicability mapping (Finding #6)",
"work-organization scope refinement", "team-coordination Lite treatment". OQ7 marked resolved.
Upstream recipe-bucket pending references (plan doc § Installation Type Recipe Mechanism)
updated to point at the new subsection.

---

### Finding 11 — `install_config` precision · 🟡

**Original:** Plan's "stored in the manifest's `install_config` (like `pm.mode` is now)" is
imprecise. `InstallConfig` exists in `types.ts` with `project_name`, `pm_mode`, `tools`,
`team_mode` — but `pm_mode` is *also* a config key in `arc-config.yml`, and the two are kept in
sync. Lite's install_type: does it live only in the manifest, only in `arc-config.yml`, or both?
If only manifest, how do tools not invoking the CLI (hooks, session-init workflow) read it?

**User position (2026-04-10):** Not sure. Needs deeper analysis and pro/con weighing.

**Outstanding analysis (gates on #8):**

- Enumerate consumers of install mode: CLI (init, reconfigure, update), hooks (pre-commit,
  commit-msg), workflows (session-init, process-task-loop, etc.), agents (document loading),
  recipe (condition evaluation).
- For each consumer, identify read path: can it read the manifest, or does it need
  `arc-config.yml`?
- Precedent: `pm.mode` is in both because hooks read `arc-config.yml` and the CLI reads the
  manifest. If install mode has the same consumers, same pattern; if it only affects CLI, manifest
  alone.
- Naming: `install_type`, `install_mode`, `mode`, `arc_mode`? Coordinate with rebrand WU's
  config naming work.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 12 — Initial-setup workflows (OQ15) · 🟡

**Original:** `01_verify-and-configure.md` and `02_define-project.md` assume Full ARC tracked.
Lite and Local each need different setup paths. Separate workflows per mode, or unified with
mode-conditional sections?

**User position (2026-04-10):** Depends on where Lite/Full boundaries are drawn. Park until #1
and #8 land.

**Outstanding analysis (gates on #1, #8):**

- Read current `01_verify-and-configure.md` and `02_define-project.md` — identify mode-specific
  vs mode-neutral content.
- If recipe architecture (#8) lands on "two recipes" or "invert baseline," initial-setup workflows
  likely fork per mode. If "extend schema" or "bucket + gate," unified with conditionals may be
  viable.
- Density threshold from conditional content analysis applies (5+ conditionals on same axis →
  variant).

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 14 — Shift-with-activation coordination · 🟢

**Original:** Workflow Shape says shift "hands off to activate-work-unit" — in-process invocation
or user-triggered? Atomicity? Half-state on failure?

**Insight (2026-04-10):** Shift has nowhere to go in Lite (single task list, no second WU). So
**shift lifecycle is Full-only**. The mode-awareness of the shift workflow is a trivial "skip
entirely in Lite" gate, not a mode-conditional workflow body. Simpler than initially framed.

**User position (2026-04-10):** Agreed shift doesn't apply in Lite. On the activate coordination
question specifically: leans toward workflow prompting the user after pause rather than
auto-handing-off to activate. "Hard to say without seeing how the skill/workflow ends up
finalizing."

**Outstanding analysis:**

- In-process invocation vs user-triggered for shift-with-activation:
    - **Auto-handoff:** shift executes pause, then internally invokes `activate-work-unit`
      against the target. Single atomic operation from user's POV. Failure mid-activation leaves
      half-state (paused but not activated).
    - **Prompt-after-pause:** shift executes pause, reports success, then prompts user "Next:
      activate {target}? (Y/n)". Two explicit steps. Clean failure boundary. Slightly chattier
      UX but avoids half-state.
    - User's lean is toward prompt-after-pause. Matches ARC's general "mandatory stops between
      operations" principle.
- If prompt-after-pause: does `/arc-shift feature-y` become a two-step conversation, or does it
  run both steps in sequence with an implicit stop between? Prefer the latter — user says "shift
  to feature-y" and the workflow walks both steps with one confirmation.
- Document in `shift-work-unit.md` as the authoritative transition protocol.

**Resolution (partial):** Shift lifecycle is Full-only; Lite skips it entirely. Remaining
question is coordination mechanism (auto-handoff vs prompt-after-pause) — user leans
prompt-after-pause; needs final commitment.

**Migrated to plan doc:** *pending*

---

### Finding 15 — Finding C (pause pointer fields) formalization · 🟢

**Original:** Plan says "independent doc sweep, not shift-blocking" — ambiguous whether in-scope
for modes WU.

**User decision (2026-04-10):** **In scope for modes WU.** "Not sure why this would be deferred,
that's just tech debt otherwise."

**Outstanding analysis:**

- Identify the four pointer fields: `Interrupts:` / `Paused:` / `Paused To:` / `Spawned:` — locate
  them in the current workflows/templates and confirm scope of the formalization sweep.
- Document the canonical form of each pointer field (syntax, when set, when cleared, where used).
- Update any workflow/strategy docs that reference them informally.

**Resolution:** In scope for modes WU. Proceed with formalization sweep as part of modes
implementation. Not shift-blocking but not deferred.

**Migrated to plan doc:** *pending*

---

### Finding 17 — Backing store sync protocol · 🟢

**Original:** "Auto-populated from `.arc/` on each handoff" stated; mechanism and firing policy
unspecified.

**User position (2026-04-10):** Once per session (handoff) is likely right. Can be more frequent
only if it's very fast, seamless, invisible to user. Lean: handoff only unless a concrete edge
case demands otherwise.

**Proposed shape (pending confirmation):** Backing store sync fires at session-handoff as the
canonical firing point. Mechanism needs selection.

**Outstanding analysis:**

- Mechanism candidates:
    - **`git add -A` + commit inside bare repo** — needs a working directory; awkward for a bare
      repo. Would need a non-bare `~/.arc-state/{project-id}/` working clone.
    - **`rsync --delete`** — fast, portable, but loses git history semantics (backing store
      becomes snapshots not commits).
    - **`git bundle`** — periodic bundle file generation; portable across machines for the
      opt-in remote sync but not a live-updated store.
    - **Non-bare clone + commit on each handoff** — `~/.arc-state/{project-id}/` is a normal git
      repo; on handoff, CLI copies `.arc/` contents, commits with an auto-generated message.
      Keeps full git history, supports remote push. Likely cleanest.
- Sync scope: does it copy the entire `.arc/`, or selective (exclude `reference/`, `system/`
  templates since they're framework-shipped)? Likely entire `.arc/` for simplicity — storage is
  cheap, partial sync is fragile.
- Failure handling: if backing store write fails, does handoff proceed or refuse?
- Additional firing points beyond handoff: should shift transitions also sync? Probably yes if
  sync is fast; parks a WU to durable storage before rotating focus.
- Resolving edge cases: crash between handoffs loses work; do we care?

**Resolution (partial):** Handoff is the primary firing point. Mechanism selection and edge-case
handling still open. Revisit during detail design.

**Migrated to plan doc:** *pending*

---

### Finding 18 — Project ID for zero-commit repos · 🟡

**Original:** Plan: "remote URL primary, first-commit hash fallback." Doesn't cover zero-commit
repos with no remote — exactly the Lite+Local "try ARC in five minutes" scenario.

**User position (2026-04-10):** Whatever's most seamless. No user prompting — "shouldn't be
something they have to think about."

**Outstanding analysis:**

- Third fallback candidates (all must be seamless):
    - **Directory path hash** — hash absolute path of the working tree. Stable across `arc`
      invocations in the same directory, but changes if the user `mv`s the directory.
    - **Generated UUID stored in `.arc/system/.internal/project-id`** — created on first
      `arc init --local`, read on subsequent runs. Survives moves. Lost on re-clone (but that's
      expected, and for zero-commit repos there's no clone to speak of).
    - **Composite** — try directory-path hash first; if `.arc/` doesn't exist at that hash's
      location when re-accessed, fall back to UUID. Complex.
- Graduation handling: what happens when the repo later gets a remote or a first commit? Does
  the project ID transition to the new primary mechanism, or stay on the fallback?
- Precedent: does any existing ARC CLI code store similar project-local identifiers?

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

## Unvalidated Assumptions

### A1 — "Hooks (already local in nature)" in Local Unchanged list · 🔴

**Finding:** Plan's Local mode Unchanged list says "Hooks (already local in nature)." Directly
contradicted by `analysis-conditional-content-architecture.md` § Local Mode: "Commit hooks — May
be absent or drastically simplified (no task list co-staging if `.arc/` isn't tracked). 3-5
shell conditionals or a mode-aware hook installation."

**Outstanding analysis:**

- Read the current pre-commit hook's task-list co-staging logic — what does it do, does it
  actually break in Local mode?
- Reconcile: either the plan's Unchanged claim is wrong, or the analysis is wrong, or both are
  partially right.
- Fix: update plan's Local mode section to accurately describe which hook behaviors change in
  Local mode and which truly are unchanged.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### A4 — Template `arc:if` mechanism not discussed · 🟡

**Finding:** `analysis-conditional-content-architecture.md` projects "+4-8 template `arc:if`
blocks for Lite" but the plan doesn't discuss template-render conditionals at all. Either the
plan implicitly assumes template-variant files only (in which case the analysis's projection is
off), or the plan should acknowledge the template-render layer.

**Outstanding analysis:**

- Read `src/lib/template/render.ts` — understand the `arc:if` template mechanism and its
  operator set (`==`, `!=` per earlier code read).
- Determine: does the plan's "template variant" preference (per Finding #5) subsume the template
  `arc:if` use case, or are they complementary?
- If complementary, enumerate where `arc:if` earns its keep (likely: individual config file
  comment blocks, single-file docs with one or two mode-specific callouts).
- Update plan to acknowledge both tools with guidance on when to use which.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

## Scope Boundaries

### B1 — Content Audit sizing · 🔴

**Finding:** Plan § Content Audit says "audit all framework domains" — no file count, no
person-day estimate, no done definition. Combined with the separate phrasing sweep (also
unsized), these are two large content-touching passes on the tail of the WU. The plan's own
scope boundary note already anticipates scope escape.

**Outstanding analysis:**

- Rough file-count inventory: walk `.arc/reference/`, `.arc/system/workflows/`,
  `.arc/reference/constitution/` — estimate how many files each pass touches.
- Heuristic sizing per file (minutes of work) — small (trivial update), medium (moderate
  rewrite), large (significant restructure).
- Produce a rough estimate — multiply into a time budget. Frame as "implementation phase X of
  modes WU" with a realistic ceiling.
- Decide: are these two passes one phase or two? Can phrasing sweep follow audit without a
  hard separator?

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### B2 — Finding C pointer formalization boundary · 🟢

**Resolved by Finding 15.** In scope for modes WU.

---

### B3 — Full → Lite downgrade scope · 🟢

**Resolved by Finding 16, migrated 2026-04-11.** See [`plan-arc-modes.md`][plan-doc]
§ Graduation / Downgrade Paths. Supported via `arc mode switch --to lite` + advisory
workflow; descope guard retained but analysis did not surface material complexity.

---

### B4 — Absent consolidated deliverable inventory · 🟡

**Finding:** Scanning the plan I count ~18–20 discrete deliverables (scope template, Lite/Local
config templates, two new workflows, two new skills, Lite session-init variant, Lite
process-task-loop variant, status header updates to lifecycle workflows, status vocab update to
task-list-formatting strategy, manifest schema extension, recipe schema extension, backing store
mechanism, re-clone detection, forbidden-combinations validation, content audit, phrasing sweep,
etc.). No consolidated list exists.

**Resolution:** Build the list once Tier 1–3 decisions have landed. Format: flat list grouped by
Lite / Local / Shift / Cross-cutting / CLI+manifest / Content sweep. Sized roughly per item
where possible. Insert as new section near the end of `plan-arc-modes.md` — gates formalization
readiness.

**Migrated to plan doc:** *pending*

---

## Structural Recommendations

(These are the "Next" recommendations from the original synthesis. They feed directly into
making the plan formalization-ready.)

### R1 — Resolve recipe architecture · 🟡

Same as Finding #8. Tracking there.

### R2 — Fix unvalidated claims · 🟡

Same as A1, A2, A3. Tracking there.

### R3 — Sketch Lite concrete surface · 🟡

Addresses Findings #1, #2, #3, #4, #5, #6. Tracking as those individual findings.

### R4 — Consolidated deliverables inventory · 🟡

Same as B4. Tracking there.

### R5 — Walk missing shift scenarios · 🟡

**Finding:** Two missing scenarios: integrate-work-unit on a paused/waiting-for WU (Finding #13,
resolved and migrated 2026-04-10), and shift-with-activation end-to-end (Finding #14, tracked).

**Resolution:** Finding #13 resolved (see [`plan-arc-modes.md`][plan-doc] § Integration
Interaction with Shift States). Finding #14 still tracked.

### R6 — Resolve OQ15 (initial-setup workflows) · 🟡

Same as Finding #12. Tracking there.

### R7 — Backing store sync protocol paragraph · 🟡

Same as Finding #17. Tracking there.

### R8 — Zero-commit Local init · 🟡

Same as Finding #18. Tracking there.

---

[plan-doc]: plan-arc-modes.md
