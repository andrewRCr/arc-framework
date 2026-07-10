# Task List: Notes Export State Coherence

- **Design:** `spec-notes-export-state-coherence.md`

---

## **Phase 1:** Note-set relation classifier

_Purpose:_ Land the pure five-relation classifier and the entry-set exclusions both halves consume — the
classification substrate (Decision 3) and the compaction-boundary exclusions (Decision 4) as shared, unit-testable
set math, before any consumer wires in.

_Design decisions:_ The classifier is a standalone pure module (`lib/user-sync/note-set-relation.ts`) taking two
entry sets with their manifests, so `user-sync-module-split` can relocate it freely and the `sync-status.ts`
monolith does not deepen.
Entry listing reads `git ls-tree -r <sha>` with notes-fanout path flattening — never `git notes --ref` against a
`refs/arc-sync-temp/…` ref, which DWIM-mislists as empty. See `notes-notes-export-state-coherence.md`
§ Implementation notes for the fallback mechanism if `ls-tree` flattening proves awkward.

### `[x]` **1.1 Sha-addressed note-entry listing helper**

- _Goal:_ Any commit-ish — including an inspection temp ref at `refs/arc-sync-temp/…` — yields an accurate
  `(annotated commit, blob)` entry list, immune to the `git notes --ref` DWIM mislisting.
- _Outcome:_ Relocated the strict SHA-addressed `ls-tree` lister into `notes-ref.ts`, preserving fanout flattening
  and manifest exclusion while keeping compaction's prior empty-list degradation local to its existing call site.

### `[x]` **1.2 `note-set-relation.ts` five-relation classifier**

- _Goal:_ Two sides classify into exactly one of
  `remote-subset | local-subset | equal | mixed-uncontested | conflicting`, with manifest-pruned pairs
  excluded from the relation set — so classification is truthful even against a legacy or scratch-clone
  remote carrying already-pruned entries.
- _Outcome:_ Added the pure five-way classifier and a shared generation-aware pruned-pair resolver, using
  deduplicated pair sets and commit-indexed contest detection across mixed, conflicting, and empty-side cases.

## **Phase 2:** Producer-side safe-join

_Purpose:_ Replace the `supersedesLocal === false` skip in `adoptPushedTipIntoLocalRef`
(`branch-bounded-notes-export.ts`) with the union join (Decision 2), so deliberate branch-bounded export residue
reconciles at the source and the refs converge instead of staying permanently diverged.

