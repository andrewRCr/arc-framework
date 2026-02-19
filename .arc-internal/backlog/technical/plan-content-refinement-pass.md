# Plan: Content Refinement Pass

## Overview

Planning document for addressing findings from the `.arc/` template system refinement
evaluation. The evaluation reviewed all 37 template files and identified 12 adopter
concerns, 8 strengths, and structural observations. This plan organizes those findings
into actionable work areas with rough sequencing.

**Status:** Initial broad planning (pre-PRD)
**Created:** 2026-02-17
**Source:** evaluation notes (deleted at archival — findings incorporated into PRD and task completion notes)
**Roadmap context:** Phase B.2 (general refinement pass — fixes phase)

---

## Strengths to Preserve

The evaluation identified 8 things working well. These are guardrails during
refinement — don't break what's working:

1. **Three-tier structure** (active/backlog/reference) — immediately understandable
2. **Numbered workflow sequence** (0-3) — clear onboarding path for project setup
3. **Work categorization** (feature/technical/incidental) — practical, well-reasoned
4. **Session handoff** — genuine innovation for AI context preservation
5. **Strategy vs ADR distinction** — valuable conceptual clarity
6. **GTD-inspired backlog pipeline** — proven pattern (inbox → review → plan → execute)
7. **Tiered quality gates** (1/2/3) — practical balance of thoroughness and velocity
8. **Agent-agnostic core + agent-specific extensions** — sound architecture

These strengths were preserved as guardrails throughout the refinement pass execution.

---

## Work Areas

### Area A: Agnosticism Corrections

**Priority:** High — principle violations, not design choices
**Scope:** Corrective

Two dimensions of agnosticism are core tenets that currently have violations:

**A1. Project-type and tech stack agnosticism**

Core workflows, strategies, and examples carry implicit assumptions from CineXplorer
development (full-stack web app, Docker, feature branches with PRs, substantial test
infrastructure). These aren't intentional design choices — they're artifacts of where the
framework was battle-tested.

The fix is *correction*, not "acknowledge the framework's sweet spot." The framework
should genuinely work for any project type within reason: CLI tools, libraries, data
pipelines, documentation projects, monorepos, etc.

What needs attention:

- Workflow language and examples that assume backend + frontend
- Strategy content with stack-specific assumptions
- Template examples overly flavored by one project type
- Conditional framing needed where sections only apply to certain project types
  (e.g., frontend-specific rules in DEVELOPMENT-RULES.example.md)

**A2. Agent and tooling agnosticism**

Agent-specific content has leaked into framework-generic documents:

- `3_process-task-loop.md`: "TodoWrite Tool" section with Claude Code JSON examples —
  should generalize to "session-scoped tracking tools" or move to agent files
- `agent-pre-merge-review.md`: Primarily a CodeRabbit workflow with thin "adaptable"
  veneer — needs a tool-agnostic core with agent-specific details separated out

**A3. Document audience clarity**

Framework documents serve different audiences, but this isn't documented or obvious:

- **Agent-executed**: session-init, session-handoff, CURRENT-SESSION, process-task-loop
  — operational procedures that agents follow step-by-step. A human dev doesn't need to
  read these in the core loop (only when customizing or understanding the framework).
- **Dual-audience / shared context**: roadmap, backlogs, ADRs, strategies, constitution
  docs, task lists — project knowledge consumed by both humans and agents equally,
  establishing a common baseline for onboarding, reference, and alignment.
- **Human-facing**: README, getting-started materials, adoption docs — the human
  evaluates or onboards with these; agents don't need them.

Without this distinction, a human adopter might read session-handoff trying to understand
the framework and wonder why it's so procedural — not realizing it's literally a
step-by-step agent instruction set, not something they need to internalize. Conversely,
they might skip DEVELOPMENT-RULES thinking "that's for the AI" when it's actually shared
context they should understand too.

This should be addressed through framing in entry-point materials (`.arc/README.md`,
getting-started content) and potentially brief audience indicators in documents themselves
(light touch — not heavy metadata, just a one-line note where helpful).

