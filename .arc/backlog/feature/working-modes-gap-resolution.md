# Working: Modes Gap Resolution

**Purpose:** Working doc supporting `plan-arc-modes.md`. Tracks gaps surfaced in the pre-PRD
audit (2026-04-10), captures analysis as it lands, and migrates resolved findings into the plan
doc. Not a plan doc itself — supports one. Each finding is numbered to match the original audit
synthesis for traceability.

**Origin session:** 2026-04-10. Initial population drawn from that session's `/arc-plan`
synthesis and the user's first-pass responses.

**Lifecycle:** Tracked (committed to git) for traceability, unlike `temp-*` working files which
are gitignored. When all findings are drained — resolved and migrated into `plan-arc-modes.md`
— this doc can be deleted (its reasoning lives in commit history and the plan doc itself) or
retained as a working record at the user's discretion. Do not treat this file as a durable
long-term reference while findings are still in flight; its content graduates into
`plan-arc-modes.md` as decisions land.

---

## Status legend

- 🔴 **Open** — no position yet
- 🟡 **In-discussion** — user thoughts captured, analysis pending
- 🟢 **Resolved** — decision landed, awaiting migration into plan doc
- ✅ **Absorbed** — migrated into `plan-arc-modes.md`, line reference below
- ⚪ **Parked** — out of scope for pre-PRD, revisit later (not blocking formalization)

---

## Sequencing

Findings are ordered by number for traceability, but should be worked in the tier order below.
Tier determines what unblocks what.

**Tier 1 — gates most downstream:**

- **#1** — Lite PRD functional requirements. Gates #2, #4, #5, #6 plus the content audit.
- **#8** — Recipe architecture. Gates the entire CLI implementation plus #9, #10, #15.

**Tier 2 — independent, manageable:**

- **#11** — Integrate × non-complete states. State-machine sketch, small scope.
- **#7** — Guardrails. Orthogonal, can run in parallel.
- **#14** — Full → Lite downgrade. Small, user's framing already mostly resolves it.
- **#3** — Ship step. Small, once #1 lands.

**Tier 3 — detail once Tier 1 lands:**

- **#2, #4, #5, #6** — All gate on #1.
- **#10, R6** (OQ15 initial-setup workflows) — gate on #8.

**Tier 4 — validation + inventory:**

- **#9** — install_config precision. Quick once #8 is decided.
- **A1–A4** — Unvalidated assumptions. Correct directly in the plan doc.
- **R4** — Consolidated deliverable inventory. Once Tier 1–3 decisions have landed.

**Parking lot (revisit when touched, not blocking formalization):** Lite + external PM (plan
OQ10), guardrail threshold numbers (OQ8), waiting-for taxonomy finalization (OQ12), long-pause
staleness threshold (OQ13), `/arc-status` drift detection threshold (OQ14), multi-paused
limit policy (OQ11).

---

## Masked Design Decisions

### Finding 1 — Lite PRD functional requirements · 🟢

**Original:** Lite's scope artifact has no concrete shape; required as a deliverable but zero
format specified.

**User reframe (2026-04-10):** Keep calling it a PRD (no separate artifact name). Vary the
template and `create-prd` workflow by mode. `plan-*` docs are the same across modes (subsumed by
PRD at impl time, with notes extracted to `notes-*`). General lean: "mirror Full where possible
but scaled back" — preserves framework coherence, good UX, keeps the concept recognizable.
Functional requirements gate the format.

**Analysis conducted (2026-04-10):** First-pass purpose enumeration + section-by-section walk of
`template-prd.md` + step-by-step walk of `1_create-prd.md`. Identified ten purposes the Full PRD
serves (alignment check, work classification, scope definition upstream of tasks, verification
anchor, historical record, scope guardrail during execution, collaboration handshake, dependency
tracking, plan retirement trigger, open questions parking). Tested each against Lite's single-
bounded-effort context. **Eight of ten purposes survive in Lite; two drop** (P2 work
classification, P8 dependency tracking). Template cuts: `Type:` field, `Status/Related Work`
header block, and `Document History` section entirely. All other sections stay identical or
with small guidance softening. Workflow: ~90% mode-neutral; changes concentrated at workflow
edges (branch context, META-PRD review, category classification, save-location plumbing).

**Resolution:**

