# Draft: Cutover Decompose Removal

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03); carved from that work unit's draft.
- **Purpose:** Remove the repository-backed decomposition machine while preserving decomposition over stored records.
- **Planning posture:** `P1`, a Gate B Should. Plan alongside `cutover-flip` as far as its state allows; this unit does
  not hold the window, and unfinished planning completes after the flip (Owner, 2026-11-16, replacing the cut's
  implementation-ready-before-flip rule). If it has not landed by the start of the product-renames sweep, it waits
  until after the deadline, and its `naming-conventions` edge is dropped then, at the Owner's call.

---

## Planning state

- **Readiness:** formalization-ready; deletion rules and success signal settled, capture review pending. Exact
  inventory remains an input to final task generation, not an open design choice.
- **Resolved at the cut** (Owner, 2026-11-03; `cohort-storage-cutover.md`):
    - this member's scope and items, below, and its Gate B placement;
    - it stays whole although it crosses the size mark of about 10,000 changed lines: it is a pure deletion of one
      self-contained subsystem.
- **Resolved on 2026-11-17:** the deletion boundary, survivor protection, late inventory, and escalation rules below
  (Owner, adopting the PM's proposed guardrails).
- **Open:** the exact deletion and test inventory, measured against the flip's fixed head or landed base; the
  dependency checks in § Unknowns and Assumptions remain unverified.
- **Next:** complete draft review, then a short spec carrying the deletion rule. Final task-file lists wait for the
  inventory basis. Implementation waits on `cutover-flip`.

The inbound items keep the numbers they had in `storage-cutover`'s buffer, shown in their headings. An
item cited here that this draft does not hold is in another member's draft under the same number.

---

## Scope

The historical measurement on 2026-11-03 in `packages/arc-framework/src/`, before tests, was 37 `decompose-v3` and
`git-decompose-*` modules in `lib/work-unit/`, about 14,100 lines, plus the repository-backed arm of
`handleDecompose` (`handlers/decompose.ts`). This is a starting boundary, not the final file inventory.

**Deletion rule:** within that old machine, whatever the store version imports survives; the remainder goes with its
dead callers. Follow shared dependencies outward, removing a module or export only with its last caller. A filename
prefix or the absence of a store import alone never authorizes deleting a shared live dependency.

- **#25's deletion set,** which this draft holds: every module the store version does not import, with
  `decompose-candidate.ts`'s callers in teardown (`verbs/teardown.ts`) and in-flight derivation
  (`in-flight-derivation.ts`). `cutover-flip` takes #25's representative rehearsal cut and workflow end state.
- **What `cutover-in-repo-removal` leaves for it:** each module the old machine reaches, directly or through what it
  calls, deleted with its last caller: the transition-record cluster, `transition-overlay.ts`, `artifactMatcher` and
  `pruneEmptyBacklogSource`, `resolveProjectReadinessViewInput`, `deriveInFlight` (`lib/git/in-flight-derivation.ts`)
  and the readers it reaches, `remote-ref-reader.ts`'s meta-at-ref readers among them, and the `ProtectionMode` type
  where nothing else uses them (`cohort-storage-cutover.md` § Coordination).
- **Obsolete option references:** remove `v3DecomposeAdvanceBaseArgv`, `renderV3DecomposeAdvanceBaseCommand`, the
  `advanceBase` entry in `DECOMPOSE_MODE_KEYS`, and the field in `DecomposeCommandInputSchema` with its option mapping
  in `decomposeCommandInputRegistration`, with the repository arm's last caller. Check the `--finish <map>` form by
  the same rule, preserving bare `--finish` and its `--apply` authority. The CLI registrations, store refusals, and
  shared schema's obsolete error-message wording stay with `cutover-tracked-state-removal`.
- **Tests:** delete suites and fixtures whose sole subject is deleted behavior; remove obsolete cases from mixed
  suites while preserving coverage of the store path and shared survivors. Derive exact test paths with the code
  inventory, rather than treating every test named `decompose` or `v3` as obsolete.

### Survivors and behavior boundary

Decomposition remains supported. `handleDecompose` selects `runStoreDecomposeCommand` when `usesOffBranchState`
holds. The store dispatcher calls `runStoreDecomposePreflight`, `runStoreDecomposeAdditive`,
`runStoreDecomposeFinish`, `runStoreDecomposeRevisionStarter`, `runStoreDecomposeRevision`, and
`runStoreDecomposeDiscard` for its respective modes.

`runStoreDecomposeAdditive` creates member/cohort scaffolds and the stored map through an atomic batch, followed by
destination authoring. `runStoreDecomposeFinish` prepares retirement or extraction and checks the preview's apply
authority before application. Retirement removes the origin through `applyDecomposeRetirement`; extraction keeps
it through `finishDecomposeExtraction`. These capabilities and their behavior stay intact.

Keep `lib/decompose/`, `handlers/decompose-store.ts`, `decompose-content.ts`, and `decompose-command-renderer.ts`,
apart from the obsolete option references above. For example, `scanV3DecomposeContent` and
`resolveV3DecomposeContentLocator` serve store conservation, and `renderV3DecomposeArgv` renders its continuations;
their `V3` names do not make them deletion candidates.

### Exclusions and escalation

- No store-decomposition redesign, behavior improvements, new helpers, abstractions, refactors, or deletion tooling.
  A one-off inventory check is sufficient; this unit introduces no deletion framework.
- No representative rehearsal cut or workflow rewrite: `cutover-flip` owns both shares of #25.
- No product renames, `cutover-in-repo-removal`'s own deletion set, or anything assigned to
  `cutover-tracked-state-removal`.
- Return to the Owner before keeping something the rule deletes, deleting something it preserves, changing a
  survivor beyond removing a reference to deleted code, or touching another unit's scope. An overlapping module is
  a boundary decision, not permission to absorb the other unit's work.
- Keep this a short deletion plan. If it grows materially beyond this draft, its inventory, and the two inbound
  concerns, return to the Owner to decide whether the growth is scope.

---

## Inventory, order, and verification

Take the exact inventory from the flip's fixed head, or from `main` after it lands, and record the commit used.
Search imports, exports, command-input schemas and mappings, registrations, callers, tests, and fixtures for the old
machine and the obsolete option forms. Retain direct and transitive dependencies needed by the store path or any
other live caller. For mixed modules, enumerate removable exports rather than deleting the file. Check each shared
module against the sibling deletion boundaries before assigning it here.

Remove callers and the repository-backed handler arm before their dependencies; then delete the old machine and
shared exports whose last callers disappeared. Remove obsolete-only tests and references with the corresponding
code. This unit and `cutover-in-repo-removal` can land in either order: leave a shared module while the other still
has a live caller.

The success signal is an exhausted old-machine inventory with no dangling live references, both source and test
type checks passing, the surviving store-decomposition suites passing, and a disposable ref-store fixture completing
`arc decompose` through the built CLI. Exercise retirement and extraction, including preflight, additive creation,
authoring, and approved finish, with no candidate-branch or base-advancement step. Use the existing suites and test
harnesses; choose their exact files from the inventory basis. This verifies preservation after deletion and does not
repeat the flip's representative rehearsal or its hardening closeout.

**ADR disposition:** none. Removing unused implementation and references is a tactical code-organization change
obvious from the retained callers; this unit makes no new architecture or external-contract decision. The inventory
order and use of existing verification are tactical choices too.

---

## Unknowns and Assumptions

The deletion rule is settled now; exact file lists are intentionally late. Do not substitute today's pre-flip tree
for the implementation basis or infer that unfinished prerequisites passed. Re-check these assumptions when the named
flip tasks close and again against the inventory commit:

| Assumption                                                                     | Flip evidence to re-check                                                       | Effect here                                                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| The default store selects off-branch state.                                    | Task 3.3; `createStore` and the branch in `handleDecompose`.                    | The repository arm has no supported default caller.                                                       |
| Surviving tests use the ref-store path and old-substrate tests are identified. | Tasks 3.4.b and 3.6; classified fixtures and callers.                           | Preserve the right suites and remove only old-machine coverage.                                           |
| Help describes the store forms.                                                | Task 4.2.c; the `arc decompose` option descriptions.                            | Coordinate obsolete-option cleanup with tracked-state removal; do not take its registrations or refusals. |
| Store decomposition works on the flipped copy.                                 | Task 6.4.e; the representative cut required by § 9.9 of `spec-cutover-flip.md`. | Use that rehearsal as the flip prerequisite, then verify this deletion separately.                        |

The flip's decomposition workflow rewrite is already recorded by Task 5.7; it remains outside this unit. The
cohort's older planning deadline is superseded by the 2026-11-16 direction recorded above. Changes to these assumed
contracts, unexpected live old-machine callers, and sibling-boundary conflicts return to the Owner before changing
the adopted scope. Neither the late inventory nor a failing prerequisite authorizes survivor behavior changes.

---

## Inbound dispositions — 2026-11-17

Both items are covered by the adopted deletion boundary; nothing remains held.

| Entry                                                                                                                     | Outcome                   | Shapes / fold location                                       | Basis                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #25, routed at the 2026-10-19 drain from `seam-decomposition`'s 2026-10-16 draft close.                                   | Fold deletion share here. | § Scope and § Inventory, order, and verification.            | Own-work coverage; rehearsal and workflow shares are already assigned to the flip's § 9.9 / Task 6.4.e and § 8.8 / Task 5.7; their hardening closeout criteria are unchanged.           |
| `--advance-base` parse/render leftovers, routed at the 2026-11-16 drain from the 2026-11-10 tracked-state-removal review. | Fold here.                | § Scope, obsolete option references and survivor exceptions. | Own-work coverage; remove internal leftovers with their last caller, and apply the same check to map-valued `--finish`; sibling registrations and store refusals stay with their owner. |

---
