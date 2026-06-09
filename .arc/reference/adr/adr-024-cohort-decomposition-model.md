# ADR-024: Adopt a Bounded Cohort Model for Work-Unit Decomposition

## Status

Proposed.

The cohort decomposition model is decided here — one grouping kind (the cohort) with coordination by degree, a
one-level nesting cap, the three decomposition arms with at-cap provenance, a method/workflow split over a
cut-map interface, and no coordinator role. Its realization ships with Decomposition Machinery: the
`AGENT-BRIEF.ARC` vocabulary entry, the `cohort-*` movable-artifact enumeration in DEV-RULES.ARC, the grouping
taxonomy + WU-sizing standard in `strategy-work-organization`, the `assess-cohort-fit` decide method, the
`cohort-{name}.md` record + `template-cohort.md`, the cohort-consistency invariant + its structural guard, and
the `decompose-work-unit` workflow. Promote to Accepted when that work unit integrates. Two forward seams are
non-blocking constraints, not gates: the merge/rebase delivery discipline for a decomposed stack and the
shared-cohort-doc concurrency net (Concurrent Work Conventions), and the durable cross-file step-reference
convention (`composable-workflows`).

## Context

[ADR-019][adr-019] fixed **one branch per work unit** from planning through integration, and
[ADR-021][adr-021] set the lower bound of the work-unit band — the **Errand**, work below the wrapper.
[ADR-023][adr-023] then graded weight *within* the band (`light` / `heavy` / `novel`). What none of these pinned
down is the structure a concern takes when it exceeds a single WU: the **grouping above the WU**, and how a live
WU **decomposes** when it outgrows itself.

The `Cohort` field schema — path-valued, render columns, `backlog/planned/<cohort>/` directories — shipped with
Class Model Foundation, but no surface defined what a cohort *is*, what its constitutive record holds, or how
decomposition produces one. The concept was **used before defined**.

Several forces constrain any answer:

- **No shared mutable cross-branch state.** One-branch-per-WU ([ADR-019][adr-019]) plus per-worktree isolation
  and the relocatability invariant exist precisely to keep each WU's planning artifacts self-contained on its
  own branch. A grouping model that reintroduces one spec/task-list edited from many branches would breach
  exactly what those decisions protect.
- **Membership is derived, not maintained.** Per [ADR-022][adr-022] the meta record is the source of truth;
  cohort membership must derive from each WU's `Cohort` field, never a hand-kept roster that drifts.
- **Agent-loadable, anti-sprawl, role-free.** The model must be discrete enough to resolve-then-load
  ([ADR-020][adr-020]), bounded enough not to grow an unbrowsable tree, and must not mint a coordinator role
  with nothing load-bearing to do.

### Alternatives considered

- **Model A — one WU sliced into stacked PRs.** Rejected on three grounds, weakest to strongest: (1)
  one-branch-per-WU ([ADR-019][adr-019]) makes "one WU across many branches" inexpressible — it can only collapse
  into a stack of *WUs*, which is Model B's delivery mode; (2) ARC's review grain is already sub-PR (per-task
  increment), so Model A's "split for smaller reviewable units" benefit is largely absorbed; (3) decisive — Model
  A forces a shared mutable spec + task list across branches, the exact cross-branch shared-mutable state
  worktree isolation and relocatability prevent. External practice corroborates: one-RFC-to-many-PRs works at
  enterprise scale "only because they accept spec drift."
- **Size as the decomposition discriminator.** Rejected — size over-decomposes coupled work and under-decomposes
  wide-but-small work. Concern multiplicity (orthogonal, independently deliverable subsystems) is the real
  trigger; LOC across *unrelated* subsystems is a corroborating heads-up, never primary.
- **A categorical theme / cohort / sub-cohort tier set.** Rejected — making "theme" a distinct doc-less tier
  broke at the single-segment `Cohort` value, where a theme and a genuine top-level cohort are syntactically
  identical and separable only by doc-presence. One grouping kind with a Purpose-floor doc (coordination by
  degree) dissolves the wrinkle and removes a doc-less exception the constitutive-doc rule would have to carve
  around.
