# Spec (`detailed` · `RFC`): user-save-status-divergence

- **Origin:** [internal]

- **Purpose:** Redefine "the latest saved user note" by the saved commit's place in history rather than by
  notes-ref write recency, so `arc user status`, `arc user load`, and session-init freshness resolve one and the
  same note and agree by construction. Fixes a correctness bug where a save reports success while status and
  freshness simultaneously report it stale, on the wrong commit, and the disk drifted.

---

## Introduction / Context

Three read surfaces answer "what did the user last save, and is it current?":

- `arc user status` — `savedCommit`, `diskStatus`, and the `note.commit !== sourceCommit` divergence branch
  (`inspectDiskVsLocalSnapshot` in `sync-status.ts`);
- session-init freshness — `localNoteFreshness` (`inspectSessionLocalNoteFreshness` in `sync-status.ts`);
- `arc user load` — the note actually materialized (`runUserLoad` in `save-load.ts`).

All three resolve the note through one primitive, `findNearestUserNote` (`save-load.ts`). That primitive defines
*nearest* as **the first readable note in the newest notes-ref history commit** — it walks the notes ref's own
history via `readNotesRefHistory` (a `git log` over `refs/notes/arc/user/{identity}`), newest-first by *write
recency*, and returns the first note it can read (subject to the per-WU `currentWuName` filter). Ancestry to HEAD
is *computed after the fact* (`reachableFromHead`, `ancestorDistance`) but never drives *selection*.

Write-recency selection is decoupled from the two things that actually determine "what this session last saved":
the commit this machine saved to (the local sync-state `sourceCommit` pointer) and the saved commit's ancestry
relative to HEAD. The moment any notes operation writes or merges a note onto a *different* commit after a save —
most commonly an `arc user pull` bringing in a sibling machine's tip note, or a note re-anchored onto an older
commit later in wall-clock time — the walk follows ref-history recency to the *wrong* note. Then `savedCommit`
reports that note's commit; `diskStatus` reports `mixed` because the resolved `note.commit` no longer equals the
sync-state `sourceCommit` (the `note.commit !== localSyncState.sourceCommit` branch in `inspectDiskVsLocalSnapshot`
— which has a `behind`/`stale` escape only when the resolved note *descends* `sourceCommit`, and the wrong note
here does not, so it falls through to `"mixed"`); and freshness reports the note behind HEAD.

Reproduced deterministically: save a note on commit C, then let any later note land on an older commit A — the
walk returns A. This is a correctness bug in a status/handoff surface agents rely on, so a wrong answer
misdirects session decisions. It is design-worthy (not a quick errand) because the fix requires *defining* which
notion of "the latest saved note" is authoritative and how the surfaces reconcile — a decision with cross-machine
weight, since the pointer is per-machine and structurally absent on a fresh clone.

The change lives entirely within the Cross-Machine User State component (TECHNICAL-OVERVIEW § 2): the
`refs/notes/arc/user/{identity}` layer and the `arc user` command group. It introduces no new component,
dependency, or infrastructure — it redefines one resolution primitive using existing git plumbing.

## Goals

- **One authoritative definition of "the latest saved note,"** grounded in the saved commit's place in history,
  shared by status / freshness and the per-WU load resolution path so they agree by construction rather than by
  coincidence of ordering.
- **Deterministic and portable.** The same repository state resolves to the same note on any machine — no
  dependence on ref-history write order or wall-clock time. The one deliberate exception is the read-your-writes
  tie-break among genuine concurrents (D2), which prefers *this* machine's own save; absent that pointer (fresh
  clone / sibling machine) resolution is fully machine-independent.
- **Read-your-writes and monotonic reads preserved.** At a stable HEAD, a session never sees "latest saved"
  regress below a save this machine actually made. (Deliberate history movement — `reset` / `rebase` / branch
  checkout — legitimately re-anchors to what is reachable from the new HEAD; that is correct, not a regression.)
