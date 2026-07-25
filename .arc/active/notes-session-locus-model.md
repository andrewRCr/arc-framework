# Notes: session-locus-model

## Contents

- [Codebase pointers](#codebase-pointers)
- [Dogfood evidence trail](#dogfood-evidence-trail)
- [Adjacent work and shipped substrate](#adjacent-work-and-shipped-substrate)
- [Expected base-merge reconciles](#expected-base-merge-reconciles)
- [Right-sizing audit (2026-07-22)](#right-sizing-audit-2026-07-22)
- [Chunked-review finding triage (2026-07-24)](#chunked-review-finding-triage-2026-07-24)
- [Decomposition into a delivery stack (2026-07-25)](#decomposition-into-a-delivery-stack-2026-07-25)

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

- **D1 — `session-locus-model`** (~9–11k source): all of `lib/locus`, the v3 identity core
  (`identity-*`, `change-request-lifecycle`, `exact-branch-generation`, `locked-generation`), the base Errand verbs
  (`open`, `link`, `close`, `promote`, `check`), `lib/recover`, session-init/handoff/compaction wiring, and the
  `arc locus` reader. Retains the spec's Goals and the six motivating failures.
- **D2 — errand transient lifecycle** (~4–5k): `leave`, `abandon`, `materialize`, `partial-settle`, and the six
  carved generation-capability findings, which ship with the machinery they belong to instead of staying carved.
- **D3 — claimed sweeps** (~1.9k): `lib/housekeep`, `lib/groom`, the `plan` claim protocol, and the housekeep
  sweep verbs.

### Remediation routing

Remaining open work distributes across the stack rather than landing on one head:

- **D1** — `7.E.e.ii`, `.iii`, `.iv`, `.v`, `.vii`; `7.E.f`; the `R1-F1`–`R1-F4` claims of `7.E.h`; `7.G.a`; and
  the `7.E.g` members covering in-place resume, legacy record readability, legacy multi-WU recovery, and install.
- **D2** — the six carved findings; `7.E.h`'s `E4-V1` / `E5-V1` coverage restoration; `7.E.g`'s remote-only legacy
  close path and quick-reference signature.
- **D3** — `7.E.e.vi`'s housekeep and plan open paths; `7.E.g`'s partial-housekeep base binding, groom exact-path
  authorization, and inbox source digest.

`7.E.g` and `7.E.h` are the two undecomposed parents, and they are precisely the ones that span deliverables — the
split forces the decomposition that was owed either way, now against three targets small enough to hold at once.
D1 carries most of the remaining remediation; D2 and D3 come out comparatively light. The split buys review
proportionality, not a fast first merge.

### Lifecycle calls

- **Three work units, not one shipping three PRs.** Nothing in the current model supports stacked delivery
  (`chunked-delivery` owns that, unstarted), and the 1:1 WU/PR assumption would break. D1 and D2 each carry genuine
  open design — `7.G.a` for D1, the generation-capability contract already recorded as spec-worthy for D2. D3 is
  delivery-only and takes a thin spec.
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

- **Test entanglement is the largest unknown.** Housekeep has one named test file (87 lines) and groom none —
  their coverage lives inside shared integration and e2e files. Source carves cleanly; tests will not.
- **D1's `session-init.md` needs rewriting, not reverting** — the signal-leaf spine must route housekeep and
  grooming the pre-model way while retaining locus dispatch.

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
deliverable as a meaningful commit sequence, and retain the origin branch unmerged as the development record.

Worth recording for the routing lesson above: the strategy already says to _"decompose at the planning maturity
gate before the code exists, so the cut stays clean."_ The doctrine existed; nothing fired it.
