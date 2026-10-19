# Task List: Seam Decomposition

- **Design:** `spec-seam-decomposition.md`

---

## **Phase 1:** The map's schema and kinds

_Purpose:_ Land the substrate every batch writes through, all inert before the flip: the locator move that frees the
scanner, the `cut-map` schema at version 4, the `work-item/cut-map` kind, and record kinds' two additions.

_Mode:_ `layer` — closes on the map's schema and the kind additions registered and settled, with nothing a cut does
changing.

_Exit criterion:_ Version 3's decode tests and the scanner's pass unchanged after the locator move; `arc schema get
cut-map` publishes version 4 beside `decompose-cut-map` version 3; `work-item/cut-map` passes the store's conformance
suite over the reference backend while the in-repo implementation lists it absent and refuses its writes
`unsupported`, and a rename leaves a stored map's bytes unchanged; the fan-out writer renders today's splice; and
`lineage.cut-in-flight` refuses `abandon` lineage for an origin whose stored map is in the batch's before-state.

_Design decisions:_ The schema lands before the kind, since the kind's parser decodes the map as § 3.4 does; review
still takes the kinds before the schema (§ 1.3), an order of review rather than of building. The schema's modules live
under `lib/decompose/`, and the kind folder imports its decoder from there, as the meta kind imports
`lib/active/meta-schema.ts`.

### `[x]` **1.1 Move the locator schema and source-ID function into the scanner — § 1.3**

- _Goal:_ The scanner carries into the store version with no import from version 3's schema module, while version 3
  keeps every name it exports and every test passes unchanged.

- _Outcome:_ The scanner owns `V3DecomposeLocatorSchema`, `HeadingIdentitySchema`, and `v3SourceId`, with local
  basename and managed-path checks. Version 3 imports and re-exports the public names; its consumers and tests keep
  their existing imports.

### `[x]` **1.2 Define the `cut-map` schema at version 4 — § 3, § 15**

- _Goal:_ `cut-map` version 4 decodes a map whose machine half binds an origin by records alone — UIDs, basenames, and
  digests, no Git pins — with version 3's authoring rules carried whole and a Purpose for each cohort document a cut
  creates, and `arc schema get cut-map` publishes it beside `decompose-cut-map` version 3.

    - `[x]` **1.2.a The machine half — § 3.2**

        - `cut-map-machine.ts` defines the strict record-bound envelope and exported identities: source locators alone,
          dependent UIDs, provider UIDs or unresolved slugs, and the complete machine facts for `preflightId`.

    - `[x]` **1.2.b The authoring half — § 3.3**

        - New authoring and root schemas carry the closed decisions and author slots independently of version 3.
          Cohort Purpose fields are optional structural values; starter construction and parsing preserve every
          machine identity and reject a corrupt machine envelope.

    - `[x]` **1.2.c Decoding — § 3.4**

        - `decodeCutMap` composes separate structural, machine, authoring, source, reference, and cardinality rule
          groups with the carried issue codes and paths. Version 3 receives `unsupported-version`; parsed JSON need
          not use canonical bytes. Shared version-4 factories supply scanner-derived maps and extraction fixtures.

    - `[x]` **1.2.d Publish the schema — § 15**

        - `registerCutMapSchemas` publishes the fresh `cut-map` root at version 4 as a strict-current request beside
          version 3. Production identity and authored-root inventories include it; strict Ajv projection and fresh-build
          CLI discovery cover both generations.

### `[x]` **1.3 Register the `work-item/cut-map` kind — § 4, § 17.1, § 17.2**

- _Goal:_ `work-item/cut-map` is a registered, never-projected, single-writer machine kind — one record per work item,
  holding the completed map as canonical JSON and parsed as § 3.4 decodes it, its bytes written by the verb alone —
  that the reference backend serves and the in-repo implementation lists absent and refuses `unsupported`, so no record
  of it can exist before the flip.

    - `[x]` **1.3.a The shape and the mechanism**

        - The catalog derives a work-item singleton reference for `work-item/cut-map`; its machine mechanism is
          single-writer, never projected, and unhomed in-repo. Automatic conformance and dispatch enrollment covers
          the kind; the registry's unhomed inventory includes it.

    - `[x]` **1.3.b The kind folder and its registration**

        - The cut-map kind exposes a pure completed-map decoder and canonical writer, with its semantic parser in
          the production registration set and registration imports behind the store boundary. Production-backed
          writes return parsed fields, refuse malformed maps with their issue path, and retain removed bytes in history.

    - `[x]` **1.3.c Keep the stored map out of rename's reference sweep — § 4**

        - Rename omits saved maps from both prose rewriting and shared paired-reference ambiguity checks. Owned
          maps are re-put under the new owner name with their exact bytes; foreign maps remain unchanged while normal
          draft references advance through the existing sweep.

### `[x]` **1.4 Add the cohort kind's at-cap fan-out writer — § 17.2**

- _Goal:_ The cohort kind appends to a subcohort's document a fan-out block naming the members a cut adds, in exactly
  the bytes and position today's splice renders, so typed coordination entries can later arrive through the kind.

- _Outcome:_ `writeCohortFanout` renders the existing splice's exact bytes, orders members by UTF-8 bytes, and returns
  append, exact-block reuse, or conflicting provenance. It is public through the cohort kind; the version-3 planner
  keeps its private renderer and splice unchanged.

### `[ ]` **1.5 Add `lineage.cut-in-flight` — § 10, § 17.2**

- _Goal:_ Creating `abandon` lineage for a work item whose `work-item/cut-map` record is in the batch's before-state
  refuses, naming `arc decompose <origin> --finish` and `--discard`, so no abandonment strands a cut's members.

- _Note:_ `lib/store/kinds/lineage/check.ts` serializes with `storage-ref-backend` (§ 1.3).

    - Its own function beside `checkRetiredBranches`, run by `checkLineageRecord` on the creation of `abandon` lineage
      (no `prior`) once the record parses, ahead of the return that skips the inbound rule while no grammar is
      declared; its violation is reported alongside any of `lineage.retired-branches`.
    - It reads the owner's singleton reference (`recordReferences["work-item/cut-map"](input.reference.owner)`) in
      `input.before` through `observeRecord` (`lib/store/kinds/rule-support.ts`), since the record's owner carries
      the generation `lineage.origin` may lack; a known record refuses, and an unavailable read refuses with its
      condition.
    - The lineage README's paragraph on `check.ts` gains the rule, and `ruleRecord`
      (`__tests__/helpers/store/rule-view.ts`) the kind.
    - Build `test-first` (one behavior at a time):
        - `abandon` lineage refuses with the map in `before`
        - `abandon` lineage passes with no map
        - `decompose` and `rename` lineage pass with the map in `before`, the terminal batch's case
        - the rule reads `before`, so a backend whose end sweep empties `after` sees the same
        - a read of the map refused other than as not-found refuses with its condition
        - an existing lineage record repaired in place is not rechecked
        - the check as the production registry registers it refuses

## **Phase 2:** Preflight and the additive batch

_Purpose:_ Read an origin through the store, emit its starter map, and store a completed map with its members and new
cohort documents in one additive batch — the first half of a cut, over records alone.

_Mode:_ `slice` through Phase 3 — closes on a retirement run end to end over the reference backend.

_Design decisions:_ Every batch is tested over `createLifecycleHarness`'s reference backend with the production kind
registry, so the kinds' write checks judge each batch, and a hand edit is a write under `write-back` provenance
(`HAND_EDIT_VERBS`). Each task builds its own rows of § 14; `notes-seam-decomposition.md` § Refusal coverage maps every
row to the tasks that build it.

### `[ ]` **2.1 Build the store version's context and refusals — § 13, § 14**

- _Goal:_ Every mode of the store version takes one context and returns one typed result or refusal whose remedy says
  whether it is terminal and names the command that repairs it — a typed action where running it as given repairs the
  condition, its text where the repair needs the operator's input.

    - `[ ]` **2.1.a The context**

        - The store; the operator's identity; the shipped cohort template, decoded from the bytes `handleDecompose`
          reads today, since `writeCohortDocument` takes a string (`lib/store/kinds/cohort/creation-writer.ts`); and
          the inbound grammar — `KIND_MECHANISMS["work-item/inbound"].entry`, undefined until `seam-locus` declares it,
          and a parameter tests supply.
        - The terminal batch's seams, as `runStoreAbandon` takes them from `AbandonContext` (`verbs/abandon.ts`): the
          lifecycle executor, whose store and Git executor every batch uses, the checkout removal, teardown's store
          context, and the base branch.
        - A mode taking a map takes its parsed JSON, which the handler reads once from the path (task 6.2), and the
          path itself, the operand its typed actions carry (`v3DecomposeExecuteArgv(origin, cutMapPath)`,
          `v3DecomposeExtractArgv`, `decompose-command-renderer.ts`).

    - `[ ]` **2.1.b The refusal vocabulary**

        - A result and refusal schema under `lib/decompose/`. A refusal carries its reason, its class — `recoverable`
          or `terminal` — an optional locus, and a remedy of text with an `argv` present exactly where running it as
          given repairs the condition, the shape the store's `RemedySchema` takes (`lib/store/refusal.ts`); today's
          spine remedy requires an `argv` (`SpineRemedySchema`, through `V3DecomposeCoreRefusalSchema`), which § 14's
          text remedies lack. A store refusal rides whole within it, its class and remedy lifted.
        - Its reasons are § 14's rows, carrying `decompose-v3-refusal.ts`'s domain conditions and none of its Git
          conditions.
        - Commands render through `renderV3DecomposeArgv` (`decompose-command-renderer.ts`), which stays unchanged; the
          argv builders for the forms from the flip — a bare `--finish`, `--finish --apply`, `--revise`, and
          `--discard` — live under `lib/decompose/`.
        - Every batch writes under `{verb: "decompose", lifecycleAction}`, its action `additive`, `terminal`,
          `discard`, or `revise`, so history tells a terminal batch's removal of the stored map from a discard's
          (§ 8.7).
        - Build `test-first` (one behavior at a time):
            - an action remedy carries its `argv` and a text remedy none, each validating
            - a store refusal passes through with its code, class, and remedy unchanged
            - each batch's provenance names `decompose` and its action

    - `[ ]` **2.1.c Test support**

        - Helpers beside `createLifecycleHarness` (`__tests__/helpers/store/`) seeding what the phases' tests need — a
          rename leaving a former slug, a retirement's lineage, a completed work unit and cohort, a cohort document,
          and a hand edit under `write-back` provenance — as `retirement-harness.ts` seeds a retirement.
        - A store wrapper that, just before forwarding a batch, applies a competing write, so the backend refuses the
          batch as it would a race (task 2.6). For a cross-type race — a work item taking a new cohort document's name,
          or a cohort document taking a member's slug — the reference backend admits both writes, keeping names per type
          (`ownerNameKey`, `__tests__/helpers/store/model.ts`), so the wrapper applies the competing write and then
          returns a given refusal in the batch's place, as the ref backend refuses it (D14).

