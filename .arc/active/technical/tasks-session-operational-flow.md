# Task List: Session-Operational Flow

- **PRD:** `prd-session-operational-flow.md`
- **Branch(es):** `technical/session-operational-flow`
- **Base Branch:** `main`

- **Purpose:** Implement interlock-release behaviors (commit-on-task-approval, push-on-handoff) and the metadata-state foundation
  (State enum extension, Integration field, sweep cadence, integration-window cadence refinements) against the
  Interlock Foundation constitutional frame — turning the configurable interlock-release surface from scaffolding into a
  live operational surface.

> **Two-copy sync discipline:** All framework-file edits in this WU sync to `packages/arc-framework/arc/` package source
> per [strategy-package-project-sync][package-sync]. Sync as part of each task's commit; the pre-commit hook
> warns on missed pairings.
>
> **Token-economy discipline:** Session-loaded surfaces (DEV-RULES.ARC, DEV-RULES.PROJECT, process-task-loop,
> session-init, session-handoff, QUICK-REFERENCE) receive the minimum addition needed for clarity and
> reliability. Depth lives in `strategy-session-operations.md` (loaded on-demand). Per-task scope notes call
> out the split where applicable.

---

## **Phase 1:** Metadata-State Foundation + Cadence Refinements

_Purpose:_ Land the schema and validator additions plus the integration-window cadence refinements before
configurable interlock-release behaviors layer on top. SOF's own integration window benefits from these refinements landing
early.

_Design decisions:_ Phase ordering flipped from PRD — metadata-state foundation lands first so SOF's own
integration uses the new cadence. Phase 3 split contingency resolved as bundled (medium surface). Lazy
migration; no helper command. See [`notes-session-operational-flow.md`][notes] § Phase 1 Rationale.

### `[x]` **1.1 Extend `template-status.md` — `**State:**` enum + `**Integration:**` field**

- Added the expanded `State` enum and conditional `Integration` field semantics to the status template,
  synchronized across `.arc/` and `packages/arc-framework/arc/`.

    - `[x]` **1.1.a Extend `**State:**` field-semantics comment with full enum**
        - Replaced the forward-looking note with the full `Planning | In Progress | Complete | Paused |
          Superseded` enumeration.

    - `[x]` **1.1.b Add `**Integration:**` field semantics + default**
        - Documented `Integration` as present only for `State: Complete`, required and non-empty in that state,
          with `Awaiting PR` as the pre-PR integration value.

    - `[x]` **1.1.c Two-copy sync to package source**
        - Mirrored the edit in `packages/arc-framework/arc/reference/templates/template-status.md`.

### `[x]` **1.2 Extend CHECK 16 (`validate-status-spec.ts`) for `**State:**` + `**Integration:**` enum validation**

- Extended CHECK 16 to require valid `State` values on status files and enforce `Integration` only for
  `State: Complete`, including `Awaiting PR` for the committed pre-PR window.
- **Strategies:** `strategy-testing-methodology.md`

- Build `test-first` (one behavior at a time):

    - `[x]` `**State:**` enum validation accepts
      `Planning | In Progress | Complete | Paused | Superseded`; rejects anything else with a diagnostic
      naming the file and offending value
    - `[x]` `**Integration:**` enum validation accepts
      `Awaiting PR | Awaiting review | Changes requested | Ready to merge | Merged`
    - `[x]` `**Integration:**` enum validation rejects bogus values with a clear error
    - `[x]` `**State:**` is required on status files
    - `[x]` `**Integration:**` is required and non-empty for `State: Complete`, and rejected for non-Complete
      states

### `[x]` **1.3 Add `archive.cadence` to config schema**

- Added `archive.cadence` with `with-integration | manual` validation and `with-integration` default across
  the config reader, shell validator, and project/package `arc-config.yml` copies. Also updated config/status
  tests and cleared stale `validate-config.sh` unknown-key warnings for existing config keys.
- **Strategies:** `strategy-testing-methodology.md`, `strategy-configurability-architecture.md`

- Build `test-first` (one behavior at a time):

    - `[x]` Config validation accepts `with-integration` and `manual` as valid enum values
    - `[x]` Config validation rejects bogus values (e.g., `deferred`, `auto`) with a clear error naming the key
    - `[x]` Default resolves to `with-integration` when the key is absent
    - `[x]` Schema docs in `arc-config.yml` (project + package source) describe both values plus the rationale
      for dropping `deferred` (one-line pointer to strategy doc; no inline rationale — token economy)

