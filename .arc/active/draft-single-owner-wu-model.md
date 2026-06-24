# Draft: Single-Owner WU Model

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Origin:** [internal] — the single-owner-WU-model half of the decomposed Concurrent Work Conventions concern.
  The *decision* is a conventions item (`concurrent-work-doctrine`); the *rewrite* it forces has real weight and
  is the final increment of the stack.
- **Purpose:** Reconcile ARC's constitutional docs to the **single-owner work unit (one DRI)** model that
  `concurrent-work-doctrine` already operates on but never reconciled the lagging docs to. Execute the
  cross-cutting rewrite that removes the within-WU concurrent multi-dev apparatus —
  `strategy-team-coordination` (branching patterns, the `(@name)` convention, person-to-person handoff),
  DEV-RULES.ARC § Task interlock, and meta `**Owner:**` semantics — so the corpus stops contradicting the shipped
  doctrine. Decouple ownership-cardinality from PR-cardinality on contact, leaving a clean seam for
  `pr-decomposition`.

---

## Re-grounding (2026-06-24) — the asymmetry already shipped; this is now a reconciliation rewrite

The original draft framed this WU as *supplying* the self/foreign asymmetry that `concurrent-work-doctrine`
consumes ("author the asymmetry once and point; the doctrine spec references this member and vice versa"). That
premise is **stale** — `concurrent-work-doctrine` has since shipped, and `strategy-concurrent-work.md` already
authored both halves:

- **Single-owner as operative fact** (~§361): *"Each work unit has a single owner, regardless of team size… that
  single-owner framing is what makes the overlap read tractable."*
- **The self/foreign asymmetry + all-owner gate** (~§409–419): reorder/re-home your own work freely; foreign-owned
  work you coordinate, not appropriate — at both file and entry granularity.

What the doctrine did **not** do: rigorously define single-owner (it treats it as given), and — critically — it
left the entire within-WU multi-dev apparatus in `strategy-team-coordination.md` **untouched**. So the corpus
carries a **live contradiction today**: the doctrine asserts single-owner, while team-coordination still
describes multiple developers concurrently driving one WU's task list.

This WU's job is therefore narrower and sharper than the original framing: **reconcile the lagging docs to the
single-owner model the doctrine already operates on.** The "supply the asymmetry / point both ways" scope is
done; what remains is deletion + reconciliation of load-bearing constitutional docs. (No net-new design — the
`Class: Heavy` weight is now the careful rewrite of large docs, not invention; re-confirm Class at capture.)

---

## Problem / Motivation

A WU is **single-owner** (one DRI). Cross-person parallelism = decompose into N single-owner WUs (cohort ≈ epic),
**not** multiple devs concurrently driving one WU's task list. `concurrent-work-doctrine` already encodes this and
keys its overlap read on it — but `strategy-team-coordination` still carries the within-WU multi-dev apparatus:
Personal-Sub-Branches, Stacked-PRs-per-Developer, shared-meta concurrent-write handling, "concurrent pairs on
different tasks" (also in DEV-RULES.ARC § Task interlock), plus per-task `(@name)` markers. With single-owner WUs
that apparatus has no remaining job, and — because the doctrine already shipped the single-owner framing — the
documents that encode it are now *actively contradictory*, not merely redundant. They must be rewritten to match.

The model is grounded in the dominant industry idiom (one branch = one author; story = one assignee; parallelism
= more branches/PRs, not more authors per branch) and in ARC's substrate — a single-owner WU is structurally
lighter (one branch) than the shared-integration-branch + per-dev-sub-branch topology multi-dev-per-WU requires,
and avoids the shared-meta write-collision and single-`Next Task`-pointer workarounds team-coord currently
carries.

---

## Design Decisions carried into the spec

### Single-owner work units (one DRI)

- **Non-owner contribution** happens via (1) PR review (already first-class), (2) pairing (synchronous, one
  driver, `Co-authored-by:` for credit — convention, no structure), (3) handoff (sequential owner *reassignment*
  — keep; vacation/rotation).
- **Remove `(@name)` entirely.** With single-owner WUs the meta `**Owner:**` field *is* the assignment; per-task
  markers have no remaining job. team-coord's own rationale — "git tracks authorship; duplicating adds maintenance
  burden" — now argues against `(@name)` in task lists too.
