# Status: Session-Init Optimization

> **About this file:** Per-WU state pointer — committed alongside task list updates
> in the same atomic operation. Lightweight factual state so anyone on this branch
> can see where work stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal
> session context. Together they implement P5 (Context Preservation). See
> `session-handoff.md` for the update protocol.

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 4.2.f — Template + reference + config cluster (line ~2647)
- **Last Completed:** Task 4.2.e — session-init.md audit (both copies). Project copy
  344 → 308 (10.5%); template 373 → 336 (9.9%). Surgical trim with 3 heavy changes:
  SESSION-NOTES load errors relocated to `strategy-session-operations.md`;
  multi-file prompt trimmed to structural scaffold; planning-readiness + context-
  mismatch examples staged (Entries 11-13). Adjacent captures approved during
  audit: Step 1 adopter-prose dropped (harness-layer framing in Drift Item #4);
  new Task 4.2.g spun off for DEV-RULES domain enumeration via composite probe.
  Details in task-list outcome block.
- **Blockers:** none
- **Next Action:** Begin 4.2.f — audit `template-status.md` (56 lines),
  `STRATEGY-INDEX.md` (80 lines), and `arc-config.yml` (173 lines, comments only).
  Project-level / configurable-file lens (4.2.c/4.2.d precedents). `arc-config.yml`
  audit pressure is docs-hygiene, not load-cost (3.R moved session-init
  consumption to the composite probe). Or redirect to 4.2.g if structural work is
  preferred next.
