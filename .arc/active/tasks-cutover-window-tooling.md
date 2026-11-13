# Task List: cutover-window-tooling

- **Design:** `spec-cutover-window-tooling.md`

---

## **Phase 1:** Shipped seams and the host boundary

_Purpose:_ the two changes to shipped code, and the script family's entry, results, lint boundary, and host facts that
every later operation stands on.

_Mode:_ `layer` — closes on the shipped seams and the family's host boundary settled.

_Exit criterion:_ both shipped changes pass their suites with no existing caller or constructor changed, and every host
fact the family reads arrives through one port that takes a supplied fact only where the repository has no host.

### `[x]` **1.1 Carry the composition's provenance on its result — § 1.3**

- _Goal:_ The composition's result exposes, by slug, every copy of each in-flight work unit exactly as its in-flight
  entry records it, while no existing caller, constructor, test fixture, or serialized output changes.

- _Outcome:_ `ComposedLifecycleIndexResult.provenanceBySlug` retains every work-unit entry's native provenance,
  including stale and unselected copies and completed units' leftover branches; tree-only compositions omit it.
  All-stale groups remain absent, with their branches available through per-slug quality warnings.

### `[x]` **1.2 Seal `arc user load` — § 7**

- _Goal:_ Once the registry ref exists, every load path refuses before writing any file, ending with the
  store-imported refusal's condition and remedy and a non-zero exit; before it exists, load behaves exactly as today.

    - `[x]` **1.2.a Guard `runUserLoad` first**
        - `runUserLoad` checks the imported-store guard before resolving the current unit or user surfaces. The load
          refuses without further Git or disk writes while imported, and restores its saved files after removal.

    - `[x]` **1.2.b Pin both callers' refusal**
        - The CLI E2E case uses real pipes to verify stderr, exit status, no restored file, and successful continuation
          after registry removal. Sync's existing error rendering retains both condition and remedy without a handler
          change; its unit test pins the load direction's message and exit status.

### `[x]` **1.3 Family entry, results, lint boundary, and inertness — § 1.2, § 1.4**

- _Goal:_ Every operation runs from source through one entry, prints a report, emits one typed `--json` result listing
  every failing subject rather than the first, and exits non-zero on a refusal, a stop, or an `account` or `chain`
  finding; the family may read the store's private implementation, and nothing the package, the install recipe, or the
  CLI bundle reaches includes it.

    - `[x]` **1.3.a Entry, dispatch, and the lint exemption**
        - The source entry requires `--repo`, dispatches only built operations, and propagates usage refusals to the
          process exit status. A root npm script runs it. The family's four lint exemptions leave the remaining
          architecture boundaries intact, including the private-import restriction everywhere outside the folder.

    - `[x]` **1.3.b The result and report shape**
        - The typed result preserves every finding and remedy. JSON output is one stdout value with its complete report
          on stderr; human mode prints that report on stdout. Central exit classification distinguishes failures from
          passes and report-only operations, and the entry passes the explicitly named checkout to its handler.

    - `[x]` **1.3.c Prove the family ships nowhere**
        - `cutover-window-packaging.test.ts` checks the actual bundle's raw inputs and output attribution, the package's
          published-file patterns, and every nested install-recipe path.

### `[x]` **1.4 Host facts and the merged-flip test — § 1.1**

- _Goal:_ Every host fact the family reads arrives through one injectable port: a repository whose every effective
  remote URL and push URL is a local path has no host and takes supplied facts, any other refuses a supplied fact before
  any host read, and a host read that fails or may be incomplete refuses, save the discovery read's one answer of none;
  the merged-flip test answers merged only from a reachable recorded head on a host that merges by merge commit alone.

    - `[x]` **1.4.a No-host detection and supplied facts**
        - Effective fetch and push URLs decide whether supplied rehearsal facts are admissible, including Git URL
          rewrites and additional push URLs. A missing listing names its remedy; supplied facts cannot replace a host
          read. Operational refusals retain every finding through the entry's human and JSON reports.

    - `[x]` **1.4.b Host reads**
        - `createWindowHost` binds GitHub reads to origin's effective host and repository, rejects truncated listings
          and unknown merge settings, and accepts only discovery's no-known-host failure as none. Native ref reads
          filter full branch and store prefixes and the import's direct identity pattern.

    - `[x]` **1.4.c The merged-flip test**
        - `isWindowFlipMerged` reads main from origin, fetches missing commits into leased disposable refs while
          preserving origin tracking, and treats only completed ancestry exit 1 as not merged. Hosted repositories
          require merge commits alone. Unexpected operation failures retain typed stop reports and a retry route.

## **Phase 2:** The restore point

_Purpose:_ the abort's restore point, proven end to end over a real import before the check grows its other conditions.

_Mode:_ `slice` — closes on an abort's restore exercisable end to end over a real import.

