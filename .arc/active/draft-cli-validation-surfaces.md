# Draft: cli-validation-surfaces

- **Origin:** [internal]
- **Cohort:** `cli-substrate-adoption`
- **Purpose:** Adopt runtime schemas at the CLI's priority non-session trust boundaries without centralizing
  subsystem semantics.
- **State:** Formalization-ready — two adversarial passes are reconciled; the boundary catalog, durable/compatibility
  schema splits, failure policies, and observable success signal are settled against landed and downstream contracts.

---

## Problem / Motivation

Several CLI boundaries accept persisted JSON, configuration-derived objects, Git porcelain, or structured records
whose runtime validation is manual, partial, or coupled to TypeScript assertions. External drift at those boundaries
can be mistaken for valid internal state. The selected boundaries need schema-backed validation and schema-inferred
types while retaining their existing compatibility and failure behavior.

This member covers the priority non-session boundaries identified in the substrate audit. Session-init, compaction,
and recovery envelope schemas belong wholly to `cli-session-envelope`; the final cohort tail owns newly discovered
wholesale migrations rather than allowing this member's inventory to grow.

## Landed-Cohort Reconciliation

- `cli-schema-kernel` supplies Zod 4, kernel vocabulary, the versioned registry, `ArcError`, Result insulation, and
  the canonical JSON authority. This member composes those contracts rather than defining substitutes.
- `cli-session-envelope` owns the complete envelope family and has already shipped the branch-gone cascade schemas.
  Branch-gone evidence is therefore removed from this member. Its envelope views of config and Git data remain
  distinct from the standalone records owned here.
- `cli-git-executor` owns subprocess execution and `GitProcessError`. A successful Git invocation whose stdout is
  malformed produces a schema/domain validation failure, never a process-execution failure.
- `cli-substrate-complete-migration` owns the full `WorktreeRosterResult` contract, newly discovered hand-written
  validators such as the materialized-baseline stamp, and residual first-party adoption after the named roots land.
- `operational-state-docs` consumes the storage-agnostic meta-record schema. It retains ownership of Markdown
  projection policy, lifecycle/location-specific record refinements, and the legacy flat-bullet fallback's eventual
  disposition.

The shared cohort document still names branch-gone evidence under this member; planning closeout must reconcile that
coordination line with the landed `cli-session-envelope` ownership.

## Goals

- Give every selected boundary a co-located Zod schema as its runtime and TypeScript type authority.
- Replace unsafe casts and ad hoc structural checks with deliberate boundary parsing while preserving each caller's
  current failure policy.
- Register the four persisted or externally meaningful roots whose complete accepted domains can be projected
  faithfully through the shipped kernel registry.
- Keep adapter-local schemas local when registry discovery would incorrectly promote an interim representation into
  a durable contract.
- Route the review-gate canonicalization outlier through the kernel canonicalizer without changing the kernel's
  established receipt semantics.
- Leave a closed, fixture-backed implementation inventory for the cohort tail to audit.

## Non-Goals

- Convert every CLI type or validation helper to Zod.
- Own session-init, compaction-seed, recovery-envelope, or full worktree-roster schemas.
- Introduce a generalized Markdown parser or make today's Markdown projection the canonical operational-state model.
- Reform configuration axes, configuration precedence, lifecycle policy, or subsystem behavior.
- Convert `AuthorizationDecision` or other domain unions to Result solely because the kernel exposes it.
- Publish the composed validation registry or expand the kernel JSON Schema bundle; schema publication belongs to
  `schema-introspection-layer`.

## Design Decisions

### Ownership and composition

- Schemas live beside their subsystem boundary in a `schemas.ts`, `schema.ts`, or equivalently clear neighboring
  module. There is no global validation-surfaces schema module.
- Exported structural types for an in-scope root derive through `z.infer`; the corresponding handwritten interface
  or union is removed. Domain types outside the migrated root remain handwritten where appropriate.
- Producer objects use strict schemas unless their existing contract deliberately admits additive fields. Text
  tokenizers and compatibility adapters remain responsible for syntax that is not itself a structured record.
- File, subprocess, cross-checkout, and decoded-JSON inputs use `safeParse` at the edge. Internally assembled values
  use `parse` before I/O or return when failure means a programming defect.
- Zod issue details are translated at the adapter boundary. Diagnostics retain the boundary name and stable field
  paths without including whole raw records or sensitive values.

### Registry composition

