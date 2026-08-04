# Draft: session-locus-operability-hardening

- **Origin:** [internal] — follows the repository-wide recovery stop of 2026-08-04, whose immediate continuity
  repair is preserved by commit `5c6dd5c74`. Re-derivation during planning found the incident to be drift from a
  boundary the shipped design already specifies, not a gap in it.
- **Purpose:** Restore the proportionality boundary `spec-session-locus-model` specifies — exactness budgeted by
  consequence — and give it a mechanical representation, so the same drift cannot recur silently.
- **State:** Draft — `maturing`. The direction is restoration rather than redesign; open items are mechanism and
  one bounded spike.
- **Created:** 2026-08-04

---

## Problem / Motivation

The session-locus model specifies where refusal belongs and where it does not. The implementation has moved away
from that specification in two places, and the second move was made to compensate for the first.

**Deviation 1 — the read side stops globally.** `deriveRecovery` (`lib/locus/state.ts:131`) halts on
`managed.some(row => row.lease?.state === "unknown")`: any managed row anywhere with an unknown lease stops
recovery for every healthy work unit in the repository. Three sibling aggregations share the shape —
`lib/locus/state.ts:147` (two unrelated residual transients anywhere produce `role-conflict`),
`lib/locus/reconciliation.ts:367` (a `duplicate-locus` row anywhere, outside the relevance loop in the same
function that built the relevance sets), and `lib/locus/reconciliation.ts:273,357` (`derivationStops` accumulates
over every stale record and lock, then joins ahead of the filtered loop).

The relation these four need already exists. `reconciliation.ts:331-355` accumulates the record IDs, checkout
paths, and identity keys a command's refusals may legitimately come from — selected target, adoption candidates,
derived internal actions, primary, and `current` (active, parent, session home). It is local `const`s inside one
function: never named, never exported, never reused. The concept was written once as an implementation detail
rather than as an authority, so nothing carried it and nothing failed when the next aggregation skipped it.

**Deviation 2 — the lifecycle refuses on identity recognition.** Nine sites return `lease-unknown` from an
unconditional `anchor.kind !== "process"` check, before any state read: `errand open` (`lib/errand/open.ts:118`),
`locus attach` and the shared `prepare` path serving attach and release
(`lib/locus/command-runtime.ts:155,448`), `locus resolve` (`:370`), and `errand close`, `leave`, `promote`,
`abandon` (twice), and `partial-settle` in their respective runtimes. The specification forbids exactly this on
routine paths (below), and the effect is that any session on a harness outside the recognized set cannot run the
Errand lifecycle at all.

**Only three of the nine came from the emergency.** `5c6dd5c74` added the `open`, `attach`, and `prepare` guards
under pressure — ARC had stopped cooperating, including compaction recovery — by preventing the mint of the leases
poisoning the read side. The other six predate it. That ordering matters twice over: reverting the hotfix alone
would leave a session able to open an Errand it could not close, leave, promote, abandon, or settle, which is
worse than refusing at the door; and the hotfix is better read as making entry consistent with an existing
lifecycle posture than as introducing a new one.

**A conformant reference already exists in the tree.** `lib/work-unit/work-unit-locus.ts:261` handles an
unverifiable session anchor the way the specification describes: it proceeds when no lease is present and refuses
only an existing lease whose liveness it cannot establish. The work is therefore to propagate a posture already
implemented here, not to derive one.

**Deviation 1 is what makes deviation 2 safe to unwind.** The emergency guards exist because an unknown lease was
globally poisonous. Fixing the fault domain removes that pressure, which is why containment sequences first.

**A second incident, routed in from a sibling session, is the same amplifier by a different cause.** A
behind-base checkout read a valid v3 Errand identity through a legacy branch-local probe accepting only v1/v2
records and reported it malformed, while the authoritative reader resolved it correctly — and that degraded
interpretation blocked unrelated healthy work. `beaf5b26f` fixed the concrete reader by removing the legacy
identity readers, so what carries forward is doctrine: a stale reader must not mislabel a newer valid generation
as corruption, and its confusion must not escape its own locus.

