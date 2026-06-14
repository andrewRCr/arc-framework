# Draft: Lifecycle State Machine

- **Origin:** [internal] — supersedes `park-resume-lifecycle`. The work-unit lifecycle was decomposed into shards
  at the `arc-plan-conductor` decomposition (2026-06-12 — `park-resume-lifecycle` §20, `graduation-cleanup` §19,
  `planning-pipeline-readiness`) faster than it was made coherent, and `worktree-default-start` (shipped
  2026-06-13) then bolted the `arc start` CLI front door onto a still-incomplete transition-verb set. This WU
  consolidates the lifecycle into one explicit, coherent state machine and closes the known seams.
- **Cohort:** [none]
- **Purpose:** Make the WU lifecycle an explicit, complete, coherent state machine — every state and transition
  named with its inverse — and take the first deliberate step toward the north star where deterministic transition
  *mechanics* live in the CLI and workflows shrink to the judgment that decides whether/when to fire them. Resolve
  the verb-semantics incoherence (`start`/`resume`/`park`/`activate`/`graduate`/`deactivate`), wire `arc start`
  graduation-routing + a collision guard, and DRY-unify the relocation primitives.

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
- **Relocation logic is duplicated across ceremonies.** The `backlog ↔ active` and `active → backlog` moves are
  re-authored across `init-work-unit` Path A, `decompose-work-unit`'s `park-exit` block, and the unshipped
  park/resume. `park-resume-lifecycle`'s own draft already flags the DRY constraint (resume must reuse init Path
  A; park must reuse decompose's teardown blocks) but never unifies it.
- **The machine is ~90% markdown, with no single source.** Of ~10 lifecycle transitions, exactly one is
  code-driven (`arc start` create-new) — and it is the newest, bolted on. The rest are agent-run markdown
  ceremonies whose transition rules are restated per workflow (branch prefix, meta `State`, preconditions). There
  is no canonical declaration of what the states and legal transitions are.
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

This matters now because `finalize-parallelism` — a P1 verify-and-gate closeout — is explicitly *not* a redesign
catch-all: its seam-resolution model is "absorb-if-atomic, else spawn a follow-up WU." A muddy lifecycle
guarantees it discovers these lifecycle gaps reactively and spins off follow-ups mid-closeout — the
friction-after-the-fact it exists to pre-empt. Consolidating the *known* seams first de-risks it.

## The inventory — the lifecycle state machine as it exists today

The evidence spine the resolved model below corrects. States: `provisional` → `planned` (in `backlog/`) →
`Planning` → `Active` → `Integrating` (in `active/`) → `completed`; plus `abandoned`.

| Transition                           | Owner (CLI / workflow)                                         | Inverse                     | Seam                                                                            |
|--------------------------------------|----------------------------------------------------------------|-----------------------------|---------------------------------------------------------------------------------|
| idea → `provisional`                 | **none codified** (manual mkdir + template)                    | (delete)                    | No create-stub path; unowned                                                    |
| `provisional` → `planned`            | `graduate-work-unit` (WF)                                      | **unowned** (demote)        | "graduate" is *only* this rung; confusable with the next                        |
| `planned` → `Planning`(active)       | `init-work-unit` Path A (WF)                                   | `park` (unshipped)          | **Not CLI-wired**; `arc start` mis-scaffolds here                               |
| fresh → `Planning`(active)           | `arc start` create-new / `init` Path B (**CLI**)               | `deactivate` A-delete       | the **only** code-driven transition                                             |
| `Planning`(active) → `backlog`       | `park` (**unshipped**); `decompose` does a park-shaped variant | `resume` / init Path A      | park unshipped; decompose factored a reusable `park-exit` block for it          |
| `backlog` → `Planning`(active)       | `resume` (**unshipped**) = init Path A                         | `park`                      | conflated with init Path A; "resume" semantics wrong for a never-activated stub |
| `Planning`(active) → cohort          | `decompose-work-unit` (WF)                                     | irreversible                | shares teardown mechanics with park                                             |
| `Planning` → `Active`                | `activate-work-unit` (WF)                                      | `deactivate-work-unit` (WF) | the one clean inverse pair                                                      |
| `Active` → `Planning`                | `deactivate` Case A (WF)                                       | `activate`                  | clean                                                                           |
| `Active`/`Integrating` → `completed` | `integrate` + `archive` (WF)                                   | —                           | solid (no-go)                                                                   |
| any active → `abandoned`             | `deactivate` A-delete / Case B                                 | —                           | overlaps park/teardown mechanics                                                |

