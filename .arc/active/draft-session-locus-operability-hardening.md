# Draft: session-locus-operability-hardening

- **Origin:** [internal] — follows the repository-wide recovery stop caused by an Errand lease minted with an
  unverifiable `/usr/bin/bash` process boundary on 2026-08-04. The immediate continuity repair is preserved by
  commit `5c6dd5c74`.
- **Purpose:** Give session-locus refusals a fault domain, so one degraded checkout stops only the commands it
  actually bears on, and make a stopped state say which locus stopped it.
- **State:** Draft — `maturing`. The containment spine is settled and the incident premise is resolved by
  reproduction; the open items are mechanism and validation rather than fundamentals, with one scope confirmation
  outstanding (Q5's provider seam).
- **Created:** 2026-08-04

---

## Problem / Motivation

The incident read as a design gap and is closer to a coupling defect. `deriveLocusReconciliation` already computes
the relation the whole subsystem needs: `lib/locus/reconciliation.ts:331-355` accumulates the record IDs, checkout
paths, and identity keys that a command's refusals may legitimately come from — built from the selected target,
adoption candidates, derived internal actions, the primary, and `current` (active, parent, session home). Those are
the relationships that make a degraded locus authoritative for a command.

That accumulation is local `const`s inside one function. It is never named, never exported, and never reused, so
every other aggregation over the roster re-decides the question by omission:

- `lib/locus/state.ts:131` — `deriveRecovery` stops when **any** managed row anywhere carries an unknown lease. No
  relevance test. This is the incident: one degraded checkout halts recovery for every healthy work unit.
- `lib/locus/state.ts:147` — two unrelated residual transients anywhere produce a `role-conflict` stop, likewise
  untested for relevance.
- `lib/locus/reconciliation.ts:367` — a `duplicate-locus` row anywhere pushes a stop, sitting outside the relevance
  loop in the same function that built the relevance sets.
- `lib/locus/reconciliation.ts:273,357` — `derivationStops` accumulates `lease-unknown` / `lock-unknown` /
  `record-malformed` over every stale record and lock in the repository, then joins `stopReasons` ahead of the
  filtered loop. Reconciliation's own scoping has a hole.

Four aggregation sites, one adequate predicate, zero sharing. The defect is not that the fault domain was never
conceived; it is that it was written once as an implementation detail rather than as an authority, so nothing
carried it and nothing could fail when a new aggregation skipped it.

A second incident, routed in from a sibling session, is the same amplifier reached by a different cause. A
behind-base checkout read a valid v3 Errand identity through a legacy branch-local probe that accepted only v1/v2
records and reported it as malformed, while the authoritative reader resolved the same identity correctly — and
that degraded interpretation blocked unrelated healthy work. `beaf5b26f` fixed the concrete reader by removing the
legacy identity readers, so what carries forward is the doctrine rather than the code: a stale reader must not
mislabel a newer valid generation as corruption, and its confusion must not escape its own locus. Two incidents,
unrelated causes, identical shape — the amplifier is the thing worth fixing.

The second half is diagnosability. `lib/locus/session-guidance.ts:102` composes the operator's entire view of a
stopped repository as `` `Session locus recovery is stopped (${recovery.reasons.join(", ")})` `` — a comma-joined
list of bare reason strings. `LocusStopReason` is a plain string union, so a refusal carries no record, no checkout,
and no path to the verb that would clear it. That is why the incident cost a day rather than a turn, and it is also
the mechanical reason the four sites above cannot be filtered as they stand: there is nothing on a reason to test.

## Design center

**One typed fault-domain authority, plus attribution on every refusal.** The two compose: attribution supplies the
evidence a relation test needs, and the authority is the single place that test lives.

- **The authority (B).** Extract the `reconciliation.ts:331-355` accumulation into a named, typed fault domain
  computed once per read and consumed by every stop aggregation. `lib/locus/stop-tier.ts` already demonstrates the
  enforcement shape: an exhaustive `Record` over the reason vocabulary that fails to compile until a new member is
  classified. The durable fix is the same trick applied to aggregation sites — a new site cannot compile until it
  declares the domain it aggregates over. Naming the predicate fixes today's four sites; making it unskippable is
  what keeps the fifth from repeating the defect.
- **The attribution (C).** Every stop reason carries the locus it came from — a record ID and checkout path rather
  than a bare enum member. This is a shape change on `LocusStopReason[]` across the published slots
  (`current.reasons`, `primaryAvailability.reasons`, `recovery.reasons`, `reconciliation.reasons`) and on every
  producer in the lib.
- **Attribution has a second axis: the reader.** A stop reason answers _which locus_ and also _who says so_.
  "I cannot parse these bytes" and "I am too old to parse this generation" are different facts with different
  remedies, and only the second is cured by freshening the reader. `record-malformed` and `unsupported-version`
  already exist as distinct members of the vocabulary, so the gap is producers choosing between them, not the
  vocabulary itself — and every producer is already in scope for attribution.

**The predicate reads in two directions, and both are load-bearing.** Containment — an unrelated degraded row must
not stop me. Authority — an unrelated degraded row is not mine to act on either. Same set, opposite direction. The
second is what keeps containment from opening a concurrency hole: the fix must not create a path by which a session
acts on a locus it merely happens to be able to see. `stop-tier.ts`'s existing tier axis (who may act past a
refusal) and this locus axis (whose refusal it is) stay orthogonal and compose; they are not merged.