_Exit criterion:_ in a temporary repository with a local bare `origin`, a designation, and an identity ref holding a
claim, `check` records and holds, the import lands and publishes, and `restore` returns every recorded ref on both
sides, removes the store directories and the designation, lifts the guard, and deletes the hold, finishing when
restarted after each of its steps.

### `[x]` **2.1 The record and the hold, with C9 — § 2.1, § 4**

- _Goal:_ A passing check writes the record and the hold with the completion marker last, and a refusing or killed run
  leaves no complete hold, so every later operation reads a restore point it can trust.

    - `[x]` **2.1.a The hold's layout, the record document, and the writer**
        - `writeWindowHold` retains local, origin, and tracking tips and writes the orphan record commit with its
          completion marker last. `readWindowHold` checks the matching marker, distinguishes absent and incomplete
          holds, and preserves unreadable or mismatched evidence for repair.

    - `[x]` **2.1.b The passing baseline**
        - `windowFixture` shares the import source with a local mirror, clean personal/mirror exclusions, no state
          designation, main and a one-commit flip pushed with upstreams, eligible personal state, and the supplied
          flip-request listing. Its native Git facts and notes save are exercised before condition tests consume it.

    - `[x]` **2.1.c C9 — a store, designation, or earlier hold**
        - The check's admission reports every prior designation, backing pointer, wrong code remote, store directory,
          local or origin state or working ref, and earlier hold without changing existing state. Other ARC refs pass; incomplete
          holds name removal, and completion markers name the conditional restore or Owner-settlement route.

    - `[x]` **2.1.d The run order and its stop points**
        - The source entry runs `check` against the named checkout, binds the flip branch to its main-targeting pull
          request, admits supplied facts only without a host, and captures refs, branches, and worktrees. Record and
          marker checkpoints leave interrupted holds incomplete; explicit refusals discard unfinished holds.
        - _Retired in:_ Phase 4

### `[x]` **2.2 What the import consumed — § 3, § 6.1**

- _Goal:_ One comparison decides whether what the import consumed of each Errand identity ref equals its held tip — by
  kept tip while the kept tips remain, by landed transient record once they are dropped, and by the ref's own value
  before a landing — writing nothing, so `restore` and `recompute` judge consumption the same way.

    - `[x]` **2.2.a The records the held identity refs give**
        - `readWindowTransientRecords` reads exact identity refs at their held immutable tips and maps claims through
          the import's logical coordinates and canonical JSON. Absent, failed, or diagnostic-bearing snapshots remain
          named differences rather than empty identities; unrelated ARC refs are ignored.

    - `[x]` **2.2.b The three regimes**
        - `compareWindowConsumption` distinguishes unlanded input, retained source tips, and landed records using strict
          registry and plain Git reads. It compares the complete claim set and canonical content, prints full changed
          records behind mismatched kept tips and landed records, and retains identity coordinates for the restore's
          decision record.

### `[x]` **2.3 The restore — § 6**

- _Goal:_ From a complete hold whose flip has not merged, `restore` returns every recorded ref on both sides, deletes
  what the window added, removes the store directories and the designation, lifts the guard, and deletes the hold;
  it changes no ref another writer moved until the Owner accepts that value, and finishes when re-run after stopping
  at any step.

    - `[x]` **2.3.a Refusals before any write — § 6.3**
        - `admitWindowRestore` binds the named flip to its complete hold and request, rejects armed auto-merge and
          unsafe or unreadable merge evidence, and rejects supplied listings on hosted remotes before file or host
          reads. Named checkpoints and the repeatable strict merge guard establish the mutation sequence's admission
          boundary.

    - `[x]` **2.3.b The consumed comparison and its record**
        - `recordWindowRestoreDecision` reports complete consumed differences, requires exact observed --accept values,
          and persists the regime, outcomes, and accepted pairs against the complete hold. Retries read the saved
          comparison after import evidence is gone; new observed acceptances append by compare-and-swap without
          recomputing it.

    - `[x]` **2.3.c Leases checked before the first push**
        - `prepareWindowRestoreRefs` captures both sides, tracking, and the configured identity; its pure planner
          checks every protected value before allowing a push. Publication leases apply only to eligible store refs,
          retired identity absence follows the saved comparison, and exact accepted pairs authorize either side.

    - `[x]` **2.3.d Steps 1 and 2 — `origin` and local refs**
        - `restoreWindowRefs` restores origin from verified held tips with exact push leases and its registry last,
          rechecking merge evidence before the first push and registry deletion. Local refs reset atomically on their
          observed values; a race preserves the changed value and permits retry after exact acceptance.

    - `[x]` **2.3.e Steps 3 to 5 and re-running — § 6.2**
        - The source entry runs the complete restore before or after publication, removing directories and designation,
          strictly verifying both ref inventories, and deleting the completion marker before the remaining hold.
          Ordinary checkpoints restart from the saved decision; marker-deletion interruption takes the explicit cleanup
          route in `notes-cutover-window-tooling.md` § Restore restart interpretation.

