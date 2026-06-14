# Draft: Lifecycle State Machine

- **Origin:** [internal] — supersedes `park-resume-lifecycle`; absorbs `decompose-work-unit-arms` (design).
  The work-unit lifecycle was decomposed into shards at the `arc-plan-conductor` decomposition (2026-06-12 —
  `park-resume-lifecycle` §20, `graduation-cleanup` §19, `planning-pipeline-readiness`) faster than it was made
  coherent, and `worktree-default-start` (shipped 2026-06-13) then bolted the `arc start` CLI front door onto a
  still-incomplete transition-verb set. This WU consolidates the lifecycle into one explicit, complete, coherent
  state machine and closes the known seams.
- **Cohort:** [none] — likely becomes a cohort at `create-spec` (see § Ship shape).
- **Purpose:** Make the WU lifecycle an explicit, **complete** (gapless), coherent state machine — every state and
  transition named with its inverse, across the WU lattice *and* the two adjacent lifecycles that cross into it
  (errands, cohort docs) — and take the first deliberate step toward the north star where deterministic transition
  *mechanics* live in the CLI and workflows shrink to the judgment that decides whether/when to fire them. Resolve
  the verb-semantics incoherence (`start`/`resume`/`park`/`activate`/`promote`/`deactivate`/`decompose`/`abandon`),
  wire `arc start` graduation-routing + a collision guard, DRY-unify the relocation primitives, and model the full
  decompose matrix.

---

## Problem / Motivation

The lifecycle works in practice but is **incoherent as a system**, and the incoherence is now actively biting:

- **The verbs are a half-built, asymmetric set.** `activate ↔ deactivate` is the only clean inverse pair. `park`
  and `resume` are unshipped on both sides; `graduate` has no inverse; the create-stub forward edge has no owner.
  The incoherence is real enough that the maintainer — who designed this — instinctively reached for "`resume` is
  the flip side of `deactivate`," when in fact resume's inverse is park and deactivate's is activate. When the
  author's mental model of the state machine is fuzzy, the state machine needs an explicit pass.
- **`arc start` has an unguarded foot-gun.** `worktree-default-start` shipped `arc start <name>` as create-new
  only. Run against a name that already exists as a `backlog/` stub, it silently mis-scaffolds: a fresh template
  meta (losing the backfilled `Class`/`Cohort`/`Depends On`/`Origin`/`Design`), an orphaned draft stranded in
  backlog, two metas for one WU, no graduation. No guard catches it. Graduating an existing planned stub — the
  *common* case — should be exactly what `arc start <name>` does, not a trap.
