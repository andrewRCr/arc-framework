# Plan: Beta Readiness (WU4)

**Purpose:** Prepare the ARC Framework for real-world beta testing — migrate the development repo to a
proper ARC installation, implement contributor support, and establish the public-facing scaffolding needed
before the framework is tested on an external project.

**Status:** Draft
**Created:** 2026-03-21

---

## Scope

WU4 prepares the framework for a multi-week beta test on an unrelated project. The goal is a repo that
is structurally clean, properly self-hosted, contributor-ready, and has enough public scaffolding to exist
as a real project — not a polished public launch. Lessons from the beta test will feed back into WU5
(public release).

**What WU4 produces:**

- Development repo migrated to a real ARC installation (`.arc-internal/` eliminated)
- Contributor role support (ADR-014 implementation)
- CLI templates relocated to `packages/arc-framework/templates/`
- Repo renamed (`arc-framework`) and prepared for eventual public visibility
- Docs site scaffolded (MkDocs Material + GitHub Pages, skeleton only)
- Basic README update (not a full rewrite)
- npm beta publish (`0.x`)

**What WU4 does NOT produce (deferred to WU5):**

- Docs site content (philosophy pages, tutorials, examples, comparison material)
- Full README rewrite (adoption-focused, with positioning)
- Public mirror repo (`arc-framework`)
- Community infrastructure beyond CONTRIBUTING.md (issue templates, code of conduct, PR template)
- Release automation (tag → build → npm publish → sync)
- npm 1.0.0 stable release

---

## Inputs

**From WU1–WU3:**

- Methodology-complete framework files (WU1 + WU2) — the content that migrates into the real installation
- Functional CLI with `arc init`, `arc update`, `arc join` (WU3) — the tool that creates the real
  installation and supports contributor setup
- npm package `@arc-framework/cli` at `0.0.0` placeholder — needs beta publish

**From WU3 integration (current branch):**

- ADR-014 (Support Contributor Role for Open Source Projects) — accepted, drives Deliverable 1
- `notes-wu4-public-release.md` insights on repo structure — absorbed into this plan and ADR-014;
  notes file superseded
- CodeRabbit Pass 1 review fixes — `.arc/` ↔ `.arc-internal/` cross-reference issues that dissolve
  once `.arc-internal/` is eliminated

**From prior planning:**

- `plan-wu5-public-release.md` — deferred WU4 scope (docs site content, README rewrite, release
  automation, community infrastructure). Positioning guidance applies to WU5 content authoring.

---

## Deliverables

### 1. Repo Migration to Real ARC Installation

The development repo currently uses `.arc/` as a template source and `.arc-internal/` as the actual
framework development workspace. This dual structure causes persistent drift: hooks with path variants,
cross-reference mismatches, duplicate scripts with subtle differences.

**Migration to true self-hosting:**

1. Relocate `.arc/` template files → `packages/arc-framework/templates/` (CLI build input)
2. Update CLI build configuration to package templates from the new location
3. Run `arc init` on the dev repo — creates a real `.arc/` from templates with filled-in values
4. Migrate `.arc-internal/` content into the real `.arc/` installation:
   - `reference/constitution/` → merge project-specific rules into `.arc/` equivalents
   - `reference/strategies/` → move project strategies into `.arc/reference/strategies/project/`
   - `reference/adr/` → move to `.arc/reference/adr/`
   - `active/` → move to `.arc/active/`
   - `backlog/` → move to `.arc/backlog/`
   - `user/` → move to `.arc/user/`
   - `system/agent/` → merge agent-specific config into `.arc/system/agent/`
   - `system/workflows/project/` → evaluate what's needed post-migration
5. Delete `.arc-internal/`
6. Update all references: git hooks, CI config, session-init workflow paths, CLAUDE.md/skills
7. Verify end-to-end: session init, quality gates, hooks, commit validation

**Planning artifact cleanup:** Before migration, review and clean up planning artifacts (completed PRDs,
old notes, superseded plans) that accumulated during the exploratory WU1–WU3 development. The goal is a
tidy `.arc/` installation, not a dump of everything from `.arc-internal/`. Archive completed work
appropriately; remove artifacts that no longer serve a purpose.

**Post-migration, the `.arc/` cross-reference problems identified in CodeRabbit Pass 1 dissolve** — there
is only one `.arc/` directory, so all paths, hook patterns, and location comments are correct by
construction.

### 2. Contributor Support (ADR-014)

Implement the contributor role as specified in ADR-014. This is framework-level work — the features ship
with ARC and benefit every open source project that adopts it.

**Components:**

- **`arc.role` mechanism:** `arc join` prompts for role selection (team member vs. contributor). Sets
  `git config arc.role` to `maintainer` or `contributor`. `--contributor` flag for non-interactive use.
- **Session-init branching:** Contributor mode loads reference and system layers, skips planning state
  (WORK-STATUS, task lists, task execution workflow). Loads `AGENT-BRIEFING.CONTRIBUTOR.md` instead.
  Checks `user/{identity}/` for optional local planning state.
