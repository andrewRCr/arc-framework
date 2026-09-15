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

### `[x]` **2.3 Confirm the pilot pair's lane composition and ledger rows** — validate exit criterion at segment scope

- _Goal:_ Both lanes are proven to carry a mid-boundary base advance, and the pin helper has been exercised through a
  real red-green cycle in a suite run rather than only in its own unit tests.

- _Outcome:_ The segment's exit criterion holds on all four clauses. Both pilots advance the base between their
  boundary's precondition and its execution through the shared helper, one per lane. The public-review pilot is
  itself a pinned stop, so the contingency of taking a further cell to prove the pin path did not fire — removing
  its advance turns the helper red with its retirement message, which is the red-green cycle in a suite run rather
  than in the helper's own tests. Both rows carry every column recorded at probe time; owner, fix disposition, and
  retention disposition stay open under the convention that resolves them at close.

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

### `[x]` **3.1 Probe the whole-work-unit verification boundary**

- _Goal:_ Every applicable cell at the verification boundary carries an observation, and its control row establishes
  the ceremony baseline the movement rows' excess is measured against.

- _Outcome:_ The boundary's cell surface is exhausted: the control row and the `disjoint` row both observed, the
  other three closed not-applicable on the seam read. The control runs on the movement row's own fixture, base held
  still, so the two counts are comparable — both are one invocation and no stops, putting the advance's excess at
  the idiomatic zero. The baseline itself carries no non-concurrency excess to route. Nothing here classifies as a
  response to movement, because the boundary has none: the merge-base coordinate absorbs the advance before any
  result is computed.

### `[x]` **3.2 Probe the Candidate and private-delivery prepublication boundary**

- _Goal:_ The settle-to-submit window carries an observation for every applicable movement kind, closing the gap the
  existing spine test leaves by moving only the head against an origin it can never reach.

- _Outcome:_ The live base is attached per probe, after the shared builder returns: a rewrite maps the unreachable
  origin URL onto a local bare repository, so the coordinate every existing case is written against is unchanged
  and all seven stay green. Both applicable cells observed across the settle-to-submit window, control and
  `disjoint`, at three invocations and no stops each — excess zero. The tolerance is one source line deep, and the
  reconstruction shows what it holds back: derive the Candidate subject from the base tip instead of the fork point
  and the same advance turns the submit into `rejected`, "the Candidate lineage is not current", carrying a
  re-attest remedy.

## **Phase 4:** Singleton and delivery-member probes — the post-publish spine

_Purpose:_ Exhaust the two boundaries that exist only after a merge has landed, together with every delivery-member
cell. They group by fixture depth: each needs a landed merge, a committed completed record, and a real origin whose
base then advances, which is the deepest setup in the plan. Each task names its own nearest reference — the
integrate token pair for singleton landing, the multi-clone advance for closeout, the installed-state idiom for the
delivery-member cells — and they share the cost of getting a repository that far rather than one file.

### `[x]` **4.1 Probe the member and singleton landing boundary**

- _Goal:_ Landing carries an observation for every applicable movement kind, including the window between landing
  readiness and merge that nothing in the suite currently moves the base across.

- _Outcome:_ The mint was the cost the task predicted, and it is paid: a work unit published to a live origin
  with a stub host answering the reads landing makes, standing at its boundary with a real handle. Manual archive
  cadence keeps the archive move out of the preconditions, which is orthogonal to the base — that gate sits behind
  the base gate either way. All five cells observed. The merge window, which nothing in the suite moved a base
  across before, invalidates on the verdict alone and its continuation does not return a handle: the same
  invocation that minted one now reads a moved base and asks for a reconcile, so any movement during a landing
  costs a reconcile, a fresh checkpoint, and a fresh approval — whatever the advance touched. The checkpoint
  window does discriminate all three of its kinds. Two findings sit in the signalling rather than the decisions:
  the one safe result is the only one carrying no remedy, and the substantive refusal's prose asks for a base
  merge its own argv does not perform. The rows are in
  `notes-concurrent-integration-characterization.md`.

### `[x]` **4.2 Probe the post-landing closeout boundary**

- _Goal:_ Closeout's overlapping and unknown movement carry observations, extending the single disjoint case that is
  the suite's only post-landing base-movement coverage today.

- _Outcome:_ The boundary exists only under full branch protection — the shipped default resolves the proof target
  from the local base and never fetches — so the probes carry their own fixture, a merge and an archival both landed
  on a live base, rather than changing what the existing e2e file's cases observe. All three applicable cells are
  covered and the two overlapping ones stay closed: the gate reads this work unit's membership in the fetched tree
  and its branch's containment in it, never what the advance touched. The advance is absorbed whole at excess zero;
  a severed read refuses on the proof-target leg, ahead of the best-effort refresh that would have swallowed it, and
  clears on a plain retry the refusal never names. The rows are in
  `notes-concurrent-integration-characterization.md`.

### `[x]` **4.3 Probe the delivery-member landing cells**

- _Goal:_ Landing under a published delivery plan carries an observation for every cell Task 1.1.d leaves
  applicable, plus a control row, where the delivery path rather than the singleton path decides admissibility.

