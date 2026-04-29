# Task List: Interlock Foundation

- **PRD:** `.arc/active/technical/prd-interlock-foundation.md`
- **Branch(es):** `technical/interlock-foundation`
- **Base Branch:** `main`

- **Purpose:** Establish ARC's interlock-model constitutional foundation — vocabulary, configuration axis,
  planning-session active surface, structured task-completion prompt, rollback protocol — so downstream
  auto-mode behaviors and consumer plans build on a stable frame.

---

## **Phase 1:** Constitutional Foundation

_Purpose:_ Bring DEV-RULES.ARC up to date with the interlock model — weaving the new vocabulary and
invariants into existing rule sections — and cascade the conceptual model to strategy docs. ADR-016
vocabulary cascade (1.1) lands the rename surface; 1.2 redrafts DEV-RULES holistically against the
at-session-relevance filter; 1.3 carries the cascade to strategy docs.

_Design decisions:_ DEV-RULES.ARC is loaded every session and ships to adopters — content earns its place
by being a rule the agent must respect at session-time. Conceptual model, vocabulary glossary, configuration
architecture, and design rationale belong in strategy docs (load-on-demand) and ADR-016 (internal). The
redraft is also an opportunity to apply the at-session filter to existing sections — prose that informs how
ARC works rather than constrains agent action gets collapsed or pointed to its proper home (method file,
strategy doc, workflow).

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

### `[x]` **1.2 DEV-RULES.ARC holistic redraft**

- _Outcome:_ DEV-RULES.ARC redrafted under the at-session-relevance filter. All four interlocks named in
  rule prose (_task-interlock_ in § Task Execution; _commit-interlock_, _push-interlock_, and
  _integration-interlock_ in § Commit Discipline; handoff-as-human-invoked subsection in § Session
  Management) with no new top-level § Autonomy Stack section. Two new invariants land:
  _integration-interlock_ (no agent-initiated merges) and cascade-undo (manual confirmation before
  destructive cascade ops). Commit / push triggering reframed around configurable autonomy via
  `session.autonomy`. Status-file timing rule replaces the prior "Work status accuracy" provision.
  At-session-filter tightening pass applied alongside (commit-format collapse, contributor-qualification
  consolidation to single intro pointer, test-first tighten, five `[TODO-docs-site]` placeholders +
  stub def removed, configurability-rules callout collapsed). Typographic convention: vocabulary
  terms in italics, identifiers / enum values / config keys in code.

    - `[x]` **1.2.a Tighten existing sections (at-session filter pass)**
        - _Outcome:_ Collapsed § Commit format to "follow the configured method" + method-pointers.
          Tightened § Test-first assessment — task-list-creation prose dropped. Consolidated contributor
          mention to a single intro pointer (AGENT-BRIEF.CONTRIBUTOR); removed the inline "Contributor note"
          blockquote in § Task Execution. (One contributor parenthetical remains in the Work-status-accuracy
          bullet — replaced wholesale in 1.2.b.) Removed all five `[TODO-docs-site]` placeholders + stub def.
          Collapsed the "How configurable rules work" callout to a one-line `[configurable]` legend.
          Orphaned `[arc-config]` link def removed (no remaining inline references in the trimmed prose).

    - `[x]` **1.2.b Rework § Commit Discipline around the new model**
        - _Outcome:_ § Commit control bullets restructured around the new model. "AI never initiates
          commits" replaced with **Commit triggering** · `[configurable]` naming the _commit-interlock_.
          Parallel **Push triggering** · `[configurable]` added naming the _push-interlock_ (default
          requires explicit invocation; `auto-push` fires only at handoff). New invariant
          **Merge to integration / main is human-only** added naming the _integration-interlock_. New
          rule **Cascade-undo** added (sibling to "Check before reverting files"). **Work status
          accuracy** replaced with **Status-file timing** (updates fire only at handoff /
          workflow-ceremony commits). Contributor override removed inline (covered by the consolidated
          intro pointer from 1.2.a). Convention: vocabulary terms in italics (_commit-interlock_),
          identifiers / enum values / config keys in code (`session.autonomy`, `manual-commit`).

    - `[x]` **1.2.c Rework § Task Execution + § Session Management**
        - _Outcome:_ § One task at a time names the _task-interlock_ parenthetically and makes the
          per-increment approval rule explicit; _review increment_ as a defined term; deferred-review
          framed as user-scoped convenience, not an autonomy mode. § Session state control rewritten to
          reflect the new timing rule (status file updated only at handoff / workflow-ceremony commits;
          task-completion commits never touch it); stale cross-ref to "Work status accuracy" replaced
          with pointer to § Commit Discipline. New ### Handoff subsection added between Session state
          control and Context quality — handoff is always human-invoked.

