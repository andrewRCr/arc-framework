# Draft: Project State Integrity

- **State:** Draft — pre-spec capture, extracted from the `roadmap-tooling` decomposition (2026-07-06;
  `assess-cohort-fit` verdict: two flat siblings + one dependency edge). Iterate before PRD/spec promotion.
- **Origin:** [internal] — the FP-critical state-integrity slice of `roadmap-tooling`, split out so
  `finalize-parallelism` can unblock on it **alone** (dependency granularity is WU-level; the render-standard +
  rename work stays with a rescoped `roadmap-tooling`, which depends on this WU).
- **Purpose:** Deliver the trustworthy, contention-free project / in-flight state layer ARC's parallelism relies
  on — a roster/oracle that reports true facts under concurrent worktree churn, and a project readiness view that
  resolves by re-render from the meta source of truth rather than by shared-mutable hand-edit.

---

## Problem / Motivation

`finalize-parallelism`'s wave-1 burn-in surfaced the in-flight state layer reporting **false facts**, and the
shared readiness file as a contention hazard under parallelism. Both are hard dependencies of FP's remaining
waves, which must consume a trustworthy state layer rather than characterize a broken one — more urgent than, and
orthogonal to, the render-standard reconciliation + `STATUS.PROJECT` rename the rescoped `roadmap-tooling`
carries. Dependency granularity is WU-level: for FP to unblock on the state-integrity slice alone, that slice
must be its own WU.

- **Roster/oracle non-determinism.** The pre-commit foreign-write advisory (`check-foreign-writes` →
  `detectForeignArtifactOverlap`) reported non-existent cross-WU meta overlaps — `chore/burn-in-probe-b also
  touches meta-finalize-parallelism.md` (and symmetrically at probe-b's activation) — verified false: the probe
  worktrees track only their own artifacts, cut cleanly from `main`, and the detector's own committed-diff +
  uncommitted-status probes return empty. The overlap primitive is sound; the fault is the in-flight **roster
  derivation** (`runActiveInFlight`) feeding it stale/wrong refs during concurrent worktree churn (clustered
  around `arc start --here` reshuffling worktree/branch state), non-deterministic.
- **Shared-mutable contention.** `ROADMAP.md` is a single shared file every WU regenerates and commits (FP and
  probe-b both diff-touch it) — a shared-mutable contention hazard (FP matrix cell 3.2.c). Advisory-only today,
  but state-reporting that lies is a GA blocker for parallelism.

## Scope

- **(A) Oracle/roster determinism.** Harden the in-flight roster derivation (`runActiveInFlight`) so overlap /
  foreign-write reporting is correct and deterministic under concurrent worktree churn — eliminating the
  phantom-overlap false positive FP hit.
- **(B1) Regenerate-wins derived projection.** Resolve `ROADMAP` / `STATUS.PROJECT` as a purely-derived
  projection that resolves by **re-render from the meta source of truth** (regenerate-wins), ending the
  shared-mutable hand-edit contention — rather than a single file every WU rewrites. This is the projection
  **engine**; the render *standard* it applies (columns, tiers, overflow, naming) is the rescoped
  `roadmap-tooling`'s.
- **Dangling-dependency-edge validation.** Dependency satisfaction resolves today by **pending-set absence**
  (`project-view.ts` line ~236): a typo'd or renamed dep target is absent from the scanned
  active/planned/provisional set and is therefore silently treated as satisfied, so a WU can render Ready on an
  unresolvable edge (currently inert — zero dangling edges on `main`, verified). **Reuse the existing lifecycle
  primitive** — `buildLifecycleIndex` + `resolveSlugQuery` (`lib/work-unit/lifecycle-query.ts`, surfaced by `arc
  status <slug>`), which already classifies a slug as `nonexistent` / `shipped` / active-planned-provisional. Wire
  the composer's dep resolution to it: `nonexistent` → dangling (warn), `shipped` → satisfied, pending → blocks.
  No bespoke `completed/` scan. Settle the surfacing mode (render-time advisory vs. a standalone `--check`).

Deliverables stay **model-agnostic to WLSM's coming readiness axis** (see Coordination) — do not hard-bake
"`State` is the sole readiness signal."

## Inbound Buffer — Pending Integration

> *Routed in at the `roadmap-tooling` decomposition (2026-07-06); integrate — or consciously reject — at this
> WU's next planning iteration.*

### `[ ]` **In-flight state-reporting integrity: concurrency-guard the roster + ROADMAP as a single source of truth**

- *Concern:* FP's wave-1 burn-in surfaced the in-flight state layer reporting false facts (roster derivation
  non-determinism feeding the sound overlap primitive stale refs) plus the `ROADMAP.md` shared-mutable contention
  hazard — the (A) and (B1) sources above.
- *Approach:* own the in-flight state layer as a concurrency-guarded **single source of truth**: (1) harden the
  roster/oracle derivation so overlap / foreign-write reporting is deterministic and correct under concurrent
  worktree churn; (2) resolve the ROADMAP/STATUS render as a purely-derived projection (regenerate-wins), not a
  single file every WU rewrites.
- *Priority note:* Hard dependency of `finalize-parallelism`; **required before FP's burn-in waves proceed**. FP's
  meta `Depends On` repoints from `roadmap-tooling` to this WU once it exists (see Coordination — the repoint is a
  post-decompose follow-up, captured in `USER-INBOX` under `WU_Target: finalize-parallelism`).
