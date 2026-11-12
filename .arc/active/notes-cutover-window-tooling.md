# Notes: cutover-window-tooling

Execution context the task list points to, recorded at task generation from the grounding audit of each phase. The
specification holds every obligation; these notes hold where the code that meets them lives and what it does.

---

## Lint boundary and imports

- `store-production` (`eslint/architecture-imports.ts`, `storeViolations`) refuses any value import resolving under
  `lib/store/in-repo/` or `lib/store/ref/` from a file outside `lib/store/`; it has no suppressions, so it fails
  closed. The three ratchets — `store-raw-state` (value imports of `lib/work-unit/composed-lifecycle-index.ts` and
  `lib/errand/identity-snapshot.ts`), `surface-names` (string literals naming `.arc/active/`, `ROADMAP`, and the other
  layout surfaces), and `work-unit-paths` (`resolveArcPath({ kind: "placement-root" })` and passing the resolver on) —
  count recorded violations per file in `eslint-suppressions.json`, so a new file is allowed none.
- `store-tests` refuses the same private imports from `__tests__/`. Tests reach the composition through
  `resolveCallerComposedLifecycleIndex` with `acquisitionPolicy: "local"`, which `composedMetas`
  (`lib/store/in-repo/meta.ts`) calls with the meta-discovery fs and a local-only exec, and reach the family through
  its own modules. `resolveCallerComposedLifecycleIndex` always passes an oracle; a run with none goes through
  `resolveComposedLifecycleIndex`, which lives in `lib/work-unit/` and which tests may import.
- `composeArchitectureBans` (`eslint/architecture-config.ts`) gives each file the union of every `architectureBans`
  row that covers it, with no way to subtract a rule, so a row scoped to the folder would only add. The exemption adds
  `subtree("scripts/cutover-window")` to the `ignores` of the `store-raw-state`, `surface-names`, and `work-unit-paths`
  rows, and splits `store-production` out of the row it shares with `store-reference` into a row of its own with the
  same `ignores`. `__tests__/unit/eslint-architecture-config.test.ts` pins a file in the folder at `clack`,
  `store-reference`, `layout-private`, and `configured-identity`, with none of the four.

## Host port

- A remote's effective URLs come from `git remote get-url --all <remote>` and `git remote get-url --push --all
  <remote>`, which apply `url.*.insteadOf` and `pushInsteadOf`; raw configuration does not
  (`lib/store/ref/effective-transport.ts` handles the same rewrites for the store). A `file://` URL is a local path.
- `gh` picks its default repository from every remote; pass `--repo <owner>/<repo>` derived from `origin`'s effective
  URL. The review gate resolves the same thing with `gh repo view --json nameWithOwner`
  (`scripts/review-gate/hosts/github/merge-method.ts`), outside the family's import scope. Copy safety asks the
  opposite question, whether `gh` resolves any repository from the copy, so the port also carries that read run in
  the target without `--repo`. There `gh` exits 1 with "none of the git remotes configured for this repository point
  to a known GitHub host", the passing answer, but also exits 1 outside a repository, and 4 on an authentication
  failure; only that message answers none.
- `gh pr list` stops at its `--limit` (30 by default). Request one more than the largest expected count and refuse
  when the result reaches the limit. `createGhChangeRequestLifecyclePort` (`lib/errand/change-request-lifecycle.ts`)
  shows the `baseRefName` and `headRefName` fields.
- `gh api repos/<owner>/<repo>` omits `allow_squash_merge` and `allow_rebase_merge` for a token without admin rights;
  an absent field is unknown, never `false`.
- `readRemoteHeadSnapshot` (`lib/git/remote-ref-reader.ts`) reads `--heads` only, with a short default timeout, so it
  cannot serve `recompute`'s identity-ref pattern; the port runs `git ls-remote origin <patterns>` itself.
- `git ls-remote` matches each pattern against a ref's tail, from its start or after any slash, and `*` crosses slashes,
  so `'refs/arc/user/*/errands'` also lists `refs/arc/user/x/y/errands` and a branch named
  `foo/refs/arc/user/z/errands`, and `'refs/arc/*'` lists a branch named `foo/refs/arc/project/registry`. Keep a line
  only when its ref begins with the read's own prefix, `refs/heads/` for branches and `refs/arc/` for store refs, and as
  an identity ref only by the import's pattern (§ Consumed comparison); such a branch stays a branch.
