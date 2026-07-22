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

### `[x]` **5.1 Compose the complete ordinary-Errand and promotion lifecycle** — D4, D7, D8

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

    - `[x]` **5.1.c Implement full-mode leave to paused or awaiting-merge**
        - Added `errand leave --state paused|awaiting-merge` with exact remote-head or open-change-request proof,
          identity-first persistence, and shared JSON/human results; partial mode refuses before identity access.
        - Primary and spawned occupancies restore base or remove the owned worktree before atomically popping the
          entering process's exact role/lease generation, retaining recoverable tails and supporting replay across
          failed persistence, failed role cleanup, and lost responses with warm or cold parent restoration.

    - `[x]` **5.1.d Resume identity tails through the ordinary open driver**
        - Composed paused and exact requested-work awaiting tails through the ordinary open driver without rotating
          their claim, while plain-open, merged, changed-head, unreachable, and stale-generation evidence refuses.
        - Fresh primary/spawned allocation reuses only the exact retained branch head, links the entering WU or null
          cold parent, preserves inbox-dispatch output, and restores the prior tail on allocation rollback.

    - `[x]` **5.1.e Separate local leave from merge finalization**
        - Added an identity-only v3 finalizer that requires exact merged host truth, cleans local and remote refs only
          at the recorded head, removes the originating capture through the notes-locked post-image seam, and retires
          the unchanged identity last so every unsafe or raced leg remains recoverable.
        - Kept v1/v2 restore/reap behavior behind an explicit legacy close arm, including its bounded `--force`
          escape hatch, while v3 force, moved heads, unreachable remotes, and unverifiable lifecycle evidence refuse.
        - Rewired close to the shared human/JSON mutation result and exact next-dispatch offer, with focused unit,
          real-Git integration, and built-CLI coverage for deletion, replay, compatibility, and failure containment.

    - `[x]` **5.1.f Add explicit ordinary-Errand abandonment**
        - Added `errand abandon` for exact ordinary-v3 open, paused, and closed-unmerged review tails, with
          base-or-fetched-remote ref preservation, dead-residue lease/provenance/cleanliness checks, and exact
          record-lock cleanup; absent or moved branches, live/unknown leases, and every non-authorizing host result
          retain the identity.
        - Routed exact execute-dispatch unbinding through the notes-locked inbox mutation seam without deleting the
          capture, retired identity last, and exposed one shared human/JSON result with replay-safe command coverage.

    - `[x]` **5.1.g Convert exact v3 Errands into work-unit session homes**
        - Replaced promotion with an exact ordinary-v3 frame transaction that revalidates live role and lease
          authority under deterministically ordered target/parent locks, recoverably renames the committed branch,
          mints the WU meta, converts spawned provenance and role authority, and releases the warm parent lease.
        - Retires identity only after local locks release, preserves the inbox origin for the later meta-commit
          boundary, exposes shared human/JSON results, and removes the unsafe standalone retire command surface.

- _Outcome:_ Ordinary Errands now share one generation-bound lifecycle from open through leave/resume and exact
  merge finalization, abandonment, or promotion. Every terminal path preserves recoverable identity and local
  evidence until its final authority transition, with compatible refusal for legacy and partial-mode state.

### `[x]` **5.2 Add ownership-safe full-mode Errand materialization** — D4, D7

- _Goal:_ Cross-machine Errand resume creates an ARC-owned checkout and role through one verb instead of leaving a
  markerless raw worktree outside cleanup and recovery.

    - `[x]` **5.2.a Replace branch-shaped candidates with exact v3 resume projections**
        - Materialization candidates now derive only from valid ordinary-v3 paused or requested-work awaiting tails
          that also have remote-only branch evidence. Each stable slug-sorted projection carries its immutable claim,
          expected head, lifecycle state, and inbox dispatch context; recordless, open, legacy, mismatched review,
          local, malformed, and non-Errand inputs produce no candidate.

    - `[x]` **5.2.b Implement and register `arc errand materialize <slug>`**
        - Added the full-protection-only command with caller-owned remote snapshots, exact expected-head and local
          branch collision guards, isolated transient provisioning, and exact local-ref cleanup on failed retries.
        - Reused the ordinary resume transaction so paused and requested-work tails retain their claim generation,
          transition to open before provisioning, roll back on failure, and emit shared human/JSON mutation results.

