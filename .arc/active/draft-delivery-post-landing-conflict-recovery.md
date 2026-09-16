# Draft: Delivery Post-Landing Conflict Recovery

- **Origin:** `USER-INBOX § Work Unit`, minted from the routing close-out of
  `concurrent-integration-characterization` (2026-09-14), which carried its captures and added field evidence.
- **Purpose:** Give a landed delivery member a typed route back to closeout when its retained suffix, its terminal
  binding, or the shape of the base history leaves the exact-head comparison unsatisfiable — without relaxing that
  comparison or turning an Owner authorization into a general escape contract.
- **Planning posture:** The failures are proven and reproduced under probe. The originating instance is retired, so
  nothing is blocked on this work today; what remains is that the mechanism which produced the residue is unfixed
  and the next stacked landing meets it again. The surface spans whole-work-unit verification, Candidate
  applicability, public review, landing, and closeout, which establishes `Class: Heavy` and a `P1` slot.
- **Readiness:** `rough` — the failure family is fully characterized and its boundaries are settled; no mechanism
  has been chosen yet.

---

## Continuity

### Resolved

- **The two routed captures are integrated.** Both entered the body below; § Retained capture detail keeps the
  success criteria, boundaries, and file pointers that the body does not restate. Nothing from either was dropped.
- **Seven probe rows are owned here**, distributed across three of the characterization's four axes — not the four
  loci the origin captures described. § The failure family carries them.
- **The boundary with `delivery-correction-convergence` is settled on evidence** rather than on the steering map's
  base-unmoved criterion, which does not separate the two adjacent rows. § Boundaries.
- **The ambiguity seam has four verbs, not three**, and the fourth returns a wrong answer instead of refusing.
- **The rebind verb already works.** What is missing is a route to it from the verbs that read the binding.
- **The post-land refusal is correct.** Its defect is the guidance wrapped around it one layer up.

### Open

- **Scope and cut.** Axis B (one condition, four disagreeing readers) and Axis A (readers with no ancestry term)
  may be one mechanism or two separable ones. Run `assess-boundary-fit` against the scope draft before committing.
- **Whether `terminalAuthoringMovement` is the unifying substrate** or only the Axis A half of it. § Substrate.
- **What the Axis B readers should agree on** — a shared cardinality-aware resolver, a typed refusal every reader
  emits identically, or a conservative multi-base overlap proof that admits the ordinary checkpoint.
- **What completes the post-land settlement.** The refusal is correct and the resolved member head cannot reach it;
  an attended resolution route is still owed and its shape is unchosen.
- **Whether a durable `landed-awaiting-suffix-resolution` phase or a reservation-local transition composes better**
  with the existing provider-adoption conflict machinery. Carried unresolved from the origin capture.

### Next

Work the scope question: decide whether Axis A and Axis B are one mechanism, firing `assess-boundary-fit` on the
result. `assess-design-proportionality` fires when the first candidate mechanism is on the table, ahead of
elaborating it.

---

## Problem / Motivation

Ordinary movement after a member lands can leave a merged member under a reservation with no typed conflict
continuation. The exact-head comparisons that protect delivery are correct; what is missing is any route back when
independent evidence already proves the contribution landed and only the coordinate disagrees.

The originating instance is closed. `evidence-applicability` landed on `main` as `cbf075da7`, its final member
merged at head `841ddb632`, and `arc delivery closeout` refused `terminal-unsettled` because the retained terminal
member still bound reviewed head `57ce62b1d`. An execute-bound Errand retired that residue operationally; the work
unit is shipped and torn down, and `candidate-reroot-recovery-frame` is no longer queued behind it. Only the
instance was fixed. The durable route is this work unit's, and the next stacked landing reaches the same wall.

---

## The failure family

`concurrent-integration-characterization` widened to a second matrix specifically because its first — six
post-execution boundaries by base-movement kind — re-finds none of these failures. They move a bound record's head,
the shape of the history, or a ceremony's own writes, not the base. Seven of its rows resolve here.

Each row below is a recorded observation against base `cbf075da7`, not a claim.

### Axis A — a reader compares a bound head with no ancestry term

The rebind verb itself is covered and works: `delivery-terminal-recovery.e2e.test.ts` observes it four ways,
including rebinding stale terminal coordinates to the independently settled current Candidate and renewing
verification for substantive movement past a settled record-only terminal. The matrix marks that cell
not-applicable for exactly that reason, and puts the probe on **the binding's readers** — with the note that this
is why every recorded failure survived that coverage.

