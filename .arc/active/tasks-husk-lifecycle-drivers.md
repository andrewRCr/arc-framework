# Task List: Husk Lifecycle Drivers

- **Design:** `spec-husk-lifecycle-drivers.md`

---

## **Phase 1:** Canonical digest & serialization foundation

_Purpose:_ Establish the pure, adapter-agnostic hashing and serialization substrate that every receipt,
snapshot, and stamp hashes against — landed before any port or driver consumes it, so the trust core builds on
a verified base.

_Design decisions:_ Lift and generalize the existing `canonicalizePlainJson` + `hashContent` into a neutral
`lib/` home rather than importing from `scripts/review-gate/core/`; every `CanonicalDigest` is `sha256:` plus
exactly 64 lowercase hex; blob digests read canonical Git tree/index bytes after clean filters, never checkout
bytes.

### `[x]` **1.1 Canonical JSON serialization and `CanonicalDigest` primitives**

- _Goal:_ Structured values serialize to one byte-exact canonical form and hash to a `sha256:`+64-hex digest
  that is stable across platforms, Node versions, and checkout settings.

- _Outcome:_ New pure module `lib/canonical/canonical-json.ts` exposing `canonicalize`, `canonicalDigest`,
  `isCanonicalDigest`/`assertCanonicalDigest`, and `sortByCanonicalBytes`. Keys sort by UTF-8 byte order (equal to
  Unicode codepoint order, via `Buffer.compare`) and strings NFC-normalize — correcting the `localeCompare`,
  no-NFC trap in the existing `review-gate/core/identity.ts`, whose serializer was left in place to preserve its
  already-stored policy digests. The generalized version is therefore a fresh neutral module the work-unit layer
  imports, not an in-place lift. A committed golden digest anchors cross-environment stability.

### `[x]` **1.2 Managed-path validation and normalization**

- _Goal:_ Every managed path is validated and normalized to a repository-relative POSIX form before it can
  enter a digest, so a hostile or ambiguous path never reaches hashing or the filesystem.

- _Outcome:_ `lib/canonical/managed-path.ts` — `validateManagedPath` (returning a branded `ManagedPath`) and the
  `isManagedPath` predicate. A non-NFC path is rejected, not repaired, so one file can never address a record
  under two spellings; validation is a total throw-gate that completes before any hashing can begin.

### `[x]` **1.3 Canonical blob and content digests over stored Git bytes**

- _Goal:_ Content digests hash the exact canonical stored bytes so CRLF settings and smudge filters cannot
  change a receipt, and artifact-set and patch-operation entries carry a fixed closed shape.

- _Outcome:_ `lib/canonical/content-digest.ts` — `contentDigest`, `resolveArtifactEntry` over an injected
  `StoredBlobReader`, `writeOperation`/`deleteOperation`, and the closed `ArtifactSetEntry` / `PatchOperation`
  types. The `sha256:`+hex wire format is now factored into a shared `digestBytes` primitive in
  `canonical-json.ts`. Hashing takes stored bytes directly; reading the Git tree/index blob is the injected
  adapter boundary (lands with the drivers), where the LF/CRLF-checkout invariance verifies against real git.

### `[x]` **1.4 Deterministic receipt/preparation IDs and inventory digests**

- _Goal:_ Every ID and inventory digest is a deterministic function of its canonical tuple, so an exact retry
  re-derives the same key and a changed input cannot alias an existing record.

- _Outcome:_ `lib/canonical/receipt-id.ts` — `receiptId`, `preparationId`, `artifactGroupDigest` (path-sorted),
  and the `DISCARD_RESULT` literal-`"absent"` sentinel, plus the `RetirementTransition` union and typed input
  shapes. The typed subject reuses the existing `WorktreeSubject` from `git/worktree-marker.ts` (work-unit /
  errand / branch), so a subject-kind change alters the ID even when text suffixes match. A committed golden
  `receiptId` anchors cross-environment determinism.

## **Phase 2:** Retirement authority port & in-repo adapter

_Purpose:_ Define the narrow authorization port and its in-repo receipt-namespace adapter — the single trust
surface the non-shipped drivers record against and teardown authorizes from — with the shared snapshot,
relation-validation, authorize, and revalidate operations that every transition reuses.

