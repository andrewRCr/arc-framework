# ARC Framework Technical Overview

This document outlines the technical architecture of the ARC Framework — the technology choices,
component structure, and infrastructure that shape how the project is built and maintained.
Both human contributors and AI agents reference this to make decisions consistent with the
architecture.

## 1. Overview

The ARC Framework is a development methodology for human-AI collaboration, delivered as documentation
and a CLI tool. The methodology is expressed as workflows, templates, strategies, and constitutional
documents. The CLI (`@arc-framework/cli`) manages installation, configuration, and updates of these
files in adopter projects.

**Key characteristics:**

- **Hybrid project** — Documentation system (`.arc/`) plus TypeScript CLI (`packages/arc-framework/`)
- **Template-first** — Rich, copy-ready documents with inline guidance and framework defaults
- **Self-hosting** — Framework development follows its own ARC methodology
- **Configurable conventions** — 11 non-negotiable principles with strong defaults that teams
  adapt via `arc-config.yml`, `arc-methods.md`, and `arc-extensions.md`

## 2. Architecture Components

### Deployable Template System (`.arc/`)

The adopter-facing framework — everything here ships to users and is designed to be copied,
customized, and committed to their repositories.

- **Constitution** (`reference/constitution/`) — Core project templates: META-PRD, DEV-RULES,
  PROJECT-STATUS, TECHNICAL-OVERVIEW
- **Strategies** (`reference/strategies/`) — Codified pattern guidance indexed by
  STRATEGY-INDEX.md. `arc/` strategies ship with framework; `project/` strategies are
  team-created
- **ADRs** (`reference/adr/`) — Architecture decision records
- **Research** (`reference/research/`) — Technical research with lasting reference value
- **Archive** (`reference/archive/`) — Completed work by category, quarterly as volume grows
- **Workflows** (`system/workflows/`) — Numbered lifecycle workflows (create-prd →
  generate-tasks → process-task-loop) plus supplemental workflows (archival, commits,
  sessions, incidental work). Customization via `arc-methods.md` (overridable defaults)
  and `arc-extensions.md` (hook points)
- **Configuration** (`system/arc-config.yml`) — Flat key-value project settings (branch model,
  commit format, hooks, PM mode)
- **Agent templates** (`system/agent/`) — Per-agent instruction files (AGENTS, CLAUDE, GEMINI,
  CODEX, WARP, Copilot)
- **Git hooks** (`system/githooks/`) — Commit message validation, format enforcement
- **Active workspace** (`active/`) — Current work templates (WORK-STATUS, SESSION-NOTES,
  ATOMIC-TASKS, category subdirectories)
- **Backlog** (`backlog/`) — Future work pipeline (ROADMAP, category backlogs)

### CLI Package (`packages/arc-framework/`)

The `@arc-framework/cli` npm package — a TypeScript CLI that installs, updates, and manages ARC
framework files for adopters. Published under the `arc-framework` npm organization.

- **Entry point**: `src/cli.ts` — Commander-based with `init`, `update`, `status`, `diff` commands
- **Build**: tsup (ESM output, Node 18+ target, shebang injection, declaration files)
- **Tests**: Vitest (`__tests__/unit/`, `__tests__/integration/`, `__tests__/e2e/`)
- **Templates**: `.arc/` is the canonical source — bundled into the package at build time.
  `src/templates/` holds CLI-internal resources (user templates) not in `.arc/`

**Architecture** — standard three-layer CLI with downward data flow (`cli → commands → prompts + lib`):

- **`src/lib/`** — Pure logic and injectable utilities (render, hash, manifest, git, files).
  No direct side effects — filesystem and process dependencies are passed in for testability.
- **`src/commands/`** — Command handlers. Orchestrate lib modules with real dependencies.
- **`src/prompts/`** — Interactive UI via @clack/prompts. Collects input, feeds it to commands.
- **`src/cli.ts`** — Entry point. Commander routing, dispatches to command handlers.

Lib modules compose horizontally (e.g., `files.ts` imports `render.ts`) but never reach up to
commands or prompts.

### Framework Development Workspace (`.arc-internal/`)

Internal to this repository — not shipped to adopters. Mirrors `.arc/` structure for framework
development work, plus internal reference materials (QUICK-REFERENCE, project-specific
DEV-RULES.PROJECT, internal ADRs, archives).

### Customization Layer

Three mechanisms allow teams to adapt ARC without forking:

- **`arc-config.yml`** — Settings: branch protection, commit format, hook toggles, PM mode
- **`arc-methods.md`** — Overridable defaults for commit format, leave-it-cleaner triage,
  test-first assessment, session state, quality gate commands
- **`arc-extensions.md`** — Hook points for team-specific automation at task, unit, and
  work-unit lifecycle boundaries

## 3. Infrastructure

- **Version Control**: Git (primary runtime dependency)
- **Development Environment**: Cross-platform (Windows/WSL/Linux/Mac), all work at repo root
- **Package Manager**: npm with workspaces — root `package.json` delegates build/test/typecheck
  to the CLI workspace at `packages/arc-framework/`
- **TypeScript**: Strict mode, ES2022 target, Node16 module resolution
- **Build**: tsup — ESM output, shebang injection, declaration generation
- **Test Framework**: Vitest — unit, integration, and E2E test tiers
- **Documentation Linting**: markdownlint-cli2 (pinned local) — `npm run -s lint:md`
- **CI/CD**: GitHub Actions (`.github/workflows/ci.yml`) — markdown linting, TypeScript type
  checking, test suite, build verification, template structure validation, internal link checking
- **Configuration**: `.markdownlint-cli2.jsonc` for lint rules, `.gitattributes` for line
  ending normalization, `tsconfig.json` for TypeScript, `tsup.config.ts` for build,
  `vitest.config.ts` for tests

## 4. Testing Infrastructure

### Test Tiers

- **Unit** (`__tests__/unit/`) — Pure function and module tests, no side effects
- **Integration** (`__tests__/integration/`) — Module interaction, may use temp filesystem
- **E2E** (`__tests__/e2e/`) — Full CLI invocation against real (temporary) git repos

### Quality Gates

- **Markdown linting** — `markdownlint-cli2` with zero-tolerance policy
- **TypeScript type checking** — `tsc --noEmit` with strict mode
- **Test suite** — Vitest with all tests passing
- **Build verification** — tsup produces working CLI output
- **CI validation** — GitHub Actions validates all gates on push and PR
- **Tiered approach** — Tier 1 (per-task: lint + unit tests), Tier 2 (coherent unit: full lint +
  typecheck + tests), Tier 3 (phase/pre-PR: all + build + git review)

### Methodology Validation

- Self-hosting: framework development follows its own ARC methodology, providing continuous
  real-world validation of workflows and conventions
