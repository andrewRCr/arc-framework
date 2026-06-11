# Task List: merge-safety-mechanism

- **Design:** `spec-merge-safety-mechanism.md`

---

## **Phase 1:** Behind-base distance primitive + probe slot

_Purpose:_ Build the ref-parameterized behind-base distance primitive and wire the session-init base-distance
probe slot — the sub-cohort's shared contract — so resume surfaces behind-base drift advisorily. Foundational:
Phase 2 composes this primitive.

_Design decisions:_ The distance primitive is built general (ref-parameterized, exported) so
`cross-machine-sync-coherence` (local-base subject + cross-machine layer) and `async-merge-lifecycle` (completion
sweep) each extend one buildable rather than forcing a second implementation. The probe slot mirrors the existing
worktree channel end to end. See `notes-merge-safety-mechanism.md` for the grounded file:line seams.

### `[x]` **1.1 Extract and export `countAheadBehindRef`; refactor `runWorktreeSyncStatus` to consume it**

- _Goal:_ A single exported, ref-parameterized distance primitive computes ahead/behind between any two refs,
  and the worktree-sync path consumes it with no duplicated `rev-list` logic remaining.
- _Outcome:_ `countAheadBehindRef(exec, localRef, remoteRef)` exported from `lib/git/worktree-sync.ts` (and the
  git barrel) returning `{ ahead, behind, state }` with `classifyState` folded in; `runWorktreeSyncStatus` is now
  its sole `HEAD...origin/<branch>` caller, no duplicated distance logic. Regression parity held by the existing
  worktree-sync suite. This is the sub-cohort's shared contract — see `notes-merge-safety-mechanism.md`.

### `[x]` **1.2 Wire the base-distance probe slot into the session-init envelope**

- _Goal:_ The session-init envelope carries a base-distance probe slot — HEAD vs `origin/<base>` —
  worktree-channel-shaped (`state` / `ahead` / `behind` / `recommendedAction` / `recommendedPromptText`),
  assembled through the established probe pattern.

    - `[x]` **1.2.a Add the `Probe<T>` field + value type** — `SessionInitBaseDistanceValue` extends the new
      `BaseDistanceStatusResult` with the recommendation pair (mirroring `SessionInitWorktreeValue`); the
      always-present `baseDistance` field lands on `SessionInitProbeResult` and the probe entry on
      `SessionInitProbes` (not the shared `SessionSharedProbes`).

    - `[x]` **1.2.b Register the `SessionInitProbes` entry + fan-out** — `runSessionInitStatus` fans out the
      eager `baseDistance` slot and enriches it worktree-style; new `lib/git/base-distance.ts`
      `runBaseDistanceStatus` computes HEAD vs `origin/<base>` via the Phase 1 `countAheadBehindRef`, bounded-
      fetching the base ref and degrading to `detached-head` / `no-remote` / `remote-unavailable`.

    - `[x]` **1.2.c Bind the probe in the handler** — `handlers/status.ts` binds `baseDistance`, resolving
      `branch.base` from settings as the remote ref and honoring the `session.remote_sync` flag.

- _Outcome:_ The base-distance slot assembles into the real envelope (verified: `local-ahead`/`ahead 8` against
  `origin/main` on this branch). Recommendation fields land **neutral** (`skip`/empty) — the distance + path-
  overlap inference is Task 1.3. The `state` reuses `WorktreeSyncState` for worktree-channel symmetry; base-
  fetch plumbing is kept local to `base-distance.ts` rather than sharing worktree-sync internals (the distance
  primitive is the deliberately-shared buildable). Integration coverage spans base-advanced, parity, and
  degraded (no-remote / detached) assembly.

### `[ ]` **1.3 Base-distance recommendation, path-overlap read, and resume surfacing**

- _Goal:_ A resume where the base moved under the branch surfaces an advisory reconcile offer naming the
  distance and any overlapping paths; a base at parity surfaces nothing and never gates.
- _Note:_ The session-init workflow doc consumes the new slot — add the base-distance channel dispatch and the
  Step 6 resume surfacing alongside the worktree channel.

    - Add a base-distance inference (an `inferWorktree` analog) to the recommendation helper, composing the
      distance + overlap into the channel recommendation.
    - Path-overlap read: compare the branch-vs-base changed-path sets across the merge-base; exact plumbing
      settles at grounding.

    - Build `test-first` (one behavior at a time):
        - base behind (`behind > 0`) yields an advisory recommendation; parity yields skip
        - overlapping changed-path sets flag the overlap; disjoint sets do not
        - composed prompt text reads as the advisory "base moved K, you're N behind, paths overlap → reconcile?"

## **Phase 2:** Append-only supersession backstop + force-push advisory

