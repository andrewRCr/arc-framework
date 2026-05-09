# Plan: Release Wrappers — Adopter Ergonomics

## Problem / Motivation

WU1 (`prd-release-wrappers-foundation.md`, sibling) delivers the mechanical foundation:
`arc release commit` and `arc release push` work end-to-end for hand-configured adopters.
Hand-configuration means manually editing harness permission files (`.claude/settings.json`,
`~/.codex/policy/...`) and running `arc release opt-in` to flip per-developer
opt-in state (`arc.release.enabled`).

This works for the friction-tolerant minority but falls short of the broader adoption case.
Adopters who would benefit from the release wrapper's friction-reduction need:

1. A guided setup that explains the trust-model trade-off, detects their harness, helps install
   allowlist entries correctly, and verifies the result.
2. Visible posture state — `arc status` and session-init orientation should surface
   "release-wrapper allowlist active — ARC is sole authorization layer" when detected.
3. Workflow integration that prefers the release wrapper over raw git when opt-in is recorded.
4. Documentation that walks per-harness setup, the "when not to use this" guidance, and the
   strategy framing.

This work delivers that ergonomic surface — what makes WU1's mechanism approachable for the
typical adopter.

**Why now:** WU1 is the gate; once it lands, adopters can hand-configure but the rough edges
show immediately. WU2 should follow within the same release window so the release-wrapper
system ships as a coherent capability rather than a primitive-with-promised-ergonomics.

## Approach: Middle-Ground (CLI primitives + workflow-driven setup)

The earlier framing of "per-harness detection and config-write logic" — fully deterministic CLI
plugins handling JSON merge for Claude Code, Starlark managed-block edits for Codex, and
equivalent per-harness write logic — was considered and rejected. Reasons:

1. **Format gulf is severe.** Strict JSON vs. Starlark vs. arbitrary script for personal-scripts.
   Plugin architecture would absorb significant TypeScript surface for setup-time work.
2. **Trust-tier mismatch.** Setup is one-time, error-recoverable, judgment-driven (which scope
   to write to? Existing rules to merge with?). Wrapper enforcement is per-invocation,
   error-irrecoverable, mechanical. The CLI's value is highest where errors are silent and
   consequential — runtime enforcement, not setup.