### `[x]` **5.3 Compose single- and multi-WU groom-and-ship transitions** — D4, D7, D8

- _Goal:_ One pre-WU grooming pass can co-design an explicit fixed set of related stubs through one edit-and-review
  tail without allowing overlapping claims, arbitrary planning riders, or started-WU branch contamination.

    - `[x]` **5.3.a Add exact-set `arc plan open <anchor-stub> [--include <stub>...]` claim and allocation**
        - Added strict fixed-set resolution across planned, provisional, and active state, refusing missing, repeated,
          ambiguous, or already-started members while retaining the explicit anchor and byte-sorting claim members.
        - Registered `plan open` with fresh base pinning, immutable v3 claim/adoption, full/partial allocation,
          role/lease provisioning, exact claim rollback, pinned partial-base revalidation, and shared JSON/human output.

    - `[x]` **5.3.b Add groom close and review-tail transitions**
        - Added a fixed-set path policy for claimed member planning artifacts, their named cohort records, and the
          derived readiness view, refusing unrelated backlog, active-WU, and general repository riders.
        - Registered exact full/partial close: both refresh and verify base ancestry, full mode persists the exact
          change-request tail before popping occupancy, and partial mode requires the pushed base head before
          retiring its claim; reruns return wait or merged finalization instead of duplicating the branch.

    - `[x]` **5.3.c Add explicit groom abandonment and safe branch reuse**
        - Added `plan abandon` for clean exact open generations and host-proven closed-unmerged tails, plus merged
          finalization on repeated close; every path checks exact checkout, local ref, fetched remote ref, claim, and
          change-request generations before cleanup and retains identity on unsafe or failed settlement.
        - Exact remote lease deletion and local compare-and-delete remove the old stable branch generation before a
          later open can mint a fresh claim, while absent or moved evidence refuses without broad cleanup authority.

- _Outcome:_ Grooming now has one generation-bound fixed-set lifecycle across single and multi-member planning,
  protection-aware execution, path-pure review tails, exact abandonment/finalization, and safe stable-branch reuse.

### `[x]` **5.4 Compose one-sweep housekeeping open, close, resume, and abandon transitions** — D4, D7, D8

- _Goal:_ A confirmed pure-routing drain has one recoverable occupancy and one review tail regardless of lanes or
  increments, and repeated sweep names cannot reuse stale branch generations or admit a second full-mode drain.

    - `[x]` **5.4.a Add lane- and dispatch-bearing `arc housekeep open <slug>` sweep claims**
        - Added bounded exact-key plan parsing and canonical digesting, plus full identity and partial-role open
          composition with plan-wide source revalidation and atomic execute-now dispatch binding.
        - Full mode binds before allocation and rolls back exact bindings plus the unchanged claim on failure;
          partial mode owns the machine-local primary before binding and removes only that exact failed role.
        - Registered plan-file/stdin, strictest-lane, and shared human/JSON command output with focused canonical,
          claim-race, inbox-mutation, type, lint, and build validation.

    - `[x]` **5.4.b Persist the complete routing sweep under one branch and review classification**
        - Exact-plan retries adopt the existing full identity or partial role and dispatch, while changed plans or
          entry bindings refuse; full-mode identity claims monotonically escalate `auto` to `reviewed` without
          rotating the branch, claim, dispatch, or plan generation.

    - `[x]` **5.4.c Close, resume, finalize, or abandon the sweep**
        - Added pure-routing diff enforcement, direct-base partial close, identity-first full review-tail persistence,
          and retryable exact occupancy cleanup before merged-host finalization.
        - Added open and closed-unmerged abandonment with exact local/remote generation cleanup and refreshed-base
          proof; only open abandonment clears its dispatch group, leaving post-close sibling execution independent.
        - Registered close and abandon through the shared human/JSON mutation result boundary, with exact transition,
          path-policy, dispatch projection, type, lint, build, and built-command registration coverage.

