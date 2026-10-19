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

### `[ ]` **1.1 Resolve one identity in status, its Errand context, and the review gate's local host — § 8.1**

- _Goal:_ With `arc.identity` unset, every `arc status` mode, `arc base drift`, `arc recover audit`, the in-repo ROADMAP
  renders that read the Errand context, and the review gate's local host resolve the slugified `user.name`, and every
  message that named `arc.identity` as required names the unresolved identity and how to set one.

- **Additional Context:** `notes-seam-status-roadmap.md` § Phase 1 — the identity, purpose, and kind-list fixes

    - `[ ]` **1.1.a Resolve the three readers through `resolveIdentity`**

        - `readIdentityPointers` (`handlers/identity-pointers.ts`) and `resolveProjectErrandOracleContext`
          (`lib/status/project-oracle-context.ts`) call `resolveIdentity({ exec })` (`lib/git/identity.ts`) with no
          prompt, each keeping its catch; `readLocalReviewLiveContext` (`scripts/review-gate/hosts/local/live-context.ts`)
          resolves through an `exec` bound to `input.cwd`, as the one it builds for its claims read, so the read stays
          pinned to the repository root.
        - Update the mocks that stop matching: `unit/handlers/recover-envelope-boundary.test.ts`,
          `unit/handlers/start.test.ts`, and `unit/scripts/review-gate/hosts/local/live-context.test.ts`.
        - Build `test-first` (one behavior at a time):
            - `readIdentityPointers` returns `arc.identity` when set, the slugified `user.name` when it is unset, and
              null when both are unset; an invalid `arc.identity` still refuses `identity.invalid`
            - `renderRoadmapFromIndexViewResult` with `arc.identity` unset classifies the fallback identity's Errand
              claims, as `arc status --project` does
            - the review gate's local host resolves the fallback identity at the repository root, and an incomplete
              claims read for it throws where a null identity read nothing

    - `[ ]` **1.1.b Name the unresolved identity in the messages and the label**

        - `runStatusUserView` (`lib/status/user-view.ts`), `handleRecoverAudit` (`handlers/recover.ts`), and
          `SessionIdentityMissingError` (`commands/status/result-composition.ts`) say no identity resolved from
          `arc.identity` or Git `user.name`, naming `git config arc.identity <name>`; the JSDoc in
          `commands/status/types.ts` and `commands/status/run.ts` follows.
        - `renderIdentity` (`commands/status/format.ts`) labels the line `identity:`, set or not;
          `unit/status-format.test.ts` follows.
        - Edit the identity-missing short-circuit's table cell in the package source's
          `strategy-session-operations.md`, re-padding the table, then sync it to the project copy.

    - `[ ]` **1.1.c Keep session-init's identity-absent arm for both values unset**

        - `helpers/session-envelope-compat.ts` unsets `user.name` beside `arc.identity`; regenerate
          `fixtures/session-envelope/session-init-identity-missing.json` with `UPDATE_SESSION_ENVELOPE_GOLDENS=1` and
          update `e2e/session-envelope-compat.e2e.test.ts`.
        - Add an end-to-end case: with `arc.identity` unset and `user.name` set, `arc status --session-init --json`
          carries the fallback identity and fires no identity-absent arm.

### `[ ]` **1.2 Read a design's parsed purpose through one selection and one extractor — § 8.2**

- _Goal:_ `readLifecycleDesign` and the slug query's arm from the flip read the design record's parsed purpose through
  one exported selection and one first-sentence extractor, so the slug query and the project view report the same
  purpose while every in-repo caller returns what it returns today.

    - `[ ]` **1.2.a Export the design selection over a meta shape**

        - Extract `readLifecycleDesign`'s choice (`lib/store/lifecycle-design.ts`) into a pure exported function over a
          meta (`Pick<StoreRecord, "reference" | "fields">`, which a `LifecycleEntry` satisfies) and its candidate
          records: for each name the meta's `Design` field lists, in order, the spec, draft, or companion whose artifact
          file name is that name, the first such with a parsed purpose (`fields.purpose !== null`, narrowed through
          `ParsedDesignRecordSchema`), else the first found. `readLifecycleDesign` calls it after its own listing and
          returns the record it selects beside its content and warnings; `unit/lib/store/lifecycle-record-path.test.ts`
          follows.
        - A candidate's file name is `workUnitArtifactName(slug, kind)` (`lib/store/lifecycle-write.ts`) for a spec or
          draft and `companionArtifactName(slug, key)` (`lib/store/companion-name.ts`) for a companion with a name key,
          from the meta's slug; a companion without a name key matches no name, as today. The function calls no path
          function, so it stays synchronous whatever their signatures become.
        - Build `test-first` (one behavior at a time):
            - the first listed `Design` name with a purpose wins over a later one, and the first found is the fallback
            - a record whose parsed purpose is `""` or `"—"` still counts as having one, as today
            - a companion design is matched by its file name, either half of a paired spec among them
            - a `LifecycleEntry` serves as the meta
            - `readLifecycleDesign` returns the record it selects, and none where no design is found

    - `[ ]` **1.2.b One first-sentence extractor, read from the parsed field**

        - Make `extractWorkUnitPurpose`'s first-sentence step (`lib/status/work-unit-purpose.ts`) a function over a
          purpose string, which `extractWorkUnitPurpose` keeps calling, so `selectWorkUnitDesign` and
          `readWorkUnitPurpose` return what they return today.
        - `handleStoreLifecycleStatus` (`handlers/status/lifecycle.ts`) reads the `fields.purpose` of the record
          `readLifecycleDesign` returns through it rather than re-parsing content.
        - Build `test-first` (one behavior at a time):
            - over the reference backend, the slug query's arm reports the first sentence of a companion-designed work
              unit's parsed purpose
            - the in-repo extractor's existing cases pass unchanged