- **Correct as the ref grows.** Resolution finds any HEAD-reachable note without a distance cap, removing the
  current note-count walk cap as a latent correctness cliff; cost scales with the notes ref, the axis that
  actually grows, not with how far HEAD has advanced.
- **Single-primitive fix.** All consumers inherit the corrected resolution from one changed primitive; no
  per-surface patching. `arc user load` still has its independent cross-WU flat-file merge, but its per-WU
  note resolution uses the same primitive.

## Non-Goals

- **Notes-ref retention / compaction.** Unbounded monotonic ref growth, pruning of shipped-WU notes, and
  ref-history squash are a separate spec-worthy concern captured on its own. This WU only ensures its *own* read
  cost degrades gracefully.
- **The partial-push / coherence-marker machinery** and any broader user-sync redesign.
- **The user-sync module split** (`user-sync-module-split`) — a file-reshaping concern, sequenced separately to
  avoid churn.
- **New configuration axes or storage-location changes.** The pointer's role is defined so as not to bake in a
  "tracked in the code repo" assumption, but no new config knob or backing-store change is in scope.

## Proposed Design

The design is a set of numbered elements (D1–D10). Together they are the enumerable substrate the task list is
built from and validated against.

### D1 — The resolution contract

"The latest saved note" is **the causally-latest note reachable from HEAD** — the reachable note that no other
reachable note descends (D2 makes this precise). The local sync-state pointer serves three refinement roles —
*corroborator*, *concurrent-sibling tie-breaker*, and *monotonic-reads guarantee* (D6) — never as the global
authority. Notes-ref write recency is dropped as **the selection criterion for the latest-saved note**; it
survives only in the cross-WU flat-file merge (`readRecentUserNotes`), which is a non-goal of this WU.

This is the single definition the status / freshness surfaces and the per-WU load resolution path share. It
replaces the current "first readable note in the newest ref-history commit."

### D2 — The resolution algorithm

The discriminator is the **ancestry relation**, not a distance metric. Among the notes whose annotated commit is
reachable from HEAD, a note is **causally-maximal** when no *other* reachable note descends it (tested with
`merge-base --is-ancestor`). Resolution proceeds:

1. **Reachable-maximal base.** Compute the set of causally-maximal reachable notes. When it is a **singleton**,
   that note is the answer — it is the unique causally-latest reachable save. In the linear case (a save on `A`,
   a later save/pull on descendant `C`, both reachable) `A` descends nothing but `C` descends `A`, so `C` is the
   sole maximal note: the descendant wins with no tie-break and no distance arithmetic. Deterministic and portable.
2. **Concurrent tie-break (RYW).** When the maximal set has **more than one** member, those notes are genuinely
   *concurrent* — pairwise, neither annotated commit is an ancestor of the other (across a merge, or the pointer's
   commit versus a pulled sibling note). Prefer the note whose commit is the pointer's `sourceCommit` when it is one
   of them — the commit the working tree is synced to, *regardless of whether it got there by `save` or `load`*
   (D6). This is the read-your-writes/reads anchor: it keeps status stable on the note you already hold, and — since
   it keys on membership, not operation — it is not surrendered when an intervening `arc user load` flips the
   pointer to `op=load`. It can only ever pick an already-maximal member, never introduce a non-maximal note. Never
   rank concurrents by timestamp.
3. **Deterministic fallback within the tie.** When no pointer resolves the concurrent set (D7), pick the member
   with the lexicographically smallest annotated-commit SHA — machine-independent, so every clone agrees.
4. **Portable no-pointer base.** With no local pointer at all (fresh clone / sibling machine), steps 1 and 3
   stand unchanged; the pointer roles simply don't apply.
5. **No reachable note.** When HEAD is divergent or every note is outside HEAD ancestry, return an
   `outside-head-ancestry` result only when the pointer names a known saved commit; otherwise return empty, which
   status and freshness project as `missing`. Never fabricate a `current` verdict.

