# PRD: CLI Implementation (WU3)

**Type:** Technical
**Updated:** 2026-03-10

---

## Introduction

ARC's methodology — 11 principles, configurable conventions, structured workflows — exists as a set
of markdown files and git hooks. Installing it means manually copying a directory tree, editing
template placeholders, setting up gitignore entries, and configuring git hooks. Updating means
manually diffing new framework versions against customized files. Neither process is documented for
adopters because neither process is reasonable to ask of them.

WU3 builds the distribution layer: an `@arc-framework/cli` npm package with a CLI that handles
installation, configuration, and updates. The target is a beta release (`0.x`) for internal
dogfooding — complete enough to exercise the full init → work → update cycle in a real project
before public release in WU4.

**Why now:** All upstream design work is complete. WU1 settled the config schema and configurability
architecture (6 ADRs). WU2 completed the methodology across all documents. Structural Validation
confirmed the file inventory (86 files) and directory layout. The framework content is stable —
WU3 wraps it for distribution.

## Goals

1. **Make ARC installable with a single command** — `npx arc-framework init` sets up a complete,
   working ARC installation in any project
2. **Make updates non-destructive** — adopter customizations survive framework updates through
   three-way merge, with clear conflict reporting when both sides changed the same content
3. **Make the framework's own structure the source of truth** — the npm package contains the actual
   framework files, not a separate copy. Init renders templates from them; update merges new
   versions of them
4. **Make personal workspace portable** — `arc user` and `arc sync` commands wrap git notes so
   the entire per-developer workspace (session notes, task inbox, personal files) travels across
   machines and between developers without external tools or manual copying
5. **Produce a beta suitable for dogfooding** — functional enough to install ARC in a real project
   and exercise the full workflow, identifying friction and bugs before public release

## Use Cases

### UC1: First-time adopter installs ARC

A developer discovers ARC and wants to try it in their project. They run `npx arc-framework init`,
answer interactive prompts (project name, base branch, PM mode, agent selection), and get a fully
configured `.arc/` directory with rendered templates, git hooks, agent instruction files, and a
manifest tracking the installation. No manual file copying, no placeholder editing, no guessing
which files to include.

### UC2: Adopter updates to a new framework version

A new ARC version ships with improved workflows and updated strategies. The adopter runs
`npx arc-framework@latest update`. The CLI compares each managed file against the pristine baseline
(what was installed last time) and the new version, auto-merging where changes don't overlap and
flagging conflicts where they do. The adopter's customized DEV-RULES.PROJECT, AGENTS file, and
QUICK-REFERENCE retain their modifications. After resolving any conflicts, the adopter confirms and
the pristine baseline updates.

### UC3: Adopter audits customizations before updating

Before running an update, the adopter wants to know what they've changed. `arc-framework diff` shows
unified diffs of every managed file against the pristine baseline. `arc-framework status` summarizes
which files are modified, which are unchanged, and whether a newer version is available.

### UC4: Team setup

A team adopting ARC runs init with team mode enabled. The CLI creates the developer's
`user/{identity}/` directory (the same structure solo mode uses — ADR-012), sets
`team.mode: true` in `arc-config.yml`, and configures `user.sync_push: prompt`. Each developer's
identity is resolved via `git config arc.identity`. Adding team members later is just creating
another `user/{name}/` directory — no structural migration.

### UC5: Solo developer continues work on another machine

A developer ends a session on their desktop. The session handoff saves the user directory to git
notes and pushes automatically (`user.sync_push: always`). On their laptop, they pull the branch,
run session init, and the agent loads session context from the git note on HEAD — decisions made,
approaches tried, inbox captures, all carry over without manual transfer.

### UC6: Team handoff via session notes

Alice is handing a feature branch to Bob. She runs `arc sync` (sugar for save + push). Bob fetches
the branch, and session init loads Alice's session context from the git note. The qualitative
context — what she tried, what didn't work, where the tricky parts are — transfers alongside the
code, not through a separate Slack thread.

### UC7: Fixed install directory

The framework installs to `.arc/` at repo root — no renaming, no relocation. No tool in the
ecosystem supports directory renaming, and subdirectory paths are non-standard. The fixed path
simplifies cross-references, join-mode detection, and tooling assumptions.

## Requirements

### P0 — Must-have (beta)

1. **Interactive init command** (`npx arc-framework init`) — prompts for project configuration,
   renders template files with token substitution, processes conditional content based on config
   choices, creates directory structure, writes `.arc-manifest.json`, creates `.pristine/` baseline
