# Spike: Concurrency at the Design Envelope (2026-09)

**Purpose:** Test whether state kept in `refs/arc/*` and projected into every worktree holds at ARC's design
envelope — no lost writes, bounded retries, typed conflicts, and a measured staleness window — locally and across
clones pushing to each tested host. It tests the mechanisms [the hard-problems research][hard-problems] proposes,
against the bar [the storage analysis][storage-analysis] set for concurrency (§ 11, § 6.9).

**State:** Point-in-time record of runs on 2026-09-24 and 2026-09-25. The storage analysis § 11.3–§ 11.6 summarizes it
and adds the later GitHub Enterprise Server run, and its § 11.7 tracks what stays open; the analysis and ADR-035
govern wherever they differ. Scripts and raw results stayed outside this repository, in the scratch directories named
below.

## Workload model (from arc-framework history, 2026-09-24)

**Method.** Every commit on a merged pull request's branch, plus the 275 commits on branches not yet merged, is
attributed to its branch. A branch's commits split into sessions wherever they are more than two hours apart, and a
session runs from its first commit to 15 minutes after its last; concurrency is the number of overlapping sessions.
The windows are the two parallel periods the data shows: 2026-07-13 to 08-09 (four weeks) and 2026-09-07 to 09-13.
The sequential corrective weeks since are left out, as unrepresentative (Owner). Scripts and extracts are in
`~/dev/scratch/arc-storage-spike/concurrency/workload/`.

Only sessions that commit are visible, so the concurrency below is a floor. Planning and review sessions that commit
nothing do not show; the Owner's three to six sessions at once is consistent with it. The user-notes row is a floor
too: the inbox and working memory are gitignored, so their history shows only sync cadence, and in-session captures
are more frequent than syncs.

| Window         | Commits | Branches | Busy hours | Share of busy time with ≥2 / ≥3 / ≥4 sessions | Max |
| -------------- | ------- | -------- | ---------- | --------------------------------------------- | --- |
| Jul 13 – Aug 9 | 2,438   | 247      | 403        | about 0.49 / 0.18 / 0.06, by week             | 7   |
| Sep 7 – 13     | 657     | 65       | 119        | 0.68 / 0.31 / 0.07                            | 4   |

Writes per busy hour across all sessions, counting a commit once per surface it touches, with the busiest single hour
in brackets. The last two rows are refs ARC already runs as single-ref stores that many sessions write:

| Surface                                              | Writers           | Jul 13 – Aug 9                  | Sep 7 – 13                      |
| ---------------------------------------------------- | ----------------- | ------------------------------- | ------------------------------- |
| Task lists                                           | The WU's session  | 2.41 (29)                       | 2.44 (11)                       |
| Metas                                                | The WU's session  | 1.27 (8)                        | 0.78 (4)                        |
| Specs, drafts, notes                                 | The WU's session  | 1.06 (9)                        | 0.70 (4)                        |
| Candidate records                                    | The WU's session  | —                               | 0.46 (4)                        |
| Backlog stubs and cohort docs                        | Any session       | 0.38 (6)                        | 0.12 (2)                        |
| `ROADMAP.md` (derived)                               | Any session       | 0.62 (5)                        | 0.19 (2)                        |
| `completed/`                                         | Archiving session | 0.13 (3)                        | 0.03 (2)                        |
| User-notes sync ref (`refs/notes/arc/user/andrew`)   | Every session     | 384 writes; 46 under 60 s apart | 64 writes; 7 under 60 s apart   |
| Errand registry ref (`refs/arc/user/andrew/errands`) | Every session     | 327 writes; 47 under 60 s apart | 173 writes; 61 under 60 s apart |

Cross-session writes to the same entry within an hour: 10 backlog entries over the four July–August weeks, and 3 in
the September week, plus `ROADMAP.md` constantly (97 branches wrote it 251 times in July–August). Task lists and
notes shared by one work unit's stacked member branches also show up — 8 branches wrote one task list 54 times, 6
minutes apart at the closest — but those are one session moving along its stack, not separate writers.

**What it means for the spike:**

- **Local contention is light.** The busiest single ref, the errand registry, peaks at 10–11 writes an hour; a
  compare-and-swap `update-ref` takes milliseconds. Six and twenty writers at several times the observed rate are a
  stress margin, not the expected load.
- **Same-entry conflicts are rare but real** — one to three a week on backlog entries. Conflict handling has to be
  correct and legible; it does not have to be fast.
- **Push is where the rate bites.** Bursts of writes under a minute apart on one ref (61 in the September week on the
  errand registry), against GitHub's recommended 6 pushes a minute per repository shared with code pushes, argue for
  per-machine batching at firing points (research § 3).
- **The hottest shared file today disappears.** `ROADMAP.md` is derived; under the store it is regenerated from the
  state rather than written by every session, so it is not a contended surface.
- **Two real workloads exist to replay.** The user-notes sync ref and the errand registry are single-ref stores that
  many sessions already write; their commit timestamps can drive the prototype directly.

## Prototype design

A throwaway store in `~/dev/scratch/arc-storage-spike/concurrency/`, Node ESM, nothing shared with ARC's code.

- **Store.** Each surface is a commit whose tree holds its entries as files, under `refs/arc/state/<surface>` (one
  ref per surface) or `refs/arc/state/<surface>/<entry>` (one ref per entry) — both layouts run.
- **Write.** Read the ref, build the new tree, `commit-tree` on the read head, then `update-ref <ref> <new> <old>`.
  On failure, re-read the new head and re-apply the change to its tree — never resubmit the old tree. A different
  entry re-applies directly; the same entry merges three-way (`git merge-file`), landing if clean and otherwise
  writing a typed conflict record with the write (write-then-gate). Failures are counted separately as lock timeouts
  (`core.filesRefLockTimeout`) and old-value mismatches.
- **Projection.** Each worktree holds a copy with a per-path record of the store blob it came from, keeping the
  previous base as well as the current one. Refresh at firing points is three-way over base, store and disk; write-back
  imports disk edits against the base they were made on.

**Regimes, reported separately.** Barrier-synchronized bursts, where all writers fire on one signal at disjoint entries
and then at the same entry, exercise the mechanism. A replay of the two real single-ref workloads at the observed rates,
and at multiples of them, measures retries and staleness; at those rates writes almost never collide, so the replay
does not test correctness. Store correctness runs N writers in one checkout, since worktrees share the common Git
directory. Staleness runs N worktrees, each refreshing at firing points timed from the workload's per-session commit
gaps.

**Pass criteria** (storage analysis § 11):

- **Zero lost writes** — every acknowledged write is in the final state or in a conflict record.
- **Bounded retries** — a distribution with a hard ceiling, lock timeouts and value mismatches counted apart.
- **Typed conflicts** — a same-entry clash lands as a record, the next dependent verb refuses, status shows it, and
  a resolution names it.
- **A measured staleness window** — time from a store write to each worktree's projection reflecting it.

**Build order:** a burst on one ref per surface first — the gating question — then one ref per entry, then staleness
across worktrees, then the research cases: an unsaved edit surviving another session's write (Jujutsu #7229), an
editor saving a stale buffer over a refresh (three-way against the previous base: both changes survive, overlap is a
conflict), the conflict round trip, a bypass through plain `git update-ref`, and rank-key collisions. `git push
--atomic` and fetch-refspec installation run against a local bare origin. The multi-clone push to GitHub and GitLab
waits for a scratch repository (Owner).

## Results

### Store under burst (2026-09-24)

N writer processes in one checkout fire on one signal; each makes 10 writes back to back, every write computed from
the entry as the writer first read it. Git 2.55, files ref backend, `results-burst-v1.jsonl` and `-v2.jsonl` in the
scratch directory. "Same field" means every writer appends to one line of one entry; "fields" means one entry with a
different line per writer.

