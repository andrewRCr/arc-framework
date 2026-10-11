# Task List: Seam Record Kinds

- **Design:** `spec-seam-record-kinds.md`

---

## **Phase 1:** Registration and the write check

_Purpose:_ Prove the shared machinery end to end before any kind is built on it: a registration reaches both backends
— the in-repo implementation's reads and listings, and the reference backend's write path — and a registered check's
broken rule comes back as one refusal under the writer the backend derives.

_Mode:_ `slice` — closes on a registered check refusing a reference-backend write, and on in-repo meta reads decoding
through the production registration set.

_Exit criterion:_ In the conformance suite, the reference backend refuses a test registration's breaking write and
batch with `record-malformed` — the first rule in identifier order, the first breaking record in write order, the other
pairs counted — reads `write-back` and `save` as hand edits and any other verb as itself, shows a batch's check the
batch's other writes in `after` and the found state in `before`, and hands a stale write's check its merged content; the
in-repo fixture declares no checks and skips the item; every existing suite item passes over both fixtures; and in-repo
meta reads and listings return today's fields through the registry.

_Design decisions:_ The refusal is composed in one production module, `lib/store/write-check.ts`, which the reference
backend uses now and the ref backend will use from the flip; one implementation keeps the two from diverging on the
refusal's shape. A check awaits, so the reference backend runs its writes, batches, and syncs one at a time over a
shared state, and a racing write never lands between another's version check and its commit; a sync, which commits to
the remote state too, holds that state's queue only while it compares and publishes.

### `[x]` **1.1 A kind registration fills its kind's parser, check, and anchor slots — § 2.1, § 2.3, § 3.1**

- _Goal:_ A kind's registration — its parser, write check, and anchor declaration — installs into an isolated registry
  through `createKindRegistry`, and a kind with no registration keeps empty slots.

    - `[x]` **1.1.a Declare the write check's contract types**
        - Exported `WriteCheck`, `WriteCheckInput`, `StoreView`, and `BrokenRule` through the store index;
          the check carries both views, a provenance-derived writer, and optional prior parsed fields.
        - Exported `Remedy` beside `RemedySchema` and used it for each broken rule's correction.

    - `[x]` **1.1.b Take registrations in `createKindRegistry`**
        - Installed typed registrations into parser, check, and copied anchor slots; rejected duplicate kinds.
          `defineKindRegistration` checks anchor keys against opaque state-version fields before erasing the type.
        - Converted the in-repo and reference fixture's parser callers; registry tests cover isolation, duplicate
          rejection, and anchor types, and the store README describes all three slots.

    - `[x]` **1.1.c Add the per-worktree Git-directory root to the machine-local set**
        - Added the `git-worktree` root with `arc-checks/**` and verified its presence in the registry tests.

### `[x]` **1.2 In-repo meta reads and listings decode through the production registration set — § 1.2, § 2.2, § 11.1**

- _Goal:_ The in-repo implementation builds its registry from the one production registration set and decodes every
  meta it reads or lists through the registered parser, returning today's fields.

- _Note:_ What decodes through the registry before Phase 3, and what parses meta content outside reads and listings,
  is in `notes-seam-record-kinds.md` § Interim decode, Phases 1–3.

    - `[x]` **1.2.a Create the kind folders, the meta's registration module, and the production set**
        - Created the meta registration around today's parser and `PRODUCTION_REGISTRATIONS`, with the meta alone.
        - Added the kinds README and the store's pointer to the kind-owned parser, writer, and rule interfaces.

    - `[x]` **1.2.b Count the registration modules in the import ratchet**
        - Added the production set and meta registration to `RAW_STATE_MODULES` and documented the boundary.
        - Tests reject external value imports and admit store-owned imports of both registration modules.

    - `[x]` **1.2.c Build the in-repo registry from the production set**
        - `createInRepoContext` now installs `PRODUCTION_REGISTRATIONS`, replacing its inline meta parser.

    - `[x]` **1.2.d Decode in-repo meta reads and listings through the registered parser**
        - Routed tracked decoding and all three meta-source paths through the backend's registry, with fields typed
          `unknown`; registered parser failures keep read bytes and become malformed listing diagnostics.
        - An integration registration substitution exercises acceptance and rejection through the fixture's public
          store, alongside the unchanged tracked-read and lifecycle-index cases.

### `[x]` **1.3 A check's broken rules compose one refusal under the derived writer — § 3.2, § 3.4**

- _Goal:_ Given a write's provenance and every record's broken rules in write order, a backend that runs checks derives
  the writer and composes the one `record-malformed` refusal § 3.4 specifies, from one module every such backend uses.

    - `[x]` **1.3.a Export `HAND_EDIT_VERBS` and derive the writer from provenance**
        - Exported the two hand-edit persistence verbs beside provenance and added `deriveWriteCheckWriter`.
          Unit cases distinguish them from ordinary verbs, sync, and names merely sharing a prefix.

    - `[x]` **1.3.b Compose the refusal from every record's broken rules**
        - Added `composeWriteCheckRefusal`: chooses the first rule in UTF-8 byte order and its first breaking record
          in write order, preserving the condition and remedy and counting all other record/rule pairs.
        - Unit cases cover ordering, tied records, counts, single violations, and admission with no broken rules.

### `[x]` **1.4 The reference backend refuses a registered check's breaking write and batch — § 3.4, § 3.5, § 11.3**

- _Goal:_ The reference backend runs every registered check in `write` and `batch` over the state it found and that
  state with the whole write or batch applied, before committing, and the conformance suite proves it for every fixture
  declaring write checks.

    - `[x]` **1.4.a Declare write checks in the fixture contract and take a registry override**
        - Fixture declarations require `runsWriteChecks`; the reference declares it and the in-repo fixture declines it.
          Registrations accept an optional definition override, passed to the reference fixture's registry parameter.

    - `[x]` **1.4.b Run the registered checks in the reference backend's write and batch paths**
        - Async writes and batches check prepared stored content and both complete views before publishing, composing
          refusals through the shared helper. A queue per shared state also serializes reopened stores and sync.
          Remote publication holds its queue only for comparison and publication, after awaiting the hook.

    - `[x]` **1.4.c Add the write-check suite item**
        - Item 17 installs isolated checks and proves deterministic refusals, provenance-derived authority, complete
          batch views, and merged stale-write content. Fixtures without checks report reasoned skips; suite declarations
          and documentation now name seventeen items.