**Monotonic reads is a property of this rule, not a separate step (D6).** For a **fixed HEAD**, the base never
selects a note an *other* reachable note descends, so the resolved note cannot regress below this machine's own
reachable save (a later save is always the descendant that dominates it). The guarantee is scoped to fixed HEAD by
necessity: deliberate history movement (`reset` / `rebase` / checking out a branch where the newer save is
unreachable) changes what is reachable, and the honest answer then is the nearest save reachable from the *new*
HEAD — the user moved the ground truth, so a different resolved note is correct, not a regression. See D6.

### D3 — Single-primitive refactor

`findNearestUserNote` is the one selection primitive; it is reimplemented to realize D1–D2. Its inputs gain the
local sync-state pointer (`sourceCommit` + `sourceOperation`, read via `readLocalSyncState`) so steps 2–3 can
apply; its return continues to carry `commit`, `reachableFromHead`, `fromAncestor`, and `ancestorDistance` on the
`NearestUserNoteRef` shape. `noteHistoryDistance` loses its selection meaning (it ordered the old walk) and is
retained only as diagnostic provenance, or dropped if no surface reads it substantively.

All five current call sites inherit the corrected resolution unchanged: `runUserLoad` (`save-load.ts`); the three
in `sync-status.ts` — `runUserStatus` (the top-level `arc user status`, which populates `savedCommit` /
`savedFromAncestor` / `ancestorDistance` / `savedReachableFromHead`), `inspectSessionLocalNoteFreshness`, and
`inspectDiskVsLocalSnapshot`; and `push-recovery.ts`. No consumer selected on write-recency deliberately; each
wants "the current note," which D1 now defines correctly. The `savedCommit` path (`runUserStatus`) is the most
user-visible consumer and is explicitly re-validated (Success Criteria).

### D4 — Per-WU filter composition

The `currentWuName` per-WU isolation filter (skip notes not carrying the current WU's subdir, via
`noteManifestContainsWu`) is applied as a **predicate on candidacy**: only notes carrying the WU's subdir enter
the reachable-note set the D2 rule ranges over, so the winner is the **causally-latest reachable note carrying the
WU's subdir**, not the newest-by-recency one. The predicate is unchanged; only the set it filters changes. This
filter is preserved on every path that can return a note — including the off-ancestry load fallback (D8) — so
cross-branch per-WU resume never materializes a different WU's note. Resolving the causally-latest matching note
is strictly more correct than the ref-history-newest one, so `arc user load` improves in lockstep with status.

### D5 — Implementation: enumerate the annotated set, then reduce by ancestry

The D2 rule is realized as **enumerate → filter-reachable → reduce-to-maximal**, not a distance-ordered walk (a
plain `git rev-list HEAD` first-hit orders by commit date, not graph distance, and cannot detect the concurrent
set — it would silently resolve merges by date and bypass the D2/D7 tie-break):

1. **Enumerate** the annotated-commit set with one `git notes --ref=<ref> list` — the candidate commits, bounded
   by the note count on the ref, read in a single plumbing call.
2. **Filter to reachable** — keep the commits that are ancestors of HEAD (`merge-base --is-ancestor <commit>
   HEAD`). When the per-WU filter (D4) is active, also drop commits whose note doesn't carry the WU's subdir; the
   note *content* is read with `git notes --ref=<ref> show <annotatedCommit>` (keyed on the annotated commit —
   *not* `readNoteContentAtHistoryCommit`, which is keyed on a notes-ref *history* commit) and tested via
   `noteManifestContainsWu`.
