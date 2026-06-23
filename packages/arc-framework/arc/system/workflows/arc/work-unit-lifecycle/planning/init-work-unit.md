---
purpose: Initialize a work unit on a `plan/<name>` branch, or promote an in-flight errand into a work unit.
audience: agent
arc:
  methods:
    - branch-format
    - classify-work-unit
  extensions:
    - pre-push-review
---

# Workflow: Initialize Work Unit

Creates a work unit on a `plan/<name>` planning branch with a `meta-{name}.md` file in `active/` scaffolded
from the code field model (`renderMetaFile`). Also carries the promotion path for an in-flight errand that has crossed the
work-unit threshold after launch.

**When to use:** Starting a new work unit, or promoting a current in-flight errand into a tracked work
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

Promoted errands already have implementation history on a branch. The promotion path renames the errand
branch to `<type>/<name>`, creates the backing meta file, retires the errand record, skips
`activate-work-unit`, backfills spec/tasks as needed, then proceeds to task execution.

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

Both modes share the rest of the workflow. Initializing a backlog stub (Step 3) dispatches through
`arc start`, which honors the same placement-mode selection (spawn by default, `--here` in-place);
reconciling the relocated meta (Step 4, Path A) and the idempotent-resume case reconcile files that
already exist, whereas fresh scaffolding mints new ones.

