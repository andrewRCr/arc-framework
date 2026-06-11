# Task List: concurrent-work-doctrine

- **Design:** `spec-concurrent-work-doctrine.md`

---

## **Phase 1:** `assess-parallel-fit` method — the codified judgment

_Purpose:_ Author the new method as the single invocable home for the advisory
parallelize-vs-serialize-or-coordinate judgment — body and all — in both Framework copies. Authored ahead of
the strategy so the doctrine references a concrete artifact, keeping the rubric in the method and out of the
strategy (DRY across the fire-sites that consume it).

_Design decisions:_ Method-before-strategy authoring order; standard method shape mirrored from
`classify-work-unit` / `resolve-planning-depth`. Full rationale in `notes-concurrent-work-doctrine.md`.

### `[ ]` **1.1 Scaffold the method file with standard method shape (R15)**

- _Goal:_ `assess-parallel-fit.md` exists in `system/methods/` with the standard method skeleton, ready for the
  body fill — the single invocable home the fire-sites and strategy reference.

    - Mirror the shape of `classify-work-unit.md` / `resolve-planning-depth.md`: frontmatter
      (`name` / `description` / `override-active: false`), the `> Workflow / When / Contract` blockquote, the
      `## assess-parallel-fit.override` slot (`[No override configured]`), and the `## assess-parallel-fit.default`
      body section.
    - `description`: one line — the advisory parallelize-vs-serialize-or-coordinate judgment over in-flight overlap.
    - Set the `Workflow:` host list to the three consuming hosts — `activate-work-unit`, `run-errand`,
      `session-init` (declaration-style differs; wired in 2.2).

### `[ ]` **1.2 Author the overlap rubric and evidence-tiering body**

- _Goal:_ The method body resolves an overlap read into a clear posture and scales the read to the evidence
  actually available, so a thin-input candidate gets a conservative call rather than a false-confident one.

    - `[ ]` **1.2.a Overlap rubric (R16)**
        - The three-way outcome mapping: disjoint domain → **proceed**; shared module / strategy / load-bearing
          infra → **flag and consider sequencing**; foreign-owned overlap → **coordinate**.

    - `[ ]` **1.2.b Evidence-tiering ladder (R17)**
        - Tier 1 (**always**): `Purpose` / meta scope fields — the coarse baseline; for a bare Ready stub this is
          all there is, so the read leans conservative.
        - Tier 2 (**escalate**): the candidate's richest authored artifact (`draft-*` → `spec-*`) when it exists
          _and_ the cheap read is ambiguous or flags possible overlap — lifecycle-relative.
        - Tier 3 (**cohort siblings**): consult the `cohort-*` file first — its dependency edges + Shared-contracts
          section are the primary, most-authoritative input for intra-cohort parallelism.

### `[ ]` **1.3 Author self/foreign asymmetry, proportionality guard, and multi-candidate pick-time layer**

- _Goal:_ The body distinguishes reorder-freely self-overlap from coordinate-required foreign-overlap, holds the
  read advisory-not-gating, and adds a subset-selection layer for the multi-candidate pick surface.

- _Note:_ The self/foreign asymmetry keys on the single-owner-WU model that `single-owner-wu-model` supplies;
  consumed **by reference** (the doctrine points at a convention the sibling later enforces), so this is authorable
  ahead of that sibling shipping — per the spec's sibling-consumption-by-reference framing.

    - `[ ]` **1.3.a Self/foreign asymmetry (R18)**
        - Single-owner WUs make this the entire "all-owner" addition: self-overlap → reorder freely;
          foreign-overlap → coordinate.

    - `[ ]` **1.3.b Proportionality guard (R19)**
        - Advisory, **never gating** — the behind-base detector is the real net. Default to the light read; deepen
          only on a flag worth resolving before committing to parallel. Never a pre-emptive heavyweight
          conflict-eval of every candidate.

    - `[ ]` **1.3.c Multi-candidate pick-time selection layer (R20)**
        - For the ROADMAP-read surface, where the judgment is subset-selection not a single go/no-go: a WIP cap
          (the modest-concurrency posture), prefer disjoint-domain picks, don't stack two same-module Ready WUs.

