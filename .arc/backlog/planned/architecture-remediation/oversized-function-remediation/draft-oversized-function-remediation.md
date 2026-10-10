# Draft: Oversized Function Remediation

- **Origin:** [internal]
- **Purpose:** Burn down the concentrated tail of oversized and over-branchy units in `src/`, so the recorded
  size/complexity floor shrinks toward the point where the gate stands on its own.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Extract the native-landing settlement body back under the project size gate**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-09-19).

- _Observation:_ `reconcileLinkedNativeDeliverySuffix` spans 422 lines against a `max-lines-per-function`
  ceiling of 100, and `native-landing.ts` is 1593 lines against a `max-lines` ceiling of 1000. The gate is
  green only because `eslint-suppressions.json:569` records per-rule _counts_ (1/3/6), and a count cannot
  observe a unit that grows worse while staying one unit. This is precisely the blind spot DEV-RULES.PROJECT
  names when it forbids re-running `--suppress-rule` to clear a red gate.

- _Approach:_ extract the added stages into named module-level functions, the way the same change already did
  for `observeNativeLandingEffectDisposition` and `standingRemoteTopOf` — at minimum the settlement-phase
  publish block, the local-ref rewrite and restoration-inventory loop, and the terminal absorb/record/publish
  block — so the file moves back toward the recorded ceiling instead of resting on a blind count.

- _Interim rationale:_ real, and a major. Deferred because the correction is a structural extraction of the
  most delicate settlement body in the package, and performing it inside a pre-publication fix increment adds
  more risk than it removes. It wants its own increment with its own verification.

- _Captured during:_ an approved deferral from the `delivery-post-landing-conflict-recovery`
  pre-publication standard review, disposition set `sha256:deb4baeb…`, 2026-09-18. The finding was
  verified against source before it was deferred; nothing here is an unconfirmed report.

### `[ ]` **Decompose the delivery execution handler and the command function inside it**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: delivery-handler-decomposition (planned)`

- _Observation:_ `src/handlers/delivery-execution.ts` is 6,598 lines, the only source file over 4,000, against a
  codebase where 790 of 891 files sit at or under 500. One module-private function, `executeDeliveryCommand`,
  holds 4,457 of them and dispatches internally on the verb. Its only test seam is `handleDeliveryExecution`
  accepting an injected `execute`, which replaces the entire function — so no arm can be exercised on its own,
  and every refusal reason inside it is unobserved. `candidate-coordinate-unavailable` and
  `candidate-verification-unavailable` have zero test hits anywhere in the suite.

- _Why a work unit rather than a sweep:_ the verb arms share one request envelope, a strict result union of about
  a hundred schemas, and a single `ResultSchema.safeParse` emission point, so separating them is a contract
  decision rather than a file move. `sync-handler-decomposition` is the precedent, and the handler it addresses,
  `src/handlers/sync.ts`, is 1,584 lines — a quarter the size of this one, which has no member at all.

- _Scope:_ structural, with no behavior change intended. The coverage it unblocks is
  `delivery-correction-convergence`'s to write; this work unit only makes it reachable.

- _Cohort:_ `architecture-remediation`, whose members share a theme rather than a design and each plan, build, and
  ship independently.

- _Captured during:_ `delivery-post-landing-conflict-recovery` conversion-set verification, 2026-09-18.

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

| Lines | Complexity | Unit                                    |
| ----- | ---------- | --------------------------------------- |
| 4377  | 376        | `handlers/delivery-execution.ts:2056`   |
| 769   | 142        | `handlers/delivery-execution.ts:2663`   |
| 704   | 201        | `lib/work-unit/verbs/teardown.ts:374`   |
| 1050  | 46         | `handlers/status.ts:459`                |
| 578   | 84         | `scripts/integration/checkpoint.ts:899` |
| 498   | 88         | `scripts/integration/merge.ts:576`      |

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
