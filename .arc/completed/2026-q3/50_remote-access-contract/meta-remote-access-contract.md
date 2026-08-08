# Metadata: remote-access-contract

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-remote-access-contract.md`
- **Task List:** `tasks-remote-access-contract.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Delivery Members 1-5 merged through PRs #473-#478; Member 6 opened as PR #479
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/479>
- **Completed:** 2026-08-08

---

## Release Notes Entry

Session start no longer writes to your repository's Git metadata to find out where your branch stands. Orientation
now reads the remote once, without side effects, and every remote-derived reading says how good its evidence is —
so a locally denied metadata write is reported as the local failure it is, rather than as an unreachable remote.
Fetching objects and updating tracking refs moved to the commands whose names imply them, where a failure is
visible and retryable.

**Changed**

- Session-start orientation performs no Git metadata writes: no fetches, no tracking-ref or `FETCH_HEAD` updates,
  no temporary refs, and no object-database writes. It works unchanged in a checkout whose shared Git directory is
  read-only.
- Every remote-derived reading is qualified as exact, pending-fetch, unreachable, or not-applicable, with a failure
  reason accompanying an unreachable one. Readings that need remote evidence report their quality rather than
  presenting a stale local relation as current truth.
- Object acquisition belongs to explicit commands. `arc active in-flight --json` may fetch advertised objects that
  are not yet local before recomputing its set, and `arc base sync --json` owns the guarded base refresh.
- `arc active in-flight --json` exits non-zero when it could only partially acquire the advertised candidates, and
  names how many remain unavailable. It previously exited successfully with a local-only notice.
- Commands that start, rename, or transform work refuse to proceed on an incomplete live expansion instead of
  acting on a partial view, and distinguish an unreachable remote from a reachable one whose objects are not yet
  local.
- A shallow clone no longer reports an exact ancestry relation it cannot prove; graph-dependent readings withhold
  exactness until the history is present. Local inspection in a partial clone no longer triggers background object
  fetching.
- A stale local base branch is surfaced with the guarded sync command rather than a bare fetch instruction.

**Fixed**

- A repository whose shared Git directory denied metadata writes was reported as an unreachable remote, even when
  the remote was reachable and the checkout healthy.
- Disabling remote synchronization, or working without a remote, was reported on one surface as a transient remote
  failure with a synthetic error reason, prompting an operator to reconnect a remote they had deliberately not
  configured.
- A branch tracking an upstream under a different name resolved against the wrong advertised branch, which could
  report a live branch as deleted.
- A detached checkout with remote synchronization disabled produced a state combination the status output rejected,
  causing the command to fail rather than describe the checkout.
- Concurrent orientation readings could resolve against the process directory instead of the repository being
  inspected, allowing facts from two repositories to be combined in one result.

**Breaking Changes**

- The machine-readable session-start envelope changes shape: readings that depend on remote evidence now carry an
  evidence qualifier, and several previously optional fields are required and cross-checked. No compatibility
  aliases are provided. Consumers parsing that envelope must accept the qualified shapes.
- `arc active in-flight --json` changes its exit contract as described above. Automation that treated a zero exit
  as "complete set acquired" must now read the reported expansion status.

## Completion Notes

Delivered the read-only, request-scoped remote-evidence contract described in the spec. One bounded advertised-head
snapshot is acquired per request and shared, immutably, across every dependent analyzer; object availability and
history completeness are inspected locally and passed alongside it. The vocabulary distinguishing exact,
pending-fetch, unreachable, and not-applicable evidence is carried from the analyzers through the composition layer
to the emitted envelope and the workflow surfaces that render it. All goals were met; no non-goal was entered.

The central invariant proved to be the one worth defending explicitly: an unavailable local batch is a probe
failure, not remote evidence. Slots whose conclusion requires a present advertised object now raise a typed probe
error through their result boundary, while independent local and snapshot-only slots stay usable — so a partially
degraded environment still yields a useful orientation instead of a uniformly pessimistic one.

Two deviations from the original plan are worth recording. First, delivery was cut into six dependency-ordered
members reviewed through a rolling two-member window rather than one change set, because the whole exceeded a
reviewable size; the members are semantically ordered, and each intermediate cut published its own honest
intermediate contract rather than a broken one. Second, the base-refresh remedy publishes a structured executable
action that nothing can yet dispatch; the unsafe half was closed here — the remedy no longer resolves to an
automatic action that would run an unguarded plumbing call in place of the guarded verb — and the dispatch design
was routed out rather than invented locally, since it sets the precedent for typed actions crossing the CLI/agent
boundary.

Review across the delivery repeatedly surfaced instances of the very defect class this work unit targets:
configuration reported as remote failure, and type declarations admitting state-and-evidence pairs the runtime
contract refuses. Each was closed structurally — by naming the bounded contract once and sharing it — rather than
instance by instance, after the same shape recurred four times.

Verified evidence: the full suite passes at 9,688 tests with one skipped, alongside Markdown, ARC contract,
TypeScript, and shell lint, both typechecks, and the build. Each merged member additionally passed the complete
hosted matrix, including integration, end-to-end, and cross-platform concurrency lanes. Behavioral proof is bound
to real repositories rather than mocks where it matters: read-only shared Git directories, partial clones with
omitted trees, shallow histories, and denied metadata writes are exercised end to end, and the object inventory is
asserted unchanged across passive inspection.
