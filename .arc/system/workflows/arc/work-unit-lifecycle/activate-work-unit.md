---
purpose: Transition a work unit from Planning to Active — state-flip, branch rename, absorption-source cleanup.
audience: agent
arc:
  methods:
    - assess-parallel-fit
    - branch-format
    - classify-work-unit
  extensions:
    - pre-activation
    - pre-push-review
    - post-work-unit-activate
---

# Workflow: Activate Work Unit

Transition an existing WU from `**State:** Planning` to `**State:** Active` via in-place state-flip and branch
rename `plan/<name>` → `<type>/<name>`. No new branch, no directory move — the WU stays on its existing branch with
its artifacts in `active/`.

**When to use:** After `generate-tasks.md` produces the task list, when ready to begin implementation.

> [!NOTE]
> **No WU on this branch?** If no `plan/<name>` branch is checked out, or `active/meta-{name}.md` does not exist,
> start with [`init-work-unit.md`][init-work-unit] instead. This workflow transitions an existing WU; it does not
> create one.

---

## Steps

### 1) Pre-condition gate

Verify the activation context is well-formed:

- Currently on a `plan/<name>` branch (per [`branch-format`][branch-format])
- `.arc/active/meta-{name}.md` exists and shows `**State:** Planning`
- `.arc/active/spec-{name}.md` and `.arc/active/tasks-{name}.md` are present

If any check fails, surface the mismatch and halt — do not proceed to state-flip or branch rename.

### 2) Fire `pre-activation` extension

If `pre-activation` appears in the active-extensions list (established at session init), load and execute its
`.actions`. Halt-on-fail surfaces an actionable message; user can fix-and-retry or explicit-invoke bypass.
Otherwise, skip.

### 3) Supplementary alignment checks

#### PROJECT-PRD

Fires only when PROJECT-PRD has been edited since the WU's PRD was approved. Soft check; rarely blocks. Surface
any conflict with the WU's PRD; on conflict, halt and ask.

#### TECHNICAL-OVERVIEW

Fires only when TECHNICAL-OVERVIEW has been edited since the WU's PRD was approved **and** the PRD touches
technical surfaces (tech stack, architecture, runtime, dependencies, infrastructure). Soft check; rarely blocks.
Independent of the PROJECT-PRD check — scope distinction is the trigger.

#### In-flight overlap

Apply [`assess-parallel-fit`][assess-parallel-fit]'s **overlap read only** against the current in-flight set
(`arc active in-flight --json`). The WU's design is settled at the flip, so the design-load read self-quiets; this
re-checks overlap, which may have drifted since the WU was scoped at pick/scaffold time. Advisory, never gates —
surface any overlap (a foreign-owned collision can warrant parking the WU until that unit integrates) and proceed
unless the operator redirects.

### 4) Run the `activate` transition + settle Class + draft-doc removal

Compose the activation inputs (judgment — never fabricated):

- `<type>` — working-branch type per [`branch-format`][branch-format]; composes the `{type}/{name}` working branch
- first task — the first incomplete task in `tasks-{name}.md` (e.g., `Begin Task 1.1 — <task description>`)
- next action — the post-activation pointer (the next executable step, not this workflow)

```bash
arc activate {name} --type {type} --task "{first task}" --action "{next action}"
```

The executor fires the full `activate` edge: flips `**State:** Planning → Active`, rotates
`**Branch:** plan/{name} → {type}/{name}` **and** renames the local branch, writes `**Next Task:**` /
`**Next Action:**`, and discharges satisfied `**Depends On:**` edges. `{name}` defaults to the current worktree's WU.

Then settle the judgment + cleanup the executor doesn't own:

- `**Class:**` settle via [`classify-work-unit`][classify-work-unit] — pre-implementation is the last cheap
  confirm-or-ratchet before execution. Ratchet up to the realized floor when planning authored design since
  the last touchpoint; otherwise confirm the value holds.
- Remove any residual draft-doc — `[ -f .arc/active/draft-{name}.md ] && git rm .arc/active/draft-{name}.md`.
  Safety-catch: the draft-doc should already be absent (deleted at PRD creation per `create-spec.md`); the presence
  guard no-ops cleanly on the common path while still covering paths that skipped the create-PRD boundary.

Stage all edits.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): activate {work-name} work unit

