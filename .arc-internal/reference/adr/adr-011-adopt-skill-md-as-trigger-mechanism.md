# ADR-011: Adopt SKILL.md as ARC's Trigger Mechanism

## Status

Accepted · Amended 2026-03-05 (governance, directory, invocation corrections) · Amended 2026-03-17 (universal-first
generation model)

## Context

ARC workflows are invoked through "trigger files" — thin dispatchers that live in agent-specific directories and point
to ARC content in `.arc/`. A user types `/resume-current` and the agent loads the session initialization workflow; the
slash command file is a two-line pointer, not the workflow itself. This trigger/content separation is deliberate: ARC
content lives in `.arc/` where it's maintained, versioned, and updated as a unit; triggers are lightweight and
agent-specific.

The problem: each AI coding tool has its own trigger format and directory convention. ARC currently maintains parallel
trigger sets — `.claude/commands/*.md` for Claude Code and `.codex/skills/*/SKILL.md` with `agents/openai.yaml`
supplements for Codex CLI. Adding support for Gemini CLI, Cursor, Copilot, Warp, or others means more parallel
directories with duplicated intent in different formats.

**Landscape convergence (early 2026):** The AI coding tool ecosystem has converged on a shared standard faster than
anticipated:

- **SKILL.md** (published December 2025 at agentskills.io, maintained by Anthropic as an open standard) defines a
  markdown file with YAML frontmatter as the standard format for AI agent skills.
- **30+ tools** now recognize SKILL.md, including Claude Code, Codex CLI, Gemini CLI, GitHub Copilot (CLI + VS Code),
  Cursor, Warp, Windsurf, Roo Code, Mistral, OpenCode, Aider, and others.
- **`.agents/skills/<name>/SKILL.md`** is the de facto universal directory convention. As of March 2026, 20+ tools scan
  it — including Codex, Cursor, Gemini CLI, GitHub Copilot, Warp, Windsurf, Amp, Cline, OpenCode, and Kimi Code CLI.
  Notable exceptions that require tool-specific directories: Claude Code (`.claude/skills/`), Augment
  (`.augment/skills/`), and Antigravity (`.agent/skills/` — singular). The agentskills.io specification defines the
  SKILL.md file format but does not mandate a directory convention.
- **Progressive disclosure** is built into the spec: frontmatter (name + description) loads at startup (~100 tokens);
  full instructions load on activation; supporting files (`scripts/`, `references/`, `assets/`) load on demand.

**Tool-specific notes:**

- **Claude Code**: Recognizes `.claude/skills/*/SKILL.md` (recommended) and `.claude/commands/*.md` (legacy, still
  works). Skills appear in the `/` slash command menu and are manually invocable as `/skill-name`. Does NOT scan
  `.agents/skills/`. Supports `disable-model-invocation` and `user-invocable` frontmatter extensions.
- **Codex CLI**: Uses `$skill-name` invocation (not `/`). Recognizes `.agents/skills/` and `.codex/skills/`.
  Supplements SKILL.md with `agents/openai.yaml` for UI metadata and invocation policy.
- **Gemini CLI**: Dual system — TOML custom commands (`.gemini/commands/*.toml`) for explicit invocation, plus
  SKILL.md agent skills. Scans `.agents/skills/` (with precedence) and `.gemini/skills/`.
- **Cursor**: Recognizes `.cursor/skills/` and `.agents/skills/`. Supports `user-invocable` and
  `disable-model-invocation` frontmatter. Skills appear in `/` menu.
- **GitHub Copilot**: Recognizes `.github/skills/` and `.agents/skills/`. Supports `user-invocable` frontmatter.
  Skills invocable as `/skill-name`.
- **Windsurf**: Recognizes `.windsurf/skills/` and `.agents/skills/` (added January 2026).
- **Amp**: Recognizes `.agents/skills/`.
- **Cline**: Recognizes `.agents/skills/`.
- **OpenCode**: Recognizes `.agents/skills/`.
- **Kimi Code CLI**: Recognizes `.agents/skills/` with workspace and home scopes.
- **Augment**: Recognizes `.augment/skills/` and `.agents/skills/` and `.claude/skills/`. Does NOT use `.agents/skills/`
  as primary — requires `.augment/skills/` for reliable discovery.
- **Antigravity**: Recognizes `.agent/skills/` (singular, no 's'). Does NOT scan `.agents/skills/`.

