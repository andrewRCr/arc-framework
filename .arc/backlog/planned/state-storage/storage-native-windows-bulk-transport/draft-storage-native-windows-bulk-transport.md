# Draft: Native Windows Bulk State Transport

- **Purpose:** Enable native-Windows bulk state publication and migration at ordinary project scale while preserving
  the ref backend's transaction and transport contracts.
- **Origin:** [internal] — the approved `storage-ref-backend` transport split, 2026-10-26.
- **Commitment:** core storage-program follow-up; planned, P1, Heavy estimate because transport feasibility and
  compatibility still require a design.

## Outcome and sequencing

Native-Windows teams must be able to publish an initial store or accumulated backlog and migrate a complete store
without requiring WSL, Linux, or macOS. Full native-Windows bulk capability is deferred to this work unit, not excluded
from ARC's supported product.

Implementation follows `storage-ref-backend` and can run alongside projection work after that dependency lands.
Completion is required before the first native-Windows adoption and no later than Gate A. A controlled Linux/WSL-only
cutover does not acquire an unconditional dependency on this work; any earlier native-Windows adoption does. The
storage cohort and release steering map carry that ordering.

## Starting evidence

The backend's push helper serializes explicit expected-value leases and refspecs into process arguments. Three hundred
valid SHA-1 work-ref creations already exceed native Windows' 32,767-character process command-line ceiling. This is
an ordinary workload: the backend's Windows measurement fixture holds 600 work items. Migration copies the complete
prepared ref set, so small day-to-day pushes do not remove the limitation.

`storage-ref-backend` owns the direct fetch correction through stdin and honest push-capacity refusal and recovery
handling. Those changes make the interim behavior safe and explicit; they do not provide scalable native-Windows push.
This work unit owns the remaining capability and the eventual removal of that limitation.

Git's push protocol streams old-value/new-value/ref commands and can publish them atomically. The observed limit is in
process invocation, which gives no present reason to change the store's ref layout, record model, lifecycle, merge
algorithms, or migration planning and recovery. This does not prove a small compatible replacement exists.

## Bounded feasibility first

Start with a bounded investigation of how to submit a complete large transaction on native Windows. Produce a concrete
candidate, its compatibility tradeoffs, and executable evidence before committing to implementation. The current Git
floor is 2.47; a floor change, additional runtime dependency, or altered hook/remote behavior must be an explicit design
decision, never an incidental workaround. If no candidate preserves the required behavior, report that result and the
specific unresolved product choice rather than extending the investigation into a speculative backend rewrite.

The earlier bounded search found no transparent solution: fetch has stdin support; push does not offer the equivalent
input for both refspecs and exact per-ref leases at the current floor. Config-backed refspecs and private lease refs
raise remote-setting and hook-identity questions; bare leases also change unleased fast-forward behavior. A lower-level
push command does not automatically preserve ordinary Git push transports, hooks, and settings. These are constraints
to verify, not a proof of impossibility or a selected implementation.

## Preserve the existing boundary

Use `pushRefs` and its structured `PushRefChange` list as the initial seam. Callers already supply the intended refs,
new values, and expected old values; journals retain semantic operations and tracking consumes per-ref outcomes.
Extract only the smallest transport boundary the selected design needs. No new provider framework is presumed.

The implementation must preserve:

- One atomic publication for the complete required transaction; no partitioning state into separately visible pushes.
- Exact expected OIDs, expected absence, and the absence of a lease as distinct requests. An undefined expectation
  retains ordinary fast-forward behavior for carried code and ordinary unleased state refs alike.
- Same-receiver carried-code transaction behavior, including refusal and retry rules, and ordered legs where required.
- Only requested refs, with no incidental tag publication or persistent additions to the code remote's refspecs.
- Original destination identity, remote settings, native transport and authentication, and hook execution/enforcement.
- Cancellation, deadlines, captured diagnostics, per-ref outcomes, and the distinction between a request never started
  and a request whose publication is uncertain.
- Both physical layouts and migration accounting, continuation, forwarding, and cleanup semantics.

One current coupling to examine is `atomicMigrationPush` injecting `--atomic` into an executor's argv. An explicit
atomicity requirement at the transport boundary may remove that coupling; this observation does not prescribe a
larger refactor. Any need to alter stored formats or the public Store contract requires a separate justified decision.

## Completion evidence to establish in the design

Demonstrate actual native-Windows execution beyond the old command-line ceiling for initial publication, backlog
publication, and complete remote migration in both layouts. Include creations, updates and deletes, representative
long ref/remote arguments, and a store at least as large as the existing 600-item Windows fixture.

At that boundary, preserve stale-lease refusal, all-or-nothing publication, ordinary unleased fast-forward rejection,
hook rejection with the original destination identity, cancellation and successful retry/resume, and exclusion of
unrequested refs. Exercise the supported transports the selected mechanism changes. Keep Linux/macOS behavior intact.
A larger accepted argument array in a mock, a capacity-refusal test, or a WSL run alone cannot establish this outcome.

## Scope boundary

This work implements native bulk transport. It does not redesign record encoding, ref topology, lifecycle or merge
semantics, projection behavior, or the service backend. It does not reopen `storage-ref-backend`'s completed features
merely to move them behind abstractions. Any larger change must be justified by the feasibility evidence.

---