### `[ ]` **2.2 Preflight an origin through the store — § 5, § 3.2**

- _Goal:_ Preflight derives an origin's machine half from the store alone — its primary, its whole artifact group, and
  the dependents the complete lifecycle listing names — reading nothing from Git, and refuses an origin no cut can
  start from, naming the repair.

- _Shape:_ Acquisition and derivation are separate exports. Acquisition reads the group, the listing, and the lookups
  once; derivation computes the machine half over records already acquired, with the start guards — a stored map and
  held entries — apart from it, so the terminal batch (task 3.3) and the re-binding (task 5.2) derive over their own
  acquisition and skip the guards.

    - `[ ]` **2.2.a Acquire the origin**

        - The primary through `readWorkUnit`, which also resolves a former slug, the machine half's `origin` carrying
          the current name; the group through `acquireLifecycleRecords` (`lib/work-unit/prepared-lifecycle-write.ts`);
          the dependents through `readLifecycleView`; and the stored map's absence at its singleton reference.
        - `requireCompleteInventory` throws on an unreadable or incomplete listing (`store.lifecycle-unreadable`,
          `store.lifecycle-incomplete`, `lib/store/lifecycle-storage.ts`); the throw becomes a recoverable refusal
          whose remedy is the condition's own.
        - The source records are the group's records `lifecycleRecordPath` places — draft, spec, task list, notes, and
          companions — the meta aside (`lib/store/lifecycle-record-path.ts`), so the inbound list, the stored map, and
          any conflict record are never scanned.
        - The scan takes the members to leave out as owner UIDs from its caller, which gives those task 3.1's member
          test accepts, so a member renamed since the additive batch is still left out and an item that took a gone
          member's slug is scanned (§ 3.2).
        - Build `test-first` (one behavior at a time):
            - preflight runs no Git invocation (`scriptGitExec([])`)
            - an origin named by a former slug derives its current name
            - an incomplete listing refuses as recoverable, and preflight passes once the listing is whole
            - an owner the caller leaves out yields no incoming edge, renamed or not

    - `[ ]` **2.2.b The source kind, units, and profile**

        - The source kind follows the origin's state and placement as `createV3DecomposePreflight` selects it
          (`decompose-v3-preflight.ts`), with no branch read: `backlog-stub`, `started-planning`, or `active-origin`.
        - The units are scanned from the draft or spec, task list, notes, and companions, or from an Active origin's
          design artifacts alone (`sourceUnits`), named by basename. A draft is a `work-item/draft` record, a single
          spec a `work-item/spec`, and a paired spec two `work-item/companion` records, keyed `spec-prd` and `spec-rfc`
          (`lib/store/companion-name.ts`).
        - The profile follows `Design` alone (`inferPlanningProfile`): an artifact `Design` does not name leaves it as
          it is.
        - Build `test-first` (one behavior at a time):
            - each source kind yields its machine half, and a paused origin proceeds
            - an Active origin's task list contributes no unit
            - an artifact `Design` does not name leaves the profile unchanged, under each profile

    - `[ ]` **2.2.c The edges**

        - Incoming: one per dependent — an open work item, completed records aside, whose `Depends On` names the
          origin by its slug or by a former slug that `lookup` resolves to it — carrying the dependent's slug and UID.
        - Outgoing: one per provider the origin's `Depends On` names, resolved by `lookup` on its slug, a former slug
          included, then by lineage lookup (`{kind: "lineage", origin}`, `lib/store/lookup.ts`), keeping its slug alone
          where it resolves to nothing or to several.
        - Build `test-first` (one behavior at a time):
            - a dependent naming the origin by a former slug yields its edge, and a completed one yields none
            - a provider renamed, abandoned, or decomposed resolves to its UID, as does one renamed and then retired
              where the edge names its last slug
            - a provider resolving to nothing or to several keeps its slug identity — one renamed and then retired
              among them where the edge still names a slug it held before the rename, which neither lookup finds once
              its primary is removed and its lineage carries the new name — and a lookup refused for any other reason
              passes through as a store refusal

    - `[ ]` **2.2.d What preflight refuses**

        - An origin holding a stored map, naming `--finish`, `--revise`, and `--discard`.
        - An origin whose inbound list holds an entry, naming each by its `_Id:_` from the list's entries
          (`splitEntryList`, `lib/store/concurrency/entries.ts`), or by its position where it has none, and admitting
          while no grammar is declared.
        - An Integrating origin, naming `arc reopen <origin>`, then for a retirement `arc deactivate <origin>`, and an
          archived one, terminally, naming no repair, each as today's source-kind selection refuses
          it (`source-predecessor`). No origin is parked from the flip: `arc park` refuses `unsupported` there
          (`runPark`), and the import makes a parked work unit a paused one, one parked from Planning being a stub
          already (`spec-seam-lifecycle.md` § 8.9), so there is no parked refusal, and a paused origin proceeds.
        - An origin no member can be made from, naming the locus to repair: a `Design` naming no profile's artifacts, an
          artifact it names that is absent, a `Task List` disagreeing with the profile, or an artifact the scanner
          rejects, as `inferPlanningProfile` and `sourceUnits` refuse today; a design record every member copies whose
          first line is no level-one heading, as `scaffold-title-missing` refuses today (`retitleScaffold`); or an
          `Owner`, `Priority`, or `Origin` missing from the meta each member copies, as
          `scaffold-source-meta-incomplete` refuses today, where `renderMetaFile` would otherwise throw on a missing
          `Owner`.
        - An origin whose meta or a source record holds an open conflict, naming each from the acquired record's
          `conflicts` by its token, `<family>/<owner type>/<owner name>/<id>`, and its subject, the remedy its
          resolution through the projection: its markers resolved in the file that shows them, which write-back
          persists, or otherwise `arc save --resolve <token>` from a checkout projecting the subject.
          `storage-projection` registers that command. The remedy's text is static: it names the command exactly when
          the source registers a top-level `save` with `--resolve`, and holds no `arc save` literal until then. An
          integration test holds the pairing, reading the command inventory the command-surface test reads
          (`loadRepositoryCommandInputSnapshot`, `lib/command-input/repository-inventory.ts`), so whichever change
          merges the other second meets that test failing until the remedy matches (§ 18). The stored map's own
          conflict is task 5.5's.
        - All but the first two are the derivation's rather than start guards, so the terminal batch and the re-binding
          meet them too.
        - A remedy names only a command `cli.ts` registers, as the command-surface test requires
          (`__tests__/integration/command-surface-documentation.test.ts`). `arc route`, in the held-entry remedies here
          and in tasks 3.3.b and 5.1.b, is `seam-locus`'s, so the branch merges base holding it before this task
          (§ 18).
        - Build `test-first` (one behavior at a time):
            - each refusal fires, and preflight passes after its remedy
            - held entries refuse only under a supplied grammar, an entry with no `_Id:_` named by its position
            - a conflict filed on the origin's draft refuses, naming its token and subject, and preflight passes once a
              write under `write-back` names it in `resolves`
            - the remedy names `arc save --resolve <token>` exactly when the command inventory registers a top-level
              `save` with `--resolve`, in a test under `__tests__/integration/` beside the command-surface test

### `[ ]` **2.3 Emit the starter map — § 5, § 3.3**

- _Goal:_ `--preflight` returns the machine half with an author slot for every authoring decision, as canonical JSON,
  writing nothing.

    - Build `test-first` (one behavior at a time):
        - the starter decodes as a version-4 starter, and its `preflightId` matches its machine half
        - a second preflight over unchanged records returns identical bytes
        - preflight leaves every record's `history` unchanged

### `[ ]` **2.4 Bind the completed map and check it before writing — § 6, § 7**

