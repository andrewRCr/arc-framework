# Task List: Delivery Plan Record

- **Design:** `spec-delivery-plan-record.md`

---

## Delivery Plan

Hand-authored in the shape the authoring command will later render and replace. No plan record exists yet, so
this section carries no plan revision or digest — the identities below are the author-supplied chunk keys the
eventual record derives from.

_Projection:_ stack-to-`main`. Every member is independently landable and reaches the protected base at member
size, so no pull request in the repository carries the whole contribution.

| # | Member                           | Chunk key          | Phases | Design elements | Predecessor        |
|---|----------------------------------|--------------------|--------|-----------------|--------------------|
| 1 | Record and storage substrate     | `record-substrate` | 1-2    | § 1, § 2        | —                  |
| 2 | Authoring entries and projection | `authoring`        | 3-4    | § 3, § 4        | `record-substrate` |
| 3 | Amendment and guarded state      | `guarded-state`    | 5-7    | § 5, § 6, § 7   | `authoring`        |

**Named seams** — cross-member contracts no single member's review covers:

| Seam                | Incident | Owner | Acceptance                                                                   |
|---------------------|----------|-------|------------------------------------------------------------------------------|
| Refusal parity      | 1, 2     | 2     | Composition adds only the partition check; no refinement is reimplemented    |
| Substrate reduction | 1, 3     | 3     | Plan storage remains; unused assignment, observation, and assurance go away  |
| Rebind obligation   | 1, 3     | 3     | A plan ahead of its bound state blocks every operation until state rebinds   |
| Lookup continuity   | 1, 3     | 3     | Exact reverse lookup moves to state without weakening ambiguity checks       |

_Per-member procedure_ — stated once, applied to every member.

Phases 1 through 4 completed under the original cut. Before Task 5.1 began, the operator authorized the reduced v1
design in `spec-delivery-plan-record.md`; the original remaining tasks are preserved below as superseded and the new
tasks are the implementation authority.

Open member 3 with a full grounding audit over the amended Phases 5 through 7. Cut it from the `main` containing the
first two members. Its implementation head excludes this work unit's metadata, spec, notes, and task list. After the
implementation candidate settles, append those lifecycle artifacts and same-slug archival as a documentation-only
tail on the same terminal pull request. Use the repository's ordinary checks, exact-head pull request, and ARC merge
lock; no separate delivery proof or custom review ledger belongs to this plan. Rationale and the manual runbook live in
`notes-delivery-plan-record.md` § Delivery topology and sequence.

---

## **Phase 1:** The canonical plan record

_Purpose:_ Stand the plan record up as a pure, storage-free artifact — every identity derived through a
registered domain-separated preimage, every refinement re-checkable by a reader holding only the record and its
validated predecessor, and the task and design inventories bound at the granularity the digests can actually see.

_Design decisions:_ `planId` is the one identity minted rather than derived, because its only available preimage
is the mutable work-unit slug. Task digests cover `Goal` alone and stop at parent granularity — the two
properties that make a digest both stable across completion and non-empty on every implementation parent. Full
rationale in `spec-delivery-plan-record.md` § 1 and § 2.

### `[x]` **1.1 Register the delivery schema family**

- _Goal:_ Every delivery record shape is reachable by stable identity and rejects provider bindings, review
  targets, task completion state, and workflow steps as schema errors rather than tolerating them as extra fields.

    - `[x]` **1.1.a Expose one runtime authority for parent task ids**

        - Exported `ParentTaskIdSchema` from the task-list scanner and made both scanner parsing and cursor
          validation consume it, preserving revision-family ids and the numeric-third-segment refusal.

    - `[x]` **1.1.b Plan, member, and seam record schemas**

        - Added strict runtime schemas for the plan, tagged live/landed members, and seams, including closed wire
          vocabulary, canonical identity shapes, safe artifact basenames, first-revision status enforcement, and
          distinct seam incidence.

    - `[x]` **1.1.c Authoring-input schema that omits every derived value**

        - Added a strict authored-input schema that structurally excludes derived values, validates first-revision
          status against an optional predecessor, rejects unknown seam member keys, and resolves authored chunk-key
          incidence through the caller's deliverable-id derivation.

    - `[x]` **1.1.d Registration, domain separation, and production composition**

        - Registered all six strict-current delivery schemas with their fixed identity domains and composed the
          family after review schemas in the production build, with unit, workflow-contract, build, and artifact
          coverage over the exact emitted identity set.

- _Outcome:_ One shared parent-task grammar now feeds strict plan and authoring schemas, and every record and
  domain-separated identity preimage is discoverable from the production kernel bundle rather than only through
  local module imports.

### `[x]` **1.2 Derive plan, deliverable, and assurance-subject identities**

- _Goal:_ A deliverable keeps one identity across every revision of its plan, and renaming the owning work unit
  moves none of them.

    - `[x]` **1.2.a Mint `planId` once and carry it forward**

        - Added injected UUID minting for first authoring and predecessor-based carry-forward that is independent
          of the mutable work-unit slug.

    - `[x]` **1.2.b Derive `deliverableId` from `planId` and `chunkKey`**

        - Added registered-preimage hashing over only the plan and stable chunk key, with duplicate keys refused
          before a plan-ordered identity sequence is derived.

    - `[x]` **1.2.c Derive member and seam `assuranceSubjectId`**

        - Added tagged member and seam derivations through the registered assurance domain, leaving revisions and
          evidence carriers outside identity and keeping seam subjects distinct from incident members.

- _Outcome:_ The minted plan spine survives work-unit renames, while every dependent member and seam identity is a
  deterministic digest of only its stable, domain-separated preimage.

### `[x]` **1.3 Bind the task and design inventories**

- _Goal:_ The inventories carry exactly the content whose movement should invalidate a member, and nothing whose
  movement is ordinary progress.

    - `[x]` **1.3.a Expose the descriptor-extent computation**

        - Exported parent-bound descriptor extents with start/end lines and continuation state, then made the
          spacing validator consume that shared result while preserving staged, indexed, and worktree behavior.

    - `[x]` **1.3.b Extract and digest parent `Goal` text**

        - Added parent-only `Goal` extraction over shared extents, whitespace-normalized semantic text, and
          canonical digests invariant to wrapping, title, progress, peer descriptors, outcomes, and subtasks.

    - `[x]` **1.3.c `inventoryDigest` and the verification-task identity**

        - Extended shared phase events with parsed identity, then bound the normalized implementation inventory and
          its digest separately from the sole parent in the final `Verification` phase, refusing malformed or
          ambiguous structures without a second heading parser.

    - `[x]` **1.3.d Entry-scoped coverage strength**

        - Added one reusable coverage refinement that refuses authored gaps, verification assignment, and revision
          entry changes while preserving retrofit gaps as typed advisories for the whole-record validator.

    - `[x]` **1.3.e Design-element binding across one or two artifacts**

        - Added strict one-or-two-artifact inventory binding with exact revision digests, form-qualified element
          namespaces, duplicate and malformed-input refusal, and complete known-reference coverage that remains
          vacuous for forms enumerating no elements.

