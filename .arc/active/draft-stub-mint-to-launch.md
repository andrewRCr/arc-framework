# Draft: stub-mint-to-launch

- **Origin:** FP wave-2 slate preparation required repeated protected-base round trips before newly minted work
  units were visible to `arc start`. Live decomposition then reproduced the same handoff problem with a larger,
  dependency-shaped member set.
- **Purpose:** Make publication-to-work continuity explicit and resumable: mint an exact planned set, preserve its
  human anchor across the merge boundary, and launch the selected ready work from any checkout without weakening
  integration approval or turning ARC into a scheduler.

---

## Readiness

- **State:** maturing
- **Resolved:** authority union, command vocabulary, DTI boundary, cohort topology, dependency-derived frontier,
  start composition, retry behavior, and future storage/procedure seams.
- **Open:**
    - Settle the ordinary planned-set claim substrate without creating a dependency cycle with
      `session-locus-model` and its downstream `claimed-sweep-verbs` deliverable.
    - Refresh the DTI-facing contract against the shipped `decompose-transform-integrity` core before adversarial
      review and formalization.
- **Next:** Pause until the direct DTI dependency lands and the claim-substrate delivery order is settled, then
  refresh this draft against the shipped contracts.

## Problem / Motivation

ARC already has sound primitives for creating one backlog stub, publishing a planning change, synchronizing a base,
and starting one known work unit. The operator must nevertheless compose those primitives manually across an
asynchronous merge:

1. create or decompose the intended work;
2. retain the exact member set and its human sequencing anchor;
3. publish and wait for explicit integration;
4. discover that the result landed;
5. synchronize a base checkout;
6. recover which members were intended to continue;
7. re-evaluate dependency readiness; and
8. invoke `arc start` for each selected ready leaf.

The sequence is recoverable in Git, but its intent is not recoverable from Git diffs alone. An ordinary planned-set
mint needs transient exact-set authority across the merge boundary. A retiring decomposition already has durable
transition authority, but its receipt must expose a launch-facing publication projection rather than make the
launcher reinterpret allocation details.

The human-facing problem is larger than remembering slugs. Multi-WU publication can erase the original concern as a
mental anchor, while the immediate continuation and dependency frontier become distributed across member metadata.
Cohort documents should retain the stable sequencing view, but their prose cannot become machine authority for
membership, dependencies, readiness, or state.

## Goals

1. Provide a resumable ordinary planned-set mint path under both full and partial branch protection.
2. Resolve an exact landed publication from a stable logical anchor, regardless of whether a planning claim or a
   decomposition receipt authorizes it.
3. Present the sealed initial continuation, other ready entries, and blocked entries from fresh authoritative
   metadata.
4. Compose zero or more ordinary single-WU starts without redefining their lifecycle semantics.
5. Preserve explicit integration approval and make every mutation safe for no-input use.
6. Materialize complete cohort topology without asking workflows to synthesize paths or structural prose.
7. Keep the design storage-agnostic, provider-neutral, and compilable by the future workflow-agenda substrate.

## Design Center

### Start is the leaf primitive; launch is publication orchestration

`arc start <wu>` continues to transition one known work unit. The new higher-order verb is:

```text
arc launch <anchor>
```

Launch resolves and orients one publication, then composes zero or more starts. The name matches ARC's existing
session vocabulary: a launch includes recon, readiness, and handoff, while a start is the concrete lifecycle
transition underneath it. Names such as `co-start`, `multi-start`, and `batch-start` incorrectly imply simultaneous
or necessarily plural mutation.

### Publication authority is a typed union

The launcher accepts two authorities and does not pretend that every publication has the same history:

```text
PublicationAuthority =
  planning-claim
  | decomposition-receipt
```

- A **planning claim** is transient authority for one ordinary planned-set mint. It remains until the selected
  publication handoff succeeds or its sealed disposition is explicitly none.
- A **decomposition receipt** is DTI's durable retirement history. Launch consumes its closed
  `DecompositionPublication` projection and never retires or rewrites the receipt.

