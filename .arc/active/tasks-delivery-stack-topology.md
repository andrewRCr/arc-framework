# Task List: Delivery Stack Topology

- **Design:** `spec-delivery-stack-topology.md`

---

<!-- arc:delivery-plan:start -->
## Delivery Plan

- **Plan Revision:** `9`
- **Plan Digest:** `sha256:d860e95ed23c52b73c4d18f946ec0e54cbaaf7ab78078b0f0ed28e43eaf46052`
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

| #   | Tasks                                 | Design elements                  |
| --- | ------------------------------------- | -------------------------------- |
| 1   | `1.1`, `1.2`, `1.3`                   | `rfc:§ 7`, `rfc:§ 8`             |
| 2   | `2.1`, `2.2`, `2.3`, `2.R.1`          | `rfc:§ 1`, `rfc:§ 2`, `rfc:§ 6`  |
| 3   | `3.1`, `3.2`, `3.3`, `3.R.1`, `3.R.2` | `rfc:§ 10`, `rfc:§ 2`, `rfc:§ 3` |
| 4   | `4.1`, `4.2`, `4.3`, `4.R.1`, `4.R.2` | `rfc:§ 4`, `rfc:§ 5`             |
| 5   | `5.1`, `5.2`, `5.3`, `5.R.1`          | `rfc:§ 10`, `rfc:§ 7`, `rfc:§ 8` |
| 6   | `6.1`, `6.2`, `6.3`, `6.R.1`          | `rfc:§ 9`                        |

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

### `[x]` **2.3 Recognize delivery refs without deriving authority from their names** — § 2; SC 2, SC 3

- _Goal:_ `delivery/` refs are excluded from work-unit residue and advisory inference while exact member identity
  remains available only through delivery-state reverse lookup.

    - `[x]` **2.3.a Exclude the namespace from work-unit branch parsing**
        - Reserved `delivery/` in `branchToWorkUnitSlug` while preserving ordinary type prefixes, and documented the
          presentation-only namespace identically in package and installed branch-format methods.

    - `[x]` **2.3.b Suppress false orphan and in-flight artifact classifications**
        - Excluded the namespace at the shared in-flight boundary and parser-driven orphan/locus paths without adding
          state reads to offline discovery; existing exact ref/head reverse lookup remains the sole identity authority.

    - `[x]` **2.3.c Pin session and status behavior around live delivery refs**
        - Added parser, in-flight, active/status, orphan, and locus fixtures proving live or cached delivery names stay
          silent while unrelated WUs remain discoverable; reverse-lookup integration retains exact/stale/ambiguous proof.

- _Outcome:_ Delivery ref names are now recognized only enough to suppress false WU residue. Any consumer needing a
  member identity must still establish it through the existing exact delivery-state binding boundary.

## **Phase 2.R:** Fresh eligibility authority

_Purpose:_ Complete the eligibility member's executable contract by keeping lifecycle discovery, gate bracketing, and
closed candidate authority inside one fresh mutation path.

### `[x]` **2.R.1 Bind mutation to fresh candidate eligibility**

- _Goal:_ No external mutation can rely on caller-serialized eligibility or lifecycle-path claims.

- _Amendment:_ Workflow prose remains the authority that runs project gates; the standalone CLI neither receives a
  gate verdict nor gains a gate resolver. The mutation path instead rejects serialized snapshots, resolves current
  plan and lifecycle facts itself, and re-establishes exact post-gate checkout and mechanical eligibility immediately
  before mutation. An interrupted workflow reruns its gate sequence.

- _Outcome:_ Materialization and publication now accept only a plan ID plus candidate refs and checkout locators,
  resolve the canonical plan and lifecycle paths, close fresh mechanical eligibility, recheck the path set, and
  consume the in-memory snapshot without exposing it as caller authority. Workflow and tests preserve gate ownership,
  rerun-on-interruption behavior, and refusal on snapshot replay, checkout movement, or lifecycle-path movement.

## **Phase 3:** Unlinked materialization and guarded landing

_Purpose:_ Deliver the complete provider-independent execution path: ordered member refs and change requests,
exact-head review admission, one guarded landing, and interruption-safe recovery through the shipped state contracts.

