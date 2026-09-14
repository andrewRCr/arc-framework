# Draft: Concurrent Integration Characterization

- **Origin:** [internal] — the anti-freeze characterization chartered in the personal release-gates steering map
  after `evidence-applicability` exposed that concurrent sessions were still pausing for each other's integration.
- **Purpose:** Establish, in one pass, where independent ARC checkouts can carry verified work through publication
  while `main` advances, without a protected-base freeze or redundant ceremony — and leave behind an armed fixture
  net so that every remaining stop is owned by exactly one fix and every future regression at a covered boundary
  surfaces as a failing test rather than a mid-integration detour.

---

## Readiness

- **State:** formalization-ready — one adversarial pass run and its findings folded; scope, mechanism, routing
  posture, and the substrate particulars are settled against source.
- **Resolved:** the fixture mechanism (§ Decisions D1), the tree under test (D2), the probe selection rule (D3), the
  record contract (D4), the routing posture (D5), the shared helper (D6), the fix-shape principles (D7), the
  verification and public-review seams
  (§ Unknowns and Assumptions), and the boundary-fit and `Class` reads (§ Boundary and Class).
- **Open:** none design-level; the two assumptions in § Unknowns and Assumptions are validated by the first probes.
- **Next:** readiness read, then cross into create-spec.

## Problem / Motivation

Concurrent work is viable only if another checkout's ordinary progress never forces an unrelated session to halt or
repeat verification, preparation, review, or integration. The industry baseline makes that concrete: the host runs
CI on its test-merge ref, "require branches to be up to date" is off, review binds to an exact head, and a team
member neither knows nor cares what a colleague merged an hour ago. `evidence-applicability` adopted the same
doctrine — evidence follows covered content, never head movement as such — and wired it at the checkpoint, review
status, delivery eligibility, and Errand merge.

Two things remain. First, the post-execution lifecycle has never been characterized as a whole against a moving
base: each gap so far was found by dogfood, in the middle of an integration, and patched piecemeal. Second, the
post-execution tail — verification, review, integration, delivery — now costs far more attention per concern than
planning or execution, and concurrency stops are the largest single contributor. The remaining stops need concrete
reproductions, a classification against the idiomatic baseline, and an owner each, before the delivery-stabilization
work is sequenced around them.

## Decisions

### D1. Probes name the idiomatic behavior and pin the observed stop until a fix lands

Each probe is an e2e or integration test (lane per boundary in D3) that names what a moving base **should** do at
its boundary under the industry baseline above; where ARC doctrine already states the same, the assertion is that
doctrine made executable. A probe that passes today is an ordinary test. A probe that fails today calls one small
shared helper with two shapes: the **observed** typed result, which it pins, and the **target** idiomatic result,
which it names. The helper is red on any third outcome, so a decayed probe (timeout, helper regression, a boundary
that moved out from under it) never reads green; and it is red with a "retire this pin" message the moment the
target is met, so the fix's own CI run tells the fixer to replace the call with a plain assertion. No fixer has to
remember this work unit exists, and a later regression at a covered boundary fails normally.

Vitest's `test.fails` was the first candidate and is rejected on its runner semantics: it converts **every**
non-pass state to pass, so a marked probe cannot distinguish "fails at the target" from "fails for any reason" and
the net is not armed against decay. `todo` / skipped cases plus a prose ledger arm nothing; a probe runner outside
CI that emits a ledger is new machinery with nothing enforced at the fix.

Tests carry behavior-only names and messages, per the no-meta-references rule; the ledger cites test names, never the
reverse.

### D2. The tree under test is this branch's build; base merges are re-runs

Implementation-complete but unshipped work is provisional evidence, never `main`'s current behavior.
`evidence-applicability` has one delivery member merged and two open, and its success criteria already claim disjoint
tolerance at four boundaries. Probes run against this branch's build, so they read `main` as of the last base merge.
Each base merge after a sibling lands is a re-run by construction; the ledger records which base each observation was
taken against. No second tree, no provisional composition of unmerged branches.

### D3. Probe selection: one case per boundary × movement kind, at boundaries that read the base at all

