# Plan: Methodology Maturation

**Purpose:** Shore up ARC's foundational clarity — the boundary between methodology and framework
implementation, the language and positioning that express that boundary, the content architecture
that delivers it, and the human-side co-development posture that ARC's principles require but don't
yet operationally support. This is preparatory work that gates the ARC Operating Modes work unit
(ARC Lite + local mode).

**Status:** Draft (exploring)
**Created:** 2026-04-06
**Origin:** Design investigation for ARC Operating Modes surfaced that the methodology/implementation
boundary is underspecified. Adding new operating modes requires knowing what's methodology (must
preserve in any mode) vs implementation (can simplify, relocate, or omit). Several related concerns
converge here: backlog items on methodology specification and update dependencies, content placement
questions, harness engineering positioning, and an identified gap in human-side co-development
support.

**Downstream:** ARC Operating Modes (`plan-arc-modes.md` — ARC Lite + local mode). That work unit
depends on this one's outputs: a settled methodology boundary, consistent language, a content
architecture that can support mode-specific variations, and skill infrastructure for the
co-development loop.

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

6. **Human-side co-development gap.** P2 states the human is a "co-developer, not merely a
   reviewer" who contributes "context, judgment, and course correction at every review increment."
   But ARC's operational machinery almost entirely faces the agent. The process-task-loop is 260
   lines of agent protocol; the human appears only as the recipient of reports and source of
   approval signals. The mandatory stop is structurally a feedback sensor (harness engineering
   term), but ARC specifies the sensor without articulating what effective human engagement looks
   like at that moment. The methodology describes the _principle_ of co-development but provides
   no operational expression beyond "the agent stops and waits." Even the "implied permission"
   guidance — the only text about _how the human responds_ — effectively codifies passive behavior.

    This is a methodology gap, not an implementation gap. It's about what ARC asks of practitioners,
    independent of tooling. It also surfaces a tooling gap: the existing ARC skill set
    (arc-resume, arc-handoff, arc-commit, arc-task-audit, arc-verify) covers session boundaries,
    commits, and pre-implementation analysis, but provides nothing at the review increment — the
    moment where human participation matters most — or at the planning exploration phase where
    co-development should begin.

These aren't cosmetic issues. The ARC Operating Modes work unit needs to add a lightweight mode and a
local/untracked mode. Both require knowing which ARC components are methodology (non-negotiable in any
mode) vs implementation (can be adapted per mode). Without this clarity, mode design becomes guesswork.
The co-development posture is part of what makes ARC distinctive — if it's only stated as a principle
and never operationally supported, it degrades across modes.

---

## Deliverables

### 1. Package–Project Sync Audit and Dev Safeguard

Reconcile `.arc/` (project instance) and `packages/arc-framework/arc/` (distributable source),
then establish a permanent safeguard against future desync and content regression.

This project has a two-copy architecture: `.arc/` is the live project installation, and
`packages/arc-framework/arc/` is the canonical distributable source that adopters receive via
`arc init` and `arc update`. The package copy is authoritative for all Framework and Configurable
files — edits to methodology content must flow through package source, not from `.arc/`. Edits
made to `.arc/` copies of these files risk being overwritten on the next `arc update` or,
worse, synced backward into package source and regressing adopter-facing content. This has been
a real problem: the PM artifact step regression (c319f0b) and the activate-work-unit desync
both originated from editing the wrong copy.

**Phase 1 — Sync audit (establish clean baseline):**

- Internal path/reference audit across both copies
- Stale/incorrect path references, template placeholders, path strings in workflow docs
- Cross-file link references and consistency
- Content drift identification (files that diverged, regressions like the activate-work-unit issue)
- Both copies agree on all non-Configurable content when complete, with documented deviations
  limited to project-specific customizations (e.g., CodeRabbit extension configuration)

Resolves the ATOMIC-INBOX item on internal path/reference audit.

**Phase 2 — Dev safeguard (prevent future desync):**

