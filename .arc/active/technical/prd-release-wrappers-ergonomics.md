# PRD: Release Wrappers — Adopter Ergonomics

**Purpose:** Adopter onboarding for interlock release wrappers — mode-aware setup workflow, CLI
orchestration, status integration, and ADR-018-aware workflow routing — engages WU1's foundation
across default-prompt and bypass adopter postures.

---

## Introduction

WU1 (`prd-release-wrappers-foundation.md`, archived at
`.arc/reference/archive/2026-q2/technical/08_release-wrappers-foundation/`, shipped via PR #30 merged
2026-05-09) delivered the mechanical foundation for **interlock release wrappers** — `arc release
commit` and `arc release push`, which wrap `git commit` / `git push` at the CLI boundary and enforce
ARC interlock state (commit-interlock, push-interlock; ADR-018) before invoking git. Hand-configured
adopters can use them end-to-end: manually edit harness permission files, run `arc release opt-in` to
flip the per-developer `arc.releaseOptedIn` git-config flag.

This works for the friction-tolerant minority. Adopters who would benefit from the wrapper need a
guided setup. But "guided setup" doesn't have a single shape, because adopters arrive in two distinct
postures:

- **Default-prompt mode** (cross-harness baseline). Harness gates every Bash invocation; allowlist
  install removes the per-invocation re-prompt for wrapper invocations. Both wrapper value layers per
  ADR-017 materialize: validation + audit (unconditional) and harness-prompt bypass (conditional).
- **Bypass mode** (`bypassPermissions`, dangerous mode, equivalents — typically paired with denylist
  safety-gate hooks). Allowlist install is a no-op since there's no harness prompt to skip. The
  unconditional layer (validation + audit) is the value prop; opt-in records explicit acceptance of
  wrapper validation as the canonical authorization signal.

The deliverable shape differs by mode. WU2's setup story is two stories — install-and-verify under
default-prompt, detect-and-record-with-reframing under bypass — sharing one workflow, status surface,
and documentation framing.

**Why now:** WU1 has landed; adopters can hand-configure, but the rough edges show immediately. WU2
ships within the same release window so the release-wrapper system arrives as a coherent capability
rather than a primitive-with-promised-ergonomics.

**Naming convention:** "Interlock release wrappers" is the precise term used at first mention in
adopter-facing surfaces (workflow doc, strategy doc, status output). "Release wrappers" / "the wrapper"
flow as shorthand once context is established. This PRD follows the convention.

## Goals

- Lower the friction-tolerance bar: typical adopters can engage release wrappers without hand-editing
  harness permission files or memorizing git-config keys.
- Universal coverage across harness ecosystems via a workflow-as-contract architecture: ARC publishes
  the contract; the resident agent translates into harness-specific writes against its own knowledge.
  Reference implementations (Claude Code, Codex CLI) ship polished examples; other harnesses follow
  the agent-adaptive path on the same workflow.
- Mode-aware setup that distinguishes default-prompt and bypass postures, conditions trust-model
  framing accordingly, and produces the right outcome for each (allowlist install vs. record-only
  audit-validation opt-in).
- Workflow integration that prefers the wrapper over raw git when (a) `arc.releaseOptedIn === true` and
  (b) the resolved interlock value authorizes the invocation context per ADR-018's scope-coverage rule.
- Visible posture state — `arc release status` and session-init orientation surface the engaged
  release-wrapper state with mode-aware text so users know what authorization layers are active.
- Strict opt-in throughout. No auto-enable; deferral and never-enable paths are first-class.

## System Scenarios

**Scenario 1 — Default-prompt Claude Code adopter, fresh setup at onboarding.**
User running `arc init` reaches the initial-setup release-wrapper step. Agent describes interlock
release wrappers and offers the three-way choice; user picks "set up now". Workflow detects Claude
Code in default-prompt mode (tier-1 detection pattern), surfaces trust-shift acknowledgment, prompts
user for explicit accept. On accept: agent reads `.claude/settings.json`, merges canonical patterns
(`Bash(arc release commit:*)`, `Bash(arc release push:*)`), writes file, re-reads to confirm.
Behavioral test: agent runs `arc release commit --version`, observes no harness prompt. Agent reports
install + verification success. User confirms. `arc release setup install` records
`arc.releaseOptedIn = true` plus marker entry `{name: "claude-code", mode: "default-prompt",
installedAt: "..."}`.

**Scenario 2 — Bypass-mode Claude Code adopter, post-onboarding standalone.**
User runs `arc release setup install` directly (deferred at onboarding, returning later). Workflow
detects Claude Code with `permissions.defaultMode: "bypassPermissions"` (tier-1). Trust-model
acknowledgment reframes to audit-only: "you're opting in to wrapper validation + audit as a layered
protection above your existing safety-hook posture; ARC interlock becomes the canonical authorization
signal for matching invocations." User accepts. Workflow skips allowlist write with explanation.
Records `arc.releaseOptedIn = true` plus marker entry `{name: "claude-code", mode: "bypass",
installedAt: "..."}`. Status command thereafter reports "release wrapper opt-in: enabled" + "Claude
Code (bypassPermissions) — no harness gate to bypass" + "Active value layers: validation + audit".

