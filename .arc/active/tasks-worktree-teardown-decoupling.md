# Task List: worktree-teardown-decoupling

- **Design:** `spec-worktree-teardown-decoupling.md`

---

## **Phase 1:** Husk representation and detached-worktree discovery

_Purpose:_ Establish the machine-local primitives that identify a trustworthy husk without widening lifecycle or
roster state.

_Design decisions:_ The optional marker stamp is the only proof that ARC completed a husk transition. Detached
worktrees remain outside the shared roster, and physical removability depends on tree cleanliness plus exact stamped
`HEAD` equality rather than branch ancestry.

### `[x]` **1.1 Add neutral worktree subjects and an optional husk stamp**

- _Goal:_ An ARC-marked worktree can distinguish its creation owner from the exact logical target and branch husked at
  teardown without invalidating legacy WU markers or turning an absent or malformed marker into ARC ownership.

    - `[x]` **1.1.a Add the typed subject and husk schemas with round-trip coverage**
        - Added neutral work-unit, errand, and recordless-branch subjects plus strict creation-ownership and terminal
          stamp validation, retaining legacy-marker compatibility and rejecting contradictory or partial proof.

    - `[x]` **1.1.b Move marker producers onto the neutral creation-subject API**
        - Marker producers now accept typed creation subjects; WU spawn paths dual-write agreeing `createdFor` and
          legacy `wuName` identities, while neutral producers never fabricate WU ownership.

    - `[x]` **1.1.c Add a non-minting marker-extension operation**
        - Added and exported an atomic husk-stamp extension that preserves valid ownership and returns absent or
          malformed markers untouched.

- _Outcome:_ Creation provenance and terminal teardown identity now share one validated marker contract without
  widening ARC ownership at the extension boundary.

### `[x]` **1.2 Expose detached worktree records without widening the shared roster**

- _Goal:_ Teardown fallback and sweep code can inspect registered branchless worktrees, their `HEAD` values, and paths
  while `runWorktreeRoster()` continues to return branched work units only.
    - `[x]` **1.2.a Preserve raw worktree identity in the porcelain parser**
        - The shared porcelain parser now retains each registered path, exact `HEAD`, branch projection, and detached
          status while leaving branched roster entries and branch-to-path helpers unchanged.

    - `[x]` **1.2.b Publish a bounded detached-worktree scan for projection consumers**
        - Added and exported a lifecycle-neutral topology scan with a derived primary flag and explicit failure arm, so
          consumers can distinguish an empty registration set from an unreadable one.

- _Outcome:_ One Git read now supports both the unchanged branched roster contract and exact detached-husk discovery.

### `[x]` **1.3 Define the stamped-husk removability oracle**

- _Goal:_ Every physical husk-removal surface reaches the same conservative decision from marker provenance, worktree
  cleanliness, and exact `HEAD` equality.

    - `[x]` **1.3.a Add a husk-specific cleanup decision**
        - Added and exported a terminal-husk oracle beside the unchanged branched-worktree cleanup gate, with explicit
          removable, blocked, and outside-path dispositions.

    - `[x]` **1.3.b Prove the oracle's fail-closed matrix test-first**
        - Covered exact stamped-`HEAD` success, distinct uncommitted and moved-`HEAD` refusals, and fail-closed handling
          for absent, malformed, and valid-but-unstamped markers without ancestry inputs.

- _Outcome:_ Physical husk removal now has one conservative decision contract shared independently of merge topology.

## **Phase 2:** Safe self-teardown and idempotent replay

_Purpose:_ Replace linked self-removal with the ordered husk transition while preserving the primary, outside-removal,
and already-absent arms.

_Design decisions:_ Husk mode keys only on self-teardown inside the linked-worktree arm. The shipped driver must clear
all clean, preservation, and user-surface gates before detach; the primary arm never husks, and pre-merge abandon/park
drivers remain outside this work unit.

### `[x]` **2.1 Preflight linked self-teardown before any directional mutation**

- _Goal:_ Every self-husk refusal leaves the target fully branched and untouched, with a distinct cause the caller can
  report and resolve or route to outside disposal.
