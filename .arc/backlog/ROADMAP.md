# Roadmap: ARC Framework Development

Planning and reasoning — the sequencing strategy for remaining work, what gets built next
and why. This is a working document, subject to change as you learn. For project state
and record (achievements, current status), see `PROJECT-STATUS.md`.

**Last Updated:** 2026-04-18

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
2. ✅ **General refinement pass** (February 2026) — Content quality across docs;
   6 phases, 62 files, ~3,900 lines net removed
3. ✅ **Structural readiness pass** (February 2026) — Directory restructuring, file renames,
   content splits, configurable branching model

### Phase C: Release Path (Current)

Work units progressing from methodology design through beta CLI to public 1.0 release.
Each unit has a dedicated plan document in the backlog.

**WU1: Core Philosophy & Configurability Architecture** — ✅ Complete (February 2026)

6 ADRs, 2 strategy documents (core philosophy + configurability architecture), 5 research
files, constitutional doc refresh. All foundational 1.0 decisions resolved.

- Downstream: WU2, WU3, WU4

**WU1.5: Foundational Gap Closure** — ✅ Complete (2026-02-26)

Resolved 11 foundational design gaps and 3 partially addressed audit findings. Produced
ADR-007 (session state), context loading architecture (5 design decisions), planning
lifecycle strategy, and 10 WU2 plan cluster items with concrete implementation specs.

- Upstream: WU1 (all ADRs)
- Downstream: WU2

**WU2: Methodology Completion** — ✅ Complete (March 2026)

Applied WU1/WU1.5 design decisions across all existing docs, hooks, and templates. Resolved
all adoption dealbreakers and friction points identified in audits. Fixed multi-branch
coupling language, added team workflow adaptations, expanded arc-config.yml, implemented
convention gaps.

- Upstream: WU1 (all ADRs), WU1.5 (design decisions, workflow specs)
- Downstream: Structural Validation, WU3, WU4

**Structural Validation** — ✅ Complete (March 2026)

Gating check before WU3: file inventory validation (86 files), directory layout stabilization,
merge boundary audit, optional content pattern, de-duplication, cross-cutting dependency mapping.
Settled the file tree so WU3 can build on it with confidence.

- Upstream: WU2 (methodology changes)
- Downstream: WU3, WU4

**WU3: CLI Implementation (Beta)** — ✅ Complete (March 2026)

Built the `@arc-framework/cli` npm package (`0.x` beta): TypeScript CLI with interactive init,
three-way merge update system, agent tooling generation, manifest tracking. Team mode and
configurable install directory in scope.

- Upstream: WU1 (config schema), WU2 (methodology), Structural Validation (file inventory)
- Downstream: Dogfooding, WU4

**WU4: Beta Readiness** — ✅ Complete (April 2026)

Migrate dev repo to a real ARC installation, implement contributor role support (ADR-014),
establish public-facing scaffolding (repo rename, docs site with operational content, npm beta publish).
Prepares the framework for multi-week beta testing on an external project.

- Plan: `feature/plan-wu4-beta-readiness.md`
- Upstream: WU3 (functional CLI for `arc init` / `arc join`)
- Downstream: Methodology Maturation, Operating Modes, Dogfooding, WU5

**Methodology Maturation** — ✅ Complete (April 2026)

Settle ARC's foundational clarity before expanding the framework. Package–project sync audit
and dev safeguard, methodology/implementation boundary definition, human co-development
posture, language and positioning cleanup (harness engineering framing), content placement
and update behavior, conditional content architecture, ARC skill expansion.

- PRD: `technical/prd-methodology-maturation.md`
- Upstream: WU4 (beta-ready repo, stable methodology surface to audit)
- Downstream: Work-Status Restructure

**Work-Status Restructure** — ✅ Complete (April 2026)