Produce a dependency map and per-session guidance that ensures methodology edits don't regress
or desync across the two copies. The scope is `reference/` and `system/` content — files that
ship to adopters in the package. Does not apply to `active/`, `backlog/`, or `reference/archive/`
(project-owned, not distributed).

Deliverables:

- **Dependency map** — full inventory of which files exist in both copies, which direction
  edits should flow (package → project for Framework/Configurable files, project-only for
  Project-Owned files), and which files have `.template.md` counterparts with `<!-- arc:if -->`
  conditionals that require careful handling
- **Dev safeguard guidance** — project-level strategy doc (`strategies/project/`) documenting
  the two-copy architecture, edit flow rules, and the dependency map. This is an internal dev
  concern (not shipped with the framework), but needs to be loaded or referenced every session
  when methodology edits are in scope. Likely referenced from DEV-RULES.PROJECT with a deeper
  treatment in the strategy doc.
- **Evaluate hook-level enforcement** — assess whether a pre-commit check can catch edits to
  `.arc/` copies of distributed files and warn (or block). May be as simple as flagging staged
  changes to `.arc/reference/` or `.arc/system/` files that have a corresponding
  `packages/arc-framework/arc/` counterpart. Design the check; implement if warranted.

Resolves the BACKLOG-TECHNICAL item on methodology update dependencies.

### 2. Methodology Boundary Definition (Including Human Co-Development Posture)

Define what ARC-the-methodology requires, independent of any specific implementation.

**Approach:** Not a standalone methodology specification document (risks creating parallel canon that
drifts). Instead:

- **Methodology summary artifact** — A focused section (in the philosophy strategy doc, or as a
  lightweight companion) that states "this is ARC without any implementation." Targeted at someone
  who says "I like the ideas but I'm not going to use your framework." Should be readable in five
  minutes and leave the reader knowing what ARC-the-methodology asks of them.
- **Grey area resolutions** — Design decisions on the ~10 "named patterns" that sit between
  abstract principles and specific implementation. For each: is it methodology (any ARC practitioner
  should do this) or implementation (this is how ARC Framework does it)?

  The grey areas identified in the methodology floor analysis (2026-04-06):

    1. Review increment granularity (per-task boundary)
    2. Tiered quality gates (Tier 1/2/3 system)
    3. Work categories (feature/technical/incidental)
    4. Issue triage routing (fix-vs-defer decision tree)
    5. Context loading tiers (T1/T2/T3 loading model)
    6. Trust hierarchy (git > task list > WORK-STATUS > SESSION-NOTES)
    7. Strategy document pattern (codified domain guidance)
    8. Deferred review scope (user-defined continuation ranges)
    9. Verification phase (formal end-of-work-unit validation)
    10. Context footer requirement (commit traceability linking)
