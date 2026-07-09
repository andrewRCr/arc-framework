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
    - assess-draft-readiness
    - adversarial-review
    - design-audit
---

# Workflow: Draft Design

The first authoring stage — peer to [create-spec](create-spec.md) and [generate-tasks](generate-tasks.md).
It shapes the design before a spec crystallizes it: surface the problem, work the alternatives, and settle the
direction, producing a `draft-*` of the right richness — or, when the design is already determinate, no draft at
all. The `arc-plan` skill dispatches into this workflow.

This stage reads the **derivation** axis: how much design must be authored before a competent engineer can
start.

---

## Planning-entry gate

**Grooming-entry skip.** A `--plan <stub>` grooming session enters already on a committable grooming branch —
under full protection, session-init's signal-leaf relocate uses `chore/groom-<slug>` cut from the base. Skip this
gate and continue to **Resolve depth & Class**. The gate still runs on every other entry.

Before drafting, run the mechanical preflight — it resolves whether a draft can be committed from the current
context and routes so a draft never lands where it can't be committed:

```bash
arc plan check --name <slug> --json
```

Include `--name` when the design has a working slug (it gates the draft-presence check); omit it for an unnamed
idea. Act on the emitted `route`:

- **`proceed`** — committable: the base branch under partial protection, or an active planning branch (a
  `Planning`-state `meta-{name}.md` on its branch) under full. Continue to **Resolve depth & Class** below.
- **`redirect`** — not committable; `reason` words why (on the protected base, on another work unit's branch, or
  a degenerate context). Don't draft here. Surface the route by WU-worthiness and **confirm with the developer**
  before acting — the mechanic resolved the context, but the leg is judgment:
    - **start now** — WU-worthy → `arc start <name>`, then draft on its branch.
    - **stub** — defer → `arc stub <name>` (with `--commitment provisional|planned` and `--priority`) mints the
      backlog stub; when `draftPresent`, fold the existing draft in, then start it via `init` (or keep drafting first).
    - **errand** — atomic, off-work-unit → run it through the errand path, not a draft.

**Stage pointer** — no entry write: the init scaffold seeds `Current Workflow = draft-design`, the stage this
workflow opens. (Pre-WU drafting on the base has no meta yet — minted at `init`; transient, not a meta-less draft.)

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
   (where this fits in the live project status view and backlog source artifacts); related prior work (active
   and archived work units touching this area — decisions made, what was deferred); captured ideas (backlog or
   inbox entries, other drafts); design context (ADRs and project strategies that constrain the approach);
   codebase state (modules and patterns the work would touch).
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

At loop-exit, assess the draft's formalization-readiness with the
[assess-draft-readiness][assess-draft-readiness] method. On **ready**, the draft crosses into create-spec; on
**not-ready**, re-synthesize against the returned gaps and keep iterating. These readiness states describe a
draft's maturity for cross-session continuity; a draft is `formalization-ready` when the method returns `ready`.

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

On a draft-producing path (`medium` / `high`), the readiness boundary carries an advisory adversarial
fire-point — the gate's own rubrics run from fresh context:

> [!IMPORTANT]
> `adversarial-review` method — advisory fire-point (`Class`-scaled): recommend at `Novel` (strongest framing);
> surface a neutral offer at `Light` / `Heavy`. Offer the pass and await the call — user decides; decline
> proceeds normally.

```yaml
adversarial-review:
  rubric:          # assess-draft-readiness divergence test + design-audit (efficacy + fit)
  artifacts:       # draft-{name}.md + non-exhaustive key-file pointers (the implementation loci the design names)
  orientation:
    - AGENT-BRIEF.ARC
    - AGENT-BRIEF.PROJECT
  pass-cap:        # per Class — Light 1 / Heavy 2 / Novel 3
  prior-findings:  # pass two onward; omitted on pass one
```

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

On a draft-producing path (`medium` / `high`) with an active planning meta, repoint `Design` to the new draft:
`arc repoint-design draft-created` rewrites `Design: [none] → draft-{name}.md`. Skip it on the `low` path (no
draft — `Design` repoints straight to the spec at create-spec finalization), or when drafting pre-WU on the base
with no meta yet (minted at `init` — transient, not a meta-less draft).

When the draft is formalization-ready and crosses into create-spec (the forward path — not the re-entry
back-edge), advance the stage pointer: `arc set-stage create-spec --advance` rewrites `Current Workflow:
draft-design → create-spec` and resets `**Next Action:**` to the `[begin current workflow]` boundary sentinel,
bundled into this capture commit — so a fresh session after handoff resumes in create-spec.

**Groom-and-stop (the `--plan` grooming exit).** A `--plan <stub>` grooming session ends here without advancing —
a complete outcome, not an incomplete forward path. Capture the draft to the grooming branch and **do not advance
the stage pointer**: the stub stays in its backlog state, and the session resumes by re-invoking `--plan <stub>`.
The tracked `draft-*` is the continuity artifact — pausing is commit + push; write no marker and no new durable
state.

**Ship instead of pause (optional).** After the capture commit and push, a path-pure grooming branch may ship as a
lean PR on the auto-merge lane: one-line Summary, Test Plan only when non-obvious, then native auto-merge per the
[merge-gate setup][setup-merge-gate]. Resolve the merge method from the repository/ruleset or config surface; do
not assume the repo's advertised default is the allowed method. After the PR lands, return to the base checkout,
fast-forward it, and remove the local grooming branch if it is still present.

**Post-settle coherence re-read** (always-on, in-context): when folds landed after the readiness read —
adversarial-pass findings, review amendments — re-read the settled draft for coherence (the readiness bar's
coherence check, re-fired) as the last step before the capture commit. The final pass's folds are otherwise
never re-attacked.

What is staged sets the commit shape: a `medium` / `high` path bundles the `draft-*` with the meta `Class` +
`Design` writes; a `low` path that produced no draft writes only the meta, landing as a dedicated `chore(arc):`
commit (see [DEV-RULES.ARC][dev-rules-arc] § Meta-file commit shape).

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): capture draft for {name}

Context: draft-{name}.md (planning)
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
[assess-draft-readiness]: ../../methods/assess-draft-readiness.md
[template-draft]: ../../../reference/templates/arc/work-unit/template-draft.md
[setup-merge-gate]: supplemental/setup-merge-gate.md
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
