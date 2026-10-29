# Draft: Ref Backend Release Hardening

- **Purpose:** Close the ref backend's routed test, benchmark, and remote-move gaps before ARC's public release.
- **Origin:** [internal] — routed from `storage-ref-backend`'s eighth standard review pass, its fix checks, and a defect
  found while fixing them (2026-10-29).
- **Commitment:** planned, P2, Light: no design to author; a work unit because its items need more than one session.

---

## Problem / Motivation

`storage-ref-backend` landed with its review stopped under a rule fixed before its eighth pass, routing the ref
backend's remaining findings out rather than fixing them in place; `storage-ref-hardening` takes those the cutover
exercises. These are the rest: test and fixture gaps around behavior that works, the manual race and benchmark kit, and
moving state between remotes, which a default-layout cutover does not do. Each was verified against source at the
reviewed head.

## Scope and Timing

- Implements after `storage-ref-backend` lands; due before the public release. The cutover does not wait on it.
- Both hardening work units edit the ref backend; sequence a shared file after `storage-ref-hardening`'s change to it.
- Paths are under `packages/arc-framework/src/` unless they start with `__tests__/` (under `packages/arc-framework/`),
  and line numbers are as of the reviewed head; locate each again before planning.

## Routed Items

### Tests and fixtures

- **The decomposition arm of the retained-conflict notice requirement is never verified.** `spec-storage-ref-backend.md`
  § 14.13 requires an abandon and a decomposition followed by a conflicting late write to report exact conflict
  references and remedies in both layouts. Parameterize the notice test over abandon and decompose. At
  `__tests__/integration/store-ref-retained-conflicts.test.ts:36-47` (only `retainedConflictFixture(layout, "abandon")`
  asserts notices; the decompose fixture runs at :49 without them).
- **Conformance template copies keep the peer's and store directories' remote URLs pointing at the shared template.** A
  copy rewrites only its own `.git/config`. Rewrite every configuration the template writes when copying, or rebuild
  those remotes per copy. A cross-test interference risk, not an observed failure. At
  `__tests__/helpers/store/ref-fixture.ts:42-69` and `prepared-repository.ts:100-106`.
- **Per-change subset validation accepts a subset entry whose case the registration skips.** Record skipped IDs
  separately and refuse a subset entry that resolves to a skipped case. At
  `__tests__/helpers/store/conformance-suite.ts:105-109` (`validateDeclaredSubset` checks registration only) and
  `suite-tools.ts:37-48` (`caseSkip` registers the ID before `it.skip`).
- **Status-only refusal assertions in store cases can be satisfied by strict input parsing instead of the rule they
  target.** Assert the refusal code and case each assertion targets. At `__tests__/helpers/store/suite-records.ts:23-28`
  (asserts only `status: refused`), with strict `WriteInputSchema` and `BatchInputSchema` parsing in both backends.
- **SHA-256 saved-state manifest resolution has no test.** Add a SHA-256 saved read and list round trip. At
  `lib/store/ref/manifest-read.ts:9-21`; `store-ref-manifest.test.ts` covers SHA-256 `version()` only.
- **The `maintain()` failure-and-repair test depends on Git 2.52+ parsing of `maintenance.strategy`, above the supported
  2.47 floor.** Use a failure every supported Git reports, or gate the case on the Git version. CI and current hosts run
  newer Git, so it passes there; that earlier Git applies the setting only to scheduled runs rests on Git's
  documentation, not a probe. At `__tests__/integration/store-ref-maintain.test.ts:44-53`, with the floor at
  `lib/git/version-floor.ts:51`.
- **The log-limit merge test caps an exec argv no production read uses, so its first output ceiling never applies.**
  Bound the forms production reads use, or drop the dead ceiling. At
  `__tests__/integration/store-ref-lifecycle-log-limit.test.ts:61-72`; store log reads use `%H %P%n%B%x00` or
  `%H%x00%B%x00` (`sync-batches.ts:30`, `history-batches.ts:24`, `sync-withdraw-journal.ts:42`).
- **Divergent history-control refusals are verified only as dead ends, with no repaired continuation.** Add the forward
  repair and a successful pull to each divergent case, as DEV-RULES.PROJECT § Recovery-complete refusals asks at
  material boundaries. At `__tests__/integration/store-ref-history-control-provenance.test.ts:139-141,170-182`.
- **New store suites duplicate conflict-evidence and history fixtures, with one helper name meaning two operations.**
  Move the shared fixtures into a helper and rename the divergent one. At
  `__tests__/integration/store-ref-conflict-path-coordinates.test.ts:13-32,59`, which re-declares scope, refs,
  `addConflict`, and `structurallyUnavailable` from `store-ref-conflict-evidence.test.ts:25-52`.
- **The admission-retry test claims ref-lock retention but never asserts it.** Record lock calls and assert the target
  is acquired once. At `__tests__/integration/store-ref-atomic-admission.test.ts:70-82`.
- **No test isolates the unreadable-quarter guard in placement completion.** Existing holds stop both known cases before
  the guard. Find a fixture that reaches it, or show it unreachable and simplify accordingly. At
  `lib/store/ref/sync-placement.ts:25-27` and `__tests__/integration/store-ref-lifecycle-unreadable-quarter.test.ts`.

