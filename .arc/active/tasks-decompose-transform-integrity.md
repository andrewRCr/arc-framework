# Task List: Decompose Transform Integrity

- **Design:** `spec-decompose-transform-integrity.md`
- **Delivery:** Ordered append-only slices with compatibility and review seams are recorded in
  `notes-decompose-transform-integrity.md` § Manual Delivery Stack.

---

## **Phase 1:** Closed v3 evidence and conservation

_Purpose:_ Establish the only decomposition evidence model and the exact byte/dependency inventory that every
core authority consumer shares.

_Design decisions:_ Unpublished v1/v2 decomposition evidence is removed rather than migrated after its current
self-hosting obligations are resolved. Unrelated transition receipts remain in their existing owner. One closed
v3 decomposition validator owns authority; nested Markdown remains ordinary Markdown represented as disjoint byte
units.

### `[x]` **1.1 Replace development evidence with the closed v3 contracts**

- _Goal:_ New decomposition transforms and stored decomposition authority have one canonical schema with no
  compatibility branches or partially authored state accepted as complete.

    - `[x]` **1.1.a Resolve and clear obsolete decomposition state**
        - Confirmed that the two old decomposition receipts' dependency obligations were already materialized,
          deleted both records, and removed their v1/v2 decomposition authority without adding compatibility.
        - Preserved complete enumeration and reconciliation for the seven retained rename/abandon records; obsolete
          decomposition evidence no longer grants reference, cleanup, commit, or lifecycle authority.

    - `[x]` **1.1.b Define starter and completed cut-map schemas**
        - Closed the v3 machine/authoring envelopes, every public union arm, exact placement depth, starter slot,
          machine identity, canonical order, and symmetric/heterogeneous cardinality rule.
        - Projected every named digest from validated closed operands so extra, self-referential, checkout-only, and
          unversioned inputs cannot alter authority; the detailed decoder returns one deterministic actionable locus.
        - Pinned canonical starter/completed bytes and every versioned identity while covering all nested arms,
          preimage perturbations, stored-byte changes, placeholders, tampering, and identity-array drift.

    - `[x]` **1.1.c Bind prepared evidence and allowed paths**
        - Sealed the distinct v3 preparation namespace arm from one authenticated plan, exact stored-blob inventory,
          completed map, allowed-path closure, publication, topology, prospective ROADMAP observation, and ownership.
        - Revalidated canonical topology semantics, publication order, source overlay facts, ROADMAP identity, and
          full-claim worktree correlation before returning prepared authority.
        - Byte-pinned partial/no-topology and full/all-topology preparations; exhaustive identity, path, namespace,
          ownership, publication, overlay, topology, and digest mutations now fail closed.

    - `[x]` **1.1.d Bind finalized receipt and publication identity**
        - Sealed finalized receipts from one authenticated preparation, exact per-destination outputs, the complete
          non-receipt path-state partition, its changed patch, and publication-ordered continuation.
        - Reauthenticated embedded preparation facts for shared-namespace reads and made ownership, logical anchor,
          entries, topology, modes, receipt-path exclusion, destination coverage, and patch identity fail closed.
        - Pinned canonical receipt bytes and every publication/continuation arm; direct finalization tests prove
          exact compare-and-set replacement and no write under stored or live authority drift.

- _Outcome:_ V1/v2 decomposition evidence no longer grants authority; the v3 map, preparation, and finalized
  receipt now form one closed, byte-pinned identity chain whose namespace, operands, paths, publication, topology,
  ownership, and transition partitions are authenticated before use.

### `[x]` **1.2 Scan stable disjoint allocation units**

- _Goal:_ Every source artifact can be conserved exactly once using hierarchy-qualified identities over its
  original bytes.

    - `[x]` **1.2.a Build the H2-H6 heading-stack inventory**
        - Scanned preamble, parent lead, and every H2-H6 descendant as disjoint original-byte ranges with
          hierarchy-qualified, normalized, per-parent occurrence identities.
        - Made occurrence keys collision-safe, treated H1 as a hierarchy reset without allocating it, and preserved
          a leading BOM while classifying an immediate ATX or Setext heading.
        - Pinned CRLF, multibyte, BOM, level-jump, repeated-parent, fence, HTML, quote, list, no-heading, and opaque
          non-Markdown behavior while proving exact byte reconstruction.

    - `[x]` **1.2.b Resolve hierarchy-qualified locators**
        - Closed locator ancestry to strictly increasing parent levels, projected untrusted locators canonically,
          and required one exact match independent of object property order.
        - Added one source-unit authentication seam that binds managed path plus locator into `sourceId`, retains
          exact stored-byte digest separately, and reports stable identity, locator, or content loci on refusal.
        - Preflight revalidation now pinpoints byte drift at the affected source-unit digest; hierarchy movement,
          malformed ancestry, wrong level/occurrence, duplicate resolution, and byte-only edits are pinned.

- _Outcome:_ Every allocatable artifact now yields an exhaustive original-byte inventory whose structural identity
  changes only with path or hierarchy, while stored-byte changes remain a separate content binding and refuse at
  the affected source-unit locus.

### `[x]` **1.3 Centralize v3 validation and transition composition**

- _Goal:_ One canonical validator answers whether evidence proves the live transition, and one receipt-blind
  composition seam carries either plan-bound or validated suppression without duplicating project-readiness policy.

    - `[x]` **1.3.a Decode and rederive every stored invariant**
        - Added one discriminator-first shared receipt codec for retained transitions and closed v3 decomposition,
          with namespace enumeration consuming only its authenticated receipt arms.
        - Co-located each destination digest's exact output preimage, rederived it during untrusted decoding, and
          authenticated the recursive receipt path, embedded preparation, result partition, patch, publication, and
          continuation without returning partial or overlay authority.
        - Retained rename, abandon, and park namespaces remain valid while legacy v1/v2 decomposition and all
          version/kind collisions fail the namespace closed.

    - `[x]` **1.3.b Validate the exact live decomposition**
        - Consolidated normalized source artifacts/units, allocations, destination outputs, dependency edges,
          actual result-base identity, managed path states, derived patch, topology, and publication behind the
          canonical validator.
        - Established deterministic first-failure precedence across preparation, receipt, source, allocation,
          target, dependency, base, ownership, path, mode, patch, topology, and publication mismatches, with stable
          source, allocation, destination, edge, and path loci.
        - Finalization consumes only the complete canonical authority and performs no receipt replacement for any
          mismatched live fact class.

    - `[x]` **1.3.c Integrate authenticated v3 authority with shared consumers**
        - Complete retirement enumeration now exposes only retained generic receipts, authenticated v3
          preparations, and authenticated v3 receipts; mixed namespaces validate without reviving legacy
          decomposition authority, and preparations remain nonterminal.
        - Reference reconciliation projects the finalized original slug, while dependent queries join one exact
          machine edge to one authored `edgeId` disposition with fixed `tree-only` evidence. Duplicate, missing,
          legacy, conflicting, and malformed authority fails closed instead of appearing absent.

    - `[x]` **1.3.d Establish receipt-blind transition overlay composition**
        - Added opaque constructor-produced prospective and validated authority arms whose identity is stripped into
          one minimal origin/source-branch input before shared project-record composition; only the canonical
          finalized validator creates the durable arm.
        - Kept ordinary current-branch prospective precedence independent, migrated direct transition, ROADMAP, and
          composed-lifecycle callers, and removed staged-receipt discovery from the renderer. Exact suppression now
          covers records, warnings, quality facts, and worktree projections without reaching authority adapters.
        - Proved exact-pair suppression, mismatch and sibling preservation, unchanged no-overlay behavior, and
          prospective/validated record plus rendered-ROADMAP parity.