### `[x]` **3.1 Extend guarded effects and host observation** — § 3, § 10; SC 4, SC 6

- _Goal:_ The single shipped operation slot can reconcile exact Git mutations and host-assigned request/merge
  results without adding a second recovery or authority model.

    - `[x]` **3.1.a Make operation acceptance kind-aware in place**
        - Operation snapshots now carry nullable request bindings. Deterministic effects remain byte-exact, while
          strict publish/land effects accept only their matching typed host observation and apply its actual result.

    - `[x]` **3.1.b Define the narrow delivery-host observation boundary**
        - Added a provider-neutral request/merge/target port and a bounded GitHub adapter that uniquely matches exact
          repository/head/base facts, maps all three merge strategies, and refuses malformed or unavailable evidence.

    - `[x]` **3.1.c Preserve exact state and reverse-lookup invariants**
        - Accepted request and landed-coordinate results round-trip through the existing state store; teardown clears
          exact bindings without disturbing other members, and reverse lookup remains ref/head based.

- _Outcome:_ The existing single reservation slot now covers deterministic and host-assigned effects without a new
  authority record: ambiguous host evidence retains the reservation, and delivery state still excludes review,
  authorization, gate, and capability claims.

### `[x]` **3.2 Materialize and bind the ordered member chain** — § 2, § 10; SC 2, SC 6

- _Goal:_ One freshly validated authored cut becomes the exact predecessor-based ref/request chain, with the first
  observable event binding state immediately and every later coordinate mutation reserved.

    - `[x]` **3.2.a Derive member refs, targets, and terminal omission**
        - Fresh eligibility snapshots now derive exact plan-ordered refs and predecessor bases while retaining explicit
          member IDs; the terminal projects the control coordinates and no delivery ref or request target.

    - `[x]` **3.2.b Revalidate, publish the first ref by lease, and bind immediately**
        - Added exact remote absent-create/exact-adopt/collision leases and immediate first-ref state construction,
          plus the asymmetric unique-first-request recovery arm through the same constructor.

    - `[x]` **3.2.c Reserve the protected target and remaining ref publications**
        - Bound target and member-coordinate transitions run plan-order through `materialize` reservations, CAS state
          application, and exact ref publication; any failed external step leaves the persisted reservation intact.

    - `[x]` **3.2.d Publish and uniquely bind member change requests**
        - Each non-terminal request now reserves its exact repository/head/base/posture effect, opens only when absent,
          reobserves uniquely, and records the host-assigned binding without introducing review metadata.

- _Outcome:_ A closed eligibility snapshot now becomes one exact predecessor chain: the first observable event binds
  state, every later coordinate mutation uses the single reservation slot, and the terminal remains ordinary control
  branch authority.

### `[x]` **3.3 Prepare, apply, and recover one exact-head landing** — § 3, § 10; SC 4, SC 6

- _Goal:_ No non-terminal member mutates the protected base without one exact-head authorization, and interruption
  never turns a prior approval into authority for a retry.

    - `[x]` **3.3.a Prepare the sole landable member and typed interlock result**
        - Preparation now composes exact plan position, unique open-request facts, unconditional delivery readiness,
          and one land reservation into a transient member/head/strategy/consequence presentation without merging.

    - `[x]` **3.3.b Apply only after approval and record the unique host result**
        - Apply echoes the authorized member/head identity, freshly rechecks request and readiness facts, releases an
          optional lock, rechecks the reservation, performs one head-matched merge, and records the observed target.

    - `[x]` **3.3.c Reconcile every materialize, publish, and land crash window**
        - Recovery now returns closed applied/retryable/blocked guidance, retains reservations on ambiguity or CAS
          failure, and routes attended land nonapplication back through a new prepare/interlock cycle.

- _Outcome:_ Provider-independent execution now reaches one exact, attended non-terminal landing while preserving
  single-operation crash recovery; no workflow approval or review verdict becomes durable delivery state.

## **Phase 3.R:** Observational execution guards

