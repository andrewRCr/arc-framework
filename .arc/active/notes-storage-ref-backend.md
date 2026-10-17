# Notes: storage-ref-backend

## Contents

- [Prior art](#prior-art)
- [Probes behind the design](#probes-behind-the-design)
- [The first model check](#the-first-model-check)
- [The second model check](#the-second-model-check)
- [The move model check](#the-move-model-check)
- [CI cost history](#ci-cost-history)
- [A designation per scope](#a-designation-per-scope)
- [Host properties](#host-properties)
- [A3 — Backslashes in stored paths](#a3--backslashes-in-stored-paths)

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

### Early local conformance comparison

Task 9.6 ran each complete conformance file once, sequentially on the same WSL2 machine, using `npm run test:file`.
The file times below are Vitest's single-file execution times, excluding transformation, imports, and controller
preparation. The in-repo fixture completes fewer cases because of its declared interim exclusions.

| Backend  | File time (s) | Completed cases | Named skips | Ratio to in-repo |
| -------- | ------------- | --------------- | ----------- | ---------------- |
| in-repo  | 43.58         | 308             | 696         | 1.00             |
| default  | 202.01        | 1,028           | 58          | 4.64             |
| separate | 217.62        | 1,028           | 58          | 4.99             |

Both ref layouts pass their applicable assertions with only § 14.1's permanent exclusions and the suite's own
mechanism applicability skips. Both local timing comparisons exceed 1.5 times. Task 18.3 must resolve the cost and
establish § 14.12's bound on the same GitHub-hosted runner before its criterion closes. These local results do not
establish that CI bound. Raw logs, elapsed command times, and derived file-time ratios are retained under
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

---

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
