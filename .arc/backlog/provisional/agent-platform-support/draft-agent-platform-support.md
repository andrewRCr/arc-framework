# Draft: Agent-Platform Support

- **Origin:** [internal] — two agent-platform concerns routed from `BACKLOG-INBOX` at the work-routing-discipline
  retirement pass (2026-06-01): first-class harness support (Pi + opencode) and cross-platform compatibility
  testing. Grouped because you validate the harnesses you support — onboarding and validation are two facets of
  one concern.
- **Purpose:** Give ARC explicit, ergonomic support for the agent harnesses it targets first-class, and a
  validation layer that confirms consistent behavior across the supported harness family.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Compose worktree harness-dir registration with harness/tool selection**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: agent-platform-support`), housekeep drain (2026-07-07);
  captured during `finalize-parallelism` Task 2.1.b review, 2026-07-04.
- *Concern:* FP added `worktree.harness_dirs` as the immediate copy-from-primary registration list for fresh
  worktrees. ARC already has rough per-developer harness/tool awareness via `arc.tools`, init/join/reconfigure skill
  generation, `detectExistingSkillDirs`, and the add-agent / verify-and-configure surfaces. When this WU overhauls
  that model, decide how the final harness registry composes with `worktree.harness_dirs`: whether the copy list
  remains explicit config, derives from selected/detected harnesses, or is reconciled by an add-agent / installer
  workflow.
- *Approach:* Preserve FP's universal default and zero-per-harness copy behavior for the current flip, but route the
  longer-term regeneration / registration design into the same per-harness skill-generation and installer planning
  seam already named in this draft.

### `[ ]` **Cover editor config (`.zed/`) in worktree provisioning, or make it unnecessary**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: finalize-parallelism` — **re-homed here at drain**: this is
  the same `worktree.harness_dirs` / harness-registry composition concern above, and keeping it off FP avoids
  expanding the throughput-critical WU), housekeep drain (2026-07-07); captured during session-init tooling
  diagnosis of Zed markdown warnings in the FP worktree, 2026-07-05.
- *Concern:* FP's `worktree.harness_dirs` copies agent-harness dirs (`.claude/`, `.codex/`, `.gemini/`) into a
  spawned worktree, but not editor config like `.zed/`. The repo's markdownlint LSP overrides currently live only in
  gitignored `.zed/settings.json`, so a spawned worktree lints markdown with stock defaults and floods standard ARC
  surfaces with MD013/MD007 noise. A DX papercut, not a quality-gate blocker (`npm run -s lint:md` works fine).
- *Approach:* decide the durable shape — add `.zed/` (an editor-config class) to the default `worktree.harness_dirs`,
  and/or rely on the LSP-parseability errand (executed in this same housekeep batch — makes the tracked lint config
  LSP-parseable), which removes the lint-specific need to copy `.zed/` at all and leaves editor-copy for genuinely
  un-trackable prefs. Reconcile with the harness-registry composition entry above.

### `[ ]` **Reframe the init-recipe `tools` prompt as harness/tooling, not agent selection**

- *Routed from:* `ATOMIC-INBOX`, shared-inbox sweep (2026-06-02).
- *Concern:* `init-recipe.json` lists ~14 tool options (amp, cline, codex, cursor, gemini, copilot, kimi,
  opencode, warp, windsurf, antigravity, augment, claude). Now that per-agent file scaffolding
  (`{AGENT}.ARC.md`) is retired, this prompt no longer drives file generation — its remaining role is signaling
  where/how to generate `arc-*` skill files for the user's harness (via `detectExistingSkillDirs`). The "tools"
  framing reads as agent-selection, but the substantive use is harness-tooling.
