# Roadmap: ARC Framework Development

**Purpose:** Internal planning artifact documenting sequencing strategy for framework development.
Subject to change as we learn.

**Last Updated:** 2026-02-17

---

## Current Sequencing Strategy

### Phase A: Framework Maturation ✅ Complete

Battle-test the framework through real project usage and sync refinements back.

1. ✅ **CineXplorer Integration** — Original battle-testing project
2. ✅ **CineXplorer Sync** (December 2025) — Infrastructure, workflows, agents, constitution
3. ✅ **arc-portfolio Dual-Maintenance** (February 2026) — Quality gates, letter numbering,
   commit tooling, workflow refinements

### Phase B: Distribution Preparation (Current)

Prepare the framework for public distribution via package manager.

1. **Distribution system design** ✅ — Plan captured in
   `feature/plan-distribution-and-update-system.md`
   - Pristine copy + three-way merge approach
   - Interactive init with conditional content, presets, and agent selection
   - Agent-driven consistency audit for cross-cutting concept management
   - npm package delivery model

2. **General refinement pass** ✅ Complete (February 2026) — Content quality across `.arc/` docs
   - 6 phases, 62 files, ~3,900 lines net removed
   - Archive: `.arc-internal/reference/archive/2026-q1/technical/01_content-refinement-pass/`

3. **Structural readiness pass** — **In Progress** (`technical/structural-readiness-pass`)
   - Directory restructuring (`reference/` → `reference/` + `system/` split)
   - File renames (`.example.md` → `.template.md`), content splits
   - Configurable branching model, team coordination content
   - Task list: `.arc-internal/active/technical/tasks-structural-readiness-pass.md`

### Phase C: CLI & Package Development

Build the distribution tooling.

1. **CLI prototype** — Minimal `init` + `update` with three-way merge
2. **Init recipe system** — Declarative config for interactive setup options
3. **Agent tooling packaging** — Selective install of `.claude/`, `.codex/`, `.gemini/`
4. **Testing & validation** — Verify init/update flows across scenarios

### Phase D: Public Release

1. **Public repository setup** — Rename dev repo, create clean public repo
2. **Documentation polish** — README reframe, adoption-focused docs, getting started guide
3. **Initial release** — npm publish, GitHub release
4. **Community infrastructure** — Issue templates, contribution guidelines

---

## Dependency Analysis

```text
Framework Maturation ──► Distribution Preparation
                         (can't optimize structure without mature content)

  Within Distribution Prep:
  General Refinement ──► Structural Readiness Pass
  (clean content first)   (then restructure)

Distribution Prep ─────► CLI & Package Development
                         (can't build tooling without knowing file structure)

CLI Development ───────► Public Release
                         (can't release without distribution mechanism)
```

**Note:** Public repo setup can proceed in parallel with CLI development.

---

## Related Documents

- Distribution plan: `feature/plan-distribution-and-update-system.md`
- Public release plan: `technical/plan-public-release-repository-strategy.md`
- Active work: `.arc-internal/active/CURRENT-SESSION.md`
- Constitution: `.arc-internal/reference/constitution/PROJECT-STATUS.md`