- _Goal:_ `--execute` and `--extract` read the completed map once, bind it to a fresh preflight, and refuse before any
  write, naming the repair, every map whose batch the store would refuse or whose result the design forbids.

    - `[ ]` **2.4.a Read and bind**

        - Decode the map (task 1.2); a version-3 map refuses, naming `--preflight`.
        - Repeat preflight and require the map's machine half to equal the fresh one, refusing otherwise, naming
          `--preflight` for a fresh starter.
        - `--execute` refuses an extraction map, naming `--extract`, and `--extract` a retirement map, naming
          `--execute`, each as a typed action carrying the map's path.
        - Build `test-first` (one behavior at a time):
            - each refusal fires, and the checks pass after its remedy
            - the wrong flag's typed action carries the map's path
            - preflight's refusals fire again here, a held entry and an open conflict among them

    - `[ ]` **2.4.b Names — D14**

        - Each member's slug and each new cohort document's name is free: no live work item holds it, nor any open
          cohort document, since work items and cohorts share the one namespace, which the reference backend does not
          enforce; and no record holds it as a former slug.
        - No new cohort document takes a completed cohort's name: the reference backend resolves that name to the
          completed record (`canonicalReference`), so a create expecting absence is stale there, and the check keeps a
          map landing alike on both backends, stricter than D2's reuse of a completed name. A member's slug a completed
          cohort holds passes.
        - The map's own names are distinct: no member's slug names a cohort document the cut creates, and no two
          documents it creates share a name, a `subcohort` placement's segments among them.
        - A cohort document the cut would create under the origin's name, as a `cohort` placement or either segment of
          a `subcohort` one, refuses, naming another cohort name in the map.
        - Build `test-first` (one behavior at a time):
            - each held name refuses — by a live work item, a live cohort, a former slug, another name in the map, and
              the origin's, and a new cohort document's by a completed cohort — and the checks pass after another name
              is chosen
            - a member's slug that only a completed cohort holds passes

    - `[ ]` **2.4.c Allocations and homes — § 7**

        - A home resolves through `lookup` to an open work unit; one resolving to nothing, to a completed work unit, or
          to an Errand refuses, naming another destination.
        - A home is started when placed active, and another person's when its `Owner` differs from the operator's
          identity, as materialization reads ownership (`ownedInFlight`, `verbs/materialize-store.ts`).
        - An allocation into a started home's meta or task list refuses, naming its draft, spec, or notes; one into any
          file of a home another person has started refuses, naming an inbound entry to route it; another person's
          stub takes allocations. A home's other companions follow its draft's and spec's rule.
        - A `document` home refuses, naming a work item or member for the content.
        - Target locators resolve only at the terminal batch (task 3.3), since authoring writes the content they name.
        - Build `test-first` (one behavior at a time):
            - each refusal fires, and the checks pass after its remedy
            - an allocation into another person's stub passes

    - `[ ]` **2.4.d The map's conservation and topology — § 13**

        - Carry under `lib/decompose/` the map's ownership and edge rules from `decompose-v3-conservation.ts` —
          `duplicate-destination-identity`, `retiring-origin-destination`, `incompatible-allocation-locator`,
          `incompatible-source-ownership`, `origin-reference-remains`, `self-dependency`, `redundant-external-edge`,
          `unchanged-dependency-slot`, `retiring-origin-target`, and `unknown-external-target` — and its placement
          rules from `decompose-v3-topology.ts`: `no-new-member`, `multi-member-cohortless`, `placement-member-count`,
          `unexpected-coordination-location`, and `missing-parent`, the surviving origin counted among an extraction's
          members (`planInternalV3DecomposeTopology`). Each refusal names its rule and the map's locus.
        - Carry the dependency projection over records: each member's seeded `Depends On`, from the outgoing `targets`
          dispositions and the internal and external edges, and each stub dependent's and stub home's edits, from the
          incoming dispositions, dependents keyed by UID. `writablePath`, `unwritable-dependent`, and `stale-dependent`,
          which compares version 3's `currentTargets`, go; `replaceDependencySlot` is rewritten under `lib/decompose/`
          rather than imported from `decompose-sweep.ts`. The terminal batch runs the same projection over the stub
          dependents and stub homes alone, the members' seeded edges being written already (task 3.4).
        - Build `test-first` (one behavior at a time):
            - each carried rule refuses at its locus, and the checks pass once the map is corrected
            - a contribution adding a provider its recipient already names refuses `unchanged-dependency-slot`
            - a member's external edge to the retiring origin refuses here, before anything is written
            - an extraction with one new member under a `cohort` placement passes, the origin counted among its members
            - the projection seeds each member's edges and edits each stub dependent's by its disposition

    - `[ ]` **2.4.e Edges the cut writes**

        - Every edge the cut writes — a member's, a stub home's, and a stub dependent's from an incoming `replace` —
          resolves by slug in the batch's after-state, as `meta.depends-on` checks (`checkMetaDependsOn`); a provider
          abandoned, decomposed, or ambiguous refuses, naming `drop` or another provider, and for the origin's own edge
          on a decomposed provider, its reconcile or `Depends On` edit first, then a fresh `--preflight`, or `--revise`
          once the map is stored.
        - The origin's own edge on a provider whose slug a member takes refuses, whatever that provider's state, shipped
          included, naming the same settlement first — reconcile for a started origin, a `Depends On` edit for a stub —
          then a fresh `--preflight`, or `--revise` once the map is stored: a slug lookup in the after-state would find
          the member, and settling the edge in the batch would change an edge the terminal batch binds (task 3.3.b). No
          other edge the cut writes can then name that slug: a member's or stub home's edge on a provider outside the
          map comes from the origin's own, through an outgoing `targets` disposition, or from an external edge, which
          refuses `redundant-external-edge` when it names a member's slug (task 2.4.d). An internal edge to that member
          names it by design.
        - Each edge a member's new slug trips in an open stub other than the origin is settled in the batch, so the
          check runs over the edges as the settling leaves them, by a settling plan this task builds under
          `lib/decompose/`, which task 2.5.c's settler writes. The plan holds each such edge, at its stub's read
          version, with its prior target and disposition as task 2.5.c states them, computed over the before-state; an
          in-flight work unit's edge, a stub holding a stored map of its own, whose edges its cut's terminal batch binds
          (task 3.3.b), a dependent the lineage did not map, or a chain reconcile cannot resolve to one disposition
          stays out for `work-item.slug-edges` to refuse, whose remedy names choosing another slug. The plan imports
          nothing from `transition-disposition-query.ts`, whose input type comes from a module the deletion pass removes
          (`transition-record-enumeration.ts`).
        - A started home that would take a new edge refuses, leaving the edge to its owner; in an extraction, so does a
          started dependent given any disposition that moves its edge off the origin (§ 8.6).
        - Build `test-first` (one behavior at a time):
            - each refusal fires, and the checks pass after its remedy
            - a provider among the map's own members passes
            - the origin's own edge on a provider whose slug a member takes refuses — shipped, abandoned, or
              decomposed — and the checks pass over a fresh starter once that edge is settled
            - an internal edge to a member that takes a shipped work unit's slug stays on the member

    - `[ ]` **2.4.f Purpose**

        - Each Purpose is present exactly where the batch creates the document: one missing for a created document, or
          present for an existing one, refuses, naming its addition or removal in the map.
        - Build `test-first` (one behavior at a time):
            - a created `cohort` document without its Purpose refuses, and a reused one with a Purpose refuses
            - a `subcohort` placement creating its parent requires `parentPurpose`, and one reusing it refuses it

### `[ ]` **2.5 Write the additive batch — § 6, § 12, § 13**

- _Goal:_ One batch writes a cut's members, their copies, its new cohort documents with their Purpose, the settling of
  every edge the members' slugs trip, and the stored map with expected absence, removing nothing, and the verb reports
  what it wrote with each destination's authoring requirements and the next step.

    - `[ ]` **2.5.a Members and their copies**

        - Each member's meta through `renderMetaFile`, placed backlog planned and seeded as today's scaffold seeds it
          (`scaffoldMemberProfile`, `decompose-v3-repository-plan.ts`): `State` Planning, `Owner` and `Priority` from
          the origin, `Class` from its destination, `Origin` from the origin's own, `Design` from the profile, `Cohort`
          the full path or none, its seeded `Depends On` from the projection (task 2.4.d), and `Current Workflow` its
          first workflow — `draft-design` under a draft profile, `generate-tasks` otherwise — which `Next Action`
          names.
        - Beside it, a copy of each design record the profile names — a draft, a spec, or a paired spec's two
          companions, the paired spec's two companions being the copies `meta.design-entry` requires in the same batch,
          since `checkMetaDesignEntry` passes over a work unit's own draft and spec names
          (`lib/store/kinds/meta/reference-rules.ts`) — and of the task list or notes where an allocation targets that
          companion on the member, each copy's title, its first line, retitled where it holds the origin slug and kept
          as it is otherwise, as `retitleScaffold` retitles it. A task list or notes it would copy with no title line
          refuses before anything is written (`scaffold-title-missing`), as task 2.2.d refuses such a design record.
        - So does a task list whose copy carries a diagnostic the task-list write checks report: with no prior version,
          `checkTaskListSegmentation` and `checkTaskListDescriptor` count every diagnostic as added
          (`lib/store/kinds/task-list/shape-rules.ts`), so the verb runs them over each copy first and refuses naming
          the origin's task list and each diagnostic, where the store's refusal would name a member copy never written.
        - So does a task list whose copy would carry a completed task, marked `[x]`. The store refuses any write that
          drops a completed task, a removal included (`checkTaskListCompletedIdentifier`,
          `lib/store/kinds/task-list/integrity-rules.ts`), so no hand edit could trim it from the member's copy and no
          discard or revision could remove that stub. The refusal names the origin's task list and each completed task,
          the remedy being to target the member's draft, spec, or notes in the map instead. A deferred task, which a
          write may drop, passes.
        - Build `test-first` (one behavior at a time):
            - each seeded field matches its source, under each planning profile
            - a companion copy lands only where an allocation targets it
            - a copy whose title does not hold the origin slug lands unchanged
            - a task list an allocation would copy with no title line refuses, and the batch lands once it has one
            - a task list carrying a diagnostic the write checks report refuses, naming the origin's task list, and the
              batch lands once it is repaired
            - a task list carrying a completed task refuses, naming the origin's task list and the task, and the batch
              lands once the map targets the member's notes instead; one carrying a deferred task lands

    - `[ ]` **2.5.b Cohort documents — topology**

        - Carry `decompose-v3-topology.ts`'s four placements and both `Parent` checks over cohort records
          (`structurallyMatches`): `cohort` creates one or reuses an open one, `subcohort` creates its parent beside it
          with `parentPurpose` where absent, and `at-cap` and `direct-member` create none.
        - Each created document through `writeCohortDocument` with the map's Purpose; an `at-cap` fan-out waits for the
          terminal batch.
        - Build `test-first` (one behavior at a time):
            - each placement writes its documents, and a reused document with a mismatched `Parent` refuses
            - a member and its new cohort document land together, as `meta.cohort` requires

    - `[ ]` **2.5.c Slug edges and the stored map**

        - Settle the edges task 2.4.e's settling plan holds — each edge a member's new slug trips in an open stub other
          than the origin, at its read version — as record kinds § 5.3 settles it, in a settler under `lib/decompose/`
          that writes the plan. The slug's prior target is found in the before-state by slug lookup, then lineage
          lookup, as `work-item.slug-edges` finds it (`priorTarget`, `lib/store/kinds/work-item/slug-edges.ts`), and the
          edge takes the disposition reconcile gives it (`planDependencyReconcile`,
          `side-effects/discharge-dep-edges.ts`): an edge on shipped work discharges; an edge on an abandoned origin
          drops; and an edge on a decomposed origin takes the replacement its lineage record gives that dependent
          (`incoming`), a replacement itself retired followed on through its own lineage record and a shipped or
          Integrating one discharged, as `resolveRetiredEdge` resolves the chain.
        - What the batch cannot settle — an in-flight work unit's edge, a stub holding a stored map of its own, a
          dependent the lineage did not map, or a chain reconcile cannot resolve to one disposition —
          `work-item.slug-edges` refuses, as the plan leaves it (task 2.4.e). The settler, like the plan, imports
          nothing from `transition-disposition-query.ts`.
        - A paused work unit's `pause.waitsOn` edge remains its owner's to change, independently of `Depends On`;
          `checkSlugEdges` counts both through `namedEdges` (`lib/store/kinds/work-item/slug-edges.ts`). Leave that
          pause edge out of the settling plan and surface the rule's remedy to clear or retarget it through `arc pause`.
        - The stored map, with expected absence, in the same batch (`batchLifecycleWrites`).
        - Build `test-first` (one behavior at a time):
            - a member taking a retired origin's slug settles a stub's edge on it by that lineage's disposition, and an
              in-flight work unit's edge refuses
            - a member taking a decomposed origin's slug whose replacement another cut has since retired settles a
              stub's edge to the chain's end, and a replacement since shipped discharges
            - a member taking a shipped work unit's slug discharges a stub's edge on it
            - through the production registry, a paused work unit whose only edge to the reused slug is
              `pause.waitsOn` makes the additive batch refuse atomically, naming the pause repair; clearing or
              retargeting that edge lets the same cut land
            - a stub holding a stored map of its own whose edge names the slug refuses, its edge unsettled, and the
              batch lands once the member takes another slug
            - a refusal anywhere leaves nothing written

    - `[ ]` **2.5.d The report**

        - A result schema: each member with its copies, each cohort document created, and each destination's
          authoring requirements — the units allocated to it with their ownership and target locators, an existing
          home's among them — and the next step, authoring and then `--finish` to preview, as a typed action. Today's
          packets (`authoring`, `decompose-v3-result-report.ts`) come from the patches the in-repo arm composes into
          existing homes, which the store version leaves to authoring.
        - Build `test-first` (one behavior at a time):
            - the report names every record the batch wrote and every allocation's destination and target

