# Task List: Session Locus Operability Hardening

- **Design:** `spec-session-locus-operability-hardening.md`

---

## **Phase 1:** Additive derived-role foundation

_Purpose:_ Produce the first main-mergeable deliverable by establishing and proving the checkout-derived authority
model, dormant future-marker projection, and worktree-first reader without changing any production
producer, consumer, public contract, workflow, or on-disk behavior.

### `[x]` **1.1 Define authority-only role derivation and topology corroboration**

- _Goal:_ Checkout subjects derive through a pure typed authority boundary that cannot consult branch shape, durable
  locus state, or process liveness, while topology corroboration can only preserve or reject the derived subject.

    - `[x]` **1.1.a Define the authority fact and derived-role contracts**
        - Added pure authority projections and least-destructive role derivation for unoccupied primary, work-unit,
          transient, retired, unmanaged, and unresolved checkout outcomes.

    - `[x]` **1.1.b Add preserve-or-unresolve topology corroboration**
        - Added branch, `HEAD`, and detached corroboration that returns the exact derived role on agreement and only an
          unresolved checkout diagnostic on mismatch.

    - `[x]` **1.1.c Enforce the authority dependency boundary**
        - Added narrow topology adapters plus type, import, and runtime contracts that exclude durable locus and
          liveness dependencies and prevent complete registered-worktree values from crossing either seam.

- _Outcome:_ Authority selection, registered-topology observation, and positive primary-safety composition now have
  separate typed boundaries; the new modules remain dormant and unexported from production entry points.

### `[x]` **1.2 Define the dormant future occupancy-marker projection**

- _Goal:_ A pure internal projection represents future primary and spawned transient occupancy while the selected
  marker parser, writers, and on-disk contract remain untouched in Deliverable 1.

    - `[x]` **1.2.a Define a separate internal occupancy projection**
        - Added an isolated pure codec for spawned, primary, work-unit, identity-backed, and exact partial-Errand
          occupancy without changing or exporting the live marker implementation.

    - `[x]` **1.2.b Encode the primary, spawned, and ownership invariants**
        - Enforced closed ownership shapes, complete partial-origin binding, primary/spawn topology agreement, and
          rejection of legacy claimless Errands and unrelated lifecycle fields.

    - `[x]` **1.2.c Add pure future transition projections**
        - Added immutable pending-to-ready, terminal removal, spawned-to-WU replacement, and primary-marker removal
          projections with no production I/O or call sites.

- _Outcome:_ The accepted future occupancy contract is executable and regression-proven as a dormant projection;
  selected live marker parsing, serialization, generation operations, writers, and producer behavior remain unchanged.

### `[x]` **1.3 Add the default-preserving active-extension input seam**

- _Goal:_ Rich WU context accepts active extensions through its existing projection seam while every selected caller
  continues to produce the same session-init and recovery output.

- _Context:_ This is the sole behavior-preserving shared-helper edit permitted in Deliverable 1.

    - `[x]` **1.3.a Add an optional active-extension input**
        - Added a readonly optional active-extension input that passes the supplied projection unchanged to the
          existing load-set resolver and defaults omission to the current empty value.
        - Preserved the helper's identity, meta-evidence, workflow, stage, task-cursor, cohort, and load-set ownership
          without a wrapper or adjacent type migration.

    - `[x]` **1.3.b Preserve selected callers and supply the dormant reader**
        - Left the selected record-backed reader and recovery call shapes unchanged at the empty default.
        - Made the dormant derived reader the sole explicit caller supplying injected active extensions and proved its
          one-call pass-through into the existing rich-context projection.

- _Outcome:_ Rich dormant WU context now accepts active extensions through the existing resolver seam while omitted
  input, selected session fields, and session-init/recovery wire outputs remain unchanged.

### `[x]` **1.4 Build dormant lifecycle evidence and derived roster rows**

- _Goal:_ A dormant reader derives the future roster from one worktree snapshot and injected existing evidence while
  containing every malformed checkout to its own row.

- _Context:_ Keep `readLocusEnvelope()` and `readLocusState()` selected and record-backed until Deliverable 2; do not
  add another lifecycle scanner, cache, persisted snapshot, or service.

    - `[x]` **1.4.a Define bounded evidence projections**
        - Added exact active-meta absence, presence, unreadability, duplication, and conflict projections plus injected
          future-marker generation, completed-index, registered-topology, and identity snapshot inputs.
        - Preserved absent, root-error, and complete identity outcomes, canonicalized each registered path once, and
          split authority-safe topology from branch, `HEAD`, and detached corroboration observations.

    - `[x]` **1.4.b Derive lifecycle and transient subjects**
        - Derived active and parked WUs, positive completed-index retirement, ready identity-backed transients, and the
          exact origin-bound partial-Errand subject through the authority-only seam.
        - Localized unavailable lifecycle, marker/meta and marker/identity conflicts, identity-root failures, affected
          entry diagnostics, and branch/`HEAD`/detached mismatches to their own unresolved checkout rows.

    - `[x]` **1.4.c Compose the dormant roster and discovery projections**
        - Added separate dormant evidence, row-composition, and reader modules with future internal row and identity
          discovery types; selected readers, schemas, barrels, commands, handlers, and factories remain unchanged.
        - Composed derivation, preserve-or-unresolve corroboration, and positive primary safety into deterministic rows,
          while identities without checkouts remain on discovery and malformed siblings cannot alter healthy rows.

- _Outcome:_ One injected worktree snapshot now produces deterministic dormant future rows and rich WU context without
  records, leases, liveness, fallback acquisition, public exposure, or production selection.

### `[x]` **1.5 Prove behavioral dormancy and the additive authority boundary**

