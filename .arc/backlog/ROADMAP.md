# Roadmap: ARC Framework Development

Planning and reasoning — the sequencing strategy for remaining work, what gets built next
and why. This is a working document, subject to change as you learn. For project state
and record (achievements, current status), see `PROJECT-STATUS.md`.

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

**Session-Init Optimization** — ✅ Complete (April 2026)

Per-file methods/extensions architecture with workflow frontmatter triggers replaced
single-file full-reads; probe-computed `sessionType` inference (planning/execution/integration/
null) drives conditional item-9 / item-10 loadsets via composite probe; partial-read narrowing
across QUICK-REFERENCE, status file, and task list (strategic partial read with triple-anchor
task references); worktree-sync completion in the probe; operational-context audit and
template extractions trim always-loaded surface area. Constitutional rule pair (DEV-RULES.ARC
§ Verification and Discovery + strategy-workflow-authoring § Author-side Declaration Rule) and
pre-commit + CI enforcement (CHECK 11/13/15, lint:arc:*) anchor drift resistance. Realized
~24–28% reduction at orientation (~57–61k vs ~75–80k baseline) and session-init wall-clock
~2+ min → ~1 min.

- Archive: `archive/2026-q2/technical/04_session-init-optimization/`
- Upstream: Work-Status Restructure (overlapping edits on session-init.md would conflict;
  session-init substrate must stabilize first)
- Downstream: Session-Operational Flow (shared session-init / session-handoff / DEV-RULES surface),
  ARCd Rebrand (lean session-init surface for rebrand terminology sweep)

**Interlock Foundation** — In Progress (activated 2026-04-29)

Lands ADR-016's interlock model (Accepted): the constitutional frame for session-operational flow
with task → commit → push → integrate as the linear autonomy stack (invariant endpoints, configurable
middle interlocks) and handoff as orthogonal ceremony. Downgrades "AI never initiates commits" from
non-negotiable principle to configurable default; elevates task-interlock review and
integration-interlock human authority as real invariants. Ships the constitutional amendments,
status-file timing split (handoff and ceremony commits only — task-completion never touches status),
planning-session active surface (status file at planning activation; sessionType inference from
State), structured task-completion prompt as base ARC behavior (`Proceed to Task X.Y?` /
`Commit and proceed to Task X.Y?`), configuration surface (`session.autonomy` axis with per-developer
override, composite handoff probe, handoff-interior toggle pattern), and rollback dev-rule. Shared
frame for the downstream session-operational plans (User Sync UX, Quality Gate Hooks, Worktree
Foundation, Concurrent Work Conventions, Coord Probe) — each becomes smaller and internally
coherent inside the frame. Surfaced 2026-04-24 during pre-PRD exploration of User Sync UX when
the `user.sync_push: always`
incoherence revealed a missing shared frame. External research validated interlock-model alignment
with industrial SWE practice (Spinnaker manual judgment, GitHub Environments, Atlantis, Terraform
autonomy tiers, Conventional Changelog boundary-consolidation).

- PRD: `technical/prd-interlock-foundation.md`
- ADR: `reference/adr/adr-016-configurable-autonomy-interlocks-for-session-operations.md` (Accepted)
- Sibling WU plan: `technical/plan-session-operational-flow.md` (autonomy-mode behavior + metadata-state
  foundation; ships after Interlock Foundation validation window)