### `[ ]` **1.3 Hold the layout's work-unit kind list to the registry — § 8.3**

- _Goal:_ Renaming or removing a `WorkUnitArtifactKindSchema` name, or the `work-item/*` kind it maps to, fails a test.

    - A conformance test under `__tests__/unit/layout/` holds one table typed `Record<WorkUnitArtifactKind, KindId>`
      (`tasks` to `work-item/task-list` among it): each `WorkUnitArtifactKindSchema` option has an entry, each mapped kind
      is registered, and its registry descriptor's layout artifact (`KIND_MECHANISMS`, `lib/store/registry.ts`) names
      the same artifact, modelled on the typed `it.each` in `__tests__/unit/lib/store/registry.test.ts`.
    - `lib/layout` gains no import; the test imports both modules, as that test does.

### `[ ]` **1.4 Before the flip — the three fixes** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base, with `arc check segment` green.

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

### `[ ]` **2.1 Pin today's in-repo renders byte for byte — § 1.4**

- _Goal:_ A test fails on any byte change to the in-repo project view and its `--json` facts, the staged and ROADMAP
  renders, decomposition's render, or the user view, over fixtures that reach every tier and warning.

- _Note:_ Land this task's commit before any other Phase 2 edit. Its fixtures set `arc.identity`, so no render reaches
  the identity fallback Phase 1 changes, and its literals equal the merged base's output.

- **Additional Context:** `notes-seam-status-roadmap.md` § Phase 2 — the pure modules

    - `[ ]` **2.1.a Share the status fixture builders**

        - Move the builders the byte-identity test needs from `project-view.test.ts` and `user-view.test.ts` into a helper
          under `__tests__/helpers/`, leaving both tests' assertions unchanged.

    - `[ ]` **2.1.b Capture the renders as literals**

        - A new `__tests__/unit/status/in-repo-render-identity.test.ts` compares exact strings and objects, captured
          before any other Phase 2 edit, for: `composeProjectReadinessViewResult` over records reaching In Flight,
          Ready, Blocked at depths 1 and 2, Parked (a parked pointer and a planned meta whose `State` is Active), and
          the `dangling-dependency`, `stale-location-unshipped`, and `oracle-degraded` warnings, with its `--json`
          facts; `renderRoadmapFromIndexViewResult` and `renderRoadmapFromIndexResult` over an index exec;
          `renderTrackedProjectReadinessViewResult`; decomposition's render (`renderGitV3RepositoryTreeRoadmap`); and
          `runStatusUserView` over a stub exec.

### `[ ]` **2.2 Export the tier classification, and carry a record's source, Class, and pause — § 2.1, § 3**

- _Goal:_ One exported pure function sorts readiness records into In Flight, Ready, Blocked, Paused, and Parked, which
  the composer calls, and a record can carry a store source, its Class, and its pause, none of which the in-repo
  acquisition sets.

    - `ProjectReadinessSourceKind` gains a store value; `ProjectReadinessRecordCandidate` gains optional `class`
      (`WorkClass` or `[TBD]`) and `pause` (`MetaPause`).
    - The exported classification (`lib/status/project-view.ts`) takes what the composer's tiers read, the records and
      the readiness provider, so an input a later task adds reaches `--project` and `--user` alike. It returns each
      tier's records, not rows, a Blocked record with its unsatisfied edges, so `--user` builds its own rows with Class
      (Task 5.2); the composer renders from it, and `ProjectReadinessViewResult` keeps its shape.
    - Build `test-first` (one behavior at a time):
        - each tier takes the records today's inline filters give it, over Task 2.1's fixtures
        - a paused record, Planning or Active, at any placement, lands in Paused and in no other tier, Parked included
        - a planned record whose `State` is Active and has no pause still lands in Parked

### `[ ]` **2.3 Classify unlisted edges through supplied resolutions — § 2.2**

- _Goal:_ Given a resolution for an edge naming no listed record, the composer's classification, its default readiness,
  and its depth banding all read it, so an edge's satisfaction and its row's readiness agree, and a Blocked row bands
  below the work unit its edge resolves to while showing the edge as written.

