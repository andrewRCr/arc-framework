# Task List: Delivery Plan Record

- **Design:** `spec-delivery-plan-record.md`

---

## Delivery Plan

Hand-authored in the shape the authoring command will later render and replace. No plan record exists yet, so
this section carries no plan revision or digest — the identities below are the author-supplied chunk keys the
eventual record derives from.

_Projection:_ stack-to-`main`. Every member is independently landable and reaches the protected base at member
size, so no pull request in the repository carries the whole contribution.

| # | Member                             | Chunk key             | Phases | Design elements | Predecessor        |
|---|------------------------------------|-----------------------|--------|-----------------|--------------------|
| 1 | Record and storage substrate       | `record-substrate`    | 1-2    | § 1, § 2, § 6   | —                  |
| 2 | Authoring entries and projection   | `authoring`           | 3-4    | § 3, § 4        | `record-substrate` |
| 3 | Revisions, binding, and amendment  | `revisions`           | 5      | § 7             | `authoring`        |
| 4 | State, reducer, and terminal proof | `execution-substrate` | 6-7    | § 5, § 8, § 9   | `revisions`        |

**Named seams** — cross-member contracts no single member's review covers:

| Seam                   | Incident | Owner | Acceptance                                                              |
|------------------------|----------|-------|-------------------------------------------------------------------------|
| Refusal parity         | 1, 2     | 2     | Composition adds only the partition check; no refinement re-implemented |
| Discriminant authority | 1, 4     | 4     | Record checks the discriminant against itself; reducer against the host |
| Rebind obligation      | 3, 4     | 4     | Every revision-producing event blocks transition until state rebinds    |
| Generation authority   | 1, 4     | 4     | No generation reissues against a subject a verdict already answered for |
| State record identity  | 1, 4     | 4     | The observations store member 1 provisions is member 4's state record   |

_Per-member procedure_ — stated once, applied to every member.

**Open with a grounding audit scoped to that member's phases, before writing anything.** Re-verify every file,
symbol, and interface those tasks name against the tree as it then stands — which includes whatever the delivered
predecessors changed, so this doubles as the reground against them. Three generation-time review passes did not
converge: each attacked the whole artifact and each found roughly ten real defects in a different region of it,
several of them substrate claims that earlier passes had read straight past. A member is a quarter of that
surface with the implementer present to act on what turns up, which is the better bounded pass. Treat the tasks
as claims about the codebase, not as settled fact.

Then cut from the `main` containing the predecessor; retarget to `main` as the predecessor lands. Close with a
Tier 3 run at the exact head before opening the pull request. **Members 1 through 3 exclude this work unit's own
lifecycle artifacts**, and member 4's implementation-review head excludes them too — metadata, spec, notes, and
this task list stay out of the series while implementation review is in flight, so no concurrent work unit's
session resolution is perturbed. After member 4's implementation candidate settles, append the lifecycle artifacts
and same-slug archival as a documentation-only terminal tail on that same pull request during one attended closeout
window; this is not a fifth member. The cost is that a member reviewer cannot see which tasks the member closes;
the table above is the substitute. Topology, ordering rationale, and the manual runbook live in
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

### `[ ]` **2.5 Hold assignment decisions with a monotonic per-subject generation**

- _Goal:_ A generation never restarts for a subject identity a prior clearing verdict already answered for, so an
  earlier review cannot confer authority on materially different later content.

- _Rationale:_ Assignments are otherwise a live map, so the natural reading is that teardown removes an entry —
  but `assuranceSubjectId` excludes plan revision, so re-authoring a torn-down `chunkKey` lands on the identical
  subject and a cleared entry would let its generation restart at one. The assurance chain cannot supply the mark
  either, since a torn-down member never landed.

    - `[ ]` **2.5.a Assignment record and its decision-bearing contents**

        - Each deliverable's ref and change-request handles, materialization generation, selected review routing,
          terminal-target refs, and the chosen host adapter with its provider binding.

        - Done when every field a decision — rather than an observation — is declared here, and the reverse
          lookup in `2.6.a` and the state record in `6.1` both read them from this record rather than
          re-declaring them.

    - `[ ]` **2.5.b Store-enforced generation high-water mark**

        - Build `test-first` (one behavior at a time):
            - Re-materializing a subject issues a strictly greater generation
            - Teardown does not lower the mark
            - Re-authoring the same `chunkKey` after teardown issues a generation greater than any prior
            - A caller-supplied generation lower than the mark refuses

### `[ ]` **2.6 Resolve a plan and member from a bare member checkout**

- _Goal:_ A session occupying a member ref learns which plan, member, and owning work unit it is on before it
  knows which plan to read, from a checkout carrying none of that unit's artifacts.