**Diagnosability compounds both.** `lib/locus/session-guidance.ts:102` composes the operator's entire view of a
stopped repository as `` `Session locus recovery is stopped (${recovery.reasons.join(", ")})` `` — a comma-joined
list of bare enum members. `LocusStopReason` is a plain string union, so a refusal carries no record, no checkout,
and no route to the verb that clears it. That is why the incident cost a day rather than a turn, and it is also
the mechanical reason the four aggregations cannot be filtered as they stand: there is nothing on a reason to
test.

## The specified boundary

Three independent sources agree, and nothing later supersedes them — `errand-transient-lifecycle`'s spec does not
mention anchors, unverifiable state, or refusal posture at all.

**`spec-session-locus-model` § D1**, on warm entry: an interactive shell, shared host, unrecognized selector, or
unverifiable anchor gets a confirm-with-recommendation, _"never an identity-keyed refusal. Anchor recognition is
lease metadata and advisory input only; it carries no permission semantics."_ The same section provides for
recording an `unverifiable` anchor with unknown liveness when ancestry evidence is unavailable or ambiguous.

**`spec-session-locus-model` § Proportionality boundary:** _"Exactness in this design is budgeted by consequence.
Data-destroying paths — teardown, cleanup, abandonment, record reap — keep their full guard set… Routine operator
paths — entry, resume, re-entry, drain continuation — use advisory or simple-conflict semantics and never
hard-refuse on identity recognition."_

**`adr-025`**, at methodology level: concurrency is governed by _"advisory conventions plus one hard append-only
invariant — doctrine over mechanism,"_ with attention discipline expressed as _"conventions an operator applies by
judgment — not field validations a tool enforces."_

Safety is preserved by the same specification rather than in spite of it: _"A lease only vetoes cleanup. It cannot
grant deletion, branch removal, ref mutation, or remote authority."_ An unverifiable lease vetoing cleanup errs in
the conservative direction, and every destructive verb keeps its full guard set throughout.

## Why it drifted, which is the part worth fixing

The specified behavior was implemented and tested. `5c6dd5c74` deleted the test that encoded it — _"records
unavailable ancestry as an unverifiable lease anchor and continues"_, a name that is nearly a quotation of D1 —
and replaced it with its inverse.

So the failure is not that nobody knew. It is that **the boundary had no mechanical representation**:

- It lives in prose, in a spec now under `completed/`. Archived specs are not read during implementation.
- Its only executable trace was a test named after a behavior. A test named after a behavior can be rewritten by
  anyone unblocking themselves, and nothing in that edit announces that a specified invariant is being reversed.
- Nothing derives the set of paths the boundary governs, so a new refusal site joins the routine set silently.

That is the same disease as the hand-maintained enumerations elsewhere in this domain — the vendor-harness
allowlist, and `lib/handoff-critical.ts`'s errand-mutator list, which drifts in both directions at once (it still
guards `errand retire` after `lib/errand/retire.ts` was removed, while `leave`, `materialize`, and `abandon`
shipped without ever entering it; verified against `origin/main`). The remedy shape is common: **derive the set,
or fail closed when it is incomplete — never hand-maintain it, and never let prose be the only carrier.**

## Design center

Four parts. The first two restore the specified behavior; the second two keep it from drifting again.

**1. One typed fault-domain authority, plus attribution on every refusal.** Extract the
`reconciliation.ts:331-355` accumulation into a named, typed fault domain computed once per read and consumed by
every stop aggregation. Attribution is its companion: every stop reason carries the locus it came from — a record
ID and checkout path rather than a bare enum member — because a relation test needs something to test. This is a
shape change on `LocusStopReason[]` across the published slots (`current.reasons`, `primaryAvailability.reasons`,
`recovery.reasons`, `reconciliation.reasons`) and on every producer.

Attribution carries a second axis: the **reader**. "I cannot parse these bytes" and "I am too old to parse this
generation" are different facts with different remedies, and only the second is cured by freshening the reader.
`record-malformed` and `unsupported-version` already exist as distinct members, so the gap is producers choosing
between them.

**The predicate reads in two directions, and both are load-bearing.** Containment — an unrelated degraded row must
not stop me. Authority — an unrelated degraded row is not mine to act on either. The second is what keeps
containment from opening a concurrency hole.