- _Shape:_ An optional input keyed by dependent and written edge. Each resolution is a standing record's slug, which the
  edge classifies and bands against; a verdict for a listed record outside the composer's records, such as the completed
  holder of a reused slug reached through its former slug, satisfied once that record has shipped and banded against
  nothing, so the edge never classifies against the slug's standing holder; or an unsatisfied edge carrying the warning
  that replaces "missing work unit", or none where its name fails closed or its match is a withheld meta, whose listing
  diagnostic reports it (§ 2.1). Tasks 3.1 and 3.3 produce it.

    - With no readiness provider, the composer derives its verdicts from its own classification;
      `depsOnlyReadinessProvider` stays exported for callers that pass it.
    - `blockedDepths` bands by each edge's resolved target; rows and fact rows keep the written edge.
    - Build `test-first` (one behavior at a time):
        - an edge resolved to a shipped listed work unit is satisfied, with no dangling warning
        - an edge resolved to an unshipped listed work unit is unsatisfied, its row banded below that work unit and
          showing the written slug in its row and fact row
        - a satisfied verdict satisfies its edge while another record of that slug is unshipped, and bands nothing
        - an unsatisfied resolution's warning replaces the dangling warning; a fail-closed one adds none
        - the default readiness agrees with the classification when resolutions are given, and an explicit provider is
          still used when passed
        - with no resolutions the output matches Task 2.1's literals

### `[ ]` **2.4 Render the Paused tier, its marks, and the paused horizon advisory — § 2.3**

- _Goal:_ The composer renders a Paused tier, printed only when it has rows, in the In Flight tier's columns plus the
  pause's reason, what it waits on, whether it is open to takers, and the mark it is given, and the horizon advisory's
  paused arm takes precedence over every other arm.

    - `StatusViewRow` and `StatusColumn` (`lib/status/render.ts`) gain the four pause cells, each with its header and
      `cellOf` case; free-text cells escape `|` and fold newlines, and an empty cell renders the em dash.
    - The composer takes an optional map of marks by slug (`resumable`, `review-due`), the shape
      `markPausedWorkItem` returns, and computes none itself.
    - `projectHorizonAdvisory` (`lib/status/project-horizon.ts`) reads the record's pause, its paused arm first:
      "`<slug>` is paused (P<n>); an entry routed here waits for its resumption. Resume it or send a separable part now?"
    - Build `test-first` (one behavior at a time):
        - a paused record's row carries its reason, a work unit or a note or nothing for what it waits on, its open
          flag, and its mark, or the em dash with none
        - a reason holding `|` or a newline renders inside its cell
        - the Paused tier prints only with rows, and a paused fact row keeps its derived lifecycle state and carries the
          paused advisory

### `[ ]` **2.5 Make the render stamp optional, and add the warning codes — § 2.1**

- _Goal:_ With no `renderedRef` the composer's header carries no stamp lines, and `ProjectReadinessWarningCode` admits
  `listing-diagnostic`, `store-read-failed`, `dependency-retired`, `pull-incomplete`, `pull-notice`, and `slug-clash`.

    - With no stamp, drop the stamp's blockquote and the blank line after it, so the title is followed by the view's
      description.
    - Build `test-first` (one behavior at a time):
        - a render with no `renderedRef` has no stamp lines and no doubled blank line
        - a render with one matches Task 2.1's literals

### `[ ]` **2.6 Give the in-flight builder a paused arm and a branchless entry — § 3**

- _Goal:_ `buildInFlightMineSlice` accepts the store's in-flight entries, rendering `Paused` where an entry's scheduling
  is `paused` and an entry with no branch, and still drops Errands.

    - Widen its parameter to `InFlightEntry | StoreInFlightEntry` (`lib/status/in-flight-mine.ts`), as
      `lib/session-init/errand-state.ts` does.
    - Build `test-first` (one behavior at a time):
        - a paused store entry renders `Paused`; a parked in-repo entry still renders `Parked`
        - an entry with no branch renders its row
        - a store Errand is dropped

### `[ ]` **2.7 Close a paused work unit's scope window — § 4**

- _Goal:_ Given a pause, `projectScopeWindow` returns a null window on the `lifecycle` basis with the reason that a
  routed concern waits for its resumption, whatever the work unit's checkout or state.

    - A third, optional parameter (`lib/status/slug-position.ts`), checked before the checkout window; the in-repo arm
      never passes it.
    - Build `test-first` (one behavior at a time):
        - a paused work unit with a resolvable checkout position gets the null `lifecycle` window
        - a paused Planning or Active work unit with no position gets the same
        - the existing cases, which pass no pause, are unchanged

### `[ ]` **2.8 Carry a listed record's former slugs on its lifecycle entry — § 2.1**

- _Goal:_ A `LifecycleEntry` carries its primary record's former slugs as `aliases`, present only where the record has
  at least one, as it carries `links`.

    - `lifecycleEntry` (`lib/store/lifecycle-index.ts`) copies a non-empty `aliases` from the `StoreRecord` and drops an
      empty one, which the reference backend sets on every primary record.
    - Build `test-first` (one behavior at a time):
        - over the reference backend, a renamed work unit's entry carries its former slug
        - an entry whose record has no former slug, its list empty or absent, carries no `aliases`

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