_Design decisions:_ The port's public vocabulary names preservation facts, not lifecycle states; the receipt
namespace is adapter-owned operational state with no package-source mirror; `authorityVersion` is an opaque
compare-and-set token obtained only from `readSnapshot`; workflow logic never branches on the physical record
location. Decompose's `prepareDecompose`/`finalizeDecompose` are declared here but implemented in Phase 4.

### `[x]` **2.1 Port type vocabulary and closed refusal set**

- _Goal:_ The port's public type surface names preservation facts and exposes one closed refusal union, so
  orchestration and rendering branch only on typed codes.

- _Outcome:_ Added the storage-agnostic authority port, preservation/evidence vocabulary, typed worktree-subject
  identity, exhaustive refusal rendering, and the fixed receipt cross-field validator. Decompose signatures expose
  the narrow forward contract while their allocation internals remain reserved for the decompose driver.

### `[ ]` **2.2 Receipt-record namespace and digest-to-record-key codec**

- _Goal:_ Retirement records live under one adapter-owned namespace addressed only through the record-key codec,
  so a `receiptId`, subject, or branch string never becomes an unchecked filesystem path.

    - Build `test-first` (one behavior at a time):
        - `sha256:<64hex>` renders to `sha256-<64hex>` and decodes back bijectively
        - the decoder rejects any other spelling — uppercase, wrong length, or missing prefix
        - the namespace is created lazily on first write and has no package-source mirror
        - a record is addressed only by its derived key; subject/branch text never path-traverses

### `[ ]` **2.3 `readSnapshot` and the versioned compare-and-set token**

- _Goal:_ Every producer obtains its compare-and-set token from `readSnapshot`, and drift in the source ref,
  base ref, record state, or storage version returns `authority-conflict` rather than a stale token.

- _Context:_ The current adapter's snapshot is a canonical digest over source ref/`HEAD`, result ref/`HEAD`, the
  transition-specific inventory, deterministic record-path state, and the clean-index baseline.

    - Build `test-first` (one behavior at a time):
        - the absent-record snapshot returns a `recordState: "absent"` token consumed by abandon and park
        - a changed source ref, base `HEAD`, or record state since the read returns `authority-conflict`
        - the token is opaque and compared byte-for-byte, never reinterpreted as a Git OID
        - no code path derives a token from the composed lifecycle index

### `[ ]` **2.4 Receipt relation validation — `direct-transition` and `unchanged`**

- _Goal:_ Authorization validates the complete transition relation against committed projections rather than
  trusting a receipt's self-claims.

    - Build `test-first` (one behavior at a time):
        - `direct-transition`: the retiring `HEAD` is a single-parent commit atop `source.head` that introduces
          the receipt and matches the non-receipt patch digest
        - `unchanged`: the retiring branch still resolves to `source.head` and a result-side commit introduces
          the receipt with the matching allocation write set
        - an amended, recreated, or later-descendant receipt fails the relation
        - unrelated staged content (a write-set mismatch) fails

### `[ ]` **2.5 `authorize` and `revalidate`**

- _Goal:_ `authorize` returns a typed decision from committed evidence and live ref state, and `revalidate`
  repeats the version and exact-ref checks immediately before any directional operation.

    - Build `test-first` (one behavior at a time):
        - the current-branch teardown path produces only `merged-preserved`
        - a valid non-shipped receipt makes a matching origin remote ref `delete`; only `merged-preserved` may
          `retain`
        - an advanced or foreign-owned same-name branch is `projection-mismatch`
        - remote ref reads resolve to absent, `delete`, or `retain` correctly
        - `revalidate` returns `authority-conflict` on a version or ref change and leaves the worktree branched

### `[ ]` **2.6 `record` — direct-receipt write with version-checked staging**

- _Goal:_ `record` writes a driver's receipt against the read version and refuses any pre-existing staged change
  or path outside the owned transition set, so unrelated content is never legitimized by inclusion in the digest.

    - Build `test-first` (one behavior at a time):
        - a version-matched write records and returns the next `authorityVersion`
        - a changed version returns `authority-conflict` and leaves prior state intact
        - staged paths outside the transition write set are refused
        - the receipt record itself is excluded from `transitionPatchDigest`