**2. Bring the lifecycle verbs into conformance.** All nine identity-keyed refusals record an unverifiable anchor
and continue with an advisory, per D1, following the posture `work-unit-locus.ts:261` already implements: proceed
when no lease is present; refuse only an existing lease whose liveness cannot be established. The three
hotfix-added guards recover their prior implementation and test from `5c6dd5c74^`; the six older ones are
converted against the reference. This unblocks every harness at once — no allowlist, no declaration channel, no
new mechanism — and it is safe only once part 1 lands.

The audit is part of this, not adjacent to it: the nine were found by sweep rather than by knowing where to look,
so every locus and Errand refusal site is classified routine-or-destructive against the boundary and reconciled.
Two of the nine are **dual** rather than routine — `locus resolve` and the shared partial-Errand settlement path
each take a `close|resume` / `abandon` action and guard ahead of the branch. Their guards move inside the
destructive arm rather than disappearing.

**This part carries a required ordering.** Seven sites compare a recorded lease anchor to the entering anchor with
raw deep equality rather than the canonical self-test: `lib/locus/mutation.ts:136,227,424`,
`lib/errand/promote-runtime.ts:634,647`, `lib/locus/command-runtime.ts:124`, and
`lib/work-unit/rename-locus.ts:340`. Under the narrowed type they are sound. Under the widened one they are not:
two different sessions that both failed ancestry with the same `reason` string compare equal, producing a false
`self` — the asymmetric error the design singles out, because a false `self` releases a lease genuinely held by
someone else and does not recover. Route all seven through `sameProcessAnchor` (which returns false unless both
sides are process anchors) **before** widening any helper, and drop the entry guards last. The reverse order opens
a concurrency hole while appearing to restore specified behavior.

**3. The signature is the consequence-class declaration; a conformance suite derives from it.** No new vocabulary
is needed, because the class is already encoded in the anchor type a helper demands: `LocusProcessAnchor` declares
_destructive — verification required_, and `LocusAnchor` declares _routine — degrades on an unverifiable anchor_.
That is what makes the nine refusals type-driven rather than nine independent policy calls: downstream helpers
demand the narrowed type, so every entry point must narrow, and narrowing can only be expressed as a refusal.
Correcting which helpers demand which retires the refusals as unnecessary rather than forbidding them.

The class being derivable from the type also satisfies the derive-don't-hand-maintain bar by construction, and it
explains the drift exactly: the class was always encoded, merely assigned wrongly, and nothing checked the
assignment against the boundary. The missing piece is only the anti-drift carrier — a conformance suite asserting
that every routine verb succeeds under an unverifiable anchor, with its target set **derived** rather than
hand-listed, so a new verb arrives untested and fails instead of joining the routine set silently.

**4. Relocate the boundary to where it fires.** The proportionality rule belongs on the surface implementers
touch, not solely in an archived spec — the locus module's own doc surface, or a rules surface, per the
place-constraints-where-their-operation-fires principle. Containment and conformance both fail to help a reader
who never learns the rule exists.

**Diagnosability follows from attribution.** With a locus on every reason, the guidance composer can name the
degraded checkout, its subject, and the verb that clears it. The composer is the only consumer of `reasons` in the
codebase, so this is a contained rewrite.

## Forward-compat boundaries

`strategy-procedure-evolution` and `strategy-storage-evolution` fire hard; `strategy-knowledge-evolution` fires
weakly but genuinely; `strategy-pm-composition-evolution` does not fire.

- **The agent-facing dispatch surface does not grow.** The tempting shape is a session-init step reading "if the
  stop concerns an unrelated row, proceed anyway" — that is prose evaluating state, the named anti-pattern.
  `recovery.kind` stays the agent's only dispatch input and simply becomes correct. This is satisfied
  structurally: `session-init.md` and `probe-envelope.md` contain no reference to `reasons`, so the whole
  attribution change is invisible to workflow prose.
- **Net line pressure on `session-init.md` is neutral or negative.** It is the largest always-loaded surface, and
  a correct fault domain should let the repository-wide stop path shrink rather than gain a qualifier.
- **Emitted text stays precomposed CLI-side**, and any new surface fits the existing step vocabulary — a
  non-gating advisory is a `note`, the residue path stays `fragment` + `offer`. Wanting an eighth step type would
  signal the design is wrong.
- **The predicate keys on record identity and checkout path, never branch shape.**
- **No new configuration axis.** Correct fault scope is a fact, not a preference; a strictness knob would be an
  axis for something with one right answer.
