# Plan: Methodology Maturation

**Purpose:** Shore up ARC's foundational clarity — the boundary between methodology and framework
implementation, the language and positioning that express that boundary, and the content architecture
that delivers it. This is preparatory work that gates the ARC Operating Modes work unit (ARC Lite +
local mode).

**Status:** Draft (exploring)
**Created:** 2026-04-06
**Origin:** Design investigation for ARC Operating Modes surfaced that the methodology/implementation
boundary is underspecified. Adding new operating modes requires knowing what's methodology (must
preserve in any mode) vs implementation (can simplify, relocate, or omit). Several related concerns
converge here: backlog items on methodology specification and update dependencies, content placement
questions, and harness engineering positioning.

**Downstream:** ARC Operating Modes (`plan-arc-lite.md` — ARC Lite + local mode). That work unit
depends on this one's outputs: a settled methodology boundary, consistent language, and a content
architecture that can support mode-specific variations.

---

## Problem Statement

ARC's principles (P1-P11) are implementation-independent, but this independence isn't cleanly expressed
in the docs or the distribution model. Several symptoms:

1. **Language conflation.** Docs, including the docs site "How ARC Works" section, describe the
   framework implementation as if it _is_ the methodology. "ARC uses bounded sessions with
   WORK-STATUS.md and SESSION-NOTES.md" conflates a methodology principle (bounded sessions with
   context preservation) with its specific implementation (two files with specific formats).

2. **No methodology artifact.** There's no place someone can go to understand "what is ARC the
   methodology" independent of `.arc/` directories, CLI commands, and specific file formats. The
   philosophy strategy doc is close but mixes principle statements with implementation-specific
   conventions.

3. **Content placement coupling.** Every ARC installation gets the full strategy docs
   (`strategies/arc/`), including methodology-level content (core philosophy, principles) and
   framework-operational content (task list formatting, work organization details). Methodology
   refinements trigger `arc update` merge ceremonies in adopter projects even when the operational
   impact is zero.

4. **Update dependency gaps.** Methodology edits touch multiple surfaces (strategy docs, indexes,
   CLI source templates, docs site) with no documented dependency checklist. The package-project sync
   gap we discovered this session (PM artifact steps missing from `.arc/`) is a symptom of this.

5. **Missing positioning.** ARC naturally fits the "harness engineering" framing (Martin Fowler,
   2025 — see Research section), but doesn't use this terminology or explicitly position itself in
   the broader landscape of AI-assisted development approaches. This weakens both external
   communication and internal design clarity.

These aren't cosmetic issues. The ARC Operating Modes work unit needs to add a lightweight mode and a
local/untracked mode. Both require knowing which ARC components are methodology (non-negotiable in any
mode) vs implementation (can be adapted per mode). Without this clarity, mode design becomes guesswork.

---

## Deliverables

### 1. Package–Project Sync Audit (Pre-Safeguard)

Reconcile `.arc/` (project instance) and `packages/arc-framework/arc/` (distributable source) before
making further methodology changes. Establishes a clean baseline.

**What it covers:**

- Internal path/reference audit across both copies
- Stale/incorrect path references, template placeholders, path strings in workflow docs
- Cross-file link references and consistency
- Content drift identification (files that diverged, regressions like the activate-work-unit issue)

**Output:** Both copies agree on all non-Configurable content, with documented deviations limited to
project-specific customizations (e.g., CodeRabbit extension configuration).

Resolves the ATOMIC-INBOX item on internal path/reference audit. Also resolves the BACKLOG-TECHNICAL
item on methodology update dependencies (the sync audit naturally produces the dependency map that
the guard strategy needs).

### 2. Methodology Boundary Definition

Define what ARC-the-methodology requires, independent of any specific implementation.

**Approach:** Not a standalone methodology specification document (risks creating parallel canon that
drifts). Instead:

- **Methodology summary artifact** — A focused section (in the philosophy strategy doc, or as a
  lightweight companion) that states "this is ARC without any implementation." Targeted at someone
  who says "I like the ideas but I'm not going to use your framework." Should be readable in five
  minutes and leave the reader knowing what ARC-the-methodology asks of them.
- **Grey area resolutions** — Design decisions on the ~10 "named patterns" that sit between
  abstract principles and specific implementation. For each: is it methodology (any ARC practitioner
  should do this) or implementation (this is how ARC Framework does it)? See the methodology floor
  analysis in the Operating Modes plan doc for the full list.

