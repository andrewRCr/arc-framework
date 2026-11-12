# Draft: projection-narrowed-views

- **Origin:** split from `projection-team-scale` on 2026-11-10 (Owner). That unit had taken C, D, and the
  growth-relative scale criterion from `projection-worktrees` on 2026-11-07, after a Windows scale assessment. Anchoring
  the design at this repository's measured throughput showed that only D, the archive laid read-only and amended
  through `arc edit`, changes what the flip lays or how a correction lands; C, and the work the anchor added, change
  nothing at this repository's size. `projection-team-scale` keeps D and lands before the flip; this unit takes C, an
  archive recency window, and the backlog walk and fanned pull at team scale, and follows the cutover window.
- **Purpose:** Keep a worktree's projected files, and the cost of a command, a spawn, and a fanned pull, bounded by what
  one person works on rather than by the team's size or the archive's age, by narrowing the projected backlog and
  archive.

---

## Drafting status

- **Readiness:** maturing. The scope is known, and what stays open is detail design (§ Open below).
- **Class:** `Heavy`. A real design must be authored — the narrowing's semantics at the anchor, the recency window, and
  the transition invariants — but it composes existing pieces (the view setting, reprojection, the removal path, and
  the index's partitions), so nothing must be invented.
- **Resolved** in `projection-team-scale`'s drafting on 2026-11-10 and carried here: C's view semantics and thresholds,
  the scale anchor, and a fanned pull's cost as this unit's (§ Settled at drafting).
- **Open:** the recency window (§ The recency window, proposed and not yet answered); the backlog's per-command walk at
  the anchor; the fanned pull at the anchor; re-testing C1 and C2, which widen the view and were agreed before the
  anchor made narrowing the normal case; the scale criterion (§ The growth-relative scale criterion); how a refresh
  round decides a record's place in the narrowed view without re-listing per worktree; whether the design adds a
  prepared store write of its own; and ADR-035 item 6's amendment text, which waits on the envelope's realignment
  (§ The scale anchor).
- **Next:** the recency window's open questions, then the backlog walk and the pull at the anchor.

## Scope

- **C — the view covers backlog and archive, narrowing by size,** with a notice and `all` one setting away.
- **An archive recency window** that bounds what a spawn lays by size, newest quarters first (in exploration).
- **The backlog's per-command walk and a fanned pull at the anchor,** each held to the projection's own share of its
  budget.
- **The growth-relative scale criterion** for what C and the window change: a command with a large backlog, a spawn,
  and a fanned pull, read past the store's own cost.
- **ADR-035 item 6's refinement:** a dated amendment recording that C narrows "any artifact opens by name".
- **Re-basing `spec-projection-worktrees.md` § 15.5's figures,** grown at k=2, through this unit's forward amendments
  (Owner, relayed 2026-11-10).

Not here: D, its amendments to `spec-projection-write-back.md` § 8.4, the `arc save` part of the criterion, and the
errata convention's coordination with `cutover-flip` (`projection-team-scale`); A and E, and the plain benchmark for
A's growth claim (`projection-worktrees`); and the store's own per-command cost at 50–150 developers, captured for
`storage-ref-release-hardening`.

**B was reverted** (2026-11-07, in `projection-worktrees`' review loop): a pull's or push's merges fan out to every
worktree again. The criterion's clause "a pull lays nothing in other worktrees until their next command" was B's
behavior and no longer holds anywhere, and holding the merges until each worktree's next command does not avoid their
cost, since the next write's fan-out lays them. A fanned pull's cost at team scale is this unit's (§ The scale anchor).

## Sequencing

This unit binds 1.0, not Gate B, and follows the cutover window; the cohort record orders it, and no edge on the flip
holds it. It builds on `projection-worktrees`' index partitions and reprojection, its one edge.

`projection-team-scale` and this unit each add a field to the index header as a forward amendment to
`spec-projection-worktrees.md` § 3.1: the opened archive set there, and the effective view per root in `projectedUnder`
here. Whichever lands second changes the header's format on top of the other's; neither reshapes the partitions. If
the recency window keeps opened files laid (§ The recency window, point 3), this unit reads `projection-team-scale`'s
opened set and takes an edge on it; that unit lands before the flip, so the edge would order nothing that the window
does not already.

Two guards from the 2026-11-07 split hold here: `projection-worktrees`' specification designs A's partitions as the
seams C builds on (§ Seams this builds on), and the held C text moves over as written (§ Held design text), not
re-derived.

## Transition invariants to state in planning

Agreed with the Owner on 2026-11-07, after `cohort-identity-verbs` traced six review passes to transition invariants
its design never stated. For each step pair, the design states what must hold between the steps, where it is enforced,
and the perturbation test that proves it. Each test asserts a refusal, then a legitimate repair, then the operation
continuing. The cases known now:

- **C:** the narrowing decision when the view setting or the root's size changes between the size check and the
  reprojection.
- **The recency window, if adopted:** a quarter leaving the window at a size check while one of its files is opened for
  a correction (`projection-team-scale`'s `arc edit`) or holds an edit.
- **Prepared store writes:** a write this design prepares from store reads and submits as one batch states its fence
  by the pattern approved for prepared writes on 2026-11-07 (`cohort-identity-verbs`' design amendment A7): it
  re-derives its decision in a write check over `before`, or observes everything that decision read. Its perturbation
  test injects a store change between preparation and the batch for each kind of read the preparation makes.

## Held design text — C

Copied from `projection-team-scale` on 2026-11-10, which copied it from `projection-worktrees` as written on 2026-11-07,
with only heading levels adjusted. Part 1 is the design brief the Owner approved with A–E; Part 2 refined C before the
first split, and governs where the two differ.

### Part 1 — the brief

#### C. The view covers backlog and archive, narrowing by size

- New personal keys `arc.backlogView` and `arc.archiveView`: `auto` (default), `all`, `cohort`, `mine`; pins
  (`arc.inflightPin`) apply to every root. `arc.inflightView` keeps `mine` as its default.
- `auto` is `all` while the store holds at most a threshold of that root's files (backlog ~500, archive ~5,000 — from
  the model: Windows' walk room in the 60 ms budget, and a ~6–8 s spawn), and `cohort` above it; crossing it reports a
  notice once per worktree naming the key to set `all`.
- `cohort`/`mine` for backlog and archive: the person's own (owner or creator), their cohort's, unowned stubs in their
  cohort, and every work unit an in-view unit `Depends On` (so A's dependency B lands).
- The effective view per root is recorded in `projectedUnder`; a change reprojects as § 10.4 does now.

### Part 2 — refinements put to the Owner (2026-11-07, about 8:15 am CT)

> 1. **The automatic view (C), three sub-decisions:**
>    - _When the size is checked:_ not on every command, since counting means a store listing and three Git calls each
>      time. It's checked when a worktree is built, re-laid or reprojected, using the listing those already make, and
>      recorded in the index. **Lean: yes.**
>    - _Flip-flopping:_ a backlog hovering around the threshold would add and remove thousands of files across 20
>      worktrees each time it crossed. My lean is to narrow automatically when the size crosses the threshold, and only
>      ever widen again when you explicitly set it. Thresholds from the model: about 500 backlog files and about 5,000
>      archive files. **Lean: yes.**
>    - _Dependencies (new, not part of what you approved):_ the narrow views would also include every work unit that
>      something in your view depends on. If A depends on B, B's archive lands even under a narrow view. **Lean: yes.**

### Decision status

- **Approved with A–E (2026-11-07):** C's per-root view keys `arc.backlogView` and `arc.archiveView`, valued `auto`
  (default), `all`, `cohort` or `mine`, with pins applying to every root and `auto` narrowing by size with a notice.
- **Confirm at drafting — C's automatic-view mechanics:** the three sub-decisions in Part 2, proposed as written, each
  leaning yes. Confirmed on 2026-11-10 (§ Settled at drafting).
- **Re-derive the thresholds.** About 500 backlog and 5,000 archive files came from model v1; § Settled at drafting
  re-derives each from the bound it protects.

## Settled at drafting

Settled with the Owner on 2026-11-10, in `projection-team-scale`'s drafting before the split. Where these differ from
the held text above, they govern.

### C's view semantics

The in-flight view today matches `mine` on a work unit's `Owner` field and `cohort` on the exact cohort path of the
checkout's own work unit, which a checkout with no work unit lacks (`matchesView`, `selectProjectionView`,
`lib/store/projection/view-selection.ts`). For `backlog/` and `completed/`:

1. **`cohort` keys on the person, not the checkout:** every cohort in which the identity owns an in-flight work unit.
   A checkout with no work unit, the primary among them, then gets a real view; every checkout a person holds projects
   the same backlog and archive; and someone in two programs sees both. It reads Part 1's "their cohort's" as written.
   The word differs here from the in-flight view's meaning, which stays as it is.
2. **A cohort match takes the whole top-level cohort,** a cohort and every subcohort beneath it, for work units and
   cohort documents alike, since a member reads its parent's and siblings' material constantly: this unit cites
   `spec-storage-ref-backend.md` and `cohort-state-storage.md`, both `state-storage`'s rather than
   `storage-projection`'s.
3. **`Depends On` reaches one hop:** a work unit lands when one in the view depends on it directly, not on what it
   depends on in turn, since a chain through a long-running program would reach most of the archive. The cohort match
   already holds most direct dependencies, and pins (`arc.inflightPin`, which apply to every root) hold the rest.
4. **Part 2's three leans stand:** the size is checked when a worktree is built, re-laid, or reprojected, from the
   listing those already make, and recorded in the index; `auto` narrows once a root crosses its threshold and widens
   only when the person sets `all`; and the notice shows once per worktree.
5. **Each threshold follows the bound it protects,** re-derived from model v2's constants
   (`notes-projection-worktrees.md` § Spike 4) rather than model v1's figures: the backlog's where its walk and stats
   on Windows outrun the start's two Git calls, which they run beside (`spec-projection-worktrees.md` § 15.3), and the
   archive's where a full materialization reaches its 5 s Windows tripwire (§ 15.4 there).

The selection composes over the lifecycle listing, whose entries already carry each meta's `owner`, `cohort`, and
`dependsOn` (`listLifecycleIndex`, `lib/store/lifecycle-index.ts`), as the in-flight view's inventory does. One
identity owns every work unit in this repository, so narrowing selects everything here; the tests need a synthetic
store with several owners and cohorts.

### The scale anchor

The design holds at these, settled with the Owner on 2026-11-10:

- **Team size: 1, 10, 50, and 150 developers,** with only larger teams deferred. This challenges ADR-035 item 7 and
  `strategy-storage-evolution.md`, which state an envelope of about ten people running about six sessions each and
  defer larger scale to a service backend conceived before the current storage design and not revisited since. This
  draft designs to the Owner's range; realigning those documents, and re-examining what the service backend is still
  for, is captured for `arc-coordination-service` and was raised to the project-manager session for triage, since the
  store's own costs reach beyond the projection.
- **Throughput: 23 work units a month per person, 42 at peak,** this repository's measured rate (25 shipped in
  October 2026, 42 in July; one person with agents). The scale assessment's growth table ran k=2 and k=8, so its
  team-scale rows understate growth about tenfold. No published source counts designed work units: the nearest unit,
  merged pull requests, runs about 1.1–2.6 per developer a week in vendor telemetry, roughly doubling in heavy-AI
  cohorts, and the controlled studies find smaller or uncertain effects, so published data neither validates nor
  contradicts the measured rate.
- **Worktrees: 20 per machine,** the scenario `projection-worktrees` states its tripwires at; the machine this was
  drafted on holds 13 that hold a projection (18 registered, five of them machinery checkouts that hold none).
- **No time horizon for a command, a save, or a spawn.** A makes the archive's size cost a command nothing, D
  (`projection-team-scale`) takes it out of `arc save`, and a recency window, if adopted, takes it out of a spawn, so
  none of the three depends on how many years of archive exist.
- **The share of a team's work in one person's view is a stated assumption,** since a repository with one owner cannot
  measure it; the design is sized to hold at a conservative share rather than at a tenth.

Owner decisions relayed by the project-manager session on 2026-11-10:

- **The 1/10/50/150 target binds 1.0, not Gate B,** so this unit carries no pressure from the cutover's dates.
- **The store's own cost at that range is not this unit's.** It is captured in `USER-INBOX § Work Unit` as "Hold the
  store's per-command cost at 50–150 developers", targeting `storage-ref-release-hardening`: a state version maintained
  at write time, and listing, fetch, and ref packing at the range.
- **Nothing goes to `projection-worktrees`.** Its tripwires are fixed bounds, and its § 15.5 figures, grown at k=2, are
  re-based through this unit's forward amendments to its specification.

What the anchor shows, from model v2 re-run at it (§ Evidence):

- **C matters inside ten people.** At ten people with every view `all`, a command costs about 194 ms on Windows and
  23 ms on Linux, against budgets of 60 ms and 10 ms, mostly the backlog's walk of about 2,400 files; a spawn takes
  about 45 s and 1.2 GB on Windows.
- **C does nothing for one developer,** whose view holds all their own work: at three years a spawn reaches about
  4.5 s on Windows against the 5 s materialization tripwire, and passes it after. That is what the recency window
  answers.
- **A fanned pull's cost is this unit's,** and C is the mechanism that bounds it: each worktree lays only the merged
  records in its view. Narrowing alone leaves it past the 600 ms Windows tripwire at the anchor — about 962 ms at ten
  people with a tenth in view and 2.3 s with a third — since about 300 ms of each round is Git calls, about 5 ms a
  worktree its visit, and the rest the view's share of the team's changes.
- **The store's own floor passes the budget at 50 and 150 people.** `version()` lists every live ref, about one per
  stub: about 5,900 refs and 73 ms a command on Windows at 50 people, and about 17,700 refs, 132 ms on Windows and
  25 ms on Linux, at 150, before the projection does anything. This unit can hold only the projection's own share
  there, so its criterion reads past the store's cost as `projection-worktrees`' Success Criterion 4 reads past the
  host's Git cost.

**Prior art.** No working-copy tool surveyed narrows by recency. Git's sparse checkout (cone mode) and Scalar,
Perforce's tight client views, and Sapling with EdenFS narrow by path or by access and let the person widen it; each
targets far larger stores, millions of files or more, and none copies a full working copy into every worktree and
re-checks it on every command against a budget of milliseconds. Perforce's archive depots, read in place with
`p4 print -A`, are the nearest precedent for reading older material without restoring it. A recency window would be
this design's own; the prior art's consistent lesson is to make a narrowing explicit and overridable, show that more
exists, and let a person read the rest on demand.

## The recency window

Proposed to the Owner on 2026-11-10, who judged it worth working through; the five points below are not yet answered.
Nothing else bounds how much `auto` keeps: the thresholds decide when to narrow, not how large the result is, and for
one developer the view holds everything.

1. **Bound by size, newest first.** Once the archive in view passes its threshold, `auto` lays whole quarters, newest
   first, until the next quarter would pass the threshold. The threshold is C5's, where a full materialization reaches
   its 5 s Windows tripwire, so it both decides when to narrow and caps how much a spawn lays, for any team size or
   rate. A fixed number of quarters is simpler but does not scale: four quarters still costs about 5.8 s at ten people
   with a third in view.
2. **How it composes with the views:** `auto` keeps everything while the whole archive sits under the threshold;
   past it, it narrows to C's view; and where the view still exceeds the threshold, it fills quarters newest first.
   Explicit `cohort` and `mine` take the last two steps, and an explicit `all` lays everything.
3. **What is always laid, whatever its age:** the work units something in view depends on directly (C3), pinned work
   units, and files opened for a correction with `arc edit`, which stay laid while open.
4. **Reaching older material:** the once-per-worktree notice says how many archived units are not laid and how to get
   them; `arc view` reads any record; `arc edit <path>` on an older file lays it and opens it; a pin lays a whole unit;
   and `all` lays everything. The storage register records `arc view` returning a completed work unit with no path, so
   confirm it reads an archived record before relying on it.
5. **When a quarter drops out:** at the size checks a worktree's build, re-lay, or reprojection already makes, so an
   ordinary command pays nothing; through the removal path, which takes any edit in first.

It reuses A's quarter partitions, C's size checks and reprojection, and the removal path.

## The growth-relative scale criterion

Two wordings, both verbatim. The design brief's, approved with A–E but not yet put to the Owner as a criterion:

> "An ordinary command's overhead does not grow with the archive or the team's activity: with 60,000 archived files
> and a pull of a day's changes waiting, the no-change overhead stays within its budget plus N ms, and a pull lays
> nothing in other worktrees." — a benchmark at synthetic scale in the store or integration suite.

The later wording, put to the Owner on 2026-11-07 as decision 4 of four:

> 4. **New success criterion for scale.** "An ordinary command's overhead does not grow with the archive or the team:
>    with 60,000 archived files, the no-change overhead stays within N ms of its value with an empty archive, and a
>    pull lays nothing in other worktrees until their next command." It's checked by a synthetic-scale benchmark. From
>    the model, N is a few ms on Linux and about 10 ms on Windows. **Lean: add it.**

Neither fits now: the archive-size clause is A's claim, which `projection-worktrees` benchmarks and reports, and the
pull clause was B's. Proposed on 2026-11-10 and not yet answered, restated over what C changes, with a pull clause in
place of B's:

> **A command, a spawn, and a fanned pull cost what the person's view holds, not what the store holds.** In a synthetic
> store at the anchor, owned by several people across several cohorts: the no-change overhead stays within its budget
> with a backlog past its threshold; a full materialization lays only the view's files, within its tripwire; and a
> fanned pull lays only what is in each worktree's view, so its cost grows with the view's share of the team's
> changes, not the team's.

Each Windows median reads past the host's Git cost and the store's own, as `projection-worktrees`' Success Criterion 4
reads past the host's Git cost. Whether the pull clause holds a number at the anchor or states structure only is open.
The `arc save` clause belongs to `projection-team-scale`.

## ADR-035 item 6's refinement

No amendment text was drafted before 2026-11-10. What was put to the Owner on 2026-11-07:

> **ADR-035.** Its item 6 says any artifact opens by name and is searchable from your editor; C narrows that once a
> store is large. Item 7 says the writer refreshes your other worktrees, which B qualifies for pulls. The ADR
> methodology offers two routes:
>
> - **(a) A dated amendment appended to ADR-035** saying C refines item 6 and B refines item 7, leaving the decision
>   text untouched. ADR-035 already has four such "refines item N" amendments. **My lean:** the decision itself stands
>   (the store is the authority; the working copy sits at the familiar paths and opens in your own editor); C only
>   bounds what lands by default past a size, with `all` one setting away.
> - **(b) A new ADR that supersedes it,** if you read C as changing the decision itself.

The Owner agreed route (a), the Tier 2 lean, for item 6's refinement. Item 7 takes no amendment: B, which refined it,
was reverted. Follow ADR-035 § Amending This Document and its four "**Amendment (2026-09-29):** The contract design
refines item N" annotations, and load `strategy-adr-methodology.md` before writing it.

Text proposed on 2026-11-10, naming no work unit as the ADR methodology's reader-independence rule asks:

> **Amendment (date):** Item 6's "any artifact opens by name" holds by default only while a store is small. Past a
> size threshold for each root, a worktree projects of `.arc/backlog/` and `.arc/completed/` only the records in its
> person's view — the work units they own, those in the cohorts they work in, and the work units those depend on
> directly — and says so once, naming the setting that projects everything. Every record still opens by name once
> pinned or with that setting at `all`. Archived files lay read-only: a correction opens one file with
> `arc edit <path>` and persists at `arc save`. The decision stands: the store is authoritative, and the working copy
> sits at the familiar paths, opened in a person's own editor.

Its archive sentence describes `projection-team-scale`'s D, which lands first. The amendment waits on the envelope's
realignment (§ The scale anchor), since ADR-035 may instead be superseded.

## Seams this builds on

A's partitions are designed as fixed seams in `spec-projection-worktrees.md`. Its section numbers are expected to hold;
its wording may still move, so re-read the committed text before relying on it here. Checked on 2026-11-10 against its
work branch at `8db69d5bbb`, with that unit in execution at its Task 1.2, the index's header and partitions: § 3.1,
§ 15.3, § 15.5, and § 16.2 read as summarized below, and the seams statement as quoted.

- **§ 3.1 "The index's parts":** the header and partitions. One root group per root and per `completed/` quarter, loose
  `completed/` files their own group; SHA-1 blob-id names; the header as the commit point; reads load only the
  partitions holding touched entries; lock-free readers; a racy reference per written partition; a plain-JSON codec;
  and separate header and partition schemas. The header also marks each partition holding an unsettled entry: one
  ownerless, or a record naming an aside or kept taken-in copy, carrying an adoption, a pending or withheld mark, or a
  refusal, or holding a conflict notice it has not shown. A changed or in-progress mark leaves a partition unmarked,
  since a rebuild sets the changed mark on every file it finds. Passes over every entry read the walked partitions and
  the marked ones, `arc save` reads every partition, and the selection every one outside `completed/`. A partition
  mismatch a command finds in its own worktree after its start's read deletes that partition, never the header; a
  fan-out's visit, and the end in another worktree the fan-out visited, delete nothing.
- **§ 3.1 "The partitions' seams":** the fixed-seams statement, quoted below.
- **§ 15.3 "The index read, and what is left on Windows":** a command reads its walked roots' partitions, and an
  archive quarter's only where it lays, removes or sweeps a file there, so the archive's size costs a command nothing.
- **§ 15.5, the fan-out paragraph:** a worktree a fan-out visits reads and writes its header and the partitions holding
  each path it lays or removes.
- **§ 16.2 "The index is a header and partitions":** the forward amendment to `spec-projection-substrate.md` § 3.1 and
  § 3.3.

§ 3.1, as drafted:

> **The partitions' seams.** The root groups — one per root, `completed/` one per quarter — and the header as the
> commit point are the index's fixed seams. A change to which of `backlog/`'s or `completed/`'s records a worktree
> projects, or to how archived files are laid and edited, changes the entries a partition holds and the behavior laid
> over them, never how entries are grouped, named, or committed.

## Evidence

The scale assessment's results are in `notes-projection-worktrees.md` § Spike 3 and § Spike 4: the per-unit constants,
model v2's growth table on the Windows runner, and the corrections taken at that unit's specification fold (2026-11-07),
from which the thresholds are re-derived.

The anchor's figures (§ The scale anchor) re-run that model (v2) at k=23 work units a month per person, 20 worktrees,
and three years of archive, for T of 1, 10, 50, and 150 people, varying the share of the team's backlog, archive, and
daily changes in one person's view and the archive quarters a spawn lays; a fanned pull costs seven shared Git calls
plus, in each worktree, its visit, the index work over the backlog's and current quarter's partitions, and the writes of
its share of the day's changes. The re-run reproduces the model's own `narrow` row at T=50, k=2 (56 ms a command, 122 ms
an `arc save`, and a 2.0 s spawn on Windows). It inherits the model's limits: linear, the index codec's constant taken
at the measured size nearest each scenario, no contention, and Windows constants from a runner at below-normal priority.

| Windows, k=23, 20 worktrees | Command | Fanned pull | Spawn, 3 years | Spawn, 4 quarters |
| --------------------------- | ------- | ----------- | -------------- | ----------------- |
| 1 person, all in view       | 63 ms   | —           | 4.5 s          | 1.8 s             |
| 10 people, all in view      | 194 ms  | 6.0 s       | 45 s           | 17 s              |
| 10 people, a third          | 100 ms  | 2.3 s       | 15 s           | 5.8 s             |
| 10 people, a tenth          | 67 ms   | 962 ms      | 4.5 s          | 1.7 s             |
| 50 people, a thirtieth      | 101 ms  | 1.4 s       | 7.5 s          | 2.9 s             |
| 150 people, a hundredth     | 160 ms  | 1.3 s       | 6.8 s          | 2.6 s             |

At 50 and 150 people most of a command's cost is the store's `version()` listing every live ref (§ The scale anchor).
On Linux the same rows run 6, 23, 11, 7, 14, and 27 ms a command. One person's pull brings only their own work from
other machines, which the model's team churn does not describe, so that row shows no pull.

## Inbound Buffer — Pending Integration

### Sequential fan-out attribution — routed from projection-worktrees, 2026-11-11

_Shapes:_ the fanned pull at the anchor, destination scheduling, and the growth-relative scale criterion.

The Owner leaves sibling scheduling here; the proposed concurrent-root locking amendment in `projection-worktrees` stays
held. Its current build preserves sequential root visits and two durable publications per normal refresh, intent before
moving files and final settlement. Removing intent would change recovery rather than merely scheduling.

Native full-round Linux run `334880664e4646cc95ceeca70a1c47cb` measured 217.42 ms for one backlog notes file and 567.38
ms for ten, across the writer and twenty linked worktrees. The Store mutation is outside the timer; version, changes,
protection, layout checks, index publication, and replacement are inside. Spike 4's 3.3/13.4 ms prototype timed smaller
file work with Store reads outside, a simpler lock, and one publication. Current tripwire bounds therefore need their
own full-round calibration.

Diagnostic run `8d12426922ea4e3da5c2c9dbff1e095b`, eleven samples per cell, measured one-root rounds at 32.18/95.26 ms
and 21-root rounds at 209.82/573.65 ms. The additional twenty lock scopes totaled 160.33/442.79 ms. Store record reads
stayed shared: two calls for one changed owner and twenty for ten, independent of destinations. Physical Git starts were
9/27, independent of root count: six control starts, one changes reader, and two public-operation UID readers per
changed owner. Their reader lifetimes end before each public operation returns.

Destination work scales: 42 publications totaled 54.64/55.68 ms; refresh scopes totaled 81.71/425.51 ms, including swap
scopes of 41.79/149.30 ms. These are nested durations and cannot be summed. The rounds made 510/2,625 lstat calls and
189/378 writes totaling 8.18/8.36 MB. Each root rewrote its roughly 192–195 KB backlog partition twice. No
scaffold-pruning call ran in measured fan-out. Consolidating the intent publication's obsolete-partition collection can
save at most its measured tail, about 3.5 ms across all roots, and was left unchanged.

The trace identifies scheduling opportunity without proving every per-root operation necessary or predicting a
concurrency speedup. Scheduling cannot remove shared Store preparation, and narrowing cannot be credited for reducing
unchanged shared reads. Assess bounded sibling scheduling together with view selection at the anchor, preserving
recovery ordering and each root's checks. Attribution and limitations are recorded at commit `6cc7816eba`, in
`notes-projection-worktrees.md`; no scheduling change is authorized by this entry.

---
