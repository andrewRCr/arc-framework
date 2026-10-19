# Task List: Seam Status and Roadmap

- **Design:** `spec-seam-status-roadmap.md`

---

## **Phase 1:** Before the flip — the three fixes

_Purpose:_ Land the fixes to duplication that survives the flip first: the identity, the one change observable before
the flip, and the purpose parse and kind list that hold the arms from the flip to one implementation each.

_Mode:_ `slice` — closes on status resolving the fallback identity end to end, with the purpose parse and the kind list
each held by its own test.

_Exit criterion:_ In a scripted repository with `arc.identity` unset and `user.name` set, `arc status --user`,
`arc status --session-init --json`, `arc recover audit`, and the review gate's local host resolve the slugified
`user.name`; with both unset, session-init's identity-absent arm fires and each message names the unresolved identity
and `git config arc.identity <name>`; over the reference backend, `arc status <slug> --json` reports a companion-designed
work unit's parsed purpose through the one selection; the kind-list test passes; and every other status, view, and
review-gate test passes unchanged.

_Design decisions:_ Every test the identity fix changes, the session-envelope golden among them, is named in its commit
and completion note, so Success Criterion 1's "unchanged but for" stays checkable. The plan is grounded against `main`
merged with the unshipped locus change; `notes-seam-status-roadmap.md` § Grounding baseline for the task list names the
symbols to re-ground when that change ships.

### `[x]` **1.1 Resolve one identity in status, its Errand context, and the review gate's local host — § 8.1**

- _Goal:_ With `arc.identity` unset, every `arc status` mode, `arc base drift`, `arc recover audit`, the in-repo ROADMAP
  renders that read the Errand context, and the review gate's local host resolve the slugified `user.name`, and every
  message that named `arc.identity` as required names the unresolved identity and how to set one.

    - `[x]` **1.1.a Resolve the three readers through `resolveIdentity`**

        - Status and ROADMAP resolve the fallback identity with their existing error policies. Local review binds
          identity and claim reads to the supplied checkout; real-repository coverage retains malformed-claim failures.

    - `[x]` **1.1.b Name the unresolved identity in the messages and the label**

        - Missing-identity messages name both resolution sources and the configuration remedy. Status labels the
          resolved value `identity:`; the package strategy and its rendered project copy describe the same fallback.

    - `[x]` **1.1.c Keep session-init's identity-absent arm for both values unset**

        - The identity-missing fixture unsets both configuration sources; its golden retains the absent arm with the
          actionable message. CLI coverage also carries a Git-name fallback through session-init without that arm.

### `[x]` **1.2 Read a design's parsed purpose through one selection and one extractor — § 8.2**

- _Goal:_ `readLifecycleDesign` and the slug query's arm from the flip read the design record's parsed purpose through
  one exported selection and one first-sentence extractor, so the slug query and the project view report the same
  purpose while every in-repo caller returns what it returns today.

    - `[x]` **1.2.a Export the design selection over a meta shape**

        - `selectLifecycleDesign` selects by artifact basename and decoded Purpose independently of placement;
          `readLifecycleDesign` returns the selected record beside its content and diagnostics. Reference-store
          coverage includes paired companions, fallback and empty values, and a `LifecycleEntry` input.

    - `[x]` **1.2.b One first-sentence extractor, read from the parsed field**

        - `extractPurposeSentence` serves the Markdown wrapper and the store slug query; the query reads the selected
          record's decoded Purpose. Companion-designed status reports its first sentence, while the existing in-repo
          extractor cases retain their outputs.

### `[x]` **1.3 Hold the layout's work-unit kind list to the registry — § 8.3**

- _Goal:_ Renaming or removing a `WorkUnitArtifactKindSchema` name, or the `work-item/*` kind it maps to, fails a test.

    - `layout/work-unit-kinds.test.ts` maps every declared artifact through one typed table to a registered kind and
      checks both projection and in-repo layout roles, including `tasks` → `work-item/task-list`.

### `[x]` **1.4 Before the flip — the three fixes** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base, with `arc check segment` green.

- _Outcome:_ With the latest base already merged, real-CLI user status, session-init, and recovery resolve the Git-name
  fallback; both-absent probes retain the actionable refusal. Checkout-bound review claims, companion-purpose status,
  and the layout-to-registry mapping close the remaining exit behaviors.

## **Phase 2:** The pure modules' additions, the in-repo render unchanged

_Purpose:_ Give the modules both arms run the optional inputs and values the arms from the flip need, pinned first by
byte-identity tests so the in-repo render cannot move.

_Mode:_ `layer` — closes on the composer, the horizon advisory, the in-flight builder, the scope window, and the
lifecycle entry carrying every addition, with the in-repo render byte-identical.