- _Outcome:_ Housekeeping now carries one immutable confirmed plan through a full cross-machine identity or a
  machine-local partial role, preserves one strictest-lane review tail, and separates confirmed sibling dispatches
  from later tail settlement while retaining exact rollback and branch-generation cleanup authority.

### `[x]` **5.5 Preserve sequential sibling-Errand continuation through typed next-offers** — D4, D7, D8, D9

- _Goal:_ Execute-now captures remain a durable inbox queue, while each completed transient operation can offer the
  next sibling without persisting an Errand queue or nesting a housekeeping frame.

    - `[x]` **5.5.a Derive generation-bound next-offers after transient close**
        - Added a pure exact-dispatch offer resolver that preserves file order, excludes the completed subject,
          carries the active WU parent or cold null parent, returns exhaustion as no offer, and refuses malformed or
          partially completed groups instead of scanning into another generation.
        - Wired housekeep and ordinary-Errand close results to the same typed `nextOffer` boundary while retaining
          each execute-now capture until its own completion.

    - `[x]` **5.5.b Enforce the housekeep-close-before-Errand-open boundary**
        - Housekeep close now computes but emits its first sibling only after exact occupancy cleanup restores the
          parent frame; interrupted retries rederive the same group from visible inbox bindings.
        - Session-init excludes execute-bound captures from routable housekeep count, projects stable pending groups
          separately, and surfaces malformed partial bindings as diagnostics so later drains cannot silently consume
          or rebind them.

- _Outcome:_ Execute-now continuation is now a visible inbox-backed sequence: every close can offer at most the next
  exact-generation sibling with its direct parent, while exhaustion, interruption, unrelated drains, and malformed
  groups remain deterministic without introducing a stored Errand queue or nested housekeeping frame.

### `[x]` **5.6 Expose state-touching locus companions after subject drivers exist** — D6, D7, D9

- _Goal:_ Lifecycle sites can attach, release, resume, or abandon exact locus generations through commands that
  preserve JSON discipline and never hold a local record lock across remote or host operations.

    - `[x]` **5.6.a Add `arc locus attach` and `release`**
        - Added reader-selected current or directed-checkout attach and exact caller-token release under the local
          record lock, deriving every role and subject from the validated roster rather than command operands.
        - Reuses the entering process's exact lease generation idempotently, refuses live/unknown or changed
          authority, retains the durable role on release, and registers shared human/JSON mutation-result commands.

    - `[x]` **5.6.b Add `arc locus resolve` through subject-owned resume and abandon drivers**
        - Added exact record selection and trusted-role dispatch for Errand, housekeep, and groom resume/abandon;
          live, unknown, absent-lease, dirty, missing-checkout, unproven, duplicate, and raced generations refuse.
        - Resume replaces only the selected dead lease under its record lock, while abandonment delegates remote,
          host, identity, dispatch, and teardown work outside that lock to the matching lifecycle driver.
        - Registered the positional record/action CLI boundary and shared human/JSON mutation result, including
          operational error containment that leaves the selected generation available for retry.

    - `[x]` **5.6.c Cover stateful command boundaries end to end**
        - Added built-command fixtures for exact marker/meta WU adoption, ready-marker/identity transient adoption,
          directed checkout selection from another cwd, mismatched and exact release, and public operand shapes.
        - The subject/action matrix, exact-generation mutation tests, and provisioning rollback suite cover dispatch,
          raced revalidation, same-anchor replay, and failure containment across the shared drivers.
        - Proved operational JSON remains a single stdout envelope with empty stderr while human errors retain the
          stderr path, including invalid resolve input before any state mutation.

- _Outcome:_ Lifecycle consumers now have one typed companion surface for trusted role adoption, exact lease
  attachment/release, and explicit dead-residue resolution; caller operands select only records and generations,
  while role, subject, preservation, and dispatch authority continue to derive from validated local state.

## **Phase 6:** Work-Unit Session, Recovery, and Cleanup Integration

_Purpose:_ Make work-unit entry, session probing, compaction recovery, handoff, and teardown share the locus graph
as their machine-local occupancy authority.

