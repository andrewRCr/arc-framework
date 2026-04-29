# Task List: Interlock Foundation

- **PRD:** `.arc/active/technical/prd-interlock-foundation.md`
- **Branch(es):** `technical/interlock-foundation`
- **Base Branch:** `main`

- **Purpose:** Establish ARC's interlock-model constitutional foundation — vocabulary, configuration axis,
  planning-session active surface, structured task-completion prompt, rollback protocol — so downstream
  auto-mode behaviors and consumer plans build on a stable frame.

---

## **Phase 1:** Constitutional Foundation

_Purpose:_ Land the interlock model in normative docs (DEV-RULES.ARC, strategy-* cascades, ADR-016
vocabulary cascade) so downstream phases write workflow prose against stable vocabulary.

_Design decisions:_ DEV-RULES.ARC § Autonomy Stack ships as a new top-level section — the interlock model
is conceptually distinct from § Commit Discipline and § Session Management, and burying it inside either
would fragment the four-interlock model. **Drafting is operationally lean:** every-session-loaded surface
is a budget. Apply the [`notes-docs-content-sweep`][notes-sweep] § Source-Side Placeholder Convention to
extract any prose crossing operational sufficiency (rationale, precedent, tradeoff analysis) into a
`notes-docs-content-sweep.md` entry with a `[TODO-docs-site]` placeholder at the source site. Extended
operational context (worth having on hand, not preload-needed) routes to `strategy-session-operations.md`.

### `[x]` **1.1 ADR-016 vocabulary cascade across remaining `.arc/` references**

- _Outcome:_ Autonomy-model "gate" usages renamed to "interlock" across 6 backlog/research
  files (~19 substitutions). Quality-gate vocabulary and ADR-016's validation-deadline
  gate-suffix parallel (commit-gate/push-gate/integration-gate) preserved per § Decision.
  Triage of 714 raw hits captured in 1.1.a; rename inventory in 1.1.b.

    - `[x]` **1.1.a Inventory remaining "gate" references**
        - _Outcome:_ 714 hits triaged: quality-gate vocabulary stays; ADR-016 validation-
          deadline gate-suffixes (commit-gate/push-gate/integration-gate) stay per § Decision;
          metaphorical uses stay. Rename surface = ~19 hits across 6 files identified for 1.1.b.

    - `[x]` **1.1.b Update incoming references**
        - _Outcome:_ Renamed autonomy-model "gate" → "interlock" across 6 files
          (`plan-user-sync-ux.md`, `plan-concurrent-work-conventions.md` incl. § heading,
          `plan-agile-wu-lifecycle.md`, `ROADMAP.md`, `plan-coord-probe.md`,
          `research-wu-grouping-patterns.md`). DEV-RULES.ARC and workflow prose had no
          autonomy-model "gate" usage; strategy docs referencing ADR-016 had none either.

### `[ ]` **1.2 DEV-RULES.ARC § Autonomy Stack new top-level section**

- **Strategies:** `strategy-session-operations.md` (extended-operational-context destination for spillover)

- _Goal:_ Operationally-sufficient framing for the four-interlock model, configurable-default reframing
  of commit control, structured-prompt format, push-ordering invariant, and rollback subsection — written
  tight, with rationale extracted to `notes-docs-content-sweep.md` placeholders.

    - `[ ]` **1.2.a Draft § Autonomy Stack — interlock model + configurable-default reframing**
        - Four interlocks (`task-interlock`, `commit-interlock`, `push-interlock`, `integration-interlock`);
          invariant endpoints; configurable middle interlocks; handoff-as-orthogonal framing.
        - Drafting discipline: write for an agent navigating downstream workflows. No rationale, no
          precedent. Extract any prose exceeding operational sufficiency to `notes-docs-content-sweep.md`
          per the placeholder convention.

    - `[ ]` **1.2.b Document structured task-completion prompt format**
        - Base ARC behavior (not auto-commit exclusive). Prompt variants, response semantics, redirect
          syntax. Cross-reference from § Task Execution. Implementation lands in Phase 4.

    - `[ ]` **1.2.c Document push-ordering invariant**
        - Worktree-push before notes-push when both fire at handoff. Not a config; not optional. Single
          paragraph; full enforcement framing lives in `session-handoff.md` (Phase 4).

    - `[ ]` **1.2.d Document rollback protocol subsection**
        - Session-local, manual-confirmation, dev-rule-based. Agent reads recent git log + conversation
          context, identifies cascade boundary, presents undo plan, awaits explicit user confirmation.
          No skill, no log file in v1.