- _Note:_ Stated as a query contract rather than a storage choice — a scan over the assignment namespace at v1,
  an ordinary indexed query under a records-canonical tier, with callers unchanged either way.

    - `[ ]` **2.6.a Reverse lookup by repository and head or ref**

        - At v1 repository scope is ambient in the port instance rooted at the current Git common directory, not
          the review subsystem's per-clone `repositoryId`. A head selector compares an exact object id. A ref
          selector compares the authoritative stored binding and its recorded observed head, never spelling. A
          supplied owning-unit pointer selects a candidate directly but remains input to validate, not proof.

        - Build `test-first` (one behavior at a time):
            - A head matching a recorded member returns its plan, member, and owning work unit
            - Resolution reads the authoritative binding and never a ref's name or shape
            - An unmatched head returns a negative result rather than guessing
            - More than one authoritative match refuses as `ambiguous-match`
            - An explicitly supplied owning-unit pointer bypasses the scan and still validates the plan, member,
              and selector

    - `[ ]` **2.6.b Resolve a unit's existing plan forward through the rename chain**

        - _Goal:_ Authoring finds a renamed unit's existing plan instead of minting a second one, which no later
          advisory could catch because nothing would have been found to revalidate.

        - _Approach:_ Resolve each stored plan's recorded `workUnitId` forward through the rename disposition,
          transitively — never query by the unit's current name, which is a record's target and never its subject.

        - _Note:_ A forward transitive resolver with cycle detection already exists in `reference-reconcile.ts`.
          It resolves in the right direction and refuses an ambiguous subject correctly, and it returns each
          non-rename outcome as itself across a five-variant union rather than flattening them. The one
          incompatibility is its cycle arm, which returns a conflict — exactly the refusal this traversal must not
          make. Derive delivery's traversal separately and map the non-rename outcomes to "not a match"; altering
          the shared resolver would change the reference-reconcile contract that gates the integrate verb.

        - _Result contract:_ Return `match`, `no-match`, or `indeterminate`. The indeterminate arm names
          `ambiguous-subject`, `namespace-corrupt`, `reachability-unestablished`, or `substrate-unreachable`; it is
          never collapsed into `no-match`, because only the latter permits minting. The traversal consumes the
          plan port's validated enumeration rather than reaching into the local adapter.

        - Build `test-first` (one behavior at a time):
            - A chain terminating at the unit being authored for identifies that unit's plan
            - A chain terminating elsewhere, and a unit with no transition, are both simply not matches
            - A non-rename retirement does not block minting for a live unit
            - No stored plan resolving to the unit permits minting
            - An unresolvable chain — ambiguous subject, corrupt namespace, unreachable substrate — refuses and
              reports the reason
            - A cycle that has not reached the unit is not a match and does not refuse
            - Resolution runs against a ref whose reachability was established, and treats an unestablished one
              as indeterminate

    - `[ ]` **2.6.c Prove lookup from an artifact-free linked worktree**

        - Exercise the real Git-common adapter rather than an in-memory port: publish from one checkout, then
          resolve from a linked worktree on a bare member ref whose tree carries none of the owning unit's
          lifecycle artifacts. Pin rename evidence to an established ref so the test covers the authority boundary
          as well as the pure traversal.

        - Build `test-first` (one behavior at a time):
            - Exact-head and authoritative-ref selectors resolve the same plan, member, and owning work unit from
              the sibling checkout without reading ref spelling
            - An ambiguous authoritative binding refuses and an unmatched selector returns the negative result
            - A reachable rename chain adopts the existing plan, while an unestablished ref returns indeterminate
            - Cyclic and ambiguous rename histories take their specified non-match and indeterminate arms

## **Phase 3:** The authoring spine and the plan projection

_Purpose:_ Make authoring two-phase and un-forgeable — a machine section the author cannot alter, an explicit
slot for every irreducible judgment, one composition verb both entries feed, and a human-readable rendering of
what was published that no workflow ever parses back — and stand the command group up so those verbs are
invocable rather than library functions nothing reaches.

_Design decisions:_ Which judgments are irreducible is computed and presented rather than described in prose, so
the slot skeleton is the contract. Composition validates that a boundary is well-formed and never that it is
well-chosen. Full rationale in `spec-delivery-plan-record.md` § 3 and § 4.

### `[ ]` **3.1 Emit the starter map**

- _Goal:_ An author receives every derived fact already computed and exactly one slot per judgment only they can
  make, in a form that cannot be confused with a delivery record.

- _Context:_ The map is transient authoring state — it exists before a plan does, is hand-edited, and is
  discarded once composition succeeds or is abandoned. It rests beside the delivery records under the same local
  root rather than in the working tree, so it is structurally incapable of landing in the work unit's change set.

- _Shape:_ Because it is not one of the four records, it does not pass through their record-name guard and is not
  constrained to their serialization. It is authored as Markdown, since its author slots carry prose — a member's
  contract, a seam's acceptance statement — that no one should hand-edit inside a JSON string. And because
  `3.1.c` makes it a singleton resolved from the work unit, `compose` takes no path operand; the design's command
  sketch shows one, and this supersedes it.

    - `[ ]` **3.1.a Machine section carrying every derived fact and identity**

        - Done when the section carries exactly the derived set `1.1.c` enumerates, plus the entry's own material,
          and an author editing any of it is refusable by `3.2.a`.

    - `[ ]` **3.1.b Authoring section as a skeleton of explicit slots**

        - The boundary slot takes a discriminated value — an alignment arm the composer expands mechanically, or
          an arm carrying explicit boundaries.

        - Build `test-first` (one behavior at a time):
            - Every irreducible judgment has exactly one slot
            - No boundary slot arrives pre-filled with a derived partition
            - The landability assertion is an author slot, never manufactured

    - `[ ]` **3.1.c Single outstanding map per unit**

        - The map exists before a plan does, so it cannot key on `planId`, and the work-unit slug it must key on
          instead is mutable while the unit is live. Resolve the key through the rename traversal `2.6.b` builds,
          or a rename mid-authoring permits a second outstanding map at a surface no record refinement re-checks.

        - Build `test-first` (one behavior at a time):
            - A second map for the same unit refuses while one is outstanding
            - A rename while a map is outstanding still resolves to the same outstanding map
            - Abandoning a map clears the outstanding state

### `[ ]` **3.2 Refuse a record no author authored**

- _Goal:_ The three ways a map can arrive un-authored each refuse with their own code, so an author's judgment is
  the only thing composition can be carrying.