### `[x]` **6.1 Mint and adopt work-unit roles at spawn, materialize, and session entry** — D4, D7

- _Goal:_ Every managed WU checkout has durable ownership from creation through teardown and exactly one attached
  session when active, without changing existing meta or marker authority.

    - `[x]` **6.1.a Mint WU roles beside spawn and materialize markers**
        - Composed roster-validated WU role minting and optional entering-session attachment into
          `reconcileWorkUnitWorktree()`, with idle spawned roles, explicit in-place attachment dispositions, exact
          replay, and failure-before-role coverage across start, resume, and materialize paths.

    - `[x]` **6.1.b Adopt and attach WU roles during session entry**
        - Proved the trusted attach runtime across marker-backed linked and exact markerless-primary adoption,
          same-session idempotent replay, unsafe off-base refusal, exact lease mutation, topology failure, ownership
          conflict, and live/dead/unknown replacement boundaries.

    - `[x]` **6.1.c Bind WU role lifetime to physical checkout ownership**
        - Added exact WU role retirement around the ownership-ending callback under the target record lock: linked
          removal and in-place primary base restoration pop only after physical success, preserve records on
          failure, and leave branch/lifecycle-only transitions outside role lifetime.

- _Outcome:_ Managed WU checkouts now carry one machine-local role from trusted creation/adoption through guarded
  physical retirement, while spawned entry stays idle and explicit in-place entry owns the entering lease.

### `[x]` **6.2 Add `locusState` to session entry, recovery, and handoff orchestration** — D6, D9

- _Goal:_ Every session operation receives one shared locus interpretation and dispatches on its typed verdicts
  instead of recomputing frame or machine-state conditions in handlers and workflow prose.

    - `[x]` **6.2.a Extend the session-envelope schema and registry composition**
        - Made the shared `Probe<LocusStateV1>` slot required across init, recover, and handoff producers; strict
          init/recover contracts validate it from the locus schema authority, while the session registry now
          composes the complete locus family without duplicate definitions.

    - `[x]` **6.2.b Add the shared locus probe to session-operation orchestration**
        - Added one identity-gated, network-free locus read to each session operation, preserving exact success,
          ambiguity, identity-missing, and runtime verdicts in stable JSON without mutation. Reused the existing
          ordered execute-dispatch summaries and malformed-binding diagnostics that exclude pending groups from
          routable housekeep counts.

- _Outcome:_ Session init, recovery, and handoff now expose one schema-validated occupancy interpretation from the
  same reader and registry family, so later workflow dispatch can consume locus authority without recomputation.

### `[x]` **6.3 Recover active and suspended frames from locus-aware compaction state** — D4, D9

- _Goal:_ Compaction recovery resumes the authoritative active transient frame and restores its parent context even
  when the harness summary is missing or the stored snapshot is stale.

    - `[x]` **6.3.a Add one atomic optional locus hint to the compaction seed**
        - Kept schema v1 backward-compatible while adding one all-fields-or-absent locus hint; emission selects only
          the reader-resolved current row with a live lease and omits every unresolved, ambiguous, failed, or
          incomplete projection.

    - `[x]` **6.3.b Derive recovery state from the fresh locus graph**
        - Added a schema-backed recovery-frame projection over the reader-owned `current` verdict and exact referenced
          rows. Recovery now derives WU, warm-child, and null-parent transient workflows, load sets, and cursors from
          that snapshot, while ambiguity, token drift, incomplete projections, and dead/unknown residue fail closed;
          the old recover-only cohort and task-cursor probes no longer create a second selection authority.

    - `[x]` **6.3.c Reconcile seed snapshots against locus-derived authority**
        - Recovery reports now preserve an optional atomic seed hint and compare every path, record, lease, and parent
          field with the fresh reader-selected generation. Missing legacy hints remain valid; mismatches and unresolved
          fresh state are structured stops. Workflow and cursor requirements use the fresh recovery frame, including
          transient-first dispatch, restored-WU rederivation, planning recovery, and record-free cold completion.

    - `[x]` **6.3.d Preserve bounded rollout recovery**
        - Added one exact close-only projection for a current-branch v2 `returnBranch` Errand with no locus child,
          retaining the shipped restore path without admitting branch inference into normal recovery. Integration and
          E2E coverage lock warm planning/execution children, partial Errands, identity tails, dispatch groups, and
          the housekeep-to-sibling boundary.

