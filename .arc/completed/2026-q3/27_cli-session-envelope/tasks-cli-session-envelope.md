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

### `[x]` **3.3 Migrate coordination, cascade, and base-sync advisories to home-module schemas**

- _Goal:_ Remaining contained advisory outputs use schema-derived types across coordination, plate balance,
  branch-gone recovery, and base synchronization without pulling their operational inputs into the envelope model.

    - `[x]` **3.3.a Migrate `PartialPushMarkerSurfaceResult`**
        - Added strict marker/result schemas for non-empty machine identities, SHA-1/SHA-256 object ids, and ISO
          timestamps while retaining the pure and git-backed marker selection behavior.

    - `[x]` **3.3.b Migrate `ClassComposition`**
        - Added a strict non-negative integer tally schema and schema-derived type while preserving the producer's
          `heavy`, `light`, `novel` field order and existing `[TBD]` exclusion behavior.

    - `[x]` **3.3.c Migrate `CascadeResolution`**
        - Added strict action, candidate, and discriminated resolution schemas; surfaced choices require at least two
          candidates, and removable/external candidates require a worktree path.

    - `[x]` **3.3.d Migrate `BaseBranchSyncStatusResult`**
        - Added strict checkout-locus and seven-arm result schemas with state-consistent distances and a closed
          remote-failure reason; the git executor and recommendation behavior remain unchanged.

    - `[x]` **3.3.e Register the contained advisory schemas**
        - Registered all ten home-module roots under their stable version-1 `strict-current` identities and extended
          registry composition coverage without adding publication wiring or module-level side effects.

- _Outcome:_ Every contained advisory now has strict home-module runtime authority and schema-derived output types;
  the family registry composes all ten roots while preserving its fresh-instance and no-publication boundaries.

## **Phase 4:** Thin routing views and composed envelopes

_Purpose:_ Compose the full family contract from schema-authoritative records and deliberately thin pass-through
schemas for shared infrastructure, then register each top-level envelope under a stable identity.

_Design decisions:_ Thin schemas assert only mapped workflow-routing fields and pass every other valid field
through unchanged. Their exact projection lives in `notes-cli-session-envelope.md` § Thin validation field map.
The complete envelope adds observable cross-slot presence refinements without reconstructing hidden probe state;
that policy lives in § Top-level slot presence contract. Complete wire roots reject undeclared top-level keys even
though their nested thin views pass unowned fields through. Only full authoritative records and complete top-level
contracts register; registration does not expand the shipped schema bundle.

### `[x]` **4.1 Define thin routing schemas for shared git and deep-nested slots**

- _Goal:_ Shared infrastructure and deep advisory webs reject corrupted workflow-routing fields while their
  hand-written types and unowned nested payloads remain authoritative and untransformed.

    - `[x]` **4.1.a Cover shared git primitives with thin schemas**
        - Added loose routing views for dirty state, worktree sync and supersession, base-distance verdicts, and the
          object-only roster root; unowned evidence and commit arrays pass through unchanged.

    - `[x]` **4.1.b Cover deep session advisories with thin schemas**
        - Added loose views for husk, stale-worktree, work-unit, and errand advisories, pinning every mapped
          discriminant, boolean gate, and materialization identity while retaining deeper payloads.

    - `[x]` **4.1.c Prove the deliberate runtime-subset contract**
        - Proved mapped-only values are accepted and representative unowned fields survive parsing, leaving the
          handwritten source types and routed tail inventory intact.

- _Outcome:_ Shared and deep session values now reject corrupted workflow-routing fields through deliberately loose
  schemas without claiming full authority over their nested record webs.

### `[x]` **4.2 Define thin routing schemas for command-owned session slots**

- _Goal:_ Command-owned and deeply shared session slots validate the routing fields agents branch on without moving
  their broader record authority into the envelope module.

    - `[x]` **4.2.a Cover extension, config, active, and domain-rule session values**
        - Added loose command views that pin the session modes, active resolution fields, and all twelve policy
          domains while retaining unowned warnings and payload fields.

    - `[x]` **4.2.b Cover the user session-init value**
        - Added raw and enriched user views that validate every routed sync, freshness, drift, qualifier, and
          `loadNeeded` field without disturbing notes detail payloads.

    - `[x]` **4.2.c Cover enriched recommendation values**
        - Composed the closed recommendation action into all five enriched views, preserving prompt text and full
          authority for base-sync and retired-subdirectory values.

    - `[x]` **4.2.d Cover worktree identity and release routing**
        - Added primary/linked identity and wrapper/raw release-routing views with malformed-value coverage and
          pass-through preservation for paths and rationale.