- Fetching the host's `main` by name moves `refs/remotes/origin/main`, which `recompute` and `compare` read as a
  fetched tip. Fetch into a scratch ref instead (`git fetch --refmap= origin <ref>:<scratch>`, as
  `commands/user/push-fetch.ts` does), check it against the `ls-remote` tip, and delete it.
- The strict ancestry test runs `git --no-replace-objects merge-base --is-ancestor`, as the import's `isCodeAncestor`
  (`lib/store/ref/import/branch-tip.ts`) does. The composition's strict `isAncestor`
  (`lib/git/in-flight-derivation.ts`) is private to its module, so the family restates it: exit 0 is an ancestor,
  exit 1 is not, anything else refuses.

## Load seal callers

- `handleUserLoad` (`handlers/user.ts`) resolves the current unit, calls `runUserLoad`, logs a `UserFacingError`, and
  rethrows anything else; the CLI's error boundary (`cli.ts`) prints `formatError` of an `ArcError` as
  `✖ store.imported: <condition> <remedy>` and sets exit 1.
- `handleLoadDirection` (`handlers/user-sync.ts`) is reached only when `decideSyncAction` returns `load`; it catches
  every error, logs `Failed to restore user notes: <message>`, and sets exit 1. `handleUserSync` inspects disk and
  notes and fetches before it reaches that direction, so the seal holds writes, not reads.
- `runUserPull` and the in-repo store's pull reach `runUserLoad` only after `runUserFetch`, which is already sealed.
- In `__tests__/integration/store-imported-seal.test.ts` the suite shares one repository root, and `runUserLoad`
  returns `null` with no saved note, so the load case saves its own note first. Its "no Git beyond the import lookup"
  writer list takes `runUserLoad`, proving the guard runs first.

## Hold, record, and stop points

- `check` and `restore` take an injectable step hook, as the import's `RefStorePorts.migrateStep`
  (`lib/store/ports.ts`) does. Steps are named for the record write and the marker write in `check`, and for the
  comparison record, each of the five restore steps, and each merged-flip test in `restore`. Tests drive them in
  process; the entry passes none.
- The import's own steps reach each state the restore's tests need: `import.land` (kept tips, no landing;
  `lib/store/ref/import/land.ts`), `import.publish` (landed, not published; `finish.ts`), and
  `import.transient.remote-delete` (landed, `origin`'s identity ref not yet retired; `transient-cleanup.ts`).
  `__tests__/integration/store-ref-import-cleanup-refusals.test.ts` stops an import this way.
- `storage.backing_repository` lives in `arc-config.yml` and is read by `readBackingRepository`
  (`lib/config/status-reader.ts`), not from Git configuration.
- `readRefDesignation` (`lib/store/ref/designation.ts`) drops unrecognized `arc-state` values and remotes without a URL,
  so C9 reads `git config --get-regexp '^remote\..*\.arc-state$'` itself, and takes the code remote from
  `readRefDesignation`.
- The store-directory set (`store`, `store-migrate-build`, `store-migrate-old`) is an inline literal in
  `lib/store/ref/operation-scope.ts`, and the kept-tip mapping (`keptRef`, `sourceRef`) is private to
  `lib/store/ref/import/transient-cleanup.ts` beside the exported `IMPORT_KEPT_PREFIX`; the family restates both.
- A real import never creates a store directory with the default layout designated (`writeRefRepository`,
  `lib/store/ref/repository.ts`, returns the code repository), so the restore's tests create all three themselves.

## Consumed comparison

- Identity refs match the import's pattern `^refs/arc/user/([^/]+)/errands$` (`lib/store/ref/import/transient.ts`),
  which excludes the legacy `errands-remote`.
- `appendTransientRecord` (`lib/store/ref/import/transient.ts`) is private. It gives a `work-item/record` a random
  owner uid, rewrites an Errand's content with `owner: <identity>`, and appends a `work-item/description` beside it.
  Claims keep `transientReference`'s kind, person, and key (`lib/store/in-repo/transient-common.ts`: grooming to
  `claims/groom`, housekeep routing to `claims/housekeep`); landed content is `canonicalize(JSON.parse(...))`
  (`lib/store/ref/import/build.ts`).