- _Outcome:_ Fresh locus state now governs compaction recovery across active WUs, transient-first resumes, restored
  parent frames, and between-WU tails, while one narrowly selected pre-model Errand shape remains closable during
  rollout.

### `[x]` **6.4 Release or refuse transient frames correctly at handoff** — D4, D7, D9

- _Goal:_ Handoff never strands a live lease or records an incomplete transient operation as safely paused, while a
  completed local child restores and hands off the correct parent frame.

    - `[x]` **6.4.a Resolve handoff from the active locus before branch/meta heuristics**
        - Added a schema-backed `handoffLocus` action to the handoff envelope, derived from its existing reader-owned
          snapshot. Exact WU generations route to release, ordinary full-mode Errands route to their leave driver,
          record-free tails remain between WUs, and incomplete housekeep, groom, partial, mismatched, or ambiguous
          generations refuse before branch or meta heuristics.

    - `[x]` **6.4.b Release every current-frame lease exactly once**
        - Locked the explicit `handoffLocus` release sequence against the stateful CLI: the selected WU token releases
          once, mismatches refuse, and an already-cleared replay is idempotent. A naturally exited process leaves its
          lease for dead-anchor replacement by the next attach, with no session-end hook or installed asset; warm
          restoration reprojects the parent release while cold completion remains record-free.

- _Outcome:_ Handoff now starts from one exact current-frame action and converges through subject leave plus
  generation-checked WU release to a record-free or idle-role boundary without clearing another session's lease.

### `[x]` **6.5 Linearize lease-aware teardown with existing retirement guards** — D3, D10

- _Goal:_ Cleanup cannot remove a checkout while a session attaches, and a dead lease never replaces any existing
  provenance, cleanliness, terminal-head, remote, or user-surface predicate.

    - `[x]` **6.5.a Add locus occupancy to teardown authorization**
        - Added an exact-path, network-free record/lock/marker classifier to teardown candidate selection and
          generation-stable pre-removal revalidation. Live leases suppress cleanup; indeterminate or untrusted
          occupancy stays manual, while dead/absent generations leave every existing retirement guard intact.

    - `[x]` **6.5.b Hold the target lock across final local revalidation and removal**
        - Added a roster-path-derived retirement transaction for record-present and record-absent targets. It
          revalidates exact role/lease bytes, roster `HEAD`, cleanliness, marker/evidence, live process locus, and
          local subject authority under lock, then encloses removal or base restoration plus compare-pop without
          remote work; failures preserve the record and always release the lock.

    - `[x]` **6.5.c Prove attach-versus-delete linearization**
        - Added deterministic lock-order tests where an attached live generation vetoes retirement and a pre-lock
          attach snapshot loses to removal, then fails its new under-lock roster reread. Coverage follows locked
          cleanup through WU, cheap-branch/transient, self-relocation, and detached-husk replay paths.

- _Outcome:_ Teardown occupancy is now a veto layered over every existing retirement predicate, with attach and
  removal serialized at the target record lock and no path for a dead lease to authorize deletion by itself.

### `[x]` **6.6 Project locus reconciliation and cleanup guidance into session surfaces** — D6, D10, D11

- _Goal:_ Session entry and cleanup display one calm, actionable interpretation of occupancy and residue without
  hiding valid routes or auto-resolving uncertain state.

    - `[x]` **6.6.a Replace branch-shape residue inference with locus classifications**
        - Threaded the cached complete locus graph through in-flight derivation, Errand/materialize state, and stale-
          worktree/orphan sweeps. Exact v3 identity branches and retained WU roles now suppress false residue or delete
          offers; incomplete locus authority suppresses cleanup, while legacy, stale-record, and husk evidence remain
          distinct and visible.

    - `[x]` **6.6.b Render CLI-precomposed reconciliation and cleanup text**
        - Added one additive `locusGuidance` projection shared byte-for-byte across init, recovery, and handoff. It
          precomposes current-frame, primary, recovery, reconciliation, fixed-order identity, diagnostic, and lease-
          aware cleanup narration while preserving every legacy slot and never recommending cleanup from age or a
          dead lease alone.