**Lite PRD template section set.** Keeps identically or with minor softening: Introduction,
Goals, User Stories or Use Cases (guidance simplified — no Feature/Technical split), Requirements
(prioritization softened — "use if it helps; Lite projects often have a flat list"), Non-Goals
(elevated framing — explicit one-line note that it's the scope guardrail), Technical
Considerations (optional), Design Considerations (optional), Success Criteria (unchanged —
critical), Open Questions (unchanged). Drops vs Full: `Type:` header field, `Status/Related
Work` header block, `Document History` section.

**Lite `create-prd` workflow shape.** Single unified workflow with mode conditionals at these
edges — **not** a separate Lite variant (inverse of Finding #5's task-loop decision). Rationale:
mode differences are small and localized, mode-neutral content is the bulk, cross-mode
consistency preserves collaborative-elicitation guidance as it evolves.

Mode-conditional edges:

- **Pre-Step 0 branch context** — simplified or dropped in Lite (no full/partial branch
  protection in Lite).
- **Pre-Step 0 META-PRD review** — dropped in Lite (no META-PRD installed; see SQ1).
- **Step 2 category classification** — dropped entirely in Lite.
- **Step 4 template reference + save location** — swaps template reference (or selects Lite
  variant via template `arc:if`) and uses `active/prd.md` singular save location.

Mode-neutral (apply identically across Lite and Full):

- **Step 1** — existing plan-\*.md lookup and PRD-readiness assessment.
- **Step 3** — discovery (discovery checklist from `strategy-work-planning.md`).
- **Step 5** — plan retirement + notes-\* creation + commit atomicity.
- **Stop-for-review** conclusion.

**Sub-questions resolved:**

- **SQ1 META-PRD in Lite:** Not installed. Project vision captured in the Lite PRD itself; a
  separate META-PRD adds ceremony without commensurate value at Lite's scale.
- **SQ2 `plan-*` doc location:** `.arc/active/plan-{name}.md` — sibling to `prd.md` and
  `tasks.md`. Matches Lite's flat structure, allows multiple exploration threads, retires
  normally on PRD creation.
- **SQ3 PRD filename:** Singular `prd.md`. One PRD per Lite project. If user needs multiple,
  that's a graduation signal.
- **SQ4 Document History:** **Cut entirely in Lite** (user decision 2026-04-10). No value at
  project level for Lite's bounded-effort context.
- **SQ5 Non-Goals framing:** Elevated. Template carries a one-line note — "In Lite, this
  section is your scope guardrail — drift from Non-Goals is a signal to reconsider scope or
  graduate to Full." Workflow Step 3 discovery guidance spends deliberate time on Non-Goals
  elicitation.

**Template delivery mechanism:** Template-render `arc:if` mechanism is viable for
`template-prd.md` Lite variant (since cuts are minimal and localized — a few conditional blocks
in one file). Confirms A4 as a legitimate tool, not theoretical. Final decision between
single-file-with-arc:if vs two-file-variant depends on Finding #8 recipe architecture
resolution — either approach works for this specific template.

**Cascades into other findings** (informational — see those entries for status):

- **Finding #2:** Lite task list keeps Success Criteria section (chain confirmed:
  PRD success criteria → task list Success Criteria → ship step).
- **Finding #3:** Ship step substrate confirmed — upgraded to 🟢.
- **Finding #4:** Lite session-init document set: `.arc/active/prd.md` +
  `.arc/active/tasks.md` + `.arc/active/WORK-STATUS.md`. No backlog scan, no category-path
  lookup.
- **Finding #6:** `strategy-work-planning.md` partially applies in Lite (discovery checklist
  used by create-prd Step 3).
- **Finding #8:** Datapoint — template `arc:if` earns its keep on `template-prd.md`. Factor
  into recipe architecture decision.
- **Finding #10:** Prediction — initial-setup workflows likely take the same shape (unified
  with mode conditionals at the edges). Strong lean, not yet decided.
- **A4:** Template `arc:if` confirmed as a legitimate tool.

**Migrated to plan doc:** *pending migration*

---

### Finding 2 — Lite task list template · 🟡

**Original:** "Single task list, likely simpler default structure" — no concrete spec.

