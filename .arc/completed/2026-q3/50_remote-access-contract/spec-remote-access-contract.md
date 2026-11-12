# RFC: remote-access-contract

- **Origin:** [internal]

- **Purpose:** Make session-init's code-repository remote evidence read-only, request-scoped, and explicit about
  evidence quality. One bounded remote-head snapshot feeds every in-scope analyzer; metadata writes occur only in
  explicit fetch, pull, sync, or materialization actions, where denial is visible and retryable.

---

## Introduction / Context

`arc status --session-init --json` currently gathers fresh branch evidence by running several fetches. Those
fetches update remote-tracking refs, `FETCH_HEAD`, temporary refs, or the object database in the shared Git common
directory. In a linked worktree under a conservative sandbox, the code repository and network can both be readable
while the shared `.git` directory is not writable. The probe then collapses local metadata denial into
`remote-unavailable`, even though `git ls-remote` can reach the remote and the local checkout is healthy.

The affected session-init surfaces are worktree sync, base distance, base-branch sync, full-protection
user-reference authority, and the no-active-work-unit discovery arm. Fetch side effects also freshen tracking refs
that other analyzers silently treat as remote truth, so deleting the obvious fetch calls without re-parameterizing
their consumers would create stale but apparently exact results.

The composite probe exits successfully when these slots degrade. That behavior is correct for a diagnostic
envelope, but it means a harness that escalates only failed commands cannot distinguish a remote outage from a
locally denied metadata write. The remedy is to remove metadata writes from the passive probe, not to grant the
whole CLI broad sandbox authority or add harness-specific escalation logic.

## Goals

- Make every in-scope session-init code-repository remote read free of Git metadata writes.
- Acquire remote branch truth once per probe through a bounded, non-interactive `ls-remote` invocation and share
  the immutable result across dependent slots.
- Preserve today's exact analysis when the advertised remote objects already exist locally.
- Prevent passive local inspection from activating Git's promisor lazy-fetch machinery, and withhold graph-derived
  exactness when a shallow repository lacks the history needed to prove the relation.
- Represent reachable-but-unmaterialized and unreachable evidence distinctly, without publishing a stale local
  relation as current remote truth.
- Keep local-safe orientation and planning usable when remote evidence is pending or unreachable, while preserving
  fail-closed behavior for destructive or authority-granting operations.
- Move object materialization and tracking-ref mutation to explicit actions whose failures are visible to the
  caller and harness.
- Keep the contract harness-agnostic, storage-forward-compatible, and expressed through typed CLI verdicts rather
  than workflow prose that reconstructs state.

## Non-Goals

- Reworking the git-notes user-sync probe. Its temporary-ref comparison remains an interim limitation pending the
  materialized operational-state substrate.
- Reworking the transient Errand-record read under `refs/arc/user/<identity>/errands`; it has the same recorded
  substrate disposition as user notes.
- Adding a sandbox mode, permission configuration axis, automatic privilege escalation, or allow rule for a
  specific agent harness.
- Making remote-only operations succeed offline. Push, pull, materialization, integration authority, and remote
  cleanup proof still require reachable and sufficient evidence.
- Changing ARC's co-development target into support for autonomous or isolated cloud execution.
- Adding compatibility aliases or migrations for the pre-public-release envelope shapes changed here.

## Proposed Design

### 1. Request-scoped remote-head snapshot

Extend `packages/arc-framework/src/lib/git/remote-ref-reader.ts` as the single remote-read boundary. It will expose
a bounded snapshot operation with this internal result shape:

```text
available   = { kind: "available", scope: "exact" | "all-heads", tips: RefTipMap }
unreachable = { kind: "unreachable", failureReason: RemoteFailureReason }
not-needed  = { kind: "not-needed" }

RemoteFailureReason = "timeout" | "network" | "auth" | "error"
```

The reader uses `GIT_TERMINAL_PROMPT=0`-equivalent subprocess behavior and the existing bounded invocation
discipline. Its process boundary pins Git diagnostics to the stable C locale before classifying stderr. Timeout is
detected from cancellation. Network and authentication classes are assigned centrally from stable Git failure
signatures; an unclassified execution or malformed-response failure is `error`. A successful exact query that
omits a requested ref proves that the ref is absent—it is not a read failure.

Session-init always requests the complete branch-head listing through one `git ls-remote --heads origin`
invocation. This is necessary because exact omission of the current branch is what reveals the branch-gone arm, and
that arm immediately needs complete remote membership to derive recovery candidates. Selecting an exact query first
would therefore require a second read after discovering the branch is gone.

The handler resolves the current branch, configured base, worktree identity, and active work-unit state locally and
projects the required refs from the all-heads result. The shared reader retains its exact-ref operation for passive
non-session consumers that know their required branch before acquisition, but session-init never dynamically narrows
its scope. `not-needed` applies when remote sync is disabled or local inspection proves that no remote is
configured. An unexpected local remote-configuration inspection failure is not equivalent to no remote; it remains
an internal prerequisite failure that each dependent slot reports through its runtime probe boundary.

