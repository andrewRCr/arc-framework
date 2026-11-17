# Spec (`outline`): cutover-decompose-removal

- **Origin:** [internal]
- **Purpose:** Remove repository-backed decomposition while preserving decomposition over stored records, eliminating
  the unused candidate-branch machinery and its dead dependencies.

---

## Problem / Context

Decomposition distributes one work unit's planning content and dependencies among authored destinations. The CLI
contains two implementations: `handleDecompose` selects `runStoreDecomposeCommand` when `usesOffBranchState` holds,
and otherwise runs the repository-backed machine. The latter plans over Git trees and creates decomposition
candidates; the store implementation operates on versioned records and remains supported.

Implementation begins only after the repository has switched to the ref store for planning and operational state.
The required prerequisite contract is that `createStore` selects off-branch state by default, surviving test callers
use that backend or explicitly identify an old-substrate subject, help describes store decomposition, and a
representative decomposition cut has passed on a flipped repository copy. These conditions are not claims that the
unfinished switch and rehearsal already passed.

## Decisions

1. **Delete the old machine by its callers.** Remove the remaining repository-backed arm of `handleDecompose`, the
   `decompose-v3` and `git-decompose-*` implementation in `lib/work-unit/`, and the old candidate callers in
   `lib/work-unit/verbs/teardown.ts` and `lib/git/in-flight-derivation.ts`. Within that machine, whatever the store
   implementation imports survives; follow shared dependencies outward and delete a module or export only with
   its last caller. Neither a filename prefix nor the absence of a store import proves a shared dependency dead.

2. **Preserve the store implementation and shared helpers.** Keep `lib/decompose/`, `runStoreDecomposeCommand`
   (`handlers/decompose-store.ts`), `decompose-content.ts`, and `decompose-command-renderer.ts`, except for obsolete
   references explicitly covered below. Preserve preflight, additive creation, retirement, extraction, revision,
   discard, destination authoring, and preview/apply authority. In particular, keep `scanV3DecomposeContent`,
   `resolveV3DecomposeContentLocator`, and `renderV3DecomposeArgv`; their names do not make them obsolete.
   `runStoreDecomposeAdditive` atomically creates member/cohort scaffolds and the stored map before destination
   authoring. `runStoreDecomposeFinish` checks the terminal preview's apply authority before retirement or
   extraction: retirement removes the origin, whereas extraction preserves it. The terminal batch lands the cut.
   This deletion changes none of those capabilities or behaviors.

3. **Remove internal option leftovers with their old callers.** Remove `v3DecomposeAdvanceBaseArgv`,
   `renderV3DecomposeAdvanceBaseCommand`, the `advanceBase` entry in `DECOMPOSE_MODE_KEYS`, and remaining
   old-library references with their last callers. Apply the same check to map-valued `--finish`, preserving bare
   `--finish` and its `--apply` authority. Exposed-option removal owns the CLI registrations, obsolete fields in
   `DecomposeCommandInputSchema`, their mappings in `decomposeCommandInputRegistration`, handler branches reached
   only through that input, the store dispatcher's obsolete-option refusals, and obsolete schema-error wording.
   This change removes the remaining repository-backed machinery and old renderer/routing residue. If a separate
   removal has not yet removed a live caller, retain its dependency until that caller goes.

4. **Remove shared residue only when unused.** The candidate set includes the transition-record cluster
   (`git-transition-record-enumeration.ts`, `terminal-transition-record-writer.ts`, `transition-record-store.ts`),
   `transition-overlay.ts`, `artifactMatcher` and `pruneEmptyBacklogSource` in `mutators/relocate-artifacts.ts`,
   `resolveProjectReadinessViewInput`, `deriveInFlight` and its branch-tree readers, and the unused `ProtectionMode`
   type. For mixed modules, remove only obsolete exports: meta-at-ref readers may leave `remote-ref-reader.ts`
   while its live network helpers survive. Preserve every other live caller's dependency. This permits the old
   decomposition removal and the broader in-repo implementation removal to land in either order.

