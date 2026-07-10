# Spec (`outline`): notes-export-state-coherence

- **Origin:** [internal] — USER-INBOX capture drained at stub creation (2026-07-09); surfaced during
  `finalize-parallelism` wave 1 when a cross-WU handoff-resume reproduced the false-conflict surface live.

- **Purpose:** Treat branch-bounded notes projection divergence as expected state, not a pull/replace conflict.
  Two-sided fix: the producer reconciles expected residue at the source (safe-join), and ref inspection
  classifies remaining divergence by content relation so session-init tells the truth and never offers
  pull/replace for divergence it cannot safely resolve.

---

## Problem / Context

Parallel work (worktrees, cross-machine resume) makes user-notes refs diverge in expected, content-compatible
ways, but the sync layer reports every divergence as a data conflict and recommends an action that cannot
succeed:

1. **The residue is deliberate.** After a branch-bounded subset export, `adoptPushedTipIntoLocalRef`
   (`branch-bounded-notes-export.ts`) refuses to advance the local canonical ref when
   `supersedesLocal === false` — adopting would drop omitted notes. The refs stay graph-diverged by design;
   the deferred "union reconcile for that case" is this WU.
2. **The classifier is ancestry-blind.** `computeUserSyncSpineState` (`sync-status.ts`) maps `diverged` →
   `conflict` purely from ref topology. No content comparison exists, though both trees are locally readable
   at the diverged arm and the relation is cheap set math.
3. **The recommendation cannot succeed.** `inferUser` offers "Pull?" on `conflict` — and under
   `session.init_pull.notes: always` auto-fires `arc user pull`, which answers `refused-diverged`
   unconditionally (`push-fetch.ts`). A guaranteed dead-end under `always`; misleading under `prompt`.
4. **Operational drag until reconciled.** While refs diverge, notes pushes refuse, partial-push markers
   accumulate, and the false conflict fires at every session-init.

**Observed topologies (live, 2026-07-09).** The originating induction was a strict local-superset (every remote
`(annotated commit, blob)` pair byte-identical locally). By the time of spec authoring the same machine's live
state had evolved to **mixed-uncontested** — 609 remote-only entries, 31 local-only, zero contested pairs (the
remote side additionally carrying a ~10,800-commit bulk history from burn-in scratch clones). Both topologies
are reconcilable without loss, and both currently misreport as a pull-able conflict. The classification below
must name both.

Landing before `finalize-parallelism` wave 2 is the sequencing driver: FP merges this in and re-runs the
originating handoff-resume induction.

## Decision(s)

1. **Both halves land in this WU.** A alone leaves divergence from other causes (CAS-failure residue, crash
   between push and adopt, legacy machines, manual surgery, true conflicts) misreporting as pull-able; B alone
   renames the residue benign but leaves refs permanently diverged with standing marker noise. FP is the GA
   gate for concurrent work units; read-side robustness is in its spirit.

2. **A — producer-side safe-join.** At the `supersedesLocal === false` arm of `adoptPushedTipIntoLocalRef`,
   replace the skip with a join: a two-parent commit on the local canonical notes ref (parents: prior local
   tip + pushed export tip) whose tree carries the union of both entry sets.
    - **Contested-entry rule:** the plan-phase refusal only scans branch-reachable entries, so an omitted
      commit whose remote blob differs can reach the join contested. Resolve by ancestry: when
      `localIncludesRemote`, every remote blob is an ancestor state of local's — local-wins and the join
      proceeds. When `localIncludesRemote === false` and any contested pair exists, the join refuses (today's
      skip stands; B classifies `conflicting`). A genuine cross-machine conflict is never folded silently.
      **Zero contested pairs → the join proceeds regardless of ancestry** — the mixed-uncontested topology
      unions cleanly.
    - The union is computed from both trees read at join time; the join commits against `priorLocalTip`
      (compare-and-swap, as fast-forward adoption does). A failed CAS leaves today's behavior; best-effort —
      a failed join never degrades the already-successful push.
    - **No-op guard:** the join fires only when it changes something — skip when the pushed tip is already in
      local ancestry, and when the union tree equals the current local tree (adopt no-ops instead). The push
      flow's no-op arm (`remoteTip === target.tip`) and every post-join re-push with unchanged notes hit this
      guard; without it, each paired push while omitted notes persist would mint a structurally redundant
      merge commit — monotonic notes-ref growth, the pathology the adoption path exists to prevent.
    - Build the union commit deterministically with plumbing (`commit-tree` over the staged union), not
      `git notes merge` — avoids notes-merge worktree state.
    - Steady state: after the join, local ancestry contains the remote tip, so `refState` reads `local-ahead`
      and the false-conflict surface clears. While notes on branch-unreachable commits persist (sibling
      worktrees, unpushed work), subsequent paired pushes re-enter the `supersedesLocal === false` arm and
      no-op under the guard; the ref fully fast-forwards once those notes become branch-reachable or prune.

