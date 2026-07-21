# Spec (`detailed` · `RFC`): CLI validation surfaces

- **Origin:** [internal]

- **Purpose:** Make Zod schemas the runtime and TypeScript authority at the CLI's priority non-session trust
  boundaries while preserving each boundary's existing compatibility and failure behavior.

---

## Introduction / Context

Several CLI boundaries accept persisted JSON, configuration-derived records, Git porcelain, or structured values
assembled across modules. Their current runtime checks are manual, partial, or separated from the TypeScript types
that describe the same data. Malformed external state can therefore survive as plausible internal state, while
parallel validators and handwritten interfaces can drift independently.

The landed schema kernel provides Zod 4, shared vocabulary, a versioned registry, error primitives, Result
insulation, and canonical JSON. This work applies that substrate to the priority non-session boundaries identified
by the CLI substrate audit. It owns audit entries, semantic meta records, authorable configuration, local sync
state, decomposition cut maps, Git worktree porcelain records, cold-start input variants, cross-work-unit note
adapter payloads, and the review-gate canonicalization outlier.

Session-init, recovery, and compaction envelope schemas remain owned by `cli-session-envelope`. Git execution and
`GitProcessError` remain owned by `cli-git-executor`. The complete worktree-roster result and residual migration
inventory remain owned by `cli-substrate-complete-migration`. Managed Markdown projection policy remains owned by
`operational-state-docs`.

## Goals

- Give every selected boundary a co-located Zod schema that is both the runtime validator and the source of its
  exported structural type.
- Parse external values deliberately at their trust boundary without changing the caller-visible recovery,
  warning, refusal, or throw behavior that each adapter owns.
- Register only persisted or externally meaningful roots whose complete accepted domains can be represented by
  the kernel's JSON Schema projection.
- Preserve compatibility formats through explicit parse and normalization layers instead of weakening current
  schemas or hiding behavior in transforms.
- Consolidate configuration key domains and defaults into one catalog while retaining policy-specific adapters and
  precedence.
- Route safely recomputable review-gate identity bytes through the kernel authority while explicitly freezing every
  version-1 durable identity domain that must remain verifiable, without changing kernel receipts or adopting the
  kernel digest wire format.
- Leave a closed, fixture-backed inventory that the cohort tail can mechanically audit for bypasses and residual
  validators.

## Non-Goals

- Convert every CLI type, value object, or validation helper to Zod.
- Own session-init, recovery, compaction-seed, or complete worktree-roster schemas.
- Make the current Markdown meta projection the canonical operational-state storage model or decide the legacy
  flat-bullet projection's eventual retirement.
- Reform configuration axes, configuration precedence, lifecycle policy, or existing command behavior.
- Convert `AuthorizationDecision` or other domain discriminants to Result only because the kernel exposes Result.
- Publish the composed validation registry or add these roots to `dist/schemas/kernel.json`; registry publication
  belongs to `schema-introspection-layer`.
- Migrate newly discovered wholesale validation surfaces; those route to `cli-substrate-complete-migration`.

## Proposed Design

### 1. Schema ownership and boundary discipline

Each schema lives with the subsystem that owns the meaning of the record. No global schema module redefines
subsystem semantics. The one cross-subsystem module is an assembly-only registry factory; it imports the owning
schemas and registers them without changing their behavior.

| Surface | Owning module |
| --- | --- |
| Audit entry | `packages/arc-framework/src/lib/release/schema.ts` |
| Semantic meta record and projection intermediates | `packages/arc-framework/src/lib/active/meta-schema.ts` |
| Authorable configuration and completed status view | `packages/arc-framework/src/lib/config/schema.ts` |
| Local sync state and cross-WU note payloads | `packages/arc-framework/src/lib/user-sync/schema.ts` |
| Decomposition cut map | `packages/arc-framework/src/lib/work-unit/decompose-cut-map-schema.ts` |
| Git worktree porcelain record and tokenizer | `packages/arc-framework/src/lib/git/worktree-porcelain.ts` |
| Cold-start input | `packages/arc-framework/src/lib/active/spec-input-parser.ts` |
| Registry composition only | `packages/arc-framework/src/lib/validation-surfaces/registry.ts` |

Exported structural types derive with `z.infer`; migrated handwritten interfaces and structural unions are removed
or become compatibility re-exports from their established import paths. Domain unions that express decisions rather
than record shape remain handwritten.