5. **Inventory late, then remove callers before dependencies.** Take the exact source and test inventory from the
   fixed switch head or the landed base, recording the commit. Re-check the prerequisite contract there. Search
   imports, exports, schemas, option mappings, registrations, callers, tests, and fixtures; trace both direct and
   transitive reach from the store path and other live consumers. Check shared modules against adjacent removal
   boundaries before assigning them here. Remove old callers and the repository-backed handler arm before their
   dependencies, with obsolete-only tests and references removed alongside the corresponding code. Delete a suite
   or fixture only when its sole subject is deleted behavior; retain store/shared-helper assertions in mixed suites.

6. **Keep one deletion concern.** This remains one work unit despite the historical pre-test estimate of about
   14,100 source lines across 37 old-machine modules: it deletes one subsystem, and another branch or review would
   not reduce the subsystem a reviewer must understand. Exact counts are inventory results, not deletion criteria.
   Use existing verification and test harnesses; introduce no deletion framework or persistent inventory tooling.

**ADR dispositions:** none for these decisions. They remove unused implementation and references, preserve the
existing store contract, and make tactical code-organization and verification choices; no new architecture or
external-contract decision is introduced.

## Scope boundary (No-gos)

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- No store-decomposition redesign, behavior improvements, renames, new helpers, abstractions, refactors, or tooling
  beyond a one-off inventory check.
- No workflow rewrite, representative cutover rehearsal, or change to the decomposition hardening closeout criteria.
  The required rehearsal is prerequisite evidence; verification here checks preservation after deletion.
- No broader in-repo store/capability collapse, tracked-state command or hook removal, exposed-option registrations,
  obsolete command-input fields/mappings and their exclusive handler branches, store-refusal removal, or product
  renaming. Shared internal modules leave here only under the last-caller rule; sharing a module does not transfer
  another removal's scope.
- Return for Owner direction before keeping something the rule deletes, deleting something it preserves, changing
  a survivor beyond removing a reference to deleted code, or crossing an adjacent removal boundary. Unexpected
  live old-machine callers require that decision before changing the adopted scope.
- Keep the plan bounded to the deletion set, its rule and order, survivor protection, and verification. Material
  growth beyond those concerns requires an explicit scope decision.

## Consequences & Risks

The obsolete implementation and its test burden disappear while store decomposition remains available. Shared
modules may temporarily remain because another live caller still needs them; that is required preservation, not
authority to remove the caller or redesign a survivor. A stale inventory could delete a newly shared dependency or
leave an orphan, so the recorded implementation basis and full caller search govern the exact removal set.

Final file lists wait for a fixed switch head or landed base. Planning may establish these rules earlier, but neither
unfinished prerequisites nor the late inventory justify implementing against today's pre-switch tree. If any
prerequisite contract changes or fails, resolve its effect before implementation; do not compensate through an
unapproved store-behavior change. This work does not hold the cutover window. As a release Should, if it misses the
start of the product-renaming sweep, it waits until after the deadline and that sweep's dependency on it is removed
at the Owner's call.

## Success Criteria

- The recorded source/test inventory is exhausted: old repository-backed decomposition and its dead callers are
  removed, no dangling live reference remains, and every retained shared module/export has a live caller.
- Both source and test type checks pass, and the surviving store-decomposition and shared-helper suites pass.
- A disposable ref-store fixture completes retirement and extraction through the built `arc decompose` CLI,
  including preflight, additive creation, destination authoring, and approved finish. No decomposition candidate
  branch or base-advancement step is needed. The retained store behavior and preview/apply checks remain intact.

## Open items

No open design decisions. Exact files and existing verification cases are selected against the recorded fixed
switch head or landed base before the task list is finalized. Until that basis and the prerequisite evidence are
available, implementation and final task-file enumeration wait.

## Amendments

None.

---