Replaced the singular tracked `.arc/active/WORK-STATUS.md` with a per-work-unit status file
pattern (`.arc/active/{category}/status-{name}.md`), disentangling the project pointer from
the session pointer. Eliminated the parallel-WU concurrency flaw and base-branch staleness
dead-ends under full protection. Shipped `deactivate-work-unit.md` workflow, dropped
`**Following Task List**` from the status template (R17), and dogfooded its own output at
the Phase 3 live-migration cutover point.

- Archive: `archive/2026-q2/technical/03_work-status-restructure/`
- Upstream: Methodology Maturation (stable methodology surface, dual-copy sync discipline)
- Downstream: Session-Init Optimization (stable session-init substrate to optimize),
  ARCd Rebrand (first real exercise of the per-WU status file model across rotating branches)

**Session-Init Optimization** — In Progress (activated 2026-04-18)

Reduce session-init token cost (~40k loadset, ~75–80k observed at orientation completion)
toward a ≤60k observation target (≥25% reduction). Per-file methods/extensions with YAML
frontmatter index replace single-file full-reads; a new "Method and extension loading" rule
in DEV-RULES.ARC anchors compliance; operational-context audit trims always-loaded docs
(DEV-RULES, briefings, QUICK-REFERENCE, session-init.md); session-type conditional loading
formalizes the `Working On:` prefix for planning/execution/integration differentiation.

- PRD: `technical/prd-session-init-optimization.md`
- Upstream: Work-Status Restructure (overlapping edits on session-init.md would conflict;
  session-init substrate must stabilize first)
- Downstream: ARCd Rebrand (lean session-init surface for rebrand terminology sweep)

**User Sync UX Polish** — After Session-Init Optimization (pre-1.0 polish window)

State-machine unification (collapse full-mode and session-init notes-sync probes to one spine),
directional copy audit across `arc status` output, and `user.sync_push` scope expansion — design
plus external research for coupled commit + notes push semantics. Surfaced 2026-04-24 during
cross-machine resume: full-mode recommended `arc user save` when the user actually needed
`arc user pull` — same root cause as divergent state machines, with ambiguous copy compounding
the confusion. Landing before ARCd Rebrand means the rename pass picks up a consolidated state
machine and directional copy, rather than re-touching churned output. Sibling atomic fix for the
`arc user fetch` prompt removal lands in the Session-Init Optimization WU; this WU handles the
architectural work.

- Plan: `technical/plan-user-sync-ux.md`
- Upstream: Session-Init Optimization (atomic fetch-prompt fix, lean session-init substrate)
- Downstream: Work-Unit Mobility (clean sync UX before worktree-aware detection lands),
  ARCd Rebrand (terminology surface stabilized before rename), Dogfooding (beta-ready
  user-sync surface)
- **Scope note:** Pre-approved split at PRD-drafting time if auto-push design proves larger
  than medium: (1) state-machine + copy polish, (2) auto-push design + implementation. Keep
  unified if research concludes the auto-push work fits in one WU.

**Work-Unit Mobility** — After User Sync UX Polish

First-class same-developer support for moving between work units — across time (shift
lifecycle: pause / resume / rotate), across filesystem (worktree-aware session-init and
status surfaces), and across attention (focus-role model). Closes a blind spot where ARC has
no awareness of git worktrees and where same-dev parallel-WU usage is only accidentally
supported as a byproduct of team-mode structural design. Extracts shift lifecycle from the
original ARC Operating Modes scope so modes can focus on mode architecture without also
landing a cross-cutting lifecycle subsystem. One material open question (pause-pointer
reconciliation) must resolve before PRD promotion.

- Plan: `feature/plan-work-unit-mobility.md` (pre-PRD draft, iteration expected)
- Upstream: Session-Init Optimization (stable session-init substrate to extend),
  User Sync UX Polish (clean sync state machine before worktree axis joins it)
- Downstream: ARCd Rebrand (stable mobility terminology absorbed into rename pass),
  ARC Operating Modes (shift lifecycle available as prerequisite, not bundled into modes)

**Quality Gate Tiers and Hook Integration** — After Work-Unit Mobility

