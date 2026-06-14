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

The evidence spine. States: `provisional` → `planned` (in `backlog/`) → `Planning` → `Active` → `Integrating`
(in `active/`) → `completed`; plus `abandoned`.

| Transition | Owner (CLI / workflow) | Inverse | Seam |
| --- | --- | --- | --- |
| idea → `provisional` | **none codified** (manual mkdir + template) | (delete) | No create-stub path; unowned |
| `provisional` → `planned` | `graduate-work-unit` (WF) | **unowned** (demote) | "graduate" is *only* this rung; confusable with the next |
| `planned` → `Planning`(active) | `init-work-unit` Path A (WF) | `park` (unshipped) | **Not CLI-wired**; `arc start` mis-scaffolds here |
| fresh → `Planning`(active) | `arc start` create-new / `init` Path B (**CLI**) | `deactivate` A-delete | the **only** code-driven transition |
| `Planning`(active) → `backlog` | `park` (**unshipped**); `decompose` does a park-shaped variant | `resume` / init Path A | park unshipped; decompose factored a reusable `park-exit` block for it |
| `backlog` → `Planning`(active) | `resume` (**unshipped**) = init Path A | `park` | conflated with init Path A; "resume" semantics wrong for a never-activated stub |
| `Planning`(active) → cohort | `decompose-work-unit` (WF) | irreversible | shares teardown mechanics with park |
| `Planning` → `Active` | `activate-work-unit` (WF) | `deactivate-work-unit` (WF) | the one clean inverse pair |
| `Active` → `Planning` | `deactivate` Case A (WF) | `activate` | clean |
| `Active`/`Integrating` → `completed` | `integrate` + `archive` (WF) | — | solid (no-go) |
| any active → `abandoned` | `deactivate` A-delete / Case B | — | overlaps park/teardown mechanics |

## Organizing frame: phase ⊥ location

ARC currently smears two orthogonal axes onto the single `Planning` value, which is the root of the
park/resume/init-Path-A tangle:

- **Lifecycle phase** — `Planning` / `Active` / `Integrating` / `Shipped`. This *is* the meta `State` field
  (already a strict 4-value machine per `template-meta`).
- **Commitment location** — `provisional` / `planned` / `active` / `completed`. This is the directory the
  artifacts live in.

A `planned/` backlog stub and a WU on a `plan/` branch are *both* phase `Planning`; the meta `State` alone does
not say where the WU lives — phase + location together do. Making the two axes explicit is the model's spine. It
is also the `arc-backend`-safe move: phase becomes a logical field, location becomes a projection (see Forward-
compat threads). **Open: how this manifests** — whether location becomes a first-class field, stays
directory-derived, or is computed — is design work, not yet settled.

## Design pillars

1. **The explicit state machine.** Logical states + transitions + inverses, built on phase ⊥ location, state
   modeled as a record (not smeared across filename + branch + directory), resolving the `Planning`-overload and
   filling the unowned edges (create-stub, demote).
2. **CLI migration of the start/relocation cluster.** `arc start` graduation-routing + collision guard; `park` /
   `resume` as real verbs; one shared relocation primitive unifying `init-work-unit` Path A and
   `decompose-work-unit`'s `park-exit` block. The *first* bounded step toward the north star — not the whole
   migration.
3. **Verb-semantics reconciliation.** Idiom-aligned naming for the transition verbs (coordinated with
   `idiomatic-alignment`), so the verbs match developer intuition (`start` = "begin work on this," the way
   `git checkout` / `gh issue develop` read).
4. **The workflow-shell boundary.** What stays judgment-in-workflow vs. moves to a CLI primitive (co-designed
   with `composable-workflows`).

## North star: deterministic mechanics in the CLI

The directional target this WU takes its first step toward. The lifecycle splits into two layers, and the north
star claims exactly one:

- **Mechanics** (`git mv`, branch create/rename, scaffold, ROADMAP regen, collision detection, transition-legality
  validation) — pure rule-following. **→ CLI.** The agent should never reason about these.
- **Judgment** (the interlocks — *should* we activate? WU or errand? what's the cut-map? is the design
  spec-ready? merge approval) — inherently human/agent. **→ stays in the workflow.**

The seam: the CLI owns the mechanical transition + guard + validation; the workflow shrinks to the judgment that
decides whether/when to fire it. The CLI *executes* transitions; it never *decides* to take them — except where
the decision genuinely is deterministic (a name collision forces graduate-not-scaffold). The explicit state
machine becomes the code-level single source both the CLI verbs and the (thinner) workflows derive from. This is
why a code-level transition table earns its keep by *design intent* even though today's surface is one edge: the
north star deliberately grows the code surface, and the table keeps that growth coherent rather than scattered.
Representation lean: hand-rolled declarative transition table, no `xstate`, no heavy lib.

## Forward-compat threads (coordination seams, not `Depends On`)

These compose *toward*; this WU never waits *on* them.