## **Phase 3:** Abandon and park-at-Planning drivers

_Purpose:_ Wire the two direct-transition drivers to record version-checked receipts inside their own
transition commit, so an authorized abandon or park-at-Planning preserves the invoking linked session instead
of handing off to `--force`.

_Design decisions:_ Abandon records `discard-confirmed` with the absence sentinel; park-at-Planning adds a
partial-protection `--land <commit>` landing arm distinct from the full-protection park PR flow; both stage the
receipt in the same direct-transition commit; park-at-Active is out of scope and unchanged.

### `[ ]` **3.1 Abandon records a `discard-confirmed` retirement receipt**

- _Goal:_ `arc abandon --yes` records a `discard-confirmed` receipt in the same direct-transition commit that
  removes the artifact group, so an authorized abandon needs no separate `--force` teardown to preserve the
  session.

- _Context:_ Extend `runAbandon` (`abandon.ts`) after its existing destructive-confirmation gate; the result
  digest is the explicit absence sentinel.

- _Note:_ The out-of-band handoff abandon prints (`lifecycle.ts`) moves from `arc teardown <name> --force` to
  the receipt-authorized teardown; `--force` stays a request selector, never authorization.

    - Build `test-first` (one behavior at a time):
        - abandon captures the source branch/`HEAD` and source artifact digest before removal
        - the receipt is staged in the direct-transition commit alongside the artifact-group deletion
        - the result is the explicit `absent` sentinel with `expectedLifecycle: nonexistent`
        - a hand deletion, uncommitted removal, or bare `--force` does not satisfy the later authorization matrix

### `[ ]` **3.2 Park-at-Planning stages a `planning-relocated` receipt on `plan/<name>`**

- _Goal:_ `arc park` stages the `active/ → backlog/planned/` relocation and a `planning-relocated` receipt as
  one direct-transition commit on `plan/<name>` in both protection modes — full protection merges that commit
  through the park PR, partial protection lands it on base via `3.3`.

    - Build `test-first` (one behavior at a time):
        - park stages the `active/ → backlog/planned/` relocation and the receipt in one commit
        - the receipt carries `authorization: planning-relocated` and `expectedLifecycle: planned`
        - park-at-Active is untouched — no receipt, existing pointer-record path unchanged

### `[ ]` **3.3 Partial-protection `arc park <name> --land <commit>` landing arm**

- _Goal:_ `arc park <name> --land <commit>` lets a partial-protection base checkout materialize the parked
  result by validating the planning branch's transition and staging its byte-identical snapshot on the base.

    - `[ ]` **3.3.a Add the `--land <commit>` CLI option and handler wiring**
        - extend `arc park` (`cli.ts`, `handlePark` in `lifecycle.ts`); `--land` drives the partial-protection
          path and is distinct from the full-protection PR flow

    - `[ ]` **3.3.b Validate the exact `plan/<name>` tip and direct-transition relation**
        - the commit must be the local `refs/heads/plan/<name>` tip owned by the registered source worktree
        - Build `test-first` (one behavior at a time):
            - a non-tip commit, a foreign-owned branch, or a broken direct-transition relation refuses

    - `[ ]` **3.3.c Read the receipt and planned artifact group and stage on base**
        - read the exact receipt and complete slug-matched planning artifact group from the transition commit;
          do not create/rewrite a receipt or cherry-pick the branch-relative deletion patch
        - Build `test-first` (one behavior at a time):
            - the staged base snapshot is byte-identical to the branch result
            - a conflicting base slug or a path outside the park result refuses without a partial base write
            - a changed base re-reads under a fresh version and proceeds only if slug/result paths stay
              non-conflicting

### `[ ]` **3.4 Park authorization proof-target and derive-to-`planned` gate**

- _Goal:_ Park authorization accepts only a state where both the retiring branch and effective base derive to
  `planned` and carry the same receipt plus byte-identical planned artifact group, distinguishing a completed
  relocation from a stale pre-start stub.

    - Build `test-first` (one behavior at a time):
        - both the retiring branch and effective base derive to `planned`
        - a stale backlog stub that makes the base derive `planned` without the receipt fails
        - the effective proof target is refreshed `origin/<base>` under full protection and local `<base>` under
          partial protection

