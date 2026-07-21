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

### `[ ]` **1.2 Build normalized checkout identity and exact record persistence** — D2, D3

- _Goal:_ One Git-reported checkout spelling resolves to one tamper-evident machine-local record whose path and
  contents cannot redirect persistence outside the locus store.

    - `[ ]` **1.2.a Make registered-worktree topology parsing path-exact**
        - Refactor `packages/arc-framework/src/lib/git/worktree-roster.ts` so topology and branch-path consumers
          invoke `git worktree list --porcelain -z` and share one NUL-delimited parser.
        - Preserve each decoded `worktree` field exactly as Git reports it; never line-split, trim, or hash Git's
          quoted-path presentation. Reject malformed field/record structure without losing the first-stanza primary
          designation or the existing structured scan failure.
        - Build `test-first` (one behavior at a time):
            - Cover ordinary paths, spaces, quotes, backslashes, embedded newlines, multibyte/astral text, and
              Windows/UNC spellings without presentation decoding drift.
            - Cover malformed/truncated NUL records, missing required fields, deterministic primary selection, and
              parity between topology and branch-path consumers.

    - `[ ]` **1.2.b Derive stable checkout digests through an explicit path-flavor seam**
        - Add a pure lexical normalizer and SHA-256 record-ID helpers under
          `packages/arc-framework/src/lib/locus/`, accepting an explicit POSIX or Windows path flavor while
          production selects the runtime flavor.
        - Require Git-reported absolute input, preserve its display spelling separately, and use
          `canonicalLocalPath()` only for ephemeral same-locus comparisons.
        - Build `test-first` (one behavior at a time):
            - POSIX roots, embedded relative segments, trailing separators, Windows drive roots, UNC paths, and
              extended Windows spellings normalize deterministically under their selected flavor.
            - Relative input, mixed-flavor ambiguity, and over-limit paths reject before hashing.
            - Case is preserved, UTF-8 bytes are hashed, and record IDs use exact lowercase hexadecimal grammar.
            - Existing physical aliases compare equal without changing the persisted spelling or digest.

    - `[ ]` **1.2.c Resolve the primary-backed locus root with fail-closed topology semantics**
        - Add a dedicated locus-root resolver over `scanRegisteredWorktrees()` that requires exactly one successful
          primary stanza, preserves structured topology failures, and never calls the ordinary active-checkout
          fallback.
        - Leave `resolveUserSurfaceResolver()` and its existing non-locus callers unchanged.
        - Resolve `.arc/user/{identity}/.internal/loci/` and record-scoped lock paths only beneath that root.
        - Preserve the existing dot-prefixed user-sync exclusion and add a regression proving locus files never
          enter notes manifests.
        - Build `test-first` (one behavior at a time):
            - Exactly one primary resolves the store, while zero/multiple primaries and structured topology failures
              refuse without the active-checkout fallback.
            - Resolved locus and lock paths remain beneath the primary user root and excluded from notes manifests.

    - `[ ]` **1.2.d Parse and atomically persist exact record generations**
        - Add record-store reads that validate filename digest, `recordId`, recomputed `checkoutPath` digest,
          schema version, and absolute-path shape before returning data.
        - Bound reads to `MAX_LOCUS_JSON_BYTES + 1` bytes before UTF-8 decoding or `JSON.parse`; classify oversized,
          malformed, unsupported, and unreadable input without buffering the remaining file.
        - Use same-directory atomic replacement for updates and exclusive create for mint; preserve incompatible or
          malformed existing content for reconciliation instead of overwriting it.
        - Build `test-first` (one behavior at a time):
            - Absent, valid, malformed, unsupported-version, digest-mismatch, and raced-create outcomes remain
              distinct in `packages/arc-framework/__tests__/unit/locus/record-store.test.ts`.
            - Oversized input rejects before full buffering, and atomic replace/exclusive create never overwrite an
              incompatible or concurrently created generation.

### `[ ]` **1.3 Implement cross-platform process anchors and three-state liveness** — D5

- _Goal:_ Lease and lock decisions distinguish live, dead, and unverifiable sessions without treating PID reuse,
  heartbeat age, ambiguous ancestry, or missing platform facilities as cleanup authority.

    - `[ ]` **1.3.a Define the inspector and native-process execution ports**
        - Add the common `inspect(pid)` result contract plus a locus-local argument-array `ProcessExec` boundary with
          cancellation, bounded captured output, structured exit data, and no shell interpolation.
        - Bind production execution through `execa` without reusing the Git-specific `GitExec` error or environment
          semantics and without broadening this task into a repository-wide executor refactor.
        - Build `test-first` (one behavior at a time):
            - Present, absent, and unverifiable inspection results remain exhaustive and preserve opaque start tokens.
            - Nonzero exits, cancellation, missing executables, and over-limit output retain enough structure for an
              inspector to degrade safely.

    - `[ ]` **1.3.b Select one bounded session anchor from pure ancestor snapshots**
        - Add a pure selector that walks at most 32 inspected ancestors, skips only exact allowlisted ARC/npm wrapper
          identities, and accepts a recognized per-session Codex, Claude, Gemini, or directly verified interactive
          shell process.
        - Stop with an `unverifiable` anchor at a missing ancestor, unknown wrapper, shared application host, multiple
          plausible sessions, automation boundary, or exhausted depth; never cross ambiguity to find a convenient
          higher ancestor.
        - Build `test-first` (one behavior at a time):
            - Cover exact wrapper chains, each harness selector, direct TTY shells, shared daemons, short-lived
              automation, missing parents, depth exhaustion, multiple candidates, and PID reuse.

    - `[ ]` **1.3.c Implement the Linux `/proc` inspector**
        - Read parent PID and kernel start ticks from `/proc/{pid}/stat` and command identity from `exe` or `comm`.
        - Classify missing processes as dead and permission, parse, identity, or facility failures as unknown.
        - Build `test-first` (one behavior at a time):
            - Valid snapshots preserve parent, identity, and start ticks; process absence is dead while permission,
              parse, identity, and facility failures are unverifiable.

    - `[ ]` **1.3.d Implement the macOS/BSD `ps` inspector**
        - Invoke `ps` through `ProcessExec` with a locale-stable environment and preserve its exact start string as
          the opaque token.
        - Build `test-first` (one behavior at a time):
            - Absent processes, permission failures, malformed output, nonzero exits, and localized host defaults
              degrade safely without parsing localized display text.

    - `[ ]` **1.3.e Implement the Windows CIM inspector**
        - Invoke a static PowerShell/CIM query through `ProcessExec`, pass the PID as a separate argument, and map
          `ParentProcessId`, executable identity, and `CreationDate` from compressed JSON into the common result.
        - Build `test-first` (one behavior at a time):
            - Missing PowerShell/CIM, inaccessible and absent processes, malformed output, nonzero exits, and
              Windows path spellings map into the common result without shell interpolation.

    - `[ ]` **1.3.f Bind platform selection and unknown-safe verification**
        - Select inspectors by supported runtime platform; unsupported platforms return `unverifiable`.
        - Compare both PID and start token for `live`/`dead`; expose heartbeat age only as rendered context.
        - Build `test-first` (one behavior at a time):
            - Supported platforms select the correct adapter, unsupported platforms remain unverifiable, and only
              exact PID-plus-start-token equality is live.

