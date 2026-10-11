# Spec (`detailed` · `RFC`): seam-record-kinds

- **Origin:** [internal]

- **Purpose:** Build the record kinds every reader and writer of work-item and cohort state goes through — the parsers,
  field schemas, field writers, and write checks of the meta, task list, draft and spec, lineage record, and cohort
  document — so the code that moves onto the storage contract adopts one settled interface per kind.

---

## Introduction / Context

ARC's storage contract is shipped: one interface for every read and write of operational and planning state (`Store`,
`lib/store/contract.ts`), an in-repo implementation over today's substrates, and a kind registry that gives every record
kind a parser slot (`createKindRegistry`, `lib/store/registry.ts`). Almost nothing fills those slots. The in-repo
implementation registers one parser, the meta's (`createInRepoContext`, `lib/store/in-repo/context.ts`), and its reads
and listings bypass it, decoding the meta and the lineage record through hard-wired codecs (`decodeTrackedContent`,
`lib/store/in-repo/read-codec.ts`). Drafts, specs, and cohort documents list with no parsed fields at all.

Callers outside the store still read state beneath the contract: 54 production files outside it import `parseMetaRecord`
to parse bytes they read themselves. Eight modules write metas through a setter that takes preformatted Markdown
(`setMetaBulletFields`, `lib/active/meta-reader.ts`), so each caller formats its own values and nothing holds a field's
rendering in one place: most format through `formatValue`, dependency discharge renders `Depends On` with its own
`renderEdgeList` (`side-effects/discharge-dep-edges.ts`), the lifecycle executor passes its callers' values through as
given (`executor-context.ts`), and `arc finalize` and `arc rename` format `Task List` under different value classes
(`finalize-stage.ts`, `rewrite-renamed-meta.ts`), which agree only while the value is one filename. The rules a write
must satisfy live in pre-commit checks — task numbering, the meta's field shape and stage consistency
(`scripts/validate-meta-spec.ts`), cohort consistency (`lib/active/cohort-consistency.ts`) — which see only what a
commit on the checkout's branch stages. Once state lives under `refs/arc/*`
(`adr-035-keep-operational-state-in-repository-refs.md`), no state write passes through such a commit, so those rules
must move to where every write lands.

An import ratchet counts the reads beneath the contract. The `store-raw-state`, `surface-names`, and `work-unit-paths`
rules (`eslint/architecture-imports.ts`) record today's violations in `eslint-suppressions.json` as a floor that only
rerouting a caller drains. Rerouting each subsystem is separate work, and it needs, first, each kind's parser and field
schema, the one writer of each field, and the rules a write must satisfy, settled once — otherwise each rerouting change
invents its own and they disagree. This change builds those, and runs them nowhere they would change today's behavior.

**Terms used throughout:**

- **Store, backend, record, family, kind** — as `lib/store/` defines them: the contract (`Store`), one implementation of
  it, one stored document (a file is its own record, `adr-022-managed-operational-state-documents.md`), a storage
  grouping (`FAMILY_REGISTRY`), and a record type within a family (`KIND_SHAPES`, `KIND_MECHANISMS`).
- **In-repo implementation** — the backend over today's tracked files, personal files, and transient-identity ref
  (`lib/store/in-repo/`). **Reference backend** — the in-memory, test-only backend the store's conformance suite runs
  (`__tests__/helpers/store/reference-backend.ts`). **Ref backend** — a planned backend storing state under
  `refs/arc/*`, not yet built.
- **The flip** — the per-repository switch after which the store reports `capabilities.stateOffBranch` as true
  (`StoreCapabilitiesSchema`, `lib/store/read.ts`). Before it, the in-repo implementation serves every read and write,
  and today's commits and pre-commit checks apply. Code that behaves differently across the flip branches on that
  capability, never on a configuration value. The **cutover's deletion pass** later removes what only today's
  substrates needed.
- **Projection, write-back, save** — the planned gitignored working copy at the familiar `.arc/` paths, and its two
  paths for persisting a person's edits to the store: automatic write-back and the explicit `arc save`. Not yet built.
- **Hand edit** — a write whose content a person edited rather than a verb composed: what write-back and save persist.
- **Work item** — a work unit, whose primary record is its meta (`work-item/meta`), or an Errand, whose primary record
  is its Errand record (`work-item/record`).
- **Placement** — a record's logical lifecycle location (`ReadPlacementSchema`, `lib/store/placement.ts`): active,
  backlog planned or provisional, or completed. A work unit is **in flight** when placed active; **parked** when its
  `State` is `Active` and it is placed backlog planned (`deriveState`, `lib/work-unit/lifecycle-resolver.ts`);
  **archived** when placed completed; and a **stub** when placed backlog and not parked.
- **Former slug** — a name a work item held before a rename, which `lookup` still resolves to it.
- **Open cohort** — a cohort whose document is stored and not archived.

## Goals

1. **One registered parser per kind** for the meta, task list, draft, spec, companion, lineage record, and cohort
   document, so every backend returns the same parsed fields for the same bytes, and in-repo reads and listings decode
   through the registry rather than hard-wired codecs.
2. **One writer per field** that more than one verb writes, taking the field's typed value and rendering its canonical
   form, so no caller formats a value and no two verbs write one field in two shapes.
3. **One write check per kind that has rules** — a standalone function every backend that runs write checks calls in its
   write path, and the projection can call with no write — returning every rule a write breaks under a stable
   identifier, and holding a hand edit and a verb to the same integrity and shape rules in every backend that runs them.
4. **Every field crossing a verb boundary settled** — its name, its value shape, the verb that writes it, and who reads
   it — so the changes that reroute each subsystem plan against fixed interfaces.
5. **No observable change before the flip** beyond the corrections this design names: the meta's writers keep every
   section inside the field block, backfill only missing lines, wrap a long identifier list as a fresh meta's renderer
   does, insert an absent bullet in field order, backfill no other field when writing `Candidate`, `PR URL`, or
   `Completed`, render a cleared `Next Action` as `—`, and throw on a meta with no H1 or no closing `---` (§ 5.6); a
   meta without an H1 or a core table no longer parses or is created (§ 5.1, § 11.2); the lineage record takes its final
   shape (§ 7); and decomposition admits the cohort `Parent` forms the repository's documents use (§ 8.4).
6. **Every tracked record parses** under the new parsers, the few that do not converted in this change (§ 12).
7. **No import-ratchet floor grows** (§ 1.2).

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **reroute callers.** Readers keep parsing what they read, and verbs keep today's setters, until each subsystem moves
  onto the store. Three exceptions are part of this design: every reader and producer of the lineage record, rewritten
  to its new shape (§ 7.3); decomposition's two `Parent` checks and its scaffold (§ 8.4); and the cohort consistency
  check's member-section condition, which computes through the new report (§ 8.5).
- **run write checks in the in-repo implementation**, or change hand edits and the pre-commit checks before the flip.
- **call the write check from the ref backend, write-back, or save.** It ships callable for them (§ 3).
- **register the Candidate, integration-boundary, or review kinds, or the inbound list and Errand description kinds.**
  The Candidate and integration-boundary records keep their codecs.
- **remove the pre-commit checks, the meta's retired session fields, or the lineage record's `rename` kind** — each
  outlasts the flip until the cutover's deletion pass.
- **build the verbs these interfaces serve** — the task close verb, the `Class` verb, cohort-document archive, and the
  edge settling that creating and renaming verbs perform (§ 5.3) — or change any verb's behavior beyond adopting a
  writer this design names.
- **surface the cohort member-section report** in `arc status` or session-init.
- **change any workflow's text**, or status's presentation of Purpose — its opening-sentence cut and its reading of `—`
  (`extractWorkUnitPurpose`, `lib/status/work-unit-purpose.ts`).
- **move `readActiveMetaCandidates`** out of `meta-reader.ts`.

## Proposed Design

§ 1–3 build the shared machinery: where the kinds live, what each registers, and the write check. § 4–10 define each
kind. § 11 changes the backends, and § 12 converts the records that do not parse.

### 1. Boundary and placement

#### 1.1 One work unit

The kinds share one registration shape, one write-check design, and one set of field-ownership decisions, and no part
of the change is independently landable: the meta parser's fallback retires with the metas it converts, the cohort
parser with decomposition's checks and the document it converts, and the lineage kind with every reader of the old
shape. The change lands as one merge, reviewed in chunks. It stays one work unit and warrants no delivery plan.

#### 1.2 Module layout and the import ratchet

Each kind takes a folder under `lib/store/kinds/`, beside one module for the production registration set
(`lib/store/kinds/registrations.ts`, § 2.2):

| Folder           | Kind                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| `meta/`          | `work-item/meta`                                                        |
| `task-list/`     | `work-item/task-list`                                                   |
| `design/`        | `work-item/draft`, `work-item/spec`, `work-item/companion`              |
| `lineage/`       | `lineage/transition`                                                    |
| `cohort/`        | `cohort/document`                                                       |
| `errand-record/` | `work-item/record` — a write check only (§ 10)                          |
| `work-item/`     | the slug rules the meta and Errand record checks share (§ 5.3), no kind |

- **Registration modules join the ratchet's list.** Each kind folder holds one registration module — its parser, write
  check, and anchor declaration (§ 2.1) — which, with `registrations.ts`, joins `RAW_STATE_MODULES`
  (`eslint/architecture-imports.ts`). Every file under `lib/store/` may import them, since the `store-raw-state` rule
  ignores the store (`rawStateViolations`); a production import from outside `lib/store/` fails it. The meta's
  registration wraps `parseMetaRecord`, so no module outside the store reaches meta parsing uncounted.
- **Everything else in a kind folder is public:** the kind's parsed-fields schema, its types, its field writers, and,
  for the lineage record, the cohort document, and Purpose, its pure parse functions. Callers narrow a read's untyped
  `fields` (`StoreRecordSchema`, `lib/store/read.ts`) with the kind's parsed-fields schema, as `ParsedMetaRecordSchema`
  serves today (`lib/store/lifecycle-index.ts`, `lib/store/current-work-unit.ts`). The meta's schemas stay in
  `lib/active/meta-schema.ts`, which callers already import, and grow there (§ 5.2).
- **Only meta parsing is listed among the parsers.** `meta-reader.ts` stays on the list and keeps the meta's parsing.
  The lineage codec, the cohort parser, and the Purpose reader stay unlisted: decomposition's record builder, its base
  advancement, its two `Parent` checks, and the ROADMAP assert (`decompose-transition-record.ts`,
  `git-decompose-transition-base-advancement.ts`, `decompose-v3-topology.ts`,
  `git-decompose-v3-destination-validation.ts`, `roadmap-regeneration-assert.ts`) run them over bytes a cut composes
  or commits, which no store read reaches, so listing them would add callers to the floor that can never leave it.
  Lineage's raw Git read stays counted where it is today: at `git-transition-record-enumeration.ts` and every module
  importing it, and at `transition-record-store.ts` and its importers, all listed. Cohort documents and drafts are
  read by file or Git blob outside the listed modules, so `store-raw-state` does not count their parsing;
  `work-unit-paths` counts the layout-resolver calls that locate them.
