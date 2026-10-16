# Notes: seam-status-roadmap

## Contents

- How the rows were checked
- Corrections across rows
- Rows
- Files no row covers
- What `seam-lifecycle` changed in the shared files
- Provider contracts against the code

## How the rows were checked

The rows are the 29 of `notes-storage-contract.md` § Consumer map, "Status and roadmap", re-verified at `19018e64c`
(2026-10-16), which carries the merged `seam-lifecycle` (PR #1027) and `seam-record-kinds`. Three read-only sweeps ran:
one over the 29 rows, running the ratchet's predicates (`findArchitectureImportViolations`,
`eslint/architecture-imports.ts`) over every file, whose counts all match `eslint-suppressions.json`; one over the
coupled files no row names; and one over the provider contracts the draft consumes. The sweeps' findings are advisory.
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
  scripts, the merge driver (git config), `arc init`, `arc join`, and `arc update`; and every `arc status` mode but the
  slug query, since `SessionStatusContext` carries no store (**verified**). `handleBaseSync` now builds one
  (`createStore(createDefaultStorePorts(...))`), the pattern a handler can follow.
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
  those files; it ships in every project's hook (`init-recipe.json`), the general Markdown check other projects get,
  the hook's checks of state files' shape having their own register row. From
  the flip it reads no state, a departure from key 05 that `draft-seam-status-roadmap.md` § Direction records, with
  checks over state split between `storage-projection`'s selection and `projected-markdown-checks`' check
  (§ Coordination).
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
  neither view sees state (key 05; the draft records the departure). Its worktree view has other readers —
  `prepareMarkdownMigrationInputs` (`lib/markdown/migration-audit.ts`), which reads each path's HEAD blob, and
  `validateExplicitMarkdownPaths` — so widening it reaches them too (**verified**).
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
- **Contradicted draft claims:** `arc view`'s default target comes from the active-meta scan and branch match
  (`resolveAmbientTarget`), not the marker, and the recorded-target hook is unwired; `VIEW_KINDS` is a literal list;
  the design parsers' `purpose` field exists but `readLifecycleDesign` and the store arm re-parse content.
- **Identity:** three readers take `arc.identity` only (`readConfiguredIdentity`): `arc status` in every mode
  (`readIdentityPointers`), the ROADMAP renders that read the oracle context (`resolveProjectErrandOracleContext`), and
  the review gate's local live context (`readLocalReviewLiveContext`); decomposition's render
  (`renderGitV3RepositoryTreeRoadmap`) reads no Errand records. `arc view` and the store's ports use `resolveIdentity`,
  which falls back to the slugified `user.name`. With `arc.identity` unset, status reads no Errand records while view
  and the store read those of the fallback identity (**verified**).

---