### `[ ]` **1.4 Implement record-scoped locking and token-safe stale breaking** — D3

- _Goal:_ Concurrent commands serialize only the checkout they mutate, and no contender can break or release a
  lock unless the exact observed holder generation is conclusively dead under the process-inspector contract.

    - `[ ]` **1.4.a Implement the record and secondary-break lock protocol**
        - Add `packages/arc-framework/src/lib/locus/lock.ts` using exclusive-create files with lock token, command
          process anchor, bounded retry, and record-scoped secondary break locks.
        - Reuse shared filesystem primitives, but consume the established PID-plus-start-token inspector rather than
          the notes lock's PID-only liveness or corrupt-holder break behavior.
        - Bound holder reads before decoding; classify malformed, oversized, partially written after the readback
          budget, and unreadable holders as unknown rather than dead.
        - Build `test-first` (one behavior at a time):
            - One contender wins an empty lock; live, unknown, malformed, oversized, and unreadable holders time out
              without eviction.
            - A dead holder is removed only while the secondary lock is held and its token/anchor remain unchanged.
            - A changed holder aborts stale breaking and forces a fresh acquisition attempt.

    - `[ ]` **1.4.b Make release and failure cleanup generation-safe**
        - Return an ownership handle containing the exact serialized holder bytes, token, and anchor used at
          acquisition.
        - Release only a byte-equivalent holder generation; tolerate an already-gone lock without deleting a newer
          holder.
        - Build `test-first` (one behavior at a time):
            - Same-process siblings, PID reuse, create-before-write windows, and secondary-lock contention cannot
              release or break another generation.
            - Already-gone locks are idempotent and failed cleanup preserves the newer or uncertain holder.

## **Phase 2:** Transient Identity Model and Transactions

_Purpose:_ Upgrade transient identity to a concurrency-safe v3 authority before the locus reader consumes Errand,
grooming, or housekeeping state.

### `[ ]` **2.1 Extend Errand records into the backward-compatible v3 identity union** — D6, D8, D9

- _Goal:_ Ordinary Errands, housekeeping sweeps, and grooming claims share one exact identity model while existing
  v1/v2 Errands remain readable only through their bounded close path during rollout.

    - `[ ]` **2.1.a Define v3 Errand and groom record discriminants**
        - Add a focused identity-record schema module under `packages/arc-framework/src/lib/errand/` rather than
          growing the read/write store into a combined codec, projector, and transaction module.
        - Define strict Zod v1/v2 compatibility arms and v3 `errand`/`groom` unions composed with the locus identity
          vocabulary; export only `z.infer` record types.
        - Give every v3 record an immutable random `claimId` with at least 128 bits of entropy. Enforce slug grammar,
          exact tree-key equality, the reserved `groom-<anchorStub>` namespace, protection/branch, purpose/state,
          `savedHead`, change-request, origin, execute-dispatch, routing-lane, and RFC 3339 timestamp relationships.
        - Give every groom an `anchorStub` plus a non-empty, unique, raw-UTF-8-sorted `members` set containing the
          anchor; keep the set immutable for the claim generation and require the conventional full-mode branch to
          derive from the anchor.
        - Persist immutable `openedBaseHead` from the exact configured-base tip observed after the required base
          refresh and before claim/branch transition so both protection modes have a proof-bearing diff-range
          anchor.
        - Require an immutable canonical `routingPlanDigest` on `housekeep-routing` records and reject it on every
          other identity arm; use the shared `sha256:<64 lowercase hex>` grammar.
        - Build `test-first` (one behavior at a time):
            - Ordinary Errand open/paused/awaiting-merge records round-trip exactly.
            - Inbox-origin Errands enforce exact entry/dispatch pairing; free-description Errands carry neither.
            - Housekeep routing excludes paused state, requires a dispatch ID plus plan digest and `auto | reviewed`
              lane, and full and partial grooms enforce their distinct arms and exact canonical member sets.
            - Claim IDs distinguish otherwise-identical simultaneous records and remain stable across transitions.
            - Tree-key/slug mismatches, reserved-prefix misuse, illegal extra fields, and invalid timestamps reject.

    - `[ ]` **2.1.b Read one exact identity-tree snapshot and project valid records**
        - Add a tip-pinned snapshot reader that distinguishes absent ref, root read error, strict tree-enumeration
          error, and per-entry decode results instead of reading blobs through a ref that can advance mid-scan.
        - Check each tree blob's size before buffering or UTF-8/JSON decoding, require its key to match the embedded
          schema-valid slug, and retain malformed, oversized, unreadable, and unknown-version entries as typed
          diagnostics. A complete snapshot may contain diagnostics, but every mutator rejects such a basis.
        - Convert each valid v3 record to `LocusIdentityV1` through a pure projector that preserves `claimId`. Defer
          managed-row joining and `identity-only` row construction to the Phase 3 roster projector.
        - Build `test-first` (one behavior at a time):
            - Pin every blob read to one tip despite a concurrent ref move.
            - Distinguish clean absence from tip/tree/blob failure and preserve every invalid entry by key.
            - Reject oversized input before blob buffering and detect tree-key/record-slug mismatch.

    - `[ ]` **2.1.c Contain legacy identity records to the close-only compatibility path**
        - Route v1/v2 records only to the existing restore-aware `arc errand close` path; make open, link, leave,
          resume, promote, retire, and abandon refuse them without rewriting or deleting their identity records.
        - Replace single-record reads that collapse unreadable or malformed input into `no-record` with the typed
          snapshot result so a failed read never authorizes creation, mutation, or cleanup.
        - Build `test-first` (one behavior at a time):
            - Legacy v1/v2 close preserves `returnBranch` behavior and every other state-changing verb refuses.
            - Missing, malformed, unreadable, and unknown-version records remain distinct at command boundaries.

