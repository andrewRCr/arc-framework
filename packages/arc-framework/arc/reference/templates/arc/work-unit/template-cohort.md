# Cohort: `{cohort-name}`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Parent:** {The parent cohort's name — for a sub-cohort only; omit this line for a top-level cohort. Derivable
from the `Cohort` path, so it is a convenience pointer, not a source of truth.}

**Purpose:** {Required floor — one paragraph expanding the slug into why this grouping exists: the single
concern its members share, and what distinguishes it from "a pile of loosely-related work units." This is the
minimum that makes the file non-vacuous, and the grouping's own reality check — if you cannot write it, the
cohort should not exist. It may sharpen into a thesis as the grouping tightens.}

---

<!--
  Everything below the Purpose floor is OPTIONAL coordination scaffold — keep only the sections this cohort
  actually needs and delete the rest. Coordination is a continuum of how much the doc says, not a mode the
  cohort switches on: a purely-organizing cohort carries the Purpose floor and nothing more.

  This section set is generalized from the first cohort prototypes and is expected to iterate as more cohorts
  are minted — treat it as a starting scaffold, not a fixed schema. Adding or retiring a coordination section
  as practice settles is convergence, not design debt.

  Discipline (forced by the per-member partition): this doc carries COORDINATION ONLY — never design that
  drives a member's task list. A contract's authoritative definition lives in its owning member's spec; record
  only a pointer plus the consuming members here. A per-member section that fills with task-driving design is
  the visible smell that the content belongs in that member's spec.
-->

## Coordination

{Sequencing (optional) — a derived orientation view of member dependency order; each member's own `Depends On`
edges remain the source of truth. A short fenced diagram or list is enough.}

### Shared contracts

{Cross-member design no single member owns. For each: name the contract, the member whose spec owns its
authoritative definition, and the members that consume it — a pointer plus a consumer list, never the design
itself.}

### Soft coordination

{Influences and seams that are not dependencies — forward-compat constraints, downstream facilitation,
conventions members honor. Omit when there are none.}

### Cross-cohort

{Open questions or seams whose home is another cohort, recorded here only so they have a visible owner. Omit
when there are none.}

### Closeout criteria

{Optional — the condition under which the cohort is complete (e.g. "all members shipped and the shared contract
retired"). Useful for a coordinating cohort; omit for a purely-organizing one.}

## Members

{Per-member coordination — one `###` section per member that has cross-cutting coordination to record, keyed by
the member's slug. The sections form a partitioned surface: each member edits only its own, so parallel writers
line-merge cleanly. A member with nothing to coordinate gets no section — membership is still derived from the
`Cohort` field, so a missing section means "nothing to coordinate," not "not a member."}

### `{member-slug}`

{_Exposes:_ what this member offers its siblings — the surfaces, contracts, or artifacts they build on.}

{_Consumes:_ what this member depends on from its siblings or from outside the cohort. Omit either line when it
does not apply.}

## ADR anchors

{Optional — the architecture decision records anchoring this cohort's constitutional choices, each a backticked
filename plus a one-line note on what it anchors. Omit when the cohort rests on no specific ADR.}

---
