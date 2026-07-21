# Spec (`detailed` · `RFC`): cli-layout-resolver

- **Origin:** [internal]

- **Purpose:** Establish one typed, pure authority for projecting semantic ARC layout addresses into canonical
  repository-relative paths, migrate the audited path-construction surface to it, and preserve current layout and
  behavior without absorbing lifecycle, discovery, worktree, Git, or future storage policy.

---

## Introduction / Context

ARC layout knowledge is repeated across production code, tests, hooks, templates, and procedures. Callers directly
compose directory names, lifecycle placements, artifact prefixes, user-document names, and template suffixes. The
completed coupling audit found 15 path classes whose fan-out and volatility justify a common projection boundary;
the highest-ranked classes reach hundreds of files. A future layout or storage change would otherwise require a
large literal-by-literal cascade, while unsafe operands can reach filesystem or Git boundaries before validation.

The shipped CLI substrate now provides the primitives this boundary should consume: Zod-backed `Slug`, canonical
`ManagedPath`, the extensible `ArcError` base, and versioned schema registries under `src/lib/kernel/`; an
argument-array `GitExec` seam backed by execa; and record-backed lifecycle projections that preserve exact source
paths. The resolver must compose those contracts rather than replace them.

This work does not change ARC's directory layout. It introduces a typed semantic address algebra for the audited
layout classes, projects those addresses to today's canonical `.arc/` paths, materializes a managed path beneath an
explicit caller-selected root, and migrates covered semantic producers. The design deliberately stops before
storage effects: a future git-backed materializer may consume the same projection, but read/write/version/sync
semantics remain a separate storage contract.

## Goals

- Own runtime-validated layout-token, placement, artifact, and semantic-address schemas for the audited ARC path
  classes.
- Resolve a semantic address synchronously and without I/O to a canonical repository-relative POSIX `ManagedPath`.
- Convert a managed path to a native absolute filesystem path only when a caller supplies the selected root.
- Preserve every covered current path shape and the current template-output suffix transformation.
- Reject unsafe or structurally invalid inputs rather than trimming, slugifying, normalizing, or repairing them.
- Migrate audited semantic production callers and applicable test callers away from reproducing covered layout
  rules, while preserving exact discovered paths, configured pointers, and independent test oracles.
- Produce a deterministic current-tree migration ledger that accounts for every audited hit and every allowed
  residual by semantic owner.
- Reconcile the audit's tracked-planning Git-operation packet against the shipped Git executor and procedure owners
  without introducing a layout-specific Git adapter.
- Keep the resolver compatible with the planned materialized git-backing-store architecture: projection is
  root-independent, root selection is caller-owned, and no storage mode or new configuration axis is introduced.

## Non-Goals

- Move, rename, or reverse-parse an ARC artifact, or change the current directory layout.
- Implement a storage repository, virtual filesystem, backing-store adapter, artifact materializer, version-checked
  write port, or synchronization protocol.
- Infer lifecycle state, discover work units, parse cohort policy, allocate archive coordinates, select a completion
  sequence, select a current or primary worktree, or check whether a path exists.
- Recompute exact paths supplied by discovery, lifecycle records, manifests, or custom task-list pointers merely to
  force them through the resolver.
- Generalize every filesystem path in the CLI. Scope is the audit's 15 selected path classes plus the composition
  required to project them safely.
- Put typed branch prefixes into the layout contract. Branch identity remains with branch and lifecycle owners.
- Turn arbitrary subsystem-relative paths into new address variants or expose a generic descendant-join escape
  hatch.
- Wrap hook-owned Git inspection or lifecycle-owned Git effects in a second Git executor.
- Rewrite procedure prose solely to remove path literals. Procedure mechanics migrate when their owning CLI verb
  replaces them.
- Publish layout schemas in the kernel JSON Schema bundle. Registry composition and build publication remain
  separate decisions.

## Proposed Design

The implementation is a new `src/lib/layout/` subsystem. It imports neutral primitives from `src/lib/kernel/` and
Node path utilities, but no command, prompt, lifecycle, discovery, user-root, or storage policy. Its public barrel
exports the schemas, inferred types, registry, resolver, materializer, template transform, and local error contract
specified below. Internal file subdivision is an implementation detail.

### 1. Projection and materialization boundaries

The data flow is explicit:

```text
lifecycle / cohort / archive / user-root authority
                       |
                       v
              validated layout address
                       |
                       v
             resolveArcPath(address)
                       |
                       v
       repository-relative POSIX ManagedPath
                       |
                       v
      materializeArcPath(root, managedPath)
                       |
                       v
               filesystem / Git / store
```

`resolveArcPath` is pure and synchronous. It has no `cwd`, filesystem, Git executor, environment, clock, existence
probe, or worktree-topology dependency. It defensively parses its complete input through the public address schema,
constructs the forward-slash projection, and validates the result as `ManagedPath` before returning it.

`materializeArcPath` is a narrow platform adapter. The caller supplies a fully qualified native root selected by its
own policy and the canonical managed path. The adapter validates both operands, splits the managed path on `/`, and
resolves the segments with the host path implementation. It then proves that the result is a strict descendant of
the normalized supplied root with the host `relative` and `isAbsolute` semantics. A result that is empty, absolute
relative to the root, equal to `..`, or starts with `..` plus the native separator is rejected rather than returned.
Git arguments, persisted records, and wire contracts retain the canonical `ManagedPath`; native separators exist
only at the filesystem boundary.

