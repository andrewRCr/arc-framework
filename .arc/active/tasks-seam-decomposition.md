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

### `[x]` **1.5 Add `lineage.cut-in-flight` — § 10, § 17.2**

- _Goal:_ Creating `abandon` lineage for a work item whose `work-item/cut-map` record is in the batch's before-state
  refuses, naming `arc decompose <origin> --finish` and `--discard`, so no abandonment strands a cut's members.

- _Outcome:_ `lineage.cut-in-flight` reads the exact owner's cut-map singleton in the batch's before-state and
  refuses new abandonment with finish/discard remedies, preserving unavailable-read conditions. It aggregates with
  branch-snapshot violations independently of inbound grammar and leaves other transitions and existing lineage alone.

## **Phase 2:** Preflight and the additive batch

_Purpose:_ Read an origin through the store, emit its starter map, and store a completed map with its members and new
cohort documents in one additive batch — the first half of a cut, over records alone.

_Mode:_ `slice` through Phase 3 — closes on a retirement run end to end over the reference backend.

_Design decisions:_ Every batch is tested over `createLifecycleHarness`'s reference backend with the production kind
registry, so the kinds' write checks judge each batch, and a hand edit is a write under `write-back` provenance
(`HAND_EDIT_VERBS`). Each task builds its own rows of § 14; `notes-seam-decomposition.md` § Refusal coverage maps every
row to the tasks that build it.

### `[x]` **2.1 Build the store version's context and refusals — § 13, § 14**

- _Goal:_ Every mode of the store version takes one context and returns one typed result or refusal whose remedy says
  whether it is terminal and names the command that repairs it — a typed action where running it as given repairs the
  condition, its text where the repair needs the operator's input.

    - `[x]` **2.1.a The context**

        - `DecomposeContext` binds all modes to the lifecycle executor's store and Git seam, with identity, cohort
          template, inbound grammar, removal, teardown, and base branch. `DecomposeMapInput` carries parsed JSON
          and its original path operand.

    - `[x]` **2.1.b The refusal vocabulary**

        - Added typed result/refusal schemas with domain reasons, recoverable/terminal classes, optional loci, and
          text or executable remedies. Store refusals ride whole with matching class and remedy enforced.
        - Stored-map finish, revision, and discard argv builders use the retained renderer; batch provenance names
          `decompose` with its additive, terminal, discard, or revise action.

    - `[x]` **2.1.c Test support**

        - `createDecomposeHarness` seeds renamed identities, terminal lineage, completed work units, open/completed
          cohorts, and write-back edits through production writers and checks. `withCompetingBatch` injects one
          competing write before native batch admission, or an explicit refusal for cross-type name races.

### `[x]` **2.2 Preflight an origin through the store — § 5, § 3.2**

- _Goal:_ Preflight derives an origin's machine half from the store alone — its primary, its whole artifact group, and
  the dependents the complete lifecycle listing names — reading nothing from Git, and refuses an origin no cut can
  start from, naming the repair.

    - `[x]` **2.2.a Acquire the origin**

        - `acquireDecomposeOrigin` resolves the primary and whole record group through the store, retains projected
          source basenames and the stored-map observation, and requires a complete lifecycle inventory. Inventory
          failures retain their repair as recoverable refusals; incoming candidates omit supplied member UIDs while
          preserving the full inventory for other checks.

    - `[x]` **2.2.b The source kind, units, and profile**

        - `deriveDecomposeSource` derives source kind from state and placement and scans all planning artifacts or
          only an Active origin's design. Units carry version-4 locator identities, byte digests, and canonical order.
          `decomposePlanningProfile` follows Design alone and validates its artifacts and optional Task List; pause
          and incidental artifacts leave source selection unchanged.

    - `[x]` **2.2.c The edges**

        - Acquired edge observations resolve incoming aliases by origin UID, omit completed dependents, and preserve
          replacement generations while excluding cut members. Outgoing providers resolve through live aliases or
          terminal lineage and retain slug identity for absent/ambiguous resolution; other store refusals ride whole.
          `deriveDecomposeEdges` projects the observations into stable, canonically ordered machine edges.

    - `[x]` **2.2.d What preflight refuses**

        - Added separate stored-cut/inbound start guards, shared scaffold prerequisites, and source-conflict repairs
          naming every token and subject. Origin meta conflicts are reported before generic inventory failure; the
          conflict remedy stays paired with command registration. Source/profile/state failures name their repairs.
        - `deriveDecomposeMachine` authenticates the complete acquired source and edge facts without I/O and reports
          duplicate provider-generation aliases at Depends On for repair before retry.

