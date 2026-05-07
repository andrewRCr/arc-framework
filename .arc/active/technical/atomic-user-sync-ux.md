# Atomic Tasks — User Sync UX Polish

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the planned
work — discovered during execution, not required for the work unit's success criteria. No
phases or numbering hierarchy; items are flat parent-level entries under a single `## Tasks`
wrapper.

**Ordering:** Incomplete tasks (`[ ]`) stay at the top. Completed tasks (`[x]`) sink below them
in completion order (oldest completed first). See process-task-loop § Atomic Task Completion for
the full protocol.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

## Tasks

- [ ] **Consolidate branch resolution onto `WorktreeSyncStatusResult.branch`**

    - _Goal:_ Single source of truth for current branch — the worktree probe already resolves it
      internally; propagate to the result and drop the parallel `resolveCurrentBranch` calls in
      `handlers/sync.ts` and `handlers/status.ts` (handoff path). Removes 3 → 1 duplication
      surfaced during 4.6.b.

    - _Affected files:_
        - `packages/arc-framework/src/lib/git/worktree-sync.ts` — add `branch: string \| null`
          to `WorktreeSyncStatusResult`; populate in every return path.
        - `packages/arc-framework/src/handlers/sync.ts` — drop `resolveCurrentBranch`; read
          `worktree.branch` instead.
        - `packages/arc-framework/src/handlers/status.ts` — drop the `resolveCurrentBranch`
          helper added during 4.6.b; read from worktree slot in handoff path.
        - `packages/arc-framework/src/commands/status/run.ts` — `runSessionHandoffStatus`
          drops the `branch` option; reads from worktree slot when populating envelope `branch`
          field (envelope shape stays the same).
        - Test fixtures: `worktreeSync(...)` helpers in `__tests__/unit/status/run.test.ts`,
          `__tests__/unit/session-init/recommended-action.test.ts`, and any other consumers of
          `WorktreeSyncStatusResult` need a `branch: "main"` default.

    - _Test-after:_ existing test sweep covers the contract; new fixtures pass through.

