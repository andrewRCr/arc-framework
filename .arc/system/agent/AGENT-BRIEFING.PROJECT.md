# AGENT-BRIEFING.PROJECT.md — Project Orientation for Agents

## Project Overview

ARC is a development methodology for human-AI collaboration. It structures how a developer and
an AI agent work together through implementation — planning, executing, verifying, and preserving
context across work sessions. The ARC Framework implements this methodology as documentation —
workflows, templates, strategies, and constitutional documents — that lives in `.arc/`.

**Project Type**: Solo framework development with public release goals
**Primary Goal**: Deliver a coherent, configurable methodology — 11 non-negotiable principles
with strong default conventions that teams adapt to their context

## Project Snapshot

**Technology Stack:**

- **Framework Type**: Documentation system + TypeScript CLI package
- **CLI Package**: `packages/arc-framework/` — TypeScript, tsup, vitest, Commander, ESM
- **Dependencies**: Git, Node.js (npm workspaces)
- **Quality Gates**: Markdown linting (zero-tolerance), TypeScript type checking, vitest, tsup build
- **CI**: GitHub Actions
- **Distribution**: GitHub repository with template-first documents, npm package (`@arc-framework/cli`)
- **Development Environment**: Cross-platform (Windows/WSL/Linux/Mac)

**Repository Layout:**

- `.arc/` - ARC methodology files (reference/, active/, backlog/, system/)
- `packages/arc-framework/` - CLI npm package (`@arc-framework/cli`)
- Root-level documentation (README.md, LICENSE, etc.)

## Critical Path Information

**Common Friction Points:**

- **Hybrid project**: Documentation (`.arc/`) plus TypeScript CLI (`packages/arc-framework/`)
- **All commands from repo root**: npm workspaces delegates to the CLI package automatically
- **Markdown linting is a primary quality gate**: `npm run -s lint:md`
- **Self-hosting**: Framework development follows its own ARC methodology — we are our own test case
- **Zero tolerance**: All quality gate violations must be fixed before commits
- **Commands in QUICK-REFERENCE**: All assume repo root — paths are already correct

---

_This is the project-specific entry point for AI agents. ARC framework orientation lives in
[AGENT-BRIEFING.ARC.md](AGENT-BRIEFING.ARC.md). Agent-specific guidance lives in dedicated
files (e.g., CLAUDE.ARC.md, CODEX.ARC.md)._
