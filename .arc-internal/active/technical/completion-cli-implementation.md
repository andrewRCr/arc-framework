# Completion: CLI Implementation (WU3)

**Completed**: 2026-03-20
**Branch**: `technical/cli-implementation`
**Category**: Technical
**Context**: Roadmap WU3 — build the distribution layer for the ARC framework

## Summary

Built the `@arc-framework/cli` npm package — a TypeScript CLI that installs, updates, and manages
ARC framework files for adopters. The CLI handles interactive init with template rendering, three-way
merge updates that preserve adopter customizations, status/diff reporting, skill generation for
multiple agent tools, and user directory portability via git notes. All PRD success criteria met;
beta is functional for the full init → work sessions → update cycle.

## Key Deliverables

- **Init command** — interactive prompts (project name, tools, PM mode), template rendering
  (`{{TOKEN}}` substitution + `<!-- arc:if -->` conditionals), declarative init-recipe, manifest
  tracking, pristine baseline, git integration setup (gitignore, gitattributes, merge driver)
- **Update command** — three-way merge via `git merge-file` (pristine × new template × adopter
  file), auto-merge for non-overlapping changes, conflict markers for overlapping changes, pristine
  and manifest refresh
- **Status and diff commands** — per-file modification state vs. pristine, unified diff output
- **Skill generation** — canonical-to-per-tool skill copies with universal-first output model,
  frontmatter injection, regeneration on update
- **User directory portability** — `arc user save/load/push/pull` and `arc sync` wrapping git notes
  for cross-machine session state transfer (ADR-012 contract)
- **Log command** — `arc log atomic` for browsing atomic task commit history with filters
- **Test suite** — unit, integration, and E2E tiers covering all commands and core libraries
- **Monorepo workspace** — `packages/arc-framework/` with TypeScript strict mode, tsup build, vitest

## Implementation Highlights

- **Template engine is declarative**: `init-recipe.json` maps prompts to tokens, config keys, and
  conditional file sets. Adding new prompts or conditional files is a recipe edit, not a code change.
- **Pristine baseline enables three-way merge**: `.pristine/` stores post-rendered copies at install
  time, giving `git merge-file` a common ancestor for clean adopter-preserving updates.
- **User sync via git notes**: Serializes `user/{identity}/` into JSON manifests stored as git notes,
  with ancestor-walk loading (up to 20 commits) for robustness after branch switches.
- **Security hardening via local code review** (4 CodeRabbit passes): path traversal fix in
  `deserialize()`, `--basic-regexp` for git log, stdin error handler on git note writes, identity
  slugification from interactive prompts, POSIX-correct `IFS= read -r` in hook pipelines.
- **DRY refactor**: Extracted `buildConfigKeyOverrides()`, `runWithSpinner()`, and `isHandledError()`
  shared helpers — reduced duplication across 5+ command files.
- **Six atomic tasks completed** during implementation — standalone companion file convention,
  session boundary guidance strengthening, session-init performance optimization, agent config
  decoupling, broader tool support assessment, AGENT-BRIEFING rename, init-recipe audit.

## Verification

- **Quality gates**: Tier 3 all passed — TypeScript strict mode clean, 358 tests pass (unit +
  integration + E2E), build clean, markdown linting clean
- **Success criteria**: 8 of 8 met (all `[x]`). No deviations or supersessions.
- **Integration hardening**: 4 local CodeRabbit review passes before PR — 1 critical, 4 major,
  and 9 minor findings fixed across security, robustness, and code quality. DRY refactor extracted
  shared helpers. 17 tests added covering hardened code paths.

## Related Documentation

- PRD: `.arc-internal/active/technical/prd-cli-implementation.md`
- Tasks: `.arc-internal/active/technical/tasks-cli-implementation.md`
- Notes: `.arc-internal/active/technical/notes-cli-implementation.md`
- Atomic: `.arc-internal/active/technical/atomic-cli-implementation.md`

## Follow-Up Work

- `reconfigure` command — PM mode switching, config re-evaluation (post-beta)
- `reset` command — restore individual files to framework defaults (post-beta)
- Team-integrated skill generation — adopter-registered skills alongside framework skills (post-beta)
- Docs site, README updates, public repo sync (WU4)
- Extract save-path logic to `arc-methods.md` — deferred until `reconfigure` is implemented
- Lower-priority test coverage gaps documented in BACKLOG-TECHNICAL.md during integration
