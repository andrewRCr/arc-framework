# Task List: session-locus-model

- **Design:** `spec-session-locus-model.md`

---

## **Phase 1:** Typed Locus Foundation

_Purpose:_ Establish the exact schema, machine-local record, lock, and liveness contracts that every later
reader and mutator consumes.

_Design decisions:_ Partition locus schemas by contract family behind one index, resolve the locus store through
a dedicated fail-closed topology boundary, make checkout normalization path-flavor explicit, and land process
inspection before the record lock that consumes its liveness verdict.

### `[x]` **1.1 Define and register the locus schema family** — D2, D6

- _Goal:_ Every persisted, emitted, and immediately consumed locus value has one Zod-first authority with stable
  kernel registration metadata and no parallel handwritten contract.

    - `[x]` **1.1.a Author bounded record and process-anchor schemas**
        - Added strict, bounded Zod authorities for persisted records, durable roles, process anchors, and leases;
          known role/subject and partial execution-context relationships are validated without closing future
          inspector or role vocabulary.

    - `[x]` **1.1.b Author identity schemas without duplicating their workflow authorities**
        - Added the exact v3 ordinary-Errand, housekeep-routing, and full/partial groom projections, preserving claim,
          dispatch, plan-digest, change-request, canonical-member, and opened-base evidence through inferred types.

    - `[x]` **1.1.c Author roster, state, reconciliation, and mutation schemas**
        - Added strict versionless envelope, row, state, reconciliation, and mutation-result contracts that reuse the
          canonical cursor/load-set roots and keep operational errors distinct from safety refusals and diagnostics.

    - `[x]` **1.1.d Register the locus schema roots through a composed kernel registry**
        - Registered the five locus roots at strict-current v1 through a fresh kernel-composed registry with stable,
          deterministic discovery and no build projection or command surface.

    - `[x]` **1.1.e Add locus-domain error classification at untrusted boundaries**
        - Added a locally exhaustive `LocusError` taxonomy and safe payload adapter while retaining refusal reasons
          and roster diagnostics as their own closed data discriminants.

- _Outcome:_ The locus family now has one strict Zod-first authority from persisted record through public query and
  mutation output, with kernel discovery and bounded operational-error projection ready for storage and drivers.

### `[x]` **1.2 Build normalized checkout identity and exact record persistence** — D2, D3

- _Goal:_ One Git-reported checkout spelling resolves to one tamper-evident machine-local record whose path and
  contents cannot redirect persistence outside the locus store.

    - `[x]` **1.2.a Make registered-worktree topology parsing path-exact**
        - All topology and branch-path consumers now invoke one strict `--porcelain -z` parser that preserves the
          decoded Git path spelling and rejects truncated, duplicate, conflicting, or unknown field structure.

    - `[x]` **1.2.b Derive stable checkout digests through an explicit path-flavor seam**
        - Added explicit POSIX/Windows lexical normalization plus UTF-8 SHA-256 record identity, preserving case and
          display spelling while rejecting relative, mixed-flavor, NUL-containing, and oversized inputs.

    - `[x]` **1.2.c Resolve the primary-backed locus root with fail-closed topology semantics**
        - Added a no-fallback root resolver requiring one primary topology stanza, bounded record/lock path builders,
          and whole-dot-directory notes exclusion so `.internal/loci/` remains machine-local.

    - `[x]` **1.2.d Parse and atomically persist exact record generations**
        - Added bounded record reads with distinct absence, malformed, unsupported, oversized, unreadable, and digest
          mismatch outcomes, plus exclusive mint and byte-generation-checked same-directory atomic replacement.

- _Outcome:_ Git topology spelling, lexical path identity, primary-backed storage, and exact record bytes now form
  one tamper-evident persistence chain; portable notes cannot absorb its machine-local files.

### `[x]` **1.3 Implement cross-platform process anchors and three-state liveness** — D5

- _Goal:_ Lease and lock decisions distinguish live, dead, and unverifiable sessions without treating PID reuse,
  heartbeat age, ambiguous ancestry, or missing platform facilities as cleanup authority.

    - `[x]` **1.3.a Define the inspector and native-process execution ports**
        - Added the present/absent/unverifiable inspection algebra and a bounded, cancelable argument-array executor
          whose execa binding preserves nonzero, missing, canceled, output-limit, and unknown failures structurally.

    - `[x]` **1.3.b Select one bounded session anchor from pure ancestor snapshots**
        - Added a pure 32-ancestor selector for exact ARC/npm wrappers, recognized per-session harnesses, and verified
          interactive shells; unknown boundaries, shared hosts, and multiple candidates remain unverifiable.

    - `[x]` **1.3.c Implement the Linux `/proc` inspector**
        - Added robust `/proc/{pid}/stat` parsing with parent/start-token extraction and `exe`→`comm` identity fallback;
          only process absence is dead evidence and all read/parse/identity uncertainty remains unknown.

    - `[x]` **1.3.d Implement the macOS/BSD `ps` inspector**
        - Added a locale-stable `ps` adapter that retains the exact start string and distinguishes proven absence
          from malformed, denied, nonzero, or unavailable process evidence.

    - `[x]` **1.3.e Implement the Windows CIM inspector**
        - Added a static non-shell PowerShell/CIM query with separate PID input and strict compressed-JSON mapping for
          parent, executable identity, and creation token; null alone proves absence.

    - `[x]` **1.3.f Bind platform selection and unknown-safe verification**
        - Added supported-platform dispatch and inspector-kind/PID/start-token verification; unsupported adapters and
          every unproven comparison return unknown rather than turning heartbeat age into authority.

- _Outcome:_ Locks, leases, and cleanup consumers now share one cross-platform three-state liveness contract in
  which only exact process-generation evidence can prove a session live or dead.

### `[x]` **1.4 Implement record-scoped locking and token-safe stale breaking** — D3

- _Goal:_ Concurrent commands serialize only the checkout they mutate, and no contender can break or release a
  lock unless the exact observed holder generation is conclusively dead under the process-inspector contract.

    - `[x]` **1.4.a Implement the record and secondary-break lock protocol**
        - Added bounded exclusive-create record locks and per-record secondary break locks; malformed, oversized,
          unreadable, partial, live, or unknown holders remain intact, while only a stable dead generation breaks.

    - `[x]` **1.4.b Make release and failure cleanup generation-safe**
        - Acquisition returns the exact serialized holder generation and release compares those bytes before unlink;
          absent locks are idempotent and changed primary or secondary generations are never removed.

- _Outcome:_ Each checkout now has an independently serialized mutation boundary whose acquisition, stale recovery,
  and release all require token-stable process-generation evidence.

## **Phase 2:** Transient Identity Model and Transactions

_Purpose:_ Upgrade transient identity to a concurrency-safe v3 authority before the locus reader consumes Errand,
grooming, or housekeeping state.

### `[x]` **2.1 Extend Errand records into the backward-compatible v3 identity union** — D6, D8, D9

- _Goal:_ Ordinary Errands, housekeeping sweeps, and grooming claims share one exact identity model while existing
  v1/v2 Errands remain readable only through their bounded close path during rollout.

    - `[x]` **2.1.a Define v3 Errand and groom record discriminants**
        - Added a strict backward-compatible identity codec with exact ordinary Errand, housekeeping-routing, and
          full/partial groom arms, canonical relationship validation, random 128-bit claim IDs, and validated locus
          projection. Legacy v1/v2 records remain separately discriminated for the bounded compatibility path.

    - `[x]` **2.1.b Read one exact identity-tree snapshot and project valid records**
        - Added a tip- and object-pinned strict tree scan that size-gates before blob reads, distinguishes clean
          absence from root failures, and retains every per-key decode/read failure as a typed diagnostic alongside
          valid records and their claim-preserving locus projections.

    - `[x]` **2.1.c Contain legacy identity records to the close-only compatibility path**
        - Routed legacy single-record access through the complete typed snapshot, retained exact failure evidence,
          and enforced one shared close-only guard across current and planned mutation verbs. Existing close behavior
          still restores v2 return branches; refused operations leave identity and branch state untouched.

- _Outcome:_ Transient identity now has one strict compatibility authority: v3 records project losslessly into the
  locus model, invalid tree entries remain visible, and legacy generations cannot acquire new mutation rights.

### `[x]` **2.2 Implement complete-basis identity CAS transitions and claim retirement** — D8

