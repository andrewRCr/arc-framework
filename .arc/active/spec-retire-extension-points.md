# Spec (`detailed` · `RFC`): retire-extension-points

- **Origin:** [internal]

- **Purpose:** Remove ARC's inactive extension mechanism and its execution instructions, CLI surfaces, and
  validation machinery. Preserve its lifecycle-event contracts in an architectural record without retaining
  a callable hook, configuration switch, or replacement implementation.

---

## Introduction / Context

ARC currently supplies eleven lifecycle extensions as Configurable markdown files under `system/extensions/`.
Each carries an `active` flag and a project-authored `.actions` section. `runExtensionsSessionInitStatus` reads
those files and returns active names; workflow instructions consult that list and execute actions at each
declared fire point. `runExtensionsStatus` additionally uses `scanExtensionPoints` and `classifyExtensionRefs`
to inspect workflow markers and their targets. All eleven packaged extensions are inactive placeholders, and
this repository also configures all eleven inactive.

The instruction and maintenance costs remain even when every fire point skips. `auditPushExtensionCoverage`
requires a `pre-push-review` declaration and marker or workflow-wide contract at agent-managed push sites.
The status and recovery pipelines thread active names, and `composeCheckpointInterlockSurface` emits an
`extensionReport` whose content is always null. None of these surfaces supplies a CLI-fired hook executor.

Remove the mechanism whole. Retain event vocabulary, placement, payloads, frequency, and execution constraints
as historical design knowledge for a possible CLI-fired lifecycle-event design. This specification implements
no replacement and promises no delivery date or supported interface for one. The project's pre-public-release
compatibility posture permits changing its unpublished CLI and envelope contracts in place.

## Goals

1. Eliminate inactive extension files, activation switches, declarations, markers, agent dispatch instructions,
   commands, probes, scanners, validators, and mechanism-specific checks.
2. Keep every independent workflow rule and authority boundary that currently shares prose with a hook.
3. Describe the supported customization model accurately, including the accepted gap in inserting workflow steps
   and notifying external trackers.
4. Preserve the event contracts and retrieval revision in a superseding ADR, while keeping accepted historical
   ADR bodies intact.
5. Keep method coverage, domain-rule validation, ordinary project checks, installation/update behavior, and
   non-mechanism uses of the word “extension” working.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- No lifecycle-event executor, replacement hook format, configuration axis, or verb-result directive design.
- No edits to `docs/`, its demos or GIFs, or `mkdocs.yml`. Public-site teaching and navigation change in their
  separately staged holistic content sweep. The root `README.md` is included here.
- No migration, compatibility alias, deprecated command, cleanup verb, or automatic deletion of installed
  projects' retained Configurable extension files.
- No edits to sibling work units' planning artifacts or the cohort's storage-coupling register. Coordination
  captures are planning work outside implementation and its success criteria.
- No rewrite of historical ADR bodies, supplemental analyses, completed work-unit records, or candidate
  attestation records. Only the supersession metadata specified below changes in existing ADRs.
- No change to the earlier quality-hook extraction in `bootstrap-extraction.ts`, including `sources.postTask`
  and `sources.postUnit`, which refer to the already-retired `post-task-quality` and `post-unit-quality` files.
- No method fire-point validator or reuse obligation for the extension scanner. Method or fragment marker
  grammars and reachability checks require their own design.
- No change to `hooks.skip_extensions`, filename-suffix handling, Markdown parser extensions, generic registry
  extensibility, or harness-native lifecycle hooks.

## Proposed Design

### D1 — Retire the complete mechanism as one work unit

Delete all eleven extension files and their README from package source and this repository's `.arc/` instance.
Remove every `arc.extensions` declaration, extension fire-point marker, action invocation, conditional active-set
instruction, link definition, reserved name, and extension-specific placeholder. Do not retain an `active` switch,
directory scaffold, storage format, command stub, or dead scanner for a future redesign.