- The import skips a held tip whose snapshot reads `absent`, `error`, or with diagnostics, reporting a notice; the
  comparison counts each as a difference.
- A store listing (`listCapturedRecords`, `lib/store/ref/read.ts`) writes `refs/arc/tmp/version` and manifest objects
  (`saveCapturedManifest`) and lists only the configured identity's identity-scoped records. The comparison reads the
  landed claim trees under `refs/arc/user/<id>/claims` and the work-item refs with plain Git reads, taking the record
  path grammar from `lib/store/registry.ts`.
- `storeImported` (`lib/store/store-imported.ts`) answers `false` on any error and reads `<commonDir>/arc/store` when it
  exists. "Landed" and "guard lifted" are decided by a strict read of the registry ref in the code repository, where
  only exit 1 means absent.

## Restore leases

- `publishableRef` (`lib/store/ref/push-listing.ts`) is private; its rule is `isStateRef(ref)` and, under
  `refs/arc/user/`, only the configured identity's `personal` and `claims`.
- `acknowledgePushRefs` (`lib/store/ref/push-tracking.ts`) writes `refs/arc-remotes/origin/<ref without refs/arc/>`.
- `retireOriginRefs` deletes `origin`'s identity ref only where it equals the kept tip; `dropKeptTips` runs last.
- `refs/arc-window/restore` records, for each held identity ref, its regime (kept tips, landed with kept tips dropped,
  or nothing consumed), the outcome, and any accepted value. Steps 1 and 2 take every identity-ref lease from that
  record, so a restart never leases an absence the comparison did not pass or accept.

## Test fixtures

- `importFixture` (`__tests__/helpers/store/import-fixture.ts`) sets `remote.origin.arc-state` and gives its bare
  `origin` no branches: unset the key before `check`, and push `main` and the flip branch with upstreams set, so C1
  sees each branch at its upstream and the merged-flip test can resolve `main` there.
- The bare `origin` sits at `.arc-fixture/remote.git` inside the repository (`PREPARED_REMOTE_PATH`,
  `__tests__/helpers/prepared-repository.ts`), untracked unless excluded, which C1 refuses; append `.arc-fixture/` to
  `.git/info/exclude`, as other suites needing a clean status do, with `.arc/user/`, where the baseline's personal file
  sits (`__tests__/helpers/store/in-repo-remote.ts` excludes it the same way).
- Tests run under `npm`, whose `PATH` begins with the launching checkout's `node_modules/.bin`, and a developer's
  machine may carry a global `arc`; the baseline supplies the `PATH` C6 judges rather than inheriting it.
- The save refuses an empty manifest (`no-eligible-files`, `commands/user/save-load.ts`), so the baseline writes a file
  under `.arc/user/<identity>/`, as the import suites do before saving.
- The bare `origin` is a local path, so the repository has no host; `check` and `restore` take a supplied listing.
- A grooming claim: `seedTransients` (`__tests__/helpers/store/import-transients.ts`) plus a push of the identity ref.
  The designation: `invokeStoreRemote(["origin", "push"], { cwd })` (`__tests__/helpers/store/remote-command.ts`).
  The save: `runUserSave`. The import: the fixture's in-process `migrate`, which takes the step hooks the CLI path
  does not.

## Checkout classification

- Review-gate materializations (under `<commonDir>/arc/review-gate/materializations/`), frontline review checkouts,
  base sync's temporary checkout (`base-sync.ts`), the test-cost benchmark's checkout, and the delivery-refresh and
  review-fix worktrees are all made by a plain `git worktree add` with no marker, so nothing tells them from a
  hand-made worktree; C2 names them all "no marker" with their path.
- A decomposition worktree's marker has `createdFor: { kind: "branch" }`, which `decodeWorktreeMarkerOwnership`
  (`lib/git/worktree-marker.ts`) decodes as `current` with no provisioning; a partial Errand with `ready` also decodes
  as `current`. Neither names a work unit or a transient claim, so neither is marked. A hand-made checkout that ran
  `arc start` carries a work-unit marker (`spawnedByArc: false`) and is marked. `readWorktreeMarker` can return a
  malformed result, its own kind.
