# Notes: seam-status-roadmap

## Contents

- How the rows were checked
- Corrections across rows
- Rows
- Files no row covers
- What `seam-lifecycle` changed in the shared files
- Provider contracts against the code
- Neighbors' tasks on shared surfaces
- Grounding baseline for the task list
- Implementation facts by phase

## How the rows were checked

The rows are the 29 of `notes-storage-contract.md` § Consumer map, "Status and roadmap", re-verified at `19018e64c`
(2026-10-16), which carries the merged `seam-lifecycle` (PR #1027) and `seam-record-kinds`. Three read-only sweeps ran:
one over the 29 rows, running the ratchet's predicates (`findArchitectureImportViolations`,
`eslint/architecture-imports.ts`) over every file, whose counts all match `eslint-suppressions.json`; one over the
coupled files no row names; and one over the provider contracts the design consumes. The sweeps' findings are advisory.
Each one the design acts on was checked against source before it entered the design; those are marked **verified**, and
the rest stand as the sweeps reported them. A citation is the file and symbol first, its line only where the line is the
evidence. Floors read `store-raw-state / surface-names / work-unit-paths`.

| Verdict                | Rows |
| ---------------------- | ---- |
| Confirmed              | 6    |
| Drift                  | 22   |
| Re-point (split files) | 1    |
| Obsolete               | 0    |

No row points the wrong way. Most drift is an omitted register key, a stale line citation, or a family reached through
the shared index that only the direct caller's row names.

## Corrections across rows

- **One file in the partition checks the capability** (**verified**): `handlers/status/lifecycle.ts`, lifecycle's
  store arm (`usesOffBranchState`, `handleStoreLifecycleStatus`). Every cutover-owned path that writes, renders, or
  checks ROADMAP runs unconditionally. The stops that exist are lifecycle's and indirect: `executeStoreTransition` runs
  only `edge.fromFlip.sideEffects`, which no edge sets to `reconcile-roadmap` or `reconcile-status-user`, and
  `handleStoreStart` returns before `refreshRoadmapForStartCeremony` (`handlers/start.ts`).
- **Entry points with no store in scope:** the `pre-commit` hook (bash, gated on `pm.mode`), the assert and remedy
  scripts, the merge driver (git config), `arc init`, `arc join`, and `arc update`. On the merged base every
  `arc status` mode but the slug query has no store too, since `SessionStatusContext` carries none (**verified**); the
  `seam-locus` branch gives the context a store and synchronization port (`store`, `storeSync`,
  `createSessionStatusContext`), which the spec's dispatch takes (§ 7).
- **Two writes no row names** (**verified**): `handleStagedProjectStatus` (`--project --staged --write`,
  `handlers/status/views.ts`) writes ROADMAP by temp-then-rename, and `assembleStatusUserView` writes `STATUS.USER.md`
  whenever `writeFile` and `mkdir` are supplied, which `handleUserStatus` does on every rendered `arc status --user`.
- **The composition backs the in-repo store** (**verified**): `composedMetas` (`lib/store/in-repo/meta.ts`) calls
  `resolveCallerComposedLifecycleIndex`, which reaches `resolveProjectReadinessComposition`. The in-repo `list` is the
  composition's output, so the composition cannot be fed from it without a cycle; it is in-repo discovery and leaves at
  the cutover.
- **The render half sits in a cutover module.** `roadmap-regeneration-assert.ts` holds
  `renderRoadmapFromIndexViewResult`, `resolveStagedTransitionOverlays`, `createIndexProjectViewFs`, and `ROADMAP_PATH`,
  which `views.ts`, lifecycle's `executor-context-status.ts`, and `commands/rename.ts` import; only
  `assertRoadmapRegenerated` and `ROADMAP_RERENDER_INSTRUCTION` are the assert half.
- **Key 13 is missing** wherever a hand-built state path or meta filename appears: `commands/active/status.ts`,
  `handlers/status/lifecycle.ts`, `project-view-ref.ts`, `roadmap-regeneration-assert.ts`, `merge-composition.ts`,
  `view-artifact.ts`, `authority.ts`, `selection.ts`, and `setup.ts`.
- **Key 29 is missing** where status calls `deriveInFlight` directly: `resolveOracleCandidates` (`project-view.ts`) and
  `runStatusUserView` (`user-view.ts`); both rows also omit `wu.meta`, since the oracle reads metas at branch tips.
- **Transitive families.** The shared index's thin callers — the assert script, the remedy module, and
  `project-roadmap-render.ts` — name only `derived`; through it they also read `wu.meta`, `placement`, `lineage` (staged
  transition overlays), and `errand.record` (`resolveProjectErrandOracleContext`).
- **Ratchet blind spots.** A literal without the trailing slash or outside the regex goes uncounted (`.arc/active`,
  `.arc/backlog/...`, `.arc/completed/`), and so does a surface name reaching a file through an imported constant:
  `ROADMAP_PATH` into `views.ts` and `IDENTITY_STATUS_FILENAME` into `assemble-user-view.ts` leave both floors at 0
  though both files write those surfaces. The floors understate this member's remaining work.
- **Key 06 (the archive listing) sits on no status row.** Nothing renders an archive listing; the data is
  `WorkUnitReadPlacementSchema`'s completed variant, `{quarter, sequence}`.
- **Store helpers already exist for the flip arm:** `listLifecycleIndex` and `readLifecycleView` (`list` with parsed
  fields: owner, cohort, `dependsOn`, priority, `workClass`, pause), `readWorkUnit` (`lookup` by slug),
  `readLifecycleDesign` (the design and its purpose), `resolveCurrentWorkUnit` (the claim), and `store.version()` for a
  render stamp.

## Rows

