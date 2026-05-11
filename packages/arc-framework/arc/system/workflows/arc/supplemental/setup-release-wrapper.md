---
purpose: Engage interlock release wrappers (`arc release commit` / `arc release push`) by translating the workflow's six-element allowlist contract into the resident harness's permission surface.
audience: collaborative (human and agent)
---

# Workflow: Set Up Release Wrappers

**When to use:**

- Standalone — user invokes `arc release setup install` directly.
- Onboarding — invoked from the release-wrapper section in
  `.arc/system/workflows/arc/initial-setup/01_verify-and-configure.md`.

The workflow body is identical at both entry points; only the surrounding context differs. The actual
orchestration (idempotency surface, prompt capture, marker write, opt-in flag) lives in the
`arc release setup install` command — this workflow is the contract carrier and reference companion that
the resident agent consults while the install command drives the interactive flow.

**Related:**

- `strategy-interlock-release-wrappers.md` — trust-model framing, when-to-use guidance, per-mode value props.
- `arc release status` — posture surface for engaged release wrappers.

---

## Process

The agent participates in five steps as the install command orchestrates. Steps 1, 3, and 4 are the
agent's responsibility (detection, harness-side writes, behavioral test). Steps 2 and 5 are CLI-driven
prompts that the agent surfaces faithfully — wording, mode-conditioning, and verification gates come
from this workflow.

### Six-element contract

The workflow's spine. The agent translates these elements into the resident harness's permission idiom —
a JSON allowlist for Claude Code, Starlark `prefix_rule()` for Codex CLI, or an agent-adaptive translation
for any other harness. Reference patterns live under § Per-Harness Reference Notes; the agent-adaptive
route lives under § Agent-Adaptive Path.

1. **Canonical command shape.** Match `arc release commit` and `arc release push`. These are the only
   invocations the wrapper allowlist authorizes — `arc release status`, `arc release opt-in`, and the rest
   of the `arc release` surface stay under existing harness gates.

   Example: `arc release commit -m "<message>"` and `arc release push origin <branch>`.

2. **Prefix-match semantics.** Patterns match by command prefix plus forwarded git arguments. The
   harness's matcher unwraps shell wrappings (`bash -lc`, `zsh -lc`) before pattern matching where
   supported. Patterns must absorb forwarded git flags (`-m`, `--amend`, `--allow-empty`, etc.) without
   re-prompting.

3. **Scope.** Per-developer, per-machine. The allowlist install lives in the developer's harness
   permission surface on the current machine. Other developers and other machines re-run setup
   independently.

4. **Mode awareness.** The harness operates in one of two modes:

    - **Default-prompt** — the harness gates every Bash invocation by default. Allowlist install removes
      the per-invocation prompt for matching wrapper invocations. Both wrapper value layers materialize:
      validation + audit (unconditional) and harness-prompt bypass (conditional, default-prompt only).
    - **Bypass** — `bypassPermissions` / dangerous mode / equivalent. The harness allows bash invocations
      without prompting. Allowlist install is a no-op under bypass; opt-in records audit-validation
      acceptance only.

   Setup branches on the detected mode at every step that changes behavior — install, verify,
   acknowledgment, and recording.

5. **Side effects.** The agent edits the harness's permission surface (default-prompt only). The CLI
   writes ARC state (`arc.releaseOptedIn` git-config flag and the harness/mode marker file) when the
   workflow's verify step passes and the user confirms. No other side effects.

6. **Verification expectations.** Default-prompt mode requires a passing behavioral test before opt-in
   records (§ Step 4). Bypass mode skips the behavioral test (no harness prompt to observe) and verifies
   on agent-reported install success plus explicit user confirmation.

For paste-ready output of these elements as an abstract translation prompt, run
`arc release setup print-patterns` (no `--harness` flag).

### Step 1: Detect harness and mode

Use the three-tier confidence ladder. Halt at the first tier that resolves; drop to the next when the
current tier can't.

**Tier 1 — agent knows.** The agent operates in a reference-implementation harness (Claude Code, Codex
CLI) and recognizes the mode-detection pattern from § Per-Harness Reference Notes below. Surface the
detection clearly:

> Detected harness `<name>` in `<mode>` mode (`<pattern reference>`). Proceeding.

**Tier 2 — agent uncertain but can investigate.** Harness identity is known but the mode-config
convention isn't in immediate context. Surface the uncertainty and offer the three investigation
choices:

> I don't know harness `<name>`'s mode-config conventions off the top. Want me to check its docs,
> inspect a likely config path, or ask you directly?

User picks one. If investigation resolves to a confident answer, treat the resolution as Tier 1 and
surface the detection line. Otherwise drop to Tier 3.