- _Outcome:_ Four cells, all observed on the spawned path — the predicted not-ready refusal turned out to be a
  fixture gap rather than a seam gap, and closing it is the task's real cost: the plan's non-terminal member has
  to be genuinely landed, so the fixture builds and merges a predecessor before the work unit's branch exists,
  which also keeps the Candidate clear of the base move. The probes extend the singleton landing file, since the
  boundary is the same verb with one more precondition. The shape narrows a refusal and never a tolerance: the
  substantive cell, which the singleton path refuses, comes back safe with the shared path named, while the
  disjoint and regenerable cells run the delivery arm and reach the singleton's own result. The register that
  rides with the admitted result still asks for the base merge the decision just waived. Rows are in
  `notes-concurrent-integration-characterization.md`.

### `[~]` **4.4 Probe the delivery-member prepublication and closeout re-observation cells**

- _Goal:_ The two boundaries where the delivery path only re-observes carry their disjoint rows, so re-observation is
  distinguished in the record from admissibility.

- _Outcome:_ No probe: both cells closed not-applicable at the seam confirmation, because neither delivery arm
  performs a base read of its own, and the record already distinguishes re-observation from admissibility through
  their closure rows. Each names the singleton row it collapses onto, and both of those are now observed, so the
  closures rest on observations actually taken rather than on predictions.

## **Phase 5:** Off-spine lanes — public review, the Errand lifecycle, and read isolation

_Purpose:_ Close the three families that share nothing with the spine. Public review runs at an injected handler
seam in the integration lane, the Errand lane carries its own lifecycle under a persistent shell anchor, and read
isolation is not a boundary at all but a sibling-checkout topology.

_Exit criterion:_ Every enumerated cell across all three shapes holds either a probe in the suite or a ledger row
marked not-applicable with its reason; the full e2e and integration lanes run green with every pin in place, and no
probe uses a skip, todo, or expected-failure marker.

### `[x]` **5.1 Complete the public-review and checks boundary's movement kinds and control row**

- _Goal:_ Every applicable cell at the public-review boundary carries an observation taken at the handler seam,
  where review clearance binds to an exact head and reviewed path set.

- _Outcome:_ One cell remained after the pilot, and taking its own continuation was the point: where the moved-base
  stop does not clear, the unavailable-read stop clears on the re-run its remedy names, so the two failures the
  boundary reports are not the same kind of stop at all. The failure is injected at the port's execution seam
  rather than the process boundary, because the observer collapses every error into one shape and only that seam
  can fail a single read. The attribution then rests on arm order alone: the same fetch failure also blocks the
  routed obligation with the raw transport error, and that arm would report the identical reason one step later.
  The control row is filled from the pilot's measurement baseline at zero stops. Rows are in
  `notes-concurrent-integration-characterization.md`.

### `[x]` **5.2 Probe the Errand review and merge boundary**

- _Goal:_ The Errand lane's close and review-respond paths carry observations, where today only `open` ever cuts
  from a freshly advanced base.

- _Outcome:_ Two cells, control and `disjoint`, both closing at zero stops with the advance interleaved inside the
  anchored sequence through the helper's argv form. The tolerance is structural rather than decided: the base pin
  sits behind a no-op shortcut an Errand carrying a commit never enters, so the close reads no base at all and the
  boundary's other three kinds stay closed for the same reason. Preservation rests entirely on merged host truth —
  the Errand head is ahead of the local base at close and is retired anyway — and pinning the base unconditionally
  turns the movement row red while the control stays green, so the tolerance is one predicate from being a stop.
  Rows are in `notes-concurrent-integration-characterization.md`.

### `[x]` **5.3 Probe the exact-target read isolation family**

- _Goal:_ Three cross-checkout read classes carry observations on the shared-common-dir sibling fixture, where an
  unparseable sibling record, a foreign owner's Candidate record, and an untouched sibling each meet this checkout's
  reads.

- _Outcome:_ All three observed through the production locus probe driven from the primary, plus the reconcile
  handler for the write direction. The isolation is real and asymmetric: a record this build cannot parse leaves
  the sibling row unresolved with a named diagnostic while this checkout's own frame stays selected and its
  primary free — the owning checkout is the one that cannot enter a session. The two refusals are not the same
  reading: ownership settles before the record is opened, so a foreign work unit never reaches the Candidate guard
  and its subject is never projected, which means a foreign owner's unreadable record reports as foreign rather
  than unreadable. The guard itself is one precondition deep, and the probe establishes that precondition
  positively rather than assuming it. Rows are in `notes-concurrent-integration-characterization.md`.

### `[x]` **5.4 Confirm matrix coverage across all three shapes** — validate exit criterion at segment scope

- _Goal:_ Every enumerated cell resolves to a probe in the suite or a closed not-applicable row, and both lanes run
  green with every pin in place.

- _Outcome:_ The segment's exit criterion holds on all four clauses. Walked from the matrix rather than the ledger,
  all forty enumerated cells resolve — twenty-four to a probe row whose named test resolves in the suite, sixteen to
  a closed row — with nothing uncovered, nothing double-booked, and no row claiming a cell the matrix does not
  enumerate. Each of the fourteen collapses names an open row that will actually be observed, and the two
  unproducible closures rest on the seam fact rather than a deferral. No probe carries a skip, todo, or
  expected-failure marker, and both lanes are green with the suite's one live pin in place.

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

