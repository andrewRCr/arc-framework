# Spec (detailed · RFC): errand-lattice

- **Origin:** [internal] — `lifecycle-state-machine` cohort member. Absorbs the retired `maintenance-errand-class`
  (its errand-vs-WU character gate, the relocates-never-authors invariant, and its vocabulary/definition cascade).

- **Purpose:** Model the errand lifecycle as a distinct lattice adjacent to the `(phase, location)` WU lattice —
  one concept with a mode-scaled mechanism — re-base the errand-vs-WU gate from increment-count onto
  spec-worthiness, give the full-protection errand a record-owned identity decoupled from its branch, and cascade
  that model consistently across the load-bearing definitions and the operational capture/routing surfaces.

---

## Introduction / Context

Errands cross the WU lattice unmodeled, and the gate that admits them is wrong on its basis. Two faults force a
design decision now.

**Fault 1 — the wrapper floor was read against the wrong quantity, leaving determinate single-concern maintenance homeless.**
The codified wrapper floor (`strategy-work-organization` § Class Model, boundary test #1) reads *"more than one
review increment → WU."* Sound as approval gates — but read in practice against *commit count*, so a determinate
maintenance sweep — a decomposition, a housekeep drain that fans out, a doc-grooming sweep, a ROADMAP re-render
cascade — got mis-filed. Such a sweep is one logical concern reviewed once (one review increment) with no design
to author, however many commits it lands in. Misread as multi-increment it was forced into the WU wrapper — an
empty `spec` and a `tasks` list that just restates the inbox — so it was hand-rolled off-script every time. That
hole sits exactly where the lattice's **entry predicate** belongs.

**Fault 2 — the errand model is substantively full-protection-shaped, with partial bolted on as a degenerate
case.** `chore/<slug>` is the identity-and-state oracle; under partial protection there is no branch at all.
ADR-021 flagged this at its 2026-05-31 re-pivot (the retired errand queue was "`branch.protection: full`-shaped");
the residue persists in how identity and state are still derived from the branch — `errandSlugOf`
(`lib/session-init/errand-branch.ts`) parses `chore/<slug>` for identity, which is the storage-evolution
**Principle 5** anti-pattern (inferring identity from branch existence).

A gapless lifecycle machine needs the character gate re-based off increment-count and a coherent answer to *what
an errand is across both protection modes*. This RFC settles both, plus the mechanism the full-protection errand
materializes into, and the cross-surface cascade that keeps the model consistent everywhere a session consults it.

The shared context — the WU lattice, the crossing-edge firing points (`lifecycle-transition-core` owns them), and
cohort-level coordination — lives in `cohort-lifecycle-state-machine.md`.

## Goals

- **A correct entry predicate.** The errand-vs-WU boundary admits a self-evident single-concern maintenance
  sweep — typically one review increment (a determinate one may stage into a bounded few in-session passes),
  however many commits — as an errand, decided on the same intrinsic axes that already drive `Class`.
- **One concept across both protection modes.** A single character-level definition a developer learns once, whose
  *mechanism* scales with `branch.protection` — without pushing full-protection apparatus onto the partial floor.
- **Record-owned errand identity.** Full-protection errand identity resolves from a logical record, not by parsing
  a branch name; the branch becomes a projection of the record.
- **A thin verb surface.** The hand-run full-protection mechanics become a small CLI surface scoped smaller than
  the WU verbs (no `(phase, location)`, no relocation, no `active/` artifact).
- **Exit gapless.** Every surface a session consults during classification, capture, routing, or execution
  describes the re-based gate and the mode-scaled model — not the old count-based reading of the floor.

## Non-Goals

- **The *shared* inbox model.** Whether a shared atomic inbox (`ATOMIC-INBOX`) exists at all, holding-grounds,
  reassignment, the bucket/fracturing problems, and aggregation discovery belong to the inbox-family owner
  (`shared-inbox-housekeep`, reframed). This RFC's drain disposition is written to not depend on `ATOMIC-INBOX`
  existing. (The *personal* capture surface — the `USER-INBOX` section keying and the surfaces that apply the gate
  — **is** in scope; see Proposed Design part 8.)
- **The deterministic inbox managed-write (`arc inbox add`).** The capture *judgment* keys on this WU's gate (and
  rides the `arc-inbox` skill), but the managed-*write* CLI — placement + canonical section spacing — is OSD's
  record/projection substrate, paired there with the shipped `removeInboxEntry`. This WU keeps `removeInboxEntry`
  functional through the relabel (part 8); it does not build the write CLI.
