# Notes: storage-ref-backend

## Contents

- [Prior art](#prior-art)
- [Probes behind the design](#probes-behind-the-design)
- [The first model check](#the-first-model-check)
- [The second model check](#the-second-model-check)
- [The move model check](#the-move-model-check)
- [CI cost history](#ci-cost-history)
- [A designation per scope](#a-designation-per-scope)

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

## A designation per scope

Where personal state publishes stays with the backend; a designation per scope is a deferred follow-on, never
precluded. The principled form: the project's remote is the project's call, and the person's — the code remote by
default, a remote of their own, or none — is theirs. How private it can be is the hard part. Kept in the code
repository's refs, personal refs share a transaction with project refs — starting an Errand from a personal inbox entry
is one batch across both — but a mirror push still publishes them; moved to a separate Git directory, they are private
by construction, and that batch spans two directories that cannot commit atomically. The backend composes its push set
by scope, so the designation lands additively. The follow-on likely belongs beside `config-storage-architecture`, which
owns user-scope configuration; its tripwire is a person asking to keep personal state off a shared remote.

---