- `readStatusCheckoutRoster` (`handlers/status/checkout-roster.ts`) assembles the roster through
  `runDerivedLocusStateProbe` for one reading identity. Calling `readDerivedLocusRoster` directly without
  `strictCheckoutPath` throws on a subject-context failure instead of deriving `unresolved-checkout`.
- The configured identity is the ports' `identity()`, `resolveIdentity`: `arc.identity`, else the slugified `user.name`.
- Housekeep routing records carry `kind: "errand"` with `purpose: "housekeep-routing"`
  (`lib/locus/schema/identity.ts`); `transientKind` (`lib/store/in-repo/transient-common.ts`) separates them.
- `isDecomposeCandidateBranch` (`lib/work-unit/decompose-candidate.ts`) takes a short branch name, so strip a fetched
  ref's `refs/remotes/origin/` prefix first.
- `checkDevBuildStaleness` (`lib/dev-check.ts`) reports an absent bundle as stale with basis `missing-dist`, so test for
  `packages/arc-framework/dist/cli.js` first; `createDevCheckDeps` takes any checkout's bundle path.
- `lockSpawnedCheckout` (`lib/git/worktree-removal.ts`) locks with `PROJECTION_LOCK_REASON` and leaves an existing lock.

## Digests

- `readImportPersonalDisk` (`lib/store/ref/import/personal-disk.ts`) needs `context.importSource` bound, acquires every
  present checkout in one walk with `importPersonalExcluded` already applied, and returns content as decoded strings.
  Split its files per worktree by `physicalPath`.
- `readImportReviewGate` (`lib/store/ref/import/review-gate.ts`) turns a read failure into a report notice and returns
  no files; its paths carry an `arc/review-gate/` prefix.

## Copy

- This machine's copy is about 5 GB: fourteen checkouts of about 370 MB each and a 358 MB Git directory.
- Workspace links in `node_modules` are relative, so they stay inside the copy. Copied markers keep live absolute paths
  in `parentCheckoutPath`; no writer that uses them was found.
- `git worktree repair` runs in the copy only; the live repository's `.git/worktrees/*/gitdir` files and each live
  checkout's `.git` file are the evidence that it reached nothing else.

## Read map

- `recordPath`, `companionNames`, and `internalReferences` (`lib/store/in-repo/paths.ts`) map a record to its paths,
  not a path to its record, and `recordPath` without a meta falls back to the live composition. Map a path back by
  running `heldMetaSources(context, revision)` (`lib/store/in-repo/meta.ts`) at the revision, then the forward
  helpers over its sources.
- `composedMetaSource` reads the importing checkout's working tree wherever the composed record's `writablePath` agrees,
  otherwise the selected copy; that is the operational read revision, not `recordsBySlug`'s selected copy alone.
- `readImportParkedSources` lists a parked unit in `names` but leaves it out of `available` when its branch tip cannot
  be resolved, and reports the refusal; that unit has no read revision.
- A unit whose every branch copy is stale, such as one merged to `main` whose own branch is gone, has no in-flight entry
  and so no provenance: `chooseWorkUnitCandidate` returns null and `dedupeWorkUnitCandidates` skips
  `provenanceForGroup`, recording each copy as a `stale-location-dropped` or `stale-location-shadow` warning with its
  `branch` and `workUnit` (`staleLocationWarning`). `qualityFactsFor` (`lib/work-unit/composed-lifecycle-index.ts`) keys
  those by slug. A warning names a branch, not a ref or source, so read the branch's local and fetched tips. Neither
  source names a `delivery/` or `review-projection/` branch, which in-flight discovery skips
  (`isExcludedInFlightBranch`, `lib/git/in-flight-expansion.ts`).

## Accounting and chain

- The cohort listing is `cohortPaths` (`lib/store/in-repo/paths.ts`); the project inbox is `recordPath` over the
  `project-inbox/inbox` reference, which resolves to `.arc/backlog/ATOMIC-INBOX.md`.