| Retry policy        | Layout    | Scenario           | N  | Lost | Attempts p50/p95/max | Conflicts | Writes/s |
| ------------------- | --------- | ------------------ | -- | ---- | -------------------- | --------- | -------- |
| Linear jitter       | one-ref   | Different entries  | 6  | 0    | 1/19/22              | —         | 71       |
| Linear jitter       | one-ref   | Different entries  | 20 | 0    | 6/40/67              | —         | 55       |
| Linear jitter       | one-ref   | Same entry, fields | 20 | 0    | 1/57/116             | —         | 54       |
| Linear jitter       | one-ref   | Same field         | 20 | 0    | 1/56/90              | 47        | 53       |
| Linear jitter       | per-entry | Different entries  | 20 | 0    | 1/1/1                | —         | 775      |
| Linear jitter       | per-entry | Same field         | 20 | 0    | 1/58/104             | 38        | 54       |
| Exponential, 200 ms | one-ref   | Different entries  | 20 | 0    | 1/15/30              | —         | 69       |
| Exponential, 200 ms | one-ref   | Same field         | 20 | 0    | 1/17/30              | 24        | 68       |
| Local lock          | one-ref   | Every scenario     | 20 | 0    | 1/1/1                | 0         | 71       |

- **No write was lost in any of the 30 runs.** Every acknowledged write is in the final state or in its conflict
  record, and none reached the 200-attempt ceiling.
- **Contention was content, never Git's lock.** `update-ref` waits up to `core.filesRefLockTimeout` (100 ms) for
  the lock file, so every failed attempt was an old-value mismatch.
- **One ref per surface is viable.** 55–70 writes a second under 20-writer bursts, against a busiest real rate of
  about 11 an hour. One ref per entry removes contention only between different entries; it does nothing for the
  same entry, and it multiplies the refs every fetch has to list.
- **Exponential backoff cuts the retry tail by two-thirds; a machine-local lock removes it.** Under the lock every
  write lands first time at the same throughput, because writers queue instead of racing.
- **The lock also removed every conflict, but only because each writer re-read the entry inside it.** A real
  conflict comes from an edit made against an older projection, which no lock sees; the staleness test covers it.

### Projection research cases (2026-09-24)

Two worktrees of one repository project one surface, the inbox, and sync at firing points (`cases.mjs`, all 25
pass). A sync writes local edits back against the base each was made on, then refreshes every file whose disk content
still equals its base.

| Case                                                                   | Result                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| An edit on disk, another session writes elsewhere in the entry         | Merged; both kept (the Jujutsu #7229 shape)                                 |
| Both sessions add a line at the same spot, line merge                  | Typed conflict; the edit stays on disk and in the record                    |
| The same, union merge                                                  | Both lines kept, no conflict                                                |
| Union: one session deletes a line another rewrites                     | Typed conflict; the delete is not silently undone                           |
| Union: one session drains an item another appends right after          | Typed conflict; the item does not come back                                 |
| Union: a drain and an append in different sections                     | Both land; the item stays gone                                              |
| A refresh arrives while a local edit is unsynced                       | Never overwritten; the edit merges first                                    |
| An editor saves a stale buffer over one refresh, or over two           | Guarded: both the refresh and the edit survive                              |
| The same with no guard (control)                                       | The refresh's changes are silently reverted                                 |
| A stale save rewrites the very lines the refresh changed               | Typed conflict                                                              |
| Deleting exactly what the last refresh added (cost)                    | Read as a stale save; the lines come back                                   |
| Rewriting a line the last refresh changed, before the next sync (cost) | A false conflict, never a silent loss                                       |
| Stamped: a stale save over one or two refreshes                        | Both the refreshes and the edit survive                                     |
| Stamped: a stale save rewriting the refreshed lines                    | Typed conflict                                                              |
| Stamped: deleting what the last refresh added                          | The delete sticks                                                           |
| Stamped: rewriting a line the last refresh changed                     | Lands cleanly, no conflict                                                  |
| Stamped: an unmodified stale buffer saved over a refresh               | Nothing changes                                                             |
| Stamped, with the stamp deleted by hand                                | Falls back to the content heuristic; nothing lost                           |
| A save racing a pushed refresh lands in the replaced file (forced)     | Found through the held descriptor; without rescue, lost                     |
| The same, with rescue                                                  | Put back, written back as a stale save; the refresh's change survives       |
| Conflict round trip                                                    | Gate refuses, status lists it, a resolution names it, gate clears           |
| A plain commit on top of the ref, outside ARC                          | The record is still in the tree, so the gate still refuses                  |
| A rewind of the ref to before the conflict                             | The gate misses it; an ancestry check against the last-seen head catches it |

- **The stale-save guard is the Zed fix, and it costs little.** Each projected path keeps the bases it has been
  refreshed through since its last write-back. A saved file closer to an earlier base than to the current one is
  written back against that earlier base, so the store's three-way merge keeps the refresh.
- **Content cannot always tell a stale save from a fresh edit.** When a save rewrites the very lines a refresh
  changed, both readings fit equally. The guard reads the tie as stale and raises a conflict: a false conflict when
  the edit was fresh, but never the silent replacement the other reading risks.
- **Append-only surfaces want a union merge, for insertions only.** Two captures added at the same spot of the inbox
  conflict under a line merge and are both kept under a union merge. A plain `git merge-file --union` is unsafe,
  though: where one side deletes a line the other changed, it keeps the changed line and the delete vanishes with no
  record, so a drained inbox item comes back. The prototype unions a clashing hunk only when neither side touched
  existing lines; a hunk that deletes or rewrites them stays a typed conflict. Union is wrong for structured
  documents, where it would keep both versions of a rewritten line, so the merge rule is per surface.
- **The content heuristic's cost falls on hand edits.** Verbs write the store directly, so it never touches them. A
  hand edit that undoes what a refresh just brought in, such as deleting a line that just arrived, reads as a stale
  save, and the line comes back until the file's next write-back; rewriting a line that just arrived raises a false
  conflict.
- **A base stamp removes both costs.** Each projected file carries an invisible
  `<!-- arc-base: <blob id> -->` line naming the store version it was written from. It goes on the first line of a
  list file, or after the frontmatter; the entry merge below explains why not the last line. A stale editor buffer still
  carries the old stamp, so write-back uses exactly the base the edit was made on: no guessing, deletes stick, and
  the false conflict is gone. If someone deletes the stamp, the content heuristic takes over. It works for any
  single-file projection, not only the inbox, and for any editor, not only Zed.
- **A rewind outside ARC needs its own check.** Conflict records live in the surface's tree, so a plain commit on
  top keeps them, but moving the ref back drops them. Each checkout remembers the head it last saw and refuses a head
  that does not descend from it.

### Many worktrees syncing one shared entry (2026-09-24)

N worktrees, each with its own projection, make 8 edits apiece to one shared entry, sleeping up to 30 ms before each
sync (`wtburst.mjs`; `results-wt-v1.jsonl`, with the union rows re-run under
the insertions-only union in `-v2.jsonl`). Every edit adds a unique token. Each token afterwards has to be in the
store, in a conflict record, or held on the disk of a worktree gated by an open conflict.

| Edits                       | Merge | N  | Edits | In store | Record only | Held, gated | Lost | Conflicts | Write-back attempts p50/max |
| --------------------------- | ----- | -- | ----- | -------- | ----------- | ----------- | ---- | --------- | --------------------------- |
| Inbox captures, same spot   | line  | 6  | 48    | 8        | 5           | 35          | 0    | 5         | 2/7                         |
| Inbox captures, same spot   | line  | 20 | 160   | 8        | 19          | 133         | 0    | 19        | 7/17                        |
| Inbox captures, same spot   | union | 6  | 48    | 48       | 0           | 0           | 0    | 0         | 2/23                        |
| Inbox captures, same spot   | union | 20 | 160   | 160      | 0           | 0           | 0    | 0         | 8/68                        |
| Each worktree its own field | line  | 6  | 48    | 48       | 0           | 0           | 0    | 0         | 2/21                        |
| Each worktree its own field | line  | 20 | 160   | 160      | 0           | 0           | 0    | 0         | 8/60                        |
| Every worktree one field    | line  | 6  | 48    | 8        | 5           | 35          | 0    | 5         | 2/8                         |
| Every worktree one field    | line  | 20 | 160   | 8        | 19          | 133         | 0    | 19        | 8/18                        |

- **Nothing was lost.** No edit was read as a stale save, as expected: every edit here followed a fresh read, so
  these runs do not exercise the guard. Its false-conflict cost is the last cost case above.
- **The merge rule decides the inbox.** Under a line merge every worktree but one conflicts on its first collision,
  and the gate then holds all its later edits on disk: safe, but it would stop a person's captures cold. Under a
  union merge all 160 captures land with no conflict. Append-only lists — the inbox, working memory's entries,
  capture buffers — take the union merge; structured documents keep the line merge and its typed conflicts.
- **A gate holds the whole file.** Once a worktree's path is gated, nothing in that file syncs until the conflict is
  resolved, so the gate's grain is the projected file. That is right for a spec; for any list surface it argues for
  the union merge, or for one file per entry.
- **Edits held on a gated worktree's disk are not yet safe.** They are in no store and no record, only in that
  worktree's projected file, so tearing the worktree down would lose them: the loss BI-6 was created to fix
  (`research-storage-hard-problems.md` § 1). Teardown has to refuse while a projected path is gated, or first export
  the held file into its conflict record.
- **This is the worst case by design.** Every worktree edits one spot every few milliseconds. The observed rate is
  one to three same-entry collisions a week.

### Clones pushing to one origin (2026-09-24, local bare origin)

N clones of a bare origin each write locally, then push at once (`clones.mjs`; `results-clones-v1.jsonl`, with the
union rows in `-v2.jsonl`). A rejected push fetches into `refs/arc-remote/origin/*`, never over the local refs, merges
entry by entry against the merge base with the same rules as a local write, and pushes again. 5 writes per clone.

| Writes                    | Merge | N  | Writes | In origin | Record only | Lost | Pushes | Rejected | Max pushes for one write |
| ------------------------- | ----- | -- | ------ | --------- | ----------- | ---- | ------ | -------- | ------------------------ |
| Each clone its own entry  | line  | 6  | 30     | 30        | 0           | 0    | 57     | 27       | 9                        |
| Each clone its own entry  | line  | 20 | 100    | 100       | 0           | 0    | 329    | 229      | 21                       |
| One entry, own field      | line  | 20 | 100    | 100       | 0           | 0    | 339    | 239      | 24                       |
| Inbox captures, same spot | union | 6  | 30     | 30        | 0           | 0    | 59     | 29       | 9                        |
| Inbox captures, same spot | union | 20 | 100    | 100       | 0           | 0    | 332    | 232      | 22                       |
| One entry, one field      | line  | 6  | 30     | 25        | 5           | 0    | 60     | 30       | 10                       |
| One entry, one field      | line  | 20 | 100    | 81        | 19          | 0    | 333    | 233      | 23                       |

- **Nothing was lost across clones either,** and conflicts appear only where they should: the same field rewritten.
- **Pushing on every write is the expensive part:** 2 to 3.4 pushes a write under burst, 1,400 to 3,000 pushes a
  minute. Against GitHub's recommended 6 a minute per repository that is impossible, so per-machine batching at
  firing points is required, not an optimization. At the observed rates it is comfortable: averaged over busy hours,
  all of one person's sessions together write state about seven times an hour (commits touching state, plus the
  errand registry and notes sync); the busiest single hours reach a few dozen.
