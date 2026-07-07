# Draft: user-notes-retention

- **Origin:** [internal] — `USER-INBOX § Work Unit`, housekeep drain (2026-07-01); captured during
  `user-save-status-divergence` draft-design. Rescoped 2026-07-07 at WU start: a full audit of the user-notes /
  user-workspace subsystem (three-track — architecture/assumptions, concurrency/correctness, performance/quality)
  broadened the WU from "retention policy" to **coherence + retention** — make the notes system solid under
  parallelism once, rather than continuing per-symptom patches. The 2026-07-07 audit findings below are this
  draft's evidence base; the two inbound-buffer captures from the 2026-07-07 housekeep drain (paired-push
  ref-coherence remainder; legacy root-note framing) are integrated into the body.
- **Purpose:** Make the user-notes system (`refs/notes/arc/user/{identity}` + the `.arc/user/{identity}/`
  workspace it materializes) **correct under concurrent writers** (same-machine worktrees + cross-machine sync)
  and **bounded in growth** — a written concurrency model with enforced invariants, the export-coherence fixes
  that stop the live divergence/bloat, and a retention/compaction policy for the accumulated history.

---

## Continuity (draft-design loop state)

- **Readiness:** maturing — scope and phase structure settled; open items are detail-design (§ Open).
- **Resolved this pass (2026-07-07):** bloat root cause (identical-blob re-adds, verified by probe); the
  critical tombstone mis-synthesis chain (verified in source); phase structure A/B/C; route-outs (§ Routed out);
  Class `Heavy`; single-WU shape (cohort-fit re-check deferred until the design stabilizes).
- **Next:** settle § Open items 1–3 (save-path guard shape, lock-vs-CAS assignment per mutator, compaction
  mechanism), then re-run `assess-draft-readiness`.

## Problem / Motivation

The subsystem was designed for one checkout per machine and occasional sequential two-machine sync — and worked
cleanly in that regime. Worktree parallelism multiplied writers without a re-audit of the single-writer
assumptions, producing a train of piecemeal fixes (#200 note mis-resolution, #203 fetch-refspec clobber, #206
partial local-ref fast-forward) while the underlying assumption gaps stayed open. Two problem families:

1. **Coherence under multiple writers.** The shared canonical ref, the shared identity-global disk files
   (primary-worktree singleton), and per-worktree bookkeeping (`.sync-state.json`, partial-push markers) are
   mutated by N worktrees × M machines, but the write discipline assumes one writer: the advisory lock covers
   one of ~five ref mutators, CAS protects only the newest tier, and deletion intent is *inferred* by diffing
   disk state against ref history.
2. **Unbounded growth.** ~905 notes / ~11.7k remote ref-history commits on a solo repo, growing ~+886 commits
   per primary sync (the export re-commits every unchanged note), with 427 pre-migration root-`SESSION-NOTES`
   notes that are both dead weight and proven bug fodder (the #200 mis-resolution fed on them — retention of
   legacy history is correctness-relevant cruft, not just storage weight).

### Root-cause assumption inventory (2026-07-07 audit)

- **State-diff as event inference** — `arc user save` synthesizes `## Removed:` tombstones by diffing disk
  against the recent-note window (`save-load.ts:530`, `merge.ts:321`). Sound only under "one writer who always
  loads before saving." Both halves are now false: `reconcileAndRepush` (`push-fetch.ts:246`) merges other
  writers' notes into the ref **without materializing disk**, and siblings share the identity-global files.
  This is the deepest defect family; its durable fix (deletion as an explicit record event) belongs to
  `user-surface-records` — this WU ships the interim invariant (§ Phase B).
- **One writer per identity ref** — only `runUserSave` takes the notes lock; `git notes merge`, the
  corrupt-merge rollback, force fetch, and the branch-bounded plan→push all mutate the same shared ref unlocked.
