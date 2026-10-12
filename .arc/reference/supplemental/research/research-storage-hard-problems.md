# Research: The Storage Program's Hard Problems (2026-09)

**Purpose:** External research on the four problems left open in the storage analysis § 6.9 — stale projections,
same-entry conflicts, team-scale push contention, and backlog order — so the storage spikes tested mechanisms with
evidence behind them. It treats [the storage analysis][storage-analysis] (§ 5.1, § 6.5, § 6.9) and
[the 2026-07 storage landscape][storage-landscape] § 2 as known and does not repeat them.

**State:** Point-in-time research taken 2026-09-24. [The concurrency spike][concurrency-spike] and
[the editor-ergonomics spike][editor-spike] tested what it proposes, and the storage analysis § 11.1 summarizes it; the
analysis and ADR-035 govern wherever they differ.

**Method, 2026-09-24.** Seven single-pass `external-research-analyst` sweeps — three on stale projections, three on
same-entry conflicts, one on rank ordering — plus one `heavy-research` run with adversarial verification on push
contention. Markers:

- **[verified]** — survived the heavy-research skeptic vote, with its citation.
- **[checked]** — a single-pass claim confirmed during this research against the primary source named beside it.
- **[corrected]** — a single-pass claim the primary source contradicted; the corrected reading is what is recorded.
- Unmarked — a single-pass lead: sourced by the analyst, not re-read here. Do not cite it as settled.

## Summary