- **A default clone fetches no `refs/arc/*`.** ARC installs the fetch refspec itself, into a remote-tracking
  namespace: fetching straight into `refs/arc/*` with `+` would overwrite unpushed local writes.
- **`git push --atomic` does what § 7 row 3 needs** (`atomic.mjs`): with the state ref stale, the code branch was
  held back with it; after integrating, both landed together. The bare origin advertises atomic push by default, as
  GitHub's does.

### GitHub (2026-09-24, a private scratch repository)

**Basics, over HTTPS** (`remote/basic`): a push to `refs/arc/state/*` is accepted; a default clone fetches no
`refs/arc/*` and a mirror clone does; ARC's refspec into `refs/arc-remote/origin/*` fetches them. A plain push of a
sibling commit is refused as non-fast-forward, and `--force-with-lease` against a stale value as `stale info`, so a
lease is a compare-and-swap on the host. `git push --atomic` of `main` with a stale state ref held `main` back. The
REST API lists the refs (`git/matching-refs/arc/`), and `git push --delete` removes them.

**Clones pushing at once** (`clones.mjs` with `ORIGIN`, `results-remote-github-v1.jsonl`; runs 30 s apart, every
ref deleted afterwards). "Batched" writes locally and pushes once per clone; "per write" pushes after every write.

| Layout                   | Push      | N  | Writes | In origin | Lost | Pushes | Rejected | Push time p50 / max | Wall   |
| ------------------------ | --------- | -- | ------ | --------- | ---- | ------ | -------- | ------------------- | ------ |
| A ref per clone          | per write | 6  | 30     | 30        | 0    | 30     | 0        | 1.3 s / 1.9 s       | 7.4 s  |
| A ref per clone          | batched   | 20 | 100    | 100       | 0    | 20     | 0        | 2.7 s / 3.9 s       | 4.0 s  |
| One ref, inbox (union)   | batched   | 6  | 30     | 30        | 0    | 21     | 15       | 1.2 s / 1.7 s       | 12.7 s |
| One ref, entry per clone | per write | 6  | 30     | 30        | 0    | 96     | 66       | 1.2 s / 2.2 s       | 46.1 s |
| One ref, inbox (union)   | batched   | 20 | 100    | 100       | 0    | 204    | 184      | 1.3 s / 3.1 s       | 43.7 s |
| One ref, field per clone | batched   | 20 | 100    | 100       | 0    | 205    | 185      | 1.3 s / 3.2 s       | 45.3 s |

- **Nothing was lost on GitHub either.** Every write is in the origin's final state.
- **No contention seen between distinct refs, in one run.** Twenty clones pushing twenty refs at once saw no
  rejection; each push just took longer (median 2.7 s against 1.3 s for six). One sample, not proof: GitHub does
  not document its replica locking.
- **No throttling at 40 times the guidance.** Bursts reached about 280 pushes a minute on the scratch repository
  against GitHub's recommended 6, with no rate-limit response or slowdown. The 6 is guidance, not enforcement at
  this scale and duration; it stays the design target.
- **A losing push on one ref reads differently on GitHub.** The server refuses it as `remote rejected … (cannot
  lock ref '<ref>': …)` where local Git says `incorrect old value provided`; a loser that saw the move before
  sending gets `fetch first`. ARC's push loop has to treat all three as "fetch, merge, retry".
- **Everyone pushing one ref at the same instant is a thundering herd.** Each round has one winner and a push takes
  over a second, so twenty simultaneous batched pushes needed 204 pushes and 44 s to converge. At the observed rates
  pushes rarely coincide, but the retry backoff has to be sized to the host's push time (seconds, jittered), not to
  local contention.

**Fetch cost as `refs/arc/*` grows** (`fetchcost.sh`, `results-fetchcost-github-v1.jsonl`; each ref a distinct
one-file commit):

| Refs   | Push all once | Code-only fetch, no change (v2 / v0) | ARC first fetch | ARC fetch, no change | ARC fetch, one changed | `ls-remote` |
| ------ | ------------- | ------------------------------------ | --------------- | -------------------- | ---------------------- | ----------- |
| 100    | 1.5 s         | 0.47 s / 0.43 s                      | 0.94 s          | 0.74 s               | 1.18 s                 | 0.59 s      |
| 1,000  | 3.4 s         | 0.47 s / 0.39 s                      | 1.30 s          | 0.70 s               | 0.89 s                 | 0.83 s      |
| 10,000 | 50 s          | 0.61 s / 0.82 s                      | 2.36 s          | 0.94 s               | 1.36 s                 | 1.15 s      |

- **Ref count barely matters to fetch.** At 10,000 refs a no-change fetch costs 0.94 s against 0.74 s at 100; the
  network round trip dominates. Protocol v2 filters by prefix, so code-only fetches do not pay for state refs at
  all; the older v0 protocol pays a little (0.82 s at 10,000).
- **A clone's first ARC fetch grows more:** 0.94 s at 100 refs, 2.36 s at 10,000.
- **One push of many refs is slow:** 10,000 refs in one push took 50 s. A machine's batched push should carry a few
  surface refs, not many entry refs.
- **Sharding is therefore not a fetch question.** One ref per surface stays the choice for its single-commit
  atomicity, simple conflict records and small pushes; one ref per entry would not have been punished at fetch
  time.

**Forks** (a test organisation's forks of the private scratch repository with two `refs/arc/*` refs, a
second branch and a tag): a fork copies branches and tags and **no `refs/arc/*`**; a default-branch-only fork copies
`main` alone. A fork accepts pushes and deletes of `refs/arc/*`. So a contributor working from a fork starts with no
ARC state, can keep their own in the fork's refs, and can read the upstream's only by fetching the upstream
directly; nothing in a pull request carries refs, so state crossing from a fork to the upstream needs its own path
(in the branch, or imported by a maintainer). Tested on a private source; a public one is expected to behave the
same but was not tried.