2. **Template rendering engine** — `{{TOKEN}}` string replacement and `<!-- arc:if -->` /
   `<!-- arc:endif -->` conditional section processing. Conditions support equality checks against
   config values (`pm.mode`, `team.mode`, agent selection). No expression language beyond simple
   equality
3. **Init recipe** (`init-recipe.json`) — declarative mapping from prompts to tokens, config keys,
   and conditional file sets. Adding a new prompt or conditional file is a recipe edit, not a code
   change
4. **Manifest** (`.arc-manifest.json`, committed) — tracks `framework_version`, `installed_at`,
   `install_config` (adopter's init choices), and per-file inventory with `classification`
   (Framework/Configurable/Scaffolded), `layer` (core/arc-in-git), and `pristine_hash` (SHA-256).
   Modification status is computed on demand by comparing current file hash against `pristine_hash`
5. **Pristine baseline** (`.pristine/`, gitignored) — post-rendered copies of Framework and
   Configurable files as installed. Serves as the merge base for three-way updates. Excludes
   Scaffolded and Project-Owned files
6. **Update command** (`npx arc-framework@latest update`) — for each managed file, runs three-way
   merge (pristine base × new framework version × adopter's current file) via `git merge-file`.
   Reports results as auto-merged, conflicted, skipped (Scaffolded), or new. Updates pristine and
   manifest on completion
7. **Conflict reporting** — on merge conflicts, leaves standard git conflict markers in the file,
   reports which files need attention. Adopter resolves manually, then confirms resolution to update
   the pristine baseline
8. **Status command** (`arc-framework status`) — reports per-file modification state (modified vs.
   pristine) and whether a newer framework version is available
9. **Diff command** (`arc-framework diff`) — unified diff of each managed file against its pristine
   copy, filtered to Framework and Configurable files
10. **Git integration setup** — init configures `.gitignore` (pristine directory, SESSION-NOTES
    paths), `.gitattributes` (WORK-STATUS merge=ours), and local git config (`merge.ours.driver`)
11. **Skill generation** — generates per-agent-tool SKILL.md files from canonical skill definitions
    in `.arc/system/skills/`. Output paths are tool-specific (`.claude/skills/`, `.agents/skills/`,
    `.windsurf/skills/`, etc.). Generated files include appropriate frontmatter
    (`disable-model-invocation` where supported). Regenerated on update when definitions change
12. **Unified user directory** (ADR-012) — every installation gets a `user/{identity}/` directory
    (gitignored contents) for personal workspace files (SESSION-NOTES.md, ATOMIC-INBOX.md, freeform
    files). Identity resolved via `git config arc.identity` → slugified `user.name` → prompt.
    `team.mode` config key controls behavioral defaults (`user.sync_push`, team coordination
    guidance) — directory structure is identical for solo and team
13. **Fixed install directory** — installs to `.arc/` at repo root. No renaming or relocation
    supported. Cross-references use `.arc/` directly (no token substitution needed)
14. **PM mode awareness** — `pm.mode` (`none`, `arc-in-git`, `external`) controls which files are
    installed and managed. arc-in-git installs backlog templates, ROADMAP, PROJECT-STATUS,
    ATOMIC-INBOX.md (in `user/{identity}/`), strategy-backlog-organization. Manifest tracks per-file
    layer membership. Update skips files from uninstalled modes
15. **Git availability check** — CLI verifies git is installed at startup. Clear error message and
    exit if missing (git is required for merge operations)
16. **Markdownlint config installation** — init installs `.markdownlint-cli2.jsonc` with the
    framework's rule set (120-char line length, disabled code_blocks/tables). Classification:
    Framework (auto-updated). Ensures adopter linting matches framework conventions and prevents
    formatting-related merge conflicts
17. **User directory portability setup** (ADR-012 Part 3) — init configures git notes
    infrastructure for user directory portability. Adds notes fetch refspec
    (`refs/notes/arc/user/*`) so `git fetch` includes user notes automatically. Writes
    `user.sync_push` setting to `arc-config.yml` (`always` default for solo, `prompt` for
    team). Identity resolution (requirement 12) provides the per-developer namespace key
18. **User subcommand and sync** (`arc user`, `arc sync`) — ergonomic interface for user directory
    portability. `arc user save` serializes `user/{identity}/` contents to git note on HEAD.
    `arc user load` restores from git note (on HEAD or recent ancestor). `arc user push/pull`
    syncs notes ref with remote. `arc sync` is sugar for save+push (or pull+load). Identity
    resolved via `git config arc.identity`. Thin wrappers over
    `git notes --ref=arc/user/{identity}`. Additionally, `arc log --atomic` searches commit
    history for completed atomic/inbox work via the `(atomic / no associated task list)` context
    footer pattern
19. **Methodology documentation updates** (ADR-012 follow-up) — integrate the unified user
    directory model and portability into ARC methodology docs. Session lifecycle workflows gain
    notes load/save steps and single-path `user/{identity}/` resolution. Integrate-work-unit
    gains pre-merge inbox review step (arc-in-git mode). Strategies updated: team-coordination,
    backlog-organization, session-management, configurability-architecture, work-organization,
    file-classification. `arc-methods.md` session-state method updated. QUICK-REFERENCE template
    gains `arc user` / `arc sync` / `arc log --atomic` command patterns. ADR status annotations
    on ADRs 007, 008, 009. Adopters should discover these capabilities through the workflows
    they already follow, not by reading ADRs
20. **Post-init messaging** — after `arc init` completes, the CLI prints a concise next-steps
    summary: what was installed, how to verify (`01_verify-and-configure.md`), and the core workflow
    quartet to start with (create-prd, generate-tasks, process-task-loop, session-init). This
    is the adopter's first interaction with ARC's workflow model — the messaging should orient
    without overwhelming. Per ADR-004 Part 6 (requirement preserved by ADR-010 despite profile
    removal)

### P1 — Should-have (beta)

21. **Pristine recovery** — when `.pristine/` is missing (fresh clone, accidental deletion), update
    detects the gap and offers recovery: reconstruct from the installed npm package version
    (re-render templates with `install_config` from manifest) or reset pristine from current file
    state (treating current files as the new merge baseline)
22. **New file handling on update** — when a framework update introduces files that didn't exist in
    the previous version: auto-add Framework files without prompting, prompt for optional/conditional
    files that depend on config choices
23. **Post-update recommendation** — after update completes, recommend running the agent-driven
    consistency audit workflow to check for cross-cutting concept drift

### P2 — Nice-to-have (beta, defer if needed)

24. **Version-pinned update** — `arc-framework update --to <version>` to update to a specific
    version rather than latest
25. **Dry-run update** — `arc-framework update --dry-run` to preview what would change without
    modifying files

## Non-Goals

- **`reconfigure` command** — PM mode switching and config re-evaluation are deferred to post-beta.
  The manifest's `install_config` is designed to support this, but the command itself is not in
  beta scope. Note: the unified user directory model (ADR-012) eliminates the solo→team migration
  problem — adding team members is just creating new `user/{name}/` directories
- **`reset` command** — restoring individual files to framework defaults is deferred to post-beta
- **Team-integrated skill generation** — the system for adopters to register their own skills
  alongside framework skills is deferred until the framework skill generation pattern is proven
- **Docs site or README updates** — WU4 scope. CLI commands must be stable before documentation
  is finalized
- **Agent-driven consistency audit implementation** — this is a methodology workflow, not CLI code.
  The CLI recommends running it; WU3 doesn't implement the audit logic
- **Custom expression language for conditionals** — simple equality checks only. Complex conditional
  logic is not needed for the current file set and would add parsing complexity without proportional
  value
- **Programmatic API** — the package exposes a CLI only. Type declarations are included for
  potential future use but no public API contract is committed to in beta

## Technical Considerations

### Technology stack

- **Runtime:** Node.js 18+ (LTS baseline), ESM-only
- **Language:** TypeScript (strict mode), compiled via tsup
- **CLI framework:** Commander (subcommand routing, zero deps)
- **Interactive prompts:** @clack/prompts (modern, minimal)
- **Testing:** Vitest (unit + integration + e2e)
- **Package name:** `@arc-framework/cli` (scoped under `arc-framework` npm org)

### Architecture

The CLI wraps git for merge operations (`child_process.execFile`) and uses Node built-ins (`fs`,
`path`) for file I/O. Lean dependency philosophy — own implementations where simple, libraries only
for CLI framework and prompts.

Source layout: `src/cli.ts` (entry), `src/commands/` (init, update, status, diff),
`src/lib/` (merge, manifest, render, hash, git, files, skills), `src/prompts/` (init flow).

The npm package ships compiled JS in `dist/` plus raw framework template files and `init-recipe.json`.
Template files are sourced from `.arc/` — the canonical methodology files — and bundled into the
package at build time. No separate `framework/` copy is maintained in git; `.arc/` is the single
source of truth. A small `framework/` directory holds only CLI-internal resources (user templates)
that don't exist in `.arc/`. Init renders from the bundled templates, update merges from them.

### File classification drives update UX

Classification (Framework/Configurable/Scaffolded/Project-Owned) determines what the CLI
communicates about expected conflicts, not merge mechanics. The three-way merge runs identically
regardless — classification shapes the adopter's expectations and the CLI's reporting.

### Error handling philosophy

Graceful degradation where recovery is safe, hard failure where ambiguity would cause harm:

- **Git missing** → hard fail (can't function without it)
- **Pristine missing** → offer recovery options (P1, reconstructible from manifest + package)
- **Manifest missing or malformed** → hard fail for update/status/diff (no state to work from);
  init creates a new one
- **Individual file errors during update** → report and continue with remaining files (one
  corrupted file shouldn't block the entire update)
- **All errors produce clear, actionable messages** — what happened, why, what the user can do

### Merge edge cases

These have directional leans from the plan. Resolve during implementation with the leans as
guidance:

- **Heavily restructured files** — three-way merge may produce excessive conflicts. Lean: migration
  notes or CLI warning for known large restructurings
- **Template token evolution** — removed tokens could cause unexpected merge results. Lean: explicit
  handling in the render pipeline
- **Conditional content on update** — framework updates may add content to sections the adopter
  excluded. Lean: respect initial choices silently; `reconfigure` (post-beta) for choice changes

### Testing methodology

Pragmatic TDD — test-first for core logic (merge, render, manifest, hash), test-after for glue code
and CLI wiring.

- **Unit tests:** template rendering, conditional processing, manifest schema, file classification,
  hash computation, init-recipe parsing
- **Integration tests:** init flow (recipe + prompts → files + pristine + manifest), update flow
  (three-way merge results), status/diff accuracy, skill generation, conditional content variations
- **E2e tests:** full CLI invocation in temporary git repos — init in fresh repo, update after
  modifications, status output accuracy, round-trip (init → customize → update → verify)
- **Infrastructure:** Vitest, temporary directories per test, real git repos for e2e, snapshot
  testing for rendered output where appropriate
- **Boundary:** test our logic, not our dependencies (don't test Commander's parsing, clack's
  rendering, or git's merge algorithm)

## Success Criteria

1. `npx arc-framework init` produces a complete, working ARC installation that passes the
   framework's own markdown linting
2. `npx arc-framework@latest update` correctly preserves adopter customizations through three-way
   merge — auto-resolving non-overlapping changes, flagging real conflicts
3. The installed file set matches the authoritative inventory in `strategy-file-classification.md`
   for the selected PM mode and options
4. The beta is functional enough to install ARC in a real project (dogfooding candidate) and
   exercise the full init → work sessions → update cycle
5. `arc user save/load/push/pull` and `arc sync` complete the ADR-012/ADR-007 portability
   contract — the user directory (session notes, inbox, personal files) travels across machines
   and between developers via git notes
6. All quality gates pass: TypeScript strict mode, Vitest test suite, the framework's own markdown
   linting on generated output

## Open Questions

**Resolve during implementation:**

- **Conflict resolution UX** — after the adopter resolves merge conflicts, how do they confirm
  resolution and trigger pristine update? Dedicated subcommand, flag on update, or automatic
  detection? The requirement is clear (adopter must be able to confirm); the command shape is an
  implementation decision
- **Init prompt exact set** — the init-recipe defines prompts declaratively. The complete prompt
  inventory (beyond what the plan sketches) will be finalized during implementation of the init
  command, informed by the token inventory across all template files
- **Skills directory strategy default** — cross-tool `.agents/skills/` directory vs. tool-specific
  only. The plan leans cross-tool with config override. Final default validated during
  implementation against current agent tool conventions

**Evaluate during E2E testing:**

- **Cold-start enforcement friction** (ADR-010 Part 4) — ADR-010 deferred the question of
  whether full-enforcement defaults create a cold-start problem. The lean is against a
  "relaxed start?" toggle: adopters won't know what friction they'll hit until they've used the
  framework, at which point editing `arc-config.yml` is the right mechanism. Evaluate during
  E2E testing whether the defaults are reasonable out of the box. If init-flow testing surfaces
  a genuine blocker, revisit — but the bar is high

## Document History

| Date       | Change                                                                               |
|------------|--------------------------------------------------------------------------------------|
| 2026-03-10 | Initial draft — created from plan-wu3-cli-distribution.md after 3-stage refinement   |
| 2026-03-11 | Added session state portability (ADR-007): UC5-6, Goal 4, P0 reqs 17-19              |
| 2026-03-11 | Added post-init messaging (P0 req 20), ADR-010 conditional as Open Question          |
| 2026-03-11 | ADR-012: unified user directory, ATOMIC-INBOX rename, user portability, inbox review |