## **Phase 4:** Decompose retirement driver (version-2 allocation)

_Purpose:_ Upgrade the decompose cut map from a scratch routing hint into a complete machine contract with
durable preparation, proving one-to-one source-unit and dependency-edge coverage before mutation and again at
finalization, so retirement traces to an accountable allocation.

_Design decisions:_ Schema version 2 replaces per-entry `receives`/`dependsOn` arrays with canonical
`sourceAllocations`/`incomingEdges`/`outgoingEdges` lists; source-unit canonicalization is a fixed CommonMark
preamble/section/whole-file scan; preparation is durable across process interruption; retirement is legal only
for a shape with no surviving origin.

### `[ ]` **4.1 Version-2 `DecomposeAllocationMap` schema and reader**

- _Goal:_ The cut map parses as a schema-version-2 `DecomposeAllocationMap` whose allocation and edge lists are
  complete, closed, and reject any ill-formed or ineligible entry.

- _Context:_ Replace the per-entry `receives`/`dependsOn` arrays (schema version 1, `decompose-cut-map.ts`) with
  the canonical `sourceAllocations`/`incomingEdges`/`outgoingEdges` lists; keep the hand-rolled validator shape.

    - Build `test-first` (one behavior at a time):
        - unknown fields, duplicate destination IDs, and duplicate identities are rejected
        - an incoming replacement target or outgoing consumer that is not a WU-slug member or existing-home
          work-unit is rejected
        - draft blocks, standing documents, and cohort coordination cannot receive WU dependencies
        - at most one cohort-coordination entry may name the declared cohort; a surviving-origin shape is illegal
          for retirement
        - ownerless shared material with no minted cohort-coordination destination is rejected
        - an empty destination set must use a reasoned `drop`; a reasonless drop is rejected
        - a schema-version-1 map returns an upgrade diagnostic and cannot authorize retirement

### `[ ]` **4.2 Markdown source-unit scanner and content locators**

- _Goal:_ A fixed CommonMark scan splits every authored companion into deterministic preamble/section/whole-file
  units addressable by `DecomposeContentLocator`, so allocation coverage is provable.

- _Note:_ Hand-roll a deterministic scanner over the spec's fixed canonicalization rules — no CommonMark/remark
  dependency. The scanner sits in the digest trust path, so its canonicalization stays project-owned and pinned;
  the meta-reader's preamble/heading logic is the closest precedent to generalize.

    - Build `test-first` (one behavior at a time):
        - content before the first top-level H2 is the `preamble` unit; each top-level H2 section with its
          descendants is one `section` unit
        - a Markdown doc with no H2 is one preamble unit; a non-Markdown companion is one `whole-file` unit
        - fenced code blocks do not start sections; both ATX and Setext H2 count
        - `headingSource` normalization removes markers, collapses space/tab runs, trims, and NFC-normalizes,
          preserving case and punctuation
        - `occurrence` is the zero-based index among equal `headingSource` values in an artifact
        - a target locator resolves exactly once; wrong-kind, negative/non-integer occurrence, and
          artifact/declared-target mismatch reject

### `[ ]` **4.3 Live inventory derivation and one-to-one coverage**

- _Goal:_ The CLI derives the stable source-unit and dependency-edge inventories from the live origin and base
  projections, so authored IDs cannot add, omit, or duplicate inventory members.

    - Build `test-first` (one behavior at a time):
        - source-unit, incoming-edge, and outgoing-edge inventories are derived from live projections, not
          authored input
        - complete one-to-one allocation coverage is required — every source unit assigned exactly once
        - `incomingEdgeInventory.currentTargets` retains the parsed `Depends On` order
        - a missing or extra inventory member fails preparation

### `[ ]` **4.4 `prepareDecompose` durable preparation record**

- _Goal:_ `prepareDecompose` atomically writes a durable `prepared-decompose` record at the deterministic path
  before any mutation, and an interrupted run resumes idempotently through the exact locator.

    - Build `test-first` (one behavior at a time):
        - preparation captures origin branch/`HEAD`, base `HEAD`, and all inventory/cut-map digests, then stages
          the record before any transition mutation
        - the returned locator, digests, and next version are the only token accepted downstream
        - a repeat with the same scope and map re-derives the path and returns the stored locator idempotently
        - a changed origin, base, inventory, map, or pre-existing write set refuses
        - a staging failure removes the new record or leaves it discoverable without touching the origin

