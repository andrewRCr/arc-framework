# Task List: async-merge-lifecycle

- **Design:** `spec-async-merge-lifecycle.md`

---

## **Phase 1:** Completion-tail work-unit classifier

_Purpose:_ Build the pure, git/network-decoupled core the sweep and finalize surfaces consume — the
`classifyInFlightWorkUnits` classifier over the WU completion tail and the owned-WU branch enumerator that feeds
its presence tier. Test-first, in isolation, mirroring the shipped `classifyInFlightErrands` shape before any
I/O wiring lands in Phase 2.

_Design decisions:_ The errand 4-state enum does not map 1:1 to the WU tail, so the WU classifier carries its own
~6-state enum and its own enumerator rather than extending the errand path. See `notes-async-merge-lifecycle.md`
§ Implementation grounding (Completion sweep) for the reuse-seam grounding.

### `[x]` **1.1 `classifyInFlightWorkUnits` — completion-tail state classifier**

- _Goal:_ A pure function maps caller-resolved facts about each owned in-flight WU to a single completion-tail
  state, so every consumer reads the WU's tail position without re-deriving it.
- _Outcome:_ New `in-flight-work-unit-sweep.ts` — pure `classifyInFlightWorkUnits` over caller-resolved facts,
  git/network-decoupled like the errand sibling. `archived` is modeled as an exclusion fact (terminal, never
  surfaced) rather than a surfaced state, mirroring the errand sweep's meta-backed exclusion; `changes-requested`
  and `checks-failed` collapse into one `blocked` state. Precedence: merged → blocked → mergeable →
  stale-overlay-on-`awaiting-review` (the merged and PR-disposition states bypass the age threshold).

### `[x]` **1.2 Owned-WU branch enumerator**

- _Goal:_ Resolve the operator's in-flight work units to their branches and the tracked facts the presence tier
  classifies from — the WU-side analog of the errand path's `chore/` branch scan, sourced from the roster so it
  costs no network.
- **Strategies:** strategy-testing-methodology.md

    - `[x]` **1.2.a Enumerate owned `Integrating` WUs from the roster**
        - Pure `enumerateOwnedIntegratingWorkUnits` filters the roster to meta-resolved `State: Integrating`
          entries owned by the operator (or unattributed; `null` identity passes all), deriving each `name` from
          its meta path and carrying the branch-tip committer date from a caller-resolved map as the staleness
          anchor.

    - `[x]` **1.2.b Project tracked presence facts (no network)**
        - Pure `projectWorkUnitPresenceFacts` maps each candidate to the classifier's `InFlightWorkUnitFacts`
          shape — `archived: false` (meta still in `active/`), the live-PR facts left `false` for Phase 2's
          sharpening tier, the committer date resolved to a whole-day age against `now`.

- _Outcome:_ Both land in `in-flight-work-unit-sweep.ts` beside the classifier; the `enumerate → project →
  classify` pipeline yields `awaiting-review` / `stale` from tracked state alone with no I/O — the committer-date
  map and `now` are caller-injected, leaving the `for-each-ref` read and PR sharpening to Phase 2's composer.

## **Phase 2:** Session-init completion sweep surface

_Purpose:_ Wire the Phase 1 core into the session-init envelope as the two-tier forcing function — the free
presence tier (every session-init) and the oracle-gated mergeable-sharpening tier — with the staleness threshold,
event-driven triggers, and the orientation routes that surface owned WUs across the tail.

_Design decisions:_ Tier cost model mirrors the errand sweep — presence is free and always on; the network tier
is gated to handoff / no-active-WU and degrades to presence when `gh` is absent. See
`notes-async-merge-lifecycle.md` § Implementation grounding (Completion sweep).

### `[x]` **2.1 Two-tier sweep composer**

- _Goal:_ A composer assembles the session-init WU completion-sweep state from both tiers and exposes it on the
  status envelope, degrading to presence cleanly when the oracle or `gh` is unavailable.