- _Note:_ Covered directly rather than inferred from composition's success path — these refusals are the
  mechanism that makes an authored judgment trustworthy.

    - `[ ]` **3.2.a The three typed refusals**

        - Build `test-first` (one behavior at a time):
            - A map that does not parse refuses before any slot is inspected
            - An unfilled slot refuses with its typed code
            - A mutated derived value refuses with its typed code
            - A seam owner supplied by the author is one such mutated value, since the owner is derived
            - A reordered identity sequence refuses with its typed code
            - A map whose machine and authored identity sequences still match validates

### `[ ]` **3.3 Validate and publish through `arc delivery compose`**

- _Goal:_ One composition verb serves both entries, so the part that must not fork does not fork.

- _Shape:_ Composition proves well-formedness — contribution steps covered exactly once and contiguous, every
  implementation task covered or surfaced as an advisory — and never well-chosenness, which belongs to the
  selected projection's eligibility test.

    - `[ ]` **3.3.a Partition and coverage composition checks**

        - The composer is entry-agnostic and validates a filled map, so these behaviors run against
          hand-constructed step sequences rather than the derivation `4.2` builds.

        - Build `test-first` (one behavior at a time):
            - Contribution steps covered more than once refuse
            - A non-contiguous member refuses
            - An uncovered implementation task refuses on the authored entry and advises on the derived one
            - The advisory names the task and the member whose coverage adjoins it in inventory order, leaving
              the call with the author
            - A member with an empty `taskIds` is admissible when every task is covered somewhere

    - `[ ]` **3.3.b Uniqueness refinement at publication**

        - Build `test-first` (one behavior at a time):
            - Minting a second plan for a unit that already has one refuses
            - Replacement produces a new revision under the same `planId`, never a second plan

    - `[ ]` **3.3.c Publish against the expected current plan digest**

        - Build `test-first` (one behavior at a time):
            - A first publication succeeds with no predecessor
            - A successor names its predecessor's digest and succeeds
            - A stale expected current digest refuses

### `[ ]` **3.4 Render the delivery-plan section into the task list**

- _Goal:_ A reader sees the published plan's shape without any workflow or reducer ever reading the rendering
  back.

- _Note:_ The section is informative and replaceable; per-task delivery tags would create a second authority and
  are not emitted.

    - `[ ]` **3.4.a Ordered member table and named-seam table**

        - Build `test-first` (one behavior at a time):
            - Exactly one generated section is replaced, leaving surrounding content untouched
            - A single-deliverable plan renders the same shape with one row
            - A task appearing against more than one member is marked shared rather than restructured
            - A landed member renders its as-of-landing values with an explicit marker
            - The landability column renders under `stack-to-main` and is omitted otherwise

### `[ ]` **3.5 Register the `arc delivery` command group**

- _Goal:_ The verbs the design fixes exist as invocable commands with the project's own registration obligations
  met, rather than as library functions nothing reaches.

- _Context:_ Command registration is wired in the CLI entry point and command logic lives in the handler layer,
  which is also where each family exports its input-policy declarations and registrations for the command-input
  composition root to aggregate. That root is not optional bookkeeping: a unit test asserts every command-schema
  field appears in the authoritative inventory, so an unregistered command fails the suite rather than merely
  being unreachable.

- _Shape:_ `plan` and `compose` are sibling subcommands of one group, never one verb with a mode flag, so the
  group is stood up once here and each entry registers its own subcommand in `4.1` and `4.2`.

    - `[ ]` **3.5.a Stand up the group and register `compose`**

        - Build `test-first` (one behavior at a time):
            - The group and its `compose` subcommand resolve from the CLI entry point
            - Every registered path appears in the command-input inventory
            - A machine-readable envelope is emitted when requested, with a distinguishable exit code on refusal
            - A refusal carries the typed code from `3.2.a` rather than prose alone

## **Phase 4:** The two authoring entries

_Purpose:_ Feed that spine from both sources as peers — a task plan before implementation, and a branch's own
change structure afterwards — prove the retrofit entry against the two cuts that were actually run by hand, which
is the check this design is most at risk of failing, give an author the one signal that invoking it is worth
considering at all, and leave the shipped sizing doctrine consistent with the invariant this record establishes.

_Design decisions:_ The entries are named by source rather than timing, so neither reads as remedial, and they
are sibling subcommands rather than one verb with a mode flag. Retrofit is first-class because it is the entry
every delivery cut with field evidence actually used. Full rationale in `spec-delivery-plan-record.md` § 3.

### `[ ]` **4.1 Author boundaries from a task plan (`from-tasks`)**

- _Goal:_ An author drawing boundaries before implementation states them once, and phase alignment is available
  as a mode they select rather than a partition filled in on their behalf.

    - `[ ]` **4.1.a Machine section from the task inventory and design inventory**

        - Done when the parent-task inventory and every declared design element reach the map with their digests,
          and the verification task is present but marked ineligible for membership.

    - `[ ]` **4.1.b Mechanical expansion of the alignment arm**

        - Build `test-first` (one behavior at a time):
            - The alignment arm expands to phase-aligned boundaries deterministically
            - The explicit-boundaries arm passes authored boundaries through unchanged
            - A member spanning an authored boundary is accepted without a justification field
            - Neither arm arrives selected

    - `[ ]` **4.1.c Register `plan from-tasks` and close the loop end to end**

        - _Goal:_ A plan authored from a real task list reaches a published record and a rendered section through
          the shipped commands, not through test harness calls.

        - Build `test-first` (one behavior at a time):
            - The subcommand registers and appears in the command-input inventory
            - Emitting a map, filling its slots, and composing publishes a validating record
            - The task list's delivery-plan section renders from the published record
            - An uncovered implementation task refuses at composition, and the verification task refuses as a
              member