### `[x]` **1.4 Update `integrate-work-unit.md` cadence refinements**

- Updated `integrate-work-unit.md` in package source and self-hosting copy with the three integration-window
  cadence refinements from PRD reqs #19-21: Step 6c pre-advance, post-PR handoff guidance, and PR URL archival.

    - `[x]` **1.4.a Step 6c → Step 8 pre-advance with three-criteria rationale**
        - Step 6c now sets `**Next Action:**` to `integrate-work-unit Step 8 — address PR review findings`,
          documents the mechanical / idempotent-or-detectable / low-redo-cost rationale, and gives
          crash-recovery instructions using `gh pr list`.

    - `[x]` **1.4.b Post-PR-creation eddy guidance (Phase 2 prose)**
        - Phase 2 now recommends handoff either before PR creation or after continuing into Step 8, and
          discourages handoff between `gh pr create` and the reviewer's first pass.

    - `[x]` **1.4.c PR URL archival rule**
        - Completion docs now keep `**Pull Request:** {pending until archival}` through review, and
          `archive-work-unit.md` fills the merged PR URL into `completion-{name}.md` as part of the archival
          commit.

### `[x]` **1.5 Sweep eligibility logic in `archive-work-unit.md` + `archive.cadence` consumption**

- Updated `archive-work-unit.md` in package source and self-hosting copy so archival requires
  `State: Complete + Integration: Merged` and documents how `archive.cadence` gates automatic vs manual archive
  execution.

    - `[x]` **1.5.a Eligibility precondition prose**
        - Workflow entry now reads the active status file, requires `**State:** Complete` and
          `**Integration:** Merged`, and stops with the mismatched field surfaced when either value is missing
          or different.

    - `[x]` **1.5.b `archive.cadence` consumption documented**
        - `with-integration` proceeds by default as a separate archival commit in the integration / batch branch;
          `manual` stops after the eligibility result unless archive was explicitly user-invoked.

### `[x]` **1.6 Surface `**Integration:**` in session-init orientation**

- Added `**Integration:**` to the session-init active-status read scope in maintainer and contributor paths;
  no probe extension needed because orientation consumes the existing `## Active Work` partial read.

    - `[x]` **1.6.a Add Integration to session-init.md Step 3 read-scope notes**
        - `session-init.template.md` and the rendered `.arc` copy now include `Integration` in the optional
          `## Active Work` field enumeration.

    - `[x]` **1.6.b Mirror in `session-init.contributor.md`**
        - Contributor session-init now explicitly preserves optional fields such as `**Integration:**` when
          partial-reading active work.

### `[x]` **1.7 Document status-field migration approach in `strategy-session-operations.md`**

- Added a status-field migration note to `strategy-session-operations.md`: lifecycle-field tightening updates
  existing active status files directly, keeps structural validation strict, and defers one-off migration helpers
  until repeated adopter demand justifies the maintenance surface.

---

## **Phase 2:** Commit-Interlock Release

_Purpose:_ Replace the inert single autonomy enum with `session.commit_interlock` /
`session.push_interlock`, then layer commit-on-task-approval behavior onto the IF structured-prompt +
interlock-config foundations. Procedure shared-by-reference with the arc-commit skill (post-IF skill thinning
made the skill markdown procedure; no code to extract).

_Design decisions:_ Config uses independent interlock release settings:
`session.commit_interlock: manual | on-task-approval` and `session.push_interlock: manual | on-handoff`.
Commit-on-task-approval fires by following arc-commit § Step 2-6 procedure on approval signal when
`session.commit_interlock: on-task-approval`. Complexity criteria from arc-commit § Step 2 bump to
manual-with-prompt — single source of truth, no duplication. Deferred-review default is safe-accumulate;
per-task fire requires explicit opt-in at deferral. Token economy: process-task-loop gets the minimum trigger
condition; depth lives in strategy-session-operations. See [`notes-session-operational-flow.md`][notes]
§ Phase 2 Rationale.

### `[x]` **2.1 Config schema migration for commit/push interlocks**