- **Strategies:** strategy-testing-methodology.md, strategy-session-operations.md

    - `[x]` **2.1.a Presence tier — classify from roster facts**
        - New `work-unit-state.ts` composer (`runWorkUnitState`) — the I/O boundary mirroring `runErrandState`:
          reads local branch-tip committer dates, runs the Phase 1 `enumerate → project → classify` pipeline over
          the roster, and degrades to age 0 plus a soft warning when the `for-each-ref` read fails. No network;
          fires wherever the roster resolves (per the spec amendment), not literally every session-init.

    - `[x]` **2.1.b Mergeable-sharpening tier — gate, sharpen, degrade**
        - New WU-specific `WorkUnitPrSource` contract (per-branch disposition facts) plus a `gh`-backed adapter
          (`work-unit-pr-source.ts`, one `gh pr list --json` call mapped to facts). `runWorkUnitState` gains an
          optional `prSource`: when present it sharpens the awaiting-review / stale leaves from live PR state and
          re-classifies; when it throws it degrades to presence plus a soft warning. Chose a WU-specific source
          over the oracle's `OpenPrSignal` hook — the sweep is roster-sourced and needs richer facts than
          number/url. Gating the source to the handoff / no-active-WU arms wires up with the envelope in 2.1.c.
        - Real-`gh` exercise is an opt-in integration smoke (`ARC_TEST_REAL_GH=1`); the unit tier stays hermetic
          (mocked exec) so it runs fast and offline.

