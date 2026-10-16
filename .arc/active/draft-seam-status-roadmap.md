# Draft: Seam Status and Roadmap

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.
- **Purpose:** Build status's and `arc view`'s versions for the store: from the flip `arc status --project`,
  `arc status --user`, and `arc view` read lifecycle's typed listings and render on demand, with no ROADMAP or
  `STATUS.USER` file, while today's status and ROADMAP code keeps its behavior before the flip and goes at the cutover.

---

## Inbound dispositions

The owner's pass at the readiness exit (Owner, 2026-10-16) dispositioned every held entry; nothing remains held.

| Entry                                                                        | Outcome | Where it landed                                                                                                                                                                   |
| ---------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render paused work in a Paused tier, for Planning and Active alike           | fold    | § From the flip, "The Paused tier": reason, what the pause waits on, and open to takers from `fields.pause`; locus's resumable and review-due marks through its per-item function |
| Row the status and roadmap files the consumer map misses                     | fold    | `notes-seam-status-roadmap.md` § Rows and § Files no row covers, re-verified at `19018e64c`; § From the flip, "The `format:tables` modules"                                       |
| Show an open conflict's sides in status, for conflicts shown without markers | fold    | § From the flip, "The conflict view": `arc status --conflicts [<conflict>]`, taking projection's token, over the hunk, entry, and whole-record shapes                             |

---

## Continuity

- **Readiness:** formalization-ready (assessed at loop exit, 2026-10-16). The direction was re-set on 2026-10-16
  (§ Direction): no pre-flip change, and status's store version built from lifecycle's view rather than today's
  modules rerouted. The code was re-verified at `19018e64c` (`notes-seam-status-roadmap.md`).
- **Resolved:** § Direction; the boundary read (stays one work unit); `Class` `Heavy`, persisted at the capture commit;
  no derived view rendered as a file, and no `STATUS.USER` cache; the archive listing dropped; the three fixes before
  the flip (§ Fixes before the flip), the review gate's identity read among them; the ROADMAP template's install entries
  and the integrity check's presence test leaving in the cutover's flip change, and the rest of the ROADMAP machinery
  staying inert from the flip and leaving in its deletion pass; and, on 2026-10-16, the Paused tier's marks, the
  conflict view's surface, `arc view`'s targets and kinds from the flip, the project view's composition, edges naming
  no listed work unit, the status flags from the flip, a leftover `STATUS.USER.md`, `DERIVED_VIEWS`, and Markdown
  checks reading no state from the flip (§ Direction, § Coordination); the inbound entries, folded at the owner's pass
  (§ Inbound dispositions).
- **Open:** none.
- **Next:** draft close — the coordination captures and the `cohort-storage-seam.md` amendment, then the capture
  commit; `create-spec` follows.

**Reading this draft.** `cohort-storage-seam.md` holds the seam's coordination, its scope boundary, and how the
register's keys are cited. `D` and `A` numbers are `spec-storage-contract.md`'s decisions and amendments; record-kinds
sections are `spec-seam-record-kinds.md`'s, lifecycle sections `spec-seam-lifecycle.md`'s, and locus sections and
amendments `spec-seam-locus.md`'s, on `feat/seam-locus` until it lands. The row-by-row code record behind § What today's
code holds is `notes-seam-status-roadmap.md`.

## Problem / Motivation

Today status renders the project view from metas in tracked trees and at branch tips, writes it as
`.arc/backlog/ROADMAP.md` on lifecycle edges and on `arc status --project --staged --write`, writes `STATUS.USER.md`
on lifecycle edges and on every rendered `arc status --user`, and resolves `arc view`'s target from the active metas in
the checkout. From the flip that state lives in the store, so status and `arc view` need versions that read it.

The cohort's default for a member is to reroute its modules onto the in-repo implementation first, with no observable
change, so the same code runs across the flip (`cohort-storage-seam.md` § Soft coordination). For status that buys
nothing:

- **No one reads ROADMAP.** Direction lives in `RELEASE-GATES.md` until `goal-aware-direction` replaces it (Owner,
  2026-10-16); the one reader that is not a person, session-init's discovery and inbound routing's horizon advisory,
  takes the live `arc status --project` render, never the file.
- **The composition cannot reroute onto the in-repo implementation.** The in-repo `list` is built on it:
  `composedMetas` (`lib/store/in-repo/meta.ts`) calls `resolveCallerComposedLifecycleIndex`, which reaches
  `resolveProjectReadinessComposition` (`lib/status/project-view.ts`), so the composition fed from `list` would call
  itself.
