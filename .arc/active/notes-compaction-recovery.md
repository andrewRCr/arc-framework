# Notes: Compaction Recovery

- [Manual end-to-end recovery protocol (per harness)](#manual-end-to-end-recovery-protocol-per-harness)
- [Harness adapter implementation reference](#harness-adapter-implementation-reference)
- [Verified harness behavior](#verified-harness-behavior)

---

## Manual end-to-end recovery protocol (per harness)

The deterministic parts (seed round-trip, per-`sessionType` load-set resolution, recovery-audit diff) are
unit-tested. End-to-end survival of an opaque compaction is a **manual protocol**, run per harness and exercised
continuously by maintainer dogfooding (Codex forces compaction often). Run each block after wiring the harness's
hook adapter (opt-in).

### Common preconditions

- Hook adapter installed (Leg A: pre-compaction seed write; Leg B: post-compaction recovery requirement) and opted in.
- An ARC session mid-task (an active WU with a resolved `sessionType` and a concrete in-flight task), so there is
  real procedural context to lose and a task pointer to resume.

### Claude Code

1. **Seed write (Leg A).** Drive the session toward the compaction threshold (or trigger `/compact`). Confirm
   `PreCompact` fired and `.arc/user/{identity}/.internal/compaction-seed.json` was written/updated, and that the
   hook exited 0 **without blocking** the compaction.
2. **Compact recovery (Leg B).** After the compaction, confirm `SessionStart(source=compact)` injected the
   recovery instruction, `session-recover` ran (lean probe re-run → load-set re-resolve → audit), and the agent
   resumed the in-flight task with the procedural floor restored (briefs / `DEV-RULES` / `WORKING-MEMORY` /
   state-selected context present again).
3. **`clear` boundary.** Run `/clear`; confirm no ARC recovery hook injects context. Clear remains a harness
   reset; any later ARC entry should be ordinary `session-init` / `arc-session`, **not** `session-recover`.
4. **Audit divergence.** Write a seed, then mutate recovery-relevant state without rewriting the seed (for example,
   change the dirty-file path set or advance the task-list cursor). Confirm the recovery audit detects the
   seed-vs-reality divergence and **stops for direction** rather than silently resuming.

### Codex CLI

Same four checks. Wiring differences:

- Hooks are configured via `hooks.json` (vs. CC's `settings.json` hooks). Codex docs now say hooks are enabled by
  default; the opt-in installer can still write `[features] hooks = true` as an explicit local stance when not
  blocked by policy.
- Leg B uses `PostCompact(trigger=manual|auto)` as the immediate recovery stop. It writes an ARC-owned pending
  marker; `UserPromptSubmit` injects recovery context on the user's next prompt. Codex does not hook
  `SessionStart(source=compact)` because it can fire late or duplicate.
- `SessionStart(source=clear)` runs cleanup-only marker removal; clear remains a harness reset and does not
  inject recovery.
- Post-review hardening keeps the Codex workaround bounded and session-safe: pending markers and seed handoffs
  are scoped to the Codex thread when `CODEX_THREAD_ID` is available, otherwise to a process fallback; the next
  prompt clears the exact marker path only after successful recovery. Seed handoffs are short-lived, scope-checked,
  consumed after marker creation, and cleared before each new seed attempt so failed pre-compact runs cannot reuse
  stale handoffs.
- If `PostCompact` cannot resolve a seed handoff, it still writes a scoped fallback marker so `UserPromptSubmit`
  can inject `session-recover` and let `arc recover audit --json` surface the seed problem deterministically.
- In this self-hosting repo only, the installed Codex hook sets `ARC_HOOK_STALE_BUILD_COMMAND="npm run build"` so
  a stale `npx arc` dev build can be repaired before retrying the seed write. The shipped adopter recipe does not
  auto-build.

### OpenCode (deferred — no shipped recipe)

No reliable post-compaction inject today; covered by the portable `arc-recover` manual fallback only. Re-run this
protocol if/when its `session.start(compact)` hook lands (watch item).

## Harness adapter implementation reference

The canonical seed/recover commands are identical across harnesses; only the wiring differs (the P8
canonical/adapter split — adapter layer is config, not logic). Detail beyond the spec's condensed table:

| Concern                     | Claude Code                                                        | Codex CLI                                                                       | OpenCode                                                       |
|-----------------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|----------------------------------------------------------------|
| Hook model                  | `PreCompact` (matcher `manual`/`auto`) + `SessionStart` (`source`) | `PreCompact`/`PostCompact` (`trigger`) + `UserPromptSubmit`                     | Plugin (TS/JS); `experimental.session.compacting` + bus events |
| Config file                 | `settings.json` hooks                                              | `hooks.json` (+ optional `[features] hooks = true`)                             | Plugin config (keys under-documented)                          |
| Leg A — write seed          | `PreCompact` runs shell; read-only; can block                      | Same shape                                                                      | `experimental.session.compacting` + shell                      |
| Leg B — require recovery    | `SessionStart(source=compact)` → stdout / `additionalContext`      | `PostCompact(trigger=manual\|auto)` stops; next `UserPromptSubmit` injects      | Fragile — bake pointer into compaction summary instead         |
| `clear` vs `compact` signal | `clear` unhooked; `compact` hooks                                  | `clear` cleanup-only; `compact` hooks                                           | `session.created` vs `session.compacted`                       |
| Auto-compaction disableable | No documented global disable                                       | No off switch (threshold clamped)                                               | Configurable threshold (keys under-documented)                 |
| Stability                   | Documented, stable                                                 | GA, but post-compaction injection requires this workaround pending upstream fix | All compaction hooks `experimental.` — breaking-change risk    |

Implementation constraints carried from the research:

- **Never block.** Both CC and Codex can block compaction from the pre-compaction hook; do not — blocking
  auto-compaction surfaces the context-limit error and fails the request. Write-and-exit-0 only. The seed-write
  fires *often* (both harnesses have compaction-frequency issues), which is exactly why the seed stays lean.
- **Two-leg split maps cleanly.** `PreCompact` is read-only on both (writes files, can't inject) — the seed-write
  leg. Claude Code recovery lands at `SessionStart(compact)`; Codex recovery uses `PostCompact` for the immediate
  turn-scoped stop and `UserPromptSubmit` for the next-prompt injection because `PostCompact` cannot inject
  context and `SessionStart(compact)` is not reliable enough.
- **CC and Codex share commands, not timing.** The canonical commands are identical, but the adapter wiring differs
  where the harness lifecycle differs. That still validates the canonical/adapter split without pretending the two
  hook schedulers are identical.
- **Token specifics are illustrative only.** Window sizes / thresholds move with model versions; depend only on
  "compaction fires below the coherence ceiling," never a number.
- **OpenCode watch item.** Its clean post-compaction-turn inject is broken/unmerged; the `session.start(compact)`
  hook would fix it — revisit the deferred recipe then.

## Verified harness behavior

Grounds the spec's claim that the `arc` / `npx arc` invocation convention survives compaction without a seed field
(checked against Claude Code docs, 2026-06-28):

- **Project-root `CLAUDE.md` and its `@`-imports** (e.g. `AGENTS.md`, carrying the self-hosting `npx arc` rule)
  are re-read from disk and re-injected after `/compact` and auto-compaction — documented behavior. Nested /
  subdirectory `CLAUDE.md` files are the exception (they reload lazily on the next file read in that directory),
  but a root-level import is covered.
- **Claude Code `SessionStart(compact)` is the documented recovery carrier** for post-compaction context. Codex
  differs: its current docs put `PostCompact` at turn scope but its schemas do not allow `additionalContext` for
  that event, while issue reports show `SessionStart(compact)` can fire late. Codex therefore uses the hard-stop
  plus pending-marker workaround until upstream exposes a seamless post-compaction injection hook.
