# Draft: user-save-status-divergence

- **Origin:** [internal]
- **Purpose:** `arc user save` can report success while `arc user status` and session-init's freshness surface
  simultaneously report the save as stale, on the wrong commit, and the disk as drifted. The cause is that "the
  latest saved note" is resolved by *notes-ref write recency* instead of by the saved commit's place in history.
  This draft settles a single, portable definition of "the latest saved note" — grounded in established
  git-notes and distributed-systems practice — that every read surface shares.

---

## Problem / Motivation

Three surfaces answer "what did the user last save, and is it current?" — `arc user status` (`savedCommit`,
`diskStatus`), and session-init's `localNoteFreshness`. All three resolve the note through one primitive,
`findNearestUserNote`, which defines *nearest* as **the first note in the newest notes-ref history commit** —
i.e. it orders by *when a note was written to the ref*, then by tree-path sort within that commit.

That selector is decoupled from two things that actually matter: the commit *this machine* last saved to (the
local sync-state `sourceCommit` pointer), and the saved commit's *ancestry* relative to HEAD. The moment any
notes operation writes or merges a note onto a different commit after a save — most commonly an `arc user pull`
bringing in a sibling machine's tip note, or a note re-anchored onto an older commit later in wall-clock time —
the walk follows ref-history recency to the *wrong* note. Then:

- `savedCommit` reports that wrong note's commit (`sync-status.ts` reads `note.commit`);
- `diskStatus` reports `mixed`, because the resolved `note.commit` no longer equals the sync-state `sourceCommit`
  (`inspectDiskVsLocalSnapshot`, the `note.commit !== localSyncState.sourceCommit` branch);
- session-init freshness reports the note behind HEAD.

Reproduced deterministically: save a note on commit C, then let any later note land on an older commit A — the
walk returns A. It surfaces as a correctness bug in a status/handoff surface agents rely on, so a wrong answer
misdirects session decisions. It became design-worthy (not a quick errand) because the fix requires *defining*
which notion of "the latest saved note" is authoritative, and how the surfaces reconcile — a decision with
cross-machine weight, since the pointer is per-machine and absent on a fresh clone.

## Design — Resolution model

**Definition.** "The latest saved note" is **the note on the nearest ancestor of HEAD**, with the local pointer
serving as a *corroborator*, *concurrent-sibling tie-breaker*, and *monotonic-reads floor* — never as the global
authority. Write-recency in the notes ref is dropped as a selection criterion entirely.

**Why this shape (established practice).** Notes-backed tooling anchors "the current note" to a commit's
*semantic role*, not to ref-log write order; `git-appraise` uses timestamp/last-writer-wins *only within a single
commit's note* as a same-target tie-break, never to choose across commits. In distributed-systems terms git
ancestry *is* a happens-before relation, so an ancestry base gives deterministic, portable ordering for causally
related notes and correctly flags true siblings as *concurrent* (needing a tie-break) rather than mis-ranking
them by an unreliable wall clock. The local pointer is a read-your-writes (RYW) session guarantee: precise for
"what this machine saved," but per-client and structurally absent elsewhere. Monotonic reads — a session must
never see "latest saved" move backward — is the property the pointer-as-floor preserves.

**Resolution algorithm.**

1. **Ancestry-nearest base.** Among notes whose annotated commit is an ancestor of HEAD (reachable), select the
   one with the minimum ancestor-distance. Deterministic, portable, independent of ref-history write order and
   wall-clock.
