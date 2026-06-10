# Completed

Archive of shipped work units. Pipeline destination after `backlog/` → `active/` → `completed/`.

## Layout

```text
completed/
└── <YYYY-q*>/                       # quarterly grouping; NN resets per quarter
    ├── {NN}_{wu-name}/              # per-WU subdir with completion-order prefix
    │   ├── meta-{wu-name}.md        # always present — durable record
    │   ├── spec-{wu-name}.md        # authored design (older archives: prd-* / draft-*)
    │   ├── tasks-{wu-name}.md       # work units with a task list
    │   └── notes-{wu-name}.md       # optional development notes
    └── {NN}a_cohort-{cohort-name}/  # closed cohort coordination sidecar
        └── cohort-{cohort-name}.md
```

**Quarterly subdir** (`<YYYY-q*>`, e.g. `2026-q2`) — temporal grouping. NN counter resets per quarter.

**NN prefix** — 2-digit completion-order number assigned at archival. Gives filesystem-browse-time
ordering (`ls .arc/completed/<quarter>/` lists WUs in completion sequence).

**Per-WU subdir** — all WU artifacts live here together, relocated from `active/` by integration.

**Cohort closeout subdir** — when a cohort's final member ships, its `cohort-*` doc closes into a lettered
sidecar of the final member's completion-order entry. This keeps `completed/` chronological without retroactively
nesting already-shipped WUs under the cohort. The cohort doc's `Parent` field carries nested-cohort context.

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

## What lives in a cohort closeout subdir

`cohort-{name}.md` is the historical coordination record for the completed cohort. It carries the same identity
and coordination content it held in `backlog/`, plus a brief closeout section summarizing the outcome, final
member, member archive entries, and any routed follow-up.

Cohort closeout entries are not work units: they carry no `meta-*` file, no task list, and no branch record.

## Adding new archives

Archival fires from the integration ceremony — see [`integrate-work-unit.md`][integrate-work-unit] for the
full lifecycle. The file-move sweep is handled by [`archive-work-unit.md`][archive-work-unit] (invoked
inline by integration under the default `archive.cadence: with-integration`, or standalone post-merge under
`manual` cadence).

---

[integrate-work-unit]: ../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[archive-work-unit]: ../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md