- **ROADMAP's machinery is deleted at the cutover anyway** — the pre-commit assert, the conflict remedy, the merge
  driver, and every in-repo render on lifecycle's edges — so stopping each path on the capability first would be
  throwaway work, much of it in entry points with no store in scope.

## Direction (Owner, 2026-10-16)

- **No pre-flip change.** Today's status, ROADMAP, `STATUS.USER`, and `arc view` code stays the in-repo arm, its
  behavior unchanged. The flip arms' additions to the pure modules both arms run — the composer, the horizon advisory,
  and the in-flight builder — are optional inputs and values the in-repo arm never passes, so its render stays
  byte-identical. The other additions before the flip are the capability dispatch in the handlers that serve a flip
  arm, and the three fixes to duplication that survives the flip (§ Fixes before the flip).
- **Rendered on demand, never stored or projected.** From the flip `arc status --project` (with `--json`) and
  `arc status --user` render when asked: no ROADMAP file, no `STATUS.USER.md`, no cache, no archive-index file. The
  projected `completed/` folder, with each archived work unit's `{quarter, sequence}` in its placement, is the archive
  listing (`spec-seam-lifecycle.md` § 4).
- **Built here, before the cutover, dark until the flip,** from lifecycle's typed view and locus's in-flight set rather
  than today's modules, and verified on the reference backend.
- **Today's machine leaves at the cutover,** in two steps.
    - **Its flip change** takes the ROADMAP template out of the installer — the template with its `init-recipe.json`,
      `SCAFFOLDED_FILES` (`lib/classification.ts`), and `manifest.json` entries — and the integrity check's presence
      test for `ROADMAP.md` (`verify-integrity.sh`, in both copies). Each acts once no ROADMAP file exists: the
      installer writes the template into a projected root, `arc health` reports the manifest entry missing, and the
      presence test fails. `spec-storage-projection.md` already expects the installer change of the cutover.
    - **Its deletion pass** takes the in-repo arms and the remaining cutover-owned ROADMAP paths: the pre-commit assert
      and regeneration trigger; the conflict remedy and its hidden command, `arc hook-remedy-roadmap-conflict`; the
      merge driver, with its `.gitattributes` attribute and `arc update`'s wiring;
      `arc base merge --regenerate-roadmap`; `lib/markdown/authority.ts`'s `derived-readiness` classification, with its
      remedy text in `lib/markdown/contracts.ts`; the in-repo arms' reads of the layout's `project-document` address,
      which the notes list, the address itself (`ProjectDocumentKindSchema`, `lib/layout/schema.ts`) staying for
      `storage-projection`'s never-adopted rule (§ Coordination); `isPlanningArtifactPath`'s `ROADMAP.md` literal
      (`lib/change-facts.ts`); `.arc/system/arc-checks.yml`'s `ROADMAP.md` exclusion; the hooks README's remedy text, in
      both copies; the merge-gate `CODEOWNERS` template's `ROADMAP.md` line, in both copies, which `setup-merge-gate.md`
      copies into a project's `.github/CODEOWNERS`; and this repository's `.github/CODEOWNERS` entry. From the flip
      these stay in place, inert: each acts only on a staged or conflicted `ROADMAP.md` or a staged meta, none of which
      a flipped checkout stages, or names a file that no longer exists, and `arc update` re-wiring the merge driver is
      harmless. The tracked pre-commit hook runs the hidden command on every arc-in-git commit, so removing it any
      earlier would fail each commit on a branch from before the flip.
- **Departures this records:**
    - the cohort's "every member reroutes onto the in-repo implementation" does not apply to this member, which
      changes nothing before the flip but the dispatch and the three fixes;
    - the register's fates: ROADMAP's (key 18) is no rendered file at all, only the on-demand view; `STATUS.USER`'s
      (key 53) is rendered on demand with no cache; and the derived archive listing (key 06) gives way to the projected
      `completed/` folder;
    - D15's order, in which every path that writes, renders, or checks ROADMAP stops on the capability before the
      deletion pass: only status's own write stops (`--staged --write` refuses), the template's install entries and the
      integrity check's presence test leave in the flip change, and the rest stay inert until the deletion pass;
    - lifecycle's closed-Errand reads (`spec-seam-lifecycle.md` § 4, § 19): neither the listing of closed Errands nor
      `arc view` of one is built (Owner, 2026-10-16);
    - key 05's "checks run where state is written, lint included": from the flip no Markdown check a gate runs reads
      projected state, which is gitignored and never staged — neither this repository's `lint:md`, whose worktree view
      lists with `--exclude-standard` (`enumerateTrackedMarkdownPaths`, `lib/markdown/selection.ts`), nor the link
      check the shipped pre-commit hook runs over staged files (`validate-links.sh`), the general Markdown check other
      projects get, the hook's checks of state files' shape having their own register fate. Checks over state are not
      this member's: `storage-projection` owns which files a check may read, and `projected-markdown-checks` the check,
      and the departure stands until that work unit ships (§ Coordination; Owner, 2026-10-16);
    - the artifact-kind lists' "the surviving lists derive from the family registry's kinds": this member's two stay
      hand-kept — `VIEW_KINDS` as a table typed by `KindId` and `WorkUnitArtifactKindSchema` held by a conformance
      test — so a kind the registry adds takes a second edit, since `lib/layout` cannot import the registry.

  `cohort-storage-seam.md` takes the amendment at draft close, as lifecycle's pre-flip exceptions and decomposition's
  departures were recorded there.

