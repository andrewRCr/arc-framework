# Plan: Release Wrappers — Adopter Ergonomics

## Problem / Motivation

WU1 (`prd-release-wrappers-foundation.md`, archived at
`.arc/reference/archive/2026-q2/technical/08_release-wrappers-foundation/`) shipped the mechanical foundation
for **interlock release wrappers** — `arc release commit` and `arc release push`, which wrap `git commit` /
`git push` at the CLI boundary and enforce ARC interlock state (commit-interlock, push-interlock; ADR-018)
before invoking git. They work end-to-end for hand-configured adopters.

Throughout this plan, "interlock release wrappers" is the precise term; "release wrappers" / "the wrapper" is
shorthand once context is established. Adopter-facing surfaces (workflow doc, strategy doc, status output,
error messages) should lead with the longer form on first mention so newcomers get a working definition
without prerequisite ARC vocabulary.

Hand-configuration today means manually editing harness permission files (`.claude/settings.json`,
`~/.codex/policy/...`) and running `arc release opt-in` to record the per-developer state
(`arc.releaseEnabled` git-config flag; the yaml-side override key is `release.enabled`).

This works for the friction-tolerant minority. Adopters who would benefit from the wrapper need a guided
setup — but "guided setup" doesn't have a single shape, because adopters arrive in two distinct postures:

- **Default-prompt mode** (the cross-harness baseline). Harness gates every Bash invocation; allowlist
  install removes the per-invocation re-prompt for wrapper invocations. Both wrapper value layers per
  ADR-017 materialize: validation + audit (unconditional) and harness-prompt bypass (conditional on
  allowlist install).
- **Bypass mode** (`bypassPermissions`, dangerous mode, equivalents — typically paired with denylist
  safety-gate hooks at the OS boundary). Harness allows every Bash invocation without prompting; allowlist
  install is a no-op since there's no harness prompt to skip. The unconditional layer (validation + audit)
  is the value prop; opt-in records explicit acceptance of wrapper validation as the canonical
  authorization signal for matching invocations.

The deliverable shape differs by mode, which means WU2's setup story is two stories: install-and-verify
under default-prompt, detect-and-record-with-reframing under bypass. Both share a workflow doc, status
surface, and documentation framing — mode-aware throughout. Treating bypass as a sub-case of default-prompt
underdelivers on the bypass-mode adopter experience, which is plausibly common among power users running
long autonomous sessions.

The four enabling capabilities adopters need, mode-conditioned where relevant:

1. Guided setup that explains the trust-model trade-off (default-prompt) or audit-only-opt-in framing
   (bypass), detects harness identity and mode, helps install allowlist entries where applicable, and
   verifies the result.
2. Visible posture state — `arc release status` and session-init orientation surface "release-wrapper
   engaged — ARC sole authorization layer" (default-prompt with allowlist active) or "release-wrapper
   engaged — validation + audit layer only" (bypass mode) when detected.
3. Workflow integration that prefers the release wrapper over raw git when opt-in is recorded **and** the
   resolved interlock authorizes the workflow's invocation scope per ADR-018's scope-coverage rule (see
   § Scope · Workflow integration).
4. Documentation that walks per-mode setup, the "when not to use this" guidance across modes, and the
   strategy framing.

This work delivers the ergonomic surface across both adopter postures — what makes WU1's mechanism
approachable for the typical adopter regardless of harness permission posture.