- _Outcome:_ Closed decoding, live validation, shared transition consumers, and receipt-blind composition now form
  one authority path: plan-bound overlays remain transient, finalized overlays originate at the canonical
  validator, and neither record enumeration nor project readiness reconstructs decomposition proof.

## **Phase 2:** Exact preflight and result planning

_Purpose:_ Resolve every source, base, allocation, profile, topology, destination, predecessor, and rider decision
before creating a branch or touching a result path.

_Design decisions:_ Preflight is read-only canonical JSON. One immutable `ValidatedDecomposePlan` is the sole
mutation authority; it already contains the operator-approved map and every mechanically derived action.

### `[x]` **2.1 Emit and revalidate read-only preflight**

- _Goal:_ The operator receives a deterministic ready-to-author map from one exact committed source without
  changing repository or lifecycle state.

    - `[x]` **2.1.a Resolve one tree-pinned source snapshot**
        - The Git adapter now enumerates only exact local branch refs, resolves the configured base, and pins every
          tree and blob read to the enumerated commit OID rather than a moving ref or invocation checkout.
        - Source selection returns the exact logical branch, qualified ref, kind, head, origin path, stored artifact
          inventory, and source-tree dependency graph. Self-identifying started branches and active/planned or
          provisional base predecessors are the only accepted forms.
        - Checkout-locus, alias, duplicate-path/ref, branch-identity, incompatible-predecessor, missing/stale-base,
          and uncommitted-state cases now prove deterministic selection or refusal without remote or worktree reads.

    - `[x]` **2.1.b Infer the exact source planning profile**
        - Preflight now derives draft, conventional single-spec, or the sanctioned slug-paired PRD/RFC profile from
          raw tree-pinned `Design` and `Task List` metadata; callers cannot supply a profile or artifact scan set.
        - Every design pointer and any authoritative task pointer must resolve exactly once in the selected source
          inventory. Mixed, missing, duplicated, wrong-origin, unsanctioned, or task-inconsistent authority refuses
          at the exact metadata field or artifact path before starter construction.
        - Invalid self-authenticating source profiles remain selected and fail closed instead of disappearing behind
          configured-base fallback; an unset task pointer keeps provisional task bytes non-authoritative.

    - `[x]` **2.1.c Expose canonical machine-readable preflight**
        - Decompose input now normalizes to one closed preflight, execute, or finalize-with-continuation arm; future
          discard and handoff flags remain outside the registry until their owning tasks extend the discriminator.
        - Machine mode is selected before interactive rendering. Success writes exactly one canonical starter map
          containing the inferred profile and `preflightId`; config warnings and every refusal tier write only to
          stderr, with no partial stdout.
        - Real-Git coverage proves preflight preserves the complete ref and worktree registries, attached indices,
          retirement records, and dirty filesystem bytes while ignoring remote-tracking and invocation-checkout
          state.

    - `[x]` **2.1.d Revalidate the exact preflight binding**
        - Execution preflight reads completed bytes once, requires byte-canonical closed-map decoding and exact
          authoring identity conservation, then resolves a fresh tree-pinned source through the same Git adapter.
        - Machine comparison follows one fixed branch/ref/head/base/profile/source/incoming/outgoing/preflight order
          and returns the first exact field or array-entry locus; no completed map or refreshed preflight escapes on
          refusal.
        - The execute handler now consumes this gate before result planning. Real-Git source movement proves a stale
          head creates no branch, preparation, worktree, index, record, or dirty-byte change.

- _Outcome:_ Preflight and execute now share one checkout-independent committed-source authority: canonical author
  input can advance only when its complete machine envelope still matches the freshly rederived source and result
  base, while every drift path remains locally read-only.

### `[x]` **2.2 Build the complete immutable result plan**

- _Goal:_ Every pre-creation refusal and every permitted write is represented once in the plan consumed by the
  driver.

    - `[x]` **2.2.a Enforce allocation, ownership, and dependency conservation**
        - Added one pure pre-creation pipeline whose fixed decode, machine-binding, live-conservation, ownership,
          and dependency stages return the first typed refusal with an exact machine, allocation, record, or path
          locus.
        - Exact source and live-edge sets now gate destination identity, locator, and ownership compatibility;
          `cohort-shared` content can target only cohort coordination without encoding semantic prose judgment.
        - Incoming, outgoing, and internal dependencies produce one edge-ordered edit chain per dependent. Missing,
          stale, unwritable, unchanged, self-referential, or retiring-origin projections refuse before any mutable
          authority exists.

    - `[x]` **2.2.b Prove predecessor removal and classify source-private riders**
        - Added a pure three-tree planner that binds the sole merge base and exact stored bytes, modes, and object
          kinds across the complete UTF-8-ordered path universe.
        - Started and backlog-stub contracts now produce exact predecessor/origin retirement operands while refusing
          topology, predecessor, mode, and type drift before mutation.
        - A binary-safe Git adapter uses `merge-base --all` and recursive type-aware tree reads; all remaining
          source-private additions, modifications, and deletions return in one deterministic rider inventory.

    - `[x]` **2.2.c Plan the logical anchor and constitutive cohort paths**
        - Added a pure topology planner that separates the direct-member, cohort, subcohort, and at-cap logical
          anchors from ordered `none/create/backfill/ensure/reuse/append` path actions and their exact base bytes.
        - Canonical template rendering emits only the structural identity floor with `Purpose: —`; existing topology
          must be a matching regular UTF-8 document, and same-origin at-cap provenance is exact and idempotent.
        - Public cardinality counts only new members, while an extraction-only DTO may add a surviving origin.
          Multi-member direct placement now refuses in both the v3 codec and synchronized package/project doctrine.

    - `[x]` **2.2.d Project preparation-bound publication and topology**
        - Added one projector that authenticates each placement's exact logical anchor and topology action/path
          shape, converts raw topology bytes to canonical path facts, and seals their digest with publication.
        - Publication follows canonical destination-ID order, filters coordination, and preserves every existing
          work-unit, draft-block/locator, and document identity while keeping continuation new-leaf-only.
        - Preparation now consumes the combined projected authority and revalidates it on create/decode; missing,
          extra, mismatched, drifted, or unstable publication/topology operands refuse before occupation.

    - `[x]` **2.2.e Compose one mutation per managed path**
        - Added a typed byte-level composer that binds every profile artifact, optional provisional task,
          allocation projection, topology action, dependency edit, retirement, ROADMAP update, and evidence write
          into the canonical registry before exposing a plan.
        - The registry now retains destination, artifact, source-projection, dependent, and edge identity, enforces
          semantic contributor order and exact prestates, and returns one UTF-8-ordered final mutation plus
          content-addressed bytes per path.
        - New-leaf metas render the prepared receipt marker exactly once; existing homes and ordinary rendering
          omit it. Profile, path-set, role, writer, object, mode, collision, and continuity violations fail closed.