_Purpose:_ Complete the unlinked executor's mutation and recovery brackets with fresh repository and host facts at
each existing reserved-operation boundary.

### `[x]` **3.R.1 Guard materialization and exact initial-request recovery**

- _Goal:_ Each ref, target, and first-request effect is authorized by fresh observations around its reservation and is
  recoverable only from the exact external event the current plan permits.

- _Outcome:_ Materialization now rechecks the persisted reservation and exact remote ref around each effect, records
  only reobserved results, and leaves the operation reserved on movement. First publication adopts only one exact
  open request before falling back on absence to the leased ref path; interrupted exact ref publication is idempotent.

### `[x]` **3.R.2 Make ordinary landing and recovery observational**

- _Goal:_ Landing and crash recovery decide from fresh Git and host facts for the persisted operation kind, never from
  reservation self-comparison or caller-authored observation JSON.

- _Outcome:_ Ordinary landing now reacquires repository-derived position, request, readiness, target, and contribution
  facts on both sides of lock release and accepts only the exact merged effect. Recovery accepts locator inputs only,
  dispatches from the persisted operation kind, and retains the reservation whenever evidence is unavailable or mixed.

## **Phase 4:** Suffix reconciliation and terminal handoff

_Purpose:_ Preserve contribution identity after each landing, rematerialize deliberate fixes from the retained
control branch, and hand the residual terminal tail to ordinary work-unit integration without a second authority.

### `[x]` **4.1 Prove retargeted contributions and rebind suffix coordinates** — § 4; SC 5

- _Goal:_ The authored contribution remains the only adoptable identity while parent-changing rewrites advance exact
  delivery bindings safely.

- **Additional Context:** `notes-delivery-stack-topology.md` § Contribution-proof mechanics

    - `[x]` **4.1.a Acquire and compare exact contribution facts**
        - A strict byte-framed SHA-1/SHA-256 protocol now compares complete member trees first, then exact binary,
          mode, rename, and whitespace-preserving aggregate Git patches across four verified linear endpoints.

    - `[x]` **4.1.b Plan explicit and host-initiated suffix retargets from fresh facts**
        - A separate recognition read tolerates only the moved immediate suffix member; exact request/base facts and
          equivalent contribution post-reserve host movement, while explicit rewrites revalidate lifecycle paths.

    - `[x]` **4.1.c Reserve, prove, and version-rebind current coordinates**
        - Exact old-head leases and deterministic `rewrite` reservations converge through reobservation and CAS,
          retaining the request handle and reservation on ambiguity or version conflict without copying review state.

- _Outcome:_ Suffix movement now has one contribution identity and one convergence path whether initiated explicitly
  or first observed at the host; ordinary delivery position remains strict outside this reconciliation boundary.

### `[x]` **4.2 Rematerialize review fixes and retire proven-landed residue** — § 4; SC 5, SC 6

- _Goal:_ The control branch is the sole durable correction source, and only state-proven landed residue becomes
  disposable.

    - `[x]` **4.2.a Re-cut and validate the affected suffix from the control branch**
        - Complete closed suffix snapshots now preserve the exact landed prefix, reject delivery-ref authoring, allow
          contribution changes only for selected unlanded members, prove every other member carried, and route any
          proposed semantic plan change through the amendment classifier before producing rewrite requests.

    - `[x]` **4.2.b Teardown only proven-landed ref and request residue**
        - Fresh position and request facts now select one landed nonterminal, persist a deterministic teardown, lease
          deletion against the request's exact head or adopt absence, reobserve merged/closed identity, and clear ref,
          request, and coordinates atomically; post-reservation refusal retains the operation for recovery.

    - `[x]` **4.2.c Prove rewrite and teardown crash recovery without new state**
        - Deterministic rewrite and teardown reservations both adopt exact application, retry exact nonapplication,
          retain ambiguity, and rely on the existing revisioned state-store CAS for conflict isolation.

- _Outcome:_ Review fixes and landed cleanup now converge through the same single-operation state authority: authored
  control-branch suffixes remain the correction source, while deletion is limited to independently proven residue.

### `[x]` **4.3 Absorb the landed base and adopt terminal work-unit integration** — § 5; SC 7, SC 8