### `[ ]` **1.3 DEV-RULES.ARC § Commit Discipline + § Session Management amendments**

- _Goal:_ Existing sections cross-reference § Autonomy Stack; "Work status accuracy" provision superseded
  by the timing rule; status-file timing split + handoff-as-orthogonal framing land in § Session Management.

    - `[ ]` **1.3.a Update § Commit Discipline**
        - Replace "Work status accuracy" provision with the timing-rule pointer (status updates fire only
          at handoff commits and workflow-ceremony commits, never at task-completion code commits).
          Cross-reference § Autonomy Stack. Operationally tight — no rationale.

    - `[ ]` **1.3.b Update § Session Management**
        - Status-file timing split, handoff-as-orthogonal framing, parallel-session concurrency model
          framing. Cross-reference § Autonomy Stack.

### `[ ]` **1.4 Strategy-doc cascade**

- _Goal:_ Prose that becomes inconsistent with the new rules updates here; extended operational context
  (toggle pattern, probe-extension contract) lives in `strategy-session-operations.md` so DEV-RULES.ARC
  stays lean.

    - `[ ]` **1.4.a Update `strategy-team-coordination.md` per-commit status-advance language**
        - Match the new timing rule. No semantic change beyond aligning prose with status-file-not-touched-
          per-task behavior.

    - `[ ]` **1.4.b Update `strategy-session-operations.md` — timing split, toggle pattern, probe-extension
      contract**
        - Status-file timing split documented in detail. Handoff-interior toggle pattern (config keys under
          primary domain; standard `auto / prompt / manual` enum). Probe-extension contract for consumer
          plans — concrete pattern for adding fields without restructuring (P1.a folded here).

    - `[ ]` **1.4.c Update `strategy-configurability-architecture.md` — `session.autonomy` inventory**
        - Add `session.autonomy` to the convention inventory under operational-discipline tier. Brief note
          on the handoff-interior toggle pattern in the Configuration section. Cross-link the
          strategy-session-operations entry.

---

## **Phase 2:** Configuration Surface

_Purpose:_ Land CLI-side plumbing the workflow updates in Phase 4 will consume — `session.autonomy` enum,
schema validation, session-init probe surfacing, and the new `--session-handoff --json` composite probe —
with vitest coverage on each.

_Design decisions:_ Composite-probe machinery reuse — `--session-handoff` is a new mode passing a different
field-set to the same composite logic in `handlers/status.ts`. Not net-new infrastructure. Per-developer
override mirrors the existing `user.sync_push` / `arc.syncPush` git-config-override pattern. Test-first
applies — clear behavior lists, regression-prone surfaces.

### `[ ]` **2.1 `arc-config.yml` adds `session.autonomy` enum**

- **Strategies:** `strategy-testing-methodology.md`

- _Goal:_ `session.autonomy` ships as `manual-commit | auto-commit | auto-push` (default `manual-commit`);
  per-developer override reads from `git config arc.autonomy`. Schema rejects out-of-enum values.

    - `[ ]` **2.1.a Extend config schema**
        - Implementation lands in `packages/arc-framework/src/lib/config/` schema validator + status-reader.
        - Build `test-first` (one behavior at a time):
            - rejects values outside the enum
            - returns default `manual-commit` when key absent
            - precedence: `arc.autonomy` git config wins over `arc-config.yml` value
            - invalid `arc.autonomy` value falls back to config-file value with warning surfaced

    - `[ ]` **2.1.b Update project `arc-config.yml` and package template**
        - Add `session.autonomy: manual-commit` to project config (source-of-truth) and package source's
          template. Sync per package-project-sync discipline.

### `[ ]` **2.2 Session-init probe surfaces `session.autonomy`**

