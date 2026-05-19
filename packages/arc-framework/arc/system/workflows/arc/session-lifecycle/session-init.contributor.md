---
purpose: Contributor-specific divergence from session-init — Step 3 item 7+, Step 5 freshness, Step 6 orientation.
audience: agent
---

# Workflow: Session Initialization — Contributor Path

Loaded from `session-init.md` Step 3 when `identity.role === "contributor"`. Steps 1–2 and Step 3 items
1–6 are universal — they load via `session-init.md` before this file is consulted. Steps 4 and 7 are
also universal — return to `session-init.md` for those. This file covers only the divergent surface:
Step 3 item 7+ load shape, Step 5 freshness, and Step 6 orientation format.

## Step 3 (item 7+) — Active load set

After items 1–6 load, run items 7–10 with the contributor adjustments below. The composite probe's
`active.value` slot resolves under `.arc/user/{identity}/active/` (flat scan-shape) when role is
`contributor` — the envelope's `resolution`, `path`, `candidates`, and `companions` carry the
contributor active state directly. No singleton file lookup.

**Item 7 — Active status file.** Same shape as maintainer Step 3 item 7 — read `active.value.path` in full
when `resolution === "single"`. `resolution: "none"` skips items 9–10. `resolution: "multiple"` applies
the documented precedence (SESSION-NOTES `**Working On:**`, branch match, `**State:** Active`,
prompt) over `active.value.candidates`.

**Item 8 — SESSION-NOTES + contributor briefing.** Read `.arc/user/{identity}/SESSION-NOTES.md` (item
8 universal) plus `.arc/system/briefs/AGENT-BRIEF.CONTRIBUTOR.md`. Both join the parallel batch with
items 1–6 and item 7 per maintainer's parallelism rule.

**Item 9 — Active task list.** Apply only when the resolved status file's `**Task List:**` is not
`[none]`. Same partial-read shape as maintainer item 9 (header + current phase preamble + current
task section). Companion paths come from `active.value.companions`.

**Item 10 — Task execution workflow.** Apply when item 9 applies. (Session-type inference — maintainer
Step 3 "Resolve session type" — does not apply on the contributor path; contributors always load
`3_process-task-loop.md` here.)

## Step 5 — Contributor freshness check

Maintainer's `session-init.md` § 5 covers freshness (universal) and next-work-unit discovery
(maintainer-only). Contributors keep freshness, drop discovery:

- **Freshness:** Skip if SESSION-NOTES `Commit at Handoff` hash matches current HEAD. Otherwise
  surface the gap in orientation. If the gap suggests an interrupted session, run
  [process-task-loop § Crash Recovery](../3_process-task-loop.md#crash-recovery).
- **Active status file freshness:** The contributor active file lives under
  `.arc/user/{identity}/active/` and is gitignored — git-history-based freshness doesn't apply.
  The handoff-hash check above is the freshness signal.
- **Skip** maintainer next-work-discovery — work-unit lifecycle isn't a contributor concern.

## Step 6 — Contributor orientation format

**ARC session initialized** · `{branch-name}` · contributor · {clean | uncommitted changes}

**Context:** Contributor session — working on project code, not managing ARC planning artifacts.

When `active.value.resolution === "single"` (or `"multiple"` after disambiguation resolves to one
candidate), surface the chosen file's fields using maintainer's field bounds from
`session-init.md` § 6:

- **Last completed**: One line. Task ID + title + commit state (or off-task-list description).
- **Current task**: One line. Task ID + title, or `none` between work units.
- **Blockers**: `none` or freeform — mismatch detail and blocker context unbounded.

**Next action:** One line on-task-list (resolved status-file pointer); unbounded when off-task-list.

When `resolution === "none"`, keep orientation minimal — header line + Context note + the standalone
**Next action:** "Ready for work. Use `Context: contribution (...)` commit footer."
