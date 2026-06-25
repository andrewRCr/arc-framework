# Task List: Partial-Push Marker

- **Design:** `spec-partial-push-marker.md`

---

## **Phase 1:** Sync-state ref, machine-id, and marker payload

_Purpose:_ Stand up the producer's data substrate — the sibling sync-state ref, a machine-local id, and the
per-machine marker entry — that every later phase reads and writes. Nothing wires into the push path yet.

_Design decisions:_ The ref is a **keyed tree of entries**, one blob per machine, mirroring the shipped errand
ref-tree rather than the commit-keyed user-notes ref — per-machine ownership is what makes concurrent writes
union cleanly (Phase 2). Machine-id is a random UUID, never the hostname, and lives in the existing
`.sync-state.json` so sync-state stays colocated.

### `[x]` **1.1 Machine-id lazy generation**

- _Goal:_ The writing machine has a stable, random identifier generated once on first need and persisted, with no
  user ceremony and no hostname leak.

- _Outcome:_ `getOrCreateMachineId` (`lib/user-sync/sync-state.ts`) lazily mints a `randomUUID()`, persists it to
  `.sync-state.json` as the optional `machineId` field, and is idempotent thereafter. Read and persisted via a raw
  reader that bypasses the full-record schema gate, so a machine-id can exist on a record before any save/load
  field does; carried forward through every record rebuild (`writeLocalSyncState`, `clearPartialPushMarker`,
  `clearErrandPartialPushMarker`) so a later save never drops it. No hostname or environment value reaches the
  ref. Three unit behaviors in `save-load.test.ts`.

### `[x]` **1.2 Sync-state ref transport primitives**

- _Goal:_ A round-trip read/write/push/fetch layer for `refs/arc/user/{identity}/sync-state` exists, storing a
  tree of per-machine entry blobs keyed by `machineId`.

    - `[x]` **1.2.a Ref naming and entry read**
        - _Goal:_ Resolve the per-identity ref name and read its tree into a keyed entry map.

    - `[x]` **1.2.b Entry write, commit, and remote transport**
        - _Goal:_ Write/overwrite a single machine's entry, commit the tree, and push/fetch the ref to/from origin.

- _Outcome:_ New `lib/user-sync/sync-state-ref.ts` keyed by `machineId` on `refs/arc/user/{identity}/sync-state`:
  `syncStateRef` / `readEntries` / `readEntry` / `writeEntry` (overwrites only the writer's own key) /
  `pushSyncStateRef` / `fetchSyncStateRef` (force refspec into the `__incoming` tracking ref). Uses the errand
  ref-tree's tree-commit model (`hash-object` / `mktree` / `commit-tree` / `update-ref`), deliberately
  self-contained and parallel to the errand ref rather than a shared substrate — the union-merge reconcile that
  consumes the fetched tracking ref lands in a later phase. Curated surface exported from the `user-sync` barrel;
  7 integration behaviors in `sync-state-ref.test.ts`.

### `[x]` **1.3 Per-machine marker entry schema**

- _Goal:_ A typed marker entry carries everything the consumer surface and the liveness predicate need, and
  serializes stably to/from the ref blob.

- _Outcome:_ New `lib/user-sync/sync-state-marker.ts` (mirroring the errand record module): the `SyncStateMarker`
  type (`version` / `machineId` / `lastAttemptedCommit` / `attemptTimestamp` / `intent`) with
  `serializeSyncStateMarker` (normalized field order → byte-stable round-trip) and `deserializeSyncStateMarker`
  (narrows `unknown`, returns `null` on a non-object / wrong-version / missing-or-empty field, never throws), plus
  typed `readSyncStateMarker` / `writeSyncStateMarker` glue over the 1.2 transport for the liveness predicate and
  push integration to consume. Schema exported from the `user-sync` barrel; 6 unit behaviors in
  `sync-state-marker.test.ts` and 3 through-ref round-trip behaviors in `sync-state-ref.test.ts`.

## **Phase 2:** Union-merge reconciliation by machine key

_Purpose:_ Make concurrent cross-machine writes conflict-free — each machine owns its key, entries union, and
pushes retry on non-fast-forward — so no machine's outstanding intent clobbers another's.

_Design decisions:_ Last-writer-wins is rejected (a single LWW blob lets one machine overwrite another's intent,
reopening the gap). Reuse the shipped errand-tree union + non-fast-forward-retry shape (`lib/errand/merge.ts`).

### `[x]` **2.1 Union-merge marker entries by `machineId`**

- _Goal:_ Merging two entry sets unions them by `machineId` — each machine's own key wins for that key, no key
  clobbers another.

- _Outcome:_ New `lib/user-sync/sync-state-merge.ts` — `mergeSyncStateEntries(local, remote, ownMachineId)` unions
  the per-machine trees from the writer's vantage point: foreign keys come from `remote` (origin is authoritative
  for the machine that owns each), the writer's own key from `local` (set when present — a write/re-write; removed
  when absent — the writer cleared it). The per-machine ownership model deliberately replaces errand's same-key
  collision with a deterministic owner-wins resolution — there is no collision outcome at all, and a machine's own
  deletion survives a remote that still carries the stale entry. Exported from the `user-sync` barrel; 3 unit
  behaviors in `sync-state-merge.test.ts`.