- _Goal:_ Every identity transition and cross-key exclusion claim is based on the complete remote/local tree,
  preserves unrelated keys, and cannot blind-upsert over another session or retire an unproven review tail.

    - `[x]` **2.2.a Generalize identity-tree reads and complete-basis CAS writes**
        - Added a common-history, per-key three-way transaction engine over tip-pinned local and fetched-remote
          snapshots. It preserves independent changes, refuses same-key divergence or invalid bases, CAS-publishes
          locally, retries ambiguous/contended pushes idempotently, and treats remote absence, outage, and temporary-
          ref cleanup as distinct outcomes; the same transform contract also serves local-only authority.

    - `[x]` **2.2.b Implement exact ordinary-Errand transitions**
        - Added complete-basis, exact-generation transforms for every ordinary Errand edge with immutable claims,
          monotonic timestamps, replay adoption, configured/observed change-request matching, and state-specific
          retirement authority. Pause now requires nominal evidence from a caller-unique fresh remote fetch proving
          the exact terminal head is remote-backed; invalid branches, missing/unpushed heads, and cleanup uncertainty
          remain explicit non-mutating outcomes.

    - `[x]` **2.2.c Implement generation-owned first-writer claims**
        - Added remote-base pinning and generation-owned groom claims with complete-tree member exclusion, disjoint
          concurrency, exact-set remote-winner adoption, and base-head preservation through awaiting-merge. Added one
          global housekeeping claimant with minted stable dispatches, same-plan race adoption, immutable digests, and
          monotonic lane escalation. Narrow conflict resolvers preserve default divergent-key refusal, while exact
          rollback and recovery-required outcomes retain failed allocations for explicit resume or abandon work.

    - `[x]` **2.2.d Gate tail retirement and abandonment on exact host truth**
        - Added a shared, developer-authenticated `gh` lifecycle port that validates configured and stored coordinates,
          detects moved heads or refs, and emits only the closed seven-state truth vocabulary. Nominal evidence now
          authorizes exact-generation retirement only for matching merged truth, or explicit tail abandonment only
          for matching closed-unmerged truth; malformed, ambiguous, missing, open, changed, and unreachable reads
          retain the claim without relying on branch containment or review-provider state.

- _Outcome:_ Transient identities now mutate through one complete-basis CAS authority with narrow, domain-specific
  conflict adoption. Every generation, exclusion claim, remote-backed pause, and review-tail retirement remains
  exact and retry-safe, while incomplete storage or host evidence fails closed without dropping unrelated identities.

## **Phase 3:** Locus Reader and Mutation Core

_Purpose:_ Turn local topology, v3 identity authorities, role records, and process evidence into one deterministic
roster and one generation-safe local mutation boundary.

### `[x]` **3.1 Acquire and project checkout, identity, workflow, and cursor evidence** — D4, D6

- _Goal:_ One network-free read reports every checkout and identity tail without allowing one malformed row or an
  incomplete authority root to masquerade as a complete machine roster.

    - `[x]` **3.1.a Acquire topology and authority evidence through bounded I/O ports**
        - Added a topology-pinned, network-free evidence reader with a shared fixed-concurrency I/O boundary over
          checkout paths, markers, metas, records, locks, identity snapshots, and process liveness. Root failures now
          fail closed while first-use absence and source-local malformed, unreadable, stale, orphaned, and
          identity-only evidence remain explicit for deterministic projection.

    - `[x]` **3.1.b Project managed subjects through their existing workflow authorities**
        - Added checkout-directed subject projection that selects exact maintainer or contributor metas and derives
          session type, planning stage, cursor, cohort, and load set through the shared resolvers. The pure managed
          subject join now requires exact record, checkout, marker, owner, branch, and v3 claim agreement while
          preserving unresolved and cross-identity results as non-authoritative evidence.

    - `[x]` **3.1.c Classify and sort roster rows deterministically**
        - Added pure provisional roster classification for every checkout, record, and identity-only row class;
          source-keyed record, identity, lock, marker, and path diagnostics; physical-alias retention; and stable raw
          UTF-8 ordering without Unicode normalization. Frame and state fields remain unset for the next derivation.

- _Outcome:_ One complete, topology-pinned evidence pipeline now joins exact managed authorities and produces a
  deterministic provisional machine roster without collapsing first-use absence, malformed sources, transient
  identity tails, contributor metadata, physical aliases, or checkout-local workflow context.

### `[x]` **3.2 Derive frames, primary availability, recovery, and reconciliation verdicts** — D1, D4, D6, D9

- _Goal:_ Session entry and recovery receive one typed interpretation of active, suspended, idle, and residue
  frames instead of rebuilding occupancy or checkout safety from ambient branch state.

    - `[x]` **3.2.a Resolve the current frame graph and bounded parent edge**
        - Added pure frame/current derivation and one public state assembler. Private lease anchors survive only until
          exact entering-process selection, live transient children suspend their single live WU parent, and null,
          dead, unknown, identity-only, cold, ambiguous-sibling, and invalid-parent cases remain explicit.

    - `[x]` **3.2.b Read directed primary-checkout safety facts**
        - Added a fail-closed primary safety probe whose status and branch reads are pinned to the resolved primary
          checkout and compared with the configured base. Clean/dirty, on/off-base, detached, mismatched/missing
          base, cross-directory, and unavailable Git facts remain distinct.

    - `[x]` **3.2.c Derive allocation, in-flight identity, and recovery surfaces**
        - Added pure operational derivation for exact free/occupied/unsafe primary allocation, byte-stable
          identity action projections, and none/resume/residue/stop recovery. Directed safety and target-lock facts
          now fail closed without mistaking valid in-place WU occupancy, dead replaceable WU leases, unrelated live
          roles, or transient residue for a free launchpad.

    - `[x]` **3.2.d Build deterministic reconciliation plans**
        - Added a pure reconciliation reducer that emits byte-sorted clean/apply/stop summaries for verified
          adoption, stale-record reap, and dead-lock break candidates while retaining exact absent/present record
          generations or lock holder bytes, token, and anchor only in the internal plan. Target-scoped uncertainty,
          duplicate aliases, malformed identity authority, and missing proofs stop without partial actions.

- _Outcome:_ One deterministic state layer now derives frames, current-session selection, directed primary
  allocation, identity actions, recovery, and proof-bearing reconciliation without turning diagnostics or public
  summaries into mutation authority.

### `[x]` **3.3 Implement lease attach, heartbeat, release, role update, and pop operations** — D3, D4, D6

- _Goal:_ All role and lease changes linearize through one expected-generation API that preserves newer sessions
  and returns one command-independent result shape.

    - `[x]` **3.3.a Mint durable roles from trusted topology evidence**
        - Added an authority-derived role mint boundary with exact applied/idempotent replay and typed malformed or
          role-generation refusal. WU, full identity-backed, partial Errand, groom, and full/partial housekeep roles
          now receive only their legal claim, dispatch, origin, and routing-plan fields; same-key claims from another
          generation cannot join an existing role.

    - `[x]` **3.3.b Attach and refresh single-session leases**
        - Added exact-generation lease attachment with cryptographic 128-bit-or-stronger default tokens, complete
          session-home/anchor/timestamp binding, exact replay, dead-WU replacement, and live/unknown/dead-transient
          refusal. Heartbeats now advance only for state-touching calls carrying the matching record, lease token,
          and anchor; read-only calls preserve the observed generation.

    - `[x]` **3.3.c Release and update only the expected generation**
        - Added directed exact-token lease release with lost-response replay and newer-token preservation, plus
          authority-derived role/parent replacement gated by the target record ID, checkout path, exact prior role,
          and byte generation. Same-result retries are idempotent; changed roles or raced writes refuse without
          mutating the newer record.

    - `[x]` **3.3.d Pop roles without weakening preservation rules**
        - Added exact-byte role pop with absent replay, changed role/lease preservation, duplicate and live/unknown
          vetoes, and raced-generation reclassification. Every pop path now returns the strict shared mutation
          result with precomposed guidance and the complete nullable success surface; malformed producers fail schema
          validation rather than emitting partial JSON.

- _Outcome:_ One directed mutation core now derives roles from authority evidence and preserves every newer record,
  role, lease, parent, and heartbeat generation across mint, attach, refresh, release, update, and pop operations.

### `[x]` **3.4 Reconcile WU roles, dead locks, and stale records through expected generations** — D6, D9

- _Goal:_ State-touching entry repairs only locally proven gaps while transient adoption and subject-owned residue
  wait for their marker and operation drivers.

    - `[x]` **3.4.a Revalidate and apply safe local reconciliation actions**
        - Added a driver that reruns the proof-bearing plan, rejects changed reader or authority evidence, and applies
          WU adoption or stale-record reap only under the directed record lock. Dead main locks now expose a direct
          exact-holder secondary-break operation, so breaking never acquires the lock being removed; byte/token/
          anchor changes, live/unknown holders, malformed records, races, and retries remain fail-closed or idempotent.

### `[x]` **3.5 Expose the read contract through `arc locus`** — D6

- _Goal:_ Humans and workflows can inspect complete locus state through a deterministic command without gaining a
  hidden mutation or heartbeat path.

    - `[x]` **3.5.a Add the read-only `arc locus [--json]` command**
        - Added the bounded evidence-to-roster reader, exact subject/meta joins, schema-validated JSON emission, plain
          deterministic human rendering, and CLI registration. Successful diagnostics remain exit-zero; all four
          root errors preserve one-envelope JSON or stderr-only human output with exit one, while empty first-use
          roots and read-only heartbeat preservation are covered explicitly.

## **Phase 4:** Locus Allocation and Transient Provisioning Foundations

_Purpose:_ Allocate primary or spawned loci, establish complete transient provenance, and land the shared inbox
transaction boundary before operation composers consume it.

### `[x]` **4.1 Build the protection-aware primary-or-spawn allocator** — D1, D7