- _Outcome:_ Command-owned session values now validate every workflow-routing field through thin schemas while
  leaving broader subsystem records and emitted recommendation text unchanged.

### `[x]` **4.3 Compose and register the session-init envelope schema**

- _Goal:_ One registered schema validates the complete bare session-init object, all required and optional probe
  slots, and bare scalar slots without changing payload bytes or presence semantics.

    - `[x]` **4.3.a Compose the complete top-level object**
        - Added the strict session-init root plus full identity and seed-write authorities, derived their public
          types, and retained a one-way producer-input compatibility assertion around the thin views.

    - `[x]` **4.3.b Enforce the observable conditional-slot presence contract**
        - Enforced every visible two-way and one-way slot rule while preserving degraded hidden-helper omissions and
          the invocation-only seed-write option, with mutation coverage for every policy row.

    - `[x]` **4.3.c Register the session-init contract**
        - Registered `session-init-envelope` at version 1 with strict-current posture while leaving thin helpers out
          of discovery and the kernel build projection unchanged.

    - `[x]` **4.3.d Prove schema acceptance against the characterization matrix**
        - Accepted all five Phase 1 session-init fixtures plus optional seed-write and real probe-error variants
          without introducing producer-boundary serialization behavior early.

- _Outcome:_ The complete session-init envelope now has a strict registered runtime contract that composes full and
  thin authorities, validates observable presence semantics, and accepts every characterized wire arm.

### `[x]` **4.4 Compose and register the recovery envelope and audit-report schemas**

- _Goal:_ Lean recovery status and the recovery-audit report each have a complete registered top-level contract
  composed from shared family records and thin slots.

    - `[x]` **4.4.a Compose the lean recovery envelope**
        - Added a strict lean recovery root with required-slot, routing-view, cohort, cursor, pass-through, and
          producer-input compatibility coverage.

    - `[x]` **4.4.b Compose the recovery-audit report**
        - Moved the handler-private report into a strict schema/type authority composing the seed summary, lean
          recovery envelope, and full verdict with ready/early-stop coherence checks.

    - `[x]` **4.4.c Register and characterize both recovery contracts**
        - Registered both recovery roots at version 1 with strict-current posture and accepted the Phase 1 ready and
          dirty-drift goldens without admitting thin helpers, full status, or handoff envelopes.

- _Outcome:_ Session recovery and recovery-audit reports now have complete strict registered contracts with shared
  conditional routing semantics and characterized ready, stopped, and early-stop states.

## **Phase 5:** Validated producer and consumer boundaries

_Purpose:_ Enforce the new contracts where family payloads cross process or persistence boundaries while emitting
the original producer objects and preserving the compaction seed’s non-fatal side-effect behavior.

_Design decisions:_ Producer parsing is throw-on-defect validation only; serialization always receives the original
assembled object. The existing top-level CLI error boundary owns internal assertion failures. Untrusted seed defects
remain valid stopped reports rather than producer failures. See `notes-cli-session-envelope.md` § Boundary failure
disposition.

### `[x]` **5.1 Validate session-init output while emitting the original object**

- _Goal:_ Every session-init envelope producer defect fails deterministically before output, while every valid
  invocation serializes the same assembled object and exact bytes characterized in Phase 1.

    - `[x]` **5.1.a Add an injectable producer-validation seam**
        - Added one kernel-backed validate-for-effect helper plus contract-specific assertions with stable contract
          ids and normalized multi-issue paths for full and thin producer defects.

    - `[x]` **5.1.b Wire validation before session-init rendering**
        - Validated the finalized session-init object after optional seed status and before both render paths, then
          retained the original object for serialization; all five exact wire goldens remain unchanged.

