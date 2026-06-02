# Metadata: In-Flight Awareness

- **State:** Shipped
- **Owner:** andrew
- **Branch:** feat/in-flight-awareness

- **Origin:** [internal]
- **Design:** `spec-in-flight-awareness.md`

- **Depends On:** worktree-foundation
- **Cohort:** agile-parallelism
- **Priority:** P3

- **Task List:** `tasks-in-flight-awareness.md`
- **Last Completed:** Task 7.1 — Complete verification (line ~375). Tier 3 gates green (lint, typecheck,
  2299 tests, build) and all 7 success criteria met against `spec-in-flight-awareness.md`; the WU is ready
  for integration. Phase 6 was the last implementation phase.
- **Next Task:** [none] — verification complete; proceed to integrate-work-unit.
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 1 — verify completion

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/46>
- **Completed:** 2026-06-02

---

## Release Notes Entry

ARC gains a user-scoped awareness layer for work in flight across worktrees and machines: a derived in-flight
view, a per-work-unit priority field, and one-step pickup of a work unit that exists only on a remote.

### Added

- An in-flight detection primitive that derives your in-flight work units from remote branches and open pull
  requests — identical on every machine, with no checkout and no separate cache.
- `arc status --user` — a user-scoped view of your in-flight work, priority-ordered, rendered on demand to the
  terminal.
- A per-work-unit `Priority` field (`P1` / `P2` / `P3`, default `P3`) for triaging a multi-item worklist.
- Discovery-led pickup: starting a session with no local work unit offers to materialize one of your remote-only
  in-flight work units onto the current machine.

### Changed

- The activation-time concurrency check now reports overlapping in-flight work from the in-flight primitive; it
  remains advisory and never blocks.
- Session startup performs the network-backed in-flight read only when no local work unit is active, keeping the
  common resume path fast.

## Completion Notes

In-flight-awareness is the awareness layer over Worktree Foundation's mechanics: a purely-derived in-flight
oracle, the user-scoped `STATUS.USER` view and its shared render standard, a per-WU `Priority` field, and
discovery-led materialize for cross-machine pickup.

The oracle (`lib/git/in-flight-derivation.ts` + `remote-ref-reader.ts`) derives in-flight WUs from remote refs
and open PRs, reading metas via `git show` with no checkout and classifying against a pruned ref view — so a
merged-and-deleted errand branch never resurfaces as phantom in-flight. The network slice is gated on
`active.resolution === "none"`, so the resume path pays zero oracle cost; the cross-machine read is bounded by a
timeout and degrades to the last-rendered file. The PR-source degrades to refs-only until coord-probe ships an
adapter.

The render standard — shared by the project readiness view and `STATUS.USER` — is codified in
`strategy-work-organization.md`: per-table column sets, a uniform `(priority, cohort, wu-name)` sort, and
byte-stable output for identical inputs. `arc status --user` renders the in-flight-mine slice via a pure core;
the `STATUS.USER` file stays hand-maintained until roadmap-tooling automates it.

Two deliberate deviations from plan, both confirmed at verification: materialize mirrors WUs (not just errands)
as remote-only candidates, and the in-flight-errand `awaiting-merge` classification stays refs-only until
coord-probe wires a `PrSource`. The activation concurrency check and the errand-launch foreign-artifact gate both
moved onto the oracle (advisory, never a gate), absorbing the interim errand-state probe and in-flight-errand
sweep. The session-probe orchestrator gained a gated-slot affordance and a single shared-slot declaration across
its three entry points, preserving the `safeProbe` envelope contract.

Verification: Tier 3 gates green (lint, typecheck, 2299 tests, build) and all 7 success criteria met with no
deviations or supersessions; one pre-PR review finding (the degraded-view notice) fixed. The `Priority` field
shipped as a schema addition — back-filling it into existing planned metas is captured separately. CSA reconcile
remains a co-located-edit watch-point on `commands/status/run.ts` should CLI Substrate Adoption land
concurrently.