- **Cross-machine partial-push visibility for the errand record ref.** The new errand ref is a synced ref subject
  to the same partial-push invisibility gap as the user-notes ref (a sibling clone seeing a stale ref after an
  incomplete push). Closing that gap is `cross-machine-sync-coherence`'s concern, pre-existing for the notes ref.
  This RFC composes with it (see § Cross-cutting Considerations) but does not solve it.
- **The `ARC-Maintenance:` commit trailer.** Chore-filtering of planning churn from history (`draft-arc-backend`
  § Decoupling (d)) is orthogonal to errand identity.
- **The crossing-edge firing *mechanics*.** The `scaffold` primitive, `arc errand cut`, and the branch-rename the
  crossing edges invoke shipped in `lifecycle-transition-core` (upstream, the `Depends On`); this RFC reuses them,
  never rebuilds them. (The edges' *gate criteria and identity handling* are **in scope** — they shipped keyed on
  the pre-rebase model; see Proposed Design part 4.)
- **Final verb/term register polish.** The lowercase-`atomic` / `Errand`-wrapper vocabulary is settled here; the
  closing register check defers to `idiomatic-alignment`.

## Proposed Design

The design has six structured parts: the two-layer model, the re-based character gate, the orthogonal review-lane
axis, the full-protection mechanism (lifecycle + crossing edges, record-owned identity, verb surface, cut→occupy
contract), the personal capture surface, and the consistency cascade. Plus the ADR deliverable.

### 1. The two-layer errand model

An errand is a single **work character** (off-WU, single logical concern, below the WU wrapper) whose
**mechanism is a mode-scaled projection**. Two layers:

- **Character layer (universal, mode-independent).** The errand-vs-WU gate. Same word, same judgment, same
  decision in every protection mode — learned once, reused across a full-protection team repo and a
  partial-protection solo repo.
- **Mechanism layer (mode-scaled by `branch.protection`).**
    - **Partial — the floor.** A direct base commit tracked by its `standalone (...)` context footer;
      commit-then-done. No branch, no lifecycle, no record beyond the footer, no discovery, no cross-machine
      resume. A multi-commit partial errand is just sequential base commits, each already landed.
    - **Full — the rich lattice.** A nature-typed branch (`fix/` / `refactor/` / `chore/<slug>`) + PR with a
      derived lifecycle, a record-owned identity, and discovery. Detailed in parts 4–7.

**The collapse is the correct treatment; the guardrail is one-directional.** No part of the full-protection
apparatus (branch, PR, lifecycle states, identity record, discovery) may be pushed down onto the partial floor for
model symmetry. The model *sanctions* partial's near-zero mechanism as the legitimate small scale (as in-repo is
the 1-scale of the storage substrate). The shared surface that genuinely serves a partial user is the vocabulary
and the light `run-errand` entry (correct footer, review-increment discipline) — not the apparatus.

### 2. The character gate — errand-vs-WU on spec-worthiness

Re-base the wrapper floor onto the same two intrinsic axes that drive `Light`/`Heavy`/`Novel`, making the errand
the natural **sub-floor** of one spectrum rather than a separate cardinality gate:

- **errand** = the **atomic work character** — a single, indivisible self-evident concern bounded to one session —
  **below floor on *both* axes**: nothing worth recording as design (derivation floor) **and** no durable
  cross-session plan a correct execution must navigate (scale floor). Validated by intent + diff + review.
  **Typically** one review increment, often one commit; a determinate concern may be staged into a bounded few
  **in-session** review passes (the *extended errand*) without changing character.
- **work unit** = **spec-worthy** and **composite** = clears *either* axis's floor: a design worth recording (even
  a determinate one → `brief`), **or** a durable, tracked plan a correct execution must navigate across sessions
  (→ `outline`, heavy-by-scale).

Three tiers per axis; the errand is the shared sub-floor:

| Axis           | below floor → **errand** | low → `light`                | high → `heavy`        | top → `novel`             |
|----------------|--------------------------|------------------------------|-----------------------|---------------------------|
| **Derivation** | nothing to record        | records a determinate design | must *author* design  | must *invent* (only here) |
| **Scale**      | self-evident             | modest grounding             | substantial grounding | (caps at `heavy`)         |

**Commit- and review-pass-count both drop out of the gate; concern-count stays.** An errand is still one concern
(multi-concern is always a WU or decomposes). The admission is twofold: a *self-evident* one-concern sweep is an
errand however many **commits** it lands in, **and** — when determinate — however many in-session **review passes**
it is staged into. What crosses the **scale floor** is not a second pass but needing a **durable, cross-session
plan**: a tracked decomposition that outlives the session and is validated against a spec. Two one-concern cases
split on it: a doc-grooming sweep is self-evident → errand; a widely-used-symbol rename whose plan must verify
call-sites and be tracked is heavy-by-scale → WU. The bar carries irreducible judgment — the *same* judgment the
`Class` model already owns — and the `arc errand promote` edge makes a mis-call cheap to fix.