Add `createValidationSurfacesRegistry()`, returning a fresh `createKernelRegistry()` with exactly these roots:

| Registry id        | Root schema                     | Version | Migration posture     |
|--------------------|---------------------------------|---------|-----------------------|
| `audit-entry`      | `AuditEntrySchema`              | `2`     | `strict-current`      |
| `meta-record`      | `MetaRecordSchema`              | `1`     | `strict-current`      |
| `arc-config`       | `ArcConfigSchema`               | `1`     | `strict-current`      |
| `local-sync-state` | `PersistedLocalSyncStateSchema` | `4`     | `backward-compatible` |

Registration is discovery metadata, not publication. Adapter-local worktree, cold-start, and cross-WU schemas are
not registered. Tests may project the composed registry to prove identity, reference, and deterministic-order
behavior, but the shipped `dist/schemas/kernel.json` remains the kernel-only artifact until an owning publication
surface composes registries deliberately.

Registration promises acceptance-equivalent JSON Schema, not merely a structural sketch. A registered root may not
depend on transforms, `.refine`, `.superRefine`, or other runtime-only effects for any accepted/rejected distinction:
the shipped `z.toJSONSchema` projection must express the complete domain. Backward-compatible hydration and canonical
ordering therefore use explicit post-parse normalizers. Runtime roots whose semantic invariants cannot be projected,
including the cut map's graph-wide checks, remain co-located and schema-backed but unregistered.

### Boundary contract matrix

#### Audit log

- `AuditEntrySchema` owns the complete version-2 entry, including command-keyed interlock snapshots and outcome
  unions. Its command × decision/refusal × outcome relationships are encoded as structural discriminated-union arms,
  not cross-field refinements, so the registered JSON Schema rejects every combination the runtime schema rejects.
  `AuditEntry` and its contained structural types become inferred types; `AuthorizationDecision` remains an unchanged
  domain union outside this root.
- The root and discriminated payloads are strict. `appendAuditEntry` uses `parse` before filesystem I/O and retains
  its current split: a schema violation is a programming/precondition error, while an I/O failure returns
  `{ ok: false, error }` and never masks a successful release operation.
- Only version 2 is accepted. This member neither reads version 1 nor introduces version 3. A future JSONL reader
  will `safeParse` each line against the same root.

#### Meta record

- `MetaRecordSchema` is the closed, storage-agnostic semantic record, with code-facing keys `state`, `owner`,
  `branch`, `workClass`, `priority`, `cohort`, `dependsOn`, `origin`, `design`, `taskList`, `currentWorkflow`,
  `lastCompleted`, `nextTask`, `blockers`, `nextAction`, `prUrl`, and `completed`. State, class, and priority compose
  the kernel domains; every key is present, with semantically absent scalar values represented as `null`;
  `dependsOn` and `design` are first-class identifier arrays. `workClass` and `priority` additionally admit the
  semantic `TBD` value while the record is unresolved.
- The schema describes the record, not display labels, Markdown syntax, or a lifecycle/location band. Downstream
  managed records may refine band requiredness, transitions, and list cardinality without replacing this structural
  root. This member supplies the zero-reshape record consumed by `operational-state-docs`; it does not make the
  current Markdown file canonical storage.
- `META_FIELDS` remains the ordered projection descriptor and gains an explicit semantic key for each display label.
  An unregistered `MetaProjectionRecordSchema` validates the current 17-label `string | null` tokenizer
  intermediate. An unregistered `ParsedMetaRecordSchema` then owns the same code-facing semantic keys and list/
  sentinel mapping as the durable root, but retains non-empty raw strings for closed-domain fields so compatibility
  readers can degrade one invalid field without losing the rest of the record. Neither adapter schema is the durable
  record type authority.
- `parseMetaRecord` keeps the table-first grammar, current flat-bullet fallback, token normalization, and narrative
  preservation, then maps and validates the projection intermediate through `ParsedMetaRecordSchema`. A separate
  `toMetaRecord` safe-parse step applies `MetaRecordSchema` only where the caller requires a fully valid durable
  record; valid parses require no reshape. `renderMetaFile` assembles and validates a strict semantic record from
  complete defaults plus partial semantic overrides, then performs the inverse projection while retaining current
  Markdown bytes. `—` and `[none]` map to `null` for scalar fields and `[]` for lists; `[TBD]` maps to semantic `TBD`;
  `[internal]` maps to semantic `internal`.