_Amended 2026-09-14 — Tasks 6.5 through 6.7 execute after Phase 7 rather than in file order. Retention decides
which probes survive and the refreshed baselines must reflect only the retained set, so both would be redone once
the second matrix lands, and the baseline is the measurement that is hardest to redo. Tasks 6.1 through 6.4 are
unaffected and run in place._

### `[x]` **6.1 Resolve every ledger test name against the suite**

- _Goal:_ Every cited test name resolves to a test that exists, closing the one divergence the record cannot detect
  on its own — the tests cite nothing back, so a renamed probe silently orphans its row.

- _Outcome:_ Compared against the runner's collected set rather than the files. Every cited name resolves, and now
  to exactly one test: a leaf title alone does not address one, and two rows had cited the same sentence while
  meaning different tests — the singleton checkpoint's and the bound delivery plan's — so both now carry their
  describe path, under a convention requiring one. The public-review continuation lives in a test of its own that
  no row named; it is now cited the same way rather than left resting on prose. Accounting closes both ways: of
  fifty-one tests added, twenty-five are cited and twenty-six are the helpers' own.

- _Amended 2026-09-15 — the result did not survive the work unit._ The goal named the mechanism exactly: the
  tests cite nothing back, so a renamed probe silently orphans its row. Ninety-three minutes after this closed,
  `45d0d9060` renamed four cited probes while re-observing the landing boundary, and `de7eb2eca` renamed two more
  in the review-fix increment. Six citations resolved to nothing and nothing re-ran the check across three later
  close-out passes. The old-to-new mapping is recorded in `notes-concurrent-integration-characterization.md`
  § Record audit at close; a mechanical check binding citations to collected test names is captured rather than
  built, this work unit shipping no production surface.

### `[x]` **6.2 Classify every ledger row and record its recommendation and continuation columns**

- _Goal:_ Each observation carries one classification, a record of whether the typed result arrived with a
  recommendation or as a bare fork, and whether following that recommendation actually cleared the stop.

- _Outcome:_ Classification, fork, and continuation were already per-row at probe time; what closed here is the
  cross-row computation, in `notes-concurrent-integration-characterization.md` § Excess and bare stops. Every
  classification follows its continuation, and no row is `redundant ceremony` — nothing in the post-execution tail
  re-ran a ceremony on base movement alone. Excess sits beside a column recording whether the row landed, since a
  raw difference reads low for the wrong reason: eight of fourteen movement rows never did. Six stops are bare,
  four of them the same `reconcile-base` — the safe results are the bare ones while every refusal carries a remedy.

### `[x]` **6.3 Route every row that needs an owner**

- _Goal:_ Every non-passing row and every ledger-only row resolves to exactly one owner, and the steering map
  reflects the resulting shape of the stabilization runway.

    - `[x]` **6.3.a Resolve each named target against live work-unit state**

        - Three of the four resolve `nonexistent` — they are capture targets, not stubs; only correction
          convergence is planned. Slug resolution reads the invoking checkout's tree, so it also reported a work
          unit that shipped after this branch was cut as nonexistent, which `origin/main` settled.

    - `[x]` **6.3.b Record owner and fix disposition per row**

        - Twenty-four open rows and seven ledger-only rows carry an owner and a fix; fifteen resolve to none,
          the boundary's response needing no change. Two owners stay open and are surfaced rather than decided:
          no surface yet owns the ceremony-repetition doctrine, and the approval-gate capture's own target is
          still undecided, so neither is owned by the criterion's definition.

        - _Amended 2026-09-15 — fifteen is nineteen._ Both denominators are right; the count of rows resolving to
          none is not. Sixteen open rows carry `_Fix at close:_ none` and three ledger-only rows carry
          `_Fix:_ none`, at the commit that wrote this sentence as well as now. Sixteen is what a filter keyed on
          `_Fix at close:_` alone returns, so the ledger-only rows' different column name does not explain
          fifteen either. Nothing about the owner routing or the two held-open owners changes.

    - `[x]` **6.3.c Screen each consolidated mechanism for forward compatibility**

        - Seven mechanisms screened against the strategies' own firing conditions: the procedure surface fires on
          three, storage on two, knowledge on two, and PM composition on none. One result reaches backwards —
          that surface's target model puts judgment in minimal prose, which is where the judgment-bearing drift
          gates already sit, so their no-fix disposition is the model's answer and not only this work unit's.

    - `[x]` **6.3.d Re-read the tree for prose-only gates and refresh their ledger-only rows**

        - Five gates, not four: the Errand lane carries its own copy of the pre-hosted-pass advisory at Step 4,
          which the first pass recorded only at the integration boundary. They split two ways — two dispatch a
          typed verdict and nothing more, three turn on a judgment a verb would have to define first — and only
          the first pair takes a fix.

    - `[x]` **6.3.e Mint the routed owners at the verification boundary**

        - Two stubs carry the four named targets: `delivery-post-landing-conflict-recovery`, and
          `delivery-rebuild-continuity`, which consolidates the authoring and prepublication-evidence targets into
          the one mechanism they share. `delivery-correction-convergence` already existed and is untouched — its
          own failure fires with the base unmoved, so it is a convergence concern rather than a movement one. Each
          draft carries the problem space, the characterization's own evidence, recommendations marked as
          recommendations, and the span caveat, and absorbs its routed captures in full — six moved out of the
          personal inbox and removed from it, so each draft is the single authoritative source for its concern.
          Three Errand captures cover the routed rows and the approval-gate capture gained the six bare stops as
          field evidence. Two criteria need a disposition at verification rather than here: two of the four target
          slugs do not exist by name, and stubs minted beyond the four number zero rather than one or two.

    - `[x]` **6.3.f Refresh `RELEASE-GATES.md` alongside the mint**

        - The stabilization runway is three work units rather than four and all three are stubs, so the map no
          longer names captures as targets. The integration runway records that the blocking work unit shipped and
          why its closeout is still open; a resumption order records that only two things are actually gated on the
          runway, so the rest resumes in parallel rather than waiting; and the Errand runway leads with the live
          blocker and carries the three routed out of the ledger.