**Scenario 3 — Multi-harness setup with one failure.**
User has Claude Code + Codex CLI. Workflow runs install for both. Claude Code installs and verifies
clean. Codex install fails (Starlark syntax error from agent edit). Workflow surfaces failure: "Codex
install failed at verification: <error>. Record opt-in for Claude Code only, retry Codex now, or
abort?" User picks "Claude Code only". State records: `arc.releaseOptedIn = true`; marker has Claude
Code success entry only. Status thereafter reports Codex as not-installed; user can rerun setup at any
time.

**Scenario 4 — Agent-adaptive path against an unknown harness.**
User running an unfamiliar harness invokes `arc release setup install`. Workflow's mode-detection tier
1 fails (no known pattern). Tier 2: agent surfaces "I don't know harness X's mode-config conventions
off the top. Want me to check its docs, inspect a likely config path, or ask you directly?" User
picks "ask me directly". Tier 3: workflow asks "Does your harness gate every Bash invocation by
default? (default-prompt) Or does it allow without asking? (bypass)". User answers default-prompt.
Workflow proceeds: agent reads harness's permission config (path discovered via ad-hoc investigation
or user-pointed), translates the six contract elements into the harness's idiom, writes, re-reads,
runs behavioral test. Marker records `{name: "<custom-harness>", mode: "default-prompt",
installedAt: "..."}` — free-form name accepted.

**Scenario 5 — Workflow integration in a task-work commit.**
Active agent in a task-execution session, committing task work. Resolved settings (from session-init
envelope): `arc.releaseOptedIn = true`, `arc.commitInterlock = on-task-approval`. ADR-018 authorization
rule: `arc.commitInterlock === on-task-approval` authorizes wrapper for task-work commits. Agent prefers
`arc release commit` over raw `git commit`. Wrapper validates, audits, invokes git, returns.

**Scenario 6 — Workflow integration in a ceremony commit.**
Same agent, same session, now firing a handoff commit. `arc.commitInterlock` is still `on-task-approval`.
ADR-018: `on-task-approval` does not authorize ceremony commits (would need `on-workflow`). Agent uses
raw `git commit` (harness-prompt path). Wrapper bypassed; harness gates appropriately.

## Requirements

### P0 — must-have

**R1 — Setup workflow (primary deliverable).**
Markdown workflow at `.arc/system/workflows/arc/supplemental/setup-release-wrapper.md`. Mode-aware
throughout. Carries:

- The six contract elements (canonical command shape, prefix-match semantics, scope, mode awareness,
  side effects, verification expectations).
- The three-tier mode-detection ladder (R3 below).
- Per-harness reference notes for Claude Code and Codex CLI (tier-1 documented patterns).
- Agent-adaptive path framing for other harnesses.
- Mode-conditioned acknowledgment scripting (default-prompt = trust-shift; bypass = audit-only).
- Verify protocol (agent-reported install success + behavioral test under default-prompt mode + user
  confirmation).
- State-recording protocol (call `arc release setup install` to write `arc.releaseOptedIn` and
  marker entry).
- Rollback protocol (call `arc release setup uninstall` to remove harness-side entries, marker entry,
  and opt-out flag).

Workflow is invokable from two entry points: standalone (`arc release setup install`) and as a step
in the existing `.arc/system/workflows/arc/initial-setup/` sequence (R2). Same workflow body either
way.

**R2 — Initial-setup integration: lightweight section in `01_verify-and-configure.md`.**
Surface release-wrapper setup at onboarding by adding a lightweight section to the existing
initial-setup workflow file — NOT a new numbered workflow file. DRY: the supplemental workflow (R1)
carries the actual setup logic; the integration is a surfacer + pointer, which warrants section-level
weight, not file-level. Section content:

- Brief description: what interlock release wrappers are (working definition for newcomers without
  prerequisite ARC vocabulary), what installation does, the trust-model trade-off in one or two
  lines.
