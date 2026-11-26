---
purpose: Transition a work unit from Planning to Active — the state flip, its work branch, and absorption-source cleanup.
audience: agent
arc:
  methods:
    - assess-parallel-fit
    - branch-format
    - classify-work-unit
    - route-discovered-work
---

# Workflow: Activate Work Unit

Transition an existing WU from `**State:** Planning` to `**State:** Active` in the checkout that holds it. `arc activate`
flips the state and establishes the work branch in that checkout. It creates one at base's tip from a detached checkout
or one on base, takes over a branch of your own by renaming it, or keeps the branch the WU already links.

**When to use:** After `generate-tasks.md` produces the task list, when ready to begin implementation.

> [!NOTE]
> **No WU in this checkout?** If `arc locus` finds no work unit this checkout holds, start with
> [`init-work-unit.md`][init-work-unit] instead. This workflow transitions an existing WU; it does not create one.

---

## Steps

### 1) Pre-condition gate

Verify the activation context is well-formed:

- `arc locus` resolves this checkout to the `{name}` work unit
- `arc view meta` shows `**State:** Planning`
- `arc view spec` and `arc view tasks` find the spec and the task list
- `arc inbox personal --target {name} --json` reports `clear` — no capture, held or not, still names this work unit —
  and `arc inbox {name} --json` reports no pending inbound entry

If any check fails, surface the mismatch and halt — do not proceed to the activation.

If a listing refuses, surface the condition, apply its reported remedy, and check the gate using the resulting
listing. A `named` capture or a pending inbound entry clears by its disposition at the Owner's pass.

**Method fire-point** · [`route-discovered-work`][route-discovered-work]:

```yaml
route-discovered-work:
  entry: each inbound entry, and each listed capture
  door: owner's planning pass
  host: this work unit
```

On confirmation, carry out each outcome before activation. A `fold` amends the spec and carries what it changes into
the task list and its success criteria. An outcome cannot hold a capture in this work unit.

Record each rejection or dismissal and its reason in the `notes-{name}.md` companion, creating it on first need. Record
the source list, entry ID, and version with each rejection, dismissal, or fold in the notes. Run `arc check increment`
and `arc save` before removing any source whose disposition required these edits. If `arc save` refuses, surface the
condition, apply its reported remedy, and continue once the remedy has saved the disposition and its edits.

After a successful `arc save`, inspect `arc status --json`. Require a ready projection with no `files`
or `copies` entries for the edited notes, spec, or task list and no unresolved ARC conflict blocks in those files.
Report outstanding conditions, finish pending edits, and apply any reported remedies. Recover the intended
edits from each aside copy before removing it. Resolve conflict blocks in place and remove their markers and any
resolve-by-hand line. Then repeat the check, save, and status check before removal.

On retry, verify the saved disposition and its edits for that exact source list, ID, and version. Use the same
acceptance checks before removing the source, and the same save steps for any missing edits.

- For a personal capture, use `arc user inbox-remove --id <id> --expected-version <version>` with the listed values.
- For an inbound entry, verify its listed ID and version still match, delete that row from the owner's list, and
  persist the edit with `arc save`.
- A moved entry has already left its source list. When the outcome rewrites a capture in place, make that edit at
  the listed version and save it in place.

If a removal or its save refuses, surface the condition, apply its reported remedy, and verify that removal of the
same entry is saved before continuing.

On a changed version or a save conflict, refresh the listing and settle the current entry. Re-run both listings
and require the gate to pass before proceeding.

### 2) Supplementary alignment checks

#### PROJECT-PRD

Fires only when PROJECT-PRD has been edited since the WU's PRD was approved. Soft check; rarely blocks. Surface
any conflict with the WU's PRD; halt and ask on material disagreement.

#### TECHNICAL-OVERVIEW

Fires only when TECHNICAL-OVERVIEW has been edited since the WU's PRD was approved **and** the PRD touches
technical surfaces (tech stack, architecture, runtime, dependencies, infrastructure). Soft check; rarely blocks.
Independent of the PROJECT-PRD check — scope distinction is the trigger.

#### In-flight overlap

Apply [`assess-parallel-fit`][assess-parallel-fit]'s **overlap read only** against the current in-flight set
(`arc active in-flight --json`). The WU's design is settled at the flip, so the design-load read self-quiets; this
re-checks overlap, which may have drifted since the WU was scoped at pick/scaffold time. Advisory, never gates —
surface any overlap (a foreign-owned collision can warrant pausing the WU until that unit integrates) and proceed
unless the operator redirects.

### 3) Settle Class, then run the `activate` transition

Settle `**Class:**` via [`classify-work-unit`][classify-work-unit] — pre-implementation is the last cheap
confirm-or-ratchet before execution. Ratchet up to the realized floor with `arc set-class <Class>` when planning
authored design since the last touchpoint; otherwise confirm the value holds.

Bring any accepted ADR and moved research from planning into this checkout as uncommitted changes. Apply the
commit interlock below when there are files to carry.

