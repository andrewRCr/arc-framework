# Completed

Archive of shipped work units. Pipeline destination after `backlog/` → `active/` → `completed/`.

## Layout

```text
completed/
└── <YYYY-q*>/                       # quarterly grouping; NN resets per quarter
    └── {NN}_{wu-name}/              # per-WU subdir with completion-order prefix
        ├── meta-{wu-name}.md        # always present — durable record
        ├── prd-{wu-name}.md         # standard-tier WUs
        ├── tasks-{wu-name}.md       # WUs with task lists
        ├── notes-{wu-name}.md       # optional development notes
        └── atomic-{wu-name}.md      # atomic-companion capture (when present)
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
depends on WU tier:

- **Atomic-tier** — `meta-*` only (no PRD or task list)
- **Quick-tier** — `meta-*` plus `tasks-*` (no PRD)
- **Standard-tier** — `meta-*` plus `prd-*` plus `tasks-*` plus optional `notes-*`

## Adding new archives

Archival fires from the integration ceremony — see [`integrate-work-unit.md`][integrate-work-unit] for the
full lifecycle. The file-move sweep is handled by [`archive-work-unit.md`][archive-work-unit] (invoked
inline by integration under the default `archive.cadence: with-integration`, or standalone post-merge under
`manual` cadence).

---

[integrate-work-unit]: ../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[archive-work-unit]: ../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md
