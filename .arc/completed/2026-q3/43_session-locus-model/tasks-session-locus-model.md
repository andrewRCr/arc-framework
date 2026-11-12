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

### `[x]` **7.4 Cover cross-flow locus scenarios end to end** — D4-D10

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

    - `[x]` **7.4.d Cover materialization, adoption, and ambiguous residue**
        - Added real CLI materialization of remote-only work-unit and paused Errand generations, asserting their
          exact ARC provenance markers and resumed identity. The focused matrix also covers recordless marked
          adoption, failed-claim recovery, malformed/duplicate evidence, unknown liveness, and partial-mode
          primary-only refusal.

    - `[x]` **7.4.e Cover cleanup and rollout compatibility**
        - Added a real work-unit retirement race proving a concurrent attach cannot cross physical removal, plus an
          end-to-end v2 `returnBranch` generation that refuses a new displaced open before closing back to its recorded
          parent. The cleanup matrix retains live/unknown vetoes and all existing teardown guards.

### `[x]` **7.5 Exercise process-inspector contracts on every supported operating system** — D5

- _Goal:_ Native CI confirms that each production inspector observes the same PID-plus-start-token contract and
  degrades unavailable evidence to unknown on Linux, macOS, and Windows.

    - `[x]` **7.5.a Add native contract probes and fixtures**
        - Added a supported-platform native probe for stable live-process generations, missing PIDs, exact-token
          liveness, and injected permission/malformed evidence, plus an elapsed-time bound alongside the existing
          argument-array and output-size bounds for production native calls.

    - `[x]` **7.5.b Wire the supported-OS CI matrix**
        - Registered the native probe in `test:portability`, made inspector sources and focused tests portability
          classifier inputs, and bound package/workflow contracts to the required Linux leg plus scheduled or
          explicitly dispatched macOS/Windows legs with OS-named failure output.

- _Outcome:_ Every supported runner now exercises the same exact-generation liveness contract under the existing
  portability cost policy, while unavailable host facilities remain distinguishable from parser or adapter drift.

## **Phase 7.R:** Right-Sizing Remediation

_Purpose:_ Trim the delivered model where its exactness exceeds the motivating intent and adds operational
friction, before verification locks the surface. Scope follows `notes-session-locus-model.md` § Right-sizing
audit (2026-07-22): behavior-changing trims land here; internal hardening already shipped (inspectors, record
locks, staged provisioning, v3 transaction core) is kept and marked do-not-extend.

_Design decisions:_ Session leases are verb-scoped, not session-init-scoped — plain WU resume stays leaseless and
`frame: idle` on a live checkout is normal; the cleanup veto and frame graph matter only where transient verbs
already attach. Operator-facing exactness gates (harness capability table, host-truth re-entry predicates, plan
digests, claim arbitration) reduce to advisory or simple-conflict semantics; data-destroying paths keep their
full guard set unchanged.

### `[x]` **7.R.a Settle the right-sizing deltas in the spec** — D1, D4-D8, D11

- _Goal:_ The spec records the trimmed design as settled decisions — verb-scoped leases, advisory warm entry,
  open-change-request re-entry, digest-free housekeep, simple-conflict grooming, session-locus naming — so the
  tasks below implement an amended design rather than drifting from the written one.

- _Outcome:_ Amended D1/D4/D5/D6/D7/D8/D11: advisory warm entry over best-effort `unverifiable` anchors;
  verb-scoped leases with idle-as-normal frame framing; open-change-request re-entry (unreachable host degrades to
  confirm); slug-only housekeep open with lane derived at close; groom same-key/overlap conflict semantics.
  Dropped `cold-entry-required` plus every dispatch/lane/plan-digest field and refusal reason from the wire and
  record types; added the Non-Goals arbitration line, § Proportionality boundary (keep-list, do-not-extend), the
  D11 "session locus" narration rule, and a pre-release schema-narrowing rollout note. Spec Success Criteria
  7/8/10 revised, 16 added; this file's § Success Criteria mirrored. Sub-decisions settled: dispatch IDs removed
  in favor of the plain execute-bound flag with file-order next-offer; the routing lane derives at close.

### `[x]` **7.R.b Ratify verb-scoped leases and align spec, workflow, and narration** — D4, D6, D11

- _Goal:_ A plain WU session neither attaches nor releases a lease, nothing downstream depends on mainline lease
  liveness, and an unleased live checkout is presented as normal rather than noteworthy.

- _Outcome:_ Ordinary WU init, compaction recovery, and handoff now select the exact checkout role without
  attaching a lease; live transient children suspend leaseless parents, null-lease handoff is a no-op, and dead WU
  leases read idle. CLI/workflow narration treats the checkout as normal, while heartbeats remain scoped to
  state-touching transient operations and explicit attach.

### `[x]` **7.R.c Demote the warm-entry capability gate to advisory** — D1, D5

- _Goal:_ Warm entry never hard-refuses on harness identity: anchor acquisition stays best-effort lease metadata,
  and directed-command capability becomes an operator-confirmed advisory.

- _Outcome:_ Open and attach persist best-effort process anchors, including unverifiable generations with unknown
  liveness, while checkout-directed success narration asks the operator to confirm command routing and recommends
  a cold session when needed. Selector identity is metadata only; destructive verbs retain unknown-lease safety.

### `[x]` **7.R.d Relax awaiting-merge re-entry to open-change-request** — D7, D8

- _Goal:_ Resuming or materializing an awaiting-merge Errand or groom requires only an open change request at the
  recorded head; head drift warns instead of refusing, and host truth is required only where identity retires.

- _Outcome:_ Awaiting-merge Errand and grooming generations now resume from any exact open change request;
  preserved head drift and unreachable host truth proceed with explicit warnings while provisioning reuses the
  recorded head. Exact merged retirement and closed-unmerged abandonment remain unchanged.

### `[x]` **7.R.e Remove the housekeep plan-commitment protocol** — D8

- _Goal:_ A drain opens from slug plus lane confirmation alone; execute-bound inbox marking remains the durable
  dispatch record, and an interrupted sweep re-confirms its remaining entries instead of replaying a
  digest-matched plan.

- _Outcome:_ Housekeep now opens from slug only; a separate atomic verb marks confirmed execute-now titles into a
  global file-order queue that survives interrupted or abandoned sweeps. Removed the plan compiler, digests, and
  dispatch/lane wire fields; ordinary Errands use their origin titles to clear and advance the queue. Identity-only
  interrupted opens rematerialize occupancy, while awaiting-merge generations refuse pathless open success.

### `[x]` **7.R.f Simplify groom claims to same-key conflict semantics** — D8

- _Goal:_ Groom open claims a member set with plain conflict semantics — occupied key or overlapping member
  resolves to resume, wait, or refuse — without cross-machine winner arbitration or exact-set retry adoption.

- _Outcome:_ Removed the groom conflict resolver and its transaction-level selection hook. Exact same-basis sets
  still resume or wait, while raced same-key publications and overlaps refuse with named conflict evidence; disjoint
  per-key reconciliation and immutable opened-base validation remain intact. `draft-design` now makes refusal the
  explicit concurrent-publication path.

### `[x]` **7.R.g Rename user-facing narration to "session locus"** — D6, D11

- _Goal:_ Routine narration never names the model; where diagnostics and recovery surfaces must, they say
  "session locus", while the `arc locus` command name and internal identifiers stay unchanged.

- _Outcome:_ Routine CLI and workflow narration now uses checkout, worktree, and subject terms; diagnostic,
  recovery, and roster surfaces consistently say "session locus". Package/project workflows and skills remain
  synchronized, with `arc locus`, schema fields, error codes, and internal identifiers unchanged.

### `[x]` **7.R.h Silence non-actionable locus surfaces at session entry** — D6, D11

- _Goal:_ A clean session-init renders zero locus lines: unmanaged sibling worktrees and unleased frames are
  expected state, and cleanup/diagnostic narration surfaces only actionable rows.

- _Outcome:_ Ready guidance now omits expected/no-action frame, primary, recovery, reconciliation, live/dead lease
  cleanup, and unmanaged-sibling rows; session-init omits the section when no actionable text remains. No reminder
  marker is needed because the recurring unmanaged-sibling advisory is suppressed at composition.

### `[x]` **7.R.i Reconcile contracts, docs, and criteria after the trims** — D11

- _Goal:_ Packaged and self-hosted copies, the locus-methodology structural contracts, orientation surfaces, and
  the spec and task Success Criteria all agree with the trimmed behavior.

- _Outcome:_ Package and self-hosted probe, quick-reference, orientation, housekeep skill, and work-organization
  surfaces now describe optional actionable guidance and the digest-free execute queue. Session-init offers the
  first queued Errand after interruption or abandonment, criteria preserve that resume trail, and structural
  contracts reject the removed plan protocol while enforcing package/project parity.

## **Phase 7.C:** Rename Composition

_Purpose:_ Compose the locus model with `wu-rename`, which reached the base after this branch's own work was
built. Neither side is broken alone; together, a rename leaves a locus record keyed to an identity that no longer
exists. This phase closes that window before the two meet on mainline.

_Design decisions:_ Spec D12. A record binds a renamed subject on two axes — `role.subject.key` (every rename
shape) and the checkout-path `recordId` (spawned moves only) — and both rekey under deterministic-order record
locks. Liveness disposition follows D6's frame matrix rather than teardown's stricter predicate, because rename
preserves the work unit instead of retiring it: dead leases are reaped, entering-anchor leases rebase, foreign-live
and unknown liveness refuse. Record authority stays in an injected driver so the worktree mutator's `move`
operation stays mechanical.

### `[x]` **7.C.a Add the lock-bound rename rekey driver** — D12

- _Goal:_ One driver owns the rekey transaction: acquire the affected record locks in deterministic record-ID
  order, revalidate roster and record generations under lock, apply the subject and path rekey, and resolve the
  liveness disposition — so no caller reconstructs record authority.

- _Outcome:_ `rename-locus.ts` holds the source and (on a move) target locks in record-ID order, revalidates the
  roster head and exact record generation under lock, runs the injected physical move inside that window, then
  mints the rekeyed record and removes the superseded one — replacing in place when the digest is unchanged.
  Extracted the anchor selection `teardown-locus.ts` held privately into `locus/mutation-anchor.ts` so both
  lock-holding mutations share one selection. Ownership of a live lease is full-anchor equality, matching the
  owned-role pop rather than a looser pid/token comparison.

### `[x]` **7.C.b Wire the rekey into the rename verb and command** — D12

- _Goal:_ `runRename` drives the rekey through an injected seam for both applicable shapes, and the production
  command binds the node driver — so a rename converges the locus record without the worktree mutator gaining
  record authority.

- _Outcome:_ Replaced the verb's `moveWorktree` seam with `rekeyLocus`, which owns the record transaction and
  runs the physical move inside its lock window; the verb now rekeys every non-stub shape and reports a refusal
  as a resumable partial rather than a renamed success. The command resolves the rekey's checkout coordinates
  from the move resolution — destination for a landed move, primary for an in-place subject — and passes the
  roster head as the expected generation.

### `[x]` **7.C.c Cover the composed rename against real Git** — D12

- _Goal:_ An end-to-end rename over a real worktree leaves a roster whose renamed subject resolves — no stale
  record, no unmanaged checkout, no unresolved subject — closing the compatibility window this phase exists for.

- _Outcome:_ `rename-locus-composition.test.ts` drives a real `git worktree move` and record rekey over a
  renamed subject whose artifacts and marker already carry the new slug, then asserts against the locus roster
  itself: one `managed-role` row at the new path with the renamed subject, `frame: idle`, no diagnostics, and
  neither a `stale-record` row nor any row at the old path.

## **Phase 7.D:** Recovery Verdict Scoping

_Purpose:_ Stop an unsafe primary from reading as a recovery stop. Found by dogfooding this session: with an
Errand in flight — the primary parked off base, which is the steady state, not an exception — the handoff probe
refused with "resolve the retained session locus residue" against a roster carrying no residue at all.

_Design decisions:_ Spec D6. `primaryAvailability` and `recovery` answer different questions; allocation reads
the former, and the verbs that allocate already do so directly. Folding availability into the recovery verdict
both blocks operations that never allocate and masks genuine transient residue behind the allocation stop.

### `[x]` **7.D.a Scope the recovery verdict to frame recoverability** — D6

- _Goal:_ An unsafe primary stops allocation and nothing else: ordinary session entry, handoff, and compaction
  recovery proceed on a healthy frame while an Errand holds the primary off base, and a residual transient stays
  visible instead of being masked by the allocation stop.

- _Outcome:_ `deriveRecovery` no longer folds `primaryAvailability` into its verdict, so an off-base primary
  reports `unsafe` on the slot the allocating verbs already read and nothing else. Verified against the live
  probe that surfaced the defect: the same repository state that refused handoff now resolves
  `release-work-unit`. The fold also masked transient residue behind the allocation stop, since it was tested
  before the residue scan — both consequences are now covered.

## **Phase 7.E:** Chunked-Review Remediation

_Purpose:_ Close the 59 in-scope findings the chunked review returned against this branch at `0c5dd045a`. The
review's own mechanics verdict was that the target is reviewable when decomposed; the findings are what that
decomposition surfaced, and most of them restate a handful of causes across leaves.

_Design decisions:_ Tasks group by **cause**, not by finding, because the same defect recurs across leaves and a
per-finding sequence would pay the design cost repeatedly. Each task decomposes into **leaf-scoped subtasks at
entry** — the leaf partition is also the re-review unit, so a fix increment's review is a bounded delta against
that leaf's preserved report instead of a fresh whole-target pass. `7.E.a` runs first: later tasks consume the
predicate it defines. Findings are advisory until verified against source; the disposition set, carve rationale,
and recorded risk live in `notes-session-locus-model.md` § Chunked-review finding triage.

### `[x]` **7.E.a Define the trusted-row predicate consumers must satisfy**

- _Findings:_ A-F1

