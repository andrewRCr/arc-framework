# Feature Backlog

**Purpose:** Organized collection of feature work ideas and plans, prioritized for future development.

**Processing:** When ready to work on an item, create a PRD in `.arc/active/feature/` and begin
the standard workflow.

---

## High Priority

*[No high-priority items — current work is captured in active work units.]*

---

## Medium Priority

### ARC Operating Modes

Expand ARC's mode architecture beyond the single tracked-Full default. Two modes under one plan:
**Lite** — lightweight mode for small, bounded projects (preserves execution discipline, drops
lifecycle ceremony; projects modeled as one evolving task list rather than a stream of work units);
**Local** — untracked ARC for constrained environments (repos the developer can't modify),
orthogonal to Lite/Full. Includes the shift-lifecycle mechanism for paused work units and
mode-aware config template scaffolding.

Plan doc: [`plan-arc-modes.md`](plan-arc-modes.md)

---

## Lower Priority / Ideas

### Pi Harness Support

Evaluate first-class support for [Pi](https://github.com/badlogic/pi-mono) — an open-source TypeScript agent harness
in the Claude Code / Codex CLI category. Categorically orthogonal to ARC (Pi is a runtime agent harness; ARC is a
process harness in `.arc/`), so coexistence already works today via agent-agnostic defaults. Explicit support is
ergonomic glue, not architectural change.

What would be required:

- **`PI.ARC.md` harness file** (sibling to `WARP.ARC.md`) — harness-level awareness, distinct from model-identity
  files like `CLAUDE.ARC.md`. A Pi user running Claude would load both, same pattern as Warp + Claude today.
  Validate in practice that Pi-hosted models still self-identify and load the model file (expected but unverified).
- **Skill packaging** — place `/arc-*` skills in Pi's discovery location (`~/.pi/agent/skills/` or `.pi/skills/`)
  with any format adaptation. If Pi adheres to an open skill standard, compatibility may be largely free.
- **CLI recognition** — `arc init --tools pi` / `arc join --tools pi` to scaffold the above.
- **Instruction-file discovery** — Pi concatenates `AGENTS.md` / `CLAUDE.md` from global+parent+CWD; session-init
  already routes the agent to the agent-specific file, so this likely needs no shim. Confirm in practice.

Out of scope: MCP (Pi excludes by design) and permission-model guidance (orthogonal to ARC, user responsibility).
Do when a real Pi user asks, or when a neighboring WU (arcd-rebrand, arc-modes) makes the extension cheap. No plan
doc until we commit to pursuing it.

### Strategy Documents on Docs Site

Consider hosting ARC strategy documents on the docs site as deep-dive wiki entries. Currently,
docs reference pages point to in-repo `.arc/reference/strategies/` files that pre-installation
readers can't access. Options: mirror selected strategies to the docs site with a sync workflow
to prevent drift, rewrite some as standalone deep-dive pages with a different audience framing
(strategies are currently written "to ourselves"), or update internal references to external
links with the docs site as sole source of truth. Some strategies may need reframing if they
shift from internal reference to public documentation. Closer to 1.0 than public beta scope.

### Post-1.0 Content Ideas

- Integration examples for common tech stacks (React, Django, data pipelines, etc.)
- Tutorial content and walkthrough materials beyond WU4 launch set
- Example project showcasing ARC adoption from scratch

These overlap with WU5 docs site scope but may exceed what ships at 1.0 launch.

---

## Completed (Reference)

Items superseded by active work units or already delivered.

- ~~Distribution & update system~~ — WU3 (`prd-cli-implementation.md`)
- ~~Public release & adoption~~ — WU4 (`plan-wu4-beta-readiness.md`), WU5 (`plan-wu5-public-release.md`)
- ~~Interactive init experience~~ — WU3 interactive init section
- ~~Auto-compact recommendation~~ — WU5 onboarding content

---

**Last reviewed:** 2026-04-23