- Three-way user choice:
    - **Set up now** → user invokes `arc release setup install` (which runs the supplemental workflow
      from R1).
    - **Defer with awareness** → continue initial-setup; standalone `arc release setup install`
      remains available any time.
    - **Never** → continue initial-setup; standalone invocation still available regardless of this
      choice (the framework doesn't lock the feature out).
- Placement: Path 1 (Fresh Install) — between "Customization Beyond Config" and "Optional: Verify
  Installation". Path 2 (Join Existing) — between "Configuration Review" and "Optional: Verify
  Installation". Per-developer choice made independently by each developer joining the project.
- Strictly informational; doesn't gatekeep onboarding completion.
- Matches `01_verify-and-configure.md`'s existing collaborative tone and mirrors the "Optional:
  Verify Installation" lightweight-section pattern already established there.

**R3 — Mode-detection three-tier ladder.**
The setup workflow's mode-detection step adapts to agent confidence:

- **Tier 1 — agent knows.** Reference-implementation harnesses (Claude Code, Codex CLI) have
  documented detection patterns inside the workflow body. Workflow surfaces "I detected mode X for
  harness Y because [pattern]" and proceeds.
- **Tier 2 — agent uncertain but can investigate.** Workflow surfaces uncertainty: "I don't know
  harness Y's mode-config conventions off the top. Want me to check its docs, inspect a likely
  config path, or ask you directly?" User chooses an investigation path.
- **Tier 3 — agent doesn't know and can't readily investigate** (or user prefers direct). Workflow
  asks user: "Does your harness gate every Bash invocation by default? (default-prompt) Or does it
  allow without asking? (bypass)" Records the answer in the marker the same way as agent-detected.

Reference-implementation harnesses path through tier 1; agent-adaptive harnesses fall through per
agent confidence.

**R4 — `arc release setup install` command.**
Orchestration porcelain (full guided flow). Sub-subcommand under `arc release setup`. Behavior:

- Drives the supplemental setup workflow (R1).
- Captures user trust-model acknowledgment (mode-conditioned per R1).
- Writes the harness/mode marker entry (R8) on workflow's verify-pass.
- Records `arc.releaseOptedIn = true` via WU1's `arc release opt-in` primitive on workflow's
  user-confirm.
- Idempotent against existing opt-in state: when invoked with opt-in already recorded, surfaces
  current state (detected harnesses, modes, last-install timestamp) and offers a four-way choice:
    - **Re-verify** — rerun the workflow-mediated verify path against current marker entries.
      Default-prompt prompt observation happens as a direct outer-harness invocation, not a nested
      CLI subprocess; `installedAt` refresh happens only after workflow-confirmed success.
    - **Update markers** — re-detect modes for already-installed harnesses through the
      workflow-mediated mode-detection path (handles mode-flip on developer machine since install).
    - **Add harness** — run install flow only for harnesses not yet in the marker.
    - **Exit** — no-op acknowledged.
- On partial-success in multi-harness flows (R5 specifies the failure surface): workflow surfaces
  the failure point and offers user-choice (record opt-in for verified harnesses only, retry the
  failed harness, or abort entirely). No auto-record without explicit user acceptance of partial
  coverage.

**R5 — `arc release setup uninstall` command.**
Symmetric removal. Sub-subcommand under `arc release setup`. Behavior:

- Drives the rollback workflow.
- Agent removes harness-side allowlist entries (matches by exact pattern set the helper would
  install; conservative cleanup — refuses to touch user-curated entries that drift from the
  canonical pattern set).
- Removes the harness's marker entry.
- Records `arc.releaseOptedIn = false` via WU1's `arc release opt-out` primitive **only when
  removing the last marker entry**; uninstalls that leave siblings preserve the existing
  opt-in flag (symmetric with the install-side flag-set-on-first-install behavior).
- Idempotent on already-uninstalled state.
- When marker `harnesses` array becomes empty post-uninstall, file remains as
  `{ "schemaVersion": 1, "harnesses": [] }` (clean-slate signal preserves schema-version anchor).

**R6 — `arc release setup print-patterns [--harness <name>]` command.**
Canonical text emitter. Sub-subcommand under `arc release setup`. Behavior:

- Reference-implementation harnesses (`--harness claude-code`, `--harness codex`): emit native format
  ready to paste into the harness's permission file (JSON snippet for Claude Code,
  `prefix_rule()` Starlark calls for Codex).
- Unknown / abstract (no `--harness` flag, or unrecognized name): emit the six contract elements as
  a translation prompt the agent reads and applies for an arbitrary harness.
- Stdout-only emitter; no state changes.
- Idempotent.

**R7 — `arc release setup verify [--harness <name>]` command.**
Read-only post-install verification helper. Sub-subcommand under `arc release setup`. Behavior:

- Confirms `arc.releaseOptedIn` is recorded.
- Reads the harness/mode marker and reports each recorded harness entry, or the selected entry when
  `--harness <name>` is provided.
- Under default-prompt mode: reports that direct harness prompt observation is required and prints
  the exact direct-run command (`arc release commit --version`). It does not spawn that command
  internally, because nested CLI subprocesses cannot observe the outer agent harness permission
  prompt boundary.
- Under bypass mode: skips behavioral test (not meaningful); reports verify based on
  `arc.releaseOptedIn` state alone.
- Does **not** gate opt-in on its own. The setup workflow's verify step (agent-reported install
  success + behavioral test under default-prompt + user confirmation) holds the safety property.
  The `verify` command is a complement for ad-hoc post-install checking.

**R8 — Behavioral test mandatory under default-prompt mode.**
For any harness in default-prompt mode (whether reference-implementation or agent-adaptive), the
setup workflow's verify step requires a passing behavioral test. Test methodology: agent invokes
`arc release commit --version` (or equivalent test invocation), observes whether the harness prompts.
This invocation must happen directly through the agent harness, not as a subprocess spawned by
`arc release setup verify`. Pass = no prompt observed (allowlist match working). Fail = prompt
observed (allowlist mismatch).

Bypass mode skips the behavioral test (no prompt to observe regardless). Under bypass, verify shape
narrows to agent-reported install success + user confirmation (allowlist write may have been a no-op
per R1's per-mode branch, and that's expected).

