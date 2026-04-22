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
- **Next Task:** Task 3.R.k.a — `arc status` → `arc health` rename (line ~1681)
- **Last Completed:** 3.R.j.c — Label + spinner + summary consistency. Unified the `arc sync`
  pull-direction and `arc user pull` result-box label from "Loaded" → "Pulled" so the verb
  chain (spinner "Pulling" → stop "Pull complete." → note "Pulled") reads as one action;
  `arc user load` keeps "Loaded". Verb-tense convention documented in `runWithSpinner` JSDoc
  (first use). Split `determineUserStatusAction` for the `local unsaved` headline —
  `diskState === "different"` → "run `arc user save`"; otherwise (implies
  `refState === "local-ahead"`) → "run `arc user push` (or `arc sync`)" — with inline
  invariant comment. Added 2 new `buildUserStatusResult` unit tests for the sub-cases.
  Session-handoff doc touch: new paragraph directing the agent to surface `arc sync` exit
  code in the end-of-session summary (closes "work didn't land but user thought it did"
  gap). Two-copy sync on `session-handoff.md`. 774 unit+integration tests green (+2 new);
  45 E2E green.
- **Blockers:** none
- **Next Action:** Begin 3.R.k.a — `arc status` → `arc health` rename (prerequisite to
  free the `arc status` name for the 3.R.k.d composite probe command). Then .b
  (extensions probe + shared lib + `arc user status --json` retrofit), .c (active probe),
  .d (composite), .e (session-init workflow integration + strategy pointer).

> **Task 3.R.k restructured (2026-04-22, pre-implementation).** Audit resolved five design
> decisions: hybrid `--session-init` / `--json` wire format, dropped methods probe (no
> session-init consumer), shared `lib/extensions/` for probe and D7b hook, composite `arc status`
> command (invokes three probe helpers via Promise.all), and transplanted the `arc status` to
> `arc health` rename from ARCd Rebrand Task 1.5. Final subtask shape: .a rename, .b extensions
> with lib and user-status retrofit, .c active, .d composite, .e session-init integration.
> Decision record in `notes-session-init-optimization.md` § Phase 3.R Second-Pass Decisions.
> Cross-WU edits: rebrand PRD, rebrand tasks, and plan-arc-modes naming references.