- _Outcome:_ Replaced the single `session.autonomy` probe/config surface with independent
  `session.commit_interlock` and `session.push_interlock` settings across package and rendered config,
  shell validation, session-init / handoff probe shapes, tests, and current framework docs. Removed the
  obsolete autonomy resolver and unit suite; handoff now consumes `pushInterlock`.

    - `[x]` **2.1.a Add `session.commit_interlock` config support**
        - Added enum `manual | on-task-approval` with default `manual` in the TypeScript config reader,
          shell validator, session-init settings surface, config defaults, and tests.

    - `[x]` **2.1.b Add `session.push_interlock` config support**
        - Added enum `manual | on-handoff` with default `manual`; session handoff now receives a narrow
          `pushInterlock` slot derived from the config settings surface.

    - `[x]` **2.1.c Remove/deprecate `session.autonomy` references**
        - Removed live code/tests for `session.autonomy` and updated package/source workflow references to the
          two-key interlock model. No compatibility ladder was retained.

### `[x]` **2.2 Commit-on-task-approval fire path (process-task-loop trigger + strategy-session-operations semantics)**

- _Outcome:_ Added the terse process-task-loop trigger for `session.commit_interlock: on-task-approval`
  and documented full commit-interlock release semantics in `strategy-session-operations.md`. The release path
  references `arc-commit` Step 2-6, preserves redirect grammar, and falls back to manual-with-prompt when
  atomicity complexity would require broader commit preparation.

    - `[x]` **2.2.a Process-task-loop fire trigger (terse)**
        - Added one short trigger paragraph and an `arc-commit` skill reference in both package template and
          rendered workflow copies.

    - `[x]` **2.2.b Strategy-session-operations § Commit-Interlock Release — full semantics**
        - Added the strategy section covering affirmative grammar, redirect handling, complexity fallback,
          and continued direct `arc-commit` invocability under all interlock settings.

### `[x]` **2.3 Deferred-review × commit-on-task-approval safe-accumulate**

- _Outcome:_ Documented safe-accumulate as the default deferred-review behavior under
  `session.commit_interlock: on-task-approval`, with explicit per-task commit opt-in syntax and batch
  review-on-return semantics.

    - `[x]` **2.3.a Process-task-loop deferred-review section — one-sentence reference**
        - Added the safe-accumulate default and strategy cross-reference to the package template and rendered
          process-task-loop workflow copies.

    - `[x]` **2.3.b Strategy-session-operations § Deferred-Review × Commit-Interlock Release**
        - Added the strategy section covering rationale, explicit deferral-time opt-in syntax, ambiguous
          phrasing fallback, and batch review of accumulated work on return.

### `[x]` **2.4 Session-init commit-interlock load-set adaptation**

- _Outcome:_ Added the conditional session-init load set for `session.commit_interlock:
  on-task-approval` and documented why commit-format methods stay on-demand under `manual`.

    - `[x]` **2.4.a Add conditional load logic to session-init.md Step 3**
        - Added the terse conditional load instruction to the package template and rendered maintainer
          session-init workflow copies.

    - `[x]` **2.4.b Mirror in `session-init.contributor.md`**
        - Mirrored the universal load-set note in both contributor workflow copies.

    - `[x]` **2.4.c Document load-set rationale in strategy-session-operations.md § Commit-Interlock Load-Set**
        - Added the rationale section covering eager load under `on-task-approval` and on-demand loading
          through `arc-commit` / prepare-commits under `manual`.

### `[ ]` **2.5 Contributor-role commit-on-task-approval staging boundary**

- _Goal:_ Verify and document that contributor under commit-on-task-approval stages code only — no project-level
  status-file updates, matching DEV-RULES.ARC § Commit Discipline role-separation. Contributor status files
  are gitignored and update at handoff regardless of mode.

    - `[ ]` **2.5.a Add bullet to DEV-RULES.ARC § Commit Discipline (one bullet, terse)**
        - Add: "Under `session.commit_interlock: on-task-approval`, contributor-role commit release stages code
          only — project-level status-file updates remain a maintainer responsibility. Contributor status files
          (gitignored, `user/{identity}/active/`) update at handoff regardless of interlock settings."
        - Token discipline: single bullet; full semantics in strategy doc.

    - `[ ]` **2.5.b Document full semantics in strategy-session-operations.md**
        - Cover the role-separation rule, the gitignored contributor status file, and why the handoff cadence
          stays mode-independent.

---

## **Phase 3:** Push-Interlock Release

_Purpose:_ Layer push-on-handoff behavior into the session-handoff ceremony when
`session.push_interlock: on-handoff`. Mid-session push semantics unchanged. Push-ordering invariant
(worktree-push before notes-push) enforced by per-action-checklist ordering.