- _Outcome:_ Parent `Goal` semantics and caller-owned design elements now form stable, progress-insensitive
  inventories, with verification identity and entry-sensitive coverage carried through reusable refinements.

### `[x]` **1.4 Derive member and seam semantic fingerprints**

- _Goal:_ A changed cross-member contract cannot reconcile as an unchanged bound prefix, while a retitled member
  whose contract is unchanged does not force replacement.

    - `[x]` **1.4.a Member fingerprint over contract, coverage, landability, and incident seams**

        - Bound member fingerprints to contract, referenced task and design semantic digests, landability, and
          canonical incident-seam fingerprints while excluding presentation titles.

    - `[x]` **1.4.b Seam fingerprint and derived scheduling owner**

        - Derived seam fingerprints from exact acceptance and canonical incidence, then normalized incidence into
          plan order and selected the latest incident member as owner with typed structural refusals.

- _Outcome:_ Fingerprints now propagate task, design, landability, and cross-member contract changes to every
  affected live member without treating human labels or authored incidence order as semantic movement.

### `[x]` **1.5 Construct and validate a plan revision**

- _Goal:_ A reader holding only a record and its validated predecessor can re-check every refinement without
  observing the host.

    - `[x]` **1.5.a Canonical construction and normalization**

        - Preserved authored member order, normalized set-like fields, derived registered identities, and computed a
          self-excluding whole-record digest before validation.

    - `[x]` **1.5.b Whole-record refinements**

        - Revalidated inventory binding, digests, uniqueness, coverage, seam scheduling, and projection through a
          closed refusal-code vocabulary.

    - `[x]` **1.5.c The `live` / `landed` discriminant**

        - Re-derived live fingerprints while carrying landed fingerprints, enforcing contiguous conversion and a
          byte-identical frozen prefix.

    - `[x]` **1.5.d Revision lineage**

        - Enforced revision-one null lineage and exact predecessor identity, increment, and digest on successors.

    - `[x]` **1.5.e Project identity, carried but never interpreted**

        - _Goal:_ A supplied project identity survives round-trip untouched, and the record asserts nothing about
          it that no single clone could check.

        - Carried the optional opaque value verbatim through construction and revalidation while keeping it outside
          every delivery identity preimage.

- _Outcome:_ A plan and validated predecessor now suffice to reconstruct and re-check the complete immutable
  revision offline, while landed semantics remain frozen and host observations remain outside the record.

## **Phase 2:** Storage — four ports and the v1 local adapter

_Purpose:_ Give delivery four durable homes that refuse rather than merge, reachable from any checkout and absent
from every tree — the plan, the decisions delivery makes, the append-only landing evidence, and the host
observations — each behind a port, so the storage direction replaces an adapter rather than a design.

_Design decisions:_ The tier test is decision-versus-observation applied field by field, not record by record.
The shipped review-gate store supplies the pattern and the concurrency model but not a callable class — it is
namespace-closed and lives under the scripts tree, which the library tree does not import from. Full rationale in
`spec-delivery-plan-record.md` § 6.

### `[x]` **2.1 Lift the locked repository-common publisher into the library layer**

- _Goal:_ A locked, atomically-replacing publisher is callable from library code without widening what the review
  subsystem already relies on.

    - `[x]` **2.1.a Move the publisher into the library tree**

        - Relocated the publisher class, interface, and closed review namespace to the library layer; review stores
          and six test surfaces now import it directly, while review-specific identity and lock helpers stay private.

    - `[x]` **2.1.b Parameterize the root segment and namespace**

        - Added closed runtime-validated review and delivery locations, authoring-only Markdown names, explicit
          keep/write/delete actions, ENOENT-only deletion, and serialized namespace updates.

- _Outcome:_ Review and delivery storage now share one Git-common publisher without sharing namespace authority;
  transient authoring maps gain an outside-tree home while existing review-store behavior remains intact.

### `[x]` **2.2 Declare the four record ports and their failure classes**

- _Goal:_ Every requirement that must outlive the v1 adapter is phrased against the port, so none reads as
  retracted when the adapter is replaced.

- _Outcome:_ Declared four payload-parameterized behavioral ports with fixed digest/revision tokens, nullable
  absence, explicit runtime codecs, closed domain refusals, reverse lookup, and complete assurance-chain transfer.

### `[x]` **2.3 Publish the plan, assignment, and observation records under their concurrency tokens**

- _Goal:_ A write against a plan digest or record revision that advanced beneath the writer refuses instead of
  merging or overwriting.

    - `[x]` **2.3.a Digest-checked plan publication and revision-checked mutable stores**

        - Published plans by expected digest and assignment and observation snapshots by expected revision, with
          typed malformed, identity, and conflict refusals plus byte-identical replay idempotence.

    - `[x]` **2.3.b No lock-free publish path**

        - Serialized every mutation under the repository-common namespace lock and preserved atomic no-partial-write
          behavior under injected publication failures.

- _Outcome:_ All three current-record stores now share one validate-lock-read-compare-publish discipline; stale
  concurrent writers refuse deterministically without partial replacement.

### `[x]` **2.4 Chain the assurance store by predecessor digest**

- _Goal:_ The one record no live query can reconstruct is tamper-evident in place and carryable to a successor
  adapter without loss.

    - `[x]` **2.4.a Append-only publication by expected predecessor digest**

        - Added domain-separated entry digests over normalized payloads and predecessor pointers, stale-tail
          refusal, and exact replay idempotence in an append-only assurance adapter.

    - `[x]` **2.4.b Export and import across adapters**

        - Added complete-chain export and validate-before-lock import, preserving every entry while refusing
          malformed chains, invalid links, identity mismatches, and non-empty destinations without partial writes.

### `[x]` **2.5 Hold assignment decisions with a monotonic per-subject generation**

- _Goal:_ A generation never restarts for a subject identity a prior clearing verdict already answered for, so an
  earlier review cannot confer authority on materially different later content.

    - `[x]` **2.5.a Assignment record and its decision-bearing contents**

        - Declared a strict assignment record carrying the host and provider binding, terminal source and destination
          refs, and each member's ref, assigned head, change-request handles, review routing, and generation.

    - `[x]` **2.5.b Store-enforced generation high-water mark**

        - Retained per-subject high-water marks outside the live member map and rejected unchanged generations on
          rematerialization plus any teardown or reauthoring proposal that lowers a previously issued mark.

- _Outcome:_ Assignment decisions now have one validated source for later state reduction and reverse lookup, while
  review generations remain monotonic even when their live member binding is absent.