- _Goal:_ One predicate or projection decides whether a roster row is trustworthy enough to touch state, and every
  command-preparation and idempotent-open selector requires it — so a cross-identity, marker-missing,
  subject-unresolved, or otherwise diagnostic-bearing record can no longer reach lease mutation or occupancy reuse
  by passing a structural-coordinates check alone.

    - `[x]` **7.E.a.i Add the trusted-row projection**
        - `locus/trusted-row.ts` projects a row into its narrowed trusted form (non-null record ID, checkout path,
          and role) or the deduplicated `LocusStopReason` set explaining why not. The authority-fatal code set is
          **derived** from the intersection of `LocusDiagnosticCode` and `LocusStopReason` rather than restated, so
          a code added to either enum cannot silently escape it; a test asserts the derivation over every published
          code. Unverifiable liveness (`lease-unknown`, `lock-unknown`) is fatal, matching the refusal
          `attachLocusLease` already performs; a dead lease or lock is not, since replacement and break exist to act
          on exactly that.

    - `[x]` **7.E.a.ii Require trust in locus attach and release preparation**
        - `prepare` now separates addressing from trust: an explicitly named checkout or record reports on its own
          terms — absent, ambiguous, or untrusted-with-reasons — while the ambient arm selects among trusted rows
          only. Refusals carry the row's actual reasons instead of one generic message, and the projection subsumed
          the three ad-hoc coordinate re-narrowings. Attach and release both inherit this through the shared helper.

    - `[x]` **7.E.a.iii Require trust in the housekeep occupancy selectors**
        - `exactHousekeepRow` and `exactPartialHousekeepRow` return a three-way occupancy — absent continues to
          allocation, untrusted refuses with its reasons — so neither can provision over occupancy whose authority
          is unestablished. Ambiguous multi-match now refuses as `duplicate-locus` rather than reading as absent,
          matching the groom selector's existing behavior. The type change surfaced three further consumers in
          `lifecycle-runtime.ts` (close, settle, partial-abandon) that had silently treated any non-match as absent;
          all three now refuse untrusted occupancy before destructive cleanup. Untrusted never rolls back the
          identity claim — the occupancy exists and retiring its identity would strand it.

    - `[x]` **7.E.a.iv Require trust in the groom occupancy selector**
        - The `handlers/plan.ts` selector never filtered row kind, so a `stale-record` row carrying a matching groom
          subject and lease returned an idempotent success naming a checkout path with no live worktree. It now
          requires the projection and refuses untrusted occupancy on the same rule as the housekeep selectors.

- _Outcome:_ Trust is now a proven property rather than an asserted one — the surface used "trusted" in seven
  places while every consumer decided it from structural coordinates alone. The authority-fatal set is derived
  from the intersection of the diagnostic and stop-reason enums, so it cannot drift from either, and unverifiable
  liveness joins it because `attachLocusLease` already refused there; the projection makes that refusal reachable
  from consumers that performed no liveness check at all. Threading it widened the consumer set from the four
  reported loci to seven: typing occupancy as a three-way result forced every caller to answer what an untrusted
  match means, and three destructive `lifecycle-runtime.ts` paths had been treating it as absent.

### `[x]` **7.E.b Stop rendering unknown state as absent**

- _Findings:_ S2-F1, S2-F3, S2-F4, S2S1-001, S2S1-002, S2S1-004, E1-F2, S1-F2, W1-F4

- _Goal:_ Every read that cannot establish its fact reports unknown or stops instead of substituting an empty,
  default, or synthetic value — covering the probe's rejection of a valid unverifiable anchor, recovery's synthetic
  primary identity, whole-queue loss from one malformed capture, the legacy fallback that overrides a reader-owned
  stop, dropped active-extension context, the seed unbound to its repository root, malformed identity authority
  read as empty, the absent seed hint acting as a generation wildcard, and the cleared local tombstone.

    - `[x]` **7.E.b.i Accept the unverifiable anchor the model represents** — S2-F1
        - The locus slot had never been exercised end to end. The probe refused every non-process anchor, the
          captured envelopes recorded that refusal as their expected output, and the suite therefore stayed green
          on a defect sitting at the centerpiece of this work unit. Removing the refusal exposed four distinct
          causes, only one of which was the anchor: placeholders that could not satisfy the schema they stood in
          for, a row order sorting on a random temp suffix, and three expectations written against the defect
          itself. The general lesson is the phase's own: verification that cannot observe its subject will report
          the subject's absence as agreement.

        - `[x]` **7.E.b.i.1 Let the envelope fixtures observe a populated locus slot**
            - Redaction emits path-shaped placeholders (`/redacted/primary`, `/redacted/worktree`), so a replayed
              envelope satisfies the same absolute-path schema the real values did instead of failing ahead of the
              assertion it targets. Fixture siblings now extend the primary repository path rather than drawing
              independent temp roots, which fixes the order roster rows sort into — the old roots ordered a random
              suffix against `wt-`, so a capture locked whichever order that run happened to produce, flaking at
              roughly one run in fifteen per arm. Both constraints carry guards, since neither is observable in a
              captured envelope until the slot populates: placeholders are asserted against the path schema itself,
              and every fixture root against the primary prefix. Goldens regenerated.

        - `[x]` **7.E.b.i.2 Preserve the acquired unverifiable anchor**
            - The probe hands an acquired unverifiable anchor to the reader instead of refusing it, so the snapshot
              survives at exactly the unrecognized invocation boundaries where conservative state matters most;
              `current` resolves to none there because no persisted lease anchor can equal it. Three expectations
              written against the refusal followed the real behavior: recovery's load-set stop sharpened to
              `load-set-drift`, the lean-recover arm now asserts a resolved frame that claims no work-unit context,
              and the residue arm split in two — one proving settled residue once classification is available, the
              other seeding an unreadable errand record so `classification-unavailable` comes from a genuinely
              incomplete read rather than from the refusal.

    - `[x]` **7.E.b.ii Keep the execute-bound queue read from discarding its valid entries** — S2-F4
        - `listExecuteBoundInboxEntries` returns file-ordered entries plus per-entry diagnostics instead of throwing
          whole-file, so one malformed capture no longer hides every queued sibling. Entry boundaries still come
          from the complete heading list, so skipping a malformed heading cannot widen the preceding entry's body,
          and `locateInboxEntries` keeps throwing for the mutation path, whose batches stay all-or-nothing. The two
          consumers take opposite arms deliberately: session-init guidance degrades gracefully, while
          `resolveExecutionNextOffer` fails closed because it must prove the completed capture is no longer
          execute-bound and an unreadable capture cannot be excluded from that set.

    - `[x]` **7.E.b.iii Report unreadable transient identity authority as unknown** — E1-F2
        - `readTransientInFlightIndexes` returns `absent | complete{diagnostics} | error{stage}` instead of empty
          maps, so an unborn identity and an unreadable one are no longer the same value, and a partial decode
          reports its dropped entries rather than presenting itself as the whole claim set.
          `projectTransientInFlightRead` is the one way to reach the indexes, pairing them with whether absence is
          established. The transient half now composes into the same `errandRecordsComplete` gate the legacy
          record half already fed, so an unreadable identity degrades classification rather than letting a live
          transient branch read as non-transient. The type change located all seven consumers: the three
          derivation callers thread completeness, `errandState` surfaces the degradation in its warning channel,
          and the husk and sweep surfaces lose only their claim-mismatch check — both still block on marker
          provenance alone, so neither becomes destructive under an unreadable identity.

    - `[x]` **7.E.b.iv Preserve the local tombstone under locus-owned suppression** — W1-F4
        - The `locusOwned` early return conflated two independent facts: whether the branch is residue, which
          locus ownership does settle, and whether this checkout is authoritative for its branch location, which
          it does not. Suppressing the residue advisory also cleared `shadowsSameBranchRemote`, so an archived
          work unit's stale remote meta survived deduplication and reappeared as in flight. The arm now carries
          the same `input.source === "worktree"` tombstone every other no-meta arm does. The defect sat precisely
          between two existing tests — one covering the tombstone without a locus, one covering the locus-owned
          arm without asserting the tombstone — so the new case pairs their fixtures.

    - `[x]` **7.E.b.v Make recovery depend on proven physical identity** — S2-F3, S2S1-001, S2S1-002, S2S1-004

        - `[x]` **7.E.b.v.1 Stop substituting a synthetic primary for a failed identity probe** — S2-F3
            - Physical checkout identity now stays a `Result` through recovery authority selection: the worktree
              slot, frame derivation, and legacy eligibility each fail rather than reading a substituted
              `primary`, matching the shape handoff derivation already used. Threading the call site alone would
              have been inert — `resolveWorktreeIdentity` swallowed every failure and returned `primary`
              _including after git had already proven the checkout linked_, so the probe slot was never an error
              in production. That arm now raises `WorktreeIdentityError`; the resolver reports only what it
              establishes and the "surface nothing" default moves to the orientation caller that wants it.
              The both-dirs-unresolved arm deliberately still returns `primary`: `locusState` fails on the same
              git outage and gates derivation, so it carries no recovery hazard. The paired tests fix the stakes —
              with two idle work-unit roles in the roster, substitution selected a plausible _wrong_ work unit
              rather than failing visibly.

        - `[x]` **7.E.b.v.2 Require a clean reader verdict before the legacy Errand fallback** — S2S1-001
            - `legacyLocusEligible` now also requires `recovery.kind === "none"` and
              `reconciliation.kind === "clean"`, so legacy compatibility stands in only from the explicitly clean,
              record-free state it was built for. The pre-existing residue-row test is kept rather than folded
              into the recovery verdict — it still catches a residue row the verdict does not elevate. The two
              verdicts fail differently, which the tests preserve: a recovery `stop` or `residue` produces a
              derivation error the legacy frame was replacing, while an unsettled `reconciliation` derives
              successfully as frame `none`, so there the defect overrode a real verdict rather than a failure.

        - `[x]` **7.E.b.v.3 Bind the recovery audit to the seed's repository root** — S2S1-004
            - The audit takes a `freshRepoRoot` and stops on `repo-root-mismatch`, so a seed can no longer audit
              `ready` against the worktree it was not emitted for. The like-for-like question the entry
              decomposition flagged resolved by reading rather than by choice: the emitter's `cwd` and the recover
              handler's both come from `requireArcProjectRoot()`, so the comparison is a direct string equality
              and needs no git resolution of its own. Kept as a stop reason instead of three new fields on the
              locus schema — repository root answers _which checkout_, where that schema answers _which commit_,
              and a binary check does not justify moving every recovery-audit golden. It runs ahead of the branch
              and head comparisons, since those are meaningless if the roots already disagree.

        - `[x]` **7.E.b.v.4 Remove the inert active-extension projection input** — S2S1-002
            - The finding does not reproduce and its prescribed threading would have been provably inert:
              `resolveLoadSetManifest` declared `activeExtensions` and never read it, so the recovery base manifest
              and the work-unit projection — which call the same function — produce identical output either way.
              Extension bodies are excluded from every load set by design and their names travel in the envelope's
              extensions slot, so no context was being dropped. Removed the dead parameter and the pass-through
              chain carrying it across eighteen files, which also deleted five `runExtensionsSessionInitStatus`
              reads performed solely to feed it. The test count was unchanged and no golden moved, which is the
              evidence that nothing observable depended on it; the projection's exclusion contract is now enforced
              by the type rather than by a test that passes extensions in. Rejection recorded in
              `notes-session-locus-model.md` § Chunked-review finding triage.

        - _Outcome:_ The bundle's four "unknown rendered as absent" reports split three ways, which is why they
          shared no fix. Two were real substitutions of an unestablished fact (`.1`, `.2`), one was a binding the
          audit never made at all (`.3`), and one was a value that only looked substituted (`.4`) — its input was
          inert, so the honest correction was deletion, the inverse of what the finding prescribed. `.1` carries
          the transferable lesson: the defect lived one layer below its reported locus, because
          `resolveWorktreeIdentity` returned a plausible default rather than reporting failure, so the call-site
          fix the finding described would have compiled, passed, and changed nothing in production. Verifying a
          finding against source means reaching the layer that manufactures the value, not just the one that
          consumes it.

    - `[x]` **7.E.b.vi Stop the absent seed hint acting as a generation wildcard** — S1-F2
        - Omission now carries its reason. A current producer that omits `locus` records `locusAbsence` —
          `none` when the reader established no generation was current, `unavailable` when ambiguity or a probe
          error left it unestablished — and the audit stops on `unavailable` unconditionally, and on `none`
          whenever a generation is live now. A seed carrying neither key is pre-model and keeps the permissive
          read, which is the distinction the finding asked for; that compatibility is bounded, since any later
          session-init write replaces the seed.
        - Required amending **D9**, whose "`current: none`, ambiguity, or a probe error omits the whole object"
          clause was itself the defect — the design said to discard exactly the fact the audit needed. The spec
          now carries the disposition field, the three audit rules, and the explicit statement that an absent hint
          is never a wildcard. `seedSummary` reports the disposition too: the report schema is a `strictObject`,
          and because object spreads bypass excess-property checking, omitting the field there would have passed
          typecheck and failed at runtime validation instead.
        - The defect was again codified as expected behavior — the "returns ready" audit test asserted
          `locusHint: { expected: null, actual: LOCUS_HINT, match: true }`. It is now a named test for the
          pre-model compatibility arm, so the permissive path is a recorded decision rather than an accident.

    - `[x]` **7.E.b.vii Guard the captured arms against undeclared slot failures**
        - Held for this task's close so it landed once against the finished slot set. Each session-envelope golden
          now declares which slots may be `{ ok: false }` — every healthy arm declares none, and `identity-missing`
          declares the two whose failure is the point. A new failure becomes a deliberate edit to that declaration
          rather than a silent capture the suite ratifies. Verified against the original incident by injecting
          `locusState: { ok: false }` into the orient arm: the guard fails where the whole suite previously stayed
          green. This closes the capture half of the problem only — a hand-written expectation that describes the
          code, as `7.E.b.vi` found, is not reachable by a golden invariant.