- **Additional Context:** `notes-worktree-teardown-decoupling.md` §§ Implementation loci and Existing-signal pointers.

    - `[x]` **2.1.a Classify the teardown locus inside the shared branch projection**
        - Distinguish linked self-teardown, linked outside teardown, primary/in-place teardown, and already-absent
          projections before calling `reconcileWorktree()`.

        - Consume Task 1.2's single result-bearing worktree inventory for branch mapping and primary identity; reject an
          indeterminate inventory instead of letting the existing lossy empty-map/null helpers select an absent arm.

        - Extract and export the existing path-containment self-teardown predicate from
          `packages/arc-framework/src/lib/work-unit/mutators/reconcile-worktree.ts`; use that one pure predicate in
          both the mutator and the earlier projection classification rather than duplicating path rules.

        - Introduce the internal authorization socket used by husk mode; make it supply both the preservation verdict
          and exact typed terminal subject. Wire the shipped WU driver and recordless exact-branch path without silently
          enabling husking for `abandoned` mode; reserve the `errand` subject for a future errand-worktree driver.

    - `[x]` **2.1.b Run every refusable shipped-driver gate before detach**
        - Reuse the clean check, `assessReapSafety()` preservation verdict, and a complete dry-run of
          `reconcileLinkedIdentityGlobalUserSurfaces()` in the pinned order before any `git switch --detach`, marker
          write, branch delete, user-surface write, or worktree removal. Discover a logical block across the entire
          linked and canonical file set before mutating either surface.

        - Refactor the standard linked-worktree preflight out of `reconcileWorktree()` so outside removal and self-husk
          orchestration share clean, primary-resolution, and user-surface behavior without running any gate twice.
          Extend `TeardownContext` with the narrow worktree/marker seams and clock needed to test this ordering without
          touching the unit test process's real filesystem.

        - After the dry-run clears, run the self-husk reconcile with `signpost: true`: copy durable legacy
          identity-global content to canonical and replace the lingering linked copy with a signpost, while removing
          regenerable caches. Preserve the existing non-signposting mode for outside teardown because physical removal
          immediately follows it.

        - Bind the production seams in `packages/arc-framework/src/handlers/lifecycle.ts` and update unit/integration
          context factories at the same interface boundary.

        - Use the same refreshed base ref that the existing merged-safe delete consumes so the pre-gate and delete leg
          prove the same preservation claim.

    - `[x]` **2.1.c Prove refusal atomicity and unaffected arms test-first**
        - Extend `packages/arc-framework/__tests__/unit/work-unit/verbs/teardown.test.ts` and the focused
          `reconcile-worktree` tests through injected boundary seams, preserving real-git coverage for integration.

        - Build `test-first` (one behavior at a time):
            - Dirty, preservation-unproven, and blocked-user-surface outcomes issue no directional git, marker, linked,
              or canonical writes; a mergeable file ordered before a later blocker leaves both user surfaces unchanged.

            - An unreadable branch-present topology scan rejects before detach or ref cleanup.

            - Husk reconciliation signposts durable legacy files and removes generated caches; outside removal retains
              its existing deletion-mode reconcile behavior.

            - Linked outside teardown still performs full physical removal.

            - Primary/in-place teardown still switches to base and never detaches.

            - Already-absent and out-of-scope `abandoned` behavior remains unchanged.

- _Outcome:_ Teardown now classifies the registered projection once and clears cleanliness, preservation, and complete
  user-surface safety before any self-husk mutation, while outside, primary, absent, and abandoned arms retain their
  prior behavior.

### `[x]` **2.2 Detach, stamp, and reap refs through the shared teardown projection**

- _Goal:_ A cleared linked self-teardown ends with a live detached cwd and a result that distinguishes completed ref
  reaps from a retained-branch notice without claiming physical removal.
- **Additional Context:** `notes-worktree-teardown-decoupling.md` §§ Existing-signal pointers and Rationale detail.

    - `[x]` **2.2.a Detach the target and stamp only proven ARC ownership**
        - Run `git switch --detach` in the target worktree after preflight, capture the proven `HEAD`, and extend a valid
          ownership marker through Task 1.1's non-minting helper with the driver-supplied terminal subject and exact
          branch projection.

        - Leave markerless and malformed worktrees detached but unstamped, preserving their externally-managed status.

        - Treat an operational marker-extension failure after detach as a non-fatal notice and continue the ref reaps as
          an unstamped, externally-managed husk; marker visibility is a backstop, not permission to strand a half-husk.

    - `[x]` **2.2.b Reuse the existing ref-reap and best-effort cleanup legs**
        - Continue through merged-safe local branch deletion, landed-proof-gated remote-head deletion, and fetch-prune
          after detach; do not call `process.chdir` or `git worktree remove` in husk mode.

        - Preserve remote-head and prune failures as notices, and keep the local branch when the delete leg's raced
          safety re-check refuses it.

        - Treat an operational local branch-delete failure after detach as a retained-branch notice: set
          `branchDeleted: false`, skip remote-head deletion, continue best-effort prune, and return the husk result so a
          re-run can retry the surviving ref instead of throwing after the directional transition.

    - `[x]` **2.2.c Emit and verify the husk transition result**
        - Add `husk: { worktreePath: string; subject: WorktreeSubject; branch: string; stamped: boolean; outcome:
          "created" | "already-husked" } | null` to the successful teardown result while retaining
          `worktreeRemoved: null` for physical-removal accounting. Add a typed optional husk-refusal cause (`dirty`,
          `preservation-unproven`, or `user-surfaces`) to rejected results so the handler never parses prose to select
          guidance.

        - Build `test-first` (one behavior at a time):
            - Marked, markerless, and malformed-marker self-husks all retain the live worktree.

            - Detach, optional stamp, and ref reaps occur in the pinned order and produce the husk result.

            - A marker-extension I/O failure produces an unstamped husk plus notice and still reaches every ref reap.

            - An operational local branch-delete failure returns a husk with `branchDeleted: false`, skips remote-head
              deletion, continues prune, and lets a later re-run retry the branch.

            - Remote-head and prune failures retain their existing best-effort notice behavior.

