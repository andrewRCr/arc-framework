# ARC Framework Technical Overview

This document outlines the technical architecture of ARC Framework — the technology choices, component structure,
and infrastructure that shape how the project is built and maintained. Both human contributors and AI agents
reference this to make decisions consistent with the architecture.

> [!IMPORTANT]
> **Update Discipline.** This document updates on two triggers — never on cadence.
>
> - **Organic**: When a PR surfaces conflict or ambiguity against documented architecture, components, or
>   infrastructure (a new pattern doesn't fit any documented component; recorded tooling commands don't match
>   reality; a directory structure has drifted), resolve it here as part of that PR. The conflict is the signal.
> - **Event-driven**: Tech-stack changes (language or framework added or retired), major refactors (component
>   boundaries redrawn), dependency upgrades (significant version jumps), or infrastructure shifts (new
>   deployment target, build-system change, CI/CD reshape). These edits ride a dedicated commit with rationale.
>
> Cadence-driven reviews are not used; they drift the document from real decisions.

## 1. Overview

The ARC Framework is a development methodology for human-AI collaboration, delivered as documentation and a CLI
tool. The methodology is expressed as workflows, templates, strategies, and constitutional documents. The CLI
(`@arc-framework/cli`) manages installation, configuration, and updates of these files in adopter projects.

_Key characteristics:_

- **Hybrid project** — Documentation system (`.arc/`) plus TypeScript CLI (`packages/arc-framework/`)
- **Template-first** — Rich, copy-ready documents with inline guidance and framework defaults
- **Self-hosting** — Framework development follows its own ARC methodology, providing continuous real-world
  validation of workflows and conventions
- **Customization surfaces** — Adopters override behavior without forking via `arc-config.yml` (project settings),
  `system/methods/` (overridable defaults), and `system/extensions/` (lifecycle hook points)

## 2. Architecture Components

### Deployable Template System (`.arc/`)

The adopter-facing framework — everything here ships to users and is designed to be copied, customized, and
committed to their repositories. Five top-level concerns:

- **Constitutional rules** (`system/rules/`) — `DEV-RULES.ARC.md` (methodology rules) and
  `DEV-RULES.PROJECT.md` (per-project standards). These define the baseline behavior contract.
- **Project-level rendered documents** (`reference/` root) — `PROJECT-PRD.md`,
  `TECHNICAL-OVERVIEW.md`, `QUICK-REFERENCE.md`. Rendered once at `arc init` / `arc join` from `.template.md`
  sources; adopter-owned thereafter.
- **Reference material** (`reference/`) — `strategies/` (codified pattern guidance, indexed by
  `STRATEGY-INDEX.md`; `arc/` ships with the framework, `project/` is team-created), `adr/` (architecture
  decision records), `research/` (technical research with lasting reference value), and `templates/` (artifact
  skeletons).
- **System layer** (`system/`) — `workflows/` (numbered lifecycle workflows plus supplemental ones), `methods/`
  (overridable defaults), `extensions/` (lifecycle hook points), `briefs/` (session-init orientation by role),
  `githooks/` (commit message validation), `arc-config.yml` (flat key-value project settings), `skills/`
  (canonical skill sources rendered to harness-specific subdirectories).
- **Work surfaces** — `active/` (in-flight work units: meta files plus task lists and companions, flat layout),
  `backlog/` (future-work pipeline: `ROADMAP.md` plus `planned/` and `provisional/` state-dirs and inbox
  surfaces), and `completed/` (archived work units, organized by date — `YYYY-qN`).

### CLI Package (`packages/arc-framework/`)

The `@arc-framework/cli` npm package — a TypeScript CLI that installs, updates, and manages ARC framework files
for adopters, plus inspects and orchestrates state in existing installations. Published under the
`arc-framework` npm organization.

- **Entry point**: `src/cli.ts` — Commander-based
- **Build**: tsup (ESM output, Node ≥24 target, shebang injection, declaration files)
- **Tests**: Vitest with three test tiers (unit / integration / E2E)
- **Templates**: `arc/` is the canonical source — bundled into the package at build time. `src/templates/` holds
  CLI-internal resources (user templates) not in `arc/`

_Command surface — three categories:_

- **Lifecycle** — Install, join, and refresh ARC in projects
- **Inspection** — Probe installed state: identity, configured settings, active work, available extensions, file
  diffs, commit history
- **Orchestration** — Cross-concern operations: `sync` (push coordination), `release` (interlock-gated git
  operations), `user` (portable user-state)

See `arc --help` for the full command list.

_Architecture_ — standard three-layer CLI with downward data flow (`cli → commands → prompts + lib`):

- **`src/lib/`** — Pure logic and injectable utilities (render, hash, manifest, git, files). No direct side
  effects — filesystem and process dependencies are passed in for testability.