_Exit criterion:_ Task 2.1's byte-identity tests pass unchanged against literals captured before any other Phase 2 edit;
each addition is held by its own unit tests; and `lint:ts` reports no new violation in `lib/status/project-view.ts`.

_Design decisions:_ Every addition is an optional input or value the in-repo acquisition never passes or produces. The
composer's suppressions belong to in-repo acquisition, so extracting the tier classification is also what keeps the
composer inside the size and complexity gate; `notes-seam-status-roadmap.md` § Phase 2 — the pure modules records
the measurements.

### `[x]` **2.1 Pin today's in-repo renders byte for byte — § 1.4**

- _Goal:_ A test fails on any byte change to the in-repo project view and its `--json` facts, the staged and ROADMAP
  renders, decomposition's render, or the user view, over fixtures that reach every tier and warning.

    - `[x]` **2.1.a Share the status fixture builders**

        - `helpers/status-view-fixtures.ts` shares the project metadata, readiness records, local-ref executor, and
          user-view metadata and executor builders. Both original suites retain their assertions.

    - `[x]` **2.1.b Capture the renders as literals**

        - `in-repo-render-identity.test.ts` compares frozen strings and facts for the composer, both staged render
          APIs, tracked ROADMAP, decomposition, and user status. Its configured-identity fixtures reach all project
          tiers, both blocked depths, and all three warning codes; literals precede production changes in this phase.

### `[x]` **2.2 Export the tier classification, and carry a record's source, Class, and pause — § 2.1, § 3**

- _Goal:_ One exported pure function sorts readiness records into In Flight, Ready, Blocked, Paused, and Parked, which
  the composer calls, and a record can carry a store source, its Class, and its pause, none of which the in-repo
  acquisition sets.

- _Outcome:_ `classifyProjectReadinessRecords` supplies record tiers, blocked edges, facts, and diagnostics to the
  composer. Candidates carry optional Class and pause plus a store source; paused records occupy their own tier across
  placements and leave all ordinary tiers, while planned Active records without pause remain Parked.

### `[x]` **2.3 Classify unlisted edges through supplied resolutions — § 2.2**

- _Goal:_ Given a resolution for an edge naming no listed record, the composer's classification, its default readiness,
  and its depth banding all read it, so an edge's satisfaction and its row's readiness agree, and a Blocked row bands
  below the work unit its edge resolves to while showing the edge as written.

- _Outcome:_ Dependent-and-edge resolutions select listed targets, exact external verdicts, or unsatisfied edges with
  optional diagnostics. Default readiness reuses that classification; depth follows resolved targets while rows and
  facts retain written edges. Supplied retirement and read-failure warnings have dedicated codes.

### `[x]` **2.4 Render the Paused tier, its marks, and the paused horizon advisory — § 2.3**

- _Goal:_ The composer renders a Paused tier, printed only when it has rows, in the In Flight tier's columns plus the
  pause's reason, what it waits on, whether it is open to takers, and the mark it is given, and the horizon advisory's
  paused arm takes precedence over every other arm.

- _Outcome:_ The conditional Paused tier adds reason, waiting context, open flag, and supplied mark cells to the
  in-flight columns. Free-text cells fold newlines and escape pipes; empty cells use the em dash. The paused horizon
  advisory takes precedence while fact rows retain their lifecycle state.

### `[x]` **2.5 Make the render stamp optional, and add the warning codes — § 2.1**

- _Goal:_ With no `renderedRef` the composer's header carries no stamp lines, and `ProjectReadinessWarningCode` admits
  `listing-diagnostic`, `store-read-failed`, `dependency-retired`, `pull-incomplete`, `pull-notice`, and `slug-clash`.

- _Outcome:_ Without `renderedRef`, the title leads directly into the description with one blank line and no stamp
  block. The warning union carries all six store-view codes; stamped in-repo renders retain their frozen bytes.

### `[x]` **2.6 Give the in-flight builder a paused arm and a branchless entry — § 3**

- _Goal:_ `buildInFlightMineSlice` accepts the store's in-flight entries, rendering `Paused` where an entry's scheduling
  is `paused` and an entry with no branch, and still drops Errands.

- _Outcome:_ The builder accepts either in-flight entry type, renders paused scheduling as `Paused`, and maps
  branchless store work units through the same field normalization and dependency filter. Store Errands remain absent;
  parked in-repo entries retain their existing rendering.

### `[x]` **2.7 Close a paused work unit's scope window — § 4**

- _Goal:_ Given a pause, `projectScopeWindow` returns a null window on the `lifecycle` basis with the reason that a
  routed concern waits for its resumption, whatever the work unit's checkout or state.

- _Outcome:_ The optional pause precedes checkout-derived and lifecycle windows, yielding a null lifecycle window
  whose reason defers routed concerns until resumption. Planning and Active cases cover both checkout and no-checkout
  inputs; callers that supply no pause retain their existing windows.