### `[x]` **1.5 Registered reads and checked writes hold end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion is shown by running the conformance suite over both fixtures and the in-repo
  store tests, with the scenario and its result recorded.

- _Outcome:_ Both conformance fixtures and every `store-*.test.ts` integration file passed the exit scenario:
  item 17 checks and refusal composition ran over the reference backend, the in-repo fixture reported its no-check
  skips, and registered meta reads and listings preserved their fields.

## **Phase 2:** The meta kind's schema and writers

_Purpose:_ Settle the meta — the most-written kind and the largest surface — as one typed layer: its rendering moved
into the kind folder, its schema carrying session context, one writer per field, today's setters delegating, and the
bullet-form fallback retired.

_Mode:_ `layer` — closes on the meta kind's schema and writers settled under today's bytes.

_Exit criterion:_ Every tracked meta, the five converted included, parses through the registered parser to its
base fields on today's keys; each writer leaves content outside its own lines byte-identical and every section inside
the field block intact; today's setters produce today's bytes outside § 5.6's corrections; a meta written without the
new fields renders byte-identical, parses with them at their defaults, and passes `toMetaRecord`; and no ratchet floor
grows.

### `[x]` **2.1 The meta's field descriptors and rendering move into its kind folder — § 1.2**

- _Goal:_ The meta's field descriptors, value formatting, rendering, and identifier-list parsing live under
  `lib/store/kinds/meta/`, which `meta-reader.ts` imports and re-exports, with no import cycle and no ratchet floor
  grown.

    - `[x]` **2.1.a Move the descriptors, formatting, and renderers**
        - `projection.ts` owns the descriptors, formatting, canonical renderers, and identifier-list helpers with their
          types. The meta reader imports and re-exports them; the existing rendering and parsing behavior is preserved.

    - `[x]` **2.1.b Move the line-level reading the writers share with the parser**
        - `line-reading.ts` owns core-table cells and bullet extents, shared by parsing and writers. It joins the
          raw-state import boundary; the meta reader retains its public exports and the kind documentation names it.

    - `[x]` **2.1.c Narrow the two boundary rows**
        - The meta reader admits public meta kind imports while rejecting its registration and other store imports.
          Identifier-list calls are permitted inside the kind folder; the five verb modules retain their symbol ban.

    - `[x]` **2.1.d Confirm the floors**
        - All three ratchet baselines retain their merged-base totals and per-file counts. `META_PREFIX` remains with
          the filesystem reader, and the moved modules introduce no surface-name literal.

### `[x]` **2.2 The meta schemas carry the handoff fields, sections, and state-version anchor — § 2.1, § 5.2, § 5.5**

- _Goal:_ `parseMetaRecord` returns the three handoff bullets and the three sections on new keys, both meta schemas
  admit them together, and a meta without them renders and parses exactly as today.

    - `[x]` **2.2.a Add the keys to both schemas, the label map, and the validation surface**
        - Both semantic schemas default the six handoff and section keys; the tolerant session type keeps authored
          text and the durable type admits planning or execution. Empty section bodies remain valid strings.
        - The projection defaults the three handoff labels. Their descriptors keep the label map aligned, and the
          validation-surface corpus covers complete handoff records and the durable refusal of unknown session types.

    - `[x]` **2.2.b Parse the handoff bullets and the sections**
        - The handoff group renders after Next Action and omits absent values. The parser lowercases recognized session
          types and preserves other authored text for the durable schema's refusal.
        - Shared line reading returns trimmed section bodies in file order, including empty bodies; sections inside the
          field block stop at its closing rule. Existing full-layout bytes remain unchanged without handoff values.

    - `[x]` **2.2.c Declare the meta's anchor field**
        - The registration installs `stateAtHandoff` as its sole anchor, checked against the parser's branded
          state-version output type and exposed through the production registry.

### `[x]` **2.3 One typed writer per meta field and section — § 5.4, § 5.5, § 5.6**

- _Goal:_ Every meta field and section has one exported writer that takes its typed value, renders its canonical form,
  and touches only its own lines.

    - `[x]` **2.3.a Write the core-table writers**
        - Five typed writers render the core cells canonically, including the Branch and unresolved Class/Priority
          sentinels. They preserve the table's line endings and every byte outside its three rows.

    - `[x]` **2.3.b Write the bullet writers**
        - Eighteen typed writers replace only their own bullet spans or insert in field order; the shared renderer
          preserves canonical identifier wrapping, sentinels, marker prefixes, and source line endings.
        - Clearing an optional field removes its lines, while Next Action clears to `—`. The Promotion Receipt writer
          sets an absent receipt and refuses changing or removing a present one; every section remains intact.

    - `[x]` **2.3.c Write the Session Context section writer**
        - The writer inserts, replaces, clears, or removes the complete body while preserving other fields, sections,
          and source line endings. A missing section inserts before the field block's other sections or closing rule.
        - Body lines that delimit a section are refused, including boundaries inside a code fence. Field-like markers
          in section prose are excluded from the bullet writers' managed region.

    - `[x]` **2.3.d Write the title writer, settle the creation writer, and fail loudly on an unanchored meta**
        - The public writer module exposes the field, section, title, and creation writers. The title writer changes
          only the H1; creation inputs omit the three section keys, enforced by compiler assertions.
        - Every content writer requires the H1 and closing rule before inspecting its own field. Core-table writes
          operate inside those anchors, and an absent field never masks a missing-anchor error.

### `[x]` **2.4 Every bullet-form meta and unanchored test fixture takes the core table — § 5.1, § 5.6, § 12**

