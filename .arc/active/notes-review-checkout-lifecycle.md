# Notes: review-checkout-lifecycle

> _Companion evidence for `draft-review-checkout-lifecycle.md`. The draft is the design record; this file preserves_
> _the source grounding, measurements, review history, and proposed decomposition cut so a resumed session need not_
> _repeat the investigation._

## Execution and Persistence Grounding

- `packages/arc-framework/src/scripts/review-gate/providers/coderabbit/frontline-execution.ts` owns the provider
  process operation and its abort race. On timeout, the signal race rejects before assigning the underlying process
  result. The process runner itself is non-rejecting under cancellation, so awaiting that already-started operation
  after abort recovers its buffered partial stdout and stderr without changing the process-port contract.
- The separate rejected-process path synthesizes empty streams only for spawn failure. It is not another recoverable
  output-loss path.
- `packages/arc-framework/src/scripts/review-gate/runtime/frontline-run-command.ts` materializes and revalidates the
  target before `executeBoundedFrontlineCarrier` starts its clock, and releases the materialization in `finally`
  after the adapter returns.
- `packages/arc-framework/src/scripts/review-gate/policy/frontline-operation.ts` owns the generation loop.
  `executeAndPersistFrontlineRun` has the exact operation identifier when it awaits the adapter, before an
  unsuccessful outcome may advance to another generation. Diagnostics persistence therefore belongs there through
  an injected store, before the ordinary terminal outcome is published.
- Command-layer persistence after `executeFrontlineRun` returns is too late: a retryable failure can already have
  selected another generation and operation identifier.
- Diagnostics collection and persistence are both best-effort. Either failure records absence but must not replace
  the review outcome or prevent checkout cleanup.

## Provider Artifact Grounding

CodeRabbit stores each run outside the checkout under:

```text
~/.coderabbit/reviews/<workdir-hash>/<repo-hash>/reviews/<epoch-ms>/
```

The per-working-directory key is why each ephemeral checkout produces a fresh bucket. Teardown does not delete these
files; it deletes the path that makes the right bucket easy to correlate. Collection must happen before teardown,
while the adapter still knows the ephemeral checkout path.

Measurements over all 128 observed run buckets:

| Artifact set              |       p50 |         p90 |     Maximum |
| ------------------------- | --------: | ----------: | ----------: |
| `internalState.json`      |  79,116 B |   591,691 B |   783,108 B |
| `git.json`                |  69,888 B |   503,293 B | 1,490,263 B |
| `incrementalDiff.json`    | 387,855 B | 1,958,380 B | 4,757,053 B |
| Per-file finding payloads |  61,472 B |   524,865 B | 1,520,057 B |
| Selected state + findings | 157,894 B |   874,927 B | 2,303,165 B |
| Whole bucket              | 676,223 B | 3,304,980 B | 8,550,481 B |

One inspected recent bucket contained 85 detailed summary ranges, 19 raw summary entries, one reviewed commit, and
seven per-file payloads holding completed findings across three severity categories. The per-file files are
diagnostic output, not expendable cache. `git.json` and `incrementalDiff.json` dominate size with source material
that can be reconstructed from the retained base and head.

The observed provider logs are tiny—11 files ranging from 253 to 1,357 bytes—and include useful phase timing and
termination data. They are not safely collectable: the filename UUID appears nowhere in the review bucket, and the
content carries no repository, checkout, process, or run identifier. Concurrent reviews make time-window matching
unsafe. Exclude logs until the provider exposes a trustworthy correlation seam.

## Common-State and Retention Grounding

- `packages/arc-framework/src/scripts/review-gate/hosts/local/git-common-state.ts` already resolves the repository
  Git common directory, creates owner-only namespace roots, serializes updates with an advisory lock, and publishes
  records by atomic replacement.
- The publisher supports named reads and updates only. It has no listing or deletion operation, so one record
  containing the entire diagnostic ring is the smallest design that can evict without widening the publisher.
- The settled ring retains four failed passes. Each serialized entry is capped at 4 MiB; stdout and stderr are
  capped at 256 KiB apiece with equal head/tail retention. Provider JSON remains whole. If an entry exceeds its
  budget, complete per-file finding payloads outrank `internalState.json`, and omitted files are recorded by path
  and byte count.
- The provider adapter owns layout-specific collection. The policy layer owns operation-bound persistence. Neither
  CodeRabbit paths nor collection functions enter the strict, frozen, identity-hashed source descriptor.
