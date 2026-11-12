# Metadata: concurrent-integration-characterization

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-concurrent-integration-characterization.md`
- **Task List:** `tasks-concurrent-integration-characterization.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:4b669fca339386aa1c775c9b53cf3b4ec18522430f66ada4f69d2ece9bc6a081`

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/629>
- **Completed:** 2026-09-15

## Completion Notes

Characterized the post-execution lifecycle against a protected base that moves under an independent checkout, and
shipped no fix — the design reserved every repair for a routed owner so the probes could pin current behavior
honestly. Six boundaries were probed across four movement kinds plus a control row, with a delivery-member shape
and an exact-target read-isolation family alongside. A second matrix, derived from the failures actually recorded
rather than from the boundary list, added four axes the first matrix could not separate. Thirty-four probes are
retained and seven controls deleted, each deletion recorded with the test that already covers its clean path.

Two pieces of substrate carry the result forward. The base-advance helper gained a path set and all four movement
kinds, so a probe states which paths move and how instead of dropping a marker file. The pin helper holds a probe's
observed and target shapes together: any third outcome is red, so a decayed pin cannot read green, and the moment
the target is met the probe turns red asking to be retired — the fix's own run tells the fixer to replace the call
with a plain assertion.

Two deviations are material. The scope boundary was amended mid-flight when the base-advance-only span proved too
narrow to re-find the recorded failures, widening to four derived axes each under a stated ceiling; the
no-cross-product boundary held unchanged. And the routing minted zero new stabilization stubs against a predicted
one or two, because every remaining row resolved to an owner that already existed. That is recorded as a
supersession rather than a miss: minting to reach the number would have invented unowned work. Two named targets
consolidated into one stub, which is what the design's own consolidate-by-mechanism rule directs.

The close-out audit is worth reading before the ledger is trusted. It corrected seven of this work unit's own
factual claims — including the two rows the close had named as the criterion's single gap, both of which had
already been discharged by superseding rows the close never asked about, and one genuinely unowned doctrine row
that fell out of the audit entirely because it named its columns differently. That row is now routed, so every
ledger row and every ledger-only finding has an owner.

Verification closed green at Tier 3 over the full scope: markdown lint, three ARC contract checks over 1,854 files,
both lint passes, both type checks, build, the local lane at 11,700 passing over 865 files with one
environment-gated skip, and e2e at 568 over 59. Two review passes ran ahead of them, scoped local because the
change carries no production source; of twelve findings, ten were fixed and two rejected on proportionality. A
frontline pass over the Candidate then returned nine findings — two fixed, seven rejected, five of those
unsupported against source — and the standard lane settled on an Owner-accepted terminus.

Of thirteen success criteria, nine were met at verification and one superseded. Three had no source there at all —
whether the heavy lanes ran on the pull request, the per-CI-job budget rows read from that same run, and readiness
following both — so they were bound forward by amendment to this boundary with their text unchanged, and all three
are now settled. The budget rows took three pull-request runs: four reported over at one worker on the first,
which is the cost the local refresh predicted but twelve workers had absorbed, and a fifth went over on the second
from inside a thin margin, so the shard rows were rebaselined on the spread of two runs rather than on a single
observation.

---