- **No types from `commands/`.** Kind modules define their own types, inferred from their schemas, and import nothing
  from the command layer, which library modules never reach up to. `meta-reader.ts`' imports of `ActiveLayout` and
  `MetaFileCandidate` from `commands/active/types.ts` serve only `readActiveMetaCandidates`, which stays in place for
  its callers to move.
- **`meta-reader.ts` keeps its exports.** Today's setters stay exported for the callers not yet moved and delegate to
  the meta kind's writers (§ 5.6), so those callers compile unchanged and stay counted until they move. The writers
  import nothing from `meta-reader.ts`, which imports them, so the two form no import cycle: the field descriptors,
  value formatting, and rendering they need (`META_FIELDS`, `formatValue`, the core-table and bullet renderers, and
  `parseIdentifierList` with its helpers `PLACEHOLDER`, `isSentinel`, and `wrapCommaList`) live under
  `lib/store/kinds/meta/`, and `meta-reader.ts` imports and re-exports them, `parseIdentifierList` for
  `scripts/validate-meta-spec.ts`. The line-level reading the writers share with the parser — the core table's cells, a
  bullet's extent — sits in one module of the kind folder that joins `RAW_STATE_MODULES` beside the registration module,
  so it stays counted outside the store.
- **Two boundary rows narrow** (`eslint.config.js`). The row keeping `meta-reader.ts`' store delegate dynamic bans any
  static import whose path holds `/store/`, so that importing the meta parsers closes no backend cycle; it admits the
  meta kind folder's modules other than the registration module, the folder's only importer of `meta-reader.ts`, and
  bans every other store import as today. The folder's other modules import nothing at runtime from `meta-reader.ts` or
  from `lib/store/` outside the folder, so the cycle stays closed. The row reserving `parseIdentifierList` calls to
  `meta-reader.ts` and `scripts/validate-meta-spec.ts` exempts the folder too, which `formatValue` and the bullet
  renderer join. The rows' cases (`__tests__/integration/eslint-architecture-rows.test.ts`) keep the refused store
  import, add a refused import of the registration module, and admit an import of another kind module.
- **The floor never grows.** No production module outside `lib/store/` imports a registration module, and no rerouted
  reader of the lineage record adds an import of a listed module, so every ratchet rule's recorded count at landing is
  at most its count at the merged base (Success Criteria).

### 2. Registration and the registry

#### 2.1 What a kind registers

```ts
interface KindRegistration<Fields> {
  kind: KindId;
  /** Content-only parse; defects throw, malformed content returns failure. */
  parser?: (content: string) => { success: true; data: Fields } | { success: false; error: string };
  /** Rules a write of this kind must satisfy (§ 3); absent when the kind has none. */
  check?: WriteCheck;
  /** Parsed-field keys holding a state-version anchor. */
  anchorFields?: readonly AnchorField<Fields>[];
}
/** Keys of Fields whose parsed value is a state version or null. */
type AnchorField<Fields> = { [K in keyof Fields]: Fields[K] extends StateVersion | null ? K : never }[keyof Fields];
```

- **`createKindRegistry` takes registrations** rather than bare parsers, and each `KindDefinition` gains `check` and
  `anchorFields` beside `parser`: a registration's parser fills the parser slot, still a `RecordParser`, and a kind
  with no registration keeps an empty slot (`null`) and no check. Test code passing parsers builds registrations from
  them.
- **The anchor declaration** names, by its key in the parser's output and never by a Markdown label, each field holding
  a state-version anchor. Its type admits only a key whose parsed value is a `StateVersion` (`lib/store/identity.ts`) or
  `null`, so a wrong name fails to compile. The meta declares `stateAtHandoff` (§ 5.5). A backend that resolves anchors
  reads them from the parse the write check already needs and names the field in its refusal when a stored anchor names
  a state version it cannot resolve. The declaration sits on the registration rather than `KindMechanism`, which
  excludes the field schema (`lib/store/registry.ts`); where a backend stores the anchor's resolution is its own
  mechanism.

#### 2.2 The production registration set

`registrations.ts` exports one list, which every backend registers: the meta, task list, draft, spec, companion,
lineage record, and cohort document, each with its parser and any check, and the Errand record with its check alone
(§ 10). The notes kind (`work-item/notes`) registers nothing: notes carry no fields. The in-repo implementation builds
its registry from the set (`createInRepoContext`), replacing its inline meta parser. `Store` exposes no registry, so
code outside `lib/store/` cannot reach the set except by importing the listed module; the projection's write-back,
when built, reaches it from inside `lib/store/`.

#### 2.3 The machine-local set

`MACHINE_LOCAL_PATHS` (`lib/store/registry.ts`) gains a per-worktree Git-directory root, `git-worktree` — each
worktree's own Git directory, `.git/` for the main worktree and `.git/worktrees/<name>/` for a linked one — with the
pattern `arc-checks/**`. That folder holds the quality-gate verb's per-worktree record of passes once that verb ships,
and is never stored, synced, or projected. Only tests read the set today; the entry completes the inventory the
projection and backends will enforce, and fixes no failure.

### 3. The write check

#### 3.1 Signature

```ts
type WriteCheck = (input: WriteCheckInput) => Promise<readonly BrokenRule[]>;

interface WriteCheckInput {
  /** The record, its owner named by its slug after the write, with its UID where it has one. */
  reference: RecordReference;
  /** Absent on a creation; `fields` absent when the stored version fails to parse. */
  prior?: { content: string; fields?: unknown };
  /** Absent on a removal. */
  next?: { content: string; fields: unknown };
  writer: { kind: "verb"; verb: string } | { kind: "hand-edit" };
  /** The store as the write or batch found it. */
  before: StoreView;
  /** The store with the whole write or batch applied. */
  after: StoreView;
}
type StoreView = Pick<Store, "read" | "list" | "lookup">;

interface BrokenRule {
  /** Stable kind-scoped identifier (§ 3.6), e.g. `meta.verb-owned-field`. */
  rule: string;
  condition: string;
  /** Shaped as a refusal's remedy (`RemedySchema`, `lib/store/refusal.ts`). */
  remedy: Remedy;
}
```

- **Standalone.** The check runs with no write, so the projection, once built, can run it before write-back and save
  persist an edit, and from its checkout-removal check, which writes nothing. The caller supplies both views. A backend
  serves them from the state it found and the state it is about to commit; a caller that writes nothing builds `after`
  itself, as the store with its pending write applied, its `lookup` resolving as the backend's does, since a view
  resolving differently would admit a write the backend then refuses. No such view ships here: the projection, its one
  caller, is not yet built.
- **Parsing comes first.** Content that fails its kind's parser is refused before any check, as `record-malformed`
  carrying the parser's error, as the reference backend's write admission does today
  (`__tests__/helpers/store/write.ts`). A stored version that fails to parse is passed as `prior` with no `fields`: the
  shape rules check the write whole, and the integrity and authority rules admit its fields, since with no readable
  prior none can tell a value the write introduces from a stale one (§ 3.3). Only a merge or an import stores such a
  version, since parsing refuses any write producing one, and refusing its repair would leave it unrepairable, since no
  verb repairs a record.
- **Every rule, none admitting.** The check returns every rule the write breaks; an empty result admits it. No rule
  admits a write another refuses.
- **Two views.** Rules judge the state the write produces through `after`. One rule judges a slug against the state
  before the write (§ 5.3), which `before` serves. A backend already holds both: the state it found, and the state it
  is about to commit.

#### 3.2 The writer

A backend derives the writer from the batch's caller provenance (`CallerProvenanceSchema`, `lib/store/links.ts`: a
`verb`, a `lifecycleAction`, and an optional `codeHead`). A `verb` in `HAND_EDIT_VERBS` reads as a hand edit, and any
other as itself. `HAND_EDIT_VERBS` is `["write-back", "save"]`, the verbs under which write-back and `arc save`
persist an edit (with lifecycle action `edit`), exported from `lib/store/links.ts` beside `CallerProvenanceSchema` so
the backends' derivation and write-back share one constant. A backend that runs write checks therefore refuses a hand
edit breaking an authority rule however the edit reaches it, not only when write-back calls the check first, and no
provenance field is added. Write-back sets its provenance itself, never from a file's content, so a hand edit cannot
pass as another verb.

#### 3.3 What a rule checks

- **What the write changes.** A rule checks a new record whole; otherwise only the fields, sections, and task lines that
  differ from the prior version. Task lines are the task-list scanner's items (`scanTaskListStructure`), paired across
  versions by identifier, a repeated identifier pairing in file order; a line with no prior counterpart is added. When a
  prior version fails the scanner, no line pairs, and `task-list.close` and the completed-task rules judge nothing, as
  over an unparseable prior (§ 3.1); `task-list.segmentation` refuses a write that newly makes a list fail the scanner
  (`task-list-malformed`).
- **A stale value never refuses an unrelated write.** A value that predates a rule, or was valid when written and has
  gone stale since — an edge now ambiguous, a dependency retired, an archived record naming a closed cohort — keeps
  reading, and its readers report it.
- **Three classes.** **Authority** rules bind only a hand edit: what only a verb may change. **Integrity** and **shape**
  rules bind every writer.
- **As of the write.** A rule that reads records outside the write reads them through views no compare-and-swap
  guards: two racing writes, or a merge, can produce a state a rule would refuse. Readers report such a state rather
  than assume it cannot occur.

#### 3.4 Refusing, merging, and moving state

- **A backend refuses with `record-malformed`**, the contract's existing code for a record failing its kind's parse or
  validation (`malformedWrite`, `lib/store/in-repo/write-codec.ts`), so no refusal code is added. It names the first
  broken rule in identifier order (UTF-8 byte order) as its `rule` and, as its `reference`, the first record in the
  batch's write order that breaks it, with that rule's condition and remedy; the condition states how many other
  (record, rule) pairs the write breaks. Write-back and save, which need every rule at once, call the
  check directly; a verb that breaks a rule is a defect or stale state that one rule diagnoses.
- **A merge after fetch is never refused,** since both sides are already published. Expected contract, from the flip:
  the ref backend runs the checks over a merged result and reports what breaks, with sync's provenance as the writer,
  so the authority rules stay silent. The reference backend's `sync` runs no check.
- **A stale write's merge is checked as it lands.** Where a backend merges a write made against an older version
  (`mergeContents`, `__tests__/helpers/store/merge.ts`), `next` is the merged content the write would persist.
- **Moving state between backends runs no rule.** Expected contract: the migrate verb and the one-time import, when
  built, carry records today's checks admitted unchanged, so archived records that predate a rule or name a closed
  cohort move as they are.

#### 3.5 Where it runs

- **The reference backend, from this change,** runs every registered check in its `write` and `batch` paths (§ 11.3).
- **The in-repo implementation never runs one.** Before the flip every write is a commit behind today's pre-commit
  checks. Its validation stays as today (§ 11.2): a meta's update and a cohort document land as written
  (`writeContent`, `lib/store/in-repo/write-codec.ts`), a meta's creation keeps its admission check, and a lineage
  record validates at write, now through its kind's parser.
- **From the flip** — expected contracts, available when the ref backend and the projection ship: the ref backend runs
  every registered check in its `write` and `batch` paths, and write-back and save call the check with a hand edit as
  the writer.
- **Each backend's conformance fixture declares whether it runs write checks** (§ 11.3): the reference and ref
  backends do, the in-repo implementation does not.