**Single-session binding is the character, not a limit.** An errand carries no durable context machinery — no meta,
no SESSION-NOTES, no task list — so it is atomic in *session* as well as in *concern*. Pause/resume is a thin
git-state fallback (`commit WIP + push`; reconstruct from the branch diff + the originating capture), safe only
because the work is determinate: remaining scope stays legible from the diff. The moment correct continuation needs
a tracked plan rather than the diff, that **is** the scale floor → WU. The two floors, the atomic-single-session
identity, and the pause-safety test are one statement seen from different sides.

**The relocates-never-authors invariant.** A maintenance errand **never authors new *design* at the home** — a
destination needing design authored is routed *as* a future increment (a new stub, an inbound-buffer note, a
spawned atomic errand), so the errand stays below the derivation floor even when one destination is a durable
surface. Determinate edits to a durable surface are fine inside an errand — they ride the review lane (part 3),
not a WU wrapper.

### 3. Review-lane eligibility is a separate, orthogonal axis

Whether work touches **durable surfaces** (code, rules, strategies, methods, workflows) vs. **movable planning
artifacts** (drafts, metas, stubs, buffers, ROADMAP, inbox) is about **blast radius → review eligibility**, not
errand-vs-WU. It is the **auto-merge lane** classification (`strategy-work-organization` § Auto-Merge Lane):
movable artifacts are auto-merge-eligible; durable surfaces hold in the reviewed lane. This axis is **orthogonal**
to the wrapper and applies to errands and WUs alike — a determinate dev-rule correction is an *errand* (below both
floors) that simply **rides the reviewed lane**. Under partial protection there is no review lane for errands; the
axis is a full-protection concern. The `arc-inbox`/`arc-housekeep` infra-smell advisory re-frames accordingly: a
durable-surface touch means "needs the reviewed lane, and *check* whether design is hiding here" — **not** "promote
to a stub."

### 4. Full-protection mechanism — derived lifecycle and crossing edges

The full-protection errand's state is **derived**, not stored as a phase: `in-progress` / `awaiting-merge` /
`merged-cleanup` / `stale`, plus `materializable` (remote-only, no local worktree) — the shape session-init's
`errandState` already computes. The crossing edges the gapless machine must name:

- **inbox → errand** (`drain-inbox` execution transition): a committed atomic in `USER-INBOX` enters the errand
  `Launch → Execute → Integrate` lifecycle. Capture *holds*; the errand *is* its execution.
- **errand → WU promotion** (`init-work-unit` Promote Errand path, via `arc errand promote`): an errand that
  crosses *either* floor renames its branch to `<type>/<name>`, mints the backing meta (`scaffold`), retires the
  errand record, and enters the WU lattice **at the stage the crossed floor dictates** — a **derivation** crossing
  enters planning (`Planning`, `Current Workflow → draft-design`); a **scale-only** crossing enters `Active` with a
  `brief` anchoring the now-durable plan (commits already exist; no activation ceremony). The reverse is never
  modeled — a WU never demotes to an errand.
- **errand → completed/abandoned:** an errand ships (merge / direct base commit) or is dropped; neither writes a
  `completed/` archive (no meta to sweep) — the record is its branch + PR + merged commit, plus the identity record
  (part 5).

**The firing *mechanics* shipped in `lifecycle-transition-core` (upstream) and are reused, not rebuilt** — the
`scaffold` primitive, `arc errand cut`, and the branch rename. But those edges shipped **keyed on the pre-rebase
model**, so updating them is this WU's work:

- The Promote Errand path's promotion criterion is the old increment-count gate ("more than one review
  increment …") → re-base onto **spec-worthiness** (part 2).
- It verifies and renames `chore/<slug>` specifically → make it **branch-prefix-agnostic** (`fix/` / `refactor/` /
  `chore/`) and resolve the promoted errand's identity from the **record**, not a branch parse (part 5).