Extraction is deliberately absent. DTI gives extraction no retirement receipt, and the separate extraction work
will decide whether exact-set claims can be reused without an extraction ledger. Manually bootstrapped sets likewise
receive no fabricated authority.

Both arms normalize into a launch projection:

```text
LaunchPublication =
  logical anchor
  + exact launch-entry set
  + sealed initial continuation
  + authority-specific disposition policy
  + freshly derived frontier
```

The authority stores logical identities, never a movable display path. The launcher resolves the current path from
the landed project view and treats zero, ambiguous, malformed, or conflicting authorities as a refusal.

### Facts and orientation remain separate

Member metadata is authoritative for membership, `Depends On`, priority, lifecycle state, and readiness. The cohort
document is the durable human view of purpose, sequencing, shared constraints, and closeout. The launcher may present
that orientation, but it never parses coordination prose to decide what exists or what can start.

## Proposed Design

### D1. Extend the exact-set grooming substrate with planned-set minting

Reuse the identity and compare-and-swap machinery behind the current exact-set grooming claim. Add a discriminated
`planned-set-mint` purpose rather than a new top-level identity family and rather than changing ordinary
`arc plan open` to accept nonexistent stubs.

This is the preferred contract shape, but the implementation audited during drafting exists only on the
`session-locus-model` donor branch and is assigned to its downstream `claimed-sweep-verbs` deliverable. It is not
landed substrate. Because `session-locus-model` is itself informally sequenced after this work, this WU cannot take a
whole-WU dependency on it without creating a cycle. Before spec formalization, settle whether:

- this WU publishes the claim requirements first and later consumes a landed `claimed-sweep-verbs` seam;
- the minimal publication-claim slice moves here while the generic locus/sweep machinery remains downstream; or
- ordinary planned-set minting becomes a dependent follow-up while receipt-backed launch ships here.

Do not implement a second transient-record system merely to preserve the current WU boundary.

The public entry is a sibling operation:

```text
arc plan mint <anchor> --manifest <file> [--json]
```

The versioned manifest carries logical member descriptors, an optional cohort placement request, dependency edges,
and an initial continuation of member slugs or explicit none. It contains no generated file paths. The command
validates the entire descriptor set before claiming identity or mutating a checkout, then persists the normalized
logical inputs in the claim so interruption does not require reconstructing intent from an incomplete tree.

The anchor is a logical publication identity. A singleton normally uses its member slug; a cohort-backed set
normally uses its cohort identity; a cohortless multi-member set supplies an explicit set anchor. The claim rejects
another live generation for the same anchor and exact-set conflicts with another active claim.

Planned-set minting creates planned stubs because only planned work is launchable. Provisional capture remains the
existing single-stub path and does not acquire publication machinery. Where minting redistributes an existing
concern, commitment inherits from the origin unless an upstream semantic interlock explicitly selects another
supported disposition; dependency or scheduling facts never silently demote commitment.

### D2. Materialize ordinary cohort topology through DTI's reusable seam

After `decompose-transform-integrity` lands, planned-set minting consumes its typed topology planner/materializer:

- exact coordination and optional parent-document identities;
- ordered create, reuse, at-cap provenance, or no-op actions;
- canonical scaffolds whose Purpose floor is explicitly incomplete;
- preservation of every existing document; and
- finalization refusal until required Purpose floors are authored.

The mint manifest makes the grouping judgment; the materializer only projects the selected topology. It does not
invent Purpose, sequencing, shared contracts, or member prose.

Normal cohort and subcohort placement creates or reuses the constitutive document at every level. At the two-segment
cap, an anchor-keyed fan-out block in the existing parent document preserves orientation without adding a third
cohort segment. A multi-member ordinary planned set may remain cohortless when it has no ownerless shared
coordination; its transient publication anchor carries the merge-to-launch handoff.

The existing `arc stub --cohort` path is repaired independently to accept the canonical one- or two-segment cohort
value. It shares path validation and layout projection with the topology seam rather than reparsing the value as a
single slug.

### D3. Preserve the planning claim through publication

The planned-set variant composes the existing grooming locus and publication tail:

- full protection uses an isolated `chore/groom-<anchor>` publication branch and change request;
- partial protection writes through the configured base path;
- changed-path validation admits only the exact member artifacts and all topology paths projected by the
  materializer; and
- local occupancy can close without erasing the publication claim.

Ordinary grooming retains its current close behavior. The planned-set variant instead advances to a launch-waiting
state that binds the exact publication generation and, under full protection, its change request. It remains
resolvable after the local grooming checkout closes.

Publication close still stops at the existing integration interlock. No mint, close, or launch flag grants merge
authority. An open change request yields an awaiting-publication result; a closed-unmerged request refuses with an
abandon/reopen remedy; a merged request must be reachable from the freshly resolved integration base before launch
continues.

### D4. Consume DTI's closed decomposition publication

DTI owns the decomposition-side inputs:

- the durable origin anchor and whether it is cohort-, at-cap-, or other supported anchor topology;
- the exact launch-entry set;
- the dependency facts available at finalization;
- the distribution-interlock selection of member slugs or explicit none; and
- the closed `DecompositionPublication` projection in the finalized v3 receipt.

The receipt stores logical anchor identity and exact entries, never a path that will move as artifacts graduate.
Launch validates the landed v3 receipt through DTI's shared validator and consumes its projection. It does not read
the cut map, reinterpret allocations, create topology, or infer launch authority from a result diff.

Legacy decomposition receipts receive no new launch authority. Extraction and the current manual bootstrap split
remain manual until their own authoritative substrate exists.

### D5. Resolve one fresh launch projection

`arc launch <anchor>` works from any attached checkout. It:

1. refreshes and pins the configured integration base;
2. resolves exactly one supported publication authority by logical anchor;
3. verifies that its publication is landed or reports the current publication wait state;
4. re-resolves the anchor's current display path;
5. validates the exact launch-entry set against the landed project view;
6. recomputes lifecycle and dependency readiness from member metadata; and
7. emits one closed projection for presentation or execution.

The projection groups unstarted entries as:

- **continue now** — the sealed initial-continuation members that remain ready;
- **parallel-ready** — other entries that are ready but were not selected for initial continuation; and
- **blocked** — entries whose current lifecycle or dependency facts prevent start, with exact blockers.

Already-started entries are reported separately so retry can distinguish completed handoff work from an incomplete
publication. A selected member that is now blocked refuses execution; launch never silently substitutes a
parallel-ready member. Missing, completed, parked, or otherwise inconsistent entries also fail through typed
lifecycle outcomes rather than being coerced into readiness.

The base-derived projection is always recomputed. Neither authority stores a mutable frontier, scheduler state, or
cached readiness verdict.

### D6. Define the launch command's interaction contract

The command surface is:

```text
arc launch <anchor>
arc launch <anchor> --initial
arc launch <anchor> --include <slug...>
arc launch <anchor> --none
arc launch <anchor> --json
```

The selection flags are mutually exclusive:

- a bare interactive call presents the projection and offers the sealed initial continuation, a ready subset of
  that continuation, or deferral; a planning claim may additionally be dismissed with explicit none;
- `--initial` selects every still-pending member in the sealed member continuation;
- `--include` selects an exact non-empty subset of the sealed member continuation;
- `--none` acknowledges a continuation already sealed as explicit none; for a planning claim only, it may instead
  record the publisher's terminal decision not to launch and retire that transient claim; a decomposition receipt's
  sealed member selection is immutable; and
- bare `--json` is read-only, while `--json` plus an explicit selection performs that action and returns the typed
  result.

No-input mutation requires one explicit selection flag. Every selected slug must belong to the sealed continuation
and be ready in the same pre-mutation projection. Parallel-ready entries are orientation, not an invitation for the
launcher to revise the upstream selection; they remain directly startable through `arc start` if a later operator
chooses a different course.

Deferral is not a durable scheduler disposition: it exits without changing authority, and the same command resumes
later. Explicit none is durable either because DTI sealed it at the distribution interlock or because a
version-checked planning-claim retirement records the publisher's terminal handoff decision. The launcher creates no
separate status record.

### D7. Extract and compose the single-WU start core