- **A maintained roster / minted identifier for at-cap decomposition.** Rejected — it re-mints the grouping node
  the nesting cap denied, adds a second source of truth against membership-is-derived, and sits invisible to the
  cohort-consistency invariant (which keys on the `Cohort` path, identical across fanned-out siblings).
- **A cohort-owner / DRI role.** Rejected — the per-member partition *is* the coordination mechanism (each member
  edits only its own section; cohort-level material is ownerless by definition), so a DRI would carry nothing
  load-bearing. Team-scale arbitration, if it arises, routes to the team-coordination strategy.
- **A single combined decomposition workflow.** Rejected — the *decision* (orthogonality + rails + maturity
  timing) and the *execution* (transform a live WU into a cohort) are semantically distinct and fire at different
  times: the decision fires cheaply at every design-stage read; the execution runs once, terminally.
- **Unbounded nesting depth.** Rejected for sprawl and an unbrowsable tree; a one-level cap with an at-cap
  lateral fan-out arm handles the "already at the cap" case without raising it.

ARC also diverges deliberately from **Shape Up**: it adopts the self-contained vertical-slice unit shape but
**rejects** Shape Up's design-co-evolves-during-build timing — ARC stays spec-directed, settling what is
settle-able up front rather than treating under-specification as a design method.

## Decision

We will adopt a **bounded cohort model** as ARC's account of work-unit grouping and decomposition.

**One grouping kind — the cohort.** A cohort is a deliberate grouping of sibling work units; the work unit is the
**leaf deliverable** (one branch, one PR, its own `meta-* / spec-* / tasks-*`). There is exactly one grouping
kind, and **coordination is a property it carries by degree**, not a separate category: every cohort carries a
constitutive `cohort-{name}.md` — a grouping that only organizes carries a Purpose-only doc; one that actively
coordinates carries a fuller body. "Theme" survives only as informal prose, never a schema kind and never a
doc-less exception.

**The nesting cap — one level.** Nesting is capped at `<cohort>/<subcohort>/<wu>` — never three grouping
segments. It is a structural anti-sprawl bound, not a limit on coordination (both levels may coordinate). Nesting
lives in the **path-valued `Cohort` field**; the on-disk directory mirrors the path; membership derives from each
WU's field, never a roster. One `cohort-{name}.md` shape serves every level — an inner cohort differs only by
path depth and by how much its doc says.

**Decomposition — a decide method over an execute workflow.** Whether a concern is one WU or a cohort, and where
the cuts fall, is the `assess-cohort-fit` **decide** method's judgment (orthogonality not size; two guard rails
against over- and under-splitting; gated on design maturity). It produces a **cut-map** — members, dependency
edges, deliverable boundaries, slugs — or "stays one WU." The `decompose-work-unit` **workflow** consumes that
cut-map to transform a live WU into a cohort. The cut-map is the single DRY interface between them: the method
decides and never mutates; the workflow executes and never re-derives the cut.

**Three decomposition arms, selected by the parent's position relative to the cap.** A standalone WU becomes a
new top-level cohort (name preserved); an in-cohort WU becomes a sub-cohort under its parent (name preserved); an
at-cap WU has no legal nested target and decomposes **laterally** into sibling WUs under its existing parent
(name not preserved as a grouping node). Dependency edges are always WU→WU, so a downstream WU re-points to the
specific delivering pieces regardless of name; render-from-metas handles the WU→cohort shift automatically.

**At-cap fan-out preserves grouping as provenance, not live grouping.** Because no cohort node is minted at the
cap, the "these came from one concern" fact is recorded **once, write-once**, as a cohort-level provenance note
in the parent doc. It records a past event, so it never drifts and needs no guard — stronger than any slug
convention, and it does not re-introduce the live grouping the cap forbids.

**No coordinator / DRI.** Membership is derived, coordination is partitioned per-member, and cohort-level
material is ownerless by definition — the partition is the coordination mechanism in place of a role. `Owner`
stays work-unit-level.

**The cohort-consistency invariant ships with its enforcement.** Three conditions — `Cohort` field path-matches
the directory path; every grouping directory carries a `cohort-{name}.md`; per-member section slugs are a subset
of derived members — are enforced by a backlog-scoped structural guard co-located with the invariant definition,
so the invariant is never defined-but-unenforced.

