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