- _Goal:_ The additive foundation is independently buildable and mechanically proven unreachable from selected
  production behavior, public contracts, and on-disk mutation paths.

    - `[x]` **1.5.a Close production reachability and public-surface invariance**
        - Added an exact repository contract that closes every dormant module's incoming source and test edges, rejects
          dynamic production references, and permits no production delta beyond the seven modules and helper seam.
        - Bound protected commands, handlers, schemas, selected readers, marker/provisioning code, workflows, doctrine,
          and session-envelope goldens to a zero-diff inventory from the exact Phase 1 base.

    - `[x]` **1.5.b Run the old and new contract families together**
        - Passed 505 focused old/new unit assertions, 16 dormancy/command/framework integration assertions, both
          TypeScript programs, targeted lint, and 10 unchanged session-envelope compatibility goldens.
        - Passed the full Tier 2 suite with the acceptance contract included: 758 files passed and one skipped; 9,764
          tests passed and one skipped.

    - `[x]` **1.5.c Record the Deliverable 1 acceptance inventory**
        - Base: `5c9e806dcda9eb04166695a0cf45e25b08435c7f` / tree
          `77ef6977dd4f6c4b189ad2a100c2435086148812`.
        - Acceptance subject: `e6dc138d3bdd70cae0941b9f899cd6eae7a66a68` / tree
          `2e35e63c1fc53d5ffc7abf5cc3c0722b957ebe8a`.
        - Additive source: `role-derivation.ts`, `role-corroboration.ts`, `role-topology.ts`, `occupancy-marker.ts`,
          `derived-lifecycle-evidence.ts`, `derived-roster.ts`, and `derived-reader.ts` under `src/lib/locus/`.
        - Additive tests: the corresponding role, marker, lifecycle, roster, reader, extension, authority-boundary, and
          `locus-dormant-foundation-contract.test.ts` suites; the isolated-mock inventory is the sole test-helper edit.
        - Shared production edit: only `src/lib/locus/subject-meta.ts`, mechanically restricted to its optional readonly
          input and empty default forwarding.
        - Protected unchanged inventory: production selection and composition, public locus/status/session contracts,
          CLI and handler registration, live marker and provisioning paths, shipped workflows and doctrine, and wire
          goldens. Any additional production path or protected-byte delta makes the acceptance contract fail.

- _Outcome:_ The exact additive package payload is independently buildable, mechanically unreachable from selected
  production behavior, and proven byte-invariant across every protected Phase 1 surface.

### `[x]` **1.6 Close the dormant-foundation review facet**

- _Goal:_ The complete Phase 1 change set receives one source-grounded non-author review proving its authority
  boundary, test adequacy, and behavioral dormancy at an exact head.

    - `[x]` **1.6.a Bind the exact dormant-foundation review scope**
        - Bound the 19-file implementation delta from `5c9e806dc` through `23e58b1a9`: seven new dormant locus
          modules (`role-{topology,derivation,corroboration}`, `occupancy-marker`, and
          `derived-{lifecycle-evidence,roster,reader}`), the `subject-meta` active-extension option, nine unit or
          integration test files, the isolated-mock inventory, and this task record. The delta leaves production
          selection, public schemas and CLI/workflows, live marker writes, and WU settlement untouched.

    - `[x]` **1.6.b Obtain and settle complete facet review**
        - Routed both below-threshold whole-target passes to the configured `delegated-agent` standard lane. The first
          target, `sha256:fe6db425...`, returned two verified major findings: marker-scoped meta contamination and
          missing future-marker scalar validation. Disposition set `sha256:3d4b2013...` authorized both fixes, which
          landed together in `23e58b1a9`; the affected and complete gates were rerun before review re-entry.

    - `[x]` **1.6.c Record exact-head review closure**
        - Evaluator `phase1-reviewer` completed the whole-target `delegated-agent` standard lane at
          `bbca6873085ce98ffb816706da842893a59771b8..23e58b1a9bfc1cbd2d7c6c88f7ae7f59d009b067`
          (tree `eb680420ebdc975a7c820b38a3556442cf6caac2`, target `sha256:82452f8d...`) with a clean verdict across
          authority isolation, corroboration, dormant-reader containment, future-marker boundaries, extension
          projection, and regression dormancy. Receipt `arc-review-source:v1:attested-local:local-9c01c4ed...#11`
          is supporting facet evidence; the lifecycle-artifact-free member still requires fresh exact-target review.

- _Outcome:_ The source-grounded review found and settled two authority-containment gaps before delivery. The fixed
  implementation head is clean under the configured non-author lane, while the later member review remains the
  authoritative landing gate for the lifecycle-artifact-free projection.

### `[x]` **1.7 Validate the dormant-foundation delivery head**

- _Goal:_ Deliverable 1 reaches `main` as an independently supported additive head while the control branch retains
  the WU lifecycle and authoring record.

    - `[x]` **1.7.a Construct the non-final delivery projection**
        - Projected the 18-file Phase 1 implementation payload from control head `bb91afcc1` onto disposable member
          `deliver/session-locus-dormant-foundation`, excluding all four active WU artifacts and non-final lifecycle
          settlement surfaces; normalized source/member patch IDs both resolve to `3f7a2558c50a4515a19d3a311fa9221db9a71199`.

    - `[x]` **1.7.b Prove the member against its actual base**
        - Rebased the unpushed member onto current `main` `638c3a2bc` after PR #467 landed, then passed both lints,
          both type checks, the production build, and the complete suite (9,785 passed, 1 skipped); the acceptance
          contract proves the dormant reader remains unselected and protected producer, consumer, and doctrine
          surfaces remain unchanged.

    - `[x]` **1.7.c Publish and verify only the exact authorized member**
        - Merged exact head `d30459ee6140153ad5c8eb7c9d57045a81089aec` (tree
          `938046e4071f4788c0a6604c6c95a297430ceebb`) over base `638c3a2bcd8a6cc481384359ae28c61da9471831`
          through PR #468 as merge commit `d0dbbb91e55732d666209884921c334593e78d25`; reconciled that mainline head
          append-only into control at `20705169dcab384608336d6d5e0ca278f54fb9f2`, preserving byte equality across
          all 18 delivered paths while the four active WU artifacts remain control-only.

