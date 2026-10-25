# Notes: storage-ref-backend

## Contents

- **Outcome**
    - [Outcome summary](#outcome-summary)
    - [Unreadable archive quarters](#unreadable-archive-quarters)
- **Design background**
    - [Prior art](#prior-art)
    - [Probes behind the design](#probes-behind-the-design)
    - [The first model check](#the-first-model-check)
    - [The second model check](#the-second-model-check)
    - [The move model check](#the-move-model-check)
    - [A designation per scope](#a-designation-per-scope)
    - [Host properties](#host-properties)
- **Amendment records**
    - [A2 — Review mapping identity and source accounting](#a2--review-mapping-identity-and-source-accounting)
    - [A3 — Backslashes in stored paths](#a3--backslashes-in-stored-paths)
    - [A4 — Retirement's logical check view](#a4--retirements-logical-check-view)
    - [A5 — Companion path length admission](#a5--companion-path-length-admission)
    - [A6 — Independent lineage format coordinates](#a6--independent-lineage-format-coordinates)
    - [A7 — Identity removal and expired project handles](#a7--identity-removal-and-expired-project-handles)
    - [A8 — Primary replacement and logical batch uniqueness](#a8--primary-replacement-and-logical-batch-uniqueness)
    - [A9 — Merge history uses the ordered record state](#a9--merge-history-uses-the-ordered-record-state)
    - [A10 — Companion aliases require the resolved slug](#a10--companion-aliases-require-the-resolved-slug)
    - [A11 — Forward repair cannot rewrite historical metadata](#a11--forward-repair-cannot-rewrite-historical-metadata)
    - [A12 — Commit-mode tests follow their public callers](#a12--commit-mode-tests-follow-their-public-callers)
    - [A13 — Empty fetches need a no-tip negotiation form that completes](#a13--empty-fetches-need-a-no-tip-negotiation-form-that-completes)
    - [A15 — A reftable fetch can report updates before its transaction aborts](#a15--a-reftable-fetch-can-report-updates-before-its-transaction-aborts)
    - [A16 — Retained conflicts need an actionable recovery path](#a16--retained-conflicts-need-an-actionable-recovery-path)
    - [A17 — Failed completeness does not certify a tracking tip](#a17--failed-completeness-does-not-certify-a-tracking-tip)
    - [A18 — Import verification against the shipped entry contracts](#a18--import-verification-against-the-shipped-entry-contracts)
    - [A20 — Current Candidates are separate mapping inputs](#a20--current-candidates-are-separate-mapping-inputs)
    - [A21 — Durable terminal former names belong to lookup alone](#a21--durable-terminal-former-names-belong-to-lookup-alone)
    - [A22 — Atomic native observation admission](#a22--atomic-native-observation-admission)
    - [A23 — Native creation facts after shared-contract landing](#a23--native-creation-facts-after-shared-contract-landing)
    - [A22 and A23 native closure](#a22-and-a23-native-closure)
    - [A24 — Identity-suffixed personal content paths](#a24--identity-suffixed-personal-content-paths)
    - [A25 — Retire the interim legacy ratio](#a25--retire-the-interim-legacy-ratio)
    - [A26 — bounded readers during writes](#a26--bounded-readers-during-writes)
    - [A27 — calibrated hosted Windows limits](#a27--calibrated-hosted-windows-limits)
    - [A28 — refused torn listings](#a28--refused-torn-listings)
    - [A29 — Per-change cost and selection of the store suites](#a29--per-change-cost-and-selection-of-the-store-suites)
    - [A30 — A move overtaken inside its switch](#a30--a-move-overtaken-inside-its-switch)
    - [A31 — A store directory taken away under a bound operation](#a31--a-store-directory-taken-away-under-a-bound-operation)
    - [A32 — A no-target run returns the report of the move it finishes](#a32--a-no-target-run-returns-the-report-of-the-move-it-finishes)
    - [A33 — The store suites by wall time and shard](#a33--the-store-suites-by-wall-time-and-shard)
    - [A36 — The separate layout's whole run by item range](#a36--the-separate-layouts-whole-run-by-item-range)
- **Segment and fixture closures**
    - [Moving-remote segment closure](#moving-remote-segment-closure)
    - [Native inbox contention](#native-inbox-contention)
    - [CI measurement preflight](#ci-measurement-preflight)
    - [Errand import E2E source](#errand-import-e2e-source)
    - [Personal raw-tree fixture closure](#personal-raw-tree-fixture-closure)
    - [Join synchronization fixture](#join-synchronization-fixture)
    - [Prepared fixture path encoding](#prepared-fixture-path-encoding)
    - [Full-run harness corrections](#full-run-harness-corrections)
- **Operation performance**
    - [Native operation timing](#native-operation-timing)
    - [Windows object batching](#windows-object-batching)
    - [Windows operation reader](#windows-operation-reader)
    - [Windows burst diagnostics](#windows-burst-diagnostics)
    - [Archived acquisition cost](#archived-acquisition-cost)
    - [Timing isolation](#timing-isolation)
    - [Shared native tree acquisition](#shared-native-tree-acquisition)
    - [Bounded hosted timing diagnostics](#bounded-hosted-timing-diagnostics)
    - [Attempt-local immutable write acquisition](#attempt-local-immutable-write-acquisition)
    - [Bounded publication continuation](#bounded-publication-continuation)
    - [Named archived acquisition](#named-archived-acquisition)
    - [Remaining writer acquisition reuse](#remaining-writer-acquisition-reuse)
    - [Platform coverage after acquisition corrections](#platform-coverage-after-acquisition-corrections)
    - [Hosted diagnostic and evidence identity](#hosted-diagnostic-and-evidence-identity)
    - [Final metadata batching](#final-metadata-batching)
    - [Scoped check-view acquisition](#scoped-check-view-acquisition)
    - [Budget calibration](#budget-calibration)
- **CI cost and platform results**
    - [CI cost history](#ci-cost-history)
    - [Conformance workload comparison](#conformance-workload-comparison)
    - [Second dispatched platform results](#second-dispatched-platform-results)
    - [Third dispatched platform results](#third-dispatched-platform-results)
    - [Post-correction tier and hosted measurements](#post-correction-tier-and-hosted-measurements)
    - [Dispatched platform results after acquisition corrections](#dispatched-platform-results-after-acquisition-corrections)
    - [Complete calibrated portability acceptance](#complete-calibrated-portability-acceptance)
    - [Corrected Linux CI and advisory cost](#corrected-linux-ci-and-advisory-cost)
    - [Final-head portability pair](#final-head-portability-pair)
    - [E2E cost investigation and follow-up disposition](#e2e-cost-investigation-and-follow-up-disposition)
- **Hosts, packing, and the cutover**
    - [Real-host owner probes](#real-host-owner-probes)
    - [Real-host backend trials](#real-host-backend-trials)
    - [Personal-path pack cost](#personal-path-pack-cost)
    - [Cutover suite inventory](#cutover-suite-inventory)
    - [Platform, host, and cost closure](#platform-host-and-cost-closure)

## Outcome summary

Final evidence for this work unit's verification-relevant obligations; each line names the section that holds it.

- **Conformance:** both native layouts complete 1,069 cases, 1,068 registered plus the declaration-inventory case,
  with 59 registered skips; the in-repo fixture completes 310 counted the same way. A25 replaced the interim
  1.5-times ratio with complete hosted cost and workload reporting (Final complete-file hosted conformance evidence;
  Complete conformance and Linux portability work).
- **Platforms:** dispatch `40003927279` at the delivered head passes the complete Windows/macOS pair — all twelve
  twenty-writer platform/case combinations and both layouts' eleven-sample Windows medians within A27's calibrated
  limits — beside every Linux job; dispatch `39664555792` first met those limits, and Linux dispatch `39674185052`
  passed every functional job after two harness corrections (Final-head portability pair; Complete calibrated
  portability acceptance; Corrected Linux CI and advisory cost).
- **Costs:** the store suites run by reach in their own merge-gate check, a change reaching none paying a 1.6 s reach
  computation; per change their summed time fell 30% to 1,840 s, and the integration tier's local row fell 60%, nearly
  all of it the store suites leaving. On CI they run across four shards that finish beside the integration shards, a
  full run's slowest at 420 s, and the updated tier and job rows include the store shards'; one earlier advisory E2E
  overrun stays recorded, not converted into a pass (A29, Measured after the work; A33, Measured; A36; E2E cost
  investigation and follow-up disposition).
- **Hosts:** seven of eight real hosts pass every native observation, meeting the GitHub/GitLab floor; Azure DevOps
  lacks protocol v2 prefix narrowing and atomic receive, a documented limitation with no non-atomic fallback
  (Real-host backend trials).
- **Packing and the cutover:** the pack trial grounds A24's identity-suffixed personal paths, and the cutover suite
  inventory classifies every suite as preserved, retired, or split (Personal-path pack cost; Cutover suite inventory).
- **Unreadable archive quarters:** an ended item refuses, and a pull holds its history merge, while a quarter or its
  folder cannot be read; the pull's lifecycle decisions over such a quarter remain a known limit (Unreadable archive
  quarters).

## Prior art

One external pass on 2026-10-10, three facets, from fetched sources without further verification. Claims marked
_unverified_ rest on the researchers' memory; check them before a decision rests on them.

- **State tokens.** CouchDB's clustered `_changes` sequence encodes every shard's position and replays on a stale
  `since`, so its consumers stay idempotent. Cosmos DB continuation tokens and MongoDB resume tokens die with the log
  behind them, as etcd's compacted revisions do. etcd's revision and Datomic's `t` need one writer. A Flink checkpoint
  and a `jj` view record every source's position as one object; Dolt's root hash names the whole store but needs every
  writer to move one root (_unverified_); reftable's `update_index` is local to one repository (_unverified_ that it
  never transfers).
- **Record versions.** Kubernetes' `resourceVersion` changes on every modification, `generation` only with desired
  state. Cloud Storage's `metageneration` moves with metadata and resets with each `generation`, and its documentation
  pairs a metageneration precondition with a generation one. S3's ETag reflects contents only; Azure's moves on any
  write, metadata included (_unverified_ for the ETag itself). CouchDB's `_rev` hashes the body with its predecessor
  (_unverified_).
- **Git refs as a database.** git-bug — one ref per entity, refspecs in memory, operations ordered by Lamport clock, a
  disposable excerpt cache. Gerrit NoteDb — compare-and-swap as the only atomic operation, `BatchRefUpdate`, sequence
  blocks, and a restartable one-time migration. git-annex — a private index and union merge. `jj` — `refs/jj/keep/*`
  pins against garbage collection.
- **Sync and lifecycle idioms** (from memory, _unverified_): Fossil's `sync` runs a pull and a push, as editors' "Sync
  Changes" does, while Git, Dolt, and git-bug name the two directions `pull` and `push`; jj marks a bookmark that moved
  on both sides conflicted after a fetch; CouchDB deletes by writing a `_deleted` revision; Gerrit deletes refs through
  `BatchRefUpdate` with an expected old id and numbers changes on its server; offline-first stores replace a temporary
  ID at sync; retries back off exponentially with jitter. Git's refspec rule — no update but a fast-forward without
  `+` — and `--force-with-lease` are its documented behavior.
- **Remote designation:** `git remote rename` and `git remote remove` were tested on Git 2.55 in a scratch repository;
  Git's own per-remote keys are read from `git help -c`; the `gh-resolved` key was found in the `gh` binary;
  git-annex's per-remote `annex-*` keys are from memory, _unverified_.
- **Sources:** kubernetes.io/docs/reference/using-api/api-concepts; the Kubernetes API conventions
  (github.com/kubernetes/community, `api-conventions.md`); docs.cloud.google.com/storage/docs/metadata and
  …/request-preconditions; docs.aws.amazon.com/AmazonS3/latest/API/API_Object.html and
  …/userguide/conditional-writes.html; learn.microsoft.com/en-us/rest/api/storageservices/set-blob-metadata;
  docs.couchdb.org/en/stable/api/database/changes.html and …/replication/conflicts.html;
  learn.microsoft.com/en-us/azure/cosmos-db/nosql/change-feed-pull-model; mongodb.com/docs/manual/changeStreams;
  etcd.io/docs/v3.5/learning/api; docs.datomic.com/reference/log.html; docs.jj-vcs.dev/latest/technical/concurrency;
  git-scm.com/docs/reftable; the Flink stateful stream processing concepts; git-bug's `doc/design/data-model.md` and
  `architecture.md`; Gerrit commits `577e8fc66c`, `66ea2ed46e`, `05eaefe36d`, `029d2568393f`, and its `note-db.html`;
  git-annex.branchable.com/internals; git-scm.com/docs/git-push, git-fetch, git-update-ref, and git-maintenance; and
  github.com/git/git, `pack-objects.h`.

## Probes behind the design

Scratch probes on Git 2.55 (2026-10-10), beyond the figures the spec cites.

- **Torn reads.** A writer moved `refs/arc/work/a` and `refs/arc/project/inbox` together in one `update-ref --stdin`
  transaction while a reader listed both with one `for-each-ref` and counted listings that disagreed. The files format
  tore with one pattern, `refs/arc/`, in 24 of 11,288 listings and with two in 659 of 11,263; reftable tore in none of
  11,303 with one pattern, none of 11,015 with one pattern and `--exclude=refs/arc/history/`, and 81 of 11,221 with
  two, since `for-each-ref` reads one snapshot per pattern.
- **A long-lived reader sees later objects.** A `cat-file --batch-check` started before them found loose objects
  written later, newly packed ones, and every object after `gc` had replaced each pack (Linux). This is the question a
  long-lived reader would raise if a measured command ever calls for one.
- **Delta-search names.** Git's default pack name hash reads a path's last sixteen characters, and its opt-in second
  version mixes in the path's directories (`pack_name_hash` and `pack_name_hash_v2` in `pack-objects.h`). So a person's
  fixed-name files hash alike across people: `andrew/WORKING-MEMORY.md` exactly, `andrew/USER-INBOX.md` but for the
  id's last two letters. The pack-cost measurement compares today's names with names ending in the person's id.

## The first model check

An exhaustive breadth-first search (2026-10-10) over one work item's states on two and three machines and a remote —
writes, writes to the completed item, archive, abandon, reopen, pull, push, and a mirror push that deletes every state
ref or only the history ref — checking that the remote never holds the item live and ended, ended twice, or live beside
its end record, that no write is lost, and that repeated pulls and pushes settle. A ref's value is its set of commits,
ancestry a subset and a merge a union, so it checks the rules, not Git.

The rules as first written failed four ways, each now a rule and an integration case:

- an unleased live-ref push recreating a ref another machine's end deleted;
- two clones each reopening and ending an item between pushes, which publish only history-ref updates, so no live ref
  prunes;
- a clone's own end folded into another machine's published reopen;
- a history-ref create that lost to a restored ref, never fetched by name, so the push loop spun to its deadline.

With those rules, two machines explore clean in full and three clean to 1.5 million states. After a mirror push,
machines restore differing copies: a stale ancestor read as divergence until the ancestry rule took it as a loss, a
stale copy with its own pushes still diverges, and two ends both published read as two. No case lost a write.

## The second model check

A second round (2026-10-12) extended the first model with another worktree's fetch moving the shared tracking refs, one
lineage path per item, per-ref pull batches, and an old remote that becomes unreadable after a move's switch, and added
a designation model and a property test of `history`'s order. Two clones, one item, one remote, budgets two to four;
every fold on, the first model's own bound reran clean over 6.5 million states. Each finding is now a rule and an
integration case, the shortest failing prefix being the case's script where one is given:

- **A delete under a moved tracking tip** (§ 6.7 step 3): a delete has no local tip to descend from, so it pushes nothing
  and the loop repeats, as for a lost race. With another worktree's fetch: `A.write B.lineage B.push A.pull B.remove
  B.push A.fetch A.push`.
- **The reopen reading** (§ 6.4): another worktree's by-name fetch moves the history tracking ref before this worktree's
  pull, so whether a live ref is this clone's own reopen, and whether an end is past it, are read from the clone's own
  live ref. A clone that never reopened then ignored a published abandon: `A.abandon A.push B.fetch`.
- **This clone's own unpublished end** (§§ 6.4–6.6): an end this clone made whose record it still holds and no tracking
  ref of the item reaches. Reading it from the history tracking ref alone published a live ref's delete with no end
  record: `A.archive A.push A.reopen B.write B.pull`, and `A.archive A.push A.reopen B.archive B.pull`.
- **Two abandons, and lineage first** (§ 6.6): without the withdrawal rule, a withdrawn lineage publishes and a history
  ref stands with no end record.
- **`history`'s order** (§ 3.6): 20,000 random two- and three-clone graphs pass the rule, while following first parents
  only, or comparing a merge with its first parent alone, fails.
- **The pointer read at a designation** (§ 9.4): it applies wherever no `backing` carries `push`, so a fresh clone of a
  project whose state lives in a backing repository cannot publish it onto the code remote. A checkout whose pointer
  predates the backing repository reads none and can still do so: a named residual, every such state with a route back.
- **The `backing` repoint** (§ 9.4), for a clone whose old backing repository went before any forwarding record reached
  it: keeping its tracking refs failed eleven ways (`A.mv3 B.archive B.push O.GONE`), and replacing them with the new
  URL's tips lost a reopen's owed delete (`A.archive A.push A.mv3 B.pull B.reopen O.GONE`). Copying its last view of the
  old repository onto the new one, as a follow copies its listing, closes all but one residual: an interrupted move's
  rerun reading the old repository in the instant before its deletion while a repointed teammate publishes a competing
  end. Closing that changes § 10.4's copy rule, which needs its own modeling round.

## The move model check

A third model (2026-10-13) ran several clones moving one project's state among up to three remotes, and a fork that
copies one remote once outside ARC; each clone may write, pull, push, move, follow, be killed between any two steps,
and rerun from its record. Every delete must land on a remote carrying a forwarding record and never destroy a ref's
only copy; from every reachable state, finishing each step and rerunning each record must leave every clone on one
remote holding every write, with no other remote holding state but beside a forwarding record. Each rule below is now
an integration case of § 14.7:

- **A rerun meeting a move back** (§ 10.3): A moves O to K and is killed in step 4; B follows and moves the state back to
  O, its copy deleting A's record there. A's rerun read O's missing record as "before step 3" and sent every clone to K.
  Step 3's license also reads the old remote's registry, which a move back's copy carries this move's commit onto.
- **The record before the copy** (§ 10.3): a move back killed between its copy and its record left no record anywhere,
  splitting the clones that had followed from those that had not.
- **Forward, then switch** (§ 10.3): two clones moving off one remote at once each switched before either forwarding
  record landed, one ending alone. The switch is licensed by a read showing this move's own record.
- **The follow judges by the record it fetches** (§ 10.6): a follow run without a pull judged candidates by a stale
  tracking record, so a fork that copied the registry between two moves passed as the state's home.
- **The registry as each remote's move version** (§ 10.3): license reads and the writes they license could be split by
  another move's write. The forwarding record's push lands a registry commit leased on the tip step 1 read, a copy or
  forward losing its lease runs again from step 1, and a move's own commit on its old remote means a move back only once
  the new remote carries a forwarding record.
- **A move ended before its switch** (§ 10.3): with three clones, one never pulling, a move back ended by another
  clone's record stranded that clone on a copy with no record. The ended move puts the record that ended it wherever its
  copy deleted one.
- **A copy deletes only records from its own line of moves** (§ 10.2): a rerun's copy deleted a newer move's record at
  its destination, splitting the two movers.
- **Gone remotes** (§ 10.6): `--leave-source` ends a record on either side of its switch, and each delete round reads
  the new remote first, so a destination deleted mid-move never has the old remote emptied after it.
- **A named residual:** deleting a remote while two moves run onto or off it can split clones, since the deleted remote
  held the only record of which move won. Closing it would keep a registry ref on every remote the state leaves.

Configurations reached up to 16 million states each, with two and three clones, kills, a fork, and remote deletion.
Not modeled, and left to the integration cases over real Git: layout moves, the project check, a pointer naming one
backing repository, several worktrees of one clone, per-ref leases, and the push loop's own pull.

## CI cost history

The in-repo conformance run took about 34 s on the retired self-hosted pool, where `storage-contract`'s 59 integration
files added about 131 s to every full run, the integration job rising from about 354 s to 495 s. The ref fixture's
budget is measured afresh on GitHub-hosted runners, against the in-repo conformance's time on the same runner.

### Before the ref backend's test files

The local capture starts at `8c705b1fcd47dff8ef957cd27ff95d3141a1ebce`, before this change adds or modifies a test
file. Its source and test trees match the branch base, `c45c3e90876fd2ad6f83945dcff368d7f4420aae`. The machine runs
Linux 5.15.167.4-microsoft-standard-WSL2, x86_64, Node 26.3.0, and Git 2.55.0. Each tier uses the budget record's
`tier-isolated` condition and `12` workers, captured sequentially with one discarded warm-up and one retained pass.
Normalization is `single-run`, not a median of repeated samples.

From the repository root, the capture and normalization commands are:

```sh
npm run benchmark:test-cost -w packages/arc-framework -- \
  --condition tier-isolated --project-set <tier> --workers 12 --output <raw-path>
npm run -s benchmark:test-cost:normalize -w packages/arc-framework -- <raw-path>
```

The retained schema-5 runs, normalized reports, command summaries, and CI source evidence are machine-local under
`.arc/user/andrew/.internal/storage-ref-backend-tools/test-cost-baseline/`. The figures below are measured baselines;
`test-cost-budgets.json` stays unchanged. Budget overruns already present here are advisory, not costs attributed to
the ref backend.

| Local tier  | Wall clock (ms) | Files | Completed tests | Existing budget (ms) |
| ----------- | --------------- | ----- | --------------- | -------------------- |
| unit        | 20,060          | 985   | 15,835          | 19,794               |
| integration | 207,312         | 353   | 3,781           | 225,803              |
| lane        | 228,129         | 1,338 | 19,616          | 245,764              |

**CI source correction, approved 2026-10-16:** Task 1.1's planned source, the latest `main` run at the base, has no
test-cost figures: run `38858690329` classified the archive-only commit as `light`, `docs-only`, and skipped the test
jobs. Moreover, the integration job's event condition in `.github/workflows/ci.yml` excludes pushes; it runs on
reviewed pull requests, dispatch, and schedule. The baseline therefore uses the most recent executed `main` unit
jobs and the preceding successful reviewed pull request's integration jobs, with the provenance below. This changes
the measurement source, retaining the requirement to baseline every affected row before the first test file lands.

- **Unit:** run `38857807800`, `main` commit `5eed73b803a353faa2fa68f0b7cad0843e3f25a5`; its source, tests, and CI
  workflow match the branch base's. The base's intervening change archives the preceding work unit.
- **Integration:** run `38856961515`, pull-request head `695b90b105c375437c00aef020aaf771eaa9d5d4`, actually tested
  merge `826c41d2ae88a4c31365021338d727b8a0f4eca0`, recorded by its checkout logs. Its integration test sources match
  the base's. The code/test difference is the unrelated `local-prepare.ts` correction (+2/-1 lines) and
  `local-prepare.test.ts` (+11 lines, one test and one assertion); the remaining differences are ARC documents.
  These are pre-change CI observations, not an exact-base execution or a new hosted conformance comparison.

The CI values are `report-test-budget.ts`'s emitted `actualMs`, measured from the job's budget clock through its
report step, not GitHub's enclosing job duration. Their mode is `ci-job`, `native`, metric `job-elapsed-ms`.

| CI job        | Elapsed (ms) | Existing budget (ms) | Run         |
| ------------- | ------------ | -------------------- | ----------- |
| unit-1        | 44,529       | 74,250               | 38857807800 |
| unit-2        | 56,026       | 70,200               | 38857807800 |
| integration-1 | 342,527      | 294,300              | 38856961515 |
| integration-2 | 241,419      | 288,900              | 38856961515 |
| integration-3 | 255,172      | 240,300              | 38856961515 |
| integration-4 | 281,215      | 264,600              | 38856961515 |

### Final complete-file hosted conformance evidence (A25)

Dispatched run `39543872100` tested `0908ff6d95e252c0717d382351bffd7fff39f9a9` on GitHub-hosted runners. All four
integration shards completed successfully. Their duration artifacts and native logs retain the following complete
file times and populations. Each shard is a separate hosted job; the three files did not run sequentially on one
machine.

| Backend  | Integration shard | File time (ms) | Completed cases | Registered skips |
| -------- | ----------------- | -------------- | --------------- | ---------------- |
| in-repo  | 3                 | 125,227.857    | 310             | 736              |
| default  | 2                 | 899,378.179    | 1,069           | 59               |
| separate | 1                 | 594,297.154    | 1,069           | 59               |

The retained registration inventory finds 278 shared active assertion IDs, 790 native-only IDs, and 31 in-repo-only
IDs, excluding each suite's declaration-inventory case. Both native layouts retain the same active population. Their
additional workload includes merge, format, retained-history, write-check, and per-kind synchronization behavior the
in-repo fixture excludes. Counts alone do not provide a per-behavior speed comparison. A25 requires these complete
costs without an interim legacy ratio; all required native cases remain, and no matched-cohort hosted mechanism was
added. The earlier ratio misses remain failed historical results.

Native logs, integration duration artifacts, population evidence, and derived complete-file figures are retained
under `task-18.3-hosted/third-run/` in the machine-local storage-ref-backend tools directory. This evidence closes the
complete-file reporting obligation. Windows operation acceptance, final tier/job measurements, and host checks closed
separately: see Complete calibrated portability acceptance, Post-correction tier and hosted measurements, and Real-host
backend trials.

### Final tier and job measurements (A25)

The final capture uses source and tests at `0908ff6d95e252c0717d382351bffd7fff39f9a9`. The subsequent hosted-conformance
recording commit changes only the task list and these notes. Hosted job figures come from dispatch `39543872100`.

The local capture repeats the baseline procedure on the same WSL2 host: sequential tiers, twelve workers, one discarded
warm-up followed by one retained run, with `single-run` normalization. The supported controller records admission waits
separately and subtracts them from `wallClockMs`; the table uses that retained wall clock, not total command latency. It
includes selected execution and its controller overhead. Summed per-file work is a different metric and is not used as
elapsed wall time.

| Local tier  | Before (ms) | Final (ms) | Delta              | Registered files | Completed cases | Updated budget (ms) |
| ----------- | ----------- | ---------- | ------------------ | ---------------- | --------------- | ------------------- |
| unit        | 20,060      | 28,882     | +8,822 (+44.0%)    | 1,306            | 18,956          | 38,991              |
| integration | 207,312     | 746,818    | +539,506 (+260.2%) | 584              | 8,060           | 1,008,205           |
| lane        | 228,129     | 768,361    | +540,232 (+236.8%) | 1,890            | 27,016          | 1,037,288           |
| e2e         | unavailable | 322,266    | unavailable        | 126              | 1,223           | 435,060             |

Task 1.1 retained no fresh local E2E baseline; its older tracked 147,402 ms advisory baseline is not a before-WU
measurement. The final E2E row is updated from its successful retained run without inventing that missing delta. Base
merges also increased the suite population, so the measured differences are branch-level changes, not an attribution of
every additional millisecond to the native backend.

The hosted rows use `report-test-budget.ts`'s `actualMs`: the budget clock through its report step, including job setup
after that clock starts. They exclude pre-job queue latency and differ from both raw file execution and GitHub's
enclosing job duration. The before sources are the approved Task 1.1 observations: main run `38857807800` for unit and
reviewed-PR run `38856961515` for integration/E2E, with the tested merge provenance recorded above. All ten functional
jobs passed. Nine exceeded their old advisory rows; those overruns remain in the source reports. The updated rows set
each baseline to the final measurement and retain the existing 35% allowance, rounded upward.

| CI job        | Before (ms) | Final job clock (ms) | Delta              | Updated budget (ms) |
| ------------- | ----------- | -------------------- | ------------------ | ------------------- |
| unit-1        | 44,529      | 91,652               | +47,123 (+105.8%)  | 123,731             |
| unit-2        | 56,026      | 92,728               | +36,702 (+65.5%)   | 125,183             |
| integration-1 | 342,527     | 668,471              | +325,944 (+95.2%)  | 902,436             |
| integration-2 | 241,419     | 973,958              | +732,539 (+303.4%) | 1,314,844           |
| integration-3 | 255,172     | 849,496              | +594,324 (+232.9%) | 1,146,820           |
| integration-4 | 281,215     | 524,325              | +243,110 (+86.4%)  | 707,839             |
| e2e-1         | 299,785     | 270,008              | -29,777 (-9.9%)    | 364,511             |
| e2e-2         | 344,698     | 312,426              | -32,272 (-9.4%)    | 421,776             |
| e2e-3         | 332,821     | 281,015              | -51,806 (-15.6%)   | 379,371             |
| e2e-4         | 227,441     | 484,082              | +256,641 (+112.8%) | 653,511             |

The Linux portability duration artifact records `store-ref-directory.test.ts` at 2,292.140 ms and
`store-ref-separate-conformance.test.ts` at 499,845.333 ms: 502,137.473 ms of summed file work for the two added
separate-layout files. This is measured work within a concurrent job, not a counterfactual additive job-wall cost. Other
native resource coverage adds these measured file times: batch reader 1,983.811 ms, archived acquisition 4,237.524 ms,
reader lifetime 3,623.676 ms, timing-isolation witness 5,339.322 ms, and write batching 2,187.119 ms. The full separate
conformance file remains selected in both integration and portability. Bursts and operation timing remain
dispatch/schedule-only under `ARC_STORE_BURSTS`; they are not added to ordinary per-change portability cost.

Raw schema-5 local captures, normalized reports, and full invocation logs are retained under `task-18.3-final-tree/` in
the machine-local storage-ref-backend tools directory. Hosted logs, duration artifacts, job-clock records, population
evidence, and derived tables are retained under `task-18.3-hosted/third-run/` there.

### Early local conformance comparison

Task 9.6 ran each complete conformance file once, sequentially on the same WSL2 machine, using `npm run test:file`.
The file times below are Vitest's single-file execution times, excluding transformation, imports, and controller
preparation. The in-repo fixture completes fewer cases because of its declared interim exclusions.

| Backend  | File time (s) | Completed cases | Named skips | Ratio to in-repo |
| -------- | ------------- | --------------- | ----------- | ---------------- |
| in-repo  | 43.58         | 308             | 696         | 1.00             |
| default  | 202.01        | 1,028           | 58          | 4.64             |
| separate | 217.62        | 1,028           | 58          | 4.99             |

Both ref layouts pass their applicable assertions with only § 14.1's permanent exclusions and the suite's own mechanism
applicability skips. Both local timing comparisons exceed 1.5 times. These local results did not establish § 14.12's CI
bound; the hosted comparison missed it too, and A25 replaced that ratio with complete cost reporting. Raw logs, elapsed
command times, and derived file-time ratios are retained under
`.arc/user/andrew/.internal/storage-ref-backend-tools/task-9.6/`.

## A designation per scope

Where personal state publishes stays with the backend; a designation per scope is a deferred follow-on, never
precluded. The principled form: the project's remote is the project's call, and the person's — the code remote by
default, a remote of their own, or none — is theirs. How private it can be is the hard part. Kept in the code
repository's refs, personal refs share a transaction with project refs — starting an Errand from a personal inbox entry
is one batch across both — but a mirror push still publishes them; moved to a separate Git directory, they are private
by construction, and that batch spans two directories that cannot commit atomically. The backend composes its push set
by scope, so the designation lands additively. The follow-on likely belongs beside `config-storage-architecture`, which
owns user-scope configuration; its tripwire is a person asking to keep personal state off a shared remote.

## A2 — Review mapping identity and source accounting

Folded the capture “Give the review mapping's port each Errand's claim ID, and fix its listing's source encodings”
into § 10.8, § 14.7, Success Criterion 14, and Task 15.R. This is the import port's own contract; the mapping's
implementation stays outside this work unit. The design amendment is determinate and local: retain the existing
claim identity and make the source units explicit before the port is built.

Superseded input row:

```ts
workItems: { slug: string; kind: "work-unit" | "errand"; uid: string; live: boolean }[];
```

Superseded source-accounting sentence:

> A source the listing does not account for exactly once — each gate file by its path, and each Candidate version
> and boundary by its tracked path, a version's with its commit — is listed in `notices` and refuses the import.

`TransientIdentityRecordSchema` retains `claimId`, and `mintClaimId` generates it from random bytes
(`lib/errand/identity-record.ts`); the review gate uses it as `lineage.vehicleIdentity`
(`scripts/review-gate/status-errand.ts`). It is therefore an input to the old-to-new identity join, not the new
store UID. Gate sources use Git-common-relative paths; a trailing slash distinguishes folder coverage from a file
identity, so the import can enforce completeness without reading review record shapes. Candidate source identities
retain both tracked path and commit. Task 15.10 closes the amendment through its import scenario after Task 15.R.

## Host properties

The raw-Git manual kit, `packages/arc-framework/__tests__/benchmarks/ref-host-properties.ts`, ran over HTTPS on
2026-10-16 with Git 2.55.0. Each private scratch repository held two state refs, `refs/arc/host-probe/a` and
`refs/arc/host-probe/b`, and an unrelated `refs/heads/main`. With protocol v2 forced, one fetch refspec,
`+refs/arc/*:refs/arc/probe-tracking/*`, sent only `ref-prefix refs/arc/`; each server advertised exactly those two
state refs and omitted `main`. Each receiver advertised `atomic`, and its three-ref atomic push succeeded.

- **GitHub:** 18:34:39 UTC; `https://github.com/andrewRCr/arc-ref-host-probe-20261016`.
- **GitLab:** 18:34:42 UTC; `https://gitlab.com/andrewRCr/arc-ref-host-probe-20261016`.

The packet evidence on both hosts includes `fetch< version 2`, `fetch> ref-prefix refs/arc/`, and exactly two
`fetch< <oid> refs/arc/host-probe/...` advertisement rows. GitHub's receive capability row contains
`report-status-v2 delete-refs side-band-64k ofs-delta atomic`; GitLab's contains
`report-status-v2 delete-refs side-band-64k quiet atomic ofs-delta`. The full packet traces and machine-readable
results are retained under `.arc/user/andrew/.internal/storage-ref-backend-tools/task-2.5/{github,gitlab}/`.

Run one host with `node --import tsx packages/arc-framework/__tests__/benchmarks/ref-host-properties.ts <host>
<scratch-https-url> <evidence-directory>`. Authentication uses the existing `gh` or `glab` credential helper per
invocation, with no credential in the URL or repository configuration and no HTTP-header tracing. The kit leaves
remote probe refs for inspection, removes its local temporary repositories, and stays outside test tiers and CI.
A repeat observes the old tips and leases every update; its seed commit descends from the previous `main` tip so
GitLab's default branch protection accepts the retry. A scratch repository with any other ref requires a fresh one.

## A3 — Backslashes in stored paths

The superseded § 11.6 claim said: “`-z` since without it Git quotes a path holding a non-ASCII byte, `"`, or `\`,
which a personal document's `path` may”. `validateManagedPath` explicitly rejects backslashes, and `RecordReferenceSchema`
uses it for personal document and companion path keys. The real-Git read test exposed that conflict in both ref formats.

The correction preserves admission: valid Unicode and quote paths return records; a stored backslash path returns a
`malformed` diagnostic under its exact name, without hiding valid records. Raw NUL-framed enumeration still retains
every path. No canonical path rule, write admission, or projection boundary changes.

## A4 — Retirement's logical check view

The approved outcome admits same-batch inbound settlement before the automatic sweep. The original § 7.4 put guard
said: “one that puts any other record of it and leaves it no primary refuses `record-malformed`”. Its final-state
wording also caught an inbound put clearing the list in the batch creating terminal lineage, so the ordering change
alone did not realize the approved outcome.

A4 makes that narrow exception explicit: `checkLineageRecord` observes the prepared list through `after`, and
`observeInboundHeld` admits a list containing no entry parts. The inbound grammar remains required for a put. The
admitted inbound cleanup is then swept with the origin; other origin-record puts still refuse. Explicit inbound
removal already avoids the put guard. The amendment's arm records the exception to the general put restriction; its
criterion and revalidation target remain unchanged. Task 6.R covers both admission and the exception's boundary.

## A5 — Companion path length admission

The superseded § 3.2 clause exempted “a `path` key, a personal document's or a companion's”, while § 5.6's table
exempted only “a personal document's `path` key”. Task 5.1 implemented the latter: `hasUnsafeStoredPath` refuses a
2,041-byte companion key even when `expandStoredPath` stores it verbatim and its longest segment is 2,033 bytes.

The exemption now follows the encoding. `expandStoredPath` uses `isSlugSafe` to distinguish combined companion
names from verbatim paths. Combined names retain the 2,040-byte key bound, because a later rename combines them
with another slug of up to 2,040 bytes. Verbatim paths do not gain a slug and use the existing 4,096-byte segment
bound, as personal document paths do. Task 5.R corrects the guard and tests both forms; the local-engine verifier
closes the covering revalidation. The import continues to call the same exported guard.

## A6 — Independent lineage format coordinates

The superseded § 3.3 field described each record's format version as “keyed by kind and key”. A lineage transition
has no within-owner key, while all origins share the registry ref. `decodeRecord`, `staleMutations`, and
`applyMutation` use canonical kind/key coordinates, so their singleton transitions share one format entry. A
real-Git probe through `createRefStore`, with two production-schema transitions at format 2, removed the first
origin and observed the second fall to format 1 with unchanged content and a changed record version.

The format coordinate adds `ownerUid` only for `lineage/transition`, using its resolved origin UID. Other kinds'
existing coordinates already distinguish records within their containing ref. Reads, stale admission, puts,
removals, and fault planting must agree; subsequent history, changes, merge, and import paths retain that rule.
This changes unpublished development encoding in place and adds no compatibility reader or migration. Task 5.R2
covers independent origins, and Task 8.6 repeats its matrix over both layouts.

## A7 — Identity removal and expired project handles

The superseded generic removal expectation in `registerRecordAssertions` reads through the removed record's
reference and expects “`code: "not-found"`”. For the ref backend, § 3.2 binds that reference's UID only while the
identity record exists. `admitProjectReference` therefore refuses the expired UID with `identity-mismatch`; changing
that refusal would weaken project isolation.

The shared case will instead read through the original fixture handle for `project-registry/identity` alone. The
fixture supplies that handle without a UID, so the read asks whether identity exists rather than asserting that the
expired ID remains current. `canonicalReference` resolves that original handle in the reference fixture as well.
The removal's no-version result and successful recreation checks remain. A dedicated real-Git regression checks both
handles, and Task 8.6 repeats it over both layouts. No additional conformance exclusion is introduced.

## A8 — Primary replacement and logical batch uniqueness

Task 6.6's derivation asked for a new-role put expecting absence beside an old-role removal. `sameReference`
(`lib/store/identity.ts`) treats the two primary roles on one UID as one record; `BatchInputSchema` and
`BatchResultSchema` (`lib/store/write.ts`) reject duplicate logical records. The reference backend's `recordKey`
(`__tests__/helpers/store/model.ts`) stores both roles in that same primary slot, and its `stale` and
`checkPreparedWrites` admit replacement against the existing primary's version and check each kind separately.
The failed real-Git probe reached the shared duplicate-mutation refusal before backend admission.

The design holds: § 5.2 already requires both primary roles absent for an absent expectation, and § 5.3 already
requires replacement checks. The task arm corrects the derivation to one version-bound put; it changes no shared
schema or specification behavior. Task 6.6.R covers both directions, duplicate and absent refusals, preservation,
and check refusal followed by repair. Its grounding-only author check traced those schema, identity, reference
write, and check paths; reader independence and binding completeness hold over this bounded correction. No new
segment, public API, or later task depends on accepting duplicate role mutations.

## A9 — Merge history uses the ordered record state

The first `changes` probes exposed a missing part of § 3.6 in `readRefHistoryDetails` (`lib/store/ref/history.ts`).
`orderHistoryCommits` places the local branch before the remote branch, but the entry filter compared every result
with its first parent. A remote-kept merge consequently repeated the remote version; a local-kept merge omitted
its result and left the remote version newest. Both failures were reproduced with commits made by the real write
path, joined by a two-parent commit over the retained producer tree.

The task arm preserves the specification: merge results compare with the preceding ordered entry, while ordinary
commits compare with their parent. Task 7.2.R closes that correction before `changes` reuses the history behavior;
the later real-pull cases still test the complete integration. Grounding-only author review traced the graph order,
entry filter, and stale-base consumer in `mergeRefMutation`; reader independence and binding completeness hold over
this correction, which changes no interface or design decision.

## A10 — Companion aliases require the resolved slug

The superseded § 5.1 step 1 said “and § 3.2's key rule, then the serialization rules on every put”, placing every key
check before owner resolution. `storedKeyProblem` calls `aliasProblem`, whose `decodeStoredReference` interprets a root
path against its owner's slug. `extra-alpha.md` aliases companion key `extra` under `alpha`, but is a valid literal key
after that owner renames to `beta`. Its UID and former-name operands can still carry `alpha` as a hint. The real-Git
cases in Task 7.4 retain that literal path across reads, saved reads, history, changes, and writes.

Unit feedback exposed the conflicting no-I/O expectation in `ref-key-admission.test.ts`: its fixed-form matrix also held
the generic `extra-alpha.md` alias. The ordering correction moves that one decision after owner binding, while keeping
fixed role forms, storage coordinates, control keys, and personal exclusions pure. `checkRefKey` and `storedKeyProblem`
remain the shared guard; resolved callers retain complete alias admission. Reuse `decodeStoredReference`'s registered
path classification for fixed forms, preserving canonical companion names and paired-spec keys rather than banning all
paths with a managed-looking prefix. No encoding, public API, or conformance exclusion changes.

The footprint is determinate. Grounding-only author review traced `decodeStoredReference`, `checkRefKey`,
`storedKeyProblem`, `readRefRecord`, `readUidRefRecord`, `historyRefRecord`, `changesRefRecords`, `readView`,
`batchRefRecords`, and `checkMutationReferences`. Stable preflight guards and resolved-owner checks remain separate call
sites; `checkSerializationRules` retains its byte, secret, and path guards before I/O. The already-completed Task 5.2.a
gets a forward amendment marker. Task 7.4.R records early fixed-form refusal, true-alias atomic refusal and corrected
retry, and valid older-name hints; Task 8.6 repeats them in both layouts. The import's build continues to owe canonical-
owner admission through its existing tasks. Criterion 20 makes the ordering observable without requiring planning
history, and the task/criterion mapping retains every existing key restriction.

## A11 — Forward repair cannot rewrite historical metadata

Task 7.5's superseded recovery promise was “the forward repair restores every read”; § 3.3 gave metadata repair as the
single remedy for both malformed metadata and unavailable trees. `readRefHistoryDetails` includes ancestors and their
parents, `readHistorySnapshots` decodes each with its own metadata, and `changeWindowReferences` plus `historicalState`
likewise require the historical coordinate. A forward commit preserves the malformed ancestor. Substituting metadata
would fabricate the version that § 3.4 binds to that historical record; dropping the commit would conceal changes.

The Owner delegated within-intent amendments for the deferred range. This determinate correction keeps immutable
history, truthful failure, per-item containment, and successful current-state repair. Current operations recover;
queries requiring malformed historical states refuse and explain the remaining limit, while a changes interval after
repair succeeds. Missing objects are a separate failure: restore or fetch the exact object before historical recovery.
Saved-state reads stay pinned. Task 7.5.R verifies those boundaries and Task 8.6 repeats them in both layouts.

Author grounding traced `historyRefRecord`, `readRefHistoryDetails`, `readHistorySnapshots`, `historicalState`,
`captureChangeWindow`, `changeWindowReferences`, `readUidRefRecord`, and `readRefTrees`. The amendment adds no schema,
encoding, inferred version, compatibility layer, or history rewrite. Its footprint is § 3.3's repair contract, the
broken-item verification, Task 7.5's recovery derivation, and the both-layout replay; earlier successful history cases
remain unaffected. Grounding-only task audit and reader-independence/binding-completeness review found no additional
contract needed in this bounded footprint.

## A12 — Commit-mode tests follow their public callers

Task 8.3 originally asked for direct executions of the private commit step in held and unlocked modes. The production
callers arrive later: Task 13.1's layout copy holds the layout lock already, and Task 16.2's remote copy commits
migration-temporary refs in the code repository without the layout lock. The public store factory in `create.ts`
currently exposes ordinary Store operations; the migration entry is an expected contract built in Task 13.1.
`storeViolations` (`eslint/architecture-imports.ts`) rejects every relative test import into either private store
implementation, matching spec § 1.2, so a private test hook would defeat the intended boundary.

This is a determinate task-derivation correction: retain the private implementation and default-write verification in
Task 8.3; let Task 13.1's existing divergent layout-copy case prove held mode, and add Task 16.R after the remote-copy
caller for unlocked-mode evidence and the combined closure. No mode requirement, public boundary, or spec behavior is
changed. Task 8.6's no-pull conformance cases remain unchanged; the later modes have no ordinary Store caller there.
The approved deferred range still ends before 15.3.a, so Task 16.R is captured future work and receives no execution
under that authorization.

Author grounding traced `createRefStore`, `createRefBackend`, `storeViolations`, and `commitRefWrites`, and checked the
expected layout/remote-copy contracts in Tasks 13.1 and 16.2 against § 11.4. Grounding-only task audit found the caller
ordering resolves the private-import conflict without adding an API, lock policy port, or generic helper for tests.

Closure through Task 16.R: `store-ref-layout-move.test.ts` retains the divergent public layout-copy case while the
writer’s item-ref lock stands, with the migration itself holding layout serialization. The public handler case in
`store-ref-migration-commit-modes.test.ts` starts in the separate layout, retains another holder’s actual layout lock
until the remote copy has anchored a two-parent merge in the code repository’s temporary refs, then releases it for
the switch and completes with both sides’ records. Changing only unlocked commits to take layout serialization makes
that caller refuse `lock-held`; restoration completes both public caller cases. No private import or test API was added.

## A13 — Empty fetches need a no-tip negotiation form that completes

Superseded § 6.2 text:

> or, where none does yet, `--refetch`, which names nothing as held under either protocol version. Tips that
> match nothing would name nothing under protocol v2 too, but Git warns of each such pattern.

Task 9.1.b's fresh read-only clone exposed two distinct issues. `negotiationArgs` initially asked `for-each-ref` for
`refs/arc-remotes/*`, which did not enumerate nested remote/family refs; its corrected prefix scan finds them.
Separately, a disposable Git 2.55 probe with protocol v2 and no requested remote ref hangs under `--refetch`, including
with automatic maintenance disabled. Protocols v0/v1 finish but report no matching remote head. An unmatched
`--negotiation-tip=refs/arc/work/*` completes with exit zero and sends no held commit in the recorded v2 packets.

The Owner delegated amendments within this work unit's and cohort's intent. This determinate design correction keeps
one round trip, explicit refspecs, state-only negotiation, and the no-lazy-fetch boundary. The benign unmatched-pattern
warning remains captured. `fetchRefRemote` will use the unmatched state pattern only where no state or tracking tip
exists. The partial-clone completeness retry keeps `--refetch`, since a missing object from fetched tips establishes
that the requested remote state exists; the protocol-v0 completeness obligation is unchanged.

Author grounding covered `fetchRefRemote`, `negotiationArgs`, `parseFetchPorcelain`, the real Git probes and packet
capture, and § 6.2's source-fetch and migration reuse. The task grounding audit and specification reader/binding checks
found no additional API, stored record, round trip, or lifecycle change needed. Task 9.1.R carries the correction;
Task 11.6 repeats the segment-level sync scenario. Existing positive fetch, parser, host, and local conformance evidence
is unaffected. A canceled fetch's partial stdout is separately retained as failure rather than completed acquisition.

## A15 — A reftable fetch can report updates before its transaction aborts

The superseded § 6.3 premise was “Git marks a refused non-fast-forward and a failed local update alike”. Native Git
2.55 probes through `Store.pull` with a real stale lock confirm `!` rows under files refs. With reftable, a held
`reftable/tables.list.lock` instead produces an ordinary advance or create row, followed by exit 251 and “cannot lock
references”; the tracking ref stays unchanged. The initial both-layout fault fixture rejected that producer output,
so it was invalid for reftable and provides no red evidence for the intended classification there.

The Owner's standing authority covers this determinate design correction within the deferred range. Preserve whether
`fetchRefPatterns` caught a completed failure, then verify reported accepted updates against actual tracking state.
`checkRefFetchUpdates` reports a local tracking failure when that state does not establish the update; a later shared
tracking descendant remains valid. Neither a failed create nor a failed delete supplies evidence of a remote rewrite.
No new Store result, persisted record, remote round trip, or normal successful-fetch scan is required.

Author grounding traced `parseFetchPorcelain`, `fetchRefPatterns`, `checkRefFetchUpdates`, `captureFetchedHistories`,
`pullRemote`, and the push loop's listing and retry boundary. The specification's reader and binding checks and a
bounded grounding-only task audit cover § 6.3, its § 14.5 case, criterion 23, and Task 11.1.R, with Task 11.6 as the
segment replay. The existing graph check, keepers, forced-update flag, forwarding replacement, and successful-fetch
behavior remain required. Native failure evidence is retained with the ancestry task's ignored tools.

## A16 — Retained conflicts need an actionable recovery path

`observeSyncEndedConflicts` names conflicts on a lineage-ended UID, but `listRefRecords` excludes history refs and
`resolveRefWrites` admits only live and archived owners for non-lineage writes. `historyRefRecord` already reaches those
records through `retiredHistoryHome`. `applyResolutions` removes named conflicts from captured groups after
`prepareCapturedWrites` prepares the mutation; the missing binding is the retired conflict's coordinate. There is no
registered general store-history or conflict command in `cli.ts`.

The Owner's standing authority covers this bounded elaboration inside the store and sync goals. Reuse history for
inspection and admit only explicit retained-conflict removal, rather than expanding ordinary lifecycle reads and
listings or reviving an origin. The hidden command takes the exact UID, kind, and key carried by the notice; discard
explicitly accepts the end and removes its alternative. Its capture precedes corrective work in 13.5.R, after the
hidden command ports exist. Section 14.13 and the appended criterion own this new scenario, so earlier segment exits
keep their existing verification scope.

Author grounding traced `historyRefRecord`, `retiredHistoryHome`, `resolveRefWrites`, `refWriteTargets`, `mutationHome`,
`applyResolutions`, `planRefRetirements`, `observeSyncEndedConflicts`, the conflict schemas, and CLI registrations.
The grounding-only task audit and specification reader, binding, and coherence checks cover the exact new command,
notice shape, removal restriction, default backend, and retry boundary. The status port's A14 binding preserves the
new condition and remedy; the status implementation that lands second completes its rendering.

## A17 — Failed completeness does not certify a tracking tip

The superseded § 6.2 traversal was “over the fetched tips, short of the tracking tips the fetch found”. A real Git
protocol-v0 bitmap fixture first fetched a commit without a shared code blob. The initial `missingRefFetchObjects`
implementation followed that cutoff and refused after an intentionally suppressed repair fetch. Tracking had already
advanced. The remote then advanced again with a new blob absent from code history; the next incremental check passed,
but a full local-only closure walk still reported the earlier missing blob. The retained failing trace is
`task-11.3-first-completeness-run.log` in the task evidence directory; the native baseline also lacks its first blob.

The Owner's standing authority covers this determinate correction within the existing completeness goal. Traverse
fetched tips without tracking cutoffs, on the first check and the full-refetch recheck. This avoids persisting a second
certification marker or rolling shared tracking refs back, both more mechanism than a partial clone needs. Unfiltered
clones still skip the closure walk, reads remain local-only, and the same fetch path serves ordinary and named-history
fetches, then source and migration transfers when those callers land.

Author grounding traced `fetchRefPatterns`, `readRefFetchBasis`, `missingRefFetchObjects`, `pullRemote`, and the
supplemental fetch in `mergePulledRefState`. The grounding-only revision audit and specification reader, binding, and
coherence checks cover § 6.2, § 14.5, criterion 25, and 11.3.R, with 11.6 as the segment replay. There is no new stored
record, result arm, normal full-clone traversal, remote round trip beyond the existing one repair, or lifecycle change.

## A18 — Import verification against the shipped entry contracts

The superseded premises were “since the production registry declares none for those three kinds yet” (§ 14.7) and
“the declared grammars are first exercised by the cutover's trial run” (Open Questions). `ENTRY_CONFIGS` now declares
all six entry grammars, and `ENTRY_REGISTRATIONS` supplies their production parsers. The backend-neutral conformance
fixtures intentionally keep generic parsers and grammars; replacing them with production registrations would couple
that shared suite to family-specific schemas. Separate native import cases verify production compatibility instead.

The approved scope also makes two existing contracts explicit. `readQueueState` validates a queue member's ID, inbox
qualifier, rank, and uniqueness, while `renderQueueSet` writes those fields; an imported capture and its queue
reference must share one ID, including when the import mints it. `computeDefaultCaptureSet` retains SHA entries without
copy keys, and `CommitCaptureSchema` makes `copyKey` optional, so imported exclusions must not filter those entries.
The separate rule omitting keyless task captures remains required. The Errand schema's optional `owner` is available
and retained by `serializeTransientIdentityRecord`, matching the import's existing ownership contract.

The amendment changes no record shape or lifecycle. Existing Goals and criteria remain preserved; criterion 26 and
Task 15.R2 add the production-reader check after the import's source transforms and branch links exist, before the
Phase 15 exit scenario. The grammar-absent registry case in 15.8 remains a valid negative test despite production
availability. The broader audit found no material drift in the remaining remote-move, follow, host, or cost tasks.

## A20 — Current Candidates are separate mapping inputs

The superseded input supplied only `versions: { commit: string; content: string }[]` and
`boundary: string | null`; its source table listed “Candidate version” as `<tracked path>@<commit>` and required
“Every gate file, Candidate version, and boundary” exactly once. That omitted the current Candidate as a source.
`composedMetaSource` retains agreeing working-tree bytes, `appendWorkItem` reads current review content separately,
and `readImportCandidateVersions` reads only committed path history. The diagnostic mapping in `mapImportReview`
received only that history before replacing live review records. A faithful producer's newer uncommitted Candidate
read through the source store but disappeared after a successful import; an uncommitted notes control survived.

The correction supplies `current: string | null` alongside historical versions and accounts for it by its plain
tracked path. No commit is invented for working bytes. The mapping retains responsibility for the returned records.
The bounded sweep folds input and coverage changes into 15.9.R, updates 15.R's encoding inventory, and adds criterion
27 and its task-list counterpart; 15.10 replays the import scenario. Completed as-found Candidate replay and the
remaining move/follow contracts are unaffected. Author grounding and the low-depth reader, binding, coherence, and
revision-task checks use these source paths; the independent amendment offer is omitted at low depth.

## A21 — Durable terminal former names belong to lookup alone

The approved shared lookup extension is grounded against commit `91839a8e3`: `LookupInputSchema` documents exact UID
selection and current-terminal-name precedence, while `registerLookupAssertions` adds terminal former-name, ambiguity,
name-reuse, and direct-operation authority cases. It adds no input variant or public record field. The backend's
revision implements this expectation before cutover; it does not import the sibling's consumer fixes. The shared
assertion correction at `ab7d8307c` compares the exact-UID draft read before and after a refused former-name write,
allowing only `not-found` where retirement swept the draft; native retirement behavior remains unchanged.

`lineageCandidates` currently reads only UID and current-name entries in registry metadata. `prepareRefRenames`
already records genuine prior names, and `renameRegistryTargets` includes the registry in a work-item rename's atomic
write targets. Retaining that evidence there from each rename avoids recovering identity by enumerating ended primary
histories. `prepareRefCommits` currently skips a newly created auxiliary group without selected mutations, so the
revision must allow its changed registry metadata to land even before any lineage record exists.

The private `lineageFormerSlugs` map is separate from both the registry's current-name `lineage` map and a primary's
`formerSlugs`. Only lookup reads the new aliases; `readLineageOwners`, `lineageOwnerCandidates`, and the direct
reference-resolution paths keep their current authority. Lookup still requires an actual terminal record for each
candidate, so retained evidence alone never makes an origin present. Explicit lineage removal retains the evidence
for a later terminal record of the same UID. Arbitrary caller name hints are not rename evidence.

`mergeSyncMetadata` needs an additive union for this private field only, retaining independently authenticated names
per UID from every side. `inverseWithdrawStep` can rebuild registry metadata, and `repairWithdrawnLineage` rebuilds
current terminal names from surviving records; both must preserve authenticated aliases rather than deriving or
removing them with the terminal record. The normal scalar conflicts on primary metadata remain unchanged.

`appendImportLineage` currently attaches rename evidence only to an imported successor meta. Resolve known rename
chains against the import's held primary and terminal generations before projecting their evidence, so a terminal
origin with no primary keeps its known former names. `prepareImportGroups` must put that evidence into registry
metadata, never the registry root's generic `formerSlugs`. Unresolved rename chains keep their existing diagnostic
and remedy; no guessed generation, new history reader, or compatibility migration is introduced.

The propagation footprint is metadata parsing, rename and auxiliary commit publication, lookup selection, merge and
withdrawal, and import grouping. Existing generic direct readers and writers, record content/version rules, physical
layouts, and remote copy/follow transport remain unchanged; native local and synced tests verify that separation.
The added criterion is checked by the revision's native lookup/withdrawal/import suite and marked at terminal
work-unit verification. Completed Tasks 5.7, 15.2, and 15.10 point forward instead of rewriting their earlier outcomes.

## A22 — Atomic native observation admission

The design arm supersedes § 5.3's statement: “A rule that reads records outside the batch holds as of the write.
The compare-and-swap guards only the refs the batch writes, so a race or a merge can produce a state such a rule
would refuse.” It also broadens § 11.4's “only around its commit” boundary. The approved shared contract requires
all observations and registered checks to hold through local publication, including newly created relevant refs.
This is a bounded composition of existing locking, captured views, and history, retaining Class Heavy. The Owner
approved native absorption after the shared amendment review; that review returned no findings. The shared runtime
implementation landed afterward; see A22 and A23 native closure.

`commitRefWrites` currently builds captured proposed groups, calls `checkRefWrites`, sweeps retirements, and only
then calls `commitRefStep`. `commitLockedRefBatch` already retries from freshly captured tips, with separate owner
and layout re-resolution. The correction compares logical-state plus history tips inside the last-acquired layout
lock, then checks observations and runs registered checks before the sweep and transaction while retaining that
lock. A changed pre-lock capture rebuilds internally. `isManifestRef` and `HistoryRefSchema` identify state/history
refs; `readRefTips` also returns temporary refs, so a raw full-map comparison would spuriously retry on manifest
keepers or move journals. This is internal serialization evidence, never a caller's whole-store freshness token.

`createRefWriteViews` already pins read/list/lookup to supplied tips; `readRefHistory` traverses an explicit home/tip.
Extract the live/archive/retained resolution from `historyRefRecord` for before-history rather than calling that
public wrapper, which captures again. Thread the shared validated observation array and trusted writer action
through the native write path. Consume shared schemas/comparison semantics after they land; the backend does not
reimplement cut-map inventory or member authentication. The registered rule supplies those domain obligations.

The publisher audit traces ordinary writes, `mergeRefSets`, and `commitWithdrawEnd` through `commitRefStep`;
`landImportRefs` directly holds layout across its destination transaction. `moveRefLayout` and
`moveRefLayoutAsSwitch` hold layout across listing, private build, installation, and source deletion. Their
`prepareRefCopy` held mode borrows that lock; its only unlocked caller prepares the remote copy under
`refs/arc/tmp/migrate/remote/copy/`. Pull passes the default locked mode through `mergePulledRefState` and
`mergeCapturedRefState`; `adoptSourceProjectIdentity` uses `writeRefRecord`. First backing/store creation takes the
layout lock. Remaining transaction callers change tracking/seen refs, temporary gathering/control refs, or legacy
import sources. `appendImportTransients` selects only the configured identity's legacy Errand ref;
`retireImportLocals` deletes its retained source in the code repository when the new store is separate, not a
native logical record. `maintainRefStore` packs and measures immutable tips without changing logical records.
Raw Git writers outside this cooperative protocol still rely on changed-ref CAS; no remote atomic-rule guarantee
is introduced, and sync continues to merge without running kind checks as gates.

Propagation: write-spine/check/history tasks and the first-path verifier point forward to 4.R; original Goals and
outcomes remain intact. Existing merge semantics, slug-resolution policy, import content, A21 lookup authority,
move/follow routes, and Phase 17's transport scenarios are unaffected. Phase 18's existing burst and cost obligations
still measure the widened local lock. The new criterion joins the flat terminal criteria. 4.R.c covers the native
correction before 17.6; no new segment, lifecycle transition, or Phase 19 execution is introduced.

## A23 — Native creation facts after shared-contract landing

The landed `CreatedOwnerSchema`, `BatchCreationReceiptSchema`, and `WriteCheckInput.proposedCreatedOwners` now make the
production cut-map rule depend on candidate allocation evidence and retained whole-batch receipts. Goal 1's complete
contract and Goal 6's forward contract changes cover adoption; § 5.7 elaborates the missing native design and criterion
30 makes it checkable. This is bounded composition at medium depth; Heavy remains appropriate and no segment is added.
The authorized post-review absorption and deferred execution apply; independent reviews remain skipped by direction.

`resolveRefWrites` currently keeps fresh allocations only in a local map. Retain that backend evidence across the
resolved attempt, then derive actual primary births from prepared before/after trees at each `commitRefWrites` attempt.
An existing owner acquiring a primary path or an expected-absence operand is insufficient. The accepted array must
reach every ordinary/conflict/lifecycle physical commit, not a filtered per-ref subset. The producer audit includes
`commitRefTree`, `commitSyncMerge`, `commitWithdrawEnd`, and `commitMigrationRegistry`; forwarding and move-record roots
are control records with intentionally bounded ancestry. Imports preserve unavailable historical birth evidence.

History queries validate the physical commit inputs they already acquire, before filtering and grouping. The shared
memory reference helper can see all events for a selected batch, but native adoption does not inherit a global scan:
existing native owner/path/reference/family/window bounds remain authoritative. Complete producer envelopes and
agreement among encountered commits establish the required guarantee. Missing receipts mean unavailable evidence;
advertised corruption is terminal, with authentic restoration or explicit development regeneration as its remedy.
No aliases, legacy readers, migrations, backfills, or inferred historical births are introduced.

Propagation: 4.R.c moves forward to 4.R2.d because meaningful production verification now needs these creation facts.
A22 remains open in its log until that covering verifier, even though the observations/history implementation parent
closes. The amended write/check/history, lifecycle, sync, and import tasks retain their original Goals and outcomes
with additive pointers. Existing move/follow semantics remain; receipt retention joins their regression coverage.
Phase 18 retains its platform, host, and cost obligations. The physical query bounds prevent an unplanned global cost.

## A22 and A23 native closure

The landed shared contract is now implemented and verified in both native layouts. Proposed births come from fresh
native allocations intersected with actual proposed primary creations. Every physical accepted operation retains the
whole receipt; bounded queries validate acquired messages before omission and preserve complete envelopes. Imports
retain unavailable facts, copies preserve original facts, and newly authored sync, withdrawal, and migration operations
carry complete-none. Operational corruption and acquisition refusals retain authentic repair routes.

The production cut-map registration passes 22 real-Git scenarios: read-only edits and conflict-only changes during
retirement/extraction, existing and new incoming dependents, a provider becoming resolvable, source and removal-group
additions, stale discard, unrelated owner creation, and missing-object refusal followed by successful authentic repair.
All 22 fail under targeted, export-preserving reconstructions and pass after exact restoration. Whole-group competitors
run before the first group/history lock; read-only and new-owner competitors run at the final layout boundary.

Full conformance in both layouts and the affected write/check/history/changes, lifecycle, sync/layout, and move suites
completed 2,515 cases across 36 files, with 118 declared skips. The broad run passed 2,512 and found three old exact
sync-writer assertions lacking the landed merge action; their focused corrected retries passed. Its total elapsed time
was 980.71 seconds. The decomposition unit regression passed all 710 cases in 90 files. Evidence and exact selections
remain under `.arc/user/andrew/.internal/storage-ref-backend-tools/task-4.R2.d/`, with the corresponding logs in `/tmp/`.
This closes the A22/A23 revalidation; hosted timing, process-cost, and platform obligations belong to Phase 18.

## Moving-remote segment closure

The exit scenario composes the preserved 13.6 designation/layout and shared-sync result, 15.10's complete import,
notes-snapshot, post-import, Candidate, and review-mapping result, and the remaining move/follow cases. Task 4.R2.d
already reran both complete native conformance suites, layout-lock/move, follow-lifecycle, leave-recorded-move-back,
and lineage-alias-sync on unchanged production source. Those exact-subject results remain part of this union rather
than spending another full run on them.

The fresh selection runs 24 native integration files covering remote copy/switch/delete, lifecycle deletion, restart,
reporting, crossing, ended items, forwarding/designation, follow candidates/convergence/races/restart/worktrees,
leave-source and recorded-move variants, backing repoint, and read-source behavior. The three real CLI E2Es cover
remote moves, following, and backing repoint. All 223 cases in these 27 files pass in 475.61 seconds. The exact
selection and output are `/tmp/arc-storage-17.6-scenario-files` and `/tmp/arc-storage-17.6-scenario.log`; the retained
proof directory is `.arc/user/andrew/.internal/storage-ref-backend-tools/task-17.6/`.

This closes §§ 14.6–14.7's effective scenario without modifying production code. Hosted platform, host-capability,
and cost evidence belong to Phase 18.

The first segment quality run found one stale command-boundary caller list: `runStoreRemote` now also belongs to
`commands/store-migrate.ts`, whose answered follow prompt delegates the explicit role choice through that public entry.
The exact two-command allowlist now names both adapters; the scan still rejects every other caller. The initial full
unit run passed 18,946 cases and failed only this assertion, with 584 declared skips; no runtime correction was needed.

## Native inbox contention

The gated burst suite runs twenty independent Node processes in linked worktrees and twenty independently publishing
clones, in both native layouts. Every worker derives one distinct removal and insertion from the same captured inbox
version. The final inventory retains the sentinel and all twenty new entries, with no old entries or conflicts.
Every clone's final pull reads that inventory and the exact final remote tip. Publication checks inspect states,
notices, and every per-family outcome, rather than treating a successful outer call as successful publication.

The new inbox worker uses production ports, native locks, real clocks and machine identities, and normal sync waits
and deadlines. Only unaccepted lock acquisition retries repeat the original write input; no retry refreshes its
expected version. The suite chooses 900-second process/test bounds, while existing worker modes keep their original
semantics and default 60-second helper deadline. Portability selection names the suite explicitly. Linux's test step
sets `ARC_STORE_BURSTS` only on dispatch, and the existing scheduled/dispatched Windows and macOS pair sets it on its
main test step. Ordinary integration and reviewed-PR Linux runs skip the bursts.

All four burst cases passed locally in 46.56 seconds. A narrow incoming-only entry-merge reconstruction made all four
fail on missing additions and resurrected removals; exact source bytes were restored in `finally`. The final run passed
54 cases across the burst, existing process-worker, and CI workflow-contract files in 101.95 seconds. Portability
selection also failed on the missing suite before registration and passed all 22 cases afterward. Proof is retained
under `.arc/user/andrew/.internal/storage-ref-backend-tools/task-18.1.a/` and `/tmp/arc-storage-18.1-*`.

Task 18.1.b carries the dispatched Linux, Windows, and macOS evidence; see Complete calibrated portability acceptance.

## Native operation timing

The fixture captures registry and completed-primary bytes through two native production writes. It expands that
prototype into one bulk stream, preserving every opaque metadata field and remapping owner, slug, quarter, and batch
coordinates together. Shared provenance and creation-receipt codecs emit complete fifty-owner envelopes for each
quarter's physical commits. Both measured repositories import identical bytes: files refs in the code repository and
reftable in the separate directory. Setup uses one import per layout instead of hundreds of native fixture writes.

Untimed checks establish identical initial ref maps, 600 completed primaries, fifty per quarter across twelve
quarters, and a readable selected history with its complete creation receipt. The read reaches the fourth quarter
from the newest one. Each operation takes eleven samples; assertions and write-verification reads happen after the
elapsed sample. Windows alone enforces the stated budgets. Both layouts finish measurement before budget assertions,
so a breach still leaves the complete report available.

The exact directory and separate-conformance file names join portability ungated; the timing suite uses the existing
burst gate. Its JSON report and native per-file duration cache upload as `portability-results-Linux`,
`portability-results-Windows`, and `portability-results-macOS` on the applicable dispatched/scheduled jobs. Keeping these
artifacts outside the integration-duration merge avoids combining platform timings into that baseline.

Local Linux medians from the final profile, in milliseconds:

| Layout   | Version | Read   | List    | Lookup | Write   |
| -------- | ------- | ------ | ------- | ------ | ------- |
| default  | 5.758   | 44.571 | 109.990 | 10.792 | 645.659 |
| separate | 3.376   | 41.481 | 103.061 | 9.391  | 637.504 |

The final timing and workflow-contract run passed all 39 cases in 24.45 seconds; portability selection passed all 22
cases after first failing on the three missing files. The empty imported fixture first failed the complete-listing
requirement. Discarded setup probes exposed an explicitly missing registry seed and required primary placement; those
were fixture corrections. Proof is retained under `.arc/user/andrew/.internal/storage-ref-backend-tools/task-18.2.a.1/`
and `/tmp/arc-storage-18.2-*`.

These are Linux figures. Task 18.2.a.2 retains dispatched platform evidence, and 18.2.b retains the conditional budget
response; neither is closed by local timing. No production performance change has been made at this boundary.

## Personal-path pack cost

A local Git 2.55.0 trial compared sixteen personal refs, each retaining forty snapshots of three documents:
`WORKING-MEMORY.md`, `USER-INBOX.md`, and `config.user.yml`. Each document held one hundred deterministic paragraphs;
one paragraph changed per revision. A fresh source pushed every `refs/arc/user/<id>/personal` ref to a fresh bare
receiver for each arm and repetition. The sole arm difference was the path: `<id>/<name>` versus
`<id>/<name>.<id>`. Every paired arm retained the same 1,920 blob object IDs, 640 commits, sixteen refs, and 3,840 total
objects; full object verification completed before packing.

Each receiver repacked with Git's ten-object delta window and depth fifty, one thread, forcing fresh delta selection.
Three independent repetitions alternated arm order. Pack sizes were identical across all three repetitions; the table
reports bytes and median repack milliseconds. The corpus variants change only cross-person similarity: common shares
paragraph payloads across people, mixed shares half, and distinct shares none. Owner headers differ throughout.

| Corpus   | Shared-name bytes | Identity-suffix bytes | Shared / suffix | Shared ms | Suffix ms |
| -------- | ----------------- | --------------------- | --------------- | --------- | --------- |
| common   | 310,228           | 591,561               | 0.524           | 156.6     | 199.7     |
| mixed    | 10,413,153        | 591,309               | 17.610          | 1,459.6   | 197.4     |
| distinct | 10,410,153        | 591,264               | 17.607          | 1,323.6   | 200.5     |

This demonstrates a material shared-name pack cost when people's content differs, while shared content benefits from
cross-person deltas. It measures controlled local Git packing, not any host's pack policy or a production population.
It supports considering the specification's forward naming change; this measurement itself changes no stored path.
The reproducible script and complete raw results are retained under
`.arc/user/andrew/.internal/storage-ref-backend-tools/task-18.5/`; the script's SHA-256 is
`316d9a4ff654671ed375bf382e0c09968998fd93bb210c011fbf347ba323dd39`.

## CI measurement preflight

The full integration warmup exposed a branch regression before any retained cost sample existed. Static runtime
imports in `createSpawnRawGitExec` made Node's direct source entrypoint resolve unavailable `.js` dependencies;
classifier and change-fact executable cases failed before producing their JSON. Cancellation support now loads only
when an executor caller supplies a signal, preserving the dependency-free command path. Existing native cancellation
cases continue exercising pre-aborted requests and descendant termination.

The same run exposed a stale command-inventory exception for `store remote`. Its command is registered, while
`createStore` still selects the in-repo implementation. The derived inventory now requires every emitted corrective
command to register, with no dormant exception; default-backend dormancy remains separately checked. The focused
five-file run passed all 180 cases in 32.78 seconds. The failed cost warmup was interrupted and supplies no baseline.

## A24 — Identity-suffixed personal content paths

Superseded § 3.2: “Personal files share names across people.” Its conditional forward change is taken after Task 18.5's
controlled pack trial: mixed and distinct personal corpora packed about 17.6 times larger with shared names, while
nearly identical people benefited from cross-person deltas. Identity suffixes favor the history of a person's own
content and avoid that measured large-pack case. This changes Git tree spellings only, not projected editor paths.

`KIND_MECHANISMS` carries independent `ref` and projection/substrate addresses. `expandStoredPath` expands the former;
`decodeStoredReference` reverses that template. `personalPath` and `personalSingletonKey` resolve the existing in-repo
user surfaces through layout addresses. The correction updates the five personal content templates, preserving the
independent addresses and opaque keys. The queue takes the same physical suffix as the other content kinds to retain
one consistent logical alias namespace. Metadata, manifests, conflict IDs, receipts, and claims retain their forms.

Grounding-only task audit and author specification checks cover the changed table, key admission, decoding, native
writes/reads, and personal import construction. Logical file/folder collisions still refuse after suffix removal for
collision comparison; current exact preflight cases cover both batch orders. The amendment changes no compatibility
posture: development stores are regenerated, with no old-name reader or migration. The determinate amendment takes
low depth, so its independent planning pass is omitted; no evaluator review is run in this deferred batch.

`KIND_MECHANISMS` now supplies the five suffixed templates; existing expansion and decoding use them unchanged.
`checkRefPathCollision` checks both the physical paths and their logical personal spellings, retaining Git tree safety
as well as projected file/folder safety. Native public operations preserve CRLF content and a nested Unicode/quoted
key, with current/historical read, listing, changes, publishing, and pulling covered under both layouts. Corrected
keys succeed after alias/collision refusals without publishing the companion mutation.

Exact path expectations failed before implementation; native collision assertions failed after changing templates
without logical admission. Removing only the physical comparison likewise failed both native cases, and the exact
source was restored in `finally`. The final run passed 2,279 cases in eleven files with 118 declared skips, taking
705.69 seconds: both complete native conformance suites, the personal import comparisons, key admission, and the
neighboring read/decode/merge cases. Unit mapping and preflight passed 97 cases; both typechecks and TypeScript lint
passed. Raw tree fixtures now use the new spelling, and the registered-path roundtrip uses actual cut-map and routing
receipt writers instead of generic prose. Proof is retained under
`.arc/user/andrew/.internal/storage-ref-backend-tools/task-18.R/` and `/tmp/arc-storage-a24-*`.

## Cutover suite inventory

Paths below are relative to `packages/arc-framework/__tests__/`. This inventory classifies assertions, not spelling: a
consumer that happens to borrow the in-repo fixture keeps its contract behavior and changes its fixture. No test or
helper is deleted by this inventory.

### Preserve shared, native, and consumer coverage

Keep `helpers/store/conformance-suite.ts`, `suite-*.ts`, `fixture-contract.ts`, the reference backend/fixture, and their
registration/exclusion-policy unit tests. Keep both native conformance registrations and every `integration/store-ref-*`
suite but the import's, including timing, bursts, and native admission. The in-repo conformance registration currently
runs the same assertions; preserve those assertions when the obsolete adapter registration and its helper go away. Do
not carry a deleted backend merely to retain a three-line registration wrapper.

Keep `unit/lib/store/{reference-*,ref-*,conformance-*,kinds/**,concurrency/**}` and shared identity, envelope, registry,
serialization, conflict, provenance, receipt, observation, link, and lifecycle-contract tests. Keep the independent
layout/address assertions and native port/identity tests. `integration/store-default-ref-ports`,
`store-conflict-command`, `store-remote-command`, and `store-reference-packaging` survive despite lacking the
native-suite filename prefix.

Keep native store-command E2Es and the contract-based status, view, lifecycle, session-init, handoff, recovery,
materialization, selected-store Errand, personal-user, and join consumers. Concrete integration suites include
`store-public-readers-cli`, `errand-open-selected-store`, `errand-preservation-store-cli`,
`errand-promote-store{,-cli}`, `errand-open-rollback-cli`, `errand-reserved-slugs-cli`, `executor-store-rebind`,
`identity-setup-store-cli`, `join-store-cli`, `join-store-cancellation`, `lifecycle-default-locus-ports`,
`lifecycle-marker-occupancy`, `materialize-store-cli`, `orphan-store-branches`, `user-open-store-cli`,
`user-personal-store-callers`, and `view-store-cli`. Preserve `e2e/lifecycle.e2e` and `status-lifecycle.e2e` too.

`e2e/store-command-dormancy.e2e.test.ts` is a deliberate exception: retire its unsupported-before-flip cases when those
capabilities activate, keeping the independent locus-inspection scenario. Likewise update the default no-effect arm in
`unit/lib/store/operational-sync.test.ts` and command-inventory/default-factory assertions when the production backend
switches; retain the bound sync/history/refusal behavior. A pre-flip dormancy expectation is not a native contract.

### Retire assertions about the deleted implementation

Retire the import's suites with its transform, which the cutover's deletion pass removes with the in-repo
implementation: the eighteen integration `store-ref-import-*` suites, `e2e/store-import-errands.e2e.test.ts`, and the
`helpers/store/import-*.ts` fixtures only they use. Each reads its comparison source through the in-repo implementation,
seeds notes or Errand identity refs, and drives `arc store migrate --import`, so none has a source to compare once the
flip has run.

Retire integration `store-in-repo-{fixture,fixture-sync,cohort-placement,errand-branches}`; `store-notes-*`;
`store-transient{,-batches,-boundary,-history-order,-local-causes,-retry-acceptance,-version-retention}`;
`store-tracked-{generation,history,listing-failures,lock,lock-release,lookup,reads,writes}`; and
`store-tracked-write-{admission,batches,ownership,placement}`. These arrange or assert tracked placement, filesystem
locks/digests, notes history/publication, or old Errand-ref transactions. Codec and consumer exceptions follow below.
Retire personal batch, derived-status, and symlink-boundary integration suites whose assertions belong to the old
physical-file adapter rather than the projected working copy's own contract.

Retire integration `branch-bounded-notes-export`,
`notes-{export-state-coherence,publication-history,publication-proof}`, `user-notes-{compaction,interleaving}`,
`sync-state-{marker-publish,ref,ref-reconcile}`, `errand-common-basis-observation`,
`errand-identity-{claims,transaction}`, `errand-partial-push-marker`, and `errand-record-sync`. Retire
`e2e/sync-state-producer.e2e.test.ts`: its paired notes/sync-state push and partial-push marker are obsolete.

Retire unit `lib/store/in-repo-{flat-read,boundary,identity-admission}` and the adapter-specific dispatch assertions;
`user-sync-{classifier,current-wu,inference,orphan-classification,projection,retired-subdir}`; `user-sync-compaction*`;
`user-sync-note-set-relation`; `user-sync-notes-{lock,ref,publication-proof}`;
`user-sync/{sync-state-read,sync-state-write-validation}`; `git/user-sync`; old notes push/reconcile retry; and old
sync-state marker/merge tests. Direct legacy Errand snapshot and transaction tests retire with their acquisition code.

`unit/lib/store/write-context.test.ts` checks the old checkout-committability refusal mapper. Its only production symbol
occurrence is the mapper's export, `checkoutRefusalFromPreflight`; its branch-preflight expectations retire with that
guard. Generic preservation of actionable refusal/remedy fields remains covered by surviving contract/native refusal
tests. Do not keep a retired checkout restriction merely because its test uses a pure function.

### Split mixed suites before deleting their support

| Suite or group                                                                                                                | Preserve                                                                                             | Retire or replace                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `store-cohort-fields`, `store-design-fields`, `store-task-list-fields`, `store-registered-reads`                              | Registered parsed fields, read/list behavior, malformed-content diagnostics                          | In-repo filesystem arrangement                                              |
| `store-lifecycle-storage`, `store-lifecycle-{consumers,verbs}-differential`                                                   | Snapshot isolation, refusal, deciding-port composition, lifecycle/consumer eligibility and authority | Legacy Git-tree/parser comparison and tracked fixture side                  |
| `store-lifecycle-index`, `store-review-listings`, `store-composed-acquisition`, `store-project-inbox`, `store-slug-ambiguity` | Contract queries and consumer outcomes                                                               | Old placement/branch setup                                                  |
| `store-tracked-write-codecs`                                                                                                  | Candidate, boundary, transition, lineage writer behavior                                             | Tracked placement/setup                                                     |
| `store-personal-{read,write}`, `store-default-identity`                                                                       | Selected identity, opaque content, transforms, stale versions, parser/listing/refusal behavior       | Notes locks, primary/linked file-root selection, direct old-file comparison |
| `store-sync*`, `store-pull`                                                                                                   | Shared pull/push result/refusal behavior exercised through the current contract                      | Notes refspecs, captured notes trees, old sync-state/Errand publication     |
| `status`, `start-dispatch`, `park-resume-roundtrip`, `user`, `user-inbox-remove`                                              | Public status/start/park/user/inbox/queue behavior                                                   | Old notes/file arrangement and lock assertions                              |
| `unit/user-sync-merge`                                                                                                        | Cross-work-unit memory/inbox parsers and exact bytes                                                 | Notes merge/tombstone reconciliation                                        |
| `unit/user-sync/schema`                                                                                                       | `CrossWuEntrySchema` and `CrossWuEntryParseSchema`                                                   | Persisted sync-state schemas and normalizers                                |
| `unit/user-sync-notes-merge`                                                                                                  | Git error predicates used outside notes                                                              | Notes strategy, temp refs, manifests                                        |
| `unit/lib/store/tracked-lock`                                                                                                 | `resolveCheckoutGitDir` behavior used by surviving Git callers                                       | `withTrackedWriteLock` and lock-file lifetime                               |
| `unit/lib/store/current-work-unit`                                                                                            | Contract consumer selection semantics                                                                | Flat active-meta setup and legacy-reader parity                             |
| `unit/errand-identity-{claims,transitions,record}`                                                                            | Surviving state transitions/rollback and legacy codec inputs still needed by the one-time import     | Old ref publication/acquisition                                             |
| `e2e/errand.e2e`, `locus-errand-roundtrip.e2e`, `errand-open-provisioning-recovery.e2e`                                       | Public open/close/promotion/provisioning/materialization                                             | Direct old Errand-ref seeding, deletion, and assertions                     |

Keep `unit/user-sync-inbox-writer`, `user-sync/{execution-offer,inbox-target}`, `lib/inbox/**`, and newer
Errand/session-init store-backed consumers. Their content grammar, generation-qualified identity, mutation, and queue
behavior survives; the `user-sync` directory name alone is no retirement basis. Preserve the identity-precedence
semantics in `unit/lib/store/default-identity` and the reference-backed `current-work-unit-marker` tests.

The distinction follows source assertions: `tracked-lock` has a separate checkout-directory resolver group;
`user-sync-merge` has independent cross-work-unit parser groups; the field-reader suites assert parsed contract data;
and `store-default-ref-ports` asserts native personal-ref actor facts. These are not lost with their temporary adapters.

### Helper and architecture follow-through

Rebind surviving consumers before retiring `helpers/store/in-repo-*` and old tracked/personal/sync fixture helpers.
Preserve `ref-*`, shared suite/reference support, lifecycle harnesses, grammar fixtures, and legacy input fixtures used
by native import. Remove a helper only after its surviving imports have moved. Architecture tests that forbid private
backend imports survive; replace predicates naming the retiring implementation rather than deleting their broader
boundary assertions. Preserve all suites outside the explicit retirement set unless their actual assertions target
another deleted implementation.

## Real-host owner probes

The manual `ref-host-properties.ts` kit now uses production `createDefaultRefStorePorts` and `createRefStore` through
`ref-host-backend.ts`, outside every test tier and CI job. The designated scratch repositories remain
`andrewRCr/arc-ref-host-probe-20261016` on GitHub.com and GitLab.com. Git 2.55.0 over HTTPS used the existing `gh` and
`glab` owner logins. Temporary native registry/personal refs were absent at entry and cleaned with exact leases;
`main` and the two original host-probe refs remain for inspection.

| Check                                                                               | GitHub.com | GitLab.com |
| ----------------------------------------------------------------------------------- | ---------- | ---------- |
| Protocol v2 requested prefix and narrowed advertisement                             | passed     | passed     |
| Atomic capability advertised over HTTPS                                             | passed     | passed     |
| Ordinary default clone acquires no state refs                                       | passed     | passed     |
| Native public write/push/pull preserves CRLF bytes                                  | passed     | passed     |
| Stale atomic state lease holds a code branch back                                   | passed     | passed     |
| Stale single-ref and delete leases preserve the current tip                         | passed     | passed     |
| Replaying older state without a force lease refuses                                 | passed     | passed     |
| Forwarding holds unpublished state; removing it permits publication and convergence | passed     | passed     |
| Exact leased deletion removes the temporary native refs                             | passed     | passed     |
| Distinct ordinary writer, read-only principal, policy, and fork cases               | unverified | unverified |

The stale pushes and replay retain each host's actual porcelain rows and stderr, rather than matching one provider's
English wording. A paired local bare Git receiver with `receive.advertiseAtomic=false` rejects the atomic push with
`fatal: the receiving end does not support --atomic push`; its refs stay empty and a subsequent single leased push
succeeds. This diagnostic comes from that local receiver, not from either HTTPS host, both of which advertise atomic.

The current logins do not establish ordinary-member or read-only permissions, and no separate role profiles are
configured. Policy/fork fixtures and the Azure DevOps, Bitbucket, Gitea, and Forgejo runs follow in Real-host backend
trials. Raw evidence is retained under `.arc/user/andrew/.internal/storage-ref-backend-tools/task-18.4/`, including
per-command stdout/stderr and `backend-results.json`; results never imply that unavailable setups passed.

## Errand import E2E source

Dispatched run `39530714223` at `cdf5fa119` refused both `store-import-errands.e2e.test.ts` cases with
`branch-missing`: their open legacy Errand declared `chore/example` without creating it. The independent integration
source already creates each declared branch. The E2E fixture now does the same; both layouts pass the real CLI import
and repeat-import assertions. This corrects source setup and retains import's refusal and remedy for a genuinely
missing branch. The failing hosted log is `/tmp/arc-storage-18-ci-e2e3.log`; the corrected focused run passed two cases
in 12.29 seconds, retained in `/tmp/arc-storage-18.3-errand-e2e.log`.

## Personal raw-tree fixture closure

The first dispatch exposed remaining fixtures that planted unsuffixed content or inspected an unsuffixed Git object
path after A24. The raw fixtures in conflict labels, batch races, JSON prose diagnostics, pull history, historical
bytes/recovery, and remote re-copy now use the canonical physical spelling; follow convergence, pull serialization,
prior-blob recovery, and write-byte checks inspect it too. Oversized-entry diagnostics name the physical stored path.
Logical references and all original behavioral assertions remain unchanged.

The effective native verification union covers eleven files and 126 cases. The seven-file run passed six files and
found one remaining old historical path; the next five-file run passed four and found the old oversized-diagnostic
path. Correcting those yielded the final ten-case pull-check run. No passing unchanged suite was rerun solely to
produce one aggregate result. Logs are `/tmp/arc-storage-18.3-personal-fixtures-final.log`,
`/tmp/arc-storage-18.3-personal-fixtures-closure.log`, and `/tmp/arc-storage-18.3-personal-pull-checks.log`; the first
dispatch's shard logs remain `/tmp/arc-storage-18-ci-integration{1,3,4}.log`.

## Join synchronization fixture

The dispatched join and identity-setup integration cases mocked `createStoreSyncPort`, but the current
`bindStoreSyncPort` calls its own module-local implementation, so those mocks supplied neither designation nor the
promised records. Both cases now supply schema-shaped store-result envelopes at their selected store's public `pull`
boundary. The designation uses current `push`/`read` choices and an executable push remedy. The first-identity case
retains its assertion that pull runs before identity configuration and that the pulled inbox is preserved.
Production binding and rendering execute normally. The registered-CLI, identity-setup, and cancellation/recovery suites
passed eight cases in 33.81 seconds; `/tmp/arc-storage-18.3-join-final.log` retains the run, and
`/tmp/arc-storage-18-ci-integration{2,3}.log` retain the prior failures.

## Prepared fixture path encoding

The first dispatched Windows run stopped 1,067 separate-conformance cases during fixture copy because Git serializes
backslashes doubled in `.git/config`. The copier searched only the literal template root or its forward-slash form.
A real `git config` probe reproduced that encoding, and a prepared remote with a backslash-bearing template path
reproduced the copy refusal locally. The copier now also recognizes Git's escaped spelling. Filesystem path assertions
resolve the host's separator spelling rather than requiring one textual form.

The regression failed before the helper change, then the complete prepared-repository suite passed eleven cases in 6.67
seconds. Its independent-copy push reaches the copied bare remote and leaves the original repository's head separate.
These local results do not close the Windows platform task; later dispatches verify Windows. Logs are
`/tmp/arc-storage-18.2-prepared-red.log`, `/tmp/arc-storage-18.2-prepared-green.log`, and the first Windows job's
`/tmp/arc-storage-18-ci-windows.log`.

## Windows object batching

The first dispatched Windows run (39530714223, `cdf5fa119`) exceeded the read and write budgets in both layouts.
Default medians were 318.9771 ms read and 11895.5451 ms write; separate medians were 282.2979 ms read and
13270.7832 ms write. The original budgets remain unchanged; Task 18.2.b's conditional implementation is required.

The blob stage now uses one `hash-object -w --no-filters --stdin-paths` over byte-written temporary files, with a
unique directory removed in `finally`. It retains its position after layout admission under the publication lock.
Each prepared recursive tree uses one child-first `mktree --batch -z --missing`, with exact computed object IDs
checked against every native result. Manifests share that tree encoding and validation. Separate physical refs and
successive commits still require their own prepared-tree batches; this does not claim one process for a multi-ref
operation. Metadata written after the stage retains its fixed direct blob writes.

The new native bulk-write case initially used 39 object-writing processes for eighteen nested documents and failed
the fixed four-process ceiling in SHA-1 and SHA-256 repositories. With batching, both formats and layouts pass with
all documents retaining exact CRLF/Unicode bytes under `core.autocrlf=true`. Three failure cases cover interrupted
file writes, interrupted native writes, and mismatched returned identities: no record publishes, temporary files
are removed, and a fresh retry succeeds. Their reconstruction against the original stage failed all three on the
unexpected successful publication. The complete five-suite object-construction run passed 44 cases in 15.00 s,
including manifests, archive retention, and separate bare repositories. Local proof logs remain under
`/tmp/arc-storage-18.2-{write-batch-red,write-cleanup-red,object-suites}.log`. No budget pass is claimed from this
local evidence.

## Windows operation reader

Read, list, and lookup exceeded at least one first-dispatch Windows budget, so those public operations now own a
lazy `cat-file --batch` scope. The ordinary raw executor retains its injection boundary and environment filtering;
only local-only batch object reads reuse a child. Scope keys bind the repository, arguments, environment, and output
bound; exchanges serialize, byte framing retains missing objects and binary payloads, and each request retains the
existing output ceiling. Overflow invalidates and ends the reader before the existing partition/retry path opens a
fresh one. Cancellation uses the shared descendant-first termination utility and waits for direct-child cleanup.
Normal close ends stdin, drains EOF, and awaits child exit; exceptional close destroys buffered stdout before waiting
so an unread pipe cannot hold cleanup open.

Each public read call closes its scope before returning, including refusal and thrown-error paths. This backend's
explicit maintenance, pull, and push wait for its already-active readers and hold later reads until completion;
pull and push are included because native fetch may trigger maintenance. No reader is held across calls or cached
on the long-lived backend context. This is ownership within a backend instance, not coordination with arbitrary
external Git processes or other independently constructed backend instances. Version, history, changes, and writes
retain their existing one-shot acquisition paths.

Native Git trace events proved the original UID read opened two batch processes; both layouts now open one and
record its exit before the read resolves. A paused read, concurrent maintenance, and later read prove reader exit
precedes native maintenance start and the later reader starts after maintenance exits. The maintenance-barrier
reconstruction failed that ordering in both layouts. Further narrow reconstructions failed exact-byte framing,
request-local output limits, active cancellation, and native exit classification; a framing-bypass reconstruction
failed all six malformed-stream cases. Restored native coverage passed seven suites and 97 cases in 33.26 s, with
both layouts, upstream reads, overflow partitioning, maintenance, and executor regression coverage. Protocol coverage
then gained a native exit-status/diagnostic and successful-continuation case. The focused unit union passed 40 cases,
including nine framing cases and dependency-free store construction. Proof logs use the
`/tmp/arc-storage-18.2-reader-*` prefix. The process-cost fixture counts actual native process starts rather than
raw-executor requests; its reduced UID-read expectations reflect that observed reduction. No Windows budget pass
or hosted conformance-cost pass follows from these local checks.

Related-unit feedback initially refused the new spawn site's absent command-input classification. Its declaration
now records ARC-fed explicit stdin and an operation-scoped local object-acquisition boundary beside the existing
raw Git infrastructure policies; the inventory validator supplies the fail-first witness. The local 600-item timing
case passed in 20.58 s after batching. Its diagnostic medians in milliseconds were: default version 4.7474, read
42.4738, list 106.2453, lookup 12.6066, write 507.8042; separate version 3.9796, read 43.6168, list 102.2287, lookup
10.7949, write 494.0704. These local figures are not comparable hosted-runner budget evidence.

The native reader-protocol, reader-lifetime, and bulk-write suites join the existing portability selection explicitly
so the next Windows/macOS pair exercises cancellation, cleanup, byte preservation, and maintenance ordering directly.

## Windows burst diagnostics

The first Windows pair reported two publishing-clone failures at a boolean outcome assertion, which did not retain
the failed pull or publish details. The assertions now attach the complete native result to failures, including
initial clone pulls and final convergence pulls. No accepted-write, notice, publication-status, or convergence
condition changes. This prepares the next dispatch to distinguish a transport/refusal outcome from a lost-write
failure; the first run's exact cause remains unestablished.

## Conformance workload comparison

Dispatched run `39536946799` tested `d79fbf32ce493b8eba0e0dd3f790e9337d5f5993`. All four integration shards and all
four E2E shards passed. Linux portability passed, including its four contention cases. macOS passed the contention,
native reader, and object-batching cases but timed out one separate-conformance primary-role reopen/sync/conflict
case at its unchanged 30-second limit. Windows remained in progress when this investigation was recorded.

The integration duration artifacts give the complete-file comparison below. This is the accepted hosted comparison;
both native layouts still miss the unchanged 1.5-times bound.

| Backend  | Shard | File time (ms) | Completed cases | Ratio to in-repo |
| -------- | ----- | -------------- | --------------- | ---------------- |
| in-repo  | 1     | 134,811.190    | 310             | 1.000            |
| default  | 4     | 549,023.237    | 1,069           | 4.073            |
| separate | 1     | 674,463.765    | 1,069           | 5.003            |

An inert registration inventory over the three existing files matches those populations exactly, without invoking
test callbacks, hooks, builds, or Git. Excluding each declaration-inventory test leaves 278 shared active assertion
IDs, 790 native-only IDs, and 31 in-repo-only IDs. Both native layouts have identical active sets. Native-only
coverage includes merges, formats, retained history, registered write checks, and much more per-kind synchronization;
the legacy fixture's declared exclusions leave those cases skipped or unregistered. Counts alone are not a
per-behavior speed comparison. The full-file target at these populations requires a native average case below 43.5%
of the in-repo average; reaching it from this run requires about 63% and 70% reductions, respectively.

A separate local diagnostic ran exactly the 278 shared active IDs in each file, sequentially with one worker on
WSL2, Node 26.3.0, and Git 2.55.0. Its 834 completed cases passed. A 2-minute-45-second admission wait is excluded
from the file timings below. These are single diagnostic runs, without a discarded warm-up, and matched IDs can
still assert different backend-declared outcomes. They do not replace the complete-file hosted criterion.

| Backend  | Shared cases | File time (ms) | Ratio to in-repo |
| -------- | ------------ | -------------- | ---------------- |
| in-repo  | 278          | 46,124.219     | 1.000            |
| default  | 278          | 54,019.860     | 1.171            |
| separate | 278          | 60,816.798     | 1.319            |

The current artifacts cannot attribute the macOS timeout to contention. Portability runs timing, contention,
and full separate conformance in one native-worker invocation, but buffered output and file-only duration artifacts
do not establish which cases overlapped. Other local sessions cannot account for hosted CI costs. Controlled host
timing and native-operation diagnostics are needed before attributing a host failure or changing a numeric budget.
No timeout, budget, case population, or acceptance assertion changed in this investigation.

The retained population inventory, exact matching pattern, per-test JSON, invocation logs, and environment record
are machine-local under `task-18.3-investigation/`; the hosted source records remain under `task-18.3-hosted/` in
`.arc/user/andrew/.internal/storage-ref-backend-tools/`. The unfinished post-batching local cost pipeline was
interrupted before further implementation; only its unit tier has a retained successful measurement. Integration's
warm-up passed, but its retained pass was interrupted, and its queued lane/E2E tiers did not run. None supplies a
final changed-tree baseline or closes Task 18.3.

## Archived acquisition cost

The 600-item write diagnostic exposed work independent of object construction. `resolveArchivedReferences` fetched
all quarter blobs before selecting a UID, `captureRefViewState` acquired a full immutable snapshot for checks, and
`archivedViewRecord` decoded every archived record before selecting the requested one. CPU profiles showed repeated
metadata field extraction, canonicalization, and schema parsing; the write still made 29 default or 30 separate
native requests after object batching, including eleven object-reader requests.

The diagnostic used the producer-derived 600-item, twelve-quarter timing fixture, then removed eleven unrelated
quarter refs under exact leases while retaining the selected quarter's fifty owners and every retained-history ref.
Three successful public updates at each size used the same target, read it back, and checked its resulting version.
Per-request acquisition, parsing profiles, and wall timings were recorded after admission, with no competing heavy
test run admitted. This is a bounded local diagnostic, not the eleven-sample Windows acceptance run.

| Layout   | Archived owners | Before median (ms) | After median (ms) | Before blob response (bytes) | After (bytes) |
| -------- | --------------- | ------------------ | ----------------- | ---------------------------- | ------------- |
| default  | 600             | 599.434            | 197.486           | 1,115,748                    | 561,074       |
| default  | 50              | 186.293            | 164.698           | 96,386                       | 51,012        |
| separate | 600             | 520.187            | 170.418           | 1,115,748                    | 561,074       |
| separate | 50              | 200.698            | 154.282           | 96,386                       | 51,012        |

`archiveOwnerTrees` selects complete folders through their metadata UID while preserving every matching quarter.
`readArchivedRecord`, `resolveArchivedReferences`, and captured check-view point selection use it. Quarter selection,
retained-history checks, fresh tip captures and layout-lock admission remain; full listings still acquire and report
their complete diagnostics. The full check snapshot still loads other blobs, and fixed request counts remain
29/30. This removes unrelated acquisition and parsing without introducing a new cache or weakening atomic checks.

The native regressions failed first in both layouts: a point read returned 625,055 bytes against a 16,384-byte
ceiling, and a checked update parsed 557,132 bytes against the same ceiling. After selection, all four cases pass
while preserving the target version/content and the unrelated primary and companion. The six existing archive,
write-version, write-check, observation, snapshot, and read-source suites pass their 72 cases. Both type checks and
the exact portability-selection unit suite pass; a test fixture's quarter literals were mechanically corrected to
use `ArchiveQuarterSchema` after test typechecking identified their missing brands.

Raw request records, CPU profiles, the temporary diagnostic source, before/after source evidence, fail-first logs,
and verification logs are retained machine-locally under
`.arc/user/andrew/.internal/storage-ref-backend-tools/task-18.2-archive-acquisition/`. Temporary instrumentation was
removed and the timing helper restored before final gate checks.

## A25 — Retire the interim legacy ratio

The interim bound compared unequal workloads: the hosted run completed 310 in-repo cases and 1,069 in each native
layout, at ratios of 4.073 and 5.003. The original target was missed. The local 278-ID diagnostic is useful evidence
about the mismatch, not a hosted acceptance result. The comparison retires at cutover with the legacy suite; building
a temporary matched-cohort hosted mechanism would add machinery whose acceptance purpose disappears there.

The approved forward amendment replaces that ratio with complete hosted cost and workload reporting. Required native
coverage, the Windows operation budgets, before baselines, final tier/job re-measurements and budget-row updates,
baseline deltas, and Linux portability marginal cost remain obligations. It does not establish a pass for any pending
platform, host, timeout, or cost-measurement check.

Superseded § 14.12:

> Until the cutover CI runs both backends. The ref fixture copies a prepared template repository per test, and its
> conformance run per layout stays within 1.5 times the in-repo conformance's time on the same GitHub-hosted runner. The
> test-cost budget rows the new files touch — tier and CI-job rows in `packages/arc-framework/test-cost-budgets.json` —
> are baselined before the first file lands.

Superseded criterion 11:

> **CI cost holds:** each layout's conformance run stays within 1.5 times the in-repo conformance's time on the same
> runner, and the test-cost rows the new files touch were baselined before they landed.

Superseded Phase 18 exit criterion:

> The bursts and the Windows budget pass on their dispatched runs, each layout's conformance run stays within 1.5 times
> the in-repo conformance's time, and the host kit's results, the pack-cost measurement, and the surviving suites are
> recorded in `notes-storage-ref-backend.md`.

Propagation retains Task 9.6's historical outcome and Task 18.3's original Goal, with forward markers to 18.3.R.
Criterion 11 remains unchanged for supersession disposition at terminal verification; appended criterion 32 carries
the replacement. The Phase 18 verifier retains its Goal and uses the amended cost obligation. Baseline work, prepared
fixtures, native conformance, Windows budgets, host checks, pack measurements, and cutover-suite disposition are
unaffected. No runtime or test mechanism changes in this capture.

## Timing isolation

The native configuration places only `store-ref-timing.test.ts` in `integration-timing`, with a distinct sequence
order. Vitest completes each sequence group's workers before executing the next group. Supported integration and
lane selectors include that project once; `projectSetArguments` composes those same selectors for cost measurements.
The fixture, eleven samples, assertions, timeouts, Windows budgets, and existing artifact upload remain unchanged.

A regression copies the live configuration into a disposable native checkout and runs tiny witness files with an
explicit three-worker override. Before isolation, the timing interval enclosed both ordinary workers' intervals.
Afterward, its interval is disjoint from theirs, with exactly one timing execution; the ordinary workers' rendezvous
still requires their mutual overlap. The regression joins portability selection and survives cutover with native suites.

The supported focused controller then ran the real 600-item, twelve-quarter timing fixture and this regression with
one worker. Both passed; medians below are local Linux diagnostics, not dispatched Windows acceptance. Other local
sessions cannot explain a hosted failure, and these results do not establish the cause of the previous macOS timeout.

| Layout   | Version (ms) | Read (ms) | List (ms) | Lookup (ms) | Write (ms) |
| -------- | ------------ | --------- | --------- | ----------- | ---------- |
| default  | 5.233        | 23.923    | 107.985   | 12.003      | 233.246    |
| separate | 5.905        | 30.561    | 136.403   | 15.311      | 225.066    |

## Second dispatched platform results

Run `39536946799` finished on the pre-optimization head `d79fbf32ce493b8eba0e0dd3f790e9337d5f5993`. Linux portability
passed. The Windows job took 3,856 seconds including setup; native test execution reported 3,792.62 seconds. Windows
reported 35 passing files, four failing files, one skipped file; 1,362 passing cases, nine failing, and 84 skipped.

The two publishing-clone bursts failed at explicit production deadline refusals: the default layout expired while
applying fetched state after six retries and 21,083 ms of backoff; the separate layout expired inside Git push after
five retries and 11,436 ms of backoff. Neither result by itself establishes a lost write. Both worktree bursts passed.
Five separate-conformance cases hit the unchanged 30-second test limit: three primary-role cases, cohort close
placement, and lineage roundtrip. One advisory-lock unit case hit its unchanged five-second test limit. The operation
timing case failed the default version budget; the complete medians were retained before assertions ran.

| Layout   | Version (ms) | Read (ms) | List (ms) | Lookup (ms) | Write (ms) |
| -------- | ------------ | --------- | --------- | ----------- | ---------- |
| default  | 349.284      | 1,664.086 | 1,786.087 | 744.297     | 7,269.188  |
| separate | 50.534       | 525.351   | 377.399   | 136.864     | 2,604.711  |

The native configuration now places the burst file in `integration-bursts`, separate from ordinary files and from
`integration-timing`; the burst's own twenty writers remain concurrent. A native execution witness first observed
burst overlap with ordinary workers, then proved both special workloads run once with disjoint intervals while
ordinary workers still overlap. Supported integration/lane and cost selectors retain both projects, and portability
retains all its files. No production deadline, sample count, numeric budget, acceptance assertion, or test timeout was
changed. Isolation is not a claim about their root cause.

The full Windows log and measurement artifact are retained under `task-18.3-hosted/second-run-windows/` in the local
storage-ref-backend proof directory. macOS's previously recorded conformance timeout remains a failed result too.

## Third dispatched platform results

Run `39543872100` tested `0908ff6d95e252c0717d382351bffd7fff39f9a9`. Linux passed all 42 portability files and
1,399 cases; macOS passed the same population plus its additional 22-file, 185-case targeted selection. All four
contention cases passed on Linux and macOS. Windows completed 39 passing files, two failing files, and one skipped
file; 1,373 cases passed, three failed, and 84 skipped. Its complete separate-conformance suite passed without the
previous timeouts. Native Windows execution took 5,764.66 seconds; the separate-conformance file took 5,000.048 seconds
and the four-case burst file 458.414 seconds.

The isolated Windows medians still miss read, list, and write budgets in both layouts; version and lookup fit. The
first assertion failed at default read, but the complete measurement artifact was written before assertions.

| Layout   | Version (ms) | Read (ms) | List (ms) | Lookup (ms) | Write (ms) |
| -------- | ------------ | --------- | --------- | ----------- | ---------- |
| default  | 89.730       | 278.043   | 462.197   | 151.382     | 2,155.793  |
| separate | 63.762       | 254.759   | 448.031   | 129.739     | 2,180.604  |

Both Windows publishing-clone bursts reached recoverable pull deadlines while applying fetched state, after four
publication retries and 11,457/11,852 ms of backoff. These results do not establish a lost write: the harness stopped
at the failed publication assertion before checking final convergence. Worktree bursts passed in both layouts.
`ref-process-writer.ts` currently performs one public push after the accepted write; the bounded continuation work
exercises the existing retry remedy without repeating that write, changing production deadlines, or relaxing final
inbox/tip assertions. Raw logs, final job state, timings, and duration artifacts remain under
`task-18.3-hosted/third-run/` in the machine-local storage-ref-backend tools directory.

The earlier cost closure remains bound to its measured source. Fresh costs after the remaining platform corrections
are in Post-correction tier and hosted measurements; the host policy, fork, and separate-role gaps close in Real-host
backend trials.

## Shared native tree acquisition

`readRefTrees` now acquires `${tip}^{tree}` through `readBatchObjects`, sharing the existing operation reader with
subsequent blob requests. Native `diff-tree` still enumerates paths. A missing or non-tree root remains omitted from
the returned map, an empty tree remains readable, malformed framing fails closed, and root bodies use the same
bounded-output partitioning as blobs. An empty tip selection returns an empty map without starting Git.

The public-listing regression first observed an extra `--batch-check` child in both layouts, then returned the exact
complete record set through one closed native batch reader. Listings now use three native processes instead of four;
name-only live reads in the existing resource checks also save one process. Count expectations were tightened, while
records, diagnostics, overflow splitting, conflicts, snapshots, archived acquisition, and read-source behavior remain.
This local resource reduction does not establish a Windows budget pass. Fail-first/native logs and the source diff
are retained under `task-18.2-shared-tree-reader/` in the machine-local tools directory.

## Bounded hosted timing diagnostics

`ci.yml` adds the opt-in `portability_timing_only` dispatch input, default false and subordinate to the existing
`run_portability_pair` opt-in. The named diagnostic runs the exact operation-timing file with one worker; it does not
produce complete portability acceptance. Ordinary scheduled/dispatched runs retain the whole platform suite.

`store-ref-timing.test.ts::profileWrite` runs after both layouts’ medians have been recorded. Each trace retains native
argv, exit codes, Git elapsed time, and the public write’s wall time, then verifies the resulting content outside tracing.
The initial fixture used the read placement’s extra sequence field and was correctly refused; the probe now submits the
ordinary completed-quarter mutation shape. The timing and existing CI contract cases passed together (42 cases).

## Attempt-local immutable write acquisition

`write.ts::executeRefBatch` allocates positive object and complete-tree evidence after repository selection, replacing it
when layout or owner resolution restarts. `batch-read.ts::readBatchObjects` reuses only successful immutable queries and
object IDs; prospective staged bytes, unavailable objects, and failed acquisitions do not enter that evidence.
`readRefTrees` reuses complete enumerations by immutable tip, returning independent entry copies for mutable planners.
Filtered traversals never become complete evidence. All namespace re-captures, original-before views, layout validation,
publication locks, and atomic admission checks remain in their existing places.

Both native layouts first exposed repeated immutable acquisitions during a completed update, then passed with one
acquisition per exact query. A separate witness removes a physically required prior blob after an accepted write, checks
the next write’s `state-unresolvable` refusal, restores the bytes, and completes the retry. A deliberately cross-call
retention reconstruction incorrectly accepted that write in both layouts. The restored implementation passed all 109
focused native and CLI cases, including observations, new incoming refs, completed edits, reopen, locks, retirement,
creation facts, write checks, anchors, bulk writes, and conflict remedies. Windows medians remain unverified for this head.

## Bounded publication continuation

`ref-publication.ts::publishAcceptedWrite` permits at most five public push calls after an already accepted write, keeping
every result. Only recoverable `retries-exhausted` or `unreachable` with cause `timeout` qualify, and only with no notices,
configuration states, carried code, or other non-success outcomes. The last result remains subject to the burst suite’s
clean-publication assertions; all twenty writers, production 120-second deadlines, the 900-second test/process bound, and
the exact final inbox and remote-tip assertions remain unchanged. No accepted write is repeated.

Decision tests first exposed missing timeout/exhaustion continuation and its finite call bound. A reconstruction that
continued terminal/configuration/credential stops failed their preservation checks. Native witnesses advance the injected
clock at the executor boundary to cancel the first publication, then publish that original write and verify the peer’s
content, version, and tip after retry. One-call reconstruction failed both layouts. The restored helper, native witnesses,
and all four full twenty-writer bursts passed together (12 cases).

## Named archived acquisition

`reference-resolution.ts::resolveRefReadName` retains the selected archive folder after ordinary owner ranking. A matching
lookup signature is an acquisition plan: `lookup-acquisition.ts::revalidateLookupAcquisition` fetches every captured root,
the complete parent-directory closure (including nonempty sibling subtrees), and every original metadata/payload query
inside the operation-owned native batch reader. Equal freshly acquired ranking bytes permit reuse of their decoded
metadata; changed or unavailable evidence is decoded with the existing unreadable/ambiguity rules. Selected record and
conflict objects are then fetched afresh. No physical failure is filled from the cache.

The native resource witness first observed the repeated recursive enumeration and then passed with two Git processes for
a hot named archived read in each layout. Removing an unrelated cached sibling subtree now refuses with
`namespace-corrupt` and succeeds after object repair. A reconstruction that omitted the parent-directory closure
incorrectly returned success in both layouts. Existing cold-lookup process assertions were stale after shared root
acquisition and are tightened from four to three (unchanged hot lookups remain one). The final 146-case native/CLI run
passed across lookup tiers, current/former names, claims, linked refs, rename, read sources, project identity, namespace
diagnostics, reader cleanup, conflict remedies, and the six-hundred-item timing workload.

## Remaining writer acquisition reuse

`repository.ts::writeRefRepository` optionally reports the initial capture only when `codeHoldsState` proves the selected
code repository already stores state; `write.ts::executeRefBatch` carries that one selection view into
`write-resolution.ts::resolveRefWrites`. Preselected/separate/newly installed layouts still acquire their own initial view,
and the post-ref-lock and layout-locked admission captures remain unchanged. `write-build.ts::readWriteGroups` selects
metadata by the captured tree’s object ID, exposing existing successful-object evidence. After native Git has confirmed
every staged blob identity, `tree-write.ts::flushRefBlobStage` retains those physically written bytes for admission reads.
No failed or merely prospective write enters the confirmed evidence.

A completed-update resource bound first failed in both layouts against the previous implementation, then passed at no
more than 18/default and 20/separate calls in the generic native fixture. The 130-case native/CLI run includes directory
selection, layout changes, rename retry, atomic admission, observations, completed edits, reopen, bulk objects, locks,
retirement, creation facts, anchors, missing-object repair, conflict remedies, and the production timing workload. The
production 600-item trace now uses 22/default and 24/separate native commands, down from 31/32 in the hosted diagnostic.
This is a process-count reduction, not evidence that the Windows numeric budgets passed.

The completed `deac253ae` diagnostic run also exposed stale cold-lookup and saved-listing-token process expectations.
Those retain their complete record/token assertions and tighten to the reduced counts; no acceptance threshold is raised.

## Platform coverage after acquisition corrections

`local-vitest-runner.ts::localVitestTierArguments` explicitly retains the new named-acquisition and public-publication
boundaries in portability. Their native cases remain in the ordinary integration tier; the matching publication
decision tests run in the unit tier and also match portability’s filename selection. The existing selector contract
first failed on the missing entries, then passed with the complete selection. Cutover preservation already covers every
`integration/store-ref-*` suite and every test outside the explicitly retired implementation groups.

## Hosted diagnostic and evidence identity

Run `39554966301` tested `deac253ae`, before the later write and named-read reductions. Its Windows timing file completed
in 93.57 seconds (99.23 seconds including native test startup), rather than the full conformance workload. Windows
medians were version/read/list/lookup/write = 90.869/217.404/436.867/154.998/2175.213 ms in default layout and
59.455/185.035/400.644/125.408/2169.167 ms in separate layout. Read, list, and write missed their unchanged budgets.
The retained traces contain 31/32 native commands; their public wall times were 2746/2737 ms, versus summed Git internal
times of 1294/1234 ms. These are different clocks and profiles outside the acceptance median windows.

macOS’s timing diagnostic passed. Linux’s two failed integration files contained only the stale lookup and listing-token
process counts tightened by the acquisition corrections; the other integration shards, unit/E2E shards, Linux portability,
build, and lint/type checks passed. This was a diagnostic run, not complete Windows/macOS portability acceptance.

`gh run view --log-failed` returned the macOS step for the failed identically named matrix job; direct job-ID log
`119072759043` reports Windows’s `default read` assertion and agrees with the Windows artifact.
`ci.yml::portability-cross-platform` now appends the OS to each job name, and full dispatched pairs retain the same
post-measurement write profiles. No native workload, operation budget, or acceptance condition changes.

## Post-correction tier and hosted measurements

The corrective source and test tree is `c39ed377807ab78bcc8f3d6c037485ebbf16742d`; dispatch `39557918142` tests that
exact head. These measurements supersede the advisory cost rows at `0908ff6d` while preserving its earlier observations.
They do not amend the fixed Windows operation budgets or close host validation.

The local host remains WSL2 Linux 5.15.167.4, x86_64, Node 26.3.0, and Git 2.55.0, as in the before capture. It repeats
the same sequential, twelve-worker, tier-isolated procedure: one discarded warm-up and one retained pass per tier, with
single-run normalization. The controller records and subtracts CPU admission waits. Wall-clock values below remain
distinct from summed per-file work and total command latency. No additional local test or performance probe ran in this
checkout during the capture.

| Local tier  | Wall clock (ms) | Registered files | Completed cases | Delta from 1.1     | Delta from 0908 | Updated budget (ms) |
| ----------- | --------------- | ---------------- | --------------- | ------------------ | --------------- | ------------------- |
| unit        | 28,725          | 1,307            | 18,962          | +8,665 (+43.2%)    | -157 (-0.5%)    | 38,779              |
| integration | 697,900         | 586              | 8,072           | +490,588 (+236.6%) | -48,918 (-6.6%) | 942,165             |
| lane        | 723,230         | 1,893            | 27,034          | +495,101 (+217.0%) | -45,131 (-5.9%) | 976,361             |
| e2e         | 320,410         | 126              | 1,223           | unavailable        | -1,856 (-0.6%)  | 432,554             |

Task 1.1 retained no fresh local E2E baseline; that missing before-WU delta remains unavailable. Changes in suite
population and merged base code prevent attributing every additional millisecond to the ref backend.

Hosted values are the emitted `actualMs` from each job’s budget clock through its report step, excluding queue latency.
They are neither enclosing GitHub job durations nor file execution times. All ten functional jobs passed. The original
before sources remain main run `38857807800` for unit and reviewed-PR run `38856961515` for integration/E2E, with their
tested provenance recorded above.

The hosted functional population is 18,962 unit cases, 8,071 integration cases, and 1,223 E2E cases. Local integration
completes one additional renderer case because the real Glow command is available there; the existing `glowAvailable`
condition skips it on the hosted runner. File-level counts confirm this is the only completed-case difference between
the local and hosted integration selections.

| CI job        | Job clock (ms) | Delta from 1.1     | Delta from 0908   | Updated budget (ms) |
| ------------- | -------------- | ------------------ | ----------------- | ------------------- |
| unit-1        | 101,459        | +56,930 (+127.8%)  | +9,807 (+10.7%)   | 136,970             |
| unit-2        | 83,797         | +27,771 (+49.6%)   | -8,931 (-9.6%)    | 113,126             |
| integration-1 | 809,075        | +466,548 (+136.2%) | +140,604 (+21.0%) | 1,092,252           |
| integration-2 | 770,523        | +529,104 (+219.2%) | -203,435 (-20.9%) | 1,040,207           |
| integration-3 | 832,653        | +577,481 (+226.3%) | -16,843 (-2.0%)   | 1,124,082           |
| integration-4 | 681,069        | +399,854 (+142.2%) | +156,744 (+29.9%) | 919,444             |
| e2e-1         | 298,747        | -1,038 (-0.3%)     | +28,739 (+10.6%)  | 403,309             |
| e2e-2         | 385,245        | +40,547 (+11.8%)   | +72,819 (+23.3%)  | 520,081             |
| e2e-3         | 422,079        | +89,258 (+26.8%)   | +141,064 (+50.2%) | 569,807             |
| e2e-4         | 477,436        | +249,995 (+109.9%) | -6,646 (-1.4%)    | 644,539             |

The E2E third shard exceeded its prior advisory row by 42,708 ms; all other hosted rows were within their prior
allowance. The source result remains an overrun. Every updated baseline uses its completed measurement and retains the
existing 35% allowance, rounded upward; this scheduled remeasurement does not change an operation target.

### Complete conformance and Linux portability work

| Conformance file                         | Integration shard | File time (ms) | Completed cases | Registered skips |
| ---------------------------------------- | ----------------- | -------------- | --------------- | ---------------- |
| `store-in-repo-conformance.test.ts`      | 2                 | 106,279.673    | 310             | 736              |
| `store-ref-conformance.test.ts`          | 1                 | 776,568.083    | 1,069           | 59               |
| `store-ref-separate-conformance.test.ts` | 2                 | 744,252.669    | 1,069           | 59               |

Each native layout retains 1,069 active cases and 59 registered skips; the in-repo suite completes 310 with 736
registered skips. The previously recorded 278 shared, 790 native-only, and 31 in-repo-only active assertion IDs remain
distinct workloads. A25 requires complete reporting without an interim ratio or a hosted matched-cohort mechanism. These
concurrent shard figures are observations, not an isolated speed comparison.

| Linux separate-layout file               | File time (ms) |
| ---------------------------------------- | -------------- |
| `store-ref-directory.test.ts`            | 2,123.177      |
| `store-ref-separate-conformance.test.ts` | 488,771.789    |

The two separate-layout files account for 490,894.967 ms of summed file work. This is not a counterfactual additive
job-wall cost. The complete per-file native inventory is retained with the artifacts, including acquisition, reader,
write-batching, and publication-continuation coverage. Dispatch-only burst and timing selection remains separate from
ordinary per-change portability selection.

Raw schema-5 captures, normalized reports, complete invocation logs, derived tables, and the source-bound budget
candidate are retained under `task-18.2-post-corrections/` in the machine-local storage-ref-backend tools directory.
Hosted artifacts and exact job-ID logs are retained alongside them. Earlier diagnostic and platform failures remain in
their original evidence directories and are not replaced by these measurements.

## Dispatched platform results after acquisition corrections

Full dispatch `39557918142` tests `c39ed377807ab78bcc8f3d6c037485ebbf16742d`, with `run_portability_pair: true` and the
timing-only diagnostic flag false. The native suite retains the same 600-item/twelve-quarter timing fixture and all
twenty writers in every burst.

| Platform | Job result | All four full bursts |
| -------- | ---------- | -------------------- |
| Linux    | success    | passed               |
| macOS    | success    | passed               |
| Windows  | failure    | passed               |

All four native burst cases pass on Linux, macOS, and Windows, retaining every accepted insertion/removal and the exact
final inbox and remote tip. The bounded harness retains publication attempts; accepted writes are never replayed, and
production deadlines and the 900-second test/process bounds remain unchanged.

Windows completes 43 passing files, one failing timing file, and one skipped file: 1,393 passing cases, one failing
case, and 84 registered skips. The sole assertion failure is `store-ref-timing.test.ts`’s default-write budget; both
layouts’ complete median sets were written before assertions. Linux and macOS each pass all 45 native files (1,417 cases,
61 skips); macOS also passes its 185 additional checks.

Windows native execution reports 3,628.42 seconds, and separate conformance 2,869.875 seconds. The four-case burst file
takes 549.467 seconds on Windows, 298.177 on macOS, and 95.003 on Linux. The previous full Windows run’s native 5,764.66
seconds and separate-conformance 5,000.048 seconds remain historical observations, not an isolated causal comparison.

### Eleven-sample operation medians

| Platform | Layout   | Version (ms) | Read (ms) | List (ms) | Lookup (ms) | Write (ms) |
| -------- | -------- | ------------ | --------- | --------- | ----------- | ---------- |
| Linux    | default  | 7.749        | 41.455    | 105.706   | 16.531      | 166.186    |
| Linux    | separate | 5.272        | 37.109    | 107.229   | 14.584      | 179.921    |
| macOS    | default  | 27.158       | 95.219    | 219.324   | 36.291      | 421.840    |
| macOS    | separate | 11.309       | 73.785    | 259.647   | 33.147      | 441.211    |
| Windows  | default  | 63.779       | 146.988   | 269.405   | 113.801     | 1258.505   |
| Windows  | separate | 46.423       | 129.581   | 247.472   | 98.978      | 1294.184   |

The unchanged Windows limits are 100/150/300/300/600 ms for version/read/list/lookup/write. Linux and macOS figures are
recorded observations; numeric acceptance is enforced on Windows.

### Post-measurement write profiles

| Platform | Layout   | Native commands | Public wall (ms) | Summed Git internal (ms) |
| -------- | -------- | --------------- | ---------------- | ------------------------ |
| macOS    | default  | 22              | 495.287          | 160.926                  |
| macOS    | separate | 24              | 386.508          | 107.994                  |
| Windows  | default  | 22              | 1591.275         | 694.228                  |
| Windows  | separate | 24              | 1639.036         | 695.414                  |

Profiles run only after both layouts’ acceptance medians are recorded, and verify exact readback afterward. Git internal
times and public wall times use different clocks; TRACE2 adds I/O and some native commands may overlap. These profiles
identify remaining process work, not a hard lower bound for an untraced operation.

Exact job-ID logs, timing artifacts, write traces, and platform-result derivations are retained under
`task-18.2-post-corrections/hosted/` in the machine-local storage-ref-backend tools directory.

### Remaining Windows write-budget decision

`store-ref-timing.test.ts::measure` reports default/separate writes at 1,258.505/1,294.184 ms against the unchanged 600
ms limit. Version, read, list, and lookup medians fit their respective limits in both layouts. The prior complete run
recorded writes at 2,155.793/2,180.604 ms. Current timing runs in its isolated sequence group before the burst group;
local sessions do not contend with the hosted Windows job.

`store-ref-timing.test.ts::profileWrite` confirms 22/default and 24/separate commands: three namespace captures, five
`cat-file` launches, three tree enumerations, three hash calls, two configuration reads, two tree writes, two commit
writes, one retained-history read, and one ref update. Separate layout adds two identity lookups. The Windows profile’s
1,591/1,639 ms public walls and 694/695 ms summed Git times do not establish a lower bound for untraced medians.

Specification § 11.7 both fixes the 600 ms target and prescribes write-side object batching on the premise that an
operation reader does not shorten writes. `write.ts::executeRefBatch`, `write-build.ts::readWriteGroups`, and
`batch-read.ts::readBatchObjects` still perform operation-local reads. Extending the coordinated reader to writes would
revisit that premise and require settling its maintenance ordering. Aggregate object construction can also be investigated
under the existing batching requirement; these profiles do not establish that 600 ms is impossible. Raising the numeric
target requires explicit amendment. No new target, reader design, or amendment is selected by this evidence record.

This record closes only the independently passing burst evidence. The Windows write limit closes under A27, and the
host policy, fork, and separate-role gaps under Real-host backend trials.

## Real-host backend trials

The manual kit ran against synthetic scratch state on eight real servers on 2026-10-21, using Git 2.55.0 and the native
ref backend. Separate owner and ordinary-member credentials were bound to each invocation, without changing global
account selection or persisting credential helpers in the clones. The native executor environment is snapshotted at
binding, preserving cwd sanitization, cancellation, byte framing, and local-only object reads. A real-Git regression
first failed with an empty credential username, then passed for concurrent writer/reader bindings across all three
executor forms. Secrets remained in private local profiles; packet evidence excludes HTTP header tracing.

| Host             | Protocol v2 / prefix narrowing          | Atomic receiver | Ordinary roles / policy / fork                            |
| ---------------- | --------------------------------------- | --------------- | --------------------------------------------------------- |
| GitHub.com       | Passed                                  | Passed          | Passed; fork excludes state                               |
| GitLab.com       | Passed                                  | Passed          | Passed; fork excludes state                               |
| GHES 3.22.2      | Passed                                  | Passed          | Passed; fork excludes state                               |
| GitLab CE 19.4.1 | Passed                                  | Passed          | Passed; fork excludes state                               |
| Bitbucket Cloud  | Passed                                  | Passed          | Passed; fork excludes state                               |
| Gitea 1.27.3     | Passed                                  | Passed          | Passed; fork excludes state                               |
| Forgejo 16.0.5   | Passed                                  | Passed          | Passed; fork excludes state                               |
| Azure DevOps     | Failed: protocol v0, full advertisement | Not advertised  | Supported single-ref cases passed; full fork copies state |

Each of the seven capable hosts completed thirteen native observations: default-clone isolation, public write/push
and pull/read roundtrips, stale atomic carry, stale single-ref and deletion leases, history replay, forwarding refusal
and repair, ordinary writer, read-only refusal and restored-writer continuation, provider-created fork isolation,
protected-branch policy, an intentionally non-atomic local receiver, and leased cleanup. The fork check independently
observed a copied `main` branch and inspected the provider fork's remote state refs; ordinary clone behavior did not
stand in for a fork. The protected-code trial first held code and state unchanged, then exercised public carried-code
refusal and state-only publication while the protected branch remained unchanged. Role controls verified effective
provider permissions; native operations independently proved the outcomes and successful continuation after repair.

GitLab.com's fixture retained two older spike refs. Its complete pre-trial `refs/arc/` inventory, plus the newly
created protocol refs, was compared with the protocol v2 advertisement; no code refs escaped the requested prefix.
Those older refs were preserved. The GHES enterprise policy required a separate organization as the private fork's
destination. Bitbucket initially reported its new fork unavailable; bounded reads waited for provider completion.
Neither setup condition was treated as a backend defect or a pass before the native observations completed.

Azure is not a fully capable state receiver in this run. Repeated actual updates advertised only `report-status`,
`side-band-64k`, `quiet`, and `delete-refs`, and Git refused `--atomic` before updating any ref. Protocol v2 requests
received a v0 advertisement including `main`, without prefix negotiation. An earlier no-op `--atomic` invocation had
returned success; it did not prove receiver capability and is superseded by the actual-update packet evidence.

The Azure native trial separately proved that initial multi-ref publication refuses with all pending state retained.
An explicitly recorded single-ref registry bootstrap then allowed the remaining single-ref public roundtrips, roles,
forwarding, leases, protected-code handling, and fork observations. Its fork copied the exact source state refs,
including the protocol fixtures, matching the design's existing full-fork residual. The complete kit remained nonzero
for the missing capabilities; no non-atomic multi-ref fallback was added. The GitHub/GitLab must-hold floor, including
GHES and self-managed GitLab, passed; Azure's should-hold capabilities remain a documented limitation.

Machine-local evidence lives under `task-18.4/` in the storage-ref-backend tools directory. `native-host-summary.json`
selects each final evidence directory; `result.json` records capabilities, `backend-results.json` records native
outcomes, numbered logs preserve attempts, and provider control receipts record identities and forks. Seven runs have
thirteen completed native cases; Azure has fourteen with its explicit unsupported-bootstrap observation. Earlier setup
and diagnostic failures remain alongside the final results. Source digests are retained in `native-host-source-digests.json`.

The public synthetic GitHub policy repository, ID 1428776752, was deleted after its successful trial and evidence
capture; the API returned 404 afterward. The dedicated organization's private-fork setting and the private source's
fork permission were restored. Private provider forks remain identified in their local receipts for inspection and
separate cleanup. Every native source ref the kit created was removed with its exact lease; unrelated spike refs and
protected `main` branches were preserved. No credential, private key, or profile was committed.

## Final metadata batching

The completed-record timing path still wrote retained-history and completed-folder metadata separately after the
verified record-blob batch had flushed. A strengthened native completed-write regression first observed two standalone
`hash-object --stdin` processes in each layout. Both layouts now pre-stage final metadata without changing the
prepared admission views, preserving each completed folder's original end batch through one shared metadata-shaping
function. The existing layout-locked flush still verifies every native blob identity before admitting writes.

After that flush, metadata serialization reuses only an exact blob identity, type, and bytes already confirmed in the
same repository-bound write attempt. Prospective hashes alone never become evidence, and a subsequent public write
still starts with an empty evidence cache. The retained-history and completed-quarter commits share one resolved
actor. Fresh namespace comparison, registered admission checks, retirement sweep ordering, layout locking, and
expected-old ref publication are unchanged. Tree construction still uses its existing per-tree batches.

The focused regressions cover exact history/folder metadata, public content/version, retained end identity, reopen,
multiple ends, conflicts, mixed lifecycle writes, atomic observations, missing-object refusal and repair, and
interrupted staging. The resource witness requires one blob batch, no standalone blob writes, and at most three
object-writing processes for the completed edit in either layout. The wider focused run passed 76 cases before the
mechanical lint correction; the final focused confirmation and gate outputs are retained locally.

The unchanged 600-item, twelve-quarter fixture passed eleven local samples per operation. Default medians were
7.260/39.713/136.276/16.661/158.458 ms for version/read/list/lookup/write; separate medians were
6.241/45.268/134.530/14.966/172.291 ms. These local clocks are diagnostic and do not establish Windows acceptance or
exclude other local sessions' contention. Verified post-measurement native profiles used 19/default and 21/separate
commands, down from 22/24: two metadata writes and the duplicate actor resolution no longer launch Git.

Fail-first output, final regression output, timings, and raw native profiles are retained in `task-18.2-final-metadata/`
in the machine-local storage-ref-backend tools directory.

Hosted timing diagnostic `39658301162` binds to `3d177714ff206582d9256cd6b198656f8ca8d3b4`, with
`run_portability_pair: true` and `portability_timing_only: true`. Both platform timing artifacts retain eleven samples
over the unchanged 600-item, twelve-quarter fixture. Windows medians were 57.401/132.598/238.143/102.334/963.800 ms
for version/read/list/lookup/write in the default layout, and 41.295/112.787/225.982/83.934/979.272 ms in the separate
layout. Every read operation passes its fixed budget; both writes remain above 600 ms. The Windows diagnostic job
failed on that budget, while the macOS diagnostic job passed. This does not close Task 18.2.a.2 or full portability.

The hosted Windows profiles confirm 19/default and 21/separate processes. Five separate `cat-file` processes and
three separate recursive tree-enumeration batches remain in each write; the existing immutable tree cache already
reuses repeated tips, and none of those enumeration calls uses a path selection. A partial-tree cache would therefore
not remove these measured calls. The profile clocks, including tracing, were 1,206.967/default and
1,217.996/separate ms; these are distinct from the untraced medians above. Acquisition scheduling and operation-scoped
reader reuse remain candidates for further optimization, with no change to the numeric target recorded here.

macOS medians were 14.989/48.631/133.651/25.168/211.329 ms in the default layout and
7.800/43.120/143.309/29.345/190.451 ms in the separate layout. Raw platform artifacts are retained under
`task-18.2-final-metadata/hosted/`; the wider Linux jobs from this dispatch are separate feedback, not evidence that
the Windows write budget passed.

## A26 — bounded readers during writes

The superseded § 11.7 premise stated: "A `write` over its budget batches its object writes instead, since its time goes
to creating objects and updating refs, which no reader shortens". Hosted trace `39658301162` instead records five
independent `cat-file --batch` launches in each write after final metadata batching. The fixed 600 ms write budget
remains required. Reusing the existing reader addresses this measured acquisition cost; no local result substitutes for
dispatched Windows acceptance.

`createRefReadCoordinator` already owns per-call readers and a maintenance barrier; `GitBatchReadScope.run` binds
each process to its exact repository, environment, arguments, and output bound, serializes exchanges, and evicts a
failed reader. `GitBatchReadScope.close` awaits process termination. `createRefBackend` currently routes read/list/
lookup through this coordinator while passing unscoped context to write/batch. The amendment extends that existing
composition to the two mutation entry points. It adds no cross-call cache or new reader implementation.

The bounded author grounding and specification checks cover § 11.7, the existing cancellation and maintenance
obligations, the two mutation entry points, and the new revision tasks and criterion. Expected-old publication,
layout locking, native-confirmed staged blobs, and fresh namespace/observation validation remain required. The
amendment composes existing behavior at low derivation depth; independent review is omitted at that posture.

Both mutation entry points now use the coordinator. Native lifetime regressions cover single writes and batches in
both layouts: multiple acquisitions share one `cat-file --batch`; success, expected-version refusal, and an injected
post-acquisition error leave an exited child before returning; the failed operation leaves the record unchanged and
its next call succeeds. Maintenance waits for an active mutation's reader to exit, and the following read observes
the committed content after maintenance. Reconstructing only the former unscoped mutation composition fails all
eight new resource/ordering cases; restoring the composition passes them. The surrounding native regression run
covers physical-object refusal and restoration, atomic observations, output/cancellation failures, and staged writes.

The unchanged local timing fixture records 6.762/38.459/122.200/15.243/133.390 ms for version/read/list/lookup/write
in the default layout and 5.978/39.177/121.265/10.322/137.403 ms in the separate layout. Verified profiles use
15/default and 17/separate processes, including one native object reader per write, down from the previous 19/21.
These Linux diagnostics do not establish Windows acceptance. Evidence is retained under `task-18.2-write-reader/`
in the machine-local storage-ref-backend tools directory.

An explicit `portability_timing_only` dispatch now selects classification, shared setup, and the two platform timing
jobs alone. Previously that diagnostic also started every Linux tier and the Linux contention workload. The three
independent non-platform roots (`build`, `lint-typecheck`, `unit`) exclude the diagnostic input; their dependent jobs
retain their existing prerequisite checks. The platform pair accepts timing-only as its own explicit selection.
The diagnostic remains ineligible for full portability acceptance or final tier/job cost measurements.

Evaluating the actual before/after job conditions and dependency results selects only those three job families for
diagnostics, with either value of the separate pair flag; the former workflow fails that bounded-job expectation.
Ordinary push, pull-request, schedule, and full-dispatch selections compare identically, including light/heavy and
auto/reviewed pull-request variants. The probe and selected-job inventories are retained under
`task-18.2-diagnostic-scope/` in the machine-local storage-ref-backend tools directory.

Dispatch `39660574079` binds to `9073a123abacbd4e30aac19357f548db9bb0866b`; its live job graph confirms the bounded
diagnostic selection. Windows medians were 90.167/205.049/435.902/149.063/1,105.331 ms for version/read/list/lookup/write
in the default layout and 54.753/161.628/382.684/114.872/1,087.096 ms in the separate layout. Both writes and read/list
remain over budget; no acceptance task closes. The unchanged single-process version baseline also rose from the
prior dispatch's 57.401/41.295 ms. The differing runner baseline prevents attributing the raw write-clock increase
to the reader change alone; it does not relax or normalize any acceptance limit.

The hosted traces confirm 15/default and 17/separate processes with one `cat-file` reader each. That persistent
reader's trace duration spans its whole lifetime, including idle time between requests; summing it with the other
commands' clocks double-counts concurrent lifetimes. macOS timing medians were
25.286/123.729/314.637/65.572/341.878 ms and 13.435/66.080/235.289/30.151/279.498 ms. Its diagnostic job passed;
Windows's failed. Raw artifacts remain under `task-18.2-write-reader/hosted/` in the local tools directory.

## Scoped check-view acquisition

`checkMetaStage`, `checkMetaInboundHeld`, `checkFormerSlug`, and `checkSlugEdges` observe individual records through
`createRefWriteViews` even when a completed edit does not change placement, slug, or dependencies. Previously those
point reads called `captureRefViewState` over every manifest ref, acquiring unrelated registry trees and archive
prose before the point decoder selected its subject. The native witness measured 627,517 output bytes for a small
archived edit with large unrelated archive records; the new bound requires fewer than 16,384 bytes in both layouts.

`captureRefPointViewState` now materializes the UID-qualified work-item/cohort owner's captured live ref and its
folders selected from every captured archive quarter. It reuses `archiveOwnerTrees` and the existing point decoder;
unavailable quarter trees stay represented, and no current ref is recaptured. `createRefWriteViews` keeps these
owner-scoped promises separate from its complete before/after snapshots. Name-only, project, list, and lookup paths
retain complete acquisition. The specialization requires write-attempt evidence, avoiding repeated partial scans
for callers without that cache; no partial tree enumeration enters the complete immutable tree cache.

The complete-inventory witness reads a UID first, then requires the project registry and every archived item from
the same before/after views. Reconstructing partial-state promotion into the complete snapshot fails that witness
in both layouts; separate snapshots pass. Native physical-object refusal/repair, atomic incoming-ref admission,
completed writes, historical views, cohort closeout, and reader lifetime regressions retain their outcomes.

Local medians over the unchanged timing fixture were 6.974/39.602/126.872/16.043/116.041 ms in the default layout
and 5.724/38.742/128.859/18.258/140.130 ms in the separate layout. The trace uses 14/default and 16/separate native
processes. These remain Linux diagnostics, not Windows acceptance. Evidence lives in `task-18.2-check-point/`
in the machine-local tools directory.

## Budget calibration

The original process-cost premise comes from `analysis-storage-concurrency-spike.md` § Windows-native checkout:
Windows 11 build 26200, Node 22.17, Git for Windows 2.49, NTFS, and Defender enabled. Its `spawncost.mjs` uses
`spawnSync` for forty samples of `git rev-parse HEAD`, finding 30 ms at the median and 57 ms at p90. That is a local
machine and adapter measurement, not a GitHub-hosted operation baseline or an end-to-end derivation of the 600 ms
write target. `analysis-storage-substrate-direction.md` repeats that process-cost result.

The bounded timing diagnostic now retains three eleven-sample caller-visible baselines through the actual raw Git
adapter: `git --version`, `git rev-parse --show-object-format`, and the write's complete `for-each-ref` capture over
the same populated store. Raw samples, medians, ref count, Node/Git versions, and runner image identity accompany
the platform artifact. A separate post-measurement write records each parent-side Git invocation interval and their
overlap-aware union; the remaining wall interval includes JavaScript, filesystem work, and cleanup, not exclusively
CPU. The persistent reader's native lifetime remains separate and must not be summed with overlapping commands.

All new profiling and baseline calls run after the unchanged acceptance medians. They do not alter the workload,
sample count, numeric limits, or failure assertions. One hosted run grounded the next budget judgment before any
further enumeration mechanism; no numeric target changed at this step.

Dispatch `39663125872` binds to `26eb84244c2933ae2fdf1eb02cf4faa58cb4abc1`. The bounded job graph ran classification,
setup, and the platform pair; unrelated Linux jobs skipped. Windows failed its default-read assertion after retaining
both layouts' complete measurements; macOS passed its diagnostic and additional platform checks. This diagnostic is
not the full portability pair required by 18.2.a.2.

| Platform/layout  | Version (ms) | Read (ms) | List (ms) | Lookup (ms) | Write (ms) |
| ---------------- | ------------ | --------- | --------- | ----------- | ---------- |
| Windows/default  | 92.505       | 206.787   | 429.923   | 155.155     | 1,077.811  |
| Windows/separate | 57.707       | 166.632   | 392.314   | 119.419     | 1,077.347  |
| macOS/default    | 15.583       | 51.553    | 136.496   | 37.575      | 199.998    |
| macOS/separate   | 7.456        | 50.412    | 141.842   | 17.763      | 154.118    |

Windows uses Node 24.22.0 x64, Git 2.56.0.windows.2, image `win25-vs2026` version `20261018.275.1`; macOS uses Node
24.21.0 arm64, Git 2.56.0, image `macos26` version `20261013.0424.1`. Each baseline observes 614 state refs after the
measured and profiled edits. Baselines are separate post-measurement samples, not deductions from operation medians.

| Platform/layout  | Git version (ms) | Repository probe (ms) | Complete namespace capture (ms) |
| ---------------- | ---------------- | --------------------- | ------------------------------- |
| Windows/default  | 56.717           | 57.855                | 96.880                          |
| Windows/separate | 58.674           | 59.242                | 60.242                          |
| macOS/default    | 6.766            | 20.193                | 29.514                          |
| macOS/separate   | 5.722            | 6.116                 | 7.536                           |

The post-measurement traced writes use 14/default and 16/separate native processes. Windows profile wall clocks are
1,325.941/1,333.831 ms, with intercepted invocation unions of 1,188.237/1,191.636 ms and remaining intervals of
137.704/142.195 ms. These are single traced writes, slower than the untraced medians, not acceptance samples or a
precise partition of those medians. The remaining interval also includes the identity port's native `git config`
call, which is visible in Trace2 but does not pass through the three intercepted executor ports. Persistent-reader
lifetimes overlap other commands and are never added to this union. macOS profile walls are 185.192/165.150 ms.

`executeRefBatch` resolves ownership before choosing target locks; `commitLockedRefBatch` recaptures after those
locks to detect changed lifecycle/archive/retained bases; `commitRefStep` checks layout under the publication lock,
and `refAdmissionBasisChanged` checks fresh namespace evidence, including newly created relevant refs. These
observation boundaries remain required. Their current three separate Git captures are an implementation choice,
not a proven lower bound. Native-confirmed blobs precede admission, persisted trees precede their commits, and the
atomic expected-old ref transaction follows complete commit construction; readers close before the public return.

Two recursive `diff-tree` launches remain. Their intercepted Windows profile calls take 82.274/86.090 ms in default
layout and 80.778/74.886 ms in separate layout. Reader-based enumeration could remove those launches, but these
single traced intervals cannot establish its untraced saving, and removing them alone is not a credible explanation
for closing the 477–478 ms gap to 600 ms. Combining tree batches, scheduling independent commit construction, and
reducing actor/config acquisition remain possible optimizations, not permission to remove admission or publication
boundaries. The current process counts are not irreducible minima.

Assessment: the original local 30 ms process estimate understates the observed hosted minimal-call medians by about
1.9 times; no end-to-end or user-experience derivation for 600 ms was found in the planning evidence. The target is
optimistic and uncalibrated for this hosted workload, not proven impossible. Consecutive hosted runs also show
material baseline variation. GitHub's [hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
specifies machine resources, not a Git-operation latency guarantee; external research cannot settle this backend's
numeric budget in place of native measurement.

Recommendation, approved as A27: retain the 100 ms version and 300 ms lookup limits; forward-amend read to 300 ms,
list to 600 ms, and write to 1,500 ms. These round upward from the latest worst-layout medians with at least the 35%
headroom already used for advisory test costs, while remaining explicit regression limits rather than a user-facing
latency promise. That headroom is a proposed policy, not a statistically established stability guarantee from one
calibration run. Retain the complete workload, correctness/resource regressions, and full dispatched portability
acceptance. Do not implement another enumeration mechanism solely to pursue the uncalibrated limit.

Run metadata, complete raw samples and traces, the Windows failure log, and the derived interval summary are retained
under `task-18.2-budget-calibration/` in the machine-local storage-ref-backend tools directory.

## A27 — calibrated hosted Windows limits

The superseded § 11.6 premise read: "start costs about 30 ms on Windows against 1.3 ms on Linux." The superseded
§ 11.7 table required version ≤ 100 ms, read ≤ 150 ms, list/lookup ≤ 300 ms, and write ≤ 600 ms. The original local
spike and the production-adapter calibration above establish that the premise did not calibrate those hosted limits;
they do not prove the former limits impossible. Approval selects a bounded change to the regression limits before
further enumeration work, without treating the previous failed runs as passes.

The approved limits are version 100 ms, read 300 ms, list 600 ms, lookup 300 ms, and write 1,500 ms. The three changed
limits round above the latest worst-layout medians with at least 35% headroom. The margin is an explicit policy choice,
not a proven latency guarantee. The full dispatched pair, eleven samples, 600-item/twelve-quarter fixture, native
correctness and resource coverage, and per-call reader/admission boundaries remain required. No new tree-enumeration
mechanism is included. `store-ref-timing.test.ts::budgets` is the enforcement locus; its existing measurement loop and
Windows-only assertions remain the implementation path.

The propagation sweep covers § 11.6's premise, § 11.7's table, criterion 9 and its appended replacement, Tasks 18.2
and 18.2.R2, and the appended task-list criterion. Earlier completed reduction tasks and A26 retain their historical
unchanged-budget claims; the new criterion supersedes only those numeric obligations. The phase exit criterion,
§ 14.10's full-run requirement, A25's CI-cost obligations, and Task 18.7 continue to require the current budget without
changing their outcomes. No Success Criteria checkbox changes before terminal verification.

## Full-run harness corrections

Full dispatch `39664555792`, source `ec617a92e5c58f02f105e9dfd78681288afc9228`, reports four failing cases in Linux
integration shard 3: three authored CI-condition cases and one files-format snapshot control. Other Linux integration
shards, build, lint/types, unit, E2E, Linux portability, and macOS portability pass. Windows remains in progress when
these corrections begin; no push or replacement dispatch cancels it.

`e2e-light-ci.test.ts::selected` evaluated the actual build condition without the `inputs` context that the new
diagnostic exclusion references. It now supplies an empty object for ordinary events, matching absent dispatch input
properties. The native classifier and authored job conditions still decide the expected light-content selections.
The same three cases fail locally before this correction and pass afterward. No workflow selection changes here.

`store-ref-snapshot.test.ts` lists the single `refs/arc/` prefix in its files control and final stable readback,
excluding `refs/arc/tmp/` so the reftable arm's saved manifest stays outside the records; this matches the
single-iteration boundary the real version path uses. The hosted Git 2.55.0 failure in this run, exit 128 with duplicate
refs at differing object IDs, was first attributed to the control's two patterns. It was not their doing: Git refused
the listing with `fatal: Duplicated ref, and SHA1s don't match`, and the same refusal recurred with one prefix on Git
2.53.0 during verification (A28). The control counts that refusal as a tear beside partial and mixed listings; every
other error, the stopped-writer readback of all 4,096 refs at one tip, and the reftable arm's 128 complete, uniform
snapshots stay strict.

Both corrected files pass all six cases locally on Git 2.55.0. The original hosted failure and before/after focused
logs are retained in `task-18.2-a27-full/` and `task-18.2-ci-harness/` in the machine-local tools directory. These
test-only corrections do not change the backend, workload, numeric budgets, or hosted acceptance requirements.

## Complete calibrated portability acceptance

Dispatch `39664555792` binds to `ec617a92e5c58f02f105e9dfd78681288afc9228`, with `run_portability_pair: true` and
`portability_timing_only: false`. Both complete platform jobs pass. Windows completes 44 passing files and one
platform-skipped file, with 1,404 passing cases and 84 skips; macOS completes all 45 native files with 1,427 passing
cases and 61 skips, then its additional 22-file suite with 185 passing cases. Linux portability completes the same
45-file native selection with 1,427 passing cases and 61 skips. Each platform passes all four twenty-writer burst
cases, twelve platform/case combinations in total.

| Platform/layout  | Version (ms) | Read (ms) | List (ms) | Lookup (ms) | Write (ms) |
| ---------------- | ------------ | --------- | --------- | ----------- | ---------- |
| Windows/default  | 56.168       | 132.377   | 286.859   | 101.288     | 729.986    |
| Windows/separate | 39.729       | 120.956   | 261.038   | 83.175      | 727.299    |
| macOS/default    | 27.548       | 67.118    | 144.155   | 37.942      | 176.798    |
| macOS/separate   | 9.249        | 55.884    | 136.376   | 44.491      | 147.001    |

All eleven-sample Windows medians satisfy A27's 100/300/600/300/1,500 ms limits over the unchanged 600-item,
twelve-quarter population. The earlier 600 ms write limit would still fail; approval of A27, rather than a claimed
pass against the original limit, is the basis for acceptance. Native profiles retain 14/default and 16/separate
processes; their single traced write walls are 905.613/990.322 ms, separate from the untraced acceptance medians.
Windows's job takes 65 minutes 9 seconds; its native runner reports 3,823.620 seconds, including its burst cases.

The overall workflow remains failed because Linux integration shard 3 contains the two harness failures described
above. This is not a claim that every CI job passed. Follow-up dispatch `39674185052` tests their corrected source
`a59b321c1` on Linux with the platform-pair flag false. The bounded diff from the passing platform source changes only
the two harnesses and execution notes/task state: no backend source, timing limit, fixture population, measurement
loop, or workflow changes. The reftable consistency assertions remain identical, and the files control now uses one
iteration. This is the applicability basis for retaining the passing complete platform evidence without repeating
the billed pair; the Linux run below confirms the harness fixes.

Run/job metadata, native logs, timing artifacts, traces, and duration inventories are retained under
`task-18.2-a27-full/` in the machine-local storage-ref-backend tools directory. The thirty-second watcher detected the
Windows completion before the follow-up dispatch; earlier failures remain preserved as failures.

## Corrected Linux CI and advisory cost

Dispatch `39674185052` passes at `a59b321c1e18f6fbf61ba89d69928499e45dd6a1`: build, both unit shards, lint/types, all
four integration and E2E shards, Linux portability, and duration merging. Integration shard 3 contains both corrected
files: all four authored CI-condition cases and both snapshot cases pass. Its complete population is unchanged at
2,590 registered cases: 1,854 pass and 736 skip, replacing the earlier 1,850 passes and four failures. No case was
removed to obtain the passing result.

Nine of the ten functional job clocks are within the retained advisory rows. E2E shard 1 reports 490,458 ms against
its 298,747 ms baseline and 403,309 ms allowance: an 87,149 ms advisory overrun, not a test failure. The budget remains
unchanged. Both this run and `39664555792` assign the same 33 files to that shard; no E2E, production, or workflow
source changes between their tested heads. Its `Run balanced shard` step increases from 288 to 473 seconds, while summed
concurrent file work increases from 798,912 to 1,319,524 ms. Several unchanged files slow, including Errand, review,
hook-commit, session-init, and init coverage; the exact runner-level cause is not established by these artifacts.
Queue latency is not included in the job budget, and local test contention does not explain this hosted observation.

This preserves the advisory overrun rather than raising a budget or attributing it to the harness fix. A25's complete
conformance reporting, before/after tier/job measurements, retained 35% allowance, and Linux marginal file-cost record
remain in the earlier cost sections; they are not replaced with these different measurements. The fixed Windows
operation limits are independently satisfied by the complete platform run above.

The complete follow-up run metadata, job-log archive, corrected shard log, and paired E2E duration inventories are
retained in `task-18.2-a27-full/`. The watcher polled through completion rather than waiting for a status request.

## Platform, host, and cost closure

- Complete platform dispatch `39664555792` proves all twelve twenty-writer platform/case combinations, both layouts'
  calibrated Windows medians, full native platform selections, and the additional macOS suite. The bounded source
  applicability above preserves that evidence across the two harness-only corrections.
- Corrected Linux dispatch `39674185052` proves the complete functional suite and native portability selection at the
  corrected source. The two prior harness failures pass with their case populations and assertions retained.
- The A25 cost sections retain complete conformance workloads, final fourteen-row tier/job baselines and deltas,
  queue/raw/job-clock distinctions, and Linux separate-layout file work. The later advisory E2E overrun is explicit
  and does not become a pass against its retained allowance.
- The real-host trial retains all seven fully capable hosts' native observations and Azure's capability refusals,
  supported continuation, and full-fork residual, meeting the GitHub/GitLab must-hold floor without a fallback.
- The sixteen-person, forty-snapshot pack trial retains paired object inventories and all three corpus measurements;
  A24's identity-suffixed mapping retains logical and projection addresses under native conformance.
- The cutover inventory names retained contract/native/consumer coverage, implementation-specific retirements,
  mixed-suite splits, dormancy cases, and fixture sequencing. These two corrections change no suite classification.

This closes the phase's stated scenario and the A25/A26/A27 revalidation boundary. Success Criteria are marked at
terminal verification.

## E2E cost investigation and follow-up disposition

The paired hosted E2E shard-1 artifacts above contain the same 33 files and 319 cases. The test step rises from
4m48s to 7m53s without E2E, production, or workflow source changes between the tested heads. Its summed concurrent
file work rises by about 65%; this is a different clock from elapsed shard time. Test growth cannot explain that
particular jump, and the precise hosted-runner cause remains unproved. The broader before/after WU measurements
also include suite growth and merged base changes, so they do not isolate this backend's incremental cost.

Source inspection identifies candidates, not measured savings. `e2e/errand.e2e.test.ts` repeatedly creates a repository
and runs CLI initialization in `beforeEach`, including the open and close groups. Its review-response group already
uses `prepareRepositoryTemplate` and `copyPreparedRepository` for independent copies. Compatible fixture reuse could
remove repeated setup while preserving real CLI assertions. The Errand file itself rises from 229.4 to 385.5 seconds;
as one file it cannot be divided among shards by the current sequencer. Splitting at command-group boundaries could
reduce the longest shard without reducing total executed work, whereas fixture reuse could reduce both costs.

`helpers/heavy-first-sequencer.ts::assignDurationShards` already assigns complete files greedily by recorded duration,
with fallback weights for unseen files. `ci.yml` supplies one immutable input to every shard, then merges disjoint
results and caches fresh durations after successful dispatched or scheduled functional runs. Dispatch `39674185052`
successfully saved `arc-test-durations-Linux-39674185052`; a manual reassignment is not the first missing mechanism.

The agreed disposition is a separate evaluation after this WU ships, held in the identity-global USER-INBOX entry
“Evaluate hosted E2E fixture cost and oversized-file scheduling” for the next housekeep drain. This section preserves
its evidence, not an execution queue. The evaluation can separate setup cost from exercised behavior, assess compatible
fixture copies, and consider splitting persistent oversized files after observing refreshed scheduling. Coordinate
with the cutover suite inventory above: preserve public consumer assertions and avoid investing in obsolete direct
Errand-ref fixtures. No fixture, shard, test population, or budget changed during this investigation; the advisory
overrun remains recorded.

## A28 — refused torn listings

Under the files format, Git refuses a `for-each-ref` outright with `fatal: Duplicated ref, and SHA1s don't match` when
one loose-ref directory read meets a ref twice at two values while a concurrent transaction rewrites it. The snapshot
control met it on hosted Git 2.55.0 (dispatch `39664555792`) and on the check VM's Git 2.53.0 in the verification merge
gate; four focused VM repeats after the control's correction passed, one of them through the counted refusal. Every
observation comes from 4,096-ref transactions in a tight loop; the rate at the backend's ordinary writes of one to three
refs is unmeasured.

The backend's four state-ref listings retry that refusal alone, three attempts in all with no wait, and rethrow Git's
error past them (spec § 4.3). The cap keeps the retry safe without relying on the refusal being transient. Git's own
iteration inside `fetch` and `maintenance run` stays outside, where a refusal fails that call like any other Git
failure.

## A29 — Per-change cost and selection of the store suites

Verification paused at `212f6432e` when the merge gate on the check VM took about 18.7 minutes, 984 s of it the
integration tier at five workers, against 7–8 minutes before this change. A29 halves the store suites' per-change cost
and runs them only on changes that reach them (spec § 14.14).

### What the measurements showed

- Summed integration test work was 4,342 s: the `store-ref-*` files 2,633 s (61%), of which the two ref conformance
  files 822 s, and everything else 1,709 s. With no store suite at all the gate would still take about 8.7 minutes.
- `test-cost-budgets.json`'s local integration tier went from 167,261 ms at `124a36047` to 697,900 ms. 18.3.R.b and
  18.2.g updated the rows to the measured figures under the advisory 35% allowance, so the row recorded the growth
  rather than bounding it.
- Per test, on the VM at five workers: the 162 non-conformance `store-ref-*` files hold 1,652 tests and 1,814 s, median
  581 ms; the 651 tests over a second carry 80% of it, and separate-layout tests 526 s (29%). The cost is broad, not a
  few slow tests.
- Git processes per operation, from a local probe: a write starts 13, four of them `git config arc.identity`; a push
  35–45; a pull 21–27. A caller trace over four heavy files found identity reads at 8.8% of 58,277 spawns, and the
  starting state each test builds before its behavior at 38–71% of a file's spawns.
- Building an ancestry-style starting state (three writes, three pushes, two pulls) took a median 548 ms; copying the
  built origin and clones with their paths rewritten took 36 ms, and a pull on the copy worked.
- The layout dependency map found the store repository chosen for each operation attempt and the calls made against it
  bound to it, while designation, transport targets, carry, and the code repository's identity read the code repository
  by design, so a 50-case separate subset reaches every mechanism the full separate run does. Seven layout mechanisms —
  store creation, first designation and backing install, the config stop beside a code push, the remedies' `--git-dir`,
  reftable fetch-lock classification, the joined code and state push, and the moves — are reached by neither conformance
  layout and rest on integration files that run both.
- Three value reviews over 36 files and 621 runs classed 439 keep, 98 default-layout-only, 66 duplicate, and 18 weak.
  These are unverified upper bounds; 18.R2.c verifies each case against source and the criteria it evidences.
- All but one of the 164 `store-ref-*` files share the same 845 source files in their static import closures. Replayed
  over the last 80 merges to `main`, 60 would have reached no store suite and 18 nearly all of them.
- At eight workers the whole integration tier took 814 s (−17%) while summed test time rose to 6,040 s (+39%).

### Superseded text

- § 14.1 ¶1: "over real temporary repositories and a bare origin, once per layout: the default in a files-format code
  repository, and the separate one in its reftable directory."
- § 14.5: "Integration tier, every change:"
- § 14.7 ¶1: "is interrupted after each step and run again to completion"; its follow bullet: "and interrupted after
  each step, rerunning its answering command completes it"; criterion 7: "each move, interrupted after each step,
  completes on a rerun".
- Criterion 5: "Every integration case of § 14.5 passes on every change, and the bursts pass with no lost write in one
  dispatched run of the Windows and macOS pair and one of the Linux portability job before this change lands."

### Decisions

- Identity resolves once per ref-store operation, not once per shared default ports, which the in-repo implementation's
  live callers also use: the measured cost is the ref backend's, and the live path stays unchanged until the cutover.
- The separate subset is a declared registration, not a name filter, so the selection cannot drift from the cases.
- A restart case stands for each distinct recovery state § 10.3 gives a move or a follow, not each step hook. The state
  counts what the interrupted run left on the machine, so the value review's eight same-path groups for the remote
  move's 23 hooks and four for the follow's 11, drawn before that counted, seed 18.R2.c's derivation rather than settle
  it: the pointer and fetch boundaries, at least, meet different leftovers.
- The store check passes a change that reaches no suite with a report of what it selected, since a gated check cannot
  use a no-evidence exit (`no_evidence_exit`, `lib/checks/declaration.ts`). It withholds its paths and reads the change
  itself, because the check framework splits a files check's paths into argument batches and runs its command once per
  batch (`batchCheckPaths`, `lib/checks/batching.ts`): this branch's own source and test changes make two from the
  package directory.
- Selecting at the merge gate departs from `strategy-quality-gates.md`'s whole-suite merge run (spec § 14.14). It rests
  on reach counting every path the suites' code locates at run time — among them `src/cli.ts`, which three store helpers
  read, and the package's `arc/`, `templates/`, and `init-recipe.json`, which `lib/paths.ts` finds from the closure of
  every store suite but `store-ref-timing-isolation` — a path the runner cannot place failing the check, and on a full
  run on every push to `main` in a CI job of its own, since CI runs integration only on reviewed pull requests,
  dispatches, and the weekly schedule (`ci.yml`). Counting `lib/paths.ts`'s finds costs precision: 7 of the last 80
  merges to `main` changed them and no source or test file, and would now select every store suite.
- The target sums Vitest's per-file durations, the measure the 2,633 s baseline used (the merge gate's integration run
  at `212f6432e`), so a starting state built once per file, in a hook or a test, counts where it is spent; collection,
  where module-level code runs, is outside the measure.
- Apart from the cases the specification or a criterion names in both layouts, which keep both, a case runs both layouts
  only when what it asserts depends on layout or format code beyond the selection and binding every operation runs and
  the commit step every committing operation runs, and a case that runs each ref format in the default layout keeps its
  formats there unless what it asserts also depends on the layout. § 14.1's separate subset reaches the shared code on
  every change that reaches it, and counting passage through it would keep every case in both layouts, leaving no case
  for the default layout alone.
- The portability tier's pull-request run leaves the store suites to the store check: the `portability` job (`ci.yml`)
  ran the store files `localVitestTierArguments("portability")` lists on every reviewed full-weight pull request
  whatever the change reached, the whole separate conformance suite about 490–500 s of hosted file time (§ Complete
  conformance and Linux portability work; § Final tier and job measurements). Its scheduled and dispatched runs keep
  them whole, so the Windows and macOS pair still covers § 14.10 and the bursts keep their dispatched runs.
- The selection's suites, locating modules, and widening inputs live in a data file the runner reads rather than in the
  check's entry, whose schema is the framework's strict one (`z.strictObject`, `lib/checks/declaration.ts`); putting
  them in the schema waits for the rule to extend past the store suites.
- The store runner takes the heavy-test admission the integration tier's runs take (`withLocalHeavyTestAdmission`, which
  the integration tier reaches through `executeVitestSelection`), so 18.R2.g compares runs under the same admission. The
  host runner (`remote-check`'s `command_class`) gives the integration class, with its checkout turn and memory tokens,
  only to commands naming `test:integration` and runs any other as a light command, so its classification of the store
  check's command is a host change made before the store check first runs on the remote check machine, when 18.R2.f puts
  it in the merge gate.
- Not taken here: consolidating push and pull's repeated ref listings, which carry the concurrency design; extending
  selection to the rest of the suite, and re-measuring the store's import coupling after the cutover's deletions, both
  captured for `test-suite-contention-hardening`.

### The verified cut set

18.R2.c verified every candidate the value reviews and the layout map named, and every case the reviews kept in both
layouts, against source at `949ef8638`, § 14.14's layout rule, § 14.7's restart rule, and the criteria each case
evidences, and the set was approved whole. It removes about 255 s of summed file time from the 2,633 s baseline: 68 sync
runs, 10 move and read-source runs, 32 import runs, and 45 runs among the cases the reviews kept in both layouts, while
the restart rows grow by 26. With 18.R2.b's subset that leaves about 1,975 s before 18.R2.a's and 18.R2.e's savings, so
prepared states carry the remaining 650 s or so.

- **A recovery state is what the rerun reads.** A boundary's state is what the rerun reads that decides its path or the
  data it carries: the record and its fields, the published refs, and each leftover read before the rerun clears or
  overwrites it. A leftover cleared or overwritten unread distinguishes nothing, and a predicate that exits at another
  conjunct because it read another value meets another state. Each configuration a move runs in — its direction, a
  setting or a no-target start, transient refs or a state remote present — has its own sets. Not taken: collapsing
  configurations whose rerun takes their first run's path, about 67 s cheaper but treating a record's direction as no
  part of its state; and splitting on leftovers the rerun wipes unread, about 90 s dearer.
- **What observes the layout.** A test's own `--git-dir` reads bind the store rather than observe the layout; syncing
  through `backing` passes through designation; keeper refs are not keeper locks; static remedy text and `Arc-Actor`
  labels observe nothing. § 14.5's "in both layouts" on the tracking-ref push covers its listing and reopen clauses, not
  the two-worktree item after them. The import's store directory is `writeRefRepository`'s, which the separate subset
  reaches on every change.
- **Import cases kept in the separate layout.** `store-ref-import-notes`' environment-file case stays as criterion 31's
  last separate import of personal documents, so `store-ref-import-personal-layout`'s goes; `store-ref-import-links`'
  footer-task capture stays as criterion 26's only separate keyless exclusion. `store-ref-import-parked`'s diverged case
  stays as the only end-to-end diverged-parked refusal, and comparison tests 1 and 3 fold into test 2.
- **Defects the derivations found** are exposed and fixed in their own increment, 18.R2.h, rather than inside the cut
  set: an interrupted local-only import losing the notices § 10.11 owes for origin's transient refs; a remote move
  overtaken inside its switch ending with no record beside its pointer, designation, and layout changes; layout
  gathering refs outliving a switch its predicate completes after the source delete; a separate-layout import trial
  creating the store directory § 10.5 says it drops; and kept import tips a rerun no longer re-homes never being pruned.
  A step hook after the layout source's delete reaches the states no hook interrupted; the two it reaches while leaving
  the source get rows, which expose the gathering-ref defect, and the rest only return an empty report.

#### Restart sets

Each set lists its boundaries, then the row standing for it. "Add" marks a row 18.R2.d writes, "18.R2.h" one that
exposes a defect, and "19.1" one the verification's review adds. "No row" marks a state 18.R2.h's hook after the source
delete reaches whose rerun differs only by returning an empty report, and "unhooked" one no hook reaches. A pristine set
holds no record, nothing published, and only leftovers the rerun clears, so a first run stands for it.

- **Layout move out, from a setting:** {build, record} → `store-ref-layout-move`'s unrecorded-build cases (`:388`,
  `:400`), re-pointed at the move out; {rename, the rename fault} → [separate, rename]; {designation, delete} →
  [separate, designation], with the killed run's lock takeover (`:533`); {after the source delete} no row.
- **Layout move out, no target:** {build, record} pristine; {rename} add; {delete} add; {after the source delete} →
  `store-ref-move-record`'s [remove].
- **Layout move in, from a setting:** {build, record} → [default, record]; {the landing fault} → `:210` [default,
  setting]; {designation, rename} → [default, designation], and `:292`'s `move-incomplete` from pull and push gains
  move-in rows in place of the killed run's default case; {delete} → [default, delete]; {after the aside delete} no row.
- **Layout move in, no target:** {build, record} pristine; {the landing fault} add; {rename} add; {delete} → `:493`;
  {after the aside delete} no row.
- **Leaving the source, code to backing:** {copy} pristine; {copied, record} → [c2b, leave.copied]; {recorded,
  leave.switch, follow.switch, layout build, record, and rename} → [c2b, leave.recorded]; {layout.designation} → [c2b,
  layout.designation]; {layout.delete} add; {after the source delete} 18.R2.h; {follow.switched, leave.switched} add;
  and one row add from a follower holding the old remote's moved-record tracking ref.
- **Leaving the source, backing to code:** {copied, record} add; {recorded … layout.record} add; {layout.designation}
  → [b2c, layout.designation]; {layout.rename} add; {layout.delete} add; {after the aside delete, before the build's}
  unhooked; {after the build's delete} 18.R2.h; {follow.switched, leave.switched} add.
- **Leaving the source, backing to backing:** {copied, record} add; {recorded, leave.switch, follow.switch} add;
  {follow.switched, leave.switched} → [b2b, leave.switched].
- **Import, default layout:** {build} pristine; {land} → `store-ref-import-landing`'s [default, land]; {land with
  transient refs} → `store-ref-import-errands`' changed-lease case [default]; {publish} → [default, publish]; {publish
  with kept tips} → the errands' retained-lease case [default]; {a push fault after the state push} →
  `store-ref-import-landing:54`, and with kept tips add; {remote-delete}, {drop-kept} → the errands' advanced-origin
  case [default]; and {publish with kept tips} moved into the separate layout before its rerun → the errands'
  moved-layout case [default] (18.R2.h).
- **Import, separate layout:** {build} pristine; {land} → [separate, land]; {land with transient refs} add;
  {local-delete} → the errands' retained-lease case [separate], and with `backing` add; {publish with `backing`} add;
  {publish with no state remote} → [separate, publish], seeded with an origin transient ref (18.R2.h); {remote-delete},
  {drop-kept} → the errands' advanced-origin case [separate]; and {local-delete} and {publish} moved into the default
  layout before the rerun → the errands' moved-layout cases [separate] (18.R2.h).
- **Remote move, code to backing:** {fetch-source … record} pristine; {copy} → copy; {copied, forward} → copied;
  {forwarded, pointer} → forwarded; {switch, layout build, record, and rename} → layout.rename; {layout.designation,
  layout.delete} → layout.designation; {switched, read-destination, list-source, recopy} → switched; {recopied,
  delete} → recopied; {deleted, finish} → deleted.
- **Remote move, backing to code:** {copy}, {copied, forward}, {forwarded … layout.record} standing at layout.record,
  and {layout.designation} add; {layout.rename} and {layout.delete} → `store-ref-remote-restart:14`'s backing-to-code
  rows; {switched … recopy} → `:104` [code]; {recopied, delete} and {deleted, finish} add.
- **Remote move, backing to backing:** {copy}, {copied, forward}, and {forwarded, pointer, switch} standing at switch
  add; {switched … recopy} → `:104` [backing]; {recopied, delete} and {deleted, finish} add.
- **Follow, push, code to backing:** {copied, record} → copied, and add the same with nothing left to push; {recorded,
  follow.switch, layout build, record, and rename} → recorded; {layout.designation} → layout.designation;
  {layout.delete} → layout.delete; {switched … follow.recopy} → switched; {follow.recopied, follow.delete} →
  follow.recopied (19.1); {deleted … finish} → deleted. The switched row reruns with the answering command rather than
  `migrate`; the command finishes a recorded follow through the same resume, so that row stands for it at every
  recorded boundary.
- **Follow, push, backing to backing:** {copied, record}, {recorded, follow.switch}, and {deleted … finish} add;
  {switched … follow.recopy} → `store-ref-follow-races:125`; {follow.recopied, follow.delete} → follow.recopied (19.1).
- **Follow, push, backing to code:** {copied, record}, {recorded … layout.record}, {layout.designation},
  {layout.rename}, {layout.delete}, {switched … follow.recopy}, and {deleted … finish} add, the last at follow.finish.
  Once the move back ends, the old backing repository holds nothing to clear unless a publication lands there late, so
  {follow.recopied, follow.delete} stands at the other two push follows' follow.recopied rows, whose cleanup runs the
  same code in either layout.
- **Follow, read, code to backing** (`off` takes the same path with another role): {recorded … layout.rename},
  {layout.designation}, {layout.delete}, and {switched, finish} add.
- **Follow, read, backing to backing:** {recorded, follow.switch} and {switched, finish} add.
- **After a switch's layout source delete:** a remote move's or a follow's layout.deleted, code to backing and backing
  to code, leaves the source's refs gone and the layout's gathering refs in place, which the switch's completion check
  reads, so the rerun runs the switch again and finishes it with nothing left to delete. No row of these configurations
  stands for it: `store-ref-leave-source-restart`'s layout.deleted rows run the same check and finish through the
  follow's switch, and `store-ref-remote-undo`'s reach the remote move's check before its undo.
- **After a record's removal** (`record.removed`): a remote move, a follow, leaving the source, and a recorded move's
  ending each remove their record before clearing their gathering refs, which any later migrate clears before reading
  anything → `store-ref-remote-restart:134`'s rows, a no-target run and a new move; a layout move removes its record
  after clearing its gathering, so its state is the finished move's.
- **Ending a recorded move by leaving the source:** {leave.withdraw}, the registry commit made but no ref holding it,
  reads as the ending's start → `store-ref-leave-recorded`'s deleted-destination row, whose concurrent registry
  publication there loses the withdrawal its lease and runs the round again, and its failed-withdrawal row's read-only
  refusal; {leave.withdrawn} → the failed-withdrawal row, which pauses there and reruns.
- **A remote move overtaken by a move back:** forwarded, switched, and delete keep their rows; copy, whose rerun
  continues and moves the state again, and copied add; inside the switch (A30), {switch, layout build, record, and
  rename}, the pointer changed and the layout not, → layout.rename, {layout.designation, layout.delete} →
  layout.designation, and {layout.deleted}, the source's refs gone, which the layout move back reads, → layout.deleted,
  all 18.R2.h; the undo's layout move back interrupted at {build, record}, before the code repository's refs land, reads
  as the state the undo started from, the rebuild clearing those leftovers unread, whose row stands; at {designation,
  rename}, the refs landed and the store directory still present, and at {delete, deleted} or past the move back with
  the pointer, which the undo writes last, still the destination's, one 18.R2.h row each; an undo with nothing of the
  switch left reads as an end before the switch, whose rows stand; and the states between the undo's writes after the
  move back read as past it, since the pointer goes last.
- **A follow overtaken by a move back** (A30): {follow.switch, layout build} ends as the stale follow does, its switch
  not begun, → `store-ref-follow-undo`'s paused-before-switch row (19.1); {layout record and rename}, begun by the build
  and gathering refs they leave, → layout.rename, {layout.designation, layout.delete} → layout.designation, and
  {layout.deleted} → layout.deleted, all 18.R2.h; its undo's states as the remote move's, with their rows; and a follow
  answering `push` between two backing repositories from one it read, overtaken after `configureBacking` repoints
  `backing` and before it sets that remote's role, the undo returning `backing` to the source's URL and `read`, one
  18.R2.h row on the `backing.repointed` hook 18.R2.h adds between the two, since a code remote it read loses its role
  only to the `off` that completes the switch.
- **A recorded follow overtaken otherwise** (A30): its old remote's forwarding record replaced, and its new remote
  carrying another move's forwarding record, one 18.R2.h row each, at follow.recorded.
- **A trial over a recorded move:** forwarded, switched, and overtaken keep their rows; a pre-forward record, at
  copied, and a switched move then overtaken add; and a move overtaken inside its switch, whose trial reports the undo,
  18.R2.h (A30).
- **A move back interrupted** (`store-ref-remote-ended:48`): copy, copied, and forwarded keep their rows.

Measurement scripts and raw results, the per-file baseline, the layout dependency map, and the three value reviews among
them, sit in the checkout's `.internal/storage-ref-backend-tools/verification/selection/`.

### Measured after the work

**The per-change figure.** The merge gate at `0b92e5e85` (`merge-gate-every-2.log` in the checkout's
`.internal/storage-ref-backend-tools/verification/measure/`), asked for every store suite in its per-change form, ran 168
of the 171 files, the whole separate suite and the two `ARC_STORE_BURSTS` files left out. Their per-file durations sum to
1,840.3 s against the 2,633 s baseline, −793 s (−30%), with 2,671 cases passed and 59 skipped; the run before it, at
`bfdc9cc05`, summed 1,868.8 s, its integration tier failing on a native-build fixture that did not copy the reach
declaration, fixed in `0b92e5e85`. § A33 records why the halving target gave way to wall-time terms and the replay of
the last 80 merges through the store check's own selection.

**Admission.** The store check ran on the check machine in its own pool at five workers, the count the baseline's
integration pool used, under the heavy-test slot (a 1 s wait) and the host runner's integration class, which held it
460 s for memory while the integration tier ran; its Vitest wall time was 395.7 s and its check 860 s with the wait. The
integration tier, without the store suites, summed 2,061 s over 422 files in 460 s of wall time, against 1,709 s for
the same population inside the 984 s mixed run at `212f6432e`; the two runs' conditions differ, so that difference is
not attributed. The whole gate took 14 min 30 s.

**The store check's own cost,** which no row's project set describes: the reach computation alone, 2.7 s, for a change
reaching no suite (`no-reach-check.log`); the per-change form's 395.7 s of wall time for one reaching them all; and on
CI the unsharded store job's full run, 965 s and 1,573 s of job clock in dispatches `39869323324` and `39871608329`.

**The rows.** The local captures ran at `d53e51816`, retained in the checkout's
`.internal/storage-ref-backend-tools/task-18.R2.g-tiers/`, by the procedure § Post-correction tier and hosted
measurements describes, on the same host, Node 26.3.0, and Git 2.55.0: sequential, twelve workers, tier-isolated, one
discarded warm-up and one retained pass a tier, CPU admission waits subtracted. Measuring each tier without the suites
that run by reach took A34's fix to the benchmark first. The E2E row comes from a second capture: the first one's
measured pass failed one fixer case that passes alone, captured as an Errand.

| Local tier  | Wall clock (ms) | Registered files | Completed cases | Delta from 1.1   | Delta from c39e   | Updated budget (ms) |
| ----------- | --------------- | ---------------- | --------------- | ---------------- | ----------------- | ------------------- |
| unit        | 28,569          | 1,309            | 19,016          | +8,509 (+42.4%)  | -156 (-0.5%)      | 38,569              |
| integration | 278,490         | 423              | 4,305           | +71,178 (+34.3%) | -419,410 (-60.1%) | 375,962             |
| lane        | 297,254         | 1,732            | 23,321          | +69,125 (+30.3%) | -425,976 (-58.9%) | 401,293             |
| e2e         | 232,579         | 127              | 1,228           | unavailable      | -87,831 (-27.4%)  | 313,982             |

Hosted values are the emitted `actualMs` of each job's budget clock in dispatch `39871608329` at `0b92e5e85`, where every
functional job passed; the store job takes rows of its own when it shards (A33).

| CI job        | Job clock (ms) | Delta from 1.1    | Delta from c39e   | Updated budget (ms) |
| ------------- | -------------- | ----------------- | ----------------- | ------------------- |
| unit-1        | 91,126         | +46,597 (+104.6%) | -10,333 (-10.2%)  | 123,021             |
| unit-2        | 104,139        | +48,113 (+85.9%)  | +20,342 (+24.3%)  | 140,588             |
| integration-1 | 278,532        | -63,995 (-18.7%)  | -530,543 (-65.6%) | 376,019             |
| integration-2 | 241,639        | +220 (+0.1%)      | -528,884 (-68.6%) | 326,213             |
| integration-3 | 380,750        | +125,578 (+49.2%) | -451,903 (-54.3%) | 514,013             |
| integration-4 | 374,010        | +92,795 (+33.0%)  | -307,059 (-45.1%) | 504,914             |
| e2e-1         | 272,199        | -27,586 (-9.2%)   | -26,548 (-8.9%)   | 367,469             |
| e2e-2         | 299,740        | -44,958 (-13.0%)  | -85,505 (-22.2%)  | 404,649             |
| e2e-3         | 254,199        | -78,622 (-23.6%)  | -167,880 (-39.8%) | 343,169             |
| e2e-4         | 306,006        | +78,565 (+34.5%)  | -171,430 (-35.9%) | 413,109             |

Every measured value was within its prior row's allowance. Each updated baseline is its measurement with the 35%
allowance, rounded upward. The A25 rows in § Post-correction tier and hosted measurements stand as the peak these
replace.

**Relocation and reduction.** The integration row lost 419,410 ms, nearly all of it because the store suites left its
population. The same procedure at `c7886d47a`, with the store suites still in the tier after A29's work and its whole
separate suite beside the subset, took 690,872 ms over 594 files: the store files' summed time there fell 9% from the
A25 capture's (4,555 s to 4,165 s of 7,490 s), and the row 7,028 ms (−1.0%). The other 412,382 ms went with their
leaving. The lane, which holds the integration tier, fell 425,976 ms; no lane run with the store suites in it was kept
after the work, so its split was not measured. The CI integration shards fell 307–531 s each as the store suites moved
to the store job. The reduction itself is the per-change figure above, 1,840 s against 2,633 s on the check machine; the
unit and E2E rows' movement is not this work's, and is not attributed.

## A30 — A move overtaken inside its switch

18.R2.h's probe (`.internal/storage-ref-backend-tools/verification/apply/run-h-midswitch-probe.log`) interrupted a
remote move from the code remote to a backing repository inside its switch, moved the state back from another clone,
and reran the move:

- **At `remote.switch`,** past the pointer's change in `switchRemoteMove` (`migrate-remote-switch.ts`), the rerun
  ended `ok`, reported the move overtaken "before its switch", and removed its record, leaving `arc-config.yml` naming
  the abandoned destination — an uncommitted change the person would later commit.
- **At `layout.designation`,** inside the layout move the switch runs (`moveRefLayoutAsSwitch`), the rerun ended the
  same way and left the store directory, origin and `backing` both carrying `push`, the code repository's store refs,
  and the layout gathering refs. `pull` then reported `move-incomplete` and `move-unfinished` with no record to finish
  from, and a second no-target run took the recordless path (`cleanUnrecordedLayout`, `migrate-layout.ts`), deleting
  the code repository's store refs: it completed a switch nothing licensed, leaving the clone in the separate layout,
  pointed at a destination that forwards elsewhere, with two push remotes.

`remoteSwitchComplete` reads false at both points, so the rerun goes back through the copy round, whose read ends the
move through `endRemoteMove` and `finishEndedRemoteMove` (`migrate-remote-end.ts`): the record goes and the remote
gathering refs clear, and nothing undoes the partial switch. Every overtaking cause the copy round's read finds —
source forwarded, destination forwarded, moved back — passes through that one end.

**Why the design arm.** § 10.3 keeps a record across the switch because a half-switched state reads the same either
way, licenses the switch in its own round, and says what an end before the switch leaves; it says nothing of an end
inside one, which for a remote move is a hole. § 14.7's restart clause, though, settled the follow's case the other way,
and A30 supersedes it there:

> A layout move each way, a follow, and leaving the source, interrupted between the directory's rename and the
> designation's change finish on a no-target rerun in the direction their records name, never reversed, …

A follow another move overtook meanwhile now undoes its switch instead. Task 13.1's Goal states the same "never
reversed" and takes an `_Amended in:_` line, as do 16.5, 17.2, and the 17.6 verifier, whose recorded overtaken and
§ 14.7 behavior A30 changes.

**Decision: undo the switch, then drop the record.** A remote move's pointer goes back through the writer the switch
used (`writeBackingRepository`), the designation back to the source's in the order a move the other way sets it, and the
layout back through `moveRefLayoutAsSwitch` with the layouts reversed, borrowing the move's record and a configuration
that applies the source's designation, so writes made after the interruption carry back as any layout move's do. What
the switch carried or left goes too: the heads it carried into the new remote's tracking namespaces, where that name
differs from the source's (`installCopiedHeads`), and the layout move's gathering refs and build or aside directory,
which a switch overtaken before its rename leaves with the layout unchanged (`buildAndSwitchLayout` builds before
`switchLayout` renames). The record goes last, so an undo interrupted anywhere leaves the record, and the rerun ends the
move again and undoes what remains — the layout may already be the source's, so the leftover clearing runs whether or
not a layout move back does. The report reads as an end before the switch, with a notice that the move was overtaken
during its switch and undone; a rerun that finds nothing of the switch left reports a plain end before the switch
(§ 10.3). Rejected:

- finishing the switch, then following back: the switch is no longer licensed, and a follow never writes the pointer,
  so the clone would keep a pointer change that clashes with the move back's committed one;
- keeping the record and refusing: a dead end, with no move left to finish.
- marking the undo in the record before its first write: it keeps the notice exact for an undo interrupted with
  nothing left, the one state that reads as an end before the switch, at the cost of a record field that changes
  nothing else.

What the undo writes is what the record can say. A remote move's pointer returns to what the record's source gives; a
follow writes no pointer, so its undo leaves the checkout's as it found it, the move back's change arriving with the
code. The designation returns as a move the other way sets it: the source carries again the role it had — `push` for a
remote move, whose source is the one push remote (`resolveMoveRemotes`, `migrate-remote.ts`), and for a follow the role
its record keeps, since a follow from a read source can answer `push` (`followResult`, `follow-candidates.ts`) and its
switch sets a code source `off` or removes a backing one (`applyFollowDesignation`) — then a code remote destination
takes `off`, while `backing`, where the destination was the backing repository, is removed, going with the store
directory where the layout moves back and removed by name where it does not, or, between two backing repositories,
repointed to the source's URL with its role through `configureBacking`, the writer that switch used
(`migrate-remote-switch.ts`). The follow's record gains that role (`FollowRecordSchema`, `migrate-record.ts`), written
from the due follow's remote (`readRefFollowDue`) just before its switch. The record holds no
prior pointer text or destination role, so a code remote destination that carried `read`
before the move ends `off`, as a move the other way would leave it.

**Sweep.** A follow's rerun ends through `endStaleRecordedFollow` (`follow.ts`) when `followSwitchComplete` reads false
and its listing (`copyFollowState`) no longer finds the followed record, which a move back's copy deletes; it drops the
record the same way, so a follow interrupted inside its switch has the same hole. A follow never writes the pointer
(`switchRefFollow`, `follow-switch.ts`), so its undo is the designation, the layout, and the leftovers. The other ways
a recorded follow is overtaken — its old remote's forwarding record replaced, or a forwarding record on its new remote —
throw `followMoved` (`copyFollowState`, `checkFollowDestination`, `follow-copy.ts`), which `resumeRefFollow` returns as
a refusal with the record kept, so every later run refuses again, before its switch as well as inside it; § 10.3
already ends such a follow, its record going, and § 10.6's "the next run judges afresh" holds only before the record.
Folded into the same batch: § 10.6 ends a recorded follow on any of those reads, after the undo where its switch had
begun and not completed; criterion 40 names the follow's runs and the two other
overtaken follows; and 18.R2.h writes their rows (the restart sets above). A
follow answering `read` or `off` lists nothing (§ 10.6) and so never ends this way; leaving the
source is the person's own end and is not overtaken.

**For the fix.** Whether a switch has begun reads from what a switch changes: the heads carried, the pointer against
the record's source, the designation against the source's, the layout, and the layout gathering refs and build or
aside directories a forward layout move leaves, read directly: `remoteLayoutCleanupComplete` first reads whether the
code repository still holds store refs, which it does before any switch into the separate layout, so as a begun signal
it would read every state before such a switch as begun. A same-layout switch writes the
designation in more than one step (`applyRemoteDesignation`, `applyFollowDesignation`, and between two backing
repositories `configureBacking`'s repoint, then role), so a half-written designation counts as begun too. A trial over a
recorded move reads the same predicate, so it reports the undo a rerun would make, where `remoteMoveTrial`
(`migrate-remote.ts`) today passes `remoteSwitchComplete`. Rows cover the code-to-backing direction the probe ran; the
other directions take the same undo with their own designation writes. The restart sets above follow the design's reads;
18.R2.h derives them again against its fix's code, as 18.R2.c derived the others against source, and gives any state
they miss its row.

## A31 — A store directory taken away under a bound operation

18.R2.d withheld `store-ref-layout-move`'s "does not publish a sync that pulled before the switch" row for the default
layout (`.internal/storage-ref-backend-tools/verification/apply/F8-layout-move-476-default-row.patch`). Built with its
old state remote a third repository and origin taking `push`, it pauses a push holding its listing's ref locks while a
move into the code repository's refs runs, and the resumed listing throws `not a git repository` for the removed
`.git/arc/store` from `cat-file --batch` (`readBatchObjects` under `readPushListing`, `push-listing.ts`;
`run-h-F8-expose.log`).

**Why spec-depth.** § 11.4 re-reads the layout only under the layout lock, which a write takes last and the push loop
never takes for its listing; `commitRefStep` (`commit-step.ts`) answers `layout-changed` there, and the write, merge, and
withdrawal loops restart on it. § 10.2's "a fetch racing the move may land in the copy it leaves behind" holds for a move
out, whose source stays readable until its delete, but not for a move in, which renames the directory aside and removes
it. D4 has `pull` and `push` report states rather than fail, and nothing settled what a read outside the lock does when
its directory goes, so the rule fills a hole.

**Decision: treat the vanished directory as the layout change.** An operation finding its bound directory gone before
the layout lock releases every lock and starts again where the layout lock's re-read would send it: a write from step 2
(`executeRefBatch`, `write.ts`, already loops on `layout-changed`), a pull from its start (`pullRefStoreOnce`, `pull.ts`,
restarts so on a merge's `restart`), and the push loop from step 1, as its designation re-read after a switch does
(`checkedPushTarget`, `push.ts`). The lock order stays as it is. Rejected: taking the layout lock across the push's
listing, which would hold it across reads the lock order keeps outside it, and a refusal, which D4 rules out for a
state a rerun settles.

**Sweep.** The same read outside the lock exists in a pull's merge, which reads under its ref locks before taking the
layout lock (`mergeRefSets`, `sync-merge.ts`); in a write's step 4, read under its ref locks (`commitLockedRefBatch`,
`write.ts`); in every read operation, which binds the directory (`readRefRepository`, `repository.ts`) and takes no
lock; and in `maintain` (`maintainRefStore`, `maintain.ts`), which binds the same way and runs `git maintenance` and
`rev-list` against the bound directory, and which handoff calls once its rewrite lands (§ 12); and in
`arc store remote`'s view (`remoteView`, `remote-setting.ts`), which `runRefRemote` (`commands.ts`) returns outside the
move lock, its designation read checking the store directory and then running `git config` against it
(`readRefDesignation`, `designation.ts`), and its layout coming from a binding made before that check, so a directory
gone between them reads as the separate layout beside the default layout's roles, no Git
failure showing it. Every other command binds it through these operations, as
`arc store conflict` does through the read operations, or holds the move lock a move holds
(`withMigrationLock`). All are folded: § 11.4's rule and § 10.2's clause name them, criterion 41
names a push, a pull, a write, a read, `maintain`, and the view, and 18.R2.h
writes a row for each beside the withheld push row, pausing each the way that row pauses its push. A pull's fetch racing
the move parses as `unreachable` but its next read of the bound directory throws, so the restart belongs at the pull's
level, not on the fetch's outcome.

**Accepted residual.** A move out leaves its source readable until its delete, and the delete takes the layout lock, but
reads take no lock: a read bound to the code repository's refs while a move out deletes them returns `not-found` or a
short list rather than throwing. Reads are point-in-time and a move is a person's rare, explicit operation, so the
window stays. So does `arc store remote`'s view during a move out, whose binding, made before the directory's rename,
can sit beside a designation read after it, showing the default layout with `backing`; reading again would show the
move's own in-flight state instead, `backing` and the old remote both carrying `push` until the move applies its
designation after the rename (`switchLayout`), so a restart buys nothing a person can act on.

**For the fix.** A vanished directory shows as Git refusing the bound `--git-dir`; the fix confirms the directory's
absence (`directoryExists`) before restarting, so no other Git failure restarts an operation.
The view, whose designation read checks the directory itself, confirms after its reads that the directory its binding
found is still there, and starts again where it is not.

## A32 — A no-target run returns the report of the move it finishes

18.R2.h's probe (`run-h-ten-one-probe.log` in `.internal/storage-ref-backend-tools/verification/apply/`) ran a remote
move ended before and after its switch by a move back, and one finished from its record, each followed by a second
no-target run. Each first run returned the move's report; each second run returned nothing, 0 refs and no notices,
since the forwarding record that makes a follow due reaches this clone's tracking refs only through a pull
(`readRefFollowDue`, `follow-due.ts`), and the record's switch already leaves the designated layout. In those states
§ 10.1's order and the code's agree in effect, so the probe alone decides nothing.

**What decides it.** Where going on would act — a follow already due beside the record, on a remote the move leaves
reading or pushing — the follow ends in `designation-needed` or a refusal (`followResult`, `follow-candidates.ts`), and
§ 9.3's question carries no report. Going on would put the question in place of the move's report: the ended move's
leftovers § 10.3 has it name, a finished remote move's notice that teammates follow once the pointer's change reaches
them as code, and a layout move's refs. The code returned after a recorded remote move, follow, or leaving the source
(`runRefMigrate`, `commands.ts`), but after a recorded layout move went on (`reconcileNoTarget`), dropping the finished
layout report whenever the follow decided.

**Why design.** On its face this is the task arm, § 10.1 stating an order the code does not run, but realizing that
order as written either drops the report or gives the question a report, which changes § 9.3's result shape. A
settled statement changes either way.

**Superseded text.** § 10.1 ¶3: "`arc store migrate` with no target does three things, in order: it finishes an
interrupted move from its record, in the direction the record names (§ 10.3); then follows another clone's move where a
remote this clone fetches carries the forwarding record, asking about the move's destination (§ 10.6); then brings this
clone into the layout its designation calls for, …" § 10.3 ¶4: "a no-target run then goes on to the follow where one is
due (§ 10.1)."

**Decision: return the move's report.** A no-target run finishing or ending a recorded move returns that report; a
follow then due waits for the next run, which finds no record and follows. The ended move's notice already names
`arc store migrate` to follow, so the design already assumed a second run. Rejected: going on and giving
`designation-needed` a report, a change to the command result union and its rendering for a state a second run settles.

**Sweep.** § 10.1 ¶3 and § 10.3 ¶4 revise in place; § 10.3's "finishes the move that record names" already holds,
and § 14.7's "a no-target rerun holding a move's record while a follow is due finishes the move first" now names the
report it returns and the next run's follow, which "first" left open. 13.1 recorded the
layout-record path going on ("finishes the recorded direction before aligning designation") and takes the pointer.
`arc store remote`, which finishes a recorded move before its own setting and combines the reports, is a setting
rather than a no-target run and is unaffected. Criterion 42 names the layout path's row and the ended remote move's
existing rows (`store-ref-remote-ended`).

**For the fix.** `runRefMigrate` returns a finished layout move's report as it does the others', and
`reconcileNoTarget` loses its `finished` argument. The row interrupts a setting turning origin from `push` to `read` at
`layout.rename`, which fires before that move's rename and designation, so a pull meanwhile still fetches origin
after another clone moved the state off it; the rerun's report is then the layout move's, and the next run asks the
follow.

## A33 — The store suites by wall time and shard

18.R2.g's measurements, in the checkout's `.internal/storage-ref-backend-tools/verification/measure/`, showed A29's
halved summed time out of reach by its planned levers and beside the cost that sets the pace of work:

- Summed per-change store time in a passing merge-gate run at `0b92e5e85` (`merge-gate-every-2.log`) was 1,840 s, 30%
  below the 2,633 s baseline; 1,869 s in the run before it and 1,816 s run alone (`run-e-final-every.log` in `apply/`).
  Prepared states saved about 95 s. Copying the bare two-clone topology costs what building it does on the check
  machine, 33–46 ms against 35–47 ms, while a starting state saves about 300 ms a test; the remaining per-file states
  would save about 50–80 s more. A29's estimate that prepared states carried about 650 s rested on a local probe and the
  starting states' share of Git processes; on the check machine the behavior each test exercises dominates.
- The merge gate with every store suite selected took 14 min 3 s and 14 min 30 s, against 18.7 minutes at `212f6432e`
  and about 7–8 before this change. The store check (396–402 s of Vitest wall time) and the integration tier without the
  store suites (387–460 s) ran one after the other, the second waiting 444–460 s for memory on the check machine, so
  halving the store suites' summed time would take about 2 minutes off a reaching change's gate. A change reaching no
  store suite pays its store check's reach computation alone, 2.7 s (`no-reach-check.log`), so its gate is about the
  integration tier's.
- Hosted dispatches `39869323324` and `39871608329` ran the integration shards in 242–381 s of job clock, against 343 s
  for the slowest before this change and 974 s at the A25 peak. The unsharded store job's full run took 965 s and 1,573
  s, the second runner slower by 1.67× in every file. A pull request reaching every store suite runs about 83% of a full
  run in that one job, the slowest of its run.
- Replayed through the store check's own selection (`replay-80.txt`), the last 80 merges to `main` split 41 reaching no
  store suite, 38 nearly all, and 1 some. Ten reached them through packaged ARC content alone, which `lib/paths.ts`
  locates for every suite; that precision is captured for `test-suite-contention-hardening`.

**Superseded text.** § 14.14 Target: "Their summed file time falls to at most half the 2,633 s measured at `212f6432e`."
§ 14.14 Prepared states: "A file whose tests share a starting state — clones, remotes, records, and syncs built before
the behavior under test — builds it once per file and copies it per test". Criterion 34: "The store suites cost half as
much per change. Their summed file time is at most half the 2,633 s measured at `212f6432e`".

**Decisions** (Owner, 2026-10-22):

- The store suites are judged by not running where a change cannot reach them and by wall time where they run. The
  per-change summed figure is recorded, measured as A29 measured it, and the store shards' CI-job rows, set to a
  dispatched full run's figures, carry the bound forward through CI's budget report. Rejected: bounding a store shard's
  job clock by the slowest integration shard's in the same run, which hosted runner variance alone, 1.67× between two
  identical runs, would fail.
- The store job shards four ways, the integration job's count, balanced by the same duration data. Per change its suites
  sum about 2,157 s on a normal runner, about 540 s a shard, against integration shards' 562–941 s. Three shards fit a
  normal runner with less margin. The merge gate's local run stays one run, since sharding there would only divide one
  machine.
- A dispatch can ask for the per-change form, since nothing else measures before landing what a pull request reaching
  every suite costs; the full run stays the default for a dispatch and for every push to `main`.
- Prepared states are the five that carried the savings; the bare topology and the remaining per-file states build per
  test.

**Not taken here,** for `test-suite-contention-hardening`: the merge gate's running of its two heavy checks one after
the other under the check machine's memory, selection precision for located content, the store's import coupling, push
and pull's Git processes per operation, and fixture sharing across the conformance files.

**Sweep.** Criterion 35's "once per gate" holds, CI dividing the one run among shards. Criterion 36's whole separate
suite still passes in a full dispatch, and § 14.1's split files keep any one file from bounding a shard, the separate
layout's among them since A36. 18.R2's Goal, 18.R2.e, and the 18.7 verifier take `_Amended in:_ 18.R3 (A33)`; 18.R2.g's
measurements stand, its rows leaving out the store shards, whose rows § Measured below records.

### Measured

**No reach.** At `7b5b5fac6` the store check over a change reaching no store suite reported that it reached none of 171
and ran nothing, in 1.6 s unsharded and 1.6 s as shard 2 of 4 (`no-reach-check-7b5b5fac6.log` in the checkout's
`.internal/storage-ref-backend-tools/verification/measure/`).

**Per change on four shards.** Dispatch `39887854064` at `7b5b5fac6` asked for the per-change form, and every functional
job passed. Each store shard ran 42 of the 168 selected suites, and the store job finished alongside the integration
job: 278–374 s of job clock against 243–399 s. Their summed file time, 3,479 s, ran above the 2,157 s the decision above
projected for a normal runner, and above the merge gate's 1,840 s at five workers on the check machine (§ A29, Measured
after the work). Job clocks are each budget step's emitted `actualMs`; summed times are Vitest's per-file durations.

| Shard | Store job clock (ms) | Store summed (s) | Integration job clock (ms) | Integration summed (s) |
| ----- | -------------------- | ---------------- | -------------------------- | ---------------------- |
| 1     | 373,762              | 974.2            | 384,312                    | 934.1                  |
| 2     | 277,769              | 699.6            | 242,545                    | 585.1                  |
| 3     | 342,027              | 880.9            | 399,205                    | 968.3                  |
| 4     | 361,796              | 924.3            | 285,646                    | 665.8                  |

**Full runs.** Dispatch `39888971367` at `7b5b5fac6` ran 169 of the 171 suites, the two burst-gated files left out, its
store shards' summed file time within 1,068–1,216 s; the separate layout's whole suite, then one file of 698 s, set
store-1's job clock (§ A36). After the split, dispatch `39891553294` at `916ee8d11` placed the three new files by the
integration project's estimate, recording no duration for them yet, and dispatch `39892668498` at the same head placed
them by the durations the first one saved. Every functional job passed in all three. Their integration shards took
242–403, 258–375, and 286–378 s of job clock, and their E2E shards 278–383, 276–386, and 354–363 s. The unsharded store
job's full runs had taken 965 s and 1,573 s.

| Store shard | Before the split (ms) | First after (ms) | Balanced (ms) | Balanced summed (s) |
| ----------- | --------------------- | ---------------- | ------------- | ------------------- |
| 1           | 725,421               | 293,551          | 413,226       | 1,089.3             |
| 2           | 456,062               | 563,079          | 311,997       | 809.5               |
| 3           | 411,466               | 291,742          | 420,425       | 1,088.5             |
| 4           | 419,394               | 448,570          | 363,802       | 939.4               |

**The rows.** The store shards' CI-job rows take dispatch `39892668498`'s job clocks, each budget the clock with the 35%
allowance rounded upward: store-1 413,226 ms (557,856), store-2 311,997 ms (421,196), store-3 420,425 ms (567,574), and
store-4 363,802 ms (491,133).

**Rows keyed to a shard.** The three full runs reported integration-2 over its budget by 9, 48, and 52 s, and e2e-3 by
22, 42, and 11 s. Each full run saves its durations, and the next run's heavy-first assignment rebalances from them:
integration-2 held 150 different files across the two runs at `916ee8d11`. At `7b5b5fac6` it ran the same 106 files in
242.5 s in dispatch `39887854064` and in 335.5 s in dispatch `39888971367`. Both rows' baselines were the lightest shard
of their run (§ A29, Measured after the work), so a row keyed to a shard index compares a different set of files on each
run, and the store rows, store-2's among them, inherit that.

## A36 — The separate layout's whole run by item range

In dispatch `39888971367` at `7b5b5fac6`, A33's full run, each store shard summed 1,068–1,216 s of file time, but
`store-ref-separate-conformance.test.ts`, the separate layout's whole suite in one file, took 698 s of its shard's 703 s
of Vitest wall time, so store-1's job clock read 725 s against 411–456 s for the other store shards and 242–403 s for
the integration shards. A file runs on one worker. § 14.1 split the default run by item range so that no one file bounds
a shard, while the separate registration declared only its per-change subset.

Its whole run now takes the same ranges, records 1–6, reads 7–15, and sync 16–17, whose default files took 173, 249, and
214 s in that run. Pull requests and the merge gate run the separate subset per change and are unaffected; the gain is
the full run's, on every push to `main`, the weekly run, and a dispatch. Unrecorded files take the integration project's
duration estimate until a full run saves theirs, so the first full run after the split did not balance, and the next one
did (§ A33, Measured).

## A38 — A changes window stops at the newer's end

**Superseded text.** § 4.6 table row 3: "read on its history ref from the first such batch's commit through the last
batch in the window that changed its folder or wrote its end's record — a quarter's, or the registry's lineage — which
it needs as above".

**What decides it.** § 7.4 admits an end written in two batches, the lineage first and the primary's removal later, or
the reverse, and the ending write's sweep commits on the item's ref (`sweepRefRetirements`, `write-retirement.ts`).
When the lineage comes first its batch writes only the registry, since the origin keeps its primary
(`planRefRetirements`) and an unchanged group commits nothing (`unchangedGroup`, `write-commits.ts`). That batch names
no commit any history ref holds, so row 3's bound by "the registry's lineage" is one history cannot supply, and round
1's `endCommit` refused every window holding such an end (fix-check-1 F2). Where the lineage predates the window,
nothing inside it names the end, and the bound fell back to today's history tip, so late writes after the newer entered
it (F3).

**Decision.** The end's commit is read from the item's history: an archive's or a close's from its folder's `batch`,
and a lineage end's from its retirement commit. The sweep leaves that commit an empty tree, since a retired group writes
no metadata file (`serializeRefMetadata`, `write-commits.ts`) while every other commit, a discard's included, writes
one. The sweep lands in whichever batch leaves the item its lineage and no primary: the removal's when the lineage came
first or with it, the lineage's when the primary's removal came first, which is an ordinary write keeping the metadata
file (`retirementTargets`, `planRefRetirements`). The history can hold other empty trees: the retirement of a withdrawn
end, which stays in the merged log with the withdrawal naming it (`Arc-Withdrawn-End`, § 6.6), whichever clone
withdrew it; the import's parentless root for an origin it brought in ended (§ 10.11, `buildImportCommits`); and a
second retirement. § 5.1's `not-found` covers only an owner with neither a live ref nor a folder, so an item whose live
ref comes back beside its lineage alone — a mirror push restoring it, which § 6.4 reads as a reopen keeping the end's
removals — takes writes again, and the next removal or primary removal sweeps it a second time. The reopen merge keeps
the first retirement in the live log (`lifecycleRoutes`, `sync-pull-lifecycle.ts`; `prepareSyncMerge`, parents
`[current, next]`), so each later end descends from the one before. The window takes the retirement its lower bound
does not reach. Past several, nothing the newer manifest names says which it held: a state version omits history refs
(`refStateVersion` reads tips without them), and the second end may change no other manifest ref, which leaves the
state between the ends and the state after the second one the same token. Against the current state version — one
manifest hash over the tips the call already read (`buildRefManifest`) — the item stands at its latest end; against
any other, `changes` refuses with the remedy to compare against the current one, the usual restate case.

The pull's own end detection reads empty-tree ends this way (`readItemEndBatches`, `sync-lifecycle-log.ts`), skipping
withdrawn ends, and `changes` takes the same reading. That reader carried a test requiring a parent, meant to leave the
import's root out of the pull's ends, which never held: it split `%H %P` on spaces, so a root's trailing space read as
one parent. The test is removed rather than repaired. An origin exists only through the one import, so no other clone
holds a competing end for it, and no pull path was found where admitting its root differs; behavior is unchanged, and
the import-root case in `changes` now fails if a working parent filter returns. The registry's lineage batch, which a
one-batch end shares with its retirement and the import shares with its root, stops bounding anything, so a withdrawn
end's lineage batch cannot stand in for the end that holds, and `changes` keeps only which origins its window's
registry changes ended.

**Rejected.** Requiring the lineage batch in the history index, round 1's bound: it refuses a spec-admitted order
permanently, with a remedy that cannot help. Today's tip, or the newest commit holding only metadata: either admits a
late write or a discard after the newer. A bound from the registry commit's time: history commits carry no order
relative to the registry's. The earliest retirement, A38's first reading: an item retired again after a return lists
nothing over a window from the return, and loses the return and second end from earlier (A38 review, pass 1, F1). The
earliest past the lower bound always, never refusing: it silently drops mutations `changes` promises to list when a
window spans a return and a second end. The latest always: against a state between the ends it admits writes made
after the newer, as F3 did.

## A40 — A window reads through the latest end the clone's held history holds

**Superseded text.** § 4.6, A38's bullet: "where the history this clone holds lacks that commit, `changes` refuses as
§ 4.4 does, naming the history ref", read as a refusal wherever held history lacks the end the newer holds.

**What decides it.** Held history can lack the later end in two ways. One shows: the lower bound reaches every end the
history holds, so the end the newer holds lies past what this clone has; `retirementCommit` (`changes-lifecycle.ts`) now
filters a lone end as it filters several, and refuses (fix-check-2 F1). The other leaves no local sign. A pull acquires
a history ref by name, or when its merge finds an end or archive to apply to an item this clone holds
(`readPendingRefEnds`, `readPendingArchiveHistories`, `sync-pull-lifecycle.ts`). A clone that held no live ref while the
item was restored, written, and ended again elsewhere finds neither: its live ref stays absent across the pull, the
registry's lineage does not change, and the second end may change no manifest ref. A two-clone probe confirmed it: that
clone kept the history at the first end, its pull raised no notice, both clones reported the same state version, and its
`changes` from before both ends returned the first end's removal alone, where the history holds the return and the
second end.

**Decision.** State the limit with its repair: pulling the history ref by name brings the later end, and the window then
reads through it (criterion 46).

**Rejected.** A pull that fetches every held history ref by name: a fetch pattern per ended item on every pull, growing
with the archive, for a case no local state shows. A pull that compares each held history ref with its remote tip: a
listing of every history ref on every pull, for the same case.

## A43 — Every store UID uses the stored lowercase grammar

**Superseded text.** § 2.1 left owner construction unchanged; `OwnerIdentitySchema` (`lib/store/identity.ts`) used
`uid: z.uuid().optional()`, admitting uppercase while history refs required lowercase after A41.

**Decision.** Use `StoredUidSchema` for owner handles, metadata lineage keys, retained owner facts, lineage origins,
and the conflict command's UID operand. `readPendingRefEnds` and `addPendingLineageEnds` (`ref/sync-lifecycle.ts`)
and `retiredHistoryHome` (`ref/retired-history.ts`) check derived history refs rather than throwing on parse. An
uppercase registry key receives the existing typed namespace refusal instead of becoming an unrepresentable owner.
`store-ref-uid-grammar.test.ts` exercises admission without effects and planted keys through pull and push in both
layouts; criterion 49 records those outcomes.

## A41 — A history ref names its owner by the lowercase UID stored names carry

**Superseded text.** § 2.1's `HistoryRef` type, documented as "An ended item's history ref, fetched by name", whose
shipped schema took any UUID.

**Decision.** fix-check-1 F23's approved fix built `HistoryRefSchema` (`lib/store/refusal.ts`) from the stored UID form
(`STORED_UID_SOURCE`, `lib/store/identity.ts`), so every site that classifies a history ref and every input that names
one share one grammar, and an uppercase-UID ref, which no store writes, neither counts as held state nor passes as
`pull`'s `history`. That narrows `PullInput` and `state-unresolvable`'s `historyRefs`, which the first Non-Goal routes
through a § 2 amendment, recorded here (fix-check-2 F3). The producer's suggested correction kept the contract schema
loose and narrowed classification alone; the approved set chose one grammar under the pre-public posture.

## A42 — Every store listing of a remote's refs runs under the shipped network bound

**Superseded text.** § 11.8: "Every other store call passes none: its local processes are one-shot, their ref updates
bounded by Git's lock timeout (§ 11.2); the presence read runs under the shipped bound (§ 9.2); and a move's transfers
take no deadline (§ 6.1)."

**Decision.** fix-check-1 F22's approved fix routed every store listing of a remote's refs through one reader
(`listRemoteRefs`, `lib/store/ref/remote-listing.ts`) that passes `--refs --`, the passive interaction, and the stable
locale, under the shipped bound and any sync deadline. The presence read already ran under that bound; a move's lease
probe and the import's read of origin's transient refs now do too, and the carry race runs inside push's deadline as
before. § 11.8 now names them (fix-check-2 F4). A timeout at the import's read surfaces as its cleanup's recoverable
refusal, which a rerun retries.

## Unreadable archive quarters

While a quarter's tree cannot be read locally, or a quarter holds a folder whose metadata does not read — one whose
metadata file names an ended item, or one with no metadata file, which could be any item's — the store treats that
item's folders as unknown rather than absent. Its read, its history, a check view's read of it, and a write or batch
touching it refuse `namespace-corrupt` naming the quarter. A pull holds a merge that would move its history with that
notice, leaving the ref as it was until the quarter is repaired; a history the merge would leave in place, such as one
a push's basis pull names because it is ahead of its remote, passes and pushes. Live items are unaffected, and a
listing still reports the quarter as one `unreadable` diagnostic with its records missed (§ 3.1). The rule covers the
state two published ends leave (§ 3.3): with one folder unreadable, serving or refreshing the other would hide a write
once the quarter returns.

A known limit remains. The pull's lifecycle decisions — pending ends, end withdrawal, the `ended-twice` notice, and
pending archive histories — read local folders through `readLifecycleFolders`, which skips a quarter it cannot read.
Two guards cover part of that: a pull holds the item refs of an unpublished local end a corrupt quarter hides
(`readCorruptArchiveBatchRefs`), and the corrupt quarter's own merge refuses. A history the pull would find through such
a quarter is not merged in that pull, so only the quarter's notice reports it. Whether every lifecycle decision is safe
while a local quarter is corrupt has not been traced, and no § 14 case covers it.

## Final-head portability pair

Dispatch `40003927279` binds to `b516519caf0fd665f157dd3669907092165c4195`, the head after the verification review's
fixes, with `run_portability_pair: true` and `portability_timing_only: false`, and every job passes. Windows completes
44 passing files and one platform-skipped file, with 1,401 passing cases and 84 skips; macOS completes all 45 native
files with 1,424 passing cases and 61 skips, then its additional 22-file suite with 185 passing cases. Linux
portability completes the same 45 files with 1,424 passing cases and 61 skips. Each platform passes all four
twenty-writer burst cases, twelve platform/case combinations in total. The native selection holds 1,485 cases, three
fewer than at `ec617a92e`; dispatch `39897887406` at `3684ae2a3` holds the same 1,485, so the difference lies in the
A29 work before the review, not in its fixes.

| Platform/layout  | Version (ms) | Read (ms) | List (ms) | Lookup (ms) | Write (ms) |
| ---------------- | ------------ | --------- | --------- | ----------- | ---------- |
| Windows/default  | 66.030       | 146.309   | 298.289   | 114.950     | 814.483    |
| Windows/separate | 43.916       | 124.174   | 279.661   | 91.293      | 822.006    |
| macOS/default    | 28.718       | 75.376    | 235.441   | 32.245      | 284.360    |
| macOS/separate   | 9.932        | 51.432    | 179.346   | 27.623      | 224.727    |

All eleven-sample Windows medians satisfy A27's 100/300/600/300/1,500 ms limits over the 600-item, twelve-quarter
population. Windows's job takes 43 minutes 27 seconds and macOS's 21 minutes 24 seconds.

The same run makes the store suites' full run: all four shards pass, 43 files each. Both layouts' conformance files
hold 435, 556, and 139 tests with 26, 33, and no skips, as in `39892668498`, and the separate subset holds 51. Build,
both unit shards, lint and types, all four integration and E2E shards, and duration merging pass. Two jobs exceed their
advisory CI-job rows, E2E shard 3 by 7.28 s and integration shard 2 by 49.15 s; neither changes a job result, and both
rows are among those keyed to a shard index (A33).

The earlier pair at `3684ae2a3`, dispatch `39897887406`, failed one Windows case: the separate layout's heaviest sync
case took 30.1 s against the 30 s default timeout under the contention A36's three range files add on the four-vCPU
runner. Its macOS and Linux jobs passed. That failure stays recorded as a failure; `0331ed4f5` then gave each
conformance case a 90 s hang guard, and this run is the passing pair at the delivered head. Run metadata and job logs
are retained under `verification/task-19.1/` in the machine-local storage-ref-backend tools directory.