#### 3.6 Rule catalog

Each rule's identifier is stable; storage consumers name rules by it. "Changed" means differing from the prior version
(§ 3.3). Rules marked _shared_ live in `lib/store/kinds/work-item/` and run in both the meta's and the Errand record's
checks.

| Rule                             | Class     | Refuses when                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta.verb-owned-field`          | authority | A hand edit creates or removes a meta, or changes its `State`, `Class`, or `Current Workflow` (§ 5.4).                                                                                                                                                                                                                                                                                                                                                                        |
| `meta.field-block`               | shape     | A meta write leaves no standalone `---` after its H1, an unset `State` in the core table or one `WorkUnitStateSchema` rejects, or no `Design` line in the block, or a second `State`, `Design`, or `Cohort` line (§ 5.1).                                                                                                                                                                                                                                                     |
| `meta.durable-fields`            | shape     | A new or changed field holds a value its `MetaRecordSchema` schema rejects — an unset `Owner` or `Origin`, or a `Priority`, `Class`, `Promotion Receipt`, `Candidate`, or `Session Type` outside its schema (`MetaPrioritySchema`, `MetaWorkClassSchema`, `MetaPromotionReceiptSchema`, `MetaCandidateIdSchema`) — or a new or changed `Owner` is not an identity slug (`SlugSchema`); `State` is `meta.field-block`'s (§ 5.2, § 5.4).                                        |
| `meta.depends-on`                | integrity | A new or changed `Depends On` edge resolves, in `after`, to no record, or — a live record first — to more than one (§ 5.3).                                                                                                                                                                                                                                                                                                                                                   |
| `meta.design-entry`              | integrity | A new or changed `Design` entry is not the work item's own, or `Design` holds more than two entries (§ 5.3).                                                                                                                                                                                                                                                                                                                                                                  |
| `meta.cohort`                    | integrity | A new or changed `Cohort` other than `[none]` is not the full path of an open cohort in `after`: a slug naming a cohort whose `Parent` is null, or `parent/child` naming one whose `Parent` is `parent` (§ 5.3).                                                                                                                                                                                                                                                              |
| `meta.stage`                     | integrity | A write leaving a work unit in flight, which moves it in flight or changes its `State`, `Current Workflow`, or `Design`, leaves the three inconsistent (`checkCurrentWorkflowConsistency`, `lib/active/current-workflow-consistency.ts`).                                                                                                                                                                                                                                     |
| `meta.prepare-tasks`             | integrity | A write leaving a work unit in flight sets `Current Workflow` to `prepare-work-unit`, or changes `Task List` while it is, and `Task List` does not name the work unit's own task list (`tasks-<slug>.md`, as the layout resolver projects it) reading in `after` — `[none]` and `[none associated]` name none, as `resolveTaskListPath` reads them — or that list holds an open task or fails the cursor's scan (`validateCurrentWorkflow`, `scripts/validate-meta-spec.ts`). |
| `meta.inbound-held`              | integrity | A write moves a work unit to `Integrating` or to the archive while its inbound list holds an entry in `after`.                                                                                                                                                                                                                                                                                                                                                                |
| `work-item.former-slug`          | integrity | _Shared._ A creation or rename gives a work item a slug that `after` resolves as another record's former slug.                                                                                                                                                                                                                                                                                                                                                                |
| `work-item.slug-edges`           | integrity | _Shared._ A creation or rename gives a work item a slug that a non-archived work unit's `Depends On` named, in `before`, for another record, and that edge still names it in `after` (§ 5.3).                                                                                                                                                                                                                                                                                 |
| `task-list.close`                | authority | A hand edit gives a task line `[x]` or `[~]` that its prior counterpart did not carry — an added line or a new task list's included — or changes the marker of a prior `[x]` or `[~]` line (§ 3.3, § 6.3).                                                                                                                                                                                                                                                                    |
| `task-list.delivery-plan`        | authority | A hand edit changes any line between the `<!-- arc:delivery-plan:start -->` and `<!-- arc:delivery-plan:end -->` markers (§ 6.4).                                                                                                                                                                                                                                                                                                                                             |
| `task-list.completed-identifier` | integrity | An identifier whose task was completed in the prior version has no task line in the next (§ 3.3).                                                                                                                                                                                                                                                                                                                                                                             |
| `task-list.completed-goal`       | integrity | A task completed in the prior version changes or loses its `_Goal:_` line.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `task-list.descriptor`           | shape     | An added or changed root task descriptor cluster breaks the descriptor-spacing rule (`validateTaskDescriptorSpacing`, `lib/markdown/descriptor-spacing.ts`).                                                                                                                                                                                                                                                                                                                  |
| `task-list.segmentation`         | shape     | The next version's segmentation scan (`scanTaskListSegmentation`) reports a diagnostic the prior version's did not, matched by its `code` and its message less the `path:line` prefix — a `task-list-malformed` by its `code` alone, since its message quotes the scanner's error with its line numbers.                                                                                                                                                                      |
| `lineage.inbound-held`           | integrity | A lineage record retiring a work unit is created while that work unit's inbound list holds an entry in `after`.                                                                                                                                                                                                                                                                                                                                                               |
| `cohort.purpose`                 | integrity | A new cohort document, or a write changing its Purpose, leaves the Purpose absent, empty, or `—`.                                                                                                                                                                                                                                                                                                                                                                             |
| `cohort.parent`                  | integrity | A new or changed `Parent` names no open cohort in `after`, nests deeper than one level counting the cohort's own subcohorts, or leaves an open member's `Cohort` disagreeing with it in `after` (§ 8.2).                                                                                                                                                                                                                                                                      |
| `cohort.open-members`            | integrity | A write removes a cohort document, or places it completed, while, in `after`, an open member's `Cohort` names the cohort or an open subcohort's `Parent` names it (§ 8.2).                                                                                                                                                                                                                                                                                                    |

- **The inbound list.** A work item's inbound list (`work-item/inbound`) holds the concerns routed into it awaiting
  integration. It holds an entry when its content, read through `after` and split by the kind's declared entry grammar
  (`splitEntryList`, `lib/store/concurrency/entries.ts`, under `KIND_MECHANISMS["work-item/inbound"].entry`), yields at
  least one entry; a missing list holds none. The inbound kind declares no grammar yet, so the held-entries rules admit
  until its owner declares one, and need no parser of it. Each rule takes the grammar as an input, so its unit cases
  refuse under a stub grammar.
- **Rules reuse today's conditions.** Each rule that replaces a pre-commit or lint condition states the same condition
  as today's check names above, applied to the lines a write adds or changes and compared with the record's prior
  version rather than `HEAD`; the pre-commit checks keep running until the cutover's deletion pass. Four widen.
  `meta.design-entry` admits only the work item's own entries, where `validateSpec` admits any `.md` filename or URL.
  `meta.cohort` requires an open cohort at its full path, where `validateCohort` checks only the path's shape. And
  today's pre-commit numbering pattern sees only an unbackticked `[ ]` or `[x]` bullet in an active or backlog task
  list, while the scanner applies the identifier grammar (`ParentTaskIdSchema`) to every task line form, so a numeric
  third level fails the scan and `task-list.segmentation` refuses it as a new `task-list-malformed` diagnostic.
  `meta.prepare-tasks` requires the work unit's own task list, where `validateCurrentWorkflow` accepts any path
  `resolveTaskListPath` resolves; every tracked `Task List` is `[none]` or the work unit's own.
  `validateLifecycleFields`' `State` conditions move to `meta.field-block`, which refuses an unset or invalid `State`,
  and to `meta.verb-owned-field`, under which no hand edit changes a `State` the stored version records and a verb's
  writer takes a typed `WorkUnitState`.

### 4. The work-item base

The contract's base for a work item is its identity, owner, type, lifecycle location, origin, and links; identity,
links, and placement are already defined (`lib/store/identity.ts`, `lib/store/links.ts`, `lib/store/placement.ts`).

- **The type is the primary record's kind, with no type field.** A work unit's primary is stored as `work-item/meta` and
  an Errand's as `work-item/record`; a read returns the actual kind, history keeps every past one, and promotion
  replaces an Errand record with a meta under the same identity. A field would store the same fact twice, behind a
  check refusing a mismatch. A later type sharing a primary's shape adds the field then, defaulted by each kind's
  parser, which knows its own kind, so no stored record is rewritten. No stored value names the type: a type's name may
  change, and history keeps every stored value forever. The Errand record's `kind: "errand"`
  (`lib/errand/identity-record.ts`) names a type whose name is settled.
- **No `Id` field.** A work item's UID is its key in the store, never meta content: a field would store it twice and
  open it to a hand edit. Until the flip the in-repo implementation resolves identity from the slug; the one-time import
  mints UIDs.
- **The owner** is the person's identity slug as `resolveIdentity` resolves it (`lib/git/identity.ts`): `arc.identity`,
  or the slugified Git `user.name` when that is unset — the slug that already keys every identity-scoped path and ref —
  never an email, which would publish addresses into state. Creation writes it, and handing a work item over is a write
  of it alone. Edit rights at persist, the in-flight view's `mine` filter, status, and locus read it. An Errand's owner
  is implied by its identity-scoped ref until Errands move to project scope, when it becomes a field. A person UID, if
  one is ever needed, takes names as its aliases, so stored owners resolve unchanged.
- **Lifecycle location** is placement. Each type's own states refine it — the meta's `State`, the Errand record's
  `state` — and stay that type's.
- **The origin** is where the work came from: `[internal]` or an issue reference. An Errand record's
  `origin: inbox | description` is a different fact — which capture surface opened it — and stays the record's own.
- **The description is not a base field;** it is the Errand's companion record, kept through promotion.

### 5. The meta kind

#### 5.1 Parser

The meta's parser is `parseMetaRecord` (`lib/active/meta-reader.ts`), registered through the kind's registration module
(§ 1.2).

- **The legacy flat-bullet fallback retires.** Today, when `parseCoreTable` finds no core table,
  `parseMetaProjectionRecord` scans bullets for the core fields. After this change a meta without a core table fails to
  parse, as a malformed core table already does. The five archived metas in the bullet form convert first (§ 12); no
  compatibility reader is added. The core table is read after the H1 (`extractMetadataSection`), so a meta with no H1
  fails to parse too, where today the fallback parses it with every field null; no tracked meta lacks one. One arriving
  by a merge or an import lists as a diagnostic and holds the deciding lifecycle inventory until a hand edit restores
  the H1, which § 3.1 admits.
- **The field block's shape is a write rule, never a parse failure.** A meta with no closing `---`, an unset or invalid
  `State`, no `Design` line, or a duplicated `State`, `Design`, or `Cohort` line still parses; `meta.field-block`
  refuses a write leaving it so (§ 3.6), as today's pre-commit checks do (`validateMetaFieldBlockShape`,
  `lib/active/meta-reader.ts`; `validateSpec`, `validateLifecycleFields`, and `validateCohort`,
  `scripts/validate-meta-spec.ts`). A parse failure would list as a diagnostic, and the deciding lifecycle inventory
  refuses any listing carrying one (`requireCompleteInventory`, `lib/store/lifecycle-storage.ts`).
- **`identifier-list` values** keep today's rendering and parse: each element backticked, the list split on commas
  (`formatValue`, `parseIdentifierList`, `normalizeIdentifierListValue`).

#### 5.2 Parsed and durable fields

`ParsedMetaRecordSchema` (tolerant) and `MetaRecordSchema` (strict, durable) in `lib/active/meta-schema.ts` keep every
field they hold today — `nextTask`, `lastCompleted`, and `blockers` included, so code moved across the flip compiles
unchanged — and gain, together, the keys below. They gain them together because `MetaRecordSchema` is strict and
`toMetaRecord` returns null on a key it does not know, which the review gate refuses (`live-context.ts`,
`pre-publication-composition.ts`). The registered `meta-record` validation surface
(`lib/validation-surfaces/registry.ts`) changes in place.

| Key                 | Markdown                              | Parsed value                                                    |
| ------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `stateAtHandoff`    | `- **State at Handoff:**` bullet      | a `StateVersion`, or `null` when absent                         |
| `commitAtHandoff`   | `- **Commit at Handoff:**` bullet     | a commit hash as written, or `null`                             |
| `sessionType`       | `- **Session Type:**` bullet          | `planning` or `execution`, any other text as written, or `null` |
| `sessionContext`    | `## Session Context` section          | the section's body as prose, or `null`                          |
| `completionNotes`   | each `## Completion Notes` section    | the bodies in file order; empty when absent                     |
| `releaseNotesEntry` | each `## Release Notes Entry` section | the bodies in file order; empty when absent                     |