### `[ ]` **1.4 Mirror the method to package source (two-copy discipline)**

- _Goal:_ The `assess-parallel-fit` method exists in both the package source and the `.arc/` instance, byte-aligned
  — package source authoritative.

- **Strategies:** strategy-package-project-sync.md

    - Place the method at `packages/arc-framework/arc/system/methods/assess-parallel-fit.md` (canonical) and
      `.arc/system/methods/assess-parallel-fit.md` (instance). Framework file — copies are identical; the
      pre-commit two-copy hook gates a one-sided stage.

## **Phase 2:** Fire-site wiring

_Purpose:_ Wire `assess-parallel-fit` into its three fire-sites against shipped In-Flight Awareness / Errand
Enablement reality — declaring it where every run of a host needs it and loading it on-demand where only some
session-init arms do — by consuming the already-emitted advisory facts (audit-don't-rebuild), not a rebuilt CLI
or a new fire-point.

_Design decisions:_ The WU's real codebase-grounding surface (the spec's resolve-during-work open question).
Load discipline splits by host: unconditional hosts declare in frontmatter; `session-init` is arm-conditional, so
it loads on-demand only on the arms that read overlap — never on every init.

### `[ ]` **2.1 Confirm each fire-site's shipped advisory-fact source (R21)**

- _Goal:_ Each surface's exact advisory-fact source and consumption shape is settled, so wiring consumes
  already-emitted facts rather than re-deriving overlap.

- _Approach:_ Audit-don't-rebuild — confirm against the shipped surfaces before wiring (a later session may
  execute this, so re-verify the names still hold).

    - `[ ]` **2.1.a Errand surface**
        - `arc errand check --json` emits `{overlaps: [...]}` (`handlers/errand.ts`) — advisory, never blocks.
          Consume those facts at `run-errand` Launch.

    - `[ ]` **2.1.b Activation / cold-start / materialize**
        - The session-init probe already carries the in-flight slice; `arc active in-flight` is the standalone
          oracle-backed set. Consume the emitted probe data — don't re-shell to re-derive overlap.

    - `[ ]` **2.1.c Pick-time / next-work-discovery**
        - The session-init discovery arm is a clean on-demand invocation point — no thin host needed.

### `[ ]` **2.2 Wire the method at the three fire-site surfaces with the right load discipline (R21)**

- _Goal:_ `assess-parallel-fit` is invoked at all three surfaces, declared in frontmatter where every run of the
  host needs it and loaded on-demand where only some session-init arms do — applying the rubric to the
  already-emitted advisory facts.

- **Strategies:** strategy-workflow-authoring.md

- _Note:_ The load-style split is deliberate. `activate-work-unit` and `run-errand` need the read on every run, so
  they declare the method in frontmatter; `session-init` runs every session but needs it on only a few arms, so it
  loads on-demand there rather than taxing every init — the same arm-conditional pattern session-init already uses
  for the lifecycle workflow and domain rules.

    - `[ ]` **2.2.a Activation host — frontmatter declaration**
        - Add `assess-parallel-fit` to `activate-work-unit.md`'s `arc.methods`; invoke at the activation overlap
          read. Every activation needs it, so unconditional load is correct.

    - `[ ]` **2.2.b Errand host — frontmatter declaration**
        - Add `assess-parallel-fit` to `run-errand.md`'s `arc.methods`; invoke at Launch over the
          `arc errand check --json` facts. Every errand needs it.

    - `[ ]` **2.2.c Session-init arms — arm-gated on-demand load**
        - Do **not** declare the method in `session-init.md` frontmatter. Instruct an on-demand load at the arms
          that read overlap — pick-time / next-work-discovery (the R20 selection) and the cold-start
          in-flight-scope-check / materialize dispatch — so it never loads on resume or every init.