- _Outcome:_ The nine reports collapsed to fewer mechanisms than findings, and not all of them were defects: one
  (`S2S1-002`) did not reproduce and inverted into a deletion. What recurred instead was where the defects lived.
  Twice the defect sat below its reported locus — `resolveWorktreeIdentity` manufacturing a plausible default, and
  the compaction seed discarding the fact its own audit needed — so the reported call site was the symptom, not the
  cause. Twice the green suite was asserting the defect as expected behavior, which is why a task about unknown
  state closes with a guard about captured state. Both ratifications trace to an unspecified absence case: where
  the design said what a present value means and nothing about a missing one, the implementation supplied an
  answer and a test recorded it.

### `[x]` **7.E.c Prove exact authority before destructive dispatch**

- _Findings:_ L2-F1, L4-F1, L4-F3, S2-F2, E2-F2, E3-F1, E3-F2, E4-F1, E4-F3

- _Goal:_ No path that can delete, overwrite, or retire work proceeds on evidence older than the lock authorizing
  it: abandon carries its selected generation into dispatch, rollback matches branch as well as head, a live or
  unknown record lock preserves the checkout, cleanup applies the occupancy veto before offering removal, partial
  settlement and leave validate the locked role and lease before mutating, close proves occupancy absent before
  finalizing, promotion recovery binds to its source generation, and dirty-state recovery accepts only the exact
  transaction-produced state rather than arbitrary user index and worktree content.

    - `[x]` **7.E.c.i Carry the selected generation into abandon dispatch** — L2-F1
        - `resolveLocusGeneration` now dispatches a `LocusResolveDispatch` carrying the record and lease it just
          validated, not only the reusable key, and each of the three abandon drivers compares that selection
          against the occupancy it re-derives from its own roster read — refusing `lease-generation-mismatch`
          rather than proceeding onto a different checkout or a newer lease. Absence counts as mismatch: a caller
          that named an exact generation cannot be told "already retired" by a driver that found nothing. The
          comparison is one pure helper (`locus/selected-generation.ts`) called from three sites rather than a
          capability threaded through every mutator; the direct verbs (`arc errand|housekeep|plan abandon`) pass
          no selection and are unchanged.

    - `[x]` **7.E.c.ii Stop rollback destroying state it has not proven it owns** — L4-F1; L4-F3 rejected
        - `PrimaryCheckoutReceipt` now records the branch it left on HEAD, and `rollbackPrimary` proves that name
          alongside the head before restoring or deleting anything — head alone is satisfied by any sibling branch
          at the same commit, which is exactly what `checkout -b` produces. The three-arm branch on `kind` and
          `branchCreated` collapsed into one guard plus the two undo steps.
        - **L4-F3 does not reproduce.** The claim was that live and unknown record locks let spawned rollback
          remove a competing checkout. A lock refusal carries `identity-only` evidence, and
          `canRollbackSpawnedRecordFailure` requires `marker-record-mismatch`, so no rollback is reached; the
          spawned path was already sound in the way the primary path was not, since
          `LinkedWorktreeCreationReceipt` has always carried its branch name. Pinned by characterization tests
          that passed on first write — they guard the behavior, they do not evidence a fix.

    - `[x]` **7.E.c.iii Apply the occupancy veto before offering teardown** — S2-F2
        - `locusOccupancyAtPath` resolves what occupancy permits at one registered checkout — `clear` when no
          record claims it or the one that does is trusted and absent- or dead-leased, `suppress` for a live
          lease, `manual` for an unverifiable lease, an untrusted record, more than one claim, or an unresolvable
          path — and the sweep vetoes on it before every removable emission, branched and husk alike. The veto
          covers both candidate sources, not only the retained-role path the finding names: the roster-sourced arm
          consults no locus row at all, and both merge into one decision site. Trust reuses
          `projectTrustedLocusRow`, so a diagnostic added to either published enum vetoes cleanup with no second
          predicate to update, and the three-way verdict deliberately mirrors `classifyTeardownOccupancy` so the
          advisory cannot drift from what the guarded remover permits. `locusState` became a required option —
          an omitted projection silently skipped the veto. Scope boundary (advisory veto here, lock linearization
          already in the guarded remover) recorded in `notes-session-locus-model.md`.

    - `[x]` **7.E.c.iv Prove ownership before partial settlement mutates the inbox** — E2-F2
        - Confirmed against source: the pre-flight check tested only that _some_ lease ID existed, never its state
          or anchor, so a foreign live generation reached `settleInbox` — a real `removeCurrentInboxEntry` — and
          was refused afterwards at the one site that proves ownership, leaving the capture destroyed and the role
          retained. Settlement now acquires the record lock, revalidates the base, and proves the exact generation
          _before_ touching the capture; a refusal or an absent record returns without an inbox write.
        - The ownership rule inlined in `popOwnedLocusRole` became `validateOwnedLocusRole` in `locus/mutation.ts`,
          so the pre-mutation proof applies the same rule as the authoritative pop rather than a weaker
          restatement. The pop still revalidates on its own terms — the pre-check narrows the window, it does not
          replace the atomic read-validate-remove.
        - Settlement was split into `errand/partial-settle.ts` (composition over injected evidence) and
          `errand/partial-settle-runtime.ts` (Node wiring), mirroring `leave.ts` / `leave-runtime.ts`. The module
          previously did both and had no coverage at any tier, which is why an ordering defect in it was invisible;
          the ordering claim is now a unit test that fails against the old sequence.

    - `[x]` **7.E.c.v Validate the locked generation before leave and close mutate** — E3-F1, E3-F2

        - `[x]` **7.E.c.v.1 Prove the locked generation before leave moves a checkout** — E3-F1
            - Confirmed against source: `recordId`, `leaseId`, and the row all came from the pre-lock roster read, and
              `popOwnedLocusRole` performed the first exact-generation validation only after `restorePrimaryCheckout`
              had run `git checkout <base>` or the spawned arm had run `git worktree remove` — so a generation that
              changed under the lock had its checkout mutated and was refused afterwards. Leave now validates
              immediately after acquiring the lock; a record that vanished under it returns idempotent without
              touching the checkout, since the role a later generation already popped is not this session's to close.
            - Occupancy closing split into `errand/leave-cleanup.ts` (composition over an injected locked generation
              and one `preserveCheckout` step) and the Node wiring left in `leave-runtime.ts`, so the ordering claim is
              a unit test that fails against the old sequence — the module previously had no coverage below the mocked
              `cleanup` seam. The lock-generation contract `7.E.c.iv` introduced became shared
              (`errand/locked-generation.ts`) rather than copied into a second module.

        - `[x]` **7.E.c.v.2 Refuse close over foreign occupancy** — E3-F2
            - Close now takes a required `readOccupancy` dependency, read immediately before ref cleanup — the first
              of the three destructive steps host truth alone used to authorize. `errand/close-occupancy.ts` holds
              the predicate: no claim clears, the caller's own generation clears, and a foreign claim refuses with
              the reason its occupancy carries (`lease-live` for another live session, `lease-unknown` for
              unverifiable liveness, `role-conflict` for a retained or untrusted claim, `duplicate-locus` for more
              than one). The dependency is required rather than optional so an omitted reading cannot silently
              restore the unguarded path.
            - Per the settled predicate, only _foreign_ occupancy refuses — the caller's own generation proceeds, so
              the in-place close `7.F.a.iii` enables still finalizes from inside its own occupied checkout.
            - `close-runtime.ts` supplies the reading (session anchor, locus state, classify) and now takes
              `identityGlobalUserDir`, threaded from the handler; an anchor that cannot be established refuses
              `lease-unknown` rather than assuming ownership.

        - _Outcome:_ The two findings needed different authority proofs, not the shared predicate the leaf was
          entered expecting: leave proves its own record under its own lock, while close's question — is this
          occupancy mine — was already answered by the reader's `current` projection, which resolves against the
          entering anchor. Reusing that projection kept close free of both a lock and a second ownership rule.

    - `[x]` **7.E.c.vi Bind promotion recovery to its source generation** — E4-F1, E4-F3

        - `[x]` **7.E.c.vi.1 Require promotion evidence before a work-unit row serves as the target** — E4-F1
            - `exactTarget` now reports which arm matched, and the work-unit arm must present the evidence the
              transaction leaves behind — the checkout on the promotion branch with the rendered meta at the
              promotion meta path — before it can serve as the target. A replay always presents both, since the
              role only becomes `work-unit` after the rename and meta write succeed; an unrelated work unit of the
              same name presents neither and refuses `promotion-source-invalid`. Identity-absent recovery consumes
              the same predicate (`carriesPromotedEvidence`), so the two paths cannot drift.
            - Reproduced first at the integration tier against real Git: a live Errand identity whose local record
              is absent, plus a same-named work unit this session leases, promoted into that unrelated checkout —
              writing the meta there and retiring the Errand identity — because a primary checkout runs no marker
              check and the shared name was the only thing proven.
            - Deliberately not provenance-minting: recording the source slug or claim on the promoted role or
              worktree marker is a durable-shape change and belongs to the carved capability contract, not here.

        - `[x]` **7.E.c.vi.2 Accept only the transaction-produced meta state as recoverable dirt** — E4-F3
            - `inspectCheckout` compared `line.slice(3)` against the meta path and ignored the XY columns, so any
              staged, modified, or conflicted state on that path read as the promotion's own write. The allowance
              is now the exact entry the transaction produces — one untracked meta — and the two refusals carry
              distinct messages, since "beyond its own untracked meta" and "has uncommitted changes" are different
              conditions. Reproduced at the integration tier by staging the meta between a failed retirement and
              its recovery: the recovery took the user's index state as its own and retired the identity.

- _Outcome:_ Nine findings, one cause: every destructive path read its authority from state gathered before the
  step that authorizes it, then proved that authority afterwards — or never. The proof moved ahead of the
  mutation in each case, and what counts as proof differs by path rather than by a single mechanism: leave and
  partial settlement revalidate their own record under their own lock, close reads the reader's resolved locus
  because the roster already answers whose occupancy it is, cleanup consults the occupancy veto it shares with
  the guarded remover, abandon carries its selected generation into dispatch, and promotion requires the evidence
  its own transaction writes. The systematic version of this — one exact-generation capability threaded through
  every subject driver — stays carved out; each path here proves authority with what it already holds. Two
  findings did not survive verification (`L4-F3` did not reproduce; `E3-F2`'s literal reading contradicted
  shipped in-place close and was narrowed to foreign occupancy), which is why the disposition set matters as much
  as the fix set.

### `[x]` **7.E.d Make post-mutation failure recoverable**

- _Findings:_ L4-F5, E2-F1, W1-F1, W1-F2, W1-F3, P1-F1, P1-F2, L2-F2

- _Goal:_ A failure after externally visible mutation either compensates or leaves a state a replay can settle:
  probe failure after checkout reconciles rather than skipping rollback, identity rollback does not strand its
  durable locus, an interrupted rename recovers both coordinates and validates target absence before moving,
  create-new rollback compensates its minted role, groom and housekeep tails stay replayable across ref deletion
  and occupancy removal, and a crashed lock breaker leaves a reclaimable secondary rather than a wedged lock.