3. **B — content-relation classification at ref inspection.** `inspectUserSyncRefsDetailed` already fetches
   the remote notes ref to a local temp ref; on the diverged arm, derive
   `contentRelation ∈ {remote-subset, local-subset, equal, mixed-uncontested, conflicting}` by set math over
   `(annotated commit, blob)` pairs — a handful of extra git reads (two tree listings plus the two
   compaction-manifest reads the exclusions need), only when already diverged.
    - **Listing mechanism:** the inspection temp ref lives at `refs/arc-sync-temp/…`, which
      `git notes --ref` DWIM-expands and lists empty — naive listing classifies every divergence
      `remote-subset`. Read entries via `git ls-tree -r <sha>` with notes-fanout path flattening.
    - **`mixed-uncontested` (each side holds unique entries, zero contested pairs):** truthful interim
      reporting — orientation and status render the divergence as expected residue that reconciles at the
      next paired push, with no pull offer. It does not collapse to clean (local genuinely lacks entries the
      remote has) and does not render conflict vocabulary.
    - **Spine mapping:** `diverged + remote-subset` → spine `clean` (the collapse `local-ahead` already
      gets), raw topology + relation preserved on the envelope, rendered as the same informational orientation
      line `local-ahead` gets. Every other relation stays on the `conflict` spine value — the 5-state
      `UserSessionInitState` enum does not grow; the relation rides the envelope and selects the rendered
      vocabulary and guidance, keyed on contested-or-not: the zero-contested relations (`local-subset`,
      `equal`, `mixed-uncontested`) render reconciles-at-next-paired-push guidance with no pull offer (A's
      join proceeds on any zero-contested topology, so each self-heals), while `conflicting` alone renders
      conflict vocabulary.
    - **All projections thread the relation:** `deriveRemoteStatus`, the status headline + cause lines, and
      `decideSyncAction` read topology independently today; left unthreaded, session-init would say clean
      while `arc user status` headlines a false conflict. The relation rides the spine so every projection
      agrees: `remote-subset` renders existing `local ahead` vocabulary with an export-residue cause line;
      `mixed-uncontested` renders divergence-reconciles-at-next-push guidance; `conflicting` keeps conflict
      vocabulary with truthful guidance. The spine enum stays fixed; the typed `UserStatusHeadline` union
      gains at most one truthful member for conflict-spine zero-contested divergence (its own contract
      extends the union rather than overloading an existing term — no existing member truthfully names
      "diverged, reconciles at next push", and `notes conflict` is exactly the vocabulary this relation
      must not render).
    - **Classifier shape:** a standalone pure module (`lib/user-sync/note-set-relation.ts`) taking two entry
      lists, so `user-sync-module-split` relocates it freely — `sync-status.ts`'s monolith does not deepen.
    - **Session-init workflow doc:** the session-init workflow's clean-arm collapse note (and its package
      mirror) gains the `remote-subset` case, and the orientation guidance names the zero-contested
      reconciles-at-next-push wording — a small orientation-text touch, no new dispatch arms.

4. **Compaction-boundary rule.** Two parts, both honoring the existing "never union-merge across a compaction
   boundary" discipline (`strategy-user-notes-concurrency`; `isPairPrunedByManifest` in `compaction.ts`):
    - **Manifest blob:** fixed-path non-SHA entries (the compaction manifest,
      `.arc-user-notes-compaction-manifest.json`) are excluded from the relation entry set — a differing
      manifest blob is never a contested pair. At join, the union tree resolves the manifest by compaction
      generation (newer generation wins, reusing the comparison `adoptRemoteCompactionIfNewer` performs;
      local-wins on tie or absence). Set math over annotated-commit keys otherwise assumes SHA-shaped paths.
    - **Pruned pairs:** pairs the newer-generation side's pruned manifest records are excluded from both the
      relation entry set and the union tree — never counted as unique or contested entries, never
      resurrected. This closes the unaligned direction `adoptRemoteCompactionIfNewer` does not cover (it
      no-ops when the remote generation is older): a legacy or scratch-clone remote carrying pruned pairs
      must not re-inflate a compacted local ref through the join, nor skew classification toward
      `local-subset` / `mixed-uncontested` on the strength of already-pruned entries.

