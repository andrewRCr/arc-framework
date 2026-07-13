# Task List: slug-state-oracle-alignment

- **Design:** `spec-slug-state-oracle-alignment.md`

---

## **Phase 1:** Foreign-write advisory — reproduce, trace, fix

_Purpose:_ Settle the spec's one open producing-path question first (reproduce-first, per the settled design):
land failing reproductions of both observed divergence directions, trace the feeding channel, then fix at the
traced site. Independent of the composed-index work, so it fronts the phase order.

_Design decisions:_ The producing path is deliberately not pre-committed — the fix task (1.3) stays
mechanism-open until 1.2's trace lands. The committed probe is already three-dot with frozen SHAs
(`committedMatches`, `lib/git/foreign-artifact-detection.ts`), so the defect enters through what feeds the
primitive; the five candidate channels are enumerated in `notes-slug-state-oracle-alignment.md` § Problem 2.

### `[x]` **1.1 Reproduce both observed divergence directions as failing tests**

- _Goal:_ Both observed advisory misfires reproduce deterministically in the test suite — red against current
  code — so the trace has live subjects and the fix inherits its regression suite for free.
    - `[x]` **1.1.a Induce the behind-base direction**
        - Added a real-repo regression holding local `main` behind a fetched `origin/main`; the hook composition
          path attributed a base-only work-unit path to the sibling before the fix.

    - `[x]` **1.1.b Reproduce the forward direction (own-artifact commit flagged as sibling overlap)**
        - Reproduced the same feed defect while staging the originating WU's own meta: a sibling inheriting the
          fresher base was incorrectly reported as its author.

- _Outcome:_ Both observed directions fail through the production composition path with stable oracle snapshots,
  proving the regression suite exercises the defective feed rather than a hand-built detector fixture.

### `[x]` **1.2 Trace the producing channel feeding the three-dot primitive**

- _Goal:_ The producing path is identified from the live reproductions and recorded, so the fix lands at the
  source rather than a symptom site — and the spec's open item closes with evidence.

- _Outcome:_ Stable candidate snapshots and agreeing uncommitted probes isolated the defect to the base feed:
  local `main` sat behind fetched `origin/main`, causing three-dot diffs to classify fresher base changes as
  sibling-authored. The evidence is recorded in `notes-slug-state-oracle-alignment.md` § Problem 2.

### `[x]` **1.3 Fix the traced producing path and lock regressions**

- _Goal:_ The advisory emits no divergence-shaped lists in either observed direction while genuine authored
  overlap still reports — fail-quiet and over-report are both defects here.
    - `[x]` **1.3.a Fix at the traced site**
        - `detectStagedForeignWrites` now prefers `origin/<base>` when available and safely falls back to the
          configured local base when no remote-tracking ref resolves.

    - `[x]` **1.3.b Flip the 1.1 reproductions green and add the genuine-overlap guard**
        - Both false-positive directions now pass, while a sibling-authored target path remains a reported
          overlap through the same real-repo composition path.

- _Outcome:_ The advisory distinguishes inherited base changes from authored sibling changes without weakening
  genuine overlap detection; focused integration and unit coverage passes across all three cases.

## **Phase 2:** Composed lifecycle index — shared helper

_Purpose:_ Build the one composition point every consumer swaps onto: tree index + in-flight-oracle candidates
merged under existing precedence, returning a plain `LifecycleIndex` plus the derivation's quality facts.

_Design decisions:_ Composition happens above `buildLifecycleIndex`, which stays pure and checkout-local (the
locality no-go). Quality facts ride alongside the index because both existing merge stages silently drop them:
`inFlightEntryToCandidate` (`lib/status/project-view.ts`) nulls unknown-state entries and
`buildLifecycleIndexFromRecords` (`lib/work-unit/lifecycle-index.ts`) skips unknown-state records — dispatch
needs those signals for Phase 4's indeterminacy keying. `resolveComposedLifecycleIndex` is the working name;
settle the final name at implementation (spec Open item).

### `[x]` **2.1 Build the composed-index resolver over tree + oracle candidates**

- _Goal:_ One call yields a lifecycle index carrying both tree truth and in-flight-oracle truth merged under
  the existing `mergeProjectReadinessRecords` precedence, in `localOnly` or live mode — so consumers gain
  sibling sight by swapping construction sites only (SC7).
    - `[x]` **2.1.a Settle module placement, the shared composition core, and the public signature**
        - Added `resolveProjectReadinessComposition` as the shared record core and
          `resolveComposedLifecycleIndex` as its lifecycle projection. The result retains slug worktree paths,
          live membership tips, reachability, and cwd-relative tree paths while oracle pseudo-paths stay opaque.

    - `[x]` **2.1.b Implement the resolver behaviors**
        - Locked tree parity, local and live oracle modes, unreachable fallback, source precedence, parked
          overlays, and stale-plan dedupe through the shared project-view composition machinery.