`ManagedPath` rejects a drive prefix at the beginning of the complete POSIX path, but deliberately does not encode
every host filesystem's segment grammar. The Windows adapter therefore also rejects a drive-designator prefix in
**any** managed-path segment (`^[A-Za-z]:`) before calling `path.win32.resolve`. Without that local check,
`x/D:bar` is a valid `ManagedPath` whose later segment makes Node resolve on drive `D:` instead of beneath a supplied
`C:\repo` root. Segment validation plus the independent containment postcondition are both required; the kernel
primitive is not broadened or changed by this work unit.

This split is required for user surfaces. Existing policy places identity-global files under the primary worktree
and per-WU session notes under the current worktree. Layout can project both addresses, but the user-surface owner
selects which root to materialize.

### 2. Ownership boundaries

| Concern | Authority | Input supplied to layout |
| --- | --- | --- |
| WU and cohort segment grammar | Kernel `SlugSchema` and the semantic record owner | Branded `Slug` values |
| Lifecycle state and placement interpretation | Lifecycle and active-discovery modules | Explicit physical placement descriptor |
| Cohort nesting and record parsing | Cohort modules | Zero to two validated cohort segments |
| Archive coordinate allocation | Completed-index/archive modules | Validated quarter and sequence |
| Current-vs-primary worktree selection | User-surface resolver | Selected materialization root |
| Discovery, scans, exact pointers, and existence | Calling subsystem | Exact managed/native path when already known |
| I/O and Git effects | Calling subsystem or future storage port | Managed or materialized path |
| Layout tokens, schemas, and projections | `src/lib/layout/` | N/A |

The kernel owns only neutral shared primitives: `Slug`, `ManagedPath`, `ArcError`, `Result`, and registry contracts.
Layout owns physical placements, artifact kinds, procedure-family roots, suffix rules, semantic address variants,
and their projections. Lifecycle and storage semantics do not move into the kernel or layout.

### 3. Runtime schemas and registry

Zod schemas are the runtime authority and exported TypeScript types derive with `z.infer`. The public schema/type
pairs are:

- `ArcPlacementTierSchema` / `ArcPlacementTier`: `active | planned | provisional | completed`;
- `WorkUnitArtifactKindSchema` / `WorkUnitArtifactKind`: `meta | draft | spec | tasks | notes`;
- `ProcedureFamilySchema` / `ProcedureFamily`: `methods | workflows`;
- `ArchiveQuarterSchema` / `ArchiveQuarter`: branded `YYYY-q[1-4]`;
- `ArchiveSequenceSchema` / `ArchiveSequence`: branded `01` through `09`, then any non-zero decimal value without a
  redundant leading zero;
- `WorkUnitPlacementSchema` / `WorkUnitPlacement`: the physical placement union in § 4;
- `TemplateRelativePathSchema` / `TemplateRelativePath`: branded, non-empty, forward-slash path relative to the
  package template root;
- `TemplateOutputPathSchema` / `TemplateOutputPath`: separately branded output of the template binding transform;
  and
- `ArcLayoutAddressSchema` / `ArcLayoutAddress`: the strict discriminated semantic address union in § 4.

`ArchiveSequenceSchema` uses `^(?:0[1-9]|[1-9][0-9]+)$`. It rejects `00`, unpadded `1` through `9`, and redundant
leading zeroes while accepting the completed-index owner's current `padStart(2, "0")` output and unbounded later
sequences.

Both template-path schemas apply the lexical safety rules of `ManagedPath`: reject empty, absolute,
drive-prefixed, backslash-containing, NUL-containing, empty-segment, dot-segment, malformed-Unicode, and non-NFC
values. They are separate brands because a template-source-relative path and its post-transform output have
different semantic roles. The public output schema remains independently parseable; branding is not treated as
provenance.

The stable subsystem registry identities are:

```ts
export const LAYOUT_SCHEMA_IDS = {
  address: "layout-address",
  archiveQuarter: "layout-archive-quarter",
  archiveSequence: "layout-archive-sequence",
  artifactKind: "layout-artifact-kind",
  placementTier: "layout-placement-tier",
  procedureFamily: "layout-procedure-family",
  templateOutputPath: "layout-template-output-path",
  templateRelativePath: "layout-template-relative-path",
  workUnitPlacement: "layout-work-unit-placement",
} as const;
```

`createLayoutRegistry()` starts with a fresh `createKernelRegistry()` and registers exactly these nine independently
consumable roots at version `1` with `strict-current` migration posture. Private component schemas inside the
address union do not receive registry identities. Layout registry tests follow the shipped session-envelope
composition pattern. Registration alone does not add layout roots to `dist/schemas/kernel.json`.

### 4. Placement and semantic address algebra

All object schemas are strict. Physical work-unit placement is:

```ts
type WorkUnitPlacement =
  | {
      readonly kind: "active";
      readonly scope:
        | { readonly kind: "project" }
        | { readonly kind: "contributor"; readonly identity: Slug };
    }
  | {
      readonly kind: "backlog";
      readonly commitment: "planned" | "provisional";
      readonly cohort: readonly Slug[]; // required; length 0..2
    }
  | {
      readonly kind: "completed";
      readonly quarter: ArchiveQuarter;
      readonly sequence: ArchiveSequence;
    };
```

The public layout address union is:

```ts
type ArcLayoutAddress =
  | { readonly kind: "arc-root" }
  | { readonly kind: "placement-root"; readonly tier: ArcPlacementTier }
  | {
      readonly kind: "work-unit-container";
      readonly placement: WorkUnitPlacement;
      readonly slug: Slug;
    }
  | {
      readonly kind: "work-unit-artifact";
      readonly placement: WorkUnitPlacement;
      readonly slug: Slug;
      readonly artifact: WorkUnitArtifactKind;
    }
  | {
      readonly kind: "cohort-document";
      readonly cohort: readonly [Slug] | readonly [Slug, Slug];
      readonly placement:
        | { readonly kind: "planned" }
        | {
            readonly kind: "completed";
            readonly quarter: ArchiveQuarter;
            readonly sequence: ArchiveSequence;
            readonly closeout: "leaf" | "parent";
          };
    }
  | { readonly kind: "procedure-root"; readonly family: ProcedureFamily }
  | { readonly kind: "project-document"; readonly document: "roadmap" }
  | {
      readonly kind: "user-document";
      readonly identity: Slug;
      readonly document:
        | { readonly kind: "session-notes"; readonly workUnit: Slug }
        | { readonly kind: "working-memory" };
    };
```

Backlog placement accepts both commitment tiers so the physical model is complete. `cohort` is required even when
empty, producing one canonical wire shape rather than defaulting a missing field. Supporting `provisional` in the
contract does not silently absorb the audit's separate `provisional-placement` caller migration; its lifecycle
owner and the cohort tail still account for those callers.

The caller always supplies a WU slug for a container address. Active placement also requires an explicit scope.
Project scope represents lifecycle-owned work under the shared flat `.arc/active` container. Contributor scope
requires a branded identity and represents the current flat `.arc/user/{identity}/active` surface. Both retain the
slug in the semantic descriptor so the same placement data projects a conventional artifact without rediscovery.
The generic `placement-root` address remains the project lifecycle root for `tier: "active"`; contributor-active is
a work-unit placement, not a new project lifecycle tier.

For completed cohort closeout, the archive owner supplies the semantic closeout level plus the target document's
validated coordinate, quarter, and sequence. A parent closeout supplies the parent coordinate, not the member's
former nested coordinate. Layout maps `leaf` to archive suffix `a`, `parent` to `b`, and the last coordinate segment
to the cohort document name. It does not infer closeout level or archive allocation.

### 5. Canonical projections

The address variants project exactly to the current layout:

| Address | Canonical projection |
| --- | --- |
| ARC root | `.arc` |
| Active placement root | `.arc/active` |
| Planned placement root | `.arc/backlog/planned` |
| Provisional placement root | `.arc/backlog/provisional` |
| Completed placement root | `.arc/completed` |
| Project-active WU container | `.arc/active` |
| Contributor-active WU container | `.arc/user/{identity}/active` |
| Backlog WU container | `.arc/backlog/{commitment}/{cohort...}/{slug}` |
| Completed WU container | `.arc/completed/{quarter}/{sequence}_{slug}` |
| WU artifact | `{container}/{artifact}-{slug}.md` |
| Planned cohort document | `.arc/backlog/planned/{cohort...}/cohort-{last}.md` |
| Completed cohort document | `.arc/completed/{quarter}/{sequence}{a\|b}_cohort-{last}/cohort-{last}.md` |
| Procedure root | `.arc/system/{family}` |
| Project readiness document | `.arc/backlog/ROADMAP.md` |
| Per-WU session notes | `.arc/user/{identity}/{workUnit}/SESSION-NOTES.md` |
| Identity-global working memory | `.arc/user/{identity}/WORKING-MEMORY.md` |

Procedure-root resolution stops at `.arc/system/{methods|workflows}`. Procedure identities, nested `arc/`
placement, fragments, discovery, and slug-to-artifact resolution remain with the procedure subsystem. Project
readiness is represented semantically as `document: "roadmap"` while the current projection remains
`ROADMAP.md`; this central owner makes the separately planned rename a projection change rather than a new literal
cascade.

### 6. Template binding transform

Template binding is a companion validated-path transform rather than an address variant. The subsystem exports:

```ts
export const TEMPLATE_BINDING_SUFFIX = ".template";

function resolveTemplateOutputPath(templatePath: string): TemplateOutputPath;
```

The function parses the input with `TemplateRelativePathSchema`, applies the existing
`templatePath.replace(/\.template(\.[^/]+)$/, "$1")` behavior exactly, and parses the result with
`TemplateOutputPathSchema`. Templated and untemplated inputs are both valid, preserving the current copy-as-is
behavior and leaving render/classification policy with the template subsystem.

The output is not branded as `ManagedPath`: the source and output are relative to the package template root, not
necessarily the repository root named by `ManagedPath`. A caller installing the output into a repository resolves
its destination through a semantic ARC address or its existing installer boundary.

### 7. Public functions and failure contract

The public behavior surface is deliberately small:

```ts
function resolveArcPath(address: ArcLayoutAddress): ManagedPath;
function materializeArcPath(root: string, managedPath: ManagedPath): string;
function resolveTemplateOutputPath(templatePath: string): TemplateOutputPath;
```

The subsystem also exports the nine schemas and inferred types, `LAYOUT_SCHEMA_IDS`,
`TEMPLATE_BINDING_SUFFIX`, `createLayoutRegistry`, `LayoutError`, and `LayoutErrorCode`. One-off convenience
wrappers require demonstrated repeated use; caller-specific wrappers must not recreate distributed layout policy
behind new names.