### `[ ]` **3.1 Select the entry standing for each slug, reporting each clash — § 2.1**

- _Goal:_ From lifecycle's entries and its listing's diagnostics, one pure function returns the entry standing for each
  slug, the names that fail closed, and a `slug-clash` warning for each clash, so the composer gets one record per slug
  ranked as the store's slug lookup ranks holders.

- **Additional Context:** `notes-seam-status-roadmap.md` § Phases 3 and 4 — the project view's acquisition, freshness,
  and the slug query

    - Rules: a live entry named by the slug stands, completed ones named by it left out; else, where a live entry holds
      it as a former slug, none stands; else the one completed entry named by it, and of several the latest archived by
      quarter, then sequence compared as a number. Several live entries named by one slug clash and none stands.
    - A name a listing diagnostic keys `work-item/meta:<name>` fails closed, whatever the diagnostic's kind: no entry
      stands for it and the entries named by it are left out. Lifecycle's view keys a conflicted or malformed meta so,
      and the reference backend a meta its parser rejects. A diagnostic under any other key names no work unit, so it
      fails no name closed; Task 3.5 warns that the view omits its record.
    - The `slug-clash` warning names the slug and each holder's UID, owner, and location, states that the view omits
      them, and states that renaming one holder repairs it, naming no command.
    - Build `test-first` (one behavior at a time):
        - a live holder stands over a completed holder of a reused slug
        - a slug a live work unit holds as a former name has no standing entry
        - one completed holder stands; of two, the later quarter, then the higher sequence, `100` above `99`
        - two live holders clash, neither stands, and the warning names both, over a store double
        - a withheld meta's name has no standing entry, and a completed holder of that name is left out
        - a backend's parser-rejected meta keyed `work-item/meta:<name>` fails its name closed, and a diagnostic under
          `recordKey` leaves every name's standing entry as it was

### `[ ]` **3.2 Map standing entries to readiness records, purposes from one listing per design kind — § 2.1**

- _Goal:_ Each standing entry becomes a readiness record carrying its slug, location, state, owner, validated priority,
  `dependsOn`, cohort, the store source, Class, pause, and its own work unit's design purpose, with each design kind
  listed once per render.

    - List `work-item/spec`, `work-item/draft`, and `work-item/companion` once each with no owner, group by the owner's
      identity through `identityKey` (`lib/store/lifecycle-index.ts`), exported for it, the UID where present, as
      lifecycle's view keys entries, and select each work unit's design through Task 1.2's selection and extractor.
    - An `absent` design listing adds nothing; a refused or `unreadable` one empties every purpose and adds a
      `store-read-failed` warning with its condition and remedy; a complete one's diagnostics add `listing-diagnostic`
      warnings.
    - Build `test-first` (one behavior at a time):
        - a standing entry maps every field, priority validated as `validatePriority` does
        - a reused slug's purpose comes from its own work unit's design, not the completed holder's
        - an `unreadable` design listing renders every purpose empty with one warning, over a `Store` wrapper
        - three design listings are made per render, however many work units

### `[ ]` **3.3 Resolve an unlisted edge by slug, then by lineage origin — § 2.2**

- _Goal:_ Every edge naming no standing entry resolves to a listed work unit, a retired origin with the disposition the
  dependent's own reconcile reads, an unsatisfied fail-closed edge, a store-read failure, or today's dangling edge,
  delivered as Task 2.3's resolutions.