The parse posture follows the direction of trust:

- decoded JSON, files, Git stdout, and cross-checkout values use `safeParse` at the adapter edge;
- internally assembled records use `parse` immediately before return, persistence, or another externally visible
  effect when failure indicates a programming defect;
- syntax tokenizers remain separate from semantic record schemas;
- Zod issues are translated at the owning adapter into stable boundary names and field paths, without echoing whole
  records or sensitive values.

Producer-owned records are strict unless their existing contract explicitly accepts additive fields. Compatibility
readers may tolerate or discard malformed optional extensions only where that is already the shipped policy.

### 2. Registry composition and projection fidelity

`createValidationSurfacesRegistry()` returns a fresh `createKernelRegistry()` with exactly four added roots:

| Registry id | Root schema | Version | Migration posture |
| --- | --- | --- | --- |
| `audit-entry` | `AuditEntrySchema` | `2` | `strict-current` |
| `meta-record` | `MetaRecordSchema` | `1` | `strict-current` |
| `arc-config` | `ArcConfigSchema` | `1` | `strict-current` |
| `local-sync-state` | `PersistedLocalSyncStateSchema` | `4` | `backward-compatible` |

Registration is discovery metadata, not publication. The factory is independently composable and does not change
the kernel-only artifact emitted by the current build.

A registered schema promises acceptance-equivalent JSON Schema. Any distinction that changes acceptance must be
expressible by `z.toJSONSchema`; registered roots therefore use structural objects, literals, enums, and
discriminated unions rather than transforms, `.refine`, or `.superRefine`. Hydration, canonical ordering, and other
normalization run after a successful parse. Schemas with graph-wide or other non-projectable invariants remain
runtime authorities but are not registered.

Registry tests assert exact ids, versions, migration postures, deterministic ordering, duplicate rejection, kernel
composition, and representative runtime-versus-JSON-Schema acceptance parity. They may project the composed
registry in memory, but must not modify the shipped kernel bundle.

### 3. Audit-entry contract

`AuditEntrySchema` replaces `validateEntry` as the complete version-2 record authority. The schema is a strict
structural union keyed by command and then by the producer's decision/outcome arms so JSON Schema preserves the same
relationships as runtime validation:

- `release-commit` pairs `proceeded` and `refusalCode: null` with `commit` or `hook-failed`; refusal codes `10`–`13`
  pair with `refused`; code `16` pairs only with the `preflight-failed` reason union;
- `release-push` pairs `proceeded` and `refusalCode: null` with `push` or `hook-failed`, and refusal codes `10`–`15`
  pair with `refused`;
- `sync` pairs `proceeded` and `refusalCode: null` with `sync`; blocked sync cells pair `refused` and refusal code
  `14` with the same `sync` outcome so the persisted leg diagnostics and exit code remain intact;
- each command carries only its matching interlock-state snapshot.

The refused-sync arm is an intentional version-2 contract, not an inconsistency to normalize into
`outcome.kind: refused`. Existing blocked-sync records and the current producer remain valid without a version bump.

`AuditEntry`, its command/interlock/outcome components, and `AuditWorkUnit` derive from the schema.
`AuthorizationDecision` remains the existing domain union. `appendAuditEntry` calls `AuditEntrySchema.parse`
before filesystem I/O: schema violations still throw as programming/precondition failures, while directory or
append failures still return `{ ok: false, error }` and never mask a successful release operation. Only version 2
is accepted; this work neither reads version 1 nor introduces version 3.

Characterization covers every legal command/decision/outcome arm, all forbidden cross-products, strict unknown-key
rejection, argument redaction, and the precondition-versus-I/O failure split.

### 4. Semantic meta-record contract

`MetaRecordSchema` is a strict, storage-agnostic record with code-facing keys:

`state`, `owner`, `branch`, `workClass`, `priority`, `cohort`, `dependsOn`, `origin`, `design`, `taskList`,
`currentWorkflow`, `lastCompleted`, `nextTask`, `blockers`, `nextAction`, `prUrl`, and `completed`.