### `[x]` **2.3 Emit the starter map — § 5, § 3.3**

- _Goal:_ `--preflight` returns the machine half with an author slot for every authoring decision, as canonical JSON,
  writing nothing.

- _Outcome:_ `preflight.ts` composes fresh acquisition, new-cut admission, and pure machine derivation into canonical
  starter JSON. Repeated reads preserve identical bytes, every record's history, and the store state version.

### `[x]` **2.4 Bind the completed map and check it before writing — § 6, § 7**

- _Goal:_ `--execute` and `--extract` read the completed map once, bind it to a fresh preflight, and refuse before any
  write, naming the repair, every map whose batch the store would refuse or whose result the design forbids.

    - `[x]` **2.4.a Read and bind**

        - `bindDecomposeMap` decodes completed maps, repeats fresh admission, and binds the complete machine. Unsupported
          and stale maps name a fresh preflight; flag corrections retain the exact map operand in typed argv.
        - Held entries, source conflicts, and a stored cut refuse again at binding and admit the same map after repair.

    - `[x]` **2.4.b Names — D14**

        - `checkDecomposeNames` rejects live holders, former slugs, duplicate map names, and new cohort names held by
          completed cohorts or the origin. A member may reuse a completed cohort's name.
        - Full-path cohort observations distinguish reused open documents from new documents, including subcohort
          parents; unreadable inventory preserves its repair instead of implying availability.

    - `[x]` **2.4.c Allocations and homes — § 7**

        - `checkDecomposeHomes` resolves current or former home slugs to open work units, retaining canonical primary
          records and started/ownership facts. Missing, completed, Errand, and document destinations name another home.
        - Allocation rights protect started meta and task lists and all files another person has started. Owned prose,
          companions, and another person's stub pass before target authoring; store failures retain their full repair.

    - `[x]` **2.4.d The map's conservation and topology — § 13**

        - Pure allocation, topology, and dependency rules retain the carried conditions and authored loci, with complete
          locator identity, canonical home identities, parsed Parent checks, and the surviving extraction constituent.
        - Record acquisition and ordered contributions feed a UID-keyed dependency projection for member seeds, stub
          dependents, and homes. Slot replacement preserves unrelated order and aliases; terminal projection writes
          only stub dependents and stub homes, leaving existing member seeds and started recipients alone.

    - `[x]` **2.4.e Edges the cut writes**

        - Provider checks admit planned member generations and completed providers while protecting started homes and
          extraction dependents. Reused original provider names require owner settlement and a fresh preflight or revision.
        - The read-only slug-settlement plan retains dependent versions and prior provider generations, recursively follows
          lineage and authenticated former names, and discharges satisfied providers. Protected, unmapped, ambiguous, cyclic,
          or self-dependent edges stay outside the plan for the store's slug guard.

    - `[x]` **2.4.f Purpose**

        - `checkDecomposePurposes` requires a substantive Purpose for each new cohort document and refuses Purpose fields
          for reused documents, with independent parent and child decisions and exact map loci for addition or removal.

### `[x]` **2.5 Write the additive batch — § 6, § 12, § 13**