- _Outcome:_ The routing's own finding outweighed the routing. No ledger row resolves to either stabilization
  target: the post-execution tail largely tolerates base movement, and what remains is signalling defects plus one
  doctrine gap. Following that through, the matrix re-finds none of the failures already recorded — they move a
  bound record's head, the shape of the history, or a ceremony's own writes rather than the base — which is what
  prompted widening the span here rather than sending each routed owner hunting. The runway came out at three work
  units instead of four, two owners stay open by design, and the mint ran on this branch under a forward amendment.

### `[x]` **6.4 Retire every pin whose target has been met**

- _Goal:_ No probe still pins a stop that has since been fixed, so the suite is green with only live pins in place
  and the ledger carries the changed observation rather than a stale one.

- _Outcome:_ The base merge brought 139 commits, and the suite's one pin fired on its own terms, naming the plain
  assertion that replaced it: public review no longer stops on a disjoint advance. Both `mechanical block` rows are
  resolved — the landing window now merges across that same advance and the member path reaches approval — and the
  regenerable case gained a typed arm with a reason where it had been one of the six bare stops. Eight rows are
  appended against the new base rather than edited. What made any of it readable was a fixture repair: the
  checkpoint now demands host evidence the stubs never supplied, and both control rows failing first is what
  separated a stale fixture from a changed boundary.

### `[x]` **6.5 Apply the retention rule and record each probe's disposition**

- _Goal:_ The suite keeps only probes guarding a cell no other test covers, and every deleted probe's row keeps its
  observation and names the test that covers its cell.

    - Control rows are expected to fall wherever the clean path is already tested.
    - Pinned probes are kept until their fix lands — the pin is the handoff contract — then fall under the same rule.

- _Outcome:_ Seven tests deleted, thirty-four kept, and all forty-four rows carry a disposition with every deleted
  row keeping its observation and naming what covers its cell. Every deletion is a control, which is what D9
  predicted, but the reason four of them fell was not: a boundary's `disjoint` row asserts the identical successful
  result over the same fixture, so the movement row is a strict superset of the control it was measured against and
  keeping both counted the clean path twice. Two fell to tests predating this work unit and one was covered on both
  sides. One control survives and is the finding worth keeping — post-landing closeout's head-held case is the only
  assertion anywhere that a terminal merged at the exact head it binds closes out, since its own movement row
  retires the terminal instead, so deleting it would have removed coverage rather than duplication; it is also the
  control that failed first on its own fixture, which is what made that movement readable. Nothing pinned was
  deleted, no fix having landed. Two probes are retained deliberately unpinned, both because their owner's capture
  leaves the verdict open and a pin would settle by assertion a question its owner reserved. Pinned status was
  derived by scanning every test body in the suite rather than read off the rows, which caught fourteen and
  corrected a first pass that had matched none. Lanes after the change: integration 1,488 and e2e 568, against
  1,489 and 574 before. Dispositions and the summary are in
  `notes-concurrent-integration-characterization.md` § Retention at close.

### `[x]` **6.6 Refresh the test-cost baselines and re-read e2e shard balance**

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

- _Outcome:_ All ten baseline run files were still in place, so the comparison is tool-computed rather than
  degraded to the recorded medians. Nine runs, three per tier, interleaved round-robin as the baseline was.
  Wall-clock medians moved `integration` 44 784 → 46 553 (+3.95%), `lane` 49 624 → 52 365 (+5.52%), and `e2e`
  205 011 → 210 051 (+2.46%); all three tier-isolated rows are refreshed to those medians with budgets at the
  ceiling of the ten-percent allowance. Two findings sit underneath the headline. Summed file time is the only
  place the probes' real cost shows: integration's rose 12.40%, the **only delta in the sweep the tool puts outside
  its noise band**, while that tier's wall clock moved under four percent, because twelve workers absorb it — so
  the per-CI-job rows at `workerSizing: 1`, refreshed at the verification boundary, have nowhere to hide it and
  should expect that number. And most of the e2e overage is not this work unit's: the pre-probe median was already
  8.3% above its recorded baseline before a probe landed, against 2.46% added here, which is what the pre-probe
  note predicted when it called this refresh compelled. The shard re-read went 52 files to 55 with anchors
  unchanged and remainders 13/13/13/13 → 14/14/14/13, the partition redistributing whole files exactly as
  described; leg 1 is the one to watch, carrying the Errand probes inside its excluded anchor and drawing the
  largest new file on top. The `unit` tier-isolated row is left as recorded, outside this task's three, though this
  work added eight tests to it — stated rather than acted on. Figures are in
  `notes-concurrent-integration-characterization.md` § Post-probe cost.