- _Goal:_ Every transient open gets a safe active checkout without branch-switching a WU workspace or inventing a
  partial-mode fallback that weakens base-branch safety.

    - `[x]` **4.1.a Resolve allocation from typed availability and live Git guards**
        - Added a protection-aware planner that emits only primary/spawn proposals or typed refusals, preserves the
          identity-free partial Errand/housekeep and claimed partial-groom boundary, and refuses unsafe primary
          evidence without weakening partial mode. Primary linearization now prepares/rolls back remote claims
          outside the exact record lock, reruns state and directed Git guards under ownership, and permits only one
          recordless-primary contender to apply local state.

    - `[x]` **4.1.b Extract generic linked-worktree creation and shared setup seams**
        - Added a provenance-free configured-placement/`git worktree add` primitive with exact fresh/existing branch
          receipts and typed collision or Git-failure outcomes. Post-create execution and registered harness copying
          now live in a reusable setup boundary consumed by the unchanged WU mutator; focused tests prove setup
          ordering/failure containment and that generic creation writes no ownership marker.

    - `[x]` **4.1.c Expose the renamed WU wrapper behind a compatibility alias**
        - Renamed the WU-specific module/API to `reconcileWorkUnitWorktree()`, routed fresh linked creation through
          the generic collision-aware receipt boundary and shared setup, and retained the old module as an exact
          compatibility re-export. The focused old/new suites preserve default spawn, explicit in-place entry,
          ownership-marker ordering, teardown/self-hop behavior, and symbol equivalence.

    - `[x]` **4.1.d Migrate WU entry and lifecycle-engine callers**
        - Migrated direct and graduate `start` entry, the production executor context, and lifecycle execution to the
          WU-specific reconciler while retaining the old context seam for later verb callers. Focused command and
          engine coverage proves new/existing routing, context construction, result forwarding, and failure behavior.

    - `[x]` **4.1.e Migrate lifecycle-policy and WU-verb callers, then retire the old name**
        - Migrated lifecycle policy, encoding legs, `park-resume`, teardown, and every WU verb fixture to the
          WU-specific reconciler while preserving in-place, self-teardown, husk, and lifecycle outcomes. The focused
          mutator suite now follows the renamed module, and the compatibility export was removed after a clean
          repository-wide old-symbol search.

    - `[x]` **4.1.f Bind transient placement and partial-mode refusal to the generic primitive**
        - Bound full-protection spawn proposals to `createLinkedWorktree()` with
          `locus-<role>-<slug>-<claimId>` placement, the stable operation branch, and exact configured collision
          refusal. Reused slugs receive generation-distinct paths, while partial mode refuses before touching the
          creation boundary and cannot synthesize a branch or second base checkout.

    - `[x]` **4.1.g Enforce the directed-command harness boundary**
        - Added a fixed Codex/Claude `directedCommands` capability, a warm-entry guard that returns precomposed
          `cold-entry-required` guidance before invoking mutation, and an executor that pins Git work to an explicit
          locus. Successful open results now require both active-locus and session-home paths at the schema boundary.

- _Outcome:_ Allocation now separates protection-aware planning, primary-lock linearization, and generation-qualified
  linked creation while keeping WU behavior behind its own wrapper. Warm entry is admitted only where subsequent
  commands can be directed to the returned locus without moving the agent process, human terminal, or ambient
  checkout.

### `[x]` **4.2 Provision ownership markers, transient roles, and materialized Errand loci recoverably** — D4, D7

- _Goal:_ Every ARC-created transient checkout carries durable provenance and a matching role/lease generation, and
  a partial provisioning failure remains diagnosable rather than markerless.

    - `[x]` **4.2.a Extend worktree provenance for transient subjects**
        - Added exact Errand, groom, and housekeep marker subjects carrying `claimId` plus transient-only provisioning
          state. Pending/ready shapes round-trip as current; unknown provisioning and claimless legacy Errands remain
          manual-only, while malformed claim/provisioning combinations reject. WU, branch, husk, and primary-marker
          behavior remain unchanged, and legacy transient markers no longer satisfy managed-roster authority.

    - `[x]` **4.2.b Extend canonical subject and retirement-receipt codecs**
        - Widened canonical subjects to exact generation-bearing Errand, groom, and housekeep variants so receipt
          digests distinguish kind and claim generation. Strict decoding accepts those closed token-valid shapes,
          preserves WU, legacy Errand, and branch compatibility, and rejects incomplete, illegal, or unknown input.

    - `[x]` **4.2.c Centralize generation-aware subject equality and retirement refusal**
        - Centralized subject comparison across retirement authorization and teardown: transient equality now requires
          exact kind, slug, and claim generation, while every transient kind is refused before WU teardown effects.
          Legacy husk/status shapes remain narrow until transient cleanup projection is introduced.

    - `[x]` **4.2.d Project transient provenance into status and cleanup classification**
        - Added one diagnostic-only transient provenance classifier and projected ready, pending, legacy, unknown,
          malformed, and claim-mismatched marker evidence through local in-flight entries, current branchless
          orientation, locus subject joins, and stale cleanup status. Only an exact ready marker joins an existing
          role to its identity generation; every transient cleanup report remains blocked, while WU and branch husk
          cleanup retain their prior authority.

    - `[x]` **4.2.e Compose a recoverable transient provisioning transaction**
        - Added `provisionTransientLocus()` as the staged spawn-or-primary composer. Spawned allocation verifies the
          live roster, exposes exact pending provenance before setup, promotes only unchanged marker bytes, and mints
          the role/lease generation after owned-lock revalidation; primary allocation keeps checkout and record
          mutation in one markerless critical section. Receipts retain branch/worktree heads, marker bytes, record
          bytes, and the lease token, while rollback removes only unchanged invocation-owned generations and returns
          typed identity-only, pending-marker, or marker/record mismatch evidence for every incomplete path.

- _Outcome:_ Transient checkout authority is now generation-bound end to end: marker decoding, status projection,
  retirement refusal, and provisioning all preserve exact claim provenance, while partial failures remain visible
  and cannot authorize adoption or cleanup across a raced generation.

### `[x]` **4.3 Bind transient adoption after identity and marker provisioning exist** — D6, D9

- _Goal:_ Existing ARC-owned transient worktrees can acquire their missing local roles only after both authority
  domains are readable and mutually consistent.

    - `[x]` **4.3.a Apply transient adoption through the shared reconciliation driver**
        - Added exact transient adoption proofs carrying ready-marker bytes, checkout head/branch, and the matching
          v3 identity generation. Candidate derivation keeps pending, legacy, incomplete, cross-identity, and
          claim-mismatched evidence blocked; the shared driver reruns its plan, acquires the directed record lock,
          compares a target-local authority recheck, and mints only the unchanged role. Exact replay is idempotent,
          while identity-only, pending-marker, and marker/record races return their reconciliation evidence.

### `[x]` **4.4 Establish concurrency-safe USER-INBOX mutation authority** — D8, D9

- _Goal:_ Every later dispatch mark, unbind, and completion removal linearizes through one notes-locked mutation
  seam and returns the exact state it wrote, so operation drivers never race through private read/modify/write loops.

    - `[x]` **4.4.a Add lock-serialized batch mutation and post-image results**
        - Added one identity-notes-lock transaction for exact title/source-digest-qualified dispatch mark, unmark,
          and removal batches. It validates the complete preimage before one atomic replacement, preserves
          unrelated bytes, returns the exact written post-image/digest, and treats only exact replay as idempotent.
          Existing inbox removal now uses the same seam; focused tests cover malformed and raced state, concurrent
          writers, failed replacement, and visible execute-dispatch grammar.

## **Phase 5:** Transient Operation Verbs

_Purpose:_ Move Errand, grooming, and housekeeping lifecycle mechanics behind the shared allocator and mutation
result so workflows consume verbs and precomposed verdicts.

### `[ ]` **5.1 Compose the complete ordinary-Errand and promotion lifecycle** — D4, D7, D8