| § 6.9 problem           | What the evidence says                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Stale projections    | Every precedent guards **writes** by checking them against a recorded base; none relies on keeping the copy fresh for correctness. Refresh at firing points is what they all do, but a refresh must never overwrite an unsaved local edit. Project shared surfaces into every worktree: the reason for today's one copy per machine was divergent stores, which the ref store removes, and direct file access needs the copy in the worktree the editor has open. |
| 2. Same-entry conflicts | Keep both sides as data; never choose by recency. Let the write land and record the conflict, then refuse the next verb that depends on that entry with a typed remedy, and surface it where people and sessions already look. No conflict markers as the record of truth.                                                                                                                                                                                        |
| 3. Push contention      | GitHub recommends at most 6 pushes per minute per repository, shared with code pushes — that, not ref locking, is the binding limit. Push per machine in batches at coarse firing points, carry state refs in code pushes with `--atomic`, shard refs by surface rather than per record, batch hot counters as Gerrit does.                                                                                                                                       |
| 4. Backlog order        | Fractional indexing (Greenspan's scheme, `rocicorp/fractional-indexing`), sorted by `(rank, stub id)`; no global rebalance, no random jitter. Two writers moving one stub is a same-entry conflict, not a ranking problem.                                                                                                                                                                                                                                        |

## 1. Stale projections

### What the precedents do

| System             | Base it records                                                                        | What refuses or reconciles                                                                                                                                                                          | Standing                                                                                                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jujutsu workspaces | Each workspace records the operation its working copy was last materialized at         | A command refuses "The working copy is stale" on mismatch; `jj workspace update-stale` re-materializes; every command snapshots the working copy first                                              | **[checked]** design (`docs/technical/concurrency.md`). Open defects: **[checked]** #7229 (Aug 2025, open) — `update-stale` after another workspace pushed "destroyed all changes in the workspace"; **[checked]** #7538 (Sep 2025, open) — spurious staleness, often with `.git/index.lock` contention |
| git-bug            | The ref head it read                                                                   | **[checked]** PR #1610, merged 2026-09-16: entity commit becomes a compare-and-swap `UpdateRef` that fails with a ref-changed error                                                                 | **[corrected]** the analyst's stale-UI example (#235) was fixed in November 2019; the CAS write guard is eight days old                                                                                                                                                                                 |
| grite              | The WAL ref is truth; the sled view is derived and expendable                          | Explicit sync (fetch, ingest, rebuild projections); `grite rebuild` and `grite doctor` as recovery                                                                                                  | Lead: docs read by the analyst; write-side CAS not confirmed. Single-author prototype                                                                                                                                                                                                                   |
| Radicle COBs       | Change DAG under `refs/cobs/<type>/<id>`; SQLite cache                                 | Cache migrates at node start; `rad issue cache` / `rad patch cache` rebuild                                                                                                                         | Lead: rebuild commands from the 1.1.0 release notes; the refresh trigger is unconfirmed                                                                                                                                                                                                                 |
| Perforce           | Server-side have-list: the revision each file in each workspace was synced from        | `p4 submit` refuses unresolved files; `p4 resolve`. Under the default `noclobber`, `p4 sync` never overwrites a writable file that is not opened; `p4 reconcile` finds edits made without `p4 edit` | Lead, except the `noclobber` rule **[checked]** in the `p4 client` options reference. Read-only files are an intent device, not the correctness mechanism                                                                                                                                               |
| Syncthing          | A version vector per file, and since 2025 the hash of the content an edit was based on | Concurrent vectors with different content become a conflict copy; an edit whose base hash matches the current content is not a conflict                                                             | **[checked]** PR #10351, merged 2025-09-13 ("previous blocks hash")                                                                                                                                                                                                                                     |
| HTTP, editors      | ETag; the buffer's read-time content or timestamp                                      | `If-Match` returns `412`; VS Code blocks a save over a changed file; Vim distinguishes W11 (file changed) from W12 (file and buffer both changed)                                                   | Lead (RFC 7232 and `vimhelp` cited as primary)                                                                                                                                                                                                                                                          |

### Against the three § 6.9 candidates

**Candidate 1 — decisions read the store through verbs, never the projection. Adopt, reframed.** Every system
tolerates stale **reads** and refuses stale **writes** by checking a recorded base. "Never read the projection" is
not achievable here — people and agent sessions read the projected files by design — and it is not what the
precedents do. The working form: every write is checked against the store at the base it was made from, and a verb
that decides something re-reads the live ref at decision time rather than a view built earlier in the session.
git-bug's history is the warning for the second half — a cache built at process start and trusted afterward served
stale state (#235, since fixed). **Residual that no precedent closes:** a decision made from a stale read that never
writes anything back is unguarded everywhere. For ARC that means an agent session acting on a stale inbox or backlog
view; the mitigation is that deciding verbs re-read, not that the projection is fresh.

**Candidate 2 — projections refresh at firing points. Adopt, with a no-clobber rule.** This is what every system
surveyed does: Jujutsu snapshots and refreshes around every command, git-bug and grite rebuild on command or sync,
Radicle on node start or explicit rebuild. None watches continuously. The rule Perforce's default `noclobber`
states — sync never overwrites a writable file that is not opened — and Jujutsu #7229 shows the cost of breaking: a
refresh must never overwrite a projected file whose content differs from the base it was materialized at. That needs
a per-path record of the store object each projected file came from, so a refresh is a three-way decision (base,
current store, current disk) rather than a copy. A refresh landing under an open editor buffer cannot count on the
editor's own changed-on-disk prompt. In the editor spike, Zed over its WSL remote neither reloaded nor warned, and
saved silently over the rewrite. Zed on native Linux has the same symptom in an open defect for write-temp-then-rename
(zed #63174 [checked]), the pattern a refresh would use. After such a save, disk differs from the refreshed base
exactly as a deliberate edit reverting the refresh would, so the base record alone cannot tell; the guard has to be
ARC's, and [the concurrency spike][concurrency-spike] tested one.

**Candidate 3 — shared surfaces project once per machine. Lean against it (Owner agrees, 2026-09-24): project
shared surfaces into every worktree; the spike confirms the staleness window.** Jujutsu, git-bug, grite and Radicle
are per-workspace or single-checkout, so no external precedent speaks to it; the case turns on ARC's own history.

ARC runs this candidate today for user notes: `WORKING-MEMORY`, `USER-INBOX` and `STATUS.USER` resolve from every
worktree to the primary checkout's `user/<id>/` (`strategy-session-operations` § User Workspace Directory; every
worktree's recovery load set names `WORKING-MEMORY` by absolute path in the primary). That binding is
`finalize-parallelism`'s BI-6 (`spec-finalize-parallelism.md`, July 2026), and its reason was a storage problem, not
a projection one: each worktree's gitignored copy was its own store. On 2026-07-04 the primary and a worktree held
divergent inboxes; session-init and housekeep in the primary counted only the primary's captures, so a capture
made mid-work-unit never reached housekeep; and a worktree's inbox survived teardown only if notes had synced
first. BI-6 called the binding "the near-term instance of the storage abstraction" — "when Local/backend storage
lands, the resolver's backing store changes; callers do not."

Under ADR-035 that reason no longer holds. The store is `refs/arc/*` in the common Git directory, and a worktree's
copy is a view of it: a capture reaches the ref at its next firing point and every session sees it from there, and
teardown loses nothing once it persists first. What remains is a trade, and the Owner's direct-file-access
requirement decides it:

- **Direct access favors a copy per worktree.** The inbox must open by name and be searchable in whatever editor a
  person uses. An editor opened on a worktree does not see the primary's `user/<id>/` — quick-open and project
  search miss it — which is already true today. A copy in every worktree puts it where the editor looks.
- **Freshness is what per-worktree copies cost.** Several copies can lag instead of one. With every write
  base-checked (candidate 1) and refresh never clobbering an unsaved edit (candidate 2), a lagging copy risks a
  typed conflict at worst, not a lost write.
- **The analyst's "avoid" does not transfer.** It cited Perforce's rule against overlapping workspace roots and Git's
  per-worktree index and `HEAD`; Perforce's rule concerns two checkouts of the same files, not a shared view. The
  lean against one copy per machine rests on direct access instead.

The spike measures the staleness window of per-worktree copies of the shared surfaces at 6 and 20 local writers;
one copy per machine stays the fallback if that window proves unworkable.

## 2. Same-entry conflicts

### What the precedents do

| System                    | On two edits to one entry                                                                                                  | Visibility                                                                                                                                                       | Standing                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jujutsu                   | The operation always commits; conflicts are stored as data in the commit or view; a bookmark moved two ways reads "B or C" | `??` on the bookmark, `jj status` notes it; commands that need a single target (`jj new main`) fail with a typed error; `jj git push` refuses conflicted commits | **[checked]** design. **[checked]** #9571 (May 2026, open): conflicted commits reached Ghostty's remote through plain `git`, "more so 'AI agents'" — the gate is client-side only |
| CouchDB                   | Both revisions kept; a deterministic rule picks the winner every node computes alike                                       | Views return only the winner; `?conflicts=true` lists `_conflicts`; nothing surfaces unless queried                                                              | **[checked]** replication/conflicts docs. Whole-document granularity                                                                                                              |
| Automerge                 | Both values kept; reads return one, ordered by operation counter, then actor ID — never wall-clock                         | `getConflicts(doc, key)` returns winner and losers; the conflict disappears on the next write to that key                                                        | **[checked]** Automerge conflicts docs. Per-field granularity                                                                                                                     |
| git-bug                   | Lamport-clock order with a lexicographic tiebreak; the losing edit survives only in the operation history                  | None found                                                                                                                                                       | Lead (`doc/design/data-model.md`). Same silent supersession as today's user sync, with a fairer tiebreak                                                                          |
| `git notes merge`         | `manual` stops for a person; `ours` / `theirs` drop a side; `union` / `cat_sort_uniq` concatenate                          | Only `manual` is visible                                                                                                                                         | Lead (`git-notes(1)`). Relevant to the one-time notes import                                                                                                                      |
| Syncthing                 | Older-modified side renamed `.sync-conflict-<date>-<time>-<device>`; copies propagate; `maxConflicts` default 10           | No count or list in the UI                                                                                                                                       | **[checked]** #9924 closed as a duplicate of #8114 ("Add the number of sync conflicts to the UI"), still open                                                                     |
| Dropbox, OneDrive, iCloud | A conflicted or numbered copy beside the original                                                                          | None after the fact                                                                                                                                              | Lead; forum reports of conflict copies unnoticed for weeks                                                                                                                        |
| Nextcloud desktop         | Local version renamed conflicted copy and kept local-only                                                                  | System notification, tray icon, unresolved-conflict badge with a clickable list                                                                                  | Lead (`nextcloud/documentation` `conflicts.rst`)                                                                                                                                  |
| Obsidian Sync             | Auto-merges Markdown with diff-match-patch by default; a conflict-file mode since 1.9.7                                    | A sync log filterable for merge conflicts                                                                                                                        | Lead; its own help warns the merge can duplicate or garble text                                                                                                                   |

### The shape the evidence supports

The analysts split on one point, and the split resolves by separating the **write** from the **gate**:

- **The write lands and records the conflict.** Refusing the write outright strands the losing edit in one worktree's
  gitignored projection, which is not durable — the silent-loss failure moved one layer down. Jujutsu's "the
  operation cannot fail to commit", CouchDB and Automerge all keep both sides as data for this reason.
- **The gate is the next verb that depends on the entry.** A verb that reads or writes a conflicted entry returns a
  typed conflict with the resolving command; verbs over other entries proceed, so an unattended session is not
  stalled by an unrelated conflict. That is the requirement's "refuse with a typed remedy", placed where the
  refusal is safe.
- **It cannot be missed.** Surface open conflicts in `arc status`, session-init and handoff — Nextcloud's badge, not
  Syncthing's file in the tree. No silent cap on retained conflicts.
- **The record is structured, not markers.** Keep base, both sides and each writer's identity in a typed record. The
  projection may render a flagged view of it for people, but conflict markers in a projected file are not the
  record: agents parse files, and **[checked]** Jujutsu #3975 (fixed January 2025 by an escaping scheme) shows how
  fragile materialized markers are for tools.
- **A deterministic default for reads that need one value.** Order by a logical counter and writer identity, never
  wall-clock time.
- **Resolution names what it resolves.** Automerge clears a conflict on any later write to the key; for ARC a write
  that never saw the conflict must not silently resolve it. The resolving write takes the conflict record as its
  base.
- **The gate lives in the store's read path, not only at push.** Jujutsu #9571 shows a client-side gate bypassed by
  plain `git` and by agents; `refs/arc/*` is equally writable by plain `git`.
- **Granularity is the entry.** Per file over-conflicts (CouchDB's whole-document lesson); per field waits for the
  records engine. Files first means the entry is the unit.

## 3. Team-scale push contention

The heavy-research run verified 6 of 10 checked claims (46 agents, 36 claims extracted). It left `--atomic` support
by host, single-ref compare-and-swap semantics and Gerrit's retry policy unanswered; the rows marked **[checked]**
below fill those from primary sources during this research.

| Finding                                                                                                                                                                                                                                                                                                                            | Standing                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **GitHub recommends at most 6 pushes per minute per repository**, 15 Git read operations (fetches, clones) per second per repository, and 5,000 branches; large branch counts slow fetches and "in extreme cases" throttle the repository. These are recommended maximums; enforcement is not documented                           | **[verified]** 6 pushes and 5,000 branches; **[checked]** 15 reads, GitHub "Repository limits" page |
| A multi-ref push without `--atomic` can partly succeed: `post-receive` gets one line per ref that actually updated                                                                                                                                                                                                                 | **[verified]** `git-receive-pack(1)`                                                                |
| `git push --atomic`: "Either all refs are updated, or on error, no refs are updated. If the server does not support atomic pushes the push will fail." `receive-pack` advertises the capability by default (`receive.advertiseAtomic`)                                                                                             | **[checked]** `git-push(1)`, `git-config(1)`, git 2.55                                              |
| **GitHub supports atomic pushes and push options**: this repository's `origin` advertises `atomic` and `push-options` from `github/spokes-receive-pack`                                                                                                                                                                            | **[checked]** live receive-pack advertisement, read-only, 2026-09-24                                |
| GitHub's replicated three-phase commit needs a majority of replica locks, so two concurrent pushes to one repository cannot both proceed at once; each replica takes Git reference locks and checks old values. Whether pushes to **distinct** refs contend is unsettled — GitHub's own DGit post declines to describe the locking | **[verified]** at 2 of 3 votes, from a secondary blog only; the distinct-ref question stays open    |
| **GitLab limits Git over SSH to 600 operations per minute per user, per project, per command** (`git push` has its own 600); fixed on GitLab.com, configurable self-managed                                                                                                                                                        | **[checked]** GitLab "Rate limits on Git SSH operations" docs                                       |
| GitLab's Praefect is the router and transaction manager required for Gitaly Cluster. When strong consistency is unavailable, secondaries replicate asynchronously and can lag, and a documented race lets post-receive CI hit a replica that has not received the push                                                             | **[verified]** Praefect's role; the lag and race are leads                                          |
| **Gerrit NoteDb puts each change's metadata on its own ref** (`refs/changes/45/12345/meta`, a notes branch)                                                                                                                                                                                                                        | **[verified]** `note-db.html`                                                                       |
| **Gerrit allocates numbers from a shared sequence ref in batches**: `refs/sequences/*` holds the next number; each process increments it by a batch (`notedb.*.sequenceBatchSize`) and hands numbers out in memory until the batch runs out                                                                                        | **[checked]** `config-gerrit.html`                                                                  |
| **Gerrit retries NoteDb lock failures** with exponential backoff plus random jitter up to `retry.maxWait` (default 5 s), then at fixed intervals up to `retry.timeout` (default 20 s)                                                                                                                                              | **[checked]** `config-gerrit.html`                                                                  |
| Gerrit's per-change meta refs are not guaranteed append-only; they may be rewritten                                                                                                                                                                                                                                                | Lead                                                                                                |

### What it means for the design

- **The binding constraint is GitHub's push rate, not ref locking.** Six pushes a minute per repository, shared with
  every code push the team already makes, cannot absorb a push per session per write at ten people × six sessions.
  Pushing is needed only for cross-machine visibility — on one machine every worktree sees a ref write at once — so
  push from the store per machine, batched at coarse firing points (handoff, lifecycle transitions, an explicit
  sync), never per write. The spike should size the batch interval against the envelope.
- **Ride code pushes where they already happen.** GitHub supports `--atomic`, so a lifecycle step that already
  pushes a code branch can carry its state refs in the same push: one push against the budget, and no partial
  landing.
- **The backing-repository backend has a second argument at team scale.** Its pushes spend a separate repository's
  budget. That is a documented reason for a team near the envelope to choose it, beyond privacy.
- **Ref count cuts the other way.** One ref per entity avoids contention but grows the ref advertisement every fetch
  reads, and GitHub warns about branch counts. Whether `refs/arc/*` counts toward the 5,000 figure is unstated. Shard
  by surface and writer — per identity, per active work unit, per shared surface — and compact completed work into
  archive trees (storage analysis § 7 row 11), rather than one ref per record.
- **Hot shared counters batch, as Gerrit's do.** Claims that hand out numbers (record numbers, sequence IDs) can
  reserve a block per process and allocate from it locally, which turns many contended updates into occasional
  ones.
- **Retry is bounded and jittered.** Gerrit's defaults — exponential backoff with jitter to 5 s, give up at 20 s —
  are a concrete starting point for `cas-retry.ts` on the remote path; a push that exhausts the budget returns a
  typed refusal rather than retrying without bound.
- **Read after push may be stale on GitLab clusters.** A verb that pushes and then reads back from another node
  cannot assume it sees its own write; confirm from the local store, not a fresh fetch.
- **Still open for the spike:** whether pushes to distinct refs of one GitHub repository contend; `--atomic` on
  GitLab, Bitbucket, Azure DevOps, Gitea and Forgejo (storage analysis § 5.2 records GitHub and GitLab yes, Azure
  DevOps no, Bitbucket unverified); the exact rejection a losing concurrent pusher sees on each host.

## 4. Backlog order

**Adopt fractional indexing.** **[checked]** `rocicorp/fractional-indexing` implements Greenspan's scheme:
`generateKeyBetween(a, b)` returns base-62 string keys (`a0`, `a1`, `a1V`, `Zz`), with variable-length integer heads
and the prepend and append optimization, plus `generateNKeysBetween` for evenly spaced batches. Keys grow under
repeated insertion into one gap; Figma's account is that growth stays bounded by user activity in practice, so no
rebalance is scheduled.

- **Ties:** sort by `(rank, stub id)`. Two writers inserting into the same gap on different machines may produce the
  same key; the stub ID breaks the tie deterministically. Random jitter only lowers collision odds and costs
  reproducible diffs and tests — keep it off unless the spike measures real collisions at the envelope.
- **Moves:** moving a stub rewrites its own rank. Two writers moving one stub is a same-entry conflict (§ 2 above);
  a move and a nearby insert are disjoint records and merge, possibly not where either writer meant — grooming
  drift, not a conflict.
- **Relief valve:** if a gap ever becomes pathological, re-space only its immediate neighbours. Never a pass over
  every record.
- **Avoid LexoRank.** Jira's bucket rebalance rewrites every row's rank, and Atlassian ships a rank integrity checker
  for its recurring corruption (lead, Atlassian admin and support docs).
- **Details to pin:** store the rank as a quoted string in front matter; compare by byte order (`LC_ALL=C` for any
  shell tooling).
- **Unverified:** Greenspan's article (rate-limited) and Kleppmann et al.'s interleaving-anomaly paper (unreadable
  PDF). Interleaving matters only when two writers each bulk-insert a run into the same gap, and yields an ordering
  glitch rather than loss.

## Sources checked during this research

- Jujutsu: `docs/technical/concurrency.md` (jj-vcs/jj); issues #7229, #7538, #9571, #3975.
- git-bug: issue #235; PR #1610.
- Syncthing: issues #9924, #8114; PR #10351.
- Automerge: <https://automerge.org/docs/reference/documents/conflicts/>.
- CouchDB: <https://docs.couchdb.org/en/stable/replication/conflicts.html>.
- Perforce: `p4 client` command reference, options table (`[no]clobber`).
- Zed (zed-industries/zed): issue #63174 (open, 2026-08-24), atomic replacement leaves the buffer stale and a save
  overwrites the newer disk contents; issue #41614, WSL remote project not refreshing on external changes.
- `rocicorp/fractional-indexing` README.
- Git 2.55: `git-push(1)` (`--atomic`), `git-config(1)` (`receive.advertiseAtomic`); `origin`'s receive-pack
  advertisement.
- GitHub "Repository limits"; GitLab "Rate limits on Git SSH operations"; Gerrit `config-gerrit.html` (sequence batch
  size, `retry.maxWait`, `retry.timeout`).
- Heavy-research verified citations: `git-receive-pack(1)`, GitHub "Repository limits", GitLab Praefect docs, Gerrit
  `note-db.html`, and one secondary blog on GitHub's replication.

Every other source is the analysts' and stays a lead until read. The seven analyst reports and the heavy-research
run's per-agent results, leads included, stayed outside this repository.

---

[storage-analysis]: ../analysis/analysis-storage-substrate-direction.md
[storage-landscape]: research-storage-landscape-2026-07.md
[concurrency-spike]: ../analysis/analysis-storage-concurrency-spike.md
[editor-spike]: ../analysis/analysis-storage-editor-ergonomics-spike.md