- _Outcome:_ One read-only pipeline now carries tree-pinned conservation, retirement, topology, publication, and
  content facts into a preparation-bound plan whose complete path authority is unique, ordered, byte-exact, and
  directly consumable without later resolver or contributor writes.

### `[x]` **2.3 Define exact candidate occupation**

- _Goal:_ The later materialization driver receives one testable occupation seam and exact ownership operand for
  either the plan-bound candidate or the partial-protection base projection.

    - `[x]` **2.3.a Define exact transient candidate ownership**
        - Added one closed repository-common claim machine with content-derived claim/worktree identities, positive
          generations, pathless pending recovery, adapter-only path registration, and exact acquire, reserve,
          occupy, retire, release, and terminal retry semantics.
        - Added per-claim locking and atomic persistence. Canonical filename/record mismatches, malformed state,
          stale generations, duplicate branch claims, incomplete occupation evidence, and unproven cleanup all fail
          closed; write-failure and concurrency coverage proves preserved resumability without lost updates.
        - Worktree markers and preparation ownership now carry only the claim/generation/branch/opaque-worktree
          tuple. In-flight, status/session, and cleanup derivation loads exact common-directory claims, suppresses
          only unambiguous live candidate residue, and surfaces invalid operational records without host-path
          leakage.

    - `[x]` **2.3.b Implement the result-occupation seam**
        - Added one injectable occupation driver over protection mode, configured base, and the immutable plan's
          explicit source, cut-map, and expected-base binding; the public execute path remains unwired.
        - Full protection creates or resumes only `chore/decompose-<origin>` with one exact claim, registration,
          head, and marker projection. Partial protection exposes only a clean exact relevant-path base projection.
        - Base movement and every absent, duplicate, wrong-path, occupied, stale, foreign, marker, and concurrent
          collision refuse before materialization. Proven mutation-free creation races roll back to the exact
          pathless pending generation; uncertain races preserve typed recovery-required state.

- _Outcome:_ The immutable plan now carries its exact occupation binding into one protection-aware seam. Full mode
  yields only claim-backed candidate ownership, partial mode yields only the explicit not-applicable arm, and no
  path mutation or branch-prefix convention can substitute for exact base, claim, registration, and marker proof.

## **Phase 3:** Planning authority, topology, and finalization

_Purpose:_ Materialize the profile-correct artifact family and anchor, preserve earned planning maturity through
start, then seal only the semantically reviewed candidate.

_Design decisions:_ The CLI creates structural floors but not semantic prose. The distribution interlock is human
authority; finalization checks mechanics and persists no approval credential.

### `[x]` **3.1 Materialize and execute the complete result projection**

- _Goal:_ Every planned member and constitutive coordination path exists in the exact result with explicit
  incompleteness where authoring is still required, and one driver consumes only those materialization contracts.

- _Note:_ Design coverage: D3, D5.

- **Additional Context:** `notes-decompose-transform-integrity.md` § Phase 3 Grounding

    - `[x]` **3.1.a Materialize one canonical mutation per managed path**
        - The managed optional `Decomposition Receipt` field now omits on ordinary render/reconcile, preserves one
          explicit canonical value after `Review Rubric`, and has tuple validation for duplicate, misplaced,
          malformed, or mismatched markers.
        - The immutable materializer validates every path prestate and content-addressed final blob before its first
          apply-and-stage call, accepts only exact base/final retry states, and emits each composed final path once
          without exposing contributor intermediates.
        - New-member output includes destination ID, meta path, and profile-neutral artifact paths. Draft and mature
          meta tuples bind exact Design order, unset Task List, entry workflow/Next Action, and prepared receipt;
          existing homes and ordinary metas cannot acquire the marker.

    - `[x]` **3.1.b Report composed topology and destination outcomes**
        - The immutable plan now retains closed topology action facts and explicit action kind on each topology
          contributor, with exact fact/contributor conservation enforced before a plan can exist.
        - Added a pure reporter that joins applied, already-applied, or exact refused-conflict path results to
          topology and destination authoring provenance. `none` and `reuse` remain explicit no-write facts even
          when destination content changes the same physical path.
        - Direct, nested, backfill, ensure, at-cap append, reuse, no-topology, composed-content, and conflict
          coverage proves reports expose no inferred prose, paths, sequencing, or secondary writes.

    - `[x]` **3.1.c Execute one plan-bound operation**
        - Added one operation that sequences occupation, post-occupation revalidation, canonical materialization,
          reporting, and preparation without exposing any post-gate authority-resolver seam.
        - The immutable plan now retains exact candidate publication and full constitutive topology facts/digest;
          preparation consumes that authority directly and combines it only with occupation-produced ownership.
        - Partial compensation captures distinct index/worktree byte images for every plan path, restores and
          verifies only paths this invocation changed, while full failures return exact candidate retry/discard
          facts, including typed checkout residue.

    - `[x]` **3.1.d Add exact candidate discard after execution exists**
        - Added the mutually exclusive `--discard <cut-map>` command mode and one injectable exact-generation
          retire-cleanup-release driver with typed discarded, already-discarded, and refused results.
        - Live discard requires current source/map authority, deterministic branch/binding, the exact registered
          candidate, an uncommitted base head, and no finalized or changed projection before terminal CAS.
        - Matching retired generations resume cleanup/release; only a matching released discarded terminal is
          already complete, while missing, foreign, committed, changed, moved, or opposite-terminal state refuses.

