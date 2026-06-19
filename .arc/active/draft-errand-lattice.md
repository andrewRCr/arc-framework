# Draft: Errand Lattice

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). **Absorbs the retired
  `maintenance-errand-class`** (its errand-vs-WU character gate, the "relocates-never-authors" invariant, and its
  vocabulary/definition cascade were folded into the origin lifecycle draft this member carries forward).
- **Cohort:** `lifecycle-state-machine`
- **Purpose:** Model the errand lifecycle as a **distinct lattice adjacent to** the `(phase, location)` WU lattice —
  **one concept with a mode-scaled mechanism** (a rich lattice under full protection; a collapsed floor under
  partial) — name its crossing edges, give the full-protection errand a **record-owned identity** (decoupled from its
  branch), re-base the **errand-vs-WU gate** from increment-count onto spec-worthiness, and cascade that model
  consistently across the load-bearing definitions **and the operational capture/routing surfaces** — so a gapless
  lifecycle machine has a real entry predicate where multi-step single-concern maintenance currently falls through.

> Shared context — the WU lattice, the crossing-edge firing points (`lifecycle-transition-core` owns them), and
> the cohort-level coordination — lives in `cohort-lifecycle-state-machine.md`.

---

## Problem / Motivation

Errands cross the WU lattice unmodeled, and the gate that admits them is wrong. The codified wrapper floor
(`strategy-work-organization` § Class Model, boundary test #1) reads *"more than one review increment → WU"* — so
**multi-step single-concern maintenance is homeless**: one logical concern, several increments, no design to author —
a decomposition, a housekeep drain that fans out, a doc-grooming sweep, a ROADMAP re-render cascade. Forced into the
WU wrapper each gets an empty `spec` + a `tasks` list that just restates the inbox; forced into the atomic-errand
wrapper it doesn't fit (not one increment). So it's hand-rolled off-script every time. That hole sits exactly where
the lattice's **entry predicate** belongs — a gapless model needs the character gate re-based off increment-count.

A second incoherence: the errand model is **substantively full-protection-shaped**, with partial protection bolted
alongside as a degenerate case. `chore/<slug>` is the identity-and-state oracle; under partial protection there is no
branch at all. ADR-021 flagged exactly this at the 2026-05-31 re-pivot (the retired errand queue was
"`branch.protection: full`-shaped"); the residue persists in how identity and state are still derived from the
branch. A coherent lattice has to say what an errand *is* across both modes — one concept, scaled — not one
mechanism with an exception clause.

## Resolved model

### The errand is one concept with two layers

An errand is a single **work character** (off-WU, single logical concern, below the WU wrapper) whose **mechanism is
a mode-scaled projection**. The two layers are the spine of everything below:

- **Character layer (universal).** The errand-vs-WU gate — mode-independent. Same word, same judgment, same decision
  in every protection mode. This is what a developer learns once and reuses across a full-protection team repo and a
  partial-protection solo repo.
- **Mechanism layer (mode-scaled).** What the character *materializes into* depends on `branch.protection`:
    - **Partial — the floor.** A direct base commit tracked by its `standalone (...)` context footer; **commit-then-
      done**. No branch, no lifecycle, no record beyond the footer, nothing to discover, no cross-machine resume. A
      *multi-increment* partial errand is just sequential base commits, each already landed — nothing to gather or
      resume.
    - **Full — the rich lattice.** A `chore/<slug>`-or-nature-typed branch + PR with a derived lifecycle, a
      record-owned identity, and discovery. Detailed below.

**The collapse is the correct treatment, and the guardrail is one-directional.** No part of the full-protection
apparatus (branch, PR, lifecycle states, identity record, discovery) may be pushed down onto the partial floor for
the sake of model symmetry. The model's job is to *sanction* partial's near-zero mechanism as the legitimate small
scale (the way in-repo is the 1-scale of the storage substrate), so we never accrete ceremony that serves only
internal tidiness. The shared surface that genuinely serves a partial user is the **vocabulary and the light
`run-errand` entry** (correct footer, review-increment discipline) — not the apparatus.

### The character layer — the errand-vs-WU gate (re-based onto spec-worthiness)

The codified wrapper floor equates "single concern" with "one review increment" and admits anything heavier to a WU.
That increment-count basis is the bug: a determinate maintenance sweep is one concern across many increments, yet not
WU-worthy. **Re-base the wrapper floor onto the same two intrinsic axes that already drive `light`/`heavy`/`novel`**
(§ Class Model), making the errand the natural *sub-floor* of one spectrum rather than a separate cardinality gate:

- **errand** = a single concern that sits **below floor on *both* axes** — nothing worth recording as design
  (**derivation** floor) **and** no substantial grounding pass a correct plan must navigate (**scale** floor).
  Self-evident; validated by intent + diff + review — atomic *or* multi-increment, increment-count is irrelevant.
- **work unit** = **spec-worthy** = clears *either* axis's floor: a design worth recording (even a determinate one →
  `brief`), **or** a substantial grounding pass a correct plan must navigate (→ `outline`, heavy-by-scale).