User notes and the excluded transient-record ref may still perform their existing independent remote operations;
“one read” means one all-heads snapshot for the code-repository surfaces governed by this RFC, not one network
process for the entire envelope.

### 2. Local object availability and public evidence quality

After snapshot acquisition, check each distinct advertised OID through a read-only local object query such as
`git cat-file --batch-check`. No ref is created and no object is fetched. This guarantee is enforced rather than
inferred: `GitExecOptions` gains an opt-in local-only object-access mode, `GitExecInput` and the byte-preserving raw
executor accept that mode, and all three production execution seams prepend Git's global `--no-lazy-fetch` option
and set `GIT_NO_LAZY_FETCH=1`. Every passive object, graph, tree, blob, index, and retirement-record read governed by
this RFC opts in. Explicit materializing operations and the excluded user-notes reader keep their existing
acquisition behavior.

The global option and client-side environment guard are upstream capabilities from Git 2.45, so the package's
minimum Git version rises from 2.31 to 2.45. Local-only invocations use both mechanisms: the option makes an older or
otherwise incompatible Git fail before it can execute the object-reading subcommand, while the environment is
inherited by nested Git processes. Ordinary and explicit-action executor calls retain their existing argv and
environment.

The batch helper returns either a complete OID-to-local-commit availability map or an internal unavailable result
that distinguishes execution failure from malformed output. Absence and non-commit objects are complete negative
availability facts. An unavailable batch result is a local probe failure, not remote evidence: each dependent slot
whose conclusion requires a present advertised object reports the existing runtime probe error through its
`safeProbe` boundary. A successful snapshot still proves exact branch or remote-base absence without consulting
object availability. The unavailable result never fabricates `pending-fetch` or `unreachable`, and independent
local or snapshot-only slots remain usable.

The same boundary applies to unexpected local analysis failures after availability is established. A failed or
malformed graph, blob, or retirement-record read propagates to the caller's runtime probe error rather than being
relabeled as remote evidence. Typed slot values represent established remote evidence and expected domain outcomes;
unexpected local execution failures remain probe failures.

The handler also inspects `git rev-parse --is-shallow-repository` once and carries an internal complete-or-shallow
history prerequisite beside the availability map. Failure or malformed output is a local prerequisite failure.
Shallow history does not weaken facts established without traversal: complete snapshot omission, OID equality, and
local-ref absence remain usable. A slot that needs ancestry, distance, reachability, patch identity, commit-date
ordering, or another graph traversal may publish an exact result only when local history is complete; under shallow
history it reports the existing runtime probe error through `safeProbe` rather than fabricating a relation or adding
a remote-evidence state.

Every reworked public slot gains a required `remoteEvidence` qualifier:

```text
"exact" | "pending-fetch" | "unreachable" | "not-applicable"
```

- **`exact`** means the remote snapshot succeeded, every advertised object required for that slot's analysis is
  local, and any required graph traversal has complete local history; alternatively, the result follows without
  traversal from complete snapshot absence, OID equality, or another explicitly local fact.
- **`pending-fetch`** means the remote OID is known but at least one required object is absent locally.
- **`unreachable`** means the remote-head read failed; `failureReason` is required.
- **`not-applicable`** means no remote comparison was requested or possible, such as disabled sync or no remote.

The core worktree and base relation vocabularies remain intact. When exact relation analysis is impossible, those
slots retain their existing unavailable state or verdict and `remoteEvidence` carries the distinction. Dependent
surfaces may add an outcome only where their existing shape cannot represent incomplete evidence, specifically
branch-gone recovery's `pending` and `unproven` arms and completion-tail `mergeability-unavailable`.
`pending-fetch` never carries a `failureReason`; `unreachable` always does. Runtime schemas enforce those pairings.

The probe does not publish ahead/behind values computed against a stale tracking ref as though they describe the
advertised remote OID. A pending-fetch result uses neutral counts and a precomputed refresh recommendation. This is
intentionally less decorative than a last-known relation and more trustworthy: after the explicit fetch, the next
probe computes the exact relation.

### 3. Reworked analyzers

The snapshot and object-availability map are injected into pure analysis functions. Process execution stays at the
handler boundary; relation and recommendation logic stays in `src/lib`.

1. **Worktree sync**
   - Preserve the local upstream configuration check. Disabled sync, detached HEAD, no remote, and no configured
     upstream retain their existing states with `remoteEvidence: not-applicable`. For a tracked branch, resolve
     branch existence from the snapshot; a missing exact ref becomes `branch-gone` without parsing fetch stderr.
   - Run the existing ref-parameterized ahead/behind analysis against the advertised OID when local.
   - Return the existing unavailable state with `remoteEvidence: pending-fetch` when the OID is not local, or
     `remoteEvidence: unreachable` plus `failureReason` when the snapshot failed.