**Why do this first:** Agnosticism corrections are foundational. Subsequent template
cleanup, streamlining, and adoption work should build on a properly-agnostic base rather
than cleaning up content that still carries bias.

---

### Area B: Template Consistency

**Priority:** High — concrete mismatches and confusion points
**Scope:** Mostly mechanical once approach is decided

**B1. Inconsistent tokenization in example files**

Some templates use `{{TOKENS}}` throughout (QUICK-REFERENCE.example.md, AGENTS.example.md)
while others have tokens in the header but project-specific content in the body:

- `META-PRD.example.md` — all body content is CineXplorer-specific (movie discovery,
  watchlists, TMDB API) despite header tokens
- `TECHNICAL-OVERVIEW.example.md` — line 9 hardcodes "CineXplorer"; body is 100%
  project-specific
- `PROJECT-STATUS.example.md` — 130+ lines of CineXplorer completion history

**Proposed approach:** Templates should provide structure + inline guidance (what goes
here, why it matters) + tokens for user-owned content. NOT full project content that must
be entirely replaced. An adopter should be able to *fill in* the template, not *strip out
and replace* existing content.

**Three-way merge rationale:** This approach is also optimal for the distribution system's
three-way merge (see `plan-distribution-and-update-system.md`). When framework guidance
and user content occupy *different lines*, the merge algorithm can cleanly separate
framework updates from user customizations. Templates with 100% project-specific body
content (like the current CineXplorer-heavy examples) are the worst case for merge:
the user replaces every line, so every future framework structural change to that section
is a guaranteed conflict. Structure + guidance + tokens keeps framework-owned and
user-owned content on separate lines, minimizing conflict surface.

**B2. CURRENT-SESSION template vs handoff workflow mismatch**

`CURRENT-SESSION.example.md` has: "Feature Documents", "Work Type", "Outstanding
Questions", "Notes for Next Session."

`session-handoff.md` expects: "Following Task List: Yes/No", "Current Task: Task X.Y
(line NNN)", "Remaining Work Before Returning to Task List", "Additional Context for
Next Session."

