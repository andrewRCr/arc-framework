# Atomic Tasks — Work-Status Restructure

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
planned work — discovered during execution, not required for the work unit's success
criteria. Flat checkbox list, no numbering hierarchy.

**Ordering:** Incomplete tasks (`[ ]`) stay at the top. Completed tasks (`[x]`) sink
below them in completion order (oldest completed first). See process-task-loop §
Atomic Task Completion for the full protocol.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

- [x] **Fix `.husky/pre-commit` exit-code propagation**

    **Problem:** Commits that should be blocked by the ARC pre-commit hook land
    silently. The ARC hook itself is correct (exits 1 on errors), but
    `.husky/pre-commit` runs two commands without `set -e`:

    ```bash
    bash .arc/system/githooks/pre-commit
    bash scripts/check-package-sync.sh
    ```

    Husky's exit code = exit of the last command. `check-package-sync.sh` is
    warning-only and always exits 0, so ARC-hook errors are swallowed. Observed
    during 2026-04-15 handoff: direct-to-main commit under `branch.protection: full`
    printed the FAILED message and landed anyway (`417a0f5`, reset).

    **Regression introduced:** commit `fc83af7` (2026-04-06, Phase 1 package-project
    sync safeguard) added the second line without `set -e`. 9 days silent. No
    other hook errors happened to fire in the window, so nothing else was caught.

    **Fix applied:** `set -e` at the top of `.husky/pre-commit` with a short comment
    explaining why (prevents future line additions from re-introducing the bug).
    `commit-msg` is single-line and unaffected — left alone.

    **Verification:** Scratch git repo in `/tmp` — reproduced the bug without the
    fix (commit landed despite simulated ARC hook error), then confirmed the fix
    blocks (commit rejected, second command did not even run due to early exit).
    Avoided touching real main.

- [x] **Port `session-handoff.md` / `session-init.md` error-handling sections to package source**

    **Drift:** Commit `fbcd5b8` (2026-03-27, "docs(arc): sync error guidance for
    session workflows") added error-handling guidance to
    `.arc/system/workflows/arc/session-lifecycle/session-handoff.md` and
    `session-init.md` only — did not mirror to the package template sources.
    Sync discipline violation.

    **Root cause (now known):** `scripts/check-package-sync.sh` did not exist in
    2026-03-27. It was added 10 days later in `fc83af7` (2026-04-06). The drift
    predated the warning hook; no missed enforcement at the time of drift.

    **Fix applied:** Ported both error-handling blocks `.arc/` → package template.
    `session-handoff.template.md` gained the `**Error handling:**` block after the
    "arc user save" manual section, before `### Conditional WORK-STATUS.md Commit`.
    `session-init.template.md` gained the `**Load error handling:**` nested list
    after the "tracked state + git log" fallback guidance.

    **Sweep:** Full diff of `.arc/system/workflows/arc/session-lifecycle/` vs
    package counterparts. Session-loop identical. Session-handoff and session-init
    differences reduce to expected `arc:if` conditionals (team.mode, pm.mode) and
    the `{{REPO_ROOT}}` template placeholder. No additional drift — 2 drift points
    total, both fixed.

    **Related design question (out of scope, note only):** Whether
    `check-package-sync.sh` should be upgraded from warning to error is a separate
    design call. Not part of this atomic.

- [x] **Add CI drift check for Framework files**

    **Motivation:** `scripts/check-package-sync.sh` stays a warning locally
    (ergonomic for iterative edit flows, solo-maintainer scale). Defense-in-depth
    via CI — a hard gate at the integration boundary where drift compounds once
    it lands on main and adopters get it.

    **Implementation:** Added `__tests__/integration/framework-sync.test.ts` as a
    vitest integration test rather than a standalone CI step. Rationale: the test
    runner is already wired into CI (`npm run test:integration`), vitest imports
    `render.ts` natively so no duplication of the render logic, assertion output
    produces clean per-file drift reports, and local `npm test` surfaces drift
    during development. The test reads the manifest, iterates Framework files,
    renders package source using `renderTokens` + `renderConditionals` with the
    stored `install_config`, and compares to `.arc/`. REPO_ROOT is extracted from
    `.arc/reference/QUICK-REFERENCE.md` so the check is cwd-independent (CI and
    local runs produce the same rendered output).

    **Baseline drifts discovered and fixed in this atomic** (the check fired on
    first run and surfaced 4 pre-existing drifts):

    1. `.arc/system/workflows/arc/session-lifecycle/session-init.md` line 28 —
       `<your-repo-root>` placeholder text replacing what should have been the
       rendered `{{REPO_ROOT}} (repo root)` token. Synced `.arc/` to the rendered
       template output.
    2. `.arc/system/workflows/arc/work-unit-lifecycle/activate-work-unit.md`
       lines 98–100 — 4-space vs 3-space indentation on a code fence inside a
       numbered list item. Package source (3-space, correct list-body alignment)
       is authoritative per `strategy-package-project-sync.md`; synced `.arc/`.
    3. `.arc/system/workflows/arc/3_process-task-loop.md` line 215 — `.arc/` had
       a flat single-mode atomic capture bullet; the template had gained a
       multi-PM-mode conditional structure (`arc-in-git` / `external` / `none`
       branches) that never propagated down. Synced `.arc/` to the rendered
       template output.
    4. `packages/arc-framework/arc/system/workflows/arc/initial-setup/02_define-project.template.md`
       — bidirectional drift. Template had an external-only bridge block outside
       of any `## Next Step` section; `.arc/` had a full `## Next Step` section
       with discovery prose that didn't exist in the template. Resolved by
       restructuring the template: removed the standalone external bridge, added
       a proper `## Next Step` section after `## Maintaining Project Documents`
       with two conditional branches — `pm.mode != external` gets the prose
       (clear context, `/arc-resume`, discovery mode); `pm.mode == external` gets
       the bridge to `03_configure-external-integration.md`. `.arc/` already had
       the correct rendered shape, so no `.arc/` edits needed.

    **Verification:** Integration test suite ran all 104 tests green after
    fixes, including `framework-sync.test.ts`. No regressions in the other 103
    existing tests. Full markdown lint and typecheck also green.

    **Scope note:** Finding 4 baseline drifts on first run blew my self-imposed
    "≤2 drifts" scope guard, so I stopped and reported. User approved fixing all
    4 inline as Option A, with explicit direction on the `02_define-project`
    bidirectional case. The check's first run doubled as a baseline sweep — now
    that it's green, subsequent drift is caught immediately.

    **Follow-on observation (not acted on):** `scripts/check-package-sync.sh`
    local warning hook could be reinforced by upgrading to error at a multi-dev
    scale, but the current CI check covers the hard-gate concern without
    constraining iterative edit flows locally. Re-evaluate when contributor
    activity picks up during/after the rebrand WU.
