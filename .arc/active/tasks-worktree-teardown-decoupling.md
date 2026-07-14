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

### `[ ]` **1.2 Expose detached worktree records without widening the shared roster**

- _Goal:_ Teardown fallback and sweep code can inspect registered branchless worktrees, their `HEAD` values, and paths
  while `runWorktreeRoster()` continues to return branched work units only.
- **Additional Context:** `notes-worktree-teardown-decoupling.md` § Implementation loci.

    - `[ ]` **1.2.a Preserve raw worktree identity in the porcelain parser**
        - Extend the internal `git worktree list --porcelain` record with `HEAD` and detached-state data instead of
          discarding those fields before the branched roster filter.

        - Define the bounded projection record as path, `HEAD`, nullable branch, detached flag, and a derived primary
          flag so teardown and sweep consumers share one topology snapshot rather than re-reading or inferring identity.

        - Keep the existing branch-to-path helpers and `WorktreeRosterEntry.branch` contract unchanged.

    - `[ ]` **1.2.b Publish a bounded detached-worktree scan for projection consumers**
        - Expose a read-only helper from `packages/arc-framework/src/lib/git/worktree-roster.ts` that returns the raw
          registered-worktree fields needed by teardown and the sweep without resolving metas. Return an explicit
          success/failure discriminant so consumers never collapse an unreadable scan into an empty candidate set.

        - Export the helper, result, and record types through `packages/arc-framework/src/lib/git/index.ts`; teardown
          fallback must refuse/surface an indeterminate read while a successful empty result remains idempotent.

        - Build `test-first` (one behavior at a time):
            - Detached stanzas retain path and `HEAD` identity.

            - Branched stanzas remain available to existing helpers with no roster-shape change.

            - An unreadable worktree list degrades safely and never fabricates candidates.

### `[ ]` **1.3 Define the stamped-husk removability oracle**

- _Goal:_ Every physical husk-removal surface reaches the same conservative decision from marker provenance, worktree
  cleanliness, and exact `HEAD` equality.

    - `[ ]` **1.3.a Add a husk-specific cleanup decision**
        - Add the shared pure decision beside `decideWorktreeCleanup()` in
          `packages/arc-framework/src/lib/git/worktree-cleanup.ts`; do not reinterpret the existing branched-worktree
          merge gate.

        - Treat a valid husk stamp, clean tree, and `HEAD === husk.sha` as removable; distinguish dirty and moved `HEAD`
          refusals; treat absent, malformed, or unstamped markers as outside the stamped-husk path.

        - Export the husk decision function and its input/result types from `packages/arc-framework/src/lib/git/index.ts`
          beside the existing worktree-cleanup API.

    - `[ ]` **1.3.b Prove the oracle's fail-closed matrix test-first**
        - Keep ancestry and patch-containment signals out of the oracle so squash-merged husks do not become permanent
          false negatives.

        - Build `test-first` (one behavior at a time):
            - A clean stamped husk at the stamped `HEAD` is removable.

            - Dirty tree and moved `HEAD` produce distinct blocked decisions.

            - Missing stamp, malformed marker, and markerless inputs remain outside the trusted husk path.

## **Phase 2:** Safe self-teardown and idempotent replay

_Purpose:_ Replace linked self-removal with the ordered husk transition while preserving the primary, outside-removal,
and already-absent arms.

_Design decisions:_ Husk mode keys only on self-teardown inside the linked-worktree arm. The shipped driver must clear
all clean, preservation, and user-surface gates before detach; the primary arm never husks, and pre-merge abandon/park
drivers remain outside this work unit.

### `[ ]` **2.1 Preflight linked self-teardown before any directional mutation**

- _Goal:_ Every self-husk refusal leaves the target fully branched and untouched, with a distinct cause the caller can
  report and resolve or route to outside disposal.
- **Additional Context:** `notes-worktree-teardown-decoupling.md` §§ Implementation loci and Existing-signal pointers.

    - `[ ]` **2.1.a Classify the teardown locus inside the shared branch projection**
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

    - `[ ]` **2.1.b Run every refusable shipped-driver gate before detach**
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

    - `[ ]` **2.1.c Prove refusal atomicity and unaffected arms test-first**
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

### `[ ]` **2.2 Detach, stamp, and reap refs through the shared teardown projection**

- _Goal:_ A cleared linked self-teardown ends with a live detached cwd and a result that distinguishes completed ref
  reaps from a retained-branch notice without claiming physical removal.