- **`validate-links.sh`** — Drift. The movable-artifact rule landed after the freeze (`is_movable`); add key 12 and
  `wu.meta`, `wu.prose`, `cohort` by filename prefix. Once state is not staged, the pre-commit link check never sees
  those files; it ships in every project's hook (`init-recipe.json`), the general Markdown check other projects get, the
  hook's checks of state files' shape having their own register row. From the flip it reads no state, a departure from
  key 05 that `spec-seam-status-roadmap.md` § 9.3 records, with checks over state split between `storage-projection`'s
  selection and `projected-markdown-checks`' check.
- **`cli.ts`** — Drift. Misses `arc status`'s `--staged`, `--write`, and `--user` options (keys 18, 53); the inbox
  verbs it describes carry keys 19 and 21. Floors 0/11/0. Cutover paths: the hidden remedy command and
  `--regenerate-roadmap` forwarding.
- **`command-input-registrations.ts`** — Drift (minor). Aggregates the remedy's, base's `regenerate-roadmap`, and
  status's `staged` / `write` policies; each entry goes with its owner. Floors 0/0/0.
- **`commands/active/status.ts`** — Drift. Add `delivery-review` (`projectCandidateIntegrationBoundary`), key 13
  (`resolveReaderOptions`, `deriveCompanions`, `^meta-` patterns), and key 14 (`PLANNING_BRANCH_PATTERN`). Exports
  `resolveTaskListPath` to eight callers. Floors 2/2/0.
- **`handlers/base.ts`** — Drift (minor). `baseRegenerateRoadmapPolicy` and `handleBaseMerge`'s `conflictRemedy`
  mapping; shared with lifecycle (`handleBaseSync`, which now builds a store). Floors 0/1/0.
- **`handlers/status.ts`** — Re-point (split by #812, `d8813fa47`): dispatch and part (d) stay (`handleStatus`, 2/1/0,
  locus's); (a) the slug query to `status/lifecycle.ts` (1/1/0, lifecycle's store arm shipped); (b) `--user` and (c)
  `--project`, `--staged`, `--write` to `status/views.ts` (1/0/0); (d) to `status/session*.ts`; the schema to
  `status/input.ts`. Bare `arc status` (`handleCompositeStatus`) is assigned to no member.
- **`handlers/view.ts`** — Drift. Add `wu.tasks`, `cohort`, `errand.record`, and keys 29, 14, 33, 79. A completed
  target is refused today ("completed viewing is unsupported"), so serving one is new behavior. It also calls the
  user-surfaces resolver (`resolveUserSurfaceResolver`), which `spec-seam-locus.md` § 10.3 does not move, so moving it
  is this member's (**verified**). Floors 2/0/0.
- **`lib/layout/projection.ts`** — Confirmed. `project-document` maps to `.arc/backlog/ROADMAP.md`.
- **`lib/layout/schema.ts`** — Drift. `WorkUnitArtifactKindSchema` cannot derive from the registry: the
  `layout-dependencies` predicate limits `lib/layout` to `zod`, `node:path`, the kernel, and itself (**verified**). Add
  `derived` and key 18 (`ProjectDocumentKindSchema`, whose `roadmap` document `ROADMAP_PATH` resolves through
  `resolveArcPath`). The `project-document` address, with that one document, stays past the cutover: storage-projection
  resolves `ROADMAP.md` through it for its never-adopted rule (Task 5.8.c - `tasks-storage-projection.md`), and its
  `lib/layout` implementation (`projection.ts`, `identification.ts`, `index.ts`, and `registry.ts`'s
  `layout-project-document-kind` schema ID) stays with it. Its other readers are ROADMAP's in-repo arms, which leave
  in the cutover's deletion pass — `handlers/start.ts`, `roadmap-regeneration-assert.ts`, and lifecycle's and
  decomposition's `readiness-regen.ts`, `park-planning-landing.ts`, `direct-retirement-driver.ts`,
  `decompose-v3-repository-plan.ts`, `git-decompose-v3-destination-validation.ts`, and `git-decompose-v3-finish.ts` —
  and the lifecycle classification (`PROJECT_DOCUMENT_TREATMENT`, `lib/evidence-applicability/path-treatment.ts`, and
  `lib/delivery/lifecycle-contribution.ts`), which the register's lifecycle-classification row governs
  (**verified**).
- **`lib/markdown/authority.ts`** — Drift. Add `placement`, `personal`, keys 12 and 13; `derived-readiness` routes to
  `regenerate`, whose remedy text lives in the unrowed `lib/markdown/contracts.ts`; both leave in the cutover's deletion
  pass. Floors 0/3/0.
- **`lib/markdown/descriptor-worktree.ts`** — Confirmed. It reads `selection.ts`'s worktree view
  (`enumerateTrackedMarkdownPaths`), so projected task lists drop out of its check from the flip (**verified**).
- **`lib/markdown/selection.ts`** — Drift (minor). Add `placement` and keys 12 and 13. Floors 0/1/0. From the flip
  neither view sees state (key 05; `spec-seam-status-roadmap.md` § 9.3 records the departure). Its worktree view has
  other readers — `prepareMarkdownMigrationInputs` (`lib/markdown/migration-audit.ts`), which reads each path's HEAD
  blob, and `validateExplicitMarkdownPaths` — so widening it reaches them too (**verified**).
- **`lib/setup.ts`** — Drift. `configureRoadmapConflictRemedy` writes the merge driver's git config and the tracked
  `.gitattributes` attribute, from `init`, `join`, and the unrowed `commands/update.ts`. Add key 13 and
  `machine-local`. Floors 0/4/0.
- **`lib/status/assemble-user-view.ts`** — Drift. Add op `write`, families `wu.meta` and `errand.record`. The store
  already treats `STATUS.USER` as derived (`personalFileReference`, `notesDirectory`, `DISCARDABLE_GENERATED_CACHES`);
  the legacy notes sync appears still to carry it (read, not executed). Floors 0/0/0 (blind spot).
