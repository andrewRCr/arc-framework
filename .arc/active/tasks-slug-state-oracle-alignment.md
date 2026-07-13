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

### `[ ]` **1.1 Reproduce both observed divergence directions as failing tests**

- _Goal:_ Both observed advisory misfires reproduce deterministically in the test suite — red against current
  code — so the trace has live subjects and the fix inherits its regression suite for free.
- _Approach:_ New integration-tier suite (real temp git repos, no mocked git; precedent:
  `__tests__/integration/in-flight-reshuffle.test.ts`) driving the hook's own composition path —
  `runActiveInFlight` → `projectInFlightToOverlapRoster` → `detectStagedForeignWrites` with the returned
  snapshot — never hand-built roster/snapshot fixtures, which could sidestep the defective feed channel the
  trace must find. Assert on the structured `ForeignArtifactDetectionResult.overlaps`, not rendered advisory
  lines. Target paths must classify as the work-unit surface (`selectForeignWriteCandidates` filters
  everything else before detection).
- **Additional Context:** `notes-slug-state-oracle-alignment.md` § Problem 2 — reproduction anchors and
  candidate channels

    - `[ ]` **1.1.a Induce the behind-base direction**
        - Hold the local `main` ref behind while a sibling branch merges a fresher `origin/main`, then stage a
          commit against a target work-unit path and run the composition path above.
        - Assert the result is clean (no divergence-shaped overlap list); the test fails pre-fix — that
          failure is the reproduction.

    - `[ ]` **1.1.b Reproduce the forward direction (own-artifact commit flagged as sibling overlap)**
        - Reconstruct the recorded `4c05c455` arrangement channel-neutrally: a WU staging a commit to its own
          artifacts with sibling in-flight branches present, refs and base state arranged per the anchors —
          which candidate channel produces the misfire is 1.2's question, not a premise here.
        - The notes record a concrete induction recipe only for the behind-base direction; start from that
          same arrangement (stale local base, siblings carrying fresher base) while staging own artifacts — a
          stale base plausibly produces this symptom too. If the reconstruction doesn't misfire, escalate to
          1.2's instrumentation to recover the arrangement rather than stalling here.
        - Assert the committing WU's own artifacts are not reported as foreign overlaps; fails pre-fix.

### `[ ]` **1.2 Trace the producing channel feeding the three-dot primitive**

- _Goal:_ The producing path is identified from the live reproductions and recorded, so the fix lands at the
  source rather than a symptom site — and the spec's open item closes with evidence.

    - Instrument the reproductions from 1.1 across the five candidate channels: candidate branch/SHA pairs
      from the roster snapshot; stale remote-tracking or shadow refs resolved as candidates; the `baseSha`
      fallback (`tryResolveRefSha`); the uncommitted-status probe; local-base-ref staleness
      (`check-foreign-writes.ts` passes `branch.base`, resolved locally — never `origin/<base>`).
    - Record the traced channel and mechanism in `notes-slug-state-oracle-alignment.md` § Problem 2 (trace
      outcome); if the trace corrects a spec-level assumption, propagate the correction to the spec.

### `[ ]` **1.3 Fix the traced producing path and lock regressions**

- _Goal:_ The advisory emits no divergence-shaped lists in either observed direction while genuine authored
  overlap still reports — fail-quiet and over-report are both defects here.
- _Note:_ Subtask shape is provisional until 1.2 names the mechanism; scope the fix to the traced channel,
  not a blanket rework of the detection module.

    - `[ ]` **1.3.a Fix at the traced site**
        - Apply the minimal correction the trace names (e.g., resolving the base against `origin/<base>`,
          refreshing snapshot SHAs, or dropping a stale-ref candidate class — whichever 1.2 identified).

    - `[ ]` **1.3.b Flip the 1.1 reproductions green and add the genuine-overlap guard**
        - Both direction tests pass post-fix and stay as regressions (SC4).
        - Add a positive control: a sibling branch that genuinely authored a target path still reports overlap
          — the fix must not silence true positives.

## **Phase 2:** Composed lifecycle index — shared helper