**Boundary: stays one work unit** (2026-10-16). Rendering status from typed listings is one concern; the Paused tier
and the conflict view are status surfaces over the same composition, and neither warrants a work unit of its own.
Nothing is independently landable before the flip, and program work units land single-branch with chunked review. No
delivery plan.

## What today's code holds

Re-verified at `19018e64c`, which carries the merged `seam-lifecycle` and `seam-record-kinds`; the rows, the files no
row covers, and the evidence are in `notes-seam-status-roadmap.md`.

- **One capability check in the partition** — lifecycle's `arc status <slug>` store arm (`handleStoreLifecycleStatus`,
  `handlers/status/lifecycle.ts`), dormant while both backends report `stateOffBranch: false` (`lib/store/create.ts`,
  `lib/store/in-repo/backend.ts`). The other status modes carry no store (`SessionStatusContext`).
- **Lifecycle already stops its own ROADMAP and `STATUS.USER` writes from the flip:** no `fromFlip` edge lists
  `reconcile-roadmap` or `reconcile-status-user` (`lifecycle-transitions.ts`), and `handleStoreStart` returns before
  `refreshRoadmapForStartCeremony` (`handlers/start.ts`).
- **Status's own writes** are `handleStagedProjectStatus`'s ROADMAP write (`--write`) and `handleUserStatus`'s
  `STATUS.USER.md` write through `assembleStatusUserView` (`handlers/status/views.ts`).
- **Nothing renders the derived views** the registry names (`DERIVED_VIEWS`, `lib/store/registry.ts`); only
  `project-status` has a layout address.
- **The data a flip arm reads exists:** `listLifecycleIndex` and `readLifecycleView` (`lib/store/lifecycle-index.ts`)
  return each meta's parsed fields — owner, cohort, dependencies, priority, `Class`, and the pause
  (`MetaPauseSchema`, `lib/active/meta-schema.ts`) — with placement; `readWorkUnit`, `readLifecycleDesign`, and
  `resolveCurrentWorkUnit` serve lookup, the design, and the claim; and `store.lookup` by lineage origin finds a retired
  work unit's lineage record (`lib/store/lookup.ts`).
- **Status drops the pause today:** `readProjectMeta` (`project-view.ts`) does not read it, and parked work comes from
  `isParkedPointer` and `scheduling: "parked"`.
- **Conflict records** come in three shapes (`ConflictRecordSchema`, `lib/store/conflict.ts`) — hunk, entry, and whole
  record — each side labelled `{actor, time}`; their kinds are unhomed in-repo, so a conflict view runs only on a
  backend that stores them.

## Members

### Status and roadmap

#### From the flip

- **`arc status --project`** acquires from lifecycle's view alone (`readLifecycleView`, `lib/store/lifecycle-index.ts`),
  never from `resolveProjectReadinessComposition`. It maps the view's entries to `ProjectReadinessRecord`s and feeds
  today's pure composer (`composeProjectReadinessViewResult`, `lib/status/project-view.ts`), which builds its own index
  from the records, so the tiers, the dependency rules (`classifyDependencies`: an edge is satisfied once its work unit
  has shipped, and one naming no work unit blocks the row with a warning), and the fact rows stay one implementation
  across the flip; only the acquisition differs, and the in-repo one leaves at the cutover. The tiers are In Flight,
  Ready, Blocked, and Paused, Paused taking Parked's place, and In Flight comes from placement. Locus's in-flight set
  (`spec-seam-locus.md` § 3.1, A9) adds nothing here, since its degradation concerns Errand and claim reads the view
  never shows; it feeds only `--user`'s in-flight slice. A view that is not complete renders with its diagnostics as
  warnings, never read as absence. The view carries no render stamp, since a render on demand cannot go stale. `--json`
  keeps today's fact rows (`ProjectReadinessFact`) — purpose, owner, state, position, dependency satisfaction,
  readiness, and `horizonAdvisory` — for session-init's discovery and inbound routing; `projectHorizonAdvisory`
  (`lib/status/project-horizon.ts`) gains its paused arm.
