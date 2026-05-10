# Strategy: Interlock Release Wrappers

**Purpose:** Architectural reference for ARC's interlock release wrappers — `arc release commit`
and `arc release push`. Carries the trust model, value-layer composition, when-to-use /
when-not-to-use guidance per harness mode, the universal route for any harness, the relationship
to custom user-level hooks, and strategic awareness around the wrapper system.

**Scope:** What the wrappers are, why they exist, when to engage them, and how they compose with
adjacent layers. Setup procedure (detection, install, verify, record state, rollback) lives in
[`setup-release-wrapper.md`][setup-workflow].

---

## Contents

- [Overview](#overview) — what release wrappers are, what opt-in produces
- [Trust Model](#trust-model) — two value layers, per-mode framing
- [When Not to Use This](#when-not-to-use-this) — non-fit cases
- [Per-Harness Reference Implementations](#per-harness-reference-implementations) — Claude Code, Codex CLI
- [Agent-Adaptive Path](#agent-adaptive-path) — universal route for any harness
- [Custom User-Level Hooks (Parallel Layer)](#custom-user-level-hooks-parallel-layer) — composition with denylist hooks
- [Strategic Awareness](#strategic-awareness) — known characteristics worth anticipating

---

## Overview

The interlock release wrappers — `arc release commit` and `arc release push` — wrap `git commit`
and `git push` at the CLI boundary and enforce ARC interlock state before invoking git. Every
wrapper invocation validates the resolved interlock value against the wrapper's scope, refuses
destructive flags, and writes one audit-log entry per invocation regardless of opt-in state.

Opt-in is deliberate: running `arc release setup install` once per machine translates the
workflow's contract into the resident harness's permission surface and records the per-developer
opt-in flag (`arc.releaseEnabled = true`) plus a per-harness marker entry. Opt-in is per-developer
and per-machine — different developers in the same repo make the choice independently, and
switching machines requires re-running setup on the new machine.

For the step-by-step setup procedure, see [`setup-release-wrapper.md`][setup-workflow]. For
posture inspection at any time, run `arc release status`.

## Trust Model

The wrapper offers two value layers. Understanding the composition is the load-bearing
distinction: which layer engages depends on the harness's permission mode.

### Value Layers

**Unconditional — validation + audit.** Fires on every wrapper invocation regardless of opt-in
flag or harness mode. Three components:

- **Interlock validation.** Resolves the configured interlock value (`commit_interlock`,
  `push_interlock`) against the wrapper's command scope on the permissiveness ladder
  (`manual` → `on-{primary}` → `on-workflow`). On scope-mismatch, refuses with exit code 11 and
  an audit entry; never invokes git.
- **Destructive-flag refusal.** Commit-side: `--amend`, `--allow-empty`, `--no-verify`.
  Push-side: `--force` / `-f`, `--force-with-lease`, `--delete` / `-d`, `--mirror`, and the
  `+refspec` force-push pattern. All refuse with exit code 12 regardless of interlock state. The
  wrapper is a deliberately narrow surface; destructive shapes route through raw `git`, where
  the harness gate fires explicitly.
- **Audit log.** One JSONL entry per invocation at
  `.arc/user/{identity}/.internal/.audit-log.jsonl` — captures sanitized argv (commit message
  bodies redacted), resolved interlock state, active work-unit pointer, and outcome shape (commit
  hash / push refStatus / refusal code). Local-only by default; per-developer; gitignored.

This layer is the universal benefit. Opt-in always engages it.

**Conditional — harness-prompt bypass.** Engages only under default-prompt mode with allowlist
patterns installed. The harness's argv-prefix matcher recognizes `arc release commit` and
`arc release push` as allowlisted invocations and skips the per-invocation harness prompt. Raw
`git commit` and `git push` continue to prompt as before.

This layer is friction reduction under default-prompt mode. Under bypass mode it's a no-op (no
harness prompt to skip).

### Per-Mode Framing

The harness operates in one of two postures. Setup detects the mode and conditions its
acknowledgment text accordingly; both modes engage the wrapper, but the value composition
differs.

**Default-prompt mode** (cross-harness baseline). The harness gates every Bash invocation by
default. Both value layers materialize — validation + audit fire on every wrapper invocation,
and the allowlist install removes the per-invocation harness prompt for matching wrapper
commands.

The trust shift: ARC's interlock layer becomes the canonical authorization point for
`arc release commit` / `arc release push` invocations. Other git invocations (raw `git commit`,
`git push`) continue to prompt as before — nothing else changes. Opt-in records explicit
acceptance that ARC's mechanical enforcement is the review surface for matching invocations
rather than the harness prompt.

**Bypass mode** (`bypassPermissions`, dangerous mode, equivalents — often paired with
custom user-level hooks running denylist logic for selective prompting). The harness
allows Bash invocations without prompting. Allowlist
install is a no-op — there is no harness prompt to skip — so the conditional layer doesn't
engage. The unconditional layer (validation + audit) is the primary value prop.

Opt-in under bypass records the decision to engage wrapper validation as the canonical
authorization signal for matching invocations. Under bypass, this layer is the primary review
surface for `arc release commit` / `arc release push`.

## When Not to Use This

The wrappers are strictly opt-in. Three cases where opting out (or remaining out) is the right
choice:

**Under default-prompt mode, when the per-invocation harness prompt is the preferred primary
review surface.** The harness prompt is informative — every `git commit` / `git push` lands at a
deliberate human decision point. If that rhythm fits, opting out keeps it. The wrapper still
works mechanically without opt-in (validation + audit fire), but the prompt continues firing
too — both the harness prompt and ARC's interlock validation engage, which reads as redundant
rather than complementary.

**When the durable opt-in needs more deliberation.** The flag (`arc.releaseEnabled`) is
per-developer git-config local; it persists across sessions until cleared via
`arc release setup uninstall`. Deferring is first-class — `arc release setup install` remains
available indefinitely.

**Under bypass mode, when validation + audit isn't the right fit.** The unconditional layer is
the only mechanical value layer the wrapper itself engages under bypass — friction reduction
arrives differently depending on whether custom user-level hooks are in play (see § Custom
User-Level Hooks for the interaction). A posture leaning entirely on custom user-level hooks
for command vetting may make the additional CLI-boundary validation feel duplicative — though
the layers cover different concerns (broad command vetting vs. ARC-state correctness). There
is no "validation off" justification under bypass mode the way there might be under
default-prompt (where the harness prompt itself is a review surface). Either the unconditional
layer earns its place for this posture, or it doesn't.

## Per-Harness Reference Implementations

Two harnesses ship with reference-implementation support: documented mode-detection patterns,
canonical allowlist patterns, paste-ready output via
`arc release setup print-patterns --harness <name>`, and full coverage in the setup workflow's
per-harness reference notes.

**Claude Code.** Allowlist install lands in `.claude/settings.json` (project-scoped). Mode
detection inspects `permissions.defaultMode`. Setup workflow Step 3 handles the JSON merge
against the existing `permissions.allow` array.

**Codex CLI.** Allowlist install lands in `~/.codex/rules/default.rules` as Starlark
`prefix_rule()` calls. Mode detection inspects `approval_policy` in `~/.codex/config.toml`.
Codex's matcher unwraps `bash -lc` / `zsh -lc` shell wrappings via a narrow word-only grammar
before pattern matching — environment-prefixed, output-redirected, command-substituted, and
ANSI-C `$'...'` quoted invocations fall through to harness prompt by design. Agent-issued
invocations follow the supported grammar by convention; the fall-through is reachable mainly via
hand-typed edge cases.

For patterns, paths, mode-detection details, and the matcher's full supported / fall-through
table, see [`setup-release-wrapper.md`][setup-workflow] § Per-Harness Reference Notes. For
paste-ready output, run `arc release setup print-patterns --harness claude-code` or
`--harness codex`.

Reference-implementation status means convenience helpers exist for the harness — canonical
pattern formatters, documented detection patterns — not that ARC owns per-harness format-write
logic. The contract is the deliverable; reference implementations are convenience layers on top
of the universal route.

## Agent-Adaptive Path

The setup workflow is a six-element contract — canonical command shape, prefix-match semantics,
scope, mode awareness, side effects, verification expectations. Reference implementations
translate the contract into specific harness idioms (JSON for Claude Code, Starlark for Codex).
For any harness outside the reference set, the resident agent translates the contract against
the harness's own permission-config conventions.

This is a universal route, not a fallback. ARC publishes the contract; the agent applies it. A
new harness lands → no ARC release required for setup support. The agent reads the harness's
permission-config conventions (from prior knowledge, harness docs, or by asking directly),
translates the contract, writes the equivalent allowlist entries, and runs the behavioral test
under default-prompt mode. The setup workflow's verify gate (agent-reported install success +
behavioral test + user confirmation) catches translation errors regardless of harness.

Agent edit fidelity per harness is the load-bearing trust property. The behavioral test —
`arc release commit --version` invoked directly through the harness, observing prompt presence —
is the integrity surface that catches subtle config-write errors agent self-read alone misses
(JSON escaping, Starlark indentation, key-path mismatch).

For the procedure, see [`setup-release-wrapper.md`][setup-workflow] § Agent-Adaptive Path.

### opencode

opencode uses the agent-adaptive path with two documented upstream limitations:

- [sst/opencode#6676] — flag-parsing bug may cause `arc release commit -m "..."` to not match
  patterns reliably.
- [sst/opencode#15507] — silent config-validation failure: typos in opencode permission keys are
  ignored without error.

The wrapper itself works regardless of these issues — the unconditional layer (validation +
audit) fires on every invocation. The conditional layer (allowlist match) may behave
inconsistently until upstream resolves. Setup workflow surfaces the limitations explicitly when
opencode is detected. A polished convenience-helper formatter for opencode lands when upstream
resolves; the agent-adaptive path is available immediately.

## Custom User-Level Hooks (Parallel Layer)

Custom user-level hooks — scripts the developer installs at the harness's hook surface (e.g.,
`~/.claude/hooks/<name>.sh`, Codex equivalent) that intercept commands and prompt selectively
based on the developer's own criteria — and the interlock release wrappers are complementary
layers, not alternatives. They cover different concerns at different boundaries:

| Layer                   | Boundary       | Coverage                                            | Mechanism                                |
|-------------------------|----------------|-----------------------------------------------------|------------------------------------------|
| Custom user-level hooks | Harness layer  | Broad — any command pattern the hook matches        | Pre-execution hook intercepts shell call |
| Interlock wrappers      | CLI boundary   | Narrow — `arc release commit` / `arc release push`  | Wrapper validates ARC state, then spawns |

The two compose without conflict. A custom hook denying `git push --force` continues to fire
even when the wrapper is engaged — wrapper invocations don't bypass the hook layer. Conversely,
the wrapper's interlock validation and destructive-flag refusal fire even when the hook allows
the invocation.

Under bypass mode, pairing both layers is typical — custom hooks cover the broad surface that
bypass mode otherwise leaves un-prompted, while wrapper validation provides the ARC-state
correctness check for release operations. Under default-prompt mode, either or both works; the
layers compose identically either way.

### Friction reduction across layers

The conditional value layer (harness-prompt bypass, § Trust Model) extends naturally across the
harness/hook split because of the asymmetry between allowlist and denylist mechanics.
Default-prompt harnesses gate everything by default and require explicit allowlist entries to
skip the prompt — `arc release setup install` writes those entries for matching wrapper
invocations. Custom user-level hooks usually run as denylists — specific patterns trigger the
prompt, unrecognized commands fall through silently. Wrapper invocations
(`arc release commit`, `arc release push`) typically aren't on the denylist by default, so they
pass through without prompting in the common case. This mirrors how `arc sync` has worked since
it landed: a denylist that matches `git push` does not match `arc sync`, so sync invocations
execute silently while raw `git push` prompts as before.

Edge case: if a custom hook uses a broad pattern that matches wrapper commands (e.g., a
wildcard catching `arc release *`), refinement to exclude `arc release commit` /
`arc release push` is the analogous lever to allowlist install on default-prompt harnesses.
The wrapper still works mechanically without that refinement; it just continues to receive the
hook's prompt.

Validation + audit fires regardless of either layer's prompt behavior — the unconditional layer
is independent of the friction-reduction question.

## Strategic Awareness

Known characteristics of the wrapper system worth anticipating. These are not operational
troubleshooting (the setup workflow's verify step covers verify failures and similar
fix-on-spot cases) — these are properties to know exist before they surface.

### Trust-model shift acceptance

Opt-in is recorded as a single explicit accept at setup time. The trust shift it represents
(ARC interlock as the per-invocation review surface for matching invocations) holds for the
duration of the opt-in. Two surfaces help keep the shift visible:

- **`arc release status`** — reports engaged value layers and per-harness install state on demand.
- **Session-init orientation** — surfaces routing-shift detection when this session's resolved
  routing differs from the previous session's (e.g., interlock keys changed in git-config or
  yaml since last handoff).

The opt-in is durable but reversible. `arc release setup uninstall` rolls back per-harness, and
removes the opt-in flag when the last harness entry is removed.

### Interlock setting changes shift routing

The wrapper's authorization model is scope-coverage on the interlock's permissiveness ladder
(`manual` → `on-{primary}` → `on-workflow`). Changing an interlock value changes which
invocations authorize through the wrapper. The CLI handler computes the effective routing once
per session at session-init; orientation surfaces the shift when the resolved value changes
between sessions.

Changing interlock values mid-stride applies at the next session — the per-session resolution
snapshot is the boundary, not per-invocation re-resolution.

### Multi-developer asymmetric setup

Setup state is per-developer per-machine. In a multi-developer repo, each developer makes the
opt-in choice independently. Asymmetric posture (one developer opted in, another not) is
expected — parallel to existing per-developer interlock-setting variation. Neither posture
blocks the other's work; the wrapper still works mechanically without opt-in either way.

### Wrapper or interlock implementation bug

The release wrapper is security-tier code: exhaustive matrix testing on the validation library,
audit-log shape, and refusal cascade; exhaustiveness defaults catch refusal-taxonomy drift; the
audit-log writer hand-rolls schema validation. A bug that lets a bad operation through is the
load-bearing failure mode the testing posture is sized for.

The audit log is the forensic recovery surface — every wrapper invocation lands one entry with
sanitized argv, resolved interlock state, active work-unit pointer, and outcome shape.
Identity-absent, no-arc-project, and dry-run paths skip the audit write and are documented as a
structural blind spot for the identity-keyed audit-log destination.

---

[setup-workflow]: ../../../system/workflows/arc/supplemental/setup-release-wrapper.md
[sst/opencode#6676]: https://github.com/sst/opencode/issues/6676
[sst/opencode#15507]: https://github.com/sst/opencode/issues/15507