- _Goal:_ No tracked meta and no test fixture builds a meta in the bullet form or with no H1, and no fixture hands a
  setter one with no closing `---`, so neither the setters' throw on an unanchored meta nor the fallback's retirement
  changes any test's outcome but the tests of those behaviors.

    - `[x]` **2.4.a Convert the five archived bullet-form metas**
        - The five archived metas use the core table. Parsing each before and after returns the same complete field
          record; absent historical Class and Priority values render as `—` and remain semantic nulls.

    - `[x]` **2.4.b Convert the test fixtures, batch by batch**
        - Ordinary fixtures carry the H1, core table, and closing rule; fallback and malformed-table cases retain
          their intended shapes. The E2E guard probe also found review-chunking's H1-only delivery fixtures.
        - The compatibility fixture uses the core State setter, and its attestation fixtures carry default-valued
          bullets so the legacy reconcile leaves their Candidate bullet intact.

### `[x]` **2.5 Today's setters delegate to the writers, with the named corrections — § 5.6**

- _Goal:_ Today's eleven setters keep their signatures and delegate to the writers, producing today's bytes and
  failures everywhere except § 5.6's named corrections, each of which a test states.

    - `[x]` **2.5.a Delegate the core-table and title setters**
        - Core and managed-title setters delegate to typed writers; every setter refuses a missing closing rule,
          and core setters and normalization refuse a missing H1. Normalization keeps authored cell tokens intact.
          Existing setter cases remain unchanged, including CRLF title bytes and managed-heading refusal.

    - `[x]` **2.5.b Delegate the bullet setters, with the wrapping, insertion, and `Next Action` corrections**
        - Generic, workflow, and design setters adapt preformatted values to typed bullet writers, wrapping lists and
          inserting absent fields in order. Generic Promotion Receipt updates remain refused before delegation.
          Deactivate, reopen, archive, and Shipped attestation render their cleared Next Action as `—`.

    - `[x]` **2.5.c Fix `reconcileMetaFields`' section deletion, and stop the candidate and finalize backfills**
        - Reconciliation inserts only missing renderable bullets, preserving present fields and internal sections;
          omitted optional fields are not reported as backfilled. Candidate writes only its bullet, and finalize
          writes only PR URL and Completed in field order, including a partial group before an internal section.

    - `[x]` **2.5.d Run every setter caller's tests**
        - The complete unit/integration lane covers all ten calling modules, and the full end-to-end tier covers
          session-init, delivery-position, and session-envelope compatibility. Both pass with changes confined to
          the named setter corrections.

### `[x]` **2.6 The flat-bullet fallback retires — § 5.1, § 11.2**

- _Goal:_ `parseMetaRecord` refuses a meta without an H1 or a core table, the in-repo creation admission refuses one,
  the advisory readers still degrade on a bad meta without throwing, and every tracked meta parses to its base fields.

    - `[x]` **2.6.a Give the advisory readers an empty record**
        - The meta kind exports a fresh schema-validated empty parsed record through meta-reader. In-flight degraded
          candidates and ready-mine's malformed planned metas use it without parsing empty bytes, preserving their
          advisory outcomes and the existing raw-state import counts.

    - `[x]` **2.6.b Retire the fallback**
        - The parser refuses a missing H1 or core table; empty cells and advisory degradation remain readable.
          Creation admission rejects without writing bytes and accepts repair; pre-commit reports the parser message.
          Marker consumers locally supply Markdown metadata without changing shared JSON conformance fixtures, and
          archive resolution uses a valid PR-less meta. Legacy-core cases assert refusal and comments describe tables.

    - `[x]` **2.6.c Confirm every tracked meta parses to its base fields**
        - The in-repo listing is complete with no diagnostics across all 259 tracked metas. Registered fields and
          the current parser agree; on identical bytes, today's keys equal the merged-base parser's values. The five
          converted archives also preserve their original base values. The full suite and E2E lane pass.

## **Phase 3:** The lineage record's final shape

_Purpose:_ Move the lineage record to its final shape across every module and test that produces or reads it, and
convert the tracked records, in one replication over an enumerated surface.

_Mode:_ `replication` — closes on the enumerated producer and reader surface exhausted and batch-verified.

_Exit criterion:_ Every importer of the lineage record's type, schema, or codec and every reader of its fields — the
surface enumerated in `notes-seam-record-kinds.md` — produces and reads schema version 2; the 14 tracked records parse
and round-trip byte-identical through the kind's writer; the live transition-record test and every reader's tests
pass; and no ratchet floor grows.

_Design decisions:_ The batches follow `notes-seam-record-kinds.md` § Lineage surface. The kind folder replaces
`lib/work-unit/transition-record.ts`, and every importer imports from it; no re-exporting module stays behind. The
record's type and bytes pass from producers through the store and the enumeration to every reader, so no batch compiles
and passes alone: the kind lands first, and Task 3.2's batches land together as one commit. No reader of version 1 is
written.

### `[ ]` **3.1 The lineage kind's final shape, parser, and canonical writer — § 7.1, § 7.2**

- _Goal:_ `lib/store/kinds/lineage/` defines schema version 2 with its invariants, a parser refusing what the schema
  rejects, one create-only writer whose output round-trips byte-identical, and the kind's registration, ahead of any
  caller.

    - `[ ]` **3.1.a Define the final shape and its invariants**
        - `LineageRecord` and `WorkItemRef` as § 7.1 states them: `origin`, `successors`, `incoming`, and `outgoing`
          each carrying a name and an optional UID (`z.uuid()`, as `OwnerIdentitySchema` holds one).
        - The invariants carried over from `TransitionRecordSchema` and the added `outgoing` rules: present exactly on
          a decomposition, prerequisites unique, each one's members unique and ordered by name; no member checked
          against `successors`.

    - `[ ]` **3.1.b Build the parser, the writer, and the registration module**
        - The parser decodes the JSON and refuses a record the schema rejects, as `parseTransitionRecord` does; a public
          pure function in the kind folder.
        - The writer renders canonical JSON (`canonicalize`), ordering `successors`, `incoming` by dependent,
          `outgoing` by prerequisite, and every reference list by name in UTF-8 byte order.
        - The kind's registration module builds its registration through `defineKindRegistration`, joins
          `RAW_STATE_MODULES` as the meta's does, and stays out of `registrations.ts` until Task 3.2.c, since a
          registered parser decodes ahead of `decodeTrackedContent`'s lineage branch; the parse and write functions
          stay unlisted (§ 1.2).
        - Build `test-first` (one behavior at a time):
            - each invariant refuses its breaking record and admits its valid counterpart
            - `outgoing` refuses on a rename or abandonment and admits on a decomposition, empty included
            - the writer orders every list and round-trips byte-identical
            - `schemaVersion` 1 is refused
            - the registration's parser returns the record, and a failure carrying the schema's issues

