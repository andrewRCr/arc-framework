# Draft: cold-start-init-polish

- **Origin:** [internal] — spun off from `planning-pipeline-readiness` at its scope-split planning (2026-06-17).
  Cold-start WU-init cleanup that surfaced incidentally across heavier WUs; kept **whole** at the scope-split
  rather than splintered across four separate homes (the deliberate call — see § Positioning).
- **Cohort:** [none] — cohort-**adjacent** companion to `lifecycle-state-machine` (see § Positioning), modeled on
  `graduation-cleanup`: a named companion that stays top-level with no `Cohort` field and no `Depends On` gate.
- **Purpose:** Smooth the no-draft cold-start → `low`-path → active-WU init flow. The flow **works** today but is
  underspecified at several seams that each cost a manual workaround; consolidate the cluster into one coherent
  cleanup rather than scattering the fixes.

---

## Problem / Motivation

The cold-start path (a branch checked out for new work, no work unit, typically `low`-path / no-draft) reaches an
active WU correctly but leans on hand-run workarounds at several seams. The cluster surfaced live during
`release-ceremony-commits` planning (2026-06-17, the first live cold-start / no-draft WU init). It is incidental
cleanup, not the planning-pipeline readiness spine — so it left PPR — but its facets share one locus (cold-start
WU init), so they stay together.

## Facets (kept whole)

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: planning-pipeline-readiness`), housekeep drain (2026-06-17);
  captured during `release-ceremony-commits` planning — first live cold-start / no-draft WU init.

1. **Commit-footer / commit-format + `commit-msg` hook grammar gap.** No valid footer exists for a `draft-design`
   `low`-path / meta-only planning capture: the parentheticals are lifecycle transitions + `maintenance`, with no
   `(planning)`; the `draft-design` template's `draft-{name}.md (planning)` is unusable when there is no draft —
   the live run fell back to `meta-*.md (maintenance)`, which is semantically wrong. (If this facet's grammar fix
   is ever extracted, its home is the `commit-format` / `commit-footer` methods — **not** `naming-conventions`,
   which governs artifact naming, not footer grammar.)
2. **`arc start --here` protected-base behavior.** It refuses on a protected base without auto-cutting or offering
   the `plan/<name>` branch — the live workaround was a hand `git checkout -b` first.
3. **`arc start` CLI ↔ `init-work-unit` ↔ `arc-plan` relationship, uncodified for cold-start.** Nothing routes
   "mint a WU" to a workflow; the cold-start entry is undefined as a sequence.
4. **ROADMAP regen hand-rendered for the newly-active WU** (the `roadmap-tooling` gap — interim hand-render
   discipline until the renderer ships).

**Entrypoint facet.** The `drain-inbox` → `run-errand` execution-transition has no re-classify checkpoint before
handing off (it assumes a `§ Atomic` capture is errand-sized); and once "it's a WU" is decided, there is no
codified classify-then-**mint** path — `run-errand`'s promote-to-WU only fires _after_ launch, so a pre-launch
"this is WU-sized" call drops into hand-rolled minting.

## Positioning — cohort-adjacent companion, kept whole

The facets brush several owners — the `arc start` / init-routing facets (2, 3) are `lifecycle-state-machine`
territory (`lifecycle-transition-core`'s `start` dispatch, already shipped); the entrypoint facet touches
`errand-lattice` (errand→WU promotion) and `out-of-wu-entry` (entry signals, a different cohort); facet 1 is
commit-grammar; facet 4 is `roadmap-tooling`. The scope-split decision was to **not** splinter them across those
homes — the cluster is incidental cold-start-init cleanup that reads as one coherent unit, and fanning it out
would scatter a single cleanup far around the codebase. So it lands as one companion stub, in the
`graduation-cleanup` mold: cohort-associated in prose, no membership gate, sequences independently. It is **not**
a `lifecycle-closeout` concern — by the cohort's consistency-on-exit standard these are _un-enhanced_ UX seams
(the flow works), not documented-but-unbuilt inconsistencies, and the cleanup can fast-follow the
already-shipped `lifecycle-transition-core` rather than waiting on the whole cohort.

## Scope Estimate

Small–Medium (days) — several independent small fixes across `commit-format` / `commit-footer` methods + the
`commit-msg` hook, `arc start` / `init-work-unit` / `arc-plan` cold-start routing, and a `drain-inbox` re-classify
checkpoint, across both the package source and the `.arc/` copy. `Class` likely `Light`–`Heavy` depending on how
much the entrypoint routing formalizes; confirm at draft-design. May decompose if the entrypoint-routing facet
grows.

## Continuity

- **Readiness:** stub-shaped. The facet cluster and its origins are preserved; the design question at first
  iteration is how much each facet formalizes (small fix vs. routing design) and whether the entrypoint facet
  stays here or coordinates with `errand-lattice` / `out-of-wu-entry`.
- **Next:** activate via `init-work-unit` Path A → iterate via `arc-plan` → `draft-design`. First move: confirm
  the cluster holds as one WU, and resolve facet 1's footer grammar (smallest, unblocks clean cold-start commits).

---