The current `arc start` handler owns presentation, prompting, base resolution, lifecycle dispatch, and mutation in
one surface. Launch must not shell out to that handler or duplicate its graduation logic.

Extract a typed, presentation-free start operation that accepts an already resolved target and pinned base
projection. Both `arc start` and `arc launch` call it. DTI's corrected start-stage derivation remains inside this
shared substrate:

- preserve a valid recorded planning workflow;
- derive `generate-tasks` from an all-spec design family when workflow is unset;
- derive `draft-design` from draft or absent design when workflow is unset;
- refuse inconsistent metadata/design tuples; and
- preserve provisional `tasks-*` content while leaving `Task List: [none]` until normal task-list finalization.

Launch prevalidates the whole requested selection, then invokes starts sequentially in publication order. The
operation is deliberately not transactional: each start creates its own branch, worktree, ceremony commit, and
push. It stops on the first failure and reports started, pending, and failed entries. Re-entry recomputes live state,
treats already-started selected entries as idempotent success, and continues only the pending suffix.

Before the first start, the mutation path composes the typed base-sync operation, re-pins the resulting base, and
revalidates the launch projection. The read-only projection may inspect the freshly fetched remote base without
mutating a local checkout; an action never starts from a merely observed but locally unsynchronized base.

Under a planning claim, successful completion of the sealed continuation—or a permitted terminal
`--none`—retires the transient claim with a version-checked write. A partial launch retains it. A decomposition
receipt always remains durable history.

### D8. Keep agent orchestration thin and compilable

The agent-facing peer is:

```text
$arc-session --launch <anchor>
```

It performs judgmental recon and presents the CLI's projection, then invokes the same launch mutation. It does not
implement a second resolver, recompute dependencies, inspect Git topology, or write prompt templates around raw
fields.

All deterministic behavior lives in typed CLI/library code; emitted prompts and remedies are precomposed there.
Workflow prose contains only invocation, interpretation of closed outcomes, human orientation, and interlock
placement. The projection can therefore become a future agenda/compiler input without redesign. Re-entry is
re-invocation with the same anchor and explicit signals.

Automatic monitoring and resident scheduling remain outside scope. A future engine could repeatedly resolve this
projection, but this work adds no daemon, subscription, polling state, or persistent launch ledger.

### D9. Make failure and retry states explicit

The launch result distinguishes:

- **awaiting publication** — the planning change is still open or not yet reachable from the pinned base;
- **launch-ready** — authority, entries, and frontier validate;
- **blocked selection** — one or more selected entries are not ready, with exact blockers;
- **partial launch** — a prefix started and one member failed, with safe retry guidance;
- **complete** — the sealed member continuation started, or sealed none was acknowledged;
- **unsupported authority** — extraction, manual sets, or legacy receipts have no launch contract;
- **authority conflict** — zero, multiple, malformed, or mutually inconsistent authorities; and
- **publication drift** — landed entries no longer match the exact authority.

Base synchronization is a typed operation, not an instruction to change the invoking checkout by hand. Retrying an
unchanged state is idempotent and preserves the same human anchor. Refusals name the immediate safe action and never
guess from cohort prose, branch names, or historical diffs.

## Alternatives

- **Add `--launch` directly to `arc stub` and `arc decompose`.** Rejected. Integration is asynchronous, so a
  mint-time flag cannot safely bridge process, checkout, or session loss without publication authority and a
  resumable post-merge operation.
- **Make `arc start` accept a cohort or arbitrary list.** Rejected. It would overload a single-WU lifecycle
  transition with publication lookup, waiting, readiness orientation, and partial multi-target outcomes.
- **Call the command `co-start`, `multi-start`, or `batch-start`.** Rejected. Launch may start zero, one, or several
  entries and is not limited to cohorts or atomic batch behavior.
- **Infer the set from a PR diff or cohort document.** Rejected. Diffs are transport evidence, and cohort prose is
  orientation; neither is exact publication authority.
- **Give every path a common launch receipt.** Rejected. Ordinary mint claims are transient, decomposition receipts
  are durable history, and extraction intentionally has neither. The typed union preserves those lifecycle
  differences.
