# Task List: Delivery Stack Topology

- **Design:** `spec-delivery-stack-topology.md`

---

<!-- arc:delivery-plan:start -->
## Delivery Plan

- **Plan Revision:** `1`
- **Plan Digest:** `sha256:abc31452226ec7750a3d31d5833a7953ecc204232e18b1e2ac5018641386bc18`
- **Projection:** `stack-to-main`
- **Landability:** All members are `independently-landable`.

### Members

| #   | Member                                      | Chunk key              |
| --- | ------------------------------------------- | ---------------------- |
| 1   | Boundary and attention foundation           | `boundary-attention`   |
| 2   | Eligibility and projection identity         | `eligibility-identity` |
| 3   | Unlinked materialization and landing        | `unlinked-execution`   |
| 4   | Reconciliation and terminal handoff         | `reconcile-terminal`   |
| 5   | Lifecycle execution and orientation         | `lifecycle-surfaces`   |
| 6   | Native stack composition and lifecycle tail | `native-stack-tail`    |

#### Member coverage

| #   | Tasks               | Design elements                  |
| --- | ------------------- | -------------------------------- |
| 1   | `1.1`, `1.2`, `1.3` | `rfc:§ 7`, `rfc:§ 8`             |
| 2   | `2.1`, `2.2`, `2.3` | `rfc:§ 1`, `rfc:§ 2`, `rfc:§ 6`  |
| 3   | `3.1`, `3.2`, `3.3` | `rfc:§ 10`, `rfc:§ 2`, `rfc:§ 3` |
| 4   | `4.1`, `4.2`, `4.3` | `rfc:§ 4`, `rfc:§ 5`             |
| 5   | `5.1`, `5.2`, `5.3` | `rfc:§ 10`, `rfc:§ 7`, `rfc:§ 8` |
| 6   | `6.1`, `6.2`, `6.3` | `rfc:§ 9`                        |

### Named seams

| #   | Seam                             | Members | Owner | Design elements                 |
| --- | -------------------------------- | ------- | ----- | ------------------------------- |
| 1   | Boundary decision to owned entry | 1, 5    | 5     | `rfc:§ 7`                       |
| 2   | Eligibility to materialization   | 2, 3    | 3     | `rfc:§ 1`, `rfc:§ 2`, `rfc:§ 6` |
| 3   | Unlinked to linked parity        | 3, 4, 6 | 6     | `rfc:§ 9`                       |
| 4   | Landing to suffix reconciliation | 3, 4    | 4     | `rfc:§ 3`, `rfc:§ 4`            |
| 5   | Terminal closeout                | 4, 5, 6 | 6     | `rfc:§ 5`                       |
| 6   | Execution to lifecycle surfaces  | 3, 4, 5 | 5     | `rfc:§ 10`, `rfc:§ 7`           |

#### Acceptance

- **1. Boundary decision to owned entry:** A sticky planning outcome reaches one typed delivery entry without a
  duplicate downstream advisory.

- **2. Eligibility to materialization:** Every pushed member head is one validated authored cut and carries the
  protected-base state at every lifecycle-contribution path.

- **3. Unlinked to linked parity:** Native composition changes only the observed host arm; refusal returns to the
  complete unlinked path.

- **4. Landing to suffix reconciliation:** One exact-head landing cannot expose the next member until its contribution
  and bindings reconcile.

- **5. Terminal closeout:** The control branch absorbs the landed prefix and ordinary WU integration carries only the
  residual tail.

- **6. Execution to lifecycle surfaces:** Workflow and session surfaces render typed executor state without acquiring
  Git, host, or review authority.
<!-- arc:delivery-plan:end -->

## **Phase 1:** Boundary and attention foundation

_Purpose:_ Establish the renamed planning, changeset-threshold, and attention vocabulary, its complete
installation/update surface, and the decision shapes later execution and lifecycle consumers can rely on.

### `[x]` **1.1 Re-charter the boundary-fit checkpoint and its three planning outcomes** — § 7; SC 10

- _Goal:_ Planning checkpoints produce one durable split, hold, or delivery disposition, and later invocations
  reopen the judgment only when the evidence changed.

- _Note:_ The task-generation fire point also owns the supported provisional-to-canonical `Delivery Plan`
  lifecycle this work unit is exercising.

    - `[x]` **1.1.a Rename and re-contract the boundary method**
        - Renamed the Configurable method to `assess-boundary-fit.md` across package, installed, recipe,
          classification, strategy, index, README, manifest, and test surfaces with no old-path alias.
        - Promoted hold, cut-map, and delivery-plan candidate to explicit sticky outcomes; corrected task-generation
          coverage to treat concern multiplicity independently from the scale/derivation depth valve.
        - Fresh init/update coverage preserves project overrides, pristine package identity, and the existing v3
          decomposition doctrine under the renamed method.

    - `[x]` **1.1.b Wire the three outcomes into design authoring**
        - Declared `assess-boundary-fit` at both design-authoring fire-points and dispatched each exact outcome
          through an aligned outcome/owner/action table in shipped and installed workflow copies.
        - Kept hold and delivery-candidate work in the current authoring stage, routed cut-maps solely to
          `decompose-work-unit`, and excluded delivery publication or binding from slice-aware authoring.
        - Added a focused workflow contract fixture proving sticky prose recording, semantic new-evidence judgment,
          unchanged-evidence silence, no machine comparator/authority, and package/installed parity.

    - `[x]` **1.1.c Add task-generation delivery-plan authoring and finalization sequencing**
        - Added the Pass 1 boundary fire-point and unmarked provisional-plan posture to shipped and installed
          task-generation workflows, including active/incubating routing and abandon-and-recreate drift recovery.
        - Added validated `--task-list` authoring input with active-meta identity authority, omitted-pointer fallback,
          repository/name/design coherence checks, and pre-write refusal coverage.
        - Registered `delivery-design-inventory-input` through a cycle-free authoring registrar, emitted the same
          authority from `delivery plan inventory schema`, and included it in the generated kernel artifact.
        - Sequenced strict caller inventory, author slots, canonical composition/renderer replacement, coherence reread,
          final review, and the existing meta finalizer while preserving prebinding/no-external-mutation boundaries.
        - Added focused schema, handler, command-input, workflow-order, build-artifact, and E2E authoring coverage.

    - `[x]` **1.1.d Make the delivery-plan section an explicit task-list format contract**
        - Documented the optional pre-phase provisional locus and renderer-owned canonical sentinel/table/acceptance
          topology in package and installed task-list template/strategy surfaces.
        - Made the scanner treat the entire Delivery Plan locus as structurally opaque, including fenced examples, so
          cursors, tallies, descriptor inventory, and from-tasks see implementation phases only.
        - Extended provisional/canonical cursor, scanner, inventory, renderer, and session-init fixtures; full-document
          replacement passes MD060 without suppression and preserves the exact phase suffix bytes.