- _Outcome:_ Session surfaces now use the single cached locus graph both to classify residue and to render actionable
  narration, eliminating branch-shape cleanup guesses without hiding legacy or indeterminate state.

## **Phase 7:** Packaged Procedure and Cross-Flow Validation

_Purpose:_ Ship the locus doctrine through canonical procedures and prove the complete model across platforms,
protection modes, recovery boundaries, and package/source parity.

### `[x]` **7.1 Rewrite session, transient, and WU placement workflows around locus verbs** — D1, D7, D9, D11

- _Goal:_ Shipped procedures invoke typed lifecycle verbs and frame user judgment around their results, leaving
  deterministic allocation, recovery, sequencing, and safety logic in the CLI.

    - `[x]` **7.1.a Rework session initialization and its probe reference**
        - Reworked the canonical template, rendered instance, and probe reference around the required reader-owned
          `locusState`: exact role attachment and load-set dispatch now use locus verbs and CLI narration, Errand
          materialization uses `arc errand materialize`, and cleanup/recovery no longer rebuild branch heuristics.

    - `[x]` **7.1.b Rework deterministic compaction recovery**
        - Reworked canonical and self-hosted recovery to consume the single reader-owned `locusState`, its derived
          recovery frame/load set, and the audited optional seed hint. Typed frames now resume transients before
          rederiving the parent or record-free frame, with no branch-prefix or second-graph selection.

    - `[x]` **7.1.c Rework handoff around subject leave and exact WU release**
        - Reworked canonical and self-hosted handoff around the reader-derived `handoffLocus`: exact Errands preserve
          and leave through their subject driver, unsafe transient states render typed refusals, and finalization
          releases only the freshly restored WU lease while record-free cold closes release nothing.

    - `[x]` **7.1.d Rework the Errand workflow for allocation, leave, resume, and next-offer**
        - Reworked the canonical and self-hosted procedure around typed open/materialize/link/leave/promote/abandon/
          close results, directed locus paths, exact identity tails, and dispatch-qualified next offers. Added the
          missing partial-mode close/abandon runtime so direct-base completion and clean abandonment pop the exact
          role without inventing a portable identity.

    - `[x]` **7.1.e Rework grooming and one-sweep housekeeping procedures**
        - Reworked canonical and self-hosted grooming around an immutable `plan open → groom → ship → close` set,
          and housekeeping around one strictest-lane allocation, exact plan replay, occupancy-first dispatch binding,
          close-before-sibling continuation, and typed restoration. Added `arc housekeep plan` so the CLI compiles
          confirmed dispositions against current inbox generations and emits the canonical plan/digest.

    - `[x]` **7.1.f Align work-unit placement procedures with primary launchpad occupancy**
        - Reworked canonical and self-hosted WU initialization/resume around `arc start` and `arc resume`: spawned
          placement remains the full-protection default, `--here` explicitly establishes an occupied WU locus, and
          only exact teardown restores the physical primary to record-free launchpad availability.

- _Outcome:_ Session, transient, planning, and WU-placement procedures now dispatch through lifecycle verbs and
  consume reader-owned results. Allocation, fixed-set sequencing, recovery, frame restoration, identity tails, and
  primary occupancy no longer depend on branch-shape inference or prose-encoded state transitions.

### `[x]` **7.2 Update locus doctrine at operation fire sites** — D1, D4, D8, D11