- **Human co-development posture** — Articulate what effective co-development looks like during
  task execution, as part of the methodology definition. This is methodology-level content: it
  describes the practice, not specific tools or steps. The framing should be descriptive ("this is
  what doing ARC looks like") not prescriptive or self-monitoring ("check yourself against this
  list"). Treat the reader as a responsible engineer who wants to understand the practice, not
  someone who needs to be reminded to pay attention. This articulation belongs in the methodology
  layer (P2 section of the philosophy strategy, or the methodology summary artifact) — not in
  the process-task-loop, which is agent-facing.

**Output:** A clear, referenceable statement of ARC's methodology commitments that can be pointed to
from both the docs site and in-repo docs. Grey areas resolved with documented rationale. Human
co-development posture articulated as part of what ARC asks of practitioners.

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

**Depth guidance:** Prioritize externally-facing docs (philosophy strategy, docs site, README, agent
briefings). Operational strategy docs (task-list-formatting, work-organization) are less likely to be
read by someone evaluating ARC as a methodology — clean up only where they actively mislead.

**Harness engineering integration:**

- Adopt relevant terminology where it strengthens clarity: "feedforward controls" for spec-driven
  context loading, "feedback controls" for review gates and quality checks, "harness" as a framing
  for what ARC provides around the agent
- Reference the source (Fowler article) in appropriate locations (philosophy strategy, docs site
  positioning) — moderate depth: positioning section in philosophy strategy + reference in docs site
  "What is ARC" content. Not derivative if framed as "ARC's approach maps to the harness engineering
  model" rather than "ARC implements Fowler's harness engineering"
- Position ARC as a "process-level harness" — agent platforms provide model-level harness (tests,
  linters); ARC provides the collaboration-level harness (how work flows between human and agent)

**Connecting skills to methodology docs:** Ensure arc-task-audit (and any new skills from
Deliverable 6) are referenced from the methodology and workflow docs they support. Currently
arc-task-audit is a documentation island — well-documented internally but invisible to anyone reading
ARC's methodology docs.

**Output:** Consistent language across docs. Harness engineering framing integrated where it adds
clarity. Skills connected to the methodology docs that motivate them. No change to what ARC _does_ —
only how it's described.

### 4. Content Placement, Taxonomy Refinement, and Update Behavior

Evaluate where ARC content should live and how it updates, informed by external research
(Diátaxis framework, framework distribution patterns — see Research section) and a CLI
behavior fix that reframes the tradeoffs.

**Prerequisite — CLI update behavior fix:**

The CLI currently runs ALL non-scaffolded files through three-way merge during `arc update`,
with no distinction between Framework and Configurable classification. Strategy docs in
`strategies/arc/` are classified Framework ("rarely customized by adopters") but still go
through merge. This means methodology prose edits can create merge conflicts for adopters who
have (against classification guidance) modified Framework files.

Fix: Framework-classified files should be wholesale replaced on `arc update`, not three-way
merged. The classification already says adopters shouldn't modify these — wholesale replacement
is the honest enforcement. Implementation is bounded: in `applyChangePlan()`, check
classification before merging; Framework → write updated content directly; Configurable →
three-way merge as today. This eliminates merge conflicts for all 56 Framework files (including
all `strategies/arc/` docs) and makes strategy doc updates frictionless for adopters.

**Impact on content placement calculus:** With wholesale replacement, the primary motivation
for moving strategy docs to the docs site (merge burden) largely evaporates. Strategy docs
can ship with the install and update silently. The remaining motivations for docs-site
relocation are: install size (minor — these are on-demand), keeping installs focused on
operational content (philosophical preference), and making methodology canon discoverable
outside the install (docs site accessibility). These are real but weaker than merge burden.

**Three evaluation axes (independent decisions):**

**Axis 1 — Install vs docs site.** With merge burden resolved by the CLI fix, evaluate each
strategy doc on its remaining merits. The Diátaxis taxonomy (see Research section) classifies
content as Reference (operational facts, format specs) vs Explanation (rationale, philosophy,
evidence bases). Established framework practice consistently externalizes Explanation while
shipping Reference. For ARC, this means: strategy docs that are purely explanatory (core
philosophy, philosophical foundations) are candidates for docs-site-only placement. Strategy
docs that contain operational reference content consumed by workflows should stay in the
install. For docs with mixed content, evaluate whether the explanatory portions can be
extracted to docs site while operational portions remain — the dependency is on the _content_,
not the _file_. Case-by-case: sometimes extractable, sometimes too integrated to split
cleanly. Where operational content from a docs-site-bound doc needs to stay in the install,
it can relocate to a method, workflow inline section, or DEV-RULES section.

The `strategy-*` prefix and naming convention stays. Strategy docs that remain in the install
become purely operational reference — the name fits. Extracted explanatory content goes to the
docs site as pages organized by the site's information architecture, not as a new classified
doc type within `.arc/`.

For internal classification during implementation, the Diátaxis distinction (Reference vs
Explanation) is a useful working lens — but it's a tool for the extraction, not a permanent
taxonomy change.

**Axis 2 — arc/ vs project/ extraction.** Which content currently in `strategies/arc/` is
framework-development-only and shouldn't be in the distributable package at all? Example: the
complete file inventory in strategy-file-classification is a maintenance reference for ARC
framework developers — adopters don't need it. This content should live in `strategies/project/`
(project-level, not shipped). The new dev safeguard strategy from Deliverable 1 also belongs
in project/ from the start. Audit for other framework-dev-only content embedded in arc/
strategies.

**Axis 3 — Strategy doc prose quality.** Extracting explanation from strategy docs isn't just
moving paragraphs. Remaining operational reference content needs to stand on its own without
the "why" context that surrounded it. Extracted explanatory content needs to work as standalone
docs-site pages. Both sides need writing work. Strategy docs that have accumulated methodology
explanation mixed with operational reference may need rewriting to cleanly separate the two
concerns — even if the explanatory content ultimately stays in the install (because the CLI fix
eliminated merge burden), the Diátaxis clarity improves the docs regardless.

**Pre-PRD analysis (conducted during planning):**

Strategy docs by operational dependency:

- **Heavily workflow-referenced** (operational reference, stays in install):
  strategy-task-list-formatting (1,020 lines), strategy-work-organization (757),
  strategy-configurability-architecture (710), strategy-team-coordination (395),
  strategy-context-loading (267), strategy-quality-gates (243),
  strategy-work-planning (232)
- **Lightly referenced** (evaluate content split): strategy-core-philosophy (466, linked from
  DEV-RULES.ARC), strategy-adr-methodology (356, linked from DEV-RULES.PROJECT),
  strategy-session-management (211, evidence base)
- **Not workflow-referenced** (strongest docs-site candidates): strategy-file-classification
  (382), strategy-agent-hooks (216), strategy-backlog-organization (96)

Even heavily-referenced docs may contain explanatory sections that could extract to docs site
while operational content stays. The workflow reference anchors specific sections, not entire
files.

Strategy docs are already on-demand, never loaded at session-init. With the CLI fix, there is
no merge burden regardless of placement.

**Key constraint:** The docs site has full operational content (built out during WU4) but
limited methodology/philosophy content. Adding methodology canon may require new pages and
navigation structure.

**Questions to resolve:**

- With merge burden eliminated, is there still sufficient motivation to move explanatory
  content to docs site? (Discoverability and install focus vs simplicity of keeping everything
  in one place with direct references)
- For mixed docs: can operational sections be extracted cleanly, or is the content too
  integrated to split?
- What's the right cross-reference pattern for docs-site links? (Offline fallback?)
- Which content in arc/ strategies is framework-dev-only and should extract to project/?
- Does Axis 3 prose quality work belong here or in Deliverable 3 (language cleanup)?

**Implementation scope:** This deliverable includes the CLI update behavior fix, evaluation
across all three axes, and implementation of resulting changes (file moves, content extraction,
cross-reference updates, docs site content placement, strategy doc rewriting). This work
doesn't fit in downstream work units (Operating Modes is about mode architecture, not content
architecture).