- **Count-based recency ≈ time-based recency** — the 10-note cross-WU window (`notes-ref.ts:26`) and the 7-day
  tombstone TTL (`merge.ts:344`) assume sequential save cadence; parallel saves shrink the window's wall-clock
  span (entries fall out early) and sparse saves outlive the TTL (deletions resurrect).
- **Per-worktree bookkeeping describes a private ref** — `.sync-state.json` / partial-push markers key on the
  shared ref's hash, so sibling saves invalidate other worktrees' recovery state.
- **One session per machine** — marker provenance is machine-scoped (`machineId`), indistinguishable across
  worktrees.

## Concern inventory (audit findings this WU owns)

Severity-ranked; all verified against source 2026-07-07.

**Critical**

- **C1 — Tombstone mis-synthesis after ref-only reconcile (silent propagated data loss).** M2 pushes entry E →
  M1's non-FF push reconciles E into the local ref (disk untouched) → M1's next save reads E's disk-absence as a
  deletion and tombstones it → E suppressed everywhere for 7 days. `arc user status` steers into it: the
  post-reconcile state classifies `"local unsaved"` and recommends the destructive save
  (`sync-status.ts:1602-1609`). Amplifier: identity-global files are written with plain `fs.writeFile`
  (no atomic write, no lock — `io-context.ts`; serialize runs before the lock, `save-load.ts:112`), so a torn
  read during a concurrent sibling load converts into the same propagated deletion. Interim behavioral guard
  captured in WORKING-MEMORY 2026-07-07.

**High**

- **C2 — Blind rollback discards concurrent saves.** The corrupt-merge arm rolls back via
  `update-ref <ref> <preMergeTip>` with no expected-old-value (`push-fetch.ts:271-273`); a sibling's
  lock-guarded, verified save landing mid-reconcile is erased from the ref while its sync-state still points at
  it. Adjacent: concurrent reconciles fight over shared `NOTES_MERGE_*` state — the second's `merge --abort`
  tears down the first's in-progress merge.
- **C3 — Fast-path paired push ships the ref by name, not the pinned tip**
  (`branch-bounded-notes-export.ts:209` with `ref === destinationRef`): a sibling save landing in the
  marker-publish/retry window exports notes for unpushed commits — the leak branch-bounding exists to prevent.
- **C4 — Stale-lock break race** (`notes-lock.ts:184-206`): two contenders judge a dead holder breakable; the
  slower unlink deletes the faster's freshly-won live lock → two "holders," restoring the lost-update race.
- **C5 — Export re-diverge + bloat (integrated buffer capture).** Two independent fixes:
    - **(a) adopt-if-superset** — #206's `omittedCommits > 0 → skip` guard
      (`branch-bounded-notes-export.ts:250`) declines the adopt on the primary's steady case (`omitted = 19`);
      adopt when the pushed tip contains every local `(blob,commit)` pair, union-merge only on a genuine subset.
    - **(b) skip-identical-blobs** — the overlay loop (`branch-bounded-notes-export.ts:156-168`) re-adds every
      branch-reachable note even when origin holds the identical blob (`remoteBlob === entry.blob` is checked
      only for refusal, never as a skip), and git mints a fresh commit per identical re-add (probe-verified
      2026-07-07). This — not missing compaction — is the +886/sync growth driver; a skip guard collapses
      steady-state syncs to ~zero new commits.
- **C6 — `arc user fetch`/`pull` force-resets the shared ref whenever any local note exists**
  (`handlers/user.ts:475-481`) — including local-*ahead*, discarding siblings' unpushed saves; the
  inspect→fetch gap is a TOCTOU even on the "safe" direction.

**Medium**

- **C7 — TTL/window mismatch resurrects deletions**: tombstone TTL is time-based, the merge window count-based;
  <10 saves in 7 days → expired tombstones stop suppressing while pre-deletion notes are still in-window.
  Reconcile merge commits also consume window slots with zero note paths, silently shrinking it.