### `[ ]` **2.2 Implement complete-basis identity CAS transitions and claim retirement** — D8

- _Goal:_ Every identity transition and cross-key exclusion claim is based on the complete remote/local tree,
  preserves unrelated keys, and cannot blind-upsert over another session or retire an unproven review tail.

    - `[ ]` **2.2.a Generalize identity-tree reads and complete-basis CAS writes**
        - Add a focused identity-transaction module over the Errand ref-tree/CAS seams. With a configured remote,
          fetch the exact ref into a caller-unique temporary ref; treat proven remote-ref absence as an empty basis
          and transport, tip, tree, blob, or cleanup uncertainty as an operational result rather than absence.
        - Reconcile tip-pinned local and remote snapshots per key from their common history so independent additions,
          updates, and deletions survive; refuse divergent changes to the same key. With no configured remote, use
          the same expected-state transform over local CAS only.
        - Let transforms return typed `applied`, `idempotent`, `refused`, or `error` outcomes. CAS-move local state,
          push, and re-enter the idempotent transform from a fresh basis after bounded non-fast-forward or ambiguous
          push outcomes; perform no remote I/O while a locus record lock is held.
        - Build `test-first` (one behavior at a time):
            - Cover independent add/update/delete preservation, same-key divergence, absent remote ref, configured
              remote outage, malformed basis refusal, concurrent retries, and exhausted contention.
            - Cover temporary-ref isolation/cleanup, an ambiguous push that actually landed, retry idempotence, and
              distinct local-only behavior when no remote is configured.

    - `[ ]` **2.2.b Implement exact ordinary-Errand transitions**
        - Add create, late inbox link, pause, await-merge, resume-to-open, promotion retirement, close, and abandon
          transforms requiring the exact previous same-slug record and immutable `claimId`.
        - Prove `savedHead` is the exact terminal head and an ancestor of the fetched remote branch tip before pause;
          validate configured repository/base plus exact current host/base/head coordinates before await-merge.
        - Build `test-first` (one behavior at a time):
            - Cover every legal transition, idempotent replay, stale generation, illegal state edge, and timestamp
              advance without rotating the claim ID.
            - Refuse changed inbox origin/dispatch, unpushed/changed saved heads, stale change-request heads, and
              incomplete identity bases.

    - `[ ]` **2.2.c Implement generation-owned first-writer claims**
        - Make `groom-<anchorStub>` create-if-absent in the global identity-key namespace and scan every live groom's
          canonical member set in the same complete-basis transform. Disjoint sets may proceed; an occupied
          incompatible kind or non-identical overlapping set conflicts, while a losing same-anchor/exact-set retry
          adopts the winner and returns a resume/wait verdict.
        - Pin the refreshed `openedBaseHead` before the claim transform and preserve it unchanged through every groom
          transition; an exact-set loser adopts the winner's `openedBaseHead` rather than substituting its own
          observed base tip.
        - Provide the same complete-tree primitive for housekeep so one live `housekeep-routing` identity blocks a
          second claim across all slugs and machines under full protection. Mint its dispatch ID, persist the
          confirmed `auto | reviewed` lane plus immutable routing-plan digest, permit only monotonic escalation to
          `reviewed`, and adopt a losing retry only when its caller-supplied validated digest matches the winner;
          Phase 5 owns plan parsing/canonicalization and passes the digest into this transaction boundary.
        - On local allocation failure, CAS-retire only the exact unchanged record carrying the claimant's `claimId`;
          surface failed rollback as explicit resume/abandon work.
        - Build `test-first` (one behavior at a time):
            - Cover one winner, same-millisecond claimants, single- and multi-member sets, disjoint concurrent
              claims, exact-set loser adoption, incompatible-kind occupancy, and every partial/full overlap refusal.
            - Cover changed-record rollback refusal, failed rollback recovery, different-slug housekeep races,
              dispatch stability, routing-plan mismatch, and routing-lane downgrade refusal.

    - `[ ]` **2.2.d Gate tail retirement and abandonment on exact host truth**
        - Add a narrow developer-authenticated change-request lifecycle port in shared CLI code rather than treating
          `ReviewProviderAdapter` as lifecycle authority; reuse the argument-array `gh` process seam and validated
          GitHub parsing without pulling review-gate App composition into ordinary commands.
        - Validate the configured repository/base against stored repository/host/base/head coordinates and return
          exactly `merged | open | closed-unmerged | changed-head | missing | ambiguous | unreachable`.
        - Retire only a matching merged change request; allow awaiting-merge abandonment only for exact
          closed-unmerged truth, and refuse every other result.
        - Build `test-first` (one behavior at a time):
            - Cover every lifecycle result, repository/base mismatch, moved head/ref, authentication failure,
              malformed host data, and squash/rebase merge truth independent of branch containment.

