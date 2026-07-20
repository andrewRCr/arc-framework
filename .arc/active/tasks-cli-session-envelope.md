# Task List: CLI Session Envelope

- **Design:** `spec-cli-session-envelope.md`

---

## **Phase 1:** Wire-compatibility baselines

_Purpose:_ Lock the exact session-init and recovery-audit JSON representations before any production assembly,
schema, or Result-composition change can alter the protocol accidentally.

_Design decisions:_ Characterization precedes every production edit. Normalization may replace machine-specific
values, but it must preserve key order, nesting, omission-versus-`null`, array order, and probe discriminants.

### `[x]` **1.1 Characterize the complete session-init envelope representation**

- _Goal:_ A compact normalized golden matrix detects any byte-visible change across the session-init envelope's
  mutually exclusive assembly arms before schema or Result migration work begins.
    - `[x]` **1.1.a Build deterministic assembly-arm fixtures and one normalizer**
        - Added a framework-free fixture helper and focused built-CLI suite covering primary Orient, linked active
          resume, linked current-husk, branch-gone, and identity-missing states with insertion-order-preserving
          normalization of paths, object ids, machine ids, and time values.

    - `[x]` **1.1.b Lock the normalized successful assembly-arm bytes**
        - Checked in compact byte goldens for all four successful arms after first proving stdout is exactly one
          parsed JSON value plus a trailing newline; the matrix covers every conditional insertion region.

    - `[x]` **1.1.c Lock probe-error and omission variants**
        - Locked the real identity-missing error branch and asserted that every identity-scoped slot stays omitted
          instead of changing to `null` or an empty probe.

- _Outcome:_ Five normalized session-init goldens now lock the complete top-level representation, conditional key
  positions, ordered nested values, and omission semantics before production assembly changes begin.

### `[x]` **1.2 Characterize the complete recovery-audit envelope representation**

- _Goal:_ Recovery audit has an exact normalized baseline for its report, embedded recover envelope, comparisons,
  stop reasons, and ready/not-ready verdicts.
    - `[x]` **1.2.a Build deterministic ready and stopped recovery-audit fixtures**
        - Reused the linked active fixture to emit complete ready and post-seed `dirty-path-drift` reports through
          `runArcNoTty()`, with targeted missing- and invalid-seed assertions beside the full report captures.

    - `[x]` **1.2.b Lock the exact recovery-audit report bytes**
        - Checked in exact normalized goldens for both complete reports, including seed summaries, embedded recover
          envelopes, load-set and cursor comparisons, stop reasons, and verdict field order.

- _Outcome:_ Recovery audit now shares the session-init transport and normalization proof, so both envelope families
  have byte-stable characterize-first baselines against the same deterministic repository vocabulary.

## **Phase 2:** Shared family schemas and records

_Purpose:_ Establish the complete, registered schema authority for the envelope family’s own algebra and records
before top-level envelopes or home-module advisories compose them.

_Design decisions:_ The probe algebra is a flat combinator; family records validate fully; every registered schema
uses a stable identity, version 1, and `strict-current` posture while preserving hand-rolled version enforcement
where the spec retains it. Producer schemas reject owned-field leakage, while the compaction-seed reader derives
unknown-stripping variants from the same field shapes to retain its established compatibility behavior.

### `[x]` **2.1 Define the schema-backed probe algebra**

- _Goal:_ Every fallible envelope slot has one reusable runtime/type authority while existing callers retain the
  `Probe<Value>` generic surface and exact `{ kind, message }` wire branches.
    - `[x]` **2.1.a Define the error and generic probe schemas**
        - Added strict `ProbeErrorSchema` and generic `probe(valueSchema)` authorities beside the status contracts;
          `ProbeError` and `Probe<Value>` now derive from them while every existing generic consumer remains valid.
          Focused tests cover pass-through success, both closed error kinds, and malformed or mixed rejection.

- _Outcome:_ Every fallible envelope slot can now compose one flat runtime/type authority without changing the wire
  algebra or pre-empting Phase 6's internal Result adaptation.

### `[x]` **2.2 Make load-set and task-cursor records schema-authoritative**

- _Goal:_ Load-set manifests, read modes, task cursors, and file-backed cursor results have one full runtime/type
  authority shared by status, recovery, and compaction seed composition.
    - `[x]` **2.2.a Migrate load-set records to Zod authority**
        - Added strict and recursively stripping schemas for manifests, entries, and all read-mode branches, deriving
          the public contracts through `z.infer`. Projection and compaction-seed validation now share one canonical
          repository-relative/POSIX/Windows-drive/UNC path refinement, with ordering and reader stripping locked by
          focused tests.

    - `[x]` **2.2.b Migrate task-cursor records to Zod authority**
        - Added strict schemas for cursor anchors, durable cursors, malformed details, all result branches, and the
          file-backed `missing` result, deriving the boundary types while leaving analysis-only tallies and regions
          handwritten. The compaction reader now reuses recursively stripping cursor shapes; parser and repository
          containment behavior remain unchanged under the focused matrix.

    - `[x]` **2.2.c Establish the family registry and register shared records**
        - Added a fresh composed session-envelope registry over the kernel vocabulary and registered the load-set,
          cursor, and file-cursor roots at version 1 with `strict-current` posture. Focused tests prove identity,
          immutable metadata, instance isolation, and inherited duplicate protection without build publication.

- _Outcome:_ Load-set and cursor records now share strict producer, compatibility-reader, inferred TypeScript, and
  stable discovery authorities while preserving projection, parsing, and file-containment behavior.

### `[x]` **2.3 Replace the compaction-seed validator with its registered schema**

