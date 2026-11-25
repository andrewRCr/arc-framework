---
purpose: Start a work unit in Planning, or promote an in-flight errand into a work unit.
audience: agent
arc:
  methods:
    - branch-format
    - classify-work-unit
---

# Workflow: Initialize Work Unit

Starts a work unit in Planning: `arc start` creates its meta record from the code field model (`renderMetaFile`) and
holds a checkout for it, with no branch until activation creates one. Also carries the promotion path for an in-flight
errand that has crossed the work-unit threshold after launch.

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
activate-work-unit          — Planning → Active; creates the <type>/<name> work branch
    ↓
integrate-work-unit         — PR, review, merge to main
```

Promoted errands already have implementation history on a branch. The promotion path cuts `<type>/<name>` at the
Errand's tip and turns the Errand's record into the work unit's receipt-bearing meta in one write, settling the exact
originating identity and checkout occupancy there. A scale-floor promotion enters `Active` and skips
`activate-work-unit`; a derivation-floor one plans on the promoted branch until activation. Either backfills spec and
tasks as needed.

---

## Execution Modes

The new-work-unit path runs in one of two placement modes. Placement is never keyed on `Class` or planning depth:
under full protection, callers inherit spawned placement by omitting a flag, while `--here` is the explicit
in-place escape hatch.

- **Spawned** — `arc start` creates a dedicated worktree, detached at the base branch's tip, and claims that checkout
  for the WU. Before spawning, run the [in-flight scope check][in-flight-scope-check] — an advisory pass over
  in-flight work units that surfaces scope overlap and never gates.
- **In-place** — `arc start --here` converts the current checkout into the WU-owned checkout, leaving its `HEAD` where
  it stands. When that checkout is the physical primary, the primary is occupied until exact WU teardown, or a release
  (`arc locus release`), removes the WU marker: it is not also the launchpad or available to an Errand, grooming pass,
  housekeep drain, or another WU. Teardown also restores base, which makes it the free primary again.

**Default mode selection.** Resolve the mode per protection mode ([§ Branch Protection Modes][work-org-protection]):

- **Full protection** — default to **spawned** placement. If spawning is unavailable or deliberate
  single-checkout work is required, rerun explicitly with `--here`; never silently fall back to occupying the
  primary.
- **Partial protection** — new work proceeds directly from the base checkout (the documented no-ceremony default), so
  these numbered steps don't run.

Both modes dispatch through `arc start`, which establishes the exact WU role as part of placement. Starting a backlog
stub (Step 3) uses the same default/escape-hatch contract; reconciling the started stub's meta (Step 4, Path A) and the
idempotent-resume case reconcile records that already exist, whereas a fresh start creates new ones.

Promoting an errand is a separate entry path: it starts from an existing errand branch and uses
[Promote Errand to Work Unit Path](#promote-errand-to-work-unit-path), not the numbered new-WU steps below.

## Steps

The numbered steps below are the new-work-unit initialization path. For an in-flight errand that has become
spec-worthy, jump to [Promote Errand to Work Unit Path](#promote-errand-to-work-unit-path).

### 1) Check the inbox

**Inbox backstop warning.** Before starting, read the `inboxState` slot at the current agenda's `residual.inboxState`
when available; otherwise run a fresh read-only probe and consume only that slot:

```bash
arc status --session-init --json
```

If `inboxState.ok && inboxState.value.housekeepNeeded`, surface this advisory and continue unless the user
chooses to pause:

```text
**Housekeep recommended:** starting new work with {inboxState.value.routableCount} pending capture(s) in your
inbox — consider running `arc-housekeep` first.
```

This is a backstop, not a gate: do not refuse WU creation, do not auto-dispatch housekeep, and do not require
zero pending captures. If the user pauses to drain, run housekeep, then continue at Step 2. If identity is absent,
`inboxState` is omitted, or the slot failed, surface the degraded state only when useful and continue.

### 2) Start a fresh WU

_Initializing an existing backlog stub uses Step 3 instead._

```bash
arc start {name} --new          # spawned placement (full-protection default)
arc start {name} --new --here   # explicit in-place placement
```

The verb creates the WU's meta record in Planning, recording you as its `Owner`, and establishes the checkout as
WU-owned. It writes only records: nothing is staged, committed, or pushed. A spawned start emits the exact
next-session recipe; consume that recipe and skip Step 4. On `--here`, continue with Step 4 in the now WU-owned
checkout. If that checkout is the physical primary, do not allocate transient work there until the WU exits through
guarded teardown.

### 3) Start a Backlog Stub · `arc-in-git` only

> **Skip this step** if `pm.mode` is `none` or `external`. Skip also when `arc status {name}` finds no backlog stub
> named `{name}` — that is the fresh-WU path (Step 2 + Step 4 Path B).

When starting from a backlog stub, run the `start` transition to bring the work unit up. It moves the stub's records
(its meta, plus any draft, notes, and companions) to active placement in one write, records you as its `Owner`, and
holds the checkout for it as Step 2 does. On the normal readiness-ladder path this is the `planned → active` rung;
[promote-work-unit][promote-work-unit] has already performed `provisional → planned`.

**Resolve `Class` first.** The transition's `class-resolved` guard refuses a stub whose `Class` is still
`[TBD]`. A planned stub arrives with a resolved estimate; for a provisional stub's `[TBD]`, pass a best estimate (per
[`classify-work-unit`][classify-work-unit]) as `--class`. Starting a provisional stub directly is otherwise tolerated
only as a legacy / manual fallback.

```bash
arc start {name}          # spawn a dedicated worktree (default under full protection)
arc start {name} --here   # in-place: hold the current checkout, no spawn
```

The placement mode follows [§ Execution Modes](#execution-modes) — spawned by default, `--here` only when the
caller explicitly chooses in-place work. The session locus occupancy guard refuses an in-place start into an
occupied checkout; it never displaces the current role. Like a fresh start, it writes only records.

On a spawned start, consume the emitted `Next session` recipe before continuing. The common invariant is the
spawned WU worktree: post-create provisioning and registered harness-dir copy have already run there, so the next
session's effective config and scripts resolve from that root. Do not continue planning from the invoking checkout
after a spawned start succeeds.

- **Claude Code** — tell the user to start a fresh session in the emitted worktree path and invoke `/arc-session`
  there. `EnterWorktree` is the escape hatch, for a user who asks to keep this session: call it with the emitted path,
  then re-run `/arc-session`. The user's terminal stays at the invoking checkout, and Claude Code's worktree guard then
  refuses edits and some commands that reach outside the worktree.
- **Codex CLI** — no live-session relocate. Do not launch nested Codex from a shell escape inside the current
  session. Tell the user to open a fresh terminal (or end this session and reuse the terminal), run
  `codex --cd <worktree-path>`, then invoke `arc-session`. The invoking no-active-WU session needs no handoff unless
  extra context surfaced after the start and has not been captured.
- **Other harnesses** — enter the emitted worktree root by the harness-native mechanism, then invoke that
  harness's ARC session entry. Record only capability differences forced by the harness's own discovery model.

Step 4's Path A then runs in that next session, from the new worktree, before its planning stage: name it in the
handoff, since `arc repoint-design` acts only on the checkout's own work unit.

The meta carries the intentional metadata set at backlog-stub creation (`Origin`, `Depends On`, `Cohort`); Step 4's
Path A reconciles `Design` and `Next Action` without overwriting these fields.

See [Work Planning Strategy][work-planning] for the draft-doc lifecycle.

### 4) Reconcile the Meta

Two paths depending on Step 3's outcome. `State`, `Owner`, `Class`, and `Current Workflow` are the verbs' to write;
`Design` and `Next Action` are hand edits the save below persists.

**Path A — Started from a stub** (Step 3 ran):

`arc start` (Step 3) already moved the meta to active placement. Confirm the resolved Class still holds, or ratchet
it up to the realized floor via [`classify-work-unit`][classify-work-unit]. Persist any ratchet with
`arc set-class <Class> {name}` before reconciling the remaining fields:

1. **Design** → for a stub specified before its start, run `arc repoint-design spec-finalized`, which points
   `Design` at the spec, removes the draft record, and advances `Current Workflow` to `generate-tasks`. Otherwise,
   the backticked `draft-{name}.md` filename when one exists, or leave it as-is.
2. **Current Workflow** → `draft-design`, the entry planning stage, which `arc start` sets, or `generate-tasks` after
   item 1's repoint — no hand-set needed
3. **Next Action** → a within-stage planning note or the `[begin current workflow]` sentinel — never a
   workflow pointer. Leave the spec-readiness call to the consuming session (`arc-plan` → `draft-design`),
   which assesses against the actual draft state.

**Preserve** `Origin`, `Depends On`, `Cohort`, and all other fields set at stub creation — `arc start` left them
untouched. The backlog stub's intentional metadata survives the start.

**Path B — Fresh WU** (no backlog stub):

`arc start` creates the meta record from the code field model (`renderMetaFile`) — every managed field present, no
template to drift. It sets the fresh-WU values:

1. **State** → `Planning`
2. **Owner** → the resolved `arc.identity`
3. **Current Workflow** → `draft-design`, the entry planning stage
4. **Next Action** → the `[begin current workflow]` sentinel — never a workflow pointer. The consuming
   session (`arc-plan` → `draft-design`) assesses spec-readiness against the actual draft state.

Then reconcile the judgment fields the scaffold seeds at defaults:

- **Design** → backticked `draft-{name}.md` filename when one exists; otherwise leave `[none]`
- **Class** → resolve the `[TBD]` seed via [`classify-work-unit`][classify-work-unit] — a best estimate
  against the boundary tests — and write it with `arc set-class <Class>`. Freely revisable; the ratchet protects only
  realized work, so an early estimate costs nothing.

Remaining fields take their field-model defaults.

**Idempotent.** If the work unit's meta already exists (e.g., resuming a partial init from a prior session, not from a
stub's start), do not recreate it. Reconcile **Design** and **Next Action** as in Path B, and set **Current Workflow**
with `arc set-stage <stage>`; preserve other field values.

Run `arc check increment` over the reconciled meta, then save it:

```bash
arc save
```

### 5) Proceed to Next Step

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
Under **partial** protection there is no errand branch — stop the direct base-branch edits and start a normal work
unit from the base at the floor's stage: derivation enters `draft-design`; scale enters `Active` for a `brief` +
task-list backfill. Carry any landed errand commit as context in the new WU's spec or notes.

> [!IMPORTANT]
> `workflow-interlock`: Stop before promotion. Show the four record answers, identify which flipped, and name the
> resulting floor. Surface the proposed `{type}/{name}` and the originating inbox capture (if any); await approval
> before running the verb.

1. **Identify the crossing.** Confirm the current derived subject is the in-flight Errand and apply
   [classify-work-unit][classify-work-unit] boundary test 1. Question 1 names `scale`; questions 2–4 name
   `derivation`, which wins when both flip. Name the floor from the answers that flipped. This is the judgment
   `arc errand promote` cannot make; the rest is deterministic.

2. **Stabilize.** The verb moves the checkout onto a new branch, so commit any in-progress errand work as a normal
   errand checkpoint first; never fold implementation into the promotion.

3. **Promote.** Pick `{name}` (may keep the Errand `<slug>`) and `{type}` ([`branch-format`][branch-format]), then
   run the verb with JSON output. It cuts `{type}/{name}` at the Errand's tip (commits preserved), switches the
   checkout onto it, and turns the Errand's record into the receipt-bearing meta at the floor's stage (derivation →
   `Planning` + `Current Workflow: draft-design`; scale → `Active`) in one write. The Errand branch stays linked to
   the work unit.

   ```bash
   arc errand promote {slug} --name {name} --type {type} --floor {derivation|scale} --json
   ```

   Render `recommendedPromptText`. Continue only from an `applied` result whose exact `subject`, `generation`,
   `branch`, `metaPath`, `checkoutPath`, allocation, and parent checkout evidence accompanies
   `settlement.state: settled` with the identity retired: the write settled the exact source-capture generation and
   retired the identity, and the verb then converted the checkout's occupancy, on the primary or spawned, to WU
   ownership. A `confirmation-required`, `refused`, or `error` result is a stop; use only the CLI-composed retry after
   explicit confirmation. Re-run the exact command after a lost response; the immutable `Promotion Receipt`, with the
   role write's history holding its exact cut, supplies replay authority after the identity's retirement, and the rerun
   reports the same exact `subject` and `generation`. A rerun that finds either missing refuses.
   Pass `--priority` / `--class` when known, or resolve `Class` at the planning entry (step 5).

4. **Push the work branch.**

   > [!CAUTION]
   > `push-interlock` release — `workflowPush`: `-u origin {type}/{name}`.

   If the push fails, retry before relying on cross-machine resume.

5. **Continue into the routed planning stage** — by the floor crossed. Resolve `Class`
   ([classify-work-unit][classify-work-unit]) here with `arc set-class <Class>` if it was not supplied at promotion.

   - **Derivation** → the meta points at `draft-design`; work the design out, then [create-spec][create-spec], then
     [generate-tasks][generate-tasks], then `activate-work-unit`, which keeps the promoted branch when `--type` names
     its type.
   - **Scale** → the work unit is already `Active`, so do **not** run `activate-work-unit`: [create-spec][create-spec]
     for a `brief` anchoring the durable plan, then [generate-tasks][generate-tasks], then
     [process-task-loop][process-task-loop]. The errand's commits carry forward intact.

---

[create-spec]: ../../create-spec.md
[generate-tasks]: ../../generate-tasks.md
[process-task-loop]: ../../process-task-loop.md
[run-errand]: ../../supplemental/run-errand.md
[errand-class]: ../../../../../reference/strategies/arc/strategy-work-organization.md#errand-work-class
[in-flight-scope-check]: ../in-flight-scope-check.md
[branch-format]: ../../../../methods/branch-format.md
[classify-work-unit]: ../../../../methods/classify-work-unit.md
[work-org-protection]: ../../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[promote-work-unit]: ../promote-work-unit.md
[work-planning]: ../../../../../reference/strategies/arc/strategy-work-planning.md