Three tiers per axis; the errand is the shared sub-floor:

| Axis           | below floor → **errand** | low → `light`                | high → `heavy`        | top → `novel`             |
|----------------|--------------------------|------------------------------|-----------------------|---------------------------|
| **Derivation** | nothing to record        | records a determinate design | must *author* design  | must *invent* (only here) |
| **Scale**      | self-evident             | modest grounding             | substantial grounding | (caps at `heavy`)         |

**Increment-count drops out of the gate; concern-count stays.** An errand is still one concern (multi-concern is
always a WU or decomposes); the new admission is that a *self-evident* one-concern sweep is an errand across many
increments. Two one-concern/multi-increment cases split on the **scale floor**: a doc-grooming sweep is self-evident
→ errand; a widely-used-symbol rename whose plan must verify call-sites is heavy-by-scale → WU. The "substantial"
bar carries irreducible judgment — but it is the *same* judgment the Class model already owns, and the errand→WU
promotion edge makes a mis-call cheap to fix.

**The invariant that keeps it honest.** A maintenance errand **never authors new *design* at the home** — a
destination needing design authored is routed *as* a future increment (a new stub, an inbound-buffer note, a spawned
atomic errand), so the errand stays below the derivation floor even when one destination is a durable surface. (Live
confirmation: the 2026-06-12 conductor decomposition routed PR-sized boundary estimation *out* as its own atomic
errand rather than editing a strategy inline.) Determinate edits to a durable surface are fine inside an errand —
they ride the review lane (next section), not a WU wrapper.

**Vocabulary (settled).** "atomic" is **lowercase** — a *character* (fits a **single review increment**, even if
multi-file/multi-commit), never a thing. (`ATOMIC-INBOX` and inbox section headers are their own proper nouns; the
character word stays lowercase.) `Errand` is the **execution wrapper** (a noun); an errand is atomic *or*
multi-increment. There is **no new noun** — a "multi-increment errand" is just an errand whose execution spans
increments; increment-count is a non-defining adjective (naming a class *by count* would re-introduce the basis we
just retired). Final register polish defers to `idiomatic-alignment`.

### Review-lane eligibility is a separate axis (not the wrapper)