- _Goal:_ The persisted compaction seed parses through one strict-current Zod authority while retaining exact
  canonical serialization and structured recovery-stop classification.
    - `[x]` **2.3.a Express the full compaction-seed record as a schema**
        - Replaced the hand-written guard graph with strict producer and recursively stripping persisted-reader
          schemas composed from shared load-set and cursor authorities. Public seed types now derive through
          `z.infer`; canonical field order and POSIX/Windows/UNC plus unsafe-path behavior remain locked.

    - `[x]` **2.3.b Preserve parse-result and version-mismatch semantics**
        - Preserved distinct malformed, invalid, and older/newer version failures with the explicit version guard
          preceding `safeParse`; invalid-schema messages now carry normalized actionable field paths without leaking
          Zod issue objects into the caller contract.

    - `[x]` **2.3.c Register the compaction seed without changing publication**
        - Registered the strict seed root at version 1 with `strict-current` posture in the composed family registry,
          leaving hand-enforced version checks and kernel bundle publication unchanged.

- _Outcome:_ Compaction-seed producers now fail strict leakage while persisted readers retain recursive compatibility
  stripping, stable serialization, explicit version posture, and structured recovery-stop classification.

### `[x]` **2.4 Make recovery-audit records and verdicts schema-authoritative**

- _Goal:_ Recovery audit’s stop reasons, comparisons, locus, dirty-file accounting, cursor result, and verdict are
  fully validated records that the handler report can compose directly.
    - `[x]` **2.4.a Migrate load-set audit comparisons in their home module**
        - Added full strict schemas for membership, read-mode changes, path drift, aggregate diffs, and verdicts,
          deriving exported records through `z.infer` without changing diff assembly or field order. Schema tests
          now cover malformed comparisons and `status`/`diverged` consistency beside the behavioral matrix.

    - `[x]` **2.4.b Define schemas for the recovery-audit record graph**
        - Replaced hand-written wire outputs with strict schemas for stop reasons, both explained-drift branches,
          locus, dirty accounting, cursor comparison, and final verdict, composing the load-set authority while
          leaving inputs and injected analysis contracts handwritten. Tests validate ready, stopped, and explained
          outputs plus invalid status/kind and nested-comparison rejection without changing assembly order.

    - `[x]` **2.4.c Register recovery records and retain audit behavior**
        - Registered load-set and recovery verdict roots at version 1 with `strict-current` posture in the family
          registry. Schema assertions sit beside the unchanged audit behavior matrix, ready for later report
          composition without wiring either root into bundle publication.

- _Outcome:_ Recovery audit's complete output graph now has home-owned runtime/type authorities and stable registry
  identities while deterministic auditing, explained-progression classification, and wire field order stay intact.

## **Phase 3:** Contained advisory schema authority

_Purpose:_ Move the contained, low-reach session-init advisories to full home-module Zod authority so their runtime
and TypeScript contracts cannot drift.

_Design decisions:_ Each home module exports its strict schema, derives the public value type through `z.infer`,
and retains existing behavior. `lib/session-envelope/registry.ts` centrally registers those roots after all ten
land; this phase does not absorb any tail-routed shared or deep type web.

### `[x]` **3.1 Migrate inbox, reminder, and compaction advisories to home-module schemas**

- _Goal:_ Identity-scoped routing, stale-reminder, and notes-compaction slots expose fully validated home-module
  contracts without changing their computations or session-init gating.

    - `[x]` **3.1.a Migrate `InboxStateResult`**
        - Added a strict schema-backed result with non-negative integer counts and count/flag consistency while
          retaining the exact producer output.

    - `[x]` **3.1.b Migrate `ErrandStalenessSweepResult`**
        - Added strict stale-report and sweep schemas backed by one shared UTC-midnight compatibility parser; arbitrary
          non-empty inbox titles and existing impossible-date normalization remain accepted.

    - `[x]` **3.1.c Migrate `NotesCompactionSessionAdvisoryResult`**
        - Added strict local session-view authority for history, suggestion consistency, and nudge fields without
          changing the shared advisory or nudge contracts and their other consumers.

- _Outcome:_ All three session advisories now derive their public output types from strict schemas while preserving
  producer behavior, including the stale-errand date compatibility boundary and notes-history calculation.

### `[x]` **3.2 Migrate materialization and cleanup advisories to home-module schemas**

- _Goal:_ Materializable-WU, orphan-branch, and retired-subdir slots have full schema/type authority while retaining
  their existing oracle, git, and reconciliation behavior.

    - `[x]` **3.2.a Migrate `MaterializableWorkUnitsResult`**
        - Added strict candidate/result schemas with `SlugSchema` work-unit identities, non-empty branch names, and
          optional warning diagnostics while preserving oracle selection output.

    - `[x]` **3.2.b Migrate `OrphanBranchSweepResult`**
        - Added strict report/result schemas covering branch and merge verdicts, with nullable shipped identities
          validated through `SlugSchema`; executor and set-valued inputs remain operational TypeScript contracts.

    - `[x]` **3.2.c Migrate `RetiredSubdirDetectionResult`**
        - Added strict candidate-array and result schemas with branded work-unit slugs while retaining the existing
          disk/notes reconciliation algorithm and its empty fast path.

- _Outcome:_ Materialization and cleanup advisories now expose schema-derived work-unit identities end to end;
  consumer fixtures construct those branded values through the owning schemas rather than raw string assertions.

### `[ ]` **3.3 Migrate coordination, cascade, and base-sync advisories to home-module schemas**

- _Goal:_ Remaining contained advisory outputs use schema-derived types across coordination, plate balance,
  branch-gone recovery, and base synchronization without pulling their operational inputs into the envelope model.