- **Public review.** Readiness against a member whose branch advanced past the head its record binds returns
  `invalid` / `delivery-member-unbound`, no remedy. The probe asserts directly that this is the same result the
  same handler returns over a repository carrying no delivery state at all: the comparison is head equality and
  reads no ancestry, so **a stale binding and an absent binding are indistinguishable here**.
- **Closeout.** Against a terminal the host merged at a descendant of the bound head, closeout returns `blocked` /
  `terminal-unsettled` with a remedy directing a rerun over the same work-unit, repository, and remote inputs —
  none of which reaches the binding the comparison actually reads. Recorded `did-not-clear`.

Divergent — non-append-only — head movement is enumerated and closed. Every capture asks for append-only movement
to be recognized and for divergence to stay fail-closed, and none reports divergence being wrongly admitted.

### Axis B — merge-base cardinality is not one, and four readers disagree

One condition, four readers, four behaviours. Three refuse in three vocabularies; the fourth does not refuse.

| Reader                | Mechanism            | Result                                                 |
| --------------------- | -------------------- | ------------------------------------------------------ |
| Whole-WU verification | plain `merge-base`   | silently picks one; nothing records the choice         |
| Prepublication        | Candidate `--all`    | `classification-unavailable / merge-base-ambiguous`    |
| Public review         | sole-base resolver   | untyped throw, surfaced as a blocked obligation detail |
| Landing               | the overlap analyzer | `reconcile`; overlap `unavailable / merge-base-failed` |

- **Whole-WU verification is the severe one.** The collected subject named the base's own change and **omitted the
  branch's commit entirely** — no refusal, no reason, nothing recording that a choice between two ancestors was
  made. A companion case proves the subject digest differs across the two arrangements, and the digest is what
  currentness compares: identical branch work therefore reads as a changed Candidate and the ordinary fallback
  demands a fresh root. That is the mechanism behind the field's roughly 130 removed paths and its demand for a
  full new root over a terminal branch that already contained the landed predecessor. Classified
  `redundant ceremony`, and it is the only cell on this seam that returns a wrong answer rather than a stop.
- **Prepublication refuses the same condition the row above passes through silently.** Both readers are correct
  about the history and disagree about what follows from it: one boundary binds a subject derived from an
  arbitrary choice while the next declines to classify at all.
- **Public review sends the caller back to a checkpoint that already passed.** Status reports `base-moved` /
  `rerun-checkpoint`; the routed obligation reads `blocked` carrying "The Candidate target has no sole base
  coordinate." Nothing about the branch's contribution changed, and the rerun reads the same history and reaches
  the same reading — `did-not-clear`.
- **Landing degrades its evidence, not its verdict.** The drift read returns `reconcile` either way; only the
  overlap under it goes unavailable. That is what makes the consequence a classification failure rather than a
  drift failure — and it becomes a stop one layer up, at the checkpoint's
  `delivery-terminal-blocked / drift-classification-unavailable`.

A base with no common ancestor at all is enumerated and closed: the analyzer already gives it a distinct
`unrelated` status.

### Axis D — post-land suffix settlement composes before it reads the resolution

Replaying a pinned pre-landing contribution onto a landed predecessor returns `contribution-conflicted` naming the
path — and returns the **byte-identical refusal** once the operator resolves that path onto the landed predecessor.

The conflict is composed from three coordinates: the pinned predecessor as merge base, the pinned member, and the
observed landed predecessor. The resolved member head is consulted only after composition succeeds, so it cannot
affect a composition that conflicts. The probe proves the directed action is not an input to the outcome.

This sharpens the field record rather than repeating it. That record attributed the dead end to an external stack
rebase being unable to change the pinned replay; the pinned side is only half of it. The replay's other endpoint
does follow the operator, and still cannot help, because the conflict is decided before that endpoint is read.

The refusal is classified `fail-closed, correct` and is deliberately unpinned — a hand-resolved suffix is not a
mechanical reapply, and the proof is right not to call it one. **The defect is one layer up, at
`native-landing.ts`**, where the settlement wraps this result in guidance directing the operator to resolve the
listed paths and rerun `arc delivery native land-status`. That text names a remedy the row proves cannot clear it.
It is not covered by the in-flight drift-remedy Errand, whose sites are the integration checkpoint, its advisory
register, the drift continuation, and teardown.