This remains one work unit and one delivery member with chunked review. Its parts are one retirement concern:
`auditPushExtensionCoverage` constrains push-site prose, while session workflows consume the extension probe
produced by `runSessionInitStatus` and `runRecoverStatus`. Independently landing their removal would leave broken
validation or dispatch. `Class` remains `Heavy`: producing a correct task plan requires substantial grounding
across CLI composition, installed content, workflow ordering, validators, and contract tests. No new model is
invented by the removal.

### D2 — Change CLI and typed output contracts in place

Remove the `arc extensions` command tree, its input-policy registrations, handler, command modules, help content,
schemas, formatters, frontmatter parser and exports, point scanner, and orphan detector. In particular, delete:

- `commands/extensions.ts` and `commands/extensions/{status,types,format}.ts`;
- `handlers/extensions.ts`;
- `lib/frontmatter/extension.ts` and its re-exports from `lib/frontmatter/index.ts`;
- `lib/extensions/{point-scanner,orphan-detector}.ts`.

Remove the `extensions` probe, callbacks, schema fields, rendering, and imports from full status, session-init,
and recovery composition. Remove the handoff path's otherwise-unused extension probe and active-name input too.
The entry points are `runStatus`, `runSessionInitStatus`, `runRecoverStatus`, and `runSessionHandoffStatus` in
`commands/status/run.ts`, with corresponding types/schemas/formatting and handler composition.

Remove `SESSION_ENVELOPE_SCHEMA_IDS.extensionsSessionInit`, its `extensions-session-init` registry entry,
`ExtensionsSessionInitResultSchema`, and every registration/import that only serves them. Schema discovery must
stop advertising that identifier; the surviving envelope slots retain their existing contracts.

Remove `activeExtensions` from derived-locus inputs and its memo key, subject-context construction, recovery
context, compaction-seed emission, and load-set projection. `LoadSetProjectionInput.activeExtensions` is unused
by `resolveLoadSetManifest`; removing it must preserve selected workflow, subject, context, and method-load behavior.

Remove `extensionReport` from the strict `CheckpointInterlockSurfaceSchema`, from
`composeCheckpointInterlockSurface`, and from its checkpoint consumer and fixtures. Preserve the complete
`machineEvidence` surface, exact-head authorization, and merge-admission behavior. No replacement report field,
nullable tombstone, or compatibility decoder is introduced.

Update remaining comments that claim the mechanism exists, including those in `manifest/apply.ts`,
`fs/walk-markdown.ts`, and `frontmatter/generic.ts`. Generic frontmatter parsing and filesystem traversal remain.

### D3 — Remove workflow firing while preserving independent rules

Remove extension declarations and steps throughout the packaged workflow corpus, its installed mirror, workflow
templates, and the canonical `arc-commit` skill's pre-commit extension step. Package source remains authoritative;
render `.template.md` counterparts with this repository's configuration and preserve Configurable overrides.

For PR and integration workflows, apply these exact preservation rules:

- In both `integrate-work-unit` and `run-errand`, remove `proposedChangeRequest` and the `pre-pr-open` action block.
  Preserve typed change-request resolution, reuse/reopen/create dispatch, PR binding, merge-lock resolution, and
  the immediate pre-create `--require-remote` validation: the remote branch must carry the exact creation head.
- In `integrate-work-unit`, remove the hook-only `openedChangeRequest` composition and the sentence asserting a
  shared hook/review invocation contract. Preserve binding to the resolver's open PR and typed Candidate/review
  results; those remain the review target authority.
- In `run-errand`, retain `openedChangeRequest = { repositoryRef, hostRef, headSha }`, its refresh on head
  movement, and its equality checks against the planning-grooming adapter target. These have review consumers
  after the hook is gone. Remove hook qualifications from the same sentences without weakening their rules.
- Preserve `integrate-work-unit`'s “No commit or push may occur after `ready`” and `run-errand`'s prohibition on
  review-authored commits or pushes after the final checkpoint. Remove the pre-merge invocation and rendered
  “Extension report” step; retain their integration interlocks and every independent review/merge requirement.
