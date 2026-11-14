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
flips the state and gives the WU its `<type>/<name>` work branch there: it creates one at the base branch's tip from a
detached checkout or one on base, takes over a branch of your own by renaming it, or keeps the branch the WU already
links.

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

A `refused` listing clears by applying its remedy, and a `named` capture or a pending inbound entry only by its
disposition at the Owner's pass.

**Method fire-point** · [`route-discovered-work`][route-discovered-work]:

```yaml
route-discovered-work:
  entry: each inbound entry, and each listed capture
  door: owner's planning pass
  host: this work unit
```

On confirmation, carry out each outcome before the activation. A `fold` amends the spec and carries what it changes
into the task list and its success criteria; no outcome holds the capture in this work unit. Remove each routed
capture with `arc user inbox-remove --id <id> --expected-version <version>`, taking both from its listed row, or
rewrite it in place when its outcome is itself a capture. Record each rejection or dismissal, with its reason, in the
`notes-{name}.md` companion, creating it on first need. Then re-run the gate.

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

When a Step 1 fold changed spec or task-list prose, or Step 1 recorded a rejection or dismissal, run
`arc check increment` over that text and save it:

```bash
arc save
```

Compose the activation inputs (judgment — never fabricated):

- `<type>` — working-branch type per [`branch-format`][branch-format]; composes the `{type}/{name}` working branch
- next action — the post-activation pointer (the next executable step, not this workflow)

```bash
arc activate {name} --type {type} --action "{next action}"
```

The verb flips `**State:** Planning → Active`, gives the WU its `{type}/{name}` work branch in this checkout and links
it, writes `**Next Action:**`, discharges satisfied `**Depends On:**` edges, and removes a draft that `Design` no longer
names, in one write. `{name}` defaults to the current checkout's WU. Its report names any commits it excluded from the
WU's task work and the old name's remote branch to delete (Step 4).

### 4) Push the work branch

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin {type}/{name}`.

When the activation result names the old name's remote branch deletion, run it as printed, as raw `git` — the
wrapper refuses `--delete` by design. A deletion it names after a merge waits until that merge has run. See
[Work Organization Strategy § Branching][work-org-branching] for the work branch's role in the WU lifecycle.

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

With activation complete, proceed to task execution:

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