- _Context:_ Implements the contained-advisory depth decision; Success Criteria 3 and 8.

    - `[ ]` **3.3.a Migrate `PartialPushMarkerSurfaceResult`**
        - Define and export marker/result schemas in `lib/session-init/partial-push-marker-surface.ts`; derive the
          output types while leaving ancestry resolvers and set-valued selection inputs TypeScript-owned.
        - Build `test-first` around non-empty legacy-compatible machine identities, 40/64-character git object ids,
          parseable ISO timestamps, malformed rows, and exact output from both pure selection and the git-backed
          wrapper.

    - `[ ]` **3.3.b Migrate `ClassComposition`**
        - Define and export the non-negative integer tally schema in `lib/status/class-composition.ts`; derive
          `ClassComposition` and preserve field ordering from `classComposition()`.
        - Add `__tests__/unit/status/class-composition.test.ts` for resolved-class tallies, all-zero composition,
          runtime field order, and malformed numeric values; retain the `[TBD]` exclusion assertion in
          `ready-mine.test.ts` as consumer-behavior coverage.

    - `[ ]` **3.3.c Migrate `CascadeResolution`**
        - Define and export full candidate/action/resolution schemas in `lib/session-init/branch-gone-cascade.ts`;
          derive the public wire value types while retaining cleanup-decision inputs separately.
        - Build `test-first` around all three resolution kinds, candidate optional-path presence, closed action
          values, and cross-kind field rejection. Require at least two candidates for `surface`; an absent
          `worktreePath` is valid only with `switch`, while `removable` and `external` require a worktree path.

    - `[ ]` **3.3.d Migrate `BaseBranchSyncStatusResult`**
        - Define and export checkout-locus/result schemas in `lib/git/base-branch-sync.ts`; derive its public value
          types without changing the git executor or recommendation layer.
        - Pin the result to the seven states this producer can emit (`clean`, `remote-ahead`, `local-ahead`,
          `diverged`, `skipped`, `no-remote`, and `remote-unavailable`) rather than inheriting the wider
          `WorktreeSyncState` domain unchanged.
        - Build `test-first` around every emitted state and checkout kind, state-consistent non-negative integer
          distances, and a `timeout`/`error` failure reason present only for `remote-unavailable`; reject invalid
          cross-kind fields in the existing base-branch-sync unit suite.

    - `[ ]` **3.3.e Register the contained advisory schemas**
        - Extend `createSessionEnvelopeRegistry()` with the ten stable version-1 `strict-current` identities fixed
          in the spec, importing each schema from its home module without adding module-level registration effects.
        - Extend the focused registry-composition test with the complete advisory metadata matrix while retaining
          fresh-instance isolation, duplicate protection, and the no-publication boundary.

## **Phase 4:** Thin routing views and composed envelopes

_Purpose:_ Compose the full family contract from schema-authoritative records and deliberately thin pass-through
schemas for shared infrastructure, then register each top-level envelope under a stable identity.

_Design decisions:_ Thin schemas assert only mapped workflow-routing fields and pass every other valid field
through unchanged. Their exact projection lives in `notes-cli-session-envelope.md` § Thin validation field map.
The complete envelope adds observable cross-slot presence refinements without reconstructing hidden probe state;
that policy lives in § Top-level slot presence contract. Complete wire roots reject undeclared top-level keys even
though their nested thin views pass unowned fields through. Only full authoritative records and complete top-level
contracts register; registration does not expand the shipped schema bundle.

### `[ ]` **4.1 Define thin routing schemas for shared git and deep-nested slots**

- _Goal:_ Shared infrastructure and deep advisory webs reject corrupted workflow-routing fields while their
  hand-written types and unowned nested payloads remain authoritative and untransformed.
- _Context:_ Implements the thin shared/deep validation decision; Success Criteria 4 and 8. The enumerated routed
  inventory lives in `notes-cli-session-envelope.md` § Tail-routed value-type inventory.
- **Additional Context:** `notes-cli-session-envelope.md` §§ Tail-routed value-type inventory; Thin validation field
  map.

    - `[ ]` **4.1.a Cover shared git primitives with thin schemas**
        - Add pass-through views in `commands/status/schema.ts` for
          `DirtyStateResult`, `WorktreeSyncStatusResult`, `BaseDistanceStatusResult`, and `WorktreeRosterResult`.
          Pin exactly the shared-git fields in the thin validation map; the roster view validates only its object
          root because none of its nested fields drives agent dispatch.
        - Build `test-first` (one behavior at a time):
            - reject invalid `state` and base-drift `verdict` values used for workflow dispatch;
            - reject a malformed nullable `supersession.superseded` flag while accepting representative commit arrays,
              nested evidence, overlap, and roster fields without describing their full webs;
            - return unowned fields unchanged rather than stripping or normalizing them.

    - `[ ]` **4.1.b Cover deep session advisories with thin schemas**
        - Add pass-through schemas for `CurrentHuskAdvisory`, `StaleWorktreeSweepResult`, `WorkUnitStateResult`, and
          `ErrandStateResult`, pinning the mapped subject/stamp/report/decision kinds, classifications, resumability,
          work-unit `behindBase` qualifier, errand materialization candidate identity/branch, and nudge gates consumed
          by the session workflow.
        - Build `test-first` around each mapped routing defect and representative deep payloads carrying extra
          legitimate nested fields.

    - `[ ]` **4.1.c Prove the deliberate runtime-subset contract**
        - Add focused tests showing thin schemas reject their mapped routing fields but do not become a second mirror
          of the hand-written types.
        - Keep all full schema-authority work for this routed set outside the diff and leave the inventory intact for
          `cli-substrate-complete-migration`.