- **The three bullets** form a `handoff` group rendered after `Next Action`, each omitted when absent, as
  `Promotion Receipt` is: `renderBullets` skips such a field at its default, and `reconcileMetaFields` counts it missing
  only when its caller supplies a value. `Session Type` renders as an enum (`` `Planning` ``). Both schemas type
  `stateAtHandoff` with `StateVersionSchema`, any non-empty string at runtime, which § 2.1's anchor declaration needs of
  the parser's output, and `commitAtHandoff` as a non-empty string. Only `sessionType` differs: the tolerant schema
  holds its text, which the parser lowercases when it recognizes `planning` or `execution` in any case, and the durable
  schema admits only those two. An unrecognized one stays as written, which `meta.durable-fields` refuses from a hand
  edit (§ 3.6); a reader of the tolerant record ignores it with a warning, as the handoff workflow's SESSION-NOTES
  template states of `Session Type` today.
- **A section body** runs from the line after its heading to the next level-two heading, the closing `---` of a field
  block it sits inside, or the end of the file, trimmed, and each occurrence yields its own body. The review gate's
  readiness reads sections the same way, except that it reads on past `---` (`sectionBodies`,
  `scripts/review-gate/readiness.ts`), so its uniqueness and at-most-once rules still see a duplicated section over a
  stored record. Archived metas hold these sections both inside the field block and after it.
- **Completion Notes and the Release Notes Entry** are read as they are. Their shape rules — Completion Notes unique
  and non-empty, at most one Release Notes Entry of a summary followed by unique, ordered, supported categories of
  non-empty items — stay readiness's (`lifecycleArtifactFacts`, `scripts/review-gate/readiness.ts`), checked at
  integration over the stored record, so an entry written before the flip and integrated after it is still checked.
  Eleven archived metas' entries fail those rules today and read unchanged. Delivery reads the parsed sections at
  integration.

#### 5.3 References, edges, and slugs

- **References people read and edit keep names; records only verbs write keep UIDs.** The stored bytes of a meta are
  the file people edit, so `Depends On` and `Cohort` keep slugs and resolve through `lookup`. Lineage, review records,
  the Candidate record, and claims reference work items by UID.
- **`Depends On`** stays a backticked slug list. `meta.depends-on` refuses a new or changed edge that resolves to
  nothing or, a live record first, to more than one record; a reader finding an existing edge gone ambiguous reports
  it rather than choosing. Status renders the edges, decomposition redistributes them, dependency discharge rewrites
  them, and in-flight derivation reads them.
- **`Design`** lists the work item's own artifact filenames, two at most. `meta.design-entry` admits a new or changed
  entry only when it is the work item's own: its draft or spec name after the write, `draft-<slug>.md` or
  `spec-<slug>.md` as the layout resolver projects them (`resolveArcPath`, `lib/layout/projection.ts`), whether written
  or not; or, for a paired spec, `spec-<slug>-prd.md` or `spec-<slug>-rfc.md` when `after` holds the work item's
  `spec-prd` or `spec-rfc` companion. The meta kind spells those two names itself, as the in-repo backend's companion
  mapping does (`lib/store/in-repo/paths.ts`), so every backend's check derives the same filename; no other companion is
  a `Design` entry. No meta in the repository names another work unit's file or a URL, though today's pre-commit check
  admits any bare `.md` filename or `http(s)` URL (`validateSpec`), and `arc stub --design` and `arc start --from` store
  their input as given. From the flip such an entry is refused, from those verbs too; how `arc start --from` takes a
  draft or spec seed is that verb's. The parser reads any entry. Readers: decomposition's planning profile
  (`inferPlanningProfile`), graduation's planning tuple (`planning-artifact-tuple.ts`), in-flight derivation, status's
  purpose read and `arc view design`, the stage consistency check, and delivery's coherence check, which accepts one or
  two entries, one of them the task list's own `Design` (§ 6.1).
- **`Cohort`** is the full path of an open cohort: its slug for a top-level cohort, whose `Parent` is null, or
  `parent/child`, one level deep, for a subcohort whose `Parent` is `parent` (§ 8). A subcohort's slug alone is refused,
  since the projection would lay the member out apart from its cohort. From the flip the owner edits it: the store moves
  nothing, and the projection re-derives the backlog folder from the field. Until then it stays as today, since the
  in-repo implementation refuses placement moves (`admittedWritePath`, `lib/store/in-repo/write-admission.ts`). Status
  groups by it, session-init loads its document, archive sweeps it, and decomposition sets it for new members.
- **A former slug resolves to its own work item alone.** `work-item.former-slug` refuses a creation or rename that
  gives a work item a slug any record holds as a former slug.
- **A slug changes no edge it cannot write.** A completed work unit's slug may be reused, and `lookup` then resolves it
  to the live record first, in the in-repo implementation (`lookupSlug`, `lib/store/in-repo/lookup.ts`) and the
  reference backend alike, so an edge that named the completed record would silently name the new one. So a batch
  giving a work item a slug that an edge already names for another record — a completed work unit's, or a decomposed or
  abandoned origin's — by creating a work unit or an Errand, by a decomposition cut, or by a rename, first settles each
  such edge in the records it may write: provisional and planned stubs, which anyone grooms, and its own. An edge on
  shipped work discharges, and an edge on a retired origin takes its lineage disposition (§ 7.4). The settling touches
  only the edges naming that slug, judged against the state before the batch, and leaves a dependent's other edges as
  they are, unlike the dependency discharge's planner, which reconciles a dependent's whole edge list
  (`planDependencyReconcile`, `side-effects/discharge-dep-edges.ts`); a rename onto a slug the renamed item depends on
  thus settles that edge rather than making the item depend on itself.
- **`work-item.slug-edges` refuses what the batch could not settle,** naming the work units and edges: an in-flight or
  parked work unit's meta stays with its owner and still holds the edge, or a stub's edge has no disposition, as a
  decomposed origin's dependent the cut did not map has none (`unmapped-dependent`, `queryTransitionDisposition`). Its
  remedy: the owner settles the edge with `arc wu reconcile --apply` from the work unit's checkout, after `arc resume`
  for a parked one, or edits `Depends On` when that reconcile refuses; anyone edits a stub's; or the batch takes another
  slug. Edges in archived records gate nothing and read as written. Every verb that creates or renames a work item
  performs the settling when it moves onto the store; today `arc start`'s collision guard refuses a slug any meta holds,
  a completed one's included, but admits a retired origin's or a former slug (`hasNameCollision`, `resolveSlugState`),
  and no creating verb settles edges. Activation still discharges edges to shipped work.
- **A rename rewrites in its batch the dependents' edges it may write,** those in stubs, so those files show current
  names; an in-flight or parked dependent's meta keeps the former slug, which `lookup` resolves at its owner's
  reconcile.

#### 5.4 Field ownership

Four kinds of verb write metas: lifecycle verbs and their executor; decomposition's cut; spawn scaffolding, Errand
promotion, and handoff; and `arc attest` (`handlers/lifecycle-delivery-review.ts`). Status writes none, and Candidate
applicability (`handleCandidateApplicabilityResolve`) writes no meta. A field one verb alone writes stays that verb's;
the fields below cross verbs.

| Field                                      | Written by                                                                                                                                                                                                                                 | Hand edit         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `State`                                    | lifecycle transitions                                                                                                                                                                                                                      | refused           |
| `Class`                                    | a `Class` verb at any stage, by `classify-work-unit`'s confirm-or-ratchet, beside the shipped flags `arc finalize --class`, `arc promote --class`, `arc stub --class`, `arc start --class` at graduation, and `arc errand promote --class` | refused           |
| `Current Workflow`                         | `arc set-stage`, transitions, and `arc attest`'s stage change                                                                                                                                                                              | refused           |
| `Design`, `Task List`                      | `arc repoint-design` and `arc finalize`; creation seeds `Design` (`arc stub --design`, `arc start --from`); rename rewrites both                                                                                                           | admitted, checked |
| `Owner`, `Priority`, `Origin`, `Cohort`    | creation                                                                                                                                                                                                                                   | admitted, checked |
| `Depends On`                               | creation; decomposition seeds its members' and rewrites dependents'; dependency discharge; rename                                                                                                                                          | admitted, checked |
| `Next Action`                              | transitions, graduation, `arc finalize`, `arc set-stage`, decomposition's seeds, `arc attest`, the spawn scaffold (`worktree-scaffold.ts`), Errand promotion's own rendering (`promote-runtime.ts`), and handoff                           | admitted          |
| handoff fields and Session Context (§ 5.5) | handoff writes them, archive clears them, from the flip                                                                                                                                                                                    | admitted, checked |
| `Last Completed`, `Next Task`, `Blockers`  | today's verbs until the flip; none after it (§ 5.5)                                                                                                                                                                                        | admitted          |
| `Branch`, `PR URL`                         | today's verbs until the flip; from it the branch and change-request links hold them, and no verb writes them to the meta                                                                                                                   | admitted          |
| `Candidate`                                | today's verbs until the flip; from it the Candidate record's `attestation.candidateId` holds it, and no verb writes it to the meta                                                                                                         | admitted, checked |
| Completion Notes, Release Notes Entry      | the owner; delivery reads them at integration                                                                                                                                                                                              | admitted          |

- **A field is verb-owned when a hand edit could slip past a gate:** `State`, behind the lifecycle ceremonies; `Class`,
  which review assurance reads (`scripts/review-gate/policy/assurance.ts`); `Current Workflow`, which the executor's
  recovery marker and the stage consistency check read; and a task's completion or deferral (§ 6.3). The owner edits the
  rest from the owning checkout, validated by the parser and the check. `meta.durable-fields` holds every field a hand
  edit writes to what the durable schema admits, and `Owner` to an identity slug, since edit rights read the owner and
  the review gate refuses a meta the durable schema rejects (`toMetaRecord`); `Origin` stays prose
  (`[internal] — <note>`), refused only unset. Edit rights already limit `Owner` to the owner, so handing a work item
  over is the owner's own edit.