- _Goal:_ One batch writes a cut's members, their copies, its new cohort documents with their Purpose, the settling of
  every edge the members' slugs trip, and the stored map with expected absence, removing nothing, and the verb reports
  what it wrote with each destination's authoring requirements and the next step.

    - `[x]` **2.5.a Members and their copies**

        - `planDecomposeMembers` prepares expected-absence member metadata and design copies for all three profiles,
          preserving inherited source fields and canonical companion identities while seeding cohort, edges, and workflow.
        - `copyDecomposeArtifact` retitles only the first line and copies task lists or notes only where allocated.
          Missing titles, task-list diagnostics, and completed tasks refuse at the source artifact; deferred tasks pass.

    - `[x]` **2.5.b Cohort documents — topology**

        - `planDecomposeCohorts` composes topology and Purpose checks with the cohort creation writer, creating missing
          parent and child documents together and returning shared placement facts for member scaffolds. Reused documents
          stay untouched; direct-member and at-cap placements create none, and at-cap fan-out remains terminal work.

    - `[x]` **2.5.c The settling and the map**

        - `prepareDecomposeAdditive` binds and checks the map, then composes member, cohort, settlement, and expected-absence
          map writes. `runStoreDecomposeAdditive` revalidates observations and applies the prepared lifecycle batch.
        - `decomposeSlugSettlementWrites` combines all prior-provider slots on a stub into one version-bound metadata
          rewrite. Started, held-cut, unmapped, and pause-only dependents remain for the registry to refuse atomically;
          choosing another slug or clearing the pause edge admits the repaired cut.

    - `[x]` **2.5.d The report**

        - The closed `DecomposeAdditiveReportSchema` reports exact landed record identities, each member and its copies,
          new cohort documents, and every destination's allocated source units, ownership, and target locators, including
          existing homes. Its typed continuation directs authoring followed by the stored map's finish preview.

### `[x]` **2.6 Recheck after the store refuses the batch — § 6**

- _Goal:_ When the store refuses the additive batch, the verb repeats its binding and checks against the store as it now
  stands and reports the first refusal they find, the stored-map refusal ahead of the held-name refusal, and only when
  they find none the store's own, a version conflict's remedy being the batch again as given.

- _Outcome:_ `recheckDecomposeAdditiveRefusal` repeats complete binding and admission, reporting a competing stored map
  ahead of name collisions across work-item and cohort namespaces. An unexplained version conflict retains its whole
  store refusal beside the exact execute/extract retry action; other unexplained store failures keep their own repair.

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

### `[x]` **3.1 Acquire the terminal batch's records — § 8.1**

- _Goal:_ The terminal batch reads each record it needs once, through the store, at its version — the stored map by the
  origin's slug, the origin's whole group, each member's meta, the cohort documents the map names, the existing homes,
  and the stub dependents the listing finds, the members left out — and keeps those versions as its guards.

- _Outcome:_ `acquireDecomposeTerminal` shares version-bound observations across the complete origin, members,
  cohorts, homes, and current stub dependents. `isDecomposeMemberBirth` authenticates each member's birth name and
  batch against the current map incarnation; only those owners leave the incoming scan, and each history is read
  once. Closed homes name `--revise`; a missing map names the additive modes.

### `[x]` **3.2 Check the origin's current kind and the seeded fields — § 8.2, § 8.3**

- _Goal:_ The terminal batch applies the shape's rules to the origin's current kind rather than the one the map
  recorded, and requires of each member only what the map decided — it exists, carries the map's `Cohort`, and still
  names each seeded provider, compared by owner — so grooming passes and divergence refuses, naming its restoration
  through write-back, and the revision only where one can make it legitimate.

    - `[x]` **3.2.a The origin's current kind**

        - `checkDecomposeTerminalOrigin` derives the current source kind and repeats the scaffold-source floor.
          Active retirements name deactivation, Integrating origins name reopening with shape-specific follow-up,
          archived origins name discard, and a renamed origin names revision at its current slug. Started stubs pass.

    - `[x]` **3.2.b The seeded fields**

        - `checkDecomposeSeededFields` compares provider owners and accepts the complete disposition of retirement
          or reconciliation, retaining its versioned proof records. `checkDecomposeMemberPlacement` requires the
          authenticated member's name and seeded Cohort; only a common admissible placement offers revision.
          Reverse renames and forbidden origin edges name their repairs; other member grooming passes.

### `[x]` **3.3 Check the content — § 8.4**