- **Relocation logic is duplicated across ceremonies.** The `backlog ↔ active` and `active → backlog/completed`
  moves are re-authored across `init-work-unit` Path A, `decompose-work-unit`'s `park-exit` block, `archive`'s
  sweep, and the unshipped park/resume. `park-resume-lifecycle`'s own draft already flagged the DRY constraint
  (resume must reuse init Path A; park must reuse decompose's teardown blocks) but never unified it.
- **The machine is ~90% markdown, with no single source.** Of ~10 lifecycle transitions, exactly one is
  code-driven (`arc start` create-new) — and it is the newest, bolted on. The rest are agent-run markdown
  ceremonies whose transition rules are restated per workflow (branch prefix, meta `State`, preconditions). There
  is no canonical declaration of what the states and legal transitions are.
- **`decompose` is modeled as one symmetric shape, but real practice keeps hitting the others.** The shipped
  workflow handles only `live-plan-branch origin → fully-retired origin → all-members-newly-minted`. Three other
  transform shapes (extraction-with-surviving-origin, backlog-stub-source, heterogeneous-home) have no path and
  get hand-rolled — captured in `decompose-work-unit-arms` but never unified into the model.
- **The planning-entry gate is prose-only and absent where it's needed (discovered live, starting this WU).**
  Under full protection, drafting must happen on a planning branch, but that rule lives only as prose in
  `session-init` Step 5 and a branch-context note in `draft-design` — there is no mechanical preflight in
  `arc-plan` that resolves the write context and **routes** (→ `init-work-unit` to start directly, → errand/stub
  to defer) before drafting begins. `run-errand` Launch and the inbox flows already do this mechanically
  (`resolveWriteContext`); the planning entry does not, so `arc-plan` happily drops a draft onto `main` where it
  cannot be committed. This is the north star applied to lifecycle *entry*: deterministic gating belongs in code,
  not prose the agent must remember.
- **Starting from a pre-authored draft has no clean entry (also discovered live).** When a draft already exists
  (e.g. scaffolded, then realized a branch is needed), neither `arc start` create-new (fresh scaffold — clobbers
  the draft) nor `init-work-unit` Path A (backlog graduate) cleanly handles it. It is a third entry case the verb
  set does not cover.
- **Adjacent lifecycles cross the WU lattice unmodeled.** Errands (`chore/<slug>`, no meta, branch+PR-derived
  state) and cohort docs (mint → live → closeout) each have edges that cross into/out of the WU lattice
  (errand→WU promotion; decompose mints a cohort doc; archive closes it). A state machine that names only the WU
  lattice and ignores these crossings is not gapless.

This matters now because `finalize-parallelism` — a P1 verify-and-gate closeout — is explicitly *not* a redesign
catch-all: its seam-resolution model is "absorb-if-atomic, else spawn a follow-up WU." A muddy lifecycle
guarantees it discovers these lifecycle gaps reactively and spins off follow-ups mid-closeout — the
friction-after-the-fact it exists to pre-empt. Consolidating the *known* seams first de-risks it.

## The inventory — the lifecycle as it exists today

The evidence spine the resolved model below corrects. Three interacting lifecycles:

**WU lattice.** States: `provisional` → `planned` (in `backlog/`) → `Planning` → `Active` → `Integrating` (in
`active/`) → `completed`; plus `abandoned` (≡ deleted, no residue).

| Transition                     | Owner (CLI / workflow)                                         | Inverse                     | Seam                                                                            |
|--------------------------------|----------------------------------------------------------------|-----------------------------|---------------------------------------------------------------------------------|
| idea → `provisional`           | **none codified** (manual mkdir + template)                    | `abandon`                   | No create-stub path; unowned                                                    |
| `provisional` → `planned`      | `graduate-work-unit` (WF)                                      | **unowned** (demote)        | "graduate" is *only* this rung; confusable with the next                        |
| `planned` → `Planning`(active) | `init-work-unit` Path A (WF)                                   | `park` (unshipped)          | **Not CLI-wired**; `arc start` mis-scaffolds here                               |
| fresh → `Planning`(active)     | `arc start` create-new / `init` Path B (**CLI**)               | `deactivate` A-delete       | the **only** code-driven transition                                             |
| `Planning`(active) → `backlog` | `park` (**unshipped**); `decompose` does a park-shaped variant | `resume` / init Path A      | park unshipped; decompose factored a reusable `park-exit` block for it          |
| `backlog` → `Planning`(active) | `resume` (**unshipped**) = init Path A                         | `park`                      | conflated with init Path A; "resume" semantics wrong for a never-activated stub |
| `Planning`(active) → cohort    | `decompose-work-unit` (WF) — symmetric arm only                | irreversible                | only 1 of 4 transform shapes shipped; shares teardown with park                 |
| `Planning` → `Active`          | `activate-work-unit` (WF)                                      | `deactivate-work-unit` (WF) | the one clean inverse pair                                                      |
| `Active` → `Planning`          | `deactivate` Case A (WF)                                       | `activate`                  | clean; Case C (merged) is a separate corner                                     |
| `Active` → `Integrating`       | `integrate-work-unit` (WF)                                     | **unowned** (reopen)        | `Integrating → Active` is a genuinely missing inverse                           |
| `Integrating` → `completed`    | `archive-work-unit` (WF) — sweep + state flip                  | —                           | sweep is a relocation mechanic mis-filed as no-go                               |
| any active → `abandoned`       | `deactivate` A-delete / Case B                                 | —                           | overlaps park/teardown mechanics                                                |

**Errand lifecycle (adjacent).** `chore/<slug>` branch, no meta, no `(phase, location)` — state derived from
branch + PR (session-init's `errandState` already enumerates: in-progress / awaiting-merge / merged-cleanup /
stale / materializable). Crossing edges: **inbox → errand** (`drain-inbox` execution transition);
**errand → WU** (`init-work-unit` Promote Errand path).

**Cohort-doc lifecycle (adjacent).** `cohort-<name>.md` minted at `decompose` (or incrementally on the predicted
arm), lives in `backlog/planned/<cohort>/` as members graduate/ship around it, closeout-swept to `completed/` at
**last member ship** (`archive` Step 4). Not a WU; membership derived from each member's `Cohort` field.

## North star: deterministic mechanics in the CLI

The directional target this WU takes its first step toward. The lifecycle splits into two layers, and the north
star claims exactly one:

- **Mechanics** (`git mv`, branch create/rename, scaffold, ROADMAP regen, collision detection, transition-legality
  validation, completion-order/dated-path computation) — pure rule-following. **→ CLI.** The agent should never
  reason about these.
- **Judgment** (the interlocks — *should* we activate? WU or errand? what's the cut-map? is the design
  spec-ready? merge approval; and the create-time commitment/priority calls) — inherently human/agent. **→ stays
  in the workflow.**

The seam: the CLI owns the mechanical transition + guard + validation; the workflow shrinks to the judgment that
decides whether/when to fire it. The CLI *executes* transitions; it never *decides* to take them — except where
the decision genuinely is deterministic (a name collision forces graduate-not-scaffold) — and it never
*fabricates* judgment values (commitment, priority, `Class`): it requires them supplied. The explicit state
machine becomes the code-level single source both the CLI verbs and the (thinner) workflows derive from. This is
why a code-level transition table earns its keep by *design intent* even though today's surface is one edge: the
north star deliberately grows the code surface, and the table keeps that growth coherent rather than scattered.
Representation lean: hand-rolled declarative transition table, no `xstate`, no heavy lib.

## The resolved model

The pillars — (1) the explicit state machine over all three lifecycles, (2) CLI migration of the
start/relocation/sweep cluster, (3) verb-semantics reconciliation, (4) the full decompose matrix, (5) the
workflow-shell boundary — resolve into the design below.

### Two logical axes: phase ⊥ location

ARC currently smears two orthogonal axes onto the single `Planning` value, which is the root of the
park/resume/init-Path-A tangle:

- **Lifecycle phase** — `Planning` / `Active` / `Integrating` / `Shipped`. This *is* the meta `State` field
  (already a strict 4-value machine per `template-meta`).
- **Commitment location** — `provisional` / `planned` / `active` / `completed`.

A `planned/` backlog stub and a WU on a `plan/` branch are *both* phase `Planning`; the meta `State` alone does
not say where the WU lives — phase + location together do. **Resolution: location is a logical value** (a field,
or computed-but-named), **not raw directory-derivation.** That is the load-bearing call: a transition table that
reasons about *logical* `(phase, location)` is `arc-backend`-safe (the physical encoding — directory, branch —
becomes a projection/mechanic); a table that reasons about *directories* re-bakes the tracked-`.arc/`
assumption arc-backend's blast-radius audit warns interim WUs to stop accreting.

### Derived-state vocabulary — engagement is computed, not a third axis

The two axes suffice; the WU "states" people actually render or filter on are a **derived lattice** over
`(phase, location)` + the dependency graph, never stored primitives:

| Rendered state                   | Derivation                                               |
|----------------------------------|----------------------------------------------------------|
| queued / not started             | `location ∈ {provisional, planned}` ∧ `phase = Planning` |
| on my plate (capacity-consuming) | `location = active` ∧ `phase ∈ {Planning, Active}`       |
| awaiting review                  | `phase = Integrating`                                    |
| parked / suspended               | `location ∈ backlog` ∧ `phase = Active`                  |
| blocked (overlay)                | unmet `Depends On` edge — orthogonal, not a lattice cell |
| shipped                          | `location = completed`                                   |

The trigger for this was catching the **`Active` overload** — `phase = Active` was doing double duty as
"implementation underway" (a phase fact) *and* "on my plate / in-flight" (an engagement fact). That is the mirror
of the original `Planning` overload; splitting it is the same move. "Engagement" is *fully derivable* (suspended ⇒
`location = backlog`; awaiting-external ⇒ `phase = Integrating`; engaged ⇒ `location = active ∧ phase ∈ {Planning,
Active}`), so it is not an independent axis. The model also *forbids* the one case that would need one —
"suspended but still in `active/`" (the dormant-branch rot): the act of parking (moving location) is what makes
suspension legible.

Two consequences and two boundary facts:

- **A Parked render bucket.** `ROADMAP` / `STATUS.USER` show parked WUs (visible, resolvable-by-name — park makes
  them *more* visible, not less), **excluded from the parallel-capacity math.** This is also why the term
  "in-flight" is itself overloaded — "exists and not shipped" (broad) vs. "consuming a slot now" (narrow,
  capacity view) — and disambiguating it is part of the verb/naming pass.
- **Keep the predicates queryable.** Exposed via the probe / a status query, not buried in ROADMAP rendering —
  a future goal-relative work-selection model consumes them (see Forward-compat threads).
- **`park@Planning` collapses into `queued`.** A parked-Planning WU lands in `(Planning, backlog)`, which the
  lattice reads as `queued` — *indistinguishable from a never-started planned stub*, and correctly so: no
  in-progress code exists, so "queued" is honest. Only `park@Active` populates the Parked bucket. The history
  (draft content) distinguishes a worked-then-parked stub from a fresh one; the *state* does not need to.
- **`blocked` is an orthogonal overlay**, not a mutually-exclusive cell — a `queued` WU with an unmet dep is both.
  It is already a derived ROADMAP tier; the lattice carries it as a predicate layered over the six cells.

### The verb set

Fully inverse-paired; every edge owned. The headline user-facing pair is **`start` ⊥ `park`**.

| Axis / role               | Verb                    | Move                                                        | Inverse            |
|---------------------------|-------------------------|-------------------------------------------------------------|--------------------|
| phase                     | `activate`              | `Planning → Active` (begin implementation)                  | `deactivate`       |
| phase                     | `deactivate`            | `Active → Planning` (undo activation; recoverable; narrow)  | `activate`         |
| phase                     | `reopen`                | `Integrating → Active` (withdraw from review / PR rejected) | `integrate`        |
| location (active↔backlog) | `park`                  | `active → backlog` (phase-polymorphic)                      | `resume` / `start` |
| location (active↔backlog) | `resume`                | parked `backlog → active` (re-attach branch)                | `park`             |
| location (within backlog) | `promote`               | `provisional → planned` (Class **must resolve**)            | `demote`           |
| location (within backlog) | `demote`                | `planned → provisional` (Class sticky, not reset)           | `promote`          |
| forward                   | `stub`                  | idea → `backlog` (commitment + priority **required**)       | `abandon`          |
| composite                 | `decompose`             | `Planning → cohort` (matrix — see below)                    | — (irreversible)   |
| terminal                  | `integrate` + `archive` | `Active`/`Integrating → completed`                          | — (no-go)          |
| destructive               | `abandon`               | any → deleted                                               | —                  |

- **`arc start <name>` is a full lifecycle-state dispatch** (not merely a collision guard), routing on the name's
  resolved state (via the slug→state resolver below): nonexistent → create-new (scaffold into active);
  provisional/planned → begin (graduate via init Path A, resolving `Class`); **parked** → `resume` (re-attach
  branch); already active → error (occupied); shipped → offer a new WU with an origin-link; integrating → route
  via the Integrating edges below. **Abandoned is *not* a distinct arm** — `abandon` leaves no residue, so the
  resolver returns `nonexistent` and the name reuses cleanly through create-new (see § `abandon`). Totality means
  specifying all reachable states. **Two guards, not one:** name-collision AND **worktree-occupancy** (one active
  WU per worktree — the live foot-gun that put two metas in `active/` and broke the release wrapper; distinct from
  single-owner's one-DRI-per-WU). This kills the draft's "resume semantics wrong for a never-activated stub"
  complaint and the `arc start` mis-scaffold foot-gun.
- **`scaffold` is the internal structure-generation mechanic** (the act `stub`, `start` create-new, `decompose`,
  init Path B, and **errand→WU promotion** all invoke), already pervasive in the workflows. `stub` and `start` are
  the judgment-bearing front-door verbs that call it, differing by destination (backlog/later vs. active/now) and
  by eliciting the required fields. Maps to the north star: `scaffold` = mechanic; `stub`/`start` = front-door
  judgment.
- **Renames from today:** `graduate` → `promote` (frees the word, which is overloaded across two rungs today; adds
  the missing `demote` inverse). **`abandon` splits out of `deactivate`** — "undo an activation" (recoverable) and
  "throw it away" (destructive) are different intents and no longer share a verb. **`reopen` is added** as the
  genuinely-missing `Integrating → Active` inverse (see § Integrating edges).
- **`promote` carries a judgment gate, not a pure mechanic.** Today's `graduate-work-unit` forces `Class`
  resolution at planned-entry ("never leaves `planned/` carrying `[TBD]`") — the start decision read off the ready
  list needs the weight signal. `promote` keeps that precondition: the location move is mechanic, but a resolved
  `Class` is a gate (the location-axis parallel to `stub`'s required-fields contract). `demote` is net-new (no
  existing workflow): a pure location decrement; `Class` is **sticky** (the ratchet protects realized work — demote
  does not reset it to `[TBD]`).
- **`activate`/`deactivate` keep their names** (the verb matches the `State` value); `deactivate`'s old overload is
  fixed by the *model* (park@Active absorbs "shelve"), not a rename. Idiom-alignment stays a coordination seam
  (final register check with `idiomatic-alignment`), not a blocker.
- **`abandon` is phase/location-polymorphic, like `park`** — abandon-a-stub (rm the backlog dir, no branch),
  abandon-active-Planning (delete `plan/` branch + artifacts), abandon-active-Active (code present — the Case B
  shape), abandon-parked-Active (delete the preserved branch + its pointer-record). **Post-merge abandon** is a
  distinct corner: work already merged to base is a *PR-revert* mechanic (not a branch-delete) and is destructive
  toward shipped history — its own per-cell mechanic. `abandon` leaves **no residue** (no tombstone) by design: a
  reused name resolves as `nonexistent`. If a "you're reusing a deliberately-killed name — intended?" guard is
  ever wanted, it rides **git history** (the abandon commit), never a persistent rendered record.

### The errand lattice + crossing edges

Errands are modeled as a **distinct lifecycle adjacent to** the `(phase, location)` lattice — not folded into it.
An errand has no meta, no phase, no commitment-location; its state is **derived from its `chore/<slug>` branch +
PR** (the shape session-init's `errandState` probe already computes): `in-progress` / `awaiting-merge` /
`merged-cleanup` / `stale`, plus `materializable` (remote-only, no local worktree). Under partial protection there
is no branch — the errand is a direct base commit and its "lifecycle" collapses to commit-then-done.

**The errand-vs-WU gate is character, not increment-count — design modeled here, cascade is a cohort member.**
The old implicit gate (`atomic→errand`, `multi-step→WU`) leaves multi-step single-concern maintenance homeless,
and that hole sits exactly where the lattice's entry predicate belongs — so a gapless model needs the **character**
gate, two paired questions: (1) does the work *author/settle* design or *relocate* already-settled design? (2) does
it write *durable* surfaces (code, rules, strategies, methods, workflows) or only *movable* planning artifacts
(drafts, metas, stubs, buffers, ROADMAP, inbox)? Author-no-design + touch-only-movable ⇒ errand-class **even when
multi-increment**. This pairs with the `Atomic` (capture-character) vs `Errand` (execution-wrapper) vocabulary
split. The gate **design** is owned here; the prose **cascade** across `strategy-work-organization § Errand Work
Class` / DEV-RULES.ARC / AGENT-BRIEF.ARC / `run-errand`'s multi-increment clause is a cohort member (absorbed from
`maintenance-errand-class` under the consistency-on-exit standard — see § Ship shape).

**Crossing edges (the borders the gapless machine must name):**

- **inbox → errand** (`drain-inbox` execution transition): a committed atomic in `USER-INBOX` enters the errand
  `Launch → Execute → Integrate` lifecycle. Capture *holds*; the errand *is* its execution.
- **errand → WU promotion** (`init-work-unit` Promote Errand path): a `chore/<slug>` that crosses the WU threshold
  renames to `<type>/<name>`, mints a meta (scaffold), and enters the WU lattice at `Active` (commits already
  exist; no activation ceremony). The reverse is never modeled — a WU never demotes to an errand.
- **errand → completed/abandoned**: an errand ships (merge / direct base commit) or is dropped; neither writes a
  `completed/` archive (no meta to sweep) — the errand's record is its branch + PR + merged commit.

### The cohort-doc lifecycle + the archival-trigger loop

The cohort doc (`cohort-<name>.md`) is a **constitutive record of a grouping**, not a WU (ADR-024). Its own
lifecycle crosses WU transitions and must be modeled:

- **Mint** — at `decompose` (emergent arm) or incrementally on the **predicted** arm (`assess-cohort-fit` fires
  affirmative during draft-design; author directly into cohort structure, no monolith). Lives in
  `backlog/planned/<cohort>[/<subcohort>]/`.
- **Live** — membership is **derived** from each member's `Cohort` field across **all** lifecycle states, never a
  co-located-directory snapshot. As members graduate (→ flat `active/`) and ship (→ `completed/`), the membership
  *universe* shrinks out of the cohort directory; the doc stays put. "No co-located backlog members" is the
  **fully-activated cohort** — a valid mature state, not breakage.
- **Closeout** — at **last-member ship** (not activation; `active/` is flat by design and has no cohort home), the
  doc is `git mv`'d to `completed/` as a lettered sidecar (`{NN}a_cohort-<name>`).

**Known gap to close (pulled forward from OSD's inbound buffer).** The shipped cohort-consistency validator
derives membership from the *staged backlog delta*, so it cannot tell a **graduated** member from a **removed**
one — a late-edited cohort doc flags every graduated member section as an orphan (hit live on
`cohort-agile-wu-lifecycle`). And the archival-trigger ("close the doc when the last member ships") is not wired.
Both need the **same shared infra** as the slug→state resolver and dep-edge discharge: a *lifecycle-complete
membership resolver* (the set of WUs whose `Cohort` field resolves to a path, across `backlog/planned/` +
`active/` + `completed/`). **Design owned here** (it is a transition side-effect of `archive`); **impl routes to
`operational-state-docs`** — build the resolver once, don't double-build.

### The slug→state resolver — first-class shared infra

Several transitions and guards need to answer "what lifecycle state is WU `<name>` in?" cheaply and
deterministically: `start`'s dispatch, the worktree-occupancy guard, dep-edge discharge, cohort-membership
resolution, materialize. Today the answer is ad-hoc `find`/`ls` (hit live three times in one planning session).
**This WU builds v1**; `operational-state-docs` later generalizes it (adds managed-doc context, dep-edge
integration). Contract:

- Returns a **state enum** — `provisional` / `planning` / `active` / `parked-in-backlog` / `integrating` /
  `shipped` / `nonexistent` — not a boolean; `shipped?` is a trivial projection.
- Resolves by **location** first (presence under `completed/` = shipped; `active/` = active; `backlog/**` =
  provisional/planned/parked per dir + meta), **meta `State` second** (the field can lag the directory — same
  Axis-1 git-is-truth logic session-init uses). **Never** from `git branch` / `git log` inference (the
  arc-backend-named anti-pattern).
- `abandoned` is **not** an enum value — it resolves to `nonexistent` (no residue).

### CLI-migration depth — B1 + the transition table

The central fork, resolved at **B1**: ship a hand-rolled declarative transition table **as code** — states, legal
transitions, inverses, guard requirements, and the per-transition encoding-update spec — with a **thin imperative
executor**. Not B0 (doc-only table) and not B2 (a generic execution engine). Full start/relocation/sweep-cluster
scope; logical location. Three reasons, in priority order:

1. **arc-backend-safety picks the form.** A table over *logical* `(phase, location)` is projection-independent and
   survives the backend swap. A B2 engine that bakes `git mv` as *the* mechanism re-commits the
   "state = file-location + branch-prefix" assumption the blast-radius audit warns against. Invest in the logical
   table; keep the physical executor thin and swappable.
2. **The completeness audit needs the table as a checkable instrument.** As code, the totality + encoding-
   consistency invariants ship as the mechanical guard/test the audit wants ("ship it, don't just audit it").
   B0 can't fail loud.
3. **YAGNI clears B1, flags B2.** B1 is the substrate both the guard/test and future migrations consume — not
   speculative generality. B2 is premature; defer it to whenever `composable-workflows` actually thins the
   workflows.

**The exclusions principle (what migrates now).** A 2D cut, and "excluded" means *executor not built this WU* —
the table (model) is **total regardless**:

- **Axis 1 — judgment vs. mechanic.** Judgment never moves: `decompose`'s cut-map, `activate`'s should-we,
  `integrate`'s merge-approval + completion composition, the create-time commitment/priority/`Class` calls.
- **Axis 2 — within mechanics, the executor migration targets relocation/sweep-mechanics-that-are-seams**
  (duplicated / asymmetric / unowned across `backlog ↔ active` and `active → completed`).

Applied:

- `activate` / `deactivate` / `reopen` — clean in-place phase-flips → in the table; executor needn't migrate (no
  relocation, no seam). `deactivate` additionally carries a semantic + totality seam (below).
- `integrate` — `Active → Integrating` in-place flip → in the table; the *merge* is judgment-gated, the flip is a
  trivial mechanic. Executor optional.
- **`archive`'s sweep migrates** (correcting the prior "no-go"). The `active/ → completed/` sweep is a
  `relocate-artifacts` call (a location move), and the `{NN}` completion-order + `{dated}` quarter computations are
  **pure deterministic mechanics** — exactly the north-star target. Only `archive`'s *judgment* (merge approval,
  completion-content composition) stays in the workflow. So `archive` = `relocate(active→completed)` +
  `set-phase(Shipped)` + `compute-archive-path` + cohort-closeout-side-effect; the executor builds the mechanic
  legs. The terminal *no-go* narrows to "don't auto-decide to merge/ship," not "don't migrate the sweep."
- `decompose` — judgment (cut-map) stays in the workflow; its teardown legs join the shared primitive, but it is
  **not** a relocate-primitive caller (see § decompose matrix). The case that proves the cut splits each
  transition's judgment-half from its mechanic-half.

### `deactivate` is a semantic + totality seam

Its current mechanic is just an in-place flip (`Active → Planning`), so the executor needn't migrate. But it wears
a name inviting "pause an active WU," while the *actual* pause-active-to-backlog operation was an **empty cell**
(now filled by park@Active). It also **predates worktrees / parallelism**: Case A (return to Planning) was never
worktree-patched (only Case A-delete was), and the whole "no task work executed" gate reflects a pre-parallelism
world where setting aside an in-progress unit wasn't a pressing need. Resolution: `deactivate` stays narrow =
"undo a premature activation" (recoverable phase↓); shelving is park@Active; destructive teardown is `abandon`.
The model fix resolves the overload without a rename.

**The post-merge corners are two distinct cells, not one.** When the activation already merged to base:

- **`deactivate`@merged (Case C)** — reverse the activation *back to Planning* via a PR-revert (it can't be undone
  locally; it lives on base). A `deactivate`-flavored corner — restores Planning, deletes nothing.
- **`abandon`@merged (Case D-abandon)** — throw the merged work away via a PR-revert. An `abandon`-flavored corner
  — restores nothing, the WU ceases to exist.

Both are PR-revert mechanics; they differ by *target* (Planning vs. deleted). The prior draft filed both under
"abandon's post-merge corners" — sharpened here: the revert mechanic is shared, the verb (and target) is not.

### The relocation primitive — a 1↔1 mutator bundle

Strictly **1↔1**. Best understood as a small bundle of phase-aware encoding-mutators:

- `relocate-artifacts` — the `git mv` of the WU's artifact set (location ↔ location: `backlog ↔ active`,
  `active → completed`).
