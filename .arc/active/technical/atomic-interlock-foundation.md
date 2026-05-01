# Atomic Tasks — Interlock Foundation

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

### `[x]` **Re-anchor backlog-sibling link note in `activate-work-unit.md` Step 3**

- _Outcome:_ Step 3 amended with a re-anchor note pointing at the pre-commit markdown-link
  check; package source synced. Discovered when this WU's activation commit hit broken link
  defs — sibling plan-docs and `notes-docs-content-sweep.md` referenced via short relative
  paths from PRD/task list resolved against `backlog/technical/`, but the moved files now
  live in `active/technical/`.

### `[x]` **Phase-heading shape cascade — `### **Phase` → `## **Phase` across live docs**

- _Outcome:_ Updated all live (non-archive) references to the pre-wrapper-removal phase
  heading shape. Surfaced when this session's Phase grep returned zero hits during init.
  Distinct from Task 1.4 (which tracks ADR-016 vocabulary cascade, not heading shape).
- _Files (live):_
    - `session-init` (template + `.arc/` copy) — prose reference, regex
      `^## \*\*Phase {id}:\*\*`, and structural-mapping grep `^## \*\*Phase` (3 hits per copy).
    - `strategy-quality-gates.md` (both copies) — example phase-header blocks (2 hits per copy).
    - `strategy-task-list-formatting.md` (both copies) — owner-marker example (1 hit per copy).
      Notable: this strategy codifies the format, so its own example was internally inconsistent
      with `template-tasks.md`.
    - `plan-arc-modes.md` (backlog) — Full/Lite verification skeleton examples (2 hits).
    - `notes-docs-content-sweep.md` (backlog) — canonical-shape illustrations (2 hits).
- _Out of scope:_ `.arc/reference/archive/**` left alone (frozen historical record under the
  old shape). `system/.internal/pristine.json` regenerates via CLI infrastructure.

### `[x]` **Lean pass on `session-handoff.md` (post-4.2 cleanup)**

- _Outcome:_ −73 lines net (552 → 479). Dropped Pre-Update Verification section — probe carries
  `dirty` / `worktree` / `active`; `git log` and `git rev-parse` fold into the steps that need
  them. Confirm Handoff lost Session Summary + Uncommitted Work blocks; verbal output is now
  state · sync · next-session with conditional surfaces (unpushed worktree, diverged worktree,
  declined status-file commit). SESSION-NOTES `## Completed Work` renamed `## Uncommitted Work`
  and scoped to uncommitted-only (committed work fails filter criterion #1 — tracked sources
  carry it). Anti-patterns 7 → 4 (consolidated restate-tracked-content and forward-looking
  variants). Example 2 dropped; Example 1 SESSION-NOTES updated to match new shape.
- _Correctness fix folded in:_ Worktree Push under auto-push now reads "anything unpushed"
  (probe local-ahead OR step 3 chore commit), closing a 4.2-introduced staleness gap where the
  probe-captured worktree state could miss step 3's `chore(status): handoff` commit and skip
  pushing it. Manual-commit summary line uses the same combined signal.
- Both copies (`.arc/` + package template) in sync; Tier 1 lint clean.

### `[x]` **Add HEAD hash slot to session-handoff probe envelope**

- _Outcome:_ Probe envelope carries the current HEAD short-hash so the handoff workflow reads
  it inline instead of running a separate `git rev-parse` call. New `lib/git/head-hash.ts` module
  (`runHeadHashStatus` + `HeadHashResult`) follows the dirty-state probe pattern; soft-null on
  empty stdout, exec failures propagate to the probe wrapper. `SessionHandoffResult` and
  `SessionHandoffProbes` gain the `head` slot; `runSessionHandoffStatus` extends the parallel
  fan-out 6 → 7. Handler wires `runHeadHashStatus({ exec: gitExec })`. Unit tests added for the
  helper (4 cases) and the orchestrator (3 new tests covering hash, null, and runtime error
  isolation). Workflow consumption updated in both copies — step 4 reads `head.value.hash` with
  a single rev-parse refresh when step 3 fired a chore commit (post-commit HEAD is the right
  anchor). Tier 2 clean: typecheck, lint, 930 unit + 49 e2e tests pass, markdown lint.