- *Proposed:* rephrase the prompt label/help to surface harness-choice semantics ("Which AI harness/tooling do
  you use?"); audit the list (drop dead entries, add missing); keep universal-skill-dir detection aligned;
  verify docs cross-references to "tools" still read coherently.
- *Architectural angle:* weigh an agent-driven self-scaffold path (precedent: the `add-agent.md` workflow
  handles post-init tool addition) over CLI-prompt-driven recording, with the recipe options demoted to a
  "supported examples" set rather than the menu. The list/language refresh is needed either way; the
  architectural choice is the deferred decision. Composes with this WU's `arc init --tools {pi,opencode}`
  recognition scope.
- *Scope:* small for the rename; medium if the self-scaffold path is taken.

### `[ ]` **Gate `arc-recover` skill installation per-harness / opt-in**

- *Routed from:* `compaction-recovery` create-spec coordination (2026-06-28).
- *Concern:* `compaction-recovery` ships an `arc-recover` skill (the manual recovery fallback). Installed
  unconditionally, it lands in every harness's skill registry — including CC/Codex users who recover via the hook
  path and never invoke it manually. Unwanted registry clutter for the majority hook-path case.
- *Proposed:* gate `arc-recover` generation on harness / opt-in at `arc init` / `arc join` — the per-harness
  skill-generation surface this WU owns (`detectExistingSkillDirs` + the tools/harness prompt reframe above).
  Compose with that reframe rather than treating it separately. `compaction-recovery`'s MVP ships it by default;
  this WU decides the gate.
- *Home note:* routed here (owns per-harness skill generation + init/join harness selection).
  `skill-infrastructure-cleanup` (skill-inventory placement) is the adjacent home.
- *Scope:* small (one generation gate, composes with the prompt reframe).

### `[ ]` **Evaluate CLI-managed installers for harness recovery hooks and git-hook setup**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: agent-platform-support`), housekeep drain (2026-06-30);
  captured during `compaction-recovery` Task 5.3 close / handoff.
- *Concern:* `compaction-recovery` added an agent-driven opt-in path for Claude Code / Codex compaction recovery
  hooks, while release wrappers already have `arc release setup install` and ARC git hooks use setup/reconfigure
  mechanics. The asymmetry may be right, but it leaves a recurring question: should harness config writes and
  git-hook integration have a first-class CLI installer instead of living only as workflow prose?
- *Approach:* in this WU, evaluate whether per-harness hook recipes, `arc-recover` skill gating, and add-agent /
  join flows want a shared CLI install / uninstall / status surface. Split or cross-link the git-hook portion to
  `quality-gate-hooks` if the concern belongs to hook-tier setup rather than agent-platform installation.

---

## Scope (routed captures — iterate into a plan)

### First-class harness support: Pi + opencode

Pi and opencode are open-source TypeScript agent harnesses in the Claude Code / Codex CLI category. These two are
the targets for **first-class** ARC harness support alongside the existing Codex CLI / Claude Code; every other
harness stays implicitly supported through agent-agnostic defaults. Both are categorically orthogonal to ARC
(they are runtime agent harnesses; ARC is a process harness in `.arc/`), so coexistence already works via those
defaults. Explicit support is ergonomic glue, not architectural change.

- **Per harness, a `{HARNESS}.ARC.md` file** — sibling to `WARP.ARC.md`, distinct from model-identity files like
  `CLAUDE.ARC.md`: `PI.ARC.md` and `OPENCODE.ARC.md`.
- **Skill packaging at each harness's discovery location** — Pi: `~/.pi/agent/skills/` or `.pi/skills/`;
  opencode: confirm its skill / plugin discovery path. Include any format adaptation.
- **`arc init` / `arc join` recognition** — `--tools {pi,opencode}`.
- **Instruction-file discovery, verified in practice** — Pi concatenates `AGENTS.md` / `CLAUDE.md` from
  global+parent+CWD; opencode reads `AGENTS.md`. Confirm whether either needs a shim.
- **Out of scope:** MCP (Pi excludes by design), permission-model guidance (user responsibility).

### Cross-platform compatibility testing

ARC claims agent-agnosticism but isn't tested across platforms. ADR-003 assesses agent-agnosticism; this is the
validation layer. A cross-platform compatibility matrix across the Claude / Codex / Gemini / Warp family (plus
Pi / opencode as they gain first-class support, and others as the ecosystem evolves) validates consistent
behavior for session-init, handoff, workflow execution, and skill invocation across harnesses.

- **Open shape:** whether the matrix ships as an automated test harness, a documented validation checklist run
  per release, or a hybrid. Resolve at PRD.

## Scope Estimate

Small–Medium per harness for support glue; Medium for the compatibility matrix depending on automation depth.
Post-1.0; demand-gated — pursue when a real Pi/opencode user asks or a neighboring WU (rebrand, operating-modes)
makes the harness-file + skill-packaging extension cheap.