## **Phase 3:** Locus Reader and Mutation Core

_Purpose:_ Turn local topology, v3 identity authorities, role records, and process evidence into one deterministic
roster and one generation-safe local mutation boundary.

### `[ ]` **3.1 Acquire and project checkout, identity, workflow, and cursor evidence** — D4, D6

- _Goal:_ One network-free read reports every checkout and identity tail without allowing one malformed row or an
  incomplete authority root to masquerade as a complete machine roster.

    - `[ ]` **3.1.a Acquire topology and authority evidence through bounded I/O ports**
        - Add `packages/arc-framework/src/lib/locus/evidence.ts` over `scanRegisteredWorktrees()`, the locus store,
          locks, worktree markers, WU metas, the complete v3 identity tree, and the process inspector.
        - Pin one successful topology/root snapshot, then run independent record, marker, meta, lock, path, and
          liveness reads through a fixed-concurrency batch helper; perform no fetch, mutation, heartbeat, stale reap,
          or host query.
        - Treat missing `arc.identity`, topology failure, unreadable record roots, and incomplete identity-tree reads
          as envelope errors. Treat an absent identity ref and never-created `loci/` or `.locks/` directories as
          complete empty snapshots; preserve malformed entries and per-checkout failures as source-keyed evidence.
        - Build `test-first` (one behavior at a time):
            - Cover every root-error code, first-use empty roots, partial row degradation, stale records, markerless
              worktrees, recordless transient worktrees, malformed identity entries, orphan locks, and identity-only
              records.
            - Prove the concurrency cap is honored and a failed canonical-path read degrades only its source evidence.

    - `[ ]` **3.1.b Project managed subjects through their existing workflow authorities**
        - Add a checkout-directed subject-meta adapter plus a pure
          `packages/arc-framework/src/lib/locus/roster.ts` projector. Select the exact role/marker WU subject instead
          of invoking the ambient active-session composite or accepting its warning-collapsed candidate scan.
        - Reuse `parseMetaRecord()`, `inferSessionType()`, `resolveTaskListPath()`,
          `resolveTaskListCursorFromFile()`, `resolveActiveCohortDocPath()`, and `resolveLoadSetManifest()` with the
          subject checkout as `cwd`; extract the private planning-stage rule into a shared pure helper.
        - Join transient roles through exact v3 identity kind/key/`claimId` state, and require marker, record,
          identity, owner, and branch evidence to agree before projecting authority.
        - Keep workflow, stage, cursor, and load set derived rather than persisted in the locus record.
        - Surface unresolved or cross-identity subjects as diagnostics without treating record content as authority.
        - Build `test-first` (one behavior at a time):
            - Cover exact WU selection with multiple metas, planning/execution/integration projection, contributor
              roots, cohort load sets, missing/malformed task lists, and checkout-directed Git/filesystem reads.
            - Cover marker/meta/owner/branch disagreement and exact transient identity claim matching.

    - `[ ]` **3.1.c Classify and sort roster rows deterministically**
        - Project provisional `free-primary`, `managed-role`, `identity-only`, `unmanaged-checkout`, `stale-record`,
          `malformed-record`, and `duplicate-locus` rows; the subsequent state derivation performs final frame/state
          enrichment before any public envelope is emitted.
        - Preserve each malformed record, identity entry, orphan lock, and path failure through a bounded diagnostic
          whose source kind/key remains actionable. De-duplicate and sort by code, source kind, then raw source key.
        - Detect physical aliases through `canonicalLocalPath()` and retain every conflicting persisted spelling for
          explicit reconciliation; a non-missing canonicalization failure never fabricates equality or absence.
        - Compare exact persisted strings by raw UTF-8 bytes without Unicode normalization.
        - Build `test-first` (one behavior at a time):
            - Cover every row class, diagnostic source, physical alias, and path-resolution failure.
            - Cover ASCII, multibyte, astral, and canonically equivalent-but-distinct spellings across every ordered
              surface.

### `[ ]` **3.2 Derive frames, primary availability, recovery, and reconciliation verdicts** — D1, D4, D6, D9

