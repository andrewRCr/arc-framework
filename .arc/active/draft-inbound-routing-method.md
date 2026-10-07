# Draft: Inbound Routing Method

- **Origin:** [internal] — routed from `USER-INBOX § Backlog` at the housekeep drain (2026-06-02) as a DRY extraction
  of the drain's integration-mode fork; re-chartered at its first `draft-design` pass (2026-10-07) to own the
  dumping-ground problem diagnosed while `quality-gate-hooks` started.
- **Purpose:** Decide where a discovered concern goes — into an existing work unit, a new stub, an Errand, the inbox,
  or nowhere — by a fit test that protects a work unit's design intent from accretion, and keep routed entries honest
  after they land by re-triaging them in both directions whenever their home is touched. Codify it as one method that
  every routing door uses — the drain, the express lanes, cascade routing from a planning pass, and the owner's own
  planning pass — written against "a work unit's inbound entries", so it holds unchanged when the storage program
  replaces the draft's buffer section with a per-work-unit inbound list. It also states the Errand-versus-work-unit
  line that routing applies, as a record test the Owner decides by.

---

## Continuity

- **Readiness:** formalization-ready (2026-10-07), re-assessed at loop exit after the review loop closed: readiness
  `ready` and proportionality `proportionate` (author checks), with the post-settle coherence re-read done. Source
  grounding ran at artifact scope at the first loop exit, and every later fold was grounded at fold scope.