- _Goal:_ An ordinary Errand can execute, adopt an inbox origin, pause, await review, resume elsewhere, complete,
  abandon, or explicitly become a WU through one recoverable lifecycle without displacing or duplicating an active
  parent checkout.

    - `[x]` **5.1.a Replace in-place Errand open with identity-plus-allocation composition**
        - Composed full and partial opens through production ancestry acquisition, locus-state reading, allocation,
          provisioning, and rollback; full mode mints exact v3 identity while partial mode stays identity-free and
          branch-free, and both preserve inbox-dispatch evidence without displacing a warm parent.
        - Added the shared `LocusMutationResultV1` command boundary with `--json`/human parity, exact locked inbox
          adoption, fail-closed ancestry and legacy-identity handling, production marker/record mutations, and real
          CLI plus compatibility coverage for the retired v2-producing surface.

    - `[x]` **5.1.b Make late inbox linking an exact v3 transition**
        - Routed late linking through a complete local/remote basis read followed by an exact-generation identity
          transaction, preserving same-entry replay while refusing changed claims, legacy identities, different
          origins, conflicting dispatches, and missing or malformed locked inbox evidence before mutation.
        - Added the shared `errand-link` mutation result and `--json` boundary, with unit, real-Git integration,
          remote-only reconciliation, and E2E coverage proving JSON/human parity and legacy compatibility refusal.

    - `[ ]` **5.1.c Implement full-mode leave to paused or awaiting-merge**
        - Add `arc errand leave <slug> --state paused|awaiting-merge` and validate the exact remote-preserved WIP
          head or change request before closing local occupancy.
        - Register leave plus `--json` in `packages/arc-framework/src/cli.ts` and render only the shared result.
        - Return the primary to base or tear down the spawned checkout, release/pop the exact role, and report the
          freshly restored parent frame in that order.
        - Refuse partial-mode leave. Keep wrapper-floor classification in the workflow; the command never guesses
          whether work is promotion-worthy.
        - Build `test-first` (one behavior at a time):
            - Cover exact pause/review preservation, primary/spawned cleanup, restored warm/cold parents, failed
              identity persistence, failed role pop, partial refusal, and replay after a lost response.

    - `[ ]` **5.1.d Resume identity tails through the ordinary open driver**
        - Permit paused resume after preservation proof and awaiting-merge resume only when exact host truth reports
          requested work.
        - Allocate a fresh locus, return the identity to open, and preserve the original WU parent or null cold
          parent without creating a third frame.
        - Build `test-first` (one behavior at a time):
            - Cover paused and requested-work resume, open/merged/changed/unreachable host results, stale claim
              generations, allocation rollback, and exact dispatch continuity.

    - `[ ]` **5.1.e Separate local leave from merge finalization**
        - Refactor `packages/arc-framework/src/lib/errand/close.ts` so base-context finalization proves merge,
          cleans the recorded local/remote branch only at the exact `changeRequest.headSha`, retires identity, and
          removes the inbox capture after local occupancy is already gone.
        - Preserve v1/v2 close-only restore behavior as bounded compatibility and keep remote heads when they remain
          the only preservation proof. Restrict `close --force` to that legacy compatibility arm; v3 never bypasses
          exact host and ref proof.
        - Consume the shared lock-serialized inbox mutation seam and derive any next-offer only after the exact entry
          removal succeeds or is already absent, using its returned post-image rather than rereading an unbound file
          snapshot.
        - Rewire the existing close registration and handler to emit the shared result in human/JSON modes.
        - Build `test-first` (one behavior at a time):
            - Cover exact merged finalization, already-deleted refs, moved heads, remote failures, notes-lock races,
              v1/v2 force compatibility, v3 force refusal, and identity retention on unsafe cleanup.

    - `[ ]` **5.1.f Add explicit ordinary-Errand abandonment**
        - Add `arc errand abandon <slug>` for identity-only open, paused, or exact closed-unmerged awaiting tails.
        - Register abandon plus `--json` in `packages/arc-framework/src/cli.ts` and render only the shared result.
        - Require clean/provenance/ref-preservation checks, clear only the matching execute-dispatch binding through
          the shared inbox mutation seam without deleting its capture, and never treat branch absence or age as
          authorization.
        - Build `test-first` (one behavior at a time):
            - Cover each legal state, live/unknown/dirty residue, every host result, exact dispatch unbinding,
              changed inbox state, moved refs, and idempotent replay.

    - `[ ]` **5.1.g Convert exact v3 Errands into work-unit session homes**
        - Refactor `packages/arc-framework/src/lib/errand/promote.ts` and its handler so `arc errand promote` requires
          the live ordinary v3 claim/role/lease, committed branch head, target checkout, and unused WU name.
        - Recoverably rename the branch and mint the WU meta, replace a spawned transient marker plus target role
          with WU authority under owned-lock revalidation, and release any warm parent WU lease so the promoted
          checkout becomes the sole active session home. Retire Errand identity last.
        - Acquire target and optional parent record locks in deterministic record-ID order for the complete local
          frame replacement; perform no remote identity I/O until both locks release, and preserve proof-bearing
          intermediate evidence for idempotent retry.
        - Return `originEntry` without removing the inbox capture; Phase 7 drops it only after the promotion meta
          commit. Remove standalone `arc errand retire` registration/exports because no safe independent v3 edge
          remains.
        - Rewire promotion plus `--json` through `packages/arc-framework/src/cli.ts` and the shared result.
        - Build `test-first` (one behavior at a time):
            - Cover cold/warm and primary/spawned promotion, parent release, marker/role conversion, name collision,
              deterministic two-lock ordering, dirty or uncommitted source, every mid-transaction recovery point,
              v1/v2 refusal, capture preservation, and shared-result command rendering.

### `[ ]` **5.2 Add ownership-safe full-mode Errand materialization** — D4, D7

- _Goal:_ Cross-machine Errand resume creates an ARC-owned checkout and role through one verb instead of leaving a
  markerless raw worktree outside cleanup and recovery.

    - `[ ]` **5.2.a Replace branch-shaped candidates with exact v3 resume projections**
        - Refactor `packages/arc-framework/src/lib/session-init/materializable-errands.ts` and
          `packages/arc-framework/src/lib/session-init/errand-state.ts` to select only identity-only paused or
          requested-work awaiting-merge v3 claims.
        - Carry `claimId`, branch, expected head (`savedHead` or `changeRequest.headSha`), and dispatch context;
          remove recordless branch-derived slug fallback and refuse `open`, legacy, malformed, or incomplete bases.
        - Build `test-first` (one behavior at a time):
            - Cover paused/requested-work candidates, open and legacy exclusion, exact expected-head projection,
              malformed snapshot refusal, and stable disambiguation.

    - `[ ]` **5.2.b Implement and register `arc errand materialize <slug>`**
        - Fetch the selected branch into a caller-owned snapshot, prove its live remote head still equals the
          candidate's expected OID, refuse any local branch/worktree collision, and create the local branch plus
          configured checkout through `provisionTransientLocus()`.
        - Transition the exact identity to open and attach its lease through the provisioning composer; do not run
          a second attach or route through the WU-specific worktree wrapper.
        - Register `materialize --json` in `packages/arc-framework/src/cli.ts`; Phase 7 owns replacement of the raw
          session-init workflow mechanics.
        - Build `test-first` (one behavior at a time):
            - Cover paused and requested-work materialization, changed/missing remote head, local double checkout,
              provenance/setup failure, identity/provision rollback races, cleanup-safe retry, and directed result
              paths in integration and command-boundary tests.

### `[ ]` **5.3 Compose single- and multi-WU groom-and-ship transitions** — D4, D7, D8

- _Goal:_ One pre-WU grooming pass can co-design an explicit fixed set of related stubs through one edit-and-review
  tail without allowing overlapping claims, arbitrary planning riders, or started-WU branch contamination.

    - `[ ]` **5.3.a Add exact-set `arc plan open <anchor-stub> [--include <stub>...]` claim and allocation**
        - Extend or replace `resolveBacklogStub()` with strict set resolution that scans planned, provisional, and
          active lifecycle state. Require every member to resolve uniquely to a branchless planned/provisional stub;
          canonicalize one anchor plus unique explicitly included members, and refuse cross-state/nested duplicates,
          repeated members, or any active/started subject instead of silently preferring planned.
        - Extend `packages/arc-framework/src/handlers/plan.ts` with v3 groom create-if-absent,
          protection-aware allocation, role/lease provisioning, shared-result rendering, and CLI registration.
        - Full mode uses `chore/groom-<anchor-stub>`; partial mode keeps the same identity-backed set claim while
          editing the free primary base with `branch: null`. The set is immutable for that claim generation; a larger
          set requires close/abandon plus a fresh open rather than an in-place authority expansion.
        - Refresh the configured base before claiming, pin its exact tip as `openedBaseHead`, and create the
          full-mode branch at that OID. In partial mode, revalidate unchanged base `HEAD` while acquiring the primary
          role/lease. Roll back only the unchanged claim if either transition loses its base generation.
        - Build `test-first` (one behavior at a time):
            - Cover exact/absent/duplicate/incompatible member resolution, canonical ordering, single/multi-member
              first claimants, disjoint concurrency, overlapping refusal, exact-set cross-machine loser adoption,
              exact conflicting-member guidance, base-refresh failure, moved-base claim rollback, draft-present
              routing, failed allocation rollback, and JSON/human parity.

    - `[ ]` **5.3.b Add groom close and review-tail transitions**
        - Validate that the grooming diff touches only claimed members' planning artifacts, cohort coordination
          records those members already name, and mechanically required derived project views; refuse unrelated
          planning riders and any started-WU artifact outside that fixed set.
        - In full mode, refresh the configured base outside locus locks, prove the branch descends from
          `openedBaseHead`, and classify paths from its live merge-base. In partial mode, require current base `HEAD`
          to descend from `openedBaseHead` and classify the exact commit/diff range; refuse unrelated intervening
          commits or incomplete Git evidence.
        - Full mode records the exact awaiting-merge change request before closing occupancy; partial mode retires
          the claim only after its direct-base commit and push discipline complete.
        - Rerunning open/close offers resume, wait, or finalization from record state instead of cutting a second
          stable branch.
        - Register close plus `--json` and render only the shared result.
        - Build `test-first` (one behavior at a time):
            - Cover path-pure single/multi-member diffs, legal cohort/derived writes, unrelated and started-WU rider
              refusal, moving full-mode base, non-descendant or intervening partial commits, full awaiting-merge
              close, partial completion, resume/wait/finalize verdicts, role-pop failure, exact host truth, and
              idempotent replay.

    - `[ ]` **5.3.c Add explicit groom abandonment and safe branch reuse**
        - Add `arc plan abandon <anchor-stub>` for open or exact closed-unmerged tails with the shared preservation
          checks and exact member-set projection.
        - Register abandon plus `--json` and render only the shared result.
        - Retire merged claims only from exact host truth, then remove the recorded local/remote branch generation
          under its expected head before minting a fresh claim ID; branch absence or base containment is not proof.
        - Build `test-first` (one behavior at a time):
            - Cover single/multi-member open and closed-unmerged abandonment, merged finalization, moved/absent heads,
              refreshed base, failed cleanup retention, and safe same-anchor branch reuse.

