# Notes: Release Wrappers — Adopter Ergonomics

## Contents

- [Approach Rationale: Why Workflow-as-Contract](#approach-rationale-why-workflow-as-contract)
- [Trust-Model Acknowledgment Text Variants](#trust-model-acknowledgment-text-variants)
- [Status Surface Examples](#status-surface-examples)
- [Strategy Doc Framing Notes](#strategy-doc-framing-notes)
- [Adopter Friction Analysis](#adopter-friction-analysis)
- [Reference-Implementation Pattern Specifics](#reference-implementation-pattern-specifics)
- [Bypass-Mode Provenance](#bypass-mode-provenance)
- [Routing-Rule Placement Decision](#routing-rule-placement-decision)
- [Phase 6.R: Configuration Scope Refactor — Design History](#phase-6r-configuration-scope-refactor--design-history)

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

## Routing-Rule Placement Decision

PRD R12.2 originally specced the canonical routing rule as a new H3 sub-section under § Commit
Discipline (`Interlock release-wrapper routing`, ~40 lines: opening prose, three-class table,
class-declaration paragraph, four-arm `raw` fallback, destructive carve-out). First-pass
implementation landed that shape. Pulled back at task review: the H3 added ~600 tokens of
constitutional context every session for a default-disabled feature. Three alternatives evaluated:

1. **Trim in place** — keep H3, compress to 6-8 lines. Smaller cost; still loads every session
   regardless of opt-in.
2. **Method file, conditionally loaded** — new `system/methods/release-wrapper-routing.md`
   declared in arc-commit + 9 ceremony workflows' frontmatter (`arc.methods`).
3. **Strategy doc only** — push to planned `strategy-interlock-release-wrappers.md` (PRD R14.1);
   thin pointer in DEV-RULES.ARC.

Method shape rejected on three grounds:

- **Override semantics ill-fit.** Methods exist for "adopter overrides framework's implementation
  of a contract." Routing is a runtime lookup of a CLI-resolved value — there's no real
  override surface (adopters enable / disable, no third option).
- **Per-workflow re-load is worse than constitutional once-per-session.** Per
  `system/methods/README.md`, methods load on-demand at workflow trigger points, no shared cache
  across workflows in a session. With class tags in arc-commit + 9 ceremony workflows, a typical
  session would re-load the method 5+ times. Default-disabled adopters pay this cost too — the
  method loads to apply the rule, even when every class resolves to `raw`.
- **Conditional method declaration doesn't exist.** No mechanism for "load this method only when
  `releaseRouting` shows wrapper resolution"; would need new infrastructure.

Strategy-only rejected: agent-discretion lookup ("consult when…") is less reliable for fire-time
mid-workflow consultation than auto-recalled constitutional rules. The strategy doc still lands
per PRD R14.1, but as architecture/rationale carrier — not the canonical operational rule.

**Landed shape:** new peer sub-bullet `Workflow class-tag routing` under § Commit Discipline →
Commit control, sibling to the existing `Release-wrapper invocation` bullet. ~14 lines, ~250
tokens. Loaded once per session for everyone; class tags in workflow bodies are the textual
triggers; agent recalls the rule at fire time the same way it recalls atomicity, --no-verify
prohibition, and other commit-discipline rules.

**Forward-compat signals:**

- `plan-instruction-optimization.md` Pillar 2 (Skill Cache Discipline) is still settling the
  arc-commit method-reload pattern (lean B: cache-hint in skill body, fallback A: session-init
  load-set inclusion). Constitutional placement of the routing rule sidesteps that decision —
  not a method, no caching question.
- Plan does NOT cover method caching across workflows. If/when that question surfaces, this
  rule's placement is independent (constitutional, not method).
- `plan-handoff-optimization.md` Approach item 5 adds `releaseRoutingAtLastHandoff` for
  change-detection — orthogonal to placement; reads the resolved values from the envelope slot
  regardless of where the rule's text lives.
- `plan-arc-modes.md` Lite/Local: constitutional rules are mode-agnostic; methods would need
  per-mode loading consideration. Constitutional avoids that future audit.

**Generalization:** This is a sibling case to "where does a fire-time-applicable operational rule
live?" The methods system is the right answer for contract-implementation rules with adopter
override surface. Constitutional placement is right for runtime-state-lookup rules with no
override surface. The shape choice should follow the rule's character, not the framework's
default loading mechanism.

## Phase 6.R: Configuration Scope Refactor — Design History

Mid-WU course-correction surfaced during Phase 6, after Tasks 6.1 and 6.2 landed and the
maintainer was preparing to dogfood `arc release setup install`. The conversation that
produced Phase 6.R is captured here so future readers can reconstruct why the architecture
shifted mid-stream.

**Trigger.** Maintainer asked whether to also flip the project-level config (`release.enabled:
true` plus the three interlock keys to `on-workflow`) alongside the dogfooding step. The
clarifying walkthrough surfaced that `release.enabled` (project yaml) and `arc.releaseEnabled`
(per-dev git-config) read as the same lever despite controlling different things — and that
the project-level lever was vestigial. Pressure-test then expanded to the three interlock
keys, asking the same question: do project-level defaults earn their keep?

**External research.** Surveyed 8 representative dev tools for dual-scope (project + per-dev
override) idiomaticity: ESLint, Prettier, Cargo, npm, TypeScript, gh CLI, Ruff, direnv,
EditorConfig. Findings: dual-scope is idiomatic for output-affecting settings (npm registry,
Cargo dep paths); same-name-across-scopes is a documented discoverability anti-pattern that
EditorConfig and direnv explicitly address. Critical finding: autonomy / interaction-cadence
preferences (analog to ARC's interlocks) are conventionally personal-only across the
ecosystem — ARC's interlocks-as-team-defaults pattern was framed as "novel" by the research.

**Walkthrough verification of `release.enabled` semantics.** Verified the flag is consumed in
exactly one place — `lib/release/routing.ts:51-60`'s `resolveReleaseRouting`. The wrapper
itself doesn't read it (confirmed via grep across `audit-log.ts`, `interlock-validation.ts`).
ADR-017 line 116 says it explicitly: "**`arc.release.enabled` is observability and routing
substrate, not a wrapper kill-switch.**" The flag is a signifier (record of opt-in for routing
decisions), not an enabler. "Enabled" implies an action / switch; the flag is declarative
state. That's the source of the "feature switch" misread.

**Convergence on per-dev-only for four keys.** Three interlocks (`session.commit_interlock`,
`session.push_interlock`, `session.sync_interlock`): no team-coordination value (interlocks
control when the agent prompts the local developer; they have zero effect on what lands in the
repo, what reviewers see, or what CI runs); per-dev only. `release.enabled`: per-developer
harness setup (allowlist install, trust-model acceptance) is the actual gating mechanism;
project-level value is mechanically inert without per-dev setup, and pushing it onto
unconfigured contributors violates ADR-017's trust-shift acknowledgment principle; per-dev
only. Net result: dual-scope architecture collapses from five keys to one (`user.notes_push`).

**`user.notes_push` deferral rationale.** `team.mode` flips notes_push default (solo:
`on-sync`, team: `prompt`). That coupling makes notes_push slightly more team-policy than the
other four — there's a coordination story even if it's thin. Decision: leave as the lone
remaining dual-scope key; document the deferral in the ADR-017 amendment so a later pass can
revisit if the coupling proves uncompelling on closer examination.

**Naming convergence on `releaseOptedIn`.** Three candidates weighed after the rename was
agreed on: `release.canonical` (matches existing comment language "Wrappers canonical for
commit/push" but "canonical" implies a contest/alternative which is weak fit at the per-dev
layer where there's no comparison axis); `release.useWrapper` (action-oriented — tells agents
what to do — but reintroduces the switch-confusion risk because it reads as "this name LOOKS
like the thing that does the enabling"); `release.releaseOptedIn` (matches existing codebase
language: `arc release opt-in` / `opt-out` commands; declarative `is`-framing avoids switch
confusion; captures signifier semantics). The third won because the switch-confusion risk on
`useWrapper` outweighed the extra meaning carried by including "wrapper" in the name —
docstrings and inline comments cover the meaning concern.

**ADR-017 amendment relationship.** ADR-017 framed `arc.release.enabled` as adopter (project)
opt-in to trust-model trade-off — the "adopter" framing was project-level because at ADR
write-time there was no per-developer setup path. WU2 added per-dev setup precisely because
the trust model lives per-harness, per-machine. The amendment in 6.R.1.b captures: the
trust-model decision stands (no supersession); the scope clarification is that opt-in lives
where the trust model lives (per-developer git-config). Yaml surface collapses; rename to
`releaseOptedIn`. Distinct from any Phase 7 ADR-017 amendment that may surface from
integration-time insights — both can land as separate amendments.

**Process discipline note.** Phase 6.R was generated via the `2_generate-tasks.md` workflow's
three-pass discipline (skeleton → bodies → grounding audit) explicitly, even though the
workflow's typical use is fresh task-list generation. The audit pass surfaced six
fix-before-starting findings that landed as task-body edits before the file save (test-scope
expansion across four test files vs. just resolver tests was the most substantive); five
carry-as-context findings routed inline as `_Note:_` peer descriptors or to this notes file.

**Forward note for executors.** The numbering scheme `6.R.1`, `6.R.2`, ... establishes
parent-task numbering inside an `X.R` phase as a precedent — `strategy-task-list-formatting.md`
documents `X.R` as the phase identifier and `X.R.a` as children-of-revision-items but doesn't
explicitly cover parent-task numbering inside a full R phase. Worth capturing the precedent in
the strategy doc as a small atomic later if it recurs.

---

[sst/opencode#6676]: https://github.com/sst/opencode/issues/6676
[sst/opencode#15507]: https://github.com/sst/opencode/issues/15507
