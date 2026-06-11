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

### `[x]` **1.3 Base-distance recommendation, path-overlap read, and resume surfacing**

- _Goal:_ A resume where the base moved under the branch surfaces an advisory reconcile offer naming the
  distance and any overlapping paths; a base at parity surfaces nothing and never gates.
- _Outcome:_ `inferBaseDistance` (`recommended-action.ts`) maps `remote-ahead` / `diverged` → `surface` with
  the composed advisory ("Base `main` has advanced N commit(s) … overlapping paths … Reconcile?"); parity,
  branch-only-ahead, and degraded → `skip`. The path-overlap read folds into `runBaseDistanceStatus` by
  intersecting the branch-vs-base `--name-only` diffs across the merge-base, computed only when diverged and
  degrading to empty on failure — surfaced as `overlappingPaths` on the result. `run.ts` composes the
  recommendation into the slot (replacing 1.2's neutral default), as an independent advisory orthogonal to the
  worktree and notes pull channels. `session-init.md` (plus the package template, two-copy) gains the Step 2
  advisory-channel note, the Step 6 base-drift surfacing, and the envelope-table row. Verified end-to-end (this
  branch reads `local-ahead` → `skip`).

## **Phase 2:** Append-only supersession backstop + force-push advisory

_Purpose:_ Add the append-only supersession backstop — patch-equal detection in the diverged handler with a
lossless-reset offer — plus an advisory force-push warning. Composes the Phase 1 distance primitive; grounded in
the 2026-06-10 incident.

_Design decisions:_ Patch-equal supersession detection is owned here, not deferred to the sibling — the
diverged-handler mechanism stays coherent in one WU and is grounded in the live incident; the cross-machine
extension stays `cross-machine-sync-coherence`'s. Enforcement is an advisory backstop throughout: it warns and
offers the lossless reset, never auto-runs and never blocks. See `notes-merge-safety-mechanism.md`.

### `[x]` **2.1 Patch-equal supersession detector**

- _Goal:_ A detector identifies when local-ahead commits are patch-equal to a remote prefix (rebased
  equivalents), distinguishing true supersession from genuine divergence.
- **Strategies:** strategy-testing-methodology.md

    - _Outcome:_ `detectSupersession` (`lib/git/supersession.ts`, exported from the git index) runs
      `git cherry origin/<branch> HEAD` — bounded to the local-ahead set by construction — and classifies each
      commit by patch-id (`-` superseded, `+` novel). `superseded` is true only when ≥1 local commit and all are
      patch-equal; partial overlap and genuine divergence both stay false. Read-only and advisory: a bad-ref or
      failed read degrades to not-superseded. `git cherry` chosen over raw `patch-id` / `range-diff` as the
      idiomatic already-upstream check.

### `[x]` **2.2 Diverged-handler downgrade with lossless-reset offer**

- _Goal:_ In session-init's `diverged` handler, a patch-equal supersession downgrades the generic "manual rebase
  or merge needed" to "local commits superseded by rebased equivalents — reset is lossless" and offers
  `git reset --hard origin/<branch>` (offer, never auto-run).

    - _Outcome:_ Threaded the detector result as a **new `supersession` field on the worktree value** (not a
      sibling probe) — it is a finer classification of the same HEAD-vs-`origin/<branch>` ref pair the worktree
      slot already owns, meaningful only in the `diverged` sub-state, so it belongs to that channel.
      `runSessionInitStatus` fires `detectSupersession` once, gated on `diverged` (the common resume path pays
      nothing). `inferWorktree` gained the supersession param and composes the lossless-reset prompt text when
      `superseded`; the workflow's Step 6 diverged arm branches on `worktree.value.supersession` (downgrade vs.
      generic reconcile, both copies of `session-init` synced). Genuine divergence and the empty text are
      unchanged. Integration coverage in `run.test.ts` asserts the downgrade fires on patch-equal and the
      generic reconcile holds on true divergence.

### `[x]` **2.3 Force-push advisory warning**

- _Goal:_ Force-pushing a shared in-flight WU branch whose remote tip is not an ancestor of the local tip
  surfaces an advisory warning first; it never blocks the push.
- **Strategies:** strategy-package-project-sync.md

    - _Outcome:_ New `pre-push` hook (canonical body in both synced copies + `.husky/pre-push` delegate) reads
      the git pre-push stdin protocol and, when a pushed ref's remote tip is not an ancestor of the local tip,
      warns — naming the branch, the remote tip, and the count of commits present only on the remote — then
      `exit 0` always (never blocks). Fast-forward and new-branch (all-zero) refs stay silent. Resolved the
      spec's open tradeoff toward the pre-push hook (raw `git push --force` coverage) over wrapper-only; since a
      hook can't detect "shared with others," it warns on any non-ancestor overwrite (the append-only concern
      applies whenever published history is rewritten). New `hooks.pre_push` toggle wired through `arc-config.yml`,
      `validate-config.sh` (enum + known-keys), `verify-integrity.sh`, and the githooks README. e2e against real
      temp repos covers warn / fast-forward-silent / new-branch-silent / disabled; `shellcheck` clean.
    - _Note:_ The advisory is detection-only by design (loud-not-silent backstop). A config-gated TTY-confirm
      escalation was considered and deferred to `USER-INBOX` (adopter friction: GUI `/dev/tty` hangs,
      routine-rebase noise) — ADR-025's advisory default stands.

### `[x]` **2.4 Wire the pre-push hook into the hook-manager installers**

- _Goal:_ `arc init` / `arc join` activate the 2.3 pre-push hook in the detected hook manager, so adopters get
  the force-push advisory — not just this self-hosting repo (where the delegate was added by hand).
- **Strategies:** strategy-testing-methodology.md

    - _Outcome:_ `lib/hook-integration.ts` now wires `pre-push` across all three strategies — husky file append
      (`<hook> "$@"`, forwarding the remote args), a lefthook `pre-push:` command, and a pre-commit-config hook
      at the `pre-push` stage — each idempotent like the existing two. Added the hook to `init-recipe.json` so it
      ships and `arc init`'s prefix-based chmod (`system/.internal/githooks/`) makes it executable, which the
      bare-path installer lines rely on. Per-manager wiring + idempotency assertions extended; the init
      exec-permission test now covers `pre-push`. Closes the adopter-activation gap surfaced completing 2.3.

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
