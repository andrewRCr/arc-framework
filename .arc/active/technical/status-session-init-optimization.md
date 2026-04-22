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
- **Next Task:** Task 3.R.k.f — Session-init workflow integration + strategy pointer (line ~1929)
- **Last Completed:** 3.R.k.e — Composite `arc status` command. Orchestrator at
  `src/commands/status/run.ts` (`runStatus` / `runSessionInitStatus`) fans out via
  `Promise.all` over four injected probe slots (`user`, `extensions`, `config`, `active`),
  wrapping each resolution/rejection into a typed `Probe<T>` union — composite always resolves,
  never exits non-zero on probe failure. User slot short-circuits to `identity-missing`
  synchronously when `identity === null`, never invoking the user probe (user notes are
  identity-scoped). Types at `src/commands/status/types.ts` (`StatusResult` full / `SessionInitProbeResult`
  scoped discriminated on `mode`, `StatusProbes` / `SessionInitProbes` bind cwd+I/O at
  construction for trivial test mocking). Format at `src/commands/status/format.ts` renders
  five stably-ordered sections (Identity → User → Extensions → Config → Active) delegating
  each slot to its probe-specific formatter; errored slots render `(unavailable) <message>`.
  Handler at `src/handlers/status.ts` reads identity/role via two parallel `gitConfigGet`
  calls with exported `normalizeGitConfigValue` collapsing undefined/empty/whitespace to `null`.
  Facade `src/commands/status.ts`, CLI wiring for `arc status` with `--session-init` / `--json`.
  Tier 1 green: typecheck / typecheck:test / lint:ts / lint:sh / test:unit (757, +32: 19
  orchestrator + 5 normalizer + 8 format) / build; 4 new integration tests (clean / multi-WU
  session-init / mixed partial-failure / identity-missing short-circuit). End-to-end sanity on
  this repo: `--session-init --json` returns `{mode:"session-init",identity:{identity:"andrew",
  role:"maintainer"},user:{ok:true,...state:"clean"},...,active:{ok:true,...resolution:"single",
  path:"..."}}` with all four slots `ok:true`. Default-mode Clack output renders the five
  sections in stable order with full per-probe summaries. Orchestrator / format / normalizer
  tests batched per test-first batching-judgment clause (tightly coupled to a single orchestrator,
  format layer, and handler helper).
- **Blockers:** none
- **Next Action:** Begin 3.R.k.f — Session-init workflow integration + strategy pointer.
  Rewrite session-init.md Batch 1 to drop the four separate probe invocations + two git-config
  reads and replace them with a single `arc status --session-init --json` call. Remove the
  standalone Step 1.5 user-sync probe, the active-extensions grep, the direct `arc-config.yml`
  file read (Step 4 + Batch 1), and the `git config arc.identity` / `arc.role` reads; update
  agent-side instructions to consume fields from the composite JSON envelope. Update Step 2
  Item 8's many-file disambiguation to source candidates from `active` result field, preserving
  the user-prompt fallback. Add a "Probe pattern" subsection to
  `strategy-session-operations.md § Context Loading Model` describing the harness-consumes,
  composite-first design. Two-copy sync: framework file — edit package source and `.arc/` copy.