### `[ ]` **2.6 Recheck after the store refuses the batch — § 6**

- _Goal:_ When the store refuses the additive batch, the verb repeats its binding and checks against the store as it now
  stands and reports the first refusal they find, the stored-map refusal ahead of the held-name refusal, and only when
  they find none the store's own, a version conflict's remedy being the batch again as given.

    - Each race is staged through task 2.1.c's store wrapper.
    - Build `test-first` (one behavior at a time):
        - another cut storing a map between the checks and the batch reports the stored-map refusal
        - a name taken between the checks and the batch — within a type by a competing write, and across types, in
          each direction, by a competing write with the injected refusal — reports the held-name refusal, and no
          batch's after-state holds a live cohort and work item of one name
        - a version conflict the repeated checks do not explain names the batch again as a typed action, which lands

## **Phase 3:** The terminal batch for a retirement

_Purpose:_ Land a retirement's terminal batch through the lifecycle executor's `decompose` edge — lineage carrying
`retiredBranches`, the origin's removal, and the dependents' and homes' edges — previewed and applied under an
authority.

_Exit criterion:_ Through the store version's entry points with task 2.1's context, over `createLifecycleHarness`'s
reference backend and a scripted Git executor, a retirement runs preflight, the additive batch, authoring by hand-edit
writes, the preview, and the apply four times — from a stub origin and from a started Planning origin, each under a
`cohort` and an `at-cap` placement: the additive batch writes the members, their copies, the cohort documents with their
Purpose, and the stored map in one batch; the terminal batch writes `decompose` lineage carrying `retiredBranches`,
removes the primary and the stored map, rewrites stub dependents, writes home edges, and under `at-cap` appends the
fan-out block, in one batch; the teardown step completes over the lineage record, as `arc teardown <origin>` does after
that step fails; and the preview afterward reports the cut landed, naming its members.

### `[ ]` **3.1 Acquire the terminal batch's records — § 8.1**

- _Goal:_ The terminal batch reads each record it needs once, through the store, at its version — the stored map by the
  origin's slug, the origin's whole group, each member's meta, the cohort documents the map names, the existing homes,
  and the stub dependents the listing finds, the members left out — and keeps those versions as its guards.

    - The stored map through `lookup` on the origin's slug and the kind's singleton reference for that owner (§ 4), read
      once, since the origin's group listing already holds it (`acquireLifecycleRecords`); a member by its map slug,
      which `lookup` resolves through a rename, and the member only where its primary's creation entry in `history`
      names that slug as the owner it was created under and carries the `batchId` of an entry naming `decompose` in the
      stored map's `history` since the map was last created — the additive batch or a revision
      (`StoredProvenanceSchema`, `lib/store/links.ts`) — an entry with no `batchId` matching none: an item that took the
      slug of a member abandoned since, or a sibling renamed to it, is not that member, which leaves the member gone
      (task 3.2.b). The member test is one function, whose accepted owners are the members task 2.2.a's scan leaves out,
      and each record's `history` is read once per run of the verb.
    - Each existing home resolved through `lookup` before its records are acquired, as task 2.4.c resolves it: one
      resolving to nothing, to a completed work unit, or to an Errand refuses before anything is written, naming
      `--revise` to retarget its allocations.
    - No stored map refuses, naming `--execute` or `--extract`, but for a landed cut (task 3.6). A stored map conflicted
      by a sync takes task 5.5's refusal, which this task does not build.
    - Build `test-first` (one behavior at a time):
        - each record is acquired once, at the version the batch then guards
        - no stored map refuses, and the acquisition passes after the additive batch
        - a member abandoned since and its slug taken by a new stub reads as gone, the new stub untouched
        - a sibling stub renamed to an abandoned member's slug is not taken as that member, which reads as gone, and is
          found by its own map slug as a member renamed
        - a stored map created again after an earlier cut of the same origin admits only the current cut's members
        - a home abandoned or shipped since the additive batch refuses, naming `--revise`

### `[ ]` **3.2 Check the origin's current kind and the seeded fields — § 8.2, § 8.3**

- _Goal:_ The terminal batch applies the shape's rules to the origin's current kind rather than the one the map
  recorded, and requires of each member only what the map decided — it exists, carries the map's `Cohort`, and still
  names each seeded provider, compared by owner — so grooming passes and divergence refuses, naming its restoration
  through write-back, and the revision only where one can make it legitimate.

    - `[ ]` **3.2.a The origin's current kind**

        - Derived by task 2.2's derivation over the records task 3.1 acquired. A kind the shape does not take refuses,
          naming the moves that restore one — `arc deactivate <origin>` for an Active origin, and for an Integrating one
          `arc reopen <origin>`, then in a retirement `arc deactivate <origin>` — or `--discard`:
          an Active origin in a retirement, and an Integrating or archived one in either shape — for a retirement, whose
          `decompose` edges leave none of these positions (`lifecycle-transitions.ts`), before the preview rather than
          at the executor after the approval, and for an extraction, which runs no transition, as the source-kind
          selection refuses it (`source-predecessor`). A renamed origin refuses, naming `--revise`.
        - Build `test-first` (one behavior at a time):
            - an Active origin refuses a retirement, and the checks pass after its deactivation
            - an origin no member can be made from refuses here as at preflight
            - an Integrating origin refuses at the preview, and a retirement's checks pass after `arc reopen` and then
              `arc deactivate`
            - a stub started since the additive batch passes
            - a renamed origin refuses

    - `[ ]` **3.2.b The seeded fields**

        - Providers are compared by owner as § 3.2 resolves them, so a provider's rename passes, and an abandoned
          provider whose edge stays passes.
        - A seeded provider also passes where the member's edge holds the disposition reconcile gives it
          (`planDependencyReconcile`), whoever applied it — another cut or a started member's own reconcile: no edge for
          shipped or Integrating work or an abandoned provider, and for one another cut has retired, the replacement its
          lineage record gives the member (`incoming`), followed on through a replacement itself retired, as
          `resolveRetiredEdge` resolves the chain.
        - A gate or reason set during authoring and any added edge pass; any other dropped seeded edge or a changed
          `Cohort` refuses, naming its restoration through write-back, and `--revise` where a revised map can make the
          change legitimate — for a `Cohort`, only where a placement the map's rules admit gives every member its
          current `Cohort`, since the map takes one placement for every member (`memberPlacement`,
          `decompose-v3-repository-projections.ts`) under its member-count rules (`placement-cardinality`); and a member
          gone (task 3.1) refuses, naming `--revise`.
        - A member renamed since refuses, naming `arc rename <new> <old>` as a typed action; a retirement's member
          naming the origin in its `Depends On` refuses, naming that edge's removal through write-back.
        - Build `test-first` (one behavior at a time):
            - each passing case above passes, but for a gate or reason, which `Depends On` cannot hold until its entry
              widens beyond a slug (`writeMetaDependsOn`, § 12)
            - each refusing case refuses; those whose remedy is a rename or a write-back edit pass after it, and those
              naming `--revise` are task 5.3's
            - a seeded provider retired by two successive cuts passes where the member's edge names the second cut's
              replacement
            - a `Cohort` changed on one member alone, members' `Cohort`s changed to different values, or a
              one-member retirement's `Cohort` set at all, its one placement `direct-member` leaving none, refuses
              naming the restoration alone, and passes once restored through write-back
            - a `Cohort` changed on every member alike to a cohort a placement admits refuses naming the restoration
              and `--revise`

### `[ ]` **3.3 Check the content — § 8.4**

- _Goal:_ Every allocation resolves exactly once in its destination, every record of a retiring group is accounted for,
  the origin's rescan still matches the map's units and edges, the origin's inbound list holds no entry, and every edge
  the batch writes resolves — each failure refusing before anything is written, naming its repair.