The behavioral test catches a real failure class agent-report alone misses: subtle file-syntax errors
(JSON escaping, Starlark indentation, key-path mismatch) that pass agent-report ("I wrote the file,
re-read, entry is present") but fail at the matcher boundary.

**R9 — Harness/mode marker storage.**
Sidecar JSON file at `.arc/user/{identity}/.internal/release-setup.json`. Matches WU1's audit-log
precedent (same private-state directory; per-developer; per-machine; gitignored).

Schema (v1):

```json
{
  "schemaVersion": 1,
  "harnesses": [
    { "name": "claude-code", "mode": "default-prompt", "installedAt": "2026-05-09T19:52:48Z" },
    { "name": "codex",       "mode": "default-prompt", "installedAt": "2026-05-09T19:52:48Z" }
  ]
}
```

Field shapes:

- `schemaVersion`: integer, currently `1`.
- `harnesses`: array of harness entries. Empty array when no harnesses installed.
- `harnesses[].name`: string, free-form. Reference-implementation values are `"claude-code"`,
  `"codex"`. Agent-adaptive harnesses use whatever name the agent and user agreed on at install
  time.
- `harnesses[].mode`: string, one of `"default-prompt"` | `"bypass"`.
- `harnesses[].installedAt`: ISO-8601 UTC timestamp.

Writers:

- `arc release setup install` writes/updates entries.
- `arc release setup uninstall` removes entries.

Readers:

- `arc release status` reads to surface posture (R10).

Schema evolution: future additions (`contractVersion`, `allowlistVerifiedAt`, install attribution
metadata) join the per-harness entry as new optional fields under `schemaVersion: 1` until a
breaking shape change forces `schemaVersion: 2`.

**R10 — `arc release status` extension.**
WU1's `arc release status` extends in WU2 — single source of release posture. New fields on top of
WU1's existing surface (opt-in flag, `arc.commitInterlock` / `arc.pushInterlock` / `arc.syncInterlock` with
provenance):

- `harnesses` — array projected from the marker file (R9). Each entry shows name, mode, install
  status. Bypass-mode entries annotated "no harness gate to bypass".
- `activeValueLayers` — derived from mode and opt-in state:
    - Default-prompt with allowlist active: `"validation + audit + harness-prompt bypass"`.
    - Bypass mode: `"validation + audit"`.
    - Opt-in not recorded: `"none"` (wrapper still works mechanically; no posture engaged).