- _Approach:_ All eight findings reproduce against the post-`7.E.c` head. `.i` precedes `.ii` because the
  identity-rollback branch `.ii` adds reads the provisioning evidence kinds `.i` may extend; the remaining leaves
  are independent. Compensation is preferred over new durable state throughout — where a correction boundary
  offers "model a durable settlement state or accept every proven post-deletion state idempotently", take the
  acceptance arm, since a durable-shape change belongs to the carved capability contract.

    - `[x]` **7.E.d.i Reconcile a primary checkout whose post-mutation probe failed** — L4-F5
        - The adapter now reconciles its own mutation rather than exposing a partial receipt: everything past the
          mutating checkout runs inside `compensateOnFailure`, which restores the previous branch, deletes a branch
          this attempt created, and rethrows the original failure — so the caller's `identity-only` evidence
          becomes true rather than merely unchanged. Compensation was chosen over a partial receipt because
          `rollbackPrimary` proves the head it is undoing, and a failed head probe is precisely the case with no
          head to prove.
        - When the undo also fails the checkout really is left mutated, so `PrimaryCheckoutResidueError` carries
          that path to `provisionPrimaryUnderLock`, which reports `marker-record-mismatch`. Both mutating arms now
          compensate through one path: the retained-branch arm's hand-rolled restore folded into the guarded
          region, and the created-branch arm gained the empty-probe guard its pre-mutation sibling already had.

    - `[x]` **7.E.d.ii Roll back an Errand identity only against identity-only evidence** — E2-F1
        - Rollback is now authorized by the provisioning evidence rather than by the mere fact that provisioning did
          not succeed. `rollbackIdentity` retires the claim only under `identity-only` and returns a three-way
          result — rolled back, retained with its residue named, or failed — which both call sites surface in the
          refusal or error text. A retained claim is only recoverable if the operator knows it exists, so naming
          the residue is part of the fix rather than a nicety.
        - A thrown provisioning call is treated as unknown residue rather than none: the arm the finding did not
          name, and the one that matters most, since `establishReadyMarker`'s raced marker re-read is the single
          unguarded call in that composition and can throw with a spawned worktree already on disk. Allocation
          refusals still roll back — they are proven pre-effect, and the call site now states that rather than
          inheriting it from a default.

    - `[x]` **7.E.d.iii Recover an interrupted or colliding rename** — W1-F1, W1-F2, W1-F3

        - `[x]` **7.E.d.iii.1 Preserve both rename coordinates and prove the target before the move** — W1-F1, W1-F2
            - `resolveRenameWorktreeMove` now carries a `sourceWorktreePath` on its `already-moved` arm — the exact
              inverse of the leaf rewrite it performs on the forward arm — and `resolveRekeyCheckout` rekeys from
              it. The driver already handled a landed move when given both coordinates; the defect was entirely in
              the resolution that collapsed them, which is why re-entry read an unwritten key and settled `absent`.
            - The rekey proves the target key before `moveWorktree()` rather than discovering a collision from a
              refused mint afterwards. Absent proceeds; a foreign role refuses `role-conflict` with the checkout
              still in place; and a landed move whose mint already succeeded is recognized as this transaction's
              own unfinished work and completed by removing the source record. That last arm makes the
              mint-succeeded/remove-failed state recoverable — before, replay refused there too.
            - No inverse-move compensation was added. With the source coordinate preserved, a persistence failure
              after the move leaves a state replay settles: re-entry resolves `already-moved`, finds the source
              record, and completes the rekey. The phase Goal admits either, and the replay path is the one the
              transaction already had.
            - `resolveRekeyCheckout` is exported so the reported locus is covered directly; its idempotence rule
              (`carriesRenamedSubject`) is now one predicate shared with the settled-outcome read rather than two
              restatements of the same rule.

        - `[x]` **7.E.d.iii.2 Compensate the minted role when create-new rolls back** — W1-F3
            - The spawn result now carries the `WorkUnitLocusReceipt` it previously discarded, and `runCreateNew`'s
              scaffold-failure arm retires the role through the same driver that minted it — which proves the exact
              generation under the record lock before removing anything — rather than force-removing the checkout
              and leaving a role naming it. Compensation is gated on `roleCreated`, so a role the spawn reused is
              never destroyed by a rollback that did not create it.
            - Retiring through the driver rather than deleting the record directly is what keeps the rollback from
              becoming a second, weaker ownership rule; the driver's own removal order (checkout, then record under
              the same lock) is unchanged, so an interruption still leaves a visible stale record rather than an
              unmanaged checkout.

        - _Outcome:_ Three findings, one cause: each composition computed the fact its own recovery needed and then
          discarded it — the source coordinate collapsed into the destination, the target's occupancy learned only
          from a refused mint, the role receipt dropped at the call that returned it. None of the three needed a new
          mechanism, because the driver, the record store, and the retire path all already did the work; what was
          missing was carrying a value across one seam. That is why the fixes are small and the failures were
          terminal: a discarded fact is invisible at the site that discards it and only surfaces where recovery is
          impossible.

    - `[x]` **7.E.d.iv Make grooming and housekeeping tails replayable** — P1-F1, P1-F2

        - `[x]` **7.E.d.iv.1 Keep tail settlement replayable across branch deletion** — P1-F1
            - Both tails now settle through `exact-branch-generation.ts`, which classifies each side before
              touching it: present at the proven head (delete it), proven absent (an earlier pass deleted it), or
              moved (refuse). The ordinary Errand close path already made exactly this reading, so the fix was
              giving grooming and housekeeping the classification a sibling path already had — `cleanupOrdinaryErrandRefs`
              delegates to the same module, and the two hand-rolled `deleteExactBranchGeneration` copies are gone.
            - The head read for an open tail was the second wedge, upstream of the deletion: it derived the settled
              head from the refs and threw (grooming) or refused (housekeeping) once they were gone. It is now
              three-way, and asymmetric by the teardown's own deletion order — a local head over a proven-absent
              remote is that teardown's unfinished work, so it still names the generation, while the mirror stays
              unproven. Occupancy that survives a deleted generation refuses rather than settling headless.
            - Absence is a proof obligation throughout: an unreachable remote is an error, never an absent ref, so
              a network failure cannot be read as a completed deletion.
            - Covered at the seam over every post-failure state (remote deleted, both deleted, either side moved,
              a raced lease, an unreachable remote), plus a real-CLI grooming abandon whose remote leg was applied
              out of band — it reaches identity retirement, and replays idempotent.

        - `[x]` **7.E.d.iv.2 Let a partial grooming close survive a failed identity retirement** — P1-F2
            - The record-alone gate the plan proposed does not close, so the recorded fallback was taken: partial
              grooming lands on the base itself, and `openedBaseHead` reachability is satisfied identically whether
              the sweep's own commits landed, a sibling pushed, or nothing moved — it cannot tell a settled close
              from occupancy removed by anything else. A new `settled` partial state carries the head the close
              proved, written before occupancy removal, so retirement is authorized by reachability of that exact
              head rather than by an inference the base would support either way.
            - `closeGroomAtRuntime`'s absent-occupancy gate now distinguishes a settled claim outliving its checkout
              — this close's own unfinished work — from a genuinely missing one, and retires it once its head is
              contained in the freshly pinned base. A claim whose work never reached the base still refuses
              `preservation-unproven`, which is the property the weaker gate would have lost.
            - The state is a new strict variant on both the persisted record and the public locus projection, so a
              settled claim projects its `savedHead` and offers `finalize` / `abandon` rather than a resume it
              cannot honor.
            - Covered at the transform (settles an exact open partial generation; refuses full protection, a
              non-open state, a non-advancing timestamp, and a changed basis) and by three real-CLI cases: the
              partial sweep end to end — previously uncovered — the seeded post-failure replay reaching retirement,
              and a settled claim whose head never reached the base.

    - _Outcome:_ Both leaves were the same defect — a settle that destroys the evidence its own replay needs — but
      they correct in opposite directions, and which one applies is decided by whether the record that survives can
      still say what was settled. Branch refs name their own head, so the deleted state is self-describing and the
      replay can simply accept it; a partial sweep's base head is indistinguishable from any other push, so nothing
      survives to accept and the proof has to be written down before the destroying step. Accepting a proven
      post-state is the cheaper correction wherever it is available, but availability is a property of the evidence,
      not a preference — reaching for it where the evidence cannot support it is how a gate silently weakens.

    - `[x]` **7.E.d.v Leave a crashed lock breaker reclaimable** — L2-F2
        - The secondary lock now carries the same serialized holder the main lock does — token, process anchor,
          creation stamp — so residue from a breaker that exited before its release is readable evidence rather
          than opaque bytes. Reclaim is narrow: only a readable, process-anchored holder proven dead is removed,
          and only by unlinking the exact bytes just observed, so a breaker replacing the residue between the read
          and the unlink keeps its own file. Everything else — a live breaker, an unverifiable anchor, malformed
          bytes — still refuses `generation-mismatch`, which the acquire loop continues to surface as `unknown`.
        - Reclaiming through the secondary lock rather than through a timeout is what keeps the fix from becoming
          a weaker second rule: the residue is proven dead by the same anchor check that authorizes breaking the
          main holder, so a wedged lock and a contended one stay distinguishable.
        - Covered by a reclaim case that fails against the pre-fix create, an exclusion case across all three
          non-reclaimable residues, and an assertion that the secondary lock is written process-anchored — the
          property reclaim depends on. Exclusion held before the fix too and is carried as a regression guard.
          The exclusion case needs a pid-aware inspector: a fixture reporting one liveness for every process makes
          the main holder live, so the break is never attempted and the case passes without reaching the residue.

    - `[x]` **7.E.d.vi Guard the raced marker read that escapes spawn composition**
        - The raced re-read now returns the typed error its four sibling calls already returned, with
          `rollback: null` — a marker the create race lost belongs to the session that won it, so the rollback
          removes this session's checkout and leaves the marker alone. No new mechanism: the composition already
          routed a marker-stage error into `rollbackSpawnFailure`; the one call that could not reach it now can.
        - The uncovered test asserted the sequence rather than only the result, which is what distinguishes the
          fix from a swallowed throw: `read-marker` twice, then `rollback-worktree`, with no `remove-marker`.
          Against the pre-fix call the error escapes `provisionTransientLocus` entirely rather than failing an
          assertion — the finding's claim reproduced as a test failure mode.
        - `.ii`'s identity retention was the bound on this case; with the checkout now compensated, that arm
          covers the residue it was written for rather than this one.

### `[~]` **7.E.e Close the typed boundaries and make receipts describe the operation**

- _Findings:_ L1-F1, L1-F2, L1-F3, L3-F3, L4-F6, E5-F3, X1-F1, X1-F2, X1-F3, A-F3, E2-F3, S1-F3

- _Goal:_ The public surface delivers what it declares: one finite error vocabulary with no escaping code, success
  shapes that require their authority coordinates, normalized error text and typed marker results instead of raw
  throws, a JSON path that yields one typed result for preflight and boundary failures, rendered row diagnostics
  and a terminating newline in human output, timestamps in canonical UTC, and outcomes composed from every stage so
  no command reports idempotent after making authoritative local change.

- _Approach:_ Eleven of the twelve findings reproduce against the post-`7.E.i` head; `L4-F6` no longer does —
  `7.E.d.vi` converted exactly that create-race reread into a typed `MarkerEstablishmentResult` error, and
  `provisionSpawned` routes marker errors through `rollbackSpawnFailure`, so both halves of its correction boundary
  are already met. The packet's line ranges predate later edits on this branch, so each subtask re-locates its
  target before changing it. `.i` precedes `.iv` because the typed error results `.iv` constructs are spelled in the
  vocabulary `.i` settles; the remaining leaves are independent.

- _Note:_ `L1-F1` leaves one choice open with its constraint stated. Two vocabularies exist today: `LocusErrorCode`,
  a seven-member union over thrown operational failures, and the mutation result's `error.code`, a free-form
  `locus.<segment>...` regex that ~40 call sites populate with per-operation strings (`locus.errand-open.provision`,
  `locus.plan-close.identity-retire`). The finding's boundary — one shared runtime schema and inferred finite type —
  can be met by enumerating the codes actually produced, by making the code finite by construction (operation plus a
  closed stage enum), or by declaring the result-arm code descriptive and closing only the thrown vocabulary. The
  constraint that decides it: a consumer must be able to dispatch exhaustively without reading the producer, and
  every future operation must be unable to add a code silently.

    - `[x]` **7.E.e.i Close the mutation error vocabulary** — L1-F1
        - Finite by construction, the option a future operation cannot silently widen: `schema/mutation.ts` now owns
          one runtime authority — the operational codes, a closed stage enum, and the composed
          `locus.<operation>.<stage>` type over both — with `locusErrorCode` as the only composer and the free-form
          regex retired. `errors.ts` infers `LocusErrorCode` from that same schema rather than restating it.
        - `createLocusMutationResult` takes the schema's input type, so a code outside the vocabulary is a compile
          error at its producer instead of a `ZodError` thrown from an error path; the runtime parse stays as the
          backstop for values the compiler cannot see. That typing is what surfaced every producer to convert.
        - Three codes moved into the vocabulary they had escaped: the pop failure now reports its own operation
          (`locus.<operation>.record-pop`), the `locus` verbs spell their operation (`locus.locus-resolve.input`),
          and the housekeeping close names the step that failed rather than the verb (`identity`, not `close`).
        - Covered by a rejected unknown stage, a rejected unknown operation, and the record-pop failure reaching a
          caller inside the declared vocabulary. The pre-existing incomplete-success case keeps proving the runtime
          backstop through an explicit cast past the typed input.

    - `[~]` **7.E.e.ii Require the authority coordinates on open success and canonical UTC** — L1-F2, L1-F3
        - Re-homed to `7.P.a.i`. The correction is unchanged; it lands in the slice that owns the schema.

    - `[~]` **7.E.e.iii Normalize evidence error text at the reader boundary** — L3-F3
        - Re-homed to `7.P.f.i`.

    - `[~]` **7.E.e.iv Deliver one typed result on every JSON path** — X1-F2, E5-F3
        - Re-homed to `7.P.l.i`.

    - `[~]` **7.E.e.v Render row diagnostics and terminate human locus output** — X1-F1, X1-F3
        - Re-homed to `7.P.l.ii`.

    - `[~]` **7.E.e.vi Compose outcomes from every provisioning stage** — A-F3, E2-F3
        - Re-homed to `7.P.h.i` for the Errand open path. The housekeep and plan open paths leave this work unit
          with the claimed-sweep deliverable.

    - `[~]` **7.E.e.vii Require the locus-hint audit on ready recovery reports** — S1-F3
        - Re-homed to `7.P.k.i`.

- _Outcome:_ `.i` landed the closed mutation error vocabulary. The remaining six corrections were redistributed to
  Phase `7.P` rather than completed here: each names a stable locus that one delivery slice owns, and a slice that
  ships a defect its own review would find defeats the point of splitting the delivery. No correction was dropped,
  and `7.E.e.vi` is the one that splits across work units.

### `[~]` **7.E.f Bind the session anchor to a durable process**

- _Findings:_ L3-F1, L3-F2, L3-F4

- _Goal:_ Anchor selection classifies proven wrappers before interactivity and requires ARC at the executable,
  script, or command position, so a lease binds to the durable session rather than a short-lived `bash -lc` wrapper
  or an unrelated Node/npm/npx ancestor; subject projection reuses the reader's bounded scheduler.

- _Outcome:_ L3-F1 and L3-F2 moved to `7.P.b.i`, where the process and platform inspection slice owns their stable
  loci. L3-F4 moved to `7.P.f.ii`, because its subject-projection locus enters with the evidence and roster reader.

### `[~]` **7.E.g Repair the named paths that do not work**

- _Findings:_ W2-F1, E1-F1, E5-F2, S1-F1, P1-F3, P1-F4, E5-F1, B-F1, M1-F2, D-F1

- _Goal:_ Every advertised path completes through its production composition: in-place resume establishes its locus
  after the deferred checkout lands, previously accepted legacy records stay readable, remote-only legacy Errands
  reach their retained close path, legacy recovery works in an ordinary multi-work-unit repository, partial
  housekeeping binds to an exact opened base and applies the same path policy, grooming authorizes on exact paths
  rather than basenames, the inbox source digest survives identity publication and lost-response replay, the quick
  reference matches the shipped Errand signature, and a fresh installation receives both entry skills.