### `[ ]` **4.2 Partition a branch's first-parent contribution (`from-branch`)**

- _Goal:_ A cut authored over a real branch partitions the work unit's own contribution, with base merges
  carrying no membership.

- _Rationale:_ A branch's history is not linear — a base merge inside a slice is ordinary, and one appears inside
  a slice of the very field run the success signal requires to round-trip. First-parent traversal gives each step
  exactly one predecessor and a single well-defined change shape, which is what makes contiguity mean anything.

- **Additional Context:** `notes-delivery-plan-record.md` § Field-evidence anchors — the concrete base-merge
  commit to use as a fixture rather than a hypothetical.

    - `[ ]` **4.2.a First-parent traversal from base to head**

        - The base is the branch's original divergence point, taken from first-parent history, or supplied
          explicitly by the author. It is **not** the merge base: once a branch absorbs its base through a merge,
          the merge base moves forward past earlier contribution steps, and a walk starting there silently drops
          work while still partitioning contiguously and composing cleanly. The recorded fixture is exactly that
          shape, so the wrong rule fails invisibly on the run the success signal depends on.

        - Build `test-first` (one behavior at a time):
            - Each step has exactly one predecessor and one change shape
            - A two-parent merge inside the range yields a single step
            - A branch that has absorbed its base still traverses from the original divergence point
            - An explicitly supplied base overrides the derivation

    - `[ ]` **4.2.b Contribution versus ambient base absorb**

        - Build `test-first` (one behavior at a time):
            - A merge bringing the base forward classifies as ambient absorb
            - Only contribution steps participate in the partition
            - An ambient absorb is retained as an ordering landmark carrying no membership
            - Contiguity is evaluated over contribution alone

    - `[ ]` **4.2.c Per-step and cumulative change shape**

        - Build `test-first` (one behavior at a time):
            - Each contribution step reports its own change shape
            - The cumulative shape at any step equals the composition of the contribution steps up to it
            - An ambient absorb contributes nothing to the cumulative shape

    - `[ ]` **4.2.d Register `plan from-branch`**

        - Build `test-first` (one behavior at a time):
            - The subcommand registers and appears in the command-input inventory
            - It emits a map over a real branch range without requiring a task partition

### `[ ]` **4.3 Normalize attributed task references to the parent inventory**

- _Goal:_ Membership derives from what task ids actually are in practice, not from what the footer grammar
  admits, so a real branch's attributions are not discarded.

- _Context:_ The enforced footer grammar admits arbitrary dotted depth — `X.Y.a`, `X.Y.R`, and `X.R` all validate
  today, and only the documented examples are two-level. Normalization is therefore needed because the inventory
  binds parents, not because the grammar is narrow. Attribution is separately sparse by design: review fixes,
  maintenance, and incidental work name no task, and deferred review lets a range land under one commit.

    - `[ ]` **4.3.a Upward resolution to the nearest enclosing parent**

        - Revision-family ids are parents in their own right — a phase-level follow-on renders as a parent
          heading and parses as a parent id — so a footer citing one resolves to it rather than reaching nothing.
          What actually reaches nothing is an id absent from the inventory: a task deleted or renumbered after
          the footer was written.

        - Build `test-first` (one behavior at a time):
            - A subtask-level id resolves to its enclosing parent
            - A phase-level follow-on id resolves to itself, since it is a parent
            - A range and a non-contiguous list each expand, resolve, then deduplicate
            - An id absent from the inventory contributes no membership and is reported
            - An unresolvable id is advisory on the derived entry and an error on the authored one

    - `[ ]` **4.3.b At-least-once semantics preserved**

        - Build `test-first` (one behavior at a time):
            - A resolved reference claims the parent is represented in the member, not owned by it
            - A parent represented in two members is admissible

### `[ ]` **4.4 Report co-change structure and lifecycle-artifact touches**

- _Goal:_ An author drawing boundaries sees file-level co-change and which steps touch the unit's own lifecycle
  artifacts, with neither turned into a constraint.

- _Rationale:_ Enforcing the lifecycle-artifact exclusion in a projection-neutral composer would leak a
  projection concern into the substrate and invert the cohort's dependency direction — the requirement arises
  only under stack topology and belongs to the member that owns it.

    - `[ ]` **4.4.a File-level co-change structure across contribution steps**

        - Build `test-first` (one behavior at a time):
            - Files changing together across contribution steps are reported as co-changing
            - The report is derivable language-agnostically, proposing no boundary of its own
            - Ambient absorbs contribute no co-change edges

    - `[ ]` **4.4.b Lifecycle-artifact touches reported and never enforced**

        - Build `test-first` (one behavior at a time):
            - Steps touching the unit's own artifacts are reported
            - A cut whose members touch them still composes successfully

### `[ ]` **4.5 Reconstruct both hand-run cuts as authored plans**

- _Goal:_ The two cuts that were actually executed by hand round-trip through the retrofit entry, producing plans
  whose members carry the boundaries shipped and whose seams match the ones those runs recorded, with no
  fabricated task partition.

- _Context:_ This is the falsifiable check the design is most at risk of failing. Both cuts were authored after
  implementation, so an entry serving only pre-implementation authoring fails outright; both cut along change
  structure rather than task structure, so a hard task-partition refinement fails; both carry recorded seams, so
  a seam model that cannot express what they found fails.

    - `[ ]` **4.5.a Reconstruct the seven-slice cut**

        - Its slice branches have been reaped, so base and head pairs come from the recorded merge parents, which
          the criterion admits as equivalent evidence.

    - `[ ]` **4.5.b Reconstruct the thirteen-slice cut**

        - Its branches exist in one clone only, with no remote counterpart, and belong to a work unit still in
          flight — so they can move. Pin the base and head commits into a committed fixture rather than reading
          live branch tips, or the suite passes on one machine and drifts under its owner's next rebase.

    - `[ ]` **4.5.c Validate both reconstructions against the record's refinements**

        - Build `test-first` (one behavior at a time):
            - Each reconstruction validates without a fabricated task partition
            - Recorded seams are expressible and their derived owners match the runs
            - The slice containing an ambient base merge partitions over contribution alone

