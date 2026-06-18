# Draft: Lifecycle Mechanics Tail

- **Origin:** [internal] — `lifecycle-state-machine` cohort **companion** (minted 2026-06-17 at a housekeep drain).
  Owns the deterministic-CLI-mechanic tail the cohort's first migration step (`lifecycle-transition-core`, B1)
  deliberately stopped short of: the second increment toward the north star where deterministic transition
  mechanics live in the CLI and workflows shrink to the judgment that decides whether/when to fire them.
- **Cohort:** `lifecycle-state-machine` (companion — see § Positioning).
- **Purpose:** Give the deterministic lifecycle mechanics still hand-run in workflow markdown — the post-merge
  teardown tail, the archive finalize-fact write — a single CLI-owned home, and consolidate the cross-cohort
  fragments where the same mechanics were captured against adjacent owners. An **audit is planning step one**: the
  surface is discovery-shaped, so the WU's true scope (and whether it decomposes) resolves from the audit, not from
  a guessed task list.

> Shared context — the north star (mechanics → CLI, judgment → workflow), the `(phase, location)` model, the
> mutator bundle, and the consistency-on-exit standard — lives in `cohort-lifecycle-state-machine.md`. This draft
> carries only what this companion owns.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Retire `template-meta.md` as a scaffold source — single-source meta shape from code**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: lifecycle-mechanics-tail`), housekeep drain (2026-06-18);
  captured during `planning-pipeline-readiness` Task 5.1 — simplifying the session-init planning read-path
  surfaced the dual-source drift.
- *Concern:* the markdown `template-meta.md` (`reference/templates/arc/work-unit/`, both copies — confirmed
  present at drain) and the code renderer (`renderMetaFile` over `META_FIELDS`) are a dual source of truth for
  meta shape that drifts — hit live during `planning-pipeline-readiness`, where `template-meta.md` lacked the
  `Current Workflow` field bullet that `META_FIELDS` carries. The CLI already scaffolds every fresh-WU entry
  through `renderMetaFile` (`arc start` create-new spawn, `arc start --here` cold-start, graduate via the
  executor), so the two remaining markdown hand-fills are redundant migration leftovers.
- *Proposed:* route `init-work-unit` Path B (fresh in-place WU) and the Promote-Errand meta creation through
  `arc start` / `renderMetaFile`, then delete `template-meta.md` (both copies). OSD-aligned — a managed doc's
  shape lives in code, not a loose template. Fits this WU's charter (audit/migrate judgment-free mechanics still
  in markdown); `lifecycle-transition-core` has shipped, so it can't route there.

### `[ ]` **Guard all post-side-effect meta writes in the encoding-failure surface**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: lifecycle-mechanics-tail`), housekeep drain (2026-06-18);
  deferred CodeRabbit finding (major) on `planning-pipeline-readiness` PR #111.
- *Concern:* in `lifecycle-executor.ts`, the post-side-effect meta field-writes — `applyBranchField`,
  `applyCurrentWorkflowField`, `applySoftFields` — run after side-effects fire and outside the encoding-leg
  `try/catch` that returns `{status: "encoding-failed"}`. If any throws, `executeTransition` throws instead of
  returning a `TransitionOutcome`, after side-effects already landed — a partially-applied transition with no
  recoverable signal. Pre-existing — applies equally to the established `applyBranchField` write; CodeRabbit
  flagged it on the `Current Workflow` clear specifically. Architecture-wide transaction-boundary concern, not a
  single-field fix; touches load-bearing executor infra.
- *Proposed:* wrap all three post-side-effect writes in the encoding-failure surface (not just one field), so a
  write failure reports as an outcome rather than an unhandled throw. *Design fork to settle:* side-effects have
  already fired at this point, so a post-side-effect write failure may warrant a distinct status from the
  pre-side-effect `encoding-failed`, rather than reusing it.

---

## The audit (planning step one — not a task)

Before any task decomposition, sweep the **errand + WU lifecycle** for deterministic, no-judgment mechanics still
executed by hand in workflow markdown (the carry-and-skip prose, the "do this by hand" tails), and produce the
inventory that scopes this WU. The audit is the design front-end; it runs at planning, feeds `create-spec`, and
may split this WU if the surface is large. It must **reconcile**, not duplicate — every candidate is checked
against the already-captured fragments below before it becomes net-new scope.

Audit output per candidate: *the mechanic · where it lives today (workflow + step) · is it genuinely judgment-free ·
does an existing capture already own it (→ consolidate / repoint) · migrate-now / leave-downstream / reject.*

**Audit seed (live dogfood, 2026-06-17).** Grooming around *this* WU surfaced two instances directly, both of the
same deterministic-placement/teardown-mechanic class.

**(1) `arc stub` has no `--cohort` affordance**, so placing the new member into the `lifecycle-state-machine`
cohort took a hand-run dir move (`backlog/planned/<name>/` → `backlog/planned/<cohort>/<name>/`) plus a manual
`Cohort:` field write — a deterministic placement op the CLI could own (`arc stub --cohort <slug>` placing the dir
and writing the field, with the same collision/validation guards the stub contract already runs). The friction is
**not** markdown-tail this time but a missing CLI affordance on a shipped verb, so the audit routes it rather than
pre-claiming it: own here, or repoint to the `stub`-primitive owner (`lifecycle-transition-core`'s stub contract,
with `planning-pipeline-readiness` as the planning-entry-mechanics neighbor).