**User lean (2026-04-10):** Likely identical barring ceremonial-assumption stripping. Task lists
are generated and maintained by agents; Lite is lighter for the user, not the agent. Candidates
for removal: mandatory verification phase at end (doesn't fit single evolving task list),
pause-related header fields (single task list never pauses). Thoughts only, not certainties.

**Outstanding analysis:**

- Clarify verification: (a) verification as a task list phase, vs (b) verification as a
  lifecycle workflow (`verify-work-unit.md`). (b) doesn't exist in Lite. (a) is just a phase;
  should the template *suggest* a verification phase by default, or leave it to the user?
- Which Status header values apply in Lite? If single task list never rotates, `Paused` and
  `Waiting-For` are Full-only. `In Progress` and `Complete` stay.
- Does Lite allow multi-phase task lists, or force single-phase default? (Plan OQ4 open.)
- Gates on Finding #1 — PRD functional requirements drive what Success Criteria look like,
  which drives the task list bottom section.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 3 — Lite ship step · 🟢

**Original:** "Run Tier 3 gates and merge/push" is all the plan says; no workflow home, no
structural anchor.

**User position (2026-04-10):** Questioned whether ship step even makes sense as formal protocol
in Lite — "done is whatever the user thinks it is." Prompted reuse of Full's existing Success
Criteria convention.

**Resolution (2026-04-10):** Lite ship step reuses Full ARC's `Success Criteria` section
convention directly (see `strategy-task-list-formatting.md` § Success Criteria Section). Ship
step protocol:

1. All Success Criteria items must be marked `[x]` (met) or `[~]` (superseded, with annotation).
   Any remaining `[ ]` items represent genuine gaps requiring resolution before ship.
2. Run Tier 3 quality gates (full lint, type check, test suite, build).
3. Review aggregate diff before push/merge.

No new template section, no new workflow concept. Reuses Full's convention verbatim. Chain
confirmed by Finding #1 analysis: Lite PRD carries Success Criteria (the section survives all
cuts), Lite task list operationalizes them (identical to Full convention), ship step checks
them.

**Remaining detail decisions (detail-design, not pre-PRD blocking):**

- **Protocol location.** Dedicated `lite-ship.md` supplemental workflow vs inline section at
  the end of the Lite process-task-loop variant. Lean: **dedicated file** for discoverability
  and to parallel Full's three-phase ship convention (verify/integrate/archive), just collapsed
  into one file.
- **Aggregate-diff review formalization.** Link to `prepare-commits.md` for review conventions,
  or leave as informal "review your changes" directive? Lean: **link to `prepare-commits.md`**
  if it applies mode-neutrally; inline minimum review guidance otherwise. Decide during
  implementation.

**Migrated to plan doc:** *pending*

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
processes that don't exist in Lite — e.g., atomic companion files, incidental work routing to
backlog, coherent unit protocol referencing lifecycle). Underlying loop is identical.

**Outstanding analysis:**

- Exact list of "wrong info" references in current `3_process-task-loop.md` — produces the diff
  for the Lite variant. Runs after Finding #1 lands (since some cuts depend on Lite scope
  around atomic companion files, incidental work routing, etc.).

**Resolution:** Variant over conditional. Minimal cuts. Underlying loop identical across modes.

**Migrated to plan doc:** *pending*

---

### Finding 6 — Strategy applicability mapping for Lite · 🟡

**Original:** OQ7 — no concrete per-strategy inclusion/exclusion list. Needed as input to content
audit.

**User position (2026-04-10):** Static-docs consistency work, should be later in sequencing (not
deferred). Similar priority to the docs site pass — mechanical elements (workflows, hooks, CLI
innards) matter more for getting things watertight first.

**Outstanding analysis:**

- Walk `strategy-index.md` — per strategy, classify: **applies** / **partially applies**
  (which sections) / **does not apply** / **needs mode-aware rewrite**.
- Likely applies in Lite: core-philosophy, configurability-architecture, file-classification,
  session-operations, task-list-formatting, quality-gates.
- Likely does NOT apply in Lite: work-organization (branching model depends on lifecycle),
  planning-module (arc-in-git only anyway).
- Uncertain: work-planning (planning pipeline concept doesn't apply, but PRD conventions do —
  partial), team-coordination (if Lite always forces solo, does not apply), adr-methodology
  (applies universally? or Full-only?).
- Feeds content audit scope sizing.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 7 — Guardrail firing mechanism · ⚪

**Original:** Plan says guardrails live "in session-init" and "in process-task-loop" but doesn't
specify how they read thresholds, where thresholds are stored, or what triggers the nudge prose.