- _Outcome:_ Session-init envelope producer defects now fail through the CLI boundary before output while valid
  assembled objects retain their exact byte shape and identity.

### `[x]` **5.2 Validate recovery output and audit reports without changing their JSON**

- _Goal:_ Both recovery producers reject internal contract defects at their emit boundary while preserving ready
  and early-stop report bytes.

    - `[x]` **5.2.a Validate lean `status --recover` output**
        - Added validate-for-effect immediately before lean-recovery serialization with valid, malformed-routing,
          and optional-omission assertion coverage.

    - `[x]` **5.2.b Validate every recovery-audit report path**
        - Put the report assertion in the shared write choke point so ready and every stopped path validate before
          text or JSON; characterized ready and dirty-drift bytes remain unchanged.

- _Outcome:_ Lean recovery and audit reports now reject internal defects at their final output choke points while
  preserving original objects and successful machine-readable stop reports.

### `[x]` **5.3 Preserve non-fatal seed writes and fail-closed persisted-seed handling**

- _Goal:_ Producer seed defects remain a non-fatal session-init side effect, while untrusted persisted-seed defects
  stop recovery deterministically without crashing or manufacturing a replacement baseline.

    - `[x]` **5.3.a Retain validation of the original seed before writing**
        - Kept the single pre-write strict assertion and changed stringification to serialize the original validated
          seed, retaining `seed-invalid` as a non-throwing failed status.

    - `[x]` **5.3.b Preserve fail-closed persisted-seed consumption**
        - Retained the categorized persisted-seed parser and early stopped report path, which skips live recovery for
          malformed, invalid, or version-mismatched seeds without manufacturing a baseline.

    - `[x]` **5.3.c Exercise boundary-appropriate non-fatal behavior**
        - Proved invalid producer seeds never write, valid seeds round-trip unchanged, and external invalid persisted
          seeds yield only successful structured recovery stops without a production bypass.

- _Outcome:_ Seed production remains a non-fatal validated side effect, while persisted seed defects fail closed as
  valid recovery stops and current seeds continue through the ordinary live audit.

## **Phase 6:** Result-based internal composition

_Purpose:_ Replace the session domain’s internal `Probe<T>` promise plumbing with kernel `Result` / `ResultAsync`
composition while adapting back to the unchanged probe-shaped wire contract at the established boundaries.

_Design decisions:_ Every present slot remains an independent Result; optional absence stays outside the algebra;
eager siblings resolve through `Promise.all`, not `ResultAsync.combine`; one focused status module owns errors,
helpers, and the sole wire adapter. Handoff and full status gain no schema or golden scope.

### `[x]` **6.1 Extend the kernel Result surface and introduce the status composition seam**

- _Goal:_ Immediate asynchronous branches and typed session failures have one bounded foundation before any
  orchestrator changes its internal algebra.

    - `[x]` **6.1.a Expose immediate asynchronous Result constructors through the kernel**
        - Added and type-tested `okAsync` / `errAsync` through the exact kernel barrel while retaining the sole
          direct `neverthrow` import in the kernel Result module.

    - `[x]` **6.1.b Define the focused session-status error taxonomy**
        - Added the three exhaustive ArcError variants with stable codes, slot/operation context, original causes,
          and compatible non-Error messages.

    - `[x]` **6.1.c Prove the single `toProbe()` wire adapter**
        - Added the sole exact wire adapter with coverage for success identity, all internal variants, causes,
          messages, and the legacy identity-missing/runtime error split.

- _Outcome:_ The kernel and status domain now expose the bounded asynchronous Result foundation, typed failure
  taxonomy, and one exact adapter required for orchestrator migration.

### `[x]` **6.2 Convert shared probe helpers and slot declaration to `ResultAsync`**

- _Goal:_ Probe invocation, identity short-circuiting, gated slots, and shared session slots compose through the
  kernel Result seam without losing concurrency or per-slot isolation.
    - `[x]` **6.2.a Convert `safeProbe()` to typed asynchronous Result composition**
        - Moved the probe primitive into the focused composition module with typed capture of synchronous throws,
          promise rejections, non-`Error` causes, and stable slot context.

    - `[x]` **6.2.b Convert gated, user, and shared slot declarations**
        - Added independent ResultAsync declarations for gated, user, and shared slots, preserving eager concurrency,
          outer optional absence, identity short-circuiting, and sibling failure isolation in focused tests.

