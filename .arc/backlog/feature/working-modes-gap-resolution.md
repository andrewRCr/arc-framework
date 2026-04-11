# Working: Modes Gap Resolution

**Purpose:** Working doc supporting `plan-arc-modes.md`. Tracks gaps surfaced in the pre-PRD
audit (2026-04-10), captures analysis as it lands, and drains resolved findings into the plan
doc. Not a plan doc itself — supports one. Each finding is numbered to match the original audit
synthesis for traceability.

**Origin session:** 2026-04-10. Initial population drawn from that session's `/arc-plan`
synthesis and the user's first-pass responses.

**Lifecycle:** Tracked (committed to git) for traceability, unlike `temp-*` working files which
are gitignored. **The plan doc subsumes this one.** When a finding reaches 🟢 Resolved and is
migrated, its content lands in `plan-arc-modes.md` at full detail — this working doc shrinks
accordingly (resolved findings are removed entirely, not marked as absorbed). Partial findings
(🟡/🔴/⚪) stay until they reach 🟢 and are themselves migrated. When the last finding drains,
this file is deleted — its reasoning lives in the plan doc and commit history.

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

**Tier 1 — gates most downstream:**

- *All Tier 1 findings resolved and migrated (2026-04-10):* #1 (Lite PRD), #8 (recipe
  architecture). See [`plan-arc-modes.md`][plan-doc] § The Lite PRD and § Installation Type
  Recipe Mechanism.

**Tier 2 — independent, manageable:**

- *#13 (Integrate × non-complete states) resolved and migrated 2026-04-10. See
  [`plan-arc-modes.md`][plan-doc] § Integration Interaction with Shift States.*
- *#16 (Full → Lite downgrade) resolved and migrated 2026-04-11. See
  [`plan-arc-modes.md`][plan-doc] § Graduation / Downgrade Paths. Scope composition: key
  renames `pm.mode` → `pm.layer` and `team.mode` → `team.enabled` absorbed into ARCd Rebrand
  WU; `arc mode switch` CLI + `supplemental/switch-mode.md` workflow landing both specified.*
- **#7** — Guardrails. Orthogonal, can run in parallel. **Currently ⚪ parked — out of scope
  for pre-PRD.**
- *#3 (Ship step) resolved and migrated with the Tier 1 batch.*

**Tier 3 — detail once Tier 1 lands:**

- **#2, #4, #5, #6** — All gate on #1 (now resolved and migrated).
- *#9 (Conditional prompts orchestration) resolved and migrated 2026-04-10. See
  [`plan-arc-modes.md`][plan-doc] § Prompt Orchestration and Recipe Authority.*
- *#10 (Lite `arc-config.yml` reduction mechanism) resolved and migrated 2026-04-10. See
  [`plan-arc-modes.md`][plan-doc] § Lite Config Template Mechanism.*
- **#12, R6** (OQ15 initial-setup workflows) — gate on #8 (now resolved and migrated).

**Tier 4 — validation + inventory:**

- **#11** — install_config precision. Quick now that #8 is migrated.
- **A1, A4** — Remaining unvalidated assumptions. Correct directly in the plan doc. (A2 and
  A3 resolved and migrated in the 2026-04-10 Tier 1 batch.)
- **R4** — Consolidated deliverable inventory. Once Tier 1–3 decisions have landed.

**Parking lot (revisit when touched, not blocking formalization):** Lite + external PM (plan
OQ10), guardrail threshold numbers (OQ8), waiting-for taxonomy finalization (OQ12), long-pause
staleness threshold (OQ13), `/arc-status` drift detection threshold (OQ14), multi-paused
limit policy (OQ11).

---

## Masked Design Decisions

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

### Finding 19 — Lite framing and graduation expectations · 🟡

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

