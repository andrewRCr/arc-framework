# Draft: session-locus-operability-hardening

- **Origin:** [internal] — follows the repository-wide recovery stop of 2026-08-04, whose immediate continuity
  repair is preserved by commit `5c6dd5c74`.
- **Purpose:** Contain locus faults to the loci they belong to, and settle what an ARC session persists when it
  cannot prove its own process identity — the state the model currently has no operable answer for.
- **State:** Draft — `maturing`, at the readiness boundary. Every design question is settled and the
  proportionality audit has run, finding the retained model sound. A third adversarial pass then found that the
  reversal at the design's center had closed the _reason_ for the central question without authoring the
  replacement state; settling that gave the reversal its own mechanism, its own scope item, and its own
  deliverable.
- **Created:** 2026-08-04

---

## Problem / Motivation

Two independent problems meet in the incident. One is settled; the other is this work's real subject.

**The read side stops globally.** `deriveRecovery` (`lib/locus/state.ts:131`) halts on
`managed.some(row => row.lease?.state === "unknown")`: any managed row anywhere with an unknown lease stops
recovery for every healthy work unit in the repository. Three siblings share the shape —
`lib/locus/state.ts:147` (two unrelated residual transients anywhere produce `role-conflict`),
`lib/locus/reconciliation.ts:367` (a `duplicate-locus` row anywhere, outside the relevance loop in the same
function that built the relevance sets), and `lib/locus/reconciliation.ts:273,357` (`derivationStops` accumulates
over every stale record and lock, then joins ahead of the filtered loop).

**A fifth site sits outside the locus module and is the worst of them.** `refuseUnresolvedResidue`
(`lib/recover/locus-context.ts:176-192`) guards compaction recovery with two repository-wide reads: a
`roster.rows.find` for any managed row whose frame is `residue` with a dead or unknown lease, and a rejection of
any non-`none` recovery verdict. Three properties compound. It **throws** rather than returning a stop, so
recovery fails hard where session-init at least degrades to a rendered verdict. It scans every row while its
message reads "**Current** session locus has unknown lease residue," so an unrelated checkout's residue is
reported as the recovering session's own — which is why the failure reads as inexplicable at the point of use.
And it sits on the compaction path, where the operator has the least context and the fewest alternatives: the
session is already mid-recovery. Found by hitting it, not by reading — the four locus-module sites were all
visible to a source read, and this one was not.

The relation these four need already exists. `reconciliation.ts:331-355` accumulates the record IDs, checkout
paths, and identity keys a command's refusals may legitimately come from — selected target, adoption candidates,
derived internal actions, primary, and `current` (active, parent, session home). It is local `const`s inside one
function: never named, never exported, never reused. The concept was written once as an implementation detail
rather than as an authority, so nothing carried it and nothing failed when the next aggregation skipped it.

**The model has no operable state for a session that cannot prove its identity.** Ten sites return `lease-unknown`
from an `anchor.kind !== "process"` check — `errand open`, `locus attach`, the shared `prepare` path,
`locus resolve`, `errand close`, `leave`, `promote`, `partial-settle`, and `abandon` twice — plus an eleventh
degradation at `handlers/errand.ts:1185`, which returns null rather than refusing. Three of the ten came from
`5c6dd5c74`; the rest predate it. They are not uniformly early or unconditional: `abandon-runtime.ts:316` sits
after a state read, and `leave-runtime.ts:65` sits behind a protection-mode branch.

Removing those guards does not produce an operable session, because the substrate below them treats an
unverifiable anchor as an untrusted row by construction — an unverifiable anchor yields `unknown` liveness
(`lib/locus/evidence.ts:308`), which emits a `lease-unknown` diagnostic (`lib/locus/roster.ts:447`), which is
authority-fatal because `AUTHORITY_FATAL_CODES` is computed as the intersection of the diagnostic and stop enums.
An untrusted row is excluded from `resolveCurrent` and reads `residue` in `baseFrame`. The pre-hotfix code states
the same outcome directly — it wrote `state: anchor.kind === "process" ? "live" : "unknown"`,
`selfHeld: anchor.kind === "process"`, and `frame: … : "residue"`. Recovering it restores residue-on-open, not
operability.

And a leaseless transient role has no exit at all today: `errand abandon` refuses (`abandon-runtime.ts:134`),
`locus resolve` refuses (`resolve-driver.ts:79`), and `errand close` classifies it as foreign occupancy
(`close-occupancy.ts:166`). The lease is not merely the transient's frame — it is the generation token every exit
binds to.

**And the same gap opens without any degradation at all — under correct operation.** Observed 2026-08-05 on two
work units that shipped, archived, and were torn down exactly per lifecycle. Their roles outlived their subjects,
because the reader resolves a work-unit role against a live `.arc/active/meta-{key}.md` that shipping had
archived by design. Session-init then reported them in the vocabulary of corruption — `subject-unresolved`,
`locus-unverified`, "reconcile manually before cleanup" — for a state that was the correct end of the pipeline,
and no verb existed to clear them. The advisory is inverted: it fires hardest precisely when everything went
right, because shipping is what breaks subject resolution. Worse, the ordinary remedial act — removing the husk
worktree once its WU has shipped — converts a recoverable state into a permanently orphaned record, since
`teardown` is the only mechanism that could still have cleared it and it requires a registered checkout. Both
records had to be deleted by hand. That is the failure mode Success Condition 3 names, reached with every anchor
verifiable and every lease clean.

**A second incident, routed in from a sibling session, is the same amplifier by a different cause.** A behind-base
checkout read a valid v3 Errand identity through a legacy branch-local probe accepting only v1/v2 records and
reported it malformed, while the authoritative reader resolved it correctly — and that degraded interpretation
blocked unrelated healthy work. `beaf5b26f` fixed the concrete reader, so what carries forward is doctrine: a
stale reader must not mislabel a newer valid generation as corruption, and its confusion must not escape its own
locus.

**Diagnosability compounds all of it.** `lib/locus/session-guidance.ts:102` composes the operator's entire view of
a stopped repository as `` `Session locus recovery is stopped (${recovery.reasons.join(", ")})` `` — a
comma-joined list of bare enum members carrying no record, no checkout, and no route to the verb that clears it.

## What the design actually specifies

An earlier reading of this draft treated the entry refusals as unambiguous drift from a never-refuse boundary.
That reading does not survive a whole-document read of `spec-session-locus-model`, and the correction is load
bearing.

- **The never-hard-refuse guarantee is scoped**, not global. Success criterion 14 states it for _warm entry_ and
  for ordinary WU session entry, not for the transient lifecycle.
- **Unverifiable readings are a specified stop tier.** The proportionality section places "every self-held and
  unverifiable reading" in the **authority** tier — "the target is established but its disposition needs evidence
  the caller cannot supply, and the operator can" — and criterion 16 names its exit: "a self-held or unverifiable
  lease resolves through operator confirmation scoped to an unresolved subject or explicit abandon."
- **The WU degradation is explicitly a bounded exception, not a pattern to propagate.** "Production transient open
  and lease-required attach drivers derive this anchor once and carry it through allocation and lease
  provisioning. **WU entry is the bounded exception**: because its durable role is sufficient session authority,
  an unverifiable selection remains evidence that no lease may attach." The WU path degrades leaselessly to
  "preserve entry without creating an ownership token that no later operation could verify or release."

What survives unchanged is the proportionality principle itself — exactness budgeted by consequence, with
data-destroying paths keeping their full guard set — and `adr-025`'s doctrine-over-mechanism posture for
concurrency. What does not survive is the claim that the specified answer for a transient under an unverifiable
anchor already exists and was merely reversed.

**So the drift is narrower than claimed, and the gap is wider.** The ten sites lost the attestation route that an
`authority`-tier stop is supposed to carry — `resolve-driver.ts:57` still has one
(`if (confirmedNoLiveSession) tolerated.add("lease-unknown")`), and the ten offer none, which is what makes an
`authority` reason behave as a `hard` one. But no amount of attestation produces an operable transient session,
because the state it would attest into does not exist. That is the open design question below.

## Design center

**1. Containment: one named fault-domain authority.** Extract the `reconciliation.ts:331-355` accumulation into a
named, typed relation computed once per read and consumed by every stop aggregation. The predicate reads in two
directions and both are load-bearing: containment (an unrelated degraded row must not stop me) and authority (an
unrelated degraded row is not mine to act on either). The second is what keeps the first from opening a
concurrency hole.

This part needs no attribution. All five aggregations are row predicates evaluated with the row in hand
(`state.ts:131` tests `row.lease?.state`; `:147` counts rows; `reconciliation.ts:367` tests `row.kind`;
`derivationStops` runs inside loops holding `row` and `lock`; and the recover guard's `find` already holds each
row it tests), so relevance is testable directly.

The recover guard needs one thing the other four do not: a **verdict instead of a throw**. Scoping it correctly
still leaves a hard failure for a genuinely relevant residue, at the moment in the session lifecycle where the
operator can least afford one. It should report what session-init reports and let the recovery proceed or stop on
the same terms, rather than raising an error whose message names the wrong checkout.

