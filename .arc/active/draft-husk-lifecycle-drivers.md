# Draft: husk-lifecycle-drivers — authorized non-shipped husks and reachable cleanup

- **Origin:** `worktree-teardown-decoupling` deferred the pre-merge lifecycle drivers; FP wave-3 then showed that
  primary-only cleanup surfaces are invisible to operators working from linked worktrees.
- **Purpose:** Make authorized non-shipped worktree retirement preserve the live session on a self-describing husk,
  then surface that husk and any retained orphan ref from the linked sessions where parallel-work operators reside.

---

## Problem / Motivation

`worktree-teardown-decoupling` made shipped self-teardown safe: after preservation and user-surface gates pass, the
linked worktree detaches, receives a terminal stamp, reaps its refs, and stays alive as a disposable husk. The shared
projection still disables husk mode for unshipped teardown, so two lifecycle exits retain the deleted-cwd failure:

- **Abandon:** `arc abandon` commits the destructive decision on the WU branch, then `arc teardown --force` removes
  that branch and worktree. From the WU's linked session, physical removal strands the harness in a deleted cwd.
- **Park at Planning:** the park ceremony first makes the authored artifacts durable in `backlog/planned/`, then
  reaps the obsolete `plan/<name>` projection out of band. Running that cleanup through a base-checkout subprocess
  does not prove that the parent harness has left the linked WU worktree; physical removal can reproduce the same
  cascade.

The existing husk transition cannot simply reuse shipped preservation. Abandon is authorized by an explicit discard
decision; park-at-Planning is authorized only after the planning artifact set is durably relocated. Those proofs must
remain distinct through creation, replay, and operator messaging.

Cleanup visibility also assumes sequential-era session placement. `sweep` and `orphanBranchSweep` are primary-only,
but spawned-worktree operation keeps the operator in linked sessions. FP wave-3 observed the concrete failure: a
shipped husk remained invisible until hand-discovered. New non-shipped husks would inherit the same blind spot.

## Resolved Direction

### One end-to-end cleanup concern

Keep the work in one WU: authorized non-shipped self-teardown must be both safe and discoverable. The visibility leg
is limited to stamped husks and orphan branches—the cleanup residues this WU produces or consumes. FP's broader
errand and completion-tail awareness seam stays with FP Task 7.3 and `session-locus-model`.

### Proof-specific husk authorization

Replace the shipped-only `allowHusk` switch with a narrow teardown-authorization port. This is the boundary between
the teardown orchestrator and whichever storage adapter can prove the retiring transition; it is not a proposed
global ARC storage abstraction. Its vocabulary is deliberately limited to the terminal projection facts teardown
needs:

```ts
type HuskAuthorization = "merged-preserved" | "discard-confirmed" | "planning-relocated";

interface RetirementReceipt {
  schemaVersion: 1;
  receiptId: string;
  subject: WorktreeSubject;
  transition: "abandon" | "decompose" | "park-planning";
  source: { branch: string; head: string; artifactDigest: string };
  transitionPatchDigest: string;
  retiringProjection: { kind: "direct-transition" } | { kind: "unchanged" };
  authorization: Exclude<HuskAuthorization, "merged-preserved">;
  result:
    | { kind: "discard"; artifactDigest: "absent" }
    | { kind: "decompose"; cutMapDigest: string; targets: ReadonlyArray<{ path: string; artifactDigest: string }> }
    | { kind: "relocate"; plannedArtifactDigest: string };
}

interface TeardownAuthorizationRequest {
  subject: WorktreeSubject;
  branch: string;
  head: string;
  remote: string;
  requestedMode: "shipped" | "abandoned";
}

type TeardownAuthorizationDecision =
  | {
      status: "authorized";
      authorization: HuskAuthorization;
      authorityVersion: string;
      refs: { localOid: string; remote: { remote: string; oid: string } | null };
    }
  | { status: "refused"; reason: TeardownAuthorizationRefusal };

interface RetirementAuthorityPort {
  record(
    receipt: RetirementReceipt,
    expectedAuthorityVersion: string,
  ): Promise<{ status: "recorded"; authorityVersion: string } | { status: "refused"; reason: TeardownAuthorizationRefusal }>;
  authorize(request: TeardownAuthorizationRequest): Promise<TeardownAuthorizationDecision>;
  revalidate(
    request: TeardownAuthorizationRequest,
    proof: Extract<TeardownAuthorizationDecision, { status: "authorized" }>,
  ): Promise<{ status: "valid" } | { status: "refused"; reason: TeardownAuthorizationRefusal }>;
}
```