5. **Shared guidance fix** (either half would still require it):
    - The `conflict` arm stops promising pull/replace — detail/summary/prompt text states that genuine
      divergence cannot be resolved by pull and directs to `arc user status` inspection.
    - `session.init_pull.notes: always` on `conflict` degrades to surface — never auto-fires the refusing
      pull.
    - `arc user sync`'s conflict select (`handleConflict`, `handlers/user-sync.ts`) drops the impossible
      "Pull remote state" option on the genuinely-`conflicting` arm and offers truthful actions
      (push / inspect / cancel). Post-B, only `conflicting` routes here — the zero-contested relations
      render the reconcile guidance instead.

## Scope boundary (No-gos)

- **Pull accepting a content-superset replace** (`local-subset` arm): pull keeps refusing diverged refs; only
  its message improves. A safe-replace enhancement is future work if the case occurs live.
- **Marker/lag content-awareness:** partial-push-marker surfaces stay topology-based; A makes their steady
  state coherent. Deeper rework routes to `user-sync-module-split`.
- **`sync-status.ts` decomposition:** owned by `user-sync-module-split`; this WU adds only the standalone
  classifier module.
- **Synthetic burn-in remote residue:** the bulk history and synthetic entries burn-in scratch clones pushed
  to the shared remote notes ref are `finalize-parallelism` teardown's to clean, not this WU's. This WU must
  merely classify and reconcile such topologies truthfully.

## Consequences & Risks

- **A is a new shared-ref mutator.** `strategy-user-notes-concurrency`'s mutator checklist applies (lock
  coverage, CAS, compaction-boundary interaction with `adoptRemoteCompactionIfNewer`). Its CAS-Guarded
  "adopts … only when the temp tree is a content superset" invariant sentence updates to cover the
  ancestry-resolvable join.
- **Misclassification risk concentrates in listing.** If entry listing silently returns empty (the DWIM
  mislisting shape), true conflicts classify as subsets and the join could fold a genuine conflict. Mitigated
  by the `ls-tree` mechanism decision and the end-to-end regression below — unit-level classifier coverage
  cannot catch it.
- **Interim surface for `mixed-uncontested` is "wait for the next push", not "clean".** Accepted: local
  genuinely lacks remote entries until the join lands, so a clean read would over-promise; the cost is one
  informational line per init until the next paired push.
- **Join races are benign by construction.** A concurrent `arc user save` fails the CAS and leaves today's
  behavior (reconcile at next push); no retry loop ships.

## Success Criteria

- **Originating induction (end-to-end):** branch-bounded subset export → diverged-but-remote-subset topology →
  user-status and session-init recommendations read non-blocking.
- **Mixed-uncontested (end-to-end):** a both-sides-unique, zero-contested topology classifies
  `mixed-uncontested`, renders reconciles-at-next-push guidance with no pull offer on all three projections,
  and unions cleanly at the next paired push (origin tip becomes ancestor; all entries preserved).
- **Mislisting guard (end-to-end, not unit-only):** a true same-commit-different-blob conflict driven through
  the real inspection path (real temp ref) classifies `conflicting`.
- **Join correctness:** union commit carries all local + all pushed entries with origin tip as ancestor;
  contested arms behave per the rule (local-wins under ancestry; refusal otherwise, refs stay diverged and
  classify `conflicting`); CAS-failure arm leaves prior behavior; compaction-boundary interaction holds.
- **Join no-op guard:** after the first join, repeated paired pushes with unchanged notes mint no further
  commits on the local canonical ref (the no-op arm and ancestor/identical-union cases skip).
- **Manifest exclusion:** differing compaction manifests neither read as contested nor block the join; the
  union tree carries the newer-generation manifest.
- **Pruned-pair non-resurrection:** a remote ref at an older compaction generation carrying manifest-pruned
  pairs neither re-inflates the local ref at join nor shifts classification — pruned pairs are invisible to
  both the relation set and the union.
- **Classifier unit coverage:** all five relations, including the true same-commit-different-blob conflict.
- **Projection coherence:** on every non-`conflicting` relation, session-init, `arc user status`
  headline/cause, and `arc user sync` dispatch agree — no clean-here-conflict-there split; `conflicting`
  renders truthful guidance on all three with no pull offer.
- **Contracts preserved:** the pull-refusal contract stands; the `always`-policy conflict arm no longer
  invokes pull.

## Open items

- Exact plumbing sequence for the union commit (`read-tree` / `mktree` staging shape feeding `commit-tree`) —
  implementation detail; the deterministic-plumbing decision itself is settled.