**Self-healing horizon.** `heartbeatAt` is written at every mint, attach, and refresh (`lib/locus/mutation.ts:154`,
`:197`, `:235`) and read by nothing — no consumer compares it to the present. A stranded unknown lease therefore
never ages out and requires an operator verb forever. A staleness horizon closes that, but a horizon comparing a
recorded timestamp against local `now` is a cross-machine clock dependency (see Q2).

**Diagnosability follows from attribution.** With a locus on every reason, the guidance composer can name the
degraded checkout, its subject, and the exact verb that clears it, instead of joining enum members. The composer is
the only consumer of `reasons` in the codebase, so this is a contained rewrite.

## Forward-compat boundaries

Ran the four sibling check-docs. `strategy-procedure-evolution.md` and `strategy-storage-evolution.md` fire hard;
`strategy-knowledge-evolution.md` fires weakly but genuinely; `strategy-pm-composition-evolution.md` does not fire
(no PM fields, no external authority). The constraints they impose are design boundaries, not commentary:

- **The agent-facing dispatch surface does not grow.** Procedure-evolution Principle 1's anti-pattern is prose that
  evaluates state. The tempting shape here is a session-init step reading "if the stop concerns an unrelated row,
  proceed anyway" — that is the anti-pattern exactly. `recovery.kind` stays the agent's only dispatch input and
  simply becomes correct. This is satisfied structurally rather than by discipline: `session-init.md` and
  `probe-envelope.md` contain no reference to `reasons` at all, so the entire attribution change is invisible to
  workflow prose.
- **Net line pressure on `session-init.md` is neutral or negative.** Knowledge-evolution Principle 10 — session-init
  is the largest always-loaded surface, and a correct fault domain should let the repository-wide stop path shrink
  rather than gain a qualifier.
- **Emitted text stays precomposed CLI-side** (procedure-evolution Principle 6), and any new surface fits the
  existing step vocabulary — a non-gating advisory is a `note`, the residue path stays `fragment` + `offer`. If the
  design wants an eighth step type, that is a signal the design is wrong. Fixture:
  `draft-composable-workflows.md` D3.
- **The predicate keys on record identity and checkout path, never on branch shape** (storage-evolution
  Principle 5). The existing accumulation already honors this; the extracted authority carries it as a type
  constraint rather than a convention.
- **No new configuration axis** (storage-evolution Principle 9). Correct fault scope is a fact, not a preference;
  a strictness knob would be an axis for something that has one right answer.