- _Goal:_ Every allocation resolves exactly once in its destination, every record of a retiring group is accounted for,
  the origin's rescan still matches the map's units and edges, the origin's inbound list holds no entry, and every edge
  the batch writes resolves — each failure refusing before anything is written, naming its repair.

    - `[x]` **3.3.a Conservation over records**

        - `checkDecomposeConservation` resolves complete saved locators against current member, home, and cohort
          records, retaining selected record versions and resolved content. Ordinal retargeting and authored bodies
          pass; unresolved locators name the allocation and revision. Source conflicts refuse through shared acquisition;
          an actual promoted origin retains its description outside the scanned content inventory.

    - `[x]` **3.3.b The origin bound by content**

        - `checkDecomposeSourceBinding` compares current-kind source IDs and digests and stable edge IDs, retaining
          member-generation exclusion and allowing unscanned edits. Shared inbound admission names every held entry;
          routing remedies now carry each entry's executable version rather than the enclosing record's version.

    - `[x]` **3.3.c Edges again**

        - `prepareDecomposeTerminalEdges` repeats started-recipient admission over authored contributions and validates
          actual terminal provider writes, with exact contribution loci and revision remedies. Member seeds remain
          outside terminal provider checks; native store failures retain their recovery information unchanged.

### `[x]` **3.4 Write the retirement through the lifecycle executor — § 8.5, § 11, § 12**

- _Goal:_ A retirement's terminal batch is the `decompose` transition's arm from the flip: after the removal check on
  any checkout holding the origin, one batch writes `decompose` lineage with `retiredBranches`, removes the primary and
  the stored map, rewrites stub dependents, writes stub homes' edges, and appends any at-cap fan-out block, every
  acquired record revalidated at its version just before it; then teardown's store arm removes or releases the
  checkout, leaving `arc teardown <origin>` where it fails.

    - `[x]` **3.4.a The lineage record**

        - `prepareDecomposeLineage` projects current generation-bearing successors, dependent dispositions, provider
          allocations, and exact retired branch links into a create-only record accepted by teardown. Renamed live and
          retired providers retain current names and proof records for revalidation; renamed dependents match by UID.

    - `[x]` **3.4.b The edges and the fan-out**

        - `prepareDecomposeRetirementRecords` combines stub-recipient edits, map removal, and cohort-kind fan-out
          append or reuse. Started dependents retain their edges; another cut's map survives its dependent's rewrite
          and detects the changed provider binding. Incoming self replacements, including aliases, refuse before
          additive writes; conflicting fan-out markers admit continuation after write-back repair.

    - `[x]` **3.4.c The checkout, the executor, and teardown**

        - `prepareDecomposeRetirement` composes terminal checks and marker-selected checkout admission. The executor
          removes the primary, revalidates selected records, and persists one terminal batch. Inventory refusals retain
          their repairs; version conflicts name a fresh finish preview. Teardown releases retained claims, preserves
          files and unlanded planning branches, and leaves an executable continuation after physical cleanup fails.

### `[x]` **3.5 Preview and apply under an apply authority — § 8.7**

- _Goal:_ `--finish` acquires, checks, and prepares the terminal batch, the removal check included, writes nothing, and
  reports the lineage record, the removals, and each record it would write with an apply authority; `--finish --apply
  <authority>` runs the batch only when a fresh preparation's digest equals it, refusing otherwise, naming `--finish`.

- _Outcome:_ `runStoreDecomposeFinish` prepares a read-only retirement preview and applies only a freshly matched
  authority. `decomposeApplyAuthority` binds the mode, origin generation, observed versions, and exact mutations in
  canonical order for every removing mode. Accepted grooming invalidates approval; current content and checkout
  refusals precede the comparison. Matching applies land exactly the previewed writes; batch conflicts require a fresh
  preview and approval.

### `[x]` **3.6 Report a landed cut from `--finish` — § 8.7**

- _Goal:_ `--finish` on a retirement that has landed reports it landed and names its members, found through the
  `decompose` lineage record a lineage lookup on the origin's slug finds (`{kind: "lineage", origin}`), rather than
  refusing for want of a stored map.

- _Outcome:_ `readDecomposeLandedRetirement` resolves terminal lineage and reports its recorded successors through
  `runStoreDecomposeFinish`. Repeated previews and applies write nothing. A live generation takes precedence over old
  lineage; no-map and abandoned origins retain their distinct refusals. Shared acquisition caches preserve normal-run
  observations while the executor still revalidates against the original store.

### `[x]` **3.7 Keep a cut's reads flat — § 8.1, Goal 7**

