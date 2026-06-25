# Metadata: Partial-Push Marker

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `cross-machine-coherence`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-partial-push-marker.md`
- **Task List:** `tasks-partial-push-marker.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification (all phases done; WU verification-complete)
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/137>
- **Completed:** 2026-06-25

---

## Release Notes Entry

A failed user-notes push during `arc sync` no longer silently strands cross-machine continuity. Transient
failures auto-retry, a persistent failure surfaces a non-blocking retry instead of a hard error, and the
originating machine publishes a marker recording the outstanding push — so a sibling clone of the same identity
can tell that notes for a given commit were attempted but have not yet landed.

### Added

- A published per-machine sync-state marker recording an outstanding user-notes push — the commit it was
  advancing for, when, and from which machine — making a partial push (branch pushed, notes not) detectable
  across clones of the same identity. It self-clears once the notes land and ages out after 14 days; concurrent
  machines' markers merge without clobbering one another.

### Changed

- A user-notes push failure inside `arc sync` now auto-retries a transient blip silently and, on persistent
  failure, presents a non-blocking retry offer rather than aborting — never blocking on a prompt in a
  non-interactive run.
- `arc-handoff` now defines its behavior when the notes push fails at handoff: it offers a primed retry and
  records any deferral in the handoff report.

### Fixed

- A successful upstream-initializing notes push no longer leaks a stray "set upstream first" error to stderr.

## Completion Notes

partial-push-marker closes the cross-machine partial-push invisibility gap: a worktree push that succeeds while
its user-notes push fails is recorded only in a gitignored local marker, so a sibling clone pulls the advanced
branch, reads stale notes, and proceeds as if the handoff completed. The design publishes that state to a remote
per-machine sync-state ref (`refs/arc/user/{identity}/sync-state`) keyed by a random machine-id, union-merged so
two machines never clobber each other's entry, and self-invalidating by ref comparison once the notes land (with
a 14-day TTL backstop for an abandoned machine that never returns).

Scope widened during planning from pure B-side visibility to the full partial-push lifecycle, and the bulk of
the user-facing value is the A-side push-time recovery: a bounded silent auto-retry for transient notes-push
blips, then a non-blocking primed-retry offer (never a TTY prompt in an agent run) that records the marker on
deferral and clears it on success, with a matching notes-push-failed behavior in `arc-handoff`. The git plumbing
for the new ref generalized the errand ref's tree-of-blobs mechanism into a shared, key-agnostic
`lib/git/ref-tree.ts` that both refs now build on.

Two review rounds (self + CodeRabbit) sharpened the recovery surface: a deterministic notes conflict now routes
to a non-transient status instead of being auto-retried as a transient blip; the retry primitive's no-throw
contract is enforced against a rejecting delegate; a corrupt marker timestamp is rejected at the parse boundary
rather than bypassing the TTL; the reconcile loop pushes the freshly-merged ref after its final reconcile; and a
marker blob whose embedded machine-id disagrees with its tree key is rejected as untrusted. Two finding classes
were deferred by design — single-machine inter-process write safety (compare-and-swap for the unconditional ref
update and the machine-id first-write race) to `state-ref-write-safety`, and robust git-error distinction in the
fail-open read helpers to the eventual version-checked-writes substrate. The B-side rendering of the marker (the
Aware/Caution recovery surfaces) is a non-goal here: this work unit ships the producer and the consumer contract
it reads against.

Verification: all 8 spec success criteria met with no supersessions; full quality gates green (3306 tests, lint,
typecheck, build) and green CI; two CodeRabbit rounds resolved to zero outstanding review threads.

---