- _Outcome:_ The additive dormant foundation now stands independently on `main`; the control branch has rejoined the
  exact delivered tree without publishing its lifecycle record and can begin the consumer cutover from that base.

## **Phase 2:** Switch current-checkout session-frame consumers

_Purpose:_ Begin the second main-mergeable deliverable by establishing the complete unified-marker evidence required
by current-checkout consumers, then move status, session initialization, handoff, compaction, and recovery onto one
derived frame. Compatibility scaffolding exists only inside this unmerged implementation sequence.

### `[x]` **2.1 Activate the complete unified-marker lifecycle for derived consumers**

- _Goal:_ Every transient shape writes and clears the marker evidence the derived reader requires before any
  current-checkout consumer selects it, while the old record-backed path remains coherent inside the unmerged
  Deliverable 2 sequence.

    - `[x]` **2.1.a Activate primary and spawned occupancy evidence**
        - The selected marker now carries exact primary/spawn provenance, warm-parent and partial-origin fields;
          provisioning publishes primary evidence before checkout mutation and retains spawned pending-to-ready bytes.

    - `[x]` **2.1.b Complete compatible rollback and terminal cleanup**
        - Provisioning restores exact marker/topology generations, and close, abandon, leave, partial settlement, and
          promotion remove or convert primary/spawned evidence while the record-backed reader accepts primary markers.

    - `[x]` **2.1.c Bind the temporary compatibility seam for later removal**
        - Task 3.6 owns the remaining provisioning record half, record-backed terminal runtimes, selected-reader
          tolerance, markerless dead `partial-housekeep` declaration, and their transition tests; Task 4.1 deletes the
          retired record/lease substrate after those producers and consumers are gone.

- _Outcome:_ One exact-generation marker lifecycle now covers every live transient allocation and exit shape while
  retaining only the explicitly bounded, unshipped record compatibility needed by the remaining migration sequence.

### `[x]` **2.2 Activate the entering-checkout frame beside the legacy internal frame**

- _Goal:_ The shared probe can select a freshly derived entering-checkout row for migrated consumers without breaking
  the still-unmigrated handoff and recovery callers or letting malformed siblings create repository-wide stops.

    - `[x]` **2.2.a Activate the production evidence adapter and derived reader**
        - Added a worktree-first adapter for exact marker generations, lifecycle metadata, completed evidence,
          primary safety, and identity discovery with checkout-local read containment and no record fallback.

    - `[x]` **2.2.b Introduce the derived frame in buildable migration order**
        - Added canonical entering-row selection, primary availability, identity discovery, and a WU-only active
          convenience derived from the same row while leaving the legacy internal frame buildable.

    - `[x]` **2.2.c Route new entry reads without retiring old consumer inputs yet**
        - Added a dedicated production probe and replaced dormant reachability with an exact activation contract that
          permits only the derived adapter/reader seam and rejects legacy record, lock, and process dependencies.

- _Outcome:_ Migrated consumers can now select one canonical entering row from a contained repository roster while
  unrelated malformed or identity-dependent sibling evidence remains localized to the rows that require it.

### `[x]` **2.3 Collapse session guidance and load-set projection onto the selected checkout**

- _Goal:_ One extension-aware current-checkout WU projection supplies active context, task cursor, cohort, load set,
  and session guidance without duplicating or inventing authority.

    - `[x]` **2.3.a Select the shared subject projection in production**
        - Session-init now invokes one extension-aware derived probe and copies active context, workflow, stage, task
          cursor, cohort, and load set from its exact entering WU row without invoking legacy active/meta producers.

    - `[x]` **2.3.b Reduce guidance to current-row facts**
        - Guidance now fails closed on an unresolved entering row, contains malformed siblings to diagnostics and
          cleanup offers, and exposes no invented WU context for non-WU rows; package and self-hosted workflows consume
          the same contract.

- _Outcome:_ Session initialization now projects its complete WU context and narration from one selected checkout;
  extension membership, routing fields, and failure behavior cannot drift through duplicate readers.

### `[x]` **2.4 Derive handoff from current-checkout subject facts**

- _Goal:_ Handoff derives its action solely from the current checkout's WU, transient, partial-settlement, or
  between-WUs facts and writes no generic locus release state.

    - `[x]` **2.4.a Rewrite the handoff plan around the current row**
        - Handoff now maps the exact entering row to WU preservation, ordinary Errand leave, workflow-specific
          transient refusal, or between-WUs context; warm return comes only from the marker parent path.

    - `[x]` **2.4.b Remove record and lease handoff contracts**
        - The handoff envelope, plan union, handler probes, and package/self-hosted workflow no longer expose or
          consume record/lease identifiers or invoke generic locus release.

- _Outcome:_ Session handoff now shares session-init's exact entering-checkout authority while retaining subject-owned
  Errand settlement and WU workflow/session context; sibling state is diagnostic only and process exit writes no
  generic occupancy state.

### `[x]` **2.5 Reduce compaction seeds and recovery to checkout and marker-parent facts**

- _Goal:_ Compaction persists only the active checkout and optional marker parent, and recovery freshly derives the
  same current-checkout frame while degrading an unavailable parent to base.

    - `[x]` **2.5.a Reduce the compaction seed locus hint**
        - Seeds now retain only the selected checkout path and optional marker parent; the unpublished schema and
          development seed were updated in place with no compatibility reader or migration.

    - `[x]` **2.5.b Rebuild recovery from the shared derived projection**
        - Recovery now projects exact subject, checkout, optional marker parent, workflow, session, load set, and cursor
          from the shared entering frame; an unavailable parent falls back to base with CLI-composed guidance, and the
          package/self-hosted workflows consume that contract.

    - `[x]` **2.5.c Remove residue and lease-generation recovery stops**
        - Recovery auditing now compares checkout and marker-parent facts while retaining repository-root, branch/HEAD,
          dirty path-set, load-set, task-cursor, identity-basis, and other live-state checks; sibling residue is ignored.