- _Goal:_ Session entry and recovery receive one typed interpretation of active, suspended, idle, and residue
  frames instead of rebuilding occupancy or checkout safety from ambient branch state.

    - `[ ]` **3.2.a Resolve the current frame graph and bounded parent edge**
        - Add a pure `packages/arc-framework/src/lib/locus/state.ts` derivation over provisional rows and the entering
          process anchor, then assemble the final `LocusEnvelopeV1` and `LocusStateV1` through one public reader.
        - Mark only conclusively live roles active/suspended; classify a null-lease WU and identity-only tail idle,
          and classify any other non-live managed lease residue while recovery separately treats dead WU replacement
          as safe and unknown liveness as a stop.
        - Resolve current state in D9 order: matching live transient first, then its one legal parent edge, otherwise
          the matching live WU; return explicit none, resolved, or ambiguous without choosing among siblings.
        - Build `test-first` (one behavior at a time):
            - Cover live/null/dead/unknown WU and transient leases, an identity-only tail, warm WU→Errand, cold and
              between-WUs transients, multiple plausible children, invalid parent depth, and unknown liveness.

    - `[ ]` **3.2.b Read directed primary-checkout safety facts**
        - Add a tri-state primary safety probe that pins Git reads to the resolved primary `cwd` and consumes the
          configured base branch rather than ambient process state.
        - Distinguish clean/dirty and on-base/off-base facts; map an unavailable required Git fact to the envelope's
          `git-topology-unavailable` error instead of fabricating dirty or off-base state.
        - Build `test-first` (one behavior at a time):
            - Cover all clean/dirty × on-base/off-base combinations, detached HEAD, configured-base mismatch,
              cross-directory invocation, and each required Git read failure.

    - `[ ]` **3.2.c Derive allocation, in-flight identity, and recovery surfaces**
        - Combine the record-free primary rule with the directed safety facts to produce free, occupied, or unsafe
          availability.
        - Represent a durable role with no lease as occupied with `leaseState: "absent"`; classify an exact primary
          WU role as valid occupied launchpad state, while an unresolved alias, malformed target record, unexpected
          role/branch pairing, or live/unknown target lock remains unsafe rather than free.
        - Project state-appropriate resume/wait/finalize/abandon actions without treating them as mutation
          authorization; derive none/resume/residue/stop recovery from the same state and fixed action ordering.
        - Build `test-first` (one behavior at a time):
            - Cover record-free clean base, an in-place primary WU across every lease state, unsafe
              role/branch/lock/alias state, every identity lifecycle action set, dead transient residue, replaceable
              dead WU entry, and unknown-state stops.

    - `[ ]` **3.2.d Build deterministic reconciliation plans**
        - Emit clean/apply/stop with only adopt-WU, adopt-transient, reap-stale-record, and break-dead-lock actions.
        - Keep the wire actions as deterministic summaries; pair each applicable internal action with exact record
          bytes/generation or lock token/anchor proof for the mutation driver.
        - Stop rather than choose a winner when malformed, unsupported, live, unknown, duplicate, cross-identity,
          unverified-markerless, or unresolved-subject evidence affects the current/primary/selected subject or
          prevents safe alias resolution. Reserve the exact markerless physical-primary WU adoption for Task 6.1.b;
          keep unrelated unmanaged worktrees diagnostic-only.
        - Build `test-first` (one behavior at a time):
            - Cover every action, deterministic ordering, proof attachment, target-scoped stops, unrelated unmanaged
              checkouts, alias-wide ambiguity, and identity-malformed refusal.

### `[ ]` **3.3 Implement lease attach, heartbeat, release, role update, and pop operations** — D3, D4, D6

- _Goal:_ All role and lease changes linearize through one expected-generation API that preserves newer sessions
  and returns one command-independent result shape.

    - `[ ]` **3.3.a Mint durable roles from trusted topology evidence**
        - Add `packages/arc-framework/src/lib/locus/mutation.ts` with mint inputs derived from markers, metas, and
          identity records rather than caller-supplied role/subject values.
        - Copy the exact `claimId` into identity-backed role subjects, including partial grooms, and require null
          for WU, partial-Errand, and partial-housekeep roles; a stale same-key role from another claim generation
          is a conflict rather than an idempotent mint.
        - Carry dispatch ID and origin entry only in partial Errand roles, and dispatch ID plus immutable
          routing-plan digest only in partial housekeep roles; full roles derive that context from identity and
          WU/groom roles require null fields.
        - Make same-role mint idempotent and incompatible existing state a typed refusal.
        - Build `test-first` (one behavior at a time):
            - Cover work-unit, Errand, partial-Errand, groom, and housekeep role pairs, including same-key roles from
              different claim generations and every legal/illegal dispatch-origin-plan pairing.

    - `[ ]` **3.3.b Attach and refresh single-session leases**
        - Mint at least 128-bit lease tokens; bind session home, process anchor, attached time, and heartbeat time.
        - Accept a null lease or exact-token/anchor retry, replace a conclusively dead WU lease on entry, and refuse
          a different live/unknown holder or dead transient residue.
        - Refresh heartbeat only for state-touching calls whose resolved anchor matches the lease.
        - Build `test-first` (one behavior at a time):
            - Cover null attach, exact retry, dead-WU replacement, live/unknown holder refusal, dead transient
              refusal, matching-anchor heartbeat, mismatched-anchor refusal, and read-only non-refresh.

    - `[ ]` **3.3.c Release and update only the expected generation**
        - Require record ID plus lease ID for release; return `lease-generation-mismatch` instead of clearing a
          newer lease.
        - Gate role and parent updates on the same record lock and exact prior role state.
        - Make directed operations mutate the target checkout record rather than the command's current directory.
        - Build `test-first` (one behavior at a time):
            - Cover exact release, lost-response retry, newer-token refusal, same-role update replay, changed-role
              refusal, and cross-directory targeting.

    - `[ ]` **3.3.d Pop roles without weakening preservation rules**
        - Delete only the expected role/lease generation and refuse live/unknown, malformed, newer-role, or
          duplicate-locus state.
        - Return applied/idempotent/refused/error through `LocusMutationResultV1`, including precomposed prompt text
          and nullable allocation, identity, origin-entry, dispatch, restored-parent, and next-offer fields.
        - Build `test-first` (one behavior at a time):
            - Cover exact-generation pop, already-popped replay, changed role/lease refusal, live/unknown vetoes, and
              producer validation of every result arm.

### `[ ]` **3.4 Reconcile WU roles, dead locks, and stale records through expected generations** — D6, D9