### `[x]` **2.4 Hold, import, and restore round trip** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds over a real import.

- _Outcome:_ The source CLI round trip in `51bd814982` returns both ref inventories after a real import before or after
  publication, removes the installation and hold, and lifts the seal without moving code checkouts. Interrupted
  ordinary steps finish on retry; interruption after marker deletion reaches the same target through explicit cleanup.
    - Run `arc check segment` and record the scenario and its result.

## **Phase 3:** Checkouts, the lock step, and the rehearsal copy

_Purpose:_ the check's checkout conditions with the models they read, the lock step, and the copy driver, so the
complete check can run over a copy of this repository at the segment's close.

_Mode:_ `slice` through Phase 4 — closes on the complete quiesce check run over a copy of this repository.

### `[x]` **3.1 Marked checkouts and live branches — § 1.1, § 1.3**

- _Goal:_ The family classifies every registered checkout as marked or names its kind, and derives the live work units
  and live branches from the same composition call the import makes.

    - `[x]` **3.1.a Marked checkouts**
        - `readWindowCheckouts` acquires native registrations and validated markers in the named repository;
          `classifyWindowCheckout` uses the ownership and husk decoders to distinguish marked checkouts from each
          excluded kind. Husk evidence remains separate for C4, and unreadable registration inventories name a retry.

    - `[x]` **3.1.b Live work units and live branches**
        - `readWindowLiveState` uses the import's native source binding and one composition, retaining live-unit
          provenance or all-stale warning branches alongside registered and ordinary Errand branches. Every local
          identity and pinned origin identity contributes; `branches.live` records local/fetched tips and reasons.
          Tip lookups ignore inherited object properties.
        - Origin acquisition precedes capture, reuses exact held tips, and refuses replacement. An invalid identity
          refuses and removes the partial hold; repairing the input permits a fresh check.

### `[x]` **3.2 The personal and review-gate digests — § 4.2**

- _Goal:_ Each worktree's personal digest and the review gate's digest change exactly when what the import would read
  changes, computed from the import's own acquisition so the two cannot drift.

    - `[x]` **3.2.a The personal digest**
        - `readWindowPersonalState` retains one import acquisition and hashes sorted file paths/content and link
          paths per physical checkout. Nested registrations belong to their deepest checkout; notes saves preserve
          the digests, while personal edits and newly created links change only their owner's digest.

    - `[x]` **3.2.b The review-gate digest**
        - `readWindowReviewDigest` fingerprints the import's raw review-gate files, excluding its repository identity;
          inventory notices refuse with a check-specific access remedy. Capture binds both digest readers to the same
          import context and persists required `personalDigest` and `reviewGateDigest` fields in the strict record.

### `[x]` **3.3 The lock step — § 8, C3**

- _Goal:_ After `lock`, every marked linked checkout carries a Git worktree lock, so C3 passes, while existing locks and
  every other checkout are untouched.

- _Outcome:_ `lockWindow` selects marked, unlocked linked checkouts and uses the shared spawn lock helper; existing
  reasons and unmarked checkouts remain unchanged. Each new lock is reported, individual failures preserve a zero exit
  and permit retry, and C3 uses the same captured checkout inventory to refuse any marked checkout still unlocked.

### `[x]` **3.4 Checkout refusals — C1, C2, C4, C5, C6**

- _Goal:_ The check refuses each checkout condition of § 2.2 exactly, naming the checkout, branch, stash entry, or
  `arc` executable concerned with its remedy, and passes once the remedy is applied.

    - `[x]` **3.4.a C1 — dirty, off its upstream, a personal link, or tracked state stashed**
        - C1 names dirty/untracked status, missing or unequal fetched upstreams, ignored tracked-state files, and
          personal links from the import's acquired disk state. Shared stash inspection checks every entry's
          working-tree, index, and untracked snapshots by position/message; incomplete inventories name a repair route.

    - `[x]` **3.4.b C2 and C4 — unmarked, ended, husked, or unresolved checkouts**
        - Unmarked linked kinds name removal remedies, including unlock before pruning a missing folder. C4 reads
          status's roster at the primary as its configured identity, preserving unresolved diagnostics and refusing
          retired or husked holders. Errand markers require an exact slug/claim in the acquired local/origin records.

    - `[x]` **3.4.c C5 — a staged decomposition cut**
        - Local/fetched candidates use the canonical short-name classifier and strict ancestry against captured
          `main`. Uncontained tips and every decomposition staging entry refuse; unavailable ancestry or inventory
          reports a repair route. A landed candidate and repaired staging directory pass.

    - `[x]` **3.4.d C6 — a checkout without the seals**
        - C6 resolves the first-parent sealing anchor or an admitted rehearsal anchor, checks every registered head
          and present built CLI, and resolves every executable `arc` on the supplied/default PATH, excluding directory
          links. Foreign targets refuse; the source checkout remains allowed. `--path` leaves Git's environment intact.