Align ARC's tier model (Tier 1/2/3) with standard git hook stages (pre-commit / pre-push / CI),
likely via rename to gate-stage naming (commit-gate / push-gate / pr-gate — final shape TBD).
Adds pre-push as a recognized ARC surface with structural dispatch to adopter-configured push-gate
commands; extends `quality-gate-commands` method with tier metadata so hooks auto-dispatch the
right commands at the right stage. Codifies the structural-vs-adopter-impl separation (ARC owns
tier abstraction + structural CHECKs + dispatch plumbing; adopters bring linters/tests at initial
setup). Surfaced 2026-04-24 when a CI failure landed on an ARC commit — Tier 2 would have caught
it but hadn't run under the current manual-discipline model. External research confirmed hook-stage
alignment is the universal idiom and ARC's gap is real. Builds on ADR-014 (hook-manager detection
already ships).

- Plan: `technical/plan-quality-gate-hooks.md`
- Upstream: Session-Init Optimization (DEV-RULES / session-init overlap), User Sync UX Polish
  (shared polish surfaces), Work-Unit Mobility (session-init orientation overlap),
  ADR-014 (hook-manager detection prerequisite)
- Downstream: ARCd Rebrand (new tier naming absorbed in rename pass),
  Dogfooding (beta-ready quality gate surface)
- **Scope note:** Pre-approved split at PRD-drafting time if tier rename proves too large:
  (1) hook integration (architectural), (2) tier rename (editorial). Keep unified if rename
  stays manageable.

**ARCd Rebrand** — After Quality Gate Tiers and Hook Integration

Rebrand ARC → ARCd as the public product brand while preserving ARC as the methodology and
workflow vocabulary. Split architecture: ARCd names the public implementation surface
(`arcd.dev`, `@arcd/cli`, `arcd` binary, `ARCd-config.yml`) while ARC remains the methodology
substrate (`.arc/`, `arc-*` skills, `arc-methods.md`). Absorbs config-key renames (`pm.mode`
→ `pm.layer`, `team.mode` → `team.enabled`, `pm.mode: arc-in-git` value → `arc-pm`) and CLI
command cleanup (`arc status` → `arcd health`, explicit `arcd version`) extracted from the
Operating Modes WU scope — same-surface editorial pass avoids a second churn event. Must land
before Operating Modes and public release.

- Plan: `technical/plan-arcd-rebrand.md`
- Upstream: Session-Init Optimization (lean session-init surface for terminology sweep),
  Methodology Maturation (same-surface churn avoidance), User Sync UX Polish (consolidated
  sync copy to rename), Work-Unit Mobility (mobility surfaces to rename in one pass),
  Quality Gate Tiers and Hook Integration (gate-stage terminology absorbed in rename pass)
- Downstream: Expanded Planning Path, Operating Modes, WU5

**Expanded Planning Path** — After ARCd Rebrand

Optional pre-PRD planning path for high-novelty, high-coupling work that needs more structure
than ARC's default freeform plan stage without making ordinary planning heavier. Adds a
`refine-plan-loop` workflow (planning-side analogue to process-task-loop) conditionally loaded
by session-init, expanded-planning detection in `arc-plan`, promoted-plan template structure
for bounded refinement units, and plan-splitting guidance distinct from PRD decomposition.
Codifies lessons from Operating Modes plan-shaping work where default freeform exploration
proved insufficient.

- Plan: `feature/plan-expanded-planning-path.md`
- Upstream: ARCd Rebrand (rebrand-ready terminology in new content)
- Downstream: Operating Modes (planning workflow support available for PRD drafting)

**ARC Operating Modes** — After Expanded Planning Path

Establish ARC's mode architecture — a lightweight mode (ARC Lite) for small projects preserving
execution discipline without lifecycle ceremony, and a local/untracked mode for constrained
environments where ARC can't be committed to the repo. Shift lifecycle (paused / waiting-for
state transitions) enters this WU as a prerequisite delivered by Work-Unit Mobility, not as
bundled scope — modes composes with the lifecycle subsystem to make Local Full viable.

