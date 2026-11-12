# Notes: projection-team-scale

## Contents

- [The scale benchmark's fixtures](#the-scale-benchmarks-fixtures)
- [Workflows that write under `completed/`](#workflows-that-write-under-completed)
- [The flip's errata convention](#the-flips-errata-convention)
- [Model evidence](#model-evidence)

## The scale benchmark's fixtures

Success Criterion 1 holds this unit's part of the scale criterion: `arc save`, and a start's increment while an archived
file is open. A command's independence from a settled archive's size is `projection-worktrees`' claim, shown by its
paired start comparison and its invalid-partition test; scale at team size is `projection-narrowed-views`'.

The criterion runs over `projection-worktrees`' timing fixtures, as committed at `440a357141` on that unit's branch.
`createProjectionTimingTemplates` (`packages/arc-framework/__tests__/helpers/store/ref-projection-timing.ts`) lays 140
backlog and 20 active owners of two files each, the 320 hot files, and 480 archived owners of one file each across four
quarters, about 120 archived entries a quarter. Its expanded template gives each archived owner 124 more files, 60,320
files in all and about 15,000 entries a quarter. `store-ref-projection-timing.test.ts` measures interleaved standard and
expanded starts only under `ARC_STORE_BURSTS=1`, and reports raw medians and paired differences without asserting the
bounds, which `projectionPerformanceBounds` (`lib/store/projection/timings.ts`) holds.

A4's standard and expanded start medians (`notes-projection-worktrees.md` § A4) were 14.57 and 14.64 ms on the Linux
reference `m5-air-ac`, 107.40 and 106.91 ms on Windows, and 31.79 and 32.04 ms on macOS, leaving start margins of about
5.4, 37.6, and 13.0 ms under the 20, 145, and 45 ms budgets. The paired expanded-minus-standard start medians were
−0.27, +1.49, and −1.09 ms. A same-head Linux repeat measured 17.94 and 19.77 ms starts, so a raw reading against the
budget can fail on variance across runs that a paired reading cancels.

## Workflows that write under `completed/`

No workflow amends an archived design: `amend-design.md` amends a work unit's design in flight and never touches
`completed/`. The one hand edit workflows make there is `archive-work-unit.md`'s errata convention on a Release Notes
Entry after `Shipped`; every other write under `completed/` is a verb's, which reaches the store without `arc edit`.
This unit changes no workflow.

## The flip's errata convention

`cutover-flip` depends on this unit, and its final full rehearsal (Stage 2) and the cutover window wait for this unit to
land. Its specification rewrites the errata convention (its H4) for `arc edit` from the start, from the command's name,
rights, and sequence sent to its session on 2026-11-10, with a correction the same day: the read-only lay is a lay mode,
not an edit right, and a new path opens only once its file exists. A change to the command's name, rights, or sequence
during the build goes to that session too.

## Model evidence

The per-unit constants and model v2's growth table are in `notes-projection-worktrees.md` § Spike 3 and § Spike 4; the
model's re-run at the scale anchor (23 work units a month a person, 20 worktrees, three years of archive, and teams of
1, 10, 50, and 150) is in `draft-projection-narrowed-views.md` § Evidence. The model is linear, takes the index codec's
constant at the measured size nearest each scenario, models no contention, and took its Windows constants from a runner
at below-normal priority. Where its figures meet A4's measured bounds, the measurements govern.

---