### `[ ]` **5.4 Compose one-sweep housekeeping open, close, resume, and abandon transitions** — D4, D7, D8

- _Goal:_ A confirmed pure-routing drain has one recoverable occupancy and one review tail regardless of lanes or
  increments, and repeated sweep names cannot reuse stale branch generations or admit a second full-mode drain.

    - `[ ]` **5.4.a Add lane- and dispatch-bearing `arc housekeep open <slug>` sweep claims**
        - Extend `packages/arc-framework/src/handlers/housekeep.ts` to finalize an exact merged prior tail, reject
          another live routing identity under any slug, and create one full-mode `housekeep-routing` identity or
          partial-mode sweep occupancy.
        - Add `packages/arc-framework/src/lib/housekeep/plan.ts` with a bounded exact-key `HousekeepPlanV1` input
          schema for the complete confirmed write-affecting plan in inbox order. Each exact title selects one closed
          disposition and only its legal normalized destination/commitment fields. Require a `sourceDigest` over
          each exact entry block after CRLF-to-LF and one-terminal-newline normalization; reject duplicate,
          missing/currently mismatched, illegal, or oversized input.
        - Accept `--plan-file <path|->` plus `--lane auto|reviewed`, canonicalize the plan, and compute its
          `sha256:<64 lowercase hex>` digest before mutation. Exclude overlap advisories, review chunking, and lane
          from the digest so presentational changes and monotonic `auto → reviewed` escalation remain legal.
        - Mint one dispatch ID. Full mode first persists lane/dispatch/digest in its identity claim; partial mode
          first allocates the free primary and mints its exact role/lease with dispatch/digest under the record lock,
          then releases that lock before acquiring the identity notes lock; never nest the two lock domains.
        - Through the shared inbox mutation seam, revalidate every planned title/source digest and batch-mark exactly
          the plan's execute-now captures under the identity notes lock. A changed preimage or notes-write failure
          rolls back only the unchanged full claim or partial role, so no partial dispatch proposal survives solely
          in process memory.
        - Full mode then allocates/provisions through the shared primary/spawn rules; partial mode uses its already
          owned primary locus. Return wait/finalize rather than duplicating a losing cross-machine claim. Register
          open and `--json` through `packages/arc-framework/src/cli.ts`.
        - State the protection boundary explicitly: full mode is serialized across machines through identity CAS;
          partial mode has only machine-local primary occupancy and makes no cross-machine single-flight claim.
        - Build `test-first` (one behavior at a time):
            - Cover exact plan canonicalization, disposition-field validation, duplicate/current-title or source
              mismatch, line-ending normalization, size bounds, and digest stability across equivalent JSON encoding.
            - Cover same/different-slug one-winner claims, persisted mixed-lane classification, downgrade refusal,
              full/partial dispatch/digest state, crashes before/after inbox marking, all-or-nothing notes mutation,
              exact partial-role rollback, and full allocation rollback.

    - `[ ]` **5.4.b Persist the complete routing sweep under one branch and review classification**
        - Keep every confirmed routing write on the same full-mode identity/branch/PR and classify the whole review
          tail by the strictest touched lane.
        - Allow ordered in-session review increments and commits without creating per-lane or per-chunk identities.
        - Adopt an existing full identity or partial role only when the re-supplied canonical plan matches its
          immutable digest; return `routing-plan-mismatch` or explicit resume/abandon guidance when it differs or is
          unavailable instead of binding a later drain to the live sweep.
        - Build `test-first` (one behavior at a time):
            - Cover compaction/resume retaining the strictest lane, dispatch, and plan digest; repeated open
              idempotence; and refusal when the live identity, re-supplied plan, or marked entry set changes.

    - `[ ]` **5.4.c Close, resume, finalize, or abandon the sweep**
        - Close local occupancy only after the full routing sweep is preserved; retain one awaiting-merge identity
          in full mode and retire the partial claim after direct-base completion.
        - Add exact-host resume/finalize and explicit closed-unmerged abandonment; refuse an incomplete sweep at
          handoff.
        - On finalization or abandonment, clean the recorded local branch and lease-delete the remote head at its
          expected `headSha`; refresh base before allowing the same slug/branch name to mint a new claim generation.
        - Clear the exact dispatch bindings when an open sweep is explicitly abandoned before handoff. Once close
          succeeds, the execute group is independent of the routing PR tail and later tail abandonment cannot erase
          its confirmed siblings.
        - Register close/abandon plus `--json` and render only their shared results.
        - Build `test-first` (one behavior at a time):
            - Cover repeated `inbox-drain` generations, moved/lingering remote heads, stale local branches, refreshed
              base, and exact cleanup refusal without losing the completed tail.

### `[ ]` **5.5 Preserve sequential sibling-Errand continuation through typed next-offers** — D4, D7, D8, D9

- _Goal:_ Execute-now captures remain a durable inbox queue, while each completed transient operation can offer the
  next sibling without persisting an Errand queue or nesting a housekeeping frame.

    - `[ ]` **5.5.a Derive generation-bound next-offers after transient close**
        - Add a pure offer resolver over well-formed execute-bound captures carrying the caller's exact dispatch ID,
          the completed subject, and the original WU parent path or null cold parent.
        - Populate only the shared mutation result's typed `nextOffer`; never delete an execute-now capture before
          its own Errand completes, scan unrelated dispatches, or skip malformed/unreadable state.
        - Build `test-first` (one behavior at a time):
            - Cover zero/one/many same-dispatch captures, stable file order, unrelated groups, warm/cold parents,
              resumed Errands, and malformed/partial group refusal.

    - `[ ]` **5.5.b Enforce the housekeep-close-before-Errand-open boundary**
        - Make the first sibling Errand open only after routing occupancy has popped and the WU frame is active
          again.
        - Ensure compaction at either side of the close/open boundary rederives one child or none, never a third
          frame. Session-init surfaces pending dispatch groups separately from routable housekeep entries; another
          drain may report but cannot consume/rebind one without a newly confirmed plan.
        - Build `test-first` (one behavior at a time):
            - Cover interruption before/after housekeep close, fresh-session dispatch resume, open-sweep abandon,
              Errand abandon, unrelated later housekeep, and exact group exhaustion.

### `[ ]` **5.6 Expose state-touching locus companions after subject drivers exist** — D6, D7, D9

- _Goal:_ Lifecycle sites can attach, release, resume, or abandon exact locus generations through commands that
  preserve JSON discipline and never hold a local record lock across remote or host operations.

    - `[ ]` **5.6.a Add `arc locus attach` and `release`**
        - Bind trusted role reconciliation and lease attach for an optional roster-backed checkout, and release only
          the exact record/lease generation named by the caller.
        - Derive role and subject from markers, metas, and identities; never accept them as command operands.
        - Register both commands and `--json` through `packages/arc-framework/src/cli.ts`; render only the shared
          mutation result in human and JSON modes.
        - Emit one validated `LocusMutationResultV1` for `--json`; applied/idempotent exit zero and refused/error exit
          one.
        - Build `test-first` (one behavior at a time):
            - Cover trusted marker/meta/identity derivation, optional directed checkout, exact release, stale token,
              malformed authority, and JSON/human parity.

    - `[ ]` **5.6.b Add `arc locus resolve` through subject-owned resume and abandon drivers**
        - Dispatch dead transient residue to the matching Errand, housekeep, or groom driver while refusing live,
          unknown, dirty, unproven, missing-checkout, or changed-generation state.
        - Separate remote/host proof and identity transitions from the final local record-lock critical section;
          rederive and validate the expected action at each boundary and perform no remote call while holding a locus
          lock.
        - Register resolve and `--json` through `packages/arc-framework/src/cli.ts`; render only the shared mutation
          result.
        - Build `test-first` (one behavior at a time):
            - Cover each subject/action pair, live/unknown/dirty/unproven refusal, changed generation, missing
              checkout, remote/host failure, and exact dispatch cleanup delegation.

    - `[ ]` **5.6.c Cover stateful command boundaries end to end**
        - Cover trusted adoption, exact release, every subject dispatch, raced revalidation, failed allocation
          rollback, retry idempotence, and operational error envelopes.
        - Prove JSON stdout/stderr separation and directed-checkout behavior from a different command cwd.