- _Goal:_ Each batch reads the origin's group, the selected cohort documents, the existing homes, and the dependents the
  listing names a fixed number of times each, and the `history` of the stored map and of each item a member's slug finds
  once per run, those counts unchanged by the records' history or by unrelated work items, and nothing from Git but
  § 11's locus reads.

- _Outcome:_ `createCountingStore` counts public read, list, lookup, and history requests while binding backend writes
  to their own view. A checked at-cap cut proves stable additive, preview, and apply counts under longer histories and
  growth in unrelated work, with exact terminal record-read budgets and one map/member history query per run. The
  scripted Git boundary admits no calls.

### `[x]` **3.8 A retirement end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ On merged main `9fe2f2f0d`, stub and started Planning retirements pass under cohort and at-cap placements
  through preflight, additive creation, authoring, preview, and apply. Each terminal batch writes exact lineage,
  removals, recipient edges, and any fan-out together. Teardown reads the lineage, completes a failed cleanup retry,
  releases retained claims without removing files, and repeated finish reports the recorded members.

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

### `[x]` **4.1 Run an extraction's additive batch — § 6, § 8.6**

- _Goal:_ `--extract` stores an extraction's map and members from a started Planning or Active origin that survives —
  its companions staying with it, members free to depend on it, and a dependent free to keep its edge on it — through
  the additive batch a retirement uses.

- _Outcome:_ The shared additive batch accepts started Planning and Active extraction origins, retains their content,
  metadata and companions, seeds member edges on the surviving origin, and admits a dependent keeping that edge. The
  verb refuses stub extraction and redistributed companions with repair-and-retry coverage; one new cohort member
  counts the surviving origin as its second constituent.

### `[x]` **4.2 Thin the origin's draft or spec over records — § 8.6, § 13**

- _Goal:_ The terminal batch derives the origin's retained bytes from the records it acquired, preserving the bytes of
  the units the origin keeps and removing a record that keeps none, as today's thinning plans it.

- _Outcome:_ `planDecomposeSourceThinning` scans acquired design records, resolves version-4 allocation identities by
  current locator, and concatenates only retained units without changing their bytes. Empty results remove their
  records; unchanged records and retained companions take no write.

### `[x]` **4.3 Write an extraction's terminal batch — § 8.6, § 8.7**

- _Goal:_ After the checks of § 8.2–8.4, one prepared batch — no lifecycle transition — thins the origin, sets its
  `Cohort` to the members' path where it differs, rewrites stub dependents, writes stub homes' edges and any at-cap
  fan-out, and removes the stored map, writing no lineage, and its preview reports the retained bytes and each record.

    - `[x]` **4.3.a The batch**

        - `terminal-preparation.ts` and `terminal-records.ts` share retirement's validation and recipient planner with
          extraction. `extraction.ts` revalidates all observations and applies only prepared thinning, cohort, edge,
          fan-out, and map-removal mutations in one batch, with no lineage or physical effects. All four placements,
          current scan and recipient boundaries, fan-out repair, and fresh-approval conflict remedies are covered.

    - `[x]` **4.3.b The preview and the landed cut**

        - `finish.ts` selects one acquired cut for retirement or extraction; extraction previews report retained
          artifact content and exact writes under the apply authority. Matching approval applies that batch; grooming
          and batch conflicts require a fresh preview. `landed-extraction.ts` reads the current UID's latest terminal
          map removal and historical member names, distinguishing discard and preserving native history failures.

### `[x]` **4.4 An extraction end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ On freshly merged main `e6856533f`, all four started Planning placements and an Active cohort extraction
  complete preflight, additive creation, authoring, preview and apply through the store entry points with no Git.
  Exact terminal batches retain kept spec bytes, remove the spec keeping no units and the stored map, set or keep the
  origin's cohort, redistribute stub edges, preserve companions and members, write no lineage, and report the cut landed.

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

### `[x]` **5.1 Discard a cut — § 9.1, § 9.3**