**Invocation control (de facto standard, not in spec):** The agentskills.io specification defines only format fields
(`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`). Two invocation-control fields have
emerged as de facto standards across Claude Code, VS Code/Copilot, and Cursor:

- `disable-model-invocation: true` — Prevents auto-loading; skill is manual-only (`/skill-name`)
- `user-invocable: false` — Hides from `/` menu; model can still auto-invoke

Both default to their permissive value (model invocation enabled, user invocation enabled). Tools that don't recognize
these fields ignore them harmlessly. ARC skills intended for explicit user invocation (arc-resume, arc-commit,
arc-handoff) use `disable-model-invocation: true` to prevent unnecessary context consumption.

**Alternatives considered:**

1. **Continue per-tool maintenance** — Keep `.claude/commands/` and `.codex/skills/` as separate manually-maintained
   sets. Low upfront cost but scales linearly with tool count. Already causing drift between trigger sets.
2. **Abstract trigger specification** — Define an ARC-specific trigger format and transpile to per-tool formats. Adds
   a compilation step and a custom format to learn. Unnecessary given SKILL.md standardization.
3. **SKILL.md as canonical + per-tool generation** — Store canonical skills in a standard location; generate
   tool-specific variants where needed. Leverages the standard directly.

## Decision

### Part 1: SKILL.md as the Standard Trigger Format

We will use SKILL.md (per the agentskills.io specification) as ARC's trigger file format. Skills are thin dispatchers
that point to ARC workflow content — they contain invocation instructions, not the workflows themselves.

ARC skills use standard frontmatter fields (`name`, `description`) and keep instructions minimal: read this file, run
this workflow. Extended frontmatter fields (Claude Code's `disable-model-invocation`, `context: fork`, etc.) are added
per-tool where needed — the spec guarantees graceful ignore by tools that don't recognize them.

**Naming convention:** Framework skills use the `arc-` prefix (`arc-resume`, `arc-handoff`, `arc-commit`). The prefix
provides namespace separation — users can immediately distinguish framework skills from project or personal skills in
autocomplete lists and directory listings. Names are action-oriented (what the user is doing), not workflow-aligned
(which internal file gets loaded). Project and personal skills use no prefix.

**Default skill set (1.0):** Three skills covering the primary user-invoked session touchpoints:

- `arc-resume` — Session initialization (start of session)
- `arc-commit` — Atomic commit with WORK-STATUS staging (during session)
- `arc-handoff` — Session handoff (end of session)

### Part 2: Skill Directory Strategy

Canonical skill definitions live in `.arc/system/skills/<skill-name>/SKILL.md` — inside the ARC directory tree,
alongside `.arc/system/agent/` (agent config) and `.arc/system/githooks/` (git hooks). This follows ARC's
consistent pattern: source of truth in `.arc/system/`, tool-specific copies generated outside.

WU3's CLI generates tool-discoverable copies during `arc init` and `arc update` based on the user's selected
tooling. Generated copies are classified as Framework (managed, auto-updated).

**Universal-first generation model (amended 2026-03-17):**

The ecosystem converged on `.agents/skills/` faster than anticipated — as of March 2026, 20+ tools scan it
natively. The original per-tool generation strategy (generating to `.cursor/skills/`, `.github/skills/`, etc.)
created unnecessary directory proliferation without meaningful benefit, since those tools also scan `.agents/skills/`.

The revised model uses two tiers:

| Tier       | Directory          | Tools served                                                           |
|------------|--------------------|------------------------------------------------------------------------|
| Universal  | `.agents/skills/`  | Amp, Cline, Codex, Cursor, Gemini CLI, Copilot, Kimi, OpenCode, Warp,  |
|            |                    | Windsurf                                                               |
| Standalone | `.claude/skills/`  | Claude Code                                                            |
| Standalone | `.augment/skills/` | Augment                                                                |
| Standalone | `.agent/skills/`   | Antigravity (singular — no 's')                                        |

**Existing directory detection:** For universal-tier tools, the generator checks for pre-existing tool-specific
skill directories before defaulting to `.agents/skills/`. If a user already has `.gemini/skills/` with their own
skills, ARC writes there — not to a new `.agents/` directory. This avoids splitting a user's skills across two
locations and respects existing project layouts. Resolution order per tool: existing native dir → existing
`.agents/skills/` → `.agents/skills/` as default. Standalone tools use fixed directories regardless of detection.

**Supplemental files:** Codex's `agents/openai.yaml` provides optional UI metadata (display names, icons,
invocation policy) — generated alongside `.agents/skills/` when Codex is among the selected tools. Gemini CLI's
`.toml` custom commands are a separate concept from skills and are not part of skill generation.