**Document tiering (where the model lives).** The always-loaded surface carries the minimum: `AGENT-BRIEF.ARC`
§ Vocabulary introduces the term and its two constitutive rules; DEV-RULES.ARC adds only `cohort-*` to the
movable-artifact enumeration (the constitutive rules are enforced by the cohort-consistency invariant, not
restated as always-loaded prose). The grouping taxonomy, the path-valued semantics, and the WU-sizing standard
elaborate in `strategy-work-organization`; the triage and the transformation are the `assess-cohort-fit` method
and `decompose-work-unit` workflow; the `cohort-{name}.md` record is schema-owned per [ADR-022][adr-022]; and the
architectural reasoning — this Context and Decision — is this ADR's, its sole home.

The model parallels the familiar **epic → story** decomposition (a grouping of independently-deliverable units)
as a grounding intuition only — known practice that orients a newcomer, not a definitional dependency. ARC's
terms (cohort, work unit) are defined on their own terms; the analogy is deliberately kept out of the normative
surfaces.

## Consequences

### Positive

- **Self-contained, relocatable bundles.** Each WU keeps its own co-located `meta + spec + tasks`; decomposition
  never produces cross-branch shared-mutable planning state, preserving worktree isolation and relocatability.
- **One grouping concept, not a tier zoo.** Coordination-by-degree replaces a categorical theme/cohort tier set,
  removing the doc-less exception and the single-segment ambiguity.
- **A clean decide/execute split.** The method fires cheaply and often; the workflow runs once; the cut-map keeps
  decision logic out of the workflow and structural change out of the method.
- **Decomposition never loses references.** WU→WU dependency edges plus name-preservation in arms 1–2 and a
  write-once provenance note in arm 3 carry the "came from one concern" fact without a maintained roster.
- **No idle roles.** Membership-is-derived plus the per-member partition deliver coordination without a DRI.
- **Lean always-loaded surface.** The brief introduces; the rule surface carries only the enumeration entry;
  depth lives on-demand in the strategy, method, and workflow; the reasoning lives here.

### Negative

- **A second organizing axis to learn.** Actors must hold both `Class` (a WU's weight) and the cohort (the
  grouping a concern takes when it spans more than one WU); mitigated by the brief vocabulary and the strategy
  taxonomy.
- **A fuzzy orthogonality judgment.** "One WU or a cohort?" is a design-orthogonality call, not a crisp
  threshold; mitigated by the two guard rails, the maturity-gated timing, and an acceptance test that re-derives
  a real prior decomposition.
- **Partial realization at decision time.** The delivery discipline for a decomposed stack and the shared-doc
  concurrency net are downstream constraints, so the model is usable here but not fully ratified — hence
  Proposed.

### Risks

- **Over-decomposition pressure.** An author biased toward splitting could mint thin cohorts; the lower guard
  rail (don't split below WU-warrant) and the Purpose-as-reality-check are the mitigations.
- **Cohort-doc edit contention.** The `cohort-{name}.md` is the one deliberately shared planning artifact; the
  per-member partition keeps concurrent edits line-mergeable, with serialize-via-main as the documented fallback
  if the partition proves insufficient (the runtime net is Concurrent Work Conventions').
- **Field↔directory drift.** A WU assigned to one cohort but filed under another is a silent failure; the
  cohort-consistency guard's path-match condition is the net, with a manual version covering the bootstrapping
  run before the guard ships.

## Amending This Document

<!-- Reserved for post-implementation learnings per the three-tier amendment model
     (strategy-adr-methodology.md). Append dated annotations as `**Amendment (YYYY-MM-DD):** …`. -->

---

[adr-019]: adr-019-work-unit-lifecycle-reform.md
[adr-020]: adr-020-adopt-principle-anchored-scalable-core.md
[adr-021]: adr-021-introduce-errand-work-class.md
[adr-022]: adr-022-managed-operational-state-documents.md
[adr-023]: adr-023-class-model-scaled-ceremony.md
