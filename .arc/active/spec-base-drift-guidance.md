# Spec (`detailed` · `RFC`): Base Drift Guidance

- **Origin:** `[internal]`

- **Purpose:** Replace raw behind-base alarmism with one typed analyzer that preserves Git's safety facts,
  identifies integration-level movement where evidence supports it, distinguishes substantive contention from
  regenerable projection churn, and drives both session guidance and the final integration gate.

---

## Introduction / Context

The existing base-distance probe correctly compares `HEAD` with `origin/<base>`, but its user-facing meaning is
too coarse. One sibling work unit can add many commits to the raw behind count, normal derived readiness-view churn
is presented like substantive contention, and overlap-analysis failures collapse to an empty path list. The result
cannot distinguish "no overlap" from "overlap unavailable," and routine parallel progress looks more dangerous
than it is.

The final integration workflow independently repeats `git fetch` and `git rev-list` mechanics. That duplicates the
safety decision at the point where it matters most and allows advisory and authoritative behavior to drift.

This RFC extends the existing TypeScript probe rather than replacing Git distance. Raw `ahead` and `behind` remain
the merge-safety truth. Integration evidence, overlap classification, and register composition enrich that truth
without becoming prerequisites for measuring it.

## Goals

1. Preserve raw `HEAD...<fetched-origin-base-OID>` distance as the authoritative safety fact.
2. Report base movement as proven integration events plus explicitly unclassified commits, never by treating each
   first-parent commit as an integration.
3. Distinguish substantive overlap, regenerable overlap, and unavailable overlap analysis.
4. Compose calm, attention, and degraded guidance with deterministic precedence.
5. Drive session-init guidance and the final behind-base integration gate from the same analyzer.
6. Fail closed at integration when current base distance cannot be established.
7. Keep archived-meta and readiness-view bindings replaceable as operational state moves to managed records and
   materialized projections.
8. Remain storage-tier agnostic: no analyzer or workflow branch may depend on where ARC state is canonical,
   materialized, or visible.

## Non-Goals

- Implement managed-record storage or the future project-readiness projection.
- Define a managed-record schema, storage locator, project-identity scheme, or storage-tier selection policy.
- Rename the current readiness view or encode its proposed replacement name.
- Add host-API calls, credentials, or a network identity-enrichment dependency.
- Infer rebase or squash integration ranges without local evidence that proves an event boundary.
- Create a generic derived-file registry or add a new configuration axis.
- Change merge strategy, archive cadence, or append-only reconciliation doctrine.
- Replace `ahead` / `behind` with an integration count for safety decisions.

## Proposed Design

### 1. Shared result and policy modes

Extend the base-distance analyzer into a shared base-drift analyzer with two invocation modes:

- **`advisory`** is used by session-init. It respects `session.remote_sync`; when remote synchronization is disabled,
  it returns `skipped` without invoking Git and produces no recommendation.
- **`authoritative`** is used by `arc base drift --json`. It ignores `session.remote_sync`, always attempts the
  bounded base fetch and live distance read, and never returns `skipped`.

The result preserves the existing `state`, `ahead`, `behind`, `base`, and `failureReason` fields for compatibility
and adds the following typed fields:

```ts
type BaseDriftVerdict = "clean" | "reconcile" | "unavailable" | "skipped";

type BaseDriftUnavailableReason =
  | "invalid-base"
  | "detached-head"
  | "no-remote"
  | "fetch-timeout"
  | "fetch-failed"
  | "fetched-base-unresolved"
  | "distance-read-failed"
  | "temporary-ref-cleanup-failed";

type IntegrationEvidence =
  | {
      coverage: "complete" | "partial";
      scannedCommitCount: number;
      events: IntegrationEvent[];
      unclassifiedCommitCount: number;
      truncated: boolean;
      limitations: Array<
        | "unclassified-commits"
        | "resolver-unavailable"
        | "resolver-invalid"
        | "scan-truncated"
      >;
    }
  | { coverage: "unavailable"; reason: "history-scan-failed" };

type IntegrationEvent = {
  commits: string[];
  proof: "topology" | "resolver";
  slug?: string;
  prNumber?: number;
  prUrl?: string;
};

type OverlapEvidence =
  | {
      status: "available";
      substantivePaths: string[];
      regenerablePaths: string[];
    }
  | {
      status: "unavailable";
      reason: "merge-base-failed" | "branch-diff-failed" | "base-diff-failed";
    };

type BaseDriftRegister =
  | { kind: "calm" | "attention" | "degraded"; text: string }
  | null;
```