### `[ ]` **2.3 Mirror the host-workflow edits to package source**

- _Goal:_ Every host-workflow frontmatter and invocation edit lands in both the package source and the `.arc/`
  instance, copies matching.

- **Strategies:** strategy-package-project-sync.md

    - Sync the three touched host workflows (`activate-work-unit`, `run-errand`, `session-init`) across both copies.
      The method itself mirrors in 1.4; the strategy (with the all-owner gate) mirrors in 3.5.

## **Phase 3:** `strategy-concurrent-work.md` — adopter-facing doctrine

_Purpose:_ Author the new sibling strategy covering when/why to parallelize, branch/rebase plus append-only
discipline, merge-ordering, worktree operations, async-merge, anti-patterns, philosophy-checkpoint coverage,
the shared-file conventions, and the all-owner gate over entry-level writes — light-hand, referencing (not
restating) the method rubric and the work-organization-owned ROADMAP/cohort content. Index and cross-reference
it, hold audience discipline, and mirror to package source.

_Design decisions:_ Reference-don't-duplicate for ROADMAP-regen and cohort-model content
(`strategy-work-organization` owns it); sibling to — not extending — `strategy-team-coordination`. The largest
deliverable; a candidate to split if review boundaries want finer slices.

### `[ ]` **3.1 Scaffold the strategy, index it, and reconcile sibling cross-references**

- _Goal:_ `strategy-concurrent-work.md` exists as a sibling to `strategy-team-coordination.md`, listed in
  `STRATEGY-INDEX.md`, with bidirectional sibling links, opening on the worktree-by-default rationale.

- **Strategies:** strategy-team-coordination.md, strategy-work-organization.md

    - `[ ]` **3.1.a Scaffold + worktree-by-default rationale (R1)**
        - Why ARC departs from the solo-developer norm (multi-agent isolation primary, frictionless parallelism
          secondary); discovery/cleanup discipline; risks (worktree accumulation, "which worktree am I in").

    - `[ ]` **3.1.b `STRATEGY-INDEX.md` entry**
        - Add the index row with a consult-when line.

    - `[ ]` **3.1.c Sibling cross-references (Success Criterion 8)**
        - Link from `strategy-team-coordination` to `strategy-concurrent-work` and back. `STRATEGY-INDEX` is the
          discoverability home — no DEV-RULES pointer is added (none exists today, so the DEV-RULES clause of
          Success Criterion 8 is satisfied trivially).

### `[ ]` **3.2 Author parallelize-vs-serialize, posture, anti-patterns, and philosophy-checkpoints**

