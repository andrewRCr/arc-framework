# PRD: Beta Readiness

**Type:** Feature
**Updated:** 2026-04-03
**Status:** Complete

---

## Introduction

The ARC Framework has reached methodology completion (WU1–WU2) and has a functional CLI (WU3),
but the development repo can't serve as a real-world test case. The framework's own workspace uses
a dual-directory structure (`.arc/` for templates, `.arc-internal/` for actual work) that no
adopter will encounter. The CLI lacks a contributor entry point. And the project has no public
presence — no docs site, no published package, no contributor guide.

WU4 resolves these structural gaps so the framework can be beta-tested on a real project. The beta
test (several weeks between WU4 and WU5) exercises the full methodology on a solo project:
sessions, tasks, quality gates, CLI commands (`init`, `join`, `update`), and the arc-in-git
Project Management mode. Platform compatibility will be tested across common platforms and agents.
Team mode, contributor workflow, and non-arc-in-git PM modes are out of scope for the beta test
but ship with WU4 for completeness.

**Why now:** The CLI is functional and the methodology is stable. Every session on the dev repo
reinforces the dual-directory workarounds that adopters won't have. Migration gets harder the
longer we wait — more content accumulates in `.arc-internal/`, more references to update.

## Goals

1. **Self-host cleanly**: The dev repo uses ARC the same way any adopter would — a single `.arc/`
   directory created by `arc init`, no special internal structure.
2. **Enable contributor onboarding**: Open source contributors can join an ARC project with a
   dedicated command (`arc join`) that configures their role, identity, and tooling.
3. **Establish public presence**: A docs site with enough content to evaluate ARC, a published npm
   package that installs cleanly, and a contributor guide.
4. **Prepare for beta testing**: The framework is structurally ready for a multi-week test on an
   external project, with the full methodology exercisable by a solo developer.

## Use Cases

**UC1 — Solo developer beta-tests ARC on a new project:**

A developer runs `npx @arc-framework/cli init` on their project. The CLI scaffolds `.arc/` with
the correct structure, configures hooks, and sets up their identity. They work through multiple
sessions using `arc-resume` and `arc-handoff`, follow the planning pipeline (PRD → tasks →
execution), and run quality gates. The full methodology works end-to-end without manual setup
steps or workarounds.

**UC2 — Open source contributor joins an ARC project:**

