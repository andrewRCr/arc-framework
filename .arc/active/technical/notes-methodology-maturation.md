# Notes: Methodology Maturation

Implementation reference extracted from the plan document. Research findings, pre-PRD analysis
data, and design context that will be useful during task generation and execution.

---

## Research Findings

### Harness Engineering (Böckeler, 2026)

**Source:** [martinfowler.com/articles/harness-engineering.html][harness-engineering]

**Core concept:** "Agent = Model + Harness." Harness engineering builds confidence in AI coding agents
through systems and controls around the model — preventative controls (**guides**, feedforward) and
observational controls (**sensors**, feedback).

**Mapping to ARC:**

| ARC Component                                           | Harness Term               | Direction                          |
|---------------------------------------------------------|----------------------------|------------------------------------|
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
methodology boundary work should address this — the human's interpretive role is methodology, not
implementation.

**Terminology to adopt:**

- "Feedforward" for ARC's specification and context-loading patterns — these steer agent behavior
  _before_ it acts, not just evaluate it after
- "Harness" as a framing for what ARC provides — not a prompt template, not a wrapper, but a
  structured system of controls around the collaboration
- "Process-level harness" to distinguish from model-level agent tooling

### Documentation Architecture (Diátaxis + Framework Patterns)

**Diátaxis framework (Procida)** taxonomizes documentation into four types: Tutorials
(learning-oriented), How-to Guides (task-oriented), Reference (information-oriented), and
Explanation (understanding-oriented). Crossing or blurring type boundaries is "at the heart of a
vast number of problems in documentation."

ARC's strategy docs currently mix Reference (operational facts consumed by workflows — task list
format, tier definitions, branching rules) with Explanation (rationale, evidence bases,
philosophical foundations). Diátaxis strongly advocates separating these — they serve different
audiences, update at different frequencies, and have different distribution needs.

**Framework distribution patterns:** Established frameworks consistently externalize Explanation while
shipping Reference. Rails ships code configuration (structured, diffable), not methodology prose.
Kubernetes ships versioned reference docs but externalizes design rationale and conceptual guides. SAFe
and Scrum centralize methodology docs at canonical URLs rather than bundling them in every adopter's
implementation. No major framework ships explanatory "why" content alongside operational tooling in a
way that requires merge on update.

**Three-way merge for prose:** Universally recognized as a pain point. Git's merge is designed for code
(structured, deterministic), not documentation (prose, fragile).

**Key finding for ARC:** The merge burden problem has two solutions that compose: (1) fix the CLI to
wholesale-replace Framework files (eliminates the mechanical problem), and (2) separate Reference from
Explanation using the Diátaxis taxonomy (eliminates the conceptual problem). The CLI fix resolves the
urgency; the taxonomy refinement improves clarity regardless.

**Sources:** Diátaxis framework (diataxis.fr), CLI design guidelines (clig.dev), Kubernetes
documentation versioning, GitHub content model documentation, Rails update patterns.

### Methodology Floor Analysis

Conducted during ARC Operating Modes planning (2026-04-06). Full analysis in the operating modes plan
doc (`plan-arc-modes.md`); key findings:

- All 11 principles (P1-P11) are clearly methodology — tool-independent
- The `arc-methods.md` contract/default pattern is already a near-perfect methodology/implementation
  separator (contracts ≈ methodology, defaults ≈ implementation)
- 10 grey areas identified (enumerated in PRD Req 5)
- The philosophy strategy doc already has principle/convention splits for each P-item — the gap is in
  articulating the methodology layer as a cohesive whole, not in identifying individual boundaries

### Human Co-Development Gap Analysis

**Current state:**

- P2 and P11 articulate the principle: human as co-developer, shared context, mutual visibility
- The process-task-loop (agent-facing) is ~260 lines of detailed protocol
- The human's role appears only as: recipient of completion reports, source of approval/denial
- "Implied permission" is the only operational guidance about how the human responds — and it codifies
  passive behavior
- arc-task-audit exists as a human-invocable pre-implementation tool but is invisible from ARC's
  methodology docs (documentation island)