### `[x]` **1.2 Rename the changeset advisory thresholds across config and policy surfaces** — § 8; SC 11

- _Goal:_ Every current and regenerated project reads the same two changeset-size advisory thresholds under their new
  shared names while preserving disabled defaults and review-boundary behavior without retaining compatibility for
  the old keys.

    - `[x]` **1.2.a Rename schema, validation, and agent-readable config keys**
        - Moved both unsigned-safe-integer settings into the `changeset.advisory_threshold_*` namespace across the
          authoritative catalog and validation/status projections; absent values remain `0`, raw status remains
          tolerant, and malformed command input retains its key-specific refusal.
        - Added explicit catalog, validation, and status coverage proving the former keys are unknown or absent, not
          aliases.

    - `[x]` **1.2.b Rename the policy reader without changing its boundary contract**
        - Retargeted the policy parser and command fixtures to the changeset-owned keys while preserving semantic
          `{lines, files}` request/envelope values, independent dimensions, zero-disable behavior, exact-target
          measurement, and advisory-only selection.

    - `[x]` **1.2.c Preserve keys and project overrides through install and update**
        - Renamed package defaults to `0/0` and preserved the project instance's authored `5000/150` values through
          targeted edits and the supported updater; refreshed installed manifest/pristine identity without aliases
          or value transfer from former keys.
        - Updated init, update, framework-sync, status, release, and formatting fixtures; hardened multi-conflict
          `git merge-file` handling discovered at this Configurable-file seam.

    - `[x]` **1.2.d Rename adopter-facing documentation consumers**
        - Updated both shipped and installed method/strategy copies to name exact-target changeset-size advisory
          thresholds and their derived attention signal without changing the chunk-boundary contract.

- _Outcome:_ Config, runtime, policy, install/update, and adopter guidance now share one changeset-owned vocabulary;
  old names survive only in explicit rejection/no-migration fixtures and immutable planning history.

### `[x]` **1.3 Select one delivery-aware attention remedy with sticky suppression** — § 8; SC 11

- _Goal:_ A tripped exact-target signal yields at most one relevant advisory, and typed or recorded prior decisions
  suppress redundant guidance at the layer that owns them.

    - `[x]` **1.3.a Derive a typed one-remedy attention result**
        - Extended the strict request with exact-target scope selection and the closed result union with silent
          selected/degraded arms plus mutually exclusive chunking and bound-delivery remedies; hold-whole judgment
          remains outside CLI state.

    - `[x]` **1.3.b Bind fresh delivery state at the review composition edge**
        - Added a total read-only binding lookup over Git-common plan/state stores, with handler-owned WU resolution,
          exact member validation, coherent terminal-plan binding, and contained ambiguity, corruption, and I/O loss.

    - `[x]` **1.3.c Render judgment suppression in the owning workflow**
        - Integration now honors sticky boundary prose before both attention callsites and dispatches only typed pairs;
          Errand consumers exhaust the same union without acquiring delivery judgment, with package parity and real-CLI
          coverage for disabled, selected, bound, unbound, and degraded results.

- _Outcome:_ One exact changeset signal now selects at most one CLI-composed attention remedy from fresh delivery
  evidence, while the planning record remains the sole owner of semantic hold-whole suppression.

## **Phase 2:** Eligibility and projection identity

_Purpose:_ Prove an operator-authored candidate chain is complete, independently coherent, lifecycle-clean, and
identified through delivery state before any external binding can carry authority.

### `[x]` **2.1 Normalize lifecycle contributions against protected-base state** — § 6; SC 1, SC 8

- _Goal:_ Disposable candidates and non-terminal projections carry none of this WU's active lifecycle contribution,
  without coupling delivery to today's tracked `.arc/` layout or treating a shared derived view as an owned record.

- **Additional Context:** `strategy-storage-evolution.md` § Treat `.arc/` storage as an abstraction;
  `draft-roadmap-tooling.md` § Treat branch-carried project projections as the defect; `adr-022-managed-operational-state-documents.md`
  § Decision

    - `[x]` **2.1.a Resolve repository lifecycle-contribution paths through current authorities**
        - Added a narrow resolver anchored by the active meta and `listCurrentWuArtifactPaths`; it separates the
          semantic readiness projection from WU-owned artifacts and represents external materialization as no path.

    - `[x]` **2.1.b Compare exact candidate entry state with the protected base**
        - Added one pure supplied-path comparison over absent or exact mode/type/object identity; it names all
          mismatches in byte order and ignores unrelated repository entries.

    - `[x]` **2.1.c Revalidate immediately before every non-terminal projection push**
        - Shipped a fail-closed Git revalidation entrypoint that freshly reads both refs and detects contribution
          drift introduced after an earlier successful observation; push callsites retain their later integration proof.

- _Outcome:_ Eligibility, materialization, rewrite, and completeness can now share one storage-resolved path set and
  one exact protected-base comparison without treating the shared readiness view as an owned lifecycle record.

### `[x]` **2.2 Validate candidate-chain gates, order, and completeness** — § 1; SC 1

