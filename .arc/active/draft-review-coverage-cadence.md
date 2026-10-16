# Draft: review-coverage-cadence — how much each re-review pass re-reads

- **Origin:** [internal] — a `USER-INBOX § Errand` capture taken during `seam-delivery-review` create-spec
  (2026-10-15) from the field evidence of `seam-lifecycle`'s review, then scoped and groomed in a design discussion
  with the Owner on 2026-10-16; minted planned, P1, `Heavy`, and pulled forward beside the storage seam the same day.
- **Purpose:** Decide how much each re-review pass re-reads after fixes — complete passes on a cadence, incremental
  fix checks between them, and a sibling sweep in both — and give code review and adversarial review one pass model,
  so a large `sensitive` change set stops paying a complete pass for every fix round without losing what later passes
  actually find.

---

## Continuity

- **Readiness:** groomed. The shape is settled (§ Decisions); the open items are detail design (§ Open questions).
  The evidence is in `notes-review-coverage-cadence.md`; nothing here needs re-deriving.
- **Timing:** pulled forward ahead of the storage program's completion by Owner exception (2026-10-16), past both the
  pull-forward filter's work-unit clause and its before-the-seam clause. The exception holds on one condition: this
  work unit adds no stored record or record shape. Any shape its design turns out to need goes to
  `seam-delivery-review` rather than landing here. It lands ahead of that member's implementation (§ Coordination).
- **Runs beside it:** the `review-sibling-sweep` Errand (PR #1028) — `review-triage` searches the reviewed change for
  other instances of each confirmed defect, and the incremental reviewer prompt asks whether each carried finding's
  defect recurs elsewhere in the complete change set. This work unit builds on it rather than repeating it.
- **Settled at the 2026-10-16 grooming:** D1–D7.
- **Next:** `arc start review-coverage-cadence`, then draft-design:
    1. Check this draft against `strategy-procedure-evolution.md` and `strategy-knowledge-evolution.md` (Owner
       request): it moves judgment across the CLI and agent boundary (D5), adds conditional review prose, and places
       new adopter-facing guidance (D7). Read `analysis-load-set-scoping` before settling where D7's model lives.
    2. Settle § Open questions, first the convergence rule (question 1), which sits on the review gate's integrity
       path.
    3. Run create-spec. Re-confirm `seam-delivery-review`'s §4.3 wording and its implementation timing before the
       spec is approved.

## Problem / Motivation

### The rule today

- `classify-review-risk` calls a change `sensitive` when a defect in it could be destructive, authoritative, or
  irreversible. Its list includes admission controls — review and merge gates, required checks, interlocks, and the
  evidence they read — so in this repository most code changes are `sensitive`.
- `reduceReviewRoutingBase` in `scripts/review-gate/policy/routing.ts` routes `sensitive` to `standardReview:
  required` with `retrigger: full-final`.
- Since `c30cfe735` (2026-10-13), `resolveOfferedCorrectionScope` in
  `scripts/review-gate/policy/local-review-coverage-selection.ts` returns no incremental scope under `full-final`, and
  its interaction text says "This route requires complete coverage". The Errand paths agree: `status-errand.ts`
  requests complete coverage for any non-incremental route, and `errandNextPassCoverage` in
  `scripts/review-gate/runtime/respond-command.ts` reports `complete`. Every pass after a fix therefore re-reads the
  whole target, however small the fix.
- The work-unit hosted path does not apply that cut: `hosted-reservation-discharge.ts` resolves a correction scope
  (about `:804`) checking only that predecessor and current policies are equal. A `sensitive` work unit on CodeRabbit
  can be offered `@coderabbitai review` while the same route forces complete coverage locally. Found by reading, not
  by a run.
- That is not what `full-final` was designed to mean. The `review-architecture` spec says "`full-final` may use
  incremental passes for feedback, but satisfaction requires a final full review of the settled target".
  `evidence-applicability` later found the value inert — no behavioral consumer read it — and `c30cfe735` gave it its
  every-pass reading.

### What it cost, and what complete passes found

`seam-lifecycle` ran eight complete standard passes over about 17.7k changed lines (326 files, 11 chunks), every one
on the `full-final` route. Its fix rounds changed 2–6% of that. Of 57 findings fixed in passes 2–8
(`notes-review-coverage-cadence.md` has every one):

- 9 sat inside the previous round's fix and 7 within 25 lines of it — both criticals among them.
- 6 sat in an earlier round's fix code that one to five complete passes had already read and passed.
- 21 were siblings: original code, in a defect class an earlier finding had already exposed.
- 14 were new defect classes in original code — 8 in pass 2, 3 in pass 3, 3 in pass 5, and none after.
- Separately, one rejected finding was raised again in each of passes 2–8.

Complete passes earned their cost through about pass 3. After that they mostly found fix-adjacent defects, which an
incremental check covers, and siblings, which a targeted sweep finds more cheaply than a whole re-read. A straight
switch to incremental would have kept only 16 of the 57, so the capture's original approach — route `sensitive` to
`retrigger: incremental` — is an overcorrection on this evidence. The middle ground is a cadence.

### Prior art

Practice points the same way; confidence is noted, and the thinnest evidence is numeric thresholds and anything
LLM-specific.

- **Inspection** (Fagan; Gilb and Graham): follow-up verifies the rework by default; the whole product is
  re-inspected when rework is large or estimated remaining defects are high. The often-cited "more than 5% reworked"
  threshold could not be traced to a primary source.
- **Variant analysis** (CodeQL, Project Zero): after one bug, hunt its variants across the codebase; incomplete fixes
  and variants are common. This is the sibling bucket.
- **Test impact analysis** (Google, Meta): run the tests a change affects, with a periodic or pre-release full run as
  the net for what selection misses. This is the fix-check-plus-cadence shape.
- **Review hosts:** the interdiff is the reviewer's working view (GitHub "changes since last review", Gerrit,
  Critique), while a substantive push resets approval; Gerrit carries votes only across provably trivial changes.