### `[x]` **2.8 Carry a listed record's former slugs on its lifecycle entry — § 2.1**

- _Goal:_ A `LifecycleEntry` carries its primary record's former slugs as `aliases`, present only where the record has
  at least one, as it carries `links`.

- _Outcome:_ Lifecycle entries retain non-empty primary aliases and omit empty or absent collections. Reference-store
  rename and new-primary fixtures plus a Git-free in-repo held listing cover all three shapes; the frozen in-repo
  render baseline remains unchanged.

## **Phase 3:** The project view from the flip

_Purpose:_ Build `arc status --project`'s acquisition from lifecycle's typed view and dispatch to it on the capability,
the composition the user view and the slug query then reuse.

_Mode:_ `slice` — closes on `arc status --project` rendering from the store over the reference backend and writing no
file.

_Exit criterion:_ Through `handleProjectStatus` with a reference-backend store injected through the session context,
`arc status --project` and its `--json` result render In Flight from placement, Ready, Blocked in depth bands, and
Paused with marks; fold a reused slug to its live holder; omit a clash's holders with `slug-clash` over a store double;
render a withheld meta as an omitted `listing-diagnostic`, its name standing for no entry; resolve a former-slug edge, a
decomposed origin's edge, and an abandoned origin's edge as § 2.2 states; refuse over an `unreadable` listing naming its
remedy; write no file; and `--project --staged`, with and without `--write`, refuse naming `arc status --project`.

_Design decisions:_ The acquisition lives in new modules under `lib/status/`, reading only through the store and
`lib/store/` helpers, so no `store-raw-state`, `surface-names`, or `work-unit-paths` count grows. Status's refusals share
one renderer, built in Task 3.6: stderr `Error [<code>]: <condition> <remedy>` and, with `--json`,
`{ status: "refused", refusal }` on stdout, exit 1.

### `[x]` **3.1 Select the entry standing for each slug, reporting each clash — § 2.1**

- _Goal:_ From lifecycle's entries and its listing's diagnostics, one pure function returns the entry standing for each
  slug, the names that fail closed, and a `slug-clash` warning for each clash, so the composer gets one record per slug
  ranked as the store's slug lookup ranks holders.

- _Outcome:_ `selectStandingLifecycleEntries` selects current live names before aliases and completed generations,
  orders archived holders by quarter and numeric sequence, and omits clashes with holder-specific diagnostics.
  Name-bearing meta diagnostics withhold every namesake; record-key diagnostics leave unrelated entries intact.

### `[x]` **3.2 Map standing entries to readiness records, purposes from one listing per design kind — § 2.1**

- _Goal:_ Each standing entry becomes a readiness record carrying its slug, location, state, owner, validated priority,
  `dependsOn`, cohort, the store source, Class, pause, and its own work unit's design purpose, with each design kind
  listed once per render.

- _Outcome:_ `readStoreProjectRecords` maps parsed lifecycle fields and groups three design inventories through the
  exported `identityKey`, preserving generation-specific purposes. Failed inventories clear all purposes with repair
  warnings; complete listings retain their readable purposes and disclose omitted records through shared diagnostics.

### `[x]` **3.3 Resolve an unlisted edge by slug, then by lineage origin — § 2.2**

- _Goal:_ Every edge naming no standing entry resolves to a listed work unit, a retired origin with the disposition the
  dependent's own reconcile reads, an unsatisfied fail-closed edge, a store-read failure, or today's dangling edge,
  delivered as Task 2.3's resolutions.

    - `[x]` **3.3.a Share the reconcile's retired-origin query**

        - Exported `storeLineageEnumeration` and `queryRetiredOriginDisposition`; reconciliation calls the same
          terminal-alias selection and disposition matcher with the dependent's owner identity. The extracted query
          retains a renamed dependent's UID-bound cut disposition.

    - `[x]` **3.3.b Resolve each unlisted edge**

        - `resolveStoreProjectDependencies` binds former names to exact lifecycle generations, follows rename chains,
          and shares one lazy lineage observation. Retired edges retain dependent-specific dispositions and repair
          guidance; withheld names fail closed, while missing work and Errands keep dangling warnings.

### `[x]` **3.4 Mark each paused row through the marking function — § 2.3**

- _Goal:_ Each paused standing record gets the marks `markPausedWorkItem` returns under `pause.review_after_days`, and a
  marking that fails leaves its row unmarked with a `store-read-failed` warning carrying the failure's text.

- _Outcome:_ `readStoreProjectPauseMarks` parses each pause and delegates marking with the configured review age.
  Failed marking leaves its row unmarked and retains the failure text as a source warning. The session handler exports
  its existing positive-integer parser for dispatch reuse.

### `[x]` **3.5 Acquire the project view from the store, with its completeness — § 2.1**