- _Goal:_ Before delivery state or an external projection binds, an authored cut is accepted only when each exact
  candidate is independently green, descends from its expected predecessor, and the chain reconstructs the
  normalized control contribution exactly.

    - `[x]` **2.2.a Define the exact eligibility snapshot and ancestry contract**
        - Added an ephemeral snapshot over a revalidated stack plan with exact plan/base/control/member coordinates,
          ordered identity, ancestry, non-empty non-terminal deltas, and closed member-naming refusals.

    - `[x]` **2.2.b Run the existing project gate procedure at each pinned head**
        - Shipped the pre/post checkout bracket that reobserves exact head/tree and refuses tracked/index dirt while
          excluding untracked output. Gate execution/outcome remains absent from delivery inputs and belongs to the
          Task 5.1 workflow composition that invokes this mechanical boundary.

    - `[x]` **2.2.c Prove normalized completeness and close the observation window**
        - Added exact recursive-tree normalization and distinct dropped/invented/mismatched reporting, followed by
          fresh source/plan reads and global non-terminal binding checks through read-only dependencies. The result
          remains ephemeral and exact same-member retries are the only admitted prior binding.

- _Outcome:_ Mechanical eligibility now pins and closes one exact disposable chain without accepting gate verdicts
  or write-capable stores; later materialization must rerun it and use only the object identities just reobserved.

### `[ ]` **2.3 Recognize delivery refs without deriving authority from their names** — § 2; SC 2, SC 3

- _Goal:_ `delivery/` refs are excluded from work-unit residue and advisory inference while exact member identity
  remains available only through delivery-state reverse lookup.

    - `[ ]` **2.3.a Exclude the namespace from work-unit branch parsing**
        - Make `branchToWorkUnitSlug` reject `delivery/` and update branch-format/type-prefix guidance in package and
          installed copies.
        - Build `test-first` (one behavior at a time):
            - `delivery/example/chunk` never becomes a work-unit slug
            - Existing `feat/`, `fix/`, and `plan/` branches remain unchanged

    - `[ ]` **2.3.b Suppress false orphan and in-flight artifact classifications**
        - Let the `branchToWorkUnitSlug` exclusion remove delivery refs from orphan and locus WU inference, and add the
          same reserved-prefix exclusion at `isEligibleInFlightBranch`, the actual shared input boundary behind
          active/status discovery and the pre-commit foreign-artifact advisory.
        - When a consumer genuinely needs member identity, reuse `DeliveryStateStore.resolveMember` with exact ref +
          observed head or exact head. Do not add a delivery-state read to the fast offline pre-commit hook merely to
          suppress a recognized namespace, and never parse slug/chunk segments.
        - Build `test-first` (one behavior at a time):
            - A live member produces neither orphan-WU nor missing-record warnings
            - A plausible but unbound delivery name grants no identity
            - Exact bound ref/head resolves; ambiguous or stale binding refuses

    - `[ ]` **2.3.c Pin session and status behavior around live delivery refs**
        - Add `branchToWorkUnitSlug`, `isEligibleInFlightBranch`, locus, orphan-sweep, active/status, and pre-commit
          advisory fixtures proving live and unbound delivery names produce no WU-residue signal, exact state lookup
          remains the only identity source, and unrelated WU discovery is unchanged while a stack is partially landed.

## **Phase 3:** Unlinked materialization and guarded landing

_Purpose:_ Deliver the complete provider-independent execution path: ordered member refs and change requests,
exact-head review admission, one guarded landing, and interruption-safe recovery through the shipped state contracts.

### `[ ]` **3.1 Extend guarded effects and host observation** — § 3, § 10; SC 4, SC 6

- _Goal:_ The single shipped operation slot can reconcile exact Git mutations and host-assigned request/merge
  results without adding a second recovery or authority model.

    - `[ ]` **3.1.a Make operation acceptance kind-aware in place**
        - Extend `DeliveryOperationSnapshotV1`, reservation, acceptance, application, and reconciliation in place.
          Member snapshots include nullable change-request binding alongside ref and coordinates: deterministic
          `materialize`, `rewrite`, and `teardown` effects retain exact requested snapshots, while `publish` and
          `land` pin exact admissible inputs/effects and record one uniquely observed actual result.
        - Add no store, ledger, approval field, compatibility reader, migration, or configuration axis; unpublished
          development state is cleared or regenerated.
        - Build `test-first` (one behavior at a time):
            - Exact deterministic results still require byte-equivalent requested coordinates
            - One admissible host-assigned handle/result records actual coordinates
            - Absent, multiple, foreign, queued, or otherwise ambiguous results retain the reservation
            - Teardown can atomically clear ref, request handle, and obsolete coordinates

    - `[ ]` **3.1.b Define the narrow delivery-host observation boundary**
        - Add provider-neutral operations for unique request lookup/open/read, head-matched merge, and resulting
          protected-target observation; implement GitHub through the existing bounded `gh` process pattern.
        - Consume the configured `merge`, `rebase`, or `squash` strategy and make the baseline boundary refuse queue,
          batch, cross-repository, multiple-match, malformed, or unavailable results. Do not add a capability registry
          or ordering authority; Phase 6 supplies the separately verified native direct adapter.
        - Build `test-first` (one behavior at a time):
            - Repository/head/base identity selects exactly one request
            - Configured strategies map exactly and unknown host behavior refuses closed
            - Host-assigned handles and resulting target coordinates normalize without guessing

    - `[ ]` **3.1.c Preserve exact state and reverse-lookup invariants**
        - Update state application and repository-store fixtures so an accepted `publish` records the observed request
          binding, an accepted `land` records actual landed coordinates, and an accepted deterministic teardown clears
          its exact member bindings while all other member bindings remain stable.
        - Prove no review verdict, authorization, gate result, or provider capability enters `DeliveryStateV1`.

### `[ ]` **3.2 Materialize and bind the ordered member chain** — § 2, § 10; SC 2, SC 6