`TeardownAuthorizationRefusal` is a closed semantic set:
`unsupported-transition | evidence-missing | evidence-mismatch | projection-mismatch | conservation-unproven |
preservation-unproven | authority-unavailable | authority-ambiguous | authority-conflict`. Adapters may attach
diagnostic detail, but workflow and teardown branching use the code. The concern-specific port records non-shipped
lifecycle evidence, authorizes the exact teardown request, then revalidates the returned authorization and opaque
`authorityVersion` against the live branch/`HEAD` immediately before detach. It is not ARC's future global storage
API. The authorization kinds are mechanical preservation facts, not new WU lifecycle states:

- **merged-preserved:** the existing shipped driver; `assessReapSafety` proves the branch contents durable.
- **discard-confirmed:** the abandon/decompose driver; an explicit destructive decision authorizes dropping the
  unmerged projection.
- **planning-relocated:** the park-at-Planning driver; the lifecycle resolver proves the full planning artifact set
  is durably materialized in the planned tier before the old branch projection can detach.

Every driver keeps the existing pre-detach gates: clean worktree, complete dry-run of identity-global user-surface
reconciliation, reconcile, and authority revalidation against the live branch/`HEAD`. After revalidation, teardown
atomically extends the existing valid ownership marker with the exact `HEAD`, known authorization, and authorized
remote-ref proof (`{ remote, oid }` or explicit `null`) **while the worktree is still branched**; a missing/malformed
marker or stamp-write failure refuses before detach. It then runs `git switch --detach <authorized-head>`. Consumers
recognize a terminal husk only when the checkout is branchless and its live `HEAD` matches the stamp, so a detach
failure leaves a harmless prepared stamp on a still-branched worktree; a retry freshly reauthorizes and may replace
it. No post-detach write is required.

A refusal never detaches or reaps the projection. A dry-run refusal is mutation-free; a late authority conflict can
leave only the already-completed, idempotent user-surface reconciliation and still leaves the worktree branched.
After detach, a present remote obligation is resolved first through the already-supported force-with-lease path with
the proof's exact OID. Deleted or already-absent resolves the obligation; a stale lease leaves the moved/recreated
remote untouched and makes the husk manual-only; transport/auth failure leaves both the exact local ref and stamped
husk for retry. Only after the remote obligation resolves does local ref removal run as an atomic compare-and-delete
(`update-ref -d` with the authorized local OID). A moved/recreated local ref fails its CAS and the exact stamped husk
remains discoverable; absence is the idempotent no-op.

Keep `--force` as the compatibility-preserving non-shipped teardown request, but do not treat the flag itself as
authorization. The command supplies `requestedMode: abandoned`; the port must still return a matching versioned
retirement proof tied to the exact retiring projection (`subject`, branch, and `HEAD`). A state read from only the
invocation checkout is insufficient.