- **Enforce, don't document.** "No attestation can take over a verifiably foreign live lease" is enforced in
  `lib/locus/resolve-driver.ts` and stays there.
- **Published slots change in place** — pre-public-release posture: no compatibility alias, no migration reader.

## Scope

**Minimal** (closes the incident): parts 1 and 2 — fault domain, attribution, entry-posture restoration.

**Complete** (stops the recurrence): parts 3 and 4 additionally, plus the deviation audit and the fixtures below.
Taken, because the recurrence is the actual complaint.

**In:** the four aggregation sites; attribution across both axes; the guidance-composer rewrite; entry-posture
restoration; consequence-class declarations and the derived conformance suite; boundary relocation; a systematic
audit classifying every locus refusal site as routine or destructive against the boundary; a permanent
unrecognized-harness fixture walking the full lifecycle; the degraded-anchor lifecycle spike below.

**Out:** cross-machine arbitration and backend storage evolution. Harness recognition improvements beyond what
already landed — once recognition carries no permission semantics, sharpening it is optional polish.

### Boundary with `locus-generation-binding`

**This work owns where a stop reason comes from, whether it applies to you, and whether a routine path may refuse.
`locus-generation-binding` owns what authority a mutation carries and who invokes it.**

The `derivationStops` hole sits in the loops deriving `reap-stale-record` and `break-dead-lock` — the two actions
that draft names as lacking an owning verb — so the sites are adjacent but do not overlap: that work rewrites what
the loops derive and who invokes the result; this changes what their refusals carry. Attribution settles it: an
unattributed producer cannot survive this change regardless of who owns the surrounding logic, because the hole
would be visible in the type. `locus-generation-binding` is also provisional, `P2`, `Light`, and depends on
`claimed-sweep-verbs`, which has not landed.

### Boundary with `staleness-guard-policy`

That work owns which stale development commands may mutate state; it has confirmed the split and scoped session
identity out of its spec explicitly. If containing reader-version skew turns out to need base or source freshness
policy rather than locus authority, route it there explicitly — noting its open capture on widening detection
beyond first-party sources may be the better composition target than the guard policy itself.

## Resolved design questions (formerly open)

**Was ancestry the live defect? Yes, but not as first framed — settled by reproduction, 2026-08-04.** Against
current source and a fresh build, every invocation in an ordinary session produced `Unrecognized process boundary:
/usr/bin/bash`. The cause was neither ancestry inference nor the npm-to-`dash` chain — both behave correctly — but
`isAgentSnapshotShell` requiring every command between the shell-snapshot `source` and the `eval` to be `true` or
`shopt`, which a harness prologue's brace group violated. Fixed on `main`. The residual lesson is that recognition
is coupled to vendor shell text, which the boundary above makes non-load-bearing rather than something to perfect.

**A staleness horizon is not available as designed, and the rejection still holds.** The spec rejects treating
heartbeat age as dead-session evidence — _"A quiet but live session can have an old heartbeat… age may explain a
prompt but cannot authorize removal"_ — with an explicit non-goal against making age a liveness or deletion
signal. The precise line survives: age may inform an advisory, never expire a lease. The stranded-lease exit is
operator attestation through `arc locus resolve`, which already exists.

**The harness-identity provider seam is dropped.** It was adopted while recognition was believed load-bearing.
Under D1 it carries no permission semantics, so a provider registry solves a problem the boundary dissolves.

**The consequence class needs no new declaration vocabulary — settled by inspection, 2026-08-04.** The persisted
schema already admits an unverifiable anchor (`LocusLeaseV1.anchor` is the union), and the reader already accepts
one as its entering anchor, routing every comparison through `sameProcessAnchor`, which fails closed unless both
sides are process anchors. So neither storage nor the read path blocks the specified posture. What produces the
refusals is the anchor type demanded by downstream runtime helpers, which means the class is already declared in
the signature and merely assigned wrongly in places. The routine/destructive split follows the design's own list:
teardown, cleanup, abandonment, and record reap keep verification; entry, resume, re-entry, and continuation do
not. `abandon` therefore keeps its guards; `locus resolve` and the partial-Errand settlement path are dual and
move theirs inside the destructive arm; the rest lose theirs.

