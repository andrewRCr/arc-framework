---
purpose: Promote a provisional backlog stub to planned, forcing a resolved Class.
audience: agent
arc:
  methods:
    - classify-work-unit
---

# Workflow: Promote Work Unit

Promotes a work unit one rung up the readiness ladder — raising a backlog stub from provisional to planned via the
`promote` transition, forcing a resolved `Class` via the [`classify-work-unit`][classify-work-unit] method. A
backlog-internal move: no branch, no worktree, none of the start machinery — that belongs to
[`init-work-unit`][init-work-unit].

**When to use:** A provisional work unit has firmed up into a startable candidate — its thesis is one the
project commits to, and it is ready to appear on the ready list a start decision is read from. Promotion to planned
is the forcing point for `Class` (see the readiness rule below).

**Readiness ladder:** `provisional → planned → active`. This workflow covers the `provisional → planned`
rung; [`init-work-unit`][init-work-unit] covers `planned → active`.

**Readiness rule (enforced here):** a planned stub carries a resolved `**Class:**` (`Light` / `Heavy` / `Novel`);
`[TBD]` is legal only on a provisional one. Planned-entry is the forcing point
because the start decision — read off the ready list — precedes activation, and that decision needs the
weight signal. This workflow states the _lifecycle constraint_; the triage that resolves the value lives in
the [`classify-work-unit`][classify-work-unit] method (its single DRY home), loaded per the frontmatter
declaration.

> [!NOTE]
> **arc-in-git only.** This workflow operates on the backlog pipeline, which exists only under `pm.mode: arc-in-git`.
> Under `none` or `external` there is no provisional/planned ladder to promote within.

---

## Steps

### 1) Pre-condition gate

Verify the promotion context is well-formed:

- `arc status {name}` shows a provisional stub.
- `pm.mode` is `arc-in-git`.

If the stub is already planned, it has already been promoted — stop. If the work unit has started or completed,
promotion does not apply.

### 2) Force the Class estimate · `classify-work-unit`

`arc promote` refuses to raise a stub whose `**Class:**` is still `[TBD]`, so resolve it **before** the move.
Load the [`classify-work-unit`][classify-work-unit] method and apply it as a **confirm-or-ratchet** over the
work unit's `**Class:**` field:

- A `[TBD]` value is resolved to `Light` / `Heavy` / `Novel` against the boundary tests — a best estimate when
  planning has not yet substantiated a floor.
- An existing estimate is confirmed, or ratcheted per the method's estimate-vs-realized rule.

A promoted work unit never leaves provisional carrying `[TBD]`: Step 3 passes a resolved `[TBD]` as `--class`. A
ratchet of an existing estimate writes through `arc set-class <Class> {name}` first.

### 3) Promote provisional → planned

Fire the transition:

```bash
arc promote {name} --class {Class}   # omit --class when Class is already resolved
```

It raises the stub to planned in one write, recording the resolved `**Class:**` it is given, and refuses while
`**Class:**` is still `[TBD]`. A stub in a cohort stays in it. `arc status` then lists the stub as startable — in the
**Ready** tier, or **Blocked** when it carries unsatisfied dependencies.

---

## Inverse — `demote`

`arc demote {name}` reverses this rung — lowering a planned stub back to provisional when a planned candidate is set
aside as not-yet-committed. It is the unguarded inverse of `promote`: a content-preserving, cohort-aware backlog move
with no branch, no worktree, and no standalone ceremony of its own. The resolved `Class` rides down untouched — the ratchet
is sticky, so a later re-promote needs no reclassification.

## Next Step

The work unit is now a startable candidate on the ready list. When work begins, proceed to
[`init-work-unit`][init-work-unit] — the next rung (`planned → active`), which starts the stub in Planning.

## Related workflows

- [`init-work-unit`][init-work-unit] — succeeding ceremony; promotes a planned work unit to active.
- [`activate-work-unit`][activate-work-unit] — flips `Planning → Active` once the spec and task list exist.

---

[classify-work-unit]: ../../../methods/classify-work-unit.md
[init-work-unit]: planning/init-work-unit.md
[activate-work-unit]: activate-work-unit.md