Each non-shipped lifecycle driver writes a structured `RetirementReceipt` through the same narrow port. The receipt
is created only after that driver's existing confirmation/conservation gate, binds the exact source branch/`HEAD` and
source artifact digest, names a unique receipt, hashes the driver's complete non-receipt transition write-set, and
describes both the result and the allowed retiring projection. `transitionPatchDigest` is the canonical digest of
every path/blob/delete operation in that write-set excluding the receipt record itself, avoiding a self-referential
commit hash while rejecting unrelated content smuggled into the retirement commit. In the current in-repo adapter the
receipt is a tracked internal operational record committed atomically with the lifecycle result; in Local/backend it
is the same record in canonical materialized storage, written against the version the driver read. It is not a user
note, git note, branch-name inference, or CLI assertion. Cross-repo Local/backend application is intentionally
eventual: if the receipt and materialized projection have not both converged, authorization returns
`authority-conflict` and cleanup waits for reconcile rather than attempting two-phase commit.

The adapter must bind the request to the exact allowed post-transition code projection; recomputing a fresh authority
version over an arbitrary descendant is forbidden. `direct-transition` means the requested retiring `HEAD` is a
single-parent commit directly atop `source.head` that first introduces this receipt and whose complete non-receipt
diff hashes to `transitionPatchDigest`. `unchanged` means requested `HEAD === source.head`; the result-side commit
that introduces the receipt must carry the matching transition patch digest. Today abandon and park-at-Planning use
`direct-transition`, while decompose uses `unchanged` for its untouched origin and verifies the finalized base-side
allocation commit. A descendant, merge, amended write-set mismatch, or second receipt introduction refuses even when
the lifecycle snapshots still converge. A Local/backend adapter records the equivalent exact code-projection
relation in the canonical event version; whether the result happened to create a code-repo commit is adapter-owned,
not a workflow mode branch.

The current adapter requires a valid receipt plus exact committed snapshots:

- **Park at Planning:** `arc park` records `planning-relocated` with the pre-relocate source digest, complete
  transition patch digest, direct-transition relation, and resulting planned artifact digest. The retiring branch
  derives to `planned` after that exact committed relocate, the effective base also derives to `planned`, and the
  full slug-matched planning artifact set and receipt are conserved at base. This distinguishes the landed relocate
  from the stale pre-start backlog stub that can make base derive to `planned`.
- **Abandon:** the confirmed `arc abandon --yes` transition records `discard-confirmed` in the same commit as the
  artifact removal. The receipt's source matches the direct transition commit's parent, its patch digest covers the
  whole removal write-set, and the retiring branch now derives to `nonexistent`; a hand deletion, descendant commit,
  uncommitted removal, or stale base stub cannot synthesize the missing receipt.
- **Decompose retirement:** the receipt binds the exact still-planning origin branch/`HEAD`, the validated cut-map
  digest, and every final allocation target. Because the workflow permits manual distribution after scaffolding, its
  existing pre-ship verification gains a receipt-finalization call that hashes the final staged target artifact sets;
  commit refuses a prepared/unfinalized receipt. The origin uses the unchanged relation; the effective base must
  contain the finalized receipt in the matching allocation write-set, all target digests, and an absent origin before
  the exact untouched origin projection can retire.
- **Shipped:** retiring branch and refreshed base derive to `shipped`, with the existing `assessReapSafety` durability
  proof, producing `merged-preserved`.

Every other combination, and every ambiguous or degraded read, refuses. The adapter also verifies that the live local
branch still resolves to the requested `HEAD`; a same-name branch recreated or advanced after the transition is a
`projection-mismatch`, not a cleanup target. This keeps one CLI door while making the typed authorization a
fail-closed output of transition evidence rather than a second user assertion.

The in-repo `authorityVersion` is a deterministic digest of the receipt/store version and identity, the exact
retiring-projection relation, retiring `HEAD`, transition patch and artifact facts (including an explicit absence
sentinel), and any live remote-ref OID—not the whole base commit. Unrelated base advances therefore do not invalidate
a proof, while a change to the retiring ref, remote projection, receipt, its claimed write-set, or the slug's
authoritative artifact set does. Callers treat the digest as opaque. `WorktreeSubject` remains the request type
because recordless branch husks share the projection machinery: their current adapter can produce only
`merged-preserved` through git durability; the reserved errand subject returns `unsupported-transition`.