- _Outcome:_ Project rendering and lifecycle consumers now derive from one tree-plus-oracle record composition;
  no parallel merge logic can drift between the project view and slug/dispatch truth.

### `[x]` **2.2 Surface derivation quality facts past the two silent drop stages**

- _Goal:_ Consumers can read oracle warnings, degraded/unknown-state entries, and indeterminacy marks
  alongside the composed index — a dropped or degraded entry is distinguishable from an absent slug, which is
  what keeps Phase 4's "indeterminate, never absent" rule implementable.

- _Outcome:_ Native warnings, whole-result marks, and slug-keyed entry state/marks survive beside the index,
  including unknown-state entries the index omits. The destructive-edge indeterminacy code set is exported and
  tested against benign shadow warnings, worktree degradation, and whole/per-entry snapshot disagreement.

## **Phase 3:** Slug query and occupancy — composed adoption

_Purpose:_ Swap the read-only query surfaces onto composed truth: `arc status <slug>` in `localOnly` mode with
a positive `--fetch` live upgrade, state-derived `occupied` over the composed index, display enrichment, and
the conditional ready-mine adoption.

_Design decisions:_ The slug query defaults `localOnly` with a positive `--fetch` opt-in — deliberately
inverting the `--project` view's live-default, because the slug query is a hot-path interactive primitive that
must not expose every call to a network timeout. The asymmetry is a recorded conscious call, documented at the
flag (spec Decision 3). `localOnly` blindness to never-fetched siblings is accepted (no-go).

### `[x]` **3.1 Swap `resolveSlugQuery` and `isOccupied` onto the composed index**

- _Goal:_ From a checkout other than the WU's own, `arc status <live-sibling-slug>` reports the sibling's
  in-flight state and `occupied: true` via local remote-tracking refs — no false `planned` (SC1) — with
  `resolveSlugQuery` and `isOccupied` running unchanged over the swapped index (SC7).

    - `[x]` **3.1.a Swap the slug-query handler's construction site**
        - `handlers/status.ts` now resolves the composed lifecycle index in local-only mode before passing its
          index into the unchanged `resolveSlugQuery` projection.

    - `[x]` **3.1.b Lock the cross-checkout truth with integration coverage**
        - Temp-repo integration coverage queries planning, active, and integrating siblings through local
          remote-tracking refs from another checkout and asserts state-derived occupancy.

- _Outcome:_ Slug resolution now sees sibling in-flight truth without changing the query or occupancy contracts.

### `[x]` **3.2 Add `--fetch` live upgrade with warn-and-degrade rendering**

- _Goal:_ The operator can opt one slug query into live membership; a degraded oracle renders the existing
  warn-and-degrade pattern and never blocks the query.

    - `[x]` **3.2.a Register the flag and plumb live mode**
        - The status command exposes positive `--fetch`, documents the slug/query-view default asymmetry, and
          upgrades only `opts.fetch === true`; subprocess coverage locks the Commander pairing behavior.

    - `[x]` **3.2.b Render quality facts on the query output**
        - Human and JSON query renders now expose deduplicated oracle warnings as handler-layer enrichment,
          including the live-query unreachable fallback, without widening `SlugStateQuery`.

- _Outcome:_ Slug reads stay network-free by default, while explicit live reads prune stale membership and
  degrade to local truth with visible quality facts rather than blocking the query.

### `[x]` **3.3 Enrich query output with sibling worktree path when the roster knows it**

- _Goal:_ A locally-checked-out sibling's query names its worktree path — display enrichment only; the
  `occupied` contract stays state-derived (spec Decision 4).

- _Outcome:_ The composed roster's path appears as `worktree` in human output and `worktreePath` in JSON, while
  occupancy remains derived solely from lifecycle state.

### `[~]` **3.4 Adopt composed index in `buildReadyMineSlice` only if it falls out free**

- _Goal:_ The read-only ready-mine render takes composed-`localOnly` truth iff the adoption is a pure
  construction-site swap at its caller; otherwise the defer is recorded and `dischargeDepEdges` stays
  tree-only either way (spec Decision 5 — defer is a sanctioned outcome).

- _Outcome:_ Deferred because the current user-view assembly would run the oracle twice for no material verdict
  gain. The rationale is recorded in `notes-slug-state-oracle-alignment.md`; `dischargeDepEdges` remains tree-only.

## **Phase 4:** Start dispatch — live oracle and indeterminacy