### `[ ]` **3.2 Producers, the store, and every reader take the final shape with the records — § 7.3–§ 7.5, § 11, § 12**

- _Goal:_ Every module and test on the enumerated surface produces and reads schema version 2, the 14 tracked records
  are version 2, and `lib/work-unit/transition-record.ts` is gone, landing as one commit with every gate green.

- _Note:_ The subtasks are one increment, reviewed and committed at this parent: no state between them compiles and
  passes. Run them in one session where the surface allows; a handoff before they close leaves the work uncommitted.

- _Context:_ `rename` stays in the kind until the flip, so rename's readers keep reading rename records (§ 7.5). From
  this commit until landing, this checkout reads the base's version 1 records with the new codec, so session start
  surfaces that the user-reference reconcile cannot establish the base's authority (§ 12); that is expected. Delivery's
  plan resolution reads them too, so while any delivery plan is stored, this checkout's pre-publication reservation
  (`selectPrePublicationReservationTarget`) cannot resolve until landing; none is stored today.

    - `[ ]` **3.2.a Move the producers**
        - `createDecomposeTransitionRecord` (`decompose-transition-record.ts`) derives `outgoing` from the cut map's
          outgoing dispositions (`authoring.outgoingDispositions`, by edge against `machine.outgoingEdges`), each
          prerequisite with the destinations taking it, and builds `incoming` from today's edges.
        - Base advancement (`git-decompose-transition-base-advancement.ts`) serializes through the kind's writer;
          `terminal-transition-record-writer.ts`, `verbs/abandon.ts`, and `verbs/rename.ts` build version 2 records.
        - The Producers batch's tests move with them, `decompose-transition-record.test.ts` gaining a case for
          `outgoing` across a heterogeneous cut naming an existing work unit.

    - `[ ]` **3.2.b Move the store's write path**
        - `writeContent` (`lib/store/in-repo/write-codec.ts`) validates a lineage record through the kind's parser in
          place of `TransitionRecordSchema`, binds its own key through `origin.name`, and serializes it through the
          kind's writer; `write-stores.ts` and `transition-record-store.ts` store the new shape.

    - `[ ]` **3.2.c Register the kind, and move the store's reads and lookup**
        - The lineage registration joins `registrations.ts`, and `decodeTrackedContent`'s lineage branch
          (`lib/store/in-repo/read-codec.ts`) goes: the registered parser decodes the record, and the decode narrows
          its output with the kind's schema to read own-key evidence from `origin.name`, as the Candidate and
          integration-boundary branches read theirs, so `identity-mismatch` holds.
        - `lookupTracked`'s rename walk and lineage lookup (`lib/store/in-repo/lookup.ts`) parse through the kind's
          parser and read `successors[0].name` and `origin.name`.
        - The Store batch's tests and fixtures move with them, the in-repo fixture and recovery helpers seeding
          version 2 records.

    - `[ ]` **3.2.d Move the enumeration and the disposition query**
        - `transition-record-enumeration.ts` and `transition-disposition-query.ts` parse and read version 2,
          `incoming` for today's `edges`; the Query batch's tests move with them.

    - `[ ]` **3.2.e Move the reconcilers, decomposition's operation, and the ROADMAP assert**
        - `reference-reconcile.ts`, `decompose-v3-operation.ts`, and `roadmap-regeneration-assert.ts` read version 2;
          the Reconcilers, Decomposition, and Status batches' tests move with them.

    - `[ ]` **3.2.f Confirm the derived-type consumers and move the delivery and lifecycle tests**
        - The consumers listed in `notes-seam-record-kinds.md` § Lineage surface compile and pass unchanged, or join
          the batch of the module whose derived type changed.
        - The Delivery, lifecycle batch's integration and end-to-end tests build version 2 records.

    - `[ ]` **3.2.g Convert the 14 records, move the live test, and remove the old codec**
        - Each record under `.arc/system/.internal/transitions/` takes the new shape through the kind's writer, its
          references carrying names and no UID.
        - `outgoing` for the two decomposition records derives from each origin's `Depends On` immediately before its
          cut, read from history: `chunked-delivery`'s `review-chunking`, which no member took, and `storage-seam`'s
          two prerequisites.
        - Verified by parsing before and after: origin, kind, successors, and edges read as `incoming` are unchanged;
          no verification script ships.
        - `live-transition-records.test.ts` parses every tracked record through the kind's parser and round-trips it
          byte-identical through the kind's writer.
        - `lib/work-unit/transition-record.ts` is deleted, no importer left.

    - `[ ]` **3.2.h Run the gates over the whole switch**
        - `npm run -s lint:ts` with no ratchet count grown, both type checks, `npm test`, and `npm run -s test:e2e` for
          the end-to-end batches pass before the commit.

### `[ ]` **3.3 Every producer and reader is on the final shape** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion is shown against the enumerated surface — every listed module and test on
  version 2, the live test green, and `lint:ts` floors unchanged — with the scenario and its result recorded.

## **Phase 4:** The task-list, draft, spec, and companion kinds

_Purpose:_ Register the remaining Markdown kinds' parsers and the task list's writers, so in-repo listings return their
parsed fields.

_Mode:_ `layer` through Phase 6 — closes on every registered kind's parser, writers, and check settled.

### `[ ]` **4.1 The task-list kind: parser, marker writer, and delivery-plan splice — § 6.1–§ 6.5**

- _Goal:_ The task list registers a parser that reads its header's `Design` and refuses nothing a stored list holds,
  and exports the close verb's marker writer and the delivery plan's splice, which delivery's renderer calls, each
  changing only its own lines.