- _Outcome:_ Compaction recovery now re-establishes the same checkout-local authority as session initialization;
  transient parent loss degrades to an explicit base return while unrelated sibling and retired lease state cannot
  block an otherwise healthy recovery.

### `[x]` **2.6 Flip the public frame and delete the legacy session projection**

- _Goal:_ Status and session initialization expose only the derived entering-checkout contract after every internal
  consumer has moved, leaving no record-backed frame, retired dispatch, or temporary public overlap at the Phase 2
  head.

    - `[x]` **2.6.a Remove the legacy frame after consumer migration**
        - Removed `LocusStateV1` from the public session-init result and schema, then deleted the unused shared-slot,
          active-meta, cohort-doc, and task-cursor adapters. The internal type remains contained behind the
          terminal/cleanup consumers that Phase 3 migrates before the deliverable closes.

    - `[x]` **2.6.b Remove retired entry dispatch and close contract parity**
        - Made the derived frame's top-level wire schema strict, removed the last legacy workflow dispatch references,
          and regenerated all five session-init envelopes without the retired slot.

- _Outcome:_ Session initialization now exposes one strict derived entering-checkout frame across runtime types,
  schemas, wire goldens, and shipped/project workflows; its `active` and load-set views come from that same read.

### `[x]` **2.7 Close the session-frame consumer review facet**

- _Goal:_ The complete Phase 2 delta is reviewed at an exact head, with every temporary seam to the unmerged
  terminal/lifecycle suffix identified and contained.

    - `[x]` **2.7.a Bind and preflight the exact marker/session-frame review scope**
        - Bound the complete Phase 2 surface and its Task 3.6/4.1 compatibility seams to an exact Git target; typed
          chunking and policy preflights selected the healthy local non-author carrier.

    - `[x]` **2.7.b Obtain and settle complete facet review**
        - Settled the verified direct-partial-marker finding, then recorded a clean supplemental review against the
          exact post-fix head while retaining the prior review's coverage of unchanged Phase 2 code.

- _Outcome:_ The session-frame facet is durably clean at `6cfc53955`; temporary record-backed production and
  terminal-consumer seams remain explicitly owned by Tasks 3.6 and 4.1 rather than entering the supported contract.

## **Phase 3:** Switch terminal and lifecycle consumers

_Purpose:_ Move subject-ending operations, promotion, allocation, work-unit lifecycle callers, rename, teardown,
and cleanup onto marker, identity, lifecycle, and git authority before the retired substrate is deleted.

### `[x]` **3.1 Move Errand terminal operations to subject-scoped confirmation**

- _Goal:_ Close, abandon, leave, and partial settlement authorize the exact current-checkout subject directly, while
  foreign acts use the same exact-generation confirmation contract promotion can consume without overriding evidence
  failures.

    - `[x]` **3.1.a Define common terminal authority and confirmation results**
        - Added a derived-row authority contract and strict terminal result schema: exact current subjects proceed,
          foreign acts bind to one request-local generation, unrelated malformed rows stay contained, and incomplete
          shared identity bases fail identity-backed mutations closed.

    - `[x]` **3.1.b Move each terminal runtime off locus state**
        - Reworked close, abandon, leave, and partial settlement around fresh derived checkout authority, identity
          transactions, or marker-origin binding while retaining exact Git, capture, replay, and `HEAD.lock` guards.

    - `[x]` **3.1.c Expose confirmation on the owning Errand verbs**
        - Exposed verb-owned foreign-generation confirmation and strict terminal results across close, abandon,
          leave, partial settlement, CLI rendering, and both shipped workflow copies, with retired locator fields
          contained behind the public boundary.
        - Preserved phased re-entry through a narrow exact-identity compatibility seam whose old-reader tolerance is
          removed with the retired substrate in Task 3.6.

### `[x]` **3.2 Add immutable promotion receipts and settlement replay**

- _Goal:_ Promotion remains exact-generation and replay-safe across the identity/WU coexistence window, with one
  immutable receipt carrying the durable origin after identity removal and the common terminal contract governing
  own versus foreign authority.

    - `[x]` **3.2.a Add the canonical immutable `Promotion Receipt` contract**
        - Added the optional canonical `errand-v1/<slug>/<claim-id>` meta field, preserved absent historical and
          ordinary projections, barred managed rewrites, and retained exact receipts through transition, pointer,
          relocation, reconciliation, and archival mutation paths.
        - Promotion now mints the receipt from its exact identity generation and refuses missing or mismatched
          identity-backed replay evidence without introducing a second post-settlement history authority.

    - `[x]` **3.2.b Move promotion authority and settlement onto exact generation**
        - Moved promotion onto the common exact-subject/generation contract, published complete immutable meta before
          mutation, and ordered inbox capture before identity retirement as the settlement commit.
        - Exposed the foreign-generation confirmation option and a strict commit-required/settled public result
          without retired locator or lease aliases.

    - `[x]` **3.2.c Complete marker conversion and lost-response replay**
        - Added receipt-authorized replay after identity retirement, then settled primary or spawned occupancy only
          after identity removal while preserving the spawned marker's allowed WU provenance.
        - Updated both shipped promotion workflows and their project copies to consume the exact two-call result and
          receipt-backed settlement order.

- _Outcome:_ Promotion is now an exact-generation, crash-recoverable meta → inbox → identity → occupancy
  transaction whose immutable receipt is the sole replay authority after identity retirement.

### `[ ]` **3.3 Switch Errand results and remaining lifecycle callers before producer shutdown**