- _Goal:_ One acquisition reads lifecycle's view once and returns the composer's input, its records, edge resolutions,
  marks, and source warnings, or the listing's refusal, so an unreadable store never renders as an empty view.

- _Outcome:_ `readStoreProjectViewInput` composes standing entries, readiness records, dependency resolutions, pause
  marks, and diagnostics from one lifecycle view. Unreadable and refused inventories retain actionable status refusals;
  absent inventories render empty input. The shared title preserves the existing header without freshness fields.

### `[x]` **3.6 Dispatch `--project` on the context's store, refusing the staged write from the flip — § 7, § 2.5**

- _Goal:_ `handleProjectStatus` branches on `usesOffBranchState` over the session context's store: from the flip it
  renders Task 3.5's acquisition through the composer and writes no file; before the flip it runs today's code; and
  `--project --staged`, with or without `--write`, refuses `unsupported` from the flip naming `arc status --project`.

- _Outcome:_ Project status dispatches on the selected store's capability and renders without writes, using the
  configured pause-review age. The shared refusal renderer emits actionable stderr plus the JSON refusal when requested;
  staged mode refuses `unsupported` with the on-demand command as its remedy. In-repo rendering stays on its existing arm.

### `[x]` **3.7 The project view from the flip** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds, with `arc check segment` green.

- _Outcome:_ The reference-store handler exercise rendered every tier, depth bands and pause marks; selected the live
  reused slug; omitted clashed and malformed records with diagnostics; and retained alias, cut and abandoned dependency
  meanings. Text and JSON refusals preserved remedies, staged mode refused, and the store and fixture files stayed unchanged.

## **Phase 4:** Freshness and the slug query

_Purpose:_ Render every pull result once, for every status mode under `--fetch`, and move the slug query's arm from the
flip onto the context's store, the standing entries, and the derived position.

_Mode:_ `slice` — closes on `--fetch` rendering each pull result as § 2.4's table states, and `arc status <slug>`
reporting its live holder's state, purpose, and derived position from the store.

_Exit criterion:_ Over the reference backend with the synchronization port bound to a double, `arc status --project
--fetch` pulls before listing and renders each of § 2.4's results as its table states, the default, `--local`, and
`--no-fetch` call no pull, `--local` wins over `--fetch` in either order, and the later of `--fetch` and `--no-fetch`
wins; an unbound port renders locally with no warning; and `arc status <slug> --json`, dispatched through the session
context, reports a reused slug's live holder's state, the parsed purpose, `derivedPosition` and `scopeWindow` over a
roster double, and a paused work unit's null window.

_Design decisions:_ This change renders every result the port's union carries. Where the ref backend's binding has not
landed, `incomplete` and notices are absent from the union, and whichever of the two changes lands second completes
`pullStoreStatus` for them and verifies both (spec § 12), Task 4.1 carrying this change's part where the binding lands
first; the flags' help text stays until the cutover rewrites it.

### `[x]` **4.1 Render every pull result and notice through `pullStoreStatus` — § 2.4**

- _Goal:_ `pullStoreStatus` (`handlers/status/store-locus.ts`) returns, for each pull result, the coded warning § 2.4's
  table names, built from `describeStorePull`'s orientation, so every status mode under `--fetch` renders one result the
  same way.

    - `[x]` **4.1.a Render the results the port gives today**

        - Shared pull orientation supplies coded diagnostics for missing identity, unreachable and undesignated remotes,
          retaining remedies and command arguments. Successful and no-remote outcomes stay quiet; session start's
          missing-identity summary names `git config arc.identity <name>`.

    - `[~]` **4.1.b Render `incomplete` and each notice, where the ref backend's binding has landed**

        - Not applicable to the current `PullResultSchema`, which has neither `incomplete` nor notices. The required
          condition re-read remains at Task 4.5's fresh base and verification before integration; if the binding has
          landed, this subtask runs there.

### `[x]` **4.2 Pull before the project view under `--fetch`, keeping today's flag precedence — § 2.4**

- _Goal:_ From the flip `--project` pulls through the session context's port, or the port's default where the context
  carries none, only under `--fetch` and before listing, with `--local` winning over `--fetch` and the later of `--fetch`
  and `--no-fetch` winning.

- _Outcome:_ Explicit refresh uses the selected synchronization port before lifecycle acquisition, retaining coded pull
  warnings in JSON and their text on stderr. Local/default renders do not pull; Commander flag precedence and quiet
  unbound-port rendering are covered through the session context.

### `[x]` **4.3 Build the status context before a slug query dispatches — § 7**

- _Goal:_ `handleStatus` (`handlers/status.ts`) builds the session context before it dispatches a slug and hands the
  slug query's arm the context's store and port, so no handler builds a second store and the in-repo arm's output is
  unchanged.