- _Goal:_ `--discard` previews and `--discard --apply <authority>` removes in one batch each stub still present as a
  whole group, the cut's new cohort documents, and the stored map, writing no lineage, and its preview lists each
  existing home and existing cohort coordination the map allocated to as left edited.

    - `[x]` **5.1.a The batch**

        - `discard-plan.ts` authenticates member generations and cohort births, acquires whole groups, and prepares
          exact removals with conflict closures. `discard.ts` previews existing destinations left edited, binds approval
          to observed versions and writes, revalidates, and applies one batch. Renames, slug reuse, real sync conflicts,
          history retention, stale approval, batch conflicts, and flat observation counts are covered.

    - `[x]` **5.1.b What a discard or revision refuses — § 9.3**

        - Shared removal guards protect started members, nested cuts, surviving dependency and pause edges, open cohort
          holders, and held inbound entries with per-entry routing versions. Surviving inventories apply prepared edits
          through the store's metadata parser and preserve incomplete-listing repairs. Each refusal admits its native
          remedy; removed groups and completed holders do not block the count.

### `[x]` **5.2 Re-bind a changed origin and emit the revision starter — § 9.4, § 9.2**

- _Goal:_ `--revise` writes nothing and returns either the complete revised map over a fresh machine half, where the
  only change is to the content of units allocated `drop` or, in an extraction, kept by the origin, or to the source
  kind, or a fresh starter with the stored authoring beside it and the first place to reauthor as a reason and a locus.
- _Outcome:_ Added canonical revision reports over one authenticated member pass and fresh source derivation. Rebinding
  preserves full authoring across compatible byte, kind, and renamed-edge changes, or returns the first changed binding
  beside fresh slots; source refusals retain their repairs and birth-history reads stay flat as stored histories grow.

### `[x]` **5.3 Apply a revision — § 9.2, § 9.3**

- _Goal:_ `--revise <cut-map>` previews and, with `--apply <authority>`, writes in one batch the difference between the
  stored map and the revised one — adding and removing stubs and cohort documents, moving retained members' seeded
  `Depends On` and `Cohort`, and replacing the stored map at its version — leaving unseeded edges and authored content
  as they stand.

    - `[x]` **5.3.a Bind and check the revised map**

        - `bindDecomposeRevisionMap` decodes and binds to fresh revision facts; `admitDecomposeRevision` repeats additive
          admission while allowing retained member names by authenticated reference and Purpose for cut-owned cohorts.
          Owned documents remain observed rather than recreated; invalid maps and stale facts retain revision remedies.

    - `[x]` **5.3.b The batch**

        - Added exact revision preview/apply batches with member and cohort differences, whole-group removal, conflict
          closure, and provider-aware seeded-field reconciliation. Retained content and unseeded edges stay authored;
          admission repeats after native failures, and terminal refusal repairs proceed through revision to finish.

    - `[x]` **5.3.c What a revision refuses beyond the discard's**

        - Added member-name, missing-generation, cohort-Parent, and started-seed guards with owner or map remedies.
          Revision exercises every shared removal boundary through refusal and native repair; when no retained member
          can receive held entries, its remedy first requires keeping a routing recipient in the map.

### `[x]` **5.4 Refuse the discard and revision of a landed cut — § 8.7**

- _Goal:_ `--discard` and `--revise` on a landed cut, in either shape, refuse terminally, reporting it landed and
  naming its members as `--finish` reports them (tasks 3.6, 4.3).
- _Outcome:_ Stored-cut acquisition shares finish's terminal evidence to refuse discard and both revision forms with
  the recorded member names. Live reused origin generations and discard history retain their missing-map refusal.

### `[x]` **5.5 Resolve a stored map conflicted by a sync — § 10**

- _Goal:_ Where two clones' additive batches each stored a map, `--finish` refuses on the conflict, naming `--discard`
  and `--revise`, which resolve it, keeping the current map.
- _Outcome:_ Independent checked clones reproduce map conflicts and native identity clashes. Finish refuses the
  conflicted map; discard and revision revalidate the conflict records and close them through the map subject alone.
  The unselected cut remains intact, its stubs abandon normally, and its empty cohort remains open.

### `[x]` **5.6 Refuse abandoning an origin mid-cut — § 10**

- _Goal:_ `arc abandon` on an origin holding a stored map refuses through `lineage.cut-in-flight`, naming `--finish` and
  `--discard`, and succeeds after the discard, with no change to the abandon verb.