- _Context:_ `lib/task-list/` stays the kind's public parsing library: the cursor (`resolveTaskListCursor`) and the
  other derived views stay where they are, and readers run them over the content a read returns.

    - `[ ]` **4.1.a Register the task-list parser**
        - `{ design: string | null }`: the filename in the header's `- **Design:**` bullet above the first phase
          heading, backticks stripped, or `null` when absent; the parser never refuses.
        - The kind's registration module builds its registration through `defineKindRegistration` and joins
          `RAW_STATE_MODULES`, as the meta's does; the registration joins `registrations.ts`.
        - Build `test-first` (one behavior at a time):
            - the header's `Design` parses with its backticks stripped
            - a `Design` line below the first phase heading is not read
            - a list with no `Design` parses to `null`
            - a list today's scanner rejects still parses
            - a task list read and listed through the in-repo fixture's store carries its parsed `design`

    - `[ ]` **4.1.b Write the marker writer**
        - Sets `[x]` or `[~]` on one task line named by its identifier — a parent heading or a subtask bullet — found
          among `scanTaskListStructure`'s task lines, so a fenced example and the delivery-plan region are never
          touched, and changes nothing else.
        - Throws when the scanner rejects the list, when the identifier names no task line or more than one, or when
          the result fails the scanner, as a parent completed above an open subtask does.
        - Build `test-first` (one behavior at a time):
            - only the named line's marker changes, on a parent and on a subtask
            - a task-shaped line inside a fenced block is not matched
            - an identifier naming no task line, or two, throws
            - a list the scanner rejects throws
            - completing a parent above an open subtask throws

    - `[ ]` **4.1.c Move the delivery-plan splice into the kind**
        - The region logic of `replaceDeliveryPlanSection` (`lib/delivery/task-list-render.ts`) moves into the kind
          folder as the splice, with the two marker constants (`DELIVERY_PLAN_START_SENTINEL`,
          `DELIVERY_PLAN_END_SENTINEL`), which `task-list-render.ts`, `lib/delivery/entry-inspection.ts`, and
          `__tests__/unit/delivery/entry-inspection.test.ts` import from there.
        - Given a list and a rendered section, the splice replaces the content between the `arc:delivery-plan`
          markers, or, in a list with none, the one unmarked `## Delivery Plan` section up to the next section or phase
          heading, and returns today's result: the new content, or a refusal naming `replacement-locus-missing`,
          `replacement-locus-duplicate`, or `replacement-locus-malformed`.
        - `replaceDeliveryPlanSection` keeps validating the plan and rendering it (`renderDeliveryPlanSection`), then
          calls the splice; `task-list-render.test.ts` and `delivery-task-list-render.test.ts` pass unchanged.
        - Build `test-first` (one behavior at a time):
            - a marked region is replaced, the bytes before its start marker and after the blank lines following its
              end marker unchanged
            - an unmarked `## Delivery Plan` section is replaced up to the next section or phase heading
            - a list with neither refuses `replacement-locus-missing`, and two unmarked sections
              `replacement-locus-duplicate`
            - an unpaired marker, and an unmarked section in a list the scanner rejects, refuse
              `replacement-locus-malformed`

### `[ ]` **4.2 Drafts, specs, and companions share one Purpose reader — § 9**

- _Goal:_ One Purpose reader is the registered parser of the draft, spec, and companion kinds and the reader status's
  purpose read calls, reading the first `**Purpose:**` field as § 9 states and never refusing.

    - `[ ]` **4.2.a Move status's Purpose reader into the kind folder**
        - `purposeField` (`lib/status/work-unit-purpose.ts`), with `purposeParagraph`, moves into
          `lib/store/kinds/design/` as a public pure function; `codeSpanEnds`, which status's sentence cut shares,
          moves with it and is exported for that.
        - `extractWorkUnitPurpose` and `selectWorkUnitDesign` call the moved reader and keep their presentation: an
          empty value or `—` reads as no purpose, cut to its opening sentence; `work-unit-purpose.test.ts` passes
          unchanged.
        - The reader's own unit tests pin § 9's reading at its new home:
            - a list-item and a bare-line `Purpose` both read
            - continuation lines join by single spaces to the paragraph's end — a blank line, a heading, or the next
              list item — or a line opening with another bold field label
            - `—` and an empty value read as written
            - a `Purpose` in a heading or a fenced block is skipped
            - a design with no `Purpose`, the `brief` spec form included, reads `null`

    - `[ ]` **4.2.b Register the Purpose reader for the three kinds**
        - The design folder's registration module builds the `work-item/draft`, `work-item/spec`, and
          `work-item/companion` registrations through `defineKindRegistration`, each parser returning `{ purpose }`
          and never failing, and joins `RAW_STATE_MODULES`; the three join `registrations.ts`, and notes register
          nothing.
        - Build `test-first` (one behavior at a time):
            - each kind's parser returns the content's `purpose`, and succeeds with `null` on content without one
            - a draft, a spec, and a companion read and listed through the in-repo fixture's store carry `purpose`,
              and notes carry no fields

## **Phase 5:** The cohort document and decomposition's checks

_Purpose:_ Build the cohort-document kind and land its parser with the decomposition checks, scaffold, template, and
document conversion that must change with it.

### `[ ]` **5.1 The cohort-document kind: parser and writers — § 8.1, § 8.3, § 8.6**