- **An edge naming no listed work unit** is looked up through `store.lookup`, which the composer cannot do, so the flip
  acquisition resolves each and passes the results as an optional input the in-repo acquisition never passes. A lookup
  refusing other than `not-found` warns with its condition and never reads as a missing work unit:
    - **By slug first,** which resolves a renamed work unit's former slug — an in-flight dependent keeps it until its
      owner's reconcile (`spec-seam-lifecycle.md` § 7.1) — so the edge classifies against that work unit, as
      `integratingDependents` (`handlers/abandon-store.ts`) falls back to a slug lookup.
    - **Then by lineage origin,** as `lib/work-unit/store-retirement-evidence.ts` does, for a retired origin, decomposed
      or abandoned. It has no row from the flip: the retiring transition removes its primary (`runStoreAbandon`,
      `lib/work-unit/verbs/abandon-store.ts`; decomposition's terminal batch), so it never reads as in flight. Its
      dependents that keep the edge — in flight or paused after a cut, and every dependent after an abandonment, which
      rewrites none (record-kinds § 7.4) — warn naming the retirement, the dependent's own disposition, and that its
      reconcile applies it, in place of `classifyDependencies`' "missing work unit". The disposition is the
      dependent's `incoming` entry for a cut — the work units replacing the edge, or why it drops
      (`LineageRecordSchema`, `lib/store/kinds/lineage/schema.ts`) — and `abandoned` for an abandonment. A dependent the
      cut did not map has no disposition (`unmapped-dependent`, record-kinds § 5.3), so its warning says so and names
      that section's remedy: editing `Depends On`, by its owner or, for a stub, by anyone. The edge stays
      unsatisfied, as a dangling edge does today, so a stub dependent of an abandoned origin reads Blocked while a
      stub, and keeps the unsatisfied edge through Planning until a dependency reconcile drops it
      (`planDependencyReconcile`, `lib/work-unit/side-effects/discharge-dep-edges.ts`): activation's
      (`runStoreActivate`), or `arc wu reconcile --apply` from its checkout sooner; grooming the stub's `Depends On`,
      which anyone may edit (§ 5.3), clears it before then.
- **Freshness.** By default `--project` and `--user` pull through the store's pull port before listing, as A10's
  `--fetch` does for the slug query (`spec-seam-locus.md` § 4.8, § 16), and `--local` and `--no-fetch` skip the pull.
  This keeps today's choice between a fresh and a local render (`handleProjectStatus`, `handlers/status/views.ts`) but
  differs in kind: today's default reads remote membership and writes nothing (`passive-live`), while a pull merges
  remote state into the local store, as any pull does, filing a conflict where sides diverge, which
  `arc status --conflicts` then shows. An unreachable remote or a refused pull renders from the local store with the
  pull's condition as a warning. Of the sync states and pull notices the pull reports (`PullResult`), `no-remote`
  renders from the local store with no warning, since a store with no remote is ordinary; `ended-with-conflicts`
  warns naming `arc status --conflicts`; and each other renders as a warning naming its remedy — a remote that must be
  designated (`designation-needed`) with the designation line, as session start's `user` slot carries it.
- **The Paused tier** shows Planning and Active work alike, with each pause's reason, what it waits on, and whether it
  is open to takers, read from the meta's `fields.pause`, and each item's resumable or review-due mark, whose review
  flag `spec-seam-lifecycle.md` § 8.3 makes visible to everyone. The marks are locus's (`spec-seam-locus.md` § 4.4,
  A15): the flip acquisition calls its exported `markPausedWorkItem` (`lib/session-init/paused-work.ts`), which reads
  the store and `pause.review_after_days`, for each paused row, as locus's `pausedWork` slot does over the person's
  listing, and passes the marks to the composer as an optional input, never computing them a second time. The function
  reads no identity or checkout, so it marks anyone's paused work alike.
- **`arc status --user`** renders the identity's in-flight and ready slices on demand, and writes nothing. The
  in-flight slice comes from locus's in-flight set and feeds today's pure builder (`buildInFlightMineSlice`,
  `lib/status/in-flight-mine.ts`), which gains its paused arm, keeping today's identity rule (`keepForIdentity`,
  `lib/git/in-flight-derivation.ts`): every entry outside team mode, and inside it the identity's own or unattributed.
  The ready slice comes from lifecycle's view through the composer's readiness classification, which `project-view.ts`
  exports as a pure function the composer itself calls, so `ProjectReadinessViewResult` and today's `--project --json`
  output keep their shape. Its rows are the ready ones that are the identity's own or unattributed, every row with no
  identity, as today (`isMine`, `lib/status/ready-mine.ts`), rendered in today's columns
  (`STATUS_USER_READY_COLUMNS`, `lib/status/render.ts`). `ProjectReadinessRecordCandidate` gains an optional `class`,
  which the flip acquisition fills from the meta's parsed `workClass`, so Class still renders. `buildReadyMineSlice`'s
  second readiness rule stays in the in-repo arm.