The snapshot matrix is the current adapter, not the durable contract. Under Local/backend storage, the same port
reads the canonical lifecycle record or transition receipt and its expected version: park proves a committed
artifact-group relocation, abandon/decompose proves the corresponding tombstone/retirement event, and shipped proves
the completed record while `assessReapSafety` still protects the git projection. The pre-detach call revalidates the
opaque authority version and exact projection identity. A conflict refuses; it never turns a stale read into
permission. No workflow branches on storage tier, no proof depends on `storage.track_design_docs`, and no new
storage/config axis is introduced.

Run each non-shipped teardown from the retiring linked checkout after its conservation action is clean and durable.
Abandon already has that locus. Park-at-Planning and post-merge decompose return to the origin worktree for teardown;
the resolver reads the effective base without checking it out. That makes the existing self-husk boundary truthful
instead of assuming that a CLI subprocess run from the base proves the parent session left the linked worktree.

Park-at-Planning gets an explicit two-locus delivery choreography. `arc park` runs and commits the relocate + receipt
on `plan/<name>`, where the WU-owned `active/` source resolves and the parent session remains. Under full protection,
that exact planning branch is pushed and merged through its park PR; under partial protection, the base checkout
squash-merges the planning branch and makes the direct base commit. The effective proof target is refreshed
`origin/<base>` under full and local `<base>` under partial. Only after that target contains the byte-identical
artifact group and receipt does the still-running WU session invoke teardown. Park-at-Active retains its existing
base-owned pointer choreography and is unchanged.

### Self-describing terminal stamp

Extend the machine-local husk stamp with optional persisted fields named `authorization` and `remoteRef`. New writers
must supply a known `HuskAuthorization` plus either the authorization proof's exact `{ remote, oid }` or explicit
`null`; optionality exists only so legacy stamps remain readable. The authorization read boundary accepts any string
so a future value does not invalidate the surrounding ownership marker, then normalizes it through this separate
discriminated view:

```ts
type DecodedHuskAuthorization =
  | { kind: "known"; value: HuskAuthorization }
  | { kind: "unknown"; value: string };
```

An absent `authorization` is a legacy stamp and normalizes to known `merged-preserved`. A known field normalizes
directly. An unknown future string remains an exact stamped husk but is manual-only: it cannot select a destructive
cleanup mode and does not make ARC-created ownership provenance malformed. For `remoteRef`, object and explicit-null
are the new schema; absence means legacy remote proof is unavailable. Non-string `authorization`, malformed
`remoteRef`, or invalid existing stamp fields remains malformed. ARC still never mints or repairs ownership
provenance during teardown. The stamp write is the pre-detach prepare step above; branchless + exact stamped `HEAD` is
what makes it terminal.

The stamp remains a projection fact—what authorized this exact worktree/HEAD to become disposable—not authoritative
WU state. It continues to carry the typed subject and exact branch, and downstream state checks use the lifecycle
resolver rather than inferring from branch names or branch existence. The authority version is an input to the
directional transition, not stamp schema: once detached at the exact stamped `HEAD`, later canonical state changes
cannot rewrite what authorized that projection.

Replay is stamp-directed and projection-safe. A known authorization selects the matching request mode
(`merged-preserved` uses the default; either non-shipped value uses `--force`), but the cleanup command still verifies
the exact stamp, clean detached `HEAD`, and current ref identity. New stamps replay the persisted remote obligation
first with an exact lease; transport/auth failure retains the husk and local ref for retry, while a stale lease leaves
the changed remote untouched and keeps the husk manual-only. Only deleted/already-absent remote plus an exact local
ref permits local CAS deletion and physical husk cleanup. A same-name local ref at another SHA is left untouched and
also leaves the husk manual-only. A legacy stamp with no remote proof never deletes a remote: it requires a fresh
read-only confirmation that the named remote ref is absent before physical cleanup, and otherwise stays manual-only.
Unknown authorization is surfaced for manual cleanup only. Thus a later WU restart cannot cause an old husk replay to
delete the restarted projection, and a retryable remote-only failure cannot disappear with its last local witness.