2. **Concurrent tie-break (RYW).** When the nearest candidates are genuinely concurrent — neither annotated
   commit is an ancestor of the other (e.g. across a merge, or the pointer's commit versus a pulled sibling note)
   — prefer the note on the local pointer's `sourceCommit`. Never rank concurrents by timestamp.
3. **Monotonic-reads floor.** Never resolve to a note strictly older than the pointer's `sourceCommit` when that
   pointer records a save this machine made: a note re-anchored onto an older commit must not regress the
   reported "latest saved."
4. **Portable fallback.** No local pointer (fresh clone / sibling machine) → step 1 alone stands.
5. **No reachable note.** HEAD divergent, or every note outside HEAD ancestry → report `outside-ancestry` (the
   existing `reachableFromHead: false` surface); corroborate with the pointer only if it names a known commit.
   Never fabricate a `current` verdict.

**Consumer effect.** All three surfaces read the same resolved note, so they agree by construction. In
particular the `note.commit !== sourceCommit` divergence branch stops tripping spuriously: after a save, the
resolved note is on the pointer's commit (or a legitimate descendant), not an arbitrary ref-history-newest note.

## Alternatives

**Resolution base:**

- **Local pointer as global authority.** Precise for "this machine," but per-client and *absent on a fresh clone
  or sibling machine* — cannot be the base, since a portable read must work with no local state. Rejected as the
  base; retained in its three refinement roles.
- **Newest-by-write-recency (status quo).** Portable, but orders by *when written*, which is the current bug:
  decoupled from ancestry, vulnerable to a later note landing on an unrelated/older commit. This is the selector
  established notes tooling specifically does *not* use across commits. Rejected.
- **Ancestry-nearest reachable-from-HEAD (chosen).** Portable *and* history-meaningful; deterministic for
  causally related notes; degrades cleanly with no local state.

**Precedence for the disagreement case (saved X, then descendant Y pulled):**

- **Pointer authority (take X).** Over-applies RYW: it would pin "latest saved" to this machine's write even
  after the user's own notes legitimately advanced to a *descendant* Y. Regresses against linear progress.
  Rejected as the default.
- **Ancestry authority (take Y) — chosen for the *ordered* case.** Y descends X, so Y is causally later; this is
  linear progress, not a conflict. Take Y. RYW isn't violated because the state advanced past X.
- **Hybrid (ancestry base, pointer refines) — chosen overall.** The pointer decides only among *true
  concurrents* and as the monotonic floor. Splitting on the causal relationship (ordered vs concurrent) is what
  dissolves the apparent X-vs-Y dilemma.

## Edge-case behaviors

| Situation                                              | Correct resolution                                                 |
|--------------------------------------------------------|--------------------------------------------------------------------|
| Note on nearest ancestor of HEAD                       | that note (ancestry-nearest)                                       |
| Saved X, then descendant Y pulled                      | **Y** — causally later, linear progress                            |
| Concurrent sibling notes (X ∥ Y, neither an ancestor)  | local-pointer tie-break (prefer own save); never clock-rank        |
| Note re-anchored to an older commit after a newer save | don't regress; pointer floors the reported "latest saved"          |
| Fresh clone / sibling machine, no local pointer        | pure ancestry-nearest (portable base stands alone)                 |
| HEAD divergent / no note in HEAD ancestry              | report `outside-ancestry`; pointer only if it names a known commit |

## Unknowns and Assumptions

- **The algorithm is composed, not directly cited.** Research strongly supports the *direction* (git-appraise's
  commit-anchoring + session-guarantee theory), but "ancestry-nearest reachable-from-HEAD, pointer-refined" is
  our synthesis, not a documented notes-resolution rule. The edge behaviors where *no* note is a HEAD ancestor
  are inferred. Validate the rule against the edge-case table during spec, not just the happy path.
- **Load-path interaction — decided: fix the shared primitive once (option A).** `findNearestUserNote` is also
  consumed by `arc user load` with a per-WU filter (skip notes not carrying the current WU's subdir). We redefine
  *nearest* in the one primitive so status, freshness, *and* load all read the corrected note — loading the
  ancestry-nearest note is more correct than loading the ref-history-newest one. **Residual (spec-time):** verify
  load's per-WU filter still composes with ancestry-nearest selection, and that no caller depended on the old
  write-recency behavior.
- **Pointer trust boundary.** The monotonic floor assumes the pointer's `sourceCommit` records a genuine
  local save. Confirm the sync-state record is reliable enough to floor against (it is written by save/load;
  stale or hand-edited state is the risk).
- **Cost & accumulation (turn it into a win).** The notes ref grows monotonically — one commit per save, no
  compaction anywhere (~961 ref-history commits today, and parallelism will raise save frequency). The *current*
  walk is O(ref-history), capped at `DEFAULT_MAX_ANCESTOR_WALK` (1000) — a latent correctness cliff we're already
  near: a relevant note older than the cap is silently missed. The ancestry-nearest rule should be implemented as
  a **walk of HEAD's ancestry, first commit carrying a note wins** — O(distance-to-nearest-note), independent of
  total note count, and it sidesteps the 1000-cap entirely. So done right, this fix is *cheaper and more robust*
  than the status quo as the ref grows, not costlier. (The broader unbounded-growth / retention story is a
  separate concern — see Scope.)
- **Cross-machine north star.** Sanity-check against the backing-store direction (`strategy-storage-evolution`,
  `draft-arc-backend`) so the pointer's role doesn't bake in a "tracked in the code repo" assumption that the
  eventual substrate would break.

## Scope Estimate

**Medium** (days). Bounded to the user-notes resolution surface — `save-load.ts` (`findNearestUserNote`),
`sync-status.ts` (`inspectDiskVsLocalSnapshot`, freshness, `savedCommit`), `notes-ref.ts`, `sync-state.ts`,
`drift.ts`. One subsystem, already mapped.

**Out of scope:** the partial-push / coherence-marker machinery; any broader user-sync redesign; and the
**notes-ref retention / compaction** story (unbounded monotonic growth, no pruning of shipped-WU notes, no
ref-history squash) — a separate spec-worthy concern surfaced here, to be captured on its own. This WU only
ensures its *own* read cost degrades gracefully as the ref grows (the HEAD-ancestry walk above).

**Dependencies:** none blocking. Related-but-separate: `errand-promote-hardening` (unrelated promote-path gap,
surfaced while creating this WU) and `user-sync-module-split` (would reshape these files — sequence to avoid
churn if both land near each other).

**Research basis:** google/git-appraise (commit-anchored resolution; within-commit timestamp tie-break);
Terry et al., "Session Guarantees for Weakly Consistent Replicated Data" (RYW, monotonic reads); LWW clock-skew
and lost-update failure modes (secondary sources). Full report retained with the session.