- _Goal:_ The cohort document registers a parser returning its Purpose and `Parent` and refusing any `Parent` line but
  an omitted, `[none]`, or one backticked slug, and exports a creation writer and the member-heading rename.

    - `[ ]` **5.1.a Register the cohort parser**
        - `{ purpose: string | null; parent: Slug | null }` under `lib/store/kinds/cohort/`, a public pure function;
          `purpose` read through the Purpose reader (Task 4.2); `parent` `null` when the line is omitted or reads
          `[none]`, the slug when it is one backticked slug; any other `Parent` line, or a second one, refuses.
        - The kind's registration module builds its registration through `defineKindRegistration` and joins
          `RAW_STATE_MODULES`, as the meta's does; the registration joins `registrations.ts`.
        - Build `test-first` (one behavior at a time):
            - an omitted line and `[none]` read `null`
            - one backticked slug reads as the slug
            - a bare value, a non-slug, and a second `Parent` line refuse
            - Purpose reads as a draft's does, `—` included
            - through the in-repo fixture's store, a cohort document lists with its parsed fields, and a refused one
              as a `malformed` diagnostic naming it

    - `[ ]` **5.1.b Write the creation writer and move the member-heading rename**
        - The creation writer takes the template's bytes, the cohort path, an optional Purpose, and optional member
          sections, each a slug and a body. It renders the heading, the template's identity paragraph, a backticked
          `Parent` for a subcohort and none for a top-level cohort, and the Purpose, `—` when none is given, closed by
          a rule; member sections follow under `## Members`, one `` ### `slug` `` heading and its body each in the
          order given, closed by a rule.
        - It finds the identity paragraph between the template's heading and its `**Parent:**` label, so today's
          template line and the backticked one read alike, and returns `null` when the template lacks its heading,
          that label, or its Purpose placeholder, as `renderV3IncompleteCohort` does on template drift.
        - `rewriteCohortMemberHeading` moves from `lib/work-unit/rename-reference-sweep.ts` into the kind folder, its
          one caller (`planRenameReferences`) importing it from there; its cases in `rename-reference-sweep.test.ts`
          move with it.
        - Build `test-first` (one behavior at a time):
            - a created top-level and a created subcohort document each parse back to their Purpose and `Parent`
            - an absent Purpose writes `—`
            - member sections render under `## Members` in the order given
            - today's template line and the backticked one yield the same identity paragraph
            - a template lacking its heading, `Parent` label, or Purpose placeholder returns `null`

### `[ ]` **5.2 The member-section report carries condition (c) — § 8.5**

- _Goal:_ A public pure function reports each member section naming no member, and the cohort consistency check's
  condition (c) computes through it with its diagnostics unchanged.

    - Input: a cohort document's content and the cohort's member slugs; output: each level-three heading under
      `## Members` holding a backticked slug that names no member, in document order.
    - `memberSlugs` moves from `lib/active/cohort-consistency.ts` into the kind folder as the report's section reader,
      and `checkCohortConsistency` computes condition (c) through the report, its live and staged members together.
    - Build `test-first` (one behavior at a time):
        - a section naming a member is not reported
        - a section naming no member is reported
        - a heading outside `## Members` is ignored
        - the consistency check's existing tests pass unchanged

### `[ ]` **5.3 Decomposition's checks and scaffold read the parsed `Parent`; the cohort forms convert — § 8.4, § 12**

- _Goal:_ Decomposition's topology and destination checks compare the parsed `parent` with the document's path, the
  shipped template carries the backticked placeholder, the scaffold writes the backticked form through the creation
  writer, and `cohort-storage-seam.md` converts — all landing together.

- _Note:_ The subtasks are one increment, reviewed and committed at this parent: checks reading the parser refuse the
  scaffold's bare output until the scaffold writes through the creation writer.

    - `[ ]` **5.3.a Compare the parsed `parent` in both checks**
        - `structurallyMatches` (`decompose-v3-topology.ts`) and `validateCohortDocumentClaim`
          (`git-decompose-v3-destination-validation.ts`) read `parent` through the cohort parser: `null` for a
          top-level cohort, the parent's slug for a subcohort. Each keeps its heading check and its refusal,
          `wrong-structural-identity` and `topology-claim`.
        - The destination check keeps reading `Purpose` through `cohortDocumentFacts` as today; only its `Parent` lines
          give way to the parsed `parent`.
        - A mismatched parent's `topology-claim` evidence carries the expected and parsed parent, each a slug or
          `null`; a document failing to parse refuses with no evidence, as a malformed topology claim does today.
        - The destination check's subcohort fixture (`git-decompose-v3-finish.test.ts`) takes the backticked form.
        - Build `test-first` (one behavior at a time):
            - each check admits a top-level document with the line omitted and with `[none]`
            - each check admits a subcohort document with a backticked parent agreeing with its path
            - each check refuses a parent disagreeing with the path, and a document failing to parse

    - `[ ]` **5.3.b Carry the backticked placeholder in the shipped template**
        - `template-cohort.md`, edited in package source and synced to the project copy, takes the line
          `` **Parent:** `{parent-cohort-name}` ``; its guidance — a subcohort's line only, omitted for a top-level
          cohort, and a convenience pointer derivable from the `Cohort` path — moves to a guidance placeholder of its
          own after the line.
        - A document written from the template parses once its placeholder holds a slug, in both copies.

    - `[ ]` **5.3.c Scaffold through the creation writer**
        - `renderV3IncompleteCohort` calls the creation writer with the cohort path, `—`, and no member sections, so a
          subcohort's document carries the backticked `Parent`; a `null` keeps the `invalid-cohort-template` refusal.
        - Build `test-first` (one behavior at a time):
            - the scaffold's output passes its own topology check and parses, for a top-level cohort and a subcohort

    - `[ ]` **5.3.d Convert `cohort-storage-seam.md`'s bare `Parent`**
        - The line takes the backticked form, as a committed edit; verified by its `parent` parsing as `state-storage`.

## **Phase 6:** The rule catalog

_Purpose:_ Build every rule as a pure function over stub views and register each kind's check, once all the kinds the
rules read are in place.

_Exit criterion:_ Listing the task list, draft, spec, companion, and cohort document through the in-repo implementation
returns `complete` with no diagnostics; decomposition's checks admit the repository's `Parent` forms and the scaffold's
output; each § 3.6 rule refuses its breaking write and admits its valid counterpart over stub views; and every kind with
rules registers its check in the production set.

_Design decisions:_ Each rule is a pure function of the check's input, unit-tested over stub views; the reference
fixture's test parsers never exercise the production rules (§ 11.3). A rule judges a new record whole and otherwise only
what differs from the prior version (§ 3.3); a stale value never refuses an unrelated write. The held-entries rules take
the inbound list's entry grammar as an input and admit while the inbound kind declares none.

### `[ ]` **6.1 The shared slug rules and the Errand record's check — § 3.3, § 3.6, § 5.3, § 10**