Replay selection is exact when repeated retirements produce more than one husk for the same subject. Add
`arc teardown <name> --husk <absolute-worktree-path>` (and the corresponding optional `huskPath` API input). The
selector is canonicalized against the registered-worktree roster and must resolve to that exact detached path, valid
ownership marker, subject, stamped branch, and live/stamped `HEAD`; it never selects a branched or merely same-slug
worktree. The unqualified command remains backward-compatible when exactly one candidate matches. With multiple
matches it refuses and session-init renders one path-qualified command per exact husk—never newest, oldest, or all.

To preserve those invariants, teardown resolves an exact matching detached candidate before applying the current WU
lifecycle gate. A known stamp is the replay proof for that already-completed directional detach; mutable current WU
state cannot reclassify it. With no matching stamped candidate, teardown follows the ordinary authorize/revalidate
path above. The stamp never authorizes a different path, branch, `HEAD`, or ref OID.

### Reachable cleanup awareness

Keep cleanup in the existing session-init fire line rather than introducing a new knowledge surface or mandatory
hygiene command:

- Extend `currentHusk` with `authorization: DecodedHuskAuthorization`. Recognition requires the valid ARC ownership
  marker, branchless locus, and exact stamped/live `HEAD`; it no longer requires local `completed/` membership, which
  cannot describe non-shipped terminal projections. An exact known stamp renders the projection reason
  (`merged-preserved`, `discard-confirmed`, or `planning-relocated`), any persisted remote obligation, and the exact
  path-qualified outside-worktree cleanup command; an unknown value suppresses generic detached-HEAD guidance but
  stays manual-only. The current locus always surfaces.
- Lift the network-free presence tier of `sweep` and `orphanBranchSweep` to linked resume arms. Resolve a private,
  cleanup-only roster for this linked scan rather than publishing the general `roster` slot; do not feed
  `workUnitState`, materialization, recovery, or any broader completion-tail consumer. Exclude the current worktree's
  exact path from both branched and detached sibling reports so `currentHusk` remains its single owner.
- Extend a swept husk report with the same decoded authorization, persisted remote obligation, and exact worktree path
  so every offer selects one candidate. Existing branch-orphan payloads stay `{branch, merged, shippedWorkUnit}`: they
  describe local-ref hygiene, and do not fabricate a lifecycle reason when no stamp exists. Non-shipped unmerged
  orphans therefore remain visible but manual-only unless a matching exact husk replay owns their safe reap.
- Preserve the primary session's existing separate stale-worktree and branch-orphan surfaces. On a linked resume,
  render sibling husks and orphan refs as one conditional `Cleanup residues` batch, including counts, labels, and the
  same offer-only commands/blocked reasons. Emit it on every session-init while at least one actual residue remains;
  emit nothing when both probes are empty.
- Keep every cleanup action offer-only. No occupancy inference or automatic physical removal lands here;
  `session-locus-model` owns future lease-backed automation.

Cleanup awareness carries no nudge budget, claim operation, marker, or identity-global write. Its persistence is the
residue itself: successful cleanup makes the next local scan empty. This removes any notes/backing-store coupling from
the visibility leg and leaves the existing reminder/staleness `NudgeMarkerState` consumers unchanged.

The sweep inventories themselves remain machine-local projection reads over registered worktrees and local refs.
When a cleanup label needs WU lifecycle truth, it queries the same storage authority; unavailable or private state
degrades to an unclassified, manual-only residue rather than branch-name inference or a destructive guess.

## Alternatives