- **Resolved:**
    - Depth `high`; `Class` estimate `Heavy` — derivation fires, the design is composed from existing sketches rather
      than invented, and the scale trigger does not fire. Persisted at the capture commit.
    - Boundary: stays one work unit (§ Boundary fit).
    - This work unit **specifies** the post-flip mechanics and builds none of them; it carries no `Depends On` edge
      on the storage program (D8).
    - Interim back-pressure is re-triage at touch, with no CLI metric over the buffer section (D5).
    - The existing buffer entries are not swept here; the import gap goes to the storage owners, and quality is
      restored at touch (§ Specified for the flip).
    - The "stub this out" fast path stays in scope, its pre-flip vehicle included; the protected-base round trip from
      mint to start stays with `stub-mint-to-launch` (D7).
    - All five routed-in entries are dispositioned (§ Inbound dispositions).
    - The horizon test is an advisory to the Owner, never a gate (D2).
    - Re-triage: the owner's pass keeps a dispositions table; the drain offers re-triage on backlog-stub targets only,
      bounded to dismiss, Errand, re-route, and a split's residual kept in place, and records in its routing plan (D5).
    - One method, `route-discovered-work(entry, door, host?)`, returning per concern one disposition or an
      Owner-decided pair, in the method-as-function contract shape (D9).
    - Homing: shortlist, then at most three pointed reads; no bespoke scout tier (D3).
    - A derived purpose field in `arc status`, per work unit and as typed listing rows, folded in here (D11).
    - A closed seven-outcome vocabulary shared by every door (D9).
    - The fast-path door is an `arc-inbox` mode; until the flip its writes outside the session's work unit run as a
      route-only Errand (`arc-errand`'s route shape) or, deferred, a pre-routed capture (D7).
    - The `DEV-RULES.ARC` core-invariant wording (D10).
    - Priority rises from P3 to P2, written at the capture commit.
    - The disposition gate's four tests, with the no-home fall-through (D2).
    - Integration-mode defaults with the until-the-flip writer line: only a change off the base whose one concern is
      routing — the drain's or a route-only Errand's — writes another work unit's draft, and only a backlog stub's;
      every other route goes as a pre-routed capture (D4, D8).
    - The cascade rule (D6).
    - The flip rewrites this work unit's mechanics through the storage-coupling register, never through a capture to
      the cutover (§ Specified for the flip).
    - Adversarial pass 1 of 2: all fourteen findings dispositioned and folded — among them one disposition per
      concern (D9), the full gate on pre-routed captures (D7), and owner adoption for an in-flight new home (D5).
    - The Errand / work-unit line is D12's record test, folded in as a named scope expansion (§ Boundary fit).
    - Fix check round 1 over pass 1's folds: nine findings repaired — among them promotion's question-to-floor
      mapping and the retirement of the decision matrix's create rule and tracking criterion (D12).
    - Fix check round 2: ten findings repaired — among them a new ADR recording D12 and the survivor route from the
      flip (D8). Round 3 was declined in favor of pass 2.
    - Adversarial pass 2 of 2: eight findings repaired — among them route-now's pre-flip vehicle (D7, D8), the
      Errand-shaped carve-out in D10's invariant, the cascade door's caller (D9), and where D12 reaches the Owner.
    - Fix check over pass 2's folds: seven findings repaired — among them the vehicle carried into the scope boundary,
      the fallback for an outcome a door does not allow (D9), and the vehicle's partial-protection and Launch cases
      and register rewrite site (D7). A further round was declined in favor of pass 3.
    - Adversarial pass 3 (over the cap, Owner-approved): six findings repaired — among them the new ADR naming
      ADR-027's derivation test as replaced (D12), and how the route-only Errand relates to the paused
      `stub-mint-to-launch` (D7). No pass 4.
    - Fix check over pass 3's folds: five minor findings repaired — among them the named pre-flip gap for a route into
      another person's started work unit (D8), and the owner field in `arc status` (D11). The review loop closed here.
- **Open:** none.
- **Next:** the capture commit, then the draft-close captures.

## Problem / Motivation

A backlog work unit that sits for months becomes the home for anything that touches its domain. Routing to an
existing work unit avoids needless standalone stubs and Errands, but a home chosen for shared domain alone dilutes the
design intent with orthogonal concerns, and leaves the owner a planning backlog to maintain. Routing costs one write at
drain time; integrating costs the owner later. The current rules push toward routing and never back.

### Evidence

Counted at `c009ab198` (2026-10-07):

- **`quality-gate-hooks`** carried 30 routed-in entries. Its own triage (§ Buffer triage in its draft, at `2bc91c7a4`
  on `plan/quality-gate-hooks`) folded 6 into the body. It dismissed 5 as resolved elsewhere, two by Errands, two by
  `markdown-formatting`, and one by a refactor that deleted the validator. It held 5 for the storage owners, re-routed
  7 to other work units' charters, and found 7 Errand-shaped. Two of the re-routed entries had arrived after its own
  Out of scope handed content checks to `knowledge-lint`. Nine of the 30 began as `USER-INBOX § Errand` captures.
- **Backlog-wide:** 143 drafts; 86 carry a buffer, holding 509 entries (502 open, 7 marked `[x]` yet still present).
  Buffers are 10,023 lines, 45% of those drafts. In 33 the buffer is longer than the design body, in 17 at least
  twice as long; 17 hold 10 or more entries. The oldest open entry was routed 2026-06-01.
- 62 entries came from `§ Errand` or the shared inbox; 4 say they were reclassified. 27 carry a `WU_Target` naming a
  work unit other than their host (12 in `storage-seam`). 10 drafts hold the buffer at end of file.
- **Hand cleanups with no rule behind them:** `storage-seam`'s § Inbound dispositions table (2026-10-05),
  `composable-workflows`' consolidated buffer dispositions (2026-07-02), and a removed `USER-INBOX` entry that
  redistributed `operational-state-docs`' buffer.

### Mechanics today

- **One forcing point, late.** `create-spec.md` § Resolve depth & Class requires integrating the buffer before a
  spec, and `assess-draft-readiness` criterion 3 checks it. `draft-design.md` never mentions buffers, so a P3 stub
  that does not reach `create-spec` for months keeps every entry "in transit".
- **One-way re-triage.** `drain-inbox.md` § 2 Scope re-triage promotes an Errand capture to a stub when it crosses a
  wrapper floor; nothing sends an entry back out. The Home rule (existing stub, new stub, or none) has no fit
  criterion beyond domain.
- **Escalation at capture.** `arc-inbox` step 2's infra-smell note invites a second look at any Errand capture that
  "carries a design fork" or touches `.arc/system/**`. It is advisory, but the drain's re-triage then reads that
  wording as a crossed derivation floor, and an existing stub is the cheapest stub to pick.
- **Integration modes.** `drain-inbox.md` § 5 makes the buffer note the default whenever integration is costly,
  design-bearing, or foreign-owned. `run-errand.md` says nothing about routing a concern into an existing stub.
- **Structural pressure.** `DEV-RULES.ARC` § Discovered Work Routing forbids an item with a known home from resting
  in a capture surface, and "known home" is read as "a stub in the same domain". The shared inbox is held empty by
  a `WORKING-MEMORY` ban, so homeless Errand-class items can only wait as `_Hold` entries in `USER-INBOX`, the
  interim that ban names.

### Root causes

1. The home test is "same domain" only.
2. Re-triage runs one way.
3. Nothing re-checks a routed entry: no size or age signal, and resolved entries linger.
4. The costs are lopsided, and the buffer entry "always route, never re-open" pushes further toward routing.

### Why now

`storage-contract` (`spec-storage-contract.md` D11) makes routing cheaper at the flip: any session inserts straight
into a work unit's inbound list through a routing verb, and nothing routes through the owner. Without a fit test at
the routing door, the flip amplifies the bucket problem rather than relieving it.

## Direction

Each item is marked **Settled** (decided with the Owner), **Leaning** (a proposal to work through), or **Open**.

### D1 — Charter: one disposition, every destination (Settled)

Inbound routing is one concern in four steps: **disposition** (should this go into a work unit at all) → **homing**
(which one) → **integration** (woven into the body or held as an inbound entry) → **re-triage** (does each held entry
still belong). The destinations are an existing work unit, a new stub, an Errand (now or captured), an inbox capture
(judgment deferred), and dismissal. The doors are the drain, the express lanes — an Errand's route-to-home and "stub
this out" — cascade routing from a planning pass, and the owner's own planning pass. Every door runs the same
disposition; none gets a private rule.

### D2 — The disposition gate (Settled)

Applied in order at every door:

1. **Still live.** Verify against the current tree; dismiss a resolved entry and name what resolved it.
   `drain-inbox.md` § 2 already does this at capture drain; it extends to entries already sitting in a home. An entry
   found partly resolved splits (D9): the resolved part is dismissed, and the residual runs the gate on its own.
2. **Errand-shaped stays an Errand,** judged by D12's record test, which `classify-work-unit` boundary test 1 states.
   Touching load-bearing infrastructure is a review-lane signal, not a floor (`arc-inbox` step 2 already says so),
   and the drain's scope re-triage reads it the same way. If Errand-shaped, an Errand, always.
3. **Coupling test.** Route into a work unit only when the entry can name the decision or section of the target it
   shapes, recorded on the entry as `_Shapes:_`. If all it can name is shared domain, the work unit is a neighbor,
   not a home. `_Shapes:_` is already in use as a prototype on `USER-INBOX` captures.
4. **Scope-boundary check.** Never route an entry that matches the target's Out of scope / Won't Do. The coupling test
   is only as good as the target's stated scope, so this check is load-bearing rather than optional — found on this
   work unit's own buffer (§ Inbound dispositions).

Tests 1–4 pick one D1 destination, or the Owner-decided pair where the Errand line is unclear at the drain (D9). A
live, spec-worthy concern that no candidate passes tests 3 and 4 for has no home: it is a `new-stub` — at the drain a
`provisional` one unless the Owner commits at the interlock — or, on the fast path without the commitment, a
`capture`.

**The horizon advisory (Settled: advisory, never a gate).** Test 2 already sends an Errand-shaped concern to the
execute lane whatever its target's horizon, so what the horizon test was minted for is covered. What remains is a
spec-worthy entry that does shape a far-off target — provisional, or at the lowest priority (P3). Routing it there is
still right, since the design must be decided together; the failure is that the entry's urgency is lost, held where
only the owner reads it at the next pass (this work unit's own stubbing entry argued P3 → P2 from inside the buffer).
So when a coupled entry targets a provisional or P3 work unit, routing surfaces one line to the Owner: the entry will
wait for that work unit — raise its priority, or does a separable part go now? The inputs are the target's commitment
tier and lifecycle position, which `arc status <slug> --json` reports today (`state`, `position`), and its priority,
which D11's listing rows carry; `goal-aware-direction`'s Now/Next targets refine them later. A gate on that coarse
horizon proxy would refuse good routes.

### D3 — Homing (Settled)

Folds the routed-in `assess-wu-target` entry. Homing must establish, for each finalist, the decision the entry would
shape (`_Shapes:_`) and whether the entry falls in the target's out of scope — D2's bar, which no index alone can
meet, so some reading of candidate drafts is unavoidable.

1. **Shortlist** from the capture's own `WU_Target` hint and the work-unit listing, whose rows carry each candidate's
   derived purpose (D11).
2. **Validate at most three finalists by targeted reads.** Map headings first, then read only Purpose, the scope
   boundary, and the section the entry would name. `_Shapes:_` keeps this pointed: checking a claim means reading the
   section it names, not the draft (at `c009ab198`, `storage-seam`'s runs to 1,189 lines, `quality-gate-hooks`' to
   916).
3. **Delegate the reads when they would flood the primary's context** — ordinary read-only derivation under
   `DEV-RULES.ARC` § Sub-agent scope, advisory until the primary reads the named section.

The entry's second, "scout" tier — subagents per candidate draft returning a fit report, invoked when the cheap tier
is ambiguous — is dropped. It added a return schema, its own launch instructions, and a second delegation contract
beside `adversarial-review`'s, where the existing delegation rule plus the pointed read cover the need
(`assess-design-proportionality`: missed composition). Its one load-bearing output field, the candidate `_Shapes:_`,
survives as what the primary verifies. Reinstate it only if a real drain shows the targeted reads failing.

### D4 — Integration modes (Settled)

Keep the two modes and give each door a default:

- **Woven into the body** when the router owns the work unit or holds its context — the owner's own pass, and from
  the flip an Errand's route-to-home into a backlog stub, which anyone may groom.
- **Held as an inbound entry** for the drain, a route-only Errand (D7), and any foreign-owned target: how an entry
  fits is the owner's design call at its next pass.

Until the flip, a concern an Errand discovers routes as a pre-routed capture (D8's writer line), and a started work
unit takes no woven note from anyone but its owner.

An inbound entry carries its provenance (`routed from <origin>, <date>`), `_Shapes:_`, and from the flip the `_Id:_`
that routing keeps (`spec-storage-contract.md` D11). The owner-adoption hold for an in-flight target
(`drain-inbox.md` § 5) stays as today until the flip retires it.

### D5 — Two-way re-triage at touch (Settled)

Re-triage runs wherever an inbound entry is already being read, with no new fire-point and, before the flip, no
threshold over any count: a count the drain reports is shown, never compared.

**Dispositions** are D9's closed outcome vocabulary, distilled from the two hand-made precedents. In re-triage terms,
keeping an entry is `hold <host>`, folding it is `fold <host>`, and re-routing it is `hold <other>` or `new-stub`.

**The owner's planning pass** folds or dispositions every inbound entry before the draft is formalization-ready, and
may use every disposition but `hold <host>` at the pass that makes it ready, which leaves nothing held. Where that
step sits in `draft-design` is `planning-iteration-mechanics`' Concern 1; this work unit supplies the rubric it runs.
The pass leaves a compact dispositions table in the draft — one row per entry — which is what review reads for
"integrated or consciously rejected" (`create-spec.md`'s buffer hook); criterion 3 of `assess-draft-readiness` checks
only that the buffer section is gone. The table lives as long as the draft and goes with it at `create-spec`.

**The drain** re-triages a target's held entries as it routes into that target:

- **Rights.** Only targets the drain may groom: backlog stubs. Today it writes them through its grooming branch and
  leaves in-flight targets to the owner-adoption hold; from the flip, provisional and planned stubs are groomed by
  anyone while a started work unit's inbound entries are edited or removed only by its owner
  (`spec-storage-contract.md` D13, "Edit rights follow lifecycle state and kind of file"). The drain never removes an
  entry from a started work unit. This reaches the right population — the dumping grounds are backlog stubs that
  never reach a planning pass, and the drain touches them exactly when it routes something new in.
- **Trigger — an offer, never a mandate.** At the drain's confirmation interlock (`drain-inbox.md` § 3), each routed-into
  target that already holds entries gets one routing-plan line: its held count and oldest date, read while checking
  its scope for D2, and an offer to re-triage it this sweep. The Owner picks the targets. Until the flip that is
  judgment over what the drain already read; from the flip the CLI slot computes the recommendation and precomposes the
  line (§ Specified for the flip).
- **Bounded to dispositions that need no design authority:** `dismiss`, `errand`, `hold <other>`, and `new-stub` —
  D2's tests 1–4 against context the drain already holds — plus `hold <host>`, keeping the entry or a split's
  residual rewritten in place. `fold` and `reject` stay the owner's. A large set splits per `drain-inbox.md` § 4.
- **An in-flight new home.** When `hold <other>` names a started work unit, the drain cannot write its draft before
  the flip. When the drain's runner owns that target (its meta's `Owner`), the entry leaves the backlog stub's buffer
  as a `_Hold` entry in `USER-INBOX`, pre-routed to it — where `drain-inbox.md` § 5's owner-adoption path leaves an
  entry for an in-flight target. When another person owns the target, it falls in the gap D8 names: the entry stays,
  rewritten in place to name its decided target (`hold <host>`), and the routing plan names it too, until the flip.
  From the flip the routing verb inserts it into the target's inbound list, which anyone may do
  (`spec-storage-contract.md` D13).
- **Record.** What moved where goes in the drain's routing plan and grooming-PR body, never in the target's draft.
  From the flip, routing receipts record re-routes on their own (`spec-storage-contract.md` D11), leaving the owner's
  table its remaining value: fold locations and rejection reasons.

### D6 — Cascade doctrine (Settled)

The routed-in "always route, never re-open" entry and the coupling test are one rule. A cascade item is the
consequence of a settled decision for another work unit's assumptions, so it can name the decision it shapes there, and
naming it is what makes that work unit "affected". The rule: route a cascade item when it names the decision it shapes
in the affected work unit; never re-open that work unit's body mid-pass; never route on shared domain alone. The
shipped rule covers work-unit cascades; this repository's direction-level cascades keep going to its check-docs,
outside the method. Coordinate the statement with `cross-wu-coordination`.

### D7 — The "stub this out" fast path (Settled)

When the session already holds the commitment, the express lane mints a stub directly. It runs the same disposition
first: an Errand-shaped concern becomes an Errand, a concern that shapes an existing work unit's decision routes there,
and only otherwise is a stub minted. The new-stub outcome lists the judgments it may not invent — commitment, priority,
a `Class` estimate from `classify-work-unit`, a slug legible out of context, origin, and dependencies. `arc stub` sets
the slug as its name argument and the next four through `--commitment`, `--priority`, `--class`, and `--origin`; it
has no option for dependencies, which go into the minted meta's `Depends On` line. This guards the mirror failure of
the dumping ground: near-duplicate stubs.

- **The door:** a "route now" mode of `arc-inbox`, not a new skill. `arc-inbox` step 1 stops today whenever the
  concern is not "capture for later"; instead it continues into `route-discovered-work` with the fast-path door. It
  already classifies by character, and the express-lane rule makes capture versus route-now one question — does the
  session hold the commitment? The skill's description, its trigger surface, names the mode so the door is reachable;
  the naming convention stays with `skill-infrastructure-cleanup`, which owns the door model and may rename it.
- **Until the flip, a write outside the session's own work unit runs as a route-only Errand or a capture.** Writing
  into another work unit's tracked draft from this checkout would edit a sibling's artifact from the wrong branch,
  which the coordination-seam rule forbids, and minting a stub here would write a backlog meta onto this checkout's
  branch. So a `hold <other>` into a backlog stub, or a `new-stub`, that the Owner routes now runs as a route-only
  Errand: `arc-errand`'s route shape, entered after the gate, writing as the Errand's own change off the base — its
  own branch under full protection (`run-errand.md`'s planning-grooming lane), a direct base commit under partial.
  Its Launch classifies the routing change — writing an entry or minting a stub — not the concern it carries, which
  the gate has already placed, so D12's answers are not shown. Deferred, it is a `USER-INBOX` capture carrying the
  decided `WU_Target` and `_Shapes:_`; into a started work unit it is always that capture, for owner adoption (D8),
  and so it is where no Errand can open — under partial protection while the primary checkout is occupied
  (`planLocusAllocation`'s `primary-occupied` refusal). From the flip the routing verb and `arc stub` write directly,
  and the Errand drops out. `fold` into the session's own work unit and `errand` run directly either way. D8 states
  the rule for every door.
- **A pre-routed capture gets the full gate.** Every Work Unit capture carries `WU_Target`, and a cold capture may carry
  `_Shapes:_` too, so the drain cannot tell a decided route from a capture-time hint and runs the whole gate on every
  new capture (a survivor of an earlier routing follows D8's from-the-flip route). A fast-path capture's `WU_Target`
  and `_Shapes:_` are simply the first candidate it checks, and a disagreement goes into the § 3 routing plan.
- **The vehicle is decided, not deferred:** a now-route never rides the current change; before the flip it is the
  route-only Errand's own publication. Out of scope is the protected-base round trip from mint to start, which stays
  with `stub-mint-to-launch`; both dissolve at the flip (storage-coupling register rows "State writes routed by where
  they can be committed" and "`stub-mint-to-launch` solves the protected-base round trip"), and row "Hold-and-route"
  names the vehicle as a rewrite site (§ Specified for the flip). The route-only Errand's mint and publish legs match
  the first step `stub-mint-to-launch` sketches. That work unit is paused until the storage cohort ships, by the
  Owner's decision (2026-10-07), and `cohort-state-storage.md` § Cross-cohort keeps it from running alongside the seam;
  at the flip its row re-scopes the round trip away and a `new-stub` is a direct `arc stub` write. If it resumes
  before the flip, route-now's `new-stub` uses its mint-and-publish flow once that ships.

### D8 — Substrate-neutral method, two bindings (Settled)

The method ships, so it states no storage-program context. It names "a work unit's inbound entries" and "the routing
action", never the buffer section's layout, so the flip rewrites one binding surface:

- **Until the flip:** the draft's `## Inbound Buffer — Pending Integration` section, written by the drain or the owner,
  with the owner-adoption hold for in-flight targets (register row "Hold-and-route", owner `storage-seam`). The binding
  states that an owner-adoption hold whose capturer owns the target is in transit to that owner's session, not
  resting in a capture surface, which D10's sharper "home" would otherwise read as a breach of the invariant; the flip
  retires the hold, since a capture waiting for its owner "would rest in a capture surface with its home known"
  (`spec-storage-contract.md` D11). It also names a gap: before the flip nothing carries a route into another
  person's started work unit — `USER-INBOX` is personal, and `drain-inbox.md` § 2's owner adoption has the same gap
  today. Such a route waits where it is, naming its decided target — a held entry rewritten in place in its backlog
  stub (D5), a new concern as the capturer's `_Hold` capture — and the flip closes the gap, since the routing verb
  inserts directly. The store registry already lists the inbound kind without a home before the flip
  (`"work-item/inbound": entry(unhomed)` in `lib/store/registry.ts`).
- **Who writes another work unit's draft until the flip.** Only a change off the base whose one concern is that
  routing — the drain's, or a route-only Errand's (D7) — and only into a backlog stub. Every other route — a concern
  discovered during another Errand, a planning pass in another work unit's checkout, a deferred fast-path route —
  reaches another work unit only as a pre-routed `USER-INBOX` capture, which the drain re-runs through the full gate
  (D7), and a started work unit takes owner adoption, with its gap above. This is the line the routed-in threshold
  entry asked for (direct-to-buffer is a routing change off the base), and it keeps a routed concern off an unrelated
  change, which the anti-rider rule would otherwise forbid. From the flip the routing verb serves every door, and D4's
  woven default for an Errand applies to backlog stubs, which anyone may groom.
- **From the flip:** the inbound list, `inbound-<slug>.md` beside the draft, merged by entry; anyone inserts through the
  routing verb; a started work unit's entries are edited or removed only by its owner, while a backlog stub's are
  groomed by anyone (`spec-storage-contract.md` D11, D13). A survivor — an inbox entry edited after it was routed —
  is carried rather than decided: the drain takes only its new content to where its latest receipt routed it, an open
  Errand's description included, by the entry's ID (`spec-storage-contract.md` D11), with no gate to run. A note woven
  into prose keeps no ID, so its survivor routes again, as a follow-up inbound entry.

The shipped method states only today's binding, since it carries no storage-program context. The from-the-flip binding
lives here and reaches the flip through the storage-coupling register (§ Specified for the flip), never through this
work unit.

The routed-in entry asking for a direct-edit threshold on an always-loaded surface lands in the method's
until-the-flip binding instead: an always-loaded line would grow the set (`strategy-knowledge-evolution.md`
Principle 10) for a rule the flip retires.

### D9 — One method: `route-discovered-work` (Settled)

One method covers disposition, homing, integration, and re-triage, with one signature:

`route-discovered-work(entry, door, host?) → per concern, one disposition or an Owner-decided pair`

- **One concern, one outcome.** An entry carrying more than one concern — or a resolved part and a residual — splits
  by concern first, the anti-rider rule's concern-identity test (`DEV-RULES.ARC` § Anti-rider), and each part takes
  one outcome. The horizon advisory's "separable part" is such a split.
- **The one pair: the Errand line unclear at the drain.** D12 gives the drain no default there, so the result carries
  both candidates — `errand` and the work-unit outcome — with D12's four answers, and the routing plan asks the Owner
  to pick at the § 3 interlock. A single proposal would be the default D12 withholds.
- **No `host`:** a new concern runs the D2 gate, homing (D3), and integration (D4), and lands on one destination, or
  on the Owner-decided pair below.
- **With `host`:** a held entry runs the same gate against its current home as the incumbent candidate, and every
  outcome below reads naturally: staying is `hold <host>`, folding is `fold <host>`, and moving is `hold <other>`,
  `new-stub`, `errand`, or `dismiss`. Re-triage is the gate run in reverse, not a second procedure.
- **`door` bounds the outcomes** (the door list below). D5's rights rule lives here once instead of in each workflow.

**The outcome vocabulary (Settled)** — closed, defined once in the method, and used by name everywhere else:

| Outcome     | Meaning                                                |
| ----------- | ------------------------------------------------------ |
| `fold <wu>` | woven into that work unit's body                       |
| `hold <wu>` | held as an inbound entry there                         |
| `new-stub`  | a new work unit, minted through `arc stub`             |
| `errand`    | an Errand, run now or deferred by the door's own route |
| `capture`   | to the inbox, home undecided (`WU_Target: TBD`)        |
| `dismiss`   | resolved or obsolete, naming what resolved it          |
| `reject`    | declined on design grounds, with the reason            |

**The doors** and what each may choose — a closed list:

- **The drain, routing a capture:** every outcome but `reject` and `capture`; `fold` only for a trivially additive,
  on-topic note into a backlog stub. That narrows `drain-inbox.md` § 5, which also lets the drain weave into a work
  unit its runner owns; at the drain, how an entry fits is the owner's call at its next pass (D4). Its `errand` defers
  by the drain's homeless-atomic route.
- **The drain, re-triaging a backlog stub:** `dismiss`, `errand`, `hold <other>`, `new-stub`, and `hold <host>` —
  keeping the entry, or a split's residual rewritten in place (D5). Its `errand` defers by the drain's homeless-atomic
  route.
- **The fast path:** every outcome but `reject`; `fold` only into the session's own work unit, and `capture` only when
  the session lacks the commitment (D7). Its `errand` defers as a `§ Errand` capture. Until the flip, its writes
  outside the session's own work unit run as a route-only Errand or a capture (D7).
- **An Errand's route-to-home:** the fast path's outcomes, routing into another work unit only as D8 allows.
- **The owner's planning pass:** every outcome, but `hold <host>` not at the pass that makes the draft
  formalization-ready (D5); `reject` is the owner's alone. Its `errand` defers as a `§ Errand` capture.
- **Cascade at draft close:** `hold <other>` and `new-stub`, executed as pre-routed captures until the flip; `errand`
  as a `§ Errand` capture; `capture` with its home undecided; or `dismiss`, routing nothing (D6, D8). Its caller is the
  draft-close routing gate `planning-iteration-mechanics` places; until that gate ships, a draft-close capture is an
  ordinary capture the drain gates (D7).

Any other caller takes one of these doors rather than a new one. `shared-inbox-model`'s discovery-at-start sweep, if
kept, runs in the starting work unit's checkout: what it brings into that work unit takes the owner's-pass door, and
anything it would change in a sibling stub follows D8's writer line. A new door is a change to this list. Where the
gate lands on an outcome its door does not allow, that call is the target owner's: a `fold` becomes `hold` on the
same work unit, and a held entry the door may not fold or reject stays (`hold <host>`). The owner's pass bars only
`hold <host>`, and only at the pass that makes the draft ready, where the owner folds or rejects the entry instead.
An allowed outcome the until-the-flip binding cannot carry out — a route into another person's started work unit —
waits as D8's binding says.

A hand-made "hold for the storage owners" is a `hold <wu>` naming the member or stub whose decision the entry shapes —
in `quality-gate-hooks`' triage, `history-policy`, `ghost-mode`, and the projection and cutover members, not one owner.

**Why one, not a family.** Every step has at least two consumers, so extraction is earned
(`strategy-knowledge-evolution.md` Principle 6): the drain, an Errand's route-to-home, the planning stages' re-triage,
the draft-close routing gate, and the `arc-inbox` fast path. But the steps share one gate and one vocabulary, and
every consumer runs two or more of them together; a family would restate tests 1–4 or chain its members, and add
declarations and fire-point markers no consumer uses alone. Homing is a section inside.

**The name** is anchored to the operation, not a workflow (`strategy-knowledge-evolution.md` Principle 3, whose own
example of an operation-anchored trigger is "routing discovered work"), and matches `DEV-RULES.ARC` § Discovered Work
Routing, which D10 points at it. An `assess-*` name reads as a check rather than an act; an `inbound-*` name is too
narrow for a method that also routes to Errands, new stubs, and the inbox.

**Forward-compatible with `composable-workflows`.** The method takes the method-as-function shape that draft
generalizes from `adversarial-review` (its D1/D2), so a later contract formalization re-reads it rather than rewrites
it:

- **Signature-led contract.** The one-line signature in the leading blockquote, a named-inputs table, and a typed
  result — a closed outcome vocabulary defined once in the method and used by name everywhere else
  (`strategy-procedure-evolution.md` Principle 7). Consumers invoke it with a YAML callsite whose single top-level
  key is the method name, as `draft-design.md` does for `adversarial-review` and `source-grounding`.
- **Decides only.** The method returns dispositions; the caller executes them through verbs — `arc stub`,
  `arc user inbox-remove`, and from the flip the routing verb — after its own interlock. `assess-boundary-fit`
  draws the same line. Decision is the judgment leaf; execution is typed verb steps, the split an agenda compiler
  needs (`strategy-procedure-evolution.md` Principle 3).
- **Deterministic inputs come from the CLI.** The target's lifecycle position, commitment tier, priority, and owner —
  which set `door` rights, decide D5's in-flight new home, and feed the horizon advisory — are read from `arc status`
  (the per-slug read and D11's listing rows), never inferred from paths. The door list is small and closed, structure
  rather than evaluated prose, and a candidate for a typed lookup when the CLI owns it. From the flip, the
  back-pressure offer is precomposed CLI text.
- **Visibility `public`, override-policy `overridable`.** Many workflows call it, and a project may tune its rubric.
  Nothing in it needs `fixed`: the door list mirrors the binding's writer rule rather than owning it, and nothing
  enforces that rule before the flip — `check-foreign-writes.ts` only warns, and the contract notes the host cannot
  enforce owner-only (`spec-storage-contract.md` D11). What holds a route is the Owner's stop every door passes
  through: the drain's § 3 interlock, the proposal before a route-now, and the owner's own pass.
- **Delegated homing reads follow the general rule:** advisory until the primary verifies the named section, and
  nothing primary-side — the door, the rights table — is serialized to the reader.

None of this shapes a `composable-workflows` decision; the method is one more consumer of its contract shape, so no
capture goes there.

**Shipping.** Methods are hand-listed in `init-recipe.json` `include_files`, so the method needs its own entry, with
the package source and `.arc/` copy synced. Each consumer workflow declares it in its `arc.methods` frontmatter — the
author-side rule in `DEV-RULES.ARC` § Method and extension loading — and `lint:arc:triggers`
(`audit-method-triggers.ts`, which walks workflows) fails CI for a method no workflow declares; `drain-inbox.md` has no
`arc:` block yet and gains one. A skill carries no `arc:` block, so `arc-inbox` gets a callsite only. The method
declares what it fires itself — `classify-work-unit`, for test 2 and the new-stub `Class` estimate — in its own
`arc.methods` and `related:`, as `adversarial-review` does, and the methods README's § Related Methods gains its row
and the reciprocal entry on `classify-work-unit`'s. `run-errand.md` applies D12 directly, at Launch and at its promote
step, so it declares `classify-work-unit` too. No validator checks that a declared method's fire-point is marked
(`WORKING-MEMORY`), so each consumer's callsite marker is checked by hand.

### D10 — The always-loaded invariant (Settled)

`DEV-RULES.ARC` § Discovered Work Routing's core invariant makes a stub or draft authoritative "for its domain
concerns" — root cause 1 written into the rule — so "known home" reads as domain fit. The paragraph becomes:

> A work unit's stub/draft is the single authoritative source for the decisions it owns; capture surfaces
> (`USER-INBOX`, the shared `ATOMIC-INBOX`) are transient buffers, never authoritative. An item's home is the work
> unit whose decision it shapes — shared domain alone makes a neighbor, not a home, and an Errand-shaped item has
> none: it runs as an Errand or waits as an Errand capture. Place it by the `route-discovered-work` method. **No item
> with a known home may rest in a capture surface** · `[invariant]`.

The net growth is two sentences, and the method pointer is phrased as a trigger on the operation itself
(`strategy-knowledge-evolution.md` Principles 2, 3, and 10). The invariant marker and its scope are unchanged; only
"home" is sharpened. It is maintainer-owned, package-synced, and the only always-loaded change this work unit makes.

### D11 — Derived purpose in `arc status` (Settled)

Each work unit's purpose becomes a CLI read, so homing's shortlist is computed rather than grepped
(`strategy-procedure-evolution.md` Principle 1). It is **derived, never stored**: `strategy-work-organization.md`
§ Purpose statement lives on the spec keeps the purpose once, as the draft's or spec's `**Purpose:**` thesis, and a
meta field would be a second prose copy that drifts. `arc status` follows the meta's `Design` pointer and reports the
first sentence of that artifact's `**Purpose:**`. A meta-only stub reports none, and so does a `brief` spec, whose
form has no Purpose header — the work units homing targets are overwhelmingly drafted backlog stubs.

- **Per work unit:** `arc status <slug>` gains the field, in its JSON and its human output, and its JSON gains the
  meta's `Owner`, which D5's in-flight new home reads; it reports none today.
- **Listing:** `arc status --project --json` already emits a typed row per work unit beside its rendered markdown —
  `facts`, carrying readiness and dependency satisfaction (`factsFor` in `lib/status/project-view.ts`) — built from
  records that hold priority (`ProjectReadinessRecord`). Those rows gain priority, purpose, owner, and the lifecycle fields
  the per-slug read derives (`state` and `position`), not the record's own `state`: that is the meta lifecycle value
  (`WorkUnitStateSchema`), which cannot tell a started work unit from a backlog stub, or provisional from planned. The
  shortlist needs every candidate's purpose, and the door rights and horizon advisory its lifecycle and priority, all
  at once — one listing beats a call per slug. The rendered view and its columns stay `roadmap-tooling`'s render
  standard, untouched.
- **First-sentence convention.** Many Purpose lines run several sentences (this draft's does), so `template-draft.md`
  and the three spec templates that carry a Purpose line say it opens with a one-sentence thesis.
- **Forward-compatible.** From the flip the draft and spec parsers `storage-seam` builds expose Purpose as a parsed
  field, and derived views read typed listings (`spec-storage-contract.md` D1), so this reader moves behind the
  parser without changing the field.

### D12 — The Errand / work-unit line: a record test (Settled)

`classify-work-unit` boundary test 1 puts the floor at "a design worth recording" without saying what makes a design
worth recording, and ADR-027's derivation floor says "the act of _deriving_ is the signal, and ARC records it either
way". So "carries a design fork" read as crossing it — nine of `quality-gate-hooks`' entries began as Errand captures,
and two record escalating on design-fork wording. The line is about the record, not the discussion. An Errand's record
is its own change — the stated intent, the diff, and the commit and PR text — and working a decision out with the
Owner in conversation does not by itself make a work unit.

**Classification is the Owner's call.** It commits them to ceremony, so it is an authorization reserved to them
(`DEV-RULES.ARC` § Rule Authority). The agent proposes with the four answers below in front of the Owner, and the
test settles nothing on its own. D12 adds no stop of its own: the answers ride the points where placement already
reaches the Owner — the proposal `DEV-RULES.ARC` § Leave it cleaner requires before acting, the Owner's own Errand
invocation, the drain's § 3 interlock (with D9's pair where unclear), and `init-work-unit.md`'s stop before promotion.
`run-errand.md`'s Launch confirmation shows the Owner the four answers only when one is yes, and a capture's section
stays a provisional hint the drain decides. It is a work unit when any answer is yes:

1. **Steps not knowable yet.** A step cannot be named without first mapping the code to find it, or the Owner says
   one sitting will not hold the work. No question asks the agent to estimate duration: a sweep whose steps are known
   stays an Errand however many files it touches. Waiting does not count — an Errand that waits on review, a merge, or
   another work unit stays an Errand; needing several sittings of work is what the Owner's answer names.
2. **A deliberate exclusion.** The change leaves out something a reader would expect, and it must stay left out. That
   exclusion is a scope boundary — pre-commitment text the outcome is judged against, the floor a `brief` spec serves
   — and an Errand's intent line has nowhere to state it.
3. **Costly if wrong.** Putting a wrong choice right would take more than another Errand: persisted data to migrate,
   or a contract other work builds on to unwind.
4. **The decision outgrows its line.** An Errand records each fork it settles as `Decided: X over Y — because Z` in
   its PR body and commit. When a later reader would need the alternatives and rationale, not just the choice — past
   a couple of lines — it needs a written design.

Otherwise it is an Errand, design discussion included. **Unclear cases:** when the work is happening now, run it as an
Errand and promote the moment any answer flips — `run-errand.md`'s promote step, its trigger made concrete. The answer
names the floor `arc errand promote --floor` takes: question 1 is `scale` (`Active`, with a brief and a task list),
and questions 2–4 are `derivation` (`draft-design`, which may still reach a brief spec). When both kinds flip at once,
`derivation` wins: the planning it enters goes on to the spec and the task list, the plan the scale floor asks for. At
the drain there is no default: the method returns both candidates (D9), and the Owner decides at the confirmation interlock.

**Deciding and guarding are separate.** The questions decide. They deliberately do not ask whether a wrong choice
would fail quietly — a subtly wrong always-loaded rule is cheap to fix once noticed, and asking would make nearly every
shipped-workflow edit a work unit. The quiet direction, an Errand that needed design it never got, is guarded instead:
the Decided line gives each settled fork a witness that review can challenge and a later reader can find, the
reviewed lane already takes load-bearing infrastructure (`arc-inbox` step 2), and the promote trigger fires when the
line will not fit.

`classify-work-unit` test 1 carries the four questions as the canonical floor, reading the two axes it already names at
their sub-floor — question 1 the scale axis, questions 2–4 the derivation axis — and `strategy-work-organization.md`
points at it rather than keeping its own copy (§ Surfaces). The four questions are the whole floor, so the strategy's
decision-matrix criterion "tracked or resumed as future or owned work" retires. A roadmap slot is when, not what:
Errand-shaped work for later waits as a `§ Errand` capture. An owner follows from the wrapper and never decides it —
a full-protection Errand has one, today its transient identity's claim and from the flip a base field of its record,
while a partial-protection Errand is a direct base commit with neither (`spec-storage-contract.md`). A dependency is
waiting, which question 1 excludes. Making a stub is the `new-stub` outcome for a concern these questions call a work
unit — a transient act through `arc stub`, by any door D9 lets choose `new-stub`, never a work unit itself.

Retiring the create rule and the criterion reverses part of an accepted Decision — ADR-021's threshold, and its create
rule that a backlog stub "is a (small) WU" — and so does the record test itself, which replaces ADR-027's derivation
test ("the act of _deriving_ is the signal"). `strategy-adr-methodology.md` § Choosing the right tier routes that to
supersession ("Reverse or significantly alter the decision"), a new ADR. So a new ADR records D12. ADR-027 is the
precedent for its reach: it altered the same threshold in a new ADR and left ADR-021 not superseded, its taxonomy
standing, with a forward-pointer amendment (its § Alternatives and Rationale). So neither is superseded: ADR-021's
work classes stand, and so do ADR-027's two-floor structure, its Errand mechanism, and its record-owned identity. Each
gains a forward-pointer amendment, ADR-027's saying its derivation test is replaced by D12's.

The `Heavy` derivation trigger (test 2) is unchanged. The always-loaded Errand entry in `AGENT-BRIEF.ARC` ("no design
worth recording") reads true today, so D10 stays the only always-loaded change; its scheduled rewording is
`naming-conventions`', asked to keep the word "written" (§ Coordination).

Promotion becoming the designed exit for an unclear Errand raises the cost of today's in-place promotion, which leaves
a primary-hosted Errand's work unit occupying the primary checkout; relocating it is `errand-promotion-concurrency`'s
charter (§ Coordination).

### Specified for the flip

This work unit builds none of the following; each goes to its owner as a draft-close capture. The storage-coupling
register in `cohort-state-storage.md` is how the flip finds what to rewrite: each substrate-shaped mechanism has a row,
an owner, and a fate, and `storage-cutover` consumes the members once they land. So everything here goes to the row
owner, `storage-seam`, never straight to the cutover.

- **Rewriting the method's binding.** Register row "Hold-and-route" (`storage-seam`) already rewrites the buffer
  section, the owner-adoption hold, and the coordination-seam rule at the flip. After this work unit those mechanics
  live in `route-discovered-work`'s binding section and D8's writer line, which route-now carries out by handing off
  from `arc-inbox` to `arc-errand`'s route shape (D7). So the row names that section and that hand-off as its rewrite
  sites, and D8's from-the-flip binding as the target. Because the method names no buffer layout, the rewrite is that
  section and that hand-off; every other caller names the method, not the binding.
- **The purpose reader.** D11 reads the `Design` artifact's prose, a kind the consumer map does not list for
  `lib/status/project-view.ts` (a seam module reading `wu.meta`, placement, and derived state). That read joins
  `storage-seam`'s reroute set behind the draft and spec parsers' Purpose field (D11).
- **`_Shapes:_` as a field of the inbound entry and the inbox capture** — both schemas are open in `storage-seam`'s
  draft on `plan/storage-seam` (its open items on the work-item base's field schema and "the personal-surface
  families' field schemas").
- **A back-pressure slot.** Per work unit, the pending inbound count `storage-contract` already places in session-init
  orientation, plus the oldest entry's age, with thresholds that emit a recommended action and a precomposed
  re-triage offer (`strategy-procedure-evolution.md` Principles 1 and 6). The § Evidence counts are its calibration
  data. It is a new coupled mechanism, so it needs a register row.
- **Converting existing buffer sections and owner-adoption holds at import.** `spec-storage-contract.md` D14's one-time
  move lists no conversion of `## Inbound Buffer` sections into inbound entries. Without it, readiness that reads an
  empty inbound list as drained would pass a draft over its stranded entries. Nor does it convert a pending
  owner-adoption `_Hold` entry into its target's inbound list; D11 retires owner adoption, and the move only stamps
  each inbox entry's `_Id:_`, so such an entry would rest in the inbox with its home known. The import is
  `storage-ref-backend`'s and the move `storage-cutover`'s.

## Success signal

- **Replay.** Applied to `quality-gate-hooks`' 30 routed-in entries as they stood at `7ea9addfa`, the method reaches
  the hand verdicts recorded in that draft's § Buffer triage (`2bc91c7a4`) from rules it states — a split verdict as
  one outcome per part, a two-option verdict as either option, and every disposition naming its D9 outcome and the D2
  test that decided it, with no judgment the method leaves unnamed. Test 4 catches the two entries that arrived after
  that draft's out of scope had handed content checks to `knowledge-lint`.
- **Live.** In the first drain after landing, every `hold <wu>` entry carries a `_Shapes:_` naming a section that exists
  in its target, none matches its target's out of scope, and each routed-into backlog stub that already held entries
  appears in the routing plan with its held count, oldest date, and a re-triage offer. The first route-now use runs
  the gate before minting, and a concern that shapes an existing work unit's decision routes there instead.
- **Purpose.** `arc status <slug> --json` reports the first sentence of the `Design` artifact's `**Purpose:**`, and
  none for a meta-only stub or a `brief` spec; each `facts` row of `arc status --project --json` carries the same
  field, with priority, owner, and the per-slug `state` and `position`; the per-slug JSON also carries the owner.

## Surfaces

Package source and `.arc/` copy alike:

- **New:** the `route-discovered-work` method, with its `init-recipe.json` `include_files` entry, its own
  `arc.methods` and `related:` naming `classify-work-unit`, and its row in the methods README's § Related Methods with
  the reciprocal entry on `classify-work-unit`'s row.
- **Consumer workflows, each with an `arc.methods` declaration, a callsite, and a hand-checked fire-point marker:**
    - `drain-inbox.md` — gains an `arc:` frontmatter block; § 2 classification runs the gate; § 3's routing plan
      carries D5's re-triage line and the Owner-decided pair (D9); § 5's integration modes defer to the method; its
      scope re-triage defers to D12, dropping load-bearing infrastructure as a floor.
    - `run-errand.md` — route-to-home for a concern an Errand discovers; the Decided line in its lean PR body and
      commit; Launch's confirmation showing D12's four answers when one is yes, and classifying a route-only Errand
      by its routing change, not the concern it carries (D7); the promote step's D12 trigger, leaving the floor to the
      Promote Errand path it already defers to; and a `classify-work-unit` declaration, which its Launch
      classification and promote trigger apply.
    - `create-spec.md` — the buffer hook runs the method with the owner's door. The `draft-design` placement is
      `planning-iteration-mechanics`'.
- **The `arc-inbox` skill** — a callsite only, since a skill carries no `arc:` block: the route-now mode and a
  description naming it (D7), and step 2's infra-smell note no longer invites escalating on a design fork alone.
- **The `arc-errand` skill** — step 1's route shape is entered only after route-now's gate, as the pre-flip vehicle
  for a now-route, writing backlog stubs only, and step 2's account of Launch says such an Errand is classified by
  its routing change (D7, D8).
- **The Errand line** — D12's four questions as the canonical floor in `classify-work-unit` boundary test 1, mapped
  onto its two axes. In `strategy-work-organization.md`:
    - § The boundary tests' test 1 and § Work Character's floor statements point at it instead of restating it;
      § Work Character's account of atomic character stays;
    - § Worked examples' widely-used-symbol rename clears question 1 — a correct plan cannot name its call sites
      until the surface is mapped;
    - § Errand Work Class points its character layer at `classify-work-unit`. Its create-versus-maintain paragraph —
      criteria 1–3 and "create trips criterion 3" — gives way to a pointer to the same test, and the symptom check
      re-examines a candidate against the four questions. The decision matrix keeps one row, maintaining an existing
      artifact, across its self-contained and cross-cutting columns; a sentence beside it states a new stub as the
      `new-stub` outcome, made by a transient act.

  `init-work-unit.md`'s Promote Errand path names the floor by D12's answers, with `derivation` winning a tie. The
  two-floor summaries in `arc-errand`, `run-errand.md` Launch, and `init-work-unit.md` stay, since they read true under
  that mapping.
- **A new ADR** (internal, `.arc/reference/adr/`) — D12's record test, replacing ADR-027's derivation test, and the
  retirement of ADR-021's create rule and threshold criterion 3, with forward-pointer amendments on ADR-021 and
  ADR-027 (D12).
- **`DEV-RULES.ARC`** § Discovered Work Routing — D10's paragraph.
- **Templates** — `template-draft.md` and the `outline`, `detailed-prd`, and `detailed-rfc` spec templates: Purpose
  opens with a one-sentence thesis (D11).
- **CLI** — `arc status`'s per-slug and `--project --json` purpose and owner fields (D11), with unit coverage for
  drafted, specced, `brief`-specced, and meta-only work units.

## Alternatives

- **The original charter — a DRY extraction with no behavioral change.** Rejected: it codifies the domain-only home
  test that causes the problem.
- **An interim CLI count over the buffer section.** Rejected: the inbound kind has no home before the flip, so the
  reader is deleted at cutover, and a numeric threshold evaluated in prose is `strategy-procedure-evolution.md`
  Principle 1's anti-pattern.
- **A pre-flip sweep of all 509 entries.** Rejected: replication-shaped work duplicating what re-triage at touch does
  for the drafts that matter, while untouched drafts cost nothing where they sit.
- **Building the post-flip mechanics here** behind a `Depends On` edge on the storage program. Rejected: it parks the
  policy fix behind the whole program, and the inbound kind's owner is `storage-seam`.
- **An always-loaded routing threshold.** Rejected (D8).
- **A session-length test for the Errand line** ("will it finish this session?"). Rejected: it asks the agent to
  estimate duration, which it cannot do reliably; D12's first question asks whether the steps are knowable, and
  session capacity is the Owner's input.
- **Leaning to a work unit whenever the Errand line is unclear.** Rejected: promotion is the cheap exit, and the
  Decided line and the promote trigger surface an under-designed Errand when it matters (D12).
- **Route-now in `arc-errand`'s route shape rather than `arc-inbox`.** Rejected: from the flip a route is one
  routing-verb call with no Errand to run, so the door would outlive its wrapper; the trigger anchors to routing
  discovered work (`strategy-knowledge-evolution.md` Principles 2 and 3), and the route shape serves as the pre-flip
  vehicle instead (D7).
- **The Errand line as its own work unit.** Rejected: D2's test 2 is that line applied at routing, the evidence for it
  is this work unit's, and no other work unit owns it (§ Boundary fit).
- **Keeping the decision matrix's create rule and tracking criterion beside D12.** Rejected: making a stub is a
  transient act, and a roadmap slot, an owner, or a dependency does not tell an Errand from a work unit. Kept, they
  would make "track it for later" a reason to stub Errand-shaped work, the escalation D12 exists to stop.

## Unknowns and Assumptions

- **The disposition gate holds in the drain's real cost envelope.** The drain is already the heaviest ceremony; adding
  coupling and scope checks per entry must not make it unrunnable at 85 captures. Validate against one real drain.
- **`_Shapes:_` is answerable at capture.** The prototype entries name their target's decision; whether a cold
  capture can is untested. If not, the drain supplies it, and the capture-time hint stays provisional
  (`frictionless-capture`).
- **Executing work units.** An Active work unit has no draft to hold entries in, and `storage-contract` leaves where
  it integrates inbound entries to `storage-seam`. Until the flip, in-flight targets keep the owner-adoption hold.

## Scope boundary (Won't Do)

- Build the inbound kind, the routing verb, routing receipts, or any field schema — `storage-seam`.
- Place the integration ceremony inside `draft-design` — `planning-iteration-mechanics` (this work unit supplies the
  rubric it runs).
- Inbox surface semantics, promote-by-default, and the project inbox — `shared-inbox-model`.
- The protected-base round trip from mint to start — `stub-mint-to-launch`, paused until the storage cohort ships; D7
  decides only the now-route's pre-flip vehicle.
- Skill-door conventions — `skill-infrastructure-cleanup`; D7 only names the route-now mode in `arc-inbox`'s
  description.
- The work-item vocabulary ("design unit" for "work unit") and the Errand entry's wording — `naming-conventions`; D12
  sets the rule its words name.
- Where a promoted Errand's work unit lives — `errand-promotion-concurrency`.
- The rendered project view's columns — `roadmap-tooling`'s render standard; D11 adds typed data beside it only.
- The anti-deferral principle — `justified-deferral`, the backstop the coupling test must not undercut.
- Capture-time classification speed — `frictionless-capture`; its hint stays provisional.
- A sweep of the existing buffers.

## Coordination

Draft-close captures through `arc-inbox`, each with `WU_Target` and `_Shapes:_`; no sibling artifact is edited from
this branch.

- **`storage-seam`:** row "Hold-and-route" names the method's binding section and route-now's pre-flip hand-off to
  `arc-errand` as its rewrite sites; the purpose reader joins its reroute set; the `_Shapes:_` field; the
  back-pressure slot and its register row; the import conversion of buffer sections and pending owner-adoption holds
  (routed on to `storage-ref-backend` and `storage-cutover` as their owner decides).
- **`planning-iteration-mechanics`:** re-triage runs at its Concern 1 fire-point with this work unit's rubric; the
  dispositions table (D5) is the record that rubric leaves, and its format is Concern 1's. The draft-close routing
  gate its inbound entry "Place coordination routing at draft close, not at task generation" would place is the
  cascade door's caller (D9).
- **`shared-inbox-model`:** the routing-disposition rubric it hands here is this work unit's D2, with the horizon
  test an advisory rather than a gate; its references to an `assess-wu-target` method family name the one
  `route-discovered-work` method (D9); its aging-enforced retain is the `USER-INBOX` analog of D5. Its
  discovery-at-start sweep, if kept, calls the method once per candidate entry — the owner's-pass door for what it
  brings in, D8's writer line for anything it would change in a sibling stub (D9); where the sweep sits stays its
  call.
- **`skill-infrastructure-cleanup`:** the fast-path door (D7), whose description this work unit writes and it may
  rename, and `arc-errand`'s route shape, which becomes that door's pre-flip vehicle.
- **`naming-conventions`:** D12 refines, not overrides, its 2026-10-06 decision that "a small change with real
  tradeoffs is a design unit": the real tradeoffs are the ones D12's questions catch. The capture asks its Errand
  definition to say "needs no written design" rather than "needs no design", since the always-loaded entry would
  otherwise state the reading D12 corrects.
- **`errand-promotion-concurrency`:** D12 makes promotion the designed exit for an unclear Errand, so in-place
  promotion occupying the primary checkout grows more frequent. It is P3, so the horizon advisory (D2) applies: raise
  its priority, or not.
- **`cross-wu-coordination`:** the cascade rule (D6).
- **`goal-aware-direction`:** the horizon test's refined input (D2).
- **`quality-gate-hooks`** emits `_Shapes:_` captures at its close in the prototype form; D2 keeps that form, so no
  rename reaches it.
- **`stub-mint-to-launch`:** its paused state — until the storage cohort ships — and that route-now's `new-stub` is a
  second caller of its mint-and-publish flow if it resumes before the flip, ending before launch, which bears on its
  composed-verb-or-workflow question (D7); its meta's Blocker still awaits `decompose-transform-integrity`, now
  archived.
- **`frictionless-capture`** cites the drain's "coupling + horizon rubric" as authoritative. Its own decision — the
  capture-time hint stays provisional — holds either way, so the reference names no decision there and no capture
  goes.
- The dangling `arc-plan-conductor` pointer in `drain-inbox.md` is already an Errand capture.

## Boundary fit

**Stays one work unit.** Disposition, homing, integration, and re-triage are one concern designed as a whole: each
step's rule depends on the others, and the fast path and cascade routing are doors onto the same gate. The pieces
that would be orthogonal — the inbound kind, the integration ceremony's placement, the inbox model, and the skill door —
are left with their owners rather than cut out of this one.

Folding D12 in was re-checked as new evidence, since it rewrites the floor of the `Class` model. It could stand as its
own work unit, but D2's test 2 is that floor applied at routing, the evidence for it is this work unit's own, and no
other work unit owns it; split out, routing would ship citing a floor read two ways, or wait on it. It stays.

## Inbound dispositions

| Entry (abridged)                                               | Disposition                                            |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| Give direct Work Unit stubbing one agent-facing entry path     | Folded: D7, its pre-flip vehicle included              |
| State the cascade doctrine: always route, never re-open        | Folded: D6, reconciled with the coupling test          |
| Codify the direct-edit-buffer vs `arc-inbox` threshold         | Folded: D8's until-the-flip binding, not always-loaded |
| `assess-wu-target` — a codified procedure for a capture's home | Folded: D3                                             |
| Disposition gate ahead of homing — coupling and horizon tests  | Folded: D2                                             |

The stubbing entry first read as a neighbor: against a charter of "routing into existing work units" it names no
decision. Against D1's charter it shapes D7. The test turned on the target's stated scope, which is why D2 makes the
scope-boundary check load-bearing.

---