2. **Base distance**
   - Advisory mode analyzes the advertised base OID directly when local.
   - Delete the `refs/arc/base-drift/<token>` fetch, refmap suppression, cleanup pass, and
     `temporary-ref-cleanup-failed` outcome.
   - When the base object is missing, return the existing unavailable verdict with a new
     `base-object-pending-fetch` reason and `remoteEvidence: pending-fetch`.
   - When a complete snapshot proves the configured base is absent, return the existing unavailable verdict with
     `unavailableReason: remote-base-absent`, `baseOid: null`, neutral counts, and `remoteEvidence: exact`. Surface
     the configuration/remote mismatch; do not offer a fetch for a ref that does not exist.

3. **Base-branch sync**
   - Compare the local base OID with the advertised base OID without refreshing `origin/<base>`.
   - Equal OIDs are exact and clean. A differing remote OID whose object is absent is pending-fetch rather than an
     invented ahead/diverged relation.
   - A present, locally readable advertised base with no local base ref returns the existing unavailable state with
     neutral counts, `unavailableReason: local-base-absent`, and `remoteEvidence: exact`. It omits
     `failureReason` and carries a structured `arc base sync --json` remedy; that explicit action may create the
     missing local base through its existing guarded worktree path.
   - An absent advertised base retains the existing unavailable state with neutral counts, adds
     `unavailableReason: remote-base-absent` and `remoteEvidence: exact`, omits `failureReason`, and precomputes a
     surface-only configuration/remote mismatch advisory.
   - The existing fetch-into-local-base action remains outside the probe and retains its checkout and fast-forward
     guards.

4. **User-reference reconciliation**
   - Make authority analysis consume caller-supplied base evidence. Under full protection, session-init enumerates
     retirement authority at the advertised base OID when local; partial protection retains local-base authority.
   - Remove the session-init callback that runs unbounded `git fetch origin <base>`. The explicit
     `arc user reconcile-references` command performs bounded base materialization before invoking the same analyzer.
   - A missing base object yields typed pending-fetch authority; an unreachable snapshot yields typed unavailable
     authority. Neither grants edit or cleanup authority.
   - An absent advertised base yields unavailable authority with `reason: remote-base-absent`,
     `remoteEvidence: exact`, and a surface-only configuration/remote mismatch advisory. It never produces a
     reconciliation plan.

### 4. Acquisition modes for every worktree-sync consumer

Separate remote acquisition from the pure worktree relation analyzer instead of widening one fetch-owning helper
and leaving each caller to reinterpret it. The implementation provides three deliberate entry paths:

- **Shared session-init analysis:** consumes the request's all-heads snapshot and object-availability map. It never
  performs its own remote read or metadata write.
- **Passive exact inspection:** performs one bounded exact-ref `ls-remote` read and returns exact, pending-fetch,
  unreachable, or not-applicable evidence. Session-handoff, compaction-recovery probes, and the worktree qualifier
  in `arc user status` use this path; none writes Git metadata merely to inspect state.
- **Compaction recovery identity:** the recovery seed derives branch, HEAD, and dirty-path identity from one local
  Git snapshot, independently of every remote-dependent status slot. A failed local branch read fails seed
  emission visibly; unavailable remote evidence never synthesizes the literal branch name `HEAD`.
- **Explicit materializing inspection:** performs the existing bounded fetch, then requires an exact relation or a
  visible failure. `arc sync`, release-push pushability, and `arc user sync` use this path because they are explicit
  remote mutation operations whose action matrices require materialized objects and may fail closed.

The explicit materializing entry point does not accept `session.remote_sync` as a reason to skip acquisition. That
setting governs automatic session inspection; an explicitly invoked remote action either establishes the exact
relation it needs or fails visibly before mutation. Passive callers retain the setting's not-applicable behavior.

Inbound pull and base-sync execution retain their own explicit fetch legs and feed the fetched OID into the same
pure relation analysis. Pending evidence never enters a push, pull, or sync decision matrix as though it were an
exact relation. The old `runWorktreeSyncStatus` call sites migrate to one of these named paths; no caller chooses
acquisition policy ad hoc.

### 5. Remote truth for side-effect dependents

The request-scoped snapshot replaces refreshed tracking refs as the session's remote-truth source. Every analyzer
whose correctness currently depends on another probe's fetch side effect must receive the advertised OID explicitly:

- supersession detection uses the current branch OID;
- `workUnitState.behindBase` uses the base OID and becomes the following typed relation rather than a fail-open
  boolean:

  ```text
  { status: "known", value: boolean, remoteEvidence: "exact" }
  | { status: "unavailable", remoteEvidence: "pending-fetch", reason: "base-object-pending-fetch" }
  | { status: "unavailable", remoteEvidence: "unreachable", failureReason: RemoteFailureReason }
  | { status: "unavailable", remoteEvidence: "exact", reason: "remote-base-absent" }
  | { status: "not-applicable", remoteEvidence: "not-applicable" }
  ```

  The completion-tail classifier emits `mergeable` only when this relation is known. An approved, green work unit
  whose base relation is unavailable becomes `mergeability-unavailable`; workflow rendering names the missing
  evidence and its precomputed guidance without claiming the work unit is mergeable or recommending a base merge.
  Known `true` retains the existing “mergeable but behind base” qualifier; known `false` retains ordinary
  mergeable guidance. Merged and blocked states remain driven by their stronger terminal or failure evidence.