**Rulesets** (2026-09-25, `forges/github-ruleset.sh`): each ruleset blocks non-fast-forward updates and deletion,
with no bypass actors, so the repository owner is held to it.

- **A ruleset cannot name `refs/arc/*`.** Creating one on `refs/arc/**` is refused with `422 Validation Failed:
  Invalid target patterns: 'refs/arc/**'`. `~ALL` means every branch and stops there: with it active, a forced
  rewrite of `main` was refused with `GH013`, while a forced rewrite of `refs/arc/state/inbox` and a delete of
  `refs/arc/user/andrew/notes` both went through.
- **State on a branch prefix can be protected.** With a ruleset on `refs/heads/arc-state/**`, a fast-forward push
  was accepted, a forced rewrite refused as `GH013 … Cannot force-push to this branch` and a delete as `GH013 …
  Cannot delete this branch`, both reported as `push declined due to repository rule violations`, which ends the push
  loop. A new branch under the prefix could still be created, so the rule guards existing state, not the namespace.

### Gitea and Forgejo (2026-09-24, local servers)

Gitea 1.27.3 and Forgejo 16.0.5, each run from its release binary on `127.0.0.1` with SQLite, a private repository,
HTTP (`forges/` in the scratch repository: `setup.sh`, `basics.sh`, `protect.sh`; `results-remote-gitea-v1.jsonl`,
`results-remote-forgejo-v1.jsonl`). Both behaved alike throughout.

- **The basics match GitHub:**
    - A push to `refs/arc/*` is accepted, and `git push --delete` removes it.
    - A default clone fetches no `refs/arc/*`; a mirror clone does, and so does ARC's refspec into
      `refs/arc-remote/origin/*`.
    - A stale push is refused as `fetch first`, and a stale lease as `stale info`. `--atomic` holds `main` back with a
      stale state ref.
    - The API lists the refs (`git/refs/arc`), and the branch list does not show them.
- **Branch protection does not reach `refs/arc/*`.** With a rule matching every branch (`*`), pushes to `main` were
  refused, while a fast-forward, a forced non-fast-forward and a delete of a state ref were all accepted. Anyone with
  write access can rewrite or delete ARC state, so the ancestry check against rewinds carries that protection.
- **A server hook can refuse the refs, and the refusal must end the push loop.** A per-repository `pre-receive` hook
  refusing `refs/arc/*` reads `[remote rejected] (pre-receive hook declined)`, after the hook's own `remote:` lines.
  The prototype's loop treats every `remote rejected` as a lost race and would retry it. ARC must retry only a
  lost race and treat any other refusal as final, showing the server's message.
- **A losing push reads like local Git here:** `[remote rejected] (incorrect old value provided)`, or `fetch first`.
  GitHub's `cannot lock ref` is its own. The push loop matches all three.
- **Forks copy no `refs/arc/*`,** as on GitHub.
- **Pull mirrors copy them; push mirrors delete them.** A pull mirror is a mirror clone, so it carries the source's
  state, read-only and up to one mirror interval old. A push mirror pushes only branches and tags and prunes
  everything else on the target. It deleted a state ref written directly on the target, and an extra branch, at
  every sync. So where a self-hosted server push-mirrors to another host, ARC state can live only on the source.
- **Nothing was lost under concurrent clones,** the same runs as GitHub's. On loopback, a push still costs 0.2–0.75 s,
  because each push calls back into the server from its hooks. So one ref under twenty simultaneous batched pushes
  took about 200 pushes to settle, as on GitHub.

| Layout                   | Push      | N  | Writes | Lost | Pushes (Gitea / Forgejo) | Push time p50 (Gitea / Forgejo) | Wall (Gitea / Forgejo) |
| ------------------------ | --------- | -- | ------ | ---- | ------------------------ | ------------------------------- | ---------------------- |
| A ref per clone          | per write | 6  | 30     | 0    | 30 / 30                  | 0.25 s / 0.41 s                 | 1.3 s / 2.2 s          |
| A ref per clone          | batched   | 20 | 100    | 0    | 20 / 20                  | 0.58 s / 0.75 s                 | 0.8 s / 1.0 s          |
| One ref, inbox (union)   | batched   | 6  | 30     | 0    | 21 / 21                  | 0.21 s / 0.33 s                 | 2.4 s / 4.0 s          |
| One ref, entry per clone | per write | 6  | 30     | 0    | 87 / 82                  | 0.03 s / 0.30 s                 | 8.6 s / 13.7 s         |
| One ref, inbox (union)   | batched   | 20 | 100    | 0    | 203 / 210                | 0.18 s / 0.40 s                 | 8.9 s / 17.1 s         |
| One ref, field per clone | batched   | 20 | 100    | 0    | 189 / 210                | 0.18 s / 0.37 s                 | 8.6 s / 16.9 s         |

### GitLab (2026-09-25, gitlab.com, a private project)

The group runs a 30-day Ultimate trial; the personal namespace is on the free tier. Git runs over HTTPS with the
`glab` credential helper, as GitHub's runs used `gh`'s, and API calls go through `glab api` (`forges/gitlab-basics.sh`,
`gitlab-protect.sh`, `gitlab-fork.sh`, `gitlab-mirror.sh`; `results-remote-gitlab-v1.jsonl`,
`results-fetchcost-gitlab-v1.jsonl`).

- **The basics match GitHub and Gitea:**
    - A push to `refs/arc/*` is accepted and advertised, and `git push --delete` removes it.
    - A default clone fetches no `refs/arc/*`; a mirror clone does, and so does ARC's refspec.
    - A stale push is refused as `fetch first`, and a stale lease as `stale info`. `--atomic` held `main` back with a
      stale state ref.
    - The branch list omits the refs, and REST lists no other namespace, but the API reads a state ref by name: the
      commits endpoint resolves `refs/arc/state/inbox`, and the raw-file endpoint returns `inbox.md` at it. A web
      tool could read ARC state without a clone.
- **A losing push reads like Gitea's:** `[remote rejected] (incorrect old value provided)` when two leased pushes race
  on the server, otherwise `fetch first`. The push loop already matches both.
- **Neither branch protection nor push rules reach `refs/arc/*`.** With every branch protected (`*`, no one may push),
  pushes to `main` and to a new branch were refused, while a fast-forward, a forced rewrite and a delete of a state
  ref were accepted. Push rules, a paid-tier feature, behaved the same: a branch-name pattern, a commit-message
  pattern and "reject unsigned commits" each refused a control push to a branch and let a state push through. So
  ARC's state commits never trip a project's push rules, and the ancestry check carries the protection, as on the
  other hosts. A refusal reads `[remote rejected] (pre-receive hook declined)` after `remote: GitLab: <reason>`, the
  same shape as Gitea's hook, so an `--atomic` push whose code branch breaks a rule must end the loop.
- **Forks copy no `refs/arc/*`,** whether of every branch or of the default branch only, and a fork accepts pushes
  and deletes of its own.
- **Nothing was lost under concurrent clones,** the same six runs as GitHub's. Pushes took about as long as GitHub's
  (1.2–1.6 s median) with a longer tail (10.7 s at worst). No throttling: 20 pushes landed within 2.2 s (about 540 a
  minute), and the contended runs sustained 100–220 a minute. GitLab.com's limit of 600 pushes a minute per user and
  project applies to Git over SSH.
- **Mirrors carry branches and tags only, in either direction, and leave `refs/arc/*` alone on both sides.** Unlike
  Gitea's, neither copies nor deletes state. Each end held a state ref of its own with a distinct commit, and the
  mirror's source held one the target lacked. A pull mirror (paid tier) brought the source's new branch and tag but
  none of its `refs/arc/*`, and kept the target's own. A push mirror, without "keep divergent refs", did the same the
  other way: it pushed the branch and tag, left the target's state ref at its own commit, and neither pushed the
  source-only state ref nor deleted the target-only one. So two ends of a GitLab mirror hold independent ARC state.
  Clones of a mirror see none of the source's, and nothing reconciles the two. Setup notes: the API cannot set an SSH
  mirror's host keys (`ssh_known_hosts` is ignored on create and update), so the web form's "Detect host keys" is
  needed. The SSH user must be `git`, and after a failure GitLab ignores manual syncs for several minutes.