- **`arc status --project --staged` and `--write`** refuse `unsupported` from the flip, naming `arc status --project`,
  as `arc park` refuses naming `arc pause`.
- **`arc status <slug>`** is lifecycle's store arm with locus's additions (A10); this member changes only its purpose
  read (§ Fixes before the flip).
- **The conflict view** is `arc status --conflicts [<conflict>]`, where `<conflict>` is `storage-projection`'s token,
  `<family>/<owner type>/<owner name>/<id>`, which its notice line prints and `arc save --resolve` parses. With no
  argument it lists every open conflict across the ten families' conflict-record kinds (`lib/store/catalog.ts`). With a
  token it lists that family's conflict-record kind with no owner in the listing's input (`ListInputSchema`,
  `lib/store/read.ts`) — since each backend resolves an owner named without a UID to a single holder — and matches the
  token's owner type, owner name, and ID itself, as projection's `arc save --resolve` does (its Task 4.10), showing each
  match where several owners do; an unknown token refuses, naming `arc status --conflicts` to list them. Each shows
  the conflict's subject, both sides' labels, and both sides' content — for a hunk the base lines and both sides, for
  an entry its sections, for a whole record both values. Before the flip the flag refuses `unsupported`, since the
  in-repo implementation stores no conflict record.
- **`arc view`** resolves its default target from the checkout's claim (`resolveCurrentWorkUnit`) and `--for <slug>`
  through `readWorkUnit`, and reads every kind through the contract, opening its projected path: the work unit's
  artifacts (`work-item/*`), its cohort's document (`cohort/document`, today `resolveActiveCohortDocPath`), the
  identity's working memory and inbox (`personal/working-memory`, `personal/inbox`), the project inbox
  (`project-inbox/inbox`), and `design`, selected through `readLifecycleDesign`, which gains a return of the reference
  of the record it selects. `session-notes` opens the meta, where session context lives from the flip
  (`spec-storage-contract.md`, the per-work-unit workspace), resolved as the `meta` kind is, through the work-item path
  below, which reads no identity, never the interim `personal/session-context` kind, which retires at the flip. It gives
  the path locus's `resolveWorkUnitSessionNotesPath` (`lib/handoff/session-notes-path.ts`) gives from the flip (its Task
  2.8.a), but takes no identity, which that resolver requires; the in-repo arm keeps calling it, with its
  missing-identity refusal (`resolveExactKind`, `lib/view-artifact.ts`), and the personal kinds keep theirs
  (`resolveViewArtifact`). `VIEW_KINDS` (`lib/view/types.ts`) keeps today's ten names, each mapped in one table typed by
  `KindId` (`lib/store/catalog.ts`) to its registry kind — `inbox` to the personal inbox, or with `--project` the
  project's, `session-notes` to `work-item/meta`, and `design` to the selector rather than a kind — so a renamed or
  removed kind fails the type check. A work item's path comes from the one function locus adds under `lib/store/` for it
  (`spec-storage-projection.md` § 10.2), and a target counts as projected here when a file exists at that path. A target
  with none, such as another identity's in-flight work unit under the default `mine` view (`spec-storage-projection.md`
  § 10.4), renders the record's content through `ViewArtifactResult`'s content arm (`lib/view/types.ts`), which
  `resolveRefViewArtifact` (`lib/view/started-artifacts.ts`) builds today: its `ref` is the record's version and its
  label names the work unit and kind, and `--path` and `--editor` refuse there as they do for a ref today
  (`viewArtifactFileRefusal`); a file briefly absent during a refresh falls to the same arm, which shows the same
  content. A completed work unit, refused today ("completed viewing is unsupported"), opens through `--for` at its
  projected path under `completed/`. With no kind given, an open work unit opens its furthest artifact present, as today
  (`resolveFurthestPresent`, `lib/view-artifact.ts`: tasks, spec, draft, meta), and a completed one opens its meta,
  which carries its Completion Notes and Release Notes Entry. An Errand claim gets no default target, and a closed
  Errand, never projected (`spec-seam-lifecycle.md` § 4), no view. The user-surfaces resolver
  (`resolveUserSurfaceResolver`, called from `handlers/view.ts`), the hand-built project inbox path, and
  `selectWorkUnitDesign` stay in the in-repo arm.