**Output:** CLI fix implemented. Documented decisions on all three axes with rationale.
Implementation of resulting changes. Strategy docs that remain in the install are clean
operational reference; explanatory content lives on docs site (if the decision is to split)
or is cleanly separated within strategy docs (if the decision is to keep).

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

### 6. ARC Skill Exploration and Development

Systematically evaluate the ARC workflow surface for moments where human-invocable skills add value,
then develop the skills that pass the bar.

**Evaluation approach:** Walk the full pipeline (planning → PRD → task generation → execution →
integration → archival) and identify transition points where structured agent assistance helps the
human exercise judgment. For each candidate, assess: does this fill a real gap? Does it overlap with
existing workflows? Does it support human judgment or replace it? Is there a simpler alternative
(guidance, a workflow step, just doing it conversationally)?

**Candidates identified during plan exploration:**

**arc-plan** — Collaborative exploration setup for the idea → plan doc transition. Currently
unstructured; ARC has no process for the space between "vague notion of a work unit" and "plan doc
taking shape." Unlike typical agent "plan modes" (agent produces plan, human approves), this helps
the human formulate and explore _with_ the agent. The agent's role: gather relevant context (roadmap
position, related backlog items, prior upstream work, relevant codebase state), ask framing questions
that help the human articulate what's in their head, then get out of the way for freeform
conversation. Lightweight — establishes conditions for productive exploration, doesn't prescribe
exploration steps. Probably a skill triggering a short workflow (same pattern as arc-commit →
prepare-commits.md). The convergence from exploration to plan doc writing happens naturally; the
skill just ensures the conversation starts informed rather than from memory.