- _Note:_ See `notes-seam-decomposition.md` § A1 — destination locator semantics for the scanner's occurrence matching
  and source probe; the executable cases below realize spec § 8.4 and Success Criterion 9.

    - `[ ]` **3.3.a Conservation over records**

        - Each allocation's target locator resolves exactly once in its destination record through the scanner's locator
          resolution (`resolveV3DecomposeContentLocator`, `decompose-content.ts`), as extraction's finish checks today
          (`validateProjectedContent`). Occurrences are recomputed by `scanV3DecomposeContent`; the target is the
          current section at the full saved locator, with no destination content digest or persistent heading identity.
        - A retirement leaves no content unaccounted for, as `uncovered-retirement-content` requires today
          (`decompose-v3-conservation.ts`), with no refusal of its own: every content record of the retiring group —
          draft, spec, task list, notes, and companions — is a source record the scan covers, and one added between the
          batches is an added unit, which task 3.3.b's rescan refuses. Each other `work-item` kind the group can hold
          (`KIND_SHAPES`, `lib/store/catalog.ts`) is accounted for: the meta, inbound list, and stored map are checked
          on their own, a promoted origin's description record retires with the item, and an open conflict refuses
          through task 2.2.d's derivation.
        - Build `test-first` (one behavior at a time):
            - a rename, re-level, merge, or ancestry change that leaves the saved locator unresolved refuses,
              naming the allocation and `--revise`
            - an earlier matching heading that takes the saved ordinal passes, and the resolved content is that new
              section, even when its body differs from the section previously at that locator
            - removing or merging a section passes when another section still occupies the complete saved locator
            - an authored body change that leaves the target locator resolvable passes
            - a promoted origin's description record passes
            - a conflict filed on a source record between the batches refuses

    - `[ ]` **3.3.b The origin bound by content**

        - Rescan for the origin's current kind and require exactly the map's units by content digest and its edges by
          `edgeId`, leaving out the members task 3.1's member test accepts; a write the scan does not cover passes.
        - The acquired inbound list holds no entry, beside the write check `lineage.inbound-held`, each named by its
          `_Id:_` and admitting while no grammar is declared.
        - Build `test-first` (one behavior at a time):
            - an added, changed, or removed unit or edge refuses, naming `--revise`, a dependent added since and a
              companion record added since among them
            - a write to the origin's meta other than its `Depends On` passes
            - an entry routed to the origin between the batches refuses under a supplied grammar

    - `[ ]` **3.3.c Edges again**

        - A started home that would take a new edge refuses, as at the additive batch; every edge the batch writes
          resolves by slug, so a provider ended between the batches refuses before the approval, naming `--revise`.
        - Build `test-first` (one behavior at a time):
            - a home started since the additive batch that the map gives a new edge refuses, naming the edge for its
              owner and `--revise`
            - a provider abandoned since the additive batch refuses, naming `--revise`, and the revision that drops or
              retargets its edge is task 5.3's

### `[ ]` **3.4 Write the retirement through the lifecycle executor — § 8.5, § 11, § 12**

- _Goal:_ A retirement's terminal batch is the `decompose` transition's arm from the flip: after the removal check on
  any checkout holding the origin, one batch writes `decompose` lineage with `retiredBranches`, removes the primary and
  the stored map, rewrites stub dependents, writes stub homes' edges, and appends any at-cap fan-out block, every
  acquired record revalidated at its version just before it; then teardown's store arm removes or releases the
  checkout, leaving `arc teardown <origin>` where it fails.

- _Approach:_ Follow `runStoreAbandon` (`lib/work-unit/verbs/abandon-store.ts`): `executeTransition` with verb
  `decompose`, whose edges from a stub and a started Planning work unit declare removal and Git steps after the batch
  (`lifecycle-transitions.ts`), `storeTransition.additionalWrites` for the batch's other writes, `preparedRecords` for
  the records the executor revalidates, and `provenance` naming the terminal batch.

    - `[ ]` **3.4.a The lineage record**

        - Carry `createDecomposeTransitionRecord`'s projection from the map (`decompose-transition-record.ts`) under
          `lib/decompose/` — `successors` the members, `incoming` each dependent's disposition, `outgoing` each
          provider's members — each reference carrying its current name and, where its record or the map holds one,
          its UID, by which reconcile's store arm matches a dependent (`store-reconcile-context.ts`); and add the
          origin's UID and `retiredBranches` from the primary's exact branch links, `[]` where it has none, as
          `runStoreAbandon` writes them.
        - Build `test-first` (one behavior at a time):
            - the record passes `lineage.retired-branches`, with links and without
            - `arc teardown <origin>` accepts it (`readStoreRetirementEvidence`)
            - a dependent renamed between the batches is named by its UID and current name

    - `[ ]` **3.4.b The edges and the fan-out**

        - Each stub dependent's `Depends On` and each stub home's new edges through task 2.4.d's projection, run over
          the stub dependents and stub homes alone, and `writeMetaDependsOn`; under an `at-cap` placement the fan-out
          block on its subcohort document (the placement's two-segment `parent`) through task 1.4's writer, naming the
          members by their map slugs, a renamed member having refused (task 3.2.b), with its reuse and lone-marker
          results; and the stored map's removal.
        - A lone marker or a different block on the subcohort document, left by a hand edit between the batches,
          refuses before anything is written (`conflicting-at-cap-provenance`, `planAtCap`,
          `decompose-v3-topology.ts`), naming the block's repair or removal through write-back, then `--finish`.
        - A stub dependent holding a stored map of its own takes its rewritten edge like any other, and its own cut
          re-binds through `--revise` (§ 8.4).
        - Build `test-first` (one behavior at a time):
            - a stub dependent's edge is replaced or dropped by its disposition; an in-flight dependent's is left
            - a stub dependent holding a stored map of its own takes its rewritten edge, and its own cut's `--finish`
              then refuses, naming `--revise`
            - the fan-out block names the members by their map slugs
            - a block already present, seeded by hand, is reused, and a lone marker or a different block refuses, the
              batch landing once the block is repaired

    - `[ ]` **3.4.c The checkout, the executor, and teardown**

        - Before the batch, the removal check on a checkout on this machine holding a started origin
          (`findWorkUnitHoldingCheckout`, `checkRetiringCheckout`), refusing with its own remedy
          (`describeRemovalRefusal`). A spawned checkout selected for removal requires Git cleanliness; a retained
          checkout anchored with `arc start --here` takes the release disposition, which checks the projection without
          requiring Git cleanliness (`checkWorktreeRemoval`).
        - The executor runs with the primary's current name and adds the primary's removal itself
          (`executeStoreTransition`, `lifecycle-store-executor.ts`), so `additionalWrites` never names the primary,
          which a batch naming one record twice would refuse; each of its rejections maps into task 2.1.b's refusals, a
          version conflict naming a fresh `--finish` preview. Its own listing check returns a guard-stage rejection
          carrying only the error's text (`requireCompleteInventory`), so on a guard-stage rejection the verb reads the
          listing again and reports the listing refusal where it is unreadable or incomplete.
        - After the batch, a Git step running `runStoreTeardown`, its retry `arc teardown <origin>`, passed every time
          since the `decompose` edge requires one and returning at once for a stub with no checkout and no branch link,
          as `runStoreAbandon`'s does; teardown's notices, such as a kept `plan/<slug>` branch holding unlanded commits,
          surface in the result as abandonment surfaces them.
        - Build `test-first` (one behavior at a time):
            - a dirty spawned holding checkout selected for removal refuses before anything is written
            - a dirty retained holding checkout passes the release checks, and teardown releases its claim while
              preserving its files; a refused projection check on that checkout refuses before the batch
            - a failed teardown step leaves the continuation, and `arc teardown <origin>` completes it
            - a listing made incomplete before the executor's own read refuses as the listing refusal, recoverable, and
              `--finish` lands once the listing is whole
            - a stub with no links runs only the holding-checkout lookup; a started origin runs the lookup and the
              removal check before the batch and teardown's own calls after it, over `retirement-harness.ts`'s scripted
              executor, which refuses any call it does not expect

### `[ ]` **3.5 Preview and apply under an apply authority — § 8.7**

- _Goal:_ `--finish` acquires, checks, and prepares the terminal batch, the removal check included, writes nothing, and
  reports the lineage record, the removals, and each record it would write with an apply authority; `--finish --apply
  <authority>` runs the batch only when a fresh preparation's digest equals it, refusing otherwise, naming `--finish`.

    - The authority is the canonical digest (`canonicalDigest`) of the schema version, the mode — a retirement's
      finish, an extraction's finish, the discard, or the revision — the origin's slug and UID, every acquired record's
      reference and version, and the prepared writes, the executor's removal of the primary among them, each list in
      canonical order; it lives in a module the discard and the revision share (tasks 5.1, 5.3).
    - The apply acquires, checks, and prepares again, and compares the authority last, once every check passes, as
      today's finish compares it (`git-decompose-v3-finish.ts`).
    - A version conflict at an applied batch names a fresh preview and approval, as text.
    - Build `test-first` (one behavior at a time):
        - the preview writes nothing, and a dirty spawned holding checkout selected for removal refuses at the preview
        - a dirty retained holding checkout passes the preview when its projection check passes, and refuses there
          when that check refuses
        - a change every check accepts — a member's `Next Action` groomed, or a stub dependent's unrelated field
          edited — makes the authority stale
        - a matching authority lands exactly the previewed writes
        - a version conflict at the applied batch that the repeated checks do not explain, staged through task 2.1.c's
          store wrapper, names a fresh `--finish` preview and approval, as text, and writes nothing

### `[ ]` **3.6 Report a landed cut from `--finish` — § 8.7**

- _Goal:_ `--finish` on a retirement that has landed reports it landed and names its members, found through the
  `decompose` lineage record a lineage lookup on the origin's slug finds (`{kind: "lineage", origin}`), rather than
  refusing for want of a stored map.

    - The members come from the record's `successors`; an extraction's landed cut reads the origin's `history` (task
      4.3).
    - Build `test-first` (one behavior at a time):
        - a landed retirement reports its members
        - a live origin with no stored map and no lineage refuses as holding no stored map, and an abandoned one with
          the store's refusal of its slug, which no longer resolves to a primary

### `[ ]` **3.7 Keep a cut's reads flat — § 8.1, Goal 7**

- _Goal:_ Each batch reads the origin's group, the selected cohort documents, the existing homes, and the dependents the
  listing names a fixed number of times each, and the `history` of the stored map and of each item a member's slug finds
  once per run, those counts unchanged by the records' history or by unrelated work items, and nothing from Git but
  § 11's locus reads.

    - A new read-counting store wrapper in `__tests__/helpers/store/`, counting `read`, `list`, `lookup`, and `history`
      by reference, built as `archive-store.test.ts`'s fault-injecting proxies are, which stay as they are. The counts
      prove how often each record is read, not what one `history` read costs, which is the backend's (the spec's
      Cross-cutting Performance).
    - Write checks read through the backend's own view, so the counts are the verb's and the executor's: in a
      retirement, the executor's lifecycle listing, its read of the primary, and its revalidation before the batch
      (`executeStoreTransition`).
    - Assert each batch's counts over a cut, then over the same cut with long record histories and many unrelated work
      items.

