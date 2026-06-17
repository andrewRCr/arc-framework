---
purpose: Initialize a work unit on a `plan/<name>` branch, or promote a `chore/<slug>` errand into a work unit.
audience: agent
arc:
  methods:
    - branch-format
    - classify-work-unit
  extensions:
    - pre-push-review
---

# Workflow: Initialize Work Unit

Creates a work unit on a `plan/<name>` planning branch with a `meta-{name}.md` file in `active/` populated
from `template-meta.md`. Also carries the promotion path for an in-flight errand that has crossed the
work-unit threshold after launch.

**When to use:** Starting a new work unit, or promoting a current `chore/<slug>` errand into a tracked work
unit. See [Branch Protection Modes][work-org-protection] for when work-unit ceremony is mandatory vs the
default path.

**What comes after:**

```text
draft-* exploration (optional, when scope warrants synthesis)
    ↓
create-spec                — requirements
    ↓
generate-tasks            — task list
    ↓
activate-work-unit          — Planning → Active; branch plan/<name> → <type>/<name>
    ↓
integrate-work-unit         — PR, review, merge to main
```

Promoted errands already have implementation history on a branch. The promotion path renames
`chore/<slug>` to `<type>/<name>`, creates the backing meta file, skips `activate-work-unit`, backfills
spec/tasks as needed, then proceeds to task execution.

---

## Execution Modes

The new-work-unit path runs in one of two modes. The mode is **resolved mechanically** from branch-protection
mode × worktree-spawn availability — never a caller flag, and never keyed on `Class` or planning depth (the
same read [run-errand][run-errand] Launch performs for the errand locus). Callers inherit the default by not
forcing in-place; the `--here` cold-start path is the one explicit in-place override.

- **In-place** — the planning branch is created in the current worktree (Step 2, `git checkout -b`) and the
  meta file is scaffolded inline (Step 4, Path B); the current worktree becomes the work unit's worktree.
  This is the single-worktree path: one work unit at a time in one checkout.
- **Worktree-creating** — spawning the work unit into a dedicated worktree creates the planning branch, the
  fresh meta file, the seeded SESSION-NOTES, and the worktree ownership marker in a single operation. The
  spawn entry point performs this; the inline Step 2 and Step 4 (Path B) are its in-place counterpart. Before
  creating the worktree, run the [in-flight scope check][in-flight-scope-check] — an advisory pass over
  in-flight work units that surfaces scope overlap and never gates.

**Default mode selection.** Resolve the mode per protection mode ([§ Branch Protection Modes][work-org-protection]):

- **Full protection** — default to **worktree-creating** wherever worktree spawning is available, so concurrent
  work units stay isolated by default; fall back to **in-place** (cut `plan/<name>` in the primary worktree's
  base checkout) when spawning is unavailable.
- **Partial protection** — no planning branch: new work proceeds directly from the base checkout (the documented
  no-ceremony default), so these numbered steps don't run.

Both modes share the rest of the workflow. Graduating a backlog stub (Step 3) dispatches through
`arc start`, which honors the same placement-mode selection (spawn by default, `--here` in-place);
reconciling the graduated meta (Step 4, Path A) and the idempotent-resume case reconcile files that
already exist, whereas fresh scaffolding mints new ones.