- _Goal:_ Ordinary work-unit integration receives only the residual tail and remains the terminal merge authority.

    - `[x]` **4.3.a Derive absorption readiness and perform ordinary base reconciliation**
        - A pure three-arm decision now requires the complete landed prefix, inactive operation slot, exact target and
          retained control, clean worktree, and reconciled suffix; only its pinned ready intent invokes one ordinary
          append-only merge followed by Tier 1, while exact absorption is an idempotent no-op.

    - `[x]` **4.3.b Derive terminal readiness and prove the residual tail**
        - Terminal readiness now follows only an exact absorbed decision, an unbound terminal member, and the shared
          four-endpoint contribution proof; the existing delivery landing boundary continues to exclude the terminal.

    - `[x]` **4.3.c Adopt the observed work-unit merge without a second authorization**
        - One total CAS attachment authenticates the merged request, exact retained-control head/ref, complete prefix,
          target transition, and residual contribution before binding terminal request/ref/landed coordinates once.
          Ordinary WUs no-op; unavailable resolution blocks. Both merge and resume paths invoke it before user close
          and teardown, with all other workflow bytes contract-pinned.

- _Outcome:_ The stack now hands only an authenticated residual tail to unchanged ordinary work-unit integration;
  delivery neither reserves the terminal merge nor adds a second approval or closeout record.

## **Phase 4.R:** Fresh suffix and terminal composition

_Purpose:_ Make the existing reconciliation and terminal primitives reachable only through fresh, repository-derived
orchestration without adding proof state or another integration ceremony.

### `[x]` **4.R.1 Bind suffix rematerialization to fresh proof**

- _Goal:_ Each suffix rewrite is derived and applied from a freshly closed suffix and recomputed contribution proof,
  with the preceding persisted result serving as the next step's only predecessor.

- _Outcome:_ The new `rematerialize` path accepts only raw suffix locators and selected IDs, recloses suffix eligibility,
  reobserves request/ref/lifecycle facts, and recomputes carried contribution before every reserved rewrite. Rewrites
  execute in plan order, with candidate movement, state drift, or proof failure stopping before the next mutation.

### `[x]` **4.R.2 Expose the existing terminal handoff through ordinary integration**

- _Goal:_ The terminal member reaches ordinary work-unit integration through one composed pre-handoff service and one
  total post-merge attachment, without a delivery-owned merge ceremony or terminal proof record.

- _Outcome:_ `terminal prepare` now derives absorption solely from current repository authorities, applies only the
  exact append-only base reconcile, and requires the ordinary Tier 1 seam before a fresh readiness read. Ordinary
  integration invokes one total `terminal attach` after merge; exact delivery results bind once, repeats are
  idempotent, ordinary work units no-op, and blocked evidence stops before close or teardown.

## **Phase 5:** Lifecycle execution and orientation

_Purpose:_ Make delivery reachable and resumable through owned workflow, discovery, session-init, and integration
attachment points while keeping deterministic dispatch and user-facing text in typed CLI surfaces.

### `[x]` **5.1 Compose the delivery workflow over typed results** — § 7, § 10; SC 4–SC 7

- _Goal:_ Operators have one resumable attended procedure whose prose dispatches typed outcomes without acquiring
  Git, host, review, or merge authority.

- **Additional Context:** `strategy-procedure-evolution.md` § Self-Check: run this before building

    - `[x]` **5.1.a Add the packaged delivery execution workflow**
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

    - `[x]` **5.1.b Expose strict execution verbs over the Phase 2–4 services**
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

    - `[x]` **5.1.c Order exact-head review, authorization, and reconciliation**
        - Dispatch prepare before the interlock and apply only after approval; advance to the next member only after
          the current effect and any remaining suffix reconciliation settle. A retryable landing returns to prepare
          and a new interlock rather than reusing approval.
        - Build workflow/integration contract coverage for exact-head-set approval scope, unconditional readiness,
          configured lock release, prepare/apply stop placement, retry reauthorization, terminal vehicle transition,
          and the post-merge adoption attachment's placement before close/teardown. Both fresh-merge and
          already-merged resume enter exactly one adoption call; repeated resume is idempotent, an ordinary WU returns
          `not-applicable`, and no member/head outside the approved set inherits authorization. Assert no other Phase 2
          ordering or behavior changes.

        - _Completed:_ shipped the Framework-owned delivery workflow and strict execution command family; production
          composition reuses eligibility, materialization, review readiness, merge-lock, landing, reconciliation,
          rewrite, teardown, Git, host, and versioned-store services. Command and workflow contracts pin exact-head
          approval scope, retry reauthorization, terminal delegation, stdin automation, and installed byte identity.