- _Outcome:_ Shared status probes now compose through one typed Result seam without changing invocation timing or
  allowing one failed slot to suppress its siblings.

### `[x]` **6.3 Migrate session-init and recovery orchestrators to Result composition**

- _Goal:_ The two in-scope status orchestrators use Result/ResultAsync through eager, derived, and gated stages yet
  return the exact validated legacy envelopes.
    - `[x]` **6.3.a Migrate `runSessionInitStatus()`**
        - Migrated eager, derived, gated, enrichment, load-set, and cursor stages to independent Results, with the
          synchronous load-set projection captured as a composition error and final adaptation at envelope assembly.

    - `[x]` **6.3.b Migrate `runRecoverStatus()`**
        - Migrated the lean recovery fan-out and dependent cohort/load-set/cursor stages while retaining identity
          fallback, optional omission, per-probe failures, and exact envelope serialization.

- _Outcome:_ Both validated orchestrators now retain typed failures internally through their final compose sites
  while continuing to emit the characterized legacy envelopes byte-for-byte.

### `[x]` **6.4 Carry the shared Result seam through handoff and full status**

- _Goal:_ Existing status and handoff callers continue to share the migrated probe machinery without gaining any
  unplanned schema, golden, or transport work.
    - `[x]` **6.4.a Migrate `runStatus()` through the shared probe primitive**
        - Migrated the full-status eager fan-out through independent Results and final probe adaptation without
          adding schema or golden scope.

    - `[x]` **6.4.b Migrate `runSessionHandoffStatus()` through shared slots**
        - Migrated shared and handoff-only probes while preserving drift enrichment, recommendation text, optional
          inbox state, and public error shapes without adding handoff validation scope.

    - `[x]` **6.4.c Enforce Result import and type boundaries**
        - Kept all session-domain Result imports behind the kernel barrel, refreshed public-boundary documentation,
          and proved source/test typing plus the direct-import restriction.

- _Outcome:_ Every status caller now shares the Result composition machinery while full and handoff modes retain
  their deliberately unvalidated public boundaries.

## **Phase 7:** Cross-family hardening and performance evidence

_Purpose:_ Attack the composed family at its integration seams, prove the full-versus-thin authority split and
kernel import boundary, and settle the always-on validation posture with measured warm and cold command cost.

_Design decisions:_ Hardening uses composed-fixture mutations rather than duplicating home-schema matrices, preserves
the four boundary dispositions, and measures production validation without a CLI bypass. It does not widen into
tail-routed authority, handoff/full validation, bundle publication, lifecycle redesign, or another transport.

### `[x]` **7.1 Harden full and thin schemas against malformed producer payloads**

- _Goal:_ Cross-family tests prove the composed contracts reject every routing-breaking defect while preserving
  legitimate unowned nested data and exact original emission.
    - `[x]` **7.1.a Build the composed malformed-payload matrix**
        - Added canonical-fixture mutation matrices covering every mapped thin field, every registered family root,
          all top-level presence rules and strict roots, every recovery stop kind, and normalized contract paths.

    - `[x]` **7.1.b Prove boundary dispositions, thin pass-through, and original emission**
        - Proved deep unowned-field pass-through, validate-but-emit-original behavior, stable failure output, non-fatal
          seed production, probe-free invalid-seed stops, and byte-identical characterization goldens.

    - `[x]` **7.1.c Prove type-authority boundaries**
        - Added source-graph proofs for schema-derived owned records and handwritten tail types, retained one-way
          producer compatibility checks, and reconfirmed the exact family registry and kernel-only build bundle.

- _Outcome:_ The composed contracts now have adversarial cross-family coverage without widening thin authority or
  changing the established wire representation and failure dispositions.

### `[x]` **7.2 Measure warm and cold producer-validation latency**