Promoting an errand is a separate entry path: it starts from an existing `chore/<slug>` branch and uses
[Promote Errand to Work Unit Path](#promote-errand-to-work-unit-path), not the numbered new-WU steps below.

## Steps

The numbered steps below are the new-work-unit initialization path. For an in-flight errand that has outgrown
one review increment, jump to [Promote Errand to Work Unit Path](#promote-errand-to-work-unit-path).

### 1) Ensure Clean Base Branch

```bash
git switch {base-branch}
git pull origin {base-branch}
```

Verify the working tree is clean (`git status`). If there are uncommitted changes from a prior session,
resolve them before proceeding.

Verify `{base-branch}` is at parity with `origin/{base-branch}` after pull
(`git rev-list --count {base-branch}..origin/{base-branch}` returns `0`). Non-zero indicates the pull
didn't reach parity — typically a network glitch or a fetch-then-rebase scenario; investigate before
creating the planning branch. This guard matters most on cross-machine resume, where local
`{base-branch}` may be arbitrarily behind `origin/{base-branch}` from integration work that landed
on a sibling clone.

**USER-INBOX backstop warning.** Before creating the planning branch or spawning a worktree, read the
`inboxState` slot from the current session-init probe if available; otherwise run a fresh read-only probe and
consume only that slot:

```bash
arc status --session-init --json
```

If `inboxState.ok && inboxState.value.housekeepNeeded`, surface this advisory and continue unless the user
chooses to pause:

```text
**Housekeep recommended:** starting new work with {inboxState.value.routableCount} pending capture(s) in
`USER-INBOX` — consider running `arc-housekeep` first.
```

This is a backstop, not a gate: do not refuse WU creation, do not auto-dispatch housekeep, and do not require
zero pending captures. If the user pauses to drain, run housekeep from this base-branch write context, then
re-check clean/parity before proceeding to Step 2. If identity is absent, `inboxState` is omitted, or the slot
failed, surface the degraded state only when useful and continue.

### 2) Create Planning Branch — fresh WU

_This step scaffolds a **fresh** work unit's branch. Graduating an existing backlog stub instead brings up
the branch (and opens the workspace) via `arc start` in Step 3 — skip this step on that path. Worktree-creating
mode delegates this step and Step 4 (Path B) to the spawn entry point — see [§ Execution Modes](#execution-modes);
the commands below are the in-place path._

```bash
git checkout -b plan/{name}
```

Use the planning life-phase prefix per [`branch-format`][branch-format] method.

Open the per-WU user workspace subdir (creates `user/{identity}/{name}/` and seeds
SESSION-NOTES.md from template; defensive prompt fires if a stale subdir from a prior WU
exists):

```bash
arc user open {name}
```

### 3) Graduate Backlog Subdir to Active · `arc-in-git` only

> **Skip this step** if `pm.mode` is `none` or `external`. Skip also if no backlog subdir exists
> at `backlog/{planned,provisional}/{name}/` — that is the fresh-WU path (Step 2 + Step 4 Path B).

When resuming from a backlog stub, run the `start` transition to bring the work unit up. It relocates the
per-WU subdir's artifact set (`meta-{name}.md` always, plus any `draft-*` / `notes-*` / companions) from
`backlog/{state}/{name}/` into `active/`, births the `plan/{name}` branch, writes the meta `Branch` field, and
opens the per-WU user workspace — one executor-dispatched transition, replacing the hand-run relocation. On the
normal readiness-ladder path this is the `planned → active` rung; [graduate-work-unit][graduate-work-unit] has
already performed `provisional → planned`.

**Resolve `Class` first.** The transition's `class-resolved` guard refuses a stub whose `Class` is still
`[TBD]`. A `planned/` graduate arrives with a resolved estimate; resolve a `provisional/` stub's `[TBD]` to a
best estimate (per [`classify-work-unit`][classify-work-unit]) in its backlog meta before running the
transition. Direct `provisional/` graduation is otherwise tolerated only as a legacy / manual fallback.

```bash
arc start {name}          # spawn a dedicated worktree (default under full protection)
arc start {name} --here   # in-place: cut the branch in the current checkout, no spawn
```

The placement mode follows [§ Execution Modes](#execution-modes) — worktree-creating by default, `--here` when
spawning is unavailable or single-checkout development is wanted. The `worktree-occupancy` guard refuses an
in-place graduate into a checkout already holding an active WU. The relocation `git mv` is staged but **not**
committed (the executor never commits) — it bundles into the init commit below with Step 4's reconcile edits.
`arc start` surfaces an interim ROADMAP-regen advisory; Step 5 is where the hand-render lands.

The meta-file carries the intentional metadata backfilled at backlog-stub creation (`Origin`,
`Owner`, `Depends On`, `Cohort`); Step 4's Path A reconciles `Design` and `Next Action` without
overwriting these fields.

See [Work Planning Strategy][work-planning] for the draft-doc lifecycle.

### 4) Create or Reconcile Meta File

Two paths depending on Step 3's outcome:

**Path A — Graduated from backlog** (`active/meta-{name}.md` exists from Step 3):

`arc start` (Step 3) already moved the meta into `active/` and wrote the `Branch` field. Reconcile the
remaining planning-state fields:

1. **Design** → backticked `draft-{name}.md` filename when one exists; otherwise leave as-is
2. **Next Action** → freeform planning-session prompt

**Class** was resolved before graduation (Step 3); confirm it still holds, or ratchet up to any realized
floor via [`classify-work-unit`][classify-work-unit].

**Preserve** `Owner`, `Origin`, `Depends On`, `Cohort`, `State: Planning`, and all other backfilled
fields — `arc start` left them untouched. The backlog stub's intentional metadata survives graduation.

**Path B — Fresh WU** (no backlog meta-file):

Create `.arc/active/meta-{name}.md` from `template-meta.md`. Replace the H1 title
(`# Metadata: {wu-name}`) with the actual work unit name, then apply these substitutions and overrides:

1. **State** → `Planning`
2. **Owner** → substitute the `{arc.identity}` placeholder with the resolved `arc.identity` value
3. **Branch** → current planning branch (e.g., `plan/{name}`)
4. **Spec** → backticked `draft-{name}.md` filename when one exists; otherwise `[none]`
5. **Next Action** → freeform planning-session prompt (e.g., "Run `create-spec.md`" or "Continue
   `draft-*` exploration")
6. **Class** → resolve the template's `[TBD]` default via [`classify-work-unit`][classify-work-unit] — a
   best estimate against the boundary tests. Freely revisable; the ratchet protects only realized work, so
   an early estimate costs nothing.

Remaining fields take their `template-meta.md` defaults.

**Idempotent.** If a meta file already exists on the branch (e.g., resuming a partial init from a
prior session, not from backlog graduation), do not recreate it. Reconcile **Branch** and **Spec**
as in Path B; preserve other field values.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`. Under Path A, stage the relocation moves
> `arc start` performed (meta + draft-doc + companions) together with the meta-file reconcile edits as a
> bundled init commit. Under Path B, stage the new meta file as a dedicated init commit. Subject
> per [`commit-format`][commit-format]; meta-file commit shape per [DEV-RULES.ARC][dev-rules-arc]
> § Commit Discipline.

### 5) ROADMAP regen · `arc-in-git` only

> **Skip this step** under `pm.mode: none` or `external`.

Hand-maintain by re-rendering per [Work Organization Strategy § ROADMAP][work-org-roadmap] — the meta file
landing in `active/<name>/` enters the WU into the In Flight tier.

Default: dedicated `chore(arc):` commit (`workflowCommit`). May ride the init commit (Step 4) only when the
edit is trivial (a single-row add into In Flight) — see [DEV-RULES.ARC § Atomicity][dev-rules-atomicity].

### 6) Push Planning Branch

Set upstream for the planning branch.

- **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list
  (established at session init), load and execute its `.actions` before the push. Halt-on-fail surfaces
  an actionable message; user fix-and-retries or explicit-invoke bypasses. Otherwise, skip.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin plan/{name}`.

### 7) Proceed to Next Step

- If the work needs synthesis exploration first: create `draft-*.md` documents (see [Work Planning
  Strategy][work-planning] for conventions)
- If ready for requirements: proceed to [create-spec][create-spec]

## Promote Errand to Work Unit Path

Use this path when [run-errand][run-errand]'s Execute phase discovers that the current full-protection
`chore/<slug>` errand has crossed the work-unit threshold: more than one review increment, design that needs a
referenced spec, or tracked/resumable ownership beyond an errand.

This path promotes an errand already in motion. It does not start errands; cold errands enter through
`arc-session --errand` and [run-errand][run-errand].

Under partial protection there is no `chore/<slug>` branch to promote. Stop direct base-branch edits, start a
normal work unit from the base branch, and carry any already-landed errand commit as context in the new WU's
spec or notes.

> [!IMPORTANT]
> `workflow-interlock`: Stop before promotion. Surface the threshold reason, proposed `{type}/{name}` branch,
> current `chore/<slug>` branch/upstream state, and originating `USER-INBOX` cleanup plan; await approval before
> renaming the branch, creating the meta file, pushing, or deleting the old remote branch.

1. **Confirm promotion applies** — verify the current branch is `chore/<slug>`, no active meta file already
   backs it, and the work genuinely crossed the WU threshold. If a meta file already backs the branch, resume it
   as a work unit instead; do not run errand promotion twice.
2. **Stabilize errand progress** — inspect `git status`. Do not mix implementation changes into the promotion
   ceremony commit. If needed, make a standalone errand checkpoint first; otherwise leave implementation changes
   unstaged while staging only promotion artifacts below.
3. **Choose the WU identity** — choose `{name}` and `{type}`. `{name}` may match `<slug>` when the errand name
   still describes the expanded work; rename when the WU thesis is clearer under a different slug. `{type}`
   follows [`branch-format`][branch-format].
4. **Rename the branch locally** — preserve the errand commits by renaming the existing branch, not recreating
   it:

   ```bash
   git branch -m chore/<slug> {type}/{name}
   ```

5. **Create the backing meta file** — create `.arc/active/meta-{name}.md` from
   [template-meta][template-meta]. This promoted WU starts as **Active** because implementation commits already
   exist and the branch has its execution-phase prefix. Apply these substitutions and overrides:

   1. **State** → `Active`
   2. **Owner** → substitute the `{arc.identity}` placeholder with the resolved `arc.identity` value
   3. **Branch** → current renamed branch (`{type}/{name}`)
   4. **Design** → `[none]` unless a `spec-{name}.md` already exists
   5. **Task List** → `[none]` unless a `tasks-{name}.md` already exists
   6. **Last Completed** → `Errand promoted to work unit`
   7. **Next Action** → backfill the design/task artifacts needed before further implementation

   Seed the per-WU user workspace:

   ```bash
   arc user open {name}
   ```

   Do not run `activate-work-unit` later for this WU; promotion already performed the branch-side activation.

   > [!CAUTION]
   > `commit-interlock` release — commit as `workflowCommit`:

   ```text
   chore(arc): promote {slug} errand to {name} work unit

   - Create active meta for promoted work
   - Preserve errand commits on {type}/{name}
   - Mark promotion complete without an activation ceremony

   Context: meta-{name}.md (activation)
   ```

6. **ROADMAP regen · `arc-in-git` only** — hand-maintain the ROADMAP render so the promoted meta file appears
   in the In Flight tier. This may ride the promotion commit only when the render delta is trivial; otherwise
   use a dedicated `chore(arc):` `workflowCommit` with `Context: meta-{name}.md (activation)`.
7. **Push the renamed branch and retire the errand ref** — push the new WU branch before deleting any old
   remote errand branch. If the old `chore/<slug>` branch has no upstream, skip the delete.

   - **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list
     (established at session init), load and execute its `.actions` before the `workflowPush` push.
     Halt-on-fail surfaces an actionable message; user fix-and-retries or explicit-invoke bypasses. Otherwise,
     skip.

   ```bash
   git push -u origin {type}/{name}      # workflowPush
   git push origin --delete chore/<slug> # raw — destructive flag stays literal
   ```

   If the new-branch push fails, keep the local renamed branch and do not delete the old remote ref. Surface that
   cross-machine resume now depends on retrying the push.
8. **Clean the source capture and continue** — when the errand was adopted from a slug-matched `USER-INBOX`
   entry, remove that originating entry after promotion succeeds. If the source is ambiguous, leave it and record
   the ambiguity in the WU's `Next Action`; do not run broad housekeep here.

   Backfill `spec-{name}.md` / `tasks-{name}.md` on the promoted branch as needed. When the task list is accepted,
   include meta `Design`, `Task List`, and `Next Action` updates in the task-list acceptance commit, then proceed
   to [process-task-loop][process-task-loop].

---

[create-spec]: ../../create-spec.md
[process-task-loop]: ../../process-task-loop.md
[run-errand]: ../../supplemental/run-errand.md
[in-flight-scope-check]: ../in-flight-scope-check.md
[commit-format]: ../../../../methods/commit-format.md
[branch-format]: ../../../../methods/branch-format.md
[classify-work-unit]: ../../../../methods/classify-work-unit.md
[template-meta]: ../../../../../reference/templates/arc/work-unit/template-meta.md
[dev-rules-arc]: ../../../../../system/rules/DEV-RULES.ARC.md
[dev-rules-atomicity]: ../../../../../system/rules/DEV-RULES.ARC.md#atomicity
[work-org-protection]: ../../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[work-org-roadmap]: ../../../../../reference/strategies/arc/strategy-work-organization.md#roadmap
[graduate-work-unit]: ../graduate-work-unit.md
[work-planning]: ../../../../../reference/strategies/arc/strategy-work-planning.md