The production result contains `mode`, `verdict`, `baseOid`, `unavailableReason`, `integrationEvidence`, `overlap`,
and `register` in addition to the compatible distance fields. `baseOid` is the immutable fetched base commit on a
healthy reading and `null` otherwise. `unavailableReason` is present only on `verdict: unavailable`. Exact internal
interface decomposition may differ, but the JSON emitted by `arc base drift --json` follows this semantic shape.

`integrationEvidence` and `overlap` are `null` when raw distance was skipped or unavailable because no enhancement
claim was attempted. Their `unavailable` arms mean an enhancement failed **after** distance succeeded. Complete
integration evidence has no limitations; partial evidence has at least one typed limitation for register
composition.

Verdict invariants are fixed:

- `clean` means the distance read is healthy and `behind === 0`.
- `reconcile` means the distance read is healthy and `behind > 0`.
- `unavailable` means branch identity, `origin`, fetch, base ref, or distance could not be established.
- `skipped` occurs only in advisory mode when remote synchronization is disabled.

`ahead` and `behind` are meaningful only on healthy distance states. A degraded result must not use zero counts to
claim parity. `register` is `null` for `clean` and `skipped`; it is composed for `reconcile`. An authoritative
`unavailable` result carries a degraded explanation suitable for the integration workflow to surface; an advisory
`unavailable` result carries no register because session-init preserves its existing skip behavior.

### 2. Distance acquisition and failure behavior

Reuse the bounded-fetch timeout and Git-execution infrastructure from the existing Git layer, while tightening the
ref boundary described below.

The analyzer proceeds in this order:

1. Apply the advisory-only remote-sync skip.
2. Validate configured `branch.base` by constructing `refs/heads/<base>` and passing that non-option-shaped full ref
   to `git check-ref-format`. Empty or invalid values return `unavailableReason: invalid-base` without fetching.
3. Resolve the current branch; detached `HEAD` is unavailable.
4. Require `origin`.
5. Generate a collision-resistant, process-owned token and construct an invocation ref under
   `refs/arc/base-drift/<token>`. The token is generated internally and is injectable for deterministic tests; no
   config or repository content contributes to the destination name.
6. Perform a bounded fetch with `--no-write-fetch-head`, mapping the validated `refs/heads/<base>` source to the
   invocation ref. Resolve `<invocation-ref>^{commit}` to immutable `baseOid`; never resolve identity through shared
   `FETCH_HEAD` or another ref a concurrent probe may update.
7. Read `HEAD...<baseOid>` through the shared distance primitive.
8. If `behind > 0`, run integration-evidence and overlap analyses independently against the same `baseOid` while
   the invocation ref keeps the fetched object reachable.
9. Delete the exact invocation ref with `git update-ref -d` in a `finally` path before returning. Cleanup failure
   returns `verdict: unavailable` with `temporary-ref-cleanup-failed`; a valid reading never leaves silent ref
   residue.

Validation, fetch, fetched-OID resolution, distance, or invocation-ref cleanup failure returns the existing
compatible degraded `state` plus `verdict: unavailable` and the typed `unavailableReason`. Enhancement failure after
a healthy distance does not replace or invalidate the distance; it degrades only the affected evidence arm.

When `behind === 0`, integration evidence is complete with zero scanned commits and overlap is available with empty
path sets. No enhancement subprocess is required for that case.

### 3. Integration-event evidence

#### First-parent scan

Scan first-parent commits in `HEAD..<baseOid>` and read, at minimum, each commit SHA, parent list, and subject.
These commits are **scan inputs**, not integration units.

Classify each input in order:

1. A commit with more than one parent is one topology-proven integration event, regardless of subject.
2. A resolver may enrich a topology-proven event with WU and PR identity, but identity absence does not weaken the
   event proof.
3. A resolver may prove an event over one or more otherwise-unclassified single-parent inputs. The current adapter
   proves only one-input squash events under the same-commit evidence rule below.
4. Every single-parent input not consumed by proven resolver evidence remains unclassified base movement.

Events and unclassified commits are reported separately. They are never added together or described collectively
as integrations. Event membership is disjoint: topology inputs cannot be consumed by a resolver event, and no scan
input may belong to two events. When topology and resolver identity evidence refer to the same event, retain one
event with `proof: topology` and enrich it rather than emitting a duplicate.

