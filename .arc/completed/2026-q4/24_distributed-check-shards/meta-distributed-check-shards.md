# Metadata: distributed-check-shards

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P3`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-distributed-check-shards.md`
- **Task List:** `tasks-distributed-check-shards.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:af74a0bb38b90dab40c0c713c3eb3e7fc163d4a8d13fb6c21739addecddc3d89`

- **Current Workflow:** [none]
- **Last Completed:** Task 7.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/1192>
- **Completed:** 2026-10-30

## Release Notes Entry

A check with a native shard matrix can now run that matrix through the machine's configured check runner, as one
complete plan with one verdict.

### Added

- A `shards.routed: true` setting on a check marked `runner: true` expands its declared `count` and shard `argument`
  into a complete batch/shard plan for the configured runner. Without the setting, or without an eligible runner, the
  check keeps its single unsharded command; CI keeps its declared matrix and forecast.
- Every shard runs from one captured source with the same explicit inputs. A native partitioner's duration or weights
  file declared as a `file` environment input is frozen for all shards, so later edits change none of them.
- An adapter that advertises `runGroup` receives the complete plan in one request. An adapter without it plays the
  same shards through ordinary `check/run` calls in order, at the native sharding overhead.
- A routed shard plan has one parent result. It passes, and publishes one reusable pass, only after every planned
  shard completes and the context closes normally. A missing, duplicated or interrupted shard never passes, and a
  completed failure is reported beside incomplete work.
- `arc check` output names each batch and shard that failed, could not run or produced no evidence, with its exit
  status and output.
- The runner guide, the quality-gates strategy and the standalone example adapter cover opting in, serial playback and
  qualifying shard membership against an unsharded run.

## Completion Notes

A check that declares `runner: true` and `shards.routed: true` now expands its native batch/shard matrix into one
complete plan before preparation. Every shard replays from one captured source with fixed explicit inputs, including a
frozen duration file. The results reduce to one parent verdict and at most one reusable parent pass, keyed to the
complete plan and the actual runtime vector. Interruption waits for settlement, a lost conversation keeps its capture
and recovery guidance by plan ID, and nothing retries automatically. Group-capable adapters take the plan in one
request; a basic adapter plays it serially. Unconfigured and opted-out checks keep their single native command, and
CI's matrix and forecast are unchanged. The repository opts `test:integration` (four shards) and `test:store` (six
shards) in with handed duration files. The arc-offload provider's group placement landed on its own `main` (`082f270`).

Scope moved during execution, each change recorded as an amendment:

- E2E left routed qualification and stays native and CI-only (A3).
- Windows status evidence moved to fixture-backed cases on the Windows/macOS portability pair (A4).
- Native cache locations stayed in place, so CI's clear and upload paths are unchanged (A6).
- The five-or-six-gate comparison became a named workload of two store-selecting merge gates plus a push gate, with a
  bounded slowdown (A8). The two fully native local context runs were dropped from it (A9).
- A group's first placement waits or moves only on a busy refusal (A11).
- After main moved the store to six shards, the measured benefit was bound to the four-shard plan (A12).
- Shard fixtures work from the long form of an aliased Windows temporary path, after hosted Windows CI failed on an
  8.3 alias (A13).

Routed shard execution is qualified on Linux x64 and arm64 only. Native membership qualified against unsharded
baselines for unit, integration and the four-shard store plan, across filtered, deleted and widened selections and the
frozen duration states. The six-shard store declaration qualified once, for a full selection with a zero-byte duration
file, on both profiles and in a run split across them. With the store at four shards, the idle merge gate went from
1,369 s to 668 s, and two concurrent store-selecting merge gates plus a push gate completed 50–54% faster across three
rounds; six shards claim no measured benefit.

Verification met 25 of 30 criteria, two with deviation notes, and recorded 5 as superseded. The forced merge gate at
`900e5d988` passed 19 checks with 4 CI-only checks not selected, the store suites running as one routed six-shard group
across three placements, and CI run `41106204008` passed every job there, the Windows/macOS pair included. Two
independent review passes before publication ended at their cap with the A1/C1 fixes and the A11/A12 amendments. The
CodeRabbit CLI pass returned clean, though its per-file coverage of the 96-file change is unproven. The hosted
CodeRabbit pass found one minor finding: the verification record overstated six-shard coverage. The wording was
corrected, and that correction was accepted as covered without another pass. Measurements and qualification records
are in `notes-distributed-check-shards.md`.

---
