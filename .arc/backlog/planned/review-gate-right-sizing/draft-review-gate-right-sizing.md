# Draft: review-gate-right-sizing

- **Origin:** [internal] — surfaced at `review-surface-binding`'s create-spec Gate 1, when a proportionality read
  showed the design splitting into tiers whose justification could not be settled from inside that work unit.
- **Purpose:** Settle the review-gate program's target state. Assess what is already built, what the sequenced
  successors would add, and what each rung buys over the next-simpler alternative — then re-cut the backlog to that
  target, with deletion a legitimate outcome for any part of it.
- **Likely Class:** `Heavy` — a target state must be authored, not read off, and the grounding surface spans a
  shipped 176-module subsystem plus four work-unit drafts and the shipped workflows that invoke them.

---

## Grooming status (continuity)

> _Updated each planning pass. This is the resume anchor._

- **Readiness:** `seed` — this document captures the reasoning from the session that surfaced the concern. It has
  not been through a drafting pass. Nothing here is settled design; the tier split and the ladder are the framing
  to work from, not conclusions.
- **Next:** run `draft-design`. Start from the inventory (§ What the accounting must cover, step 2) — the tier
  split below was derived from one work unit's design and needs re-deriving across the whole program.

## Problem and motivation

The review-gate program grew across a shipped predecessor and four sequenced successors without its proportionality
ever being assessed as a whole. Each unit was justified against its own charter; none was justified against the
question "does the program need to exist at this size."

The concern became concrete at `review-surface-binding`'s create-spec Gate 1, where that unit's design split into
three tiers with sharply different justification:

**Tier 1 — earns its keep today, independent of anything downstream.**

- CLI verbs replacing hand-composed procedure. The shipped `integrate-work-unit` and `run-errand` workflows
  currently instruct the agent, in prose, to publish review operation state through a TypeScript interface that
  adopters cannot call. That is present, shipped, unexecutable friction.
- A detached exact-head checkout, so a reviewer sees committed code rather than whatever is on disk including
  uncommitted experiments.
- Typed `state -> nextAction` results instead of the agent interpreting reviewer prose as control flow.
- Method activation actually being read — production composition currently hardcodes both review methods active and
  discards activation diagnostics, so configured settings are ignored.
- The prune-at-consumption pass: roughly 2,000 LOC of dead code plus four dead port interfaces.

**Considered settled.** This floor stands regardless of the program's target state.

**Tier 2 — value entirely contingent on a downstream consumer.**

The receipt plus guidance-evidence pair, the reduction projection, disposition records, and the identity /
generation rigor exist so that something later can verify a review happened properly. Nothing consumes them today.
The intended consumers are the three remaining gate work units — which are themselves pending their own
proportionality assessment, so the bet cannot currently be evaluated from either end.

**Tier 3 — complexity the design creates for itself.**

Freshness windows, resumable operations, evidence-first partial-publication recovery, the orphan / expired
materialization sweep, generation compare-and-swap. None of it solves a problem present today. All of it exists
because Tier 2 turns review from a synchronous action into a durable multi-step operation. Ad hoc review has no
resume because it has nothing to resume.

## The alternative ladder

The honest baseline: an agent spawns a subagent to review the diff, or runs a review CLI, surfaces findings, the
human approves, fixes land. That works and delivers most of what review is for. Every rung above it must justify
itself against the rung below, not against nothing.

1. **Ad hoc subagent review** — no persistence, no contract, no evidence. Works. Costs nothing.
2. **CLI-based review** — a registered provider run against a defined change set, with typed results.
3. **A required CI check that merely asserts some review occurred** — cheap enforcement without an evidence model.
4. **The full typed evidence gate** — exact-target receipts, qualification, hosted enforcement, merge authority.

The program as currently sequenced targets rung 4. The question this unit answers is which rung the project
actually needs.

## Why this needs its own work unit

Prevention of future overdesign is now owned: `solution-proportionality` ships `assess-design-proportionality` as a
planning-time method. But **remediation of already-shipped overdesign has no owner.** That unit's Non-Goals state
it explicitly — retrofitting existing implementations stays with their current owners.

Owner-carries-it works when overdesign sits inside a single work unit; `session-locus-model` absorbed its own
through a remedial phase. It breaks precisely when the overdesign spans a _program_, which is this situation: no
single work-unit owner can settle a target state that five units share.

**Sunk cost is not an argument for continuing.** What is built is spent whether or not anything further ships, so
the only live question is what to spend next. This repository has already shown it will delete built machinery on a
consumer test: `review-surface-binding`'s prune classified 23 dormant modules and retired four of them, plus a
registered schema and four port interfaces, on the criterion "no consumer and no named downstream claim." Applying
that same reasoning at program scale is the identical move, only larger.

## What the accounting must cover

1. State plainly what the review gate is _for_ — the goal, not the mechanism.
2. Inventory what is shipped: what is live, what is dormant, what the subsystem actually does.
3. Enumerate what the three remaining gate work units would add on top.
4. Price each rung of the ladder above against the rung below it.
5. Decide which rung this project needs, given one developer working with agents, and given the project's own
   stated posture — operational friction down and judgment friction up, focused attention over multi-tracked
   throughput.
6. Recommend a target state and re-cut the backlog to it, with deletion legitimate for any part, including shipped
   surface.

Apply `assess-design-proportionality` as the method once it ships. This is its natural first real application and a
genuine field test of it against a hard case.

## Decision criteria

Recorded so a later session does not re-derive them:

- Does the mechanism reduce operational friction for the **human operator** — fewer interactions, more determinism,
  less manual verification?
- Does it reduce operational friction for the **agent** — less prose procedure to execute by hand, fewer judgment
  calls on unstructured reviewer output?
- What concrete failure does it prevent that the next-simpler rung permits, and how often does that failure
  actually occur here?
- Is exactness concentrated where failure is destructive or irreversible, and lighter where it is retryable or
  advisory?
- Would removing it expose complexity intrinsic to the problem, or only remove complexity the solution invented?

## What this blocks

`review-surface-binding` is held at its create-spec Gate 1. Its spec is authored, adversarially reviewed three
times, and saved uncommitted; Tier 1 content is considered settled and Tier 2 / Tier 3 content is pending this
decision.

Do not finalize that spec or generate tasks from it until the target state settles. Generating a task list from a
design under active proportionality question would institutionalize the excess across every resulting task — the
failure that `solution-proportionality`'s task-generation backstop exists to prevent.

The three gate work units — `review-gate-enforcement-qualification`, `review-gate-enforcement-promotion`, and
`review-gate-github-adapter` — each already carry a routed capture asking them to apply the proportionality posture
at their next grooming. This unit supersedes those as the place the question gets answered once, rather than
five times inconsistently.

## Unknowns

- **Wrapper fit.** Whether the outcome is one decision document, or a decision plus a remediation work unit that
  executes deletions against shipped surface.
- **Sequencing against `solution-proportionality`.** Whether to wait for `assess-design-proportionality` to ship or
  run the accounting by hand and feed the experience back as a field test.
- **Whether the ladder is the right frame.** It was derived in one conversation; a drafting pass may find the rungs
  are not cleanly ordered, or that the project sits on different rungs for different change classes.
- **Blast radius of a dial-back.** If the target is rung 2 or 3, what happens to the shipped surface — deleted,
  left dormant with a recorded rationale, or extracted for reuse.