**User position (2026-04-10):** Wary of nagging. "Go light." Value exists but needs focused
analysis, orthogonal to most other concerns. Park but don't dismiss — "if they're hitting walls
that Full ARC would solve, they should know."

**Outstanding analysis (deferred to dedicated session):**

- Dedicated guardrail evaluation pass — thresholds, firing cadence, nudge vocabulary, signal
  specificity, false-positive management.
- Storage: config-file keys vs hardcoded defaults vs per-project override.
- Firing point: session-init orientation, process-task-loop, or both.
- Relationship to `/arc-status` skill — could guardrails live inside `/arc-status` and only fire
  on explicit invocation?

**Parking note:** Orthogonal to mode architecture decisions. Can resolve in parallel or even
post-PRD without blocking the rest of the plan. Review before PRD lock-in to confirm it doesn't
impose new architectural requirements.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 8 — Recipe architecture for mode-conditional installation · 🟡

**Original:** Verified against `packages/arc-framework/init-recipe.json` and `src/lib/types.ts`:
`RecipeCondition` only supports `include_files` (additive). The current recipe lists all
work-unit-lifecycle workflows unconditionally. Lite needs to exclude ~15 files + possibly swap
2-3 templates. Plan's claim that "CLI recipe already supports mode-conditional file installation"
is false in the direction Lite needs. Four candidate approaches:

1. **Invert the baseline** — make Lite the unconditional include list, add Full files via
   `install_type == full` condition. Invasive refactor, tests touch this.
2. **Extend the recipe schema** — add `exclude_files` to `RecipeCondition`. Smaller code change
   but affects merge/update/diff logic throughout the manifest module.
3. **Ship two recipes** — `init-recipe-lite.json` + `init-recipe-full.json`, pick after first
   prompt. Simplest schema but introduces recipe duplication risk on future feature adds.
4. **Bucket + gate** — split current `include_files` into baseline + `lifecycle_files`, expose
   `lifecycle_files` under a new condition form.

**User position (2026-04-10):** Whatever's cleanest long term, regardless of effort. Composition
and inverting the baseline sound right, but needs deeper analysis.

**Outstanding analysis (this is Tier 1 — highest leverage):**

- Evaluate each of the four approaches against: implementation effort, future maintenance,
  extensibility to additional modes (Local, future modes), test impact, recipe-file duplication
  risk, clarity for adopters reading the recipe.
- Read `src/lib/manifest/apply.ts`, `merge.ts`, `plan.ts` to understand downstream impact of
  each approach — which integrates most cleanly with the existing update/diff machinery.
- Read `src/lib/template/recipe.ts` condition evaluation — is there already a pattern for
  inversion, or would it be net-new?
- Consider: does the answer here set precedent for future modes (mode axis proliferation)?
- Consider: does this become its own `analysis-*` doc given the depth needed?

**Potential spawn:** This may warrant its own durable analysis file
(`analysis-modes-recipe-architecture.md`) given the depth and breadth. Decide during work.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 9 — `install_config` precision · 🟡

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

### Finding 10 — Initial-setup workflows (OQ15) · 🟡

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

### Finding 11 — Integrate × non-complete WU states · 🟡

**Original:** `integrate-work-unit.md` presumably validates `Status: Complete` before merging.
New states (`Paused`, `Waiting-For`) create cases: refuse integrate? Force resume first?
Auto-transition? Not walked in the plan. `integrate-work-unit.md` needs at least a paragraph of
update that's not in the deliverable list.

**User position (2026-04-10):** Wants explicit handling, wants to avoid churn. "Reactivating a
work unit that was parked pending code review prior to merge/integration is silly and would
waste everyone's time." Needs focused analysis.

**Outstanding analysis:**

- Walk state × integrate matrix:
    - `In Progress` → integrate: standard path.
    - `Paused` → integrate: probably refuse? "Resume first, then integrate" — but what if user
      knows it's done?
    - `Waiting-For Review` → integrate: this is exactly the natural transition (review lands,
      integrate). Should probably allow directly without requiring resume-then-integrate churn.
    - `Waiting-For Approval` / `Delivery` / `Decision` / `Other` → integrate: depends on what's
      waiting. If the waiting-for item is the last blocker, integrate is the correct next step.
    - `Complete` → integrate: standard path.