- **Strategies:** `strategy-testing-methodology.md`

    - `[ ]` **2.2.a Wire `session.autonomy` into `config.value.settings`**
        - Implementation extends `commands/config.ts` session-init resolver.
        - Build `test-first` (one behavior at a time):
            - `runConfigSessionInitStatus` returns `session.autonomy` alongside existing settings
            - per-developer override reflected in returned value
            - default applied when both sources absent

### `[ ]` **2.3 New mode: `arc status --session-handoff --json`**

- **Strategies:** `strategy-testing-methodology.md`

- _Goal:_ Composite probe returning the handoff envelope — dirty state, worktree sync, notes sync, autonomy,
  handoff-interior toggle values, active extensions filtered to handoff fire points, resolved active
  status file. Reuses field-resolver machinery from session-init.

    - `[ ]` **2.3.a CLI flag plumbing**
        - Add `--session-handoff` to `arc status` in `handlers/status.ts`. JSON-only initially (interactive
          surface deferred). Mutually exclusive with `--session-init`.

    - `[ ]` **2.3.b Field-set wiring for handoff scope**
        - New `runSessionHandoffStatus` paralleling `runSessionInitStatus`; reuses existing per-command
          session-init resolvers where field semantics match; adds handoff-specific dirty-state and
          extension-filter resolvers.
        - Build `test-first` (one behavior at a time):
            - returns dirty-state probe (porcelain check)
            - returns worktree sync state (reuse `runWorktreeSyncStatus`)
            - returns notes sync state (reuse user-status equivalent for handoff)
            - returns autonomy mode from config probe
            - returns active extensions filtered to handoff fire points
            - returns resolved active status file
            - per-slot errors carried in the envelope (no non-zero exit on per-probe failure)

    - `[ ]` **2.3.c Document the envelope contract**
        - Add the field table to `strategy-session-operations.md` § probe-extension contract (same style as
          the session-init envelope table). Consumer plans reference this from their plan docs.

---

## **Phase 3:** Planning-Session Active Surface

_Purpose:_ Template + lifecycle-workflow plumbing that gives planning sessions a tracked pointer and
converging routes (planning-branch ceremony / `activate-work-unit` fallback today; arc-plan conductor
invocation in the future).

_Design decisions:_ `Sibling Work Unit(s)` lives on the status file (not the PRD) — the status file is the
unified WU pointer artifact across the lifecycle, read at every session-init and persisting into archive
per `plan-completion-status-consolidation`. `activate-work-unit.md` Step 4 becomes idempotent so paths
bypassing planning-branch ceremony hit the same template.

### `[ ]` **3.1 `template-status.md` adds Spec, Sibling Work Unit(s), and State: Planning**

- _Goal:_ Planning-session pointer fields land in the canonical template; existing in-flight files pick
  them up via in-place migration in Phase 5.

    - `[ ]` **3.1.a Add `Spec` field — polymorphic pointer**
        - Value shape: `.md` filename, URL, or empty. Document the contract inline in the template.

    - `[ ]` **3.1.b Add `Sibling Work Unit(s)` field**
        - Comma-separated list of `prd-{name}.md` references to tightly-coupled WUs. Optional. Inline note
          on when to populate (same logical whole, split for sizing/sequencing).

    - `[ ]` **3.1.c Add `State: Planning` to the State enum**
        - Other enum values are sibling-WU territory. `In Progress` retained as today's default for
          non-planning WUs.

### `[ ]` **3.2 `activate-planning-branch.md` creates status file at planning activation**

- **Strategies:** `strategy-session-operations.md`

- _Goal:_ Planning sessions resolve cleanly at session-init — no more `active.resolution: "none"` for
  planning work.

    - `[ ]` **3.2.a Insert status-file creation step**
        - State: Planning, optional Spec (point at plan-doc when known), optional Sibling Work Unit(s),
          no Task List. Idempotent — if a status file already exists, leave in place.

    - `[ ]` **3.2.b Plan-doc location move (arc-in-git only)**
        - `git mv backlog/{category}/plan-{name}.md → active/{category}/`. Other pm.modes leave plan-doc
          location user-managed.

### `[ ]` **3.3 `activate-work-unit.md` Step 4 — idempotent ensure-status-file**