- `reconcile-branch` — create / rename / delete / **preserve**, phase-and-direction-conditioned.
- `reconcile-worktree` — spawn / teardown, **including execution-locus relocation**: a transition that tears down
  the worktree it runs from (park@Active, abandon, decompose) must hop the agent's locus out first, or the cwd
  vanishes mid-operation. Same locus-relocation `run-errand` already does; the bundle owns (or demands) it rather
  than leaving it to each caller.
- `set-phase` — the meta `State` write (the phase-axis mutator, no location move).

The bundle fires its mutators **together** so the three-encoding invariant (meta `State` · directory · branch)
holds *by construction* — you can never produce the half-updated `planned`-stub-with-`Branch:[none]` seam the
audit hunts for.

**Callers, by mutator set:**

- **Location-movers** (`park` / `resume` / `promote` / `demote` / init-Path-A / **`archive` sweep**) call
  `relocate-artifacts` + the conditioned branch/worktree mutators.
- **Phase-movers** (`activate` / `deactivate` / `reopen` / `integrate` flip) call `reconcile-branch` (when the
  prefix rotates) + `set-phase`, *not* `relocate-artifacts`.
- **`decompose` is not a relocate caller** (see below) — it shares only the teardown legs.

**Transition side-effects the bundle fires (mechanics the neighbors own).** Every location move re-renders the
**readiness views** — `ROADMAP` *and* `STATUS.USER` (`reconcile-roadmap` / `reconcile-status-user`, calling
`roadmap-tooling`'s renderer). `activate` discharges satisfied `Depends On` edges (`operational-state-docs`'
dep-edge lifecycle resolution — *designed here as activate's side-effect, impl routes to OSD*; it examines each
edge and discharges only landed ones, leaving unlanded deps live). The **user-workspace satellite**
(`user/{identity}/<wu>/` SESSION-NOTES) is touched far more broadly than park/resume/abandon: `init`/`start`
(`arc user open`), `activate` (reaffirm), `integrate`/`decompose` (`arc user close`), and park/resume/abandon all
move/seed/retire it — essentially every transition that changes a WU's existence or location. The bundle *fires*
these; their *mechanics* are the named neighbors' — coordination seams, not re-implementations here.