- _Goal:_ The strategy frames the parallelize-vs-serialize decision and the modest-concurrency posture, names
  when to abandon parallelism, gives soft anti-pattern guidance, and explicitly covers the affected philosophy
  checkpoints — judgment guidance, not enforced rules.

    - `[ ]` **3.2.a Parallelize-vs-serialize framing and posture (R2)**
        - Frame the decision and the posture (principled at ≈2–3 concurrent; heavier concurrency the adopter's
          call, may strain P2 bandwidth). Reference `assess-parallel-fit` for the procedure — no rubric body
          restated here.

    - `[ ]` **3.2.b When to abandon parallelism (R8)**
        - Heuristics (conflict-resolution time exceeding ≈30% of savings; rebase count exceeding ≈3; semantic
          drift) and recovery (merge one, abandon the other, redo as a unified WU).

    - `[ ]` **3.2.c Soft anti-pattern guidance (R9)**
        - Single-thread attention, avoid same-domain concurrents (attention-residue), review-increment-boundary
          discipline when switching worktrees; explicit calibration against the agentic worktree-tool idiom
          (many/fast/less-reviewed — the opposite posture; surface the tension).

    - `[ ]` **3.2.d Philosophy-checkpoint coverage (R13)**
        - P2 (parallelism between WUs not within; per-task stop preserved), P5 (worktree-local SESSION-NOTES is
          correct WU-scoped context), P7 (one task at a time; soft swap at review-increment boundaries), and the
          honest stance (ARC won't block two sessions but documents that heavy concurrency may violate P2).

### `[ ]` **3.3 Author the operational core — branch/rebase, append-only, merge, worktree, async-merge**

- _Goal:_ The strategy codifies the day-to-day operational discipline that keeps concurrent branches integrable
  and cross-machine-safe, from rebase cadence through worktree hygiene and the awaiting-review regime.

- **Strategies:** strategy-work-organization.md, strategy-session-operations.md, strategy-team-coordination.md

- _Notes:_ R4 narrates the behind-base detector that `merge-safety-mechanism` owns; R7's lifecycle mechanism is
  `async-merge-lifecycle`'s — reference, don't rebuild. R4's git-branch-safety framing is load-bearing; the
  storage-evolution _reasoning_ behind it stays in the ADR (R26), not here.

    - `[ ]` **3.3.a Branch and rebase discipline (R3)**
        - Periodic-rebase-onto-main vs. end-of-flight trade-off (≈2-day lifetime threshold); `rerere` for
          periodic-rebase teams; "Update branch" workflows; merge-vs-rebase choice and its review consequences.

    - `[ ]` **3.3.b Append-only-until-integration (R4)**
        - A pushed WU branch is append-only mid-flight (activation → integration): add commits + fast-forward-push
          only; never rebase/amend already-pushed commits. Default: don't bring `main` in; if genuinely needed,
          **merge** `main` (ancestry-preserving), never rebase onto it. Integration is the single sanctioned
          rewrite point; cross-machine resume is always `pull --ff-only` / `arc sync`. Framed as git-branch-safety
          for shared history — never "the branch is your permanent multi-machine state store." Owns the convention;
          narrates `merge-safety-mechanism` as the detection backstop.

    - `[ ]` **3.3.c Merge ordering between concurrent WUs (R5)**
        - First-in-wins vs. explicit serialization; "merge after #X" PR-label conventions; merge-queue interaction
          (GitHub merge queue, Mergify). Errand `chore/` branches are mini-PRs riding the same ordering discipline.

    - `[ ]` **3.3.d Worktree operational guidance (R6)**
        - Merges from the primary (or a dedicated merge) worktree; refetch/rebase other worktrees post-merge;
          `git worktree remove` over `rm -rf`; stale-reference recovery; cross-worktree state after a rebase;
          sync-all-worktrees. Tool composition: honor an external tool's naming/cleanup/location conventions, don't
          relocate tool-managed worktrees; ARC's structural discipline applies regardless of who spawned the
          worktree.

    - `[ ]` **3.3.e Async-merge guidance (R7)**
        - Managing WUs through awaiting-review latency (days to a week); how `Integrating` interacts with
          session-handoff, archival, and worktree cleanup; soft conventions for the post-PR-pre-merge state.

    - `[ ]` **3.3.f Main-worktree-under-full-protection convention (R10)**
        - "Your main worktree is not always on main": under `branch.protection: full` the main worktree specializes
          for admin/coordination (planning branches, archive branches, cross-WU backlog edits) while WU worktrees
          handle feature work.

### `[ ]` **3.4 Author team-mode orthogonality, the ROADMAP overlay, and shared-state conventions**

- _Goal:_ The strategy disambiguates concurrent-work from team mode, states the ROADMAP concurrency-safety overlay
  as an on-contact convention, gives the shared-file conventions, and states the all-owner gate over entry-level
  writes — referencing work-organization-owned content rather than duplicating it.

- **Strategies:** strategy-work-organization.md, strategy-team-coordination.md

- _Note:_ Resolves the spec's inline-vs-cross-reference open question — lean reference (ADR-020/024-owned content
  stays in `strategy-work-organization`).

    - `[ ]` **3.4.a Team-mode orthogonality (R11)**
        - Orthogonal axes: team mode governs cross-identity coordination; concurrent-work governs multi-WU
          mechanics, applying per-WU whether the other in-flight WUs are yours or a teammate's. Both coexist;
          neither requires the other.

    - `[ ]` **3.4.b ROADMAP concurrency-safety overlay (R12)**
        - On-contact convention, not a rendered/computed field — coarse and conservative. Any hand-curated parallel
          view is a **sibling** artifact, never baked into the derived ROADMAP. Contributes only the "Next"-slice
          convention; renderer/horizon mode stay `roadmap-tooling`'s.

    - `[ ]` **3.4.c Shared-file concurrency conventions (R14)**
        - Derived shared state (ROADMAP) is in-git-solvable via deterministic regeneration at one serialization
          point (post-merge on the integration branch, never hand-edited on feature branches); mutated shared
          state (inbox drains, human-editable ordering) is **not** in-git-solvable (backend territory — reference,
          don't solve); `cohort-{name}.md` rides per-member partition + the behind-base net (partition-first;
          errand-through-primary escape hatch). Reference rather than duplicate where this restates
          `strategy-work-organization`.

    - `[ ]` **3.4.d All-owner gate at entry-level writes (R22)**
        - Extend the advisory foreign-artifact gate from file-level to entry-level writes: the entry-level
          re-homing of foreign-owned atomics folds into the same all-owner gate. Convention only — the detection /
          surfacing **mechanism** is `merge-safety-mechanism`'s write-context extensions (a Non-Goal here); state
          the gate and its delegation boundary, not a detector.

