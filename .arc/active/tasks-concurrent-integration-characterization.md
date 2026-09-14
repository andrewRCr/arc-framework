# Task List: concurrent-integration-characterization

- **Design:** `spec-concurrent-integration-characterization.md`

---

## **Phase 1:** Characterization substrate

_Purpose:_ Settle the record contract and the two shared helpers every later probe composes over, and confirm the
cell matrix against each boundary's typed seam before any probe is written. Grouping them is what lets the probe
passes replicate rather than invent: the helper signature, the pin contract, and the cell list are the three things
a probe cannot be written without.

_Mode:_ `layer` — closes on a settled probe substrate: confirmed cell matrix, seeded ledger, and both shared helpers.

_Exit criterion:_ The extended base-advance helper produces all four movement kinds over a caller-supplied path set,
verified through the shipped overlap classifier; the pin helper is red on any third outcome and red once its target
is met; every cell in the matrix is confirmed against its boundary's typed seam and carries either a probe intent or
a not-applicable reason.

### `[x]` **1.1 Confirm each boundary's typed seam and base-read behavior**

- _Goal:_ Every cell in the matrix carries a verdict read from its boundary's own typed seam — probed, or
  not-applicable with the reason — so no probe is written against a base read that does not exist.

    - `[x]` **1.1.a Whole-work-unit verification — `arc attest`**

        - `arc attest` is the verification workflow's only typed verb: its `--new-root` continuation is the same
          verb, `self-review` invokes none, and the member scale step inspects results already recorded. The base
          reaches it only as the `merge-base` argument in `git-candidate-subject.ts`, read `local-only` from
          `refs/remotes/origin/<base>` with a local-branch fallback, so the subject digest is byte-identical under
          any advance. That digest is the only base-derived covered input; the task list, the index, and delivery
          renewal evidence are the others.

    - `[x]` **1.1.b Candidate and private-delivery prepublication**

        - `arc review pre-publication` reads the Candidate through the same `local-only` effective-target seam, and
          `arc publish` reads no base at all. The settle-to-submit window therefore collapses to one probe rather
          than four.

    - `[x]` **1.1.c Public review and checks**

        - The one boundary that fetches. `base-moved` derives from `merge-base --is-ancestor` over the freshly
          fetched base, and that arm sits ahead of every applicability arm, so movement kind never reaches the
          result; a failed fetch yields a null base object id and `blocked / status-unavailable`. Instrument
          settled: drive `createReviewStatusPort` with an injected exec and fail only the base fetch — its catch
          collapses every error into the same shape, so a `gh` failure is otherwise indistinguishable.

    - `[x]` **1.1.d Member and singleton landing**

        - Two base-read windows that discriminate differently. The checkpoint's authoritative drift carries the
          overlap partition into `reconcileSafety`, which gates on an empty substantive set; the merge window reads
          `verdict` alone and emits it unqualified. Cells are placed at the window that can tell them apart, and
          this is the only boundary that keeps all four movement kinds.

    - `[x]` **1.1.e Post-landing closeout**

        - `arc teardown` carries the boundary alone — archival reads no base. Under full protection the
          proof-target fetch refuses by name on failure, while the separate `refreshBase` leg absorbs its own
          failure into the local base, so an unavailable read is observable through one leg only.

    - `[x]` **1.1.f Errand review and merge**

        - Narrower than the coverage table implied: `close`'s base pin sits behind the no-op precondition, so an
          ordinary Errand ahead of its base never reaches it, and a failed pin takes the same fall-through as a
          moved base. `src/lib/errand/merge.ts` merges Errand record trees, not the base; the lane's real base gate
          is prose.

    - `[x]` **1.1.g Record the prose-only gates visible at this base**

        - Four recorded: the pre-hosted-pass advisory read in `integrate-work-unit.md` Step 1, and three in
          `run-errand.md` — the Step 5 freshness loop and the two Step 6 lane gates. Each disposes of a drift
          verdict with no typed verb behind the disposition.