- **Kill the within-WU concurrent multi-dev apparatus** — the Personal-Sub-Branches and Stacked-PRs-per-Developer
  patterns, the shared-meta concurrent-write handling, and "concurrent pairs on different tasks" (DEV-RULES.ARC
  § Task interlock).
- **Caveat:** untested at team scale — a conscious idiomatic + structural-fit bet, not field-proven. The one
  genuine shared-branch case (a feature too cohesive to split) is absorbed by the dichotomy:
  too-coupled-to-split → one WU, one owner, may pair; separable → multiple WUs.

### Self/foreign asymmetry — already shipped; reconcile only

The activation-time self/foreign asymmetry (self-overlap reorder freely, foreign-overlap coordinate) and the
all-owner gate it keys on are **already authored in `strategy-concurrent-work.md`** — this WU does not re-author
them. It only ensures the docs it rewrites don't *contradict* that asymmetry (e.g. team-coord's multi-dev
patterns imply a self/self collision model the doctrine's single-owner framing rules out). Where a
cross-reference helps, point at the shipped doctrine rather than restating it.

### Forward-compatibility with `pr-decomposition` — decouple ownership- from PR-cardinality

`pr-decomposition` (planned, P1) keeps the single-owner model but amends `1 WU = 1 branch = 1 PR` →
`1 WU = 1 branch, emitting ≥ 1 PR` — one owner, one WU, multiple stacked **deliverable** PRs planned at
`generate-tasks`. The hazard: the current corpus **welds ownership-cardinality to PR-cardinality** — the same
passages that argue for single-owner WUs do it *by rejecting within-WU stacking*:

- `strategy-work-organization.md` (~:297): *"Rather than one WU sliced into stacked PRs, the concern becomes a
  cohort of self-contained, single-owner WUs… one branch, and one PR."*
- `strategy-work-organization.md` (~:459): *"1:1 — one task list, one branch, one work unit."*
- `assess-cohort-fit.md` (~:83, :88): *"WU ≈ story / one reviewable PR"* / *"…not one large WU sliced into several
  PRs."*

If this WU re-states that rationale as-is, it **hardens exactly what `pr-decomposition` must later un-do.**

**Decision — decouple-in-place (minimal).** Where this WU must touch the single-owner rationale, surgically split
the two claims: **affirm one *owner* per WU; treat PR-count-per-WU as a separable axis** this WU does not settle.
Reword the welded PR-cardinality claims into an explicit forward-compat seam rather than reinforcing "one owner
⟹ one PR." Do **not** build the multi-PR model here — that is `pr-decomposition`'s Novel scope.

**Decouple wording (settled) — audience-split.** In the **target (shipping) docs** (`strategy-work-organization`,
`assess-cohort-fit`, etc. — all adopter-facing under `strategy/arc/**` / `system/**`), the seam stays **neutral**:
"PR-count per WU is a distinct axis," never naming an unshipped WU (a forward-pointer leak per DEV-RULES.PROJECT
§ Audience Boundaries). In the **internal planning artifacts** (this `draft-*`, the `spec-*`, the `tasks-*` — not
adopter-facing), name `pr-decomposition` explicitly: they're the record of *why* the seam exists, and the
audience boundary doesn't apply to them.

Vocabulary dividend: removing the multi-**developer** "Stacked PRs per Developer" section *frees* the "stacked PR"
term for `pr-decomposition` to reclaim in the single-owner multi-**deliverable** sense — provided this WU does not
simultaneously harden the work-org "not stacked PRs within a WU" rule. Sequencing is one-directional: this WU is
on the critical path to `finalize-parallelism`; `pr-decomposition` is not — so this WU ships first and *leaves the
seam*, never waits on it.

---

## Scope of the rewrite

**Primary (the reconciliation):**