| Layout                   | Push      | N  | Writes | Lost | Pushes | Rejected | Push time p50 / max | Wall   |
| ------------------------ | --------- | -- | ------ | ---- | ------ | -------- | ------------------- | ------ |
| A ref per clone          | per write | 6  | 30     | 0    | 30     | 0        | 1.5 s / 1.9 s       | 7.9 s  |
| A ref per clone          | batched   | 20 | 100    | 0    | 20     | 0        | 1.6 s / 2.1 s       | 2.2 s  |
| One ref, inbox (union)   | batched   | 6  | 30     | 0    | 21     | 15       | 1.3 s / 1.8 s       | 14.6 s |
| One ref, entry per clone | per write | 6  | 30     | 0    | 87     | 57       | 1.2 s / 1.6 s       | 51.8 s |
| One ref, inbox (union)   | batched   | 20 | 100    | 0    | 151    | 131      | 1.4 s / 10.7 s      | 59.6 s |
| One ref, field per clone | batched   | 20 | 100    | 0    | 207    | 187      | 1.3 s / 6.3 s       | 56.6 s |

**Fetch cost as `refs/arc/*` grows** (`fetchcost.sh`; two state refs stayed in place throughout):

| Refs  | Push all once | Code-only fetch, no change (v2 / v0) | ARC first fetch | ARC fetch, no change | ARC fetch, one changed | `ls-remote` |
| ----- | ------------- | ------------------------------------ | --------------- | -------------------- | ---------------------- | ----------- |
| 100   | 3.9 s         | 0.83 s / 0.59 s                      | 1.47 s          | 0.84 s               | 2.10 s                 | 0.93 s      |
| 1,000 | 23.5 s        | 0.89 s / 0.59 s                      | 1.80 s          | 0.83 s               | 1.29 s                 | 0.75 s      |

- **Ref count barely matters to fetch here either:** a no-change ARC fetch cost 0.83 s at both sizes.
- **One push of many refs is about seven times slower than on GitHub:** 1,000 refs took 23.5 s against 3.4 s. The
  10,000 size was not run; it would be a single push of minutes and would not change the conclusion. It strengthens
  one ref per surface and small batched pushes.

**Self-managed** (2026-09-25, GitLab CE 19.4.1 in Docker on `localhost:8929`, `forges/gitlab-local.sh`,
`work-gitlab-local.txt`): the same code as gitlab.com, so only the basics were repeated, and they match. A default
clone fetches no `refs/arc/*`; a mirror clone and ARC's refspec do; a stale push reads `fetch first`, a stale lease
`stale info`, and a lost race `incorrect old value provided`. What self-managed adds is a server hook, which
gitlab.com does not allow:

- **A pre-receive hook protects `refs/arc/*` and leaves ARC's own writes alone.** A per-repository hook set with
  `gitaly hooks set` refused any update under `refs/arc/` that deletes a ref or is not a fast-forward (`git merge-base
  --is-ancestor old new`). Under it, the basics above ran unchanged, including the leased race. A forced rewrite
  was refused as `remote: GL-HOOK-ERR: ARC state only moves forward` then `[remote rejected] (pre-receive hook
  declined)`; so was a leased rewrite whose lease was current, and a delete. Creating a new state ref was accepted.
  With the hook removed, the same rewrite and delete went through.
- **GitLab's own branch protection reads the same at the protocol level.** A forced rewrite of `main` (protected by
  default) printed `remote: GitLab: You are not allowed to force push code to a protected branch on this project.`
  and `[remote rejected] (pre-receive hook declined)`, so the push loop cannot tell a project rule from a custom hook
  by the status alone, and does not need to: both end it.
- **The cost of such a hook:** it forbids ARC ever rewriting state itself, so any history compaction would need the
  hook's owner. Global hooks need a Gitaly `custom_hooks_dir` and a reconfigure; this container had none set.

### Azure DevOps (2026-09-25, a private project)

Git over HTTPS with a code-scoped personal access token held by Git's credential store; API calls through
`az devops invoke` (`forges/azure-basics.sh`, `azure-protect.sh`, `azure-protect2.sh`; `results-remote-azure-v1.jsonl`,
`results-fetchcost-azure-v1.jsonl`). The organization is backed by a personal Microsoft account. The Azure CLI's
Entra token worked for the DevOps extension, but plain `az rest` got a sign-in page, and Git refused the token both
as a password and as a Bearer credential. Windows' Git Credential Manager could not run because this WSL has Windows
interop off.

- **The basics match the other hosts:**
    - A push to `refs/arc/*` is accepted and advertised, and `git push --delete` removes it.
    - A default clone fetches none; a mirror clone and ARC's refspec do.
    - `fetch first` and `stale info` as elsewhere. `--atomic` held `main` back with a stale state ref.
    - The refs API lists `refs/arc/*` (`refs?filter=arc/`), and so does `az repos ref list`. The items API reads a state
      file at the ref's commit.
- **A losing push has its own wording:** `[remote rejected] (TF401028: The reference 'refs/arc/state/inbox' has already
  been updated by another client, so you cannot update it. Please try again.)`. The push loop must add it to the
  lost-race set.
- **Azure's controls can reach `refs/arc/*`, unlike every other host tested:**
    - A branch policy requiring a reviewer on `main` left state pushes alone (`TF402455` on `main` only), as elsewhere.
    - The same policy scoped to the prefix `refs/arc/` refused updates to an existing state ref with `TF402455:
      Pushes to this branch are not permitted; you must use a pull request`, though it let a new ref under the prefix
      be created.
      Blocking every update is useless for ARC, but it shows the policy engine takes custom ref prefixes.
    - The repository-wide "Commit author email validation" policy refused state pushes, to existing and new refs alike,
      with `VS403702 … author email … does not match the policy-specified patterns`. So on Azure ARC's state commits
      must carry an author the team's policy accepts, and this refusal must end the push loop.
    - Denying force push to the signed-in identity, at the repository token and at two guesses at a `refs/arc` token,
      changed nothing: even the control, a forced rewrite of `main`, went through. The organization owner is not
      subject to the deny, so whether a ref-level permission can guard `refs/arc/*` for ordinary members is untested and
      needs a second, non-administrator account.
- **A fork of every branch copies `refs/arc/*`,** unlike GitHub, GitLab and Gitea. A fork of `main` alone copies `main`
  alone. A full fork therefore starts with a frozen copy of the team's state that nothing keeps in step.
- **Nothing was lost under concurrent clones,** the same six runs. Pushes were the fastest of any host (0.5–0.8 s
  median, 1.7 s for 20 at once to distinct refs), and runs sustained 430–460 pushes a minute with no throttling.
- **No mirrors to test:** Azure Repos has only a one-time import.

| Layout                   | Push      | N  | Writes | Lost | Pushes | Rejected | Push time p50 / max | Wall   |
| ------------------------ | --------- | -- | ------ | ---- | ------ | -------- | ------------------- | ------ |
| A ref per clone          | per write | 6  | 30     | 0    | 30     | 0        | 0.8 s / 1.5 s       | 5.3 s  |
| A ref per clone          | batched   | 20 | 100    | 0    | 20     | 0        | 1.7 s / 2.8 s       | 2.9 s  |
| One ref, inbox (union)   | batched   | 6  | 30     | 0    | 21     | 15       | 0.7 s / 1.1 s       | 7.9 s  |
| One ref, entry per clone | per write | 6  | 30     | 0    | 95     | 65       | 0.6 s / 1.8 s       | 28.4 s |
| One ref, inbox (union)   | batched   | 20 | 100    | 0    | 197    | 177      | 0.5 s / 2.3 s       | 25.5 s |
| One ref, field per clone | batched   | 20 | 100    | 0    | 188    | 168      | 0.6 s / 3.1 s       | 26.3 s |

**Fetch cost as `refs/arc/*` grows** (`fetchcost.sh`; two state refs stayed in place throughout):

| Refs  | Push all once | Code-only fetch, no change (v2 / v0) | ARC first fetch | ARC fetch, no change | ARC fetch, one changed | `ls-remote` |
| ----- | ------------- | ------------------------------------ | --------------- | -------------------- | ---------------------- | ----------- |
| 100   | 1.7 s         | 0.42 s / 0.36 s                      | 0.42 s          | 0.34 s               | 0.84 s                 | 0.40 s      |
| 1,000 | 11.1 s        | 0.31 s / 0.40 s                      | 0.81 s          | 0.39 s               | 0.51 s                 | 0.38 s      |

