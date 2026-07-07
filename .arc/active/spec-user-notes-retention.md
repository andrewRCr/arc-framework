# Spec (`detailed` · `RFC`): user-notes-retention

- **Origin:** [internal]

- **Purpose:** Make the user-notes system (`refs/notes/arc/user/{identity}` + the `.arc/user/{identity}/`
  workspace it materializes) correct under concurrent writers (same-machine worktrees + cross-machine sync) and
  bounded in growth — a written concurrency model with enforced invariants, the export-coherence fixes that stop
  the live divergence/bloat, and a retention/compaction policy for the accumulated history.

---

## Introduction / Context

The subsystem was designed for one checkout per machine and occasional sequential two-machine sync — and worked
cleanly in that regime. Worktree parallelism multiplied writers without a re-audit of the single-writer
assumptions, producing a train of piecemeal fixes (#200 note mis-resolution, #203 fetch-refspec clobber, #206
partial local-ref fast-forward) while the underlying assumption gaps stayed open. Two problem families:

1. **Coherence under multiple writers.** The shared canonical ref, the shared identity-global disk files
   (primary-worktree singleton), and per-worktree bookkeeping (`.sync-state.json`, partial-push markers) are
   mutated by N worktrees × M machines, but the write discipline assumes one writer: the advisory lock covers one
   of ~five ref mutators, CAS protects only the newest tier, and deletion intent is *inferred* by diffing disk
   state against ref history.
2. **Unbounded growth.** ~905 notes / ~11.7k remote ref-history commits on a solo repo, growing ~+886 commits per
   primary sync (the export re-commits every unchanged note), with 427 pre-migration root-`SESSION-NOTES` notes
   that are both dead weight and proven bug fodder (the #200 mis-resolution fed on them — retention of legacy
   history is correctness-relevant cruft, not just storage weight).

### Root-cause assumption inventory (2026-07-07 audit)

- **State-diff as event inference** — `arc user save` synthesizes `## Removed:` tombstones by diffing disk
  against the recent-note window (`save-load.ts:530`, `merge.ts:321`). Sound only under "one writer who always
  loads before saving." Both halves are now false: `reconcileAndRepush` (`push-fetch.ts:246`) merges other
  writers' notes into the ref **without materializing disk**, and siblings share the identity-global files. The
  durable fix (deletion as an explicit record event) belongs to `user-surface-records`; this WU ships the interim
  invariant (Phase B).
- **One writer per identity ref** — only `runUserSave` takes the notes lock; `git notes merge`, the corrupt-merge
  rollback, force fetch, and the branch-bounded plan→push all mutate the same shared ref unlocked.
- **Count-based recency ≈ time-based recency** — the 10-note cross-WU window (`notes-ref.ts:26`) and the 7-day
  tombstone TTL (`merge.ts:344`) assume sequential save cadence; parallel saves shrink the window's wall-clock
  span (entries fall out early) and sparse saves outlive the TTL (deletions resurrect).
- **Per-worktree bookkeeping describes a private ref** — `.sync-state.json` / partial-push markers key on the
  shared ref's hash, so sibling saves invalidate other worktrees' recovery state.
- **One session per machine** — marker provenance is machine-scoped (`machineId`), indistinguishable across
  worktrees.

### Concern inventory (verified against source 2026-07-07)

Severity-ranked. These are the defects the design must close; each maps to a design element below.

**Critical**

- **C1 — Tombstone mis-synthesis after ref-only reconcile (silent propagated data loss).** M2 pushes entry E →
  M1's non-FF push reconciles E into the local ref (disk untouched) → M1's next save reads E's disk-absence as a
  deletion and tombstones it → E suppressed everywhere for 7 days. `arc user status` steers into it: the
  post-reconcile state classifies `"local unsaved"` and recommends the destructive save
  (`sync-status.ts:1602-1609`). Amplifier: identity-global files are written with plain `fs.writeFile` (no atomic
  write, no lock — `io-context.ts`; serialize runs before the lock, `save-load.ts:112`), so a torn read during a
  concurrent sibling load converts into the same propagated deletion.

**High**