Every key is present. `state`, `owner`, `workClass`, `priority`, and `origin` are required non-null semantic values;
`workClass` and `priority` additionally accept the unresolved semantic value `TBD`, and internal origin is the value
`internal`. `branch`, `cohort`, `taskList`, `currentWorkflow`, `lastCompleted`, `nextTask`, `blockers`, `nextAction`,
`prUrl`, and `completed` are nullable. `dependsOn` and `design` are identifier arrays. Display sentinels and Markdown
quoting do not enter the semantic root.

The Markdown adapter remains a separate compatibility layer:

1. `META_FIELDS` keeps its ordered display descriptors and gains the corresponding semantic key for each label.
2. `MetaProjectionRecordSchema` validates the current 17-label `string | null` tokenizer result.
3. `ParsedMetaRecordSchema` maps that projection to the same code-facing keys and list/sentinel representation as
   the durable record, but retains non-empty raw strings for closed-domain fields. This allows a tolerant caller to
   degrade one invalid field without discarding unrelated evidence.
4. `parseMetaRecord` preserves the table-first grammar, flat-bullet fallback, multiline narrative recovery, and
   token normalization, then returns the parsed semantic adapter record.
5. `toMetaRecord` applies `MetaRecordSchema.safeParse` only where a caller requires a fully valid durable record.
   Valid parsed records require no reshaping at this step.
6. `renderMetaFile` assembles a complete semantic record from defaults plus partial semantic overrides, validates
   it, and emits only the canonical full table layout. It is not a legacy flat-bullet writer.

The display mappings are exact in both directions. On read, `—` and `[none]` become `null` for nullable scalar fields
and `[none]` becomes an empty array for list fields; `[TBD]` becomes `TBD`; `[internal]` becomes `internal`.
Canonical full-layout rendering maps null `branch`, `cohort`, `taskList`, `currentWorkflow`, `lastCompleted`,
`nextTask`, `blockers`, `prUrl`, and `completed` to `[none]`, maps null `nextAction` to `—`, and maps empty identifier
arrays to `[none]`. Required semantic fields have no null projection. Identifier lists are parsed once rather than
reparsed by consumers.

Both the full table and legacy flat-bullet layouts remain readable. Byte preservation for an existing legacy file
belongs to the localized projection setters and reconciliation helpers, which mutate only their owned fields; a
parse followed by `renderMetaFile` deliberately emits the full layout rather than reproducing legacy bytes.

Strict render producers validate before any earlier irreversible effect. In particular, `park@Active` composes and
validates its pointer record before worktree teardown, then retains teardown before the pointer write so the dirty
worktree guard and the existing post-teardown write-failure classification remain unchanged.

Existing consumers move from display-label indexing and comma splitting to semantic properties. Compatibility
granularity does not change: the worktree roster, for example, maps an unrecognized parsed state to `unknown` while
retaining owner, cohort, class, priority, dependency, and path evidence. Narrow public projections such as
`parseMetaFile` retain their current result and warning behavior. `operational-state-docs` may add lifecycle- or
location-specific refinements later without replacing this structural root.

### 5. Authorable configuration contract

`ARC_CONFIG_FIELDS` becomes the single code authority for every active project-level dotted key. Each descriptor
contains the key, a Zod string schema for its accepted authoring domain, its documented default, and the policy
classification needed by existing adapters. The initial catalog is the union of the packaged `arc-config.yml`,
TypeScript consumers, and the installed validator—not the template alone.

The catalog covers:

- enum domains for branch protection, commit/footer modes, hook modes, review, merge, platform, project mode,
  session policies, notes push, and archive cadence;
- boolean-token domains for `team.mode` and `sync.auto_pull`;
- positive safe-integer domains with their existing per-key minima;
- regex/pattern, branch-name, worktree-template, harness-directory, and shell-command strings without introducing
  a second regex dialect or new policy at the schema layer.

`hooks.subject_warn_length` is retired from the known-key set: it has no packaged declaration or consumer, so it
must produce the ordinary unknown-key warning rather than remain a validator-only compatibility key. The stale
`hooks.code_extensions` validator comment is removed; that key is already unknown and has no runtime contract.

`ArcConfigSchema` is the registered authoring-record contract built from the catalog. Known keys are optional
because omission selects the documented default. Its key grammar is the installed validator's exact discovery
contract, `^[a-z][a-z0-9_.]+$`; preserving that existing grammar intentionally retains undotted names plus repeated
or trailing periods while excluding uppercase, leading-digit, leading-underscore, and one-character names. Unknown
matching keys with string values remain accepted and preserved for forward compatibility; known keys cannot bypass
their leaf domains. The schema owns record shape and per-key domains, not cross-field policy.