- _Outcome:_ Decomposed across Phase `7.P` by stable locus — the decomposition this task always owed, now against
  targets small enough to hold at once. `E1-F1` → `7.P.d.i`; `W2-F1` → `7.P.j.i`; `E5-F1` and `B-F1` →
  `7.P.h.ii`; `E5-F2` → `7.P.i.i`; `S1-F1` → `7.P.k.ii`; `M1-F2` and the `arc-errand` half of `D-F1` →
  `7.P.m.ii`. `P1-F3`, `P1-F4`, and the `arc-housekeep` half of `D-F1` leave this work unit with the claimed-sweep
  deliverable. Placement is derived from this Goal rather than from the finding records; each slice re-verifies its
  own members against `notes-session-locus-model.md` § Chunked-review finding triage before implementing.

### `[~]` **7.E.h Reconcile the claims and restore the lost coverage**

- _Findings:_ R1-F1, R1-F2, R1-F3, R1-F4, M1-F1, E4-V1, E5-V1

- _Goal:_ The recorded design says what the implementation does: advisory entry cannot mint immediate residue,
  leaseless work-unit selection is specified, changed-head re-entry has one rule across decisions and criteria,
  lease scope reads verb-scoped throughout, and the packaged workflows fail closed after composite-probe failure
  instead of falling back to branch and meta inference. Coverage stops asserting doubles — derivation-floor
  promotion regains real-runtime integration coverage, and the current-open, ROADMAP, adoption, and materialize
  cases exercise real v3 Errands rather than seeded legacy records.

- _Note:_ The v3 ordinary close path has no real-CLI coverage at all — every `arc errand close` case in the e2e
  suite seeds a legacy record or asserts a `--force` refusal, because finalizing a merged v3 tail needs live
  `gh pr list` host truth and the harness has no `gh` stub. The destructive-verb standard asks for real-CLI
  coverage here, so decompose a scripted `gh` on `PATH` (the idiom the anchor harness already uses for a fake
  executable, keeping git, refs, and inbox files real) and cover the merged happy path plus the
  foreign-occupancy refusal `7.E.c.v.2` added. Fidelity is the constraint: the stub must emit the exact
  `gh pr list --json baseRefName,headRefName,headRefOid` shape the runtime parses. `leave --state
  awaiting-merge` reads the same host boundary and gains coverage from the same stub.

- _Outcome:_ Decomposed across Phase `7.P` by stable locus. The recorded-claim members — `R1-F1` through `R1-F4`
  and `M1-F1` — are all documentation and workflow claims, so they land together in `7.P.m.i`, the slice that
  reconciles the shipped surface with what it promises. `E4-V1` and the non-materialize half of `E5-V1` are
  Errand-verb coverage → `7.P.i.ii`; the materialize half leaves with the transient-lifecycle deliverable. The
  `gh`-stub note above stays attached to `7.P.i.ii`, which is where the v3 close path lands. Same re-verification
  condition as `7.E.g`.

### `[x]` **7.E.i Split the grooming and housekeeping tails from their Node wiring**

- _Goal:_ `closeGroomAtRuntime`, `settleGroomAtRuntime`, and `settleHousekeepAtRuntime` compose over injected
  evidence the way settlement and occupancy closing already do, so their ordering and authorization claims are
  provable at the unit tier instead of only through a real CLI run.

    - `[x]` **7.E.i.1 Split the grooming close and settle tails**
        - `groom/close-locus.ts` and `groom/tail-locus.ts` hold the compositions; the `*-runtime.ts` modules keep the
          Node wiring and share one deferred session anchor, so an unprovable anchor still refuses at the roster read
          rather than ahead of the identity-only decisions the original sequence reached first. Both ordering claims —
          partial settle-then-pop-then-retire and awaiting-merge persist-then-pop — now fail at the unit tier against
          the reordered sequence, and the settlement composition takes host truth as its lifecycle vocabulary so the
          branded evidence stays a runtime concern.

    - `[x]` **7.E.i.2 Split the housekeeping lifecycle tail**
        - `housekeep/lifecycle-locus.ts` holds `closeHousekeep` and `settleHousekeep`, including the partial abandon
          arm, over the one evidence set all three read; `lifecycle-runtime.ts` keeps the Node wiring and the same
          deferred anchor. The occupancy selectors stayed in `open-runtime.ts` — they are already pure and unit-tested
          where they live, so the composition consumes them rather than restating them.

- _Outcome:_ All three tails now decide over injected evidence, and the two `P1` ordering defects the chunked
  review found in exactly these modules are the kind a unit test can now catch: persist-before-pop, settle-before-
  pop-before-retire, and cleanup-before-teardown each fail against a reordered sequence. `7.E.e`, `7.E.g`, and
  `7.E.h` now edit the split shape and earn unit coverage rather than writing against the unreachable one. The
  extraction is behavior-preserving by the real-CLI net `7.E.d.iv` added — the partial grooming sweep, the
  settled-claim replay, the already-deleted branch generation, and the housekeeping suite — run green before and
  after each step.

## **Phase 7.F:** Errand Close Reachability

_Purpose:_ Make the documented single-session Errand terminal reachable. Found by dogfooding this session: an
Errand whose PR merged while its checkout was still occupied cannot close. `arc errand close` refuses
`identity-conflict` because the record is `open` rather than `awaiting-merge`, and `arc errand leave
--state awaiting-merge` — the only edge into that state — refuses `change-request-unverifiable` because it
resolves change requests with `--state open` and the merge already landed. The identity, its lease, and its
originating inbox capture are all stranded with no non-destructive exit.

_Design decisions:_ No new design. `run-errand` § Complete already specifies close as the terminal "on merge
(full)" with no leave implied, and the auto-merge lane can land a merge while the operator is still in the
checkout, so the gap is a conformance defect rather than an unspecified case. The evidence doctrine is
unchanged and load-bearing: close proves an exact merged change request whose head equals the exact local
branch head, never branch shape. An `open` record simply carries no recorded change request, so close observes
one at finalization time instead of reading one the record already holds — the same observation `leave`
performs, against merged rather than open host truth.

### `[x]` **7.F.a Close an Errand that merged while its checkout was still occupied**

- _Goal:_ An Errand that stays in session through its own merge reaches the same terminal as one that left
  first: refs reaped against the proven head, the originating capture dropped, the identity and its lease
  retired. Ambiguous host truth, a moved head, and a still-open change request each refuse as they do today.

    - `[x]` **7.F.a.i Key close on a resolved change request rather than the record's state**
        - `closeOrdinaryErrand` accepts an `open` record alongside `awaiting-merge` and resolves one
          `CloseTarget` — the recorded change request when the record holds one, an observed one otherwise —
          which host truth, ref cleanup, and retirement authorization all read, so the three steps cannot
          diverge on which change request was proven. `retirementDesired`'s `close` arm authorizes from `open`
          against the observed coordinates while still requiring an `awaiting-merge` record's own recorded
          coordinates, so a substituted change request refuses even when host truth reports that substitute
          merged.

    - `[x]` **7.F.a.ii Observe the merged change request at the runtime boundary**
        - `observeOpenChangeRequest` became `observeExactChangeRequest`, taking the host state it must prove
          (the three existing callers keep `open` by default). The close runtime resolves an `open` record's
          target by requiring exactly one merged change request whose base, head ref, and head OID equal the
          exact local branch head; an absent local branch, ambiguous or unmerged host truth, and head drift
          each refuse before any ref or identity mutation.

    - `[x]` **7.F.a.iii Release the occupancy an in-place close leaves behind**
        - Close retires the identity but never pops the locus role or lease, so an Errand finalized in its own
          checkout left a `managed-role` row whose subject no longer resolves. Released through the recovery
          replay path rather than by teardown inside close: once the closing session ends, its lease dies, the
          row becomes residue, and session-init already offers `arc locus resolve <record-id> --action abandon`
          against it. That dispatch reached `abandonOrdinaryErrand`, which returned "already abandoned" on the
          absent identity **before** any residue cleanup — a retired identity read as proof the checkout had
          been released.
        - The identity-absent arm now releases the caller-selected generation first, keyed on the row rather
          than the missing record: exact `recordId` and `leaseId`, a dead lease, a clean checkout, marker
          provenance for a spawned worktree, then `popLocusRole` under the record lock. `popLocusRole` takes
          observed liveness rather than anchor equality, so a cold session finalizes what a departed one left —
          which is what makes the replay path work at all. The direct `arc errand abandon` verb supplies no
          selection and is unchanged.

### `[x]` **7.F.b Let a residue row satisfy the precondition that defines it**

- _Goal:_ The replay path `7.F.a.iii` routes to is reachable: a dead-leased, clean, ARC-provenanced residue row
  passes `arc locus resolve`'s preservation gate and reaches its subject driver, for `resume` as well as `abandon`.

    - `[x]` **7.F.b.i Ground the preservation gate in preservation evidence**
        - `resolveLocusGeneration` no longer takes an injected `generationProven`; it projects the row through
          `projectTrustedLocusRow` itself and refuses with that projection's own reasons rather than one generic
          message. `abandon` tolerates exactly `subject-unresolved` — the defining condition of the residue it
          exists to clear, so treating it as disqualifying made the exit unreachable precisely where it is needed —
          while `resume` gets no allowance, since it reattaches through the subject's operation driver and an
          unresolved subject leaves it nothing to reattach to. Every other authority failure stays fatal to both,
          preserving the provenance, identity, version, and path evidence D6 requires. `preservation-unproven` now
          names only the dirty checkout, and the residue-frame assertion stays as its own refusal.

    - `[x]` **7.F.b.ii Cover the runtime computation the unit tests bypass**
        - The bypass was the injection: with the predicate computed inside the driver, the existing driver tests
          exercise it directly. The row builder was the deeper fiction — it emitted `diagnostics: []` for a dead
          lease, a shape the reader never produces — so it now attaches the liveness evidence the reader attaches,
          and every case in the file runs against the published shape. Added: abandon reaches dispatch on a row
          carrying `lease-dead` + `subject-unresolved`; resume refuses the same row; abandon still refuses on
          `cross-identity`, `marker-missing`, `identity-malformed`, `unsupported-version`, and `path-unavailable`;
          a non-residue frame refuses.

- _Outcome:_ The two conjuncts of `generationProven` were mutually exclusive — `frame: "residue"` requires a
  dead-or-absent lease, and a dead lease always carries `lease-dead` — so no residue row could satisfy it and
  every residue `deriveRecovery` offered was unresolvable, `resume` and `abandon` alike. The gate had been
  standing in for an authority check with a diagnostic count, which is why it contradicted both D6's stated
  preconditions and `7.E.a.i`'s deliberately `lease-dead`-tolerant predicate. Proven end to end against the live
  `test-fixture-cwd-path` residue this branch had been blocked behind for three sessions: `applied`, dispatching
  into `7.F.a.iii`'s identity-absent arm, with the probe moving `recovery: residue → none`,
  `reconciliation: stop → clean`, and `primaryAvailability: unsafe → free`.

## **Phase 7.G:** Recovery Reachability Without a Dead Lease

_Purpose:_ Give unverifiable liveness an exit. Every other residue state resolves: a dead lease reaches
`arc locus resolve`, a dead lock reaches `break-dead-lock`, an orphaned record reaches `reap-stale-record`. An
`unknown` reading reaches none of them and stops the session instead. Surfaced by a recovery-model review this
session, asking what an interrupted session leaves behind.

_Evidence, traced to source:_ `verifyProcessAnchor` returns `unknown` when inspection is unverifiable **or when
the recorded anchor's inspector kind differs from the running one** — so a checkout reached from two platforms
(this project targets Windows, WSL, Linux, and Mac) reads its own healthy lease as unverifiable without anything
having gone wrong. From there every exit refuses: `deriveRecovery` stops on any managed row with an unknown
lease, `deriveReconciliation` stops with zero actions, `resolveLocusGeneration` refuses `lease-unknown`,
`projectTrustedLocusRow` makes `lease-unknown` / `lock-unknown` authority-fatal so attach and release preparation
refuse, D10 makes age and heartbeat staleness informational only, and current v3 Errands never permit
`close --force`. The remaining exit is deleting the record by hand — the out-of-band move the model exists to
prevent.

_Design decisions:_ **Settled in `spec-session-locus-model.md` — implement against it.** Recovery keys on authority
over the lease rather than on deadness: dead or absent resolves automatically, self-held and unverifiable resolve
through operator confirmation scoped to an unresolved subject or an explicit abandon, and a foreign live lease
stops with no confirmation path. D5 gains a `self` verdict as a refinement of `live`, D6 carries the authority
rule, and the Proportionality boundary classifies every stop reason into hard, authority, or advisory tiers under
one test — an agent may act on evidence the code lacks, and may not act where the code holds evidence the agent
lacks. Confirmation authorizes acting on the lease alone and relaxes no occupancy, cleanliness, provenance,
exact-head, or generation guard.

_Anchor portability was rejected, and the cross-platform premise with it._ Record identity derives from a
flavor-normalized checkout spelling, and normalization rejects a Windows drive or UNC spelling under the POSIX
flavor and a rooted POSIX spelling under the Windows flavor — so the two record spaces are disjoint by construction
and never read each other's anchors. The residual mismatch is two same-flavor inspector kinds at an identically
spelled absolute path, needing a shared or synchronized mount; it degrades to `unknown` and reaches the same
operator-confirmed path. The unverifiable readings that actually occur come from inspection failure — permission
boundaries, an unreadable `/proc`, a failing `ps` — not from inspector-kind mismatch. Neither a portable machine
identity on the anchor nor a per-platform record store is therefore in scope.

### `[x]` **7.G.a Give residue without a dead lease an in-model exit**

- _Goal:_ A session that cannot verify its predecessor's liveness — or that is provably the stranding process
  itself — has a defined, in-model way forward, and the path is reachable from the surface that reports the stop.
  No recovery state depends on hand-editing the record store.

