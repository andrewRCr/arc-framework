# Draft: Distributed Check Shards

- **Origin:** [internal] — runner-pool qualification and gate timing discussion, 2026-10-25.
- **Purpose:** Run declared check shards across available execution capacity through a generic runner contract,
  shortening gates while preserving complete coverage and reliable check evidence.
- **Readiness:** rough — seeded reconnaissance; the execution contract and several correctness decisions remain open.

---

## Problem / Motivation

The runner pool can distribute whole checks, but a long individual check still occupies one machine until it
finishes. The complete store suite recently passed in approximately ten minutes on the primary mini; the controlled
comparison measured 608.86 seconds on WSL. Distributing other checks reduced the earlier full gate from 1,072.05 to
665.62 seconds, leaving integration and store as long parallel steps. Those measurements used a frozen historical
source and establish motivation, not a forecast for a newer head.

Several agent sessions often run checks concurrently. The objective includes both a short gate with spare capacity
and useful aggregate throughput under five or six concurrent sessions. More submitted jobs alone do not establish
either benefit; preparation cost, queueing, heterogeneous machines and existing resource admission all matter.

CI already uses declaration-driven shards: two unit shards, four integration shards and four E2E shards on the
starting base. The near-shipping storage-ref-backend change adds four store shards. The local check controller does
not currently expand that metadata during execution.

## Resolved Direction

Consumer repositories declare checks and shard argument templates. They should not need offload-specific test
implementations, duplicated shard counts in a machine registry, or a bespoke distribution script for each suite.

ARC's reusable check engine owns declaration interpretation and the meaning and recording of a complete check
result. A generic execution boundary must convey the required invocations and shared input context. Arc-offload
owns machine selection, distribution and machine admission. ARC should remain usable with another execution runner,
and arc-offload should remain usable with repositories that do not use ARC or Vitest.

Keep this one cohesive Heavy work unit: correct distributed execution and its parent verdict form one concern.
The known primitives suggest composition rather than invention. An arc-offload implementation change, if needed,
belongs on a separate branch in that repository; whether one is necessary remains a design question.

The immediate working boundary is one captured input context per selected check. Whole-gate freezing has a broader
existing home. Each sibling, including a WSL execution, must use the same captured source and selection basis, and
the parent cache key must describe those actual inputs. This is a proposed first implementation boundary, not a
settled capture API or an assertion that current key computation already meets it.

## Existing Substrate and Constraints

- `resolveCheckForecast` in `packages/arc-framework/src/lib/checks/forecast.ts` already expands declared shard counts
  and argument templates into independently runnable command batches for CI. Reuse the expansion rather than create
  a second shard declaration language.
- `executeSelectedCheck`, `executeCheckBatches` and `finalizeCheckRun` in
  `packages/arc-framework/src/handlers/check/run.ts` own parent lookup, execution, reporting and pass publication.
  Execution currently ignores `check.shards`. `checkContentKey` in `src/lib/checks/key.ts` includes the declaration,
  but a captured execution still needs a key matching the source and runtime inputs actually checked.
- `runCheckProcess` in `packages/arc-framework/src/lib/checks/process.ts` receives a command and limited execution
  policy. It does not currently receive the forecast's shard group or expose an abort contract. Determine the
  smallest generic capability needed instead of teaching the engine an arc-offload command line.
- `snapshot` in arc-offload's `arc_offload/repository.py` captures one immutable snapshot per invocation. Separate
  CLI calls from an edited original checkout do not establish one common sibling snapshot. `local_run` in
  `arc_offload/cli.py` executes in the caller's working directory; local execution needs the common frozen context too.
- `runner_environment` in arc-offload's `arc_offload/execution.py` forwards ARC environment strings. It does not
  deliver or rebase the file named by `ARC_TEST_DURATION_FILE`, and `ARC_CHECK_TREE` is not a source capture API.
- `HeavyFirstSequencer` and `assignDurationShards` in
  `packages/arc-framework/__tests__/helpers/heavy-first-sequencer.ts` use a handed duration file and checked-in
  fallback weights. Source, discovery filters, project selection, shard count and duration bytes must agree across
  sibling discovery. Frozen membership inputs must remain separate from writable result caches.
- `withBuildArtifactOwnership` in `packages/arc-framework/src/lib/build-ownership.ts` protects runtime artifacts
  through test-controller completion. Same-checkout integration/store/E2E controllers serialize on that lease;
  distinct runners have distinct checkouts. Keep the protection initially. Unit-only controllers bypass runtime
  ownership, but their native results and cache paths still need isolation before concurrent execution.
- Existing offload machine job, memory and heavy-job permits already cover repositories and worktrees. Retain
  these limits, measured placement, caller CPU policy and the Owner's routing mode. Current admission provides no
  strict FIFO guarantee; contention behavior must be measured.

Paths beginning with `src/` above are relative to `packages/arc-framework/`. Arc-offload source paths are relative
to that separate repository. Re-ground these pointers before implementation, especially after storage-ref-backend
lands; the reconnaissance is an orientation aid, not a frozen implementation plan.