- **The capability dispatch:** each status and view handler serving a flip arm builds its store as `handleBaseSync`
  does (`createStore(createDefaultStorePorts(...))`) and branches on `usesOffBranchState`.
- **The `format:tables` modules** (`lib/markdown/format-plan.ts`, `format-write.ts`), which normalize metas outside
  lifecycle's executor, need nothing: from the flip a meta they rewrite is a hand edit to a projected file, which
  `storage-projection`'s write-back persists through the kind's write check.

#### Fixes before the flip

Duplication that survives the flip and would drift, fixed here (Owner, 2026-10-16); duplication that lives only in an
in-repo arm leaves with it at the cutover and stays.

- **One identity.** `readIdentityPointers` (`handlers/identity-pointers.ts`), `resolveProjectErrandOracleContext`
  (`lib/status/project-oracle-context.ts`), and the review gate's local host (`readLocalReviewLiveContext`,
  `scripts/review-gate/hosts/local/live-context.ts`) read `arc.identity` only (`readConfiguredIdentity`), while the
  store's ports, `arc view`, and the Errand verbs fall back to the slugified `user.name` (`resolveIdentity`). All three
  switch to the non-prompting `resolveIdentity`. With `arc.identity` unset, then:
    - every `arc status` mode — session-init's probe among them — `arc base`, and `arc recover` resolve the fallback
      identity, and session-init's identity-absent arm fires only when `user.name` is unset too;
    - the in-repo ROADMAP renders that read the oracle context classify Errands under the identity
      `arc status --project` reads, which they would not if `resolveProjectErrandOracleContext`, serving only them,
      stayed configured-only. They run through `renderRoadmapFromIndexViewResult` and `renderRoadmapFromIndexResult`
      (`lib/status/roadmap-regeneration-assert.ts`) — the staged write, lifecycle's edge render
      (`executor-context-status.ts`), `arc rename`, the pre-commit assert, and the conflict remedy with
      `arc base merge --regenerate-roadmap` — and through `renderTrackedProjectReadinessViewResult`, `arc start`'s
      refresh. Decomposition's render (`renderGitV3RepositoryTreeRoadmap`, `git-decompose-v3-repository-plan.ts`) reads
      no Errand records, so the switch leaves it as it is;
    - every consumer of the review gate's local live context's identity follows the switch, resolving the fallback
      identity where today a null identity refuses or reads nothing: pre-publication Owner authorization
      (`policy/pre-publication-composition.ts`), local review authority (`hosts/local/review-authority.ts`), and in
      `runtime/respond-composition.ts` the frontline approver (`resolveFrontlineActors`), the admitted-author fallback
      (`resolveLocalActors`), and the active Errand (`resolveActiveErrand`); and in
      `runtime/local-prepare-composition.ts` the Errand claim a fix response's applicability and Errand lineage
      authority read. The context's Errand vehicle comes from that identity's claims (`readTransientInFlightIndexes`,
      which reads none for a null identity), so an incomplete claims snapshot of the fallback identity throws
      (`readLocalReviewLiveContext`) where today it is an absence. `arc.identity` and `user.name` are both
      self-declared local Git configuration, so requiring the first adds a setup step, not authentication (Owner,
      2026-10-16, taken from `seam-delivery-review`);
    - the text that names `arc.identity` as required moves with the switch to name the unresolved identity:
      `runStatusUserView`'s message (`lib/status/user-view.ts`), `handleRecoverAudit`'s (`handlers/recover.ts`),
      `SessionIdentityMissingError`'s (`commands/status/result-composition.ts`), and `strategy-session-operations.md`'s
      identity-missing short-circuit, which that error carries out, edited in the package source and synced; and the
      status render's identity line (`renderIdentity`, `commands/status/format.ts`), labelled `arc.identity:` today,
      is relabelled `identity:` whether or not `arc.identity` is set, since it shows the resolved identity.
- **One purpose parse.** The design kinds' parser already returns `purpose` (`DESIGN_REGISTRATIONS`,
  `lib/store/kinds/design/registration.ts`), but `readLifecycleDesign` re-parses each candidate's content to choose
  one (`readDesignPurpose`) and the slug store arm re-parses the design (`extractWorkUnitPurpose`); both read
  `fields.purpose` instead, with one first-sentence extractor.
- **One work-unit kind list.** `WorkUnitArtifactKindSchema` (`lib/layout/schema.ts`) cannot import the registry under
  the `layout-dependencies` predicate, so a conformance test holds each of its names, through one typed table, to a
  registered `work-item/*` kind — `tasks` to `work-item/task-list` among them — failing on a rename or removal.