**Tier 3 — user-direct.** Ask the user explicitly:

> Does your harness gate every Bash invocation by default? (default-prompt) Or does it allow without
> asking? (bypass)

Record the answer in the marker the same way as agent-detected.

### Step 2: Trust-model acknowledgment

The install command surfaces an explicit accept prompt with mode-conditioned framing — verbose text
under § Trust-Model Acknowledgment. The agent surfaces the framing faithfully (adapting voice but not
substance) and waits for an explicit user accept.

**On accept** — continue to Step 3.

**On decline** — halt. No state has been written; no rollback required. Surface that the choice can be
revisited later via standalone `arc release setup install`. When invoked from
`01_verify-and-configure.md`, return to that workflow's release-wrapper section.

### Step 3: Install (default-prompt) or skip (bypass)

**Default-prompt — write the allowlist.** Translate the six-element contract into the harness's
permission idiom and write. Reference patterns for Claude Code and Codex CLI live under § Per-Harness
Reference Notes; for any other harness, follow § Agent-Adaptive Path. After writing, re-read the file
to confirm the patterns landed at the expected key path with intact syntax.

**Bypass — skip with explanation.** No write. Surface the skip explicitly so the user understands why
the install half is a no-op:

> Bypass mode detected. Allowlist install skipped — there is no harness prompt to remove. The
> validation + audit layer is the engaged value prop; opt-in records that acceptance.

**Custom user-level hook awareness.** If the local posture includes a custom user-level hook
intercepting commits and pushes (e.g., a denylist script that prompts on `git commit` /
`git push`), surface that wrapper invocations typically pass through such denylists silently —
patterns target `git commit` / `git push`, not `arc release commit` / `arc release push`. No
hook update is required in the common case; the friction-reduction value materializes
automatically. See `strategy-interlock-release-wrappers.md` § Custom User-Level Hooks (Parallel
Layer) for the framing. Edge case (broad pattern catches wrapper, e.g., wildcard on
`arc release *`): refine the denylist to exclude wrapper subcommands.

### Step 4: Verify

**Default-prompt — mandatory behavioral test.** Invoke `arc release commit --version` directly through
the harness. The invocation must NOT be a nested CLI subprocess — nested invocations don't observe the
outer harness's permission boundary. Observe the prompt presence:

- **Pass** — no harness prompt observed. Allowlist match working. Confirm to the install command's
  verify prompt; it advances to Step 5.
- **Fail** — harness prompt observed. Allowlist mismatch (most likely cause: pattern shape or file path
  mistake). Loop back to Step 3 — surface the failure to the user, re-translate, re-write, re-read,
  re-test. Do NOT confirm verify until the behavioral test passes; the install command holds opt-in
  recording behind verify-pass.

**Bypass — agent-report + user confirmation.** Report the skip outcome from Step 3 to the install
command's verify prompt. The user confirms (or declines) to record opt-in. No behavioral test runs —
under bypass, the harness has no prompt to observe regardless of allowlist state.