### `[ ]` **3.8 A retirement end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

## **Phase 4:** Extraction

_Purpose:_ Carry extraction over records: its additive arm, the origin's thinning, and a terminal batch that keeps the
origin and writes no lineage.

_Mode:_ `slice` — closes on an extraction run end to end over the reference backend.

_Exit criterion:_ Through the store version's entry points with task 2.1's context, over the reference backend and with
no Git invocation (`scriptGitExec([])`), an extraction runs the additive batch, authoring, the preview, and the apply
from a started Planning origin under each of the four placements and from an Active origin under one: the terminal
batch thins the origin's draft or spec to its kept units, removing a record that keeps none, sets its `Cohort` to the
members' path under every placement but `direct-member`, which keeps it, rewrites stub dependents, and removes the
stored map, writing no lineage; and the preview afterward reports the cut landed.

### `[ ]` **4.1 Run an extraction's additive batch — § 6, § 8.6**

- _Goal:_ `--extract` stores an extraction's map and members from a started Planning or Active origin that survives —
  its companions staying with it, members free to depend on it, and a dependent free to keep its edge on it — through
  the additive batch a retirement uses.

    - Build `test-first` (one behavior at a time):
        - a member's seeded edge on the surviving origin passes `meta.depends-on`
        - the origin's records are unchanged by the additive batch, its `Cohort` among them
        - no member takes a copy of the origin's task list or notes, every companion staying with the origin
        - a dependent keeping `[origin]` passes
        - `--extract` from a stub origin refuses `source-shape`, and a companion sent to a member refuses
          `companion-disposition`, each through the verb
        - one new member under a `cohort` placement passes, the origin counted among the members

### `[ ]` **4.2 Thin the origin's draft or spec over records — § 8.6, § 13**

- _Goal:_ The terminal batch derives the origin's retained bytes from the records it acquired, preserving the bytes of
  the units the origin keeps and removing a record that keeps none, as today's thinning plans it.

    - Carry `planV3ExtractionSourceThinning` (`decompose-v3-thinning.ts`) under `lib/decompose/`, its inputs records
      rather than a path-keyed tree (`V3RepositoryPlanTree`) and its source IDs version 4's (task 1.2.a). Its own checks
      of the map's binding, the source-artifact inventory, and Git file modes go, task 3.3.b's rescan binding the origin
      instead.
    - A record whose bytes the thinning leaves unchanged takes no write.
    - Build `test-first` (one behavior at a time):
        - the kept units' bytes survive exactly
        - a record keeping no unit is removed, and one keeping every unit takes no write
        - units resolve by locator against the origin's current record

### `[ ]` **4.3 Write an extraction's terminal batch — § 8.6, § 8.7**

- _Goal:_ After the checks of § 8.2–8.4, one prepared batch — no lifecycle transition — thins the origin, sets its
  `Cohort` to the members' path where it differs, rewrites stub dependents, writes stub homes' edges and any at-cap
  fan-out, and removes the stored map, writing no lineage, and its preview reports the retained bytes and each record.

    - `[ ]` **4.3.a The batch**

        - The acquired records revalidated (`revalidateLifecycleRecords`) and the prepared writes alone applied in one
          batch (`batchLifecycleWrites`), as the executor applies a retirement's, so the batch writes exactly what its
          preview shows. `applyPreparedLifecycleWrite` would also re-put every acquired record it leaves unwritten —
          each member, home, and dependent under `decompose` — and the store refuses that put for a lineage record,
          which is create-only, and a conflict record, which is write-once.
        - `Cohort` through `writeMetaCohort` under every placement but `direct-member`.
        - Under an `at-cap` placement, the fan-out block on its subcohort document through task 1.4's writer, as task
          3.4.b writes it: a lone marker or a different block refuses before anything is written
          (`conflicting-at-cap-provenance`), naming the block's repair or removal through write-back, then `--finish`.
        - A version conflict at the batch names a fresh `--finish` preview and approval, as text, as task 3.5 maps a
          retirement's.
        - The finish's destination validation does not carry: its claims become § 8.3's check, its locator resolution
          § 8.4's, and its byte-equality checks go.
        - Build `test-first` (one behavior at a time):
            - each placement sets or keeps the origin's `Cohort`
            - a started dependent whose edge would leave the origin refuses again here
            - an origin activated or deactivated since the additive batch refuses where its scan's units changed,
              naming `--revise`, and an Integrating one refuses, naming `arc reopen <origin>`
            - under an `at-cap` placement, a lone marker or a different block refuses, and the batch lands once the
              block is repaired
            - no record takes a write but those the preview lists

    - `[ ]` **4.3.b The preview and the landed cut**

        - The preview reports the thinned artifacts' retained bytes and each record the batch would write, under task
          3.5's authority.
        - `--finish` after the batch reports the cut landed through the origin's `history`, where the stored map's last
          removal carries the terminal batch's provenance.
        - Build `test-first` (one behavior at a time):
            - the preview writes nothing and reports the retained bytes
            - a stale authority refuses, and a matching one lands exactly the previewed writes
            - a version conflict at the applied batch, staged through task 2.1.c's store wrapper, names a fresh
              `--finish` preview and approval, and writes nothing
            - `--finish` afterward reports the cut landed, and after a discard reports no stored map rather than a
              landed cut

### `[ ]` **4.4 An extraction end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

## **Phase 5:** Discard and revision

_Purpose:_ Give a stored cut its two other exits — the discard and the revision, each previewed and applied under an
authority — and settle the lifecycle moves and races between the batches.

_Mode:_ `slice` — closes on a cut discarded, and a cut revised after its origin changed, end to end.

_Exit criterion:_ Through the store version's entry points with task 2.1's context, over the reference backend, a
discard after the additive batch leaves the members and the cut's cohort documents only in `history`, and an
abandonment of the origin then succeeds where `lineage.cut-in-flight` refused it before; a revision adds and removes
stubs and cohort documents, moves only seeded edges and `Cohort`, and replaces the stored map; after a changed origin,
`--revise` emits the complete revised map where the only change is to the content of `drop`-allocated or
extraction-kept units or to the source kind, and otherwise a fresh starter with the stored authoring beside it and the
first place to reauthor; and a stored map conflicted by a sync resolves through either.

### `[ ]` **5.1 Discard a cut — § 9.1, § 9.3**

- _Goal:_ `--discard` previews and `--discard --apply <authority>` removes in one batch each stub still present as a
  whole group, the cut's new cohort documents, and the stored map, writing no lineage, and its preview lists each
  existing home and existing cohort coordination the map allocated to as left edited.

    - `[ ]` **5.1.a The batch**

        - The stored map read by the origin's slug (§ 4); with none, the refusal names `--execute <cut-map>` or
          `--extract <cut-map>`.
        - Each stub found by its map slug, which `lookup` resolves through a rename, and a member only where the cut
          created it, as task 3.1 finds one, an item that took a gone member's slug left untouched; its whole group
          acquired at its versions (`acquireLifecycleRecords`), under task 3.5's authority with the discard as its mode;
          edges the additive batch settled stay settled.
        - The acquired records revalidated (`revalidateLifecycleRecords`) and the prepared writes alone applied in one
          batch (`batchLifecycleWrites`), as task 4.3.a applies an extraction's. A stub's conflict record is never
          removed itself: it is write-once, removable only by its writer verbs (`once`, `lib/store/registry.ts`), so it
          is named in the `resolves` of its subject's removal, which closes it.
        - A version conflict at the batch names a fresh `--discard` preview and approval, as text.
        - Build `test-first` (one behavior at a time):
            - the preview writes nothing and lists each existing home and existing cohort coordination left edited
            - a stale authority refuses, naming `--discard` for a fresh preview, and a matching one lands exactly the
              previewed writes
            - a version conflict at the applied batch, staged through task 2.1.c's store wrapper, names a fresh
              `--discard` preview and approval, and writes nothing
            - the members and documents remain only in `history`
            - a stub renamed during authoring is removed
            - an item that took the slug of a member abandoned since is neither listed in the preview nor removed
            - a sibling stub renamed to an abandoned member's slug is listed and removed once
            - over task 3.7's read-counting wrapper, the preview and the apply each read the `history` of the stored map
              and of each item a member's slug finds once, and the rest as task 3.7 counts, unchanged over long record
              histories and many unrelated work items
            - a stub holding a conflict record from a sync is removed, its conflict closed
            - with no stored map, the discard refuses, naming `--execute <cut-map>` or `--extract <cut-map>`

    - `[ ]` **5.1.b What a discard or revision refuses — § 9.3**

        - A started member it would remove, naming `arc abandon <member>`.
        - An edge it does not write that names a stub it removes — a `Depends On` or pause `waits-on` edge of any open
          work item, completed records skipped, as `work-item.slug-edges` counts them — naming the edge for its owner,
          a `waits-on` edge through `arc pause <name> --waits-on <other>`, `--waits-on-note <text>`, or
          `--no-waits-on`. The count is rewritten under `lib/decompose/`, the records the batch removes left out, since
          `namedEdges` and `survivingEdge` are private to `lib/store/kinds/work-item/slug-edges.ts` and the latter reads
          a write check's input.
        - A stub it would remove that holds a stored map of its own, naming `arc decompose <stub> --discard`.
        - A new cohort document it would remove that an open work item or cohort document holds
          (`checkCohortOpenMembers`), naming each holder.
        - A stub it would remove whose inbound list holds an entry, naming `arc route <entry-id> --from <stub>
          --expected-version <version> --to <destination>`, admitting while no grammar is declared.
        - Build `test-first` (one behavior at a time):
            - each refusal fires, and the discard lands after its remedy
            - an unreadable or incomplete lifecycle listing refuses the edge count as recoverable, and the discard lands
              once the listing is whole
            - a held entry moved off the stub by a direct store write under the supplied grammar lets the discard land

### `[ ]` **5.2 Re-bind a changed origin and emit the revision starter — § 9.4, § 9.2**