_Purpose:_ Give the destructive edge live composed truth: both minting arms treat quality-degraded reads as
indeterminate (confirm interactively, refuse under `--yes` / non-TTY), and live-only candidates are expanded
before either arm may fire.

_Design decisions:_ "Possibly stale" keys on oracle quality, not reachability alone (spec Decision 3). The two
minting arms are symmetric: graduate fires on a `planned` read and create-new on a `nonexistent` read — a live
sibling started fresh elsewhere reads `nonexistent` from every other checkout, so both channels can mint a
second branch. The refuse arms, `resume`, and `--here` cold-start (an explicit user override) keep their
current routing. Confirm reuses the handler's existing `skipConfirm` / `confirmStep` plumbing
(`handlers/start.ts`).

### `[x]` **4.1 Wire `resolveStartDispatch` to the live composed oracle**

- _Goal:_ Dispatch resolves over composed live truth, so a live sibling's slug routes to the refuse arms from
  any checkout with a healthy oracle — the silent second mint's primary kill (SC2), with
  `resolveStartDispatch` itself unchanged (SC7).

    - `[x]` **4.1.a Swap the start handler's construction site to the composed helper in live mode**
        - `handlers/start.ts` now feeds the unchanged dispatcher from live composed truth and retains the
          result's native quality channels beside the index.

    - `[x]` **4.1.b Lock refuse-arm behavior from a foreign checkout**
        - Real-repository integration coverage proves planning, active, and integrating sibling branches all
          reach their directed refuse arms from another checkout without minting a duplicate branch.

- _Outcome:_ Start dispatch now consumes the same lifecycle truth as project views and slug queries while
  retaining its unchanged pure routing contract.

### `[x]` **4.2 Key both minting arms on oracle quality — confirm or refuse indeterminate**

- _Goal:_ Neither minting arm fires silently on degraded truth: an indeterminate target confirms
  interactively, and under `--yes` / non-TTY it refuses with direction — fail-safe over fail-convenient
  (SC2). A dropped or degraded target entry reads indeterminate, never absent.
- _Outcome:_ A single upstream target-quality gate protects create-new and graduate equally: clean reads retain
  current behavior, interactive acceptance proceeds through one prompt, and `--yes` / non-TTY fail safely with
  direction. Refuse, resume, and explicit `--here` cold-start routing remain outside the gate.

### `[x]` **4.3 Expand live-only candidates before minting (bounded fetch + meta classification)**

- _Goal:_ A branch present in live membership but absent locally is expanded — bounded fetch, then meta
  classification — before either minting arm may fire, so a never-fetched live sibling cannot read
  `nonexistent` and mint a duplicate (SC3).
- _Outcome:_ `deriveInFlight` now offers opt-in expansion inside its agreed-input path, bounded-fetches
  `liveRefs − local remote-tracking`, and classifies every success at its pinned membership SHA. Fetch or
  expanded-tree failures mark the result indeterminate; consumers that do not opt in perform no expansion.

## **Phase 5:** Prospective lifecycle precedence

_Purpose:_ Make staged lifecycle transitions win for their own branch: the composed-input model accepts the
staged record as the checked-out branch's authoritative candidate (both ref forms), so an archival commit's
fresh render drops its own row and the pre-commit assert accepts it.

_Design decisions:_ The override is scoped to the checked-out branch's own candidates only — covering both ref
forms (the worktree-sourced local head and its remote-tracking twin `origin/<branch>`, which
`dedupeWorkUnitCandidates` / `candidateSourceRank` would otherwise let win at the same pre-commit tip).
Siblings keep normal oracle precedence, and `completed/` is never globally ranked above active candidates — a
global flip would hide genuine live branches (spec Decision 6). Hook/CLI parity is by construction via the
shared render in `lib/status/roadmap-regeneration-assert.ts`.

### `[x]` **5.1 Extend the composed-input model with the own-branch prospective override**

- _Goal:_ During a transition commit, the staged lifecycle record substitutes for the checked-out branch's
  oracle candidates (both ref forms), so the staged state is authoritative for that branch while every sibling
  ranks normally (SC5).
- _Outcome:_ The composition input accepts a prospective current branch and suppresses only that branch's
  post-dedupe oracle entry when the staged tree carries its slug. Activation, integration, and archival states
  win locally; sibling precedence and warnings remain intact, and no-transition renders stay byte-identical.

### `[x]` **5.2 Lock archival-window rendering: own row drops, siblings unaffected, hook/CLI parity**