- stale-worktree and orphan/recovery merged checks use the base OID;
- husk retirement revalidation uses the base OID;
- in-flight and materialization discovery use the all-heads map.

Cleanup and retirement consumers use the supplied base OID for both graph proof and completed-index or retirement-
record reads. The landed-retirement sweep performs no base fetch of its own. Remote-only Errand merge checks use the
advertised source-branch OID rather than a tracking ref; checked-out local branches retain their local ref as the
source operand. Each cleanup-facing slot carries the shared `remoteEvidence` at top level, while a candidate whose
proof is incomplete remains present with an item-level evidence-unavailable blocking reason and no destructive
remedy. Unexpected local graph, index, record, or blob failures remain runtime probe errors.

The byte-preserving `readGitBlobBytes` / raw-executor path is part of this boundary. Passive shipped-index,
retirement-record, husk, sweep, and discovery reads select local-only object access explicitly; the helper no longer
runs an unqualified direct `execa` object read. Explicit lifecycle and decomposition operations keep the default
materializing behavior where their command boundary already authorizes it. Commit availability never stands in for
descendant availability: a locally present commit whose tree or blob is omitted by a partial-clone filter fails the
passive read locally and cannot trigger lazy materialization.

An analyzer may run an exact graph or blob read only when its required OID is local. Pending or unreachable evidence
suppresses destructive remedies, lossless-reset offers, mergeability claims, and cleanup authorization. It may still
emit an advisory that explicitly names the missing evidence. No authority-bearing path falls back silently to
`origin/<branch>` or `origin/<base>`.

Branch-gone recovery derives its recent-branch tier from advertised OIDs, never from the dates or membership of
`refs/remotes/origin/*`. Before availability or date inspection, exclude the gone branch, configured base, and heads
already represented by the higher-priority local-worktree tier. For each remaining eligible advertised head whose
object is local, read and sort the tip commit date by OID; unavailable objects contribute to the pending count because
their recency cannot be disproved. The local-worktree tier proves merged/removable status against the supplied base
OID. When that tier is empty and any eligible head object is missing, recovery returns this new outcome instead of
resolving an incomplete tier:

```text
{
  kind: "pending",
  remoteEvidence: "pending-fetch",
  candidates: CascadeCandidate[],
  pendingBranchCount: number,
  refreshRemedy: { text: string, argv: string[] }
}
```

`pendingBranchCount` is positive, `candidates` contains only verified recent tips, and the remedy invokes the
explicit live in-flight refresh. A pending outcome never auto-switches, never collapses to `main-fallback`, and
never treats a single verified candidate as an exact singleton; the workflow surfaces the incomplete evidence and
offers refresh or manual recovery. A non-empty local-worktree tier retains its precedence over lower tiers, but
resolves independently only when the supplied base evidence is exact. Only a complete recent-tip projection may
produce the existing `resolved`, `surface`, or `main-fallback` outcomes; those arms gain `remoteEvidence: exact`.

The local-worktree tier proves each candidate's merged and removable disposition against the supplied base OID, so
anything short of exact evidence leaves those dispositions unestablished. Rather than publish them as proven, a
non-empty worktree tier under `pending-fetch`, `unreachable`, or `not-applicable` evidence returns:

```text
{
  kind: "unproven",
  remoteEvidence: "pending-fetch" | "unreachable" | "not-applicable",
  failureReason?: RemoteFailureReason,
  candidates: CascadeCandidate[]
}
```

`candidates` carries the tier's entries without asserting their dispositions, and may be empty: an incomplete
projection cannot distinguish an absent candidate from one the failed read never revealed, so an empty tier under
non-exact evidence is reported as unproven rather than as a proven absence. An unproven outcome never auto-switches,
never offers removal, and never collapses to `main-fallback`; the workflow surfaces whatever candidates exist for
manual choice. `main-fallback` is therefore reached only under exact evidence — it concludes that no better
destination exists, which a degraded read cannot establish. Runtime schemas reject any exact arm carrying a
candidate the projection did not establish.

### 6. Staged composition without composite failure coupling

`runSessionInitStatus` changes from one undifferentiated eager fan-out to a small staged composition:

1. Acquire the memoized all-heads snapshot while independent local inputs resolve.
2. Resolve its local object-availability map and history-completeness prerequisite, then project the current/base
   OIDs.
3. Run all dependent slots in parallel with that immutable context.
4. Run later gated consumers with the same context.