- Proposal shape: integrate allows `In Progress`, `Waiting-For {any}`, `Complete`. Refuses
  `Paused` with a "resume first" error. Or: allows all non-`Paused` with a prompt confirming
  the integrator understands the state.
- Does `/arc-shift` or `integrate-work-unit` own the state transition on merge? (Integrate
  probably sets Status → Complete as a side effect.)
- Does the Waiting-For category itself imply the integration readiness? E.g., `Waiting-For
  Review` → when review lands, integrator knows to proceed; `Waiting-For Approval` → approval
  gates integrate explicitly; etc.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 12 — Shift-with-activation coordination · 🟢

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

### Finding 13 — Finding C (pause pointer fields) formalization · 🟢

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

### Finding 14 — Full → Lite downgrade with history · 🟢

**Original:** Plan says "only possible when a single WU is active" but doesn't address archived
WUs, backlog directory, PROJECT-STATUS, ROADMAP when collapsing to Lite. Delete? Preserve
orphaned? Migrate?

**User position (2026-04-10):** Full → Lite is nice-to-have, not a hard requirement. Lite → Full
*has* to be supported. Full → Lite preferred out-of-the-gate if reasonable; drop if too tricky.
On the history question: lean toward "framework now ignores these files, user is advised via
clear CLI prompt, and it's their call." Precedent: existing CLI orphan-file handling during
update flow.

**Proposed shape (pending confirmation):** On Full → Lite reconfigure, CLI:

1. Detects orphaned files (backlog/, archived WUs, PROJECT-STATUS, ROADMAP, etc.).
2. Reports them clearly: "These files exist but Lite mode does not manage them: {list}."
3. Prompts: keep in place (ignored), delete, or cancel reconfigure.
4. Proceeds based on user choice. No automatic cleanup without confirmation.

**Outstanding analysis:**

- Read existing `commands/reconfigure.ts` + `update.ts` orphan-handling to confirm precedent
  shape.
- Enumerate orphan categories (directories, tracked files, templates) that differ Full → Lite.
- Define the "reasonable" boundary — if implementation complexity on Full → Lite turns out
  material, descope to "Lite → Full only" with a clear error on the reverse path.

**Resolution:** Full → Lite supported if reasonable; shape is "detect orphans, inform user,
defer to user's choice." Descope only if implementation proves material.

**Migrated to plan doc:** *pending*

---

### Finding 15 — Backing store sync protocol · 🟢

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

### Finding 16 — Project ID for zero-commit repos · 🟡

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

### Finding 17 — Lite framing and graduation expectations · 🟡

**Origin (2026-04-10):** Raised during Finding #1 step-through. User concern: users may try to
fit longer projects into Lite and then blame ARC for not working well when the actual issue is
they're using the wrong mode. Framing needs to make Lite's bounded-effort-only nature
unmistakable at first contact, and needs to make the graduation signal visible *before* the
project gets painful, not after.

**User position (2026-04-10):** "This means one evolving task list, and if it gets long, that's
a signal to graduate to full ARC." Noted as a broader concern for the WU (presentation/docs)
than the immediate pre-PRD design focus, but crucial — captured to avoid losing it.

**Touchpoints that need coordinated framing:**

- `arc init` Lite mode selection prompt — wording sets expectations up front
- Lite `AGENT-BRIEFING.ARC.md` (if a Lite variant exists) — agent's first-session framing
- Lite `README.md` if Lite ships one — user-facing first impression
- Lite PRD template Introduction guidance — reinforces "bounded effort" framing at plan time
- Lite task list template header/overview — reinforces at task time
- Documentation / docs site page for Lite — long-form explanation of bounded nature and
  graduation path
- Graduation nudges from Finding #7 guardrails — enforcement mechanism for the framing promise

**Relationship to Finding #7 (guardrails):** Framing is upstream communication; guardrails are
the downstream enforcement mechanism. Clear framing → guardrails fire less often and feel like
confirmation rather than nagging. Weak framing → guardrails do the heavy lifting and feel naggy.

**Outstanding analysis:**

- Enumerate all user-facing surfaces where Lite first presents (CLI prompts, docs, templates,
  agent briefings).
- Define the consistent framing message: "Lite is for projects you can hold in one task list
  and one scope brief. If your project outgrows that, ARC will tell you — graduate to Full."
