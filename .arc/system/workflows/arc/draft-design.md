---
purpose: >-
  Shape the design draft — the first authoring stage — resolving planning depth and the work unit's Class before
  spec creation.
audience: collaborative (human and agent)
arc:
  methods:
    - resolve-planning-depth
    - classify-work-unit
    - assess-cohort-fit
---

# Workflow: Draft Design

The first authoring stage — peer to [create-spec](create-spec.md) and [generate-tasks](generate-tasks.md).
It shapes the design before a spec crystallizes it: surface the problem, work the alternatives, and settle the
direction, producing a `draft-*` of the right richness — or, when the design is already determinate, no draft at
all. The `arc-plan` skill dispatches into this workflow.

This stage reads the **derivation** axis: how much design must be authored before a competent engineer can
start.

**Branch context:** Under full protection (`branch.protection: full`), drafting runs on a planning branch with a
Planning-state `meta-{name}.md` present. Under partial protection (the default), it may run on the base branch,
and no meta file may exist yet.

---

## Resolve depth & Class

Make **one derivation-axis read** — the problem framing / origin plus a quick compose-vs-invent scan — then run
[`resolve-planning-depth`][resolve-planning-depth] and [`classify-work-unit`][classify-work-unit] off it: one
read drives both, yielding this stage's **level** (`low` / `medium` / `high`) and confirming-or-ratcheting
**`Class`**, born here at its first touchpoint. The methods own how the read maps to a level, and the mid-stage
re-entry valve.

Off the same read, run [`assess-cohort-fit`][assess-cohort-fit] — the cheap **upper-bound** confirm paired with
`classify-work-unit`'s lower-bound one: is this one work unit, or has the design surfaced orthogonal subsystems
that want decomposing into a cohort? It is **maturity-gated**, so while the design is still forming it clears
trivially — hold as one unit and iterate. It fires affirmative only once the design is stable enough that the
cuts are real (the **predicted-decomposition** arm, where you author directly into the cohort structure rather
than a monolith); re-confirm cheaply as the draft matures across passes.

The resolved level selects this stage's path below — the stage default, re-selectable, never below the
derivation floor.

## Draft in the resolved level

Each level maps to a path — the drafting procedure at that depth. Run the one the entry read selected; if a path
surfaces heavier derivation than the read assumed, step up.

### `low` — quick determinacy-confirm (no draft artifact)

The design is determinate; there is nothing to derive. Confirm that directly: state the intent, the scope
boundary, and the one falsifiable signal that says it worked. No `draft-*` is produced — carry the confirmation
to create-spec. If the confirm surfaces unexpected open design, step up.

### `medium` — bounded draft

A bounded set of open decisions to settle — a design composed from existing patterns, not one that must be
invented. Read an existing `draft-*` first if present, then gather context only for the specific gaps and
assumptions in question — targeted, not broad. Author `draft-{name}.md` from [template-draft.md][template-draft]
and work it to settled: problem / motivation, the alternatives and the leaning decision, unknowns and
assumptions, scope. A round or two of refinement is fine — what marks this level is a _bounded_ design space,
not a pass count. Step up when the space proves open-ended: exploration or invention rather than composition.

### `high` — iterative shaping (evolving draft)

An open-ended or substantial design must be authored. Shape it as an evolving `draft-*`, looping until it
reaches **formalization-ready** — at the depth this design demands (the readiness states below).

**Novel overlay** (`Class == Novel`, advisory). When the invent-vs-compose read lands `novel`, open the `high`
path with a **free-form, self-sequencing orient-then-research sub-phase** — never a preemptive research dump.
**Orient first:** establish what is known and unknown and where the compose-vs-invent boundary actually falls;
the research to do emerges from that orientation, not from a fixed checklist. Its output populates the rich
`draft-*`'s discovery / research / alternatives sections (optional scaffolding) — no separate artifact. A
recommendation, not a gate: accept, decline, or right-size it; the iterative shaping loop below then runs as
usual.

1. **Start.** If a `draft-*` already exists (a prior idea or session), read it as the continuity artifact — do
   not rediscover from scratch. Otherwise start from the problem framing.
2. **Gather context** as the design needs it; note relevance and skip what doesn't apply: project direction
   (where this fits against `ROADMAP.md`); related prior work (active and archived work units touching this area
   — decisions made, what was deferred); captured ideas (backlog or inbox entries, other drafts); design context
   (ADRs and project strategies that constrain the approach); codebase state (modules and patterns the work
   would touch).