### `[x]` **2.6 Resolve a plan and member from a bare member checkout**

- _Goal:_ A session occupying a member ref learns which plan, member, and owning work unit it is on before it
  knows which plan to read, from a checkout carrying none of that unit's artifacts.

    - `[x]` **2.6.a Reverse lookup by repository and head or ref**

        - The assignment port now scans its validated repository-common namespace for exact head or stored
          ref-and-observed-head matches, returns negative and ambiguous results explicitly, and lets a validated
          owning-unit pointer bypass enumeration without treating the pointer as identity proof.

    - `[x]` **2.6.b Resolve a unit's existing plan forward through the rename chain**

        - A delivery-owned traversal now consumes validated plan enumeration and authenticated retirement
          transitions, follows unique renames transitively, treats terminal and cyclic histories as safe absence,
          and preserves ambiguous, corrupt, unreachable, and unestablished evidence as indeterminate.

    - `[x]` **2.6.c Prove lookup from an artifact-free linked worktree**

        - Real-Git integration coverage now publishes records from a primary checkout and resolves exact,
          ambiguous, unmatched, renamed, cyclic, and unestablished cases from an artifact-free linked worktree
          against explicitly established retirement evidence.

- _Outcome:_ Repository-common assignment and plan queries now recover member-session position without lifecycle
  artifacts or branch-name inference, while only authoritative absence permits a caller to mint a new plan.

## **Phase 3:** The authoring spine and the plan projection

_Purpose:_ Make authoring two-phase and drift-detecting — a machine section checked against CLI-owned canonical
state, an explicit slot for every irreducible judgment, one composition verb both entries feed, and a human-readable
rendering of what was published that no workflow ever parses back — and stand the command group up so those verbs
are invocable rather than library functions nothing reaches.

_Design decisions:_ Which judgments are irreducible is computed and presented rather than described in prose, so
the slot skeleton is the contract. Composition validates that a boundary is well-formed and never that it is
well-chosen. Full rationale in `spec-delivery-plan-record.md` § 3 and § 4.

### `[x]` **3.1 Emit the starter map**

- _Goal:_ An author receives every derived fact already computed and exactly one slot per judgment only they can
  make, in a form that cannot be confused with a delivery record.

- _Context:_ The map is transient authoring state — it exists before a plan does and is discarded once composition
  succeeds or an explicit abandonment does. It rests beside the delivery records under the same local root rather
  than in the working tree, so it is structurally incapable of landing in the work unit's change set.

- _Shape:_ The authoring state is a pair: a CLI-owned canonical JSON snapshot pins every input and derived fact,
  while a Markdown map repeats its machine section and carries the prose slots an author edits. Composition takes
  no path operand because `3.1.c` resolves the singleton pair from the work unit. The integrity boundary detects
  ordinary edits and drift by comparing the Markdown with the snapshot; it does not claim resistance to a hostile
  operator who rewrites both local files.

    - `[x]` **3.1.a Machine section carrying every derived fact and identity**

        - Done when the canonical snapshot carries exactly the derived set `1.1.c` enumerates plus the entry's own
          inputs, and the Markdown machine section reproduces that material in a form `3.2.a` can compare.

        - Build `test-first` (one behavior at a time):
            - The JSON and Markdown files are published as one authoring pair
            - The snapshot pins the design inventory, task list or Git coordinates, facts, identities, and order
            - A partial pair without a matching composed-plan receipt refuses as corrupt authoring state

        - _Outcome:_ Added a strict canonical snapshot over source inputs, facts, inventories, and ordered
          identities; published it with its Markdown peer under one namespace lock; repeated its immutable machine
          material in the map; and refused a torn pair as corrupt authoring state.

    - `[x]` **3.1.b Authoring section as a skeleton of explicit slots**

        - The boundary slot takes a discriminated value — an alignment arm the composer expands mechanically, or
          an arm carrying explicit boundaries.

        - Build `test-first` (one behavior at a time):
            - Every irreducible judgment has exactly one slot
            - No boundary slot arrives pre-filled with a derived partition
            - The landability assertion is an author slot, never manufactured

        - _Outcome:_ Emitted one strict author-slot object for projection, boundary choice, member judgments, and
          seams; the starter leaves every arm visibly unfilled and exposes landability only inside authored member
          values, with no editable or pre-filled seam owner.

    - `[x]` **3.1.c Single outstanding map per unit**

        - The map exists before a plan does, so it cannot key on `planId`, and the work-unit slug it records is
          mutable while the unit is live. Extract a storage-independent forward subject resolver from `2.6.b`;
          plan and authoring stores both enumerate their records and resolve each recorded original subject through
          authenticated retirement transitions to the current work unit.

        - Build `test-first` (one behavior at a time):
            - A second map for the same unit refuses while one is outstanding
            - A rename while a map is outstanding still resolves to the same outstanding map
            - Chained rename, terminal retirement, cycle, corrupt, ambiguous, unreachable, and unestablished
              authority cases preserve the plan resolver's established refusal and safe-absence semantics
            - Abandoning a map idempotently deletes both files and clears the outstanding state

        - _Outcome:_ Reused the payload-neutral forward resolver over enumerated authoring snapshots, enforcing one
          map through direct and chained renames while preserving safe absence and indeterminate authority; explicit
          abandonment now deletes complete or JSON-only cleanup state in Markdown-first order and is idempotent.

- _Outcome:_ Authoring now begins from one outside-tree, rename-stable JSON/Markdown pair whose machine material is
  pinned, whose author judgments begin visibly unfilled, and whose complete or cleanup-torn lifetime is managed as
  one singleton per work unit.

### `[x]` **3.2 Refuse a record no author authored**

- _Goal:_ The three ways a map can arrive un-authored each refuse with their own code, so an author's judgment is
  the only thing composition can be carrying.

- _Note:_ Covered directly rather than inferred from composition's success path — these refusals are the
  mechanism that makes an authored judgment trustworthy.

    - `[x]` **3.2.a The three typed refusals**

        - Build `test-first` (one behavior at a time):
            - A map that does not parse refuses before any slot is inspected
            - An unfilled slot refuses with its typed code
            - A mutated derived value refuses with its typed code
            - A seam owner supplied by the author is one such mutated value, since the owner is derived
            - A reordered identity sequence refuses with its typed code
            - A map whose machine and authored identity sequences still match validates
            - Editing only the JSON snapshot is detected by the same comparison boundary

        - _Outcome:_ Added a deterministic sentinel-bounded Markdown codec and integrity boundary that refuses
          malformed maps, unfilled slots, derived mutations, and identity reordering distinctly before record
          construction, including JSON-only drift and attempted author ownership of a derived seam.

- _Outcome:_ Composition now receives only a completely filled author-slot object whose immutable machine material
  still matches the CLI-owned snapshot; every un-authored or drifted state stops with a stable typed reason.