### `[ ]` **4.2 Define thin routing schemas for command-owned session slots**

- _Goal:_ Command-owned and deeply shared session slots validate the routing fields agents branch on without moving
  their broader record authority into the envelope module.
- _Context:_ Implements the thin command-owned validation decision; Success Criteria 4 and 8.
- **Additional Context:** `notes-cli-session-envelope.md` § Thin validation field map.

    - `[ ]` **4.2.a Cover extension, config, active, and domain-rule session values**
        - Compose pass-through schemas for `ExtensionsSessionInitResult`, `ConfigSessionInitResult`,
          `ActiveSessionInitResult`, and `DomainRulesSessionInitResult` from their current home contracts, pinning
          exactly the modes, active routing values, and twelve config policy domains in the thin validation map.
        - Build `test-first` around every mapped invalid policy/resolution/stage value while allowing unowned fields
          to pass unchanged.

    - `[ ]` **4.2.b Cover the user session-init value**
        - Define a thin pass-through schema for `UserSessionInitStatusResult` and its enriched session view, pinning
          the mapped state/ref/content/coherence/freshness/drift/qualifier values and optional boolean `loadNeeded`
          consumed during sync and context load.
        - Reject malformed `loadNeeded` values and prove representative notes-drift and sync-detail payloads survive
          validation unperturbed.

    - `[ ]` **4.2.c Cover enriched recommendation values**
        - Compose the closed `recommendedAction` schema into session-init worktree, user, base-distance,
          base-branch-sync, and retired-subdir values while retaining precomposed text verbatim.
        - Reject corrupted actions deterministically without attempting to infer a replacement from neighboring
          state.

    - `[ ]` **4.2.d Cover worktree identity and release routing**
        - Pin the `WorktreeIdentity.kind` view used by session and recovery worktree slots and all three
          `ReleaseRoutingValue` routes without taking authority for their broader handwritten source types.
        - Build `test-first` around `primary` / `linked`, `wrapper` / `raw`, malformed kinds/routes, and unchanged
          pass-through rationale/path fields.

### `[ ]` **4.3 Compose and register the session-init envelope schema**

- _Goal:_ One registered schema validates the complete bare session-init object, all required and optional probe
  slots, and bare scalar slots without changing payload bytes or presence semantics.
- _Context:_ Implements complete family ownership, flat probe composition, stable registration, and Success
  Criteria 2, 4, and 8.
- **Additional Context:** `notes-cli-session-envelope.md` §§ Thin validation field map; Top-level slot presence
  contract.

    - `[ ]` **4.3.a Compose the complete top-level object**
        - Define a strict `SessionInitProbeResultSchema` in `commands/status/schema.ts`, composing full
          family/contained schemas and thin shared/command views through `probe()`.
        - Add full `StatusIdentitySchema` and `CompactionSeedWriteStatusSchema` authorities beside the envelope,
          derive their public types via `z.infer`, and compose the optional seed-write union as a non-probe slot.
        - Build `test-first` (one behavior at a time):
            - require `mode`, `identity`, `user`, `worktree`, `baseDistance`, `baseBranchSync`, `dirty`, `extensions`,
              `config`, `active`, `domainRules`, `releaseRouting`, `loadSet`, and `recommendedCombinedPrompt`;
            - preserve valid optional-slot omission and explicit nullable scalar fields exactly;
            - accept success/error probes and reject mixed or malformed top-level branches;
            - reject an undeclared top-level key rather than relying on Zod's default stripping behavior, because
              the producer emits the original object rather than the parsed copy.
        - Add a one-way compile-time assertion that `SessionInitProbeResult` is assignable to the schema input; do
          not infer the full producer type from deliberately partial thin views.

    - `[ ]` **4.3.b Enforce the observable conditional-slot presence contract**
        - Add top-level cross-field refinements for every policy row in
          `notes-cli-session-envelope.md` § Top-level slot presence contract. Use two-way presence only when the
          envelope exposes the complete deterministic gate; use one-way rejection when advisory degradation or a
          hidden helper makes omission valid.
        - Keep cleanup-roster success, worktree identity hidden behind a failed probe, and the
          `--write-compaction-seed` invocation flag outside schema inference. Validate `compactionSeedWrite` fully
          when present without requiring it.
        - Build `test-first` from the Phase 1 arm fixtures: accept each valid arm, then insert or omit one conditional
          slot per policy row and reject only combinations the current producer cannot emit from the visible state.

    - `[ ]` **4.3.c Register the session-init contract**
        - Register `session-init-envelope` at version 1 with `strict-current` posture through
          `createSessionEnvelopeRegistry()`; reuse the already-registered full subsystem roots and leave thin helper
          views unregistered.
        - Prove deterministic identity discovery without passing the composed registry to build projection.

    - `[ ]` **4.3.d Prove schema acceptance against the characterization matrix**
        - Validate all Phase 1 session-init arm fixtures and representative optional/error variants against the
          composed schema.
        - Keep this phase acceptance-only; defer proof that serialization receives the original object to the
          Phase 5 producer-boundary tests.

### `[ ]` **4.4 Compose and register the recovery envelope and audit-report schemas**

- _Goal:_ Lean recovery status and the recovery-audit report each have a complete registered top-level contract
  composed from shared family records and thin slots.
