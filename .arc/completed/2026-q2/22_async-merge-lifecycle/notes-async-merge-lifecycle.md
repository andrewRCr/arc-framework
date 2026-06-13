# Notes: async-merge-lifecycle

## Contents

- Implementation grounding (file:line anchors)
- Finalize pass — home + vehicle (unit 3)
- Dependency provenance
- Coordination seam with `coord-probe`

## Implementation grounding (file:line anchors)

Implementation grounding against shipped code, captured at create-spec.

**Suspend/resume seam (unit 1).** `integrate-work-unit.md` hard-starts `Active → Integrating` with no re-entry
guard. Step 13 deletes the WU branch only on the linked-worktree → `removable` arm — **not** the primary-worktree
in-place arm (the teardown-completeness gap, = unit 7 / facet 2). sessionType inference maps `Integrating →
integration` at `commands/active/types.ts` (~line 1142) and `status.ts` (state → sessionType).

**Completion sweep (unit 2).** Reuse the pure, git/network-decoupled classifier at
`lib/session-init/in-flight-errand-sweep.ts:73` (`classifyInFlightErrands`); its caller is at
`errand-state.ts:89-142`. Net-new: a parallel `classifyInFlightWorkUnits` + a WU-branch enumerator. The errand
4-state enum does **not** map 1:1 to the WU tail — the WU classifier needs ~6 states (`awaiting-review →
mergeable → changes-requested/blocked → merged-needs-archival → archived`, plus the `stale` time-gated overlay).
Behind-base classification reuses `merge-safety-mechanism`'s shipped behind-base primitive.

**`integration` footer (unit 5).** The `commit-msg` hook **accepts** `Context: integration (...)` at
`.arc/system/.internal/githooks/commit-msg:309-313`, but nothing **emits** it and `commit-footer.md` does not
enumerate it — emit-side wiring + doc-enumeration are both net-new. `commit-footer.md` edits land in **both**
copies (package source + `.arc/` instance).

**Same-session finalize + notes-sync leg (units 3, 4).** No post-merge "poll this session's PRs on return to
base" pass exists today, and the finalize sequence has no notes-sync step. The `notes-merge-coherence` engine dep
is shipped (`completed/2026-q2/21_…`), so the leg grounds against the settled engine — it owns only the wiring
(call the sync, leave HEAD fresh after the base pull / fast-forward; the `localNoteFreshness.state === "ancestor"`
case).

**Teardown reaper (unit 7).** For a merged `feat/` branch, the remote was typically removed by GitHub's
delete-on-merge, so completion **prunes the stale remote-tracking ref** rather than `push --delete` (which
`decompose`'s park-exit block does for a `plan/` branch it merges via the park-PR). Local delete stays
merged-only-safe (`-d`, never `-D` for `feat/`).

## Finalize pass — home + vehicle (unit 3)

Resolved at task generation (grounding audit):

- **Home — `session-handoff.md` (load-bearing) + `integrate-work-unit.md` primary-arm (prompt-catch).** The pass
  fires on return to base context; `process-task-loop` is the wrong altitude (execution-only, per-increment
  noise). Session-handoff is symmetric with the session-init sweep — the two bracket the session, so a
  same-session merge is caught at handoff and a no-handoff session falls back to the next init sweep. The
  integrate primary-arm invocation is a promptness enhancement (earlier loud-failure surface), not load-bearing
  for coverage.
- **Vehicle — inline, single-authored + cross-referenced.** Not a method (the per-PR decision is Phase 1's
  `classifyInFlightWorkUnits`; the pass is the action wrapper around it) and not a new supplemental workflow
  (premature for a small pass). Author once in `session-handoff.md`; invoke by reference from integrate.
- **Forward-compat with `composable-workflows`.** The pass and the teardown it reuses are hoist candidates: when
  the shared-step hoist lands, the single-authored block lifts into a composed step both points invoke — the same
  deferred-DRY trigger the spec's Open Questions already record for the unit-7 / finalize teardown. Single-source
  authoring now is what makes that hoist clean; duplicating inline would fight it.
- **Opportunistic guard.** A cheap no-op unless this session opened an unfinalized PR — so invoking from multiple
  return-to-base points costs nothing when there is nothing to finalize.

## Dependency provenance

- **`concurrent-work-doctrine`** (shipped, PR #81) — the async-merge conventions + `assess-parallel-fit` this
  member operationalizes.
- **`merge-safety-mechanism`** (shipped, PR #83) — the behind-base primitive the sweep reuses; the
  `Context: integration (...)` validator-accept this member emits against.
- **`notes-merge-coherence`** (shipped, cohort sibling, `completed/2026-q2/21_…`) — the `lib/user-sync/` engine
  correctness (idempotent tombstone resolution + canonical materialized-manifest builder + `ancestor`-freshness)
  the post-merge notes-sync leg consumes. Build-first edge — the finalize sync is deterministically broken
  without it.
- **Substrate (shipped):** `archive.cadence: manual`, the stale-worktree + session-init in-flight sweeps, the
  errand sweep's PR-state classification, the inbox-reminder machinery + once-per-day marker, the `Class`
  contract.
- **Soft dep (unlanded):** `composable-workflows` — the shared-step hoist that would let the inline teardown
  (units 3, 7) later adopt `decompose-work-unit.md`'s single-source park-exit block. Deferred follow-on, never a
  blocker.

Same-session-tracked-but-out-of-scope: the `decompose-work-unit` Step 10 `(decomposition)` footer ↔ `commit-msg`
hook drift (the workflow's example footer fails the hook) is tracked downstream — not this member's concern.

## Coordination seam with `coord-probe`

The branch/worktree reaper splits by natural surface (resolved at this WU's create-spec, since it specs first):

- **Facet 2 — `feat/` orphan → this WU.** The `integrate-work-unit` Step 13 primary-worktree teardown gap; fires
  at merge (unit 7), backstopped by the completion sweep (unit 2) over this machine's owned WUs.
- **Facet 1 — cross-machine `plan/` orphan → `coord-probe`.** `activate-work-unit` Step 5's local-only
  `git branch -m plan/<name> → <type>/<name>` leaves the non-activating machine with a stale local `plan/`
  `[gone]` forever; fires at session-init on a different machine, needs `coord-probe`'s `gone`-upstream detection.

Not a double-build — different fire points, branch types, and detection drivers. If `coord-probe` later builds a
generic session-init stale-local-branch sweep surface, it extends rather than re-scans.