`parseArcConfig` remains the broader syntax tokenizer. It retains its `^[\w.]+` key capture, CRLF normalization,
quote stripping, first-definition-wins behavior, colon-bearing values, and bare-empty default selection, and
validates its output only through an unregistered open `RawArcConfigSchema` (`Record<string, string>`). Existing
tolerant readers therefore keep every key they accept today. Full validation separately inventories raw key
occurrences through the installed `^[a-z][a-z0-9_.]+:` line grammar, then applies `ArcConfigSchema` to the matching
first-definition value map. Tokenizer-only keys outside that grammar remain ignored, while the raw inventory
preserves unknown bare-empty and duplicate-key warning behavior. No universal coercing normalizer is introduced.

Bare-empty and quoted-empty values remain distinct. A bare-empty first definition claims the key but is omitted
from the parsed value map; `""` and `''` claim the key and remain present as the empty string. Each catalog descriptor
declares the existing quoted-empty posture: `default` for omission-default domains, `unset` for optional strings
whose owning policy treats empty as absent, or `invalid` where empty is a domain error. `ArcConfigSchema` accepts the
empty string only for `default` and `unset` leaves. Full validation renders the current absent/default pass for
`default`, applies existing cross-field missing/ignored behavior for `unset`, and reports the existing domain error
for `invalid`; positive-integer leaves are `invalid`. First-definition masking remains identical for both empty
forms.

Policy adapters retain their existing observable behavior while importing catalog leaf schemas and defaults:

- `readConfigSettings` defaults and warns only for its current tolerant subset;
- `user.notes_push` remains raw until the git-config-precedence resolver validates it;
- commit-check configuration retains hard `config.invalid-*` findings and numeric normalization;
- worktree location and harness-directory semantics remain at their owning consumers;
- the full validator composes unknown-key warnings and custom-pattern cross-field rules after record validation;
- callers that deliberately degrade invalid values continue to do so.

`ConfigSettingsSchema` is an unregistered strict schema for the completed agent-consumable projection returned by
`readConfigSettings`. Because that compatibility view intentionally retains some raw values, it proves key presence
and string shape rather than falsely claiming universal normalization. `ConfigSettings` derives from it. The
session-envelope config view and git-config-resolved provenance objects remain separate authorities.

The installed `validate-config.sh` becomes a thin launcher for a non-interactive
`arc config validate [--file <path>]` command. The TypeScript validator owns key domains, unknown-key warnings,
cross-field checks, PASS/WARN/ERROR lines, summary counts, and exit codes `0`/`1`/`2`.

The selected-file contract remains explicit:

- direct invocation without `--file` resolves `.arc/system/arc-config.yml` from the project root;
- `--file` resolves the supplied path from the current working directory, preserves the supplied path token in
  diagnostics, and does not require a standard `.arc/` root to exist;
- the shell launcher continues to source `arc-lib.sh`, then executes
  `arc config validate --file "$ARC_CONFIG_FILE"`, forwarding stdout, stderr, and the exact exit status;
- `ARC_CONFIG_FILE` therefore remains the shell compatibility override, including the value that
  `verify-integrity.sh` derives from a custom `ARC_DIR`, while the TypeScript command receives one explicit path
  instead of independently interpreting shell environment state.

This preserves the installed script path and existing isolated/custom-root callers while moving deterministic
validation into the typed CLI. Characterization covers the default path, an absolute temporary path, and a custom
`ARC_DIR` whose validator targets a non-default ARC root.

### 6. Local sync-state contract

`PersistedLocalSyncStateSchema` is the registered backward-compatible reader root. It accepts persisted versions
2, 3, and 4 structurally without a transform. `normalizeLocalSyncState` maps a successful parse to the strict
version-4 `LocalSyncStateSchema`, from which `LocalSyncState` derives.

Required identity/basis fields keep their current non-empty and discriminant checks. Valid known optional fields
are retained. Malformed known extensions and unknown additive fields are ignored by the normalizer, preserving the
current tolerant-reader behavior instead of invalidating an otherwise usable base record. `priorFileList` remains
live compatibility state: reads retain valid string arrays, writers accept and persist a supplied list, and
unrelated writes carry it forward.

