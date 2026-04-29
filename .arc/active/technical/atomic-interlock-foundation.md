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

### `[x]` **Phase-heading shape cascade — `### **Phase` → `## **Phase` across live docs**

- _Outcome:_ Updated all live (non-archive) references to the pre-wrapper-removal phase
  heading shape. Surfaced when this session's Phase grep returned zero hits during init.
  Distinct from Task 1.4 (which tracks ADR-016 vocabulary cascade, not heading shape).
- _Files (live):_
    - `session-init` (template + `.arc/` copy) — prose reference, regex
      `^## \*\*Phase {id}:\*\*`, and structural-mapping grep `^## \*\*Phase` (3 hits per copy).
    - `strategy-quality-gates.md` (both copies) — example phase-header blocks (2 hits per copy).
    - `strategy-task-list-formatting.md` (both copies) — owner-marker example (1 hit per copy).
      Notable: this strategy codifies the format, so its own example was internally inconsistent
      with `template-tasks.md`.
    - `plan-arc-modes.md` (backlog) — Full/Lite verification skeleton examples (2 hits).
    - `notes-docs-content-sweep.md` (backlog) — canonical-shape illustrations (2 hits).
- _Out of scope:_ `.arc/reference/archive/**` left alone (frozen historical record under the
  old shape). `system/.internal/pristine.json` regenerates via CLI infrastructure.