A contributor clones a repo that uses ARC. They run `arc join`, select the "Contributor" role,
and choose their AI development tools. Their session loads a contributor-appropriate context
(quality gates and coding standards, but not the project's internal planning state). Hooks
validate their commits using the contributor context footer format and warn if they stage
maintainer-managed files. Their experience is streamlined — they aren't confused by planning
artifacts they don't need.

**UC3 — Evaluator discovers ARC online:**

Someone hears about ARC and visits the docs site. They find a clear explanation of what ARC is,
its design philosophy (P1–P11), and honest tradeoffs. A Getting Started page shows them how to
install and run their first session. They can decide whether ARC fits their workflow without
cloning the repo or reading source files.

**UC4 — Framework developer continues working post-migration:**

After migration, the dev repo's `.arc/` directory is a real ARC installation. Session init,
quality gates, hooks, and commit validation all work against the single `.arc/` structure.
The framework content source lives in `packages/arc-framework/arc/` and is no longer copied
during build — it's tracked directly and published via npm.

## Requirements

### P0 — Must-Have

**Content source relocation:**

1. Promote `packages/arc-framework/arc/` from build artifact to authoritative source — resolve
   drift with current `.arc/`, remove `cpSync` from build script
2. Verify CLI (`arc init`, `arc update`) works correctly with the promoted source directory
   (no path changes needed — `getArcTemplatePath()` already resolves to `arc/`)

**Repo migration:**

3. Run `arc init` on the dev repo to create a real `.arc/` installation (manifest, pristine
   copies, hooks configuration)
4. Migrate `.arc-internal/` content into `.arc/`: constitution, strategies, ADRs, archive,
   active work, backlog, user directory, agent config
5. Treat migrated files as project additions (do not patch `.arc-manifest.json`) — these are
   project content, not framework-managed files, matching how any adopter's repo would look
6. Delete `.arc-internal/` and update all references: session-init workflow paths, CLAUDE.md
   and skill files, `.gitignore` entries, CI config, README
7. Migrate hooks from template versions (single `.arc/` paths), with design review of
   framework-specific checks: CHECK 10 (boundary enforcement, dissolves), CHECK 11 (file
   protection, may transform), CHECK 8 (package exclusion, evaluate), dual-path patterns
   (simplify)
8. Pre-migration cleanup: archive completed task lists and ADRs (lasting reference value),
   delete superseded plans and working notes
9. Post-migration verification: session init, all quality gates (lint, typecheck, test, build),
   hooks, commit validation, `arc update` dry run

**`arc join` command:**

10. Create `arc join` as a dedicated CLI command (separate from `arc init`)
11. Interactive mode: verify `.arc/` exists, prompt for role (Team member / Contributor), prompt
    for tools, set `arc.role` and `arc.identity` in git config, configure hooks, create user
    directory, generate skills
12. Non-interactive mode: `arc join --contributor --yes` with optional `--tools` flag
13. Update `arc init` to suggest `arc join` when `.arc/` already exists (keep `--force` for
    re-initialization)
14. Extract shared setup logic (identity, hooks, user directory, skills) from `init.ts` into a
    shared module

**Contributor role support (ADR-014):**

15. Role-aware pre-commit hook: read `arc.role` from git config (default `maintainer`), skip
    task numbering check for contributors, add protected file warning when contributors stage
    `active/` or `backlog/` files (warn with proceed option, not hard block)
16. Role-aware commit-msg hook: accept `Context: contribution (...)` format for contributors,
    skip WORK-STATUS freshness check for contributors
17. Session-init workflow branching: when `arc.role = contributor`, skip items 8–11 (WORK-STATUS,
    task list, task execution workflow), load `AGENT-BRIEFING.CONTRIBUTOR.md`, check
    `user/{identity}/WORK-STATUS.md` for optional local planning state, skip next work unit
    discovery
18. Session-handoff workflow branching: when `arc.role = contributor`, skip project-level
    WORK-STATUS.md update and conditional commit sections
19. Create `AGENT-BRIEFING.CONTRIBUTOR.md` (framework-owned, in template source): behavioral
    overrides for contributor role
20. Create `CONTRIBUTING.template.md` (project-customizable): contributor setup via `arc join`,
    quality gates, maintainer-managed file boundaries
21. Update `arc-methods.md` → `commit-context-format`: add `Context: contribution (...)` pattern
22. Update `DEV-RULES.ARC.md` § Commit Discipline: note that contributor role overrides the
    work status accuracy rule

**Docs site:**

23. Refresh `README-ASPIRATIONAL.md` before use as source material — remove placeholders,
    update CLI references to actual commands, verify directory tour matches post-migration
    structure
24. Create `mkdocs.yml` with Material theme, full nav tree, GitHub repo link, search
25. Audit in-repo documentation against the docs-site boundary — apply "point-of-use"
    principle (agent-runtime content stays in `.arc/`; human-facing guides and deep-dives are
    docs-site material). Identify extraction candidates; results inform foundation page scope.
26. Create `docs/` directory with 6 foundation pages:
    - Landing/Index (adapted from refreshed README-ASPIRATIONAL)
    - Philosophy (adapted from `strategy-core-philosophy.md`, P1–P11)
    - Getting Started (install, first session, directory tour)
    - Sessions (adapted from `strategy-session-management.md`)
    - Work Planning (adapted from `strategy-work-planning.md`)
    - Updating ARC (classifications, three-way merge, pre/post checklist, skill regeneration,
      conflict resolution — deep-dive content routed from Phase 6 audit remediation)
27. Create stub pages for deferred content: Configuration Reference, Quality Gates, Team
    Coordination, Contributing to ARC, Comparison/Positioning, Tutorials
28. GitHub Action for docs deployment: push to main → build with mkdocs-material → deploy to
    GitHub Pages
29. `.gitignore` addition for `site/` build output

**Public scaffolding:**

29. Repo rename: `arc-agentic-dev-framework` → `arc-framework`
30. README update: what ARC is, current status (beta), install command, link to docs site,
    link to CONTRIBUTING.md
31. npm beta publish (`0.1.0` or appropriate version) — verify `npx @arc-framework/cli init`
    and `npx @arc-framework/cli join` work in a clean environment

### P1 — Should-Have

32. Hook manager detection and integration: detect husky (`.husky/` directory), lefthook
    (`lefthook.yml`), pre-commit (`.pre-commit-config.yaml`). When detected, integrate ARC
    hooks into the manager's config instead of setting `core.hooksPath`. Fallback to
    `core.hooksPath` when no manager found.
33. ARC dev repo adopts husky as reference implementation for hook manager integration

### P2 — Nice-to-Have

34. Docs site preview via `mkdocs serve` documented in CONTRIBUTING.md for local iteration
35. Docs site color scheme and branding beyond Material defaults

## Non-Goals

- **Docs site deep content**: Tutorials, examples, comparison pages, and configuration reference
  are WU5. Foundation pages cover "what and why," not "how to customize."
- **Full README rewrite**: The WU4 README is functional, not adoption-optimized. WU5 does the
  full positioning-focused rewrite.
- **Community infrastructure**: Issue templates, code of conduct, PR templates, GitHub Discussions
  — all WU5. CONTRIBUTING.md is the only community-facing document in WU4.
- **Release automation**: Tag-triggered builds, npm publish pipelines, sync workflows — WU5.
- **npm 1.0.0**: WU4 publishes a beta (`0.x`). Stable release is WU5.
- **Team mode testing**: Beta test is solo. Team coordination features ship but aren't exercised.
- **PM mode `none` / `external` testing**: Beta uses arc-in-git.

## Technical Considerations

**Content source architecture:** `packages/arc-framework/arc/` becomes the authoritative source
for framework content. The CLI's `getArcTemplatePath()` in `paths.ts` already resolves to this
directory. The `cpSync` build step that previously copied `.arc/` → `arc/` is removed. The
`package.json` `files` field, `init-recipe.json`, and all test files already reference `arc/` at
the package root — no path changes needed.

**`arc.role` in git config vs. arc-config.yml:** The role is per-developer metadata stored in
`git config --local`, not project configuration. Hooks currently read settings via
`arc_config_get` (which parses `arc-config.yml`). Role checks need a direct
`git config arc.role` read with `maintainer` as fallback. This is a minor but concrete
implementation detail — the hook library function doesn't need modification, just a supplementary
read pattern.

**Migration manifest strategy:** `arc init` generates `.arc-manifest.json` tracking installed
files. Migrated `.arc-internal/` content is project-specific (ADRs, active work, backlog, etc.)
and should NOT be added to the manifest. This matches how any adopter's repo looks — the manifest
tracks framework files, project additions are unmanaged. Consequence: `arc update` won't touch
migrated files, which is correct behavior.

**Hook migration path:** Start from template hooks in `packages/arc-framework/arc/` (structurally
correct for single-directory installations). Framework-specific checks in the current internal
hooks need per-check design review:

- CHECK 10 (public/internal boundary enforcement) → dissolves, no internal directory exists
- CHECK 11 (framework-owned file protection) → may transform into contributor-aware protection
- CHECK 8 (`packages/arc-framework/` exclusion) → evaluate whether still needed
- Dual-path regex patterns → simplify to single `.arc/` paths

**CLI refactoring for `arc join`:** Shared setup logic (identity resolution, hook configuration,
user directory creation, skill generation) currently lives in `init.ts`. Extract to a shared
module (e.g., `lib/setup.ts`) so both `init` and `join` can use it. `join` is a new command
file (`src/commands/join.ts`) registered in `cli.ts`.

**Docs site deployment:** MkDocs Material requires Python (not Node). The GitHub Action uses a
separate Python setup step. Deploy from main branch only — no preview deployments. Site builds
are triggered by push to main and deploy to GitHub Pages.

## Success Criteria

1. **Self-hosting works**: The dev repo uses a single `.arc/` directory. Session init loads
   correctly, all quality gates pass, hooks validate commits, `arc update` runs without error.
   No `.arc-internal/` directory exists.
2. **`arc join` works end-to-end**: Running `arc join` in a project with `.arc/` prompts for
   role and tools, sets git config values, configures hooks, creates user directory. Both
   interactive and `--contributor --yes` modes function correctly.
3. **Contributor role changes behavior**: A contributor's session init skips planning state and
   loads the contributor briefing. Hooks accept contributor context footer format and warn on
   protected file staging. Session handoff skips project WORK-STATUS update.
4. **Docs site is live**: Foundation pages render correctly at the GitHub Pages URL. Navigation
   works, search works, stub pages are present with placeholder text.
5. **npm package installs cleanly**: `npx @arc-framework/cli init` scaffolds a correct `.arc/`
   directory in a fresh project. `npx @arc-framework/cli join` works in a project with `.arc/`.
6. **Beta test can begin**: A solo developer can start a new project with `arc init`, work
   through the full methodology (sessions, planning pipeline, task execution, quality gates),
   and use `arc update` to receive framework updates — all without encountering structural
   issues.

## Open Questions

**Resolved:**

- **Hook CHECK 11 transformation**: Dissolved — noise for framework authors. Contributor-aware
  file protection implemented separately in Phase 4 (protected path warning for contributors
  staging `active/` or `backlog/` files).
- **`packages/arc-framework/` exclusion (CHECK 8)**: No action needed — template hooks already
  exclude this path correctly. The dev repo's pre-commit retains a project-specific addition
  for the exclusion since framework source legitimately contains `.arc/` references.
- **`system/workflows/project/` disposition**: One file (`agent-pre-merge-review.md`, CodeRabbit
  workflow) — copied as-is during migration. Project-specific workflow, not adopter content.

## Document History

| Date       | Change                                                                       |
| ---------- | ---------------------------------------------------------------------------- |
| 2026-03-23 | Initial draft from refined plan-wu4-beta-readiness.md (4 design decisions    |
|            | resolved: content source location, `arc join` as separate command, hook      |
|            | manager integration scope, docs site content tier)                           |
