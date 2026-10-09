# Spec (`detailed` · `RFC`): inbound-routing-method

- **Origin:** [internal]

- **Purpose:** Route each discovered concern to the work unit whose decision it shapes, never to one that only shares
  its domain, through one method every routing door uses. Routed entries stay honest after they land — wherever one is
  read again it is re-triaged in both directions — and the Errand-versus-work-unit line routing applies becomes a
  record test the Owner decides by.

---

## Introduction / Context

A backlog work unit that waits for months becomes the home for anything that touches its domain. Routing a discovered
concern into an existing work unit avoids needless standalone stubs and Errands, but a home chosen for shared domain
alone dilutes the work unit's design intent with orthogonal concerns and leaves its owner a planning backlog to
maintain. Routing costs one write at drain time; integrating costs the owner later. The current rules push toward
routing and never back.

**Terms.** A concern is _routed_ when it is written into a work unit as its home. Until the owner integrates it, it is
an **inbound entry** — today a note in the draft's `## Inbound Buffer — Pending Integration` section, with a
`routed from <origin>, <date>` provenance line (`drain-inbox.md` § 5). A **door** is a place in the methodology where
routing happens. A **backlog stub** is a work unit whose artifacts live in `backlog/provisional/` or `backlog/planned/`:
one not yet started, or one parked at Planning, whose artifacts return there. A **started** work unit is one past
`arc start` whose artifacts live in `active/` on its branch, including one parked at Active, which keeps them on its
preserved branch while only a pointer record sits in `backlog/planned/`.

**Evidence** (counted at `c009ab198`, 2026-10-07; the full counts are in `notes-inbound-routing-method.md`):

- One backlog work unit, `quality-gate-hooks`, carried 30 routed-in entries. Its owner's triage folded 6 into the
  body, dismissed 5 as resolved elsewhere, held 5 for other designs, re-routed 7 to other work units' charters, and
  found 7 Errand-shaped. Two of the re-routed entries arrived after its own Out of scope had excluded their subject.
  Nine of the 30 began as Errand captures; two record escalating on design-fork wording.
- Across the backlog, 86 of 143 drafts carry a buffer, holding 509 entries — 45% of those drafts' lines. In 33 the
  buffer is longer than the design body, and the oldest open entry was routed 2026-06-01.
- Three hand cleanups ran with no rule behind them: one draft's dispositions table, another's consolidated buffer
  dispositions, and an inbox entry that redistributed a third draft's buffer.

**Mechanics today.**

- **One forcing point, late.** A draft's buffer must be integrated before the draft is formalization-ready:
  `assess-draft-readiness` criterion 3 checks it at `draft-design`'s readiness exit, and `create-spec.md` § Resolve
  depth & Class checks it again. `create-spec` says only to integrate or consciously reject each entry, and
  `draft-design.md` never mentions the buffer, so a stub that waits for months short of readiness keeps every entry in
  transit.
- **One-way re-triage.** `drain-inbox.md` § 2's scope re-triage promotes an Errand capture to a stub when it crosses a
  wrapper floor; nothing sends an entry back out. Its Home rule — existing stub, new stub, or none — has no fit
  criterion beyond domain.
- **Escalation at capture.** `arc-inbox` step 2's infra-smell note invites a second look at an Errand capture that
  "carries a design fork" or touches `.arc/system/**`. The note is advisory, but the drain's scope re-triage reads
  load-bearing infrastructure as a crossed scale floor and a design fork as a design worth recording, and an existing
  stub is the cheapest stub to pick.
- **Integration modes.** `drain-inbox.md` § 5 makes the buffer note the default whenever integration is costly,
  design-bearing, or foreign-owned. `run-errand.md` says nothing about routing a concern into an existing stub.
- **Structural pressure.** `DEV-RULES.ARC` § Discovered Work Routing forbids an item with a known home from resting in
  a capture surface, and its core invariant makes a stub authoritative "for its domain concerns", so "known home" reads
  as "a stub in the same domain".

**Root causes.**

1. The home test is shared domain only.
2. Re-triage runs one way.
3. Nothing re-checks a routed entry: no size or age signal, and resolved entries linger.
4. The costs are lopsided — one write to route, an owner's pass to integrate — and nothing pushes the other way.

**Why now — the flip.** ADR-035 moves ARC's operational and planning state out of tracked branch files into
same-repository refs behind one storage contract. At that cutover, **the flip**, each work unit's inbound entries
become a per-work-unit inbound list: one entry per routed concern, each with a stable ID, inserted by any session
through a routing verb with no pass through the owner. That makes routing cheaper still, so without a fit test at the
routing door the flip amplifies the dumping-ground problem instead of relieving it. None of the flip's machinery exists
yet. This change builds none of it, states what it expects of it as a contract (D8), and ships a method that holds
unchanged across it.

## Goals

- **One fit test at every door.** A concern routes into a work unit only when it names the decision or section of that
  work unit it shapes and falls outside the work unit's stated exclusions. Shared domain alone makes a neighbor, not a
  home. Every door runs the same gate; none has a private rule.
- **Errand-shaped stays an Errand.** The Errand-versus-work-unit line is one record test, stated once, that the Owner
  decides by. Touching load-bearing infrastructure is a review signal, not a floor.
- **Two-way re-triage at touch.** A routed entry is re-checked, in or out, wherever it is already being read, with no
  new step and, before the flip, no threshold over any count.
- **One method, one vocabulary, one door list.** Disposition, homing, integration, and re-triage live in one method
  with a closed outcome vocabulary and a closed list of doors, in the method-as-function contract shape.
- **Substrate-neutral.** The method names "a work unit's inbound entries" and "the routing action", never the buffer
  section's layout, so the flip rewrites one binding section and one hand-off.
- **Homing reads typed data.** Each candidate's purpose, owner, lifecycle position, and horizon advisory come from
  `arc status`, and its design from `arc view`, never from paths or grep.
- **Bounded always-loaded growth:** two sentences in `DEV-RULES.ARC` § Discovered Work Routing, and nothing else.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **build any post-flip mechanism** — the inbound list, the routing verb, routing receipts, any typed field schema
  (`_Shapes:_` included, which stays a prose descriptor until then), a back-pressure slot, or the import of existing
  buffer sections. D8 states what the design expects of them.
- **add a count, metric, or threshold over buffer sections before the flip.** A count the drain reports is shown, never
  compared.
- **sweep the existing buffer sections.** Their entries are re-triaged when their home is next touched; untouched drafts
  stay as they are.
- **add a step to `draft-design`, or decide where an iteration-time drain of a draft's buffer runs.** The owner's pass
  fires where a draft's inbound entries already drain — `draft-design`'s readiness exit and `create-spec`'s entry
  check (D5) — and a later iteration-time step would take over the first of those calls.
- **change the inbox model** — `USER-INBOX` sections, promote-by-default, or a shared project inbox — **or
  capture-time classification,** whose section stays a provisional hint the drain decides. One reading changes with
  the gate: a capture's `WU_Target` becomes a candidate the gate checks rather than a destination its existence
  decides, and `_Shapes:_` joins the capture's descriptors (D2, D7).
- **solve the protected-base round trip from minting a stub to starting it.** D7 decides only a now-route's vehicle
  before the flip.
- **set skill-door naming conventions.** D7 adds a route-now mode to `arc-inbox` and names it in that skill's
  description; how skill doors are named in general is not decided here.
- **reword the work-item vocabulary or the always-loaded Errand entry in `AGENT-BRIEF.ARC`.** That entry ("no design
  worth recording") reads true under D12.
- **relocate a promoted Errand's work unit out of the primary checkout.** In-place promotion keeps its current
  placement.
- **change the rendered project view or its columns.** D11 adds typed data beside them.
- **decide when deferring a concern is justified.** The coupling test decides where a concern goes, never whether
  deferring it is acceptable.
- **change the `Heavy` derivation trigger** (`classify-work-unit` boundary test 2), the two-floor structure, the
  Errand's mechanisms, or its record-owned identity.

## Proposed Design

Twelve decisions, D1–D12, then the surfaces that realize them. D1–D9 define the routing method, D10 the always-loaded
invariant, D11 the CLI reads homing depends on, and D12 the Errand-versus-work-unit line the gate applies.

### D1 — Charter: one disposition, every destination

Inbound routing is one concern in four steps: **disposition** (should this go into a work unit at all) → **homing**
(which one) → **integration** (woven into the body or held as an inbound entry) → **re-triage** (does each held entry
still belong). The destinations are an existing work unit, a new stub, an Errand (run now or captured), an inbox
capture (judgment deferred), and dismissal. The doors are the inbox drain; the express lanes — an Errand's
route-to-home and "stub this out"; cascade routing from a planning pass; and the owner's own planning pass (D9 lists
them closed). Every door runs the same disposition.

### D2 — The disposition gate