### `[x]` **3.5 The copy driver and copy safety — § 9.1**

- _Goal:_ `copy` produces a full copy of this machine's repository with its mirror, neither able to reach the host or a
  live checkout, leaves the live repository untouched, and stops before any `arc` command runs in a copy that fails an
  assertion.

    - `[x]` **3.5.a The copy**
        - Copies the primary, its Git directory, and every linked checkout into an absent destination outside all
          live checkouts, resolving existing symlink parents before acquisition. Rewrites copied Git pointers before
          repair and routes every remote and push URL, including the mirror's, to the independent bare mirror.
        - Native coverage preserves live registration metadata and gitfiles byte-for-byte across nested, detached,
          and locked checkouts. Shared containment now recognizes child names beginning with two dots correctly.

    - `[x]` **3.5.b Copy safety**
        - The public `copy` operation establishes physical containment of registrations and Git directories before
          reading copied repository state, requires every effective remote URL to name the mirror, and checks every
          checkout's backing pointer and host discovery through the host port. Both copied identity inventories must
          be complete and contain no Errand awaiting merge; violations refuse with a repair route.
        - Native scenarios cover every isolation refusal and repaired continuation; the source CLI exercises host
          discovery and exposes a successful copy only after the assertions pass.

## **Phase 4:** Tracked state and the host

_Purpose:_ the read map and read rule, and the conditions over tracked state, copies, pull requests, Errand records,
and the host, completing the check and its record.

_Exit criterion:_ on a copy of this repository taken by `copy`, with a stand-in flip branch, `lock` then `check` with a
supplied listing and anchor evaluate all thirteen conditions, each refusal naming its subject and remedy, and none
failing for a reason outside § 2.2.

### `[x]` **4.1 The read map and the read rule — § 1.1**

- _Goal:_ For any path under the tracked-state paths at `main`'s `HEAD` or a live branch's tip, the family names its
  record or none, the record's unit, its read revision, and the read copy's ref, and whether its content there passes
  the read rule, finding records only through the in-repo store's own discovery.

    - `[x]` **4.1.a The read map**
        - `createWindowReadMap` discovers logical records through the store's meta, companion, internal-record, cohort,
          and inbox helpers, caching compared revisions, comparison bases, and selected read-copy inventories.
        - Operational composition selects live sources; the import's parked-source reader pins preserved work,
          retains unavailable sources explicitly, and keeps pointers at `main`. Parked ref names come from the
          committed pointer even when preserved metadata declares a different branch; stale copies never select a read.

    - `[x]` **4.1.b The read rule**
        - `createWindowReadRule` caches immutable tracked-tree content identities and every best merge base, admitting
          content equal to the read copy or an allowed inherited version, with absence compared as content and ROADMAP
          exempt. Discovery considers read-copy bases before choosing a path's logical owner.
        - A parked pointer's inherited absence is checked against the branch it names; a deletion after branching from
          the parked `main` refuses. Unavailable ancestry evidence refuses and permits a fresh comparison after repair.

### `[x]` **4.2 Tracked state the import would not read — C7**

- _Goal:_ C7 refuses every tracked-state change the import would lose, at `main`'s `HEAD` and every live branch's local
  and fetched tips, the flip's included, and passes every change a branch only inherited, naming the revision, the
  work unit where one applies, and each path.

- _Outcome:_ `check` evaluates the read rule over main and both acquired tips of every live branch, including the
  named flip, retaining unresolved parked-source findings and naming each affected revision, unit, path, and remedy.
  Native cases cover edits, deletions, stale copies, inherited content, parking, resumption, and repaired continuation.
  Shared fixtures graduate ownership after their base fork and move parked drafts with their metadata; map and rule
  fixtures retain their deleted-companion and multiple-merge-base premises on that history.

### `[x]` **4.3 Diverging copies and the flip's base — C8, C10**

- _Goal:_ No live work unit has a copy the import would pass over that diverges from the one it reads, and `main` is a
  proper ancestor of the flip's branch.

    - `[x]` **4.3.a C8 — a diverging copy**
        - `readWindowDivergingCopyFindings` compares every non-stale provenance copy with the operational import
          source by strict ancestry, excluding parked units through the import's parked-source reader.
        - Refusals name the unit and both refs, including divergent local/fetched mirror pairs without shadow warnings.
          Merge-and-push continuation passes; unavailable ancestry retains a restore-readable-commits remedy.

    - `[x]` **4.3.b C10 — `main` not a proper ancestor of the flip's branch**
        - `check` refuses equal tips and any flip that lacks captured main's ancestry, using strict Git reads and
          retaining actionable read failures. An advancing commit or merge into the flip permits continuation.
        - Native repaired-state fixtures explicitly carry their main advancement into the stand-in flip.