### `[ ]` **3.5 Audience-discipline light-hand pass, then mirror to package source**

- _Goal:_ The strategy reads as clean adopter-facing doctrine — no leak patterns — and the package-source copy
  matches the instance.

- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **3.5.a Audience-discipline scan (R27, Success Criterion 4)**
        - Verify the doc excludes research citations, the rejected-alternatives ledger, the 2026-06-10 incident
          retelling, `strategy-storage-evolution` references, internal-roadmap forward-pointers (sibling/other-cohort
          WU names as in-flight scope), and `adopter`-POV framing. Route any internal "why" to the ADR; state the
          model and conventions, don't justify beyond operational need.

    - `[ ]` **3.5.b Mirror the strategy to package source**
        - Place at `packages/arc-framework/arc/reference/strategies/arc/strategy-concurrent-work.md` and the
          `.arc/` instance; copies identical.

## **Phase 4:** `adr-025` — durable rationale (internal-only)

_Purpose:_ Record the durable architectural decision — advisory conventions plus one hard append-only invariant
— sourced from `notes-concurrent-work-doctrine.md`: conventions-over-tooling, the focus-role rejection, the
append-only invariant, team-mode orthogonality, and the storage forward-compat reasoning; citing the five
research files and anchoring the governing ADRs. Internal-only; no package mirror.

_Design decisions:_ Authored last so it records what actually shipped; a single ADR (not split) per the
open-question lean; `.arc/`-only per the architecture-documentation boundary.

### `[ ]` **4.1 Create `adr-025` and record the four decisions**

- _Goal:_ `adr-025-*.md` exists in `reference/adr/`, recording the decision (advisory conventions + one hard
  append-only invariant; no focus-role field; no overlap-prediction tooling) with each of the four decisions'
  context and rationale.

- **Strategies:** strategy-adr-methodology.md