- _Outcome:_ One immutable plan now owns every result path and preparation fact through exact materialization,
  bounded partial/full recovery, and safe abandonment of an uncommitted full-protection candidate.

### `[x]` **3.2 Preserve workflow maturity through `arc start`**

- _Goal:_ A decomposed member retains valid design-stage authority through graduation without a provisional file
  becoming a finalized task list.

    - `[x]` **3.2.a Produce the shared exact-base integration anchor**
        - Added the closed pure anchor producer with canonical v3 authentication, exact fast-forward/two-parent
          merge relations, receipt-derived claim retirement, and typed no-authority outcomes.
        - Added one configured-base Git adapter that enumerates the pinned receipt namespace, derives the candidate
          from landing topology, verifies exact transition paths/prestates/bytes/tree parity, and rereads the base
          before returning byte-stable shared authority.

    - `[x]` **3.2.b Validate exact planning tuples**
        - Added a shared pure planning-tuple validator that composes the generic workflow invariant with exact
          slug/profile design families, complete artifact states, receipt ID/publication binding, and typed loci.
        - Optional marker parsing now proves canonical placement and identity before lookup; ordinary `create-spec`
          remains valid, while landed decomposition admits only its exact draft or single/paired-spec workflow.
        - Encoded task authority separately from file presence: one exact provisional seed is allowed, but marked
          graduation requires `Task List` unset and wrong, missing, multiple, or premature task authority refuses.

    - `[x]` **3.2.c Resolve one validated graduation transaction before mutation**
        - Added a Git-backed, immediately revalidated preflight that binds exact stored artifacts, destinations,
          branch/worktree/index preimages, planning policy, complete target meta bytes, and ordered reconciliation.
        - Both start arms now require and retain that transaction before their first mutation; exact drift,
          unresolved landing authority, tuple/Class mismatch, or occupied preimages refuse at a stable locus.

    - `[x]` **3.2.d Execute graduation through one start-only atomic port**
        - Replaced every generic backlog-start mutation and post-transition meta write with one transaction-only
          executor port; successful side effects rebind to the occupied worktree while every other lifecycle verb
          retains its existing forward-recovery path.
        - The port now owns exact spawned/in-place occupation, provisioning, byte/mode relocation, target writes,
          alternate-index staging, closed-delta verification, and reverse rollback. Fully restored failures reject;
          incomplete rollback returns typed, rendered `graduation-recovery-required` residue.
        - Real-Git coverage pins ordinary and decomposition-produced success plus branch, worktree, partial move,
          meta/provisioning, staging, source-drift, and rollback-failure boundaries.

- _Outcome:_ Backlog start now carries exact-base and planning authority through one immutable transaction whose
  successful output preserves workflow maturity and whose failures either prove every captured preimage restored
  or expose exact non-authoritative recovery residue.

### `[x]` **3.3 Validate candidate continuation against shared readiness**

- _Goal:_ Candidate and landed consumers make the same fail-closed launch-readiness decision while the
  post-authoring distribution decision supplies only the continuation finalization must seal.

    - `[x]` **3.3.a Define shared aggregate launch readiness**
        - Project composition now retains ordered, duplicate-preserving accepted candidates and typed rejected
          source facts beside its unchanged ordinary merged view; unidentified rejected evidence is indeterminate.
        - Added one pure `resolveLaunchReadiness()` reduction with closed ready/blocked/refused results, shipped-only
          dependency facts, exact source/provider loci, and fail-closed record and batch-provider validation.
        - Added the required shared dependency bundle and one-call adapter over the existing project-view provider;
          production keeps the established dependency-only socket without a config or helper-local fallback.

    - `[x]` **3.3.b Validate the closed continuation input**
        - Added one pure post-authoring validator that accepts only ordered unique new-leaf selections or explicit
          none, calls the shared readiness reducer for every selection, and preserves exact selection/source loci.
        - Validation joins the accepted choice only to the preparation-bound anchor and entries; malformed,
          existing, absent, stale, reordered, repeated, blocked, or refused selections produce typed issues without
          mutating preparation or receipt bytes.

- _Outcome:_ Candidate selection now reduces one lossless project snapshot through the same required readiness
  bundle intended for landed handoff, and only a validated ephemeral choice can join immutable publication facts.

### `[x]` **3.4 Finalize idempotently and route typed recovery**

- _Goal:_ The reviewed uncommitted candidate seals or reseals exactly, and every unsafe state retains a typed
  refusal and direct next action.

    - `[x]` **3.4.a Validate stored topology and incomplete coordination**
        - Added a pure preparation-bound topology validator that confirms stored paths through the existing planner,
          rejects drift without deriving replacement authority, and layers the exact incomplete-Purpose floor over
          unchanged generic cohort-consistency diagnostics.

    - `[x]` **3.4.b Return closed finalization statuses from one authority**
        - Finalization now reduces one pinned parent/index/worktree and ref bundle through the canonical validator,
          preparation-authenticated destination/path bindings, exact managed-path partitioning, and one closed
          status policy; only its compare-and-swap instruction can write.
        - The CLI, driver, authority port, and handler propagate one receipt-derived authority/lifecycle payload for
          recorded, already-finalized, and refreshed, while continuation, topology, readiness, candidate parity,
          structured project-view/ROADMAP parity, and committed or mixed record states fail closed.
        - The commit adapter accepts exactly one canonical v3 addition through the same validator and preserves the
          separate legacy policy; malformed, multiple, amended, rider-bearing, ownership-drifted, and
          path-partition-drifted evidence is rejected.

    - `[x]` **3.4.c Refresh only reviewed fully staged uncommitted refinement**
        - Added opaque destination-only refresh authorization that preserves every preparation-bound mechanical
          fact and the finalized continuation while refusing path, prestate, non-destination, and continuation
          drift.
        - The Git driver now requires the exact receipt-plus-transition staged set and index/worktree parity, pins
          candidate identity immediately around receipt replacement, and restores the exact prior receipt or
          returns typed bounded residue.
        - Real-Git coverage proves parent absence, reviewed refresh, foreign and mixed-path refusal, post-check race
          refusal, and exact prior-receipt restoration.

    - `[x]` **3.4.d Map typed recovery once**
        - Added one exhaustive recovery mapper over every canonical mismatch plus typed transient, candidate,
          committed, refresh, and residue causes; each action carries only separately provenance-tagged facts.
        - Retry, discard, re-preflight, and reauthorization commands or operands downgrade to exact prose guidance
          when their receipt, continuation, cut-map, origin, or candidate facts are unavailable.
        - The driver returns the closed recovery result, the handler renders it through the shared renderer, and
          the workflow contract forbids local operand or policy reconstruction.