- **Additional Context:** `notes-seam-status-roadmap.md` § Phases 3 and 4 — the project view's acquisition, freshness,
  and the slug query

    - `[ ]` **3.3.a Share the reconcile's retired-origin query**

        - Extract `queryDisposition`'s `not-found` branch (`createStoreReconcilePrepareContext`,
          `lib/work-unit/store-reconcile-context.ts`) into an exported function over `storeLineageEnumeration`'s result,
          also exported: the terminal-alias selection, then `queryStoreDisposition`, taking the dependent's owner rather
          than its primary record, since `readDependentMatch` reads only the owner. `queryDisposition` keeps calling it.
        - Build `test-first` (one behavior at a time):
            - `unit/work-unit/store-reconcile-context.test.ts` and
              `unit/work-unit/side-effects/discharge-dep-edges.test.ts` pass unchanged
            - the extracted query gives a cut's disposition for a dependent matched by UID after its rename

    - `[ ]` **3.3.b Resolve each unlisted edge**

        - Order: an edge that is not a valid slug (`SlugSchema`) takes no lookup and reads as dangling; a fail-closed
          name (Task 3.1) resolves unsatisfied with no warning; then `store.lookup({ kind: "slug" })`: a standing
          record's match gives its slug, another listed record's a verdict from its own `phase` and `location`, a
          withheld meta's an unsatisfied edge with no warning, and an Errand's record (`work-item/record`) reads as
          dangling; then, on `not-found`, Task 3.3.a's query over one lineage enumeration per render, made only when an
          edge reaches it.
        - A cut's `replace` or `drop`, `abandoned`, and `unmapped-dependent` give `dependency-retired`, naming the
          retirement and the disposition, and `arc wu reconcile --apply` from the dependent's checkout, or its
          activation, or, for an unmapped dependent, editing its `Depends On`. A rename's `retarget` resolves again as an
          edge naming its successor, tracking the names passed. `absent` reads as dangling.
        - Each of these adds `store-read-failed` naming its condition and remedy:
            - a lookup or history read refusing with any code but `not-found`, `ambiguous-match` for a clashed slug
              among them
            - the query's `ambiguous` or `namespace-corrupt`
            - a rename chain returning to a name it passed
        - Build `test-first` (one behavior at a time):
            - an edge naming a renamed work unit's former slug classifies against that work unit
            - a multi-hop lineage rename resolves to its standing work unit, with an unsatisfied edge classified and
              banded below that work unit and its written name preserved in the row and facts
            - a lineage rename chain ending at an absent name warns as dangling
            - a lineage rename cycle terminates with an unsatisfied edge and `store-read-failed`, carrying its
              condition and remedy through the composed project result
            - an edge reaching a completed holder of a reused slug through its former slug is satisfied
            - an edge naming a decomposed origin warns with the dependent's replacements, and an unmapped dependent's warns
              naming the `Depends On` edit
            - an edge naming an abandoned origin warns naming the abandonment; a stub depending on it reads Blocked
            - an edge naming a retired origin's former slug resolves as the origin
            - an edge naming an Errand's slug, or no slug at all, warns as dangling
            - a lookup refusing other than `not-found` warns with its condition, and an incomplete lineage listing warns
              for every edge reaching it; an edge naming nothing warns as today
            - an edge naming a clashed slug stays unsatisfied with `store-read-failed` from the lookup's
              `ambiguous-match`, over a store double

### `[ ]` **3.4 Mark each paused row through the marking function — § 2.3**

- _Goal:_ Each paused standing record gets the marks `markPausedWorkItem` returns under `pause.review_after_days`, and a
  marking that fails leaves its row unmarked with a `store-read-failed` warning carrying the failure's text.

    - The acquisition takes the setting as a number. The handler dispatching it reads `pause.review_after_days`
      through `handlers/status/store-session.ts`'s parser (`positive`), exported for it rather than copied, so
      `lib/status/` imports no handler. Pass `MetaPauseSchema.parse(entry.fields.pause)`.
    - Build `test-first` (one behavior at a time):
        - a pause waiting on a shipped work unit is `resumable`; one waiting on an abandoned one is `review-due`
        - a pause waiting on nothing is `review-due` past the setting's age from `since`
        - a marking that throws leaves the row unmarked and warns

### `[ ]` **3.5 Acquire the project view from the store, with its completeness — § 2.1**

- _Goal:_ One acquisition reads lifecycle's view once and returns the composer's input, its records, edge resolutions,
  marks, and source warnings, or the listing's refusal, so an unreadable store never renders as an empty view.

    - A refused read and an `unreadable` listing return their refusal; an `absent` listing returns no records; a complete
      listing's diagnostics become `listing-diagnostic` warnings carrying their condition and remedy and, where the
      listing missed a record, stating that the view omits it. It never passes `indeterminate` or a `renderedRef`.
    - Composes Tasks 3.1 to 3.4.
    - Build `test-first` (one behavior at a time):
        - an `unreadable` listing returns its refusal; an `absent` one returns empty input
        - a malformed meta and a conflicted meta each become an omitted `listing-diagnostic` warning
        - In Flight holds placement `active` work units with no pause

### `[ ]` **3.6 Dispatch `--project` on the context's store, refusing the staged write from the flip — § 7, § 2.5**

- _Goal:_ `handleProjectStatus` branches on `usesOffBranchState` over the session context's store: from the flip it
  renders Task 3.5's acquisition through the composer and writes no file; before the flip it runs today's code; and
  `--project --staged`, with or without `--write`, refuses `unsupported` from the flip naming `arc status --project`.

    - Build the shared status refusal renderer (`handlers/status/`) this task's, Task 5.3's, Task 6.1's, and Task 6.3's
      refusals use. Its refusal is status's own `{ code, condition, remedy }`: a store refusal passes its code,
      condition, and remedy through; an `unreadable` listing, which carries no code, takes `listing-unreadable` with its
      condition and remedy; and a mode refusing takes `unsupported`, since no `UNSUPPORTED_CASES` case
      (`lib/store/refusal.ts`) describes a view mode. Its `--json` shape is the one the slug query's store arm prints
      (`renderStoreQueryRefusal`).
    - Text mode prints each warning to stderr as today; `--json` writes `{ markdown, warnings, facts }`.
    - Build `test-first` (one behavior at a time):
        - with a reference-backend store injected through `createSessionStatusContext`, `--project` renders the tiers
          and writes nothing
        - `--project` over an `unreadable` listing refuses with its remedy, exit 1, in text and `--json`
        - `--project --staged` and `--project --staged --write` refuse from the flip; before the flip they run as today