3. **Reduce to the causally-maximal set** — pass the reachable candidates to a **single**
   `git merge-base --independent <commit>...`, which returns exactly the subset with no member reachable from any
   other (the causally-maximal set) in one call. Do **not** implement this as a pairwise `--is-ancestor` sweep —
   that is O(k²) subprocess spawns, and in the common no-filter linear case (every note is a HEAD ancestor, so
   k = the full note count) it degrades to O(n²), a worse cliff than the one being removed. `--independent` is
   the linear one-call primitive; the reduce is O(1) git invocations. In the common linear case the result is a
   singleton. (`merge-base --independent` is also inherently distinct-safe, so no reflexive-`X`-vs-`X` guard is
   needed.)

**Bound and cost.** The dominant cost is the **reachability filter** (step 2): O(note-count) `--is-ancestor`
tests, or a single `git rev-list HEAD` intersected with the annotated set in memory — the implementation picks
whichever is cheaper for the repo shape. The reduce (step 3) adds O(1) git calls, and the per-WU content reads
(step 2, filtered path only) touch just the candidates carrying a note. Cost therefore scales **linearly with
the notes ref**, not with HEAD-ancestry distance and not quadratically. This is the deliberate departure from the
draft's "candidate-scan bound" sketch: a distance cap (the old `DEFAULT_MAX_ANCESTOR_WALK` repurposed) would
*regress* a real, reachable, correctly-resolved note that merely sits far behind HEAD (routine after a large
upstream merge — 1000+ commits accrues far faster than 1000 saves). Enumerating the annotated set instead means
any reachable note is always found, so correctness holds as HEAD advances. The old note-count walk cap and
`UserLoadWalkExhausted` no longer gate the reachable path; retire or repurpose them as the implementation dictates
— but note that `result.kind === "walk-exhausted"` is currently branched on by **four handler sites**
(`handlers/user.ts:346,614`; `handlers/user-sync.ts:281,319`) with exit-1 semantics, so retiring the outcome must
update those consumers, not just the primitive (a task the D3 call-site enumeration does not cover — those are
`findNearestUserNote` callers; these are `UserLoadOutcome` consumers). If ref growth ever makes even the linear
pass a real cost, the retention/compaction concern (a Non-Goal) is where that is addressed.

### D6 — Pointer trust and the monotonic-reads guarantee

The pointer plays two roles, and they trust it *differently*. The **concurrent tie-break** (D2 step 2) keys on the
pointer's `sourceCommit` *membership* in the maximal set, **regardless of `sourceOperation`** — it is the commit
the working tree is synced to, and preferring the note you already hold is correct whether you `save`d or `load`ed
onto it; it can only ever pick an already-maximal member, so an op-agnostic read is safe. The **off-ancestry
fallback and corroboration** (D8, D2 step 5) instead key on `sourceOperation === "save"` — a genuine local write,
whose `sourceCommit` is HEAD-at-save-time, written atomically by `runUserSave` after `verifySavedNote` — because
materializing or corroborating "this machine's last *save*" is a stronger claim than "the ancestor a `load`
happened to land on." A stale or hand-edited record is the acknowledged risk, bounded by design: the pointer never
*selects* a note on its own — it only breaks a tie among already-maximal notes or corroborates an off-ancestry
surface — so a bad pointer degrades to "no tie-break / no corroboration," never to a fabricated or wrong `current`.

**Monotonic reads needs no separate mechanism, for a fixed HEAD.** As shown in D2, the reachable-maximal base
never selects a note that a later reachable save descends, so at a stable HEAD the reported "latest saved" cannot
regress below this machine's own reachable save. This holds even when an intervening `arc user load` re-points the
sync state to `op=load`: because the tie-break keys on `sourceCommit` *membership* (above), not operation, a
concurrent sibling with a smaller SHA cannot displace the note you are synced to. The draft's "monotonic-reads
floor" role is therefore *honored
as a guaranteed property of the selection rule* rather than a distinct flooring step — which also removes the
incoherent regime a literal floor would face (a pointer commit whose note has been superseded, where flooring
could only regress or fabricate). The guarantee does **not** extend across deliberate HEAD movement: if the
pointer's save becomes unreachable (`reset` / `rebase` / branch checkout) *and* an older save remains reachable,
the base legitimately resolves that older reachable note — the user moved HEAD, so this is correct re-anchoring,
not a silent regression. (A floor could not honestly prevent it either: it would have to fabricate a note on a
now-unreachable commit.) The unreachable-pointer regime only reaches the step-5 `outside-head-ancestry` surface
when *no* note is reachable at all.