- _Outcome:_ Slug dispatch now receives the invocation's session context; its store arm refreshes through `storeSync`
  and constructs no store. Existing store consumers use production contexts with scripted identity evidence. The
  registered CLI exercise observes the selected store's refreshed owner, with existing in-repo status coverage retained.

### `[x]` **4.4 Read the slug query's state, derived position, and scope window from the store — § 4**

- _Goal:_ From the flip `arc status <slug>` reports the state the standing entries give, its derived position and scope
  window read as the in-repo arm reads them, and a paused work unit's null window, with the roster read through the
  derived locus probe given the arm's store and the context's identity.

- _Outcome:_ Slug state uses standing entries through the shared lifecycle-view index builder. Derived position and scope
  render in text and JSON, with pause overriding checkout scope and roster failures retaining their repair route.
  The shared production roster adapter resolves store-only metadata and identity-scoped claims; its new imports are
  recorded in the foundation inventory.

### `[x]` **4.5 Freshness and the slug query** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base, where Task 4.1.b's condition is read again, with
  `arc check segment` green.

- _Outcome:_ Merged fresh base `c67daedd6`; the sync union still excludes `incomplete` and notices. The reference-store
  handler exercise covered every current pull result, refresh ordering, both flag precedences and quiet unbound refresh;
  the slug exercise preserved live reuse, parsed purpose, derived position, scope and pause behavior without file writes.

## **Phase 5:** The user view from the flip

_Purpose:_ Render `arc status --user` on demand from the in-flight set and the project view's acquisition, writing no
file.

_Mode:_ `slice` — closes on `arc status --user` rendering both slices from the store and writing no `STATUS.USER.md`.

_Exit criterion:_ Through `handleUserStatus` with a reference-backend store injected through the session context and an
in-flight set double, `arc status --user` and its `--json` result render the in-flight slice with a branchless and a
paused row, the set's warnings, and for a degraded set the warning naming `arc status --user`; the ready slice from the
exported tier classification with Class, a clash's holders omitted with `slug-clash`; text mode prints each warning to
stderr; no `STATUS.USER.md` is written; with no identity it prints the identity message and exits 0; and a refused
listing refuses.

### `[x]` **5.1 Build the in-flight slice from the in-flight set — § 3**

- _Goal:_ The user view's in-flight slice comes from `deriveStoreInFlight` over the context's store, identity, and team
  mode, through Task 2.6's builder, with the set's warnings in their own text and, for a set marked degraded, a warning
  that the slice may be incomplete naming `arc status --user`.

- _Outcome:_ `readStoreUserInFlight` reads the selected local membership provider and builds rows without a cache.
  Team ownership stays with the shared derivation, Errands stay out of work-unit rows, and degraded membership carries
  the user-view retry route alongside the provider's own warning text.

### `[x]` **5.2 Build the ready slice from the exported tier classification — § 3**

- _Goal:_ The user view's ready slice is Task 2.2's Ready tier over Task 3.5's acquisition, the identity's own or unowned
  rows, rendered in today's columns with Class.

- _Outcome:_ `readStoreUserReady` filters the shared Ready tier through exported `isMine` and retains Class and source
  diagnostics. Planning, pause and dependency semantics now match the project view, including exact retired-generation
  satisfaction and omission of clashed holders.

### `[x]` **5.3 Dispatch `--user` on the context's store, writing no file — § 3, § 7**

- _Goal:_ `handleUserStatus` branches on `usesOffBranchState` over the context's store: from the flip it pulls once under
  `--fetch`, renders both slices, prints each warning to stderr in text mode, writes no `STATUS.USER.md`, and refuses a
  refused or `unreadable` listing through the shared renderer; before the flip it runs today's code.

- _Outcome:_ The capability arm renders both slices through shared `composeUserView`, with one explicit pull, string
  warnings and shared refusals, and no cache writes. Its default membership reader uses the selected store's production
  checkout roster; failed roster evidence remains advisory and degraded. The in-repo arm retains its text behavior.

### `[x]` **5.4 The user view from the flip** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds, with `arc check segment` green.

- _Outcome:_ The handler scenario over the reference store and injected membership reader exercised branchless and
  paused rows, Ready Class and clash omission, provider and degraded warnings, text stderr, identityless success and
  refused-listing repair. The checkout inventory remained unchanged with no derived cache file.

## **Phase 6:** The conflict view

_Purpose:_ Register `arc status --conflicts` as its own mode, refusing before the flip, and from the flip show the
store's open conflict records by their tokens.

_Mode:_ `slice` — closes on `arc status --conflicts` listing and showing every conflict shape over the reference
backend.