- **Ref count barely matters to fetch here either,** and every fetch is quicker than on GitHub or GitLab.
- **One push of 1,000 refs took 11 s,** between GitHub's 3.4 s and GitLab's 23.5 s.

### Pushing refresh into other worktrees (2026-09-24)

After a sync, the writer refreshes every other worktree's copy on the machine itself, under a per-worktree lock,
never touching a file with an unsynced edit (`projection.mjs`, `PUSH=1 wtburst.mjs`, `results-wt-push-*.jsonl`).

- **Local staleness drops to the write's own duration.** One write reaches every copy in 52 ms for 5 worktrees,
  89 ms for 10 and 164 ms for 20. At the end of every burst, every worktree without a held conflict already matched
  the store, with no final sync. It also covers the person's editor view, which no agent hook reaches.
- **A refresh from another process races with a save in that worktree.** Checking the file and then writing it lost
  3–10 edits per 20-worktree burst: an edit landed between the check and the write and was overwritten. Staging the
  new bytes, re-checking, then renaming lost none of 6,000 edits across five stress runs at 5 ms between edits. The
  re-check narrows the window to the time between the re-check and the rename; it cannot close it, and pull refresh
  has the same window against a person's save.
- **At the real inbox's size the window still bites, and a stat re-check shrinks it.** On the 76 KB inbox with 20
  worktrees (`entryburst.mjs`), re-reading the file as the re-check lost 4 of 3,200 operations: three edits and one
  drain. In the same runs, a descriptor held on each checked file found 5 saves that had landed in the replaced
  file. That is one more than the losses; a later save from the same buffer can still carry a stranded edit. A stat
  of the checked file's identity (inode, size, modification time) as the re-check cuts the window to microseconds on
  the WSL2 ext4 disk measured here: nothing lost and nothing found in 6,400 operations. Mounts with coarse modification
  times (drvfs or 9p under WSL, some macOS and NTFS volumes) weaken the stat comparison, so the guard needs checking
  on each filesystem a projection may sit on. The held descriptor stays as a backstop. A save found in the replaced
  file is put back, then written back as a stale save (forced-race cases 6a and 6b). Not covered: an editor
  that saves by renaming its own temporary file over the path in those microseconds. Closing that needs an atomic
  exchange (`renameat2`), which Node does not expose. VS Code and Zed both save in place (checked 2026-09-24 over
  the WSL remote: same inode, and a descriptor held on the file saw the new bytes), so the backstop covers both.
- **Other machines still need fetch** at their firing points; pushing across machines is the remote legs' question.

### Windows-native checkout (2026-09-25)

Windows 11 (build 26200) on NTFS, with Windows Node 22.17 and Git for Windows 2.49 at the installer's
`core.autocrlf=true`, and Defender real-time protection on. The scripts ran from the user profile through WSL
interop; the Windows copies and their outputs are in `windows/`, where `projection.mjs` carries the Windows branches
described below.

- **Windows refuses to rename over a file anyone holds open** (`win-rename.mjs`). A descriptor in the renaming
  process, or another process holding the file with Read, ReadWrite or ReadWrite+Delete sharing, all failed with
  `EPERM`; the rename succeeded as soon as the holder closed. So the backstop the projection keeps on Linux — hold
  the checked file open across the rename, so a save that lands in the replaced file can be found and put back —
  cannot exist on Windows. The projection's own descriptor refused its first refresh.
- **The same lock closes the race the backstop was for.** On Windows the projection closes its descriptor, then
  renames, retrying every 10 ms while refused and re-checking the file each time; a changed file, or a holder that
  outlasts one second, leaves the refresh to the next sync. With that, every projection case passes. The racing-save
  cases 6a and 6b cannot occur and are replaced by 6w: the editor's open handle refused the rename, the refresh was
  skipped, the save stayed in the live file, and the next sync wrote it back along with the refresh's change. What
  remains is an editor that opens, writes and closes entirely between the last re-check and the rename, as on
  Linux without the backstop. A holder that keeps a file open for long only delays its refresh.
- **Every replace-by-rename needs the retry, not only projected files, and so does a directory lock.** The
  projection's state file (`.arc-proj.json`) is replaced by rename and read by peer processes outside the lock; the
  first burst crashed 4 of 20 workers on `EPERM` there. With a bounded retry, as graceful-fs does, a full burst
  needed 91–106 retries and none failed. A lock directory that another process is removing is delete-pending, and
  `mkdir` on it reads `EPERM`, not `EEXIST`; treated as held, that came up 2–6 times a burst. The CLI's
  `atomicWriteFile` has the same exposure today (captured as an Errand).
- **Background scanners did not interfere.** 2,000 write-then-replace rounds without retry, Defender real-time on,
  all succeeded. Its exclusion list needs an administrator to read, so an exclusion covering the directory is not
  ruled out.
- **An editor that saves CRLF turns a clean edit into a conflict** (`win-crlf.mjs`). A adds a line and saves the file
  with CRLF endings while B's LF edit elsewhere lands first. The line and union merges each recorded a conflict, and
  A's line did not reach the store; the entry merge wrote back partially, with a conflict, and put `\r` into the
  store. Normalizing CRLF to LF where the projection reads a file (`projection-eol.mjs`) made all three
  merge cleanly, with no conflict and no `\r` stored. The refresh then rewrote A's file as LF; whether the
  projection keeps a file's own line endings is a design choice.
- **Starting a process is the Windows cost** (`spawncost.mjs`): `git rev-parse` takes 30 ms at the median (57 ms at
  p90) against 1.3 ms on the WSL ext4 disk, and `node -e 0` 37 ms against 18 ms. The prototype runs git for each
  step, so a full burst took 378–401 s against about 12 s on Linux, about 32 times as long. A store that runs on
  Windows has to batch its git calls (`cat-file --batch`, `update-ref --stdin`) or keep one long-lived git process.
- **Nothing was lost under full bursts** (`entryburst.mjs`: 20 worktrees, pushed refresh, stat re-check, entry merge,
  16 edits each; `win-burst-e16.jsonl`). The conflicts are the same kind and range as Linux's: a drain racing a note
  (`delete-edit`).
- **NTFS modification times are too coarse for the stat re-check alone** (`mtime.mjs`). They are stored in 100 ns
  units, but advanced here in steps of 0.36 ms at least and 2 ms at the median, with the system clock's tick: 56 of
  100 back-to-back in-place writes left the modification time unchanged. So a save of the same size inside one tick
  is invisible to a stat comparison — a checkbox toggle is one; the bursts lost nothing, but their edits changed the
  file's size. Re-reading the content instead is no fix: on Linux it widened the window enough to lose 4 of 3,200
  operations at the inbox's size. Neither re-check suffices alone on Windows. A candidate, untested: hold the file
  with no sharing while checking it, which Windows allows, then rename as soon as it closes. File IDs exceed 2^53
  (3.2 × 10^17 here), so stats must be read as bigint for the identity comparison to be exact.

| Run             | Ops      | Lost | Drains undone | Conflicts | Fresh at end | Refreshes refused | State-file retries | Lock pending | Wall  |
| --------------- | -------- | ---- | ------------- | --------- | ------------ | ----------------- | ------------------ | ------------ | ----- |
| Windows, rep 0  | 320      | 0    | 0             | 6         | 20/20        | 2                 | 91                 | 2            | 378 s |
| Windows, rep 1  | 320      | 0    | 0             | 10        | 20/20        | 0                 | 99                 | 5            | 380 s |
| Windows, rep 2  | 320      | 0    | 0             | 13        | 20/20        | 0                 | 106                | 6            | 401 s |
| Linux, 10 reps  | 320 each | 0    | 0             | 4–15      | 20/20        | —                 | —                  | —            | 12 s  |

### History growth over a year (2026-09-25, synthetic)