### `[x]` **4.4 Pull requests, Errand records, and the host — C11, C12, C13**

- _Goal:_ The check refuses anything that could move `main` or a live branch on the host unseen, any Errand record or
  identity-ref mismatch the import would carry across or strand, and an importing checkout off the host, and its
  record is complete.

    - `[x]` **4.4.a C11 — open pull requests, auto-merge, and merge settings**
        - The check names open requests targeting main or any live branch, the flip included, armed flip auto-merge,
          and each incompatible host merge mode. Its remedies close or land requests, disarm auto-merge, or disable modes.
        - Hostless supplied facts remain distinct from hosted reads; unreadable listings and supplied replacements on a
          hosted repository refuse through the complete check and permit retry after repair.

    - `[x]` **4.4.b C12 — Errand records and identity refs**
        - Quiescence retains local/origin transient provenance, refuses ordinary Errands and foreign claims, and requires
          origin identity refs to match their local tips while permitting local-only refs. Identity comes from import ports.
        - Native acquisition and holder fixtures preserve their assertions without admitting Errands as quiescent:
          held-source reads use the acquisition phase, and successful retries retire or align identity records.

    - `[x]` **4.4.c C13 — off the host**
        - Import composition requires the physical primary on main. One host branch read records main and every live
          branch, including the named flip; mismatched or unavailable observations refuse, and explicit absence compares
          as absence. The hold persists these observations alongside local and fetched tips.
        - Detached and pre-seal native fixtures exercise marked linked checkouts while preserving the importing primary.

    - `[x]` **4.4.d The complete check and record**
        - The full check reports independent checkout, decomposition, and pull-request failures together, removes its
          unfinished hold, and passes after all repairs. The complete recorded coordinates and host tips round-trip
          through the hold; the source CLI restores the admitted baseline before and after publication.

### `[x]` **4.5 The check over a copy of this repository** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a copy of this repository.
- _Outcome:_ The full repository copy passed isolation, and `lock` preserved existing locks while adding missing ones.
  With a stand-in flip from copied main, a supplied listing, and the sealing merge anchor, the check evaluated all
  thirteen conditions and returned only C1, C6, C7, C12, and C13 refusals, each with its subject and remedy. No hold
  remained after refusal.

## **Phase 5:** After the import, before the merge

_Purpose:_ the comparisons the window runs between the import and the merge.

_Mode:_ `layer` through Phase 6 — closes on every comparison the window runs after the import settled.

### `[x]` **5.1 The recompute — § 5.1**

- _Goal:_ After the import, `recompute` stops on any change since the record to an import input or to a place a
  recorded branch could move, naming it with both values, and passes on none.
- _Outcome:_ `recompute` compares checkout membership, heads, personal and review digests, complete local/fetched
  inventories, and recorded host tips. One host listing also checks identity retirement. The shared comparison exposes
  the flip exemption for the last read, while the landed-record comparison reuses the restore's canonical transient
  rules. Differences name both values and the restore route; dirty reports include paths, and the source CLI exercises
  recompute between a native import and restore.

### `[x]` **5.2 The last read — § 5.2**

- _Goal:_ As the last act before the merge, `last-read` admits only the recorded flip head plus exactly one commit that
  only deletes files under the tracked-state paths, on the flip's branch, in its checkout, and on the host, with every
  other recompute comparison passing and no auto-merge armed.
- _Outcome:_ `last-read` retains recompute's other comparisons while binding the recorded flip sides and checkout
  to one published deletion head. That commit must have only the held head as parent and a nonempty diff of deletions
  under the tracked-state roots. Omitted admission sides stay omitted; a lost recorded side or wrong checkout branch
  refuses. Auto-merge, supplied facts on a hosted repository, and unreadable host evidence refuse with repaired retries;
  the source CLI exercises the complete path.

### `[x]` **5.3 The accounting case — § 10.2**

- _Goal:_ `account` places every tracked file under the tracked-state paths at `main`'s `HEAD`, and every live unit's
  records at a read copy that is not `main`'s, as imported, superseded, deliberately left, or reported, finding source
  paths only through the in-repo store's own discovery, and exits non-zero on any reported file.
- _Outcome:_ `account` uses the read map's native discovery and actual Git files to classify main and live read-copy
  sources. Point reads establish landed coverage without listing manifests; rename chains use successor former names,
  terminal origins use registry identities, and parked pointers count with their preserved meta. Only the two named
  guides are deliberately left. Unclaimed files, failed read rules, and missing counterparts report nonzero with repaired
  retries; absent optional document paths are excluded from the tally.