### D7 — Concurrent-tie determinism without a pointer

When the causally-maximal set (D2) has more than one member — genuine concurrents, pairwise neither an ancestor of
the other (the merge case) — **and** no local pointer resolves them (D2 step 2 inapplicable: fresh clone / sibling
machine, or the pointer names none of the maximal notes), the deterministic fallback (D2 step 3) selects the
member with the lexicographically smallest annotated-commit SHA. This guarantees every machine resolves an
identical note; wall-clock ordering is never used. The SHA tie-break and the `git notes list` / `merge-base`
plumbing are themselves order-independent, so this is the only residual choice point and it is fully deterministic.

### D8 — Off-ancestry outcome: one result, callers project

The single-primitive guarantee (D3) is preserved by making the primitive return **one rich result** per call, not
different notes to different callers. When the reachable-maximal set is non-empty, the result carries that note
with `reachableFromHead: true`. When it is empty (HEAD divergent, or every note off HEAD ancestry), the fallback
is the **pointer's own `sourceCommit` note** (`sourceOperation === "save"`, per D6) when that commit still carries
a note — returned with `reachableFromHead: false`, and **with the per-WU filter (D4) still applied** so a filtered
load never crosses into another WU's note. This fallback is read-your-writes ("materialize *this machine's* last
save when none is reachable"), so it is deterministic and never reintroduces write-recency selection — honoring
D1 and D7. When there is *no* pointer **and** nothing reachable (a fresh clone / sibling machine sitting on a
branch none of the notes touch), there is no principled "latest saved" to name: the result is empty. This is a
deliberate behavior change from today's "materialize the recency-newest note regardless" — guessing an arbitrary
note there was never authoritative, and the normal cross-machine resume path (checkout the WU's branch, then
load) keeps the notes reachable, so it does not rely on the guess.

The primitive makes one selection; callers project it:

- **Status and freshness** read `reachableFromHead`. A `false` result is reported as `outside-head-ancestry` (the
  existing `UserSessionLocalNoteFreshnessState` surface) with the note's commit — never as `current` /
  `current-head`. An empty result reports `missing` (no reachable note, no local save to corroborate).
- **`arc user load`** materializes whatever the primitive's result carries, including a `reachableFromHead: false`
  pointer fallback, so single-machine cross-branch resume is not lost — labeled off-ancestry, never presented as
  current. But `runUserLoad` has a *second, independent* note source beyond the primitive: the cross-WU flat-file
  merge (`readRecentUserNotes` → `mergeCrossWuFile`, the recency-window merge that is a **Non-Goal** here). So an
  *empty primitive result does not mean load loads nothing* — load still materializes cross-WU shared context when
  recent notes exist (e.g. a brand-new WU loading shared context before its first per-WU note), and truly loads
  nothing only when *both* sources are empty. That second source also means the primitive's `sourceCommit`-basis
  change ripples into `runUserLoad`'s sync-state write — see D10.

No caller adds selection logic and none passes a mode flag; the divergence is pure *projection* of one resolved
result. **The `currentWuName` filter is the one intentional input difference**: status / freshness / disk resolve
whole-tree (no filter), while `runUserLoad` resolves per-WU — so for a state where the whole-tree latest note and
the active WU's latest note differ, they *correctly* name different commits. That is the same algorithm over a
different candidate set, not a single note projected two ways; the "same note" property holds *within a filter*.

### D9 — Consumer coherence (the observable fix)