- Promotion mints a WU meta but cannot retire an errand record (records don't exist yet) → **build the
  record-retirement step**: promoting an errand removes its identity record, since the WU meta now supersedes it.

The edges fire the gate at their judgment points; the *mechanics* are transition-core's, the *gate and identity
wiring* are updated here.

### 5. Full-protection mechanism — record-owned identity

**The decision.** A full-protection errand has a **logical identity record**, minted at launch and sitting behind
the storage abstraction. The branch becomes a **projection** of the record, never the identity oracle. State
splits along the right line: **identity** (which errand is this) → the record; **merge status**
(`awaiting-merge` / `merged-cleanup` / `materializable`) → live PR read (read-side external state — storage-evolution
Principle 4, not identity). This **generalizes** the already-notes-synced originating-entry mechanism: every errand
gets a uniform synced record at launch — inbox-originated or free-description, no difference — closing the no-entry
gap (`arc-session --errand <description>` and warm `arc-errand` launches have no originating entry today) and giving
an abandoned free-description errand a recoverable intent record instead of an orphaned bare branch. The errand
keeps its execution-only, **no-`active/`-artifact** property (ADR-021's re-pivot deliberately removed the
`errand-*` file) — the record lives out-of-tree.

**The in-repo mechanism.** The record is an **orphan state-ref holding a tree of per-slug record blobs** — the
"git notes / orphan state-ref" shape `draft-arc-backend` § Decoupling (d) sanctions.

- **Ref:** `refs/arc/user/{identity}/errands` — a dedicated orphan state-ref, **namespaced inside the user-scoped
  family** (it is an identity-scoped concern, so it lives with other user-scoped concerns), but a distinct ref of
  the right *type* — not co-mingled into the user-notes content. Resolves the modeling tension cleanly: dedicated
  ref (its own type), homed under `user/{identity}` (its own scope). The tree keys each entry by `<slug>`; the
  blob carries the record (slug, intent/origin, launch metadata, originating-inbox-entry pointer when present).
- **Materialization:** **records-only — not filesystem-materialized.** There is no `.arc/user/{identity}/errands/`
  working-tree directory; the record is projected through the `arc errand` verbs and session-init's `errandState`,
  never read as a file. Materializing it would re-introduce the `errand-*` file ADR-021's re-pivot removed.
- **Sync (the design guard for cross-machine composition):** the record rides the **existing user-state sync
  machinery** — the same partial-push-marker discipline that carries `refs/notes/arc/user/{identity}`, with a
  dedicated `partialPushErrand` marker parallel to the notes one. The errand ref is **identity-scoped** (not
  WU/worktree-scoped), so `arc sync` reconciles it as a **cross-cutting** step that runs on every sync independent
  of the worktree/notes cell (even on blocked cells) and is non-fatal to the sync exit — *not* as a leg bundled
  into the WU paired push, which would wrongly gate it on worktree success and mix scopes. `open` pushes the record
  immediately (so a sibling sees it within the same window the pushed branch is visible); `close` pushes the
  removal; both also ride `arc sync` as the periodic reconcile. Routing through the existing marker machinery
  (rather than a bespoke push) is what lets `cross-machine-sync-coherence`'s eventual remote-marker mechanism cover
  the errand ref with zero rework.
- **Conflict semantics + the merge algorithm:** because the tree holds independent per-slug blobs, concurrent
  creation across machines **union-merges** and a same-slug collision **rejects** (storage-evolution Principle 3 —
  version-checked writes). An orphan state-ref does not inherit `git notes merge`'s built-in union, so ARC realizes
  it explicitly: on push/sync, **fetch the remote ref; merge the per-slug tree — an entry present on only one side
  unions in, an entry present on both must be byte-identical (idempotent) else surface a same-slug collision; write
  the merged tree as a new commit; push, retrying-with-refetch on non-fast-forward.** The observable semantics are
  fixed by this algorithm; only the git plumbing (`read-tree`/`write-tree` vs. a library) is implementation
  latitude.

**Branch-type decoupling falls out of the record.** Once errand-ness is a record property, the branch prefix no
longer carries it. Errand branches become `fix/<slug>`, `refactor/<slug>`, `chore/<slug>` — whatever reflects the
work's nature — and are still unambiguously errands because the *record* marks them. The session-init errand probes
(resume detection, in-flight sweep, materialize) migrate from `errandSlugOf`'s branch-parse to record reads;
`errandSlugOf` retires. Today `chore/` does triple duty — branch, identity oracle, errand-vs-WU discriminator; the
record dissolves the latter two (same Principle-5 coupling, retired by the same migration).

### 6. Full-protection mechanism — the thin `arc errand` verb surface

The full-protection mechanics (`run-errand` Launch / Complete) are hand-run markdown — the "ceremony restating
mechanics" the cohort retires for WUs. They become a **thin** CLI surface, with `open`/`close`/`promote` spanning the record's
lifecycle:

- **`arc errand open <slug>`** — mint the identity record, cut the branch (nature-typed) as its projection, and
  occupy per protection mode (the cut→occupy contract, part 7). Composes the already-shipped creation-only
  `arc errand cut` + record-mint + occupy.
- **`arc errand close`** — remove the record, reap the branch / ephemeral worktree, prune, and drop the
  slug-matched inbox entry (at completion, never at start, so an abandoned errand never orphans the intent). The
  inbox-entry drop consumes the `removeInboxEntry` primitive `lifecycle-mechanics-tail` already shipped.

- **`arc errand promote <slug>`** — the errand → WU crossing edge as a verb: rename the branch (preserving
  commits), mint the backing WU meta in the stage the crossed floor dictates (`Planning` + `draft-design` for a
  derivation crossing, `Active` for a scale-only one), regenerate ROADMAP, and retire the record. Composes the
  shipped `renderMetaFile` + branch-rename + `retireErrand` (the executor's ROADMAP-regen side-effect rides along,
  interim until roadmap-tooling); the agent supplies only the judgment (WU name/type, which floor). Full-protection
  only — under partial there is no branch or record, so promotion is just starting a normal WU from the base.

Scoped **smaller than the WU verbs**: errands carry no `(phase, location)`, no relocation, no `active/` artifact —
so no record-relocation / git-mv staging surface of their own. `promote` is the exception that proves it — the
crossing-*out* seam, minting WU machinery by composing transition-core's `renderMetaFile` rather than owning meta
logic here. **Ownership:** this surface is errand-lattice's to build —
`lifecycle-mechanics-tail` (PR #114) routed the errand verb surface and the record-owned-identity concern here; it
has no other home.

### 7. The cut→occupy consumer contract

`arc errand cut` is **creation-only by design** — it cuts the branch off the base and stops; occupying (an
ephemeral worktree under full protection, or an in-place switch otherwise) is the **caller's protection-mode
dispatch**. Codify the cut→occupy pairing as an explicit consumer invariant — *cut creates; every consumer must
immediately occupy per protection mode* — and audit consumers for inline conformance:

- `run-errand` § Launch step 3 honors it (inlines "**Then occupy it:** spawn an ephemeral worktree … otherwise
  switch to it").
- `drain-inbox` § 5 is the known under-spec — it inlines the `arc errand cut` command but only *references* the
  occupy step, so a linear reader cuts and proceeds to write **without leaving the launch branch** (hit live
  2026-06-19: `arc errand cut drain-inbox` left the session on `main`). Fix: inline the "then occupy" clause.
- session-init's errand cold-entry: check for the same inline conformance.

No CLI change — `arc errand cut`'s creation-only behavior is correct. **Occupy default:** in-place switch until
`finalize-parallelism` ships (spawned worktrees can't run code WUs — gitignored `node_modules`).

### 8. The personal capture surface (this WU's deliverable)

A consequence of the re-based gate: the personal capture surface keys on **what it becomes** (errand vs WU =
spec-worthy?), not on increment-count. The current `## Atomic` / `## Backlog` sections already encode that *fate*,
but their labels carry the old basis (`## Atomic` named a character, not the errand-vs-WU fate the section sorts
by) — a surface still describing the retired model, which the exit-gapless standard forbids. So this WU **lands the
gate in the personal surface**, not as a recommendation:

- **`USER-INBOX` relabel.** Rename the sections to the fate-keyed `## Errand` / `## Work Unit`, and rewrite each
  section **preamble** to the spec-worthiness model (not just the heading). The `WU_Target` field stays on
  `## Work Unit` entries. Names are coordinated with — but land ahead of — the shared-inbox decision; the shared
  `ATOMIC-INBOX`'s own shape stays downstream.
- **The coupled code stays functional.** The section labels are hardcoded where entries are read and written:
  `removeInboxEntry`'s `ENTRY_SECTIONS = ["Atomic", "Backlog"]` (`user-sync/inbox-writer.ts` — the inbox-remove
  writer `lifecycle-mechanics-tail` shipped), the section reader/parser (`parser.ts` / `inbox-state.ts`), and the
  session-init `inboxState` / reminder probes. The relabel updates each in lockstep and keeps their tests green.
- **The applying surfaces.** `arc-inbox` (capture classification), `arc-housekeep` (drain routing), and
  `DEV-RULES § Discovered Work Routing` key on the spec-worthiness gate (lowercase atomic; the infra-smell reframe).
  The capture question is the single gate — *"does this need a spec — anything worth recording as
  design/requirements — or is it self-evident?"* — best-effort, with housekeep the authoritative re-triage.

**Drain disposition (our lane):** errand-class work routes to execute (inline or errand) or personal-hold in
`USER-INBOX` — **never a stub**. **Handed to `shared-inbox-housekeep` (reframed):** the *shared* inbox model only —
whether `ATOMIC-INBOX` exists at all, holding-grounds, the bucket/fracturing problems, and aggregation discovery.
The model carries **no dependency on `ATOMIC-INBOX` existing** and is robust whether it survives or retires.

### 9. The consistency cascade (the exit-gapless deliverable)

The model and re-based wrapper floor are authored here; their **consistency across every surface that touches
errand-vs-WU classification, capture, or routing** is this WU's deliverable. The boundary must read the same in the
authoritative home *and* in the operational surfaces a session consults during capture/routing/execution. The WU
exits only when no surface still describes the increment-count wrapper floor or the durable-as-wrapper conflation.

**Authoritative (the homes others cross-ref):**

- `strategy-work-organization` § Class Model — re-base boundary test #1 (wrapper floor) off increment-count onto
  the two-axis floor; reflect the three-tier-per-axis sub-floor.
- `strategy-work-organization` § Work Character — restate errand/atomic/WU on spec-worthiness; name the
  atomic (one-review-increment) errand shape.
- `strategy-work-organization` § Errand Work Class — the gate as spec-worthiness; the mode-scaled mechanism (full
  lattice / partial floor); the cut→occupy contract.
- `strategy-work-organization` § Auto-Merge Lane — durable-vs-movable as the review-lane axis the gate no longer
  carries.

**Operational (what a session actually consults — the gapless requirement):**

- `arc-inbox` skill — capture classification keys on errand-vs-WU (spec-worthiness) / fate; lowercase atomic; the
  infra-smell reframe (review-lane + design-check, not "→ stub").
- `arc-housekeep` skill — drain routing is character-aware (a multi-commit errand-class sweep → execute/personal-hold, never
  a stub).
- `run-errand` workflow — admit a determinate single-concern sweep that lands in several commits (one review
  increment, one PR), not only the single-commit shape; cut→occupy inline; record-owned identity at `open`/`close`.
- `drain-inbox` workflow — inbox → errand transition; § 5 cut→occupy inline conformance; character-aware routing.
- `init-work-unit` § Promote Errand to Work Unit — re-base the promotion criterion onto spec-worthiness;
  branch-prefix-agnostic; record-resolved identity + the record-retirement step (part 4).
- `DEV-RULES.ARC` § Discovered Work Routing — the routing table + wrapper floor consistent with the re-based gate;
  the "atomic" vocabulary (lowercase, = one review increment); Holding ≠ execution.

**Personal-surface code + content (the keying lands, not just documents):**

- `USER-INBOX` — sections relabeled `## Errand` / `## Work Unit` with new-model preambles (part 8).
- `user-sync/inbox-writer.ts` (`removeInboxEntry` `ENTRY_SECTIONS`), `parser.ts` / `inbox-state.ts` readers, and
  the session-init `inboxState` / reminder probes — relabeled in lockstep, tests green.

**Vocabulary / orientation:**

- `AGENT-BRIEF.ARC` — the Errand / atomic vocabulary entries (lowercase atomic = one-increment character; Errand =
  wrapper, always atomic — one review increment; the spec-worthiness gate).

**Methods:**

- `classify-work-unit` method — boundary test #1 re-based onto spec-worthiness (the two-axis floor).
- `issue-triage` — check for any wrapper-floor / increment-count assumption.

### 10. ADR-027 — new extending ADR (written and Accepted)

Mint a **new ADR (ADR-027)** capturing the refined model: the spec-worthiness wrapper floor, the two-layer
mode-scaled mechanism, and record-owned identity. It **references** ADR-021 in its Context; ADR-021 receives a
forward-pointer Tier-2 amendment. Rationale for new-over-amend (§ Alternatives): the gate re-base *alters*
ADR-021's threshold basis (a Decision-altering change the methodology routes to a new ADR, not an append), and
record-owned identity is a new architectural decision with its own rejected alternatives.

**The ADR is written *and* `Accepted` at this WU's integration** — not left `Proposed`. (The broader process gap —
that the integrate ceremony never advances ADR status — is captured separately as the `adr-accept-timing`
follow-up; ADR-021's stale-`Proposed` state is its live instance.)

## Alternatives & Rationale

**Gate basis — counting (rejected) vs. spec-worthiness (chosen).** Counting the increments a concern spans — read
in practice as *commits* — mis-equates "single concern" with "single commit," forcing a determinate multi-commit
sweep into a WU wrapper it doesn't fit. Spec-worthiness re-bases the floor onto the two intrinsic `Class` axes,
making the errand the sub-floor of one spectrum — admitting the self-evident sweep (one review increment, however
many commits) while keeping concern-count as the real boundary. The
"substantial grounding" bar carries judgment, but it is the *same* judgment `Class` already owns.

**Record location.** Three alternatives rejected so the spec doesn't relitigate:

- **Record on the errand's own branch** — designed *out* at ADR-021's re-pivot (execution-only, no `errand-*`
  file) and re-couples identity to branch existence (the Principle-5 anti-pattern this WU removes).
- **A shared registry on `main`** — churn and concurrency on the base branch.
- **A branch-namespace discovery hint** — re-bends the branch-shape coupling we set out to remove, and permanently
  (in-repo is not transitional).

**Record ref type — commit-attached notes vs. orphan state-ref (chosen).** Commit-attached notes tie a blob to a
commit SHA; the errand record must be **commit- and branch-independent** (the branch is the projection, not the
anchor), so an orphan state-ref holding a tree of per-slug blobs is the right shape. It also gives the clean
per-slug union/reject conflict semantics. Cost: ARC implements the tree-union (notes' built-in union-merge doesn't
apply) — accepted, the semantics are simple and the shape is correct.

**Record ref namespace — dedicated top-level vs. reuse user-notes ref vs. dedicated-under-user (chosen).** A
top-level `refs/arc/errands/{identity}` is incoherent (identity-scoped but outside the user-scoped family). Reusing
`refs/notes/arc/user/{identity}` co-mingles execution-intent records with personal session-notes content and
mismatches the ref type (notes vs. state-ref). `refs/arc/user/{identity}/errands` is dedicated *and* homed under
the user-scoped family — the right pairing.

**ADR disposition — amend ADR-021 (rejected) vs. new extending ADR (chosen).** Amending stretches the append-only
model over a Decision-altering change (the threshold basis) plus genuinely new architectural decisions
(record-owned identity). A new ADR keeps ADR-021's point-in-time taxonomy intact while capturing the matured model
cleanly — matching how this cohort minted ADR-026 for `lifecycle-transition-core` rather than amending ADR-019.

## Cross-cutting Considerations

**Migration.** `errandSlugOf`'s branch-parse retires; the session-init errand probes (resume / in-flight sweep /
materialize) move to record reads. **No backfill mechanism is needed** — errands are ephemeral and the session-init
probe shows zero in-flight errands, so by ship time no record-less errand is expected to exist; a record-less legacy
branch (if one somehow remains) degrades gracefully to the current branch-derived behavior rather than warranting a
migration pass. Branch-prefix decoupling is additive — `chore/` stays valid, `fix/`/`refactor/` become equally valid
errand prefixes. The `USER-INBOX` relabel is a one-time content + `ENTRY_SECTIONS` edit, applied with the parser /
probe updates so no inbox read or the `removeInboxEntry` write regresses.

**Forward-compat seams (postures, not dependencies — the cohort's "build now, harden later").**

- **`strategy-storage-evolution` / `arc-backend`.** The record is designed storage-agnostic (P2): records-only,
  behind the storage abstraction, re-homing to the backend tier with zero reshape. Same-slug non-ff reject is the
  P3 version-checked-write form; merge-status-via-live-PR-read is P4 (read-side external state); retiring
  `errandSlugOf` *fixes* a P5 violation (identity decoupled from branch). The ref rides the existing user-state
  substrate — no new config axis or per-artifact flag (P8/P9 clear).
- **`operational-state-docs` (OSD).** The errand identity record is a new instance of the cohort's
  build-here-now / OSD-re-homes-later pattern (OSD already carries a "re-home three cohort-shipped behaviors onto
  records" entry; the errand record is a 4th). Designed storage-agnostic, it lifts onto OSD's record/projection
  substrate with zero reshape when OSD enumerates it. Not a gate. Separately, the `USER-INBOX` relabel (part 8)
  leaves a clean `## Errand` / `## Work Unit` structure that OSD's future deterministic managed-write
  (`arc inbox add`, which OSD pairs with the shipped `removeInboxEntry` this WU updates) emits into — the interim
  `ENTRY_SECTIONS` touch re-homes onto records zero-reshape, not a competing build; the capture *judgment* stays in
  the `arc-inbox` skill, keyed on our gate.
- **`cross-machine-sync-coherence` (CMSC).** The errand ref is a third synced ref subject to the partial-push
  invisibility gap CMSC owns. The composition (not a dependency — CMSC is not PRD-ready): route the errand-ref
  push/sync through the existing user-state paired-push + partial-push-marker machinery so CMSC's eventual
  remote-marker mechanism covers it with zero rework. The union/reject semantics handle the errand ref's own
  conflict case; cross-machine *visibility* of an incomplete push stays CMSC's.

**Testing.** Unit-test the re-based gate via `classify-work-unit` worked examples (the two one-concern cases that
split on the scale floor). Integration-test `arc errand open`/`close` over the record
lifecycle: record mint + branch cut + occupy; record removal + branch reap + slug-matched inbox-entry drop; the
tree-merge union (distinct slugs) and same-slug-collision reject paths; record-read identity resolution replacing
branch-parse across the session-init probes. Cover the errand → WU promotion edge's **record retirement** (promoting
removes the record). Regression-cover the `USER-INBOX` relabel: `removeInboxEntry` and the section readers/probes
find and operate on the renamed `## Errand` / `## Work Unit` sections (the `ENTRY_SECTIONS` update), tests green.

**Rollout / exit-gapless.** The cascade (part 9) must land coherently — the consistency-on-exit standard means no
surface still describes the old basis at WU exit. Per-member docs update with their code; the cross-cutting sweep
is this WU's own deliverable (not deferred to `lifecycle-closeout`, which audits the whole cohort).

**Dependencies.** `Depends On: lifecycle-transition-core` (crossing-edge firing points). Assumes (no edge) the
release wrapper's no-active-WU acceptance ships ahead. Coordination seam with `decompose-matrix` (whether
`decompose` runs as an errand keys on this gate). Hands the inbox/routing architecture to
`shared-inbox-housekeep`.

## Success Criteria

Validated at WU completion:

1. The errand-vs-WU gate is defined on **spec-worthiness** (the two-axis floor) in `classify-work-unit` and
   `strategy-work-organization` § Class Model; **no surface in the cascade (part 9) still describes the
   increment-count wrapper floor** or the durable-as-wrapper conflation — including the `USER-INBOX` section labels
   and the `init-work-unit` § Promote Errand criterion.
2. A determinate single-concern sweep runs **on-script** through `run-errand` as one errand — typically one review
   increment / several commits / one PR, and, when large, a bounded few in-session review passes (the extended
   errand) — verifiable against `drain-inbox`'s existing multi-commit shape, which the redefinition legitimizes.
3. `arc errand open <slug>` mints the identity record, cuts a nature-typed branch as its projection, and occupies
   per protection mode; `arc errand close` removes the record, reaps the branch/ephemeral worktree, and drops the
   slug-matched inbox entry at completion; `arc errand promote <slug>` performs the errand → WU crossing — branch
   rename, meta mint at the floor-dictated stage, ROADMAP regen, record retire — leaving only judgment to the agent.
4. Errand identity resolves from the **record**, not a branch parse: `errandSlugOf`'s branch-parse is retired, the
   session-init errand probes read the record, and a `fix/`- or `refactor/`-prefixed branch resolves as an errand.
5. The record lives at `refs/arc/user/{identity}/errands` as a **records-only** orphan state-ref (no working-tree
   file), synced via the existing user-state machinery (push-at-`open` + ride `arc sync`); concurrent distinct-slug
   creation union-merges and a same-slug collision rejects under non-fast-forward.
6. The **crossing edges are updated to the new model**: `init-work-unit` § Promote Errand re-bases its criterion
   onto the two-floor gate, is branch-prefix-agnostic, resolves identity from the record, routes to the planning
   stage the crossed floor dictates (draft-design for derivation; `Active` + `brief` for scale), and runs as the
   deterministic `arc errand promote` verb (branch rename + meta mint + ROADMAP regen + record retire) — reusing
   transition-core's mechanics, not rebuilding them.
7. **cut→occupy is codified as a consumer invariant**, and `run-errand`, `drain-inbox` § 5, and session-init's
   errand cold-entry each inline-conform (no consumer cuts without immediately occupying).
8. The **personal capture surface lands the gate**: `USER-INBOX` sections are relabeled `## Errand` / `## Work Unit`
   with new-model preambles; `arc-inbox` / `arc-housekeep` / `DEV-RULES` key on spec-worthiness; and the coupled code
   (`removeInboxEntry` `ENTRY_SECTIONS`, the section readers/probes) is updated in lockstep with tests green. Only
   the *shared* inbox model is left to `shared-inbox-housekeep`.
9. **ADR-027 is written and `Accepted`** (referencing ADR-021, which gains a forward-pointer amendment).

## Open Questions

No blocking open design questions — the design is complete: the two **independent** intrinsic floors, the
**extended errand** band (atomic character, single-session), and the `arc errand promote` crossing verb included.
Two non-blocking notes:

- **Implementation latitude (not design):** the git plumbing for the per-slug tree merge (`read-tree`/`write-tree`
  vs. a library) is an execution choice; the merge *algorithm* and its observable semantics are settled (part 5).
- **Cross-member coordination (not this spec's to resolve):** whether the `decompose` *operation* itself runs as
  an errand is `decompose-matrix`'s to settle by *applying* this WU's gate to its arms; the seam is
  recorded bidirectionally in `cohort-lifecycle-state-machine.md` (see § Cross-cutting Considerations → Dependencies).

---