The gate places discovered work. When a work unit starts planning or activates, an item its own change already covers
— the same concern, by the anti-rider rule's concern-identity test (`DEV-RULES.ARC` § Anti-rider) — is that change's
work, not a concern to route: planning kickoff and activation pull it in without the gate, and it takes no routing
outcome. At the ready-making owner's pass, first split and verify each entry as test 1 requires. A live part already
covered by the host's own change is reconciliation of that change: return `fold <host>`, with own-work coverage as
its deciding reason and `_Shapes:_` naming the covered section. Do this before the record-floor test; independent
residuals still take the ordered gate. Sharing a file or domain alone does not establish concern identity. (A1)
Everything else takes the gate, applied in order at every door:

1. **Still live.** Verify the entry against the current tree; dismiss a resolved entry and name what resolved it.
   `drain-inbox.md` § 2 already verifies a capture before routing it; the test extends to entries already held in a
   home. An entry found partly resolved splits (D9): the resolved part is dismissed, and the residual runs the gate on
   its own.
2. **Errand-shaped stays an Errand,** judged by D12's record test, which `classify-work-unit` boundary test 1 states.
   Touching load-bearing infrastructure is a review-lane signal, not a floor — `arc-inbox` step 2 already says so, and
   § Ship surface makes the drain's scope re-triage read it the same way. An Errand-shaped concern is an Errand
   whatever its target.
3. **Coupling test.** Route into a work unit only when the entry can name the decision or section of the target it
   shapes, recorded on the entry as `_Shapes:_ <decision or section>`. If all it can name is shared domain, the work
   unit is a neighbor, not a home.
4. **Scope-boundary check.** Never route an entry that matches the target's stated exclusions — its Out of scope,
   Won't Do, or Non-Goals. The coupling test is only as good as the target's stated scope, so this check is
   load-bearing, not optional.

Tests 1–4 select one outcome (D9), or the Owner-decided pair where the Errand line is unclear at a door with an Owner
stop (D9). A live, spec-worthy concern for which no candidate passes tests 3 and 4 has no home: it is `new-stub`
— at the drain a `provisional` one unless the Owner commits at the interlock — or, on the fast path without the
commitment, `capture`.

**The horizon advisory — advisory, never a gate.** When a coupled entry's target carries a horizon advisory, routing
shows it to the Owner at the door's Owner stop (D9). The CLI composes it: D11's listing row for a provisional work
unit, a planned one at the lowest priority (P3), or a parked one at any priority carries `horizonAdvisory`, one line
naming the target and its horizon, saying an entry routed there waits for it, and asking whether to raise its priority
— for a parked one, to resume it — or send a separable part now. A parked work unit's entries wait until it resumes,
which nothing schedules. Any other started work unit's owner takes its entries now, and a completed one is no routing
target, so neither carries it. The method evaluates no tier or priority itself. Test 2 already sends an Errand-shaped
concern to execution whatever its target's horizon. What remains is a spec-worthy entry that does shape a far-off
target: routing it there is still right, since the design must be decided together, and the failure is that its
urgency is lost where only the owner reads it at the next pass. A gate on that coarse horizon proxy would refuse good
routes.

### D3 — Homing

Homing establishes, for each finalist, the decision the entry would shape and whether the entry falls in the target's
exclusions — D2's bar, which no index alone meets, so some reading of candidate drafts is unavoidable.

1. **Shortlist** from the entry's own `WU_Target` hint and the work-unit listing, whose rows carry each candidate's
   derived purpose (D11).
2. **Validate at most three finalists by targeted reads.** Read each finalist's design with
   `arc view design --for <slug>`, which reaches a started finalist's current copy where this clone holds its branch
   (D11). Map headings first, then read only the Purpose, the scope boundary, and the section the entry would name.
   `_Shapes:_` keeps this pointed: checking a claim means reading the section it names, not the whole draft (at
   `c009ab198` the two largest drafts ran to 1,189 and 916 lines). For the target the drain routes into, it also reads
   the held entries for their count and the oldest entry's date, which D5's re-triage line reports.
3. **Delegate the reads when they would flood the primary's context** — ordinary read-only derivation under
   `DEV-RULES.ARC` § Sub-agent scope, advisory until the primary reads the named section. Nothing primary-side — the
   door or its allowed outcomes — is serialized to the reader.

### D4 — Integration modes

Two modes, each the default for named doors:

- **Woven into the body (`fold`)** when the router owns the work unit or holds its context — the owner's own pass —
  and where the binding lets an Errand's route-to-home weave into a backlog stub, which anyone may groom (D8).
- **Held as an inbound entry (`hold`)** for the drain, the fast path's routes into another work unit, and any
  foreign-owned target: how an entry fits is the owner's design call at its next pass.

A started work unit takes no woven note from anyone but its owner. An inbound entry carries its provenance
(`routed from <origin>, <date>`) and `_Shapes:_`. How a mode is carried out — which change writes the entry, and what
carries a route the router cannot write — is the binding's (D8).

### D5 — Two-way re-triage at touch