### `[x]` **5.2 Surface bound delivery position as an independent session-init probe** — § 7; SC 9

- _Goal:_ The owning control locus receives one durable progress line while delivery-state failure degrades without
  perturbing any other session evidence.

    - `[x]` **5.2.a Derive and precompose the delivery-position view**
        - Added an exact owning-WU plan/state reader and passive Git/host observer. Clean state uses strict position
          derivation; active reservations orient through kind-aware in-memory reconciliation without state writes.

    - `[x]` **5.2.b Carry the slot through the status envelope**
        - Added the optional strict `Probe<DeliveryPositionView | null>` through status composition, schemas,
          formatting, handlers, and compatibility goldens; slot failure remains isolated from sibling evidence.

    - `[x]` **5.2.c Dispatch the precomposed line from session-init**
        - Updated package and installed session workflows plus the probe reference to render only the CLI-owned line.
          Integration coverage pins canonical-plan compatibility, exact presence, and unchanged session projections.

- _Outcome:_ Session entry now exposes durable delivery progress only at the owning control-WU locus; unavailable
  delivery evidence degrades independently and cannot change task, load-set, locus, or recommendation authority.

### `[x]` **5.3 Attach discovered entry and integration-time delivery guidance** — § 7, § 8; SC 10, SC 11

- _Goal:_ Late delivery entry is discoverable and honestly costed without turning planning decisions or attention
  metrics into gates.

    - `[x]` **5.3.a Add the operator-invoked discovered entry**
        - Added `delivery entry inspect` with an attended two-field judgment input and six strict routes over passive
          rename-aware plan, authoring, state, and exact task-list-locus reads. All text is precomposed CLI-side.

    - `[x]` **5.3.b Dispatch the discovered door through the delivery workflow**
        - Bound every route to its existing authoring, eligibility, position/reconciliation, or ordinary-WU surface;
          refusal renders the CLI remedy and stops before eligibility or mutation without prose-side inference.

    - `[x]` **5.3.c Verify attachment ownership without duplicating it**
        - Added ownership contracts proving one planning provisional locus, two Phase 1 attention reads, and one total
          Phase 2 terminal attachment before close; ordinary integration remains the sole terminal merge authority.

- _Outcome:_ Late delivery entry now distinguishes absence, reviewed provisional intent, canonical unbound intent,
  and coherent binding without writes; passive enumeration prevents even empty state namespaces from materializing.

## **Phase 5.R:** Executable workflow contract

_Purpose:_ Bind shipped delivery prose to the actual CLI grammar and prove every documented invocation through the
built command surface.

### `[x]` **5.R.1 Make every delivery workflow invocation callable**

- _Goal:_ Every packaged and installed delivery command reaches its typed handler with the intended stdin payload.

- _Outcome:_ Every delivery execution example now passes stdin as the required positional `-`, including `position`
  and terminal attachment, while entry inspection retains its actual `--input` option. Built-CLI coverage extracts
  and executes every documented delivery invocation, and the supported update path refreshed installation identity.

## **Phase 6:** Optional native-stack composition

_Purpose:_ Add the preview host's native-stack ergonomics as a fresh-observation adapter over the complete unlinked
executor, preserving plan/state authority and an explicit downgrade path.

### `[x]` **6.1 Observe and register an already-materialized native stack** — § 9; SC 12

