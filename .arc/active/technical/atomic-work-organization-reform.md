# Atomic Tasks — Work Organization Reform

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

### `[x]` **Audience-vocabulary sweep — WU docs (PRD + task list)**

- _Outcome:_ Swept both WU docs for `\badopters?\b` (case-insensitive). 14 replacements total:
  8 in `prd-work-organization-reform.md` (R27 `docs` example, R28 method-composition framing, R1
  amendment prose, plus body prose addressing the reader as "adopter"); 6 in
  `tasks-work-organization-reform.md` (outcome notes describing method capabilities, body prose,
  one decision-gate bullet). 38 mentions kept across both files — all surface-category labels
  (`adopter-facing strategy/prose/sweep/...`), historical decision records, and meta-discussion of
  the audience-vocabulary rule itself (essential context that explicitly names the framework-author
  audience). Tier 1 lint clean. Closes the spec-carryover risk that surfaced at 2.13.a; downstream
  phases now port from clean source.

### `[x]` **Workflow-interlock convention codification + Phase 3 application**

- _Outcome:_ Codified workflow-interlock convention in `strategy-workflow-authoring.md` §
  Interlock markers — advance-signal forms (quoted-verb / named-target with direction / approval
  split), trigger-driven embedded placement, standalone-step prohibition, gate-vs-fire separation.
  Applied to Phase 3 boundary workflows: dissolved 2 standalone interlocks in
  `integrate-work-unit.md` (cascade renumber 7+→6+ and 12+→11+); promoted buried commit-fire to
  explicit substep at `1_create-prd.md` Step 7; trimmed stale "last gate" prose at Step 5. Sibling
  sweep across remaining workflows tracked in ATOMIC-INBOX.
