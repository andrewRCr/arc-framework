# Roadmap: ARC Framework Development

**Purpose:** Internal planning artifact documenting sequencing strategy for framework
development. Subject to change as we learn.

**Last Updated:** 2026-03-06

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

### 1.0 Release: Work Unit Sequence (Current)

Four work units producing a stable, configurable, distributable 1.0 release. Each unit
has a dedicated plan document in the backlog.

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

**Structural Validation** — 🔄 Planning

Gating check before WU3: file inventory validation, directory layout evaluation and
stabilization, mixed-concern audit, optional content pattern, de-duplication, cross-cutting
dependency mapping. Settles the file tree so WU3 can build on it.

- PRD: `technical/prd-structural-validation.md`
- Task list: `technical/tasks-structural-validation.md`
- Upstream: WU2 (methodology changes)
- Downstream: WU3, WU4

**WU3: CLI & Distribution** — Implementation

Build the `arc-framework` npm package: interactive init, three-way merge update system, agent
tooling generation, manifest tracking. Exact 1.0 scope TBD during PRD creation.

- Plan: `technical/plan-wu3-cli-distribution.md`
- Upstream: WU1 (config schema), WU2 (structural validation, final file layout)
- Downstream: WU4

**WU4: Public Release** — Execution

Repository split (private dev, public user-facing), MkDocs Material documentation site,
README rewrite, community infrastructure, npm publish. Content creation can begin in
parallel after WU1+WU2 complete.

- Plan: `feature/plan-wu4-public-release.md`
- Upstream: WU1 (philosophy), WU2 (final framework), WU3 (functional CLI)
- Downstream: none

---

## Dependency Graph

```text
Phase A ──► Phase B ──► 1.0 Work Units:
(complete)  (complete)

  WU1 (Philosophy + Configurability) ✅
   │
   ├──► WU1.5 (Foundational Gap Closure) ✅
   │     │
   │     ├──► WU2 (Methodology Completion) ✅
   │     │     │
   │     │     ├──► Structural Validation 🔄
   │     │     │     │
   │     │     │     ├──► WU3 (CLI & Distribution)
   │     │     │     │     │
   │     │     │     │     └──► WU4 (Public Release)
   │     │     │     │           ▲
   │     │     └─────┴───────────┘ (content creation can start after WU2)
   │     │                       ▲
   │     └───────────────────────┘ (philosophy informs docs site + README)
   │                             ▲
   └─────────────────────────────┘
```

**Parallelism:** WU4 docs site content and README drafts can begin after WU1+WU2 without
waiting for WU3. WU2b depends only on WU2 methodology changes landing. Community
infrastructure (issue templates, CoC, etc.) has no upstream dependencies.

---

## Related Documents

- WU1 plan: `technical/plan-wu1-philosophy-configurability.md`
- WU2 PRD: `technical/prd-methodology-completion.md`
- Structural Validation PRD: `technical/prd-structural-validation.md`
- Structural Validation tasks: `technical/tasks-structural-validation.md`
- WU3 plan: `technical/plan-wu3-cli-distribution.md`
- WU4 plan: `feature/plan-wu4-public-release.md`
- Active work: `.arc-internal/active/WORK-STATUS.md`
- Project status: `.arc-internal/reference/PROJECT-STATUS.md`