The legacy `machineId` remains available only to the raw one-time migration reader; validated current-state reads
do not expose it. Missing or malformed state still resolves to `null`, while non-`ENOENT` I/O errors still throw.
`LocalSyncStateSchema.parse` validates every version-4 record immediately before atomic persistence.

### 7. Decomposition cut-map contract

`DecomposeAllocationMapSchema` is the strict version-2 runtime authority for the cut map and all nested
discriminated unions. It composes kernel work-state, work-class, slug, and canonical-digest primitives where their
domains match. Its refinements preserve exact-key checks, transform-shape rules, parent-position constraints,
managed-path/content-locator normalization, source allocation, dependency-edge, and target-set invariants already
enforced by `parseCutMap`.

`DecomposeAllocationMap` and its structural child types derive from the schema. `parseCutMap` remains the public
no-throw `CutMapParseResult` adapter: version 1 keeps its targeted upgrade guidance, unknown versions keep their
current rejection, and version-2 parse failures retain stable boundary reasons. Ordering is not a schema invariant:
structurally and graph-valid unsorted input remains accepted, then a post-parse normalizer establishes canonical
ordering and preserves receipt behavior without embedding a transform in the runtime root.

The cut-map schema is intentionally unregistered. Its graph-wide and cross-record invariants cannot be represented
acceptance-equivalently by the current JSON Schema projection; registering only the structural subset would
advertise a false contract.

### 8. Git worktree porcelain contract

The raw porcelain tokenizer moves out of `worktree-roster.ts` into `worktree-porcelain.ts` with
`GitWorktreePorcelainRecordSchema`. One normalized stanza contains a non-empty `path`, nullable `head`, nullable
local branch name, and `detached` boolean. Unknown porcelain attributes remain ignored for Git-version forward
compatibility.

A non-empty stanza without a `worktree` anchor is no longer silently discarded. Successful Git execution with an
invalid stanza produces a `git.worktree-porcelain.invalid` domain error carrying stable field-path diagnostics; it
is not wrapped as `GitProcessError`. Callers retain their current fail-or-degrade policy after receiving that domain
error, and narrower consumers continue to require a head where their own contract needs one. Derived meta
resolution and `WorktreeRosterResult` remain outside this schema and outside this work unit.

### 9. Cold-start and cross-work-unit adapter contracts

`ParsedSpecInputSchema` replaces the handwritten successful cold-start union with the existing four strict arms:
`arc-spec`, `issue`, `document`, and `description`. `ParsedSpecInput` derives from it. The overall parser still has
the fifth outcome—the existing empty-input failure—through the unchanged no-throw `SpecInputParse` contract.
Classification precedence and field assignments do not change; successful internally assembled values are parsed
before return. This adapter-local schema is not registered.

`CrossWuEntrySchema` and the no-throw entry-result schema replace the handwritten `CrossWuEntry` and `EntryParse`
shapes. They validate a known section, non-empty merge key, and preserved raw entry block. Working-memory and inbox
Markdown grammars, title/header-keyed merge identity, malformed-entry reasons, most-recent-note conflict behavior,
and lossless reconstruction remain unchanged.

These cross-WU schemas are unregistered compatibility-adapter contracts. They do not canonize title-keyed Markdown
as a durable future record model. The materialized-baseline stamp is not included and remains assigned to the
cohort tail.

### 10. Review-gate canonicalization domains

`canonicalizePlainJson` remains exported from `packages/arc-framework/src/scripts/review-gate/core/identity.ts`, but
delegates directly to the kernel `canonicalize` function. Existing review-gate hash helpers and digest formatting
remain; adopting canonical bytes does not adopt the kernel's `sha256:` wire format.

The cutover is caller-classified rather than global. Recomputable identities use the kernel-backed helper:

- policy versions and request identities derived from a newly computed policy version;
- live permission versions used to key reconcile snapshots;
- repair-validation result digests, which are produced from the current validated result and are not replay keys.

Version-1 durable identities use a frozen serializer exported only inside the repository-private review-gate
controller. `packages/arc-framework/src/scripts/review-gate/core/legacy-canonical-v1.ts` contains the exact
pre-cutover algorithm as `canonicalizeReviewGateV1`; it is not exported from the CLI package. Its closed caller set
is:

- version-1 receipt idempotency keys and receipt hashes in `request-key.ts`;
- attestation manifest digests embedded in version-1 receipt event ids, preserving exact replay detection;
- version-1 qualification scope, checkpoint-chain, acceptance-matrix, and activation-candidate digests and the
  corresponding activation-operation equality check.

Those contracts continue to create and verify the same version-1 bytes; persisted receipts, checkpoints, and
candidates are never rewritten. Receipt hashes embedded in later payloads remain opaque references, so ledger links
survive unchanged. A future durable-contract version may adopt kernel bytes explicitly, but this work does not
reinterpret an existing version.

The kernel canonicalizer and its receipt fixtures do not change. Kernel-backed callers intentionally adopt codepoint
key ordering, NFC normalization, malformed-Unicode rejection, and sparse-array rejection. A policy version may
therefore re-key where the prior serializer differed. Existing receipts retain their stored policy-version string;
ledger validation does not recompute policy content.

Characterization fixtures pin representative current ASCII output and intentional kernel divergence cases: Unicode
key order, composed/decomposed strings, integer-like keys, malformed Unicode, and sparse arrays. Legacy fixtures
exercise divergent Unicode values in attestation replay, receipt validation, and resumed qualification checkpoints.
A final direct-caller inventory proves every use of either serializer belongs to the declared kernel-backed or
version-1-frozen set. Existing kernel receipt and digest fixtures remain byte-identical.

The frozen serializer retains ambient `localeCompare()` exactly. Durable version-1 contracts expose only fixed ASCII
property-name sets, including their closed map keys; divergence fixtures vary accepted string values rather than
introducing arbitrary Unicode property names. Pinning a locale would change the legacy algorithm and is not part of
this compatibility seam.

## Alternatives & Rationale

- **One global validation schema module:** rejected because it would centralize semantics away from the adapters
  that own compatibility and failure policy. Only registry assembly is cross-subsystem.
- **Register every schema:** rejected because adapter payloads and graph-refined runtime contracts would be
  advertised as durable or acceptance-complete when they are not.
- **Use refinements or transforms inside registered roots:** rejected because the generated JSON Schema would omit
  accepted/rejected distinctions. Structural roots plus explicit normalizers keep runtime and projected contracts
  honest.
- **Validate configuration once at raw ingress:** rejected because raw YAML, tolerant status reads, precedence-aware
  personal overrides, strict hook policy, and the session-envelope view have different recovery authorities.
- **Strict-parse every meta consumer:** rejected because compatibility readers deliberately retain independent
  evidence when one closed-domain token is invalid.
- **Keep the shell validator as a second authority:** rejected because its key/default/domain table already drifts
  from TypeScript and the packaged config. The stable script remains only as a launcher.
- **Register the structural portion of the cut map:** rejected because discoverability would imply acceptance of
  records that runtime graph invariants reject.
- **Preserve the review-gate serializer for every identity:** rejected because recomputable policy, permission, and
  repair-result identities should converge on the kernel authority. Only the enumerated version-1 durable domains
  retain frozen legacy bytes.
- **Re-hash or rewrite persisted version-1 records during cutover:** rejected because GitHub receipt records are
  immutable, later receipts reference earlier hashes, and qualification checkpoints resume by recomputing their
  chain. The frozen version-1 seam preserves evidence without broadening those wire contracts.
- **Convert authorization decisions to Result:** rejected because the current discriminant and per-code payloads
  model domain outcomes more clearly than a generic success/error split.

## Cross-cutting Considerations

### Compatibility and migration

This is an in-place authority migration, not a storage-version sweep. Audit entries remain version 2; sync state
writers remain version 4 while readers accept versions 2–4; cut maps remain version 2 with the version-1 upgrade
diagnostic; meta Markdown bytes and legacy projection parsing remain stable. Established import paths re-export
inferred types where necessary so consumers can migrate without an unrelated public API break.

Review receipts, attestation event ids, and qualification checkpoint/candidate identities remain on their frozen
version-1 bytes. Recomputable policy, permission, and repair-result identities move to kernel canonical bytes;
existing ledgers and resumable qualification state remain readable and valid.

The observable contract is defined per adapter, not by one global strictness rule. Tests pin tolerant defaults,
warnings, no-throw results, hard errors, null returns, thrown I/O errors, and process-versus-domain error
classification before each validator is replaced.