A completing input is still owed. What the probe removes is the assumption that operator resolution is that input.

---

## What the field record got wrong

Recorded so an implementer starting from the origin captures does not inherit these.

- **"Three of the four loci are one ambiguity at three verbs."** Four verbs. The fourth is whole-WU verification,
  and it is the one that does not refuse.
- **Locus 2 attributed the fresh-root demand to the `attest` fallback.** The fallback behaves correctly on the
  subject it is given; the arbitrary ancestor choice upstream is what makes that subject wrong.
- **The post-land capture asks for a durable re-enterable settlement as though the replay were the defect.** The
  replay's refusal is correct. The narrower true defects are the guidance text and the absence of any completing
  input.
- **The origin captures frame loci 3 and 4 as needing a recovery route to be invented.** The rebind verb exists,
  is covered, and works. The gap is that the readers refuse without offering it.
- **The posture said "live and currently blocking."** The instance was retired by its Errand before this session.

---

## Substrate: one observation mode, three postures

`terminalAuthoringMovement: allow-append-only` already exists, and five observation modes pass it. The
characterization records that its consumers disagree:

- the position verb passes one value — the allowance makes the movement an observable **fact** rather than
  admitting it, and the verb then refuses on that fact's presence;
- session-init passes none, so the strictest posture is the default for the surface that only reads;
- review readiness and closeout read head equality with no ancestry term at all, so the fact never reaches them.

Three consumers, three postures, three recorded failures. Whether this is the unifying substrate for Axis A — or
for the whole family — is the first open question in § Continuity.

---

## Boundaries with neighbouring work

### `delivery-correction-convergence` — settled

The two adjacent rows look like one mechanism and are not:

- **Theirs** (landing / position over an append-only terminal advance): refuses `review-fix-routing-required`. The
  recognition mechanism is built; what is missing is a route from the fact to resumption.
- **Ours** (public review readiness): the comparison reads no ancestry, so the movement is never a fact it holds.

**Sees it and will not route** versus **cannot see it**. That cut is evidence-backed and does not depend on the
steering map's "the base did not move" criterion, which does not separate these two. The map's criterion still
holds for that stub's other captures — record-only rebind minting a fix task, and staged-top status flipping.

### `delivery-rebuild-continuity` — disjoint by lifecycle side

Private-chain and base-movement-driven; this work unit is public-side and post-landing. Its own draft records the
same split and states that this work unit ships first, because it is the recovery route that makes a stacked
landing safe to attempt at all. Its rows — the eligibility window, the materialization window, delivery authoring,
rematerialization — are not owned here.

**One doctrine reaches this work unit from there.** That work unit also carries the routed ceremony-repetition
rule — _a ceremony repeats only when a covered input changed, and head or base movement is never itself a covered
input_ — under an explicit constraint that it land in a shared rule or strategy that non-delivery ceremonies reach,
not in any delivery-scoped document. The two rows classified `redundant ceremony` above are that rule's absence
seen from this side, so cite it once it lands rather than restating it here. Its capture disowns
refusal-remedy-accuracy work, which is the execute-bound Errand's, and that Errand's sites do not include
`native-landing.ts` — so the guidance defect in § Axis D sits below both and stays here.

### Errands in flight

- **Refusal-remedy accuracy** (`execute-bound`, started in the primary checkout). Determinate diagnostic and argv
  correction across the integration checkpoint, its advisory register, the drift continuation, and teardown. It
  lands first and gives this design a corrected baseline. It must not invent the missing post-landing transition.
  **Consequence for this draft:** every refusal string quoted above is pre-Errand. Design against the decision each
  verb reaches, not against its current prose.
- **Append-only terminal movement in session-init delivery position** (`execute-bound`). The third consumer of the
  substrate above. Reader-level, and downstream of whatever binding relation this design settles.
- **Checkout identity through an authorized integration operation** (`execute-bound`). Adjacent; durable
  authorization and resumable-frame design are reserved to `recovery-hardening`.
- **Two EA-landing Errands** — registered-native route selection, and sequential prepare-to-apply readiness. Same
  files, different failures; coordinate on landing paths.

---

## Retained capture detail

Preserved from the two routed captures, which are otherwise integrated above. Their provenance: both routed from
`USER-INBOX § Work Unit` at the `concurrent-integration-characterization` close-out, 2026-09-14; captured during
`evidence-applicability` M1 post-landing recovery (2026-09-13) and terminal landing dogfooding (2026-09-14).