- **`lib/status/project-oracle-context.ts`** — Drift (minor). Add key 62; reads `arc.identity` only
  (`readConfiguredIdentity`). Floors 0/0/0.
- **`lib/status/project-roadmap-render.ts`** — Drift. Not the render engine but the tracked-ROADMAP wrapper; its one
  caller (`refreshRoadmapForStartCeremony`) already sits behind `handleStoreStart`. Floors 1/0/0.
- **`lib/status/project-view-ref.ts`** — Drift (minor). Add keys 12 and 13; its one caller already stops at the flip.
  Floors 0/1/0.
- **`lib/status/project-view.ts`** — Drift. Add `wu.prose`, `errand.record`, `lineage`, key 29; the `version` op is
  `resolveProjectReadinessRenderStamp` (`git rev-parse`). Parked comes from `isParkedPointer` and
  `scheduling: "parked"`; `readProjectMeta` drops the meta's pause (**verified**). Floors 2/1/2.
- **`lib/status/ready-mine-source.ts`** — Confirmed. Floors 2/1/0.
- **`lib/status/roadmap-conflict-auto-remedy.ts`** — Drift (minor). Add the transitive families and key 05. Floors
  0/4/0.
- **`lib/status/roadmap-regeneration-assert.ts`** — Drift. Add keys 01, 05, 13, 14 and `errand.record`; holds both
  halves (§ Corrections across rows). Floors 3/1/0.
- **`lib/status/user-view.ts`** — Confirmed, with the key-29 and `wu.meta` note. Floors 0/1/0.
- **`lib/view-artifact.ts`** — Drift. Add `wu.meta`, `cohort`, `wu-workspace`, keys 13, 17, 47; the project inbox path
  is hand-built though a layout address exists. Floors 0/2/2.
- **`lib/view/types.ts`** — Confirmed. `VIEW_KINDS` is a hand-kept list (**verified**).
- **`scripts/assert-roadmap-regenerated.ts`** — Drift (minor). Its one caller is the `pre-commit` check, with no CLI
  fallback. Floors 0/0/0.
- **`scripts/base/merge-composition.ts`** — Drift (minor). A hard-coded `.arc/backlog/ROADMAP.md`; the arm commits
  with `--no-verify`. Floors 0/1/0.
- **`scripts/base/merge.ts`** — Drift (minor). Re-cite the port and pass-through. Floors 0/0/0.
- **`scripts/integration/errand-merge.ts`** — Drift (minor). The same `--regenerate-roadmap` argv is also emitted by
  the unrowed `scripts/integration/checkpoint.ts`. Floors 0/0/0.
- **`scripts/remedy-roadmap-conflict.ts`** — Confirmed. Floors 0/1/0.

## Files no row covers

This member's, by the partition:

- `handlers/status/views.ts` (1/0/0) — the split target of parts (b) and (c): the ROADMAP writer and the
  `STATUS.USER` cache write (**verified**), the live project view, and the Errand index projection.
- `handlers/status/input.ts` (0/0/0) — `--staged` and `--write`.
- `lib/status/work-unit-purpose.ts` (1/0/0) — the path and `<ref>:<path>` readers and the design selection.
- `lib/status/project-horizon.ts` and `lib/status/in-flight-mine.ts` (0/0/0) — read `scheduling: "parked"`.
- `lib/view/started-artifacts.ts` (1/0/0) — `arc view`'s started-target reads.
- `lib/markdown/format-plan.ts` (1/0/0) and `format-write.ts` (0/0/0) — a meta normalizer that writes outside the
  executor with no write-context check.
- `lib/markdown/contracts.ts` — the regenerate remedy's text, which leaves with `derived-readiness` in the cutover's
  deletion pass.