Construction failures throw rather than return `Result`: these synchronous failures indicate invalid boundary
input, not an expected effect outcome. `LayoutError` extends `ArcError` and narrows its code to:

```ts
type LayoutErrorCode =
  | "layout.invalid-address"
  | "layout.invalid-template-path"
  | "layout.invalid-managed-path"
  | "layout.invalid-materialization-root";
```

`resolveArcPath` reparses even a statically typed address so JavaScript and unsafe casts cannot bypass validation.
`resolveTemplateOutputPath` validates both sides of the transformation. `materializeArcPath` revalidates its
branded path and requires a non-empty, NUL-free, well-formed, fully qualified native root whose descendant portion
contains no `.` or `..` component. On POSIX, the accepted shape is a `/`-rooted absolute path. On Windows, accepted
roots are ordinary drive-qualified paths (`C:\...` or `C:/...`) and UNC share paths (`\\server\share\...`).
Rooted-but-volume-relative paths (`\repo` or `/repo`), drive-relative paths (`C:repo`), device-namespace paths, and
any managed-path segment beginning with a drive designator are rejected. `path.win32.isAbsolute()` is not sufficient
because it accepts the rooted-but-volume-relative forms. After resolution, a host-semantic relative-path check must
prove that the result is a strict descendant of the normalized root; containment is a postcondition, not an
assumption derived from either operand's brand. Semantic inputs are never trimmed, slugified, separator-repaired,
Unicode-normalized, or resolved against ambient `cwd`.

Production materialization uses the host path implementation. A non-published internal helper accepts POSIX or
Windows path semantics and owns the fully-qualified-root predicate, managed-segment checks, and containment proof
for deterministic cross-platform unit tests. Tests include a later `D:bar` segment beneath a `C:` root and assert
that it produces `layout.invalid-managed-path`, not a path on drive `D:`.

### 8. Identity-owner migration

User identities are semantic record identities, not layout-specific path segments. `SlugSchema` already matches the
grammar ARC creates, so the existing identity owner becomes the validation boundary before layout receives a
branded slug.

The identity owner exports two distinct reads:

```ts
function readConfiguredIdentity(exec: GitExec): Promise<Slug | null>;
function resolveIdentity(options: IdentityOptions): Promise<Slug | null>;
```

`readConfiguredIdentity` is the only production reader of `arc.identity`. It uses the delimiter-preserving command
defined below, returns `null` only when Git reports the key absent, returns a parsed `Slug` when the configured value
is canonical, throws the exact `identity.invalid` `UserFacingError` for every present invalid value, and preserves
non-absence Git failures for the caller's existing error/degradation policy. It never falls back to `user.name` or a
prompt. `resolveIdentity` calls this helper first and retains its existing fallback behavior when configuration is
absent: non-configuration read failures retain the command's current missing/fallback disposition, while
`identity.invalid` is never swallowed.

`resolveIdentity` therefore changes to `Promise<Slug | null>`:

- an existing `arc.identity` is read and parsed without normalization;
- values derived from `user.name` or interactive input retain the existing slugification behavior and are then
  parsed through `SlugSchema`;
- missing identity and prompt cancellation remain `null`; and
- a present invalid `arc.identity` throws `UserFacingError` instead of being treated as missing or being reported as
  `layout.invalid-address`.

The invalid-config contract is exact:

```ts
{
  code: "identity.invalid",
  whatHappened: "Configured ARC identity is invalid",
  why: "arc.identity must be a lowercase alphanumeric slug whose segments are separated by single hyphens.",
  whatToDo: "Set a valid identity with:\n    git config --local arc.identity <identity>",
}
```

The configured-value read is an identity-local, delimiter-preserving use of the existing `GitExec` seam:
`git config --null --get arc.identity`. The helper requires exactly one terminal NUL, removes only that delimiter,
and returns the preceding bytes as the configured string without `trim`, `trimEnd`, or slugification. An empty value
is therefore present-but-invalid, not missing. The terminal NUL also prevents the production executor's generic
`stdout.trimEnd()` from stripping configured trailing whitespace. The general `gitConfigGet` and `GitExec` contracts
remain unchanged; derived `user.name` lookup may continue through the existing trimming helper because its value is
intentionally slugified.

Every direct configured-only reader migrates to `readConfiguredIdentity` without acquiring fallback semantics:

- `handlers/status.ts` keeps absence/read-failure handling for its identity pointer while rejecting invalid present
  configuration before any user-surface path is built;
- `handlers/recover.ts` keeps its `identity-missing` stop for absence and its existing read-failure disposition while
  rejecting invalid present configuration before resolving the compaction-seed path; and
- `lib/status/project-roadmap-render.ts` keeps absence as an empty, complete errand-record set and non-absence Git
  failure as degraded completeness, but treats invalid present configuration as `identity.invalid` rather than
  passing it to an errand ref.

Their `arc.role` reads remain on the existing normalized config helper. Production code outside
`lib/git/identity.ts` must not invoke `git config ... arc.identity` or call `gitConfigGet` for that key. The layout
user-address variant and migrated user-surface resolver accept a branded `Slug`, and `resolveArcPath` still reparses
the complete address as the final defensive boundary.

