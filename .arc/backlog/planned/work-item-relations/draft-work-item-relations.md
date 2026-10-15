# Draft: work-item-relations — typed relations between work items

- **Origin:** [internal] — the storage program's sequencing survey, 2026-10-15: five read-only passes over the
  in-flight storage members' metas, specs, task lists, and session notes, then the Owner's discussion of the dependency
  model, lifecycle activity, and throughput; minted planned, P1, the same day.
- **Purpose:** Record which of a work item's gates each dependency holds, and why, so ARC can say when a work item may
  start, pass a task, or land, and every other surface displays that one fact rather than restating it.

---

## Continuity

- **Readiness:** seeded, not groomed. The concern, its evidence, and a leaning shape are recorded; no decision is
  settled.
- **Timing:** `Depends On: storage-cutover`. The edge lives in the meta record, whose final shape and format version
  reconcile only after the storage seam, and enforcing an edge at activation or start edits the lifecycle write path,
  which never runs alongside the seam. Grooming continues before then (Owner, 2026-10-15): the general shape and the
  design-level seams other work units can build toward.

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

A shared artifact whose owner was "whichever change builds it first" (the `.git` reader between `storage-projection`
and `storage-ref-backend`) also surfaced. That is an unowned shared contract, not a dependency, and belongs in a
cohort's shared contracts rather than in this model.

## Three concerns, three owners

- **The edge's shape** — items 2, 3, 4, 6, and 7 — is this work unit's.
- **Restatement** — item 1 — is this work unit's consequence. One mutable fact keeps one authority
  (`strategy-pm-composition-evolution.md`, Principle 1): once an edge carries its gate and reason, coordination
  documents and status surfaces display it from the record rather than restating it.
- **Activity** — item 5, and the conflation of Planning and Active — is not this work unit's. `wu-lifecycle-state-model`
  owns the readiness and scheduling axes, and `seam-lifecycle`'s pause, from the flip, records what a paused work unit
  waits on (`waitsOn`). "Blocked" need not be stored at all: it is an unmet edge at the work item's current gate.

## Leaning shape — to groom

- **Gates on the dependent's side,** bound to ceremony boundaries that exist today and survive any lifecycle reform:
  spec approval, the start of implementation or a named task, and landing. An unqualified edge keeps today's
  blocks-start reading.
- **The provider's side collapses.** While each work unit lands single-branch, a dependent can consume only what its
  provider has made durable — an approved spec or a landed change — never an unlanded task. Only the dependent's gate
  varies, which keeps the model an attribute of the edge rather than a scheduling engine.
- **Idiom.** Precedence links from project scheduling: finish-to-start (implement after the provider lands) and
  finish-to-finish (land after it, start any time). Typed relations in Jira, Linear, and GitHub's issue dependencies
  split blocking from related links.
- **Each edge carries its reason.**
- **Hard and soft stay separate records.** An edge is hard: its gate's ceremony enforces it, with an Owner override. A
  soft ordering — design order, attention, a chosen sequence — is an intent, not a weaker edge, and belongs to
  `goal-aware-direction`'s `VECTOR.USER`; a chosen order never becomes an edge.
- **Exclusion as a second relation?** Program exclusions ("never alongside the seam") are concurrency constraints,
  not precedence; `goal-aware-direction` lists them as an open recommender input, data or judgment. Decide whether
  this work unit records them.
- **The CLI computes:** each gate's satisfaction, what may start or land now, and the blocked derivation.

## Throughput

Gate-qualified edges let a dependent start before its provider lands wherever only landing is held, and give the
critical path its input. The throughput outcome itself spans other homes: `goal-aware-direction`'s capacity mode (feed
the constraint, work with float, or start nothing new), `wu-lifecycle-state-model`'s pool of implementation-ready work,
stacked delivery landing a provider's interface early, `decomposition-doctrine`'s cuts that ship a contract first, and
`autonomy-levels` for waits on the Owner's approval.

## Dependencies / Coordination

- **`storage-cutover`** — the edge above: the record's shape and its enforcement wait for the store.
- **`wu-lifecycle-state-model`** — owns the state axes; the gate vocabulary is the seam between the two. Its held entry
  on qualifying edges moved here (Inbound Buffer, below).
- **`goal-aware-direction`** — consumes typed edges for the critical path, unblock leverage, and its capacity mode;
  owns soft intents; shares the exclusion question. Its predicted cohort with `roadmap-tooling` is a candidate home for
  this work unit as the graph's supplier, decided at that cut.
- **`seam-status-roadmap`** and **`roadmap-tooling`** — render edges from typed listings.
- **`seam-lifecycle`** discharges edges and records the pause's `waitsOn`; **`seam-decomposition`** redistributes
  edges at a cut and must carry their attributes.
- **`external-pm-composition`** — maps typed edges onto a tracker's relations, keeping one authority.
- **Related held entries elsewhere,** for re-triage at a drain or this work unit's grooming: `roadmap-tooling`'s "Add
  a dependency-edge flag to `arc stub`"; `cross-wu-coordination`'s "Revalidate landed dependency contracts when a
  deferred consumer first resumes" and "Take a plan's named actors as the dependency-conformance re-check list";
  `task-list-conventions`' "Let a task list express a sequencing override the cursor can read" and "Forbid non-linear
  blocked-open leaves in generated task lists"; `operational-state-docs`' "Make execute-bound Errand offers respect
  typed work-unit dependencies".

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this work unit's next planning iteration; each
> carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Qualify dependency edges with the lifecycle boundary they gate**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain (2026-08-22);
  captured during `decomposition-doctrine` re-grounding. Re-triaged from `wu-lifecycle-state-model`, 2026-10-15.
- _Shapes:_ § Leaning shape, gates on the dependent's side.
- _Concern:_ unqualified `Depends On` means blocks-start, leaving implement-time and integrate-time ordering in
  unchecked prose that readily goes stale. The inverse also fails: recording a true later-boundary dependency as
  today's edge falsely blocks planning.
- _Fold-in:_ evaluate lifecycle-qualified degrees such as required-to-plan, required-to-implement, and
  required-to-integrate against this WU's state axes. Preserve today's unqualified blocks-start reading as the
  default, enforce each degree at its owning ceremony, and keep later-boundary session orientation advisory.

---