The behavioral test catches a real failure class agent-report alone misses: subtle file-syntax errors
(JSON escaping, Starlark indentation, key-path mismatch) that pass agent self-read ("I wrote the file,
re-read, entry is present") but fail at the harness's matcher boundary.

### Step 5: Record state

State persistence is the install command's responsibility. On verify-pass plus user-confirm, the CLI
writes:

- The harness/mode marker entry at `.arc/user/{identity}/.internal/release-setup.json` (per-developer,
  per-machine, gitignored).
- `arc.releaseOptedIn = true` (per-developer git-config local flag) on the first successful install.
  Subsequent installs are flag-idempotent — the flag is not re-written if already set.

The agent's role ends with the verification confirmation in Step 4. Recording mechanics, idempotency
choices, and multi-harness partial-success handling live under § State-Recording Protocol.

---

## Per-Harness Reference Notes

### Claude Code

**Mode detection.** Inspect `permissions.defaultMode` in the harness settings:

- Project-scoped: `.claude/settings.json` (preferred — overrides user scope).
- User-scoped: `~/.claude/settings.json`.

Value `"bypassPermissions"` indicates bypass mode. Absent or any other value indicates default-prompt.

**Allowlist patterns.** Pattern-based; `Bash(arc release commit:*)` matches distinctly from
`Bash(git commit:*)`.

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

**Install target.** Project-scoped `.claude/settings.json` is the canonical landing point. Merge the
patterns into the existing `permissions.allow` array — do not overwrite the file. If the
`permissions.allow` key is absent, create it; if present, append the wrapper patterns without
disturbing existing entries.

For paste-ready output, run `arc release setup print-patterns --harness claude-code`.

### Codex CLI

**Mode detection.** Inspect `approval_policy` in `~/.codex/config.toml` (user-scoped) or
`.codex/config.toml` (project-scoped, in effect when the project is marked
`trust_level = "trusted"` in user config):

- `"never"` — bypass-mode equivalent. No per-invocation prompt.
- `"on-request"` — default-prompt mode. Approval requested per command.
- `"untrusted"` — conditional, per-project trust level.

Per-invocation flags (`--ask-for-approval never`, `--dangerously-bypass-approvals-and-sandbox`)
override config but represent session-scoped posture, not durable mode. Treat as transient when
detecting.

**In-session detection caveat.** Codex doesn't expose `approval_policy` to running agents via env
var or a readable session-state surface. Agents can read the config files directly, but
config-vs-flag override resolution from inside a session isn't reliable. When uncertain, drop to
Tier 3 and ask the user.

**Allowlist patterns.** Starlark `prefix_rule()` calls. Codex's Starlark loader requires keyword
arguments — `pattern` is required; `decision` defaults to `"allow"`. Positional invocation does
not work.

```python
prefix_rule(pattern=["arc", "release", "commit"])
prefix_rule(pattern=["arc", "release", "push"])
```

Codex unwraps `bash -lc` / `zsh -lc` shell wrappings via a narrow word-only grammar before
`prefix_rule` matching; if unwrapping fails, the matcher sees the literal shell binary as `cmd[0]`
and the canonical patterns cannot match.

**Install target.** Codex's user-scoped permission rules file (typically `~/.codex/rules/default.rules`).
Append the patterns; do not overwrite existing rules.

**Matcher boundary.** Verified against codex-cli 0.128.0; behavior is deterministic per input.

Reliable matches (unwrap succeeds):

- Plain positional: `arc release commit -m "fix: foo"`
- Special characters inside double quotes: `arc release commit -m "fix: foo & bar"`
- Sequences joined by `&&` or `;` where every simple command in the sequence is allowed:
  `arc release commit -m "msg" && arc release push origin main`

Predictable fall-through to harness prompt (unwrap fails):

- Environment-prefixed: `FOO=bar arc release commit ...`
- Output-redirected: `arc release commit ... > out`
- Command-substituted: `arc release commit -m $(date)` or `-m "$(printf 'subj\nbody')"`
- ANSI-C `$'...'` quoted: `arc release commit -m $'subj\nbody'`

Surface the matcher grammar to the user when relevant; agent-issued invocations follow the supported
word-only shape by convention.

For paste-ready output, run `arc release setup print-patterns --harness codex`.

---

## Agent-Adaptive Path

For any harness outside the reference-implementation set (Claude Code, Codex CLI), the agent translates
the six-element contract against the harness's own conventions. See
`strategy-interlock-release-wrappers.md` § Agent-Adaptive Path for the architectural framing
(workflow-as-contract, universal-route positioning).

**Procedure:**

1. Read the harness's permission/allowlist configuration. Path discovery: agent's prior knowledge →
   harness docs → user-pointed if needed.
2. Translate the six contract elements into the harness's pattern idiom. Preserve the prefix-match
   semantics and the canonical `arc release commit` / `arc release push` shapes.
3. Write the translated patterns to the appropriate config path.
4. Re-read the file to confirm the patterns landed.
5. Run the behavioral test (Step 4) under default-prompt mode. Skip under bypass.

Run `arc release setup print-patterns` (no `--harness` flag) for the abstract contract output to feed
translation.

### opencode caveat

opencode adopters use the agent-adaptive path with two documented limitations:

- [sst/opencode#6676] — flag-parsing bug may cause `arc release commit -m "..."` to not match patterns
  reliably.
- [sst/opencode#15507] — silent config-validation failure: typos in opencode permission keys are ignored
  without error.

The wrapper itself works regardless; allowlist install via the agent-adaptive path proceeds with these
caveats surfaced to the user before the trust-model acknowledgment. A polished convenience-helper
formatter for opencode lands when upstream resolves; the agent-adaptive path is available immediately.

---

## Trust-Model Acknowledgment

The reference framings below are mode-conditioned. Adapt to the surrounding voice; preserve the
substance — the trust-model trade-off the user is accepting, the disable path, and the explicit accept
prompt.

### Default-prompt mode (trust-shift)

> Installing the release-wrapper allowlist removes your harness's per-invocation prompt for
> `arc release commit` and `arc release push` invocations. ARC's interlock layer becomes the canonical
> authorization point for these commits and pushes. Other git invocations (raw `git commit`,
> `git push`) continue to prompt as before; nothing else changes.
>
> The release wrapper enforces interlock state, refuses destructive flags, and audits every invocation
> regardless of opt-in. Opt-in records your acceptance that ARC's enforcement is the review surface for
> matching invocations rather than the harness prompt.
>
> You can disable any time via `arc release setup uninstall`. Do you accept this trust shift?

### Bypass mode (audit-only)

> Your harness is in bypass mode (no per-invocation prompt). Installing the release-wrapper allowlist
> would be a no-op — there's no harness prompt to skip. Skipping that step.
>
> Opt-in still records your decision to engage the wrapper's validation + audit layer as a layered
> protection above any custom user-level hooks you've installed. The wrapper validates interlock state,
> refuses destructive flags, and audits every invocation. Under bypass mode this layer is your primary
> review surface for `arc release commit` / `arc release push`.
>
> Other git invocations remain governed by whatever custom user-level hooks you've installed (if any).
> The two layers compose without conflict.
>
> You can disable any time via `arc release setup uninstall`. Do you accept this opt-in?

---

## State-Recording Protocol

The install command writes state on workflow verify-pass plus user-confirm. Agents do not write the
marker file directly; orchestration is centralized in the CLI.

**Marker file** — `.arc/user/{identity}/.internal/release-setup.json`. Schema v1:

```json
{
  "schemaVersion": 1,
  "harnesses": [
    { "name": "claude-code", "mode": "default-prompt", "installedAt": "<ISO-8601 UTC>" }
  ]
}
```

Fields: `name` is free-form (reference-implementation values are `"claude-code"` and `"codex"`;
agent-adaptive harnesses use whatever name agent and user agreed on at install). `mode` is one of
`"default-prompt"` | `"bypass"`. `installedAt` is ISO-8601 UTC.

**Opt-in flag** — `arc.releaseOptedIn` (per-developer git-config local). Set to `true` on the first
successful install. The flag is idempotent: subsequent successful installs do not re-write it.

### Idempotency: four-way choice

When `arc release setup install` runs against an existing opt-in, the CLI surfaces current state
(detected harnesses, modes, last-install timestamp) and offers four choices:

- **Re-verify** — rerun the workflow's verify path against existing marker entries. Behavioral test
  under default-prompt happens as a direct outer-harness invocation, not a nested subprocess.
  `installedAt` refreshes only after workflow-confirmed success.
- **Update markers** — re-detect modes for already-installed harnesses through Step 1's mode-detection
  ladder. Useful when a developer flipped mode (e.g., default-prompt → bypass) on this machine since
  install.
- **Add harness** — run the install flow (Steps 1–5) only for harnesses not yet in the marker. Existing
  harness entries remain untouched.
- **Exit** — no-op acknowledged. No state written or changed.

Selecting `exit` is equivalent to declining the trust-model acknowledgment in Step 2 — no rollback is
required because no new state was written.

### Multi-harness partial success

When a multi-harness install run fails for one harness after another succeeded, the install command
surfaces the failure point and offers a user-choice prompt: record opt-in for verified harnesses only,
retry the failed harness, or abort entirely. The CLI does not auto-record opt-in without explicit user
acceptance of partial coverage.

---

## Rollback Protocol

To remove a harness's release-wrapper integration, run:

```bash
arc release setup uninstall --harness <name>
```

The workflow drives the rollback. Per-harness behavior:

1. Agent removes the harness-side allowlist entries — matched by exact pattern set (canonical patterns
   from `arc release setup print-patterns --harness <name>`). Conservative cleanup: refuse to touch
   user-curated entries that drift from the canonical pattern set, and surface the drift for manual
   cleanup.
2. CLI removes the harness's marker entry from `.arc/user/{identity}/.internal/release-setup.json`.
3. CLI records `arc.releaseOptedIn = false` only when removing the last marker entry — uninstalls that
   leave sibling harnesses preserve the existing opt-in flag (symmetric with the install-side
   set-on-first-install behavior).

Rollback is idempotent. Running uninstall against a harness already absent from the marker is a no-op
with explanatory output.

When the marker `harnesses` array becomes empty post-uninstall, the file remains as
`{ "schemaVersion": 1, "harnesses": [] }` — the schema-version anchor preserves the clean-slate signal
for future reads.

---

## Next Step

- **Standalone invocation:** Run `arc release status` to confirm the engaged posture surface.
- **Invoked from `01_verify-and-configure.md`:** Return to the calling workflow's release-wrapper
  section.

---

[sst/opencode#6676]: https://github.com/sst/opencode/issues/6676
[sst/opencode#15507]: https://github.com/sst/opencode/issues/15507