_Design decisions:_ Push release is independent from commit release. `session.push_interlock: on-handoff` does
not imply `session.commit_interlock: on-task-approval`; adopters can choose handoff push while keeping commit
manual. session-handoff consumes `config.value.settings["session.push_interlock"]` from the composite handoff
probe. See [`notes-session-operational-flow.md`][notes] § Phase 3 Rationale.

### `[ ]` **3.1 Push-on-handoff fire path in session-handoff**

- _Goal:_ Fire push inside the handoff ceremony when configured; preserve mid-session-explicit-ask semantics;
  enforce push-ordering invariant.

    - `[ ]` **3.1.a Session-handoff.md fire trigger (terse)**
        - Add the trigger condition to the per-action-checklist section: "Under
          `session.push_interlock: on-handoff`, release the push-interlock as part of the handoff ceremony's
          per-action checklist.
          Mid-session push remains explicit-ask in all modes — push-on-handoff does not change non-handoff push
          semantics."
        - Token discipline: keep to a couple of lines inline; full semantics in strategy doc.

    - `[ ]` **3.1.b Push-ordering invariant enforced via per-action-checklist ordering**
        - Update or verify the per-action-checklist orders worktree-push before notes-push when both fire at
          handoff (push-ordering invariant from IF). Add a brief comment in the workflow if not already
          present.

    - `[ ]` **3.1.c Strategy-session-operations § Push-Interlock Release — full semantics**
        - Document fire-at-handoff-only (not mid-session), the push-ordering invariant, and the independence
          from `session.commit_interlock`.

### `[ ]` **3.2 Verify independent interlock settings**

- Confirm tests and docs allow all four combinations of `session.commit_interlock` and `session.push_interlock`.
  The key case is `session.commit_interlock: manual` with `session.push_interlock: on-handoff`: push-on-handoff
  must not imply commit-on-task-approval.

---

## **Phase 4:** Failure-Mode Handling + Strategy Cascade

_Purpose:_ Land the failure-mode taxonomy + per-mode recovery paths and the strategy-doc cascade
(interlock-release-aware coordination, interlock-config-aware load-set). All documentation work; recovery routines
reference existing pointers (no new checkpointing infrastructure).

_Design decisions:_ Five failure modes split into three categories (bad-state, transit, process). Crash
recovery uses existing `**Next Action:**` workflow-step pointer + `git status --porcelain` /
`git diff --cached --stat` — no new infra. P1.b (criteria in strategy-session-operations) deferred — no
downstream plan currently references the pre-advance pattern. See [`notes-session-operational-flow.md`][notes]
§ Phase 4 Rationale.

### `[ ]` **4.1 Failure-mode taxonomy + crash-recovery routine**