- _Note:_ The design is settled above; what remains is implementation against it. Distinct from `7.E.d`, which
  recovers mutations that failed midway; this is a state that never becomes resolvable at all. Distinct too from
  `7.F.b`, where a conclusively dead lease fails its own exit — that is a conformance defect against D6 and does
  not wait on this one. Gate any self-attested release on operator confirmation, and do not weaken the process
  anchor to reach it: after a conversation reset the same process still holds live shell state and full write
  capability in that checkout, so dropping the lease there would open a genuine concurrent-occupancy hole.

- _Approach:_ **two axes, not a widened verdict.** `ProcessLiveness` is read by occupancy guards in fourteen
  modules, so widening it to carry `self` would silently change the meaning of every existing `=== "live"` check —
  a guard could open without anyone editing it, which is exactly what D5's "refinement of `live`, not a peer of
  it" forbids. `verifyProcessAnchor` therefore keeps returning `live` / `dead` / `unknown` and nothing that guards
  occupancy changes; a separate authority classification is consulted only where recovery decides. Occupancy asks
  whether someone is there, authority asks whether I may act, and each layer reads the axis it owns.

    - `[x]` **7.G.a.i Add the lease-authority classification**
        - `classifyLeaseAuthority` in `process-inspector.ts` returns `self` / `foreign` / `dead` / `unverifiable`
          over the anchor this process would select now. `verifyProcessAnchor` and `ProcessLiveness` are untouched,
          so the fourteen modules reading occupancy see no change.
        - Self is resolved **before** inspection rather than after, which is what makes it reachable in the case
          that motivated the phase: self-identification is a structural comparison the caller already owns, so it
          holds where inspection cannot reach — an unreadable process table or a differing inspector kind, the two
          readings that previously collapsed to `unknown` and stranded.
        - Covered by self-detection, self under both unreachable-inspection shapes, foreign separation on each
          identity axis, the unverifiable-own-anchor fallback, and an explicit assertion that occupancy liveness
          still reads `live` for a self-held lease.

    - `[x]` **7.G.a.ii Classify the stop reasons into tiers**
        - `stop-tier.ts` classifies all fifteen published reasons as `hard` / `authority` / `advisory`. An
          exhaustive `Record<LocusStopReason, LocusStopTier>` is the mechanism rather than the comment: adding a
          member to the enum fails to compile here until its tier is decided, verified by temporarily adding one
          and observing `TS2741` at the map.
        - The tier line splits on whether the **target** is established, not on severity. A foreign live lease or
          lock is `hard` because the code holds positive evidence of another session and there is no confirmation
          to give; malformed, unsupported-version, duplicate, cross-identity, identity-malformed, and
          role-conflicting records are `hard` because acting would mean acting on something unidentified. The
          `authority` tier is where the target resolves but its disposition cannot be proven locally —
          unverifiable lease and lock liveness, an unresolved subject, a missing marker, an unavailable path.
        - Corrected a spec inconsistency found here: the Proportionality boundary placed a foreign `lease-live` in
          the `authority` tier, contradicting D6's foreign-live stop. D6 governs, and the tier text now matches it.

    - `[x]` **7.G.a.iii Route self-held and unverifiable residue to the confirmed exit**

        - _Note:_ decomposed at entry. Reading the resolve path surfaced two prerequisites outside the leaf's
          stated scope — a second self-test already in the reader, and a frame rule that would have regressed
          every live transient session — so the reconciliation lands first and the routing builds on it.

        - `[x]` **7.G.a.iii.1 Reconcile the self-tests and narrow the frame rule**
            - `state.ts` already self-identified: `resolveCurrent` selected the current frame with a private
              `anchorsEqual` against the entering anchor, so `7.G.a.i` had introduced a second self-test with
              different strictness. `sameProcessAnchor` is now the single exported test and both read it.
            - `selector` participates, adopting the reader's stricter comparison over the one `7.G.a.i` recorded.
              The asymmetry decides it: a false `foreign` costs a detour through operator confirmation and
              recovers, while a false `self` releases a genuinely foreign session's lease and does not.
            - Corrected a second spec error found here. D6 read that any role whose lease is absent, dead,
              **self-held**, or unknown is residue — but a running Errand, grooming pass, or housekeeping sweep
              holds a self-held live lease for its whole life, so that rule would have demoted every live
              transient session to residue and offered it for abandonment. Self-held is residue-eligible only in
              conjunction with being unable to become the current frame, which is the stranded shape the phase
              exists for; self-identification alone never demotes a frame.

        - `[x]` **7.G.a.iii.2.a Publish self-ness and admit the stranded row to residue**
            - `LocusStateV1`'s row lease gains `selfHeld`, populated in `deriveLocusFrames` from the comparison the
              reader already makes against the entering anchor. The anchor itself stays private — it names a PID
              and creation token no consumer needs — so the comparison is published rather than its inputs.
              `ProvisionalLocusRow` omits the field by type, since roster projection has no entering anchor and a
              producer defaulting it to `false` would be a lie rather than an absence.
            - `deriveRecovery` admits a transient to residue on the conjunction D6 names — self-held **and**
              untrusted — via `isStrandedSelfHeld`. A live claimable transient session is untouched and still
              resumes, which is the regression the conjunction exists to prevent.
            - Writing the test surfaced the deadlock's actual mechanism: frame selection claims a self-held live
              lease as `current` without consulting trust, so recovery answered `resume` for a row every attach
              then refused. A stranded current row now falls through to residue. The fix is confined to the
              recovery verdict rather than to frame selection, which would have changed what `current` means for
              every untrusted row including work units.
            - `probe-envelope.md` documents the new field in both copies; fixtures across eighteen suites carry it.

        - `[x]` **7.G.a.iii.2.b Accept the confirmed release**
            - `resolveLocusGeneration` takes `confirmedNoLiveSession` and admits a self-held or unverifiable lease
              on it, scoped to an unresolved subject or an explicit abandon. A verifiably foreign live lease
              refuses ahead of the gate and has no confirmation path at all, which is what keeps the attestation
              from becoming a general force. Surfaced as `arc locus resolve --confirm-no-live-session`.
            - The flag covers both halves of the phase goal rather than self-identification alone. A self-held
              attestation was the earlier shape, but an unverifiable lease held by _another_ anchor — a stale
              record whose process-table read failed — is the other stranded state, and the operator's evidence is
              identical in both cases: they can see their own machine. One attestation, one name.
            - The attestation clears exactly the reason it attests to. `lease-unknown` stops blocking, since that
              diagnostic states the very thing the operator supplies; `lock-unknown` deliberately does not, because
              an unverifiable lock holder may be a process mid-mutation, which is a different claim.
            - Frame derivation now reads a stranded self-held row as `residue` rather than `active`, so selection,
              the recovery verdict, and the resolve gate agree instead of the driver special-casing a frame that
              disagreed with it. Trust moved behind `locusRowAuthorityReasons`, shared by the trusted-row
              projection, frame derivation, and this driver over the inputs all three read.
            - Covered by a foreign live lease refusing however loudly it is attested, a self-held lease refusing
              until attested, the recorded stranding case clearing once attested, an unverifiable non-self lease
              clearing, and the attestation failing to substitute for the dirty-checkout or cross-identity guards.
              Verified end to end against the real CLI: the flag reaches the driver and a refusal exits non-zero.

    - `[x]` **7.G.a.iv Move the advisory tier off the stop path and correct the narration**
        - `renderPrimary` suppresses an `unsafe` primary whose reasons are all advisory-tier. Allocation still
          reads `primaryAvailability` and still refuses — this is narration only — but a primary that is merely
          dirty or off base is the ordinary steady state a checked-out branch or in-flight errand leaves behind,
          and reporting it to every session that allocates nothing was the noise the tier model exists to remove.
          A reason costing more than that still speaks, including in a mixed set.
        - Residue guidance reads **"dies when the process exits"** for a self-held lease, paired with the
          instruction to exit the process, replacing the phrasing that led a handoff to predict a release a
          conversation reset could never reach. Both the self-held and unverifiable arms name
          `--confirm-no-live-session`, and so does the manual-cleanup line — the goal's reachability clause is
          what makes the exit discoverable from the surface that reports the stop rather than from the spec.
        - Covered by advisory-only suppression, a mixed set still speaking, both residue arms, the cleanup line,
          and an ordinary dead-lease offer left byte-identical.

- _Outcome:_ Recovery now keys on authority over the lease rather than on deadness, which is what makes the two
  states that were safe-but-not-dead resolvable at all: a lease held by the caller's own process, and one whose
  liveness no inspector can establish. The four leaves are one mechanism — classify authority, tier the refusals
  by who may act past them, admit the stranded row to residue, and say so where the operator is standing. What
  keeps it from being a force switch is that a verifiably foreign live lease never reaches the gate, so the
  attestation is admissible exactly where the reader is uncertain and inadmissible exactly where it is not.
  Two spec errors surfaced during execution and were corrected against the code that would consume them: a
  foreign live lease placed in the operator-releasable tier, and a frame rule that would have demoted every live
  transient session to residue.

### `[x]` **7.G.b Settle what `current` means for a row nothing can attach to**

- _Goal:_ Frame selection and attach authorization agree about which rows are claimable, so no verdict offers a
  frame that the next operation is guaranteed to refuse.

- _Evidence, traced to source:_ `resolveCurrent` selects on live-lease-plus-matching-anchor and consults trust
  nowhere, so a row carrying an authority-fatal diagnostic still resolves as `current`. Every attach then refuses
  it through `projectTrustedLocusRow`. `7.G.a.iii.2.a` broke the one instance the recovery verdict could reach —
  a self-held lease on an unresolvable subject now falls through to residue — but the shape is general: a foreign
  live lease on an untrusted row, or a work-unit row with `marker-missing`, still resolves as `current` and still
  cannot be attached.

- _Settled:_ the broad reading. Selection reads the same trust predicate attach does, recorded in D6. What decided
  it was not the design argument but a defect the investigation reproduced: `7.G.a.iii.2.a` had made the recovery
  verdict trust-aware while leaving selection trust-blind, so a stranded row published `current: resolved` beside
  `recovery: residue`, and `deriveRecoveryLocusContext` cross-checks the two and threw
  `RecoveryLocusContextError` — a crash where the deadlock had at least been a refusal. Confining that fix to the
  recovery verdict looked conservative and was not; it manufactured the disagreement.

- _Outcome:_ Trust moved into selection and the recovery fall-through it had required was reverted, so a stranded
  row reaches residue because nothing claims it rather than because one verdict special-cases it. All three
  verdicts now agree by construction instead of by each consumer remembering to check. The regression is pinned
  across the seam that broke, driving the real derivations rather than the hand-assembled fixture — that fixture
  computes `recovery` from `current`, so it could not express the disagreement, which is exactly why the defect
  reached a throwing consumer unnoticed. Both new cases were confirmed to fail against the restored bug.
  Blast radius accepted deliberately: a work-unit row with authority-fatal evidence no longer resolves as
  `current`, so session-init orients as no-active-WU rather than offering a frame that attach would refuse.

- _Discovered:_ during `7.G.a.iii.2.a`, while writing the test that proved the stranded row reaches residue.

## **Phase 7.S:** Decomposition Readiness

_Purpose:_ Establish that the delivery-stack carve recorded in `notes-session-locus-model.md` § Decomposition into
a delivery stack is viable, and at what cost, before executing it. The carve itself is **not** a task here — it is
this phase's exit condition.

_Superseded in part:_ this phase sized a three-deliverable carve. Measuring the result rather than the cut showed
the base deliverable still stood at 43,747 lines, so the transient-lifecycle and claimed-sweep deliverables still
leave this work unit, but what remains is delivered by the thirteen slices of Phase `7.P` rather than as one
change set. The measurements below stand; the delivery shape they informed does not.

_Design decisions:_ ARC runs no ceremony for this. `decompose-work-unit.md` stops on an `Active` origin whose
committed code spans several would-be members and routes to the full-split escape hatch in
`strategy-work-organization.md` § Active-state decomposition; `arc decompose` covers extraction of **unbuilt**
scope only, and both the transient-lifecycle and claimed-sweep deliverables are built. The strategy's two listed
mechanics are cherry-pick (clean commits) and history surgery (interleaved); this carve takes neither. It
re-creates each deliverable from **tip state** onto a fresh branch off the base, which is forward-only on a pushed
branch and needs no history rewriting — at the recorded cost of the origin's 195-commit narrative, mitigated by
porting each deliverable as a meaningful commit sequence and retaining the origin branch unmerged as the record.

_Sequencing:_ run after `7.E.e` closes and **before** `7.E.f`, `7.E.g`, and `7.E.h`. Those three are the
undecomposed parents that span deliverables, and decomposing them against the origin forfeits the main benefit of
splitting — each should be cut against one small target instead. `7.G` was this plan's first action and is
complete; what remains before the carve is below.

### `[x]` **7.S.a Size the test entanglement**

- _Goal:_ The carve's largest unknown is quantified: which suites move whole, which split, and which cannot be
  separated without restructuring.

- _Outcome:_ Classified all 163 touched test files (+21,621 / −846) by owning deliverable: ~86% D1, ~6% D2, ~8%
  D3. Coverage carves about as cleanly as source — 14 files move whole, 3 split at `it` boundaries, and exactly
  one (`locus-methodology-contracts.test.ts`) is entangled within a test and must be edited at each stop. Nothing
  needs restructuring. The premise that grooming had no named test file was wrong; `unit/groom/` and
  `unit/housekeep/` both carry real driver coverage. Two consequences recorded in
  `notes-session-locus-model.md` § Test entanglement, measured: the de-wire list gains the `errand/index.ts`
  barrel and the `command-input-registrations.ts` declarations, and D2 ships thinner coverage than its source
  share because the identity-core tests proving its state machine stay in D1.

### `[x]` **7.S.b Prove the carve on a throwaway branch**

- _Goal:_ The four recorded seam fixes are shown sufficient to make the base deliverable compile and pass on its
  own, before any real branch is created.