- **C8 — Shared identity-scoped temp refs collide** (`refs/arc-sync-temp/{identity}`,
  `…__incoming`): concurrent probes delete each other's refs mid-comparison → false `remote-unavailable`
  verdicts. The per-call `uniqueRefToken()` fix already exists in `sync-state-merge.ts:140-145` and was never
  propagated.
- **C9 — Second non-FF during reconcile re-push escapes as a raw throw** (`push-fetch.ts:284`): no typed
  outcome, no JSON envelope, `__incoming` leaked. Sibling of the shipped success-verdict gap; both fold into the
  **sync verdict-coherence guard** (integrated buffer item (c)): `arc sync` must never report success while
  status reports diverged — regression-tested.
- **C10 — Marker keying + unguarded sync-state RMW**: sibling saves silently clear other worktrees' partial-push
  markers (`sync-status.ts:458` — a status *read* mutates state); `.sync-state.json` read-modify-write has no
  version check, so concurrent processes drop markers. Includes the two self-clearing mislabels from the
  dissolved `notes-sync-ref-coherence` capture (same-host divergence labeled `cross-machine`; own-host marker
  framed as a sibling's) — verify both clear once C5 lands, else file a diagnostic follow-up.
- **C11 — Cross-worktree status conflation**: `materializedManifestHash` conflates "my worktree's state" with
  the shared identity-global store (spurious `local unsaved`/`mixed` verdicts); `local-ahead`/`diverged`
  surfaced to worktree A for notes B authored; retired-subdir reconcile trusts "shipped on origin" while a
  sibling may still work the WU.

**Low**

- **C12** — fail-open corrupt-note scan (`push-fetch.ts:328-334`: unreadable note treated as valid); "partial
  publish recorded" printed when the marker write returned `false`; HEAD resolved before the lock (note can
  anchor to a stale commit); `verifySavedNote` runs after lock release (verdict incoherence under concurrent ref
  mutation).

## Design (phased)

Order the phases so growth stops before history is compacted and invariants exist before they're relied on.

### Phase A — stop the bleeding (small, ships first)

C5(a) adopt-if-superset + C5(b) skip-identical-blobs + C3 pin pushes to `target.tip:destinationRef` + the C9
verdict-coherence guard. Exit criteria: a live primary `arc sync` converges — `arc user status` reports current
(not diverged) afterward, and the remote ref gains ~zero commits on a steady-state sync. Lifts the standing
"avoid unnecessary primary syncs" directive and the WORKING-MEMORY coherence-gap entry's trigger.

### Phase B — invariant sweep (the body)

One written concurrency model for the subsystem, then enforce it:

- **Every mutation of shared state is either lock-held or CAS-guarded** (storage-evolution Principle 3 — the
  native git form: `update-ref <ref> <new> <expected-old>`). Closes C2 (rollback), C4 (lock break via
  re-verify-before-unlink or rename-based break), C6 (ancestry guard on fetch/pull), C10 (versioned sync-state
  writes).
- **Save-path guard (C1):** save refuses (or loads first) when the recent-note window carries entries disk never
  materialized — kill mis-synthesis at the source; correct the `"local unsaved"` post-reconcile recommendation.
  Atomic writes (temp+rename) + lock coverage for identity-global disk materialization.
- **Window/TTL alignment (C7):** the cross-WU window becomes time+count bounded so the tombstone TTL dominates
  it; merge commits stop consuming slots.
- **Unique temp refs (C8):** propagate `uniqueRefToken()` to `__incoming` and `arc-sync-temp`.
- **Marker keying (C10/C11):** partial-push recovery state keyed so sibling saves don't invalidate it;
  worktree-scoped provenance; status reads stop mutating state.
- **Concurrency regression tests:** interleaving tests for the C1/C2/C3 scenarios (the audit's concrete
  reproductions), plus the C9 verdict-coherence test.

### Phase C — retention/compaction (the original scope)

