# Draft: session-locus-operability-hardening

- **Origin:** [internal] — follows the repository-wide recovery stop of 2026-08-04, whose immediate continuity
  repair is preserved by commit `5c6dd5c74`. Re-founded 2026-08-05 by a system-level proportionality pass over the
  whole session-locus subsystem (history census + consumer trace), which superseded the hardening frame the first
  four passes iterated.
- **Purpose:** Contain locus faults to the loci they belong to, and settle what an ARC session persists — by
  retiring the durable record-and-lease substrate and deriving checkout roles from the state that already carries
  them, rather than by hardening the substrate.
- **State:** Draft — `maturing`, re-founded. The direction, the retention set, the deletion inventory, and every
  sibling boundary are settled; the derivation specification for the four load-bearing behaviors is the open core.
- **Created:** 2026-08-04 · **Re-scoped:** 2026-08-05

---

## Problem / Motivation

**The presenting incidents.** A lease minted against an unverifiable process anchor halted every active session
repository-wide (2026-08-04). A live Errand carrying seven modified files was reported dead by a sandboxed reader
and offered for abandonment to an unrelated session (2026-08-05). Two work units that shipped and parked exactly
per lifecycle had their locus records flip to `subject-unresolved` — reported in the vocabulary of corruption, with
no verb to clear them (2026-08-05). Compaction recovery throws on unrelated checkouts' residue with a message that
names the recovering session's own locus. Four earlier drafting passes treated these as wiring faults in a sound
model and produced a four-deliverable hardening plan.

**The system-level evidence says the faults are structural.** A history census and a consumer trace, both run
2026-08-05 against `main` and recorded in this draft as its evidence base:

- **Scale and rework.** The locus/errand machinery is ~22.0k production lines plus ~22.8k test lines across 167
  files. 58% of all commits to those paths are `fix` type. Inside the `session-locus-model` delivery stack itself
  (21 stacked PRs), fixes outnumbered feats 3:1 while the subsystem was being built. Nineteen off-work-unit fix
  Errands have repaired it; two landed after both owning work units shipped. Errand identity has been re-modeled
  three times. Process-liveness detection was fixed eight times in six days and still produced the 2026-08-04
  outage. Five follow-on work items existed to finish or repair what shipped.
- **The record store caches a derivation the code already performs.** `arc locus attach` with no record present
  re-mints the record from git facts — worktree roster, the per-checkout ownership marker, `meta-{key}.md`, and
  the v3 errand identity ref (`command-runtime.ts:151-338`). Teardown reaches `clear` on the marker path alone
  (`teardown-occupancy.ts:139-155`). In-flight identities, paused heads, and materialize candidates all derive
  from the identity ref, not the record store. A cache of derivable state is precisely what drifts, and the
  observed `subject-unresolved` records are cache-invalidation failures: the meta legitimately moved (ship, park)
  and the cache had no invalidation path.
- **The liveness edifice gates where it should not and is dead where it pretends to be.** `heartbeatAt` is written
  on every attach and read by nothing — its refresh function has zero callers. `establishedAt` decides nothing.
  The `adopt-work-unit` / `adopt-transient` reconciliation arm is unreachable (its only caller passes an empty
  candidate list), so the session-init prose dispatching on it is dead. The reconciliation proofs and authority
  payloads are discarded by their only caller. Five `errandState` fields have zero workflow references. Meanwhile
  the live gates — `lease-live` / `lease-unknown` refusals — are the parts that produced the outage and the
  false-dead offer, and they rest on process anchors that a sandboxed harness cannot evaluate even in principle.
- **The mechanism contradicts the project's own recorded posture.** ADR-025 governs concurrency by "advisory
  conventions plus one hard append-only invariant — doctrine over mechanism," and rejected enforcement tooling for
  attention discipline. `spec-session-locus-model` § Non-Goals states "concurrent duplicate opens sit outside
  ARC's operator scale." The locus substrate is mechanism-over-doctrine built one layer beneath the ADR that
  decided the opposite, guarding the contention scale the spec itself waved off.