**Boundaries** (the charter's six): whole-work-unit verification; Candidate and private-delivery prepublication;
public review and checks; member or singleton landing; post-landing closeout; the Errand review/merge path.

**Movement kinds:** `disjoint`; `overlapping-substantive`; `overlapping-regenerable-only` (the tracked readiness
projection is the one path two sibling ceremonies both touch, and the shipped classifier already treats it apart);
`unknown` (remote evidence unavailable). `unknown` is probed as evidence that **goes** unavailable at the boundary,
not only as a static precondition — the existing suite covers the latter alone.

**Shapes:** singleton work unit by default; a delivery-member row wherever the shipped path differs (prepublication,
landing, closeout); the Errand shape as its own boundary row.

**Control row:** each boundary also gets a no-movement probe. It is the baseline the movement rows are read against:
a movement row's **excess** is its verb invocations and approval stops minus the control row's, and the idiomatic
excess is zero. The control row's own count is recorded as the ceremony baseline; non-concurrency excess in it is
routed, not fixed here.

**Covered input per ceremony** — what must change before a repeat is justified (D7 reads from this): quality gates,
the tree they ran over (so a base merge that changes the tree warrants a re-run, as the project rules already say,
and a disjoint advance that never merges does not); attestation and verification currentness, the work unit's own
subject digest; review clearance, the exact reviewed head and the reviewed path set; checkpoint, the Candidate head
and the observed base relation; approval, the exact head it was given on. A ceremony that repeats when none of its
covered input changed is `redundant ceremony`, whatever the workflow prose says.

**Lane per boundary.** Boundaries driven through spawned CLI verbs (verification and attestation, prepublication,
landing, closeout, Errand) are e2e probes. The public-review boundary is an integration probe: hosted request and
await are provider-bound, and the existing tests run them without a provider by injecting the request and observer
functions at the handler seam, which a spawned CLI cannot do. Both lanes run on pull requests.

**Exact-target read isolation** is one additional probe family, not a boundary: a sibling checkout whose build cannot
parse this checkout's records, a foreign owner's Candidate record in the shared namespace, and a sibling left
byte-identical after this checkout's reconcile. The first two are live field classes (three sibling checkouts'
Candidate records were unreadable under this build's schema at this work unit's first session-init).

Cells the boundary never reads the base in are recorded as not-applicable, not probed. An exhaustive state
cross-product is out.

**Starting points.** The suite already carries the idioms and the nearest extendable tests:

| Boundary                   | Current coverage                                         | Nearest extendable test                                |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Whole-WU verification      | none: no probe moves the base between start and finalize | `integration/prepublication-workflow.test.ts`          |
| Candidate / prepublication | applicability covered; settle-to-submit window unmoved   | `e2e/publication-spine.e2e.test.ts`                    |
| Public review and checks   | none: caller branch moves under a pinned target only     | `integration/frontline-target-materialization.test.ts` |
| Member / singleton landing | unavailable-base and post-landing advance only           | `e2e/delivery-terminal-recovery.e2e.test.ts`           |
| Post-landing closeout      | one disjoint case; no overlapping, no unknown            | `integration/teardown.test.ts`                         |
| Errand review / merge      | movement at open only; close and respond never see one   | `e2e/errand.e2e.test.ts`                               |

### D4. The record contract: one ledger row per probe, in the notes companion

`notes-concurrent-integration-characterization.md` § Characterization ledger, following the measurement-ledger
precedent in `local-ci-capacity-qualification`. Per row: boundary, movement kind, shape, test name, base OID observed
against, observed typed result (reason and remedy as the CLI returned them), whether that result carried a
recommendation or was a bare fork (D7), classification, owner, and the fix's disposition at close. Classification is
one of:

- **tolerates** — the boundary proceeds with no added ceremony; the probe passes.
- **redundant ceremony** — the boundary proceeds but repeats verification, judgment, checkpoint, or approval that
  covered content does not justify.
- **mechanical block** — a typed refusal or a dead end with no continuation.
- **fail-closed, correct** — a refusal that the idiomatic baseline also requires (a real conflict, missing evidence).

Prose-only gates — a workflow step that reads `arc base drift` and loops on `reconcile` with no typed verb behind
it — cannot be exercised by a probe. They land in the ledger as ledger-only rows with an owner, and the recorded fix
is relocation into a typed verb.

### D5. Routing posture: fixes ship in their own homes, and the stub count stays small

This work unit ships no fixes. Every non-passing row is routed at planning close, in this order:

1. **Existing owner first.** Four delivery-stabilization targets are already named in the steering map (one a
   planned stub, three inbox captures awaiting drain), alongside the review-side owners; `evidence-applicability`'s
   success criteria cover much of the disjoint path, so many probes are acceptance checks of claimed behavior rather
   than discovery.
2. **Errand** when the fix is one verb arm plus a pin retirement. Errands run off-work-unit and may land during this
   work unit's lifetime.
3. **A new stub** only for an unowned, spec-worthy mechanism, consolidated by mechanism rather than by boundary. The
   realistic count beyond the four named targets is one or two.

