# ADR-011: Adopt SKILL.md as ARC's Trigger Mechanism

## Status

Accepted

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

- **SKILL.md** (published December 2025 at agentskills.io, governed by the Agentic AI Foundation under the Linux
  Foundation) defines a markdown file with YAML frontmatter as the standard format for AI agent skills.
- **26+ tools** now recognize SKILL.md, including Claude Code, Codex CLI, Gemini CLI, GitHub Copilot (CLI + VS Code),
  Cursor, Warp, Windsurf, Roo Code, Mistral, OpenCode, Aider, and others.
- **`.agents/skills/<name>/SKILL.md`** is emerging as the cross-tool neutral directory. Most tools scan it alongside
  their own directory (`.claude/skills/`, `.github/skills/`, `.gemini/skills/`, etc.).
- **Progressive disclosure** is built into the spec: frontmatter (name + description) loads at startup (~100 tokens);
  full instructions load on activation; supporting files (`scripts/`, `references/`, `assets/`) load on demand.

**Tool-specific notes:**

- **Claude Code**: Recognizes both `.claude/commands/*.md` (legacy) and `.claude/skills/*/SKILL.md`. The UI now reports
  "skill was successfully loaded" for both. Skills are the recommended path; commands remain supported.
- **Codex CLI**: Uses `$skill-name` invocation (not `/`). Recognizes `.agents/skills/` and `.codex/skills/`.
  Supplements SKILL.md with `agents/openai.yaml` for UI metadata and invocation policy.
- **Gemini CLI**: Dual system — TOML custom commands (`.gemini/commands/*.toml`) for explicit invocation, plus
  SKILL.md agent skills for natural-language triggering. Recognizes `.agents/skills/`.
- **Cursor**: Custom commands via `.cursor/commands/*.md`. Does not yet scan `.agents/skills/` natively but supports
  agent skills through its extension system.
- **Copilot**: Recognizes `.github/skills/` and `.agents/skills/`. Recent addition (December 2025).

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

### Part 2: `.agents/skills/` as the Canonical Directory

Canonical skill files live in `.agents/skills/<skill-name>/SKILL.md` — the cross-tool standard location recognized by
the broadest set of tools. This is the single source of truth.

For tools that do not yet scan `.agents/skills/`, WU3's CLI generates copies in tool-specific directories
(`.claude/skills/`, `.github/skills/`, `.gemini/skills/`, `.cursor/commands/`, etc.) during `arc init` and
`arc update`. The generated copies are classified as Framework (managed, auto-updated).

**Pre-WU3 (current state):** We maintain `.agents/skills/` as canonical alongside `.claude/commands/` as a legacy
directory. The legacy files will be consolidated by WU3's generation step.

### Part 3: Trigger/Content Separation Convention

ARC content (workflows, strategies, session state) lives in `.arc/`. Skills never duplicate that content — they are
pointers:

```markdown
---
name: resume-current
description: Initialize and resume the active working session...
---
# Resume Current
1. Read `.arc-internal/system/agent/AGENTS.md`
2. Run `.arc-internal/system/workflows/arc/supplemental/session-init.md`
3. Confirm readiness
```

This separation ensures:

- ARC content is maintained in one place, updated as a unit
- Skills are trivially regenerable from a template + skill name + target workflow
- No content drift between tool-specific trigger directories

### Part 4: WU3 Generation Model

WU3's CLI replaces manual trigger maintenance with generation:

- Canonical skill definitions live in the framework package (source of truth)
- `arc init` generates skills for the user's selected tools (`.claude/skills/`, `.agents/skills/`, etc.)
- `arc update` regenerates when skill definitions change
- The manifest tracks generated skills alongside other managed files
- Tool-specific supplements (Codex `agents/openai.yaml`, Gemini `.toml` commands) are generated as needed

The same generation model extends to team-integrated skills that follow an integrate-skill workflow — the manifest
tracks both framework skills and integrated skills with the same update mechanics.

## Consequences

### Positive

- **Cross-tool compatibility.** A single skill definition works across 26+ tools. Adding support for a new tool
  means adding a generation target, not rewriting skills.
- **Reduced maintenance.** Eliminates manual parallel maintenance of `.claude/commands/`, `.codex/skills/`, and
  future tool directories. One canonical source, generated outputs.
- **Standards-aligned.** SKILL.md is an open standard with Linux Foundation governance and broad industry adoption.
  ARC aligns with the ecosystem rather than maintaining a custom approach.
- **Progressive disclosure.** The spec's metadata/instructions/resources layering matches ARC's thin-dispatcher
  pattern — agents load skill metadata cheaply at startup, full instructions only when activated.
- **Forward-compatible.** New tools adopting the agentskills.io standard will work with ARC skills automatically
  via `.agents/skills/`.

### Negative

- **Directory sorting.** `.agents/` sorts above `.arc/` in file explorers. `.arc/` is the daily workspace;
  `.agents/` is set-and-forget. The visual adjacency is an annoyance, not a blocker — the directories serve
  different attention levels.
- **Pre-WU3 transition period.** Until WU3 builds the generation system, we maintain both `.agents/skills/`
  (canonical) and `.claude/commands/` (legacy for Claude Code backward compatibility). This is temporary
  duplication with a clear end date.
- **Tool-specific supplements.** Some tools require additional metadata beyond SKILL.md (Codex's
  `agents/openai.yaml`, Gemini's TOML commands). The generation model handles this, but it means the generator
  isn't purely "copy SKILL.md to N directories."

### Risks

- **Standard evolution.** The agentskills.io spec is young (published December 2025). Breaking changes to the
  spec would require updating canonical skills and the generator. Mitigation: the spec is governed by the Linux
  Foundation with 26+ adopters — breaking changes are unlikely and would be well-signaled.
- **`.agents/` adoption gaps.** Not all tools scan `.agents/skills/` yet (Cursor being the notable gap). The
  generation model covers this by producing tool-specific copies, but it means `.agents/` alone is not
  sufficient today.

---

Context: tasks-methodology-completion.md (Task 8.4 — adopt SKILL.md as trigger mechanism)