Promoting an errand is a separate entry path: it starts from an existing errand branch and uses
[Promote Errand to Work Unit Path](#promote-errand-to-work-unit-path), not the numbered new-WU steps below.

## Steps

The numbered steps below are the new-work-unit initialization path. For an in-flight errand that has become
spec-worthy, jump to [Promote Errand to Work Unit Path](#promote-errand-to-work-unit-path).

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

_This step scaffolds a **fresh** work unit's branch. Initializing an existing backlog stub instead brings up
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

### 3) Initialize Backlog Subdir to Active · `arc-in-git` only

> **Skip this step** if `pm.mode` is `none` or `external`. Skip also if no backlog subdir exists
> at `backlog/{planned,provisional}/{name}/` — that is the fresh-WU path (Step 2 + Step 4 Path B).

When resuming from a backlog stub, run the `start` transition to bring the work unit up. It relocates the
per-WU subdir's artifact set (`meta-{name}.md` always, plus any `draft-*` / `notes-*` / companions) from
`backlog/{state}/{name}/` into `active/`, births the `plan/{name}` branch, writes the meta `Branch` field, and
opens the per-WU user workspace — one executor-dispatched transition, replacing the hand-run relocation. On the
normal readiness-ladder path this is the `planned → active` rung; [promote-work-unit][promote-work-unit] has
already performed `provisional → planned`.

**Resolve `Class` first.** The transition's `class-resolved` guard refuses a stub whose `Class` is still
`[TBD]`. A stub from `planned/` arrives with a resolved estimate; resolve a `provisional/` stub's `[TBD]` to a
best estimate (per [`classify-work-unit`][classify-work-unit]) in its backlog meta before running the
transition. Direct initialization from `provisional/` is otherwise tolerated only as a legacy / manual fallback.

```bash
arc start {name}          # spawn a dedicated worktree (default under full protection)
arc start {name} --here   # in-place: cut the branch in the current checkout, no spawn
```

The placement mode follows [§ Execution Modes](#execution-modes) — worktree-creating by default, `--here` when
spawning is unavailable or single-checkout development is wanted. The `worktree-occupancy` guard refuses an
in-place initialization into a checkout already holding an active WU. The relocation `git mv` is staged but **not**
committed (the executor never commits) — it bundles into the init commit below with Step 4's reconcile edits.
`arc start` surfaces an interim ROADMAP-regen advisory; Step 5 is where the hand-render lands.

The meta-file carries the intentional metadata backfilled at backlog-stub creation (`Origin`,
`Owner`, `Depends On`, `Cohort`); Step 4's Path A reconciles `Design`, `Current Workflow`, and
`Next Action` without overwriting these fields.

See [Work Planning Strategy][work-planning] for the draft-doc lifecycle.

### 4) Create or Reconcile Meta File

Two paths depending on Step 3's outcome:

**Path A — Initialized from backlog** (`active/meta-{name}.md` exists from Step 3):

`arc start` (Step 3) already moved the meta into `active/` and wrote the `Branch` field. Reconcile the
remaining planning-state fields:

1. **Design** → backticked `draft-{name}.md` filename when one exists; otherwise leave as-is
2. **Current Workflow** → `draft-design`, the entry planning stage (the executor writes this on the
   `arc start` path; set it by hand only when reconciling a meta that predates the field)
3. **Next Action** → a within-stage planning note or the `[begin current workflow]` sentinel — never a
   workflow pointer. Leave the spec-readiness call to the consuming session (`arc-plan` → `draft-design`),
   which assesses against the actual draft state.

**Class** was resolved before initialization (Step 3); confirm it still holds, or ratchet up to any realized
floor via [`classify-work-unit`][classify-work-unit].

**Preserve** `Owner`, `Origin`, `Depends On`, `Cohort`, `State: Planning`, and all other backfilled
fields — `arc start` left them untouched. The backlog stub's intentional metadata survives initialization.

**Path B — Fresh WU** (no backlog meta-file):

`arc start` scaffolds `.arc/active/meta-{name}.md` from the code field model (`renderMetaFile`) — every
managed field present, no template to drift. The scaffold sets the fresh-WU values:

1. **State** → `Planning`
2. **Owner** → the resolved `arc.identity`
3. **Branch** → the planning branch (`plan/{name}`)
4. **Current Workflow** → `draft-design`, the entry planning stage
5. **Next Action** → the `[begin current workflow]` sentinel — never a workflow pointer. The consuming
   session (`arc-plan` → `draft-design`) assesses spec-readiness against the actual draft state.

Then reconcile the judgment fields the scaffold seeds at defaults:

- **Design** → backticked `draft-{name}.md` filename when one exists; otherwise leave `[none]`
- **Class** → resolve the `[TBD]` seed via [`classify-work-unit`][classify-work-unit] — a best estimate
  against the boundary tests. Freely revisable; the ratchet protects only realized work, so an early
  estimate costs nothing.

Remaining fields take their field-model defaults.

**Idempotent.** If a meta file already exists on the branch (e.g., resuming a partial init from a
prior session, not from backlog initialization), do not recreate it. Reconcile **Branch**, **Design**,
**Current Workflow**, and **Next Action** as in Path B; preserve other field values.

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

Use this path when [run-errand][run-errand]'s Execute phase finds the current full-protection errand has crossed a
**wrapper floor** — it is no longer self-evident and single-session. The floor crossed routes the WU's entry stage:

- **Derivation** — the work now needs **design authored** (requirements, a referenced spec) → enter planning at
  `draft-design`.
- **Scale** — a determinate concern that now needs a **durable cross-session plan** (a tracked decomposition
  outliving the session) → enter `Active` for a `brief` + task-list backfill.

A bounded few in-session review passes alone do **not** cross a floor — that stays an
[extended errand][errand-class]. When a floor is reached, `arc errand promote` makes promotion one judgment (the
floor, the name/type) plus deterministic CLI.

It promotes an errand already in motion; it does not start one (cold errands enter via `arc-session --errand`).
Under **partial** protection there is no errand branch — stop the direct base-branch edits, start a normal work
unit from the base, and carry any landed errand commit as context in the new WU's spec or notes.

> [!IMPORTANT]
> `workflow-interlock`: Stop before promotion. Surface the floor crossed and its reason, the proposed
> `{type}/{name}`, and the originating `USER-INBOX` capture (if any); await approval before running the verb.

1. **Identify the crossing.** Confirm the branch is an in-flight errand backed by a record, and name the floor —
   **derivation** or **scale**. This is the judgment `arc errand promote` cannot make; the rest is deterministic.

2. **Stabilize.** The verb renames the branch, so commit any in-progress errand work as a normal errand checkpoint
   first; never fold implementation into the promotion.

3. **Promote.** Pick `{name}` (may keep the errand `<slug>`) and `{type}` ([`branch-format`][branch-format]), then
   run the verb. It renames the branch (commits preserved), mints `meta-{name}.md` at the floor's stage
   (derivation → `Planning` + `Current Workflow: draft-design`; scale → `Active`), retires the errand record, and
   prints the interim ROADMAP hand-render advisory. The rename keeps you on the branch under its new name.

   ```bash
   arc errand promote {slug} --name {name} --type {type} --floor {derivation|scale}
   ```

   Pass `--priority` / `--class` when known, or resolve `Class` at the planning entry (step 6).

4. **Commit the meta; drop the source capture.** The verb wrote `meta-{name}.md` into the working tree without
   committing. Stage it together with the hand-rendered ROADMAP and commit:

   > [!CAUTION]
   > `commit-interlock` release — commit as `workflowCommit`:

   ```text
   chore(arc): promote {slug} errand to {name} work unit

   - Create active meta for promoted work
   - Preserve errand commits on {type}/{name}

   Context: meta-{name}.md (activation)
   ```

   When the errand was adopted from a slug-matched `USER-INBOX` entry, drop it now — the intent is a tracked WU:
   `arc user inbox-remove {slug}` (idempotent; a no-op for a free-description errand).

5. **Push the WU branch; retire the old remote ref.**

   - **Extensions** · `#pre-push-review`: If `pre-push-review` is active, run its `.actions` before the push —
     halt-on-fail surfaces an actionable message; fix-and-retry or explicit-invoke bypasses. Otherwise skip.

   > [!CAUTION]
   > `push-interlock` release — `workflowPush`: `-u origin {type}/{name}`.

   ```bash
   git push -u origin {type}/{name}
   git push origin --delete <errand-branch>   # raw — destructive flag stays literal; skip if it had no upstream
   ```

   The errand record was already retired by the verb; if the branch push fails, retry before relying on
   cross-machine resume.

6. **Continue into the routed planning stage** — by the floor crossed. Do **not** run `activate-work-unit`;
   promotion already performed the branch-side activation. Resolve `Class`
   ([classify-work-unit][classify-work-unit]) here if it was not supplied at promotion.

   - **Derivation** → the meta points at `draft-design`; work the design out, then [create-spec][create-spec], then
     [generate-tasks][generate-tasks].
   - **Scale** → [create-spec][create-spec] for a `brief` anchoring the durable plan, then
     [generate-tasks][generate-tasks], then [process-task-loop][process-task-loop]. The errand's commits carry
     forward intact.

---

[create-spec]: ../../create-spec.md
[generate-tasks]: ../../generate-tasks.md
[process-task-loop]: ../../process-task-loop.md
[run-errand]: ../../supplemental/run-errand.md
[errand-class]: ../../../../../reference/strategies/arc/strategy-work-organization.md#errand-work-class
[in-flight-scope-check]: ../in-flight-scope-check.md
[commit-format]: ../../../../methods/commit-format.md
[branch-format]: ../../../../methods/branch-format.md
[classify-work-unit]: ../../../../methods/classify-work-unit.md
[dev-rules-arc]: ../../../../../system/rules/DEV-RULES.ARC.md
[dev-rules-atomicity]: ../../../../../system/rules/DEV-RULES.ARC.md#atomicity
[work-org-protection]: ../../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[work-org-roadmap]: ../../../../../reference/strategies/arc/strategy-work-organization.md#roadmap
[promote-work-unit]: ../promote-work-unit.md
[work-planning]: ../../../../../reference/strategies/arc/strategy-work-planning.md