### `[ ]` **3.7 The project view from the flip** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds, with `arc check segment` green.

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

### `[ ]` **4.1 Render every pull result and notice through `pullStoreStatus` — § 2.4**

- _Goal:_ `pullStoreStatus` (`handlers/status/store-locus.ts`) returns, for each pull result, the coded warning § 2.4's
  table names, built from `describeStorePull`'s orientation, so every status mode under `--fetch` renders one result the
  same way.

    - `[ ]` **4.1.a Render the results the port gives today**

        - Warnings carry a code (`pull-incomplete`, `pull-notice`) and text: the orientation's summary, its remedy's text
          where the summary omits it, and its command's `argv` where the result carries one. `--project` keeps the code;
          the other modes render the text.
        - `describeStorePull`'s `no-identity` summary (`lib/session-init/store-user-pull.ts`) names
          `git config arc.identity <name>`, which session start's `user` slot then shows from the flip.
        - `unit/handlers/status/store-locus.test.ts`'s expected `unreachable` warning follows.
        - Build `test-first` (one behavior at a time):
            - `pulled`, `noop`, and `no-remote` add no warning
            - `no-identity`, `unreachable`, and `designation-needed` each add `pull-incomplete` with their remedy and
              command
            - session start's `user` slot shows the `no-identity` summary naming the command

    - `[ ]` **4.1.b Render `incomplete` and each notice, where the ref backend's binding has landed**

        - Applies only where `PullResultSchema` (`lib/store/operational-sync.ts`) already carries `incomplete` and
          notices; otherwise the binding's change completes `pullStoreStatus` for them.
        - The condition is read again on the freshly merged base of Task 4.5 and of the verification before
          integration: where the binding has landed since, this subtask runs then.
        - `incomplete` adds `pull-incomplete` with its condition and remedy. Each notice, a successful outcome's or one
          inside an `incomplete` result's partial outcomes, adds `pull-notice` with its condition and remedy.
        - A notice that an item ended with open conflicts also names the item and each conflict record it lists, and
          states that the conflict view does not list them; it names no `arc status --conflicts`.
        - Build `test-first` (one behavior at a time):
            - an `incomplete` result adds `pull-incomplete` with its condition and remedy
            - a `pulled` result's notice and an `incomplete` result's partial outcome's notice each add `pull-notice`
            - an ended item's notice names the item, its records, and the conflict view's omission

### `[ ]` **4.2 Pull before the project view under `--fetch`, keeping today's flag precedence — § 2.4**

- _Goal:_ From the flip `--project` pulls through the session context's port, or the port's default where the context
  carries none, only under `--fetch` and before listing, with `--local` winning over `--fetch` and the later of `--fetch`
  and `--no-fetch` winning.

    - Build `test-first` (one behavior at a time):
        - the default render calls no pull; `--fetch` pulls once before the listing
        - `--local --fetch` and `--fetch --local` call no pull; `--fetch --no-fetch` calls none and `--no-fetch --fetch`
          pulls
        - an unbound port renders locally with no warning

### `[ ]` **4.3 Build the status context before a slug query dispatches — § 7**

- _Goal:_ `handleStatus` (`handlers/status.ts`) builds the session context before it dispatches a slug and hands the
  slug query's arm the context's store and port, so no handler builds a second store and the in-repo arm's output is
  unchanged.

    - `handleLifecycleStatus` (`handlers/status/lifecycle.ts`) takes the session context in place of `cwd`, `exec`, and
      its optional store: the store arm reads `store` and `storeSync` from it, and the in-repo arm only `cwd` and `exec`;
      `findHoldingCheckout` and `readInFlightWarnings` stay its test ports.
    - The store-arm tests (`unit/handlers/status/store-locus.test.ts`, `unit/work-unit/store-read-consumers.test.ts`)
      build their context through `createSessionStatusContext`'s `operational` input.
    - Build `test-first` (one behavior at a time):
        - a slug query with an injected store reads that store and pulls through that port
        - the in-repo slug query's output is unchanged

### `[ ]` **4.4 Read the slug query's state, derived position, and scope window from the store — § 4**

- _Goal:_ From the flip `arc status <slug>` reports the state the standing entries give, its derived position and scope
  window read as the in-repo arm reads them, and a paused work unit's null window, with the roster read through the
  derived locus probe given the arm's store and the context's identity.

    - Build the state read's index from Task 3.1's standing entries through the builder `readLifecycleView` uses
      (`buildLifecycleIndexFromRecords` over its entries), extracted and exported from `lib/store/lifecycle-view.ts`:
      that function's module is a raw state helper, which only `lib/store/` imports without raising a
      `store-raw-state` count, and the arm already holds its one. The builder takes `lifecycleArtifactPath`'s signature
      as it stands when this lands, awaiting it where the projection's change has made it asynchronous.
    - `readDerivedSlugPosition` and `projectScopeWindow` (`lib/status/slug-position.ts`) take the arm's checkout path
      field only to decide whether to read the roster, and the record's pause; a failed roster read's warning joins the
      arm's warnings. The pull uses Task 4.1's text.
    - A new production or test file importing `DerivedCheckoutRow` or `DerivedLocusFrame` joins
      `integration/locus-dormant-foundation-contract.test.ts`'s inventory.
    - Build `test-first` (one behavior at a time):
        - a reused slug reports its live holder's state
        - `--json` carries `derivedPosition` and `scopeWindow` over a roster double, and text prints their lines
        - the production roster read hands `runDerivedLocusStateProbe` the arm's store and identity
        - a paused work unit's window is null on the `lifecycle` basis

