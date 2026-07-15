# Draft: grok-compaction-recovery

- **Origin:** [internal] — 2026-07-15 Grok Build evaluation smoke test (self-hosting repo)
- **Purpose:** Grok Build (xAI CLI/TUI) runs native conversation compaction but ARC's compaction-recovery path
  never fires under it — no seed write, no post-compact inject — so `arc recover` reports seed-missing after
  `/compact`. Add a first-class Grok harness adapter parallel to the Claude Code and Codex CLI ones, after
  probing Grok's real hook I/O rather than assuming Claude-compat semantics hold.

---

## Problem / Motivation

Grok Build inherits substantial Claude Code compatibility — it loads `.claude/skills/arc-*`, `AGENTS.md` /
`CLAUDE.md`, and registers hooks from `.claude/settings.json` — but that compatibility is partial in ways that
break ARC's compaction recovery specifically. A Grok session that compacts loses ARC session context with no
seed to recover from: the native Grok summary survives, but the ARC probe state, session-recover routing, and
recovery banner do not. As Grok joins Claude Code and Codex CLI in day-to-day evaluation, every compaction in a
Grok session is a silent context-integrity hole.

### Evidence — 2026-07-15 smoke test

**Verified in-repo (independently re-checked at grooming):**

- The project PreCompact hook in `.claude/settings.json` uses the `"command": "bash"` + `"args": ["-lc", ...]`
  two-field shape; the SessionStart(compact) inject hook uses the same shape. (A user-level PreToolUse safety
  gate that *does* fire under Grok reportedly uses a single-string `command` — a plausible discriminator.)
- `pre-compact-seed.mjs` harness fork: `ARC_HOOK_HARNESS` is authoritative; any value other than `claude-code`
  — or an unset value without `CLAUDE_PROJECT_DIR` — takes the **Codex marker path** (`isCodexHarness()`), so a
  Grok-tagged invocation today would mint Codex pending markers nothing under Grok consumes. There is no `grok`
  branch.
- Harness-adapter inventory (`.arc/system/.internal/harness-hooks/`): `claude-code/compaction-recovery.settings.json`,
  `codex-cli/hooks.json`, `codex-cli/features.config.toml`, and `common/` scripts (`pre-compact-seed.mjs`,
  `session-start-compact.mjs`, `post-tool-use-recover.mjs`, `user-prompt-recover.mjs`, `codex-recovery-marker.mjs`,
  `clear-codex-recovery-pending.mjs`). All are listed in `packages/arc-framework/init-recipe.json` and mirrored in
  the package source (two-copy discipline applies).

**Reported by the Grok-side smoke test (plausible, not independently verified — re-verify in-WU):**

- `grok inspect --json` shows the project PreCompact hook loaded from `.claude/settings.json`, vendor `claude`,
  `compatibilityStatus: enabled`, project trusted — registered but not effective.
- PreToolUse (safety gate) fires under Grok (matcher `Bash` → `run_terminal_command`), so hook execution as such
  works.
- A live Grok `/compact` produced a native compaction segment (`~/.grok/sessions/.../compaction/segment_000.md`)
  but **no** fresh `.arc/user/{identity}/.internal/compaction-seed.json`; `arc recover audit` returned
  stop / seed-missing (ENOENT); no ARC recovery inject reached the post-compact session.

Net: Grok's native compact works and Grok executes *some* Claude-shaped hooks, but the ARC PreCompact seed (and
therefore everything downstream of it) never runs. Registered ≠ effective.

## Unknowns and Assumptions

Failure-cause hypotheses — more than one may hold; the WU's first phase is a probe pass, not a fix:

1. **`command` + `args` shape dropped.** The failing PreCompact hook uses `command` + `args`; the firing
   PreToolUse gate uses a single-string `command`. Grok may execute only single-string commands and silently
   no-op the `args` form. Cheapest probe: register a trivial single-string PreCompact hook and compact.
2. **Matcher mismatch.** The PreCompact matcher `manual|auto` may not match whatever subject Grok's compact
   trigger emits.
3. **Event pipeline gap.** Grok's native compact may never emit a Claude-compat PreCompact event at all, even
   though `inspect` lists the registration.
4. **Inject channel absent.** Claude's inject rides `SessionStart(compact)` stdout `additionalContext`; under
   Grok that channel is unlikely (compact ≠ session start, and stdout handling is unverified). The inject needs
   its own verified channel — PostCompact if Grok has one, else whatever event proves out.

Assumptions to hold or falsify:

- Grok exposes *some* hook event around compaction that a project-level config can reach (if not, the WU's shape
  changes materially — e.g. polling/marker fallback à la Codex — and the draft should be re-groomed).
- Grok should get the **Claude-shaped model** (PreCompact-time seed + post-compact inject), not the Codex
  fallback (pending marker + PostToolUse / UserPromptSubmit) — Codex's shape exists because Codex lacks the
  direct events; don't pretend Grok is Codex unless the probes force it.
- Auto-compact (if Grok has it) should be covered by the same hook registration; verify, don't assume.

## Target direction

Not settled implementation — the probe results pick among these; recorded so the eventual spec starts from the
composed shape, not from scratch.

1. **Probe phase first:** establish Grok's real hook I/O — which events fire around compact, matcher subject,
   `command`-vs-`args` handling, stdin payload shape (`session_id`?), stdout handling. Document as a small smoke
   matrix in the WU's notes.

   **Probe methodology — evidence on disk, Grok as vehicle not witness.** The probe hooks are tiny logger
   scripts that append event name, argv, full stdin payload, and relevant env to a probe log the moment they
   fire, registered in the shapes under test (single-string `command` vs. `command`+`args`, matcher variants,
   PreCompact / PostCompact / SessionStart). The WU session authors the instrumented configs and reads the log;
   throwaway Grok sessions are driven manually through `/compact` (a compacting session is structurally the
   worst witness to its own compaction, and "registered ≠ effective" is precisely the self-model divergence
   under investigation — never accept Grok self-report as the evidence of record). `grok inspect --json` needs
   no live session — run it from the WU session directly. One probe cell checks whether Grok has a
   headless/scripted mode, which would make the acceptance smoke repeatable. The single cell where the Grok
   session *is* the legitimate witness: whether the recovery inject actually reached the post-compact agent's
   context.
2. **Explicit `grok` harness branch** in `pre-compact-seed.mjs` (and the inject script as needed):
   `ARC_HOOK_HARNESS=grok` → seed write **without** Codex pending markers; inject via the verified Grok channel.
   Never reach the Codex marker path.
3. **`harness-hooks/grok/` adapter config** (e.g. `hooks.json` or whatever Grok consumes) — prefer single-string
   commands given hypothesis 1.
4. **Install story parallel to Claude/Codex:** wire `packages/arc-framework/init-recipe.json`, the setup workflow
   (`01_verify-and-configure.md` merge instructions), the package two-copy mirror, and short adopter-facing docs.
5. **Acceptance smoke:** throwaway Grok session → `/compact` → fresh seed (new `emittedAt`) → `arc recover audit`
   ready → agent sees the ARC recovery banner; Claude Code and Codex CLI paths byte-unchanged in behavior.

**Success signal:** after `/compact` in a Grok Build session, `arc recover audit --json` is not seed-missing and
the post-compact agent receives the ARC recovery instruction — with Claude/Codex recovery behavior unchanged.

## Alternatives

- **Do nothing / rely on Grok's native summary:** rejected — the native summary preserves conversation gist, not
  ARC probe state or recovery routing; `arc recover` stays broken and the gap is silent.
- **Reuse the Codex fallback path for Grok (marker + reader hooks):** rejected as the default — Grok's
  Claude-compat layer suggests direct events are available; the Codex shape is a fallback for a harness without
  them. Falls back in only if the probe phase proves the direct events unusable.
- **Seed-only one-liner + manual `arc recover` (extended-errand scope, no install story):** rejected — "done
  properly" includes the adopter install surface (recipe, setup workflow, two-copy sync, docs), which is exactly
  what lifts this above the errand floor.

## Scope Estimate

**Small–Medium** (a probe session + a bounded adapter/config/docs pass). `Class: Light` — the design composes
from the existing Claude/Codex adapter patterns; the probe phase is investigation, not invention.

- **Depends On:** none hard. Deliberately parked under the FP-first pause — not FP-critical, claims no burn-in
  wave membership; schedule post-FP or at a deliberate Grok dogfooding push.
- **Out of scope:** the Grok safety-gate / permissions adapter (owned in dotfiles-ai); release-wrapper behavior
  under Grok (verified working); replacing Grok's native compact summary; full "Grok as first-class ARC harness"
  beyond compaction recovery (a clean follow-on WU if wanted).
- **Two-copy discipline:** all `harness-hooks` edits land in `packages/arc-framework/arc/system/.internal/` as
  the authoritative source and sync to `.arc/`.