## Alternatives to Settle

### Compose the current transport around one frozen execution context

Create a common frozen checkout/input bundle, then submit sibling commands through existing runner calls. This
may preserve the current transport and admission machinery. It must also handle WSL execution, Git selection
coordinates, duration-file delivery, generated files and output isolation without relying on changing live inputs.

A disposable transport probe supports investigating this option, but has not qualified native suites or parent
pass recording. Avoid mistaking that narrow result for a complete implementation.

### Add a small generic execution-group capability

If composition requires fragile shared state, give the runner a generic invocation group and immutable input
reference. Arc-offload could distribute that group while ARC retains check semantics and one result. Settle which
layer expands the invocation matrix and reduces execution outcomes, and which observations cross the interface.
The contract should not contain ARC check names, Vitest-specific flags, or machine inventory.

The existing forecast may provide sufficient invocation data. Test that route before adding a new offload capture
API, group scheduler, or durable state. The need for a first-class machine configuration setting is separately owned.

## Unknowns and Assumptions

1. **Capture and evidence identity:** where capture happens relative to selection, runtime-input hashing and parent
   key computation; how original Git base/tree context remains available; and how index-certifying or fixing checks
   stay on their existing execution path.
2. **Eligibility and compatibility:** which declared checks can use grouped execution. The schema's acceptance of
   `shards` alone does not qualify arbitrary shell commands or mutating checks. Preserve ordinary operation without
   a configured runner and preserve existing gate deadlines and CI-only selection.
3. **Partition contract:** the complete matrix of argument batches and shard indices, including filtered selections,
   legitimately empty shards, no-evidence outcomes and the store runner's explicit empty-share handling. No missing
   invocation may be interpreted as completed coverage.
4. **Parent lifecycle:** deterministic failure, unavailable, killed and no-evidence reduction; per-shard diagnostics;
   cancellation and cleanup of every launched sibling; and the point at which one reusable parent pass is recorded.
   Awaiting launched siblings is one possible initial policy when early cancellation would require new machinery.
5. **Mutable outputs:** separate cache/report/duration writer paths and safe preparation reuse. Preserve artifact
   ownership initially; evaluate its throughput effect rather than weakening it to obtain overlap.
6. **Fan-out and contention:** bound concurrent submissions and weigh preparation overhead, small checks and uneven
   runner speed. Establish whether existing admission is sufficient before introducing scheduling policy. Measure
   both individual latency and aggregate throughput with five or six simultaneous gates.
7. **Landing relationship:** store support currently lives in another session's storage-ref-backend worktree. Do
   not modify that checkout. Confirm when its public base is available for store qualification and whether the
   resulting source or evidence changes alter the proposed execution seam.

## Evidence Already Gathered

The disposable probe used a small frozen repository and a static two-way manifest. One sibling ran directly on WSL;
then the original source and duration input were edited; the second sibling ran through the registered primary
runner with the existing shared capacity admission and a temporary registry. Both reported identical source,
duration, manifest and Git HEAD identities. The manifest's union was complete and its shares were disjoint. A forced
remote command failure retained exit status 7.

This was an input-transport proof, not native Vitest membership qualification, an ARC gate, parent pass publication,
cancellation coverage or a speed benchmark. Its owned remote fixture was removed. The original live registry and
routing mode were not edited. Local evidence and the reproducible harness are under
`.arc/user/andrew/.internal/distributed-check-shards-recon/` in this worktree.

One requested Astra advisor consultation is complete. It recommended per-check capture, ARC-owned check semantics,
generic execution adaptation, existing offload scheduling, preserved artifact leases and output isolation. Its
question, result and limits are preserved with the local evidence. Additional consultation is not implied by this
completed request.

## Scope Boundary

Cover generic declared-shard execution across the sharded tiers when those checks are requested. The feature must
serve unit, integration, store and E2E invocations through the same abstraction, while retaining each tier's existing
selection and completion rules. Preserve the existing runner modes and resource ceilings.

Leave broader whole-gate snapshots, test-cost budgeting, CI wall balancing and suite timeout hardening with
`draft-test-suite-contention-hardening.md`. Leave first-class per-machine runner settings and retirement of the
existing declaration wrappers with `draft-machine-check-runner.md`. Coordinate their interfaces without making
either entire program a prerequisite by assumption.

There is no current justification for durable per-shard pass records, a distributed database, an artifact-lock
redesign, or a scheduler fairness rewrite. Reconsider only against concrete requirements or observed failures.

## Next Session

Resume design shaping from this rough seed. Confirm the generic invocation-group boundary and compare frozen
context composition with a small runner capability. Then settle the open decisions before formalizing a spec.
Implementation and full-suite benchmarks have not started.

Verification should prove complete/disjoint native membership; one common source/selection/duration basis across
WSL and remote siblings; parent failure behavior without false pass publication; cleanup and output isolation; and
matching native coverage when comparing unsharded and distributed gates under idle and concurrent load.

---