- _Goal:_ One freshly validated authored cut becomes the exact predecessor-based ref/request chain, with the first
  observable event binding state immediately and every later coordinate mutation reserved.

    - `[ ]` **3.2.a Derive member refs, targets, and terminal omission**
        - Add pure materialization derivation from validated eligibility output: the lowest member targets the
          protected base, each higher non-final member targets its predecessor, and the terminal uses the control
          branch rather than a delivery ref.
        - Build `test-first` (one behavior at a time):
            - Exact plan order produces the expected `delivery/{wu-slug}/{chunkKey}` refs and bases
            - The terminal member produces no delivery ref
            - Ref spelling never becomes a reverse identity input

    - `[ ]` **3.2.b Revalidate, publish the first ref by lease, and bind immediately**
        - Rerun the complete eligibility procedure — workflow-run project gates plus the verb's mechanical and
          lifecycle-contribution validation — then publish only the just-validated first head: absent creates, exact
          retry adopts, and a different remote head refuses.
        - Reobserve immediately and call `constructInitialDeliveryState`; recovery may instead adopt a uniquely
          observed first request. The two arms establish the same plan/member identity without claiming identical
          initially known fields.
        - Build `test-first` (one behavior at a time):
            - A temp bare remote proves absent create, exact retry, and mismatched-head refusal
            - First-ref and first-request recovery each construct once and exact retry is idempotent
            - Lifecycle, collision, or source drift refuses before the prebinding mutation (a red gate already
              stopped the workflow upstream)

    - `[ ]` **3.2.c Reserve the protected target and remaining ref publications**
        - After binding, use `kind: materialize` for the protected target and each remaining non-terminal ref, with
          exact remote leases, pre-push lifecycle comparison, reobservation, versioned state application, and clear.
        - Build `test-first` (one behavior at a time):
            - Every derived ref/base/head enters state in plan order
            - Exact already-applied publication adopts while wrong-head or stale-state movement blocks
            - Partial failure leaves one recoverable reservation and never returns to the prebinding carve-out

    - `[ ]` **3.2.d Publish and uniquely bind member change requests**
        - Use `kind: publish` to open or adopt each non-terminal request through the host-assigned effect contract,
          preserving configured draft/merge-lock posture and exact predecessor targets.
        - Keep review vehicle admission at the later review callsite rather than encoding it as request metadata.
        - Build `test-first` (one behavior at a time):
            - Timeout followed by one exact host match adopts and records its handle
            - Multiple, wrong-head, wrong-base, or cross-repository matches retain the reservation
            - First binding, target binding, remaining refs, and requests converge on one coherent state

### `[ ]` **3.3 Prepare, apply, and recover one exact-head landing** — § 3, § 10; SC 4, SC 6

- _Goal:_ No non-terminal member mutates the protected base without one exact-head authorization, and interruption
  never turns a prior approval into authority for a retry.

    - `[ ]` **3.3.a Prepare the sole landable member and typed interlock result**
        - Compose `deriveDeliveryPosition`, fresh host facts, `assessDeliveryMemberReadiness`, and
          `reserveDeliveryOperation` to select one non-terminal member with every predecessor landed.
        - Run delivery-member readiness unconditionally; merge locking is only an additional configured transition.
          Return the exact member/head, settled review state, merge strategy, and consequence for the workflow
          interlock, and perform no merge.
        - Build `test-first` (one behavior at a time):
            - Terminal, out-of-order, unbound, stale-plan, active-operation, and non-unique-request cases refuse
            - Disabled merge locking still runs readiness
            - Prepare reserves exact admissible inputs, emits one presentation, and calls no merge port

    - `[ ]` **3.3.b Apply only after approval and record the unique host result**
        - On the workflow's post-approval invocation, reobserve Git/host/check/review/target/predecessor facts, release
          the configured lock, recheck the operation precondition, and perform one configured-strategy head-matched
          merge.
        - Uniquely observe the resulting protected target, accept the reserved admissible effect, version-record the
          actual landed coordinates, and clear; the unlinked path refuses queue, batch, prefix, cross-repository, and
          terminal effects.
        - Build `test-first` (one behavior at a time):
            - Approval reaches exactly one member/head and success performs one merge plus one state transition
            - Head, review, check, lock, target, predecessor, or state drift blocks before mutation
            - `merge`, `rebase`, and `squash` map correctly while queued or ambiguous results retain the reservation

    - `[ ]` **3.3.c Reconcile every materialize, publish, and land crash window**
        - Read the reservation first, freshly observe Git/host state, and return strict applied/retryable/blocked
          envelopes with precomposed guidance; never clear on stale tokens, persistence failure, or ambiguity.
        - Cover reservation, external mutation, result persistence, and clear boundaries against temp repositories
          and a substituted host.
        - Prove exact non-application retries once, attended `land` returns to prepare and re-fires the interlock, one
          active operation remains invariant, and no verdict or approval is persisted.

## **Phase 4:** Suffix reconciliation and terminal handoff

_Purpose:_ Preserve contribution identity after each landing, rematerialize deliberate fixes from the retained
control branch, and hand the residual terminal tail to ordinary work-unit integration without a second authority.

### `[ ]` **4.1 Prove retargeted contributions and rebind suffix coordinates** — § 4; SC 5

- _Goal:_ The authored contribution remains the only adoptable identity while parent-changing rewrites advance exact
  delivery bindings safely.