- _Goal:_ Errand open, materialize, and link results plus work-unit lifecycle callers depend on their surviving
  marker, identity, and topology contracts while only the temporary record production still required by unmigrated
  rename or teardown consumers remains.

    - `[ ]` **3.3.a Move lifecycle callers to marker-owned results**
        - Remove `attachSession` and record result plumbing from start, materialize, park/resume, graduation, and
          reconcile paths, including `work-unit-locus.ts`, their mutators, and related command/handler composition.
        - Update the affected `init-work-unit.md` and `resume-work-unit.md` paths with the matching final lifecycle
          results and no attach/reconcile-attach dispatch.
        - Preserve provisioning receipts, marker-generation compare-and-swap, exact topology, and rollback behavior.

    - `[ ]` **3.3.b Migrate Errand open, materialize, and link success results**
        - Reshape the existing operation result in place before record production stops. Retain `operation`,
          `outcome`, nullable `allocation` with exact `checkoutPath` when allocated, exact subject, optional
          `parentCheckoutPath`, identity/origin settlement evidence, next offer, and CLI-composed prompt.
        - Return link through the same result with `allocation: null`, no checkout or parent, and the exact updated
          identity/origin evidence; retain the live command without creating a dedicated result wrapper.
        - Remove `recordId`, `leaseId`, `activeLocusPath`, `sessionHomePath`, and record-bearing restored-parent
          fields from open/materialize/link schemas, constructors, handlers, renderers, workflows, fixtures, and tests.
        - Add no compatibility result, adapter, alias field, or second public result version.

    - `[ ]` **3.3.c Bound temporary compatibility production to remaining consumers**
        - Keep only the record writes required to preserve buildable rename or teardown behavior until Tasks 3.4 and
          3.5 migrate those consumers.
        - Prevent the seam from entering public results, workflow contracts, or a mergeable deliverable head.

    - `[ ]` **3.3.d Prove migrated caller closure**
        - Trace Errand open/materialize/link, terminal, start/materialize, park/resume, graduation, and reconcile call
          graphs and result consumers.
        - Confirm each migrated caller consumes marker-owned results and identify the exact temporary producers left
          solely for rename or teardown.

    - Build `test-first` (one behavior at a time):
        - Marker-only allocation preserves exact ordering, pending-to-ready receipts, and rollback.
        - Errand open, materialize, and link success results carry every final marker- or identity-owned field and no
          retired identifier, path alias, record-bearing parent shape, or dedicated compatibility wrapper.
        - Primary availability requires marker absence and never consults record absence.
        - Migrated lifecycle callers never invoke attach, heartbeat, locus-lock, or process-inspector dependencies.
        - Any remaining record producer is reachable only from an explicitly unmigrated rename or teardown path.

### `[ ]` **3.4 Replace locus-backed worktree rename with marker and topology authority**

- _Goal:_ Worktree rename preserves serialization, exact race detection, physical move ordering, and rollback using
  topology plus marker generation rather than records or lease liveness.

    - `[ ]` **3.4.a Re-key rename snapshots and refusals**
        - Replace locus-record snapshots with pre/post worktree topology and exact marker generation.
        - Retain role-conflict, roster-changed, and generation-changed refusal families; remove lease-live and
          lease-unknown outcomes.

    - `[ ]` **3.4.b Preserve the physical move transaction**
        - Reuse the existing advisory-lock primitive at the single canonical
          `<git-common-dir>/arc-worktree-operation.lock` path shared with teardown. Its holder bookkeeping and
          stale-holder handling supply bounded serialization only and never role, occupancy, liveness, confirmation,
          or destructive authority.
        - Acquire no per-path lock set: the one repository-wide mutex serializes rename-versus-rename and
          rename-versus-teardown without a lock-ordering protocol.
        - Retain `git worktree move` ordering, deferred rename marker behavior, post-move path proof, and rollback,
          re-deriving topology, marker generation, subject, and exact `HEAD` under the mutex.
        - Do not sweep sibling markers to rewrite stale warm-parent paths.

    - `[ ]` **3.4.c Migrate rename callers and results**
        - Update work-unit rename identity, verbs, handlers, and integration composition to consume marker/topology
          results with no compatibility wrapper around `rename-locus.ts`.

    - Build `test-first` (one behavior at a time):
        - Inject roster and marker-generation races at each transaction boundary.
        - Prove rename and teardown contend on the same Git-common mutex and a timeout changes no authority evidence
          or checkout state.
        - Refuse any mismatch before physical mutation.
        - Roll back exact marker/path state on move or post-move failure.
        - Leave a stale parent path untouched for recovery's non-destructive fallback.

### `[ ]` **3.5 Remove lease vetoes while retaining teardown and cleanup guards**

- _Goal:_ Teardown and cleanup remain confirmation-gated and least-destructive with physical retirement serialized
  and every git, provenance, marker-generation, and lifecycle guard retained except lease-derived occupancy.

    - `[ ]` **3.5.a Rebase teardown selection and cleanup planning on derived roster facts**
        - Replace `teardown-occupancy.ts` record/lease selection with exact subject, topology, marker generation, and
          checkout evidence; remove record, lease, record-generation, and locus-lock fields from the decision.
        - Remove locus occupancy state from stale-worktree and orphan-branch planning.
        - Retain `locusOwnsBranch` and `locusWorkUnitAtPath` against the derived roster and delete
          `locusOccupancyAtPath` plus its state parameter.

    - `[ ]` **3.5.b Migrate the physical teardown transaction**
        - Replace `teardown-locus.ts` record lock, record removal, lease check, and process-anchor transaction with the
          same `<git-common-dir>/arc-worktree-operation.lock` advisory mutex used by rename.
        - Revalidate exact topology, marker generation, subject, and `HEAD` under the mutex before retirement; keep
          rollback and caller composition in teardown, reconciliation cleanup, and decomposition-local cleanup.

    - `[ ]` **3.5.c Preserve each destructive authorization input**
        - Keep shipped/retired evidence, clean worktree, exact expected `HEAD`, ancestry or remote proof, marker
          provenance, lifecycle-location match, and dirty-worktree refusal.
        - Keep confirmation separate from every evidence guard.

    - `[ ]` **3.5.d Contain degraded sibling cleanup evidence**
        - Convert unreadable sibling facts to diagnostics or suppressed offers, never permission or a stop for the
          current checkout.

    - Build `test-first` (one behavior at a time):
        - An otherwise identical candidate has the same offer regardless of former lease shape.
        - Each retained guard independently suppresses or refuses destruction.
        - Confirmation cannot override dirty, `HEAD`, ancestry, provenance, or lifecycle failure.
        - Marker/topology generation races refuse under the operation mutex before physical removal.
        - Rename and teardown of the same or different checkouts serialize through the one repository-wide mutex;
          lock acquisition alone never makes a target eligible.
        - A malformed sibling does not affect healthy checkout-local teardown.