- _Goal:_ State-touching entry repairs only locally proven gaps while transient adoption and subject-owned residue
  wait for their marker and operation drivers.

    - `[ ]` **3.4.a Revalidate and apply safe local reconciliation actions**
        - Add a driver that reruns the public reader, resolves one current internal proof-bearing action, and applies
          WU adoption or stale-record reap under the target record lock and exact record generation.
        - Break a dead main lock only through Phase 1's secondary-break protocol after its token/anchor proof remains
          unchanged; never attempt to acquire the main record lock in order to break that same lock.
        - Derive WU adoption only from a matching ARC marker and meta; reap or break only with conclusively dead,
          token-stable evidence.
        - Build `test-first` (one behavior at a time):
            - Cover raced revalidation, changed record bytes, replaced lock holders, malformed/live/unknown refusal,
              unrelated unmanaged worktrees, and retry idempotence.

### `[ ]` **3.5 Expose the read contract through `arc locus`** — D6

- _Goal:_ Humans and workflows can inspect complete locus state through a deterministic command without gaining a
  hidden mutation or heartbeat path.

    - `[ ]` **3.5.a Add the read-only `arc locus [--json]` command**
        - Add `packages/arc-framework/src/commands/locus.ts`, `src/handlers/locus.ts`, and CLI registration following
          the existing status command/handler separation; call the single final reader assembled in Task 3.2.
        - Render checkout path, role/subject, lease state, session home, active locus, and derived workflow/stage in
          human mode; emit exactly one validated `LocusEnvelopeV1` in JSON mode.
        - Build `test-first` (one behavior at a time):
            - Cover deterministic output, stdout/stderr separation, diagnostic success, each root-error envelope,
              exit behavior, first-use empty roots, and proof that reads never mutate records or refresh heartbeats.

## **Phase 4:** Locus Allocation and Transient Provisioning Foundations

_Purpose:_ Allocate primary or spawned loci, establish complete transient provenance, and land the shared inbox
transaction boundary before operation composers consume it.

### `[ ]` **4.1 Build the protection-aware primary-or-spawn allocator** — D1, D7

- _Goal:_ Every transient open gets a safe active checkout without branch-switching a WU workspace or inventing a
  partial-mode fallback that weakens base-branch safety.

    - `[ ]` **4.1.a Resolve allocation from typed availability and live Git guards**
        - Add `packages/arc-framework/src/lib/locus/allocator.ts` over fresh `LocusStateV1`, protection mode,
          requested isolation, and the operation's subject.
        - Return only a primary/spawn proposal or typed refusal; a record-free, clean, base-resting primary does not
          become allocated until the operation coordinator reruns the final reader, acquires its derived record
          lock, and revalidates the proof-bearing target state plus directed Git guards under that owned lock.
        - Keep identity claim/transition and exact-claim rollback outside the local critical section so no remote
          I/O runs under a locus lock. Partial allocation remains primary-only; partial Errand/housekeep are
          identity-free, while a partial groom carries its already-created shared claim through the same boundary.
        - Build `test-first` (one behavior at a time):
            - Cover free primary, every occupied lease state, dirty/off-base state, malformed/duplicate/unknown
              refusal, two recordless-primary contenders, changed Git facts under lock, and remote/local ordering.

    - `[ ]` **4.1.b Extract generic linked-worktree creation and shared setup seams**
        - Extract `packages/arc-framework/src/lib/git/linked-worktree.ts` with `createLinkedWorktree()`: a
          target-agnostic configured-location plus `git worktree add` primitive that returns a proof-bearing creation
          receipt and does not infer or write WU/transient provenance.
        - Extract reusable post-create and registered harness-directory setup from the existing WU mutator without
          changing `reconcileWorktree()` behavior or migrating its callers in this increment.
        - Build `test-first` (one behavior at a time):
            - Cover configured fresh/existing-branch creation receipts, path collision, `git worktree add` failure,
              setup success/failure, and proof that the generic primitive writes no WU/transient provenance.

    - `[ ]` **4.1.c Expose the renamed WU wrapper behind a compatibility alias**
        - Rename the WU-specific API/module to `reconcileWorkUnitWorktree()` and compose its fresh-spawn arm through
          `createLinkedWorktree()` plus the shared setup seam. Keep one narrow compatibility re-export so caller
          migration lands in later increments without an all-repository rename mixed into the boundary extraction.
        - Preserve `--here` as the explicit non-default escape hatch: its base-to-WU transition mints ownership in
          the physical primary, makes that checkout unavailable to transient allocation, and restores base only when
          WU teardown ends the exact generation.
        - Build `test-first` (one behavior at a time):
            - Cover default spawn, explicit in-place conversion/restoration, generic creation composition, unchanged
              teardown behavior, and compatibility-export equivalence in the focused mutator suite.

    - `[ ]` **4.1.d Migrate WU entry and lifecycle-engine callers**
        - Migrate `start`, executor context, lifecycle executor, and their focused command/engine tests to
          `reconcileWorkUnitWorktree()` while the compatibility alias remains available to later verb callers.
        - Preserve spawn-anchored entry, explicit in-place entry, marker/setup ordering, and result typing without
          changing lifecycle policy in this increment.
        - Build `test-first` (one behavior at a time):
            - Cover new/existing WU entry, graduate/start routing, executor context construction, result forwarding,
              and unchanged failure propagation through the renamed boundary.

    - `[ ]` **4.1.e Migrate lifecycle-policy and WU-verb callers, then retire the old name**
        - Migrate lifecycle guards/transitions, `park-resume`, teardown, and their focused WU verb suites to
          `reconcileWorkUnitWorktree()` while preserving every existing in-place, self-teardown, husk, and lifecycle
          policy result.
        - Rename the focused mutator test/module references and remove the compatibility export only after a
          repository-wide symbol search proves no `reconcileWorktree` caller remains.
        - Build `test-first` (one behavior at a time):
            - Keep each policy/verb family green during migration, then run the complete WU lifecycle, verb, and
              mutator suites before retiring the alias.

    - `[ ]` **4.1.f Bind transient placement and partial-mode refusal to the generic primitive**
        - For a spawned full-mode transient, pass a namespace- and generation-qualified placement name such as
          `locus-<role>-<slug>-<claimId>` through the existing worktree-location configuration; preserve the stable
          operation branch name while refusing any final path collision.
        - Under partial protection, refuse when the primary is unavailable; never create another base checkout or a
          synthetic branch.
        - Build `test-first` (one behavior at a time):
            - Cover qualified transient placement, repeated-slug/new-claim paths, stable operation branches,
              configured path collision, occupied-primary spawn, and partial-mode no-spawn refusal.

    - `[ ]` **4.1.g Enforce the directed-command harness boundary**
        - Return active-locus and session-home paths in every successful open result so callers pin Git/filesystem
          work with `cwd` or absolute paths.
        - Derive a pure `directedCommands` capability from a fixed entering-process-anchor table: recognized Codex
          and Claude selectors qualify; every other selector, interactive-shell, shared-host, and unverifiable
          anchors do not.
        - Return `cold-entry-required` with precomposed guidance before identity claim or local allocation mutation
          when warm entry lacks the capability; never move the agent process or human terminal.
        - Build `test-first` (one behavior at a time):
            - Cover Codex/Claude admission, every incapable/unverifiable selector, refusal-before-mutation, and
              successful cross-directory command pinning without ambient `cwd` dependence.