_Purpose:_ Build the one composition point every consumer swaps onto: tree index + in-flight-oracle candidates
merged under existing precedence, returning a plain `LifecycleIndex` plus the derivation's quality facts.

_Design decisions:_ Composition happens above `buildLifecycleIndex`, which stays pure and checkout-local (the
locality no-go). Quality facts ride alongside the index because both existing merge stages silently drop them:
`inFlightEntryToCandidate` (`lib/status/project-view.ts`) nulls unknown-state entries and
`buildLifecycleIndexFromRecords` (`lib/work-unit/lifecycle-index.ts`) skips unknown-state records — dispatch
needs those signals for Phase 4's indeterminacy keying. `resolveComposedLifecycleIndex` is the working name;
settle the final name at implementation (spec Open item).

### `[ ]` **2.1 Build the composed-index resolver over tree + oracle candidates**

- _Goal:_ One call yields a lifecycle index carrying both tree truth and in-flight-oracle truth merged under
  the existing `mergeProjectReadinessRecords` precedence, in `localOnly` or live mode — so consumers gain
  sibling sight by swapping construction sites only (SC7).
- _Shape:_ New module (working placement `lib/work-unit/composed-index.ts`) composing existing primitives:
  tree records, oracle candidates (`deriveInFlight` → candidate projection), `mergeProjectReadinessRecords`,
  then `buildLifecycleIndexFromRecords`. No new derivation logic — construction plumbing over proven parts.
  The helper resolves `parkedSlugs` internally from the tree index it already builds (existing callers
  pre-compute `listParkedSlugs` and pass it in; consumers of the helper should not have to).