Order scan inputs and event `commits` from oldest to newest for deterministic JSON and rendering. Deduplicate and
lexicographically sort overlap path arrays before sampling them.

Coverage is `complete` only when the scan succeeds, is not truncated, and every scanned commit belongs to a proven
event. It is `partial` when the scan succeeds but any commit remains unclassified, a resolver needed for possible
classification fails or returns invalid evidence, or a defensive scan bound truncates the range. It is
`unavailable` only when the first-parent scan itself cannot be established. A defensive bound is
implementation-owned; reaching it must set `truncated: true`, include `scan-truncated` in `limitations`, and must not
guess facts about the unscanned range.

#### GitHub subject grammar

For a topology-proven merge event, extract a PR number only when the complete subject matches:

```text
Merge pull request #<positive integer> from <non-empty head>
```

For a single-parent candidate, accept the platform suffix only when the complete subject ends with one space and
`(#<positive integer>)`. A terminal PR suffix is identity evidence, not event proof by itself.

#### Evidence resolver port

The Git analyzer receives an optional `IntegrationEvidenceResolver` port. The port separates two operations:

- enrich identity for an event already proven by topology; and
- prove event membership over otherwise-unclassified, ordered single-parent inputs from record or host evidence.

The port consumes code-history facts such as ordered commit OIDs and accepted PR identity and returns only event
membership and optional display identity. It does not expose archive paths, Markdown, lifecycle-directory
placement, backing-store refs, project IDs, or storage versions. Low-level Git code does not import
completed-record, status, or future storage modules. Command and status handlers construct the current production
resolver and inject it; a future storage composition root may substitute a storage-owned resolver without changing
the analyzer or either consumer.

The current in-repository adapter extends `completed-index.ts` and uses `parseMetaRecord` rather than duplicating
archive-path or managed-field parsing. Extend shipped-WU records with the parsed `PR URL` where needed.

The adapter must not consume the existing lossy `Map` API as its evidence contract: that reader intentionally maps
an unreadable archive tree to an empty result and an unreadable meta blob to `null`. Add a status-bearing evidence
read beside or beneath the compatibility API:

```ts
type CompletedEvidenceRead =
  | { status: "available"; records: Map<string, ShippedWorkUnitRecord> }
  | {
      status: "partial";
      records: Map<string, ShippedWorkUnitRecord>;
      unreadableMetaPaths: string[];
    }
  | { status: "unavailable"; reason: "archive-tree-read-failed" };
```

`CompletedEvidenceRead` is a current-adapter compatibility type, not the stable resolver or storage-abstraction
contract. A managed-record implementation may implement `IntegrationEvidenceResolver` directly and does not need
to reproduce a completed-directory tree, Markdown projection, or `Map`-shaped read.

An absent archive or a readable meta with no valid PR URL is available negative evidence. A failed archive-tree
read is unavailable; one or more failed meta-blob reads are partial. The resolver maps either failure condition to
`resolver-unavailable` while preserving any topology evidence and successfully read identities. Same-commit history
or blob-read failure follows the same rule. `resolver-invalid` is reserved for a resolver response whose event
membership violates the analyzer's input/disjointness contract.

For topology-proven events, the adapter may enrich identity from either:

- one archived `meta-*` introduced by that same commit; or
- an exact PR-number match between the accepted merge subject and an archived record visible at the base ref.

An archived-record PR lookup enriches only on one unique match. Missing, malformed, or duplicate matches leave the
topology event unnamed rather than choosing an identity heuristically.

This permits merge integrations to retain exact event boundaries under either archive cadence. A later manual
archive can enrich a merge event by PR identity, but it never creates a new event.

For a single-parent commit, the current adapter proves one squash event only when both facts occur in the same
commit:

1. the commit introduces exactly one archived WU meta whose parsed PR URL ends in `/pull/N`; and
2. the subject ends with one space followed by `(#N)`, using the same positive integer.

Neither fact alone proves an event. An added archive meta with no matching suffix is unclassified movement; a suffix
with no same-commit archive is also unclassified. Archive paths and contents are data only and are never executed.
Detect the introduced meta by diffing the commit against its first parent with rename detection disabled, so an
archive performed with `git mv` appears as an added completed-path blob plus a deleted source blob.

Evidence consequences across supported integration and archive settings are:

| Merge strategy | Archive cadence  | Event result                                                         |
|----------------|------------------|----------------------------------------------------------------------|
| merge          | with-integration | Merge topology proves one event; same-commit meta may enrich it.     |
| merge          | manual           | Merge topology proves one event; later PR identity may enrich it.    |
| squash         | with-integration | Matching same-commit archive and suffix prove one event.             |
| squash         | manual           | Squash and archive commits remain unclassified without an adapter.   |
| rebase         | with-integration | Replayed commits remain unclassified without another resolver.       |
| rebase         | manual           | Replayed and archive commits remain unclassified without a resolver. |

A future host or managed-record adapter may improve coverage through the same port by proving a squash commit or a
multi-commit rebase range. The analyzer validates that returned membership is drawn from the supplied scan inputs,
is disjoint, and does not consume a topology event; invalid resolver evidence is ignored and reported as a partial
limitation. Such an adapter is optional and outside this work unit.

### 4. Overlap and reconciliation classification

Overlap remains the intersection of paths changed from the merge base on each side:

- branch side: `merge-base..HEAD`;
- base side: `merge-base..<baseOid>`.

Run changed-path reads with rename detection disabled, equivalent to `git diff --name-only --no-renames`. A rename
therefore contributes both source and destination paths. This conservatively detects a base rename against a branch
edit to the old name and divergent renames from the same source.

If either side has no unique commits, the overlap is provably available and empty without running both diffs. A
merge-base or diff failure returns `status: unavailable`; it never returns an available empty list.

Partition the intersection through an injected reconciliation classifier whose semantic result is:

- `substantive` — ordinary source, tests, configuration, or authored documents; or
- `regenerable` — a derived projection that should be recreated rather than hand-merged.

The current production classifier recognizes only the exact canonical `ROADMAP_PATH` as regenerable. It imports and
reuses that constant rather than repeating the filename. Every other path is substantive. Do not extend
ownership-oriented `PathSurface`, introduce a generic registry, add configuration, or encode a future filename.

The analyzer depends only on the classifier port. When operational state moves outside the code repository, the
readiness projection disappears from the code diff naturally; if a storage tier still materializes it in-repo, that
tier can supply the classifier without changing base-drift semantics.

### 5. Register composition

Compose one register only after a healthy distance reports `behind > 0`. Preserve the existing three-path sample
limit in rendered text while retaining complete arrays in JSON.

Precedence is deterministic:

1. **Attention** leads whenever available overlap contains substantive paths, regardless of integration coverage.
   Name a bounded sample and recommend merging the base before continuing edits on those paths.
2. **Degraded** leads when overlap is unavailable, or when no substantive overlap is known and integration coverage
   is partial or unavailable. State which evidence could not be established and fall back to raw `behind` without
   claiming safety.
3. **Calm** leads only when overlap is available with no substantive paths and integration coverage is complete.
   Name proven sibling integrations when identity is available, identify regenerable overlap, and say that merging
   is convenient now but required before integration.

When attention leads and integration coverage is partial or unavailable, append a degradation qualifier after the
contention warning. Never suppress the contention or the evidence limitation.

Vocabulary follows proof strength:

- resolver-identified events are **sibling integrations**;
- topology-only events are **integrations**; and
- all other scanned inputs are **unclassified base movement**.

Representative calm text:

> Base `main`: 1 sibling integration ahead — `burn-in-probe-b` (PR #235). No substantive overlap; `ROADMAP.md`
> is a regenerable projection. Merge when convenient; required before integration.

### 6. Consumer integration

#### CLI command

Add `drift` beneath the existing `arc base` command family. `arc base drift --json` is authoritative by default;
there is no flag that lets the integration gate honor `session.remote_sync` or skip its fetch.

JSON is written to stdout for every outcome. Exit status is:

- `0` for `clean` and `reconcile`, because both are valid current readings; and
- `1` for `unavailable`, after emitting the typed JSON.

Without `--json`, render the same verdict, raw facts, and register through the existing CLI presentation style and
use the same exit semantics. Human rendering must not introduce different policy.

The command handler reads `branch.base`, constructs the current resolver and classifier adapters, invokes the shared
analyzer in authoritative mode, emits the result, and sets the exit code. Commander wiring remains declarative in
`cli.ts`; deterministic analysis remains in `src/lib/`; orchestration and real I/O stay in handlers.

#### Session-init

The session-init status handler invokes the same analyzer in advisory mode and keeps the existing `baseDistance`
envelope slot. Its recommendation fields are derived without re-reading Git:

- `reconcile` -> `recommendedAction: surface`, with `recommendedPromptText` equal to the composed register text;
- `clean`, `unavailable`, or `skipped` -> `recommendedAction: skip` and empty prompt text.

Session-init continues to render the precomposed text verbatim and remains advisory; it does not introduce a yes/no
interrupt or perform reconciliation. Update the package `session-init.template.md`, the package
`session-init/probe-envelope.md` contract, and both self-hosting rendered counterparts together. The envelope
reference replaces `overlappingPaths` with the new verdict, evidence, and register fields while retaining the
compatible distance fields and recommendation pair.

#### Integration workflow

Replace the manual fetch and raw `rev-list` block in the final behind-base gate with:

```bash
arc base drift --json
```

Dispatch on the emitted verdict:

- `unavailable` or non-JSON failure -> stop and surface the reason;
- `reconcile` -> surface the register and await explicit reconcile direction, merge the result's validated
  `baseOid` append-only with `git merge --no-edit <baseOid>`, run the existing checks and push sequence, then invoke
  the command again; and
- `clean` -> continue to the existing exact-head review checkpoint and integration interlock, carrying the fetched
  `baseOid` as the base-freshness evidence that was approved.

Bind reconcile approval to the surfaced `baseOid`. Immediately after approval, invoke `arc base drift --json`
again before `git merge`:

- `unavailable` stops;
- `clean` means reconciliation became unnecessary and returns to the clean path;
- `reconcile` with a different `baseOid` re-surfaces the updated register and re-fires the reconcile interlock; and
- `reconcile` with the approved `baseOid` permits the immediate OID merge, with no further stop or Git fetch between
  the fresh read and `git merge --no-edit <baseOid>`.

This refresh prevents a human approval wait from leaving the emitted, temporary-ref-backed OID stale or relying on
an object fetched only by an earlier process invocation.

Integration approval does not make the earlier base reading timeless. After approval, invoke
`arc base drift --json` once more immediately before the merge command:

- `unavailable` or `reconcile` invalidates the approval's stale base-freshness premise and returns to the appropriate
  stop/reconcile loop; the integration interlock must fire again after a new `clean` result; and
- `clean` permits immediate merge invocation, with no extension, review action, commit, push, or further human stop
  between this final read and `gh pr merge`.

This closes the workflow-sized approval window while acknowledging that a client-side Git read cannot make remote
base movement atomic with the hosting platform's merge transaction. Host-side up-to-date protection may narrow the
remaining network race but is not assumed by this command.

Only a fresh post-approval `clean` reaches merge invocation. The workflow never derives safety from integration
count or register tone. Update the authoritative package workflow and its self-hosting copy in the same
implementation change.

### 7. Storage-evolution compatibility boundary

Base drift concerns the **code repository's** branch history. The storage direction relocates ARC operational state
and authored design; it does not replace the code repository or turn its base commit into a storage record. Keep the
two domains separate:

- The fetched `baseOid`, raw distance, invocation-owned ref, and merge target belong to the code repository. The
  temporary ref is not an ARC backing-store mutation.
- The analyzer and both consumers do not read `pm.mode`, team settings, a storage tier, a project ID, a backing-store
  locator, or `storage.track_design_docs`. They operate on Git facts plus injected semantic capabilities.
- `IntegrationEvidenceResolver` is a read-side capability. Completed metas are its current in-repository adapter,
  not domain identity. Managed records may later resolve the same evidence by integration commit or PR identity;
  the storage owners define that linkage rather than this RFC inventing a record field.
- The reconciliation classifier answers behavior, not ownership or storage location. `ROADMAP_PATH` is the current
  in-repository adapter. The analyzer never knows the current or future projection filename.
- WU identity remains independent of branch names and lifecycle directories. An optional `slug` is resolver-supplied
  display identity; the analyzer never infers it from a branch, archive path, or record address.

The current and target tiers therefore compose as follows:

| Concern | Current-tier adapter | Materialized-store target | Stable contract |
| ------- | -------------------- | ------------------------- | --------------- |
| Integration identity | Parsed completed metas in code history | Storage-owned typed record read keyed by code linkage | Resolver returns proof and optional identity over supplied scan OIDs |
| Lifecycle placement | Readable completed-directory tree | Managed lifecycle field with directory layout as projection | Core analyzer receives no lifecycle path or address |
| Readiness-view churn | Exact `ROADMAP_PATH` in the code diff | Derived projection materialized outside code history | Classifier returns reconciliation behavior, or the path is naturally absent |
| Authored design | Present in code history when tracked | Materialized by default and optionally tracked by the one design-doc knob | A present path is substantive; an absent path is unobservable without config branching |
| State availability | Local tracked files normally readable | State may be private, stale, unprovisioned, or temporarily unavailable | Evidence becomes partial or unavailable; raw distance and merge safety do not change |

The `baseOid` is the only cross-wait safety anchor. Resolver reads are deliberately not transacted with the code
fetch: materialized storage is eventually consistent, and contributor or CI contexts may have no state access.
Returned event proof is accepted only over the supplied scan OIDs and is validated for membership and disjointness.
Stale, missing, private, or failed record reads therefore degrade identity/coverage but cannot change `clean` versus
`reconcile`, authorize integration, or require a two-phase commit across repositories.

This boundary also satisfies non-git substitutability for the future storage abstraction. A resolver backed by a
plain git store, a coordination service, or a non-git record database can implement the same port without changing
the analyzer, JSON, session-init, or integration workflow. Commit OIDs and PR IDs are code-integration linkage, not
the backing store's schema.

Local installs with no `origin` remain valid ARC installations: session-init emits no base-drift recommendation,
while authoritative drift is unavailable because no remote base safety fact exists. That is a code-repository
capability result, not a storage-mode branch. The integration workflow remains machinery rather than operational
state and invokes the same `arc base drift --json` verb at every storage tier. How Local ultimately delivers or
pins machinery changes installation, not this command contract.

The storage direction intentionally leaves its exact record schema, code-linkage fields, composition-root shape,
and Local machinery delivery for their owning work units. Those are not open decisions for this RFC. Its
compatibility obligation is that none of those choices leak above the two semantic ports. If a later storage design
cannot implement the resolver without changing its proof/identity semantics, that is a reason to re-open this RFC
before the storage cutover rather than bake a provisional record shape into the analyzer now.

## Alternatives & Rationale

- **Treat every first-parent commit as one integration.** Rejected because rebase integration replays each WU commit
  onto the first-parent chain, recreating the raw-count problem.
- **Adjust wording while keeping raw counts.** Rejected because it cannot distinguish sibling delivery from
  unrelated base movement and leaves overlap failures dishonest.
- **Enrich session-init only.** Rejected because the authoritative integration gate would retain a second safety
  implementation.
- **Require a host API.** Rejected because credentials and host availability must not control Git safety facts.
- **Treat any archived meta as event proof.** Rejected because manual archive cadence creates a later standalone
  commit with the same delta.
- **Make completed metas permanent analyzer state.** Rejected because managed records will replace the current
  tracked projection.
- **Generalize derived-file classification.** Rejected because there is one current regenerable path and the future
  storage substrate should own any wider projection taxonomy.
- **Reuse `PathSurface`.** Rejected because ownership classification and reconciliation behavior are different
  concerns with different evolution paths.

## Cross-cutting Considerations

### Security and trust boundaries

- Invoke Git with argument arrays; never interpolate commit subjects, paths, URLs, or branch names into a shell.
- Argument arrays are not sufficient for ref safety. Validate the constructed `refs/heads/<base>` with
  `git check-ref-format` (or an equivalent complete ref-format validator), fetch it only into an internally named
  invocation ref without writing `FETCH_HEAD`, and use the immutable fetched OID for all revision reads. Invalid
  config returns typed `invalid-base` without a fetch.
- Treat Git history and meta content as untrusted data. Accept only constrained path shapes and exact PR-number
  grammar, and never execute record content.
- Preserve bounded fetch behavior. No host API, credential read, or additional remote is introduced.
- Fail closed at the integration gate when authoritative distance is unavailable or output is malformed.

### Performance

- Perform one bounded base fetch and one raw distance read per analyzer invocation.
- Use one invocation-owned temporary ref per analyzer call; never serialize independent session probes merely to
  protect `FETCH_HEAD`.
- Skip enhancement work when `behind === 0`.
- Read the first-parent range in one log operation and build any archived-record identity index once per invocation.
- Bound archive blob reads with the completed-index concurrency pattern. Avoid one full archive scan per commit.
- A defensive history cap may reduce identity coverage but must surface `partial` and `truncated`; it cannot alter
  the raw distance or gate verdict.

### Compatibility and migration

- Preserve existing base-distance fields and healthy/degraded state names consumed by session-init tests and JSON.
- Replace `overlappingPaths` only after all in-repo consumers move to the explicit overlap evidence; do not maintain
  two independently computed overlap results.
- Preserve the base-distance envelope slot and precomposed recommendation contract.
- Update both package and self-hosting probe-envelope references with the runtime/type migration; documentation is
  part of the slot contract, not a follow-up.
- Do not add configuration. Advisory versus authoritative behavior is chosen by the consumer.
- Keep package-source and self-hosting workflow copies synchronized according to repository rules.

### Testing

Use injected Git and resolver/classifier ports for unit tests, plus focused CLI integration coverage. The minimum
matrix includes:

- healthy distance states, advisory skip, invalid/option-shaped base config, authoritative fetch failure,
  fetched-OID failure, distance failure, temporary-ref cleanup failure, and authoritative exit codes;
- concurrent fetch probes that overwrite `FETCH_HEAD` or other tracking refs while base drift retains the correct
  invocation-owned base OID, plus deterministic creation and cleanup of the temporary ref;
- merge, squash, and rebase integration shapes crossed with `with-integration` and `manual` archive cadence;
- exact and rejected merge-subject grammar, matching and mismatched squash evidence, duplicate-evidence
  deduplication, later manual archive, resolver failure, scan failure, and truncation;
- storage-neutral resolver fakes, absent/private resolver state, and stale or out-of-range record membership rejected
  without changing the raw verdict;
- disjoint, substantive, regenerable-only, mixed, and unavailable overlap;
- rename versus old-path edit and divergent rename cases with `--no-renames` asserted;
- calm, attention, degraded, and attention-plus-degradation register composition;
- session-init envelope/recommendation behavior, probe-envelope documentation, reconcile-approval and
  integration-approval drift rechecks, and integration-workflow command usage; and
- current `ROADMAP_PATH` classification without adding it to `PathSurface`.

### Rollout

Land the analyzer types and tests before switching consumers. Migrate session-init and the integration workflow in
the same work unit so no second safety implementation remains. No data migration, feature flag, or backward-read
path is required.

Keep the completed-meta reader behind `IntegrationEvidenceResolver`. Before a later storage cutover removes
completed metas from code history, the storage owner can install a managed-record resolver at the composition root;
the analyzer, JSON, and workflows remain unchanged. If provisioning is absent during a transition, evidence
degrades explicitly while raw distance remains authoritative. Removing the tracked readiness projection requires no
analyzer migration because the path simply disappears from code-history overlap.

## Success Criteria

1. A branch behind one merge-integrated sibling reports one integration event rather than presenting every sibling
   commit as an integration.
2. Squash integration is recognized only from matching same-commit archive and PR-subject evidence; later manual
   archive and rebase histories remain explicitly unclassified without stronger evidence.
3. Raw `ahead` / `behind` remains present and exclusively controls `clean` versus `reconcile`.
4. Failed overlap analysis is distinguishable from available empty overlap.
5. Regenerable-only overlap through `ROADMAP_PATH` can render calmly, while any substantive overlap leads with
   attention.
6. Rename versus old-path edit and divergent rename histories cannot produce a false no-overlap result.
7. Partial integration coverage never suppresses substantive contention and never inflates integration count.
8. Session-init and the final integration gate consume the same analyzer without re-deriving Git mechanics.
9. `arc base drift --json` ignores `session.remote_sync`, emits JSON on every outcome, returns non-zero when
   unavailable, and only a fresh post-approval `clean` permits immediate merge invocation.
10. Concurrent Git probes cannot change an invocation's fetched base identity, and every analyzer-owned temporary
    ref is removed or reported as an unavailable cleanup failure.
11. No new configuration, host dependency, permanent readiness-view filename assumption, tracked-archive domain
    contract, or storage-tier branch is introduced.
12. A storage-owned or non-git resolver can replace the completed-meta adapter without changing the analyzer JSON or
    workflows; absent, stale, or private state can only degrade evidence, never the raw verdict.
13. Unit, focused integration, TypeScript, lint, build, and Markdown quality gates pass.

## Open Questions

None. Exact internal filenames and helper decomposition remain implementation choices within the typed contracts
and invariants above.

---