- _Outcome:_ The carve works — D1 typechecks, builds, and passes the full suite standalone (733 files / 8,979
  tests, 0 failures) at a total cost of 38 files, +96 / −6,152. The four recorded fixes were neither complete nor
  entirely necessary: three held, `identity-snapshot` turned out not to be a seam at all (both ends are D1), and
  three more were needed — the `errand/index.ts` barrel, the command-input registrations, and
  `handlers/locus.ts`'s abandon dispatch. That last one moved a boundary: `abandon`, `partial-settle`, and
  `execution-offer` (~1,040 lines) belong in D1, because `arc locus resolve --action abandon` is D1's own
  residue exit and has no other driver. D2 and D3 are far smaller than recorded. The doc-surface rewrite is the
  one cost this proof did not measure, and no gate catches it. Full record in
  `notes-session-locus-model.md` § The carve, proved.

### `[x]` **7.S.c Gate the documented command surface against the live one**

- _Goal:_ Removing a command without trimming the reference material that promises it fails a gate rather than
  shipping green.

- _Outcome:_ `command-surface-documentation.test.ts` derives both sides — documented `arc …` invocations from
  the project and package quick references, live paths from the Commander source scan — so it needs no
  per-deliverable editing and reports the offending line rather than a count. Verified negatively by removing
  `errand leave` from the CLI and confirming both reference checks fail. That verification caught a defect in
  the first draft: resolving to the longest registered _prefix_ let any `arc errand <anything>` pass on the
  surviving `errand` group alone — exactly the carve's failure mode. Bare words are command segments, since
  operands and options are bracketed, so an invocation resolves only against its full path.

## **Phase 7.P:** Proportionate Delivery

_Purpose:_ Deliver this work unit as one planning baseline, one control-isolation bridge, fourteen planned
implementation pull requests, and five focused regression repairs rather than one 43,747-line change set. Each slice
task below is one pull request; every delivery lands coherently on `main` before its successor begins.

_Design decisions:_ S0 establishes the planning control plane separately because the four active artifacts alone
add 4,923 lines before `ROADMAP`. The implementation cut follows the acyclic module import graph. Exact construction
splits the terminal group at the promotion boundary into S9A and S9B, preserving the established S10–S13 labels
while producing fourteen concern-coherent slices. Corrections land **in the slice that owns their stable locus**
rather than in a preceding remediation phase — a slice that ships a defect its own review would find defeats the
point of splitting the delivery. Only one delivery branch is live: each slice cuts from the `main` containing its
landed predecessor, and its review owns that predecessor-successor seam. Measurements, the seam inventory, the
ordering proof, the status ledger, and the manual runbook live in `notes-session-locus-model.md` § Delivery topology
and sequence. S2R, S9AR, S10R, S11R, and S9AR2 are bounded corrective slices created when landed behavior failed
against a real invocation, permitted terminal path, or upgraded pre-model worktree. Each preempts an unpublished
successor, repairs the owning stable locus from current `main`, and lands before that successor resumes.

_Per-slice procedure_ — stated once, followed by every task below: measure an exact donor manifest and target
roughly 5,000 changed lines; port the completed baseline; implement the slice's remaining corrections; reconcile
shared tests, command inventories, package/project copies, and documentation against the surface at that stop; run
the complete project gates; then open one pull request directly against current `main`. CodeRabbit performs the
hosted review for every implementation slice, with hosted Codex as the coverage fallback; planning-only S0 requires
the pull-request checks but no hosted review. Verify and repair findings on the owning slice, require approval plus
all real checks at the exact head, and use an explicitly authorized admin merge commit only to bypass the sliced
path's unavailable `arc-cleared` context. Do not invoke `integrate-work-unit`; begin the successor only after the
landing is verified and recorded by the runbook.

_Control-plane retrofit:_ S3 is the last implementation target that carries the active planning artifacts. After
it lands, one persistent control branch retains the tracked meta/spec/tasks/notes set and the session-handoff
anchor. A deletion-only R0 bridge removes exactly those four paths from `main`; every later implementation
deliverable carries no `.arc/active/**` paths. Bespoke closeout copies the final control artifacts directly into
`.arc/completed/**` and renders `ROADMAP` without reintroducing an active work unit on the base.

_Inherited placement:_ subtasks carrying a finding ID were re-homed from `7.E.e`, `7.E.f`, `7.E.g`, or `7.E.h`.
Placement for the `7.E.g` and `7.E.h` members derives from those parents' recorded Goals, not from the finding
records — each slice re-verifies its own members against `notes-session-locus-model.md` § Chunked-review finding
triage before implementing.

### `[x]` **7.P.0 S0 — Establish the planning baseline**

- _Goal:_ Land the active meta, spec, task list, notes, and derived `ROADMAP` state as one checked control-plane PR
  below the slice-size ceiling, so S1 can remain an independently reviewable implementation capability.
- _Outcome:_ PR #395 established the planning control plane independently and landed as `bb6803b62`.

### `[x]` **7.P.a S1 — Locus record substrate**

- _Goal:_ The record schema, store, and identity derivation stand alone on the base: a record round-trips through
  its schema, derives a stable identifier from a flavor-normalized checkout spelling, and persists through bounded
  generation reads and exclusive mint.

    - `[x]` **7.P.a.i Require the authority coordinates on open success and canonical UTC** — L1-F2, L1-F3
        - All three open operations now require allocation, record and lease IDs, active locus, and session-home
          coordinates on applied and idempotent results; persisted timestamps accept canonical `Z` instants only.

    - `[x]` **7.P.a.ii Drop the unwired error and registry surfaces**
        - The slice omits the unwired locus error and registry modules and their tests while leaving the existing
          session-envelope registry unchanged.

- _Outcome:_ PR #396 landed the schema, flavor-normalized checkout identity, bounded record reader, and atomic
  no-clobber mint; lock-bound replacement and removal remain scoped to S3.

### `[x]` **7.P.b S2 — Process and platform inspection**

- _Goal:_ Liveness inspection is platform-correct and unknown-safe, and the session anchor it feeds binds to a
  process that outlives the invocation.

    - `[x]` **7.P.b.i Bind the session anchor to a durable process** — L3-F1, L3-F2
        - Anchor selection now classifies proven wrappers before interactivity and parses command boundaries before
          recognizing ARC at the executable, script, or command position, keeping short-lived shell wrappers and
          unrelated Node/npm/npx ancestors from becoming or crossing the durable session anchor.

- _Outcome:_ Linux, BSD, and Windows adapters expose one PID-plus-start-token liveness contract with unknown-safe
  failure behavior, while bounded ancestry selects the durable harness or directly verified interactive shell.

### `[x]` **7.P.c S3 — Lock and mutation protocol**

- _Goal:_ Record mutation is serialized by an owned lock, refuses on generation mismatch, and reclaims only
  proven-dead locks.

    - `[x]` **7.P.c.i Bind replacement and pop to the held record lock**
        - Replacement and removal now require the matching live lock handle and exact record bytes; contention
          coverage proves a blocked or stale generation cannot clobber or delete the successor's record.

- _Outcome:_ Record-scoped locks serialize exact-generation mutation, reclaim only stable dead holders through a
  secondary lock, and preserve the atomic no-clobber mint guarantees established by the record substrate.

### `[x]` **7.P.d S4 — Transient identity core**

- _Goal:_ The v3 transient identity state machine — claims, transitions, transactional writes, and change-request
  lifecycle — stands on the record substrate.

    - `[x]` **7.P.d.i Keep previously accepted legacy records readable** — E1-F1
        - The v1/v2 compatibility schemas preserve the base decoder's non-empty and unbounded field domain and
          strip fields that codec ignored, while v3 keeps its strict slug, text, timestamp, and object boundaries.

### `[x]` **7.P.e S5 — Reconciliation**

- _Goal:_ The reader derives what local state needs reconciling and surfaces it as typed guidance.

    - `[x]` **7.P.e.i Drop the unwired reconcile driver**
        - The slice omits `reconcile-driver.ts` and its unit suite; no production caller, IO implementor, or
          `breakDeadLock` implementation exists, while the two live adopt actions remain independently composed.

- _Outcome:_ The pure reducer emits deterministic clean, apply, and stop guidance with exact proof-bearing
  internal actions. Narrow structural inputs keep later evidence and marker acquisition out of this slice.

### `[x]` **7.P.f S6 — Evidence and roster reader**

- _Goal:_ One deterministic, read-only, network-free roster read projects every checkout into a schema-validated
  envelope with its own diagnostics.

    - `[x]` **7.P.f.i Normalize evidence error text at the reader boundary** — L3-F3
        - Empty acquisition messages fall back to their stable error code, oversized messages truncate at the
          shared 4,096-character contract, and both paths return schema-validated envelopes.

    - `[x]` **7.P.f.ii Bound subject projection concurrency** — L3-F4
        - Evidence acquisition and subject-meta projection reuse one scheduler; high-cardinality coverage proves
          that projection holds the configured maximum instead of launching the whole roster at once.

- _Outcome:_ The reader owns one bounded evidence-to-roster pipeline, preserves source-level degradation, and
  validates both public envelopes after exact checkout, marker, identity, and metadata joins.

### `[x]` **7.P.g S7 — Allocation and provisioning**

- _Goal:_ Allocation refuses live or unknown occupancy and duplicate or malformed topology, and provisioning
  establishes checkout, marker, record, and lease as one recoverable sequence. No inherited corrections.

- _Outcome:_ Primary and spawned allocation now compose fail-closed topology checks with recovery-safe checkout,
  marker, record, lock, and lease provisioning. PR #407 landed the cumulative stop on `main`.

### `[x]` **7.P.h S8 — Errand open and link**

- _Goal:_ Opening or linking an Errand allocates under full protection, writes its identity transactionally, and
  reports what it actually changed.

    - `[x]` **7.P.h.i Compose outcomes from every provisioning stage** — A-F3, E2-F3
        - Provisioning now aggregates checkout, marker, primary, role, and lease changes into one disposition, so
          open reports `applied` when recovery or any authoritative provisioning stage changes state.

    - `[x]` **7.P.h.ii Bind inbox adoption to the exact source generation** — E5-F1
        - Full identities and partial roles retain the inspected capture title plus normalized source digest;
          open, resume, link, and generation-qualified removal refuse a same-title replacement.

- _Outcome:_ Open and link now compose identity and locus effects without under-reporting recovery, while the exact
  adopted capture generation remains available across both protection modes.

### `[x]` **7.P.i S9A — Errand close, abandon, settle**

- _Goal:_ Full-protection close and abandon prove exact lifecycle, preservation, and occupancy evidence before
  reaping refs, dropping only the originating capture generation, and retiring identity and locus state. Partial
  settlement proves its direct-base result. The selected-generation helper lands with the abandon drivers that
  consume it.

    - `[x]` **7.P.i.i Reach the retained close path for remote-only legacy Errands** — E5-F2
        - Full-protection close now reconciles the complete local/remote identity basis before choosing the legacy
          or v3 implementation; a real CLI test proves a fresh clone can force-close a remote-only v2 generation.

    - `[x]` **7.P.i.ii Restore real-CLI coverage for the v3 close path** — E5-V1
        - A strict `gh` executable on `PATH` accepts only the exact merged-discovery and lifecycle query shapes. Real
          CLI cases finalize a merged ordinary v3 Errand and refuse finalization from outside its retained checkout.

- _Outcome:_ Close, abandon, and partial settlement now compose exact host, ref, occupancy, identity, lease, and
  capture-generation authority while preserving promotion as the coherent S9B successor.

### `[x]` **7.P.bR S2R — Repair real `npx` process ancestry**

- _Goal:_ Repository-required `npx arc` invocations select the durable session process through npm's actual Linux
  process-title boundary, and the corrupt retained Errand generation is recovered without bypassing identity
  retirement or leaving allocation globally stopped.

- **Additional Context:** `notes-session-locus-model.md` § S2R real-npx process-boundary repair

    - `[x]` **7.P.bR.i Recognize the exact flattened npm wrapper boundary**
        - Modeled Linux's one-argument `npm exec arc ...` process title, recognized it only at a Node wrapper, and
          added a real `npx arc errand open` regression that persists the native Codex anchor while unrelated
          flattened Node titles remain refused.

    - `[x]` **7.P.bR.ii Deliver the correction and recover the retained Errand**
        - PR #419 landed accepted head `8616e4f15` as `000770fb81`; the exact corrupt locus generation was cleared,
          `route-retained-work` closed through `npx arc`, and a fresh disposable Errand persisted the native Codex
          anchor before its identity and branch were retired without residue.

- _Outcome:_ Repository-required `npx arc` calls now cross npm's flattened process-title boundary without accepting
  unrelated Node processes, and the live repository returned to a clean, allocation-capable state.

### `[x]` **7.P.iR S9AR — Repair base-context Errand close**

- _Goal:_ An exact merged ordinary Errand may finalize later from its own occupied checkout after that checkout
  returns to the configured base, without weakening the refusal for foreign or unprovable occupancy.

    - `[x]` **7.P.iR.i Authorize the exact self-held checkout after a base switch**
        - Close now accepts only a stable, markerless primary base-checkout proof observed before and after locus
          acquisition, binding the exact record path and complete ordinary-Errand identity to a live self-held lease
          with one record-scoped branch mismatch. Unit and anchored CLI counterexamples retain foreign, untrusted,
          malformed-marker, normalization-equivalent path, and mid-snapshot branch-displacement refusals without
          destructive cleanup. The exact checkout's Git-native `HEAD` lock serializes the final authority proof with
          ref teardown, capture settlement, and identity retirement; cleanup-fetch and final-local-deletion switch
          attempts are blocked, registered target-branch occupancy or an unreadable worktree roster refuses before
          local deletion, and partial remote-delete replay retains every not-yet-authorized generation.

### `[x]` **7.P.iB S9B — Errand promotion**