- Audit existing Full-ARC framing language in the same surfaces to identify coordination needs.
- Coordinate with Finding #7 guardrail analysis so framing expectations and guardrail firing
  are consistent.

**Scope note:** This is implementation-phase work (content + UX), not pre-PRD architecture.
Should be captured in the PRD's Requirements section as a cross-cutting deliverable. Does not
gate formalization readiness.

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

### A2 — Unsourced "85-90% no lifecycle dependency" statistic · 🟢

**Finding:** Plan § Core Boundary Hypothesis attributes "85-90% of the framework has zero
dependencies on work unit lifecycle workflows" to `analysis-conditional-content-architecture.md`.
Not in the analysis doc. The analysis gives concrete counts (15-25 new conditionals, 4-8 template
`arc:if` blocks, 1-2 recipe conditions) but no percentage. The figure appears manufactured.

**Resolution:** Drop the 85-90% figure. Replace with the analysis's actual counts, or reframe as
"the analysis confirms work unit lifecycle workflows can be excluded entirely via file exclusion,
avoiding dozens of in-prose conditionals." Accurate, sourced, no fabricated number.

**Migrated to plan doc:** *pending*

---

### A3 — "Recipe already supports mode-conditional file installation" · 🟢

**Finding:** Plan § Configuration Identity: "The CLI recipe already supports mode-conditional
file installation." False in the direction Lite needs — recipe only supports additive
`include_files`. See Finding #8 for the architectural follow-up.

**Resolution:** Correct the plan claim. Replace with: "The recipe will need extension to support
mode-conditional file installation (see [recipe architecture] decision)." Link to Finding #8's
eventual resolution.

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

**Resolved by Finding 13.** In scope for modes WU.

---

### B3 — Full → Lite downgrade scope · 🟢

**Resolved by Finding 14.** Supported if reasonable; descope only if implementation proves
material.

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

**Finding:** Two missing scenarios: integrate-work-unit on a paused/waiting-for WU (Finding #11,
tracked), and shift-with-activation end-to-end (Finding #12, tracked).

**Resolution:** Covered by Findings #11 and #12.

### R6 — Resolve OQ15 (initial-setup workflows) · 🟡

Same as Finding #10. Tracking there.

### R7 — Backing store sync protocol paragraph · 🟡

Same as Finding #15. Tracking there.

### R8 — Zero-commit Local init · 🟡

Same as Finding #16. Tracking there.

---

## Work log

*Append dated entries as findings resolve. Each entry lists: finding IDs touched, what was
decided, what migrated into `plan-arc-modes.md`, what's next.*

**2026-04-10 — initial population**

Findings pre-populated from the original `/arc-plan` audit synthesis plus the user's first-pass
responses. Tier sequencing established. No findings migrated yet. Next: deep-dive on Finding #1
(Lite PRD functional requirements).

**2026-04-10 — Finding #1 deep-dive**

Conducted first-pass analysis on Finding #1 (Lite PRD functional requirements). Enumerated ten
purposes the Full PRD serves, tested each against Lite's single-bounded-effort context, walked
`template-prd.md` and `1_create-prd.md` section/step-by-step. Eight of ten purposes survive in
Lite; cuts concentrate at `Type:` field, dependency-tracking header, and (per user decision)
Document History section. Workflow is ~90% mode-neutral with mode-specific content at the
edges — unified create-prd with mode conditionals adopted as the shape. Five sub-questions
resolved per user leans plus one user override (Document History cut entirely, not simplified).

Findings updated:

- **#1** 🟡 → 🟢 Resolved. Full resolution captured; pending migration to plan doc.
- **#3** 🟡 → 🟢 Resolved. Success Criteria linkage confirmed; ship step protocol defined;
  detail-design items remain but don't block formalization.

New findings added:

- **#17** Lite framing and graduation expectations. Raised during step-through as a
  cross-cutting concern that should be captured in the PRD's Requirements but doesn't gate
  formalization. Status 🟡.

Cascades noted (informational, no status change): Findings #2, #4, #6, #8, #10, and A4 —
cross-references added in Finding #1's Cascades section to inform analysis direction when
those findings come up.

**Next:** Decision point — migrate Findings #1 and #3 into `plan-arc-modes.md` now, or
continue to the next Tier 1 finding (#8 recipe architecture) and batch migrations later.