Because `Slug` is a branded string subtype, successful callers require no parallel success union. Identity tests
characterize canonical, empty, whitespace-padded, and otherwise-invalid configured values plus derived, prompted,
missing, and cancelled inputs; affected command and handler callers keep their existing missing-vs-present flow while
gaining the branded success type.

### 9. Audited caller migration and residual ledger

The historical baseline is the coupling report's result digest
`8ff94473a49cb4a55ba79626d27c9e420770cf6a329e63ac95b332f47cc9956c`. Its exact 63 MB corpus is intentionally
absent from the tracked tip and is retrieved from history through the checked-in audit README; the digest, rather
than a nonexistent tip file, is the durable baseline identity. It informs the migration but is not the completion
oracle: final-tree evidence must be refreshed after caller migration.

The selected classes are `arc-root`, `active-placement`, `planned-placement`, `completed-placement`, `meta-prefix`,
`draft-prefix`, `spec-prefix`, `tasks-prefix`, `notes-prefix`, `method-root`, `workflow-root`, `roadmap-name`,
`session-notes-name`, `working-memory-name`, and `template-suffix`. A **hit** means one class-specific
`ClassifiedHit` from a `classes[].hits` inventory, identified by the tuple `(classId, evidenceDigest)`. The historical
`scanResult.candidates.classified` array is the catch-all-candidate diagnostic projection, not the migration-ledger
universe: class scanning also emits direct class hits when no catch-all candidate covers a match. In the historical
snapshot, the 15 selected class inventories contain 9,892 unique hit tuples. The diagnostic projection contains
6,232 selected candidates and 8,466 selected candidate-to-class associations, with 1,324 candidates associated with
more than one selected class; relying on that projection would omit 1,426 authoritative class hits.

The tracked completion artifact is
`packages/arc-framework/audits/coupling-blast-radius/layout-migration-ledger.json`. Its own path is added to the
coupling-audit manifest's excluded set as derived migration bookkeeping, preventing the ledger from changing the
corpus it certifies. Its Zod schema and assertion helper live at
`src/lib/coupling-audit/layout-migration-ledger.ts`, and the staged-tree assertion is exposed through
`src/scripts/assert-layout-migration.ts` plus the repository-root `npm run audit:layout-migration` package script.
None is exported from the public layout barrel.

The existing `scanCorpus` remains the complete coupling-audit operation: after collecting class hits, it partitions
catch-all candidates against the historical audit's exact and bulk dispositions. Those dispositions are intentionally
evidence-bound and may become stale as this work moves source lines, while the migration ledger's authoritative
universe needs only `classes[].hits`. A shared `scanClassInventory` primitive therefore performs the deterministic
manifest/corpus/class scan and returns the source metadata plus canonical class inventories before catch-all
partitioning. `scanCorpus` composes that primitive and preserves its current stale-disposition behavior; the migration
assertion consumes the primitive directly rather than weakening, clearing, or cloning the historical dispositions.
Its stable proof surface is:

```ts
interface CouplingClassInventory {
  readonly version: 1;
  readonly manifestDigest: string;
  readonly corpus: CouplingScanResult["corpus"];
  readonly classes: CouplingScanResult["classes"];
}

function scanClassInventory(
  manifest: CouplingManifest,
  files: readonly CorpusFile[],
): CouplingClassInventory;
```

The version-1 ledger shape contains:

```ts
interface LayoutMigrationLedgerV1 {
  readonly version: 1;
  readonly source: {
    readonly historicalResultDigest: string;
    readonly manifestDigest: string;
    readonly corpusFilesDigest: string;
    readonly classInventoryDigest: string;
    readonly selectedClassIds: readonly string[];
    readonly selectedHitCount: number;
    readonly selectedHitSetDigest: string;
  };
  readonly exact: readonly LayoutMigrationExactDisposition[];
  readonly bulk: readonly LayoutMigrationBulkDisposition[];
}

type LayoutMigrationDisposition =
  | "layout-definition"
  | "root-only-owner"
  | "pre-resolved-path"
  | "semantic-policy-owner"
  | "scanner-false-positive"
  | "independent-evidence"
  | "external-owner";
```

Each exact entry carries `classId`, `evidenceDigest`, `disposition`, `owner`, and `reason`. Each bulk entry carries a
stable `id`, a closed predicate over `classId | path | token | surfaceKind | locus | idiom | vectorId`, a
`memberSetDigest`, `disposition`, `owner`, and `reason`. Predicate operators are `equals | in | prefix`, matching the
audit's existing bulk-disposition idiom. The member-set digest is computed over the canonical byte-sorted
`(classId, evidenceDigest)` tuples matched by that rule; it prevents a broad predicate from silently absorbing a new
hit later.

Version 1 freezes every digest preimage and algorithm:

- `historicalResultDigest` is a 64-character lowercase SHA-256 over the exact UTF-8 output of
  `canonicalJson(scanResult)`, including its single trailing LF. The fixed historical value already follows this
  full-result artifact-digest recipe.
- `classInventoryDigest` is the same raw-artifact SHA-256 recipe over the exact UTF-8 output of
  `canonicalJson(classInventory)`, including its single trailing LF.
- `manifestDigest` and `corpusFilesDigest` are copied from the class inventory's `manifestDigest` and
  `corpus.filesDigest`; those fields retain the coupling audit's existing `digestCanonicalJson` recipes, whose
  canonical JSON preimages omit a trailing LF.