### `[x]` **2.2 Non-fast-forward reconcile-and-retry for the sync-state ref**

- _Goal:_ A rejected push fetches origin, union-merges, and re-pushes — bounded retries — so a concurrent sibling
  push never loses either machine's entry.

- _Outcome:_ Added `reconcileSyncStatePush(io, ownMachineId)` and `MAX_RECONCILE_ATTEMPTS` to
  `lib/user-sync/sync-state-merge.ts`, mirroring the errand reconcile loop on the shared `lib/git/ref-tree`
  substrate already wired in `sync-state-ref.ts` (no errand plumbing re-imported): a clean push → `pushed`, a
  non-fast-forward → fetch + `mergeSyncStateEntries` + commit-onto-both-tips + retry → `reconciled`, exhausted
  retries → `failed`. There is no `conflict` arm — unlike errand, the per-machine union is collision-free. The
  reconcile's union is owner-scoped to `ownMachineId`, leaving the own-key write compare-and-swap-ready for
  `state-ref-write-safety`'s same-machine guard. Exported from the `user-sync` barrel; 4 integration behaviors in
  `sync-state-ref-reconcile.test.ts` (clean push, no-op, two-clone union, bounded-retry exhaustion).

## **Phase 3:** Liveness predicate and TTL self-invalidation

_Purpose:_ Distinguish a live intent from a resolved or abandoned one — comparison against the notes ref closes
the common case with no clock; a 14-day TTL ages out the abandoned-machine backstop.

_Design decisions:_ The predicate is producer-side, so the marker's self-invalidation semantics live with the
marker, not the consumer. The TTL is a single config value (14 days), not a new configuration axis.

### `[x]` **3.1 Liveness predicate against the notes ref**

- _Goal:_ Given a marker entry and origin's actual notes-ref state, the predicate returns **fulfilled** (notes for
  `intent` landed → self-invalidated) or **live** (notes ref still behind → unresolved), with no clock.

- _Outcome:_ Added `evaluateMarkerLiveness(marker, notesRefTip)` (+ `MarkerLiveness = "fulfilled" | "live"`) to
  `lib/user-sync/sync-state-marker.ts`, co-located with the marker so its self-invalidation semantics travel with
  the payload. Pure, clock-free ref comparison: `fulfilled` when origin's notes-ref tip equals the entry's
  `intent`, else `live` (a `null` tip — origin has no notes ref — is `live`). Origin's tip is the caller's input
  (resolved via `git ls-remote`), keeping the predicate git-free for testing; the abandoned-machine case it cannot
  close is 3.2's TTL backstop. Exported from the `user-sync` barrel; 3 unit behaviors in `sync-state-marker.test.ts`.

### `[x]` **3.2 14-day TTL aging for abandoned intent**

- _Goal:_ A marker for a machine that attempted a push and never returned ages out after 14 days
  (`attemptTimestamp` is the input) so it stops nagging, while a within-window entry stays live.

- _Outcome:_ Added `isMarkerExpired(marker, now, ttlDays)` and the `SYNC_STATE_MARKER_TTL_DAYS = 14` constant to
  `lib/user-sync/sync-state-marker.ts` — the time-based backstop layered over 3.1's comparison. Pure and
  clock-injected (`now` passed in, mirroring the `merge.ts` tombstone-TTL pattern): an attempt at least `ttlDays`
  old relative to `now` is expired (the consumer stops surfacing it), a within-window entry retained. The day-count
  defaults to the single exported constant and is overridable per call, so no literal `14` lives at a call site — a
  single value, not a new config axis. Exported from the `user-sync` barrel; 3 unit behaviors in
  `sync-state-marker.test.ts`.