- Upstream: Session-Init Optimization (shipped — PR #21)
- Downstream: User Sync UX Polish (handoff-interior toggles for worktree/notes pairing),
  Worktree Foundation (mechanism layer for multi-session ergonomics; consumes the autonomy frame
  for shift lifecycle), Concurrent Work Conventions (focus-role conventions composed against the
  interlock model), Coord Probe (parallelizable; consumes session-init substrate established
  alongside the frame), Quality Gate Tiers and Hook Integration (per-junction hook placement;
  canonical gate vocabulary preserved alongside the new interlock vocabulary), ARCd Rebrand
  (interlock-model terminology absorbed into rename pass)

**Session-Operational Flow** — Sibling WU; backlog (deferred to post-WU-A validation window)

Implements the autonomy-mode behavior (auto-commit, auto-push), handoff-interior toggle consumers,
deferred-review × auto-commit safe-accumulate, arc-commit skill preservation, and metadata-state
foundation (State + Integration field model + sweep cadence config) against the Interlock Foundation
frame. WU-B in the pre-approved split.

- Plan: `technical/plan-session-operational-flow.md`

**User Sync UX Polish** — After Session-Operational Flow Phase 6 (handoff-interior toggles)

State-machine unification (collapse full-mode and session-init notes-sync probes to one spine),
directional copy audit across `arc status` output, notes-discovery fix (HEAD-independent walk so
cross-machine resumes find latest notes regardless of worktree HEAD), and `user.sync_push` scope
expansion — design plus external research for coupled commit + notes push semantics. Surfaced
2026-04-24 during cross-machine resume; notes-discovery scope addition surfaced 2026-04-28 when
the same chicken-and-egg problem (notes ride with HEAD) became a concrete blocker for branch-gone
detection's cross-machine signal. Landing before ARCd Rebrand means the rename pass picks up a
consolidated state machine and directional copy, rather than re-touching churned output. Sibling
atomic fix for the `arc user fetch` prompt removal lands in the Session-Init Optimization WU;
this WU handles the architectural work.

- Plan: `technical/plan-user-sync-ux.md`
- Upstream: Session-Init Optimization (atomic fetch-prompt fix, lean session-init substrate),
  Session-Operational Flow Phase 6 (handoff-interior toggle framework — substrate for auto-push
  implementation)
- Sibling: Coord Probe (parallelizable; consumes the notes-discovery fix as one signal source
  for branch-gone detection)
- Downstream: Work-Unit Mobility (clean sync UX before worktree-aware detection lands),
  ARCd Rebrand (terminology surface stabilized before rename), Dogfooding (beta-ready
  user-sync surface)
- **Scope note:** Natural split aligned with frame dependency: WU-A (state-machine unification +
  copy audit + notes-discovery fix — independent of interlock-model frame) can ship as soon as
  Session-Init Optimization lands; WU-B (auto-push instantiation against handoff-interior
  toggles) waits for Session-Operational Flow Phase 6. Unified if sequencing allows.

**Worktree Foundation** — Parallel with User Sync UX Polish and Coord Probe (after Session-Operational Flow lands)

Mechanism layer for parallel and mobile work — extracts shift lifecycle from arc-modes (mode-universal
infrastructure), adds worktree-aware shift, gives session-init worktree context awareness including
branch-gone detection, resolves cross-WU file sync semantics, and migrates `manage-incidental-work` off
the four pause-pointer fields (`Interrupts:`, `Paused At:`, `Paused To:`, `Spawned:`) onto shift state.
Carved out from former Work-Unit Mobility WU as the mechanism-only piece — conventions land in
Concurrent Work Conventions; tier model in Agile WU Lifecycle. Resolves the long-standing concern that
ROADMAP claims "parallelizable" downstream WUs without ARC actually having parallelism infrastructure.

- Plan: `technical/plan-worktree-foundation.md` (pre-PRD draft, iteration expected)
- Upstream: Session-Init Optimization (lean session-init substrate to extend),
  Session-Operational Flow (avoid session-init workflow surface conflicts)
- Sibling: User Sync UX Polish, Coord Probe (parallelizable; SESSION-NOTES per-worktree handling
  interacts with sync semantics, either order works)
- Downstream: Agile WU Lifecycle (clean activate/integrate workflows), Concurrent Work Conventions
  (mechanism layer entirely), Coord Probe (consumes branch-gone fire point), ARC Operating Modes
  (extracted shift lifecycle as prerequisite, not bundled), ARCd Rebrand (terminology absorbed)

**Coord Probe** — Parallel with User Sync UX Polish and Worktree Foundation (after Session-Operational Flow lands)

Establishes ARC's first external-coordination integration surface — a `coord-probe` method backed
by a CLI subcommand (`arc coord probe`) and pluggable adapters. Answers "where should I be working"
at session-init's branch-gone fire point and other discovery moments where in-git state alone is
insufficient. Ships in-git default and bundled GitHub adapter (`gh pr/issue list --assignee @me`);
documents custom-adapter contract for Linear / Jira / etc. Surfaced 2026-04-28 during cross-machine
resume — primary machine returned to a merged-and-deleted feature branch, worktree probe correctly
reported `remote-unavailable` but couldn't identify the right target. Discussion confirmed
detection is straightforward but target resolution at team scale needs a pluggable signal source
beyond `.arc/active/` walks. Fills the no-behavioral-hook gap on `pm.mode: external`.

- Plan: `technical/plan-coord-probe.md` (pre-PRD draft, iteration expected)
- Upstream: Session-Init Optimization (lean session-init substrate to extend),
  Session-Operational Flow (avoid session-init workflow surface conflicts; coord-probe's
  session-init consumption shouldn't churn the same edits)
- Sibling: User Sync UX Polish (parallelizable; coord-probe consumes notes-discovery fix from
  User Sync UX as one signal source — graceful degradation when not yet available),
  Worktree Foundation (parallelizable; Worktree Foundation's branch-gone detection consumes the
  probe as one cascade signal)
- Downstream: Agile WU Lifecycle (downstream of all three first-wave WUs via Worktree Foundation),
  Concurrent Work Conventions (further downstream), ARCd Rebrand (terminology surface stabilized
  before rename)

**Agile WU Lifecycle** — After Worktree Foundation

Three-tier work-unit model (atomic / quick / standard) with structurally differentiated artifact
requirements and invariant execution discipline. Closes the agility gap where ARC's uniform ceremony
costs more than the work for short-lived WUs. Atomic tier: no task list, single concern, PR
description as archive. Quick tier: flat task list with required Scope section, no PRD, single
deliverable. Standard tier: full plan/PRD/phased-tasks/completion-doc lifecycle. Adds `**Tier:**` and
`**Spec:**` fields to status template, `arc start` command for fast WU activation, ceremony scaling
for activate/integrate/archive workflows. Retires atomic-companion file (PRD-time decision) and
incidental category (subsumed by tier model + shift lifecycle). Constitutional amendment to
DEV-RULES.ARC: tiered artifact requirements with invariant execution discipline — explicitly answers
plan-arc-modes' "Required vs Available" rejection by preserving execution discipline at every tier.
Companion ADR drafted at PRD time (parallel scale to ADR-016).

- Plan: `technical/plan-agile-wu-lifecycle.md` (pre-PRD draft, iteration expected)
- Upstream: Worktree Foundation (clean activate/integrate workflows post-pointer-field retirement;
  the tier model's `arc start` operates on worktree-aware activation substrate),
  Session-Operational Flow (no direct dependency, but avoids surface conflicts on
  activation/integration workflow edits)
- Downstream: Concurrent Work Conventions (tier model informs concurrency conventions; focus-role
  model interacts with tier),
  Quality Gate Tiers and Hook Integration (gate-tier mapping per WU tier),
  ARCd Rebrand (tier vocabulary absorbed into rename pass)

**Concurrent Work Conventions** — After Agile WU Lifecycle

Conventions layer for principled multi-WU work — focus-role model (`primary | companion |
awaiting-external | parked`), blessed pairings, swap discipline at review-increment boundaries,
async-merge integration-surface audit, `strategy-concurrent-work.md` (new strategy doc as sibling to
strategy-team-coordination), main-worktree-under-full-protection convention ("your main worktree is
not always on main"), ROADMAP parallelism format research and redesign. Renamed from former Work-Unit
Mobility WU as part of the agile/mobility split (mechanism → Worktree Foundation; tier model →
Agile WU Lifecycle; conventions → this WU). Composes with mechanism + tier-model layers to deliver
"agile, principled, multi-WU work."

- Plan: `feature/plan-concurrent-work-conventions.md` (pre-PRD draft, iteration expected)
- Upstream: Worktree Foundation (mechanism layer; pause-pointer migration), Agile WU Lifecycle (tier
  model; focus-role applies to quick + standard, not atomic),
  User Sync UX Polish (clean sync state machine before worktree-axis-plus-focus-role conventions
  land), Session-Operational Flow Phases 3/5/6 (configurable autonomy reduces approval ceremony
  under multi-session load; async-merge audit captured here per ADR-016 discussion)
- Downstream: ARCd Rebrand (concurrent-work terminology absorbed into rename pass),
  ARC Operating Modes (shift lifecycle delivered by Worktree Foundation as prerequisite;
  concurrent-work conventions inform mode-specific guidance)

**Quality Gate Tiers and Hook Integration** — After Concurrent Work Conventions

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
- Upstream: Session-Init Optimization (DEV-RULES / session-init overlap),
  Session-Operational Flow Phases 1-3 (canonical gate vocabulary + config surface — supersedes
  this plan's independent convergence on commit-gate / push-gate / pr-gate naming; adds
  handoff-gate as fourth hook stage), User Sync UX Polish (shared polish surfaces),
  Worktree Foundation (session-init orientation overlap),
  Agile WU Lifecycle (tier model — gate-tier mapping per WU tier is this WU's PRD work),
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
  sync copy to rename), Coord Probe (coord-probe terminology absorbed),
  Worktree Foundation (mobility mechanism surfaces to rename in one pass),
  Agile WU Lifecycle (tier vocabulary absorbed),
  Concurrent Work Conventions (focus-role and concurrent-work terminology absorbed),
  Quality Gate Tiers and Hook Integration (gate-stage terminology absorbed in rename pass)
- Downstream: arc-plan Conductor, Operating Modes, WU5

**arc-plan Conductor** — After Interlock Foundation; parallelizable with Worktree Foundation and
Agile WU Lifecycle

Promote `arc-plan` from facilitation skill to ARC's canonical planning conductor — the entry
point for any planning ceremony, with selectable depth (minimum / standard / expanded). Closes
the planning-session status-file creation gap that opens when planning happens without a
planning-branch ceremony, orchestrates downstream operations (planning-branch activation,
worktree spawn, status-file creation) for the configuration, and adds the
`refine-plan-loop` workflow (planning-side analogue to process-task-loop) for the expanded
depth. Preserves ARC's lightweight default planning experience (minimum depth) while supporting
deeper shaping when work warrants it.

- Plan: `feature/plan-arc-plan-conductor.md`
- Upstream: Interlock Foundation (status-file plumbing the conductor consumes); ARCd Rebrand
  (rebrand-ready terminology in new content)
- Downstream: Operating Modes (planning workflow support available for PRD drafting); Worktree
  Foundation and Agile WU Lifecycle integrations land incrementally

**ARC Operating Modes** — After arc-plan Conductor

Establish ARC's mode architecture — a lightweight mode (ARC Lite) for small projects preserving
execution discipline without lifecycle ceremony, and a local/untracked mode for constrained
environments where ARC can't be committed to the repo. Shift lifecycle (paused / waiting-for
state transitions) enters this WU as a prerequisite delivered by Work-Unit Mobility, not as
bundled scope — modes composes with the lifecycle subsystem to make Local Full viable.

- Plan: `feature/plan-arc-modes.md` (PRD-ready, 59-item deliverables inventory)
- Upstream: ARCd Rebrand (settled naming and key renames), arc-plan Conductor (planning
  workflow tooling for PRD drafting), Worktree Foundation (shift lifecycle available),
  Concurrent Work Conventions (concurrent-work conventions inform mode-specific guidance)
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
   │     │     │     │     │     │     │     │     ├──► Session-Operational Flow (ADR-016 frame)
   │     │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     │     ├──► User Sync UX Polish       ─┐    (first wave: three
   │     │     │     │     │     │     │     │     │     ├──► Coord Probe                 │     parallelize after frame)
   │     │     │     │     │     │     │     │     │     ├──► Worktree Foundation        ─┤
   │     │     │     │     │     │     │     │     │     │                                │
   │     │     │     │     │     │     │     │     │     ├──► Agile WU Lifecycle          ├──► ARCd Rebrand
   │     │     │     │     │     │     │     │     │     │      (after Worktree Foundation)│
   │     │     │     │     │     │     │     │     │     │                                │
   │     │     │     │     │     │     │     │     │     ├──► Concurrent Work Conventions │
   │     │     │     │     │     │     │     │     │     │      (after Agile WU Lifecycle)│
   │     │     │     │     │     │     │     │     │     │                                │
   │     │     │     │     │     │     │     │     │     ├──► Quality Gate Tiers + Hooks ─┘
   │     │     │     │     │     │     │     │     │     │      (after Concurrent Work Conventions;
   │     │     │     │     │     │     │     │     │     │       gate-tier mapping per WU tier)
   │     │     │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     │     │     ├──► arc-plan Conductor
   │     │     │     │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     │     │     │     ├──► Operating Modes (Lite + Local)
   │     │     │     │     │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     │     │     │     │     ├──► Dogfooding (iterate 0.x.y)
   │     │     │     │     │     │     │     │     │     │     │     │     │     │
   │     │     │     │     │     │     │     │     │     │     │     │     │     └──► WU5 (Public Release, 1.0)
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

- **2026-04-27**: Session-Init Optimization complete and archived to
  `archive/2026-q2/technical/04_session-init-optimization/`. Session-Operational Flow
  activated to planning on `technical/plan-session-operational-flow` (batch branch carrying
  archival + planning together).
- **2026-04-24**: Session-Operational Flow WU added as `technical/plan-session-operational-flow.md`,
  anchored by ADR-016 (Adopt Configurable Autonomy Gates for Session Operations, Proposed).
  Surfaced during pre-PRD exploration of User Sync UX Polish — the `user.sync_push: always`
  incoherence (notes push without commits) revealed a missing shared frame for session-operational
  flow that was blocking coherent design across User Sync UX, Work-Unit Mobility, and Quality Gate
  Hooks. ADR-016 establishes the interlock model (task → commit → push → integrate linear stack with
  invariant endpoints; handoff as orthogonal ceremony); `plan-session-operational-flow` executes
  the frame (constitutional amendments, status-file timing split, configuration surface, autonomy
  modes, reversibility protocol, handoff-interior toggle framework). Downgrades "AI never
  initiates commits" from non-negotiable principle to configurable default; elevates task-interlock
  review and integration-interlock human authority as real invariants. Reshapes three downstream
  plans: User Sync UX lightens (auto-push becomes handoff-interior toggle instantiation), Quality
  Gate Hooks gains canonical gate vocabulary + handoff-gate stage, Work-Unit Mobility adds
  async-merge integration-surface audit + concurrent-session posture reconciliation +
  status-field rotation classification. New sequencing: Session-Init Optimization →
  Session-Operational Flow → {User Sync UX || Work-Unit Mobility || Quality Gate Hooks}
  (parallelize after frame lands) → ARCd Rebrand → Expanded Planning Path → Operating Modes →
  Dogfooding → WU5. External research validated interlock-model alignment with industrial SWE practice
  (Spinnaker manual judgment, GitHub Environments, Atlantis, Terraform autonomy tiers,
  Conventional Changelog boundary-consolidation); three honest-framing points where industry
  precedent is absent or mixed absorbed into ADR Context.
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