### Race and benchmark kit

The manual host kit under `__tests__/benchmarks/` and its evidence tests. Fix these as one item: a race result must
record what was observed, never what an operator declared, and a skipped or failed race must not read as a pass.

- **The manual host trial records unpublished tips as owned, so a failed publication is masked by cleanup failure and
  its evidence lost.** Assert publication before recording ownership, and write results before the cleanup assertions.
  At `__tests__/benchmarks/ref-host-backend.ts:57-63,158-168`.
- **The standalone race entry records an operator-declared atomic capability as an observed receiver fact, and exits 0
  when the atomic race is skipped.** Derive the capability from the push trace, as `ref-host-properties.ts` does, and
  report a skipped race as not run. At `__tests__/benchmarks/ref-host-races.ts:10-11,24,27`.
- **The race source-digest manifest omits the in-repo modules that decide whether a race passes.** Record the repository
  revision and hash the deciding modules. At `__tests__/benchmarks/ref-host-races.ts:18-20`.
- **Race fault tests check only a failed status, not that preconditions held before the receiver evidence was refused.**
  Assert the failing guard for each fault. At `__tests__/integration/ref-host-race-evidence.test.ts:67,82`.
- **Race cleanup ownership writes in the try block have no effect and misdescribe the deletion policy.** Remove the dead
  writes and state the actual policy. At `__tests__/benchmarks/ref-host-lease-races.ts:53-56,69,94-101`.
- **A native race Git adapter is copied inline next to the helper that provides it.** Use the shared helper with a
  timeout parameter. At `__tests__/integration/ref-host-race-evidence.test.ts:19-29,75-80` and its sibling host test.
- **A receiver that accepts the raced stale push is reported as a generic process fault and filed as unverified.**
  Report an accepted stale push as a failed race with the final tip. At
  `__tests__/benchmarks/ref-host-lease-races.ts:59-79` (when the contender succeeds, `rejected` stays undefined and
  `hostPushFailure(undefined)` throws a generic error).

### Moving state between remotes

`arc store migrate`, follow, source departure, and remote settings. A default-layout cutover runs none of them; a
project moving its state to a backing repository does.

- **A migrate copy refuses an item both sides ended in the same archive quarter.** `spec-storage-ref-backend.md` § 10.4
  says that of two ends the source's holds and the destination's is withdrawn; the copy instead refuses
  `namespace-corrupt`, "Metadata on refs/arc/history/work/<uid> is missing or cannot be parsed", with a forward-repair
  remedy. At `lib/store/ref/sync-tree.ts:77`, where `completeSyncPlacements` returns false: one merge side has completed
  placement with `endBatch` undefined, while every captured quarter tip holds one folder for the item.

To reproduce, start from `switchFixture()` (`__tests__/helpers/store/remote-move.ts`):

1. Put a work item with active placement, push, and push its live ref and `refs/arc/project/registry` to the
   destination directory with `git push --atomic`.
2. Archive the item in `2026-q4` on the source store and push.
3. Create a destination peer with `createRemoteMover(h, h.destinationDirectory, "destination-peer")`, archive
   the same item there in `2026-q4`, and push.
4. Run `invokeStoreMigrate(["--to", h.to], h.ports)` (`__tests__/helpers/store/migrate-command.ts`); it refuses
   as above.

Archiving on the peer in `2026-q3` instead copies fine, and an ordinary pull of a concurrent same-quarter end, with the
local end unpublished, works.

- **A backing pointer holding a single quote strands a move at its switch.** The pointer writer refuses a value
  containing `'`, and nothing checks for one before a move's switch begins, so the move reruns into a refusal whose
  remedy cannot help. The value is the move's recorded pointer, taken from an already-set pointer. Choose a pointer
  encoding both decoders accept, or refuse early with an actionable remedy. At `lib/config/status-reader.ts:94` and
  `lib/store/ref/migrate-remote-switch.ts:75-84`.
- **A remote URL change during a setting is refused as terminal `request-invalid`, although rerunning succeeds.** Refuse
  it as a recoverable race whose remedy is to rerun the setting; `spec-storage-ref-backend.md` § 10.1 limits
  `request-invalid` to invalid requests. At `lib/store/ref/remote-setting.ts:84-87,105-108`.
- **Follow's candidate judgment aborts with an unhandled Git error on a forwarding record whose `registryCommit` has the
  other object format's length.** Reject a commit whose length does not match the repository's object format before
  `cat-file`. At `lib/store/ref/follow-candidates.ts:120-132` (`holdsFollowCommit` rethrows anything but a completed
  exit 1) and `forwarding-record.ts:15` (40- or 64-hex accepted whatever the repository's format).
- **A literal backing destination is captured with the code repository's URL rewrites but restored and verified with the
  store directory's.** Resolve literal destinations in the context that later restores and verifies them. At
  `lib/store/ref/migrate-remote-target.ts:37-42` (`captureLiteralMoveRemote` resolves through the code-repository
  context).