**Why now:** WU1 has landed (PR #30, merged 2026-05-09). Adopters can hand-configure but the rough edges
show immediately. WU2 should follow within the same release window so the release-wrapper system ships as
a coherent capability rather than a primitive-with-promised-ergonomics.

## Approach: Harness-Agnostic Workflow-as-Contract

The earlier framing of "fully deterministic per-harness CLI plugins" — JSON merge for Claude Code, Starlark
managed-block edits for Codex, equivalent per-harness write logic — was considered and rejected (parent
plan): format gulf severity, trust-tier mismatch (setup is one-time, error-recoverable, judgment-driven;
wrapper enforcement is per-invocation, error-irrecoverable, mechanical), adopter reality (most adopters
reach setup during an agent session), poor scaling with the harness ecosystem.

A follow-up middle-ground (CLI primitives + workflow markdown) works but treats per-harness formatters as
deliverables rather than convenience helpers. That absorbs scope which scales poorly: every new harness
adds a TypeScript handler, test surface, and release. The harness-agnostic framing inverts the priority.

**The workflow doc is the contract carrier.** ARC publishes a contract surface — what the harness must
satisfy for the wrapper's conditional layer to engage. Six elements:

1. Canonical command shape — `arc release commit` and `arc release push`.
2. Match semantics — prefix-match (so `arc release commit -m "..."` matches the same allowlist entry).
3. Scope — typically per-user; harness-dependent.
4. Mode awareness — detect bypass-equivalent modes; install becomes a no-op there.
5. Side effect — wrapper invocations skip per-invocation prompt; all other git invocations unchanged.
6. Verification — agent-reported install success, with optional behavioral test under default-prompt mode.

**The resident agent translates the contract into its harness's idioms.** Agents know their own harness's
permission system, edit its config files, and verify reads — workflow-as-contract leverages that. ARC
publishes the contract; the agent applies it.

**Reference implementations** (Claude Code, Codex CLI) ship as polished, scripted experiences with helper
tooling. Setup paths for these harnesses are empirically verified. Per-harness pattern formatters
(`arc release setup print-patterns --harness claude-code` emits ready-to-paste JSON; `--harness codex`
emits Starlark) are convenience helpers — not the primary mechanism.

**Other harnesses follow the agent-adaptive path** on the same workflow. opencode (with documented upstream
limitations), Cursor agents, JetBrains AI, custom-rolled setups all have a path: read the contract, apply
translation per the harness's own conventions, install, verify, report. The workflow's verify step accepts
the agent's report; ARC's CLI side runs no harness-specific config-inspection.

### CLI surface

Small, contract-aligned. The CLI's value is highest where errors are silent and consequential — runtime
enforcement (WU1) — not setup. The setup-side CLI primitives are convenience and orchestration:

All four are sub-subcommands of `arc release setup` (consistent shape; no flag-vs-subcommand mix):

- `arc release setup install` — orchestration porcelain (full guided flow). Drives the workflow, captures
  user trust acknowledgment, writes the harness/mode marker (sidecar JSON; see § Marker storage), and
  records `arc.releaseEnabled` opt-in via WU1's `arc release opt-in` primitive.
- `arc release setup uninstall` — symmetric removal. Drives the rollback workflow, removes the marker
  entry, records opt-out.
- `arc release setup print-patterns [--harness <name>]` — canonical text emitter. Reference-implementation
  harnesses (`claude-code`, `codex`) get native format. Unknown / abstract: emit the six contract elements
  as a translation prompt the agent reads and applies. (No separate `arc release setup status` command —
  posture-reporting concerns extend WU1's `arc release status`; see § Status integration.)
- `arc release setup verify [--harness <name>]` — confirms `arc.releaseEnabled` recorded; under
  default-prompt mode, optionally runs a behavioral test (test invocation observed for prompt presence).
  Does **not** gate opt-in on its own — the workflow does, via agent-report + user confirmation.

Mixed invocation flow: `setup install` orchestrates and calls `opt-in` internally; users skipping the
workflow run `print-patterns` → hand-edit → `opt-in` separately. Each primitive does one thing; the
porcelain composes them.

(`arc release opt-in` / `opt-out` / `status` shipped in WU1 as state-recording primitives.)

### Workflow surface

Setup workflow doc at `.arc/system/workflows/arc/supplemental/setup-release-wrapper.md` (matches the
`add-agent.md` supplemental-workflow precedent; verb-first naming follows existing convention; "interlock"
omitted from the filename for brevity but foregrounded in the workflow body's framing). Carries the
contract-as-documentation.

**Two entry points, one workflow:**

- **Standalone invocation** — `arc release setup install` runs the workflow at any time. The default path
  for adopters who deferred at onboarding or are post-init.
- **Initial-setup integration** — a step in the existing `.arc/system/workflows/arc/initial-setup/`
  sequence surfaces release-wrapper setup explicitly: agent describes what interlock release wrappers are,
  what installation does, and offers a three-way choice — set up now (invoke supplemental workflow), defer
  (note recorded that the feature exists; user can run standalone any time), or never (no record;
  standalone invocation remains available regardless). Strictly informational, not gatekeeping.

Walks the agent through:

- **Mode detection — three-tier ladder by agent confidence:**
    1. *Agent knows* — workflow surfaces "I detected mode X for harness Y because [config inspection /
       known-harness pattern]". Proceed.
    2. *Agent uncertain but can investigate* — workflow surfaces uncertainty: "I don't know harness Y's
       mode-config conventions off the top. Want me to check its docs, inspect a likely config path, or
       ask you directly?" User chooses.
    3. *Agent doesn't know and can't readily investigate* (or user prefers direct) — workflow asks user:
       "Does your harness gate every Bash invocation by default? (default-prompt) Or does it allow
       without asking? (bypass)" Records the answer in the marker the same way as agent-detected.

  Reference-implementation harnesses (Claude Code, Codex CLI) get tier-1 documented patterns in the
  workflow body; agent-adaptive harnesses fall through the ladder per agent confidence.

- **Trust-model acknowledgment, mode-conditioned.**
    - Default-prompt: trust-shift framing — user explicitly accepts that the harness gate is bypassed for
      wrapper invocations; ARC interlock becomes the canonical authorization layer.
    - Bypass: audit-only framing — user explicitly accepts opt-in to wrapper validation + audit as a
      layered protection above their existing safety-hook posture.
- **Per-mode branch.**
    - Default-prompt → install allowlist patterns. Agent translates the contract to its harness's format,
      referencing `print-patterns` for known harnesses.
    - Bypass → skip allowlist write with explanation; harness/mode marker recorded for status surface and
      future mode-change awareness.
- **Verification.** Agent reports install success (file written, re-read, entry present); behavioral test
  optionally runs under default-prompt mode where matcher observation is meaningful.
- **User confirmation.** User reviews the agent's report and explicitly approves before opt-in records.
- **State recording.** `arc release setup install` writes `arc.releaseEnabled` (per-developer git-config
  flag, WU1 primitive) plus the harness/mode marker entry (sidecar JSON; see § Marker storage).
- **Rollback.** `arc release setup uninstall` — agent removes its harness-side entries; marker entry
  removed; opt-out recorded.

### Marker storage

Harness/mode markers persist in a sidecar JSON file at
`.arc/user/{identity}/.internal/release-setup.json`. Matches WU1's audit-log precedent (same
private-state directory; per-developer, per-machine, gitignored).

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

Sidecar JSON over git-config:

- **Schema evolution is free.** The `schemaVersion` field allows forward additions like `contractVersion`,
  `allowlistVerifiedAt`, or per-harness install attribution per harness without git-config schema dance.
- **Git-config stays focused on scalars.** WU1's git-config surface (`arc.releaseEnabled`,
  `arc.commitInterlock`, etc.) is uniformly scalar — section.key = value. Structured per-harness data
  doesn't fit that idiom.