- _Outcome:_ A cleared self-teardown detaches and optionally stamps its live cwd before best-effort ref cleanup, with
  typed reporting for both complete reaps and retained local refs.

### `[x]` **2.3 Resolve and reap detached husks idempotently**

- _Goal:_ A later teardown can find a stamped detached husk whether its local branch is gone or survived a failed reap,
  while a re-run from inside that husk or against an unsafe candidate never deletes the caller's cwd or uncertain work.

    - `[x]` **2.3.a Add marker fallback when no branched worktree maps**
        - Preserve success/failure discrimination in WU-ref enumeration, local-branch resolution, and recordless
          exact-ref existence. An unreadable ref, branch, or detached-worktree scan refuses rather than masquerading as
          already reaped.

        - After resolving any surviving local ref, use Task 1.2's topology snapshot to look for a branched worktree.
          When none maps — whether the ref is absent or survived a failed post-detach reap — scan detached registered
          worktrees and match the requested typed target exactly against `husk.subject`; use `husk.branch` as the exact
          projection and preserve a surviving ref as the retry operand. Never fall back to marker `wuName` or a
          branch-prefix-to-slug conversion for candidate identity.

        - Refuse ambiguous marker matches; keep markerless and malformed worktrees invisible, but let a valid ownership
          marker without a husk stamp reach the shared oracle's explicit missing-stamp refusal rather than converting it
          into a removable candidate.

    - `[x]` **2.3.b Re-enter teardown through the shared husk oracle**
        - Add a stamped-husk-approved removal mode to `reconcileWorktree()` that performs only non-force physical
          removal after the caller-owned oracle, refuses a self-locus, and does not reapply the already-completed
          identity-global user-surface reconcile. From outside the candidate, call it only after Task 1.3 returns
          removable, then continue presence-guarded branch/ref cleanup.

        - From inside the candidate, perform no physical removal, retry presence-guarded ref cleanup when a local branch
          survived, and report the already-husked state with truthful `branchDeleted` accounting. If neither candidate
          nor ref exists, preserve the existing already-reaped idempotent result.

    - `[x]` **2.3.c Cover fallback removal, refusal, and inside-husk replay test-first**
        - Include the recordless marked-husk path so shared-projection placement remains WU-agnostic.

        - Build `test-first` (one behavior at a time):
            - A clean candidate whose `HEAD` matches its stamp is removed from outside.

            - Dirty, moved-`HEAD`, missing-stamp, and ambiguous candidates are refused without removal.

            - A re-run from inside a branchless husk is a no-op; when the local branch survived an earlier operational
              delete failure, the same inside-husk path retries its ref cleanup without removing the cwd.

            - The recordless path follows the same projection.

            - A WU named `foo`, an errand subject `foo`, and exact recordless branch `chore/foo` never match one
              another; a marker created for one subject but stamped for another matches only the terminal stamp.

            - Failed WU-ref enumeration, recordless exact-ref existence, and detached-worktree scan refuse; only a
              successful empty resolution produces the existing already-reaped result.

- _Outcome:_ Exact terminal-subject fallback and the shared cleanup oracle make detached-husk replay safe from both
  outside and inside the candidate without inferring identity from creation ownership or branch prefixes.

### `[x]` **2.4 Report husk transitions and refusal causes at the CLI boundary**