**The relation governs stops, and stops being derived from proposals.** The same loops that accumulate stop
reasons also propose internal actions — reaping a stale record, breaking a dead lock — for every record and lock
in the repository, and the relevance sets currently consume those proposals' identifiers, so an action presently
determines its own relevance. Scoping the proposals alongside the stops would be the wrong correction: an internal
action reaches an explicit operator choice and is never executed by the read, which makes it an offer — and offers
stay repository-wide by the same reasoning that keeps discovery global while blocking stays local. What changes is
that relevance stops being derived from them: the relation is computed from the session's own frame and its
command target alone. That removes the circularity and dissolves the ordering the earlier reading treated as an
obstacle — there is nothing left to hoist.

This composes with the fail-toward-`dead` correction rather than competing with it. Once an unreadable process can
no longer resolve toward `dead`, a reader that cannot observe another session stops proposing a lock break against
a live lock at the source — which is where that hazard belongs, in the verdict rather than in a relevance filter
compensating for it.

**Settled 2026-08-05 — blocking is scoped, discovery is not.** Three behaviors follow from the one relation, and
the last was not visible until the first two were stated together.

**A degraded checkout blocks only the sessions whose work touches it.** What touches it is knowable without
attribution: the checkout the session occupies, the checkout it named, and any the command would itself act on.
Everything else in the repository is another session's concern and has no standing to end this one. This is the
containment direction of the predicate, and its authority direction is the same fact read backwards — a checkout
outside that set is equally not this session's to act on, which is what keeps the scoping from opening a
concurrency hole.

**A read that names no target is bounded, not unbounded.** It still has a frame — where the session is, and what
the read would do — and that frame is its relevance. So an ordinary session start answers for its own checkout
rather than for every checkout on the machine. This needs no new rule: the relation already admits a session's own
position and its own derived actions, and a target-less read is simply the case where the target-supplied terms
are empty. What was missing was applying the relation at the sites that skip it, not deciding what it means
without a target.

**Blocking and offering do not share a scope.** Being told that abandoned work exists elsewhere costs nothing and
is the entire purpose of the offer; being blocked costs the session. So discovery stays repository-wide while
blocking stays local. Scoping both together would suppress exactly the residue the offer exists to find — a
transient that crashes in its own worktree, with a later session entering elsewhere, would become invisible rather
than recoverable, regressing this draft's own no-dead-ends condition.

**And the transient residue arm does not survive to be widened.** The plurality problem is real as stated — a
second piece of abandoned work currently converts the offer into a stop, denying the operator the choice precisely
because there is more than one thing to choose between. But the arm that produces those offers classifies a
transient role as residue whenever it carries no live lease, which is exactly the rule Design center 2 removes.
Under a leaseless transient every live Errand would match it. So the arm is **removed for transients** rather than
widened, and abandoned-transient discovery moves to the staleness advisory the reversal already names — a
non-gating surface with its own mechanics, not a recovery offer.

What the plurality argument still governs is whatever residue class survives on the work-unit side: where an offer
exists, more findings must produce more offers rather than a stop, since the recovery _is_ the choice. An
indistinguishable pair remains a genuine conflict; a merely plural one does not.

**2. What a session persists when it cannot prove its identity — the role, and nothing else.** Withdrawing the
premise removed the reason to consult the anchor; it did not by itself say what a transient records or what frame
that record derives. Settling the withdrawal means answering both, because the anchor sits on the path that
decides them.

**A transient mints no lease. The role is the occupancy record.** Three behaviors follow:

- **A leaseless transient role derives an ordinary idle frame**, exactly as a leaseless work-unit role already
  does. That is what "ordinary state, not residue" requires; today the same leaselessness reads `idle` for a work
  unit and `residue` for a transient, and only the transient half was ever justified by liveness.
- **A session's current frame resolves from its role and checkout**, not from lease liveness plus an anchor
  comparison. This is the operability half of the reversal, and without it the withdrawal is incomplete: current
  selection matches the entering anchor structurally, and a structural match against an unverifiable anchor is
  refused by construction, so a session that cannot prove its identity can never claim its own row no matter how
  little the rest of the model consults liveness. Taking the anchor off this path is what carries the portability
  finding to its conclusion rather than stopping halfway.
- **Exits bind to the record generation** — the record's identity and role subject, matched against exact bytes —
  rather than to the lease generation.

**The exit re-binding consumes machinery this unit already builds.** The debt is outstanding regardless of this
settlement: leaselessness is the ordinary state of a work-unit role, and the reap gate keys on a lease state no
observed record can satisfy. § Q6 already authors a record-generation exit by reusing teardown's exact-bytes
removal under the record lock. This settlement consumes that shape; it does not mint a second contract.

**The alternative, declined.** Keeping the lease but no longer consulting its state for frame or current
resolution has a smaller blast radius and preserves the existing exit token. It is declined because it leaves a
recorded state field no consumer may trust for authority and an anchor recorded but non-load-bearing — precisely
the recorded-PID shape the reversal exists to stop relying on. It buys a smaller change by preserving the trap.

**3. Diagnosability — solved in the composer, not by attribution.** Threading an originating locus through
`LocusStopReason` was proposed to let the guidance composer name the degraded checkout and the clearing verb. The
composer can already do both. `lib/locus/roster.ts:188` promotes every per-row diagnostic — including
`lease-unknown` (`roster.ts:447`) — into the envelope-level diagnostics; `lib/locus/session-guidance.ts:59-61`
already renders each as `` `{code} at {source.kind} '{source.key}': {message}` ``; and `renderRecovery`
(`session-guidance.ts:88-101`) already joins `recovery.recordId` back to the roster and names
`--confirm-no-live-session` as the clearing verb. What remains is a stop-arm row join and a reason-to-verb map,
both local to one file.

Q3 adds one evidence field to the same part rather than a second mechanism: the `unsupported-version` diagnostic
carries the record's `schemaVersion`, already returned by `readLocusRecord` and currently dropped, so the
reason-to-verb map can distinguish a stale reader — remedy: freshen this checkout — from an unidentifiable record,
which has no verb and should not claim one.

**The composer's reach ends where a diagnostic does, and two stop reasons fall outside it.** The join above works
only for reasons that are also diagnostic codes. `lease-live` and `lock-live` are neither: the diagnostic
vocabulary carries `lease-dead`, `lease-unknown`, `lock-dead`, and `lock-unknown` but nothing for a live one, and
both live reasons are pushed into the derivation's stop set with no record identity attached. So for the
highest-consequence stop in the vocabulary — a foreign live lease, tiered `hard` precisely because proceeding
opens a concurrency hole — the composer holds no row, no checkout, and no key. That is exactly the case where
naming the holder matters most.

Promoting them to diagnostic codes is the obvious repair and is wrong. Authority-fatality is _computed_ as the
intersection of the diagnostic and stop vocabularies rather than hand-listed — a deliberate mechanism, so that a
reason cannot be added without its authority consequence being decided. A new live-lease diagnostic would
therefore make every occupied row untrusted, including the holder's own.

**The fix is a narration-only origin list**: alongside the stop reasons, carry the record identity and checkout
path of the row each reason came from, populated where a stop is raised without a backing diagnostic. This is not
the attribution refuted below. That proposal threaded identity through the stop-reason value itself, which every
consumer switching on those values would have had to absorb; an additive list parallel to the reasons touches none
of them and is read only by the composer.

Attribution through the stop-reason value is therefore **dropped**. Its cost was not contained — stop reasons are
consumed by value identity
across `lib/locus/allocator.ts:82,151,152,284`, `lib/locus/resolve-driver.ts:58`,
`lib/locus/trusted-row.ts:98,132,156`, `lib/locus/stop-tier.ts:29` (the exhaustive tier `Record`),
`lib/locus/state.ts:233-239`, and `lib/locus/reconciliation.ts:436-455`, plus text consumers at
`session-guidance.ts:67,80,102,109` and `command-runtime.ts:477` — and it buys a payoff a local composer change
already reaches. Revisit only if a consumer emerges that the composer genuinely cannot serve.

**4. Give the boundary a mechanical representation.** Whatever Q1 settles, the resolved posture needs to survive
contact with the next person unblocking themselves under pressure. Prose in a spec under `completed/` did not: the
behavior was encoded only in a test named after itself, and that test was rewritten. A conformance surface whose
target set is derived rather than hand-listed is the carrier; the earlier conclusion that the anchor type in each
signature is already a sufficient declaration is weakened by the correction above, because the split is not
cleanly routine-versus-destructive — it turns on whether an `authority`-tier stop carries an attestation route and
whether an operable state exists to attest into.

**5. The advisory surface needs a budget. This unit contributes the discriminator and spends it locally; the
budget itself is owned elsewhere.** Session-init Step 6 carries 31 conditional advisory sections; 3 batch their
re-emission behind a daily nudge marker. Each was justified against its own trigger, and nobody costed the union
— so the ordinary experience is that some advisory fires nearly every session. A surface that always has
something on it stops being read, and then the one that mattered is missed too. This is not a cosmetic concern:
it is the failure mode that makes every other advisory in the system worthless, and it is reached by accumulation
rather than by any single bad decision.

**The discriminator is transition, not age.** An advisory should fire when a condition **becomes** true, not for
as long as it **is** true. Reporting a state that has held for forty sessions carries no information; the
operator has already decided not to act on it, and repeating it only trains the habit of skipping the section.
Age is a weaker proxy — a fresh condition can be worth surfacing immediately, and an old one can be permanent
furniture. The residue reported at this session's start is the worked example: it had been true and unchanged
since the work unit shipped, and was re-emitted every session, which is how it became background rather than
signal.