### `[ ]` **4.6 Surface delivery-plan candidacy at the design-stage boundary read**

- _Goal:_ An author whose concern stayed one work unit while the separable-surfaces signal fired learns that a
  delivery plan serves that shape, at the moment the judgment is already being made.

- _Approach:_ Read the signal where the boundary test already states it and attach the note to its "stays one
  work unit" arm. Delivery authors no second test and owns no trigger; the note is worth surfacing once, is never
  a gate, and is freely declined because the retrofit entry stays open at the same cost.

- _Context:_ The boundary test states its separable-surfaces signal in prose and records no verdict when it
  answers "stays one work unit" — no artifact exists to consume, and creating one belongs to the work unit
  rewriting that method. So the note is surfaced in the same session that makes the judgment, which meets the
  surface-once bar without a durable record. When a recorded verdict does land, this upgrades to consuming it
  without changing shape.

- _Note:_ Edit the package source and let it sync; both copies are currently byte-identical. Write the addition
  in the shipped-content register — no references to this work unit's own planning artifacts.

    - `[ ]` **4.6.a Add the candidacy note to the boundary test's stays-one-unit arm**

        - The signal is stated in the method's sizing heuristics, where distinct deliverables and independently
          reviewable surfaces are named the primary signal; the arm that answers "stays one work unit" is in its
          output section. The note attaches to the output arm and refers to the signal, so one surface produces
          the judgment and one records what follows from it.

        - Done when a "stays one work unit" answer reached while that signal fired carries the note, and one
          reached without it does not.

### `[ ]` **4.7 Reconcile the shipped sizing doctrine with the delivery invariant**

- _Goal:_ The shipped sizing guidance no longer contradicts the invariant that one work unit carries one delivery
  plan emitting at least one pull request.

- _Context:_ The statement in scope is "a stack is a cohort's dependency-ordered delivery mode, not one work unit
  spread across many branches," which appears at two loci — the sizing bullet in `strategy-work-organization.md`
  and the matching sizing-heuristics bullet in `assess-cohort-fit.md`, each mirrored in the package source. The
  cohort framing earlier in the same strategy already carries the caveat that how many pull requests a work unit
  emits is a separate axis, and needs no change. Both surfaces ship, so the correction must remove the
  contradiction without forward-pointing to an unshipped mechanism.

- _Note:_ Out of scope, and named in the design rather than corrected here: the same strategy's single-branch
  doctrine states that a work unit is one branch merged to the base exactly once. That is a deeper doctrine
  question than the sizing bullet, and it belongs to the work unit rewriting the discriminator.

    - `[ ]` **4.7.a Correct the stack-versus-cohort statement at both loci**

        - Edit the package source and let it sync; the rendered copies refuse a direct edit.

        - Distinct concern from `4.6` despite sharing a file — separate review increment and commit.

## **Phase 5:** Plan revisions, binding, and amendment

_Purpose:_ Sort what may still change once a plan acquires its first externally visible dependency, so routine
discovered work is absorbed without ceremony, shipped work cannot be re-described, and re-cutting the unlanded
suffix carries its crossing obligations forward rather than dropping them.

_Design decisions:_ The record validates only what it can see from its own contents and its validated
predecessor; whether an assertion matches the world is always the reducer's question. Freezing rather than
re-deriving a landed member is what lets the spec be amended after the first landing. Full rationale in
`spec-delivery-plan-record.md` § 7.

_Shape:_ Every task here is a pure function over two plan revisions plus supplied binding and landed-prefix
facts. It never reads live state and never observes the host, so its behaviors run against hand-constructed
inputs. The obligations it emits — that state rebinds, that a generation advances, that the advisory reaches the
terminal proof — are discharged by the reducer and the proof in the following phases; this phase is what makes
them derivable, not what enforces them.

### `[ ]` **5.1 Determine when a plan becomes bound**

- _Goal:_ Binding follows external dependency, so authoring iterations and locally-built candidate heads cost
  nothing.

- _Rationale:_ Keying binding to a lifecycle transition would make a plan authored during implementation born
  bound, foreclosing the retrofit entry. Keying it to local ref construction would bind a plan merely for
  building candidates to test — the proving step a retrofit author should be free to run and discard.

    - `[ ]` **5.1.a Bind on the first pushed member ref or opened change request**

        - Build `test-first` (one behavior at a time):
            - An unbound plan admits a new revision with no reconcile reached
            - A locally-built candidate head does not bind
            - A pushed member ref binds
            - An opened change request binds
            - Lifecycle state does not enter the determination

### `[ ]` **5.2 Sort a proposed revision into absorb, refuse, or replacement**

- _Goal:_ Each outcome matches what is physically possible at that point in the series, so discovered work is not
  punished and shipped work cannot be re-described.

