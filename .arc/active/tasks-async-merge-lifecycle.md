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

### `[ ]` **2.1 Two-tier sweep composer**

- _Goal:_ A composer assembles the session-init WU completion-sweep state from both tiers and exposes it on the
  status envelope, degrading to presence cleanly when the oracle or `gh` is unavailable.
- _Approach:_ Mirror `runErrandState` (`errand-state.ts`) — the I/O boundary around the pure classifier. Presence
  tier classifies from roster facts (Phase 1); the sharpening tier upgrades `awaiting-review` leaves from live PR
  state via the in-flight oracle's `pr` enrichment.
- **Strategies:** strategy-testing-methodology.md, strategy-session-operations.md

    - `[ ]` **2.1.a Presence tier — classify from roster facts**
        - Compose `classifyInFlightWorkUnits` over the Phase 1 enumerator's output; no network. Runs every
          session-init.
        - Build `test-first` (one behavior at a time):
            - roster with mixed-state WUs → only owned `Integrating` entries classified
            - empty roster → empty result

    - `[ ]` **2.1.b Mergeable-sharpening tier — gate, sharpen, degrade**
        - Implement and inject a `gh`-backed `PrSource` — the oracle's enrichment hook
          (`in-flight-derivation.ts`) is injectable but unwired today, so it runs refs-only without it.
        - Gate to handoff / no-active-WU (the oracle's network slice). Sharpen `awaiting-review →
          mergeable | blocked | merged-needs-archival` from PR state.
        - Build `test-first` (one behavior at a time):
            - live PR mergeable → upgraded to `mergeable`
            - oracle `null` (no `gh` / unreachable) → degrades to presence + soft warning
            - real-`gh` test skipped in CI when unavailable

    - `[ ]` **2.1.c Expose the sweep on the session-init envelope**
        - Surface the result as a new envelope slot alongside `errandState` / `materializableWorkUnits` for the
          workflow to consume in orientation. Assembled in `commands/status/{run,types}.ts` + `handlers/status.ts`.

### `[ ]` **2.2 Staleness threshold + event-driven triggers**

- _Goal:_ The `stale` tier fires only past a configurable `*_after_days` threshold (batched once per calendar
  day), while the `mergeable` and `merged-needs-archival` events bypass the threshold and surface immediately as
  actionable.
- _Rationale:_ A time gate suits the "still waiting" tier; the actionable events name something the developer can
  do now (merge it; archive it), so gating them behind a threshold would only delay the action.
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **2.2.a Add the `integration.stale_after_days` threshold config key**
        - One new key mirroring `inbox.remind_after_days` (`arc-config.yml`); default plus schema. Both copies
          per package-project sync.

    - `[ ]` **2.2.b Gate the `stale` tier behind the threshold + once-per-day marker**
        - Reuse the shared nudge marker (`nudge-rate-limit.ts`) so the stale nudge batches to once per calendar
          day, mirroring the errand reminder.

    - `[ ]` **2.2.c Event-driven bypass for `mergeable` / `merged-needs-archival`**
        - Surface these immediately regardless of the threshold; behind-base facts reuse
          `merge-safety-mechanism`'s shipped behind-base primitive (`lib/git/base-distance.ts`).

### `[ ]` **2.3 Orientation routes in `session-init.md`**

- _Goal:_ Session-init surfaces the swept WUs as advisory orientation routes — mirroring the existing
  errand-in-flight surface — that the developer acts on, never auto-switching, auto-merging, or auto-archiving.
- _Approach:_ Add the probe-field documentation to Step 1's envelope table and the surfacing block to Step 6,
  modeled on the existing errand-in-flight / materializable routes. Both copies.
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **2.3.a Document the sweep slot in the Step 1 envelope table**

    - `[ ]` **2.3.b Render the Step 6 orientation routes**
        - Owned WUs in the tail: the stale nudge (batched), and the `mergeable` / `merged-needs-archival` event
          routes — each advisory, none auto-acting.

## **Phase 3:** Integration ceremony resume + eager teardown

_Purpose:_ Make `integrate-work-unit.md` re-enterable from `Integrating` without redoing completed steps, and
close the Step 13 primary-worktree teardown gap so the merged `feat/` branch is reaped symmetrically with the
linked arm. Workflow-doc behavior, validated by walking the re-entry and teardown paths.

### `[ ]` **3.1 Re-entry guard + re-runnable tail steps**

- _Goal:_ A second entry into `integrate-work-unit.md` while the WU is already `Integrating` skips the state
  transition and the pre-PR / PR-open steps that already ran, resuming at the first incomplete tail step, with
  each tail step individually re-runnable.
- _Context:_ Today Phase 1 Step 1 hard-starts `Active → Integrating` with no re-entry guard, and
  merge → `arc user close` → teardown is one synchronous chain; handoff parks `Integrating` correctly, but
  nothing resumes the ceremony and nothing owns `arc user close` on a merge that lands unattended.
- _Note:_ The errand resume seam needs nothing new — `run-errand.md`'s Integrate phase is already re-enterable.
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **3.1.a Re-entry guard on Step 1**
        - When `State` is already `Integrating`, skip the transition and the already-run pre-PR / PR-open steps;
          resolve the resume point from PR state (open vs. merged) and worktree presence.

    - `[ ]` **3.1.b Tail steps own their own completion**
        - Re-express merge → `arc user close` → teardown so each step is individually re-runnable: `arc user
          close` is owned on the resume path (not only the synchronous chain), and teardown no-ops when the
          branch / worktree is already gone.

### `[ ]` **3.2 Eager post-merge teardown — Step 13 primary-arm symmetry**

- _Goal:_ Step 13 reaps the merged `feat/` branch on the primary-worktree arm too — a merged-only-safe local
  delete plus a stale remote-tracking-ref prune — matching the linked arm and `decompose-work-unit.md`'s
  park-exit block.
- _Context:_ The primary-arm path currently does no branch delete ("no worktree to remove"), so a `feat/` branch
  that lived directly in the primary worktree is never reaped by the ceremony.
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **3.2.a Close the primary-arm teardown gap**
        - Add a merged-only-safe `git branch -d <wu-branch>` (local) plus a stale remote-tracking-ref prune —
          the remote is typically removed by delete-on-merge, so prune rather than `push --delete`. Teardown
          rides the merge under the pre-merge `integration-interlock` approval; no second prompt.

    - `[ ]` **3.2.b Confirm `archive-work-unit.md` stays teardown-free**
        - Keep branch cleanup out of archival — coupling it to archival cadence would needlessly defer a
          safe-once-merged delete. (Verified more broadly in Phase 6's audit.)

## **Phase 4:** Shared completion primitives — integration footer + notes-sync leg

_Purpose:_ Land the two cross-cutting primitives the backstop completion paths consume, before wiring those paths
in Phase 5: the standalone `integration` footer (emitter + doc enumeration) and the post-merge notes-sync leg.

### `[ ]` **4.1 Standalone `integration` footer — emitter + `commit-footer.md` enumeration**

- _Goal:_ The standalone `integration` footer becomes real — completion commits that run without an active WU
  chain emit `Context: integration (...)`, and `commit-footer.md` enumerates the kind so the source-of-truth line
  arrives with the producer.
- _Context:_ The `commit-msg` hook already accepts `Context: integration (...)` as a single-parent footer kind,
  but nothing emits it and `commit-footer.md` does not enumerate it.
- _Note:_ When an active WU chain applies, `integrate-work-unit.md` keeps `meta-{name}.md (integration)`; the
  standalone `integration` footer is for the no-WU-chain completion commits the backstop paths produce.
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **4.1.a Enumerate the `integration` kind in `commit-footer.md`**
        - Add it as a single-parent integration-ceremony context — distinct from the chain-named
          `meta-*(integration)` and from the off-WU `standalone` anchor. Both copies (package source + `.arc/`).

    - `[ ]` **4.1.b Wire the emitters**
        - The completion-sweep actionable commits, the unattended-merge completion trigger, and any
          archival / finalize ceremony commit this WU wires emit the footer at their fire sites.

### `[ ]` **4.2 Post-merge notes-sync leg wiring**

- _Goal:_ Completion calls the notes sync so current HEAD carries a saved note after the post-merge base pull /
  fast-forward — closing the `localNoteFreshness.state === "ancestor"` gap.
- _Approach:_ This member owns only the wiring — call the sync right after the WORKING-MEMORY / inbox maintenance
  that rides WU completion, then leave HEAD fresh. The engine correctness (idempotent tombstone resolution,
  projection-aware status, `ancestor`-freshness) is the shipped `notes-merge-coherence` dependency.
- _Note:_ Build-first edge satisfied — `notes-merge-coherence` is shipped (`completed/2026-q2/21_…`). Wiring the
  leg without that engine would ship a deterministically-broken sync.
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **4.2.a Add the notes-sync leg to the finalize sequence**
        - Define the leg as a reusable completion step — invoke the sync, assert HEAD carries a saved note after
          the base pull / fast-forward. Phase 5 wires it into both the same-session finalize pass and the
          unattended-merge trigger.

## **Phase 5:** Same-session finalize + unattended-merge completion

_Purpose:_ Catch the merges that land outside an attended ceremony — same-session async (control already back at
base) and the unattended auto-merge lane — each with exactly one owning path and idempotent slug-line backstops.
The finalize pass is workflow-doc behavior; the idempotent backstops carry a code-level no-op assertion.

### `[ ]` **5.1 Same-session finalize pass**

- _Goal:_ When control returns to base context, an opportunistic bounded pass finalizes this session's PRs —
  merged-clean → eager teardown, failed / blocked → loud surface for both lanes, still-pending → hand to the
  sweep — without ever waiting on an unbounded CI run.
- _Context:_ The sweep (Phase 2) is a next-session backstop; it leaves the same-session blind spot — a PR merging
  mid-session after control returned to base. PRs #72 / #73 hit exactly this and needed manual cleanup.
- _Approach:_ Author the pass once as a named procedure in `session-handoff.md` — the load-bearing same-session
  home, symmetric with the session-init sweep so the two bracket the session and no merge falls through — and
  invoke it by reference from `integrate-work-unit.md`'s primary-arm continuation for a prompter early catch. Not
  a method (the per-PR classification is Phase 1's classifier; the pass is its action wrapper) and not a new
  supplemental workflow (premature); single-authored + cross-referenced keeps it DRY and lets the future
  `composable-workflows` hoist lift it cleanly. See `notes-async-merge-lifecycle.md` § Finalize pass.
- _Note:_ Teardown reuses Phase 3.2's shape; the slug-line removal is one of unit 6's two idempotent backstops
  (5.2). The pass and its teardown are `composable-workflows` hoist candidates — see the spec's Open Questions
  (DRY-hoist timing).
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **5.1.a Define the pass in `session-handoff.md` — bounded poll + per-PR dispatch**
        - Poll this session's PRs once / briefly with a hard ceiling (non-blocking — never hold the session for
          an unbounded CI run), then dispatch:
            - `merged-clean` → eager teardown (delete local branch, prune stale remote-tracking ref, remove any
              ephemeral worktree, drop the slug-matched `USER-INBOX` line via the idempotent remover) + the
              Phase 4.2 notes-sync leg.
            - `failed` / `blocked` → surface loudly for both manual- and auto-merge lanes, so blocked integration
              is flagged now, not rediscovered next session.
            - `still-pending` → hand to the Phase 2 sweep; no action this session.

    - `[ ]` **5.1.b Wire the prompt-catch invocation in `integrate-work-unit.md`**
        - At the primary-arm continuation, invoke the pass by reference under an opportunistic guard — a cheap
          no-op unless this session opened an unfinalized PR.

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