- _Goal:_ `--revise` writes nothing and returns either the complete revised map over a fresh machine half, where the
  only change is to the content of units allocated `drop` or, in an extraction, kept by the origin, or to the source
  kind, or a fresh starter with the stored authoring beside it and the first place to reauthor as a reason and a locus.

    - Carry `refreshV3ExtractionCutMap`'s rule (`decompose-v3-refresh.ts`) to both shapes, over a fresh preflight that
      leaves out the members task 3.1's member test accepts and skips the two start guards task 2.2 keeps apart from the
      derivation; an Integrating origin refuses as preflight refuses it, naming `arc reopen <origin>`, then for a
      retirement `arc deactivate <origin>`, and adding `--discard`, and an archived one terminally.
    - Edges compare by `edgeId` (§ 3.2): a changed edge is a different set or order of them, where today's rule
      compares whole edge arrays, so a dependent or provider renamed since carries, the fresh machine half replacing
      the stored one whole.
    - A changed source kind with unchanged units carries where the revised map still passes `source-shape` (§ 3.4),
      and otherwise reauthors at that rule's locus.
    - The result is canonical JSON: `{status: "carried", map}`, or `{status: "reauthor", reason, locus, starter,
      storedAuthoring}`, its reasons today's less `result-base`, which pinned Git — `source-identity` (the origin's slug
      or UID), `planning-profile`, `source-units`, `source-unit-ambiguous`, `incoming-edges`, `outgoing-edges`, and a
      failing decode rule's code.
    - Build `test-first` (one behavior at a time):
        - a changed `drop`-allocated unit, or an extraction-kept one, carries the authoring whole
        - a renamed dependent or provider carries, as does a stub origin started since, under a shape that takes it
        - an added or removed unit, a changed unit identity, a changed allocated unit or one under a repeated heading,
          a changed edge set or order, or a changed origin identity or profile returns the fresh starter and its first
          place
        - an Integrating origin refuses, naming `arc reopen <origin>`, then for a retirement `arc deactivate <origin>`,
          and `--discard`
        - the derivation's refusals refuse the re-binding as at preflight: an open conflict on the origin's meta or a
          source record, and an origin no member can be made from
        - over task 3.7's read-counting wrapper, the starter reads the `history` of the stored map and of each item a
          member's slug finds once, unchanged over long record histories and many unrelated work items
        - an item that took a gone member's slug and names the origin yields its incoming edge in the fresh machine half
        - `--revise` writes nothing

### `[ ]` **5.3 Apply a revision — § 9.2, § 9.3**

- _Goal:_ `--revise <cut-map>` previews and, with `--apply <authority>`, writes in one batch the difference between the
  stored map and the revised one — adding and removing stubs and cohort documents, moving retained members' seeded
  `Depends On` and `Cohort`, and replacing the stored map at its version — leaving unseeded edges and authored content
  as they stand.

    - `[ ]` **5.3.a Bind and check the revised map**

        - Decoded as § 3.4 decodes, its machine half equal to a fresh one taken as task 5.2 takes it; a cohort document
          the stored map created counts as the cut's for the Purpose rule.
        - Added stubs and documents pass task 2.4's name checks, and the revised map the rest of § 6 step 2's, a
          placement naming a cohort after the origin among them.
        - With no stored map, the revision refuses, naming `--execute <cut-map>` or `--extract <cut-map>`.
        - Build `test-first` (one behavior at a time):
            - a revised map that fails decode, or is version 3, refuses at the failing rule's locus, and one whose
              machine half differs from a fresh one refuses, naming `--revise`; each passes its checks once corrected
            - each of task 2.4's checks refuses at a revision as at the additive batch, and the checks pass once the
              map is corrected: a held name, a carried rule, an allocation into a file the operator may not edit, an
              existing home resolving to nothing, to completed work, or to an Errand, a `document` home, a started home
              taking an edge, an edge whose provider does not resolve, a Purpose against the rule, and a placement
              naming a cohort after the origin
            - a revised map adding a member that takes a slug the origin's own edge names refuses, and the revision
              lands once that edge is settled and the map re-bound through `--revise`
            - a cohort document the stored map created counts as the cut's for the Purpose rule

    - `[ ]` **5.3.b The batch**

        - Stubs added through task 2.5's writers, after task 2.5.a's copy checks, and removed whole as task 5.1.a
          removes them; cohort documents created or removed; each retained member's seeded edges, found by provider as
          § 8.3 finds them, and `Cohort` moved through `writeMetaDependsOn` and `writeMetaCohort`; and the stored map
          replaced at its version — under task 3.5's authority with the revision as its mode, revalidated and applied as
          task 5.1.a applies the discard.
        - The fresh machine half, the retained members, and the removals take their members from one run of task 3.1's
          member test, so each `history` is read once per run.
        - When the store refuses the batch, 5.3.a's checks run again against the store as it stands and report the
          first refusal they find; only when they find none does the store's refusal stand, a version conflict naming
          `--revise <cut-map>` for a fresh preview (§ 6, § 14).
        - Build `test-first` (one behavior at a time):
            - the preview writes nothing and lists each record the batch would write
            - a stale authority refuses, naming `--revise <cut-map>`, and a matching one lands exactly the previewed
              writes
            - over task 3.7's read-counting wrapper, the preview and the apply each read the `history` of the stored map
              and of each item a member's slug finds once, and the rest as task 3.7 counts, unchanged over long record
              histories and many unrelated work items
            - each kind of difference lands, and an unseeded edge stays
            - a stub the revision adds whose copy task 2.5.a refuses — a task list or notes with no title line, or a
              task list carrying a diagnostic the write checks report or a completed task — refuses, and the revision
              lands after each remedy
            - a member already gone that the revised map drops needs nothing, and an item that took its slug stays
              untouched
            - a retained member holding a stored map of its own takes its moved seeded edges, and its own cut's
              `--finish` then refuses, naming `--revise`
            - each terminal-batch refusal naming `--revise` passes `--finish` once the revision lands: a renamed origin
              (task 3.2.a); a home gone or shipped, or a member whose slug another item took (3.1); a dropped seeded
              edge, a `Cohort` changed on every member alike, or a member gone (3.2.b); a target locator left
              unresolved by a heading or ancestry change (3.3.a); a unit or edge added,
              changed, or removed (3.3.b); a started home's new edge or a provider ended since the additive batch
              (3.3.c); and an extraction origin activated or deactivated since, or a started dependent whose edge would
              leave it (4.3.a)
            - a name taken between the checks and the batch, through task 2.1.c's store wrapper within a type and across
              types, reports the held-name refusal
            - a version conflict the repeated checks do not explain names `--revise <cut-map>` for a fresh preview
            - with no stored map, `--revise` and `--revise <cut-map>` each refuse, naming `--execute <cut-map>` or
              `--extract <cut-map>`

    - `[ ]` **5.3.c What a revision refuses beyond the discard's**

        - A started member whose seeded field it would move, naming that change for the member's owner or the map's
          drop of it; a member renamed since, naming `arc rename <new> <old>`; a member gone that the revised map keeps,
          naming its removal from the map; and a revised placement keeping a cohort document the cut created under
          another `Parent`, naming another name for it.
        - Build `test-first` (one behavior at a time):
            - each refusal fires, and the revision lands after its remedy
            - task 5.1.b's refusals fire for a stub the revision removes, and the revision lands after each remedy

### `[ ]` **5.4 Refuse the discard and revision of a landed cut — § 8.7**

- _Goal:_ `--discard` and `--revise` on a landed cut, in either shape, refuse terminally, reporting it landed and
  naming its members as `--finish` reports them (tasks 3.6, 4.3).

    - Build `test-first` (one behavior at a time):
        - after a retirement's terminal batch and after an extraction's, `--discard` and `--revise` each refuse
          terminally, naming the members, and write nothing

### `[ ]` **5.5 Resolve a stored map conflicted by a sync — § 10**

- _Goal:_ Where two clones' additive batches each stored a map, `--finish` refuses on the conflict, naming `--discard`
  and `--revise`, which resolve it, keeping the current map.

    - The refusal reads the stored map's open conflicts (`read.conflicts`), since the store refuses no write to a
      conflicted record; task 3.1's acquisition calls it.
    - The sync files the conflict record in the origin's group (`storeConflicts`, `__tests__/helpers/store/merge.ts`),
      which the discard and the revision acquire and revalidate but never put; each names it in the `resolves` of the
      stored map's removal or replacement, which closes it.
    - Two reference stores share one memory remote (`createMemoryRemote`, `__tests__/helpers/store/sync.ts`), each
      syncing after its additive batch.
    - The other cut's stubs and cohort documents are stated outcomes, its stubs removed by `arc abandon <member>`.
      Where the two cuts share a member slug or a new cohort document's name, this backend's sync itself refuses
      `ambiguous-match` (`indexIdentities`, in `prepareReconciliation`), since each clone mints its own owner's UID
      (`canonicalReference`, `__tests__/helpers/store/model.ts`); the test asserts it as a stated outcome, and the
      clash at lookup that § 10 describes is the ref backend's.
    - Build `test-first` (one behavior at a time):
        - `--finish` refuses on the conflict, naming `--discard` and `--revise`
        - `--discard`, and in a second run `--revise <cut-map>`, resolves it, leaving no conflict record
        - two cuts sharing a member slug leave the sync refusing `ambiguous-match`, as do two sharing a new cohort
          document's name

### `[ ]` **5.6 Refuse abandoning an origin mid-cut — § 10**

- _Goal:_ `arc abandon` on an origin holding a stored map refuses through `lineage.cut-in-flight`, naming `--finish` and
  `--discard`, and succeeds after the discard, with no change to the abandon verb.

    - Through `runStoreAbandon`, unchanged.
    - An abandonment on a clone that has not pulled the additive batch lands, and after the sync its outcomes are
      stated, not refused. The members read back as stubs, each removed by `arc abandon <member>`, and the cut's new
      cohort documents stay open and empty. The reference backend keeps the stored map current under the ended owner
      (§ 8.5), readable by UID alone, so `--discard` and `--finish` report the store's refusal of the origin's slug.
    - Build `test-first` (one behavior at a time):
        - the abandonment refuses while the map is stored, and succeeds after the discard
        - the unsynced abandonment leaves the outcomes above

### `[ ]` **5.7 Discard and revision end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

## **Phase 6:** The dispatch and the flags

_Purpose:_ Reach the store version from `arc decompose` by one capability branch, and land the flags that start at the
flip, so the in-repo arm changes nothing a cut does.

_Mode:_ `slice` — closes on `arc decompose` routing every mode by capability.