- _Shape:_ Addition, move, and departure are distinguished by comparing the whole-plan task-to-member relation
  across the two revisions, which is always available because revisions are whole records.

    - `[ ]` **5.2.a Classify metadata amendment ahead of the three arms**

        - Build `test-first` (one behavior at a time):
            - A revision differing only in work-unit metadata classifies as metadata amendment
            - The classification carries no generation advance and no review-target invalidation, unlike absorb
            - It is reported as rebind-obliging, the same as every other revision-producing event
            - A stored `workUnitId` differing from the unit's current slug emits a typed advisory and leaves the
              record valid

    - `[ ]` **5.2.b The absorb arm**

        - Build `test-first` (one behavior at a time):
            - A coverage addition to a bound unlanded member absorbs
            - A task whose covering member set grows is an addition
            - A task whose covering set shifts is a move and does not absorb
            - A task whose covering set empties is a departure and does not absorb
            - Adding a subtask inside an existing parent proposes no revision at all

    - `[ ]` **5.2.c The refuse arm**

        - Build `test-first` (one behavior at a time):
            - Removing, reordering, or altering a landed member refuses
            - A topology change after the first landing refuses
            - Renaming a bound member's `chunkKey` refuses as an identity change
            - Renaming a bound seam's `seamKey` refuses on identical grounds
            - A seam all of whose incident members have landed refuses alteration

    - `[ ]` **5.2.d The replacement arm**

        - Build `test-first` (one behavior at a time):
            - Re-cutting the bound-unlanded suffix produces a replacement
            - The landed prefix carries forward byte-identically
            - The replacement lineage references its predecessor explicitly
            - Splitting an oversized member is free while unbound and a replacement once bound

    - `[ ]` **5.2.e Reactive insertion**

        - _Goal:_ A member the plan never anticipated is admitted as its own amendment cause rather than read as
          authoring drift, without adding a record surface to carry it.

        - _Rationale:_ The cause originates outside the plan's intent — a landed member blocks work in another
          work unit and the remedy must ship before the series continues — but mechanically it is an ordinary
          forward amendment. Classifying it where amendments are already sorted keeps that distinction legible; a
          discriminant on the record would put a schema field in an earlier member to carry a fact only the sort
          reads.

        - Build `test-first` (one behavior at a time):
            - An unanticipated member appended to the unbound suffix classifies as reactive insertion
            - Landed positions are unchanged and the unbound suffix relabels under the new revision
            - It is distinguishable from ordinary forward amendment in what the sort reports

### `[ ]` **5.3 Freeze a landed member through the conversion revision**

- _Goal:_ A landed member's values stop moving for reasons outside itself, so amending the spec after the first
  landing is possible and re-cutting the suffix does not fire refuse.

- _Rationale:_ A member's fingerprint reaches design-element digests and incident-seam fingerprints, both of
  which move externally. Under re-derivation a landed member's fingerprint would move although its contribution
  is fixed in the tree.

    - `[ ]` **5.3.a Conversion as a distinct, obligatory event**

        - Build `test-first` (one behavior at a time):
            - The first revision authored after a landing writes that member in `landed` form
            - Conversion is the only event permitted to change a member's bytes on the landed side
            - A replacement wanted at the same time is refused until conversion publishes first

    - `[ ]` **5.3.b Byte-identity against the first frozen form**

        - Build `test-first` (one behavior at a time):
            - Comparison targets the first frozen form, not the live predecessor
            - A replacement altering an already-frozen member fails byte-identity immediately

### `[ ]` **5.4 Carry crossing-seam obligations and emit the design-drift advisory**

- _Goal:_ Re-cutting the unlanded suffix cannot orphan a seam's acceptance, and drift on shipped work surfaces as
  an adjusting entry rather than a validity failure.

    - `[ ]` **5.4.a Seams spanning the landed boundary**

        - Build `test-first` (one behavior at a time):
            - A replacement must still carry a seam with the same acceptance and landed-side incident
            - Dropping that obligation refuses
            - The re-cut itself is not refused, since the landed side is unchanged either way

    - `[ ]` **5.4.b Design drift on landed work as a typed advisory**

        - Build `test-first` (one behavior at a time):
            - A landed member whose referenced design element has since been amended emits the advisory
            - The advisory does not refuse the revision
            - It is emitted as a typed value the reconcile and terminal-proof callers render, never as an ambient
              session surface

## **Phase 6:** Delivery state and the shared transition reducer

_Purpose:_ Hold the exact facts a position derives from, order the single live operation against the host so a
crash leaves it replayable rather than ambiguous, and admit a transition only when the plan, the adapter, the
checks, the review verdicts, and the plan's own frozen prefix all agree.

_Design decisions:_ The state record stores facts rather than a second agenda — aggregate labels are derived
verdicts, never independently writable. The decision-bearing publish is the durable commit point because it is
the only part re-observation cannot rebuild. Full rationale in `spec-delivery-plan-record.md` § 5 and § 8.

### `[ ]` **6.1 Hold delivery state as transition-bearing facts**

- _Goal:_ Current position, predecessor consumption, and terminal readiness all derive from what the record
  holds, and nothing control-bearing is trusted from a copied provider status.

- _Shape:_ Decisions are deliberately absent — each deliverable's refs and change-request handles, its
  materialization generation and review routing, the terminal target's refs, and the adapter choice all live in
  the assignment record. State reads them; it does not own them.

    - `[ ]` **6.1.a State record and its plan binding**

        - This is the observations record whose namespace and publication discipline `2.3` provisions; define its
          contents here rather than standing up a second store.

        - Build `test-first` (one behavior at a time):
            - State binds an exact `planId`, revision, and digest
            - The projection discriminant is carried from the bound revision, not authored
            - One plan-ordered entry exists per deliverable

    - `[ ]` **6.1.b The single active-operation slot**

        - Build `test-first` (one behavior at a time):
            - A second operation refuses while one is outstanding
            - A land operation additionally carries its immutable landing-intent identity
            - Review operations do not nest inside the slot

    - `[ ]` **6.1.c Declare the verdict-request port**

        - _Goal:_ Asking the review system for a verdict at an exact subject and generation is expressed once, so
          the three consumers downstream share one shape rather than each inventing one.

        - _Note:_ The exact question and answer shape is a seam owned by the cohort member holding qualification
          and is not settled here. A narrow port — subject identity and generation in, a carried verdict identity
          or nothing out — is what admissibility, the landing intent, and the terminal proof all need, and is
          replaceable wholesale when that member lands.

        - Clone-stability of a carried verdict identity is an obligation on the eventual identity, contributed to
          the member that owns qualification — not a predicate this port checks. The same reasoning `1.5.e`
          applies to project identity applies here: no single clone can verify it.

        - Build `test-first` (one behavior at a time):
            - The port carries subject identity and generation and returns a verdict identity or nothing
            - Delivery records the identity and evaluates no condition of the verdict
            - A returned identity is stored opaquely, with no property asserted against it

