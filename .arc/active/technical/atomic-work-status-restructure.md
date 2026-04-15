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

- [ ] **Add CI drift check for Framework files**

    **Motivation:** `scripts/check-package-sync.sh` stays a warning locally
    (ergonomic for iterative edit flows, solo-maintainer scale). Defense-in-depth
    calls for a hard gate at the integration boundary where drift compounds —
    once it lands on main, adopters get it. CI is the right layer for that.

    **Scope:** Add a CI step (new job or step in existing workflow under
    `.github/workflows/`) that fails when Framework-classified files in `.arc/`
    diverge from their package-source counterparts. Reuse the classification logic
    from `scripts/check-package-sync.sh` where possible — same manifest lookup,
    same `Framework` filter — but instead of warning on staged-but-unsynced,
    error on committed-but-unsynced.

    **Design considerations:**

    - **Trigger scope:** Run on PRs targeting `main` and on push to `main`. Skip
      feature branches (noisy — mid-WU work legitimately has unsynced state).
    - **Template-vs-rendered comparison:** The check can't do a raw `diff` because
      package sources contain `arc:if` conditionals and `{{REPO_ROOT}}` placeholders
      that render-strip / substitute into `.arc/`. Options: (a) render the template
      using the same logic the CLI uses during `arc init` / `arc update`, then
      compare; (b) strip known conditional blocks and placeholders before diff;
      (c) check the manifest's content hash instead of file content. Option (a) is
      cleanest but needs access to the rendering code. Option (c) is simplest if
      the manifest records hashes. Verify before choosing.
    - **Error output:** When drift is detected, surface the specific files and a
      direction-of-edit hint (which copy is newer, based on git blame or mtime).
      Match the warning output shape for consistency.
    - **False positive budget:** Zero. If the check fires, it should be a real
      drift. Any known-benign case (template placeholders, conditionals) must be
      normalized in the comparison.

    **Verification:** Branch-push to trigger the workflow. Seed an intentional
    drift on the test branch to confirm the check fails loudly. Revert the drift,
    confirm the check passes. Do NOT merge the test branch — reset and clean up.

    **Out of scope:**

    - Changing `scripts/check-package-sync.sh` local behavior (stays warning)
    - Adding sync automation (auto-propagating edits between copies)
    - Anything that touches the manifest schema or `arc update` logic

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