- Current internal consumers migrate from display-label property access and comma reparsing to semantic fields, but
  retain their existing validation granularity. In particular, the worktree roster maps an unrecognized parsed
  `state` to its existing `unknown` degradation while preserving owner, cohort, class, priority, dependency, and meta
  path evidence; it does not discard the entire parsed record. Narrower public projections such as `parseMetaFile`
  retain their existing return and warning behavior. Semantic and rendered-form round trips cover strict records,
  while malformed-token fixtures pin tolerant caller behavior. This member does not decide whether
  `operational-state-docs` eventually retains or removes the legacy projection fallback.

#### Configuration

- One `ARC_CONFIG_FIELDS` catalog is the authority for active code-owned dotted keys, per-key Zod string schemas,
  and documented defaults. Its inventory reconciles the packaged config, TypeScript consumers, and the installed
  config validator rather than assuming the template alone is complete; validator-only legacy keys are either marked
  compatibility-only or retired deliberately. Domains cover enum tokens, boolean tokens, positive-integer tokens,
  patterns, free-form values, and template values.
- `ArcConfigSchema` is the registered valid-record contract composed from that catalog, not merely the subset returned
  by `readConfigSettings`. Keys remain optional at the authoring edge because absence selects a default. Unknown
  string-valued dotted keys are admitted and preserved for forward compatibility; known keys may not evade their
  declared per-key domains. The schema owns record shape and legal per-key values. Cross-field operational policy,
  such as custom commit modes requiring a pattern, remains an adjacent semantic validator and is not misrepresented
  as JSON-Schema-visible structure.
- `parseArcConfig` remains the syntax tokenizer and retains CRLF normalization, quote stripping,
  first-definition-wins behavior, and bare-empty default selection. Its result validates only through an unregistered
  open `RawArcConfigSchema` (`Record<string, string>`); invalid known values stay visible until the adapter that owns
  their current failure policy applies the corresponding catalog field schema. There is no universal coercing
  normalizer.
- Policy-specific adapters preserve the shipped behavior: `readConfigSettings` defaults and warns only for its
  current tolerant subset; `user.notes_push` stays raw until the git-config-precedence resolver validates it;
  commit-check values retain hard `config.invalid-*` findings; the full config validator retains its error/warning
  and cross-field rules; and consumers that deliberately degrade unknown values keep doing so. All reuse the catalog
  leaf schemas and defaults rather than maintaining parallel enum or numeric tables.
- The installed `validate-config.sh` becomes a thin compatibility launcher over the schema-aware TypeScript config
  validator, preserving its text and exit-code contract while removing its duplicate known-key/default/domain table.
  The semantic validator composes cross-field rules after record validation and retains unknown-key warnings even
  though `ArcConfigSchema` tolerates unknown strings for forward compatibility.
- `ConfigSettingsSchema` is an unregistered strict schema for the completed agent-consumable projection returned by
  `readConfigSettings`; because that compatibility view intentionally carries some raw values, it validates key
  presence and string shape rather than claiming every value is normalized. Its structural type becomes inferred.
  The session-envelope config view and git-config-resolved provenance model remain distinct authorities. This member
  does not reform precedence or move personal-override policy into the file reader.

#### Local sync state

- `PersistedLocalSyncStateSchema` is the registered backward-compatible reader root. It accepts persisted versions
  2, 3, and 4 without an unprojectable schema transform. `normalizeLocalSyncState` maps a successful parsed record to
  the strict current `LocalSyncStateSchema`; the public `LocalSyncState` type derives from that version-4 schema.
- Required identity/basis fields retain their current validation. Known valid optional fields are carried forward;
  malformed known extensions and unknown additive fields are ignored by the normalizer, matching today's tolerant
  behavior instead of invalidating an otherwise usable base record.
- `priorFileList` is live compatibility state, not dead data. Reads retain valid string arrays, current writers
  accept and persist a supplied list, and unrelated writes carry it forward. No version bump or field removal occurs.
- The legacy `machineId` field remains available only to the raw one-time migration reader and is not surfaced by a
  validated current-state read. Missing/malformed state still resolves to `null`; non-`ENOENT` I/O failures still
  throw.
- `LocalSyncStateSchema` validates version-4 output immediately before atomic persistence, while the registered
  persisted root retains its broader backward-compatible posture.

#### Decompose cut map

- `DecomposeAllocationMapSchema` owns the complete version-2 map and all contained discriminated unions. The root is
  strict and composes kernel work-state, work-class, slug, and canonical-digest primitives where their domains match.