### `[ ]` **4.2 Provision ownership markers, transient roles, and materialized Errand loci recoverably** — D4, D7

- _Goal:_ Every ARC-created transient checkout carries durable provenance and a matching role/lease generation, and
  a partial provisioning failure remains diagnosable rather than markerless.

    - `[ ]` **4.2.a Extend worktree provenance for transient subjects**
        - Evolve `packages/arc-framework/src/lib/git/worktree-marker.ts` so new Errand, groom, and housekeep subjects
          carry their exact `claimId`, plus a transient-only `pending | ready` provisioning discriminant; keep
          claimless legacy transient markers readable but manual-only.
        - Preserve existing WU and husk marker compatibility and keep marker evidence distinct from the live locus
          record. A primary transient role never writes an ownership marker because ARC did not create that checkout.
        - Build `test-first` (one behavior at a time):
            - Exact current subjects and pending/ready transitions round-trip while unknown, malformed, and claimless
              legacy transient markers remain manual-only.
            - WU/branch subjects, husk decoding, and ownership consistency retain their existing compatibility.

    - `[ ]` **4.2.b Extend canonical subject and retirement-receipt codecs**
        - Update `packages/arc-framework/src/lib/canonical/receipt-id.ts` and
          `packages/arc-framework/src/lib/work-unit/retirement-receipt-codec.ts` for the exact transient
          `{ kind, slug, claimId }` variants without granting them a WU retirement transition.
        - Keep canonical digests generation-sensitive and strict decoding backward-compatible for WU, legacy
          Errand, and branch subjects; unknown or claimless transient receipt input remains non-authoritative.
        - Build `test-first` (one behavior at a time):
            - Receipt IDs and codec round-trips distinguish same-slug transient claim generations while preserving
              every existing WU/branch vector.
            - Unknown, incomplete, or illegal transient receipt subjects reject without weakening the retirement
              matrix.

    - `[ ]` **4.2.c Centralize generation-aware subject equality and retirement refusal**
        - Extend `packages/arc-framework/src/lib/work-unit/retirement-authority.ts` so exact transient equality
          includes kind, slug, and `claimId`, and every transient kind remains an unsupported WU retirement subject.
        - Route `packages/arc-framework/src/lib/work-unit/verbs/teardown.ts` and other teardown consumers through that
          shared equality/refusal authority instead of retaining a second local comparison.
        - Build `test-first` (one behavior at a time):
            - Same-generation subjects compare equal, same-slug/different-claim subjects do not, and no transient
              variant gains WU teardown or retirement authority.

    - `[ ]` **4.2.d Project transient provenance into status and cleanup classification**
        - Update `packages/arc-framework/src/lib/session-init/stale-worktree-sweep.ts`,
          `packages/arc-framework/src/lib/session-init/current-husk-advisory.ts`, status projection, and
          `packages/arc-framework/src/lib/git/in-flight-derivation.ts` to preserve pending, ready, legacy, and
          claim-mismatched transient evidence.
        - Keep pending and claimless markers diagnosable but non-adoptable/non-removable; only exact ready provenance
          may participate in the later owned-lock adoption path.
        - Build `test-first` (one behavior at a time):
            - Status and cleanup classify exact ready, pending, legacy, malformed, and claim-mismatched subjects
              without offering unsafe adoption or removal.
            - Existing WU and husk cleanup behavior remains unchanged.

    - `[ ]` **4.2.e Compose a recoverable transient provisioning transaction**
        - Add `packages/arc-framework/src/lib/locus/provisioning.ts` with `provisionTransientLocus()`. For a spawned
          target it calls `createLinkedWorktree()`, verifies the roster entry, writes the exact pending marker before
          fallible post-create/harness setup, promotes only unchanged provenance to ready, then acquires the target
          record lock and mints the exact role/entering lease through the owned-lock mutation seam after final
          revalidation.
        - For a primary target, acquire its record lock before any branch checkout, rerun target-local Git/state
          guards, and mint role/lease in the same critical section without writing an ownership marker.
        - Bind every full-mode transient role to the exact identity `claimId`; never adopt same-key residue from an
          older generation as the newly provisioned role. Accept an already-claimed identity as input but perform no
          identity-ref or other remote I/O while holding a record lock.
        - Return a proof-bearing provisioning receipt containing branch/worktree ownership, marker bytes/state,
          record generation, and lease token. On failure undo only unchanged invocation-owned state; otherwise
          preserve and report identity-only, pending-marker, or marker/record mismatch evidence for reconciliation.
        - Build `test-first` (one behavior at a time):
            - Cover marker-write and post-create/harness failure, crash-visible pending provenance, changed-marker
              rollback refusal, role-mint conflict, lease race, primary branch-checkout failure, exact cleanup,
              incomplete-cleanup evidence, same-key/different-claim conflict, and retry idempotence.