- _Context:_ Implements complete family ownership, strict-current registration, and Success Criteria 2, 4, and 8.

    - `[ ]` **4.4.a Compose the lean recovery envelope**
        - Define a strict `SessionRecoverProbeResultSchema` in `commands/status/schema.ts` for the exact
          `runRecoverStatus()` output. Require `mode`, `identity`, `worktree`, `dirty`, `extensions`, `config`,
          `active`, `releaseRouting`, and `loadSet`; apply the shared cohort/cursor presence rules.
        - Build `test-first` around required lean slots, valid and invalid cohort/cursor presence, mapped
          active/worktree routing fields, an undeclared top-level key, and representative pass-through nested values.
        - Add a one-way compile-time assertion that `SessionRecoverProbeResult` is assignable to the schema input;
          do not infer the full producer type from deliberately partial thin views.

    - `[ ]` **4.4.b Compose the recovery-audit report**
        - Add `lib/recover/report.ts` and move the handler-private report shape into a strict full schema authority
          that composes the seed summary, optional recover envelope, and full recovery verdict; derive
          `RecoverAuditReport` via `z.infer`.
        - Build `test-first` around ready reports, early-stop reports with `recover: null`, malformed cross-state
          combinations, and rejection of an undeclared top-level report key.

    - `[ ]` **4.4.c Register and characterize both recovery contracts**
        - Register `session-recover-envelope` and `recovery-audit-report` at version 1 with `strict-current` posture
          and validate the Phase 1 recovery golden fixtures against them; leave their thin helper views unregistered.
        - Keep the full-mode status and session-handoff envelopes absent from this family registry.

## **Phase 5:** Validated producer and consumer boundaries

_Purpose:_ Enforce the new contracts where family payloads cross process or persistence boundaries while emitting
the original producer objects and preserving the compaction seed’s non-fatal side-effect behavior.

_Design decisions:_ Producer parsing is throw-on-defect validation only; serialization always receives the original
assembled object. The existing top-level CLI error boundary owns internal assertion failures. Untrusted seed defects
remain valid stopped reports rather than producer failures. See `notes-cli-session-envelope.md` § Boundary failure
disposition.

### `[ ]` **5.1 Validate session-init output while emitting the original object**

- _Goal:_ Every session-init producer defect fails deterministically before output, while every valid invocation
  serializes the same assembled object and exact bytes characterized in Phase 1.
- _Context:_ Implements validate-but-emit-original; Success Criteria 1, 2, and 4.

    - `[ ]` **5.1.a Add an injectable producer-validation seam**
        - Add `lib/session-envelope/validation.ts` with a shared schema-boundary assertion that validates for effect,
          discards the parsed copy, and throws a kernel `ArcError` with code `session-envelope.invalid`, the contract
          id, and normalized issue paths.
        - Import `ArcError` through `lib/kernel/index.ts`; add no family-level direct import of a kernel submodule.
        - Expose focused session-init and recovery assertions from the status schema module so tests can feed
          malformed assembled payloads directly without corrupting unrelated probe implementations.
        - Build `test-first` around valid output, a corrupted full-schema field, a corrupted thin routing field, and
          stable multi-issue path formatting.

    - `[ ]` **5.1.b Wire validation before session-init rendering**
        - In `handlers/status.ts`, validate the completed result after the optional `compactionSeedWrite` slot is
          attached and before either JSON emission or interactive summary rendering.
        - Ignore the parsed return value and pass the original `result` object to `JSON.stringify`; let the assertion
          reach the existing `program.parseAsync().catch` boundary, which renders the stable error, sets the non-zero
          exit, and emits no invalid JSON.
        - Cover assertion behavior directly and handler call placement with a substituted malformed orchestrator
          result; do not add an environment-controlled production bypass solely to induce a built-CLI defect.
        - Re-run the exact Phase 1 golden matrix to prove key order, absence-versus-`null`, arrays, conditional-slot
          positions, and probe branches are unchanged.

### `[ ]` **5.2 Validate recovery output and audit reports without changing their JSON**

- _Goal:_ Both recovery producers reject internal contract defects at their emit boundary while preserving ready
  and early-stop report bytes.
- _Context:_ Implements producer validation and untrusted-boundary handling; Success Criteria 1, 2, and 4.

    - `[ ]` **5.2.a Validate lean `status --recover` output**
        - Wire the recovery-envelope assertion in `handlers/status.ts` immediately before `JSON.stringify(result)`;
          serialize the original `SessionRecoverProbeResult` after validation.
        - Build `test-first` around valid lean results, corrupted routing fields, optional omission, and deterministic
          rejection through the top-level CLI error boundary with no JSON output.

    - `[ ]` **5.2.b Validate every recovery-audit report path**
        - Export a report-specific assertion from `lib/recover/report.ts` through the shared validation helper, then
          put it inside the existing `writeReport()` choke point so ready, identity-missing, seed-read/parse failure,
          git-status failure, and ordinary stopped reports all validate before JSON or text rendering.
        - Let internal report defects reach the top-level CLI error boundary with non-zero status and no partial
          output; keep valid stopped reports, including untrusted seed failures, on their existing success exit.
        - Serialize the original report, then prove Phase 1 ready/stopped goldens remain byte-identical.

### `[ ]` **5.3 Preserve non-fatal seed writes and fail-closed persisted-seed handling**

- _Goal:_ Producer seed defects remain a non-fatal session-init side effect, while untrusted persisted-seed defects
  stop recovery deterministically without crashing or manufacturing a replacement baseline.
