# Refinement Pass Notes — `.arc/` Template System

**Created:** 2026-02-17
**Scope:** All `.arc/reference/`, `.arc/active/`, `.arc/backlog/` docs (the deployable template system)
**Focus:** Content quality + fresh-eyes adopter perspective
**Mode:** Evaluation only (no changes applied)

---

## Table of Contents

1. [File-by-File Content Quality](#file-by-file-content-quality)
2. [Adopter Perspective — What Works Well](#adopter-perspective--what-works-well)
3. [Adopter Perspective — Concerns and Rough Patches](#adopter-perspective--concerns-and-rough-patches)
4. [Structural Observations (for subsequent structural pass)](#structural-observations)

---

## File-by-File Content Quality

### Core Workflows

**`workflows/0_define-constitution.md`**

- Clear structure, good step progression
- "Team Review" and "Team communication" language assumes team context, but framework
  is positioned for solo + AI dev. Could generalize to "Review with collaborators"
- References template paths as `.arc/reference/constitution/META-PRD.md` — should clarify
  these are `.example.md` files that adopters rename
- The "Quarterly Constitutional Review" section is good lifecycle guidance

**`workflows/1_create-prd.md`**

- Solid workflow, well-structured
- Notes-first pattern (Step 1.5) is well-explained and genuinely useful
- The distinction between feature and technical PRDs is clear
- Work organization strategy references are appropriate
- Clean overall — no major issues

**`workflows/2_generate-tasks.md`**

- Good structure, clear step progression
- Step 1.5 (simplify PRD headers) is a nice touch showing lifecycle thinking
- References `strategy-testing-methodology.md` which is a project-specific example in
  STRATEGY-INDEX — adopters won't have this file. Should clarify this is a project-level
  strategy they'd create if applicable
- Step 6 (review formatting standards) appropriately points to strategy doc

**`workflows/3_process-task-loop.md`** — *Core document, deserves careful evaluation*

- Heart of the framework; detailed and thorough
- **Issue: TodoWrite section is agent-specific.** The "TodoWrite Tool vs Task List Files"
  section (lines 112-153) references a specific Claude Code tool by name, with JSON examples.
  This is agent-specific knowledge embedded in a generic framework document. Adopters using
  other tools (Cursor, Windsurf, Gemini CLI) will find this confusing. Should either:
  (a) generalize to "session-scoped tracking tools," or (b) move to agent-specific docs
- The atomic task completion protocol is well-placed here
- Pre-report checklists are a good forcing function
- The "implied permission" note is a smart addition

### Supplemental Workflows

**`workflows/supplemental/session-init.md`** (template version)

- Well-structured with proper tokens
- Agent-specific file step (8) is appropriate
- The "CRITICAL PRINCIPLE" about lean docs is important framing
- Context mismatch handling (Step 5) is good defensive guidance

**`workflows/supplemental/session-handoff.md`**

- Very detailed with excellent examples
- Working directory context check is great for multi-directory projects
- **Issue: Template CURRENT-SESSION doesn't match handoff expectations.** The handoff
  doc describes specific fields: "Following Task List: Yes/No", "Current Task: Task X.Y
  (line NNN)", granular "Completed This Session" format. But `active/CURRENT-SESSION.example.md`
  has a much simpler structure with different field names. An adopter following the template
  would produce a CURRENT-SESSION that the handoff workflow doesn't expect.
- The four handoff examples are excellent but very CineXplorer-flavored — fine for
  illustration, but an adopter might not see how to adapt them
- Good length for the complexity it covers

**`workflows/supplemental/atomic-commit.md`**

- The most prescriptive workflow doc (~430 lines)
- The commit message standard itself is clear and well-documented
- **Concern: 6 mandatory analysis steps before every commit feels heavyweight.** Step 1.5
  (multi-session uncommitted work check), Step 2 (find related task docs), Step 3 (analyze
  task progress), Step 4 (validate milestone context), Step 5 (update task docs), Step 5.5
  (archive completed atomic tasks). A fresh adopter might reasonably ask: "Do I really need
  all this for a 3-line fix?"
- The Context footer format is complex but well-documented with many examples
- Context footer examples are the strongest part — they make the format concrete
- Might benefit from a "quick commit vs full ceremony" distinction (simple atomic tasks
  don't need all 6 steps)

**`workflows/supplemental/manage-incidental-work.md`**

- Clean, well-structured
- Decision criteria (task list vs atomic) are clear and well-reasoned
- Version history/changelog at bottom is nice
- The double horizontal rule at line 306-307 appears to be a formatting issue
- Good document overall

**`workflows/supplemental/agent-pre-merge-review.md`**

- Very CodeRabbit-specific despite "adaptable to other agents" framing
- 620 lines for a code review workflow is substantial
- The two-pass strategy concept (local + PR) is genuinely useful
- **Fresh eyes: An adopter without CodeRabbit would need significant mental translation.**
  The "Agent-Specific Adaptations" section (lines 447-462) only briefly covers non-CodeRabbit
  tools. Most of the document's detail (classification terms, CLI commands, reply formats)
  assumes CodeRabbit.
- The "Metrics & Outcomes" table uses estimated data — should be clearer that these are
  illustrative, not actual measurements
- Could benefit from a more tool-agnostic core with CodeRabbit-specific details in
  a supplementary section or agent file

**`workflows/supplemental/weekly-review.md`**

- Clear, actionable, well-scoped
- Good troubleshooting section
- Appropriately concise (~170 lines)
- Nice model for what supplemental workflows should look like in terms of length

**`workflows/supplemental/activate-work-unit.md`**

- Clear step-by-step with good checklist summary
- Step 8 uses `git add -A` which could accidentally stage sensitive files — contradicts
  general best practice of staging specific files
- Well-scoped document

**`workflows/supplemental/maintain-task-notes.md`**

- **The longest workflow doc at ~860 lines**
- Two-mode system (mid-work vs archival) is genuinely well-thought-out
- But the length could be intimidating. The "Lessons Learned" and "Common Pitfalls" sections
  feel like accumulated institutional knowledge from extensive use — valuable for the
  framework maintainer but potentially overwhelming for adopters
- The pointer directionality section (Step 1d) is complex — valid edge case handling but
  adds cognitive load
- The large-file cleanup tracking (CLEANUP-PROGRESS) shows thoroughness but adds process
- **Fresh eyes: "Do I really need 860 lines to understand how to clean up a task file?"**
  A shorter "essentials" version plus a "reference" appendix might be more approachable
- Content is high quality — the issue is density, not accuracy

**`workflows/supplemental/archive-completed.md`**

- 525 lines, three-phase structure is logical
- Phase 1 (on child branch) → Phase 2 (code review) → Phase 3 (on parent) is clean
- The "Generated Code Sync Check" section (1b) uses template tokens but feels like a
  specific project concern that might not apply broadly
- The "Partially Superseded Work" appendix is a nice edge case to cover
- Solid document

### Strategy Documents

**`strategies/STRATEGY-INDEX.md`**

- Clean index with good usage protocol
- **Issue: Project strategy examples are listed as if they exist.** The "Project Strategies"
  section lists specific files (strategy-component-styling.md, strategy-authentication.md,
  etc.) that won't exist for a new adopter. The header says "Create project-specific
  strategies in `project/` directory. Examples:" but it reads like a file listing rather
  than examples of what to create. Could use clearer "these are examples of strategies
  you might create" framing.
- ARC framework strategies section is accurate

**`strategies/arc/strategy-work-organization.md`**

- The most substantial strategy doc (~1250 lines)
- Three-way split is well-reasoned with clear decision tree
- Historical Note section is good transparency about framework evolution
- Migration guide is helpful for existing projects
- **The Backlog Organization section feels like it grew beyond the doc's original scope.**
  It covers TASK-INBOX.md, ATOMIC-TASKS.md, BACKLOG files, discovery mechanism, weekly
  review — this is comprehensive backlog management guidance embedded in a "work organization"
  strategy. Structural question: should this be its own doc?
- Anti-patterns section is excellent
- The industry alignment references (Meta, Google, Graphite) add credibility

**`strategies/arc/strategy-adr-methodology.md`**

- Well-structured, clear guidance
- "Relationship to Strategy Documents" section is excellent — clarifies a distinction
  that could easily be confused
- Good length — focused without being verbose
- The template section duplicates adr-template.md content — minor redundancy

**`strategies/arc/strategy-task-list-formatting.md`**

- **The longest strategy doc at ~1520 lines**
- Covers every formatting detail with examples
- The annotated example is extremely helpful
- But the sheer detail could be intimidating to adopters
- The "Quick Format Checklist" at the top is a good "TL;DR" approach
- Revision numbering (R Scheme) is a nice edge case solution
- **Fresh eyes: Is 1520 lines of formatting guidance proportional to the value?** Some
  of this detail might be better served by a shorter spec + examples, with the extensive
  edge cases in an appendix
- The Emoji Usage policy section is oddly specific for a framework doc

**`strategies/arc/strategy-quality-gates.md`**

- Well-structured tiered approach
- Clear, actionable, focused
- Good length (~250 lines) — a model for strategy doc sizing
- "Commits and quality gates" clarification is important
- Anti-patterns section adds value

### Constitution Templates

**`constitution/META-PRD.example.md`**

- Good structural template
- **Issue: Mixed templating approach.** Header uses `{{PROJECT_NAME}}` but body content
  is entirely CineXplorer-specific (movie discovery, watchlists, TMDB API). An adopter
  sees tokens suggesting "fill this in" but then finds content that's 100% specific to
  a movie app. Should either fully tokenize or use clearly marked [EXAMPLE] sections.
- The sections themselves (Purpose, Core Features, Success Metrics, etc.) are good guidance
  for what a META-PRD should contain

**`constitution/TECHNICAL-OVERVIEW.example.md`**

- Same mixed approach as META-PRD but more severe
- Line 9 hardcodes "CineXplorer" despite `{{PROJECT_NAME}}` in title
- Very detailed CineXplorer-specific content (Django Ninja, Chakra UI v3, specific service
  names, directory paths)
- **An adopter would need to replace essentially 100% of the content** — the template
  provides structure but the content examples are so project-specific they might be more
  confusing than helpful
- The structure IS good — it shows what level of detail is expected

**`constitution/PROJECT-STATUS.example.md`**

- Same pattern — CineXplorer everywhere despite header token
- The "Completed Major Work" section is enormous (130+ lines) — shows what a mature
  project status looks like, but overwhelming as a template
- Good table of contents approach
- Roadmap section structure is useful
- The Development Approach section references ADR-014 — project-specific

**`constitution/DEVELOPMENT-RULES.example.md`**

- **The best-templated constitution doc.** Uses proper tokens for project-specific values
  (`{{BACKEND_TEST_CMD}}`, `{{FRONTEND_LINT_CMD}}`, etc.)
- The structure is transferable
- **Minor issue: Frontend-specific sections** (Component Styling Standards, Import Standards)
  assume a frontend project. These are presented as universal rules but only apply to certain
  project types. Could use conditional framing: "Include if applicable"
- The commit-format skill reference (line 25) is agent-tool-specific
- Quality gate table format is excellent — clear and scannable

### Agent Templates

**`agent/AGENTS.example.md`**

- Good template, clean token usage
- AI Collaboration Principles section is the strongest part — genuinely valuable guidance
  that transfers to any project
- This is what a well-templated file looks like

**`agent/CLAUDE.example.md`**

- Good minimal template with proper reference chains
- **The Autonomous Work Mode section is substantial (~55 lines).** Could reference a
  workflow doc instead of containing the full protocol. But it's reasonable to have
  agent-specific behavioral guidance in the agent file.
- MCP Server section with placeholder is forward-looking
- Sub-Agent section is practical

**`agent/GEMINI.example.md` / `WARP.example.md` / `copilot-instructions.example.md`**

- All appropriately minimal
- Good reference chains to AGENTS.md
- The architecture (minimal tool files → central AGENTS.md) is sound

**`agent/README.md`**

- Thorough adoption guide with clear instructions
- Migration from AI-SHARED.md section — may be stale for new adopters who never had that
  file. Not harmful but adds length.
- Maintenance guidance is useful

### Active/Backlog Templates

**`active/CURRENT-SESSION.example.md`**

- **Issue (repeated from session-handoff): Structure doesn't match handoff workflow.**
  Template has "Feature Documents" section, "Work Type" field, "Outstanding Questions",
  "Notes for Next Session" — but the session-handoff workflow expects "Following Task List",
  "Current Task: Task X.Y (line NNN)", "Remaining Work Before Returning to Task List",
  "Additional Context for Next Session". These are different enough that an adopter would
  create a template that doesn't align with the workflow.
- The template is reasonable on its own — the mismatch with the workflow is the problem

**`active/ATOMIC-TASKS.example.md`**

- Clean, well-templated
- Good inline guidance with commented example
- Archive path uses proper quarter token

**`backlog/ROADMAP.example.md`**

- Good structure with phases, dependencies, scoping
- Change log section is practical
- Token usage is clean

**`backlog/TASK-INBOX.example.md`**

- Appropriately minimal — captures the GTD "inbox" concept
- Processing guidance is clear
- Good use of HTML comments for examples

**`backlog/feature/BACKLOG-FEATURE.example.md` / `backlog/technical/BACKLOG-TECHNICAL.example.md`**

- Clean templates with proper structure
- Priority sections (High/Medium/Lower) are practical
- "Completed (Reference)" section with strikethrough is a nice touch

### Other Reference Files

**`adr/README.md`**

- Clean, references strategy doc for details
- Finding section with bash commands is practical
- No separate index (by design) — good call to avoid duplication

**`adr/adr-template.md`**

- Clean template matching strategy doc format
- Good inline guidance

**`strategies/README.md` / `project/README.md` / `project/style/README.md`**

- All appropriately scoped directory READMEs
- Good guidance for what goes where

**`research/README.md`**

- Clean, good relationship to ADRs section
- Naming convention is clear

**`archive/README.md`**

- Thorough, well-structured
- Good navigation section with links
- Benefits section articulates value well

**`archive/technical/completion-sample.example.md`**

- **Too minimal.** The archive-completed workflow describes a detailed completion template
  with Summary, Key Deliverables, Implementation Highlights, Related Documentation, and
  Follow-Up Work sections. But this sample is 5 lines. An adopter following the sample
  instead of reading the full archive workflow would create something far too brief.
- The YAML frontmatter (role: example, do_not_copy: true) is unusual — no other template
  files use this pattern. Inconsistency.

**`reference/QUICK-REFERENCE.example.md`**

- Well-templated with proper tokens throughout
- Docker-centric examples are reasonable given the audience
- Network architecture section shows good thinking
- Anti-patterns section is practical

---

## Adopter Perspective — What Works Well

### 1. Three-Tier Structure Is Immediately Understandable

The `active/` → `backlog/` → `reference/` organization maps to a natural mental model:
what I'm doing now, what I'll do next, and stable knowledge. Anyone familiar with
knowledge management or GTD will get this instantly.

### 2. Numbered Workflow Sequence Creates Clear Onboarding

`0_define-constitution` → `1_create-prd` → `2_generate-tasks` → `3_process-task-loop`
gives adopters a clear "how to get started" path. The numbered prefix is a simple but
effective navigation aid.

### 3. Work Categorization Is Well-Reasoned

Feature/technical/incidental with the clear decision tree ("Was this planned?" → "Is it
user-facing?") is practical and easy to remember. The emphasis on type over size is a
genuinely good insight.

### 4. Session Handoff Is a Real Innovation

The structured approach to preserving context across AI sessions addresses a real pain
point. The idea that you need specific fields (current task with line number, uncommitted
work with commit-level granularity) to resume effectively is a genuine contribution.

### 5. Strategy vs ADR Distinction Is Valuable

"ADRs are point-in-time decisions; strategies are evolved patterns." This distinction
helps developers understand when to write which kind of documentation. The relationship
section in the ADR methodology strategy makes this concrete.

### 6. GTD-Inspired Backlog Is Proven

TASK-INBOX → weekly review → category buckets → plan files → PRDs → task lists. This
pipeline from raw idea to executable work follows well-known productivity patterns.

### 7. Quality Gates Tiered Approach Is Practical

The Tier 1/2/3 system (per-subtask / parent task / per-phase) is a sensible balance
between thoroughness and velocity. The strategy doc explains the reasoning well.

### 8. Agent-Agnostic Core with Agent-Specific Extensions

AGENTS.md as central hub → CLAUDE.md/GEMINI.md/etc. as minimal extensions is a sound
architecture. It lets the framework work with any AI tool while supporting tool-specific
optimization.

---

## Adopter Perspective — Concerns and Rough Patches

### 1. Volume Is Intimidating

The `.arc/reference/` directory has ~37 files totaling roughly 15,000+ lines. For someone
evaluating whether to adopt a *documentation framework*, that's a lot of documentation
to absorb. There's a paradox: the framework promises to make AI collaboration efficient,
but understanding the framework itself requires significant investment.

**Suggestion:** Consider a "minimal viable adoption" path — the 5-6 files you absolutely
need to start, with the rest as "adopt when you need it" reference material.

### 2. Framework Feels Built for One Specific Project

Many examples, edge cases, and detailed procedures clearly emerged from CineXplorer
development (Django + React full-stack web app). While templates use tokens, the core
workflows and strategies carry assumptions about:

- Full-stack web app with backend + frontend
- Docker-based infrastructure
- Feature branches with PRs and code review
- Solo developer + AI collaboration
- Significant test infrastructure

An adopter building something different (CLI tool, library, data pipeline, mobile app)
might find large portions irrelevant. The framework doesn't acknowledge or address this —
it presents itself as universal but feels like it was extracted from one project type.

**Suggestion:** Acknowledge the framework's origins and sweet spot. Provide guidance on
which parts apply to different project types.

### 3. Template Content Is Inconsistently Templated

Some templates use proper `{{TOKENS}}` throughout (QUICK-REFERENCE.example.md, AGENTS.example.md),
while others have tokens in the header but project-specific content in the body:

- `TECHNICAL-OVERVIEW.example.md` — line 9 hardcodes "CineXplorer"
- `META-PRD.example.md` — all content is movie-app-specific despite header tokens
- `PROJECT-STATUS.example.md` — 130+ lines of CineXplorer completion history

This creates confusion: "Am I supposed to keep this content? Replace it? Use it as
reference?" The answer varies by file, which is disorienting.

**Suggestion:** Either fully tokenize all templates, or clearly separate "structure to
copy" from "example content for reference."

### 4. Some Processes Feel Overly Ceremonious

The atomic-commit workflow has 6 mandatory analysis steps. The maintain-task-notes
workflow is 860 lines. The task-list-formatting strategy is 1520 lines. An adopter
might reasonably ask:

- "Do I really need 6 pre-commit analysis steps for a 3-line documentation fix?"
- "Do I need 860 lines of guidance to clean up a task file?"
- "Do I need 1520 lines of formatting rules for my task lists?"

The answer for a mature, complex project is "yes, these details prevent real problems."
But for someone starting out, the framework doesn't distinguish between essential and
advanced practices.

**Suggestion:** Consider marking guidance as "essential" vs "advanced" or "when you
need it." The quality-gates strategy does this well with its tiered approach — apply
the same thinking to process documentation.

### 5. Agent-Specific Content in Framework-Generic Docs

`3_process-task-loop.md` (a core workflow) includes a "TodoWrite Tool" section with
Claude Code-specific JSON examples. The framework is supposed to be agent-agnostic,
but this section only applies to Claude Code users. Other agent users would be confused.

Similarly, `agent-pre-merge-review.md` is primarily a CodeRabbit workflow with thin
"adaptable to other agents" veneer.

**Suggestion:** Move agent-specific tool references to agent files. Keep core workflows
tool-agnostic with generic language like "session-scoped tracking tools" instead of
"TodoWrite Tool."

### 6. Session Init Reading List Is Heavy

The session-init workflow requires reading 7-8 documents in full every session. For an
AI with context window constraints, this consumes significant capacity before work begins.
The framework's own principle of "keeping things lean" seems to conflict with the amount
of required reading.

This is somewhat mitigated by the "maintained to be lean" commitment, but the total
volume still adds up.

### 7. CURRENT-SESSION Template Doesn't Match Handoff Workflow

The `CURRENT-SESSION.example.md` template uses fields like "Feature Documents", "Work Type",
"Outstanding Questions", "Notes for Next Session." But the session-handoff workflow expects
different fields: "Following Task List: Yes/No", "Current Task: Task X.Y (line NNN)",
"Remaining Work Before Returning to Task List", "Additional Context for Next Session."

An adopter would create a CURRENT-SESSION from the template, then discover it doesn't
match the handoff workflow's expectations. This is a concrete content mismatch.

### 8. No Quick Start or Minimal Adoption Path

There's no "adopt ARC in 30 minutes" guide. The `.arc/README.md` lists 6 high-level steps,
each pointing to detailed workflow documents. An evaluating developer would need to read
several multi-hundred-line documents before understanding whether the framework is right
for them.

Competitor frameworks (like cursor rules, aider conventions, etc.) tend to have lower
barriers to first value.

### 9. Completion Sample Is Inadequate

`archive/technical/completion-sample.example.md` is 5 lines with a YAML frontmatter.
The archive-completed workflow describes a detailed template with Summary, Key Deliverables,
Implementation Highlights, Related Documentation, and Follow-Up Work. An adopter following
the sample would produce something far too minimal.

Additionally, its YAML frontmatter pattern (role, do_not_copy) appears nowhere else
in the template system — inconsistent.

### 10. The "Collaborative Voice" Rule Is Unclear Without Context

DEVELOPMENT-RULES says: "Commits, task lists, and project docs should read naturally from
an author or team perspective. Avoid third-person references to collaborators."

This makes sense when you understand it means "don't write 'Claude suggested X' in
commit messages." But without that context, an adopter might not understand what
"third-person references to collaborators" means in practice. A brief example would help.

### 11. Project-Specific Strategy References in Templates

DEVELOPMENT-RULES.example.md references `strategy-testing-methodology.md` and
`strategy-type-safety.md` — these are project-specific strategy docs listed as examples
in STRATEGY-INDEX. But they appear as if they should exist. An adopter might think
they're missing framework files rather than understanding they're examples to create.

### 12. The Framework Doesn't Address Its Own Learning Curve

There's no section that says "this is complex, here's how to approach it" or "start
with X, add Y when you need it." The framework presents all of its documentation as
equally important from day one. A progressive disclosure approach would reduce the
initial overwhelm.

---

## Structural Observations

*These are NOT content quality issues — noted for the subsequent structural analysis pass
as requested by the atomic task description.*

- Supplemental workflows vary enormously in length: `weekly-review.md` ~170 lines vs
  `maintain-task-notes.md` ~860 lines. Some normalization or restructuring might help.
- `strategy-work-organization.md` contains a substantial "Backlog Organization" section
  that feels like a separate concern from work categorization and git workflow.
- The distinction between "workflows" and "strategies" blurs sometimes. The work
  organization strategy contains numbered lifecycle steps that read like a workflow.
- `completion-sample.example.md` sits in `archive/technical/` but there's no corresponding
  sample in `archive/feature/` or `archive/incidental/`.
- The `archive/` directory only has `technical/` as a subdirectory with content — the
  quarterly structure from README isn't scaffolded in the template.
- The framework has both `strategies/arc/` (methodology) and `strategies/project/`
  (domain) — good separation, but `strategy-quality-gates.md` feels like it straddles
  both (it's methodology guidance but with project-specific command patterns).
- Double horizontal rule at `manage-incidental-work.md:306-307` appears to be a
  formatting issue.

---

**Evaluation Status:** Complete — all 37 files in scope reviewed.