## **Phase 6:** Work-Unit Session, Recovery, and Cleanup Integration

_Purpose:_ Make work-unit entry, session probing, compaction recovery, handoff, and teardown share the locus graph
as their machine-local occupancy authority.

### `[ ]` **6.1 Mint and adopt work-unit roles at spawn, materialize, and session entry** — D4, D7

- _Goal:_ Every managed WU checkout has durable ownership from creation through teardown and exactly one attached
  session when active, without changing existing meta or marker authority.

    - `[ ]` **6.1.a Mint WU roles beside spawn and materialize markers**
        - Extend lifecycle `reconcileWorkUnitWorktree()` so its successful spawn/in-place composition mints the
          trusted WU role only after the target appears in Git's roster. Keep `scaffoldIntoWorktree()` responsible
          for meta/marker creation rather than adding a second role-mint authority.
        - Make in-place mint the physical primary's WU role from the exact start/resume transition receipt even
          though the primary has no ARC-created-worktree marker; spawn remains the default full-protection path and
          `--here` remains explicit.
        - Route start, resume, and `runMaterialize()` through that WU-owned composition with the applicable idle or
          entering-session lease state.
        - Preserve spawn-anchored behavior: the originating session does not attach to or relocate into a newly
          created WU worktree.
        - Build `test-first` (one behavior at a time):
            - Cover start, resume, materialize, partial provisioning failure, and idempotent replay in integration
              tests.

    - `[ ]` **6.1.b Adopt and attach WU roles during session entry**
        - Reconcile a recordless ARC-marked WU from its marker/meta, replace only a conclusively dead WU lease, and
          attach the entering session's exact token/anchor.
        - Reconcile a recordless markerless in-place WU only when the physical primary's current branch and one
          resolved active WU meta match exactly; never infer WU authority from an arbitrary off-base branch.
        - Refuse another live/unknown lease, missing primary topology, cross-identity ownership, or marker/meta
          conflict with precomposed guidance.
        - Build `test-first` (one behavior at a time):
            - Cover marker-backed linked adoption, exact markerless in-place adoption, arbitrary off-base refusal,
              same-session attach replay, dead-lease replacement, live/unknown refusal, missing topology, ownership
              conflict, and changed marker/meta proof under the owned lock.

    - `[ ]` **6.1.c Bind WU role lifetime to physical checkout ownership**
        - Preserve the same role generation across activation, deactivation, integration, reopening, and archival;
          branch or lifecycle presentation changes do not rewrite physical ownership.
        - Mint on spawn/resume/materialize/in-place entry and pop only when park or post-transition teardown
          linearizes the ownership-ending action under the target record lock: linked worktrees physically remove;
          an in-place primary proves exact clean/branch state and restores configured base. Archive itself retains
          the role until its post-merge teardown.
        - Build `test-first` (one behavior at a time):
            - Cover stable linked and in-place transitions, exact primary base restoration, fresh
              resume/materialize generations, park and post-archive pop, partial failure, and replay without
              duplicate or missing roles.

### `[ ]` **6.2 Add `locusState` to session entry, recovery, and handoff orchestration** — D6, D9

- _Goal:_ Every session operation receives one shared locus interpretation and dispatches on its typed verdicts
  instead of recomputing frame or machine-state conditions in handlers and workflow prose.

    - `[ ]` **6.2.a Extend the session-envelope schema and registry composition**
        - Add required `locusState: probe(LocusStateV1Schema)` fields to `SessionInitProbeResultSchema` and
          `SessionRecoverProbeResultSchema`, their handwritten producer interfaces, and compile-time compatibility
          proofs; add the same required typed probe to `SessionHandoffResult` without inventing another value shape.
        - Project missing identity as `identity-missing` without invoking the reader and root/topology failure as
          `runtime`; the slot is always present rather than conflating failure with an omitted probe.
        - Compose the locus registry roots with `createSessionEnvelopeRegistry()` without weakening the strict
          session-init object or duplicating schema definitions.
        - Build `test-first` (one behavior at a time):
            - Extend fixtures, exact-presence failures, identity/runtime error arms, producer compatibility,
              registry composition, and type-authority tests across init, recover, and handoff producers.

    - `[ ]` **6.2.b Add the shared locus probe to session-operation orchestration**
        - Extend `SessionInitProbes`, `SessionRecoverProbes`, `SessionHandoffProbes`, and their status handlers to
          compute the network-free locus reader once per operation and thread that exact state into downstream
          entry, recovery, cleanup, and materialization consumers.
        - Extend the existing inbox-state probe with ordered execute-dispatch group summaries and malformed-group
          diagnostics so pending dispatches remain visible without counting as routable housekeep entries.
        - Keep read-only status from attaching, heartbeating, reconciling, or reaping records.
        - Build `test-first` (one behavior at a time):
            - Cover success, identity-missing, root failure, ambiguous current state, zero/one/multiple dispatch
              groups, malformed bindings, and stable JSON output.

### `[ ]` **6.3 Recover active and suspended frames from locus-aware compaction state** — D4, D9

- _Goal:_ Compaction recovery resumes the authoritative active transient frame and restores its parent context even
  when the harness summary is missing or the stored snapshot is stale.

    - `[ ]` **6.3.a Add one atomic optional locus hint to the compaction seed**
        - Extend `packages/arc-framework/src/lib/compaction-seed/schema.ts`, `emitter.ts`, and
          `CompactionSeedEnvelope` with one optional atomic `locus` object containing required session-home path,
          active-locus path, record ID, lease ID, and nullable parent record ID while retaining `schemaVersion: 1`.
        - Emit the complete object only from a resolved current record with a live entering lease; omit it for
          `none`, ambiguity, or probe failure. Never make old seeds invalid, persist partial hints, or treat snapshot
          values as live authority.
        - Build `test-first` (one behavior at a time):
            - Cover pre-model seeds, complete hint round-trips, partial-object rejection, every omission arm,
              producer validation, and atomic write behavior.

    - `[ ]` **6.3.b Derive recovery state from the fresh locus graph**
        - Update `packages/arc-framework/src/handlers/recover-probes.ts` and recover orchestration to consume the
          required `locusState.current` verdict and referenced rows instead of resolving the session home, transient
          child, parent edge, or identity join a second time.
        - Derive workflow, load set, and task cursor from the reader-validated row projections. A selected transient
          with a null parent gives cold and between-WU sessions the same recovery path as a warm child.
        - Stop on ambiguous current state, missing/mismatched tokens, malformed rows, or dead/unknown liveness; do
          not add a recovery-side tiebreaker.
        - Build `test-first` (one behavior at a time):
            - Cover WU-only, warm child, null-parent transient, identity-only tail, ambiguous current, changed token,
              malformed projection, dead/unknown residue, and proof that frame selection is reader-owned.

    - `[ ]` **6.3.c Reconcile seed snapshots against locus-derived authority**
        - Extend recovery audit/report schemas to accept a missing legacy hint and compare every field of a present
          atomic `locus` object against the fresh current row and lease. Any record, lease, parent, or normalized-path
          mismatch is a structured stop.
        - Keep fresh row/meta derivation authoritative for workflow and cursor state; seed fields remain audit
          baselines and never overwrite the reader projection.
        - Resume `run-errand`, grooming, or housekeeping first; after close/pop, rederive and restore the WU or
          between-WUs frame.
        - Build `test-first` (one behavior at a time):
            - Cover absent legacy hints, exact matches, each field mismatch, unresolved fresh state, transient-first
              dispatch, restored WU rederivation, and record-free cold completion.

    - `[ ]` **6.3.d Preserve bounded rollout recovery**
        - Allow an already-open v2 `returnBranch` Errand with no child record to use the shipped restore path once.
        - Cover warm planning/execution WU→Errand compaction, partial Errand recovery, identity-only tails, pending
          execute dispatches, and both sides of the housekeep→sibling boundary in integration/E2E tests.

### `[ ]` **6.4 Release or refuse transient frames correctly at handoff** — D4, D7, D9

- _Goal:_ Handoff never strands a live lease or records an incomplete transient operation as safely paused, while a
  completed local child restores and hands off the correct parent frame.

    - `[ ]` **6.4.a Resolve handoff from the active locus before branch/meta heuristics**
        - Consume the required handoff `locusState.current` verdict and its referenced current record, subject
          identity, parent, and exact lease generations before branch/meta heuristics.
        - Leave an eligible full-mode ordinary Errand through its subject driver; refuse incomplete housekeep,
          groom, partial Errand, or unpreserved full-mode work until completion, promotion, or abandonment.
        - Build `test-first` (one behavior at a time):
            - Cover WU-only, warm child, cold transient, restored parent, and generation races.

    - `[ ]` **6.4.b Release every current-frame lease exactly once**
        - After subject close/leave, release a restored WU through `arc locus release` with exact IDs and surface a
          mismatch rather than clearing another session. A cold transient close/pop leaves a record-free primary and
          performs no release.
        - Keep release scoped to the explicit handoff path. Add no speculative harness-session-end event, hook
          script, or install-recipe asset; abrupt termination remains recoverable through dead-anchor replacement.
        - Build `test-first` (one behavior at a time):
            - Cover direct WU handoff, warm-child parent restoration and release, cold no-op, exact-token mismatch,
              duplicate release replay, abrupt process exit, and dead-anchor recovery without a hook.

