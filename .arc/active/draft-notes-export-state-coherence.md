# Draft: Notes-Export State Coherence

- **Origin:** USER-INBOX capture drained at stub creation (2026-07-09); surfaced during `finalize-parallelism`
  wave 1, `arc-session` entry after Task 3.2.b — a cross-WU handoff-resume reproduced the false-conflict
  surface live. Re-confirmed at the 2026-07-09 session-init that drained this capture: the probe mapped the
  same topology to `conflict` and recommended a pull that `runUserPull` would refuse.
- **Purpose:** Treat branch-bounded notes projection divergence as expected state, not a pull/replace conflict.
  Two-sided fix: the producer reconciles the expected residue at the source (safe-join), and ref inspection
  classifies any remaining divergence by content relation so session-init tells the truth and never offers
  pull/replace for divergence it cannot safely resolve. Lands on `main` before `finalize-parallelism` wave 2 /
  the next cross-WU handoff-resume verification; FP merges it in and re-runs the originating induction.

---

## Problem

FP wave 1 reproduced an **expected** parallel-handoff topology as a **false data-conflict surface**:

- After `slug-state-oracle-alignment` handed off, its branch-bounded notes export preserved origin and
  overlaid only branch-reachable notes, while the shared local canonical ref correctly retained four notes
  attached to deliberately unpushed burn-in commits.
- The resulting refs were graph-diverged (`0fdd01af` local / `232b131f` remote) but **content-compatible**:
  every remote `(annotated commit, blob)` pair was byte-identical locally, and local was a strict content
  superset of remote.
- `arc status --session-init` nevertheless mapped the ancestry-only `diverged` verdict to `conflict` and
  prompted `arc user pull` to "replace local notes."

### Mechanism chain (verified against source, 2026-07-09)

1. **The residue is deliberate and documented.** After a subset export, `adoptPushedTipIntoLocalRef`
   (`branch-bounded-notes-export.ts`) refuses to advance the local canonical ref when
   `supersedesLocal === false` — adopting the pushed tip would drop the omitted notes. The comment calls the
   resulting `diverged` "benign" and defers "a union reconcile for that case" as out of scope. This WU is that
   deferred reconcile.