### `[x]` **3.3 Validate and publish through `arc delivery compose`**

- _Goal:_ One composition verb serves both entries, so the part that must not fork does not fork.

- _Shape:_ Composition proves well-formedness — contribution steps covered exactly once and contiguous, every
  implementation task covered or surfaced as an advisory — and never well-chosenness, which belongs to the
  selected projection's eligibility test.

    - `[x]` **3.3.a Partition and coverage composition checks**

        - The composer is entry-agnostic and validates a filled map, so these behaviors run against
          hand-constructed step sequences rather than the derivation `4.2` builds.

        - Build `test-first` (one behavior at a time):
            - Contribution steps covered more than once refuse
            - A non-contiguous member refuses
            - An uncovered implementation task refuses on the authored entry and advises on the derived one
            - The advisory names the task and the member whose coverage adjoins it in inventory order, leaving
              the call with the author
            - A member with an empty `taskIds` is admissible when every task is covered somewhere

        - _Outcome:_ Added entry-neutral checks requiring contribution steps to occur exactly once in ordered,
          contiguous member segments; retained authored-entry coverage refusals and enriched retrofit gaps with the
          nearest represented member in inventory order while admitting task-empty members.

    - `[x]` **3.3.b Uniqueness refinement at publication**

        - Build `test-first` (one behavior at a time):
            - Minting a second plan for a unit that already has one refuses
            - Replacement produces a new revision under the same `planId`, never a second plan

        - _Outcome:_ Composition now resolves existing plans through the shared rename authority, refuses a
          different plan identity for the same unit, and constructs replacements as successors under the original
          `planId` and exact predecessor digest.

    - `[x]` **3.3.c Publish against the expected current plan digest**

        - Build `test-first` (one behavior at a time):
            - A first publication succeeds with no predecessor
            - A successor names its predecessor's digest and succeeds
            - A stale expected current digest refuses
            - A publication refusal leaves the task list untouched and the authoring pair retryable
            - Construction records the candidate plan digest in the snapshot before publication
            - Rendering follows publication; render failure leaves the pair retryable and same-plan retry is
              idempotent
            - Cleanup deletes Markdown first and the canonical snapshot last; a failure between deletes leaves the
              snapshot and pinned candidate plan digest sufficient for retry

        - _Outcome:_ Added the receipt-first composition sequence: construct and pin the candidate digest, publish
          by expected-current CAS, render only after success, then delete Markdown before JSON. Stale and failed
          publications leave rendering untouched; render and cleanup tears retry the same plan idempotently.

- _Outcome:_ Both authoring entries can now feed one entry-neutral composer that proves the contribution partition
  and coverage contract, enforces plan uniqueness, publishes by digest, renders only the published record, and
  preserves enough authoring state to recover every post-receipt failure.

### `[x]` **3.4 Render the delivery-plan section into the task list**

- _Goal:_ A reader sees the published plan's shape without any workflow or reducer ever reading the rendering
  back.

- _Note:_ The section is informative and replaceable; per-task delivery tags would create a second authority and
  are not emitted.

    - `[x]` **3.4.a Ordered member table and named-seam table**

        - Build `test-first` (one behavior at a time):
            - First publication replaces one unmarked top-level `Delivery Plan` section and installs exact start
              and end sentinels
            - Subsequent publication replaces only the sentinel range, leaving surrounding content untouched
            - An absent, duplicate, or malformed replacement locus refuses without changing the task list
            - A single-deliverable plan renders the same shape with one row
            - A task appearing against more than one member is marked shared rather than restructured
            - A landed member renders its as-of-landing values with an explicit marker
            - The landability column renders under `stack-to-main` and is omitted otherwise

        - _Outcome:_ Added a write-only projection that bootstraps one exact top-level section, thereafter replaces
          only its sentinel range, refuses every ambiguous or malformed locus before writing, and renders ordered
          members, shared tasks, landed markers, conditional landability, and named seams from the validated plan.

- _Outcome:_ Published delivery intent can now replace its informative task-list projection atomically while all
  surrounding bytes remain untouched and no reader treats the rendering as authority.

### `[x]` **3.5 Register the `arc delivery` command group**

- _Goal:_ The verbs the design fixes exist as invocable commands with the project's own registration obligations
  met, rather than as library functions nothing reaches.

    - `[x]` **3.5.a Stand up the group and register `compose` and `plan abandon`**

        - Registered the group and both verbs through the handler and input-policy composition surfaces; real-CLI
          coverage proves typed JSON refusals, inventory completeness, idempotent abandonment, and torn-state
          cleanup.

- _Outcome:_ The authoring spine is reachable through one command family, with structured refusal behavior and a
  recovery-safe cleanup path ready for both authoring entries to consume.

## **Phase 4:** The two authoring entries

_Purpose:_ Feed that spine from both sources as peers — a task plan before implementation, and a branch's own
change structure afterwards — prove the retrofit entry against the two deliveries actually run by hand, which
is the check this design is most at risk of failing, give an author the one signal that invoking it is worth
considering at all, and leave the shipped sizing doctrine consistent with the invariant this record establishes.

_Design decisions:_ The entries are named by source rather than timing, so neither reads as remedial, and they
are sibling subcommands rather than one verb with a mode flag. Retrofit is first-class because it is the entry
every delivery cut with field evidence actually used. Full rationale in `spec-delivery-plan-record.md` § 3.

### `[x]` **4.1 Author boundaries from a task plan (`from-tasks`)**

- _Goal:_ An author drawing boundaries before implementation states them once, and phase alignment is available
  as a mode they select rather than a partition filled in on their behalf.

    - `[x]` **4.1.a Machine section from the task inventory and design inventory**

        - Prepared the starter pair only after strict design binding and canonical task extraction; the machine
          facts preserve the flat inventory, derive phase groups from scanner events, and mark the verification
          parent explicitly ineligible for membership.

    - `[x]` **4.1.b Mechanical expansion of the alignment arm**

        - Resolved the selected arm into the entry-neutral composition projection: phase alignment zips members to
          scanner-derived groups, while explicit segments retain their authored source sequence. Starter maps select
          neither arm, and cross-phase members require no additional field.

    - `[x]` **4.1.c Register `plan from-tasks` and close the loop end to end**

        - _Goal:_ A plan authored from a real task list reaches a published record and a rendered section through
          the shipped commands, not through test harness calls.

        - Registered the schema-owned subcommand and wired a built-CLI round trip from strict file input through
          paired state, composition, canonical publication, task-list rendering, and cleanup. Invalid input,
          uncovered contribution, and verification membership refuse before an invalid plan can publish.

- _Outcome:_ Pre-implementation authoring now states boundaries once in a transient map, while the command path
  derives every task/design fact and delegates the shared publish/render transaction to the authoring spine.

