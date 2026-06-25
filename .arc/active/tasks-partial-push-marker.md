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

### `[x]` **4.1 Marker-before-notes push ordering**

- _Goal:_ During a paired push the sync-state marker is written and pushed **before** the user-notes leg, and the
  producer degrades safe — no ref write on opt-out or from a fetch-only clone, behavior unchanged when the ref is
  absent.

    - `[x]` **4.1.a Write-and-push the remote marker ahead of the notes leg**
        - New `sync-state-publish.ts` composes machine-id + HEAD + local-notes-tip into the marker and
          reconcile-pushes it; `runPairedPush` fires the injected `publishMarker` delegate between the worktree
          push and the notes leg, so a landed marker reads "about to push notes for HEAD X". The local
          `.sync-state.json` marker's after-the-attempt timing is unchanged.

    - `[x]` **4.1.b Degrade-safe guards**
        - Opt-out is **structural**, not a config gate: the publish rides the existing notes-push gate — fires
          only inside the paired flow, only after a successful worktree push, and is best-effort (never throws,
          never flips the exit code). An opted-out user, an absent notes ref (skip `no-notes-ref`), no remote
          (skip `no-remote`), and a fetch-only clone all behave as today. Integration test covers the publish
          path + the no-write paths.

- _Outcome:_ The producer publishes its outstanding intent ahead of the notes leg; self-invalidation falls out
  of `intent` = local notes-ref tip (origin reaching it → `evaluateMarkerLiveness` reports fulfilled). The SC-8
  opt-out was redesigned from `pm.mode: external` (ratified for retirement by ADR-020 — it would leave a dead
  gate) to structural degrade-safety; `spec-partial-push-marker.md` SC-8 + § Rollout updated to match.

### `[x]` **4.2 Act-register recovery — auto-retry then primed retry**

- _Goal:_ A notes-leg failure inside `arc sync` / `arc release push` auto-retries silently a couple of times, then
  surfaces a retry defaulted to retry; on retry success the marker never persists, on deferral it persists
  knowingly — and no path blocks on a TTY prompt an agent-run invocation can't answer.

    - `[x]` **4.2.a Auto-retry with short backoff**
        - _Goal:_ Transient blips resolve silently before any surface — a couple of quick retries.
        - New `notes-push-retry.ts` `runNotesPushWithRetry` loops the notes-leg attempt under a bounded budget
          (`DEFAULT_NOTES_PUSH_RETRY`: two retries at ~250ms/750ms, `sleep` injected): only a raw `failed` is
          retried (re-push is zero-clobber); terminal outcomes (`no-remote` / `blocked` / `failed-nontty-conflict`)
          skip straight to the offer. A success after retries resolves with no marker persisted. Retries are
          _silent_: the paired notes leg runs `pushNotesWithReconcile` with `quiet`, so per-attempt spinners no
          longer churn — the single final outcome is reported once by `renderPairedResult`.

    - `[x]` **4.2.b Primed-retry surface and informed deferral**
        - _Goal:_ Persistent failure offers retry (defaulted to retry); deferral persists the marker knowingly.
        - `runPairedPush` consumes the primitive: a resolved leg clears the marker, a still-failing leg records it
          and returns a structured `retryOffer` (never throws, never prompts). The offer rides `PairedPushResult`
          into the `arc sync` JSON envelope (`SyncOutcome.retryOffer`) so an agent-run invocation reads and resolves
          it conversationally — the CLI stays a non-interactive primitive.

- _Outcome:_ The Act register lands as a non-interactive primitive plus its push-path integration: transient
  notes-leg failures self-heal silently; a persistent one persists the marker exactly once and surfaces a
  machine-readable primed-retry offer for the agent layer (`arc-handoff`, Phase 5) to resolve. Resolves the spec's
  auto-retry-backoff open question (constant-tuned, loop untouched). `arc release push` needed no change — it wraps
  only the worktree leg; the notes leg fires in `arc sync`'s paired path.

### `[x]` **4.3 Presentation fidelity — suppress the upstream-init stderr leak**

- _Goal:_ A successful upstream-init sync presents as success — no stray `error: Set upstream first` (or any
  pre-recovery git failure) leaks to stderr when the `-u` re-push succeeds.

- _Outcome:_ Root cause was not a fail-then-retry git push (both `arc sync` and `arc release push` inject `-u`
  up front) but a surfaced-condition leak: `runPairedPush` returned the **unfiltered** pushability conditions,
  so the auto-resolved `no-upstream-branch` (a `caller-resolvable`, hence `isRefusalCondition`-true) still rode
  the result — and `renderPairedResult` logged its "Set upstream first" guidance to stderr on a successful
  upstream-init push. Fix returns the post-resolution conditions (`conditionsAfterResolution`) on the success
  path, so the resolved condition never surfaces; the structured result (exitCode 0) stays the source of truth.
  Regression guarded at the `runPairedPush` boundary. The single-leg upstream-init path and the `arc release
  push` wrapper were already clean (they don't render conditions on success), so no other leak path existed.

### `[x]` **4.4 End-to-end multi-machine producer scenario**

- _Goal:_ Against temporary git repos, the full producer lifecycle holds: A partial-pushes and the marker carries
  the entry; a sibling reads the marker; A's retry self-invalidates it.

- _Outcome:_ New `sync-state-producer.e2e.test.ts` drives the shipped CLI across a two-clone `setupMultiClone`
  topology under one identity. A bare-origin `update` hook rejecting only `refs/notes/arc/user/*` forces a genuine
  partial push (worktree + sync-state ref land, the notes leg fails) — a real reproduction rather than a stubbed
  one. Three scenarios pass: A's partial push lands a live, correctly-keyed entry whose `intent` matches its local
  notes tip; removing the hook and re-syncing lands the notes so origin reaches that intent (fulfilled —
  self-invalidated); and a second clone's partial push union-merges to two coexisting machine keys, neither
  clobbering the other. Liveness is asserted at the git level (origin notes tip vs. recorded intent — the same
  comparison the predicate makes), keeping the test source-free per the E2E tier; B-side rendering stays out of
  scope (the sibling WU).

## **Phase 5:** Consumer register contract and arc-handoff integration

_Purpose:_ Deliver the cross-WU seam — the three-register model the B-side consumer renders against, with the
payload affording each register — and define `arc-handoff`'s notes-push-failed behavior, the highest-stakes Act
site.

### `[x]` **5.1 Register/affordance contract for the B-side consumer**

- _Goal:_ The consumer WU (`stale-state-detect-and-pull`) has an unambiguous, payload-backed contract for the
  three registers (Act / Aware / Caution) it renders against — each register's affordance traces to a concrete
  payload field.

- _Outcome:_ Expanded the `Recovery-presentation register contract` seam in `cohort-cross-machine-coherence.md`
  from a one-line gesture to the consumer's actionable contract: a per-register affordance→payload-field table
  (Aware ← short-sha/when/whose; Caution ← those plus the merge-preserves-both framing), with Act marked
  producer-owned and not consumer-rendered, plus the producer-side liveness predicate and 14-day TTL as the
  self-invalidation basis. Authoritative design stays in `spec-partial-push-marker.md` § 8; the cohort record now
  carries the unambiguous form where the consumer reads it. Doc-only — no B-side surface built.

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