- _Goal:_ `work-item.former-slug` and `work-item.slug-edges` refuse a creation or rename taking a slug they guard, from
  `lib/store/kinds/work-item/`, and the Errand record registers a check running both.

    - `[ ]` **6.1.a Build `work-item.former-slug`**
        - Refuses a creation or rename giving a work item a slug that `before` resolves to another record, by UID,
          whose current name differs: that record's former slug. In `after` the written record holds the slug itself,
          so `lookup` there no longer resolves it to its earlier holder alone.
        - Build `test-first` (one behavior at a time):
            - a creation taking another record's former slug refuses
            - a rename taking one refuses
            - a record renamed back onto its own former slug admits
            - a creation taking an unused slug admits

    - `[ ]` **6.1.b Build `work-item.slug-edges`**
        - Refuses a creation or rename giving a work item a slug that a non-archived work unit's `Depends On` named, in
          `before`, for another record, when that edge still names it in `after`; its condition names the work units
          and edges, and its remedy is § 5.3's.
        - Build `test-first` (one behavior at a time):
            - an edge left naming a completed work unit's reused slug refuses
            - an edge the batch settled admits
            - an edge in an archived record admits
            - an edge naming a retired origin's slug, with no disposition, refuses
            - a rename onto a slug the renamed item depends on admits once its own edge is settled

    - `[ ]` **6.1.c Register the Errand record's check**
        - `lib/store/kinds/errand-record/`'s registration carries a check alone, running both shared rules; the Errand
          record keeps its schema and codec (`lib/errand/identity-record.ts`).
        - The registration module builds it through `defineKindRegistration` and joins `RAW_STATE_MODULES`, as the
          meta's does; the registration joins `registrations.ts`.
        - Build `test-first` (one behavior at a time):
            - the registered check returns both rules when a write breaks both

### `[ ]` **6.2 The meta's check — § 3.3, § 3.6, § 4, § 5.3, § 5.4**

- _Goal:_ The meta's registration carries a check running its nine rules and the two shared slug rules, each rule
  reusing today's condition where one exists, applied to what the write changes against the prior version.

- _Context:_ A rule restates a pre-commit condition over parsed fields and the kind's own line reading; no kind module
  imports from `scripts/` or `commands/` (§ 1.2), and `scripts/validate-meta-spec.ts` keeps its validators as they
  are.

    - `[ ]` **6.2.a Build the authority and shape rules**
        - `meta.verb-owned-field`: a hand edit creating or removing a meta, or changing `State`, `Class`, or
          `Current Workflow`.
        - `meta.field-block`: the field block's shape (`validateMetaFieldBlockShape`), an unset or invalid parsed
          `State` (`WorkUnitStateSchema`), a missing `Design` line, and a second `State`, `Design`, or `Cohort` bullet,
          counted through the kind folder's line-level module — today's `validateSpec`, `validateLifecycleFields`, and
          `validateCohort` conditions.
        - `meta.durable-fields`: a new or changed field the durable schema rejects, or an `Owner` that is no identity
          slug (`SlugSchema`).
        - Build `test-first` (one behavior at a time):
            - each rule refuses its breaking write and admits its valid counterpart
            - the authority rule is silent for a verb writer
            - an unparseable prior admits the integrity and authority rules' fields and still runs the shape rules

    - `[ ]` **6.2.b Build the reference rules**
        - `meta.depends-on`: a new or changed edge resolving in `after` to no record, or — a live record first — to
          more than one.
        - `meta.design-entry`: a new or changed `Design` entry that is not the work item's own (`draft-<slug>.md` or
          `spec-<slug>.md` as the layout resolver projects them, or a paired spec's `spec-<slug>-prd.md` or
          `spec-<slug>-rfc.md` when `after` holds that companion), or more than two entries.
        - `meta.cohort`: a new or changed `Cohort` other than `[none]` that is not the full path of an open cohort in
          `after`, read through the cohort parser.
        - Build `test-first` (one behavior at a time):
            - each rule refuses its breaking write and admits its valid counterpart
            - an existing edge gone ambiguous does not refuse an unrelated write
            - a subcohort's slug alone refuses as a `Cohort`

    - `[ ]` **6.2.c Build the lifecycle-consistency rules**
        - `meta.stage`: a write leaving a work unit in flight, moving it in flight or changing `State`,
          `Current Workflow`, or `Design`, that leaves the three inconsistent (`checkCurrentWorkflowConsistency`).
        - `meta.prepare-tasks`: `validateCurrentWorkflow`'s condition, requiring the work unit's own task list read in
          `after`, with no open task and passing the cursor's scan (`resolveTaskListCursor`).
        - Build `test-first` (one behavior at a time):
            - each rule refuses its breaking write and admits its valid counterpart
            - `[none]` and `[none associated]` name no task list

    - `[ ]` **6.2.d Build `meta.inbound-held` and register the check**
        - `meta.inbound-held`: a write moving a work unit to `Integrating` or to the archive while its inbound list,
          read through `after` and split by the given entry grammar, holds an entry; no grammar admits.
        - The meta's registration carries the check, running the nine rules and the shared slug rules.
        - Build `test-first` (one behavior at a time):
            - under a stub grammar, an entry held at `Integrating` and at archive refuses
            - an empty or missing inbound list admits
            - with no grammar declared, the rule admits
            - the registered check returns every rule a write breaks, two at once included

### `[ ]` **6.3 The task list's check — § 3.3, § 3.6, § 6.3, § 6.4, § 6.5**