### `[x]` **6.7 Close the ledger against the matrix** — validate exit criterion at segment scope

- _Goal:_ Every ledger row is closed on all four closing columns, and the retained suite is green against the
  refreshed baselines.

- _Note:_ Two obligations cannot close here, and both land at the verification boundary. Whether the e2e and
  integration lanes ran on the pull request is observable only once a pull request exists — and it asks whether the
  legs **ran**, not whether the workflow went green: the e2e job is skipped when the change is classified
  light-weight, when reconciliation is deferred, and when the lane is not the reviewed one. The same run is the only
  source for the per-CI-job budget rows, so reading its elapsed figures and landing a second budget refresh belongs
  there too. Neither is optional: the criterion forbids leaving a CI budget summary standing.

- _Outcome:_ Closed against the phase's exit criterion rather than this task's goal, the criterion naming five
  recorded columns where the goal names four. All forty-four rows now carry every one. Three needed filling and all
  three are the closed-unproducible cells, which had owner, fix and retention but neither continuation nor
  classification — not an oversight so much as an unstated reading, since a cell producing no observation has no
  stop to classify; both now say so in the ledger's own vocabulary. Resolution: fifteen rows to five `backlog/`
  stubs, each confirmed present on disk rather than assumed from its slug, ten to Errand-fate captures, seventeen
  not applicable. **Two rows do not resolve, and that is the criterion's one gap** — the ceremony-repetition
  doctrine has no home and the approval-gates capture still carries `WU_Target: TBD`, both held open at the Owner's
  direction when the routing ran, so they are a held decision rather than unfinished work; named at close rather
  than left to surface at verification. The doctrine's home has gained weight since, refusal remedy accuracy having
  reached four instances with the fourth inverting the other three. The retained suite is green against the
  refreshed baselines, one measurement per tier: integration 44 043 against a 51 209 budget, lane 52 779 against
  57 602, e2e 211 158 against 231 057, all `within`. `RELEASE-GATES.md` § Errand runway is corrected — it still
  listed the typed-drift-dispatch Errand that Task 6.4 recorded as retired, and now carries two live Errands and
  that one's retirement with its reason; the file is outside version control, so the correction travels with the
  checkout. The two obligations the note names remain open at the verification boundary by design. The close is in
  `notes-concurrent-integration-characterization.md` § Ledger close.

- _Amended 2026-09-15 at the Owner's direction, after a close-out re-read._ The gap this outcome reports was
  misread and is now closed. Both rows it named had already had their fixes met by sibling work — the landing
  window merges across a disjoint advance, and the one bare stop at that boundary carries a required remedy whose
  argv is executable without shell reconstruction — and the close counted open owner strings without asking
  whether the superseding rows had discharged them. The genuine gap was a third entry the audit never reached: the
  doctrine row carries `_Fix:_` rather than `_Fix at close:_`, so filtering on the latter excluded it before any
  column was checked. It is routed to `delivery-rebuild-continuity`, whose purpose already states the rule for its
  own surface and whose evidence-applicability capture cites it as settled, under the constraint that the sentence
  land in a shared surface rather than in that work unit's draft — the rule spanning every ceremony in the
  post-execution tail while its owner is one consumer of it. **Every row and every ledger-only finding now has an
  owner.** The correction is appended in `notes-concurrent-integration-characterization.md` § Ledger close with the
  superseded reading left standing.

## **Phase 7:** Second matrix — the axes the failures actually move

_Purpose:_ Close the span gap the routing exposed. D3 enumerates boundary × base-movement kind, and the recorded
failures move four other things, so the routed owners would otherwise inherit a caveat where they need coverage.

_Mode:_ `replication` — closes when the enumerated axis surface is exhausted and batch-verified.

_Ordering:_ runs after Task 6.4 and before Task 6.5, per the amendment on Phase 6.

_Design decisions:_ The axes are derived from failures already on file, never imagined. D3's applicability rule
applies unchanged, and an axis may close as unobservable on this tree rather than forcing a fixture. Rows recorded
before the widening are never edited; a changed observation appends against the base it was seen on.

_Exit criterion:_ Every cell the second matrix enumerates holds either a probe in the suite or a ledger row closed
with its reason; no row recorded before the widening is edited; the full e2e and integration lanes run green with
every pin in place.

### `[x]` **7.1 Derive the second matrix from the recorded failures**

- _Goal:_ Each axis D10 names is enumerated against the boundaries, carries a stated ceiling, and resolves to a
  go or no-go before any probe is written.

- _Outcome:_ Four axes, all go. Ceiling twenty-seven against a stated cut signal of roughly twenty-five, with
  nineteen cells surviving applicability — recorded plainly rather than settled by choosing the flattering number.
  Eighteen recorded failures are tabulated by what actually moved, and every surviving cell traces to one of them.
  The applicability closures are the finding worth keeping: head movement under the Candidate binding, and at the
  terminal-rebind verb itself, is already probed and already tolerant — so what survives is narrower and sharper,
  the verbs that read a binding without offering the rebind. One new fixture in all, an ambiguous-merge-base
  topology; the other three axes compose helpers that exist. Two sub-cases close, one unobservable on this tree and
  one underived, and two failures fit only once the ceremony-write axis widens to the operator index, which D10 now
  carries by forward amendment. Enumeration in `notes-concurrent-integration-characterization.md`
  § Second matrix.