The snapshot is a typed prerequisite, not a throwing global gate. The internal context retains the complete
all-heads map, one availability result covering every distinct advertised OID, and the history-completeness result;
individual slots project only the facts they need. Each dependent resolver maps unavailable remote evidence into its
own valid degraded value, and `safeProbe` continues to isolate unrelated local failures. An unavailable local object
inspection, shallow history needed by a graph traversal, or other local prerequisite causes each resolver that needs
it to emit a runtime probe error rather than rejecting the composite globally or becoming remote evidence.
Snapshot-only absence and identity conclusions remain exact. One remote read failure therefore does not erase
independent local slots.

This shared prerequisite belongs to the session-init probe interface only. Session-handoff and recovery retain their
passive exact-ref adapters and do not inherit the all-heads acquisition policy through shared probe types. The
session-init worktree callback therefore leaves the shared probe base and accepts the internal context explicitly;
the handoff worktree callback remains a separate zero-argument passive adapter. The context itself is never a public
envelope slot.

Update `strategy-session-operations.md` to describe the shared-prerequisite stage rather than claiming every slot
is fully independent at acquisition time. The stable contract remains: resolvers do not mutate, prompt, or throw the
whole envelope; the CLI computes verdicts and the workflow dispatches them.

### 7. Read-only discovery and explicit materialization

The no-active-work-unit oracle consumes the all-heads snapshot and intersects it with local refs in memory. Remove
the session-init `git fetch --prune origin`; tracking-ref pruning belongs to explicit pull or sync operations.

Before availability or classification, exclude the configured base and branches whose transient records already
establish that they are Errands. Do not exclude a code-repository head because of its branch prefix, a stale or
missing tracking ref, or an inferred WU name. Every other advertised head belongs to the discovery universe; a
different advertised tip remains relevant even when the branch name is represented by a local branch or worktree.

For each eligible live remote branch:

- When the advertised object is local, derive the in-flight entry and materializable candidate from that OID.
- When the object is absent, do not infer WU ownership, state, or meta identity from its branch name. Record it as
  pending remote discovery and exclude it from the verified candidate list.

An exact empty candidate list therefore requires complete classification of every eligible advertised head, with
complete local history for every graph traversal used by that classification. Local ref, worktree, tree, blob,
graph, or metadata parsing failures and shallow-history graph gaps are runtime probe failures rather than exact-empty
or pending remote evidence.

`materializableWorkUnits.value` changes from an ambiguous candidate list into this complete result contract:

```text
{
  candidates: MaterializableWorkUnit[],
  remoteEvidence: "exact" | "pending-fetch" | "unreachable" | "not-applicable",
  pendingBranchCount: number,
  refreshRemedy: { text: string, argv: string[] } | null,
  failureReason?: RemoteFailureReason,
  warnings?: string[]
}
```

The schema enforces these combinations:

- `exact` has `pendingBranchCount: 0` and no refresh remedy; an empty candidate list means none exist.
- `pending-fetch` has a positive pending count and the structured `arc active in-flight --json` refresh remedy.
- `unreachable` has a zero pending count, requires `failureReason`, and has no authority-bearing remedy;
  `not-applicable` has a zero pending count and omits both fields. `exact` and `pending-fetch` also omit
  `failureReason`. Warnings may supplement these states but never carry the machine-readable failure class.

The explicit `ActiveInFlightResult` also gains `remoteEvidence` plus a `candidateExpansion` union:

```text
{ status: "complete", pendingBranchCount: 0 }
| { status: "partial", pendingBranchCount: number }
| { status: "failed", pendingBranchCount: 0 }
| { status: "not-requested", pendingBranchCount: 0 }
```

`ActiveInFlightResult` carries the same optional `failureReason` field and combination rules as discovery.
`partial` requires a positive count. Live `arc active in-flight` emits its typed `partial` result and exits
non-zero when any candidate object could not be materialized; an unreachable live read emits `failed` with the
typed failure reason and also exits non-zero. Callers that intentionally want a local view use `--local` /
`--no-fetch`, which returns `not-requested` with `remoteEvidence: not-applicable` and exits successfully.
`complete` pairs with exact evidence, `partial` with pending-fetch, and `failed` with unreachable evidence. After a
successful explicit read, re-running session-init finds the objects by OID and emits verified candidates. This
preserves the candidate list as the correctness mechanism while making sandbox denial visible to normal
command-failure handling.

Expansion is pinned to one live-head snapshot. For each eligible unavailable head, the explicit coordinator may
fetch its branch, but it verifies that the snapshot OID became locally readable and classifies that exact OID. A
branch that moves during the request does not silently replace the captured generation; an unavailable captured OID
remains in the positive partial count. Failure of the initial live-head read is `failed`; any candidate fetch failure
after a successful snapshot is `partial`, including when no candidate fetch succeeds. Unexpected local
classification failure remains a command runtime failure rather than either remote-evidence arm.

The supplied-evidence analyzer and explicit expansion coordinator are separate entry points. Live
`arc active in-flight`, materialization, and lifecycle operations that require cross-machine authority opt into the
coordinator. Status user/project views, Errand overlap inspection, commit-time foreign-write checks, and other
passive callers never inherit fetch behavior merely by calling the shared derivation. Session-init keeps its
compatibility adapter until the staged composition cutover, then supplies the request-scoped context directly.