### `[ ]` **4.5 Mechanical dependency-edge transform**

- _Goal:_ The transform derives each new member's external `Depends On` from `outgoingEdges` and rewrites each
  dependent's origin slot in place, preserving every unrelated prerequisite.

- _Context:_ Extend `repointDependsOn` (`decompose-sweep.ts`) from blanket repoint to slot-precise replacement.

    - Build `test-first` (one behavior at a time):
        - an incoming origin edge is replaced at its existing position with `replacementTargets`; a reasoned drop
          removes only that slot
        - every unrelated prerequisite is preserved; duplicates collapse in first-occurrence order
        - it no longer points every dependent at every new member
        - a dependent without the origin is byte-identical (a pure no-op)

### `[ ]` **4.6 `finalizeDecompose` and the commit-hook record gate**

- _Goal:_ `finalizeDecompose` verifies the completed distribution against the prepared snapshot and atomically
  replaces the preparation with the finalized receipt, and the commit hook rejects any non-finalized decompose
  write set.

- _Context:_ The commit-hook gate lands as a new validator script in `src/scripts/` wired through
  `hook-integration.ts`/`hook-manager.ts` (precedents: `check-foreign-writes.ts`, `validate-cohort-consistency.ts`).

    - Build `test-first` (one behavior at a time):
        - a changed origin ref, base `HEAD`, record identity, storage version, or any inventory/cut-map digest
          refuses
        - every source unit resolves its declared target locator or reasoned drop; every dependent's final
          `Depends On` matches the declared transform
        - staged paths outside the prepared set are rejected; target and patch digests are recomputed
        - the preparation is atomically replaced by the finalized receipt in the same staged base write set
        - the commit hook rejects a missing, prepared-but-unfinalized, amended, or mismatched record

## **Phase 5:** Directional teardown, husk stamp, and replay

_Purpose:_ Replace the shipped-only `allowHusk` switch with port-authorized directional teardown, persist a
self-describing stamp that explains why a husk exists, and add exact `--husk` replay so an interrupted or
repeated retirement can be finished from any registered husk path.

_Design decisions:_ Teardown authorizes and revalidates from the port instead of branching on `mode`/`allowHusk`;
the twelve-step order completes every evidence check before detach and makes post-detach ref operations
projection-safe; the stamp gains a closed presence matrix; replay selects one registered husk path and never
batches same-subject candidates.

### `[ ]` **5.1 Port-authorized teardown replacing the `allowHusk` switch**

- _Goal:_ Teardown obtains its detach authority from `authorize`/`revalidate` instead of `mode === "shipped"`,
  and the shipped driver supplies `merged-preserved` evidence from its existing reap-safety checks.

- _Context:_ Replace the `allowHusk` derivation (`teardown.ts`) and the `assessReapSafety` husk gate with a port
  call; `WorktreeSubject` stays the request identity. The branch-teardown path (`runBranchTeardown`) and the
  primary in-place arm keep working — the port returns `merged-preserved` for those.

    - Build `test-first` (one behavior at a time):
        - a shipped WU authorizes `merged-preserved`; an unmerged non-shipped WU without a receipt refuses
        - teardown branches on the typed decision, never on `mode`/`allowHusk`
        - shipped replay verifies the original base proof OID is still reachable or re-establishes the
          patch-preservation proof; ordinary base advances stay valid

### `[ ]` **5.2 Twelve-step directional teardown ordering**

- _Goal:_ The linked self-teardown runs the fixed twelve-step order so every evidence and authority check
  completes before detach and a pre-detach refusal is mutation-free.

- _Context:_ Reshape `teardownBranchProjection` around the ordered sequence; the user-surface dry run precedes
  the real reconcile.

    - Build `test-first` (one behavior at a time):
        - the clean-tree gate and user-surface dry run run before any mutation; a dry-run refusal mutates nothing
        - the stamp is prepared while still branched, then detach happens at the authorized `HEAD`
        - a late pre-detach authority conflict leaves only idempotent reconciliation and a branched worktree
        - a competing registered/lifecycle projection is re-checked before the remote operation and again before
          local mutation, so a post-detach competitor can only veto the later destructive step
        - a missing/malformed marker or a failed prepared-stamp write is a pre-detach refusal for ARC-managed
          non-shipped worktrees