- **#19** Lite framing and graduation expectations. Raised during step-through as a
  cross-cutting concern that should be captured in the PRD's Requirements but doesn't gate
  formalization. Status 🟡. (Originally numbered #17 at time of writing; renumbered to #19
  on 2026-04-10 when new findings #9 and #10 were inserted after Finding #8.)

Cascades noted (informational, no status change): Findings #2, #4, #6, #8, #12, and A4 —
cross-references added in Finding #1's Cascades section to inform analysis direction when
those findings come up.

**Next:** Decision point — migrate Findings #1 and #3 into `plan-arc-modes.md` now, or
continue to the next Tier 1 finding (#8 recipe architecture) and batch migrations later.

**2026-04-10 — Finding #8 current-state bridge**

Read the recipe + manifest pipeline source to produce a factual landscape for Finding #8
(recipe architecture). Deliberately no evaluation of the four candidate approaches — that's
reserved for the next session's focused synthesis work. Intent: give the evaluation a
concrete foundation so it doesn't spend its first half re-deriving how the code works.

Files read: `lib/template/recipe.ts`, `lib/template/render.ts`, `lib/manifest/plan.ts`,
`lib/manifest/update-files.ts`, `lib/manifest/merge.ts`, relevant portions of
`lib/classification.ts` (`resolveFileList`), `commands/init.ts` (manifest construction),
`lib/manifest/apply.ts` (removals path).

Key facts established and captured in Finding #8's new **Current state** subsection:

- `resolveFileList()` is the single file-resolution site. Strictly additive.
- Recipe schema has no `exclude_files` or similar; only `include_files` per condition.
- `evaluateCondition()` operator set is `==` and `includes`; easy to extend.
- Template `arc:if` is a separate mechanism (`==`, `!=`) for in-content conditionals.
- Three consumers duplicate condition iteration (init, update, reconfigure) — code-dup risk
  for any schema change.
- `ARC_IN_GIT_CONDITION` is already special-cased for layer classification — precedent.
- `InstallConfig` has four fields; adding `install_type` is a schema-version bump common to
  all four approaches.
- Removals work today via `buildChangePlan()` + `apply.ts`; what changes between approaches
  is *how* files end up on the removal list, not *whether* removal is possible.
- Pristine store reconstruction during update depends on stored `install_config` — new
  field needs to flow through the full update lifecycle.

Constraint table produced comparing all four approaches on schema impact, call-site impact,
operator precedence concerns, and future extensibility. Common constraints (InstallConfig
field, schema version bump) factored out — differentiation lives in the recipe-schema +
`resolveFileList()` layer.

**Not yet read** (flagged for next session if relevant): test coverage of recipe/manifest
paths, `fileLayer()` function body, `reconfigure.ts` install_config-change handling.

**Next session entry point:** Four-approach evaluation against the constraint table. Decide
early whether the evaluation deserves an `analysis-*` durable doc or stays in-line in the
working doc.

**2026-04-10 — Finding #8 evaluation + resolution (synthesis session)**

Evaluated the four candidate approaches laid out in Finding #8's "Current state" subsection
against the user's "cleanest long-term" criterion. Approaches #3 (two recipes) and #4 (bucket +
gate) ruled out on scaling grounds. Approach #2 (`exclude_files` schema extension) ruled out on
additive-model-fit grounds — introduces subtractive semantics for a single-axis use case with
no defensible operator precedence answer. Approach #1 adopted with refinement to Approach 1b
(symmetric additive) — Full and Lite as peer extensions on a shared unconditional baseline,
matching the existing `pm.mode == arc-in-git` condition pattern rather than privileging either
mode as "the baseline."

Stress-test trace-throughs run against multi-axis composition, update pipeline, pristine
reconstruction, reconfigure in both directions, and legacy manifest migration. All held. The
one composition that looked like it might surface an open question (Lite × `pm.mode:
arc-in-git`) turned out to already be decided in `plan-arc-modes.md` — Lite skips `pm.mode`
prompting entirely, so the condition never fires. Verification caught stale session
understanding and corrected it in place before the decision was committed.

Two adjacent concerns surfaced during evaluation, captured as new findings rather than bundled
under #8:

- **New #9 — Conditional prompts orchestration.** Lite skips `pm.mode` and `team.mode` prompts
  per plan doc, but the current recipe `prompts` array has no conditionality mechanism.
  Surfaced because Finding #8's Approach 1b resolves file inclusion but not prompt gating.
- **New #10 — Lite `arc-config.yml` reduction mechanism.** Plan doc says Lite ships a reduced
  config template; current `arc-config.yml` is a plain `.yml` file in the unconditional
  baseline, so render-time `arc:if` directives don't apply. Needs its own mechanism decision.

Inserting these two new findings after Finding #8 required renumbering old Findings #9–#17 to
new #11–#19. Cross-references updated throughout the document (Sequencing section, Finding #1
Cascades, Finding #8 body references to old #14 → new #16, B2/B3 resolutions, R5/R6/R7/R8
pointers, and the prior work log entry's cross-references).

Findings updated:

- **#8** 🟡 → 🟢 Resolved on mechanism. Decision captured in full Resolution subsection with
  evaluation, stress-test trace-throughs, decided items, and explicit feedforward file bucket
  assignments tied to other findings. Only the `work-unit-lifecycle/*` anchor set is locked
  now; remaining bucket assignments wait on Findings #1, #3, #4, #5, #6, and new #10
  resolution. Migration to plan doc pending (batch with #1 and #3).

New findings added:

- **#9** Conditional prompts orchestration. Status 🟡. Tier 3, gates on #8 (now resolved).
- **#10** Lite `arc-config.yml` reduction mechanism. Status 🟡. Tier 3, gates on #8 (now
  resolved).

Renumbered (all +2): old 9→new 11, old 10→12, old 11→13, old 12→14, old 13→15, old 14→16, old
15→17, old 16→18, old 17→19.

**ADR not created.** The mechanism decision for `install.type` will be formalized as an
Architecture Decision Record during implementation — authored during task execution of the PRD
derived from `plan-arc-modes.md`, not as a pre-PRD artifact. Correct sequencing is working doc
→ plan doc → PRD → task list → ADR authored as a task deliverable. ADR number assigned at
write time, not reserved now.

**Next:** Batch-migrate Findings #1, #3, and #8 into `plan-arc-modes.md` in a consolidated
commit. New findings #9 and #10 continue tracking in this working doc pending their own
resolution. After the batch migration, Tier 1 work is complete and attention moves to Tier 2
(#13 integrate × non-complete, #7 guardrails, #16 downgrade, #3 ship step detail decision).

**2026-04-10 — Tier 1 batch migration into plan doc**

Migrated Findings #1 (Lite PRD), #3 (Lite ship step), and #8 (recipe architecture) into
`plan-arc-modes.md`, plus unvalidated assumptions A2 (fabricated 85-90% statistic) and A3
(false "recipe already supports mode-conditional file installation" claim). A3 was the same
correction as Finding #8's premise, so they folded into a single edit pass.

**Migration shape:** Per user direction, the plan doc subsumes this working doc at full
detail — not decision-record summarization. Full evaluation trails, factual landscapes,
rejected alternatives, stress-test trace-throughs, feedforward bucket assignments, and ADR
deferral notes all landed in the plan doc. Resolved findings were removed from this file
entirely rather than marked ✅ Absorbed; the working doc shrinks to only unresolveds and
partials as findings drain. The ✅ state was removed from the Status legend to reflect this.

**Plan doc landing points:**

- **Finding #1** → new `### The Lite PRD` subsection under `## Mode 1: ARC Lite`
  (functional requirements, template cuts, workflow shape, five SQs, template delivery
  mechanism, cascades). Upstream edits: Enforced Sequence table/Scope paragraph, What
  Changes/Scope artifact paragraph, file-structure diagram (`scope.md` → `prd.md` + `plan-*`
  sibling), cascading `scope brief` → `Lite PRD` sweep across Guardrails, Graduation Paths,
  Quick-Start, Walk-Through: Lite+Local, Graduation Grid, and Role Is a Tracked Concept. Open
  Question 2 marked resolved.
- **Finding #3** → inline rewrite of `### Enforced Sequence` → Ship step paragraph with the
  three-step Success Criteria protocol + detail-design deferrals. Open Question 3 marked
  resolved.
- **Finding #8 + A3** → new `### Installation Type Recipe Mechanism` subsection under
  `## Design Investigations (Pre-PRD)` (peer to Configuration Identity). Carries: the gap
  statement + correction of A3's false claim, full current-state factual landscape, four
  candidate approaches + constraint summary table, rejections (3/4/2 with full reasoning),
  adopted Approach 1b + symmetric-additive refinement + win table vs Approach 2, stress-test
  trace-throughs, decided mechanism + plumbing, anchor file bucket assignments, feedforward
  (pending dependent decisions), not-yet-established items, ADR deferral. Upstream edits:
  Configuration Identity rewritten to drop the false claim and point forward; Mode 1 →
  Configuration and Installation light touch with cross-reference.
- **A2** → inline correction in `## Mode 1: ARC Lite → Core Boundary Hypothesis`
  bullet — replaced "85-90% of the framework has zero dependencies" with the analysis doc's
  actual counts framing (15-25 new conditionals, 4-8 template `arc:if` blocks, 1-2 recipe
  conditions).
- **Resolved Decisions table** (plan doc) — added 13 new rows for the migrated decisions.
- **Open Questions** (plan doc) — OQ2 (Scope artifact design) and OQ3 (Ship step specifics)
  marked resolved with section pointers.
- **pm.mode naming:** new content uses `arc-pm` rather than `arc-in-git` per the ARCd rebrand
  direction (rebrand WU lands before modes WU; unified content sweep will catch pre-rename
  leakage in the surrounding plan doc text).

**Working doc shrinkage:** Removed Finding #1, Finding #3, Finding #8, A2, and A3 sections
entirely. Updated Sequencing section (Tier 1 empty, Tier 2 notes #3 resolved, Tier 4 reduced
to A1 and A4). Updated intro and Status legend to reflect the removal-on-migration lifecycle.
Renumbering was NOT needed — no new findings inserted, just removals.

**Not yet migrated in this pass** (intentional): Findings #2, #4, #5, #6, #7, #9, #10, #11,
and \#12 through \#19, plus A1, A4, B1, B4, and R1–R8. These remain in flight (🟡/🔴/⚪) or
have their own pending work.

**Next:** Continue draining findings into the plan doc. Immediate next candidates are
Findings #9 (conditional prompts orchestration) and #10 (Lite `arc-config.yml` reduction
mechanism) — both were surfaced during Finding #8's evaluation and depend on its now-migrated
mechanism, so they can be resolved now. After #9 and #10, move to Tier 2 (Findings #13, #7,
\#16) and then Tier 3 (Findings #2, #4, #5, #6, #12).

**2026-04-10 — Finding #9 resolution + migration into plan doc**

Resolved Finding #9 (Conditional prompts orchestration) and migrated it directly into
`plan-arc-modes.md` without an intermediate write to this working doc — the resolution was
crisp enough to skip the draft-in-working-doc step. The session's work landed as a single
batch that covered code reads, design reframe, decision, and migration.

**The reframe.** The initial lean (carried from Finding #8's session) was "add a `show_when`
field to `RecipePrompt` and iterate it in the prompt loop." A pre-migration code read of
`src/prompts/init-prompts.ts`, `src/prompts/reconfigure-prompts.ts`, `src/prompts/join-prompts.ts`,
`src/prompts/non-interactive.ts`, `src/lib/config.ts`, and `src/lib/template/recipe.ts` revealed
that **`recipe.prompts` is validated but never consumed.** `validateRecipe()` is the only code
in the CLI that reads the field. The hand-rolled `runInitPrompts()` duplicates the same four
prompts as explicit `@clack/prompts` calls with richer UX affordances (note preambles,
autocomplete labels/hints, computed defaults). Six other sites (`runReconfigurePrompts`,
`runJoinPrompts`, `buildNonInteractivePrompts`, `buildNonInteractiveReconfigurePrompts`,
`buildConfigMap`, `buildConfigKeyOverrides`, plus `buildTokenMap`) independently hardcode the
same prompt/config knowledge. Finding #9 therefore collapsed into a broader question: what
authority does `recipe.prompts` hold, and what authority should it hold?

**Three framings evaluated** (documented in full in plan doc § Prompt Orchestration and Recipe
Authority):

- **Framing A — hand-coded gating, recipe stays metadata.** Rejected as no DRY progress; every
  future mode-axis prompt requires touching seven sites again.
- **Framing B — full data-driven prompt loop.** Rejected as speculative schema bloat; the
  schema growth required to express multi-line note preambles, option labels/hints, computed
  defaults, current-value-as-default, conditional warnings, and non-interactive flag
  conventions is premature abstraction for affordances we don't yet know future prompts will
  need.
- **Framing C — narrow recipe authority.** Adopted. Recipe owns prompt identity,
  `config_key` / `token` mapping, and gating (`show_when`). Hand-rolled code keeps UX.

**Framing C mechanism** (captured in plan doc): schema delta is one optional `show_when` field
on `RecipePrompt` using the existing `CONDITION_PATTERN` grammar; a new `shouldShowPrompt()`
helper alongside `evaluateCondition()` in `lib/template/recipe.ts`; each hand-rolled loop
consults the helper before each gated prompt; `buildConfigMap` / `buildConfigKeyOverrides` /
`buildTokenMap` refactor to iterate `recipe.prompts` for their mapping source. `install.type`
is added as a new recipe prompt at position 1 (between `project_name` and `tools`) with
default `"full"` for back-compat. Canonical flag `--install-type`, shorthand `--lite` / `--full`.

**Drift mitigation** (user-confirmed in scope): unit tests comparing recipe prompt IDs against
exported `INIT_PROMPT_IDS` / `RECONFIGURE_PROMPT_IDS` constants maintained alongside the
hand-rolled loops. Rejected a runtime `validateRecipe()` check as a layering violation (or
duplication re-introduction).

**Reconfigure boundary:** `arc init --reconfigure` does not mutate `install.type`. Lite↔Full
transition is a distinct CLI surface — Finding #16 for downgrade, plan-doc § Graduation /
Downgrade Paths for upgrade. Framing C's helper and refactor are reusable there.

**ADR:** Deferred to PRD implementation per the established ADR sequencing discipline.
Likely combined with Finding #8's mechanism ADR under a shared "recipe as authoritative
install-time specification" umbrella; PRD decides single vs combined based on writing economy.

**Plan doc landing points:**

- **Finding #9** → new `### Prompt Orchestration and Recipe Authority` subsection under
  `## Design Investigations (Pre-PRD)`, immediately after `### Installation Type Recipe
  Mechanism` (sibling placement to Finding #8 because both are mechanism-depth analyses of
  how `install.type` drives downstream effects). Structure mirrors Finding #8: gap + current
  state factual landscape (leaning on Finding #8 for shared schema description) + three
  framings with rejection reasoning + adopted Framing C at full detail + schema delta + helper
  contract + wire points + install.type prompt addition + gating declarations table + drift
  mitigation + reconfigure boundary + feedforward + not-yet-established + ADR deferral.
- **Cascading sweeps** (three spots):
    - § Configuration Identity "Lite gates downstream prompts" bullet — added pointer to new
      subsection.
    - § Configuration and Installation "PM mode gating" paragraph — added cross-reference.
    - § Init Flow Implications — added cross-reference plus new `--install-type` canonical
      flag entry in the flag list (keeping `--lite` / `--full` as shorthand aliases).
- **Resolved Decisions table** — added 12 new rows covering: recipe authority scope
  (Framing C), `show_when` field, `shouldShowPrompt()` helper, `install.type` prompt
  position, default, canonical flag, gated-prompt set, skipped-prompt defaults,
  `buildConfigMap` / `buildConfigKeyOverrides` / `buildTokenMap` refactor, drift mitigation
  unit test, reconfigure boundary, ADR deferral for Framing C.
- **Open Questions** — no entries to resolve (working-doc Finding #9 didn't have a parallel
  OQ in the plan doc).

**Working doc shrinkage:** Removed Finding #9 section entirely (~62 lines). Updated
Sequencing § Tier 3 to mark #9 resolved and migrated. Tier 3 now carries only #2, #4, #5, #6,
\#10, and #12/R6 pending resolution.

**Not yet migrated in this pass** (intentional): Finding #10 is deliberately held for its own
resolution session since its mechanism space (render-pipeline extension vs two-file fallback)
is distinct from Finding #9's prompt-authority question. Ambitious-vs-conservative call made
in favor of conservative scope — one finding per session gives each its own synthesis pass
without cross-contamination.

**Next:** Finding #10 (Lite `arc-config.yml` reduction mechanism) is the immediate next
candidate. Entry point: read `src/lib/template/render.ts` to assess whether extending the
`.template.md` matching gate to `.template.*` is one-line or fraught; walk current
`arc-config.yml` section-by-section to identify which blocks are `install.type`-gated; decide
between Approach 2 (`arc-config.template.yml` + render pipeline extension) and Approach 1
(two-file fallback via Finding #8's mechanism). Framing C's "recipe as authoritative" direction
composes with Approach 2 if render pipeline extension is viable.

**2026-04-10 — Finding #10 resolved and migrated**

Resolved Finding #10 (Lite `arc-config.yml` reduction mechanism) and migrated directly into
`plan-arc-modes.md` as a new `### Lite Config Template Mechanism` subsection under
`## Design Investigations (Pre-PRD)`. Same direct-to-plan-doc pattern as Finding #9 — no
intermediate working-doc draft because the resolution was crisp from analysis and the
entry-point code read surfaced a reframe that collapsed most of the outstanding checklist.

**Key reframe from the code-read pass.** The session's lean (from the prior handoff) treated
"generalize `.template.md` matching to `.template.*`" as the Approach 2 blocker question. The
read of `lib/classification.ts:40-42` showed the gate is ALREADY extension-agnostic —
`needsRendering()` matches `/\.template\.[^/]+$/`. Reading `lib/template/render.ts` confirmed
`renderConditionals()` has zero markdown assumptions (line split, HTML-comment directives,
blank-line collapse — all YAML-safe). **No render pipeline extension is required.** This
reframe dropped Approach 2's cost to near-zero and eliminated the case for Approach 1 as a
fallback.

**Remaining risk landscape** after the reframe, evaluated in order:

1. **Composition-order behavior change (primary risk).** Today `arc-config.yml` bypasses
   `renderTokens()` and `renderConditionals()` entirely — only `renderConfigOverrides()` runs.
   Approach 2 introduces the two skipped passes. Grep confirmed `arc-config.yml` contains zero
   `{{...}}` and zero `<!-- ... -->` strings today, so both new passes are no-ops against
   current content. Risk near-zero for greenfield installs. For the update path, the existing
   three-way merge handles adopter customizations via the Configurable-file pipeline
   (`applyChangePlan()` in `lib/manifest/apply.ts`), which rebuilds pristine from the new
   template against stored `install_config`. Standard Configurable-file lifecycle; no
   migration cost.
2. **Manifest rename impact.** Manifest entries are keyed by **output path**
   (`system/arc-config.yml`), which is stable across the template source rename. No schema
   bump, no migration function. Trace through `buildManifestFiles()` confirmed the key path.
3. **Gated section enumeration.** Walked `arc-config.yml` end-to-end. Gated set: `pm.mode`
   section + `team.mode` section — two contiguous blocks. Everything else (branch, commit,
   merge, hooks, review, platform, user) is universal. `hooks.contributor_protected_paths`
   stays universal because the regex default harmlessly no-ops against absent paths.
4. **Finding #1 composition check.** Finding #1's § Template delivery mechanism left the
   single-file-with-`arc:if`-vs-two-file-variant choice open as an implementation-phase
   detail. Finding #10's adoption of Approach 2 closes Finding #1's open sub-decision by
   force of consistency: same render pipeline, same `arc:if` mechanism, no split of "how
   template content is mode-gated" across two mechanisms.

**Decision adopted:** Approach 2 — rename `system/arc-config.yml` → `system/arc-config.template.yml`
and gate the two Full-only sections with `<!-- arc:if install.type == full -->` directives.
Composition order: `renderConfigOverrides(renderConditionals(renderTokens(raw, tokens), config), overrides)`.
Approaches 1 (two files), 3 (CLI-generated), and 4 (fragment + stitching) rejected with
reasoning captured in the plan doc.

**Call-site changes:** `renderTemplate()` in `lib/manifest/apply.ts` and its inline mirror in
`commands/init.ts` fall through to the normal `needsRendering()` branch and apply
`renderConfigOverrides()` as a post-pass. One conditional restructured, no new code paths.
`ARC_CONFIG_TEMPLATE_PATH` constant in `lib/constants.ts:11` flips from `"system/arc-config.yml"`
to `"system/arc-config.template.yml"`. `CONFIGURABLE_FILES` set entry in
`lib/classification.ts:74` flips to match.

**Plan doc landing points:**

- **Finding #10** → new `### Lite Config Template Mechanism` subsection under `## Design
  Investigations (Pre-PRD)`, immediately after `### Prompt Orchestration and Recipe Authority`
  (sibling placement to Findings #8 and #9 — three mechanism-depth analyses of how
  `install.type` drives downstream effects).
- **Cascading sweeps** (four spots):
    - § Configuration Identity "Lite ships a reduced `arc-config.yml`" bullet — updated to
      point at the new subsection instead of referencing the working-doc finding as "in flight."
    - § Installation Type Recipe Mechanism § Feedforward "`arc-config.yml` treatment" bullet
      — resolved via the new subsection, no longer pending.
    - § The Lite PRD § Template delivery mechanism — converted from pending single-file-vs-
      variant decision to "landed as single-file-with-`arc:if` for consistency with
      `arc-config.template.yml`."
    - § Configuration and Installation § Lite config template passage — updated mechanism
      description to reference the new subsection.
    - § Configurability Architecture Cleanup § Mode-Aware Config Template Mechanism — added
      cross-reference at the top clarifying that the "layer" framing is conceptual and the
      mechanism is flat per-axis `arc:if` directives.
- **Resolved Decisions table** — added 10 new rows covering: mechanism choice, render
  pipeline already extension-agnostic reframe, composition order, call-site restructuring
  pattern, gated section set, `ARC_CONFIG_TEMPLATE_PATH` rename, manifest lifecycle during
  rename, Approach 1 rejection reasoning, Finding #1 closure via consistency, ADR deferral.
- **Open Questions** — no entries to resolve (working-doc Finding #10 didn't have a parallel
  OQ in the plan doc).

**Working doc shrinkage:** Removed Finding #10 section entirely (~62 lines). Updated
Sequencing § Tier 3 to mark #10 resolved and migrated. Tier 3 now carries only #2, #4, #5,
\#6, and #12/R6 pending resolution.

**Tier 1 fully drained.** All three Tier 1 findings plus the two Tier 3 adjacent-concern
companions (#9, #10) are now resolved and migrated. Attention moves to Tier 2 smalls (#13,
\#7, #16).

**Next:** Tier 2 smalls. **#13** (Integrate × non-complete WU states) is a state-machine
sketch with small scope. **#7** (Guardrail firing mechanism) is currently ⚪ parked; can
resume in parallel or later. **#16** (Full → Lite downgrade) is mostly 🟢 and just needs a
confirmation pass — Framing C from Finding #9 provides the reusable helper spine for whatever
CLI surface it lands on, and Finding #10's rename + composition pattern composes cleanly with
a downgrade re-render.

### 2026-04-10 — Finding #13 resolved and migrated (first Tier 2 resolution)

**Resolution:** The user-identified anti-pattern driving Finding #13 — "reactivating a work
unit that was parked pending code review prior to merge is silly" — shaped the whole
analysis. The resolution centers on the semantic that **invocation is the assertion**: when a
developer runs integrate on a WU in `Waiting-For Review`, they are stating "the review landed"
and the workflow does not need to validate what was waited for.

**Key reframe from the code read:** The handoff lean claimed `integrate-work-unit.md`
"presumably validates `Status: Complete` before merging." A read of the workflow showed this
is not the case. Step 1 ("Verify Work Completion") is agent-enforced prose whose actual
checks are "all subtasks `[x]`," "Success Criteria checked," and "quality gates passed." The
Status header line — `[ ] Task list header **Status:** updated to Complete` — is phrased as
an imperative, not a gate, and the transition itself is a silent side effect of Step 2's
`clean-work-unit.md` Mode 2 run (which sets `Status: Complete` unconditionally). **There is
no existing validation layer refusing non-Complete states.** This collapsed Finding #13 from
"add a validation layer" to "surface the state transition explicitly so it can accept the
shift-lifecycle vocabulary." The resolution is primarily a widening of the entry contract,
not a new mechanism. Third handoff lean in a row partially overturned by a code read —
pattern is now consistent enough to bake "verify premise via targeted read first" into every
future handoff lean for workflow-shape questions.

**Adopted acceptance matrix:**

- `In Progress` → accept (standard happy path)
- `Complete` → accept (idempotent; e.g., re-run after crash)
- `Waiting-For Review/Approval/Delivery/Decision/Other` → accept, transition to `Complete`
- `Paused` → warn and prompt for confirmation inline (default no); on confirm, proceed
  through standard path

**Key semantic load-bearers documented in the resolution:**

1. **Invocation is the assertion.** The workflow's job is to transition state and proceed;
   judging whether the wait is actually over is the user's responsibility and is discharged
   by the invocation itself. Holds symmetrically across all `Waiting-For` categories
   including `Other` (freeform reason carries whatever the user knew at pause time).
2. **`Paused` ≠ `Waiting-For`.** Per Finding B's vocabulary split, `Paused` specifically
   means "dev is next mover." A `Paused` WU at integrate time is semantically suspicious
   (stale state, or work isn't actually done). Warn-and-confirm is the right ergonomic —
   not a hard refuse with `--force`, which would push the edge case into CLI surface the
   user has to discover. Inline prompt matches ARC's established warn-and-confirm idiom
   (parallel to uncommitted-work handling at pause time in § Workflow Shape).
3. **Integrate owns the terminal transition.** Resolution of the working doc's "does
   `/arc-shift` or `integrate-work-unit` own the state transition on merge" open question:
   integrate owns it. `/arc-shift` owns mid-flight transitions (pause/resume/rotate) only
   and never writes `Status: Complete`. Locality: the workflow that finalizes the WU owns
   the final state write. Already implicitly true today via `clean-work-unit.md` Mode 2 —
   the resolution does not move the transition, only surfaces the entry-state check
   explicitly upstream.

**Plan doc landing points:**

- **Finding #13** → new `### Integration Interaction with Shift States` subsection under
  `## Shift Lifecycle`, placed between `### Skill Shape` (`/arc-status`) and `### Why This
  Lives in Its Own Cross-Cutting Section`. Groups with the other workflow-integration
  subsections (Session-Init Integration, Skill Shape) while being last before the
  meta-framing sections. Six internal sub-headings: current workflow reading, acceptance
  matrix, invocation-as-assertion, Paused warn-and-confirm, integrate-owns-terminal-
  transition, feedforward to implementation.
- **Cascading sweeps** — none. Grep pass confirmed no existing content in `plan-arc-modes.md`
  references integrate-work-unit's state handling or the non-complete entry question. Clean
  insertion.
- **Resolved Decisions table** — added 5 new rows covering: entry contract (acceptance
  matrix), invocation-as-assertion semantic, Paused warn-and-confirm ergonomic, terminal
  transition ownership, ADR deferral (not a standalone ADR — composes with shift-lifecycle
  ADR).
- **Open Questions** — no entries to resolve (working-doc Finding #13 didn't have a
  parallel OQ in the plan doc).

**Working doc shrinkage:** Removed Finding #13 section entirely (~35 lines). Updated
Sequencing § Tier 2 to mark #13 resolved and migrated. Updated R5 ("walk missing shift
scenarios") to reflect that #13 is now resolved (R5 still tracks the #14 half). Tier 2 now
carries only #7 (parked) and #16 pending resolution.

**Session velocity:** Smaller than Findings #9 and #10, as expected. The analysis was
mostly in hand from the orientation read of `integrate-work-unit.md` + the existing working-
doc outstanding-analysis section + Finding B's already-decided vocabulary. Direct-to-plan-
doc migration path (same as #9 and #10) — no intermediate working-doc draft. Roughly 45
minutes for analysis + orientation + code read; migration itself ~30 minutes. **Fourth
consecutive session using the direct-to-plan-doc pattern** — strongly established as the
default for crisp-from-analysis findings.

**Next:** Tier 2 smalls remaining. **#7** (Guardrail firing mechanism) currently ⚪ parked;
\#16 (Full → Lite downgrade) mostly 🟢 and just needs a confirmation pass. Either is a
reasonable next target. After Tier 2 drains, Tier 3 (#2, #4, #5, #6, #12/R6) becomes the
focus.

### 2026-04-11 — Finding #16 resolved and migrated (Tier 2 drained)

**Resolution:** Full → Lite downgrade supported via a new `arc mode switch --to lite` CLI
command symmetric with `--to full` for the upgrade direction. Shape γ adopted — CLI handles
deterministic mechanics, advisory workflow `supplemental/switch-mode.md` handles
non-deterministic judgment (Cat C2 semantic decay in surviving user content). Three-category
orphan taxonomy (A/B/C) with a C1/C2 split inside Cat C. Entry-state gate refuses on `>1`
active WU; user must shift extras first. Descope guard retained from the working doc but
analysis did not surface material complexity that would trigger it.

**Key reframe from the code read:** The handoff lean pointed at "existing CLI orphan-file
handling during update flow." A read of `commands/reconfigure.ts`, `commands/update.ts`, and
`prompts/removal-prompts.ts` showed the interactive orphan-handling precedent lives
specifically in `reconfigure.ts` (via the injected `resolveRemovals` callback), not in
`update.ts` (which uses classification defaults silently). The `resolveRemovalsInteractive`
two-stage UX — summary + bulk-or-per-file choice with a bulk "Keep all, remove from ARC
tracking only" option — is not just a similar pattern; it's the exact affordance Finding #16
needed for Cat A. **Fourth consecutive session where a targeted code read partially
overturned the handoff lean.** Pattern is now structurally baked into session discipline.

**Also confirmed via code read:** `install.type` / `install_type` does not yet exist in code
(grep across `packages/arc-framework/src` returned zero hits). Finding #16's resolution is a
planning decision for future consumption of Finding #8's mechanism and Finding #10's rename,
not a code change today.

**Composition with prior findings:**

- **Finding #10's boundary holds:** `arc init --reconfigure` does NOT mutate `install.type`.
  Finding #16 inherits this as a hard constraint — `arc mode switch` is a distinct command
  module that reuses the reconfigure pipeline internally without sharing the prompt loop.
- **Finding #8's symmetric-additive mechanism** supplies the `install.type` condition the
  command flips in the manifest.
- **Finding #9's `shouldShowPrompt` spine** is reusable for any pre-switch confirmation
  prompts if needed (current shape doesn't require it, but the spine is there).
- **Finding #13's invocation-as-assertion semantic** generalizes: the entry-state gate is
  the "assertion with pre-condition" variant — invocation carries the assertion, but the
  CLI verifies the pre-condition (single active WU) first.

**Scope composition — cross-cutting naming concern surfaced and absorbed:** Finding #16's
naming analysis surfaced that promoting "mode" to a load-bearing top-level term
(`install_config.install_type` = Lite/Full; Local/Tracked future axis) collides with
pre-existing `pm.mode` and `team.mode` keys at different semantic levels. The collision is
cross-cutting — not Finding #16's concern in isolation, and not a clean fit for the Modes
WU scope either. Resolution: absorbed into the ARCd Rebrand WU (`plan-arcd-rebrand.md`
§ Scope expansion item 4, Implementation Scope item 6). Rebrand is scheduled before Modes WU,
so Modes inherits the clean namespace. Key renames: `pm.mode` → `pm.layer` (matches
existing "Planning Module" vocabulary, differentiates layer-within-ARC from ARC-wide shape)
and `team.mode` → `team.enabled` (natural noun for a bool, drops "mode" entirely). Marginal
scope addition to the rebrand since it's already renaming keys in the same file in the same
editorial pass.

**Plan doc landing points:**

- **Finding #16** → expanded `### Graduation / Downgrade Paths` § Full → Lite from four
  thin bullets to a mechanism-depth subsection with named Category A/B/C sub-paragraphs,
  entry-state gate, CLI + workflow split specification, and pipeline-reuse note.
- **Lite → Full drift fix (Finding #10 cascade):** Plan doc previously said "Mechanically:
  `arc init --reconfigure`" for Lite → Full, which contradicted the Reconfigure boundary
  row Finding #10 had already established. Updated to "`arc mode switch --to full`" with
  the pipeline-reuse explanation. Symmetric with the new downgrade path.
- **Resolved Decisions table** — added 8 new rows: key-rename absorption into rebrand
  (separate row for traceability), Lite↔Full CLI surface, CLI + workflow split (shape γ),
  entry-state gate, orphan taxonomy, workflow landing (`supplemental/switch-mode.md`),
  descope guard. Updated existing Reconfigure boundary row to reflect the new CLI name
  instead of "Finding #16 for downgrade."
- **Scope boundary paragraph** (top of plan doc) — expanded the 2026-04-09 note to mention
  the 2026-04-11 key-rename absorption, so the rebrand dependency is visible at the top of
  the plan doc, not buried in the Resolved Decisions table.
- **Open Questions** — no entries to resolve (Finding #16 did not have a parallel OQ in the
  plan doc; the existing OQ on Lite + `pm.mode: external` is a separate concern).

**Rebrand plan doc landing points:**

- **Status line** — updated review date to 2026-04-11, added note about second scope
  expansion.
- **Scope expansion section** (top of rebrand doc) — added item 4 describing the key
  renames with full motivation, pointing forward to Implementation Scope item 6.
- **Implementation Scope item 6** — expanded from "value rename only" to three-bullet
  "schema renames" covering the 2026-04-09 value rename, the 2026-04-11 `pm.mode` key
  rename, and the 2026-04-11 `team.mode` key rename. Added runner-up naming rejections
  and indicative files-touched list for task generation.

**Workflow landing decision:** `supplemental/switch-mode.md` rather than a new
`mode-lifecycle/` subdirectory. `supplemental/` already houses a framework-level
contingent (`add-agent.md`, `integrate-external-content.md`, `verify-arc-integrity.md`)
mixed with session-adjacent helpers. `switch-mode.md` fits the implicit framework-level
category without requiring new structure. "lifecycle" would be the wrong label (these
aren't lifecycle operations in the WU sense), and a subdir for one or two files is
premature. A potential future cleanup — splitting `supplemental/` into session-adjacent vs
installation-level groupings — captured in ATOMIC-INBOX, explicitly decoupled from Modes
WU scope.

**Working doc shrinkage:** Removed Finding #16 section entirely (~30 lines). Updated
Sequencing § Tier 2 to mark #16 resolved and migrated. Tier 2 is now fully drained —
only #7 remains and is ⚪ parked (out of scope for pre-PRD). Attention now shifts to
Tier 3 (#2, #4, #5, #6, #12/R6).

**Session velocity:** Medium — longer than #13, shorter than #9/#10. Analysis + code read
~1 hour; design discussion (CLI shape, workflow vs CLI-only, entry-state gate, command
naming, word-collision concern, workflow directory) ~45 minutes; migration ~40 minutes.
**Fifth consecutive session using the direct-to-plan-doc pattern.** The word-collision
concern was the surprise — not planned into the session, surfaced during command-naming
discussion, absorbed cleanly into the rebrand WU without derailing the Finding #16 scope.

**Next:** Tier 2 drained. Tier 3 begins — **Finding #6** (strategy applicability mapping
for Lite) flagged as highest-leverage next target because it scopes what "Lite" means at
the strategy level and unblocks #2/#4/#5 (Lite workflow shape findings). Likely needs a
focused session of its own.

---

[plan-doc]: plan-arc-modes.md