_Exit criterion:_ Over the in-repo implementation every decomposition test passes unchanged, but for those the new
modes and their registrations change; no invocation reaches the store version; `--revise` and `--discard` refuse
`unsupported`, naming what serves until the flip; and `--finish` without its map refuses, naming `--finish <cut-map>`.
Through `handleDecompose` with an injected reference backend, a retirement runs `--preflight`, `--execute`, `--finish`,
and `--finish --apply`, its teardown step running through the seam the handler builds; `--advance-base` refuses
`unsupported`, naming `--finish`; and `--finish <cut-map>` refuses, naming `--finish` — every result and refusal
canonical JSON on standard output, with its reason and remedy on standard error.

### `[ ]` **6.1 Add the modes that start at the flip, refused by the in-repo arm — § 1.4, § 2, § 14, § 15**

- _Goal:_ `arc decompose` accepts exactly one of `--preflight`, `--execute <cut-map>`, `--extract <cut-map>`, `--finish
  [<cut-map>]`, `--revise [<cut-map>]`, `--discard`, or `--advance-base <cut-map>`, with `--apply` only beside
  `--finish`, `--revise <cut-map>`, or `--discard`; its help lists every mode; and the in-repo arm refuses each new form
  before today's code takes it.

- _Rationale:_ The input change alone does not typecheck: a bare `--finish` reaches the schema as `true`, which
  `v3DecomposeInvocation` and `finishGitV3Extraction` take as a path, and `--revise` and `--discard` would reach
  `v3DecomposeInvocation`'s throw outside the handler's `try`. So the input and its refusals land together.

- _Note:_ `cli.ts` serializes with `storage-ref-backend`, `seam-locus`, and `storage-projection` (§ 1.3).

    - `[ ]` **6.1.a The input and its routing**

        - `DecomposeCommandInputSchema` (`handlers/decompose.ts`), the mode keys and machine-readable keys
          (`decompose-command-routing.ts`), and the registration's schema fields; a bare optional-value flag reaches
          the schema as `true`, and a following `--apply` is not taken as its value.
        - Of today's tests, only `decompose-command-mode.test.ts`'s mode-key list and accept and refuse tables change.
        - Build `test-first` (one behavior at a time):
            - each new mode is accepted alone and refused beside another
            - `--apply` is accepted beside `--finish`, `--revise <cut-map>`, and `--discard`, and refused beside a bare
              `--revise`
            - every new mode keeps diagnostics machine-readable

    - `[ ]` **6.1.b The command's registration**

        - `cli.ts`'s `decompose` command with `--finish [cut-map]`, `--revise [cut-map]`, and `--discard`. Help ships
          before the flip, so each description covers both arms: what an existing mode does today and from the flip,
          and that a new one starts at the flip; the command's summary and `--apply`'s description widen to match.

    - `[ ]` **6.1.c The in-repo arm's refusals of the new forms**

        - One emitter in `handlers/decompose.ts` for the dispatch's own refusals and, from task 6.2, the store
          version's results and refusals: canonical JSON on standard output, and the reason and the remedy's text on
          standard error. Its refusal is `{status: "refused", reason, class, locus?, remedy}`, the remedy in the store's
          `RemedySchema` (`lib/store/refusal.ts`), whose `argv` is optional. `emitV3DecomposeRefusal` keeps today's
          modes, its `SpineRemedySchema` requiring an `argv` that these text remedies lack.
        - `finish` narrowed to its path before today's code takes it.
        - `--revise` and `--discard` refuse `unsupported`: "until the flip a rejected cut stays staged, or as its
          ARC-owned candidate, for explicit cleanup direction", today's rule for a rejected distribution
          (`decompose-work-unit.md` § 5). `--finish` without its map refuses, naming
          `arc decompose <origin> --finish <cut-map>` (§ 14).
        - Build `test-first` (one behavior at a time):
            - each refusal above, through the handler and the built CLI, as canonical JSON with its reason and remedy
              on standard error

### `[ ]` **6.2 Branch `handleDecompose` once on the capability — § 2**

- _Goal:_ `handleDecompose` reads `capabilities` from a store opened without an identity and branches once: the in-repo
  arm runs today's code for today's modes, and the arm from the flip builds the lifecycle executor and task 2.1.a's
  context and runs the store version for every mode but `--advance-base`.

    - `[ ]` **6.2.a The store seam**

        - The store opened as `handlers/plan.ts` opens it (`createStore(createDefaultStorePorts(...))`), which reports
          its capabilities with no I/O, and one `usesOffBranchState` branch.
        - `handleDecompose` takes `overrides: { store?, locusPorts? }`, as `handleStart` does (`handlers/start.ts`), so
          a test injects the reference backend and scripted locus reads.
        - The arm from the flip imports the store version lazily, so the in-repo arm loads no `lib/decompose/` module.
        - Build `test-first` (one behavior at a time):
            - over an injected store reporting `stateOffBranch: false` whose `read`, `list`, `lookup`, `write`,
              `batch`, and `history` all throw, each in-repo mode reaches today's adapter, mocked as
              `lifecycle-verbs.test.ts` mocks it, and the store is never called

    - `[ ]` **6.2.b The arm from the flip**

        - `VerbBase` built from the opened or injected store, the root, and the operator's identity
          (`resolveUserIdentity`), rather than through `resolveVerbBase`, which opens a default store of its own and
          refuses in the lifecycle verbs' envelope; a missing identity refuses through task 6.1.c's emitter.
        - The executor built as the lifecycle handlers build it (`buildExecutor`, `handlers/lifecycle-shared.ts`), and
          task 2.1.a's context from it and the base: teardown's store context and the checkout removal, as
          `handleStoreAbandon` passes them (`createStoreTeardownContext(base, executor)`, `removal: { exec }`,
          `handlers/abandon-store.ts`); the cohort template, read as today's handler reads it; the inbound grammar; and
          `branch.base`.
        - Each mode's map read once from its path and passed parsed beside that path (task 2.1.a), each mode routed to
          the store version, and its result or refusal emitted through task 6.1.c's emitter; no ROADMAP is claimed,
          rendered, or checked.
        - `--advance-base` refuses `unsupported`, naming `--finish`; `--finish <cut-map>` refuses, naming
          `arc decompose <origin> --finish` as a typed action.
        - Build `test-first` (one behavior at a time):
            - a retirement runs every mode through the handler over an injected reference backend
            - a started Planning origin's teardown step runs through the seam the handler built, over scripted Git
            - each refusal above
            - results and refusals emit as canonical JSON with their reason and remedy on standard error

    - _Note:_ A new unit file calling `vi.mock` joins `__tests__/helpers/isolated-unit-mock-files.ts`, which
      `isolated-mock-files.guard.test.ts` enforces. `lifecycle-verbs.test.ts` mocks `executor-context.js` and
      `node:fs/promises` whole, so the arm from the flip is tested in a file of its own.

### `[ ]` **6.3 The dispatch end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Nothing a cut does changes before the flip: every decomposition test passes over the in-repo implementation,
  unchanged but for the lists the new modes, the `cut-map` schema, and the cut-map kind join; the dispatch sends no
  invocation to the store version; `--revise` and `--discard` refuse `unsupported`, and `--finish` without its map
  refuses, each naming what serves; and the locator move leaves version 3's decode tests and the scanner's unchanged and
  passing.

- `[ ]` A retirement runs end to end on the reference backend — `--preflight`, `--execute`, authoring through
  write-back, `--finish`, and `--finish --apply` — the additive batch writing the members, their copies, the cohort
  documents with their Purpose, and the stored map in one batch, and the terminal batch writing `decompose` lineage
  carrying `retiredBranches`, removing the origin's primary and the stored map, rewriting stub dependents, writing home
  edges, and under `at-cap` appending the fan-out block in one batch; and the teardown step after it completes over the
  lineage record, as does `arc teardown <origin>` after that step fails.

- `[ ]` An extraction runs end to end on the reference backend: `--extract` and `--finish --apply` thin the origin's
  draft or spec to its kept units, set its `Cohort` to the members' path under every placement but `direct-member`,
  rewrite stub dependents, and remove the stored map, writing no lineage.

- `[ ]` A discard leaves the members only in `history`, and a revision adds and removes stubs and cohort documents,
  moves only seeded edges and `Cohort`, and replaces the stored map; after a changed origin, `--revise` emits the
  complete revised map when the only change is to the content of units allocated `drop` or, in an extraction, kept by
  the origin, or to the source kind, and otherwise a fresh starter with the stored authoring beside it and the first
  place to reauthor.

- `[ ]` Each refusal of § 14 fires where its condition holds and the cut completes after its remedy, the held-entry
  refusals under a supplied grammar; a stale apply authority refuses every removing batch; `lineage.cut-in-flight`
  refuses abandoning an origin holding a stored map, and an abandonment after the discard succeeds; and `--finish` on a
  landed cut, in either shape, reports it landed. The records § 10's races leave are stated outcomes, outside this
  criterion.

- `[ ]` A cut's reads stay flat: over the reference backend each batch reads the origin's group, the selected cohort
  documents, the existing homes, and the dependents the listing names a fixed number of times each, and the `history` of
  the stored map and of each item a member's slug finds once per run, none of those counts growing with the repository's
  history, and nothing from Git but the locus reads of § 11.

- `[ ]` The kind and schema are registered: `work-item/cut-map` passes the store's conformance suite as a registered
  kind, the in-repo implementation refuses its writes `unsupported`, and `arc schema get cut-map` publishes version 4
  beside `decompose-cut-map` version 3.

- `[ ]` The ratchet holds: at landing no `store-raw-state`, `surface-names`, or `work-unit-paths` count in
  `eslint-suppressions.json` exceeds its count at the final merged base, in total or per file; no module under
  `lib/decompose/` holds an entry; and `npm run -s lint:ts` passes with no suppression added for a new violation.

- `[ ]` The store version imports no module the deletion pass removes: no module under `lib/decompose/` imports a
  module § 1.5 and § 13 leave to the in-repo arm.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

- `[ ]` Destination conservation follows ordinal locator resolution: a target locator that no longer resolves refuses,
  naming its allocation and a revision; an earlier matching heading that takes the saved ordinal passes, as does an
  authored body change that leaves the locator resolvable. Retirement and extraction use the same rule, and a revision
  can name a different current target locator.