**The failure this work must end** is unchanged from the first framing: an unrelated checkout's state must not
stop healthy work; a session must always have an in-model exit; correct lifecycle completion must read as success,
not corruption. What changed is the mechanism: those properties are reached by removing the state that drifts and
the gates that misfire, not by scoping and attributing them.

## The re-founding decision

**Retire the durable record-and-lease substrate. Derive checkout roles at read time from the state that already
carries them. Keep the small set of durable state git genuinely cannot supply.** This supersedes the prior draft's
four-deliverable hardening plan (R/A/B/C), whose containment relation, stop attribution, retired-subject repair,
and fail-toward-`dead` correction were all patches to machinery this decision removes.

Grounds, in ascending order of force:

1. **Proportionality.** The substrate exists to arbitrate contention between a single operator's own cooperative
   sessions — contention the operator schedules personally and the spec scoped out. Two sessions in one checkout
   is operator error of the same class as two editors on one file: worth an advisory at most, never kernel-grade
   mutual exclusion. The census prices what the disproportion cost: repair has been the subsystem's dominant
   activity since it landed.
2. **Failure direction.** The record store fails toward corruption-vocabulary on correct lifecycle events, and the
   liveness gates fail toward `dead` — the verdict that authorizes destruction — exactly when the reader is
   sandboxed. Both failure directions were observed in the field within one day.
3. **Redundancy — the decisive one.** The consumer trace shows the substrate's load-bearing content is a cache:
   work-unit roles re-derive from marker + meta + roster; transient identity, pause state, and materialization
   derive from the identity ref. What remains genuinely non-derivable is small, enumerated below, and none of it
   requires a record store, a lease, or a process anchor.

**Relation to the prior proportionality audit.** The 2026-08-05 audit answered "does each retained mechanism earn
its keep" per mechanism, against the model's own premises, and correctly cut nothing — every mechanism earns its
keep _given the record store exists_. The re-founding changes the premise: the question was never whether the
receipts or inspectors serve the records well, but whether the records should exist. Both results stand; they
answer different questions.

## Design center

### 1. The checkout is the locus

A checkout's role is a **read-time derivation**, computed by the CLI from four sources, none new:

- the git worktree roster (paths, branches, HEADs, primary flag);
- the per-checkout ownership marker (`worktree-marker.json` — spawning identity, `createdFor` subject and claim,
  provenance), written at spawn and dying with the worktree;
- the work-unit meta record present in the checkout (`meta-{key}.md` — owner, branch, state), with the completed
  index consulted so a shipped subject resolves as **retired** rather than unresolved (the one finding of the
  prior draft's Q6 that survives whole, including its failure policy: an unreadable lifecycle scan resolves to
  `unresolved`, never `retired`, since inventing a retirement is the direction that authorizes cleanup);
- the v3 errand identity ref (`refs/arc/user/{identity}/errands` — claims, `open`/`paused`/`awaiting-merge`
  state, `savedHead`, `changeRequest`, origin entries), which remains the sole durable authority for transient
  identity and for parked-versus-abandoned.

**Marker and meta are the oracle; branch is corroboration.** Deriving a role from branch shape is the anti-pattern
`strategy-storage-evolution` Principle 5 names and the pre-locus model's original sin. The marker and the meta
carry explicit identity; the branch confirms consistency and resolves nothing on its own. This constraint is
load-bearing and carries to the conformance surface below.

Containment follows **by construction**: a derivation over the session's own checkout consults no global store, so
a degraded sibling has nothing to stop it with. Discovery (in-flight identities, materializable candidates, stale
sweeps) stays repository-wide and advisory, exactly as the prior draft settled — blocking and offering never
shared a scope, and now only offering reads beyond the current checkout.

### 2. What stays durable — the non-derivable set

The consumer trace found exactly this set genuinely non-derivable, and each piece relocates to state that already
exists:

- **Transient identity and pause state** — the identity ref, unchanged, including its complete-basis version-
  checked transaction. Already the sole authority after the liveness reversal; this work does not touch it.
- **The warm leave/return parent link** — which checkout a transient interrupted. One field, written at open time
  on the state that describes the transient: the spawned worktree's marker, and the identity record for the
  primary-occupancy case. This answers the prior draft's Q7 without a lease: `sessionHomePath` dies with the
  lease, `parentCheckoutPath` was already on the role, and the suspended-parent fact becomes "a transient's
  recorded parent names this checkout" — a derivation, not a frame mutation.
- **Ownership provenance** — the worktree marker, unchanged.
- **Destructive-path guards** — teardown's real protections are git facts plus provenance: clean tree, exact
  head, merged/ancestry proof, marker match, lifecycle-location match. All retained. The staged provisioning
  receipts that make a failed transient open roll back its own artifacts are retained with them.

### 3. No leases, no process liveness

The prior draft's Q1 reversal, carried to its conclusion: **nobody mints a lease** — not transients, not work
units, not attach. The three Q1 grounds (proportionality, failure direction, portability) never distinguished
transients from work units; only the blast radius assessed did, and the census re-priced it. With leases gone:

- Occupancy questions become git-fact questions. The free primary is **clean, on the configured base, carrying no
  transient marker** — all derivable. Contention is handled where it arises (allocation offers spawn when the
  primary is occupied), not by stopping unrelated sessions at init.
- Process anchors, the platform inspectors' verification half, the fail-toward-`dead` mapping, lease CAS, the
  record locks, and the stale-break path all leave with the state they existed to protect. The fail-toward-`dead`
  defect is not fixed; it is deleted.
- Two sessions in one checkout is accepted as operator-scheduled, per ADR-025's posture. If positive liveness is
  ever genuinely wanted, the portable mechanism remains the one ADR-032 records: an advisory file lock held open
  by the session, kernel-released on exit — meaningful across namespaces, no recorded PID. Deliberately not built.

### 4. Ending a claim requires confirmation, not proof

The prior draft's Q4 settlement, generalized into the replacement for every self-held gate: **keeping work alive
proceeds; ending it confirms.** Exits that release, close, abandon, or remove — for any role — route through
operator confirmation scoped to the named subject, because identity proof is exactly what a sandboxed session
cannot supply and the operator can. The confirmation carries information (which subject, what evidence, what will
be destroyed); it is not the always-granted click-through Q1 rejected, because it guards only terminal acts and is
paid once per exit. Concurrency protection for the one durable multi-writer surface stays where it already is: the
identity ref's version-checked transaction refuses a raced write.

### 5. The advisory surfaces inherit the diet

The transition-not-age discriminator and the two doctrinal cuts (context is not advisory; an advisory with no
runnable verb is not an advisory) stand as recorded, and the retirement satisfies most of the locus half
structurally: drift diagnostics that cannot exist need no batching, and the residue-resolution arm leaves with the
residue class. The whole-surface union, register vocabulary, and cadence mechanism remain
`operational-advisory-registers`' subject, with the discriminator contributed forward — that boundary is
unchanged from the prior draft.

## The open core — derivation specified, not assumed

The consumer trace is an existence proof (the adoption path already derives roles), not a specification. The same
instrument discipline that governed the last four passes applies to this direction too: the spec must trace each
consumer, not assert the derivation from the design. Four behaviors carry load and must be specified before this
draft is formalization-ready:

1. **Session-init dispatch.** With no records there is no `current: resolved` attach flow. The probe derives the
   entering checkout's role directly; the envelope's locus slots reshape (fewer, simpler), and the workflow's
   dispatch section shrinks accordingly. What replaces `arc locus attach`, whether anything does, and what the
   roster view (`arc locus`) renders are this behavior's decisions.
2. **Errand close, abandon, promote, settle.** Claim resolution reads the marker (`createdFor.claimId`) joined to
   the identity ref, not a record row. The occupancy-authority classifications these verbs perform must be
   re-derived from those two sources plus checkout facts, with the destructive legs routing through Design
   center 4's confirmation.
