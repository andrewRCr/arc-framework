# Notes: Release Wrappers — Adopter Ergonomics

## Contents

- [Approach Rationale: Why Workflow-as-Contract](#approach-rationale-why-workflow-as-contract)
- [Trust-Model Acknowledgment Text Variants](#trust-model-acknowledgment-text-variants)
- [Status Surface Examples](#status-surface-examples)
- [Strategy Doc Framing Notes](#strategy-doc-framing-notes)
- [Adopter Friction Analysis](#adopter-friction-analysis)
- [Reference-Implementation Pattern Specifics](#reference-implementation-pattern-specifics)
- [Bypass-Mode Provenance](#bypass-mode-provenance)

## Approach Rationale: Why Workflow-as-Contract

The harness-agnostic workflow-as-contract architecture (PRD § Technical Considerations) was chosen
over two earlier alternatives. Capturing the rejection rationale here so it isn't re-derived if
implementation tempts toward per-harness format-write code at task-time.

**Rejected: fully deterministic per-harness CLI plugins.** JSON merge for Claude Code, Starlark
managed-block edits for Codex, equivalent per-harness write logic. Reasons rejected:

1. **Format gulf is severe.** Strict JSON vs. Starlark vs. arbitrary script for personal-scripts.
   Plugin architecture would absorb significant TypeScript surface for setup-time work.
2. **Trust-tier mismatch.** Setup is one-time, error-recoverable, judgment-driven (which scope to
   write to? Existing rules to merge with?). Wrapper enforcement is per-invocation,
   error-irrecoverable, mechanical. The CLI's value is highest where errors are silent and
   consequential — runtime enforcement, not setup.
3. **Adopter reality.** Most adopters reach setup during an agent session ("set up the
   release-wrapper allowlist for me"). The agent already knows its harness, already has Edit tools
   tuned for the format. CLI plugins would re-implement knowledge the agent has at runtime.
4. **Future harnesses.** New harness lands → update workflow markdown + add a small pattern
   formatter. No release needed for the hard part.

**Rejected: middle-ground (per-harness pattern formatters as deliverables).** Treats per-harness
formatters as deliverables rather than convenience helpers. Absorbs scope that scales poorly: every
new harness adds a TypeScript handler, test surface, and release. The harness-agnostic framing
inverts the priority — workflow doc is the contract carrier, formatters are convenience helpers.

**Accepted: harness-agnostic workflow-as-contract.** ARC publishes the contract surface (six
elements per PRD R1); the resident agent translates into its harness's idioms. Reference
implementations (Claude Code, Codex CLI) ship as polished examples with helper formatters; other
harnesses follow the agent-adaptive path. Per-harness format-write code stays out of the CLI;
agents apply the contract against their own harness knowledge.

The verify-model trade-off this entails: shifts from CLI-mechanical (where ARC inspects the
harness's config to confirm install) to workflow-mediated (agent reports + behavioral test under
default-prompt + user confirmation). The CLI-mechanical version was tighter but required
harness-specific config-inspection logic ARC would have to maintain per harness — which the
harness-agnostic framing rejects. The workflow-mediated version accepts agent self-report,
consistent with co-development trust elsewhere in ARC.

## Trust-Model Acknowledgment Text Variants

The setup workflow's trust-model acknowledgment is mode-conditioned (PRD R1). Reference framings
for the workflow-author to draw from:

**Default-prompt mode (trust-shift framing):**

> Installing the release-wrapper allowlist removes your harness's per-invocation prompt for
> `arc release commit` and `arc release push` invocations. ARC's interlock layer becomes the
> canonical authorization point for these commits and pushes. Other git invocations (raw `git
> commit`, `git push`) continue to prompt as before; nothing else changes.
>
> The release wrapper enforces interlock state, refuses destructive flags, and audits every
> invocation regardless of opt-in. Opt-in records your acceptance that ARC's enforcement is the
> review surface for matching invocations rather than the harness prompt.
>
> You can disable any time via `arc release setup uninstall`. Do you accept this trust shift?

**Bypass mode (audit-only framing):**

> Your harness is in bypass mode (no per-invocation prompt). Installing the release-wrapper
> allowlist would be a no-op — there's no harness prompt to skip. Skipping that step.
>
> Opt-in still records your decision to engage the wrapper's validation + audit layer as a
> layered protection above your existing safety-hook posture. The wrapper validates interlock
> state, refuses destructive flags, and audits every invocation. Under bypass mode this layer
> is your primary review surface for `arc release commit` / `arc release push`.
>
> Other git invocations remain governed by your existing safety-hook posture. The two layers
> compose without conflict.
>
> You can disable any time via `arc release setup uninstall`. Do you accept this opt-in?

These are reference framings, not literal text. The workflow-author adapts to the workflow's voice
and the surrounding initial-setup context.

## Status Surface Examples

Concrete `arc release status` output shapes for both modes (PRD R10). Useful when implementing
the status renderer.

**Default-prompt with allowlist active:**

```text
release_enabled: true (git-config:local)
commit_interlock: on-task-approval (yaml)
push_interlock: manual (default)
sync_interlock: on-handoff (default)

harnesses:
  claude-code (default-prompt) — installed 2026-05-09
  codex       (default-prompt) — installed 2026-05-09
active_value_layers: validation + audit + harness-prompt bypass
```

**Bypass mode:**

```text
release_enabled: true (git-config:local)
commit_interlock: on-task-approval (yaml)
push_interlock: manual (default)
sync_interlock: on-handoff (default)

harnesses:
  claude-code (bypassPermissions) — no harness gate to bypass
active_value_layers: validation + audit
```

**Mixed (one default-prompt, one bypass on the same machine):**

```text
release_enabled: true (git-config:local)
...
harnesses:
  claude-code (bypassPermissions) — no harness gate to bypass
  codex       (default-prompt)    — installed 2026-05-09
active_value_layers: validation + audit + harness-prompt bypass (codex only)
```

**Opt-in not recorded:**

```text
release_enabled: false (default)
...
harnesses: []
active_value_layers: none
```

The `active_value_layers` projection is derivable from opt-in × per-harness mode; doesn't need to
be stored. Mixed-mode adopters get the most informative line — names which harness the bypass
layer applies to.

## Strategy Doc Framing Notes

When writing `strategy-interlock-release-wrappers.md` (PRD R14.1), the framing should:

- **Lead with the unconditional layer (validation + audit) as the universal benefit.** All adopters
  who opt in get this. Any "why use this?" explanation should anchor here, not on prompt bypass.
- **Position the conditional layer (prompt bypass) as additional benefit for default-prompt users.**
  Frame as a friction-reduction, not as the primary value prop.
- **Name bypass mode explicitly; don't assume default-prompt as single adopter shape.** The default
  is default-prompt; bypass is plausibly common among power users running long autonomous sessions.
- **Acknowledge user-level safety-gate hooks as a parallel layer.** They compose with wrapper
  validation, not replace it. Denylist at OS boundary; wrapper validates ARC-state correctness at
  CLI boundary.

The "when not to use this" guidance gains a bypass-mode note: bypass-mode users without
`arc.releaseEnabled` get the same harness behavior whether or not they invoke the wrapper, but they
lose the validation + audit layer's protections. There's no "validation off" justification under
bypass mode the way there might be under default-prompt (where the harness prompt itself is the
user's review surface) — the validation + audit layer is the primary value prop for bypass-mode
adopters.

Cross-references to land at strategy-doc time (PRD R14.2–R14.4):

- `strategy-configurability-architecture.md` — interlock release wrappers are a configurability
  surface (`release.enabled` × interlock values × wrapper routing). The architecture-level strategy
  doc cross-references the domain-level strategy.
- `strategy-session-operations.md` — already updated in WU1 for the on-workflow extension. Touch
  for WU2's session-init orientation surfacing (engaged-state note per PRD R11) and harness/mode
  marker as part of session-init posture reading.
- `strategy-team-coordination.md` — already touched in WU1. Small update for per-developer
  asymmetric setup acknowledgment (multi-developer repos where setup state diverges per developer;
  document as expected, parallel to existing per-developer interlock-setting variation).

## Adopter Friction Analysis

Wrong-setup scenarios stratified by severity. Useful for anticipating failure modes during task
implementation and for the strategy doc's troubleshooting section.

### Low — self-correcting

- Adopter runs setup but skips verify → not gated; verify is mandatory in the workflow.
- Adopter forgets one harness in a multi-harness setup → status surfaces detected harnesses on
  subsequent runs; "add harness" path in idempotency choice (PRD R4) handles re-running for the
  missed harness.
- Bypass-mode adopter installs allowlist entries that are no-ops (allowlist write doesn't change
  behavior under bypass). Harmless; entries don't conflict with bypass mode. Mitigation: setup
  workflow detects mode and skips the write with explanation per PRD R1.

### Medium — mitigable

- Adopter changes interlock setting later without realizing release-wrapper behavior shifts.
  Mitigation: surface release-wrapper posture in next session-init orientation when interlock
  setting changes (PRD R11).
- Multi-developer repo, asymmetric allowlist between developers. Not really wrong — different
  setup per-developer; document as expected.
- Codex matcher grammar limits: commits authored with command substitution, env-variable prefixes,
  or output redirection fall through to harness prompt despite the release-wrapper allowlist.
  Behavior is deterministic per input. Mitigation: setup workflow documents the supported grammar;
  agent-issued invocations follow it by convention.
- Agent edit fidelity on permission files. Reference-implementation agent (Claude Code on JSON,
  Codex on Starlark) botches a JSON merge or Starlark insertion; agent-adaptive path agent
  translates the contract incorrectly for an unknown harness. Mitigation: mandatory verify step
  (agent-reported install success, behavioral test where applicable, user confirmation) catches;
  setup loops back rather than recording opt-in state.
- Bypass-mode adopter doesn't recognize the wrapper still adds value. Default-prompt-framed
  messaging may read as irrelevant ("I don't see harness prompts anyway; why install a wrapper?").
  Mitigation: setup workflow's bypass-mode branch surfaces the validation + audit value prop
  explicitly; strategy doc leads with the unconditional layer.

### High — requires deliberate design

- **Silent trust-model shift:** adopter accepts the trust-model acknowledgment without
  internalizing it. Mitigations: setup workflow requires explicit acknowledgment with verbose
  framing; opt-in state is recorded; session-init orientation surfaces "release-wrapper allowlist
  active — ARC sole authorization layer" when detected (PRD R11); status command surfaces same
  (PRD R10).
- **Release-wrapper or interlock bug lets bad op through:** no harness safety net under the
  release wrapper. Mitigations (WU1-shipped): release-wrapper enforcement as security-tier code
  with exhaustive matrix testing; audit log gives forensic recovery.
- **Personal scripts (bespoke gates):** setup workflow can't autoconfigure these. Mitigation:
  workflow prints canonical contract elements and instructs manual installation; agent-adaptive
  path applies.
- **opencode silent-config-validation bug:** typos in opencode permission keys are silently
  ignored ([sst/opencode#15507]). Mitigation: workflow surfaces the limitation when opencode is
  detected; full convenience-helper implementation deferred until upstream resolves.

### Reputational risk

A commit/push-related feature that occasionally bypasses safeguards in unexpected ways is exactly
the kind of feature that erodes framework trust. Mitigations that hold the line:

- Strictly opt-in. Never auto-enabled.
- Loud, not silent. Orientation surfaces release-wrapper-active state; refusals are verbose and
  explain remediation.
- Easy off switch. `arc release setup uninstall` rolls back; idempotent.
- Hold the scope line. Commit and push only — no slippery slope to higher-blast-radius ops.
- Documented "when not to use this." Tells users when to walk away.

## Reference-Implementation Pattern Specifics

Reference notes for the per-harness `print-patterns` formatters (PRD R6). These are the actual
pattern shapes that need to land in the formatter output.

### Claude Code

Pattern-based allowlist; `Bash(arc release commit:*)` matches distinctly from `Bash(git commit:*)`.
Canonical patterns (JSON snippet for `.claude/settings.json`'s `permissions.allow` array):

```json
{
  "permissions": {
    "allow": [
      "Bash(arc release commit:*)",
      "Bash(arc release push:*)"
    ]
  }
}
```

Setup workflow's mode detection: inspect `~/.claude/settings.json` and project-level
`.claude/settings.json` for `permissions.defaultMode`. Value `"bypassPermissions"` indicates bypass
mode; absent or any other value indicates default-prompt.

### Codex CLI

Starlark `prefix_rule()` with explicit list patterns. Codex's Starlark loader requires keyword
arguments (`pattern=`, optional `decision="allow"`); positional invocation does not work. Codex
unwraps `bash -lc` / `zsh -lc` shell wrappings via `commands_for_exec_policy` before `prefix_rule`
matching.

Canonical patterns (Starlark for `~/.codex/rules/default.rules`):

```python
prefix_rule(pattern=["arc", "release", "commit"])
prefix_rule(pattern=["arc", "release", "push"])
```

Realistic invocation shape (`arc release commit -m "..."`) matches reliably. Verified empirically
against codex-cli 0.128.0 (2026-05-07). Predictable fall-through to harness prompt for
env-prefixed (`FOO=bar arc release commit ...`), redirected (`arc release commit ... > out`),
command-substituted (`arc release commit -m $(date)`), or `$'...'` quoted invocations. Setup
workflow documents the supported grammar.

Re-verify against then-current codex-cli at WU2 verification (PRD R13's empirical surface).

### opencode (agent-adaptive path)

opencode adopters use the agent-adaptive workflow with documented limitations:

- [sst/opencode#6676] — flag-parsing bug may cause `arc release commit -m "..."` to not match
  patterns reliably.
- [sst/opencode#15507] — silent config-validation failure means typos in opencode permission keys
  are ignored.

The wrapper itself works (WU1); allowlist install via the agent-adaptive path with these caveats
explicit. Convenience-helper formatter for opencode lands when upstream resolves; the
agent-adaptive path is available immediately.

### Custom harnesses (agent-adaptive path)

Workflow emits the abstract contract (the six elements per PRD R1) for the agent to translate
against the harness's own conventions. The agent reads contract, applies translation, writes,
re-reads, runs behavioral test under default-prompt mode where applicable, reports success or
failure to the user. No ARC-side per-harness logic.

## Bypass-Mode Provenance

The bypass-mode dimension surfaced during WU1 Phase 7 verification (2026-05-09) when the empirical
test for success criteria #5 / #6 (`arc release commit --version` runs no-prompt under installed
allowlist entries) couldn't run meaningfully against the maintainer's `bypassPermissions` Claude
Code session — the matcher-observation methodology assumes a prompting-default harness, which
bypass mode breaks.

Criteria marked `[~]` Superseded with deviation note in WU1's tasks file pointing to the
plan-doc's § Harness Permission Mode for canonical capture. WU2's empirical-test surface
(PRD R13) absorbs the deferred verification using the project-scoped mode-override strategy that
sidesteps the cross-machine requirement.

ADR-017 amendment (Tier 2, dated annotation in Consequences) is optional follow-up — captures the
harness-mode dimension in the ADR if WU2 integration surfaces broader insights worth bundling.
PRD R18 carries this as P2 / nice-to-have.

The dual-mode framing is now load-bearing throughout WU2: § Problem / Motivation in the plan-doc
led with the duality, the PRD's Introduction carries it forward, and the setup workflow (PRD R1)
is mode-aware throughout.

---

[sst/opencode#6676]: https://github.com/sst/opencode/issues/6676
[sst/opencode#15507]: https://github.com/sst/opencode/issues/15507