**arc-plan-audit** — Pre-PRD readiness assessment for plan documents. Gates the transition from
exploration to the create-prd workflow. Examines planning artifacts against requirements
completeness: unresolved decisions, untested assumptions, specificity gaps where the PRD will need
concrete details, scope coherence, downstream readiness (does the plan provide what the PRD template
needs?), staleness. Different concern surface from arc-task-audit (which is post-task-generation,
pre-implementation, codebase-grounded); this is post-exploration, pre-PRD, requirements-grounded.
The create-prd workflow's Step 1 has a brief inline readiness check ("assess PRD-readiness"); this
skill is the thorough version, invoked at user discretion.

**arc-review** — Post-task review aid at the mandatory stop. Surfaces structured information for
independent human judgment — not the agent's narrative (that's the completion report), but the raw
material the human needs to form their own view: where the implementation diverged from the task
spec, files modified not mentioned in the task, points where the task was ambiguous and the agent
chose an interpretation, judgment calls. Does not present the diff (the user has the code open).
Invoked at user discretion, not every mandatory stop.

**Together with existing skills, these form a coherent pattern:**

| Pipeline stage             | Skill              | Human need                                |
| -------------------------- | ------------------ | ----------------------------------------- |
| Idea → plan doc            | arc-plan           | Collaborative exploration setup           |
| Plan → PRD transition      | arc-plan-audit     | Is this plan ready for PRD?               |
| Task list → execution      | arc-task-audit     | Are these tasks ready for implementation? |
| Mandatory stop (execution) | arc-review         | Structured info for human judgment        |
| Session boundaries         | arc-resume/handoff | Context preservation                      |
| Commit                     | arc-commit         | Structured commit workflow                |
| Installation health        | arc-verify         | Validate ARC setup                        |

Eight skills total. Each human-invocable, judgment-driven, at a specific pipeline moment. Each
supports human judgment rather than replacing it.

**Output:** Systematic evaluation documented. Skills that pass the bar designed and implemented
(skill files + any supporting workflows). Skills connected to methodology docs per Deliverable 3.
The exploration itself has value even if some candidates don't make the cut — confirming "this
moment doesn't need a skill" is a useful finding.

---

## Sequencing

```text
1. Sync Audit (pre-safeguard)
   ↓
2. Methodology Boundary Definition (including human co-development posture)
   ↓ (informs language choices, placement decisions, and skill design)
3. Language & Positioning Cleanup ←→ 4. Content Placement Decision & Implementation
   (these can interleave — language cleanup may surface placement issues and vice versa)
   ↓
5. Conditional Content Architecture Evaluation
   ↓
6. Skill Exploration and Development
   (benefits from settled methodology boundary and language, but skill design can begin
   earlier — candidates are already identified, detailed design needs the boundary decisions)
   ↓
   → ARC Operating Modes work unit (downstream)
```