- **Treat `--force` itself as generic authorization and infer the terminal reason later:** smallest internal change,
  but collapses discard and relocation proofs and makes replay/messages depend on mutable artifact location. Rejected;
  `--force` remains only the compatibility-preserving request, while refreshed lifecycle state supplies the proof.
- **Authorize relocation from `planned` state alone:** reuses the lifecycle enum directly, but a pre-start
  `backlog/planned/` stub can survive on base while the live branch holds newer artifacts. State equality would allow
  teardown before those artifacts were conserved. Rejected; relocation also proves the full artifact-set equality.
- **Reuse `resolveComposedLifecycleIndex` for the proof:** that oracle intentionally lets a live worktree candidate
  outrank a planned tree record so start/status cannot mint a duplicate branch. Teardown needs the opposite question:
  exact transition snapshots and explicit read quality. Rejected as the wrong consumer posture.
- **Make code-repo ref snapshots the proof contract:** sufficient for today's in-repo tier, but operational state and
  authored design may live only in the backing store, depending on storage tier and `storage.track_design_docs`.
  Rejected; ref comparison is one adapter behind a storage-authority port.
- **Treat committed snapshot convergence as receipt-equivalent:** avoids a new record, but cannot distinguish an
  explicitly confirmed abandon or conserved decompose from an arbitrary committed deletion reaching the same state.
  Rejected; non-shipped drivers emit a transition-specific receipt and snapshots verify its claimed result.
- **Persist a separate remote-residue marker:** makes a failed remote delete discoverable, but adds another mutable
  status surface with reconciliation and retirement semantics. Rejected; the already-required terminal stamp carries
  the authorized remote ref/OID, and the husk remains the retry witness until that obligation resolves.
- **Clean every same-subject husk as a batch:** avoids a selector, but one stale or malformed candidate would make
  all-or-some semantics ambiguous and a restarted WU could be swept accidentally. Rejected; replay selects an exact
  registered worktree path and keeps the singleton command only when it is unambiguous.
- **Rate-limit linked cleanup through a marker or generic nudge claim:** reduces repeated guidance but creates a
  mutator and storage contract for a condition already represented by the residue itself. Rejected; one conditional
  batch per linked init is bounded, disappears when cleanup succeeds, and adds no notes/backing-store state.
- **Keep stamps proof-agnostic and re-run the lifecycle resolver during every cleanup:** avoids a marker field, but a
  later lifecycle move can no longer explain what authorized the original directional detach. It also weakens
  offline replay. Rejected.
- **Add only a hygiene view/verb:** runnable from anywhere, but discoverability still depends on remembering to invoke
  it—the wave-3 failure. A future view may consume the same probes; it does not replace session-init awareness.
- **Keep primary-only sweeps:** preserves the old latency boundary but leaves the observed blind spot intact. Rejected.
- **Move the whole visibility concern to `session-locus-model`:** keeps this WU mechanically narrow but allows the new
  drivers to ship with no reachable cleanup backstop. Rejected; occupancy-aware auto-removal still stays there.

## Unknowns and Assumptions

- **Settled—proof resolver API:** the teardown-specific authorize/revalidate port returns the typed authorization,
  opaque authority version, exact ref OIDs, and semantic refusal code above; its record operation captures the
  non-shipped driver's evidence. The current adapter composes a valid receipt, exact retiring-projection relation,
  complete transition patch digest, retiring/base matrix, and artifact comparisons. `buildLifecycleIndex` stays
  cwd-local and pure; the concurrent composed oracle is not reused.
- **Settled—stamp vocabulary:** `authorization` stores the three projection-fact values above; legacy absence maps to
  `merged-preserved`, and unknown future strings stay valid ownership evidence but manual-only cleanup evidence. New
  stamps also carry the authorized remote ref/OID or explicit null; missing legacy remote proof never authorizes a
  remote delete.