Two supporting cuts:

- **Context is not advisory.** Which branch, whether the tree is dirty, ahead/behind counts — these are the state
  the next operation acts on, belong in the orientation header, and are cheap to render every time. The budget
  governs the conditional sections, which propose that the operator go and _do_ something.
- **An advisory with no available action is not an advisory.** If the surfaced condition has no verb the operator
  can currently run — the shape this session hit, where "reconcile manually" named no mechanism — it is a
  complaint. Either give it an action or do not raise it.

Both cuts are doctrine this unit's own faults produced, so it states them; neither needs the union to be true.
The locus surfaces are then held to them directly — which is most of what § Q6 already does, since a retired
subject that stops being reported at all is the transition rule and the actionless "reconcile manually" advisory
is the second cut.

**What this unit does not take is the union, the vocabulary, or the cadence mechanism.** Those are
`operational-advisory-registers`' declared subject — see § Boundary with `operational-advisory-registers`. Two
consequences follow. The existing daily-nudge markers are the right instinct at the wrong altitude, reducing
frequency while still reporting steady state; whether they survive or are replaced by transition tracking is not
decided here. And transition tracking is not free: firing on _becoming_ true requires remembering what was true
last session — new durable per-condition state, sited near the existing gitignored nudge markers. That is a
storage design the discriminator implies and this draft has not priced, which is a second reason the mechanism
travels with the inventory rather than with this unit.

## Forward-compat boundaries

`strategy-procedure-evolution` and `strategy-storage-evolution` fire hard; `strategy-knowledge-evolution` fires
weakly but genuinely; `strategy-pm-composition-evolution` does not fire.

- **The agent-facing dispatch surface does not grow.** A session-init step reading "if the stop concerns an
  unrelated row, proceed anyway" is prose evaluating state — the named anti-pattern. `recovery.kind` stays the
  agent's only dispatch input and simply becomes correct. `session-init.md` and `probe-envelope.md` contain no
  reference to `reasons`, so any attribution change stays invisible to workflow prose.
- **Net line pressure on `session-init.md` is neutral or negative.**
- **Emitted text stays precomposed CLI-side**, and any new surface fits the existing step vocabulary — a
  non-gating advisory is a `note`, the residue path stays `fragment` + `offer`.
- **The relation keys on record identity and checkout path, never branch shape.**
- **No new configuration axis.**
- **Published slots change in place** — pre-public-release posture: no alias, no migration reader.

## Scope

The audit re-derived this section. It found no mechanism to cut, so scope is no longer "the containment fix plus
whatever trimming survives" — it is a set of named wiring faults plus their carriers: the four the audit derived,
a fifth added when Q4 proved live rather than moot, and the reversal's own implementation, which the earlier
readings carried as a settled decision without ever giving it a mechanism.

**In:**

1. **The reversal's implementation** — Design center 2 made concrete: transients mint no lease, a leaseless
   transient role derives an ordinary idle frame, current resolution reads role and checkout rather than lease
   liveness and anchor identity, the three exits re-bind to the record generation, the transient residue arm is
   removed, and the eleven anchor-conditional refusal sites are resolved against the settled posture. Abandoned-
   transient discovery lands as the non-gating staleness advisory the reversal promises.
2. **Stop scope** — the five aggregation sites and the named relation over them, including the compaction-recovery
   guard outside the locus module, which additionally converts from a throw to a verdict.
3. **The fail-toward-`dead` verdict** — promoted from a bundled fix to a first-class item; see below.
4. **The retired-subject state and its exits** — Q6, settled, carrying what was Q5: the third subject-resolution
   outcome and its lifecycle port, the branched-shipped offer routed to `arc teardown`, the reap gate admitting a
   null lease, and the owning verb for `reap-stale-record` reusing teardown's proven lock-and-generation shape.
5. **The locus advisories' own diet** — the two doctrinal cuts of Design center 5 applied to the locus-owned
   sections, which is largely what Q6's repair already delivers. Not the union.
6. **The collapsing ownership proof** — Q4, settled: an identity a session cannot substantiate may keep a claim
   alive but may not end one. Scoped by consequence rather than applied to every comparison.

Plus their carriers: the conformance surface; boundary relocation; permanent fixtures covering a session whose
identity cannot be established, a role whose subject has retired, and a lock whose holder is unreadable.

**The fail-toward-`dead` verdict.** `platform-inspectors.ts:87-89` maps `ENOENT` on `/proc/{pid}/stat` to `absent`,
hence `dead`, while every other read failure degrades to `unknown` — so a reader that cannot see another process
concludes it exited, on the one verdict that authorizes destruction. This was scoped as a small self-contained fix
riding the unit. The audit found its blast radius understated: besides WU lease clearing and teardown's occupancy
check, the verdict reaches `acquireLocusLock`, whose stale-break path unlinks a lock the moment its holder reads
`dead` (`lock.ts:82-98,164-169`). A PID-namespaced reader therefore breaks a **live** record lock and admits a
second concurrent mutator — the precise hole `lease-live` is tiered `hard` to prevent. That makes the correction
load-bearing for Success Condition 9 rather than incidental to it, and it earns Success Condition 12 below. The
correction itself is unchanged and small: unreadability must never resolve toward `dead`.

**Settled by Q6, closing the last open scope call.** The reap-gate correction rides this work unit rather than an
Errand. It was held open on concern-identity — a null-lease gate fix reads as distinct from a frame-disposition
question — but that split does not survive the boundary move: once the verb redeeming `reap-stale-record` is
authored here, the gate and its redemption are one concern, and an Errand carrying half of it would be the
anti-rider rule applied backwards.

**Out:** cross-machine arbitration and backend storage evolution. Harness-recognition improvements beyond what
landed — recognition sharpness is not what decides operability. Stop-reason attribution, whose payoff the guidance
composer already reaches locally. The advisory union budget, the register vocabulary, and transition tracking's
storage — `operational-advisory-registers`' subject.

### Delivery shape