### `[x]` **7.2 Probe the head-movement axis**

- _Goal:_ Observe what each reached boundary returns when a bound record's head moves under it, which is the
  binding mismatch currently holding a shipped work unit's closeout open.

    - `[x]` **7.2.a Probe the bindings that refuse on head equality**

        - Three cells and a control, each reproducing its recorded failure. Readiness returns the byte-identical
          result for a member bound to an earlier head as for a repository carrying no delivery state at all —
          the comparison is head equality and reads no ancestry — and the probe asserts that equivalence rather
          than describing it. Closeout blocks `terminal-unsettled` on a host merge at a descendant of the bound
          head, its control settling at the exact head; the control failed first on its own fixture, which is what
          made the movement readable. Position refuses `review-fix-routing-required`, and the recognition is
          already built: the verb passes the append-only allowance, which turns the movement into an observable
          fact rather than admitting it, so the gap is a route from fact to resumption. Rows are in
          `notes-concurrent-integration-characterization.md`.

    - `[x]` **7.2.b Probe the session-init posture and the Frontline-result binding**

        - Both cells resolved: one observed, one closed. Session-init's delivery orientation reads `ok: false`
          with "Delivery position is unavailable: observation-unavailable" over an append-only terminal advance,
          against a control on the same scaffold that carries the position line — the session still exits zero, so
          what is lost is one field and a message naming no cause a reader can act on. The asymmetry is the fix's
          shape: this derivation takes an observation mode whose values admit exactly this movement, and its two
          consumers disagree, the position verb passing one and session-init passing none. The Frontline-result
          cell closes unproducible, its mechanism recorded in place of the observation: the advice is a projection
          over the current outcome and its dispositions with no history input, while the approved dispositions are
          durable and enumerable — so the loss is not storage but the absence of any read from it when the target
          moves. Rows are in `notes-concurrent-integration-characterization.md`.

### `[x]` **7.3 Probe the history-shape axis**

- _Goal:_ Observe what each reached boundary returns when merge-base cardinality is not one and overlap cannot be
  classified at all.

    - `[x]` **7.3.a Arrange the ambiguous merge base and prove the topology**

        - `arrangeAmbiguousMergeBase` puts both heads on the same two ancestors in opposite parent orders, the
          one shape leaving two best common ancestors with neither reachable from the other. The base side stays
          plumbing like every other base move here; the branch side is a real commit and a real merge, because
          the caller's HEAD, index, and working tree have to agree afterwards. Both heads carry the same tree
          deliberately, which is what makes the condition legible: a reader picking one of the two bases is
          choosing which half of the history it sees, not which half exists, and the proof asserts each base
          reports a disjoint path set for the same branch. The opposite parent order is also what keeps the two
          merges distinct commits at all, since they share a tree, a parent set, and an author.
          `writeTreeOverParent` is extracted so both arrangements build through an index that is never the
          caller's. Reading the four readers settled that none of the cells collapse: the sole-base resolver that
          throws is not on the prepublication path, which reaches applicability directly, and the overlap
          analyzer is reached only from base distance rather than from checkpoint composition.

    - `[x]` **7.3.b Probe the four boundaries that read a merge base**

        - Four cells, each against a control on the same arrangement with one merge base, and the four handlings
          the enumeration predicted are all confirmed distinct. Verification is the sharp one: subject collection
          uses plain `merge-base`, Git returns the branch-side ancestor, and the subject reports the base's own
          change as the work unit's contribution while omitting the branch's commit — with no refusal and nothing
          recording that a choice was made. A companion case shows the resulting digest differs from the one the
          same branch work produces unambiguously, which is how identical work reads as a changed Candidate and
          draws a fresh root. Applicability refuses `classification-unavailable / merge-base-ambiguous` over the
          same condition. Review status neither picks nor refuses: the sole-base resolver's untyped message is
          caught into a blocked obligation's detail while the status reports the base moved and directs a
          checkpoint rerun that reads the same history. Drift keeps its `reconcile` verdict and degrades only the
          overlap beneath it, which is why the consequence lands as a classification failure. All four route to
          one owner, whose draft already records three of them from the field. Rows are in
          `notes-concurrent-integration-characterization.md`.

### `[x]` **7.4 Probe the ceremony-concurrent-write axis**