Whether work touches **durable surfaces** (code, rules, strategies, methods, workflows) vs. **movable planning
artifacts** (drafts, metas, stubs, buffers, ROADMAP, inbox) is about **blast radius → review eligibility**, not
errand-vs-WU. It is the **auto-merge lane** classification (`strategy-work-organization` § Auto-Merge Lane): movable
artifacts are auto-merge-eligible; durable surfaces hold in the reviewed lane. This axis is **orthogonal** to the
wrapper and applies to errands and WUs alike — a determinate dev-rule correction is an *errand* (below both floors)
that simply **rides the reviewed lane**. Under partial protection there is no review lane for errands; the axis is a
full-protection concern, consistent with everything else here. (The arc-inbox/housekeep **infra-smell** advisory
re-frames accordingly: a durable-surface touch means "needs the reviewed lane, and *check* whether design is hiding
here" — **not** "promote to a stub.")

### The full-protection mechanism

#### Derived lifecycle and crossing edges

The full-protection errand's state is **derived**, not stored as a phase: `in-progress` / `awaiting-merge` /
`merged-cleanup` / `stale`, plus `materializable` (remote-only, no local worktree) — the shape session-init's
`errandState` already computes. The crossing edges (the borders the gapless machine must name):

- **inbox → errand** (`drain-inbox` execution transition): a committed atomic in `USER-INBOX` enters the errand
  `Launch → Execute → Integrate` lifecycle. Capture *holds*; the errand *is* its execution.
- **errand → WU promotion** (`init-work-unit` Promote Errand path): an errand that crosses the wrapper floor
  (becomes spec-worthy) renames its branch to `<type>/<name>`, mints a meta (`scaffold`), and enters the WU lattice at `Active`
  (commits already exist; no activation ceremony). The reverse is never modeled — a WU never demotes to an errand.
- **errand → completed/abandoned**: an errand ships (merge / direct base commit) or is dropped; neither writes a
  `completed/` archive (no meta to sweep) — the record is its branch + PR + merged commit, plus the identity record
  below.

The crossing edges fire the gate at their judgment points; the firing points themselves live in
`lifecycle-transition-core`.

#### Errand identity is record-owned, not branch-derived

**The gap today.** Cross-machine/cross-session continuity rides "the notes-synced originating inbox entry *plus* the
pushed branch" — but the originating entry is the **common case, not a guarantee**. An errand launched from a free
description (`arc-session --errand <description>`, or a warm `arc-errand` "let's do X") has *no* entry — identity
collapses to parsing `chore/<slug>` (`errandSlugOf`, `lib/session-init/errand-branch.ts`), and there is no synced
record of intent at all. Parsing branch existence for identity is the storage-evolution **Principle 5** anti-pattern.

**The decision.** A full-protection errand has a **logical identity record**, minted at launch and sitting *behind
the storage abstraction* — `chore/<slug>` becomes a **projection** of the record, never the identity oracle.
`errandSlugOf`'s branch-parse retires; the slug comes from the record. State splits along the right line: **identity**
(which errand is this) → the record; **merge status** (`awaiting-merge` / `merged-cleanup` / `materializable`) → live
PR read (read-side external state, Principle 4 — not identity). This **generalizes** the already-notes-synced
originating-entry mechanism: every errand gets a uniform synced record at launch — inbox-originated or
free-description, no difference — closing the no-entry gap and giving an abandoned free-description errand a
recoverable intent record instead of an orphaned bare branch. The errand keeps its execution-only,
**no-`active/`-artifact** property (ADR-021's re-pivot deliberately removed the `errand-*` file and the queue) — the
record lives out-of-tree, not as an `active/` entry.

**The in-repo mechanism (resolved).** The record is an **orphan state-ref holding a tree of per-slug record blobs** —
the "git notes / orphan state-ref" shape `draft-arc-backend` § Decoupling (d) sanctions — synced on the existing
user-notes machinery. A state-ref (records as independent per-slug blobs) beats commit-attached notes: it is branch-
and commit-independent (the decoupling stays clean), concurrent creation across machines **union-merges** (distinct
blobs, no conflict) while a same-slug collision **rejects** under git's non-fast-forward (Principle 3), and `open`
pushes the record immediately so a second machine sees it within the same window the branch already has. It re-homes
to the backing store with **zero reshape** (Principle 2). Because in-repo is a *permanently supported tier*
(`draft-arc-backend` § Non-Goals — no forced migration; adopters choose the tier), this is a **standing implementation
behind the storage abstraction**, not a throwaway the backend deletes; the backend later adds its own tier
implementation of the same abstraction. Alternatives rejected (so the spec doesn't relitigate): **record on the
errand's own branch** — designed *out* at ADR-021's re-pivot (execution-only, no `errand-*` file) and re-couples to
branch existence; **a shared registry on `main`** — churn + concurrency on the base branch; **a branch-namespace
discovery hint** — re-bends the branch-shape coupling we set out to remove, and permanently (in-repo is not
transitional).

**Branch-type decoupling falls out of the record.** Once errand-ness is a record property, the branch prefix no
longer carries it. Errand branches become `fix/<slug>`, `refactor/<slug>`, `chore/<slug>` — whatever reflects the
work's nature — and they are still unambiguously errands because the *record* marks them. (Today `chore/` does triple
duty — branch, identity oracle, and errand-vs-WU discriminator; the record dissolves the latter two. Same Principle-5
coupling, retired by the same migration as `errandSlugOf`.)

#### The thin `arc errand` verb surface

The full-protection mechanics (`run-errand` Launch / Complete) are hand-run markdown — the "ceremony restating
mechanics" the cohort retires for WUs. They become a **thin** CLI surface, with `open`/`close` as the record's
lifecycle:

- **`arc errand open <slug>`** — mint the identity record, cut the branch (nature-typed) as its projection, and occupy
  per protection mode (see the cut→occupy contract below).
- **`arc errand close`** — remove the record, reap the branch / ephemeral worktree, prune, and drop the slug-matched
  inbox entry (at completion, never at start, so an abandoned errand never orphans the intent).

Scoped **smaller than the WU verbs**: errands carry no `(phase, location)`, no relocation, no `active/` artifact — so
no record-relocation / git-mv staging surface. `arc errand cut` already ships (creation-only — see the contract
below); `open` composes cut + record-mint + occupy. **Ownership:** this surface is **errand-lattice's to build** —
`lifecycle-mechanics-tail` shipped (PR #114) and its "further judgment-free mechanics still in markdown" audit
explicitly routed the errand verb surface and the record-owned-identity concern *here*. It has no other home.

#### The cut→occupy consumer contract

`arc errand cut` is **creation-only by design** — it cuts the branch off the base and stops; occupying (an ephemeral
worktree under full protection, or an in-place switch otherwise) is the **caller's protection-mode dispatch**. The
durable fix is to **codify the cut→occupy pairing as an explicit consumer invariant** (*cut creates; every consumer
must immediately occupy per protection mode*) and **audit consumers for inline conformance**:

- `run-errand` § Launch step 3 honors it (inlines "**Then occupy it:** spawn an ephemeral worktree … otherwise switch
  to it").
- `drain-inbox` § 5 is the known under-spec — it inlines the `arc errand cut` command but only *references* the occupy
  step, so a linear reader cuts and proceeds to write **without leaving the launch branch** (hit live 2026-06-19:
  `arc errand cut drain-inbox` left the session on `main`). Fix: inline the "then occupy" clause.
- Also check session-init's errand cold-entry for the same inline conformance.

No CLI change — `arc errand cut`'s creation-only behavior is correct. **Occupy default:** in-place switch until
`finalize-parallelism` ships (spawned worktrees can't run code WUs — gitignored `node_modules`).

### Capture surfaces key on errand-vs-WU; drain is character-aware

A consequence of the re-based gate (not a separate decision): the personal capture surfaces should key on **what it
becomes** (errand vs WU = spec-worthy?), not on increment-count — which is *also* what fixes the current
`## Atomic` / `## Backlog` mislabel (the sections already encode execution-vs-stub *fate*, not character). The
recommended shape is two fate-keyed sections (`## Errand` / `## Work Unit`); the capture question is the single gate
— *"does this need a spec — anything worth recording as design/requirements — or is it self-evident?"* — best-effort,
with housekeep the authoritative re-triage (including aggregation and elevation).

**errand-lattice recommends the keying; it does not own the restructure.** The capture/routing/inbox architecture
(section shapes, reassignment, holding-grounds, aggregation discovery, and whether a shared atomic inbox exists at
all) belongs to the inbox-family owner (`shared-inbox-housekeep`, being reframed) — see Dependencies.

**Drain disposition (decoupled).** Errand-class work routes to **execute (inline or errand) or personal-hold in
`USER-INBOX` — never a stub**; that is our lane (the gate's output). Whether a homeless atomic *also* flushes to a
shared surface is the inbox family's concern, not ours — so the model carries **no dependency on `ATOMIC-INBOX`
existing**, and is robust whether it survives or retires.

### The cascade — must exit gapless

The model and the re-based wrapper floor are authored here; their **consistency across every surface that touches
errand-vs-WU classification, capture, or routing** is this member's deliverable. The boundary must read the same in
the authoritative home *and* in the operational surfaces a session actually consults during capture/routing/execution
— not be correct only in a buried strategy. The WU exits only when no surface still describes the old increment-count
wrapper floor or the durable-as-wrapper conflation.

**Authoritative (the homes others cross-ref):**

- `strategy-work-organization` § Class Model — re-base boundary test #1 (wrapper floor) off increment-count onto the
  two-axis floor; reflect the three-tier-per-axis sub-floor.
- `strategy-work-organization` § Work Character — restate errand/atomic/WU on spec-worthiness; name the
  multi-increment errand shape.
- `strategy-work-organization` § Errand Work Class — the gate as spec-worthiness; the mode-scaled mechanism (full
  lattice / partial floor); the cut→occupy contract.
- `strategy-work-organization` § Auto-Merge Lane — durable-vs-movable as the review-lane axis the gate no longer
  carries.

**Operational (what a session actually consults — the gapless requirement):**

- `arc-inbox` skill — capture classification keys on errand-vs-WU (spec-worthiness) / fate; lowercase atomic; the
  infra-smell reframe (review-lane + design-check, not "→ stub").
- `arc-housekeep` skill — drain routing is character-aware (multi-step errand-class → execute/personal-hold, never a
  stub).
- `run-errand` workflow — admit a multi-increment single-concern maintenance errand (gated in chunks, one PR), not
  only the atomic shape; cut→occupy inline; record-owned identity at `open`/`close`.
- `drain-inbox` workflow — § 5 cut→occupy inline conformance; character-aware routing.
- `DEV-RULES.ARC` § Discovered Work Routing — the routing table + wrapper floor consistent with the re-based gate; the
  "atomic" vocabulary (lowercase, = one review increment); Holding ≠ execution.

**Vocabulary / orientation:**

- `AGENT-BRIEF.ARC` — the Errand / atomic vocabulary entries (lowercase atomic = one-increment character; Errand =
  wrapper, atomic or multi-increment; the spec-worthiness gate).

**Methods:**

- `classify-work-unit` method — the triage that sets the gate; reflect the re-based boundary test #1.
- check `issue-triage` for any wrapper-floor / increment-count assumption.

**ADR:**

- ADR-021 amendment **or** a new extending ADR — the refined errand model (spec-worthiness wrapper floor, two-layer
  mode-scaled mechanism, record-owned identity). Decide amend-vs-new per ADR methodology at create-spec.

**Out of scope (explicit boundaries):** the `ARC-Maintenance:` commit trailer (chore-filtering — `draft-arc-backend`
§ Decoupling (d), orthogonal to identity); the shared-inbox model/fate + routing architecture
(`shared-inbox-housekeep`, reframed).

## Open questions (→ create-spec)

- **State-ref wiring detail** — the exact ref path and sync timing (push-at-`open` vs. riding `arc sync`). The
  orphan-state-ref-of-per-slug-records shape is settled (see § Errand identity is record-owned); only the wiring is
  spec-level.
- **ADR disposition** — amend ADR-021 vs. a new extending ADR, resolved per ADR methodology at create-spec.

## Dependencies

- **Cohort-internal:** `Depends On: lifecycle-transition-core` (the crossing-edge firing points — errand→WU
  promotion's `scaffold`/mint, inbox→errand — live there).
- **Assumes (no edge):** the release wrapper's no-active-WU acceptance (errand commits / pushes) ships ahead of this
  WU — extracted as its own standalone work unit out of `interlock-release-refinement`.
- **Coordination seam with `decompose-matrix`:** that member's backlog-stub-source / heterogeneous-home arms *are*
  errand-class decomposition; whether `decompose` runs as a multi-increment errand keys on this gate.
- **Hands off to `shared-inbox-housekeep` (reframed):** the inbox/routing architecture — section shapes, reassignment,
  holding-grounds, aggregation discovery, and the shared-atomic-inbox *fate* (retire vs. keep-and-maintain) — is that
  member's, not ours. Our drain disposition is written to not depend on its outcome.
- **Relationship to `drain-inbox`:** already multi-increment and spec-less — this redefinition legitimizes the shape
  it already has rather than treating it as a special case.

## Continuity

- **Readiness:** **formalization-ready.** The re-based gate (spec-worthiness wrapper floor), the two-layer model, the
  review-lane separation, record-owned identity (orphan state-ref), the verb surface, the cut→occupy contract, the
  capture-keying recommendation, the gapless cascade map, and the ADR deliverable are all settled; the residual —
  state-ref wiring path/timing and ADR amend-vs-new — is create-spec detail.
- **Class:** `Heavy`. The derivation is real (a load-bearing boundary re-based + an ADR + a cross-cutting cascade),
  but the building blocks are composed from existing patterns (the two-axis Class model, protection-mode scaling, the
  user-notes ref, arc-backend's record/projection) — invent-vs-compose lands *compose*, so `heavy`, not `novel`.
  Re-assessable at create-spec if a genuinely new primitive surfaces.
- **Open:** state-ref wiring detail; ADR amend-vs-new — both create-spec-grade.
- **Next:** `create-spec` — re-reads the derivation axis with this draft as its richest evidence. Activation path
  unchanged: `init-work-unit` Path A once `lifecycle-transition-core` ships.

---