- _Goal:_ One step handles both routes — transition existing planning file (State: Planning → In Progress,
  fill Task List, etc.) or create from template when absent.

    - `[ ]` **3.3.a Restructure Step 4 with precondition check**
        - Detect existing status file from planning-branch ceremony; switch to transition path or creation
          path. Existing creation logic stays in the creation branch.

    - `[ ]` **3.3.b Specify transition-path field handling**
        - Clear planning-state fields (Spec narrows or reformats per WU type), populate execution-state
          fields (Task List, Next Task, Last Completed: "Work unit activated"). Document the mapping
          inline.

### `[ ]` **3.4 `integrate-planning-branch.md` handles status-file disposition**

- _Goal:_ Graduated path converts State and retains the file; shelved path removes it.

    - `[ ]` **3.4.a Disposition under graduated path**
        - State transitions per the downstream `activate-work-unit` invocation. Plan-doc disposition:
          `git rm` from active.

    - `[ ]` **3.4.b Disposition under shelved path**
        - Remove the status file. Plan-doc: `git mv` back to backlog.

### `[ ]` **3.5 Probe sessionType inference reads `State: Planning`**

- **Strategies:** `strategy-testing-methodology.md`

- _Goal:_ State-based inference becomes primary; branch-pattern fallback retained for orphan cases.

    - `[ ]` **3.5.a Update inference logic in `commands/active.ts`**
        - Build `test-first` (one behavior at a time):
            - `State: Planning` → `sessionType: "planning"`
            - branch-pattern match used only when status file absent or State unset
            - other State values map per existing logic
            - missing/invalid State + non-matching branch → `null`

### `[ ]` **3.6 Document status-file creation contract in `strategy-session-operations.md`**

---

## **Phase 4:** Status-File Timing & Workflow Restructuring

_Purpose:_ Consume Phases 1–3 in the workflows that fire daily. Process-task-loop drops status-file
rotation; session-handoff restructures around the composite probe; lifecycle workflows bundle status
updates into ceremony commits.

_Design decisions:_ The structured task-completion prompt is base behavior — it ships even in
`manual-commit` (the default). This phase implements `Proceed to Task X.Y?` everywhere; the
`Commit and proceed…` variant is wired to read `session.autonomy`, but what auto-commit actually does
when configured is sibling-WU work.

### `[ ]` **4.1 `3_process-task-loop.md` — status-file timing rule + structured prompt**

- _Goal:_ Task-completion commits stay code-only; status-rotation moves out. Prompt rhythm appears at
  every task close.

    - `[ ]` **4.1.a Remove status-file update from task-completion step**
        - Strike the "advance Next Task / Last Completed / Next Action" prose. Cross-reference DEV-RULES.ARC
          § Autonomy Stack timing rule.

    - `[ ]` **4.1.b Append structured task-completion prompt**
        - Default (manual-commit): `Proceed to Task X.Y?`
        - Auto-commit configured: `Commit and proceed to Task X.Y?` (read from `session.autonomy`)
        - Boundary-aware: `Proceed to Phase N+1, Task N+1.1?` at phase end; `Proceed to handoff?` at WU end
        - Response semantics: short affirmative as first word advances; redirect syntax preserved
          (`y, also <X>` / `y; <redirect>`).

    - `[ ]` **4.1.c Quality-gate-failure structured-prompt variant (P1.b)**
        - `Quality gates failed: <details>. Investigate? (y / iterate)`. Defer with `[~]` if Phase 4 grows;
          folds cleanly into the same workflow file.

### `[ ]` **4.2 `session-handoff.md` restructured around composite handoff probe**

- _Goal:_ Single `arc status --session-handoff --json` returns the envelope; per-action checklist consumes
  each toggle's mode.

    - `[ ]` **4.2.a Replace ad-hoc checks with composite-probe consumption**
        - Workflow opens with the probe call; downstream steps read their slice of the envelope. Per-slot
          error handling matches session-init pattern.

    - `[ ]` **4.2.b Per-action checklist with toggle reads**
        - Worktree-push, notes-push, status-update, etc. — each consults its toggle's mode. Document the
          consumption pattern inline.

    - `[ ]` **4.2.c Push ordering enforcement**
        - When both worktree-push and notes-push fire, worktree first. Workflow ordering enforces.
          Cross-reference the DEV-RULES.ARC invariant.

    - `[ ]` **4.2.d Status update lands at the handoff commit**
        - Workflow stages status-file changes as part of the handoff commit, not a separate operation.
          Cross-reference DEV-RULES.ARC § Autonomy Stack timing rule.