The transient Errand-record fetch is excluded. Its degraded state remains independently typed and documented; the
code-repository snapshot must not absorb `refs/arc/user/*` operational state.

### 8. Authoritative base mode and the write boundary

`arc base drift --json` in authoritative mode remains an explicit integration operation. It may fetch the base
because the merge gate needs the objects and because its caller is prepared to handle a failed command. It no longer
uses a temporary ARC ref: bounded-fetch the configured base into its standard remote-tracking ref, resolve the
resulting OID, and feed the same pure base analysis used by advisory mode. This does not invoke `arc base sync` or
advance the local base branch; that command remains the separate guarded action that can create or fast-forward the
local base.

The passive/explicit boundary is therefore:

- **Passive session-init:** `ls-remote`, local object/ref reads, and pure computation only.
- **Explicit actions:** pull, base sync, `arc active in-flight`, materialize, user sync, and authoritative base
  drift may write Git metadata. They report denial as command failure rather than a successful but ambiguous probe.

Local-safe orientation, context loading, planning, and local inspection continue under pending or unreachable
evidence. Integration authority, remote materialization proof, destructive cleanup/reset offers, push, pull, and any
operation requiring a fresh remote object stay unavailable or fail closed until the explicit action succeeds.

### 9. Schemas, recommendations, and workflow consumption

Define `RemoteFailureReason` and `RemoteEvidence` once in the CLI schema kernel and derive slot schemas and TypeScript
types from that authority. Extend the worktree, base-distance, base-branch-sync, user-reference, discovery,
branch-gone recovery, completion-tail base relation, and session-envelope views in place.

Recommended actions, remedies, and user-facing text are composed CLI-side from the typed evidence. In particular:

- pending-fetch produces a pull/refresh offer appropriate to the slot and configured policy;
- unreachable evidence produces a local-safe continuation advisory with its failure class;
- authority-bearing remedies are absent unless evidence is exact;
- discovery refresh is represented as a structured remedy, not a shell command reconstructed from prose.

For the widened remote-evidence paths, `session-init.md` dispatches only on precomputed actions and text; it does not
evaluate combinations of evidence, failure, relation, or count fields. Existing state-spine dispatch outside those
paths is not part of this rewrite. `probe-envelope.md` documents the semantics and presence conditions of fields
whose runtime schemas are registered in the CLI kernel, while the generated JSON Schema artifact remains the shape
authority; the reference does not hand-write a competing schema or encode field comparisons in prose.

Inventory and update non-session-init consumers of the widened worktree result, including `arc sync`, inbound pull,
release-push preflight, recovery probes, user-sync projection, status formatting, and fixtures. Each consumer follows
the acquisition mode assigned in Proposed Design §4; no consumer silently falls back from pending evidence to a
stale tracking ref or selects its own acquisition policy.

### 10. Documentation and rollout

Document the remote-access contract in adopter-facing package source:

- which passive probes use read-only remote access;
- which explicit commands write Git metadata and where linked worktrees place that metadata;
- what exact, pending-fetch, unreachable, and offline/local-safe behavior mean;
- how a sandbox can allow network reads while denying Git metadata writes;
- harness examples framed as examples, never as product requirements.

Framework workflow and reference edits originate under `packages/arc-framework/arc/**` and sync through the
repository's package-to-project mechanism. Configurable project copies are updated surgically; no copy operation may
overwrite project-owned sections.

The temporary root `AGENTS.md` guidance that asks Codex to rerun the probe with escalation remains until the new
read-only behavior is verified in a linked worktree. Remove that section before integration; the product contract
must live in shipped, harness-agnostic documentation.

### 11. Hermetic quality-gate execution

The same ownership boundary applies to routine verification. A quality gate may write inside scratch state it
creates and owns, but it must not require ambient write authority over the developer checkout's Git common
directory, identity-global package-manager state, or an auxiliary IPC endpoint when direct one-shot execution is
sufficient.

Integration tests that exercise Git mutation use disposable repositories and keep every note or temporary ref
inside those fixtures. Temporary refs are not prohibited: they remain valid implementation details inside an owned
fixture or an explicit materializing operation. A routine test must not create them in the checkout running the
gate. Package-manager subprocess tests likewise redirect cache and log state into disposable directories rather
than inheriting the developer's user-level cache.

One-shot TypeScript gate scripts invoke the runtime loader directly and preserve their existing arguments, output,
and exit behavior without starting a CLI service or IPC listener. Long-running watch or development processes are
outside this requirement. Explicit repository lifecycle actions such as fetch, merge, commit, notes publication,
and materialization remain allowed to request the authority their mutation requires; this section does not turn
them into passive gates or add a sandbox-specific product mode.

## Alternatives & Rationale

### Keep fetch-based probes and classify permission denial

This preserves exact analysis but retains several writes, repeated network round trips, temp-ref cleanup, and a
special escalation problem. It treats a passive inspection as privileged even though the remote OIDs are readable
without mutation. Rejected in favor of structural removal of the permission failure class.

