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

## The audit (planning step one — not a task)

Before any task decomposition, sweep the **errand + WU lifecycle** for deterministic, no-judgment mechanics still
executed by hand in workflow markdown (the carry-and-skip prose, the "do this by hand" tails), and produce the
inventory that scopes this WU. The audit is the design front-end; it runs at planning, feeds `create-spec`, and
may split this WU if the surface is large. It must **reconcile**, not duplicate — every candidate is checked
against the already-captured fragments below before it becomes net-new scope.

Audit output per candidate: _the mechanic · where it lives today (workflow + step) · is it genuinely judgment-free ·
does an existing capture already own it (→ consolidate / repoint) · migrate-now / leave-downstream / reject._

**Audit seed (live dogfood, 2026-06-17).** Minting _this_ WU surfaced one instance directly: `arc stub` has no
`--cohort` affordance, so placing the new member into the `lifecycle-state-machine` cohort took a hand-run dir
move (`backlog/planned/<name>/` → `backlog/planned/<cohort>/<name>/`) plus a manual `Cohort:` field write — a
deterministic placement op the CLI could own (`arc stub --cohort <slug>` placing the dir + writing the field, with
the same collision/validation guards the stub contract already runs). The friction is **not** markdown-tail this
time but a missing CLI affordance on a shipped verb, so the audit routes it rather than pre-claiming it: own here,
or repoint to the `stub`-primitive owner (`lifecycle-transition-core`'s stub contract, with `planning-pipeline-
readiness` as the planning-entry-mechanics neighbor). Recorded as the audit's first concrete data point.

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