- Plan: `feature/plan-arc-modes.md` (PRD-ready, 59-item deliverables inventory)
- Upstream: ARCd Rebrand (settled naming and key renames), Expanded Planning Path (planning
  workflow tooling for PRD drafting), Work-Unit Mobility (shift lifecycle available)
- Downstream: Dogfooding, WU5
- **Scope note:** Single WU by default. Pre-approved split at PRD-drafting time if scope proves
  unmanageable: foundation (installation-type mechanism + strategy audit) → Lite+Local
  (mode-specific content, workflows, templates). Splitting Lite from Local is explicitly
  rejected — shared infrastructure dominates unique per-mode work.

**Dogfooding Phase** — After Operating Modes

Install the beta CLI in a real project and battle-test the full workflow (init → work →
update → contributor setup). Includes testing new operating modes. Identify friction, bugs,
and design issues through real usage. Iterate on the CLI (`0.x.y` releases) until stable
enough for public release.

- Upstream: WU4 (base CLI), Operating Modes (expanded mode support)
- Downstream: WU5

**WU5: Public Release (1.0)** — Future

Docs site with content (MkDocs Material + GitHub Pages), full README rewrite, repo made
public, community infrastructure, release automation, npm `1.0.0`. Content priorities
informed by beta testing and dogfooding experience.

- Plan: `feature/plan-wu5-public-release.md` (stub)
- Upstream: Dogfooding (real-world feedback)
- Downstream: none

---

## Dependency Analysis