Left as they are, each in an in-repo arm: the two design selections (`selectWorkUnitDesign`, `readLifecycleDesign`),
which never run together; the parked derivation (`isParkedPointer`, `listParkedSlugs`, `deriveState`); the hand-built
project inbox path in `lib/view-artifact.ts`; and the `ROADMAP_PATH` literals.

## Alternatives

- **Reroute every module onto the in-repo implementation** — the cohort's default and the consumer map's end states.
  Rejected: the composition cannot feed from the in-repo `list` without a cycle, and nothing reads what the reroute
  would preserve.
- **Render the derived views into projected roots** (`DERIVED_VIEWS`). Rejected (Owner, 2026-10-16): no one reads the
  files, and it adds rendering, an address for each view, and a refresh trigger the on-demand render does without.
- **Stop ROADMAP now,** before the flip. Rejected: lifecycle's in-repo edges, `arc start`, the pre-commit assert, the
  merge driver, and the workflows' regenerate steps all assume the file, and the cohort changes no workflow text before
  the flip.
- **Stop every ROADMAP path on the capability before the deletion pass** (D15's order). Rejected (Owner, 2026-10-16):
  the bash hook, the scripts, the merge driver, and setup have no store in scope, so each stop needs a store or a probe
  built only to be deleted, and every path left for the deletion pass is inert from the flip anyway.
- **Delete the hook-reached ROADMAP paths in the flip change.** Rejected: a branch from before the flip keeps its
  tracked pre-commit hook, which runs `arc hook-remedy-roadmap-conflict` on every arc-in-git commit
  (`.arc/system/.internal/githooks/pre-commit`), so a CLI without the command fails each commit there, while the inert
  paths cost nothing until the deletion pass.
- **Leave the Paused tier's marks to session-init.** Rejected: `spec-seam-lifecycle.md` § 8.3 makes the review flag
  visible to everyone, and locus's per-item function supplies the marks without a second derivation.
- **Take a conflict's bare ID.** Rejected: conflict records are keyed by ID per owner across ten families, and no
  lookup takes an ID alone; projection's token names the family and the owner.
- **Refuse `arc view` of a work unit not projected here,** naming a pin. Rejected: `--for` reaches it today at its
  ref, and the content arm already renders one.
- **Keep a machine-local `STATUS.USER` cache.** Rejected: from the flip the lifecycle view is local, so an on-demand
  render needs no fallback.
- **Read only a configured identity everywhere.** Rejected (Owner, 2026-10-16): it changes the store, `arc view`, and
  the Errand verbs, where the fallback identity is the shipped behavior.

## Unknowns and Assumptions

- **Verified on the reference backend only** until the cutover's rehearsal; the flip arms first run for real after
  the flip.
- **Locus's pieces land first,** recorded as a `Depends On: seam-locus` edge: the in-flight set's store arm (A9),
  `markPausedWorkItem` (A15), `pause.review_after_days`, and the work-item path function are `seam-locus`'s and
  unshipped.

## Scope boundary (Won't Do)

- Change the behavior of status, ROADMAP, `STATUS.USER`, or `arc view` before the flip beyond the dispatch and § Fixes
  before the flip.
- Render any derived view as a file, or keep a `STATUS.USER` cache.
- Build an archive listing, a closed-Errand listing, `arc view` of a closed Errand, or an Errand claim's default
  `arc view` target.
- Delete a `STATUS.USER.md` left on a machine from before the flip; `storage-projection`'s never-adopted rule leaves it
  inert.
- Delete today's machine — the cutover's flip change and deletion pass.
- Build Markdown checks over state — `storage-projection`'s selection and `projected-markdown-checks`' check.
- The render standard, the `STATUS.PROJECT` rename, and the cohort and graduate helpers (`roadmap-tooling`).
- Change any workflow's text.

## Coordination

- **`storage-cutover`:** its flip change takes the ROADMAP template out of the installer, with its manifest entry and
  the integrity check's presence test, as `storage-projection` also expects of it; its deletion pass takes status's and
  `arc view`'s in-repo arms, the remaining cutover-owned ROADMAP paths (§ Direction), and `DERIVED_VIEWS`
  (`lib/store/registry.ts`), which no view reads once none renders as a file. Removing
  `arc hook-remedy-roadmap-conflict` fails every commit on a branch whose tracked pre-commit hook still calls it, which
  its pass must handle. Routed at draft close.
- **`seam-locus`:** told on 2026-10-16 of the direction, the identity fix reaching session-init's probe, and the
  purpose read in the slug store arm its A10 also edits; this member's implementation lands after locus's, so locus's
  edit lands first. Its § 16 expectations of status are met in the flip arms — a decomposed origin by its absence from
  lifecycle's view, with lineage read only for its dependents' edges (told on 2026-10-16) — and the in-repo record
  merge (`mergeProjectReadinessRecords`) stays as today, so a decomposed origin reads as today until the flip. Its A15
  exports the Paused tier's marks (`markPausedWorkItem`), and it was told that the closed-Errand listing its close-time
  stamp orders (§ 8.1) is not built. Its Task 2.8.a gives the session-notes resolver `arc view` already calls
  (`handlers/view.ts`) its arm from the flip, the meta's projected path, before this member's flip arm edits
  `handlers/view.ts` and `lib/view-artifact.ts`; from the flip that arm opens the same path through the work-item path
  function in place of the resolver, which requires an identity, routed to it at draft close.
- **`storage-projection`:** told on 2026-10-16 that no derived view renders as a file, of the conflict view's three
  shapes, that `arc status --conflicts` takes its notice token, and that `lint:md:fix`
  (`markdownlint-cli2 --fix "**/*.md"`) reads and rewrites projected files outside any selection, editor lint reading
  them too. Its never-adopted rule stays, re-reasoned as guarding files left from before the flip — a machine's
  `STATUS.USER.md`, which no one deletes, and a tracked `ROADMAP.md` on a branch that has not merged the cutover — and
  it names those paths itself, since `DERIVED_VIEWS` leaves at the cutover, `ROADMAP.md`'s through the layout's
  `project-document` address (its Task 5.8.c), which therefore stays past the cutover's deletion pass. Its notice line
  names `arc status --conflicts <conflict>`, needed before its Task 4.7.b. On Markdown checks over projected state (key
  05, § Direction), the Owner split the work on 2026-10-16, after this member asked: `storage-projection` owns the
  selection, by a forward amendment to `spec-storage-projection.md` — the projected Markdown files the checkout may
  edit, read from its index, leaving out protected files, files holding conflict markers, and the personal root's
  `.internal/` and `scratch/`.
- **`projected-markdown-checks`:** the check over state, planned in `state-storage`, which `storage-cutover` depends
  on: its deadline, never inside save; its pass key, which `resolveCheckKey` (`lib/checks/key-resolver.ts`) takes from
  Git-tree content; what the shipped pre-commit hook gives other projects; and a table fixer for state. It takes no
  edge on `storage-projection`: it builds against the selection's interface, and whichever lands second connects the
  two. Key 05's register row in `cohort-state-storage.md` names both `storage-seam` and it, the lint clause split
  (Owner, 2026-10-16).
- **`seam-decomposition`:** a decomposed origin has no row from the flip, an edge still naming it reads from its lineage
  record (record-kinds § 7.4), and decomposition writes no ROADMAP from the flip. Between a cut's two batches status
  shows its members and new cohort documents as ordinary stubs and cohort documents and the origin as live, marking
  no cut in progress and reading no `work-item/cut-map` record (Owner, 2026-10-16; told that day).
- **`seam-delivery-review`:** `arc status <slug>`'s operational boundary stays its (A10); from the flip its boundary
  read moves into `handleStoreLifecycleStatus`, which this member's purpose read and locus's A10 also edit. Switching
  its local host's identity read (`readLocalReviewLiveContext`) is this member's (§ Fixes before the flip; Owner,
  2026-10-16), and its Task 7.2 edits `live-context.ts` for the flip, so whichever lands second takes the conflict.
  Told on 2026-10-16 that its § 5.7 owner-authority wording, its trust section, and its notes, which require
  `arc.identity`, read the fallback identity once this member's fix lands.
- **`roadmap-tooling`:** its stored-file render standard, the rename, and the `STATUS.USER` writer lose their object
  once no view renders as a file. Routed at draft close.
- **`goal-aware-direction`:** its recommender's inputs come from lifecycle's view, not from
  `resolveProjectReadinessComposition`, which stays in-repo and leaves at the cutover, nor from the
  `arc status --project --json` facts, which carry no priority, cohort, `Depends On`, `Class`, or pause. Routed at
  draft close.

## Success signal

- **Before the flip nothing changes but the fixes:** status and `arc view` render as today with `arc.identity` set, but
  for the status identity line's label; with it unset, status, base, recover, the in-repo ROADMAP renders that read the
  oracle context, and the review gate's local host resolve the fallback identity.
- **From the flip, on the reference backend,** `arc status --project` and `--user` render from the store with the
  Paused tier and an incomplete view's warnings and write no file; a dependent of a retired origin warns naming the
  retirement; `--staged` and `--write` refuse; `arc status --conflicts` shows each shape, one at a time from a notice
  line's token; `arc view` opens the claim's work unit at a path laid out for it, a completed work unit's meta by
  default, and the content of a work unit with no file here.

---