- _Context:_ Implements the seed exception and strict-current fail-closed posture; Success Criteria 2 and 5.

    - `[ ]` **5.3.a Retain validation of the original seed before writing**
        - Preserve the existing pre-write assertion in `lib/compaction-seed/emitter.ts`, adapting it to the
          schema-backed authority from Phase 2 without introducing a second parse or moving validation after I/O.
        - Pass the original seed to canonical serialization/write logic rather than persisting a parsed copy.
        - Map schema failures to the established `seed-invalid` write status so `handlers/status.ts` attaches a
          valid failed `compactionSeedWrite` slot and still emits the session-init envelope successfully.

    - `[ ]` **5.3.b Preserve fail-closed persisted-seed consumption**
        - Consume the Phase 2 `parseCompactionSeedJson()` result in `handlers/recover.ts`; do not reimplement JSON,
          version, or schema parsing in this phase.
        - Map malformed JSON, invalid schema, and older/newer version mismatches to a valid `seed-invalid` stopped
          report that retains categorized detail, skips `runRecoverStatus()` and `auditRecoveryState()`, and exits
          successfully for machine consumption.
        - Prove a current seed enters the normal live audit while every invalid persisted form stops without a crash
          or a fabricated seed baseline.

    - `[ ]` **5.3.c Exercise boundary-appropriate non-fatal behavior**
        - Use compaction-seed unit coverage to inject an invalid producer seed and handler-level coverage to prove its
          failed write status remains valid session-init output; add no production-only test switch.
        - Use built-CLI E2E coverage for the externally reachable invalid-persisted-seed stop and successful current
          round trip.
        - Confirm a producer seed failure neither suppresses the valid session-init JSON envelope nor blocks
          compaction, while a persisted seed failure yields only the structured recovery stop.

## **Phase 6:** Result-based internal composition

_Purpose:_ Replace the session domain’s internal `Probe<T>` promise plumbing with kernel `Result` / `ResultAsync`
composition while adapting back to the unchanged probe-shaped wire contract at the established boundaries.

_Design decisions:_ Every present slot remains an independent Result; optional absence stays outside the algebra;
eager siblings resolve through `Promise.all`, not `ResultAsync.combine`; one focused status module owns errors,
helpers, and the sole wire adapter. Handoff and full status gain no schema or golden scope.

### `[ ]` **6.1 Extend the kernel Result surface and introduce the status composition seam**

- _Goal:_ Immediate asynchronous branches and typed session failures have one bounded foundation before any
  orchestrator changes its internal algebra.
- _Context:_ Implements Result migration and explicit legacy error mapping; Success Criterion 6.
- _Notes:_ See `notes-cli-session-envelope.md` § Result-migration seam map.

    - `[ ]` **6.1.a Expose immediate asynchronous Result constructors through the kernel**
        - Re-export `okAsync` and `errAsync` from `lib/kernel/result.ts` and `lib/kernel/index.ts` beside the
          existing Result surface.
        - Extend `__tests__/unit/kernel/result.test.ts` and the exact export-surface assertion in
          `__tests__/unit/kernel/import-boundary.test.ts`; retain the rule that only `lib/kernel/result.ts` imports
          `neverthrow` directly.

    - `[ ]` **6.1.b Define the focused session-status error taxonomy**
        - Add `commands/status/result-composition.ts` with `SessionIdentityMissingError`
          (`session.identity-missing`), `SessionProbeError` (`session.probe-failed`), and
          `SessionCompositionError` (`session.composition-failed`) over kernel `ArcError`.
        - Export `SessionStatusError` as the locally exhaustive union of those three variants.
        - Preserve slot/probe or operation/slot context and original causes. Retain `Error.message`, or
          `String(cause)` for non-`Error` failures; do not blanket-catch pure transforms or programming defects.

    - `[ ]` **6.1.c Prove the single `toProbe()` wire adapter**
        - Build `test-first` in `__tests__/unit/status/result-composition.test.ts` around every internal variant,
          causes/messages, non-`Error` failures, and exact mapping to
          `{ kind: "identity-missing" | "runtime", message }`.
        - Make `toProbe()` the only internal-Result-to-wire conversion point used by all four status orchestrators.

### `[ ]` **6.2 Convert shared probe helpers and slot declaration to `ResultAsync`**

- _Goal:_ Probe invocation, identity short-circuiting, gated slots, and shared session slots compose through the
  kernel Result seam without losing concurrency or per-slot isolation.
- _Context:_ Implements the shared `safeProbe` / `buildSessionSharedSlots` Result seam; Success Criterion 6.

    - `[ ]` **6.2.a Convert `safeProbe()` to typed asynchronous Result composition**
        - Move the primitive into `commands/status/result-composition.ts` and implement it with the kernel's
          `fromAsyncThrowable`, returning `ResultAsync<T, SessionProbeError>` for both synchronous invocation throws
          and promise rejections.
        - Build `test-first` in the focused composition test around success, synchronous throw, asynchronous
          rejection, slot context, original cause, and non-`Error` failures.

    - `[ ]` **6.2.b Convert gated, user, and shared slot declarations**
        - Express `gatedSlot()`, `userSlot()`, and `buildSessionSharedSlots()` with independent ResultAsync slots;
          use `errAsync` for mandatory identity absence and `okAsync` for genuine immediate successes.
        - Represent a skipped optional slot as outer `undefined` / `null`, never `Ok(undefined)`, and keep its probe
          uncalled. Start eager shared probes before awaiting and resolve their individual Results with
          `Promise.all`; do not use `ResultAsync.combine`.
        - Move helper-algebra coverage out of the 3,358-line `run.test.ts` into the focused composition test while
          retaining orchestration assertions there. Prove concurrency, identity/gate non-invocation, and sibling
          failure isolation.

### `[ ]` **6.3 Migrate session-init and recovery orchestrators to Result composition**

- _Goal:_ The two in-scope status orchestrators use Result/ResultAsync through eager, derived, and gated stages yet
  return the exact validated legacy envelopes.