`--json` mode (extending WU1's `schemaVersion: 1` envelope to `schemaVersion: 2`): new fields land at
the envelope root alongside existing fields. `schemaVersion` bump is a forward-compatible additive
change; consumers using exhaustive-switch parsers should update at WU2 integration; consumers using
permissive parsers continue to work.

Human-readable mode (default): renders the new fields after the existing interlock block. Example
under default-prompt with active allowlist:

```text
arc.releaseOptedIn: true (git-config:local)
arc.commitInterlock: on-task-approval (git-config:local)
arc.pushInterlock: manual (default)
arc.syncInterlock: on-handoff (default)

harnesses:
  claude-code (default-prompt) — installed 2026-05-09
  codex       (default-prompt) — installed 2026-05-09
active_value_layers: validation + audit + harness-prompt bypass
```

Under bypass:

```text
arc.releaseOptedIn: true (git-config:local)
arc.commitInterlock: on-task-approval (git-config:local)
arc.pushInterlock: manual (default)
arc.syncInterlock: on-handoff (default)

harnesses:
  claude-code (bypassPermissions) — no harness gate to bypass
active_value_layers: validation + audit
```

**Design decision recorded:** no separate `arc release setup status` command. WU1's
`arc release status` is the single source.

**R11 — Session-init orientation surface (deferred to handoff-optimization WU).**
Session-init orientation does **not** carry an always-on engaged-state line for release wrappers.
Static engagement is configuration-state — the orientation discipline (per `session-init.md`
Step 6: *"Never include: configuration overrides, active-extensions list (any state), defaults
active"*) excludes that class of surface. The user opted in deliberately at setup with explicit
acknowledgment; subsequent sessions don't need a daily reminder. On-demand posture is what
`arc release status` (R10) is for.

What **does** belong at session-init is **routing-shift detection** — when this session's
resolved `releaseRouting` differs from the previous session's resolved value (because interlock
keys changed in git-config / yaml since last handoff), orient the user to the change. This is a
state-shift signal, not a config-state surface, and matches what orientation is designed to carry.

The mechanism is deferred to `plan-handoff-optimization.md` (Approach item 5,
`releaseRoutingAtLastHandoff` slot). That WU adds a snapshot at handoff via `git show` against
the post-handoff status-file, mirroring the `statusFieldsAtLastHandoff` pattern; session-init
handler diffs against this session's `releaseRouting` and surfaces a posture-change line when
values differ. Specific surface text deferred to that WU.

This WU ships `releaseRouting` (R12.1) — the slot the handoff WU snapshots. No session-init
orientation work in this WU.

**R12 — Workflow integration: structured routing model.**
Workflow integration ships as a structured-routing surface rather than per-workflow prose dispatch.
The CLI handler computes routing once at session-init from `arc.releaseOptedIn × interlock values ×
class` per the table below; workflows and skills consult the resolved value via a class tag at
each fire site.

**Class taxonomy.** Three classes cover all routing-relevant fire sites:

| Class            | Fire sites                                              | Authorized when                                                                    |
|------------------|---------------------------------------------------------|------------------------------------------------------------------------------------|
| `taskCommit`     | per-task commits (process-task-loop via arc-commit)     | `arc.releaseOptedIn` AND `arc.commitInterlock ∈ {on-task-approval, on-workflow}`   |
| `workflowCommit` | ceremony commits (activate / integrate / handoff / etc.)| `arc.releaseOptedIn` AND `arc.commitInterlock` is `on-workflow`                    |
| `workflowPush`   | ceremony pushes (handoff / activation / integration)    | `arc.releaseOptedIn` AND `arc.pushInterlock` is `on-workflow`                      |

Otherwise (and on probe failure, missing class, or unrecognized value): `raw`.

`arc sync` continues to handle its own internal push (single-leg sync push). WU1's audit retrofit
captures sync invocations on the audit umbrella; no internal re-routing through `arc release push`.

Sub-requirements:

- **R12.1 — `releaseRouting` envelope slot.**
  Session-init and session-handoff probe envelopes grow a top-level `releaseRouting` slot:

  ```jsonc
  "releaseRouting": {
    "ok": true,
    "value": {
      "taskCommit":     "wrapper" | "raw",
      "workflowCommit": "wrapper" | "raw",
      "workflowPush":   "wrapper" | "raw",
      "rationale": {
        "releaseOptedIn":  boolean,
        "commitInterlock": string,
        "pushInterlock":   string
      }
    }
  }
  ```

  Handler computes from resolved settings; `rationale` carries inputs for debugging and
  `arc release status` rendering (R10).

- **R12.2 — Canonical rule in DEV-RULES.ARC § Commit Discipline → Commit control.**
  New peer sub-bullet `Workflow class-tag routing` (with `[configurable]` marker), sibling to the
  existing `Release-wrapper invocation` bullet, carrying the rule, the three-class authorization
  conditions, the `raw` fallback (probe-failure, missing-class, unrecognized-value arms), and the
  destructive-flag carve-out. Self-contained — reads without external lookup. Constitutional
  placement chosen over a method file: load-once-per-session beats per-workflow re-load for
  default-disabled adopters; method override semantics ill-fit a runtime-resolved value. See
  `notes-release-wrappers-ergonomics.md` § Routing-Rule Placement Decision.

- **R12.3 — arc-commit skill amendment (Step 4).**
  Skill Step 4 (commit execution) references the canonical rule with class tag `taskCommit`.
  Consolidates task-work routing — workflows that invoke the skill (process-task-loop) need no
  per-site class tag.

- **R12.4 — `process-task-loop.md` zero-edit confirmation.**
  Task-work commit routing is handled via the arc-commit skill (R12.3); no per-workflow class tag
  required. Recorded for completeness; no file change beyond audit-trail confirmation.

- **R12.5 — `session-handoff.md` `workflowCommit` class tag.**
  Handoff ceremony commit (`chore(status): handoff`) takes a `workflowCommit` class tag;
  verb-elided shape (commit message body in `text` codeblock, no `git commit` literal).
  Handoff has no `git push` fire site — push is delegated to `arc sync`, which the
  carve-out above keeps out of routing scope.

- **R12.6 — `activate-work-unit.md` class tags.**
  Activation commit (`workflowCommit`) and push (`workflowPush`) class tags; verb-elided shape at
  both sites (commit message body in `text` codeblock; push args inline prose).

- **R12.7 — `activate-planning-branch.md` class tags.**
  Same pattern as R12.6 for planning-branch activation.

- **R12.8 — Recovery-flow workflow class tags.**
  Class tags applied across:

    - `integrate-work-unit.md` — ceremony pushes (×2; `workflowPush`).
    - `archive-work-unit.md` — ceremony commit (`workflowCommit`); destructive delete-push unchanged.
    - `deactivate-work-unit.md` — ceremony commit (`workflowCommit`) + push (`workflowPush`);
      destructive delete-push unchanged.
    - `rotate-branch.md` — non-destructive ceremony pushes (`workflowPush`); `--delete` and
      `--force-with-lease` invocations unchanged.
    - `integrate-planning-branch.md` — ceremony commits and pushes (mixed classes per fire site);
      destructive delete-push unchanged.

- **R12.9 — `project/address-pr-review.md` `workflowPush` class tag.**
  Project workflow ceremony push takes a `workflowPush` class tag.

**Workflow-author guidance.** Each fire site declares its class via a backtick-wrapped class tag
at the directive line. Verb is elided — the canonical rule (R12.2) supplies the verb; the workflow
supplies content (commit message body in `text` codeblock; push args inline prose).
Destructive-flag invocations stay literal — they route raw deterministically and are NOT
class-tagged.

**R13 — Live empirical verification.**
Discrete deliverable absorbing WU1's deferred success criteria 5/6 (`arc release commit --version`
runs no-prompt under installed allowlist; env-prefix fall-through prompts in Codex).

**Mechanism.** Maintainer runs the verification live on their machine at WU completion;
observations captured in WU completion notes. No automated test fixture, no `__tests__/` test
surface. Rationale: once-and-done per WU lifecycle; harness-prompt observation requires interactive
agent behavior that doesn't fit existing test tier conventions cleanly, and the cost of building
automation for a single maintainer-eyes-on test exceeds the value at this cadence.

Methodology:

- **Project-scoped mode override.** Fresh scratch repo with `permissions.defaultMode: "default"`
  written to project-scoped `.claude/settings.json` (Claude Code's permission resolution prefers
  project scope; project setting overrides user-scoped bypassPermissions for the verification
  session) or Codex equivalent project-scoped policy override. Avoids cross-machine requirement.
