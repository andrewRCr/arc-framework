# Plan: Distribution & Update System

## Overview

Planning document capturing initial thinking on how ARC Framework will be distributed to users
and how updates will work without destroying project-specific customizations.

**Status:** Initial rough planning
**Created:** 2026-02-17

---

## The Core Problem

ARC is a plain-markdown documentation framework where files exist on a spectrum:

- **Pure framework** — workflows, strategies (rarely customized, but *should be* customizable)
- **Configurable** — DEVELOPMENT-RULES, AGENTS, QUICK-REFERENCE (framework structure + project content)
- **Project-owned** — CURRENT-SESSION, task lists, PRDs (scaffolded once, fully owned by project)

The tension: users need to freely customize any file (it's just markdown), but also need clean
updates when new framework versions are available — without losing their customizations.

This is the central "how do you make this publicly adoptable and convenient to maintain" challenge.

## Proposed Approach: Pristine Copy + Three-Way Merge

### Concept

The CLI maintains a hidden **pristine copy** of exactly what the framework shipped at install time.
On update, it performs a three-way merge for each framework file:

1. **Base** = pristine copy (what was installed last time)
2. **Theirs** = new framework version
3. **Ours** = user's current working copy

This leverages `git merge-file` (or equivalent) — a battle-tested algorithm that:

- Auto-resolves when changes are in different regions of the file
- Flags conflicts only when both sides changed the same lines
- Works with plain text, no structural requirements on the markdown

### File System Layout

```text
.arc/
  reference/          <- User's working copy (customized freely)
  active/             <- Project-owned scaffolding (CURRENT-SESSION, ATOMIC-TASKS, etc.)
  backlog/            <- Project-owned scaffolding (ROADMAP, backlogs, etc.)
  .pristine/          <- Hidden: exact copy of framework files as-installed
  .arc-manifest.json  <- Version, file inventory, classification, install config
```

### File Classification (UX Layer)

Classification drives user expectations and update messaging, not merge mechanics
(three-way merge handles all cases identically):

| Classification    | Examples                                         | Update Behavior                                     |
|-------------------|--------------------------------------------------|-----------------------------------------------------|
| **Framework**     | Workflows, ARC strategies, commit hook           | Auto-merge; conflicts possible if user customized   |
| **Configurable**  | DEVELOPMENT-RULES, AGENTS, QUICK-REFERENCE       | Auto-merge; conflicts expected in project sections  |
| **Scaffolded**    | CURRENT-SESSION, task lists, PRDs, ATOMIC-TASKS  | Never touched by updates                            |
| **Project-owned** | Project strategies, notes files, completion docs | Never touched by updates (user-created from scratch)|

### Update Flow

**User runs `arc update`:**

1. Download/access new framework version
2. For each framework/configurable file:
   - Compare pristine (base) → new version (theirs) → user's copy (ours)
   - Auto-merge where possible
   - Flag conflicts for manual resolution
3. For scaffolded files: skip entirely
4. Update `.pristine/` to match new framework version
5. Update manifest

**UX messaging by classification:**

- Framework files: "Updated 12 framework files" (silent unless conflicts)
- Configurable files: "3 configurable files merged cleanly, 1 has conflicts — run `arc diff`"
- Scaffolded files: not mentioned

## Package Manager Delivery

### Distribution Model

npm package (devs already have Node; framework already uses npx for linting):

```text
arc-framework/
  package.json
  bin/arc-cli.js          <- Lightweight CLI
  framework/              <- Framework source files (templates, workflows, strategies)
    reference/
    active/               <- Scaffolding templates
    backlog/              <- Scaffolding templates
  agents/                 <- Agent-specific tooling (.claude/, .codex/, .gemini/)
  init-recipe.json        <- Describes interactive setup options
```

### CLI Commands

- `npx arc-framework init` — Interactive setup, copies + renders templates, creates `.pristine/`
- `npx arc-framework update` — Three-way merge against pristine
- `npx arc-framework diff` — Show customizations vs current framework version
- `npx arc-framework status` — Show modified/up-to-date files
- `npx arc-framework reset <file>` — Restore file to framework default

### Benefits

- Adoption tracking via download stats
- Clean, semi-customizable interactive installation
- Simple updates (`npx arc-framework update`)
- Familiar tooling for developer audience

## Interactive Init

### Beyond Token Replacement

The init process supports multiple customization mechanisms:

- **Tokens:** `{{PROJECT_NAME}}`, `{{BACKEND_TEST_CMD}}` — string replacement
- **Choices:** "Testing framework?" → jest / vitest / pytest → populates command examples
- **Conditionals:** "Does your project have a backend?" → includes/excludes relevant sections
- **Presets (cross-cutting):** Choices that affect multiple files consistently:
    - "Work organization?" → 3-category (feature/technical/incidental, default) / flat hierarchy
      → adjusts directory structure, workflow references, commit context patterns, archive paths
    - Future: quality gate approach, task numbering style, markdown line length, etc.
- **File selection:** "Include ADR workflow?" → includes or skips optional files
- **Agent selection:** "Which AI agents do you use?" → installs only selected agent dirs
  (`.claude/`, `.codex/`, `.gemini/` with pre-built skills, slash commands, settings)
- **Workflow options:**
    - "Track CURRENT-SESSION in git?" → yes (multi-machine) / no (default, gitignored)
    - "Team or solo?" → solo (default, current behavior) / team (per-developer workspaces)

### Init Recipe

A declarative config (JSON/YAML) describing all init options. Serves as self-documentation
for what the framework offers. Extensible — new options in future versions get defaults
without breaking existing installs.

### Pristine Copy Note

`.pristine/` stores the **post-rendered, post-conditional** result (what was actually installed),
not raw templates. This is correct because it's the common ancestor for future merges.
Raw templates with conditionals live only in the package.

## Versioning Strategy

### Framework Version

Single semver (e.g., 0.4.0, 1.0.0) — the ARC release version.

### No Per-File Version Stamps

Current per-file version/hash stamps are inconsistent and get stale. With the manifest,
they become unnecessary:

- `.arc-manifest.json` tracks which framework version each file was installed from
- Tracks whether the user has modified each file (hash comparison)
- Provides the "dual-tier" tracking programmatically without polluting documents

Per-file version stamps in markdown headers can be removed as part of the structural
optimization pass.

## Scope of Framework Files

The framework footprint spans the full `.arc/` tree, not just `reference/`:

- **`reference/`** — Workflows, strategies, constitution, agent docs
- **`active/`** — Directory structure + starter files (CURRENT-SESSION template, ATOMIC-TASKS)
- **`backlog/`** — Directory structure + starter files (ROADMAP, backlogs, TASK-INBOX)
- **Agent dirs** — `.claude/`, `.codex/`, `.gemini/` (skills, settings, slash commands)

Each of these contains a mix of framework-provided structure and project-owned content,
which the file classification system handles.

### Slash Command Generation

Slash command content is duplicated across agent-specific directories (`.claude/commands/`,
`.codex/prompts/`, `.gemini/commands/`) in different formats (bare markdown, YAML frontmatter,
TOML). This violates DRY — content changes require manual updates in 3+ places.

**Proposed solution:** Single source of truth for command content + CLI generation step.

- Source: `.arc/` (location TBD — `commands/`, or an infrastructure directory)
- Generation: CLI reads source, outputs agent-specific formats during `init` and `update`
- Format differences are mechanical (frontmatter format, field names) — no content divergence

This also applies to any future agent-specific files where content is shared but format differs.

### `reference/` Directory Organization

`reference/` currently mixes documentation (constitution, workflows, strategies, ADRs) with
infrastructure/tooling (githooks, agent configs, and future commands source). These are different
concerns — infrastructure is tooling ARC provides, not project reference material. The structural
analysis pass should evaluate whether infrastructure concerns belong in a separate top-level
directory (e.g., `.arc/infrastructure/`) while keeping `.arc/` directory count manageable.

## Cross-Cutting Framework Concepts

### The Problem

ARC contains **load-bearing opinions** — concepts that aren't confined to a single document but are
woven throughout multiple files, creating implicit dependencies:

**Examples of load-bearing concepts:**

- **Quality gate tiers (1/2/3)** — Referenced in: DEVELOPMENT-RULES, process-task-loop,
  generate-tasks, quality-gates strategy, task list examples
- **Work organization (feature/technical/incidental)** — Referenced in: directory structure
  (`active/feature/`), workflows, archive paths, commit context patterns
- **Task numbering conventions** — Referenced in: task formatting strategy, generate-tasks,
  process-task-loop, commit hook validation
- **Commit format (conventional + Context footer)** — Referenced in: DEVELOPMENT-RULES (format
  authority), githook validation, atomic-commit workflow (complex scenarios). Formerly also in
  a commit-format skill (removed — redundant with DEVELOPMENT-RULES + hooks)

A user can change any single file — but modifying a cross-cutting concept means updating every
file that references it, and they may not know which files those are.

### Why This Matters for Distribution

The file classification (framework/configurable/scaffolded) isn't sufficient on its own. There's
a **coupling dimension**: some customizations are local (changing a test command) and some cascade
(changing the tier system). The update system needs awareness of this, at minimum for UX:

- If a user modifies a file that defines a cross-cutting concept, `arc update` could warn:
  "You've customized quality-gates strategy — these related files also reference tiers:
  [list]. Review after update."
- The structural analysis pass should map these dependencies explicitly.

### Primary Mitigation: Agent-Driven Consistency Audit

ARC is designed for agent-assisted development. Rather than encoding cross-cutting dependency
logic in the CLI tooling (rigid, brittle), **make agents the consistency layer** (flexible,
intelligent).

**Concept:** A general-purpose ARC workflow that an agent can run to ensure all docs are
internally consistent with each other. Not hard-coded to specific concepts — the agent
discovers what's in use and checks for mismatches.

**How it works:**

1. **Discovery** — Agent reads canonical definition docs (strategies, constitution) and
   identifies the cross-cutting concepts and vocabulary in use for this project
2. **Scan** — Agent checks all other `.arc/` docs for references to those concepts
3. **Compare** — Flags mismatches (e.g., "quality-gates strategy defines 5 tiers but
   process-task-loop still references Tier 1/2/3")
4. **Resolve** — Either proposes fixes for user review or applies them directly (user choice)

**Why this works better than CLI logic:**

- Agents understand prose context — they can tell the difference between "Tier 2" as a
  heading vs an incidental mention vs a prescriptive instruction
- General-purpose — works for any cross-cutting concept, including ones we haven't anticipated
- No rigid dependency graph to maintain — the agent discovers relationships dynamically
- Framework-consistent — it's just another ARC workflow

**Recommended triggers:**

- After `arc update` — "Run consistency audit to align updated docs with your customizations"
- After major customization — user modifies a strategy or constitutional doc
- Periodic hygiene — quick check that nothing has drifted
- Post-init — verify that interactive init choices propagated correctly

**This simplifies the distribution system:** `arc update` handles the mechanical merge.
The consistency audit handles the semantic alignment. Clean separation of concerns.

### Supporting Mitigations

1. **Dependency mapping** — Part of structural analysis: which concepts span multiple files,
   what's the blast radius of changing each one. Feeds into the consistency audit workflow
   (gives the agent a starting point for discovery).
2. **Centralized definitions** — If concepts are defined canonically in one place and other docs
   reference that concept rather than re-explaining inline, the agent's job is easier and
   coupling is visible to humans too.
3. **Customization guide** — Document "safe to change independently" vs "changes cascade" for
   each major concept. Sets user expectations before they customize.
4. **Init-time presets** — The init recipe offers choices for major framework opinions that
   propagate consistently across all affected files at setup time. Concrete example: work
   organization defaults to 3-category (feature/technical/incidental) but offers a flat
   hierarchy option — adjusting directory structure, workflow references, and commit patterns
   in one coherent pass. Makes opinionated defaults feel like starting points, not constraints.

### ARC vs Project Strategies

The strategies directory already separates `arc/` (framework-provided, opinionated) from
`project/` (created by users for their specific needs). This is a good pattern — the `arc/`
strategies are effectively "load-bearing" and the `project/` ones are fully independent. This
distinction should carry through to the file classification and update behavior:

- `arc/` strategies: Framework-classified, updated via merge, but user customization has
  cross-cutting implications (documented)
- `project/` strategies: Scaffolded (never touched by updates), fully user-owned

## Open Questions

### Merge Granularity

Three-way merge works at the line level. If a user heavily restructures a file (reorders
sections, removes framework sections), merges get harder. **Mitigation:** The structural
analysis pass should push toward section-level separation of framework vs project content
within configurable files, reducing conflict surface area.

### New Files in Updates

When a new framework version adds a file: auto-add? Prompt? Needs UX decision.
Likely: add to `reference/` automatically, mention in update summary.

### Template Token Evolution

If the framework changes which tokens exist between versions, the three-way merge handles
this naturally (token replacement shows as user changes, structural changes show as framework
changes). But if a token is *removed*, the rendered section may conflict. Edge case to consider.

### Conditional Content on Update

If a user initially chose "no backend" and a later version improves backend sections — should
`arc update` offer to include newly available content? Probably not by default (respect
initial choices), but `arc init --reconfigure` could allow re-running setup.

### Mixed-Concern Files

Some current files interleave framework and project content at the paragraph level. Every
interleaving point is a potential unnecessary conflict. The structural analysis pass should
identify and reduce these.

### Markdown Line Length as Init Option

Framework docs are authored at ~100 chars per line (safe default that passes any config >= 100). But line length is a
developer preference that affects every file and the `.markdownlint-cli2.jsonc` config.

**Considerations:**

- **Merge impact:** If a user reformats framework docs to a different width, every line changes, making three-way merge
  on updates essentially useless. This is the strongest argument for re-wrapping at init time rather than letting users
  reformat manually.
- **Init-time re-wrapping:** Init asks for preferred line length (default: 100), renders all framework docs at that
  width, sets the linting config accordingly. Pristine copy stores the result at the user's width. Mechanically
  straightforward (line wrapping is a solved problem).
- **Update re-wrapping:** `arc update` would need to re-wrap new framework content to the user's configured width
  before merging. Adds complexity but keeps merges clean.
- **Config only (simpler alternative):** Init sets the linting config but doesn't re-wrap framework docs. Users who
  want a different width reformat manually. Simpler tooling but worse merge experience.

**Recommendation:** Re-wrap at init time. The complexity is low (it's just line wrapping) and the merge benefit is
significant. Framework source files stay at authoring width; the init/update pipeline handles conversion.

## Prerequisites / Next Steps

1. **Structural analysis pass** — Audit `.arc/` files with "stable vs configurable,
   section-level separation" lens. Identify mixed-concern files and propose restructuring.
   Includes cross-cutting concept dependency mapping. Results become a focused work unit
   (PRD + task list).

2. **File classification inventory** — Categorize every file as framework/configurable/scaffolded/
   project-owned. Note cross-cutting concept involvement. Feeds into manifest design and
   update logic.

3. **CLI prototype** — Minimal `init` + `update` with three-way merge proof-of-concept.

4. **Public repo setup** — Separate concern from distribution; still needed for clean presentation.

## Future Directions

### Team Support

ARC is currently designed for solo developers. Basic team support could be added as an init
option without fundamentally changing the framework:

- **Per-developer workspaces:** `active/team/{name}/` containing personal CURRENT-SESSION,
  planning notes, scratch space — each developer owns their directory
- **Shared resources:** Task lists, PRDs, strategies remain shared (normal git collaboration)
- **Distribution/update is unaffected:** Each dev runs `arc update` on their own clone;
  pristine copy merge works independently per person. Shared ARC docs are handled by git
  (branches, PRs), not the distribution system.
- **Task coordination:** Lightweight conventions for assignment in shared task lists
  (e.g., owner annotations on subtasks)

### External Tool Integrations

Optional, lightweight agent workflows for common project management tools (Jira, Linear, etc.):

- **Not bidirectional sync** — lightweight, on-demand operations an agent can run
  (e.g., "sync completed task status to Jira", "import Linear issues as atomic tasks")
- **Activation:** Only when configured (API tokens in project config, not framework config)
- **Delivery:** Optional skills/workflows that ship with ARC but are inert unless configured
- **Scope:** Low priority, future addition — only if it can be done without bloating the core

## Notes from Structural Readiness Pass (B.3)

Decisions made during `tasks-structural-readiness-pass.md` that affect CLI design:

- **`.arc/config.yml`** — ARC's first project-level config file, introduced in B.3. Initial
  settings: `base_branch` (default: `main`) and `branch_protection` (`unprotected` / `partial` /
  `full`). The CLI should generate this during `arc init` as a setup-time decision and treat it
  as "configurable" classification (merges on update). Simple YAML — no nested structures, must
  be parseable by shell (githook reads it without a YAML library).
- **Team directory nesting** — `team/` structure supports both flat (`team/{name}/`) and nested
  (`team/{grouping}/{name}/`). CLI glob patterns for team member discovery must use `team/**/`
  not `team/*/`.
- **Planning branches** — ARC's default branching model now includes `planning/*` branches for
  delivering planning artifacts (PRD, task list) via PR before implementation. The CLI doesn't
  need to manage these directly, but should be aware of the pattern for any branch-related
  tooling or documentation generation.
- **Structural changes** — The B.3 work restructures `.arc/` significantly (`reference/` →
  `reference/` + `system/` split, `.example.md` → `.template.md` rename, workflow reorg into
  `arc/` + `project/` subdirs). The file system layout and file classification sections of this
  plan doc will need a full refresh when CLI work gets its own PRD.

## Relationship to Other Plans

- **Supersedes** (partially): `plan-public-release-repository-strategy.md` — Delivery mechanism
  evolves from "copy `.arc/`" to package manager install. Dual-repo concept still valid.
- **Informs**: README refresh, documentation polish, adoption materials
- **Depends on**: Structural analysis pass (reduces merge conflict surface area)