**Output:** A clear, referenceable statement of ARC's methodology commitments that can be pointed to
from both the docs site and in-repo docs. Grey areas resolved with documented rationale.

### 3. Language and Positioning Cleanup

Ensure existing docs consistently distinguish methodology from framework implementation, and integrate
the harness engineering positioning.

**Language cleanup scope:**

- Docs site (`docs/`) — "How ARC Works" and similar sections that currently describe framework
  implementation as if it is the methodology
- Strategy docs (`strategies/arc/`) — ensure principle statements are clearly methodology-level,
  convention descriptions are clearly implementation-level. The philosophy strategy already has the
  principle/convention split; other strategies may be less clean.
- Agent briefings, README, any external-facing copy

**Not a rote find-and-replace.** The goal isn't mechanically inserting "framework" everywhere. It's
ensuring the framing and phrasing naturally convey the right level — when we're talking about a
principle vs when we're talking about how the framework implements it. Contextually considered,
preserving prose flow.

**Harness engineering integration:**

- Adopt relevant terminology where it strengthens clarity: "feedforward controls" for spec-driven
  context loading, "feedback controls" for review gates and quality checks, "harness" as a framing
  for what ARC provides around the agent
- Reference the source (Fowler article) in appropriate locations (philosophy strategy, docs site
  positioning)
- Position ARC as a "process-level harness" — agent platforms provide model-level harness (tests,
  linters); ARC provides the collaboration-level harness (how work flows between human and agent)

**Output:** Consistent language across docs. Harness engineering framing integrated where it adds
clarity. No change to what ARC _does_ — only how it's described.

### 4. Content Placement Decision

Decide what ships with installations vs what lives on the docs site, and implement the separation.

**The current model:** Everything in `strategies/arc/` ships with every installation and updates via
`arc update` three-way merge. This bundles methodology canon (core philosophy, principles) with
operational guidance (task list formatting, work organization mechanics).

**The proposed model (to evaluate):**

- **Ships with install** (in `.arc/`): Operational content the agent and hooks directly reference —
  workflows, methods, dev rules, formatting conventions, configuration, agent briefings.
- **Lives on docs site**: Methodology canon — principles, philosophy, positioning, "what is ARC"
  content. Accessible, citable, but not bundled into every project's `.arc/` directory.
- **Ships but loads on-demand**: Strategy docs that are reference material (ADR methodology, team
  coordination) — present for offline access but not loaded at session-init unless relevant.

**Key constraint (from discussion):** Removing canon docs from the install puts more weight on the
docs site in terms of structure and accessibility. It also means in-repo docs need appropriate
pointers — "for the principles behind this, see [docs site URL]." The docs site transitions from
supplementary explanation to methodology canon.

**Questions to resolve:**

- Does removing philosophy/principles from the install meaningfully reduce agent context load?
  (Measure: how many tokens are the strategy docs that would move?)
- What's the right cross-reference pattern? How do in-repo docs point to the docs site without
  creating broken links for offline use?
- Does `arc update` need to distinguish "operational update" from "reference update"?
- What about the first-time experience? New adopters might benefit from having methodology docs
  locally even if they're not operationally needed.

**Output:** A decision on content placement with documented rationale. If the model changes,
implementation of the separation (file moves, cross-reference updates, CLI update logic changes).

### 5. Conditional Content Architecture Evaluation

Inventory how ARC handles mode-dependent behavior today and assess whether the mechanisms scale for
additional modes.

**Current mechanisms:**

- Conditional-in-prose — "skip this step if `pm.mode` is `none`" in workflow documents
- Conditionally-rendered templates — `<!-- arc:if -->` blocks in `.template.md` files
- Conditionally included/excluded files — backlog files only installed for `arc-in-git`

**Evaluation:**

- Inventory all current conditionals across workflows, templates, and CLI
- Assess how many new conditionals each proposed mode (Lite, local) would add
- Determine if current mechanisms scale or if a more systematic approach is needed
- Document the pattern that new conditionals should follow

**Output:** Documented inventory, scaling assessment, and pattern guidance for the Operating Modes
work unit to follow.

---

## Sequencing

```text
1. Sync Audit (pre-safeguard)
   ↓
2. Methodology Boundary Definition
   ↓ (informs language choices and placement decisions)
3. Language & Positioning Cleanup ←→ 4. Content Placement Decision
   (these can interleave — language cleanup may surface placement issues and vice versa)
   ↓
5. Conditional Content Architecture Evaluation
   ↓
   → ARC Operating Modes work unit (downstream)
```