> [!IMPORTANT]
> `commit-interlock`: Stop for review of the pending ADR and research. Surface the files and await approval to
> activate and make the first commit on the work branch.

Compose the activation inputs (judgment — never fabricated):

- `<type>` — working-branch type per [`branch-format`][branch-format]. The selected branch is `{type}/{name}` when
  creating or renaming it. A linked work branch already checked out with the same type keeps its current name.
- next action — `activate-work-unit Step 4 — Publish the work branch` unless an accepted ADR or moved research
  awaits its first commit. In that case, use `activate-work-unit Step 3 — Commit the accepted ADR or research at <paths>`
  with the approved paths.

> [!IMPORTANT]
> `workflow-interlock`: Stop before activation unless the operator has already approved this transition and its inputs.
> Present the unit, proposed branch and type, next action, and the move from Planning to Active, including the branch
> creation, rename, or reattachment. Await approval to activate.

When there are files to commit, set the meta's `**Next Action:**` to the commit pointer and persist it with
`arc save` while still in Planning. If saving refuses, surface the condition and apply its reported remedy. Verify
the saved pointer with `arc view meta` before running activation, and pass that same value as `--action`.

```bash
arc activate {name} --type {type} --action "{next action}"
```

The verb flips `**State:** Planning → Active`, links the selected work branch, and saves `**Next Action:**` with
any old origin branch scheduled for deletion and its observed tip. The same write discharges satisfied
`**Depends On:**` edges and removes a draft that `Design` no longer names. `{name}` defaults to the current
checkout's WU. The report also names any commits excluded from the WU's task work.

When Next Action points to the pending commit, stage the named files after activation succeeds. If a fresh session
resumes at this pointer with the unit already Active, continue here on the linked work branch. If Git history shows
the approved commit already landed, continue with Step 4. When there is no planning commit, proceed to Step 4.

> [!CAUTION]
> `commit-interlock` release — commit the ADR or moved research as `workflowCommit` before pushing or starting
> task work. This is the first commit on the work branch.

```text
chore(arc): record {name} planning artifacts

Context: spec-{name}.md (planning)
```

### 4) Push the work branch

Use the work unit's `branch` from `arc active in-flight --json` as `{branch}` and work on that branch.
Read Next Action with `arc view meta`. If it records an old origin branch and tip, complete the merge with
`git merge --ff --no-edit <old-tip>` before pushing, unless the work branch already contains that tip.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin {branch}`.

Only after the push succeeds, run the recorded old branch's deletion as raw Git with
`git push --force-with-lease=refs/heads/<old-branch>:<old-tip> origin --delete <old-branch>`.
If Git refuses because the lease is stale, report that the old remote tip changed and surface Git's refusal. Fetch
the old branch with `git fetch origin refs/heads/<old-branch>`, read the new tip with `git rev-parse FETCH_HEAD`, and
merge that exact tip into the work branch with `git merge --ff --no-edit <new-tip>`. Repeat the routed push. When it
succeeds, retry the deletion with the lease set to the merged tip. If the old branch is confirmed gone, deletion is
complete. See [Work Organization Strategy § Branching][work-org-branching] for the work branch's lifecycle.

### 5) Absorption-source cleanup · `arc-in-git` only

> **Skip this step** under `pm.mode: none` or `external`.

If planning already incorporated entries from your inbox or the project inbox into this WU's spec or task list,
finalize that absorption now. Remove only the source entries that were incorporated: yours with
`arc user inbox-remove --id <id> --expected-version <version>`, taking both from `arc inbox personal`, and the project
inbox's by editing its list, then saving it with `arc save`. Do not drain or reroute unrelated personal captures here
— between-WUs housekeep remains the broad inbox drain.

See [DEV-RULES.ARC § Discovered Work Routing][dev-rules-discovered-routing] for the capture-routing table.

---

## Next Step

With activation complete, replace the activation pointer and any old branch details in Next Action with the next
task action. Run `arc save`. If it refuses, surface the condition, apply the reported remedy, and proceed when the
next task action is saved.

**→ [process-task-loop.md](../process-task-loop.md)** — Execute tasks with quality gates.

## Related workflows

- [`init-work-unit.md`][init-work-unit] — preceding ceremony; starts the WU in Planning.
- [`integrate-work-unit.md`][integrate-work-unit] — succeeding ceremony; PR-open through merge.
- [`deactivate-work-unit.md`][deactivate] — the inverse; Active → Planning (undo a premature activation).

---

[init-work-unit]: planning/init-work-unit.md
[integrate-work-unit]: integrate-work-unit.md
[deactivate]: deactivate-work-unit.md
[assess-parallel-fit]: ../../../methods/assess-parallel-fit.md
[branch-format]: ../../../methods/branch-format.md
[classify-work-unit]: ../../../methods/classify-work-unit.md
[route-discovered-work]: ../../../methods/route-discovered-work.md
[work-org-branching]: ../../../../reference/strategies/arc/strategy-work-organization.md#branching
[dev-rules-discovered-routing]: ../../../../system/rules/DEV-RULES.ARC.md#discovered-work-routing
