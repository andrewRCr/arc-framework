---
purpose: Contributor-specific divergence from session-init — Step 4 item 7+, Step 6 skip, Step 7 orientation.
audience: agent
---

# Workflow: Session Initialization — Contributor Path

Loaded from `session-init.md` Step 4 when `identity.role === "contributor"`. Steps 1–3 and Step 4 items
1–6 are universal — they load via `session-init.md` before this file is consulted. Steps 5 and 8 are
also universal — return to `session-init.md` for those. This file covers only the divergent surface:
Step 4 item 7+, Step 6 (skip), and Step 7 orientation format.

## Step 4 (item 7+) — Reduced load set

After items 1–6 load normally, run these in place of items 7–10:

- **Load** `.arc/system/briefs/AGENT-BRIEF.CONTRIBUTOR.md`
- **Load** `.arc/user/{identity}/SESSION-NOTES.md` if identity resolved and the file exists
- **Check** `.arc/user/{identity}/status-contributor.md` if identity resolved — optional local
  planning state; note in orientation if present

`session-init.md` items 7, 9, and 10 (active status file, task list, process-task-loop) are
maintainer-managed surfaces and don't apply.

## Step 6 — Skip

Skip `session-init.md` § 6. Assess Readiness — freshness checks and work-unit discovery are
maintainer concerns. Proceed directly to Step 7.

## Step 7 — Contributor orientation format

**ARC session initialized** · `{branch-name}` · contributor · {clean | uncommitted changes}

**Context:** Contributor session — working on project code, not managing ARC planning artifacts.

**Next action:** Ready for work. Use `Context: contribution (...)` commit footer.

Include status-contributor.md state if present and any blockers or configuration issues detected.
Otherwise keep it minimal.
