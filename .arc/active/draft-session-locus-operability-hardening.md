# Draft: session-locus-operability-hardening

- **Origin:** [internal] — follows the repository-wide recovery stop of 2026-08-04, whose immediate continuity
  repair is preserved by commit `5c6dd5c74`.
- **Purpose:** Contain locus faults to the loci they belong to, and settle what an ARC session persists when it
  cannot prove its own process identity — the state the model currently has no operable answer for.
- **State:** Draft — `rough`. Containment is settled; the central mechanism is an open four-way fork surfaced by
  adversarial review and recorded below.
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

This part needs no attribution. All four aggregations are row predicates evaluated with the row in hand
(`state.ts:131` tests `row.lease?.state`; `:147` counts rows; `reconciliation.ts:367` tests `row.kind`;
`derivationStops` runs inside loops holding `row` and `lock`), so relevance is testable directly. The obstacle at
`derivationStops` is ordering — the relevance sets consume `internalActions` produced by those same loops — which
is a hoist, not a type change.

**One decision inside this part is open: scope the stop without scoping the offer.** `state.ts:144-150` builds
`transientResidue` once and uses it twice — for the `role-conflict` stop at `:147` and for the residue **offer**
at `:148-150`. Scoping the whole filter would suppress recovery of exactly the residue the offer exists to find:
a full-protection Errand that crashes in a spawned worktree, with a cold session then booting in the primary,
yields a relevance set of the primary row alone and so `recovery: none` where today it offers resume/abandon.
That regresses this draft's own no-dead-ends condition. The relation must therefore bound which degraded rows may
**stop** a command without bounding which residue may be **surfaced** — the two have opposite failure directions.

The relation is also thinner in production than the reconciliation accumulation suggests: `reader.ts:111-119`
passes `adoptionCandidates: []` and no `selected`, and `deriveRecovery` receives no command target at all, so the
live inputs reduce to internal actions, the primary row, and `current`. What the relation means for a read with no
target is unspecified and must be settled rather than inherited.

**2. What a session persists when it cannot prove its identity — open, and this work's centre.** See Q1.

**3. Diagnosability — solved in the composer, not by attribution.** Threading an originating locus through
`LocusStopReason` was proposed to let the guidance composer name the degraded checkout and the clearing verb. The
composer can already do both. `lib/locus/roster.ts:188` promotes every per-row diagnostic — including
`lease-unknown` (`roster.ts:447`) — into the envelope-level diagnostics; `lib/locus/session-guidance.ts:59-61`
already renders each as `` `{code} at {source.kind} '{source.key}': {message}` ``; and `renderRecovery`
(`session-guidance.ts:88-101`) already joins `recovery.recordId` back to the roster and names
`--confirm-no-live-session` as the clearing verb. What remains is a stop-arm row join and a reason-to-verb map,
both local to one file.

Attribution is therefore **dropped**. Its cost was not contained — stop reasons are consumed by value identity
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

**In:** the four aggregation sites and the named relation over them; the Q1 mechanism once settled, including its
exit paths; the audit classifying every locus and Errand refusal site against the resolved posture; the
conformance carrier; boundary relocation; a permanent fixture covering a session whose anchor cannot be verified.

**Out:** cross-machine arbitration and backend storage evolution. Harness-recognition improvements beyond what
landed — recognition sharpness is not what decides operability. Stop-reason attribution, whose payoff the guidance
composer already reaches locally.

### Boundary with `locus-generation-binding`

**This work owns where a stop reason comes from, whether it applies to you, and what state an unverifiable-anchored
session occupies. `locus-generation-binding` owns what authority a mutation carries and who invokes it.**

Q1's resolution may cross that line: options (b) and (d) below both touch what generation token an exit binds to,
which is that unit's subject. If the settled answer changes the binding, sequence with it explicitly rather than
duplicating the contract. That unit is provisional, `P2`, `Light`, and depends on `claimed-sweep-verbs`, unlanded.