**This unit does not land as one review surface, and the cuts are the design's own.** Measured against the
subsystem's own precedent rather than estimated: `session-locus-model`, which built this substrate, shipped as
roughly nine pull requests of 2.5k–4.5k changed lines each (#405, #407, #423, #424, #429, #433 among them). The
repository's test-to-source ratio in this area compounds it — the locus test files run about 12k lines against
7.8k of source — so a single surface carrying the port, the new verb, the published-slot widening, and the
conformance mechanism together lands far past a reviewable size.

Four deliverables, each an independent merge boundary over one shared design and one spec:

- **R — The reversal.** Leaseless transient minting, the ordinary idle frame, role-and-checkout current
  resolution, the three exits re-bound to the record generation, removal of the transient residue arm, the
  eleven anchor-conditional refusal sites, and the staleness advisory that replaces the gate. Delivers Success
  Conditions 3 and 7, and carries the conformance surface (10) since the posture it makes mechanical is this
  one.
- **A — Containment.** The named relation and the aggregation sites that survive R. Delivers Success Conditions 1
  and 2, and carries the diagnosability composer work (8).
- **B — Guards that are wrong about identity.** The fail-toward-`dead` verdict and the collapsing ownership
  proof — both destructive-path guards misreading identity, both reached by the same process-inspector fixtures.
  Delivers Success Conditions 12 and 13.
- **C — The retired subject and its exits.** The lifecycle port, the third subject-resolution outcome, the
  branched-shipped routing, and the reap gate with its verb. Delivers Success Conditions 4 and 5, carries the
  locus advisory diet (6), and splits again if it outgrows the boundary.

Success Condition 9 is cross-cutting — every deliverable that touches a destructive path demonstrates its guard
set rather than one deliverable owning it. Success Condition 11's multi-session fixtures span R and C, since the
two states it names are each deliverable's own.

**Named seam — R and A share the recovery derivation, and split the compaction-recovery guard between them.**
They are not independent. R deletes the transient residue arm, which is one of the sites A would otherwise scope,
and both edit the same derivation. They also divide the recover guard: R closes every path by which a transient
reaches it — no transient lease to read dead or unknown, no transient residue frame, no transient recovery
verdict — while A scopes the work-unit lease that still stops recovery repository-wide and converts the throw to
a verdict. So R alone unblocks the observed failure and A is what makes it structurally safe; neither claim
should be made for the other. They sequence, R first: scoping a site R removes is wasted work, and the reverse
order leaves A's relation briefly governing a classification the design has already abolished. B and C are
independent of both and of each other. R first is also the right default on merit — it is the headline change and
what makes a sandboxed session operable at all.

These are **deliverables**, not work units and not a cohort: one concern, one design, one spec, separated only at
the merge boundary. `assess-cohort-fit` clears as one unit. The separation is hand-rolled because the mechanism
that would carry it — `delivery-plan-record` and its cohort — has not shipped; when it does, this shape is the
kind of plan it exists to record, not a competing one.

### Boundary with `locus-generation-binding`

**This work owns where a stop reason comes from, whether it applies to you, and what state a role occupies when
its anchor cannot be verified or its subject has retired — including the verb that clears an orphaned record.
`locus-generation-binding` owns what authority a mutation carries, generalized across every mutator.**

**The boundary moved deliberately, 2026-08-05.** The earlier split assigned the record-clearing verb to that unit,
on the reading that reap and dead-lock recovery "still lack an owning verb" — its own words. That reading assumed
an existing driver to adopt. `applyLocusReconciliationAction` is **not in the tree**: it was built ahead, carved
out during chunked-review triage, and preserved only at an archive tag. So deferring did not mean deferring
adoption of something built; it meant deferring authorship indefinitely, behind a unit that is provisional, `P2`,
and itself blocked on unlanded `claimed-sweep-verbs` — while Success Condition 4 went unmet here.

Taking it costs adding a sixth mutation site to the set that unit exists to reconcile. That cost is paid down by
**reuse rather than deferral**: `arc teardown` already performs exact-generation record removal under the record
lock, and reap of an orphaned record is a strictly simpler instance of it — no worktree, no roster generation to
revalidate, no projection retirement — whose action already carries the exact record bytes in its proof payload.
The verb authored here consumes that proven shape; it does not mint a second contract.

What stays with `locus-generation-binding` is unchanged and non-empty: the five carried generation gaps across
attach, provisioning, promotion, and marker authority, the uniform capability contract over all of them, and the
failure-injection and replay matrix. A drawn boundary is evidence about what was known when it was drawn, not a
standing obligation; this one was redrawn against what the tree actually contains.

### Boundary with `staleness-guard-policy`

That work owns which stale development commands may mutate state; it has confirmed the split and scoped session
identity out of its spec. If containing reader-version skew needs base or source freshness policy rather than
locus authority, route it there explicitly — noting its open capture on widening detection beyond first-party
sources may be the better composition target.

### Boundary with `operational-advisory-registers`

**That work owns the advisory union, the register vocabulary, and the cadence mechanism. This work owns its own
ten sections and contributes the discriminator that governs them.**

`draft-operational-advisory-registers.md` already declares exactly the scope Design center 5 was reaching for —
inventory the complete surface, classify each condition as actionable-now / awareness / expected, and settle where
daily batching composes — and it already declares this composition in its own words: the locus work owns a
locus-scoped noise diet for its own surfaces, and that unit generalizes across routine operations afterward. The
split is not being invented here; it is being honored.

**Two facts decide it rather than preference.**

- **The union is not reachable from here, and the locus-triggered share is smaller than a first count suggests.**
  Six of the 31 conditional sections fire on locus state itself: the two `locusGuidance` arms, residue recovery,
  the current-husk notice, the linked-worktree cleanup-residue section, and in-flight identities. A second group —
  the three sweep arms and orphan branches — is triggered by worktree and lifecycle facts with locus participating
  only as a veto; the rename-move arm reads no locus state at all. This unit can stop those misfiring, which is
  what § Q6 does, but cannot make them silent, because nothing it owns decides whether they fire. The remaining
  twenty-one are worktree sync, base distance, base-branch sync, the two reconcile surfaces, notes state and
  drift, compaction, dirty, retired subdirs, in-flight work units, the two materializable routes, and housekeep. A
  locus-scoped diet therefore cannot make an ordinary session silent, because most of what speaks is not locus
  state. The worked example is this draft's own session of 2026-08-05, which rendered exactly one conditional
  section — base drift — from the non-locus half.
- **The vocabulary is already being minted independently, which is the defect.** `BaseDriftRegister` carries
  `calm` / `attention` / `degraded` (`lib/git/base-drift-types.ts:63`) and `notesDriftSurface` carries `expected`
  / `caution`, each local to its own surface, while the register work proposes a third naming. Minting a fourth
  locus-local register would be a further instance of the condition that unit exists to end, not a step toward it.

**So Q2 resolves by ownership rather than by design.** The guidance composer's output does need a register; it
does not need a locally minted one. This unit composes its stop and residue text against whatever register
vocabulary that work lands, and until then states urgency in prose rather than in a typed field. The
discriminator and the two supporting cuts travel the other way, as recorded input to that draft — they fell out of
this unit's own faults and should not be re-derived from a clean sheet.

**What this costs, named rather than minimized.** An ordinary session does not become silent when this unit
ships. The noise-collapse failure mode persists behind a `P2` unit, and the loudest surface an operator meets is
untouched. Accepted deliberately: the alternative is carrying a whole second unit's inventory, classification, and
new persisted state inside a `Heavy` unit whose wiring faults have nothing to do with it.

## Q1 — what does a session persist when it cannot prove its own process identity?

**Settled 2026-08-05: the question is withdrawn along with its premise. Errands stop detecting session
liveness.** The ballot below asked what a role should record when the process anchor cannot be verified. The
answer is that the anchor should not be load-bearing at all, so nothing needs recording. What follows supersedes
`spec-session-locus-model` Success Criterion 9's requirement that an unleased transient role classify as residue,
and is a deliberate reversal of a shipped decision rather than a defect repair — see § Reversal of record below.

**Three grounds, in ascending order of force:**

1. **Proportionality.** The mechanism exists to catch abandoned Errands, which occur roughly zero to two times a
   week. In one day it blocked two unrelated sessions and caught none. An abandoned Errand is a branch with
   uncommitted edits; left alone it costs nothing but the risk of being forgotten. That is a job for a list, not
   a gate — the same treatment stale worktrees and orphan branches already receive as non-gating advisories.
2. **Failure direction.** When the check is wrong it is wrong toward `dead`, which is the verdict that authorizes
   reap and abandon. Observed 2026-08-05: a live Errand held by a running session, carrying seven modified files,
   was reported dead and offered for abandonment to an unrelated session.
3. **Portability — the decisive one.** A process anchor is a PID plus a creation token, and a PID is meaningful
   only inside its own namespace and only to a reader permitted to see the process table. ARC is
   agent-platform-agnostic and must run under sandboxed harnesses. A sandboxed reader holds no evidence about
   another process, so the mechanism cannot be made reliable there by sharpening it — it has no evidence to
   sharpen. Demonstrated the same day: four independent reads of one record returned `live`, while a sandboxed
   harness reading the identical record from the identical worktree returned `dead`. The verdict depended on the
   caller's harness, not on the state.

**Why Errands were given a different model, and why the reason does not hold.** The asymmetry was not arbitrary.
D4 reasons from work character: a WU is designed to span sessions, so an idle role is normal, while an Errand is
atomic — one sitting — so an idle role means something went wrong. Cross-session Errand work was meant to go
through explicit pause, which is why "a remaining unleased transient role is therefore still genuine crash/walk-away
residue." That inference is sound as far as it goes. It fails twice past that point:

- **Anomalous does not imply blocking.** Granting that an unleased Errand role is irregular establishes only that
  it is worth mentioning. Nothing carries it from "irregular" to "must be resolved before unrelated work may
  begin," and that unearned step is where the friction actually comes from.
- **The lease duplicated a signal the identity already carried.** `locus/schema/identity.ts:35-38` gives every
  Errand identity a durable three-valued state — `open` / `paused` (with `savedHead`) / `awaiting-merge` (with
  `changeRequest`). Legitimate parking is therefore already distinguishable from abandonment by reading the
  record, with no liveness check, no process anchor, and no harness dependency. The lease added only "is a process
  attached at this instant," which is precisely the question a sandboxed reader cannot answer — and precisely the
  question staleness answers well enough for a reminder.

**The identity-record authority is a full-protection statement, and partial protection needs a different one.** A
partial-protection Errand has no shared identity record at all — the shipped model gives it a machine-local role
carrying session-local orientation only, with no cross-session pause. So there is no three-valued state to read,
and stating the identity record as the sole authority for "parked or abandoned" would be false in the protection
mode that is the framework's default. It is also unnecessary: partial mode has no pause, so nothing can be legitimately
parked, and the only question its role answers is whether the free primary is busy. That question is answered below.

**One asymmetry does survive, and it is not the one the model encoded.** An Errand may occupy the physical
primary, which is a scarce shared checkout; an abandoned WU worktree is merely a directory. So an abandoned Errand
can hold a resource another operation needs. That argues for surfacing occupancy **when something contends for the
primary** — where the allocator already reads occupancy — not for stopping unrelated sessions at init. Contention
is the moment the fact matters. This is also partial protection's whole answer: its role exists to mark the primary
occupied, contention is when that matters, and the allocator already reads it there.

**What replaces it.** Abandoned-Errand discovery moves to the advisory tier: surfaced by staleness in orientation
alongside the existing worktree and branch sweeps, never gating, never authorizing removal on its own. The spec's
rejection of age as deletion evidence is retained unchanged — age explains a prompt, never authorizes a reap.
What changes is only that nothing blocks while the question goes unanswered.

**What this costs, named rather than minimized.** Automatic crash detection for Errands is gone. Two sessions may
occupy one Errand without the model preventing it. Both were previously prevented _when the mechanism worked_;
neither is prevented today under a sandboxed harness, so the loss is narrower than it first appears — but it is
real, and it is accepted deliberately.

**If liveness is ever wanted back**, the portable mechanism is an advisory file lock held open by the session
(kernel-released on process exit, meaningful across namespaces), not a recorded PID. Out of scope here; recorded
so the option is not rediscovered from scratch.

---

_The ballot below is retained as superseded reasoning: it records why the frame-disposition framing could not
settle the question, which is why the premise was withdrawn rather than answered._

The work unit's central question. Four candidates, none settled.

**First, a distinction the earlier draft collapsed.** Uncertainty about the **target** ("this record carries a
lease whose liveness I cannot verify") is a real authority question with a real risk, and operator attestation is
its specified exit. Uncertainty about the **caller** ("my own anchor is unverifiable, but the target is
demonstrably free") is not: there is nothing for an operator to attest that the code does not already know, and an
attestation that is always granted is not evidence — it is a click-through that trains people to stop reading.
The specification discriminates the same way for WU entry: unverifiable caller plus free target proceeds, while
"live or unknown existing occupancy still refuses." So the common case must not prompt, and the question is only
what it writes.

**The ballot is the lease state and frame, not the storage shape.** An earlier framing of this question offered
four storage options and missed the gate that decides all of them. Frame and current-locus derivation key on
`lease.state === "live"`: `resolveCurrent` (`state.ts:325-328`) tests liveness **first**, before trust, and
`baseFrame` (`state.ts:308,313`) returns `residue` for any lease that is null or non-live. An unverifiable anchor
yields `unknown` liveness (`evidence.ts:308`), so every option that leaves a lease reading `unknown` produces a
row that is never `current` and always `residue` — and `deriveRecovery` (`state.ts:131`) then stops on the
session's **own** row, which no containment relation can scope away because that row is relevant by construction.

So the settle-able decision is: **what lease state and frame does a role receive when its anchor cannot be
verified?** Candidates:

- a fourth frame value distinguishing "occupied, liveness unprovable" from `residue`;
- a `self-asserted` lease state, ranking between `live` and `unknown`;
- admitting `unknown` as `current` when the entering anchor structurally matches the recorded one;
- a role-only `current` that does not consult lease liveness at all.

The storage question follows from that answer rather than preceding it. **(a) mint the lease anyway**,
**(b) leaseless transient role**, and **(c) role plus a non-ownership occupancy marker** remain live, but each is
only evaluable once the frame disposition is fixed. Option (b) additionally owes frame derivation, residue
classification, teardown's occupancy veto (`teardown-occupancy.ts` returns `clear` on a null lease), and all three
exit paths, which refuse a leaseless role today; it also trades away automatic abandoned-errand detection, partly
recoverable through an age-explains-a-prompt triage surface.

**Option (b)'s exit-path debt is already outstanding, and that reprices it.** Observed 2026-08-05 across this
repository's whole record store: every one of six records carried `lease: null` — four live work-unit roles and
two orphaned ones. Leaselessness is the ordinary steady state of a WU role, as `AGENT-BRIEF.ARC` states directly,
not a degraded condition an option would newly introduce. Yet the exits key on lease generations throughout:
`reconciliation.ts:294` gates reaping on `lease?.state === "dead"`, which no record in this repository could ever
satisfy, and `resolve-driver.ts:79` refuses a null lease outright. So the debt (b) is scored for is not cost the
option incurs — it is unpaid cost already present on every work unit. That cuts both ways and the ballot should
argue it rather than inherit the earlier scoring: either (b) is cheaper than assessed, because those paths need
fixing regardless of which option wins, or the same evidence shows leaselessness is structurally under-supported
and (b) compounds a known weakness. This draft's evidence does not settle which.

**A fourth option is withdrawn, its premise refuted.** Binding exits to the `leaseId` as a capability rather than
to anchor identity assumed only the minting session holds that token. It is published: `rowLease` in
`lib/locus/schema/state.ts` carries `leaseId` on every roster row, and `arc status --session-init --json` emits it
for every lease. The token is an identifier, not a secret, so binding a destructive path to it would replace half
of a two-factor ownership proof with a value any reader can obtain — contradicting this draft's own conditions on
foreign-lease takeover and destructive guard sets.

**What decides the remaining ballot.** Which disposition keeps all three exits operable; whether cleanup's
occupancy veto can key on something other than lease liveness; whether the choice changes the generation token an
exit binds to, which is `locus-generation-binding`'s subject; and whether it can be expressed without a new
configuration axis. No option should be adopted on this draft's current evidence alone.

## Reversal of record

`spec-session-locus-model` is shipped and archived. Two of its decisions are reversed here rather than repaired,
and the distinction matters: a repair restores intended behavior, while a reversal changes what was intended.
Neither archived criterion is edited — they stand as the record of what was decided then, and this draft is the
amendment forward.

- **Criterion 9** — "without … classifying any unleased transient role as normal waiting." Reversed: an unleased
  transient role becomes ordinary state, and abandonment is inferred from staleness on an advisory surface rather
  than from lease absence. Ground: the three arguments under Q1.
- **D4's session-liveness binding for transients** — "Transient roles are session-bounded." Retained as intent,
  withdrawn as mechanism: the boundary is no longer proven by a process anchor.

This is a design reversal of a shipped model on the maintainer's explicit call. **Authored as ADR-032, "Stop
Binding Transient Roles to Process Liveness"** (2026-08-05) — the next person to meet the lease fields needs this
reasoning without reading a work-unit draft. Its subject is the reversal and its three grounds, not this unit's
implementation. It is a new record rather than a supersession: no prior ADR carried the liveness binding, which
lived only in the archived spec. The archived criteria are not edited; ADR-032 is the amendment forward, and it
carries the advisory-file-lock option so a future reader does not re-derive the rejected alternatives.

## Proportionality audit

The reversal above came from asking whether one mechanism earned its cost. The same question was owed to the rest
of the model, scoped deliberately so the audit did not become an open-ended sweep.

**The spec supplied its own target set.** Its proportionality boundary names what it deliberately retained:
"platform inspectors, record-scoped locks with stale-break, staged provisioning receipts, the complete-basis
identity transaction … extend none of it without a new motivating failure." That list was the audit's subject,
plus the machinery this session found by operating the system. Each candidate was asked one question: **what
failure does this prevent, how often does that failure happen, and what does the mechanism cost when it is
wrong?**

**Run 2026-08-05. The headline result is that nothing was cut.** The audit was framed on the expectation that
Q1's reversal would strand machinery downstream of it. It did not. Every mechanism the spec deliberately retained
still earns its keep, one of them is _more_ load-bearing after the reversal than before, and the single piece of
genuinely uncalled code is worth keeping for a different reason. What the audit found instead was four wiring
faults, which is what § Scope now derives from.

**Retained — no cut available:**

- **The three platform process inspectors.** The premise was wrong. `process-inspector.ts` carries two independent
  boundaries: `ProcessAncestryInspector` / `acquireSessionAnchor` selects the _caller's own_ anchor structurally
  from its own ancestry (fourteen call sites, nothing to do with liveness), while `ProcessInspector` /
  `verifyProcessAnchor` verifies a _recorded_ anchor. Only the second is the sandbox-unreliable one, and it keeps
  consumers the reversal never touches — the record-lock stale-break, WU lease clearing, teardown occupancy, and
  rename. Removing either boundary is an adequacy regression.
- **Staged provisioning receipts.** Not bookkeeping. Transient setup is a five-step sequence — branch, worktree,
  ownership marker, record, lease — and the receipt is the exact-generation token its rollback reads. It is what
  makes the undo delete _the branch this operation created_ rather than whatever now carries that name; every
  rollback can return `generation-mismatch` and decline. When rollback itself fails, typed evidence
  (`pending-marker`, `marker-record-mismatch`, `PrimaryCheckoutResidueError`) reports the residue rather than
  abandoning it silently. Removing it means a failed transient open leaves phantom worktrees and branches, or
  deletes a sibling's — the exact hand-cleanup dead end this unit is chartered against.
- **The complete-basis identity transaction.** Every v3 identity mutation reads the whole tree from local and
  remote, reconciles per key from their common basis, applies one transform, CAS-moves and pushes, and refuses
  rather than reading a transport failure as absence (D8, read whole this pass). **The reversal raises its value
  rather than lowering it:** Q1 removed liveness and rested "parked or abandoned?" entirely on the identity
  record's own three-valued state, so this is now the _sole_ authority for that question. D8 also records the
  heavier machinery already declined — no winner-arbitration, no retry-adoption, no persisted sweep plan — so the
  restraint the audit would have recommended is already applied. The elevation is scoped to full protection: a
  partial-protection Errand has no identity record, and its own question — is the primary busy — is answered by
  role presence at contention rather than by any record state.
- **The husk stamp's evidence payload.** All three fields are read by the destructive teardown path:
  `resultDigest` and `baseProofOid` gate the retirement driver's digest and ancestry proofs, `expectedLifecycle`
  gates teardown's lifecycle-location match. This falls inside the audit's own out-of-scope rule below.

**Kept, but by decision rather than by having a caller:**

- **`classifyLeaseAuthority` and its `LeaseAuthority` vocabulary** (`self` / `foreign` / `dead` / `unverifiable`)
  have no production consumer at all — only their own definition, a rationale comment, and unit assertions, which
  is why they read as live code. That is the exact authority vocabulary the post-reversal model needs, and it is
  cheaper to keep than to re-derive. **Retained as a building block**, on the maintainer's call. If the resolved
  design does not consume it by spec authoring, it is `unsupported-machinery` and goes.

**Reclassified rather than cut:**

- **The two divergent occupancy predicates** are not a tie between two readers. The roster's work-unit predicate
  requires a resolved `active/meta-{key}.md`; teardown's matches on role key alone. Shipping _moves_ that meta by
  design, so the roster reader conflates "the subject is identifiable" with "the subject is still active" and
  answers `subject-unresolved` for a work unit that completed correctly. The repair is the missing state, after
  which the predicates agree without ranking. **Q5 is therefore folded into Q6** rather than surviving as its own
  question.
- **`unsupported-version` at the `hard` tier** is already contained. It reaches reconciliation through the
  relevance-filtered row path, not the unfiltered `derivationStops` set, so Design center 1 does most of Q3's
  work. What remains is smaller and cheaper than assumed — see § Resolved design questions.
- **The blocking residue gate** and **the 31-section advisory surface** stand as written; the counts re-verified
  exactly (31 conditional sections, 3 rate-limited). Both are wiring faults in § Scope, not cut candidates.

**Out of scope for the audit:** anything whose removal would weaken a destructive path's guard set. The
proportionality principle cuts ceremony, never guards — Success Condition 9 is unchanged.

**The discipline that keeps this from over-cutting.** Every proposed removal must name the failure the mechanism
prevented and show that failure is either impossible now, covered elsewhere, or accepted with its cost written
down. A cut that cannot name what it was protecting against has not been justified — it has only been assumed
unnecessary, which is the same reasoning error that produced the overbuild, run in reverse. Q1's reversal is the
worked example: it names crash detection and dual occupancy as the losses, shows both were already unavailable
under a sandboxed harness, and records the residual cost rather than claiming there is none.

The audit's own result is the second worked example, in the opposite direction. Applying that discipline to six
candidates returned no removal at all — each named a failure it prevents that is neither impossible nor covered
elsewhere. A proportionality pass is not obliged to find something to cut, and one that manufactures a cut to
justify having run is the failure mode this discipline exists to prevent.

## Q6 — what state does a role occupy when its subject has legitimately retired?

**Settled 2026-08-05, carrying what was Q5.** The reader had no subject-completed state, so a shipped WU's role
and a corrupted one projected identically. Tracing it end to end decomposed the question into two distinct states
with different mechanics, found one cause behind the observed symptom, and found a second cause the draft had not
seen at all.

**Two states, not one.**

- **Checkout registered, subject shipped.** The row is an ordinary managed role. Subject resolution looks for
  `.arc/active/meta-{slug}.md`, does not find it because shipping relocated it, and answers `subject-unresolved`.
- **Checkout removed, record orphaned.** The row becomes `stale-record`. A `reap-stale-record` internal action
  already exists for exactly this, and never fires: its gate demands `lease?.state === "dead"` while a live WU
  role's lease is `null`, and the action has no CLI verb bound to it.

**The observed symptom has one cause, four hops.** `subject-unresolved` is authority-fatal by the diagnostic /
stop-reason intersection at `trusted-row.ts:42-45`, which makes the row untrusted, which makes
`locusOccupancyAtPath` return `manual` despite a null lease, which the sweep converts into the
`locus-unverified` veto that blocks its own cleanup offer. No
branching, one root. Supplying a retired state inverts the whole chain: trusted row, null lease, occupancy
`clear`, veto lifts, and — per that function's own contract — "the surface's own removal predicates decide alone."
Those predicates then pass for the ordinary case (marker present, tree clean, merged, user surfaces safe →
`removable`), so the offer does appear.

**The exit already exists and already carries the discipline.** `arc teardown` removes the locus record as well as
the worktree (`teardown-locus.ts:86-95`), under the record lock, matching exact bytes, with the roster generation
revalidated under lock and a hard refusal if anything moved. So the ordinary lifecycle closes with no new verb at
all: ship and archive → retired subject → veto lifts → sweep offers teardown → teardown clears worktree and record
together.

**The bug was manufacturing its own residue class.** State 2 arises when a worktree is removed by hand before
teardown runs — which is exactly what the 2026-08-05 incident did, _because the veto made teardown unofferable_.
Removing the cause shrinks the residual obligation from "shipping strands records" to "someone ran a raw worktree
removal first."

**The second cause, found while tracing the offer.** Even with the veto lifted, the sweep's `branched` arm renders
a `removable` decision as an interlock-gated `git worktree remove` — raw Git, which takes the checkout and leaves
the record. Only the `husk` arm offers `arc teardown`. So the branched-shipped path _produces_ the orphan it is
trying to clean, and `locus-classification.ts` names the reason in its own header: these are "legacy session
cleanup surfaces," written before the locus record existed. A branched worktree carrying a work-unit role must
offer `arc teardown {name}`; the raw removal is correct only for a branched worktree with no role, which is the
genuinely external case.

**Resolved shape:**

1. **A retired subject is a third subject-resolution outcome** — `resolved` / `retired` / `unresolved` — not a
   fifth frame value. The frame answers "can a session enter here," and a retired role's answer is the same "no"
   that `idle` already carries; what changed is _why_, which is the resolution question. A new frame value would
   touch every consumer that switches on frame for a distinction none of them act on.
2. **The retired fact arrives through an injected port.** The project already resolves any slug's lifecycle
   position across `backlog/provisional/`, `backlog/planned/`, `active/`, and `completed/` — one filesystem scan
   over tens of files, built fresh per call, with `isShipped` sitting on it and `completed-index.ts` describing
   itself as "the one place that knows what a shipped-WU archive looks like." The locus reader currently
   duplicates a fragment of that and calls the miss corruption. It cannot import the index directly: `lib/locus`
   imports nothing from `lib/work-unit` today while `lib/work-unit` imports from `lib/locus` in four places, so a
   direct reach inverts the dependency. A port matches the reader's established idiom (`SubjectMetaIO`,
   `createLocusEvidenceIO`) and keeps the module free of the cycle.
3. **The branched-shipped offer routes to `arc teardown`** when a work-unit role is present at the path.
4. **The reap gate admits a null lease**, and **the reap action gets its owning verb here** — see the boundary
   note below.

**Cost, named rather than minimized.** Reading a retired subject means the locus reader now depends on lifecycle
state it previously did not consult, so a malformed or unreadable archive tree becomes a new input to subject
resolution. The port's failure policy must therefore be settled explicitly at spec time: an unreadable lifecycle
scan resolves to `unresolved`, never to `retired`, since inventing a retirement is the one direction that
authorizes cleanup.

## Resolved design questions

**Was ancestry the live defect? Yes, though not as first framed — settled by reproduction.** Every invocation in
an ordinary session produced `Unrecognized process boundary: /usr/bin/bash`. The cause was neither ancestry
inference nor the npm-to-`dash` chain but `isAgentSnapshotShell` requiring every command between the
shell-snapshot `source` and the `eval` to be `true` or `shopt`, which a harness prologue's brace group violated.
Fixed on `main`. Recognition remains coupled to vendor shell text, but recognition sharpness is not what decides
operability, so it is not this unit's subject.

**A staleness horizon cannot authorize removal.** The design rejects heartbeat age as dead-session evidence — "a
quiet but live session can have an old heartbeat… age may explain a prompt but cannot authorize removal" — with
an explicit non-goal against age as a liveness or deletion signal. The surviving use is a triage prompt, which
Q1's option (b) would need.

**The harness-identity provider seam is dropped.** Adopted while recognition was believed load-bearing; it is not.

**Containment does not depend on attribution.** The five aggregations are row predicates; the earlier claim that
attribution was their mechanical prerequisite was wrong.

**Q2 — does the guidance composer's output need a register? Yes, and not one minted here.** The question was
posed as a design call and resolves as an ownership one. A degraded sibling is advisory while a degraded current
locus gates, so the distinction is real — but `operational-advisory-registers` owns that vocabulary by its own
declared charter, and two local registers have already been minted independently in-tree, which is the drift that
unit exists to end. This work composes against whatever vocabulary lands there and states urgency in prose until
then. Settling it also settled the advisory budget's ownership, since both turned on the same boundary — see
§ Boundary with `operational-advisory-registers`. The discriminator itself survives here as doctrine (Design
center 5), applied to the locus surfaces and recorded as input to that unit's draft.

**Q3 — is `unsupported-version` the right tier when the reader is the stale party? Yes, and the defect is one hop
later.** The tier holds by its own definition rather than by deference. `authority` means the target is
established but its disposition needs evidence the caller cannot supply and the operator can; for an unsupported
version the target is _not_ established, because a reader that cannot parse the record cannot know whether a live
lease sits inside it. No attestation helps — the operator cannot read a future schema either, and no confirmation
makes the bytes parseable — so releasing it would be acting on an unidentified record, which is exactly what
`hard` names. `stop-tier.ts:40` already places it precisely as "unreadable by this version."

Containment is confirmed as the audit claimed: `rowStopReasons` (`reconciliation.ts:412`) is a per-row function on
the relevance-filtered path, and `primaryRowStopReasons` (`state.ts:213`) reads the primary row, which is relevant
by construction.

**What is broken is the diagnostic.** `readLocusRecord` returns `{ kind: "unsupported", schemaVersion }`
(`record-store.ts:66`) and `roster.ts:452` composes `"Record schema version is unsupported"` without it — so the
surface names the record as the faulty party while holding the number that says the reader is. The discriminator
needs no new evidence: a `schemaVersion` above the supported one means this checkout is behind and the remedy is
runnable, while anything else is a genuinely unidentifiable record where both the tier and the current wording are
already right. Q3 therefore collapses into Design center 3 — composed locally, no tier change and no new stop
reason — and it is the second doctrinal cut applied to a stop rather than an advisory.

The one sub-decision: the stale-reader fact is carried as a **typed `schemaVersion` field on the existing
`unsupported-version` diagnostic**, not as message text and not as a new stop reason. A new reason would grow the
tier `Record` and the value-identity consumers for a distinction the diagnostic can hold; message-only would
force `staleness-guard-policy` to parse English if it later keys on reader skew. The typed field costs one
optional field on a diagnostic that already exists and leaves that seam consumable.

**Q4 — what may a session do with an ownership claim it cannot substantiate? Settled by consequence, not by
precondition.** Q1's withdrawal narrowed this question without mooting it: it removed liveness _detection_, while
these are ownership _assertions_, which fire wherever a claim exists.

The hazard is that an unprovable identity currently answers the ownership question affirmatively. Under a harness
that hides process identity every session looks alike — and looks alike for the same recorded reason, since the
cause is environmental rather than per-session — so sameness reads as a match and the claim comes out owned for
whoever asks. The ownership proof is meant to compose a published claim identifier with a private session anchor;
when the anchor cannot be verified it stops varying, the private half becomes a constant, and the proof reduces to
the published identifier alone. **That is the same defect this draft already refuted as the withdrawn fourth
option, reached by accident instead of by design** — and reached under the conditions Q1 established as ordinary
rather than exotic, which is what makes it live.

**The resolution splits the two sites by what being wrong costs**, which is the proportionality principle the
model already runs on rather than a new rule:

- **Keeping a claim alive** — routine upkeep that records ongoing work — proceeds unchanged. A false match moves a
  timestamp; nothing is stranded, and after Q1 that timestamp is no longer load-bearing for transients. Requiring
  proof on a frequent, harmless path would mint exactly the always-granted confirmation Q1 rejected as a
  click-through.
- **Ending a claim** — releasing it, closing it out, removing the role — does not proceed on an identity the
  session cannot substantiate. It routes to the operator, who can attest what no inspector can observe. This is
  the `authority` tier behaving as specified and reuses the attestation route the model already offers for this
  exact doubt, so it mints no vocabulary. The cost is paid once per exit rather than per heartbeat, and the
  session is never walled off — the answer is "confirm this," not "you may not."

The stronger repair — making an unverifiable anchor vary per session so the private half stops being constant —
needs durable cross-process session identity established without process inspection, which is the advisory
file-lock ADR-032 already records as the deferred option. Referenced as the upgrade path, deliberately not pulled
into scope.

The remaining five raw comparisons stay as they are: two are guarded by an enclosing liveness check or a signature
already typed to a verifiable anchor, and three are idempotency tests rather than release authority.

## Success conditions

1. Recovery of a healthy work-unit locus remains available when an unrelated checkout carries an unknown lease.
2. The affected checkout still fails closed, and no operator confirmation can take over a verifiably foreign live
   lease. Containment does not weaken the authority direction.
3. A session that cannot prove its process identity reaches a defined, operable state with **no dead ends**: it
   can complete or abandon its work through an in-model exit, without hand-editing the record store.
4. **No dead ends at orderly termination either.** A role whose subject legitimately ended — a shipped work unit,
   a removed husk — is clearable through an in-model verb. Identity failure and orderly retirement reach the same
   terminal gap today by unrelated routes, and condition 3 covers only the first.
5. **Routine terminal operations produce no residue and no advisory.** Shipping a work unit, archiving it, and
   removing its worktree are ordinary success, not conditions to report. An operator who follows the lifecycle
   correctly sees a quiet session-init and is never directed to reconcile anything by hand.
6. **The locus-triggered surfaces are silent on an ordinary session.** A session entered against a repository
   whose loci are all either live or cleanly terminal renders none of the six locus-triggered conditional
   sections — not a shorter set, none. Both discriminators hold over them: a locus advisory fires on a condition
   becoming true rather than for as long as it stays true, and one naming no runnable verb is not raised.
   Demonstrated over those six together against a representative repository state, not asserted per-condition.
   The veto-participating sweep and orphan sections are held to a weaker and separately stated bar: they must not
   fire on a state this unit has made correct, which is what § Q6's repair delivers, but their triggers are
   lifecycle facts this unit does not own. A shipped work unit whose worktree still stands is not an ordinary
   session for this purpose — the lifecycle is mid-completion, and offering its teardown is the correct behavior
   § Q6 restores rather than an advisory this condition forbids. Deliberately scoped to the locus half: the
   whole-surface union is `operational-advisory-registers`' subject, and an ordinary session is not yet silent
   when this unit ships.
7. The common case does not prompt. A caller whose anchor is unverifiable, acting on a demonstrably free target,
   proceeds without an attestation that carries no information.
8. A stopped repository names which checkout stopped it and the verb that clears it, without reading source —
   **including a stop raised by a live foreign lease or lock**, which carries no diagnostic to join against and
   is today the least attributable stop despite being the most consequential. Composed from the roster the
   guidance composer already holds plus a narration-only origin list for the reasons no diagnostic backs, never
   by reshaping the stop-reason vocabulary its consumers switch on.
9. Every destructive path retains its full guard set, demonstrated rather than asserted.
10. The resolved posture has a mechanical carrier whose target set is derived, so reversing it requires an edit
    that names the boundary rather than a rewritten test.
11. Multi-session fixtures prove fault containment and unchanged exclusivity together, covering both a session
    whose anchor cannot be verified and a role whose subject has retired.
12. **Unreadable process state never resolves toward destruction.** A reader that cannot observe another process
    reaches `unknown`, never `dead`, on every path that consults liveness — including the record lock's
    stale-break, where the current mapping lets a sandboxed reader delete a live lock and admit a second
    concurrent mutator. Demonstrated by a fixture whose process table is unreadable and whose live lock survives
    intact, not by asserting the mapping was corrected. Added by the proportionality audit; condition 9 covers
    guard sets that exist, and this covers a guard that inverts.
13. **An unprovable identity never establishes ownership on a path that ends a claim.** A session whose identity
    cannot be substantiated may keep its claim alive, and must route to operator attestation to release, close, or
    remove it — never proceed on a match that every session in the same environment would also satisfy.
    Demonstrated by a fixture in which two distinct sessions present identically unverifiable identities and the
    second is refused the first's exit while retaining its own. Condition 9 covers guard sets that exist and
    condition 12 a guard that inverts; this covers a nominally two-factor guard that collapses to one factor
    exactly when identity is unprovable.
14. **Compaction recovery survives an unrelated degraded checkout, and never misnames one.** A session recovering
    from compaction against a healthy locus completes while another checkout in the repository carries residue, a
    dead lease, or an unknown one. Where a recovery genuinely cannot proceed, it reports the same verdict
    session-init reports, naming the checkout actually responsible, rather than raising an error attributed to
    the recovering session's own locus. Condition 1 covers recovery of a healthy work unit at session entry; this
    covers the compaction path, which fails harder — it throws rather than degrading — and reaches the operator
    when they have the least context to diagnose it.

## Continuity

**Readiness: `maturing`, at the boundary and not yet through it.** Every design question the draft opened is
settled — the reversal's own mechanism, containment including the target-less read and the stop-versus-proposal
split, Q2 and Q3 by ownership and by tier, Q4 by consequence, and Q5/Q6 by the retired-subject state and its
exits. The proportionality audit has run, three sibling boundaries are drawn against what the tree contains, and
the reversal ADR is authored.

**Assessed against the formalization bar, 2026-08-05.** All three criteria clear on the current read: fourteen
success conditions state observable outcomes, no inbound buffer is pending, and what remains are implementation
choices two competent engineers would each make locally. **That read is not yet trustworthy, and the reason is
recorded rather than argued away.** Each of the last three adversarial passes overturned a verdict the draft had
already recorded as settled, and the third overturned the largest one. This pass's changes are also the most
extensive since the reversal — a new scope item, a fourth deliverable, a new named seam, and amendments to four
success conditions. A draft that has been wrong about its own readiness three times running should be attacked
once more before it crosses, and the changes that would be attacked are exactly the ones no pass has seen.

One thing the spec must record rather than re-derive is the lifecycle port's failure policy — an unreadable
lifecycle scan resolves to unresolved, never to retired, since inventing a retirement is the one direction that
authorizes cleanup (§ Q6, closing note).

**Resolved this pass:**

- Containment's four sites, the unnamed relation behind them, and the two-direction predicate are settled, and
  containment stands independent of attribution.
- The earlier restoration thesis is withdrawn. The specification scopes never-hard-refuse to warm and WU entry,
  places unverifiable readings in the `authority` tier with operator attestation as their exit, and names the WU
  leaseless degradation a bounded exception rather than a pattern to propagate.
- Recovering the pre-emergency implementation would restore residue-on-open, not operability — the trust and
  frame substrate treats an unverifiable anchor as untrusted by construction.
- A leaseless transient role has no exit today; the lease is the generation token every exit binds to.
- Attribution's cost was materially understated; it is now conditionally scoped and separately justified.
- The site count is ten plus one degradation, not nine, and they are not uniformly unconditional.
- The false-`self` hazard is genuine at two of seven comparisons, not all seven.

**Folded in from live observation, 2026-08-05** — evidence from operating the system rather than reading it, so it
carries none of the selective-quotation risk the two adversarial passes exposed:

- Orderly retirement reaches the same terminal gap as identity failure, with every anchor verifiable. Success
  conditions 4 and 5 are new and cover it; the problem framing now states the symptom.
- Leaselessness is the ordinary state of a WU role, not a degraded one — six of six records observed at
  `lease: null`. Option (b)'s exit-path debt is therefore already outstanding, which reprices the ballot in a
  direction this draft's evidence does not settle.
- Two current readers disagree about one checkout's occupancy, with the stricter gating the offer and the looser
  gating the act (Q5). Distinct from Q3: no version skew is involved.
- Scope calls deliberately left open rather than assumed: Q6's frame-versus-verb boundary against
  `locus-generation-binding`, and whether the reap-gate fix rides this unit or an Errand.

**Resolved by the proportionality audit, 2026-08-05** — source-grounded against consumers rather than against the
spec's description of them:

- The audit cut nothing. All four mechanisms the spec deliberately retained still earn their keep, and the
  complete-basis identity transaction is _more_ load-bearing after Q1's reversal than before it, since the
  identity record is now the sole authority for "parked or abandoned."
- The platform-inspector premise was wrong: anchor selection and anchor verification are two independent
  boundaries, and both retain consumers the reversal never reaches.
- The fail-toward-`dead` verdict reaches the record lock's stale-break, so a sandboxed reader can delete a live
  lock. Promoted from a bundled fix to a scoped item with its own success condition (12).
- Q5 folds into Q6: the two occupancy predicates ask different questions rather than disagreeing about one, and
  the missing retired state is the single root cause.
- Q3 narrows twice — already relevance-contained, and the evidence distinguishing a stale reader from an
  unidentifiable record is already returned and unconsumed.
- `classifyLeaseAuthority` has no production consumer; retained on the maintainer's call as the post-reversal
  authority vocabulary, with a decision point at spec authoring rather than an open-ended reprieve.
- The advisory counts re-verified exactly: 31 conditional sections, 3 rate-limited.

**Audit coverage, stated rather than implied:** three of the spec's four retained mechanisms were assessed —
platform inspectors, staged provisioning receipts, and the complete-basis identity transaction — plus the husk
stamp's evidence payload, which the spec's list does not name. **Record-scoped locks with stale-break was not
assessed**, which matters more than an ordinary gap: it is where the fail-toward-`dead` defect lives, so the one
mechanism the audit skipped is the one separately shown to carry a live destructive fault. Whether the lock
_earns its keep_ is not in doubt; whether its stale-break is right-sized was never asked. D8 was read whole this
pass, so it is safe to quote; D1–D3, D5–D7, and D9–D12 have still not been, and the handoff caveat about selective
quotation stands for that range.

**Resolved by the Q6 trace, 2026-08-05** — every hop reproduced against source, and the two findings that changed
the shape were both invisible to the framing that preceded them:

- Q6 decomposes into two states with different mechanics, and the observed symptom has a single four-hop cause
  ending in the sweep's own veto.
- `arc teardown` already clears the locus record under lock with exact-generation matching, so the ordinary
  lifecycle needs no new verb — which is what made the boundary move affordable rather than merely preferable.
- The veto was manufacturing the orphan class it appeared to be reporting; removing the cause shrinks the
  residual obligation rather than only relabelling it.
- The sweep's branched arm offers raw `git worktree remove` for a shipped WU, orphaning the record a second way,
  independent of the veto. Not previously in the draft at all; found only by tracing past the point the veto
  lifts.
- The retired fact is already computed by the lifecycle index and sits behind a module boundary the reader cannot
  cross directly, which is what selects a port over an import.
- The boundary with `locus-generation-binding` moved on evidence: the driver its charter assumed is not in the
  tree, so deferring meant deferring authorship rather than adoption.

**Adversarial review:** three passes run at the readiness boundary. Pass one returned seven findings (two
`blocker`, three `major`, two `minor`); pass two six (three `blocker`, one `major`, two `minor`); pass three ten
(two `blocker`, five `major`, three `minor`). Every finding across all three was verified against source and
confirmed; none was manufactured. Pass one withdrew the restoration thesis. Pass two found the replacement
question posed at the wrong altitude, refuted the option the draft was steering toward, and showed a part declared
settled still held an open decision. Pass three found that the reversal had closed the _reason_ for the central
question without authoring the replacement state — one root cause behind both blockers and the residue
contradiction — and that the reversal had reached neither § Scope nor any deliverable.

The passes converged rather than churned: each located the question more precisely than the last. What shrank was
the speculative work — attribution dropped, one storage option refuted, one register vocabulary handed to its
owner. What grew was the concrete work, and it grew because each pass found a decision the previous framing had
hidden rather than because scope crept.

**Resolved this pass, 2026-08-05** — the advisory questions turned out to be one question about ownership rather
than two about design:

- Q2 and the advisory budget resolve together at the boundary with `operational-advisory-registers`, which
  declares this exact scope and this exact composition in its own draft. The union, the register vocabulary, and
  the cadence mechanism stay there; the discriminator and its two supporting cuts are contributed forward as
  recorded input.
- The union is not reachable from here on evidence, not preference: ten of the 31 conditional sections are
  locus-owned and twenty-one are not, and the one advisory an observed healthy session rendered came from the
  non-locus half. Success Condition 6 narrowed accordingly, and the residual cost — an ordinary session is still
  not silent when this unit ships — is written down rather than absorbed.
- Two register vocabularies are already minted independently in-tree (`BaseDriftRegister`,
  `notesDriftSurface.register`), so a locus-local third would extend the defect rather than resolve it. That fact
  travels to the register unit, whose three-register direction is a reconciliation rather than an introduction.
- Q3 keeps its `hard` tier by the tier's own definition — no attestation makes an unparseable record identifiable
  — and reduces to one dropped evidence field plus a verb, which lands in Design center 3 rather than in the stop
  vocabulary. Carried as a typed `schemaVersion` field so freshness policy can consume it without parsing prose.

**Settled in the closing pass, 2026-08-05** — both remaining gaps closed against source, and each turned out to
carry a behavior the framing that preceded it could not see:

- Containment needed no special rule for a target-less read. A read that names no target still has a frame, and
  that frame is its relevance — so the settlement was to apply the existing relation at the sites that skip it,
  not to invent semantics for its empty case.
- Separating blocking from discovery exposed a third fault at the same site: a second piece of abandoned work
  currently converts the offer into a stop, denying the operator the choice precisely because there is more than
  one thing to choose between. More residue must produce more offers.
- Q4 was not moot. Q1 removed liveness detection while these sites assert ownership, and an unprovable identity
  currently answers that assertion affirmatively — the private half of a two-factor proof stops varying exactly
  when identity cannot be established, collapsing it to a published identifier. That is the withdrawn fourth
  option's defect reached by accident, under conditions Q1 established as ordinary.
- Its resolution splits by consequence rather than by precondition: keeping a claim alive proceeds, ending one
  routes to operator attestation. Hardening the frequent, harmless path would have minted the always-granted
  confirmation Q1 rejected.

**Settled after pass three, 2026-08-05** — one root cause behind both blockers, and four independent repairs:

- The reversal now has a mechanism. Withdrawing the premise removed the reason to consult the anchor; it did not
  say what a transient records or what frame that record derives, and current selection still matched anchors
  structurally, so a session that could not prove its identity could never claim its own row. Transients mint no
  lease, the role is the occupancy record, and current resolution reads role and checkout.
- That reversed this pass's own plural-residue settlement: with no transient lease, every live transient would
  match the residue filter, so the arm is removed rather than widened. Abandoned-transient discovery moves to the
  staleness advisory the reversal already promised.
- The reversal reached neither § Scope nor any deliverable — it is now scope item 1 and deliverable R, carrying
  Success Conditions 3, 7, and 10, and a named seam records that R and A share the recovery derivation and must
  sequence.
- The identity-record authority was stated universally and holds only under full protection; partial mode has no
  identity record, needs none, and is answered by role presence at contention.
- The diagnosability claim was true only for reasons a diagnostic backs. A live foreign lease has none, so the
  most consequential stop was the least attributable — repaired with a narration-only origin list rather than by
  reopening the refuted attribution.
- Containment governs stops, not the proposals the same loops emit; relevance stops being derived from those
  proposals, which removes a circularity rather than adding a filter.

**Found by operating the system, not reading it.** A fifth unscoped blocking read sits outside the locus module,
in the compaction-recovery guard, and it is the one an operator actually hits: repository-wide scan, hard throw
instead of a verdict, and a message that attributes an unrelated checkout's residue to the recovering session.
Three adversarial passes over the draft and a source-grounded audit all missed it, because every instrument
pointed at `lib/locus` and this lives in `lib/recover`. The prior handoff's note about picking the instrument
from the question holds, with a corollary this adds: a question of the form _where else does this pattern
appear_ is answered badly by reading the module the pattern was found in. Success Condition 14 is new and covers
it; scope item 2 and deliverable A carry it, with R closing the transient path through it.

**Next:** a fourth adversarial pass over the settled draft, then create-spec if it converges. The unit's shape is
stable — six scoped items over a substrate the audit found sound, four deliverables with one named seam, Q6's
exits settled, and boundaries drawn against what the tree and the sibling units actually contain.