### `[x]` **5.4 The chain comparison — § 10.3**

- _Goal:_ `chain` shows every Candidate record's supersession chain read through today's reader over the repository and
  over the imported store agreeing link for link, and stops on any difference the import's report does not list.

- _Outcome:_ `chain --report` compares native repository and UID-owned store walks, their current and linked records,
  and the complete accepted singleton history. Report-listed omissions and broken source chains remain visible;
  store-only refusals and unlisted record or history differences stop the run. Native replay retains whole transitions.

## **Phase 6:** After the merge

_Purpose:_ the comparisons, confirmation, and close the window runs once no abort remains.

_Exit criterion:_ `compare`, `confirm`, and `close` hold every late change in a marked range until its confirmation, and
`close` deletes the whole hold only once every refusal clears.

### `[x]` **6.1 The after-merge comparisons — § 5.3**

- _Goal:_ For each named branch and checkout after the merge, `compare` marks what it found, records moved, gone, and
  unrecorded ranges, and reports a changed digest, never stopping.

- _Outcome:_ `compare --branch` retains local and host observations, fetching missing host commits, and reports moved,
  gone, and unrecorded ranges. Repeated comparisons replace marks while preserving earlier confirmations. The
  `--checkout` form reports its exact personal digest change without changing refs or blocking the checkout step.

### `[x]` **6.2 Confirmation — § 5.4**

- _Goal:_ `confirm <branch>` records the Owner's confirmation at exactly each side's current mark and refuses anything
  else.

- _Outcome:_ `confirm <branch> --local-tip <tip> --origin-tip <tip>` requires exactly the sides with ranges and
  atomically verifies each current mark while writing its confirmation. Unknown or unchanged branches and stale,
  missing, or extra side operands refuse without partial confirmations; fresh exact tips permit retry.

### `[ ]` **6.3 The close — § 5.4**

- _Goal:_ `close` lists every mark and range, then deletes the whole hold only once the merged-flip test answers merged
  and every refusal clears.

    - Build `test-first` (one behavior at a time):
        - It refuses before the merge, and recognizes a host merge whose commit is not local
        - A registered checkout whose `HEAD` tree tracks a file under the tracked-state paths refuses
        - An unmarked recorded live branch refuses, as does an unmarked branch missing from the record that tracks
          state
        - An unconfirmed range refuses, as does a range moved after its confirmation
        - Once all clear, it deletes the completion marker first and then the whole hold
        - Run again over the incomplete hold a stopped close leaves, it deletes what remains and tests nothing else

## **Phase 7:** Stage 1

_Purpose:_ the rehearsal of the window's mechanics on full copies of this repository, at the head that lands.

_Mode:_ `slice` — closes on Stage 1 run clean at the head that lands.

_Exit criterion:_ Stage 1's first and second runs pass every step at the head that lands, each planted condition
refusing and then passing after its remedy, with the import's cost recorded from both runs.

### `[ ]` **7.1 The rehearsal driver — § 9.2**

- _Goal:_ `rehearse` runs the ten steps of § 9.2 on a copy, reporting each step's outcome and stopping at the first
  unexpected one, writing nothing outside the copy and its mirror.