- _Goal:_ Always-on validation is supported by reproducible evidence, or an explicit replacement invariant is
  settled before the posture changes.
    - `[x]` **7.2.a Add a reproducible non-gating benchmark harness**
        - Added root/package scripts and a dev-only harness with the prescribed fixture reuse, paired warm samples,
          production built-CLI cold samples, environment metadata, and no production bypass or CI timing assertion.

    - `[x]` **7.2.b Run and record the benchmark**
        - Ran one build plus the 20/1,000 warm and 5/30 cold protocol and recorded the exact environment, setup,
          distributions, and bounded interpretation in `notes-cli-session-envelope.md`.

    - `[x]` **7.2.c Settle any material-cost response**
        - Measured a 0.0419 ms paired p50, 0.1076 ms paired p95, and 0.0165% of the 254.8607 ms cold-command p50;
          all thresholds passed, so validation remains always on.

- _Outcome:_ Reproducible local evidence supports the always-on assertion posture with substantial margin while
  keeping performance timing outside ordinary CI.

### `[x]` **7.3 Close the envelope-family integration and scope-boundary checkpoint**

- _Goal:_ The completed family behaves coherently through real status, seed, and recovery paths, and every excluded
  surface remains visibly outside the implementation.
    - `[x]` **7.3.a Run the cross-family integration checkpoint**
        - Passed 573 targeted schema, kernel-boundary, orchestration, integration, seed/recovery, session-init E2E,
          and compatibility E2E tests plus both typechecks, TypeScript lint, and a production build.
        - Exercised successful JSON, real probe failures, invalid persisted seeds, and current-seed recovery through
          the built CLI; malformed internal producers remained confined to assertion/substitution tests.

    - `[x]` **7.3.b Audit delivered and excluded scope**
        - Confirmed bare unversioned roots, original-object JSON emission, unchanged lifecycle/transport behavior,
          handwritten tail authority, and no handoff/full schemas or goldens, alternate transport, or bundle wiring.
        - Found no additional wholesale target requiring reconciliation with the existing tail inventory.

- _Outcome:_ The complete envelope family closes Phase 7 coherently across real command paths while every declared
  no-go remains outside the delivered implementation.

## **Phase 8:** Verification

_Purpose:_ Validate the completed work unit against its design, task plan, compatibility contract, and full project
quality bar before integration.

### `[x]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The validated envelope family, Result migration, compatibility goldens, and performance evidence satisfy
  `spec-cli-session-envelope.md` with no unresolved scope or quality gap.
- _Quality gates:_ Markdown lint, TypeScript lint, shell lint, both typechecks, 6,805 tests with one skipped, and the
  production build all passed.
- _Success criteria:_ All 10 criteria met; a fresh adversarial conformance pass found no blocker, major, or minor
  gap.

---

## Success Criteria

- `[x]` The normalized session-init assembly-arm matrix and recovery-audit goldens remain byte-identical across the
  production changes.
- `[x]` Session-init, recovery, compaction-seed, load-set, task-cursor, and recovery-audit payloads validate through
  registered family schemas at their boundaries; top-level producer defects fail without output, the seed producer
  retains its non-fatal exception, conditional-slot presence follows the observable producer contract, and only full
  roots and complete top-level contracts are discoverable. The three complete wire roots reject undeclared
  top-level keys while nested thin views retain unowned fields.
- `[x]` Every contained advisory slot derives its TypeScript value type from its home-module schema.
- `[x]` Thin shared and deep slot schemas reject corrupted mapped routing fields while passing all other payload
  fields through unperturbed.
- `[x]` Malformed and older-version compaction seeds yield structured `seed-invalid` recovery stops, current seeds
  enter normal live audit, and no seed producer defect makes session initialization fatal.
- `[x]` Internal asynchronous probe composition uses kernel `Result` / `ResultAsync` exclusively while emitted
  envelopes retain the bare top level and legacy `{ kind, message }` probe errors.
- `[x]` The fixed warm/cold benchmark stays within its p50/p95 materiality thresholds, or an evidence-backed
  replacement invariant is recorded before changing the always-on posture.
- `[x]` Handoff/full-status envelopes, shared deep type authority, schema-bundle publication, lifecycle behavior,
  and transport remain outside this work unit’s delivered scope.
- `[x]` All quality gates pass (tests, linting, type checking, build).
- `[x]` Ready for integration.