### `[ ]` **3.6 Stop all retired-state production and remove the cutover seam**

- _Goal:_ No allocation, terminal, lifecycle, rename, teardown, or cleanup path creates or refreshes record, lease,
  locus-lock, or process-anchor state after every surviving consumer has moved to marker/topology authority.

    - `[ ]` **3.6.a End record, lease, locus-lock, and process-anchor production**
        - Remove the temporary record half of primary/spawn allocation and every remaining attach, mint, heartbeat,
          locus-lock, and process-anchor producer.
        - Require Errand open/materialize/link and every lifecycle result consumer from Task 3.3 to be on its final
          marker-, identity-, or topology-owned contract before removing the producer.
        - Delete transitional old-reader tolerance and dual-write assertions once no selected consumer needs them.

    - `[ ]` **3.6.b Prove producer closure across every lifecycle path**
        - Trace allocation, terminal, promotion, start/materialize, park/resume, graduation, reconcile, rename,
          teardown, and cleanup call graphs.
        - Confirm every path either produces the accepted marker transition or remains read-only.

    - Build `test-first` (one behavior at a time):
        - No production source imports attach, record-store, heartbeat, locus-lock, mutation-anchor, or process-
          inspector dependencies for session authority.
        - No transitional dual-write fixture, old-reader tolerance, or selected compatibility import survives.
        - Marker-only allocation and lifecycle rollback retain their previously proven ordering and receipts.

### `[ ]` **3.7 Close the terminal and lifecycle consumer review facet**

- _Goal:_ The complete Phase 3 delta receives exact-head non-author review with every destructive guard, identity
  transaction, replay boundary, marker transition, and foreign-confirmation rule accounted for.

    - `[ ]` **3.7.a Bind the exact terminal/lifecycle review scope**
        - Enumerate Errand exit and promotion, allocation, marker conversion, WU lifecycle caller, rename, teardown,
          cleanup, result, operational-workflow, and test hunks changed by Phase 3.
        - Run read-only chunking and policy preflights for that exact target before selecting the typed review driver.

    - `[ ]` **3.7.b Obtain and settle authority/failure review**
        - Require coverage of own versus foreign authority, complete-basis refusal, marker/identity generation, exact
          branch/`HEAD`, dirty-tree, ancestry, lifecycle location, rollback, and idempotent replay.
        - Prove confirmation cannot override a failed guard and no producer mints retired locus state.
        - Treat malformed, unavailable, blocked, or non-resumable review state as a stop without self-attestation,
          state reconstruction, or review-system repair; use a manual fresh non-author route only after explicit
          approval and against the same exact target and scope.
        - Verify findings against source, obtain disposition approval, settle accepted fixes, rerun affected gates,
          and record exact-head review evidence.

## **Phase 4:** Retire the substrate and close the corpus

_Purpose:_ Complete the second main-mergeable deliverable by deleting the durable locus record, lease, locus-lock,
process-anchor, and session-authority inspection machinery; removing its public contracts; rewriting shipped
doctrine; settling dissolved backlog scope; and proving the two-deliverable, four-facet union mechanically and in
review.

### `[ ]` **4.1 Delete the retired locus authority substrate**

- _Goal:_ The record store, leases, durable locus lock, process anchors, session-authority inspectors, and their
  record-only tests disappear after every surviving primitive and caller has moved to its real owner.

    - `[ ]` **4.1.a Prove zero live consumers and relocate surviving primitives**
        - Trace imports and exports for every module in the deletion inventory before removal.
        - Move surviving identity, path, teardown, close-receipt, or provisioning primitives to their owning schema or
          runtime without retaining a wrapper under a retired name.

    - `[ ]` **4.1.b Delete the durable locus substrate**
        - Remove record root/store, locus lock, mutation and mutation-anchor, locus process/platform inspection,
          reconciliation, resolve driver, generation selection, stop-tier, entry-boundary, and record/lease
          trusted-row modules.
        - Remove record/lock evidence branches, record-only Errand helpers, and record-backed provisional-roster code.

    - `[ ]` **4.1.c Delete obsolete tests, fixtures, and local-state assumptions**
        - Remove record/lease/lock/process/reconciliation suites, locus-mutation E2E coverage, and legacy fixture
          builders that no surviving contract consumes.
        - Remove cleanup or migration assumptions for unpublished `.internal/loci/` state; development state is
          cleared or regenerated.

    - `[ ]` **4.1.d Reprove the surviving contract set after deletion**
        - Run type checking, focused surviving locus/identity/marker suites, and the unchanged Phase 1 authority and
          dependency boundaries.

### `[ ]` **4.2 Shrink public schemas, results, handlers, and CLI options to the read-only roster**