_Design decisions:_ The join is a new shared-ref mutator — `strategy-user-notes-concurrency.md`'s mutator
checklist governs (CAS-guarded against `priorLocalTip`, best-effort, never degrades the already-successful push).
The union commit is built deterministically with plumbing (`mktree` / `commit-tree` with two parents), never
`git notes merge` — `buildSnapshotCommit` in `compaction.ts` is the in-repo pattern. Contested entries resolve by
ancestry: `localIncludesRemote` → local-wins; otherwise any contested pair refuses (today's skip stands). Zero
contested pairs → the join proceeds regardless of ancestry.

### `[x]` **2.1 Two-parent union commit builder**

- _Goal:_ A deterministic union commit exists whose tree carries all local + all pushed entries, whose parents
  are the prior local tip and the pushed export tip, with the manifest resolved by compaction generation and
  pruned pairs excluded from the union tree.
- _Outcome:_ Added a deterministic two-parent union builder with sorted local-wins entries, authoritative
  generation-based manifest selection, pruned-pair filtering, and an exposed tree id for the later no-op guard.

### `[x]` **2.2 Join arm in `adoptPushedTipIntoLocalRef`**

- _Goal:_ Divergence from branch-bounded export residue self-heals at the paired push: on any zero-contested or
  ancestry-resolvable topology where the union adds content, local ancestry gains the pushed tip (`refState`
  reads `local-ahead`) and the false-conflict surface clears; unions that would add nothing no-op instead of
  minting redundant commits.

    - `[x]` **2.2.a Join dispatch and refusal rule**
        - Threaded plan-time ancestry and optional stdin plumbing into adoption; zero-contested trees join,
          ancestry-resolvable contests use local-wins, and unresolvable contests preserve the diverged refs.

    - `[x]` **2.2.b No-op guard**
        - Already-ancestral pushed tips and identical uncontested union trees no-op; repeated paired pushes
          retain the first join tip without minting further canonical-ref commits.

    - `[x]` **2.2.c CAS and failure containment**
        - The union moves the canonical ref only through an expected-old update; concurrent advances, missing
          plumbing, strict listing failures, and invalid manifests preserve the successful remote push.

- _Outcome:_ Branch-bounded export now self-heals mixed and ancestry-resolvable residue with a two-parent join,
  while no-op, conflict, compaction, read-failure, and concurrent-save paths remain lossless and bounded.

### `[x]` **2.3 Mutator-checklist review and strategy invariant update**

- _Goal:_ The join's write discipline is recorded: `strategy-user-notes-concurrency.md`'s CAS-Guarded
  branch-bounded-adopt invariant sentence covers the ancestry-resolvable join, and the checklist passes.

- _Outcome:_ Updated the project strategy's CAS-Guarded invariant after confirming the join writes only the
  canonical ref, adds no temp-ref lifetime, preserves both sides on read/CAS failure, and leaves status read-only.

## **Phase 3:** Relation threading across projections

_Purpose:_ Compute the content relation once at ref inspection and thread it through every projection
(Decisions 3 and 5), so session-init, `arc user status`, and `arc user sync` agree — truthful vocabulary,
reconciles-at-next-push guidance on zero-contested relations, and no pull offer that cannot succeed.

_Design decisions:_ The 5-state `UserSessionInitState` enum does not grow; the relation rides the envelope.
Spine mapping: `diverged + remote-subset` → spine `clean` (the collapse `local-ahead` already gets), raw
topology + relation preserved. Every other relation stays on the `conflict` spine value; rendering keys on
contested-or-not.

### `[x]` **3.1 Diverged-arm relation computation at inspection**

- _Goal:_ `inspectUserSyncRefsDetailed` (`commands/user/sync-status.ts`) carries a content relation on every
  diverged result, derived from both locally-readable trees — a handful of extra reads, fired only when
  already diverged.

- _Outcome:_ Diverged inspection now classifies the local tip against the fetched temp ref with both compaction
  manifests, omitting the relation on strict-read failure and on every non-diverged arm.

### `[ ]` **3.2 Spine mapping and envelope threading**

- _Goal:_ `diverged + remote-subset` reads as spine `clean` everywhere the spine is consumed, rendered with the
  same informational vocabulary `local-ahead` gets; all other relations keep the `conflict` spine value with the
  relation available to renderers.

    - `computeUserSyncSpine` / `computeUserSyncSpineState` accept the relation; thread through
      `UserSyncSpine`, `buildUserSessionInitStatusResult`, and the session-init envelope types
      (`commands/user/types.ts`, `commands/status/types.ts`).

    - `shouldPromptToPull` drops its conflict term (`state === "remote-ahead" || state === "conflict"`,
      `sync-status.ts` spine assembly) — the conflict arm stops promising pull on every relation; only
      `remote-ahead` prompts.

    - Conflict-arm `summary` / `detailLines` / `actionHint` key on contested-or-not: zero-contested relations
      state expected residue reconciling at the next paired push (no pull direction); `conflicting` states
      that genuine divergence cannot be resolved by pull and directs to `arc user status`.

    - Build `test-first` (one behavior at a time):
        - `diverged + remote-subset` → spine `clean`, `refState: "diverged"` + relation preserved on the result
        - `mixed-uncontested` / `local-subset` / `equal` → spine `conflict`, reconcile guidance, no pull promise
        - `conflicting` → spine `conflict`, truthful no-pull guidance

### `[ ]` **3.3 Status, sync dispatch, and pull-offer guidance**

- _Goal:_ On every non-`conflicting` relation, no surface offers or auto-fires a pull that
  `runUserPull` would refuse; `conflicting` renders truthful guidance on all three projections.

    - `[ ]` **3.3.a `arc user status` headline and cause lines**
        - `deriveRemoteStatus` / `determineUserStatusHeadline` / cause rendering read the relation:
          `remote-subset` renders existing `local ahead` vocabulary with an export-residue cause line;
          `mixed-uncontested` renders divergence-reconciles-at-next-push; `conflicting` keeps conflict
          vocabulary with truthful guidance.
        - Extend `UserStatusHeadline` with one truthful member for conflict-spine zero-contested
          divergence (e.g. `notes diverged (reconciling)`) — the union's own doc contract extends rather
          than overloads, no existing member is truthful for this shape, and `notes conflict` is exactly
          the banned vocabulary. The spine enum stays fixed.
        - The relation-aware inventory covers every conflict-arm render site: also
          `determineUserStatusAction`'s conflict arm, `renderActionOrientedHeadline`, and
          `renderCauseAwareActionHeadline` — not only the headline/cause pair.
        - The export-residue cause line renders from the relation at the rendering site — a divergence
          _shape_ fact, not a _why_ attribution. `inferUserSyncCause` (`lib/user-sync/inference.ts`) and
          its five-value taxonomy stay untouched.

    - `[ ]` **3.3.b `arc user sync` dispatch and conflict select**
        - Thread the relation onto `UserSyncState` via `inspectUserSyncState` so the handler layer can read
          it. `decideSyncAction` (`handlers/user-sync.ts`) routes only `conflicting` to `handleConflict`;
          the conflict-spine zero-contested relations (`local-subset` / `equal` / `mixed-uncontested`)
          return a new guidance-only action — info lines stating the divergence reconciles at the next
          paired push, then outro; no select, no destructive action (explicit `arc user push` remains the
          manual path). `remote-subset` is not on this arm: it follows local-ahead semantics and dispatches
          `push` (viable — the push path's `git notes merge` reconcile handles the non-fast-forward). The
          conflict select drops the impossible "Pull remote state" option and offers
          push / inspect / cancel.

    - `[ ]` **3.3.c Session-init recommendation and refusal-message truthfulness**
        - `inferUser` (`lib/session-init/recommended-action.ts`): the conflict spine never prompts or
          pulls on any relation — pull refuses diverged refs, so the arm reduces to `surface` under every
          policy (`always` included), with the relation selecting the surfaced guidance. The conflict
          branches of `composeNotesPromptText` and `composeCombinedPrompt` become unreachable — delete
          them rather than leaving dead vocabulary. The clean-arm informational surface covers
          `remote-subset`. `runUserPull`'s `refused-diverged` copy renders in `reportUserFetchOutcome`
          (`handlers/shared.ts`) — `push-fetch.ts` only returns the typed kind; the wording is shared with
          `arc user fetch`, so the edit covers both operations. It states that pull refuses diverged refs
          and directs to inspection — pull behavior itself unchanged (Scope boundary: no content-superset
          replace).

    - Build `test-first` (one behavior at a time — `decideSyncAction` / `inferUser` units):
        - Conflict spine → `surface` under every policy (`always` included), never `pull`, never `prompt`
        - Zero-contested relations → no pull offer on any projection's composed text
        - `conflicting` → `handleConflict` route with pull option absent; zero-contested → the
          guidance-only action, never the conflict select

### `[ ]` **3.4 Session-init workflow doc wording**

- _Goal:_ The session-init workflow's clean-arm collapse note names the `remote-subset` case, and orientation
  guidance names the zero-contested reconciles-at-next-push wording — no new dispatch arms.

    - The package copy is the template variant: edit the framework section in
      `session-init.template.md` (package source, `arc/system/workflows/arc/session-lifecycle/`) and sync
      the project instance `.arc/system/workflows/arc/session-lifecycle/session-init.md` per the two-copy
      discipline. The wording states expected divergence reconciling at the next paired push, without
      conflict vocabulary.

    - The Step 6 informational arm keys on `clean` + `refState == "local-ahead"`; widen its condition to
      also fire on `clean` + `refState == "diverged"` with the `remote-subset` relation, rendering the same
      informational line — a dispatch-condition edit on the existing arm, still no new arms. Without it the
      collapsed case renders nothing at orientation.

## **Phase 4:** End-to-end regressions

_Purpose:_ The spec's mandated not-unit-only regressions, driven through the real inspection path and real refs —
the mislisting failure shape is invisible to unit-level classifier coverage, and projection coherence only proves
out end-to-end.

### `[ ]` **4.1 End-to-end regression suite**

- _Goal:_ The originating induction and its evolved live topology both read non-blocking on every projection,
  a true conflict driven through the real temp-ref path classifies `conflicting`, and the three projections
  never split clean-here-conflict-there.
- _Approach:_ Integration tier with real refs — reuse the existing repo + bare-remote fixture pattern
  (`addBareRemote` in `branch-bounded-notes-export.test.ts`; `multi-clone.test.ts` for cross-clone shapes).
  That satisfies "end-to-end" here (the real inspection path, real temp refs); no CLI-process e2e tier or
  new harness.
- **Additional Context:** `notes-notes-export-state-coherence.md` § Implementation notes — live
  mixed-uncontested fixture material (609 remote-only / 31 local-only / 0 contested, manifest on one side only)
  and the listing-mechanism regression requirement.

    - `[ ]` **4.1.a Originating induction (remote-subset)**
        - Branch-bounded subset export → diverged-but-remote-subset topology → `arc user status` and
          session-init recommendations read non-blocking (spine `clean`, informational line, no pull offer).

    - `[ ]` **4.1.b Mixed-uncontested full cycle**
        - Both-sides-unique, zero-contested fixture — a representative miniature of the live 2026-07-09
          _shape_ (entries unique to each side, zero contested, compaction manifest on one side only), at
          handful scale, not the live cardinality — classifies `mixed-uncontested`, renders
          reconciles-at-next-push guidance with no pull offer on all three projections, then unions cleanly
          at the next paired push — origin tip becomes ancestor, all entries preserved, false-conflict
          surface clears.

    - `[ ]` **4.1.c Mislisting guard**
        - A true same-commit-different-blob conflict driven through the real inspection path (real
          `refs/arc-sync-temp/…` temp ref) classifies `conflicting` — the regression that fails if entry
          listing silently returns empty.

    - `[ ]` **4.1.d Projection coherence sweep**
        - Per relation, session-init envelope, `arc user status` headline/cause, and `arc user sync`
          dispatch agree; `conflicting` renders truthful guidance on all three with no pull offer;
          the pull-refusal contract stands (`refused-diverged` unchanged).

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Branch-bounded subset export → diverged-but-remote-subset topology reads non-blocking on user-status
  and session-init (originating induction, end-to-end)
- `[ ]` A both-sides-unique, zero-contested topology classifies `mixed-uncontested`, renders
  reconciles-at-next-push guidance with no pull offer on all three projections, and unions cleanly at the next
  paired push with origin tip as ancestor and all entries preserved
- `[ ]` A true same-commit-different-blob conflict driven through the real inspection path (real temp ref)
  classifies `conflicting` (mislisting guard, end-to-end)
- `[ ]` Union commit carries all local + all pushed entries with origin tip as ancestor; contested arms follow
  the rule (local-wins under ancestry; refusal otherwise with refs diverged and classified `conflicting`);
  CAS-failure arm leaves prior behavior; compaction-boundary interaction holds
- `[ ]` After the first join, repeated paired pushes with unchanged notes mint no further commits on the local
  canonical ref
- `[ ]` Differing compaction manifests neither read as contested nor block the join; the union tree carries the
  newer-generation manifest
- `[ ]` A remote ref at an older compaction generation carrying manifest-pruned pairs neither re-inflates the
  local ref at join nor shifts classification
- `[ ]` Classifier unit coverage spans all five relations, including the true same-commit-different-blob conflict
- `[ ]` On every non-`conflicting` relation, session-init, `arc user status` headline/cause, and `arc user sync`
  dispatch agree — no clean-here-conflict-there split; `conflicting` renders truthful guidance on all three with
  no pull offer
- `[ ]` The pull-refusal contract stands; the `always`-policy conflict arm no longer invokes pull
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
