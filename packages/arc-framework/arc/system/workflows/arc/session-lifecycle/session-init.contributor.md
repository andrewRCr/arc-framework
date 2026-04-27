---
purpose: Contributor-specific divergence from session-init — Step 3 item 7+, Step 5 skip, Step 6 orientation.
audience: agent
---

# Workflow: Session Initialization — Contributor Path

Loaded from `session-init.md` Step 3 when `identity.role === "contributor"`. Steps 1–2 and Step 3 items
1–6 are universal — they load via `session-init.md` before this file is consulted. Steps 4 and 7 are
also universal — return to `session-init.md` for those. This file covers only the divergent surface:
Step 3 item 7+, Step 5 (skip), and Step 6 orientation format.

## Step 3 (item 7+) — Reduced load set

After items 1–6 load normally, run these in place of items 7–10:

- **Load** `.arc/system/briefs/AGENT-BRIEF.CONTRIBUTOR.md`
- **Load** `.arc/user/{identity}/SESSION-NOTES.md` if identity resolved and the file exists
- **Check** `.arc/user/{identity}/status-contributor.md` if identity resolved — optional local
  planning state; note in orientation if present

`session-init.md` items 7, 9, and 10 (active status file, task list, process-task-loop) are
maintainer-managed surfaces and don't apply.

## Step 5 — Contributor freshness check

Maintainer's `session-init.md` § 5 (Assess Readiness) runs both a freshness check against the active
status file and next-work-unit discovery — both maintainer concerns. The contributor flow keeps
freshness, drops discovery:

- **Freshness:** Skip if SESSION-NOTES `Commit at Handoff` hash matches current HEAD — context is
  current. Otherwise, surface the gap in orientation.
- **Status-contributor:** If `.arc/user/{identity}/status-contributor.md` exists, treat its fields as
  the project pointer for Step 6 orientation. Blockers or stale fields surface in orientation.
- **Skip** maintainer next-work-discovery — work-unit lifecycle isn't a contributor concern.

## Step 6 — Contributor orientation format

**ARC session initialized** · `{branch-name}` · contributor · {clean | uncommitted changes}

**Context:** Contributor session — working on project code, not managing ARC planning artifacts.

**When `status-contributor.md` provides state**, surface it using the field bounds from `session-init.md`
§ 6:

- **Last completed**: One line. Task ID + title + commit state (or off-task-list description).
- **Current task**: One line. Task ID + title, or `none`.
- **Blockers**: `none` or freeform.

**Next action:** One line on-task-list (status-contributor.md pointer); unbounded when off-task-list.
Otherwise: "Ready for work. Use `Context: contribution (...)` commit footer."

When status-contributor.md is absent or empty, keep orientation minimal — header line + Context note +
"Ready for work" Next action.