With every surface reading the D1 note, the `note.commit !== localSyncState.sourceCommit` divergence branch in
`inspectDiskVsLocalSnapshot` stops tripping spuriously: after a save, the resolved note is on the pointer's commit
(or a legitimate descendant), so the branch that currently falls through to `diskStatus: "mixed"` / `direction:
"mixed"` is no longer reached by the wrong-note path. `savedCommit`, `diskStatus`, and `localNoteFreshness` all
report against the same commit, so a fresh save reads `current` on every surface.

### D10 — `runUserLoad` `sourceCommit` basis (secondary-source correctness)

`runUserLoad` records the loaded note's commit into `LocalSyncState.sourceCommit`. Today, when the primitive
resolves *no* per-WU note but the cross-WU merge still materializes shared context, it falls back to
`sourceCommit = recentNotes[0].historyCommit` — a *notes-ref history commit*, not a branch commit. That fake
commit later feeds `inspectDiskVsLocalSnapshot`'s `note.commit !== sourceCommit` branch and its
`isAncestor(sourceCommit, note.commit)` probe, which errors on a non-branch SHA → `false` → a spurious `mixed`
divergence. This WU's resolution change makes the primitive return *empty* in more cases (off-ancestry with no
`save` pointer now yields no note, where the old recency walk returned one), so it drives **more** traffic through
this latent path — a regression the WU causes, and must therefore own.

**Requirement:** `runUserLoad` must never write a notes-ref history commit as `sourceCommit`. When no per-WU note
resolves, the recorded basis is the primitive's off-ancestry fallback commit (D8) when present; for a genuine
cross-WU-only load (a brand-new WU loading shared context before its first per-WU note, no `save` pointer), record
the defined sentinel `inspectDiskVsLocalSnapshot` treats as "no comparable saved commit" — never current HEAD and
never a history commit. The cross-WU *merge* itself stays a Non-Goal; only the `sourceCommit`-basis correctness is
in scope, because the WU's own change worsens the defect.

## Alternatives & Rationale

**Why anchor to ancestry rather than write-recency (the resolution base).**

- **Local pointer as global authority.** Precise for "this machine," but per-client and *absent on a fresh clone
  or sibling machine* — it cannot be the base, since a portable read must work with no local state. Rejected as
  the base; retained in its three refinement roles (D1).
- **Newest-by-write-recency (status quo).** Portable, but orders by *when written*, which is the bug: decoupled
  from ancestry and vulnerable to a later note landing on an unrelated or older commit. Notes-backed tooling
  (`git-appraise`) specifically does *not* use write-order to choose *across* commits — it uses a
  timestamp/last-writer-wins tie-break only *within a single commit's note*. Rejected.
- **Ancestry-nearest reachable-from-HEAD (chosen).** Portable *and* history-meaningful. In distributed-systems
  terms git ancestry *is* a happens-before relation, so an ancestry base gives deterministic, portable ordering
  for causally related notes and correctly flags true siblings as *concurrent* (needing a tie-break) rather than
  mis-ranking them by an unreliable wall clock. Degrades cleanly with no local state (D2 step 4).

**Why split the disagreement case on causal relationship (saved X, then descendant Y pulled).**

- **Pointer authority (take X).** Over-applies RYW: it pins "latest saved" to this machine's write even after the
  user's own notes legitimately advanced to a *descendant* Y. Regresses against linear progress. Rejected as the
  default.
- **Ancestry authority (take Y) — chosen for the *ordered* case.** Y descends X, so Y is causally later: linear
  progress, not a conflict. Take Y; RYW is not violated because the state advanced *past* X.
- **Hybrid (ancestry base, pointer refines) — chosen overall.** The pointer decides only among *true concurrents*
  (D2 step 2) and corroborates the off-ancestry surface (D2 step 5); monotonic reads falls out of the ancestry
  rule itself rather than a separate floor (D6). Splitting on the causal relationship — ordered vs. concurrent —
  is what dissolves the apparent X-vs-Y dilemma.