- **Multi-harness ergonomics are clean.** One fs read + JSON parse vs. multiple git-config queries with
  normalized name lookups (and the camelCase / subsection awkwardness git-config inherits).
- **Free-form harness names.** Agent-adaptive harnesses can use whatever name the agent and user agreed on
  at install time — no git-config naming-convention friction.

`arc release status` reads the marker; setup workflow writes it as the final state-recording step
alongside `arc.releaseEnabled`. Uninstall removes the harness entry; if `harnesses` becomes empty, the
file remains as `{ "schemaVersion": 1, "harnesses": [] }` (clean-slate signal without removing the
schema-version anchor).

### Critical safety property (revised)

Opt-in is gated on the **workflow's** verify step, which combines (a) agent-reported install success and
(b) explicit user confirmation. The CLI's `verify` primitive is a complement — confirms `arc.releaseEnabled`
is recorded post-flow — not a gate that holds the line on its own.

This is a deliberate posture shift from the parent plan's "CLI-mechanical verify gates opt-in". The earlier
property was tighter but required harness-specific config-inspection logic ARC would have to maintain per
harness — which the harness-agnostic framing rejects. The workflow-mediated property accepts agent
self-report — consistent with co-development trust elsewhere in ARC, and the foundation for harness-
agnostic scaling. A failed or incomplete edit cannot accidentally record opt-in because the workflow
requires explicit user confirmation before invoking `install`.

## Scope

### In scope

**Setup workflow (primary deliverable).** Markdown workflow at
`.arc/system/workflows/arc/supplemental/setup-release-wrapper.md`. Drives the agent through
contract-aligned setup, mode-aware throughout. Carries the six contract elements, the three-tier
mode-detection ladder, per-harness reference notes (Claude Code, Codex CLI as polished examples;
agent-adaptive path for others), the mode-conditioned acknowledgment script, and the verify protocol.

**Initial-setup integration.** New step in `.arc/system/workflows/arc/initial-setup/` sequence surfaces
release-wrapper setup at onboarding. Agent describes what interlock release wrappers are, what
installation does, and offers a three-way user choice (set up now → invoke supplemental workflow; defer
→ note that the feature exists; never → no record, standalone invocation still available). Strictly
informational; doesn't gatekeep onboarding completion. Matches initial-setup's existing collaborative
tone.

**Setup CLI primitives (helper surface).** Sub-subcommands under `arc release setup`:

- `install` — orchestration porcelain (full guided flow). Drives the workflow, captures trust
  acknowledgment, writes harness/mode marker entry, records `arc.releaseEnabled` opt-in via WU1's
  `arc release opt-in` primitive.
- `uninstall` — symmetric removal: drives rollback workflow, removes marker entry, records opt-out.
- `print-patterns [--harness <name>]` — canonical text emitter.
    - Reference-implementation harnesses (`claude-code`, `codex`): native format (JSON, Starlark).
    - Unknown / abstract: emit the contract elements as a translation prompt.
- `verify [--harness <name>]` — confirms `arc.releaseEnabled` recorded; optional behavioral test under
  default-prompt mode. Does not gate opt-in on its own — workflow-mediated verify holds the safety
  property (see § Approach · Critical safety property).

**Workflow integration.** Updates to `process-task-loop.md`, `session-handoff.md`, and ceremony workflows
(`activate-work-unit.md`, `activate-planning-branch.md`, recovery flows). Per ADR-018, agent prefers
`arc release commit` / `arc release push` over raw git when **both** of these hold:

1. `release.enabled === true` (resolved at session-init via the WU1 envelope expansion under
   `config.value.settings["release.enabled"]`).
2. The resolved interlock value authorizes the wrapper for this invocation context per scope-coverage:
    - **Task-work commits:** `commit_interlock ∈ {on-task-approval, on-workflow}` authorizes.
    - **Ceremony commits** (handoff / activate / integrate / sweep / planning-lifecycle):
      `commit_interlock === on-workflow` authorizes; otherwise raw `git commit` (harness-prompt path).
    - **Ceremony pushes:** `push_interlock === on-workflow` authorizes.

Workflow-author guidance: each workflow names the commit / push class it fires (task-work vs. ceremony) and
branches at workflow-author time on the resolved interlock × `release.enabled` from the session-init
envelope. Same model as `commit_interlock` resolution today, extended to include the wrapper-routing
decision.

`arc sync` continues to handle its own internal push (single-leg sync push); WU1's audit retrofit captures
sync invocations on the audit umbrella. No internal re-routing through `arc release push`.

**Status integration.** Extend WU1's `arc release status` — single source of release posture:

- Existing fields (WU1): opt-in flag, three interlock values (commit / push / sync) with provenance.
- New field: detected harness identity/mode markers, read from the sidecar JSON at
  `.arc/user/{identity}/.internal/release-setup.json` (recorded by the setup workflow at install time;
  supports free-form harness names to accommodate unknown harnesses on the agent-adaptive path). See
  § Approach · Marker storage.
- New field: active value layers per mode — "validation + audit + harness-prompt bypass" for default-prompt
  with allowlist active; "validation + audit" for bypass mode.
- Session-init orientation includes a one-line note when release-wrapper is engaged, mode-aware text.

**Design decision (resolved at refresh):** no separate `arc release setup status` command. WU1's
`arc release status` is the single source; setup workflow records harness/mode posture into git-config
markers it reads.

**Empirical-test surface.** Discrete deliverable absorbing foundation's deferred success criteria 5/6
(`arc release commit --version` runs no-prompt under installed allowlist; env-prefix fall-through prompts
in Codex). These couldn't run meaningfully against the WU1 maintainer's `bypassPermissions` Claude Code
session. Test methodology:

- **Project-scoped mode override.** Fresh test repo with `permissions.defaultMode: "default"` written to
  project-scoped `.claude/settings.json` (Claude Code's permission resolution prefers project scope) or
  Codex equivalent project policy override. Avoids cross-machine requirement; same machine can carry the
  test surface alongside its global bypass-mode posture.
- **Behavioral observation.** `arc release commit --version` / `arc release push --version` invocations
  against the project-scoped default-mode harness, observing prompt presence vs. absence with allowlist
  installed vs. not.
- **Codex matcher boundary re-verification** against then-current codex-cli at WU2 verification (see
  § Reference Implementations and Agent-Adaptive Path).
- User-level safety-gate hooks (`~/.claude/hooks/safety-gate.sh`, Codex equivalent) remain active across
  mode flips — that's expected and parallel to matcher observation; tests focus on harness-prompt
  presence, not safety-gate denials.

**`cli.ts` description-string accuracy.** Sweep release-subcommand description strings (`packages/arc-
framework/src/cli.ts:226+`) for `arc.release.enabled` references; replace with `arc.releaseEnabled` (per-
developer git-config key) or `release.enabled` (yaml key) per context. Foundation tech-debt cleared during
ergonomics work where the same surface is touched.

**Documentation.**

- New strategy doc (`strategy-interlock-release-wrappers.md` or similar). Trust model, mode-conditioned
  framing throughout (lead with unconditional layer as universal benefit; position harness-prompt bypass as
  additional benefit for default-prompt users), when to use, when not to use, per-harness reference notes,
  troubleshooting.
- Reference-implementation per-harness setup notes (Claude Code, Codex CLI) — polished, prescriptive.
- Agent-adaptive path documented as the universal route; reference implementations are examples, not
  gatekeepers.

### Out of scope

- **WU1 functionality.** Wrappers, validation library, audit log, ADR-017/018 — already shipped.
- **opencode auto-allowlist convenience helper.** Documented limitations ([sst/opencode#6676],
  [sst/opencode#15507]) carry forward; opencode adopters use the agent-adaptive path with the workflow
  surfacing known caveats. Convenience-helper formatter for opencode lands when upstream resolves; the
  agent-adaptive path is available immediately.
- **Auto-enable in any harness by default.** Setup is always opt-in.
- **Setup-event audit-log entries.** See § Audit-Log Boundary.

## Trust Model Trade-Off

Inherited from the parent plan; carried forward intact. The trade-off itself doesn't change with the WU
split — WU1 makes the release wrapper *available*; WU2 makes it *engaged*. The trade-off lands at
engagement.

Today's protective layering for git mutating operations:

1. ARC workflow (agent follows interlock-respecting protocol).
2. Harness gate (catches operations regardless of whether ARC authorized them).
3. User approval at the harness prompt.

After release wrapper + allowlist (when adopter opts in via WU2 setup, default-prompt mode):

1. ARC workflow (unchanged).
2. Release-wrapper enforcement (refuses on invalid interlock state, missing WU, destructive flags).
3. *(Harness gate bypassed for release-wrapper invocations only.)*
4. User approval at ARC interlock layer (where the trust decision is meaningful).

**This is a per-user policy decision; ARC must not make it silently.** The setup workflow's mandatory
trust-model acknowledgment is what holds this line in WU2.

This framing assumes a default-prompt harness; § Harness Permission Mode below deepens the implications
under bypass-mode harnesses, including setup-helper behavior, status surface, and documentation framing.

## Harness Permission Mode (Default-Prompt vs. Bypass)

§ Problem / Motivation introduces the dual-mode framing as the core deliverable shape. This section
deepens the implications.

### Mode definitions

**Default-prompt mode (cross-harness baseline).** Harness gates every Bash invocation; allowlist entries
skip the prompt for matching shapes. Default behavior across Claude Code, Codex CLI, opencode, etc. The
parent plan's "redundant friction" framing lands here: ARC interlock authorizes, harness prompt re-asks,
user re-confirms. The wrapper bypasses the re-prompt for documented invocation shapes; both wrapper value
layers (per ADR-017) materialize.

**Bypass mode (`bypassPermissions`, dangerous mode, equivalents).** Harness allows every Bash invocation
without prompting. Adopters who run this way typically pair it with a user-level safety hook (denylist
approach — `~/.claude/hooks/safety-gate.sh` or Codex-equivalent) that catches known-dangerous shapes at the
OS boundary while letting routine work flow without per-invocation prompts. Encountered on this codebase's
maintainer machine during WU1 Phase 7 verification — the matcher-observation methodology assumes a
prompting-default harness, which bypass mode breaks. Plausibly common among power users running long
autonomous sessions; no distribution data, but not assumed rare.

### Value-prop differs by mode

The release wrapper has two value layers per ADR-017:

- **Unconditional layer (validation + audit).** Validates interlock state, refuses on destructive flags /
  branch-protection violations / pushability failures; appends a JSONL audit entry on every invocation.
  Fires regardless of `arc.releaseEnabled` or harness mode.
- **Conditional layer (harness-prompt bypass).** Allowlist entry causes the harness matcher to skip the
  per-invocation prompt for wrapper invocations. Requires a default-prompt harness with allowlist entries
  installed.

Default-prompt users get both layers. Bypass-mode users get only the unconditional layer — there was no
harness prompt to skip. The wrapper still adds substantial value (mechanical interlock validation no
denylist hook covers, forensic audit log no harness logging produces), but the value-prop reduces.
`arc.releaseEnabled = true` for bypass-mode users records explicit opt-in to the validation + audit layer
(and signals downstream workflow routing) without changing harness behavior.

### Setup workflow implications

`arc release setup install` recognizes the harness mode it's running under and adapts:

- **Default-prompt mode** (Claude Code with explicit `permissions.allow`, Codex with active `prefix_rule()`
  patterns). Full flow: detect harnesses → agent translates contract → install allowlist patterns → verify
  → opt-in.
- **Bypass mode** (`permissions.defaultMode: "bypassPermissions"` in Claude Code, Codex's analogous bypass
  config). Allowlist write becomes a no-op. Setup workflow:
    - Surfaces the detected mode explicitly: "Detected bypass-permissions mode in <harness>; allowlist
      write skipped — wrapper invocations already pass through without prompting."
    - Skips the allowlist write for that harness; harness/mode marker still recorded so future mode
      changes have an audit trail.
    - Still writes `arc.releaseEnabled = true` if the user opts in. Downstream workflow routing
      (preferring `arc release commit` over raw git per § Scope · Workflow integration) still benefits.
    - Adapts the trust-model acknowledgment text. Default-prompt version frames "you're removing the
      harness gate for these invocations"; bypass-mode version reframes to "you're opting in to wrapper
      validation + audit as layered protection above your existing safety-hook posture; ARC interlock
      becomes the canonical authorization signal for matching invocations."
- **Mixed mode** — multiple harnesses, different modes per harness. Per-harness handling. Plausible:
  bypass-mode Claude Code + default-prompt Codex on the same machine.

User-level safety-gate hooks (`~/.claude/hooks/safety-gate.sh`, Codex-equivalent) are out of the workflow's
detection scope. They run alongside whatever mode is set; their existence doesn't change harness gate
behavior. Strategy doc acknowledges them as a parallel, complementary layer — denylist at OS boundary,
wrapper validates ARC-state correctness at CLI boundary, the two compose without conflict.

### Status surface reports harness mode

`arc release status` (extended per § Scope · Status integration) reports detected harness identity / mode
alongside opt-in state. Adopters reading status see which value layers apply:

```text
Release wrapper opt-in: enabled (arc.releaseEnabled = true)
Detected harnesses:
  Claude Code (default-prompt) — allowlist active for arc release commit/push
  Codex CLI (default-prompt) — allowlist active for arc release commit/push
Active value layers: validation + audit + harness-prompt bypass
```

Under bypass:

```text
Release wrapper opt-in: enabled (arc.releaseEnabled = true)
Detected harnesses:
  Claude Code (bypassPermissions) — no harness gate to bypass
Active value layers: validation + audit
```

Mode detection is harness-specific. Reference implementations (Claude Code, Codex CLI) get documented
detection patterns in the workflow. Agent-adaptive harnesses rely on the agent's own knowledge of its
harness's mode-config conventions; the recorded marker captures whatever the agent and user agreed on at
install time.

### Documentation framing widens

Strategy doc and per-harness setup guides frame the value prop against both modes:

- Lead with the unconditional layer (validation + audit) as the universal benefit.
- Position the conditional layer (prompt bypass) as additional benefit for default-prompt users.
- Name bypass-mode explicitly; don't assume default-prompt as single adopter shape.
- Acknowledge user-level safety-gate hooks as a parallel layer that composes with wrapper validation, not
  replaces it.

The "when not to use this" guidance gains a bypass-mode note: bypass-mode users without
`arc.releaseEnabled` get the same harness behavior whether or not they invoke the wrapper, but they lose
the validation + audit layer's protections. There's no "validation off" justification under bypass mode the
way there might be under default-prompt (where the harness prompt itself is the user's review surface) —
the validation + audit layer is the primary value prop for bypass-mode adopters.

### Provenance

Surfaced during WU1 Phase 7 verification (2026-05-09) when the empirical test for success criteria #5 / #6
(`arc release commit --version` runs no-prompt under installed allowlist entries) couldn't run meaningfully
against the maintainer's `bypassPermissions` Claude Code session. Criteria marked `[~]` Superseded with
deviation note pointing here; ADR-017 amendment (Tier 2, dated annotation in Consequences) optional
post-WU2 if integration surfaces broader insights worth bundling. The WU2 § Empirical-Test Surface
deliverable absorbs the deferred verification.

## Audit-Log Boundary

The v1 audit log (WU1) covers `release-commit`, `release-push`, and `sync` — high-volume, episodic, state-
bearing operations where the audit entry is the only durable trace. **Setup operations sit outside this
scope at v1.**

Rationale. Setup is low-volume (lifetime ~2 entries per developer per machine — install + uninstall) and
its persistent artifacts are themselves the audit trail: the per-developer `arc.releaseEnabled` git-config
flag, the harness/mode marker file (`.arc/user/{identity}/.internal/release-setup.json`, including
per-harness `installedAt` timestamps), and the harness-side allowlist entries. "When did I install?" is
answerable from filesystem + `git config` history, not from a JSONL line.

Adding setup events at v1 would cross a schema-evolution boundary (new `command` discriminator value) for
forensic depth that's mostly already available through persistent state. Keep v1 lean; revisit at v2 if
real adopter need surfaces specific event-trace requirements that persistent state doesn't satisfy
(e.g., third-party audit consumers, multi-machine setup forensics, install-time-of-day correlation with
incidents).

This decision applies to `arc release setup install` / `uninstall` orchestration, allowlist write events,
and harness/mode-marker writes. The underlying state-recording primitives (`arc release opt-in` /
`opt-out`) likewise stay outside the audit log at v1; their persistent state is the trail.

## Adopter Friction Analysis

Wrong-setup scenarios stratified by severity:

**Low — self-correcting:**

- Adopter runs setup but skips verify → not gated; verify is mandatory in the workflow.
- Adopter forgets one harness in a multi-harness setup → `status` surfaces detected harnesses on
  subsequent runs.
- Bypass-mode adopter installs allowlist entries that are no-ops (allowlist write doesn't change behavior
  under `bypassPermissions`). Harmless; entries don't conflict with bypass mode. *Mitigation:* setup
  workflow detects mode and skips the write with explanation per § Harness Permission Mode.

**Medium — mitigable:**

- Adopter changes interlock setting later without realizing release-wrapper behavior shifts.
  *Mitigation:* surface release-wrapper posture in next session-init orientation when interlock setting
  changes.
- Multi-developer repo, asymmetric allowlist between developers. Not really wrong — different setup per-
  developer; document as expected.
- *Codex matcher grammar limits:* commits authored with command substitution, env-variable prefixes, or
  output redirection fall through to harness prompt despite the release-wrapper allowlist. Behavior is
  deterministic per input. *Mitigation:* setup workflow documents the supported grammar; agent-issued
  invocations follow it by convention.
- *Agent edit fidelity on permission files.* Reference-implementation agent (Claude Code on JSON, Codex on
  Starlark) botches a JSON merge or Starlark insertion; agent-adaptive path agent translates the contract
  incorrectly for an unknown harness. *Mitigation:* mandatory verify step (agent-reported install success,
  behavioral test where applicable, user confirmation) catches; setup loops back rather than recording
  opt-in state.
- *Bypass-mode adopter doesn't recognize the wrapper still adds value.* Default-prompt-framed messaging
  may read as irrelevant ("I don't see harness prompts anyway; why install a wrapper?"). *Mitigation:*
  setup workflow's bypass-mode branch surfaces the validation + audit value prop explicitly; strategy doc
  leads with the unconditional layer.

**High — requires deliberate design:**

- *Silent trust-model shift:* adopter accepts the trust-model acknowledgment without internalizing it.
  *Mitigations:* setup workflow requires explicit acknowledgment with verbose framing; opt-in state is
  recorded; session-init orientation surfaces "release-wrapper allowlist active — ARC sole authorization
  layer" when detected; status command surfaces same.
- *Release-wrapper or interlock bug lets bad op through:* no harness safety net under the release wrapper.
  *Mitigations* (WU1-shipped): release-wrapper enforcement as security-tier code with exhaustive matrix
  testing; audit log gives forensic recovery.
- *Personal scripts (bespoke gates):* setup workflow can't autoconfigure these. *Mitigation:* workflow
  prints canonical contract elements and instructs manual installation; agent-adaptive path applies.
- *opencode silent-config-validation bug:* typos in opencode permission keys are silently ignored
  ([sst/opencode#15507]). *Mitigation:* workflow surfaces the limitation when opencode is detected; full
  convenience-helper implementation deferred until upstream resolves.

**Reputational risk** (raised during planning): a commit/push-related feature that occasionally bypasses
safeguards in unexpected ways is exactly the kind of feature that erodes framework trust. Mitigations that
hold the line:

- Strictly opt-in. Never auto-enabled.
- Loud, not silent. Orientation surfaces release-wrapper-active state; refusals are verbose and explain
  remediation.
- Easy off switch. `arc release setup uninstall` rolls back; idempotent.
- Hold the scope line. Commit and push only — no slippery slope to higher-blast-radius ops.
- Documented "when not to use this." Tells users when to walk away.

## Reference Implementations and Agent-Adaptive Path

The release wrapper is harness-agnostic by contract (see § Approach). Adopters reach the wrapper via two
paths:

### Reference implementations

Empirically verified, polished setup experience, helper tooling shipped:

| Harness     | Status     | Helper tooling                                                                |
|-------------|------------|-------------------------------------------------------------------------------|
| Claude Code | Verified   | `arc release setup print-patterns --harness claude-code` (JSON snippet)       |
| Codex CLI   | Verified   | `arc release setup print-patterns --harness codex` (Starlark `prefix_rule()`) |

**Claude Code.** Pattern-based allowlist; `Bash(arc release commit:*)` matches distinctly from
`Bash(git commit:*)`. Setup workflow documents both default-prompt and `bypassPermissions` mode-detection
patterns.

**Codex CLI.** Starlark `prefix_rule()` with explicit list patterns. Unwraps `bash -lc` / `zsh -lc` shell
wrappings via `commands_for_exec_policy` before `prefix_rule` matching. Realistic invocation shape matches
reliably; verified empirically against codex-cli 0.128.0 (2026-05-07). Predictable fall-through to harness
prompt for env-prefixed, redirected, command-substituted, or `$'...'` quoted invocations. Setup workflow
documents the supported grammar. Re-verification at WU2 verification against then-current codex-cli (see
§ Empirical-Test Surface).

### Agent-adaptive path

Workflow-as-contract; agent translates against its own harness knowledge. No ARC-side per-harness logic;
ARC publishes the six contract elements and the workflow walks the agent through translation, install,
verify, and report.

- **opencode.** Workflow surfaces known upstream limitations: flag-parsing bug ([sst/opencode#6676]) may
  cause `arc release commit -m "..."` to not match patterns reliably; silent config-validation failure
  ([sst/opencode#15507]) means typos go unnoticed. Wrapper itself works (WU1); allowlist install via the
  agent-adaptive path with these caveats explicit. Convenience-helper formatter graduates opencode to a
  reference implementation when upstream resolves.
- **Cursor agents, JetBrains AI, custom-rolled setups, future harnesses.** Agent reads contract, applies
  translation per its harness's idioms, reports install success, runs available verification. No warranty;
  reference-implementation polish absent.

### Quality gradient

Reference-implementation adopters get a polished, scripted experience. Agent-adaptive adopters get a more
bring-your-own-knowledge experience. Acceptable for a strictly-opt-in feature; the gradient is named
explicitly in setup-workflow and documentation rather than treated as a uniform experience.

## Alternatives

**Setup-workflow invocation point** — resolved at refresh.

The parent plan carried three alternatives:

- A — Standalone porcelain only. Matches opt-in posture; hides existence at onboarding.
- B — Optional step in `arc init` / `arc join`. Lower friction; risks reflexive acceptance without
  internalized trust trade-off; conflates discoverability with default-on.
- C — Hybrid: standalone porcelain + one-time prompt at first session-init after `arc join`.

**Resolution:** dual-entry-point architecture (effectively option D, strictly better than A/B/C):

- Supplemental workflow (`.arc/system/workflows/arc/supplemental/setup-release-wrapper.md`) invokable
  standalone any time via `arc release setup install`. Matches the `add-agent.md` precedent.
- Surfaced as an explicit informational step in the existing
  `.arc/system/workflows/arc/initial-setup/` sequence with three-way user choice (now / defer / never).
  Three-way choice avoids the binary-prompt-during-onboarding problem option B has — user can
  acknowledge existence and defer with full agency.

Better than A because user is informed at onboarding rather than discovering the feature ad-hoc. Better
than B because three-way choice is informational, not gatekeeping. Better than C because the supplemental
workflow stays the canonical surface — no separate one-time-prompt machinery to maintain.

## Unknowns and Assumptions

Resolved at WU2 PRD or during work:

- **Agent edit fidelity on permission files.** Reference-implementation harnesses (Claude Code Edit on
  strict JSON; Codex Edit on Starlark) and agent-adaptive harnesses (agent translating contract against
  unknown-harness format) both depend on agent's edit precision. Empirical question per harness. Workflow's
  mandatory verify step (agent-reported install success + behavioral test where applicable + user
  confirmation) catches incorrect writes regardless of harness; setup loops back to remediation rather
  than recording opt-in.
- **Mode-detection coverage for unknown harnesses.** Reference-implementation harnesses get documented
  mode-detection patterns. Agent-adaptive harnesses rely on the agent's own knowledge of its harness's
  mode-config conventions; the workflow surfaces this as an explicit step the agent owns. Misdetection at
  install time is a risk the user-confirmation step mitigates.
- **`arc release setup uninstall` cleanup robustness when the user has hand-edited helper-written
  entries**, or (under agent-adaptive path) when the agent translates cleanup against its earlier
  translation. *Mitigation:* cleanup matches by exact pattern set; doesn't touch user-curated entries; if
  patterns drift from canonical, cleanup is conservative (refuse + prompt manual cleanup).
- **opencode resolution timeline** for [sst/opencode#6676] and [sst/opencode#15507]. When upstream lands,
  opencode graduates from agent-adaptive-with-caveats to reference-implementation in a follow-up.
- **Codex matcher empirical re-verification cadence.** Re-run against the then-current codex-cli at WU2
  verification (see § Empirical-Test Surface).

## Sibling Work Units

WU1 (`prd-release-wrappers-foundation.md` — archived at
`.arc/reference/archive/2026-q2/technical/08_release-wrappers-foundation/`) — hard dependency, shipped via
PR #30 (merged 2026-05-09). No other siblings.

## Scope Estimate

**Medium.** ~7-9 sessions ballpark. Breakdown reflects the workflow-as-contract reshape — workflow doc
grows as primary deliverable; per-harness formatters shrink to convenience helpers; empirical-test surface
adds an explicit session.

- Setup workflow doc (markdown — contract description, per-harness reference sections, mode-conditioned
  acknowledgment, agent-adaptive path framing): ~1.5-2 sessions.
- Setup CLI primitives (`print-patterns` formatters for reference-implementation harnesses; `verify`;
  `install` / `uninstall` orchestration including harness/mode-marker recording): ~1.5-2 sessions.
- Workflow integration (`process-task-loop`, `session-handoff`, ceremony workflows; ADR-018 authorization
  rule branching): ~1-1.5 sessions.
- Status integration (extend `arc release status` with harness/mode marker + active value layers; session-
  init orientation): ~0.5-1 session.
- Empirical-test surface (project-scoped mode-override harness, Codex re-verification, behavioral matrix):
  ~1 session.
- Per-harness reference setup notes + strategy doc (mode-conditioned framing throughout): ~1-1.5 sessions.
- `cli.ts` description-string accuracy sweep: ~0.25 session.
- Verification + integration: ~1 session.

**Dependencies:**

- **Hard dependency:** WU1 — shipped via PR #30 (2026-05-09).
- **Soft preference:** Land before any future work that adds new mutating git operations to ARC's surface
  — keeps the release wrapper's scope-line decision (commit/push only) clean rather than retroactive.

**Scheduling.** WU1 integrated. Pre-1.0 polish window. No parallel option.

---

[sst/opencode#6676]: https://github.com/sst/opencode/issues/6676
[sst/opencode#15507]: https://github.com/sst/opencode/issues/15507