Cutover's: `lib/classification.ts` (`backlog/ROADMAP.template.md` in `SCAFFOLDED_FILES`),
`packages/arc-framework/arc/backlog/ROADMAP.template.md` (the stored file's seed) with its `init-recipe.json` entry,
`.arc/system/.internal/manifest.json`'s `backlog/ROADMAP.md` entry, and `verify-integrity.sh`'s check for that file
under `pm.mode: arc-in-git` (in `.arc/system/.internal/scripts/` and the shipped copy under `packages/arc-framework/arc/`)
— each acting once no ROADMAP file exists, so they leave in the flip change (**verified**); then `commands/update.ts`
(`configureRoadmapConflictRemedy`, which wires the merge driver on every `arc update` whether or not ROADMAP exists,
harmlessly), the pre-commit hook's `CHECK[roadmap-regeneration-trigger]`, whose warning names
`arc status --project --staged --write`, `scripts/integration/checkpoint.ts`'s `--regenerate-roadmap` argv
(`arc base merge`'s option), `lib/change-facts.ts`'s `.arc/backlog/ROADMAP.md` literal (`isPlanningArtifactPath`),
`.arc/system/arc-checks.yml`'s `!.arc/backlog/ROADMAP.md` input exclusion, the hooks README's ROADMAP remedy text (in
`.arc/system/.internal/githooks/README.md` and the shipped copy under `packages/arc-framework/arc/`), the merge-gate
`CODEOWNERS` template's `/.arc/backlog/ROADMAP.md` line (`.arc/reference/templates/arc/merge-gate/CODEOWNERS` and its
shipped copy, which `setup-merge-gate.md` copies into a project's `.github/CODEOWNERS`), and this repository's
`.github/CODEOWNERS` line, which leave in the deletion pass (**verified**).

Others' rows: `executor-context-status.ts` belongs in lifecycle's partition beside `executor-context.ts`;
`handlers/status/lifecycle.ts` is lifecycle's and locus's, with status under Shared with; `handlers/status/session*.ts`
and `status-remote-context.ts` are locus's. About fifteen lifecycle-owned files stage, check, or classify ROADMAP
(`readiness-regen.ts`, `lifecycle-transitions.ts`, `lifecycle-executor.ts`, `handlers/start.ts`, `commands/rename.ts`,
`direct-retirement-driver.ts`, `park-planning-landing.ts`, and others), each already an in-repo arm.

Derived views (**verified**): nothing in `src` reads `DERIVED_VIEWS` (`lib/store/registry.ts`). `project-status` has a
layout address (`.arc/backlog/ROADMAP.md`); `identity-status` and `archive-index` have none (`UserDocumentSchema` holds
only `session-notes` and `working-memory`). `storage-projection` plans a user-document address for `STATUS.USER.md` and
renders no view.

## What `seam-lifecycle` changed in the shared files

- `composed-lifecycle-index.ts` — no change; it stays the in-repo arm.
- `lib/status/project-view.ts` — one import moved (`branchToWorkUnitSlug`); floors unchanged.
- `executor-context-status.ts` — no change; in-repo only by construction, since no `fromFlip` edge lists its effects
  (**verified**).
- `handlers/status/lifecycle.ts` — an optional store parameter and the store arm, `handleStoreLifecycleStatus`
  (`readLifecycleView`, `readWorkUnit`, `readLifecycleDesign`, `extractWorkUnitPurpose`, owner from the parsed meta),
  dormant until the flip since both backends report `stateOffBranch: false` (**verified**).

## Provider contracts against the code

- **Pause** (**verified**): `MetaPauseSchema` (`lib/active/meta-schema.ts`) carries `pausedBy`, `since`, `reason`,
  `waitsOn` (a work unit, a note, or none), `resumeNotes`, and `open`; `parseMetaPause` reads the `## Pause` section, and
  `LifecycleEntry.fields.pause` carries it. No work unit has a `paused` scheduling value yet;
  `pause.review_after_days` and `pausedWork` are `seam-locus`'s, unshipped.
- **Archive data:** a work unit's completed placement carries `{quarter, sequence}`; a closed Errand's record is removed
  at close today (`retirementDesired`), so no closed-Errand listing has data before the flip.
- **Conflict records** (**verified**): three shapes in `ConflictRecordSchema` (`lib/store/conflict.ts`) — hunk (base
  lines, current, incoming), entry (`baseSection` and per-side `section`), and whole record (`ConflictRecordValue` per
  side) — each side labelled `{actor, time}`. The kinds are unhomed in-repo and every in-repo reader returns
  `conflicts: []`, so a conflict view runs only on a backend that stores them.
- **`inbound-routing-method`'s details:** the `design` selector and the purpose read match (`selectWorkUnitDesign`,
  `extractWorkUnitPurpose`); the composition helper has three callers, the in-repo store among them; the pre-flip arm
  is not one module (`started-artifacts.ts`, `handlers/view.ts`, `work-unit-purpose.ts`, `commands/view/run.ts`,
  `view-artifact.ts`, `types.ts`, and help text), and `started-artifacts.ts` also serves checkout targets.
- **`arc view` and the purpose reads today:** `arc view`'s default target comes from the active-meta scan and branch
  match (`resolveAmbientTarget`), not the marker, and the recorded-target hook is unwired; `VIEW_KINDS` is a literal
  list; the design parsers' `purpose` field exists but `readLifecycleDesign` and the store arm re-parse content.
- **Identity:** three readers take `arc.identity` only (`readConfiguredIdentity`): `arc status` in every mode
  (`readIdentityPointers`), the ROADMAP renders that read the oracle context (`resolveProjectErrandOracleContext`), and
  the review gate's local live context (`readLocalReviewLiveContext`); decomposition's render
  (`renderGitV3RepositoryTreeRoadmap`) reads no Errand records. `arc view` and the store's ports use `resolveIdentity`,
  which falls back to the slugified `user.name`. With `arc.identity` unset, status reads no Errand records while view
  and the store read those of the fallback identity (**verified**).

## Neighbors' tasks on shared surfaces

Where another work unit's open task edits a file or contract this change shares (`spec-seam-status-roadmap.md` § 1.3,
§ 12), as of 2026-10-17:

- **The ref backend's port binding:** Task 15.3.R - `tasks-storage-ref-backend.md` binds the session context's port and,
  landing second, completes `pullStoreStatus` for `incomplete` and every notice; Task 13.5.R -
  `tasks-storage-ref-backend.md` gives the ended-with-conflicts notice its condition and `arc store conflict` remedy,
  ahead of the binding.
- **Delivery and review:** Task 4.4.b - `tasks-seam-delivery-review.md` edits
  `scripts/review-gate/hosts/local/live-context.ts` for the flip, beside the identity switch (§ 8.1 of the spec); Task
  7.2 - `tasks-seam-delivery-review.md` moves the slug query's operational-boundary read into
  `handleStoreLifecycleStatus`. Whichever lands second takes each conflict.
- **The projection:** Task 5.4.c - `tasks-storage-projection.md` gives the work-item path function
  (`workItemArtifactPath`) a checkout-root input, resolves `workUnitMetaPath`'s, `lifecycleRecordPath`'s, and
  `lifecycleArtifactPath`'s active arms through it, and updates every caller. Its proposal of 2026-10-18, pending its
  pre-activation amendment, also makes the four asynchronous and has the path function return a path relative to the
  checkout root. That reaches `readLifecycleView`'s entry mapping (`lib/store/lifecycle-view.ts`), which this change
  exports as the slug query's index builder (Task 4.4); `readLifecycleDesign`'s call of `lifecycleRecordPath`
  (`lib/store/lifecycle-design.ts`), which Task 1.2.a replaces with a match on artifact file names; the reconcile's
  `lifecycleRecordPath` keying in `store-reconcile-context.ts`, which Task 3.3.a extracts from; and the path calls Tasks
  7.1 and 7.3 make, which join a relative path to the checkout root before testing that the file exists. Whichever lands
  second takes each conflict. The file-name match relies on the projection keeping today's artifact file names under
  `active/current/` and `active/in-flight/<slug>/` (`spec-storage-projection.md` § 10.1 changes only the folder), a
  reliance it has recorded and will flag before changing.