- **Behavioral observation.** `arc release commit --version` / `arc release push --version`
  invocations against the project-scoped default-mode harness, observing prompt presence vs.
  absence with allowlist installed vs. not.
- **Codex matcher boundary re-verification.** Re-verify against then-current codex-cli at WU2
  verification (last verified at codex-cli 0.128.0, 2026-05-07). Confirm: `bash -lc` / `zsh -lc`
  unwrapping still occurs; `prefix_rule()` patterns still match the canonical wrapper invocation
  shape.
- **User-level safety-gate hooks** (`~/.claude/hooks/safety-gate.sh`, Codex equivalent) remain
  active across mode flips. Verification focuses on harness-prompt presence, not safety-gate
  denials — the two layers compose without conflict.

**R14 — Documentation.**

- **R14.1 — New strategy doc:** `strategy-interlock-release-wrappers.md` under
  `.arc/reference/strategies/arc/`. Trust model framed across modes (lead with unconditional layer
  as universal benefit; position harness-prompt bypass as additional benefit for default-prompt
  users; name bypass mode explicitly). When-to-use / when-not-to-use guidance per mode.
  Reference-implementation per-harness setup notes (Claude Code, Codex CLI). Agent-adaptive path
  documented as universal route. Acknowledges user-level safety-gate hooks as parallel,
  complementary layer.
- **R14.2 — Cross-reference update:** `strategy-configurability-architecture.md` adds reference to
  the new domain strategy. Interlock release wrappers are a configurability surface
  (`arc.releaseOptedIn` × interlock values × wrapper routing); the architecture-level strategy doc
  cross-references the domain-level strategy.
- **R14.3 — Cross-reference update:** `strategy-session-operations.md` updates for the
  harness/mode marker (R9) as a per-developer per-machine state surface. Note R11's deferral of
  routing-shift orientation surfacing to `plan-handoff-optimization.md` so the strategy doc
  carries the cross-WU reference for future readers.
- **R14.4 — Cross-reference update:** `strategy-team-coordination.md` adds a small note for
  per-developer asymmetric setup acknowledgment (multi-developer repos where setup state diverges
  per developer; document as expected, parallel to existing per-developer interlock-setting
  variation).
- **R14.5 — Cross-reference update:** `strategy-workflow-authoring.md` adds workflow-author
  guidance for the routing-class declaration shape — when to class-tag a fire site, the
  verb-elision pattern (commit message body in `text` codeblock; push args inline prose), the
  destructive-flag exclusion, and the canonical-rule reference. Forward-compat for new workflows
  added after WU2 ships.

**R15 — `cli.ts` description-string accuracy sweep.**
Foundation tech-debt cleared during ergonomics work. Sweep release-subcommand description strings in
`packages/arc-framework/src/cli.ts:226+` for stale `arc.arc.releaseOptedIn` references; replace with
`arc.releaseOptedIn` — the per-developer git-config key carrying the opt-in flag. No code-flow
change; doc-comment and Commander `.description()` text only. Aligns code-side documentation with
the per-developer-only storage shape.

### P1 — should-have

**R16 — `--json` mode for `arc release setup install` / `uninstall`.**
Structured envelope output for CI / scripting consumers. `schemaVersion: 1` envelope with discrete
fields for: detected harnesses, modes, install/uninstall results per harness, opt-in state post-
operation, exit code. Default human-readable mode unchanged.

**R17 — `arc release setup print-patterns --format=raw`.**
Emit only the canonical patterns (no harness-format wrapping, no commentary). Convenience for
consumers wanting the bare allowlist patterns to feed into their own tooling. Reference-implementation
default remains harness-formatted.

### P2 — nice-to-have

**R18 — ADR-017 amendment (Tier 2, dated annotation).**
Optional. Dated annotation in ADR-017's Consequences capturing the harness-mode dimension surfaced
during WU1 Phase 7 verification, now formalized in WU2's mode-aware setup. Lands as Tier 2 amendment
per the ADR methodology — no decision change, no supersession; expanded operational rationale.
Lands only if WU2 integration surfaces broader insights worth bundling.

## Non-Goals

- **WU1 functionality.** Wrappers, validation library, audit log, ADR-017/018 — already shipped.
  WU2 builds on this foundation; doesn't re-implement.