_Purpose:_ Add the append-only supersession backstop — patch-equal detection in the diverged handler with a
lossless-reset offer — plus an advisory force-push warning. Composes the Phase 1 distance primitive; grounded in
the 2026-06-10 incident.

_Design decisions:_ Patch-equal supersession detection is owned here, not deferred to the sibling — the
diverged-handler mechanism stays coherent in one WU and is grounded in the live incident; the cross-machine
extension stays `cross-machine-sync-coherence`'s. Enforcement is an advisory backstop throughout: it warns and
offers the lossless reset, never auto-runs and never blocks. See `notes-merge-safety-mechanism.md`.

### `[ ]` **2.1 Patch-equal supersession detector**

- _Goal:_ A detector identifies when local-ahead commits are patch-equal to a remote prefix (rebased
  equivalents), distinguishing true supersession from genuine divergence.
- _Note:_ Patch-equality mechanism (`git patch-id` vs `git cherry` vs `git range-diff`) is implementation
  detail — pick the most robust across real rebase shapes during the work; the detection itself is decided.
- **Strategies:** strategy-testing-methodology.md

    - Implement the patch-equality check over the local-ahead commit set; bound to that set, no full-history scan.

    - Build `test-first` (one behavior at a time):
        - local commits patch-equal to a rebased remote prefix → detected as superseded
        - genuinely-divergent local commits (no patch-equal remote) → not superseded
        - partial overlap (some superseded, some novel local) → not a clean supersession

### `[ ]` **2.2 Diverged-handler downgrade with lossless-reset offer**

- _Goal:_ In session-init's `diverged` handler, a patch-equal supersession downgrades the generic "manual rebase
  or merge needed" to "local commits superseded by rebased equivalents — reset is lossless" and offers
  `git reset --hard origin/<branch>` (offer, never auto-run).
- _Note:_ The 2.1 detector result must thread through the envelope (a new field on the worktree value, or a
  sibling probe) for this arm to render the downgrade — `inferWorktree` takes only `(worktree, policy, dirty)` today.

    - Wire the detector into the diverged arm; on supersession, swap the recommendation text and attach the
      reset offer.
    - Genuine divergence keeps the existing generic reconcile surface unchanged.

    - Integration coverage: the downgrade fires on patch-equal; the generic reconcile holds on true divergence.

### `[ ]` **2.3 Force-push advisory warning**

- _Goal:_ Force-pushing a shared in-flight WU branch whose remote tip is not an ancestor of the local tip
  surfaces an advisory warning first; it never blocks the push.
- _Note:_ Hook placement vs. release-wrapper-only is the spec's open tradeoff — a pre-push hook gives complete
  coverage (raw `git push --force`, off-workflow and errand pushes included); settle at build.
- **Strategies:** strategy-package-project-sync.md

    - Home the warning in a pre-push hook (husky delegate + canonical body, both synced copies).
    - Detect the non-ancestor remote-tip condition; warn; exit 0 (advisory, never blocks).

    - Verify e2e (real temp git repos): a non-ancestor shared-branch force-push warns; a fast-forward push is
      silent. Bash → `shellcheck`.

## **Phase 3:** Write-context extensions + foreign-write backstop

_Purpose:_ Extend write-context classification for concurrency (path-surface dimension + `chore/`-awareness) and
add the advisory pre-commit foreign-write backstop; confirm the Phase 1 behind-base detector is the net for
cohort-owned docs. Pairs with Phase 4 under the two-copy package-project hook-sync discipline.

### `[ ]` **3.1 Extend `classifyWriteContext`: path-surface dimension + `chore/`-awareness**

- _Goal:_ The write-context classifier distinguishes which path surface a write targets and is
  `chore/`-branch-aware, so foreign-write reasoning keys on path surface and errand branches alike.
- _Note:_ Path-surface taxonomy cardinality is an open detail — settle the minimal useful enum against the real
  surfaces, including the cohort-doc surface that task 3.3 keys on.
- _Note:_ Path-surface is both an input (the path written) and a verdict (the classified surface); the existing
  `classifyWriteContext` caller (`handlers/housekeep.ts`) must supply the new input — decide required-vs-optional
  so it is not silently broken.
- **Strategies:** strategy-testing-methodology.md

    - Add a path-surface field to `WriteContextInput` and the verdict; the existing `proceed` / `relocate` /
      `refuse` axis is preserved alongside the new dimensions.
    - Call `errandSlugOf(currentBranch)` (pure) inside `classifyWriteContext` — zero new I/O; the branch string
      is already an input.

    - Build `test-first` (one behavior at a time):
        - a write to each distinguished surface yields the right path-surface verdict
        - a `chore/<slug>` current branch resolves its slug inside the classifier
        - the existing single-axis verdicts remain correct under the new dimensions