Deliverables 1 and 2 are strictly sequential (sync first, then methodology work on clean source).
Deliverables 3 and 4 can interleave — they touch overlapping files and inform each other. Deliverable
5 is last because it benefits from knowing the final content placement and methodology boundary.

---

## Research

### Harness Engineering (Fowler, 2025)

**Source:** [martinfowler.com/articles/harness-engineering.html][harness-engineering]

**Core concept:** "Agent = Model + Harness." Harness engineering builds confidence in AI coding agents
through systems and controls around the model — preventative controls (**guides**, feedforward) and
observational controls (**sensors**, feedback).

**Mapping to ARC:**

| ARC Component | Harness Term | Direction |
| --- | --- | --- |
| Spec-driven development, bounded tasks, context loading | Guides | Feedforward (steers before acting) |
| Review increments, quality gates, traceability | Sensors | Feedback (observes after acting) |
| Session continuity, context preservation | Harness architecture | State management |
| Human review at increment boundaries | Human-in-the-loop steering | Harness improvement |

**Key positioning insight:** ARC operates one level above model-level harness. Agent platforms provide
model-level controls (tests, linters, architectural checks). ARC provides process-level controls — how
work flows between human and agent, how context is preserved, how the harness itself improves. They
compose: use your agent platform's harness for code quality, use ARC's harness for collaboration
quality.

**Terminology to adopt:**

- "Feedforward" for ARC's specification and context-loading patterns — these steer agent behavior
  _before_ it acts, not just evaluate it after
- "Harness" as a framing for what ARC provides — not a prompt template, not a wrapper, but a
  structured system of controls around the collaboration
- "Process-level harness" to distinguish from model-level agent tooling

### Methodology Floor Analysis

Conducted during ARC Operating Modes planning (2026-04-06). Full analysis in the operating modes plan
doc; key findings relevant here:

- All 11 principles (P1-P11) are clearly methodology — tool-independent
- The `arc-methods.md` contract/default pattern is already a near-perfect methodology/implementation
  separator (contracts ≈ methodology, defaults ≈ implementation)
- 10 grey areas identified where "named patterns" sit between abstract principles and specific
  implementation — these need design decisions (see Deliverable 2)
- The philosophy strategy doc already has principle/convention splits for each P-item — the gap is
  in articulating the methodology layer as a cohesive whole, not in identifying individual boundaries

---

## Relationship to Backlog Items

This work unit absorbs or advances several existing backlog items:

- **ATOMIC-INBOX: Internal path/reference audit** — Fully resolved by Deliverable 1 (sync audit)
- **BACKLOG-TECHNICAL: Methodology Update Dependency Checklist / Guard** — Resolved by Deliverable 1
  (the sync audit produces the dependency map) plus potentially a strategy doc or pre-commit hook
  enhancement
- **BACKLOG-TECHNICAL: Methodology Specification Layer** — Resolved by Deliverable 2 (methodology
  boundary definition). Scoped as described in the backlog: light-touch foundation, not a separate
  product

---

## Open Questions

1. **Scope of language cleanup.** How deep does the pass go? Every strategy doc, or just the
   externally-facing ones (philosophy, docs site, README)? The operational strategy docs
   (task-list-formatting, work-organization) are less likely to be read by someone evaluating ARC
   as a methodology — diminishing returns on cleaning those.

2. **Docs site readiness.** If methodology canon moves to the docs site, is the current site
   structure adequate? The MkDocs Material site was scaffolded during WU4 but content is minimal.
   Does this work unit need to build out the docs site, or just make the placement decision and
   leave implementation to the Operating Modes unit (or WU5)?

3. **Harness engineering depth.** How prominently should the Fowler reference appear? Options range
   from a footnote citation to a dedicated positioning section in the philosophy strategy. The
   framing is useful but ARC shouldn't be perceived as derivative of a single article.

4. **Strategy doc granularity.** Some strategy docs (core philosophy at ~600 lines, work
   organization at ~400 lines) are large. If methodology content stays in strategy docs, does
   it make sense to split them (methodology sections vs operational sections), or does that
   create more fragmentation than it solves?

---

[harness-engineering]: https://martinfowler.com/articles/harness-engineering.html
