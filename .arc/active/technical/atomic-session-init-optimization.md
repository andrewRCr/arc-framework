# Atomic Tasks — Session-Init Optimization

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
planned work — discovered during execution, not required for the work unit's success
criteria. No phases or numbering hierarchy; items are flat parent-level entries under
a single `## Tasks` wrapper.

**Ordering:** Incomplete tasks (`[ ]`) stay at the top. Completed tasks (`[x]`) sink
below them in completion order (oldest completed first). See process-task-loop §
Atomic Task Completion for the full protocol.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

## Tasks

### `[x]` **Strip spurious extension-point marker from `integrate-work-unit.md` step 5**

- _Outcome:_ Discovery during 3.R.k.b end-to-end sanity: the new `arc extensions status --all`
  flagged `pre-merge-inbox-review` (at `integrate-work-unit.md:166`) as an orphan. Root cause:
  step 5's heading carried the extension-point marker suffix (middle-dot plus backtick-hashtag
  name) for parallel visual structure with step 6 (Pre-Merge Review), but step 5 is a
  PM-mode-conditional step with no `.actions` dispatch and no active-extensions list reference.
  The marker's contract (extension fire point) didn't apply. Fix: dropped the suffix from
  step 5's heading; markdown slug autogeneration preserves the `#pre-merge-inbox-review`
  anchor for link targets. Two-copy sync across `.arc/` and `packages/arc-framework/arc/`.
  Scanner now reports 0 orphaned refs repo-wide.

### `[x]` **D7a `.template.md` fallback in `validate-links.sh`**

- _Outcome:_ D7a (Task 3.4) checked staged links against on-disk file existence but had no
  awareness of the package source's `.template.md` rename convention. Surfaced when Task 3.5's
  edits restaged `activate-work-unit.md` / `archive-work-unit.md` / `prepare-commits.md` /
  `strategy-session-operations.md` in `packages/arc-framework/arc/`: links targeting
  `session-init.md`, `session-handoff.md`, `3_process-task-loop.md`, `2_generate-tasks.md`
  failed because the source-tree files carry the `.template.md` suffix. Fix: in
  `validate_target()`, when a `.md` target doesn't exist, try `<base>.template.md` before
  emitting a diagnostic. Existence-based fallback — no source-location gating needed since
  `.arc/` carries no `.template.md` files. Two-copy sync to both script copies. Two new
  integration tests in `validate-links.test.ts` (happy-path fallback resolution + negative
  confirms fallback doesn't mask real breakage).

### `[x]` **arc-commit skill: hoist commit-granularity tests into Step 1**

- _Outcome:_ Discovered during the 5.0.e/5.0.g commit flow: agent followed the skill's
  "simple path" (Step 4) and was about to hunk-split the task list across two commits to keep
  1:1 task-ID-to-checkbox granularity — exactly the anti-pattern commit `0a42fc5` (2026-04-23)
  added to prepare-commits to prevent. Root cause: the load-bearing granularity tests
  (scope/reversibility/tracking-docs-ride) live only in prepare-commits.md, which the simple
  path doesn't load. Step 1's "Confirm whether changes represent one logical task or multiple
  interleaved tasks" carried no test for determining "logical". Fix: hoisted the three tests
  into Step 1 of arc-commit/SKILL.md as a compact triage block (~8 lines added, reaches both
  simple and complex paths). Five-copy sync (canonical package source → `.arc/` →
  `.claude/`/`.codex/`/`.gemini/` harness copies). Also tightened the "Tracking docs ride
  with content commits" bullet in prepare-commits.md (both copies) to name the hunk-split
  anti-pattern alongside the existing meta-commit one — symmetric failure modes deserve
  symmetric naming. Pattern: intentional restatement at execution points (per
  `tasks-structural-validation.md` finding) — skill carries compact triage; workflow carries
  expanded reference. prepare-commits remains self-contained for callers reaching it via
  `process-task-loop`, the `commit-format`/`commit-context-format` methods, and the
  `pre-stage-review` extension. Tier 1 lint clean.

### `[x]` **DEV-RULES.ARC § Task Execution: trim "One task at a time" duplication with process-task-loop**

- _Outcome:_ Dropped the four operational bullets (complete-one-increment /
  mark-complete-immediately / mandatory-stop / implied-permission) under § Task Execution →
  "One task at a time" in DEV-RULES.ARC (both copies); kept the principle paragraph +
  contributor note + workflow pointer. Implied-permission semantics relocated under
  process-task-loop's MANDATORY STOP step (both copies) so the rule still has a home — it's
  the only one of the four bullets that wasn't already covered by the workflow's completion
  protocol. The "Quality gate failure" 4-step protocol named as a softer candidate stayed
  as-is — it's a constitutional rule, not a procedural restatement, and process-task-loop
  doesn't currently host it.

### `[x]` **`arc user fetch` — remove overwrite prompt**

- _Outcome:_ Dropped the `OVERWRITE_CONFIRM_MESSAGE` prompt block from `handleUserFetch`
  (`packages/arc-framework/src/handlers/user.ts`); fetch now always force-fetches when local
  notes exist, matching `git fetch` convention (ref-only update, working files untouched).
  Pull retains the prompt — it does restore files. Removed the `--yes` flag from the
  `arc user fetch` CLI surface (`src/cli.ts`) and the `yes` field from `UserFetchOptions`.
  Updated unit tests (`__tests__/unit/user-handlers.test.ts`): kept no-local-notes and
  missing-remote-ref cases, replaced "prompts and confirms" with a no-prompt force-fetch
  case, dropped the cancel / `--yes` / non-TTY tests (no longer reachable). Test count Δ−3
  (1091 → 1088 unit/integration).

### `[x]` **Slash-form skill-syntax cleanup pass**

- _Outcome:_ Generalized `/arc-resume` / `/arc-handoff` / `/arc-commit` to bare skill names
  across live framework prose. Files updated (two-copy where applicable):
  `system/workflows/arc/initial-setup/01_verify-and-configure.md`,
  `system/workflows/arc/initial-setup/02_define-project.md` (+ package `.template.md`),
  `system/workflows/arc/session-lifecycle/session-loop.md`,
  `reference/analysis/analysis-modes-solo-dev-blind-spot-audit.md`, active
  `prd-session-init-optimization.md`. Convention applied: bare skill name in body prose;
  parenthetical "(invocation syntax is agent-specific)" hint at first introduction in a file.
  Skipped: directory-path references (`system/skills/arc-resume/SKILL.md` paths in
  `add-agent.md` and `strategy-package-project-sync.md`) — paths, not invocations. Skipped:
  historical task-list completion notes and notes-file metadata referencing the convention
  pivot itself — archives stay as-is per convention. Tier 3 gates clean post-sweep.