## North star: deterministic mechanics in the CLI

The directional target this WU takes its first step toward. The lifecycle splits into two layers, and the north
star claims exactly one:

- **Mechanics** (`git mv`, branch create/rename, scaffold, ROADMAP regen, collision detection, transition-legality
  validation) — pure rule-following. **→ CLI.** The agent should never reason about these.
- **Judgment** (the interlocks — *should* we activate? WU or errand? what's the cut-map? is the design
  spec-ready? merge approval; and the create-time commitment/priority calls) — inherently human/agent. **→ stays
  in the workflow.**

The seam: the CLI owns the mechanical transition + guard + validation; the workflow shrinks to the judgment that
decides whether/when to fire it. The CLI *executes* transitions; it never *decides* to take them — except where
the decision genuinely is deterministic (a name collision forces graduate-not-scaffold) — and it never
*fabricates* judgment values (commitment, priority): it requires them supplied. The explicit state machine
becomes the code-level single source both the CLI verbs and the (thinner) workflows derive from. This is why a
code-level transition table earns its keep by *design intent* even though today's surface is one edge: the north
star deliberately grows the code surface, and the table keeps that growth coherent rather than scattered.
Representation lean: hand-rolled declarative transition table, no `xstate`, no heavy lib.

## The resolved model

The four pillars — (1) the explicit state machine, (2) CLI migration of the start/relocation cluster, (3)
verb-semantics reconciliation, (4) the workflow-shell boundary — resolve into the design below.

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
| blocked                          | unmet `Depends On` edge (already a derived ROADMAP tier) |
| shipped                          | `location = completed`                                   |

The trigger for this was catching the **`Active` overload** — `phase = Active` was doing double duty as
"implementation underway" (a phase fact) *and* "on my plate / in-flight" (an engagement fact). That is the mirror
of the original `Planning` overload; splitting it is the same move. "Engagement" is *fully derivable* (suspended ⇒
`location = backlog`; awaiting-external ⇒ `phase = Integrating`; engaged ⇒ `location = active ∧ phase ∈ {Planning,
Active}`), so it is not an independent axis. The model also *forbids* the one case that would need one —
"suspended but still in `active/`" (the dormant-branch rot): the act of parking (moving location) is what makes
suspension legible.

Two consequences:

- **A Parked render bucket.** `ROADMAP` / `STATUS.USER` show parked WUs (visible, resolvable-by-name — park makes
  them *more* visible, not less), **excluded from the parallel-capacity math.** This is also why the term
  "in-flight" is itself overloaded — "exists and not shipped" (broad) vs. "consuming a slot now" (narrow,
  capacity view) — and disambiguating it is part of the verb/naming pass.
- **Keep the predicates queryable.** Exposed via the probe / a status query, not buried in ROADMAP rendering —
  a future goal-relative work-selection model consumes them (see Forward-compat threads).

### The verb set

Fully inverse-paired; every edge owned. The headline user-facing pair is **`start` ⊥ `park`**.

| Axis / role               | Verb                    | Move                                                        | Inverse            |
|---------------------------|-------------------------|-------------------------------------------------------------|--------------------|
| phase                     | `activate`              | `Planning → Active` (begin implementation)                  | `deactivate`       |
| phase                     | `deactivate`            | `Active → Planning` (undo activation; recoverable; narrow)  | `activate`         |
| location (active↔backlog) | `park`                  | `active → backlog` (phase-polymorphic)                      | `resume` / `start` |
| location (active↔backlog) | `resume`                | parked `backlog → active` (re-attach branch)                | `park`             |
| location (within backlog) | `promote`               | `provisional → planned`                                     | `demote`           |
| location (within backlog) | `demote`                | `planned → provisional`                                     | `promote`          |
| forward                   | `stub`                  | idea → `backlog` (commitment + priority **required**)       | `abandon`          |
| composite                 | `decompose`             | `Planning → cohort` (relocate parent + scaffold N children) | — (irreversible)   |
| terminal                  | `integrate` + `archive` | `Active`/`Integrating → completed`                          | — (no-go)          |
| destructive               | `abandon`               | any → deleted                                               | —                  |