- Remove workflow-wide push-extension contracts and every reference instructing a caller to repeat one. Keep
  push authorization, release routing, review-fix disposition approval, and recovery rules.

Remove other extension-only skip wording, including task-completion extension skips, team-extension qualifiers
at spec review, active-extension orientation suppression, and recovery's extension-load instructions. Keep
method fire-point loading and all required workflow stops. Neither removal nor renumbering may silently broaden
an entry shortcut, resume route, or contributor permission.

Renumber or reletter successors when deleting these numbered sections:

- `session-init`'s post-context-load section;
- `session-recover`'s post-context-load section;
- `activate-work-unit`'s pre-activation section;
- `archive-work-unit`'s post-archive section;
- external-integration setup's notify step;
- `integrate-external-content`'s extension-adaptation substep.

Resolve every citation against the resulting workflow, rather than decrementing old numbers mechanically.
The citation sweep covers cross-file workflow-name plus `Step N` / `§ N` references, bare local step references,
companion documents, and source comments. Include `session-init.contributor.md`, `session-init/probe-envelope.md`,
the status type comment, `deactivate-work-unit`, and the session-operations/work-organization strategies.
Correct the already-stale archival-commit citation by its target meaning. Check in-file heading-slug links
against the new headings. Excluded historical and sibling planning documents are not rewritten.

### D4 — Narrow validation and audits to surviving content

Delete `validate-extension-points.ts` and `CHECK[extension-point-references]` in both hook copies. Narrow
`CHECK[frontmatter-schema]`, `CHECK[package-source-neutrality]`, and `validate-package-neutrality.ts` to methods;
remove extension classification/parsing in `validate-frontmatter.ts` while retaining its method and domain-rule
branches. `CHECK[domain-rules-frontmatter]` continues to invoke that validator.

In `audit-method-triggers.ts`, retain method declarations, graph validation, coverage, diagnostics, and the
`lint:arc:triggers` command. Remove extension enumeration, coverage, diagnostic/output branches, and
`auditPushExtensionCoverage`. Remove `extensions` from `WORKFLOW_ARC_FRONTMATTER_FIELDS` and the workflow parse
result; `parseWorkflowFrontmatter` must reject a leftover `arc.extensions` key as an unknown field. Preserve
`METHOD_ARC_FRONTMATTER_FIELDS` and all surviving method-schema behavior.

Remove the `system/extensions` requirement from both `verify-integrity.sh` copies and the corresponding integrity
workflow instructions. Remove extension-root inputs from table formatting and affected code/packaged-content
globs in `change-facts.ts`; preserve detection and gate selection for surviving methods and other sensitive
packaged content. Remove the deleted `handlers/extensions.ts` entry from `eslint-suppressions.json` through the
whole-project prune path. Do not add suppressions or change declared check deadlines to accommodate removal.

Remove the extension-only classes `extension-root` and `arc-extensions-key` and dependent routing entries from
the coupling audit's live manifest and routing ledger. Preserve unrelated classes and their consistency.
Declared check IDs and CI routing stay intact; no `.github/check-plumbing.yml` or CI change is required solely
because an internal hook branch and its script are removed.

### D5 — Remove installation membership; retain the existing update policy

Remove all twelve `system/extensions/*` paths from `init-recipe.json` and remove the eleven extension entries
from `CONFIGURABLE_FILES`. `resolveFileList` derives fresh-install membership from the recipe and conditional
arms; after removal no supported init configuration installs the directory or records its files.

Keep the updater unchanged. `buildChangePlan` classifies removals using each existing manifest entry;
`applyChangePlan` deletes removed Framework files and retains removed Configurable files in `keptForReview`.
Consequently, an installed project updating across this change keeps its eleven extension documents on disk
for review, loses the Framework README, and drops all twelve from the new manifest/pristine membership. Later
updates do not rediscover the retained documents. No runtime, scanner, or integrity check reads them afterward.