- _Outcome:_ Finalization now owns one validator-to-CAS-to-recovery authority chain: success statuses share the
  same canonical payload, reviewed refresh cannot reopen semantic choice, and every refusal preserves only proven
  recovery operands.

## **Phase 4:** Publication, projection, and workflow

_Purpose:_ Publish the durable logical handoff and give project readiness, merge recovery, and workflow
orchestration the same canonical transition authority.

_Design decisions:_ Stable identity and initial continuation persist in the receipt. Display path and readiness
remain live derivations from metas. The core supplies an exact-base integration anchor that later mobility extends.

### `[ ]` **4.1 Select durable transition authority and exact-base integration anchor**

- _Goal:_ Durable project and lifecycle consumers select one canonical finalized transition and expose local
  cleanup only from its exact landed anchor.

- _Note:_ Design coverage: D4, D5.

- **Additional Context:** `notes-decompose-transform-integrity.md` § Phase 4 Grounding

    - `[ ]` **4.1.a Select one overlay from an atomic merge snapshot**
        - Classify repository operation state and permit operation-parent recovery only for merge. Pin HEAD OID,
          ordered MERGE_HEAD OIDs, configured-base OID, and an exact index tree OID produced by `write-tree` or an
          equivalent read-only snapshot.
        - Build a closed `PinnedMergeValidationFacts` DTO containing exact receipt bytes/provenance, required commit
          parents, path/object states, and candidate/base facts. Read only from pinned objects, then reread all refs
          and regenerate the index tree before granting authority; any movement or disappearance fails closed.
        - Enumerate candidate receipts from the candidate tree and ordered operation parents, deduplicate identical
          receipt/derivation identities, and accept exactly one distinct candidate only when canonical validation
          proves its transition derives the pinned candidate tree. Mere receipt presence grants nothing.
        - Build `test-first` (one behavior at a time):
            - Ordinary and first-parent-inherited receipt topology select the one deriving candidate.
            - Same evidence inherited through multiple parents deduplicates, while distinct receipts/derivations,
              conflicting origins, octopus ambiguity, historical/other-parent-only evidence, and races fail closed.
            - Rebase, cherry-pick, and revert states receive no inferred operation-parent overlay.
            - The synchronous selector performs no I/O and adapter failure yields no partial overlay.

    - `[ ]` **4.1.b Consume the shared exact-base anchor for durable cleanup**
        - Reuse the Task 3.2.a `DecompositionIntegrationAnchor` producer over the pinned landed base facts; do not
          define another anchor shape, landing relation, receipt validator, or history search.
        - Require byte-equal `preparedBaseHead`, `candidateCommitHead`, `currentBaseHead`, receipt, origin, source
          head, and `claimRetirement` facts across start, landed handoff, and cleanup consumers. The full arm retains
          exact claim-ID/generation/branch/opaque-worktree identity; the partial arm remains not-applicable.
        - Compose decomposition local branch/worktree/user-workspace cleanup eligibility from that anchor.
          Preserve generic rename/abandon/park policy, authorize no remote cleanup, and leave descendant-base
          derivation and host/ref enumeration to their child work units.
        - Build `test-first` (one behavior at a time):
            - Exact fast-forward and merge landing reuse the earlier producer and yield local-only cleanup
              eligibility without a second validation path.
            - Candidate-only, finalized-uncommitted, other-branch, unlanded, base-moved, candidate-moved, invalid,
              ambiguous, descendant-base-only, and remote-only evidence yield no core cleanup authority.
            - Start, handoff, and cleanup consumers receive the same anchor bytes for one pinned landing.

    - `[ ]` **4.1.c Gate cleanup through the anchor's claim-retirement arm**
        - Derive and canonically validate the anchor read-only. For `required`, compare-and-swap retire only its
          bound `claimId` and generation with terminal `{ kind: landed, receiptId, candidateHead }`; return
          actionable local cleanup only on `retired` or `already-retired-matching`.
        - For `not-applicable`, perform no claim CAS and grant cleanup from the exact partial-protection anchor only
          after proving no matching live or superseded candidate claim exists. Treat `missing-unproven` as a
          full-required-arm failure, not as a partial-protection prerequisite.
        - `conflict`, discarded terminal state, concurrent generation, or any unexpected partial matching claim may
          return non-actionable diagnostics but grant no cleanup eligibility.
        - After authorized local cleanup succeeds, release the exact terminal generation's worktree registration
          only when its Git registration, marker, and branch occupation are absent. Preserve terminal registration
          on failed or incomplete cleanup so restart retains a path-addressable recovery boundary.
        - Build `test-first` (one behavior at a time):
            - Exact landing retires one generation and retry is idempotent from matching terminal evidence.
            - Concurrent/superseded generation, unproven absence, and landed/discarded terminal conflict preserve
              current ownership and grant no actionable cleanup.
            - Exact partial landing exposes `not-applicable`, performs no claim read-modify-write, and grants
              cleanup only when the candidate-claim namespace has no matching live or superseded record.
            - Validation failure never mutates the claim; claim CAS failure never leaks previously derived
              actionable authority.
            - Full-protection cleanup releases only the exact retired registration; failure between retirement,
              deletion, and release resumes without advancing the generation.

### `[ ]` **4.2 Resolve the landed publication handoff**

- _Goal:_ A canonically landed retirement resolves from its original slug into exact live publication and
  operator-selected continuation facts without storing mutable scheduling state.

- _Note:_ Design coverage: D5.