- _Outcome:_ Real abandonment refuses through the registered lineage rule while the cut is stored and succeeds after
  discard. Independent clones reproduce unsynced abandonment: finish and discard preserve the native origin refusal,
  the UID-selected map remains readable, member stubs abandon normally, and the empty cohort stays open.

### `[x]` **5.7 Discard and revision end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.
- _Outcome:_ On merged base `6ca2459b9`, the checked-store scenarios close discard through history-only removals and
  successful abandonment, revision through exact member/cohort and seeded-field differences, and fresh authoring
  through carried or reauthoring outcomes after source changes. Independent clones resolve stored-map conflicts
  through either exit while preserving the accepted leftovers.

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

### `[x]` **6.1 Add the modes that start at the flip, refused by the in-repo arm — § 1.4, § 2, § 14, § 15**

- _Goal:_ `arc decompose` accepts exactly one of `--preflight`, `--execute <cut-map>`, `--extract <cut-map>`, `--finish
  [<cut-map>]`, `--revise [<cut-map>]`, `--discard`, or `--advance-base <cut-map>`, with `--apply` only beside
  `--finish`, `--revise <cut-map>`, or `--discard`; its help lists every mode; and the in-repo arm refuses each new form
  before today's code takes it.

    - `[x]` **6.1.a The input and its routing**

        - The schema, mode keys, and registration enumerate all seven modes, distinguish optional operands from bare
          flags, and restrict apply authority to finish, a revision map, or discard. Every mode keeps machine-readable
          diagnostics and rejects mixed selections.

    - `[x]` **6.1.b The command's registration**

        - Commander registers optional finish and revision operands and the discard flag. Help describes both storage
          arms and the expanded preview-authority forms.

    - `[x]` **6.1.c The in-repo arm's refusals of the new forms**

        - A shared outcome emitter preserves canonical JSON and reason/remedy diagnostics with optional remedy argv.
          New forms refuse before the legacy invocation is constructed; existing finish paths remain narrowed strings.

- _Outcome:_ The built command and handler agree on dormant-mode refusals, optional operands beside apply authority,
  and complete help. Existing repository-backed handler cases retain their behavior.

### `[x]` **6.2 Branch `handleDecompose` once on the capability — § 2**

- _Goal:_ `handleDecompose` reads `capabilities` from a store opened without an identity and branches once: the in-repo
  arm runs today's code for today's modes, and the arm from the flip builds the lifecycle executor and task 2.1.a's
  context and runs the store version for every mode but `--advance-base`.

    - `[x]` **6.2.a The store seam**

        - `handleDecompose` opens a lazy identity-free store or retains the injected store, branches once on its
          capability, and loads the store adapter lazily. Existing adapter cases use a tracked-state store whose
          operations all throw and retain their original refusal and retry behavior.

    - `[x]` **6.2.b The arm from the flip**

        - `decompose-store.ts` builds the operator base, production executor, inbound grammar, template, and cleanup
          context, reads map operands once, and routes every stored-cut mode through the shared outcome emitter.
          Additive output uses its closed authoring report; native refusals retain their class and recovery information.
          Handler scenarios retire and release a held Planning checkout, preserve its personal files, and exercise
          extraction, both revision forms, discard, identity repair, map repair, and typed finish continuations.

- _Outcome:_ Both capability arms run through the actual handler. A real temporary claim and scripted Git prove that
  the handler-built teardown context releases the held origin after terminal persistence without a continuation.

### `[x]` **6.3 The dispatch end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.
- _Outcome:_ On merged base `4f36aff63`, the installed CLI retains repository-backed decomposition and emits the
  dormant forms as canonical refusals. Injected checked-store handler scenarios cover every mode, typed continuations,
  and held-origin claim release through production cleanup; the complete decomposition unit and CLI suites pass.

## **Phase 7:** Verification

### `[x]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ Forced merge validation passed all 19 selected local checks, including both type checks, full
  lint, build, unit/integration suites, and ARC contracts. Three CI-only suites remain due before merge.
- _Success criteria:_ All 14 met, none superseded or unresolved. The final author report binds the complete work-unit
  span; one independent criteria pass and two fix-check rounds resolved the removal and retired-provider gaps. Evidence
  and the reference-backend proof boundary are in `notes-seam-decomposition.md` § Verification evidence.