For this self-hosting repository, delete all twelve `.arc/system/extensions/*` files deliberately and remove
their keys from `.arc/system/.internal/manifest.json` alongside package/recipe changes. Preserve other manifest
entries and metadata. Do not run `arc update` against this repository; synchronize package and instance through
the documented manual edit/render flow. Regenerate any derived local pristine/manifest state needed for that
flow without introducing an installed-project migration.

### D6 — State the surviving customization and external-PM boundary

Adopter-facing guidance describes config, check declarations, method overrides, QUICK-REFERENCE tool commands,
and the project strategy/workflow/domain-rule content channels. Remove the extension row, “adds steps at a
workflow point” decision-tree route, reserved-name guidance, file format, activation/loading instructions,
directory references, and extension cross-references. Project workflows may run beside ARC workflows and use
methods; ARC supplies no supported mechanism to insert an additional step inside one of its workflows.

Keep the convention-inventory rows for P7's markdown task-list checkboxes and planning checkpoint review. Set
their Configurability Path to **None**, remove the **Extension** path definition, and add **None — the convention
has no supported customization path**. Removing the hook must not imply the convention itself disappeared.
Retain harness-native lifecycle-hook guidance, rephrased to distinguish it from the surviving ARC surfaces.

Remove all PM-facing hooks, including `post-task-completion`, `post-work-unit-activate`, and
`post-work-unit-archive`. External setup loses its notify step outright. Preserve `Origin` linkage and other
independent setup/capture instructions, but claim no supported tracker notification or synchronization route
through the retired mechanism. Adopter-facing content names no planned replacement or internal work-unit owner.

In the project-internal `strategy-pm-composition-evolution.md`, amend Principle 6, the Compatibility Ladder,
Interim Boundaries, and Known Tensions consistently. The interim boundary reads: “Preserve provider-neutral
lifecycle-event intent and contracts as design inputs; do not preserve inactive extension fire points or claim
a supported notification/synchronization mechanism until one is implemented.” The ladder continues to describe
distinct capability levels, without treating removed free-form extensions as current support. Provider authority,
typed integration, explicit failure, and standalone/composed independence remain unchanged.

Update the project-machinery inventory in `strategy-storage-evolution.md`, the surviving machinery description
in `strategy-procedure-evolution.md`, `PROJECT-PRD.md`, `TECHNICAL-OVERVIEW.md`, package-project sync membership/counts,
and root `README.md`. Counts are re-derived from `resolveFileList`, `classifyFile`, and the installed manifest,
not adjusted from stale prose estimates. Preserve unrelated generic extensibility and platform-hook meanings.

### D7 — Preserve architectural history and all eleven event contracts

Create the next available numbered ADR for the removal, following the existing ADR structure. It records the
full object ID of the revision immediately preceding implementation removal and the recoverable source loci.
That revision is a retrieval anchor, not a live runtime dependency or promise of replacement compatibility.

Update only the applicable status metadata of four accepted ADRs, retaining existing supersession annotations:

- ADR-003: Part 2 and the extension half of Part 4;
- ADR-008: the extension-point Core↔PM interface;
- ADR-013: the extension half of per-file layout and declaration/loading;
- ADR-009: Part 1's extension relevance bullet and Part 3's ADR-008 disposition that preserves extension points.

Use the existing partial-supersession status shape and the actual new ADR number. Other accepted or Proposed
ADR bodies and statuses remain untouched, including Proposed ADR-020. Their historical assertions are not
current supported behavior. The new ADR inventories every event below and explains that the inventory records
retired contracts, without reserving callable names or committing the future executor to the old format.

All events inherited an authored-order action sequence, halt before later actions on failure, and an actionable
failure handed back to the calling workflow. Continuing past a failed action required explicit developer
direction. Added actions augmented core behavior rather than replacing it. Preserve these contract inputs and
the naming rule `{pre|post}-{lifecycle-event}`: vocabulary describes the actual boundary and firing frequency
matches the name's promise.