- **Enforce, don't document** (knowledge-evolution Principle 1). "No attestation can take over a verifiably foreign
  live lease" is enforced in `lib/locus/resolve-driver.ts` and stays there. An agent needs no prose for a rule it
  structurally cannot violate.
- **Published slots change in place.** `DEV-RULES.PROJECT` § Engineering Standards, pre-public-release posture: no
  compatibility alias, no migration reader, no dual shape.

## Scope

**In:** the fault-domain authority and its enforcement mechanism; attribution on every stop reason and every
producer, across both axes (which locus, and which reader); the four aggregation sites above; the staleness
horizon; the guidance-composer rewrite that consumes attribution; session-identity recognition and its failure
mode, including the harness-identity provider seam if Q5's leaning is confirmed.

**Out:** cross-machine arbitration and backend storage evolution, unless Q2 cannot be settled without them.

### Boundary with `locus-generation-binding`

**This work owns where a stop reason comes from and whether it applies to you. `locus-generation-binding` owns what
authority a mutation carries and who invokes it.**

The `derivationStops` hole sits in the loops that derive `reap-stale-record` and `break-dead-lock` — the two actions
that draft names as lacking an owning verb — so the sites are adjacent. They do not overlap: that work rewrites what
the loops derive and who invokes the result; this work changes what their refusals carry. Attribution is what
settles the boundary rather than the filter. A stop reason with no locus is exactly the shape this work exists to
remove, so an unattributed producer cannot survive the change regardless of who owns the surrounding logic — the
hole would be visible in the type.

Two further reasons the split falls this way: `locus-generation-binding` is provisional, `P2`, `Light`, and depends
on `claimed-sweep-verbs`, which has not landed — routing a live repository-wide-stop path there defers it behind an
unlanded dependency and a grooming pass. And shipping "every aggregation filters through one authority" with a
known unfiltered path is an incoherent deliverable a reviewer would find.

The audit this work performs narrows accordingly: producers of **stop reasons**, not every lease producer. The
broader continuity audit across attach, provisioning, promotion, and marker authority is
`locus-generation-binding`'s.

### Boundary with `staleness-guard-policy`

That work owns which stale development commands may mutate state, and has already absorbed this omission — its
inbound buffer carries the 2026-08-04 entry. Worth recording for it: `lib/handoff-critical.ts:38-62` is a
default-allow allowlist, so `locus attach` / `resolve` / `release` and `errand materialize` / `leave` / `abandon`
sit outside the hard-fail set today, and every future mutator will too. The enumeration gap is a symptom; the
default is the defect.

## Resolved design questions (formerly open)

**Q1 — Was ancestry ever the live defect? Yes, but not as the stub framed it. Settled by reproduction
2026-08-04.** Against current source and a freshly built CLI, in an ordinary harness session, every `arc`
invocation produces `Unrecognized process boundary: /usr/bin/bash` and refuses with `lease-unknown`. The
`staleness-guard-policy` inbound entry's claim that this failed reproduction does not hold today.

The cause is neither ancestry inference generally nor the npm-to-`dash` chain, both of which behave correctly —
the `node` → `npm exec` → `dash -c` → `npx` wrappers are all recognized and skipped as intended. It is
`isAgentSnapshotShell` (`lib/locus/process-inspector.ts:286-287`), which requires every command between the
shell-snapshot `source` and the `eval` to be `true` or `shopt`. The harness's tool-shell preamble now carries a
brace group between them — `{ \builtin unalias -- 'unsetenv'; \builtin unset -f -- 'unsetenv'; } >/dev/null 2>&1
|| true` — whose tokens are outside that allowlist. Isolating the preamble against the real exported selector
confirms the brace group is the sole discriminator: identical chains with it fail and without it resolve to
`selector=claude`.

So the defect class is **external coupling, not inference**. Session identity depends on the byte-level shape of a
vendor's shell prologue, versioned independently of ARC and under no contract. It will break again on any harness
preamble change, in any of the three recognized harnesses.

Three consequences for this work:

- **Durable session capability, as the stub framed it, is not motivated by this evidence.** Ancestry walks fine.
  The heaviest candidate item leaves scope, and `Class` does not ratchet on it. What replaces it is smaller and
  differently shaped (Q5).
- **Containment is vindicated as the spine.** The recognizer will break again; the property that makes that
  survivable is that a broken recognizer costs one refusal on one command rather than a repository-wide stop.
  This is the strongest available argument for the fault domain being this work's center.
- **The condition is live now.** The `5c6dd5c74` guards sit on `arc errand open` and `arc locus attach`, which
  refuse rather than mint an unverifiable lease — correct fail-closed behavior, and it means those paths do not
  currently function in this environment. Remediation timing is a separate call from this design.

## Open questions

**Q5 — What identifies a harness session, if not vendor preamble text?** Leaning: **invert inference into
declaration, behind one harness-identity provider.** Confirm the scope before building.

Today ARC _infers_ session identity by reading a vendor's process text, so an unrecognized preamble means no
identity at all. A `SessionStart`-class hook runs inside the harness's own context and can record the session
authoritatively once, after which every `arc` invocation reads a recorded identity instead of re-deriving one. The
surface already exists — `system/.internal/harness-hooks/` ships a session-start hook plus per-harness wiring for
the harnesses the recognizer already names. Under declaration, a changed preamble means nothing, because nothing
parses it.

Full decoupling is not available and should not be claimed: identifying a harness requires knowing something
about it. What is available is coupling to a harness's **contract** (a documented hook) rather than its
**internals** (undocumented shell text) — hook contracts are versioned and announced; shell prologues are not.

**The provider seam is justified by fan-in, not aesthetics.** Harness knowledge is already spread across at least
three surfaces that do not know about each other: the recognizer's hardcoded executable names and preamble shape
in `lib/locus/process-inspector.ts`; the per-harness hook wiring under `system/.internal/harness-hooks/`; and the
`ARC_HOOK_HARNESS` environment signal. Three consumers already exist, so knowledge-evolution Principle 6's
extract-on-fan-in bar is met rather than anticipated — and that scatter is what let recognition drift out of step
with the hook layer in the first place. One provider per harness declares what ARC needs (how its process is
recognized, whether it can declare a session, what it writes), and a resolution order of **declared → recognized →
unverifiable** replaces the current all-or-nothing walk.

Design boundaries for that seam:

- The registry is **internal and closed**, never a configuration axis (storage-evolution Principle 9). Projects do
  not register harnesses.
- A declared session-identity record is **machine-local, session-scoped, and never syncs** — operational state, not
  machinery, and storage-agnostic per storage-evolution Principle 2. Being inherently same-machine, it also
  reinforces Q2's horizon scoping rather than complicating it.
- Any typed provider shape derives from the shared schema kernel rather than a hand-written second copy
  (procedure-evolution Principle 4).
- Scope stays the **identity** seam. Hook installation wiring stays where it lives; the provider becomes the one
  place a harness is named, not a general harness-plugin architecture.
- The inference walk survives as the **degraded** path for unhooked environments, and its failures are scoped by
  the fault domain rather than global. Narrowing the preamble contract to the two load-bearing facts — a snapshot
  `source` and an `eval` payload naming `arc` — is the cheap improvement to that path and may be all it needs.

Unverified: whether a session-start hook fires early enough in every supported harness, and whether the recorded
process is verifiable by later invocations the way the current anchor is. The mechanism looks right; it has not
been tested.

**Q6 — Is `unsupported-version` the right tier when the reader is the stale party?** It sits at `hard` in
`lib/locus/stop-tier.ts`, which is correct when a record genuinely cannot be identified. A current record read by
an out-of-date checkout is a different situation: the record is fine, the reader is behind, and the remedy is
freshening the reader rather than operator attestation. Whether that stays `hard` with a fault-domain scope and a
freshness remedy, or earns different treatment, is open. If containing it turns out to need base or source
freshness policy rather than locus authority, it belongs to `staleness-guard-policy` — route explicitly rather
than assume.

