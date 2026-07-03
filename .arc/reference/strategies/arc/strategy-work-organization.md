# Strategy: Work Organization

> **Decision guide and rationale:** [Work Organization](https://andrewrcr.github.io/arc-framework/reference/work-organization/)
> on the docs site covers categorization guidance, edge cases, discovered-work routing, branch
> protection trade-offs, and common pitfalls.

Operational specification for organizing development work in ARC-based projects. Defines work
categorization, git branch workflow, directory structure, and archive organization. Referenced by
workflows at specific trigger points — this is the agent's lookup reference, not narrative
documentation.

---

## Contents

- [Work Categories](#work-categories)
- [Decision Rules](#decision-rules)
- [Work Character](#work-character)
- [Class Model](#class-model)
- [Cohorts](#cohorts)
- [Task Lists and Branches](#task-lists-and-branches)
- [Work Unit State](#work-unit-state)
- [Spec-Flow Invariants](#spec-flow-invariants)
- [Branching](#branching)
- [Per-Worktree Isolation](#per-worktree-isolation)
- [Main-on-Main Pattern](#main-on-main-pattern)
- [WU Artifact Headers](#wu-artifact-headers)
- [Archival](#archival)
- [ROADMAP](#roadmap)
- [Discovered Work During a WU](#discovered-work-during-a-wu)
- [Branch Protection Modes](#branch-protection-modes)
- [Auto-Merge Lane](#auto-merge-lane)
- [Errand Work Class](#errand-work-class)
- [Directory Structure](#directory-structure)
- [Team Coordination](#team-coordination) *(→ dedicated strategy)*
- [Planning Module](#planning-module) *(→ dedicated strategy)*

---

## Work Categories

Work units are identified by their branch type prefix (`feat`, `fix`, `chore`, etc.) from the
[`branch-format`][branch-format-method] method's type set. See [§ Branching](#branching) for
the branch model and [`branch-format`][branch-format-method] for the type set and override
mechanism.

---

## Decision Rules

Branch-type selection for a new work unit follows the [`branch-format`][branch-format-method]
method's type set. The method ships per-type semantic guidance (`feat` for new capability,
`fix` for correction, `chore` for routine maintenance, `refactor` for restructuring without
behavior change, `hotfix` for production-issue response) and supports overriding the set
itself.

For routing deferred or discovered work — inline fix vs. atomic task vs. new work unit — see
[DEV-RULES.ARC][dev-rules-arc] § Discovered Work Routing.

---

## Work Character

Orthogonal to a work unit's *category* (its branch-type prefix, above) is its *character* — whether the work is
**atomic** or **multi-step**. Character is a routing axis in its own right, and it is *scale-invariant*: the same
distinction sorts inbox items, individual tasks, and whole work units.

- **atomic** — one **indivisible** self-evident concern, bounded to a single session: no internal stage that needs
  *durable* decomposition. *Typically* one review increment and a single commit — but both are incidental, not the
  character. Commit-count is incidental (one concern may land in several commits under the normal atomicity policy
  and stay atomic); review-pass-count is too — a *determinate* concern may be staged into a bounded few **in-session**
  review passes (the *extended errand*) for reviewer ergonomics and stay atomic, since the concern is still one
  indivisible whole tracked by nothing more durable than its own diff. At the **task scale**, atomic work surfacing
  mid-WU folds into the current commit or routes out (inline, Errand, or capture); at the **item scale**, deferred
  atomic work is a capture.
- **multi-step** — distinct stages needing **durable** decomposition: a task list, tracked across sessions and
  validated against a spec. It needs decomposition before execution and (when for-later) matures through the
  planning pipeline rather than executing as-is. The line from atomic is not pass-count but **durability** — needing
  a tracked plan that outlives the session, not merely more than one review pass.

**Character is not the wrapper floor** — the wrapper is the **spec-worthiness** gate ([§ Class Model](#class-model)
boundary test #1) — but character and wrapper relate tightly. **An Errand is always atomic:** one indivisible
self-evident concern bounded to one session (a determinate sweep — a doc-grooming pass, a `ROADMAP` re-render, a
housekeep drain that fans out — is *one* concern, however many files, commits, or in-session review passes it lands
in). What makes work multi-step — and so a **Work Unit** (however light) — is needing a **durable** decomposition: a
tracked plan that outlives the session, which is also what authoring or recording a design needs. A second *review
pass* alone does not cross the line; needing a *tracked plan* does. A WU is spec-worthy — a design worth recording,
or a durable plan a correct execution must navigate — and is *usually* multi-step, though a small spec-worthy
concern can be atomic in character too; the WU is decided by spec-worthiness, not by counting passes.

**One indivisible concern, one session** is the sharp line — not increment- or pass-count. "Is this *one* concern
that fits a single session without a durable plan?" carries irreducible boundary judgment — two careful readers can
split a marginal case differently and both be ARC-correct. The ambiguity is deliberate: within the bounds, the
developer decides, and a mis-call is cheap to correct via the Errand→WU promotion edge (`arc errand promote`).

**Route by fate, not by wrapper.** Capture surfaces sort on what the work *becomes* — Errand vs WU (spec-worthy?),
not which artifact happened to produce it. For the during-WU-vs-later routing table, see
[DEV-RULES.ARC][dev-rules-arc] § Discovered Work Routing.

---

## Class Model

A work unit's **`Class`** is its recorded *weight* — `light`, `heavy`, or `novel` (`[TBD]` until resolved). Weight
is the work a unit demands across *planning, execution, and review* — intrinsic demand, not output volume. `Class`
is the signal roadmap and parallelism planning read to balance a worklist; the [classify-work-unit][classify-work-unit]
method is the triage that sets it, and this section is the model and reasoning behind that triage.

`Class` is the *weight* question of a single work-sizing spectrum; the **Errand-vs-WU wrapper line**
([§ Work Character](#work-character)) is its companion *spec-worthiness* question, and together they place any work
from a self-evident Errand (the floor) to a from-scratch `novel` synthesis (the ceiling). The two stay distinct:
the wrapper line asks *is this spec-worthy?* (below floor on both intrinsic axes → Errand, below the wrapper; clears
either floor → WU), `Class` asks *how much weight* within a WU. Atomic is **not** a `Class` value — `Class` begins
at the `light` floor; an Errand carries none.

What scales with `Class` is **design-authoring ceremony** — how much spec and planning the work warrants. What
never scales is **execution discipline**: the review-increment gate and the quality gates hold identically at every
value. A `heavy` WU is not held to a higher engineering bar than a `light` one; it simply has more design to author
before a competent engineer can execute it well.

### The two axes

`heavy` iff *either* of two intrinsic axes runs high. They **decorrelate** — each loads a different authoring stage
— so test them independently rather than collapsing them into one judgment:

- **Derivation** — how much design must be *authored* versus *read off* determinate inputs. This is the
  **records-vs-derives** line: when the spec merely *records* a design that already follows from the issue and
  existing patterns, derivation is low; when settling the work *requires authoring* a real design — concerns,
  alternatives, and tradeoffs that do not exist until someone works them out — derivation is high. Derivation loads
  the drafting and spec stages, and tracks how novel-vs-routine the execution is and how much validation review
  demands. **Floor:** only *spec-worthy* design counts — what a competent engineer must settle before starting; a
  choice resolved *during* implementation (naming, local structure) is not derivation, even though it involves
  deciding something. This design-vs-implementation line keeps the derivation trigger from swallowing every WU.
- **Scale / complexity** — how large or intricate an existing-code surface a correct plan *and execution* must
  navigate: the codebase-grounding demand. This is the **routine-vs-substantial** bar: most work carries some
  grounding, so the bar sits at *substantial* — a large or intricate surface of symbols and call-sites a correct
  plan must verify, beyond the routine floor. Scale loads the task-generation stage.

`light` iff **both** axes are low. The axes are co-equal: a determinate-but-large refactor is `heavy` by grounding
demand alone, exactly as a small-but-novel design is `heavy` by derivation alone.

**The top of the derivation axis is `novel`.** Above the `heavy` promotion, a second threshold on derivation alone
promotes `heavy → novel`: when settling the design requires *inventing* concepts or models that do not yet exist in
the problem domain (synthesis, research, discovery) rather than *composing* a real design from existing patterns.
The axes are asymmetric here, and the asymmetry falls out of their nature — **scale is endurance** (breadth that is
chunkable, parallelizable, and self-limiting, since runaway breadth trips decomposition into a cohort, so it caps at
`heavy`); **derivation is depth** (serial, context-saturating, unbounded, so only it reaches the top). `novel` is a
distinct *kind*, not just more weight; its recorded purpose is **primarily** parallelism / sequencing (you can hold
roughly one genuinely-novel stream — the strongest "don't double up" signal) and **secondarily** an advisory
distinct planning shape (a discovery / research phase + an ADR), suggested, never forced.

### The boundary tests

Apply in order. The first sorts work below the wrapper out of the model entirely; the next two each independently
promote a WU to `heavy`; the last promotes `heavy → novel` on the derivation axis alone:

1. **Errand vs. WU (the wrapper floor).** *Is this spec-worthy — does it clear the floor on either intrinsic axis
   (a design worth recording, or a durable plan a correct execution must navigate — a substantial grounding surface
   or cross-session tracking), or is it self-evident on both?* This reads the same two axes below at their
   **sub-floor** — the Errand is the shared below-floor tier of one spectrum, not a separate cardinality gate.
   **Below floor on both** → it is an [Errand](#errand-work-class), not a WU (one indivisible self-evident concern,
   atomic in character — *typically* one review increment, a determinate one extended to a bounded few in-session
   passes, however many commits): below the wrapper, no meta, no `Class`. **Clears either floor** → it is a WU
   (spec-worthy); continue.
2. **Derivation trigger (→ `heavy`).** *Must a real design be authored — concerns, alternatives, tradeoffs that do
   not exist until someone works them out — before a competent engineer can start?* **Yes** → `heavy`. Count only
   *spec-worthy* design (the floor above): a choice resolved during implementation is not derivation.
3. **Scale / complexity trigger (→ `heavy`).** *Does producing a correct implementation plan require a substantial
   codebase-grounding pass, beyond the routine floor?* **Yes** → `heavy`. Guard the bar at *substantial* — a soft
   bar makes everything `heavy`.
4. **Invent-vs-compose trigger (`heavy → novel`).** *Does settling the design require inventing concepts / models
   that do not yet exist in the problem domain — versus composing a real design from existing patterns?* **Invent**
   → `novel`; **compose** → stays `heavy`. Derivation only — scale never reaches `novel`. A magnitude cut within
   "derivation fired," so it reads fuzzier than the fired-or-not lines; acceptable because the consequence is
   advisory.

### Worked examples

**The wrapper floor, split on the scale axis.** Both of these are one concern that can land across *several
commits* — the re-based gate's admission is that commit-count alone no longer forces a WU:

- **Self-evident sweep → Errand.** A doc-grooming pass or a `ROADMAP` re-render cascade: many files or commits, but
  nothing to author and no substantial grounding a correct plan must navigate. Below floor on both axes — one
  concern reviewed once, an Errand.
- **Widely-used-symbol rename → `heavy` WU.** A rename whose correct plan must verify call-sites across a broad
  surface clears the *scale* floor: spec-worthy by grounding demand, so a WU even though the design is
  determinate.

The two axes form a 2×2; each cell is recognizable in retrospect:

- **Low derivation, low scale → `light`.** A moderate feature whose design reads off a clear issue and existing
  patterns, over a contained surface. The spec *records* the design; the plan needs only a modest grounding pass.
- **Low derivation, high scale → `heavy` (scale).** A large mechanical refactor — rename or move a widely-used
  symbol. The design is determinate (nothing to invent), but a correct plan must verify many call-sites across a
  broad surface, and that breadth carries into careful execution and heavier review.
- **High derivation, low scale → `heavy` (derivation).** A tricky algorithm or novel mechanism whose design must be
  *worked out* — alternatives and tradeoffs that do not exist until authored — even over a small surface.
- **High derivation, high scale → `heavy` (both).** Novel design over a large, intricate surface; both triggers
  fire.

The derivation-high cells split again by invent-vs-compose:

- **Compose (high derivation) → `heavy`.** A real design authored from existing ARC patterns and primitives — a
  routing scheme assembled over known surfaces; the alternatives are real, but the building blocks already exist.
- **Invent (high derivation) → `novel`.** A design that must synthesize concepts the domain does not yet have — a
  new model, or a discovery / research pass before drafting is even possible. Scale rides along but does not lift
  work here: a `both`-high WU and a `derivation`-only-high WU both read `novel` — depth dominates.

The records-vs-derives line and the substantial-grounding bar echo long-standing design-doc practice — deciding
when a piece of work warrants a written design before implementation — adapted here into two crisp tests that place
work without author guesswork.

### Estimating and the ratchet

Every WU *has* a `Class`; `[TBD]` is the pre-classification sentinel (distinct from `[none]`), meaning the weight is
merely not yet resolved. When resolving without complete information, set a **best estimate** against the boundary
tests — never a blanket `heavy` stamp, which would fabricate the very signal `Class` exists to carry.

`Class` is **estimate-then-ratchet**, not strict one-way:

- The ratchet protects **realized** design-authoring: once a stage has *authored* design at some depth, `Class`
  never drops below that floor.
- An **estimate** — a value set before that work exists — is freely revisable in *both* directions until planning
  substantiates a floor. Correcting a too-high estimate *down* is not a demotion: no work is discarded.

So estimating costs nothing — guessing `heavy` and later correcting to `light` loses nothing — which removes any
lowball incentive. At each lifecycle touchpoint this is a cheap **confirm-or-ratchet**, not a re-derivation.

**"Execution turned out light" ≠ "the design was determinate."** If a real design *was* authored, realized authoring
floors `Class` even over a tiny surface; only an over-high *estimate* corrects down. A derivation-heavy / scale-light
WU feels front-loaded, but it was heavy *when both jobs read the value* — at planning; `Class` is a decision-time
signal, not a retrospective effort tally.

### Readiness rule

A startable work unit carries a *resolved* `Class`. `[TBD]` is legal only in `backlog/provisional/`; entry into
`backlog/planned/` — the [readiness-ladder](#readiness-ladder) rung the start decision reads — is the **forcing
point**, because the weight signal must exist *before* a WU becomes a start candidate, not at activation (too late:
the start decision precedes it). The [promote-work-unit][promote-work-unit] workflow performs that rung and forces
the estimate via the [classify-work-unit][classify-work-unit] method.

### Planning depth and spec forms

`Class` is the WU-level *weight*; **`planning depth`** is the per-stage *resolution* — how much authoring a given
stage does. Each authoring stage (drafting, spec, task generation) resolves its own depth on a `low` / `medium` /
`high` ordinal, independently, from the axis that loads it. Depth is **transient and per-stage**: it is never
recorded on the meta and may differ across stages (a WU can want a deep spec but shallow task-gen, or the reverse).
Only the spec stage's depth names a durable artifact — its **spec form**. (How each stage turns its depth into
concrete ceremony is the authoring-pipeline's; this strategy defines the ordinal and the spec-form mapping.)

The spec stage's depth selects one of three **spec forms** on that same ordinal:

| Spec form  | Spec-stage depth | `Class`            | Splits by category                    |
| ---------- | ---------------- | ------------------ | ------------------------------------- |
| `brief`    | `low`            | `light`            | no                                    |
| `outline`  | `medium`         | `light` or `heavy` | no                                    |
| `detailed` | `high`           | `heavy` or `novel` | yes — PRD (feature) / RFC (technical) |

The form ↔ `Class` relationships:

- **`brief` ⇒ `light`.** A brief records a determinate design over a contained surface.
- **`detailed` ⇒ `heavy` or `novel`.** A detailed spec is authored only when the **derivation** axis is high — a
  real design must be worked out — which forces `heavy`, or `novel` when that design must be *invented* rather than
  composed. The two share the `detailed` form; `novel`'s distinct shape is the advisory discovery / research phase +
  ADR, not a fourth form. `detailed` is the one form that splits by work category: a **PRD** for a feature, an
  **RFC** for a technical change. The other two forms do not split.
- **`outline` straddles.** An outline serves a `light` WU at moderate scale *and* a `heavy` WU whose weight comes
  from the **scale** axis — a determinate design over a large surface, where the spec records the design but the
  implementation plan still needs a substantial grounding pass. The `Class` field and the task-list scale
  disambiguate the two outline cases.
- The **`heavy` / `brief` cell is empty.** Low scale reaches `heavy` only through derivation, and derivation forces
  `detailed` — so heavy work is never brief.

These forms are **guidance, not a hook-enforced constraint**: nothing validates a WU's `Class` against its spec
form. The mapping orients the author toward the right depth; the boundary tests and the ratchet keep the `Class`
honest.

### Validation contract

What a spec is validated *against* hangs on two form-invariant anchors — not requirement-numbering, which was
only ever a PRD-idiom traceability convenience:

- **Implementation → Success Criteria.** Every form carries concrete, falsifiable Success Criteria (even the
  `brief` floor's single success signal), and the implementation is validated against them at completion. This
  anchor is invariant across every form.
- **Task list → the form's enumerable substrate.** The task list is validated for coverage against whatever the
  form enumerates — numbered **Requirements** (PRD), structured **Proposed Design** elements (RFC), the settled
  **Decision(s)** (`outline`), or the one falsifiable **signal** (`brief`). The substrate differs by form, but
  the mechanism — grounding-audit coverage of the design's enumerable unit set — is identical. The design *is*
  that unit set; it is simply not always called "requirements."

---

## Cohorts

A **cohort** is a deliberate grouping of sibling work units — the structure a concern takes when it outgrows a
single WU. Rather than one WU sliced into stacked PRs, the concern becomes a cohort of self-contained,
single-owner WUs, each with its own `meta-* / spec-* / tasks-*` and one branch — how many PRs a work unit emits
is a separate axis. The work unit remains the **leaf deliverable**; the cohort is the grouping above it.

This taxonomy complements the [Class Model](#class-model): `Class` is the *weight* of one WU; a cohort is the
*shape* a concern takes when it spans more than one. The planning-time judgment of whether a concern is one WU or
a cohort — and where the cuts fall — is the `assess-cohort-fit` method's; this section defines what a cohort *is*
once that cut is made.

### One grouping kind; coordination by degree

There is **one grouping kind — the cohort** — and coordination is a property it carries *by degree*, not a
separate category. Every cohort **carries a `cohort-{name}.md`**, with no exceptions: a grouping that only
*organizes* carries a Purpose-only doc; one that actively *coordinates* carries a fuller body. The difference is
how much the doc says, not what kind of thing the grouping is.

"Theme" survives only as informal prose for a top-level, mostly-organizing cohort — never a distinct schema kind
and never a doc-less exception. A top-level cohort and an informal "theme" are syntactically identical (both a
single-segment `Cohort` value); treating them as one kind with a Purpose-floor doc removes the ambiguity.

### The `cohort-{name}.md` record

Every cohort's doc (§ One grouping kind) is a constitutive structured record, not free-form notes — its presence
is what marks a directory as a deliberate grouping rather than an incidental parent. The record's anatomy, from
the required floor upward:

- **H1 + uniform preamble**, scaffolded from `template-cohort.md`.
- **Required Purpose floor** — the one-paragraph expansion of the slug (§ One grouping kind): the minimum that
  makes the file non-vacuous, and the grouping's reality check. It may sharpen into a thesis as the grouping
  tightens.
- **Optional coordination content, accreting above the floor** — shared contracts (cross-member design no single
  WU owns), closeout criteria, a parent-cohort pointer (derivable from the `Cohort` path). There is no
  `Coordinated` flag: coordination is the continuum of how much the doc says, not a mode it switches into.
- **Per-member sections keyed by slug** — a *partitioned coordination surface*, not a membership roster. Each
  member edits only its own section, so parallel writers line-merge cleanly.

**Membership stays derived.** Membership comes from each WU's `Cohort` field — the meta record is the source of
truth — never a list the doc maintains. A per-member section is therefore a *subset* of the membership: a WU gets
one only when it has cross-cutting coordination to record, and a missing section means "nothing to coordinate."
The doc never carries a roster or status table — those render from metas. An orphan section (its WU renamed or
removed) is caught by the cohort-consistency invariant, not by manual upkeep.

**No coordinator or owner.** A cohort needs neither. Membership is derived, per-member coordination is partitioned
(each member edits only its own section), and cohort-level material is by definition ownerless — *the partition
is the coordination mechanism, in place of an owner.* `Owner` stays WU-level; any team-scale arbitration need
routes to the team-coordination conventions, not a role minted at the cohort.

**Design vs. coordination — forced, not chosen.** The cohort doc carries **coordination only — never design that
drives a task list** — and the per-member partition *forces* that boundary rather than merely asking for it. A
contract's authoritative definition drives its implementing member's task list, so it **must** live in that
member's spec; the cohort doc holds only a *pointer* to it plus the list of consuming members. Coordination
itself splits two ways:

- **Cohort-level** — genuinely ownerless shared material: a thesis, closeout criteria, a convention every member
  honors.
- **Per-member** — a single member's own surface, framed as **exposes / consumes**: what it offers its siblings
  and what it depends on from them.

The partition is the forcing function: when a member's section starts filling with design that drives its *own*
tasks, that visible smell *is* the signal the content belongs in its spec, with only a pointer left behind. The
boundary holds because crossing it looks wrong in the doc, not because a reviewer must police it.

**Cross-cohort coordination stays coordination, not membership.** When a member or cohort needs to coordinate
with work outside its own cohort, record the seam in the cohort doc's optional `### Cross-cohort` section and
express hard sequencing with ordinary WU-level `Depends On` edges. The section names the outside home and the
coordinated concern; it does not make the outside WU a member, and it never creates multi-cohort membership.
A WU's `Cohort` value names the one grouping whose closeout criteria and per-member partition it lives under. If
the same WU genuinely belongs to two closeout definitions, the work is miscut: split the work, or merge the
groupings. Use `### Cross-cohort` for named coordination across boundaries, not shared residence.

**Relocatability and reference hygiene.** `cohort-{name}.md` is a movable `.arc/` artifact, exactly like a WU's
`meta-* / draft-* / spec-* / tasks-*`: it relocates with its directory — `backlog/planned/<cohort>[/<subcohort>]/`
→ `completed/<dated>/<NN>a_cohort-<name>/` when the cohort's last member ships — as a pure `git mv` with no
content edit. The archived doc's `Parent` field preserves nesting context; the archive directory uses the
cohort doc's own slug, not the full parent path. It therefore adopts the movable-artifact relocatability and
reference-hygiene invariant wholesale: inbound references to it are
backticked-filename-only (no paths, no Markdown links), and it carries no outbound relative-path links. Both hold
*by construction* — a cohort doc names sibling drafts and specs by filename, and the parent-cohort pointer is
derivable from the `Cohort` path — so the position-independence the pure-`git mv` relocation depends on needs no
special handling.

### The nesting cap — one level

Nesting is capped at one level: at most `<cohort>/<subcohort>/<wu>`, never three grouping segments. The cap is a
structural anti-sprawl bound, **not** a limit on coordination — both levels may coordinate, and each level above
the WU is optional. The required one-paragraph Purpose doubles as a reality check: if you can't expand the slug
into a sentence distinguishing this cohort from "a pile of loosely-related WUs," it shouldn't exist.

Nesting lives in the **path-valued `Cohort` field** (e.g. `core-platform/auth`), not a distinct artifact type:
one `cohort-{name}.md` shape at every level, an inner cohort differing from a top-level one only by path depth
and by how much its doc says. "Sub-cohort" is prose framing, never a `subcohort-*` prefix. **The on-disk
directory mirrors the path** — `backlog/planned/<cohort>/<subcohort>/<wu>/` — and membership derives from each
WU's `Cohort` field, never a maintained roster.

### Decomposition — three arms by parent position

When a WU decomposes it **becomes a cohort**, its `cohort-{name}.md` carrying forward the coordination content
from its origin draft. Which arm runs is selected by the parent's position relative to the nesting cap:

1. **Standalone WU → top-level cohort.** A WU in no cohort becomes a new top-level cohort carrying its name,
   members nested beneath. *Name preserved.*
2. **In-cohort WU → sub-cohort.** A WU already in a single-segment cohort becomes a sub-cohort under its existing
   parent, members nested one level deeper. *Name preserved.*
3. **At-cap WU → lateral fan-out.** A WU already at the cap (a two-segment parent) has no legal nested target —
   minting a cohort beneath it would be a forbidden third segment — so it decomposes *laterally* into sibling WUs
   under its existing parent. *The name is not preserved as a grouping node.*

Arms 1–2 preserve the name, and the browsing and narrative references that ride it, at the right altitude. The
"name loss breaks references" worry dissolves across all three arms: dependency edges (`Depends On`) are always
WU→WU, never group-level, so a downstream WU re-points to the specific delivering pieces regardless of name;
narrative references are what the preserved name saves in arms 1–2; and in arm 3 the same "these came from one
concern" fact is carried by a provenance record. `ROADMAP` and `STATUS.USER` render from metas, so regeneration
handles the WU→cohort shift automatically.

**At-cap fan-out — grouping as provenance.** Because no cohort node is minted at the cap, the "these came from
one concern" fact is preserved as **provenance — an immutable past-event record, not live grouping**:

- The origin concern name is recorded **once, write-once at fan-out**, as a cohort-level provenance note in the
  parent cohort doc, in greppable phrasing: *"Fanned out from `<origin>`: `<m1>`, `<m2>`, `<m3>`."* It records a
  past event, so it never drifts and needs no guard.
- Slugs stay content-legible, never ordinal; inter-member order, when it exists, lives in `Depends On`.
- Coordination for the new siblings rides the parent cohort doc — they are members of it now.
- **Reality check (judgment, not a gate):** before a lateral fan-out, ask whether hitting the cap signals the
  *parent* cohort was mis-scoped — calling for a parent restructure — rather than a clean lateral split. A prompt
  only; the cap is never raised to rescue a member that legitimately outgrew itself.

### Active-state decomposition

Decomposition is normally a planning-time act, before code is written. Mid-implementation the supported path is
**extraction**: the origin stays active and only its *unbuilt* scope splits off into new members — committed code
stays put. ARC runs this directly.

Splitting an origin's *already-committed* code across several members — a **full split** — is not an ARC operation;
there is no `arc decompose` for it. It is the ordinary git task of dividing a branch's history across branches, and
it is an escape hatch, not a recommended move:

- **Cleanly-separated commits** — `git cherry-pick` each member's commits (by hash, or an `A^..B` range) onto its
  branch.
- **Interleaved commits** — separating a commit that mixes several members' work needs history surgery
  (`git rebase -i` to split or reorder). Reaching for it is a commit-atomicity smell; the fix is upstream — commit
  one concern at a time, and decompose at the planning maturity gate before the code exists, so the cut stays clean.

Git ships no "split this branch for me" command, by design — prevention beats the surgery.

### Errand-character decompositions

Not every decomposition authors design. Splitting a backlog stub in place, or routing pieces to existing homes (an
established sibling, a standing doc), is **pure relocation** — no new design written — and runs as a bounded few
in-session increments rather than a planning ceremony: [Errand](#errand-work-class) *character* (not a `Class`).
Decompositions that author member design on a live planning branch stay full lifecycle ceremonies.

### WU sizing standard

Decomposition keys on **orthogonality, not size** — but size is the heads-up that prompts the question. This is
the sizing standard the `assess-cohort-fit` method consumes:

- **Count distinct deliverables and independently-reviewable surfaces** — the primary signal. Several unrelated
  review surfaces in one WU is the decompose trigger.
- **LOC and file count are secondary heads-up signals**, not thresholds: roughly `>~few-hundred LOC`,
  `>~8–10 files`, or work that fails the "reviewable in one sitting" test says *look closer* — review defect
  detection craters past a few hundred LOC per increment. Tightly-coupled work designed as a whole stays one WU
  even when large; the per-task review grain carries quality.
- **Stack vs. cohort:** sequentially-dependent pieces deliver as a **stack** — dependency-ordered WUs, each its
  own branch, merged in order; independent-ish pieces form a **cohort** of parallel WUs. A stack is a cohort's
  dependency-ordered delivery mode, not one WU spread across many branches.

---

## Task Lists and Branches

Task lists are the unit of work planning; branches are the unit of code delivery. The default is **1:1 — one
task list, one branch, one work unit** (see [§ Single branch per work unit](#single-branch-per-work-unit)): a
task list is scoped to a single WU and delivers on that WU's one branch.

When a concern is too large or too multi-surfaced for one WU, the answer is **decomposition into a
[cohort](#cohorts)** of self-contained one-branch WUs — not one task list spanning multiple branches. Two
delivery shapes follow from the cut:

- **Cohort (parallel):** independent members, each with its own task list, branch, and PR.
- **Stack (dependency-ordered):** sequentially-dependent members delivered as ordered PRs, each on its own
  branch, merged in order. The merge/rebase discipline for executing a stack is the
  [Concurrent Work Strategy][concurrent-work]'s § Branch and rebase discipline.

**Branch scope:** One work unit per branch. Switching work units implies switching branches.

**Per-WU meta file behavior on branches.** Each active WU carries its own
`meta-{name}.md` at `active/`. The file is created by
[activate-work-unit][activate-work-unit] on the WU's branch and deleted by
[archive-work-unit][archive-work-unit] at the end of the WU's lifecycle. Parallel WUs on
independent branches carry different files — no cross-branch mutation conflict is possible at
the meta-file layer.

Archive triggers when all tasks in the task list are complete, not when any individual branch
is merged or deleted. Branch cleanup happens independently as PRs merge.

---

## Work Unit State

The `**State:**` field on each WU's `meta-{name}.md` is the load-bearing lifecycle marker.
The four values below trace the WU lifecycle; the workflow that sets each is listed.

### State Enum

| Value         | Set By                                            | Meaning                                                                       |
| ------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Planning`    | [init-work-unit][init-work-unit]                  | Spec and task list being authored; task execution not yet begun               |
| `Active`      | [activate-work-unit][activate-work-unit] Step 4   | Task execution underway (the common case)                                     |
| `Integrating` | [integrate-work-unit][integrate-work-unit] Step 1 | Tasks complete; the WU is open for review and integration, stable until merge |
| `Shipped`     | [archive-work-unit][archive-work-unit]            | Merged to the integration target and archived                                 |

### Readiness ladder

Before a work unit enters the `State` lifecycle above, it climbs a **readiness ladder** through the backlog:
`provisional → planned → active`. The rungs are directory positions, not `State` values:

- **`backlog/provisional/`** — pre-commitment thinking; the thesis is not yet one the project commits to.
  `**Class:**` may be `[TBD]`.
- **`backlog/planned/`** — startable candidates on the ready list. Entry here is the **forcing point for
  `Class`**: a planned work unit carries a *resolved* `**Class:**` (`Light` / `Heavy` / `Novel`); `[TBD]` is
  legal only in `provisional/`. The [promote-work-unit][promote-work-unit] workflow performs this rung and
  forces the estimate via the [classify-work-unit][classify-work-unit] method.
- **`active/`** — execution has a home; the `State` enum above takes over from `Planning` onward.
  [init-work-unit][init-work-unit] performs `planned → active`.

The forcing rule has teeth because the start decision — read off the ready list — precedes activation, so the
weight signal must be present before then.

### The `(phase, location)` model

The State Enum and the readiness ladder are two orthogonal axes of a single model. A work unit's lifecycle position
is the pair **(phase, location)**:

- **Phase** — the meta `**State:**` value (`Planning` / `Active` / `Integrating` / `Shipped`): how far the *work*
  itself has progressed.
- **Location** — a logical position, `provisional` / `planned` / `active` / `completed`: where the work *lives* — its
  backlog readiness rung, its execution home, or the archive. Location normally coincides with the directory the
  artifacts sit in, but it is a logical value, not the path.

The axes move independently. Most positions pair them predictably — the `Planning` / `Active` / `Integrating` phases
sit in the `active` location, `Shipped` sits in `completed` — but the pairing is not fixed. The sharpest divergence is
the **parked** position: a work unit whose execution has begun (`**State:** Active` — the phase) but which has been
set down and relocated to `backlog/planned/` (the `planned` location). Its phase says execution is underway; its
location says it is back on the ready list. Neither axis names that position alone; the pair does.

**`Active` (phase) is not `active/` (location).** The capitalized `Active` is a `**State:**` value on the phase axis;
the lowercase `active/` is a directory on the location axis. They coincide in the common case and diverge in the
parked one — keeping them typographically distinct keeps that divergence legible.

> This "two axes" model is distinct from the **Class** two axes (§ Class Model § The two axes): those decompose a WU's
> *weight* (derivation / scale); these decompose its *lifecycle position*. Same phrase, different pair.

### Stub required fields

Creating a backlog stub (`arc stub`) is the lifecycle's create edge — it mints a WU's `meta-{name}.md` directly at a
backlog rung, with no ceremony. "No ceremony" is not "no inputs": the command **requires the judgment values
supplied** and fabricates none. A stub names its **commitment** (`provisional` or `planned` — the readiness rung) and
its **priority**; a `planned` stub additionally carries a resolved `**Class:**` — the same forcing point the
[readiness ladder](#readiness-ladder) names (`[TBD]` is legal only in `provisional`). `Origin`, `Design`, and `Cohort`
are optional. The command owns the mechanics (path, meta scaffold, ROADMAP regen); the commitment, priority, and
`Class` calls are judgment it will not invent.

---

## Spec-Flow Invariants

Three structural invariants hold across the WU lifecycle regardless of mode or `Class`. Two axes
govern variation above them. The per-axis policy — how each authoring stage realizes the spec form
its depth selects — lives downstream of this strategy.

### Invariants

1. **`meta-*` always exists.** The meta file is the durable identity artifact across the entire
   WU lifecycle. It is created at WU stub creation (alongside any planning artifact, or alone for
   external-tracker-origin WUs), persists through every state transition, and lands in the dated
   archive at integration. Single source of truth for state, owner, dependencies, cohort, and
   (when applicable) the spec pointer. Workflows, tooling, and renderers consume it across the
   lifecycle.

2. **Task list structure is invariant across `Class`.** When a task list exists, its shape is fixed
   — phase headings, leaf task format, completion markers, Success Criteria section. `Class`-scaled
   ceremony varies the artifact's presence and rigor; the structural shape stays uniform.

3. **A parseable spec exists in some form before task-list generation.** Spec form varies by mode
   × `Class` — `brief` / `outline` / `detailed`, or an external tracker entry — but existence
   does not. Task generation always has something to read.

### Scaling axes

Variation above the invariants happens along two axes:

- **Mode** — `pm.mode` ∈ {`arc-in-git`, `external`, `none`}. Mode determines which capture
  surfaces and spec-artifact sets the framework installs. The invariants hold equally under all
  three; the artifact set carrying them differs.

- **`Class`** — `light` / `heavy` / `novel`, the WU's recorded weight (see § Class Model and the
  [classify-work-unit][classify-work-unit] method). `Class` scales the design-authoring ceremony a WU
  carries — how much spec and planning the work demands — while the structural invariants apply
  uniformly at every resolved value.

### Deferred contract

This strategy codifies the invariants, the scaling axes, and — below — the `Class` model and the spec
forms it selects. What stays downstream is the per-*stage* realization: how each authoring stage turns
the `planning depth` it resolves into concrete ceremony (whether `draft-*` is authored, the rigor of
each pass), and the per-mode artifact orchestration. The invariants establish what's stable; the
per-stage contract that builds on them lives with the authoring-pipeline surfaces.

### Escape-hatch guardrails

The scaling axes above raise a discipline question: how does the framework keep work from
escape-hatching to lighter ceremony than it warrants? Three mechanisms:

- **The ratchet protects realized work.** `Class` is estimate-then-ratchet: once a stage has
  *authored* design at some depth, `Class` never drops below that floor (see the
  [classify-work-unit][classify-work-unit] method). An estimate is freely revisable until planning
  substantiates a floor, but realized design-authoring is never silently shed — a WU cannot shrink
  away from `heavy` once its weight is real.

- **The wrapper floor makes work earn its shape.** Dropping below a WU into an Errand is the
  Errand-vs-WU boundary test, not a convenience — only genuinely single-concern work runs below the
  wrapper. Multi-concern work takes the WU shape rather than absorbing scope under a thinner one.

- **Discipline is `Class`-invariant.** Process-task-loop, quality gates, and commit discipline apply
  identically across all three values. `Class` scales design-authoring ceremony, never engineering rigor.

The invariants supply the structural floor; the guardrails above keep that floor intact at every
`Class`.

---

## Branching

ARC's branch model uses a type prefix per branch ([Conventional Branch][cb-spec] style) plus a
`plan/<name>` prefix for the planning life-phase. One work unit owns one branch through its
entire lifecycle.

### Branch type prefixes

Branch type prefixes are codified in the [`branch-format`][branch-format-method] method. ARC's
default type list and the override mechanism live in that file; the strategy describes only the
mechanism (every WU branch carries a type prefix) and its composition with the
[`commit-format`][commit-format-method] method. Branch typing and commit typing are independent
axes: each method overrides independently, and commits within a WU may use any type from the
project's commit-format type set regardless of the branch's prefix.

### Planning branches: `plan/<name>`

Planning work — discovery, draft-doc iteration, PRD authoring, task generation — runs on a
`plan/<name>` branch. The prefix marks the WU's life-phase, distinct from the execution-phase
type prefix the WU adopts at activation.

At activation ([activate-work-unit][activate-work-unit]), the planning branch rotates to its
execution-phase counterpart via local rename + remote replace:

1. `git branch -m plan/<name> <type>/<name>` — local rename
2. `git push origin <type>/<name>` — push under new name
3. `git push origin --delete plan/<name>` — drop the old remote

The rotation is the branch-side companion to the meta-file `State: Planning → Active` transition.
Branch identity persists across the rename; commits, PR, and history carry forward.

### Single branch per work unit

One WU = one branch, from planning through integration. The branch is created at WU inception
(as `plan/<name>`), rotated at activation (to `<type>/<name>`), and merged to main exactly once
at integration. WU artifacts (`meta-<name>.md`, `draft-<name>.md` / `spec-<name>.md`,
`tasks-<name>.md`, companions) live in `active/` on the WU's branch throughout the lifecycle;
main carries no in-flight WU artifacts.

This shape enables per-worktree isolation (see [§ Per-Worktree Isolation](#per-worktree-isolation)
below): each WU's artifacts are reachable only on its own branch, so worktrees never see
siblings' in-flight state.

---

## Per-Worktree Isolation

Single-branch-per-WU (see [§ Branching](#branching)) produces a structural invariant across
worktrees: **each worktree's `active/` contains only its own WU's meta file and that WU's
companions**. No other in-flight WU's meta file is reachable, because every other WU lives on
its own branch and no branch carries another WU's `active/` artifacts.

The invariant follows from two prior decisions:

- WU artifacts live in `active/` on the WU's branch only — main carries no in-flight WU
  artifacts between inception and integration.
- One WU = one branch = one worktree.

### Concurrency under worktrees

Per-worktree isolation enables independent concurrent work units. Each WU operates in its own
worktree without seeing or conflicting with sibling WUs' in-flight planning, status, or task
lists. Cross-WU coordination (dependency declarations, cohort grouping) materializes through
fields on the meta file, not through filesystem co-residency.

### Acceptance test

The invariant is enforceable mechanically: spawn a worktree from `main`, assert that `active/`
contains exactly the spawning WU's meta file plus its companions, and nothing else.

---

## Main-on-Main Pattern

The **main worktree** — the primary checkout the repository was cloned into — stays on `main`. It is not
a work unit's worktree; it is the stable reference every WU worktree spawns from (see
[§ Per-Worktree Isolation](#per-worktree-isolation)) and the launchpad for work that has no WU branch of
its own: planning entry, stale-worktree sweep, repository-wide edits, and Errand launches (atomic fixes
and other short-lived off-WU work — see [§ Errand Work Class](#errand-work-class)).

ARC defines no separate, dedicated administrative worktree. Admin operations run from the main worktree
directly — keeping `main` checked out there is what makes them safe to launch and gives every spawn a
clean base. The pattern composes with externally spawned worktrees: whatever checkout the tooling treats
as the primary workspace *is* the main worktree, with no extra setup.

### Operational constraint

One worktree per IDE / language-server window. Coordination across worktrees at the editor and
language-server layer is largely outside ARC's control, so the working model is one active worktree per
window rather than machinery to share state across them.

---

## WU Artifact Headers

A WU's tracked artifacts form a chain of authority: an `Origin` (the upstream issue, request,
or discussion that prompted the work), a `Spec` (the artifact defining what to build), a
`Task List` (the execution surface derived from the spec), and a `PR URL` (the integration
record). Each non-meta artifact carries a single 1-hop pointer to its immediate upstream;
`meta-*` carries the full chain.

### Chain of authority

`Origin → Spec → Task List → PR URL`. Each artifact is downstream of its predecessor.
Downstream artifacts name only their immediate upstream in the header; `meta-*` is the only
artifact carrying the full chain end-to-end.

### Per-file header fields

| File      | Header field(s)                                                              | Substantive opening                       |
| --------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| `meta-*`  | Full chain: `Origin`, `Design`, `Task List`, plus `PR URL` after integration | (none — meta is structural)               |
| `draft-*` | `**Origin:**` (default `[Internal]`)                                         | `**Purpose:**` follows as document thesis |
| `spec-*`  | `**Origin:**` (default `[Internal]`)                                         | `**Purpose:**` follows as document thesis |
| `tasks-*` | `**Design:**` (the upstream spec artifact)                                   | (no thesis — derived execution surface)   |
| `notes-*` | (none — companion to the entire WU; no formal upstream)                      | (free-form content)                       |

### Bounded duplication and drift cost

Each non-meta artifact carries exactly one 1-hop upstream pointer — no two-hop or full-chain
duplication outside `meta-*`. The pointer values that do appear in more than one place are
structurally immutable:

- `Origin` appears on `meta-*`, `draft-*`, and `spec-*`. The value is set at WU creation and
  effectively never changes.
- `Spec` appears on `meta-*` and `tasks-*`. The `tasks-*` value is fixed at task-list
  creation; `meta-*`'s value transitions exactly once (at activation, from `draft-*` to the
  spec artifact). Both positions are immutable post-set.

Drift risk across the redundant positions is therefore near-zero. `meta-*` retains authority
as the only artifact holding the full chain at any state of the WU lifecycle — reading
`meta-*` alone gives a complete trace from origin to delivered PR.

Non-meta artifacts also remain **self-describing in isolation**: opening any of them cold
tells the reader its immediate authority (`Origin` for plan/prd, `Spec` for tasks) without
first having to consult `meta-*`.

### `Spec` field generalizability

`**Design:**` names the upstream spec artifact regardless of artifact type. The default ARC
pipeline pairs each WU with a PRD (`spec-*.md`) as its spec, but the field name does not lock
to "PRD." Projects may pair WUs with lighter-templated specs — compact PRDs, scope-section
variants, external-tracker-referenced specs — and `**Design:**` still names whichever artifact
carries the spec for that WU.

### `Design` field value semantics

`**Design:**` always points at the work unit's ARC-owned planning artifact, and its value tracks
the lifecycle State:

- **Planning** — `draft-{name}.md`, the pre-spec planning artifact under iteration.
- **Active onward** — `spec-{name}.md`, the formalized spec. The value transitions exactly once,
  at activation (see § Bounded duplication and drift cost).

The `spec-{name}.md` filename is stable regardless of how heavy or light the spec is — a spec's
weight is expressed in its H1 and template, not in its filename — so consumers resolve the
pointer the same way for every work unit.

**Orthogonal to `Origin`.** The two fields answer different questions: `Origin` is *what prompted
the work*, `Design` is *what defines it*. `**Design:**` names an ARC-owned artifact only; an
external tracker (issue, ticket, upstream discussion) belongs in `**Origin:**`, never in
`**Design:**`.

### Purpose statement lives on the spec

The WU's purpose statement is substantive content, not an upstream pointer. It lives once on
the spec artifact (PRD by default) and not on `tasks-*` — duplicating it would carry a prose
field rather than a 1-hop pointer, a substantially larger drift surface than the
effectively-immutable pointer values above. Readers of `tasks-*` reach the purpose statement
via the `**Design:**` pointer.

---

## Archival

WU archival is the file-move ceremony that retires a shipped WU from `active/` to `completed/`.
Archival rides on the integration PR by default (sweep-as-you-go), keeping the WU's entire
lifecycle on one branch through one merge.

### Sweep-as-you-go default

`archive.cadence` in `arc-config.yml` controls when the file-move sweep fires:

- **`with-integration`** (default) — sweep commits ride on the integration PR; the WU's meta
  file and any companions move from `active/` to `completed/<dated>/<NN>_<wu-name>/` as part of the
  same merge that ships the code.
- **`manual`** — sweep fires only on explicit invocation; no automatic ceremony coupling.

Under `with-integration`, the integration PR carries a multi-commit structure: code commits →
completion content (Release Notes Entry + Completion Notes composed into the meta file) → sweep
commits (file moves from `active/` to `completed/<dated>/<NN>_<wu-name>/`). Reviewers focus per-commit.

See [integrate-work-unit.md][integrate-work-unit] and [archive-work-unit.md][archive-work-unit]
for the full ceremony workflows.

### Archive directory shape

```text
.arc/completed/<dated>/
  <NN>_<wu-name>/
    meta-*.md, spec-*.md, tasks-*.md, notes-*.md, ...
  <NN>a_cohort-<cohort-name>/
    cohort-<cohort-name>.md
```

Each shipped WU gets its own subdir directly under the temporal grouping. The `<dated>` segment
follows a `<YYYY-q*>` convention (e.g., `2026-q2/`); the `<NN>` prefix is a 2-digit completion-order
index assigned at archival, reset per `<dated>` subdir (the next index after the highest already
present). It gives a browse-time "by completion order" view — `ls completed/<quarter>/` lists WUs in the
order they shipped, which a plain alphabetical sort would scramble. The subdir contains all WU artifacts
that existed at integration time, symmetric with the backlog's per-WU subdir convention (see
[Planning Module Strategy](strategy-planning-module.md)).

When the archived WU is the final member of its cohort, archival also closes the cohort doc into a lettered
sidecar of that WU's completion-order entry: `<NN>a_cohort-<cohort-name>/cohort-<cohort-name>.md`. This entry is
not a WU and carries no `meta-*` file; it is the historical coordination record for the group. The closeout keeps
`completed/` chronological without retroactively nesting already-shipped WUs under the cohort, and the cohort
doc's `Parent` field preserves nested-cohort context. If one final WU closes multiple cohort levels, additional
cohort closeouts use the same ordinal with subsequent letters (`<NN>b_...`, `<NN>c_...`).

### `Class` and async-merge accommodations

The default is `Class`-uniform and assumes sync merge — the integration PR ships and archival
completes before the WU's branch is reused for other work. `Class`-scaled sweep ceremony
variations (lighter archival for `light` WUs; scaled coordination for `heavy`, larger-scope
WUs) and async-merge accommodations (handoff and cleanup behavior during awaiting-review
latency) are reserved for codification in adjacent strategy work. The default applies uniformly
until those land.

---

## ROADMAP

ROADMAP.md is a rendered artifact derived from `active/**` and `backlog/planned/**` meta files — a
**readiness and dependency view**: what is in flight, what is ready to start, and what is blocked and
on what. It is **not a priority ordering**. Relative importance and what to pick up next are
project-governance and session/PM concerns, not properties derivable from meta-file state; the only
assignment signal the view carries is `**Owner:**`. The meta files are the source of truth for state,
ownership, dependencies, and cohort membership; ROADMAP is a tiered, dependency-ordered projection of
those fields, with each WU rendered by its canonical WU-name.

### Source of truth

`active/meta-<name>.md` and `backlog/planned/**/<wu-name>/meta-<name>.md` carry the
canonical fields ROADMAP renders from:

- `**State:**` — lifecycle phase (`Planning | Active | Integrating | Shipped`); surfaced in the **In Flight**
  tier's **State** column
- `**Owner:**` — single owner (per WU)
- `**Depends On:**` — dependency list (bare WU names; `[none]` if independent)
- `**Cohort:**` — cohort membership (`[none]` for solo WUs)
- `**Priority:**` — attention level for triaging a multi-in-flight worklist (`P1` top focus / `P2` elevated /
  `P3` baseline; `P3` default). Feeds the in-flight views' sort so the worklist is priority-ordered, and renders
  as a column only when the field is present.

**Priority anti-inflation.** A soft cap on concurrent `P1`s keeps "top focus" meaningful — if everything is
top priority, nothing is. This is documentation discipline only: ARC never nags about it and never emits it as a
render-time signal.

Each WU renders under its **canonical WU-name** — the `<wu-name>` token from its directory and
`meta-<wu-name>.md` filename, the same token `**Depends On:**` entries reference. Keying on the
WU-name rather than the meta-file title keeps the render greppable and isomorphic with the source.

ROADMAP's header carries a `Generated from meta files — re-render at ceremony boundaries` note plus
the commit reference of the last regeneration. Edits to ROADMAP without a corresponding meta-file
edit drift from the source of truth and should be avoided.

### Dependency satisfaction by absence

A WU's listed dependency is **satisfied** once its target has shipped — resolved at render time by
the target's **absence** from the `active/` + `backlog/` pipeline (a shipped WU has moved on to
`completed/`). Two consequences follow from resolving satisfaction this way:

- `**Depends On:**` entries are never pruned when a target ships — the target simply stops appearing
  in the scanned set, and the next render reflects it.
- Ceremony workflows never reach into dependents' meta files: a WU shipping flips its dependents from
  Blocked to Ready at the next regen, with no fan-out edits to shared state.

### Derived state

Each meta's `(phase, location)` pair (§ Work Unit State) projects to a single **derived state** — the name a reader or
a tool reaches for instead of reciting the pair. The full projection is `nonexistent` / `provisional` / `planned` /
`planning` / `active` / `integrating` / `parked` / `shipped`, resolved by `arc status <slug>`. The render set
(`active/**` + `backlog/planned/**`) surfaces five of them — it excludes `nonexistent` (no meta), `provisional`
(lives in `backlog/provisional/`, outside the scan), and `shipped` (moved to `completed/`, absent):

- `planning` / `active` / `integrating` — in `active/**` → **In Flight**.
- `planned` — in `backlog/planned/**` at `**State:** Planning` → **Ready** or **Blocked**.
- `parked` — in `backlog/planned/**` at `**State:** Active` → **Parked**. A started WU set down on the ready list:
  its phase is `Active`, its location `planned`.

### Render algorithm

1. Walk `active/**` and `backlog/planned/**` recursively for `meta-*.md` files — the **render set**.
   The recursive glob handles both standalone subdirs (`backlog/planned/<wu-name>/`) and
   cohort-wrapped subdirs (`backlog/planned/<cohort>/<wu-name>/`).
2. Parse `**State:**`, `**Owner:**`, `**Depends On:**`, `**Cohort:**`, and `**Priority:**` from each meta file.
3. Resolve each `**Depends On:**` entry against the `active/` + `backlog/` set (planned and
   provisional): a target still present is unsatisfied; an absent target is satisfied (shipped).
4. Group into four tiers by derived state (§ Derived state):
    - **In Flight** — located in `active/**`, regardless of `State:` (a WU is in flight from the moment it
      lands in `active/`, whether `Planning`, `Active`, or `Integrating`).
    - **Ready** — `planned`-state work (`backlog/planned/**`, `State: Planning`) with no unsatisfied
      dependencies (deps all shipped, or none to begin with).
    - **Blocked** — `planned`-state work with at least one unsatisfied dependency, banded by dependency
      depth (shallowest first) so each WU follows the deps it waits on.
    - **Parked** — `parked`-state work: a started WU (`State: Active`) set down on the ready list in
      `backlog/planned/**`. Held separate from Ready/Blocked (`State: Planning`).
5. Render each tier as a markdown table per the per-table column sets and sort key in § Render standard,
   splitting **Blocked** into one table per depth band (`Depth 1`, `Depth 2`, …). Use an em-dash (`—`) for
   empty cells, and pad columns to shared widths so the raw tables align.
6. Footer note pointing to `backlog/provisional/` for pre-commitment thinking that hasn't been
   sequenced.

### Render standard

The project readiness view and the user-scoped `STATUS.USER` view (below) share one render standard — the
durable contract a renderer or a hand-edit must both satisfy. It governs which columns each table carries and
the order its rows appear in.

**Per-table column sets.** Each table renders only the columns that distinguish its rows — **omit any column
that is constant across that table**:

- **In Flight** — Work unit · State · [Priority] · Owner · Depends on · Cohort
- **Ready** — Work unit · [Priority] · Owner · Cohort (State is constant `Planning`; Depends on is constant `—`)
- **Blocked** — Work unit · [Priority] · Owner · Depends on · Cohort (State is constant `Planning`; Depends on
  names the blocking dep)
- **Parked** — Work unit · [Priority] · Owner · Depends on · Cohort (State is constant `Active`)
- **`STATUS.USER` In Flight** — Work unit · State · Class · [Priority] · Depends on · Cohort (Owner is constant
  `= me`)
- **`STATUS.USER` Ready** — Work unit · Class · [Priority] · Cohort (Owner is constant `= me`; State is constant
  `Planning`; Depends on is constant `—`)

`[Priority]` is itself conditional — rendered only when at least one row in the table carries a `**Priority:**`
value; a table of all-default WUs omits the column. `Class`, by contrast, is **not** conditional in the
`STATUS.USER` tables: it always renders, because its `[TBD]` pre-classification state is itself a value (a
field-absent WU shows an em-dash). The project readiness view omits `Class` — both its widest tables already sit
near the max table width.

**Sort key (uniform).** Rows order by `(priority, cohort, wu-name)` — priority first (`P1` → `P2` → `P3`), then
cohort cluster, then canonical WU-name. A missing `**Priority:**` resolves to `P3`, so an all-default render
reduces to `(cohort, wu-name)`. WU-name is a total-order tiebreak, so identical inputs always produce
byte-identical output — no spurious regeneration diffs. **Blocked** additionally groups into dependency-depth
bands (shallowest first), with the sort key applied within each band.

**Lint exemption.** The rendered tables are exempt from line-length linting (`MD013.tables: false`); padding to
shared column widths is intentional and would otherwise overflow.

**Provenance (outside the stability contract).** Each view carries a freshness marker, and the byte-stability
guarantee above covers only the rendered slice (the tables) as a function of meta-state — the marker is stamped
metadata, outside it. The project readiness view records the commit it rendered against (its inputs are local
meta files). `STATUS.USER` instead records an `Updated:` timestamp: its inputs include remote refs and open PRs,
which a local commit hash would not certify as fresh.

### Regeneration fire-points

ROADMAP regenerates at the events that change its render inputs — not on every meta-file edit. Each
regeneration re-reads current state, so a regen reflects whatever changed since the last one.

**Ceremony-wired** — the lifecycle workflow that owns the transition carries a regenerate-ROADMAP
step, so these need no separate discipline:

- **Initialization** (`backlog/planned/<wu>/` → `active/` relocation, or a fresh meta scaffolded
  directly into `active/`) — the WU lands in `active/` and enters In Flight.
- **Activation** (in-place `State: Planning → Active` + branch rename; no directory move) — the WU is
  already In Flight from initialization, so tier membership doesn't change; the regen self-heals any render
  drift since the last one.
- **Integration / archive** (`active/` → `completed/<dated>/<wu>/`, `State: Integrating →
  Shipped`) — drops the WU from the render set; by the same absence its dependents re-evaluate from
  Blocked to Ready, with no edits to their meta files.
- **Deactivation** (`active/` abandoned) — drops the WU from the render set.
- **Decomposition** (`active/` → a cohort of `backlog/planned/<cohort>/<member>/` stubs, the origin meta
  retired) — drops the origin from In Flight and lands its members in the backlog render set.
- **Park / resume** (`active/` ↔ `backlog/planned/`, `State: Active` preserved) — park moves the WU from In
  Flight into Parked; resume returns it to In Flight.

Because each re-renders from current state, these ceremonies also **self-heal** any manual trigger
missed since the previous one.

**Manual discipline** — these change a render input but have no ceremony workflow to carry the step,
so re-render by hand (per § Render algorithm) when you make the change:

- **Backlog membership** — promotion (`backlog/provisional/<wu>/` → `backlog/planned/<wu>/`) adds a
  WU to the render; demotion (the reverse) and creating a stub directly in `backlog/planned/` likewise
  change the render set.
- **Render-field edits** on a planned or active meta — a `**Depends On:**` change re-tiers the WU
  between Ready and Blocked; `**Owner:**`, `**Cohort:**`, and `**Priority:**` changes alter the owner
  column, within-tier grouping, and sort order. These are ordinary file edits, not ceremonies, so
  nothing else prompts the re-render.

A skipped manual re-render is bounded, not permanent: the next ceremony-wired regeneration sweeps the
ROADMAP back into agreement with meta-file state.

### `STATUS.USER` view

`STATUS.USER` is a **user-scoped** rendering of the same source as the project readiness view — a filtered mode,
not a second generator. It scopes to the two slices that drive *your* balance decision — what is on your plate,
and what fits alongside it: the work units **in flight** for you (wherever they live), and the **ready** work you
could start next (owned by you, unblocked). In-flight is location-based — a WU in `active/**` (equivalently, an
unmerged WU branch on the remote) is in flight — so the in-flight slice surfaces actively-*planned* WUs, not only
executing ones; the ready slice is your `backlog/planned/**` work whose dependencies have all shipped. Each row is
sized by `Class` so the balance reads at a glance. Everything else stays in the project view.

**Location and storage.** The file lives at `.arc/user/{identity}/STATUS.USER.md` — gitignored, per-machine. It
does **not** sync: every machine regenerates it identically from remote refs (and open PRs), so it is an optional
local cache, never transported content. There is no separate persisted cache — **the rendered file is the
cache**. Opening it never regenerates it (the passive path: instant, no network read); it is trustworthy when
opened because the last relevant trigger refreshed it.

**Columns and sort.** Per § Render standard — the two `STATUS.USER` column sets (In Flight and Ready; Owner
omitted, constant `= me`; `Class` always rendered) and the shared `(priority, cohort, wu-name)` sort key. Each
table shares the project view's tier ordering, filtered rather than re-sorted.

**Rendered shape.** The file opens with an H1 — `Status (User): {identity}` — and a standing header note (a
generated, gitignored-local cache refreshed at the triggers below; the single-cache / passive-open invariant
above). The In Flight table follows, then the Ready table. An `Updated:` provenance footer closes the file. The
seeded `.arc/user/{identity}/STATUS.USER.md` is the canonical worked example a hand-render and the render core
both reproduce.

**Regeneration triggers.** The in-flight content has two slices with different refresh costs; the ready slice is
a third, purely-local input that needs no network:

- **Local in-flight slice** — your WUs in flight on *this* machine (the identity-filtered roster). It regenerates
  cheaply, with no network read, at every local ceremony: spawn, activate, integrate, shift, and handoff.
- **Cross-machine in-flight slice** — your WUs in flight only *elsewhere* (remote-only, no local worktree).
  Surfacing these needs a network round-trip, so it refreshes only at the subset of triggers where cross-machine
  truth matters: handoff, an explicit `arc sync`, an explicit view request (`arc status --user`), and a session
  start with no local active WU. Each network read is bounded by a short timeout and degrades to the last-rendered
  file when the remote is unreachable.
- **Ready slice** — your owned, unblocked `backlog/planned/**` work. It reads only local metas, so it is always
  available: it refreshes at every trigger and never degrades when the remote is unreachable. When the in-flight
  half degrades to cache, the ready half stays fresh.

**Explicit view request.** `arc status --user` is an active re-render request, not a passive file-open: it
refreshes the local in-flight slice always and the cross-machine slice via the bounded network read, then renders
the in-flight slice merged with the always-local ready slice. A `--local` / `--no-fetch` flag skips the network
read for a fast offline view; the ready slice is unaffected.

**Hand-maintenance procedure.** Refresh the file by hand at the triggers above:

1. Derive your in-flight-mine slice — the render set located in `active/**`, identity-filtered to your WUs. For a
   cross-machine refresh, also include your remote-only in-flight WUs (a WU branch unmerged on the remote with no
   local worktree).
2. Derive your ready slice — `backlog/planned/**` metas owned by you whose dependencies have all shipped (absent
   from the active + planned + provisional pipeline), each sized by `Class`.
3. Apply the `STATUS.USER` column sets and the `(priority, cohort, wu-name)` sort key from § Render standard.
4. Write `.arc/user/{identity}/STATUS.USER.md` — the In Flight and Ready tables, plus the standing header note and
   `Updated:` footer described above. Because the sort is a total order, the rendered slices match the eventual
   automated render byte-for-byte; the `Updated:` stamp is the only part that varies.

---

## Discovered Work During a WU

Unplanned work that surfaces during a WU — inline fixes, atomic tasks, larger out-of-WU concerns —
routes per [DEV-RULES.ARC][dev-rules-arc] § Discovered Work Routing (inline / errand / capture). The
concern-identity (not file-identity) anti-rider test and the cheapness of deferring a capture to
`USER-INBOX` both live there; see [§ Auto-Merge Lane](#auto-merge-lane) below for how a housekeep
drain packages the resulting PRs.

---

## Branch Protection Modes

ARC defines two branch protection modes configured in `.arc/system/arc-config.yml`
(`branch.protection` setting).

Protection mode governs the **ship layer** — how a change reaches the base branch (through a branch and PR, or by a
direct commit) — never the **record**. A WU's `(phase, location)` state (§ Work Unit State) and its `meta-{name}.md`
are identical under either mode: the meta is minted at `init` regardless, and the lifecycle runs the same states and
transitions. Protection shapes only how the work *ships*, not what the work *is*.

### Mode Summary

| Mode                              | Planned Work      | Atomic Tasks / Backlog | Direct Base Branch Commits |
| --------------------------------- | ----------------- | ---------------------- | -------------------------- |
| **Partially protected** (default) | Branches required | Commit directly        | Documented exceptions only |
| **Fully protected**               | Branches required | Micro-branches         | Not allowed                |

### Partially Protected (Default)

Planned work units require a branch from inception (single-branch-per-WU per
[§ Branching](#branching)) — "from inception" governs the **tracked** work unit, the one carrying a
`meta-{name}.md`. Pre-formalization design exploration — a `draft-*` or a spec drafted on the base
branch before a work unit is initialized — is sanctioned under partial protection: it runs without a
planning branch, cut when the work formalizes into a tracked WU. Its lack of a `meta-{name}.md` is
**temporal, not a protection trait** — the meta is minted at `init` under either mode; partial protection
shapes only the ship layer (branch/PR), never the record. Routine commits
may go directly to the base branch as documented exceptions:

- Framework maintenance: documentation updates, linting fixes
- Off-work-unit maintenance commits (no associated task list or work-unit branch)

### Fully Protected

All changes require branches and PR review. No direct base branch commits.

---

## Auto-Merge Lane

Under full protection every change ships through a branch and PR — including the planning-path Errands that
groom `backlog/` and `active/` artifacts. Most of that grooming is low-risk and high-frequency, so the
mandatory merge-wait is pure friction. The auto-merge lane removes it for a classified set of low-risk paths
while holding every higher-stakes change in the reviewed lane. It is meaningful only under
`branch.protection: full`; under partial protection a planning-path Errand is already a direct base-branch
commit with no merge-wait (see [§ Branch Protection Modes](#branch-protection-modes)).

ARC owns the **classification and a recommended recipe, not enforcement** — the host (GitHub branch
protection, GitLab merge-request approvals, …) applies the gate. The classification is host-agnostic; a
concrete GitHub-flavored recipe ships in [`reference/templates/arc/merge-gate/`][merge-gate-templates].

### Path classification

Two lanes, by what the PR touches — classified by artifact **prefix**, not by directory:

- **Auto-merge lane** — per-WU and per-cohort planning grooming: the movable artifacts `draft-*`, `tasks-*`,
  `meta-*`, `notes-*`, and the `cohort-*` coordination record, under `active/` or `backlog/`. Single-increment
  grooming with no design authority. Merges automatically once required checks pass; no human review required.
- **Reviewed lane** — everything else. Explicitly: **design-authority** artifacts (`spec-*`, `prd-*`); the
  **constitutional** surfaces — rules (`DEV-RULES.*`), ADRs (`reference/adr/**`), strategies
  (`reference/strategies/**`); the **derived or shared project surfaces** — `ROADMAP` (rendered from metas, so a
  hand-edit must not silently diverge from its source) and the shared backlog inboxes (a hand-edit to one
  is reviewed; the between-WUs drain's own disciplined flush is the carve-out below); and all code. Always
  requires owner review before merge.

A PR that touches any reviewed-lane path is reviewed-lane as a whole — the lanes never split a single PR. Keep
grooming PRs path-pure to stay on the auto-merge lane.

The lane classifies by **content type, not concurrency**: it decides whether a change needs a human to read it,
not whether two branches edit the same artifact at once. Concurrent edits to a shared record — a multi-owner
coordination doc, say — are a separate axis; gate those with the project's concurrent-work discipline, not this
lane.

**Orthogonal to the wrapper.** This lane is a **blast-radius** axis — durable surfaces (code, rules, strategies,
methods, workflows) vs. movable planning artifacts (`draft-*`, `meta-*`, `tasks-*`, stubs, buffers, `ROADMAP`, the
inboxes) — entirely **independent of the Errand-vs-WU wrapper** ([§ Class Model](#class-model) boundary test #1).
The wrapper gate (spec-worthiness) does not carry review eligibility; the two axes cross. A determinate dev-rule
correction is an *Errand* (below both intrinsic floors) that nonetheless **rides the reviewed lane** because it
touches a constitutional surface; a `tasks-*` grooming pass is auto-merge-lane whether it is an Errand or a WU's
own planning increment. Under partial protection there is no review lane for Errands at all — the axis is a
full-protection concern (see [§ Branch Protection Modes](#branch-protection-modes)).

### The housekeep drain

A between-WUs `arc-housekeep` drain flushes captured work to its homes — routing inbox entries to their stubs,
scaffolding provisional stubs, flushing homeless items to the shared inbox. Under full protection each such
write ships as a PR, so the drain follows a packaging discipline.

The drain is **gated and phased** — it classifies with no writes, **stops at a confirmation interlock** for the
full routing plan, then routes — so the packaging below is decided against a confirmed plan, never mid-write. It
closes on **no un-triaged entries**: every entry routed, dismissed, flushed, dispatched as an errand, or
explicitly *retained* (a per-entry escape-hatch, never the default). The phased steps live in `drain-inbox.md`.

**One PR per lane.** A drain produces *one PR per lane* — not one per sweep, nor one per destination; lanes
never mix in a single PR. What bounds a PR is *concern-coherence*, not file or destination count. A
planning-artifact routing sweep is one coherent concern — "route these entries to their homes," certifiable by
a reviewer of uniform competence — so it batches into one auto-merge PR. A code-execution errand is one concern
and takes its own PR (1:1; "one concern" may still span many files). Distinct concerns never share a PR: two
that happen to touch the same file are still two PRs, sequenced (rebase the second on the first), not merged —
batching them to dodge a rebase is the rider anti-pattern. This is the concern-identity-not-file-identity rule
of [DEV-RULES.ARC][dev-rules-arc] § Discovered Work Routing applied to packaging; see it for the rule itself. A freshly
scaffolded *provisional* stub auto-merges — it is `meta-*`/`draft-*` under `backlog/` with no design authority.
When a routing sweep is large enough that one auto-merge PR would exceed a reviewer's reach, chunk it by
concern-coherence into multiple same-lane PRs — the chunk plan surfaced at the drain's confirmation interlock.
Under partial protection, where routing writes are direct base commits rather than PRs, chunking degrades to
coherent commit boundaries.

**The review threshold.** The prefix split above is the fast path; the principle beneath it is a four-condition
threshold. A planning-artifact change needs review iff it (1) touches a **foreign owner's** artifact, in any
state; (2) carries **design authority** (`spec-*`/`prd-*`); (3) hits a **constitutional** surface (rules, ADRs,
strategies); or (4) is an **unverifiable hand-edit of a derived surface**. Otherwise it auto-merges. Conditions
2–4 are why the reviewed-lane prefixes are what they are; condition 1 is the one a prefix can't see — a `draft-*`
or `tasks-*` that would auto-merge by prefix is reviewed-lane when its owner is not the author. Condition 4 is a
*sunset* trigger: a hand-edit of a rendered surface (`ROADMAP`, and any other source-derived doc) is
unverifiable only while that surface is hand-maintained; once a renderer produces it with a verify-against-source
check, the derivation is verifiable and the change auto-merges. The same sunset applies to every derived surface
as its renderer lands.

**Carve-out.** The drain's own mechanical writes — flushing homeless items to the shared inbox, and a
disciplined `ROADMAP` regen — auto-merge despite touching shared or derived surfaces: they trip none of the four
conditions (no foreign owner, no design authority, not constitutional; the ceremony's own discipline and a
regen-matches-source check stand in for condition 4).

**Foreign edits beyond the in-flight gate.** Condition 1 classifies a foreign-owned artifact as reviewed in any
state, but the mechanism below catches a foreign edit only while its PR is *in flight* — the code-owners gate and
the advisory bot both key on an open PR. Gating a *dormant* foreign edit — one already merged, or written
directly to the base branch — is a stewardship question for the project's concurrent-work discipline, not this
lane: whether it warrants a hard gate or only a notification, and at what granularity, is settled there.

### The mechanism (host-agnostic)

Three conditions compose the lane on any host:

1. A **stable required status check present on every PR** — call it `merge-ok`. It runs unconditionally, so
   branch protection always has a check to wait on. This is why the recipe uses a conditional status job and
   **not** a path-ignored CI workflow: a required check that is path-filtered away never reports, stays
   *Pending*, and blocks the merge indefinitely.
2. **Owner review required for reviewed-lane paths only** — a code-owners mapping that names owners for the
   constitutional surfaces and leaves auto-merge-lane paths unowned, so only reviewed-lane PRs require approval.
3. **Native auto-merge enabled** — the PR merges itself the moment its required conditions are satisfied
   (checks green, plus owner review where the lane demands it).

On an auto-merge-lane PR, condition 1 reports green and condition 2 demands nothing, so it merges unattended;
a reviewed-lane PR additionally waits on owner approval. Hosts without these primitives fall back to the
classification as doctrine plus manual review discipline.

**Solo repositories.** Condition 2 is a two-party primitive — a sole maintainer cannot approve their own PR, so
requiring code-owner review would block every reviewed-lane PR. A solo repo instead requires only the stable
check (condition 1) plus pull requests, and enforces the reviewed lane by *not* arming auto-merge on those PRs
— a deliberate manual merge rather than a review gate. CODEOWNERS still documents the boundary and becomes a
live gate the moment a second contributor can review. An agent code-review bot (CodeRabbit, etc.) composes as
an advisory reviewer on the reviewed lane — keep its check non-required so it doesn't gate the auto-merge lane;
for a solo maintainer it stands in for the missing second pair of eyes.

---

## Errand Work Class

ARC defines two work classes that share commit and review machinery but differ in tracking and lifecycle:

- **Work Unit (WU)** — a bounded chunk of design-bearing or trackable work with its own branch, a
  `meta-{name}.md`, a lifecycle (Planning → Active → Integrating → Shipped), and one PR. Activated via the
  planning entry point (spawn or cold-start; see [§ Branching](#branching)).
- **Errand** — a single self-evident concern below the WU wrapper, **below floor on both intrinsic `Class` axes**
  (nothing worth recording as design, no durable plan a correct execution must navigate — neither a substantial
  grounding surface nor cross-session tracking) and validated by intent + diff + review. **Atomic in character** —
  one indivisible concern bounded to a single session; *typically* one review increment, though a determinate sweep
  may stage into a bounded few **in-session** review passes (the *extended errand*) and stays an Errand, however
  many commits it lands in. No meta, no lifecycle, no name as a WU. Tracked by git history (Conventional Commits +
  the `standalone (...)` context footer — see [`commit-footer`][commit-footer-method]), not by the planning layer
  (ROADMAP, backlog, `active/`).

### Two layers — one character, a mode-scaled mechanism

An Errand is one **work character** (off-WU, a single self-evident concern below the wrapper) whose **mechanism is
a mode-scaled projection** of `branch.protection`:

- **Character layer (universal).** The Errand-vs-WU gate — spec-worthiness ([§ Class Model](#class-model) boundary
  test #1) — is the same judgment in every protection mode, learned once.
- **Mechanism layer (mode-scaled).** *Partial — the floor:* a direct base commit tracked by its `standalone (...)`
  context footer; commit-then-done, no branch, no lifecycle. *Full — the lattice:* a short-lived branch + PR with a
  derived lifecycle (see [§ Cheap-branch path](#cheap-branch-path)).

The collapse to a near-zero mechanism under partial protection is the *correct* treatment, and the guardrail is
one-directional: no part of the full-protection apparatus is pushed down onto the partial floor for model symmetry.
What a partial-protection user shares is the **vocabulary** and the light `run-errand` entry (correct footer,
review-increment discipline) — not the apparatus.

### Decision matrix

Incidental work you have **committed to do yourself, soon** routes through this matrix, which selects its
path. Work you are not committing to now is an inbox capture — triaged at a later ceremony, never routed here
directly (the commitment boundary that gates entry to this matrix lives in [DEV-RULES.ARC][dev-rules-arc]
§ Discovered Work Routing). A third case sits outside the matrix entirely: work your **own work unit's spec
already claims** — a coordination write-back it scoped in — is WU scope and rides the WU's PR, never an Errand;
the matrix governs *incidental* cross-cutting work only. For that incidental case, two axes govern the choice:
**create vs. maintain** decides whether the work needs the Work-Unit wrapper at all; **self-contained vs.
cross-cutting** decides how an Errand routes once it does not.

| Once committed to act ↓                        | **Self-contained** (own scope) | **Cross-cutting** (foreign-owned artifact)         |
| ---------------------------------------------- | ------------------------------ | -------------------------------------------------- |
| **Create** — a new tracked unit of future work | Work Unit                      | Work Unit                                          |
| **Maintain** — an existing artifact            | Errand · cheap-branch path     | Errand · advisory gate when the owner is in flight |

Create resolves to a Work Unit in both columns: minting a tracked deliverable is itself what trips the
threshold, so the routing axis only bites for **maintain**. A create that also touches a foreign artifact is
two concerns — mint the Work Unit, and route the foreign edit as its own maintain Errand.

**Create vs. maintain — the Work-Unit/Errand axis.** *Creating* a new tracked unit of future work — a backlog
stub — is a (small) Work Unit even at one commit, because its output is a tracked deliverable with a meta file
and a roadmap slot. *Maintaining* an existing artifact — a dependency note, a cross-reference, a doc fix — is
an Errand. The split operationalizes the general Work-Unit threshold: promote to a Work Unit when the work is
**spec-worthy** — *any* of these hold —

1. it clears the **scale floor** — a correct plan must navigate a *substantial* codebase-grounding pass, beyond
   the routine floor (spec-worthy by grounding demand);
2. it carries **design that must be authored and referenced** (a Spec — the derivation floor);
3. it must be **tracked or resumed** as future or owned work (a roadmap slot, dependencies, an owner, a
   cross-session lifecycle).

None of these → it is an Errand, *however many commits it spans* — and, when determinate, however many in-session
review passes it is staged into. Create trips criterion 3; a maintain edit that turns out to clear a floor —
substantial grounding, authored design, or a need for cross-session tracking — trips 1, 2, or 3 and likewise
promotes, but spanning multiple commits or staging review into a few in-session passes never does on its own. As an
empirical *symptom* check — not the primary criterion — a candidate too large to review in one window
(~400 lines / ~60 minutes) is either an **extended errand** (determinate, reviewed in a bounded few in-session
passes) or hides authored design / a substantial grounding surface / a need for cross-session tracking — re-examine
it against floors 1–3 to tell which.

**Self-contained vs. cross-cutting — the Errand-routing axis.** This axis applies once the work resolves to an
Errand. A **self-contained** Errand touches only artifacts in your own scope and takes the cheap-branch path
below. A **cross-cutting** Errand targets an artifact owned by another work unit; when that work unit is **in
flight**, the edit is advisory-gated — coordinate with it, or sequence the Errand after it integrates, rather
than editing the shared artifact in parallel (parallel edits on an in-flight artifact plant a latent
cross-branch conflict). The check is **advisory and judgment-based** — it records a caveat, never a hard
block; when no in-flight work unit owns the target, the Errand proceeds unchanged.

**Coordination write-backs ride; incidental foreign edits route.** A cross-cutting edit that your *own* work
unit's spec scoped in — propagating a decision you are shipping into the downstream artifact it shifts — is a
*coordination write-back*: it rides your WU's PR, not this matrix. It qualifies on three counts: it is (1)
scoped into your WU's spec, (2) a mechanical propagation of *your* decision, and (3) recorded into the foreign
artifact's own record-of-record. It *routes* instead — Errand or capture — when it is an unrelated fix that
merely shares a file (the rider anti-pattern) or requires *foreign design authoring*, a decision that belongs to
the downstream work unit. This is the same concern-identity-not-file-identity test as the anti-rider rule
([DEV-RULES.ARC][dev-rules-arc] § Discovered Work Routing), here deciding WU-scope-vs-route rather than
inline-vs-defer. Gating a *dormant* foreign edit more broadly is the project's concurrent-work discipline's
concern, not this matrix's.

### Cheap-branch path

The cheap-branch mechanism lands an Errand without WU machinery. Behavior depends on protection mode (see
[§ Branch Protection Modes](#branch-protection-modes)):

- **Partially protected:** an Errand commits directly to the base branch (the documented off-WU-maintenance
  path).
- **Fully protected:** an Errand uses a short-lived ephemeral branch with a `chore`-type prefix (per
  [`branch-format`][branch-format-method]) plus a PR. The branch exists only long enough for review and
  merge, then is torn down. It is not a planning branch, carries no meta, and never enters lifecycle.

Either way, the work is tracked by its commit's `standalone (...)` context footer (vocabulary:
`maintenance | planning | documentation | refactor`; see [`commit-footer`][commit-footer-method]) rather than
by an `active/` entry.

### The cut→occupy invariant

Cutting a `chore/<slug>` branch and *occupying* it are **separate mechanics with a strict ordering** — the branch is
cut off the base, then occupied per protection mode (an ephemeral worktree under full protection, an in-place switch
otherwise). The invariant: **a cut is never left un-occupied.** A branch cut without an immediate occupy strands the
caller on its launch branch, writing the Errand's commits to the wrong place.

`arc errand open` is the sole errand entry verb, and it **composes** the two — the internal cut mechanic
(`cutErrandBranch`) followed by the occupy — in a single step, so the invariant holds by construction. There is no
standalone cut command: exposing the cut half alone would let a caller create the branch and forget to occupy it,
the exact failure the invariant forbids. Any internal site that cuts a branch carries the same obligation — cut,
then immediately occupy.

### Entry path

An Errand runs through the `run-errand` workflow, dispatched by `arc-session` (via `--errand`, or surfaced at
between-WU orientation). It launches from **any worktree**: the workflow's Launch phase resolves the base branch
and relocates the execution locus itself onto the cheap-branch path (see
[§ Cheap-branch path](#cheap-branch-path)), so the caller need not pre-switch worktrees. It does not invoke
planning entry — spawn and cold-start scaffold meta files and lifecycles, which an Errand has neither of. The
Errand mints no `active/` artifact and produces no orientation surface; it ships, is recorded by git history
through its commit footer, and tears down.

---

## Directory Structure

### Active Work

```text
.arc/active/
  meta-<name>.md         # WU metadata + state (always present)
  spec-<name>.md         # formalized spec artifact (PRD or RFC form by category)
  tasks-<name>.md        # execution spec (when WU has a task list)
  notes-<name>.md        # working context (optional; may carry content graduated from draft-*)
```

`active/` is flat — per-worktree isolation (see [§ Per-Worktree Isolation](#per-worktree-isolation))
means each worktree's `active/` carries one WU's artifacts at a time, so per-WU and per-category
subdirs would be redundant — concurrency comes from more worktrees, not more metas in one `active/`.
Artifact applicability scales with mode and `Class`; see
[§ Spec-Flow Invariants](#spec-flow-invariants) for the invariants and scaling axes. `draft-*.md` is
the pre-PRD synthesis artifact, deleted at PRD creation per `create-spec.md` (with optional
graduation of substantive persisting content into `notes-*.md`); it never appears in `active/`.
Archive-phase content (Release Notes Entry, Completion Notes, PR URL, Completed date) composes into
the meta file at integration — there is no separate `completion-<name>.md` artifact.

### Alignment

Branch name and completed subdirectory share the WU identifier:

- Branch `feat/api-modernization` → completed in `.arc/completed/<dated>/api-modernization/`

---

## Team Coordination

See [Team Coordination Strategy][team-coordination] — ownership, interlock-release coordination,
cross-WU planning dependencies, and external tracker integration.

---

## Planning Module

See [Planning Module Strategy](strategy-planning-module.md) **(arc-in-git)** — what arc-in-git
installs, routing and promotion flow, inbox routing, and scaling guidance.

---

[team-coordination]: strategy-team-coordination.md
[concurrent-work]: strategy-concurrent-work.md
[init-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/planning/init-work-unit.md
[promote-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/promote-work-unit.md
[classify-work-unit]: ../../../system/methods/classify-work-unit.md
[activate-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/activate-work-unit.md
[integrate-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[archive-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
[branch-format-method]: ../../../system/methods/branch-format.md
[commit-footer-method]: ../../../system/methods/commit-footer.md
[commit-format-method]: ../../../system/methods/commit-format.md
[cb-spec]: https://conventional-branch.github.io/
[merge-gate-templates]: ../../templates/arc/merge-gate/README.md