3. **Facilitate.** Surface ambiguity, assumptions, alternatives, risks, and scope boundaries — and follow the
   ambiguity rather than force a sequence: when something is underspecified or contradictory, work it through
   before moving on. Prompt material, not a questionnaire: problem and motivation; success and boundaries;
   alternatives and why; assumptions and unknowns; risks and dependencies; the minimum viable version. The
   developer formulates _with_ the agent; the agent does not produce a finished design for sign-off.
4. **Re-synthesize** into the draft each pass, and record continuity so the next session resumes without
   re-deriving: the draft's **readiness state** (below), what is **Resolved**, the **Open** items (masked design
   decisions, unvalidated assumptions, soft scope boundaries), and the **Next** move. This matters most for
   multi-session work — common at `Class: Novel`.
5. **Amend** the draft as each open decision settles, and loop until formalization-ready.

**Readiness states — one bar, depth-relative distance.** The draft moves through a progression toward the
formalization-ready gate:

- **fresh** — no `draft-*` yet; the idea is still being shaped.
- **rough** — a `draft-*` exists but carries significant gaps or unresolved direction.
- **maturing** — scope is known; the open items are detail-design, not fundamentals.
- **formalization-ready** — exploration is stable and every settle-able decision is settled; a suitable input
  for create-spec.

The formalization-ready bar is the same at every level — _is all settle-able design settled, and can I state how
I'll know it worked?_ — reached faster at `low` / `medium`, crossed over more passes at `high`. It always means
ready _at the depth this design demanded_, never a lower bar.

**Coherence-consolidation (`high`-only, suggest-not-enforce).** A draft that iterates across many sessions
accretes superseded sketch beside current design — the design can be settled while the document is not yet a
single coherent input. Amend each pass (above), then reconcile the accreted layers with a holistic rewrite.
Three leans, never hard gates:

- **Consolidate before formalization-ready.** Reconcile the accreted layers into one coherent input before the
  draft crosses into create-spec.
- **Interim softcap.** When accretion makes the draft costly to _resume against_ mid-loop — each session
  re-parsing a pile of separate amendments to continue — suggest an integrating rewrite _before_ everything is
  settled, so derivation runs against a clean artifact rather than a growing pile.
- **No detail loss.** Every consolidation, interim or final, preserves each settled decision and surviving
  detail; self-check the rewrite against the pre-rewrite layers. A coherence rewrite must not silently drop
  substance.

A single-sitting draft is coherent by construction and clears all three criteria at once; they bite only when
accretion is real.

## Capture the draft

> [!IMPORTANT]
> `workflow-interlock`: Stop when the draft (or determinacy confirmation) is ready. Surface it for review; await
> approval before persisting `Class` and committing the capture.

**Re-entry valve (the loop's floor-raising back-edge):** if review surfaces that the design runs deeper than the
resolved level authored, re-enter `draft-design` higher — the derivation headwater re-enters itself only — per
[resolve-planning-depth][resolve-planning-depth] § Mid-stage re-entry: capture, ratchet, re-enter rather than
ship a too-thin draft.

On approval, capture what the level produced and persist the resolved `Class` to the meta. The `Class` decision
is live from the entry read — it drove this stage's depth immediately — but its `**Class:**` write lands here,
at the draft-capture ceremony commit.

What is staged sets the commit shape: a `medium` / `high` path bundles the `draft-*` with the meta `Class`
write; a `low` path that produced no draft writes only the meta, landing as a dedicated `chore(arc):` commit
(see [DEV-RULES.ARC][dev-rules-arc] § Meta-file commit shape).

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): capture draft for {name}

Context: meta-{name}.md (draft-design)
```

---

## Next Step

Run [create-spec](create-spec.md) — it re-reads the derivation axis at its own entry, with the draft (or the
determinacy confirmation) as its richest evidence. The draft's _shape_ carries forward, not a depth value: the
planning-depth level is never recorded.

---

[resolve-planning-depth]: ../../methods/resolve-planning-depth.md
[classify-work-unit]: ../../methods/classify-work-unit.md
[assess-cohort-fit]: ../../methods/assess-cohort-fit.md
[template-draft]: ../../../reference/templates/arc/work-unit/template-draft.md
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
