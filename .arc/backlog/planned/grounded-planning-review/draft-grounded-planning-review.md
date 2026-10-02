# Draft: grounded-planning-review

- **Origin:** [internal] — extracted from `planning-iteration-mechanics` (2026-10-01): that work unit's concerns about
  planning-stage adversarial review, taken together with the `USER-INBOX` capture that prompted the cut.
- **Purpose:** Make planning-stage adversarial passes spend on design judgment rather than on slips the author could
  have caught, and make the loop's convergence count the slips its own fixes introduce. One idea runs through it: a
  planning claim about shipped behavior is grounded in source when it is written, before the first pass, and again
  when a fold rewrites it between passes.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Check an adversarial pass's own fixes before the next pass, when the fix warrants it**

- _Routed from:_ `USER-INBOX § Work Unit`, at this work unit's extraction (2026-10-01).

- _Observation:_ on `storage-contract`'s task list — Novel and code-dense, every task naming source symbols and
  asserting what they do — the fixes each adversarial pass folded in were the main source of the next pass's majors.
  Pass 2 found four of its eight majors in pass 1's fixes, and a fresh source trace of pass 2's fixes then found eight
  more. Pass 3's fixes went in without that trace, and pass 4 found three of its four majors in them. The Owner has
  seen the same pattern on earlier code-dense work units. The mutation guard verifies each _finding_ against source
  before a fix; nothing verifies the _fix_. A fold is new design, written after the per-phase grounding audit and after
  the reviewer, and the next full pass spreads its attention across the whole artifact; the post-settle coherence
  re-read is the author's own read, neither fresh nor source-grounded.

- _Grounding or incremental review:_ one work unit, not controlled, but the fix-borne slips split two ways.
    - **Behavioral grounding** — every named symbol existed, but did something other than the fix said: a wrapped
      function that is not the one `arc sync` runs, a classifier returning `error` where the fix assumed
      `unreachable`, a subclass caught by its parent's class, a "spawns no Git" promise the read path could not keep.
      Most of pass 2's fix-borne majors were these. `task-audit`'s `grounding-only` floor (named files and symbols
      exist) would not catch them; reading the code path end to end, or a probe, does.
    - **Propagation** — a fix added a rule or concept whose reach was never swept: placement required on every work
      item with no word on what an Errand's is, and rename and move exclusions written at a granularity the fixture
      contract could not express. Most of pass 4's fix-borne majors were these. Only a read of the fix against
      everything its rule governs catches them.

  So mandatory grounding looks like half the answer, and it has to ground behavior, not existence.

- _Fuel, not decisions:_
    - A layering to weigh: a cheap default in which the author checks a fix as findings are checked — every behavioral
      claim traced to source, and the artifact searched for everything the new rule reaches — and a fresh, narrow
      attack scoped to the fix text only when a tripwire fires: closure, behavioral grounding, propagation, and new
      failure in the rule itself. The narrow attack ran ad hoc on this work unit after pass 4.
    - Cost: scoped to fix text, it is far cheaper than a full pass, and might stand in for an over-cap full pass rather
      than add to one; how it counts against the pass cap is open.
    - Tripwire after the fact: the share of a pass's findings that land in the previous pass's fixes — here four of
      eight majors, then three of four. Cheap if each pass records where its fixes landed.
    - Tripwires ahead of time, as candidates: a fix that asserts what code does (names a function and says what it
      returns, costs, or spawns); a fix that adds a concept, type, field, or rule reaching past its own locus, rather
      than a local correction; a disposition set that needed an Owner decision; a fix touching several sections or
      artifacts; a code-dense work unit.
    - Not by default: on light work units fixes are local wording, and always-on doubles review spend for nothing.
    - The draft's pre-flight item grounds claims before the first pass; this is the same check between passes, on fix
      text. Its convergence item already counts repair-introduced defects as evidence against convergence.

- _Captured during:_ `storage-contract` generate-tasks, adversarial pass 4, 2026-10-01.

### `[ ]` **Run a source-grounded planning pre-flight before adversarial review**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-08-03); captured during
  `delivery-plan-record` create-spec closeout.
- _Concern:_ adversarial passes are being spent on deterministic source, reference, vocabulary, and return-shape
  defects before they can reach design judgment; one measured pass produced twelve mechanical findings and two
  design findings.
- _Fold-in:_ define one shared pre-flight method fired by all three planning stages before their adversarial
  callouts. It should verify shipped-behavior claims against source, rule-section constraints, internal references,
  defined-term use, and complete composed return types, while leaving design judgment to adversarial review.