### `[ ]` **6.2 Order one host operation against its stores**

- _Goal:_ A crash leaves the operation either replayable or already durably recorded, never ambiguous about
  whether the decision was made.

- _Rationale:_ No atomic write spans the decision-bearing and observation stores, so the order is the contract.
  The decision-bearing publish is the durable commit point: a crash after it loses only observations that
  re-observation reconstructs, while a crash before it leaves the operation replayable.

    - `[ ]` **6.2.a Reserve, invoke, observe, publish decisions, record observations, clear**

        - Build `test-first` (one behavior at a time):
            - The reservation precedes the adapter invocation
            - Decision-bearing publication precedes observation recording
            - A crash before the decision publish leaves the operation replayable
            - A crash after it leaves observations reconstructible by re-observation

    - `[ ]` **6.2.b Retry, reconcile, and blocked outcomes**

        - Build `test-first` (one behavior at a time):
            - Retry acquires the same operation identity and reconciles before replay
            - An already-applied exact result is adopted rather than reissued
            - Reconciliation clears only when the host proves exact application or non-application
            - An ambiguous or partially applied outcome stays blocked for explicit remedy

### `[ ]` **6.3 Derive the landed prefix and admit a transition**

- _Goal:_ A requested transition is admitted only when every control-bearing fact currently agrees, and a false
  landing assertion in the plan is caught at the only layer that observes the host.

    - `[ ]` **6.3.a Derive `landedPrefix` and `firstUnlanded` from host observations**

        - Build `test-first` (one behavior at a time):
            - Both derive from current observations and neither is writable state
            - Aggregate labels are derived verdicts rather than stored values

    - `[ ]` **6.3.b The six admissibility conditions**

        - _Note:_ The landing-intent condition is exercised in `7.1`, where the intent record is defined; the
          admissibility path here reaches it through the same port `6.1.c` declares. Everything else is checked
          in place.

        - Build `test-first` (one behavior at a time):
            - State not binding the current plan revision is inadmissible
            - A missing or extra member proven by the adapter is inadmissible
            - A landing request not beginning at `firstUnlanded`, or not contiguous, is inadmissible
            - A member without green required checks or a clearing verdict at its exact generation is
              inadmissible, and so is an assigned seam without one
            - A stack-selected member lacking the plan's landability judgment is inadmissible
            - A plan whose `landed`-discriminated prefix disagrees with the host-derived prefix is inadmissible
            - A replacement revision is inadmissible until its superseded bound-unlanded suffix is torn down —
              refs removed and change requests closed — which the plan cannot see and `5.2.d` cannot check
            - The expected project is proven whenever the plan carries one

### `[ ]` **6.4 Reconcile drift without remapping deliverables**

- _Goal:_ A changed base, head, or membership forces reconciliation rather than passing through as close enough,
  and no review evidence is silently discarded.

    - `[ ]` **6.4.a Reconcile before any further readiness verdict**

        - Build `test-first` (one behavior at a time):
            - Deliverable identity is preserved across reconciliation
            - Affected materialization generations advance
            - New review targets derive from the changed heads
            - A readiness verdict is withheld until checks and applicability settle
            - After mutation, only the requested exact result or a contracted partial result is accepted

## **Phase 7:** The assurance chain and the terminal proof

_Purpose:_ Turn a completed series into evidence that survives the machine it was produced on — an exact contract
before each mutation, an immutable fact after it, and a terminal record proving the ordered landings compose the
planned membership with no delta the plan does not account for.

_Design decisions:_ Precondition evidence, human authorization, and the observed host result are different facts
and must not collapse into one terminal record. The intent is held locally while live and reaches the store only
by the observation that fulfils it — publishing it separately would put a second durable point on a merge's
critical path and orphan an intent for every aborted land. Full rationale in `spec-delivery-plan-record.md` § 9.

### `[ ]` **7.1 Bind an immutable landing intent**

- _Goal:_ Every control-bearing fact a landing depends on is fixed before the interlock, and any change to one of
  them invalidates the intent rather than being absorbed.

- _Note:_ The interlock receives a derived, exception-filtered readiness projection of the record. Human approval
  remains the sole merge authority and is not turned into a delivery receipt.

    - `[ ]` **7.1.a The pre-mutation contract**

        - Build `test-first` (one behavior at a time):
            - The intent binds repository, state, plan, projection, operation, and adapter identities
            - It binds the exact destination ref with its observed pre-landing head and tree
            - It binds the requested contiguous prefix with each deliverable id and generation, and the exact
              source base, head, and tree used for each
            - It binds any terminal-only delta target with its review qualification and applicability proof
            - It binds required-check observations and the verdict returned for every member and assigned seam
            - It enumerates one expected result for `single` and `atomic-prefix`, or the ordered allowed
              leading-subprefix results for `ordered-prefix`
            - The terminal intent binds the verification anchor to the aggregate contribution digest

    - `[ ]` **7.1.b Re-observation immediately before mutation**

        - Build `test-first` (one behavior at a time):
            - The command re-observes every control-bearing fact and requires the same intent digest
            - A changed state, base, head, membership, capability, check, review, or contribution invalidates the
              intent and refires the interlock