- _Goal:_ Final public closure leaves only the derived read-only roster and already-migrated verb-owned results, with
  no mutation command, attach option, retired-only declaration, or declared option lacking live semantics.

    - `[ ]` **4.2.a Remove retired-only schema and result residue**
        - Delete remaining mutation schemas, retired exports, and record/lease/recovery-residue/reconciliation
          declarations after their consumers have moved.
        - Verify the Phase 2 status, compaction, recovery, and handoff shapes plus the Phase 3 open/materialize/link
          and terminal shapes without reopening them or adding compatibility helpers, adapters, readers, or
          migrations.
        - Assert open/materialize/link retain only their final allocation, subject, checkout/parent, identity/origin,
          offer, and prompt fields; link carries `allocation: null` and no checkout or parent value, and no retired
          identifier or path alias survives.
        - Update final session-envelope fixtures, renderers, and consumer assertions against the selected schemas.

    - `[ ]` **4.2.b Reduce `arc locus` to read-only inspection**
        - Retain bare roster/JSON behavior and remove `attach`, `release`, and `resolve` registrations, handlers,
          results, and input-policy entries.
        - Remove `reconcile --attach-session`, every `attachSession` declaration, and record-only confirmation path.

    - `[ ]` **4.2.c Remove the body-less Errand force option**
        - Delete `errand close --force` from Commander registration, option inventories, handlers, fixtures, and
          rendered recovery advice.

    - Build `test-first` (one behavior at a time):
        - Removed fields and commands are absent or rejected at public boundaries.
        - Bare locus JSON retains the final derived row taxonomy and no mutation capability.
        - Every remaining declared option maps to a live handler body.
        - Status, handoff, recovery, and Errand output contain no retired identifier or advice string.

### `[ ]` **4.3 Rewrite the shipped session, Errand, and work-organization corpus**

- _Goal:_ Residual shipped methodology consistently teaches checkout-derived roles, marker-based primary
  availability, and fail-closed shared identity mutation without reopening the operational contracts already moved
  with their consumers.

- **Additional Context:** `strategy-workflow-authoring.md` § Body Conventions,
  `strategy-procedure-evolution.md` § Self-Check: run this before building, and
  `strategy-package-project-sync.md` § Edit Flow Rules and § Template Counterparts.

    - `[ ]` **4.3.a Close residual workflow vocabulary at package source**
        - Audit the session-init/probe, handoff/recovery, run-Errand, init-WU, and resume-WU content changed with
          their Phase 2 or Phase 3 consumers and remove any remaining attach/release/resolve or retired-state prose.
        - Do not duplicate deterministic dispatch, reconstruct final result shapes in prose, or reopen the owning
          consumer task's contract.
        - Preserve shipped bare `arc ...` invocation examples and workflow-authoring conventions.

    - `[ ]` **4.3.b Rewrite the brief and concurrency/organization doctrine**
        - Define a locus as one checkout plus its derived role and define primary availability by topology, base,
          cleanliness, and marker absence.
        - Replace lease/dead-lease/residue and `errand close --force` guidance with marker provenance and the explicit
          identity complete-basis refusal boundary.

    - `[ ]` **4.3.c Synchronize package and self-hosting surfaces correctly**
        - Edit authoritative package source first and render or target-edit its self-hosting counterpart according to
          file classification and template rules, without blind copying configurable content.
        - Keep all user-facing offer and diagnostic prose composed by the CLI rather than reimplementing decisions in
          workflow text.

    - `[ ]` **4.3.d Close methodology behavior with positive and negative contracts**
        - Assert the required derived-role, marker-availability, warm-parent, and identity-basis concepts.
        - Reject retired commands, fields, and doctrine across the minimum named shipped corpus.

### `[ ]` **4.4 Destroy absorbed sibling work units and regenerate readiness**

- _Goal:_ The two absorbed work units are destroyed in the tracked change set and authoritative readiness contains no
  stale row or dependency, without editing any surviving sibling's planning artifacts.

    - `[ ]` **4.4.a Destroy the absorbed backlog work units**
        - Run `npx arc abandon claimed-sweep-verbs` and `npx arc abandon locus-generation-binding` without `--yes` to
          resolve each live source state and surface its typed destructive-cascade preview.
        - Stop for explicit authorization of the two exact abandon operations; only then rerun each with `--yes` and
          verify every tracked companion artifact is removed through the lifecycle verb.

    - `[ ]` **4.4.b Regenerate authoritative roadmap and readiness projections**
        - Use the abandon transition's readiness regeneration and the existing staged ROADMAP check; never hand-edit
          `ROADMAP.md`.
        - Verify no destroyed slug or stale dependency survives in the staged projection.

### `[ ]` **4.5 Complete mechanical consumer, option, doctrine, and authority closure checks**

- _Goal:_ Independent mechanical contracts fail whenever a retired export, unread field, dead workflow arm, body-less
  option, forbidden doctrine term, or authority violation re-enters the final codebase without adding general
  repository-analysis machinery.

- _Approach:_ Extend the existing command-input repository inventory, locus methodology contract suite,
  TypeScript/import closure, and targeted source-reference assertions; add no CLI, registry, semantic analyzer,
  dependency graph, policy framework, or snapshot system.

    - `[ ]` **4.5.a Add dead-export/import and consumer-trace closure**
        - Use type checking plus a narrow retired module/symbol source inventory for imports, exports, dynamic
          references, fixtures, and handler or workflow consumers.
        - Trace every removed envelope/result field—including Errand open/materialize/link fields—from schema through
          commands, handlers, workflows, and tests.

    - `[ ]` **4.5.b Add declared-option-to-live-body closure**
        - Extend the existing command-input source scanner and repository inventory for the final locus/Errand
          commands, pairing remaining declared options with their owned schema and exercised handler path.
        - Assert the named retired options and commands are absent rather than building a generic static detector for
          handler semantics.

    - `[ ]` **4.5.c Add adopter-doctrine and command-example closure**
        - Extend `locus-methodology-contracts.test.ts` across the brief, concurrent-work strategy, work-organization
          strategy, workflows, and command references for retired guidance and required final vocabulary.

    - `[ ]` **4.5.d Rerun persistent authority contracts and final reachability**
        - Keep the Phase 1 authority-input, dependency, and branch/`HEAD` invariance tests unchanged and prove final
          cleanup does not weaken them.
        - Preserve the exact-head Deliverable 1 dormancy result as historical acceptance evidence rather than running
          its negative assertion after activation. Rerun the Phase 2 positive reachability contract and prove every
          final production path is explicitly permitted and no retired fallback is reachable.

    - Build `test-first` (one behavior at a time):
        - Seed each closure fixture with one forbidden export, consumer, option, or doctrine example and observe its
          targeted failure.
        - Prove explicit allowlists are minimal and do not mask selected runtime or shipped content.
        - Remove each seed and prove the settled repository passes all four closure families.