Deliverables 1 and 2 are strictly sequential (sync first, then methodology work on clean source).
Deliverables 3 and 4 can interleave — they touch overlapping files and inform each other. Deliverable
5 is late because it benefits from knowing the final content placement and methodology boundary.
Deliverable 6 can begin design work in parallel with 3-5 (candidates are already identified from this
plan's exploration), but implementation benefits from the settled methodology boundary and language
from Deliverables 2-3.

---

## Research

### Harness Engineering (Fowler, 2025)

**Source:** [martinfowler.com/articles/harness-engineering.html][harness-engineering]

**Core concept:** "Agent = Model + Harness." Harness engineering builds confidence in AI coding agents
through systems and controls around the model — preventative controls (**guides**, feedforward) and
observational controls (**sensors**, feedback).

**Mapping to ARC:**

| ARC Component                                           | Harness Term               | Direction                          |
| ------------------------------------------------------- | -------------------------- | ---------------------------------- |
| Spec-driven development, bounded tasks, context loading | Guides                     | Feedforward (steers before acting) |
| Review increments, quality gates, traceability          | Sensors                    | Feedback (observes after acting)   |
| Session continuity, context preservation                | Harness architecture       | State management                   |
| Human review at increment boundaries                    | Human-in-the-loop steering | Harness improvement                |

**Key positioning insight:** ARC operates one level above model-level harness. Agent platforms provide
model-level controls (tests, linters, architectural checks). ARC provides process-level controls — how
work flows between human and agent, how context is preserved, how the harness itself improves. They
compose: use your agent platform's harness for code quality, use ARC's harness for collaboration
quality.

**Human-side implication:** The harness engineering model naturally highlights ARC's gap. Sensors
(mandatory stops, quality gates) exist, but sensors need an interpreter. ARC specifies the sensor
without articulating what effective human interpretation looks like at review increments. The
methodology boundary work (Deliverable 2) should address this — the human's interpretive role is
methodology, not implementation.

**Terminology to adopt:**

- "Feedforward" for ARC's specification and context-loading patterns — these steer agent behavior
  _before_ it acts, not just evaluate it after
- "Harness" as a framing for what ARC provides — not a prompt template, not a wrapper, but a
  structured system of controls around the collaboration
- "Process-level harness" to distinguish from model-level agent tooling

### Documentation Architecture Research

Conducted during plan refinement (2026-04-06). External research on how frameworks handle the
split between shipped docs and external docs, and whether established taxonomies inform ARC's
strategy doc classification.

**Diátaxis framework (Procida)** taxonomizes documentation into four types: Tutorials
(learning-oriented), How-to Guides (task-oriented), Reference (information-oriented), and
Explanation (understanding-oriented). The critical principle: crossing or blurring type
boundaries is "at the heart of a vast number of problems in documentation."

ARC's strategy docs currently mix Reference (operational facts consumed by workflows — task list
format, tier definitions, branching rules) with Explanation (rationale, evidence bases,
philosophical foundations). Diátaxis strongly advocates separating these — they serve different
audiences, update at different frequencies, and have different distribution needs.

**Framework distribution patterns:** Established frameworks consistently externalize Explanation
while shipping Reference. Rails ships code configuration (structured, diffable), not
methodology prose. Kubernetes ships versioned reference docs but externalizes design rationale
and conceptual guides. SAFe and Scrum centralize methodology docs at canonical URLs rather than
bundling them in every adopter's implementation. No major framework ships explanatory "why"
content alongside operational tooling in a way that requires merge on update.

**Three-way merge for prose:** Universally recognized as a pain point. Git's merge is designed
for code (structured, deterministic), not documentation (prose, fragile). When frameworks DO
ship updatable content, they ship structured content (config files, schemas) where merge works
well, not explanatory prose where any rewording can conflict.

**Key finding for ARC:** The merge burden problem has two solutions that compose: (1) fix the
CLI to wholesale-replace Framework files (eliminates the mechanical problem), and (2) separate
Reference from Explanation using the Diátaxis taxonomy (eliminates the conceptual problem —
even if everything stays in the install, the separation improves doc quality). The CLI fix
resolves the urgency; the taxonomy refinement improves clarity regardless.

**Sources:** Diátaxis framework (diataxis.fr), CLI design guidelines (clig.dev), Kubernetes
documentation versioning, GitHub content model documentation, Rails update patterns,
three-way merge mechanics.

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

### Human Co-Development Gap Analysis

Conducted during plan refinement (2026-04-06). Examined ARC's operational support for the human side
of the co-development loop.

**Current state:**