- **Additional Context:** `notes-decompose-transform-integrity.md` § Phase 4 Grounding

    - `[ ]` **4.2.a Resolve one exact landed publication by original slug**
        - Add a deliberately narrow core resolver over one pinned configured-base commit/tree and original slug.
          Authenticate the complete base-tree retirement namespace, select exactly one v3 decomposition receipt,
          and require its canonical `DecompositionIntegrationAnchor`.
        - Return closed absent, namespace-corrupt, ambiguous, not-landed, stale-base, or resolved outcomes. Do not
          consult workspace records, reachable-history enumeration, descendant bases, or remote refs.
        - Reread the configured base ref before returning and include the pinned head in resolved authority.
        - Build `test-first` (one behavior at a time):
            - Exact landed evidence resolves from the retired original slug.
            - Candidate-only, committed-unlanded, other-branch, absent, ambiguous, corrupt, or raced base evidence
              yields no handoff.

    - `[ ]` **4.2.b Resolve live anchor, entries, and selected readiness**
        - From the same pinned landed tree, resolve the publication's logical
          direct-member/cohort/subcohort/at-cap anchor into a typed display path without creating or repairing
          topology. Missing, duplicate, moved-invalid, or structural-identity mismatch returns a typed refusal;
          moved-valid topology may change display only.
        - Resolve every exact publication entry by its recorded arm. New leaves and existing work units use landed
          lifecycle records; draft blocks additionally require the exact artifact locator; documents require their
          exact managed path state in the same pinned tree. Existing destinations remain display entries but never
          continuation candidates; missing, duplicate, renamed, moved, or kind-mismatched entries fail closed.
        - Keep immutable `initialContinuation` separate from derived `launchableSelected`. Explicit none always
          yields no launchable entry; unselected ready leaves never appear; selected blocked leaves remain selected
          but non-launchable.
        - Reuse `resolveLaunchReadiness()` from Task 3.3.a over the same lossless pinned composition and shared
          `DecomposeReadinessDeps` provider. Require exactly one unparked planned `State: Planning` new-leaf record,
          shipped-only dependency satisfaction, and provider readiness; preserve typed blocked/refused reasons and
          loci. Absent, duplicate, rejected, wrong-lifecycle, or indeterminate records never become ready through a
          reduced view or empty-edge default.
        - Build `test-first` (one behavior at a time):
            - Direct-member, cohort, subcohort, at-cap, and moved-valid anchors resolve display paths without
              receipt mutation.
            - Selected-ready, selected-blocked, unselected-ready, mixed selection, and explicit none produce exact
              immutable and derived fields.
            - Missing/invalid entry, existing destination selection, integrating/shipped/parked/nonexistent
              dependency states, and provider blockers remain distinguishable.
            - The same receipt against snapshots A and B keeps immutable authority equal while display/readiness
              derivations change.

    - `[ ]` **4.2.c Export a facts-only `LandedDecompositionHandoff`**
        - Export a stable handoff containing pinned base/receipt identity, logical and display anchor, ordered
          resolved entries, immutable initial continuation, and derived selected readiness/blockers.
        - Include no argv, launch execution, resume/status state, or persisted frontier. `stub-mint-to-launch`
          consumes this contract and owns entry-point-agnostic orchestration.
        - Build `test-first` (one behavior at a time):
            - A consumer can select orchestration entirely from typed facts without parsing receipt JSON or prose.
            - Multiple selected leaves and blockers preserve order and exact loci without precomposed commands.
            - Update the downstream planning contract to reference this handoff without implementing its launch
              orchestration in core.

    - `[ ]` **4.2.d Expose one read-only landed-handoff command**
        - Add `arc decompose <origin> --handoff` as the public command/handler surface over the core resolver. Make
          it mutually exclusive with preflight, execute, finalize, and discard modes.
        - Return one closed machine-readable result for resolved and every refusal status. Keep canonical payload
          on stdout and diagnostics on stderr; do not expose receipt storage bytes or require a caller-supplied
          receipt, base OID, candidate OID, or display path.
        - Pin and recheck the configured base through the resolver. The command changes no ref, index, worktree,
          claim, or lifecycle record; prepared and committed-unlanded evidence returns `not-landed`.
        - Make the shipped workflow and real-topology acceptance invoke this command rather than import the
          resolver or parse a receipt.
        - Build `test-first` (one behavior at a time):
            - Exact landing emits the typed facts-only handoff through the built CLI.
            - Candidate-only, committed-unlanded, absent, corrupt, ambiguous, and raced-base cases emit their exact
              closed status with no repository mutation.
            - Mode conflicts and extra positional/option evidence refuse at the handler boundary.

### `[ ]` **4.3 Publish the verb-driven decomposition workflow**

- _Goal:_ One post-authoring interlock reviews semantic distribution while every deterministic proof and recovery
  choice comes from CLI results.

- _Note:_ Design coverage: D6.

- **Additional Context:** `notes-decompose-transform-integrity.md` § Phase 4 Grounding

    - `[ ]` **4.3.a Move the distribution interlock to the authored candidate**
        - Edit package-source `decompose-work-unit.md` and render its Framework project copy.
        - Remove the old pre-transform semantic approval. Place exactly one named distribution
          `workflow-interlock` after every CLI-reported member/existing-home/cohort destination is authored and
          before the closed continuation input and finalization.
        - Review actual distributed authority, dependency effects, topology, publication entries, and explicit
          selected-slugs-or-none continuation. Author only the closed continuation-input file and invoke the exact
          CLI-reported finalize-with-continuation command; never edit preparation or receipt JSON.
        - Preserve commit, push, and integration interlocks solely as release controls.

    - `[ ]` **4.3.b Replace mechanics with verbs and reported remedies**
        - Dispatch in the spec-defined order: preflight starter map; operator-owned semantic completion; exact
          prepare/materialize; author every result-packet destination; distribution interlock/continuation
          selection; typed finalize-with-continuation; protection-mode ship; landed facts-only handoff.
        - Iterate CLI profile/topology packets containing exact paths, dispositions, and authoring requirements.
          Remove workflow-side Git topology, schema/JSON/digest/receipt construction, branch/worktree mutation,
          topology repair/validation, and recovery reconstruction.
        - Stop on every refusal, display only the CLI-rendered typed status/remedy, and re-enter only at the
          action-indicated step. Never invent retry/discard/re-preflight/reauthor commands or placeholder facts.
        - Remove extension-owned extraction, source-thinning, multi-member cohortless, planning-lane, mobility,
          durable-enumeration, and remote-cleanup arms. Core reports the landed handoff; it does not launch members.

    - `[ ]` **4.3.c Route release controls by protection mode**
        - Under partial protection, run the commit interlock and direct configured-base commit only; include no
          pre-push extension, push, PR, integration interlock, or merge sequence.
        - Under full protection, use the existing CLI-reported candidate branch without creating/switching/deleting
          it, then order finalize success, commit interlock/`workflowCommit`, `pre-push-review`, push
          interlock/`workflowPush`, PR status, integration interlock, and merge.
        - Route post-landing handoff and exact reported local cleanup/claim outcomes without reconstructing
          teardown authority.
        - Build `test-first` (one behavior at a time):
            - Partial and full render mutually exclusive release sequences.
            - Full protection preserves extension and release-interlock dominance; partial contains none of its
              push/PR/merge controls.
            - No workflow command creates or deletes a Git branch/worktree.

    - `[ ]` **4.3.d Verify workflow and package/project parity**
        - Add a focused decomposition workflow contract test over ordered stable headings/markers, one named
          distribution interlock, typed continuation/finalization, profile/topology packets, recovery control flow,
          protection-mode release arms, and facts-only handoff.
        - Allow only decompose preflight/execute/finalize-with-continuation, exact reported remedies, release
          routing, full-protection PR control, and landed handoff command families. Separately forbid Git plumbing,
          handwritten schemas/digests/receipt mechanics, branch/worktree mutation, topology repair/validation, and
          invented recovery.
        - Render package source with `npm run render:framework`; verify the focused contract, existing generic
          release-interlock dominance, framework sync, Markdown lint, and ARC methodology contract checks.