**What counts as owned at close.** A capture surface is a buffer, never an owner, so a ledger row is owned only when
it resolves to a `backlog/` stub, an inbox capture whose `WU_Target` is a work unit already in flight (the sanctioned
route into a sibling's planning, since its tracked artifacts are not writable from here), or a queued Errand capture.
Captures that name one of the four stabilization targets drain into their stubs at planning close.

Work units are being minted faster than they complete; this posture is the counterweight, recorded here so the spec
inherits it rather than re-deciding it per finding.

### D6. One shared base-advancement helper, extended from the one that exists

The in-flight-reshuffle test helper already advances `origin/<branch>` independently of the work-unit branch — a
temporary branch from the remote tip, one marker-file commit, a push, a tracking refresh — but it takes no path set
and no movement kind, so it can only produce disjoint movement on a fixed marker path. Beside it the suite hand-rolls
three more idioms (a publisher clone that commits and pushes; a forged remote-tracking ref with the local base pinned
back; a `commit-tree` push). The first deliverable extends that helper with the paths to touch and the movement kind
(`disjoint`, `overlapping-substantive`, `overlapping-regenerable-only`, `unknown`), composing the multi-clone and
worktree-sibling helpers for the second-checkout cases. New probes use it; migrating the three hand-rolled idioms is
optional cleanup, not scope.

### D7. Fix-shape principles the routed fixes inherit

A ceremony repeats only when a covered input changed; head or base movement is never itself a covered input, and
"redundant ceremony" in the ledger means exactly a repeat over unchanged covered inputs. This generalizes the
review-admission sentence that `evidence-applicability` landed to every ceremony in the post-execution tail —
verification, judgment, checkpoint, quality gates, approval, delivery chain, Errand chunking — and is consistent
with the one exactness merge authority mechanically needs, since disjoint base movement does not change the exact
head that authority binds to. The doctrine home for the generalized sentence is one ledger row of its own.

Every stop carries a recommendation: the verb composes it where the facts are deterministic (the session-init
envelope's recommended action and prompt text are the existing pattern), and the agent supplies it where a residual
is genuinely open. A bare "approve X?" is a defect the ledger records per stop, beside the typed result. The
rules-level half — extending "recommend on advisory forks" to approval gates — is captured for its owner to resolve
at drain, not changed here.

Fixes routed from this ledger satisfy both. A fix that adds exactness beyond what merge authority mechanically
requires is a scope expansion, named as such in its capture.

## Boundary and Class

`Class: Heavy` — derivation fires (the probe matrix, record contract, and routing posture had to be authored before
an engineer could start), scale does not dominate, and nothing is invented: the mechanism composes the e2e harness,
Vitest, and the ledger precedent. Boundary fit: **stays one WU** — the helper, probes, ledger, and routing are one
concern; the fixes are routed out by D5. Evidence basis: one review surface (a test suite plus a companion note), no
independently deliverable member.

## Alternatives

- **Exhaustive state cross-product** — obscures the ordinary concurrency path and makes the characterization larger
  than the fixes it routes. Rejected; D3 bounds the matrix.
- **Live-provider harness** — adds external variability before the local boundary is understood; the host is a
  recorded non-goal of the same doctrine. Rejected; provider-neutral seams are probed with the existing test doubles.
- **Merge queue** — not the remedy for ARC-only re-ceremony under base movement; a recorded non-goal in three places.
- **Fix in place** — folding fixes into this work unit re-creates the piecemeal-patch pattern the charter names.
  Rejected; D5.
- **Characterize by reading code** — a source audit finds what the code says, not what the lifecycle does across
  checkouts. Rejected as the primary method; the survey that produced D3's table is its bounded use.

## Unknowns and Assumptions

- **Resolved — the verification boundary's typed seam is `arc attest`.** Whole-WU verification is a workflow whose
  only typed verb is the attestation; its probe advances the base between the Tier 3 gates and `arc attest`, and its
  prepublication sibling advances it between attestation and `arc review pre-publication`. The attestation binds the
  work unit's own subject digest and is expected to read `tolerates`; the probe makes that claim checkable.
- **Resolved — the public-review boundary is probed at the handler seam.** Hosted request and await are
  provider-bound; the existing integration tests run them without a provider by injecting the request and observer
  functions, and review status derives `base-moved` from the injected observation's containment fact. Review probes
  are integration tests using that injection; no new double is owed, and no local host adapter exists to spawn.
- **Assumption:** both the e2e and integration lanes run on pull requests for any code-bearing change, so a fix work
  unit's own required checks catch the pin retirement. Locally, the routine test lane excludes e2e, so a fixer sees
  it in CI, not at the task gate.
- **Assumption:** the four boundaries `evidence-applicability` claims will read `tolerates` on its landed members and
  `redundant ceremony` or `mechanical block` on the unmerged ones; D2's re-run rule resolves the difference.

## Scope boundary (Won't Do)

This work unit characterizes and routes; it does not implement the downstream fixes, build a merge queue, rewrite
storage generically, or turn recovery convenience into a near-term work-unit dependency. It does not make a
live-provider integration harness the acceptance test, does not audit non-concurrency ceremony beyond recording the
control-row baseline, and does not migrate existing tests onto the new helper.

**Success signal:** every boundary × movement cell, every control row, and every exact-target isolation case has a
probe or a recorded not-applicable; every non-passing probe pins its observed stop, names its target, and has a
ledger row with one owner; the extended base-advancement helper exists and every new probe uses it; at close, every
owner in the ledger resolves to a `backlog/` stub, a capture targeting an in-flight work unit, or a queued Errand;
the suite is green with the pins in place; and stubs minted beyond the four named stabilization targets number one
or two.

**Dependencies:** none recorded. `evidence-applicability`'s remaining members landing during this work unit change
observations, not the plan — D2 absorbs them as re-runs.