- **opencode auto-allowlist convenience helper.** Documented limitations
  ([sst/opencode#6676](https://github.com/sst/opencode/issues/6676),
  [sst/opencode#15507](https://github.com/sst/opencode/issues/15507)) carry forward. Opencode
  adopters use the agent-adaptive path with the workflow surfacing known caveats explicitly.
  Convenience-helper formatter for opencode lands when upstream resolves; the agent-adaptive path
  is available immediately at WU2 ship.
- **Auto-enable in any harness by default.** Setup is always opt-in. No initial-setup flow that
  silently records state without explicit user choice; deferral and never-enable paths are
  first-class and don't degrade the experience.
- **Setup-event audit-log entries.** Setup operations sit outside the v1 audit-log scope (which
  covers `release-commit` / `release-push` / `sync` per WU1). Setup is low-volume (lifetime ~2
  entries per developer per machine); persistent state (git-config flag, marker file, allowlist
  entries) is the audit trail. Revisit at v2 if real adopter need surfaces.
- **Cross-machine portability of the harness/mode marker.** Marker is per-developer per-machine by
  design (matches per-machine allowlist install reality). New clones on other machines correctly
  show "not set up here" until the developer re-runs setup; that's the right behavior, not a
  portability gap.
- **Per-harness gating in workflow integration.** `arc.releaseOptedIn === true` is the gate for
  preferring the wrapper. Per-harness verification status (from the marker) does not gate routing
  decisions — the wrapper still works mechanically without allowlist install (validation + audit
  layer fires); it just doesn't bypass the harness prompt for unverified harnesses, which is the
  correct safety behavior. Per-harness state is for posture reporting (R10), not routing.
- **CLI-mechanical `verify`-gates-`opt-in` safety property.** Inherited from parent plan; rejected.
  Workflow-mediated verify (agent-reported success + behavioral test under default-prompt + user
  confirmation) is the safety property. CLI `verify` (R7) is a complement, not a gate. This is a
  deliberate posture shift; see plan § Approach · Critical safety property (revised).

## Technical Considerations

### Workflow-as-contract architecture

ARC publishes the contract surface (six elements per R1); the resident agent translates into its
harness's idioms. This is the load-bearing architectural choice: it scales with the harness ecosystem
without requiring per-harness CLI plugins, JSON-merge logic, Starlark managed-block edits, or
equivalent format-write code. Reference implementations (Claude Code, Codex CLI) are convenience
helpers on top of the universal workflow path.

Trade-off: verify model shifts from CLI-mechanical to workflow-mediated agent-report + user
confirmation. CLI-side mechanical verify would have required harness-specific config-inspection logic
ARC would have to maintain per harness. The workflow-mediated property accepts agent self-report —
consistent with co-development trust elsewhere in ARC, and the foundation for harness-agnostic
scaling.

### Quality gradient

Reference-implementation adopters get a polished, scripted experience (helper tooling: native pattern
formatters, documented mode-detection patterns, behavioral-test integration). Agent-adaptive
adopters get a more bring-your-own-knowledge experience. Acceptable for a strictly-opt-in feature;
the gradient is named explicitly in the strategy doc and setup workflow rather than treated as a
uniform experience.

### Marker storage choice

Sidecar JSON over git-config for the harness/mode marker (R9). Matches WU1's audit-log precedent;
schema evolution is free; git-config stays focused on scalars (`arc.releaseOptedIn` and the existing
WU1 surface). Multi-harness ergonomics are clean (one fs read + JSON parse vs. multiple git-config
queries with normalized name lookups).

### ADR-018 authorization rule integration

Workflow integration (R12) operationalizes ADR-018's scope-coverage rule via a structured routing
surface, not per-workflow prose dispatch. The CLI handler computes the resolution once at session-
init (R12.1); the canonical rule (R12.2) lives in DEV-RULES.ARC § Commit Discipline →
Workflow class-tag routing as the single source of truth; the arc-commit skill (R12.3) and
per-workflow class tags
(R12.4–R12.9) consult the resolved value.

Three motivations for the structured shape over the alternative of per-workflow conditional prose:

- **DRY-ness.** The authorization table lives once (in the handler, mirrored in DEV-RULES);
  workflows tag the class but never re-derive the rule. Adding a new authorized configuration
  requires only handler + DEV-RULES edits — workflow files untouched.
- **Forward-compat with plan-instruction-optimization.** That WU's Pillar 3 thesis —
  "deterministic state belongs in the envelope; judgment stays in the workflow" — directly applies
  here. Routing-resolution is deterministic; pre-computing it in the envelope follows the
  established pattern (`recommendedAction`, `recommendedCombinedPrompt`) rather than propagating
  prose-dispatch into 10 fire sites another WU would then compress.
- **Literal-anchor risk elimination.** Late-session attention drift biases agents toward neighbor
  literals over prior-paragraph rules. Verb-elided fire sites (commit message body in `text`
  codeblock; push args inline prose) have no `git commit` / `git push` literal to inadvertently
  copy when the routing rule directs the wrapper.

### Storage layout consistency

`.arc/user/{identity}/.internal/` already houses the audit log; this PRD adds `release-setup.json` to
the same directory. Per-developer, per-machine, gitignored. Matches the v1 storage envelope WU1
established.

### Agent edit fidelity per harness

The workflow-mediated verify property catches edit-fidelity failures (subtle JSON / Starlark syntax
errors that pass agent self-read) via the behavioral test under default-prompt mode. The combination
of (agent-reported success + behavioral test + user confirmation) is the integrity surface; no
additional CLI-side fidelity check is required.

### Initial-setup integration placement

The R2 integration lands as a lightweight section within the existing `01_verify-and-configure.md`,
not as a new numbered workflow file. Rationale: DRY — the supplemental workflow (R1) carries the
setup logic; the initial-setup integration is a surfacer + pointer, which warrants section-level
weight, not file-level. Placement: Path 1 (Fresh Install) between "Customization Beyond Config" and
"Optional: Verify Installation"; Path 2 (Join Existing) between "Configuration Review" and "Optional:
Verify Installation". Skipping the section (defer or never) doesn't break onboarding completion —
release-wrapper setup is informational, not gating.

### Cross-mode testing strategy

R13's project-scoped mode-override strategy avoids the cross-machine problem (a single-machine
maintainer with global bypassPermissions can run the empirical test against a project-scoped
default-mode override). Project-scoped permission settings supersede user-scoped settings in the
relevant harnesses; tests verify that property holds for the scope of the test harness.

## Success Criteria

### Behavioral

- `arc release setup install` runs end-to-end against Claude Code reference implementation (default-
  prompt mode), records opt-in + marker entry, behavioral test passes (no harness prompt observed
  for `arc release commit --version`).
- `arc release setup install` runs end-to-end against Codex CLI reference implementation (default-
  prompt mode), with the same outcome.
- `arc release setup install` runs end-to-end under bypass mode against Claude Code: records opt-in,
  writes marker entry, skips allowlist write with explanation, surfaces audit-only trust framing.
- Multi-harness install with simulated failure surfaces user-choice prompt (record partial / retry /
  abort); `arc release setup install` does not auto-record opt-in without explicit user acceptance
  of partial coverage.
- `arc release setup install` against an existing opt-in surfaces the four-way idempotency choice
  (re-verify / update markers / add harness / exit).
- `arc release setup uninstall` symmetric path: removes harness-side entries (matched by canonical
  pattern set), removes marker entry, records opt-out.
- Workflow-integration changes route through the wrapper for task-work commits when
  `arc.commitInterlock ∈ {on-task-approval, on-workflow}` and `arc.releaseOptedIn === true`; route
  through raw git otherwise. Verified across the R12.1–R12.5 workflows.

### Empirical (deferred from WU1 criteria 5/6)

- Project-scoped mode override produces a default-prompt harness session on a maintainer machine
  with global bypassPermissions enabled; behavioral test (`arc release commit --version`) observed
  no-prompt under installed allowlist; with allowlist removed, harness-prompt fires.
- Codex matcher boundary re-verified against then-current codex-cli at WU2 verification:
  `bash -lc` / `zsh -lc` unwrapping still occurs; `prefix_rule()` patterns still match canonical
  wrapper invocation shape; env-prefix / command-substitution / `$'...'` quoted invocations still
  fall through to harness prompt.

### Forensic

- `arc release status` accurately surfaces engaged posture across both modes — opt-in flag, harness
  list with modes, active value layers per mode.
- Marker file is durable across sessions (subsequent `arc release status` reads the persisted file
  correctly).

### Code quality

- Tier 1 quality gates pass: markdown lint zero violations, TypeScript lint zero violations, shell
  lint zero violations, typecheck zero errors, vitest unit/integration/e2e all pass, tsup build
  succeeds.
- Tier 2 quality gates pass at WU completion checkpoint per quality-gates strategy.
- Tier 3 pre-PR gates pass before merge.
- New code in `packages/arc-framework/src/handlers/release/setup/` (or equivalent placement
  determined at task generation) follows existing handler conventions: typed deps injection,
  testable spawn-stubs for git operations, structured outcome types.

## Open Questions

### Resolve before starting

None. All load-bearing design decisions are settled in the plan iteration that fed this PRD.

### Resolve during work

- **Agent edit fidelity per harness.** Reference-implementation harnesses (Claude Code Edit on
  strict JSON; Codex Edit on Starlark) and agent-adaptive harnesses both depend on agent edit
  precision. Empirical question per harness, validated at task-time via the behavioral-test surface
  (R13). Workflow-mediated verify catches incorrect writes regardless of harness; setup loops back
  to remediation rather than recording opt-in.
- **`arc release setup uninstall` cleanup robustness when user has hand-edited helper-written
  entries** (or, under agent-adaptive path, when the agent translates cleanup against its earlier
  translation). Mitigation: cleanup matches by exact pattern set; doesn't touch user-curated
  entries; if patterns drift from canonical, cleanup is conservative (refuse + prompt manual
  cleanup). Specific cleanup-fallback behavior validated at task-time.
- **opencode resolution timeline** for [sst/opencode#6676] and [sst/opencode#15507]. When upstream
  lands, opencode graduates from agent-adaptive-with-caveats to reference-implementation in a
  follow-up. Not blocking WU2 ship.
- **Codex matcher empirical re-verification cadence.** Re-run against the then-current codex-cli at
  WU2 verification (R13's empirical surface). Specific codex-cli version pinned at task-time.
- **Mode-detection coverage for unknown harnesses.** Reference-implementation harnesses get
  documented mode-detection patterns in the workflow; agent-adaptive harnesses rely on the agent's
  own knowledge or fall through to user-direct (R3 tier 3). Misdetection at install time is a risk
  the user-confirmation step in the workflow mitigates.
- **Section title and exact wording for R2's lightweight integration.** Placement is concrete (Paths
  1 and 2 of `01_verify-and-configure.md` at the slots specified in R2). Section title (e.g.,
  "Optional: Interlock Release Wrapper Setup" vs. "Optional: Engage Release Wrappers") and the
  brief-description prose are determined at task-generation time when the actual workflow edit
  lands.

---

[sst/opencode#6676]: https://github.com/sst/opencode/issues/6676
[sst/opencode#15507]: https://github.com/sst/opencode/issues/15507