- _Outcome:_ Twenty-four of the forty enumerated cells are applicable; sixteen close not-applicable. Two seam facts
  account for most of the closures: the Candidate seam never fetches, so `unknown` cannot arise there at all, and
  its merge-base coordinate is unmoved by an advance descended from the fork point, so the subject stays
  byte-identical whatever the advance touched. Public review and closeout keep `unknown` because each performs a
  real fetch that refuses distinctly; only landing keeps all four movement kinds, and only because the checkpoint
  carries the overlap partition into its payload. Verdicts and seam evidence are in
  `notes-concurrent-integration-characterization.md` § Cell matrix § Seam verdicts.

### `[x]` **1.2 Seed the characterization ledger with the confirmed cell matrix**

- _Goal:_ An observation has a row waiting the moment it is taken, and a not-applicable verdict is recorded with the
  seam evidence behind it rather than inferred from an absent probe.

    - `[x]` **1.2.a Open one row per applicable cell, carrying boundary, movement kind, and shape**

        - Twenty-four open rows, each carrying its identity, the intent its seam verdict established, and every
          observation field as `—` until a probe fills it from its own run. A row is complete when no `—` remains.

    - `[x]` **1.2.b Close every not-applicable cell as a row carrying its reason**

        - Sixteen closed rows over two closure kinds, which is the wording settled here: **collapse**, where the
          typed result would be identical to a named row already open, and **unproducible**, where the movement
          kind cannot arise at the seam at all. A collapse names the row it defers to, so no closure rests on an
          observation nobody will take. Only the two Candidate-seam `unknown` cells close as unproducible.

    - `[x]` **1.2.c Add the ledger-only rows for observations with nothing to probe**

        - Six: the four prose-only drift gates, the Errand close unchanged-base resolution, and the generalized
          doctrine sentence. The Errand row is scoped as an unproven mechanism rather than an unproven route —
          nothing in the suite references that resolution, and this work unit's Errand cells probe the ordinary
          path, which never reaches it. The public-review composed base read and the spawned-verb closeout route
          are _not_ rows: this work unit's own probes cover both.

    - `[x]` **1.2.d Record the re-run and empty-overlap conventions in the ledger's preamble**

        - Rows are append-only under re-run, each naming the base OID it was observed against. An advance whose
          only intersection is evidence-neutral records as `disjoint (evidence-neutral intersection)` so it is not
          read as a true non-intersection. Counting is fixed at one verb entry per spawned process or port call,
          fixture setup excluded, assertion-only reads excluded, each verb in an anchored sequence counted
          separately; an approval stop is one typed result whose next action requires operator direction, named by
          the eight next-action values that qualify.

- _Outcome:_ Forty rows are open or closed against the enumerated matrix, plus six ledger-only rows. The ledger now
  fails closed in one direction that matters: a not-applicable verdict cannot be inferred from an absent probe,
  because each names either the observation it defers to or the seam fact that makes the movement unproducible.
  The counting conventions are stated as rules the control row obeys too, so excess stays a difference on the same
  fixture rather than a number that depends on who wrote the probe. Owner, fix disposition, and retention
  disposition stay `—` by design; D5 routes them at close.

### `[x]` **1.3 Record the pre-probe test-cost baseline**

- _Goal:_ The measured delta stated at close has a before-value taken on a tree that carries no new test file, so the
  delta is attributable to the probes.

- _Outcome:_ Three tier-isolated baselines at twelve workers — integration, e2e, and the combined local lane —
  captured as **three runs each**, because the retained-run reducer takes a group's median and stamps a lone run as
  `single-run`, and the project's existing cost baseline was established the same way. That choice paid for itself:
  the cold first round put e2e above its recorded budget, a spread a single sample would have baked into the delta
  silently. Medians are 44 784 ms integration, 49 624 ms lane, 205 011 ms e2e. The e2e tier has drifted about eight
  percent above its recorded baseline and now consumes most of its allowance before a probe lands, so the refresh at
  close is compelled rather than optional. Effective shard membership captured at the same base: four legs, each a
  pinned anchor plus a thirteen-file remainder of fifty-two. Run files are parked outside every checkout rather
  than tracked: the gitignored run directory loses them to a clean or to lifecycle worktree churn, while tracking
  them would buy back only part of that and leave permanent packed history for evidence with one consumer. The
  cost is an explicit single-machine assumption, recorded with the axes, medians, and path in
  `notes-concurrent-integration-characterization.md` § Pre-probe cost baseline.

