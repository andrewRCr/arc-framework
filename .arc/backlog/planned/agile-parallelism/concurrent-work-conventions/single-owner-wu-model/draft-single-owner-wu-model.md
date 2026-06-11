# Draft: Single-Owner WU Model

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Origin:** [internal] — the single-owner-WU-model half of the decomposed Concurrent Work Conventions concern.
  The *decision* is a conventions item (`concurrent-work-doctrine`); the *rewrite* it forces has real weight and
  is the final increment of the stack.
- **Purpose:** Establish the **single-owner work unit (one DRI)** as an explicit model and execute the
  cross-cutting doc rewrite it forces: `strategy-team-coordination` (branching patterns, the `(@name)` convention,
  person-to-person handoff), DEV-RULES.ARC § Task interlock, and meta `**Owner:**` semantics. Remove `(@name)` and
  the within-WU concurrent multi-dev apparatus. Supplies the self/foreign asymmetry the doctrine's all-owner gate
  keys on.

---

## Problem / Motivation

A WU is **single-owner** (one DRI). Cross-person parallelism = decompose into N single-owner WUs (cohort ≈ epic),
**not** multiple devs concurrently driving one WU's task list. The current `strategy-team-coordination` carries a
within-WU multi-dev apparatus — Personal-Sub-Branches, Stacked-PRs-per-Developer, shared-meta concurrent-write
handling, "concurrent pairs on different tasks" — plus per-task `(@name)` markers. With single-owner WUs that
apparatus has no remaining job, and the documents that encode it must be rewritten to match.

The model is grounded in the dominant industry idiom (one branch = one author; story = one assignee; parallelism
= more branches/PRs, not more authors per branch) and in ARC's substrate — a single-owner WU is structurally
lighter (one branch + one PR) than the shared-integration-branch + per-dev-sub-branch topology multi-dev-per-WU
requires, and avoids the shared-meta write-collision and single-`Next Task`-pointer workarounds team-coord
currently carries.

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

### Self/foreign asymmetry — the input the doctrine consumes

Single-owner WUs make the activation-time concurrency check the *entire* "all-owner" addition: self-overlap
reorder freely, foreign-overlap coordinate. This member supplies that asymmetry; `concurrent-work-doctrine`'s
all-owner gate doctrine keys on it, extending Errand Enablement's advisory foreign-artifact gate to entry-level
writes.

### Execution is separable

The *decision* is a `concurrent-work-doctrine` conventions item; the *rewrite* it forces —
`strategy-team-coordination`, DEV-RULES.ARC § Task interlock, meta `**Owner:**` semantics — has real weight and is
the stack's final increment. Separable execution: it sequences after the doctrine spine lands but does not gate
the mechanism members.

---

## Scope of the rewrite

- **`strategy-team-coordination.md`** — rewrite branching patterns to the single-owner model; remove the
  within-WU multi-dev apparatus (Personal-Sub-Branches, Stacked-PRs-per-Developer, shared-meta concurrent-write
  handling); remove the `(@name)` convention; keep person-to-person handoff as sequential owner reassignment;
  cross-reference `strategy-concurrent-work.md` (the new sibling) where branching/merge overlap exists.
- **DEV-RULES.ARC § Task interlock** — remove "concurrent pairs on different tasks"; the task interlock applies per
  single-owner WU, not per developer-agent pair within a WU.
- **meta `**Owner:**` semantics** — the field *is* the assignment; document that per-task `(@name)` markers are
  retired and `**Owner:**` is the single source of assignment truth.

---

## Scope Estimate

**Medium — cross-cutting doc rewrite, real weight.** Separable execution; the final increment of the stack. The
decision is settled in `concurrent-work-doctrine`; the weight here is the careful rewrite of load-bearing
constitutional docs (`strategy-team-coordination`, DEV-RULES.ARC) without dropping the legitimate cases (pairing,
handoff) the apparatus was over-serving.

### Dependencies

- **Internal:** `concurrent-work-doctrine` (the conventions framing the model sits inside; the asymmetry it
  consumes is supplied here, so the doctrine spec references this member and vice versa — author the asymmetry once
  and point).
- **Substrate (shipped):** the meta `**Owner:**` field and the WOR `Integrating` state.