### Security and diagnostics

Schema errors never include whole raw persisted records, commit-message content, or other potentially sensitive
values. Adapter diagnostics identify the boundary and stable field path. Audit argument redaction remains before
persistence. Strict producer schemas prevent accidentally serializing new fields into durable records without a
deliberate schema change.

### Performance

Validation occurs once at each ingress or producer boundary. Config schemas and registry factories are module-level
definitions; callers do not rebuild them per field. Worktree porcelain is parsed in the same single pass over Git
stdout. No extra Git or filesystem reads are introduced. Registry projection remains build/test-time work and does
not expand the shipped schema artifact.

### Architecture and forward compatibility

All runtime contracts depend downward on the kernel and remain in `src/lib`; commands and handlers orchestrate
them without owning schema semantics. The design aligns with the procedure-substrate direction: deterministic
validation and diagnostic composition live in TypeScript, structure derives from schemas, and no new
agent-interpreted conditionals or hand-authored contract copies are introduced.

### Testing and rollout

Migration proceeds boundary by boundary behind characterization fixtures. Each slice first pins accepted, rejected,
compatibility, and failure-policy behavior; then introduces the schema, derives the type, migrates consumers, and
removes the superseded structural validator. Focused tests cover owning modules and callers before the next slice.

The completed unit runs both TypeScript typecheck surfaces, TypeScript and shell lint, focused and full Vitest
suites, Markdown lint, and the package build. The final inventory search proves no in-scope consumer bypasses its
schema and no migrated handwritten structural authority remains.

## Success Criteria

- Every named boundary enters internal code through its owning schema, and all exported migrated structural types
  derive from those schemas.
- `createValidationSurfacesRegistry()` contains exactly the four declared roots with pinned metadata, deterministic
  composition, and representative runtime/JSON-Schema acceptance parity; the kernel-only generated artifact is
  unchanged.
- Audit records reject every invalid command/decision/outcome combination before I/O while preserving the throw
  versus returned-I/O-error split and argument redaction.
- Both meta layouts parse to the same semantic fields, the canonical full layout round-trips with exact field-specific
  absence projection, localized legacy-layout mutations preserve unrelated bytes, and malformed closed-domain tokens
  preserve the existing field-level degradation behavior; strict pointer composition fails before worktree teardown.
- The configuration catalog accounts for every packaged and code-consumed project key exactly once; policy-specific
  defaults, warnings, precedence, hard errors, cross-field checks, degraded values, and unknown-key behavior remain
  observably compatible.
- `validate-config.sh` delegates to the TypeScript validator while preserving its path, selected
  `ARC_CONFIG_FILE`, custom-`ARC_DIR` behavior, PASS/WARN/ERROR output, summary counts, and exit codes.
  `hooks.subject_warn_length` is no longer silently treated as a known key.
- Sync-state versions 2, 3, and 4 hydrate to a strict version-4 record; all known optional fields, including
  `priorFileList`, survive unrelated writes; malformed/missing versus I/O failure behavior remains unchanged.
- Cut-map schemas preserve all current structural and graph invariants, version-specific diagnostics, canonical
  ordering, and receipt bytes without registering an incomplete JSON Schema contract.
- Malformed non-empty worktree porcelain stanzas produce a domain validation error distinct from process execution
  failure, while unknown attributes and caller-specific degradation remain compatible.
- Cold-start and cross-WU parsers retain their no-throw outcomes, classification/merge identity, malformed-entry
  reasons, and lossless raw reconstruction.
- Review-gate policy, permission, and repair-result identities use kernel canonical bytes and characterized
  divergence cases re-key as intended; receipt, attestation-event, and qualification version-1 identities remain
  byte-valid through the frozen serializer, cross-record references remain valid, and kernel receipt/digest fixtures
  remain byte-identical.
- Focused tests, full tests, both typecheck surfaces, TypeScript and shell lint, Markdown lint, and the package build
  all pass, and the final migration inventory finds no in-scope parallel structural authority.

## Open Questions

None. Schema placement, root registration, compatibility boundaries, config targeting and legacy-key disposition,
error routing, and the recomputable-versus-version-1 canonicalization boundary are settled. Test-file partitioning
and within-module implementation order remain task-planning details.
