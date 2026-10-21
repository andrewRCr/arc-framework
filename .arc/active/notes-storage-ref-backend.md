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
The added criterion is checked by the revision's native lookup/withdrawal/import suite and remains open for terminal
work-unit verification. Completed Tasks 5.7, 15.2, and 15.10 point forward instead of rewriting their earlier outcomes.

## A22 — Atomic native observation admission

The design arm supersedes § 5.3's statement: “A rule that reads records outside the batch holds as of the write.
The compare-and-swap guards only the refs the batch writes, so a race or a merge can produce a state such a rule
would refuse.” It also broadens § 11.4's “only around its commit” boundary. The approved shared contract requires
all observations and registered checks to hold through local publication, including newly created relevant refs.
This is a bounded composition of existing locking, captured views, and history, retaining Class Heavy. The Owner
approved native absorption after the shared amendment review; that review returned no findings. Its runtime
implementation is still a prerequisite, not shipped behavior in this checkout.

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

## A22 and A23 native closure — Task 4.R2.d

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
This closes the pending A22/A23 revalidation; Phase 18 still owns hosted timing, process-cost, and platform obligations.

## Moving-remote segment closure — Task 17.6

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
and cost evidence remain Phase 18's obligations; terminal verification and independent reviews have not run here.

The first segment quality run found one stale command-boundary caller list: `runStoreRemote` now also belongs to
`commands/store-migrate.ts`, whose answered follow prompt delegates the explicit role choice through that public entry.
The exact two-command allowlist now names both adapters; the scan still rejects every other caller. The initial full
unit run passed 18,946 cases and failed only this assertion, with 584 declared skips; no runtime correction was needed.

## Native inbox contention — Task 18.1.a

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

Task 18.1.b retains the required dispatched Linux, Windows, and macOS evidence. Those hosted results remain open.

## Native operation timing — Task 18.2.a.1

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

## Personal-path pack cost — Task 18.5

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

## CI measurement preflight — Task 18.3.a

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

## Cutover suite inventory — Task 18.6

Paths below are relative to `packages/arc-framework/__tests__/`. This inventory classifies assertions, not spelling: a
consumer that happens to borrow the in-repo fixture keeps its contract behavior and changes its fixture. Native import
tests intentionally retain legacy source data. No test or helper is deleted by this inventory.

### Preserve shared, native, and consumer coverage

Keep `helpers/store/conformance-suite.ts`, `suite-*.ts`, `fixture-contract.ts`, the reference backend/fixture, and their
registration/exclusion-policy unit tests. Keep both native conformance registrations and every `integration/store-ref-*`
suite, including import, timing, bursts, and native admission. The in-repo conformance registration currently runs the
same assertions; preserve those assertions when the obsolete adapter registration and its helper go away. Do not carry a
deleted backend merely to retain a three-line registration wrapper.

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

## Real-host owner probes — Task 18.4.a.1

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
configured. Policy/fork fixtures and Azure DevOps, Bitbucket, Gitea, and Forgejo runs remain open. Task 18.4 and the
segment verifier remain incomplete. Raw evidence is retained under
`.arc/user/andrew/.internal/storage-ref-backend-tools/task-18.4/`, including per-command stdout/stderr and
`backend-results.json`; results never imply that unavailable setups passed.

## Errand import E2E source — Task 18.3.b

Dispatched run `39530714223` at `cdf5fa119` refused both `store-import-errands.e2e.test.ts` cases with
`branch-missing`: their open legacy Errand declared `chore/example` without creating it. The independent integration
source already creates each declared branch. The E2E fixture now does the same; both layouts pass the real CLI import
and repeat-import assertions. This corrects source setup and retains import's refusal and remedy for a genuinely
missing branch. The failing hosted log is `/tmp/arc-storage-18-ci-e2e3.log`; the corrected focused run passed two cases
in 12.29 seconds, retained in `/tmp/arc-storage-18.3-errand-e2e.log`.