- **Session-handoff adjustment:** Contributor mode skips project WORK-STATUS.md update and conditional
  commit sections.
- **Hook adjustments:** Role-aware validation — contributor context footer format
  (`Context: contribution (...)`), protected file warning when staging `active/` or `backlog/` files,
  task numbering check skipped for contributors.
- **Hook manager integration:** `arc init` and `arc join` detect existing hook managers (husky,
  lefthook) and integrate rather than overwrite. For JS projects with husky, contributors get ARC hooks
  on `npm install` automatically.
- **`AGENT-BRIEFING.CONTRIBUTOR.md`:** Framework-owned contributor briefing, loaded conditionally.
  Behavioral overrides for the contributor role.
- **`CONTRIBUTING.template.md`:** Project-customizable template scaffolded by `arc init`. Covers
  contributor setup, quality gates, and maintainer-managed file boundaries.
- **commit-context-format method:** Add contributor format alongside existing patterns.
- **Workflow touchpoints:** ~5 identified changes across session-init, session-handoff,
  commit-context-format, and DEV-RULES (see ADR-014 § Role-aware workflow paths).

### 3. Public-Facing Scaffolding

Minimal public presence — enough to exist as a project, not enough for a launch.

- **Repo rename:** `arc-agentic-dev-framework` → `arc-framework` (single repo model per ADR-014 —
  this repo goes public directly, no separate mirror)
- **Docs site skeleton:** MkDocs Material + GitHub Pages. `mkdocs.yml` configuration, directory
  structure, GitHub Action for deploy-on-push. Placeholder content only — "coming soon" landing page
  with brief description and link to the repo.
- **README update:** Replace the current outdated README with a minimal version — what ARC is (one
  paragraph), current status (beta), install command, link to docs site (placeholder), link to
  CONTRIBUTING.md. Not a full adoption-focused rewrite (WU5).
- **npm beta publish:** Publish `0.1.0` (or appropriate beta version) from the dev repo. Verify
  `npx @arc-framework/cli init` works in a clean environment.

---

## Sequencing

Deliverables have a natural dependency order:

1. **Repo migration first** — Deliverable 1 must complete before Deliverable 2, because contributor
   support implementation targets the post-migration `.arc/` structure. Working in `.arc-internal/`
   and then migrating would double the work.
2. **Contributor support second** — Deliverable 2 builds on the clean `.arc/` installation.
   Hook changes, workflow touchpoints, and new documents all target the migrated structure.
3. **Public scaffolding third** — Deliverable 3 is the lightest and most independent. Repo rename
   can happen at any point. Docs site skeleton and npm publish are quick tasks once the repo is
   in its final structure.

Template relocation (step 1 of migration) can begin immediately as it's a structural prerequisite
with no dependency on the other migration steps.

---

## Dependencies

**Upstream (blockers):**

- WU3 integration complete — current branch (`technical/cli-implementation`) merged to main.
  The migration uses `arc init` and `arc join`, which must be functional.

**Downstream:**

- WU5 (Public Release) consumes WU4 outputs: migrated repo, contributor support, docs site
  skeleton. WU5 adds content, community infrastructure, release automation, and makes the
  repo public.

**Cross-cutting:**

- npm package: `@arc-framework/cli` (scoped under `arc-framework` org)
- Repo rename: `arc-agentic-dev-framework` → `arc-framework` (single repo, goes public in WU5)
- Single repo model: no separate mirror — planning content protected by ownership convention
  and contributor role mechanics (ADR-014), not by repo separation

---

## Open Questions

**Migration ordering for hooks:** The internal hooks (`.arc-internal/system/githooks/`) have real
differences from the template hooks (dual-path patterns, extra checks). During migration, do we
start from the template hooks and re-add the framework-specific checks, or migrate the internal
hooks and strip the dual-path patterns? The former is cleaner; the latter preserves more history.

**Hook manager choice for this repo:** Should the ARC dev repo adopt husky as part of WU4
(eating our own dog food for hook manager integration), or defer that to WU5 when there's more
time to validate the integration? Leaning toward WU4 — it's the reference implementation.

**Planning artifact retention:** How much of the WU1–WU3 planning history belongs in the migrated
`.arc/reference/archive/`? Everything? Only completed task lists? Only items with lasting reference
value? The clean initial commit for the eventual public repo (WU5) controls what's publicly
visible, but the dev repo's archive should still be tidy.

**Beta testing scope:** Which aspects of ARC get exercised during the external project beta test?
The full methodology (sessions, tasks, quality gates)? The CLI commands (`init`, `update`,
`status`)? Contributor workflow (if the test project is open source)? Knowing the test scope
helps prioritize WU4 polish.

---

## Related Documents

- `ADR-014` — Support Contributor Role for Open Source Projects (drives Deliverable 2)
- `plan-wu5-public-release.md` — deferred public release scope (stub)
- `prd-cli-implementation.md` — WU3 PRD; CLI that WU4 migration depends on
- `ROADMAP.md` — work unit sequencing
