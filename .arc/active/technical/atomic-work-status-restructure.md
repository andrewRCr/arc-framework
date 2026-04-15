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

- [ ] **Port `session-handoff.md` / `session-init.md` error-handling sections to package source**

    **Drift:** Commit `fbcd5b8` (2026-03-27, "docs(arc): sync error guidance for
    session workflows") added error-handling guidance to
    `.arc/system/workflows/arc/session-lifecycle/session-handoff.md` and
    `session-init.md` only — did not mirror to the package template sources.
    Sync discipline violation.

    **Root cause (now known):** `scripts/check-package-sync.sh` did not exist in
    2026-03-27. It was added 10 days later in `fc83af7` (2026-04-06). The drift
    predates the warning hook; no missed enforcement at the time of drift.

    **Fix direction:** `.arc/` → package (opposite of normal sync flow, but matches
    the original commit's intent). Verify the package template filenames first —
    session-handoff uses `.template.md`; confirm session-init's filename.

    **Sweep:** Grep package source vs `.arc/` across the full
    `system/workflows/arc/session-lifecycle/` directory. Compare diffs, excluding
    expected `arc:if` conditionals that render-strip legitimately.

    **Scope guard:** If the sweep surfaces ≤2 additional drift points, fix in the
    same atomic. If >2, stop, write findings as a new entry in this file, raise
    for discussion.

    **Related design question (out of scope, note only):** Whether
    `check-package-sync.sh` should be upgraded from warning to error is a separate
    design call. Not part of this atomic.

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