- _Context:_ Implements focused internal Result adoption and legacy boundary unwrapping; Success Criterion 6.

    - `[ ]` **6.3.a Migrate `runSessionInitStatus()`**
        - Carry independent Results through eager slot fan-out, conditional supersession/current-husk work, gated
          roster/oracle slots, cross-slot enrichment, cohort/load-set projection, and cursor resolution.
        - Wrap the known synchronous `resolveLoadSetManifest()` projection with `fromThrowable` / `andThen` as a
          `SessionCompositionError`; do not rely on a throwing `map` callback as an error channel.
        - Preserve existing sequencing: eager probes remain parallel; dependent/gated probes fire only after their
          inputs; optional absence stays omission; worktree-identity, supersession, and degraded-advisory fallbacks
          remain unchanged; load-set failures retain their current propagation.
        - Apply `toProbe()` once to each present final slot at envelope construction; retain every sibling outcome
          rather than collapsing the envelope into an aggregate Result.
        - Build `test-first` against orchestration call counts, error isolation, gated non-invocation, and the Phase 1
          exact envelope fixture matrix.

    - `[ ]` **6.3.b Migrate `runRecoverStatus()`**
        - Carry the lean recover fan-out and cohort/load-set/cursor stages as individual Results, including an
          immediate successful no-cohort branch, then adapt each present final slot through `toProbe()`.
        - Preserve worktree-identity fallback, optional cohort/cursor behavior, and exact lean envelope bytes under
          success and per-probe failure.

### `[ ]` **6.4 Carry the shared Result seam through handoff and full status**

- _Goal:_ Existing status and handoff callers continue to share the migrated probe machinery without gaining any
  unplanned schema, golden, or transport work.
- _Context:_ Implements the shared-seam portion of Result migration and the no-validation scope boundary; Success
  Criterion 6.

    - `[ ]` **6.4.a Migrate `runStatus()` through the shared probe primitive**
        - Carry its existing eager fan-out as independent ResultAsync slots through `Promise.all`, then adapt each
          resolved slot at the final compose site while retaining the exact full-mode return type and field set.
        - Update focused orchestration tests only; do not add a full-mode envelope schema or characterization
          golden.

    - `[ ]` **6.4.b Migrate `runSessionHandoffStatus()` through shared slots**
        - Compose the shared and handoff-only probes with ResultAsync, preserving notes-drift enrichment,
          recommendation text, optional inbox state, and exact public error shapes.
        - Keep session-handoff schema validation and characterization outside this WU.

    - `[ ]` **6.4.c Enforce Result import and type boundaries**
        - Extend the existing kernel import-boundary proof only as needed so every new session-domain Result import
          resolves through `lib/kernel/index.ts` and direct `neverthrow` imports remain exclusive to
          `lib/kernel/result.ts`.
        - Update stale Promise/Probe TSDoc and helper references in `commands/status/run.ts`,
          `commands/status/types.ts`, and affected handler comments to describe Result internals and the unchanged
          public Probe contract.
        - Run source and test typechecks to prove every independent internal Result is unwrapped at its public
          compose site and optional absence cannot serialize as `{ ok: true }`.

## **Phase 7:** Cross-family hardening and performance evidence

_Purpose:_ Attack the composed family at its integration seams, prove the full-versus-thin authority split and
kernel import boundary, and settle the always-on validation posture with measured warm and cold command cost.

_Design decisions:_ Hardening uses composed-fixture mutations rather than duplicating home-schema matrices, preserves
the four boundary dispositions, and measures production validation without a CLI bypass. It does not widen into
tail-routed authority, handoff/full validation, bundle publication, lifecycle redesign, or another transport.

### `[ ]` **7.1 Harden full and thin schemas against malformed producer payloads**

- _Goal:_ Cross-family tests prove the composed contracts reject every routing-breaking defect while preserving
  legitimate unowned nested data and exact original emission.
- _Context:_ Closes Success Criteria 2, 3, 4, and 8 and the risk that a stricter-looking schema could itself cause a
  wire regression.

    - `[ ]` **7.1.a Build the composed malformed-payload matrix**
        - Extend the focused top-level status/recovery schema tests with data-driven mutations of the canonical
          complete envelope/report fixtures: one representative defect per registered family root, every thin
          routing field in `notes-cli-session-envelope.md` § Thin validation field map, every cross-field row in
          § Top-level slot presence contract, every recovery stop kind, and an undeclared top-level key on each of
          the session-init, lean-recovery, and recovery-report roots.
        - Assert the shared boundary error identifies the contract and normalized failing path. Leave exhaustive
          contained-record and routing-domain cases in their Phase 2–4 home-module tests rather than repeating them
          at the composed level.

    - `[ ]` **7.1.b Prove boundary dispositions, thin pass-through, and original emission**
        - Feed representative deep payloads with legitimate unmodeled fields through each thin schema and assert
          they survive unchanged.
        - Prove internal session-init, lean-recovery, and recovery-report defects fail non-zero with stable stderr
          and no stdout through direct assertion/handler-substitution coverage. Keep a producer seed defect non-fatal
          as a failed `compactionSeedWrite` slot, and keep invalid persisted seeds on the successful structured-stop
          path without live recovery probes.
        - Re-run all Phase 1 goldens after validation and Result changes; fail on any key-order, optionality,
          conditional-slot position, nesting, array-order, or error-channel drift.

    - `[ ]` **7.1.c Prove type-authority boundaries**
        - Add compile-time or source-graph assertions that contained advisory and family-record public output types
          derive from schemas, while every tail-routed type remains hand-written and thinly validated.
        - Reconfirm the one-way producer-to-schema-input assignability checks for both top-level envelopes; do not
          assert the intentionally false reverse direction for partial thin views.
        - Confirm the composed family registry contains the intended stable ids, and extend
          `__tests__/unit/kernel/schema-generation.test.ts` to retain the exact kernel-only default bundle. Do not
          pass the family registry to build projection.