- **Repeated LLM review:** reruns surface new findings, many of them unstable one-pass singletons (Snyk VulnBench);
  no validated stopping rule was found.

## Decisions

### D1 — `full-final` means what its name says

Between complete passes, a fix gets an incremental fix check; a complete pass runs at the settled head. `sensitive`
keeps `retrigger: full-final` as its stored value, so this changes behavior, not routing. Two consequences:

- **No transition pass.** `compatibleStandardPolicy` and `resolveOfferedCorrectionScope` compare the predecessor's
  requirement, `retrigger` included, with the current one; they still match, so reviews already in flight keep their
  incremental basis. The capture's flip of `sensitive` to `incremental` would have cost one transition pass.
- **The surface promotions keep `full-final`** with no change to `reduceReviewRouting`'s `sensitive` guard, which the
  flip would have had to reopen.

Rejected: route `sensitive` to `incremental` (the capture's approach) — it drops the complete passes that found 14 new
defect classes, with nothing in their place.

### D2 — Every fix check sweeps for siblings

A fix check asks, for each finding it re-examines, whether the same defect recurs elsewhere in the complete change
set. Triage does the same before approval, so an approved fix covers the class. `review-sibling-sweep` ships both
halves for today's incremental pass; this work unit carries the sweep into the fix check's rubric (D3) and the shared
model (D7).

### D3 — A code-review fix check composes adversarial review's fix check

`adversarial-review`'s fix check is an independent review of the folds, outside the pass cap, offered beside the
disposition set and declinable, in rounds that each check the previous round's repairs. A code-review fix check is
that procedure over code review's existing incremental attempt:

- **From code review:** the correction scope and its basis head, and re-examination of every earlier material finding
  at its locus (`buildIncrementalCorrectionScope`, `localReviewerInstructions`); CodeRabbit's native incremental review
  for the hosted lane.
- **From adversarial review:** the four rubric axes — closure, behavioral grounding, propagation and completeness (the
  sweep, D2), and new failure — and the offer, decline, and round rules.

No new attempt kind, admission path, or record. It would become new machinery — the kind
`review-orchestration-right-sizing` exists to cut — if the fix check got its own attempt kind, counter, or
authorization records; that is out (§ Scope).

### D4 — The pass ceiling counts complete passes

The ceiling bounds discovery passes only. Its count derives from the outcomes' stored `effectiveCoverage`, so nothing
new is stored. Fix checks sit outside it, bounded as adversarial review bounds its rounds: no round cap, each round
approved. The approval rides the fix round's complete-set disposition approval ("approve these fixes, then fix-check
them"), composing with the queued Errand for one approval per review-fix round rather than adding a stop.

This changes the counted unit. Today `completedPasses` counts every finished pass, an incremental one included; under
D4 a finished incremental fix check is not counted, and only passes whose `effectiveCoverage` is complete are.
`seam-delivery-review` took the coordination into its spec (Owner, 2026-10-16): its §4.3 derives a lineage's pass
count in each lane from its stored outcomes "as the lane's pass policy counts them", and its §5.1 `extra-pass`
(`passCount`) and §5.5 consumption follow that count, so both follow whatever count this policy derives — and under
§5.5 a fix check spends no `extra-pass` decision. That member asked to be told of any change to the counted unit; D4
is that change, and the convergence rule (open question 1) alone needs nothing from it.

### D5 — When another complete pass is due

A recommendation, never a gate; the Owner decides, and the recommendation is clear either way, at the cap included.
Recommend a complete pass while complete passes still find new defect classes in code earlier passes read, or when a
fix round was new design rather than local correction (adversarial review's fold tags). Otherwise recommend a fix
check, or stopping. This is adversarial review's re-inspection test carried to code lanes, and it gives code review
the cap recommendation `adversarial-review` already states.

### D6 — Hosted review follows the same policy

- **CodeRabbit:** ARC already maps coverage to `@coderabbitai review` (incremental) or `@coderabbitai full review`
  (complete); it follows D1 once the work-unit hosted path applies the same `full-final` handling as the local and
  Errand paths.
- **Codex:** ARC sends a bare `@codex review` for either coverage and records the result as complete
  (`correctionReview: "complete-upgrade"`). Keep that record. Add a focus hint naming the fix range and the sibling
  classes only if the empirical test (open question 5) shows it steers usefully; since coverage stays recorded as
  complete, a hint cannot overstate it.

### D7 — One pass model for code review and adversarial review

The two families name one set of concepts twice:

| Adversarial review          | Code review                               |
| --------------------------- | ----------------------------------------- |
| pass cap (`Pass N of M`)    | pass ceiling (`completedPasses`)          |
| fold                        | fix, correction, response                 |
| fix check, in rounds        | incremental correction pass               |
| re-inspection test          | — (D5 adds it)                            |
| converged / `cap-exhausted` | `pass-complete` / ceiling override        |
| —                           | `full-final`, whose behavior drifted (D1) |

Define one model — pass, fix check, cap, convergence, re-inspection test, fold tags, and cadence — with per-family
defaults: a planning artifact is small, so a complete pass every time stays cheap there; a large code change takes
complete passes on a cadence with fix checks between. Records stay separate by design: `seam-delivery-review` gives an
adversarial pass a record of its own shape (`review/adversarial-pass`, its § 7) rather than the review gate's.

- **Home:** the review-pass section of a review strategy, minted here if none exists — the narrowed slice of
  `review-orchestration-right-sizing`'s "Give review-lane doctrine a strategy home", which keeps the placement charter
  and the rest. A new adopter-facing strategy needs an `init-recipe.json` disposition, or it reaches no project.
- **Prose aligned to it:** `adversarial-review`, `review-triage`, `review-response`, and `classify-review-risk`'s "What
  the call changes", in the package's `arc/` source and then the `.arc/` copies.
- **Identifiers wait for evidence:** renaming the `adversarial-review` method, the `full-final` value, or verbs ripples
  through workflows, skills, and requirement digests, and renaming `full-final` would bring back the transition pass
  D1 avoids. `review/adversarial-pass` keeps its name (`seam-delivery-review`, Owner, 2026-10-16) and follows the
  method's name if that changes, which stays cheap until that member's implementation starts.

## Staging

Each segment closes on a capability that can be exercised:

1. **Cadence, local and hosted** (`slice`) — D1 with its convergence rule, D5 as interaction and recommendation
   text, D6's work-unit hosted parity, and D3's rubric in the incremental reviewer prompt. Ships the main relief.
2. **Ceiling and fix-check approval** (`slice`) — D4, with the approval riding the disposition approval, verified
   against `seam-delivery-review`'s §4.3 wording.
3. **Shared model** (`layer`) — D7's strategy section and prose alignment, the Codex test and any focus hint, and the
   AGENTS.md heading check (open question 5).

## Open questions

1. **What completes the standard lane under `full-final`?** (a) A complete clean pass at the final head — the
   `review-architecture` reading; (b) a complete pass after the last new-design fix, with fix-check convergence
   after it; or (c) recommendation and Owner decision only. Lean (a), with the existing Owner-directed stop for a
   complete pass that keeps returning only minor findings. `seam-lifecycle`'s pass 8 still returned five, so the
   stopping rule matters as much as the cadence. Where `pass-complete` is decided (`review-policy-driver.ts`,
   `review-policy-evidence.ts`) is the integrity path this touches.
2. **Does a fix check cite an `approved-fix` extra-pass decision, or run outside it,** once it no longer counts
   toward the ceiling? `seam-delivery-review`'s §5.5 sets the cost. An attempt that cites the decision
   (`admittedBy`, its §4.6) consumes it at admission whether or not the attempt counts, as
   `bindConditionalPendingAdmission` does today; afterwards the decision admits only a retry of an unfinished attempt
   under the same source, scope, coverage, actors, and policy. A fix check that cites the decision therefore spends
   it, and no later complete pass can run under it. That member keeps the decision's shape and key either way.
3. **Where does D5's fold-tag signal come from in code review?** Adversarial review tags each fold; code review has
   no tag. Recommendation-only tagging at disposition time stores nothing; a stored tag is a record field and goes to
   `seam-delivery-review`.
4. **Should complete passes receive earlier findings?** For sibling sweeps, and so adjudicated rejections stop
   recurring. The standard rubric tells the evaluator not to be given "author conclusions, preferred fixes,
   self-verification claims, or suspected weak spots"; reviewer-originated findings are arguably not author steering,
   and today's incremental prompt already lists them. Decide the line.
5. **Codex hosted, empirically.** Does text after `@codex review` steer scope or only emphasis, and does Codex review
   later pushes incrementally? Its docs show a focus example (`@codex review for issues in the database migration`)
   and say nothing on incremental behavior. Test on a throwaway pull request — outward-facing, so with Owner approval
   at the time: two seeded defects, a later push adding a third, then plain and scoped triggers, two or three runs
   each. Also verify the AGENTS.md heading: current Codex docs reportedly name `## Code Review Rules`, while ARC's
   generated AGENTS.md section is `## Review guidelines`; if Codex no longer reads it, the hosted rubric is silently
   ignored. Unverified — from a summarized fetch.
6. **CodeRabbit configuration interplay.** `reviews.auto_review.auto_incremental_review` defaults to on, and
   `auto_pause_after_reviewed_commits` to 5; decide whether ARC-requested reviews need configuration guidance beside
   D6.
7. **Chunk-aware fix checks.** A complete pass over a large target is chunked; should a fix check name the chunks its
   range touches, so a chunked evaluator reads only those?
8. **`Class`.** `Heavy` was the grooming estimate once D4 and D7 joined; re-read it at draft-design.

## Coordination

- **`seam-delivery-review`** — coordinated directly with its create-spec session (2026-10-16):
    - its §4.3 derives the pass count as the lane's pass policy counts it (D4; Owner-approved, in its spec);
    - the `approved-fix` extra pass keeps its shape and key (open question 2);
    - its spec holds no `full-final` or incremental-policy text, and outcomes keep `requestedCoverage`,
      `effectiveCoverage`, and `correctionScope` as they are (§4.2);
    - file overlap, all in its §14.2: `local-review-coverage-selection.ts`, `core/local-prepare.ts`,
      `runtime/respond-command.ts`, `status-errand.ts`, and `hosted-reservation-discharge.ts`, plus
      `review-policy-driver.ts` and `review-policy-evidence.ts`, where it renames the `phase-closed` skip and reads
      extra-pass consumption — the convergence rule (open question 1) touches both. This work unit lands first; that
      member takes the base-merge conflicts;
    - `review/adversarial-pass` keeps its name, following the method's if that is renamed (D7; Owner-approved).
- **`review-orchestration-right-sizing`** — this work unit took its "Decide whether code-review lanes' next-pass
  recommendation adopts the re-inspection test" (D3, D5) and the review-pass slice of "Give review-lane doctrine a
  strategy home" (D7). Adjacent entries stay there: dropping correction obligations a later pass independently
  validated (a per-finding verdict is a record field), the fix-check sets in the adversarial-pass record, Errand scope
  conservation across review corrections, and review fixes that land outside a finding's cited file (delivery-member
  admission; the sibling sweep produces such fixes, so expect the guard there to matter when delivery resumes).
- **`approval-flow-refinement`** — the queued Errand for one approval per review-fix round composes with D4's
  approval; neither should add a stop the other removes.
- **`review-protocol-alignment`** — held behind the seam; no overlap known. Re-check at draft-design.

## Scope (provisional)

- **In:** the seven files above, the policy driver and evidence for the convergence rule; `hosted/codex-body.ts` for
  any focus hint; `classify-review-risk`, `review-triage`, `review-response`, and
  `adversarial-review` prose in both copies; the strategy section and its recipe disposition; and their tests.
  `routing.ts` should need no change (D1).
- **Won't do:**
    - a new record kind or field — it goes to `seam-delivery-review`;
    - per-path sensitivity — `seam-lifecycle`'s defects spread across all 11 chunks, so the evidence does not support
      it;
    - discharging correction obligations by independent validation — `review-orchestration-right-sizing`;
    - identifier renames, unless design shows they are worth their cost (D7);
    - delivery-member review-fix admission.