**(2) The graduate/relocate mutator leaves an empty cohort subdir behind**: when a member graduates from
`backlog/planned/<cohort>/<wu>/` to the flat `active/`, the now-emptied `<wu>/` subdir lingers under the cohort
dir — the relocate leg should `rmdir` the emptied parent. Surfaced graduating `planning-pipeline-readiness` (left
an empty `backlog/planned/lifecycle-state-machine/planning-pipeline-readiness/`). Impact is local-cosmetic only
(git doesn't track empty dirs, so it self-heals on clone), but it is the same class as (1) — a deterministic,
no-judgment placement/teardown mechanic. Both recorded as the audit's first concrete data points.

## Seed deliverables (the two known mechanics)

These two are the confirmed seed; the audit confirms scope around them.

1. **Post-merge teardown CLI verb.** The integration tail's deterministic post-merge cleanup — reap the merged
   branch + remove the worktree, worktree-kind dispatched, presence-guarded — currently single-source in
   `integrate-work-unit.md` (post-merge cleanup) and `decompose-work-unit.md`'s park-exit. Factor it to a CLI
   surface reusing `lifecycle-transition-core`'s executor `reconcile-worktree:teardown` leg plus a **new
   merged-safe (`git branch -d`) branch-delete variant** — distinct from the force `reconcile-branch:delete`
   (`-D`) that park/abandon use. **Boundary (settled in `lifecycle-transition-core`):** preserve no physical
   teardown in `arc archive` — archive stays the mergeable sweep riding the ship PR; teardown is non-mergeable
   (deleting the branch closes the open PR) and runs **after** merge.
2. **Archive finalize-fact flags.** `arc archive` already owns the final archive meta mutation (state flip, branch
   clear, soft-field reset, relocation), but the PR-URL / Completed block + forward-field reconciliation that
   `template-meta.md` mandates post-integration is still hand-run. Teach `arc archive` to accept the remaining
   final-form facts as inputs — `--pr-url <url>` and `--completed <YYYY-MM-DD>` (default today, overrideable for
   resume/backfill) — and write the block + reconciliation itself. Keep it platform-light and explicit first;
   GitHub inference can layer on later from the integration wrapper.

## Cross-cohort reconciliation map

These fragments captured the same mechanics against adjacent owners. They are **pointers** this companion
consolidates against during the audit — leave them in place until the audit repoints them; do not duplicate.

- `composable-workflows` (draft, post-merge-teardown entry) — owns the "is this shared block a CLI surface or a
  markdown fragment?" framing (its Option 1b). The **mechanic** is this companion's; the **fragment/visibility
  model** stays `composable-workflows`. Repoint its entry to here for the CLI-surface half.
- `interlock-release-refinement` (draft, archival-ceremony entry) — its archive-finalize facet ("append PR URL +
  Completed, reconcile forward-fields") is the **archive finalize-fact** mechanic above; the approval-collapse and
  ceremony judgment-side step stay there. Repoint the finalize-write half here.
- `errand-lattice` (draft, `arc errand close` "Complete teardown") — **real de-dup risk:** errand-close and
  WU-post-merge-teardown likely share the `reconcile-worktree:teardown` + merged-safe `branch -d` legs but differ
  in judgment shell. The audit must settle **one verb vs. two** with these owners before either builds.
- `coord-probe` (draft) — its stale-local-branch reaper coordinates with the post-merge teardown surface; a
  consumer/coordination edge, not an owner. Surface the seam, don't absorb it.
- `concurrent-work-conventions` (`cohort-concurrent-work-conventions.md`) — carries the open **eager vs. lazy
  post-merge teardown** timing question (soft dep on `composable-workflows`). Resolve the timing policy with the
  teardown verb's design.

## Positioning — companion, not a closeout-gating member

By the cohort's consistency-on-exit standard these mechanics are **un-enhanced / further-migration** (the substrate
does the transition correctly today; this adds a CLI nicety), the category that standard explicitly leaves out of
`lifecycle-closeout` — the `graduation-cleanup` precedent (a named cohort-adjacent companion that stays downstream).
So `lifecycle-closeout` does **not** depend on this WU; the cohort's closeout criteria are unaffected by it.
Sequences independently as a fast-follow off `lifecycle-transition-core` (shipped), parallel-able with the cohort's
other tail members.

## Open questions (→ audit / create-spec)

- The full audit inventory — which workflow steps host judgment-free mechanics — and the resulting `Class` /
  decompose call.
- One teardown verb or two (WU-integration vs. `arc errand close`) — settled with `errand-lattice`.
- Eager vs. lazy teardown timing — settled with `concurrent-work-conventions`.
- Where archive-finalize GitHub inference (PR-URL auto-resolution) layers in — the integration wrapper vs. the verb.

## Dependencies

- **Cohort-internal:** `Depends On: lifecycle-transition-core` — extends its executor / mutator bundle (the
  teardown legs, the archive verb). Resolver model assumed available.
- **Coordination (not blockers):** `composable-workflows` (fragment/visibility framing), `errand-lattice` (verb
  de-dup), `concurrent-work-conventions` (teardown timing), `interlock-release-refinement` (archive-finalize
  ceremony half), `coord-probe` (reaper seam).
- **Downstream:** none — this is a tail companion; nothing depends on it (notably **not** `lifecycle-closeout`).

## Continuity

- **Readiness:** stub-shaped. The audit is deliberately the first planning move (the surface is discovery-bound),
  which is correct for a consolidation companion, not an open fundamental.
- **Next:** activate via `init-work-unit` Path A → run the audit → `create-spec` (or decompose if the audit's
  surface warrants).

---