- _Note:_ See `notes-cutover-window-tooling.md` § Stage 1 driver.

    - `[ ]` **7.1.a Steps 1 to 4 — preparing the copy**
        - Fetch from the mirror. Make every commit, merge, and push in a scratch clone of the mirror, which has no hooks
          installed, plants included, except a plant that must leave a copied checkout's `HEAD` or a branch's local copy
          apart from the mirror, written in the copy with `git commit-tree` and `git update-ref`. First apply C1's
          remedy: drop each copied checkout's changes, untracked files included and ignored files kept, and push each
          branch ahead of its upstream to the mirror, the scratch clone fetching it from the copy; then fetch. Then C7's
          remedies (merge the copy's `main` into each failing read copy's branch, then return each still-failing path to
          its merge-base content) and C6's merge of `main`, each pushed to the mirror. After each fetch, fast-forward
          each copied checkout holding a changed branch to the mirror's tip and set every other changed branch's local
          copy to it, except where a plant written in the copy holds it apart; remove `dist` from each copied linked
          checkout whose source moved or whose built CLI C6 judges stale, and rebuild the primary copy when stale (see
          `notes-cutover-window-tooling.md` § Stage 1 driver).
        - Conclude a merge whose only conflict is `.arc/backlog/ROADMAP.md` with `applyRoadmapConflictAutoRemedy` and a
          commit, resolve a parked unit's branch as C7's remedy does, and stop on any other conflict, naming the branch.
        - Push each copied Errand's branch to the mirror and abandon it from its own copied checkout; drop each stash
          entry C1 refuses; create the stand-in flip branch afresh from the copy's `main` plus one commit that changes
          no file under the tracked-state paths, pushed to the mirror, with a supplied listing holding its pull request
          as the flip's.
        - When the copied identity's `USER-INBOX.md` holds no entry, plant one before step 5, whose check records
          personal digests, since step 8 needs an entry to remove and a removal over an absent entry writes nothing.
          Write `### **<title>**` under `## Errand`, adding that section when it is missing, since only an H3 bold title
          under `## Errand` or `## Work Unit` counts as an entry, and confirm through `listInboxEntryTitles`
          (`lib/user-sync/inbox-writer.ts`) that the title reads back.

    - `[ ]` **7.1.b Steps 5 to 10 — the window's mechanics**
        - Run `lock` and `check` with `--repo` at the copy, the supplied listing, the anchor, and the `PATH` C6 judges,
          a driver parameter defaulting to the process's own; run each ARC command through the launcher the driver takes
          as a parameter, by default that copied checkout's own build, or the primary copy's with that checkout as its
          working directory where it has none, under a `PATH` with no other `arc`: `arc user save` in every copied
          checkout, then `arc store remote origin push`.
        - Run `arc store migrate --import --json` under a 6 GB address-space cap through a cap wrapper the driver takes
          as a parameter, Node's heap ceiling set below it, keeping its report and recording its wall time and peak
          resident memory.
        - In every copied checkout with its own launcher (its own built CLI by default, or the one the driver is given
          for it), `arc user inbox-remove --inbox-title-file <file>`, naming an entry the copied identity's
          `USER-INBOX.md` holds by its inner bold title read from that file, reaches the in-repo store's `write` and
          refuses with the store-imported refusal, while `git status --porcelain`, `git for-each-ref`, and the inbox
          file stay byte-identical; report each checkout without one; check the identity refs are gone from the copy and
          the mirror with the kept tips dropped; then run `account`, `chain`, and `recompute`.

    - `[ ]` **7.1.c Run plans and the driver's test**
        - A run plan names each plant's point within a step, the C3 unlock between `lock` and `check` among them; its
          route, through the scratch clone and the sync or, where it must stay apart from the mirror, written in the
          copy; how its removal reaches the copy, any reset applied on the mirror and in the copy, a checkout holding
          the branch included; and the exact set of (condition, subject) pairs each `check` run expects, collateral
          pairs listed.
        - The test supplies the package's built CLI as every copied checkout's launcher, since a small temporary copy
          holds no package or build, and a `PATH` for `check` with no other `arc`; its checkouts have no `dist`, so the
          build rule changes nothing. It builds its copy with `copy`, the host port replaced by one whose discovery read
          answers none, so no test reads the host. Its identity's inbox starts with no file, so the run exercises the
          driver's plant, section included.
        - Build `test-first` (one behavior at a time), in the end-to-end tier over a small temporary copy with no host,
          as `__tests__/e2e/store-import-errands.e2e.test.ts` runs the real import:
            - A run whose steps all meet their expected outcomes passes
            - Preparation leaves every copied checkout clean and at its upstream, and every branch the driver changed
              equal locally and on the mirror
            - The first unexpected outcome stops the run, naming its step
            - A target outside the copy refuses

### `[ ]` **7.2 The first run — § 9.3**

- _Goal:_ Stage 1's first run, at the head that lands, shows each planted condition refusing and passing after its
  remedy, store-backed case 1 refusing with nothing landed, the import publishing to the mirror, the accounting case
  reporting exactly the backfill's files, and the abort restoring the copy and its mirror.

- _Note:_ the host's memory gate must report runs allowed; when it reports them blocked, stop and ask. Raw evidence
  stays in the work unit's runs folder outside the repository; the completion note states each conclusion and its
  commit. Any later change to the tools runs this again. See `notes-cutover-window-tooling.md` § Stage 1 driver.

    - Copy with the pre-meta backfill (`68bddbb526`) reverted on the copy's `main`, pushed to the mirror.
    - At step 5, plant and remedy the five conditions of § 9.3: a shared tracked-state change, an open pull request, an
      Errand, an unlocked marked checkout, and a diverging copy of an unheld live unit's branch, its mirror side fetched
      before the check. Every live unit's branch is held on today's repository, so the plant makes one: a new unit's
      meta committed on a new branch in the scratch clone, pushed to the mirror with its local copy set, then moved on
      both sides, the local side with `git commit-tree` and `git update-ref` and left in place by the sync after a
      fetch; Task 7.1.c's run plan lists any collateral pairs it causes.
    - Between steps 6 and 7, run store-backed case 1: a schema-valid `<A>.boundary.json` whose work unit names unit B,
      committed on live unit A's branch in the scratch clone and reaching A's holding checkout by the sync, since that
      checkout's local tip is A's read copy; expect the import to refuse with no `refs/arc/` ref differing from the
      hold, then reset the branch to its recorded tip on the mirror and in the copy, A's checkout included.
    - After step 7, confirm the store's refs reached the mirror. At step 10, expect the accounting case to report
      exactly the twenty pre-meta folders' files and `.arc/completed/2026-q1/completed-atomic-2026-q1.md`, listing
      `main`'s superseded copies apart.
    - After step 10, expect `close` to refuse; plant a commit in a copied checkout with `git commit-tree` and
      `git update-ref`, expect `recompute` to refuse naming it, run `restore`, and verify every recorded ref back on the
      copy and the mirror, every other `refs/arc/*` ref and unrecorded tracking ref gone, the registry ref absent in every
      copied checkout, and the hold deleted; then drop the planted commit.