Designed against the **cross-machine rewrite-safety constraint first**: pruning/squashing rewrites a ref
siblings pull, so it must not drop un-synced sibling notes nor break the partial-push/coherence machinery
(Phase B's invariants are the substrate this leans on). Then the mechanism: prune the 427 pre-migration
root-`SESSION-NOTES` notes and retired-WU accumulation; compact the ~11.7k-commit remote history (the C5
re-rewrite sediment); define the steady-state retention window (full per-save history vs. compaction is an open
backing-store policy call — see § Forward-compat).

Team framing (from the original draft, unchanged): refs are per-identity, so team size multiplies ref *count*,
not any single ref's size — the sharp axis is per-identity accumulation (long-lived heavy user × parallelism).

## Routed out (2026-07-07 captures, drain at housekeep)

- **Performance + module decomposition** → `user-sync-module-split`: N+1 note reads (~1,830 spawns per status
  probe), double resolution, unbounded `Promise.all`, Windows argv overflow, `cat-file --batch` reader,
  sync-status/save-load cut-lines, git-primitive consolidation, spawn-count regression test. Phase B touches
  these files but does not restructure them; sequencing note — if that WU lands first, Phase B rides its module
  seams, else the capture carries the audit's cut-map.
- **Decision-engine unification + handler split** → `sync-handler-decomposition`.
- **Record-model root fix** (deletion as explicit event; entry identity; tombstones as record fields) →
  `operational-state-docs` / its `user-surface-records` member (already scoped there; capture adds the audit's
  confirming evidence and the reconcile-without-materialize hole to verify against).
- **Not routed:** `sync-primitive-discipline` stays adjacent (which-primitive prose contract); coordinate, don't
  fold — this WU's C9 guard is implementation coherence, not primitive selection.

## Forward-compat self-check (strategy-storage-evolution)

- **Principle 3 (version-checked writes)** is Phase B's spine — the interim work *implements* the target
  discipline rather than diverging from it.
- **Records lift (Principle 2):** the save-path guard and window fixes harden the markdown-canonical interim
  without adding schema; nothing here deepens the state-diff inference model the record layer replaces.
- **Notes-history policy:** strategy-storage-evolution § Holistic Design already flags the compaction question
  as an open backing-store policy call. Phase C decides it for the in-repo tier; record the decision there so
  the backing-store tier inherits a reasoned default (retention window as policy, not accident). No
  "tracked-in-code-repo" assumption: all mechanisms operate on the notes ref wherever it lives.
- **Team/multi-writer (Principle 7):** the concurrency model treats same-machine worktrees and cross-machine
  siblings as the same multi-writer problem — no new team-mode axis.

## Open (detail-design)

1. **Save-path guard shape (C1):** refuse-and-instruct vs. auto-load-then-save vs. synthesize-only-against-
   materialized-baseline (stamp the window tip the disk last materialized; synthesize only against that).
   Leaning: materialized-baseline stamp — it removes the inference gap without adding an interactive step.
2. **Lock-vs-CAS assignment per mutator:** which of the five ref mutators serialize under the advisory lock vs.
   carry CAS; the reconcile merge likely needs the lock (git's notes-merge state is inherently exclusive).
3. **Compaction mechanism (Phase C):** squash-to-snapshot + graft vs. rewrite-and-force-push with sibling
   handshake vs. periodic re-root. Constraint: `arc user load`'s ancestor walk and the partial-push machinery
   must survive it. Not yet explored — next pass.
4. **Scale-test harness:** does Phase B's interleaving suite need a few-hundred-note fixture here, or does the
   spawn-count harness routed to `user-sync-module-split` cover it? Decide at spec.

## Scope Estimate

Large — three phases, each independently shippable (A is days-scale; B is the body; C is a bounded design +
mechanism). Was Medium–Large as retention-only; the coherence scope is the growth, accepted deliberately at the
2026-07-07 rescope (the audit showed retention-without-coherence patches symptoms). If Large proves heavy in
practice, Phase C is the natural split-out (retention lands after coherence anyway).