### `[x]` **1.3 Strategy-doc cascade**

- _Outcome:_ Three strategy docs cascaded for the interlock model: team-coordination prose re-anchored
  on the timing rule (1.3.a); session-operations became the conceptual interlock-model home with new
  sections for the model, status-file timing, handoff-interior toggle pattern, and probe-extension
  contract (1.3.b); configurability-architecture gained `session.autonomy` inventory + toggle pattern
  note (1.3.c). Adopter-facing rationale not passing the operational-usefulness filter extracted to
  notes-docs-content-sweep entries 69-70.

    - `[x]` **1.3.a Update `strategy-team-coordination.md` per-commit status-advance language**
        - _Outcome:_ Replaced "typical pattern is one developer advancing `Next Task` per commit" framing in
          § Session State Merge Behavior with a timing-rule-anchored explanation — `(@name)` discipline
          narrows field overlap; the status-file timing rule (DEV-RULES.ARC § Commit Discipline) limits
          writes to handoff / workflow-ceremony commits. Package source + `.arc/` synced.

    - `[x]` **1.3.b Update `strategy-session-operations.md` — interlock model home + timing split + toggle
      pattern + probe-extension contract**
        - _Outcome:_ Strategy-doc cascade landed in three new top-level sections (§ Interlock Model,
          § Status-File Timing, § Handoff-Interior Toggle Pattern) plus extended § Probe pattern with
          concrete extension contract. Audit-first execution kept the new content woven (intro / Contents
          updated, push-policy bullet forward-links to canonical toggle instance) rather than stapled-on.
          Adopter-interest rationale (push-timing stakes & race surface; status-file commit-history &
          auto-commit benefits) extracted to notes-docs-content-sweep entries 69-70. Net +210 lines
          across both copies; cross-doc consistency verified at re-audit.

        - `[x]` **1.3.b.i Audit & report**
            - _Outcome:_ Placement plan: three new top-level sections (§ Interlock Model, § Status-File
              Timing, § Handoff-Interior Toggle Pattern) between § Method and Extension Loading and
              § Context Monitoring; probe-extension contract folded into existing § Probe pattern;
              push-policy bullet gains forward-link to canonical toggle instance. Audit surfaced the
              strategy / ADR / DEV-RULES audience split that shaped operational-usefulness cuts —
              adopter-interest "why" rationale routed to notes-docs-content-sweep rather than landing
              in strategy.

        - `[x]` **1.3.b.ii Draft changes**
            - _Outcome:_ Three new top-level sections (§ Interlock Model, § Status-File Timing,
              § Handoff-Interior Toggle Pattern) + #### Extension contract subsection extending
              § Probe pattern. Intro / Contents updated; § Session State Portability push-policy bullet
              gains forward-link as canonical toggle instance. +208 lines, both copies synced. Two
              `[TODO-docs-site]` placeholders captured as entries 69-70 in notes-docs-content-sweep.md
              (push-timing stakes & race surface; status-file commit-history & auto-commit benefits).

        - `[x]` **1.3.b.iii Re-audit**
            - _Outcome:_ Cold-read full doc; flow holds end-to-end with three-axis framing (context / flow
              / operational rhythm) intact. One minor fix applied — trimmed near-verbatim duplication of
              push-ordering rationale in § Handoff-Interior Toggle Pattern (now cross-references § Push-
              Timing Reasoning instead of restating). Cross-doc consistency with DEV-RULES.ARC and PRD
              verified clean (vocabulary, enum, timing rule, cascade-undo, structured prompts, push-
              ordering). Subsequent ADR-cleanup pass: removed two ADR-016 mentions + link def from
              § Interlock Model intro and revised notes-sweep entries 69/70 stylistic guidance —
              strategies are adopter-facing and cannot reference internal ADRs.

    - `[x]` **1.3.c Update `strategy-configurability-architecture.md` — `session.autonomy` inventory**
        - _Outcome:_ Added `session.autonomy` row to Operational discipline conventions table (P5, default
          "Manual commit and push"); added Session autonomy subsection in § Settings with behavioral
          implications (mode enum + per-developer override); added Handoff-interior toggles subsection.
          Both subsections cross-link to [session-ops] for the canonical interlock model and toggle
          pattern. Package source + `.arc/` synced.