- A rename transition lands as no record: `importRename` (`lib/store/ref/import/lineage.ts`) adds its origin's name to
  the successor's `formerSlugs`. `origin/main` holds three rename transitions today.
- A single store read (`readRefRecord`) writes no ref or object; a store listing writes `refs/arc/tmp/version` and
  manifest objects (`listCapturedRecords`, `lib/store/ref/read.ts`). Find each Candidate's owner, uid included, with
  plain Git reads of the work-item refs rather than a listing.
- `createRefStore` sets `capabilities.stateOffBranch`, so the reader hands the walk to
  `readStoredCandidateSupersessionChain`, whose `selectReviewRecordOwner` throws without a `workItem`. The reader takes
  the current record already parsed and returns links without content: read each side's current record yourself
  (`git show` at the read revision; `store.read`), and each link's record by its `recordRevision` (`git show`; the
  matching `store.history` entry).
- The repository walk skips a malformed or foreign version that is not the link it expects
  (`lib/store/kinds/review/candidate/history.ts`); the store walk throws on one (`stored-history.ts`). For a unit no
  longer live, `brokenChains` lists only repository-walk refusals, so a store-only refusal is an unlisted difference.
- In the report, a version's `reviewMapping` source is `.arc/system/.internal/candidates/<slug>.json@<commit>` and the
  current record's is the bare path; the CLI's `--json` wraps the report as `{ status, result }`.

## Stage 1 driver

- `arc errand abandon` for an Errand with a checkout is authorized only from that checkout or with
  `--confirm-foreign-generation` (`lib/errand/terminal-authority.ts`), and refuses `preservation-unproven` unless the
  branch head is in base or on `origin` (`lib/errand/abandon-runtime.ts`); only an awaiting-merge Errand reads the host.
- Each copied checkout runs its own `packages/arc-framework/bin/arc.js` by default, or the primary copy's where it has
  no built CLI; the driver takes the launcher as a parameter, and its test supplies the package's built CLI for every
  checkout, since a small temporary copy holds no package or build. C6 refuses an `arc` on `PATH` outside every checkout
  and the one the family runs from, and a checkout's hooks fall back to `arc` on `PATH` without `node_modules/.bin/arc`;
  the driver takes the `PATH` its `check` judges as a parameter too.
- The import reads every checkout's personal files from disk and refuses where one differs from its saved notes
  (`lib/store/ref/import/personal-disk.ts`, `personal.ts`), so step 6 saves every copied checkout. One without a built
  CLI runs its ARC commands, the save among them, through the primary copy's build with that checkout as its working
  directory, since the staleness guard judges the running CLI's own package (`createDevBuildGuardDeps`,
  `lib/dev-check.ts`), not the working directory. A merge of `main` can leave a checkout without the dependencies its
  rebuilt CLI would load (`node-diff3`), so the driver removes a moved checkout's `dist` rather than rebuilding it.
- A copy inherits `core.hooksPath=.husky/_` with `hooks.pre_commit`, `hooks.commit_msg`, and `hooks.pre_push` enabled
  and `branch.protection: full`. Each hook runs the checkout's own `node_modules/.bin/arc`, and every ARC command first
  passes `runDevBuildGuard` (`cli.ts`), which refuses a stale build; once fresh, the hooks run the repository's gates
  and route their checks to the shared check pool, outside the copy. A plain clone of the mirror has no hooks, since
  `.husky/_` ignores its own contents and only husky's install sets `core.hooksPath`, so the driver commits, merges,
  and pushes there.
- `applyRoadmapConflictAutoRemedy` (`lib/status/roadmap-conflict-auto-remedy.ts`) regenerates and stages only; the
  driver commits the merge in its scratch clone.
- The memory gate is machine-local, so the driver takes the cap wrapper as a parameter and never names it.
- Store-backed case 1: a key mismatch between a boundary record's file name and its `workUnit` becomes an import notice
  (`read-codec.ts`; `listedRecord`, `lib/store/in-repo/list.ts`), and the import refuses before keeping any tips
  (`lib/store/ref/import/entry.ts`).
- A copied Errand that is `open`, not awaiting merge, passes copy safety and refuses under C12 until step 3 abandons it.

---