### `[x]` **4.2 Partition a branch's first-parent contribution (`from-branch`)**

- _Goal:_ A cut authored over a real branch partitions the work unit's own contribution, with base merges
  carrying no membership.

    - `[x]` **4.2.a First-parent traversal from base to head**

        - Pinned the selected coordinates, found the original first-parent divergence after base absorbs, and emitted
          one ordered transition per first-parent step. Invalid coordinates and missing or disconnected boundaries
          return typed refusals.

    - `[x]` **4.2.b Contribution versus ambient base absorb**

        - Classified a selected-base merge as ambient only when an exact remerge-tree proof matches its committed
          tree. Ambient steps remain ordering landmarks without membership; unprovable conflict resolutions refuse.

    - `[x]` **4.2.c Per-step and cumulative change shape**

        - Reused canonical `ChangeSet` facts for every step and accumulated only contribution paths in byte order,
          preserving arbitrary Git path bytes and both rename or copy endpoints.

    - `[x]` **4.2.d Register `plan from-branch`**

        - Registered the schema-owned command with configured-base and `HEAD` defaults plus explicit overrides.
          The real CLI persists, composes, publishes, renders, and cleans a branch-derived map while uncovered task
          coverage remains advisory.

- _Outcome:_ Retrofit authoring now pins the original contribution across base absorbs, keeps proven ambient merges
  as membership-free landmarks, and partitions canonical contribution steps through the same publication spine as
  task-derived authoring.

### `[x]` **4.3 Normalize attributed task references to the parent inventory**

- _Goal:_ Membership derives from what task ids actually are in practice, not from what the footer grammar
  admits, so a real branch's attributions are not discarded.

    - `[x]` **4.3.a Upward resolution to the nearest enclosing parent**

        - Exported one structured parser shared by commit validation and delivery. Branch attribution expands
          ranges and lists, resolves references to the nearest current parent, retains revision parents, and reports
          stale references without deriving membership from another work unit's task list.

    - `[x]` **4.3.b At-least-once semantics preserved**

        - Derived each member's represented parents from its contribution commits without imposing ownership;
          repeated parent membership across members remains admissible, and source advisories survive publication
          cleanup retries.

- _Outcome:_ Retrofit membership now reflects the full enforced footer grammar while remaining inventory-bound:
  sparse or stale history stays author-visible, and repeated evidence across delivery members is preserved.

### `[x]` **4.4 Report co-change structure and lifecycle-artifact touches**

- _Goal:_ An author drawing boundaries sees file-level co-change and which steps touch the unit's own lifecycle
  artifacts, with neither turned into a constraint.

    - `[x]` **4.4.a File-level co-change structure across contribution steps**

        - Added canonical unordered path-pair reports with byte-sorted contribution commit ids. The report derives
          only from canonical contribution changes, including rename and copy endpoints; ambient absorbs add no
          edges and no boundary recommendation is inferred.

    - `[x]` **4.4.b Lifecycle-artifact touches reported and never enforced**

        - Reported contribution steps that touch the unit's metadata, design, notes, or task-list artifacts in the
          authoring facts. Library and built-CLI coverage prove those facts remain informative and do not block a
          cut from composing.

### `[x]` **4.5 Reconstruct both hand-run deliveries as authored plans**

- _Goal:_ The two deliveries that were actually executed by hand round-trip through the retrofit entry, producing
  plans whose members carry the boundaries shipped and whose seams match the ones those runs recorded, with no
  fabricated task partition.

- _Amendment:_ The parent triples remain immutable evidence, but seven raw PR-head histories contain base-merge
  steps whose purity strict inspection cannot establish and correctly refuses. The `a0e6d1533` case is confirmed
  to contain authored conflict resolution. Reconstruct each historical member as the atomic net transition from
  its recorded first parent to its landed merge result, verify the merge/base/head triple separately, and retain a
  synthetic proven-pure base absorb for the contribution-only partition criterion.

    - `[x]` **4.5.a Reconstruct the seven-slice cut**

        - Pinned all seven PR merge/base/head triples, replayed every landed result as an atomic net transition,
          and reconstructed the plan shape without task membership.

    - `[x]` **4.5.b Reconstruct the completed rolling session-locus delivery**

        - Pinned and replayed all 21 landed delivery/corrective rows from the durable ledger; the superseded standing
          stack and bespoke closeout remain outside the plan fixture.

    - `[x]` **4.5.c Validate both reconstructions against the record's refinements**

        - Added repository-history integration coverage for coordinate, landed-transition, strict-refusal, seam,
          and closeout behavior plus real-CLI temporary-repository coverage for both complete plan shapes and a
          proven-pure ambient absorb.

- _Outcome:_ Both field deliveries now round-trip as validating `from-branch` plans with empty task membership and
  later-member seam ownership. Historical mixed merges remain strict refusals instead of losing authored delta,
  while landed-result replay and a synthetic pure absorb cover the two distinct evidence cases.

### `[x]` **4.6 Surface delivery-plan candidacy at the design-stage boundary read**

- _Goal:_ An author whose concern stayed one work unit while the separable-surfaces signal fired learns that a
  delivery plan serves that shape, at the moment the judgment is already being made.

    - `[x]` **4.6.a Add the candidacy note to the boundary test's stays-one-unit arm**

        - Added one conditional, non-gating advisory to the method's "stays one WU" output: it surfaces only when
          the existing distinct-deliverables or independently-reviewable-surfaces signal fired and otherwise emits
          nothing.

### `[x]` **4.7 Reconcile the shipped sizing doctrine with the delivery invariant**

- _Goal:_ The shipped sizing guidance no longer contradicts the invariant that one work unit carries one delivery
  plan emitting at least one pull request.

    - `[x]` **4.7.a Correct the stack-versus-cohort statement at both loci**

        - Recast both shipped sizing bullets around orthogonal identities: stacks order deliverables, cohorts group
          sibling work units, and either a cohort or one work unit's delivery plan may carry dependency order.

### `[x]` **4.8 Reconcile the shared cohort record with the settled substrate**

- _Goal:_ Sibling work units reading the shared cohort coordination inherit the delivery contracts and field status
  this member actually establishes, without changing conclusions that remain valid on independent grounds.

    - `[x]` **4.8.a Correct the inherited premises and completed field status**

        - Preserved the segment-refinement and landability conclusions while replacing exclusive task-order
          premises with at-least-once membership and authored member-array order.
        - Separated assignment-owned refs and change-request handles from observation-owned exact Git facts.
        - Updated field status to both completed hand runs, including the 21-row rolling session-locus delivery
          before bespoke closeout.

## **Phase 5:** Intent-only revisions and amendment

_Purpose:_ Remove provider position and assurance mechanics from the plan, then classify amendments against explicit
binding and freshly observed landed-prefix facts.