- **`arc start <name>` is a full lifecycle-state dispatch** (not merely a collision guard), routing on the name's
  resolved state (via `operational-state-docs`' slug→state resolver): nonexistent → create-new (scaffold into
  active); provisional/planned → begin; **parked** → `resume` (re-attach branch); already active → error
  (occupied); shipped → offer a new WU with an origin-link; abandoned → reuse; integrating → route via the
  Integrating edges below. Totality means specifying all of these, not just the happy three. **Two guards, not
  one:** name-collision AND **worktree-occupancy** (one active WU per worktree — the live foot-gun that put two
  metas in `active/` and broke the release wrapper; distinct from single-owner's one-DRI-per-WU). This kills the
  draft's "resume semantics wrong for a never-activated stub" complaint and the `arc start` mis-scaffold foot-gun.
- **`scaffold` is the internal structure-generation mechanic** (the act `stub`, `start` create-new, `decompose`,
  and init Path B all invoke), already pervasive in the workflows. `stub` and `start` are the judgment-bearing
  front-door verbs that call it, differing by destination (backlog/later vs. active/now) and by eliciting the
  required fields. Maps to the north star: `scaffold` = mechanic; `stub`/`start` = front-door judgment.
- **Renames from today:** `graduate` → `promote` (frees the word, which is overloaded across two rungs today; adds
  the missing `demote` inverse). **`abandon` splits out of `deactivate`** — "undo an activation" (recoverable) and
  "throw it away" (destructive) are different intents and no longer share a verb.
- **`activate`/`deactivate` keep their names** (the verb matches the `State` value); `deactivate`'s old overload is
  fixed by the *model* (park@Active absorbs "shelve"), not a rename. Idiom-alignment stays a coordination seam
  (final register check with `idiomatic-alignment`), not a blocker.
- **`abandon` is phase/location-polymorphic, like `park`** — abandon-a-stub (rm the backlog dir, no branch),
  abandon-active-Planning (delete `plan/` branch + artifacts), abandon-active-Active (code present — the Case B
  shape), abandon-parked-Active (delete the preserved branch + its pointer-record), plus the **post-merge reversal**
  corners (activation/work already on base — a *PR-revert* mechanic, not a branch-delete; the `deactivate` Case C/D
  corners). One verb, several per-cell mechanics — the table carries each.

### CLI-migration depth — B1 + the transition table

The central fork, resolved at **B1**: ship a hand-rolled declarative transition table **as code** — states, legal
transitions, inverses, guard requirements, and the per-transition encoding-update spec — with a **thin imperative
executor**. Not B0 (doc-only table) and not B2 (a generic execution engine). Full start/relocation-cluster scope;
logical location. Three reasons, in priority order:

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
  `integrate`'s merge-approval, the create-time commitment/priority calls.
- **Axis 2 — within mechanics, the executor migration targets relocation-mechanics-that-are-*seams*** (duplicated /
  asymmetric / unowned across `backlog ↔ active`).

Applied:

- `activate` — clean, non-relocation phase-mechanic → in the table; executor deferred (no seam, no pain).
- `deactivate` — in the table, but a **semantic + totality seam** (below); executor needn't migrate (it's an
  in-place flip).
- `integrate` / `archive` — terminal, one-way, highest blast-radius, judgment-gated → in the table as terminal
  edges; executor a **no-go**.
- `decompose` — judgment (cut-map) stays in the workflow, but its `park-exit` **relocation sub-mechanic joins the
  shared primitive**. The case that proves the cut splits each transition's judgment-half from its relocation-half.

### `deactivate` is a semantic + totality seam

Its current mechanic is just an in-place flip (`Active → Planning`), so the executor needn't migrate. But it wears
a name inviting "pause an active WU," while the *actual* pause-active-to-backlog operation was an **empty cell**
(now filled by park@Active). It also **predates worktrees / parallelism**: Case A (return to Planning) was never
worktree-patched (only Case A-delete was), and the whole "no task work executed" gate reflects a pre-parallelism
world where setting aside an in-progress unit wasn't a pressing need. Resolution: `deactivate` stays narrow =
"undo a premature activation" (recoverable phase↓); shelving is park@Active; destructive teardown is `abandon`.
The model fix resolves the overload without a rename.

### The relocation primitive — a 1↔1 mutator bundle

Strictly **1↔1**. Best understood as a small bundle of phase-aware encoding-mutators:

- `relocate-artifacts` — the `git mv` of the WU's artifact set (location ↔ location).
- `reconcile-branch` — create / rename / delete / **preserve**, phase-and-direction-conditioned.
- `reconcile-worktree` — spawn / teardown, **including execution-locus relocation**: a transition that tears down
  the worktree it runs from (park@Active, abandon, decompose) must hop the agent's locus out first, or the cwd
  vanishes mid-operation. Same locus-relocation `run-errand` already does; the bundle owns (or demands) it rather
  than leaving it to each caller.