**Q2 — Can the staleness horizon avoid a cross-machine clock dependency?** Storage-evolution tiers 2–3 put the
record store on a shared remote, so a horizon comparing `heartbeatAt` to local `now` crosses machines. Candidate
resolution, unvalidated: `verifyProcessAnchor` (`lib/locus/process-inspector.ts:161`) already returns `unknown` on
an inspector-kind mismatch, which is a cross-machine signal available today with no clock involved. If a
foreign-machine anchor classifies as **outside the fault domain** rather than as unknown-therefore-stop, then any
time-based horizon is scoped to leases whose anchor names this machine's inspector namespace and never crosses a
boundary. Attractive because it makes one mechanism serve both halves — test it rather than adopt it.

**Q3 — What is the enforcement mechanism's exact shape?** The `stop-tier.ts` exhaustive-`Record` trick classifies a
_vocabulary_; aggregation sites are _call sites_, which a `Record` does not enumerate. Whether the unskippable form
is a required argument, a branded return type, a lint check, or something else is unsettled — and it decides whether
this work leaves behind an authority or merely a fifth copy that happens to be shared today.

**Q4 — Does the guidance composer's new output need a register?** Attribution makes "healthy here, degraded there"
expressible, but a degraded sibling is advisory while a degraded current locus gates. `operational-advisory-registers`
may own that vocabulary; check before minting a local one.

## Success conditions

Revised from the stub. Conditions 3 and 4 below carried scope that is not this work's to prove — 3 restates
`locus-generation-binding`'s contract, and 4 depends on Q1.

1. Recovery of a healthy work-unit locus remains available when an unrelated checkout carries an unknown lease.
2. The affected checkout still fails closed, and no operator confirmation can take over a verifiably foreign live
   lease. The containment direction does not weaken the authority direction.
3. Every stop reason reaching a published slot carries the locus it came from, and no producer can emit one that
   does not.
4. A stopped repository names which checkout stopped it and the verb that clears it, without the operator reading
   source.
5. A stranded unknown lease on this machine resolves without an operator verb once its horizon passes, and a
   foreign-machine lease is never aged out on local clock evidence.
6. Multi-session fixtures prove fault containment and unchanged exclusivity together, across the primary and linked
   worktrees: a healthy work unit beside unknown primary residue, affected-locus recovery, foreign-live refusal,
   command-process replacement, and exact-generation races.

## Continuity

**Readiness:** `maturing`. Scope is known; Q5's provider seam is the one scope confirmation still outstanding.

**Resolved this pass:**

- The fault domain already exists as an unnamed accumulation in one consumer; the work is to make it an authority,
  not to invent it.
- Shape is B + C composed — typed authority for the verdict, attribution for the evidence.
- The predicate reads in two directions, and the authority direction is what preserves exclusivity.
- The staleness horizon is in scope, subject to Q2.
- The `derivationStops` hole belongs here, settled on the attribution argument rather than the filter argument.
- Boundaries with `locus-generation-binding` and `staleness-guard-policy` restated as above.
- Check-doc constraints recorded as design boundaries.
- Q1 settled by reproduction: ancestry inference is sound; the defect is a vendor-preamble allowlist in
  `isAgentSnapshotShell`. Durable session capability leaves scope; recognition robustness (Q5) replaces it, and
  `Class` does not ratchet.
- The routed cross-branch version-skew incident is absorbed: same amplifier, different cause, corroborating the
  spine. It adds the reader axis to attribution and opens Q6 on the `unsupported-version` tier.
- Q5 has a leaning — declaration over inference, behind a harness-identity provider, justified by existing fan-in
  across three surfaces rather than by anticipation.

**Next:** confirm Q5's provider scope, then Q3 — the enforcement mechanism's shape, which decides whether this
leaves behind an authority or a fifth copy that happens to be shared. Then Q2's horizon validation and Q6's tier
call. A stopgap for the live anchor breakage runs as its own increment outside this loop.