3. **Handoff.** The frame (release-work-unit / leave-errand / between-work-units) derives from the checkout the
   session hands off from — meta presence, marker, identity ref — plus the parent link for the warm case. The
   current record-based selection refuses on states the derivation handles; the spec names the mapping.
4. **Compaction recovery.** Recovery reads its own checkout's derivation and nothing else — which dissolves
   `refuseUnresolvedResidue` and the repository-wide scan rather than scoping them. The recovery frame's
   workflow/load-set/task-cursor content already derives from the same sources session-init uses; the spec
   confirms the parent-edge case (recovering mid-transient) against the relocated parent link.

Each behavior's spec section must state its failure policy explicitly, on the Q6 pattern: derivation inputs that
cannot be read degrade toward the non-destructive reading, and no derivation failure anywhere authorizes cleanup.

## Deletion inventory

Removed with the substrate (the spec turns this inventory into an exact file/symbol list):

- the record store (`.internal/loci/`), record locks, stale-break, and the lease CAS mutation layer;
- leases end-to-end: minting, `sessionHomePath`, `selfHeld`, `heartbeatAt` and its caller-less refresh,
  `attachedAt`, anchor recording, and every `lease-*` stop reason and gate;
- process-anchor verification and the fail-toward-`dead` platform mapping (anchor _selection_ retains only the
  consumers that survive it, if any — the spec traces this rather than assuming either way);
- the recovery/residue derivation, the reconciliation derivation, its unreachable adopt arm, and the discarded
  proof/authority payloads;
- the inert `groom` / `housekeep` role and identity vocabulary and `plan-open` / `housekeep-open` mutations
  (their owning unit is killed — see boundaries);
- the unread envelope surface: five `errandState` fields, `heartbeatAt` on roster rows, `establishedAt`, and the
  session-init prose that dispatches on unreachable states;
- `classifyLeaseAuthority`, previously retained as a building block for a design that no longer needs it.

The deletion removes tests along with code — on the order of half the subsystem's ~45k combined lines. That is
coverage of deleted behavior, not lost coverage; the derivation spec brings its own fixtures (below).

Pre-public-release posture applies throughout: records are gitignored machine-local development state — cleared
and regenerated, no aliases, no migration readers; published envelope slots change in place.

## What this costs, named rather than minimized

- **No automatic detection of two sessions in one checkout.** Accepted deliberately: the operator schedules
  sessions, the census shows the detection was never reliable (false-`dead` under sandboxes, false-`live`
  outages), and the advisory file-lock option is recorded if evidence ever demands it.
- **No automatic crash detection for transients.** Unchanged from the Q1 reversal: staleness advisories and the
  identity record's own state carry it.
- **Handoff and recovery are redesigned, not trimmed.** Their record-based frames are load-bearing today; the
  derivation replacing them is real design work and is the readiness gate for this draft.
- **An ordinary session is still not silent when this ships.** The non-locus advisory majority is untouched;
  `operational-advisory-registers` owns it. Unchanged from the prior draft, restated so the re-scope does not
  silently claim it.

## Boundaries with sibling work

- **`claimed-sweep-verbs` — killed.** Its own spec records that neither grooming nor housekeeping traces to any
  motivating failure and that its scope "was never separately scoped or reviewed." It exists to give a single
  operator's grooming and drains claimed mutual exclusion — the same disproportion this re-founding ends, one
  layer up. Grooming and housekeeping continue as workflow conventions; the inert vocabulary it was to redeem is
  in this unit's deletion inventory. Stub retirement executes at a housekeep/planning-closeout with operator
  approval, not from this branch.
- **`locus-generation-binding` — killed.** All five generation gaps are defects in the mutation layer being
  deleted; the driver it would adopt guards actions that stop existing. The identity ref's transaction — the one
  CAS that matters — already exists and is untouched.