- _Goal:_ Observe what happens when a ceremony's own record writes move the head its preconditions were read
  against, with no base movement involved.

    - `[x]` **7.4.a Probe the two cells the enumeration placed on the operator's index**

        - Session-init and recovery observed, and the enumeration corrected: the operator's index is not the
          cause. An authorized merge landing the work unit's active record on the base leaves the checkout on the
          base while the record still names the work unit's branch, and the seed write then returns
          `seed-invalid` against a control that writes it. Running the identical merge conflicting and clean
          returns the same typed failure, which is what establishes the index as incidental rather than causal.
          Public review holds the placement instead: a correction staged on the top branch invalidates an
          admission minted for a member whose own contribution did not move, because preparation re-resolves the
          member's review status and requires byte equality against it, and a staged path reaches that projection
          through the Candidate subject. That cell rides an existing chain, four shorter routes to a live
          admission each being refused by a real precondition. It is a diagnosability defect rather than a
          capability one: clearing the index readmits the same admission unchanged, proven rather than argued, so
          what is missing is a typed reason naming the index and not the ability to proceed. The rows and the
          correction are in `notes-concurrent-integration-characterization.md`.

    - `[x]` **7.4.b Probe the three cells whose writes are the verbs' own**

        - Terminal landing observed. A correction resumed over an advance made only of the ceremony's own record
          writes rebinds and then raises a verification task naming the member, indistinguishable from the same
          resume over an authored change. The terminal fixture bound the terminal to the head its record write
          produced, so the arrangement could not arise in it; one option binding to the head that write advanced
          past is what makes the cell expressible. A plain reconcile over the same arrangement is tolerant, so
          the cost appears only on the resumed path. The other two close unproducible with their mechanisms
          recorded from the field: landing has no prepare-to-apply composition anywhere in the suite and its
          nearest fixture refuses with no reason field, so no control is readable; entry's selection is pure over
          disposition records, so supplying them would construct the condition rather than watch a ceremony write
          it, and reaching two pending authorities needs an approve-reattest-approve sequence no fixture performs.
          Each closure names the capture that owns it and records that the composition the cell lacks is the one
          that fix requires anyway, so coverage travels with the fix rather than ending at the closure.

### `[x]` **7.5 Probe the boundaries outside the enumerated six**

- _Goal:_ Observe base movement at the delivery authoring and rematerialization surfaces, which read a base the
  first matrix never named.

    - `[x]` **7.5.a Probe the two windows a base can advance inside**

        - Both observed against controls on one arrangement. Eligibility proves its whole window intact and then
          discards it: gate results, plan, lifecycle paths, per-member contribution, predecessor relation and
          normalized completeness all pass against the prepared snapshot, and only then does the close re-observe
          the refs that snapshot named. A base advance on a path no member touches refuses `source-moved` and
          directs a fresh preparation, which means a fresh Tier 2 run per member; the result names that remedy
          with its complete argument set but not its price. A third case establishes the gates are not what is
          refused, the gateless mechanical close returning a result identical to the publication close that
          validated two passing ones. Materialization is recorded without a pin, deliberately: its owning capture
          leaves open whether an in-call recheck or a later review gate is the right authority and forbids
          treating either outcome as implicit, so the probe supplies the fact that decision needs instead. The tip
          observation exists and is reachable — a first pass over the same advance refuses on it — but it lives
          inside the branch that binds the target, so a bound chain republishes identically whether or not the
          base moved and never observes the base ref at all. Rows are in
          `notes-concurrent-integration-characterization.md`.

    - `[x]` **7.5.b Probe the three surfaces a moved base makes unrebuildable**

        - All three observed, and one of them found a collapse the enumeration did not predict. Authoring admits
          a chain recut on the moved base and then refuses it at close: preparation validates chaining, ancestry,
          emptiness and lifecycle contribution while holding every coordinate the completeness comparison needs,
          and compares none of them against the top, so `prepared` sends a full Tier 2 cycle after a fact it
          already had. Its control is the field's own successful path, the same advance with the chain left on the
          top's base closing `eligible`, and a second case records that the reason follows what the base change
          touched — an added path returns `completeness-invented` for the identical mistake. Rematerialization
          returns the byte-identical refusal for the opposite condition, and a third case proves the equality
          rather than leaving it to be noticed: at authoring the members are ahead of the top and the remedy is to
          recut, at rematerialization the top is ahead of the members and the remedy is to rebuild the suffix, and
          one reason code carries neither direction nor remedy. Post-land settlement was read from source before
          it was probed, which corrected the field's account: the conflict composes from the pinned predecessor,
          the pinned member and the landed predecessor, so the resolved member head cannot affect it, and the
          probe shows resolving the named path returns the identical refusal. That refusal is correct; the defect
          is the guidance one layer up directing a remedy this proves cannot clear it, recorded with its locus and
          routed rather than probed, since reaching it needs scaffolding no fixture composes. Rows are in
          `notes-concurrent-integration-characterization.md`.

### `[x]` **7.6 Confirm the second matrix and re-close the ledger** — validate exit criterion at segment scope

- _Goal:_ Every enumerated cell resolves to a probe or a closed row, no earlier row was edited, and both lanes run
  green with every pin in place.

    - Walk the second matrix against the ledger rather than the reverse, as at Task 5.4.
    - Confirm every row recorded before the widening is byte-identical to what it was.

- _Outcome:_ Exit criterion met on all three clauses. Walking the enumeration forward, all nineteen surviving cells
  resolve — sixteen probed and three closed with their reasons — across twenty rows, the extra being the control
  post-landing closeout needed before its movement was readable. Diffing this file against its state immediately
  before the widening commit returns zero removed or changed lines, so every pre-widening row is present in order
  and unedited, and the two corrections taken during the widening were appended beside the readings they replaced
  rather than over them. Both lanes run green with every pin in place: integration 1,489 and e2e 574. The
  Errand-ceiling recheck corrected its own premise — `review-signal-convergence` is implementation-complete but is
  not merged into `origin/main`, the base is unchanged at `cbf075da7`, and the closure's condition was always about
  the base rather than the work unit's maturity, so it holds as written. The second-matrix forward-compatibility
  screen ran over ten routed mechanisms: PM-composition fired for nothing a second independent time, and
  `package-project-sync` fired where the first screen had found nothing, because the authoring remedy is a typed
  verb replacing prose in `deliver-stack.md`, which is two-copy — an obligation its capture does not name. Refusal
  remedy accuracy now stands at four instances, the fourth inverting the shape: three remedies that work and go
  unnamed, and one that is named and cannot clear the refusal carrying it. Confirmation is in
  `notes-concurrent-integration-characterization.md` § Second-matrix confirmation.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The complete work unit is validated against its success criteria and the project's gates before
  integration, including the criteria only a pull request can settle and the routed owners only the mint can
  produce.