**Key insight:** ARC specifies feedback sensors (mandatory stops) without articulating what effective
human engagement looks like at those moments. The methodology describes _that_ the human should be a
co-developer but not _what the practice looks like_. This is a methodology gap — applies regardless of
tooling.

**Design constraint:** The human co-development posture must be descriptive ("this is what doing ARC
looks like") not prescriptive ("monitor yourself against this checklist"). Treat practitioners as
responsible engineers. Avoid paternalistic framing.

---

## Pre-PRD Analysis Data

### Strategy Doc Operational Dependency Mapping

Strategy docs by workflow/constitution reference count and operational role:

**Heavily workflow-referenced (operational reference, stays in install):**

| Strategy doc                          | Lines | Referenced from                                                                         |
|---------------------------------------|-------|-----------------------------------------------------------------------------------------|
| strategy-task-list-formatting         | 1,020 | generate-tasks, manage-incidental-work, integrate-work-unit, verify-work-unit           |
| strategy-work-organization            | 757   | process-task-loop, create-prd, activate-work-unit, integrate-work-unit, prepare-commits |
| strategy-configurability-architecture | 710   | arc-methods, arc-extensions, initial-setup, prepare-commits, rotate-branch              |
| strategy-team-coordination            | 395   | session-init, process-task-loop, session-handoff, activate-work-unit                    |
| strategy-context-loading              | 267   | arc-methods, DEV-RULES.ARC                                                              |
| strategy-quality-gates                | 243   | generate-tasks, process-task-loop, verify-work-unit, rotate-branch                      |
| strategy-work-planning                | 232   | create-prd, activate-planning-branch                                                    |

**Lightly referenced (evaluate content split):**

| Strategy doc                | Lines | Referenced from                        | Nature of reference            |
|-----------------------------|-------|----------------------------------------|--------------------------------|
| strategy-core-philosophy    | 466   | DEV-RULES.ARC (link for P-definitions) | Understanding, not operational |
| strategy-adr-methodology    | 356   | DEV-RULES.PROJECT (link)               | Guidance when writing ADRs     |
| strategy-session-management | 211   | session-loop, DEV-RULES.ARC            | Evidence base and thresholds   |

**Not workflow-referenced (strongest docs-site candidates):**

| Strategy doc                  | Lines | Notes                                          |
|-------------------------------|-------|------------------------------------------------|
| strategy-file-classification  | 382   | Reference taxonomy; file inventory is dev-only |
| strategy-agent-hooks          | 216   | Guidance for hook design                       |
| strategy-backlog-organization | 96    | Arc-in-git reference only                      |

Even heavily-referenced docs may contain explanatory sections that could extract to docs site while
operational content stays. The workflow reference anchors specific _sections_, not entire files.

Strategy docs are already on-demand, never loaded at session-init. With the CLI wholesale-replace fix,
there is no merge burden regardless of placement.

### Session-Init Context Baseline

Documents loaded at session init (~1,061 lines total):

| Document                  | Lines |
|---------------------------|-------|
| AGENT-BRIEFING.ARC.md     | 56    |
| AGENT-BRIEFING.PROJECT.md | 47    |
| CLAUDE.ARC.md             | 39    |
| DEV-RULES.ARC.md          | 357   |
| DEV-RULES.PROJECT.md      | 182   |
| STRATEGY-INDEX.md         | 84    |
| QUICK-REFERENCE.md        | 296   |

No strategy docs are loaded at session init. Only the STRATEGY-INDEX (84 lines) is loaded as an index.

### CLI Update Behavior — Current Implementation

**Key files:**

- `packages/arc-framework/src/lib/classification.ts` — File classification (Framework, Configurable,
  Scaffolded). Framework is the default for anything not in the Scaffolded or Configurable sets.
- `packages/arc-framework/src/lib/manifest/merge.ts` — Three-way merge with fast paths. The fast path
  `base === current` (no adopter changes) returns updated content directly — effectively wholesale
  replacement when adopters haven't modified the file.
- `packages/arc-framework/src/lib/manifest/apply.ts` — `applyChangePlan()` processes ALL non-scaffolded
  files through `mergeFileContents()` with no distinction between Framework and Configurable.

**The fix:** In `applyChangePlan()`, check `classifyFile(entry.templateFile)` before merging. If
Framework → write updated content directly (same as the "file missing from disk" path). If
Configurable → three-way merge as today. This eliminates merge conflicts for all 56 Framework files.

The existing fast path already handles the common case (adopter hasn't modified Framework files), so
the behavioral change only affects the uncommon case where an adopter has modified a Framework file —
which the classification says they shouldn't have.

### Install Root Surface Area

**Current `.arc/` root (6 items):**

```text
README.md  active/  backlog/  reference/  system/  user/
```

**Proposed (5 items, README removed):**

```text
active/  backlog/  reference/  system/  user/
```

**README content disposition:**

- Getting Started → docs site `getting-started.md` (already covered)
- Directory Structure → AGENT-BRIEFING.ARC.md has simpler version; docs site covers this
- Update behavior / File classifications → docs site `updating.md` (already covered)
- **Document Audiences table** → unique content, must extract to docs site before removal
  (four-audience taxonomy: agent-executed, collaborative, shared context, human-facing; plus
  explanation of audience headers in workflows)

**`user/` directory placement (ADR-012 context):**

- Currently at root per ADR-012 (unified user directory model)
- `system/` is described as "agent-facing operational files" — `user/` is a human personal workspace
  (ADR-012: "freeform personal workspace — scratch notes, reference links, investigation logs")
- Git notes refs (`refs/notes/arc/user/{identity}`) are path-independent
- CLI path construction is localized: `join(cwd, ".arc", "user", identity)` in `commands/user.ts`
- 141 occurrences of `user/` across 35 `.arc/` docs would need path updates if moved
- Leaning toward keeping at root; revisit if `system/` rename resolves semantic mismatch

---

## Skill Design Context

### Existing ARC Skills

arc-resume, arc-handoff, arc-commit, arc-task-audit, arc-verify

### Pipeline Coverage (with candidates)

| Pipeline stage             | Skill              | Human need                                |
|----------------------------|--------------------|-------------------------------------------|
| Idea → plan doc            | arc-plan           | Collaborative exploration setup           |
| Plan → PRD transition      | arc-plan-audit     | Is this plan ready for PRD?               |
| Task list → execution      | arc-task-audit     | Are these tasks ready for implementation? |
| Mandatory stop (execution) | arc-review         | Structured info for human judgment        |
| Session boundaries         | arc-resume/handoff | Context preservation                      |
| Commit                     | arc-commit         | Structured commit workflow                |
| Installation health        | arc-verify         | Validate ARC setup                        |

### arc-review Design Notes

Surfaces structured information for independent human judgment at the mandatory stop. Not the agent's
narrative (that's the completion report) — the raw material the human needs to form their own view:

- Where the implementation diverged from the task spec
- Files modified not mentioned in the task description
- Points where the task was ambiguous and the agent chose an interpretation
- Judgment calls the agent made

Does NOT present the diff (the user has the code open in their editor). Invoked at user discretion,
not every mandatory stop.

### arc-plan Design Notes

Collaborative exploration setup for the idea → plan doc transition. Unlike typical agent "plan modes"
(agent produces plan, human approves), this helps the human formulate and explore _with_ the agent:

1. Context gathering — reads roadmap, relevant backlog items, prior upstream work, relevant codebase
   state. The part that's genuinely tedious for a human to assemble manually.
2. Framing questions — orienting questions that help the human articulate what's in their head. Not a
   discovery checklist (that exists for PRDs), but exploration-level prompts.
3. Then freeform — the conversation happens naturally. No more structure needed.
4. Convergence signal — when the exploration has produced enough shape, helps transition to writing the
   plan doc.

Probably a skill triggering a short workflow (same pattern as arc-commit → prepare-commits.md).

### arc-plan-audit Design Notes

Pre-PRD readiness assessment for plan documents. Gates the transition from exploration to the
create-prd workflow. Different concern surface from arc-task-audit (post-task-generation,
pre-implementation, codebase-grounded); this is post-exploration, pre-PRD, requirements-grounded:

- Unresolved decisions — alternatives mentioned but no choice made
- Assumption inventory — what's taken as given that hasn't been validated
- Specificity gaps — areas where the PRD will need concrete details the plan doesn't provide
- Scope coherence — does everything serve one coherent purpose
- Downstream readiness — does the plan provide what the PRD template actually needs
- Staleness — plan references states or conditions that may have changed

---

## Phase 4 Research Findings: Content Placement

### Approach Decision: Hybrid Model

External research (two rounds, April 2026) confirmed the industry norm: no established developer
tooling or methodology framework ships explanatory/rationale content locally installed alongside
operational content. Categories surveyed: dev tooling (ESLint, Prettier, Husky, etc.), framework
scaffolding (Rails, Django, Next.js, Vite), methodology frameworks (SAFe, Scrum, DORA), AI dev
tooling (Cursor, Copilot, Windsurf, Aider), IaC (Terraform, Pulumi), docs-as-code tools.

**Closest analogue:** Next.js ships `AGENTS.md` with `create-next-app` — version-matched docs
consumed by AI agents during work. But it's operational API reference, not explanatory philosophy,
and uses comment boundary markers to prevent merge conflicts on update.

**Opinionated framework precedents:** Rails doctrine, Prettier rationale, Black philosophy, Angular
style guide — all keep philosophy/rationale on hosted docs, ship only operational defaults.

**Adopted approach — hybrid model:**

- **Operational reference** consumed by workflows/methods → stays local
- **Brief rationale context** (1-2 paragraphs per key decision, enough for agent to advise on
  "why") → stays local
- **Full explanatory content** (evidence bases, deep-dive analysis, philosophical foundations) →
  moves to docs site

This respects industry norms while preserving agent access to "why" context during sessions. Local
strategy docs become thinner operational reference with enough rationale to support agent advisory,
not bare-bones lookup tables.

### Pointer Patterns (Local → Hosted)

Research found three viable patterns for local-to-hosted connection:

1. **YAML frontmatter metadata** — `rationale-url` field, parseable by tooling and agents
2. **"See Also" sections** — brief pointer blocks at end of operational content
3. **Inline context sentences** — one-line "why" hint before pointer link

Decision on which pattern(s) to use: during Task 4.1 per-doc evaluation.

### Agent Access Post-Extraction

Three patterns identified for agent rationale access once explanatory content is hosted:

1. **WebFetch fallback** (zero infrastructure) — agent fetches docs site URL on demand. Works
   today, no setup, slower, requires internet.
2. **MCP server** (weekend-level effort) — existing open-source MkDocs MCP servers available
   (`@serverless-dna/mkdocs-mcp`, `douinc/mkdocs-mcp-plugin`). Basic impl ~100 lines.
3. **Hybrid local** (adopted) — brief rationale stays local, full explanatory on docs site.
   Agent has enough context without fetching.

**MCP server deferred** — docs platform may change from MkDocs; revisit when docs platform is
settled. WebFetch available as fallback if agent needs deeper rationale than local summaries
provide.

### .arc/README Removal Decision

Decision: remove entirely. Rationale:

- Content is duplicative — all blocks covered elsewhere (Getting Started → docs site, Directory
  Structure → AGENT-BRIEFING.ARC.md, Updating ARC → docs site, Document Audiences → extract
  to docs site before removal)
- Users at install point already know what ARC is (went through repo README and docs to get there)
- The "ambient discoverer" scenario (repo browser encounters .arc/) is real but serves ARC's
  adoption funnel more than the user's needs — not worth permanent root clutter
- The .arc/ directory structure (active/, reference/, system/) communicates purpose on its own;
  curious browsers will look up ARC independently
- Puts more pressure on docs site and repo README to handle onboarding flow well

### Sources

- Diátaxis documentation framework (diataxis.fr)
- Next.js AGENTS.md (nextjs.org/docs/app/guides/ai-agents)
- Rails Doctrine (rubyonrails.org/doctrine)
- Prettier Rationale (prettier.io/docs/rationale)
- Black Code Style (black.readthedocs.io)
- MCP server development (modelcontextprotocol.io/docs/develop/build-server)
- MkDocs MCP servers (github.com/serverless-dna/mkdocs-mcp, github.com/douinc/mkdocs-mcp-plugin)

### Docs Site Organization Pattern

External research (April 2026) on how concept-heavy framework docs sites organize explanatory
content relative to operational content. Surveyed: Kubernetes, Rails, Tailwind CSS, Angular,
Stripe, MkDocs Material capabilities, Diátaxis framework.

**Adopted pattern: Interleaved narrative + collapsible rationale (MkDocs Material native).**

Main narrative explains "what" and "how" with rationale woven naturally into the flow. Deeper
evidence, trade-off analysis, and design philosophy in collapsible `??? info` sections. Inline
`!!! tip` callouts for key insights. Heavy cross-linking between related concepts.

**Anti-patterns to avoid:**

- Dedicated `rationale/` directory → becomes a dead zone nobody visits
- Too many small pages → cognitive overhead of navigation, context lost
- Hard separation of "why" from "how" → readers lose context, "why" section ignored
- Mixing so thoroughly neither audience is served → long pages with no entry point

**MkDocs Material features for mixed content:**

- Collapsible admonitions (`??? info "Why this design?"`) — primary tool for rationale depth
- Inline admonitions (`!!! tip`) — key insights without disrupting flow
- Content tabs (`===`) — use sparingly, better for code variants than why/how pairs
- Navigation sections — max 3 levels deep, search as failsafe

---

## Task 4.1 Deliverable: Per-Doc Content Placement Decisions

### Per-Doc Decisions

**Full doc moves (entire strategy doc → docs site):**

| Doc                      | Lines | Decision                   | Rationale                                                                                                                                                                                                                                              |
|--------------------------|-------|----------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| strategy-core-philosophy | 466   | **Entire doc → docs site** | 100% explanatory/rationale. P1-P11 definitions, philosophical foundation, positioning, key concepts. No operational content consumed by workflows. Agents follow DEV-RULES.ARC, not this file. Industry norm: no framework ships its doctrine locally. |
| strategy-agent-hooks     | 216   | **Entire doc → docs site** | Supplementary operational reference. Not workflow-referenced. Rationale tightly woven with decision guidance (51% explanatory) — doesn't split cleanly. Adopter guidance for an optional mechanism.                                                    |

**Partial extractions (explanatory content → docs site, operational core stays local):**

| Doc                          | Lines | Extract %  | Stays Local | Extracted Content Summary                                                                                                                                                |
|------------------------------|-------|------------|-------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| configurability-architecture | 710   | 48% (~340) | ~370        | Customization model philosophy, adoption defaults philosophy, validation scenarios                                                                                       |
| work-organization            | 757   | 37% (~280) | ~475        | Problem-solution narrative ("The Challenge"), core principles, incidental work rationale, branch protection trade-offs                                                   |
| task-list-formatting         | 1,020 | 22% (~220) | ~700        | Design rationale, structural vs style explanation, annotated example, pedagogical content                                                                                |
| team-coordination            | 395   | 48% (~190) | ~210        | Handoff rationale, branching pattern trade-offs, merge conflict philosophy, tracker complementarity                                                                      |
| context-loading              | 267   | 45% (~120) | ~155        | Three-tier model philosophy, instruction density concept, adopter scaling rationale                                                                                      |
| work-planning                | 232   | 45% (~105) | ~135        | Planning pipeline concept, plan document philosophy, readiness signals                                                                                                   |
| quality-gates                | 243   | 39% (~95)  | ~150        | Core philosophy, escalation rationale, decision guidance                                                                                                                 |
| session-management           | 211   | 45% (~95)  | ~115        | Context degradation research (citations), focused sessions philosophy, auto-compaction rationale                                                                         |
| adr-methodology              | 356   | 24% (~85)  | ~270        | Industry context ("what ADRs are"), relationship to strategy docs. Rework for docs site: light summary of how ARC handles ADRs, not a deep explanation of what ADRs are. |
| file-classification          | 382   | 17% (~65)  | ~320        | "Why prefixes matter" section — design rationale for naming conventions                                                                                                  |
| backlog-organization         | 96    | 26% (~25)  | ~70         | ATOMIC-INBOX design rationale, inbox vs companion distinction                                                                                                            |

**Totals:** ~5,351 lines current → ~2,970 local / ~2,380 to docs site.

### Docs Site Extraction Target Mapping

**Proposed docs site navigation (post-extraction):**

```text
nav:
  - Home: index.md
  - Getting Started: getting-started.md
  - Methodology: methodology.md
  - Philosophy:
    - philosophy/index.md
    - The 11 Principles: philosophy/principles.md
  - How ARC Works: how-arc-works.md
  - Work Planning: work-planning.md
  - Updating ARC: updating.md
  - Customizing ARC:
    - Configuration: reference/customizing/configuration.md
    - Methods & Extensions: reference/customizing/methods.md
    - Agent Hooks: reference/customizing/hooks.md
  - Reference:
    - reference/index.md
    - Quality Gates: reference/quality-gates.md
    - Work Organization: reference/work-organization.md
    - Sessions & Context: reference/sessions.md
    - Skills: reference/skills.md
    - Team Coordination: reference/team-coordination.md
    - Task Lists: reference/task-lists.md
    - Glossary: reference/glossary.md
  - FAQ: faq.md
  - Contributing: contributing.md
```

**Changes from current structure:**

- Philosophy splits into section (2 pages) — too much content for single page
- Customizing ARC: new 3-page section — Configuration (settings + customization philosophy),
  Methods & Extensions (override mechanisms), Agent Hooks (hook integration guidance)
- Three new reference pages: Work Organization, Sessions & Context, Task Lists
- Three existing reference pages enriched: Quality Gates, Team Coordination, Glossary
- Existing "see strategy doc in your .arc/" pointers reverse direction — depth now lives on
  docs site, local files point to docs site for rationale

**Extraction target mapping by docs site page:**

`philosophy/index.md` (enriched — current philosophy.md restructured):

- ← core-philosophy: Philosophical Foundation evidence base (~80 lines, enriches "Three
  Observations" with citations and deeper evidence, collapsible sections)
- ← core-philosophy: Positioning — what ARC is/isn't, where it operates, agent compatibility
  (~60 lines, new section)
- ← core-philosophy: Principle/Convention Boundary explanation (~30 lines, enriches existing
  section on conventions vs principles)
- ← session-management: Context degradation research (~30 lines, collapsible evidence under
  bounded sessions reasoning)

`philosophy/principles.md` (new):

- ← core-philosophy: P1-P11 definitions with per-principle rationale and conventions list
  (~280 lines). Each principle gets: definition, "Remove this and..." reasoning, conventions.
  Per-principle rationale in collapsible sections for depth.

`methodology.md` (enriched):

- ← session-management: Focused sessions philosophy (~24 lines, enriches bounded sessions
  commitment section)

`how-arc-works.md` (lightly enriched):

- ← session-management: Auto-compaction rationale (~26 lines, collapsible under session
  lifecycle section)

`work-planning.md` (enriched):

- ← work-planning: Pipeline concept, plan document philosophy, readiness signals (~105 lines,
  rationale woven into existing narrative with collapsible deep dives)
- ← backlog-organization: ATOMIC-INBOX design rationale (~25 lines, collapsible section in
  backlog/capture context)

`reference/customizing/configuration.md` (restructured from current reference/configuration.md):

- ← configurability-architecture: Customization model philosophy, adoption defaults, three-tier
  flexibility explanation (~200 lines, rationale sections with collapsible deep dives)
- ← configurability-architecture: Validation scenarios (~60 lines, collapsible adopter
  walk-throughs)
- Retains existing arc-config.yml settings reference content

`reference/customizing/methods.md` (new, split from configuration):

- ← configurability-architecture: Method/extension mechanism explanation (~80 lines)
- Existing methods and extensions guide content restructured here

`reference/customizing/hooks.md` (new):

- ← agent-hooks: Entire doc (~216 lines). Platform landscape survey and value assessment in
  collapsible sections. Adopter guidance checklists as primary content.

`reference/quality-gates.md` (enriched):

- ← quality-gates: Core philosophy, escalation rationale, decision guidance (~95 lines).
  Replaces "see strategy doc" pointer. Collapsible sections for tier design rationale.

`reference/work-organization.md` (new):

- ← work-organization: Problem-solution narrative, core principles, incidental work rationale,
  branch protection trade-offs (~280 lines). Work categorization concepts, branching model
  design, incidental work philosophy. Collapsible sections for extended rationale.

`reference/sessions.md` (new):

- ← context-loading: Three-tier model philosophy, instruction density concept, adopter scaling
  (~120 lines)
- ← session-management: Remaining rationale fragments not placed elsewhere (~15 lines)
- "How ARC manages agent context" — session boundaries and context loading as one concern.

`reference/team-coordination.md` (enriched):

- ← team-coordination: Handoff rationale, branching pattern trade-offs, merge conflict
  philosophy, tracker complementarity (~190 lines). Replaces "see strategy doc" pointer.

`reference/task-lists.md` (new):

- ← task-list-formatting: Design rationale, structural vs style conventions explanation,
  annotated example (~220 lines). Pedagogical content for task list authors.

`reference/glossary.md` (enriched):

- ← core-philosophy: Key Concepts vocabulary table (~16 lines)

`contributing.md` (enriched):

- ← adr-methodology: Light summary of how ARC handles ADRs (~50 lines, reworked — not full
  industry context, just ARC's approach)
- ← file-classification: "Why prefixes matter" naming rationale (~40 lines, reworked for
  contributor audience)

### Local Strategy Consolidation (Post-Extraction)

**Removed (entirely docs site):**

- strategy-core-philosophy → gone
- strategy-agent-hooks → gone

**Consolidation candidates:**

- session-management (~115 lines) + context-loading (~155 lines) → combined
  "strategy-session-operations.md" (~270 lines). Both session-related operational reference.
  Different workflow trigger points but thematically unified. Combined file is still reasonable
  size for on-demand loading.
- backlog-organization (~70 lines) → fold into work-planning (~135 lines) as conditional
  section (arc-in-git specifics). Combined ~205 lines. Introduces template conditionals in
  strategies — new pattern but mechanically identical to existing workflow conditionals.

**Stays standalone:**

- file-classification (~320 lines) — taxonomy tables, inventory, naming conventions
- adr-methodology (~270 lines) — operational manual (when/how/format/lifecycle/amendments)
- task-list-formatting (~700 lines) — primary format reference, heavily workflow-referenced
- work-organization (~475 lines) — categories, decision rules, git workflow
- configurability-architecture (~370 lines) — config specs, extension/method mechanisms
- team-coordination (~210 lines) — workflow adaptations, ownership, branching patterns
- quality-gates (~150 lines) — tier specs, task list integration

**Post-consolidation: 13 files → 9 files, ~2,970 lines total locally.**

### Phase 5 Forward-Compatibility Guidelines

Phase 5 (Tasks 5.1-5.5) addresses methodology/implementation language distinction, harness
engineering positioning, and P1 rename. Since Phase 4 extraction touches most docs site pages,
apply these guidelines during extraction to avoid double-editing:

**Methodology vs implementation language:**

- New/rewritten docs site content should already distinguish "ARC's methodology requires X"
  from "the framework implements X through Y"
- Don't audit existing page content for this (that's Phase 5) — but don't introduce new
  conflation either
- "How ARC Works" page will likely be reframed in 5.1 to distinguish methodology mechanics
  from framework mechanics. New reference pages should use framework-aware language where
  appropriate (e.g., "the framework's quality gate system implements P4")

**P1 rename (Task 5.5):**

- ~35 files affected by rename away from "spec-driven development"
- During extraction, reference P1 by number or description ("written specifications before
  implementation") rather than embedding the current name. Avoids a rename pass on freshly
  written content.

**Harness engineering positioning (Task 5.4):**

- Goes into philosophy content and docs site "What is ARC" framing
- Since core-philosophy moves entirely to docs site and philosophy/ is being restructured,
  leave a natural insertion point in philosophy/index.md for a "Harness Engineering" section
- Don't pre-write the section — just don't structure pages in a way that makes adding it
  awkward

**Task 5.2 scope adjustment:**

- 5.2 targets strategy-core-philosophy for language cleanup, but that doc moves entirely to
  docs site in Phase 4. Phase 5.2 would operate on the docs site version (philosophy/
  section) instead. No conflict, but note the scope shift.

---

## Task 4.2 Deliverable: arc/ vs project/ Extraction Decisions

### Framework-Dev-Only Content Found

**1. File inventory in strategy-file-classification.md (~177 lines, lines 178-355)**

Per-directory tables listing every .arc/ file with Classification, Layer, and Notes. Framework
maintenance artifact — tracks what ships where, maintains two-copy architecture. Adopters
discover classifications via the taxonomy definitions and summary table (which stay), not
by reading 177 lines of per-directory tables.

**Decision:** Fold into `strategies/project/strategy-package-project-sync.md`, consolidating
with the existing dependency map. Avoids maintaining two parallel file listings.

**2. "Relationship to Strategy Documents" in strategy-adr-methodology.md (~30 lines, 325-356)**

Explains ARC's own documentation architecture: why ADRs and strategy docs are separate types,
pattern recognition flow (multiple ADRs → extract to strategy), why this separation matters.
This is framework design reasoning — adopters follow the ADR format, but they don't need to
understand how ARC organizes its own documentation taxonomy.

**Decision:** Move to `strategies/project/`. Could fold into package-project-sync or become
a lightweight "ARC documentation architecture" note. Small enough that exact placement is a
judgment call during implementation.

### Adopter vs Maintainer Rationale Assessment

Audited all content tagged for docs-site extraction in Task 4.1. Most rationale is
adopter-facing (explains why ARC works this way, helps adopters understand and buy in).

**Three "both" items** — design rationale embedded in adopter-facing content:

- context-loading: Three-Tier Model has design thinking mixed with adoption guidance
- task-list-formatting: Atomic Companion File has "Why a standalone file?" paragraph
- quality-gates: Core Philosophy explains design thinking + helps adopters understand gates

These don't warrant splitting — thin, and the collapsible section pattern handles dual audience
naturally on docs site. Adopters see guidance; collapsible section holds deeper design reasoning.

**Everything else is adopter-facing.** The arc/ strategies are written for adopters ("your
team," "your project"). Rationale content explains why ARC works this way, not why it was
built this way. The maintainer-vs-adopter split is narrow.

### Impact on 4.1 Totals

- adr-methodology: ~85 lines originally tagged for docs site → revised: ~55 lines docs site,
  ~30 lines project/
- File inventory: already excluded from 4.1 extraction (it was staying local) → now moves to
  project/ instead
- Net docs site: ~2,350 lines (was ~2,380). Net project/: ~207 lines.

### Post-4.1 + 4.2 State of strategy-file-classification.md

- Original: 382 lines
- After 4.1 (extract "Why prefixes matter"): -65 lines
- After 4.2 (move file inventory to project/): -177 lines
- Remaining: ~140 lines (taxonomy definitions + naming conventions + summary table)
- Still viable as standalone operational reference — the taxonomy and naming conventions are
  the primary content agents and adopters consume.

---

## Backlog Items Resolved

- **ATOMIC-INBOX: Internal path/reference audit** — Fully resolved by sync audit (PRD Req 1)
- **BACKLOG-TECHNICAL: Methodology Update Dependency Checklist / Guard** — Resolved by dev safeguard
  (PRD Reqs 2-3)
- **BACKLOG-TECHNICAL: Methodology Specification Layer** — Resolved by methodology boundary definition
  (PRD Reqs 4-6)

---

[harness-engineering]: https://martinfowler.com/articles/harness-engineering.html