| Event                          | Retired placement / contract input                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `post-context-load`            | After standard session context loading, before orientation; additional project context.       |
| `pre-spec-finalization-review` | After spec self-review, before approval/finalization; optional team ceremony.                 |
| `post-task-completion`         | After task mark/description update, before verification/report; adds notifications.           |
| `pre-activation`               | After activation prerequisites, before state flip/branch rename; once per activation.         |
| `post-work-unit-activate`      | After core activation, absorption and ROADMAP work; adds project actions.                     |
| `pre-commit-review`            | After staging, before commit creation; agent review distinct from mechanical Git hooks.       |
| `pre-push-review`              | Before each managed push; high frequency requires lightweight actions.                        |
| `pre-pr-open`                  | After push, immediately before creation; retry-safe; skipped on open-request reuse.           |
| `post-pr-open`                 | After creating/resolving an open request, before review; idempotent across re-entry.          |
| `pre-merge`                    | Once per ready head, before merge authorization; read-only, idempotent or retry-safe actions. |
| `post-work-unit-archive`       | After core archival/cohort closeout/ROADMAP work, before the archival commit.                 |

Preserve the two opaque payload shapes and their authority boundary:

```text
pre-pr-open: proposedChangeRequest = { repositoryRef, baseRef, headRef, headSha }
post-pr-open: openedChangeRequest = { repositoryRef, hostRef, headSha }
```

Callers supply coordinates; host adapters validate/convert them. Actions infer neither branch/work-unit state
nor one-work-unit/one-change-request cardinality. Open-request actions derive current host state from the
supplied reference. Final-head actions may repeat without unsafe mutation, and no commit or push occurs after
readiness. `pre-push-review`'s file promised wrapper-wide invocation; the removed implementation's enforcement
was the workflow audit, not a CLI hook executor. Record that distinction rather than preserving a false coverage
claim in the inventory.

### D8 — Sweep the complete live surface and preserve mixed-test coverage

The file inventory below guides grounding; it is not a closed site list. Derive actual sites through both the
mechanism-reference sweep and the independent step-citation sweep. Include package content, this repository's
live instance, importers, registries, fixtures, comments, and scripts beyond the initially named files.

- **Content:** customization/session-operations/workflow-authoring/team-coordination/planning-module/file-
  classification strategies; index firing lines; rules and briefs; self-review/methods README; project-strategy
  README; internal-scripts README; initial/external setup; external-content integration; integrity workflow;
  workflow template; session probe-envelope reference; canonical `arc-commit` and `arc-task-review` skills.
- **Runtime:** CLI routing/input registrations/help; status run/schema/types/format; status/session/recovery
  handlers; derived-locus probe/reader/subject context; recovery context; compaction seed; load-set projection;
  checkpoint interlock composition/consumer; extension test-name selection in `local-vitest-runner.ts`.
- **Install/gates:** recipe/classification; self-hosted manifest; table inputs; `CODE_SURFACE_GLOBS` and
  `PACKAGED_CONTENT_SENSITIVE_GLOBS`; validators/audit; both hook and integrity-script copies; suppression
  ledger; live coupling-audit configuration.
- **Internal reference:** the new ADR/four status lines and the project documents listed in D6.
- **Verification:** envelope fixtures and probe stubs, validator/audit suites, install/update/change-facts suites,
  checkpoint tests, workflow contract tests, and relevant helpers. Regenerate fixtures rather than keeping the
  retired slot to satisfy old examples.

Delete the six mechanism-only test files: `integration/extensions.test.ts`,
`unit/extensions-format.test.ts`, `unit/extensions/{orphan-detector,point-scanner}.test.ts`,
`unit/frontmatter/extension.test.ts`, and `unit/scripts/validate-extension-points.test.ts`.
`integration/pr-open-extensions.test.ts` is mixed: preserve its PR resolution, ordering, exact-head, reuse,
planning-grooming, and review-contract assertions; remove hook-only assertions and rename the surviving suite
and its runner references for its actual PR-lifecycle subject. Update the other mixed suites rather than
deleting coverage of surviving behavior.