### `[ ]` **7.2 Emit an immutable landing observation**

- _Goal:_ An interrupted or uncontracted land contributes nothing to the chain, so position is re-derived from
  host observations rather than from an interrupted operation's paperwork.

    - `[ ]` **7.2.a The post-mutation fact**

        - Build `test-first` (one behavior at a time):
            - The observation embeds or content-addresses the intent it fulfilled, so one append carries both
            - It binds before and after destination heads and trees, actual mode and outcome, landed member ids
              and generations, and the contribution-manifest digest
            - A result equal to the intent's exact result is accepted
            - A result equal to an enumerated leading subprefix is accepted
            - An ambiguous, extra, reordered, or otherwise uncontracted mutation emits no successful observation
              and leaves the operation blocked

### `[ ]` **7.3 Prove membership and tree-exactness**

- _Goal:_ The ordered landings are shown to compose the planned membership exactly, with the trees carrying no
  work-unit-owned delta the plan does not account for.

- _Shape:_ This is one half of a co-owned proof. Delivery binds and carries review-owned verdict identities and
  never defines what makes them admissible.

    - `[ ]` **7.3.a The five terminal verifications**

        - Contribution-versus-ambient-absorb classification is the same cut `4.2.b` draws at authoring time, and
          the two layers must describe one partition — compose that classification rather than reimplementing it.

        - Build `test-first` (one behavior at a time):
            - Landing member sets are disjoint, ordered, contiguous, and cover the plan exactly once
            - Every observed tree transition equals the named generations' contribution with no extra
              work-unit-owned delta
            - An unrelated base advance between operations is a legitimate new base and is absent from the chain
            - The terminal-delta subject carries an exact empty-delta proof, or is recorded as non-empty for the
              qualification half to answer for
            - Each observation matches its immutable intent and an exact result that reached the interlock
            - The final operation result and destination tree equal the expected result

    - `[ ]` **7.3.b Verdict identities recorded, never evaluated**

        - Requests run through the port `6.1.c` declares; this task covers only the terminal reducer's use of it.

        - Build `test-first` (one behavior at a time):
            - Every member, seam, and non-empty terminal delta the chain names is asked for a verdict at its
              exact subject and generation
            - Each returned identity is recorded in the chain
            - A named subject returning no verdict blocks the proof rather than being recorded as cleared

### `[ ]` **7.4 Emit the terminal contribution chain**

- _Goal:_ A terminal record exists only in proven form, and its name and contents make clear it authorizes
  nothing.

    - `[ ]` **7.4.a The proven-form-only record**

        - Build `test-first` (one behavior at a time):
            - The record is emitted only when membership and tree-exactness both hold
            - Incomplete and stale cases remain typed reducer verdicts rather than persistent failure records
            - It asserts no claim about the work unit being complete
            - It cannot authorize a merge retroactively or stand in for a required host-side check

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Both hand-run cuts reconstruct through `from-branch` — the thirteen-slice and seven-slice cuts each
  produce a validating plan whose members carry the boundaries actually shipped and whose seams match the ones
  those runs recorded, with no fabricated task partition

- `[ ]` A `from-tasks` plan against a current task list validates, publishes, and renders its task-list
  projection, with an uncovered implementation task refused at composition and the verification task refused as
  a member

- `[ ]` A member's `deliverableId` is unchanged across an amendment that alters titles, adds coverage, and
  relabels positions; renaming a `chunkKey` on a bound member is refused

- `[ ]` The three reconcile outcomes sort correctly against a bound plan — coverage addition absorbs, coverage
  move refuses, altering a frozen member fails byte-identity, and re-cutting the bound-unlanded suffix produces a
  replacement whose landed prefix is byte-identical and whose crossing seams retain their acceptance statements

- `[ ]` A conversion revision validates when the converting member equals its predecessor's payload modulo the
  discriminant, and is refused when it does not

- `[ ]` Tearing down a member and re-authoring the same `chunkKey` yields a generation strictly greater than any
  previously issued for that subject

- `[ ]` The starter map refuses an unfilled slot, a mutated derived value, and a reordered identity sequence,
  each with its typed code, and no boundary slot arrives pre-filled

- `[ ]` After `arc rename`, authoring resolves the existing plan through the recorded rename rather than minting
  a second one; `planId` and every dependent identity are unchanged; and a chained rename resolves transitively

- `[ ]` A plan whose `landed`-discriminated prefix disagrees with the host-derived `landedPrefix` is refused at
  admissibility, and a cut whose range contains an ambient base merge partitions over contribution alone, with
  the merge carrying no membership

- `[ ]` Position resolves from a member checkout via the reverse-lookup query, in a checkout carrying none of the
  work unit's artifacts, without reading identity from any ref name

- `[ ]` No delivery record is writable into a work unit's change set, and every mutating write refuses a stale
  expected plan digest, assignment revision, observation revision, or assurance predecessor digest as applicable

- `[ ]` A terminal contribution chain is emitted only when membership and tree-exactness both hold, and it
  records review-owned verdict identities without evaluating their conditions

- `[ ]` The assurance port declares export and import, and the v1 adapter round-trips a chain through both
  without loss

- `[ ]` The shipped sizing doctrine no longer contradicts the one-work-unit-one-delivery-plan invariant

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