```text
Phase A ──► Phase B ──► Phase C (Work Units):
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
   │     │     │     │     ├──► WU4 (Beta Readiness) ✅
   │     │     │     │     │     │
   │     │     │     │     │     ├──► Methodology Maturation ✅
   │     │     │     │     │     │     │
   │     │     │     │     │     │     ├──► Work-Status Restructure
   │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     ├──► Session-Init Optimization
   │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     ├──► User Sync UX Polish
   │     │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     │     ├──► Work-Unit Mobility
   │     │     │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     │     │     ├──► Quality Gate Tiers + Hook Integration
   │     │     │     │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     │     │     │     ├──► ARCd Rebrand
   │     │     │     │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     │     │     │     ├──► Expanded Planning Path
   │     │     │     │     │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     │     │     │     │     ├──► Operating Modes (Lite + Local)
   │     │     │     │     │     │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     │     │     │     │     │     ├──► Dogfooding (iterate 0.x.y)
   │     │     │     │     │     │     │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     │     │     │     │     │     │     └──► WU5 (Public Release, 1.0)
   │     │     │     │     │     │     │     │     │     │     │     │     │     │           ▲
   │     │     └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘ (content can start after WU2)
   │     │                                                                                    ▲
   │     └──────────────────────────────────────────────────────────────────────────────────┘ (philosophy informs docs + README)
   │                                                                                          ▲
   └──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Parallelism:** WU5 docs site content and README drafts can begin after WU1+WU2 without
waiting for later work units. Community infrastructure (issue templates, CoC, etc.) has no
upstream dependencies. Methodology Maturation content placement decisions may inform WU5 docs
site structure.

---

## Scoping Decisions

### Included

| Approach                        | Rationale                                                      |
|---------------------------------|----------------------------------------------------------------|
| Documentation-first methodology | ARC is a methodology, not a tool — docs are the product        |
| TypeScript CLI (`arc init`)     | Guided setup reduces friction; three-way merge enables updates |
| npm distribution                | Standard package manager for JS/TS ecosystem                   |
| Self-hosting                    | Continuous real-world validation of the framework              |

### Lower Priority

| Approach           | Rationale                                   | When                  |
|--------------------|---------------------------------------------|-----------------------|
| Deep docs site     | Content priorities informed by beta testing | WU5 (post-dogfooding) |
| Release automation | Manual is fine for early releases           | WU5                   |
| Community infra    | No external contributors yet                | WU5 (pre-public)      |

### Skipped

| Approach           | Rationale                                                         |
|--------------------|-------------------------------------------------------------------|
| Runtime code gen   | ARC is methodology, not application scaffolding                   |
| IDE plugins        | Agent-native skills cover the same use case with less maintenance |
| Multi-repo support | Complexity not justified by current use cases                     |

---

## Open Questions

- Hook manager detection and integration strategy (husky, lefthook, etc.) — P1 for adoption

**Resolved:**

- ~~Distribution format~~ — npm package with CLI (`arc init`), resolved in WU3
- ~~Config vs methods vs extensions boundary~~ — resolved in ADR-010/ADR-013

---

## Change Log

- **2026-04-24**: Quality Gate Tiers and Hook Integration added as
  `technical/plan-quality-gate-hooks.md`. Surfaced same day when a commit with known-deferred
  markdown lint errors landed in CI — Tier 2 would have caught it under manual discipline but
  hadn't run because the task wasn't "coherent unit" complete. External research (documented
  in plan) confirmed the universal idiom is pre-commit → pre-push → CI hook stage alignment,
  and that ARC's Tier 1/2/3 maps naturally. Plan proposes: tier rename to gate-stage naming
  (commit-gate / push-gate / pr-gate, final shape TBD), pre-push hook as new ARC-recognized
  stage, dispatch method extension, initial-setup bootstrap. Sequenced after Work-Unit
  Mobility, before ARCd Rebrand (gate-stage terminology absorbed in rebrand's rename pass).
  Sibling atomic for this repo's own lint-staged adoption routed to `user/andrew/ATOMIC-INBOX.md`.
- **2026-04-24**: Two Phase C insertions. User Sync UX Polish added as
  `technical/plan-user-sync-ux.md` — surfaced during cross-machine resume when `arc status`
  full-mode recommended `arc user save` in a scenario requiring `arc user pull` (dual state
  machines drifting; ambiguous directional copy); atomic sibling fix for `arc user fetch`
  prompt removal routed to Session-Init Optimization WU. Work-Unit Mobility
  (`feature/plan-work-unit-mobility.md`, drafted 2026-04-17, previously unsequenced) inserted
  as next-but-one — extracts shift lifecycle from Operating Modes scope so modes stays focused
  on mode architecture. Sequencing: Session-Init Optimization → User Sync UX Polish →
  Work-Unit Mobility → ARCd Rebrand → Expanded Planning Path → Operating Modes → Dogfooding
  → WU5. Rebrand picks up consolidated sync state and mobility terminology in one rename
  pass; Operating Modes no longer bundles shift lifecycle.
- **2026-04-18**: Session-Init Optimization PRD + task list complete; activated on
  `technical/session-init-optimization` after batch planning branch merge.
- **2026-04-16**: Session-Init Optimization inserted between Work-Status Restructure and
  ARCd Rebrand. Commissioned mid-WU via the session-init context-load audit captured in
  `atomic-work-status-restructure.md`. Audit surfaced an architectural opportunity
  (JIT-migration over belt-and-suspenders front-load) beyond the initial file-by-file
  trim scope. Scheduled immediately after the current WU merges so edits to `session-init.md`
  don't compound.
- **2026-04-15**: Work-Status Restructure inserted between Methodology Maturation and ARCd Rebrand;
  activated on `technical/work-status-restructure`. Structural fix for WORK-STATUS.md so the rebrand
  WU can be the first real exercise of the per-WU status file model across rotating branches
- **2026-04-14**: Phase C re-sequenced — ARCd Rebrand and Expanded Planning Path inserted before
  Operating Modes; modes plan doc parked PRD-ready with pre-approved foundation → Lite+Local split
  fallback
- **2026-04-06**: Methodology Maturation PRD and task list complete, ARC Operating Modes plan added
- **2026-04-01**: WU4 complete, planning branch created for next work units
- **2026-03-24**: Migrated to `.arc/` — adapted to canonical ROADMAP structure
- **2026-03-21**: WU4 planning complete, task list active
- **2026-03-15**: WU3 complete, WU4 planning started