- **`strategy-team-coordination.md`** — **gut-and-shrink in place** (settled), not a thin reframe: most of the
  doc *is* the within-WU multi-dev apparatus being removed. The doc survives because a genuine **cross-person**
  coordination residual remains — a different axis from `strategy-concurrent-work`, which is per-*WU* concurrency
  (owner-agnostic), not per-person.
    - **Remove:** the `(@name)` convention (whole § Task Ownership); all four § Team Branching Patterns (Shared
      Integration, Personal-Sub-Branches, Stacked-PRs-per-Developer, Direct Shared — all multiple-devs-on-one-WU);
      the within-WU shared-meta + sub-branch merge sections.
    - **Remove as duplication → cross-ref:** "Parallel WUs on independent branches" mechanics already live in
      `strategy-concurrent-work.md`; drop the duplicate, point there.
    - **Keep + reframe:** Person-to-Person Handoff → sequential `Owner`-field reassignment (not `(@name)`);
      External Tracker Integration (minus `(@name)`); a thin cross-dev commit-visibility note from interlock
      coordination.
    - Clarify that team mode parallelizes via **multiple single-owner WUs in worktrees**, not multiple developers
      on one WU.
- **DEV-RULES.ARC § Task interlock** — remove "concurrent pairs on different tasks"; the task interlock applies
  per single-owner WU, not per developer-agent pair within a WU.
- **meta `**Owner:**` semantics** — the field *is* the assignment; document that per-task `(@name)` markers are
  retired and `**Owner:**` is the single source of assignment truth.

**Secondary (minimal decouple-in-place, per the forward-compat decision):** touch only where the single-owner
rationale and the one-PR claim are welded, to separate them without building the multi-PR model:

- **`strategy-work-organization.md`** (~:297, :459) — where "single-owner WU" is justified by "one branch, one PR
  / not stacked PRs within a WU," split ownership-cardinality from PR-cardinality; mark PR-count as a separable
  axis rather than restating "one PR."
- **`assess-cohort-fit.md`** (~:83, :88) — same decouple on "WU ≈ one reviewable PR" / "not one WU sliced into
  several PRs": the cohort-vs-WU decision is an *ownership/concern* call, not a *PR-count* call.

Boundary: this WU does **not** amend the `1 WU = 1 PR` invariant itself, add a `Deliverable` axis, or touch
`generate-tasks` / the integration ceremony — all `pr-decomposition` scope. It only stops the welded passages
from re-hardening the one-PR claim under the single-owner banner.

---

## Resolved this pass

- **Decouple wording** → audience-split (neutral in shipping docs, named in internal artifacts) — see
  § Forward-compatibility.
- **team-coord treatment** → gut-and-shrink in place; a genuine cross-person residual justifies the (smaller)
  doc — see § Scope.
- **Class** → confirmed `Heavy` (the only invent-leaning part, asymmetry authoring, is already shipped; what
  remains is a substantial constitutional-doc rewrite).

## Open / to settle at spec

- **team-coord survivor boundary** — line-by-line: does the thin cross-dev commit-visibility note stay in
  team-coord or fold entirely into `strategy-concurrent-work`'s push discipline? Does External Tracker Integration
  belong in a coordination doc at all, or move to `strategy-work-organization`? Detail-design, not fundamental.
- **`(@name)` removal blast radius** — enumerate every consumer of the `(@name)` convention beyond
  team-coord (session-init team-mode step, task-list strategy/template, any method) so removal is complete, not
  just doc-local.

## Dependencies

- **Shipped (re-grounded):** `concurrent-work-doctrine` — `strategy-concurrent-work.md` already authored the
  single-owner framing, the self/foreign asymmetry, and the all-owner gate. This WU reconciles the lagging docs to
  it; it neither re-authors nor waits on it.
- **Substrate (shipped):** the meta `**Owner:**` field and the WOR `Integrating` state.
- **Forward seam (do not gate on):** `pr-decomposition` — this WU leaves PR-cardinality a separable axis for it;
  ships first, never waits.

## Scope Estimate

**Medium — cross-cutting doc rewrite, real weight.** Separable execution; the final increment of the stack. The
decision is settled in `concurrent-work-doctrine`; the weight here is the careful rewrite of load-bearing
constitutional docs (`strategy-team-coordination`, DEV-RULES.ARC) without dropping the legitimate cases (pairing,
handoff) the apparatus was over-serving, and without re-hardening the one-PR claim the welded passages bundle in.