These are different enough that an adopter following the template would produce a
CURRENT-SESSION that the handoff workflow doesn't recognize. Fix: align the template
to match the workflow (the workflow's fields are more precise and useful).

**B3. Completion sample inadequacy**

`archive/technical/completion-sample.example.md` is 5 lines with non-standard YAML
frontmatter. The `archive-completed.md` workflow describes a detailed template with
Summary, Key Deliverables, Implementation Highlights, etc. The sample should match.

**B4. Phantom strategy references**

`STRATEGY-INDEX.md` lists project-specific strategies (strategy-component-styling.md,
strategy-authentication.md, etc.) as if they exist. Needs clearer framing: "these are
examples of strategies you might create for your project."

Similarly, `DEVELOPMENT-RULES.example.md` references `strategy-testing-methodology.md`
and `strategy-type-safety.md` — project-level strategies listed as if they should exist.

---

### Area C: Streamlining Ceremony

**Priority:** Medium-high — valid concern, requires judgment
**Scope:** Analytical + editorial

The three examples cited in the evaluation are genuine extremes:

1. **`atomic-commit.md`** (~430 lines, 6 mandatory pre-commit steps) — Much of the
   ceremony exists to catch multi-session uncommitted work where the agent has lost
   context. But session boundary protocols (handoff) now capture uncommitted work, and
   agents have generally improved at tracking their own changes. The "discovery" steps
   that scan for unknown uncommitted work may be reducible.

2. **`maintain-task-notes.md`** (~860 lines) — The two-mode system (mid-work vs archival)
   is sound. The bulk comes from accumulated institutional knowledge: lessons learned,
   common pitfalls, edge cases. The substance is valid but the delivery is verbose.
   Pattern: "keep the what, trim the why-we-learned-this-the-hard-way."

3. **`strategy-task-list-formatting.md`** (~1520 lines) — Comprehensive formatting spec.
   Has a Quick Format Checklist at top (good). But the extensive edge cases and detailed
   explanations of each rule could be moved to appendix-style sections.

**Note on Autonomous Work Mode** (`CLAUDE.md` and agent-specific docs): This feature
is NOT at odds with the framework's philosophy and should not be streamlined away. It's
a bounded exception for practical situations — dev steps away briefly (lunch, meeting),
current task list has well-defined items with high certainty, and the agent works through
a parent task's subtasks for bulk review on return. The distinction is "one parent task
before pausing for review" vs "one subtask before pausing" — still bounded, still
reviewed, just slightly wider batches during predictable absences. May benefit from
clearer framing that positions it as a practical concession within the tight-coupling
philosophy rather than a separate mode of operation.

**Broader principle:** This isn't limited to these 3 files. A general "streamlining
without losing legitimate value" pass could benefit many documents. The approach:

- Identify essential guidance vs explanatory/historical context
- Keep essential guidance in the main flow
- Move detailed rationale, edge cases, and lessons-learned to appendix sections
  or trim entirely where the guidance is now self-evident
- Consider whether session-boundary improvements have made certain safeguards redundant
- Evaluate examples: are there too many? Can some be consolidated?

**Dependency:** Streamlining should apply the "essentials first, depth later" ordering
principle from Area E. When deciding what to keep in the main flow vs what to trim or
move to appendix-style position, consider: would a reader who stops at 60% still have
everything they need for normal use?

---

### Area D: Content Fixes

**Priority:** Medium — bounded corrections
**Scope:** Small, mostly mechanical

**D1. Co-development and parallel work (undocumented)**

The framework doesn't currently address that the developer isn't idle while the agent
works. In practice:

- Developer often watches the agent work, catching wrong paths and unclear requirements
  early (this is common and valuable, not passive)
- Sometimes developer works on parallel tasks (atomic items, off-list work) while the
  agent handles clearly-scoped subtasks
- Co-development happens: developer writes code too, reviews go both ways
- The agent/human coding ratio varies by developer preference and task type

This needs representation in:

- Agent-facing docs: guidance that the developer may be making changes in parallel,
  so unexpected diffs are normal (not something to flag as anomalies)
- Process docs: acknowledging co-development as part of the workflow, not an exception
- Philosophy/principles: "staying connected to the codebase" as a key benefit of the
  single-threaded, small-scope approach (not just quality control)

**D2. Specific identified fixes from the evaluation:**

Specific identified fixes from the evaluation:

- **"Collaborative voice" rule** (DEVELOPMENT-RULES.example.md) — needs a concrete
  example to clarify what "third-person references to collaborators" means in practice
- **`activate-work-unit.md`** — uses `git add -A` which could stage sensitive files;
  should use specific file staging
- **`manage-incidental-work.md`** — double horizontal rule at line 306-307
- **Team language in `0_define-constitution.md`** — "Team Review" and "Team communication"
  should generalize to "Review with collaborators" or similar
- **`2_generate-tasks.md`** — references `strategy-testing-methodology.md` without
  clarifying it's a project-level strategy adopters would create
- **`agent/README.md`** — migration from AI-SHARED.md section may be stale for new
  adopters who never had that file
- **`agent-pre-merge-review.md`** — "Metrics & Outcomes" table uses estimated data;
  should clarify these are illustrative
- **`strategy-adr-methodology.md`** — template section duplicates content from
  `adr-template.md`; minor redundancy to resolve
- **Session-init reading list weight** (concern 6) — this is a human-adopter concern,
  not an agent concern. The full reading list is by design: agents start with zero
  context and need complete constitutional loading every session. The perceived weight
  is an *evaluation* problem (adopter sees 7-8 docs and feels overwhelmed), not a
  *runtime* problem. Address through better framing in entry-point materials (Area E),
  not by reducing what agents read

These can be swept up alongside or interleaved with larger work areas.

---

### Area E: Adoption Experience & Philosophy

**Priority:** Highest conceptually — but executes last
**Scope:** Design-heavy, depends on A-D outcomes

#### E1. Philosophy Articulation

**This is the framework's core differentiator and it's currently invisible.**

ARC is built on a specific philosophy of human-agent interaction: *disciplined
collaboration over automation. Deliberately coupling human judgment with agent
capability, not separating them through delegation. Single-threaded, tight feedback
loop. Iterative refinement and co-development over raw throughput.*

This philosophy DOES manifest in the framework mechanics — the one-subtask rule with
mandatory stop, manual commit control, "stop on anomalies," session handoff as an
explicit human-initiated action. But it's expressed as *rules*, not as a *coherent
vision*. Nobody reading the framework encounters a statement that ties them together.

What an adopter sees: a series of process rules ("complete ONE sub-task at a time,"
"AI NEVER initiates commits," "MANDATORY STOP after reporting"). What they don't see:
*why* these rules exist as a coherent philosophy. Without that framing, the rules can
feel arbitrary or overly controlling. With it, they make intuitive sense — and an
adopter can evaluate whether this philosophy aligns with how they want to work.

**What's needed:**

- A clear, concise philosophy statement somewhere prominent in the framework — not a
  manifesto, but a "principles" section that ties rules to vision
- The `.arc/README.md` and getting-started materials should lead with this
- The portfolio copy (`arc-portfolio/src/data/projects.ts`, lines 102-175) articulates
  this well but needs adaptation from portfolio context to framework foundation context
- Individual workflow and rules docs could briefly reference the philosophy when stating
  rules, connecting "what" to "why" (light touch — a sentence, not a paragraph)

**Philosophy alignment as a lens during A-D work:**

As we touch each document for agnosticism corrections, template cleanup, and
streamlining, also ask: "Does this lean into the philosophy, undermine it, or just
not engage with it?" This doesn't need to be a separate full audit — it's a lens
applied while doing the other work. If significant misalignments surface, capture them.

#### E2. Adoption Experience

Three related concerns:

1. **Volume is intimidating** — 37 files, 15k+ lines for a documentation framework
2. **No quick-start path** — no "adopt ARC in 30 minutes" guide
3. **Framework doesn't address its own learning curve** — presents all documentation
   as equally important from day one

Three things need to be more immediately clear to evaluators and new adopters:

1. **Value proposition** — what ARC solves and why it matters (grounded in E1 philosophy)
2. **Structure and daily workflow** — what the day-to-day actually looks like
3. **Getting started** — how to be up and running without absorbing everything first

**What "better adoption experience" actually means:**

This is NOT about multiple framework versions, "lite" modes, labeled "Advanced"
sections, or reducing what agents read per session. Those approaches create maintenance
burden, merge complexity, artificial structure, or undermine the core value proposition.

Instead, it's two practical things targeting the *human adopter/evaluator*:

1. **Clear entry points** — The README and a getting-started guide serve as the map
   that says "here's what matters first, here's where to go deeper." This is a layer
   *on top of* the documents, not a change to the documents themselves. Critically,
   this should make the **core development loop** immediately obvious:

   ```text
   resume-current → session-init → process-task-loop → ... → session-handoff
                                                                     │
         [new session] ◄─────────────────────────────────────────────┘
   ```

   This is the daily rhythm: dev resumes, agent initializes with full project context,
   work proceeds under the task loop, and when the context window approaches capacity
   the dev triggers handoff to preserve state for the next session. Everything else —
   defining constitution, creating PRDs, generating task lists, managing incidental
   work, archiving completed work, writing ADRs/strategies — is supplemental to this
   core loop. Define-constitution is essentially a one-time setup. PRD/task-list
   creation happens when new work is planned. The core loop is what repeats.

2. **Well-ordered documents** — Documents should front-load actionable guidance.
   Rationale, edge cases, and accumulated lessons come later — not labeled as
   "advanced," just positioned so a reader who stops at 60% still got everything they
   need for normal use. This is just good technical writing applied consistently.
   (The task-list-formatting doc's "Quick Format Checklist" at the top already
   demonstrates this pattern well.)

**Important distinction — two audiences, two concerns:**

- **Human adopter** evaluating the framework sees 37 files / 15k+ lines and feels
  overwhelmed. Solution: clear entry points, core loop explanation, getting-started
  guide. "You don't need to understand all of this to start."
- **Agent** starting a session sees 7-8 docs to read. This is *by design* — agents
  start with zero context and need complete constitutional loading every session.
  The full reading list IS the value proposition of session-init. Do not reduce it.

#### E3. Aspirational README (Concrete North Star)

**Create a goal-state README in this dev repo as a guiding artifact.**

The current README is stale. Rather than refresh it incrementally, create an
*aspirational* README that represents how the framework should present itself to a
fresh developer — clearly labeled where content is placeholder or forward-looking.

**Why this helps:** Forces concrete decisions about how to communicate:

- **What it is** — philosophy and practical description (draws from E1)
- **Why it matters** — value proposition, what problem it solves, what's different
  about ARC's approach vs "just use cursor rules" or similar
- **How to use it** — installation (placeholder `npx arc-framework init`), quick
  start, core loop explanation, where to go deeper
- **What the daily workflow looks like** — the resume → init → work → handoff loop

Writing this as a "goal README" means we can include the distribution instructions
(clearly marked as placeholder/future) and use it to guide content work — if something
in the README claims the framework does X, the actual docs need to deliver on X.

**This is a dev-repo artifact, not the public README.** The public repo
(`arc-framework`) will get its own README when created. This aspirational version
lives in the private dev repo as a planning/alignment tool.

**Timing:** Could be done early (before or alongside Areas A-D) since it serves as
a north star for the content work. Writing it forces clarity about what matters most
to a new user, which directly informs prioritization within A-D.

#### E4. Auto-Compact Prohibition (Undocumented, Critical)

The framework assumes sessions end with explicit handoff, not context degradation.
If an agent auto-compacts mid-session, it potentially loses constitutional context
loaded during session-init (dev rules, quality gates, command patterns, etc.). This
needs to be documented:

- In agent-specific docs (CLAUDE.md, etc.): disable auto-compact, explain why
- In session-init or session-handoff workflows: note the assumption that sessions end
  with handoff, not compaction
- In getting-started / adoption materials: surface this as a setup requirement

#### E Summary

The principle informing Areas A-D: when editing any document, ensure the top is
sufficient and the bottom is depth. Not a labeling exercise — just intentional
information ordering. Additionally, apply the philosophy alignment lens from E1.

**Deferred specifics:** The concrete implementation of entry points and getting-started
materials (E2) depends on:

- Distribution system design (what's configurable, what's CLI-driven)
- How the framework looks after Areas A-D (what content remains, how it's structured)
- Structural analysis pass outcomes (file classification, dependency mapping)

E2 should be planned in detail after A-D are substantially complete. E1 (philosophy
articulation) and E3 (aspirational README) can begin earlier — they serve as north
stars for the content work.

---

## Sequencing

```text
Phase B.2 Refinement Pass — Proposed Order:

  E1 (Philosophy) ──┐
  E3 (Aspirational   ├──► A (Agnosticism) ──► B (Templates) ──► C (Streamlining) ──► E2 (Adoption)
      README)       ─┘                                                │                  E4 (Auto-compact)
                                                                      │
  D (Content Fixes) ──────── can interleave throughout ───────────────┘
```

**E1 + E3 first (north stars):** Philosophy articulation and the aspirational README
can begin before content work — they establish what the framework is trying to
communicate and serve as alignment tools for A-D decisions. These don't need to be
perfect; they're working documents that evolve as content work proceeds.

**A → B dependency:** Template cleanup should build on agnostic content, not clean up
content that still carries project-type or agent bias.

**B → C soft dependency:** Streamlining is easier with consistent, clean templates as
baseline. But not strictly blocked — can overlap.

**A-D → E2 dependency:** Adoption experience implementation (entry points, getting-
started materials) depends on knowing the final shape of the framework content.
Strongest dependency in the chain.

**D is independent:** Small fixes can be batched or interleaved with any area.

**Philosophy alignment lens:** Applied throughout A-D as a cross-cutting concern.
When touching any document, ask: "Does this lean into the tight-coupling philosophy,
undermine it, or just not engage with it?" Not a separate pass — a lens on existing
work. Significant misalignments get captured for E1/E2.

**Interaction with structural passes:** Areas A-D are content-focused (what the docs
say). The structural analysis pass (Roadmap B.3) is structure-focused (how docs are
organized, file classification, mixed-concern separation) through the lens of
distribution readiness. These are complementary: clean content first, then optimize
structure. General principle: keep distribution/merge-friendliness in mind during
content work (especially the Area B template approach), but content corrections
shouldn't be blocked by structural considerations. If Area C streamlining reveals
needs for between-document restructuring (splitting files, moving sections to new
documents), note them for B.3 rather than executing them here.

---

## Resolved Decisions

1. **Template approach:** Structure + inline guidance + tokens for user content.
   Driven by three-way merge requirements — framework-owned and user-owned content must
   occupy separate lines to minimize conflict surface. See Area B1 for details.

2. **Adoption experience mechanism:** Good information architecture, not structural
   artifacts. Clear entry points (README, getting-started) that surface the core dev
   loop, well-ordered documents (essentials first, depth later). No multiple versions,
   no labeled "Advanced" sections, no lite framework, and no reducing agent session-init
   reading — the full reading list is by design. See Area E2 for details.

3. **Session-init is not the problem:** The 7-8 doc reading list is working as intended
   for agents. The "volume is intimidating" concern is a *human evaluator* problem, not
   an agent runtime problem. Solve through entry-point materials, not by scaling back
   what agents read.

4. **Philosophy must be explicit, not just emergent.** The framework's tight-coupling
   philosophy (single-threaded, human-in-the-loop, co-development over delegation) is
   the core differentiator but currently exists only as rules without rationale. It needs
   to be articulated as a coherent vision and serve as the foundation for adoption
   materials. See Area E1 for details.

5. **Autonomous work mode is compatible with the philosophy.** It's a bounded exception
   (one parent task scope, predictable absences, bulk review on return) — not a separate
   operating mode. Needs framing clarification, not removal. See Area C note.

## Open Questions

1. **Streamlining threshold:** How aggressively to trim? "Tighten prose and cut
   redundant examples" vs "restructure into essential core + appendix depth"?
   (Affects Area C scope. Note: deep restructuring overlaps with structural pass.)

2. **Scope boundary with structural pass:** If Area C streamlining involves moving
   sections to appendices or splitting documents, does that overlap with the structural
   analysis pass (Roadmap B.3)? Should content refinement stick to *within-document*
   changes and leave *between-document* restructuring to the structural pass?

3. **Distribution lens during content work:** The structural analysis pass (B.3) is
   primarily about distribution readiness. How much should that lens influence content
   decisions in Areas A-D? General principle: keep merge-friendliness in mind (avoid
   creating new interleaving of framework and user content), but don't let structural
   concerns block content corrections.

---

## Relationship to Other Plans

- **Roadmap Phase B.2** — This plan IS the detailed thinking for B.2
- **Roadmap Phase B.3** (structural analysis) — Complementary; this plan is content,
  B.3 is structure. Some overlap possible in Area C.
- **Distribution system** (`plan-distribution-and-update-system.md`) — E2 depends
  on distribution decisions; Areas A-D inform what content the distribution system
  delivers; template approach (B1) is designed for three-way merge compatibility
- **README refresh** (technical backlog) — Substantially overlaps with E3 (aspirational
  README). E3 may effectively supersede the standalone README refresh backlog item.
- **Public release** (`plan-public-release-repository-strategy.md`) — This plan feeds
  into release readiness
- **arc-portfolio** (`src/data/projects.ts`, lines 102-175) — Source material for
  philosophy articulation (E1). Portfolio description captures the vision well but
  in portfolio context; needs adaptation to framework foundation context.

---

**Next step:** Consider starting E1 (philosophy articulation) and E3 (aspirational
README) as early alignment work, then create PRD for Areas A-D when scope is clear.