- A hit key is the JSON two-tuple `[classId, evidenceDigest]`. `digestLayoutHitSet` first rejects duplicate tuples,
  orders the tuples with the kernel's `sortByCanonicalBytes`, serializes the resulting array with
  `digestCanonicalJson`, and returns its 64-character lowercase SHA-256 without a `sha256:` prefix. It performs no
  delimiter joining and no implicit set deduplication.
- `selectedHitSetDigest` is `digestLayoutHitSet` over every hit in the 15 selected
  `classInventory.classes[].hits` inventories. A bulk rule's `memberSetDigest` uses the identical function over the
  hit keys matched by that rule. Empty member sets fail before hashing.

The assertion helper owns `digestLayoutHitSet`; it does not reuse the existing candidate-only `digestMemberSet`,
whose preimage is an array of bare evidence-digest strings and cannot distinguish the same evidence under two
classes.

The final assertion is staged-tree-bound so it can certify the pending implementation commit and replay unchanged in
a clean CI checkout. It enumerates `git ls-files --cached`, refuses untracked paths selected by the same corpus
membership and exclusion rules, and reads the manifest, corpus, and ledger from the Git index rather than mixing
index membership with working-tree bytes. Exact blob reads reuse the byte-preserving `readGitBlobBytes` adapter;
ordinary `GitExec` output is not a blob-content seam. The manifest and ledger must both exist in the index. After
fatal UTF-8 decoding and schema validation, the indexed ledger text must equal `canonicalJson(validatedLedger)`
byte-for-byte, including its single trailing LF, so semantically equivalent but non-canonical JSON fails closed. The
assertion then:

1. validates the ledger schema and fixed selected-class set;
2. reruns `scanClassInventory` over index-pinned bytes, canonicalizes the inventory with its single trailing LF, and
   verifies the exact digest recipes above against `source`;
3. derives every selected `(classId, evidenceDigest)` hit from `classInventory.classes[].hits`, rejects duplicate
   keys, then verifies the recorded count and `digestLayoutHitSet` result;
4. expands exact and bulk entries, requiring every selected hit to match **exactly one** disposition;
5. rejects missing exact keys, empty bulk rules, overlapping rules, unmatched hits, and bulk member-set digest drift;
   and
6. emits the per-class residual counts and owners consumed by `cli-substrate-complete-migration`.

The final selected class inventory is authoritative. A historical hit removed by migration needs no fabricated
residual row; any new or line-shifted hit in the final tree receives a fresh evidence digest and must match the final
ledger. This makes unexplained current construction fail loudly while keeping the 63 MB historical corpus out of the
tracked tip.

Caller-shape rules prevent a nominal abstraction:

- **Semantic construction:** lifecycle verbs, archive destinations, cohort closeouts, conventional WU companions,
  procedure roots, readiness-view paths, and selected user documents provide structured address operands.
- **Root-only composition:** installers, config readers, hooks, or commands that own an unselected descendant may
  resolve `arc-root`, then compose and validate their own subsystem-relative suffix. Layout exports no generic join.
- **Pre-resolved paths and pointers:** discovery results, lifecycle-index records, manifest outputs, and custom
  task-list pointers remain authoritative. Conventional sibling projection uses structured placement data carried
  alongside the exact pointer; callers do not reverse-parse the path.
- **Recognition rather than construction:** scanners and policy gates may derive comparison roots from projections,
  but their lifecycle or policy interpretation remains local.
- **Independent evidence:** golden expected strings, fixtures, prose examples, and template inputs do not become
  resolver calls merely to reduce literal counts.

Two current record/view edges make the exact-path rule concrete. Both production callers of
`buildLifecycleIndexFromRecords` supply each record's exact `path`; its pathless fallback is a synthetic diagnostic
projection without enough cohort or archive coordinates, so lifecycle-index continues to own it.

`arc view` likewise preserves its discovered `metaPath` and configured task-list pointer, but its current ambient
adapter cannot obtain the work-unit identity semantically from `ActiveSessionInitResult`: the single arm exposes only
`path` and deliberately empties `candidates`. The active-meta discovery boundary already recognizes conventional
`meta-{slug}.md` members. It gains an internal semantic candidate projection that validates and carries `Slug`
alongside the exact candidate path through active-target selection. The agent-facing `ActiveSessionInitResult` keeps
its existing JSON shape; the session-init projection omits the internal semantic field, while `arc view` consumes the
in-process semantic result directly for single and unique-current-branch resolution, including contributor-scoped
active roots. This preserves the `cli-session-envelope` ownership boundary and removes basename parsing from the
view adapter.

`ResolvedViewTarget.slug` is therefore `Slug`, not `string`, and `ResolvedViewTarget` also carries
`WorkUnitPlacement`. Ambient active targets receive both from the internal active resolution: maintainer discovery
supplies project scope, while contributor discovery supplies contributor scope with the already-resolved configured
identity. Explicit backlog targets parse the lifecycle index's semantic `entry.slug` and `entry.cohort` fields while
preserving `entry.path` as the exact meta pointer. The artifact resolver uses those semantic operands only for
conventional siblings and never recomputes either exact pointer.

The `arc-root` and `active-placement` fan-out values in the audit are total per-class file counts, not
production/test reference estimates. Implementation sizing uses the historical class membership and evidence
records, while completion uses the index-pinned final class inventory and versioned ledger above.

### 10. Tracked-planning Git-operation packet

The audit's four-file packet is evidence to reconcile, not a required runtime adapter:

- `strategy-work-planning.md` describes direct residual-draft retirement;
- the pre-commit hook performs read-only index inspection;
- `activate-work-unit.md` performs the guarded direct retirement mechanic; and
- `relocate-artifacts.ts` describes and executes moves through the shipped injectable `GitExec` seam.

Only path construction belongs automatically to layout. `relocate-artifacts.ts` already uses the cohort's Git
executor contract. The hook's direct `git diff` inspection remains hook-owned enforcement; wrapping it would not
improve reuse or trust boundaries. The strategy/workflow pair remains together and routes to
`composable-workflows`, whose lifecycle-verb adoption owns removal of deterministic mechanics from procedure.

The exact allowed non-layout residuals are therefore:

- the hook's read-only index inspection; and
- guarded draft retirement in `activate-work-unit.md` plus its description in `strategy-work-planning.md`, owned by
  the same future lifecycle verb.

The identity-global capture “Replace residual activation draft cleanup with an owning lifecycle verb” records the
route to `composable-workflows`. Planning closeout confirms that the capture still exists or has drained into that
WU's authoritative design. `cli-substrate-complete-migration` records the named external-owner residual in its final
matrix. The substrate cohort does not depend on the procedure verb landing; if it lands first, the tail consumes the
remaining mechanical migration and removes the residual.

### 11. Storage and adjacent-cohort compatibility

The resolver is a projection seam, not the future storage seam. A record-backed materializer may reuse the address
algebra to render today's `.arc/` view beneath a caller-supplied root. The backing store still owns reads,
version-checked writes, absence, synchronization, failure recovery, and canonical record placement. No storage mode,
per-artifact boolean, or in-repo tracking assumption enters layout.

The design composes with known directions:

- **Schema kernel:** consumes the shipped neutral `Slug`, `ManagedPath`, `ArcError`, and registry contracts; layout
  vocabulary stays subsystem-owned.
- **Lifecycle state:** callers provide explicit physical placements. Layout does not infer state from a directory;
  the future record-owned lifecycle model can change the projection without changing its semantic state contract.
- **Storage substrate:** canonical projection and caller-selected materialization remain separate; the same address
  can render under an in-repo root or a materialized backing-store view.
- **Procedure substrate:** deterministic path projection moves into typed code. Procedure identity and lifecycle
  verbs remain with `composable-workflows`; no agent-interpreted markup or control flow is introduced.
- **Naming and readiness-view evolution:** the semantic address owns the current projection token, making a later
  rename a localized projection/migration change rather than a new literal cascade.
- **Cohort tail:** `cli-substrate-complete-migration` consumes the resolver, migration ledger, and residual matrix to
  remove remaining transitional helpers and parallel test support after all contract-owning siblings land.

## Alternatives & Rationale

- **Central constants only:** rejected because each caller would still own composition, dynamic placement, and
  operand validation. It would reduce spelling duplication without creating an authority boundary.
- **A resolver bound to `cwd`:** rejected because canonical projection and native materialization would be coupled,
  current-vs-primary user roots would remain ambiguous, and a future backing-store view could not select its root.
- **A virtual filesystem or storage repository in this work unit:** rejected because reads, writes, synchronization,
  and version checks are a separate effect and persistence boundary.
- **One convenience function per caller:** rejected because it would recreate distributed layout policy behind a
  larger resolver API and make ownership harder to audit.
- **A generic safe-segment or descendant-join API:** rejected because it would let callers rebuild arbitrary layout
  rules and make the semantic union ceremonial rather than authoritative.
- **Reverse-parsing discovered paths:** rejected because record and pointer owners already possess exact authority,
  and some synthetic or custom paths cannot recover complete cohort/archive coordinates without loss.
- **A layout-specific Git adapter for the audit packet:** rejected because the shipped `GitExec` and
  `readGitBlobBytes` adapters already own process execution and exact blob reading, while the remaining mechanics
  belong to hook or lifecycle-procedure owners.
- **Brand template outputs as `ManagedPath`:** rejected because those paths are relative to the package template
  root, not necessarily to a repository. Separate brands preserve role correctness.
- **Generate expected paths with the resolver under test:** rejected because implementation and oracle would share
  the same defect. Golden expected strings remain independent evidence.

## Cross-cutting Considerations

- **Security and validation:** every dynamic segment is schema-validated before path construction; complete
  addresses are defensively reparsed; managed and template paths reject traversal, absolute forms, backslashes,
  malformed Unicode, non-NFC input, NULs, and empty segments. Configured identities are never silently normalized
  into another user's directory.
- **Cross-platform behavior:** canonical paths always use POSIX separators. Native materialization is isolated at the
  caller-supplied root boundary and receives deterministic POSIX/Windows unit coverage, including rejection of
  Windows rooted-but-volume-relative, drive-relative, and device-namespace roots, later drive-designator managed
  segments, and every result that fails the strict-descendant postcondition. Git and persisted contracts never
  receive host separators.
- **Performance:** resolution is synchronous string projection plus bounded schema validation. It performs no I/O,
  scanning, or discovery. Migration should remove repeated composition without adding filesystem round trips.
- **Testing:** unit-test every address variant, registry root, template transformation, and invalid operand class.
  Keep expected strings independent. Add representative integration coverage across lifecycle, planning,
  procedure-load, template, readiness-view, and user-surface consumers instead of duplicating all unit cases.