- **Additional Context:** `notes-delivery-stack-topology.md` § Contribution-proof mechanics

    - `[ ]` **4.1.a Acquire and compare exact contribution facts**
        - Pin the four immutable endpoints: before/after predecessor and member heads/trees. Split injected Git fact
          acquisition from a pure comparator: complete member-tree equality accepts first; otherwise emit and compare
          one canonical aggregate, whitespace-preserving patch identity for each predecessor-exclusive/member-inclusive
          contribution.
        - Specify a strict byte protocol/parser across repository object formats; include binary, rename, and mode
          changes and refuse unavailable, malformed, or non-linear evidence. Commit reorder/squash is immaterial when
          the aggregate contribution remains exact.
        - Build `test-first` (one behavior at a time):
            - Exact trees accept without invoking patch acquisition
            - Changed-parent equivalent aggregate contributions accept, including binary/mode/rename cases
            - Whitespace-only, added, dropped, malformed, missing-object, or non-linear evidence refuses closed
            - Strict parsing accepts SHA-1 and SHA-256 object widths and rejects truncated output
        - Add unit coverage plus real temp-repository fixtures for changed-parent/rebased heads.

    - `[ ]` **4.1.b Plan explicit and host-initiated suffix retargets from fresh facts**
        - Keep `rewrite` deterministic and exact. For executor-requested movement, reserve before mutation normally.
          For already-observed host movement, first prove one coordinate-defined candidate: exactly the current
          first-unlanded member; stored predecessor just landed; unique request/ref base equals the protected target;
          contribution is equivalent; every other member/target coordinate is exact; and no operation is active.
        - After proof, CAS-persist a post-observation exact `rewrite` reservation whose `before` is recorded state and
          `requested` is the observed snapshot, then reobserve and use ordinary reconciliation. Add a
          reconciliation-specific position read for this one tolerated movement; do not weaken
          `deriveDeliveryPosition` or trust delete-on-merge/native provenance labels.
        - Before the executor-requested retarget push, invoke Task 2.1.c's lifecycle-contribution revalidation
          entrypoint; the host-initiated recognition arm performs no ARC push and is exempt.
        - Build `test-first` (one behavior at a time):
            - Only the immediate suffix member can retarget
            - A retarget push carrying a fresh lifecycle contribution refuses before mutation
            - Explicit and uniquely observed movement converge on deterministic exact reconciliation
            - Movement between recognition, reservation, and reobservation blocks
            - Request/ref disagreement, a second moved member, stale state, or an active operation blocks

    - `[ ]` **4.1.c Reserve, prove, and version-rebind current coordinates**
        - Execute `kind: rewrite`, reobserve, prove contribution, and publish one accepted-state CAS update containing
          the current ref, `coordinates.base/head/tree`, retained request handle, and `activeOperation: null`.
          Request target remains fresh host observation rather than a new state field; CAS failure leaves the
          persisted reservation unchanged.
        - Leave the rebound head's review applicability to existing readiness; copy no verdict or clearance.
        - Build `test-first` (one behavior at a time):
            - Applied adopts, non-applied retries, and ambiguous retains the reservation
            - A version conflict cannot overwrite newer bindings
            - Rebinding creates no delivery-owned review evidence

### `[ ]` **4.2 Rematerialize review fixes and retire proven-landed residue** — § 4; SC 5, SC 6

- _Goal:_ The control branch is the sole durable correction source, and only state-proven landed residue becomes
  disposable.

    - `[ ]` **4.2.a Re-cut and validate the affected suffix from the control branch**
        - Accept a complete freshly authored unlanded suffix from the retained control branch and run the shared
          eligibility, lifecycle-contribution, and materialization services before reserving each rewrite. The 2.2.b
          tier split applies: the workflow re-runs project gates on the re-cut suffix, and a red gate stops before
          any rewrite reservation. The landed prefix is immutable; explicitly selected unlanded members may change
          deliberately, while every other suffix member must prove carried contribution.
        - Refuse direct delivery-ref editing. Route semantic repartition or coverage movement through
          `classifyDeliveryPlanAmendment` before re-cut rather than treating it as a rewrite.
        - Build `test-first` (one behavior at a time):
            - A selected member fix plus equivalent higher suffix validates and rematerializes
            - An accidental higher-suffix change, lifecycle contribution, or invalid completeness refuses before push
            - Attempted repartition returns to plan amendment and the landed prefix remains exact

    - `[ ]` **4.2.b Teardown only proven-landed ref and request residue**
        - Select a proven-landed member from plan/state plus fresh host facts, reserve deterministic `kind: teardown`,
          compare-and-delete its exact delivery ref or adopt exact absence, and freshly observe its uniquely bound
          request as merged/closed without mutating the provider request.
        - Atomically clear ref, request handle, and obsolete coordinates through the accepted-state write. Reuse the
          Phase 3 Git mutation and host-read seams; add no provider registry or landed ledger.
        - Build `test-first` (one behavior at a time):
            - Exact present residue deletes and exact absence adopts idempotently
            - Wrong-head ref, open/mismatched request, unknown member, or unavailable landed proof blocks
            - Ref absent plus unavailable/mismatched request proof retains the recoverable reservation

    - `[ ]` **4.2.c Prove rewrite and teardown crash recovery without new state**
        - Exercise applied, retryable, ambiguous, and version-conflict outcomes for both kinds through the existing
          operation contract and repository store.

### `[ ]` **4.3 Absorb the landed base and adopt terminal work-unit integration** — § 5; SC 7, SC 8

- _Goal:_ Ordinary work-unit integration receives only the residual tail and remains the terminal merge authority.

    - `[ ]` **4.3.a Derive absorption readiness and perform ordinary base reconciliation**
        - Return `absorption-ready`, `already-absorbed`, or `blocked` from every non-terminal member landed, no active
          operation, reconciled suffix coordinates, exact retained control ref/head, and fresh target facts.
        - On `absorption-ready`, invoke the ordinary reversible WU base merge against the unbound control branch and
          rerun Tier 1. This is not delivery projection mutation and takes no reservation.
        - Build `test-first` (one behavior at a time):
            - Each missing precondition refuses independently
            - Already-absorbed is idempotent and absorption-ready performs one append-only merge
            - Dirty, conflicting, or stale-base inputs stop without a delivery reservation

    - `[ ]` **4.3.b Derive terminal readiness and prove the residual tail**
        - Re-read after absorption and return terminal-ready only when the exact base merge is observed and the
          comparison exposes solely the residual contribution. Keep the terminal state member unbound throughout
          integration preparation and refuse it from the delivery-member landing path.
        - Build `test-first` (one behavior at a time):
            - Landed-prefix paths disappear from the terminal diff while residual work remains
            - Control history is never rebased or force-pushed
            - Missing absorption, changed prefix, or unplanned contribution blocks handoff

    - `[ ]` **4.3.c Adopt the observed work-unit merge without a second authorization**
        - Add one total typed post-merge attachment immediately after ordinary integration confirms the request merged
          and before `arc user close` or branch teardown. It is `not-applicable` for ordinary work units.
        - Authenticate the delivery terminal from the request's exact final merged head/result plus retained
          control-ref identity, recheck prefix/contribution, and atomically bind terminal ref/request/landed
          coordinates. Mint no reservation, authorization, or closeout proof, and require no delivery rebinding while
          Phase 2 advances the control head.
        - Build `test-first` (one behavior at a time):
            - Exact ordinary merge and already-merged resume each record once; repeated adoption is idempotent
            - Wrong head, incomplete prefix, or unplanned contribution refuses
            - `delivery-member` refuses the terminal while `work-unit` readiness admits it
        - Contract-test that the attachment sits after confirmed merge and before close/teardown, while all other
          Phase 2 behavior remains byte-equivalent.