## **Phase 5:** Real-topology core acceptance

_Purpose:_ Prove the complete retirement core at the command, hook, landing, project-projection, publication, and
local-cleanup boundaries without importing extension-owned matrices.

### `[ ]` **5.1 Exercise the canonical retirement lifecycle**

- _Goal:_ A realistic started work unit reaches a landed, origin-addressable, launch-ready result using only
  machine-produced proof and the installed ARC surface.

- _Note:_ Design coverage: D1-D6. This is acceptance composition, not the implementation home for lower-tier
  behavior.

- **Additional Context:** `notes-decompose-transform-integrity.md` § Phase 5 Grounding

    - `[ ]` **5.1.a Build the realistic decomposition fixture**
        - Keep the canonical acceptance black-box: import only Node built-ins and run the built CLI. Initialize a
          repository normally, set `branch.protection: full`, and assert `core.hooksPath` remains
          `.arc/system/.internal/githooks` with the installed `pre-commit`, `commit-msg`, and `pre-push` chain.
        - Name fixture-only setup helpers as hook-bypassing and restrict them to repository bootstrap before the
          acceptance history. Use plain `git commit` through the installed chain for a valid control commit and
          every candidate/finalization commit; remove the synthetic decomposition-only hook installer.
        - Through built CLI commands, create and commit a planned predecessor on the configured base, then start it
          onto source branch `plan/origin` and its attached worktree. Commit branch-private paired-spec planning
          authority with a nontrivial provisional task seed while the base retains the exact planned predecessor.
        - Assert configured primary/base/source refs, registered source worktree, merge base, exact heads,
          predecessor bytes, the absence of source-only bytes from base, and the absence of the deterministic
          candidate ref/worktree/claim. Use a local bare remote for synchronization and no network.
        - Commit one unrelated source rider and prove pre-occupation validation refuses before any candidate,
          claim, or result path exists. Revert the rider in committed source history, rerun preflight, and continue
          only from the new exact source head.
        - Run `--preflight` through an explicitly non-TTY helper that keeps stdout and stderr separate. Persist its
          canonical stdout, prove it changes no ref/index/worktree/claim state, and obtain the same source binding
          from the source and another attached checkout.
        - Complete the map as an explicitly symmetric retirement with at least three new leaves and no existing
          home, using only the documented semantic allocation, ownership, and dependency slots. Compare the decoded
          map before and after authoring so every machine-owned field remains byte-for-byte equal.

    - `[ ]` **5.1.b Drive one canonical started retirement**
        - Exercise candidate occupation, exact tuple/cohort materialization, semantic authoring, the fixture's
          explicit post-authoring continuation file, and atomic finalization. Prove checkpoint order without
          fabricating an approval token or claiming automated proof of semantic fidelity; the receipt contains no
          approval credential.
        - Before finalization, prove the installed hook chain rejects the prepared candidate commit. Finalize once,
          assert an immediate no-change retry returns `already-finalized`, then commit normally with a valid ARC
          message through the commit-relevant installed hooks and push to the local bare remote through
          `pre-push`.
        - While prepared and again while committed-unlanded, use only public read-only status and `--handoff`
          queries from the base checkout. Assert candidate members remain absent, handoff is non-landed, and no
          query mutates the base or candidate; do not probe with `arc start`.
        - Assert the candidate projection suppresses the retired origin while the configured-base ROADMAP and
          predecessor remain unchanged. Land with a real exact-base non-fast-forward Git merge, never by copying
          files or moving refs, and do not advance the base after landing. Re-render without a supplied overlay and
          require the same converged project view.
        - After landing, resolve the public handoff by original slug. Assert one selected ready new leaf, one
          blocked published new leaf with its exact dependency locus, and one unselected ready new leaf.
        - Assert the exact managed-path manifest with blob OIDs and modes, no extra paths, paired-spec member
          metadata, provisional-task non-authority, logical/display anchor, receipt/base/candidate identities, and
          unchanged source ref/tree.
        - Assert the live claim's exact generation and binding suppress only its candidate warning while a
          simultaneous recordless `chore/decompose-*` branch still warns. Exact landing retires the claim to
          matching `{ kind: landed, receiptId, candidateHead }`; retry is already-retired-matching.
        - Derive local-only teardown eligibility and claim retirement from the same canonical landing result.
          Grant no remote cleanup, keep the source branch/worktree until explicit fixture teardown, and finish with
          no stray worktrees, live claims, refs, or temporary repositories.

### `[ ]` **5.2 Cover representative core variants without a cross-product**

- _Goal:_ Focused command and integration cases prove the remaining core shapes without repeating the canonical
  full-protection lifecycle.

- _Note:_ Design coverage: D2-D6. Extension-owned lifecycle matrices remain outside this phase.