- P2 and P11 articulate the principle: human as co-developer, shared context, mutual visibility
- The process-task-loop (agent-facing) is 260 lines of detailed protocol
- The human's role appears only as: recipient of completion reports, source of approval/denial
- "Implied permission" is the only operational guidance about how the human responds — and it
  codifies passive behavior
- arc-task-audit exists as a human-invocable pre-implementation tool but is invisible from ARC's
  methodology docs (documentation island)

**Key insight:** ARC specifies feedback sensors (mandatory stops) without articulating what effective
human engagement looks like at those moments. The methodology describes _that_ the human should be a
co-developer but not _what the practice looks like_. This is a methodology gap — it applies regardless
of tooling.

**Design constraint:** The human co-development posture must be descriptive ("this is what doing ARC
looks like") not prescriptive ("monitor yourself against this checklist"). Treat practitioners as
responsible engineers who want to understand the practice. Avoid paternalistic framing — anti-pattern
lists and self-monitoring checklists are the wrong voice.

**Skill gap:** The ARC skill set covers session boundaries, commits, pre-implementation analysis, and
installation health — but nothing at the review increment (where human participation matters most) or
the planning exploration phase (where co-development should begin). Three candidate skills identified:
arc-plan, arc-plan-audit, arc-review. See Deliverable 6.

---

## Relationship to Backlog Items

This work unit absorbs or advances several existing backlog items:

- **ATOMIC-INBOX: Internal path/reference audit** — Fully resolved by Deliverable 1, Phase 1
  (sync audit)
- **BACKLOG-TECHNICAL: Methodology Update Dependency Checklist / Guard** — Resolved by
  Deliverable 1, Phase 2 (dev safeguard: dependency map, strategy doc, hook evaluation)
- **BACKLOG-TECHNICAL: Methodology Specification Layer** — Resolved by Deliverable 2 (methodology
  boundary definition). Scoped as described in the backlog: light-touch foundation, not a separate
  product

---

## Open Questions

1. **Scope of language cleanup.** How deep does the pass go? Guidance is to prioritize
   externally-facing docs + philosophy strategy, with operational strategies cleaned only where
   they actively mislead. Final depth to be confirmed during task generation.

2. **Content placement post-CLI-fix.** With merge burden eliminated by wholesale replacement
   of Framework files, is there still sufficient motivation to move explanatory content to the
   docs site? The remaining motivations (discoverability, install focus, Diátaxis clarity) are
   real but weaker than the original merge burden argument. The Diátaxis separation (Reference
   vs Explanation) improves doc quality regardless of placement — the question is whether it
   also drives file relocation or just in-place restructuring.

3. **Docs site methodology content.** If explanatory content moves to the docs site, the site
   currently has limited methodology/philosophy pages (one philosophy page, conceptual
   scaffolding on the landing page). New pages, navigation, and information architecture for
   that content layer would be in scope.

4. **Strategy doc prose quality scope.** Extracting explanation from strategy docs requires
   rewriting both sides — remaining reference content stands alone, extracted explanation works
   as standalone pages. Some strategy docs (core philosophy at ~600 lines, work organization
   at ~400 lines) are large and may need substantial rewriting. Does this prose quality work
   belong in Deliverable 4, Deliverable 3 (language cleanup), or span both?

5. **Skill development depth.** Three candidate skills identified (arc-plan, arc-plan-audit,
   arc-review). All may not survive detailed design — the exploration itself has value. How much
   implementation is in scope? Options: full implementation of all that pass the bar, or design
   only with implementation deferred. Recommendation: implement within this WU — skills are
   bounded in scope and benefit from being available during downstream work (Operating Modes,
   Dogfooding).

6. **arc-plan workflow weight.** The collaborative exploration skill needs to be light enough
   that it doesn't make planning feel like a Procedure. The design challenge is structuring the
   collaboration (context gathering, framing questions) without structuring the content
   (exploration direction, plan shape). Need to validate that the skill adds value over just
   starting a conversation.

---

[harness-engineering]: https://martinfowler.com/articles/harness-engineering.html