- **Locus:** Task 2.8.a - `tasks-seam-locus.md`, done, gives the session-notes resolver its arm from the flip, which
  this change's `arc view` arm does not call (§ 6.4 of the spec). Its exact locus import inventory
  (`locus-dormant-foundation-contract.test.ts`) registers every importer, `import type` included, of seven dormant
  modules (`derived-lifecycle-evidence`, `derived-reader`, `derived-roster`, `occupancy-marker`, and the three
  `role-*` modules). `runDerivedLocusStateProbe` is not among them, so calling it adds nothing; a new production or test
  file of this change that imports `DerivedCheckoutRow` or `DerivedLocusFrame` joins the inventory, as `slug-position.ts`
  did on `main` (`786b7c4c2`).

## Grounding baseline for the task list

**Shipped baseline, 2026-10-19.** `main` at `efd3442b4` is merged by `852011644`, carrying the shipped locus and
projected Markdown checks. `SessionStatusContext` still carries the injected `store` and `storeSync`, and
`createSessionStatusContext` still accepts `operational`; `pullStoreStatus` consumes that port.
`PullResultSchema` (`lib/store/operational-sync.ts`) still has neither `incomplete` nor notices, so Task 4.1.b's
conditional binding check remains necessary. `deriveStoreInFlight` now emits a `ref-enumeration-failed` warning on
failed local-ref enumeration, alongside `degraded` and `indeterminate` marks; Task 5.1 forwards the warning and adds
its degraded-slice warning. `readDerivedLocusStateSnapshot` accepts an optional version reader; its existing one-argument
call remains valid. The dated planning baseline below records the earlier source versions.

`tasks-seam-status-roadmap.md` was grounded on 2026-10-17 against `main` at `a28e626d4` merged in memory with the local
`feat/seam-locus` at `aeceda7dc`, 53 commits ahead of its remote and still in verification, and re-checked at
`aabc7f17c`, whose three later commits change only `deriveStoreInFlight`'s Errand location, which the user view drops.
The merge conflicted only in `locus-dormant-foundation-contract.test.ts`, where `main` registered `slug-position.ts` and
locus reworked the inventory; locus's own base merge resolves it. Before activation, merge the shipped locus change and
re-ground the locus-provided symbols the tasks name, since its review fixes are still landing: `pullStoreStatus` and
`readStoreStatusLocus` (`handlers/status/store-locus.ts`), `describeStorePull` (`lib/session-init/store-user-pull.ts`),
`markPausedWorkItem` (`lib/session-init/paused-work.ts`), the `pause.review_after_days` parse in
`handlers/status/store-session.ts`, `deriveStoreInFlight` (`lib/git/in-flight-store.ts`, whose entries now carry
`marks`), `lifecycleEntry` (`lib/store/lifecycle-index.ts`), `createViewDependencies` (`handlers/view.ts`),
`resolveSessionContextArtifact` (`lib/view-artifact.ts`), `readDerivedLocusStateSnapshot`
(`handlers/derived-locus-state-probe.ts`), and `createSessionStatusContext` (`handlers/status/session-context.ts`).

**Conflicted metas** (Owner, 2026-10-17). Locus's `cc679df92` withholds a meta with open conflicts from lifecycle's
view as a `malformed` diagnostic keyed `work-item/meta:<name>`, so lifecycle's verbs never act on a conflicted record.
The spec's first version gave `LifecycleEntry` a `conflicts` field and rendered a conflicted row's current side; the
Owner chose to follow the provider instead. A conflicted meta reaches the views as its `listing-diagnostic` warning,
and a name a withheld meta holds fails closed in the fold and in edge resolution (spec § 2.1, § 2.2). The same
session settled two smaller gaps: `--user` prints its warnings to stderr in text mode from the flip (§ 3), and the
conflict view omits a record that does not decode, with a warning (§ 5).

## Implementation facts by phase

Facts the read-only grounding sweeps found and the plan settles, each cited from its task. Line numbers are as of the
baseline above.

### Phase 1 — the identity, purpose, and kind-list fixes

- **`resolveIdentity` takes no `cwd`** (`IdentityOptions = { exec; prompt? }`, `lib/git/identity.ts`). The review gate's
  local host passes `input.cwd` to `readConfiguredIdentity` today, and `live-context.test.ts` pins the read to the
  repository root. Resolve through the root-bound `exec` the file already builds (`readLocalReviewLiveContext`) rather
  than widening `IdentityOptions`. Omitting `prompt` never prompts; with both values unset, or a `user.name` that
  slugifies to empty, it returns null.
- **Keep each reader's error policy.** `readIdentityPointers` returns null on any failure but `identity.invalid`, and
  `resolveProjectErrandOracleContext` reports `errandRecordsComplete: false`; both keep their catch around
  `resolveIdentity`, which rethrows Git failures `readConfiguredIdentity` rethrows. `live-context.ts` has no catch today
  and gains none.
- **Reach.** `readIdentityPointers` serves every status mode through `createSessionStatusContext` and the slug query's
  in-repo arm, plus `arc base drift` (`handleBaseDrift`) and `arc recover audit` (`handleRecoverAudit`). The six
  review-gate consumers read `live.context.activeIdentity` and need no edit; no test covers their null-identity path.