- **Additional Context:** `notes-worktree-teardown-decoupling.md` §§ Existing-signal pointers and Rationale detail.

    - `[ ]` **2.2.a Detach the target and stamp only proven ARC ownership**
        - Run `git switch --detach` in the target worktree after preflight, capture the proven `HEAD`, and extend a valid
          ownership marker through Task 1.1's non-minting helper with the driver-supplied terminal subject and exact
          branch projection.

        - Leave markerless and malformed worktrees detached but unstamped, preserving their externally-managed status.

        - Treat an operational marker-extension failure after detach as a non-fatal notice and continue the ref reaps as
          an unstamped, externally-managed husk; marker visibility is a backstop, not permission to strand a half-husk.

    - `[ ]` **2.2.b Reuse the existing ref-reap and best-effort cleanup legs**
        - Continue through merged-safe local branch deletion, landed-proof-gated remote-head deletion, and fetch-prune
          after detach; do not call `process.chdir` or `git worktree remove` in husk mode.

        - Preserve remote-head and prune failures as notices, and keep the local branch when the delete leg's raced
          safety re-check refuses it.

        - Treat an operational local branch-delete failure after detach as a retained-branch notice: set
          `branchDeleted: false`, skip remote-head deletion, continue best-effort prune, and return the husk result so a
          re-run can retry the surviving ref instead of throwing after the directional transition.

    - `[ ]` **2.2.c Emit and verify the husk transition result**
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

### `[ ]` **2.3 Resolve and reap detached husks idempotently**

- _Goal:_ A later teardown can find a stamped detached husk whether its local branch is gone or survived a failed reap,
  while a re-run from inside that husk or against an unsafe candidate never deletes the caller's cwd or uncertain work.

    - `[ ]` **2.3.a Add marker fallback when no branched worktree maps**
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

    - `[ ]` **2.3.b Re-enter teardown through the shared husk oracle**
        - Add a stamped-husk-approved removal mode to `reconcileWorktree()` that performs only non-force physical
          removal after the caller-owned oracle, refuses a self-locus, and does not reapply the already-completed
          identity-global user-surface reconcile. From outside the candidate, call it only after Task 1.3 returns
          removable, then continue presence-guarded branch/ref cleanup.

        - From inside the candidate, perform no physical removal, retry presence-guarded ref cleanup when a local branch
          survived, and report the already-husked state with truthful `branchDeleted` accounting. If neither candidate
          nor ref exists, preserve the existing already-reaped idempotent result.

    - `[ ]` **2.3.c Cover fallback removal, refusal, and inside-husk replay test-first**
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

### `[ ]` **2.4 Report husk transitions and refusal causes at the CLI boundary**

- _Goal:_ `arc teardown` clearly distinguishes a successful husk transition, later physical disposal, and a preflight
  refusal without promising cleanup that did not occur.

    - `[ ]` **2.4.a Render marked and externally-managed husk outcomes**
        - Update `packages/arc-framework/src/handlers/lifecycle.ts` to report refs reaped, the disposable detached cwd,
          and deferred physical teardown; mention the primary sweep backstop only when the husk was stamped.

        - When `branchDeleted` is false, report the surviving ref and retry guidance instead of claiming that refs were
          fully reaped.

        - Preserve the existing physical-removal, in-place, already-reaped, remote-notice, prune, and suggestion lines
          on their respective result arms.

    - `[ ]` **2.4.b Render distinct atomic-refusal guidance**
        - Surface dirty tree, preservation unproven, and user-surface reconcile blocked as `cannot husk` outcomes that
          explicitly state the worktree remains branched and unchanged.

        - Extend handler/CLI-focused tests without coupling assertions to clack rendering internals.

## **Phase 3:** Sweep and session-init husk surfaces

_Purpose:_ Make stamped husks discoverable and safely disposable from the primary while giving a session inside one a
clear terminal orientation.

_Design decisions:_ The stale-worktree sweep performs its own detached scan and leaves the shared roster unchanged.
Session-init carries an optional derived advisory payload instead of adding a worktree-state enum value; an unstamped
detached checkout remains ordinary detached `HEAD`.

### `[ ]` **3.1 Add detached husks to the stale-worktree sweep**