### `[ ]` **4.6 Close the substrate-retirement review facet**

- _Goal:_ The complete Phase 4 delta receives exact-head non-author review as the deletion and corpus closure that
  leaves no reachable or documented retired substrate.

    - `[ ]` **4.6.a Bind the exact retirement review scope**
        - Enumerate deleted modules/exports/tests, public schema and command removals, workflow and doctrine rewrites,
          package/self-hosting synchronization, sibling disposition, and mechanical contracts.
        - Run read-only chunking and policy preflights for that exact target before selecting the typed review driver.

    - `[ ]` **4.6.b Obtain and settle deletion/corpus review**
        - Require coverage of dead-import closure, option-to-body closure, envelope/workflow agreement, authority
          boundaries, doctrine validity, and package/rendered-mirror synchronization.
        - Confirm bare locus remains read-only and no attach/release/resolve, reconcile-attach, close-force, locus
          lease/session-authority process, or residue-recovery surface survives.
        - Treat malformed, unavailable, blocked, or non-resumable review state as a stop without self-attestation,
          state reconstruction, or review-system repair; use a manual fresh non-author route only after explicit
          approval and against the same exact target and scope.
        - Verify findings against source, obtain disposition approval, settle accepted fixes, rerun affected gates,
          and record exact-head review evidence.

### `[ ]` **4.7 Review the complete two-deliverable, four-facet seam**

- _Goal:_ One fresh whole-union review proves the four facets compose into the accepted RFC and Deliverable 2 is a
  coherent terminal main-visible candidate based on the landed dormant foundation.

    - `[ ]` **4.7.a Build the complete union and seam map**
        - Bind one immutable Git target from Deliverable 1's recorded pre-merge base tree through the current
          Deliverable 2 candidate head; treat the landed Deliverable 1 tree as the internal seam coordinate.
        - Map every changed file and hunk to one deliverable and one primary review facet; record intentional
          cross-facet seams separately and refuse uncovered bytes.
        - Trace producer-to-schema-to-handler-to-workflow consumers for entry, handoff, recovery, terminal operations,
          promotion, rename, teardown, and cleanup.
        - Recheck that Deliverable 1's landed tree was additive and lifecycle-artifact-free and Deliverable 2 contains
          every observable cutover and retirement obligation.

    - `[ ]` **4.7.b Obtain a fresh complete-union review**
        - Run read-only chunking and policy preflights over the exact whole-union target, then bind a non-author
          evaluator to that target; facet verdicts are supporting evidence, not substitutes for seam review.
        - Cover sibling containment versus identity-basis refusal, the full marker lifecycle, current-frame/load-set
          parity, warm-parent fallback, destructive authority, public contract coherence, and substrate absence.
        - Treat malformed, unavailable, blocked, or non-resumable review state as a stop; use no repair,
          self-attestation, or custom review aggregation, and take a manual fresh non-author route only after explicit
          approval for the same exact target and scope.
        - Verify and disposition every finding, settle approved fixes, rerun affected facets/gates, and repeat any
          invalidated seam scope.

    - `[ ]` **4.7.c Freeze the candidate evidence for final verification**
        - Record exact deliverable coordinates, facet and seam results, mechanical closure results, and remaining
          verification obligations.
        - Refuse the candidate while any hunk is uncovered, evidence is stale, or lifecycle/public-contract seam is
          unresolved.

## **Phase 5:** Verification

_Purpose:_ Verify the frozen Deliverable 2 candidate and complete two-member union against the specification,
retained trust boundaries, package mirrors, public contracts, and project quality gates before the ordinary attended
integration and WU closeout path.

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ Independent evidence establishes every success criterion and the exact stacked union is ready for the
  integration interlock; unavailable, partial, or stale evidence remains open rather than inferred clean.

---

## Success Criteria

- `[ ]` Healthy non-identity-backed checkout entry, handoff, recovery, and local exit tolerate every malformed or
  stale sibling-checkout shape plus identity-snapshot root failure, while invalid shared identity bases still block
  identity mutations.
- `[ ]` Sandboxed sessions complete the supported lifecycle without session-authority process inspection or
  machine-state repair, and own-checkout terminal operations require no extra confirmation.
- `[ ]` Shipping, parking, archival, and husk cleanup leave no durable locus residue or corruption diagnostics.
- `[ ]` Foreign terminal confirmation requires the exact freshly derived generation for the named verb and cannot
  bypass any retained git, marker, identity, ancestry, lifecycle, or generation guard.
- `[ ]` Role authority excludes branch and `HEAD`; corroboration can only preserve the exact derived subject or
  downgrade the checkout to unresolved.
- `[ ]` Handoff and recovery preserve warm-parent return and degrade a missing parent to the configured base.
- `[ ]` No locus record/store, lease, locus-lock, process-anchor, session-authority inspector, mutation command,
  reconcile-attach, dead workflow arm, stale result field, or body-less option remains.
- `[ ]` The two absorbed sibling work units are removed and the regenerated roadmap/readiness projection contains no
  stale row or dependency.
- `[ ]` Locus-driven workflow/schema prose shrinks, shipped doctrine describes derived roles, and user-facing text
  remains CLI-composed.
- `[ ]` Mechanical contracts reject durable occupancy, liveness, or branch-shape authority in role derivation.
- `[ ]` The dormant-foundation head excludes WU lifecycle artifacts and changes no selected production behavior;
  both ordered delivery heads pass their relevant gates; all four review facets are covered; and the final seam
  review covers the complete stacked union.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