## **Phase 5:** Lifecycle execution and orientation

_Purpose:_ Make delivery reachable and resumable through owned workflow, discovery, session-init, and integration
attachment points while keeping deterministic dispatch and user-facing text in typed CLI surfaces.

### `[ ]` **5.1 Compose the delivery workflow over typed results** — § 7, § 10; SC 4–SC 7

- _Goal:_ Operators have one resumable attended procedure whose prose dispatches typed outcomes without acquiring
  Git, host, review, or merge authority.

- **Additional Context:** `strategy-procedure-evolution.md` § Self-Check: run this before building

    - `[ ]` **5.1.a Add the packaged delivery execution workflow**
        - Author `packages/arc-framework/arc/system/workflows/arc/supplemental/deliver-stack.md` and its installed
          `.arc/` mirror to invoke materialize, review, land, reconcile, teardown, and terminal-handoff verbs. Add the
          package file to `init-recipe.json`, verify its default `Framework` classification and framework-sync byte
          identity, and do not add it to `CONFIGURABLE_FILES`.
        - Reuse the existing review command/method sequence with the exact
          `{ planId, deliverableId, workUnitSlug }` delivery-member vehicle; declare and mark the methods/extensions
          that sequence actually fires. Add no second member-review verb or ordinary-WU composition side effect.
        - Render precomposed text and preserve one integration interlock per non-terminal landing effect: one exact
          member/head for the unlinked arm, or the complete authorized member/head set plus the § 9 residual-race
          disclosure for the optional native atomic arm. Terminal handoff delegates to ordinary integration's
          existing interlock and adds no delivery interlock.
        - Keep shipped workflow commands as bare `arc ...`; no repository-local invocation convention ships.

    - `[ ]` **5.1.b Expose strict execution verbs over the Phase 2–4 services**
        - Extend the `arc delivery` group, command schemas, input declarations, and infrastructure policies while
          splitting execution handling from the existing authoring-heavy `delivery.ts`.
        - Register argv over Phase 3's provider-neutral prepare/apply/reconcile envelopes; do not duplicate its host,
          readiness, reservation, or recovery logic in handlers or prose.
        - Build `test-first` (one behavior at a time):
            - Each handler preserves and validates its service's closed verb-specific union, including every
              applicable ready/applied, refused, retryable, blocked, or ambiguous arm; no handler-level normalization
              invents unused variants or reinterprets results in prose
            - Every coordinate mutation requires a reservation except the three specified carve-outs
            - CLI handlers never prompt for a judgment the workflow owns

    - `[ ]` **5.1.c Order exact-head review, authorization, and reconciliation**
        - Dispatch prepare before the interlock and apply only after approval; advance to the next member only after
          the current effect and any remaining suffix reconciliation settle. A retryable landing returns to prepare
          and a new interlock rather than reusing approval.
        - Build workflow/integration contract coverage for exact-head-set approval scope, unconditional readiness,
          configured lock release, prepare/apply stop placement, retry reauthorization, terminal vehicle transition,
          and the post-merge adoption attachment's placement before close/teardown. Both fresh-merge and
          already-merged resume enter exactly one adoption call; repeated resume is idempotent, an ordinary WU returns
          `not-applicable`, and no member/head outside the approved set inherits authorization. Assert no other Phase 2
          ordering or behavior changes.

### `[ ]` **5.2 Surface bound delivery position as an independent session-init probe** — § 7; SC 9

- _Goal:_ The owning control locus receives one durable progress line while delivery-state failure degrades without
  perturbing any other session evidence.

    - `[ ]` **5.2.a Derive and precompose the delivery-position view**
        - At a resolved owning control-WU locus, enumerate current plans through `DeliveryPlanStore`, select by exact
          `workUnitId`, require at most one match, and read its state by `planId`; do not use member reverse lookup or
          parse the task-list projection as authority.
        - Reuse Phase 3's bounded host-observation boundary to acquire fresh read-only delivery-position facts without
          fetching objects, updating refs, writing state, or prompting. For clean state, reuse strict
          `deriveDeliveryPosition`; for an active reservation, add a separate orientation projection over the same
          kind-aware reconciliation evidence and leave the readiness function's `operation-active` refusal intact.
        - Precompose one line from structured landed/total counts and active operation kind/identity or none.
        - Build `test-first` (one behavior at a time):
            - No plan or one canonical plan without state is authoritative unbound and silent
            - Multiple current plans, dangling state, identity/digest mismatch, or unavailable observation fails only
              this probe
            - Bound clean and active-operation positions emit one exact line
            - Active-operation observation accepts only the operation contract's exact recognized facts and never
              weakens execution readiness or reconciles state

    - `[ ]` **5.2.b Carry the slot through the status envelope**
        - Add typed fields through status types, run composition, strict schema/presence checks, production handlers,
          formatting, fixtures, and JSON envelope tests.
        - Pin the public shape as an optional owning-locus `Probe<DeliveryPositionView | null>`: omit it elsewhere,
          return `ok` + null for authoritative unbound state, return structured fields plus one non-empty precomposed
          line for a coherent binding, and return the probe's error arm when bound evidence degrades.
        - Build `test-first` (one behavior at a time):
            - A healthy slot renders once
            - A failed slot reports degradation while every unrelated probe remains deep-equal
            - No per-member locus or role is synthesized

    - `[ ]` **5.2.c Dispatch the precomposed line from session-init**
        - Update the probe-envelope reference and session-init package template/installed copy to consume the slot
          without a second state read or prose-side coordinate derivation.
        - Update the registered strict envelope, human formatter, session-init compatibility goldens, and package plus
          installed workflow contracts so the JSON-carried precomposed line is the sole narration authority.
        - Add an integration fixture with a canonical Delivery Plan section and prove `taskCursor`, derived-locus
          cursor, load set, active/session type/workflow state, and recommendation output are unchanged by the
          projection; failure isolation preserves every sibling slot.