**Research basis.** google/git-appraise (commit-anchored resolution; within-commit timestamp tie-break); Terry et
al., "Session Guarantees for Weakly Consistent Replicated Data" (read-your-writes, monotonic reads); LWW
clock-skew and lost-update failure modes (secondary). The algorithm is *composed* from these —
"causally-maximal-reachable, pointer-refined" is this project's synthesis, not a documented notes-resolution rule
— which is why the edge behaviors below are validated as an explicit matrix, not just the happy path.

## Cross-cutting Considerations

- **Testing.** The edge-case matrix (below, under Success Criteria) is the primary test surface — each row is a
  deterministic scenario over a constructed notes ref + pointer state. Unit tests cover the pure selection logic
  (reachable-maximal reduction, concurrent tie-break, no-pointer SHA determinism, monotonic reads at fixed HEAD,
  and correct re-anchoring after a HEAD reset); integration/E2E tests cover the save→pull→status /
  save→re-anchor→status reproductions end-to-end against a real temporary git repo. The merge/concurrent and
  no-pointer cases, a reachable-but-far note (D5 no-distance-cap), and the cross-WU-only load whose `sourceCommit`
  must not become a history commit (D10 — assert a follow-up `status` reads no spurious `mixed`), are the
  highest-value new coverage. Existing
  write-recency unit tests are expected to *invert* (e.g. assertions that the walk does not call `rev-list HEAD`).
  For the per-WU cross-branch resume tests, distinguish two assertion kinds: a **resolution** assertion (which
  `.commit` is returned) must stay green — a red there is a real regression (D4/D8); a **provenance-field**
  assertion (e.g. `noteHistoryDistance`, which the enumerate design no longer computes on the reachable path) may
  legitimately change with that field's disposition (Open Questions), and is a test-only update, not a regression.
- **Performance.** Resolution enumerates the annotated set (one `git notes list`) and does O(note-count)
  `merge-base --is-ancestor` tests to filter-and-reduce (D5). This trades the old per-note content reads for one
  ancestry test per note; the reachable subset that needs a content read (per-WU filter) is small. Cost scales
  with the *ref size*, not HEAD-ancestry distance — the axis that actually grows — and it removes the note-count
  walk cap as a latent correctness cliff. If ref growth ever makes the O(note-count) ancestry pass a real cost,
  the retention/compaction concern (a Non-Goal here) is the place that addresses it.
- **Migration / rollout.** No data migration: the notes ref, the sync-state schema, and note content are
  unchanged — only *selection* changes. Status/freshness behavior changes only in currently-*wrong* cases, and
  specifically **not** where the naive rewrite would have regressed: a reachable note far behind HEAD is still
  found (no distance cap, D5), and an off-ancestry note *this machine saved* still surfaces its commit as
  `outside-head-ancestry` via the pointer fallback (D8). There is **one deliberate behavior change, scoped to
  *status / freshness*:** on a fresh clone / sibling machine with no `save` pointer and no HEAD-reachable note, the
  primitive returns empty, so status / freshness report `missing` rather than a recency-guessed note — removing the
  last write-recency guess from the latest-saved verdict. `arc user load` is **not** part of this change: its
  cross-WU flat-file merge (a Non-Goal) still materializes shared context from recent notes when present; only the
  `sourceCommit` it records is corrected off the notes-ref-history-commit fallback to a valid basis (D10). No
  config flag; the corrected behavior is unconditional.
- **User-facing impact.** `arc user status`, `arc user load`, and session-init orientation stop reporting a
  freshly-saved note as stale / drifted / behind. The `outside-head-ancestry` surface (D8) is unchanged in shape;
  cross-branch `arc user load` continues to work.

## Success Criteria

Validated at work-unit completion:

1. **Edge-case matrix passes** — each row resolves as specified, by test:

    | Situation                                               | Correct resolution                                                 |
    |---------------------------------------------------------|--------------------------------------------------------------------|
    | Single reachable note (or a linear chain of them)       | the causally-latest — the sole reachable-maximal note              |
    | Saved X, then descendant Y pulled                       | **Y** — Y descends X, so Y is the sole maximal; linear progress    |
    | Concurrent sibling notes (X ∥ Y), local pointer present | pointer tie-break among the maximal set (own save); never clock    |
    | Concurrent sibling notes (X ∥ Y), no local pointer      | smallest-SHA tie-break; identical on every machine                 |
    | Note re-anchored to an older commit after a newer save  | the descendant save is the sole maximal note → wins; no regression |
    | Reachable note far behind HEAD (no near-HEAD note)      | still found — no distance cap; cost scales with ref, not distance  |
    | Fresh clone / sibling machine, no local pointer         | reachable-maximal base + SHA tie-break (portable, pointer-free)    |
    | Off-ancestry, pointer present (this machine saved)      | `outside-head-ancestry` with the pointer's commit (RYW fallback)   |
    | Off-ancestry, no pointer + nothing reachable            | `missing` — no reachable note, no local save; no recency guess     |

    The matrix describes the **resolution primitive** and its status / freshness projection. `arc user load`'s
    second source — the cross-WU flat-file merge (a Non-Goal) — and its `sourceCommit` basis are governed by D8 and
    D10, not by these rows; an "empty" primitive result does not mean load materializes nothing.

2. **Surfaces agree by construction** — for a freshly saved note, `savedCommit`, `diskStatus`, and
   `localNoteFreshness` all report against the same commit and read `current`; the reproduction (save on C, land a
   later note on older A, run status) no longer reports `mixed` / stale / behind.

3. **Single primitive** — resolution is realized in one changed primitive (`findNearestUserNote`); every consumer
   inherits it with no per-surface selection logic added.

4. **No distance cap regression** — resolution finds any HEAD-reachable note regardless of how far behind HEAD it
   sits (cost scales with ref size, not ancestry distance); a reachable note that a distance-capped walk would
   miss is still resolved.

5. **Load parity** — `arc user load` (including the per-WU-filtered path) materializes the causally-latest
   reachable matching note, or the deterministic pointer-backed off-ancestry fallback (per-WU filter preserved),
   with no regression to single-machine cross-branch resume. When the primitive resolves no per-WU note, load still
   materializes cross-WU shared context if recent notes exist (unchanged). The one intentional *status/freshness*
   change — no-`save`-pointer + nothing reachable reports `missing` rather than a recency guess (Migration) — is
   asserted, not treated as a regression.

6. **`sourceCommit` basis is never a history commit (D10)** — after any `arc user load` that resolves no per-WU
   note (e.g. a cross-WU-only load), `LocalSyncState.sourceCommit` records the defined sentinel, and a subsequent
   `arc user status` on that state does **not** report a spurious `mixed` divergence.

7. **Quality gates green** — type-check, lint, full test suite, and build pass.

## Open Questions

Genuine implementation-latitude items, resolved during the work (no settle-able design deferred here):

- **`noteHistoryDistance` disposition** — retain as diagnostic provenance on `NearestUserNoteRef` or drop it, per
  whether any surface reads it substantively once selection no longer orders by it (D3). Mechanical either way.
- **`ancestorDistance` derivation** — the field is still reported for display (`countCommitsSince`), but it is no
  longer a *selection* input (D2 selects by the ancestry relation, not the count). Whether to keep computing it
  eagerly or lazily for the resolved note is an implementation choice; it does not affect which note is selected.
- **Retirement of the walk cap / `UserLoadWalkExhausted`** — whether to delete the now-unused note-count walk cap
  and its exhausted outcome outright, or keep a defensive guard, is an implementation cleanup (D5). No behavior
  depends on it once selection enumerates the annotated set.