_Exit criterion:_ `arc status --conflicts` refuses `unsupported` before the flip naming `git status`, and refuses
alongside any other status mode through the input schema and the mode count; over the reference backend with conflicts
of each shape seeded across a project, a work-item, and a personal family, it lists every open conflict with its token,
labels, and content, shows a token's conflicts for a completed and a live holder of one name, refuses an unknown token
naming the listing, omits a record that does not decode with its warning, warns that the personal and claims families
were not read with no identity, and writes `{ conflicts, warnings }` with `--json`.

### `[x]` **6.1 Register `--conflicts` as an exclusive status mode, refusing before the flip — § 5**

- _Goal:_ `--conflicts [conflict]` is a status mode held exclusive everywhere the modes are, its help listed among them,
  and before the flip it refuses `unsupported` naming `git status`.

- _Outcome:_ `--conflicts [conflict]` joins schema validation, the defensive mode count, Commander exclusion lists,
  command-input registration and grouped help. Before the capability flips it uses the shared text/JSON refusal naming
  `git status`; the existing exclusion-message, help and inventory assertions include the new mode.

### `[x]` **6.2 List every open conflict of a listed item — § 5**

- _Goal:_ With no token, the view lists every open conflict across the ten families' conflict-record kinds, each by its
  token, the personal and claims families read for the resolved identity.

- _Outcome:_ `readStoreConflicts` enumerates the catalog's ten conflict roles and scopes personal and claims reads to
  the resolved person. Family refusal, unreadability, omitted keys, unqualified incompleteness and content-decode
  failures retain their repair routes beside good records; public tokens preserve complete IDs while omitting UIDs.

### `[x]` **6.3 Show the conflicts one token names — § 5**

- _Goal:_ With a token, the view retains the resolved person's scope for personal and claims, lists other families'
  conflict-record kinds without an owner, and shows each matching owner without treating an incomplete read as absence.

- _Outcome:_ `readStoreConflictToken` reads only the requested family, retains person scope and every same-name
  generation, and preserves matches beside omission warnings. Only complete reads prove an unknown token; no match
  after diagnostics, missed inventory or decode failure refuses as incomplete with the evidence and retry route.

### `[x]` **6.4 Render each conflict shape, and its `--json` result — § 5**

- _Goal:_ Each conflict shows its token, subject record, both sides' labels, and both sides' content in its shape, and
  `--json` writes `{ conflicts, warnings }`, under § 2.4's freshness.

- _Outcome:_ The registered conflict handler renders each preserved shape and removal, emits raw listed records with
  tokens and string warnings as `{ conflicts, warnings }`, and retains failed-token repair evidence. Explicit refresh
  precedes acquisition once; local flags suppress it, and failed refresh remains advisory beside local records.

### `[x]` **6.5 The conflict view** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds, with `arc check segment` green.

- _Outcome:_ The reference-backend handler scenario exercised every conflict shape, labelled text and raw JSON,
  malformed-record omission, reused-name generations, unknown tokens, identityless scope warnings, pre-capability
  refusal and mode exclusions. The checkout inventory remained unchanged.

## **Phase 7:** `arc view` from the flip

_Purpose:_ Build `arc view`'s arms from the flip — the explicit target, the kinds, paths and content, the cohort read,
the session notes, and the personal records — over the store the view dependencies open.

_Mode:_ `slice` — closes on `arc view` opening any work unit through the store, completed and unprojected ones
included.

_Exit criterion:_ Through `createViewDependencies` with a reference-backend store, a work-unit claim opens its work unit
and an Errand claim refuses with the message naming `arc view <kind> --for <slug>`; `--for` resolves a former slug and a
reused slug's live holder and refuses an ambiguous slug with the lookup's remedy; a completed work unit opens its meta
by default; a target with no file renders its content, and `--path` and `--editor` refuse there naming the remedy;
`session-notes` opens the meta with no identity; a companion design and a cohort document open at their paths; a
conflicted record's file opens as any projected target, and its content renders where no file exists, each with its
warning; and each other kind opens through § 6.2's table.

_Design decisions:_ Every path is rooted at the checkout, so a target counts as projected only where this checkout holds
its file; tests of a present file use temporary directories, since `pathExists` cannot be injected. The arms from the
flip read records through one optional port on `ViewArtifactDependencies` (Task 7.3), so the in-repo resolution keeps
its code. `notes-seam-status-roadmap.md` § Phase 7 — `arc view` records the pieces of locus's arm this phase replaces.

### `[x]` **7.1 Resolve `--for` through the store, a completed work unit included — § 6.1**

- _Goal:_ From the flip `--for <slug>` reads the work unit through `readWorkUnit`, resolving a former slug and a reused
  slug's live holder, opening a completed work unit, and refusing an ambiguous slug with the lookup's condition and
  remedy and the route to a completed holder's projected file under `completed/`.

