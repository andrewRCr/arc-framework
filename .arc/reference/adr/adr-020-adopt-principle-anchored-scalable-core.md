# ADR-020: Adopt a Principle-Anchored Scalable Core

## Status

Proposed.

Reframes the PM-mode model of [ADR-009][adr-009] (three discrete `pm.mode` values) and builds on the
work-unit-lifecycle reform of [ADR-019][adr-019] (always-present `meta-*`, tier-invariant disciplines).
On acceptance and implementation, partially supersedes ADR-009 — specifically its three-value mode enum,
which this ADR replaces with orthogonal toggles. ADR-009's mechanism-not-audience framing is preserved.

## Context

ARC selects project-management behavior through `pm.mode: none | arc-in-git | external` — three discrete,
mutually exclusive shapes. Alongside it sit further mode-shaped axes (Lite/Full, Local, `team.mode`). The
11 principles, however, already define ARC's identity as a small **principle** core (P1–P11, non-negotiable)
plus **conventions** (strong defaults, replaceable) that implement them — and the principles' own text
writes the scaling carve-outs directly (P1: spec rigor scales, "quick fixes can rely on well-crafted
commits"; P7: external trackers satisfy tracking; P4: gate strictness scales; P2: review frequency is "a
design variable").

The tension: the mode/config surface **reified what the philosophy defines as continuous
convention-scaling into discrete, sticky, siloed shapes.** A small team using an in-git backlog is a
natural reduction of a single coherent baseline — not a separate "mode." Lite's "no work units, one flat
task list" is a *different core*, not a scaled-down one. The proliferation muddies the model for users and
for maintainers, and resists maintenance.

This was pressure-tested with five scenario traces (solo/module-off, distributed-team/multi-tracker,
module-on+tracker, small-team/module-on, multi-WU growth) against current code, workflows, hooks, and
scaffolding. The decisive finding: **the "modes" are largely a thin config / recipe / prose veneer over
machinery that is already substantially mode-orthogonal** — lifecycle workflows already gate backlog
behavior with explicit skip-arms; the session-init probe never touches the backlog; tracker-sync
extensions fire on active-set membership, not `pm.mode`; the multi-WU resolution path is already
multi-WU-aware. The exclusivity lives in the config enum, the install recipe's conditions, and prose.

Alternatives considered:

- **Option A — extend the enum** (add a value for backlog+tracker combos). Rejected: combinatorial, and it
  addresses neither the invariant floor nor the instruction-load ("judgment tax") problem.
- **Option B — variant docs per mode/tier.** Rejected: non-DRY, unmaintainable.
- **Option C (chosen) — a principle-anchored invariant floor plus convention-scaled layers**, with PM
  expressed as orthogonal toggles and scaling delivered by resolve-then-load composition rather than
  inline branching.

## Decision

We will scale ARC around a principle-anchored core. Specifically:

1. **The scalable core is the principle/convention split, made structural.** P1–P11 are the irreducible
   identity; everything the modes / Lite / Full encode is convention-level scaling. ARC scales by
   **depth and footprint, not by swapping shapes.**

2. **Invariant floor (quick tier and above), regardless of any toggle:** every work unit always carries a
   `meta-*` file; a **spec as a separate document** (scaling from a full PRD down to a single paragraph via
   a template family — never folded into a task-list `## Scope` header); a parseable task list; and the
   tier-invariant execution disciplines (review increments, task/commit/workflow interlocks, quality
   gates). Intent-verification against the spec is always present.

3. **Atomic tier is the one deliberate floor exception:** no task list; the spec is materialized as the
   commit message (per P1), not a separate document; intent-verification collapses into commit/PR
   self-review. Atomic is gated — default tier is quick, atomic is explicit opt-in, demotion is forbidden.

4. **Scale grammar, never scale discipline.** What scales: phase-grouping (flat at quick, phased at
   standard), verification-as-explicit-phase vs. gate-check, spec weight, plan/PRD presence, and
   generation-workflow ceremony. What never scales: review increments, the interlocks, quality gates,
   *that* intent-verification happens, and `meta-*` + spec-in-some-form.

5. **Intent-verification scales with the intent→implementation gap, which is what the tier encodes.**
   Success criteria must be falsifiable against the spec; if not even one can be written, the work is
   atomic, not quick. Tier classification is therefore the guard against vacuous verification.

6. **PM modes become orthogonal toggles.** The project layer (backlog, ROADMAP, inboxes) is anchored to no
   principle and is therefore the toggle zone.
    - **Planning Module** (boolean): when on, ARC owns the pre-active pipeline — `backlog/` staging
      (`planned/`, `provisional/`), the generated `ROADMAP.md`, and the project-shared drain inboxes. When
      off, work units are born directly in `active/`.
    - **Tracker integration is orthogonal** (an independent axis, not a mode), expressed via the per-WU
      `Origin` field plus a project-level integration pointer. **`external` ceases to be a config value:**
      it is `module-off + tracker-configured`; `none` is `module-off + no tracker`. The combination
      `module-on + tracker` (in-git backlog *and* `Origin`s linked to an external tracker) — inexpressible
      under the enum — becomes valid.
    - **Archive is a separate, orthogonal toggle** (`archive.preserve`): preserve completed artifacts to
      `completed/`, or delete on integration. Principle-safe because git is the durable record (P6); the
      archival surface is convention (P10). What the toggle trades is a durable *synthesis* layer (per the
      synthesis-vs-record distinction in `plan-documentation-surface-routing.md`), not the record itself.
      Default: preserve.

7. **The Planning Module is not concurrency-safe, by design — and the boundary is precise.** Coordination
   across writers is out-of-band (Slack, standup), consistent with observed agentic-team practice.
   Derived shared state (ROADMAP) **is** solvable in-git: it is a pure projection over branch-isolated
   `meta-*` files, so deterministic regeneration at a single serialization point (post-merge on the
   integration branch) makes it conflict-free. Mutated shared state (inbox drains, any human-editable
   priority/ordering) is **not** solvable in-git — git's line-merge is not a CRDT (concurrent appends to a
   queue's tail conflict; edits/reordering conflict regardless of sharding), so it is the canonical-store
   responsibility of the future backend (`plan-arc-backend.md`). Partial in-git mitigations exist
   (serialization-point ROADMAP regen; `merge=union` for inbox appends, with the caveat that union loses
   intentional deletions) but do not close the mutable-state gap.

8. **Defaults: everything on, with guided opt-down at init.** `01_verify-and-configure` runs an
   agent-assisted walkthrough that queries team size and shape and, for larger or distributed teams,
   explicitly surfaces the concurrency limitation and recommends — does not force — the tracker path. The
   default is not branched on team size (that would re-introduce the matrix); the nuance lives in the
   guided walkthrough as informed consent. This preserves ADR-009's "honest documentation, not gatekeeping."

9. **Scaling is delivered by resolve-then-load, not carry-and-skip.** The probe already resolves the active
   configuration; workflows should load only the fragments that apply, so simple cases never carry
   complex-case instructions and the per-invocation instruction load ("judgment tax") becomes opt-in by
   configuration. Prefer conditionally-loaded fragments (the extension / active-set mechanism — already
   ARC's clean composition surface) over inline mode/tier conditionals; extract whole conditional steps,
   keep fine-grained intra-step branches inline. The mechanism's design is deferred to a dedicated work
   unit (`plan-composable-workflows.md`) and the planning conductor; this ADR establishes the requirement
   and direction.

## Consequences

### Positive

- One coherent mental model that scales in either direction; siloed modes and the implicit config matrix
  collapse to roughly two toggles plus a tracker pointer.
- Every tier — including the smallest project — gets a principled structure (work unit, spec, verification),
  rather than a degenerate "one big phase" shape.
- The previously-inexpressible `module-on + tracker` combination (in-git backlog with external linkage)
  becomes a first-class configuration.
- The reform's *behavioral* surface is small: because the underlying machinery is already largely
  mode-orthogonal, the work concentrates in the config model, the install recipe, scaffolding/validation,
  prose, and a handful of specific workflow seams.

### Negative

- The real implementation payload is **workflow reform**, not artifact restructuring: `1_create-prd`,
  `2_generate-tasks`, and the lifecycle workflows must scale their ceremony to tier.
- Resolve-then-load adds composition indirection and a real navigability concern for `system/workflows/`
  (deferred to `plan-composable-workflows.md`).
- The external-integration setup surface is currently implicit and scattered
  (`01_verify-and-configure` + `commit-footer.md` `.override` + the `post-task-completion` extension +
  the `external`-gated `03_configure-external-integration.md`) and needs consolidation/de-gating.
- Several sibling work units must absorb steers (see Coordination).

### Risks

- The "teams coordinate out-of-band" premise is load-bearing for the default-on stance; it rests on
  external research and is unenforced by design (mitigated by the informed-consent init walkthrough).
- Resolve-then-load could explode into edge cases or fragment proliferation if the core/extension boundary
  is drawn poorly — unvalidated until the composable-workflows WU designs it.
- The tracker shape (per-WU `Origin` + a project-level pointer) is inherited from prior planning, not yet
  synthesized as optimal; left open (see Coordination).

## Coordination

This ADR is a coordinating north star for several in-flight work units; it asserts invariants and defers
shape. Cross-references resolve through it.

- **`plan-arc-modes.md`** — the planned `pm.mode → pm.layer` rename changes *shape*, not just name: a
  boolean Planning Module toggle, not a renamed enum. Lite is the core at scaled depth, not a shape-swap
  (no "no work units"). Local stays an orthogonal storage axis. `team.mode → team.enabled` is consistent
  with the toggle direction.
- **`plan-agile-wu-lifecycle.md`** — ratifies the floor; absorbs two steers: (a) the spec is always a
  separate document (kill quick-tier scope-in-header), (b) intent-verification survives at quick tier,
  scaled. The tier model otherwise stands.
- **`plan-arc-plan-conductor.md`** — extend depth-selection / single-entry from planning-entry to the
  lifecycle workflows (init / activate / integrate / archive).
- **`plan-coord-probe.md`** — `pm.mode: external` collapses to `module-off + tracker`; the `coord.adapter`
  surface rebases onto the toggle. Multi-tracker remains foreclosed (per-WU `Origin` is heterogeneous-
  tolerant; the project-level adapter is single).
- **`plan-arc-backend.md`** — sharpened scope: the backend is the canonical store for *mutable shared
  state* (inbox drains, priority/ordering), which is unsolvable in-git by git's nature. Derived state
  (ROADMAP) is not backend-dependent.
- **`plan-concurrent-work-conventions.md`** — the derived-vs-mutated split and the two partial in-git
  mitigations (serialization-point ROADMAP regen; `merge=union` for appends) belong here.
- **`plan-documentation-surface-routing.md`** — owns *what* completion surfaces carry; this ADR owns
  *whether* `completed/` persists. The synthesis-vs-record framing supplies the archive toggle's value-prop.
- **Tracker-shape ownership is open.** Scalable-core defines the tracker *invariants* (orthogonality;
  per-WU `Origin` + project-level pointer; multi-tracker foreclosed). If scalable-core sequences first, it
  is positioned to define the refined shape; otherwise the shape lands at whichever of arc-modes /
  coord-probe leads. Sequencing is undecided; ownership follows it.

## Amending This Document

<!-- Three-tier amendment model (strategy-adr-methodology.md): corrections fixed directly; amendments
appended as dated annotations below; supersession via a new ADR + a Status update here. -->

---

[adr-009]: adr-009-simplify-pm-layers-to-mode-based-selection.md
[adr-019]: adr-019-work-unit-lifecycle-reform.md