- **`recurring-errand-pr-resolution` — unaffected.** PR-lookup topology, no locus dependence.
- **`recovery-hardening` — kept, reduced, re-sequenced after this unit.** Its forcing-function spine is
  orthogonal and stands. Its locus buffer item (recovery surviving authorized locus changes and teardown) largely
  dissolves here — behavior 4 removes the residue guard and the record-based frame it fought. It should not
  harden against machinery this unit deletes.
- **`operational-advisory-registers` — unchanged.** Owns the union, vocabulary, and cadence; receives the
  discriminator. The advisory census correction the prior draft owed transfers to it with the same content.
- **`staleness-guard-policy` — unchanged.** Owns stale-command mutation policy; session identity stays out of its
  spec. The typed `schemaVersion` seam the prior draft designed for reader-skew detection is moot with the record
  store gone.

## Forward-compat check

Run 2026-08-05 against both firing check-docs; both compose, two findings recorded:

- **`strategy-storage-evolution`:** the record store was machine-local gitignored state outside the backing-store
  model, so its removal forecloses no tier; the surviving durable surfaces (identity ref, markers, metas) are the
  blessed ones, and the one multi-writer surface is already version-checked (Principle 3). The live constraint is
  **Principle 5** — role derivation must key on marker + meta, never branch shape — stated in Design center 1 and
  carried to the conformance surface.
- **`strategy-procedure-evolution`:** derivation is CLI-side; workflows keep dispatching on precomputed slots
  (Principle 1), and the retirement shrinks the dispatch surface — dead arms and unread slots leave
  `session-init.md`, negative line pressure on the exact file the composable-workflows target compiles later.
  Emitted text stays precomposed; no new markup; published slots change in place under the pre-release posture.

`strategy-knowledge-evolution` and `strategy-pm-composition-evolution` do not fire: nothing here places guidance
content or touches external-PM authority.

## Reversal of record

`spec-session-locus-model` is shipped and archived; its criteria stand as the record of what was decided then.
This unit reverses its substrate decisions forward — the durable record store (D2), the role-and-lease lifecycle
(D4), and process-anchor liveness (D5) — on the maintainer's explicit call, grounded in the census and consumer
trace above. **ADR-032 is amended to record the full retirement**: it currently records the halfway version
(anchor not load-bearing, unleased transient ordinary) and omits that no lease is minted at all and that the
record store follows. The amendment carries the advisory-file-lock option forward and records the operator-error
posture for checkout contention, so the next reader inherits the reasoning without this draft. The retained
mechanisms the prior audit endorsed (identity transaction, provisioning receipts, teardown guard set, marker
payload) are not reversed — they survive in the retention set.