### `[ ]` **7.2 Measure warm and cold producer-validation latency**

- _Goal:_ Always-on validation is supported by reproducible evidence, or an explicit replacement invariant is
  settled before the posture changes.
- _Context:_ Implements Success Criterion 7 and resolves the open performance item in
  `spec-cli-session-envelope.md`.

    - `[ ]` **7.2.a Add a reproducible non-gating benchmark harness**
        - Add `__tests__/benchmarks/session-envelope-validation.ts` plus a dedicated
          `benchmark:session-envelope` package/root script. Keep the file outside Vitest globs and ordinary CI.
        - Reuse `__tests__/helpers/session-envelope-compat.ts` to prepare the Phase 1 Orient/materialization
          full-slot state. Capture one valid unnormalized envelope during setup, then pair its real session-init
          assertion with no-op consumption in-process; the no-op is not a production injection path.
        - Separately measure a stable local-only fixture through repeated production built-CLI
          `status --session-init --json` processes with validation always enabled.
        - Default to 20 discarded plus 1,000 recorded warm paired samples and 5 discarded plus 30 recorded cold
          process samples. Report runtime, OS/architecture, Node/npm versions, fixture/build procedure, sample
          counts, p50, and p95; add no wall-clock CI assertion.

    - `[ ]` **7.2.b Run and record the benchmark**
        - Run one production build before sampling, prepare the remote-sync-disabled fixture once, execute the warm
          and cold protocols, and record the procedure/results in `notes-cli-session-envelope.md` § Performance
          measurement protocol. Exclude build and fixture setup from the measured intervals.
        - Attribute material variance to schema construction, parsing, process startup, or fixture setup rather than
          inferring causality from one run.

    - `[ ]` **7.2.c Settle any material-cost response**
        - Keep validation always-on when validation p50 is at most 5 ms and at most 5% of cold-command p50, and
          validation p95 is at most 20 ms.
        - If any threshold is crossed, stop at the review increment and present the evidence plus a concrete
          replacement invariant; do not silently disable validation or add a flag, environment/config bypass, or
          alternate benchmark binary to the production path.

### `[ ]` **7.3 Close the envelope-family integration and scope-boundary checkpoint**

- _Goal:_ The completed family behaves coherently through real status, seed, and recovery paths, and every excluded
  surface remains visibly outside the implementation.
- _Context:_ Integrates all Success Criteria and Scope boundary no-gos.

    - `[ ]` **7.3.a Run the cross-family integration checkpoint**
        - Run targeted schema/module tests, `__tests__/unit/kernel/import-boundary.test.ts`,
          `__tests__/unit/kernel/schema-generation.test.ts`, `__tests__/unit/status/run.test.ts`,
          `__tests__/integration/status.test.ts`, compaction-seed and recovery-audit suites, the session-init and
          compatibility E2E suites, both TypeScript typechecks, TypeScript lint, and a production build.
        - Through the built CLI, exercise successful JSON, reachable probe failures, invalid persisted seeds, and
          current seed recovery. Exercise intentionally malformed internal producers through the direct
          assertion/handler-substitution tests only; do not add a production defect switch.

    - `[ ]` **7.3.b Audit delivered and excluded scope**
        - Verify no top-level version was added to session-init/recovery, no parsed copy is emitted, no lifecycle or
          context-loading behavior changed, and no alternate transport appeared.
        - Verify no handoff/full envelope schema or golden, no full authority for the tail-routed inventory, and no
          build-projection wiring for envelope schemas landed.
        - Reconcile any newly discovered wholesale target to the existing tail inventory rather than expanding this
          task list.

## **Phase 8:** Verification

_Purpose:_ Validate the completed work unit against its design, task plan, compatibility contract, and full project
quality bar before integration.

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The validated envelope family, Result migration, compatibility goldens, and performance evidence satisfy
  `spec-cli-session-envelope.md` with no unresolved scope or quality gap.

---

## Success Criteria

- `[ ]` The normalized session-init assembly-arm matrix and recovery-audit goldens remain byte-identical across the
  production changes.
- `[ ]` Session-init, recovery, compaction-seed, load-set, task-cursor, and recovery-audit payloads validate through
  registered family schemas at their boundaries; top-level producer defects fail without output, the seed producer
  retains its non-fatal exception, conditional-slot presence follows the observable producer contract, and only full
  roots and complete top-level contracts are discoverable. The three complete wire roots reject undeclared
  top-level keys while nested thin views retain unowned fields.
- `[ ]` Every contained advisory slot derives its TypeScript value type from its home-module schema.
- `[ ]` Thin shared and deep slot schemas reject corrupted mapped routing fields while passing all other payload
  fields through unperturbed.
- `[ ]` Malformed and older-version compaction seeds yield structured `seed-invalid` recovery stops, current seeds
  enter normal live audit, and no seed producer defect makes session initialization fatal.
- `[ ]` Internal asynchronous probe composition uses kernel `Result` / `ResultAsync` exclusively while emitted
  envelopes retain the bare top level and legacy `{ kind, message }` probe errors.
- `[ ]` The fixed warm/cold benchmark stays within its p50/p95 materiality thresholds, or an evidence-backed
  replacement invariant is recorded before changing the always-on posture.
- `[ ]` Handoff/full-status envelopes, shared deep type authority, schema-bundle publication, lifecycle behavior,
  and transport remain outside this work unit’s delivered scope.
- `[ ]` All quality gates pass (tests, linting, type checking, build).
- `[ ]` Ready for integration.
