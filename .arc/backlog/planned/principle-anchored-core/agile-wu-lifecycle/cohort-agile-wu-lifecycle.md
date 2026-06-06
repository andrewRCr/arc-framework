# Cohort: `agile-wu-lifecycle`

> _Coordination and identity record for this sub-cohort. Membership is derived from each member's
> `Cohort` field — held here as shared coordination, never a roster. Internal-dev; not shipped._

**Parent:** `principle-anchored-core`

**Purpose:** Scale work-unit ceremony to the work's actual pre-implementation demand while holding ARC's
execution discipline invariant — scale how much design must be _authored_, never the discipline that validates
it. The members deliver the `Class` model (a three-value planning-weight classification plus per-stage planning
depth), the scalable authoring pipeline that consumes it, the decomposition-and-cohort machinery that lets a
concern outgrow a single WU, and the documentation sweep that retires the superseded tier vocabulary. This is
the `principle-anchored-core` thesis — **scale grammar, never scale discipline** — applied to the WU lifecycle.

## Coordination

**Sequencing** (derived for orientation; member `Depends On` edges are the source of truth):

```text
class-model-foundation
   ├─→ scalable-authoring-pipeline ─┐
   └─→ decomposition-machinery ─────┴─→ doc-cascade-sweep
```

`class-model-foundation` ships standalone; `scalable-authoring-pipeline` and `decomposition-machinery` run in
parallel on top of it; `doc-cascade-sweep` is terminal.

### Shared contracts

Cross-member design no single member owns alone. Each contract's authoritative definition lives in the
exposing member's spec (a cohort doc holds coordination and pointers, never design that drives a task list);
this records the contract surface and its consumers.