---

## Success Criteria

_Amended 2026-09-15 at the Owner's direction. Three criteria below bind at the integration boundary rather than
at verification. Whether the heavy lanes ran on the pull request, and the per-CI-job budget rows read from that
same run, have no source until a pull request exists — which this work unit reaches only after verification
closes, so as written they could not be satisfied at the boundary that demanded them. They are not dropped:
each names the run that settles it, and the integration ceremony is where they are answered. A criterion is
tracked at the earliest boundary whose validator can see its evidence, and these three were tracked one
boundary too early. The criteria themselves are unchanged._

- `[x]` Every enumerated cell across the singleton, delivery-member, and isolation shapes holds either a probe in
  the suite or a ledger row marked not-applicable with its reason
- `[x]` Every probe that does not pass on the current tree calls the shared pin helper with both its observed and
  target shapes, the suite is green with those pins in place, and no probe uses a skip, todo, or expected-failure
  marker
- `[x]` The extended base-advance helper accepts a path set and all four movement kinds, and every new probe
  advances the base through it
- `[x]` Every ledger row carries every recorded column, and every non-passing and ledger-only row's owner resolves
  to a `backlog/` stub, a capture targeting an in-flight work unit, or a capture whose fate is Errand
- `[~]` Stubs minted beyond the four named stabilization targets number one or two

  _Superseded:_ the routing produced **zero**. Every remaining row resolved to an owner that already
  existed — a `backlog/` stub, an in-flight work unit's capture, or an Errand capture — so no unowned,
  spec-worthy mechanism was left for one to be minted for. Minting a stub to reach the predicted count
  would have invented unowned work; the intent this criterion serves is carried by the ownership
  criterion above, which is met.
- `[x]` Each of the four named stabilization targets exists as a `backlog/` stub at close, the generalized doctrine
  sentence has its own owned row, and `RELEASE-GATES.md` matches the routed ledger

  _Deviation:_ three stubs rather than four. `delivery-authoring-rebuild` and
  `delivery-prepublication-evidence-applicability` are one mechanism at two lifecycle positions and were
  consolidated into `delivery-rebuild-continuity`, which is what the design's own rule directs —
  consolidate by mechanism rather than by boundary. Every named target is owned by a stub on disk, and
  `RELEASE-GATES.md` and `ROADMAP.md` name the same three.
- `[~]` The test-cost baselines are refreshed in a dedicated `perf(test-cost)` commit whose message states the
  measured delta, and no CI test-budget summary is left standing

  _Deferred to the integration boundary._ The first clause holds — the refresh landed in its own commit stating
  every measured delta. The second has no source but a pull-request run and is answered there. Expect
  integration's summed file time, which grew 12.40% against a wall clock that moved under four percent because
  twelve workers absorbed it, to surface in those rows at a single worker.
- `[x]` Every probe retained at close guards a cell or isolation case no other test covers, every deleted probe's
  ledger row records its observation and the covering test, and the measured tier cost reflects only the retained set
- `[x]` Every axis the second matrix names is either enumerated with a stated ceiling and probed to it, or closed
  with a recorded reason it cannot be observed on this tree
- `[x]` No row recorded before the span widened is edited to agree with a later observation; every changed
  observation appends against the base it was seen on

  _Verified at close:_ re-checked against the rows rather than the file. No observation field has been
  removed or rewritten since the widening — the changes are placeholder fields being filled and one table
  that is not a ledger row. The file-level evidence first recorded for this criterion was wrong, and the
  correction is appended in `notes-concurrent-integration-characterization.md` § Second-matrix
  confirmation.

  _Amended 2026-09-15:_ that correction is itself corrected in
  `notes-concurrent-integration-characterization.md` § Record audit at close — it measured against a baseline its
  own sentence does not name, so the claim it faulted was true when written and the table it counts falls outside
  the named baseline entirely. The criterion still holds, and for a cleaner reason: against the baseline the claim
  names, the diff removed nothing when the claim was made and removes twenty-five lines now, every one a
  placeholder fill and none an observation field.
- `[~]` The e2e and integration lanes ran on the pull request, not only locally

  _Deferred to the integration boundary._ Settled by the pull-request run and nothing else. Read the job list
  rather than the badge: the question is whether the legs ran, and the e2e job is skipped when the change is
  classified light-weight, when reconciliation is deferred, and when the lane is not the reviewed one.
- `[x]` All quality gates pass (tests, linting, type checking)
- `[~]` Ready for integration

  _Deferred to the integration boundary._ Follows the two criteria above, both of which only a pull-request
  run settles.