### `[x]` **1.4 Extend the base-advance helper with a path set and the four movement kinds**

- _Goal:_ One helper call arranges a base advance a named movement kind can actually be read from, so every probe
  moves the base the same way and none hand-rolls a fourth idiom.

- _Outcome:_ Two phases, because the analyzer short-circuits unless the branch is both ahead and behind:
  `arrangeBranchSide` commits for real on the caller's branch, and `advanceBase` moves the base through a
  temporary index, `commit-tree`, and a push. The temporary index is load-bearing — building the base commit
  through the real one would publish whatever the caller had staged and leave the checkout dirty, which is how
  the existing advance behaves. `movementPaths` maps each kind to its two path sets, and the tests assert those
  against the shipped classifier with ahead and behind counts read from `rev-list`, never hand-supplied. An
  `observers` list refreshes a separate clone's tracking ref; a sibling worktree needs no entry, which the tests
  establish rather than assume. An unavailable base read is not a movement kind but two exports — a seam wrapper
  for in-process callers and a `PATH` shim for spawned ones — both confirmed to reach the analyzer's typed
  unavailable verdict rather than a thrown error. The argv form returns a sequence entry carrying its own working
  directory, since its loader resolves from the cwd and a fixture repository has no modules of its own. Sixteen
  tests across both lanes, each shown failing first against a reconstruction of the behavior it guards.

### `[x]` **1.5 Add the pinned-observation assertion helper**

- _Goal:_ A probe that fails today reads green only while the observed stop is exactly what it pinned, and turns red
  the moment either that stop changes or the idiomatic target is met.

- _Outcome:_ `expectPinnedObservation` takes the behavior sentence, the result held today, and the result awaited:
  the held one passes, anything else fails, and the awaited one fails asking for a plain assertion in its place. The
  awaited shape is read first, so a result satisfying both retires the hold rather than renewing it — read the other
  way, a landed fix stays invisible for as long as the two shapes overlap. Identity is settled in the shape type:
  discriminants, flags, and path lists, never counts; an object id is refused at the call, being the one run-varying
  value a string field cannot exclude. A behavior sentence citing something that organizes work rather than
  describing it is refused on the same call, since that is the only route by which such a citation reaches the
  runner's output.

## **Phase 2:** Pilot probes across both lanes

_Purpose:_ Retire the composition risk before the matrix is replicated across it. Two things are unresolved until one
probe of each shape runs: whether an e2e probe can drive the extended helper from a spawned CLI over a repository the
integration-lane fixtures build, and whether the pin path survives a real red-green cycle in the suite.

_Mode:_ `slice` — closes on one probe per lane advancing the base inside a boundary and landing its ledger row.

_Exit criterion:_ One e2e probe and one integration probe each advance the base between their boundary's precondition
and its execution through the extended helper, at least one of the pair exercises the pin helper's observed-and-target
path, both ledger rows carry every recorded column, and the suite is green.

### `[x]` **2.1 Probe the whole-work-unit verification boundary from the e2e lane**

- _Goal:_ A spawned-CLI probe advances the base between the verification boundary's precondition and its execution
  through the extended helper, proving the helper reaches the e2e lane at all.

- _Outcome:_ The `disjoint` cell is an ordinary passing test: `attest.e2e.test.ts` attaches a bare origin reached
  through a host-shaped URL, advances the base over a path the branch never touched, and finds the Candidate subject
  and staged set identical to the run with the base held still. Attaching the origin is what makes that mean
  anything — with a remote present the seam resolves its base from `refs/remotes/origin/main`, so the advance moves
  the coordinate it reads. The lane cut the task expected to negotiate did not arise: the advance helper already
  imports nothing the spawned lane should avoid, so the probe calls it directly and the integration-lane
  conveniences stay where they are.

### `[x]` **2.2 Probe the public-review boundary at the handler seam**

- _Goal:_ An integration probe advances the base inside the public-review boundary by driving the injected request
  and observer functions, proving the second lane composes before fifteen further probes assume it.