### `[x]` **Define unpushed-count formula in `session-handoff.md` Push Sequence**

- _Outcome:_ Push Sequence § Worktree Push gained an explicit count formula
  (`N = worktree.value.ahead + 1 if step 3 committed`) used by both the auto-push gate and the
  manual-commit surface message. Confirm Handoff conditional surface retriggered on `N > 0` and
  push-did-not-fire (was `worktree.value.state === "local-ahead"`, which missed the
  step-3-on-clean-worktree case and rendered probe-stale `{ahead}`). The agent already knows
  whether step 3 committed in-conversation, so the count derives locally — no re-probe. Both
  copies (`.arc/` + package template) in sync; markdown lint clean.

### `[x]` **Tighten arc-\* skill `description` frontmatter — drop "Use when…" clauses**

- _Outcome:_ All 8 canonical arc-\* skill descriptions tightened to drop redundant "Use when…"
  clauses bloating harness-menu rendering. Semantic gates carrying real disambiguation folded
  into the main clause: `arc-plan` retains "not for use during task execution"; `arc-task-review`
  retains "beyond the completion report" and adopts task-interlock vocabulary in place of
  "mandatory stop". `arc-resume` rephrased to resolve the init-vs-resume tension ("Initialize a
  new ARC session with full project context — resume work from the prior handoff"). Aggregate
  description length: ~1696 → ~805 chars across 8 skills, ~52% reduction.
- _Files:_ All 4 mirrors per skill — `packages/arc-framework/arc/system/skills/<skill>/SKILL.md`
  (canonical), `.arc/system/skills/<skill>/SKILL.md`, `.claude/skills/<skill>/SKILL.md`,
  `.codex/skills/<skill>/SKILL.md` — 32 files total. `arc-plan` and `arc-task-review` converted
  from YAML folded scalar (`>-`) to single-line bare scalars now that the descriptions fit.
- _Sync state:_ This machine's harness copies (`.claude/`, `.codex/`) updated. Secondary-machine
  harness copies remain stale — SESSION-NOTES persistent-context entry expanded to cover all 8
  skills (was previously scoped to `arc-handoff` only).
- _Follow-up:_ Investigate why `arc-setup` doesn't surface in the Claude Code skill menu while
  other arc-\* skills do. Likely tied to `disable-model-invocation: true` in its frontmatter, but
  worth confirming the harness behavior.
- Markdown lint clean (222 files, 0 errors).

### `[x]` **Tighten commit-msg validator + Phase/Task and workflow-step-pointer conventions**

- _Outcome:_ Two soft-warning false-positives from the Phase 6 close commit drove a tightening
  pass across the validator and its underlying conventions. RULE 6 regex narrowed to
  `Phase [0-9]+\.[0-9]+($|[^.])` so 3+-segment IDs (e.g., `5.3.a`) no longer false-fire as
  Phase X.Y misnomers. RULE 7 gained workflow-step-pointer recognition: when the staged status
  file's `**Next Action:**` matches `<workflow-name> Step <N> — <description>`, the
  freshness-warning suppresses (handles the verify→integrate transition where Next Task
  legitimately stays at the just-completed final task because no further task exists).
- _Convention codified:_ `strategy-task-list-formatting.md` § Phase Headers gained a "Phase
  numbering" paragraph stating phases are single integers; `Phase X.Y` is always a task
  misnomer; `Phase X` remains valid for whole-phase references. `session-handoff.md` §
  Workflow step pointer tightened to specify the literal format
  (`<workflow-name> Step <N> — <description>`) and call out that the validator and
  session-init's sessionType inference both key on this prefix.
- _Files (7):_ 3 changes × 2 mirrors each — `strategy-task-list-formatting.md`,
  `session-handoff.md` (`.template.md` extension on package source), `commit-msg`. Markdown
  lint clean; shellcheck exit 0.
- _Validation:_ The next ARC commit using the new conventions exercises the path; a clean
  Phase 6 close on a future WU will produce a no-warning commit-msg pass.