_Design decisions:_ The original Phase 5 was superseded before implementation by the proportional v1 amendment in
`spec-delivery-plan-record.md`. Its task and Goal text remain below as the audit trail; Tasks 5.5 and 5.6 are the
current work.

### `[~]` **5.1 Determine when a plan becomes bound**

- _Goal:_ Binding follows external dependency, so authoring iterations and locally-built candidate heads cost
  nothing.

    - `[~]` **5.1.a Bind on the first pushed member ref or opened change request**

        - Superseded as a standalone task; binding now enters the single-state contract in Task 5.6.

- _Outcome:_ Superseded before implementation when binding became state existence rather than plan state.

### `[~]` **5.2 Sort a proposed revision into absorb, refuse, or replacement**

- _Goal:_ Each outcome matches what is physically possible at that point in the series, so discovered work is not
  punished and shipped work cannot be re-described.

    - `[~]` **5.2.a Classify metadata amendment ahead of the three arms**

        - Superseded by one three-outcome classifier in Task 5.6.

    - `[~]` **5.2.b The absorb arm**

        - Superseded by the `accepted` outcome in Task 5.6.

    - `[~]` **5.2.c The refuse arm**

        - Superseded by the `refused` outcome in Task 5.6.

    - `[~]` **5.2.d The replacement arm**

        - Superseded by the `replacement-required` outcome in Task 5.6.

    - `[~]` **5.2.e Reactive insertion**

        - Superseded; v1 does not persist or classify amendment causes separately from their mechanical outcome.

- _Outcome:_ Superseded before implementation to remove metadata and reactive-insertion arms and generation effects.

### `[~]` **5.3 Freeze a landed member through the conversion revision**

- _Goal:_ A landed member's values stop moving for reasons outside itself, so amending the spec after the first
  landing is possible and re-cutting the suffix does not fire refuse.

    - `[~]` **5.3.a Conversion as a distinct, obligatory event**

        - Superseded; provider position no longer enters the immutable plan.

    - `[~]` **5.3.b Byte-identity against the first frozen form**

        - Superseded; landed semantics are protected by amendment classification against fresh host facts.

- _Outcome:_ Superseded before implementation; current fingerprints rederive and no frozen member form exists.

### `[~]` **5.4 Carry crossing-seam obligations and emit the design-drift advisory**

- _Goal:_ Re-cutting the unlanded suffix cannot orphan a seam's acceptance, and drift on shipped work surfaces as
  an adjusting entry rather than a validity failure.

    - `[~]` **5.4.a Seams spanning the landed boundary**

        - Superseded as written; Task 5.6 retains the seam-preservation invariant without a conversion revision.

    - `[~]` **5.4.b Design drift on landed work as a typed advisory**

        - Superseded; v1 creates no durable historical design-drift surface.

- _Outcome:_ Superseded before implementation; only the crossing-seam safety invariant remains.

### `[ ]` **5.5 Make the canonical plan intent-only**

- _Goal:_ A plan revision describes current delivery intent without copying provider position or minting identities
  that no v1 consumer addresses.

    - `[ ]` **5.5.a Collapse member and seam schemas**

        - Remove `live` / `landed`, `assuranceSubjectId`, and the assurance-subject preimage while retaining stable
          `deliverableId`, current semantic fingerprints, strict registration, and revision lineage.
        - Update the exact schema-family, generated-schema, build, and artifact expectations in the same increment;
          do not leave their removal for the end-to-end task.
        - Build `test-first` around strict rejection of the removed fields and revalidation of current intent.

    - `[ ]` **5.5.b Simplify construction and revision validation**

        - Re-derive every member and seam fingerprint on every revision, remove frozen-prefix and conversion logic,
          and keep plan validation independent of host or state access.
        - Build `test-first` around identity stability, digest movement, and exact predecessor lineage.

    - `[ ]` **5.5.c Reconcile authoring and the task-list projection**

        - Remove authored status and landed-history rendering from maps, composition, fixtures, and CLI output while
          preserving the two authoring entries and idempotent publication sequence.

### `[ ]` **5.6 Classify binding and amendment from explicit facts**

- _Goal:_ Post-binding changes receive the smallest safe outcome from immutable revisions plus current external facts,
  without a fourth cause taxonomy or historical advisory stream.

    - `[ ]` **5.6.a Define binding and classifier inputs**

        - Treat state existence as binding, triggered only by the first pushed member ref or opened change request;
          local candidate construction remains unbound.
        - Accept exact bound deliverable ids and a freshly observed plan-ordered landed prefix as caller-supplied facts.

    - `[ ]` **5.6.b Return `accepted`, `replacement-required`, or `refused`**

        - Accept presentation changes anywhere, additive coverage on non-landed members, and structurally valid
          unbound-suffix changes.
        - Require replacement for moved or removed existing coverage and contract, landability, incidence, order, or
          identity changes affecting a bound unlanded member; refuse the corresponding landed-member changes.
        - Build `test-first` around those cases and projection changes before and after landing.

    - `[ ]` **5.6.c Preserve crossing-seam obligations**

        - Refuse removal of a landed-side incident or changed acceptance across the landed boundary while allowing the
          unlanded side to re-cut through `replacement-required`.

## **Phase 6:** One delivery state and guarded operations

_Purpose:_ Replace the unused multi-record substrate with one version-checked state, exact reverse lookup, and one
operation reservation that later topology executors can reconcile after interruption.

_Design decisions:_ The original Phase 6 split decisions from observations and introduced review-generation plumbing.
It was superseded before implementation. Current state stores only selected bindings, latest exact coordinates, and one
active operation; provider status and review authority are reobserved.

### `[~]` **6.1 Hold delivery state as transition-bearing facts**

- _Goal:_ Current position, predecessor consumption, and terminal readiness all derive from what the record
  holds, and nothing control-bearing is trusted from a copied provider status.

    - `[~]` **6.1.a State record and its plan binding**

        - Superseded by the reduced state in Task 6.5.

    - `[~]` **6.1.b The single active-operation slot**

        - Superseded as written by the smaller reservation in Task 6.6.

    - `[~]` **6.1.c Declare the verdict-request port**

        - Superseded; delivery no longer requests or stores review verdict identities.

- _Outcome:_ Superseded before implementation when assignment and observation records collapsed into one state.

### `[~]` **6.2 Order one host operation against its stores**

- _Goal:_ A crash leaves the operation either replayable or already durably recorded, never ambiguous about
  whether the decision was made.

    - `[~]` **6.2.a Reserve, invoke, observe, publish decisions, record observations, clear**

        - Superseded by a single-state reserve, reobserve, mutate, reobserve, and clear sequence.

    - `[~]` **6.2.b Retry, reconcile, and blocked outcomes**

        - Superseded as written; the exact applied, not-applied, and ambiguous cases remain in Task 6.6.