- *Captured during:* `finalize-parallelism` wave-1 burn-in (foreign-write false positive), 2026-07-06.

### `[ ]` **Add dangling-dependency-edge validation to the readiness renderer**

- *Concern:* the readiness composer (`project-view.ts`) resolves dependency satisfaction by pending-set absence
  (line ~236), so a typo'd/renamed dep is silently treated as satisfied and its WU renders Ready on an
  unresolvable edge. Currently inert (zero dangling edges on `main`, verified). Named in `roadmap-tooling`'s
  original § Scope ("render-time, or a `--check` mode"); deferred out of the `roadmap-renderer-slice` errand
  because it crosses the errand design floor (needs a warning-surfacing channel + the render-time-vs-`--check`
  fork).
- *Approach:* reuse `buildLifecycleIndex` + `resolveSlugQuery` (no bespoke `completed/` scan); `nonexistent` →
  dangling (warn), `shipped` → satisfied, pending → blocks. Adding it to `project-view.ts` diverges it from
  `finalize-parallelism`'s copy — coordinate with FP's renderer absorption so the guard lands once, not twice.
- *Captured during:* `roadmap-renderer-slice` errand — Pass 2 descoped after reading the composer, 2026-07-05.

### `[ ]` **Audit and adopt (or replace) FP's minimal ROADMAP renderer substrate as the projection base**

- *Concern:* `finalize-parallelism` Task 2.4.a may land a narrow deterministic ROADMAP renderer/writer to make
  shell-invoked `arc start` ceremony commits complete before the full render design settles — replacing the
  executor's interim "ROADMAP regen pending" advisory with a real `.arc/backlog/ROADMAP.md` write. It is
  substrate-first: the rendering **base** on which the regenerate-wins projection is built.
- *Approach:* audit and either adopt or replace the FP renderer/writer as the canonical projection-engine
  implementation, reconciling `render.ts` divergence between the copies so the engine lands once. The
  render-**standard** continuation on that base (naming, empty-tier, uniform-columns, overflow policy, STATUS.USER
  writer parity, final CLI surface) stays with the rescoped `roadmap-tooling`.
- *Captured during:* `finalize-parallelism` Task 2.4.a (`arc start` substrate), 2026-07-04.

## Dependencies and Sequencing

- **Upstream:** none — this WU is the base of the render chain. (Work Organization Reform, which established the
  meta-file source of truth and the derived-view algorithm, is shipped.)
- **Downstream:** the rescoped `roadmap-tooling` depends on this WU (render standard + rename atop the trustworthy
  projection engine); `finalize-parallelism` depends on this WU (its burn-in waves need the trustworthy state
  layer) — FP's edge repoints here from `roadmap-tooling` post-decompose.
- **CLI Substrate Adoption** — provides the zod meta-frontmatter schema the roster/projection would parse
  against; preferred to sequence after CSA so parsing is typed, but not a hard gate (a hand-rolled parser is
  viable if landing the state layer earlier is favored — and FP needs this WU now).

## Coordination

- **OSD / ADR-022 (`managed-record-substrate`, render-before-renderer).** `ROADMAP` / `STATUS.PROJECT` is a
  *derived* managed operational-state document (ADR-022): a rendered projection over the meta records. This WU's
  regenerate-wins engine is a render-before-renderer first instance; the general record / reconcile engine later
  absorbs it. Coordinate the engine boundary with `operational-state-docs`; do **not** gate on it (it is
  `cli-substrate-adoption`-gated, and FP needs this WU now). This WU's derived record stays **storage-agnostic** so
  it lifts to the arc-backend tier unchanged (the **B2** materialize-on-demand north star — always-fresh access to
  common hub surfaces under parallelism — is *not* built here; it routes to `parallel-surface-access` / arc-backend).
- **WLSM readiness-axis (forward-compat).** `wu-lifecycle-state-model` will split planning-completeness
  (impl-ready attestation) from scheduling (`State`), adding a readiness axis distinct from today's
  dependency-satisfaction "Ready." This WU's roster/projection must stay open to it — do not hard-bake "`State` is
  the sole readiness signal." Additive when WLSM lands; a blocker for neither this WU nor `roadmap-tooling`.
- **Cross-branch edge / regen-from-incomplete-tree limitation (known gap this WU should address).** Active-WU
  metas live on their own branches, not on `main` (`.arc/active/` is empty on `main`). So a regenerate-wins render
  or an incoming-edge sweep run from `main` sees only backlog metas — it can neither observe in-flight WUs nor
  re-point an incoming `Depends On` edge that lives on another branch (this is precisely why the `roadmap-tooling`
  decomposition had to hand-render ROADMAP and defer FP's edge repoint to a follow-up). A trustworthy state layer
  must resolve the full cross-branch/cross-worktree roster, not just the current checkout's tree — fold this into
  (A)/(B1)'s design (candidate: the worktree-roster oracle as the projection's source, not a single-tree glob).

## Scope Estimate

Heavy — a state-layer correctness concern (oracle determinism + a regenerate-wins projection model + dangling-edge
validation) that a correct design must author before execution, spanning `lib/status/**`, `lib/work-unit/**`, and
the roster oracle. FP's hard blocker.
