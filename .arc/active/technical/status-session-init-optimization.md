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
- **Next Task:** Task 3.R.k.e — Composite `arc status` command (line ~1874)
- **Last Completed:** 3.R.k.d — `arc active status` probe. Reader at
  `src/lib/active/status-reader.ts` (`readActiveStatusCandidates` scans `.arc/active/`,
  detects Lite vs Full layout, parses Branch / State / Next Task / Task List per WU;
  exported `parseStatusFile` is regex-driven, tolerates list-bullet / bare / blockquote forms,
  strips inline backticks, takes the first match on repeats). Probe runners at
  `src/commands/active/status.ts` (`runActiveStatus` full enumeration; `runActiveSessionInitStatus`
  applies the none/single/multiple resolution discriminant — SESSION-NOTES/branch/state
  precedence stays agent-side). Command module `src/commands/active/{types,status,format}.ts`,
  facade `src/commands/active.ts`, handler `src/handlers/active.ts`, CLI wiring for
  `arc active status` with `--session-init` / `--json`. Tier 1 green: typecheck /
  typecheck:test / lint:ts / lint:sh / test:unit (725, +31: 16 reader + 15 format) / build;
  9 new integration tests. End-to-end sanity on this repo: `--session-init --json` returns
  `resolution:"single"` with the resolved status path; full-mode JSON returns all four parsed
  fields with backticks stripped. Parser / reader / formatter tests batched per test-first
  batching-judgment clause (tightly coupled to a single regex-driven parser + layout detector).
- **Blockers:** none
- **Next Action:** Begin 3.R.k.e — Composite `arc status` command. Orchestrator invokes
  the four probe helpers in parallel via `Promise.all`, returns a typed discriminated
  union on `mode` (`StatusResult` full vs `SessionInitProbeResult` scoped), surfaces
  per-probe errors via result shape (not process exit), and includes a top-level
  `identity: { identity, role }` populated by direct `git config` reads. Command module
  in `src/commands/status/` (slot opened by 3.R.k.a's rename of `status.ts` → `health.ts`);
  composite handler in `src/handlers/status.ts`.