- _Note:_ Internal-only; sourced from `notes-concurrent-work-doctrine.md`, which holds the full rationale.

    - `[ ]` **4.1.a Scaffold `adr-025` (R23, Success Criterion 3)**
        - Standard ADR structure (per `strategy-adr-methodology` + a recent ADR as template); confirm `025` is the
          next sequential number at authoring time.

    - `[ ]` **4.1.b Conventions-over-tooling posture (R24)**
        - Doctrine over mechanism; the no-overlap-prediction-tooling decision (O(n²), false-positive-prone,
          non-idiomatic).

    - `[ ]` **4.1.c Focus-role-field rejection (R24)**
        - The rejection with its external-research grounding (two independent directions: PM-tool survey,
          worktree-tool convergence) and the cost ledger.

    - `[ ]` **4.1.d Append-only-until-integration rationale (R24)**
        - The invariant's rationale, including the 2026-06-10 incident as grounding (rebase + force-push orphaned a
          second machine's tip; recovered via `reset --hard origin/<branch>`).

    - `[ ]` **4.1.e Self/foreign asymmetry and team-mode orthogonality decisions (R24)**
        - The self/foreign asymmetry decision and the sibling-to-team-mode (orthogonal axes) decision.

### `[ ]` **4.2 Cite the research base, anchor the governing ADRs, and record forward-compat reasoning**

- _Goal:_ The ADR cites the five research files in place (the strategy cites none), anchors the governing ADRs,
  and records the storage forward-compat reasoning — kept internal to the ADR, invisible to the doctrine.

- **Strategies:** strategy-adr-methodology.md, strategy-storage-evolution.md

    - `[ ]` **4.2.a Cite the five research files (R25)**
        - `research-focus-wip-attention-discipline`, `research-active-work-coordination-vocabulary`,
          `research-concurrent-work-mechanism-layer`, `research-integration-conflict-handling`,
          `research-worktree-tool-convergence` — cited in place.

    - `[ ]` **4.2.b Anchor the governing ADRs (R25)**
        - adr-019 (single-branch-per-WU substrate), adr-020 (derived-vs-mutated split), adr-021 (errand `chore/`
          branches), adr-022 (managed-doc merge correctness), adr-024 (cohort model).

    - `[ ]` **4.2.c Storage forward-compat reasoning (R26, Success Criterion 5)**
        - Append-only framed as git-branch-safety is tier-1, not permanent (operational WU state syncs via the
          materialized backing store, not the code branch); checked against `strategy-storage-evolution`
          Principles 2 & 5. Internal to the ADR.

## **Phase 5:** Verification

_Purpose:_ Validate all eight Success Criteria — including the audience-discipline and internal-only scans, the
`WORKING-MEMORY` vanilla-git-fallback note discharge (Success Criterion 7), and markdown lint across both
copies.

### `[ ]` **5.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` `strategy-concurrent-work.md` exists as a sibling to `strategy-team-coordination.md`, indexed in
  `STRATEGY-INDEX.md`, covering R1–R14, and passing markdown lint
- `[ ]` `assess-parallel-fit` exists in `system/methods/` with standard method shape, is declared in the
  relevant workflow frontmatter and invoked at the three fire-site surfaces, with no rubric body duplicated into
  the strategy
- `[ ]` `adr-025` exists in `reference/adr/`, records the four decisions, cites the five research files, and is
  internal-only (no adopter-facing surface references it)
- `[ ]` Audience discipline holds — the strategy contains no leak patterns (research citations,
  rejected-alternatives ledger, incident retelling, storage-evolution reference, internal-roadmap
  forward-pointers, `adopter`-POV framing)
- `[ ]` Forward-compat holds — append-only is framed as git-branch-safety, not branch-as-permanent-state-store;
  the storage-evolution reasoning lives only in the ADR
- `[ ]` The team-mode relationship is stated unambiguously — a reader cannot conclude team mode is required to
  run multiple WUs
- `[ ]` The standing `WORKING-MEMORY` vanilla-git-fallback note is discharged on ship
- `[ ]` Cross-references reconciled — `strategy-team-coordination` sibling links land on both sides; any
  DEV-RULES pointer to the doctrine resolves
- `[ ]` All quality gates pass (markdown lint, and any touched-code gates)
- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