- _Outcome:_ `resolveStoreViewTarget` reads current and former names through `readWorkUnit`, retaining the selected
  reference and shared projected placement. Completed targets open, ambiguous lookups retain their repair route and
  completed-file advice, and malformed metadata preserves its diagnostic instead of becoming an unknown target.

### `[ ]` **7.2 Refuse with a remedy where no default target resolves — § 6.1**

- _Goal:_ From the flip, a checkout with no work-unit claim refuses with a message naming that no work-unit claim
  resolved, each warning `resolveCurrentWorkUnit` returned, each candidate where it reports several, and
  `arc view <kind> --for <slug>`, which `unavailableTarget` prints in place of today's message.

- **Additional Context:** `notes-seam-status-roadmap.md` § Phase 7 — `arc view`

    - Extend locus's arm of `resolveAmbientTarget` (`handlers/view.ts`) to return it as the unavailable result's
      `message`, which `unavailableTarget` (`lib/view-artifact.ts`) already prints over its default; the in-repo arm
      keeps today's text.
    - A resolved claim gives only its slug: the arm then reads that work unit as Task 7.1's `--for` does, so both
      targets open through one read, with the work unit's own placement.
    - Build `test-first` (one behavior at a time):
        - an Errand claim and no claim each refuse with the remedy
        - a malformed marker's warning appears in the message
        - a work-unit claim opens its work unit

### `[ ]` **7.3 Read each view kind through one store port and one typed table — § 6.2**

- _Goal:_ From the flip each view kind reads its record through one port and one table typed by `KindId`, which maps
  each of `VIEW_KINDS`' ten names to the record it reads, so renaming or removing a kind it maps fails the type check,
  and with no kind an open work unit opens its furthest artifact present and a completed one its meta.

- **Additional Context:** `notes-seam-status-roadmap.md` § Phase 7 — `arc view`

    - `ViewArtifactDependencies` (`lib/view-artifact.ts`) gains an optional port: given a kind, a target from the flip or
      none, `--project`, and the identity, it returns the record's projected path, content, version, and conflicts, or
      its absence, or an error. `createViewDependencies` implements it from the flip in a new module beside
      `handlers/view.ts`, which holds the table, so `handlers/view.ts`'s ratchet counts stay as they are.
    - From the flip `resolveViewArtifactUnchecked` resolves every kind through the port in place of its file arms, the
      personal kinds and `inbox --project` among them, and opens the port's path where a file exists; Task 7.4 renders
      the rest. A record the port finds is present, so the furthest artifact is the furthest whose record exists.
    - Each entry is a read selector, since `design` reads the record `readLifecycleDesign` returns (Task 1.2.a), `inbox`
      reads one of two kinds, and `session-notes` reads the meta.
    - Paths come from `workItemArtifactPath`, `lifecycleRecordPath` for a companion, `cohortDocumentPath` for the cohort
      document, and `resolveArcPath` with a literal address kind for the personal records and the project inbox, each
      rooted at the checkout, so the arms add no surface name or work-unit address outside `lib/store/`.
    - The personal kinds read the resolved identity's records and keep today's refusal with none.
    - Build `test-first` (one behavior at a time):
        - each kind opens the record its entry names, `inbox --project` the project inbox
        - with no kind, an open work unit opens tasks, then spec, draft, meta; a completed one opens its meta
        - a personal kind with no identity refuses as today
        - the in-repo resolution never calls the port

### `[ ]` **7.4 Open a projected target at its path, or render its record's content — § 6.3**

- _Goal:_ A target whose file exists at its resolved path opens as today; one with no file renders its record's content
  through the content arm, `--path` and `--editor` refusing there with their own text; and a conflicted record carries a
  warning naming `arc status --conflicts <conflict>` for each conflict.

- **Additional Context:** `notes-seam-status-roadmap.md` § Phase 7 — `arc view`

    - The content arm from the store carries a discriminator of its own, which the three helpers `commands/view/run.ts`
      calls (`readViewArtifactContent`, `viewArtifactDisplayLabel`, `viewArtifactFileRefusal`,
      `lib/view/started-artifacts.ts`) check before `"ref" in artifact`, so the ref refusal never fires for it; its
      `ref` is the record's version and its label names the work unit and kind. The result gains a warnings field,
      which `run.ts` prints to stderr.
    - Build `test-first` (one behavior at a time):
        - a companion design and a cohort document open at their paths
        - a target with no file renders its content, and `--path` and `--editor` refuse naming
          `arc view <kind> --for <slug>`
        - with no kind, a work unit with no projected file opens its furthest record's content
        - a conflicted record's file opens as any target, and with no file its current side renders, each with its
          warning

### `[ ]` **7.5 Open session notes as the work unit's meta, with no identity — § 6.4**

- _Goal:_ From the flip `session-notes` opens the work unit's meta, resolved as the `meta` kind is through Task 7.3's
  port, reading no identity, and the in-repo arm keeps its resolver call and its missing-identity refusal.