- **Tests that move.** `helpers/session-envelope-compat.ts` unsets only `arc.identity`, and `createTempRepoCore` sets
  `user.name "Test User"`, so the identity-missing golden would resolve `test-user`: unset `user.name` too (pattern:
  `e2e/wu-reconcile.e2e.test.ts`), regenerate `fixtures/session-envelope/session-init-identity-missing.json` with
  `UPDATE_SESSION_ENVELOPE_GOLDENS=1`, and update `e2e/session-envelope-compat.e2e.test.ts`. Mocks that stop matching:
  `unit/handlers/recover-envelope-boundary.test.ts` (mocks `lib/git/index.js` without `resolveIdentity`),
  `unit/handlers/start.test.ts` (overrides `readConfiguredIdentity` only), and
  `unit/scripts/review-gate/hosts/local/live-context.test.ts`. The label is pinned in `unit/status-format.test.ts`.
- **Message texts today:** `runStatusUserView` "Status (User) requires `arc.identity` to be set in git config.";
  `handleRecoverAudit` "arc.identity is not configured; compaction seed path cannot be resolved";
  `SessionIdentityMissingError` "`<label>` probe skipped: `arc.identity` is not configured in git config."; the
  strategy's table cell "identity-missing short-circuit applies when `arc.identity` is absent" (both copies
  byte-identical; re-pad the table). JSDoc in `commands/status/types.ts` and `commands/status/run.ts` names the same.
- **Purpose selection.** `readLifecycleDesign` lists the work item's records with no kind and keeps the first candidate
  whose `readDesignPurpose(content)` is non-null. Select on the parsed `fields.purpose !== null`, narrowed through
  `ParsedDesignRecordSchema`, which keeps today's choice; selecting on the extracted sentence would not, since
  `extractWorkUnitPurpose` turns `""` and `"—"` into null. `lifecycle-record-path.test.ts` pins the return as
  `{ content, warnings: [] }` and `rename-store-paired.test.ts` reads `.content`.
- **Kind list.** The registry already maps each `work-item/*` kind to a layout artifact name
  (`KIND_MECHANISMS`, `LayoutRoleDescriptor.artifact`, typed `string`), and `registry.test.ts` covers the
  registry-to-layout direction. The missing direction is layout name to registered kind; model the table on
  `registry.test.ts`'s typed `it.each`.

### Phase 2 — the pure modules

- **No byte-identity baseline exists.** Every project-view, ROADMAP, and user-view test compares the composer with
  itself or asserts `toContain`; there are no snapshots and no status fixtures. Capture literal output from the
  pre-change composer over inline fixtures covering every tier and warning. Consumers to hold: the composer with
  injected records, `renderRoadmapFromIndexViewResult` and `renderRoadmapFromIndexResult` over an index exec,
  `renderTrackedProjectReadinessViewResult` (no direct test today), decomposition's render
  (`renderGitV3RepositoryTreeRoadmap` calls the composer), and `runStatusUserView` over a stub exec. The fixture
  builders in `project-view.test.ts` and `user-view.test.ts` are module-private; move what the new test needs into
  `__tests__/helpers/`.
- **Lint headroom.** `project-view.ts` measures 871 of 1000 effective lines. Both its `max-lines-per-function` and
  `sonarjs/cognitive-complexity` suppressions belong to `resolveOracleCandidates`, an in-repo arm, so the composer
  (74 lines, complexity 9) has none: any new violation in the file fails lint. Extracting the tier classification is
  what keeps the composer inside the gate.
- **Tier filters.** In Flight is active and not parked; Ready and Blocked are planned, not parked, `Planning`; Parked is
  parked or planned with `State` Active. A paused record must leave all four, Parked included.
- **The provider takes records only.** `ProjectReadinessProvider.resolve(records)` cannot take edge resolutions, so with
  no provider the composer derives its verdicts from its own classification, and `depsOnlyReadinessProvider` stays
  for callers that pass it. `project-view.test.ts` asserts the default equals the explicit provider; that holds over
  inputs with no resolutions.
- **Depth banding** looks up the blocked map by the written slug (`blockedDepths`), so a Blocked row carries its written
  edges for display and their resolved targets for banding.
- **Rows.** `rowOf` always sets `priority` and never `class`, and the result exposes no rows, so the exported tier
  classification returns records, from which `--user` builds its own rows with Class.
- **Paused cells.** `formatTable` escapes nothing, and a pause's reason and note are free text; escape `|` and fold
  newlines, as `lib/delivery/task-list-render.ts` does. Render an empty cell with the em dash convention.
- **Scope window.** A parked unit with a checkout takes the checkout window today; a paused one is null whatever its
  checkout, so the pause check runs before `checkoutWindow`. The pause is a third optional parameter, keeping the
  eight-state `it.each` in `slug-position.test.ts` untouched.
- **In-flight builder.** It takes `InFlightEntry[]`, whose `branch` is required and whose scheduling is `parked` only;
  `scheduling: "paused"` and an optional branch exist only on `StoreInFlightWorkUnit`. Widen the parameter to the union,
  as `lib/session-init/errand-state.ts` does.
- **Lifecycle entry.** `StoreRecordSchema` already carries `aliases` on primary records (the reference backend fills it
  from `formerSlugs`, an empty list included); `lifecycleEntry` copies a non-empty list and drops an empty one, where
  it copies `links` only when defined.

### Phases 3 and 4 — the project view's acquisition, freshness, and the slug query

- **Slug ranking.** The reference lookup scores live-named 3, live-former 2, completed-named 1, completed-former 0, and
  refuses `ambiguous-match` on a tie at the top score. The fold's tie-break among completed holders compares
  `ArchiveQuarterSchema` (`^\d{4}-q[1-4]$`, ordered as a string) then `ArchiveSequenceSchema`, a digit string that needs
  a numeric compare. No production function selects a standing entry per slug; the in-repo `lookupSlug` ranks
  differently and never reads aliases. `identityKey` (`lifecycle-index.ts`) is private; the design grouping needs it
  exported or a twin.