- _Goal:_ `arc teardown` clearly distinguishes a successful husk transition, later physical disposal, and a preflight
  refusal without promising cleanup that did not occur.

    - `[x]` **2.4.a Render marked and externally-managed husk outcomes**
        - Update `packages/arc-framework/src/handlers/lifecycle.ts` to report refs reaped, the disposable detached cwd,
          and deferred physical teardown; mention the primary sweep backstop only when the husk was stamped.

        - When `branchDeleted` is false, report the surviving ref and retry guidance instead of claiming that refs were
          fully reaped.

        - Preserve the existing physical-removal, in-place, already-reaped, remote-notice, prune, and suggestion lines
          on their respective result arms.

    - `[x]` **2.4.b Render distinct atomic-refusal guidance**
        - Surface dirty tree, preservation unproven, and user-surface reconcile blocked as `cannot husk` outcomes that
          explicitly state the worktree remains branched and unchanged.

        - Extend handler/CLI-focused tests without coupling assertions to clack rendering internals.

- _Outcome:_ CLI reporting distinguishes physical removal, disposable marked or external husks, retained refs, and
  atomic preflight refusal without claiming that the current cwd was removed.

## **Phase 3:** Sweep and session-init husk surfaces

_Purpose:_ Make stamped husks discoverable and safely disposable from the primary while giving a session inside one a
clear terminal orientation.

_Design decisions:_ The stale-worktree sweep performs its own detached scan and leaves the shared roster unchanged.
Session-init carries an optional derived advisory payload instead of adding a worktree-state enum value; an unstamped
detached checkout remains ordinary detached `HEAD`.

### `[x]` **3.1 Add detached husks to the stale-worktree sweep**

- _Goal:_ A primary-worktree session surfaces every ARC-stamped husk with the same exact-head removal policy used by
  teardown fallback, including generic recordless husks, without scanning siblings on normal linked-WU resumes.

    - `[x]` **3.1.a Enumerate stamped detached candidates beside the roster arm**
        - Added a primary-only raw topology scan that selects valid stamped detached worktrees, applies the team-mode
          identity boundary, preserves typed terminal subjects, and reports scan failures without losing branched
          results.

    - `[x]` **3.1.b Apply the shared stamped-husk cleanup decision**
        - Split sweep reports into discriminated branched and husk arms, retaining the existing branched checks while
          routing husk cleanliness and exact-`HEAD` evidence through the shared cleanup oracle.

    - `[x]` **3.1.c Cover typed-subject sweep reports test-first**
        - Covered exact, moved, dirty, recordless, errand, identity-filtered, invalid-marker, scan-failure, and
          linked-worktree behaviors through the public sweep result.

- _Outcome:_ Detached topology remains outside the shared roster while session-init can distinguish every trusted
  terminal subject and preserve indeterminate scans as explicit warnings.

### `[x]` **3.2 Derive the current-locus husk advisory in the session-init probe**

- _Goal:_ Session initialization can identify that its detached cwd is a shipped stamped husk and name the completed
  work unit without changing the meaning of the existing `detached-head` sync state.
    - `[x]` **3.2.a Add a pure current-husk derivation**
        - Added an exact-evidence derivation requiring branchless state, a valid WU stamp, matching live `HEAD`, and
          local completed membership; every incomplete or untrusted evidence set returns no advisory.

    - `[x]` **3.2.b Thread the derived payload through status orchestration**
        - Added a linked-and-branch-null-gated `currentHusk` probe and optional session-init slot without widening sync
          state or adding marker/archive reads to ordinary branched resumes.

    - `[x]` **3.2.c Prove advisory specificity test-first**
        - Covered matching and non-matching marker, stamp, head, subject, completion, worktree-locus, sync-state, and
          probe-degradation cases through the pure derivation and status envelope.

- _Outcome:_ A session inside an exact completed-WU husk now receives a narrowly derived terminal identity while all
  other detached checkouts retain the existing generic orientation contract.

### `[x]` **3.3 Render husk cleanup and orientation guidance in session initialization**

- _Goal:_ An agent booting inside a husk receives a clear shipped-pending-teardown terminal frame, while primary-side
  cleanup offers and ordinary detached-head guidance remain accurate.

    - `[x]` **3.3.a Add the husk payload and orientation branch to the shipped template**
        - Documented the optional payload package-first and added a shipped-pending-teardown orientation that points
          outside the current worktree for replay or manual cleanup while retaining generic branchless guidance on
          every non-match.

    - `[x]` **3.3.b Extend stale-worktree rendering for branchless husks**
        - Added kind-aware WU, branch, and errand husk labels plus exact, dirty, and moved-HEAD dispositions without
          changing branched cleanup reasons, externally managed handling, or the offer-only removal contract.