### `[ ]` **6.5 Linearize lease-aware teardown with existing retirement guards** — D3, D10

- _Goal:_ Cleanup cannot remove a checkout while a session attaches, and a dead lease never replaces any existing
  provenance, cleanliness, terminal-head, remote, or user-surface predicate.

    - `[ ]` **6.5.a Add locus occupancy to teardown authorization**
        - Extend `TeardownContext`, worktree cleanup decisions, and retirement revalidation with record/lock reads.
        - Suppress live leases; prompt on unknown, malformed, legacy, cross-identity, duplicate, or markerless
          state; allow dead/absent only when every pre-existing predicate independently authorizes removal.
        - Build `test-first` (one behavior at a time):
            - Cover each occupancy state without changing current shipped-husk outcomes.

    - `[ ]` **6.5.b Hold the target lock across final local revalidation and removal**
        - Derive the target lock from the live roster path even when no record exists, then reread the role/lease
          generation, worktree roster, clean tree, `HEAD`, marker/evidence, current-locus, and subject authority.
        - Hold the lock across local `git worktree remove` and expected-generation role pop; perform no fetch, push,
          or host query inside.
        - Leave the record unchanged when physical removal fails and release the lock safely.
        - Build `test-first` (one behavior at a time):
            - Cover record-present/absent target locks, every final predicate changing after advisory selection,
              physical-removal failure, exact role-pop mismatch, lock release, and no remote call in the critical
              section.

    - `[ ]` **6.5.c Prove attach-versus-delete linearization**
        - Add deterministic race tests where attach wins and vetoes removal, removal wins and makes attach fail on
          missing roster state, or a generation changes during advisory-to-final revalidation.
        - Cover WU teardown, branch teardown, spawned transient cleanup, self-teardown relocation, and husk replay.

### `[ ]` **6.6 Project locus reconciliation and cleanup guidance into session surfaces** — D6, D10, D11

- _Goal:_ Session entry and cleanup display one calm, actionable interpretation of occupancy and residue without
  hiding valid routes or auto-resolving uncertain state.

    - `[ ]` **6.6.a Replace branch-shape residue inference with locus classifications**
        - Update `packages/arc-framework/src/lib/session-init/errand-state.ts`,
          `packages/arc-framework/src/lib/git/in-flight-derivation.ts`, the session-init stale-worktree and
          orphan-branch sweeps, and materialize surfaces to consume managed-role and identity-only rows.
        - Stop classifying live `chore/groom-*` branches as unowned residue and surface open/paused/awaiting identities
          with their fixed action order.
        - Build `test-first` (one behavior at a time):
            - Cover legacy branches, sanctioned grooming, all exact v3 protected branches, incomplete identity reads,
              orphan-delete suppression, allocation gaps, and stale records.

    - `[ ]` **6.6.b Render CLI-precomposed reconciliation and cleanup text**
        - Feed current frame, primary availability, recovery, reconciliation, and lease-aware cleanup results into
          status/session envelopes without rebuilding their conditions in Markdown.
        - Preserve all existing sync/base/notes surfaces and add no age-based cleanup recommendation.
        - Build `test-first` (one behavior at a time):
            - Cover stable action order, precomposed text parity across init/recover/handoff, unchanged legacy
              surfaces, root errors, diagnostics, and absence of age-only cleanup advice.

## **Phase 7:** Packaged Procedure and Cross-Flow Validation

_Purpose:_ Ship the locus doctrine through canonical procedures and prove the complete model across platforms,
protection modes, recovery boundaries, and package/source parity.

### `[ ]` **7.1 Rewrite session, transient, and WU placement workflows around locus verbs** — D1, D7, D9, D11

- _Goal:_ Shipped procedures invoke typed lifecycle verbs and frame user judgment around their results, leaving
  deterministic allocation, recovery, sequencing, and safety logic in the CLI.
- **Additional Context:** `strategy-procedure-evolution.md` § Self-Check and Forward-Compat Principles;
  `notes-session-locus-model.md` § Codebase pointers.

    - `[ ]` **7.1.a Rework session initialization and its probe reference**
        - Under authoritative package `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/`, update
          `session-init.template.md` and `session-init/probe-envelope.md`, then render/sync the project instance.
        - Consume the one required `locusState: Probe<LocusStateV1>` reader projection, attach the selected role,
          dispatch on CLI-composed actions/narration, and preserve all existing sync, notes, and base surfaces.
        - Replace raw Errand `git worktree add` materialization with `arc errand materialize`; consume lease-aware
          cleanup and `arc locus resolve` results instead of rebuilding branch-shape or removal conditions in prose.

    - `[ ]` **7.1.b Rework deterministic compaction recovery**
        - Under authoritative package `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/`, update
          `session-recover.md`, then sync its project copy.
        - Consume the same required reader-owned `locusState` rows as init/handoff, validate any atomic optional seed
          `locus` hint, recover a transient first, and rederive the restored WU or record-free between-WUs frame.
        - Remove branch-prefix frame selection and second graph resolution; dispatch only on typed verdicts and
          precomposed refusal/recovery text.

    - `[ ]` **7.1.c Rework handoff around subject leave and exact WU release**
        - Under authoritative package `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/`, update
          `session-handoff.template.md`, then render/sync the project instance.
        - Resolve the active locus before WU branch/meta heuristics, run the matching subject leave/close driver,
          and surface CLI refusal text for incomplete housekeep, groom, partial Errand, or unpreserved work.
        - Release only the exact restored WU lease after the subject driver completes; a cold transient close/pop
          ends on a record-free primary and performs no fabricated release.

    - `[ ]` **7.1.d Rework the Errand workflow for allocation, leave, resume, and next-offer**
        - Update authoritative package `packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md`,
          then sync its project copy.
        - Cover full/partial open, directed active-locus execution, paused/review tails, exact late inbox linking,
          explicit abandon, locus-aware promotion, post-meta-commit capture removal, and dispatch-qualified sibling
          continuation through typed verbs and precomposed results.
        - Preserve the single-concern/single-session planning boundary and keep the inbox as the durable queue.

    - `[ ]` **7.1.e Rework grooming and one-sweep housekeeping procedures**
        - Update authoritative package `packages/arc-framework/arc/system/workflows/arc/draft-design.md` grooming
          entry to exact-set `arc plan open → groom → ship → close`, then sync its project copy. Support an anchor
          plus explicit related backlog members as one fixed pre-WU co-design concern; keep started-WU branches
          isolated and route their cross-WU coordination normally.
        - Update authoritative package `packages/arc-framework/arc/system/workflows/arc/supplemental/drain-inbox.md`,
          then sync its project copy: open one routing sweep with the confirmed strictest lane and complete
          canonical plan file, establish the full identity or partial role before visible dispatch bindings, render
          its digest, require exact-plan re-supply on retry, close routing occupancy, and only then hand the exact
          dispatch group to sibling Errands.

    - `[ ]` **7.1.f Align work-unit placement procedures with primary launchpad occupancy**
        - Under authoritative package `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/`, update
          `planning/init-work-unit.md` and `resume-work-unit.md`, then sync their project copies.
        - Keep spawned placement the full-protection default and `--here` the explicit escape hatch. State that
          in-place entry converts the physical primary into a WU-owned occupied locus until exact teardown restores
          record-free base; never describe that checkout as simultaneously available for transient work.

### `[ ]` **7.2 Update locus doctrine at operation fire sites** — D1, D4, D8, D11

- _Goal:_ Teams encounter durable checkout roles, sequential transient allocation, identity-tail behavior, and
  occupancy-aware cleanup where those rules govern action, without adding another always-loaded document.

    - `[ ]` **7.2.a Update concurrent-work and work-organization guidance**
        - Update authoritative package `strategy-concurrent-work.md` and `strategy-work-organization.md`, then sync
          their project copies, defining free-primary launchpad behavior, explicit in-place WU conversion, and
          WU-owned-checkout exclusivity.
        - Replace in-place displacement, one-PR-per-lane routing, and parked-groom branch guidance with the locus,
          one-sweep, and groom-and-ship doctrines.
        - Define bounded multi-WU grooming as one explicit immutable backlog-member set on one grooming identity and
          branch; overlapping live member sets refuse, while started-WU work remains one branch per WU.
        - Clarify that full-mode paused/review identity tails are operational re-entry, not durable WU planning.

    - `[ ]` **7.2.b Update concise command and agent orientation surfaces**
        - Update authoritative package `reference/QUICK-REFERENCE.template.md` and
          `reference/briefs/AGENT-BRIEF.ARC.md`, then render/sync their project copies.
        - Add `arc locus`, new transient verbs, and the minimal durable-role vocabulary only where each operation is
          discovered; preserve project-specific sections while rendering the configurable quick reference.
        - Keep all emitted prompt/advisory templates CLI-side and avoid new agent-interpreted control-flow markup.

    - `[ ]` **7.2.c Update canonical entry skills without editing generated copies**
        - Update package and project canonical `arc-session`, `arc-errand`, `arc-housekeep`, `arc-handoff`, and
          `arc-plan` `SKILL.md` sources with their exact locus-aware entry contracts.
        - Make `arc-session --plan` and `arc-plan` carry one anchor plus explicit included backlog members into the
          exact-set groom open; preserve the single-anchor shorthand and reject started-WU members.
        - Let init/update regenerate harness-local skill copies and assert byte parity; do not hand-edit `.claude/`,
          `.codex/`, `.agents/`, or other generated tool directories.