### `[ ]` **5.3 Projection-safe ref operations**

- _Goal:_ After detach, ref operations honor the persisted remote disposition and compare-and-delete the local
  ref against the authorized OID, leaving the husk intact on any transport, lease, or CAS failure.

- _Context:_ Reuse `deleteRemoteBranch`'s `--force-with-lease` for the remote leg (`reconcile-branch.ts`), but
  the local compare-and-delete is a new primitive — the existing `reconcileBranch` local delete is `git branch -D`
  (force, no OID operand), so it cannot carry the authorized-OID CAS. Drive both off the persisted disposition,
  not the current `mode` fork.

    - Build `test-first` (one behavior at a time):
        - `remote: null` performs no remote delete; `delete` uses force-with-lease at the exact authorized OID
        - `retain` re-confirms the remote still resolves to the authorized OID before local deletion; an absent
          or changed preservation ref leaves the local ref and husk
        - local deletion runs `git update-ref -d refs/heads/<branch> <authorized-oid>`; a failed CAS leaves the
          moved ref and stamped husk
        - a competing projection introduced between remote resolution and local CAS blocks the local deletion and
          leaves the stamped husk with the completed remote outcome
        - a transport/auth failure or a stale lease leaves the husk intact and manual-only

### `[ ]` **5.4 Self-describing stamp extension and presence matrix**

- _Goal:_ `WorktreeHuskStamp` persists `authorization`/`remoteRef`/`evidence` with a closed presence matrix, so
  a reader selects a destructive mode only from a fully-present current stamp.

- _Context:_ Extend the interface and runtime guards in `worktree-marker.ts`; optionality is read-compatibility
  only.

    - Build `test-first` (one behavior at a time):
        - an all-absent legacy stamp decodes authorization as `merged-preserved` and grants no remote-delete
          authority
        - a legacy stamp proceeds only after a fresh read confirms the named remote ref is absent; otherwise it
          is manual-only
        - an all-present current stamp decodes directly; every mixed-presence combination is manual-only
        - an unknown future authorization/evidence string preserves ownership and exact-husk recognition but is
          manual-only
        - a non-string authorization or malformed remote/evidence is malformed
        - a prepared stamp on a still-branched worktree is not terminal

### `[ ]` **5.5 Marker evidence resolution and revalidation on replay**

- _Goal:_ Replay resolves a stamp's receipt evidence from the transition-specific authoritative locus and
  revalidates the relation, never trusting cached WU state.

    - Build `test-first` (one behavior at a time):
        - abandon/park evidence resolves by `receiptId` from the exact stamped commit tree and revalidates the
          direct-transition relation
        - decompose evidence resolves from the effective result projection and revalidates the finalized
          allocation relation
        - a missing or mismatched record is manual-only

### `[ ]` **5.6 `arc teardown <name> --husk <path>` exact replay selection**

- _Goal:_ `arc teardown <name> --husk <absolute-path>` selects exactly one registered husk by path, and the
  unqualified command works only when one candidate matches.

    - Build `test-first` (one behavior at a time):
        - the selector matches the exact detached path, a valid marker + terminal stamp, the requested subject,
          the stamped branch, `HEAD === stamp.sha`, and a clean worktree
        - it never selects a branched worktree or a same-slug candidate of another subject kind
        - the unqualified command stays compatible for one candidate; multiple same-subject husks refuse with one
          path-qualified command each

### `[ ]` **5.7 Replay execution order and competing-projection veto**

- _Goal:_ Replay runs remote disposition, then local CAS, then physical cleanup in creation order, exempting
  only the exact evidence-matched result and vetoing on a competing live projection.

    - Build `test-first` (one behavior at a time):
        - lifecycle comparison exempts only the evidence's expected planned/completed/nonexistent result; any
          other same-branch candidate vetoes
        - a registered branched worktree on the stamped branch vetoes before any ref mutation
        - a competitor found after the remote outcome leaves the local branch and husk and reports the remote
          result
        - a same-OID live restart with no registered/lifecycle owner stays governed by the exact OID lease/CAS
        - inside-husk replay does no physical removal; outside replay reconciles user surfaces first