### `[ ]` **4.3 Lifecycle workflows bundle status updates into ceremony commits**

- _Goal:_ activate-work-unit, integrate-work-unit, sweep, deactivate, PRD generation, planning-lifecycle
  ops all stage their status updates with their ceremony commits.

    - `[ ]` **4.3.a Survey lifecycle workflows for current status-update prose**
        - Inventory `activate-work-unit.md`, `integrate-work-unit.md`, `clean-work-unit.md`,
          `deactivate-work-unit.md`, `1_create-prd.md`, `activate-planning-branch.md`,
          `integrate-planning-branch.md`. Note where each currently updates status.

    - `[ ]` **4.3.b Apply timing rule across surveyed workflows**
        - Each workflow stages status updates as part of its ceremony commit (not a separate commit, not
          deferred to handoff). Cross-reference DEV-RULES.ARC.

---

## **Phase 5:** Validation, Migration & Validation-Window Plan

_Purpose:_ Ship the pre-commit hook for `Spec` shape, migrate any existing in-flight self-host status
files in place, and define the post-integration validation-window plan that the next session-operational-flow
planning sessions execute as the natural exercise vehicle.

_Design decisions:_ The PRD's "≥3 self-host sessions exercising the new frame" runs **between WU-A
integration and WU-B activation** (PRD Success Criteria), not pre-integration. To exercise the new
frame end-to-end (planning-branch ceremony, status-file creation at activation, sessionType inference
from State, structured prompts, composite handoff probe), the frame must be on `main` — which means
post-integration. Sibling-WU planning (session-operational-flow plan-doc → PRD → tasks) is the natural
bridge work for the window: planning branch forks cleanly from main, no stacking. Pre-integration
dogfooding we get is incidental — Phase 4 deliverables apply to this WU's own remaining task work
once they land. Captured as supplemental evidence, not a substitute.

### `[ ]` **5.1 Pre-commit hook validates `Spec` field shape**

- **Strategies:** `strategy-testing-methodology.md`

- _Goal:_ Block commits where `Spec` value is malformed; tier-aware semantics deferred to
  `plan-agile-wu-lifecycle`.

    - `[ ]` **5.1.a Add the shape-check to existing pre-commit infrastructure**
        - Build `test-first` (one behavior at a time):
            - empty value passes
            - `.md` filename passes
            - URL passes
            - any other value fails with a clear error message
        - Implementation in the existing pre-commit script (locate via `git config core.hooksPath` /
          `.githooks/`). Shell test using the project's existing shell-test convention.

### `[ ]` **5.2 Migrate existing in-flight self-host status files in place**

- _Goal:_ Add new fields (`Spec`, `Sibling Work Unit(s)`) to any existing status files. No protocol, no
  auto-migration.

    - `[ ]` **5.2.a Inventory existing status files**
        - `find .arc/active -name "status-*.md"`. Confirm scope before editing — Phase 3's
          planning-branch ceremony may have created files for in-flight planning work between Phase 3
          completion and this point.

    - `[ ]` **5.2.b Apply field additions per file**
        - Hand-edit each file. Spec value inferred from context (plan-doc filename, if applicable).
          Sibling WU(s) populated where known.

### `[ ]` **5.3 Define post-integration validation-window plan**