### `[ ]` **3.2 Pre-commit foreign-write backstop (advisory CHECK + entrypoint)**

- _Goal:_ A new pre-commit check surfaces a foreign-owned write among staged files before it lands — advisory:
  it warns, it never refuses the commit.
- _Approach:_ Reuse `detectForeignArtifactOverlap` behind a new hook-side `npx tsx` entrypoint; the detection
  logic exists, only the hook call path is new.
- **Strategies:** strategy-package-project-sync.md, strategy-testing-methodology.md

    - `[ ]` **3.2.a Hook-side entrypoint** — a new `npx tsx` validator that stage-filters and calls
      `detectForeignArtifactOverlap` (or a thinner staged-files analog, per roster-assembly cost at hook time).

    - `[ ]` **3.2.b Pre-commit CHECK** — a new CHECK after CHECK 18 (cohort-consistency), before the Summary
      block; stage-filter + `npx tsx` pattern. It WARNS, unlike its erroring siblings. Both synced hook copies.

    - Verify e2e: a staged foreign-owned path warns; a clean self-write passes silently.

### `[ ]` **3.3 Confirm behind-base detector covers the cohort doc**

- _Goal:_ The cohort doc — the deliberate exception to per-worktree isolation, with no single owning WU — is
  covered by the Phase 1 behind-base detector as its net, and the path-surface taxonomy recognizes it.

    - Confirm, do not rebuild: the single-owner foreign-write gate is ill-defined for a cohort-owned doc, so the
      behind-base detector is the applicable net.
    - Ensure the cohort-doc surface is present in the task 3.1 path-surface enum.

    - Coverage test: a cohort-doc write is surfaced via the behind-base net, not the single-owner gate.

## **Phase 4:** Merge-commit hook exemption + `integration` footer kind

_Purpose:_ Stop merge commits tripping the commit hooks — exempt two-parent / `MERGE_HEAD` commits from the
conventional-commit and footer rules, and add a standalone `integration` footer kind for single-parent
integration ceremony commits. Both bash hook copies change under package-project sync.

### `[ ]` **4.1 Merge-commit exemption in `commit-msg`**

- _Goal:_ A two-parent / `MERGE_HEAD` commit passes `commit-msg` with no conventional-format or
  `Context:`-footer error.
- **Strategies:** strategy-package-project-sync.md

    - Detect `MERGE_HEAD` (`git rev-parse -q --verify MERGE_HEAD`) immediately after the `hook_enabled`
      early-exit, before Rule 1 → exit 0.
    - Edit both canonical copies (`.arc/system/.internal/githooks/commit-msg` and the package source) under
      package-project sync.

    - Verify e2e (real temp git repo): an actual two-parent merge commit passes; a normal commit still
      validates. Bash → `shellcheck`.

### `[ ]` **4.2 Standalone `integration` footer kind**

- _Goal:_ `Context: integration (...)` validates as a recognized standalone footer kind, covering single-parent
  integration ceremony commits (a squash-merge result, an archival move) that the two-parent exemption misses.
- **Strategies:** strategy-package-project-sync.md

    - Add a new branch in the footer rule for the standalone `integration` kind — distinct from the existing
      `integration` token inside the meta-lifecycle marker set.
    - Edit both canonical copies under package-project sync.

    - Verify e2e: `Context: integration (...)` passes; an unrecognized footer kind still errors.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` `countAheadBehindRef` is exported and ref-parameterized; `runWorktreeSyncStatus` consumes it with no
  duplicated distance logic remaining
- `[ ]` The session-init envelope carries a worktree-channel-shaped base-distance probe slot; a resume with
  `main` advanced under the branch surfaces the advisory reconcile prompt, and a base at parity produces no surface
- `[ ]` A diverged state whose local commits are patch-equal to a remote prefix surfaces the "superseded — reset
  is lossless" downgrade and offers the reset; a genuinely-diverged state still surfaces the generic reconcile
- `[ ]` Force-pushing a shared in-flight branch whose remote tip is not an ancestor surfaces the advisory warning
  and never blocks
- `[ ]` `classifyWriteContext` classifies the path-surface and `chore/`-awareness dimensions; the pre-commit
  backstop flags a staged foreign-owned write (advisory) and passes a clean self-write
- `[ ]` A two-parent / `MERGE_HEAD` commit passes `commit-msg` with no conventional-format or `Context:`-footer
  error; `Context: integration (...)` validates as a recognized kind
- `[ ]` No new hard gate or block is introduced anywhere — every added surface is advisory
- `[ ]` All quality gates pass (tests, linting, type checking); package-project sync clean for the hook edits
- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