2. **The classifier is ancestry-blind.** `computeUserSyncSpineState` (`sync-status.ts`) maps `diverged` →
   `conflict` with `shouldPromptToPull: true` purely from ref topology; no content comparison exists, though
   both trees are locally readable at the diverged arm and a `(commit, blob)` subset check is cheap set math
   (see B's listing-mechanism note for the one plumbing caveat).
3. **The recommendation cannot succeed.** `inferUser` (`lib/session-init/recommended-action.ts`) offers
   "Pull?" on `conflict` — and under `session.init_pull.notes: always` it **auto-fires** `arc user pull`,
   which answers `refused-diverged` unconditionally (`push-fetch.ts`). A guaranteed dead-end under `always`;
   misleading and unsafe-looking under `prompt`.
4. **Operational drag until reconciled.** While the refs diverge, partial-push markers accumulate and the
   false conflict prompt fires at every session-init. Observed live 2026-07-09: this machine's FP
   (`94068a6f`) and SSOA (`f53eecf4`) handoff pushes both left standing markers.

## Decision — A + B (settled 2026-07-09)

Both halves land in this WU. Rationale: A alone leaves any divergence from *other* causes (CAS-failure
residue, crash between push and adopt, legacy pre-fix machines, manual notes surgery, true same-commit
conflicts) misreporting as a pull-able conflict — exactly the class of surprise FP wave 2's deliberate
parallel inductions could hit, forcing a second isolated fix WU as an FP blocker. B alone renames the
expected residue benign but leaves refs permanently diverged with standing marker noise. FP is the GA gate
for concurrent work units; read-side robustness is in its spirit.

### A — producer-side safe-join

At the `supersedesLocal === false` arm of `adoptPushedTipIntoLocalRef`, replace the skip with a **join**: a
two-parent commit on the local canonical notes ref (parents: prior local tip + pushed export tip) whose tree
carries the union of both entry sets, so the pushed tip enters local ancestry while every local note is
preserved.

- **Contested-entry rule (adversarial pass 1 fixed a false "conflict-free by construction" claim):** the
  plan-phase refusal only scans branch-reachable entries, so an *omitted* commit whose remote blob differs
  from local's reaches the join contested. The join resolves by ancestry: when `localIncludesRemote` (remote
  tip already in local ancestry), every remote blob is an ancestor state of local's — **local-wins** is
  correct and the join proceeds. When `localIncludesRemote === false` and any contested pair exists, the
  join **refuses** (today's skip stands; refs stay diverged and B classifies `conflicting`) — a genuine
  cross-machine conflict is never folded silently into ancestry.
- **Join reads at join time:** the union is computed from both trees read at join (the planned target carries
  commit lists, not blob maps — and CAS semantics argue for a fresh read regardless).
- **Same CAS discipline:** the join commits against `priorLocalTip` (compare-and-swap, as the current
  fast-forward adoption does); a concurrent `arc user save` fails the swap and leaves today's behavior
  (reconcile at next push). Best-effort — a failed join never degrades the already-successful push.
- **Steady state restored:** after the join, `refState` reads `local-ahead` (origin's tip is an ancestor);
  subsequent exports fast-forward; each currently-wedged machine self-heals on its next paired push.
- **New shared-ref mutator:** `strategy-user-notes-concurrency`'s mutator checklist applies (lock coverage,
  CAS, compaction-boundary interaction with `adoptRemoteCompactionIfNewer`). Its CAS-Guarded section's
  "adopts … only when the temp tree is a content superset" invariant sentence updates to cover the
  ancestry-resolvable join.
- **Join mechanism leaning:** build the union commit deterministically with plumbing (`commit-tree` over the
  staged union), not `git notes merge` — avoids notes-merge worktree state. Spec settles the exact plumbing.

### B — content-relation classification at ref inspection

`inspectUserSyncRefsDetailed` (`sync-status.ts`) already fetches the remote notes ref into a local temp ref
and holds it until `finally` — both trees are locally readable on the diverged arm. There, derive
`contentRelation ∈ {remote-subset, local-subset, equal, conflicting}` by pure set math over `(commit, blob)`
pairs (two extra git reads, **only** when already diverged; zero cost on healthy paths).

- **Listing mechanism (adversarial pass 1 caught a mislisting):** the inspection temp ref lives at
  `refs/arc-sync-temp/…`, which `git notes --ref` DWIM-expands to `refs/notes/refs/arc-sync-temp/…` and
  lists **empty** (verified live) — naive `notes list` would classify every divergence, true conflicts
  included, as `remote-subset`. Read entries via `git ls-tree -r <sha>` with notes-fanout path flattening
  (works on any commit-ish, no notes-namespace games); fetching to a `refs/notes/`-prefixed temp is the
  fallback alternative. The regression below covers the mislisting shape end-to-end.
- **Classifier shape:** a standalone pure module (e.g. `lib/user-sync/note-set-relation.ts`) taking two
  entry lists, so `user-sync-module-split` relocates it freely — do not deepen `sync-status.ts`'s monolith.
- **Spine mapping:** `diverged + remote-subset` → spine `clean` (the same collapse `local-ahead` already
  gets), with raw topology + relation preserved on the envelope for orientation. All other relations stay
  `conflict`. The 5-state `UserSessionInitState` enum does not grow — consumers keep their dispatch.
- **Parallel projections thread the same relation (adversarial pass 1):** the spine is not the only
  consumer of raw `refState`. `deriveRemoteStatus` (diverged → `"conflict"`), the status headline + cause
  lines, and `decideSyncAction`'s dispatch all read topology independently — left unthreaded, session-init
  would say clean while `arc user status` (the very surface the guidance fix points users to) headlines
  "notes conflict" with a false cause line. The relation rides the spine so every projection reads it:
  `diverged + remote-subset` renders as the existing `local ahead` vocabulary with a cause line naming the
  export residue ("branch-bounded export residue; reconciles at next paired push"); `conflicting` keeps the
  conflict vocabulary with truthful guidance. No headline-union growth (reuse, don't overload).
- **Session-init clean-arm surface:** `diverged + remote-subset` gets the same informational orientation
  line `local-ahead` gets (not a silent skip) — it is the odder of the collapsed topologies.
- **Session-init workflow doc:** small orientation-text touch only (the clean-arm collapse note gains the
  remote-subset case); no new dispatch arms.

### Shared guidance fix (either half would still require it)

- The `conflict` arm stops promising pull/replace: detail/summary/prompt text becomes truthful — genuine
  divergence cannot be resolved by pull (`runUserPull` refuses it by contract); direct to `arc user status`
  inspection instead.
- `session.init_pull.notes: always` on `conflict` degrades to **surface**, never auto-fires the refusing
  pull (the dead-end loop).
- **`arc user sync`'s conflict select (adversarial pass 1):** `handleConflict` (`handlers/user-sync.ts`)
  offers "Pull remote state to local disk" — with the overwrite confirm pre-answered — and then
  `runUserPull` refuses unconditionally: the same dead-end shape behind an extra untruthful overwrite
  promise. Post-B, `remote-subset` no longer routes here at all (remoteStatus is no longer `conflict`); the
  genuinely-`conflicting` arm drops the impossible pull option and offers truthful actions (push / inspect /
  cancel).

## Regression coverage

- **End-to-end:** branch-bounded subset export → diverged-but-remote-subset topology → user-status +
  session-init recommendation reads non-blocking (the originating induction, automated).
- **Mislisting guard (end-to-end, not unit-only):** a true same-commit-different-blob conflict driven
  through the real inspection path (real temp ref) must classify `conflicting` — this is the case the
  `notes --ref` DWIM mislisting would silently flip to `remote-subset`, and unit-level classifier coverage
  cannot catch it.
- **Join:** union-commit correctness (all local + all pushed entries present; origin tip becomes ancestor);
  contested-pair arms (local-wins under `localIncludesRemote`; join refusal otherwise — refs stay diverged
  and classify `conflicting`); CAS-failure arm leaves prior behavior; compaction-boundary interaction.
- **Classifier:** unit coverage over all four relations, including the true same-commit-different-blob
  conflict.
- **Projection coherence:** on `diverged + remote-subset`, session-init, `arc user status` headline/cause,
  and `arc user sync` dispatch agree (no clean-here-conflict-there split); `conflicting` renders truthful
  guidance on all three with no pull offer.
- **Contracts preserved:** existing pull-refusal contract; `always`-policy conflict arm no longer invokes
  pull.

## Non-goals

- **Pull accepting a content-superset replace** (`local-subset` arm): pull keeps refusing diverged refs;
  only its message improves. A safe-replace enhancement is future work if the case ever occurs live.
- **Marker/lag content-awareness:** partial-push-marker surfaces stay topology-based; A makes their steady
  state coherent. Any deeper rework routes to `user-sync-module-split`.
- **`sync-status.ts` decomposition:** owned by `user-sync-module-split`; this WU only adds the standalone
  classifier module.

## Files

- `packages/arc-framework/src/lib/user-sync/branch-bounded-notes-export.ts` (A — join at adoption)
- `packages/arc-framework/src/lib/user-sync/note-set-relation.ts` (B — new pure classifier)
- `packages/arc-framework/src/commands/user/sync-status.ts` (B — inspection + spine + remoteStatus /
  headline / cause threading + render text)
- `packages/arc-framework/src/handlers/user-sync.ts` (guidance fix — conflict select + dispatch reads the
  relation)
- `packages/arc-framework/src/lib/session-init/recommended-action.ts` (guidance fix + clean-arm surface)
- `packages/arc-framework/src/commands/user/push-fetch.ts` (refusal-message truthfulness)
- `.arc/reference/strategies/project/strategy-user-notes-concurrency.md` (CAS-Guarded invariant sentence
  covers the join)
- `.arc/system/workflows/arc/session-lifecycle/session-init.md` + package mirror (orientation-text touch)
- Integration / session-init / user-sync tests alongside

## Sequencing

Split out from `main`. Originally captured as "after `slug-state-oracle-alignment` ships"; deliberately
pulled forward 2026-07-09 — SSOA paused pre-spec (zero implementation, no overlap risk) because the wedge
went live: notes pushes failing on this machine, a false conflict prompt at every session-init, and FP wave 2
explicitly sequenced behind this fix. Land, merge into FP, re-run the originating handoff-resume induction.