- _Outcome:_ The shipped template and self-hosting instance now render the typed status envelope coherently; their
  only remaining diff is the expected `pm.mode` template conditional.

## **Phase 4:** Integration contract and cross-layer regression coverage

_Purpose:_ Align the shipped integration ceremony with the new terminal state and prove the complete behavior through
real-git and user-facing paths.

_Design decisions:_ Methodology edits flow package-first and stay synchronized with the self-hosting copy. Core logic
is covered test-first in its owning tasks; this phase adds test-after real-git and CLI regression coverage across the
composed seams.

### `[x]` **4.1 Replace the integration tail's session-termination contract with husk outcomes**

- _Goal:_ The integration ceremony treats successful self-teardown as a live terminal state and gives accurate next
  steps for every marked, markerless, retained-ref, and refused outcome.

    - `[x]` **4.1.a Rewrite Step 14's success and refusal variants package-first**
        - Replaced deleted-cwd termination with live stamped/external husk success, surviving-ref retry, and atomic
          dirty, preservation, and user-surface refusal guidance; only stamped husks receive the sweep backstop.

    - `[x]` **4.1.b Align related teardown terminology and validate copy coherence**
        - Distinguished inside detach-and-reap, outside physical removal, and unchanged primary/in-place behavior;
          synchronized identical package and instance copies and retained offer-only exact-stamp fallback rules.

- _Outcome:_ The integration tail now continues in a live terminal session after successful self-teardown and stops
  only on a still-branched refusal that requires resolution.

### `[x]` **4.2 Exercise self-husk, fallback reap, sweep, and session-init paths end to end**

- _Goal:_ Real repositories and public CLI entry points prove the complete teardown lifecycle rather than only its
  isolated decision helpers.

    - `[x]` **4.2.a Extend real-git teardown integration coverage**
        - Added real-Git marked/markerless self-husk, exact-stamp replay/removal/refusal, retained-ref retry, and manual
          delete-plus-prune coverage with branch, registration, marker, and cwd assertions.

    - `[x]` **4.2.b Extend CLI and session-init E2E coverage**
        - Added built-CLI success, external-marker, retained-ref, and atomic-refusal assertions plus paired canonical
          stamped and ordinary detached session-init worktrees.

    - `[x]` **4.2.c Run the cross-layer integration checkpoint**
        - Exercised the touched unit and teardown/session-init cross-layer suites, warm errand open/close integration
          and E2E coverage, source/test type checking, linting, and the package build.

- _Outcome:_ Public CLI and real-repository paths now close the same exact-stamp lifecycle proven by the pure oracles,
  while the current warm errand topology remains branch-restoring and non-husking.

## **Phase 5:** Verification

_Purpose:_ Validate the settled implementation against the design, repository standards, and complete quality-gate
suite.

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Linked shipped teardown leaves the invoking session in a live detached worktree with no physical self-removal,
  for both marked and externally-managed checkouts; normal completion reaps local refs, while an operational delete
  failure reports and preserves the surviving ref for retry.

- `[ ]` Dirty, preservation-unproven, and blocked user-surface preflights leave the worktree branched and unchanged and
  report the specific refusal.

- `[ ]` A valid ownership marker records the proven husk `HEAD` when extension succeeds; extension failure remains a
  reported unstamped external husk and never mints or repairs marker provenance.

- `[ ]` Husk lookup matches a typed terminal subject and exact branch projection, so WU, errand, and recordless targets
  with the same slug text never alias and marker creation ownership never overrides the teardown target.

- `[ ]` Teardown fallback and the stale-worktree sweep remove only clean stamped husks whose live `HEAD` equals the stamp;
  unsafe or ambiguous candidates remain intact and visible.

- `[ ]` A teardown re-run recognizes a detached stamped husk even when its local ref survived, retries that ref without
  deleting an inside-husk cwd, and reports the resulting branch state truthfully.

- `[ ]` Work-unit and recordless husks are discoverable without admitting detached entries into the shared roster.

- `[ ]` Current warm errand close from a linked WU worktree restores the recorded WU branch without rewriting its
  ownership marker or entering husk mode; the shared schema leaves a bounded `errand` driver socket for future
  separately spawned errand worktrees.

- `[ ]` Session initialization distinguishes a canonical shipped husk from an ordinary detached checkout and gives
  accurate disposal guidance.

- `[ ]` The integration ceremony documents live husk success and atomic refusal instead of a deleted-cwd termination.

- `[ ]` Unit, integration, and E2E coverage exercise every self-husk, fallback, sweep, and advisory leg.

- `[ ]` All quality gates pass (tests, linting, type checking, build).

- `[ ]` Ready for integration.