- _Goal:_ An archival commit's fresh staged render drops the archived WU's own In Flight row and the
  pre-commit assert accepts it — the four-times-observed carried-row failure is dead, and remediation output
  matches the hook byte-for-byte (SC5).

    - `[x]` **5.2.a End-to-end archival-commit coverage**
        - A real staged archival sweep now drops its own Integrating row, retains an Active sibling, and passes
          the ROADMAP regeneration assert.

    - `[x]` **5.2.b Hook/CLI byte-parity regression**
        - Activation, integration, and archival fixtures assert byte-identical shared renders through the
          trailing-newline wrapper; the real handler and hook paths also match during an archival window.

- _Outcome:_ The staged CLI remediation is now exactly the content the hook accepts throughout lifecycle
  transitions, closing the carried-row failure without changing sibling rows.

## **Phase 6:** Residue classification and `remoteOnly` truth

_Purpose:_ Stop silently dropping or misreporting branch/record residue: no-record/no-meta branches and
branch-less errand records surface as classified entries, and `remoteOnly` means absent locally (no worktree
and no local branch).

### `[x]` **6.1 Classify no-record/no-meta branches and branch-less errand records as visible residue**

- _Goal:_ A merged errand head with a closed record — or any branch carrying neither record nor meta — surfaces
  as a classified residue entry with branch-derived identity instead of vanishing from every cleanup surface
  (SC6); degraded-but-visible behavior is preserved when remote or record reads fail (spec Decision 7).

    - `[x]` **6.1.a Emit residue classification from the derivation layer**
        - `DeriveInFlightResult.residue` now carries branch/record cleanup facts separately from materializable
          entries, with branch-derived identity, structured reasons and warnings, and degraded/indeterminate
          marks when record or live-membership reads cannot establish complete truth.

    - `[x]` **6.1.b Surface residue on the session-init cleanup consumers**
        - Session-init threads residue through the shared oracle and errand-state probe, preserves locally
          observed residue when live discovery is unavailable, and gives the cleanup workflow an advisory-only
          rendering contract. Errand-record reads now expose completeness instead of collapsing failures to absence.

- _Outcome:_ Branch and errand-record residue is visible from derivation through the session-init envelope,
  including a real CLI cleanup probe; base remains excluded and degraded reads retain marked evidence.

### `[ ]` **6.2 Require local-branch absence for `remoteOnly` materialize candidacy**

- _Goal:_ `remoteOnly` means absent locally — no local worktree **and** no local branch — so a local
  unoccupied branch (the live `plan/slug-state-oracle-alignment` case) is a distinct state and never enters
  the cross-machine materialize candidate set (SC6).

    - Build `test-first` (one behavior at a time):
        - A branch with a local head but no worktree resolves `remoteOnly: false` (the `locationOf` read gains
          the local-branch check from the ref snapshot already in hand).
        - That branch is excluded from `findMaterializableWorkUnits` and the errand materialize candidates.
        - A genuinely remote-only branch (no worktree, no local head) still qualifies as a candidate.
        - Existing worktree-checked-out behavior unchanged (`remoteOnly: false`, path populated).
        - Downstream consumers of the flipped semantic are audited, not just the materialize filters: the
          errand-state sweep's merge-check ref and timestamp reads (`remoteOnly ? origin/<branch> : <branch>`
          in `lib/session-init/errand-state.ts`) now judge a local unoccupied errand branch against its local
          head — assert the classification stays truthful for an unpushed local errand branch — and the
          `arc active in-flight` render's previously unreachable "no worktree" arm becomes live.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` From a checkout other than the WU's own, `arc status <live-sibling-slug>` reports the sibling's
  in-flight state and `occupied: true` in `localOnly` mode via local remote-tracking refs
- `[ ]` `arc start <live-sibling-slug>` never silently mints a second branch through either arm: refuse arms
  fire on a healthy oracle; indeterminate signals confirm interactively and refuse under `--yes` / non-TTY
- `[ ]` A live-only (never-fetched) candidate is expanded on the start-dispatch path before either minting arm
  may fire; a failed expansion fetch yields indeterminate, not absent
- `[ ]` The foreign-write advisory is clean in both observed directions (forward and induced behind-base),
  reproduced pre-fix and locked by regressions
- `[ ]` An archival commit's fresh render drops the archived WU's own In Flight row; the pre-commit assert
  accepts it; hook and CLI remediation output is byte-identical; sibling rows and the activation/integration
  transitions are covered by regressions
- `[ ]` Merged no-record/no-meta branches surface as classified residue; a local branch with no worktree never
  appears in the materializable candidate set
- `[ ]` `resolveSlugQuery`, `isOccupied`, and `resolveStartDispatch` consume the composed index without
  interface changes — composition is a construction-site swap
- `[ ]` All quality gates pass (tests, linting, type checking, build)
- `[ ]` Ready for integration