- _Goal:_ A primary-worktree session surfaces every ARC-stamped husk with the same exact-head removal policy used by
  teardown fallback, including generic recordless husks, without scanning siblings on normal linked-WU resumes.

    - `[ ]` **3.1.a Enumerate stamped detached candidates beside the roster arm**
        - Extend `packages/arc-framework/src/lib/session-init/stale-worktree-sweep.ts` with a sweep-local scan over Task
          1.2's raw records; do not admit detached entries into `WorktreeRosterResult`.

        - Select detached worktrees only when a valid marker carries a husk stamp. Thread the resolved identity and
          `team.mode` into the sweep and apply the roster's existing ownership boundary through marker
          `spawningIdentity`: in team mode, omit another identity's husks; solo mode remains a pass-through.

        - Derive labels from `husk.subject`: check `completed/` membership only for `work-unit`, use generic
          shipped-husk wording for exact `branch`, and keep the reserved `errand` arm distinct without claiming WU
          completion. Never label from the marker's creation owner.

        - Preserve raw-scan failure as a sweep warning while still reporting any resolved branched candidates; never
          silently equate an indeterminate detached scan with a successful empty scan.

    - `[ ]` **3.1.b Apply the shared stamped-husk cleanup decision**
        - Resolve live `HEAD` and cleanliness, then map through Task 1.3's oracle: clean exact-head husks are removable;
          dirty or moved-head husks are blocked and never auto-removed.

        - Keep the existing branched shipped-worktree marker, user-surface, and merge checks unchanged; do not reapply
          ancestry or identity-global user-surface gates to the stamp-keyed husk arm.

        - Evolve `StaleWorktreeReport` into a discriminated `branched` / `husk` union: preserve `branch` on the legacy
          arm, and carry the typed terminal subject plus nullable completed-WU identity on the branchless arm so
          renderers never guess logical identity or a display label from optional fields.

    - `[ ]` **3.1.c Cover typed-subject sweep reports test-first**
        - Confirm linked-worktree sessions still skip the sibling sweep entirely.

        - Build `test-first` (one behavior at a time):
            - Exact-`HEAD` and moved-`HEAD` WU husks report removable and blocked respectively.

            - A dirty stamped husk reports blocked and is never removed.

            - A stamped recordless husk receives generic naming.

            - A synthetic stamped errand subject remains distinct from WU completion and receives neutral terminal
              naming, keeping the reserved arm executable before its producer ships.

            - Another identity's stamped husk is excluded in team mode and remains eligible in solo mode.

            - Markerless and malformed worktrees are excluded while existing branched candidates stay unchanged.

            - A failed raw detached scan appends a warning while preserving every resolved branched report.

### `[ ]` **3.2 Derive the current-locus husk advisory in the session-init probe**

- _Goal:_ Session initialization can identify that its detached cwd is a shipped stamped husk and name the completed
  work unit without changing the meaning of the existing `detached-head` sync state.
- **Additional Context:** `notes-worktree-teardown-decoupling.md` § Implementation loci.

    - `[ ]` **3.2.a Add a pure current-husk derivation**
        - Add `packages/arc-framework/src/lib/session-init/current-husk-advisory.ts` and combine a branch-null current
          worktree (the `detached-head` state, plus the disabled-sync `skipped` arm), its valid husk-stamped marker, live
          `HEAD` equality, a stamped `work-unit` subject, and local `completed/` membership into an optional advisory
          value.

        - Return no advisory for a markerless, malformed, unstamped, moved-`HEAD`, or non-completed worktree so those
          sessions retain the ordinary detached-head surface.

    - `[ ]` **3.2.b Thread the derived payload through status orchestration**
        - Add a linked-and-branch-null-gated `currentHusk` probe and optional
          `Probe<{ worktreePath: string; subject: { kind: "work-unit"; name: string } } | null>` result across
          `packages/arc-framework/src/commands/status/types.ts`, `run.ts`, and `handlers/status.ts`; do not add another
          `WorktreeSyncStatusResult.state` value or make the common branched-resume path pay for marker/archive reads.

        - Document the optional payload as an interim derived orientation signal that a future locus record may
          supersede.

    - `[ ]` **3.2.c Prove advisory specificity test-first**
        - Build `test-first` (one behavior at a time):
            - A matching stamped completed WU emits the derived advisory.

            - Markerless, malformed, unstamped, moved-`HEAD`, and non-completed worktrees emit no advisory.

            - Probe degradation and every non-detached arm omit the optional envelope payload safely.