### `[ ]` **7.3 The second run — § 9.4**

- _Goal:_ Stage 1's second run, at the head that lands, shows the aborted copy importing again with nothing unplaced,
  the last read guarding the merge, the restore refusing a merged flip, and the after-merge comparisons and close
  holding late changes.

- _Note:_ the import runs again under Task 7.2's memory-gate and evidence rules.

    - Use the aborted copy with the backfill restored on its `main`, pushed to the mirror; steps 1 to 10 pass.
    - Add a stand-in deletion commit and push it to the mirror; a commit planted on the mirror's `main` makes
      `last-read` refuse, and it passes once that `main` is put back.
    - Merge the stand-in branch into the mirror's `main` with `git merge --no-ff` from a separate clone; `restore`
      refuses, naming the merge.
    - Run `compare` for every live branch and copied checkout, with a commit planted on a live branch and a personal
      file edited in a copied checkout; then `close` refuses, naming each checkout that still tracks state and listing
      the range unconfirmed.

### `[ ]` **7.4 Stage 1 at the landing head** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds at the head that lands.

    - Confirm both runs ran at the current head, or run them again.
    - Record the import's wall time and peak resident memory from both runs.
    - Run `arc check segment` and record the scenario and its result.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Each quiesce refusal, C1 to C13, has a test showing it refuse with its subject named, its remedy applied, and
  the check pass, covering every case spec Success Criterion 1 enumerates; a refusing run leaves nothing under
  `refs/arc-window/`, and a run killed while recording leaves no completion marker.

- `[ ]` `recompute`, `last-read`, `compare`, `confirm`, and `close` have tests for every stop, mark, report, and refusal
  spec Success Criterion 2 enumerates, and `close` deletes the whole hold once all clear.

- `[ ]` `restore` has tests before and after publication against a local bare `origin` for every return, refusal,
  acceptance, and restart spec Success Criterion 3 enumerates.

- `[ ]` `lock` locks each unlocked marked checkout with the projection's reason and touches no other, and each
  copy-safety assertion stops the stage on a copy that violates it.

- `[ ]` `runUserLoad`, `arc user load`, and the user-sync load direction each refuse once the registry ref exists,
  writing no file and exiting non-zero with the refusal's condition and remedy, and load once it is gone.

- `[ ]` Stage 1's first run is clean at the head that lands, with every outcome spec Success Criterion 6 lists observed
  (Task 7.2).

- `[ ]` Stage 1's second run is clean at the head that lands, with every outcome spec Success Criterion 7 lists
  observed (Task 7.3).

- `[ ]` The import's wall time and peak resident memory under the cap are recorded from both runs (Task 7.4).

- `[ ]` The family lands inert: no package `files` entry, recipe entry, or bundle metafile input names it; no existing
  caller reads the provenance field and no existing constructor of the composition's result changed; and the full
  unit, integration, and end-to-end tiers pass with the load guard present.

- `[ ]` From the import to the merge, every record the import took equals what the check recorded and the merged head
  differs from the recorded flip head only by its deletion commit, proved by the comparison tests and by Stage 1's
  first-run abort and second-run last read (Tasks 5.1, 5.2, 7.2, 7.3).

- `[ ]` Between the check and the merge, `main` changes on the host only by the flip's merge and no live branch changes
  there, proved by Stage 1's second-run last read and stand-in merge (Task 7.3).

- `[ ]` No Errand record crosses the window, every claim crosses it or stops it, and an abort rewinds no record another
  writer added unseen, proved by Stage 1's planted Errand and retirement check and by the restore's tests
  (Tasks 2.3, 7.2).

- `[ ]` No live work unit's copy is dropped in favor of one it diverges from, proved by Stage 1's planted diverging copy
  (Task 7.2).

- `[ ]` A change to a live branch or personal file after the check, made before that branch's or checkout's `compare`,
  is never deleted unseen, proved by Stage 1's second run (Task 7.3).

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