### `[ ]` **7.3 Synchronize packaged and self-hosted methodology surfaces** — D11

- _Goal:_ Adopters and this self-hosted checkout execute the same locus procedures without overwriting
  project-specific configurable sections or leaking internal planning context.

    - `[ ]` **7.3.a Reconcile canonical package changes into the project instance**
        - Treat `packages/arc-framework/arc/**` as authoritative for Framework content and apply the corresponding
          rendered changes to `.arc/**`; preserve template conditionals and never blind-copy Configurable files.
        - Preserve adopter-facing language boundaries and keep WU names, rollout notes, and internal seams out of
          shipped methodology.

    - `[ ]` **7.3.b Close install-recipe and self-hosted parity blind spots**
        - Add `system/workflows/arc/supplemental/drain-inbox.md` and
          `reference/strategies/arc/strategy-concurrent-work.md` to `packages/arc-framework/init-recipe.json` so
          generated housekeep guidance and installed strategy references never point at missing files.
        - Strengthen `packages/arc-framework/__tests__/integration/framework-sync.test.ts` to derive the resolved
          Framework output universe from the current install recipe as well as the installed manifest, render
          templates through the stored install config, and continue excluding Configurable/Scaffolded byte parity.
        - Cover fresh init, update, exact concurrent-work/drain-inbox recipe reach, general reference completeness,
          and canonical-to-generated skill parity in the existing init/update/skills integration and E2E suites.

    - `[ ]` **7.3.c Add and run methodology structural contracts**
        - Add a focused integration contract for required locus verbs and `locusState`, exact-set planning syntax,
          forbidden raw Errand materialization/compound state dispatch, absence of a second workflow-side frame
          selector, package/project references, and recipe-installed workflow/strategy reach; register it in
          `test:arc-contracts`.
        - Run `npm run test:arc-contracts`, targeted init/update/skills tests,
          `npx tsx packages/arc-framework/src/scripts/validate-extension-points.ts` over changed workflows,
          `npm run lint:arc:triggers`, `npm run lint:arc:section-refs`, and `npm run -s lint:md`.
        - Confirm new CLI names resolve in packaged templates and canonical/generated harness skills.

### `[ ]` **7.4 Cover cross-flow locus scenarios end to end** — D4-D10

- _Goal:_ Real temporary repositories prove the complete locus model across worktree topology, protection modes,
  compaction boundaries, identity review tails, and cleanup races rather than only isolated unit seams.

    - `[ ]` **7.4.a Prove one shared session/recovery/handoff projection**
        - Exercise the required reader-owned `locusState` projection through real init, compaction-recovery, and
          handoff envelopes in temporary repositories.
        - Cover an absent legacy seed hint, an exact optional atomic `locus` match, every hint-field mismatch,
          transient-first recovery, restored workflow/load-set/task-cursor derivation, and record-free cold recovery.

    - `[ ]` **7.4.b Cover warm WU→Errand→WU execution and release**
        - Exercise planning and execution WUs, primary and spawned allocation, pause/resume, requested-work
          awaiting-merge resume, completion, and cold/warm locus-aware promotion.
        - Prove warm child completion restores and releases only the exact WU lease, while cold transient completion
          performs no release and leaves a free recordless primary.

    - `[ ]` **7.4.c Cover grooming and one-sweep housekeeping concurrency**
        - Exercise single/multi-member groom claims, disjoint concurrency, exact-set retry adoption, partial/full
          overlap races, fixed-set diff bounds, exact merged-tail retirement, mixed-lane one-PR routing, exact
          plan-digest adoption/refusal, repeated housekeeping branch-name generations, generation-bound execute-now
          sibling continuation, interrupted dispatch isolation, and compaction during/at the edge of routing close.

    - `[ ]` **7.4.d Cover materialization, adoption, and ambiguous residue**
        - Exercise WU/Errand materialization provenance, recordless ARC-marked backfill, failed claim rollback,
          malformed/duplicate records, unknown liveness, and partial-mode primary-only refusal.

    - `[ ]` **7.4.e Cover cleanup and rollout compatibility**
        - Race attach against physical removal, prove live/unknown vetoes, retain every existing teardown guard, and
          close one pre-model v2 `returnBranch` Errand without allowing a new displaced open.

### `[ ]` **7.5 Exercise process-inspector contracts on every supported operating system** — D5

- _Goal:_ Native CI confirms that each production inspector observes the same PID-plus-start-token contract and
  degrades unavailable evidence to unknown on Linux, macOS, and Windows.

    - `[ ]` **7.5.a Add native contract probes and fixtures**
        - Extend the platform-neutral acquisition and liveness contracts with OS-specific live-process,
          missing-process, PID-token, permission, and malformed-output cases not already required by Task 5.1.a,
          using injected snapshots where native failure states cannot be forced safely.
        - Keep production invocations argument-array based and bounded; tests must not rely on localized display
          formatting.

    - `[ ]` **7.5.b Wire the supported-OS CI matrix**
        - Add the inspector contract to `test:portability`, extend `scripts/classify-change.sh` so inspector source
          and focused tests trigger that suite, and update classifier/workflow contract tests with the new members.
        - Run it on qualifying Linux PRs and on scheduled or explicitly dispatched macOS/Windows jobs through the
          existing portability policy; do not add the costlier pair to every PR or alter general heavy-CI routing.
        - Publish enough failure context to distinguish adapter drift from unavailable host facilities.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Warm transient entry never switches or repurposes a WU-owned checkout; spawn remains the normal
  full-protection WU placement, while explicit `--here` occupies the physical primary until guarded teardown
  restores record-free base.
- `[ ]` Full protection allocates the free primary or a provisioned transient worktree; partial mode never spawns.
- `[ ]` Compaction during a warm Errand consumes the shared locus projection, checks any atomic optional seed hint,
  recovers the child frame, and restores freshly derived parent WU context.
- `[ ]` `arc locus` is deterministic, read-only, network-free, schema-validated, complete across valid residue
  states, and projected once into each session-init, recovery, and handoff operation.
- `[ ]` Locus records remain machine-local, notes-excluded, generation-safe, and reclaim only proven-dead locks.
- `[ ]` Live or unknown primary occupancy and duplicate or malformed topology always refuse automatic allocation.
- `[ ]` Existing ARC-owned worktrees and the exact markerless in-place WU case adopt safely, live grooming is never
  offered as residue/orphan cleanup, and unverified markerless or unresolved cases stay manual.
- `[ ]` Single- or multi-member grooming claims admit disjoint co-design sets, produce one unique winner for every
  overlap, adopt retries only for the same anchor and exact member set, bound writes to the claimed planning concern,
  and require exact change-request and branch-generation retirement before reuse.
- `[ ]` Errand materialization accepts only exact paused or requested-work awaiting-merge v3 heads and writes both
  ARC ownership provenance and the matching local role.
- `[ ]` Teardown holds the locus lock across final revalidation, physical removal, and expected-generation role pop.
- `[ ]` One full-mode housekeeping sweep uses one identity, immutable canonical plan digest, persisted strictest
  lane, and review tail; adopts only an exact re-supplied plan, excludes a concurrent sweep under every other slug,
  safely reuses repeated branch names only after exact generation cleanup, then opens execute-now work as
  exact-dispatch sibling Errands without leaking interrupted groups into later drains. Partial mode is explicitly
  machine-local, carries the same plan digest in its role, and mints that role before any dispatch marking.
- `[ ]` Exact v3 promotion converts one Errand locus into the sole active WU session home and preserves its inbox
  capture until the WU meta commit, with no standalone v3 retirement command.
- `[ ]` Full-mode Errands can pause or await merge without leaving an unleased transient role as normal waiting state.
- `[ ]` Partial-mode Errands remain direct-base, machine-local, non-materializable, and non-pausable.
- `[ ]` Handoff releases an exact restored WU lease once; a cold between-WUs transient closes to a record-free primary
  without fabricating a lease-release operation.
- `[ ]` Linux, macOS/BSD, and Windows inspectors enforce PID-plus-start-token liveness with unknown-safe degradation.
- `[ ]` Locus schemas compose with the landed kernel and session envelope without a parallel type or codec authority.
- `[ ]` Package/source parity and all required tests, lint, type checks, builds, and platform CI pass.
- `[ ]` Ready for integration.