### Add deliberate harness escalation

An allow rule for `arc status` would run mutable repository code outside the sandbox and would be harness-specific.
An envelope recommendation cannot itself cause a failed command for ordinary escalation handling. Rejected; explicit
write actions already provide the correct visible boundary.

### Add new relation state names for partial evidence

New worktree and base relation states would multiply schema and workflow branches while still failing to establish a
graph relation without the object. The retained unavailable verdict plus required `remoteEvidence` qualifier says
exactly what is known and preserves the existing state vocabulary.

### Narrow active resumes to an exact-ref query

An exact current/base query reduces response payload on an ordinary resume, but omission of the current branch is
what reveals branch-gone recovery—and recovery then needs complete head membership. It would therefore require a
second remote read on that arm or leave recovery under-informed. Rejected in favor of one all-heads session-init
snapshot with a simpler causal contract.

### Publish distance against the last-known tracking ref

This was considered as partial evidence, but it can describe a different remote generation and appear authoritative
to consumers that read only the relation fields. Rejected as disproportionate and potentially misleading. The exact
remote OID plus `pending-fetch` and a refresh remedy is smaller and safer.

### Split discovery from the analyzer work

Discovery is a separable delivery surface but not an independent design: it consumes the same remote snapshot,
object-availability rule, evidence schema, and explicit-write boundary. Splitting it would duplicate the contract or
create a cross-WU compatibility seam. Keep one WU and give discovery its own implementation/review increment.

## Cross-cutting Considerations

### Security and trust boundaries

- Remote reads remain non-interactive and timeout-bounded; no prompt may capture credentials inside the probe.
- Passive local reads set `GIT_NO_LAZY_FETCH=1`, so a promisor remote cannot turn object inspection into an
  unbounded nested fetch or shared-object-database write.
- The paired `--no-lazy-fetch` option makes the contract fail closed if an invocation somehow runs on Git older than
  the declared 2.45 minimum.
- Failure classification exposes a small class, never raw credential material or full stderr in the envelope.
- Exact remote absence is accepted only from a complete successful query.
- Pending and unreachable evidence never authorizes destructive cleanup, reset, integration, or ownership-sensitive
  materialization.

### Performance

Session-init performs one all-heads network read instead of several fetches. This transfers more response bytes on
an ordinary active-work-unit resume, but avoids a second read on branch-gone recovery and makes every arm consume one
identical remote generation. OID availability checks are batched and local, and dependent analyses retain parallel
execution after the shared snapshot resolves. Passive non-session probes that know their branch use the exact-ref
reader rather than enumerating all heads.

### Testing

Use test-first coverage for the shared reader, evidence projection, and analyzers. Mock only the Git subprocess
boundary in unit tests; use temporary repositories and bare remotes for integration and E2E behavior.

The required matrix covers healthy exact evidence; missing local objects with and without stale tracking refs;
promisor clones with a missing advertised commit and with a present commit whose descendant tree/blob is omitted;
shallow clones with locally present tips but incomplete ancestry; supported and unsupported Git versions;
network/DNS failure; authentication failure; timeout; malformed output; absent branch; no remote; disabled sync;
linked-worktree read-only shared metadata; branch force-push/supersession; remote and local base absence; recovery
with incomplete recent-tip objects; completion-tail mergeability with unavailable base evidence; discovery with
unseen remote objects; and explicit-action failure/retry. Assertions must prove both returned values and the absence
or presence of `fetch`, pack/object writes, `update-ref`, and other metadata-writing commands at the correct
boundary.

Routine gate coverage also runs Git-mutating cases in disposable repositories, gives package-manager subprocesses
disposable cache and log state, and exercises representative one-shot TypeScript entrypoints without an auxiliary
IPC listener. A constrained linked-worktree run proves the canonical gates do not need ambient writes outside
their owned workspace and scratch directories.

### Migration and compatibility

This project is pre-public-release, so schemas and fixtures change in place. Preserve command names and the broad
state vocabulary where doing so remains truthful; do not add compatibility readers or aliases. Package-source and
project-instance workflow copies must pass the repository sync checks. Raise the declared minimum Git version to
2.45 rather than adding a fallback for older promisor clients; the local-only global option also makes accidental
execution on an older Git fail before object inspection.

### Forward compatibility

The remote snapshot is request-scoped data, not a tracked-ref storage contract. The failure taxonomy composes with
the future materialized backing store's sync vocabulary, while the user-notes and transient-record exclusions avoid
deepening the interim git-notes substrate. Deterministic evidence and remedy selection stays in the CLI, consistent
with the layered procedure model.

## Success Criteria

1. A handler-level session-init test whose Git executor rejects every metadata-writing command but permits
   `ls-remote` returns exact or pending evidence for the four in-scope slots and records no explicit or implicit
   probe-path `fetch`, pack/object write, `update-ref`, or ref creation.
