# Draft: foreign-write-self-exclusion

- **Origin:** [internal] — captured during `lifecycle-closeout` activation (2026-06-23); surfaced by the
  activation commit's foreign-write hook, diagnosed as a false positive and routed out as a distinct
  overlap-detector bug (not corpus-consistency, not an audit-surfaced wiring edge).
- **State:** Planning — scope settled enough to commit; the exclusion-layer design fork is open.
- **Purpose:** Eliminate the systematic false-positive "Foreign-owned write" warning that every `arc activate`
  emits when its planning branch was pushed, before the cry-wolf desensitizes operators to real foreign-write
  warnings.

---

## Problem / Motivation

Every `arc activate` whose planning branch was pushed emits a spurious "Foreign-owned write" warning at the
activation commit. `scripts/check-foreign-writes.ts` derives the in-flight set from **local refs** (including the
still-present remote-tracking `origin/plan/<slug>` — deleted only at the activate ceremony's last step, *after*
the commit) and self-excludes by **worktree path**, not WU **slug** — so the WU's own renamed-from
`origin/plan/<slug>` (remote-only, no worktree, same `meta-<slug>.md`) trips the overlap check against its own
meta. Systematic cry-wolf that desensitizes operators to real warnings. Hit live 2026-06-23 activating
`lifecycle-closeout` (`origin/plan/lifecycle-closeout` flagged against `meta-lifecycle-closeout.md`).

## Approach

Self-exclude in-flight entries sharing the current WU's **slug** (the renamed-from `plan/<slug>` is the same WU),
or stop `runActiveInFlight(localOnly)` from counting a stale renamed-from remote-tracking ref as a distinct
in-flight WU. Slug is cheaply resolvable now that `lifecycle-state-resolver` ships.

## Open Design Question

The exclusion **layer** is the one open call: roster projection (`projectInFlightToOverlapRoster`) vs.
`detectForeignArtifactOverlap` vs. the in-flight enumerator (`runActiveInFlight`).

## Scope

`scripts/check-foreign-writes.ts` plus the shared overlap primitive (`detectForeignArtifactOverlap` /
`projectInFlightToOverlapRoster` / `runActiveInFlight` in `lib/git`). The primitive is **shared** with
`arc errand check`, and this touches load-bearing infra → **reviewed lane**; second-look for design hiding in the
exclusion-layer call. Adjacent to `cross-wu-coordination`'s domain (the overlap-detection family); promoted to
its own planned WU rather than folded into that stub's buffer.
