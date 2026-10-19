# Draft: work-item-relations — typed relations between work items

- **Origin:** [internal] — the storage program's sequencing survey, 2026-10-15: five read-only passes over the
  in-flight storage members' metas, specs, task lists, and session notes, then the Owner's discussion of the dependency
  model, lifecycle activity, throughput, and the cohort document's role; minted planned, P1, the same day.
- **Purpose:** Record how work items relate — which of a work item's gates each dependency holds and why, and the
  orderings and shared contracts a cohort coordinates — once, as typed data, so ARC can say when a work item may start,
  pass a task, or land, and every other surface renders those facts rather than restating them.

---

## Continuity

- **Readiness:** maturing. The gate model, task-level waits, enforcement, the sorting of soft orderings, and the
  cohort's coordination entries are settled in shape; the open items are detail design and the record format.
- **Timing:** `Depends On: storage-cutover`. Edges and cohort entries live in the meta and cohort record kinds, whose
  final shapes and format version reconcile only after the storage seam, and enforcing a gate edits the lifecycle
  write path, which never runs alongside the seam. Until then an edge recorded during planning lives on the plan
  branch: base's copy of `storage-ref-backend`'s meta reads `Depends On: [none]` while its branch records two edges.
  Grooming continues before the cutover (Owner, 2026-10-15): the general shape and the design-level seams other work
  units can build toward.
- **Settled at the 2026-10-15 grooming:** D1–D5 (§ Decisions) and the cohort's coordination half (§ Cohort
  coordination).
- **Open:** § Open questions.
- **Next:** after `storage-cutover` lands, re-enter draft-design: re-derive the record format against the meta and
  cohort kinds as shipped, settle the cohort-endpoint question with `seam-decomposition`'s redistribution rules, and
  run the boundary read for a delivery-plan cut (§ Scope).

## Problem / Motivation

`Depends On` is already structured: a typed list of slugs with a write check (`lib/store/kinds/meta/projection.ts`,
`lib/store/kinds/meta/reference-rules.ts`). What it records is only the target. It cannot say which of the dependent's
gates the dependency holds, why, or how strongly, so those facts live in specs, cohort documents, session notes, and
commit bodies, where they drift.

Sequencing the storage program on 2026-10-15 took five research passes to answer "what can start now," and surfaced:

1. **Restated edges drifted.** `cohort-state-storage.md` still said `storage-ref-backend` implements after
   `seam-record-kinds`, after that edge was discharged and two others recorded; an Errand corrected it (PR #1014).
2. **An edge's reason lives only in prose.** `storage-ref-backend`'s `seam-locus` edge exists because its import
   writes the Errand record's `owner` field; that reason is in a commit body (`4b2b85ba7`) and its spec.
3. **Metas and specs disagree.** `seam-locus` records no edge, though its spec lands it after `seam-lifecycle`;
   `storage-projection`'s meta names two providers where its spec names three.
4. **Waits finer than a work item have no record.** `seam-locus`'s Tasks 1.1–1.4 need nothing from `seam-lifecycle`
   and Task 1.5 does; `storage-ref-backend`'s `seam-locus` edge holds only its landing, through one late task.
   `storage-projection`'s first approved start rule named per-phase waits and was superseded the same day, because a
   task loop runs in order.
5. **An activated work unit idle on a dependency looks the same as one progressing.** `seam-locus` was Active with its
   implementation waiting on `seam-lifecycle`.
6. **Edges gate nothing mechanically.** Activation discharges satisfied edges and checks no live one
   (`activate-work-unit.md` Step 1; `lib/work-unit/side-effects/discharge-dep-edges.ts`); `arc status <slug>` only
   reports them.
7. **One kind of edge serves every purpose.** Design, implementation, and landing dependencies share one field, and a
   soft ordering — a chosen sequence, a design order — has no record that keeps it from becoming a false edge.
8. **A cohort document restates relations it cannot record.** The CLI reads only a cohort document's purpose and
   parent (`ParsedCohortDocumentSchema`); its stage diagram, members' Exposes and Consumes, and Cross-cohort lines
   marked "(an edge)" are prose, which is how item 1 drifted. A cohort-level edge has no record at all:
   `cohort-state-storage.md` says `cli-substrate-complete-migration` "must land before `storage-seam` starts", and no
   member's meta ever carried it.
9. **A shared contract had no owner.** The `.git` reader shared by `storage-projection` and `storage-ref-backend` was
   to be owned by "whichever change builds it first". That is not a dependency; it is a contract with consumers and
   no single owner.

## Concerns and owners

- **The relations' shape** — items 2–4, 6, 7, and the records items 8 and 9 lack — is this work unit's.
- **Restatement** — items 1 and 8 — is this work unit's consequence. One mutable fact keeps one authority
  (`strategy-pm-composition-evolution.md`, Principle 1): once relations are typed, coordination documents and status
  surfaces render them rather than restating them.
- **Activity** — item 5, and the conflation of Planning and Active — is not this work unit's. `wu-lifecycle-state-model`
  owns the readiness and scheduling axes, and `seam-lifecycle`'s pause, from the flip, records what a paused work unit
  waits on (`waitsOn`). "Blocked" need not be stored at all: it is an unmet edge at the work item's current gate.
- **A cohort document's design half** — its group-level rationale, scope, unknowns, and constraints, the amendments
  accreting in them, a program register and its closeout, and whether a theme-only grouping needs a document at all
  — is not this work unit's. It is captured for routing with no home yet (`USER-INBOX § Work Unit`).

## Decisions

Settled with the Owner, 2026-10-15. The record format is not: it waits for the seam (§ Open questions).

### D1 — An edge holds one of the dependent's gates

- An edge names its provider, the dependent's gate it holds, and its reason:
    - `design` — the dependent's spec is not approved before the provider's is.
    - `start` — the dependent's first task waits for the provider to land.
    - `task` — a later task waits for the provider to land; the dependent's task list names which (D2).
    - `land` — the dependent does not land before the provider.
- An unqualified edge reads `start`, today's meaning.
- **The provider's side collapses.** While each work unit lands single-branch, a dependent can consume only what its
  provider has made durable: an approved spec for `design`, a landed change for the rest, never an unlanded task. Only
  the dependent's gate varies, which keeps the model an attribute of the edge rather than a scheduling engine.
- **Idiom.** Precedence links from project scheduling: finish-to-start (`start`, `task`, and `design` against the
  provider's approved spec) and finish-to-finish (`land`). Start-to-start links and lags do not fit single-branch
  landing. Jira, Linear, and GitHub's issue dependencies type their links the same way, splitting blocking from
  related.
- **Applied to the storage program:** `seam-locus` holds `seam-lifecycle (task)`; `storage-ref-backend` holds
  `seam-lifecycle (start)` and `seam-locus (land)`; `storage-projection`'s first start rule would have been
  `seam-lifecycle (start)` with `task` edges on `seam-locus` and `storage-ref-backend`.

### D2 — Which tasks wait lives in the task list

- The edge stays at work-unit granularity. Which tasks wait is an annotation in the dependent's task list that the task
  cursor reads; edges carry no task IDs, which go stale when a task list is renumbered.
- The `task` gate shows at work-unit level whether such waits exist and on whom, without parsing the task list, and
  without a stored flag that would copy what the task list says.
- The CLI checks both directions: each annotation's provider has a `start` or `task` edge, and each `task` edge has at
  least one annotation.
- The cursor stops at the first waiting task, so task generation places independent work ahead of it. That answers
  why the per-phase start rule in item 4 was superseded: the loop runs in order, and with readable waits the order
  carries the plan.
- The annotation's grammar is `task-list-conventions`' (§ Dependencies / Coordination).

### D3 — Enforcement scales with the cost of an early crossing

- `design` — advisory at spec approval: crossing early risks rework.
- `start` and `task` — a typed stop naming the edge, with an Owner override: crossing early risks wasted effort.
- `land` — a refusal at the integration checkpoint: crossing early can break base.
- Each gate is enforced at the ceremony that owns its boundary, from recorded state. Today's edges stop nothing
  (item 6), and a blanket refusal at every gate would be the disproportionate opposite.

### D4 — Soft orderings are sorted by kind, never recorded as edges

- **A real need is an edge.** Edges live on the shared meta record, so they are visible to the team by construction;
  most cross-owner orderings turn out to be needs.
- **A group's plan is a cohort ordering** (§ Cohort coordination) — the storage seam's design order is one. It is the
  record of that plan, not a restatement of it.
- **Contention is an exclusion** (D5): work units that must not run at once because they rewrite the same files.
- **Personal sequencing is an intent** in `goal-aware-direction`'s `VECTOR.USER`. `VECTOR.PROJECT` holds outcomes,
  not sequences, and keeps no orderings.
- **Authority.** An edge on a work unit's meta is its owner's to set. A provider cannot impose an ordering on another
  owner's work, so a cross-owner ordering is an agreement the dependent's owner records.
- A chosen order never becomes an edge.

### D5 — Exclusions are deferred

"Never alongside" constraints are concurrency, not precedence. Recording them is deferred: the evidence is real, but a
second relation kind is not yet earned. The question is shared with `goal-aware-direction`, whose recommender lists
exclusions as an open input, data or judgment. Revisit when two owners' work units contend for the same files.

## Cohort coordination

A cohort document keeps its role as the group's identity and shared design record. Its coordination half — the part
that changes when an edge or gate changes — becomes typed entries this work unit defines, and its views of member
relations are rendered.

- **Rendered, not authored:** the stage diagram, each member's Exposes and Consumes, and Cross-cohort edges, from
  edges, orderings, and the contract entries below.
- **Orderings:** a group's plan over its members (D4), recorded once, here.
- **Shared contracts:** each with exactly one owning member, its consuming members, and a pointer to where its design
  lives. The CLI checks single ownership (item 9). The idiom is an interface control document's owner and consumer
  register; consumer-driven contract testing's deployment check is the same question a `land` gate asks of a contract.
- **Exclusions:** typed here once D5 admits them.
- **Membership** stays derived from each member's `Cohort` field. A theme-only cohort carries no entries and changes
  nothing.
- Policies, rationale, and the cohort's design prose stay prose: no observed failure argues for typing them.

## Open questions

1. **Can a cohort be an edge's endpoint?** Or is a cohort-level edge shorthand for an edge on each member, which
   `seam-decomposition` already redistributes at a cut? Item 8's edge is the case. The answer shapes rendering and the
   cut's redistribution rules.
2. **Exclusions** (D5), with `goal-aware-direction`.
3. **The record format** of gated edges, reasons, task annotations, and cohort entries, against the meta and cohort
   kinds `seam-record-kinds` shipped, as the seam leaves them.
4. **Where an Owner's override of a `start` or `task` stop is recorded,** and whether it outlives the session.
5. **A tracker as the source of truth.** Where a tracker already holds blocking relations, ARC reads them through a
   source boundary, as `goal-aware-direction` does for goals; `external-pm-composition` owns the mapping.
6. **Errands as dependents.** An Errand can wait on a work unit; the Errand record could carry edges after the cutover.

## Throughput

Gate-qualified edges let a dependent start before its provider lands wherever only a later task or landing is held, and
give the critical path its input. The throughput outcome itself spans other homes: `goal-aware-direction`'s capacity
mode (feed the constraint, work with float, or start nothing new), `wu-lifecycle-state-model`'s pool of
implementation-ready work, stacked delivery landing a provider's interface early, `decomposition-doctrine`'s cuts that
ship a contract first, and `autonomy-levels` for waits on the Owner's approval.

## Scope

The boundary read keeps one work unit: the relation model is one cohesive concern, and rendering and enforcing it are
how other code uses it, not separate deliverables. Its implementation may still cut into a delivery plan — the record
and its checks, then enforcement at each ceremony — decided after the cutover.

## Dependencies / Coordination

- **`storage-cutover`** — the edge above: the record's shape and its enforcement wait for the store.
- **`seam-record-kinds`** (shipped) — owns the meta and cohort record kinds, their parsers, and the meta's
  `Depends On` write check; this work unit extends them.
- **`wu-lifecycle-state-model`** — owns the state axes; the gate vocabulary is the seam between the two. An inbound
  entry routed there in this change asks it to keep spec approval, implementation start, and landing as named
  boundaries.
- **`task-list-conventions`** — owns the task-wait annotation's grammar; an inbound entry is routed there in this
  change.
- **`goal-aware-direction`** — consumes typed edges and cohort orderings for the critical path, unblock leverage, and
  its capacity mode; owns `VECTOR.USER`'s intents and `VECTOR.PROJECT`'s outcomes; shares the exclusion question. Its
  predicted cohort with `roadmap-tooling` is a candidate home for this work unit as the graph's supplier, decided at
  that cut.
- **`seam-status-roadmap`** and **`roadmap-tooling`** — render edges and cohort entries from typed listings.
- **`seam-lifecycle`** discharges edges and records the pause's `waitsOn`; **`seam-decomposition`** redistributes
  edges at a cut and must carry their gates and reasons.
- **`external-pm-composition`** — maps typed relations onto a tracker's, keeping one authority.
- **Related held entries elsewhere,** for re-triage at a drain or this work unit's grooming: `roadmap-tooling`'s "Add
  a dependency-edge flag to `arc stub`"; `cross-wu-coordination`'s "Revalidate landed dependency contracts when a
  deferred consumer first resumes" and "Take a plan's named actors as the dependency-conformance re-check list";
  `task-list-conventions`' "Let a task list express a sequencing override the cursor can read" and "Forbid non-linear
  blocked-open leaves in generated task lists"; `operational-state-docs`' "Make execute-bound Errand offers respect
  typed work-unit dependencies".

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this work unit's next planning iteration; each
> carries its origin. Integrate — or consciously reject — at iteration._

### Dispositions — grooming, 2026-10-15

| Entry                                                          | Outcome | Where, or why                                |
| -------------------------------------------------------------- | ------- | -------------------------------------------- |
| Qualify dependency edges with the lifecycle boundary they gate | fold    | § Decisions, D1 (gates) and D3 (enforcement) |

### `[ ]` **Take a cut's provider-keyed edge handling as the input to cohort endpoints**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Open question 1, cohort endpoints, D2 task annotations, and provider-keyed edge redistribution

- _Observation:_ `seam-decomposition` builds nothing for relations and adopts four rules that keep relations' change
  local (`draft-seam-decomposition.md` § Forward compatibility with `work-item-relations`). Edges move as entries keyed
  by provider: a dependent's edge on the origin gets the replacement targets as providers, each a copy of the entry, or
  is dropped, and a member's seeded edge copies the origin's, so a gate and a reason ride along when the entry widens.
  The terminal batch compares edges by provider, so a gate or reason set during authoring is grooming. Cohort documents
  are written only through the cohort kind's writers, the at-cap fan-out block included. Redistribution never names a
  cohort, even when the origin's name passes to its new cohort — the "shorthand for an edge on each member" answer to
  question 1, as decomposition practices it today; if cohort endpoints are admitted, a `replace` disposition gains a
  cohort target in the lineage kind, which is relations' change. One seam is relations' to settle: a copied `task` edge
  whose task annotation (its D2) stays in the origin's task list.

- _Captured during:_ `seam-decomposition` draft-design close, 2026-10-16.

---