- **Clash fixtures.** The reference backend refuses a second live holder of a name at write and sync
  (`helpers/store/identities.ts`), so a clash test builds a store double or mutates `state.records` directly; a reused
  slug (completed plus new) can be written through the store.
- **Design listings.** `store.list({ family: "work-item", kind })` with no owner is valid; `absent` means nothing of that
  kind. The reference backend's `state.unreadable` works per family, so an unreadable design listing alone needs a
  `Store` wrapper in tests.
- **Lineage** (Owner, 2026-10-17). Retired-origin edges reuse the dependent's own reconcile query rather than a second
  path, so the warning names what `arc wu reconcile --apply` reads; the cost is that an incomplete or unparsable lineage
  listing fails every retired-origin edge, the condition the reconcile itself stops on. The query is `queryDisposition`'s
  `not-found` branch (`createStoreReconcilePrepareContext`, `lib/work-unit/store-reconcile-context.ts`): the terminal-alias
  selection over `storeLineageEnumeration`'s result, then `queryStoreDisposition`, whose matcher (`readDependentMatch`)
  takes the dependent's UID first, then its name, and reads only its owner. All three are module-private today. Its
  results: `unique` with a cut's `replace` or `drop`, `abandoned`, or a rename's `retarget`, which `resolveRetiredEdge`
  (`lib/work-unit/side-effects/discharge-dep-edges.ts`) follows to the successor, refusing a cycle as `rename-cycle`;
  `unmapped-dependent`, a query status rather than a record field; `absent`; `ambiguous`; and `namespace-corrupt`.
  `planDependencyReconcile` produces codes, not text, so `dependency-retired`'s wording is new. The slug lookup ranks
  Errand records (`work-item/record`) beside metas (`preferredSlugRecords`), so a first-step hit can name an Errand.
- **Marking.** `markPausedWorkItem` throws on every failure, so the acquisition wraps it to produce `store-read-failed`;
  pass `MetaPauseSchema.parse(entry.fields.pause)`. `pause.review_after_days` is declared in `config/schema.ts`; its
  only reader (`store-session.ts`) parses it with a private helper (`positive`, which also parses two inbound settings).
  This change exports it there, and the handler dispatching the acquisition passes the parsed number in, so
  `lib/status/` imports no handler.
- **Diagnostic keys.** The fold reads a name from the key form `work-item/meta:<name>`, whatever the diagnostic's kind.
  Lifecycle's view gives that key to a conflicted or malformed meta (`malformedMeta`), and the reference backend's
  listing to a meta its parser rejects (`listReference`, `__tests__/helpers/store/read.ts`). Its `oversized`,
  `unreadable`, `unknown-format-version`, and `key-mismatch` diagnostics carry `recordKey`
  (`__tests__/helpers/store/model.ts`), which names a meta by its UID, so the fold reads no name from them. The in-repo
  backend's keys (`work-item:<slug>`, `lib/store/in-repo/composition-quality.ts`, and a source path) never reach the
  arms from the flip.
- **The state read's index.** `buildLifecycleIndexFromRecords` lives in `lib/work-unit/lifecycle-index.ts`, a raw
  state helper (`RAW_STATE_MODULES`, `eslint/architecture-imports.ts`) that only `lib/store/` imports without a count,
  and `handlers/status/lifecycle.ts` holds one `store-raw-state` count, spent on `resolveCallerComposedLifecycleIndex`.
  `readLifecycleView`'s entry-to-record mapping becomes the exported builder both call.
- **Dispatch today.** `handleStatus` dispatches a slug to `handleLifecycleStatus` before it builds the session context,
  and builds the context with no `operational` input, so `storeSync` is always undefined in production. The slug arm's
  store binds no identity; the context's binds `identity` and `execInput`.
- **Refusals.** An `unsupported` `StoreRefusal` needs a case from the closed `UNSUPPORTED_CASES`, and the dormant-command
  helper (`runDormantStoreCommand`) is typed to its own command union with off-branch text that does not fit a view.
  Status's refusals get one renderer of their own: stderr `Error [<code>]: <condition> <remedy>` and, with `--json`,
  `{ status: "refused", refusal }` on stdout, exit 1, the printed shape `handleDormantStoreCommand` uses.
- **Tests.** Store-arm status tests call `handleLifecycleStatus` directly with a harness store and ports
  (`unit/handlers/status/store-locus.test.ts`, `unit/work-unit/store-read-consumers.test.ts`); no test drives
  `handleProjectStatus` or `handleUserStatus` with an injected store.

### Phases 5 and 6 — the user view and the conflict view

- **User view.** `deriveStoreInFlight` returns `reachable: false`, so the arm from the flip bypasses
  `runStatusUserView`'s cache branch and passes no `writeFile`. Its degraded mark comes with a specific warning except
  for a failed read of local refs. `isMine` is module-private.

  The shipped baseline above supersedes the local-ref warning exception: `deriveStoreInFlight` now warns for that
  failure too.
- **Conflict records.** No parser is registered for the conflict kinds, so a listing carries raw `content`: decode with
  `JSON.parse` and `ConflictRecordSchema.safeParse`, as `entryConflictReason` (`lib/inbox/conflicts.ts`) does. The ID is
  the record's reference key, not a field. A `work-item` listing with no kind refuses `unsupported` in-repo, so always
  pass the kind.
- **The token** has no formatter or parser anywhere yet. Form it as `<family>/<owner type>/<owner name>/<key>`; an ID may
  hold `/`, so parse three segments and the remainder.