- **Creating a meta is one writer** (§ 5.6), which `arc stub`, spawn scaffolding, decomposition's new members, Errand
  promotion, and park's pointer record (`composePointerRecord`, `lib/work-unit/pointer-record.ts`) call. The pointer
  record sets a callout before the H1, which the parser passes over, since it reads the core table after the H1 (§ 5.1).
  The scaffold keeps writing the checkout marker and the meta's seeded `Next Action`.
- **From the flip, delivery writes no meta:** `arc attest`'s stage change goes through the `Current Workflow` writer
  inside its batch.
- **Until the flip** today's setters stay as each verb's in-repo arm, and each verb adopts the writers as it moves onto
  the store. From the flip, every workflow step that hand-edits `Class` moves onto the `Class` verb, or onto a shipped
  flag where one covers it; none covers activation's `Class` settle, since `arc activate` takes no `--class`; init's
  post-init ratchet and a new work unit's resolution, since `arc start --class` applies only at graduation
  (`handlers/start.ts`); init's Errand-promotion step resolving a `Class` that `arc errand promote --class` did not
  supply; promotion's ratchet, which `arc promote --class` refuses (`lib/work-unit/verbs/promote-demote.ts`); or
  draft-design's capture, since `arc finalize` fires only at create-spec, amend-design, and generate-tasks
  (`lib/work-unit/verbs/finalize-stage.ts`). The steps that hand-edit `Branch` — deactivation's branch rename and init's
  re-run — move onto verbs too.

#### 5.5 Session context

From the flip, session context is part of the meta, which teammates can read, rather than a personal `SESSION-NOTES.md`;
before it, `SESSION-NOTES.md` carries it as today. The meta's schema carries both now, so code reads one shape across
the flip.

- **Fields kept:** `State at Handoff`, the state-version anchor naming the state a handoff saw; `Commit at Handoff`, the
  code-head baseline, which handoff restating reads for the code commits a state version cannot see
  (`deriveRestateCandidates`, `lib/handoff/restate-candidates.ts`); `Next Action`, the one directive many verbs write
  (§ 5.4), which session-init's orientation and `--next` act on; and an optional `Session Type`, session-init's
  planning-or-execution override.
- **Fields retired from the flip:** `Next Task`, for the cursor derived from the task list (§ 6.2), which recovery
  already uses alone and session-init falls back to — a person sees the next task in `Next Action`, which also says
  when work runs out of order; `Last Completed`, derived from the task list's last completed task, as `arc publish`
  already does (`resolveLastCompletedTask`); `Blockers`, into the prose, since no code reads it; and `SESSION-NOTES`'
  `Working On`, since the meta is the work unit. Verbs keep writing `Next Task`, `Last Completed`, and `Blockers` until
  the flip, branching on the capability; the parsed record keeps them until the cutover's deletion pass.
- **The section,** `## Session Context`, carries what `SESSION-NOTES`' prose sections carry today — Uncommitted Work,
  Remaining Work Before Returning to Task List, and Additional Context, as handoff writes them, each a level-three
  subsection — plus `Blockers`, as prose the parser keeps whole. It sits after the last field line and before any
  Release Notes Entry or Completion Notes, inside the field block; handoff writes it whole. The section writer throws on
  a body line § 5.2 reads as ending the section — one opening with `##` and a space, or a standalone `---` — inside a
  code fence or not, since the body's boundary, like readiness's `sectionBodies`, reads no fences.
- **Archive clears** the section, both anchors, and `Session Type`, and resets `Next Action` as today, its cleared value
  rendered `—` (§ 5.6).
- **Nothing writes them before the flip.** Each is omitted when absent (§ 5.2), so no meta changes and no reader sees a
  difference. The one-time import folds each `SESSION-NOTES.md` into the meta of the live work unit its person owns —
  the prose sections, up to the file's closing `---`, into the section, each `##` heading demoted to `###`,
  `Commit at Handoff` and a recognized `Session Type` into fields, dropping any other `Session Type` as session-init
  ignores it today, and a `Blockers` other than `[none]` into the prose — drops `Working On`, `Next Task`, and
  `Last Completed`, and writes no `State at Handoff`, so the first handoff after the flip takes restating's existing
  baseline-unknown fallback.

#### 5.6 Field writers

The meta kind's writers are pure transforms over content a verb read through the store, applied before its write.

- **Typed values, rendered by the writer.** Each writer takes the field's semantic value as `MetaRecordSchema` types it
  — a `WorkUnitState`, a `MetaWorkClass`, a slug list, a filename, a `StateVersion`, or `null` — and renders its
  canonical form, sentinels included, as `renderMetaFile` renders a fresh meta. Writing `null` to a field omitted when
  absent removes its line; to any other field, it renders the sentinel `renderMetaFile` gives an unset value — `—` for
  `Next Action`, `[none]` for every other (`renderNullable`). No caller formats a value. An identifier list longer than
  the bullet width wraps as `renderMetaFile` wraps it (`wrapCommaList`, at `META_BULLET_WRAP_COLUMN`), as
  `reconcileMetaFields` and the setters calling it already do, where `setMetaBulletFields` and `setMetaDesign` write it
  on one line today (`formatValue`): the storage-seam cut wrote a 183-character `Depends On` (`d9d838940`) that a later
  commit wrapped by hand.
- **One exported writer per field, touching only its own lines.** A core-table writer re-renders only the table's three
  rows, as `setMetaState` does today. A bullet writer replaces only its bullet and its continuation lines, inserting the
  bullet at its canonical place in field order when absent, and moves nothing else. The field region ends at its last
  field line, so a section inside the block — Session Context, a Release Notes Entry, Completion Notes — survives every
  writer. The writers are: one per field of `META_FIELDS` and § 5.2's three bullets; the Session Context section writer,
  which sets the body whole, inserts the section at its place when absent, and removes it on `null`; the title writer
  (`# Metadata: <slug>`); and the creation writer, which renders a whole meta from a typed record.
- **Writers fail loudly on an unanchored meta.** A meta with no H1, or no `---` after it, makes every writer throw.
  Today such a meta mostly passes unchanged — `reconcileMetaFields` returns it as is, and a setter throws only when the
  missing anchor blocks it — and graduation, `arc start`, and the pre-commit check refuse it first
  (`validateMetaFieldBlockShape`); from the flip the parser refuses one with no H1 (§ 5.1), and `meta.field-block` one
  with no closing `---`.
- **`Promotion Receipt` stays immutable** inside its own writer, which refuses to change a present receipt; the generic
  any-field writer, which stays internal and is never adopted by a verb, no longer special-cases it.
- **The section-deletion fix.** Today `reconcileMetaFields`, when it backfills a missing bullet, replaces every line
  from the first field bullet to the `---`, deleting any section between; it instead inserts only the missing lines and
  never re-renders a present one. `setMetaCandidate`'s unconditional reconcile goes, since the `Candidate` writer
  inserts its own absent bullet, as does `setMetaFinalizeFields`' reconcile of a partial `PR URL` and `Completed` group.
- **Today's setters delegate.** `setMetaState`, `setMetaBranch`, `setMetaTitle`, `setMetaClass`,
  `setMetaCurrentWorkflow`, `setMetaDesign`, `setMetaCandidate`, `setMetaFinalizeFields`, `setMetaBulletFields`,
  `reconcileMetaFields`, and `normalizeMetaCoreTable` keep their signatures and delegate to the writers, parsing a
  preformatted value back to its semantic form where the writer takes one. Their output and failures match today's
  except where this section's corrections apply: an identifier list wrapped where `setMetaBulletFields` and
  `setMetaDesign` write one line; a backfill that adds only missing lines and keeps every section; `setMetaCandidate`
  backfilling no other bullet, so `arc attest` no longer fills a drifted meta's missing fields; an absent bullet
  inserted where `setMetaBulletFields` throws today; `setMetaFinalizeFields` placing an absent `PR URL` and `Completed`
  in field order rather than just before the closing `---`, and, with one present, backfilling no other bullet; a
  cleared `Next Action` written as `—`, where today's deactivate, reopen, and archive resets
  (`lib/work-unit/lifecycle-transitions.ts`) and `arc attest`'s Shipped orientation (`lib/work-unit/verbs/attest.ts`)
  write `[none]`, both reading as null; and a throw on an unanchored meta, which `reconcileMetaFields` returns unchanged
  and other setters write today.

### 6. The task-list kind

#### 6.1 Parser and parsed fields

- **Parsed fields: `{ design: string | null }`** — the filename in the header's `- **Design:**` bullet, above the first
  phase heading, backticks stripped, or `null` when absent. Delivery's coherence check reads the parsed `Design` in
  place of its header pattern (`handlers/delivery.ts`) when delivery moves onto the store; the `Design` it names is one
  of the meta's `Design` entries.
- **The parser never refuses.** 22 of the repository's 129 tracked task lists fail today's scanner
  (`scanTaskListStructure`, `lib/task-list/scanner.ts`) — all archived between 2025-q4 and 2026-q2, with root-level
  markers or identifiers from before the current grammar — and the parser refuses nothing a stored record holds.
- **`lib/task-list/` stays the kind's public parsing library.** It computes over a task list's content and reads none,
  so it carries no ratchet entry. Readers run it over the content a read returns, each deriving its own view — the
  cursor, the last completed task, tallies, the current region, the Goal inventory, segmentation — and the write check
  runs it over the prior and next versions. Its one file-backed reader (`resolveTaskListCursorFromFile`,
  `lib/task-list/file-cursor.ts`) reads by path and moves with its caller (`lib/locus/subject-meta.ts`).
- **The grammar is today's:** markers `[ ]`, `[x]`, and `[~]`; dotted identifiers whose third level, when present, is
  not numeric — `N.M` for parents and `N.M.a` for subtasks by convention (`ParentTaskIdSchema`) — with a task's role
  taken from its line's shape, a heading for a parent and an indented bullet for a subtask.

#### 6.2 One cursor

`resolveTaskListCursor` (`lib/task-list/cursor.ts`) is the next task — the only one once the meta's `Next Task`
retires (§ 5.5). Session-init, recovery, and the compaction seed read it; `arc reopen`; `arc attest`, which also reads
`resolveLastCompletedTask`, as `arc publish` does; delivery's entry inspection (`lib/delivery/entry-inspection.ts`) and
`handlers/delivery-execution.ts`; `arc view`; and the pre-commit stage check (`validate-meta-spec.ts`) until the flip,
when the meta's check takes its rules.

#### 6.3 Closing a task

A task leaves open only through the close verb: completed (`[x]`), or deferred (`[~]`), since a deferral slips past
the task gate as a completion would. Only completion records task captures. `task-list.close` refuses a hand edit
closing a task — giving a line, an added one included, `[x]` or `[~]` its prior counterpart lacked (§ 3.3) — or
changing a closed task's marker; open tasks and future phases stay the owner's to restructure. A
completed task keeps its identifier and its `_Goal:_` (`task-list.completed-identifier`, `task-list.completed-goal`):
task captures are keyed by task identifier (`taskCaptures`, `lib/store/links.ts`), so renumbering a completed task would
orphan its captures, whatever the commit-footer policy; and delivery binds a digest of each parent task's Goal
(`extractTaskGoalInventory`, `lib/delivery/task-inventory.ts`), a target written before the work, amended forward by a
`_Retired in:_` line rather than rewritten.