2. In a real linked worktree with readable network access and read-only shared `.git`, worktree sync, base distance,
   base-branch sync, and user-reference reconciliation return the same exact values as an unrestricted probe when
   their advertised objects are already local.
3. An advertised OID absent locally yields `remoteEvidence: pending-fetch`, neutral relation fields, and a
   precomputed explicit refresh remedy; local inspection uses no-lazy-fetch execution and never yields a stale exact
   relation or materializes the object itself.
4. Timeout, network, authentication, and unclassified failures produce `remoteEvidence: unreachable` with the
   matching `failureReason`; a complete successful query missing a branch produces `branch-gone`.
5. A complete snapshot missing the configured remote base produces exact `remote-base-absent` projections in base
   distance, base-branch sync, and user-reference authority, with neutral counts, surface-only guidance, and no
   fetch or authority-bearing remedy.
6. A present, locally readable advertised base with no local base ref produces exact `local-base-absent` evidence,
   neutral counts, and a structured base-sync remedy; the explicit action can create the base through its guarded
   worktree path.
7. Advisory base-distance mode creates no temporary ref and cannot emit `temporary-ref-cleanup-failed`;
   authoritative mode still materializes the base explicitly and analyzes the fetched OID.
8. Branch-gone recovery derives recent candidates from snapshot OIDs. Missing tip objects produce the typed pending
   outcome and cannot yield automatic singleton recovery or `main-fallback`; a complete tier preserves the existing
   cascade.
9. Supersession, behind-base, recovery/sweep merge proof, shipped-index and retirement-record reads, remote-only
   Errand proof, and husk revalidation consume snapshot OIDs through no-lazy-fetch reads and suppress authority-
   bearing remedies whenever required objects or graph history are incomplete. Completion-tail reports expose the
   specified behind-base relation and use `mergeability-unavailable` rather than a mergeability claim when needed;
   the landed-retirement sweep performs no base fetch.
10. The no-active-work-unit arm performs no metadata write. Its result distinguishes no candidates, pending unseen
    branches, unreachable evidence, and not-applicable discovery through the specified typed
    failure/count/evidence/remedy contract; it never emits an unverified materialization candidate.
11. Explicit `arc active in-flight` live discovery emits the specified expansion union. Partial materialization and
    failed remote acquisition both exit non-zero with their distinct typed evidence; after a successful run, a
    re-probe emits verified remote-only candidates.
12. Session-init uses exactly one all-heads snapshot. Session-handoff, recovery, and user-status inspection use the
    passive exact reader; sync, release-push, and user-sync operations use the explicit materializing reader and
    never feed pending or skipped automatic-session evidence into an exact action matrix, including when
    `session.remote_sync` disables automatic session inspection.
13. A remote-head acquisition failure degrades each dependent slot independently while local slots, orientation,
    context loading, planning, and local inspection remain usable.
14. Runtime schemas reject inconsistent evidence combinations, including unreachable evidence without a failure
    reason, pending-fetch evidence with one, and incomplete recovery represented as an exact singleton.
15. A failed or malformed local object inspection or analysis, or shallow history required by a graph traversal,
    produces runtime probe errors for dependent slots without being mislabeled as pending-fetch, unreachable, or
    exact remote evidence; snapshot-proven ref absence and non-traversal identity facts remain usable.
16. Session-init workflow prose dispatches precomputed actions and text for widened remote-evidence paths without
    evaluating evidence, failure, relation, or count combinations; adopter documentation explains the
    passive/explicit write boundary and retained exclusions.
17. The temporary Codex escalation guidance is removed from root `AGENTS.md` after linked-worktree verification and
    before integration.
18. Real promisor-clone fixtures prove passive inspection of an advertised missing OID and of a locally present
    commit with an omitted descendant tree/blob perform no nested fetch or pack/object write. The first returns
    pending evidence, the second returns a local probe error, and the corresponding explicit action can materialize
    the required objects.
19. A real shallow-clone fixture with both compared tip objects locally present proves graph-dependent slots do not
    publish exact relations; a full-history control fixture publishes the correct exact relation.
20. Package metadata declares Git 2.45 or newer, every local-only executor seam passes both `--no-lazy-fetch` and
    `GIT_NO_LAZY_FETCH=1`, an unsupported Git fails before the object-reading subcommand, and default or explicit-
    action invocations retain their existing acquisition behavior.
21. Git-mutating integration tests create notes and temporary refs only inside disposable repositories, and a
    representative large-note path proves the checkout running the gate is unchanged.
22. Package-manager subprocess tests use disposable cache and log state, and one-shot TypeScript gate entrypoints
    preserve arguments, output, and exit behavior without requiring an auxiliary IPC listener.
23. The canonical routine quality gates complete in a constrained linked worktree without write authority over the
    checkout's shared Git common directory or identity-global package-manager state; explicit repository mutation
    remains a separately authorized action.

## Open Questions

None. Implementation may choose local function and file organization within the component boundaries above; it may
not change the remote snapshot, evidence, authority, or passive/explicit-write contracts without returning to this
spec.