- _Outcome:_ Superseded before implementation because no cross-store commit order remains.

### `[~]` **6.3 Derive the landed prefix and admit a transition**

- _Goal:_ A requested transition is admitted only when every control-bearing fact currently agrees, and a false
  landing assertion in the plan is caught at the only layer that observes the host.

    - `[~]` **6.3.a Derive `landedPrefix` and `firstUnlanded` from host observations**

        - Superseded as written; the derived-position behavior remains in Task 6.7.

    - `[~]` **6.3.b The six admissibility conditions**

        - Superseded; v1 has no plan discriminant, generation, verdict-request port, or terminal landing intent.

- _Outcome:_ Superseded before implementation in favor of executor-supplied current facts and narrow guard results.

### `[~]` **6.4 Reconcile drift without remapping deliverables**

- _Goal:_ A changed base, head, or membership forces reconciliation rather than passing through as close enough,
  and no review evidence is silently discarded.

    - `[~]` **6.4.a Reconcile before any further readiness verdict**

        - Superseded as written; exact-coordinate reconciliation remains without generations or copied review evidence.

- _Outcome:_ Superseded before implementation; Task 6.6 carries the smaller exact-result contract.

### `[ ]` **6.5 Replace four delivery stores with plan plus state**

- _Goal:_ Delivery persists exactly the authored plan and one current mutable state, with stale writers refusing and
  member lookup working from any linked checkout.

    - `[ ]` **6.5.a Define `DeliveryStateV1` and its codec**

        - Bind the plan's original authored subject, exact revision and digest, plan-ordered deliverable ids, optional
          target refs, member refs, change requests, one destination head/tree set, one source base/head/tree set per
          member, and either one active operation or none.
        - Reject copied provider status, review verdicts, generations, and extra fields at the runtime boundary.
        - Register the state schema `strict-current` and update exact schema-family, generated-schema, build, and
          artifact expectations in this increment.
        - Add a pure plan-coherence validator for subject, revision, digest, member identity, and member order; keep the
          structural codec and store plan-agnostic.

    - `[ ]` **6.5.b Publish state by expected revision**

        - Add one storage-agnostic state port and one repository-common `state` adapter with nullable read, idempotent
          same-value publication, version conflict, identity checks, and corrupt-namespace refusal.

    - `[ ]` **6.5.c Move exact reverse lookup to state**

        - Resolve an exact ref plus the head in its sole coordinate set, or an unambiguous exact head, to plan, the
          stored original work-unit subject, and deliverable; validate but never trust an optional owning-unit pointer.
        - Reuse the authenticated rename resolver when a caller needs the current work-unit slug.

### `[ ]` **6.6 Guard and reconcile one active operation**

- _Goal:_ An interrupted external mutation is either safely retryable, exactly adoptable, or explicitly blocked, with
  no competing operation and no historical evidence ledger.

    - `[ ]` **6.6.a Reserve one exact operation**

        - Build `test-first` around stale state, stale plan binding, a second reservation, unknown deliverables, and
          exact source and destination coordinates for each supported operation kind.
        - Accept a caller-minted opaque operation id; the one-slot invariant supplies all uniqueness v1 needs.

    - `[ ]` **6.6.b Compare fresh pre- and post-mutation facts**

        - Return ready only when reobserved coordinates equal the reservation and accept only the exact requested
          result after mutation; every partial result remains blocked.

    - `[ ]` **6.6.c Reconcile interruption**

        - Adopt an exact already-applied result, permit retry after exact non-application, and leave partial, extra,
          reordered, or otherwise ambiguous movement blocked for explicit remedy.

### `[ ]` **6.7 Derive current delivery position**

- _Goal:_ Callers receive current plan position and refusal reasons from fresh facts without writable aggregate status
  or a terminal proof record.

    - `[ ]` **6.7.a Derive prefix and suffix labels**

        - Derive `landedPrefix`, `firstUnlanded`, and bound suffix from plan order, state bindings, and supplied host
          facts; reject missing, duplicate, reordered, or foreign members.

    - `[ ]` **6.7.b Block stale or ambiguous readiness**

        - Refuse when state binds a different plan revision, exact coordinates moved, an operation is unresolved, or
          the selected member lacks the plan's relevant landability assertion.
        - Leave checks, review settlement, provider capability, and final integration authority to their owners.

## **Phase 7:** Reduced-contract integration

_Purpose:_ Wire authoring and state together, remove the unused assurance-era substrate, and prove the reduced contract
against both historical authoring entries and linked-worktree recovery.

_Design decisions:_ The original terminal-proof phase was superseded before implementation. Current closeout derives
readiness and uses ordinary work-unit verification; it emits no delivery-owned evidence chain.

### `[~]` **7.1 Bind an immutable landing intent**

- _Goal:_ Every control-bearing fact a landing depends on is fixed before the interlock, and any change to one of
  them invalidates the intent rather than being absorbed.

    - `[~]` **7.1.a The pre-mutation contract**

        - Superseded by the active-operation reservation in Task 6.6.

    - `[~]` **7.1.b Re-observation immediately before mutation**

        - Superseded as a standalone proof step; immediate reobservation remains part of the guarded operation.

- _Outcome:_ Superseded before implementation; v1 keeps a resumable reservation, not a second immutable intent.

### `[~]` **7.2 Emit an immutable landing observation**

- _Goal:_ An interrupted or uncontracted land contributes nothing to the chain, so position is re-derived from
  host observations rather than from an interrupted operation's paperwork.

    - `[~]` **7.2.a The post-mutation fact**

        - Superseded; state records only current exact coordinates after successful reconciliation.

- _Outcome:_ Superseded before implementation; Git and the host retain history and delivery keeps current state.

### `[~]` **7.3 Prove membership and tree-exactness**

- _Goal:_ The ordered landings are shown to compose the planned membership exactly, with the trees carrying no
  work-unit-owned delta the plan does not account for.

    - `[~]` **7.3.a The five terminal verifications**

        - Superseded as a terminal record; exact membership and tree checks remain derived closeout inputs.

    - `[~]` **7.3.b Verdict identities recorded, never evaluated**

        - Superseded; review evidence remains entirely review-owned.

- _Outcome:_ Superseded before implementation; ordinary verification consumes current exact facts without a chain.

### `[~]` **7.4 Emit the terminal contribution chain**

- _Goal:_ A terminal record exists only in proven form, and its name and contents make clear it authorizes
  nothing.

    - `[~]` **7.4.a The proven-form-only record**

        - Superseded; v1 emits no terminal delivery record.

- _Outcome:_ Superseded before implementation by derived closeout plus ordinary work-unit verification.

### `[ ]` **7.5 Integrate bound amendment with state**