## **Phase 4:** Push-time integration — ordering and the Act register

_Purpose:_ Wire the marker into the sync push path: push it before the notes leg (so a landed marker reads "about
to push notes for HEAD X"), resolve the notes-leg failure in place (auto-retry → primed retry → informed defer) as
a non-interactive-safe primitive, and keep the success path's output clean. Closes with an end-to-end multi-machine
producer scenario. The integration-heavy phase — carries the most parents by design.

_Design decisions:_ Detection, not prevention — `main` is never made contingent on the notes push. The CLI stays a
non-interactive-safe primitive; interactivity (the retry decision) is owned by the agent/workflow layer.

### `[ ]` **4.1 Marker-before-notes push ordering**

- _Goal:_ During a paired push the sync-state marker is written and pushed **before** the user-notes leg, and the
  producer degrades safe — no ref write on opt-out or from a fetch-only clone, behavior unchanged when the ref is
  absent.

- _Approach:_ Thread into the paired flow (`commands/user/paired-push.ts`, `handlers/sync.ts`). Two distinct
  markers, distinct timing — don't conflate them: the **remote** sync-state marker writes/pushes _before_ the
  user-notes push (paired-push.ts ~line 137, ahead of the notes push), while the existing **local**
  `.sync-state.json` marker stays recorded _after_ the notes attempt (paired-push.ts:146/148).

- _Note:_ Degrade-safe guard (opt-out rides the existing `pm.mode: external` axis; fetch-only clones consume but
  never write) is the SC-8 surface — verify it here, not as a separate axis.

    - `[ ]` **4.1.a Write-and-push the remote marker ahead of the notes leg**
        - Push the remote sync-state marker before the notes push so a landed marker reads "about to push notes
          for HEAD X"; the local marker's after-the-attempt timing is unchanged

    - `[ ]` **4.1.b Degrade-safe guards**
        - Skip the ref write under opt-out and from fetch-only clones; absent ref behaves exactly as today
        - Integration test: marker-before-notes ordering, and the no-write paths

### `[ ]` **4.2 Act-register recovery — auto-retry then primed retry**

- _Goal:_ A notes-leg failure inside `arc sync` / `arc release push` auto-retries silently a couple of times, then
  surfaces a retry defaulted to retry; on retry success the marker never persists, on deferral it persists
  knowingly — and no path blocks on a TTY prompt an agent-run invocation can't answer.

- _Approach:_ The CLI primitive stays non-interactive (auto-retry, structured result, never a blocking prompt);
  the agent/workflow layer owns the conversational retry decision. Auto-retry is safe to take readily — re-pushing
  the same ref carries zero clobber risk (unlike the B-side force gate).

- _Note:_ Auto-retry-on-transient is **net-new** — the codebase has non-fast-forward _reconcile_ (fetch+merge+
  repush) but no transient-failure retry (`paired-push.ts` is explicit: "No automatic retry"). Build the loop;
  there's no existing primitive to wire. Distinct from the Phase 2 nff reconcile.

- _Note:_ Composes with `cli-substrate-adoption`'s queued uniform non-interactive contract — soft coordination, not
  a hard dependency.

- **Strategies:** strategy-testing-methodology.md

    - `[ ]` **4.2.a Auto-retry with short backoff**
        - _Goal:_ Transient blips resolve silently before any surface — a couple of quick retries.

            Build `test-first` (one behavior at a time):

            - A failure that succeeds on auto-retry never surfaces a prompt and never persists the marker
            - Auto-retry is bounded (count/backoff exhausts to the surface path, not an infinite loop)

    - `[ ]` **4.2.b Primed-retry surface and informed deferral**
        - _Goal:_ Persistent failure offers retry (defaulted to retry); deferral persists the marker knowingly.

            Build `test-first` (one behavior at a time):

            - Persistent failure yields a structured retry-offer outcome, not a thrown error or silent swallow
            - An agent-run (non-TTY) invocation never blocks — it returns the offer for the caller to resolve
            - On deferral the marker persists (local + remote); on retry success it self-invalidates

### `[ ]` **4.3 Presentation fidelity — suppress the upstream-init stderr leak**

- _Goal:_ A successful upstream-init sync presents as success — no stray `error: Set upstream first` (or any
  pre-recovery git failure) leaks to stderr when the `-u` re-push succeeds.

- _Context:_ The upstream-init recovery (`handlers/release/push.ts` `decideUpstreamInjection`, the
  `push-with-upstream-init` path in `handlers/sync.ts`) first fails a plain push, then re-pushes with `-u`. The
  structured result is the single source of truth for success; the pre-recovery failure must not reach stderr.
  This is the WU's "lag, not loss" charter applied to its own output.

    Build `test-first` (one behavior at a time):

    - A successful upstream-init sync emits no `error: Set upstream first` (or other pre-recovery git error) on
      stderr — regression test for the leak
    - The structured result reports success; a reader/agent sees no stray error line

### `[ ]` **4.4 End-to-end multi-machine producer scenario**

- _Goal:_ Against temporary git repos, the full producer lifecycle holds: A partial-pushes and the marker carries
  the entry; a sibling reads the marker; A's retry self-invalidates it.

- _Approach:_ E2E tier (`__tests__/e2e/`), modeled on `errand.e2e.test.ts` + `createTempRepo()` (no existing
  multi-clone test — wire two temp repos under one identity). Exercises union-merge (Phase 2), liveness (Phase 3),
  and push ordering (Phase 4) together. B-side rendering is out of scope (the sibling WU) — assert against the
  marker/predicate, not a rendered surface.

- **Strategies:** strategy-testing-methodology.md

    - Two clones under one identity; A partial-pushes (worktree ok, notes fail) → the sync-state ref carries A's
      entry, liveness reports live
    - A's notes later land → liveness reports fulfilled (self-invalidated)
    - Two machines hold outstanding intents simultaneously → union-merge, neither clobbers the other

## **Phase 5:** Consumer register contract and arc-handoff integration

_Purpose:_ Deliver the cross-WU seam — the three-register model the B-side consumer renders against, with the
payload affording each register — and define `arc-handoff`'s notes-push-failed behavior, the highest-stakes Act
site.

### `[ ]` **5.1 Register/affordance contract for the B-side consumer**

- _Goal:_ The consumer WU (`stale-state-detect-and-pull`) has an unambiguous, payload-backed contract for the
  three registers (Act / Aware / Caution) it renders against — each register's affordance traces to a concrete
  payload field.

- _Context:_ The producer owns the contract; the consumer owns the rendering (a non-goal here). The marker payload
  (§ 3) is designed to afford each register — short-sha / when / whose for Aware, the merge-preserves-both context
  for Caution. Record the contract where the consumer reads it (the cohort coordination record already names this
  seam); no B-side surface is built here.

### `[ ]` **5.2 `arc-handoff` notes-push-failed behavior**

- _Goal:_ The handoff workflow has a defined behavior for the notes-push-failed outcome — surface the primed retry;
  on deferral, record it in the handoff report so the next session inherits the context.

- _Approach:_ Reuse the Phase 4 Act-register primitive at the handoff Act site; the workflow layer surfaces the
  retry decision. Handoff is the highest-stakes Act site — the last moment before leaving A for B.

- _Note:_ The handoff workflow is a two-copy Framework file — edit the package source
  (`packages/arc-framework/arc/system/workflows/...`) and sync to `.arc/`, never the reverse.

- **Strategies:** strategy-package-project-sync.md

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` After a partial push on A, the sync-state ref carries an entry for `lastAttemptedCommit` affording
  short-sha / when / whose, and the liveness predicate reports the intent live against origin's notes-ref state.
- `[ ]` Once A's notes land at origin, the liveness predicate reports the entry fulfilled (self-invalidated) with
  no timer.
- `[ ]` An abandoned intent ages out after the 14-day TTL.
- `[ ]` Two machines under one identity hold outstanding intents simultaneously and union-merge — neither clobbers
  the other.
- `[ ]` A notes-push failure inside `arc sync` / `arc release push` triggers auto-retry; on persistent failure the
  retry surface is offered, never as a blocking TTY prompt in an agent-run invocation; on retry success the marker
  never persists.
- `[ ]` A successful upstream-init sync presents as success — no stray `error: Set upstream first` (or any
  pre-recovery git failure) leaks to stderr on the success path.
- `[ ]` `arc-handoff` has a defined notes-push-failed behavior (primed retry; deferral recorded in the handoff
  report).
- `[ ]` Degrades safe: the producer adds the marker push without disturbing existing behavior when the ref is
  absent or the feature is opted out, and never writes the ref from a fetch-only clone.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

---
