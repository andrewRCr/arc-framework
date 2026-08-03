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

Exact S9 construction later invalidated that estimate: the close/abandon/settlement stop reached 5,397 changed
lines before its remaining v3 CLI proof, while promotion remained an independently coherent successor. The
operative topology therefore splits this table's S9 row into S9A and S9B without renaming S10–S13.

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
plane first; fourteen planned implementation slices then remain code-review-sized. After S3, the same arithmetic
requires a deletion-only control-isolation bridge (R0): combining the 5,083-line artifact removal with S4's
approximately 4,300-line implementation target would recreate a roughly 9,400-line review.

**Revised 2026-07-31 at S9 construction.** The close/abandon/settlement projection already measured 5,397 changed
lines after its remote-only legacy-close correction and before its remaining real-CLI v3-close proof. Promotion is
a coherent downstream capability with its own runtime, recovery post-image, and real-runtime coverage. S9 is
therefore two sequential deliverables: S9A closes, abandons, and settles; S9B promotes. The successor labels remain
S10–S13, and the earlier decision to keep S9 whole is superseded before publication.

**Revised 2026-07-31 after live current-main regressions.** A repository-required `npx arc` invocation first
exposed a production process snapshot that S2's tests did not model faithfully. S2R repaired that stable locus. A
subsequent same-checkout branch switch exposed S9A's inability to finalize a merged Errand later from base context;
S9AR repairs that terminal boundary. Neither repair renumbers the planned slices.

**Revised 2026-08-01 during S12 construction.** A merged primary-checkout Errand proved that the confirmed
retired-residue exit was only half wired: the resolve driver admitted a self-held or unverifiable lease on explicit
confirmation, then the Errand subject runtime rejected every lease that was not conclusively dead. The public
resolve command and its dispatch land in S12, so the complete correction belongs in S12 rather than a third
backport slice. Task `7.P.l.i` now owns that correction; the two pre-existing S12 leaves shift to `7.P.l.ii–iii`.

**Revised 2026-08-01 after S12 construction.** A work-unit checkout created before S10 absorbed the locus model but
remained record-less. Recovery then surfaced derivative load-set and task-cursor drift, while ordinary applied
`wu reconcile` reported clean unless the operator already knew to request `--attach-session`. S10R repairs the S10
entry seam: applied reconcile backfills the verified durable role without a lease, session entry surfaces that exact
repair, and `start --here` establishes its role transactionally. The unpublished, fully gated S12 candidate remains
intact while this correction lands from current `main`, then reconciles and resumes. The delivery is now one planning
baseline, one control-isolation bridge, fourteen planned implementation slices, and four corrective slices —
twenty pull requests before bespoke closeout. S11R follows S10R after live integration recovery exposed an envelope
presence invariant that rejected S11's own valid terminal cursor evidence; S12 remains preserved until both repairs
land.

### What each ref is, and what becomes of it

| Ref                                            | Role                          | Fate                                                 |
| ---------------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| `feat/session-locus-model`                     | 195-commit development record | Retained and pushed; never merged                    |
| `archive/session-locus-model-origin-f774446c0` | Frozen origin tip             | Pushed; deepest content fallback                     |
| `archive/session-locus-model-donor-fa3c10f0e`  | Proven-green carve head       | Pushed; **content donor for every slice**            |
| `feat/session-locus-delivery-control`          | Persistent session control    | Cut after S3; retained until closeout, never merged  |
| `feat/session-locus-model-d1-carve`            | Scratch construction branch   | Retain through S1 construction, then remove          |
| `arc-framework.session-locus-model` checkout   | Managed work-unit locus       | Stays on the control branch from S4 through closeout |

The donor is the carve head rather than the origin tip: the transient-lifecycle and claimed-sweep de-wiring and the
seam fixes are already applied and proven there, and every slice is a subset of it. Planning artifacts come from
the branch tip instead — the carve head predates the delivery restructure.

### Delivery invariants

- **One live delivery slice.** Prepare scratch content ahead when useful, but do not publish or review a successor
  before its predecessor lands. A landed-slice regression may preempt an unpublished successor: preserve that
  successor unchanged, ship the focused correction from current `main`, then reconcile and resume it. There is no
  standing branch cascade to propagate fixes through.
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
- **Non-implementation review exception.** S0 carries only the already-settled planning record and derived
  `ROADMAP`; R0 only removes that active record from the base after the control branch retains it. Both require
  normal pull-request checks and explicit merge authorization, but no CodeRabbit or hosted Codex review. Hosted
  review applies to every implementation slice.
- **Control-plane isolation after S3.** R0 removes the four session-locus artifacts that S0 placed in
  `.arc/active/`; every later implementation deliverable carries no `.arc/active/**` paths. The persistent control
  branch retains the only live tracked artifact set and session-handoff anchor.
- **Defer heavy CI through review.** Keep `ci-defer-heavy` attached throughout hosted review and repair cycles.
  Remove it only after exact-head hosted approval, then run the complete self-hosted matrix once. A CI-driven code
  change restores the label before review resumes.

### Slice branches

Branches are named for the capability they deliver, not their position. A reviewer reads the branch name before
anything else, and a positional name communicates nothing about the change.

| Slice | Branch                                  | Task        |
| ----- | --------------------------------------- | ----------- |
| S0    | `feat/session-locus-delivery-plan`      | `7.P.0`     |
| S1    | `feat/locus-record-substrate`           | `7.P.a`     |
| S2    | `feat/locus-process-inspection`         | `7.P.b`     |
| S3    | `feat/locus-mutation-protocol`          | `7.P.c`     |
| R0    | `chore/session-locus-control-isolation` | `[control]` |
| S4    | `feat/transient-identity-core`          | `7.P.d`     |
| S5    | `feat/locus-reconciliation`             | `7.P.e`     |
| S6    | `feat/locus-roster-reader`              | `7.P.f`     |
| S7    | `feat/locus-allocation`                 | `7.P.g`     |
| S8    | `feat/errand-open-link`                 | `7.P.h`     |
| S9A   | `feat/errand-terminals`                 | `7.P.i`     |
| S2R   | `fix/locus-npx-process-boundary`        | `7.P.bR`    |
| S9AR  | `fix/errand-close-base-context`         | `7.P.iR`    |
| S9B   | `feat/errand-promotion`                 | `7.P.iB`    |
| S10   | `feat/work-unit-locus-integration`      | `7.P.j`     |
| S11   | `feat/locus-recovery`                   | `7.P.k`     |
| S10R  | `fix/work-unit-locus-adoption`          | `7.P.jR`    |
| S11R  | `fix/integration-recovery-cursor`       | `7.P.kR`    |
| S9AR2 | `fix/errand-close-finalization`         | `7.P.iR2`   |
| S12   | `feat/session-locus-wiring`             | `7.P.l`     |
| S13   | `feat/locus-surface-reconciliation`     | `7.P.m`     |

### Durable status ledger

The ledger records durable intent and the last reconciled fact, not live GitHub state. Git and GitHub remain
authoritative for branch heads, checks, reviews, and merges. On a mismatch, proceed from live truth and repair the
ledger in the next safe pre-review commit.

| Slice | Status | PR   | Landed on `main` |
| ----- | ------ | ---- | ---------------- |
| S0    | landed | #395 | `bb6803b62`      |
| S1    | landed | #396 | `56d52f013`      |
| S2    | landed | #397 | `6eebb7f31`      |
| S3    | landed | #399 | `ba2ce7272`      |
| R0    | landed | #400 | `9c2f43ff9`      |
| S4    | landed | #401 | `6b2218380`      |
| S5    | landed | #402 | `6a5a0b973`      |
| S6    | landed | #405 | `39e2f090e`      |
| S7    | landed | #407 | `578e06685`      |
| S8    | landed | #410 | `06c93e6b8`      |
| S9A   | landed | #416 | `ce9ce0fdb`      |
| S2R   | landed | #419 | `000770fb81`     |
| S9AR  | landed | #421 | `bc7b643dd`      |
| S9B   | landed | #422 | `34b28d22a`      |
| S10   | landed | #423 | `ca691fd38`      |
| S11   | landed | #424 | `0b0e64ee8`      |
| S10R  | landed | #425 | `4cde8b575`      |
| S11R  | landed | #428 | `9b2d0b10c`      |
| S9AR2 | landed | #432 | `d9ca2fba2`      |
| S12   | landed | #429 | `40e640faa`      |
| S13   | landed | #433 | `2bd5b01b0`      |