### Boundary with `staleness-guard-policy`

That work owns which stale development commands may mutate state; it has confirmed the split and scoped session
identity out of its spec. If containing reader-version skew needs base or source freshness policy rather than
locus authority, route it there explicitly — noting its open capture on widening detection beyond first-party
sources may be the better composition target.

## Q1 — what does a session persist when it cannot prove its own process identity?

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

## Other open questions

**Q2 — Does the guidance composer's output need a register?** A degraded sibling is advisory while a degraded
current locus gates. `operational-advisory-registers` may own that vocabulary; check before minting a local one.

**Q3 — Is `unsupported-version` the right tier when the reader is the stale party?** It sits at `hard`, correct
when a record cannot be identified. A current record read by an out-of-date checkout is different: the record is
fine, the reader is behind, and the remedy is freshening the reader.

**Q4 — Which anchor comparisons must change, and under what precondition?** Of seven raw deep-equality
comparisons, the false-`self` hazard is genuine at `mutation.ts:227` (release/heartbeat generation guard) and
`:424` (ownership assertion). At `rename-locus.ts:340` a liveness check already guarantees a process anchor; at
`promote-runtime.ts:634,647` the enclosing signatures are typed to a process anchor; `command-runtime.ts:124` and
`mutation.ts:136` are idempotency checks rather than release authority. Under option (d) these become the
mechanism rather than a precondition.

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

**Containment does not depend on attribution.** The four aggregations are row predicates; the earlier claim that
attribution was their mechanical prerequisite was wrong.

## Success conditions

1. Recovery of a healthy work-unit locus remains available when an unrelated checkout carries an unknown lease.
2. The affected checkout still fails closed, and no operator confirmation can take over a verifiably foreign live
   lease. Containment does not weaken the authority direction.
3. A session that cannot prove its process identity reaches a defined, operable state with **no dead ends**: it
   can complete or abandon its work through an in-model exit, without hand-editing the record store.
4. The common case does not prompt. A caller whose anchor is unverifiable, acting on a demonstrably free target,
   proceeds without an attestation that carries no information.
5. A stopped repository names which checkout stopped it and the verb that clears it, without reading source —
   composed from the roster the guidance composer already holds, not by reshaping the stop-reason vocabulary.
6. Every destructive path retains its full guard set, demonstrated rather than asserted.
7. The resolved posture has a mechanical carrier whose target set is derived, so reversing it requires an edit
   that names the boundary rather than a rewritten test.
8. Multi-session fixtures prove fault containment and unchanged exclusivity together, including a session whose
   anchor cannot be verified.

## Continuity

**Readiness:** `rough`. Containment is settled and well-evidenced; Q1 is open and is the work's centre.

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

**Adversarial review:** both passes run at the readiness boundary (`Class: Heavy`, cap 2 — the loop is exhausted).
Pass one returned seven findings (two `blocker`, three `major`, two `minor`); pass two returned six (three
`blocker`, one `major`, two `minor`). Every finding across both passes was verified against source and confirmed;
none was manufactured. Pass one withdrew the restoration thesis. Pass two found that the replacement question was
posed at the wrong altitude, that the option this draft steered toward rested on a refuted premise, and that the
part declared settled still contained an open decision. Both dispositions are recorded above.

The passes converged rather than churned: each located the question more precisely than the last, and the work
shrank at each step — attribution dropped, one storage option refuted, containment reduced to a single
stop-versus-offer decision. The cap is now reached with the reframed Q1 live, so the loop stops here by the
method's own rule and the question goes to the stage interlock rather than a third pass.

**Next:** settle Q1's frame-disposition ballot. It gates spec authoring and nothing downstream is stable without
it. Approach it from fresh context — two passes have shown this draft's accumulated framing to be the thing most
likely to mislead. Containment's stop-versus-offer split is the second decision; Q2 and Q3 remain local calls;
Q4 folds into whichever disposition Q1 selects.