- _Outcome:_ `runWorkUnitState` (`work-unit-state.ts`) composes the network-free presence tier and the
  `gh`-gated mergeable-sharpening tier over the Phase 1 core, surfaced as the `workUnitState` envelope slot. It
  fires on the roster-resolved arms (primary / no-active-WU / branch-gone); sharpening (live PR via the
  WU-specific bounded `gh` source) is requested only on no-active-WU and degrades to presence on any `gh` failure.

    - `[x]` **2.1.c Expose the sweep on the session-init envelope**
        - New `workUnitState` slot on `SessionInitProbeResult`, wired in `commands/status/{run,types}.ts` +
          `handlers/status.ts` as a roster consumer: fires wherever the roster resolves; the sharpening tier is
          requested only on the no-active-WU arm. Bounded the `gh` adapter with a 5s abort signal (matching the
          repo's network-read posture) so session-init is never blocked. Interim stale threshold is a handler
          constant until 2.2 adds `integration.stale_after_days`. Verified live on
          `arc status --session-init --json`.

### `[x]` **2.2 Staleness threshold + event-driven triggers**

- _Goal:_ The `stale` tier fires only past a configurable `*_after_days` threshold (batched once per calendar
  day), while the `mergeable` and `merged-needs-archival` events bypass the threshold and surface immediately as
  actionable.
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **2.2.a Add the `integration.stale_after_days` threshold config key**
        - New `integration.stale_after_days` key (default 2, preserving the prior interim constant) across
          `arc-config.yml`, `status-reader.ts` defaults, `config/types.ts`, and `validate-config.sh`
          (positive-integer check + known-keys list) — both copies per package-project sync.

    - `[x]` **2.2.b Gate the `stale` tier behind the threshold + once-per-day marker**
        - `handlers/status.ts` reads the key (retiring the `WORK_UNIT_STALE_THRESHOLD_DAYS` constant) and resolves
          a WU-stale `nudge` via the generalized `resolveNudgeState` over a dedicated `work-unit-stale-last-nudge.txt`
          marker; `runWorkUnitState` threads it onto the `workUnitState` envelope slot. `NudgeMarkerState` is now
          shared across the errand and WU nudge surfaces.

    - `[x]` **2.2.c Event-driven bypass for `mergeable` / `merged-needs-archival`**
        - The events already bypass the age threshold via classifier precedence; added a network-free `behindBase`
          qualifier — `runWorkUnitState` overlays it through `countAheadBehindRef` against the local `origin/<base>`
          ref (advisory, fail-safe to `false`), surfaced alongside `mergeable` without adding a state.

- _Outcome:_ Staleness is now config-driven and once-per-day-batched while the actionable events surface every
  session-init; the `nudge` marker state and the `behindBase` qualifier ride the `workUnitState` envelope slot for
  the Step 6 orientation routes (2.3) to consume.

### `[x]` **2.3 Orientation routes in `session-init.md`**

- _Goal:_ Session-init surfaces the swept WUs as advisory orientation routes — mirroring the existing
  errand-in-flight surface — that the developer acts on, never auto-switching, auto-merging, or auto-archiving.
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **2.3.a Document the sweep slot in the Step 1 envelope table**
        - Added the `workUnitState` row to the Step 1 envelope table — the tail states, the `behindBase`
          qualifier, `value.nudge`, the roster-resolved arms, and the two-tier presence/sharpening cost model.

    - `[x]` **2.3.b Render the Step 6 orientation routes**
        - Added the Step 6 surfacing block: owned tail WUs as advisory routes — the once-per-day-batched `stale`
          nudge (with the marker write-back) and the immediate `mergeable` / `merged-needs-archival` event routes,
          plus the `behindBase` qualifier — none auto-acting.

- _Outcome:_ `session-init.md` (both copies — the `.arc` instance and the `.template.md` source) now documents
  and surfaces the `workUnitState` sweep, closing Phase 2: the completion-tail forcing function reads from tracked
  state, sharpens from live PR state off-WU, and surfaces as advisory orientation across the roster-resolved arms.

## **Phase 3:** Integration ceremony resume + eager teardown

_Purpose:_ Make `integrate-work-unit.md` re-enterable from `Integrating` without redoing completed steps, and
close the Step 13 primary-worktree teardown gap so the merged `feat/` branch is reaped symmetrically with the
linked arm. Workflow-doc behavior, validated by walking the re-entry and teardown paths.

### `[x]` **3.1 Re-entry guard + re-runnable tail steps**

- _Goal:_ A second entry into `integrate-work-unit.md` while the WU is already `Integrating` skips the state
  transition and the pre-PR / PR-open steps that already ran, resuming at the first incomplete tail step, with
  each tail step individually re-runnable.
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **3.1.a Re-entry guard on Step 1**
        - Step 1 now resolves an entry mode from `**State:**`: fresh (`Active`) runs the transition + commit;
          resume (`Integrating`) skips both and re-enters via a resume table keyed on PR state (no PR → Step 2;
          open → Step 4; merged → post-merge tail) plus worktree/branch presence.

    - `[x]` **3.1.b Tail steps own their own completion**
        - Step 12 skips the merge when the PR is already merged and owns `arc user close` on the resume path
          (no-op when the subdir is retired); Step 13 teardown is presence-guarded per action, no-opping when the
          worktree/branch is already gone while leaving `-d`'s merged-only safety intact.

- _Outcome:_ `integrate-work-unit.md` is idempotent from `Integrating` onward — re-entry from any session/machine
  resumes at the first incomplete step and every post-merge tail action is safely re-runnable. Both copies
  (package source + `.arc/`) synced. The errand resume seam needed nothing — `run-errand.md`'s Integrate phase is
  already re-enterable.

### `[x]` **3.2 Eager post-merge teardown — Step 13 primary-arm symmetry**

- _Goal:_ Step 13 reaps the merged `feat/` branch on the primary-worktree arm too — a merged-only-safe local
  delete plus a stale remote-tracking-ref prune — matching the linked arm and `decompose-work-unit.md`'s
  park-exit block.
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **3.2.a Close the primary-arm teardown gap**
        - Step 13's primary arm now switches off the merged branch, runs a presence-guarded merged-only-safe
          `git branch -d <wu-branch>`, and prunes the stale remote-tracking ref (`git fetch --prune` — no
          `push --delete`, since delete-on-merge removes the remote). Rides the pre-merge `integration-interlock`
          approval; no second prompt.

    - `[x]` **3.2.b Confirm `archive-work-unit.md` stays teardown-free**
        - Confirmed: `archive-work-unit.md` carries no branch/worktree teardown — branch cleanup stays owned by
          the integration ceremony, not deferred to archival cadence.

- _Outcome:_ Step 13 is symmetric across both arms — the in-place `feat/` branch is reaped at the ceremony rather
  than left for the worktree-only stale sweep, matching the linked arm and `decompose`'s park-exit block.

## **Phase 4:** Shared completion primitives — integration footer + notes-sync leg

_Purpose:_ Land the two cross-cutting primitives the backstop completion paths consume, before wiring those paths
in Phase 5: the standalone `integration` footer (emitter + doc enumeration) and the post-merge notes-sync leg.

### `[x]` **4.1 Standalone `integration` footer — emitter + `commit-footer.md` enumeration**

- _Goal:_ The standalone `integration` footer becomes real — completion commits that run without an active WU
  chain emit `Context: integration (...)`, and `commit-footer.md` enumerates the kind so the source-of-truth line
  arrives with the producer.
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **4.1.a Enumerate the `integration` kind in `commit-footer.md`**
        - Added the `### Integration anchor — integration` section (both copies): a single-parent
          integration-ceremony context for commits with no active WU chain to name, with the two freeform
          examples the `commit-msg` hook already accepts and a "distinct from both neighbours" note vs.
          `meta-*(integration)` and `standalone (...)`. Frontmatter description updated to list the anchor.

    - `[x]` **4.1.b Wire the emitters** — re-scoped to the emission convention; path-wiring lands in Phase 5
        - Documented the emission convention at the primitive level — an `**Emission**` note naming which
          completion paths (a merge no attended ceremony owns, finalized from base context or on the unattended
          auto-merge lane) emit the anchor, kept generic to avoid forward-pointing to unshipped paths. The actual
          fire-site wiring lands when Phase 5 authors those paths (5.1 finalize pass, 5.2 unattended trigger).

- _Outcome:_ The `integration` footer kind is real and documented producer-side, closing the producer-less
  allowance the `commit-msg` hook shipped. Phase 5's completion paths consume the convention rather than
  re-deriving the footer.

### `[x]` **4.2 Post-merge notes-sync leg wiring**

- _Goal:_ Completion calls the notes sync so current HEAD carries a saved note after the post-merge base pull /
  fast-forward — closing the `localNoteFreshness.state === "ancestor"` gap.
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **4.2.a Add the notes-sync leg to the finalize sequence**
        - Authored a reusable `## Notes-sync leg` block in `session-handoff.md` (template + instance): after the
          post-merge base fast-forward, `arc user save` re-anchors the note onto HEAD, then `arc user status`
          confirms `current-head` (not `ancestor`); idempotent re-run. Consumer described generically (no
          forward-pointer to the unshipped paths); Phase 5 wires it into the finalize pass (5.1) and the
          unattended-merge trigger (5.2).

- _Outcome:_ The post-merge notes-sync leg exists as a slug-referenceable completion primitive grounded on the
  shipped merge-coherence engine — wiring only, no engine logic. Both Phase 4 primitives (the `integration`
  footer and this leg) are now in place for Phase 5 to consume.

## **Phase 5:** Same-session finalize + unattended-merge completion

_Purpose:_ Catch the merges that land outside an attended ceremony — same-session async (control already back at
base) and the unattended auto-merge lane — each with exactly one owning path and idempotent slug-line backstops.
The finalize pass is workflow-doc behavior; the idempotent backstops carry a code-level no-op assertion.

### `[x]` **5.1 Same-session finalize pass**

- _Goal:_ When control returns to base context, an opportunistic bounded pass finalizes this session's PRs —
  merged-clean → eager teardown, failed / blocked → loud surface for both lanes, still-pending → hand to the
  sweep — without ever waiting on an unbounded CI run.
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **5.1.a Define the pass in `session-handoff.md` — bounded poll + per-PR dispatch**
        - Authored `## Same-session finalize pass` as a reusable named section (template + instance): opportunistic
          guard, one bounded `gh pr view <branch> --json state,mergedAt` poll, per-PR dispatch — merged-clean →
          presence-guarded teardown (switch off / `branch -d` / prune ref / remove worktree) + slug-line drop +
          the notes-sync leg; failed/blocked → loud surface for both lanes; still-pending → hand to the sweep.
          Wired its load-bearing fire at the top of § Sync so the re-anchored note rides the sync push.

    - `[x]` **5.1.b Wire the prompt-catch invocation in `integrate-work-unit.md`**
        - Invoked the pass by reference at the primary-arm continuation (post-merge teardown → `## Next step`)
          under the opportunistic guard, plus the cross-file `[session-handoff-finalize]` link def (both copies).

- _Outcome:_ The pass is single-authored in `session-handoff.md` and invoked from two return-to-base points —
  load-bearing at handoff (§ Sync) and prompt-catch at the integration primary-arm — keeping it DRY for a future
  shared-step hoist. Two-copy parity held (`integrate-work-unit.md` byte-identical; `session-handoff` diverges
  only by the pre-existing team-mode block). The slug-line drop is described as idempotent here; its three-remover
  reconciliation + the test-first no-op backstop land with 5.2.

### `[ ]` **5.2 Unattended-merge completion trigger + idempotent slug-line removal**

- _Goal:_ The auto-merge (unattended) lane completes exactly once — teardown and slug-matched `USER-INBOX` line
  removal happen when no workflow step attends the merge — with one authoritative remover and two idempotent
  slug-matched no-op backstops preventing a double-fire.
- _Context:_ `run-errand.md` and the `drain-inbox` transition defer post-merge cleanup to the errand's merge; on
  the auto-merge lane that merge is unattended, so no workflow step fires the cleanup. The slug-line then has
  three removers — `run-errand § Complete`, the same-session finalize pass, and the session-init errand sweep.
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **5.2.a Reconcile the completion trigger**
        - Define who runs teardown + line-removal when no one attends the merge, reconciling `run-errand.md`
          § Complete and the drain's close.

    - `[ ]` **5.2.b One authoritative remover**
        - `run-errand § Complete` stays "the single point where that removal is ensured."

    - `[ ]` **5.2.c Two idempotent backstops**
        - The same-session finalize pass (5.1) and the session-init errand sweep no-op when the slug-matched line
          is already absent.
        - Build `test-first` (one behavior at a time):
            - line already gone → removal is a no-op (asserted on both backstops)

    - `[ ]` **5.2.d Errand tail drives no archival**
        - The completion sweep's WU "full tail" must not drive an archival step for an errand — the errand
          close-out is symmetric but shorter (no meta, no archival stage).

## **Phase 6:** Async-merge audit + reaper-seam coordination

_Purpose:_ Re-ground the touchpoint set against current shipped code and adjust additively (option B), then
record the reaper facet split and update `coord-probe`'s inbound buffer. Sync-merge stays the primary flow
throughout; every change is awaiting-review accommodation layered on.

### `[ ]` **6.1 Touchpoint re-grounding audit — option B (additive)**

- _Goal:_ Each async-merge touchpoint gets explicit awaiting-review accommodation — at session-handoff,
  meta-file updates, worktree cleanup, and archival ordering — with sync-merge unchanged as the primary path.
- _Context:_ The 2026-06-03 audit predates `concurrent-work-doctrine` and `merge-safety-mechanism`, both of which
  touched these surfaces; this re-grounds against current shipped code.
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **6.1.a `integrate-work-unit.md`**
        - Reconcile with Phase 3's net-new resume / teardown; keep the awaiting-review accommodation coherent
          (additive only — the net-new behavior lands in Phase 3).

    - `[ ]` **6.1.b `archive-work-unit.md`**
        - Meta-file updates, worktree cleanup, and archival ordering under awaiting-review; confirm teardown-free
          (per 3.2).

    - `[ ]` **6.1.c `session-handoff.md`**
        - Awaiting-review accommodation at handoff — parking the `Integrating` state across the wait.

    - `[ ]` **6.1.d `deactivate-work-unit.md`**
        - Awaiting-review accommodation at the meta-file rotation.

    - `[ ]` **6.1.e `setup-merge-gate.md`**
        - Confirm orthogonal — it owns the auto-merge _lane_, not the completion tail; no completion-tail change
          expected.

### `[ ]` **6.2 Reaper facet-split record + `coord-probe` buffer update**

- _Goal:_ The reaper facet split is recorded so the two surfaces stay coordinated — facet 2 (`feat/` orphan, unit
  7) owned here, facet 1 (cross-machine `plan/` orphan) staying with `coord-probe`.

    - `[ ]` **6.2.a Confirm the spec documents the facet split**
        - Verify Proposed Design § Reaper facet split and the notes companion carry the split (authored at
          create-spec; confirm at finalize).

    - `[ ]` **6.2.b Update `coord-probe`'s inbound-buffer item**
        - Record that facet 2 is taken here and facet 1 stays with `coord-probe`.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` Resume works — a session enters `Integrating`, hands off, and a later session / machine re-enters
  `integrate-work-unit.md` and completes the tail without redoing the state transition or completed steps.
- `[ ]` The sweep surfaces the full tail — owned WUs classified across `awaiting-review` / `mergeable` /
  `blocked` / `merged-needs-archival`; stale tier respects `*_after_days` + the once-per-day marker; the
  `mergeable` / `merged-needs-archival` events bypass the threshold; the mergeable tier degrades to presence
  without `gh`.
- `[ ]` No same-session merge falls through — a mid-session merge with control back at base is finalized
  (branch torn down, remote-tracking ref pruned, ephemeral worktree removed, inbox line dropped), a
  failed/blocked PR is surfaced loudly for both lanes, with no unbounded CI wait.
- `[ ]` Notes stay coherent — after a post-merge base pull / fast-forward, current HEAD carries a saved note
  (no lingering `ancestor`-freshness gap).
- `[ ]` The footer is real — an integration-ceremony commit emits `Context: integration (...)`, the
  `commit-msg` hook accepts it, and `commit-footer.md` (both copies) enumerates the kind.
- `[ ]` The unattended lane completes — an auto-merged errand has its branch/worktree torn down and its
  slug-matched `USER-INBOX` line removed exactly once; the two backstops no-op when the line is already gone;
  the errand path drives no archival step.
- `[ ]` Teardown is symmetric — `integrate-work-unit.md` Step 13 reaps the merged `feat/` branch on both the
  primary-worktree and linked-worktree arms (merged-only-safe); `archive-work-unit.md` performs no branch
  teardown.
- `[ ]` The reaper seam is recorded — the spec documents the facet split and `coord-probe`'s inbound-buffer
  item reflects that facet 2 is owned here and facet 1 stays with `coord-probe`.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md

---