Preserve meaningful regression checks for unknown `arc.extensions` frontmatter; absent command/schema/envelope
fields; fresh installation without extension files; update retention using old manifest classifications; and
the independent PR/ready-head invariants in D3. Negative test assertions may name the retired mechanism solely
to prove its absence. Legacy-update inputs and assertions of retained inert files are also permitted within the
explicit test-only allowance below.

## Alternatives & Rationale

- **Keep the three PM hooks.** Rejected: keeping inactive hooks preserves no working integration and retains
  their probe, parser, validation, and workflow cost. The missing notification seam is accepted explicitly.
- **Wait for a replacement.** Rejected: it retains present instruction/audit costs and makes the redesign inherit
  a format it should choose independently. The retirement requires no unshipped prerequisite.
- **Remove firing, keep storage.** Rejected: retained switches and `.actions` files would imply supported behavior
  that never executes, while prejudging the replacement's configuration and action representation.
- **Keep the scanner for method validation.** Rejected: `EXTENSION_POINT_PATTERN` recognizes only the old
  extension-marker grammar, and its validator resolves names against extension files. A different consumer must
  settle its own grammar; the pre-removal revision preserves recovery of useful code.
- **Rewrite ADR-003's Decision.** Rejected: accepted decisions require supersession. A new ADR preserves the
  reversal and its costs while the old bodies retain their point-in-time meaning.
- **Delete installed projects' Configurable residue.** Rejected: it adds migration machinery contrary to the
  pre-release posture and overrides the updater's explicit retention of potentially customized files.

## Cross-cutting Considerations

**Authority and security.** Existing check deadlines, review obligations, user approval gates, exact-head PR
binding, and final merge authorization survive. Hook deletion is not authority to bypass any of them. No new
execution path, credential handling, external write, or provider adapter is added.

**Performance and maintenance.** Remove extension-directory reads, active-name threading, workflow marker
scans, empty report fields, and conditional instructions. No replacement cache, persistence, or coordination
mechanism is warranted. Method validation and ordinary project checks remain.

**External PM and customization.** There is temporarily no supported insertion or tracker-notification seam
through lifecycle extensions. `Origin` remains linkage, and check declarations/method overrides/content channels
retain their supported roles. No mutable PM authority or projected tracker state is introduced. Failure handling
for new external calls is inapplicable because this change makes none.

**Knowledge and procedure.** Remove operation checks that currently live in agent-interpreted markup without
inventing a new markup language. Independent constraints stay at their existing operations. The event inventory
is historical rationale in the ADR, not always-loaded guidance or a hidden executable contract. Typed runtime
schemas remain authoritative for surviving outputs.

**Compatibility and rollout.** CLI/schema removals are intentional pre-release changes. Existing update
retention is accepted and tested; retained files become unread inert residue. In this checkout, package and
instance deletions and manifest edits are one deliberate synchronization change. No storage backend, work-unit
identity/history policy, or new tracked operational state is introduced.

**Implementation ordering.** Remove declarations no later than parser rejection of `arc.extensions`; delete
the marker validator and its hook invocation in the same commit in both copies; remove the push audit with or
before its markers; remove session dispatch with or before the probe it reads. Prune the suppression only once
its source disappears. Temporary intermediate states cannot be committed through broken required gates.

**Testing.** Use source/schema tests for removed contracts and preserved parsing, public CLI/install/update
tests for observable absence and inert residue, and workflow contract tests for the independent D3 invariants.
Run the existing declared checks appropriate to each implementation increment and all required completion
gates. Passing a text search does not replace behavioral coverage of surviving consumers.

## Success Criteria

1. The complete live reference sweep has no extension-mechanism reference outside the exclusions and closed
   sense allowlist below. No extension file, reserved marker, declaration, activation switch, invocation,
   command, scanner, validator, or positive fixture survives as supported machinery.
