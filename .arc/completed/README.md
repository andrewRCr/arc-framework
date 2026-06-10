# Completed

Archive of shipped work units. Pipeline destination after `backlog/` → `active/` → `completed/`.

## Layout

```text
completed/
└── <YYYY-q*>/                       # quarterly grouping; NN resets per quarter
    └── {NN}_{wu-name}/              # per-WU subdir with completion-order prefix
        ├── meta-{wu-name}.md        # always present — durable record
        ├── spec-{wu-name}.md        # authored design (older archives: prd-* / draft-*)
        ├── tasks-{wu-name}.md       # work units with a task list
        └── notes-{wu-name}.md       # optional development notes
```

**Quarterly subdir** (`<YYYY-q*>`, e.g. `2026-q2`) — temporal grouping. NN counter resets per quarter.

**NN prefix** — 2-digit completion-order number assigned at archival. Gives filesystem-browse-time
ordering (`ls .arc/completed/<quarter>/` lists WUs in completion sequence).

**Per-WU subdir** — all WU artifacts live here together, relocated from `active/` by integration.

## What lives in a per-WU subdir

`meta-{name}.md` is the durable record. Its archive-phase sections (Release Notes Entry, Completion Notes)
carry the outward-facing summary composed at integration; the rest of the body retains the in-flight
metadata captured during execution.

Companion artifacts stay alongside the meta file for historical reference. Which companions are present
scales with the work unit's `Class` and planning depth:

- `meta-*` — always present; the durable record.
- `spec-*` — the authored design, present when the work unit carried upfront design (heavier `Class` /
  deeper planning depth). Older archives may carry `prd-*` or `draft-*` in this role.
- `tasks-*` — present when the work unit was decomposed into a task list.
- `notes-*` — optional development notes.

## Adding new archives

Archival fires from the integration ceremony — see [`integrate-work-unit.md`][integrate-work-unit] for the
full lifecycle. The file-move sweep is handled by [`archive-work-unit.md`][archive-work-unit] (invoked
inline by integration under the default `archive.cadence: with-integration`, or standalone post-merge under
`manual` cadence).

---

[integrate-work-unit]: ../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[archive-work-unit]: ../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md