### `decompose` — the full matrix

`decompose` is not one transform; it is a `{parent-position} × {transform-shape}` matrix. The model carries the
whole matrix; the executor migration scope is settled at create-spec.

**Axis 1 — parent position relative to the one-level nesting cap (ADR-024, shipped):**

- **standalone → top-level cohort** (name preserved).
- **in-cohort → sub-cohort** under the parent (name preserved).
- **at-cap → lateral fan-out** into sibling WUs under the existing parent (no cohort node minted; "came from one
  concern" recorded as a write-once provenance note).

**Axis 2 — transform shape (symmetric shipped; the other three absorbed from `decompose-work-unit-arms`):**

- **symmetric** — live `plan/<name>` origin, cut-map in hand; origin **retired** (`git rm`), **all** members
  newly minted in `backlog/planned/`, whole origin draft distributed.
- **extraction / origin-survives** — origin **kept** (not retired), sheds one orthogonal sub-concern as a new
  sibling, adds the origin→member `Depends On` edge, distributes only the *extracted* sections, **skips** the
  symmetric retirement. The surviving (thinned) origin then takes a **disposition fork**: **keep-active** (it is
  the next executable piece — stays in `active/`) or **park** (it is no longer next-to-execute, or a newly-realized
  dep now blocks it — `park@Planning` relocates it to `backlog/`). The park branch is the *relocate-the-origin*
  case (see the mechanical note below). (The motivating conductor case was an *at-cap extraction* — the axes
  compose.)
- **backlog-stub source** — decompose a `planned/` stub **in place**, no activation, no `plan/` branch; origin
  retired from backlog, members minted in backlog.
- **heterogeneous-home** — members route to **mixed destinations**: a new stub, a **fold into an existing**
  artifact (sibling stub / `draft-design` block), or an **atomic edit** to a standing doc. The
  conservation/allocation gate accepts these, not just all-new-members.

**The mechanical consequence (corrects the prior `relocate(parent, 1↔1)` formula).** Across *every* arm the origin
is either **retired** (`git rm`; symmetric, backlog-stub) or **kept in place** (extraction) — it is **never
`git mv`-relocated**. So `decompose` composes `{retire | keep}(origin) + scaffold×N (or fold/atomic-edit) +
distribute-design + reconcile-branch/worktree(teardown, when a branch existed)`. It is **not** a caller of
`relocate-artifacts`; it shares only the teardown legs with `park`. The earlier "park-exit relocation sub-mechanic
joins the shared primitive" was inaccurate — the *teardown* joins; there is no relocate leg to share. The fan-out
(`scaffold × N`, children seeded from the parent's design, never `git mv`'d — you can't move one source into N
destinations) lives in decompose's orchestration, never in the primitive.

**The "relocate the origin" journey is `park` composing on, not a decompose mechanic.** When an extraction's
surviving origin must return to backlog — it is no longer the next piece to execute, or a newly-realized dep blocks
the whole concern — that is **`decompose(extraction) ∘ park@Planning(origin)`**: two orthogonal primitives in
sequence, the relocate owned by `park`. The thinned origin alone in `active/` is a legal intermediate state, so no
fused mechanic is needed. The decompose *workflow* may surface the surviving-origin disposition and compose the
park when chosen (a `--park-origin`-style convenience), but mints no relocate-the-origin primitive — keeping the
verbs clean and arc-backend-safe. ("ALL decomposed to backlog" is the same shape: members already mint into
`backlog/planned/`, and the surviving origin parks; a symmetric (retired) origin has nothing to relocate.)

**Conservation gate generalizes.** The four-step allocation gate (map every section + dependency edge to exactly
one destination or dropped-with-reason; conserve; retire only after green) must hold under **partial extraction**
(only the extracted subset is consumed; the rest stays on the surviving origin) and **atomic-edit homes** (a
destination that is a standing doc, not a member). `assess-cohort-fit`'s cut-map gains: an entry that names the
*surviving origin* as a member (extraction), and entries naming *existing/atomic homes* (heterogeneous).

### Shelve — `park` made phase-polymorphic + the pointer-record

Shelving an in-progress WU is a genuine need (parallel teams: "drop this, the P0 came in, back in three weeks") —
distinct from leaving the branch dormant (the orphan anti-pattern) and from Case B's integrate/abandon/successor
(which *close* the WU; shelving *suspends* it). It is modeled as **`park` made phase-polymorphic** — a pure
location decrement with **phase held** (resume drops back into the same phase, not re-planning):

- **park@Planning** — no code; tear the branch down, re-cut `plan/<name>` on resume. (Today's spec.) Renders as
  `queued` (see derived-state note).
- **park@Active** — code exists; **preserve the branch** (pushed = the durable shelf), tear down only the worktree,
  relocate artifacts. Resume re-attaches the branch (≈ the existing Materialize mechanic). Renders as `parked`.

This snaps onto the 2×2: `activate`/`deactivate` are the phase-axis verbs; `park`/`resume` the location-axis
verbs; each polymorphic over the other axis. **Park's guards:** reject park-from-`Integrating` (the `(Integrating,
backlog)` cell is illegal — close/withdraw the PR first via `reopen`); commitment (`provisional/` vs `planned/`)
is picked at park time.

**The pointer-record (tracked-file resolution).** Under tracked files there is an irreducible tension: incomplete
code anchors to a branch, but ROADMAP visibility wants a local directory entry. park@Planning relocates fully
because no branch anchors it; park@Active **can't**. Resolution: a parked-Active WU's **authoritative artifacts
stay on the preserved branch; `main` carries only a minimal render-pointer** (`State: Active (parked)`,
`Branch: feat/X`, + render fields), **blessed as a legal state shape** the three-encoding sweep *expects* rather
than flags. The branch meta is authoritative; the pointer is regenerable, never hand-edited; a parked WU is
untouched until resume removes the pointer → near-zero drift. This is the `arc-backend` record + projection model
applied early to one state — maximally forward-compatible (pointer → record, `Branch` → code-ref field, zero
reshape). Rejected alternatives: full-relocate-to-`main`-`backlog/` (divergent-location merge mess at eventual
integration); materialize-discovery-only (ROADMAP-blind). The park@Active executor **ships in this WU** (not
deferred).

### `stub` creation contract — the CLI never fabricates judgment values

`stub` (idea → `backlog`) requires **commitment** (`provisional` | `planned`) **and priority** as explicit inputs
— no silent `provisional` / `P3`. The principle: the CLI mechanic never fabricates judgment values (commitment and
priority are the maintainer's call — not maturity, not who minted the stub), the create-time parallel to "the CLI
executes transitions, it never decides to take them." Today these silently default across scattered create-paths
(`decompose`, drain new-stub scaffolding, `init`, cold-start) — `drain-inbox § 5` says "user decides, never
hard-default" but it's unenforced, and priority has no guard at all. The **unified `stub` primitive makes
enforcement one chokepoint**: every create-path routes through it. Under non-TTY it fails or requires an explicit
flag (don't fabricate), riding `cli-substrate-adoption`'s generic non-TTY prompting-command substrate (coordination
seam). The mandatory-fields *policy* statement is authored in `strategy-work-organization`. This absorbs the core
of CSA's "require commitment + priority at stub creation" item (the unified primitive + contract); CSA keeps the
generic non-TTY substrate (reconciliation breadcrumb filed).

### The planning-entry write-context gate

A mechanical preflight in `arc-plan` (the planning analog of `run-errand`'s / the inbox flows' `resolveWriteContext`)
that **resolves write-context and routes** before `draft-design` runs — replacing today's prose-only rule that lets
`arc-plan` drop a draft onto `main` where it can't be committed. Inputs: branch context × protection mode ×
draft-presence/location × active-WU. Routes:

1. **Committable drafting context** → proceed into `draft-design` (on `plan/<name>` under full; on base under partial).
2. **Not committable for a new draft** (base, full, no plan branch) → by WU-worthiness: start now → `start`/`init`
   (scaffold `plan/<name>`) → draft; not now → **defer** (classify via `maintenance-errand-class` → errand or `stub`).
3. **Pre-authored draft, no branch** → **adopt** (`start --from <draft>`): cut `plan/<name>`, relocate the draft
   into `active/`. A new entry edge. Sub-cases: a draft *inside a backlog stub* is just start-a-planned-stub (same
   edge); the genuinely-new case is a *loose* draft on base with no stub/meta.

**Where it lives (B1):** the `resolveWriteContext` mechanic → CLI (reuse/extend the existing one — one primitive
serving errands, inbox, *and* planning entry); the route *decision* surfaces to `arc-plan` for the developer to
confirm. The CLI resolves + recommends; it never decides to start/defer.

**Boundary (the seam is crowded — four neighbors):**

- **`out-of-wu-entry`** owns session-init's entry *dispatch* (explicit signals outrank implicit resume, preserve
  checkout; its `--new`/`--discover` arm). The gate is the *room* that dispatch's planning-start signal lands in.
  Share `resolveWriteContext` + one start-new code path; it likely sequences first (bugfix-grade, small).
- **`composable-workflows`** owns where the resolve-then-route mechanic's CLI/fragment cut falls (the gate is a
  resolve-then-route instance — the retired conductor's sharper successor).
- **`maintenance-errand-class`** owns the defer-arm's classification targets (errand-by-character).
- **`planning-pipeline-readiness`** owns the *exit* readiness judgment (draft→spec) at the same `arc-plan` seam; the
  gate is the *entry* preflight. They compose — keep the two `arc-plan` responsibilities cleanly split.

Ours: the gate + the adopt-draft entry edge. Theirs: dispatch, fragment-cut, errand-classification, readiness.

### Protection-mode shaping — mode lives in the ship layer, not the transition mechanics

The design above is written in the **full-protection frame** (plan/ + feat/ branches, PRs, the pointer-record).
Partial protection is the **default** and the **floor** — ARC defines exactly two modes (`full`, `partial`); there
is no `none`. Critically, *partial still branches planned work* (`strategy-work-organization` § Mode Summary:
"Planned Work: Branches required") and still holds "main carries no in-flight WU artifacts." A regime that put
tracked-WU work directly on base would be a `none` mode ARC does not define — out of scope. The projection layer
recognizes `{full, partial}` and **degrades any unknown `branch.protection` value to partial** (the safe floor —
never silently drop to no-branches; the config value is an unconstrained string today, so a stray value must fail
safe). Breadcrumb: tighten config validation to reject unknown values (coordination seam, not this WU's scope).

The verb-set × {full, partial} sweep resolves into **two orthogonal layers, and only the second is mode-shaped**:

- **Mutator bundle — the *what* of a transition** (`relocate-artifacts`, `reconcile-branch`, `reconcile-worktree`,
  `set-phase`): **mode-invariant for every tracked-WU transition.** A tracked WU owns its single branch
  (`plan/<name>` → `<type>/<name>`) in *both* modes, so `park`@Planning deletes the `plan/` branch, `park`@Active
  preserves the `<type>/` branch and writes the pointer-record, `activate` rotates the prefix, `resume` re-attaches,
  `archive` sweeps to `completed/` — identically under partial. The bundle never branches on protection mode.
- **Ship mechanism — how a transition's resulting commit lands on the protected base**: mode-shaped but **uniform**,
  not per-transition. Full ships every change through branch + PR (backlog/meta grooming via the auto-merge lane,
  design/code via the reviewed lane); partial ships backlog grooming (`stub` / `promote` / `demote`) and errands as
  **direct base commits**, while tracked feature work and integration still branch + PR. Owned by the commit/release
  ceremony + auto-merge-lane classification — a transition declares *what lands on main*; the ship layer decides
  *how*, parameterized by mode.

So partial relaxes exactly **two surfaces**, neither inside the mutator bundle:

1. **The pre-WU drafting boundary.** Pre-formalization drafting may sit on base under partial (no branch or meta
   until the work formalizes into a tracked WU); full requires `plan/<name>` from inception. The planning-entry
   write-context gate owns this — its route-1 "committable drafting context" is mode-parameterized (**base** under
   partial, **`plan/<name>`** under full). Not a mutator change.
2. **The ship mechanism** for non-WU grooming (above).

Consequence: three-encoding consistency stays **three-encoding for tracked WUs in both modes** — the branch axis does
not collapse for them; only the pre-WU and non-WU paths lack a WU branch, and they never had one. The park@Active
"incomplete code resting on base" tension does not arise: Active code lives on its `<type>/` branch in both modes;
the on-base picture describes only a loose pre-WU draft, which is not a tracked WU and does not park.

### The `Integrating` phase's edges

The phase has edges the table must name (the sweep internals migrate per § exclusions; the merge stays judgment):

- **`Active → Integrating`** (`integrate`, open PR, flip `State`) — owned by `integrate-work-unit`.
- **`Integrating → Active`** (`reopen` — withdraw from review / PR rejected → back to work) — the
  **genuinely-missing inverse**, now named as the `reopen` verb. Today `deactivate` refuses to rotate an
  `Integrating` meta ("close the PR first"), leaving this an unnamed cell; `reopen` fills it (close/withdraw PR →
  `State: Active`).
- **`Integrating → park`/`abandon`** — route through `reopen` first (close the PR), then park/abandon the resulting
  `Active` WU. No direct edge: the open PR must be withdrawn before a location move.
- **`Integrating → completed`** (`archive` — sweep + `set-phase(Shipped)`) — terminal; sweep mechanic migrates.
- **Illegal cells, marked not ambiguous:** `location = backlog` × `phase = Integrating` (can't park a PR-open WU);
  and `completed` is a **sink** — no out-edges, "reopen-after-ship" is a new WU with an origin-link (distinct from
  the `Integrating → Active` `reopen`, which is pre-merge).

## Forward-compat threads (coordination seams + design-fed-back routing)

This WU is the **first real CLI-orchestration WU**, and the ROADMAP shows it sitting *upstream* of nearly all the
substrate it would naturally consume: it is the only In-Flight WU; `cli-substrate-adoption` and `roadmap-tooling`
are Ready-but-unstarted; `operational-state-docs` and `schema-introspection-layer` are Blocked on CSA. So the
question is **not** "what to pull in early" (almost nothing is ready, and pulling it in would import the
WOR→CSA→OSD chain as a hard dependency this WU's P1 urgency can't afford). The postures, applied per neighbor:

- **Design *toward*** (no hard dep): `arc-backend` / ADR-022 record+projection; storage-agnostic record shapes.
- **Hand-roll now, migrate later**: executor mechanics CSA will own (raw `git` + a minimal non-TTY guard now →
  execa / zod / neverthrow + the shared prompting substrate later).
- **Build v1 / re-home**: the slug→state resolver (this WU is first-need *and* lands first → it builds v1; OSD
  generalizes).
- **Design here, impl routes back** (the hybrid call): a transition's *semantics* are designed in this holistic
  model even when its *impl* belongs to a downstream owner — fed back as that owner's refined spec.

Per neighbor:

- **`decompose-work-unit-arms` — design absorbed here.** The three transform-shape arms (extraction, backlog-stub,
  heterogeneous-home) are modeled into the decompose matrix above. It is narrowly lifecycle, so its design folds
  into this WU; its impl becomes either a cohort member or the standalone WU consuming this model. Its inbound
  buffer (decompose-as-errand-class; team-ownership/lifecycle-timing facilitation) composes — the errand-class
  framing coordinates with `maintenance-errand-class`; the facilitation axis stays the arms WU's to spec.
- **`operational-state-docs` — transition *behaviors* built here; record *substrate* stays OSD's.** Under the
  consistency-on-exit standard, the behaviors our verbs owe are **built here** against the current markdown
  substrate (hand-roll now, migrate later), not deferred: (1) the **slug→state resolver** v1 (load-bearing —
  `start` dispatch + occupancy guard need it; OSD generalizes onto records); (2) the **lifecycle-complete
  cohort-membership resolver + archival-trigger loop** (load-bearing — without it the model's "cohort doc closes at
  last-member ship" never fires and docs strand; same shared index infra as the resolver — build once); (3)
  **dep-edge discharge** at `activate` (examine-each-edge, discharge-landed-only, discharged edges → provenance
  prose per OSD's lean — *additive, not a hole*; included because the resolver is already here and it kills a live
  tracked read-hazard, but the genuinely-optional member). What stays OSD's is the **record/projection substrate
  itself** — the structured-record model, render/reconcile engine, and the ~16-draft managed-doc migration
  (ADR-022, a different foundational domain); OSD later re-homes these three behaviors from markdown onto records,
  zero reshape. OSD's tombstones (deletion markers for `USER-INBOX`/`WORKING-MEMORY` *merge convergence*) are a
  **different concept** — not used for WU-abandonment; abandon leaves no residue. CSA's "defer the state machine
  until WOR settles" condition is now *satisfied* (WOR + worktree foundation shipped) — proceeding is consistent
  with CSA's guidance; its eventual zod `State`-enum + meta schema are forward-compatible with the two-axis logical
  model (no collision).
- **`maintenance-errand-class` — gate design absorbed; cascade is a cohort member.** A gapless errand lattice
  *requires* the character gate (the old count-based gate leaves multi-step maintenance homeless — a hole where the
  lattice's entry predicate belongs), so the gate **design** folds into the errand-lattice section above. MEC's
  prose **cascade** (the `strategy-work-organization` / DEV-RULES.ARC / AGENT-BRIEF.ARC / `run-errand` edits) is a
  cohort member — its own deliverable, absorbed under the consistency-on-exit standard rather than left to a
  separate downstream pass (it is doc-only, mechanical, and leaving it deferred would ship a lifecycle whose
  authoritative definitions still describe the old gate). The inbox→errand and errand→WU crossing edges fire the
  gate at their judgment points.
- **`cli-substrate-adoption` — downstream substrate, not an upstream blocker.** Hand-roll the thin executor's git +
  non-TTY mechanics now; CSA later migrates them to execa / zod / neverthrow + the shared prompting substrate. The
  `stub` required-fields **policy** stays ours (authored in `strategy-work-organization`); the non-TTY prompting
  **mechanic** migrates to CSA's substrate.
- **`roadmap-tooling` — this WU produces predicates + the Parked state; RT renders.** Boundary is already right (we
  emit derived-state predicates and keep them queryable; RT consumes both `ROADMAP` and `STATUS.USER`). Interim
  caveat: `park` introduces a **Parked render bucket RT doesn't render yet**, so until RT ships,
  `reconcile-roadmap` / `reconcile-status-user` ride the **hand-render discipline** (per WORKING-MEMORY) and that
  discipline must cover the Parked bucket.
- **`schema-introspection-layer` — nothing to do; pure publication.** Post-CSA `arc schema` surface; our `State`
  enum + transition table simply *become* introspectable when it ships. Our table is a **behavior contract** (who
  may transition where), a different concern from SIL's **I/O contracts** — so the transition table gets its **own
  home and does not wait on the (still-unresolved) schema-home convention**.
- **`composable-workflows` — the workflow-shell twin; the markdown-tier counterpart of our code-tier bundle.** As
  transition mechanics move to the CLI, the remaining workflows are exactly the judgment + orchestration shells it
  wants. **Our mutator bundle is the code-tier worked example of a `public + fixed` shared procedure**
  (non-overridable *because* three-encoding consistency depends on identical behavior everywhere); the ceremonies'
  judgment halves are the markdown-tier private orchestration fragments it will own. A method-model refinement this
  surfaced (orthogonal *visibility* + *override-policy* axes; fragments = private methods; method-shaped *pull*, not
  extension-shaped *push*) is **CW's design** — routed to its inbound buffer, bundle cited as the worked example. It
  also owns the cross-file anchor convention the rewrite leans on.
- **`graduation-cleanup` — stays out (the consistency-on-exit limit, working).** A history-rewrite *companion
  ceremony* riding the `activate` and `park` edges — `activate`/`park` are **correct** without it (it only drops
  planning-noise commits before the state-flip), so deferring it leaves the substrate *un-enhanced*, not
  *inconsistent*. The model names the **hook point** (`activate`/`park` fire an optional cleanup); the drop-rules /
  modes / `--force-with-lease` ceremony stay its own, coordinating the merge-gate seam with
  `concurrent-work-conventions`. This is the worked example of the additive-vs-consistency test.
- **`arc-backend` — the deepest constraint (forward-compat, non-negotiable).** It makes `meta`/`tasks`/`status` a
  materialized *projection of records* (ADR-022, Architecture B) in a separate git backing store. The state machine
  models WU state as a **logical record** (phase, location as fields), with the physical encoding (directory,
  branch) a projection — exactly the B1 + logical-location + pointer-record direction above (pointer → record,
  `Branch` → code-ref field; zero reshape). **Design guard (the blast-radius warning, made a constraint):** the
  slug→state resolver *and* the worktree-occupancy guard resolve state from **location + meta fields, never from
  `git branch` / `git log` inference** (the named anti-pattern). Note arc-backend moves *PM state* out of tree, not
  *code* — so park@Active "preserve the `feat/` branch as the durable shelf for in-progress code" stays valid; only
  the pointer/meta must be storage-agnostic. Self-check record shapes against `strategy-storage-evolution.md`.
- **`idiomatic-alignment` — names the verbs; `type` declined for this WU.** Its register applies to the verb-naming
  pass (`start`/`park`/`promote`/`demote`/`reopen`/`abandon` — align with dominant idioms unless deviation is a
  genuine value-prop); the final register check coordinates with it. Its **frontmatter `type`** proposal is the
  wrong layer for this WU (we relocate a *known* artifact set keyed by **prefix+slug**, never query the corpus by
  type; the machine-legibility we need is the logical `(phase, location)` record). Declined here; owned by IA.
  **`index.md`/`log.md` declined too**: an index is redundant (prefix+slug glob / probe `companions` enumerate the
  set the bundle moves); a per-WU log cuts against ADR-022's "no separate status doc — that content is `meta-*`
  fields."
- **Goal-relative work selection — consumes the derived-state predicates.** A future "direction layer" / next-work
  recommender (captured this session, `WU_Target: TBD`; reopens `roadmap-tooling`'s "Direction's home") reads the
  parked / in-flight / on-my-plate predicates this WU produces, plus the dependency graph. The obligation here is
  only to **keep those predicates queryable** (exposed via probe / status), not buried in rendering.
- **`single-owner-wu-model` — owner-count-agnostic orthogonality.** A `concurrent-work-conventions` cohort member
  (`Depends On: concurrent-work-doctrine`) that sets the WU *ownership* model (one DRI) — a different axis from the
  state machine. **Not absorbed:** the lifecycle is owner-count-agnostic by construction (states/transitions don't
  depend on DRI count). Seams only — both edit DEV-RULES.ARC in *different* sections (sequence, don't co-edit); our
  primitive carries `**Owner:**` opaquely while single-owner *defines* it; `decompose`'s `scaffold×N` sets each
  member's owner.

## Absorbed from prior stubs

**From `park-resume-lifecycle`** (retired at the prior draft pass, absorb-then-retire) — resolved into the model:

- **Park** (`Planning`/`Active` → `backlog/{state}/<wu>/`) — branch + worktree handling follows the
  phase-polymorphic rule (delete at Planning, preserve at Active); `State` held; commitment picked at park time.
- **Resume** (`backlog` → active) — re-spawn worktree, reconcile branch, `relocate-artifacts` back. Its mechanical
  half *is* `init-work-unit` Path A — now the shared 1↔1 bundle, never re-authored.
- **DRY constraint** — resume reuses init Path A; park reuses decompose's teardown legs. Both now collapse into the
  one shared relocation mutator bundle.
- **Class-aware applicability** — park/resume is the dominant flow for `Heavy`/`Novel` planning that pauses for
  weeks; errands skip it; `Light` rarely parks.

**From `decompose-work-unit-arms`** (design absorbed this session) — the three additional transform-shape arms
(extraction-origin-survives, backlog-stub-source, heterogeneous-home) folded into the § decompose matrix; the
conservation-gate generalization (partial extraction, atomic-edit homes) and the cut-map extensions (surviving-
origin member; existing/atomic homes) recorded there. Impl routes to the arms WU (or a cohort member) consuming
this model. Its inbound-buffer concerns (decompose-as-errand-class; team-ownership/lifecycle-timing facilitation)
stay coordination seams.

## Open design questions

The load-bearing forks are resolved above. What remains for `create-spec`:

- **Per-cell mechanics to settle** (named in the model; mechanics firm at spec): `abandon`'s per-cell set incl. the
  post-merge PR-revert corner; the `reopen` mechanic (PR withdrawal + state flip); `start`'s full dispatch + the
  worktree-occupancy guard; execution-locus relocation in the worktree mutator; the conservation gate under partial
  extraction / atomic-edit homes.
- **Final transition-table representation + guard placement.** Settled in principle (legality / inverse / guard data
  plus the encoding-update spec; guards in the mutator bundle / table-validated); concrete shape firms at spec.
- **Executor migration scope for `archive`'s sweep.** The model has the sweep as a relocation mechanic; whether its
  executor ships this WU or is fed back depends on the cohort cut.
- **Ship shape (likely a cohort) + the consistency-on-exit standard.** Hold as one coherent draft now; let
  `create-spec` decide the cut. **The standard:** when the transformed domain is this foundational (the lifecycle
  core), the cohort owns leaving the substrate *coherent*, not merely functional-in-parts — absorb the mechanical
  cascades that would otherwise leave a documented-but-unbuilt / half-migrated core. The deferral savings (diff
  size) are shallow and short-lived; the half-migrated cost is deep and long-lived. **The limit (the test):**
  absorb what would be *inconsistent* if deferred (model says X, substrate doesn't do X); leave out what is merely
  *un-enhanced* (substrate does X correctly, lacks an additive nicety — e.g. `graduation-cleanup`) and what is a
  *different foundational domain* (OSD's record/projection substrate). Plausible members:
    1. the logical model + code-level transition table;
    2. the start/relocation/sweep executor + guards (name-collision + worktree-occupancy);
    3. the park@Active pointer-record;
    4. the planning-entry write-context gate + adopt-draft edge;
    5. the decompose-matrix arms (extraction / backlog-stub / heterogeneous-home) + workflow rewrite;
    6. the slug→state resolver v1 (+ cohort-membership/archival-trigger; + dep-edge discharge, the optional one);
    7. the errand-lattice gate + MEC vocabulary/definition;
    8. a **closeout doc-cascade member** — the cross-cutting documentation propagation (verb renames across the
       strategies, the vocabulary, the lifecycle-workflow rewrites, MEC's definitional cascade) concentrated into
       one auditable final member that leaves the corpus consistent and runs the final audit. Rule: per-member
       docs still update *with* their code (local consistency — no member ships code whose own doc lags); the
       closeout does the *cross-cutting* sweep + audit (global consistency). A pattern ARC has used before.
  Candidate to evaluate: `out-of-wu-entry` (shares the entry primitive; small). Avoid re-shattering what we are
  consolidating — the cut groups the model, the executor/mechanics, and the cascade, not a member per verb.
- **`graduation-cleanup` boundary** — confirmed a companion ceremony riding `activate`/`park` (hook named here,
  ceremony stays downstream); the merge-gate ownership seam settles with `concurrent-work-conventions`.

## Completeness audit — done (this session)

The draft → spec gate ran this session: lifecycle workflows re-read fresh (`graduate` / `init` / `activate` /
`deactivate` / `decompose` / `integrate` / `archive` / `run-errand`), static + behavioral sweeps over the model.
The explicit state machine is its own audit instrument — most seams are empty/ambiguous/inconsistent *cells* found
by sweep, not luck. With the B1 code-level table the static invariants become a **shippable mechanical guard/test**
(ship it, don't just audit it) — `finalize-parallelism`'s end-to-end trace is the final backstop.

**Results folded into the model above:**

- **Totality / inverse / three-encoding sweeps:** the lattice is total over the six derived cells; `blocked` is an
  overlay, `park@Planning` collapses to `queued` (both noted). Added the missing `Integrating → Active` inverse
  (`reopen`). Inverse pairs complete: `activate↔deactivate`, `park↔resume`, `promote↔demote`, `stub↔abandon`,
  `integrate↔reopen`; `decompose` and the terminal edge remain (correctly) irreversible.
- **Negative-space / guards:** `start`'s two guards (name-collision + worktree-occupancy); `promote`'s Class gate;
  `park`'s reject-from-Integrating guard — all named.
- **Deterministic-but-prose (north-star filter):** the planning-entry gate is the one in-scope gap (captured); the
  `archive` sweep + `{NN}`/`{dated}` computations were mis-filed as no-go and are **pulled in** as migratable
  mechanics; ROADMAP/STATUS.USER render stays `roadmap-tooling`'s.
- **Corrections:** `decompose` is `{retire|keep} + scaffold×N + distribute`, **never** a `relocate-artifacts`
  caller (only shares teardown with park); the `relocate(parent,1↔1)` formula was wrong. `abandoned ≡ nonexistent`
  for dispatch (no tombstone). `deactivate`@merged (Case C → Planning) is a distinct corner from `abandon`@merged
  (→ deleted), sharing the PR-revert mechanic but not the target.
- **Unmodeled adjacents brought in scope:** the **errand lattice** + crossing edges (character gate referenced from
  `maintenance-errand-class`) and the **cohort-doc lifecycle** + archival-trigger loop (resolver impl → OSD).
- **Sharpenings folded:** the user-workspace satellite side-effect spans init/activate/integrate/decompose +
  park/resume/abandon (not just the latter three); `STATUS.USER` is a readiness-view side-effect alongside
  `ROADMAP`.

## No-gos

- Planning-pipeline *content* — owned by `planning-pipeline-readiness`.
- The OSD **record/projection substrate** (the structured-record model, render/reconcile engine, the ~16-draft
  managed-doc migration — ADR-022) — a different foundational domain, stays `operational-state-docs`'. The
  *transition behaviors* (slug→state resolver v1, cohort-archival-trigger, dep-edge discharge) are built **here**
  against the current substrate and re-homed onto records by OSD (see § Forward-compat).
- `graduation-cleanup`'s drop-rules / history-rewrite ceremony — additive (activate/park are correct without it);
  hook named here, ceremony owned downstream.
- `integrate`'s merge approval + completion-content composition — judgment, stays in the workflow (only the sweep
  mechanic migrates).
- Full CLI-migration of *every* transition — this WU takes the bounded start/relocation/sweep slice; the rest
  migrates over time as `composable-workflows` thins the workflows.

## Scope Estimate

Large (week+), `Novel` — **likely a cohort** at `create-spec`. With CLI-migration depth settled at B1, the surface:
a logical state model spanning all three lifecycles + a code-level declarative transition table; the slug→state
resolver (v1); CLI verbs + guards (name-collision + worktree-occupancy); the shared 1↔1 relocation/sweep mutator
bundle (with execution-locus relocation and the ROADMAP / STATUS.USER / dep-edge / user-satellite side-effects);
the park@Active pointer-record; the `stub` required-fields contract; the planning-entry write-context gate (reusing
`resolveWriteContext`) + the adopt-draft edge; the full decompose matrix (4 transform shapes × 3 parent positions);
the errand lattice + crossing edges; the cohort-doc archival-trigger loop; protection-mode (full/partial) shaping;
and the verb-rename cascade (`graduate → promote` + `demote`, `abandon` split, `reopen` added, `start` dispatch) +
reconciliation of load-bearing docs (`strategy-work-organization`, the lifecycle workflows, DEV-RULES.ARC) + verb
naming.

### Dependencies

- **Hard:** none. Everything it builds on has shipped (`arc start`, `decompose-work-unit`'s `park-exit` block).
- **Coordination (forward-compat):** `decompose-work-unit-arms` (design absorbed; impl a cohort member),
  `operational-state-docs` (transition *behaviors* — resolver v1, cohort-archival, dep-edge discharge — built here;
  record/projection *substrate* stays OSD, re-homes them later), `maintenance-errand-class` (gate design absorbed;
  prose cascade a cohort member), `cli-substrate-adoption` (hand-roll now, migrate later),
  `roadmap-tooling` (predicates + Parked state → render), `schema-introspection-layer` (pure publication),
  `composable-workflows`, `graduation-cleanup` (companion-ceremony hook), `arc-backend` /
  `strategy-storage-evolution.md`, `idiomatic-alignment`, and the goal-relative work-selection capture. See
  § Forward-compat threads for the per-neighbor posture.
- **Downstream:** de-risks `finalize-parallelism` and should sequence before it — propose adding
  `lifecycle-state-machine` to that WU's `Depends On` (an edit to its meta, flagged not yet made).

---

## Continuity

- **Readiness state:** **formalization-ready** — exploration is stable and every settle-able decision is settled
  across all three lifecycles. Scope is known and the load-bearing forks are resolved (CLI-migration depth → B1;
  phase ⊥ location → two logical axes + derived predicates; the full inverse-paired verb set incl. `reopen`; the
  1↔1 relocation/sweep mutator bundle; the decompose matrix; park@Active pointer-record; the `stub` required-fields
  contract; the errand lattice + crossing edges; the cohort-doc lifecycle + archival loop; the slug→state resolver
  contract; protection-mode shaping = ship-layer + pre-WU boundary, mutator bundle invariant). The remaining open
  items are detail-design deferred to `create-spec`, the ship-shape cut, or wait-and-see — not fundamentals.
- **Resolved (cumulative):** CLI-migration depth = **B1** (logical code table + thin executor, full
  start/relocation/sweep scope, logical location); the exclusions principle (2D cut; "excluded" = executor-not-
  migrated, model total) — with **`archive`'s sweep + `{NN}`/`{dated}` pulled in** as migratable mechanics (was
  mis-filed no-go). `deactivate` narrow (semantic+totality seam; Case C/D post-merge corners separated by target).
  **Shelve = `park` made phase-polymorphic** with the **pointer-record** for park@Active (shipping). **Two axes
  suffice** — engagement derived; Parked bucket; `park@Planning`≡`queued`; `blocked` an overlay; predicates
  queryable. The **relocation primitive = 1↔1 mutator bundle** (`relocate-artifacts` / `reconcile-branch` /
  `reconcile-worktree` / `set-phase`); **`decompose` composes `{retire|keep} + scaffold×N + distribute` and is NOT
  a relocate caller** (corrects the prior formula). The **full verb set** (`start ⊥ park` headline; `scaffold`
  internal; `stub` user verb; `graduate → promote` + `demote`; `abandon` split; **`reopen` added**); `promote`'s
  Class gate; `demote` Class-sticky. The **`stub` required-fields contract**. The **planning-entry write-context
  gate** + adopt-draft edge (boundary vs `out-of-wu-entry` / `composable-workflows` / `maintenance-errand-class` /
  `planning-pipeline-readiness`). **Protection mode = ship-layer property**; mutator bundle mode-invariant for
  tracked-WU transitions; partial relaxes only the pre-WU drafting boundary + non-WU grooming ship mechanism; floor
  = partial; unknown values degrade to partial. **Forward-compat alignment** (upstream-of-substrate posture; design
  *toward* arc-backend; hand-roll-now-migrate-later CSA mechanics; build-v1 resolver; **no `git branch`/`log` state
  inference**). **Audit-pass resolutions** (this session): errand lattice + cohort-doc lifecycle brought in scope
  (per direction — gapless machine); `decompose-work-unit-arms` design absorbed (full matrix); `abandoned ≡
  nonexistent` (no tombstone); archive sweep in-scope; the slug→state resolver promoted to first-class shared infra;
  Tier-C sharpenings folded (satellite side-effect breadth; STATUS.USER side-effect; promote Class gate; park
  guards; Case C/D split). **decompose-and-park = `decompose(extraction) ∘ park` — relocate owned by `park`, not a
  decompose mechanic; surviving-origin disposition fork (keep-active vs park).** **Consistency-on-exit standard
  adopted** (foundational-domain cohorts leave the substrate coherent, not functional-in-parts): MEC gate design
  absorbed + cascade a member; OSD transition *behaviors* built here (resolver v1, cohort-archival, dep-edge
  discharge) while the record *substrate* stays OSD; a closeout doc-cascade member; the additive-vs-consistency
  limit (graduation-cleanup stays out; OSD substrate stays out).
- **Open:** per-cell mechanics (`abandon` post-merge, `reopen`, `start` dispatch, occupancy guard, locus relocation,
  conservation gate under extraction/atomic homes); final transition-table representation + guard placement;
  `archive`-sweep executor scope; ship shape / cohort cut (→ `create-spec`), incl. `out-of-wu-entry` membership and
  whether dep-edge discharge rides this cohort (the optional member); `graduation-cleanup` merge-gate ownership seam.
- **Next:** the substantive design is settled and the completeness audit is run — proceed to `create-spec`
  (which re-reads the derivation axis at its own entry, with this draft as its richest evidence), letting it decide
  the cohort cut.