---

## **Phase 2:** Configuration Surface

_Purpose:_ Land CLI-side plumbing the workflow updates in Phase 4 will consume — `session.autonomy`
resolver, session-init probe surfacing with provenance, and the new `--session-handoff --json` composite
probe — with vitest coverage on each.

_Design decisions:_ Per-developer override mirrors the existing `user.sync_push` / `arc.syncPush` resolver
shape — new `lib/autonomy-policy.ts` parallels `lib/sync-policy.ts`. Generic resolver consolidation
(`resolveGitConfigOverride<T>`) is deferred to [plan-user-sync-ux][plan-sync], which adds the third
concrete toggle (worktree push) and owns the DRY pass with all three in hand. Probe envelope distinguishes
**agent-consumed** overrides (autonomy — agent renders the structured task-completion prompt; needs the
resolved effective value at session-init) from **CLI-consumed** overrides (`user.sync_push` — internal CLI
code resolves at action time; raw yaml in the probe is sufficient). Autonomy ships as a separate top-level
probe field with provenance (`{ value, source }`); the bulk `settings` map stays raw yaml. Composite-probe
machinery reuse — `--session-handoff` is a new mode passing a different field-set to the same composite
logic in `handlers/status.ts`. Self-contained envelope: `arc-handoff` is skill-invoked, so the handoff
workflow shouldn't depend on session-init context still being intact. Test-first applies — clear behavior
lists, regression-prone surfaces.

### `[ ]` **2.1 `arc-config.yml` adds `session.autonomy` resolver**

- **Strategies:** `strategy-testing-methodology.md`

- _Goal:_ `session.autonomy` ships as `manual-commit | auto-commit | auto-push` (default `manual-commit`);
  per-developer override reads from `git config arc.autonomy`. Resolver enforces the enum and applies the
  three-tier precedence with warnings on invalid values at each tier.

    - `[ ]` **2.1.a Implement `lib/autonomy-policy.ts`**
        - New module paralleling `lib/sync-policy.ts` — same shape (constants for git-config + yaml keys,
          `isValidPolicy`, three-tier `resolveAutonomyPolicy(opts)` returning `{ policy, source }`),
          different domain. Module-level comment notes the parallel and flags the deferred DRY
          consolidation when toggle #3 lands in [plan-user-sync-ux][plan-sync].
        - No changes to `lib/config/status-reader.ts` — autonomy validation lives in the resolver, matching
          the `user.sync_push` precedent (resolver-side enum check, not in `ENUM_VALIDATORS`).
        - Test parity reference: `__tests__/unit/sync-policy.test.ts` is the shape to mirror.
        - Build `test-first` (one behavior at a time):
            - resolver returns default `manual-commit` when both sources absent
            - resolver reads valid value from yaml when git-config absent
            - precedence: valid `arc.autonomy` git-config wins over yaml
            - invalid `arc.autonomy` git-config → warns, falls back to yaml
            - invalid yaml `session.autonomy` → warns, falls back to default
            - both invalid → warns at each tier, falls back to default

    - `[ ]` **2.1.b Add `session.autonomy` to `arc-config.yml` (project + package source)**
        - Add `session.autonomy: manual-commit` (with comment block matching the `user.sync_push` style —
          enum values, default, per-developer override key) to both copies:
            - `.arc/system/arc-config.yml` (project source-of-truth)
            - `packages/arc-framework/arc/system/arc-config.yml` (package source ships to adopters)
        - Two-copy edit per package-project-sync discipline.

### `[ ]` **2.2 Session-init probe surfaces resolved autonomy**