### `[ ]` **4.5 Freshness and the slug query** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base, where Task 4.1.b's condition is read again, with
  `arc check segment` green.

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

### `[ ]` **5.1 Build the in-flight slice from the in-flight set — § 3**

- _Goal:_ The user view's in-flight slice comes from `deriveStoreInFlight` over the context's store, identity, and team
  mode, through Task 2.6's builder, with the set's warnings in their own text and, for a set marked degraded, a warning
  that the slice may be incomplete naming `arc status --user`.

    - The arm bypasses `runStatusUserView`'s cache and reachability branch, since the set reads local refs only.
    - It reads the set through an optional port defaulting to `deriveStoreInFlight`, which its tests replace with a
      double carrying entries, warnings, and the degraded mark.
    - Build `test-first` (one behavior at a time):
        - a branchless and a paused work unit render among the rows
        - in team mode the identity's own and unowned entries render, and Errands are dropped
        - a degraded set adds the warning naming `arc status --user`

### `[ ]` **5.2 Build the ready slice from the exported tier classification — § 3**

- _Goal:_ The user view's ready slice is Task 2.2's Ready tier over Task 3.5's acquisition, the identity's own or unowned
  rows, rendered in today's columns with Class.

    - Export `isMine` (`lib/status/ready-mine.ts`); build rows with Class from the records.
    - Build `test-first` (one behavior at a time):
        - a Planning work unit at a planned placement with satisfied dependencies renders with its Class
        - a planned meta whose `State` is Active and a paused one render no ready row
        - an edge resolved as § 2.2 states counts as satisfied; a clash's holders are omitted with `slug-clash`

### `[ ]` **5.3 Dispatch `--user` on the context's store, writing no file — § 3, § 7**

- _Goal:_ `handleUserStatus` branches on `usesOffBranchState` over the context's store: from the flip it pulls once under
  `--fetch`, renders both slices, prints each warning to stderr in text mode, writes no `STATUS.USER.md`, and refuses a
  refused or `unreadable` listing through the shared renderer; before the flip it runs today's code.

    - Both arms render through `composeUserView` (`lib/status/user-view.ts`), exported for it, so they print one body;
      the arm's `--json` result carries `source: "rendered"`.
    - With no identity it prints the identity message and exits 0, its `--json` result carrying `source: "no-identity"`.
    - Build `test-first` (one behavior at a time):
        - the arm writes no file and its `--json` result has today's shape
        - each warning prints to stderr in text mode from the flip, and today's arm prints none
        - an `unreadable` listing refuses with its remedy
        - `--fetch` pulls once before both slices

### `[ ]` **5.4 The user view from the flip** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds, with `arc check segment` green.

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

### `[ ]` **6.1 Register `--conflicts` as an exclusive status mode, refusing before the flip — § 5**

- _Goal:_ `--conflicts [conflict]` is a status mode held exclusive everywhere the modes are, its help listed among them,
  and before the flip it refuses `unsupported` naming `git status`.

    - `cli.ts`: the option, taking an optional token, with a conflict list of attribute names, and `conflicts` added to
      each other mode's list. `StatusCommandInputSchema` and its refinement message, `statusCommandInputRegistration`,
      `modeCount` and its message (`handlers/status.ts`), and the `status` help notes and option groups
      (`lib/cli-help-content.ts`) name it.
    - `handleStatus` dispatches it after building the session context, its handler branching on `usesOffBranchState`
      over the context's store.
    - Tests pinning the message and help follow: `e2e/session-init.e2e.test.ts`, `e2e/run-cli.e2e.test.ts`,
      `e2e/cli-help-examples.e2e.test.ts`, and `unit/command-input/repository-inventory.test.ts`.
    - Build `test-first` (one behavior at a time):
        - `--conflicts` with a slug, `--user`, `--project`, `--session-init`, `--session-handoff`, or `--recover` refuses
          through the schema and the mode count
        - before the flip `--conflicts` refuses `unsupported` naming `git status`, in text and `--json`

### `[ ]` **6.2 List every open conflict of a listed item — § 5**

- _Goal:_ With no token, the view lists every open conflict across the ten families' conflict-record kinds, each by its
  token, the personal and claims families read for the resolved identity.