#### 6.4 The delivery-plan region

The delivery plan stays a section of the task list that `arc delivery compose` alone writes between the
`arc:delivery-plan` markers (`DELIVERY_PLAN_START_SENTINEL`, `lib/delivery/task-list-render.ts`).
`task-list.delivery-plan` refuses a hand edit there; the unmarked provisional `## Delivery Plan` used while authoring
stays editable.

#### 6.5 Writers and rules

- **The marker writer** sets `[x]` or `[~]` on one task line, named by its identifier, and changes nothing else — the
  close verb's writer.
- **The delivery-plan splice** replaces the content between the two markers with the plan `arc delivery compose`
  renders; rendering stays delivery's, the region the kind's.
- **The pre-commit `task-numbering` check, and the stored-task validation of `lint:md:descriptors`**
  (`selectTaskDescriptorPaths`, `runWorktreeTaskDescriptorLint`, `lib/markdown/descriptor-worktree.ts`), move into the
  kind's check as `task-list.descriptor` and `task-list.segmentation` (§ 3.6), applied to the task lines a write adds or
  changes; a numeric third-level identifier fails the scanner's grammar, which segmentation reports. Segmentation
  diagnostics span the whole plan, so the rule refuses only one the prior version's scan did not report, matched without
  its line, so a line shift above it changes nothing (`TaskListSegmentationDiagnostic`,
  `lib/task-list/segmentation.ts`); a `task-list-malformed` matches by its code alone, since its message quotes the
  scanner's error, line numbers included (`scanTaskListStructure`). Four archived task lists carry numeric third-level
  identifiers and are never rewritten. `hooks.task_numbering`, which sets today's check to `error`, `warning`, or `off`,
  retires with that check in the cutover's deletion pass; the write check reads no configuration. The shipped task
  template and tracked task documents that are not state keep their worktree and index checks.
- **Verify's Success Criteria checkboxes and the task list's completion notes** stay the lifecycle verbs' to write.

### 7. The lineage kind

The lineage record (`lineage/transition`) is create-only (`KIND_MECHANISMS`) and records a retired work unit's
terminal transition, keyed by its origin.

#### 7.1 Final shape

```ts
type WorkItemRef = { name: Slug; uid?: UUID };          // name at the transition; uid absent until the import mints it
interface LineageRecord {
  schemaVersion: 2;
  origin: WorkItemRef;
  kind: "decompose" | "abandon" | "rename";
  successors: WorkItemRef[];
  incoming: {
    dependent: WorkItemRef;
    disposition: { kind: "replace"; replacementTargets: WorkItemRef[] } | { kind: "drop"; reason: string };
  }[];
  outgoing?: { prerequisite: WorkItemRef; members: WorkItemRef[] }[];
}
```

- **Every work-item reference carries its name at the transition and its UID**, the UID absent until the one-time
  import mints it, as an owner identity's is (`OwnerIdentitySchema`, `lib/store/identity.ts`). The name serves display
  and reverse lookup of a retired origin's slug.
- **`incoming`** is today's `edges`: each dependent of the origin, replaced by named targets or dropped with a reason.
  It instructs the dependents the retiring batch cannot write (§ 7.4).
- **`outgoing`** is each of the origin's own prerequisites with the members that take it, empty when none did. It
  records where the origin's prerequisites went, stated by the cut from its cut map: the decomposition rehearsal of
  2026-10-05 found today's record, listing only incoming dispositions, unable to show it, which otherwise must be
  rebuilt from the history of the origin's and the members' `Depends On`, as § 12 does by hand for two records. No verb
  reads it at landing; it is the cut's account of the redistribution for whoever audits one. From the flip the record is
  create-only, so a field added later could not reach records already stored. It carries no reason, since nothing reads
  one: a shipped prerequisite reads as shipped from its own placement, and the reason a cut gives for dropping one not
  yet shipped (`OutgoingDispositionSchema`, `decompose-v3-schema.ts`) goes unrecorded. A member is any destination the
  cut map lets take a prerequisite — a successor, or an existing work unit a heterogeneous cut names
  (`dependencyRecipients`, `decompose-v3-schema.ts`), as `incoming`'s targets already are.
- **Rules carried over from `TransitionRecordSchema`** (`lib/work-unit/transition-record.ts`): a decomposition has at
  least one successor, a rename exactly one, an abandonment none; successors are unique and ordered by name; dependents
  are unique; replacement targets are unique and ordered by name; only a decomposition carries `incoming` entries.
  **Added:** `outgoing` is present exactly on a decomposition, its prerequisites unique, each one's members unique and
  ordered by name. The parser checks no member against `successors`.
- **`schemaVersion` 2 marks this shape;** the store's per-record format version (`FormatVersionSchema`) is separate and
  unchanged.

#### 7.2 Parser and writer

- **The parser** decodes the JSON and refuses a record the schema rejects, as today's codec does
  (`parseTransitionRecord`): a create-only machine record converts whole. It is a public pure function in
  `lib/store/kinds/lineage/` (§ 1.2).
- **The writer** is one create-only function from a typed record to canonical bytes: canonical JSON
  (`canonicalize`, `lib/kernel/canonical/canonical-json.ts`), with `successors`, `incoming` by dependent, `outgoing` by
  prerequisite, and every reference list ordered by name in UTF-8 byte order, so a record round-trips byte-identical.
- **One shape for both backends.** The in-repo implementation stores this shape from the start, so code moved onto the
  store runs unchanged across the flip.

#### 7.3 Producers and readers

Every module that produces or reads the record moves to the new shape in this change. At this change's base eleven
production modules and 21 test files import the record's type, schema, or codec, and further modules read its fields
through the enumeration, the disposition query, or the store, across lifecycle, decomposition, status, delivery, the
user-reference reconcilers, and the store itself; the full set is every importer of `TransitionRecord`,
`TransitionRecordSchema`, `parseTransitionRecord`, or `serializeTransitionRecord`
(`lib/work-unit/transition-record.ts`), and every reader of a record's `origin`, `successors`, or `edges`.

- **Producers:** decomposition's record builder (`createDecomposeTransitionRecord`, `decompose-transition-record.ts`),
  which derives `outgoing` from the cut map's outgoing dispositions (`outgoingDispositions`, `decompose-v3-schema.ts`);
  the terminal writer (`terminal-transition-record-writer.ts`); abandonment's and rename's verbs (`verbs/abandon.ts`,
  `verbs/rename.ts`); and base advancement, which serializes the record it commits
  (`git-decompose-transition-base-advancement.ts`).
- **Store readers:** the in-repo read and listing decode (§ 11.1), the write path's own-key read (§ 11.2), and
  `lookup` by lineage origin and former slug (`lib/store/in-repo/lookup.ts`).
- **Other readers:** among them the enumeration and its validation (`git-transition-record-enumeration.ts`,
  `transition-record-enumeration.ts`), the disposition query (`transition-disposition-query.ts`), dependency discharge
  (`side-effects/discharge-dep-edges.ts`), the reference reconcilers (`reference-reconcile.ts`,
  `user-reference-reconcile.ts`), delivery's plan resolution (`lib/delivery/plan-resolution.ts`), decomposition's
  operation and retirement authorization (`decompose-v3-operation.ts`, `git-decompose-v3-operation.ts`,
  `git-retirement-authorization-context.ts`), the lifecycle executor's current-work-unit context
  (`executor-context-current-wu.ts`), the lifecycle, reconcile, status, and user handlers, and the ROADMAP assert.
- **The live transition-record test** (`live-transition-records.test.ts`), which parses and round-trips every tracked
  record on every pull request — docs-only ones through the ARC contract tier (`test:arc-contracts`,
  `.github/workflows/ci.yml`) — moves to the new shape with the readers. The cutover's deletion pass removes it.

Each reader changes only to the new shape; which subsystem's store reads it moves onto stays with that subsystem.

#### 7.4 What lineage records, and who reads it

- **Decomposition and abandonment write it** from the flip; until then rename writes it too (§ 7.5). The verbs write
  through the kind's writer.
- **`incoming` instructs the dependents the retiring batch cannot write.** The cut rewrites the dependents it may write
  — stubs, which anyone grooms — while an in-flight or parked dependent's meta stays with its owner, who applies its
  disposition at the work unit's own reconcile (`TransitionDispositionQuery`, `side-effects/discharge-dep-edges.ts`),
  after `arc resume` for a parked one. Today's cut instead rewrites every dependent the cut map names whose meta it can
  write on base, a parked one's included, and refuses one it cannot (`unwritable-dependent`,
  `decompose-v3-conservation.ts`).
- **Abandonment** keeps no successors or edges, and its dependents read an `abandoned` disposition from its kind.
- **Readers:** teardown, as the retirement receipt; the reference reconcilers, for terminal outcomes; `lookup` by
  lineage origin; dependents at their reconcile; and status, so a decomposed origin reads as decomposed rather than in
  flight. None reads `outgoing` at landing (§ 7.1).

#### 7.5 Rename until the flip

The in-repo implementation writes rename records and resolves former slugs through them, so `rename` stays in the kind
until the flip. From the flip, rename's readers move to `lookup`'s former slugs — the reference reconcilers, delivery's
plan resolution, and a dependent's `retarget` disposition (`transition-disposition-query.ts`) — and lineage holds
terminal transitions only. The one-time import turns the repository's three rename records into former slugs on their
successors, all archived, and imports no rename lineage; the cutover's deletion pass drops `rename` from the kind.

### 8. The cohort-document kind

A cohort document (`cohort/document`) is a prose record owned by its cohort, with one home while the cohort is open.
Everything beyond its two parsed fields stays prose.

#### 8.1 Parser

- **Parsed fields: `{ purpose: string | null; parent: Slug | null }`.**
- **`purpose`** is read as drafts read it (§ 9): any value, `—` and empty included; `cohort.purpose` enforces the
  floor at write.
- **`parent`** is `null` when the `**Parent:**` line is omitted or reads `[none]`, and the slug when the value is one
  backticked slug. The parser refuses any other `Parent` line — a bare value, anything else — or a second one. The
  repository's documents hold six omitting the line, nine with `[none]`, three backticked, and one bare,
  `cohort-storage-seam.md`, which converts in this change (§ 12).
- **Why `Parent` refuses where Purpose does not:** `Parent` is the cohort's one stored statement of where it nests. The
  store keys a cohort's document by UID and keeps no path, and the projection lays out the folder from the line, so a
  guessed parent misplaces the cohort. A refused document lists as a diagnostic naming it, and a rule reading it
  refuses only a write changing a `Cohort` to name it.

#### 8.2 Rules

- **`cohort.purpose`:** a new cohort document, or a write changing its Purpose, has a Purpose that is neither empty nor
  the `—` sentinel decomposition's scaffold writes, as today's consistency check requires (`hasPurposeFloor`,
  `lib/active/cohort-consistency.ts`). A cut's batch therefore carries an authored Purpose.