**External gate satisfied:** `decompose-transform-integrity` delivery 05 (PR #392) merged as `f69cc4a46`, delivery
06 (PR #393) merged as `2beef3fa2`, and bespoke closeout PR #394 merged as `b5bf493db`. S0 cuts from that closeout
tree; S1 waits for S0.

**Update discipline:**

1. At slice entry, reconcile the predecessor row from GitHub and record its PR plus landed merge commit.
2. Before S0–S3 or R0 publication, record the current delivery's exact manifest, measured diff, PR, and
   construction head immediately below the table. From S4 onward, record that evidence on the control branch;
   delivery branches exclude the active artifacts by contract.
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

#### S1 locus record substrate — landed

- **Donor/base proof:** `archive/session-locus-model-donor-fa3c10f0e` ported onto detached `origin/main`
  `62504727c`; the eleven-file baseline is 1,062 additions and its 16 focused tests pass.
- **Whole-file manifest:** `locus/schema/{identity,index,limits,mutation,record,state}.ts`,
  `locus/path-identity.ts`, `locus/record-store.ts`, and the matching `locus/{schema,path-identity,record-store}`
  unit tests.
- **Exact review-target measurement:** 1,137 additions plus 45 deletions (1,182 changed lines) across fourteen files
  against `bb6803b62`; the two-commit construction head before this status update is `93eeecea9`.
- **Owned residual hunks:** `limits.ts`, `mutation.ts`, and `schema.test.ts` require every open-success authority
  coordinate on both success outcomes and constrain persisted timestamps to canonical `Z` instants.
- **Proved exclusions:** `locus/errors.ts` and `locus/registry.ts` plus their tests are dropped as unwired;
  the `session-envelope/registry.ts` composition hunk and matching test hunk do not enter S1.
  `locus/selected-generation.ts` and its test move to S9 with their first live consumers.
- **Finding correction:** E1-F1's stable locus is `errand/identity-record.ts`, not the locus record store; it moves
  from `7.P.a` to S4's transient identity core.
- **Hosted-review correction:** Expected-byte replace and pop cannot close their compare/act window before S3's
  record lock exists. S1 therefore stops at bounded generation reads and exclusive mint; S3 owns lock-bound
  replacement, removal, and contention proof. A rename-as-compare substitute was rejected because recreating the
  target between rename and restore/commit can still clobber a newer generation.
- **Exact first-fix measurement:** 1,121 additions plus 49 deletions (1,170 changed lines) across fourteen files
  against `bb6803b62`.
- **Second hosted-review correction:** Exclusive mint stages complete private bytes beside the destination and
  publishes through an atomic no-clobber hard link, so readers never observe an incomplete final record and failed
  writes cannot occupy its path.
- **Exact second-fix measurement:** 1,271 additions plus 49 deletions (1,320 changed lines) across fourteen files
  against `bb6803b62`.
- **Entry base:** `origin/main` `bb6803b62`, the S0 merge.
- **Gate evidence:** The complete local gate set passed on the second-fix tree after the focused mint-concurrency
  regressions proved both failure modes against the pre-fix behavior.
- **Hosted review:** CodeRabbit covered the complete target through the initial full review and two composable
  incremental fix reviews, then approved exact accepted head `c055a31cf`.
- **State:** PR #396 accepted head `c055a31cf` and landed through merge commit `56d52f013`.

#### S2 process and platform inspection — landed

- **Entry base:** `origin/main` `56d52f013`, the S1 merge.
- **Capability:** Platform-correct, unknown-safe process inspection plus a session anchor bound to the
  durable ARC process rather than an invocation wrapper.
- **Whole-file donor manifest:** `locus/{platform-inspectors,process-exec,process-inspector}.ts`, their direct unit
  tests, the separate process-ancestry unit suite, and the native process-inspector integration suite.
- **Finding correction:** L3-F1 and L3-F2 remain in S2. L3-F4 moves to `7.P.f.ii`: its stable locus is
  `reader.ts`, whose import closure enters with S6 rather than the process/platform slice.
- **Exact closure measurement:** 2,051 additions plus 37 deletions (2,088 changed lines) across fifteen files
  against `56d52f013`.
- **Hosted review:** CodeRabbit reviewed the complete `56d52f013..0ade00809` target and requested two corrections:
  preserve execa boundary-failure metadata without collapsing genuine nonzero exits, and recognize `dash` as an
  interactive shell. The accepted repair also covers the real native binding and reduces BSD ancestry inspection
  from three process calls to two while keeping command identity independently parseable. The requested duplicate
  literal `npm exec` test was declined because that exact identity is already covered; no unsupported platform
  rationale was added. The incremental `0ade00809..a70ca7d4a` follow-up found one further test gap: its native
  cancellation proof aborted before the child started. The accepted repair now waits for a real child-start marker
  before aborting. That incremental pass skipped three similar repair files, including the critical
  `process-exec.ts` correction, so a fresh whole-target review replaced incremental composition.
- **Whole-target review repair:** CodeRabbit then covered exact target `56d52f013..9b22f5637` and requested six
  corrections. The accepted repair adds the native process contract to the existing Windows/macOS portability
  pair, enforces the aggregate output budget as bytes with conservative half-per-stream caps, inlines validated
  PIDs into final-position PowerShell commands, composes caller cancellation with the inspection deadline, uses the
  exact shell `-c`/`-lc` operand for snapshot-wrapper recognition, and removes the test helper's `process` shadow.
  The nonblocking documentation-coverage warning was declined because the project has no percentage target and the
  exported surface already carries the required TSDoc.
- **Hosted portability repair:** The six-finding repair landed on the branch as `14f3e23b3`. Deferred run
  `30504442674` behaved as designed, and the one full run triggered by removing `ci-defer-heavy`,
  `30504638253`, passed at that exact head. Hosted dispatch `30505257563` then exposed two platform-specific
  contract gaps: unresolved Windows commands reached `cmd.exe` and produced ordinary nonzero results, while macOS
  `ps` emitted a diagnostic nonzero result for the missing PID. The accepted correction resolves Windows commands
  through the same executable lookup Execa uses and classifies an unresolved native `.exe` as missing before
  invocation. It also requires a signal-zero `ESRCH` result before a BSD diagnostic nonzero query may establish
  absence; successful, permission-denied, and other signal probes remain unknown-safe. That repair landed as
  `e68765c32`; exact-head self-hosted run `30506635277` passed after its unrelated 120-second lifecycle fixture
  cleared on one failed-job rerun. Hosted dispatch `30507550484` proved the BSD correction on macOS and the missing
  executable correction on Windows, then exposed a harness-only timeout: the stable-generation contract performs
  four sequential inspections but inherited the same five-second Vitest cap as each individual native invocation.
  The accepted correction gives that aggregate contract probe 25 seconds without changing the production deadline
  and landed as `c0269aa5d`. Exact-head run `30508182058` then repeated the unrelated lifecycle fixture failure at
  121.672 seconds. Its preceding exact run failed at 121.722 seconds, while the intervening success at 119.614
  seconds left less than one second of headroom. The accepted correction raises only that canonical installed-surface
  decomposition fixture to 150 seconds; the global E2E timeout and every behavioral assertion remain unchanged.
- **Gate evidence:** The complete local gate set passed on both review-repair trees: 8,444 tests passed and one
  skipped, with TypeScript and shell lint, both typechecks, and the build green. Full exact-head CI run
  `30502568032` is green at whole-target review head `9b22f5637` after the unchanged lifecycle-exit timeout passed
  on its one failed-job rerun; the in-flight cancellation test additionally proved sensitive by failing against a
  temporarily removed native cancel binding before passing against the restored production boundary. The
  six-finding repair's complete local gate passed with 8,449 tests and one skip; its aggregate-output regression
  first returned cancellation against the pre-fix native boundary, then passed as an in-flight output-limit proof.
  The hosted-portability repair and 25-second contract-probe timeout tree each passed the complete local code tier
  with 8,452 tests and one skip; the BSD regression first returned `unverifiable` against the pre-fix adapter, then
  passed. The two exact-head lifecycle failures provide the fail-first evidence for its fixture-specific 150-second
  correction. That correction passed its focused installed-surface fixture and the complete local gate with 8,452
  tests and one skip. It landed as code candidate `d3dfdad67`, whose exact-head self-hosted run `30509674582`
  passed every lane, including the lifecycle fixture without retry. Hosted dispatch `30510148067` passed macOS.
  Its first Windows attempt showed platform-wide runner degradation — 22 failures across unrelated process and Git
  suites plus unavailable CIM inspection — rather than the prior narrow contract failure. A retry of only that
  Windows job on the same SHA passed in 2 minutes 7 seconds, confirming the first attempt as transient.
- **Closure review:** CodeRabbit covered exact incremental range `14f3e23b3..ce68d9932` and opened four threads.
  The accepted repair rejects invalid output limits before native execution and structurally verifies the known
  top-level snapshot-source and ARC-eval command sequence instead of matching quoted lookalikes. The apparent
  11-versus-15-file mismatch came from comparing the donor manifest plus inherited planning files with the final
  target: dependency packaging, its packaging assertion, and the lifecycle fixture legitimately add four files.
  The final measurement stays fifteen files and both the ledger and PR summary must use the same exact target.
  The request to replace conservative half-per-stream caps was declined: Execa applies `maxBuffer` per descriptor,
  so allowing either stream the full limit would permit twice the aggregate memory budget.
- **State:** PR #397 accepted head `6b699eff1` after the final incremental CodeRabbit review found no new issues
  and landed through merge commit `6eebb7f31`.

#### S3 lock and mutation protocol — landed

- **Entry base:** `origin/main` `6eebb7f31`, the S2 merge.
- **Capability:** Record-scoped locks serialize exact-generation replacement and removal, reclaiming a holder only
  after its stable process anchor is conclusively dead.
- **Whole-file donor manifest:** `locus/{root,lock,mutation-anchor,mutation}.ts` and their direct unit tests.
  `locus/record-store.ts` and its unit test are layered as owned S3 additions on the landed S1 files rather than
  restored wholesale.
- **Proved exclusion:** `locus-mutations.e2e.test.ts` depends on the later public command surface and stays with
  that wiring slice.
- **Owned residual correction:** Replacement and removal require both the matching held record lock and the exact
  expected bytes. Layering preserves S1's atomic complete-write mint and its interrupted/concurrent mint proofs,
  which the older donor copy predates.
- **Focused evidence:** The four direct unit suites pass with 38 tests, including matching-lock success,
  wrong/released-lock refusal, live contention, stale-generation replacement/removal refusal, and stale-break
  behavior.
- **Exact review-target measurement:** 2,240 additions plus 20 deletions (2,260 changed lines) across twelve files
  against `6eebb7f31`; the two-commit construction head before this status update is `f01592e7c`.
- **Hosted review:** CodeRabbit covered exact target `6eebb7f31..d3d194337` and opened three actionable threads
  plus nine nitpicks. The accepted repair bounds acquisition after a dead-holder break, requires the expected lease
  generation before role/session-home transitions, and preserves `generation-mismatch` when final deletion loses
  its record. Supporting corrections make the ancestry boundary injectable, retain only actual lock bytes, align
  refusal reasons and helper types, and close the missing ownership and absence coverage. The advisory 80% docstring
  warning was declined because the project defines no percentage target and every new exported function has TSDoc.
- **Exact first-fix measurement:** 2,493 additions plus 20 deletions (2,513 changed lines) across thirteen files.
- **Whole-target closure review:** The incremental repair pass approved `4624ada5f` but skipped eight of its ten
  files as similar, so the coverage-doubt rule triggered a fresh whole-target review. That pass covered all
  thirteen files and opened five actionable threads plus nine nitpicks. The accepted repair binds liveness to the
  exact observed lease generation, preserves typed outcomes across record and cleanup races, rejects an impossible
  unleased session-home rebase, improves fallback diagnostics, consolidates record-digest parsing, and closes the
  requested direct coverage. Explicit lock-field serialization order was declined because ownership compares
  retained original bytes; parsed holders are never reserialized for comparison.
- **Exact second-fix measurement:** 2,717 additions plus 22 deletions (2,739 changed lines) across thirteen files.
- **Incremental closure review:** CodeRabbit reviewed `4624ada5f..bb55aa077` but skipped seven of ten changed files,
  so it did not close whole-target coverage. Its one new actionable finding was valid: concurrent replacements
  sharing one lock handle could both pass the final recheck and report success. The accepted repair serializes
  replacement and removal by record-lock path through the filesystem action and proves only one replacement can
  consume an expected generation.
- **Exact third-fix measurement:** 2,844 additions plus 54 deletions (2,898 changed lines) across thirteen files.
- **Closure review:** CodeRabbit covered the complete thirteen-file target at accepted head `81a188fd6` and found
  no actionable issues. Three top-level nitpicks were declined: mutation ports intentionally specify outcomes
  rather than one concrete lock mechanism; exporting the production lock-path helper would weaken its black-box
  test; and the 100 ms contention fallback is the sensitivity boundary that makes the same-owner race reproduce.
- **Gate evidence:** Complete local gates passed with 657 test files and 8,505 tests, one of each skipped. Exact-head
  self-hosted run `30562283136` then passed every lane after hosted approval removed `ci-defer-heavy`.
- **State:** PR #399 accepted head `81a188fd6` and landed through merge commit `ba2ce7272`.

#### R0 control isolation — landed

- **Entry base:** `origin/main` `ba2ce7272`, the S3 merge.
- **Manifest:** delete exactly `meta-session-locus-model.md`, `notes-session-locus-model.md`,
  `spec-session-locus-model.md`, and `tasks-session-locus-model.md` from `.arc/active/`; add or modify no other
  path.
- **Derived-view posture:** `ROADMAP` stays byte-identical. R0 isolates the base tree but does not change the work
  unit's lifecycle state; the control branch still carries the authoritative `Active` meta and the work unit
  remains In Flight.
- **Exact local measurement:** 5,083 deletions across four files against `ba2ce7272`.
- **Review posture:** This bridge contains no implementation and requires pull-request checks plus explicit merge
  authorization, but no hosted code review. S4 cuts only after R0 lands and inherits the four paths' absence.
- **Gate evidence:** Self-hosted run `30564649578` passed at accepted head `0d56c8eb5`; the planning-only
  classifier ran the Markdown and ARC contract lane and supplied both required merge contexts.
- **State:** PR #400 accepted head `0d56c8eb5` without hosted review and landed through merge commit `9c2f43ff9`.

#### S4 transient identity core — landed

- **Entry base:** `origin/main` `9c2f43ff9`, the R0 merge.
- **Projection:** `feat/transient-identity-core` in sibling worktree
  `arc-framework.session-locus-model-s4`; the managed checkout remains on the control branch.
- **Whole-file donor source manifest:** `errand/{change-request-lifecycle,exact-branch-generation,identity-claims,
  identity-record,identity-snapshot,identity-transaction,identity-transitions,locked-generation}.ts`.
- **Donor test manifest:** integration suites `errand-identity-{claims,transaction}.test.ts`; unit suites
  `errand-{change-request-lifecycle,identity-claims,identity-record,identity-transaction,
  identity-transitions}.test.ts`, `errand/exact-branch-generation.test.ts`, and the identity-snapshot-owned hunk
  of `errand-identity-snapshot.test.ts`.
- **Owned shared hunk:** add only the transient identity, snapshot, transaction, transition, claim, and
  change-request-lifecycle exports to `errand/index.ts`; later open/link/close/promote exports stay excluded.
- **Owned residual correction:** Preserve the legacy v1/v2 decoder domain accepted by the base errand codec while
  keeping v3 writes strict.
- **Seam reconciliation:** The transient-in-flight-index cases in `errand-identity-snapshot.test.ts` exercise
  `errand/record.ts` consumer wiring rather than the snapshot module. They stay out of S4 and travel with that
  wiring's first live reader in S6.
- **Exact construction measurement:** 4,274 additions across eighteen files against `9c2f43ff9`; the published
  construction head was `b03c970d0`.
- **Hosted review:** CodeRabbit reviewed the complete `9c2f43ff9..b03c970d0` target and opened seven actionable
  threads plus nine nitpicks. The accepted repair resets shared remote state between tests, normalizes explicit
  origin ports, distinguishes fatal optional-ref reads, retains the last push diagnostic, and closes seven
  worthwhile test and clarity gaps. The same-slug claim and recursive-serialization requests were declined
  against the source contract, the cleanup-precedence finding was withdrawn, and the per-entry batch-process
  suggestion remained a poor tradeoff. Every thread is resolved; CodeRabbit approved exact accepted head
  `d696419ab`.
- **Exact accepted measurement:** 4,369 additions across eighteen files against `9c2f43ff9`.
- **Gate evidence:** The complete local gate passed on the accepted tree with TypeScript and shell lint, both
  typechecks, all 8,600 tests with one skip, and the package build green. Exact-head self-hosted run `30569794621`
  passed every lane after one targeted rerun of the unchanged timing-sensitive locus lock unit test; the same SHA's
  preceding deferred unit job and complete local suite were already green, so no code or review-target change was
  made.
- **State:** PR #401 accepted head `d696419ab` and landed through merge commit `6b2218380`.
- **Path-set posture:** S4 inherits R0's removal and must carry no `.arc/active/**` diff.

#### S5 reconciliation — landed

- **Entry base:** `origin/main` `676d5d7c3`, the judgment-authority-model merge after S4.
- **Projection:** `feat/locus-reconciliation` in sibling worktree `arc-framework.session-locus-model-s5`; the
  managed checkout remains on the control branch.
- **Whole-file donor manifest:** `locus/reconciliation.ts` and its direct
  `locus/reconciliation.test.ts` unit suite.
- **Owned residual correction:** `reconcile-driver.ts` and its unit suite stay excluded. The driver has no
  production caller or IO implementor, and its dead-lock action has no implementation.
- **Slice-seam reconciliation:** The donor reducer imported richer later evidence records and the later
  marker-generation decoder by type and helper, so its literal 412-line source did not compile at this stop. S5
  instead accepts only the structural evidence and marker fields the pure reducer consumes; the later acquisition
  records remain structurally compatible without pulling either capability forward.
- **Exact construction measurement:** 915 additions across two files against `676d5d7c3`.
- **Publication:** PR #402 opened at exact construction head `dd3e87fe3`.
- **Initial hosted review:** CodeRabbit covered exact target `676d5d7c3..dd3e87fe3` and opened two actionable
  threads plus six nitpicks. The accepted repair classifies valid stale-record evidence by liveness, refuses every
  relevant live lock, makes stop-reason ordering exhaustive, and closes four authority, relevance, duplicate-action,
  and proof-isolation coverage gaps. UTF-8 comparison remains byte-ordered by contract, and the temporary structural
  evidence types remain private until their owning slices land.
- **Exact first-fix measurement:** 1,096 additions across two files at `02153d3e0`.
- **Hosted review:** Both actionable threads are resolved, and CodeRabbit approved exact accepted head
  `02153d3e0` after confirming the fixes. No further finding-driven change followed that approval.
- **Review-fix gate:** The focused suite passes all fifteen tests; the complete local gate passes with 8,615 tests
  and one skip.
- **Exact-head gate:** Approval removed `ci-defer-heavy` automatically, and the single complete self-hosted run
  `30576771924` passed every lane, including all three E2E shards, integration, portability, `ci-ok`, and
  `merge-ok`.
- **State:** PR #402 accepted head `02153d3e0` and landed through merge commit `6a5a0b973`.
- **Gate evidence:** After the base advance, the direct suite passes with nine tests, including pending, future,
  and legacy transient markers. Markdown lint, all three ARC contract checks, TypeScript and shell lint, both
  typechecks, the package build, and the complete suite pass with 8,609 tests and one skip.
- **Path-set posture:** S5 carries no `.arc/active/**` diff.

#### S6 evidence and roster reader — landed

- **Entry base:** `origin/main` `6a5a0b973`, the S5 merge.
- **Projection:** `feat/locus-roster-reader` in sibling worktree `arc-framework.session-locus-model-s6`; the
  managed checkout remains on the control branch.
- **Whole-file donor manifest:** `locus/{evidence,reader,roster,state,subject-meta}.ts` and the direct
  `locus/{evidence,reader,roster,state}.test.ts` unit suites.
- **Carried authority correction:** `locus/trusted-row.ts` and its direct suite enter with `state.ts`, their first
  live reader-owned consumer. This preserves the completed shared authority predicate rather than recreating a
  weaker private trust check.
- **Transient identity seam:** `errand/record.ts` gains the exact transient in-flight indexes and its deferred
  identity-snapshot cases. The status, session-init, and other later command consumers remain excluded until their
  owning wiring slices.
- **Marker and worktree seam:** The existing marker model gains read-side generation-bearing transient provenance
  without pulling S7's provisioning writers or removing the base's decomposition-candidate evidence. Registered
  worktree reads use Git's NUL-delimited porcelain protocol through the current shared parser, with exact-argument
  mocks and presentation-sensitive path coverage.
- **Base-drift reconciliation:** `subject-meta.ts` reuses an exported planning-stage resolver and satisfies the
  current load-set input without reverting its newer extension contract. `state.ts` keeps a narrow structural
  primary-safety result until S7 lands the concrete reader, and S5 reconciliation replaces its temporary evidence
  aliases with the S6-owned acquisition types.
- **Owned residual corrections:** Empty acquisition errors fall back to their stable code and oversized messages
  truncate at the shared 4,096-character schema limit. Evidence acquisition and subject-meta projection reuse one
  bounded scheduler; the high-cardinality reader test observes a configured maximum of two.
- **Exact construction measurement:** 4,196 additions plus 78 deletions (4,274 changed lines) across twenty-five
  files against `6a5a0b973`.
- **Base reconciliation:** Construction committed as `326be7f2c`, then current `origin/main` `8f7728e90` merged
  append-only without conflicts. The resulting exact head is `f46747027`; the slice measurement and path set are
  unchanged against the reconciled base.
- **Gate evidence:** After reconciliation, Markdown lint, all three ARC contract checks, TypeScript and shell lint,
  both typechecks, the package build, and the complete suite pass with 8,711 tests and one skip.
- **Publication:** PR #405 opened at exact reconciled head `f46747027` with `ci-defer-heavy` applied.
- **Initial hosted review:** CodeRabbit covered exact target `8f7728e90..f46747027` and returned one actionable
  thread plus twelve nitpicks. The approved repair set closes all thirteen: FIFO permit handoff and a deterministic
  overtaking proof; normalized/shared planning-stage resolution; strict NUL-only worktree parsing with exact fixture
  protocol; stronger marker, parse-error, concurrency, narrowing, trusted-row, and state-assembly coverage; and
  reuse of the already-derived locus frames.
- **Repair evidence:** The new scheduler proof failed first with an observed maximum of two under a limit of one,
  then passed after permit handoff. Removing the stale newline fallback exposed eighty downstream assertions across
  fifteen unit suites; one test-only NUL encoder and the affected mocks now reproduce Git's exact `-z` contract.
  The focused repair set passes seventeen files and 363 tests.
- **Review-fix gate:** Markdown lint, all three ARC contract checks, TypeScript and shell lint, both typechecks, the
  package build, and the complete suite pass on the final repair tree with 8,712 tests and one skip.
- **Review-fix publication:** The approved repair landed as `334b4179c` and was pushed to PR #405.
  The actionable thread was answered and resolved, and CodeRabbit approved that exact accepted head without a
  redundant incremental review.
- **Exact-head gate:** CodeRabbit approval removed `ci-defer-heavy`, and the single complete self-hosted run
  `30586287606` passed every lane, including all three E2E shards, integration, portability, `ci-ok`, and
  `merge-ok`.
- **State:** PR #405 accepted head `334b4179c` and landed through merge commit `39e2f090e`.
- **Path-set posture:** S6 carries no `.arc/active/**` diff.

#### S7 allocation and provisioning — landed

- **Entry base:** `origin/main` `39e2f090e`, the S6 merge.
- **Projection:** `feat/locus-allocation` in sibling worktree `arc-framework.session-locus-model-s7`; the managed
  checkout remains on the control branch.
- **Whole-file donor source manifest:** `git/{linked-worktree,linked-worktree-setup}.ts` and
  `locus/{allocator,primary-safety,provisioning-authority,provisioning-marker,provisioning-runtime,
  provisioning-types,provisioning}.ts`.
- **Whole-file donor test manifest:** direct unit suites for `git/linked-worktree.ts` and
  `locus/{allocator,primary-safety,provisioning-runtime,provisioning}.ts`.
- **Owned shared seams:** The existing marker model gains exact-generation reads, exclusive create, replacement,
  and removal while retaining S6 transient provenance and the base decomposition-candidate evidence. `reader.ts`
  and `state.ts` replace S6's temporary primary-safety type with the concrete S7 result. The provisioning runtime
  carries S3's held record lock into replace and remove, and lease attachment states its expected absent
  generation explicitly.
- **Proved exclusion:** The large work-unit reconciler rename and caller migration stay out of S7. Allocation and
  provisioning are independently live through their own composition, while work-unit lifecycle adoption belongs
  to S10.
- **Base reconciliation:** Before the construction commit, `origin/main` advanced through PR #406 to
  `b2c884dfa`. S7 fast-forwarded from `39e2f090e`; the seven incoming status and `ROADMAP` paths are disjoint from
  the slice, so its measurement and path set are unchanged.
- **Post-publication reconciliation:** Before initial hosted review, `origin/main` advanced through PR #408 to
  `b129ca5cf` and through PR #409 to `663ae3092`. S7 merged both advances append-only as `1662cd3f5` and
  `d1482f407`; every incoming path is chunked-delivery planning state disjoint from the slice, so its measurement
  and eighteen-file path set remain unchanged.
- **Exact construction measurement:** 3,265 additions plus 14 deletions (3,279 changed lines) across eighteen
  files against current reconciled base `663ae3092`.
- **Gate evidence:** Before hosted review, the eight focused reader, state, marker, allocation, and provisioning
  suites passed all 126 tests. Markdown lint, all three ARC contract checks, TypeScript and shell lint, both
  typechecks, the package build, and the complete suite passed after every base reconciliation; reviewed head
  `d1482f407` passed 678 test files and 8,776 tests, one of each skipped. After the review repair, nine focused
  suites pass all 154 tests and the complete suite passes 678 files and 8,790 tests, one of each skipped; TypeScript
  and shell lint, both typechecks, and the package build are also green. The first full self-hosted run after
  approval, `30594708142`, failed only the dead-holder reclaim fixture at its 20-millisecond acquisition deadline.
  The same head had passed Unit Tests in deferred run `30594291199` and the complete local suite, isolating a timing
  flake rather than a production regression. Commit `3d867fa9e` raises only the two asynchronous reclaim fixtures
  to 200 milliseconds while retaining the separate zero-deadline refusal coverage. The focused lock suite and
  complete local suite passed, then exact-head full run `30595580148` passed every lane, including all three E2E
  shards, integration, portability, `ci-ok`, and `merge-ok`.
- **Publication:** PR #407 opened directly against `main` at exact base `b2c884dfa` and construction head
  `8127b3c60`, with `ci-defer-heavy` attached before hosted review.
- **Initial hosted review:** CodeRabbit reviewed the complete reconciled target from exact base `663ae3092` through
  head `d1482f407`, returning seven actionable comments and nine nitpicks. Six actionable comments and seven
  nitpicks were accepted; the marker-conflict rollback comment, two low-value refactor/whitespace suggestions, and
  the repository-inapplicable docstring-percentage warning were declined with source-grounded replies.
- **Repair:** Commit `76c83d071` hardens temporary-marker cleanup, subject-key validation, pending-marker setup
  ownership, exact-lock minting, primary-pinned rollback, checkout-path exhaustiveness, and the accepted coverage
  gaps. All seven inline threads have replies and are resolved.
- **Hosted review:** The bounded incremental range covered exact prior reviewed head `d1482f407` through repair
  head `76c83d071` and returned clean. CodeRabbit approved, and all seven inline threads are resolved. The final
  head differs only by the two fixture-timeout values in `3d867fa9e`; by explicit scope decision, that CI-stability
  repair did not receive a redundant incremental review. CodeRabbit remains successful and approved on PR #407.
- **State:** PR #407 accepted exact head `3d867fa9e` against base `663ae3092` and landed through explicitly
  authorized admin merge commit `578e06685`. The merge commit's first parent is that base, its second parent is the
  accepted head, and its tree is byte-identical to the accepted head; the bypass covered only the sliced path's
  unavailable `arc-cleared` context.
- **Path-set posture:** S7 carries no `.arc/active/**` diff.

#### S8 errand open and link — landed

- **Entry base:** `origin/main` `578e06685`, the S7 merge.
- **Projection:** `feat/errand-open-link` in sibling worktree `arc-framework.session-locus-model-s8`; the managed
  checkout remains on the control branch.
- **Exact source manifest:** `errand/{identity-record,identity-transitions,index,link,link-runtime,open,
  open-runtime}.ts`; `locus/{allocator,entry-boundary,mutation,provisioning-types,provisioning,roster}.ts`;
  `locus/schema/{identity,record,state}.ts`; and `user-sync/{inbox-writer,index}.ts`.
- **Exact test manifest:** `errand-identity-{record,transitions}.test.ts`;
  `errand/{link-locus,open-locus,open-resume}.test.ts`;
  `locus/{entry-boundary,mutation,provisioning,schema}.test.ts`; and `user-sync-inbox-writer.test.ts`.
- **Provisioning outcome correction:** The provisioning receipt aggregates changes across checkout creation,
  marker ownership, primary preparation, role persistence, and lease attachment. Open reports `applied` whenever
  identity recovery or any provisioning stage changed authoritative state, including an existing identity whose
  local locus was missing.
- **Exact capture generation:** Inbox inspection derives a normalized source digest from the unique unbound entry.
  Full identities and partial roles persist that digest with the title; open, resume, and link refuse a same-title
  replacement, while generation-qualified removal preserves and refuses the replacement. Execute-bound marking
  does not rotate the source generation.
- **Correction reallocation:** E5-F1 closes in S8 at the identity, role, entry, and removal seams. B-F1 moves to
  `7.P.iB.ii`, because S9B owns promotion's identity-absent recovery post-image and can preserve the exact capture
  handle after identity retirement through meta commit and settlement.
- **Base reconciliation:** Before initial hosted review, `origin/main` advanced through PRs #411–#415 to
  `0fd41c0ed`. S8 merged the base append-only as `ea104d68c`; the incoming backlog, strategy-roster,
  Markdown-table, and status-projection changes are disjoint from the slice, so its measurement is unchanged.
- **Exact construction measurement:** 2,404 additions plus 19 deletions (2,423 changed lines) across 28 files
  against `578e06685`.
- **Gate evidence:** Twelve focused identity, open/link, locus, and inbox suites pass all 148 tests. Markdown lint,
  all three ARC contract checks, TypeScript and shell lint, both typechecks, the package build, and the complete
  suite pass after the base merge; the complete suite reports 682 passing files and 8,829 passing tests, with one
  skip in each count.
- **Hosted review:** CodeRabbit reviewed the complete exact target from base `0fd41c0ed` through reconciled head
  `ea104d68c`. Review repair `843504c63` implements eleven accepted findings; the six inline threads were answered
  and resolved, including source-grounded declines for three findings that conflicted with the pre-release
  compatibility posture. The exact-head incremental review completed successfully with no new threads.
- **Post-review gate evidence:** Six focused suites pass all 83 tests. Markdown lint, all three ARC contract checks,
  TypeScript and shell lint, both typechecks, the package build, and the complete suite pass; the complete suite
  reports 682 passing files and 8,847 passing tests, with one skip in each count.
- **Publication:** Construction commit `a195f05b1` opened PR #410; current head `843504c63` is pushed against exact
  base `0fd41c0ed`. Review automation removed `ci-defer-heavy` after exact-head approval. Final self-hosted CI is
  green across lint/typecheck, unit, integration, all three E2E shards, portability, `ci-ok`, and `merge-ok`.
- **State:** PR #410 accepted exact head `843504c63` against base `0fd41c0ed` and landed through explicitly
  authorized admin merge commit `06c93e6b8`. The merge commit's first parent is that base, its second parent is the
  accepted head, and its tree is byte-identical to the accepted head; the bypass covered only the sliced path's
  unavailable `arc-cleared` context.
- **Path-set posture:** S8 carries no `.arc/active/**` diff.

#### S9A errand close, abandon, and settle — landed

- **Entry base:** `origin/main` `06c93e6b8`, the S8 merge.
- **Projection:** `feat/errand-terminals` in sibling worktree `arc-framework.session-locus-model-s9`; the managed
  checkout remains on the control branch.
- **Capability boundary:** close, abandon, partial settlement, selected-generation support, and their v3/legacy
  coverage. Promotion runtime, promotion recovery post-images, and real-runtime promotion coverage enter only in
  S9B after S9A lands.
- **Completed correction:** Close dispatch now reconciles the configured remote identity ref before choosing the
  legacy or v3 implementation. A fail-first real-CLI fixture proves that a fresh clone with only a remote v2
  generation reaches the retained force-close path and removes that exact remote record.
- **Real-CLI v3 close proof:** A strict `gh` executable on `PATH` accepts only the exact merged-discovery and
  lifecycle query shapes. One case finalizes a merged identity-only v3 Errand; another preserves the identity and
  refuses from a separate checkout while the original occupancy remains.
- **Exact accepted measurement:** 5,537 additions plus 587 deletions, for 6,124 changed lines across forty-four
  files against entry base `06c93e6b8`. Review corrections moved the slice above the approximate 5,500-line target
  but kept it below the explicitly accepted 10,000-line upper bound. Promotion was already removed as S9B; a
  further split would separate the tightly coupled close, abandon, settlement, and shared exact-generation
  authority whose review findings had to land before this stop could ship coherently.
- **Construction commit:** `b04c44a0d` records the S9A capability and the completed remote-only legacy-close
  correction before the remaining real-CLI v3-close proof.
- **Coverage commit:** `d52a6bda1` adds the exact-host v3 close and retained-occupancy refusal proof; this is the
  published candidate head for PR #416.
- **Gate evidence:** TypeScript and shell lint, both typechecks, the package build, four focused close suites with
  62 tests, and the complete suite pass. The first complete run passed 8,911 tests and hit one unrelated
  `config-validate` fixture 150 milliseconds beyond its five-second limit; that case passed alone in 1.03 seconds,
  and the unchanged complete retry passed 690 files and 8,912 tests with one skip in each count. After review
  repairs, the complete local suite passed 691 files and 8,939 tests with one skip in each count, and the exact
  accepted head passed the complete self-hosted CI matrix plus `ci-ok` and `merge-ok`.
- **Path-set posture:** S9A carries no `.arc/active/**` diff.
- **Review result:** The full CodeRabbit pass was repaired in `22d77f908`; every thread was answered and resolved,
  and the incremental pass approved that exact head with no further findings.
- **Landing:** PR #416 merged the accepted head `22d77f908` into `main` as `ce9ce0fdb` after the deferred-heavy
  label was removed and every real check passed. The admin merge bypassed only the sliced path's unavailable
  `arc-cleared` context.
- **Next:** Enter S9B from `origin/main` `ce9ce0fdb`, construct only Errand promotion and its replay/runtime
  corrections, and retain the no-`.arc/active/**` path-set invariant.

#### S2R real-npx process-boundary repair — inserted

- **Incident base:** Current `main` `b94395b30`, after PR #417. `npx arc errand close route-retained-work --json`
  refuses `lease-unknown`; the retained primary locus stores an `unverifiable` anchor naming the Node executable,
  and the resulting degraded roster blocks unrelated allocation.
- **Exact production snapshot:** The CLI's Node process enters through quoted `sh -c` and reaches an npm parent
  whose executable is Node but whose `/proc/<pid>/cmdline` is one flattened argument, `npm exec arc ...`, before the
  tool shell and native Codex process. `isNpmArcInvocation` requires tokenized arguments and rejects that boundary.
- **Coverage defect:** The landed unit fixture supplied the same display text but omitted `commandArguments`, so
  the inspector reparsed the text into tokens instead of exercising the producer's one-element argument array.
- **Correction boundary:** Normalize only a Node snapshot carrying the exact one-argument npm process-title shape,
  retain all existing refusals for arbitrary Node commands, and prove both the faithful snapshot and a real Linux
  `npx arc` runtime. The correction owns no promotion behavior and carries no `.arc/active/**` paths.
- **Construction:** Commit `411b3a5e4` reparses only a Node wrapper's one-element process-title argument as a direct
  npm-to-ARC invocation. A faithful producer snapshot and a real Linux `npx arc errand open` regression prove the
  native Codex anchor, while an unrelated flattened Node title remains refused.
- **Exact accepted measurement:** 87 additions plus two deletions across three files against `b94395b30`; the
  target carries no `.arc/active/**` paths.
- **Gate evidence:** Markdown lint, all three ARC contract checks, TypeScript and shell lint, both typechecks, the
  package build, and the complete suite pass at accepted head `8616e4f15`. The clean whole-suite run reports 691
  passing files and 8,941 passing tests, with one skip in each count.
- **Review and CI repair:** CodeRabbit's whole-target pass approved construction head `411b3a5e4` after its sole
  source-invalid thread was answered and resolved. The first released self-hosted E2E run then exposed that
  downloaded build artifacts lose the CLI executable bit. Commit `8616e4f15` replaces the temporary test symlink
  with an executable Node launcher that imports the built CLI from its real location, preserving both invocation
  shape and dependency resolution. The incremental CodeRabbit pass over `411b3a5e4..8616e4f15` returned no
  actionable comments and a successful exact-head status.
- **Publication:** PR #419 targets `main` from accepted head `8616e4f15`. `ci-defer-heavy` remained attached through
  the review and repair cycle, then was removed for final CI.
- **Exact-head gate:** The complete self-hosted run `30653647054` passed every real lane, including all three E2E
  shards, integration, portability, `ci-ok`, and `merge-ok`. The PR is merge-ready and awaits explicit admin-merge
  authorization to bypass only the sliced path's unavailable `arc-cleared` context.
- **Landing:** PR #419 merged accepted head `8616e4f15` into `main` as `000770fb81`. The authorized admin merge
  bypassed only the sliced path's unavailable `arc-cleared` context.
- **Operational recovery:** After rebuilding the primary checkout at `000770fb81`, the exact corrupt development
  locus generation for claim `652a6001c1c55987a813b116f6b0d942` was removed while its identity remained intact.
  `npx arc errand close route-retained-work --json` then finalized the merged Errand and retired that identity.
  A disposable fresh Errand opened successfully and persisted a Linux process anchor with `selector: "codex"`;
  its exact live probe locus was cleared solely to permit same-session cleanup, after which normal Errand abandon
  retired its identity and the unchanged probe branch was deleted. Final session-init reports a clean base and
  worktree, no failed probes, no in-flight or resumable Errand, and no residue for either slug.
- **Historic-state recovery:** The corrupt lease has no PID or start token and cannot be correlated after the code
  fix. Under the project's pre-public-release persisted-state posture, clear only its exact development-time locus
  generation after S2R lands; retain the Errand identity and let repaired `npx arc errand close` perform its normal
  ref, capture, and identity retirement. Verify the global stop clears and exercise a fresh Errand open afterward.
- **Paused successor:** S9B remains uncommitted and unpublished at completed Task `7.P.iB.i` in its existing
  worktree. Reconcile it with repaired `main` `000770fb81` before continuing.

#### S9B errand promotion — construction resumed

- **Entry base:** Repaired `origin/main` `000770fb81`, the S2R merge.
- **Reconciliation:** The unpublished Task `7.P.iB.i` work was held in a path-scoped safety stash while the branch
  fast-forwarded from S9A merge `ce9ce0fdb`. The sole overlap was additive in `errand.e2e.test.ts`: S2R's real-`npx`
  helpers and S9B's promotion helpers now coexist. Every other tracked file and all three new files were restored
  byte-for-byte from the saved state.
- **Promotion runtime checkpoint:** Commit `c409268f2` composes promotion through the real command boundary and
  preserves exact identity, checkout, lifecycle, and recovery evidence for replay.
- **Exact checkpoint measurement:** 1,704 additions plus 441 deletions across ten files against `000770fb81`; the
  target carries no `.arc/active/**` paths.
- **Gate evidence:** The promotion-focused set passes 12 unit, eight integration, and 40 E2E tests. TypeScript and
  shell lint, both typechecks, the package build, and the complete suite pass with 693 files and 8,950 tests, one
  skip in each count.
- **Capture settlement:** The promoted work-unit role retains the exact capture title and source digest after
  identity retirement. A replay under the self-held lease settles that generation only after the meta commit through
  the notes-locked inbox mutator, then clears the role handle; an absent original is idempotent and a same-title
  replacement is preserved with `inbox-link-conflict`.
- **Retained-capture checkpoint:** Commit `61b1d2c20` closes Task `7.P.iB.ii`. Merge `8198bd0a8` then reconciled
  `origin/main` `e76d18025` append-only without conflict; post-merge lint, typecheck, build, and Markdown contracts
  passed before the S9AR report interrupted the full-suite run.
- **S9AR reconciliation:** Merge `73cfdc32b` reconciles `origin/main` `bc7b643dd` append-only without conflict. The
  shared `errand.e2e.test.ts` surface merged automatically, preserving both promotion coverage and the landed
  base-context close regressions.
- **Exact final measurement:** 2,138 additions plus 463 deletions across 18 files against `bc7b643dd`; the target
  carries no `.arc/active/**` paths.
- **Final gate evidence:** The focused schema, promotion unit/integration, and built-CLI set passes all 27 tests.
  Markdown lint, all three ARC contract checks, TypeScript and shell lint, both typechecks, the package build, and the
  pre-S9AR complete suite passed 693 files and 8,953 tests, one skip in each count. At reconciled head `73cfdc32b`,
  the ordinary parallel complete suite passes 696 files and 9,097 tests, again with one skip in each count; every
  non-test Tier 3 gate passes against the same tree.
- **Publication:** PR #422 targets current `main` from exact head `73cfdc32b`; `ci-defer-heavy` remains attached
  through the hosted review and repair cycle.
- **Initial hosted review:** CodeRabbit covered the complete exact target and opened six actionable threads. Five
  were accepted outright. The settlement-coverage request was accepted only at its valid pre-meta boundary: the
  unit test now proves settlement is deferred, while the existing integration and E2E coverage continues to own
  exact post-meta settlement and digest behavior.
- **Review repair:** Legacy link/promotion E2E coverage now pins the exact JSON refusal envelopes through a durable
  runtime anchor; the round-trip protection helper fails loudly; JSON promotion rendering asserts its complete
  result; malformed promotion names use `promotion-source-invalid`; and inbox generation conflicts expose typed,
  stable codes that the promotion handler maps without matching error prose.
- **Review-fix gate:** The five focused files pass all 92 tests. Markdown lint, all three ARC contract checks,
  TypeScript and shell lint, both typechecks, the package build, and the ordinary parallel complete suite pass with
  696 files and 9,100 tests, one skip in each count.
- **Review-fix publication:** Commit `656202067` publishes the approved repair to PR #422.
- **Thread closure:** All six actionable threads were answered against `656202067` and resolved.
- **Incremental review:** CodeRabbit approved exact head `656202067` with no new findings, but skipped three changed
  test files as similar to previously reviewed changes. The partial result triggers the runbook's hosted Codex
  fallback rather than completing the review obligation.
- **CI transition:** CodeRabbit approval automatically removed `ci-defer-heavy` and launched the final self-hosted
  jobs. The label remains off while those jobs run.
- **Hosted Codex fallback:** The complete fallback review at exact head `656202067` opened three actionable
  threads: promoted replay was not bound to its originating slug/claim generation, warm-parent revalidation could
  accept and release a new same-anchor lease generation, and invalid JSON input escaped the typed result emitter.
  All three findings were verified against source and accepted.
- **Hosted repair:** The work-unit role now persists and projects immutable promotion provenance; both
  identity-present recovery and identity-absent replay reject foreign source generations. Warm promotion requires
  the exact pre-lock parent role, lease ID, session home, and live self-held anchor before releasing it. A missing
  `--floor --json` now emits one `locus.errand-promote.input` envelope on stdout with empty stderr.
- **Hosted-repair gate:** Fail-first coverage exercises wrong-slug replay, missing/wrong-claim provenance, same-
  anchor parent lease reacquisition, parent-role replacement, and the real CLI JSON boundary. The focused set passes
  48 tests. Markdown lint, all three ARC contract checks, TypeScript and shell lint, both typechecks, and the build
  pass; the ordinary parallel complete suite passes 696 files and 9,109 tests, one skip in each count.
- **Hosted-repair publication:** Commit `ec2ea6de9` publishes the approved correction to PR #422. All three hosted
  Codex threads were answered against that exact head and resolved; no hosted finding remains open.
- **Exact-head incremental review:** CodeRabbit reviewed `656202067..ec2ea6de9` and returned four summary-only
  nitpicks: share the public role projection, document the post-retirement comparison boundary, prove unchanged
  promotion provenance remains mutable, and reuse the promotion-source schema. All four were accepted; no inline
  thread required a reply or resolution.
- **Nitpick closeout:** Commit `51fb5ec3f` shares the role projection and schema, records the recovery boundary, and
  adds the positive provenance regression. The regression failed first against an over-strict reference comparison.
  Four focused suites pass all 60 tests; TypeScript and shell lint, both typechecks, the build, and the complete suite
  pass with 696 files and 9,110 tests, one skip in each count. By explicit review-scope decision, these mechanical
  review closeouts do not trigger a redundant hosted pass.
- **Final CI:** Exact-head self-hosted run `30700558995` passes lint/typecheck, unit, integration, all three E2E
  shards, portability, `ci-ok`, and `merge-ok` at `51fb5ec3f`.
- **Landing:** PR #422 merged accepted head `51fb5ec3f` into `main` as `34b28d22a`. The merge commit's first parent
  is exact base `bc7b643dd`, its second parent is the accepted head, and its tree is byte-identical to that head. The
  authorized admin merge bypassed only the sliced path's unavailable `arc-cleared` context.
- **Next:** Construct S10 from `origin/main` `34b28d22a` with no `.arc/active/**` paths and work Task `7.P.j.i`.

#### S9AR base-context close repair

- **Trigger:** A merged ordinary Errand remained on a live primary-checkout locus. Switching that same checkout back
  to `main` and invoking `npx arc errand close <slug>` from the same Codex session refused with generic
  `role-conflict`; switching back to the Errand branch allowed finalization.
- **Conformance:** The specification permits `arc errand close <slug>` to run later from base context. Same checkout,
  exact claim generation, and the matching live session anchor are sufficient authority; genuinely foreign or
  unprovable occupancy must still refuse.
- **Cause:** Transient subject projection marks the row `subject-unresolved` when the checkout's current branch no
  longer equals the retained identity branch. Frame derivation therefore cannot select the self-held lease as
  current, and close's occupancy classifier rejects the exact claim through its generic untrusted-row path.
- **Correction boundary:** The close runtime supplies a structured proof only after establishing that the current
  checkout is on the configured base with no primary-checkout marker both before and after locus acquisition. The
  proof binds that stable observation, normalized record ID, and exact path to the complete ordinary-Errand identity
  projection. Occupancy may clear only when the claim's path also exactly equals the registered primary path and the
  reader exposes that exact identity as in flight, alongside the live self-held lease and one record-scoped
  branch-mismatch `subject-unresolved`. Base-context clearance acquires the exact checkout's Git-native `HEAD` lock,
  revalidates the markerless base branch under that lock, and holds it through ref cleanup, capture settlement, and
  identity retirement. The renewable guard still revalidates at each destructive boundary, while the lock prevents
  a competing Git checkout switch from crossing the final observation-to-mutation gap. Every modeled exit releases
  the lock. Immediately before exact local-ref deletion, the base-context path rereads Git's registered worktree
  roster and refuses when the target branch is checked out anywhere or the roster is unreadable. That final guard
  protects registered occupancy without claiming repository-global exclusion over an uncoordinated raw Git mutation
  after the read; every other authority failure retains its current refusal.
- **Verification boundary:** Unit coverage proves the narrow authorization and foreign/untrusted counterexamples. A
  built-CLI regression opens the Errand, switches the same checkout to base under the same durable anchor, finalizes
  exact merged host truth, and proves ref and identity cleanup. Destructive-path counterexamples inject a malformed
  marker and rewrite the record path to a normalization-equivalent spelling after the base switch; both prove close
  refuses while preserving the branch and identity. A real Git-wrapper race returns the snapshot's final base-branch
  observation, switches the checkout before that read completes, and proves the post-acquisition recheck preserves
  the Errand rather than applying stale authority. A second real wrapper attempts a switch during the cleanup fetch,
  and a third attempts one immediately before the final local `update-ref` deletion; Git blocks both under the
  checkout lock, close remains on base, and the exact refs plus identity retire. Unit replay coverage interrupts
  after remote deletion, retains the local ref and identity, then settles the remaining local generation on the next
  authorized pass. A real linked-worktree regression checks out the target branch before finalization and proves
  close preserves the local ref, originating capture, and identity; unit coverage proves an unreadable worktree
  roster fails closed at the same boundary.
- **Delivery:** Cut `fix/errand-close-base-context` from current `main` as a focused S9A repair carrying no
  `.arc/active/**`. Use hosted Codex review while CodeRabbit cools down, merge S9AR first, then reconcile and publish
  S9B against the repaired base.
- **Construction:** Branch `fix/errand-close-base-context` starts from `origin/main` `e76d18025`. The four-file
  implementation adds 77 lines and removes seven, with no `.arc/active/**` path in the target. Commit `a1aaefbab`
  is the exact published construction head.
- **Gate evidence:** The initial close-focused set passed all 85 tests, and the original clean serial full suite
  passed 9,071 tests. After the hosted repair, the expanded close-focused set passes all 86 tests; TypeScript and
  shell lint, both typechecks, the package build, and the clean one-worker full suite pass with 694 files and 9,072
  tests, one skip in each count. After the second hosted repair, the close-focused set passes all 88 tests and the
  clean one-worker full suite passes 694 files and 9,074 tests, again with one skip in each count. After the third
  hosted repair, the close-focused set passes all 89 tests and the clean one-worker full suite passes 694 files and
  9,075 tests, again with one skip in each count. After the fourth hosted repair, the expanded six-suite close set
  passes all 107 tests and the clean one-worker full suite passes 694 files and 9,079 tests, again with one skip in
  each full-suite count. After the fifth hosted repair, the expanded six-suite close set passes all 110 tests and the
  unchanged clean one-worker full-suite rerun passes 694 files and 9,082 tests, with one skipped file and test. After
  the sixth hosted repair, the six-suite close set passes all 113 tests and the clean one-worker full suite passes
  694 files and 9,085 tests, again with one skipped file and test.
- **Publication:** PR #421 targets `main`; the first review repair is published at `fe61792b1` and the second at
  `dbaea8f9b`; the third is published at exact head `dc6c6736b`, and the fourth at exact head `71653d35b`.
  The fifth is published at exact head `15df528d0`, and the sixth at accepted head `2fdb25fc3`. `ci-defer-heavy`
  remained attached through the complete review cycle, then was removed for final CI. CodeRabbit was not invoked
  for this slice.
- **Hosted review:** Codex reviewed initial head `a1aaefbab` and found that the coarse `subject-unresolved` bypass
  admitted malformed or unreadable marker evidence. Its exact-head review of `fe61792b1` then found that record-level
  causes were also deduplicated, allowing a normalization-equivalent path mismatch to resemble branch-only drift.
  Its exact-head review of `dbaea8f9b` found that the base branch and marker were captured before asynchronous locus
  acquisition, allowing a later branch switch to leave a stale proof. Its exact-head review of `dc6c6736b` found
  that the resulting base proof expired before asynchronous ref teardown, capture settlement, and identity
  retirement. Its exact-head review of `71653d35b` found one final scheduling gap between revalidation and local ref
  deletion. Its exact-head review of `15df528d0` found that the checkout lock did not protect a registered linked
  worktree using the same branch. The accepted repairs add the structured proof, renewable guard, checkout lock, and
  bounded registered-worktree guard above and close all six concrete counterexamples.
- **Exact-head gate:** Self-hosted run `30678884274` passed lint and typecheck, unit and integration tests, all three
  E2E shards, portability, `ci-ok`, and `merge-ok` at accepted head `2fdb25fc3`. Every hosted review thread was
  resolved before the deferred-heavy label was removed.
- **Landing:** PR #421 merged accepted head `2fdb25fc3` into `main` as `bc7b643dd`. The authorized admin merge
  bypassed only the sliced path's unavailable `arc-cleared` context.
- **Next:** Reconcile the existing S9B worktree from `8198bd0a8` with `origin/main` `bc7b643dd`, rerun its complete
  gates, publish it, and open its pull request with `ci-defer-heavy` retained through hosted Codex review.

#### S10 work-unit lifecycle integration — landed

- **Entry base:** `origin/main` `34b28d22a`, the S9B merge. Branch `feat/work-unit-locus-integration` remains an
  isolated sibling-worktree projection; the managed checkout and all four active planning artifacts remain on the
  control branch.
- **Gate head and pull request:** Commit `46eba9e67` was published as PR #423 directly against `main` base
  `34b28d22a`; CodeRabbit reviewed the whole target and approved repaired head `d67abfd01`.
- **Whole-file donor source manifest:** `work-unit/{work-unit-locus,rename-locus,teardown-locus,
  teardown-occupancy}.ts`, plus the rename of `reconcile-worktree.ts` to
  `reconcile-work-unit-worktree.ts`. Direct unit and integration suites move with those modules.
- **Owned shared seams:** Work-unit creation and materialization establish a durable role, attaching the invoking
  session only for an in-place entry. Atomic graduation compensates a role created by its own failed transaction.
  Rename rekeys both subject and path under deterministically ordered record locks. Teardown carries exact roster,
  record, lease, lock, marker, and lifecycle generations into a target-lock transaction that holds through physical
  removal and expected-generation role pop.
- **Current-main reconciliation:** The renamed reconciler preserves the landed spawned-worktree provisioning seam;
  atomic graduation retains the landed index transaction and rollback model; every record-store replacement,
  removal, mint, and lease attach supplies the lock or observed-generation inputs required by current `main`.
- **W2-F1 correction:** `resume --here` no longer invokes the locus driver before its deferred checkout. The emitted
  post-entry continuation runs `arc wu reconcile <slug> --attach-session --apply --json`; ordinary `wu reconcile`
  remains non-attaching. The real-driver round trip proves no role exists before checkout and the exact work-unit
  role plus live lease exists afterward.
- **Construction repairs:** Full-suite reconciliation added the new filesystem primitives to the lifecycle handler
  mock, made the command-input declaration ID match the kebab-case CLI option, aligned teardown ownership fixtures
  with the configured identity, and completed the path rekey when a deferred self-rename had already changed the
  source record's subject before the physical move landed.
- **Exact local measurement:** 3,532 additions plus 380 deletions (3,912 changed lines) across 56 files against
  `34b28d22a`. The prospective target contains no `.arc/active/**` path.
- **Fail-first evidence:** The real-driver resume round trip rejected the pre-checkout branch under the old behavior;
  removing atomic role composition or retirement left the expected role absent or stranded; making reconcile attach
  unconditionally failed eight real-CLI cases; and the deferred self-move regression reproduced `role-conflict`
  before the resumed-path correction.
- **Gate evidence:** Fourteen direct S10 unit/integration files pass all 217 tests, and the explicit post-entry E2E
  suite passes all 11. Markdown lint, all three ARC contract checks, TypeScript and shell lint, both typechecks, and
  the package build pass. The real checkout passes every non-index-sensitive Vitest file (700 passed, one skipped;
  9,160 tests passed, one skipped); the exact prospective tree passes the three index-sensitive coupling-audit tests,
  for complete coverage of 702 files and 9,164 tests.
- **Landing:** The complete hosted CI matrix passed at accepted head `d67abfd01`. PR #423 merged it into `main` as
  `ca691fd38`; the authorized admin merge bypassed only the sliced path's unavailable `arc-cleared` context.
- **Next:** Construct S11 from `origin/main` `ca691fd38` on `feat/locus-recovery`, port its exact recovery manifest
  without any `.arc/active/**` paths, and complete Task `7.P.k.i`.

#### S11 recovery — landed

- **Entry base:** `origin/main` `ca691fd38`, the S10 merge. Branch `feat/locus-recovery` remains an isolated
  sibling-worktree projection; the managed checkout and all four active planning artifacts remain on the control
  branch. Commit `366ae0da7` is the exact construction and gate head.
- **Pull request:** PR #424 targeted `main` base `ca691fd38`. Hosted Codex reviewed the whole target from
  construction head `366ae0da7`; the accepted exact head is `04cd9b465`.
- **Manifest:** New production modules are `handlers/locus-state-probe.ts` and
  `lib/recover/{legacy-errand,locus-context}.ts`. Recovery probes, report/audit composition, status schemas and
  result composition, compaction-seed schema acceptance, and the active-candidate projection form the owned shared
  seams. Direct recovery suites plus the session-envelope helper, goldens, and E2E expectations move with them.
- **Authority boundary:** Recovery derives its workflow, load set, and cursor from reader-validated locus state.
  A checkout with only active metadata resolves no work-unit frame and reports seed drift instead of silently
  reclaiming authority. Pre-model Errands retain a bounded exact-return-branch fallback.
- **Finding corrections:** A ready report with a hint-bearing seed now requires a non-null locus comparison whose
  expected generation equals the seed. Legacy recovery projects the exact parent candidate from an ordinary
  multi-work-unit namespace instead of requiring repository-global single resolution.
- **Slice boundary:** Compaction-seed schema accepts locus hints and absence dispositions, but the emitter and
  session-init wiring that produce them remain in S12. No `locusGuidance` surface enters this slice.
- **Construction reconciliation:** Recovery wire fixtures now carry the S11 locus state and frame. Their normalized
  path tokens remain valid absolute paths under schema replay, and sibling fixture roots sort deterministically.
- **Exact accepted measurement:** 2,975 additions plus 317 deletions (3,292 changed lines) across 35 files against
  `ca691fd38`. The target contains no `.arc/active/**` path.
- **Fail-first evidence:** The hint-bearing ready report initially accepted a null comparison; the real Git legacy
  regression initially rejected the exact parent when a sibling WU was also active; and the old E2E expectations
  treated record-less active metadata as a recoverable frame.
- **Review corrections:** The accepted head rejects contradictory `locus` plus `locusAbsence` dispositions in both
  producer and reader schemas, and lets valid pre-model transient seeds recover only through the exact role-specific
  load-set suffix and live frame. The remaining finding — emitting the disposition in new seeds — stays with S12's
  compaction/session wiring boundary.
- **Gate evidence:** The focused accepted-tree regressions pass all 82 tests. Markdown lint, all three ARC contract
  checks, TypeScript and shell lint, both typechecks, the package build, and the complete 705-file suite pass; 9,256
  tests pass, with one file and test skipped. Hosted CI passed every real job plus `ci-ok` and `merge-ok` at
  `04cd9b465`.
- **Landing:** PR #424 merged accepted head `04cd9b465` into `main` as `0b0e64ee8`; the authorized admin merge
  bypassed only the sliced path's unavailable approval/`arc-cleared` context.
- **Next:** S12 was constructed from this stop, then preserved unpublished when S10R preempted it.

#### S10R upgraded-worktree adoption repair — landed

- **Trigger:** `decompose-planning-lane`, created before S10 landed, absorbed the locus model and remained an
  unmanaged checkout. Its recovery path reported load-set and task-cursor drift, while ordinary applied
  reconciliation reported clean until the operator supplied the undiscoverable `--attach-session` flag.
- **Immediate rollout:** Other pre-model worktrees remain unmanaged after merging the new implementation. From the
  exact live work-unit session, reconcile current `main`, then run
  `npx arc wu reconcile <slug> --attach-session --apply --json`. `delivery-plan-record` is the only known active
  checkout still in this class; dormant worktrees require the same explicit adoption when resumed until S10R lands.
- **Repair boundary:** Ordinary `wu reconcile <slug> --apply` backfills the exact verified durable work-unit role
  without a lease and reports the mutation; passive reconcile remains read-only, and explicit `--attach-session`
  attaches only when a durable process anchor resolves. Session entry recognizes an unmanaged exact checkout and
  recommends that applied repair. `start --here` establishes its in-place role and, where available, lease as part
  of the cold-start transaction.
- **Attachment correction:** `delivery-plan-record` proved that explicit `--attach-session` still refused from an
  agent tool subprocess when ancestry reaches an unrecognized process boundary. Restoring that hard refusal would
  leave upgraded worktrees without a usable entry path, but persisting the resulting `unverifiable` WU lease wedges
  replacement and teardown because no later operation can prove it dead or self-held. S10R therefore retains the
  typed unknown selection only as evidence that no lease may attach, uses a separately process-verifiable session or
  command anchor for its mutation lock, and leaves the adopted WU role leaseless. An exact dead prior WU lease is
  cleared under the same record lock; live or unknown existing occupancy still refuses.
- **Construction:** Applied reconcile now reuses the work-unit locus driver with lease attachment disabled and
  reports a newly created role as an applied result even when no tracked edit exists. Session init classifies only
  the current checkout's exact roster row before surfacing the repair. Cold start establishes the live role and
  lease after scaffolding, and its shared best-effort rollback removes the new active meta plus any auto-cut branch
  when locus establishment fails.
- **Verification design:** Fail-first coverage proved applied reconcile first returned clean, session init first
  suppressed the missing-role guidance, and cold start first succeeded despite a refusing locus driver. Review
  correction regressions additionally prove that unanchored explicit entry creates no lease and replaces an exact
  dead process lease with the normal leaseless WU frame. A built-CLI crash regression pauses the unanchored command
  under its record lock, terminates it, and proves the next reconciliation reclaims that process-verifiable holder.
  The remaining coverage proves passive read-only inspection, durable anchored attachment, sibling-worktree
  isolation, rollback on failure, and aliased-path correctness.
- **Isolation:** Branch `fix/work-unit-locus-adoption` cuts from current `main` `0b0e64ee8`. The complete, green S12
  candidate stays unchanged in its sibling worktree until this correction lands; it then merges the new base and
  re-runs the complete gates. S10R carries no `.arc/active/**` path.
- **Published head:** Commits `902867ef2` and `2de196ecc`, append-only current-main merge `538f3e89f`, attachment
  correction `7a9a05d45`, and hosted-review fixes `ef329d954` and `9a1f43a51` are PR #425 directly against `main`.
  `ci-defer-heavy` was removed only after all review threads settled and the current head's light checks passed.
- **Exact measurement:** 539 additions plus 90 deletions (629 changed lines) across fourteen files against
  `827c5bc89`. The target contains no `.arc/active/**` path.
- **Review corrections:** Hosted Codex first identified two path-identity gaps. Reconcile and cold start now compare the
  requested checkout with Git's roster through ephemeral canonical filesystem identity while retaining the roster
  spelling in durable records; session-entry classification uses the same comparison. Its exact-head re-review then
  identified that persisting an unverifiable WU lease made successful entry unreleasable. The accepted correction
  keeps that WU role leaseless and clears only exact dead predecessor occupancy. Fail-first real-runtime regressions
  cover both the fresh and dead-lease paths. Its final pass then identified that the same unverifiable selection was
  serialized as the mutation-lock holder, making an interrupted command's residue permanently unknown. The second
  accepted correction separates session evidence from process-verifiable lock ownership and directly proves dead
  holder reclamation. Both correction threads have source-backed fix replies and are resolved at exact head
  `9a1f43a51`; all four PR review threads are now closed.
- **Gate evidence:** The corrected real-CLI file passes all sixteen cases, including durable anchored attachment,
  leaseless unanchored adoption, exact dead-lease cleanup, and interrupted-lock reclamation. Markdown lint, all three
  ARC contract checks, TypeScript and shell lint, both typechecks, the package build, and the complete 707-file
  matrix pass; 706 files and 9,264 tests pass, with one file and test skipped. Full hosted run `30726533288` then
  passed setup/build, unit, integration, all three E2E shards, portability, lint/typecheck, `ci-ok`, and `merge-ok`
  against exact head `9a1f43a51` and unchanged base `827c5bc89`.
- **S12 reconciliation seam:** S10R reads locus state independently because current `main` has no shared session
  slot. When S12 absorbs this branch, fold that read into S12's cached shared locus-state projection rather than
  retaining two probes.
- **Landing:** PR #425 merged accepted head `9a1f43a51` into `main` as `4cde8b575`; the authorized admin merge
  bypassed only the sliced path's unavailable approval/`arc-cleared` context. The merge tree is identical to the
  reviewed head, and repository settings removed the remote topic branch after landing.
- **Next:** Construct and land S11R from `main` `4cde8b575` before reconciling the preserved S12 candidate.

#### S11R integration recovery cursor repair — landed

- **Trigger:** A live Integrating work unit on `main` `0b0e64ee8` produced a recovery envelope that failed its own
  schema. Its retained task-list pointer derived `taskCursor: { status: "no-open-task" }`, while its integration
  load set correctly omitted the task list; the envelope presence invariant then forbade the cursor because it keyed
  solely on a `partial-strategic` load-set entry.
- **Confirmed ownership:** Commit `366ae0da7` introduced the S11 producer, recovery schema, and auditor composition.
  The producer, integration load-set projection, schema, and auditor each behave as reported in the S11 landing on
  current `main`; this is a recovery-slice correction, not S10R or S12 scope.
- **Model boundary:** An integration frame with a safe retained task-list pointer must emit its fresh cursor result
  even though integration does not load the task list. `no-open-task` is the evidence that makes cursorless
  integration recovery valid. An integration frame with no task-list pointer remains unprovable and must retain the
  auditor's existing `task-cursor-unresolved` stop.
- **Correction boundary:** Replace the recover-envelope presence rule's load-set proxy with the resolved recovery
  frame plus safe task-list authority. Add real Integrating-meta coverage with a retained terminal task list and
  retain the no-pointer auditor regression; do not add the task list to the integration load set.
- **Isolation:** Cut `fix/integration-recovery-cursor` from `main` `4cde8b575`, carry no
  `.arc/active/**` paths, run the complete gates, and publish it as its own reviewed corrective PR. The unpublished
  S12 construction remains unchanged until S11R lands, then absorbs both repairs in one append-only base merge.
- **Construction:** Commit `c90b6c852` keeps strategic task-list cursors required, permits cursor evidence on a
  resolved integration frame independently of load-set membership, and leaves cursor absence schema-valid so the
  recovery auditor retains authority over the unprovable case.
- **Verification design:** A real built-CLI worktree enters `Integrating` with a retained terminal task list,
  establishes its durable WU role through applied reconcile, and proves recovery emits `no-open-task` while the
  load set contains only the integration workflow. The pre-fix run failed with the exact
  `session-envelope.invalid` presence refusal. Unit coverage locks both optional integration evidence and the
  existing missing/failed-cursor audit stops.
- **Exact measurement:** 75 additions plus 5 deletions (80 changed lines) across three files against `4cde8b575`.
  The target contains no `.arc/active/**` path.
- **Gate evidence:** TypeScript and shell lint, both typechecks, package build, focused schema/auditor coverage, and
  the built-CLI regression pass. The complete 707-file matrix passes with 706 files and 9,265 tests green and one
  file and test skipped; an unrelated five-second config-validation timeout passed in isolation before the
  unchanged full-matrix rerun passed.
- **Publication:** PR #428 targeted `main` `4cde8b575` from exact head `c90b6c852`; `ci-defer-heavy` remained
  attached through the hosted-review cycle and was removed before the full matrix ran.
- **Hosted review:** Hosted Codex reviewed the complete exact target at `c90b6c852`. Its sole thread proposed
  widening the bounded pre-model Errand compatibility arm to integration parents; the shipped rollout contract
  covers only planning and execution parents, no retained legacy identities remain, and the pre-public-release
  posture rejects adding an unreachable compatibility path. The disposition was recorded on the thread and all
  review threads resolved without changing the head.
- **Landing:** Full hosted CI run 30728592037 passed at the accepted head, including `ci-ok` and `merge-ok`. PR #428
  merged `c90b6c852` into unchanged base `4cde8b575` as `9b2d0b10c`; the authorized admin merge bypassed only the
  sliced path's unavailable `arc-cleared` context. The merge tree is byte-identical to the reviewed head, and
  repository settings removed the remote topic branch after landing.
- **Next:** S9AR2 preempts S12. Land the terminal Errand-close repair from current `main`; only then reconcile the
  published S12 branch with the resulting base and rerun its complete gates.

#### S9AR2 terminal Errand-close finalization repair — landed

- **Incident:** After PR #431 merged, closing its ordinary Errand from the primary checkout deleted the currently
  checked-out Errand branch. `HEAD` remained symbolically attached to the deleted ref, Git interpreted the populated
  index as an unborn branch, and the close left its live locus generation behind after retiring the subject identity.
  Recovery consequently classified the retained generation as `subject-unresolved` until it was explicitly removed.
- **Confirmed ownership:** `close-occupancy.ts` classifies the occupied caller as `current-checkout`, while
  `close-runtime.ts` gives only `base-checkout` a teardown guard and deletes the exact branch ref without checking
  current-checkout occupancy. `close-locus.ts` then retires the capture and identity without a checkout restoration
  or exact role-pop stage. Both symptoms are one missing terminal-settlement boundary in the S9A/S9AR close path.
- **Correction boundary:** Under exact caller-owned locus authority, revalidate the role and lease, require a clean
  checkout, restore a primary checkout to its configured base or remove a spawned checkout, and pop the exact role
  before ref, capture, or identity retirement. Base-context close of self-held residue must also pop it. Any checkout
  or role-settlement failure retains the identity and reports recoverable state; foreign or unprovable occupancy
  remains refused. No legacy compatibility path is required before public release.
- **Verification design:** A real built-CLI regression closes a merged ordinary Errand from its occupied primary
  checkout and proves the symbolic ref names `main`, `HEAD` is valid, the index is clean, the exact locus is gone,
  recovery has no `subject-unresolved` residue, and a fresh Errand can open. Focused unit coverage retains the
  failure-ordering and foreign-occupancy boundaries.
- **Isolation:** Cut `fix/errand-close-finalization` from current `main` `9985aa6c7`, carry no `.arc/active/**`
  paths, run the complete gates, and publish one focused hosted-review PR. S12 remains blocked at reviewed head
  `90ed814e4` until S9AR2 lands, then absorbs the repair through an append-only base merge.
- **Construction:** Branch `fix/errand-close-finalization` and worktree
  `arc-framework.session-locus-model-s9ar2` are provisioned at exact `origin/main` `9985aa6c7`. The checkout is
  clean, its built CLI and workspace bin are available, and its target diff contains no `.arc/active/**` path.
- **Implementation:** Terminal settlement now runs before any ref, capture, or identity retirement. It revalidates
  the exact caller-owned role and lease under the record lock, restores a clean primary to `main` or removes the
  exact provenance-bound spawned worktree, pops the role, and carries the surviving session-home coordinates into
  the result. Stdin-fed Git gained an explicit working-directory boundary so retirement still runs after the CLI's
  original spawned checkout disappears.
- **Verification:** The primary regression failed first with `HEAD` still on the deleted Errand branch. The spawned
  regression then exposed the deleted-CWD process failure before the explicit Git working-directory correction.
  Real built-CLI coverage now passes for primary restoration, spawned teardown, dirty-checkout retention, base-context
  residue cleanup, and subsequent Errand allocation. Focused unit and integration suites pass, and the complete gate
  rerun passed 9,305 tests with one intentional skip; an unrelated config-validation timeout passed alone and did not
  recur on the mandatory full rerun.
- **Publication:** PR #432 opened against exact base `9985aa6c7` from implementation head `cc0e63a8d`. Its
  eleven-file target measured 789 additions plus 172 deletions, contained no `.arc/active/**` path, and retained
  `ci-defer-heavy` through review.
- **Hosted review:** CodeRabbit and hosted Codex exercised the complete target through a bounded repair cycle. The
  final accepted correction publishes a fully written and synced checkout-lock receipt atomically, so failed
  persistence and failed temporary cleanup cannot leave a malformed blocking `HEAD.lock`. The repository-global
  race with an uncoordinated raw `git worktree add` remained outside the slice's explicitly recorded registered-
  occupancy guarantee. Every thread received its exact disposition and was resolved at final head `e1c6cac67`.
- **Final verification:** The exact repair tree passed TypeScript lint, both typechecks, the package build, focused
  unit and integration coverage, `git diff --check`, and the complete matrix: 712 files and 9,327 tests passed, with
  one intentional file and test skip. Full hosted CI run 30774157973 then passed lint and typecheck, unit,
  integration, all three E2E shards, portability, `ci-ok`, and `merge-ok` after `ci-defer-heavy` was removed.
- **Landing:** PR #432 merged accepted head `e1c6cac67` into `main` as `d9ca2fba2`. The authorized admin merge
  bypassed only the sliced path's unavailable `arc-cleared` context.
- **Next:** Reconcile published S12 PR #429 from reviewed head `90ed814e4` with current `main` `d9ca2fba2`, rerun the
  complete local and hosted gates, inspect the append-only seam, and make a new exact-head review-scope decision.

#### S12 session wiring and locus surface — landed

- **Entry base:** `origin/main` `0b0e64ee8`, the S11 merge. Branch `feat/session-locus-wiring` is an unpublished
  sibling-worktree construction; the managed checkout and all planning artifacts remain on the control branch.
- **Construction boundary:** Port only the donor's session-init, handoff, compaction, and public locus-command seams.
  Preserve current-main terminal and transient-lifecycle behavior unless S12's owned public dispatch requires the
  seam. The target excludes `.arc/active/**`.
- **Live correction:** Errand `stale-roadmap-remedy-build` merged through PR #420 and retired its identity, branch,
  and capture while leaving primary locus generation `aa0fd1be…` as designed. Its original Codex process later
  exited, making lease `ea65d940…` conclusively dead; the exact generation-checked, lock-held runtime release removed
  only that record. The independent `session-locus-model` record retained byte hash `786e7a77…`, and the post-state
  read `primaryAvailability: free`, `recovery: none`, and `reconciliation: clean` on an otherwise clean `main`.
- **Confirmed residue exit:** Task `7.P.l.i` carries the attestation through exact subject dispatch and revalidates
  the selected record, role, and lease generation under the record lock. A confirmed self-held live or unverifiable
  generation is removed in one atomic record mutation; conclusive deadness retains the existing pop path, and a
  foreign live lease remains unconditionally blocked. Real CLI coverage reproduces identity-first primary cleanup,
  proves the unverifiable and dead paths, and preserves an unrelated locus record byte-for-byte.
- **Typed JSON boundary:** Task `7.P.l.ii` places the complete locus-mutation and Errand setup paths under their
  typed result emitters. Null prerequisites return declared errors, setup exceptions become one error result, and
  configuration plus user-surface regressions prove exactly one stdout envelope with a non-zero exit.
- **Human output boundary:** Row-local diagnostics render inside their own human roster blocks. Raw mutation success
  and refusal text terminate with exactly one newline without changing the compact JSON transport.
- **Construction reconciliation:** Generated session-envelope fixtures now carry the required locus state, guidance,
  identity inventory, and recovery absence proof. Shared slot inventories match the additive surface. Portable user
  notes exclude every descendant of a dot-directory, and the primary-Errand E2E binds cleanup to the exact record ID
  returned by open instead of filesystem enumeration across an unrelated record.
- **Base reconciliation:** The unpublished construction was first closed into four append-only atomic commits, then
  merged current `main` `9b2d0b10c` as the second parent of `9ebcecb6d`. Generated active-resume and branch-gone
  fixtures preserve both S10R's pending work-unit reconciliation guidance and S12's locus state/guidance. S10R's
  current-work-unit probe now consumes S12's memoized locus-state projection instead of performing a second read.
- **Exact reconciled measurement:** 4,000 additions plus 64 deletions (4,064 changed lines) across 49 files against
  `9b2d0b10c`. Exact candidate `9ebcecb6d` has tree `86e56af78` and contains no `.arc/active/**` path.
- **Gate evidence:** Markdown lint, all three ARC contract checks, TypeScript and shell lint, both typechecks, the
  package build, and the complete 716-file matrix pass. The matrix reports 715 files and 9,355 tests green, with one
  file and test skipped. Its only initial failure exposed an E2E race that snapshotted a newly minted locus record
  before the holder attached its lease; the corrected test waits for the leased generation, passes in isolation,
  and the unchanged product refusal remains `lease-live`. The full matrix and pre-commit checks pass on the corrected
  exact tree.
- **Publication:** PR #429 targets unchanged `main` `9b2d0b10c` from exact head `9ebcecb6d`.
  `ci-defer-heavy` was attached before the review cycle began.
- **Hosted review:** Hosted Codex reviewed the complete exact target at `9ebcecb6d` and opened three actionable
  threads. The repair keeps partial Errands distinct at dispatch and fails closed for subject drivers that are not
  yet shipped, rejects attested unknown-lease resume before its dead-only runtime, and makes `locusGuidance`
  required in both strict session-envelope schemas. Resolver authority fixes landed as `9ffc1f7e`; schema parity
  landed as `90ed814e4`.
- **Repair verification:** Four focused suites pass all 151 tests. TypeScript lint, both typechecks, the package
  build, the complete test matrix, and `git diff --check` pass on the repair tree; the matrix reports 715 files and
  9,363 tests green with one file and test skipped. Both atomic repair commits also passed the repository's complete
  pre-commit checks.
- **Corrected publication:** Exact head `90ed814e4` contains 4,099 additions plus 64 deletions (4,163 changed lines)
  across 51 files against unchanged base `9b2d0b10c`, with no `.arc/active/**` path. All three review threads have
  exact-head replies and are resolved. Final-thread resolution removed `ci-defer-heavy` through the label workflow:
  the deferred attempt canceled or skipped its heavy legs, then the full exact-head run passed lint and typecheck,
  unit, integration, all three E2E shards, portability, `ci-ok`, and `merge-ok`.
- **Clearance correction:** The failing `planning-clearance` job was not a sliced-delivery exception. Trusted
  default-branch code built `dist/cli.js` only after dependency installation had omitted the workspace `arc` bin,
  so `npx arc review planning-lane` failed before classification and left `arc-cleared` pending. Errand
  `planning-clearance-trusted-cli` repaired that global producer through PR #431, merged on `main` as `9985aa6c7`.
  Only the pending `arc-cleared` result after a successful `reviewed` classification remains the expected sliced
  path exception.
- **Post-S9AR2 reconciliation:** Current `main` `d9ca2fba2` merged append-only as `bb657dc34` without conflicts or
  manual resolution. `range-diff` preserves all eight S12 commits byte-for-byte, the remerge view is empty, the
  target still carries no `.arc/active/**` path, and the only target-level hygiene correction removes seventeen
  extra terminal blank lines across ten S12 source and test files as `0e06d0d68`.
- **Reconciled measurement and gates:** Exact head `0e06d0d68` contains 4,082 additions plus 64 deletions across 51
  files against current `main`. Markdown lint, all three ARC contract checks, TypeScript and shell lint, both
  typechecks, the package build, target-level `git diff --check`, and the complete matrix pass. The matrix reports
  721 files and 9,425 tests green, with one file and test skipped.
- **Reconciled publication:** PR #429 now targets `main` from `0e06d0d68`; `ci-defer-heavy` remains attached. The
  conflict-free merge, identical eight-commit range, and mechanical EOF cleanup make incremental hosted Codex
  review proportionate. The exact-head `@codex review` invocation is published.
- **Incremental review:** Hosted Codex reviewed exact head `0e06d0d68` and opened four threads. The two packaged
  workflow-consumer findings are confirmed remaining work explicitly owned by S13's documented-surface
  reconciliation and are resolved as deferred, not rejected. The two S12 findings are accepted: identity-backed
  abandonment must honor the driver-bounded no-live-session confirmation, and linked sessions must not project
  retained branched cleanup candidates.
- **Review repair:** Commit `70af2e304` applies the bounded confirmation to exact self-held and unverifiable Errand
  leases, retains foreign-live refusal, and permits a clean primary already returned to base. Its real-CLI
  regression proves the identity-backed self-held exit. Commit `9b67abd22` keeps retained-role branched projection
  primary-only while preserving linked detached-husk scanning. All four review threads carry their disposition and
  are resolved.
- **Corrected measurement and gates:** Exact head `9b67abd22` contains 4,156 additions plus 70 deletions across 51
  files against current `main`. TypeScript and shell lint, both typechecks, the package build, `git diff --check`,
  and the complete matrix pass. The matrix reports 721 files and 9,427 tests green, with one file and test skipped.
- **Final hosted review:** Hosted Codex reviewed exact head `9b67abd22` and opened two threads. The attachment finding
  is accepted: the reader-selected dead lease verdict must remain bound to its selected generation after the record
  lock is acquired. The extension finding is rejected: extension bodies are deliberately excluded from session load
  sets, active names remain in the envelope's separate extension slot, and the manifest resolver does not consume
  its inert `activeExtensions` input.
- **Final review repair:** Commit `69229c724` passes the reader-selected lease ID beside its liveness verdict, so a
  locked record that advanced to another generation refuses with `lease-generation-mismatch` rather than replacing
  a new live lease from stale evidence. Both final-review threads carry their disposition and are resolved.
- **Final repair verification:** Exact head `69229c724` remains 4,156 additions plus 70 deletions across 51 files
  against current `main`, with no `.arc/active/**` path. The focused mutation suite passes all 24 tests, the real-CLI
  locus-mutation suite passes all 10 tests, TypeScript and shell lint, both typechecks, the package build, and
  `git diff --check` pass, and the complete matrix reports 721 files and 9,427 tests green with one file and test
  skipped. Hosted light CI passes planning clearance, setup and build, lint and typecheck, and unit tests on the
  same exact head. Heavy jobs are skipped and `ci-ok` plus `merge-ok` fail as expected while `ci-defer-heavy`
  remains attached.
- **Full hosted CI:** After the light checks settled, `ci-defer-heavy` was removed and run `30778230795` passed
  setup and build, lint and typecheck, unit, integration, all three E2E shards, Linux concurrency portability,
  `ci-ok`, and `merge-ok` on exact head `69229c724`. The only remaining required-context block was the expected
  sliced-delivery `arc-cleared` pending state; the broken ARC review architecture was not invoked.
- **Merge:** PR #429 merged to `main` by authorized admin merge as `40e640faa`. The merge commit tree
  `7d63151d2` is byte-identical to reviewed head `69229c724`, and the PR base remained `d9ca2fba2` throughout the
  final review, CI, and merge sequence.
- **Next:** Construct S13 from merged `main` `40e640faa`, exclude `.arc/active/**`, and deliver the documented
  surface reconciliation through the same local-gate, hosted-review, repair, full-CI, and authorized-merge cycle.

#### S13 documented surface reconciliation — construction complete

- **Entry base:** `origin/main` `40e640faa`, the S12 merge. Branch `feat/locus-surface-reconciliation` was cut in a
  sibling worktree while the managed checkout and all four active planning artifacts remained on the control branch.
- **Methodology reconciliation:** Commit `498446273` reconciles advisory entry, leaseless work-unit selection,
  changed-head re-entry, verb-scoped lease claims, typed probe failure, and exact Errand ownership across the
  package source and self-hosted reference, workflow, and skill surfaces.
- **Errand surface reconciliation:** Commit `97fd0f5eb` aligns the Quick Reference and `arc-errand` entry skill with
  the shipped open/link/close/abandon/promote command family. Live command-surface tests and an explicit fresh-init
  assertion prove the signature and installation path; production installation already included `arc-errand`.
- **Harness-local skill projection:** `.codex/skills/arc-errand` and `.claude/skills/arc-errand` are symlinks to the
  self-hosted canonical skill. Their link templates are owned by the chezmoi-managed `dotfiles-ai` repository, so
  S13 changes canonical content only and requires no duplicate local skill edit.
- **Decomposition handoff:** The final construction increment restores planned `errand-transient-lifecycle` and
  `claimed-sweep-verbs` successors, preserves the later mainline `locus-generation-binding` provisional commitment,
  consolidates its original exact-generation scope with reconcile-driver reachability, binds it to
  `claimed-sweep-verbs`, and regenerates `ROADMAP` from the staged project state.
- **Exact target:** Head `5eef7ba8f` is 43 files, 1,606 additions, and 1,133 deletions against unchanged
  `origin/main` `40e640faa`. It contains no `.arc/active/**` path and remains below the slice-size ceiling.
- **Exact-head gates:** Markdown lint, all three ARC contract checks, TypeScript and shell lint, both typechecks,
  build, `git diff --check`, exact ROADMAP regeneration, and structured status for both planned successors plus the
  provisional dependent pass. The complete matrix reports 723 files and 9,436 tests passed, with one intentional
  file and test skip.
- **Publication:** PR #433 targets `main` `40e640faa` from exact head `5eef7ba8f`.
  `ci-defer-heavy` was attached before hosted review; its superseding light run owns the review-cycle check signal.
- **Initial hosted review:** Hosted Codex reviewed exact head `5eef7ba8f` and opened two actionable threads. One
  identified execute-bound queue fields that session-init consumed without any live probe producer; the other found
  that the locus-guidance rewrite removed the still-emitted current-husk, stale-worktree, and orphan-branch cleanup
  surfaces without replacing them.
- **Review repair:** Commit `98777aa5e` removes the premature queue contract from both workflow copies, restores the
  typed cleanup branches and detached-HEAD guard, and adds mirrored package/project regression coverage. Both hosted
  threads carry exact dispositions and are resolved. The repaired target is 43 files, 1,595 additions, and 983
  deletions against unchanged base `40e640faa`; `ci-defer-heavy` remains attached.
- **Review-repair gates:** Markdown lint, all three ARC contract checks, TypeScript and shell lint, both typechecks,
  build, `git diff --check`, and the complete matrix pass at `98777aa5e`: 723 files and 9,437 tests passed, with one
  intentional file and test skip.
- **Incremental hosted review:** Hosted Codex reviewed exact head `98777aa5e` and opened two actionable threads. The
  probe-envelope companion still promised unproduced execute-bound fields and misstated the routable-count contract;
  the returned sibling-Errand offer did not bind its title back to the inbox capture or derive a branch-safe slug.
- **Final review repair:** Commit `cae74d0c7` removes the stale queue contract from both probe-envelope copies,
  specifies the exact `arc errand open <slug> --from-inbox <nextOffer.key> --json` continuation, and extends the
  mirrored regressions to pin both corrections. All four hosted-review threads carry exact dispositions and are
  resolved. The repaired target is 43 files, 1,623 additions, and 983 deletions against unchanged base `40e640faa`;
  `ci-defer-heavy` remains attached.
- **Final repair verification:** Markdown lint, all three ARC contract checks, TypeScript and shell lint, both
  typechecks, build, `git diff --check`, and the complete matrix pass at `cae74d0c7`: 723 files and 9,438 tests
  passed, with one intentional file and test skip. The final repair is a narrow documentation-contract correction
  with mirrored fail-first coverage and no runtime change, so another hosted review is not warranted.
- **Full hosted CI:** After `ci-defer-heavy` was removed, run `30814602226` passed setup and build, lint and
  typecheck, unit, integration, all three E2E shards, Linux concurrency portability, `ci-ok`, and `merge-ok` on
  exact head `cae74d0c7`. The PR remains based on `40e640faa`, and the only pending context is the expected
  sliced-delivery `arc-cleared` check.
- **Merge:** PR #433 merged by authorized admin merge as `2bd5b01b0`, bypassing only the sliced-delivery
  `arc-cleared` gap. Its parents are exact base `40e640faa` and accepted head `cae74d0c7`; the merge tree is
  byte-identical to the reviewed head.
- **Next:** Construct the bespoke closeout from merged `main` `2bd5b01b0` without reintroducing any
  `.arc/active/**` path.

### Resume protocol

Every fresh session or long-pause resume follows the same read-only reconciliation before editing:

1. Read the ledger and the current slice's evidence entry.
2. Fetch `origin`; inspect the control branch, `origin/main`, and the one live slice worktree; then resolve the named
   PR's live base, head, state, checks, and review status.
3. Treat Git/GitHub as authority when prose lags. Stop on an unexplained head, target, or merge mismatch.
4. Reconcile stale ledger facts on the control branch; never change a clean reviewed delivery head only for status.
5. Continue from exactly one state: manifest preparation, construction, local gates, hosted review, finding repair,
   merge-ready, or landed reconciliation.

### The control branch owns planning artifacts from S4 onward

S0 put the four session-locus planning artifacts on `main`, and S1–S3 carried their updates. That made unrelated
work-unit reconciles see this work unit as another active occupant. The remaining delivery must remove that
interference without fragmenting the work unit's identity or handoff history.

After S3 lands, cut and push `feat/session-locus-delivery-control` from its accepted head before removing anything.
The managed checkout stays on that branch through every remaining deliverable and bespoke closeout. It retains the
only tracked `meta-*`, `spec-*`, `tasks-*`, and `notes-*` set; status, finding dispositions, measurements, and
handoffs update there. Each delivery branch is a sibling-worktree projection cut from current `main`, not another
work-unit locus. The control session owns judgment and approval gates while the projection branch owns only its
reviewable payload.

R0 is the retrofit bridge: its PR deletes exactly the four session-locus paths already present under
`.arc/active/` and adds or modifies no other path. Every implementation deliverable after R0 must produce no
`.arc/active/**` diff at all. Check that path-set invariant before every publication; a donor copy or status update
that reintroduces one is a hard stop. R0 lands before S4 is cut, so the deletion and the new exclusion discipline
become one uninterrupted base transition.

After S13 lands, create a small DTI-style closeout PR from `main`: copy the final control artifacts directly into
their `.arc/completed/**` destination, render `ROADMAP`, and retire the control branch. Never re-add the files to
`.arc/active/` on `main`; this preserves one meta history, one archive, and one continuous handoff anchor.

### Slice-size gate

The table in § Proportionate delivery cut proves source and directly attributed tests but estimates distributed
wiring, cross-cutting tests, and documentation. Before publishing each slice:

1. Build an exact owned-path and owned-hunk manifest from `archive/session-locus-model-donor-fa3c10f0e`.
2. Include the slice's remaining `7.P` implementation corrections and every test/documentation adjustment required
   for that stop to tell the truth.
3. Measure the final pull-request diff against current `main` as additions plus deletions.
4. Target roughly 5,000 changed lines. Above approximately 5,500, stop and either split at a coherent internal
   boundary or record an explicit exception explaining why a smaller independently useful stop does not exist.

R0's deletion-only target is 5,083 changed lines. Splitting it from S4 keeps both sides beneath the approximate
5,500-line ceiling. S9A's exact 5,397-line preliminary construction replaces the original S9 estimate and leaves
promotion to S9B; its remaining v3 close proof therefore stays under immediate size scrutiny. The cut topology is
reusable; its size promise is not accepted from estimates alone.

### Per-slice runbook

1. **Reconcile entry.** Require the predecessor landed, fetch current `main`, reconcile the preceding ledger row on
   the control branch, and confirm no other delivery slice is live. Scratch preparation may precede this step;
   canonical construction may not. After S3, land R0 under its recorded checks-only posture before entering S4.
2. **Cut the canonical branch.** Create the named delivery branch and sibling worktree from current `main`; keep the
   managed work-unit checkout on the control branch. Every implementation deliverable after R0 inherits its
   active-artifact deletion and must not add those paths back.
3. **Construct one coherent stop.** Port only the slice manifest from the donor, apply its remaining `7.P`
   corrections, and reconcile shared tests, command inventories, package/project copies, and documentation against
   the surface that actually exists at this stop.
4. **Measure and gate.** Enforce the `.arc/active/**` path-set rule, apply the size gate, then run the complete
   project gate set against the cumulative tree. A prior donor or predecessor green never transfers across a new
   base or new slice.
5. **Publish one PR to `main`.** Push append-only, open the pull request directly against `main`, record its exact
   base/head and gate evidence, and wait for required CI plus `merge-ok`.
6. **Run hosted review for every implementation slice.** S0 skips this step because it is the planning baseline.
   CodeRabbit is primary; hosted Codex is the fallback when CodeRabbit is unavailable, partial, ambiguous, or
   cannot establish whole-target coverage. The initial request occurs only after the exact target is ready.
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
9. **Verify and advance.** Fetch `main`, verify the PR's merge commit and expected tree landed, update the control
   ledger and handoff state, delete or retain the slice branch per the recorded cleanup decision, then cut only its
   immediate successor.

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

The live ledger is reconciled through S13. Every S0-S13 and repair row names the merged PR and exact `main` merge
commit; current `origin/main` is S13 merge `2bd5b01b0`. Successor review carried each predecessor seam, and no
delivery branch after R0 reintroduced `.arc/active/**`. The only remaining delivery is a small bespoke closeout. Do
not invoke `integrate-work-unit` or ARC's broken review architecture for it.

#### Closeout delivery — construction

- **Entry base:** `origin/main` `2bd5b01b0`, the verified S13 merge. Branch
  `chore/session-locus-model-closeout` was cut in a sibling worktree.
- **Archive source:** The four control artifacts were copied directly from control tip `b513acc03` into
  `.arc/completed/2026-q3/43_session-locus-model/`; no `.arc/active/**` path is present in the closeout target.
- **Terminal composition:** The archived meta is shipped with no branch, workflow, task, or next action; the task
  list closes verification and explicitly defers only the four success criteria owned by the carved producer work.
- **Exact construction measurement:** 6,298 additions across four documentation artifacts. This exceeds the
  implementation-slice ceiling only because the closeout is the indivisible archival projection of the already
  reviewed planning record; splitting it would publish an incomplete completed work-unit identity.
- **Project projection:** Staged `ROADMAP` regeneration is byte-identical. `errand-transient-lifecycle` and
  `claimed-sweep-verbs` resolve as planned in dependency order, and `locus-generation-binding` resolves as
  provisional behind `claimed-sweep-verbs`; their predecessor remains intentionally unlanded until the closeout PR
  URL completes the shipped meta.
- **Publication:** [pending]
- **Review posture:** The closeout is a pure archival projection with no runtime, methodology, or active-work
  change. It needs neither `ci-defer-heavy` nor hosted review; applicable GitHub-hosted documentation checks remain
  required.
- **Next:** Publish the closeout PR, record its URL in the archived meta, and require the applicable hosted checks.

#### S13 publication checklist

1. Finish Task `7.P.m.iv` on the control branch and commit the final S13 backlog handoff on
   `feat/locus-surface-reconciliation`. Confirm the staged ROADMAP is byte-identical to
   `npx arc status --project --staged --no-fetch`, the target remains below the slice-size ceiling, and its path set
   contains no `.arc/active/**` entry.
2. Fetch immediately before publication. If `origin/main` moved beyond `40e640faa`, merge it append-only into S13,
   resolve only owned seams, regenerate ROADMAP, and repeat all exact-head evidence. Never rebase the published
   stack or carry a stale review across base drift.
3. On the final committed head, run Markdown lint, all three ARC contract checks, TypeScript and shell lint, both
   typechecks, build, the complete Vitest matrix, and `git diff --check`. Record the exact head and measurement here.
4. Push the S13 branch and open one pull request directly to `main`. Attach `ci-defer-heavy` before review begins;
   keep it attached through the complete review and repair cycle. The PR body should describe the delivered surface
   without a redundant validation-command inventory or reviewer commentary.
5. Request one whole-target hosted Codex review with the invocation alone. CodeRabbit remains out of rotation while
   rate-limited. Verify every finding against source, present the complete disposition set for approval, apply only
   approved fixes, reply to and resolve exact threads, and choose incremental versus whole-target follow-up from the
   actual change scope. An approval caused only by thread resolution is not evidence that fixes were reviewed.
6. Re-run every gate reached by a review fix. When hosted review is settled at the exact head, remove
   `ci-defer-heavy` and require the full GitHub-hosted matrix, `ci-ok`, and `merge-ok` to pass. Leave
   `arc-cleared` pending; the sliced path cannot produce it and must not call ARC review commands to fabricate it.
7. Present the exact PR head, base, hosted-review result, and required-check state. Only explicit integration
   authorization permits `gh pr merge --admin --merge`; admin bypasses the known `arc-cleared` gap and nothing else.
8. Fetch the merge, verify the accepted head tree is the first parent-independent payload of the recorded merge
   commit, and update the S13 ledger row before constructing closeout. No successor WU starts before this landing.

#### Bespoke closeout checklist

1. From freshly fetched post-S13 `main`, create one short-lived closeout branch and sibling worktree. Determine the
   next `completed/2026-q3/` ordinal from that live base at construction time; do not reserve an ordinal in advance.
2. Copy the final `meta-session-locus-model.md`, `spec-session-locus-model.md`,
   `tasks-session-locus-model.md`, and `notes-session-locus-model.md` bytes from the control tip directly into
   `completed/2026-q3/{next}_session-locus-model/`. Never stage them under `.arc/active/**` on `main`.
3. Compose the terminal archive state in that destination: `State: Shipped`, no branch or open workflow/task,
   exact S13 and closeout PR facts, completion date, release-notes entry, and completion notes. Preserve the delivery
   ledger and runbook as the durable record of the exceptional stack-to-main topology.
4. Regenerate ROADMAP from the closeout index and prove `session-locus-model` is absent from active/planned state,
   both successor WUs resolve as planned in dependency order, and `locus-generation-binding` remains provisional
   behind `claimed-sweep-verbs`.
5. Run the Markdown and ARC checks appropriate to the documentation-only closeout, staged Markdown lint,
   `git diff --check`, and any validator that guards completed-artifact shape. Push and open the closeout PR without
   `ci-defer-heavy`; once its URL exists, record it in the archived meta.
6. Skip hosted review because the closeout only archives already-reviewed planning artifacts and changes no
   executable or methodology surface. Require the applicable GitHub-hosted checks. Merge only after separate,
   explicit authorization; use admin only if the unavailable `arc-cleared` context is the sole remaining block.
7. Fetch and verify the closeout merge before cleanup. Then remove the managed control checkout, delivery branches,
   and scratch `session-locus-model-d1-carve` worktree through safe, scope-checked operations. Preserve
   `archive/session-locus-model-donor-fa3c10f0e` until the two successor WUs have reconstructed their inherited paths;
   it is their recorded evidence source, not disposable delivery residue.

No earlier approval grants prospective authority for the S13 merge or the closeout merge.