- [ ] **Audit meta-project references in test file headers; strengthen DEV-RULES.ARC**

    - _Goal:_ Remove the `.arc/`-method-doc references that have crept into test file
      docstrings (e.g., "per the test-first method's batching-judgment clause"). Two-part:
      remove existing instances; tighten the rule prose so test files are explicitly in scope.

    - _Known instances (audit beyond these):_
        - `__tests__/unit/status/run.test.ts:12-15` — "Batching rationale: per the test-first
          method's batching-judgment clause..."
        - `__tests__/unit/session-init/recommended-action.test.ts` — likely same pattern.

    - _Rule strengthening:_ DEV-RULES.ARC § Documentation Boundaries already covers "code, tests,
      and durable documentation" — but the existing instances suggest authors read "code" and
      didn't think about test-file docstrings. Consider an explicit example or a sharper phrasing
      ("internal commentary in code or tests — including file-level docstrings — must not name
      methods, workflows, or strategies").

    - _Affected files:_
        - `__tests__/unit/status/run.test.ts` — strip docstring meta-refs.
        - `__tests__/unit/session-init/recommended-action.test.ts` — same.
        - `.arc/reference/constitution/DEV-RULES.ARC.md` + package-source mirror — tighten
          § Documentation Boundaries.

    - _Pre-resume sequencing:_ Both items above land BEFORE resuming task-list work next session
      — they're cleanup that keeps the WU's code in line with the framework's own discipline.
      Flag in SESSION-NOTES at handoff.

- [x] **Broaden DEV-RULES.ARC § No meta-project references in code**
    - Expanded planning-ID enumeration (added behavior IDs, requirement IDs, spec citations)
      and broadened scope from "production code" to code, tests, and durable documentation.
      Added a positive complement naming the sanctioned homes for the IDs.
    - Edited both copies (package source + `.arc/` instance).

- [x] **Task list Goal-as-protected-anchor refinement**
    - Codified Goal-first-at-root-and-required, peer descriptors as Goal siblings, Goal
      preserved across completion (commit `e90d0f13`). Restructured `2_generate-tasks.md`
      into three-pass workflow with explicit interlocks; arc-task-audit dual-purposed for
      Pass 3 (commit `f9c6afa8`). Migrated user-sync-ux Phase 3-5 to new shape (this commit).
    - Affected: `strategy-task-list-formatting.md`, `template-tasks.md`, `2_generate-tasks.md`,
      `3_process-task-loop.md`, arc-task-audit `SKILL.md` (both copies); active task list.

- [x] **Session-init DRY for partial-read structural mapping**
    - Hoisted "one grep for the section delimiter — never per-section greps; skip when a
      stable file convention places the section at a known location" into Step 3 prelude.
      Item 6 (QUICK-REFERENCE) simplified to file-convention read (`limit: ~35`, first
      section) with structural-mapping fallback only when convention breaks; item 9 retitled
      "Structural mapping" and references the prelude rule with the phase-heading delimiter.
    - Surfaced during arc-resume — agent ran a grep on QUICK-REFERENCE before partial-Read
      where the file convention made the grep avoidable.
    - Affected: `session-init.md` (`.arc/` instance + package source template).

- [x] **Fix `npm run test:unit` wrapper to honor single-file scoping**
    - Split unit and integration scripts onto dedicated config files
      (`vitest.unit.config.ts`, `vitest.integration.config.ts`) mirroring the existing
      `vitest.e2e.config.ts` pattern. Each config sets the `include` glob for its tier;
      forwarded positional args become pure filters within that tier rather than unioning
      with a baked-in directory pattern.
    - Verified: `npm run test:unit -- sync-orchestrator` and `npm run test:unit --
      __tests__/unit/sync-orchestrator.test.ts` both correctly scope to 17 tests; no-arg
      `npm run test:unit` runs the full 1005-test unit suite. Symmetric verification on
      `test:integration`.
    - Suspected `__tests__/unit/active/session-type.test.ts` worker timeout did not recur
      across the verification runs; sibling investigation deferred unless the timeout
      returns under broad parallel runs.
    - Affected: `packages/arc-framework/package.json`,
      `packages/arc-framework/vitest.unit.config.ts` (new),
      `packages/arc-framework/vitest.integration.config.ts` (new).

- [x] **Suppress info-level chatter and notes on `arc sync --json`**
    - `SyncOutput` JSON-mode branch: `log.info` and `note` are now no-ops; `log.warn`
      and `log.error` still route to stderr because they carry recovery guidance not
      reconstructible from envelope result codes (partial-publish, force-push,
      identity-absent). Every `output.log.info` site duplicated structured envelope
      fields (`worktree.result`, `notes.result`, `interlockState`); suppressing them
      makes `arc sync --json 2>&1 | jq …` parse cleanly without losing signal a
      consumer needs.
    - Surfaced when an agent handoff pipe choked on the merged stream; analysis
      narrowed the actual surface to `arc sync --json` only — mutating user commands
      (`arc user save / push / pull / fetch / sync`) don't take `--json`, and
      read-only status `--json` handlers were already info-clean.
    - E2E coverage pins the contract: paired-push stderr is info-prefix-free and
      note-block-free; prompt-policy stderr retains the `degrading` warn while
      staying info-line-free. Existing `sync-orchestrator.test.ts:721`
      `mockLog.info).not.toHaveBeenCalled()` under `json: true` continues to pass
      (mocks at `@clack/prompts` boundary; JSON-mode bypasses Clack either way).
    - Affected: `packages/arc-framework/src/lib/sync-output.ts` (JSON-mode branch +
      module docstring); `packages/arc-framework/__tests__/e2e/sync-purity.e2e.test.ts`
      (assertions added to paired-push and prompt-policy cases).

- [x] **Add TS-quality pre-commit gate for self-hosting repo**
    - New `scripts/check-ts-quality.sh` invoked from `.husky/pre-commit` after
      `check-package-sync.sh`. Detects staged changes under `packages/arc-framework/(src|__tests__)/*.ts`
      via `git diff --cached --name-only --diff-filter=ACMR`; on match, runs `lint:ts` + `typecheck` +
      `typecheck:test` in sequence and collects failures into a single end-of-run summary so all three
      gates report in one shot rather than fast-failing on the first.
    - Three independent gates because production `tsconfig.json` excludes `__tests__/`, vitest's esbuild
      transpile skips typechecking, and eslint catches issues neither `tsc` pass surfaces — third
      recurrence of the gap pattern (today's `save-load.test.ts:563` MkdirFn typecheck:test red was caught
      only by CI).
    - Verified by exercise: staged a fixture `__tests__/unit/_fixture-broken.ts` with a deliberate
      `string = 42` assignment; gate fired (`typecheck:test` flagged TS2322, exit 1); silent (exit 0) on a
      markdown-only staged change. Sibling script rather than extending `check-package-sync.sh` to keep the
      latter's name truthful.
    - Stopgap: supersedes when `plan-quality-gate-hooks.md` (backlog) lands its push-gate dispatch; the
      ATOMIC-INBOX `Adopt lint-staged in this dev repo (post plan-quality-gate-hooks)` entry tracks the
      post-plan migration that refactors this into the framework's tier-dispatch method.
    - Affected: `scripts/check-ts-quality.sh` (new); `.husky/pre-commit` (one-line addition).