- **C2 — Blind rollback discards concurrent saves.** The corrupt-merge arm rolls back via
  `update-ref <ref> <preMergeTip>` with no expected-old-value (`push-fetch.ts:271-273`); a sibling's lock-guarded,
  verified save landing mid-reconcile is erased from the ref while its sync-state still points at it. Adjacent:
  concurrent reconciles fight over shared `NOTES_MERGE_*` state — the second's `merge --abort` tears down the
  first's in-progress merge.
- **C3 — Fast-path paired push ships the ref by name, not the pinned tip**
  (`branch-bounded-notes-export.ts:209` with `ref === destinationRef`): a sibling save landing in the
  marker-publish/retry window exports notes for unpushed commits — the leak branch-bounding exists to prevent.
- **C4 — Stale-lock break race** (`notes-lock.ts:184-206`): two contenders judge a dead holder breakable; the
  slower unlink deletes the faster's freshly-won live lock → two "holders," restoring the lost-update race.
- **C5 — Export re-diverge + bloat.** Two independent defects:
    - **(a)** #206's `omittedCommits > 0 → skip` guard (`branch-bounded-notes-export.ts:250`) declines the adopt
      on the primary's steady case (`omitted = 19`); the correct rule adopts when the pushed tip contains every
      local `(blob,commit)` pair, union-merging only on a genuine subset.
    - **(b)** The overlay loop (`branch-bounded-notes-export.ts:156-168`) re-adds every branch-reachable note even
      when origin holds the identical blob (`remoteBlob === entry.blob` is checked only for refusal, never as a
      skip), and git mints a fresh commit per identical re-add (probe-verified 2026-07-07). This — not missing
      compaction — is the +886/sync growth driver.
- **C6 — `arc user fetch`/`pull` force-resets the shared ref whenever any local note exists**
  (`handlers/user.ts:475-481`) — including local-*ahead*, discarding siblings' unpushed saves; the inspect→fetch
  gap is a TOCTOU even on the "safe" direction.

**Medium**

- **C7 — TTL/window mismatch resurrects deletions**: tombstone TTL is time-based, the merge window count-based;
  <10 saves in 7 days → expired tombstones stop suppressing while pre-deletion notes are still in-window.
  Reconcile merge commits also consume window slots with zero note paths, silently shrinking it.
- **C8 — Shared identity-scoped temp refs collide** (`refs/arc-sync-temp/{identity}`, `…__incoming`): concurrent
  probes delete each other's refs mid-comparison → false `remote-unavailable` verdicts. The per-call
  `uniqueRefToken()` fix already exists in `sync-state-merge.ts:140-145` and was never propagated.
- **C9 — Second non-FF during reconcile re-push escapes as a raw throw** (`push-fetch.ts:284`): no typed outcome,
  no JSON envelope, `__incoming` leaked. Sibling of the shipped success-verdict gap; both fold into the sync
  verdict-coherence guard: `arc sync` must never report success while status reports diverged.
- **C10 — Marker keying + unguarded sync-state RMW**: sibling saves silently clear other worktrees' partial-push
  markers (`sync-status.ts:458` — a status *read* mutates state); `.sync-state.json` read-modify-write has no
  version check, so concurrent processes drop markers. Includes two self-clearing mislabels (same-host divergence
  labeled `cross-machine`; own-host marker framed as a sibling's) — verify both clear once C5 lands, else file a
  diagnostic follow-up.
- **C11 — Cross-worktree status conflation**: `materializedManifestHash` conflates "my worktree's state" with the
  shared identity-global store (spurious `local unsaved`/`mixed` verdicts); `local-ahead`/`diverged` surfaced to
  worktree A for notes B authored; retired-subdir reconcile trusts "shipped on origin" while a sibling may still
  work the WU.

**Low**

- **C12** — fail-open corrupt-note scan (`push-fetch.ts:328-334`: unreadable note treated as valid); "partial
  publish recorded" printed when the marker write returned `false`; HEAD resolved before the lock (note can
  anchor to a stale commit); `verifySavedNote` runs after lock release (verdict incoherence under concurrent ref
  mutation).

## Goals