- **Migration:** adopt callers by semantic class, then generate and verify the ledger against index-pinned final-tree
  evidence. Preserve exact paths and policy readers where they are authoritative. Do not land a generic
  compatibility shim that would become a second construction surface.
- **Rollout compatibility:** the directory layout and public CLI behavior remain unchanged. Invalid manually
  configured identities become an intentional fail-fast behavior with exact remediation. Other validation failures
  indicate unsafe or structurally invalid inputs that previously crossed boundaries unchecked.
- **Canonical stability:** no canonical JSON, digest, receipt, or managed-path byte behavior changes. Layout consumes
  `ManagedPath`; it does not redefine it.
- **Package architecture:** `src/lib/layout/` stays in the pure/injectable library layer. Commands and handlers may
  consume it downward; the kernel never imports it. No new runtime dependency is required beyond shipped Zod.
- **Full-suite verification:** because path construction crosses session, lifecycle, install/update, status,
  template, and user-state flows, completion requires the full CLI test suite, both source and test typechecks,
  TypeScript and shell lint where touched, Markdown lint, and build.
- **User-facing impact:** valid workflows preserve paths and behavior. Invalid `arc.identity` configuration now
  fails with an actionable `identity.invalid` error rather than selecting an unsafe directory or masquerading as
  missing identity.

## Success Criteria

Validated at work-unit completion:

- `src/lib/layout/` is the single owner of the nine named schemas, semantic address algebra, canonical projection,
  template transform, and layout error contract; the kernel remains free of subsystem layout vocabulary.
- `ArcLayoutAddressSchema` and `WorkUnitPlacementSchema` are strict runtime authorities for every specified variant,
  including project- and contributor-scoped active placement, and all exported TypeScript types derive from their
  Zod schemas.
- `resolveArcPath` returns exactly the canonical projections in § 5, reparses unsafe typed inputs, returns a
  validated `ManagedPath`, performs no I/O, and has no ambient-root dependency.
- `materializeArcPath` accepts only a fully qualified native root plus a valid managed path; POSIX-rooted,
  Windows drive-qualified, and Windows UNC paths materialize correctly; rooted-but-volume-relative, drive-relative,
  and device-namespace roots, dot-segment roots, later drive-designator managed segments, and any non-contained
  result are rejected; and native separators never leak into canonical outputs.
- `resolveTemplateOutputPath` preserves the existing `.template`-before-extension transform for templated and
  untemplated safe inputs while rejecting every named unsafe lexical class.
- `createLayoutRegistry()` returns a fresh kernel-composed registry containing exactly the nine stable layout IDs at
  version `1` and `strict-current`; repeated factories are isolated and registration order does not create drift.
- `LayoutError` exposes only the four locally exhaustive dotted codes, preserves causes where appropriate, and is
  handled through the existing `ArcError` boundary without a parallel error base.
- `readConfiguredIdentity` returns `Slug | null` without fallback; `resolveIdentity` returns `Slug | null` with its
  existing derived/prompted fallback behavior. Their shared NUL-delimited configured-value read preserves
  leading/trailing whitespace and distinguishes an empty configured value from absence; valid configured, derived,
  and prompted identities retain current behavior; missing and cancelled resolution remain `null`; and every
  invalid configured identity emits the exact `identity.invalid` `UserFacingError` contract. Status, recovery, and
  tracked-readiness rendering use the configured-only helper and no production direct `arc.identity` read remains.
- `layout-migration-ledger.json` validates as version 1 and binds the historical digest to the index-pinned final
  manifest, corpus, class inventory, selected-class set, selected-hit count, and selected-hit-set digest. Every final
  class-specific hit matches exactly one exact or bulk disposition; exact misses, zero-member or drifted bulk rules,
  overlaps, unmatched hits, relevant untracked files, missing indexed inputs, digest mismatches, duplicate hit keys,
  and non-canonical ledger bytes fail the assertion. The selected universe comes from
  `classInventory.classes[].hits`, and every set digest uses the frozen class-aware two-tuple recipe.
- Covered semantic production callers no longer reproduce selected layout rules. Root-only, pre-resolved,
  recognition, false-positive, and independent-oracle residuals remain only where the ledger names their authority.
- The audit's tracked-planning Git packet introduces no layout-owned Git adapter: relocation continues through the
  shipped `GitExec`, hook inspection stays hook-owned, and the workflow/strategy mechanic remains a named
  `composable-workflows` residual verified by the cohort tail.
- No caller reverse-parses exact discovery, record, manifest, or configured-pointer paths solely to construct an
  address; conventional sibling projection uses separately carried branded slugs and structured placement
  coordinates. The internal active-target projection carries its recognized slug without changing the
  `ActiveSessionInitResult` wire shape.
- The resolver introduces no storage mode, tracking boolean, lifecycle inference, existence check, worktree-root
  policy, procedure identity, or generalized descendant-join surface.
- Golden path expectations are independent from the resolver under test; unit and representative integration tests
  cover all address families, invalid operands, identity resolution, registry composition, native materialization,
  and migration residual enforcement.
- The full CLI quality gates pass: Markdown lint, `typecheck:all`, TypeScript lint, applicable shell lint, full test
  suite, and build.

## Open Questions

No settle-able design question remains. The exact internal file subdivision under `src/lib/layout/` and batching
within the task list's review increments remain implementation latitude. The refreshed evidence ledger supplies the
final per-hit proof without changing the public contract or ownership boundaries above.