**Pre-WU3 (current state):** We maintain `.arc/system/skills/` as canonical, `.agents/skills/` as a cross-tool
copy, and `.claude/skills/` for Claude Code (the primary development tool). WU3 replaces this manual duplication
with generation.

### Part 3: Trigger/Content Separation Convention

ARC content (workflows, strategies, session state) lives in `.arc/`. Skills never duplicate that content — they are
pointers:

```markdown
---
name: arc-resume
description: Initialize and resume the active working session...
disable-model-invocation: true
---
# Resume Current
1. Read `.arc/system/agent/AGENTS.md`
2. Run `.arc/system/workflows/arc/supplemental/session-init.md`
3. Confirm readiness
```

This separation ensures:

- ARC content is maintained in one place, updated as a unit
- Skills are trivially regenerable from a template + skill name + target workflow
- No content drift between tool-specific trigger directories

### Part 4: WU3 Generation Model

WU3's CLI replaces manual trigger maintenance with generation:

- Canonical skill definitions live in `.arc/system/skills/` (deployed project) and the npm package (distribution)
- `arc init` generates tool-discoverable copies for the user's selected tools
- `arc update` regenerates when canonical definitions change
- The manifest tracks generated skills alongside other managed files
- Codex `agents/openai.yaml` generated as optional UX supplement when Codex is among the selected tools
- Tool-specific frontmatter extensions (e.g., `disable-model-invocation: true`) are added during generation

The same generation model extends to team-integrated skills that follow an integrate-skill workflow — the manifest
tracks both framework skills and integrated skills with the same update mechanics.

## Consequences

### Positive

- **Cross-tool compatibility.** A single skill definition works across 30+ tools. Adding support for a new tool
  means adding a generation target, not rewriting skills.
- **Reduced maintenance.** Eliminates manual parallel maintenance of `.claude/commands/`, `.codex/skills/`, and
  future tool directories. One canonical source, generated outputs.
- **Standards-aligned.** SKILL.md is an open standard maintained by Anthropic with broad industry adoption (30+
  tools). ARC aligns with the ecosystem rather than maintaining a custom approach.
- **Progressive disclosure.** The spec's metadata/instructions/resources layering matches ARC's thin-dispatcher
  pattern — agents load skill metadata cheaply at startup, full instructions only when activated.
- **Forward-compatible.** New tools adopting the agentskills.io standard can be supported by adding a generation
  target. Tools that scan `.agents/skills/` work immediately if that target is enabled.

### Negative

- **Directory proliferation (mitigated).** The universal-first model limits generated directories to a maximum
  of 4 (`.agents/skills/` + up to 3 standalone). Most adopters will have 1–2 directories. The canonical source
  stays in `.arc/system/skills/`; generated copies are managed artifacts.
- **Pre-WU3 transition period.** Until WU3 builds the generation system, we maintain both `.agents/skills/`
  (canonical) and `.claude/skills/` (Claude Code copy with tool-specific frontmatter). This is temporary
  duplication with a clear end date.

### Risks

- **Standard evolution.** The agentskills.io spec is young (published December 2025). Breaking changes to the
  spec would require updating canonical skills and the generator. Mitigation: 30+ adopters make breaking changes
  unlikely and well-signaled, though governance is Anthropic-maintained (not Linux Foundation — only MCP was
  donated to the Agentic AI Foundation).
- **`.agents/` adoption gaps (largely resolved).** As of March 2026, only Claude Code, Augment, and Antigravity
  require tool-specific directories. The universal-first model generates standalone copies for these tools.
  Windsurf added `.agents/skills/` support in January 2026, closing the previously noted gap.
- **Invocation control fragility.** The `disable-model-invocation` and `user-invocable` frontmatter fields are
  de facto standards across Claude Code, VS Code/Copilot, and Cursor — but not part of the agentskills.io spec.
  Tools that don't recognize these fields default to auto-loading all skills, which may cause unintended context
  consumption. ARC mitigates this by keeping skill dispatchers lightweight (~100 tokens each).

---

Context: tasks-methodology-completion.md (Task 8.4 — adopt SKILL.md as trigger mechanism)