- _Outcome:_ The probes drive the production status port rather than the injected observer the goal anticipated:
  injecting an observation decides the containment fact instead of reading it, so the base read never runs. The
  port reaches the host through the same injected exec it uses for Git — required checks are the one exception,
  resolving through the process runner — so a stub host on `PATH` covers the whole composition. The shape
  precondition resolved to a work unit on an ordinary branch whose publication reserved no hosted review: the
  routed obligation comes back `settled` with no conjunction, leaving the moved-base arm reachable. The fixture is
  a new file, since the fan-out harness is delivery-plan shaped throughout, and this boundary's remaining cells
  belong there too. The stop is bare and its continuation does not clear; the ledger row in
  `notes-concurrent-integration-characterization.md` carries what the refusal actually rests on.

### `[ ]` **2.3 Confirm the pilot pair's lane composition and ledger rows** — validate exit criterion at segment scope

- _Goal:_ Both lanes are proven to carry a mid-boundary base advance, and the pin helper has been exercised through a
  real red-green cycle in a suite run rather than only in its own unit tests.

- _Note:_ If both pilots pass cleanly the pin path is still unproven — take one further cell at a boundary expected
  to stop rather than closing the segment on an untested arm. That cell counts against its own boundary's phase,
  not this one, so the ledger records it once.

    - Run both lanes and confirm green with any pins in place.
    - Confirm both rows carry every recorded column, including the base OID observed against.

## **Phase 3:** Singleton probes — the pre-publish spine

_Purpose:_ Exhaust the two boundaries reachable before anything is published. One existing fixture already drives
`arc attest` through pre-publication and publish, so the two share a lifecycle even though each starts from its own
repository shape — and neither can move a base until it is given a real origin.

_Mode:_ `replication` through Phase 5 — closes when the enumerated cell surface is exhausted and batch-verified.

_Design decisions:_ A control row asserts its boundary's clean typed outcome; verb invocations and approval stops
are read off the run and recorded, never asserted, so the ceremony baseline stays an observation. A cell an existing
test already exercises still gets a probe — the probe produces the ledger observation that test does not record, and
the retention rule removes it at close while the row keeps what it saw. Where a probe's observed result is a stop,
it takes that result's recommended continuation and records whether the stop cleared: a stop clearable in one
recommended step is friction, while one that cannot be cleared is the freeze this work exists to find.

### `[ ]` **3.1 Probe the whole-work-unit verification boundary**

- _Goal:_ Every applicable cell at the verification boundary carries an observation, and its control row establishes
  the ceremony baseline the movement rows' excess is measured against.

- _Note:_ `e2e/attest.e2e.test.ts` configures no remote at all. Giving it a real bare origin precedes the first
  movement cell; the pilot's probe already sits on this fixture.

    - Cover every movement kind Task 1.1 left applicable that the pilot did not take, plus the control row.
    - Record verb invocations and approval stops per run; excess is that count minus the control row's.

### `[ ]` **3.2 Probe the Candidate and private-delivery prepublication boundary**

- _Goal:_ The settle-to-submit window carries an observation for every applicable movement kind, closing the gap the
  existing spine test leaves by moving only the head against an origin it can never reach.

- _Shape:_ `e2e/publication-spine.e2e.test.ts` already runs attest through pre-publication and publish in one
  fixture, but points origin at a deliberately unreachable URL — and that is load-bearing, not incidental: the
  file documents the unreachable host as the pre-publication state its seven cases are written against. Do not
  swap it out. Attach a live origin through a URL rewrite so the coordinate still parses as owner-and-repository
  while reaching a real target — but **not inside the shared fixture builder**: a rewrite installed there makes the
  ref probe reach a live target and succeed, which is the same state change as swapping the URL and breaks the same
  seven cases. Install it on a per-probe copy after the builder returns, or stand up a second fixture beside it.
  Establishing that is this task's first step and is what makes every later cell here possible.

    - Cover every movement kind Task 1.1 left applicable, plus the control row.

## **Phase 4:** Singleton and delivery-member probes — the post-publish spine

_Purpose:_ Exhaust the two boundaries that exist only after a merge has landed, together with every delivery-member
cell. They group by fixture depth: each needs a landed merge, a committed completed record, and a real origin whose
base then advances, which is the deepest setup in the plan. Each task names its own nearest reference — the
integrate token pair for singleton landing, the multi-clone advance for closeout, the installed-state idiom for the
delivery-member cells — and they share the cost of getting a repository that far rather than one file.

