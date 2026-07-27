# Task List: Decompose Durable Consumers

- **Design:** `spec-decompose-durable-consumers.md`

---

## **Phase 1:** Terminal decomposition reference semantics

_Purpose:_ Remove false narrative noise while preserving every structured or ambiguous integrity signal.

### `[ ]` **1.1 Reuse the shared terminal transition resolution**

- _Goal:_ Only ordinary prose backed by one unique terminal decomposition becomes silent.

    - `[ ]` **1.1.a Narrow the narrative branch**
        - In `planReferenceReconcile()`, omit a narrative advisory only when the existing
          `resolveReferenceTransition()` returns `kind: "decompose"`, including a unique rename-to-decompose chain.
        - An absent transition produces no special authority; corrupt, ambiguous, or cyclic evidence retains its
          current conflict.

    - `[ ]` **1.1.b Preserve structured authority**
        - Keep backticked artifact findings, dependency reconciliation, rename/removal advisories, edits, ordering,
          and apply guards unchanged. Add no session-init-local filter.

    - `[ ]` **1.1.c Test at proportional homes**
        - Cover plain/mixed prose, structured artifacts, rename, removal, rename-to-decompose, competing outcomes,
          and absent subjects in `reference-reconcile.test.ts`.
        - Add only narrative-clean and structured-pending composition cases to `current-wu-reconcile.test.ts`.

## **Phase 2:** Bounded complete receipt enumeration

_Purpose:_ Make Git process count independent of durable record count without weakening namespace validation.

### `[ ]` **2.1 Batch the exact listed objects**

- _Goal:_ One listing and one object batch preserve every namespace path.

    - `[ ]` **2.1.a Add the stdin-capable batch seam**
        - Keep one recursive `ls-tree`, parse and UTF-8-byte-sort raw entries, and read unique listed OIDs through
          one length-delimited `git cat-file --batch` request.
        - Do not force stdin through `GitExec` or use `--batch-all-objects`, shell piping, a cache, or a persistent
          helper.

    - `[ ]` **2.1.b Reconstruct entries, not only objects**
        - Map fetched bytes back to every original path so two names sharing one OID remain distinct validation
          inputs.
        - Bound nonempty enumeration to two Git subprocesses and empty enumeration to one.

### `[ ]` **2.2 Preserve the closed validation boundary**

- _Goal:_ Batching changes transport cost, not public meaning.

    - `[ ]` **2.2.a Reuse existing codecs and outcomes**
        - Pass every reconstructed entry through `validateRetirementRecordEnumeration()`, the receipt codec, and
          preparation decoder.
        - Preserve `namespace-corrupt`, `version-conflict`, canonical-ID result order, and the Git process rejection
          boundary; add no malformed-entry taxonomy.

    - `[ ]` **2.2.b Fail closed on protocol corruption**
        - Reject missing/wrong-type objects, truncated headers/content, invalid lengths/bytes/JSON, unsolicited or
          duplicate responses, and response-order disagreement.

### `[ ]` **2.3 Verify batching at the correct tiers**

- _Goal:_ Command shape, semantic validation, and real repository fan-out each have one test owner.

    - `[ ]` **2.3.a Extend adapter unit tests**
        - Prove fixed call count, shared-OID preservation, and batch protocol failures in
          `git-retirement-record-enumeration.test.ts`.

    - `[ ]` **2.3.b Preserve enumeration and reachability integration**
        - Extend `retirement-record-enumeration.test.ts` for malformed/duplicate parity and add one many-receipt
          wrapped-executor case to `retirement-disposition-reachability.test.ts`.

## **Phase 3:** Live remote ancestry and leased cleanup

_Purpose:_ Delete only a live remote source ref proven not to contain unique work, under the existing exact lease.

### `[ ]` **3.1 Materialize one live remote tip**

- _Goal:_ Stale tracking refs cannot grant cleanup authority.

    - `[ ]` **3.1.a Extend the Git authorization adapter**
        - Observe the live remote OID, fetch/materialize without trusting a tracking ref, verify the observed commit
          remains readable, and classify it against the exact local source head.
        - Ref movement or an unavailable object refuses with retry guidance.

    - `[ ]` **3.1.b Keep policy in retirement authorization**
        - Accept absent, equal, or strict ancestor; refuse descendant, divergent, moved, unreadable, or unavailable
          state.
        - Preserve the existing `RemoteRefProof` OID/disposition and add no receipt field or durable proof ref.

### `[ ]` **3.2 Reuse the expected-OID deletion lease**

- _Goal:_ Mutation consumes the authorized object without another compare/delete implementation.

    - `[ ]` **3.2.a Thread the observed OID unchanged**
        - Preserve it through authorization revalidation and teardown into the existing
          `deleteRemoteBranch()` force-with-lease path.

    - `[ ]` **3.2.b Preserve retryable state on failure**
        - Keep `deleted | absent | stale`; stale or transport failure retains the remote, local branch/head, and
          husk/worktree and vetoes later cleanup. Absent remains idempotent.

### `[ ]` **3.3 Prove one real bare-remote matrix**

- _Goal:_ The ancestry/lease boundary is tested once without a transform E2E cross-product.

    - `[ ]` **3.3.a Extend focused teardown integration**
        - Cover absent/equal/ancestor success, descendant/divergent refusal, and movement between authorization and
          deletion. Assert exact preservation/deletion and no publish-only-to-delete traffic.

    - `[ ]` **3.3.b Retain primitive lease coverage**
        - Keep the existing low-level stale-lease test and add no duplicate E2E race.

## **Phase 4:** Verification

### `[ ]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Only uniquely resolved terminal-decomposition narrative is silent.
- `[ ]` Structured references, dependencies, rename/removal advisories, and conflicts retain current behavior.
- `[ ]` Complete receipt validation uses fixed Git process fan-out with stable path and canonical-ID ordering.
- `[ ]` Shared OIDs, malformed entries, and duplicate identities cannot disappear during batching.
- `[ ]` Teardown admits absent/equal/ancestor remote state and refuses unique, raced, or unavailable remote work.
- `[ ]` Concurrent movement and transport failure preserve every retryable ref/projection.
- `[ ]` No new receipt schema, cache, acknowledgement, cleanup record, or deletion primitive is added.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