- **`src/commands/`** — Command handlers. Orchestrate lib modules with real dependencies.
- **`src/prompts/`** — Interactive UI via @clack/prompts. Collects input, feeds it to commands.
- **`src/cli.ts`** — Entry point. Commander routing, dispatches to command handlers.

Lib modules compose horizontally (e.g., `files.ts` imports `render.ts`) but never reach up to commands or prompts.

### Customization Surfaces

Three orthogonal mechanisms let teams adapt ARC without forking:

- **`arc-config.yml`** — Flat key-value project settings (branch protection, commit/push interlocks, hook
  toggles, PM mode, session-init pull behavior, user-notes push behavior). The live shape is `system/arc-config.yml`.
- **Methods** (`system/methods/`) — Per-file overridable defaults for codified behaviors (commit format, quality
  gate commands, test-first assessment, session state, branch format, and similar). Each method ships a default
  and an override slot; teams replace the default in place. See `system/methods/README.md` for the full set.
- **Extensions** (`system/extensions/`) — Per-file hook points at lifecycle boundaries: pre/post task, unit,
  work-unit activate/archive, commit, push, PR, merge, and context-load. Teams declare `active: true` in the
  extension's frontmatter and supply `.actions` content for team-specific automation. See
  `system/extensions/README.md` for available hook points.

### Cross-Machine User State

ARC ships a git-notes-based portability layer for per-developer working state. The `user/{identity}/` directory
(gitignored by default — local-machine personal context: session notes, working memory, inboxes) attaches to
commits via `refs/notes/arc/user/{identity}` namespaces. The `arc user` command group handles push / pull /
load operations; `arc sync` orchestrates user-notes sync alongside worktree push under unified configuration.
This makes solo cross-machine resume and team person-to-person handoff work without merge conflicts on the
gitignored personal surface.

### Release Wrappers

`arc release commit` and `arc release push` are interlock-validating wrappers around `git commit` and
`git push`. Each invocation validates configured commit/push-interlock state before executing and writes a
per-invocation audit entry regardless of opt-in. With `arc.releaseOptedIn: true` plus harness allowlist entries,
the wrapper additionally bypasses the per-invocation harness prompt for workflow-driven invocations — the
canonical commit/push path under workflow guidance. Off-workflow commits use raw `git` even when opt-in is on.

## 3. Infrastructure

_Runtime & environment:_

- **Version Control**: Git (primary runtime dependency)
- **Node Engine**: ≥24 (declared in `packages/arc-framework/package.json`)
- **Development Environment**: Cross-platform (Windows/WSL/Linux/Mac), all work at repo root
- **Package Manager**: npm with workspaces — root `package.json` delegates build / test / typecheck to the CLI
  workspace at `packages/arc-framework/`

_Language & build:_

- **TypeScript**: Strict mode (`noUncheckedIndexedAccess`), ES2022 target, Node16 module resolution
- **Build**: tsup — ESM output, shebang injection, declaration generation

_Testing & quality tooling:_

- **Test Framework**: Vitest — unit, integration, and E2E test tiers
- **Documentation Linting**: markdownlint-cli2 (pinned local) — `npm run -s lint:md`
- **Code Linting**: typescript-eslint (recommended-type-checked) — `npm run lint:ts`
- **Shell Linting**: shellcheck (system-installed) — `npm run lint:sh`

_CI & configuration:_

- **CI/CD**: GitHub Actions (`.github/workflows/ci.yml`) — markdown linting, TypeScript type checking, test
  suite, build verification, template structure validation, internal link checking
- **Configuration**: `.markdownlint-cli2.jsonc` for lint rules, `.gitattributes` for line ending normalization,
  `tsconfig.json` for TypeScript, `tsup.config.ts` for build, `vitest.config.ts` for tests

## 4. Testing Infrastructure

### CLI Package Testing

- **Framework**: Vitest
- **Execution**: `npm test` (full suite), `npm run test:unit` (unit only)
- **Structure**: Three tiers by isolation level:
    - **Unit** (`__tests__/unit/`) — Pure function and module tests, no side effects
    - **Integration** (`__tests__/integration/`) — Module interaction, may use temp filesystem
    - **E2E** (`__tests__/e2e/`) — Full CLI invocation against real (temporary) git repos
- **Command**: `npm test` (unit + integration, then E2E)

See `strategy-testing-methodology.md` for TDD decision tree, tier boundaries, mocking rules, and vertical-slice
workflow.

### Quality Gates

- **Markdown linting** — `markdownlint-cli2` with zero-tolerance policy
- **TypeScript type checking** — `tsc --noEmit` with strict mode
- **Code linting** — typescript-eslint (recommended-type-checked) and shellcheck
- **Test suite** — Vitest with all tests passing
- **Build verification** — tsup produces working CLI output
- **CI validation** — GitHub Actions validates all gates on push and PR
- **Tiered approach** — Tier 1 (per-task), Tier 2 (coherent unit), Tier 3 (pre-PR). See
  `strategy-quality-gates.md` for tier boundaries and escalation guidance.