- Collection supports the one pinned provider layout. A later layout change records provider artifacts as
  unavailable while retaining captured streams; it does not create a multi-version compatibility subsystem.

## Materialization and Liveness Grounding

- `packages/arc-framework/src/scripts/review-gate/hosts/local/frontline-materialization.ts` creates a detached
  worktree under an OS temporary root and force-removes it during normal release. A killed process skips that
  `finally`, leaving the registration and root behind.
- The current release unconditionally deletes the root even when `git worktree remove` fails. The settled design
  reverses that failure behavior: registration removal succeeds before root and lease deletion; otherwise both stay
  available for the next targeted retry.
- Frontline locks are per operation, so reviews of different targets can overlap. A temporary-path prefix is not
  liveness proof.
- The request accepts a caller-supplied timeout up to 2,147,483,647 ms; ten minutes is only the default. The bounded
  provider clock starts after materialization and target/source revalidation, so one deadline cannot truthfully
  cover both preparation and execution without changing timeout semantics.
- Before `git worktree add`, the materialization host records a repository-common `preparing` lease with its minted
  lease identifier, root, owner process, creation time, and conservative hard reap time. A dead owner makes it
  reapable promptly; the maximum accepted timeout plus kill slack is the fallback ceiling for process-identifier
  reuse.
- When `executeBoundedFrontlineCarrier` starts, a lifecycle callback publishes the exact provider deadline and
  transitions the lease to `running`. Deadline plus fixed kill slack is the running reap time.
- Reap, registration, and normal release reuse the repository review sweep lock. The next materialization examines
  only owned lease entries, force-removes expired intact roots, and retains failed cleanup for a later retry.
- Git offers no targeted equivalent of repository-wide `git worktree prune`. If an external actor has already
  deleted the leased root, discard the spent lease and leave the stale registration to Git's existing prune or
  administrator path. Do not introduce general missing-worktree repair here.

The estimated lease/reap increment is 120–220 production lines plus 180–320 test lines. A general absent-root
repair primitive would add roughly 50–100 production lines plus comparable tests and is deliberately excluded.

## Review and Proportionality Record

- Both `Heavy` adversarial passes were used. The first rejected a throwaway-clone direction because repository
  identity and local-base resolution would make the independently re-derived target stale or unresolvable. The
  second corrected a liveness design that mistook the ten-minute default for the caller-supplied timeout bound.
  A third adversarial pass requires explicit authorization.
- Source grounding closed the persistence locus, selected provider subset, ring shape, provider-log exclusion,
  collection compatibility, and lease/reap mechanics.
- The settled candidate clears the proportionality check: it composes the existing common-state publisher and
  sweep lock, bounds diagnostic storage, preserves current timeout semantics, and declines repository-wide prune
  machinery.
- The draft-readiness criteria otherwise clear: the design mechanisms are settled, the success signal is concrete,
  and there is no inbound buffer. The remaining issue is work-unit topology, not mechanism design.

## Proposed Decomposition Cut

The mature cohort-fit read is affirmative. The two legs share a run-command seam and repository-common storage
substrate, but correct independent failures and are independently deliverable. Each exceeds the Errand floor.

```yaml
parentPosition: standalone
cohort: review-checkout-lifecycle
members:
  - slug: review-failure-diagnostics
    deliverable: Preserve and persist bounded failure diagnostics for one exact frontline pass.
  - slug: review-checkout-reaping
    deliverable: Lease and reap abandoned intact frontline materializations without relocating target derivation.
internalDependencyEdges: []
```

Shared coordination belongs in the cohort: operation/run-boundary touchpoints, common-state namespace additions,
and the requirement that diagnostic collection complete before materialization release. The members have no
semantic dependency; delivery may sequence them to avoid shared-file conflicts without fabricating a dependency.

## Pause and Resume Boundary

Prefer a real decomposition over retaining one work unit solely to ship stacked pull requests.
`decompose-transform-integrity` is the primary blocker because it owns the safer decomposition transform and has
reached `generate-tasks`. Resume after it lands and execute the cut through the then-current decomposition workflow.

`chunked-delivery` is an alternate reassessment trigger if it lands first. Its availability may make a one-work-unit
stack operationally tolerable, but it does not erase the affirmative concern-boundary result. If it lands before
`decompose-transform-integrity`, re-evaluate the topology with its shipped mechanics; do not silently substitute
stacked delivery for the preferred decomposition.

---
