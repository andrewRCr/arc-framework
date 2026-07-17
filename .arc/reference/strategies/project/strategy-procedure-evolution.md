# Strategy: Procedure Evolution (project-internal)

> **This is the procedural-substrate forward-compatibility CHECK-DOC.** Before building anything that authors,
> restructures, or mechanizes procedural instruction — workflows, skills, methods, agent-interpreted markup, or the
> CLI↔agent boundary — **run the [Self-Check](#self-check-run-this-before-building) below** and confirm the design
> composes with the layered execution model. The mechanism north star is `draft-composable-workflows.md` (contract
> shape, fragment substrate, session-agenda compiler); this doc carries the doctrine that outlives any one WU and
> points at it.
>
> **Status:** In-development reference — architectural *direction*, not a description of what ARC is today. Minted
> 2026-07-16 from an architecture-direction review; updated whenever a grooming pass settles or revises a principle.
> *Naming note:* this doc family's own name ("strategy") is among the things the knowledge-layer target model
> redesigns; the file follows the current live convention until that lands.

**Purpose:** Forward-compat discipline for ARC's procedural substrate — how procedural instruction is represented,
loaded, and executed. Defines the layered execution model ARC is evolving toward and the principles that keep
interim workflow and CLI work composing with it, so near-term WUs don't accrete prose-encoded logic, bespoke
agent-interpreted markup, or untyped boundaries a later compilation must undo.

**Scope:** Workflow and skill authoring shape, the CLI↔agent boundary, agent-interpreted markup, placement of
conditional and dispatch logic, correctness machinery for procedural content. Third of three sibling check-docs:
[`strategy-storage-evolution.md`](strategy-storage-evolution.md) owns where state lives,
[`strategy-knowledge-evolution.md`](strategy-knowledge-evolution.md) owns where non-procedural guidance lives, and
this doc owns how procedure executes.

**Why project-internal:** Adopter-facing strategies in `strategies/arc/` describe what ARC IS. This describes
direction for ARC's own evolution — for plan / PRD / workflow authors in this repo, not for adopters configuring
ARC.

---

## Self-Check: run this before building

Consult this doc when authoring or iterating any plan / PRD / WU that touches:

- **Workflow or skill authoring** — new workflows or skills, major rewrites, or new authoring conventions.
- **Conditional or dispatch logic in prose** — any step asking the agent to evaluate state, branch on envelope
  values, or resolve precedence.
- **Agent-interpreted markup** — new markers, step vocabularies, contract blocks, or any syntax the agent parses.
- **The CLI↔agent boundary** — new probe slots or envelope surfaces, precomposed text, verbs replacing prose
  mechanics, or logic moving in either direction across the boundary.
- **Correctness machinery for procedural content** — lint checks, structural budgets, parity tests, evals.

**The question for each:** *does this design compose with the layered execution model — deterministic logic in the
CLI, structure in typed contracts, judgment in minimal prose — or does it grow the prose-encoded logic a later
compilation must undo?* If the latter, surface the tension explicitly during authoring rather than deferring it.

---

## The Target Model (in brief)

The workflow corpus is a **program whose interpreter is stochastic** — markdown executed by a language model.
Each layer of it has a different failure mode, so each gets different correctness machinery:

- **Deterministic logic** — dispatch, conditionals over probe state, sequencing, path resolution — is code, and
  compiles into the CLI. The probe emits precomputed verdicts (`recommendedAction`, precomposed prompt text) and,
  at target, a compiled **agenda**: an ordered list of typed step instances the session executes, rather than
  state the agent evaluates. Its correctness instrument is the TypeScript compiler and the test suite. Mechanism:
  `draft-composable-workflows.md` D3.
- **Structure** — what a workflow consumes, declares, and emits — is typed contract: frontmatter declarations, a
  generated-from-types envelope schema, bounded spines, a small closed step vocabulary. Its correctness instrument
  is mechanical validation (point-scanner, lint, CI structural budgets). Mechanism: `draft-composable-workflows.md`
  D1/D2.
- **Judgment and communication** — the irreducible prose residue: orientation framing, recommendation discipline,
  elicitation, taste. It stays natural language, constrained by a controlled vocabulary and verifiable only
  empirically: **evals are this layer's type system** (`workflow-eval-harness`). No static instrument exists for a
  stochastic interpreter.

**The named asymptote — engine-owned control flow.** The agenda model still leaves the agent executing control
flow: the CLI emits a step list and the agent self-drives through it. The endpoint beyond it is a resident engine
(realistically an MCP server) owning sequencing, session state, and interlock enforcement, delegating only
judgment leaves to the agent — fully typed inside, interlocks mechanically unbypassable rather than
instructionally. Its costs are real: harness-runtime dependence, a resident process, and part of the
transparent-markdown customization property. Not scheduled; recorded so the remaining distance is closed by
decision, not drift.

---

## Forward-Compat Principles

Discipline that keeps interim work composing toward the target without locking in conflicting choices.

### 1. If the CLI can compute it, the CLI computes it

The cohort thesis (`cohort-agent-context-optimization.md`), held here as the substrate-wide rule: prose never
*evaluates* state — it dispatches on precomputed slots. A new conditional surface lands as a CLI slot plus a
dispatch line, never as comparison logic written in English.
**Anti-pattern:** a workflow step of the form `state == "clean" AND refState == "local-ahead"` — that is code
wearing prose, unexecutable and uncheckable where it sits.

### 2. Agent-interpreted markup never grows control flow

A rich workflow language interpreted by the LLM is the worst of both substrates — unchecked like prose, unreadable
like code. If a construct's semantics are deterministic, it belongs in the engine; the step vocabulary stays small
and closed. No conditionals, loops, or expression syntax in markup the agent evaluates.

### 3. Verbs over mechanics

Workflow prose invokes lifecycle verbs (`arc archive <slug>`) and concept names ("the archive"), never narrates the
file mechanics behind them (a `git mv` into a concrete directory). Concrete paths, layouts, and branch shapes live
in the CLI and at most one binding surface; every mechanics-narrating line is a coupling site a later structural
change must pay for. Composes with `strategy-storage-evolution.md` Principle 1 (workflows ask for paths; the
storage layer provides them).

### 4. Schemas are generated, never hand-written

Contract surfaces the corpus documents — envelope slots, step vocabularies, method signatures — derive from the
TypeScript types: one source, cannot drift (the managed-records philosophy applied to documentation). Don't
hand-author a second copy of a shape the code already declares.

### 5. Evals gate the prose layer

Judgment prose cannot be statically verified, so behavioral regression tests are its only correctness instrument.
Treat eval coverage as a correctness gate peer to typecheck and lint: a change that alters judgment-layer behavior
wants an eval the way a code change wants a test. Owner: `workflow-eval-harness`.

### 6. Emitted text is precomposed CLI-side

Anything rendered verbatim to the user — offers, advisories, prompts — is precomposed by the CLI
(the `recommended*Text` pattern), not templated in prose. A template in markdown is untestable; the same template
in code is a unit test away.

### 7. Controlled vocabulary for load-bearing concepts

A term doing technical work (`Class`, errand, atomic, interlock, review increment) is defined once — the briefs'
vocabulary — and used exactly; prose never re-explains or locally drifts a defined term. A new load-bearing term
earns a definition before use.

---

## Relationship to Other Documents

- **`draft-composable-workflows.md`** — the mechanism north star: D1 workflow contract shape, D2 fragment
  substrate, D3 session-agenda compiler; the worked session-init compilation is the target model's first fixture.
- **`cohort-agent-context-optimization.md`** — the cohort thesis Principle 1 generalizes; sibling drafts
  (`loadset-composition`, `instruction-optimization`, `handoff-optimization`) execute it across surfaces.
- **`workflow-eval-harness`** — owner of Principle 5's instrument.
- **[`strategy-knowledge-evolution.md`](strategy-knowledge-evolution.md)** — sibling check-doc; it owns the
  *non-procedural* knowledge layer, this doc the procedural one. Its Principles 5 and 8 (methods mechanism,
  author-for-humans / address-for-agents) are the seam the two share.
- **[`strategy-storage-evolution.md`](strategy-storage-evolution.md)** — sibling check-doc; Principle 3 here
  composes with its Principles 1 and 6 (storage as abstraction, mode-agnostic workflow logic).
- **`strategy-workflow-authoring.md`** — the adopter-facing authoring conventions. Principles here that graduate
  to shipped convention land there (verbs-over-mechanics is the first candidate), coordinated with
  `composable-workflows` D1's planned rewrite of that strategy.