- _Goal:_ Teams encounter durable checkout roles, sequential transient allocation, identity-tail behavior, and
  occupancy-aware cleanup where those rules govern action, without adding another always-loaded document.

    - `[x]` **7.2.a Update concurrent-work and work-organization guidance**
        - Updated canonical and self-hosted concurrency/work-organization doctrine with record-free primary
          availability, exclusive WU locus ownership, explicit in-place conversion, allocation without displacement,
          exact-set groom-and-ship claims, one-PR routing sweeps, and operational-only pause/review identity tails.

    - `[x]` **7.2.b Update concise command and agent orientation surfaces**
        - Added `arc locus`, exact-set planning, transient lifecycle, and one-sweep housekeep commands to the
          canonical template and project-specific quick reference without disturbing configurable project sections.
          Added only the minimal locus/transient-identity vocabulary to canonical and self-hosted agent orientation.

    - `[x]` **7.2.c Update canonical entry skills without editing generated copies**
        - Updated package and project canonical session, Errand, housekeep, handoff, and planning skills with exact
          locus-aware entry contracts. Planning now carries one anchor plus explicit included branchless members;
          repository skill-generation tests prove generated copies remain byte-identical without hand edits.

- _Outcome:_ Durable role ownership, free-primary allocation, exact-set grooming, fixed routing sweeps, and
  operational identity tails now appear at their decision and command fire sites across strategies, concise
  references, and canonical entry skills without adding an always-loaded doctrine surface.

### `[x]` **7.3 Synchronize packaged and self-hosted methodology surfaces** — D11

- _Goal:_ Adopters and this self-hosted checkout execute the same locus procedures without overwriting
  project-specific configurable sections or leaking internal planning context.

    - `[x]` **7.3.a Reconcile canonical package changes into the project instance**
        - Audited all 18 package methodology files changed by this WU: every directly mirrored Framework/skill file
          matches its project copy, rendered-template parity passes, the configurable quick reference retains its
          project sections, and shipped surfaces contain no WU identifiers or internal rollout seams.

    - `[x]` **7.3.b Close install-recipe and self-hosted parity blind spots**
        - Added concurrent-work and drain-inbox to the install recipe, then made self-hosted parity range over the
          union of manifest-tracked and currently resolved Framework outputs under the stored install config.
          Fresh init, update, E2E, and existing canonical-skill parity coverage now close the affected install paths.

    - `[x]` **7.3.c Add and run methodology structural contracts**
        - Registered a focused locus-methodology suite in `test:arc-contracts`; it binds the public verb set,
          reader-owned frame projection, exact-set planning, transient materialization boundary, mirrored decision
          sites, and recipe reach. Contract, init/update/skills, extension, trigger, section-reference, and CLI-help
          validation all resolve against the packaged and generated surfaces.

- _Outcome:_ Package/project reconciliation now includes both direct mirror drift and current-recipe omissions;
  fresh installs receive every locus-era decision surface referenced by the updated workflows, and structural
  contracts protect the command/projection boundaries that byte parity alone cannot express.

### `[ ]` **7.4 Cover cross-flow locus scenarios end to end** — D4-D10

- _Goal:_ Real temporary repositories prove the complete locus model across worktree topology, protection modes,
  compaction boundaries, identity review tails, and cleanup races rather than only isolated unit seams.

    - `[x]` **7.4.a Prove one shared session/recovery/handoff projection**
        - Added anchored real-repository lifecycle coverage for exact, absent, and field-mismatched locus hints;
          record-free cold frames; shared init/recovery/handoff projection; and warm transient-first recovery. Seed
          emission now derives the governing workflow, load set, cursor, and WU identity from that same locus state.

    - `[x]` **7.4.b Cover warm WU→Errand→WU execution and release**
        - Added real CLI round trips for planning/execution parents, spawned pause/resume, exact requested-work
          resumption, partial primary completion, and cold/warm promotion. Warm promotion now atomically rebases the
          promoted lease home while releasing its parent; partial completion returns the primary to a record-free row.

    - `[x]` **7.4.c Cover grooming and one-sweep housekeeping concurrency**
        - Added real CLI round trips for immutable grooming sets, exact replay, overlap refusal, disjoint generations,
          one-sweep lane escalation, plan-digest refusal, compaction recovery, and same-branch generation reuse. Exact
          grooming replay now returns its live allocation, while full housekeeping matches and retires its
          identity-backed role without confusing it with the partial-mode role shape.

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