### `[ ]` **4.1 Probe the member and singleton landing boundary**

- _Goal:_ Landing carries an observation for every applicable movement kind, including the window between landing
  readiness and merge that nothing in the suite currently moves the base across.

- _Shape:_ The window is the token pair: `arc integrate checkpoint` mints a handle and `arc integrate merge`
  consumes it by exact value, so the advance lands between the two invocations.

- _Note:_ Minting a real handle is this task's cost, and no existing fixture does it — the e2e references to these
  verbs are outside-project refusals with a synthetic handle. The mint requires the phase's deep fixture plus a
  fake host, because it reads a live change request and resolves a merge method before it will issue. Budget that
  before the cells. Nothing yet establishes how this boundary behaves when the base moves under a minted handle:
  the suite's "moved checkpoint head is refused" evidence belongs to `arc base merge`, a different verb with a
  different handle contract.

    - Cover every movement kind Task 1.1 left applicable, plus the control row, on the singleton shape.

### `[ ]` **4.2 Probe the post-landing closeout boundary**

- _Goal:_ Closeout's overlapping and unknown movement carry observations, extending the single disjoint case that is
  the suite's only post-landing base-movement coverage today.

- _Note:_ `arc teardown` is unreachable until the fixture carries a landed merge and a committed completed record.
  `integration/teardown.test.ts` already builds the disjoint case over a multi-clone topology and is the nearest
  working reference for both the fixture and the advance.

- _Shape:_ These probes spawn the verb. The integration file drives the teardown functions in-process, so it is the
  reference for the **advance idiom** — its multi-clone topology imports nothing from source and reaches either
  lane — and not the host for the probes. Landing them there would put an operator-facing boundary at a library
  seam, where a single in-process call has no verb invocations or approval stops to count and the boundary's excess
  is structurally zero. The e2e teardown file already spawns the verb throughout and lacks only an origin.

    - Cover every movement kind Task 1.1 left applicable, plus the control row.

### `[ ]` **4.3 Probe the delivery-member landing cells**

- _Goal:_ Landing under a published delivery plan carries an observation for every cell Task 1.1.d leaves
  applicable, plus a control row, where the delivery path rather than the singleton path decides admissibility.

- _Note:_ Expect fewer than five. The landing readiness projection states that protected-base movement is
  deliberately absent from it, and the landing path carries the base only as a branch name — so the movement kinds
  may well be indistinguishable here. Reaching any base decision at all also requires installing reviewed member
  state first; the spawned path returns a not-ready refusal before it gets there.

- _Approach:_ Establish delivery state the way the terminal-recovery probes already do — install the parsed state
  record directly alongside synthetic heads pushed to the origin — rather than composing a plan through the
  authoring verbs. That route is proven and keeps each probe inside the per-probe cost ceiling. Build it once and
  let Task 4.4 re-use it.

- _Note:_ The landing verbs are proven at the library seam — a unit file drives prepare and apply through to a
  landed result across roughly twenty cases, and a member-lifecycle integration test drives both arms — but the
  operator-facing spawned path reaches them only through refusals. Task 1.1.d settles what that means for these
  cells; if the gap holds it is a seam gap, and its ledger row should say so rather than claim the mechanism is
  unproven.

### `[ ]` **4.4 Probe the delivery-member prepublication and closeout re-observation cells**

- _Goal:_ The two boundaries where the delivery path only re-observes carry their disjoint rows, so re-observation is
  distinguished in the record from admissibility.

    - Re-use the delivery state Task 4.3 installed; neither cell needs a second plan.

## **Phase 5:** Off-spine lanes — public review, the Errand lifecycle, and read isolation

_Purpose:_ Close the three families that share nothing with the spine. Public review runs at an injected handler
seam in the integration lane, the Errand lane carries its own lifecycle under a persistent shell anchor, and read
isolation is not a boundary at all but a sibling-checkout topology.

_Exit criterion:_ Every enumerated cell across all three shapes holds either a probe in the suite or a ledger row
marked not-applicable with its reason; the full e2e and integration lanes run green with every pin in place, and no
probe uses a skip, todo, or expected-failure marker.

### `[ ]` **5.1 Complete the public-review and checks boundary's movement kinds and control row**

