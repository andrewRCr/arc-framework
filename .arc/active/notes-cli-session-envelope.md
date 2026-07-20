# Notes: cli-session-envelope

## Contents

- [Tail-routed value-type inventory](#tail-routed-value-type-inventory)
- [Characterization & test-coverage state](#characterization--test-coverage-state)
- [Result-migration seam map](#result-migration-seam-map)

## Tail-routed value-type inventory

The types below are the ones this member validates **only at their dispatch discriminant** (a thin pass-through
schema). Full schema-authority migration (`z.infer`, hand-written type retired) routes to
`cli-substrate-complete-migration`, which also tightens each thin schema to a full one as it takes authority. This
inventory is the scoped hand-off — it exists so the tail inherits an enumerated set, not an open re-discovery.

**Reading the table.** *Blast radius* counts **genuine sibling consumers** — files importing the type beyond the two
composition sites every slot shares: the `lib/git` barrel (`lib/git/index.ts`) and the envelope itself
(`commands/status/types.ts`). *Bucket* folds external reach and internal nesting depth into an S/M/L
authority-migration cost. Exact field counts are intentionally omitted (focused inventory). Each git primitive and
deep web nests further — the ~14 top-level routed types fan out to roughly a hundred nested types — and tightening
that nesting is the tail's work.

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

## Characterization & test-coverage state

The byte-stability golden is characterize-first work, and the starting coverage is uneven:

- **Compaction-seed — already characterized.** It carries exact-shape characterization today (whole-object
  round-trip, unknown-field stripping, all error kinds). This is the model the other two goldens follow.
- **Session-init and recovery-audit — effectively greenfield.** Existing end-to-end coverage only spot-checks a few
  fields and re-declares slots loosely. Build a full-shape golden for each — with machine-specific values (paths,
  object ids, timestamps) normalized — **before** changing production assembly, so the refactor is measured against
  a locked baseline rather than a loose one.

## Result-migration seam map

Concrete loci for the internal `Probe<T>` → `Result` / `ResultAsync` migration (greenfield — the kernel Result has
no production consumers yet):

- **Core seam:** the `safeProbe` wrapper in `commands/status/run.ts` — the throw → `{ kind: "runtime" }` mapping
  every slot funnels through, and `buildSessionSharedSlots` (same file) which the handoff and full-mode
  orchestrators also ride.
- **Orchestrators that assemble results:** `runStatus` (full), `runSessionInitStatus`, `runRecoverStatus`,
  `runSessionHandoffStatus`. The `Promise<T>` slot producers become `ResultAsync<T, ProbeError>`.
- **Error channel:** `ProbeError` (`commands/status/types.ts`) is the wire error `{ kind: "identity-missing" |
  "runtime", message }`. Internal kinds may subclass the kernel error base for richer context, but an explicit
  boundary adapter maps back to the legacy `{ kind, message }` on emit — emitting a dotted code or a stringified
  error is a silent wire regression.
- **Import discipline:** `Result` / `ResultAsync` come only through the kernel barrel (`lib/kernel/index.ts`); a
  compile-time boundary audit forbids importing neverthrow directly.
- **Out-of-charter but seam-touched:** the handoff (`session-handoff`) and full-mode (`full`) `status` envelopes
  ride the shared seam but are not validated or goldened here (see the spec's Scope boundary). Their shared slots
  are transitively byte-covered by the session-init golden; their unique slots' producer changes are bounded by the
  compose-site typecheck.
