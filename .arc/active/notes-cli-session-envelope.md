# Notes: cli-session-envelope

## Contents

- [Tail-routed value-type inventory](#tail-routed-value-type-inventory)
- [Thin validation field map](#thin-validation-field-map)
- [Top-level slot presence contract](#top-level-slot-presence-contract)
- [Boundary failure disposition](#boundary-failure-disposition)
- [Characterization & test-coverage state](#characterization--test-coverage-state)
- [Result-migration seam map](#result-migration-seam-map)
- [Performance measurement protocol](#performance-measurement-protocol)

## Tail-routed value-type inventory

The types below are the ones this member validates **only through a mapped routing-field projection** (a thin
pass-through schema). Full schema-authority migration (`z.infer`, hand-written type retired) routes to
`cli-substrate-complete-migration`, which also tightens each thin schema to a full one as it takes authority. This
inventory is the scoped hand-off — it exists so the tail inherits an enumerated set, not an open re-discovery.

**Reading the table.** *Blast radius* counts **genuine sibling consumers** — files importing the type beyond the two
composition sites every slot shares: the `lib/git` barrel (`lib/git/index.ts`) and the envelope itself
(`commands/status/types.ts`). *Bucket* folds external reach and internal nesting depth into an S/M/L
authority-migration cost. Exact field counts are intentionally omitted (focused inventory). Each git primitive and
deep web nests further — 13 top-level routed types plus the nested `BaseDriftResult` web fan out to roughly a
hundred nested types — and tightening that nesting is the tail's work.

| Group         | Value type                                          | Home module                                 | Blast radius (genuine sibling consumers)                                               | Bucket |
|---------------|-----------------------------------------------------|---------------------------------------------|----------------------------------------------------------------------------------------|--------|
| git-primitive | `DirtyStateResult`                                  | `lib/git/dirty-state.ts`                    | 6 — status run + handler, recover + recover-probes, recover/audit, recommended-action  | L      |
| git-primitive | `WorktreeSyncStatusResult`                          | `lib/git/worktree-sync.ts`                  | 5 — status run + format, user sync-status + types, recommended-action                  | L      |
| git-primitive | `BaseDistanceStatusResult`                          | `lib/git/base-distance.ts`                  | 1 direct (recommended-action) + drags the `BaseDriftResult` web below                  | L      |
| git-primitive | `BaseDriftResult` (base-drift analyzer)             | `lib/git/base-drift-types.ts`               | 2 — `handlers/base.ts`, `lib/git/base-distance.ts`; deep evidence/overlap/register web | L      |
| git-primitive | `WorktreeRosterResult`                              | `lib/git/worktree-roster.ts`                | 2 — branch-gone-recovery, stale-worktree-sweep                                         | M      |
| per-command   | `ExtensionsSessionInitResult`                       | `commands/extensions/types.ts`              | 3 — extensions handler + format + status (own command trio)                            | S      |
| per-command   | `ConfigSessionInitResult`                           | `commands/config/types.ts`                  | 4 — config trio + status/run                                                           | M      |
| per-command   | `ActiveSessionInitResult`                           | `commands/active/types.ts`                  | 6 — active trio, status/run, recover/audit, view-artifact                              | L      |
| per-command   | `DomainRulesSessionInitResult`                      | `commands/constitution/types.ts`            | 3 — constitution handler + format + status (own command trio)                          | S      |
| per-command   | `UserSessionInitStatusResult`                       | `commands/user/types.ts`                    | 5 — status/run, user trio (handler/format/sync-status), recommended-action             | L      |
| deep-web      | `CurrentHuskAdvisory` (husk / retirement-authority) | `lib/session-init/current-husk-advisory.ts` | envelope-only external reach; large internal stamp / remoteRef / authorization web     | M      |
| deep-web      | `StaleWorktreeSweepResult` (cleanup sweep)          | `lib/session-init/stale-worktree-sweep.ts`  | envelope-only; nested husk-subject / blocked-reason web                                | M      |
| deep-web      | `WorkUnitStateResult` (in-flight oracle)            | `lib/session-init/work-unit-state.ts`       | envelope-only; nested inFlight / classification / nudge web                            | M      |
| deep-web      | `ErrandStateResult` (in-flight oracle)              | `lib/session-init/errand-state.ts`          | 1 — status/run; nested resume / inFlight / materializable / residue / nudge web        | M      |

**Not in this set (this member takes full authority — the tail leaves them alone):** the contained flat advisory
slots — inbox-state, errand-staleness, partial-push-marker, materializable-work-units, orphan-branch,
retired-subdir, class-composition (`inFlightComposition`), cascade (`CascadeResolution`), base-branch-sync,
compaction-advisory — plus the envelope-structure, error-channel, and family records (load-set, task-cursor,
compaction-seed, recovery-audit verdict). These migrate to `z.infer` here.

## Thin validation field map

The session and recovery thin schemas live in `commands/status/schema.ts`. Each named object level uses a
pass-through object schema: the fields below are validated, and every other legitimate field survives unchanged.
Optional fields validate only when present. These helpers remain unregistered because they are deliberately
incomplete views, not independent schema authorities. Their nested pass-through posture does not extend to the
complete session-init, lean-recovery, or recovery-report root: each top-level wire schema is strict and rejects an
undeclared key before validation discards its parsed copy and emits the original object.

### Shared git and deep advisory views

- **`DirtyStateResult`:** pin `state` to `clean | dirty`.
- **`WorktreeSyncStatusResult`:** pin `state` to the full `WorktreeSyncState` union. Its session/recovery envelope
  view also pins `identity.kind` to `primary | linked`; the linked arm retains its unowned path payload. The enriched
  session-init view pins nullable `supersession.superseded` as a boolean because the diverged workflow selects its
  lossless-reset offer from that flag; commit arrays remain pass-through.
- **`BaseDistanceStatusResult`:** pin `verdict` to `clean | reconcile | unavailable | skipped`.
- **`WorktreeRosterResult`:** validate only that the value is an object; no nested roster field drives agent
  dispatch, so its content remains wholly pass-through.
- **`CurrentHuskAdvisory`:** pin `subject.kind` and `stamp.kind`; retain each arm's evidence and path fields
  unchanged.
- **`StaleWorktreeSweepResult`:** pin each report's `kind`, each cleanup decision's `action` and conditional
  `reason`, plus husk `subject.kind` and `stamp.kind`; retain all evidence and action-target fields unchanged.
- **`WorkUnitStateResult`:** pin `inFlight.workUnits[].state`, each report's `behindBase`, and
  `nudge.shouldNudge`; retain the other in-flight facts, marker details, and warnings unchanged.
- **`ErrandStateResult`:** pin `resume.resumable`, `inFlight.errands[].state`,
  `materializable.candidates[].slug`, `materializable.candidates[].branch`, and `nudge.shouldNudge`. Candidate
  identity and branch are non-empty strings because the Materialize arm renders and invokes them; retain other
  resume, materialization, residue, marker, and warning fields unchanged.

### Command-owned and envelope-support views

- **`ExtensionsSessionInitResult`:** pin `mode` to `session-init`.
- **`ConfigSessionInitResult`:** pin `mode` and all twelve session policy domains:
    - `session.remote_sync`: `enabled | disabled`;
    - `session.init_pull.worktree`: `manual | prompt`;
    - `session.init_pull.notes`, `session.init_pull.base`, and `session.init_load.notes`:
      `manual | prompt | always`;
    - `user.notes_push`: `manual | prompt | on-sync`;
    - `branch.protection`: `partial | full`;
    - `pm.mode`: `none | arc-in-git | external`;
    - `commit.format`: `conventional | custom | any`;
    - `commit.context_footer`: `required | recommended | custom | disabled`;
    - `commit.interlock`: `manual | on-task-approval | on-workflow`;
    - `push.interlock`: `manual | on-sync | on-workflow`.
- **`ActiveSessionInitResult`:** pin `mode`, `layout`, `resolution`, nullable `sessionType`, and nullable
  `planningStage` (`draft-design | create-spec | generate-tasks`).
- **`DomainRulesSessionInitResult`:** pin `mode` to `session-init`.
- **`UserSessionInitStatusResult`:** pin `state`, optional `refState`, `contentRelation`, `coherenceState`,
  `qualifier`, `localNoteFreshness.state`, and `notesDrift.direction`. The enriched view also pins
  optional `loadNeeded` as a boolean, `notesDriftSurface.direction` / `register`, and `recommendedAction`.
- **Recommendation-enriched values:** pin `recommendedAction` to `pull | prompt | surface | skip` on worktree,
  user, base-distance, base-branch-sync, and retired-subdir slots; retain prompt text verbatim.
- **`ReleaseRoutingValue`:** pin `taskCommit`, `workflowCommit`, and `workflowPush` to `wrapper | raw`.

`StatusIdentity` and `CompactionSeedWriteStatus` are small family-owned records, not thin views. They receive full
schemas beside the envelope composition and derive their public types through `z.infer`.

## Top-level slot presence contract

The top-level schemas validate the producer domain visible on the wire without recreating hidden probe state. A
two-way rule applies when the assembled envelope itself determines whether the producer always emits the slot; a
one-way rule rejects impossible presence when a failed or hidden helper can still make omission legitimate. The
schema does not infer the private cleanup roster, a degraded worktree-identity result hidden behind an error slot,
or whether the CLI invocation requested a seed write.

| Slot(s)                                                            | Presence policy                                                                                                                                                                                                    |
|--------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Unconditional session-init slots                                   | Require `mode`, `identity`, `user`, `worktree`, `baseDistance`, `baseBranchSync`, `dirty`, `extensions`, `config`, `active`, `domainRules`, `releaseRouting`, `loadSet`, and `recommendedCombinedPrompt`.          |
| `roster`                                                           | Enforce the visible gate in both directions when worktree identity resolved: branch-gone, no active WU, or primary worktree. When the worktree slot failed and hides identity, no stronger relation is observable. |
| `recovery`                                                         | Present iff the worktree is a successful `branch-gone` result and `roster` is successful.                                                                                                                          |
| `sweep`                                                            | On a successful primary-worktree slot, present iff `roster` is successful. Linked cleanup-roster success and worktree-error identity are hidden, so other arms remain structurally optional.                       |
| `currentHusk`                                                      | Presence requires a successful linked, branchless worktree and must itself be a success probe; omission remains valid because advisory failure degrades to absence.                                                |
| `orphanBranchSweep`                                                | Identity-known envelopes require the slot. With identity absent, a successful primary worktree requires it and a successful linked worktree forbids it; a worktree error hides the remaining gate.                 |
| `retiredSubdirs`, `errandSweep`, `inboxState`, `partialPushMarker` | Present iff `identity.identity` is non-null.                                                                                                                                                                       |
| `errandState`                                                      | Present iff both `worktree` and `active` are successful.                                                                                                                                                           |
| `workUnitState`                                                    | Present iff `roster` is successful.                                                                                                                                                                                |
| `materializableWorkUnits`                                          | Present iff `active` is successful with `resolution: none`.                                                                                                                                                        |
| `compactionAdvisory`                                               | Presence requires non-null identity; omission remains valid because the probe is optional at the orchestrator interface.                                                                                           |
| `inFlightComposition`                                              | Presence requires a successful no-active-WU result and successful roster; omission remains valid for an empty or unresolved composition.                                                                           |
| `cohortDocPath`                                                    | Presence requires a successful single-active-WU result with a path; omission remains valid when no coordinating document resolves. The same rule applies to lean recovery.                                         |
| `taskCursor`                                                       | Present iff `active` succeeds with a non-null task-list path that passes the existing load-set path-safety check. The same rule applies to lean recovery.                                                          |
| `compactionSeedWrite`                                              | Invocation-conditional only. Validate the full value when present; do not infer the command flag from the envelope.                                                                                                |

Tests exercise one valid and one invalid mutation for every row with a cross-field rule. They use the Phase 1 arm
fixtures so schema presence checks and byte-level producer characterization share the same state vocabulary.

## Boundary failure disposition

Validation disposition follows trust boundary, not merely which schema failed:

| Boundary defect                                                   | Disposition                                                                         | Exit/output contract                                                  | Work performed                                                      |
|-------------------------------------------------------------------|-------------------------------------------------------------------------------------|-----------------------------------------------------------------------|---------------------------------------------------------------------|
| Internal session-init, lean-recovery, or recovery-report producer | Throw `session-envelope.invalid` through the top-level CLI error boundary           | Non-zero; stable stderr; no stdout                                    | Stop before JSON or text rendering                                  |
| Internal compaction-seed producer                                 | Return `compactionSeedWrite: { status: "failed", reason: "seed-invalid", message }` | Session-init remains successful and emits its original valid envelope | Do not write the seed; do not block compaction                      |
| Malformed, schema-invalid, or version-mismatched persisted seed   | Emit a valid `recover-audit` report stopped with `seed-invalid`                     | Successful machine-readable report                                    | Do not run live recovery probes or construct a replacement baseline |
| Current valid persisted seed                                      | Continue through ordinary recovery audit                                            | Existing ready/stopped report behavior                                | Probe live state and compare it with the seed baseline              |

`lib/session-envelope/validation.ts` owns the shared producer assertion. It validates for effect, discards the
parsed copy, and formats schema issues deterministically with the registered contract id and normalized paths. The
status and report modules export contract-specific assertions that delegate to it. Each complete wire root is a
strict object, so an undeclared top-level key reaches this failure path rather than disappearing only from the
discarded parsed copy.

Tests follow the same boundary split. Schema/assertion unit tests inject malformed internal values directly;
handler-level tests substitute malformed assembled results to prove call placement and no-output rejection. Built
CLI E2E covers externally constructible states — valid exact-byte output and invalid persisted seeds — without a
production environment bypass whose only purpose is manufacturing an internal defect.

## Characterization & test-coverage state

The byte-stability golden matrix is characterize-first work, and the starting coverage is uneven:

- **Compaction-seed — already characterized.** It carries exact-shape characterization today (whole-object
  round-trip, unknown-field stripping, all error kinds). This is the model the other envelope goldens follow.
- **Session-init and recovery-audit — effectively greenfield.** Existing end-to-end coverage only spot-checks a few
  fields and re-declares slots loosely. Build four successful session-init goldens — Orient/materialization,
  linked active resume, linked branchless current-husk, and branch-gone recovery — plus ready/stopped recovery-audit
  goldens, with machine-specific values normalized, **before** changing production assembly. This covers every
  conditional insertion region without a Cartesian product and measures the refactor against locked baselines.

## Result-migration seam map

Concrete loci for the internal `Probe<T>` → `Result` / `ResultAsync` migration (greenfield — the kernel Result has
no production consumers yet):

- **Internal algebra:** every present slot is an independent `ResultAsync<T, SessionStatusError>`. Eager probes
  start independently and their Results resolve through `Promise.all`; `ResultAsync.combine` is not used because
  aggregate failure would discard sibling outcomes. A skipped optional slot is outer `undefined` / `null`, never
  `Ok(undefined)`. Mandatory user identity absence is an `Err`.
- **Focused seam:** `commands/status/result-composition.ts` owns the session error variants, `safeProbe`, immediate
  Result helpers, slot-to-wire conversion, and the small generic gated/user primitives. `commands/status/run.ts`
  retains orchestration and `buildSessionSharedSlots`, which declares eager independent ResultAsync slots rather
  than wire-shaped promises.
- **Internal errors and adapter:** `SessionIdentityMissingError` uses `session.identity-missing`;
  `SessionProbeError` uses `session.probe-failed` and carries slot/probe context plus the original cause;
  `SessionCompositionError` uses `session.composition-failed` and carries operation/slot context plus the cause.
  `SessionStatusError` is the exhaustive union of those three variants. `toProbe()` is the sole conversion point:
  identity absence maps to wire `identity-missing`, the other variants map to wire `runtime`, and every arm
  preserves the internal error's message. Probe/composition messages retain `Error.message` or `String(cause)` for
  a non-`Error` failure.
- **Synchronous composition boundary:** wrap the known fallible load-set projection (`resolveLoadSetManifest`) as a
  composition error. Do not blanket-catch pure recommendation/enrichment transforms or programming defects into an
  arbitrary slot. Use `fromThrowable` / `andThen` where a synchronous operation is intentionally fallible; a
  throwing `map` callback is not the error channel.
- **Orchestrators that assemble results:** `runStatus` (full), `runSessionInitStatus`, `runRecoverStatus`,
  `runSessionHandoffStatus`. Derived and gated stages inspect/map individual Results; each present final slot passes
  through `toProbe()` at envelope construction. Existing fallbacks remain behavioral authority: failed worktree
  identity uses primary, failed supersession yields `null`, and degraded advisories stay omitted where they do now.
- **Kernel surface and import discipline:** re-export `okAsync` / `errAsync` beside `Result` / `ResultAsync` from
  `lib/kernel/result.ts` and `lib/kernel/index.ts`, with kernel Result and exact barrel-surface tests updated. All
  session imports use the barrel; the source-graph audit keeps direct `neverthrow` imports exclusive to
  `lib/kernel/result.ts`.
- **Test placement:** put error, helper, absence, non-`Error`, and exact-adapter coverage in
  `__tests__/unit/status/result-composition.test.ts`; keep `run.test.ts` focused on orchestration, concurrency,
  call-count, gating, fallback, and exact-envelope behavior. Update stale Promise/Probe TSDoc as the seam migrates.
- **Out-of-charter but seam-touched:** the handoff (`session-handoff`) and full-mode (`full`) `status` envelopes
  ride the shared seam but are not validated or goldened here (see the spec's Scope boundary). Their shared slots
  are transitively byte-covered by the session-init golden matrix; their unique slots' producer changes are bounded
  by the compose-site typecheck.

## Performance measurement protocol

The non-gating benchmark lives at `__tests__/benchmarks/session-envelope-validation.ts`, outside Vitest's unit,
integration, and E2E globs, with a dedicated `benchmark:session-envelope` package/root script. It builds once before
sampling and excludes build and fixture-setup time from all measurements.

- **Warm paired measurement:** reuse `__tests__/helpers/session-envelope-compat.ts` to prepare the Phase 1
  Orient/materialization full-slot state, capture one valid session-init envelope during setup, and retain it before
  machine-specific normalization.
  After 20 discarded samples, interleave 1,000 real producer-assertion and no-op fixture-consumption samples so both
  arms see the same object and process conditions. The no-op belongs only to the benchmark harness; it is not
  injectable through the production CLI.
- **Cold production measurement:** prepare one stable local fixture with remote sync disabled, discard 5 built-CLI
  `status --session-init --json` process samples, then record 30. Every process runs the production assertion path;
  there is no flag, environment variable, config key, or alternate binary that disables validation.
- **Recorded evidence:** capture operating system, architecture, Node/npm versions, build command, fixture state,
  sample/warm-up counts, p50, and p95 for the paired validation delta and the complete cold command. Record observed
  results beneath this section when Task 7.2 runs.
- **Materiality:** stop for an evidence-plus-replacement-invariant decision if validation p50 exceeds 5 ms or 5% of
  cold-command p50, or validation p95 exceeds 20 ms. Otherwise retain always-on validation. The benchmark never
  becomes a wall-clock CI assertion.

### Observed benchmark evidence

One production build and benchmark run on 2026-07-20 produced the following non-gating evidence:

| Measurement             | p50         | p95         |
|-------------------------|-------------|-------------|
| Validation assertion    | 0.0420 ms   | 0.1079 ms   |
| No-op fixture consume   | 0.0001 ms   | 0.0003 ms   |
| Paired validation delta | 0.0419 ms   | 0.1076 ms   |
| Cold built CLI command  | 254.8607 ms | 266.9090 ms |

- **Environment:** Linux 5.15.167.4-microsoft-standard-WSL2, x64, Node v26.3.0, npm 11.16.0.
- **Procedure:** `npm run benchmark:session-envelope` built once, prepared the Orient/materialization and
  remote-sync-disabled Orient fixtures once, discarded 20 and recorded 1,000 paired warm samples, then discarded 5
  and recorded 30 built-CLI cold samples. Build and fixture setup were excluded from measured intervals.
- **Interpretation:** the paired p50 was 0.0165% of cold-command p50. The assertion stayed below the 5 ms p50,
  5%-of-cold p50, and 20 ms p95 thresholds, so validation remains always on. The cold measurement includes process
  startup and ordinary command work; the paired in-process delta isolates parsing against a preconstructed schema
  and the same captured object. This single run does not attribute finer causal shares.