- Schema refinements preserve the current cross-record invariants, managed-path rules, and content-locator
  normalization; converting the validator must not weaken it to structural checking alone.
- `parseCutMap` remains the public no-throw `CutMapParseResult` adapter. Version 1 retains its targeted upgrade
  guidance, unknown versions retain the current rejection, and an explicit post-schema normalizer preserves accepted
  version-2 canonical ordering and receipt behavior without putting a transform in the runtime root.
- The cut-map schema is intentionally unregistered: its graph-wide and cross-record refinements disappear from the
  shipped JSON Schema projection. Runtime Zod remains its type and validation authority; discovery waits for a future
  registry contract that can disclose or execute semantic validation rather than advertising an incomplete domain.

#### Git worktree porcelain

- `GitWorktreePorcelainRecordSchema` validates only the normalized raw record produced from one
  `git worktree list --porcelain` stanza: non-empty path, nullable head and branch, and the detached flag.
- The tokenizer ignores unknown porcelain attributes for Git-version forward compatibility but no longer silently
  drops a non-empty stanza missing its `worktree` anchor. Successful subprocess output with an invalid stanza becomes
  a `git.worktree-porcelain.invalid` domain error; it is never wrapped as `GitProcessError`.
- Callers retain their existing fail/degrade policy after the parser reports that error. Consumers needing a head
  continue to enforce it at their narrower boundary. Derived meta resolution and `WorktreeRosterResult` remain tail
  ownership.

#### Cold-start spec input

- `ParsedSpecInputSchema` is the strict four-arm discriminated union: `arc-spec`, `issue`, `document`, and
  `description`. `ParsedSpecInput` derives from it.
- The overall parser still has a fifth outcome in the form of the existing empty-input failure. The no-throw
  `SpecInputParse` contract and its classification precedence remain unchanged; successful internally assembled
  values are schema-validated before return.
- The schema is adapter-local and unregistered because it is neither persisted nor a published wire contract.

#### Cross-WU note adapter payloads

- `CrossWuEntrySchema` and the no-throw entry-parse result schema replace the handwritten `CrossWuEntry` and
  `EntryParse` shapes. They validate the current adapter payload: known section, non-empty merge key, and preserved
  raw entry block.
- Existing working-memory and inbox Markdown grammars, title/header-keyed merge identity, malformed-entry reasons,
  and lossless raw reconstruction remain unchanged.
- These schemas are explicitly unregistered compatibility-adapter contracts. They do not canonize title-keyed
  Markdown as the future record model; `user-surface-records` may replace them with slug-keyed storage-agnostic
  records. The materialized-baseline stamp is not part of this target and routes to the cohort tail.

### Canonical JSON outlier

- Keep the review-gate `canonicalizePlainJson` export as a compatibility seam, but implement it by delegating to the
  kernel `canonicalize` function. Existing review-gate digest formatting continues through its current hash helper;
  this change adopts canonical bytes, not the kernel's `sha256:` wire format.
- The kernel canonicalizer and its existing receipt fixtures do not change. The outlier intentionally adopts kernel
  UTF-8/codepoint key ordering, NFC normalization, malformed-Unicode rejection, and sparse-array rejection.
- Policy versions, request keys, and other derived review-gate identities may re-key when inputs exercise a domain
  where the old serializer diverged. That cutover is accepted: those identities are recomputable and already change
  when policy content changes. Do not add dual-hash compatibility or preserve locale-sensitive semantics.
- Characterization fixtures cover representative current ASCII inputs plus discriminating Unicode, normalization,
  integer-like-key, and sparse-array cases. Any additional canonicalization outlier found during implementation
  routes to `cli-substrate-complete-migration`.

## Delivery and Verification

- Characterize accepted, rejected, and compatibility fixtures before replacing each hand-written validator.
- Assert the exact registry identities, versions, migration postures, deterministic ordering, and duplicate-free
  composition with the kernel vocabulary. For every registered root, inspect the generated JSON Schema and exercise
  representative valid and invalid fixtures against both forms; no registered constraint may exist only in a Zod
  refinement or transform.
- Prove each boundary's existing failure contract: audit precondition vs. I/O result; meta parse/warning behavior;
  meta field-level degradation; config policy-specific default, warning, precedence, and hard-error behavior;
  sync-state null/throw split; cut-map rejection reasons; Git process-vs-schema errors; and the two no-throw adapter
  outcomes.