- **Strategies:** `strategy-testing-methodology.md`

    - `[ ]` **2.2.a Wire autonomy into `config.value`**
        - Extend `runConfigSessionInitStatus` (`commands/config/status.ts`) to call `resolveAutonomyPolicy`
          and surface the resolved-with-provenance shape as a new top-level field. Signature change:
          `ConfigSessionInitOptions` gains `exec: GitExec`; bulk `settings` map stays raw yaml (autonomy
          isn't added to `ConfigSettings`). `ConfigSessionInitResult` gains
          `autonomy: { value: "manual-commit" | "auto-commit" | "auto-push", source: "git-config" | "yaml" | "default" }`.
          Caller in `handlers/status.ts` passes `gitExec` through.
        - Build `test-first` (one behavior at a time):
            - returns `{ value: "manual-commit", source: "default" }` when both sources absent
            - returns `{ value: <yaml>, source: "yaml" }` when only yaml provides
            - returns `{ value: <git-config>, source: "git-config" }` when override applies
            - resolver warnings propagate into `warnings` array unchanged

### `[ ]` **2.3 New mode: `arc status --session-handoff --json`**

- **Strategies:** `strategy-testing-methodology.md`

- _Goal:_ Self-contained composite probe returning the handoff envelope — six slots: dirty state, worktree
  sync, notes sync, autonomy with provenance, handoff-interior toggle values (`user.sync_push` today;
  future siblings as named), resolved active status file path. Reuses field-resolver machinery from
  session-init.

    - `[ ]` **2.3.a CLI flag plumbing**
        - Add `--session-handoff` to `arc status` in `cli.ts` and branch in `handlers/status.ts`. JSON-only
          initially (interactive surface deferred). Mutually exclusive with `--session-init` — both passed
          → error, non-zero exit, message naming the conflict.

    - `[ ]` **2.3.b Field-set wiring for handoff scope**
        - New `runSessionHandoffStatus` in `commands/status/run.ts` paralleling `runSessionInitStatus`;
          new types in `commands/status/types.ts` (`SessionHandoffProbes`, `SessionHandoffResult`); export
          binding via `commands/status.ts`. Reuses `runWorktreeSyncStatus`, `runUserSessionInitStatus`,
          `runActiveSessionInitStatus`, `runConfigSessionInitStatus` (autonomy slot), and adds a new
          dirty-state resolver (porcelain check). Sync-push policy comes from `resolveSyncPushPolicy`
          (existing) wired as a handoff-interior-toggle slot.
        - Build `test-first` (one behavior at a time):
            - returns dirty-state probe (porcelain check — clean / dirty + file-count detail)
            - returns worktree sync state (reuse `runWorktreeSyncStatus`)
            - returns notes sync state (reuse `runUserSessionInitStatus`)
            - returns autonomy with provenance (reuse `runConfigSessionInitStatus`)
            - returns sync-push policy with provenance (`resolveSyncPushPolicy`)
            - returns resolved active status file path (reuse `runActiveSessionInitStatus`)
            - per-slot errors carried in the envelope (no non-zero exit on per-probe failure)

    - `[ ]` **2.3.c Document the handoff envelope field table**
        - Additive edit to `strategy-session-operations.md` § Probe pattern: append a handoff envelope field
          table mirroring the existing session-init field table (in `session-init.md`). The conceptual
          framing of the probe-extension contract already exists in that section; this task adds the field
          inventory specific to `--session-handoff`. Consumer plans reference this from their plan docs.

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
          status-file timing rule.

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
        - When both worktree-push and notes-push fire, worktree first. Workflow ordering enforces — notes
          attach to commits that must already exist on origin. Not configurable. Strategy-session-operations
          (Task 1.3.b) carries the reasoning for cross-reference.

    - `[ ]` **4.2.d Status update lands at the handoff commit**
        - Workflow stages status-file changes as part of the handoff commit, not a separate operation.
          Cross-reference DEV-RULES.ARC status-file timing rule.

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
- `[ ]` DEV-RULES.ARC redrafted: interlock vocabulary woven into existing rule sections; integration-interlock
  and cascade-undo invariants added; commit-control reframed around configurable autonomy; status-file timing
  rule replaces "Work status accuracy" provision; tightening pass applied (commit-format collapsed, contributor
  qualifications consolidated, test-first tightened)
- `[ ]` Strategy cascade applied: `strategy-team-coordination`, `strategy-session-operations`,
  `strategy-configurability-architecture`
- `[ ]` `arc-config.yml` `session.autonomy` enum ships with default `manual-commit` and per-developer
  git-config override
- `[ ]` Session-init probe surfaces resolved autonomy as `config.value.autonomy: { value, source }`
- `[ ]` `arc status --session-handoff --json` returns the documented self-contained envelope (six slots)
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
[plan-sync]: ../../backlog/technical/plan-user-sync-ux.md