- Flip State: Planning → Active
- Rotate branch: plan/{name} → {type}/{name}
- Set Next Task / Next Action; discharge satisfied Depends On edges
- Settle Class (confirm-or-ratchet)
- Remove draft-{name}.md (absorbed into the spec; safety-catch)

Context: meta-{name}.md (activation)
```

### 5) Push the rotated branch · 2-step routing

The local branch rename landed in Step 4 (executor-owned); only the remote legs remain.

- **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list
  (established at session init), load and execute its `.actions` before the `workflowPush` push.
  Halt-on-fail surfaces an actionable message; user fix-and-retries or explicit-invoke bypasses.
  Otherwise, skip.

```bash
git push -u origin {type}/{name}            # workflowPush
git push origin --delete plan/{name}        # raw — destructive flag stays literal
```

The wrapper refuses `--delete` by design, so the old-remote deletion stays as raw `git`. See [Work Organization
Strategy § Branching][work-org-branching] for the rename's role in the WU lifecycle.

Reaffirm the per-WU user workspace subdir (idempotent on prior `init-work-unit` invocation;
covers paths that activated without going through `init-work-unit` first):

```bash
arc user open {name}
```

### 6) Absorption-source cleanup · `arc-in-git` only

> **Skip this step** under `pm.mode: none` or `external`.

If planning already incorporated inbox entries from the resolver-backed identity-global
`user/{identity}/USER-INBOX.md` or `backlog/ATOMIC-INBOX.md` into this WU's spec or task list, finalize that
absorption now. Delete only the source entries that were incorporated.

Personal source cleanup (`USER-INBOX`) is user-state cleanup, not a project commit. Tracked project-source cleanup
(`ATOMIC-INBOX`) lands as the ceremony write below. Do not drain or reroute unrelated personal captures here —
between-WUs housekeep remains the broad `USER-INBOX` drain.

When `backlog/ATOMIC-INBOX.md` source deletions remain, stage only those source deletions.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): finalize inbox absorption for {name}

- Remove ATOMIC-INBOX entries already incorporated into {name}

Context: meta-{name}.md (activation)
```

See [DEV-RULES.ARC § Discovered Work Routing][dev-rules-discovered-routing] for the capture-routing table.

### 7) ROADMAP regen · `arc-in-git` only

> **Skip this step** under `pm.mode: none` or `external`.

Re-render per [Work Organization Strategy § ROADMAP][work-org-roadmap] — the WU is already In Flight from
initialization, so this refreshes the ROADMAP rather than changing its tier.

Default: dedicated `chore(arc):` commit. May ride the activation commit (Step 4) only when the regen is a
trivial refresh (no render-set change) — see [DEV-RULES.ARC § Atomicity][dev-rules-atomicity].

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): refresh roadmap for {name} activation

- Re-render ROADMAP after {name} enters In Flight

Context: meta-{name}.md (activation)
```

### 8) Fire `post-work-unit-activate` extension

If `post-work-unit-activate` appears in the active-extensions list, load and execute its
[`.actions`][arc-ext-post-activate]. Otherwise, skip. Stage any extension-produced changes as a dedicated
commit (`workflowCommit`) per the extension's contract.

---

## Next Step

With activation complete, proceed to task execution:

**→ [process-task-loop.md](../process-task-loop.md)** — Execute tasks with quality gates.

## Related workflows

- [`init-work-unit.md`][init-work-unit] — preceding ceremony; creates the WU on `plan/<name>`.
- [`integrate-work-unit.md`][integrate-work-unit] — succeeding ceremony; PR-open through merge.
- [`deactivate-work-unit.md`][deactivate] — the inverse; Active → Planning (undo a premature activation).

---

[init-work-unit]: planning/init-work-unit.md
[integrate-work-unit]: integrate-work-unit.md
[deactivate]: deactivate-work-unit.md
[assess-parallel-fit]: ../../../methods/assess-parallel-fit.md
[branch-format]: ../../../methods/branch-format.md
[classify-work-unit]: ../../../methods/classify-work-unit.md
[arc-ext-post-activate]: ../../../extensions/post-work-unit-activate.md
[work-org-branching]: ../../../../reference/strategies/arc/strategy-work-organization.md#branching
[work-org-roadmap]: ../../../../reference/strategies/arc/strategy-work-organization.md#roadmap
[dev-rules-discovered-routing]: ../../../../system/rules/DEV-RULES.ARC.md#discovered-work-routing
[dev-rules-atomicity]: ../../../../system/rules/DEV-RULES.ARC.md#atomicity