- Prove backward compatibility with meta's legacy projection and semantic list/sentinel mapping, sync-state versions
  2/3/4 including `priorFileList`, and the cut-map version-1 upgrade error. Pin current writer output for audit v2,
  meta Markdown, sync-state v4, and cut-map v2.
- Reconcile every active or compatibility-only config key once, characterize its legal values/default and owning
  failure policy, and prove tolerant, precedence-aware, strict-error, cross-field, degraded-value, and unknown-key
  paths remain observably compatible while drawing their leaf domains from one catalog.
- Remove each migrated handwritten structural type/validator and verify no in-scope consumer bypasses the schema
  authority. Preserve domain refinements and adapters that carry behavior beyond structural validation.
- Demonstrate that review-gate callers use kernel canonical bytes, derived identities re-key only in characterized
  divergence cases, and existing kernel receipt/digest fixtures remain byte-identical.
- Run focused unit/integration tests, both TypeScript typecheck surfaces, lint, the full test suite, and the build.

The falsifiable success signal is: every named boundary enters internal code through its owning schema, all existing
compatibility fixtures and caller-visible failure outcomes still pass, the four registered roots project an
acceptance-equivalent contract with pinned metadata, and no in-scope parallel structural authority remains.

## Alternatives

- **One global schema module:** rejected because semantic ownership and compatibility context would be lost.
- **Register every schema:** rejected because registration would falsely advertise ephemeral adapter payloads as
  durable discoverable contracts.
- **Validate every config layer in one root:** rejected because raw YAML projection, resolved personal overrides,
  and session-envelope views have different authorities and recovery behavior.
- **Strict-parse every meta reader:** rejected because one invalid domain token must not erase other evidence from
  compatibility readers that deliberately degrade at field granularity.
- **Normalize every invalid config value at ingress:** rejected because tolerant defaults, precedence-aware
  resolution, hard validation, and consumer-specific degradation are distinct shipped policies.
- **Register the cut map's structural subset:** rejected because discovery would claim an accepted domain that omits
  the runtime graph invariants; a local complete runtime schema is more honest than a registered partial contract.
- **Preserve the review-gate serializer's bytes:** rejected because it would retain the divergent locale-sensitive
  outlier; the derived identities can safely re-key onto the canonical authority.
- **Force Result onto authorization:** rejected because the existing domain discriminant and per-code payloads are
  clearer than a generic success/error split.

## Risks

- Structural rewrites can conceal semantic weakening, especially in the cut-map refinements and audit cross-field
  invariants.
- Incorrect strictness can reject forward-compatible input or admit malformed state; fixtures define the posture at
  each edge.
- Meta projection mapping could lose sentinel or list semantics, or the base schema could pre-empt lifecycle-band
  policy; semantic round trips, malformed-token degradation fixtures, and the downstream refinement boundary are
  explicit guards.
- The config catalog could miss a shell-only key or flatten deliberately different failure policies; union-inventory
  tests, one field-schema catalog, and policy-specific compatibility fixtures guard those failure modes.
- A sync-state normalizer could silently drop reserved extension data; round-trip fixtures cover every known field.
- Worktree parsing errors could change a caller's degradation path if parser errors and executor errors are conflated.
- Canonicalization changes derived review-gate identities by design; characterization must distinguish accepted
  outlier re-keying from forbidden kernel receipt drift.

## Resolved / Open / Next

### Resolved

- The member stays one `Heavy` work unit: the boundaries are independently implemented but share one migration
  concern, registry factory, compatibility discipline, and cohort-tail audit.
- The owned boundary set, four-root registry catalog, strict-meta/parsed-adapter split, config field catalog and
  policy-specific adapters, per-boundary strictness, compatibility behavior, error routing, and canonical cutover
  posture are settled above.
- `AuthorizationDecision` remains unchanged; branch-gone evidence is already shipped elsewhere; full worktree-roster
  and newly discovered validator migration remain tail scope.

### Open

- No design decision is intentionally deferred. Exact schema-module filenames, the mechanical enumeration of the
  reconciled config catalog, and test-file placement are local details to ground in the spec.

### Next

- Await workflow approval; then reconcile the shared cohort line, capture the draft, and transition to `create-spec`.

## Scope Estimate

Large (week+). Class `Heavy`: multiple compatibility surfaces require separate characterization and coordinated
review. Depends on `work-organization-reform` and the shipped `cli-schema-kernel`.