### `[ ]` **5.3 Attach discovered entry and integration-time delivery guidance** — § 7, § 8; SC 10, SC 11

- _Goal:_ Late delivery entry is discoverable and honestly costed without turning planning decisions or attention
  metrics into gates.

    - `[ ]` **5.3.a Add the operator-invoked discovered entry**
        - Add one read-only delivery-entry inspection verb over authoritative plan/state/task-list facts with the
          closed result union `not-applicable | authoring-required | canonicalize-provisional | validate-canonical |
          resume-bound | refused` and precomposed later-entry cost/action text.
        - Treat cohesion and candidate selection as attended boundary judgment supplied by the workflow; never infer
          them from size, branch shape, repository content, or the presence of a provisional heading. The verb performs
          no plan/state write or external mutation.
        - Build `test-first` (one behavior at a time):
            - No authored intent routes to authoring with honest later-entry cost
            - Reviewed provisional, canonical unbound, and coherent bound loci select their exact distinct routes
            - Malformed, ambiguous, or incoherent evidence refuses without being treated as absence
            - Every arm performs zero plan/state and external writes

    - `[ ]` **5.3.b Dispatch the discovered door through the delivery workflow**
        - Route `authoring-required` through attended authoring, `canonicalize-provisional` through the existing strict
          design-inventory / `from-tasks` / author-slot / compose path, `validate-canonical` through complete eligibility,
          and `resume-bound` through delivery position/reconciliation before further execution.
        - A provisional section becomes canonical only after the workflow confirms the prior attended delivery
          disposition; canonicalization publishes replaceable intent and remains unbound until eligibility and the
          first observed materialization event.
        - Build `test-first` (one behavior at a time):
            - Every typed route dispatches only its named existing surface
            - Refusal stops before eligibility or mutation and renders the precomposed remedy verbatim
            - No workflow prose parses headings, derives members, or re-decides cohesion

    - `[ ]` **5.3.c Verify attachment ownership without duplicating it**
        - Treat Task 1.1 as owner of generated planning entry, Task 1.3 as owner of both integration attention
          callsites, and Task 4.3 as owner of terminal precondition/adoption; Phase 5 only connects the discovered door
          to the delivery-owned workflow and verifies those existing attachments.
        - Contract-test that Phase 1 attention remains advisory and outside the mutation window, while fresh-merge and
          already-merged resume both cross Task 4.3's one total post-merge adoption call immediately before
          `arc user close`. Assert it is the only Phase 2 addition and ordinary integration retains readiness,
          authorization, merge, closeout, and teardown authority unchanged.

## **Phase 6:** Optional native-stack composition

_Purpose:_ Add the preview host's native-stack ergonomics as a fresh-observation adapter over the complete unlinked
executor, preserving plan/state authority and an explicit downgrade path.

### `[ ]` **6.1 Observe and register an already-materialized native stack** — § 9; SC 12

- _Goal:_ Host-native presentation is added only after ARC's exact chain exists, with fresh host observation as the
  sole arm selector.

- **Additional Context:** `notes-delivery-stack-topology.md` § GitHub native stacked pull requests — host-facts
  snapshot (2026-08-11)

    - `[ ]` **6.1.a Define provider-neutral native composition facts and ports**
        - Model observed registered, unregistered, partial/incoherent-registration, unsupported, unavailable, and
          malformed host outcomes outside canonical plan/state schemas; the partial and incoherent-registration
          arms carry the exact affected member identities.
        - Build `test-first` (one behavior at a time):
            - Every observed arm is closed and distinguishable
            - Partial or incoherent registration names the exact affected members
            - Cross-repository/fork and non-chain inputs refuse
            - No native-stack field is written to plan or delivery state

    - `[ ]` **6.1.b Implement the GitHub preview adapter from verified live signatures**
        - Re-verify link, observation, and async-merge API shapes immediately before implementation.
        - Register through the narrow raw Stacks API, never `gh stack link` porcelain — its convenience layer may
          push branches, open pull requests, or correct bases, mutations outside the presentation-only carve-out.
        - Register the already-materialized externally-managed chain without creating, reordering, or trusting refs;
          normalize preview refusal/capability failure without exposing credentials or raw output. Command handlers
          return closed verb-specific envelopes with precomposed safe action text; workflow prose never parses raw
          provider output or decides cleanup.
        - Use substituted adapter tests rather than a live preview dependency in the suite.

    - `[ ]` **6.1.c Expose opt-in link as a presentation-only carve-out**
        - Link only on explicit operator invocation, then reobserve; write neither plan nor delivery state.
        - Build `test-first` (one behavior at a time):
            - Opt-in links the exact current chain
            - Opt-out performs no host call and leaves unlinked behavior identical
            - Partial or refused linking returns the explicit downgrade posture

### `[ ]` **6.2 Land one linked head or the exact remaining set** — § 9; SC 12