`history/gen.py` writes a synthetic stretch of state as a `git fast-import` stream, at § Workload model's rates
applied per person per busy hour (about 7.8 writes). One ref per surface: each person's inbox, working memory and
errand registry; one ref per work unit holding its meta, spec, tasks, notes and Candidate record; the backlog, one
file per stub; and the project inbox. Each write changes one file, as a save does, and the text comes from
`.arc/completed/`, so compression and deltas behave as they do on real prose. Both years have 10 people. **Typical**
is 2,000 busy hours each: 155,772 writes on 276 refs, 2.7 GB of file versions. **Heavy** is 5,000 each, this
repository's July–August pace held all year: 390,102 writes on 633 refs, 6.7 GB. The deepest ref, the backlog,
reaches 8,040 and 20,197 commits. For scale, this repository runs about 5,200 busy hours a year across all its
sessions, so typical is about four times its workload and heavy about ten; its whole pack today, code, planning and
23,530 commits of ARC state included, is 105 MB. Linux, git 2.55; scripts and outputs in `history/`.

| Year    | Stored file names                  | After fast-import | Recomputed, default window (10)  | Recomputed, window 250 | First full fetch (local) |
| ------- | ---------------------------------- | ----------------- | -------------------------------- | ---------------------- | ------------------------ |
| Typical | The same in every ref (`tasks.md`) | 1,011 MB          | 990 MB, 18% of blobs deltified ¹ | 381 MB ¹               | 14.8 s                   |
| Typical | Slug-named (`tasks-<slug>.md`)     | 1,011 MB          | 350 MB, 74%                      | 90.5 MB                | 6.7 s ²                  |
| Heavy   | The same in every ref              | 2,534 MB          | 2,606 MB, 15%                    | —                      | 38.7 s                   |
| Heavy   | Slug-named                         | 2,534 MB          | 1,218 MB, 68%                    | 286 MB                 | 15.7 s ³                 |

¹ The percentage and the window-250 pack were measured after the loose-object leg's 3,500 extra writes, which put the
default-window pack at 1,068 MB; on that same repository name-hash v2 gave 1,068 MB and path-walk 1,052 MB. ² From the
path-walk pack, 277 MB. ³ From the window-250 pack.

- **History length stays out of the read and write paths.** At both depths a tip read took 1–2 ms; an ancestry check
  1–2 ms from parent to tip and 7–11 ms from root to tip (routine gc writes the commit-graph); one compare-and-swap
  write through the plumbing path 17–18 ms. After the first fetch, a no-change fetch of the full history took
  16–20 ms locally and a one-commit fetch 23–46 ms.
- **A status read needs no cache at this envelope.** Every work unit's meta at its tip, in one `cat-file --batch`
  call, took 11 ms for 244 and 17 ms for 601. That is one process start, so about 30 ms more on Windows. The query
  cache's case rests on queries across fields and on live views, not on raw reads.
- **Size is set by how git finds deltas, not by the number of commits.** Git compares each object with a window of
  neighbours sorted by a hash of the path's final bytes, then by size. When every ref stores the same path, all 244
  to 601 work units' `tasks.md` versions share one pool, and a window of 10 rarely holds another version of the same
  file: only 15–18% of blobs found a delta. Name-hash v2 salts that hash with the parent directories and path-walk
  groups by full path, so neither helps paths that are identical: v2 changed nothing, and path-walk moved 18% to 19%
  at 6.6 times the time. Slug-named files, as ARC already names work-unit artifacts, cut the default-window pack 2.1
  to 2.8 times. A store has to keep every stored path unique across refs, per-person files included.
- **A file held near one size needs a wider window.** The inbox is captured into and drained around 76 KB, so a size
  sort scrambles its versions' order in time. In the slug-named typical year the personal inboxes took 175 MB of the
  277 MB path-walk pack, about 8.7 KB a write, against 0.75 KB for the backlog's file per stub. Their refs alone
  packed to 245 MB at window 10 and 26.5 MB at window 250.
- **Pushed one commit at a time, a plain git server keeps small deltas.** One person's inbox year (2,038 writes)
  replayed as single-commit pushes to a bare repository, as the push loop sends them. Each push arrived as loose
  objects, and the receiving side's automatic gc packed a few hundred consecutive versions at a time, where a window
  of 10 finds good deltas: 5.5–5.7 MB after gc, in two runs. With that automatic gc off, the same pushes left 6,102
  loose objects (84 MB), and one routine gc packed them to 26.6 MB, the same as a full recompute at window 10;
  window 250 gave 3.6 MB. So the synthetic years show the worst case, and anything that recomputes every delta at
  the default window reproduces it: `repack -f`, a host's maintenance, an import. ARC controls the stored layout and
  its own clones' packing, not a host's. In one run the 355th push was refused, after the receiving side had packed
  twice; it did not recur in the next run, and its message was not captured, so whether the push loop's retry set
  covers that refusal is open.
- **Plumbing writes never start gc.** `hash-object`, `mktree`, `commit-tree` and `update-ref` do not run `gc --auto`;
  `commit`, `fetch` and a server's `receive-pack` do. 3,500 writes left about 11,000 loose objects (145–152 MB), and
  `gc --auto` then took 3.8 s (typical) and 8.4 s (heavy), in the foreground here and detached by default. A clone
  that writes only state grows loose objects until another git command runs maintenance, so ARC has to run
  `git maintenance run --auto` itself at a firing point, or register the repository with `git maintenance start`.
  A full gc took 6 s and 16–17 s.
- **Rotation bounds what a clone fetches.** Every ref restarted as one root commit holding its tip: 7.9 MB fetched in
  232 ms (typical) and 18.7 MB in 482 ms (heavy). A fast-forward-only hook refuses both resetting a ref to a new root
  and deleting the old one, but accepts creating a ref (§ GitLab), so under such a hook rotation starts a new ref
  name, leaves the old chain where it is, and fetch has to be told which to take. Rewriting in place was not
  measured: tamper evidence and such a hook both rule it out.
- **Hosts.** GitHub enforces 2 GB per push and recommends at most 10 GB on disk and 5,000 branches; it names no
  limit for other refs (repository limits page, read 2026-09-25). Only an import or a mirror push carries a whole
  history at once — the heavy year with shared names could not be pushed in one — and the cutover imports current
  state, not history. Work-unit refs accumulate, 244–601 a year here, so a completed work unit's ref should leave
  the fetched namespace at archive, as rotated chains do.

### Entry merge for single-file lists (2026-09-24)

The inbox and working memory stay one scrollable file each and merge entry by entry (`entrymerge.mjs`,
`entrycases.mjs`, `entryburst.mjs`; `results-entrycases-v1.txt`, `results-entryburst-*.jsonl`). Entries are keyed as
the CLI's user-sync parser already keys them: an inbox entry by the bold title in its `###` heading, a
working-memory entry by its bold `**…:**` header. Nothing visible is added. Against the stamped base, adds from both
sides land; a delete sticks unless the other side edited that entry; a move between sections carries the other
side's edits; edits within one entry merge line by line, with insertions unioned; and a clash conflicts that entry
alone while every other change lands. The merged file has one blank line between blocks: the real working memory
round-trips byte for byte, and the real inbox loses two doubled blank lines.

Named cases on the real inbox, 39 entries:

| Two sessions at once                                         | Line merge (union for insertions) | Entry merge                          |
| ------------------------------------------------------------ | --------------------------------- | ------------------------------------ |
| Both capture at the end of one section                       | Clean                             | Clean                                |
| Drain the last entry while the other captures after it       | Conflict                          | Clean                                |
| Drain one entry while the other adds a note to its neighbour | Conflict                          | Clean                                |
| Drain two adjacent entries, one each                         | Conflict                          | Clean                                |
| Both drain the same entry                                    | Clean                             | Clean                                |
| Check one off while the other edits its body                 | Clean                             | Clean                                |
| Move an entry to another section while the other edits it    | Conflict                          | Clean                                |
| Edit two fields of one entry                                 | Clean                             | Clean                                |
| Both append a note to one entry                              | Clean                             | Clean                                |
| Edit the same line                                           | Conflict                          | That entry conflicts; the rest lands |
| Drain an entry the other is editing                          | Conflict                          | That entry conflicts; the edit stays |
| Both capture under the same title                            | Both kept under one title         | That entry conflicts                 |

Random pairs of concurrent edits from one base, 500 per row, raw text edits as an editor makes them. "Wrong" means a
clean merge whose result misstates some entry. The entry merge ran in both orders; both orders came out the same
every time.

