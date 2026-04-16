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

- [ ] **Audit session-init context load for token-usage reductions**

    **Top priority for next session — runs before resuming Task 2.7 or any other
    planned task work.** With the session-init (Task 2.5) and session-handoff (Task
    2.6) rewrites now landed, this is a good moment to audit the context load for
    token efficiency before downstream work compounds whatever accumulation exists.

    **Observation driving this:** Token usage at session-init completion (via
    `/arc-resume` through to the orientation summary) has drifted upward over the
    last several weeks: from ~29-35k in late sessions, to ~45-50k, to consistently
    ~75-80k in the last two weeks or so. Some of this is structurally unavoidable —
    ARC's configurability architecture (methods, extensions, per-mode conditionals)
    carries a documentation surface cost that a centralized-for-solo-use design
    would not pay. But the drift curve suggests there may be avoidable
    accumulation worth auditing now.

    **Scope of audit:** The session-init document set (items 1–11 plus
    configuration reads) — examine each surface for:

    - Redundant information restated across documents (the same rule echoing in
      DEV-RULES.ARC, a strategy doc, and a workflow doc)
    - Verbose guidance that could be condensed without losing signal
    - Conditional content (`arc:if team.mode`, `arc:if pm.mode`) that renders
      unnecessarily in this project's current config, or that bloats rendered
      output even when it's project-applicable
    - Documents that could move from "full read" to partial/anchored read at init
      (the task list is already the one partial-read exception — are there others?)
    - Reference material (examples, rationale, cross-references) that could defer
      to on-demand loading via workflow triggers rather than sitting in the
      session-init load set

    **Approach — thorough, favoring system integrity over reductions.** Any
    proposed cut must be validated against what the agent actually needs at
    orientation time. Cutting a rule that only fires in a rare edge case is
    still a loss if that edge case is the one the agent hits. The answer may
    legitimately be "no meaningful savings available without structural
    compromise" — that's an acceptable outcome. Hopefully the audit surfaces
    some significant savings; remains to be seen.

    **Deliverable:** Written audit — file-by-file findings with what could be
    cut or deferred, what must stay, estimated token impact per proposed change.
    Present for review *before* making any edits. Do not make changes during
    the audit pass itself; the audit and the implementation are separate review
    increments.

    **Out of scope for this audit:**

    - Restructuring the session-init workflow itself (just landed in Task 2.5)
    - Restructuring the document classification system (T1/T2/T3 from
      strategy-session-operations.md)
    - Changes to arc-methods or arc-extensions design — this is a content audit
      within the existing configurability architecture, not a reshape of it
    - Anything that would affect the WU currently in flight — defer structural
      changes that touch active workflow surfaces until after this WU merges

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

- [x] **Restructure `session-handoff.md` SESSION-NOTES guidance for signal discipline**

    **Problem:** `.arc/user/andrew/SESSION-NOTES.md` at 2026-04-15 handoff (`993d90d`)
    carried ~250 lines for the Phase 1 closeout with ~5–10 lines of actionable
    carry-over — roughly 3% signal ratio. Session-init consumption confirmed the
    pattern: commit-by-commit retrospective narration, phase preview duplicating the
    task list, design-decision retrospective already in commit bodies and notes file
    § Consequences, session-retrospective incidentals (table-width math,
    markdown-table-prettify gotcha), "Things NOT to re-do" defensive mirroring, and a
    7-line prose paragraph where Persistent Context expected whitespace. Pattern
    correlates with longer sessions — end-of-session context depth drives an "I don't
    want to lose this" preservation impulse the existing workflow didn't resist.

    **Root cause in workflow:** `session-handoff.md` § Comprehensive Handoff Format
    had structural gaps, not just missing guidance. (1) The only `CRITICAL` callout
    pushed toward MORE detail for the rarer uncommitted case; the committed-work
    default ("Simple list with commit hashes is sufficient") was a single
    unemphasized line. (2) The Persistent Context criterion ("if it's in tracked
    state, it doesn't belong here") was sharp but scoped only to Persistent Context,
    not extended to Completed Work or Additional Context. (3) Guidance order put the
    prescriptive template and "CRITICAL include more" callout first, restraint
    guidance last — agents anchored on the verbose default before reaching the
    filter. (4) No reader framing and no signal-vs-length framing — workflow never
    invoked DEV-RULES.ARC § "Write for the reader, not the author." (5) The
    long-session failure mode wasn't named, so no forcing function resisted
    preservation bias.

    **Fix applied:** Restructured the SESSION-NOTES.md portion of § Comprehensive
    Handoff Format in both `session-handoff.template.md` and the rendered `.arc/`
    copy. Surrounding sections untouched — Pre-Update Verification, WORK-STATUS.md
    block (with `team.mode` conditional), Handoff Examples 1 & 2, Save to Git Notes,
    Conditional WORK-STATUS.md Commit, Confirm Handoff.

    Structural changes: reader-framing lead ("The reader is the next session's agent
    loading from cold context"); hoisted three-criterion filter applied to all
    ephemeral sections — (a) not carried in any tracked source, (b) next session
    will act on it at step 0, (c) missing/wrong costs real rework — if any fails,
    omit; long-session bias note naming the failure mode directly; inverted
    `### Completed Work` defaults so committed = hash + one-liner is the labeled
    default and uncommitted commit-level detail is the labeled exception (examples
    preserved); five anti-patterns by name ("commit-by-commit retrospective
    narration", "phase preview describing upcoming tasks", "design-decision
    retrospective already in a commit body or notes file", "session-retrospective
    incidentals", "'Things NOT to re-do' lists") plus one for
    prose-where-whitespace-belongs in Persistent Context; Persistent Context
    criterion preserved and cross-referenced to the hoisted filter as "the same
    criterion"; dropped the parallel "What to include" / "What NOT to include" lists
    (absorbed into the filter + anti-patterns — the four original ❌ bullets are
    all subsumed). Net size: ~116 lines replacing ~94 lines (+22). Additive
    structure lands filter + bias note BEFORE the template, so agents read restraint
    guidance first instead of last.

    **Verification:**

    - Tier 1 markdown lint on `.arc/` copy: 0 errors.
    - Package template excluded from standard lint glob by repo convention
      (`.markdownlint-cli2.jsonc` ignores `packages/arc-framework/arc/**`);
      framework-sync integration test is the authoritative validator.
    - Full package test suite: 575/575 passing including
      `__tests__/integration/framework-sync.test.ts` (160ms) — confirms the template
      renders to valid `.arc/` content matching what's on disk.
    - `diff -q` between template and `.arc/` copy: differs only by the expected
      `team.mode` conditional block (10 lines), no unexpected drift.

    **Scope guard:** One subsection of one workflow file. Did NOT touch the Handoff
    Examples (already correctly brief — they anchor the new defaults), the
    `arc-handoff` skill prose (already minimal), or any other session-lifecycle file.
    Surgical incidental, not a workflow overhaul.