- _Goal:_ Capture the concrete plan the validation window executes — sibling-WU planning
  (session-operational-flow plan → PRD → tasks) as the exercise vehicle. Pre-integration deliverable;
  execution itself happens post-integration, between WU-A integration and WU-B activation.

    - `[ ]` **5.3.a Write the validation-window entry**
        - Output: a tracked notes file (`notes-interlock-foundation.md` or `notes-validation-window.md`)
          documenting which sessions exercise which success-criteria, what defines window completion,
          where observations get captured.
        - Concrete shape (≥3 sessions; adjust if surfaces reveal more):
            - Session 1 — planning-branch activation end-to-end via session-operational-flow plan-doc
              refinement: `activate-planning-branch` ceremony, status file created with `State: Planning`,
              `Spec` pointing at `plan-session-operational-flow.md`, `Sibling Work Unit(s)` back-referencing
              `prd-interlock-foundation.md`, sessionType inference from State.
            - Session 2 — PRD generation under structured prompts + composite handoff probe across any
              session boundaries; status-file timing rule observable (no per-task status churn).
            - Session 3 — task generation + `activate-work-unit` idempotent transition path
              (State: Planning → In Progress, Task List populated). Push-ordering invariant exercised
              if a handoff fires both worktree-push and notes-push.
        - Failure-mode handling: any envelope shape, prompt phrasing, or workflow prose adjustments
          surfaced during the window route back as post-archive R-tasks against this WU or get folded
          into the sibling WU as appropriate.

    - `[ ]` **5.3.b Capture in-flight observations from Phases 1–5 execution**
        - As the new frame lands phase-by-phase, this WU's own remaining task work increasingly uses
          it (Phase 4.1 prompts apply to all subsequent task closes; status timing rule applies once
          Phase 4.1 lands; etc.). Append findings to the same notes file. Supplemental evidence —
          does not substitute for the post-integration window.

---

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

> Items annotated `(validation window)` are verified post-integration during the validation window
> defined in Phase 5.3 — they gate WU-B activation, not WU-A archive. Unannotated items are verified
> by Phase 6 verification before archive.

- `[ ]` ADR-016 reads consistently after rename — no remaining "gate" references where "interlock" is meant
- `[ ]` DEV-RULES.ARC § Autonomy Stack lands as a new top-level section with operationally-sufficient
  framing only (rationale extracted to `notes-docs-content-sweep.md` placeholders)
- `[ ]` DEV-RULES.ARC § Commit Discipline + § Session Management amendments cross-reference § Autonomy Stack
- `[ ]` Strategy cascade applied: `strategy-team-coordination`, `strategy-session-operations`,
  `strategy-configurability-architecture`
- `[ ]` `arc-config.yml` `session.autonomy` enum ships with default `manual-commit` and per-developer
  git-config override
- `[ ]` Session-init probe surfaces `session.autonomy` in `config.value.settings`
- `[ ]` `arc status --session-handoff --json` returns the documented composite envelope
- `[ ]` `template-status.md` carries `Spec`, `Sibling Work Unit(s)`, and `State: Planning`
- `[ ]` `activate-planning-branch.md` creates status file at planning activation
- `[ ]` `activate-work-unit.md` Step 4 is idempotent — transitions existing or creates
- `[ ]` `integrate-planning-branch.md` handles status-file disposition (graduated retains, shelved removes)
- `[ ]` Probe sessionType inference reads `State: Planning` as primary signal
- `[ ]` `3_process-task-loop.md` no longer touches the status file at task completion
- `[ ]` `session-handoff.md` consumes the composite probe and enforces push-ordering invariant
- `[ ]` Lifecycle workflows stage status updates with their ceremony commits
- `[ ]` Pre-commit hook blocks commits where `Spec` value is malformed
- `[ ]` Existing self-host status files migrated in place (zero or more, per Phase 5.2.a inventory)
- `[ ]` Validation-window plan committed (Phase 5.3 deliverable)
- `[ ]` Structured task-completion prompts appear at every task close in manual mode (boundary-aware
  variants at phase/WU end) — _(validation window)_
- `[ ]` Manual-mode preserves current behavior exactly — no drift acceptable for existing users —
  _(validation window)_
- `[ ]` Status-file timing rule observable in practice: task-completion commits don't touch status files;
  handoff and ceremony commits do — _(validation window)_
- `[ ]` Planning-session active surface visible in practice: status file present at planning activation;
  sessionType inference works without branch-pattern fallback in the dominant case — _(validation window)_
- `[ ]` Push-ordering invariant holds in handoffs that fire both worktree and notes pushes —
  _(validation window)_
- `[ ]` ≥3 self-host sessions exercise the new frame per the validation-window plan —
  _(validation window)_
- `[ ]` Downstream consumer plans confirm the frame supports their scope without structural reshape —
  _(validation window)_
- `[ ]` All quality gates pass (markdown lint, TypeScript typecheck, vitest, build)
- `[ ]` Ready for integration

---

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
[notes-sweep]: ../../backlog/technical/notes-docs-content-sweep.md