- **Persist readiness or launch status.** Rejected. Member metadata already owns the facts, and a fresh projection
  makes retries reliable without a second scheduler.
- **Wait for composable workflows or a resident engine.** Rejected. The typed projection and thin workflow are the
  compatible precursor; the current operator friction is real and does not require the future runtime.

## Unknowns and Assumptions

- DTI's in-flight finalized v3 receipt will expose the accepted `DecompositionPublication` boundary. This work
  depends on that contract rather than duplicating it.
- The exact-set grooming implementation on the `session-locus-model` donor is design evidence, not a dependency.
  Its eventual `claimed-sweep-verbs` surface is the preferred planned-set substrate only if the delivery graph can
  consume it without cycling.
- Host change-request observation remains behind the existing provider-neutral lifecycle port. No external PM fact
  becomes authoritative here.
- A start remains an independently committed and pushed lifecycle ceremony. Multi-start atomicity is neither
  available nor desired.

## Boundaries

- Do not authorize or perform integration.
- Do not decide whether decomposition or cohort formation is semantically appropriate.
- Do not own DTI topology planning, receipt validation, allocation, or start-stage derivation.
- Do not parse cohort sequencing prose as authority.
- Do not automate extraction or fabricate authority for the current manual decomposition bootstrap.
- Do not add external tracker synchronization, a storage mode, a configuration axis, or a persistent service.
- Do not turn launch into a scheduler, background monitor, or general multi-command transaction.

## Forward Compatibility

- **Storage:** authorities are versioned logical records; paths are resolved projections. Claim mutation is
  compare-and-swap, and no workflow assumes tracked `.arc/` is the canonical store.
- **Procedure:** CLI code owns conditionals, topology, readiness, sequencing, prompts, and remedies. The agent
  receives a closed result and contributes only judgment and communication.
- **Composable workflows:** the read-only launch projection is a natural compiled-agenda input; action flags are
  explicit invocation signals, and re-entry reruns the same operation.
- **PM composition:** launch reads ARC's agent-native WU lifecycle facts and introduces no competing portfolio
  authority. Provider observation remains typed and provider-neutral.

## Cohort-Fit Disposition

The implementation has several review surfaces—claim specialization, topology consumption, launch resolution, and
start composition—but they form one end-to-end publication-handoff contract and share the same authority
projection. The two-segment parser correction is below independent WU warrant. The result stays one Heavy work unit,
using task and commit boundaries to keep review increments small.

If implementation grounding reveals that planned-set publication or launch can ship independently without a
temporary duplicate authority, that is a real decomposition tripwire. The current manual split cost is not paid
speculatively while DTI is repairing the decomposition machinery this work consumes.

## Scope Estimate

Large: approximately 5,000–9,000 changed lines across typed records and projections, the planned-set mint adapter,
launch resolution/execution, shared start-core extraction, command registration, workflow/skill surfaces, and
unit/integration/E2E coverage. A plausible upper tail is roughly 10,000–12,000 lines if the current start handler or
grooming tail needs more extraction than expected.

The direct hard dependency is the surviving `decompose-transform-integrity` core: it owns topology materialization,
corrected start semantics, and the closed decomposition publication projection. Its base-mobility, extraction,
planning-lane, and durable-consumer cohort members are not required by this design.

`session-locus-model` is explicitly not a hard dependency: its current delivery order waits informally on this WU.
The possible claim-substrate dependency is the later `claimed-sweep-verbs` deliverable, and must remain unresolved
until the two directions are sequenced without a cycle.

`composable-workflows` is a compatibility target, not a sequencing dependency.

## Success Signal

From a checkout that did not author the publication, an operator can run `arc launch <anchor>` before or after merge
and receive the same durable orientation. Once the exact publication is landed, `arc launch <anchor> --initial`
synchronizes the base projection, starts only the sealed ready entries through ordinary start semantics, refuses
blocked or drifted selections without substitution, resumes safely after partial success, and retires only transient
planning authority. The same behavior works from a DTI receipt without rewriting its durable history.

---