- **Additional Context:** `notes-slug-state-oracle-alignment.md` § Decision 1 — oracle mechanics and cost
  profile

    - Build `test-first` (one behavior at a time):
        - With no oracle input (or an empty derivation), the composed index equals the tree-only
          `buildLifecycleIndex` projection — tree parity is the floor.
        - A sibling's at-ref activation overlays its stale tree stub: `planned` tree record + `Active` at-ref
          meta resolves to the in-flight state, per existing merge precedence.
        - `localOnly` mode runs with no network read; live mode passes the bounded membership read through
          (`reachable` reflected in the result).
        - An unreachable oracle degrades to tree-only truth plus quality facts — never a throw, never a block.
        - Parked overlay and completed-record precedence behave exactly as the existing merge does (no
          precedence drift from the swap).
        - A stale `plan/<slug>` shadow ref alongside the WU's renamed branch dedupes to the renamed tip in the
          composed index; the shadow surfaces as a warning, never a second WU (the activation-rename
          harmlessness obligation — residue cleanup itself stays out of scope).

    - `[ ]` **2.1.a Settle module placement, the shared composition core, and the public signature**
        - The load-bearing decision: `resolveProjectReadinessViewInput` (`lib/status/project-view.ts`) already
          performs tree + oracle + merge, but its tree loader (`loadProjectRecords`) and candidate projection
          (`inFlightEntryToCandidate`) are module-private. Extract or export a shared composition core so the
          `--project` view and the composed helper are the same machinery — never a parallel reimplementation,
          which would let the slug query and the project view disagree again (the founding defect's shape).
        - Watch the file cycle: if the view path adopts the helper while the helper imports from
          `project-view.ts`, relocate the shared core to a module both import.
        - Input contract — enumerate it here, because the swap sites can't all supply what `deriveInFlight`'s
          production callers do: `baseBranch` comes from config (the slug-query and start-dispatch swap sites
          gain a local `readConfigSettings` read — `deriveInFlight`'s silent `"main"` default is not
          acceptable, since base exclusion is load-bearing); `errandSlugByBranch` is optional (empty is sound
          for index truth — errand branches carry no meta; consumers wanting errand/residue visibility supply
          it); identity/team filtering follows the view path (`identity: null`, `teamMode: false`).
        - Output contract — beyond `{ index, qualityFacts }`, expose what Phases 3–4 consume: a slug →
          worktree-path enrichment (the candidate projection drops `worktreePath` today), per-slug quality
          facts, and the live-membership refs (`liveRefs` lives only on the internal branch-set today —
          `DeriveInFlightResult` or the helper result must surface it for 4.3's expansion set).
        - Path contract — `LifecycleIndexEntry.path` is documented cwd-relative, and the graduate arm joins it
          onto `cwd` before reading; the view path's tree loader emits absolute paths and oracle-won entries
          carry a ref-qualified pseudo-path (`<ref>:.arc/active/meta-*.md`). Tree-record paths entering the
          composed index must normalize to cwd-relative, and no dispatch consumer may filesystem-read an
          oracle-won entry's pseudo-path (safe today only because graduate fires solely on tree-won states —
          pin it, don't inherit it).
        - Helper final name settles here too.

    - `[ ]` **2.1.b Implement the resolver behaviors**

### `[ ]` **2.2 Surface derivation quality facts past the two silent drop stages**

- _Goal:_ Consumers can read oracle warnings, degraded/unknown-state entries, and indeterminacy marks
  alongside the composed index — a dropped or degraded entry is distinguishable from an absent slug, which is
  what keeps Phase 4's "indeterminate, never absent" rule implementable.

    - Build `test-first` (one behavior at a time):
        - An unknown-state at-ref entry surfaces as a quality fact naming the slug instead of silently
          vanishing from the index.
        - Native `InFlightWarning` codes propagate through the helper's result unflattened — do not adopt the
          view path's coarse `oracle-degraded` mapping, which folds benign codes into one bucket.
        - The indeterminacy-relevant code set is pinned here for Phase 4: degraded-read / malformed /
          unrecognized / ambiguity / snapshot-disagreement codes (`meta-enumeration-failed`,
          `meta-read-failed`, `meta-malformed`, `state-unrecognized`, `branch-field-missing`,
          `location-ambiguous`, `input-snapshot-disagreement`) key indeterminacy for a named slug; benign
          dedupe codes (`candidate-shadowed`, `stale-location-shadow`, `stale-location-dropped`) never do —
          they fire routinely (2.1's own shadow-ref behavior requires one) and must not flip a minting arm.
          `worktree-list-failed` is the marks-carried case: its warning names no slug — that degradation
          reaches targets through the per-slug entry marks above, which is why the marks must be slug-keyed
          facts, not decoration.
        - A valid-state entry carrying `degraded` / `indeterminate` marks keeps those marks visible in the
          quality facts, keyed by slug, even though the entry itself enters the index (the candidate
          projection drops `marks` today — the second silent stage).
        - Whole-result and per-entry `indeterminate` marks propagate.
        - A healthy derivation yields empty quality facts — no noise on the clean path.

## **Phase 3:** Slug query and occupancy — composed adoption

_Purpose:_ Swap the read-only query surfaces onto composed truth: `arc status <slug>` in `localOnly` mode with
a positive `--fetch` live upgrade, state-derived `occupied` over the composed index, display enrichment, and
the conditional ready-mine adoption.

_Design decisions:_ The slug query defaults `localOnly` with a positive `--fetch` opt-in — deliberately
inverting the `--project` view's live-default, because the slug query is a hot-path interactive primitive that
must not expose every call to a network timeout. The asymmetry is a recorded conscious call, documented at the
flag (spec Decision 3). `localOnly` blindness to never-fetched siblings is accepted (no-go).

### `[ ]` **3.1 Swap `resolveSlugQuery` and `isOccupied` onto the composed index**

- _Goal:_ From a checkout other than the WU's own, `arc status <live-sibling-slug>` reports the sibling's
  in-flight state and `occupied: true` via local remote-tracking refs — no false `planned` (SC1) — with
  `resolveSlugQuery` and `isOccupied` running unchanged over the swapped index (SC7).

    - `[ ]` **3.1.a Swap the slug-query handler's construction site**
        - `handlers/status.ts` slug branch: replace the inline `buildLifecycleIndex` with the composed helper
          in `localOnly` mode; the downstream `resolveSlugQuery` call is untouched.

    - `[ ]` **3.1.b Lock the cross-checkout truth with integration coverage**
        - Temp-repo scenario mirroring the founding observation: sibling WU active on its own branch (local
          remote-tracking ref present), queried from another checkout → in-flight state, `occupied: true`.
        - `isOccupied` truthfulness over the composed index for `planning` / `active` / `integrating` sibling
          states.

### `[ ]` **3.2 Add `--fetch` live upgrade with warn-and-degrade rendering**

- _Goal:_ The operator can opt one slug query into live membership; a degraded oracle renders the existing
  warn-and-degrade pattern and never blocks the query.

    - `[ ]` **3.2.a Register the flag and plumb live mode**
        - CLI option on the status command surface; `--fetch` routes the composed helper into live mode.
          Document the deliberate `--fetch` vs `--local` asymmetry at the flag's help text.
        - The command already registers `--no-fetch` (view modes), so Commander pairs the new `--fetch` on the
          same `fetch` key and the key's default shifts from `true` to unset — the slug path must key on
          `opts.fetch === true`, the view modes' `opts.fetch === false` checks and their live default must be
          asserted unchanged, and the stale "defaults to true" doc comment on `StatusCliOptions.fetch` updates.

    - `[ ]` **3.2.b Render quality facts on the query output**
        - Degraded/unreachable oracle → warning lines alongside the query result (human render); `--json`
          output may gain additive fields only — wrapped at the handler emission layer (the handler emits
          `JSON.stringify(query)` today), never by widening `SlugStateQuery` itself. Same rule for 3.3's
          enrichment.

### `[ ]` **3.3 Enrich query output with sibling worktree path when the roster knows it**

- _Goal:_ A locally-checked-out sibling's query names its worktree path — display enrichment only; the
  `occupied` contract stays state-derived (spec Decision 4).

    - Source the path from the oracle entry / worktree roster already resolved in the composed result; render
      in `formatSlugStateQuery`, additive in `--json`.

### `[ ]` **3.4 Adopt composed index in `buildReadyMineSlice` only if it falls out free**

- _Goal:_ The read-only ready-mine render takes composed-`localOnly` truth iff the adoption is a pure
  construction-site swap at its caller; otherwise the defer is recorded and `dischargeDepEdges` stays
  tree-only either way (spec Decision 5 — defer is a sanctioned outcome).

    - The call site is singular — `loadReadyMineSlice` builds `buildLifecycleIndex` inline
      (`lib/status/ready-mine-source.ts`) — so the swap itself is mechanically free. The real defer trigger:
      the user view already runs the in-flight oracle for its in-flight slice, so composed adoption here would
      run the derivation twice per view render unless the view shares one derivation. Key the decision on
      that.
    - Verdict deltas are near-zero either way (an in-flight dep reads not-`shipped` from both tree and
      composed truth) — the gain is truth-source consistency, so a defer is low-stakes; record it and the
      rationale in `notes-slug-state-oracle-alignment.md` if taken.
    - Confirm `dischargeDepEdges` is untouched by this phase (conservative tree-only read — the no-go).

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

### `[ ]` **4.1 Wire `resolveStartDispatch` to the live composed oracle**

- _Goal:_ Dispatch resolves over composed live truth, so a live sibling's slug routes to the refuse arms from
  any checkout with a healthy oracle — the silent second mint's primary kill (SC2), with
  `resolveStartDispatch` itself unchanged (SC7).

    - `[ ]` **4.1.a Swap the start handler's construction site to the composed helper in live mode**
        - `handlers/start.ts`: replace the inline `buildLifecycleIndex` feeding `resolveStartDispatch`; carry
          the quality facts forward for 4.2's indeterminacy read.

    - `[ ]` **4.1.b Lock refuse-arm behavior from a foreign checkout**
        - Integration coverage: sibling `planning` / `active` / `integrating` on its own branch → the
          matching refuse arm fires with its directed reason from another checkout.

### `[ ]` **4.2 Key both minting arms on oracle quality — confirm or refuse indeterminate**

- _Goal:_ Neither minting arm fires silently on degraded truth: an indeterminate target confirms
  interactively, and under `--yes` / non-TTY it refuses with direction — fail-safe over fail-convenient
  (SC2). A dropped or degraded target entry reads indeterminate, never absent.
- _Note:_ Keep the indeterminacy resolution factored upstream of arm identity (a target-quality read the
  dispatch consults, not logic baked into each arm) — the pending async verb fork reshapes the arms and should
  inherit the gate unchanged.

    - Build `test-first` (one behavior at a time):
        - Unreachable oracle → target indeterminate for both arms.
        - A quality fact naming the target slug with a code from 2.2's pinned indeterminacy set (native
          `InFlightWarningCode` values — not the view path's flattened `oracle-degraded`) → indeterminate;
          benign dedupe codes naming the target do not flip the arms.
        - A target entry carrying `degraded` / `indeterminate` marks (the slug-keyed mark facts from 2.2), or
          a whole-result `indeterminate` mark → indeterminate for both arms — the marks channel covers the
          degradations whose warnings name no slug (`worktree-list-failed`, per-entry snapshot disagreement).
        - A failed live-only expansion fetch for a candidate ref (4.3) → indeterminate.
        - Healthy oracle, clean facts → both arms fire with today's behavior (no new friction on the green
          path).
        - Indeterminate + interactive → confirm prompt fires; accept proceeds, decline aborts cleanly.
        - Indeterminate + `--yes` or non-TTY → refuse with a directed reason and nonzero exit; never
          auto-confirm.
        - Refuse arms / `resume` / `--here` cold-start routing unchanged by the indeterminacy gate.

### `[ ]` **4.3 Expand live-only candidates before minting (bounded fetch + meta classification)**

- _Goal:_ A branch present in live membership but absent locally is expanded — bounded fetch, then meta
  classification — before either minting arm may fire, so a never-fetched live sibling cannot read
  `nonexistent` and mint a duplicate (SC3).
- _Shape:_ Expansion is an opt-in mode on the composed helper (the dispatch path requests it; the query path's
  no-expansion default stays a mode flag testable in one place) — it changes the candidate set feeding
  classification and merge, so it belongs inside the composition, not handler-side post-processing. The
  extension point is `deriveInFlight`'s input contract (an expansion mode participating in the agreed-inputs
  snapshot machinery) — its classification internals are module-private, and the legacy `branches` option
  bypasses the snapshot probing entirely; a helper-side second classification pass would be the
  parallel-machinery trap 2.1.a forbids for the view path.
- **Additional Context:** `notes-slug-state-oracle-alignment.md` § Decision 1 — `fetchRefBounded` /
  `readMetaAtRef` are the unwired expansion primitives

    - Build `test-first` (one behavior at a time):
        - The expansion set is `liveRefs − local remote-tracking` from the composed live result — computed on
          the dispatch path only.
        - A successful `fetchRefBounded` lands the tip's objects and its metas classify into the dispatch
          truth before arm resolution. Classify at the membership tip SHA (already in `liveRefs` from
          `ls-remote`), never at `FETCH_HEAD` — sequential expansion fetches overwrite `FETCH_HEAD`, an
          order-dependent bug.
        - A failed or timed-out expansion fetch yields indeterminate for the target — never absent, never a
          throw.
        - The slug-query path performs no expansion (`localOnly` default — the no-go boundary).

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

### `[ ]` **5.1 Extend the composed-input model with the own-branch prospective override**

- _Goal:_ During a transition commit, the staged lifecycle record substitutes for the checked-out branch's
  oracle candidates (both ref forms), so the staged state is authoritative for that branch while every sibling
  ranks normally (SC5).
- _Approach:_ Key the override on staged-record presence, and suppress at the **entry level (post-dedupe)**:
  drop the projected oracle candidate whose winning entry's branch is the checked-out branch when the staged
  index carries a record for that slug; no staged record → the entry stands. Post-dedupe suppression covers
  both ref forms for free (dedupe already collapses the local head and its `origin/<branch>` twin into one
  entry) and leaves sibling stale-candidate warnings untouched — pre-dedupe per-ref suppression would silence
  those warnings and fail the byte-for-byte inertness test below. The no-transition case is inert by
  construction (staged ≡ at-ref), so no transition detection is needed — only the current branch resolved in
  the hook context.
- **Additional Context:** `notes-slug-state-oracle-alignment.md` § Decision 6 — prospective-render mechanics
  and the dual-ref dedupe detail

    - Build `test-first` (one behavior at a time):
        - Archival window: staged `Shipped` record + at-ref `Integrating` metas on the own branch's local head
          and `origin/<branch>` twin → the composed record set carries `Shipped`; the In Flight row drops.
        - A sibling branch's at-ref active meta is unaffected by the override — sibling precedence unchanged.
        - Activation transition: staged `Active` wins over the own branch's pre-commit `Planning` tip.
        - Integration transition: staged `Integrating` wins over the own branch's pre-commit `Active` tip.
        - A `completed/` record never outranks a genuine live sibling branch (the global-flip guard).
        - No transition staged → the override is inert; renders match today's output byte-for-byte.

### `[ ]` **5.2 Lock archival-window rendering: own row drops, siblings unaffected, hook/CLI parity**

- _Goal:_ An archival commit's fresh staged render drops the archived WU's own In Flight row and the
  pre-commit assert accepts it — the four-times-observed carried-row failure is dead, and remediation output
  matches the hook byte-for-byte (SC5).

    - `[ ]` **5.2.a End-to-end archival-commit coverage**
        - Temp-repo flow: WU at `Integrating` on its branch, archival sweep staged → staged-index render
          drops the row; `assertRoadmapRegenerated` passes; sibling rows intact.

    - `[ ]` **5.2.b Hook/CLI byte-parity regression**
        - The pre-commit assert's render and `arc status --project --staged` produce byte-identical output
          across the transition scenarios (both compose from `renderRoadmapFromIndexViewResult` — lock it so
          a future split can't drift). Assert across the trailing-newline wrapper too: the hook compares
          content-with-newline while the CLI emits the view markdown.

## **Phase 6:** Residue classification and `remoteOnly` truth

_Purpose:_ Stop silently dropping or misreporting branch/record residue: no-record/no-meta branches and
branch-less errand records surface as classified entries, and `remoteOnly` means absent locally (no worktree
and no local branch).

### `[ ]` **6.1 Classify no-record/no-meta branches and branch-less errand records as visible residue**

- _Goal:_ A merged errand head with a closed record — or any branch carrying neither record nor meta — surfaces
  as a classified residue entry with branch-derived identity instead of vanishing from every cleanup surface
  (SC6); degraded-but-visible behavior is preserved when remote or record reads fail (spec Decision 7).

    - Build `test-first` (one behavior at a time):
        - A branch with no errand record and no active meta produces a residue entry/warning naming the branch
          — `classifyInput`'s silent drop is replaced with classification.
        - A branch-less errand record (record exists, branch gone) surfaces as a visible warning entry.
        - The base branch remains excluded — never residue.
        - A failed record or remote read degrades to visible-with-marks, not silence.

    - `[ ]` **6.1.a Emit residue classification from the derivation layer**
        - Carrier: an additive `residue` field on `DeriveInFlightResult` (plus structured warnings) — not a
          third `InFlightEntry` kind, which would touch every `entry.kind` switch across the view, overlap
          projection, and materialize filters. Consumers opt in.

    - `[ ]` **6.1.b Surface residue on the session-init cleanup consumers**
        - The errand-state / cleanup surfaces that consume the oracle render the residue entries (the ten
          observed vanished remote branches become visible); advisory only — nothing auto-removes. The
          errand-state probe composes its oracle input in `handlers/status.ts` (the session-init probe
          assembly) — plumb the residue slice through there.
        - The probe assembly's unreachable arm currently discards oracle entries wholesale; residue derived
          from local refs must survive that arm marked degraded (visible-with-marks, per spec Decision 7) —
          not ride the entries discard, which would re-silence residue in exactly the degraded case.

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