- _Goal:_ Document the five-mode taxonomy in strategy-session-operations and add the crash-recovery detection
  routine to process-task-loop (referenced from session-init's resume path).

    - `[ ]` **4.1.a Document failure-mode taxonomy in strategy-session-operations.md**
        - Five modes × three categories (bad-state, transit, process) with the table from PRD req #22.
        - Per-mode recovery paths: rollback dev-rule for bad-state; retry for transit; user decision for
          process.

    - `[ ]` **4.1.b Document per-mode recovery procedures**
        - For each of the five modes, write the agent-procedure for detection + recovery in
          strategy-session-operations.md. Pre-commit hook fail (mode 1) → fall back to manual-with-prompt;
          T1/T2 QG fail post-commit (mode 2) → apply rollback dev-rule; network mid-push (mode 3) → surface in
          handoff summary, retry; partial multi-commit cascade (mode 4) → same as mode 3; agent crash
          mid-cascade (mode 5) → continue/rollback prompt with detection scan.

    - `[ ]` **4.1.c Add crash-recovery routine pointer to process-task-loop.md**
        - One-paragraph addition: "On session resume after a suspected agent crash mid-cascade, run the
          recovery scan: read `**Next Action:**` workflow-step pointer; read `git status --porcelain` and
          `git diff --cached --stat`; surface mismatch and prompt continue/rollback. Full per-mode recovery
          procedures in [strategy-session-operations § Failure-Mode Recovery][strategy-session]."
        - Token discipline: paragraph in process-task-loop; details stay in strategy doc.

    - `[ ]` **4.1.d Reference recovery routine from session-init resume path**
        - Add a one-line note in session-init.md Step 5 (Assess Readiness) freshness check: "If the freshness
          gap suggests an interrupted session, run the crash-recovery routine
          ([process-task-loop § Crash Recovery][process-task-loop])."
        - Mirror in `session-init.contributor.md`.

### `[ ]` **4.2 strategy-team-coordination interlock-release-aware coordination guidance**

- Add a section covering how task ownership, handoff conventions, and concurrent-pair coordination interact
  with commit-on-task-approval vs manual commit. Concurrent pairs under commit-on-task-approval have different
  commit-rate dynamics than under manual commit; document the distinction. P2.a (concurrent-pair commit-rate
  guidance beyond basic awareness) deferred — surfaces during dogfooding if patterns emerge worth codifying.

---

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` `**State:**` enum extension covers WU lifecycle through one full cycle
  (Planning → In Progress → Complete → swept)
- `[ ]` `**Integration:**` field tracks integration window correctly through one full PR cycle
  (Awaiting PR → Awaiting review → Changes requested → Awaiting review → Ready to merge → Merged → swept)
- `[ ]` CHECK 16 blocks commits with invalid `**State:**` or `**Integration:**` enum values and enforces
  `**Integration:**` only for `State: Complete`
- `[ ]` Sweep eligibility check fires correctly (`State: Complete + Integration: Merged`)
- `[ ]` `archive.cadence: with-integration` default operates as sweep-as-you-go; `manual` defers to user
  invocation
- `[ ]` Existing active status files are valid under the tightened hook; no migration helper is introduced
- `[ ]` Step 6c → Step 8 pre-advance eliminates one metadata commit per integration cycle
- `[ ]` Post-PR-creation eddy guidance referenced in handoff decisions during integration sessions
- `[ ]` PR URL archival rule fills the durable link during archive without a post-PR metadata-only commit
- `[ ]` `session.commit_interlock: manual | on-task-approval` and
  `session.push_interlock: manual | on-handoff` replace the old `session.autonomy` ladder
- `[ ]` Commit-on-task-approval fires under task completion when
  `session.commit_interlock: on-task-approval` is configured;
  follows arc-commit § Step 2-6 procedure
- `[ ]` Complexity bumps to manual-with-prompt; never silent invocation of prepare-commits
- `[ ]` Safe-accumulate operates correctly under deferred review (no per-task fire by default)
- `[ ]` arc-commit skill remains user-invocable under all interlock settings
- `[ ]` Contributor role under commit-on-task-approval stages code only — no project-level status-file updates
- `[ ]` Push-on-handoff fires inside the handoff ceremony when
  `session.push_interlock: on-handoff` is configured
- `[ ]` Push-on-handoff does not require `session.commit_interlock: on-task-approval`
- `[ ]` Mid-session push remains explicit-ask only in all modes
- `[ ]` Push-ordering invariant holds when both worktree-push and notes-push fire at handoff
- `[ ]` Each of the five failure modes that fires recovers per the documented path
- `[ ]` Rollback dev-rule applies cleanly to bad-state failures; not invoked for transit failures
- `[ ]` Agent-crash mid-cascade surfaces correctly on session-resume with continue/rollback prompt
- `[ ]` `strategy-team-coordination` updated with interlock-release-aware coordination guidance
- `[ ]` `strategy-session-operations` updated with interlock-config-aware load-set, deferred-review ×
  commit-on-task-approval interaction, and failure-mode taxonomy
- `[ ]` Validation window (1-2 self-host sessions exercising configured interlock release settings between SOF
  integration and plan-user-sync-ux activation) — observation log in `notes-session-operational-flow.md`
- `[ ]` Downstream consumer plans (plan-agile-wu-lifecycle, plan-quality-gate-hooks, plan-worktree-foundation,
  plan-concurrent-work-conventions, plan-user-sync-ux) confirm metadata-state foundation supports their scope
  without structural reshape — verified via "Relationship" section reads before WU integration
- `[ ]` Token-economy discipline upheld: session-loaded surfaces (DEV-RULES, process-task-loop, session-init,
  session-handoff) received minimum additions; depth lives in strategy-session-operations
- `[ ]` All quality gates pass (markdown lint, TypeScript typecheck, test suite, build)
- `[ ]` Ready for integration

---

[notes]: notes-session-operational-flow.md
[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
[strategy-session]: ../../reference/strategies/arc/strategy-session-operations.md
[process-task-loop]: ../../system/workflows/arc/3_process-task-loop.md
[package-sync]: ../../reference/strategies/project/strategy-package-project-sync.md