- **Additional Context:** `notes-decompose-transform-integrity.md` § Phase 5 Grounding

    - `[ ]` **5.2.a Combine partial protection, heterogeneous allocation, and cohortless eligibility**
        - Use one partial-protection retirement with exactly one new leaf plus existing destinations, so the
          one-new-member cohortless rule is exercised without importing extraction or leaving a surviving origin.
        - Assert direct exact-base materialization/finalization, no candidate branch/worktree or transient claim,
          anchor `claimRetirement: { kind: not-applicable, protection: partial }`, no claim CAS, and no push, PR,
          integration, or remote-cleanup surface.
        - Apply only exact allocated edits to existing-home artifacts. Assert no existing-home meta scaffold or
          wholesale re-render, exact dependency disposition, canonical v3 finalization, and a refusal on stale
          existing-home before-state before any write.
        - Assert every existing destination publishes its exact typed identity but never enters continuation
          selection.

    - `[ ]` **5.2.b Exercise a configured-ref backlog-stub retirement**
        - Run this case under partial protection. Resolve the committed source from its configured ref with no
          active source workspace. Assert exact predecessor removal, canonical receipt/publication, profile-correct
          new members, and correct empty-parent pruning or nonempty-parent preservation.
        - Assert the explicit partial `candidateOwnership`/`claimRetirement` arms, no source-worktree teardown, no
          candidate branch/worktree, no transient claim or claim CAS, and no full-protection behavior. Keep this a
          focused command/integration case rather than a second complete lifecycle.

    - `[ ]` **5.2.c Own topology and installation assertions at their narrow seams**
        - Add a pure planner/materializer table for standalone cohort, in-cohort subcohort, missing-parent backfill,
          at-cap provenance/idempotency, and eligible single-new-member cohortless placement.
        - Add a destination-owned v3 multi-member cohortless refusal before candidate, claim, or path creation;
          do not satisfy it with an extraction-shaped surviving origin.
        - Piggyback one ordinary-install assertion that the default shipped workflow contains the reviewed
          distribution interlock while planning-lane and `arc-cleared` behavior are absent/inactive.
        - Keep the canonical full lifecycle only in Task 5.1. Exclude extraction, committed-unlanded refresh,
          descendant-base landing, planning-lane automation, durable enumeration, narrative reconciliation, and
          live-remote cleanup; retain core ownership of uncommitted refresh and exact-base local cleanup.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` V3 is the only decomposition authoring and authority schema; old decomposition records and
  decomposition-specific legacy machinery are gone after their self-hosting obligations are resolved.
- `[ ]` Preflight binds one exact committed source, emits canonical JSON only on stdout, and changes no repository
  state.
- `[ ]` Source selection uses only self-authenticating local branch refs or the exact configured-base predecessor;
  checkout, remote refs, aliases, and ref order cannot change or ambiguously choose the source.
- `[ ]` Starter and completed maps share one exact machine envelope; scalar, collection, source-allocation, and
  dependency-disposition author slots cannot alter machine identity.
- `[ ]` Preflight derives the planning profile from the pinned source before starter emission and rederives it with
  every other machine field before completed-map authority.
- `[ ]` Every v3 nested wire record, preparation/receipt envelope, ordering rule, and canonical digest preimage is
  closed and byte-fixtured under a decomposition-specific version-plus-kind namespace arm.
- `[ ]` Source-artifact and source/incoming/outgoing inventory digests have explicit versioned preimages over exact
  stored mode/bytes or canonical machine arrays.
- `[ ]` Public v3 authoring admits only started-planning/backlog-stub symmetric or heterogeneous retirement;
  extraction and surviving-origin topology remain outside the core codecs.
- `[ ]` Preparation and receipts bind one immutable candidate-ownership arm, so landing cannot infer protection or
  claim generation from current configuration.
- `[ ]` Full-protection occupation uses the exact repository-common claim key/store, atomic generation CAS, and
  latest-terminal retention bound; missing, malformed, or superseded records fail closed.
- `[ ]` Candidate worktree identity is deterministic from claim/generation and its crash-recoverable
  intended/registered/released path mapping remains machine-local and absent from preparation/receipt identity.
- `[ ]` A post-acquire `pending/unregistered` generation is resumable without path authority; crash and collision
  handling preserve it unless guarded rollback proves no observer or mutation can exist.
- `[ ]` Preparation binds the exact candidate publication and constitutive topology before execution; authoring and
  finalization validate but never re-project them.
- `[ ]` One canonical path registry rejects exclusive-role collisions and composes valid
  topology/content/dependency overlap into one final per-path mutation before occupation.
- `[ ]` Managed path results cover every non-receipt allowed path exactly once; transition patches are precisely
  the changed subset and unchanged reuse paths remain explicit.
- `[ ]` Markdown inventory is byte-exhaustive and non-overlapping from preamble through H2-H6.
- `[ ]` Allocation, ownership, dependency, profile, topology, predecessor, rider, path-state, and mode violations
  refuse before candidate creation.
- `[ ]` Full and partial protection create, resume, recover, and discard only the exact validated result.
- `[ ]` Every decomposition has an origin-addressable logical anchor; multi-member cohortless fan-out refuses.
- `[ ]` Cohort topology contributes only planned composed edits, preserves existing docs outside authorized content
  composition, reports exact paths, appends provenance once, and blocks finalization until Purpose floors are
  authored.
- `[ ]` Draft/single/paired members preserve planning maturity and provisional tasks remain non-authoritative.
- `[ ]` One exact-base anchor producer precedes start and is reused byte-for-byte by start, landed handoff, and
  cleanup for both fast-forward and merge landing.
- `[ ]` New leaves alone carry an exact optional decomposition-receipt marker; `arc start` validates its landed
  publication, preserves or derives workflow semantics, and removes it only in the successful atomic ceremony;
  ordinary rendering and reconciliation never emit or backfill the field.
- `[ ]` Start consumes one validated atomic graduation transaction that owns branch/worktree, artifact, meta, and
  index mutation/rollback without changing other lifecycle verbs' forward-recovery contract.
- `[ ]` Atomic start preserves supplied Class, managed-field reconciliation, backfill notices, and the existing
  successful `GraduateResult` surface without post-transaction meta writes.
- `[ ]` Finalization is idempotent and refreshes only approved fully staged uncommitted destination refinement
  while preserving byte-identical `initialContinuation`.
- `[ ]` Commit validation, project projection, merge recovery, and exact-base integration anchors consume the same
  canonical v3 authority.
- `[ ]` Shared record enumeration, reference reconciliation, and dependent-disposition queries explicitly consume
  v3 preparation/receipt arms while retained generic transition behavior remains unchanged.
- `[ ]` Final receipts store exact publication entries and typed continuation while live display and readiness stay
  derived.
- `[ ]` Publication entries follow canonical destination-ID order after coordination filtering, and continuation
  preserves the resulting new-leaf subsequence.
- `[ ]` Candidate continuation and landed handoff reuse `resolveLaunchReadiness()` with identical lifecycle,
  shipped-only dependency, and configured-provider semantics; absent or invalid records fail closed.
- `[ ]` Readiness consumes one lossless pinned composition with accepted and rejected record facts, and both paths
  receive the same required typed provider through the shared decomposition dependency bundle; production adapts
  the existing batch provider without changing its public interface.
- `[ ]` Work-unit, draft-block, and document existing destinations publish exact typed identities and are never
  continuation-eligible.
- `[ ]` Finalization consumes one closed continuation file and seals it atomically without an approval credential.
- `[ ]` Plan-derived candidate projection and receipt-validated project authority produce an exact parity-checked
  ROADMAP without circular finalization authority.
- `[ ]` The public landed-handoff command is read-only, refuses candidate-time authority, and returns only typed
  base-rooted facts.
- `[ ]` Full-protection candidates use exact transient ownership claims, never branch-prefix exemptions, and leave
  no live-claim residue after landing or discard.
- `[ ]` Partial-protection anchors encode claim retirement as not applicable and grant cleanup without claim CAS
  only when no unexpected matching claim exists.
- `[ ]` The shipped workflow has one semantic distribution interlock and no operator-authored proof mechanics.
- `[ ]` Real-topology acceptance uses normal initialization, installed hooks, exact-base landing, publication
  handoff, and receipt-backed local cleanup eligibility.
- `[ ]` Ordinary installs remain reviewed and default-off from planning-lane automation.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