A process lesson rides the record, at the maintainer's direction: the substrate grew by locally-reasonable,
agent-recommended increments that were each approved without the system-level proportionality question being
asked. The check that catches this is not per-mechanism ("does it earn its keep") but per-system ("should the
layer exist") — the two questions this draft's audit history answered in opposite directions, both correctly.

## Success conditions

1. An unrelated checkout's state — degraded, stale, mid-lifecycle, or absent — cannot stop a session's entry,
   recovery, or exit. Demonstrated structurally: the paths those operations read contain no repository-wide
   aggregation.
2. A session that cannot prove its process identity is fully operable: enter, work, hand off, recover, and exit
   through in-model verbs, with no state to hand-edit. The common case does not prompt.
3. Correct lifecycle completion reads as success. Shipping, parking, archiving, and husk removal produce no
   corruption-vocabulary diagnostics and no orphaned durable state — there is no durable state to orphan.
4. Every destructive path retains its full git-fact guard set, demonstrated rather than asserted, and every
   claim-ending exit routes through subject-scoped operator confirmation.
5. Role derivation is specified per consumer and keys on marker + meta + identity ref, with branch as
   corroboration only; every derivation failure degrades toward the non-destructive reading. Fixtures cover: a
   shipped subject (retired), a parked subject, a mid-transient warm parent, a marker/meta disagreement, and an
   unreadable lifecycle scan.
6. Handoff and compaction recovery resolve their frames from the session's own checkout derivation, covering the
   warm-transient parent case, and recovery completes while any other checkout carries arbitrary state.
7. The deletion is complete: no caller-less exports, no unreachable workflow prose, no unread envelope fields
   remain from the retired substrate — verified mechanically (dead-export sweep + envelope-consumer trace), not
   by assertion.
8. The locus-triggered advisory sections satisfy the two doctrinal cuts, and net line pressure on
   `session-init.md` is negative.
9. The retention boundary has a mechanical carrier: the derivation sources are enumerated in one typed surface,
   so reintroducing a durable occupancy record or a branch-shape oracle requires an edit that names the boundary.

## Open questions

- **OQ1 — the four derivation specs** (§ The open core). The readiness gate. Each is a consumer trace plus a
  stated failure policy; none is expected to reopen the direction, but behavior 2 (errand close authority) is the
  richest and most likely to surface a fifth consumer.
- **OQ2 — the parent link's exact carrier.** Leaning: marker field for spawned transients, identity-record field
  for primary-occupancy transients — the two cases have different natural homes and the spec should not force
  one. Settles inside behavior 3's trace.
- **OQ3 — delivery shape.** A removal this size still does not land as one review surface. Candidate cut:
  derivation reader + probe reshape first (additive), verb migration second, deletion third, workflow-prose diet
  riding each. The prior draft's R/A/B/C shape and its three seams are superseded; the new cut is settled at spec
  time against the actual dependency edges.
- **OQ4 — what `arc locus` renders afterward.** A read-only roster over derived rows is cheap and useful; whether
  `attach`/`release`/`resolve` survive in any form or delete with the substrate is behavior 1's call.

## Continuity

**Readiness: `maturing`, re-founded.** The direction, retention set, deletion inventory, boundaries, and
forward-compat posture are settled with the maintainer 2026-08-05. Not formalization-ready until OQ1's four
derivation specs exist — the same discipline that governed the prior passes (trace consumers, not intentions)
applied to this direction's own claims.

**What the re-founding superseded, named so nothing is lost silently:** the four-deliverable hardening shape
(R/A/B/C) and its three seams; the named containment relation and the stop-versus-proposal split; the
narration-only origin list for undiagnosed stops; the retired-subject third resolution outcome _as a repair_
(it survives as an ordinary derivation outcome); the reap verb and reap-gate correction (nothing to reap); the
fail-toward-`dead` fixture work (mechanism deleted, defect moot); Q8's exit-authorization split (subsumed by
Design center 4); Q9's checkout-resolution question (subsumed by the derivation specs); Q10's conformance
candidates (recast as Success condition 9); the typed `schemaVersion` reader-skew field (record store gone). Each
was sound within the hardening frame; none survives the frame's removal. The prior draft's full text is in git
history at `8cbd19874` if any of it needs recovering.

**What carried through intact:** the Q1 reversal and its three grounds (now generalized); Q4's
keep-alive-versus-end split (now Design center 4); Q6's lifecycle port and failure policy (now a derivation
input); the advisory discriminator and cuts (Design center 5); the blocking-versus-discovery scope split; every
sibling-boundary decision except the two kills; ADR-032's file-lock option.

**Evidence provenance:** the census and consumer-trace figures in § Problem/Motivation were produced by two
independent instrumented passes on 2026-08-05 (git-history census; envelope/consumer trace with file:line
evidence). The spec should re-verify any figure it makes load-bearing rather than citing this draft.

**The standing behavioral caution transfers.** Four hardening passes were each optimistic about the same region.
The re-founding does not retire the caution — it redirects it: the claim now most deserving skepticism is "the
derivation covers consumer X," and the instrument that works is unchanged — grep the consumers, read what they
do, never re-read the design's account of them.

**Next:** author the four derivation specs (OQ1), behavior 2 first — it is the richest and bounds the others;
then OQ2–OQ4; then amend ADR-032; then re-assess readiness.