**The degraded-anchor lifecycle does not survive today, and the drift is systemic — settled by sweep,
2026-08-04.** Reads are unaffected: a session-init probe orients cleanly under an unverifiable anchor. Every
lifecycle verb refuses. Nine identity-keyed refusal sites exist, six of them predating the emergency, so
reverting the hotfix alone would strand a session mid-Errand rather than restore operability. The sweep also
found the conformant reference at `work-unit-locus.ts:261`, which converts this from deriving a posture to
propagating one. Dynamic confirmation was not pursued past the static reading: the nine are unconditional early
returns ahead of any state read, and reaching them at runtime requires valid arguments that would mutate real
state.

## Open questions

**Q1 — How does the conformance suite derive its target set?** The declaration question is settled (the signature
carries the class); this residual is how the anti-drift check finds what to check. Two candidates: enumerate verbs
from the CLI command registry, or scan for functions demanding `LocusProcessAnchor` and assert each is reachable
only from a destructive-classed verb. The second sits closer to the type-as-declaration result but likely needs a
lint rule rather than a test. Whichever is chosen must not reintroduce a hand-maintained list.

**Q2 — Does the guidance composer's new output need a register?** Attribution makes "healthy here, degraded there"
expressible, but a degraded sibling is advisory while a degraded current locus gates.
`operational-advisory-registers` may own that vocabulary; check before minting a local one.

**Q3 — Is `unsupported-version` the right tier when the reader is the stale party?** It sits at `hard`, correct
when a record cannot be identified. A current record read by an out-of-date checkout is different: the record is
fine, the reader is behind, and the remedy is freshening the reader.

## Success conditions

1. Recovery of a healthy work-unit locus remains available when an unrelated checkout carries an unknown lease.
2. The affected checkout still fails closed, and no operator confirmation can take over a verifiably foreign live
   lease. Containment does not weaken the authority direction.
3. Every stop reason reaching a published slot carries the locus it came from, and no producer can emit one that
   does not.
4. A stopped repository names which checkout stopped it and the verb that clears it, without reading source.
5. **ARC is fully operable from an unrecognized harness** — open, work, close, return, and recover, with advisory
   surfacing and no identity-keyed refusal on any routine path.
6. Every destructive path retains its full guard set, demonstrated rather than asserted.
7. Reversing the entry posture again requires editing a declaration that names the boundary; renaming or
   rewriting a test cannot do it.
8. Multi-session fixtures prove fault containment and unchanged exclusivity together across the primary and linked
   worktrees, including a harness the recognizer does not know.

## Continuity

**Readiness:** `maturing`. Direction is restoration and scope is closed; the remaining opens are local calls that
can settle at spec time.

**Resolved this pass:**

- The incident is drift from a specified boundary, not a gap in the design. Three sources concur, and nothing
  later supersedes them.
- The two deviations are causally linked: the entry refusal exists only because the read side stopped globally,
  so fixing containment is what makes restoring entry safe. Sequencing follows.
- The specified behavior was implemented and tested; `5c6dd5c74` deleted that test and inverted it. Restoration
  recovers from `5c6dd5c74^` rather than re-deriving.
- The durable problem is a boundary with no mechanical representation — prose in an archived spec, one
  rewritable test, no derived set of governed paths. Parts 3 and 4 address that; containment alone does not.
- The horizon and the provider seam are both withdrawn, each contradicted by the shipped design.
- `Class` holds at `Heavy`: scope grew in breadth but the design is now composition and restoration rather than
  invention.

- The degraded-anchor sweep changed part 2's shape: nine refusal sites rather than one hotfix to revert, six of
  them older than the emergency, plus a conformant in-tree reference to propagate. The audit moved from an
  additive nicety into the core of that part.

- The declaration mechanism is the anchor type already in each helper's signature, so no vocabulary is minted.
  The residual is only how the conformance check derives its target set.
- Widening carries a safety precondition and therefore an ordering: seven raw anchor comparisons must route
  through the canonical self-test before any helper widens, or an unverifiable caller can be mistaken for the
  lease holder.

**Next:** the draft is a suitable input for `create-spec`. Q1's derivation choice, Q2's register, and Q3's tier
call are all local decisions that settle during spec authoring rather than blocking entry to it.