2. Full status, session-init, and recovery JSON omit `extensions`; handoff, recovery context, derived locus,
   load-set projection, and compaction seed consume no active-extension input. Schema discovery omits
   `extensions-session-init`; `arc extensions` is unavailable; the checkpoint interlock surface omits
   `extensionReport` while retaining the complete `machineEvidence` contract.
3. Fresh init in every supported recipe arm installs no `system/extensions/` directory or manifest entry.
   Updating an old manifest retains Configurable files for review, deletes its Framework README, drops their
   manifest/pristine membership, and continues successfully without reading the retained files.
4. `parseWorkflowFrontmatter` rejects a leftover `arc.extensions`; valid method declarations and method graph/
   coverage checks still pass. Method neutrality and domain-rule frontmatter validation remain functional.
   Both pre-commit hooks run without the removed extension check or any dangling script invocation.
5. PR creation still requires the exact remote head; open-PR reuse and review bind the current exact target;
   the Errand planning-grooming adapter still matches `openedChangeRequest`; final readiness still forbids the
   mutations named in D3. Surviving mixed-suite assertions cover these properties.
6. The supported customization inventory and external setup implement D6, including **None** for the two
   retained conventions and no replacement promise. The new ADR contains all eleven events, naming/frequency,
   both payloads, per-event constraints, and a retrievable full pre-removal revision; the four partial-status
   updates preserve all existing annotations and bodies.
7. Every affected step/section citation and in-file heading link resolves to its intended post-removal target.
   Package-source and installed Framework content agree after rendering; the self-hosted manifest has no deleted
   file keys; inventory counts match recipe-derived membership.
8. Every required declared completion gate passes, including Markdown/source/test type checks, applicable test
   tiers, build, and `lint:arc:triggers` with method coverage intact. No new suppression or gate bypass is used.

### Reference-sweep corpus and closed allowlist

Search case-insensitively for `extension` across `packages/arc-framework/` and `.arc/`. Also search the nine
distinctive names `post-context-load`, `pre-spec-finalization-review`, `post-task-completion`,
`post-work-unit-activate`, `pre-commit-review`, `pre-push-review`, `pre-pr-open`, `post-pr-open`, and
`post-work-unit-archive`; require no mechanism references. Search `pre-merge` and `pre-activation` in their
mechanism forms: `#name`, a backticked hook name, or a name qualified as an extension. Check `activeExtensions`,
`arc extensions`, `arc.extensions`, `extensionReport`, `scanExtensionPoints`, and `auditPushExtensionCoverage`
explicitly, and check `hook` by sense in `integrate-work-unit` and `run-errand`.

Exclude generated build/dependency artifacts, `.arc/completed/**`, `.arc/user/**`, `.arc/backlog/**`, this work
unit's own artifacts, historical ADR documents, supplemental historical analyses, and attestation records.
ADR metadata and the new event inventory are verified separately by criterion 6. Public-site files are outside
the corpus and outside scope.

Within that corpus, the allowed senses are limited to:

- filename suffixes and executable suffix handling: `hooks.skip_extensions`, `extname`, file-extension variables/
  prose/tests, and `PATHEXT` parsing in the CodeRabbit executable resolver;
- Markdown parser/serializer augmentation: `micromark-extension-*`, `mdastExtensions`, GFM parser `extensions`
  arrays, and serialization extensions;
- generic kernel/validation/session-envelope registry augmentation and its isolated `extension` or
  `fixture-extension` test schemas, unrelated to lifecycle hook activation;
- ordinary typed-interface or injected-capability augmentation, including `CurrentWuReconcileHost`,
  `TeardownContext.stampHusk`, and `GitCommonStateTransactionPublisher`, that extends an executor, marker, or publisher
  contract without lifecycle-hook activation or workflow fire-point dispatch;
- mechanically unchanged Candidate selection/endpoint extension handled by `projectMechanicalReviewApplicabilityCarry`,
  including commits that record the selection; this describes coordinate/contribution applicability, not event execution;