### `[ ]` **5.8 Integration and E2E round trips**

- _Goal:_ The composed teardown/driver/session-init surface is exercised end-to-end across the named round trips,
  so a regression in the integrated flow fails a check rather than surfacing only in production.

- _Context:_ New integration/E2E coverage over the composed system — distinct from the per-unit test-first lists
  in Phases 1–6 and from the verification phase (which runs the gate suite but authors no tests). Author one
  round trip per scenario:

    - linked abandon leaves a readable stamped husk and reaps the discarded projection
    - full-protection and partial-protection (`--land`) park-at-Planning each round-trip to a stamped husk
    - symmetric decompose retires the origin and lands the finalized allocation
    - shipped remote-only preservation retains the sole-proof remote ref
    - interrupted decompose preparation/finalization resumes idempotently through the persisted locator
    - interrupted remote cleanup leaves the husk intact and replay completes it
    - a restarted same-slug work unit cannot let an old husk delete the restarted projection

## **Phase 6:** Linked-session cleanup awareness

_Purpose:_ Make the current husk, sibling husks, and orphan refs reachable from the linked sessions where
parallel-work operators actually run — without enabling the broader primary/no-WU discovery or completion-tail
probes — so a correctly-created non-shipped husk is never invisible.

_Design decisions:_ `currentHusk` drops the local `completed/` membership requirement and decodes the extended
stamp; a private cleanup-only roster lifts the network-free presence tier of both sweeps onto linked resume arms
without publishing the general `roster` slot; team-mode `spawningIdentity` filtering is preserved; cleanup stays
offer-only with no nudge marker or persistent write.

### `[ ]` **6.1 Non-shipped `currentHusk` current-locus surface**

- _Goal:_ `currentHusk` recognizes a linked branchless husk without requiring `completed/` membership and
  surfaces its decoded authorization, validated evidence, remote proof, stamped branch, and exact path.

- _Context:_ Relax `deriveCurrentHuskAdvisory` (`current-husk-advisory.ts`) to drop the `completed.has(...)`
  requirement; the advisory subject stays work-unit (the non-shipped drivers all produce work-unit subjects).
  The advisory gains the decoded authorization, evidence, remote proof, stamped branch, and path fields.

    - Build `test-first` (one behavior at a time):
        - a linked, branchless, marker-valid, exact-stamped/live-`HEAD` worktree is recognized with no completion
          record
        - a known authorization renders delete-vs-retain and the exact outside-worktree path-qualified command
        - an unknown authorization suppresses the generic detached-HEAD warning but stays manual-only
        - untrusted evidence falls back to ordinary detached-HEAD guidance

### `[ ]` **6.2 Cleanup-only private roster for linked scans**

- _Goal:_ A private cleanup-only roster feeds the linked sweeps without publishing the general `roster` slot or
  feeding any recovery, `workUnitState`, materialization, or completion-tail consumer.

    - Build `test-first` (one behavior at a time):
        - the roster receives the resolved developer identity and shipped `team.mode` setting
        - it is not exposed as the `roster` slot and does not feed recovery, `workUnitState`, or materialization
        - the current worktree's exact path is excluded so `currentHusk` remains its sole owner

### `[ ]` **6.3 Sibling-husk and orphan-ref presence sweeps on linked arms**

- _Goal:_ The network-free presence tier of `sweep` and `orphanBranchSweep` runs on linked resume arms, with
  team-mode ownership filtering and identity-neutral orphans.

- _Context:_ Lift the primary-only gate (`runStaleWorktreeSweep`/`findStaleWorktreeCandidates` in
  `stale-worktree-sweep.ts`, `runOrphanBranchSweep` in `orphan-branch-sweep.ts`) onto the linked path via the
  private roster; `sweep`/`orphanBranchSweep` name the envelope slots, not functions. No network or
  completion-tail fan-out.

    - Build `test-first` (one behavior at a time):
        - sibling husks gain path, decoded authorization, validated evidence (or manual-only reason), remote
          proof, subject, branch, and the removable/blocked/outside decision
        - team mode omits husks stamped by a different `spawningIdentity`; a linked scan with no identity emits no
          actionable worktree batch and does not widen the scan
        - orphan reports stay `{ branch, merged, shippedWorkUnit }` and never display an owner; an unmerged
          non-shipped orphan without a stamped husk stays manual-only
        - the scan is network-free and does not activate materialization or completion-tail calls