### `[ ]` **3.3 Render husk cleanup and orientation guidance in session initialization**

- _Goal:_ An agent booting inside a husk receives a clear shipped-pending-teardown terminal frame, while primary-side
  cleanup offers and ordinary detached-head guidance remain accurate.

    - `[ ]` **3.3.a Add the husk payload and orientation branch to the shipped template**
        - Edit `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-init.template.md` first, then
          apply the corresponding targeted edit to `.arc/system/workflows/arc/session-lifecycle/session-init.md`.

        - Document the optional probe payload and render `shipped — pending physical teardown`: re-run teardown from
          outside or delete/prune manually. Suppress the generic detached-head warning only on this derived arm.

    - `[ ]` **3.3.b Extend stale-worktree rendering for branchless husks**
        - Render stamped WU, generic recordless, and reserved errand subjects with removable or blocked dispositions
          without assuming every report has a branch or claiming WU completion for non-WU subjects; name dirty and
          moved-`HEAD` husk blockers separately while preserving the legacy uncommitted, user-surface, and unmerged
          branch reasons.

        - Keep all removal actions offer-only and preserve the externally-managed behavior of markerless worktrees.

## **Phase 4:** Integration contract and cross-layer regression coverage

_Purpose:_ Align the shipped integration ceremony with the new terminal state and prove the complete behavior through
real-git and user-facing paths.

_Design decisions:_ Methodology edits flow package-first and stay synchronized with the self-hosting copy. Core logic
is covered test-first in its owning tasks; this phase adds test-after real-git and CLI regression coverage across the
composed seams.

### `[ ]` **4.1 Replace the integration tail's session-termination contract with husk outcomes**

- _Goal:_ The integration ceremony treats successful self-teardown as a live terminal state and gives accurate next
  steps for every marked, markerless, retained-ref, and refused outcome.

    - `[ ]` **4.1.a Rewrite Step 14's success and refusal variants package-first**
        - Update `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md`, then the
          matching `.arc/` Framework copy, removing the claim that self-teardown necessarily terminates the session.

        - Describe disposable-husk success, include the sweep backstop only for a marked husk, preserve surviving-ref
          notice and retry guidance when local deletion fails, and describe dirty/preservation/user-surface refusal as
          still-branched atomic failure.

    - `[ ]` **4.1.b Align related teardown terminology and validate copy coherence**
        - Update adjacent Step 14 assumptions that still equate teardown with physical worktree removal while keeping
          pre-merge abandon/park and outside-removal instructions unchanged.

        - Verify the package and instance workflow copies differ only where templating or project configuration
          requires it, then run scoped Markdown linting.

### `[ ]` **4.2 Exercise self-husk, fallback reap, sweep, and session-init paths end to end**

- _Goal:_ Real repositories and public CLI entry points prove the complete teardown lifecycle rather than only its
  isolated decision helpers.

    - `[ ]` **4.2.a Extend real-git teardown integration coverage**
        - Add marked and markerless linked self-husk cases to `packages/arc-framework/__tests__/integration/teardown.test.ts`
          covering detached `HEAD`, ref deletion, retained directory, stamp/no-mint behavior, and notice handling.

        - Cover primary-side fallback removal, dirty and moved-`HEAD` refusal, branchless and surviving-ref inside-husk
          replay, and bare directory deletion followed by `git worktree prune` leaving no local ref or registered
          worktree residue.

    - `[ ]` **4.2.b Extend CLI and session-init E2E coverage**
        - Assert the marked/markerless success, surviving-local-ref notice, and preflight-refusal messages through
          `packages/arc-framework/__tests__/e2e/teardown.e2e.test.ts`.

        - Add a stamped completed husk and an ordinary unstamped detached worktree to
          `packages/arc-framework/__tests__/e2e/session-init.e2e.test.ts`, proving the advisory appears only for the
          canonical husk.

    - `[ ]` **4.2.c Run the cross-layer integration checkpoint**
        - Run the touched unit suites plus targeted teardown integration, teardown E2E, and session-init E2E tests.

        - Run the errand open/close integration and E2E coverage, including warm entry from a linked WU worktree, to
          confirm current in-place errand topology still restores its recorded return branch and never stamps or husks
          the WU-owned worktree.

        - Run source and test type checking plus the package build before entering the final verification workflow;
          resolve every regression in the owning task rather than weakening assertions.

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