- _Goal:_ Host-native presentation is added only after ARC's exact chain exists, with fresh host observation as the
  sole arm selector.

    - `[x]` **6.1.a Define provider-neutral native composition facts and ports**
        - Added closed registered, unregistered, partial/incoherent, unsupported, unavailable, malformed, and
          ambiguous observations outside plan/state, with exact affected identities and local same-repository/chain
          validation.

    - `[x]` **6.1.b Implement the GitHub preview adapter from verified live signatures**
        - Verified the public-preview REST contract and implemented raw `/stacks` observation/registration over
          existing pull requests; the adapter never invokes `gh stack link` or exposes raw provider output.

    - `[x]` **6.1.c Expose opt-in link as a presentation-only carve-out**
        - Added strict native observe/link commands: opt-out performs no host call, opt-in reobserves exact
          registration, and partial/refused outcomes return explicit precomposed downgrade guidance without writes.

- _Outcome:_ Native registration is now optional host presentation over an ARC-authored exact chain; fresh closed
  observation remains the only arm input, and canonical plan/state schemas remain unchanged.

### `[x]` **6.2 Land one linked head or the exact remaining set** — § 9; SC 12

- _Goal:_ Only the host mutation arm changes; every included exact head retains the unlinked executor's ordering,
  review, authorization, reservation, and contribution contracts.

    - `[x]` **6.2.a Select the landing arm from immediate host observation**
        - Added a strict selector that freshly observes the exact plan/state-derived remainder, defaults to linked
          singleton, admits explicit complete direct atomic selection, and closes queue or ambiguous cases.

    - `[x]` **6.2.b Execute one asynchronous authorized effect**
        - Added set-wide readiness, exact native reobservation, one attended reservation/interlock presentation,
          SHA-pinned async submission, version-checked effect-identity attachment, and restart-safe polling.

    - `[x]` **6.2.c Reconcile single-member retarget and atomic crash windows**
        - Added closed all/none/partial/ambiguous effect reconciliation, immediate-result recovery, and singleton
          routing through the existing contribution-proven suffix-retarget service before new-head review.

- _Outcome:_ Native landing changes only the host mutation grouping: every selected non-terminal head remains
  independently admitted and bound to one recoverable `land` operation, while terminal and review authority stay
  outside provider-native state.

### `[x]` **6.3 Degrade visibly to the complete unlinked executor** — § 9; SC 12

- _Goal:_ Preview loss changes only operator-visible composition status, never the complete sequential delivery
  semantics.

    - `[x]` **6.3.a Unlink or confirm unlinked, then reobserve**
        - Added a presentation-only unlink port and GitHub adapter whose closed service admits sequential execution
          only after a fresh authoritative `unregistered` read; refusal, ambiguity, and stale linkage stop safely.

    - `[x]` **6.3.b Prove differential parity with the complete unlinked executor**
        - Added differential fixtures proving host-silent opt-out, ordered downgrade into the existing ordinary
          singleton commands, terminal exclusion, and equivalent semantic terminal state across delivery arms.

    - `[x]` **6.3.c Exercise the substituted-host lifecycle end to end**
        - Covered opt-out, singleton, direct atomic, queue downgrade, capability disappearance, exact unlink order,
          refusal/unavailability, terminal adoption, and provider-order exclusion with substituted-host fixtures.

- _Outcome:_ Native capability loss now changes only a precomposed operator advisory and host presentation; the
  exact ordinary executor and terminal projection remain the single fallback semantics, with no native state fields.

## **Phase 6.R:** Native executable parity

_Purpose:_ Close the native adapter's predecessor and retry-envelope gaps while preserving the complete unlinked
executor as its only semantic fallback.

### `[x]` **6.R.1 Correct native predecessor checks and prove executable parity**

- _Goal:_ Native singleton and exact all-remaining landing enforce the same per-member predecessor chain and
  retry/recovery envelope as the complete unlinked executor.

- _Outcome:_ Native prepare and submit reobservation now share one state-bound predecessor-chain derivation, using
  the protected base only for the bottom member and each preceding selected ref above it. The exact native retry
  envelope survives the handler boundary, and executable singleton, atomic, capability-loss, and unlink paths retain
  the unlinked lifecycle's terminal semantics.

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