- **`cohort.parent`:** a new or changed `Parent` names an open cohort, nests no deeper than one level counting the
  cohort's own subcohorts, and leaves every open member's `Cohort` agreeing within the same batch. With `meta.cohort`
  (§ 3.6) and `cohort.open-members` it replaces today's condition (b), every cohort folder holding a document with a
  Purpose.
- **`cohort.open-members`:** a write removing a cohort document, or placing it completed, leaves no open member whose
  `Cohort` names the cohort in `after`, and no open subcohort whose `Parent` names it, so a parent closes only once its
  subcohorts close (§ 8.6), as today's condition (b) requires a document for every ancestor folder (`addWithPrefixes`,
  `lib/active/cohort-consistency.ts`). An archive placing the document completed in the batch that archives its last
  open member passes, since `after` holds that member completed; a document removed by hand while members name it is
  refused, where session-init's cohort load (`resolveActiveCohortDocPath`) would otherwise find nothing and report
  nothing.
- **Open** is read through `after`: a cohort is open when its document reads and its placement is not completed.
  Expected contract: a backend that archives cohort documents returns a completed placement for an archived one; the
  in-repo implementation returns none, and runs no checks.
- **No verb re-parents a cohort.** Decomposition writes `Parent` only into a new document (`renderV3IncompleteCohort`),
  and rename's reference sweep touches no `Parent` line (`planRenameReferences`).

#### 8.3 Writers

- **Creation:** a cohort document rendered from the shipped template's identity — the heading, the template's
  identity paragraph, a backticked `Parent` for a subcohort and none for a top-level cohort, the Purpose (the `—`
  sentinel when the author has not yet written one), and optional member sections. Decomposition's scaffold writes a new
  document through it.
- **Member-heading rename:** today's `rewriteCohortMemberHeading` (`lib/work-unit/rename-reference-sweep.ts`), moved
  into the kind's folder, its one caller importing it from there.

#### 8.4 Decomposition's checks, its scaffold, and the template

- **The two checks compare the parsed `parent` with the document's path:** decomposition's topology check
  (`structurallyMatches`, `decompose-v3-topology.ts`) and its destination check (`validateCohortDocumentClaim`,
  `git-decompose-v3-destination-validation.ts`). A top-level cohort's document reads `parent` as `null`, a subcohort's
  as its parent's slug; a document that fails to parse refuses, as a mismatched line does today. Both compare text
  today, requiring no `Parent` line for a top-level cohort and a bare one for a subcohort, so a cut touching any of the
  six planned top-level documents that carry `[none]`, or the one planned subcohort document with a backticked parent,
  refuses.
- **The scaffold writes the backticked form** through the creation writer. Today `renderV3IncompleteCohort` writes a
  bare parent, which the parser refuses, so the scaffold, the checks, and the parser land together: a scaffold changed
  alone fails its own topology check.
- **The shipped cohort template** (`template-cohort.md`, edited in package source and synced to the project copy) takes
  the backticked placeholder, `` **Parent:** `{parent-cohort-name}` ``, so a document written from it parses. The
  guidance its placeholder carries today — a subcohort's line only, omitted for a top-level cohort, and a convenience
  pointer derivable from the `Cohort` path — moves to a guidance placeholder of its own after the line, unchanged until
  the workflow and template text change at the flip. The scaffold's template anchor (`**Parent:** {` in
  `renderV3IncompleteCohort`) moves with the line; the scaffold already drops everything between the `Parent` and
  `Purpose` lines.

#### 8.5 The member-section report

Today's consistency check (`checkCohortConsistency`) has three conditions. (a), a member's `Cohort` matching its folder,
retires at the flip, since the projection derives the folder from the field. (b) becomes `meta.cohort`,
`cohort.open-members`, and the Purpose and Parent rules. (c), every member section naming a member, becomes a report
rather than a refusal, so one stale section never blocks another writer's save.

- **The report** is a public pure function in the kind's folder: given a cohort document's content and the cohort's
  member slugs (the work items whose `Cohort` names it; for the pre-commit check, its live and staged members together),
  it returns each member section — a level-three heading holding a backticked slug under `## Members`, as `memberSlugs`
  reads them — naming no member. Readers surface it; nothing refuses on it.
- **`checkCohortConsistency`'s condition (c) computes through the report,** so the pre-commit check's diagnostics stay
  as today.

#### 8.6 Life and access

- **Anyone with write access edits a cohort document,** as anyone grooms a stub, merged by line. Each member's own
  section under `## Members` stays that member's by convention, which is what lets parallel writers merge cleanly;
  nothing enforces it.
- **Writers:** decomposition's cut creates a top-level or subcohort document, backfills a subcohort's missing parent
  (`planTopology`), and appends its fan-out block to a parent at the nesting cap (`planAtCap`); a person may create one
  by hand; rename's sweep rewrites a renamed member's references and section heading in rename's batch; archive closes
  it. **Readers:** session-init's cohort load and the locus frame (`resolveActiveCohortDocPath`,
  `lib/session-init/cohort-doc.ts`), which `arc view cohort` shares; `arc status`, through the frame's `cohortDocPath`;
  decomposition's topology check; and readiness.
- **Archive closes it** when the cohort's last open member archives: from the flip it joins that quarter's archive
  beside the member, as today's `NNa` and `NNb` sidecars do (`sweepCohortDoc`, `sweepNestedParentDoc`), a nested parent
  once its subcohorts close; readiness's closeout facts (`cohortCoordinateFacts`, `scripts/review-gate/readiness.ts`)
  then read that placement through the store rather than probing the planned path. Until the flip the pre-commit
  checks, the sidecar sweeps, and readiness's path probes stay as today.

### 9. Drafts, specs, and companions

- **One Purpose reader** is the one parsed field of the draft, spec, and companion kinds: `{ purpose: string | null }`.
  It reads the first `**Purpose:**` field outside a heading, as a list item or a bare line, joining its continuation
  lines — up to a blank line, a heading, another bold field label, or `---` — by single spaces, trimmed; `—` and empty
  are returned as written; `null` when the field is absent. The `brief` spec form, which has no Purpose, reads `null`.
- **The parser never refuses.** A draft or spec with no Purpose, the `—` placeholder, or a half-written edit always
  persists, since write-back skips a file its parser rejects and a draft being written would then go unsynced.
  Reading an empty value or `—` as no purpose stays in status's purpose read. Nothing requires a design's Purpose: a
  stage that ever needs one checks it in its verb, never in the parser.
- **Companions take it too.** A paired spec's halves, `spec-prd` and `spec-rfc` (`lib/store/in-repo/paths.ts`), are
  companions, one kind whose parser sees only content, and status's `design` selector (`selectWorkUnitDesign`) reads
  the first `Design` entry with a Purpose; a companion without the field reads `null`. Notes register no parser.
- **Left unparsed:** the title line, since a work item's identity is its name and UID, not its heading; `Origin`, which
  repeats the meta's base field and has no reader; and the spec form, which only title labels carry. Rename retitles
  only an exact self-title on the first top-level heading (`ARTIFACT_SELF_TITLE_RULES`, `rename-reference-sweep.ts`),
  and decomposition only a first line holding the origin slug (`retitleScaffold`), each a text edit in its own batch.
- **No writers.** The owner writes these by hand; decomposition's scaffold copies the origin's draft or spec to each
  member (`scaffoldSource`, `decompose-v3-repository-plan.ts`), and rename's sweep rewrites them, each editing text in
  its own batch.
- **Readers:** status's purpose read and `design` selector; decomposition reads only the meta's `Design` for its
  planning profile.

### 10. The Errand record's check

The Errand record (`work-item/record`) keeps the contract's schema and its codec (`lib/errand/identity-record.ts`). Its
registration carries a check alone, holding the two shared slug rules, `work-item.former-slug` and
`work-item.slug-edges` (§ 5.3), since creating an Errand gives a work item a slug.

### 11. Backend changes

#### 11.1 In-repo reads and listings

`read` and `list` decode a tracked record through its registered parser in place of `decodeTrackedContent`'s meta and
lineage branches and the meta listing's direct parse (`listMetas`, `lib/store/in-repo/list.ts`, through
`lib/store/in-repo/meta.ts`), so the meta reads as today, through the same parser, and drafts, specs, companions, task
lists, and cohort documents gain parsed fields. A parser failure becomes the existing malformed read outcome and listing
diagnostic. The lineage record's own-key evidence reads `origin.name`, so `identity-mismatch` holds. The Candidate and
integration-boundary branches stay.

#### 11.2 In-repo writes

`writeContent` (`lib/store/in-repo/write-codec.ts`) validates a lineage record through its kind's parser in place of
`TransitionRecordSchema`, binds its own key through `origin.name`, and serializes it through the kind's writer. A meta's
update and a cohort document stay exact-byte and unvalidated. A meta's creation keeps its admission check, which
projects the fields and refuses a malformed `Cohort` path (`creationMeta`, `lib/store/in-repo/write-admission.ts`); it
refuses a meta without an H1 or a core table once the fallback retires, which no writer produces. The in-repo
implementation runs no write check.

#### 11.3 The reference backend and the conformance suite

- **The reference backend** derives the writer (§ 3.2), runs every registered check in its `write` and `batch` paths
  after parsing and before applying, with `before` its state as found and `after` that state with the whole write or
  batch applied, and refuses as § 3.4 specifies. Its `sync` runs no check.
- **The fixture contract** gains a declaration: `FixtureDeclarations` (`__tests__/helpers/store/fixture-contract.ts`)
  states whether the backend runs write checks, and `ConformanceRegistration.create` takes an optional registry
  override, as `createReferenceFixture` already takes `registryOverrides`; a fixture declaring write checks builds its
  store with it. The reference fixture declares write checks; the in-repo fixture declares none.
- **One suite item** runs over every fixture declaring write checks, under a test registration installed through the
  override: the backend refuses a breaking write with `record-malformed`, naming the first rule broken and the first
  record in the batch breaking it, and counting the other broken pairs; a verb in `HAND_EDIT_VERBS` reaches the check as
  a hand edit and any other verb as itself; and a batch's check sees the batch's other writes in `after` and the state
  as found in `before`. The test registration records the writer and views it receives. A fixture declaring none
  excludes the item, with that reason.
- **Each rule is unit-tested** as the pure function it is, with breaking and admitting cases over stub views. The
  reference fixture installs pure test parsers, never production schemas, and its content would break the production
  rules, so the production rules are not exercised through it.

### 12. Conversions and landing

Every tracked record parses under the new parsers today except three groups, each converted in this change ahead of the
code that stops reading its old form, as a committed edit to tracked records: no migration reader or script ships.

- **Five metas in the bullet form,** all archived — `completed/2026-q2/` 10 through 14:
  `meta-work-organization-reform.md`, `meta-worktree-foundation.md`, `meta-errand-enablement.md`,
  `meta-work-routing-discipline.md`, and `meta-in-flight-awareness.md` — convert to the core table before the fallback
  retires; never the reverse, since the deciding lifecycle inventory refuses while any meta fails to parse. Of the
  repository's 259 tracked metas, these are the only ones without a core table.
- **`cohort-storage-seam.md`'s bare `Parent`** converts to the backticked form with the cohort parser, the scaffold, and
  the two checks (§ 8.4). Converted earlier on the base branch, it would make every cut touching it refuse until this
  change lands; no verb rewrites a `Parent` line, so base merges do not conflict there.