3. **Adopter reality.** Most adopters reach setup during an agent session ("set up the
   release-wrapper allowlist for me"). The agent already knows its harness, already has Edit
   tools tuned for the format. CLI plugins would re-implement knowledge the agent has at
   runtime.
4. **Future harnesses.** opencode unblocks → update workflow markdown + add a small pattern
   formatter. No release needed for the hard part.

The middle-ground splits responsibility:

**CLI provides** (small, mechanical, format-aware-but-not-format-editing):

- `arc release setup status` — detect harness markers, report current opt-in state.
- `arc release setup print-patterns [--harness <name>]` — canonical allowlist text, formatted
  for the named harness.
- `arc release setup verify [--harness <name>]` — read configs, confirm canonical patterns are
  present; return structured pass/fail.
- `arc release setup --enable` / `--disable` — orchestration porcelain that drives the workflow,
  verify, and opt-in (or removal and opt-out).

(Note: `arc release opt-in` / `opt-out` / `status` ship in WU1 as minimal
state-recording primitives.)

**Workflow provides** (judgment-driven, agent-executed):

- Setup workflow doc (`.arc/system/workflows/arc/release-wrapper-setup.md` or similar) that
  walks the agent through:
    - Explaining the trust-model trade-off; user explicit acknowledgment.
    - Running `arc release setup status` to detect harnesses.
    - For each detected harness: running `print-patterns`; reading existing config; merging
      entries; writing.
    - Running `arc release setup verify`. On pass, prompting user to confirm; on user-confirm
      running `arc release opt-in`.

**Critical safety property:** `opt-in` is gated on `verify` returning pass. The agent
writes the config; `verify` confirms; only on success does opt-in state record
(`arc.release.enabled: true`). A failed/incomplete edit cannot accidentally record opt-in.

## Scope

### In scope

**Setup CLI primitives.** Sub-commands under `arc release setup`:

- `status` — harness detection + opt-in state report.
- `print-patterns [--harness <name>]` — canonical text emitter, per-harness format.
- `verify [--harness <name>]` — read-only config inspection, confirm canonical patterns
  present.
- `--enable` / `--disable` — orchestration porcelain that runs the workflow, verify, and
  opt-in (or opt-out).

Pattern formatters per harness:

- Claude Code: JSON snippet (allowlist entries for `.claude/settings.json`).
- Codex CLI: Starlark snippet (`prefix_rule()` calls for `~/.codex/policy/...`).
- opencode: stub — print deferral notice + linked upstream issues.
- Personal-script fallback: plain canonical patterns + paste instructions.

**Setup workflow.** Markdown workflow that drives the agent through the setup, including:

- Trust-model acknowledgment (mandatory; user must explicitly accept the harness-gate-removal).
- Harness detection (uses `arc release setup status`).
- Per-harness section: agent reads existing config, merges canonical entries, writes.
- Verification step (mandatory; uses `arc release setup verify`).
- State recording (gated on verify pass; uses `arc release opt-in`).
- Rollback (`arc release setup --disable` flow: agent removes its entries; state recorded).

**Workflow integration.** Updates to `process-task-loop.md`, `session-handoff.md`, and
ceremony workflows (`activate-work-unit.md`, `activate-planning-branch.md`, recovery flows):

- Agent prefers `arc release commit` / `arc release push` over raw git when
  `arc.release.enabled: true` (read once at session-init via the WU1 probe surface; branched
  at workflow-author time — same model as `commit_interlock` today).
- Ceremony workflows (activation, planning-branch activation, recovery) route their pushes
  through `arc release push` when enabled — the primary consumer of the single-leg push
  primitive.
- `arc sync` continues to handle handoff push directly. Under WU1, sync's invocations are
  already captured in the audit log; no internal re-routing through `arc release push`
  needed.

**Status integration.** `arc status` surfaces release-wrapper-active state when opt-in is
recorded. Session-init orientation includes a one-line note when the release wrapper is the
sole authorization layer (loud, not silent — addresses the silent-trust-shift concern under
§ Adopter Friction).

**Documentation.**

- New strategy doc (`strategy-interlock-release-wrappers.md` or similar). Trust model, when to
  use, when not to use, per-harness setup, troubleshooting.
- Per-harness setup guides (Claude Code, Codex, opencode-deferred, personal-scripts).

### Out of scope

- **WU1 functionality.** Wrappers, validation library, audit log, ADR — already
  shipped.
- **opencode auto-allowlist.** Stub printing deferral notice; full implementation deferred
  until upstream resolves [sst/opencode#6676] and [sst/opencode#15507].
- **Auto-enable in any harness by default.** Setup is always opt-in.

## Trust Model Trade-Off

Inherited from the parent plan; carried forward intact for context. The trade-off itself
doesn't change with the WU split — WU1 makes the release wrapper *available*; WU2 makes it
*engaged*. The trade-off lands at engagement.

Today's protective layering for git mutating operations:

1. ARC workflow (agent follows interlock-respecting protocol).
2. Harness gate (catches operations regardless of whether ARC authorized them).
3. User approval at the harness prompt.

After release wrapper + allowlist (when adopter opts in via WU2 setup):

1. ARC workflow (unchanged).
2. Release-wrapper enforcement (refuses on invalid interlock state, missing WU, destructive
   flags).
3. *(Harness gate bypassed for release-wrapper invocations only.)*
4. User approval at ARC interlock layer (where the trust decision is meaningful).

**This is a per-user policy decision; ARC must not make it silently.** The setup workflow's
mandatory trust-model acknowledgment is what holds this line in WU2.

This framing assumes a default-prompt harness; see § Harness Permission Mode for how the
trade-off composes under bypass-mode harnesses, with implications for setup-helper behavior,
status surface, and documentation framing.

## Harness Permission Mode (Default-Prompt vs. Bypass)

The Trust Model Trade-Off above frames the decision against a default-prompt harness — one
that prompts on every Bash invocation absent a matching allowlist entry. Two distinct adopter
postures change how the trade-off composes, with concrete implications for WU2's setup helper,
status surface, and documentation framing.

**Default-prompt mode (the assumed baseline).** Harness gates every Bash invocation; allowlist
entries skip the prompt for matching shapes. Default behavior across Claude Code, Codex CLI,
opencode, etc. The parent plan's "redundant friction" framing lands here: ARC interlock
authorizes, harness prompt re-asks, user re-confirms. The wrapper bypasses the re-prompt for
documented invocation shapes; both wrapper value layers (per ADR-017) materialize.

**Bypass mode (`bypassPermissions`, dangerous mode, equivalents).** Harness allows every Bash
invocation without prompting. Adopters who run this way typically pair it with a user-level
safety hook (denylist approach — `~/.claude/hooks/safety-gate.sh` or Codex-equivalent) that
catches known-dangerous shapes at the OS boundary while letting routine work flow without
per-invocation prompts. Encountered on this codebase's maintainer machine during WU1 Phase 7
verification (deviation note on superseded success criteria captures the empirical-test
collapse — the matcher-observation methodology assumes a prompting-default harness, which
bypass mode breaks). Plausibly common among power users running long autonomous sessions; no
distribution data, but not assumed rare.

### Value-prop differs by mode

The release wrapper has two value layers per ADR-017:

- **Unconditional layer (validation + audit).** Validates interlock state, refuses on
  destructive flags / branch-protection violations / pushability failures; appends a JSONL
  audit entry on every invocation. Fires regardless of `arc.release.enabled` or harness mode.
- **Conditional layer (harness-prompt bypass).** Allowlist entry causes the harness matcher
  to skip the per-invocation prompt for wrapper invocations. Requires a default-prompt harness
  with allowlist entries installed.

Default-prompt users get both layers. Bypass-mode users get only the unconditional layer —
there was no harness prompt to skip. The wrapper still adds substantial value (mechanical
interlock validation no denylist hook covers, forensic audit log no harness logging produces),
but the value-prop reduces. `arc.release.enabled: true` for bypass-mode users records explicit
opt-in to the validation + audit layer (and signals downstream workflow routing) without
changing harness behavior.

### Setup-helper implications

`arc release setup --enable` should recognize the harness mode it's running under and adapt:

- **Default-prompt mode** (Claude Code with explicit `permissions.allow`, Codex with active
  `prefix_rule()` patterns). Full flow as documented elsewhere in this plan: detect harnesses
  → write per-harness allowlist patterns → verify → opt-in.
- **Bypass mode** (`permissions.defaultMode: "bypassPermissions"` in Claude Code, Codex's
  analogous bypass config). Allowlist write becomes a no-op. Setup helper should:
    - Surface the detected mode explicitly: "Detected bypass-permissions mode in <harness>;
      allowlist write skipped — wrapper invocations already pass through without prompting."
    - Skip the allowlist write for that harness (or write anyway as future-compat for mode
      changes — design call at WU2 PRD; default to skip-with-explanation feels right).
    - Still write `arc.release.enabled: true` if the user opts in. Downstream workflow routing
      (preferring `arc release commit` over raw git) still benefits.
    - Adapt the trust-model acknowledgment text. Default-prompt version frames "you're
      removing the harness gate for these invocations"; bypass-mode version reframes to
      "you're opting in to wrapper validation + audit as layered protection above your
      existing safety-hook posture; ARC interlock becomes the canonical authorization signal
      for matching invocations."
- **Mixed mode** — multiple harnesses, different modes per harness. Per-harness handling.
  Plausible: bypass-mode Claude Code + default-prompt Codex on the same machine.

User-level safety-gate hooks (`~/.claude/hooks/safety-gate.sh`, Codex-equivalent) are out of
the helper's detection scope. They run alongside whatever mode is set; their existence doesn't
change harness gate behavior. Strategy doc should acknowledge them as a parallel,
complementary layer — denylist at OS boundary, wrapper validates ARC-state correctness at CLI
boundary, the two compose without conflict.

### `arc release setup status` should surface harness mode

The status command (extending or renaming WU1's `arc release status` — design call at WU2
PRD) should report detected harness mode alongside opt-in state. Adopters reading status
should see which value layers apply to them:

```text
Release wrapper opt-in: enabled (arc.release.enabled = true)
Detected harnesses:
  Claude Code (default-prompt) — allowlist active for arc release commit/push
  Codex CLI (default-prompt) — allowlist active for arc release commit/push
Active value layers: validation + audit + harness-prompt bypass
```

Under bypass:

```text
Release wrapper opt-in: enabled (arc.release.enabled = true)
Detected harnesses:
  Claude Code (bypassPermissions) — no harness gate to bypass
Active value layers: validation + audit
```

Mode detection is harness-specific. Claude Code: inspect `~/.claude/settings.json` and
project-level `.claude/settings.json` for `permissions.defaultMode === "bypassPermissions"`.
Codex CLI: equivalent config inspection (TBD at WU2 PRD).

### Documentation framing widens

Strategy doc and per-harness setup guides should frame the value prop against both modes:

- Lead with the unconditional layer (validation + audit) as the universal benefit.
- Position the conditional layer (prompt bypass) as additional benefit for default-prompt
  users.
- Name bypass-mode explicitly; don't assume default-prompt as single adopter shape.
- Acknowledge user-level safety-gate hooks as a parallel layer that composes with wrapper
  validation, not replaces it.

The "when not to use this" guidance gains a bypass-mode note: bypass-mode users without
`arc.release.enabled` get the same harness behavior whether or not they invoke the wrapper,
but they lose the validation + audit layer's protections. There's no "validation off"
justification under bypass mode the way there might be under default-prompt (where the
harness prompt itself is the user's review surface) — the validation + audit layer is the
primary value prop for bypass-mode adopters.

### Provenance

Surfaced during WU1 Phase 7 verification (2026-05-09) when the empirical test for success
criteria #5 / #6 (`arc release commit --version` runs no-prompt under installed allowlist
entries) couldn't run meaningfully against the maintainer's `bypassPermissions` Claude Code
session. Criteria marked `[~]` Superseded with deviation note pointing here; ADR-017
amendment (Tier 2, dated annotation in Consequences) optional post-WU2 if integration
surfaces broader insights worth bundling. Until then, this plan-doc section is the canonical
capture so WU2 PRD doesn't re-derive the bypass-mode dimension.

## Adopter Friction Analysis

Wrong-setup scenarios stratified by severity:

**Low — self-correcting:**

- Adopter runs setup but skips verify → not gated; verify is mandatory in the workflow.
- Adopter forgets one harness in a multi-harness setup → `status` surfaces detected harnesses
  on subsequent runs.
- Bypass-mode adopter installs allowlist entries that are no-ops (allowlist write doesn't
  change behavior under `bypassPermissions`). Harmless; entries don't conflict with bypass
  mode. *Mitigation:* setup helper detects mode and either skips the write with explanation
  or proceeds with a no-op-warning, per § Harness Permission Mode.

**Medium — mitigable:**

- Adopter changes interlock setting later without realizing release-wrapper behavior shifts.
  *Mitigation:* surface release-wrapper posture in next session-init orientation when
  interlock setting changes.
- Multi-developer repo, asymmetric allowlist between developers. Not really wrong — different
  setup per-developer; document as expected.
- *Codex matcher grammar limits:* commits authored with command substitution, env-variable
  prefixes, or output redirection fall through to harness prompt despite the release-wrapper
  allowlist. Behavior is deterministic per input. *Mitigation:* setup helper documents the
  supported grammar; agent-issued invocations follow it by convention.
- *Agent edit fidelity on permission files.* Claude Code or Codex agent botches a JSON merge
  or Starlark insertion. *Mitigation:* mandatory verify step catches; setup loops back rather
  than recording opt-in state.
- *Bypass-mode adopter doesn't recognize the wrapper still adds value.* Default-prompt-framed
  messaging may read as irrelevant ("I don't see harness prompts anyway; why install a
  wrapper?"). *Mitigation:* setup helper's bypass-mode branch surfaces the validation + audit
  value prop explicitly; strategy doc leads with the unconditional layer. See § Harness
  Permission Mode.

**High — requires deliberate design:**

- *Silent trust-model shift:* adopter accepts the trust-model acknowledgment without
  internalizing it. *Mitigations:* setup helper requires explicit acknowledgment with verbose
  framing; opt-in state is recorded; session-init orientation surfaces "release-wrapper
  allowlist active — ARC sole authorization layer" when detected; status command surfaces
  same.
- *Release-wrapper or interlock bug lets bad op through:* no harness safety net under the
  release wrapper. *Mitigations* (WU1-shipped): release-wrapper enforcement as security-tier
  code with exhaustive matrix testing; audit log gives forensic recovery.
- *Personal scripts (bespoke gates):* setup helper can't autoconfigure these. *Mitigation:*
  helper detects standard harness markers; for non-standard setups, prints canonical allowlist
  patterns and instructs manual installation.
- *opencode silent-config-validation bug:* typos in opencode permission keys are silently
  ignored ([sst/opencode#15507]). *Mitigation:* opencode handler prints deferral notice; full
  implementation deferred until upstream resolves.

**Reputational risk** (raised during planning): a commit/push-related feature that
occasionally bypasses safeguards in unexpected ways is exactly the kind of feature that erodes
framework trust. Mitigations that hold the line:

- Strictly opt-in. Never auto-enabled.
- Loud, not silent. Orientation surfaces release-wrapper-active state; refusals are verbose
  and explain remediation.
- Easy off switch. `arc release setup --disable` rolls back; idempotent.
- Hold the scope line. Commit and push only — no slippery slope to higher-blast-radius ops.
- Documented "when not to use this." Tells users when to walk away.

## Per-Harness Viability

Inherited from parent plan; conclusions stand.

| Harness | Status |
| ------- | ------ |
| Claude Code | viable |
| Codex CLI | viable |
| opencode | blocked upstream |

**Claude Code.** Pattern-based allowlist; `Bash(arc release commit:*)` matches distinctly from
`Bash(git commit:*)`.

**Codex CLI.** Starlark `prefix_rule()` with explicit list patterns. Unwraps `bash -lc` /
`zsh -lc` shell wrappings via `commands_for_exec_policy` before `prefix_rule` matching.
Realistic invocation shape matches reliably; verified empirically against codex-cli 0.128.0
(2026-05-07). Predictable fall-through to harness prompt for env-prefixed, redirected,
command-substituted, or `$'...'` quoted invocations. Setup helper documents the supported
grammar.

**opencode.** Glob syntax exists but flag-parsing bug ([sst/opencode#6676]) means
`arc release commit -m "..."` may not match patterns reliably. Compounded by silent
config-validation failure ([sst/opencode#15507]). Release wrapper itself works (WU1);
auto-allowlist support deferred until upstream resolves. Adopter impact: opencode users get no
improvement (no regression either) — release-wrapper invocations still flow through the
existing harness prompt path.

## Alternatives

**Setup helper invocation point** (carries forward from parent plan):

- **A — Standalone porcelain (`arc release setup --enable`, current lean).** User runs
  explicitly when they decide to opt in. Matches opt-in posture; no surprise behavior at
  `arc init` / `arc join`.
- **B — Optional step in `arc init` / `arc join`.** Lower friction for users who want it from
  day one. Risk: gets accepted reflexively without internalizing the trust trade-off.
- **C — Hybrid: standalone porcelain, but prompted-once at first session-init after
  `arc join` with a `--setup-release` opt-in flag.** Captures option B's discoverability
  without sacrificing option A's deliberate posture.

PRD-time decision; not blocking.

## Unknowns and Assumptions

**Resolved at WU2 PRD or during work:**

- Agent edit fidelity on permission files (Claude Code's Edit tool on strict JSON; Codex's
  Edit on Starlark). Empirical question. If fidelity is poor, fall back to "print patterns;
  prompt user to paste manually" for the affected harness rather than agent-driven edit.
  Verify primitive catches incorrect writes regardless.
- Whether `arc release setup --disable` cleanup is robust when the user has hand-edited the
  allowlist entries the helper wrote. Mitigation: cleanup matches by exact pattern set;
  doesn't touch user-curated entries; if patterns drift from canonical, cleanup is
  conservative (refuse + prompt manual cleanup).
- opencode resolution timeline for [sst/opencode#6676] and [sst/opencode#15507]. When upstream
  lands, opencode handler graduates from stub to full implementation in a follow-up.
- Codex matcher empirical re-verification cadence. Re-run against the then-current codex-cli
  at WU2 verification.

## Sibling Work Units

WU1 (`prd-release-wrappers-foundation.md`) — hard dependency, must be integrated before WU2
starts. No other siblings.

## Scope Estimate

**Medium.** ~7-9 sessions ballpark.

- Setup CLI primitives (status, print-patterns formatters per harness, verify): ~2-2.5
  sessions.
- `--enable` / `--disable` orchestration porcelain: ~0.5-1 session.
- Setup workflow doc (markdown, per-harness sections, acknowledgment scripting): ~1-1.5
  sessions.
- Workflow integration (process-task-loop, session-handoff): ~1-1.5 sessions.
- Status integration + session-init orientation surfacing: ~1 session.
- Per-harness adopter setup guides + strategy doc: ~1-1.5 sessions.
- Verification + integration: ~1 session.

**Dependencies on other work:**

- **Hard dependency:** WU1 (`prd-release-wrappers-foundation.md`) integrated before WU2
  starts.
- **Soft preference:** Land before any future work that adds new mutating git operations to
  ARC's surface — keeps the release wrapper's scope-line decision (commit/push only) clean
  rather than retroactive.

**Scheduling.** After WU1 integrates. Pre-1.0 polish window. No parallel option.

---

[sst/opencode#6676]: https://github.com/sst/opencode/issues/6676
[sst/opencode#15507]: https://github.com/sst/opencode/issues/15507