- **Additional Context:** `notes-seam-status-roadmap.md` § Phase 7 — `arc view`

    - This arm replaces locus's session-notes arm from the flip: the handler's resolver call, its `sessionContexts` map
      and `readFile` override, and the short-circuit in `resolveViewArtifactUnchecked`.
    - Build `test-first` (one behavior at a time):
        - `session-notes` with no identity opens the meta from the flip
        - a conflicted meta renders as Task 7.4 states
        - the in-repo arm with no identity still refuses

### `[ ]` **7.6 `arc view` from the flip** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds, with `arc check segment` green.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Before the flip every status, ROADMAP, and `arc view` test over the in-repo implementation passes unchanged but
  for those the identity fix, the label, and `--conflicts`' registration change, each named in its commit, and Task
  2.1's byte-identity tests pass against the merged base's literals.
- `[ ]` With `arc.identity` unset and `user.name` set, every `arc status` mode, `arc base drift`, `arc recover audit`,
  the in-repo ROADMAP renders that read the Errand context, and the review gate's local host resolve the slugified
  `user.name`; with both unset, session-init's identity-absent arm fires and each message names how to set one; the
  identity line reads `identity:`.
- `[ ]` Over the reference backend `readLifecycleDesign`, the slug query, and the project view read the parsed purpose
  through one selection and report the same purpose, a companion-designed and a reused slug's work unit among them.
- `[ ]` The kind-list test fails on a rename or removal on either side, and `VIEW_KINDS`' table fails the type check
  when a kind it maps is renamed or removed.
- `[ ]` From the flip `arc status --project` renders from the store and writes no file, with In Flight from placement,
  Ready, Blocked in depth bands, and Paused; folds a reused slug to its live holder, or the latest archived; omits a
  clash's holders with `slug-clash`; renders listing diagnostics, a withheld meta's among them, as omitted
  `listing-diagnostic` warnings, its name standing for no entry; refuses over a refused read or `unreadable` listing;
  renders an `absent` listing empty; lists each design kind once; and carries no render stamp.
- `[ ]` Edges naming no listed work unit resolve as § 2.2 states: a former slug to its work unit, a decomposed,
  abandoned, or former-slug retired origin to a `dependency-retired` warning naming the disposition the dependent's
  reconcile reads, a lookup failure or an incomplete lineage listing to `store-read-failed`, and nothing, or an Errand,
  to today's dangling warning, each retired-origin edge unsatisfied.
- `[ ]` The Paused tier shows paused Planning and Active work and nowhere else, with reason, waits-on, open, and mark; a
  failed marking warns and leaves the row unmarked; a paused fact row carries the paused advisory.
- `[ ]` `--project --json` keeps today's shape with each new warning coded; `--user`'s warnings stay strings; and
  `arc status <slug> --json` from the flip carries `derivedPosition` and `scopeWindow`, a paused work unit's window null.
- `[ ]` `--project`, `--user`, and `--conflicts` render locally by default and under `--local` or `--no-fetch`, and
  `--fetch` pulls first through the session context's port, each result rendering as § 2.4's table states, with the
  `incomplete` and notice cases verified by whichever of this change and the ref backend's binding lands second.
- `[ ]` From the flip `arc status --user` renders both slices from the store, prints its warnings to stderr in text
  mode, writes no `STATUS.USER.md`, and with no identity prints the identity message and exits 0.
- `[ ]` `--project --staged`, with and without `--write`, refuses from the flip naming `arc status --project`.
- `[ ]` `arc status --conflicts` refuses before the flip naming `git status`, and from the flip lists and shows every
  conflict shape by token, omits a record that does not decode with its warning, and refuses an unknown token and any
  combined mode.
- `[ ]` From the flip `arc view` opens a claim's work unit, refuses with a remedy where none resolves, resolves `--for`
  through the store, opens completed and unprojected work units, opens session notes as the meta with no identity, and
  warns of a conflicted record's conflicts.
- `[ ]` No `store-raw-state`, `surface-names`, or `work-unit-paths` count in `eslint-suppressions.json` exceeds its
  count at the final merged base.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
- `[ ]` Personal and claims conflict-token queries retain the resolved person's owner, never the token's person;
  another person's token is unknown only after a complete read, and either family's token request with no identity
  refuses naming how to set one, while other families still show each holder of a reused name (spec A1).
- `[ ]` Conflict listings preserve refused, `unreadable`, `absent`, and complete outcomes in list and token modes:
  failures refuse with their condition and remedy, complete listings warn for diagnostics and `missed` beside good
  records, and no token match after omissions or a decode failure refuses as incomplete with its repair route, never
  as unknown; text and `--json` retain those warnings (spec A2).