- hosted-review wait-duration extension reported by `awaitHostedReview` as `inspect-or-extend`, including its
  `continueAfterAttention` continuation and pending-request retention by `recordHostedAwaitAttempt`; this concerns
  waiting time, not lifecycle-hook execution;
- external CLI tool add-ons, including the `gh stack` capability checked by `GhDeliveryProviderRefreshPort.prepare`;
  these are tool capabilities independent of the retired ARC command tree and lifecycle-hook dispatch;
- ordinary optional data-schema augmentation, including the independently valid optional fields retained by
  `normalizeLocalSyncState`; this does not admit retired activation, active-name, probe, or report fields;
- domain-rule augmentation of project standards through `DEV-RULES.{DOMAIN}.md`, audited by `audit` in
  `audit-domain-rules.ts`; this adds guidance, not lifecycle actions;
- ordinary feature/API augmentation described in test examples, including `amendmentPlacementTaskList` and the
  fixture inputs read by `copiedRealNotesRepository`; only capability/schema growth is admitted, not current
  execution, activation, or advertised support of the retired lifecycle mechanism;
- PM-mode module composition, including “arc-in-git extensions” in `strategy-work-planning.md`: `resolveFileList`
  selects unconditional and conditional membership from `init-recipe.json`. This permits Core plus optional
  planning-module content, not lifecycle-hook activation, action execution, or workflow-step insertion;
- the session-operations probe-pattern terms “Extension contract” and “structural extension”, naming generic
  envelope composition;
- the unchanged legacy quality-hook extraction in `bootstrap-extraction.ts` and its associated tests/fixtures,
  specifically `sources.postTask` / `sources.postUnit` and the two retired quality-hook paths;
- negative assertions under `__tests__/**` that name the retired mechanism solely to prove absence or rejection;
- bounded legacy-update inputs and inert-residue assertions under `__tests__/**`, including their test helpers and
  fixtures: old extension paths, prior manifest classifications, and prior file contents needed to prove unchanged
  Configurable-file retention, README deletion, removed managed membership, or unmanaged-residue non-interference.
  These may assert retained content positively; they must not exercise or advertise current hook execution.

No entire live directory, fixture exercising current hook execution, or generic “historical wording” category is
allowlisted. Apply the same corpus exclusions and sense allowances to every term search above.
An unmatched live occurrence is resolved by meaning against these cases; a genuine additional allowed sense
requires an explicit spec correction at review, rather than silent broadening during implementation.

## Open Questions

None requiring design before implementation. Exact edit sites and the next available ADR number are local
implementation particulars; D5 settles deletion mechanics and the sweep above fixes the acceptance boundary.

## Amendments

**Amended 2026-10-13 — A1:** The closed non-mechanism allowlist includes ordinary typed-interface/injected-capability
augmentation and mechanically unchanged Candidate selection/endpoint extension. Task-generation review identified
existing unrelated source meanings outside the enumerated cases; their preservation is now explicit. The live corpus,
retirement obligations, and prohibition on current hook execution remain unchanged.

**Amended 2026-10-13 — A2:** The closed non-mechanism allowlist also includes hosted-review wait duration,
external CLI add-ons, optional data-schema fields, domain-rule additions, and ordinary feature/API growth in test
examples. The first fix check and follow-up source sweep identified these additional unrelated meanings. Their
preservation is explicit without admitting current retired-hook execution or blanket directory/history exemptions.

**Amended 2026-10-13 — A3:** The closed non-mechanism allowlist includes PM-mode module composition: Core planning
artifacts plus optional planning-module content selected by recipe conditions. The second fix check identified
this surviving meaning in work-planning guidance. It admits no lifecycle-hook activation, action execution,
workflow-step insertion, or blanket exemption.

**Amended 2026-10-13 — A4:** The historical-analysis exclusion permits one approved link-definition correction in
`analysis-workflow-clarity-audit.md`: its deleted `post-context-load.md` target points to the same installed source at
the recorded retrieval revision. The required live link audit exposed the dangling reference; the analysis text and
all other historical bodies remain unchanged.

---