- _Goal:_ Composition publishes only a safe plan revision and cannot leave a stale bound state eligible for another
  operation.

    - `[ ]` **7.5.a Route composition through binding and amendment classification**

        - Publish freely when no state exists; after binding, return the classifier outcome before mutation and keep
          the authoring pair for `replacement-required` or `refused`.

    - `[ ]` **7.5.b Publish accepted plan then rebind state**

        - Preserve the existing candidate receipt, then publish plan, rebind state when present, render the task-list
          projection, delete Markdown, and delete the canonical snapshot in that exact order.
        - Use plan-digest and state-revision compare-and-swap, make retry idempotent after each durable step, and block
          all operations while the plan and state bindings disagree.
        - Build failure-injection coverage for interruption after candidate receipt, plan publication, state rebind,
          render, and each cleanup deletion.

    - `[ ]` **7.5.c Retire obsolete delivery contracts**

        - Remove assignment, observation, and assurance schemas, stores, namespaces, exports, and dedicated tests;
          move only reverse lookup and current bindings into state.

### `[ ]` **7.6 Prove the reduced contract end to end**

- _Goal:_ Both authoring entries and the new state lifecycle work from real repository coordinates, while removed
  proof-system surfaces cannot leak back through fixtures or public exports.

    - `[ ]` **7.6.a Re-run both field reconstructions**

        - Preserve the seven-member and rolling-session fixtures, including strict ambient-merge refusal, under the
          intent-only record.

    - `[ ]` **7.6.b Exercise linked-checkout state and crash cases**

        - Prove repository-common visibility, exact reverse lookup, stale-write refusal, already-applied adoption,
          not-applied retry, and ambiguous-result blocking.

    - `[ ]` **7.6.c Close CLI, build, and artifact coverage**

        - Update handler and E2E coverage, confirm the already-updated registry, build, and emitted artifacts expose only
          the reduced schema family, and run the complete Phase 5 through 7 gate set before member cut.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[x]` Both hand-run deliveries reconstruct through `from-branch` — the seven-slice cut and the 21-row rolling
  session-locus delivery each produce a validating plan whose members carry the boundaries actually shipped and
  whose seams match the recorded runs, with no fabricated task partition; bespoke session-locus closeout remains
  outside the plan

  _Amendment:_ Historical members reconstruct from first parent to landed merge result as atomic net transitions;
  recorded merge/base/head triples are verified separately because strict inspection correctly refuses unproved
  base-merge purity in seven raw PR-head histories.

- `[ ]` A `from-tasks` plan against a current task list and validated design inventory publishes and renders its
  task-list projection, with an uncovered implementation task refused at composition and the verification task
  refused as a member

- `[~]` A member's `deliverableId` is unchanged across an amendment that alters titles, adds coverage, and
  relabels positions; renaming a `chunkKey` on a bound member is refused

  _Superseded:_ Position labels were removed from the immutable plan; the replacement criteria below retain identity
  stability and bound-member protection without that field.

- `[~]` The three reconcile outcomes sort correctly against a bound plan — coverage addition absorbs, coverage
  move refuses, altering a frozen member fails byte-identity, and re-cutting the bound-unlanded suffix produces a
  replacement whose landed prefix is byte-identical and whose crossing seams retain their acceptance statements

  _Superseded:_ The amended classifier uses `accepted`, `replacement-required`, and `refused`; no frozen plan member
  or byte-identical landed prefix exists.

- `[~]` A conversion revision validates when the converting member equals its predecessor's payload modulo the
  discriminant, and is refused when it does not

  _Superseded:_ Provider position no longer enters the plan, so no conversion revision is emitted.

- `[~]` Tearing down a member and re-authoring the same `chunkKey` yields a generation strictly greater than any
  previously issued for that subject

  _Superseded:_ V1 has no assurance subject or materialization generation.

- `[ ]` The starter map refuses an unfilled slot, a machine section differing from its CLI-owned canonical
  snapshot, and a reordered identity sequence, each with its typed code; no boundary slot arrives pre-filled; and
  interrupted post-publication cleanup remains safely retryable

- `[ ]` After `arc rename`, authoring resolves the existing plan through the recorded rename rather than minting
  a second one; `planId` and every dependent identity are unchanged; and a chained rename resolves transitively

- `[~]` A plan whose `landed`-discriminated prefix disagrees with the host-derived `landedPrefix` is refused at
  admissibility, and a cut whose range contains an ambient base merge partitions over contribution alone, with
  the merge carrying no membership; a base merge whose merge-only delta cannot be proved empty refuses

  _Superseded:_ The plan-discriminant half was removed. The contribution-partition half is retained as a separate
  criterion below.

- `[ ]` Position resolves from a member checkout via the reverse-lookup query, in a checkout carrying none of the
  work unit's artifacts, without reading identity from any ref name

- `[~]` No delivery record is writable into a work unit's change set, and every mutating write refuses a stale
  expected plan digest, assignment revision, observation revision, or assurance predecessor digest as applicable

  _Superseded:_ Assignment, observation, and assurance stores were removed; the replacement criterion covers the plan
  and single state tokens.

- `[~]` A terminal contribution chain is emitted only when membership and tree-exactness both hold, and it
  records review-owned verdict identities without evaluating their conditions

  _Superseded:_ Closeout derives current exactness and uses ordinary work-unit verification without a delivery chain.

- `[~]` The assurance port declares export and import, and the v1 adapter round-trips a chain through both
  without loss

  _Superseded:_ V1 has no assurance store or transport contract.

- `[ ]` The canonical plan and authoring input reject `live` / `landed`, assurance-subject, generation,
  review-routing, and terminal-proof fields while preserving current fingerprint and lineage validation

- `[ ]` `planId` and each surviving `deliverableId` remain stable across accepted title and coverage amendments;
  changing a bound or landed member receives `replacement-required` or `refused` according to current host facts

- `[ ]` Binding begins only with the first pushed member ref or opened change request, and the amendment classifier
  returns only `accepted`, `replacement-required`, or `refused` while preserving crossing-seam acceptance

- `[ ]` A cut containing a proven ambient base merge partitions over contribution alone, while a base merge whose
  merge-only delta cannot be proved empty refuses

- `[ ]` No delivery record is writable into a work unit's change set; plan publication refuses a stale expected digest,
  and the single state store refuses a stale expected revision

- `[ ]` One `DeliveryStateV1` binds exact member refs and change requests, supports unambiguous reverse lookup, and
  permits at most one active operation without separate assignment, observation, or assurance records

- `[ ]` Operation recovery adopts an exact already-applied result, permits retry after exact non-application, and
  blocks partial, extra, reordered, or otherwise ambiguous movement

- `[ ]` Current position and closeout readiness derive from current plan, state, Git, host, check, and review inputs;
  no terminal delivery-proof record is emitted

- `[x]` The shipped sizing doctrine no longer contradicts the one-work-unit-one-delivery-plan invariant

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