- **`composable-workflows` — the workflow-shell twin.** Its resolve-then-load / thin-orchestration thesis is the
  other half of the north star: as transition mechanics move to the CLI, the remaining workflows are exactly the
  judgment + orchestration shells it wants (its `generate-tasks` D-shape — "depth paths as spine, procedures as a
  referenced library" — is the template). **This WU's code-level transition primitives *are* the procedure
  library `composable-workflows` orchestrates.** Real overlap risk (both touch "what stays in the workflow vs.
  gets extracted/coded") — coordinate the boundary; it also owns the cross-file anchor convention the lifecycle
  rewrite will lean on.
- **`arc-backend` — the deepest constraint (forward-compat, non-negotiable).** It makes `meta`/`tasks`/`status` a
  materialized *projection of records* (ADR-022, Architecture B) in a separate git backing store. So the state
  machine must model WU state as a **logical record**, with the physical encoding (directory, branch) as a
  projection/mechanic — never bake "state = tracked-file-location + branch-prefix" in, which is precisely the
  tracked-`.arc/` assumption arc-backend's blast-radius audit warns interim WUs to stop accreting. Self-check
  against `strategy-storage-evolution.md`. (Good design independent of the backend — it is what makes the state
  model clean.)
- **`idiomatic-alignment` — names the verbs.** Its scope *excludes* renaming ARC's load-bearing internal
  vocabulary, but the transition verbs are exactly what we reconcile, and its register applies: align with
  dominant developer idioms unless the deviation is a genuine value-prop. The verb-naming pass is an explicit
  idiom-alignment pass, coordinated with it.

## Absorbed from `park-resume-lifecycle`

Carried forward (the stub retires at this draft's capture, absorb-then-retire):

- **Park** (`Planning` → `backlog/{state}/<wu>/`) — PR + merge to main; draft + meta land in the per-WU backlog
  subdir; branch + worktree cleanup follows. `State` stays `Planning`; `Branch` clears to `[none]`. Commitment
  level lives in `provisional/` vs `planned/` (user picks at park time). Park makes parked WUs *more* visible, not
  less (ROADMAP picks them up; resolvable by name) — indefinite orphan worktrees + branches are the wrong default.
- **Resume** (`backlog` → `Planning`) — spawn worktree, cut `plan/<wu>`, `git mv backlog/{state}/<wu>/* active/`,
  reconcile `Branch`. Its mechanical half *is* `init-work-unit` Path A — reuse, never re-author.
- **DRY constraint** — resume reuses init Path A; park reuses `decompose-work-unit`'s `park-exit` block. The
  unification of these into one shared relocation primitive is pillar 2's work.
- **Class-aware applicability** — park/resume is the dominant flow for `Heavy`/`Novel` planning that pauses for
  weeks; errands skip it; `Light` rarely parks.
- **Open (inherited):** life-phase-agnostic init (`init-work-unit` hardcodes `plan/` + `Planning`); the
  init/`arc-plan`/`arc start` entry-point ownership question.

## Open design questions

- **CLI-migration depth (central).** Which transitions does *this* WU move into code vs. leave as workflow
  judgment? Decides whether the transition table ships as code (single source for CLI routing + guards) or stays a
  documented table. Resolved during the high-path shaping loop, not pre-committed.
- **How phase ⊥ location manifests.** First-class location field, directory-derived, or computed.
- **Transition-table representation + guard placement.** Shape of the declarative table; where legality guards
  live (CLI vs. shared lib vs. workflow precondition).
- **Verb naming specifics.** The idiom-aligned names for the reconciled verb set.
- **Relocation-primitive unification.** The shared `git mv` + worktree primitive's interface, and how init Path A
  / decompose `park-exit` / park / resume call it.
- **Planning-entry write-context gate.** A mechanical preflight in `arc-plan` that resolves write-context and
  routes (→ `init-work-unit` start-directly, → errand/stub defer) before `draft-design`, replacing the prose-only
  rule — including the pre-authored-draft third case. Where it lives (CLI vs. workflow) tracks the CLI-migration
  depth question.
- **`graduation-cleanup` boundary (TBD — "wait and see").** Member, dependency, or left separate; it is
  history-hygiene that composes with park.
- **Ship shape.** Hold as one coherent draft now (per the maturity gate); let `create-spec` decide whether it
  decomposes into a stack as the deliverable cuts firm up. Avoid re-shattering what we are consolidating.

## No-gos

- Planning-pipeline *content* — owned by `planning-pipeline-readiness`.
- Managed-doc storage layer — owned by `operational-state-docs`.
- `integrate` / `archive` internals — solid; not in scope.
- Full CLI-migration of *every* transition — this WU takes the bounded start/relocation slice; the rest migrates
  over time as `composable-workflows` thins the workflows.

## Scope Estimate

Large (week+), `Novel`. Cross-cutting: an explicit state model, CLI verbs + guards (possibly a code-level
transition table), a shared relocation primitive, and reconciliation of load-bearing docs (`strategy-work-
organization`, the lifecycle workflows, DEV-RULES.ARC) + verb naming. Size firms up once the CLI-migration depth
is settled.

### Dependencies

- **Hard:** none. Everything it builds on has shipped (`arc start`, `decompose-work-unit`'s `park-exit` block).
- **Coordination (forward-compat):** `composable-workflows`, `arc-backend` / `strategy-storage-evolution.md`,
  `idiomatic-alignment`.
- **Downstream:** de-risks `finalize-parallelism` and should sequence before it — propose adding
  `lifecycle-state-machine` to that WU's `Depends On` (an edit to its meta, flagged not yet made).

---

## Continuity

- **Readiness state:** rough — thesis, inventory, pillars, and forward-compat constraints are settled; the
  load-bearing CLI-migration-depth fork is open, so the design direction is not yet locked.
- **Resolved:** name, `Class: Novel`, `P1`, standalone (`Cohort: [none]`), no hard deps; supersedes
  `park-resume-lifecycle` (absorb-then-retire); the three adjacent drafts are coordination seams, not deps; the
  phase ⊥ location organizing frame; the north star (deterministic mechanics → CLI; judgment stays in workflow);
  no-gos.
- **Open:** the seven open design questions above — chief among them CLI-migration depth.
- **Next:** iterative shaping loop — start from the CLI-migration-depth fork (it gates the others), then the
  state-model representation and the verb-naming pass.