- _Goal:_ Every applicable cell at the public-review boundary carries an observation taken at the handler seam,
  where review clearance binds to an exact head and reviewed path set.

    - Cover every movement kind Task 1.1 left applicable that the pilot did not take, plus the control row.
    - The harness attaches no remote of its own; the pilot's origin setup is the prerequisite here too.
    - Advance a real base through the helper for each and observe it through the instrument Task 1.1.c settled;
      the containment fact is never handed in.
    - Take each kind's own continuation rather than carrying the pilot's result forward. Whether a rerun clears may
      differ by movement kind, and that difference is close to what this boundary is being asked.

### `[ ]` **5.2 Probe the Errand review and merge boundary**

- _Goal:_ The Errand lane's close and review-respond paths carry observations, where today only `open` ever cuts
  from a freshly advanced base.

- _Shape:_ The lane runs under one persistent shell anchor, so each advance rides inside the sequence as an
  interleaved step through the helper's argv form. `e2e/errand.e2e.test.ts` already interleaves a hand-rolled push
  that way; these probes use the helper instead.

- _Note:_ Expect fewer than five cells here. Close pins a remote base head rather than analysing path overlap, so
  the two overlapping kinds may be indistinguishable at this boundary and close as not-applicable with that reason.
  Task 1.1.f settles it; budget against what it records, not against the full row.

    - Cover every movement kind Task 1.1.f left applicable, plus the control row.

### `[ ]` **5.3 Probe the exact-target read isolation family**

- _Goal:_ Three cross-checkout read classes carry observations on the shared-common-dir sibling fixture, where an
  unparseable sibling record, a foreign owner's Candidate record, and an untouched sibling each meet this checkout's
  reads.

- _Approach:_ The unreadable-record case needs no second build. The guard lives in `src/lib/locus/subject-meta.ts`
  and fires on a candidate record this build's schema rejects, so writing a record that carries an enum member this
  build does not accept reproduces it — which is exactly the state three sibling checkouts were in at this work
  unit's first session-init. The guard is only reached when the sibling's own meta demands candidate authority: its
  candidate id must be set and its state must be integrating, or active while preparing the work unit. Without
  that precondition the probe reads green while exercising nothing.

- _Note:_ Two of the three cells already have coverage, both in the other lane: a foreign active owner is refused in
  `e2e/candidate-applicability.e2e.test.ts`, and a sibling is left byte-identical in `e2e/wu-reconcile.e2e.test.ts`.
  Both probes are written for their ledger observation and then removed by the retention rule, with their rows
  naming the covering test. That ratio is deliberate here, not an oversight found at close.

### `[ ]` **5.4 Confirm matrix coverage across all three shapes** — validate exit criterion at segment scope

- _Goal:_ Every enumerated cell resolves to a probe in the suite or a closed not-applicable row, and both lanes run
  green with every pin in place.

    - Walk the matrix against the ledger rather than the reverse; an absent probe with no closed row is the failure
      this walk exists to catch.
    - Confirm no probe uses a skip, todo, or expected-failure marker.

## **Phase 6:** Ledger close-out

_Purpose:_ Turn the observation record into the routed ledger the work unit ships. The order is forced: names resolve
before routing cites them, classification precedes owner resolution, pin retirement precedes retention so the rule
sees which probes are still pinned, and retention precedes the cost refresh, since the refreshed baselines must
reflect only the retained set.

_Mode:_ `replication` — closes when every ledger row is closed out and the retained suite is measured.

_Exit criterion:_ Every ledger row carries every recorded column including continuation, classification, owner, fix
disposition, and retention disposition; every non-passing and ledger-only row resolves to a `backlog/` stub, a
capture targeting an in-flight work unit, or a capture whose fate is Errand; the retained probe set is green and the
refreshed baselines reflect only it.

### `[ ]` **6.1 Resolve every ledger test name against the suite**

- _Goal:_ Every cited test name resolves to a test that exists, closing the one divergence the record cannot detect
  on its own — the tests cite nothing back, so a renamed probe silently orphans its row.

    - Enumerate the suite's test names with the runner's list mode and compare the two sets, rather than reading
      forty rows against the files by hand.

### `[ ]` **6.2 Classify every ledger row and record its recommendation and continuation columns**