- **Additional Context:** `notes-seam-status-roadmap.md` § Phases 5 and 6 — the user view and the conflict view

    - A token module under `lib/status/` formats `<family>/<owner type>/<owner name>/<id>` and parses it, the ID being
      the remainder after three segments; Task 7.4 reuses it.
    - Each listing passes its kind, and no owner but the personal and claims families', which name the identity; with
      none they list `absent` and the view warns that those two were not read, naming `git config arc.identity <name>`.
    - A refused `store.list` or an `unreadable` listing refuses through the shared renderer with its condition and
      remedy. An `absent` listing is empty. A complete listing's diagnostics become warnings naming the family and
      each omitted record's key, condition, and remedy; `missed: true` without diagnostics warns that the family is
      incomplete, naming repair of its inventory and `arc status --conflicts` to retry. Good records remain visible.
    - Decode each record's content against `ConflictRecordSchema`; one that does not decode is omitted with a warning
      naming its token and `arc store conflict`.
    - Build `test-first` (one behavior at a time):
        - conflicts of each shape across a project, a work-item, and a personal family list with their tokens
        - with no identity, the personal and claims families are not read and the view warns
        - with two persons' records present, personal and claims listings receive the resolved person's owner and
          include only that person's conflicts
        - a refused or `unreadable` family listing refuses with its condition and remedy
        - an `absent` family listing adds no records or read-failure warning
        - a complete listing with diagnostics shows its good records and every omission's family, key, condition,
          and remedy; `missed` without diagnostics adds the family-incomplete warning
        - a record that does not decode is omitted with its warning
        - the token round-trips through format and parse, an ID holding `/` among them

### `[ ]` **6.3 Show the conflicts one token names — § 5**

- _Goal:_ With a token, the view retains the resolved person's scope for personal and claims, lists other families'
  conflict-record kinds without an owner, and shows each matching owner without treating an incomplete read as absence.

    - Personal and claims listings use the resolved person's owner, never the token's person; without an identity the
      token request refuses, naming `git config arc.identity <name>`. Other families list without an owner so a live
      and a completed holder of one name both remain visible. Match the token's owner type, owner name, and ID.
    - Apply Task 6.2's listing and decode handling to the requested family. A found match renders with its warnings;
      with no match after a diagnostic, `missed`, or a decode failure, refuse as an incomplete read with those warnings
      and the repair route. Only a read without omissions permits an unknown-token refusal, naming
      `arc status --conflicts`; another person's token then matches nothing in an identity-scoped family.
    - Build `test-first` (one behavior at a time):
        - a token names a completed and a live holder's conflicts under one name, and both show
        - personal and claims token queries list with the resolved person's owner, showing that person's token and
          refusing another person's as unknown after a complete read
        - a personal or claims token request without an identity refuses naming the identity command
        - a refused or `unreadable` listing refuses with its condition and remedy
        - an unknown token after a complete read or an `absent` listing refuses naming the listing
        - a match in a listing with diagnostics renders with the omission warnings
        - no match after diagnostics, `missed` without diagnostics, or a record's decode failure refuses as incomplete
          with the repair route, never as an unknown token

### `[ ]` **6.4 Render each conflict shape, and its `--json` result — § 5**

- _Goal:_ Each conflict shows its token, subject record, both sides' labels, and both sides' content in its shape, and
  `--json` writes `{ conflicts, warnings }`, under § 2.4's freshness.

    - A hunk shows its line range, base text, and each side's content; an entry its ID, base section, and each side's
      section and content; a whole record each side's value, or that the side removed it.
    - `--json` writes the matched records as the store lists them, each with its token, and the warnings as strings;
      `--fetch` pulls first through Task 4.1, and `--local` and `--no-fetch` render locally.
    - Build `test-first` (one behavior at a time):
        - each of the three shapes renders its fields and both labels
        - a whole-record side that removed the record says so
        - `--json` carries each record with its token
        - text and `--json` retain each listing diagnostic and the `missed` warning beside good records; failed token
          reads retain their condition and repair route

### `[ ]` **6.5 The conflict view** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds, with `arc check segment` green.

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

### `[ ]` **7.1 Resolve `--for` through the store, a completed work unit included — § 6.1**

- _Goal:_ From the flip `--for <slug>` reads the work unit through `readWorkUnit`, resolving a former slug and a reused
  slug's live holder, opening a completed work unit, and refusing an ambiguous slug with the lookup's condition and
  remedy and the route to a completed holder's projected file under `completed/`.

- **Additional Context:** `notes-seam-status-roadmap.md` § Phase 7 — `arc view`

    - The target carries its meta record's reference as a third `artifactSource` kind, `{ kind: "store", reference }`
      (`lib/view/types.ts`, importing `RecordReference` as a type), with the record's placement and location and its
      `metaPath` from `workItemArtifactPath`. Its paths root at the checkout, as `viewWorkUnitArtifactPath`
      (`lib/view/started-artifacts.ts`) roots every source but a ref or another checkout.
    - `not-found`, and a slug naming an Errand (`record-malformed`), refuse as an unknown target does today; the
      completed refusal stays the in-repo arm's.
    - Build `test-first` (one behavior at a time):
        - a former slug and a reused slug resolve to the live work unit
        - a completed work unit opens; two completed holders refuse naming the `completed/` route
        - a slug naming an Errand refuses as an unknown target

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
