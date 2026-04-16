# Status: Work-Status Restructure

> **About this file:** Per-WU state pointer — committed alongside task list updates
> in the same atomic operation. Lightweight factual state so anyone on this branch
> can see where work stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal
> session context. Together they implement P5 (Context Preservation). See
> `session-handoff.md` for the update protocol.

## Active Work

**State:** In Progress
**Branch:** technical/work-status-restructure
**Task List:** tasks-work-status-restructure.md
**Next Task:** Task 4.1 — Draft `deactivate-work-unit.md` — Case A primary procedure (line ~1035)
**Last Completed:** Task 3.6 — broader `WORK-STATUS` textual reference sweep
(22 live surfaces, 43 file touches). Updated workflow files
(`3_process-task-loop`, `arc-extensions`, `02_define-project`,
`maintain-project-docs`, `prepare-commits`, `verify-arc-integrity`,
`03_configure-external-integration`), skill files (`skills/README`,
`arc-commit`, `arc-task-audit`), hook/script logic (`commit-msg` RULE 7 +
`verify-integrity.sh` Session State — both derive status file from staged
task list like pre-commit CHECK 10), strategy docs (file-classification
exemplars, package-project-sync template inventory, configurability-
architecture defaults), top-level refs (META-PRD, TECHNICAL-OVERVIEW,
arc/README), adopter template (QUICK-REFERENCE.template), user/README,
and agent-tool skill copies (`.claude/`, `.codex/`). Dual-copy sync
preserved; MD060 alignment fixes post-edit. Tier 2 gates green (616 tests,
lint, typecheck); manual verify-integrity.sh run confirmed new glob-scan
resolves this WU's status file correctly.
**Blockers:** [none]
**Next Action:** Begin Phase 4 — author `deactivate-work-unit.md` from
scratch. Task 4.1 ships the Case A primary procedure (no work, not merged).