- _Goal:_ Promotion turns one exact ordinary Errand generation into a work-unit record and settles its capture
  without losing replay authority across identity retirement, meta commit, or a lost response.

    - `[x]` **7.P.iB.i Restore real-runtime promotion coverage** — E4-V1, E5-V1
        - Covered derivation routing through the real runtime across the plan branch, Planning metadata and workflow,
          preserved head, locus transition, identity retirement, and replay. Current-open, ROADMAP, and inbox-adoption
          E2E cases now create real v3 Errands and prove exact capture-generation settlement; materialization remains
          with the transient-lifecycle deliverable.

    - `[x]` **7.P.iB.ii Retain the capture generation through promotion replay** — B-F1
        - Promotion carries the exact capture title and source digest in the work-unit role after identity retirement,
          settles it only from the self-held lease after the meta commit, and clears the handle. Replay treats an
          absent original as idempotent and refuses same-title replacements without removing them.

- _Outcome:_ Promotion now crosses the wrapper floor through the real runtime while preserving exact identity,
  checkout, lifecycle, and capture authority across identity retirement and the meta-commit settlement boundary.

### `[x]` **7.P.j S10 — Work-unit lifecycle integration**

- _Goal:_ Work-unit rename, teardown, and occupancy release hold the locus lock across revalidation, physical
  removal, and expected-generation role pop.

    - `[x]` **7.P.j.i Establish the locus on in-place resume after the deferred checkout lands** — W2-F1
        - In-place resume leaves the locus untouched while checkout is deferred, then the workflow's explicit
          post-entry reconcile establishes the exact work-unit role and entering-session lease from the live branch.

- _Outcome:_ Work-unit entry, rename, and teardown now compose durable locus roles with lock-bound revalidation,
  physical mutation, and expected-generation retirement; atomic entry failures compensate roles created by their
  own transaction.

### `[x]` **7.P.k S11 — Recovery**

- _Goal:_ Recovery keys on authority over the lease, and a ready report proves its seed was compared against fresh
  locus authority.

    - `[x]` **7.P.k.i Require the locus-hint audit on ready recovery reports** — S1-F3
        - Ready reports now require a locus comparison whenever the seed carries a hint, and the comparison's
          expected generation must equal that exact seed hint; null and mismatched comparisons are rejected.

    - `[x]` **7.P.k.ii Make legacy recovery work in an ordinary multi-work-unit repository** — S1-F1
        - Legacy recovery projects the exact return-branch candidate from the already-scanned active namespace
          instead of requiring repository-global single resolution; a real Git regression covers two active WUs.

- _Outcome:_ Recovery now derives its frame and context from reader-validated locus authority, preserves a bounded
  pre-model Errand path, and refuses record-less work-unit inference rather than trusting active metadata alone.

### `[x]` **7.P.jR S10R — Repair upgraded work-unit locus adoption**

- _Goal:_ An existing work-unit checkout that absorbs the locus model can establish its exact durable role through
  the ordinary applied reconcile path, receive actionable session-entry guidance while unmanaged, and enter through
  `start --here` without leaving the new work unit record-less.

- **Additional Context:** `notes-session-locus-model.md` § S10R upgraded-worktree adoption repair

    - `[x]` **7.P.jR.i Backfill the exact upgraded checkout without attaching a lease**
        - Applied reconcile now creates or retains the exact checkout's work-unit role without a lease and reports
          a newly minted role as applied. Passive reconcile remains read-only, while explicit `--attach-session`
          retains the entering-session lease only when a durable process anchor resolves.

    - `[x]` **7.P.jR.ii Surface the exact repair at session entry**
        - Session init now classifies only the exact current checkout by canonical filesystem identity. A missing
          role surfaces the applied-reconcile command, while managed or ambiguous authority stays unchanged;
          aliased paths match correctly and sibling rows cannot authorize or suppress the repair.

    - `[x]` **7.P.jR.iii Establish cold-start locus authority transactionally**
        - `start --here` now creates the in-place work-unit role and entering-session lease after scaffolding. Locus
          failure runs the shared cold-start rollback, and anchored CLI plus symlinked-runtime coverage proves the
          persisted authority through both ordinary and aliased checkout spellings.

    - `[x]` **7.P.jR.iv Preserve unknown-safe explicit session attachment**
        - Explicit `--attach-session` now adopts or retains the work-unit role without a lease when no durable
          session ancestor can be selected. It clears an exact dead WU lease first while preserving live/unknown
          occupancy refusals; built-CLI E2E coverage proves fresh adoption, dead-generation cleanup, and recovery
          from an interrupted command's process-verifiable mutation lock.

- _Outcome:_ Upgraded and newly started work-unit checkouts now converge on exact durable locus authority through
  discoverable entry paths. Explicit attachment across an unrecognized agent tool-shell boundary preserves the
  normal leaseless WU frame instead of binding either an unverifiable or short-lived command process as its durable
  lease; its separate mutation lock remains crash-reapable, and exact existing occupancy continues to gate
  replacement.

### `[x]` **7.P.kR S11R — Repair integration recovery cursor evidence**

- _Goal:_ Recovery accepts and preserves the fresh terminal task-list evidence required to resume an Integrating
  work unit without placing that task list in the integration load set.

- **Additional Context:** `notes-session-locus-model.md` § S11R integration recovery cursor repair

    - `[x]` **7.P.kR.i Align cursor presence with resolved recovery authority**
        - Recovery requires cursor evidence for strategic task-list loads and separately permits it for a resolved
          integration frame. A real built-CLI worktree proves terminal `no-open-task` evidence with an
          integration-only load set; no-pointer and failed-cursor states retain their auditor stops.

- _Outcome:_ Integration recovery now preserves fresh terminal task-list evidence without loading the task list,
  while unprovable cursor state continues to stop at the recovery audit boundary.

### `[x]` **7.P.iR2 S9AR2 — Repair terminal Errand close finalization**

- _Goal:_ A merged ordinary Errand closed from its own occupied checkout restores or removes that checkout and
  retires the exact session locus before its refs and identity disappear.

- **Additional Context:** `notes-session-locus-model.md` § S9AR2 terminal Errand-close finalization repair

    - `[x]` **7.P.iR2.i Settle the caller-owned locus before terminal retirement**
        - Close now revalidates the exact live role and lease, restores a clean primary checkout or removes the exact
          spawned worktree, and pops the owned role before refs, capture, and identity retire. Dirty, foreign, or
          unprovable occupancy retains terminal state; stdin-fed Git remains pinned after a spawned checkout vanishes.

- _Outcome:_ Real built-CLI coverage proves primary restoration, spawned teardown, base-context residue cleanup,
  recoverable dirty-checkout refusal, and successful allocation after close without leaving a dangling `HEAD` or
  `subject-unresolved` locus generation.

### `[x]` **7.P.l S12 — Session wiring and the locus command surface**

- _Goal:_ Session init, handoff, and compaction consume one shared locus projection, and both the JSON and human
  locus surfaces deliver exactly what they promise.

    - `[x]` **7.P.l.i Complete the confirmed retired-residue exit**
        - Confirmation now crosses the exact subject dispatch and permits only a selected self-held live or
          unverifiable lease to be removed atomically under its record lock. The dead path remains unchanged and a
          foreign live lease still refuses; real CLI coverage retires a primary Errand first, removes only its
          selected locus generation, and preserves an unrelated record byte-for-byte.

    - `[x]` **7.P.l.ii Deliver one typed result on every JSON path** — X1-F2, E5-F3
        - Locus mutations now convert every root, identity, Git-stdin, configuration, user-surface, and runtime
          failure through one typed result boundary. Errand open, close, abandon, and promote similarly catch their
          complete setup paths; public-handler regressions prove one JSON stdout line and exit one on both surfaces.

    - `[x]` **7.P.l.iii Render row diagnostics and terminate human locus output** — X1-F1, X1-F3
        - Human roster output renders every row diagnostic within its row block, while the raw locus mutation stream
          terminates both success and refusal text with exactly one newline. Public-handler coverage locks both
          streams.

- _Outcome:_ Session init, handoff, recovery, and public commands now share reader-owned locus authority; setup
  failures remain typed, confirmed residue cleanup stays generation-bound, and both JSON and human surfaces preserve
  their complete diagnostics and transport contracts.

### `[x]` **7.P.m S13 — Documented surface reconciliation**

- _Goal:_ The shipped reference material, workflows, and skills describe the command surface and behaviour this
  stack actually delivers, with the recorded design claims matching the implementation.

    - `[x]` **7.P.m.i Reconcile the recorded claims with the implementation** — R1-F1, R1-F2, R1-F3, R1-F4, M1-F1
        - Reconciled advisory entry, leaseless work-unit selection, changed-head re-entry, and verb-scoped lease
          claims with the delivered implementation; packaged workflows now fail closed on composite-probe failure
          and retain exact Errand identity, role, lease, checkout, and capture ownership through close.

    - `[x]` **7.P.m.ii Match the shipped Errand signature and entry-skill installation** — M1-F2, D-F1
        - Replaced stale Errand options and the retired verb with the shipped open/link/close/abandon/promote
          surface, reconciled the entry skill's locus instructions, and added live command-path plus explicit
          fresh-init installation regressions. The install path was already correct and required no production fix;
          the `arc-housekeep` half of `D-F1` remains with the claimed-sweep deliverable.

    - `[x]` **7.P.m.iii Rewrite the session-init signal-leaf spine for the delivered surface**
        - Rewrote the signal-leaf spine so Errand entry uses the durable transient path while housekeeping and
          grooming retain write-context preflight without durable transient roles; all frame dispatch remains
          reader-owned through typed locus projections.

    - `[x]` **7.P.m.iv Restore the decomposition handoff on the landed base**
        - Restored both planned successor specs/metas, consolidated the later mainline
          `locus-generation-binding` capture with the original carved scope under one authoritative provisional
          stub, bound it to `claimed-sweep-verbs`, and regenerated `ROADMAP` without an `.arc/active/**` path.

- _Outcome:_ The delivered CLI, command references, workflows, and entry skills now describe one coherent locus
  surface, while the carved transient-lifecycle, claimed-sweep, and exact-generation follow-ons retain authoritative
  backlog homes without reintroducing the active control artifacts to `main`.

## **Phase 8:** Verification

### `[x]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

- _Outcome:_ The 21-PR delivery reached `main` with reviewed-tree identity preserved, while the three carved
  follow-ons retain their authoritative backlog homes and dependency order.

---

## Success Criteria

- `[x]` Warm transient entry never switches or repurposes a WU-owned checkout; spawn remains the normal
  full-protection WU placement, while explicit `--here` occupies the physical primary until guarded teardown
  restores record-free base.
- `[x]` Full protection allocates the free primary or a provisioned transient worktree; partial mode never spawns.
- `[x]` Compaction during a warm Errand consumes the shared locus projection, checks any atomic optional seed hint,
  recovers the child frame, and restores freshly derived parent WU context.
- `[x]` `arc locus` is deterministic, read-only, network-free, schema-validated, complete across valid residue
  states, and projected once into each session-init, recovery, and handoff operation.
- `[x]` Locus records remain machine-local, notes-excluded, generation-safe, and reclaim only proven-dead locks.
- `[x]` Live or unknown primary occupancy and duplicate or malformed topology always refuse automatic allocation.
- `[x]` Existing ARC-owned worktrees and the exact markerless in-place WU case adopt safely, live grooming is never
  offered as residue/orphan cleanup, and unverified markerless or unresolved cases stay manual.
- `[~]` Single- or multi-member grooming claims admit disjoint co-design sets, resume on a same-anchor exact-set
  reopen, refuse other overlaps with the conflicting members named, bound writes to the claimed planning concern,
  and require exact change-request and branch-generation retirement before reuse.
  _Deferred to `claimed-sweep-verbs` after decomposition._
- `[~]` Errand materialization accepts only exact paused v3 heads, or awaiting-merge heads whose recorded change
  request is verified still open, and writes both ARC ownership provenance and the matching local role.
  _Deferred to `errand-transient-lifecycle` after decomposition._
- `[x]` Teardown holds the locus lock across final revalidation, physical removal, and expected-generation role pop.
- `[~]` One full-mode housekeeping sweep uses one identity, branch, PR, and review tail with its lane classified at
  close from the writes it landed; excludes a concurrent sweep under every other slug, safely reuses repeated
  branch names only after exact generation cleanup, then opens execute-now work as sibling Errands offered from
  visible execute-bound inbox markings in file order. Interrupted or abandoned routing preserves those markings as
  the next session's resume trail; an abandoned sibling clears only its own mark. Partial mode is explicitly
  machine-local primary occupancy.
  _Deferred to `claimed-sweep-verbs` after decomposition._
- `[x]` Exact v3 promotion converts one Errand locus into the sole active WU session home and preserves its inbox
  capture until the WU meta commit, with no standalone v3 retirement command.
- `[~]` Full-mode Errands can pause or await merge without leaving an unleased transient role as normal waiting state.
  _Deferred to `errand-transient-lifecycle` after decomposition._
- `[x]` Partial-mode Errands remain direct-base, machine-local, non-materializable, and non-pausable.
- `[x]` Handoff releases an exact restored WU lease once; a cold between-WUs transient closes to a record-free primary
  without fabricating a lease-release operation.
- `[x]` Ordinary WU session entry proceeds leaseless on the durable role, warm entry never hard-refuses on harness
  identity, and routine session narration renders no locus lines for expected state, naming the model only as
  "session locus" where diagnostics require it.
- `[x]` Linux, macOS/BSD, and Windows inspectors enforce PID-plus-start-token liveness with unknown-safe degradation.
- `[x]` Locus schemas compose with the landed kernel and session envelope without a parallel type or codec authority.
- `[x]` Package/source parity and all required tests, lint, type checks, builds, and platform CI pass.
- `[x]` Every in-scope chunked-review finding is verified against source and corrected, and each carved finding is
  recorded in `notes-session-locus-model.md` with the risk its deferral accepts.
- `[x]` The work unit reaches the base as a stack of independently reviewable pull requests, each one a coherent
  capability that carries its own tests, passes the full gates on its own, and ships no defect its own review
  would find.
- `[x]` Ready for integration.
