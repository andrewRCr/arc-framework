# Spec (`detailed` · `RFC`): decompose-durable-consumers

- **Origin:** [internal]

- **Purpose:** Keep long-lived consumers of finalized decomposition evidence quiet, bounded, and conservative as
  receipt history grows, without changing transform authoring or lifecycle authority.

---

## Introduction / Context

Once the v3 retirement core ships, several existing consumers continue operating long after candidate creation:
current-work-unit reference reconciliation, complete retirement-record enumeration, and receipt-backed source
cleanup.

Their current behavior is safe but increasingly costly or noisy. Ordinary historical prose can trigger dangling
advisories after a valid decomposition; Git enumeration starts one object process per record; and teardown refuses
a remote source ref that is safely behind the exact local source. These are durable-consumer concerns, not reasons
to enlarge the transform core.

This work unit depends only on `decompose-transform-integrity`. It consumes canonical finalized receipt decoding,
terminal transition resolution, and retirement authorization. It does not change v3 authoring, finalization, or
landing.

## Goals

1. Suppress only ordinary narrative references resolved through one unique terminal decomposition.
2. Enumerate every retirement namespace entry with Git subprocess count independent of record count.
3. Preserve existing malformed/duplicate validation outcomes under batching.
4. Authorize absent, equal, or strict-ancestor live remote cleanup against the exact source head.
5. Reuse the existing expected-OID deletion lease so every concurrent move wins.

## Non-Goals

- Change cut-map, preparation, receipt, finalization, landing, overlay, classifier, or launch contracts.
- Add a receipt migration, new schema field, pruning, expiry, acknowledgement state, cache, daemon, or compaction.
- Add a narrative severity, prose classifier, suppression registry, or session-init-local filter.
- Add a cleanup ledger, lock, token, server API, tracking-ref authority, or publish-only-to-delete flow.
- Duplicate the existing force-with-lease deletion primitive or full transform E2E matrix.

## Proposed Design

### Terminal narrative resolution

`planReferenceReconcile()` already separates backticked artifact references from ordinary narrative and uses the
shared transition resolver for unique rename/removal/decomposition history.

Only the narrative branch changes: when `resolveReferenceTransition()` returns `kind: "decompose"`, ordinary prose
about that historical identity produces no advisory. A unique rename chain ending in decomposition qualifies.
Rename and removal retain advisories; corrupt, competing, ambiguous, or cyclic evidence retains fail-closed
conflict behavior.

Backticked artifacts, structured dependencies, dangling-artifact findings, edits, ordering, and apply guards are
unchanged. Session initialization continues projecting the shared plan and gains no second filter.

### Complete batched enumeration

Enumeration performs:

1. one recursive `ls-tree` over the complete receipt namespace;
2. UTF-8 byte sorting of every raw tree entry;
3. one injected stdin-capable, length-delimited `git cat-file --batch` read for the unique listed OIDs; and
4. reconstruction of one validation entry per original path.

Object fetches may deduplicate OIDs; namespace entries never deduplicate. Successful results retain canonical
receipt-ID ordering. A nonempty enumeration uses at most two Git subprocesses and an empty namespace one.

Every reconstructed entry passes through the existing storage-agnostic validator, receipt codec, and preparation
decoder. Structural/codec failures remain `namespace-corrupt`, divergent same-ID bytes remain
`version-conflict`, and Git process failures retain their rejection boundary. Missing, wrong-type, truncated,
unsolicited, duplicate, length-mismatched, or reordered batch responses fail closed.

No cache, `--batch-all-objects`, shell pipe, persistent process, mutable index, pruning, or new diagnostic taxonomy
is introduced.

### Live remote ancestry

Receipt-backed cleanup still requires the exact local source head and the shared integration-anchor fact. The core
derives that fact at the exact prepared base; `decompose-base-mobility` extends the same fact to a descendant
current base when available. This work unit depends only on the core and does not require mobility for exact-base
cleanup. The Git authorization adapter:

1. observes the live remote source-ref OID;
2. materializes that exact object locally without trusting a stale tracking ref;
3. verifies the observed object remains readable and stable; and
4. classifies it against the exact local source head.

`authorizeRetirement()` remains the sole policy owner. Absent, equal, and strict ancestor authorize; descendant,
divergent, moved, unreadable, or unavailable state refuses. The driver supplies Git facts only and does not
re-decide receipt or lifecycle meaning.

### Existing deletion lease

The authorized observed OID flows unchanged through revalidation and teardown to the existing explicit
force-with-lease deletion:

```text
git push <remote> \
  --force-with-lease=refs/heads/<branch>:<observed-oid> \
  :refs/heads/<branch>
```

`deleted | absent | stale` remains the result. Stale or transport failure preserves the remote, local branch/head,
and retryable husk/worktree projection and vetoes later cleanup. Absent is an idempotent no-op.

## Alternatives & Rationale

### Add a historical-prose acknowledgement marker

Rejected because the terminal transition resolver already contains the needed authority.

### Cache or prune receipts

Rejected because the measured problem is per-record process fan-out, not storage volume.

### Trust a remote-tracking ref for ancestry

Rejected because it may lag the live deletion target.

### Check then issue an unleased delete

Rejected because the remote can move between observation and mutation. The existing explicit lease closes the
race.

## Cross-cutting Considerations

- **Compatibility:** existing public validation categories and current non-decompose receipt meaning remain
  unchanged; decomposition-specific authority is canonical v3 only.
- **Safety:** all consumer changes are conservative; ambiguity, process failure, and ref movement refuse.
- **Performance:** ordinary enumeration has a fixed one-listing/one-batch process bound.
- **Testing:** policy matrices remain unit-level; one many-receipt repository and one bare-remote matrix prove the
  external boundaries.
- **Rollout:** current noise, process cost, and conservative ref retention remain safe until this member lands.

## Success Criteria

- Plain narrative is silent only for one uniquely resolved terminal decomposition.
- Structured artifacts, dependencies, rename/removal advisories, and invalid-history conflicts retain current
  behavior.
- One and many receipts validate completely with fixed Git process count and stable ordering.
- Shared-OID paths, malformed entries, and duplicate identities cannot disappear under batching.
- Remote cleanup accepts absent/equal/strict-ancestor state and refuses descendant/divergent/unavailable state.
- Concurrent movement or transport failure preserves every retryable ref and projection.
- No new receipt state, cache, acknowledgement, cleanup record, deletion primitive, or transform authority is
  added.

## Open Questions

[none]
