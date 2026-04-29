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
