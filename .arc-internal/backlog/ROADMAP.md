# Roadmap: ARC Framework Development

**Purpose:** Internal planning artifact documenting sequencing strategy for framework
development. Subject to change as we learn.

**Last Updated:** 2026-03-21

---

## Current Sequencing Strategy

### Phase A: Framework Maturation ✅ Complete

Battle-test the framework through real project usage and sync refinements back.

1. ✅ **CineXplorer Integration** — Original battle-testing project
2. ✅ **CineXplorer Sync** (December 2025) — Infrastructure, workflows, agents, constitution
3. ✅ **arc-portfolio Dual-Maintenance** (February 2026) — Quality gates, letter numbering,
   commit tooling, workflow refinements

### Phase B: Distribution Preparation ✅ Complete

Prepare the framework for public distribution via package manager.

1. ✅ **Distribution system design** — Pristine copy + three-way merge approach, interactive
   init, agent-driven consistency audit, npm package delivery model
2. ✅ **General refinement pass** (February 2026) — Content quality across `.arc/` docs;
   6 phases, 62 files, ~3,900 lines net removed
3. ✅ **Structural readiness pass** (February 2026) — Directory restructuring, file renames,
   content splits, configurable branching model

### Release Path: Work Unit Sequence (Current)

Work units progressing from methodology design through beta CLI to public 1.0 release.
Each unit has a dedicated plan document in the backlog.

**WU1: Core Philosophy & Configurability Architecture** — ✅ Complete (February 2026)

6 ADRs, 2 strategy documents (core philosophy + configurability architecture), 5 research
files, constitutional doc refresh. All foundational 1.0 decisions resolved.

- Archive: `.arc-internal/reference/archive/2026-q1/technical/03_philosophy-configurability/`
- Research: `.arc-internal/reference/research/`
- Upstream: none
- Downstream: WU2, WU3, WU4

**WU1.5: Foundational Gap Closure** — ✅ Complete (2026-02-26)

Resolved 11 foundational design gaps and 3 partially addressed audit findings. Produced
ADR-007 (session state), context loading architecture (5 design decisions), planning
lifecycle strategy, and 10 WU2 plan cluster items with concrete implementation specs.

- Archive: `archive/2026-q1/technical/04_foundational-gap-closure/`
- Research: `reference/research/` (4 files, 76+ sources)
- Upstream: WU1 (all ADRs)
- Downstream: WU2

**WU2: Methodology Completion** — ✅ Complete (March 2026)

Applied WU1/WU1.5 design decisions across all existing docs, hooks, and templates. Resolved
all adoption dealbreakers and friction points identified in audits. Fixed multi-branch
coupling language, added team workflow adaptations, expanded arc-config.yml, implemented
convention gaps.

- Archive: `.arc-internal/reference/archive/2026-q1/technical/05_methodology-completion/`
- Upstream: WU1 (all ADRs), WU1.5 (design decisions, workflow specs)
- Downstream: Structural Validation, WU3, WU4

**Structural Validation** — ✅ Complete (March 2026)

Gating check before WU3: file inventory validation (86 files), directory layout stabilization,
merge boundary audit, optional content pattern, de-duplication, cross-cutting dependency mapping.
Settled the file tree so WU3 can build on it with confidence.

- Archive: `.arc-internal/reference/archive/2026-q1/technical/06_structural-validation/`
- Upstream: WU2 (methodology changes)
- Downstream: WU3, WU4

**WU3: CLI Implementation (Beta)** — ✅ Complete (March 2026)

Built the `@arc-framework/cli` npm package (`0.x` beta): TypeScript CLI with interactive init,
three-way merge update system, agent tooling generation, manifest tracking. Team mode and
configurable install directory in scope. Integration in progress.

- PRD: `technical/prd-cli-implementation.md`
- Archive: `.arc-internal/active/technical/` (pending integration merge)
- Upstream: WU1 (config schema), WU2 (methodology), Structural Validation (file inventory)
- Downstream: Dogfooding, WU4

**WU4: Beta Readiness** — Planning

Migrate dev repo to a real ARC installation (eliminate `.arc-internal/`), implement contributor
role support (ADR-014), relocate CLI templates, establish public-facing scaffolding (repo rename,
docs site skeleton, npm beta publish). Prepares the framework for multi-week beta testing on an
external project.

- Plan: `feature/plan-wu4-beta-readiness.md`
- ADR: `ADR-014` (Support Contributor Role for Open Source Projects)
- Upstream: WU3 (functional CLI for `arc init` / `arc join`)
- Downstream: Dogfooding, WU5

**Dogfooding Phase** — Between WU4 and WU5

Install the beta CLI in a real project and battle-test the full workflow (init → work →
update → contributor setup). Identify friction, bugs, and design issues through real usage.
Iterate on the CLI (`0.x.y` releases) until stable enough for public release.

- Upstream: WU4 (migrated repo, contributor support, beta publish)
- Downstream: WU5

**WU5: Public Release (1.0)** — Future

Docs site with content (MkDocs Material + GitHub Pages), full README rewrite, repo made
public, community infrastructure, release automation, npm `1.0.0`. Content priorities
informed by beta testing experience.

- Plan: `feature/plan-wu5-public-release.md` (stub)
- Upstream: WU4 (beta-ready repo), Dogfooding (real-world feedback)
- Downstream: none

---

## Dependency Graph

```text
Phase A ──► Phase B ──► Work Units:
(complete)  (complete)

  WU1 (Philosophy + Configurability) ✅
   │
   ├──► WU1.5 (Foundational Gap Closure) ✅
   │     │
   │     ├──► WU2 (Methodology Completion) ✅
   │     │     │
   │     │     ├──► Structural Validation ✅
   │     │     │     │
   │     │     │     ├──► WU3 (CLI Beta) ✅
   │     │     │     │     │
   │     │     │     │     ├──► WU4 (Beta Readiness)
   │     │     │     │     │     │
   │     │     │     │     │     ├──► Dogfooding (iterate 0.x.y)
   │     │     │     │     │     │     │
   │     │     │     │     │     │     └──► WU5 (Public Release, 1.0)
   │     │     │     │     │     │           ▲
   │     │     └─────┴───────────────────┘ (content creation can start after WU2)
   │     │                                 ▲
   │     └─────────────────────────────────┘ (philosophy informs docs site + README)
   │                                       ▲
   └───────────────────────────────────────┘
```

**Parallelism:** WU5 docs site content and README drafts can begin after WU1+WU2 without
waiting for WU3/WU4. Community infrastructure (issue templates, CoC, etc.) has no upstream
dependencies.

---

## Related Documents

- WU1 plan: `technical/plan-wu1-philosophy-configurability.md`
- WU2 PRD: `technical/prd-methodology-completion.md`
- Structural Validation PRD: `technical/prd-structural-validation.md`
- Structural Validation tasks: `technical/tasks-structural-validation.md`
- WU3 PRD: `technical/prd-cli-implementation.md`
- WU4 plan: `feature/plan-wu4-beta-readiness.md`
- WU5 plan: `feature/plan-wu5-public-release.md` (stub)
- Active work: `.arc-internal/active/WORK-STATUS.md`
- Project status: `.arc-internal/reference/PROJECT-STATUS.md`
