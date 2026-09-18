# Draft: Oversized Function Remediation

- **Origin:** [internal]
- **Purpose:** Burn down the concentrated tail of oversized and over-branchy units in `src/`, so the recorded
  size/complexity floor shrinks toward the point where the gate stands on its own.

---

## Problem / Motivation

The size and complexity gate records every pre-existing violation as a floor. The record bounds new debt but
does not reduce what it already holds, and nothing in the lint run will ever shrink it on its own.

The debt is not spread evenly, which is what makes it tractable. Measured 2026-09-18 against `src/`:
**83 functions out of 7,292 account for 16% of all function lines.** Tightening to the extreme tail gives
32 functions in 28 files. The remaining ~620 recorded violations are ordinary code sitting a little over a
threshold; they are the floor, not the work.

Remediation matters here beyond tidiness: the worst units are unreachable from a test without mocking their
whole enclosure away, which is the property the per-function limit was chosen to track.

## Scope

Derive the working set rather than reading a list — the recorded floor is generated, so any enumeration here
goes stale as soon as anyone refactors. The tail is `length > 250` (non-blank, non-comment) **or**
cyclomatic complexity `> 40`, measured by running the two limits at a reporting threshold and reading the
counts back out of the report.

Worst offenders as of 2026-09-18, for orientation only:

| Lines | Complexity | Unit                                          |
| ----- | ---------- | --------------------------------------------- |
| 4377  | 376        | `handlers/delivery-execution.ts:2056`         |
| 769   | 142        | `handlers/delivery-execution.ts:2663`         |
| 704   | 201        | `lib/work-unit/verbs/teardown.ts:374`         |
| 1050  | 46         | `handlers/status.ts:459`                      |
| 578   | 84         | `scripts/integration/checkpoint.ts:899`       |
| 498   | 88         | `scripts/integration/merge.ts:576`            |

Each reduction is followed by a whole-project lint run and a pruned, committed floor — a per-file run cannot
detect that a violation is gone.

## Alternatives

- **Clear the whole recorded floor.** Rejected as the framing: ~700 entries is an accounting of what exists,
  not a plan. Treating it as a worklist is how baseline files become permanent monuments — the documented
  failure mode for this class of record.
- **Tighten thresholds instead of remediating.** Moves numbers without moving code, and grows the floor.
- **Leave the tail and rely on the gate alone.** The gate stops new debt; it cannot see an already-oversized
  unit growing further, because the recorded count stays put while the function gets worse. That specific gap
  closes only by remediation.

## Unknowns and Assumptions

- Whether the tail decomposes into independent units or concentrates into a few structural rewrites is not yet
  known. `handlers/delivery-execution.ts` alone holds the largest unit and one of the top complexity scores,
  and may warrant its own boundary rather than sharing this one.
- Sibling members of this grouping already claim some surfaces. Resolve overlap by slug before starting, not
  from the file list here.
- Assumed: reductions land as ordinary refactors under existing review discipline, with behavior held constant
  and covered by the existing suites. Any unit that cannot be reduced without a behavior change is a different
  concern and routes out.

## Scope boundary (Won't Do)

- Does not change thresholds, gate wiring, or the recorded floor's mechanism — those shipped with the gate.
- Does not remediate `__tests__/**`. Test-file size is gated separately and its own concerns are captured
  elsewhere.
- Does not evaluate replacing the cyclomatic limit with a different complexity metric; that decision is
  captured separately and would change what the floor measures.
