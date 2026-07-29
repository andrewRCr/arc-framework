# Notes: session-locus-model

## Contents

- [Codebase pointers](#codebase-pointers)
- [Dogfood evidence trail](#dogfood-evidence-trail)
- [Adjacent work and shipped substrate](#adjacent-work-and-shipped-substrate)
- [Expected base-merge reconciles](#expected-base-merge-reconciles)
- [Right-sizing audit (2026-07-22)](#right-sizing-audit-2026-07-22)
- [Chunked-review finding triage (2026-07-24)](#chunked-review-finding-triage-2026-07-24)
- [Decomposition into a delivery stack (2026-07-25)](#decomposition-into-a-delivery-stack-2026-07-25)
- [Proportionate delivery cut (2026-07-26)](#proportionate-delivery-cut-2026-07-26)
- [Delivery topology and sequence (2026-07-26)](#delivery-topology-and-sequence-2026-07-26)

## Codebase pointers

- **Grooming-as-residue misclassification** — `in-flight-derivation.ts:1303` emits a cleanup-needed advisory for
  the sanctioned `chore/groom-*` branch because residue detection reads branch shape, not records; it re-fires on
  effectively every CLI invocation (observed 5× in one session, 2026-07-15), and `arc start` mislabels the emission
  a "ROADMAP advisory". The durable fix (Proposed Design D8/D11) is records-based classification — detectors read
  the groom-kind identity record plus the machine-local role, never branch shape.
- **Raw materialize arm** — session-init's Errand materialization currently uses raw `git worktree add`, producing
  markerless worktrees invisible to cleanup surfaces (a self-teardown can leave a markerless husk). D7 replaces it
  with `arc errand materialize`, which writes the ownership marker plus role record at creation.
- **Marker vs. record** — the ownership marker is durable provenance the sweep trusts; the locus record is the live
  frame. They stay distinct artifacts written at the same creation site.

## Dogfood evidence trail

The model was motivated by FP (finalize-parallelism) wave-2/wave-3 dogfooding; the full findings live in
`notes-finalize-parallelism.md`. Key references for design rationale during task-gen/execution:

- **§ Dogfood finding (2026-07-14)** — the originating wave-2 failures: warm `errand open` displaced the WU worktree
  onto the errand branch and hard-blocked on the WU's uncommitted notes; `errand close` died on `git switch main`
  (base held by the primary); a mid-errand compaction recovered errand context only — the suspended WU frame
  survived only in the harness summary. All were checkout-identity failures, not model failures.
- **§ Wave-3 seam-audit decisions (decision 5.3, 2026-07-17)** — settled the serialized-primary default over
  ephemeral-worktree-by-default: out-of-WU work occupies the free primary, one session at a time; warm entries are
  occupancy-keyed (relocate to the free primary, else spawn), not temperature-keyed; spawn is the non-default
  fallback; the sequential drain is codified, addressing "sequential feels slow" by tightening per-errand overhead
  rather than by parallelism. This is why the default (D1/D7) is primary-serialized with spawn as fallback.
- **§ 7.3** — the linked-session husk/orphan cleanup gate: cleanup surfaces render only in the primary worktree,
  invisible to operators in linked worktrees; FP preserved that boundary expecting this record's read verb to lift
  it eventually (a `husk-lifecycle-drivers` seam, not owned here).

## Adjacent work and shipped substrate

- **Mechanization errands around the model** (not this WU's execution): the base-sync verb and `stub-mint-to-launch`
  (in `backlog/planned/`) are determinate mechanization errands; a near-term residue-detector patch (teach the
  detector the `chore/groom-*` shape, dedup the emission, fix the `arc start` provenance label) is a stopgap around
  the durable records-based fix this WU ships.
- **Shipped substrate this builds on**: BI-1 worktree provisioning (spawn/teardown cost dismantled — spawn is cheap
  now), `worktree-teardown-decoupling` (the shipped-husk transition plus the driver socket the lease composes with),
  and PR #241 (the v2 `returnBranch` topological close fix — consumed as the degrade-path shape, superseded for the
  default by displacement removal).

## Expected base-merge reconciles

Known textual conflicts to expect when merging the base in, with the disposition already settled — resolve to these
rather than re-deriving at merge time.

- **`session-recover.md` § 2 and § 3** (from the `recovery-read-contract` errand, PR #339, 2026-07-23). That errand
  corrected the § 2 `ready`-verdict phrasing on the base and added a § 3 ceiling paragraph bounding the recovery read
  to its manifest. This branch edits both regions: it adds a paragraph immediately after the § 2 `ready` line and
  rewrites § 5's resume dispatch. Expect a small conflict in the § 2 hunk.
    - **Take both.** The § 2 fix and the `verdict.locusHint` paragraph are complementary — `ready` attests the load
      set, `locusHint` attests the frame — and this branch still carries the misleading bare "continue without
      prompting" that the fix corrects, so the base wins that sentence. The § 3 ceiling is orthogonal to the locus
      rewrite and survives intact; this branch's own § 3 edits are two-word rewordings.

## Right-sizing audit (2026-07-22)

Standalone `design-audit` run over the spec and the delivered implementation against the draft's motivating
intent, ahead of verification — prompted by the disproportion pattern remediated in `review-architecture`.
Efficacy holds: all six motivating failures (worktree displacement, base-held close failure, lost suspended
frame, groom-residue misclassification, markerless materialization, cleanup-vs-live-session) are solved. The
findings are fit/optimality: the spec answered every question the draft deliberately left open at the
maximum-exactness end of the range, and several operator-facing surfaces pay for guarantees the single-operator,
machine-local domain does not need. Phase 7.R carries the remediation; task letters below.

Major findings:

- **Lease scope gap (7.R.b)** — spec D4/D11 expect session-init to attach/refresh the session lease; the shipped
  workflow attaches only on a resolved live-lease match, which a fresh session never produces. Plain WU sessions
  therefore run leaseless (`frame: idle` on a live checkout), leaving the liveness apparatus mainline-idle and the
  roster's session-visibility goal unmet. Resolution: ratify verb-scoped leases and align spec, workflow, and
  narration claims.
- **Warm-entry capability table (7.R.c)** — hard `cold-entry-required` refusal keyed to harness process forensics;
  table churn began pre-ship (`f6d6bda87`). Demote to an operator-confirmed advisory.
- **Awaiting-merge rigidity (7.R.d)** — resume/materialize demand host-proven `requested-work`, so a plain-open
  own PR cannot be resumed to push one more commit. Relax to open-change-request-at-recorded-head; host truth
  stays required only where identity retires.
- **Housekeep plan-commitment protocol (7.R.e)** — canonical plan file, per-entry source digests, immutable plan
  digest, persisted monotonic lane, and dispatch IDs protect against a mid-sweep interruption whose real cost is
  re-confirming a list. Trim to execute-bound marking plus one-live-sweep serialization.
- **Groom overlap arbitration (7.R.f)** — cross-machine unique-winner CAS with exact-set retry adoption, for a
  race a single operator cannot meaningfully lose. Trim to same-key/overlapping-member conflict semantics.

Minor: `locusGuidance` renders non-actionable litany every init — seven `worktree-without-role` diagnostics plus
per-row no-deletion-authority cleanup lines in this repo (7.R.h); routine narration presents bare "locus" to the
operator (7.R.g); `heartbeatAt` changes no verdict and grants nothing (kept as-is; do not extend).

Keep-list (retained deliberately; do not extend): platform inspectors and PID-plus-start-token liveness, the
record store with atomic replace plus record-scoped locks and stale-break protocol, staged provisioning receipts,
teardown linearization, determinism/sorting rules, the v3 identity state model and complete-basis transaction
core, and the `arc locus` reader with typed session-init verdicts. These are internal, tested, and
friction-neutral; deleting them buys churn, not simplicity. Guiding boundary for future edits: full exactness on
data-destroying paths; advisory or simple-conflict semantics on operator-facing routine paths.

## Chunked-review finding triage (2026-07-24)

The chunked-review hierarchy reviewed this branch pinned at `0c5dd045a` against base `ebe446fe2` and returned 66
deduplicated findings with a `changes-requested` whole-target verdict. The reviewing effort classified its own
mechanics **supports-scalability**: 17 leaf contexts, four root seams, and one top seam reconstructed a coherent
verdict over 43,754 changed lines without any leaf reporting partiality, context overload, or malformed scope.
Finding density is outcome evidence, not a reviewability failure.

**Packet standing.** The packet is advisory, SHA-bound, and never satisfies a review obligation on its own — every
item is verified against source before any fix is applied. Two independent spot checks confirmed its calibration:
the probe adapter does throw on the unverifiable anchor its own reader accepts, and in-place resume does supply
`attachSession` and `deferCheckout` together into a driver that rejects the un-switched branch.

**Decay is smaller than the packet's own warning implies.** The only delta between the reviewed head and the
branch tip is the handoff commit's meta edit, so every reviewed line of code is unchanged. Base reconcile adds
little: of the sibling's changed runtime files only `cli.ts` and `init-recipe.json` are named in any finding, and
the remaining base integrations carry no substantive overlap. Post-reconcile revalidation therefore lands on a
handful of loci rather than the whole set.

### Root causes, not 66 independent defects

The findings restate a small number of causes across leaves; fixing by cause is what keeps the remediation
bounded. Some findings sit in two causes — the grouping drives the work, it is not a partition.

- **Unknown collapsed into absent** — an error or unverifiable state renders as empty or default instead of
  stopping or surfacing unknown.
- **Destructive dispatch without exact proof** — a mutation that can delete or overwrite work proceeds on evidence
  gathered before the lock that authorizes it.
- **Mutation before proof, with no compensation** — external state changes ahead of its authorizing proof, and a
  post-mutation failure leaves durable residue with no replay path.
- **Receipts that misdescribe the operation** — outcomes derive from one stage rather than the whole transaction,
  so a command reports idempotent after authoritative local change.
- **Typed boundaries that leak** — errors escape the declared vocabulary, and success shapes validate without the
  authority coordinates a caller needs.
- **Anchor identification** — wrapper and shell classification can bind a lease to a short-lived process.
- **Claims that outrun the code** — spec, workflow, quick-reference, and distribution assertions that the
  implementation does not meet.
- **Tests asserting the double** — the reason a 66-defect branch held a green suite: the resume round-trip injects
  an always-successful driver, the current-open e2e cases seed legacy records, and a rewrite dropped the
  derivation-floor integration coverage.

### Disposition

- **59 in scope** — Phase 7.E in `tasks-session-locus-model.md`. Everything destructive, every named path that
  does not work, and every claim the work unit makes about itself that is false.
- **6 carved** to a follow-on unit — the systematic generation-capability contract and its failure-injection test
  substrate: `L4-F2` (≡ `A-F2`), `L4-F4`, `A-F4`, `E4-F2`, `W1-F5`, and the whole-lifecycle portion of `P1-V1`.
- **1 already resolved** — `R1-F5`, corrected by the handoff commit that follows the reviewed head.
- **2 did not reproduce** — `S2S1-002` and `L4-F3`, rejected on verification during Phase 7.E execution (below).

**`S2S1-002` does not reproduce.** The finding reads a hard-coded `activeExtensions: []` in the recovery base
manifest as dropped context that both the seed and the fresh load set then agree on. `resolveLoadSetManifest`
declares that input and never reads it: extension bodies are excluded from every load set by design, and
active-extension names reach workflows through the status envelope's own extensions slot. Both the work-unit
projection and the recovery base call that same function, so an empty set and a populated one produce identical
manifests — verified by a temporary invariance check over both the execution and between-work-units shapes. The
compaction seed carries no extensions field at all, so there is nothing to drift and nothing for the audit to
agree on incorrectly. What was real is the inverse of the prescribed fix: a required parameter no output depended
on, threaded through eighteen files. It was removed rather than populated, which makes the exclusion structural.

**Why the carve is decomposition rather than deferral.** The carved set is one design question — what exact
generation capability every mutator carries, and where it is revalidated under lock — plus the failure-injection
and replay substrate needed to prove it. That is spec-worthy on its own terms, it does not exist in the tree
today, and authoring it under merge pressure on a branch this size is the disproportion that produced this
situation. The carved items are races between concurrent sessions whose consequence is a stolen lease, a stale
receipt, or a lost marker generation; every member whose consequence is destroyed or stranded work stayed in
scope, including `L2-F1`, `E2-F2`, `E3-F2`, `E4-F1`, and `E5-F1`. Each Phase 7.E fix still carries targeted
coverage for the path it touches — only the systematic injection matrix is carved.

**Recorded risk of the carve:** the model ships with known non-destructive race windows between concurrent
sessions on the same machine. This is a stated position, not an oversight.

### Remediation shape

The leaf partition is reusable as a delivery map, not only a review map. Each Phase 7.E task decomposes into
leaf-scoped subtasks at entry, so its re-review is a bounded delta against that leaf's preserved report rather
than a fresh pass over the whole target. That keeps the post-fix review obligation proportional to the fix delta
and closes the loop with the method this branch motivated.

**`L4-F3` does not reproduce.** The finding asserted, with no cited mechanism, that live and unknown record locks
let spawned rollback remove a competing checkout. Both sides of the path refute it: a lock refusal returns
`identity-only` evidence, and `canRollbackSpawnedRecordFailure` demands `marker-record-mismatch` before any
rollback runs, so the lock arm never reaches one. Independently, `rollbackSpawn` only touches a worktree this
invocation created — a pre-existing checkout leaves `created` null and is skipped. The spawned path was already
sound in precisely the way its primary sibling was not, because `LinkedWorktreeCreationReceipt` has always carried
its branch name while `PrimaryCheckoutReceipt` did not. Characterization tests now pin it; both passed on first
write, so they guard the behavior rather than evidence a fix. Two of the packet's findings have now been rejected
on verification, both of them ones whose stated mechanism was absent from the report.

### `7.E.c.i` carve boundary — settled 2026-07-24

`L2-F1`'s correction boundary reads "carry an exact generation capability into every subject driver and
revalidate it before identity, ref, checkout, teardown, or role-pop mutation" — wording indistinguishable from the
systematic generation-capability contract carved to a follow-on unit with `L4-F2`, `L4-F4`, `A-F4`, `E4-F2`, and
`W1-F5`. Read literally, the leaf rebuilds what the carve exists to defer. Source says otherwise.

**The capability is already carried and revalidated on all three abandon paths.** `abandon-runtime.ts` re-reads
the record under its lock and compares `recordId` and `checkoutPath`; `housekeep/lifecycle-runtime.ts` and
`groom/close-runtime.ts` both check marker provenance against `{slug, claimId}` and HEAD against `expectedHead`,
then call `popOwnedLocusRole` with `recordId`, an `expectedSubject` carrying the claim, and `expectedLeaseId`.
Every one proves an exact generation before its destructive pop.

**The defect is one degree narrower than the finding states.** Each driver derives its expected generation from
its _own_ roster read by slug rather than from the generation the resolve path selected and validated, so each is
internally consistent but unbound to the caller's selection. The race window is exactly between those two
selections. `resolveLocusGeneration` validates record, lease, claim, and checkout, then discards all of it and
dispatches with `(subject, action, key)`.

**Fix shape:** thread the already-validated identifiers into the three drivers and have each assert its
re-derived generation equals the caller's, refusing on mismatch. The `resume` arm of the same dispatch is the
working precedent — it binds record and lease under lock and refuses with "the dead transient generation changed
before resume." A resolve-side pre-check is **not** viable: all three drivers acquire the same record lock
themselves, so locking before dispatch deadlocks or refuses against itself. Revalidation can only happen inside
each driver, under the lock it already takes.

**Stop tripwire.** Re-carve to the follow-on unit if the fix requires _either_ introducing a shared capability
type or abstraction, _or_ touching any mutator outside the three abandon drivers. Neither should be necessary:
the values exist on both sides of the seam, and the race is constructible deterministically by replacing the
record between selection and dispatch, so no failure-injection substrate is needed.

**Where each driver derives its expected values** — traced to source, and the answer is uniform: none accepted an
externally supplied generation. Each reads its identity record by slug (`groom-<stub>` for grooming), takes the
`claimId` from that record, performs its own `readLocusState`, and selects a row by `{subject.kind, key, claimId}`
— `exactResidue`, `exactHousekeepRow` / `exactPartialHousekeepRow`, `exactGroomRow`. The under-lock checks then
compare against _that_ row, so each was internally consistent and unbound to the caller. The partial-housekeep arm
was the weakest: it matches on slug alone, with no claim at all. `recordId` is a digest of the checkout path, so
the pair `{recordId, leaseId}` pins checkout and generation respectively; comparing the driver's row to the
caller's selection binds the driver's later locked read transitively, which is why no second under-lock comparison
was needed.

**Deviation from the fix shape, recorded:** the settled shape said "have each assert." The three assertions were
byte-identical, so the comparison landed as one pure helper (`locus/selected-generation.ts`) with each driver still
rendering its own refusal and operation. The tripwire fires on a shared capability _contract_ — an obligation on
every mutator plus revalidation machinery — which this is not: it introduces no obligation outside the three
abandon drivers and no new concept beyond "the generation the caller selected."

### `7.E.c.v` E3-F2 predicate — settled 2026-07-25

E3-F2's correction boundary reads "prove occupancy absence" before close deletes refs, inbox state, and identity.
Taken literally it contradicts shipped behavior: `7.F.a.iii` deliberately has close finalize from **inside its own
still-occupied checkout**, retiring the identity and leaving the locus role to the recovery replay path. That is
the path this branch dogfooded live — an errand whose PR merged while its checkout was still occupied has no other
terminal. A plain absence check would make the shape `7.F.a` exists to enable refuse itself.

Settled reading: refuse only on occupancy by a generation that is **not the caller's own**. The finding's stated
risk is a branch deleted "beneath a retained or live checkout" — a foreign one — which the narrower predicate
covers while leaving in-place close intact. This is the same authority idiom `7.E.c.iv` applied to partial
settlement: the question is never _is it occupied_ but _is it mine_.

Recorded because it is an interpretation of the finding rather than a restatement of it, and because the naive
reading is the one a later session would arrive at from the finding text alone.

### `7.E.c.iii` scope boundary — settled 2026-07-24

`S2-F2`'s correction boundary reads "apply the complete locus occupancy veto before emitting a removable
decision," and Success Criterion 9 pairs that veto with holding the target locus lock across the final
expected-generation recheck, physical removal, and role pop. Only the first half is this leaf's: the sweep is an
advisory that computes candidates outside any lock, and D10 says so explicitly. The lock linearization is the
guarded remover's, and it already exists — `retireCheckoutSessionLocus` re-reads the record under lock, refuses on
role/lease generation change, and refuses any lease that is not dead. The finding's own impact statement assumes
it ("even if a later guarded remover would refuse"), so the defect is that the advisory offers what the remover
would then refuse, not that removal is unguarded.

**Where the veto reads occupancy from.** `classifyTeardownOccupancy` is the same veto over raw evidence, keyed to
one subject; the sweep holds the already-read `LocusStateV1` projection and no subject, so a second evidence
acquisition per candidate would be both expensive and a different seam. `locusOccupancyAtPath` is the projection
analogue, deliberately returning the same three-way vocabulary (`clear` / `suppress` / `manual`) so the advisory
and the guarded remover cannot drift apart in what they permit.

**Applied to every removable emission, not only the retained-role path.** The finding names the retained-role
composition because that is where an exact row is reduced to a name, but both candidate sources merge into one
decision site and the roster-sourced arm consults no locus row at all. Vetoing per candidate covers both, and the
husk emission takes the same veto — `decideHuskCleanup` can also return `removable`. Trust reuses
`projectTrustedLocusRow` rather than a second predicate, so a diagnostic added to either published enum vetoes
cleanup without another edit here.

**`locusState` became a required option.** An omitted projection silently skipped the veto — the same
unknown-collapsed-into-absent shape the packet names as a root cause — and the type is what forecloses it. Only
the status handler constructs the sweep in production and it already passed the value; the change is a test-side
edit plus a removed `as LocusStateV1` cast.

## Decomposition into a delivery stack (2026-07-25)

> **Historical analysis.** The ownership carve and construction proof below remain evidence; their three-work-unit
> and standing-stack execution instructions are superseded by § Delivery topology and sequence.

The branch stands at 195 commits and +48,254 / −3,587 across 366 files — 21,789 source lines, 21,213 test lines,
83 new source modules. Standing question ahead of the remaining Phase 7.E work: is that volume proportionate to
the design intent, and is the remediation set evidence of doubling down on a scoping mistake? Answered by a
capability inventory over the delivered surface, then a detachability trace. Recorded here because the conclusion
changes what ships, not merely how it is built.

### The size is scope absorption, not overdesign

The right-sizing audit above measured exactness against the spec's intent and found efficacy intact. It did not
ask the scope question, because it took the spec's scope as given. The module split answers it:

- `lib/locus` (6,893) is the design intent — the record substrate solving four of the six motivating failures.
- `lib/errand` grew 1,389 → 7,789 (5.6×). The goal text licenses making Errand fire sites _consume_ the allocation
  model; what landed is a v3 transient-identity state machine plus `leave` / `materialize` / `abandon`.
- `lib/housekeep` (1,061) and `lib/groom` (828) are new, carrying nine new CLI verbs between them. Neither traces
  to any of the six motivating failures.

Two further work units were built alongside the specced one and never received their own spec, review boundary, or
scoping decision. Both are wanted — each originated as a real failure routed here because its domain overlapped —
but neither can ride this one. Finding density follows from volume rather than rot: 66 findings over 43,754
reviewed lines is ~1.5 per kLOC, a normal rate over an abnormal surface.

**Routing lesson carried out of this WU.** Domain overlap is not a sufficient condition for adopting a concern into
an in-flight WU. The absorption path ran capture → "same domain" → adopt → "then we should also cover this case,
and this one". Routed to the inbox as an inbox-drain safeguard gap rather than resolved here; `decomposition-doctrine`
holds the adjacent planning-side question.

### Detachability trace

Dependency direction is favourable — errand, housekeep, and groom all depend on locus. Three back-edges exist and
all three are shallow:

- `locus/` → `errand/identity-snapshot.ts` (156 lines, four locus consumers). Already half-inverted:
  `evidence.ts` declares `readIdentities()` as a port on the IO interface, and only two sites wire the concrete
  implementation. This is the D6 identity join, not v3 logic — the module belongs to the locus core.
- `locus/command-runtime.ts` → `housekeep/open-runtime.ts` for `readHousekeepState`, a ~15-line helper whose entire
  body calls locus's own `readLocusState`. Misplaced function, not a dependency.
- `close-runtime.ts` → `leave-runtime.ts` for `observeExactChangeRequest`, a single import. Relocating that
  function to `change-request-lifecycle.ts` frees the whole close path for the base deliverable.

**The v3 identity core is shared substrate, not errand-private.** `errand/open-runtime.ts`,
`housekeep/open-runtime.ts`, and `groom/close-runtime.ts` all import `identity-claims` / `identity-transaction`,
and `errand open` writes through `transactTransientIdentities` at four call sites with no v2 write path to degrade
to. The core therefore ships with the base deliverable — also correct on the merits, since transient identity is
this WU's own vocabulary rather than an errand feature.

### The stack

Three deliverables, each its own work unit, in dependency order:

- **D1 — `session-locus-model`** (~10–12k source): all of `lib/locus`, the v3 identity core
  (`identity-*`, `change-request-lifecycle`, `exact-branch-generation`, `locked-generation`), the base Errand verbs
  (`open`, `link`, `close`, `promote`, `check`, `abandon`), `partial-settle`, `lib/recover`,
  session-init/handoff/compaction wiring, and the `arc locus` reader. Retains the spec's Goals and the six
  motivating failures.
- **D2 — errand transient lifecycle** (~1k): `leave` and `materialize`, plus the six carved generation-capability
  findings, which ship with the machinery they belong to instead of staying carved.
- **D3 — claimed sweeps** (~1.8k): `lib/housekeep`, `lib/groom`, the `plan` claim protocol, and the housekeep
  sweep verbs.

The three sizes above are the corrected ones — the carve proof below measured them, and moved `abandon` and
`partial-settle` from D2 to D1 for reasons the code settles.

### Remediation routing — re-settled 2026-07-25

Remaining open work distributes across the stack rather than landing on one head. Each finding below is placed by
its stable locus against the corrected deliverable boundaries; the earlier pass predated them and misplaced six.

- **D1** — `7.E.e.ii`, `.iii`, `.iv`, `.v`, `.vii`; `7.E.f`; `7.G.a`; `7.E.h`'s `R1-F1`–`R1-F4` claims, `M1-F1`,
  `E4-V1`, and the status / ROADMAP / adoption half of `E5-V1`; and the `7.E.g` members covering in-place resume
  (`W2-F1`), legacy record readability (`E1-F1`), remote-only legacy close (`E5-F2`), legacy multi-WU recovery
  (`S1-F1`), the inbox source digest and lost-response replay (`E5-F1`, `B-F1`), the quick-reference Errand
  signature (`M1-F2`), and the `arc-errand` half of install (`D-F1`).
- **D2** — the materialize half of `E5-V1`: materialize success and failed-open rollback coverage. That is all of
  it.
- **D3** — `7.E.e.vi`'s housekeep and plan open paths; `7.E.g`'s partial-housekeep base binding (`P1-F3`), groom
  exact-path authorization (`P1-F4`), and the `arc-housekeep` half of install (`D-F1`).

`7.E.g` and `7.E.h` are the two undecomposed parents, and they are precisely the ones that span deliverables — the
split forces the decomposition that was owed either way, now against three targets small enough to hold at once.
The split buys review proportionality, not a fast first merge.

**The carved findings leave the stack entirely — they were never the stack's to place.**
`locus-generation-binding` already carries them as a `backlog/planned` unit with its own draft and dependency
edge, minted at the carve itself. Routing them to a deliverable double-books work that has a home, which is the
absorption pattern this decomposition exists to correct. Its carried defect set names `locus/command-runtime`,
`locus/mutation`, `locus/provisioning*`, `errand/open`, `errand/promote-runtime`, and `git/worktree-marker`, and
its sixth item — the failure-injection substrate — names the groom and housekeep drivers. Not one names `leave*`
or `materialize-branch`, which is the whole of D2. Re-point that unit's `Depends On` from `session-locus-model` to
the stack's last member: five items need D1's code and the substrate item needs D3's drivers, so scoping it to D1
alone would re-carve a carve.

**D1 absorbed most of what the earlier pass gave D2 and D3.** The boundary correction moved `close`, `promote`,
`abandon`, and `partial-settle` into D1 while the routing still read them as transient-lifecycle or sweep scope:
`E4-V1` is promote coverage, `E5-F2` is close dispatch, `M1-F2` is `errand open --type`, and the inbox-digest
clause is `open` / `link` / `promote`. `D-F1` splits one skill per side, and `M1-F1` had been routed nowhere at
all. D2's remaining share is a single coverage task, which is consistent with its measured ~870 source lines.

### Lifecycle calls

- **Three work units, not one shipping three PRs.** Nothing in the current model supports stacked delivery
  (`chunked-delivery` owns that, unstarted), and the 1:1 WU/PR assumption would break.
- **Slugs:** D1 keeps `session-locus-model`; D2 is `errand-transient-lifecycle`; D3 is `claimed-sweep-verbs`.
- **All three are delivery-only, and each takes a spec sized to what it inherits.** The two open-design claims
  recorded here have both closed: `7.G.a` settled and shipped in Phase `7.G`, and the generation-capability
  contract belongs to `locus-generation-binding` rather than to any deliverable. So no spec in the stack authors
  new design — each partitions a design already realized in code and records what it inherited.
- **The spec splits with the code.** Expect re-authoring rather than a section cut: D7 and D8 both span
  deliverables. Each spec records that it decomposed from this WU and inherited its implementation.
- **Task lists renumber cleanly** for remaining work; `tasks-session-locus-model.md` archives intact with this WU's
  record. Historical `Context:` footers resolve into an archived artifact, which is where archived artifacts point.

### Carve mechanics

The branch is pushed, so this is forward-only — no history rewriting and no orphaned SHA-keyed notes. Commit-level
partitioning across 195 interleaved commits is not attempted. Instead each deliverable branches from its
predecessor (D1 from the reconciled base) and takes the tip state by path, with the three seam fixes applied and
the D2/D3 CLI registrations and workflow dispatch de-wired from D1.

The 195 commits never reach the integration base under this shape, so their task-ID footers were never going to
land regardless. The recoverable value is the development narrative, and the mitigation is to port each deliverable
as a meaningful commit sequence — schema, record store, reader, allocator, verbs, workflow integration — rather
than one blob, keeping `feat/session-locus-model` alive unmerged as the reference record. What reaches the base is
a readable history instead of an interleaved one.

### Stop-reason tiers and the judgment boundary

The friction risk this model carries is the one the review architecture already paid for once: determinism added to
reduce friction can increase it when it converts judgment into refusal. Live evidence is in `7.G` — a checkout
reached from a second platform reads its own healthy lease as unverifiable, and every exit then refuses, leaving
hand-deletion of the record as the only way forward. Session-init already surfaces `primary-off-base` as an
availability warning on sessions that allocate nothing.

`LocusStopReason` is a flat 15-value enum where `projectTrustedLocusRow` sorts members into authority-fatal and
not — two tiers where the model needs three:

- **hard** — proceeding destroys work; no override exists.
- **authority** — resolution needs evidence the agent cannot supply; the operator may release it.
- **advisory** — the code cannot verify, but session context may settle it; the agent may proceed, and says so.

The governing boundary: **judgment is admissible where the agent holds evidence the code lacks, and inadmissible
where the code holds evidence the agent lacks.** An unverifiable anchor on a session that knows it is alone is the
first; a live foreign lease is the second, where overriding is guessing rather than knowing. `primary-dirty` and
`primary-off-base` are allocation preconditions on non-destructive paths and belong in the advisory tier. An
advisory override always emits one line saying it happened — visible, never a prompt — so a wrong call stays
catchable without restoring the friction the tier removes.

### `7.G.a` — recommended shape

Of the phase's three candidates, the third: narrow the unknown surface so a cross-inspector anchor re-verifies
through a portable signal. The first two accept the false-unknown and attach an exit to it; the third removes most
of its reachability, and every later consumer of `unknown` inherits the narrower surface. Honour the phase's own
boundaries — do not weaken the process anchor to reach it, and gate any self-attested release on operator
confirmation. The tier model above is part of the same decision, since the phase already reframes recovery as
keying on authority over the lease rather than on deadness.

### Open costs

- **Test entanglement** was the largest unknown; it is now measured — see the subsection below. It is not a cost
  of the size first feared.
- **D1's `session-init.md` needs rewriting, not reverting** — the signal-leaf spine must route housekeep and
  grooming the pre-model way while retaining locus dispatch.

### Test entanglement, measured (2026-07-25)

Classified every test file the branch touches — 163 files, +21,621 / −846 lines against the reconciled base —
by which deliverable owns its added coverage. Tests carve about as cleanly as source does. The earlier reading
that grooming had no named test file was wrong: `__tests__/unit/groom/` (3 files, 551 lines) and
`__tests__/unit/housekeep/` (4 files, 711 lines) both exist and carry real driver coverage, not smoke tests.

| Deliverable | Added test lines | Share | Shape                                                         |
| ----------- | ---------------- | ----- | ------------------------------------------------------------- |
| D1          | ~18,580          | 86%   | everything not named below; no file imports a D2 or D3 module |
| D2          | ~1,264           | 6%    | 6 whole files (976) + 3 e2e slices (~288)                     |
| D3          | ~1,777           | 8%    | 8 whole files + the whole delta of one modified file          |

**What moves whole.** D3: `unit/groom/*` (3), `unit/housekeep/*` (4), `e2e/locus-routing-roundtrip.e2e.test.ts`
(474 lines, entirely grooming and housekeeping round trips), and every added hunk in `e2e/housekeep.e2e.test.ts`.
D2: `unit/errand/{leave-locus,leave-cleanup,abandon-locus,abandon-runtime,materialize-branch,partial-settle}`.

**What splits, and how cleanly.** Only four files need per-stop editing, and three of them cut at `it` boundaries
with no shared-fixture surgery: `e2e/errand.e2e.test.ts` (the `abandon` and `leave` describes, 87 lines),
`e2e/locus-errand-roundtrip.e2e.test.ts` (two pause/resume tests, ~139 lines), and
`e2e/locus-mutations.e2e.test.ts` (the paused-Errand materialize test plus its dedicated seed helper, ~61 lines).
The fourth, `integration/locus-methodology-contracts.test.ts`, is the one genuine within-test entanglement: three
of its six tests assert a documentation surface spanning all three deliverables in a single array or assertion
block — the command-surface list, the trimmed-housekeep contract, and the package/project skill parity list.
Those get edited at each stop rather than moved.

**Why the carve is cheap.** The role kinds and identity states that read as housekeep-, groom-, and
pause-specific — `"groom"` / `"housekeep"` record and subject kinds, `paused` / `awaiting-merge`, the
`housekeep-open` / `plan-open` mutation operations, `provePauseHead`, `assertTransientIdentityOperation`'s
operation union — all live in `lib/locus/schema` and the v3 identity core, which ship with D1. Every test that
merely names them is exercising D1 substrate and stays put, unchanged. Shared e2e helpers behave the same way:
`runArcAnchored` / `runArcAnchoredSequence` land in D1 and D2/D3 inherit them down the stack.

**Two things this changes (test side).**

- **Add two seams to the de-wire list.** Beyond the four recorded fixes, D1 must also drop `errand/index.ts`'s
  re-exports of the D2 runtimes and remove the matching `command-input-registrations.ts` declarations — the
  command-input inventory reconciles registrations against live source, so a registration outliving its command
  fails the check.
- **D2 ships thinner coverage than its source share.** Its ~4–5k source lines carry ~1.3k of dedicated test
  lines, because the identity-core tests that prove most of its state machine stay in D1. Expect its review to
  lean on D1's suite; if D2 wants standalone proof, that is new test work, not relocated test work.
  _(The source figure is superseded below — D2 is ~1k, so its coverage ratio is fine after all. The observation
  that its state machine is proven by D1's identity-core tests still holds.)_

### The carve, proved (2026-07-25)

Built D1 for real on a throwaway branch off the origin tip: deleted D2 and D3, applied the seam fixes the
typechecker demanded, and ran the gates. **The carve works.** `typecheck:all` clean, `tsup` build clean, and the
full suite green at 733 files / 8,979 tests, 0 failures. The whole cut is 38 files — 24 deleted, 13 edited,
+96 / −6,152 lines. Ninety-six inserted lines is the entire cost of making the base deliverable stand alone.

**The four recorded seam fixes were neither complete nor entirely necessary.** Three held: `readHousekeepState`
relocated into `lib/locus/command-runtime.ts` as `readCommandLocusState` (+29), `observeExactChangeRequest`
relocated into `change-request-lifecycle.ts` (+51), and the CLI de-wire (8 command blocks in `cli.ts`). The
relocation of `observeExactChangeRequest` came out cheaper than a move: the target module already had
`resolveChangeRequestLifecycleConfiguration` doing the same origin-URL parsing, so the copy reuses it and the
duplicate parser is gone.

The fourth — moving `identity-snapshot` behind the port `evidence.ts` declares — is **not a seam**. Both ends are
D1, so it never blocks the carve. It is a design-cleanliness item; do not schedule it as split work.

Three more were needed, two of them already predicted by the test sizing: the `errand/index.ts` barrel
re-exports; the command-input registrations and policy declarations, which live inside `handlers/errand.ts` and
`handlers/housekeep.ts` rather than a central file; and — unpredicted — `handlers/locus.ts`'s
`arc locus resolve --action abandon` dispatch, which wires a driver per transient subject.

**That last one moved a boundary.** `arc locus resolve --action abandon` is D1's own residue exit, the one
Phase `7.G` built, and errand-abandon is its only implementation. Three modules turn out to sit on the wrong side
of the recorded partition, and the code settles each:

- `abandon-locus` + `abandon-runtime` (636 lines, recorded D2) — abandon is close's counterpart, not leave's, and
  D1's recovery exit has no other driver. Without it, the friction `7.G` exists to remove comes straight back.
- `partial-settle` + `partial-settle-runtime` (363, recorded D2) — `errand close` and `errand abandon` both call
  it under partial protection.
- `housekeep/execution-offer` (41, recorded D3) — its only dependency is `user-sync/inbox-writer` and its only
  callers are D1's close and abandon. It moved to `lib/user-sync/execution-offer.ts`.

**D2 and D3 are far smaller than recorded.** Everything that actually left D1 is 3,633 source lines against a
recorded D2 + D3 of roughly 6–7k. D2 specifically is `leave*` plus `materialize-branch` — about 870 source lines
plus its handler and CLI surface, not 4–5k. The recorded figure had read `lib/errand`'s whole 5.6× growth as
transient-lifecycle scope, but most of that growth is the v3 identity core, which D1 keeps.

**Test cost matched the sizing, with one miss.** Four test files needed per-stop editing: the three predicted e2e
splits plus `unit/handlers/errand-open-result.test.ts`, which mixes open / link / abandon / promote with
materialize / leave at `describe` granularity. The sizing pass missed it because it names D2 only through
`formatErrandLeaveResult` and the `errand-materialize` operation string. Cutting those four was the entire
test-side cost; nothing needed restructuring, and every other failure was one of the slices already predicted.

**The proof also exposed a blind spot.** The suite went fully green while the shipped documentation still promised
`arc errand leave`, `arc housekeep open`, and `arc plan open` — commands the carved CLI no longer has.
`locus-methodology-contracts.test.ts` asserts only that the reference material _contains_ those strings, so it
passes unedited against a CLI that dropped them. Nothing in 733 test files catches a command surface that
contradicts its own documentation. Two consequences: the doc rewrite (`session-init.md`'s signal-leaf spine,
`QUICK-REFERENCE`, and the `arc-housekeep` / `arc-plan` / `arc-session` skills) is the one carve cost this proof
did **not** measure, and it is the one part no gate will catch — it needs a deliberate pass, not a green run.

### ROADMAP re-render is deferred to after the base reconcile (2026-07-25)

Authoring the two carved stubs into `backlog/planned/` and re-pointing `locus-generation-binding`'s `Depends On`
are both manual-discipline render-field changes, so they owe a `ROADMAP` re-render. It is **deliberately not
done here.** This branch sits 192 commits behind `main`, and the probe already classifies `ROADMAP.md` as
regenerable rather than substantive overlap. A render from this branch's stale meta set would neither match
mainline nor survive the reconcile — it would be discarded and redone. Re-render once, after the base merge,
against the reconciled meta set; the skipped manual trigger is bounded and the next ceremony-wired regen sweeps
it back into agreement either way.

**Resolution:** the base reconcile completed. The operative rolling runbook now regenerates `ROADMAP` in each
slice that changes a render field rather than deferring it across the delivery.

### Execution state and sequencing (2026-07-25)

The plan's three first actions were: settle `7.G.a`, size the test entanglement, prove the carve.

- **Action 1 is complete.** Phase `7.G` settled the recovery-authority design in the spec and shipped it
  (`7.G.a.i`–`.iv`, plus `7.G.b`, which the work surfaced). That phase _was_ this plan's first step, not a
  detour back into implementation.
- **Actions 2 and 3 are now `Phase 7.S` in `tasks-session-locus-model.md`**, rather than living only here. They
  spent a full session recorded in these notes and untracked by the task list, which is the surface that actually
  drives session work — that is how they were silently deferred.
- **Sequencing: carve after `7.E.e` closes, before `7.E.f` / `g` / `h`.** Those three span deliverables and are
  undecomposed; cutting them against the origin forfeits the main benefit of splitting.

### ARC runs no ceremony for this carve

Checked before scheduling, and it changes the cost. `decompose-work-unit.md` stops on an `Active` origin whose
committed code spans several would-be members, and routes to the full-split escape hatch in
`strategy-work-organization.md` § Active-state decomposition. `arc decompose` covers **extraction** — origin stays
active, only _unbuilt_ scope splits — which does not fit, because both the transient-lifecycle and claimed-sweep
deliverables are already built.

The strategy lists two full-split mechanics: cherry-pick for cleanly-separated commits, history surgery for
interleaved ones. **This carve takes neither.** It re-creates each deliverable from **tip state** onto a fresh
branch off the base — forward-only on a pushed branch, no history rewriting, no orphaned SHA-keyed notes. That is a
third shape the strategy does not enumerate, chosen deliberately: it accepts losing the origin's 195-commit
narrative in exchange for avoiding surgery the strategy itself calls a smell. The mitigation stands — port each
deliverable as a meaningful commit sequence, and retain the origin history unmerged as the development record.

Worth recording for the routing lesson above: the strategy already says to _"decompose at the planning maturity
gate before the code exists, so the cut stays clean."_ The doctrine existed; nothing fired it.

### Carve execution runbook (2026-07-26)

The carve has two separate authorities. **Git ancestry** comes from each deliverable's predecessor after it
integrates. **Implemented content** comes by owned path from the frozen origin tip. Do not confuse "cut from" with
"copy from":

| Deliverable                     | Ancestry base              | Content donor                      | Lifecycle entry                            |
| ------------------------------- | -------------------------- | ---------------------------------- | ------------------------------------------ |
| D1 `session-locus-model`        | `main` at `c6443e34a`      | origin tip `f774446c0`             | manual scratch, then existing-WU handover  |
| D2 `errand-transient-lifecycle` | `main` after D1 integrates | archived origin tip, D2 paths only | `npx arc start errand-transient-lifecycle` |
| D3 `claimed-sweep-verbs`        | `main` after D2 integrates | archived origin tip, D3 paths only | `npx arc start claimed-sweep-verbs`        |

The D1 implementation donor is immutable at `f774446c0`; control-plane documentation recorded after that freeze
does not widen the donor. Preserve that commit before canonical handover under the annotated tag
`archive/session-locus-model-origin-f774446c0`. A tag, rather than another live branch, keeps all 195 commits and
their SHA-keyed notes reachable without presenting ARC with two branch heads carrying the same active WU.

#### D1 construction

1. Create sibling worktree `arc-framework.session-locus-model-d1-carve` on temporary branch
   `feat/session-locus-model-d1-carve`, cut at `c6443e34a`.
2. Because `arc start` does not own this checkout, run the configured post-create provisioning script and copy the
   configured harness directories from the primary. Leave the checkout without a worktree marker or locus role;
   it is a bounded construction surface for the existing WU, not a second WU.
3. Re-create D1 from `f774446c0` by owned path, using § The carve, proved as the seam authority. Keep the current
   `feat/session-locus-model` checkout frozen as the readable donor.
4. Port the two planned child specs/metas and the re-pointed `locus-generation-binding` dependency with D1 so the
   normal D2 entry exists on `main` after D1 integrates. Deliberately rewrite the packaged and self-hosted command
   documentation; the test suite does not prove command-surface truth.
5. Build a meaningful D1 commit sequence and run the complete gates. Do not run ordinary session initialization
   in the unmanaged scratch checkout and do not push it as a second active WU branch.

#### Canonical D1 handover

Run only after the scratch tree is clean, reviewed as a carve increment, and green:

1. Verify `f774446c0`, push the annotated archival tag, and confirm it resolves remotely.
2. Remove the scratch worktree while retaining its temporary branch.
3. Switch the existing `arc-framework.session-locus-model` checkout onto the reconstructed branch. Reusing the
   checkout preserves its path-bound work-unit role, gitignored marker, harness state, and session workspace.
4. Retire the old canonical branch ref, rename the reconstructed branch to `feat/session-locus-model`, and replace
   the remote canonical branch only after the archive tag is confirmed. Do not keep a second ordinary branch whose
   tip still carries `meta-session-locus-model.md`.
5. Re-run `npx arc locus --json` and `npx arc status --session-init --json`. Require exactly one managed
   `session-locus-model` row at the existing checkout, one active lifecycle subject, matching branch/meta, clean
   reconciliation, and fresh SESSION-NOTES before continuing.

The handover is the destructive boundary. Stop before it and present the exact ref/worktree impact and rollback
route; no prior approval to reconstruct D1 implies approval to replace the canonical branch.

#### D2 and D3

Do not pre-cut them. After D1 integrates, its child stubs exist on `main`, so ordinary
`npx arc start errand-transient-lifecycle` can create the planning branch, worktree marker, locus role,
SESSION-NOTES, and committed start ceremony. Complete its inherited-delivery task list and activation, then port
only D2 paths from the archived origin tip. Repeat for D3 only after D2 integrates.

This serialization makes `main` after each merge the next member's real predecessor head. Cutting D2 or D3 now
would require manual artifact relocation and role/provenance mutation while their dependencies remain unlanded —
the lifecycle collision this runbook exists to avoid.

## Proportionate delivery cut (2026-07-26)

The three-deliverable carve was drawn on **ownership** boundaries — which work unit does this code belong to — and
it succeeded on those terms. It did not reduce the review surface, because the absorbed scope was never where the
volume was.

### The measurement that was never taken

Every figure the carve recorded measured **the cut**: 38 files, +96 / −6,152, gates green. None measured **the
residue**. `git diff <base>..<carve-head>` was not run until now. It returns **43,747 insertions across 343
files** — 87% of the origin's insertions and 91% of its files. Removing everything that did not belong to this
work unit could only ever have removed ~12%, and that was knowable before any work started.

Two contributing errors sit underneath it. § The stack recorded the base deliverable at "~10–12k source"; the
carve proof later moved `close`, `promote`, `abandon`, and `partial-settle` back into it and corrected the other
two members downward, but never restated that figure. Actual base-deliverable source is **18,560**. And the goal
was verbally restated along the way — "the split buys review proportionality, not a fast first merge" — into a
form that carried no number and therefore could not fail.

**The rule this earns: a carve is proved by what remains, not by what it removes.** Measure the residue against
the constraint before accepting the cut.

### Line accounting

| Bucket                                     |      lines |
| ------------------------------------------ | ---------: |
| New modules (72 files)                     | 14,396 src |
| Added lines in modified files (wiring)     |  4,164 src |
| Tests attributable to a single new module  |      9,252 |
| Integration and e2e tests spanning modules |     10,087 |
| Documentation under `.arc/`                |      5,335 |

### The graph admits a finer cut

Import-graph trace over the carve head, following multi-line imports, barrels, dynamic imports, and test doubles:
**267 edges among the 72 new modules and zero cycles**, resolving to a 13-level DAG. The measured coupling agrees
— removing three whole subsystems cost 96 inserted lines.

Thirteen concern-coherent slices, in dependency order, sized as new-module source plus import-attributed tests.
Only one ordering violation appeared across all 267 edges (the reader importing reconciliation), corrected by
placing reconciliation ahead of the reader.

| Slice                                     |   src | tests |
| ----------------------------------------- | ----: | ----: |
| S1 locus record substrate                 |   821 | 1,387 |
| S2 process and platform probe             |   910 |   848 |
| S3 lock and mutation protocol             | 1,060 | 1,491 |
| S4 transient identity core                | 2,330 | 1,920 |
| S5 reconciliation                         |   412 |   438 |
| S6 evidence and roster reader             | 1,545 | 1,555 |
| S7 allocation and provisioning            | 1,525 | 1,251 |
| S8 errand open and link                   |   321 |    92 |
| S9 errand close, promote, abandon, settle | 2,132 | 2,709 |
| S10 work-unit lifecycle integration       | 1,042 | 1,341 |
| S11 recovery                              |   385 | 1,277 |
| S12 session wiring and locus surface      | 1,695 | 1,361 |

Distributing the wiring, cross-cutting tests, and documentation puts every slice between roughly 1.2k and 5.5k,
plus S13 for documented-surface reconciliation. Slice sizes are verified for the source and single-module test
columns and **estimated** for the distributed remainder.

### Reachability found three unwired modules, not a scope problem

Forward walk from all 142 CLI entry points reaches 672 of 687 source files. Exactly **three new modules are
unreachable, totalling 290 lines** — which independently confirms the right-sizing audit's verdict that there is
no scope fat here.

`reconcile-driver.ts` is the substantive one. Its `LocusReconcileDriverIO` interface has no implementor outside
its own test, `breakDeadLock` has no implementation anywhere, `arc locus attach` implements the two adopt actions
through its own composition, and `session-init.md` explicitly defers the remaining actions "until its owning CLI
verb is selected." So it is neither a defect nor accidental residue — it is a capability built ahead of its verb,
and the documentation promises nothing it fails to deliver. It leaves the stack; the capability routes to
`locus-generation-binding`, whose carried defect set already names the adjacent generation and lock concerns.

`locus/registry.ts` and its sole importer `session-envelope/registry.ts` form a dead chain. `locus/errors.ts` has
no importer and no published barrel, but `7.E.e.i` deliberately rewrote it, so whether it is live surface is
settled with the schema work in `7.P.a.ii` rather than assumed here.

### Test attribution resolves into three tiers

Of 145 changed test files, 84 attribute to one or more new modules by import. The remaining 61 (3,151 lines) are:
four large e2e suites that spawn the binary across many commands (1,506 lines, genuinely cross-cutting), two
contract suites that must be edited at every stop (274 lines), and a long tail of 55 files averaging under 30
lines that ride with whichever slice changes their subject. Only the first two tiers need deliberate placement.

### Delivery shape

Rolling bottom-up deliveries under one work unit, not thirteen work units and not thirteen simultaneously live
branches. Each slice is one review and merge unit. It lands on `main` before its successor is cut, so a stalled
delivery leaves the base at the last independently coherent capability and review fixes never need reconstructing
from a higher branch in a deep stack.

This keeps one work-unit identity while giving every slice its own exact hosted-review target. The successor's
review owns the seam from the already-landed predecessor into its new capability; cumulative full gates prove the
tree at every stop. The lifecycle's ordinary integration ceremony still assumes one pull request per work unit, so
this delivery is hand-run and closes bespoke rather than invoking `integrate-work-unit`.

The origin branch stays unmerged as the development record, and the archive tag keeps all 195 commits and their
SHA-keyed notes reachable.

## Delivery topology and sequence (2026-07-26)

**Revised 2026-07-29 from the live `decompose-transform-integrity` delivery.** This is the operative record. It
supersedes both the earlier three-work-unit carve and the thirteen-branch standing stack; those sections remain
only as the evidence trail that produced the cut.

S1 manifest preparation found one necessary pre-slice: the four active planning artifacts add 4,923 lines before
the derived `ROADMAP` hunk, so carrying them inside S1 would break the size gate before any implementation landed.
As in `decompose-transform-integrity` delivery 00, one planning-baseline pull request (S0) establishes the control
plane first; the thirteen implementation slices then remain code-review-sized.

### What each ref is, and what becomes of it

| Ref                                            | Role                          | Fate                                                 |
| ---------------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| `feat/session-locus-model`                     | 195-commit development record | Retained and pushed; never merged                    |
| `archive/session-locus-model-origin-f774446c0` | Frozen origin tip             | Pushed; deepest content fallback                     |
| `archive/session-locus-model-donor-fa3c10f0e`  | Proven-green carve head       | Pushed; **content donor for every slice**            |
| `feat/session-locus-model-d1-carve`            | Scratch construction branch   | Retain through S1 construction, then remove          |
| `arc-framework.session-locus-model` checkout   | Managed work-unit locus       | Stays here and switches to each current slice branch |

The donor is the carve head rather than the origin tip: the transient-lifecycle and claimed-sweep de-wiring and the
seam fixes are already applied and proven there, and every slice is a subset of it. Planning artifacts come from
the branch tip instead — the carve head predates the delivery restructure.

### Delivery invariants

- **One live delivery slice.** Prepare scratch content ahead when useful, but do not publish or review a successor
  before its predecessor lands. There is no standing thirteen-branch cascade to propagate fixes through.
- **One coherent base stop.** Every merged slice leaves `main` green and semantically usable without unpublished
  successors. Dormant internal substrate is acceptable; a partial public contract is not.
- **Stable-locus fixes.** Port the completed donor baseline, then implement each remaining `7.P` correction in the
  slice that owns its stable code or documentation locus. Never finish residual implementation on the frozen
  development record.
- **Exact target evidence.** Gate and review the actual `main...slice` diff after the last base merge. A retarget,
  base merge, or content change invalidates any clean claim that does not cover the new exact head.
- **Append-only publication.** Never rebase or force-push a published slice. Merge current `main` into it, let the
  changed head re-gate and re-review, then land it with a merge commit.
- **No ordinary integration workflow.** Do not invoke `integrate-work-unit` or assume `arc review unlock` can clear
  these disposable delivery PRs. The final work-unit closeout is bespoke.
- **Planning-baseline review exception.** S0 carries only the already-settled planning record and derived
  `ROADMAP`; it requires the normal pull-request checks and explicit merge authorization, but no CodeRabbit or
  hosted Codex review. Hosted review begins with S1 and applies to every implementation slice.

### Slice branches

Branches are named for the capability they deliver, not their position. A reviewer reads the branch name before
anything else, and a positional name communicates nothing about the change.

| Slice | Branch                              | Task    |
| ----- | ----------------------------------- | ------- |
| S0    | `feat/session-locus-delivery-plan`  | `7.P.0` |
| S1    | `feat/locus-record-substrate`       | `7.P.a` |
| S2    | `feat/locus-process-inspection`     | `7.P.b` |
| S3    | `feat/locus-mutation-protocol`      | `7.P.c` |
| S4    | `feat/transient-identity-core`      | `7.P.d` |
| S5    | `feat/locus-reconciliation`         | `7.P.e` |
| S6    | `feat/locus-roster-reader`          | `7.P.f` |
| S7    | `feat/locus-allocation`             | `7.P.g` |
| S8    | `feat/errand-open-link`             | `7.P.h` |
| S9    | `feat/errand-terminals`             | `7.P.i` |
| S10   | `feat/work-unit-locus-integration`  | `7.P.j` |
| S11   | `feat/locus-recovery`               | `7.P.k` |
| S12   | `feat/session-locus-wiring`         | `7.P.l` |
| S13   | `feat/locus-surface-reconciliation` | `7.P.m` |

### Durable status ledger

The ledger records durable intent and the last reconciled fact, not live GitHub state. Git and GitHub remain
authoritative for branch heads, checks, reviews, and merges. On a mismatch, proceed from live truth and repair the
ledger in the next safe pre-review commit.

| Slice | Status                        | PR   | Landed on `main` |
| ----- | ----------------------------- | ---- | ---------------- |
| S0    | landed                        | #395 | `bb6803b62`      |
| S1    | constructing from `bb6803b62` | —    | —                |
| S2    | blocked by S1                 | —    | —                |
| S3    | blocked by S2                 | —    | —                |
| S4    | blocked by S3                 | —    | —                |
| S5    | blocked by S4                 | —    | —                |
| S6    | blocked by S5                 | —    | —                |
| S7    | blocked by S6                 | —    | —                |
| S8    | blocked by S7                 | —    | —                |
| S9    | blocked by S8                 | —    | —                |
| S10   | blocked by S9                 | —    | —                |
| S11   | blocked by S10                | —    | —                |
| S12   | blocked by S11                | —    | —                |
| S13   | blocked by S12                | —    | —                |

**External gate satisfied:** `decompose-transform-integrity` delivery 05 (PR #392) merged as `f69cc4a46`, delivery
06 (PR #393) merged as `2beef3fa2`, and bespoke closeout PR #394 merged as `b5bf493db`. S0 cuts from that closeout
tree; S1 waits for S0.

**Update discipline:**

1. At slice entry, reconcile the predecessor row from GitHub and record its PR plus landed merge commit.
2. Before S0 publication or an implementation slice's first hosted review, record the current slice's exact
   manifest, measured diff, PR, and construction head immediately below the table. That edit is part of the PR
   target; GitHub remains authoritative for the later reviewed head because a commit cannot embed its own SHA.
3. Do not mutate an approved head merely to record approval or merge. GitHub carries those facts until the
   successor's entry commit, or the bespoke closeout for S13, reconciles them into this ledger.
4. At handoff, SESSION-NOTES carries the exact live cursor — current branch, PR, head, review/fix round, checks, and
   next command. It supplements this tracked ledger rather than replacing it.

Add one compact subsection per slice at entry; retain it after landing. Record the manifest boundary, `main` base,
additions plus deletions, gate head, PR, hosted-review result, accepted head, and merge commit. Link bulky finding
dispositions to the PR rather than copying them here.

#### S0 planning baseline — landed

- **Manifest:** whole-file additions of `meta-session-locus-model.md`, `notes-session-locus-model.md`,
  `spec-session-locus-model.md`, and `tasks-session-locus-model.md`, plus the generated `ROADMAP` hunk.
- **Entry base:** `origin/main` `b5bf493db`, the DTI closeout merge.
- **Exact local measurement:** 4,924 additions plus 1 deletion (4,925 changed lines) against `b5bf493db`,
  including the regenerated `ROADMAP` hunk.
- **State:** PR #395 accepted head `52693a754` without hosted review and landed through merge commit `bb6803b62`.

#### S1 locus record substrate — constructing

- **Donor/base proof:** `archive/session-locus-model-donor-fa3c10f0e` ported onto detached `origin/main`
  `62504727c`; the eleven-file baseline is 1,062 additions and its 16 focused tests pass.
- **Whole-file manifest:** `locus/schema/{identity,index,limits,mutation,record,state}.ts`,
  `locus/path-identity.ts`, `locus/record-store.ts`, and the matching `locus/{schema,path-identity,record-store}`
  unit tests.
- **Exact constructed measurement:** 1,135 additions plus 45 deletions (1,180 changed lines) across fourteen files
  against `bb6803b62`.
- **Owned residual hunks:** `limits.ts`, `mutation.ts`, and `schema.test.ts` require every open-success authority
  coordinate on both success outcomes and constrain persisted timestamps to canonical `Z` instants.
- **Proved exclusions:** `locus/errors.ts` and `locus/registry.ts` plus their tests are dropped as unwired;
  the `session-envelope/registry.ts` composition hunk and matching test hunk do not enter S1.
  `locus/selected-generation.ts` and its test move to S9 with their first live consumers.
- **Finding correction:** E1-F1's stable locus is `errand/identity-record.ts`, not the locus record store; it moves
  from `7.P.a` to S4's transient identity core.
- **Entry base:** `origin/main` `bb6803b62`, the S0 merge.
- **State:** `feat/locus-record-substrate` constructed locally; full gates pending; PR absent.

### Resume protocol

Every fresh session or long-pause resume follows the same read-only reconciliation before editing:

1. Read the ledger and the current slice's evidence entry.
2. Fetch `origin`, inspect the local slice head and `origin/main`, and resolve the named PR's live base, head, state,
   checks, and review status.
3. Treat Git/GitHub as authority when prose lags. Stop on an unexplained head, target, or merge mismatch.
4. Reconcile stale ledger facts in the next pre-review commit; never change a clean reviewed head only for status.
5. Continue from exactly one state: manifest preparation, construction, local gates, hosted review, finding repair,
   merge-ready, or landed reconciliation.

### The planning artifacts travel with every slice

Not a preference — session initialization resolves the active work unit from `meta-session-locus-model.md` **in the
working tree**, and the checkout sits on the one delivery branch under construction. So `meta-*`, `tasks-*`, and
`notes-*` travel with every slice. S0 activates them from the development record; every implementation slice
inherits their landed state from `main`.

The consequence is deliberate: once the first slice merges, the base carries an `Active` meta for a work unit that
is not finished, and each later merge updates it. Progress becomes visible on the base rather than invisible until
a single terminal merge. Archival moves the artifacts out after the last slice.

**The meta's `Branch` field tracks the delivery under construction**, updated at each cut. A delivery boundary is
the ceremony boundary that authorizes the write. Between a merge and its successor's first commit, `main` may
still name the just-landed branch; the next slice advances it before ordinary work resumes.

The current meta still names the drained errand batch as a blocker. The gate is satisfied and this runbook
supersedes it; ARC's meta timing rule defers that field update to the next handoff or slice-entry ceremony.

### Slice-size gate

The table in § Proportionate delivery cut proves source and directly attributed tests but estimates distributed
wiring, cross-cutting tests, and documentation. Before publishing each slice:

1. Build an exact owned-path and owned-hunk manifest from `archive/session-locus-model-donor-fa3c10f0e`.
2. Include the slice's remaining `7.P` implementation corrections and every test/documentation adjustment required
   for that stop to tell the truth.
3. Measure the final pull-request diff against current `main` as additions plus deletions.
4. Target roughly 5,000 changed lines. Above approximately 5,500, stop and either split at a coherent internal
   boundary or record an explicit exception explaining why a smaller independently useful stop does not exist.

S4 and S9 deserve early scrutiny because their already-attributed source plus tests sit closest to the ceiling;
S4 now owns E1-F1 and S9 now owns the 75-line selected-generation source/test pair. The cut topology is reusable;
its size promise is not accepted from estimates alone.

### Per-slice runbook

1. **Reconcile entry.** Require the predecessor landed, fetch current `main`, reconcile the preceding ledger row,
   and confirm no other slice branch is live. Scratch preparation may precede this step; canonical construction may
   not.
2. **Cut the canonical branch.** Create the named branch from current `main`. S0 activates the planning artifacts
   from `feat/session-locus-model`, regenerates `ROADMAP`, and switches the managed WU checkout only after the DTI
   closeout gate above. S1 cuts only after S0 lands; every implementation slice advances the inherited meta and
   ledger at entry.
3. **Construct one coherent stop.** Port only the slice manifest from the donor, apply its remaining `7.P`
   corrections, and reconcile shared tests, command inventories, package/project copies, and documentation against
   the surface that actually exists at this stop.
4. **Measure and gate.** Apply the size gate, then run the complete project gate set against the cumulative tree.
   A prior donor or predecessor green never transfers across a new base or new slice.
5. **Publish one PR to `main`.** Push append-only, open the pull request directly against `main`, record its exact
   base/head and gate evidence, and wait for required CI plus `merge-ok`.
6. **Run hosted review for S1–S13.** S0 skips this step because it is the planning baseline. For implementation
   slices, CodeRabbit is primary; hosted Codex is the fallback when CodeRabbit is unavailable, partial, ambiguous,
   or cannot establish whole-target coverage. The initial request occurs only after the exact target is ready.
   Incremental CodeRabbit fix reviews compose with that initial pass only while the reviewed base and earlier bytes
   remain tree-identical; any coverage doubt falls back to a fresh whole-target hosted review.
7. **Repair findings on the owning slice.** Verify every finding against source, present the complete disposition
   set for approval, then apply accepted fixes here. Re-run the affected full gates, push, and require hosted
   approval at the new exact head. Never strand a lower-slice repair in a successor; if discovered after landing,
   pause and ship a focused corrective PR before proceeding.
8. **Authorize and land.** Confirm hosted approval at the exact head and every real required check green. The
   `arc-cleared` context cannot be produced by this sliced path, so—only after explicit integration approval—use an
   admin merge commit to bypass that one known lifecycle clearance gap. Admin capability does not waive any other
   check, review, or approval.
9. **Verify and advance.** Fetch `main`, verify the PR's merge commit and expected tree landed, delete or retain the
   slice branch per the recorded cleanup decision, then cut only its immediate successor. The successor entry
   records the completed evidence.

### Base drift during delivery

Waiting for a quiet base is not a strategy. The one-live-slice rule contains drift to one branch: merge current
`main` into that slice, never rebase a published branch, then re-run the size reading, full gates, and hosted review
against the changed exact head. Drift after approval invalidates merge-ready state.

Four surfaces still deserve explicit collision checks:

- `backlog/planned/errand-transient-lifecycle/**` and `backlog/planned/claimed-sweep-verbs/**` — the child stubs.
- `backlog/planned/locus-generation-binding/**` — its dependency edge was re-pointed, and it inherits the cut
  reconcile-apply capability.
- `session-init.md` — S13 rewrites the signal-leaf spine.
- Build and tooling configuration — it reaches every quality check, so a change there re-gates every slice.

The two child stubs and the re-pointed `locus-generation-binding` dependency land in **S13**. They are needed on the
base only before the later transient-lifecycle delivery begins. `ROADMAP` regenerates whenever the current slice
changes a render field; it is no longer deferred across the whole delivery.

### Terminal closeout

Before S13 enters hosted review, expand this subsection against then-current project state into an exact closeout
checklist. At minimum it must:

1. Reconcile all fourteen ledger rows to merged PRs and exact `main` commits.
2. Prove every predecessor-successor seam was reviewed on the successor and the cumulative final tree passes the
   complete project gates.
3. Land S13's documented-surface truth, child stubs, and dependency re-pointing before any follow-on WU starts.
4. Run a separate bespoke tracked closeout that archives the active artifacts, regenerates `ROADMAP`, and records
   completion without invoking `integrate-work-unit`.
5. Review and merge any closeout PR under the same exact-head/check discipline, then clean the managed checkout,
   delivery branches, and scratch worktree only after the archival state is authoritative.

No earlier approval grants prospective authority for a slice merge or the final closeout.