---

## Success Criteria

- `[x]` Nothing a cut does changes before the flip: every decomposition test passes over the in-repo implementation,
  unchanged but for the lists the new modes, the `cut-map` schema, and the cut-map kind join; the dispatch sends no
  invocation to the store version; `--revise` and `--discard` refuse `unsupported`, and `--finish` without its map
  refuses, each naming what serves; and the locator move leaves version 3's decode tests and the scanner's unchanged and
  passing.

- `[x]` A retirement runs end to end on the reference backend — `--preflight`, `--execute`, authoring through
  write-back, `--finish`, and `--finish --apply` — the additive batch writing the members, their copies, the cohort
  documents with their Purpose, and the stored map in one batch, and the terminal batch writing `decompose` lineage
  carrying `retiredBranches`, removing the origin's primary and the stored map, rewriting stub dependents, writing home
  edges, and under `at-cap` appending the fan-out block in one batch; and the teardown step after it completes over the
  lineage record, as does `arc teardown <origin>` after that step fails.

- `[x]` An extraction runs end to end on the reference backend: `--extract` and `--finish --apply` thin the origin's
  draft or spec to its kept units, set its `Cohort` to the members' path under every placement but `direct-member`,
  rewrite stub dependents, and remove the stored map, writing no lineage.

- `[x]` A discard leaves the members only in `history`, and a revision adds and removes stubs and cohort documents,
  moves only seeded edges and `Cohort`, and replaces the stored map; after a changed origin, `--revise` emits the
  complete revised map when the only change is to the content of units allocated `drop` or, in an extraction, kept by
  the origin, or to the source kind, and otherwise a fresh starter with the stored authoring beside it and the first
  place to reauthor.

- `[x]` Each refusal of § 14 fires where its condition holds and the cut completes after its remedy, the held-entry
  refusals under a supplied grammar; a stale apply authority refuses every removing batch; `lineage.cut-in-flight`
  refuses abandoning an origin holding a stored map, and an abandonment after the discard succeeds; and `--finish` on a
  landed cut, in either shape, reports it landed. The records § 10's races leave are stated outcomes, outside this
  criterion.

- `[x]` A cut's reads stay flat: over the reference backend each batch reads the origin's group, the selected cohort
  documents, the existing homes, and the dependents the listing names a fixed number of times each, and the `history` of
  the stored map and of each item a member's slug finds once per run, none of those counts growing with the repository's
  history, and nothing from Git but the locus reads of § 11.

- `[x]` The kind and schema are registered: `work-item/cut-map` passes the store's conformance suite as a registered
  kind, the in-repo implementation refuses its writes `unsupported`, and `arc schema get cut-map` publishes version 4
  beside `decompose-cut-map` version 3.

- `[x]` The ratchet holds: at landing no `store-raw-state`, `surface-names`, or `work-unit-paths` count in
  `eslint-suppressions.json` exceeds its count at the final merged base, in total or per file; no module under
  `lib/decompose/` holds an entry; and `npm run -s lint:ts` passes with no suppression added for a new violation.

- `[x]` The store version imports no module the deletion pass removes: no module under `lib/decompose/` imports a
  module § 1.5 and § 13 leave to the in-repo arm.

- `[x]` All quality gates pass (tests, linting, type checking)

- `[x]` Ready for integration

- `[x]` Destination conservation follows ordinal locator resolution: a target locator that no longer resolves refuses,
  naming its allocation and a revision; an earlier matching heading that takes the saved ordinal passes, as does an
  authored body change that leaves the locator resolvable. Retirement and extraction use the same rule, and a revision
  can name a different current target locator.

- `[x]` Discard and revision refuse atomically when a surviving dependency or pause edge is introduced at batch
  admission, and complete after its owner repairs it; same-batch retargeting or removal discharges the edge (A2).

- `[x]` Renamed-then-retired providers resolve by authenticated identity without enumerating unrelated terminal
  histories in additive, terminal, or revision preparation; lineage lookup prefers exact current terminal names,
  refuses ambiguous former names, and preserves exact known provider UIDs (A3).
