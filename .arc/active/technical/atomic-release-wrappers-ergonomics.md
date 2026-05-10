# Atomic Tasks — Release Wrappers — Adopter Ergonomics

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

- [x] **Fix `print-patterns --harness codex` to emit Starlark kwargs form**
    - _Goal:_ The codex emitter at
      `packages/arc-framework/src/handlers/release/setup/print-patterns.ts:60-61` outputs
      positional `prefix_rule([...])`. Codex's Starlark loader requires kwargs — `pattern=[...]`,
      with `decision` defaulting to `"allow"`. Switch to the kwargs form, update the matching
      unit test (string-match in `__tests__/` likely needs adjustment), and validate empirically
      at WU2 R13 by loading the emitted patterns through codex-cli to confirm acceptance.
    - _Outcome:_ Switched the codex branch to `prefix_rule(pattern=[...])`; updated the matching
      unit test assertion. `notes-release-wrappers-ergonomics.md` § Reference-Implementation
      Pattern Specifics → Codex CLI synced (kwargs form + corrected install path
      `~/.codex/rules/default.rules`). Empirical confirmation against codex-cli still pending at
      WU2 R13.