- _Goal:_ Each observation carries one classification, a record of whether the typed result arrived with a
  recommendation or as a bare fork, and whether following that recommendation actually cleared the stop.

- _Shape:_ Classification follows the continuation, not the reviewer's read of how justified a refusal looks.
  Fail-closed and correct requires a continuation the probe exercised and that cleared; a refusal the baseline also
  requires but which nothing is proven to clear is a mechanical block however defensible it is.

    - Classify as tolerates, redundant ceremony, mechanical block, or fail-closed and correct.
    - A bare "approve this?" with no composed recommendation is itself a defect; record it per stop.
    - Compute each movement row's excess against its boundary's control row, counting the continuation's own
      invocations; route non-concurrency excess in a control row rather than fixing it.

### `[ ]` **6.3 Route every row that needs an owner**

- _Goal:_ Every non-passing row and every ledger-only row resolves to exactly one owner, and the steering map
  reflects the resulting shape of the stabilization runway.

- _Approach:_ Existing owner first; then an Errand where the fix is one verb arm plus a pin retirement; then a new
  stub only for an unowned, spec-worthy mechanism, consolidated by mechanism rather than by boundary. A ledger-only
  row is neither passing nor failing and still needs an owner: an uncovered completion path and a prose-only gate
  each carry a recorded fix, so each carries an owner too.

- _Approach:_ Urgency outranks conceptual fit. An urgent or blocking row goes to a near-term candidate or an Errand
  even where a later work unit would house it more tidily — a downstream owner that will not land for several work
  units relieves no bottleneck, so it is a fit rather than an owner for that row.

- _Note:_ The minting evidence is untracked — `backlog/` stubs live on the base branch and captures are gitignored —
  so the mint runs at the verification boundary rather than as work on this branch. What lands here is the ledger's
  owner and fix-disposition columns.

    - `[ ]` **6.3.a Resolve each named target against live work-unit state**

        - Rebuild the CLI first. A base merge during this work unit can move source under the built bundle, and
          the staleness guard then refuses every slug resolution — a refusal that reads like a defect and is not
          one.
        - Resolve by slug; never read a dependency edge or a directory listing for lifecycle state.

    - `[ ]` **6.3.b Record owner and fix disposition per row**

        - The generalized doctrine sentence takes a row of its own.
        - A third new stub beyond the four named targets is a signal to consolidate by mechanism; surface it rather
          than deciding it.

    - `[ ]` **6.3.c Screen each consolidated mechanism for forward compatibility**

        - Run it once per mechanism, not once per row — the rows are already grouped by mechanism at this point.
        - Evaluate the project strategies' own firing conditions and read only the ones that fire. Most will not:
          the storage, knowledge, and PM-composition surfaces trigger on what a fix touches, not on this audit.
        - Record what fired as a pointer in the capture, never as a design the owner has not made. Three of those
          surfaces are marked in-development and one provisional, so nothing here becomes an acceptance condition.

    - `[ ]` **6.3.d Re-read the tree for prose-only gates and refresh their ledger-only rows**

    - `[ ]` **6.3.e Mint the routed owners at the verification boundary**

        - The four named stabilization targets become `backlog/` stubs; the remaining rows become captures whose
          fate is either an in-flight work unit or an Errand.

    - `[ ]` **6.3.f Refresh `RELEASE-GATES.md` alongside the mint**

        - Bring the stabilization runway and the Errand runway into agreement with the routed ledger, so the map
          stops naming captures that are now stubs.

### `[ ]` **6.4 Retire every pin whose target has been met**

- _Goal:_ No probe still pins a stop that has since been fixed, so the suite is green with only live pins in place
  and the ledger carries the changed observation rather than a stale one.

- _Context:_ This is the re-run mechanism landing rather than an exception to it. A routed Errand fix may run and
  land off-work-unit during this work unit's lifetime, and every base merge brings sibling work in — so the pin
  helper's designed failure, red once the target is met, is expected to fire here by design.

    - Rebuild the base, re-run both lanes, and take the red-on-target-met messages as the worklist.
    - Convert each such probe to a plain assertion against the now-idiomatic result; the pin's job ends when the
      fix lands.
    - Append the changed observation as its own ledger row against the base it was seen on, rather than editing
      the original row.
    - A probe whose pin is retired then falls under the ordinary retention rule in the next task.