### `[ ]` **6.4 Linked `Cleanup residues` envelope batch and gating**

- _Goal:_ A linked session renders one conditional `Cleanup residues` batch of sibling husks and orphan refs
  that appears while a real residue remains and performs no persistent write when the scan is empty.

- _Context:_ Add the slot to the envelope (`run.ts`, `types.ts`, `handlers/status.ts`) gated on linked identity;
  primary sessions keep their separate `Stale worktrees` and `Branch orphans` sections.

    - Build `test-first` (one behavior at a time):
        - a linked session with residue emits the combined batch with path-qualified offers and blocked/manual
          labels
        - an empty machine-local scan emits no section and performs no persistent write
        - primary rendering parity is unchanged and no broader roster consumer is enabled

### `[ ]` **6.5 Session-init workflow and reference-surface updates**

- _Goal:_ The session-init workflow and reference surfaces document the linked cleanup section and the new
  command forms, with methodology edits landing in the package source and synced to `.arc/`.

- _Note:_ Documentation and methodology change — test-after; validated by the package/project sync check and
  markdown lint.

    - `[ ]` **6.5.a Add the linked `Cleanup residues` rendering to the session-init workflow**
        - edit the package-source workflow first, then sync to `.arc/` per the two-copy discipline

    - `[ ]` **6.5.b Update reference surfaces touched by the new command forms**
        - reflect `arc teardown --husk` and `arc park --land` where CLI command forms are documented

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Authorized linked abandon, park-at-Planning, and decompose retirement leave the invoking harness in a
  readable detached checkout stamped with exact subject, branch, `HEAD`, authorization, evidence identity, and
  remote disposition.
- `[ ]` Every non-shipped detach traces to a version-checked driver receipt whose source, transition patch,
  result, and relation match committed projections; `--force`, snapshots, or derived state alone never authorize
  it, and decompose additionally traces to a durable preparation covering every source unit and dependency edge.
- `[ ]` Missing, malformed, ambiguous, stale, unconserved, uncommitted, or projection-mismatched evidence
  refuses before detach with a typed reason; a late authority conflict leaves at most idempotent user-surface
  reconciliation.
- `[ ]` A present remote ref is deleted only with its exact authorized lease, retained and re-confirmed when it
  is the sole preservation proof, and never inferred from legacy absence.
- `[ ]` Local ref deletion always compares against the authorized OID; replay exempts the exact
  evidence-matched planned/completed result but leaves a moved ref untouched; a competing projection found before
  the remote operation prevents both ref mutations, while one found afterward prevents only local mutation and
  leaves the path-addressable husk with the completed remote outcome.
- `[ ]` Stamp preparation completes before detach for ARC-managed non-shipped worktrees; a stamp-write failure
  leaves the checkout branched; branchless plus exact stamped/live `HEAD` remains the terminal-recognition
  condition.
- `[ ]` Repeated same-subject husks are individually selectable with `--husk <absolute-path>`; unqualified
  teardown works only for one exact candidate and never batches ambiguous candidates.
- `[ ]` Session-init from any linked worktree identifies an exact current husk and batches real sibling
  husks/orphan refs with authorization/ref-aware, path-qualified offers or manual-only labels; the current path
  is never duplicated; team-mode `spawningIdentity` boundary and missing-identity narrowing hold.
- `[ ]` Primary cleanup behavior remains available, linked cleanup does not enable broader roster consumers, and
  an empty machine-local residue scan emits no section and performs no persistent write.
- `[ ]` Legacy stamps and shipped markerless cleanup retain their safe behavior; unknown future authorization or
  evidence values stay recognizable but cannot trigger destructive automated replay.
- `[ ]` The feature adds no lifecycle state, meta schema, user-notes machinery, nudge/claim state, storage
  configuration, or storage-mode branch in workflows.
- `[ ]` All quality gates pass (unit, integration, E2E, type, lint, build, package/project sync, documentation).
- `[ ]` Ready for integration

---