- **Correct under concurrent writers.** Same-machine worktrees and cross-machine siblings are one multi-writer
  problem; every mutation of shared state is lock-held or CAS-guarded under a written concurrency model.
- **No inferred data loss.** A save can never tombstone an entry the disk never materialized (C1 impossible by
  construction).
- **Bounded growth.** Steady-state syncs add ~zero ref-history commits; accumulated history compacts to a
  snapshot baseline; legacy and retired-WU notes prune under a stated retention policy.
- **Verdict coherence.** `arc sync` never reports success while `arc user status` reports diverged; status never
  recommends a destructive action.
- **Lift the standing operational guards** — the WORKING-MEMORY interim entries (avoid notes-pushing syncs;
  never save over an un-materialized reconcile) retire on their recorded triggers.

## Non-Goals

- **Record-model root fix** — deletion as an explicit record event, entry identity, tombstones as record fields:
  `user-surface-records` (under `operational-state-docs`). This WU ships the interim invariant only.
- **Performance + module decomposition** — N+1 note reads, batching, sync-status/save-load cut-lines, spawn-count
  harness: `user-sync-module-split`. Phase B touches these files but does not restructure them.
- **Decision-engine unification + handler split** — `sync-handler-decomposition`.
- **Primitive-selection prose contract** — stays with `sync-primitive-discipline` (coordinate, don't fold; this
  WU's C9 guard is implementation coherence, not primitive selection).
- **No new team-mode axis, no backend coordination machinery** — compaction ships a marker *seam* the backend
  tier can upgrade, never handshake protocol built now. No new `arc-config.yml` keys: retention parameters are
  internal constants until real variation demands a knob.

## Proposed Design

Three phases, ordered so growth stops before history is compacted and invariants exist before they're relied on.
Each phase is independently shippable.

### Phase A — stop the bleeding

- **A1 — adopt-if-superset (C5a).** Replace the `omittedCommits > 0 → skip` guard: adopt the pushed tip when it
  contains every local `(blob,commit)` pair; union-merge only on a genuine subset.
- **A2 — skip-identical-blobs (C5b).** The export overlay skips a note whose remote blob is byte-identical
  (`remoteBlob === entry.blob` becomes a skip, not just a refusal check), collapsing steady-state syncs to ~zero
  new commits.
- **A3 — pinned-tip push (C3).** The paired push ships `target.tip:destinationRef`, never the ref by name, so a
  sibling save landing mid-window cannot widen the export.
- **A4 — sync verdict-coherence guard (C9).** The second non-FF during reconcile re-push returns a typed outcome
  in the JSON envelope (no raw throw, no leaked `__incoming`); `arc sync` cannot report success while status
  would report diverged. Regression-tested.

**Exit criteria:** a live primary `arc sync` converges — `arc user status` reports current (not diverged)
immediately after, and the remote ref gains ~zero commits on a steady-state sync.

### Phase B — invariant sweep

- **B1 — Written concurrency model.** One document
  (`.arc/reference/strategies/project/strategy-user-notes-concurrency.md` — an internal project strategy,
  indexed with an operation-anchored consult trigger)
  enumerating every mutator of shared state (ref, identity-global disk, sync-state, markers, temp refs) and its
  assigned discipline. The per-mutator assignment:
    - **Lock-serialized** — the user-save note-write (already held), the **reconcile critical section through
      the rollback decision** (merge → corrupt-scan → rollback, not the merge command alone — a sibling save
      landing between merge and rollback must be impossible, or a known-corrupt ref survives with the sibling's
      save on top; git's `NOTES_MERGE_*` worktree state is inherently exclusive anyway; the re-push itself runs
      **after release** — once the scan passes, a sibling save landing pre-re-push is itself lock-guarded and
      verified, so shipping it is benign, and holding a network push inside the bounded wait is exactly the
      cost the lock-free bucket below rejects), Phase C compaction, and the `.sync-state.json`
      read-modify-write.
    - **CAS-guarded** — the rollback `update-ref` (C2 — a belt under the lock above; on CAS decline, abort with a
      typed conflict outcome and never re-push, so a known-corrupt ref is never published), the adopt (already),
      and fetch/pull via an ancestry-guarded `update-ref` replacing the force refspec (C6 — on decline
      (local-ahead / diverged), refuse with a typed outcome + reconcile instruction, never a silent no-op;
      a declined fetch skips pull's load step). Native git form: `update-ref <ref> <new> <expected-old>`.
    - **Lock-free by design** — the branch-bounded export plan→push (network inside the bounded-wait lock invites
      spurious timeouts), protected instead by pinned-tip push (A3) + CAS adopt (A1), accepting stale-plan
      reconcile on the next push.
- **B2 — Save-path guard (C1): materialized-baseline stamp.** A stamp records the notes-ref state whose content
  disk last materialized. The stamp's home is the **machine's repo-shared user-internal store** (the
  git-common-dir `.internal/` beside the notes lock that covers it — one stamp per machine describing the shared
  disk, updated by *any* worktree's load or save) — not per-worktree sync-state, which
  would recreate the C11 scope conflation: a sibling's load would advance shared disk past a stale per-worktree
  baseline, silently breaking deletion propagation. The stamp records the materialized **entry set** (the
  manifest entry list + hash as materialized), not a bare tip: tombstone synthesis diffs disk only against that
  recorded entry set, so an entry merged into the ref but never materialized can never read as deleted. (A bare
  tip re-resolved through the cross-WU recency window fails one save later — the reconcile-merged entry becomes
  "prior state" at the next save's own tip — so the tip may be stored alongside for cheap comparison but is
  never the diff basis.) Absent baseline → synthesize nothing. The diff's two inputs are read **atomically under
  one lock span**: disk serialization moves inside the lock (today it runs before it, `save-load.ts:112`), so a
  sibling's concurrent load can never advance the stamp past the disk snapshot the diff uses — otherwise the
  load∥save interleaving synthesizes a spurious tombstone for the just-materialized entry. Correct the
  `"local unsaved"` post-reconcile recommendation in `sync-status.ts`. Identity-global disk materialization gains
  atomic writes (temp+rename) + lock coverage.
- **B3 — Lock hardening (C4).** Stale-lock breaks serialize under a secondary exclusive-create **break-lock**:
  a contender acquires it, re-verifies the main lockfile still carries the stale holder record, unlinks, and
  releases; the winner then re-creates the main lock through the normal `O_EXCL` path. A slower contender's
  break attempt re-reads the main lockfile *inside* the break-lock, sees the fresh live holder, and backs off.
  (Neither re-verify-before-unlink nor a plain rename-based break suffices: both leave a window in which the
  breaker acts on the wrong lockfile instance, because neither can verify-and-remove atomically without the
  serialization.) The break-lock carries its own holder record and staleness policy: its critical section is
  tiny (read, unlink, release — no network), so a break-lock with a dead holder or age past a short TTL (~30s)
  is itself removed via the same verify-then-unlink. **Accepted residual, recorded:** breaking a stale
  break-lock re-admits the C4 race one level down, with the window shrunk from today's seconds-wide span to
  that milliseconds-long section; the alternative (never-breakable) wedges every future save behind one crashed
  breaker. An OS-level `flock`-style lock (kernel-released on process death) is the upgrade path if the
  residual ever bites — deferred for its cross-platform dependency cost.
- **B4 — Window/TTL alignment (C7).** The cross-WU window becomes time+count bounded so the tombstone TTL
  dominates it; reconcile merge commits stop consuming window slots.
- **B5 — Unique temp refs (C8).** Propagate `uniqueRefToken()` to `__incoming` and `arc-sync-temp`.
- **B6 — Marker keying + status purity (C10/C11).** Partial-push recovery state keyed so sibling saves don't
  invalidate it; worktree-scoped provenance; status reads stop mutating state; `materializedManifestHash` scoped
  so worktree-local state and the shared identity-global store are not conflated. The retired-subdir reconcile's
  "shipped on origin" trust (C11's third clause) gains a same-machine roster check (an in-flight sibling worktree
  on the WU blocks the reconcile); the cross-machine case stays accepted-with-net — the pre-load `.internal/`
  backup already guards it, and Phase C's adopt rule no longer leans on the oracle for correctness. C12's
  low-severity items (fail-open scan, false "recorded" print, pre-lock HEAD resolve, post-release verify) fold in
  here.
- **B7 — Concurrency regression tests.** Interleaving tests for the C1/C2/C3/C4 scenarios (the audit's concrete
  reproductions; C1 covers both the two-save sequence — reconcile → save → save — and the load∥save
  interleaving B2's atomic snapshot+stamp read closes; C4 exercises the break-lock under adversarial scheduling,
  including a stale break-lock), plus the C9 verdict-coherence case. Small deterministic fixtures — concurrency
  correctness needs interleavings, not volume (the scale/perf harness rides `user-sync-module-split`).

### Phase C — retention/compaction

Designed against the **cross-machine rewrite-safety constraint first**: pruning/squashing rewrites a ref siblings
pull, so it must not drop un-synced sibling notes nor break the partial-push/coherence machinery (Phase B's
invariants are the substrate this leans on).

- **Mechanism — snapshot + prune manifest + compaction-aware adopt.** The writer takes the notes lock, pushes a
  backup ref to origin (`refs/backup/…` — recovery must not be hostage to the compacting clone; pruned on backup
  retention expiry), builds one squashed snapshot commit (tree = the full retained notes tree; in-band tombstones
  survive as file content; the tree additionally carries a **prune manifest**, **cumulative across
  generations**: each compaction unions its pruned `(blob,commit)` set into the persisted manifest — bounded by
  total-ever-pruned entries — alongside the pre-compaction tip and a monotonic generation id, so a sibling
  lagging *any* number of generations still finds every deliberately-pruned pair listed. A single-generation
  manifest would let a ≥2-generation laggard resurrect intermediate generations' prunes through the re-export
  arm below), and pushes `--force-with-lease`. The manifest lives at a
  reserved non-SHA path in the notes tree: git's notes porcelain resolves notes by commit-SHA paths and the
  subsystem's readers filter on the SHA pattern (`branch-bounded-notes-export.ts:277-286`), so the entry is
  inert to note resolution; every post-snapshot save preserves it, and same-generation sibling merges unify the
  identical blob cleanly.
- **Sibling reconcile.** A pruning snapshot is by construction a superset of *no* synced sibling's ref, so the
  plain A1 check cannot gate this adopt. Siblings apply a **compaction-aware adopt rule** instead: on detecting a
  snapshot rewrite (generation marker, or a snapshot-rooted non-FF), the sibling adopts the snapshot as its new
  base and disposes every local tip-tree pair the snapshot lacks, three ways:
    1. **manifest-pruned** → retention applied; drops locally with the adopt.
    2. **collision** — the snapshot holds a *different* blob for the same commit → scoped **per-path content
       union** (the subsystem's existing `cat_sort_uniq` + corrupt-scan semantics) committed on top of the
       adopted snapshot; an unparseable union surfaces the existing typed conflict. This is not the prohibited
       union-merge below: it merges two manifests' content at one path and never reattaches history.
    3. **absent** — the snapshot has nothing for that commit → re-export on top of the snapshot. Covers ordinary
       local-only unpushed saves *and* self-heals a compactor bug: a non-pruned note wrongly dropped from the
       snapshot is restored by any sibling still holding it. When the pre-compaction tip's tree is locally
       resolvable (the sibling's own stale ref, or a fetch of the backup ref), a provably pre-compaction pair
       additionally surfaces an **integrity warning** naming the generation — advisory only, never a gate: a
       lagging sibling that never fetched the pre-compaction tip simply skips the diagnostic.

  The adopt is **all-or-nothing** with the existing conflict semantics: an unparseable collision union rolls the
  local ref back to its pre-adopt tip with the existing typed conflict outcome for manual resolution — rare,
  content-preserving, never silent. Apart from that one stop, adopt always proceeds — a sibling never silently
  loses content. **Never union-merge (`git notes merge`) across a compaction
  boundary** — that resurrects the pruned notes and reattaches the pre-compaction history, silently undoing the
  compaction. The manifest travels in-band with the ref, so every disposition above is decided locally and
  machine-count-independent — correctness never depends on team size.
- **Export/push boundary guard.** The adopt rule alone doesn't cover the *push* direction: a stale sibling's
  branch-bounded export would re-add pruned notes (absent-from-remote → overlay re-add,
  `branch-bounded-notes-export.ts:156-168`) and ship them as a clean fast-forward of the snapshot. Every
  export/push path therefore checks the fetched remote tip's generation id against the local ref's before
  staging; on a newer generation it runs the compaction-aware reconcile above first and stages against the
  post-reconcile baseline — pruned pairs are then gone locally, so the overlay cannot resurrect them, and A1's
  union-merge arm never fires across the boundary in either direction.
- **Marker seam.** A generation/epoch marker on the sync-state ref (which already carries markers) announces the
  rewrite for efficiency — cheap detection without walking the ref; correctness rides the in-band manifest, not
  the marker. It is a socket the backend tier can upgrade to real coordination — deliberately not handshake
  machinery built now.
- **Retention policy.** Stated at the tree-entry level the pruner operates on — notes are full-workspace
  snapshots keyed by save-commit, so "pruning a WU" concretely means pruning superseded snapshots anchored to
  its history. **Retain** a note entry when any of: (1) it is among the newest K notes on the ref, K ≥ the B4
  cross-WU window bound, so merge semantics survive the cut; (2) it is younger than the prune age gate; (3) its
  anchor commit belongs to a WU still in flight — not yet shipped with its subdir reconciled away and no
  unpushed local drift (the same oracle the retired-subdir sweep already trusts). **Prune** everything else —
  which subsumes the 427 pre-migration root-`SESSION-NOTES` notes (prunable unconditionally: pre-migration dead
  weight, proven bug fodder) and retired-WU accumulation; superseded workspace content survives in the retained
  newer snapshots and their in-band tombstones. The ~11.7k-commit remote history compacts to the snapshot. The
  window/TTL rule (B4) co-designs with the snapshot so cross-WU merge semantics survive the history cut.
- **Parameters (proposed defaults — internal constants, not config keys):**
    - *Prune age gate:* a retired WU's note family becomes prunable **30 days** after archival (belt-and-braces
      for a lagging sibling machine; the compaction-aware adopt already makes adoption content-safe, so the gate
      guards operator surprise, not correctness).
    - *Backup retention:* the pre-compaction backup ref is kept until the **next** successful compaction verifies
      convergence, minimum **30 days**.
    - *Invocation:* compaction is **manual** — `arc user compact` (lock-held, backup-ref, snapshot, lease-push).
      No scheduled/automatic compaction.
    - *Advisory nudge:* when the ref history exceeds an advisory threshold (**~2,000 commits**), the session-init
      probe envelope carries a compaction advisory, surfaced in orientation like the other advisory sweeps
      (once-per-calendar-day batched via the shared nudge-marker mechanism) with an offer to run the
      interlock-gated `arc user compact` — offer only, never auto-run (it is a lock-held, lease-pushed ref
      rewrite). `arc user status` reports the same signal on demand. Rides Phase C: one probe slot + one
      orientation surface in the session-init workflow.

**Team framing:** refs are per-identity, so team size multiplies ref *count*, not any single ref's size — the
sharp axis is per-identity accumulation (long-lived heavy user × parallelism).

## Alternatives & Rationale

1. **Save-path guard (C1) = materialized-baseline stamp** — over *refuse-and-instruct* (a hard stop inside
   handoff/sync flows) and *auto-load-then-save* (an implicit disk mutation that can overwrite uncommitted local
   edits — the hazard class being closed). Removes the inference gap with no new interactive step.
2. **Write discipline = hybrid per-mutator** — lock where state is inherently exclusive or local; CAS where the
   guard is a ref value; lock-free with pinned-tip + CAS adopt for the network-spanning export. Over
   *lock-everything* (network inside the bounded wait → spurious timeouts) and *CAS-everything* (notes-merge
   worktree state cannot be CAS'd).
3. **Compaction = snapshot + in-band prune manifest + compaction-aware adopt, with a backend-upgradeable marker
   seam** — over an *epoch-handshake protocol* (coordination machinery the backend tier owns; safety here must
   never depend on team size, so the design keeps correctness local-verifiable and leaves coordination as a
   seam) and *periodic re-root* (never sheds the existing sediment cleanly). The manifest is carried in-band
   over *deterministic oracle re-derivation by siblings* (each sibling re-computing the pruned set depends on
   shared oracle inputs a lagging clone may not have; the manifest makes the pruned set a fact the ref itself
   states).
4. **Scale-test split** — the spawn-count / large-fixture perf harness rides `user-sync-module-split` (it tests
   the batching work); this WU's interleaving suite uses small deterministic fixtures (concurrency correctness
   needs interleavings, not volume).

## Cross-cutting Considerations

- **Testing.** B7's interleaving suite is the body; A4/C9 verdict coherence is regression-tested; Phase C adds a
  sibling-adoption test (local-only notes survive a compaction adopt, verified by content diff), a boundary-push
  test (a stale sibling pushing across a compaction boundary — the export overlay path and the
  `reconcileAndRepush` path both — resurrects nothing), and a multi-generation lag test (a sibling lagging two
  compactions adopts without resurrecting either generation's pruned set). Unit tier for pure guards (superset
  check, window/TTL math, manifest cumulativity); integration tier for interleavings against temp repos.
- **Migration / rollout.** Phases ship independently, in order. Phase A lifts the standing "avoid notes-pushing
  syncs" directive and the WORKING-MEMORY coherence-gap entry on its recorded trigger; Phase B lifts the
  tombstone-hazard guard entry. Each worktree runs its own `arc` build — a fix is live in a worktree only after
  it has merged the change and rebuilt (same discipline as the #200/#203 rollouts).
- **Forward-compat (storage evolution).** Version-checked writes are Phase B's spine — the interim work
  *implements* the target discipline. The save-path guard and window fixes harden the markdown-canonical interim
  without adding schema; nothing here deepens the state-diff inference model the record layer replaces. Phase C
  decides the notes-history policy for the in-repo tier and records it so the backing-store tier inherits a
  reasoned default (retention window as policy, not accident); all mechanisms operate on the notes ref wherever
  it lives — no tracked-in-code-repo assumption. Same-machine worktrees and cross-machine siblings are treated as
  one multi-writer problem — no new team-mode axis.
- **User-facing impact.** `arc user status` stops recommending a destructive save post-reconcile; sync verdicts
  become trustworthy; `arc user fetch`/`pull` change semantics on a local-ahead/diverged ref — a typed refusal
  with reconcile instruction replaces today's silent force-reset; `arc user compact` is new command surface
  (manual; nudged via a session-init advisory with an agent offer). No new config keys.
- **Coordination.** `user-sync-module-split` owns the perf/decomposition cut-map for these same files —
  whichever WU lands second rides the other's seams (sequencing note recorded in both). `sync-primitive-discipline`
  stays adjacent (which-primitive prose contract); this WU's C9 guard is implementation coherence.

## Success Criteria

- **Phase A:** a live primary `arc sync` converges — `arc user status` reports current (not diverged)
  immediately after, and the remote ref gains ~zero commits on a steady-state sync (vs. +886 today).
- **Phase B:** the C1 scenario is impossible by construction — a save cannot tombstone an entry the disk never
  materialized (interleaving test); the C2/C3 interleavings and the C9 verdict-coherence case are
  regression-tested; the WORKING-MEMORY interim guard entry's removal trigger is met.
- **Phase C:** the remote ref history is compacted to the snapshot baseline (order ~10² commits, not ~10⁴);
  legacy/retired-WU notes pruned per the retention criterion; a sibling clone with local-only notes adopts the
  rewritten ref losslessly (verified by content diff, the same 0-local-only check used 2026-07-07).

## Open Questions

None blocking. The Phase C parameter defaults (prune age gate, backup retention, advisory threshold) are stated
above as internal constants; tuning them against live behavior is ordinary implementation latitude, not open
design. B1's concurrency-model doc location is settled — `strategy-user-notes-concurrency.md` under the project
strategies.