- **The `Class` model** — `light` / `heavy` / `novel` planning weight (`heavy` iff either intrinsic axis is high:
  _derivation_ of an open design, or _scale_ of the codebase-grounding a correct plan needs; `novel` iff
  derivation crosses the higher invent-vs-compose threshold), plus a transient per-stage `planning depth`, three
  spec forms (`brief` / `outline` / `detailed`), the `[TBD]` pre-classification sentinel, and the
  `classify-work-unit` triage method. Defined by **`class-model-foundation`**; consumed by
  **`scalable-authoring-pipeline`** (per-stage depth resolution; declares the `classify-work-unit` method at its
  planning-stage touchpoints; realizes `novel`'s suggested research / ADR planning shape) and
  **`decomposition-machinery`** (the WU-vs-cohort upper bound mirrors the Errand-vs-WU lower bound). The `novel`
  value is also the plate-balance / sequencing signal consumed cross-cohort by **Concurrent Work Conventions**.
  **Estimate-then-ratchet** — the ratchet protects _realized_ authoring (never drops below work already done); an
  estimate set before that work is freely revisable, forced to a real value at entry into `planned/` (`[TBD]`
  only in `provisional/`).
- **The path-valued `Cohort` field + grouping taxonomy** — the field _schema_ (path-valued, capped at two
  segments, membership derived) is owned by **`class-model-foundation`**; the _taxonomy_ it expresses (one
  grouping kind, coordination as a content continuum, the constitutive `cohort-{name}.md` record with a
  required `Purpose` floor) is owned by **`decomposition-machinery`**. The on-disk dir-path mirrors the field.
- **Structural invariants** — _relocatability_ (artifacts relocate between lifecycle states as a pure `git mv`
  with no content edit, which holds only with position-independent refs): stated by **`class-model-foundation`**,
  enforcement routes downstream to `quality-gate-hooks`. _Cohort-consistency_ (field-path ↔ dir-path; every
  grouping dir carries a doc with a `Purpose`; H3 slugs ⊆ derived members): invariant **and** enforcement both
  owned by **`decomposition-machinery`**, co-located so it is never defined-but-unenforced.

### Soft coordination

Not dependencies — influences and seams.

- **`composable-workflows`** — dictates _how_ depth differentiation is written (extract whole conditional
  blocks, not fine-grained inline branches) so it fragments cleanly when composition lands. Forward-compat
  constraint, not a `Depends On`.
- **`arc-plan-conductor`** — facilitation downstream: this cohort defines the planning-depth levels and their
  triggers; the conductor only elicits and assesses fit, never defines or drives them, and degrades gracefully
  to `heavy` behavior until the `Class` field exists.
- **`configuration`** — if the user-above ceremony preference becomes a config knob, its home is that cohort's
  per-developer substrate, not a bespoke surface.

### Cross-cohort

Whether create-new `arc start` should default-populate `Origin` from a configured tracker (vs. requiring an
explicit `--origin`) is a Concurrent Work Conventions concern — it owns create-new `arc start`. Recorded here
only so the open question has a visible home; unrelated to graduation, where minted members inherit the
originating WU's `Origin`.

## Members

Per-member exposes / consumes — the partitioned surface each member edits alone. A member appears here only
when it has cross-cutting coordination to record.

### `class-model-foundation`

The base; ships standalone (workflows default to `heavy` until the pipeline lands).

_Exposes:_ the `Class` model + boundary tests, the `Class` / `Design` / path-valued `Cohort` meta-field schema
(`Class` carries the `[TBD]` sentinel + the estimate-vs-realized ratchet + the `novel` invent-vs-compose
threshold), the `classify-work-unit` triage method, the `graduate-work-unit` (`provisional → planned`) workflow
that forces the estimate at planned-entry, the in-flight-+-ready `STATUS.USER` content model, the relocatability
invariant statement, and a backlog-wide cohort-compliance baseline.

### `scalable-authoring-pipeline`

_Exposes:_ the scalable `create-spec` / `generate-tasks` pipeline — the spec template family, per-stage depth
self-resolution with flag-free feed-forward, the task-list one-grammar, grounding-audit depth parameterization,
`arc-plan` depth-relativity, the `spec-review` method + extension, and the artifact-presence-tolerance
requirement on integration.

_Consumes:_ the `Class` model + the `classify-work-unit` method (declared at the `arc-plan` / `create-spec` /
`generate-tasks` planning-stage touchpoints it owns), including `novel`'s advisory research / ADR planning shape
as a depth suggestion rather than an enforcement hook.

### `decomposition-machinery`

_Exposes:_ the decomposition method (orthogonality discriminator + two rails + maturity-gated timing +
Model-B-only), the grouping taxonomy, the `cohort-{name}.md` record + `template-cohort.md`, the **`WU → cohort`
decomposition workflow** (renamed off "graduation" — that term is reserved for the readiness ladder, owned by
`class-model-foundation`'s `graduate-work-unit`; see this WU's inbound buffer), and the cohort-consistency
invariant + its enforcement.

_Consumes:_ the path-valued `Cohort` schema and the relocatability invariant from `class-model-foundation`.

_Consumed cross-cohort:_ by Concurrent Work Conventions — the decomposition procedure is its acceptance test
and the support its parked stack waits on.

### `doc-cascade-sweep`

Terminal.

_Exposes:_ the retirement sweep of superseded tier / incidental concept references across workflows,
strategies, and templates; the `arc-plan-conductor` write-back; and the codification of the graduation workflow
against this cohort's own bootstrapping run.

_Consumes:_ all three siblings — it sweeps the vocabulary they establish, including the Work Character ↔ `Class`
one-spectrum framing (`Errand` floor → `novel` ceiling) without flattening atomic work into a `Class` value.

## ADR anchors

- ADR-001 (`adr-001-define-core-identity-and-principle-method-boundary.md`) — P1 (spec-directed), P2 (review
  increment), P4 (quality gates), P7 (tracked lifecycle) anchor the floor model.
- ADR-016 (`adr-016-configurable-autonomy-interlocks-for-session-operations.md`) — scope precedent for the
  constitutional change.
- ADR-019 (`adr-019-work-unit-lifecycle-reform.md`) — one-branch-per-WU; makes Model A inexpressible.
- ADR-020 (`adr-020-adopt-principle-anchored-scalable-core.md`) — the tiered-artifacts / invariant-execution
  thesis; resolve-then-load; the guided-init project floor.
- ADR-021 (`adr-021-introduce-errand-work-class.md`) — the wrapper-floor lower bound, mirrored by the
  decomposition upper bound.
- ADR-022 (`adr-022-managed-operational-state-documents.md`) — `Class` / `Design` are schema-owned with
  `Class`-conditional validity; the `cohort-{name}.md` record joins this family.

---