### `[ ]` **6.5 Apply the retention rule and record each probe's disposition**

- _Goal:_ The suite keeps only probes guarding a cell no other test covers, and every deleted probe's row keeps its
  observation and names the test that covers its cell.

    - Control rows are expected to fall wherever the clean path is already tested.
    - Pinned probes are kept until their fix lands — the pin is the handoff contract — then fall under the same rule.

### `[ ]` **6.6 Refresh the test-cost baselines and re-read e2e shard balance**

- _Goal:_ The recorded budgets reflect the retained probe set, and the measured delta is stated in its own commit
  rather than left standing as a CI summary warning.

    - Measure after retention, so the baselines never include probes that were deleted.
    - Compare against the retained-run file Task 1.3 kept, normalizing both runs first. The comparison is driven by
      a request file naming the run groups, which this task authors; it does not take two run paths directly.
    - Refresh all three tier-isolated rows this work moves — integration, e2e, and the combined local lane — each
      against its own baseline and comparison. The per-CI-job rows measure a different thing under different worker
      sizing and can only come from a run of this branch's own pull request, so they are refreshed at the
      verification boundary rather than locally.
    - Land the refresh as a dedicated `perf(test-cost)` commit whose message states the delta.
    - The before-side run files live outside every checkout, at the path recorded in
      `notes-concurrent-integration-characterization.md` § Pre-probe cost baseline. Nothing is removed from the
      tree here; if they are gone, say so and state the delta against the recorded medians rather than reporting
      a comparison that was not run.
    - Re-read the e2e shard balance with the same shard-measurement script. Sharding partitions whole files, so a
      new file lands on exactly one leg; what redistributes is the existing remainder. The Errand probes are the
      exception worth watching — their file is a pinned anchor excluded from the remainder entirely, so all of
      their cost lands on that one leg.

### `[ ]` **6.7 Close the ledger against the matrix** — validate exit criterion at segment scope

- _Goal:_ Every ledger row is closed on all four closing columns, and the retained suite is green against the
  refreshed baselines.

- _Note:_ Two obligations cannot close here, and both land at the verification boundary. Whether the e2e and
  integration lanes ran on the pull request is observable only once a pull request exists — and it asks whether the
  legs **ran**, not whether the workflow went green: the e2e job is skipped when the change is classified
  light-weight, when reconciliation is deferred, and when the lane is not the reviewed one. The same run is the only
  source for the per-CI-job budget rows, so reading its elapsed figures and landing a second budget refresh belongs
  there too. Neither is optional: the criterion forbids leaving a CI budget summary standing.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The complete work unit is validated against its success criteria and the project's gates before
  integration, including the criteria only a pull request can settle and the routed owners only the mint can
  produce.

---

## Success Criteria

- `[ ]` Every enumerated cell across the singleton, delivery-member, and isolation shapes holds either a probe in
  the suite or a ledger row marked not-applicable with its reason
- `[ ]` Every probe that does not pass on the current tree calls the shared pin helper with both its observed and
  target shapes, the suite is green with those pins in place, and no probe uses a skip, todo, or expected-failure
  marker
- `[ ]` The extended base-advance helper accepts a path set and all four movement kinds, and every new probe
  advances the base through it
- `[ ]` Every ledger row carries every recorded column, and every non-passing and ledger-only row's owner resolves
  to a `backlog/` stub, a capture targeting an in-flight work unit, or a capture whose fate is Errand
- `[ ]` Stubs minted beyond the four named stabilization targets number one or two
- `[ ]` Each of the four named stabilization targets exists as a `backlog/` stub at close, the generalized doctrine
  sentence has its own owned row, and `RELEASE-GATES.md` matches the routed ledger
- `[ ]` The test-cost baselines are refreshed in a dedicated `perf(test-cost)` commit whose message states the
  measured delta, and no CI test-budget summary is left standing
- `[ ]` Every probe retained at close guards a cell or isolation case no other test covers, every deleted probe's
  ledger row records its observation and the covering test, and the measured tier cost reflects only the retained set
- `[ ]` The e2e and integration lanes ran on the pull request, not only locally
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