### `[ ]` **4.3 Bind transient adoption after identity and marker provisioning exist** — D6, D9

- _Goal:_ Existing ARC-owned transient worktrees can acquire their missing local roles only after both authority
  domains are readable and mutually consistent.

    - `[ ]` **4.3.a Apply transient adoption through the shared reconciliation driver**
        - Extend the reconciliation action driver to adopt only a ready marker whose Errand, groom, or housekeep
          subject resolves by kind, slug, and `claimId` to the exact v3 identity and live Git checkout; pending and
          legacy claimless transient markers remain diagnosable but non-adoptable.
        - Rerun the final public reader before acquiring the target record lock. Under the owned-lock handle, recheck
          only the proof-bearing marker, roster, record absence/generation, and identity snapshot rather than
          rerunning a reader that would treat the caller's own live lock as contention.
        - Mint only the unchanged derived role; preserve identity-only, pending-marker, or marker/record mismatch
          evidence on races.
        - Build `test-first` (one behavior at a time):
            - Cover WU/transient distinction, incomplete identity reads, pending/legacy/current markers, exact-claim
              mismatch, owned-lock revalidation, changed proofs, raced provisioning, and idempotent adoption.

### `[ ]` **4.4 Establish concurrency-safe USER-INBOX mutation authority** — D8, D9

- _Goal:_ Every later dispatch mark, unbind, and completion removal linearizes through one notes-locked mutation
  seam and returns the exact state it wrote, so operation drivers never race through private read/modify/write loops.

    - `[ ]` **4.4.a Add lock-serialized batch mutation and post-image results**
        - Add a targeted USER-INBOX mutation seam that acquires the identity notes lock and performs one atomic
          same-file replacement for an expected title/source-digest set, including batch dispatch mark/unmark and
          exact completion removal.
        - Route existing `runUserInboxRemove()` through the same discipline. Preserve the visible
          ``- _Disposition:_ `execute-bound` `` and ``- _Dispatch:_ `<dispatchId>` `` grammar and reject changed,
          duplicate, or malformed entry preimages instead of overwriting concurrent notes writes.
        - Return the exact post-image/digest from every mutation so later completion and next-offer logic derives
          from the state actually written; callers still revalidate any selected entry and dispatch generation.
        - Build `test-first` (one behavior at a time):
            - Cover exact batch mark/unmark/remove, already-applied replay, source-digest mismatch,
              missing/duplicate/malformed titles, concurrent remove/mark writers, failed atomic replacement, and
              preservation of unrelated bytes.

## **Phase 5:** Transient Operation Verbs

_Purpose:_ Move Errand, grooming, and housekeeping lifecycle mechanics behind the shared allocator and mutation
result so workflows consume verbs and precomposed verdicts.

### `[ ]` **5.1 Compose the complete ordinary-Errand and promotion lifecycle** — D4, D7, D8

- _Goal:_ An ordinary Errand can execute, adopt an inbox origin, pause, await review, resume elsewhere, complete,
  abandon, or explicitly become a WU through one recoverable lifecycle without displacing or duplicating an active
  parent checkout.

    - `[ ]` **5.1.a Replace in-place Errand open with identity-plus-allocation composition**
        - Refactor `packages/arc-framework/src/lib/errand/open.ts` and
          `packages/arc-framework/src/handlers/errand.ts` so full mode claims identity, allocates a primary/spawned
          locus, provisions marker/role/lease, and returns the shared mutation result.
        - Keep partial mode identity-free and branch-free while occupying only the free primary with a
          `partial-errand` role. Preserve exact inbox origin, entry title, and dispatch binding in the v3 identity
          or partial role.
        - Register `open --json` in `packages/arc-framework/src/cli.ts`; JSON and human rendering consume the same
          producer-validated `LocusMutationResultV1` and precomposed narration.
        - Build `test-first` (one behavior at a time):
            - Cover full/partial opens, free-description and inbox origins, exact dispatch adoption, warm parent
              links, allocation rollback, command-boundary rendering, and v2 no-new-displacement enforcement.

    - `[ ]` **5.1.b Make late inbox linking an exact v3 transition**
        - Refactor `packages/arc-framework/src/lib/errand/link.ts` through the complete-basis transaction so
          `arc errand link` updates only the exact ordinary v3 claim and a live, well-formed inbox capture.
        - Preserve same-entry idempotence; refuse a different existing origin, legacy record, incomplete identity
          basis, changed claim generation, or conflicting dispatch binding.
        - Return `errand-link` through the shared mutation result and register `--json` at the existing CLI command.
        - Build `test-first` (one behavior at a time):
            - Cover free-description adoption, same-link replay, different-link and dispatch conflicts, missing or
              malformed inbox state, v1/v2 refusal, CAS races, and JSON/human parity.

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
        - Add platform-neutral contract tests plus OS-specific live-process, missing-process, PID-token, permission,
          and malformed-output cases behind injected snapshots where native failure states cannot be forced safely.
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