- **Settled—replay identity:** `--husk <absolute-worktree-path>` selects one exact registered terminal candidate;
  unqualified teardown is retained only for the singleton case. Remote obligation, local CAS, then physical cleanup
  is the retry order, with a changed or unverifiable ref retaining a manual-only husk.
- **Settled—linked fire site:** linked cleanup uses a private roster and always-conditional batch, so it neither grows
  a nudge contract nor causes the published `roster` / `workUnitState` completion-tail consumers to fire.
- **Assumption:** linked stale-worktree and orphan scans remain network-free and bounded over registered worktrees /
  local refs; live PR sharpening and the broader completion-tail oracle remain outside this WU.
- **Constraint—git-notes stop-loss:** `RELEASE-GATES.md` classifies notes as an interim bridge and forbids new
  notes-specific machinery beyond keep-the-lights-on. This WU adds no notes marker, lock consumer, reconcile arm, sync
  behavior, or notes-shaped persistence contract.
- **Constraint—storage forward compatibility:** lifecycle authority is an injected teardown-specific port; code-repo
  snapshots are the current-tier adapter only. Canonical records/transition receipts and opaque versions lift to the
  materialized backing store without changing teardown or session-init workflow logic. Cleanup inventories remain
  deliberately machine-local projection reads.

## Success Signals

- After an authorized linked abandon, park-at-Planning, or decompose retirement, the invoking session remains in a
  readable detached checkout whose stamp names the exact subject, branch, `HEAD`, authorization, and authorized
  remote ref/OID or absence; safe ref cleanup may finish or retry without deleting a recreated projection.
- Every non-shipped authorization traces to a driver-authored, version-checked receipt whose source and result match
  the committed projections, whose full non-receipt transition patch is exact, and whose direct-child/unchanged
  relation rejects later descendants; snapshot convergence or `--force` alone never yields authority.
- Missing, ambiguous, degraded, stale-version, dirty, unconserved, or projection-mismatched evidence never detaches
  the worktree or deletes its refs, and produces a typed refusal that the CLI can explain.
- Stamp preparation fails before detach, every local/remote ref delete uses an expected OID, and unresolved remote
  work blocks local/husk cleanup; a write failure, transport failure, or racing ref movement leaves a
  branched/prepared worktree or path-addressable husk/orphan rather than an unstamped, hidden, or wrongly reaped
  projection.
- Session-init in any linked worktree identifies an exact current husk and batches real sibling husks/orphan refs with
  authorization/ref-aware path-qualified offers or manual-only labels; repeated same-subject husks remain separately
  actionable, and the batch disappears after the local residue is cleaned.
- Primary-session cleanup behavior remains available, linked cleanup does not enable broader completion-tail
  awareness, and the feature creates no user-notes/nudge state or storage-mode branch.

## Scope Estimate

**Medium implementation surface; `Class: Heavy` working estimate.** The design composes shipped teardown, lifecycle
resolution, marker compatibility, and session-init probes rather than inventing a new model, but correctness spans
enough coupled trust boundaries that a real design and substantial verification map are required. Keep one WU unless
grounding reveals that linked-session hygiene needs a general-purpose subsystem rather than the bounded re-gating
above.

## Draft Readiness

**State:** formalization-ready.

- **Resolved:** end-to-end WU boundary; proof-specific authorization; durable proof on the machine-local stamp;
  `--force` as a request whose authorization is derived fail-closed through a versioned storage-authority port;
  artifact-set conservation for park-at-Planning; linked-session presence-tier awareness; storage-neutral reuse of
  a private cleanup roster; exact stamp compatibility, ref-obligation replay, and repeated-husk selection semantics;
  exact transition-result binding; no occupancy automation, new notes/nudge state, storage axis, or broader FP
  awareness scope.
- **Open:** none. Two full adversarial passes were folded; the final pass's remote-residue, repeated-husk, and
  post-transition-head findings are resolved in the settled direction above.
- **Next:** capture the draft and advance to `create-spec` after the workflow interlock.

---