The bundle fires its mutators **together** so the three-encoding invariant (meta `State` · directory · branch)
holds *by construction* — you can never produce the half-updated `planned`-stub-with-`Branch:[none]` seam the
audit hunts for. Location-movers (`park` / `resume` / `promote` / `demote` / init-Path-A) call the full bundle;
phase-movers (`activate` / `deactivate`) call `reconcile-branch` + a `set-phase` write, *not* `relocate-artifacts`.

**Decompose's "1 → N" is not a fan-out relocation.** `decompose` = `relocate(parent, 1↔1)` + `scaffold × N`
(children are *seeded* from the parent's design, not `git mv`'d from it — you can't move one source into N
destinations). The fan-out lives in decompose's orchestration, never in the primitive. This delivers
three-encoding-consistency *as code* (the audit payoff) and stays inside B1: the mutators are imperative helpers;
the table stays legality/inverse/guard **data**. (Having the table declare *which mutators fire per transition*
would be B2 — not done.)

**Transition side-effects the bundle fires (mechanics the neighbors own).** Every location move re-renders ROADMAP
(`reconcile-roadmap`, calling `roadmap-tooling`'s renderer); `activate` discharges satisfied `Depends On` edges
(`operational-state-docs`' dep-edge lifecycle resolution); `park`/`resume`/`abandon` touch the WU's
`user/{identity}/<wu>/` SESSION-NOTES satellite (reconciled by session-init's retired-subdir sweep). The bundle
*fires* these; their *mechanics* are the named neighbors' — coordination seams, not re-implementations here.

### Shelve — `park` made phase-polymorphic + the pointer-record

Shelving an in-progress WU is a genuine need (parallel teams: "drop this, the P0 came in, back in three weeks") —
distinct from leaving the branch dormant (the orphan anti-pattern) and from Case B's integrate/abandon/successor
(which *close* the WU; shelving *suspends* it). It is modeled as **`park` made phase-polymorphic** — a pure
location decrement with **phase held at `Active`** (the work is real; resume drops back into execution, not
re-planning):

- **park@Planning** — no code; tear the branch down, re-cut `plan/<name>` on resume. (Today's spec.)
- **park@Active** — code exists; **preserve the branch** (pushed = the durable shelf), tear down only the worktree,
  relocate artifacts. Resume re-attaches the branch (≈ the existing Materialize mechanic).

This snaps onto the 2×2: `activate`/`deactivate` are the phase-axis verbs; `park`/`resume` the location-axis
verbs; each polymorphic over the other axis.

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
  preserves the `<type>/` branch and writes the pointer-record, `activate` rotates the prefix, `resume` re-attaches —
  identically under partial. The bundle never branches on protection mode.
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

We treat `integrate`/`archive` *internals* as no-go, but the phase has edges the table must still name:

- **`Active → Integrating`** (open PR, flip `State`) — owned by `integrate-work-unit`.
- **`Integrating → Active`** (withdraw from review / PR rejected → back to work) — a **genuinely missing inverse**;
  today `deactivate` refuses to rotate an `Integrating` meta ("close the PR first"), leaving this an unnamed cell.
- **`Integrating → park`/`abandon`** — route through `Integrating → Active` first (close PR), or direct? Specify.
- **Illegal cells, marked not ambiguous:** `location = backlog` × `phase = Integrating` (can't park a PR-open WU);
  and `completed` is a **sink** — no out-edges, "reopen" is a new WU with an origin-link.

## Forward-compat threads (coordination seams, not `Depends On`)

These compose *toward*; this WU never waits *on* them.

**The alignment posture (the spine).** This WU is the **first real CLI-orchestration WU**, and the ROADMAP shows it
sitting *upstream* of nearly all the substrate it would naturally consume: it is the only In-Flight WU;
`cli-substrate-adoption` and `roadmap-tooling` are Ready-but-unstarted; `operational-state-docs` and
`schema-introspection-layer` are Blocked on CSA. So the question is **not** "what to pull in early" (almost nothing
is ready, and pulling it in would import the WOR→CSA→OSD chain as a hard dependency this WU's P1 urgency can't
afford). It is four postures, applied per neighbor:

- **Design *toward*** (no hard dep): `arc-backend` / ADR-022 record+projection; storage-agnostic record shapes.
- **Hand-roll now, migrate later**: executor mechanics CSA will own (raw `git` + a minimal non-TTY guard now →
  execa / zod / neverthrow + the shared prompting substrate later).
- **Build v1 / re-home**: the slug→state resolver (this WU is first-need *and* lands first → it builds v1; OSD
  generalizes).
- **Decline** (other layers' concerns, captured so they aren't re-opened): frontmatter `type`, `index.md`/`log.md`,
  schema-introspection.

Per neighbor:

- **`cli-substrate-adoption` — downstream substrate, not an upstream blocker.** CSA's own draft defers
  "state-machine codification for WU lifecycle … until WOR + trio + AWL ship, to avoid codifying during churn" —
  and **WOR + the worktree/parallelism foundation have shipped, so that condition is now *satisfied***: proceeding
  now is consistent with CSA's guidance, not against it. Posture: hand-roll the thin executor's git + non-TTY
  mechanics now; CSA later migrates them to execa / zod / neverthrow + the shared prompting substrate. The `stub`
  required-fields **policy** stays ours (authored in `strategy-work-organization`); the non-TTY prompting
  **mechanic** migrates to CSA's substrate. CSA's eventual zod `State`-enum + meta schema are forward-compatible
  with the two-axis logical model (no collision).
- **`operational-state-docs` — the slug→state resolver flips consume→produce; dep-edge discharge defers.** The
  draft routes `arc start`'s dispatch "via OSD's slug→state resolver," but OSD is two hops downstream (Blocked on
  CSA) while this WU lands first and needs it. **This WU builds the minimal resolver** (resolve by *location*
  first — `completed/`/`active/`/`backlog/` presence — meta `State` second), and **OSD later generalizes it** (adds
  `parked-in-backlog`, dep-edge integration, managed-doc context). Record the flip on both sides. By contrast,
  **dep-edge lifecycle discharge stays OSD's** — it is not load-bearing for the foot-gun fixes, so `activate` notes
  the seam ("fires dep-edge discharge when OSD lands") and does *not* hand-roll it.
- **`roadmap-tooling` — this WU produces predicates + the Parked state; RT renders.** Boundary is already right (we
  emit derived-state predicates and keep them queryable; RT consumes). Interim caveat: `park` introduces a **Parked
  render bucket RT doesn't render yet**, so until RT ships, `reconcile-roadmap` rides the **hand-render discipline**
  (per WORKING-MEMORY) and that discipline must cover the Parked bucket. RT's "now/next/later is a render *mode*,
  not a curated doc" decision means our predicates feed its modes — see the goal-relative thread below.
- **`schema-introspection-layer` — nothing to do; pure publication.** Post-CSA `arc schema` surface; our `State`
  enum + transition table simply *become* introspectable when it ships. Load-bearing distinction it sharpens: our
  table is a **behavior contract** (who may transition where), a different concern from SIL's **I/O contracts** —
  so the transition table gets its **own home and does not wait on the (still-unresolved) schema-home convention**.
- **`composable-workflows` — the workflow-shell twin; the markdown-tier counterpart of our code-tier bundle.** Its
  resolve-then-load / thin-orchestration thesis is the other half of the north star: as transition mechanics move
  to the CLI, the remaining workflows are exactly the judgment + orchestration shells it wants. **Our mutator
  bundle is the code-tier worked example of a `public + fixed` shared procedure** (non-overridable *because*
  three-encoding consistency depends on identical behavior everywhere); the ceremonies' judgment halves are the
  markdown-tier private orchestration fragments it will own. A method-model refinement this surfaced (give the
  method model orthogonal *visibility* + *override-policy* axes; fragments = private methods; model fragments as
  method-shaped *pull*, not extension-shaped *push*) is **CW's design, not ours** — routed to its inbound buffer,
  with the bundle cited as the worked example. It also owns the cross-file anchor convention the rewrite leans on.
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
  pass (align with dominant idioms unless deviation is a genuine value-prop); the final register check coordinates
  with it. Its **frontmatter `type`** proposal has real merit as a *corpus-wide* machine-legible classification, but
  it is the **wrong layer for this WU**: we relocate a *known* artifact set keyed by **prefix+slug** and never query
  the corpus by type, and the machine-legibility we need is the logical `(phase, location)` record we already model.
  Declined here; owned by IA. (The authoritative record-world machine-classification is OSD/ADR-022's write-path
  subtype + `structural_contract`, not a frontmatter `type` field.) **`index.md`/`log.md` declined too**: an index
  is redundant (prefix+slug glob / probe `companions` already enumerate the artifact set the bundle moves); a per-WU
  log cuts against ADR-022's "no separate status/completion doc — that content is `meta-*` fields," and transition
  auditing (if ever wanted) rides the existing audit-log substrate, not per-WU markdown. IA already rejected the
  rename.
- **Goal-relative work selection — consumes the derived-state predicates.** A future "direction layer" / next-work
  recommender (captured this session, `WU_Target: TBD`; it reopens `roadmap-tooling`'s "Direction's home" lean)
  reads the parked / in-flight / on-my-plate predicates this WU produces, plus the dependency graph. The obligation
  here is only to **keep those predicates queryable** (exposed via probe / status), not buried in rendering.
- **`single-owner-wu-model` — owner-count-agnostic orthogonality.** A `concurrent-work-conventions` cohort member
  (`Depends On: concurrent-work-doctrine`) that sets the WU *ownership* model (one DRI) — a different axis from the
  state machine. **Not absorbed:** the lifecycle is owner-count-agnostic by construction (states/transitions don't
  depend on DRI count), so no accommodation is needed. Seams only — both edit DEV-RULES.ARC in *different* sections
  (sequence, don't co-edit); our primitive carries `**Owner:**` opaquely while single-owner *defines* it; the
  self/foreign overlap asymmetry rides our activation / entry-gate preflight but its semantics are
  doctrine's; `decompose`'s `scaffold×N` sets each member's owner.

## Absorbed from `park-resume-lifecycle`

Carried forward (the stub retired at the prior draft pass, absorb-then-retire) and now **resolved into the model
above**:

- **Park** (`Planning`/`Active` → `backlog/{state}/<wu>/`) — PR + merge to main; artifacts land in the per-WU
  backlog subdir; branch + worktree handling follows the phase-polymorphic rule (delete at Planning, preserve at
  Active). `State` is held (phase-axis untouched); commitment lives in `provisional/` vs `planned/` (picked at park
  time). Park makes parked WUs *more* visible, not less.
- **Resume** (`backlog` → active) — re-spawn worktree, reconcile branch, `relocate-artifacts` back. Its mechanical
  half *is* `init-work-unit` Path A — now the shared 1↔1 bundle, never re-authored.
- **DRY constraint** — resume reuses init Path A; park reuses `decompose-work-unit`'s `park-exit` block. Both now
  collapse into the one shared relocation mutator bundle (pillar 2).
- **Class-aware applicability** — park/resume is the dominant flow for `Heavy`/`Novel` planning that pauses for
  weeks; errands skip it; `Light` rarely parks.
- **Open (inherited), now mostly resolved:** life-phase-agnostic init — the mutator bundle is phase-aware;
  init/`arc-plan`/`arc start` entry-point ownership — `arc start` is the universal front door.

## Open design questions

The load-bearing forks are resolved above (CLI-migration depth → B1; phase ⊥ location → two logical axes + derived
predicates; the verb set; the 1↔1 relocation primitive; park@Active pointer-record; the `stub` contract; the
planning-entry write-context gate). What remains:

- **Totality items to spec** (named in the model above; mechanics to settle): the `Integrating → Active` reopen
  inverse and the Integrating→park/abandon routing; `abandon`'s per-cell mechanics incl. the post-merge reversal
  (PR-revert) corners; `start`'s full eight-state dispatch + the worktree-occupancy guard; execution-locus
  relocation in the worktree mutator.
- **`graduation-cleanup` boundary (TBD — "wait and see").** Member, dependency, or left separate; history-hygiene
  that composes with park.
- **Final transition-table representation + guard placement.** Settled in principle (legality / inverse / guard data
  plus the encoding-update spec; guards in the mutator bundle / table-validated); concrete shape firms at spec.
- **Ship shape.** Hold as one coherent draft now; let `create-spec` decide whether it decomposes into a stack as the
  deliverable cuts firm up. Avoid re-shattering what we are consolidating.

## Completeness audit — finding the rest of the seams

> Planning-phase method (run at the draft → spec gate), not now. Captured so the work doesn't ship only to have a
> missed seam surface a week later.

The explicit state machine is its own audit instrument: seams kept surprising us because the lifecycle was
*implicit*, with no complete model to check against. Now that the model exists, most seams are empty, ambiguous, or
inconsistent *cells* — found by sweep, not by luck. The audit is a validation pass over the model, and with the B1
code-level table the static invariants become a **shippable mechanical guard/test**, not just a one-time check.

**Static model sweeps** (cheap once the model is drafted):

- **Totality matrix.** Every `state × verb` cell: defined? legal? owned (CLI / workflow)? guarded? named inverse?
- **Inverse symmetry.** Walk edges in pairs: `activate ↔ deactivate`; `park ↔ resume`; `promote ↔ demote`;
  `stub ↔ abandon`.
- **Three-encoding consistency.** State is triple-encoded — meta `State`, directory, branch prefix. For every state
  the three must agree, and every transition must update all three (the mutator bundle enforces this by
  construction; the parked-Active pointer-record is a *blessed* shape the sweep expects).
- **Deterministic-but-prose sweep (the north-star filter).** Classify each transition: deterministic mechanic, in
  code or prose? Every deterministic-but-prose-only gate is a north-star gap (the planning-entry gate).
- **Negative space / guards.** Per transition, precondition-violation behavior: guarded-and-loud, or silently-wrong
  (the `arc start` foot-gun)? Unguarded bad input is a seam.

**Behavioral sweeps** (catch what statics miss):

- **Workflow-trace reconciliation.** Map each lifecycle workflow step-by-step onto the model's edges; divergences
  are seams.
- **Scenario catalog (dogfooding).** Drive the real journeys — start-a-planned-stub, pivot-mid-planning, park
  (Planning and Active), cross-machine resume, decompose, abandon — each through the model.
- **Cross-mode matrix.** Run the sweeps × {full, partial protection} × {primary, linked worktree} × cross-machine.

**The durable payoff — ship it, don't just audit it.** Turn the totality + encoding-consistency invariants into a
mechanical guard / test shipped as a deliverable, so (a) a seam we *miss* fails loud (rejected transition) instead
of silently corrupting, and (b) new seams can't be introduced. `finalize-parallelism`'s end-to-end trace is the
final backstop — this audit shrinks what it discovers reactively.

## No-gos

- Planning-pipeline *content* — owned by `planning-pipeline-readiness`.
- Managed-doc storage layer — owned by `operational-state-docs`.
- `integrate` / `archive` internals — solid; not in scope.
- Full CLI-migration of *every* transition — this WU takes the bounded start/relocation slice; the rest migrates
  over time as `composable-workflows` thins the workflows.

## Scope Estimate

Large (week+), `Novel`. With CLI-migration depth settled at B1, the surface firms: a logical state model + a
code-level declarative transition table, CLI verbs + guards (name-collision + worktree-occupancy), the shared 1↔1
relocation mutator bundle (with execution-locus relocation and the ROADMAP / dep-edge / user-state side-effects),
the park@Active pointer-record, the `stub` required-fields contract, the planning-entry write-context gate (reusing
`resolveWriteContext`) + the adopt-draft edge, protection-mode (full/partial) shaping across the verb set, and the
verb-rename cascade (`graduate → promote`, `abandon` split, `start` dispatch) + reconciliation of load-bearing docs
(`strategy-work-organization`, the lifecycle workflows, DEV-RULES.ARC) + verb naming.

### Dependencies

- **Hard:** none. Everything it builds on has shipped (`arc start`, `decompose-work-unit`'s `park-exit` block).
- **Coordination (forward-compat):** `cli-substrate-adoption` (downstream substrate — hand-roll now, migrate
  later), `operational-state-docs` (slug→state resolver: build v1, OSD generalizes; dep-edge discharge defers to
  OSD), `roadmap-tooling` (we produce predicates + Parked state, RT renders), `schema-introspection-layer` (pure
  publication; nothing to do), `composable-workflows`, `arc-backend` / `strategy-storage-evolution.md`,
  `idiomatic-alignment`, and the goal-relative work-selection capture. See § Forward-compat threads for the per-
  neighbor posture.
- **Downstream:** de-risks `finalize-parallelism` and should sequence before it — propose adding
  `lifecycle-state-machine` to that WU's `Depends On` (an edit to its meta, flagged not yet made).

---

## Continuity

- **Readiness state:** maturing — scope is known and the load-bearing forks are settled (CLI-migration depth →
  B1; phase ⊥ location → two logical axes + derived predicates; the full inverse-paired verb set; the 1↔1
  relocation mutator bundle; park@Active pointer-record; the `stub` required-fields contract; protection-mode
  shaping = ship-layer + pre-WU boundary, mutator bundle invariant). The remaining open items are detail-design,
  deferred-to-`create-spec`, or wait-and-see — not fundamentals.
- **Resolved (this session):** CLI-migration depth = **B1** (logical code table + thin executor) + full-cluster
  scope + logical location; the exclusions principle (2D cut; "excluded" = executor-not-migrated, model total);
  `deactivate` is a semantic+totality seam (stays narrow); **shelve = `park` made phase-polymorphic** with the
  **pointer-record** for park@Active (shipping, not deferred); **two axes suffice** — engagement is a derived
  predicate, with a Parked render bucket and queryable predicates; the **relocation primitive = 1↔1 mutator
  bundle**, decompose composes `relocate + scaffold×N`; the **full verb set** (`start` ⊥ `park` headline;
  `scaffold` = internal mechanic, `stub` = user verb; `graduate → promote` + `demote`; `abandon` split from
  `deactivate`); the **`stub` required-fields contract**. Discovered work routed: goal-relative work selection
  captured (new model / reopens `roadmap-tooling` "Direction's home"); render-overflow → `roadmap-tooling`;
  deps-representation already owned by `operational-state-docs`; CSA stub-contract breadcrumb filed.
- **Resolved (this session, second pass):** the **planning-entry write-context gate** (resolveWriteContext-for-
  planning + routing table + the adopt-draft edge; CLI mechanic + `arc-plan` judgment; boundary drawn against
  `out-of-wu-entry` / `composable-workflows` / `maintenance-errand-class` / `planning-pipeline-readiness`); a
  completeness pass surfacing **partial protection** (branch-axis collapse — now a first-class open), the
  `Integrating` phase edges (incl. the missing `Integrating → Active` reopen), `abandon` polymorphism + post-merge
  reversal corners, `start` full eight-state dispatch + worktree-occupancy guard, execution-locus relocation, and
  the bundle's ROADMAP / dep-edge / user-state side-effects; `single-owner-wu-model` assessed → coordination seam,
  not absorbed (owner-count-agnostic by construction).
- **Resolved (protection-mode pass):** protection mode is a property of the **ship layer**, not the transition
  mechanics — the relocation mutator bundle is **mode-invariant for every tracked-WU transition** (a tracked WU owns
  its single branch in both modes; "main carries no in-flight WU artifacts" holds in both). Partial relaxes exactly
  two surfaces: the **pre-WU drafting boundary** (base under partial, `plan/<name>` under full — owned by the
  planning-entry gate's route-1) and the **ship mechanism** for non-WU grooming (`stub`/`promote`/`demote`/errands →
  direct base commits vs branch + PR). Partial is the **floor** (`{full, partial}` only; unknown values degrade to
  partial; config-validation tightening filed as a breadcrumb). Corrected the prior draft's branch-axis-collapse
  framing: park@Planning still deletes the `plan/` branch and park@Active still preserves its branch + pointer-record
  under partial; the "incomplete code on base" tension evaporates.
- **Resolved (forward-compat alignment pass):** confirmed the **alignment posture** — this WU sits *upstream* of its
  substrate (only In-Flight WU; CSA/RT Ready-unstarted; OSD/SIL Blocked on CSA), so: design *toward* arc-backend/
  ADR-022 (record+projection, storage-agnostic, **no `git branch`/`log` state inference** in the resolver or
  occupancy guard); **hand-roll now, migrate later** the executor mechanics CSA owns (raw git + minimal non-TTY
  guard → execa/zod/neverthrow + shared prompting substrate); **build v1 of the slug→state resolver** that OSD later
  generalizes (consume→produce flip; dep-edge discharge stays OSD's — `activate` notes the seam, doesn't hand-roll);
  **decline** frontmatter `type` (wrong layer — IA owns), `index.md`/`log.md` (redundant / against ADR-022), and
  schema-introspection (pure publication). CSA's "defer the state machine until WOR settles" condition is now
  *satisfied* (WOR + worktree foundation shipped) — proceeding is consistent with CSA's guidance. RT interim caveat:
  the Parked render bucket rides the hand-render discipline until RT ships. Surfaced a method-model refinement
  (visibility + override-policy axes; fragments = private methods; pull-not-push) — **routed to `composable-workflows`'
  inbound buffer** (its design, not ours); our mutator bundle is the code-tier `public+fixed` worked example.
- **Open:** the totality items to spec (Integrating reopen, abandon per-cell, `start` dispatch, occupancy guard,
  locus relocation); `graduation-cleanup` boundary (wait-and-see); final transition-table representation + guard
  placement; ship shape (→ `create-spec`).
- **Next:** the substantive design is settled; run the completeness audit (the user has further input to bring in
  first), then consolidate toward formalization-ready.