Re-triage runs wherever an inbound entry is already being read, with no new step. It applies D2's own-work
reconciliation at the ready-making owner's pass (A1), otherwise its gate, with the entry's current home as the
incumbent candidate (D9's `host`): keeping the entry is `hold <host>`, folding it is `fold <host>`, re-routing it is
`hold <other>` or `new-stub`, and it may also leave as `errand` or `dismiss`.

**The owner's planning pass.** The owner folds or dispositions every inbound entry before the draft is
formalization-ready, and at the pass that makes it ready may use every outcome but `hold <host>`, so nothing stays held.
The pass runs where a draft's inbound entries already drain: at `draft-design`'s readiness exit, when
`assess-draft-readiness` reports entries not yet integrated, for entries that arrived while the draft was being shaped;
and at `create-spec`'s entry check, for entries routed into a ready draft while it waited. It adds no step to either
workflow. The pass leaves a compact **dispositions table** in the draft: one row for each entry whose disposition no
other record keeps, naming the entry and its outcome, with where a `fold` landed and why an entry was rejected or
dismissed. Review of the draft reads that table for "integrated or consciously rejected"; the readiness check
confirms only that no entry remains held. The table lives as long as the draft and is retired with it at
`create-spec`.

**The drain** re-triages a target's held entries as it routes into that target:

- **Rights.** Only targets the drain may groom: backlog stubs. The drain never removes an entry from a started work
  unit, whose entries only its owner edits or removes. How the drain writes a backlog stub is the binding's (D8). This
  reaches the right population: the dumping grounds are backlog stubs that never reach a planning pass, and the drain
  touches them exactly when it routes something new in.
- **Trigger — an offer, never a mandate.** At the drain's confirmation interlock (`drain-inbox.md` § 3), each
  routed-into target that already holds entries gets one routing-plan line: its held count and the oldest entry's date,
  read beside its scope check (D3), and an offer to re-triage it this sweep. The Owner picks the targets. What backs
  the offer — the drain's judgment, or a computed recommendation — is the binding's (D8).
- **Bounded to outcomes that need no design authority:** `dismiss`, `errand`, `hold <other>`, `new-stub`, and
  `hold <host>` — keeping an entry, or a split's residual rewritten in place. `fold` and `reject` stay the owner's. A
  large set splits per `drain-inbox.md` § 4.
- **An in-flight new home.** When `hold <other>` names a started work unit, how the entry reaches it is the binding's
  (D8).
- **Record.** What moved where goes in the drain's routing plan and in the record its writes leave (D8), never in the
  target's draft.

### D6 — Cascade doctrine

A cascade item is the consequence of a settled decision for another work unit's assumptions, so it can name the
decision it shapes there, and naming it is what makes that work unit affected. The rule: route a cascade item when it
names the decision it shapes in the affected work unit; never re-open that work unit's body mid-pass; never route on
shared domain alone. The cascade rule and the coupling test are one rule. The shipped rule covers work-unit cascades;
this repository's direction-level cascades keep going to its check-docs, outside the method.

### D7 — The "stub this out" fast path

When the session already holds the commitment, the express lane places a concern directly instead of capturing it. It
runs the same gate first: an Errand-shaped concern becomes an Errand, a concern that shapes an existing work unit's
decision routes there, and only otherwise is a stub minted. This guards the mirror failure of the dumping ground:
near-duplicate stubs.

The `new-stub` outcome names the judgments a minted stub may not invent: commitment, priority, a `Class` estimate from
`classify-work-unit`, a slug legible out of context, origin, and dependencies. `arc stub` takes the slug as its `name`
argument and the next four through `--commitment`, `--priority`, `--class`, and `--origin`; it has no option for
dependencies, which go into the minted meta's `Depends On` line. The stub's design carries the concern itself and a
one-sentence Purpose, so later homing can read it (D11); a meta-only stub reports no purpose and is invisible to the
next shortlist. How that design is written is the binding's (D8).

- **The door: a route-now mode of `arc-inbox`, not a new skill.** `arc-inbox` step 1 today stops whenever the concern
  is not "capture for later"; instead it continues into `route-discovered-work` with the fast-path door. The skill
  already classifies by character, and the express-lane rule makes capture versus route-now one question: does the
  session hold the commitment? The skill's `description`, its trigger surface, names the mode so the door is reachable.
- **Until the flip, a write outside the session's own work unit runs as a route-only Errand.** Writing into another
  work unit's tracked draft from this checkout would edit a sibling's artifact from the wrong branch, and minting a stub
  here would write a backlog meta onto this checkout's branch. So a `hold <other>` into a backlog stub, or a
  `new-stub`, that the Owner routes now runs as a **route-only Errand**: `arc-errand`'s route shape, entered after the
  gate, writing as the Errand's own change off the base — its own branch and PR under full protection
  (`run-errand.md` § Ship — full protection, whose lane the existing review threshold picks: the planning-grooming
  case for a self- or ownerless-owned stub, review for another owner's), a direct base commit under partial. Its
  Launch classifies the routing change — writing an entry or minting a stub — not the concern it carries, which the
  gate has already placed, so D12's answers are not shown.
- **Deferred, or where no Errand can open, it is a pre-routed capture:** a `USER-INBOX` capture carrying the decided
  `WU_Target` and `_Shapes:_`. A route into a started work unit is always that capture, for owner adoption (D8). So is
  a now-route where no Errand can open — under partial protection while the primary checkout is occupied
  (`planLocusAllocation`'s `primary-occupied` refusal, reached through `arc errand open`).
- **Directly, either way:** `fold` into the session's own work unit, and `errand`. From the flip, the routing verb and
  `arc stub` write directly and the route-only Errand drops out.
- **A pre-routed capture gets the full gate.** Every Work Unit capture carries `WU_Target`, and a cold capture may carry
  `_Shapes:_` too, so the drain cannot tell a decided route from a capture-time hint and runs the whole gate on every
  new capture. A fast-path capture's `WU_Target` and `_Shapes:_` are the first candidate the drain checks; a
  disagreement goes into the § 3 routing plan.
- **The vehicle is decided.** A now-route never rides the current change; before the flip it is the route-only
  Errand's own publication. If a dedicated mint-and-publish flow for backlog stubs ships before the flip, route-now's
  `new-stub` uses it in place of the route-only Errand's mint leg once it ships.

The vehicles above — the route-only Errand, the pre-routed capture, and when each applies — ship in the method's
binding section and route-now's hand-off (D8). The method body carries the gate-before-mint and the `new-stub`
judgments.

### D8 — Substrate-neutral method, two bindings

The method ships to every project, so it states no storage-program context. It names "a work unit's inbound entries"
and "the routing action", never the buffer section's layout, and keeps everything substrate-shaped in one **binding
section**. The shipped method states only today's binding.

**Until the flip — the shipped binding.** It carries every rule about how an outcome is carried out on today's
substrate. The method body and the door list name outcomes and who may choose them, and point here for the rest.

- **Inbound entries** are the draft's `## Inbound Buffer — Pending Integration` section, written by the drain or the
  owner. Owner adoption (`drain-inbox.md` § 2) carries a gated `hold` into a started work unit; a `WU_Target` naming
  one is a candidate the gate checks first, never a destination by itself.
- **Owner adoption is transit, not rest.** An owner-adoption hold whose capturer owns the target is in transit to that
  owner's session, not resting in a capture surface, which D10's sharper "home" would otherwise read as a breach of the
  invariant.
- **The writer line.** Only a change off the base whose one concern is that routing — the drain's, or a route-only
  Errand's (D7) — writes another work unit's draft, and only a backlog stub's. Every other route — a concern discovered
  during another Errand, a planning pass in another work unit's checkout, a deferred fast-path route — reaches another
  work unit only as a pre-routed `USER-INBOX` capture, which the drain re-runs through the full gate; a started work
  unit takes owner adoption, with the named gap below. This answers when an agent may write directly into another work
  unit's buffer rather than capture, and keeps a routed concern off an unrelated change, which the anti-rider rule
  would otherwise forbid. It lives in the binding, not on an always-loaded surface, since the flip retires it.
- **The dispositions table's rows.** No other record keeps an owner's-pass disposition today, so the table carries a
  row for every entry (D5).
- **The drain's writes.** The drain writes a backlog stub through its own grooming change — a grooming PR off the base
  under full protection, whose body records what moved where, or a direct base commit under partial, whose message
  does (`drain-inbox.md` § 5) — and leaves an in-flight target to owner adoption. A count it reports is shown, never
  compared: whether it recommends re-triaging a target is its judgment over what it already read (D5).
- **An in-flight new home.** When the drain's `hold <other>` names a started work unit, the drain cannot write that
  work unit's draft. When the drain's runner owns the target — the `owner` `arc status <slug> --json` reports (D11) —
  the entry leaves the backlog stub's buffer as a `_Hold` entry in `USER-INBOX`, pre-routed to the target, as owner
  adoption leaves an entry for an in-flight target. When another person owns the target, the entry falls in the named
  gap: it stays, rewritten in place to name its decided target (`hold <host>`).
- **Route-now's vehicles.** The fast path's routes outside the session's own work unit run as a route-only Errand or,
  deferred or where no Errand can open, as a pre-routed capture; a route into a started work unit is always that
  capture (D7). Before writing, the route-only Errand re-runs the coupling and scope tests — and, for `new-stub`,
  homing's shortlist — in its own checkout off the base, since the session's checkout may hold a stale copy of a
  backlog stub or miss one minted since; a changed result returns to the Owner. Invoked directly, the route shape runs
  route-now's gate itself, with the fast-path door, before the Errand opens, and the Owner sees its result there; a
  result other than a now-route goes to `arc-inbox`'s route-now hand-off with the outcome the Owner confirmed, and the
  hand-off carries it without running the gate again. The route-only Errand is route-now's hand-off (Rewrite sites,
  below).
- **Cascade's vehicles.** The cascade door's `hold <other>` and `new-stub` are filed as pre-routed captures (D9).
- **A minted stub's design** is a `draft-*` beside its meta, opening with the one-sentence Purpose and carrying the
  concern, named through `arc stub --design`. The drain's new-stub route writes it too.
- **The named gap.** Nothing carries a route into another person's started work unit: `USER-INBOX` is personal, and
  owner adoption has the same gap. Such a route waits where it is, naming its decided target — a held entry rewritten
  in place in its backlog stub, a new concern as the capturer's `_Hold` capture. The wait is never silent: the door's
  Owner stop (D9) names it, and the Owner's confirmation there is the holder's decision to let it wait. That decision
  answers both rules the wait would otherwise breach — D10's invariant and its dual, `DEV-RULES.ARC` § Planning
  artifacts aren't capture surfaces — and is not an agent's waiver of either.

Nothing enforces the writer line before the flip — `check-foreign-writes.ts` only warns. What holds a route is the
Owner stop each door passes through (D9).

**From the flip — expected contract, not built here.** Available once the storage cutover lands; the method's binding
section is rewritten to it then.

- Inbound entries are a per-work-unit inbound list, projected as `inbound-<slug>.md` beside the draft, merged by entry,
  each entry with a stable `_Id:_`. Any session inserts through the routing verb. A started work unit's entries are
  edited or removed only by its owner; a backlog stub's are groomed by anyone. Owner adoption retires: a capture
  waiting for its owner would rest in a capture surface with its home known. A route into another person's started
  work unit is an insert like any other, so the named gap closes.
- The routing verb serves every door, and an Errand's route-to-home may weave into a backlog stub (D4).
- Routing receipts record re-routes on their own, so the drain's record and the owner's dispositions table need no
  row for a re-route; fold locations and the reasons for rejecting or dismissing an entry stay in the table. A
  computed slot backs the drain's re-triage offer (below).
- A **survivor** — an inbox entry edited after it was routed — is carried, not decided: the drain takes only its new
  content to where its latest routing receipt sent it, an open Errand's description included, by the entry's ID, with
  no gate to run. A note woven into prose keeps no ID, so its survivor routes again, as a follow-up inbound entry.

**What the flip must carry for this design to hold.** This change records these requirements and builds none of them.
They belong to the storage work behind ADR-035 and reach it through that work's coupling register, so no task of this
change delivers them:

- **Rewrite sites.** Of what this change ships, the method's binding section and route-now's hand-off are the only
  places the flip rewrites, with the from-the-flip binding as their target. The hand-off is three sites: `arc-inbox`'s
  route-now step, `arc-errand`'s route shape, and `run-errand.md`'s route-only Errand — Launch's classification and
  Execute's pre-write re-check. Every other caller names the method, not the binding. The drain workflow's own write
  mechanics — its grooming change and owner adoption — predate this change, and the flip rewrites them on its own
  account. `arc view`'s pre-flip arm for a started work unit (D11) is deleted at the flip, not rewritten.
- **`_Shapes:_` as a field** of the inbound entry and of the inbox capture.
- **The CLI reads** (D11): the purpose read moves behind the draft and spec parsers' Purpose field, and `arc view`'s
  rendering of a started work unit's artifacts behind the store, both with unchanged content. `arc view`'s pre-flip
  arm — reading a started work unit from its registered checkout or its selected ref, and the `--path` / `--editor`
  refusal for one with no registered checkout — is a branch on whether state lives off the checkout's branch, which
  the cutover deletes with its help text, since the projection gives every work unit's artifacts a file.
- **A back-pressure slot:** per work unit, the pending inbound count plus the oldest entry's age, with thresholds that
  emit a recommended action and the precomposed re-triage offer D5's drain line uses. The counts in § Introduction /
  Context are its calibration data.
- **The one-time import** converts existing buffer sections into inbound entries, and each pending owner-adoption
  `_Hold` entry into its target's inbound list. Without the first, readiness that reads an empty inbound list as
  drained passes a draft over its stranded entries; without the second, such an entry rests in the inbox with its home
  known.

### D9 — One method: `route-discovered-work`

One method covers disposition, homing, integration, and re-triage:

`route-discovered-work(entry, door, host?) → per concern, one outcome or an Owner-decided pair`

| Input   | Kind     | Contents                                                                                      |
| ------- | -------- | --------------------------------------------------------------------------------------------- |
| `entry` | required | A capture, inbound entry, cascade item, or held concern, with its `WU_Target` and `_Shapes:_` |
| `door`  | required | One door from the closed list below                                                           |
| `host`  | optional | The work unit holding the entry; present only when re-triaging a held entry                   |

The result gives, per concern, its outcome, the D2 test that decided it or own-work coverage (A1), and for a `fold`
or `hold` the `_Shapes:_` it shapes.

- **One concern, one outcome.** An entry carrying more than one concern — or a resolved part and a residual — splits by
  concern first, by the anti-rider rule's concern-identity test (`DEV-RULES.ARC` § Anti-rider), and each part takes one
  outcome. The horizon advisory's "separable part" is such a split.
- **Each door's Owner stop.** The result reaches the Owner before anything is written: at the drain's § 3 interlock,
  the proposal before a route-now, an Errand's proposal before it routes, or the owner's own pass. The cascade door
  has no stop of its own; its routes are captures, and they reach the Owner at the drain.
- **The one pair: the Errand line unclear.** D12 gives no default there. At a door with an Owner stop, the result
  carries both candidates, `errand` and the work-unit outcome, with D12's four answers, and the Owner picks at that
  stop. A single proposal would be the default D12 withholds. At the cascade door, an unclear line returns `capture`,
  and the drain decides.
- **Without `host`,** a new concern runs the D2 gate, homing (D3), and integration (D4), and lands on one outcome or
  the pair.
- **With `host`,** apply D2's own-work reconciliation at the ready-making owner's pass (A1); other concerns run the
  same gate against their current home as the incumbent candidate: staying is `hold <host>`, folding is `fold <host>`,
  and moving is `hold <other>`, `new-stub`, `errand`, or `dismiss`. Re-triage is the gate run in reverse, not a second
  procedure.
- **`door` bounds the outcomes,** so D5's rights rule lives once, here, rather than in each workflow.
- **A hold names one work unit** — the one whose decision the entry shapes — never a group of owners.

**The outcome vocabulary** — closed, defined once in the method, and used by name everywhere else:

| Outcome     | Meaning                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `fold <wu>` | woven into that work unit's body                                                                        |
| `hold <wu>` | held as an inbound entry there                                                                          |
| `new-stub`  | a new work unit, minted through `arc stub`, whose design carries the concern and a one-sentence Purpose |
| `errand`    | an Errand, run now or deferred by the door's own route                                                  |
| `capture`   | to the inbox, home undecided (`WU_Target: TBD`)                                                         |
| `dismiss`   | resolved or obsolete, naming what resolved it                                                           |
| `reject`    | declined on design grounds, with the reason                                                             |

**The doors** and the outcomes each may choose — a closed list:

- **The drain, routing a capture:** every outcome but `reject` and `capture`; `fold` only for a trivially additive,
  on-topic note into a backlog stub. This narrows `drain-inbox.md` § 5, which also lets the drain weave into a work
  unit its runner owns: at the drain, how an entry fits is the owner's call at its next pass (D4). Its `errand` defers
  by the drain's homeless-atomic route.
- **The drain, re-triaging a backlog stub:** `dismiss`, `errand`, `hold <other>`, `new-stub`, and `hold <host>` —
  keeping the entry, or a split's residual rewritten in place (D5). Its `errand` defers by the drain's homeless-atomic
  route.
- **The fast path:** every outcome but `reject`; `fold` only into the session's own work unit, and `capture` only when
  the session lacks the commitment (D7). Its `errand` defers as a `§ Errand` capture. How its routes outside the
  session's own work unit are carried out is the binding's (D8).
- **An Errand's route-to-home:** the fast path's outcomes, routing into another work unit only as the binding allows
  (D8).
- **The owner's planning pass:** every outcome, but not `hold <host>` at the pass that makes the draft
  formalization-ready (D5); `reject` is the owner's alone. Its `errand` defers as a `§ Errand` capture.
- **Cascade at draft close** — a planning workflow, or the author, routing the consequences of settled decisions to
  other work units when a draft closes, including a design-body item the settled scope leaves out of the draft:
  `hold <other>`, `new-stub`, `errand` as a `§ Errand` capture, `capture` with its home undecided, or `dismiss`,
  routing nothing (D6). How its routes are carried out is the binding's (D8). A capture made at draft close without this
  door is ordinary, and the drain gates it (D7).

Any other caller takes one of these doors rather than a new one; a new door is a change to this list. A sweep run
when a work unit starts planning or activates, in its own checkout, for example, pulls in what the work unit's own
change covers without the gate (D2), takes the owner's-pass door for anything else it would bring into that work unit,
and follows D8's writer line for anything it would change in a sibling stub.

**When the gate lands outside the door's set,** that call is the target owner's: a `fold` the door may not make becomes
`hold` on the same work unit, and a held entry the door may not fold or reject stays `hold <host>`. The owner's pass
bars only `hold <host>`, and only at the pass that makes the draft ready, where the owner folds or rejects the entry
instead. An allowed outcome the binding cannot carry out — today, a route into another person's started work unit —
waits as the binding's named gap says (D8).

**Contract shape.** The method takes the method-as-function shape `adversarial-review` uses, so that if method
contracts are later made machine-readable, this one is re-read rather than rewritten:

- **Signature-led.** The one-line signature in the leading blockquote, the named-inputs table, and a typed result —
  the closed outcome vocabulary, defined once in the method. Consumers invoke it with a YAML callsite whose single
  top-level key is the method name, as `draft-design.md` does for `adversarial-review` and `source-grounding`.
- **Decides only.** The method returns outcomes; the caller executes them through verbs — `arc stub`,
  `arc user inbox-remove`, and from the flip the routing verb — after its own interlock. `assess-boundary-fit` draws
  the same line.
- **Deterministic inputs come from the CLI.** The target's lifecycle position and owner, which set door rights and
  decide the binding's in-flight new home, and its horizon advisory come from `arc status` (the per-slug read and
  D11's listing rows), and its design from `arc view` (D11), never inferred from paths.
- **Overridable like every method.** It carries the standard `.override` and `.default` sections; a project may tune
  its rubric. No part of it needs to be closed to override: the door list mirrors the binding's writer line rather
  than owning it.
- **Declares what it fires.** It declares `classify-work-unit` — fired for test 2 and the `new-stub` `Class` estimate —
  in its own `arc.methods` and `related:`.

### D10 — The always-loaded invariant

`DEV-RULES.ARC` § Discovered Work Routing's core invariant makes a stub or draft authoritative "for its domain
concerns" — root cause 1 written into the rule — so "known home" reads as domain fit. The paragraph becomes:

> A work unit's stub/draft is the single authoritative source for the decisions it owns; capture surfaces
> (`USER-INBOX`, the shared `ATOMIC-INBOX`) are transient buffers, never authoritative. An item's home is the work
> unit whose decision it shapes — shared domain alone makes a neighbor, not a home, and an Errand-shaped item has
> none: it runs as an Errand or waits as an Errand capture. Place it by the `route-discovered-work` method. **No item
> with a known home may rest in a capture surface** · `[invariant]`.

The net growth is two sentences, and the method pointer is phrased as a trigger on the operation itself. The invariant
marker and its scope are unchanged; only "home" is sharpened. It is the only always-loaded change this design makes.

### D11 — CLI reads for homing: purpose and owner in `arc status`, the live design in `arc view`

Each work unit's purpose becomes a CLI read, so homing's shortlist is computed rather than grepped. It is **derived,
never stored**: the purpose lives once, as the draft's or spec's `**Purpose:**` thesis, and a meta field would be a
second prose copy that drifts.

- **The read.** Follow the meta's `**Design:**` pointer to its artifact and report the first sentence of that
  artifact's `**Purpose:**` field — a list item (`- **Purpose:**`) or a bare line (`**Purpose:**`), never a
  `## Purpose` heading: the field's text, its wrapped lines joined by single spaces, up to and including the first `.`,
  `?`, or `!` that lies outside a backtick code span and is followed by whitespace or the field's end. When
  `Design` lists more than one artifact, as a layered PRD and RFC do, the read follows the first listed one that has a
  `**Purpose:**` field. The meta and its artifact are read from the record's own source — the checkout for a meta read
  from the checkout, the selected ref for an in-flight meta read from a ref. The value is `null` when the `Design` field
  is `[none]`, when the artifact is missing or unreadable, or when it has no `**Purpose:**` field, as a `brief` spec has
  none, or only an empty one or the template's `—` placeholder. A record with no meta file of its own also reports
  `null`; an archived work unit whose meta and artifact are present reports its purpose.
- **Per work unit.** `arc status <slug> --json` gains `purpose` (string or `null`) and `owner` (the meta's `Owner`, or
  `null`); the human output gains a purpose line when the value is present.
- **Listing.** `arc status --project --json` already emits a typed `facts` row per work unit beside its rendered
  markdown, carrying readiness and dependency satisfaction (`factsFor` in `lib/status/project-view.ts`), built from
  records that already hold priority and owner (`ProjectReadinessRecord`). Each row gains `purpose`, `owner`, and the
  lifecycle `state` and `position` the per-slug read derives — not the record's own `state`, which is the meta
  lifecycle value (`WorkUnitStateSchema`) and cannot tell a started work unit from a backlog stub, or provisional from
  planned. Each row also gains `horizonAdvisory`: D2's advisory text, composed by the CLI for a provisional work unit,
  a planned one at priority P3, or a parked one, and `null` otherwise. Homing needs every candidate's purpose and
  advisory, and the door rights its lifecycle and owner, all at once — one listing beats a call per slug.
- **The live design.** Homing reads a finalist's design to validate it (D3), and that read must reach the work unit's
  current copy. Today `arc view <kind> --for <slug>` resolves the slug from the checkout's own lifecycle projection
  (`resolveExplicitViewTarget` over `buildLifecycleIndex` in `handlers/view.ts`), so for a work unit started
  elsewhere it renders the backlog copy the base branch kept from before the start. It instead resolves the slug
  through the lifecycle composition `arc status` reads (`resolveComposedLifecycleIndex`), over the refs this clone
  already holds, as `arc status <slug>` reads them without `--fetch` (acquisition policy `local`); a start whose branch
  this clone has never fetched still reads as its backlog copy until a fetch brings the ref in. A started work unit's
  artifact is then read from its registered checkout's file when one exists, uncommitted edits included, and
  otherwise from its selected ref (`selectedRefFor` in `lib/status/project-view.ts`), the source the purpose read uses.
  Rendering, `--path`, and `--editor` select the same copy: `--path` and `--editor`, which need a real file, give that
  checkout's file, and for a work unit with no registered checkout they refuse, naming the work unit and its ref, with
  rendering as the way to read it. The work unit's own artifacts follow that copy, and `arc view cohort` reads the
  `**Cohort:**` field from that copy's meta, while the cohort document and the session notes still resolve in this
  checkout. A slug whose started record cannot be read is reported unavailable, never shown from the base branch's
  copy. A new `design` kind renders the artifact the meta's `**Design:**` names, the one the purpose read follows, or
  the first listed one that exists when none has a `**Purpose:**` field, as a `brief` spec has none.
- **First-sentence convention.** Many Purpose fields run several sentences, so the templates that carry one say it
  opens with a one-sentence thesis: `template-draft.md` and the `outline`, `detailed-prd`, and `detailed-rfc` spec
  templates.
- **Forward-compatible.** From the flip, the draft and spec parsers expose Purpose as a parsed field and derived views
  read typed listings, so this read moves behind the parser without changing the field (D8). `arc view` renders a
  started work unit's artifacts from the store with the same content; its registered-checkout-or-ref arm and the
  `--path` / `--editor` refusal are pre-flip, and the cutover deletes them (D8). The `design` kind selects from the
  `Design` list rather than naming a stored artifact kind, so it survives the flip and resolves each entry through
  the store.

### D12 — The Errand / work-unit line: a record test

`classify-work-unit` boundary test 1 puts the floor at "a design worth recording" without saying what makes a design
worth recording, and ADR-027's derivation floor says "the act of _deriving_ is the signal, and ARC records it either
way". So "carries a design fork" reads as crossing the floor. The line is about the record, not the discussion. An
Errand's record is its own change — the stated intent, the diff, and the commit and PR text — and working a decision
out with the Owner in conversation does not by itself make a work unit.

**Classification is the Owner's call.** It commits them to ceremony, so it is an authorization reserved to them
(`DEV-RULES.ARC` § Rule Authority). The agent proposes with the four answers below in front of the Owner, and the test
settles nothing on its own. D12 adds no stop of its own: the answers ride the points where placement already reaches
the Owner — the proposal `DEV-RULES.ARC` § Leave it cleaner requires before acting, the Owner's own Errand invocation,
the drain's § 3 interlock, and `init-work-unit.md`'s stop before promotion. Where the line is unclear, D9's pair rides
the door's Owner stop. `run-errand.md`'s Launch confirmation shows the Owner the four answers only when one is
yes, and a capture's section stays a provisional hint the drain decides.

It is a work unit when any answer is yes:

1. **Steps not knowable yet.** A step cannot be named without first mapping the code to find it, or the Owner says one
   sitting will not hold the work. No question asks the agent to estimate duration: a sweep whose steps are known stays
   an Errand however many files it touches. Waiting does not count — an Errand that waits on review, a merge, or another
   work unit stays an Errand; needing several sittings of work is what the Owner's answer names.
2. **A deliberate exclusion.** The change leaves out something a reader would expect, and it must stay left out. That
   exclusion is a scope boundary — pre-commitment text the outcome is judged against, the floor a `brief` spec serves —
   and an Errand's intent line has nowhere to state it.
3. **Costly if wrong.** Putting a wrong choice right would take more than another Errand: persisted data to migrate, or
   a contract other work builds on to unwind.
4. **The decision outgrows its line.** An Errand records each fork it settles as `Decided: X over Y — because Z` in its
   PR body and commit. When a later reader would need the alternatives and rationale, not just the choice — past a
   couple of lines — it needs a written design.

Otherwise it is an Errand, design discussion included.

**Unclear cases.** When the work is happening now, run it as an Errand and promote the moment any answer flips —
`run-errand.md`'s promote step, its trigger made concrete. The answer names the floor: question 1 is `scale`
(`Active`, with a brief and a task list), and questions 2–4 are `derivation` (`draft-design`, which may still reach a
brief spec). When both kinds flip at once, `derivation` wins: the planning it enters goes on to the spec and the task
list, the plan the scale floor asks for. Under full protection the floor is what `arc errand promote --floor` takes.
Under partial protection there is no Errand branch to promote — `promoteOrdinaryErrand` refuses with
`full-protection-required` — so the exit `init-work-unit.md` already names applies: stop the direct base edits and
start a work unit at the stage the floor names, carrying any landed Errand commit as context. When the work is not
happening now, there is no default: at a door with an Owner stop, the method returns both candidates and the Owner
decides there (D9).

**Deciding and guarding are separate.** The questions decide. They deliberately do not ask whether a wrong choice would
fail quietly — a subtly wrong always-loaded rule is cheap to fix once noticed, and asking would make nearly every
shipped-workflow edit a work unit. The quiet direction, an Errand that needed design it never got, is guarded instead:
the Decided line gives each settled fork a witness that review can challenge and a later reader can find, the reviewed
lane already takes load-bearing infrastructure (`arc-inbox` step 2), and the promote trigger fires when the line will
not fit.

**Where the line lives.** `classify-work-unit` boundary test 1 carries the four questions as the canonical floor,
reading the two axes it already names at their sub-floor — question 1 the scale axis, questions 2–4 the derivation axis
— and `strategy-work-organization.md` points at it rather than keeping its own copy. The four questions are the whole
floor, so the strategy's decision-matrix criterion "tracked or resumed as future or owned work" and its create rule
retire:

- A roadmap slot is when, not what: Errand-shaped work for later waits as a `§ Errand` capture.
- An owner follows from the wrapper and never decides it. A full-protection Errand has one — today its transient
  identity's claim — while a partial-protection Errand is a direct base commit with neither.
- A dependency is waiting, which question 1 excludes.
- Making a stub is the `new-stub` outcome for a concern these questions call a work unit — a transient act through
  `arc stub`, by any door D9 lets choose `new-stub`, never a work unit itself.

**The ADR.** Retiring the create rule and the criterion reverses part of ADR-021's Decision — its threshold criterion
3 and its create rule that a backlog stub "is a (small) WU" — and the record test replaces ADR-027's derivation test
("the act of _deriving_ is the signal"). `strategy-adr-methodology.md` § Choosing the right tier routes reversing or
significantly altering a decision to supersession, a new ADR, so a new ADR records D12. ADR-027 is the precedent for its
reach: it altered ADR-021's threshold in a new ADR and left ADR-021 not superseded, with a forward-pointer amendment.
Neither ADR is superseded here: ADR-021's work classes stand, as do ADR-027's two-floor structure, its Errand
mechanism, and its record-owned identity. Each gains a forward-pointer amendment, ADR-027's saying its derivation test
is replaced by the record test.

The `Heavy` derivation trigger (test 2) is unchanged. The always-loaded Errand entry in `AGENT-BRIEF.ARC` ("no design
worth recording") reads true under the record test, so D10 stays the only always-loaded change.

### Ship surface

Package source first (`packages/arc-framework/arc/`), synced to `.arc/` per `DEV-RULES.PROJECT` § Package-Project
Sync. Canonical skill sources live under `system/.internal/skills/` and are re-rendered to the harness skill
directories.

**The method — `system/methods/route-discovered-work.md` (new).** D1–D9:

- the leading blockquote with the D9 signature and contract, the named-inputs table, and the typed result;
- the disposition gate with the horizon advisory (D2), homing (D3), integration modes (D4), re-triage with the owner's
  pass and its dispositions table and the drain's rights, trigger, bounds, and record (D5), and the cascade rule for
  work-unit cascades (D6);
- the outcome vocabulary, the closed door list, and the outside-the-door fallback (D9);
- the fast path's gate-before-mint and `new-stub` judgments (D7);
- one **binding section** carrying D8's until-the-flip binding — the buffer section, owner adoption as transit, the
  dispositions table's rows, the writer line, the drain's writes, the in-flight new home, route-now's and the
  cascade's vehicles, a minted stub's design, and the named gap with its Owner-confirmed wait — and nothing
  storage-program-specific. The body and the door list name outcomes and who may choose them, and point to the
  binding for how each is carried out;
- `arc.methods` and `related:` naming `classify-work-unit`.

Its prose names no internal work unit, ADR, or corpus figure. It registers in every inventory a shipped method joins:
`init-recipe.json` `include_files`, `CONFIGURABLE_FILES` in `lib/classification.ts`, the self-hosting manifest, the
init, update, framework-sync, and E2E install inventories, the unit init test's file and classification checks, and
`strategy-package-project-sync.md`'s inventory, whose Configurable and installed-file counts match the recipe.

**Methods, edited:**

- **`classify-work-unit.md`** — D12. Boundary test 1 carries the four questions as the canonical floor, mapped onto its
  two axes at their sub-floor; `related:` gains `route-discovered-work`.
- **`README.md`** — § Related Methods gains a `route-discovered-work` row (`classify-work-unit`) and the reciprocal
  entry on `classify-work-unit`'s row.

**Workflows, each with an `arc.methods` declaration of `route-discovered-work`, a callsite, and a fire-point marker:**

- **`supplemental/drain-inbox.md`** — gains an `arc:` frontmatter block. § 2 classification runs the method with the
  drain doors: verify-before-routing becomes D2 test 1; the scope re-triage defers to D12 and drops load-bearing
  infrastructure as a floor; the Home rule becomes the coupling and scope-boundary tests with homing. In-flight target
  adoption runs after the gate: a `WU_Target` is the gate's first candidate, and owner adoption carries only a gated
  `hold` into a started work unit (D8), in § 2 and in § 5's owner-adoption default alike, whose user override goes,
  since nothing else reaches a started work unit (D8). § 3's routing plan is the drain door's Owner stop and carries
  D5's re-triage line per routed-into backlog stub that holds entries; a stub the Owner picks has its held entries
  re-triaged through the re-triage door, the revised plan is confirmed at the same stop, and § 5 carries those
  outcomes out, recording what moved where in the grooming change, never in the target's draft (D5, D8). § 5's
  existing-stub home writes only a backlog stub's draft, and § 2's destination-path overlap list follows (D8). § 5's
  integration modes defer to the method, with the drain door's narrower weave (D9); a held entry carries `_Shapes:_`
  beside its provenance (D4); its integration obligation is the owner's pass (D5); its new-stub route always writes
  the stub's design, not only when scope warrants (D7, D8); and its homeless-atomic route takes every deferred
  `errand`, since an Errand-shaped item has no work-unit home (D10).
- **`supplemental/run-errand.md`** — route-to-home for a concern an Errand discovers (the Errand route-to-home door);
  the Decided line (D12) in its lean PR body and its commit; Launch's confirmation showing D12's four answers when one
  is yes, and classifying a route-only Errand by its routing change, not the concern it carries (D7); the promote
  step's D12 trigger, leaving the floor to the Promote Errand path it already defers to; and, for a route-only Errand,
  Execute's pre-write re-check, a fast-path callsite run in the Errand's checkout before it writes (D8). It also
  declares `classify-work-unit`, which its Launch classification and promote trigger apply.
- **`draft-design.md`** — at the loop-exit readiness check, a not-ready gap for inbound entries not yet integrated is
  resolved by running the method with the owner's-pass door, which leaves the dispositions table (D5). No step is
  added.
- **`create-spec.md`** — the entry check runs the method with the owner's-pass door for a draft that still holds
  inbound entries at entry, leaving the dispositions table (D5).
- **`work-unit-lifecycle/planning/init-work-unit.md`** — the Promote Errand path names the floor by D12's answers:
  question 1 `scale`, questions 2–4 `derivation`, `derivation` winning a tie. No method declaration change.

The two-floor summaries in `arc-errand`, `arc-inbox` step 2, `run-errand.md` Launch, and `init-work-unit.md` stay,
since they read true under the D12 mapping.

Every consumer, workflow or skill, shows the method's result at its door's Owner stop (D9): the outcome, D9's
Owner-decided pair where the result carries one, the horizon advisory of a coupled target that carries one (D2), and
any wait the binding names (D8).

**Skills** (a skill carries no `arc:` block, so each gets a callsite only):

- **`arc-inbox`** — step 1 continues into the method's fast-path door when the session holds the commitment
  (route-now) instead of stopping; the `description` names the route-now mode, and the skills README's `arc-inbox`
  line follows it; step 2's infra-smell note no longer invites escalating to a Work Unit on a design fork alone,
  keeping it as a review-lane signal (D2, D7); step 3's `## Work Unit` shape reads `WU_Target` as a candidate the
  drain's gate checks, not a destination its existence decides, and its descriptors gain `_Shapes:_` (D2, D7); step 5
  gives no Errand-class capture a work-unit home, so every one takes the drain's homeless-atomic route (D10).
- **`arc-errand`** — step 1's route shape writes only after route-now's gate, which its own fast-path callsite runs
  before the Errand opens when the shape is invoked directly, as the pre-flip vehicle for a now-route, writing backlog
  stubs only, and only once `run-errand`'s pre-write re-check agrees; step 2's account of Launch says a route-only
  Errand is classified by its routing change (D7, D8).

**Strategy — `strategy-work-organization.md`** — D12:

- § The boundary tests' test 1 and § Work Character's floor statements point at `classify-work-unit` test 1 instead of
  restating the floor; § Work Character's account of atomic character stays.
- § Worked examples' widely-used-symbol rename clears question 1: a correct plan cannot name its call sites until the
  surface is mapped.
- § Errand Work Class's opening Work Unit and Errand definitions and its character layer take the line from
  `classify-work-unit` test 1. Its create-versus-maintain paragraph — criteria 1–3 and "create trips criterion 3" —
  gives way to a pointer to the same test and a sentence naming what does not decide the line — a roadmap slot, an
  owner, a dependency, each for D12's reason — and the symptom check re-examines a candidate against the four
  questions. The decision matrix keeps one row, maintaining an existing artifact, across its self-contained and
  cross-cutting columns; its intro and the paragraph beneath it no longer state the create rule, and a sentence beside
  it states a new stub as the `new-stub` outcome, made by a transient act.

**Strategies and the shared-inbox template — the capture's target and absorption** (D2, D10):

- **`strategy-session-operations.md`** § USER-INBOX — a `## Work Unit` entry's `WU_Target` is a candidate the drain's
  gate checks, not a destination its existence decides; its Lifecycle paragraph's "`§ Errand` items to their target
  stub" becomes the drain's homeless-atomic route, since an Errand-shaped item has no work-unit home (D10).
- **`strategy-planning-module.md`** — § `backlog/ATOMIC-INBOX.md` and § Shared-Inbox Write Discipline's "Read at
  activation" and "Read at planning-kickoff": activation and planning kickoff pull in items the work unit's own change
  covers (the same concern, by the anti-rider rule), not items whose home "turns out to be" the work unit or its
  domain. § `backlog/ATOMIC-INBOX.md`'s "single-step work with no better home than the shared surface" and "flushing
  homeless `USER-INBOX § Errand` items", and § Shared-Inbox Write Discipline's "genuinely homeless `§ Errand` items",
  become every `§ Errand` item, and § How Work Flows Through's "§ Errand items route to their home" becomes the
  homeless-atomic route, as above (D10).
- **`backlog/ATOMIC-INBOX.template.md`** — the shipped header's "single-step captures with no better home" and "only
  genuinely homeless single-step items rest in this shared surface" become every Errand-class capture, none of which
  has a work-unit home (D10).

**Rules — `DEV-RULES.ARC.md`** § Discovered Work Routing: D10's paragraph replaces the core-invariant paragraph.

**Templates** — D11's first-sentence convention, per template:

- `template-draft.md` — the Purpose guidance says it opens with a one-sentence thesis;
- `template-spec-outline.md` and `template-spec-detailed-rfc.md` — the Purpose placeholder says the summary opens with a
  one-sentence thesis;
- `template-spec-detailed-prd.md` — "Single sentence preferred" becomes "opens with a one-sentence thesis".

**ADR (internal, `.arc/reference/adr/`)** — a new ADR at the next free number records D12's record test, replacing
ADR-027's derivation test, and the retirement of ADR-021's create rule and threshold criterion 3, with its rejected
alternatives. ADR-021 and ADR-027 each gain a forward-pointer amendment. No shipped file cites the ADR.

**CLI** — D11: `arc status <slug>`'s `purpose` and `owner` (JSON) and purpose line (human output); the
`--project --json` `facts` rows' `purpose`, `owner`, `state`, `position`, and `horizonAdvisory`; and `arc view`'s
`--for` resolution through the lifecycle composition, its registered-checkout-or-ref read, its `design` kind, and the
`--path` / `--editor` refusal for a work unit with no registered checkout, with its help text and
`QUICK-REFERENCE.template.md` § Artifact Viewing and its project copy.

## Alternatives & Rationale

- **The original charter — a DRY extraction of the drain's integration-mode fork with no behavioral change.**
  Rejected: it codifies the domain-only home test that causes the problem.
- **An interim CLI count over the buffer section.** Rejected: the inbound kind has no home in the store before the
  flip (`"work-item/inbound": entry(unhomed)` in `lib/store/registry.ts`), so the reader would be deleted at cutover,
  and a numeric threshold evaluated in workflow prose is the anti-pattern `strategy-procedure-evolution.md`
  Principle 1 names.
- **A pre-flip sweep of all 509 entries.** Rejected: replication-shaped work duplicating what re-triage at touch does
  for the drafts that matter, while untouched drafts cost nothing where they sit.
- **Building the post-flip mechanics here, behind a dependency on the storage program.** Rejected: it parks the policy
  fix behind the whole program, and the inbound kind belongs to the storage work that defines it.
- **An always-loaded routing threshold** — when to write another stub's buffer directly versus capture. Rejected: it
  grows the always-loaded set for a rule the flip retires; it lands in the method's until-the-flip binding (D8).
- **A second "scout" homing tier** — subagents per candidate draft returning a fit report when the cheap tier is
  ambiguous. Rejected: it adds a return schema, its own launch instructions, and a second delegation contract beside
  `adversarial-review`'s, where the existing delegation rule plus the pointed read cover the need. Its one load-bearing
  output, the candidate `_Shapes:_`, survives as what the primary verifies. Reinstate it only if a real drain shows the
  targeted reads failing.
- **A family of methods (gate, homing, re-triage) instead of one.** Rejected: every step has at least two consumers, so
  extraction is earned (`strategy-knowledge-evolution.md` Principle 6), but the steps share one gate and one vocabulary,
  and every consumer runs two or more together. A family would restate tests 1–4 or chain its members and add
  declarations and fire-point markers no consumer uses alone. Homing is a section inside.
- **The name.** `route-discovered-work` anchors to the operation, not a workflow (`strategy-knowledge-evolution.md`
  Principle 3, whose own example of an operation-anchored trigger is "routing discovered work"), and matches
  `DEV-RULES.ARC` § Discovered Work Routing, which D10 points at it. An `assess-*` name reads as a check rather than an
  act; an `inbound-*` name is too narrow for a method that also routes to Errands, new stubs, and the inbox.
- **The horizon advisory evaluated in the method's prose** — "provisional, planned at P3, or parked" read from the
  listing. Rejected: a comparison over state written in prose, and advisory text templated there, are what
  `strategy-procedure-evolution.md` Principles 1 and 6 assign to the CLI, so D11's listing composes the advisory and
  the method only shows it.
- **A design locator in `arc status`** — a path and ref the method reads with `git show`. Rejected: reading state
  through Git is the anti-pattern `strategy-storage-evolution.md` Principle 1 names, and a ref-shaped field would change
  shape at the flip. `arc view` already reads artifacts for a slug and holds its pre-flip arm behind the CLI (D11).
- **A horizon gate.** Rejected for an advisory (D2): the horizon proxy — commitment tier and priority — is too coarse to
  refuse a route on, and test 2 already covers the Errand-shaped case the gate was proposed for.
- **A session-length test for the Errand line** ("will it finish this session?"). Rejected: it asks the agent to
  estimate duration, which it cannot do reliably. D12's first question asks whether the steps are knowable, and
  session capacity is the Owner's input.
- **Leaning to a work unit whenever the Errand line is unclear.** Rejected: leaving a running Errand is the cheap exit,
  and the Decided line and the promote trigger surface an under-designed Errand when it matters (D12). The exit has
  costs this accepts: in-place promotion occupies the primary checkout, and under partial protection the exit is a
  restart as a work unit rather than a promotion.
- **Keeping the decision matrix's create rule and tracking criterion beside D12.** Rejected: making a stub is a
  transient act, and a roadmap slot, an owner, or a dependency does not tell an Errand from a work unit. Kept, they
  would make "track it for later" a reason to stub Errand-shaped work, the escalation D12 exists to stop.
- **Route-now in `arc-errand`'s route shape rather than `arc-inbox`.** Rejected: from the flip a route is one
  routing-verb call with no Errand to run, so that door would outlive its wrapper. The trigger anchors to routing
  discovered work (`strategy-knowledge-evolution.md` Principles 2 and 3), and the route shape serves as the pre-flip
  vehicle instead (D7).
- **Writing a now-route from the current checkout.** Rejected: it would edit a sibling's tracked artifact from the wrong
  branch, or write a backlog meta onto an unrelated branch, against the anti-rider rule (D7, D8).
- **The Errand line as its own work unit.** Rejected: D2's test 2 is that line applied at routing, and the evidence for
  it is this work's own. Split out, routing would ship citing a floor read two ways, or wait on it.

**Boundary.** `assess-boundary-fit` returns **stays one work unit**. Disposition, homing, integration, and re-triage
are one concern designed as a whole: each step's rule depends on the others, and the fast path and cascade routing are
doors onto the same gate. The pieces that would be orthogonal — the inbound kind, an iteration-time drain step in
`draft-design`, the inbox model, and skill-door conventions — stay outside this change (§ Non-Goals) rather than being
cut out of it. Folding D12 in was re-checked as new evidence, since it rewrites the floor of the `Class` model: D2's
test 2 is that floor applied at routing, so it stays. D11's CLI reads are independently landable but small, and
homing is what needs them, so no delivery plan is warranted; ordinary review chunking covers it.

## Cross-cutting Considerations

- **Always-loaded growth.** Two sentences in `DEV-RULES.ARC` § Discovered Work Routing (D10), phrased as a trigger on
  the operation (`strategy-knowledge-evolution.md` Principles 2, 3, and 10). No other always-loaded surface changes:
  the writer line lives in the method's binding (D8), and `AGENT-BRIEF.ARC`'s Errand entry reads true under D12.
- **Audience boundary.** The method, the edited methods, workflows, skills, strategy, rules, and templates ship to
  every project. Their prose names no internal work unit, ADR, storage-program context, or corpus figure, and carries
  no transitional framing. The from-the-flip binding and § Introduction / Context's evidence live in this spec and the
  ADR, never in shipped text.
- **Method loading.** Each consumer declares the method in `arc.methods`, and `lint:arc:triggers`
  (`audit-method-triggers.ts`) fails CI for a method no workflow declaration reaches. Nothing validates that a declared
  method's fire-point is marked, so each consumer's callsite marker is checked by hand.
- **Package sync.** Every edited Framework file is identical in the package source and the project copy; the skills'
  harness renderings match their canonical sources.
- **CLI compatibility.** `arc status` gains fields additively; no existing JSON field changes meaning, and the rendered
  project view is untouched. `arc view --for` changes which copy of a started work unit it reads, a correction, since
  the copy it reads today is stale; it gains one kind, and `--path` and `--editor` gain one refusal, for a work unit
  with no registered checkout.
- **Testing.** Unit coverage for the purpose read across a drafted work unit, an `outline`- or `detailed`-specced one, a
  `brief`-specced one, a meta-only stub, a `Design` pointing at a missing artifact, and an in-flight work unit read from
  a ref; first-sentence extraction across a multi-sentence Purpose, a period inside a code span, and a single sentence
  with no terminator; the `owner` field present and absent; `arc view --for` on a started work unit rendering its
  selected ref's copy rather than the base branch's backlog copy, and its registered checkout's file, uncommitted edit
  included, when one exists, with `--path` naming that same file and refusing for a work unit with no registered
  checkout; the `design` kind following `Design` for a drafted, a specced, a layered, and a `brief`-specced work
  unit; and the listing rows' new fields, including lifecycle `state` and `position` distinguishing a started work
  unit from a backlog stub and provisional from planned, and `horizonAdvisory` present for a provisional work unit, a
  planned P3 one, and a parked one, and `null` for a planned P1 or P2 one and for an unparked started or a completed
  P3 one.
- **Migration and rollout.** No data migration and no sweep: existing buffer sections stay and are re-triaged when
  their home is next touched. An entry routed before this change and lacking `_Shapes:_` is re-checked through the gate
  at that touch. Under the pre-public-release posture, no compatibility shim is added for the retired decision-matrix
  criterion.
- **Drain cost.** The drain is the heaviest routine ceremony; the coupling and scope checks add targeted reads per
  routed entry. The three-finalist cap and the pointed read bound it (D3); § Open Questions tracks whether it holds.
- **The ADR record.** The new ADR records the reversal of an accepted decision; the forward-pointer amendments keep
  ADR-021 and ADR-027 readable as standing records.

## Success Criteria

- **Replay.** An evaluator given the method and the 30 routed-in entries of `quality-gate-hooks`' draft as they stood
  at `7ea9addfa` — and not that draft's § Buffer triage in any version that carries it, from `d229217cf` on — judges
  liveness and homes against the tree at `c009ab198`, which those verdicts were triaged against, and reaches the hand
  verdicts recorded there at `2bc91c7a4` from rules the method states: a split verdict as one outcome per
  part, a two-option verdict as either option, and every disposition naming its D9 outcome and the D2 test that
  decided it, with no judgment the method leaves unnamed. Test 4 catches the two entries that arrived after that
  draft's out of scope had excluded their subject.
- **Route-now dry run.** A classification-only run of `arc-inbox`'s route-now mode, with no writes, over four
  constructed concerns: one that shapes an existing work unit's decision routes there with its `_Shapes:_` instead of
  minting a stub; one with no home returns `new-stub` with its commitment, priority, `Class`, slug, origin, and
  dependencies named; an Errand-shaped one returns `errand`; and one whose Errand line is unclear returns D9's pair
  with D12's four answers.
- **Drain dry run.** A classification-only run of the updated drain (§ 1–§ 3, no writes) over the `USER-INBOX` in hand
  at verification — seeded, where it lacks them, with a capture whose home is a backlog stub that already holds
  entries, a capture whose home is a provisional or planned P3 stub, and a capture whose Errand line is unclear —
  produces a routing plan in which every `hold <wu>` carries a `_Shapes:_` naming a section that exists in its target,
  none matches its target's stated exclusions, a hold into a provisional or planned P3 target shows its horizon
  advisory, each routed-into backlog stub that already holds entries appears with its held count, oldest date, and a
  re-triage offer, a stub picked for re-triage takes only the outcomes D9 gives the drain re-triaging a backlog stub,
  and an unclear Errand line appears as D9's Owner-decided pair.
- **Purpose and owner.** `arc status <slug> --json` reports `purpose` as the first sentence of the `Design` artifact's
  `**Purpose:**` per D11's rule, `null` for a meta-only stub, a `brief` spec, or a missing artifact, and reports
  `owner`. Each `facts` row of `arc status --project --json` carries `purpose`, `owner`, the per-slug `state` and
  `position`, and `horizonAdvisory` — text for a provisional work unit, a planned P3 one, or a parked one, `null`
  otherwise — and an in-flight work unit's purpose is read from its selected ref.
- **The live design.** Run from a checkout of the base branch, `arc view design --for <slug>` for a work unit started
  elsewhere, whose branch this clone holds, renders the spec or draft its meta's `Design` names — from its registered
  checkout's file, uncommitted edits included, when one exists, otherwise as its selected ref holds it — never the
  backlog copy the base branch keeps; `arc view spec --for <slug>` reads the same source; and `--path` names the same
  file that rendering reads, or refuses with the work unit and its ref when it has no registered checkout.
  `QUICK-REFERENCE` § Artifact Viewing states the same selection.
- **The method.** `route-discovered-work.md` ships carrying D9's signature, named inputs, and result; the D2 gate with
  the horizon advisory; homing; integration modes; re-triage; the cascade rule; the outcome vocabulary; the closed door
  list with the outside-the-door fallback; the fast path's gate-before-mint; and one binding section with D8's
  until-the-flip binding, and no rule about carrying out an outcome on today's substrate outside it. It declares and
  relates `classify-work-unit`, names no internal work unit, ADR, or storage-program context, and resolves in every
  inventory § Ship surface lists, with the package-sync strategy's counts matching the recipe.
- **Consumers.** `drain-inbox.md`, `run-errand.md`, `draft-design.md`, and `create-spec.md` each declare the method,
  invoke it at a marked fire-point, and carry the § Ship surface edits; `run-errand.md` also declares
  `classify-work-unit`. `init-work-unit.md`'s Promote Errand path maps D12's answers to `--floor`. `arc-inbox` carries
  the route-now mode in step 1 and its `description`, the revised infra-smell note, step 3's `WU_Target` and
  `_Shapes:_` reading, and step 5's homeless Errand capture; `arc-errand` carries the gated route shape and the
  route-only Launch classification, and `run-errand.md` the route-only Errand's pre-write re-check.
  `strategy-session-operations.md`, `strategy-planning-module.md`, and the `ATOMIC-INBOX` template's header carry the
  § Ship surface readings. No consumer restates the gate's tests or the outcome vocabulary.
- **The Errand line.** `classify-work-unit` boundary test 1 carries D12's four questions mapped onto its two axes.
  `strategy-work-organization.md` points at it from § The boundary tests, § Work Character, and § Errand Work Class,
  keeps no copy of the old floor or criterion 3, keeps the one-row decision matrix with the `new-stub` sentence, and
  carries the rename example's question-1 reading.
- **The invariant.** `DEV-RULES.ARC` § Discovered Work Routing carries D10's paragraph verbatim; no other always-loaded
  surface changes.
- **The record.** The new ADR is `Accepted` and records the record test and the retirement, with ADR-021 and ADR-027
  each carrying a forward-pointer amendment and neither superseded.
- **Templates.** The four templates carry the first-sentence convention.
- `lint:arc:triggers` passes. Every edited Framework file is identical in the package source and the project copy, and
  every commit passes `check-package-sync.sh`.
- All quality gates pass (tests, linting, type checking).
- Ready for integration.
- **Own-work reconciliation (A1).** A live cleanup already covered by the host's same concern is pulled in without a
  routing outcome at kickoff/activation and returns `fold <host>` with own-work coverage and its `_Shapes:_` at the
  ready-making owner's pass. A resolved part is dismissed before reconciliation; an independent all-No concern that
  shares its file still returns `errand` through the ordered gate.

- **Replay calibration (A2; supersedes Replay).** A fixture-confined evaluator covers all 30 entries at `7ea9addfa`
  against `c009ab198` with the current method, without historical triage or author conclusions. Split distinct concerns
  and resolved/live parts. Each proposal names its deciding rule and source evidence; each fold/hold names `_Shapes:_`
  validated against actual target scope and exclusions. An unclear floor returns the Owner pair and all four answers.
  Both knowledge-content entries are excluded from the host, and the own-work timing/independent-concern contrasts
  pass. Every historical disagreement, source uncertainty, or omitted candidate has an explicit Owner disposition
  before closure. Preserve the original failed historical-parity reports; neither a pair nor a primary source
  correction is recorded as historical equality.

## Open Questions

- **Whether the gate holds in the drain's real cost envelope.** The coupling and scope checks must not make the drain
  unrunnable at a large sweep (85 captures is the largest seen). Resolved by the first real drain after landing.
- **Whether `_Shapes:_` is answerable at capture.** Prototype captures name their target's decision; whether a cold
  capture can is untested. If not, the drain supplies it and the capture-time value stays a provisional hint. Resolved
  by use.
- **Whether the live routes match the dry run.** In the first drain after landing, every `hold <wu>` carries a
  `_Shapes:_` naming a section that exists in its target, none matches its target's exclusions, and each routed-into
  backlog stub that already held entries appears with its count, date, and offer. The first route-now use runs the gate
  before minting, and a concern that shapes an existing work unit's decision routes there instead. Resolved by use,
  after this change ships.

## Amendments

- **A1** — 2026-10-09 — design: own-work reconciliation at the ready-making pass.
  _Supersedes:_ D2 ¶1; D9 host rule. _Trigger:_ 2.2 segment. _Work:_ 2.R. _Revalidated:_ pending → 2.3.
- **A2** — 2026-10-09 — design: adjudicate replay proposals with Owner judgment.
  _Supersedes:_ Replay; Phase 2 exit. _Trigger:_ 2.2 segment. _Work:_ 2.R2. _Revalidated:_ pending → 2.3.

---