- _Goal:_ Only the host mutation arm changes; every included exact head retains the unlinked executor's ordering,
  review, authorization, reservation, and contribution contracts.

    - `[ ]` **6.2.a Select the landing arm from immediate host observation**
        - Require a registered stack and merge-commit strategy for the linked arm; unregistered, unsupported, or
          incompatible cases compose unlinked.
        - Expose the all-remaining arm only on explicit invocation in direct-merge mode. Exactness is ARC's
          authorization subject, not a server payload: derive the expected remainder from validated plan/state plus
          fresh host observation and require the observed host stack to match it exactly at arm selection. Queue
          mode refuses or visibly downgrades because it may split the prefix into merge groups.
        - Build `test-first` (one behavior at a time):
            - Registered plus merge-commit selects linked
            - Opt-out, unregistered, unsupported, and non-merge strategies select unlinked
            - Explicit invocation with an exactly matching observed remainder selects atomic; queue mode refuses
            - Ambiguous observation blocks or downgrades explicitly, never guesses

    - `[ ]` **6.2.b Execute one asynchronous authorized effect**
        - Preserve the single-bottom-member path — a singleton pinned-head merge under ordinary integration trust.
          For explicit all-remaining invocation, derive the complete ordered non-terminal remainder as exactly
          `plan.members.slice(landedPrefix.length, -1)`, independently run exact-head readiness/review/check/lock
          validation for every member, reserve one `land` effect over that exact set, and present one interlock
          naming every head, the atomic consequence, and the § 9 residual-race disclosure; never include the
          terminal WU member. A partially released merge lock stops before submission with an explicit safe
          re-hold remedy.
        - Submit only after fresh set-wide exact reobservation, pinning the selected top change request's head.
          Attach the host-assigned effect identity to the active operation through an idempotent version-checked
          transition distinct from the pre-reservation `operationId`; poll/reobserve after restart, honoring `409`
          existing-request recovery and the documented result-expiry window; add no second operation record or
          provider registry.
        - Build `test-first` (one behavior at a time):
            - Default linked landing submits exactly one bottom member
            - Atomic landing submits the selected top head only after set-wide validation and one interlock naming
              the exact remainder
            - Any included head/check/review/lock drift blocks before submission
            - The effect identity survives restart; timeout/failure retains the reservation
            - Adoption is kind-aware: all-landed adopts only after the submitted set and resulting coordinates are
              authoritatively observed; none-landed retries only under a new interlock; partial or unexpected
              effects block

    - `[ ]` **6.2.c Reconcile single-member retarget and atomic crash windows**
        - Feed the observed next-member head/target into Task 4.1's recognized-result path.
        - Require the same tree/patch contribution proof and new-head review admission; copy no verdict.
        - Model effect observation as a closed union — `pending`, `all-landed`, `none-landed`, `partial-landed`,
          `unavailable`, `ambiguous`.
        - For atomic submission, distinguish identity-persisted polling from the submission-before-persist crash
          window; fresh all/none facts may adopt a completed effect, but unresolved none-applied state blocks rather
          than risking duplicate submission. An atomic success has no non-terminal suffix to retarget.

### `[ ]` **6.3 Degrade visibly to the complete unlinked executor** — § 9; SC 12

- _Goal:_ Preview loss changes only operator-visible composition status, never the complete sequential delivery
  semantics.

    - `[ ]` **6.3.a Unlink or confirm unlinked, then reobserve**
        - On capability regression or refusal, remove presentation linkage when possible and derive the next arm
          only from a fresh host read. The unlink result is a closed union: only fresh authoritative `unregistered`
          composes the unlinked executor; `still-linked`, `partial`, `unavailable`, `malformed`, and `ambiguous`
          stop without a landing mutation.
        - Build `test-first` (one behavior at a time):
            - Successful unlink and already-unlinked state converge
            - Link disappearance is recognized without state mutation
            - Every non-`unregistered` unlink outcome stops without a landing mutation
            - Unlink refusal blocks with one explicit remedy

    - `[ ]` **6.3.b Prove differential parity with the complete unlinked executor**
        - Run opt-out and mid-stack downgrade fixtures through the same materialize/land/reconcile/terminal services.
        - For opt-out before any native effect, assert identical refs, targets, reservations, state revisions,
          review admissions, and terminal handoff; only the downgrade advisory may differ.
        - After linked activity, compare the remainder's command/service trace and a semantic final projection —
          never raw operation IDs, change-request IDs, CAS revisions, intermediate object IDs, or review-admission
          history.
        - Compare an atomic all-remaining success with sequential landing at the final protected tree/state outcome;
          only the provider operation grouping and interlock cardinality may differ.

    - `[ ]` **6.3.c Exercise the substituted-host lifecycle end to end**
        - Cover the separated scenarios: opt-out sequential baseline; linked singleton plus recognized retarget;
          direct atomic success; atomic refusal then successful unlink and sequential remainder; capability
          regression/already-unlinked; queue refusal; and unlink refusal/unavailable stop — each through terminal
          adoption.
        - Assert exact host-call order, exact-head-set authorization, no provider-order authority, terminal
          exclusion, and no unexpected native calls.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Candidate validation proves every authored member green, lifecycle-clean, ordered, and complete before any
  canonical binding or external authority is created.
- `[ ]` Materialization builds the exact predecessor-targeted `delivery/` chain and binds the first observed external
  event once.
- `[ ]` Work-unit parsing, orphan cleanup, and pre-commit advisories never misclassify a live delivery ref.
- `[ ]` Every non-terminal landing is exact-head reviewed, authorized over its exact member set, merge-locked,
  reobserved, and version-recorded; only the native direct atomic arm may group the complete remaining set.
- `[ ]` Suffix reconciliation accepts only tree- or patch-equivalent movement and rematerializes intentional fixes
  from the retained control branch.
- `[ ]` Every used reserved operation resumes as already-applied, safely retryable, or blocked on ambiguity without
  duplicating mutation.
- `[ ]` Terminal entry requires the complete landed prefix and absorbed base, uses the control branch and work-unit
  vehicle, and adds only the total post-merge adoption attachment before ordinary close/teardown.
- `[ ]` A partially landed stack leaves the protected base free of this WU's active lifecycle contribution and
  leaves unrelated session/status resolution unchanged.
- `[ ]` Session-init renders one independently degradable delivery-position line for bound control loci.
- `[ ]` `assess-boundary-fit` and all three planning fire points install, update, and suppress decided outcomes
  coherently, including the supported provisional-to-canonical task-list plan lifecycle.
- `[ ]` The changeset advisory-threshold rename is complete and every target receives at most one non-gating,
  delivery-aware remedy.
- `[ ]` Native linking remains optional, exact-head, merge-commit-only, supports only single-bottom or explicitly
  authorized all-remaining direct atomic landing with the residual race disclosed at the interlock, and visibly
  degrades to the complete unlinked executor with equivalent delivery semantics.
- `[ ]` This task list carried a reviewed provisional self-delivery cut, and its own finalization replaced that
  locus with the canonical sentinel-wrapped plan without perturbing task parsing.
- `[ ]` All quality gates pass (tests, linting, type checking, and build).
- `[ ]` Ready for integration.