**Success criterion.** After a real overlapping base change prevents the host's rebase of a successor, the CLI
returns an exact actionable resolution offer; approved successor and top resolutions can settle the retained
operation and continue the delivery. New member heads receive fresh applicability, review, and checks before
landing. Stale decisions, undisclosed divergence, ref collisions, incomplete suffix observations, and ambiguous
host results still refuse without claiming clearance. Cover conflicting and clean suffixes, terminal-top conflict,
and interruption/retry with Git-backed and handler-level tests, including no duplicate merge submission.

**Boundary.** Do not weaken repository-wide contribution proof, relax exact-head host merge protection, weaken
terminal absorption checks, treat a new commit id as a fresh review obligation, accept arbitrary state edits, or
fold in unrelated prepublication authoring and review-fix convergence. A conflict-free virtual merge alone does not
establish evidence carry. Never infer disjointness from it. Preserve fail-closed treatment for unresolved
substantive overlap and stale coordinates. The Owner-directed one-time recoveries that unblocked the live instance
are operational unblocks, not evidence that the durable mechanism is complete and not a general escape contract.

**Design obligations carried forward.** Record the verified predecessor effect once and admit an attended
resolution for the remaining registered suffix and excluded terminal top. Bind the decision to the exact plan,
operation, state revision, observed suffix, member identities, before/after refs and trees, and conflict paths.
Require semantic approval only for the disclosed conflicted contributions; continue mechanical proof for every
other movement. Reobserve host effects and refs, use lease-checked publication and revision-checked state writes,
and make interrupted retries converge without resubmitting a landed member. Carry a current terminal binding
through review readiness and lock release. Include the Candidate producer and its recovery path.

**Files.** Native landing and suffix reconciliation (`native-landing.ts`), delivery execution request/result
schemas, contribution and terminal absorption composition, base overlap/drift analysis,
`git-candidate-applicability.ts`, integration checkpoint composition, exact-base merge continuation, the
`deliver-stack` workflow, and focused unit/integration and delivery terminal integration tests.

**Dropped deliberately in this consolidation.** The origin captures' verbatim observation paragraphs, whose
content is now carried by § The failure family with the probe evidence that supersedes the field narration; and
their per-capture `_Approach:_` framing, whose corrected readings are recorded in § What the field record got
wrong. No success criterion, boundary, or file pointer was dropped.

---

## Pinned probes

Six probes hold this boundary's behaviour as it stands. They **pass today**; each fails the moment the behaviour
changes, printing the sentence that names what it was waiting for and the exact replacement:

> This now produces the result it was waiting for, so the hold is spent: replace this call with a plain
> assertion on `<result>`.

Retiring them is part of this work's scope rather than a regression — a fix here cannot merge while one is red,
and each is a single `expectPinnedObservation` call to replace. They retire independently, one per boundary.

- `review-readiness-delivery-binding.test.ts` — "reports nothing bound when a member's head advanced without
  changing its contribution"
- `delivery-binding-head-movement.test.ts` — "reports a terminal unsettled when the host merged it past the head
  it binds"
- `history-shape-ambiguity.test.ts` — "reports the base's own change as the contribution when two merge bases exist"
- `history-shape-ambiguity.test.ts` — "refuses with a typed reason rather than choosing one of the two bases"
- `history-shape-ambiguity.test.ts` — "reports the overlap unavailable rather than proving it from one of the two
  bases"
- `review-status-base-movement.test.ts` — "directs a checkpoint rerun on a base that moved only in shape"

A seventh row is owned here and **deliberately unpinned**: `delivery-rebuild-base-movement.test.ts` — "returns the
identical refusal after the operator resolves the conflicted path". It proves the named remedy does not clear the
refusal, which no other test asserts, and the refusal itself is correct.

A probe that instead reports "the held result no longer describes what happens, and the awaited one has not
arrived either" has found behaviour neither shape names. That is a finding, not a retirement.

---

## Evidence base

The recorded observations and the reasoning behind each awaited result are in
`notes-concurrent-integration-characterization.md` — § Second matrix for the axis derivation and the
eighteen-failure table each cell traces to, and § Second-matrix probe rows for the readings above. Read those
rather than the first matrix, whose `tolerates` verdicts cover base movement only and are not coverage of this
surface.