- **Mode exclusivity.** Commander matches `conflicts([...])` against camelCase attribute names, so today's kebab-case
  entries (`session-init`, `session-handoff`) never fire, and the schema refinement enforces exclusivity. `--conflicts`'s
  own list and the entries the other modes gain use attribute names. `[slug]` is positional, so the flag is
  `--conflicts [conflict]`, valued `true` or a token. Tests that pin the exclusion message and help:
  `e2e/session-init.e2e.test.ts`, `e2e/run-cli.e2e.test.ts`, `e2e/cli-help-examples.e2e.test.ts`, and
  `unit/command-input/repository-inventory.test.ts`.
- **Seeding conflicts.** A stale-base write to a merging kind files one; or put a conflict record directly with a writer
  verb's provenance (`merge`; `seed-lifecycle` is refused for conflict kinds), which links it to its subject. Unset
  `environment.identity` for `absent` personal and claims listings.

### Phase 7 — `arc view`

- **Locus's session-notes arm is three pieces:** the handler's `resolveSessionNotes`, the `sessionContexts` map with the
  `readFile` override, and the short-circuit in `resolveViewArtifactUnchecked`. This change's meta-path arm replaces all
  three.
- **Content results.** Three helpers `commands/view/run.ts` calls tell a ref result from a file by `"ref" in artifact`
  (`readViewArtifactContent`, `viewArtifactDisplayLabel`, `viewArtifactFileRefusal`, all in
  `lib/view/started-artifacts.ts`); a store-content result needs its own discriminator so the ref refusal never fires
  for it.
- **Warnings at each destination.** `runView` (`commands/view/run.ts`) dispatches `--editor` and `--path` before
  `prepareViewDocument`; `openArtifactInEditor` and `artifactPathOutput` currently return empty stderr on success.
  Task 7.4's artifact warnings must reach those destinations as well as content rendering. Check each destination
  with a conflicted projected record, keeping `--path` stdout a usable path and its warning on stderr.
- **The default target's placement.** Locus's arm of `resolveAmbientTarget` returns placement `active` and
  `taskListPath: null` for any resolved claim, reading no placement, so the arm from the flip takes only the claim's slug
  and reads the work unit as `--for` does.
- **Kinds.** `design` maps to no kind, `inbox` to two, and `session-notes` to meta, so the table maps each view kind to
  a read selector typed by `KindId`, not to a bare `KindId`. The table and its selectors live in the port's module under
  `handlers/`, which reads the store at runtime; `lib/view` imports only types from `lib/store`.
- **The seam.** `resolveViewArtifact` reaches every effect through `ViewArtifactDependencies`' ports, none of whose
  types returns a record's version or conflicts, and `ResolvedViewTarget` carries paths only. Locus's bindings read the
  store behind `resolveAmbientTarget`, `resolveSessionNotes`, and `readFile` (`createViewDependencies`), the last two of
  which Task 7.5 replaces. A target already names where its artifacts come from (`artifactSource`, `checkout` or `ref`),
  and `presentOrAbsent` consults a ref source before the file check, so a `store` source with one optional port follows
  that pattern. A separate store resolver chosen in `handleView` would ease the deletion pass but contradicts the spec's
  § 6.1, which builds the arms in `createViewDependencies`.
- **`--for` an Errand.** `readWorkUnit` refuses `record-malformed` for a slug that names an Errand; the arm maps it, and
  `not-found`, to today's unknown-target refusal.
- **Roots and files.** `resolveArcPath` is relative; root every path at the checkout, so a target is projected only where
  this checkout holds its file. `pathExists` (`handlers/view.ts`) is module-private, so tests of a present file use a
  temporary directory or lib-level dependencies.
- **Ratchet.** `handlers/view.ts` holds `store-raw-state` 2 and `lib/view-artifact.ts` `surface-names` 2 and
  `work-unit-paths` 2; the arms from the flip add no surface literal or work-unit address outside `lib/store/`.

## A1 — Identity-scoped conflict tokens

The 2026-10-19 task audit found that `listReference` (`__tests__/helpers/store/read.ts`) checks identity presence for
identity-scoped families but does not filter owners unless its input names one. A two-person in-memory probe returned
both owners from an ownerless `personal/conflict-record` listing and only the resolved person with an explicit owner.
`OwnerIdentitySchema` (`lib/store/identity.ts`) gives a person no UID, so preserving that owner loses no completed
generation. The approved correction retains the resolved-person owner in personal and claims token queries, while
other families keep ownerless reads to retain both live and completed holders.

The superseded § 5 token rule began: "With a token it lists that family's conflict-record kind the same way, with no
owner in the input" and concluded that "the view never names the owner in the listing's input." Task 6.3's original
Goal was:

> With a token, the view lists that family's conflict-record kind with no owner in the input and shows each
> conflict whose owner type, owner name, and ID match, each owner where several do.

The approved forward amendment replaces that Goal's universal ownerless requirement with the identity exception.
The existing Success Criteria remain intact; appended criteria make the scoped behavior independently checkable.

## A2 — Conflict-listing completeness

`ListingOutcomeSchema` (`lib/store/read.ts`) distinguishes `absent`, `unreadable`, and `complete`, the last carrying
diagnostics and `missed`. `listReference` withholds a diagnosed record before returning its records, so content decoding
cannot warn for it. The same in-memory probe produced a complete listing with an `unknown-format-version` diagnostic
and `missed: true`, then an `unreadable` family result after its family index was marked unreadable.

The approved policy follows the project view's failure distinction: failures refuse with the repair route, readable
partial listings retain good records with omission warnings, and a token's absence is conclusive only after an
omission-free read. A content-decode failure also prevents a no-match result from proving an unknown token. The
correction stays inside § 5, its implementing tasks, and appended acceptance criteria; it changes no Store contract.

---