- _Practice:_ fold a bounded few findings at a time and prefer removing constraints over adding repair machinery.

### `[ ]` **Make empirical planning claims visibly source-grounded**

- _Routed from:_ split `USER-INBOX § Work Unit` capture, housekeep drain (2026-08-03); captured during
  `delivery-plan-record` planning.
- _Concern:_ the always-loaded verify-before-assuming rule depends on authors noticing an assumption; inherited
  empirical claims can instead read as settled premises and survive until expensive adversarial passes.
- _Fold-in:_ design the authoring convention and planning-stage fire point for source pointers on claims about
  shipped behavior, coordinated with `knowledge-lint`'s mechanical enforcement half. Do not add another
  always-loaded reminder.

### `[ ]` **Discharge the adversarial-review cap concern absorbed by convergence design**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: planning-iteration-mechanics`), housekeep drain
  (2026-07-27); captured during `review-signal-convergence` draft closeout.
- _Concern:_ the pending inbound concern about adversarial-review convergence and cap-exhaustion reporting is
  now owned and settled by `review-signal-convergence` D6.2 (visible `Pass N of M`, hard stop at exhaustion,
  explicit one-pass override authority). Retaining the same concern here would create split ownership for the
  review-loop contract.
- _Fold-in:_ remove or mark the older convergence/cap inbound item **discharged** at the next planning
  closeout. Preserve unrelated iteration-mechanics scope; do not re-derive the convergence or cap-authority
  rule.

### `[ ]` **Fix adversarial-review convergence and make cap exhaustion report**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-23); captured during `wu-rename`
  create-spec finalization.
- _Concern:_ the current exit test asks whether primary-confirmed findings remain open after their repairs land,
  so a pass that found several majors can immediately read as converged. Reaching the pass cap can then end the
  loop silently even when another pass is still likely to find material issues.
- _Fold-in:_ judge what the pass found and explicitly ask whether another pass is likely to find anything
  material. Treat the cap as a cost ceiling that always reports: when not converged, recommend the additional
  pass and let the author accept or decline. Include repair-introduced defects as evidence against convergence.
  `wu-rename` required three passes despite a Heavy cap of two; pass two found a repair-introduced blocker and
  pass three found an original blocker missed by both earlier passes.
- _Status note (2026-07-27 drain):_ supersession candidate — see discharge item above once
  `review-signal-convergence` D6.2 is treated as authoritative ownership.

## Problem / Motivation

Adversarial passes over planning artifacts keep finding defects the author could have found alone: a named function
that does something other than the artifact says, a reference that does not resolve, a rule whose reach was never
swept. Each such finding spends a fresh reviewer on what source already answers, and crowds out the design judgment
the pass exists for. The defects arrive at three moments — when a claim is first written, when it survives unchecked
into the first pass, and when a fold between passes writes new claims that no one checks before the next pass. The
mutation guard verifies each finding against source before it is fixed; nothing verifies the fix.

## Scope Estimate

Medium — planning-workflow and method design: the adversarial fire-points in `draft-design.md`, `create-spec.md`, and
`generate-tasks.md`, the `adversarial-review` method's loop between passes, and an authoring convention for source
pointers, across both the package source and the `.arc/` copy. `Class` resolves at draft-design entry.

## Dependencies

- **Coordination (not blockers):**
    - `planning-iteration-mechanics` keeps the planning-stage gate and task-plan sizing concerns. Its open question —
      whether `generate-tasks` gates spec readiness at entry — sits beside this work unit's pre-flight.
    - `knowledge-lint` owns mechanical enforcement of source pointers; this work unit owns the authoring convention
      and its planning-stage fire-point.
    - The storage program moves adversarial-pass results from `ADVERSARIAL-PASSES.md` into review records at the flip
      (`storage-contract` D5). Keep anything this work unit records about a pass within today's file and shape, and add
      no stored record.

## Continuity

- **Readiness:** stub-shaped. Five routed concerns with their origins and approaches preserved.
- **Next:** start, then iterate via `draft-design`. First moves: settle the layering the capture proposes — a default
  author check of each fix, and a fresh narrow attack on fix text only when a tripwire fires — and the fire-points
  across the three planning stages; discharge the convergence and cap entries against `review-signal-convergence`'s
  shipped rule, keeping only fix-introduced defects as evidence against convergence.

---