- **The 14 lineage records** (`.arc/system/.internal/transitions/`) convert to schema version 2 with the kind and its
  readers. `outgoing` derives for the two decomposition records from each origin's `Depends On` immediately before its
  cut, read from history: `chunked-delivery`'s `review-chunking`, which no member took, and `storage-seam`'s two
  prerequisites, both shipped.
- **Each conversion is verified by parsing before and after:** a meta's parsed fields equal under today's fallback
  before and the table after; a lineage record keeps its origin, kind, successors, and edges, read as `incoming`; and
  the cohort document's `parent` reads `state-storage`.
- **Arrivals convert at the final base merge.** Records the base branch gains in an old form before landing — a
  lineage record from an abandon, cut, or rename, or a subcohort document from a cut's scaffold — convert at the last
  base merge before landing, where the new parsers read every tracked meta, lineage record, and cohort document and any
  they refuse converts. No writer produces a bullet-form meta, so none arrives. After landing, a stray old form surfaces
  where it is read: a listing diagnostic; for a meta, the deciding inventory's refusal; for a lineage record, the live
  transition-record test in CI.

## Alternatives & Rationale

**Where the kinds live (§ 1.2).**

- _Move everything and rewrite every import._ The floor would empty on the first day with nothing rerouted, so it would
  stop measuring what it exists to measure: callers still reading beneath the contract.
- _Re-export the writers from a `lib/store/` barrel over `meta-reader.ts`._ A façade inside the store hands raw state
  to any caller uncounted, which the ratchet ignores by construction; the Errand barrel's equivalent was removed for
  that reason.
- _List the new parsers' modules._ It would add about four files to the floor — decomposition's builder and checks,
  base advancement, the ROADMAP assert — none of which can ever leave it, since each parses bytes no store read reaches.
- _A public aggregate of registrations, or a check-and-parse operation on `Store`._ The aggregate hands meta parsing on
  uncounted; the operation changes the contract for one consumer.

**What a kind registers and how the check runs (§ 2, § 3).**

- _Refuse in the parser._ A parser sees only content, so it cannot judge authority or anything outside the record; a
  parser refusal removes a meta from the deciding inventory and makes write-back skip a half-written file.
- _Return only the first broken rule._ Write-back and save show a person every problem with their edit at once; a
  backend still refuses with one rule, its condition counting the rest.
- _One view over the state the write produces._ The slug-edge rule judges an edge against what its slug named before
  the batch, which the produced state no longer shows once the new item holds the slug; a backend holds both states
  already, so the second view costs nothing.
- _Bind the authority rules only through the projection's direct call._ A hand edit reaching a backend by a path that
  skipped the call — a write-back defect, or a tool persisting under write-back's provenance — would land unchecked;
  deriving the writer in the backend checks it at the write. A verb, or a tool persisting under another verb's name,
  is held to the integrity and shape rules alone in either design, and sync's merged result is reported against them,
  never refused (§ 3.4).
- _An accessor function for anchors, or anchors on `KindMechanism`._ Names suffice and let a backend name the field in
  its refusal; `KindMechanism` excludes the field schema.
- _A second reference fixture with production registrations and real content for every kind._ It doubles the fixture
  surface to test rules that are pure functions; unit cases over stub views reach every rule, the held-entries rules
  included, and one suite item proves the backend wiring.
- _A new refusal code for a broken rule._ `record-malformed` already means a record failing its kind's validation and
  names its rule.

**The work-item base (§ 4).**

- _A type field_ stores the primary record's kind twice, behind a check refusing a mismatch. _An `Id` field_ stores the
  store key twice and opens it to a hand edit. _An email as owner_ publishes addresses into state.

**The meta (§ 5).**

- _Keep the bullet fallback._ It is a compatibility reader for five archived records, which the pre-public-release
  posture rules out, and no record-to-Markdown import remains for it to serve.
- _Validate the field block in the parser._ A parse failure refuses the whole lifecycle inventory; a write rule refuses
  only the write that breaks the shape.
- _Keep today's string setters as the interface._ They let one field be written in two shapes and let a caller pass
  unformatted text; typed writers make the canonical form the writer's alone.
- _Leave the state-version anchor to the handoff work._ This change builds the meta's schema and the handoff's write
  needs it; settling it once here avoids a second schema change.

**The task list (§ 6).**

- _Refuse a list the scanner rejects_ would list the 22 archived lists as diagnostics; _converting them_ invents
  identifiers for archived tasks; _carrying the cursor or scan in the parsed fields_ serves no caller, since every
  caller reads one work unit, holds its content, and derives something different.

**Lineage (§ 7).**

- _Keep today's fields, adding `outgoing` and a side map of UIDs._ A map beside the names needs its own rule to stay
  consistent with them, and today's shape is no reason by itself when code moved onto the store must run unchanged
  across the flip.
- _Add `outgoing` when a verb reads it._ From the flip the record is create-only, so every record stored before then
  would lack it unless rebuilt from history.

**The cohort document (§ 8).**

- _Read a bare `Parent` as the slug, with a write rule refusing new bare lines._ A guessed parent misplaces the cohort,
  and one document holds the bare form.
- _Keep condition (c) as a refusal._ One stale member section would block every other writer's save of the document.

**Drafts and specs (§ 9).**

- _Pass the parser the record's key_ to tell a spec half from another companion. It changes a contract type
  (`RecordParser`) for one kind; one Purpose reader for every companion needs no key.

**Conversions (§ 12).**

- _A new CI test over metas and cohort documents like the live transition-record test._ The readers already report a
  stray form.
- _Convert `cohort-storage-seam.md` on the base branch now._ Every cut touching it would refuse until this change lands.

## Cross-cutting Considerations

**Testing.** Each rule has unit cases over stub views, breaking and admitting. The conformance suite gains one item
for backends declaring write checks (§ 11.3). Parser tests cover each kind's parsed fields over representative and edge
content, including every form a stored record holds. Writer tests assert byte stability outside a writer's own lines,
section survival inside the field block, and canonical rendering of each typed value. The lineage readers' existing
tests move to the new shape with them, and the live transition-record test round-trips every tracked record. The
pre-commit checks' existing tests pass unchanged, the cohort consistency check's included.

**Migration and rollout.** The conversions land in this change (§ 12). A checkout running code from before landing
reads the base's converted lineage records as corrupt: one record it cannot parse makes the transition-record
enumeration report the namespace corrupt (`validateTransitionRecordEnumeration`, `transition-record-enumeration.ts`,
behind `enumerateGitTransitionRecords`), which session-init and `arc user reconcile` show as a user-reference conflict
(`user-reference-reconcile.ts`). Delivery reads the records at the local base branch, which every worktree shares
(`GitDeliveryRenameTransitionSource`, `lib/delivery/plan-resolution.ts`), so from the first pull of the base anywhere,
while any delivery plan is stored, an old-code checkout finds its delivery subject indeterminate and the review gate
refuses its pre-publication reservation (`selectPrePublicationReservationTarget`). Both are bounded and recoverable:
merging the base is the remedy. Landing proposes a personal working-memory entry naming each symptom and that remedy.

**Compatibility.** Under the pre-public-release posture no migration reader or alias ships; the `meta-record` validation
surface changes in place. Before the flip, observable behavior is unchanged except the corrections Goal 5 names: in-repo
write validation stays as today apart from refusing a creation without an H1 or a core table, the pre-commit checks keep
running, today's setters keep their signatures and, outside § 5.6's corrections, their bytes and failures, and every
meta with an H1 and a core table parses to the same fields on today's keys.

**Performance.** In-repo reads and listings now run a parser over drafts, specs, companions, task lists, and cohort
documents: one line scan each, negligible beside the Git reads that fetch them. The write check runs only in the
reference backend before the flip; from it, a check costs the changed lines plus the view reads its rules make, the
slug rules' listing of metas the largest.

**Security and trust.** The authority rules keep a hand edit from moving a work unit's lifecycle state, its `Class`, its
stage, or a task's completion past the gates that guard them, wherever a backend that runs write checks persists it;
the writer is derived from provenance write-back sets itself, never from file content. The owner is an identity slug,
never an email, and `meta.durable-fields` holds a hand edit to that.

**User-facing impact.** None before the flip beyond Goal 5's corrections. From the flip, a hand edit breaking a rule is
refused at persist with the rule's identifier, condition, and remedy.

## Success Criteria

1. **Every kind parses the repository.** Listing each kind this change registers a parser for — `work-item/meta`,
   `work-item/task-list`, `work-item/draft`, `work-item/spec`, `work-item/companion`, `lineage/transition`, and
   `cohort/document` — through the in-repo implementation over this repository returns `complete` with no diagnostics,
   and every meta's parsed fields equal, on today's keys, what `parseMetaRecord` returns at this change's base.
2. **Every rule refuses and admits.** Each rule in § 3.6 has unit cases refusing its breaking write and admitting its
   valid counterpart, over stub views.
3. **The reference backend runs the checks.** In the conformance suite, each fixture declaring write checks — the
   reference backend's at landing — refuses a registered check's breaking write with `record-malformed` naming the first
   rule broken and the first record breaking it and counting the other broken pairs, presents a verb in
   `HAND_EDIT_VERBS` as a hand edit and any other verb as itself, and checks a batch against its other writes and the
   state it found; the in-repo fixture declares none, and every existing suite item passes over both fixtures unchanged.
4. **Writers touch only their own lines.** For each meta writer, content outside the field it writes is byte-identical
   before and after, and a section inside the field block survives every writer and `reconcileMetaFields`; today's
   setters produce today's bytes everywhere § 5.6's corrections do not apply.
5. **Lineage has its final shape.** Every tracked lineage record parses as schema version 2 and round-trips
   byte-identical through the kind's writer; the live transition-record test and every reader's tests pass on the new
   shape.
6. **Decomposition admits the repository's cohort forms.** The topology and destination checks admit a cohort document
   whose `Parent` is omitted, `[none]`, or a backticked slug agreeing with its path, and refuse one that disagrees; the
   scaffold's output passes its own topology check and parses; a document written from the shipped template, in package
   source and the project copy, parses once its `Parent` placeholder holds a slug.
7. **The meta's schema carries session context with no change to stored metas.** A meta written without the new fields
   renders byte-identical to today's renderer, parses with the new keys at their defaults, and passes `toMetaRecord`.
8. **The cohort consistency check is unchanged.** Its existing tests pass with condition (c) computing through the
   member-section report.
9. **No ratchet floor grows.** At landing, `eslint-suppressions.json` records no more `store-raw-state`,
   `surface-names`, or `work-unit-paths` violations, in total or per file, than at the final merged base — 176 across
   124 files, 173 across 76, and 57 across 30 at `a64688b03` — and `npm run -s lint:ts` passes with no suppression
   added.
10. **The quality gates pass** at every tier the project defines.

## Open Questions

None blocks starting. Two dependencies are expected contracts with stated availability, and neither leaves design open:
the held-entries rules admit until the inbound list's kind declares its entry grammar (§ 3.6), and `cohort.parent`,
`cohort.open-members`, and `meta.cohort` read a cohort as open until a backend archiving cohort documents returns a
completed placement (§ 8.2).

## Amendments

None.

---
