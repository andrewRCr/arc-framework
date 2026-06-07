---
purpose: Shape the design draft — the first authoring stage — resolving planning depth and the work unit's Class before spec creation.
audience: collaborative (human and agent)
arc:
  methods:
    - resolve-planning-depth
    - classify-work-unit
---

# Workflow: Draft Design

The first authoring stage — peer to [create-spec](1_create-spec.md) and
[generate-tasks](2_generate-tasks.md). It shapes the design before a spec crystallizes it: surface the problem,
work the alternatives, and settle the direction, producing a `draft-*` of the right richness — or, when the
design is already determinate, no draft at all. The `arc-plan` skill dispatches into this workflow.

This stage reads the **derivation** axis: how much design must be authored before a competent engineer can
start.

**Branch context:** Under full protection (`branch.protection: full`), drafting runs on a planning branch with a
Planning-state `meta-{name}.md` present. Under partial protection (the default), it may run on the base branch,
and no meta file may exist yet.

---

## Step 1: Resolve planning depth (one derivation read)

Make **one evidence read** on the derivation axis — the problem framing / origin plus a quick compose-vs-invent
scan. That single read drives both methods:

- `resolve-planning-depth` yields the **level** — `low` / `medium` / `high`. Which evidence reads which level is
  the method's to define; this stage initiates it on the derivation axis and consumes the result.
- [`classify-work-unit`][classify-work-unit] confirms-or-ratchets the work unit's **`Class`** — born here, as
  this is its first touchpoint.

The resolved level selects this stage's path below. It is the stage default — re-selectable, never set below the
derivation floor.

## Step 2: Draft in the resolved level

Each level maps to a path — the drafting procedure at that depth. Run the one Step 1 selected; if a path
surfaces heavier derivation than the read assumed, step up.

### `low` — quick determinacy-confirm (no draft)

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

An open-ended or substantial design must be authored. Shape it as an evolving `draft-*`, looping until it is
formalization-ready — settled at the chosen depth.

1. **Start.** If a `draft-*` already exists (a prior idea or session), read it as the continuity artifact — do
   not rediscover from scratch. Otherwise start from the problem framing.
2. **Gather context** as the design needs it; summarize relevance and skip what does not apply: project
   direction (where this fits against the roadmap or status view); related prior work (active and archived work
   units touching this area — decisions made, what was deferred); captured ideas (backlog or inbox entries,
   other drafts); design context (ADRs and project strategies that constrain the approach); codebase state (the
   modules and patterns the work would touch).
3. **Facilitate.** Surface ambiguity, assumptions, alternatives, risks, and scope boundaries. Follow ambiguity
   rather than forcing a sequence — when something is underspecified or contradictory, work it through before
   moving on. Prompt material, not a questionnaire: problem and motivation; success and boundaries; alternatives
   and why; assumptions and unknowns; risks and dependencies; the minimum viable version. The developer
   formulates _with_ the agent; the agent does not produce a finished design for sign-off.
4. **Re-synthesize** into the draft each pass, and record continuity so the next session resumes without
   re-deriving: what is **Resolved**, the **Open** items (masked design decisions, unvalidated assumptions, soft
   scope boundaries), and the **Next** move. This matters most for multi-session work — common at `Class: Novel`.
5. **Amend** the draft as each open decision settles, and loop until formalization-ready.

This is a lightweight, facilitation-driven loop — re-synthesis pass by pass, no heavier machinery.

## Step 3: Feed the spec form forward

Hand forward the draft's produced shape, not a depth value: a rich, fully-shaped `draft-*` feeds a `detailed`
spec; a thin draft or a determinacy-confirm feeds a `brief` / `outline`. The planning-depth level is never
recorded, so create-spec re-reads the derivation axis at its own entry with the draft as its richest evidence.

## Step 4: Capture the draft

> [!IMPORTANT]
> `workflow-interlock`: Stop when the draft (or determinacy confirmation) is ready. Surface it for review; await
> approval before persisting `Class` and committing the capture.

On approval, capture what the level produced and persist the resolved `Class` to the meta. The `Class` decision
is live from the Step 1 read — it drove this stage's depth immediately — but its `**Class:**` write lands here,
at the draft-capture ceremony commit, never as a mid-stage meta edit.

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

Run [create-spec](1_create-spec.md) — it consumes the draft (or the determinacy confirmation) as its richest
entry evidence.

---

[classify-work-unit]: ../../methods/classify-work-unit.md
[template-draft]: ../../../reference/templates/arc/work-unit/template-draft.md
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
