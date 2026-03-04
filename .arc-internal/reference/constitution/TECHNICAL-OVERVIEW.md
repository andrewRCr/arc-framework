# ARC Framework Technical Overview

This document outlines the technical architecture of the ARC Framework — the technology choices,
component structure, and infrastructure that shape how the project is built and maintained.
Both human contributors and AI agents reference this to make decisions consistent with the
architecture.

## 1. Overview

The ARC Framework is a pure documentation and process system — not a software application. It
defines how a developer and an AI agent collaborate through structured workflows, templates, and
constitutional documents.

**Key characteristics:**

- **Documentation-only** — No runtime, no containers, no services. All artifacts are markdown
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
- **Dependencies**: Node.js with pinned local `markdownlint-cli2` — `npm install` to set up,
  `npm run -s lint:md` for quality gates
- **CI/CD**: GitHub Actions (`.github/workflows/ci.yml`) — markdown linting, template structure
  validation, internal link checking, ARC system structure validation
- **Configuration**: `.markdownlint-cli2.jsonc` for lint rules, `.gitattributes` for line
  ending normalization

## 4. Testing Infrastructure

Documentation-only framework — no unit tests, integration tests, or test runners.

### Quality Gates

- **Markdown linting** — `markdownlint-cli2` with zero-tolerance policy
- **CI validation** — GitHub Actions validates linting, template structure, and link integrity
  on push and PR
- **Tiered approach** — Tier 1 (per-task, incremental), Tier 2 (coherent unit boundaries),
  Tier 3 (phase completion / pre-PR full suite)

### Methodology Validation

- Self-hosting: framework development follows its own ARC methodology, providing continuous
  real-world validation of workflows and conventions
