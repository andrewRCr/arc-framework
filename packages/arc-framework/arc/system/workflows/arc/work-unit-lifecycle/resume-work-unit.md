---
purpose: Resume a paused work unit — clear its pause, give it a checkout where none holds it, and reconcile.
audience: agent
---

# Workflow: Resume Work Unit

Bring a paused work unit back to its work. `resume` is the inverse of [`pause`][park]: `arc resume` clears the pause
section in the work unit's meta and nothing else, since a pause moved nothing.

---

## Steps

### 1) Pre-condition gate

Read the selected unit's meta and confirm that it has a `## Pause` section. Review the recorded `Reason` and what
the unit waits on before proceeding. If no name was supplied, use `arc locus` to resolve this checkout's unit.

```bash
arc view meta --for {name}
```

A unit that is not paused has nothing to resume.

### 2) Find or get its checkout

Run the resume from the checkout that holds the unit (`arc locus`). When the pause released that checkout and none on
this machine holds the unit, get one first:

```bash
arc materialize {name}          # spawn a fresh WU-owned worktree (full-protection default)
arc materialize {name} --here   # explicitly convert the current checkout into the WU-owned checkout
```

The session locus occupancy guard refuses an occupied checkout rather than displacing its role. When this is the
physical primary, it is unavailable to transient work and other WUs until exact teardown, or a release
(`arc locus release`), removes its marker.

### 3) Run `arc resume`

```bash
arc resume {name}
```

`{name}` defaults to this checkout's unit. The verb clears the pause in one write; nothing is staged, committed, or
pushed.

### 4) Reconcile the work unit

Run the bounded current-WU reconcile from the WU-owned checkout — the fresh worktree reported by `arc materialize`
after a spawn — since a pause defers the edge reconciles other work units' retirements call for:

```bash
arc wu reconcile {name} --apply --json
```

- `clean` — continue without a write, stage, or commit.
- `pending` — resolve the outstanding findings below.
- `applied` — the reconcile wrote the dependent-owned repairs. Check `advisories` and `dependency.held` before
  continuing and resolve any outstanding findings below.
- `conflict` — stop the resume workflow and surface the typed reason. The pause is already cleared; do not pause again
  to roll it back.

For either `pending` or `applied`, surface each advisory and held edge. Inspect the referenced content and obtain
explicit user direction for each advisory to retain. For each held edge, follow its reported `repair`. Check any edits
with `arc check increment`, save with `arc save`, and rerun the reconcile. Proceed once each advisory is corrected
or explicitly retained and no held edge remains.

---

## Next step

The unit is back at its work. Continue the [task loop][process-task-loop], or its planning stage, from that WU-owned
checkout. On `--here`, do not treat the physical primary as free until exact teardown or `arc locus release` removes
the WU marker.

## Related workflows

- [`park-work-unit`][park] — the inverse; pauses a started unit.
- [`integrate-work-unit`][integrate] — the code-shipping lifecycle exit once the resumed work completes.

---

[park]: park-work-unit.md
[integrate]: integrate-work-unit.md
[process-task-loop]: ../process-task-loop.md