| File             | Operations per side | Line: clean / conflict / wrong | Entry: clean / entry conflict / wrong |
| ---------------- | ------------------- | ------------------------------ | ------------------------------------- |
| `USER-INBOX`     | 1                   | 477 / 21 / 2                   | 493 / 7 / 0                           |
| `USER-INBOX`     | 3                   | 365 / 126 / 9                  | 456 / 44 / 0                          |
| `WORKING-MEMORY` | 1                   | 473 / 26 / 1                   | 488 / 12 / 0                          |
| `WORKING-MEMORY` | 3                   | 353 / 136 / 11                 | 444 / 56 / 0                          |

Bursts of 20 worktrees on the real inbox with writer push, 16 operations each (captures, notes, check-offs, drains),
each synced as made:

| Merge, refresh re-check       | Runs | Operations | Lost | Drains kept back by a conflict | Worktrees gated | Fresh at end |
| ----------------------------- | ---- | ---------- | ---- | ------------------------------ | --------------- | ------------ |
| Entry, re-read                | 10   | 3,200      | 4    | 26                             | 0               | 200/200      |
| Entry, stat                   | 10   | 3,200      | 0    | 29                             | 0               | 200/200      |
| Entry, stat and rescue        | 10   | 3,200      | 0    | 30                             | 0               | 200/200      |
| Line (union), stat and rescue | 3    | 462 of 960 | 0    | —                              | 43 of 60        | 17/60        |

- **The line merge's false conflicts on lists go away.** A drain next to a capture, adjacent drains, and a move
  racing an edit all conflict under the line merge and land cleanly by entry. The line merge is also sometimes
  silently wrong, in 0.2–2.2% of random pairs. For example, a note appended to an entry another session drained ends
  up attached to the neighbouring entry.
- **What still conflicts is real.** Almost every entry conflict is a drain racing a note on the same entry. The
  edited version stays in the file and the drain is recorded, so the drainer sees the item come back with its new
  note. Same-line edits are the rest.
- **A conflict no longer holds the whole file.** Under the line merge, a conflict gates the file: that worktree stops
  syncing it until someone resolves it. In the bursts that happened to 43 of 60 worktrees, which then stopped
  working. The entry merge lands everything else and records only the clashing entry.
- **No tombstones.** The CLI's user-sync merge already unions entries by these keys across notes, but it has no base.
  So it records deletes as `## Removed:` sections kept in the file for 7 days; today's inbox carries eight. With the
  stamped base, the merge knows what was deleted.
- **A renamed title is a delete plus an add.** If another session edited the entry meanwhile, that becomes a
  delete–edit conflict with both versions visible; nothing is lost.
- **On a list file the stamp belongs on the first line.** At the end, it rode along with anything typed after it,
  and was deleted with the last entry. The first line is the one place list edits leave alone. The parser finds the
  stamp wherever it ends up. A file with YAML frontmatter cannot take it on line 1, because the file must open with
  `---`, so the stamp goes right after the closing `---`. Placement is per file shape.

### Firing-point density (from session transcripts, 2026-09-24)

Firing points taken from 321 real sessions' transcripts (`workload/transcripts.py`, `density.py`,
`density-v1.txt`): 248 Codex sessions from July to September and 73 Claude Code sessions from September (older
Claude transcripts are gone, so July's observers are Codex only). Observers are sessions split at two-hour gaps;
writes are the git state writes above plus 605 inbox edits seen in the transcripts. "Reads stale" is the share of a
session's tool calls touching state paths that happened after another session's write and before this session's
last firing point — the agent's view; a person's editor view is not in the transcripts.

| Firing points                 | Per hour | Window p50  | Window p90  | Reads stale, any state | Reads stale, shared |
| ----------------------------- | -------- | ----------- | ----------- | ---------------------- | ------------------- |
| Commits                       | 2.5–4.3  | 13.5–21 min | 82–99 min   | 49–56%                 | 26–32%              |
| ARC commands                  | 13–17    | 4.5–6 min   | 28–34 min   | 18–20%                 | 5–8%                |
| ARC commands and commits      | 17–19    | 4.2–5.7 min | 26–33 min   | 17–20%                 | 5–8%                |
| Plus every prompt             | 20–21    | 2.8–4.6 min | 15–28 min   | 13–15%                 | 3–6%                |
| Plus every tool call (a hook) | 163–186  | 12–20 s     | 8 min       | 0% by construction     | 0% by construction  |
| Writer push (prototype)       | —        | under 0.2 s | under 0.2 s | 0%                     | 0%                  |

Ranges span the two windows. "Shared" means backlog writes and inbox edits. In 6–15% of write–observer pairs the
observer went quiet before its next firing point, so pull refresh left it stale until its next session; the p90 of
the tool-call row is that idle time. Pull refresh at ARC commands is not enough for the per-worktree lean: an agent
would read stale shared state 5–8% of the time and a person could wait half an hour. A pre-tool-call hook fixes the
agent's view where the harness offers one; writer push fixes both views on one machine without any hook.

### Staleness window (modeled from the workload, not measured)

These figures are modeled from the workload's commit times, not measured in the prototype. Firing points are taken
to be each session's commits — fewer than ARC's real firing points, so these are upper bounds.
For each state write, every other active session's copy stays stale until that session's next firing point.

| Window         | Writes                | Observer pairs | Stale p50 | p90    | Max     |
| -------------- | --------------------- | -------------- | --------- | ------ | ------- |
| Sep 7 – 13     | Shared backlog writes | 9              | 12.5 min  | 53 min | 53 min  |
| Sep 7 – 13     | Any state write       | 564            | 15.7 min  | 61 min | 107 min |
| Jul 13 – Aug 9 | Shared backlog writes | 150            | 12.2 min  | 55 min | 103 min |
| Jul 13 – Aug 9 | Any state write       | 1,853          | 11.8 min  | 53 min | 115 min |

Correctness does not rest on it — deciding verbs re-read the store and write-back is base-checked — but a person
reading the inbox in one worktree could miss another session's capture for most of an hour. That is the cost of the
per-worktree lean ([the research][hard-problems] § 1, candidate 3): today's single copy under BI-6 shows a capture
everywhere at once. The lean holds only if shared surfaces refresh at many more firing points than commits (every ARC
command, session init, and possibly an agent-tool hook), which would bring the window from tens of minutes toward
seconds. Firing-point density, measured since (above), decides it: pull refresh alone falls short, writer push closes
the local window; one copy per machine stays the fallback.

### Rank keys (`rank/rank.mjs`, rocicorp `fractional-indexing` 3)

- **Concurrent inserts between the same neighbours collide** — the key function is deterministic — and nothing can
  then be inserted between the two tied items (`generateKeyBetween` throws).
- **One ref per surface resolves it at write time:** the compare-and-swap loser re-reads, sees the winner's key and
  re-keys after it. Syncing between clones has to do the same when a merge finds two equal keys.
- **Growth is harmless in practice:** 4 characters after 10,000 inserts at either end; repeatedly inserting right
  after the same item grows about one character per six inserts (19 after 100). A local re-key of that neighbourhood
  covers the pathological case; no global rebalance.

- **Pre-tool-call hooks exist in both harnesses used here (checked 2026-09-24).** Codex has `PreToolUse` in
  `~/.codex/hooks.json` under its stable `hooks` feature (codex-cli 0.156.1), with the same shape as Claude Code's;
  this machine's safety gate already runs on it for shell calls. Codex reads files through the shell, which is what
  a refresh before reads needs. Whether it also fires for `apply_patch` is unverified.

## Not run here

The storage analysis § 11.7 tracks what stays open.

- Azure DevOps ref-level permissions on `refs/arc/*` (deny force push and delete, allow fast-forward), with a second,
  non-administrator account.
- GitHub Enterprise Server, the rest of the self-managed floor (not practical here; GitLab self-managed is done).
- A pushed year's first fetch over the network from GitHub (typical, slug-named, 90–350 MB), and whether GitHub's
  maintenance keeps the deltas pushes arrive with.
- How a contributor's fork state reaches the upstream (design, not a spike): forks copy no `refs/arc/*`.
- How a conflicted entry shows in a single-file list — a marker beside it, or only in `arc status` — and whether a
  drain racing a note needs a record at all, or the kept edit is enough (design, not a spike).

---

[hard-problems]: ../research/research-storage-hard-problems.md
[storage-analysis]: analysis-storage-substrate-direction.md