- _Goal:_ The task list's registration carries a check running its six rules over task lines paired by identifier
  between the prior and next versions.

    - `[ ]` **6.3.a Pair task lines across versions**
        - Task lines are `scanTaskListStructure`'s items, paired by identifier, a repeated identifier pairing in file
          order; a line with no prior counterpart is added; a prior failing the scanner pairs no line.

    - `[ ]` **6.3.b Build the authority rules**
        - `task-list.close`: a hand edit giving a line `[x]` or `[~]` its prior counterpart lacked — an added line or a
          new list's included — or changing a closed line's marker.
        - `task-list.delivery-plan`: a hand edit changing any line between the `arc:delivery-plan` markers; the
          unmarked provisional section stays editable.
        - Build `test-first` (one behavior at a time):
            - each rule refuses its breaking hand edit and admits its valid counterpart
            - a new list carrying a closed line refuses as a hand edit
            - both are silent for a verb writer
            - a prior failing the scanner leaves `task-list.close` judging nothing

    - `[ ]` **6.3.c Build the completed-task integrity rules**
        - `task-list.completed-identifier`: a task completed in the prior version has no task line in the next.
        - `task-list.completed-goal`: a task completed in the prior version changes or loses its `_Goal:_`.
        - Build `test-first` (one behavior at a time):
            - each rule refuses its breaking write and admits its valid counterpart
            - restructuring open tasks and future phases admits

    - `[ ]` **6.3.d Build the shape rules and register the check**
        - `task-list.descriptor`: an added or changed root descriptor cluster breaking `validateTaskDescriptorSpacing`
          (`lib/markdown/descriptor-spacing.ts`); a cluster pairs with the cluster under its parent's paired task line
          (Task 6.3.a) and is changed when its lines differ (`scanTaskDescriptorExtents`).
        - `task-list.segmentation`: a diagnostic of the next version's `scanTaskListSegmentation` that the prior's did
          not report, matched by `code` and message less its `path:line` prefix, and a `task-list-malformed` by `code`
          alone.
        - The task list's registration carries the check.
        - Build `test-first` (one behavior at a time):
            - each rule refuses its breaking write and admits its valid counterpart
            - a broken descriptor cluster left unchanged admits an unrelated write
            - a line shift above an existing segmentation diagnostic admits
            - a numeric third-level identifier refuses as a new `task-list-malformed`
            - the registered check returns every rule a write breaks, two at once included

### `[ ]` **6.4 The lineage and cohort checks — § 3.6, § 8.2**

- _Goal:_ The lineage record's and the cohort document's registrations carry checks running their rules, so a
  retirement leaves no inbound entry held and a cohort's Purpose, nesting, and members stay consistent in `after`.

    - `[ ]` **6.4.a Build `lineage.inbound-held` and register the lineage check**
        - Refuses a lineage record retiring a work unit created while that work unit's inbound list holds an entry in
          `after`, under the given grammar; no grammar admits.
        - Build `test-first` (one behavior at a time):
            - under a stub grammar, a retirement with an entry held refuses and one without admits

    - `[ ]` **6.4.b Build the cohort rules and register the cohort check**
        - `cohort.purpose`: a new document, or a write changing its Purpose, whose parsed `purpose` fails today's floor
          predicate (`hasPurposeFloor`): absent, empty, or `—`.
        - `cohort.parent`: a new or changed `Parent` naming no open cohort in `after`, nesting deeper than one level
          counting the cohort's own subcohorts, or leaving an open member's `Cohort` disagreeing in `after`.
        - `cohort.open-members`: a write removing a document, or placing it completed, while in `after` an open member's
          `Cohort` or an open subcohort's `Parent` names it.
        - Build `test-first` (one behavior at a time):
            - each rule refuses its breaking write and admits its valid counterpart
            - an archive placing the document completed with its last open member admits
            - a cohort reads as open while no completed placement is returned
            - the registered check returns every rule a write breaks, two at once included

### `[ ]` **6.5 Every registered kind is settled** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion is shown — the task list, draft, spec, companion, and cohort document listed over
  this repository through the in-repo implementation with no diagnostics, decomposition's two checks admitting every
  planned cohort document at its path, each kind with rules registering its check, and `npm test` passing — with the
  scenario and its result recorded.

- _Note:_ The listing and the checks over the repository's documents run as a probe; no verification script ships.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ Every Success Criterion below is verified at the final merged base, with the quality gates green at every
  declared gate.

- _Note:_ Any base merge after verification re-runs the every-kind listing and parses every tracked meta, lineage
  record, and cohort document, converting any arrival in an old form (§ 12); landing proposes the working-memory entry
  naming the old-code symptoms and their remedy (spec § Cross-cutting Considerations, Migration and rollout).

---

## Success Criteria

- `[ ]` Listing `work-item/meta`, `work-item/task-list`, `work-item/draft`, `work-item/spec`, `work-item/companion`,
  `lineage/transition`, and `cohort/document` through the in-repo implementation over this repository returns
  `complete` with no diagnostics, and every meta's parsed fields equal, on today's keys, what `parseMetaRecord`
  returns at the merged base.

- `[ ]` Each rule in the spec's rule catalog has unit cases refusing its breaking write and admitting its valid
  counterpart, over stub views.

- `[ ]` In the conformance suite, the reference fixture refuses a registered check's breaking write with
  `record-malformed` naming the first rule broken and the first record breaking it and counting the other broken pairs,
  presents a verb in `HAND_EDIT_VERBS` as a hand edit and any other verb as itself, and checks a batch against its other
  writes and the state it found; the in-repo fixture declares no write checks; and every existing suite item passes over
  both fixtures unchanged.

- `[ ]` For each meta writer, content outside the field it writes is byte-identical before and after, a section inside
  the field block survives every writer and `reconcileMetaFields`, and today's setters produce today's bytes everywhere
  the spec's named corrections do not apply.

- `[ ]` Every tracked lineage record parses as schema version 2 and round-trips byte-identical through the kind's
  writer, and the live transition-record test and every reader's tests pass on the new shape.

- `[ ]` Decomposition's topology and destination checks admit a cohort document whose `Parent` is omitted, `[none]`, or
  a backticked slug agreeing with its path, and refuse one that disagrees; the scaffold's output passes its own
  topology check and parses; and a document written from the shipped template, in package source and the project copy,
  parses once its `Parent` placeholder holds a slug.

- `[ ]` A meta written without the new session-context fields renders byte-identical to today's renderer, parses with
  the new keys at their defaults, and passes `toMetaRecord`.

- `[ ]` The cohort consistency check's existing tests pass with condition (c) computing through the member-section
  report.

- `[ ]` At landing, `eslint-suppressions.json` records no more `store-raw-state`, `surface-names`, or `work-unit-paths`
  violations, in total or per file, than at the final merged base, and `npm run -s lint:ts` passes with no suppression
  added.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
