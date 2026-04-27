---
purpose: Establish the project documents that guide development and orient your agent.
audience: collaborative (human and agent)
---

# Workflow: Define Project

Some of these documents are loaded every session — the agent operates on whatever they say. Others
are reference material consulted during planning and architecture decisions.

**When to use**:

- **Initial setup**: After ARC verification ([01_verify-and-configure.md][init-arc])
- **Maintenance**: See [Maintaining Project Documents](#maintaining-project-documents) below

**Prerequisite**: ARC framework verified — run [01_verify-and-configure.md][init-arc] first.

---

## Project Definition

Work through these steps when setting up a new project. Each document has inline guidance —
the questions below help you think through what matters before filling it in.

### Step 1: Define META-PRD

Your project's vision, scope, and success criteria — the "why" and "what" that guides all
other decisions. This is the canonical source for project direction; subsequent documents
distill from it.

**Template**: [META-PRD.md][meta-prd] → goes in `reference/`

**Think through**:

- What problem does this project solve?
- Who are the primary users and what are their goals?
- What does success look like in 6-12 months?
- What are the core features that deliver the most value?

Focus on product direction, not implementation — technology choices belong in
TECHNICAL-OVERVIEW (next step).

### Step 2: Define TECHNICAL-OVERVIEW

Your technology stack, architectural patterns, and technical constraints — the "how" behind
the project.

**Template**: [TECHNICAL-OVERVIEW.md][tech-overview] → goes in `reference/`

**Think through**:

- What technologies best serve the project goals?
- How is the codebase structured?
- What are the critical performance and infrastructure requirements?
- What testing and build infrastructure exists?

### Step 3: Define AGENT-BRIEF.PROJECT

Your project's executive summary for the agent — loaded every session. This distills
META-PRD (what the project is) and TECHNICAL-OVERVIEW (how it's built) into a concise
briefing: project type, primary goal, technology stack, repository layout, and common
friction points.

**Template**: [AGENT-BRIEF.PROJECT.md][agents-project] → stays in `system/briefs/`

**Think through**:

- What does the agent need to know every session to make good decisions?
- What are the gotchas that waste agent time — things not obvious from the code?
- What's the one-paragraph summary of what this project is?

Keep it concise — this is loaded every session, not a comprehensive reference.
META-PRD and TECHNICAL-OVERVIEW carry the detail.

### Step 4: Define QUICK-REFERENCE

Command patterns and environment context for your project — loaded every session. This is
where the agent finds correct commands for linting, testing, building, and quality gates.

**Template**: [QUICK-REFERENCE.md][quick-ref] → goes in `reference/`

**Think through**:

- What commands does the agent run most often? (lint, test, build, type-check)
- What runtime environment is required? (containers, services, tool versions)
- What are the quality gate commands at each tier?

QUICK-REFERENCE and DEV-RULES.PROJECT (next step) are coupled — quality gate *standards*
are defined in DEV-RULES.PROJECT, quality gate *commands* are defined here.

### Step 5: Define DEV-RULES.PROJECT

Your project's quality standards and development protocols — loaded every session. The rules
specific to your codebase, tech stack, and team.

**Template**: [DEV-RULES.PROJECT.md][dev-rules] → goes in `reference/constitution/`

**Note on scope:** ARC already provides framework-level development methodology — commit
standards, session management, verification protocols, task execution rules — via
[DEV-RULES.ARC.md][dev-rules-arc]. This is loaded automatically each session and applies
universally across ARC projects. Your DEV-RULES.PROJECT complements this with
project-specific content: quality gate definitions, testing requirements, architecture
rules, and any project-specific protocols.

**Think through**:

- What quality checks must pass before every commit?
- What testing strategies will provide confidence?
- What architecture rules are specific to this project?
- Where do deferred issues go? (Capture Routing section)

<!-- arc:if pm.mode == arc-in-git -->

### Step 6: Plan ROADMAP

Your execution strategy — what gets built in what order, and why. The ROADMAP captures
sequencing decisions and dependency chains so you can plan work deliberately rather than
reactively.

**Template**: [ROADMAP.md][roadmap] → goes in `backlog/`

**Think through**:

- What work must happen first to unblock everything else?
- What are the major phases or milestones?
- What dependencies exist between work items?
- What's explicitly deferred and why?

### Step 7: Establish PROJECT-STATUS

Progress tracking for initiatives and milestones — a snapshot of where the project stands
against the roadmap.

**Template**: [PROJECT-STATUS.md][project-status] → goes in `reference/`

**Think through**:

- How will progress toward project goals be tracked?
- What milestones mark significant progress?
- How often should status be reviewed and updated?

<!-- arc:endif -->

---

## Maintaining Project Documents

Three of these documents are loaded every session — your agent operates on whatever they
say. When they drift from reality, the agent works from wrong assumptions.

**Session-loaded documents — keep current:**

- **AGENT-BRIEF.PROJECT** — when the project's scope, stack, or friction points change. Stale
  content here directly degrades every session's starting context.
- **QUICK-REFERENCE** — when commands, paths, or environment requirements change. Wrong
  commands here mean the agent fails quality gates or uses outdated tooling.
- **DEV-RULES.PROJECT** — when quality gates change (new tooling, retired checks, adjusted
  thresholds) or when team process evolves. Stale gates produce false confidence or false
  failures.

**Reference documents — keep honest:**

- **META-PRD** — when the project's direction, scope, or success criteria shift. A pivot,
  a deprioritized goal, or a new constraint changes what work gets planned.
<!-- arc:if pm.mode == arc-in-git -->
- **ROADMAP** — when sequencing shifts, phases complete, or new work emerges. Stale
  roadmaps misguide next-work-unit discovery.
- **PROJECT-STATUS** — when milestones are reached or project state changes materially.
<!-- arc:endif -->

TECHNICAL-OVERVIEW evolves naturally alongside the code — update it when architectural
decisions are made, not on a schedule.

---

## Next Step

Project definition is complete. Three of these documents — AGENT-BRIEF.PROJECT,
QUICK-REFERENCE, and DEV-RULES.PROJECT — are loaded by the agent at the start of every
session.
<!-- arc:if pm.mode == arc-in-git -->
The rest (META-PRD, TECHNICAL-OVERVIEW, ROADMAP, PROJECT-STATUS) are reference
material for consulting during planning and architecture decisions.
<!-- arc:endif -->
<!-- arc:if pm.mode != arc-in-git -->
The rest (META-PRD, TECHNICAL-OVERVIEW) are reference material for consulting during
planning and architecture decisions.
<!-- arc:endif -->

<!-- arc:if pm.mode == arc-in-git -->
Clear your context and start a fresh session by invoking the `arc-resume` skill (invocation
syntax is agent-specific). With no active work unit yet, session initialization enters
discovery mode: the agent checks your ROADMAP for the next queued item and helps you create
a PRD and task list for your first work unit. From there, the normal session rhythm —
`arc-resume`, task execution, `arc-commit`, `arc-handoff` — takes over.
<!-- arc:endif -->

<!-- arc:if pm.mode == none -->
Clear your context and start a fresh session by invoking the `arc-resume` skill (invocation
syntax is agent-specific). With no active work unit yet, session initialization reports the
empty state and awaits your direction. When ready to begin your first work unit, follow
[1_create-prd.md][create-prd] to define it from your project docs, then
[2_generate-tasks.md][generate-tasks] for the task list. From there, the normal session
rhythm — `arc-resume`, task execution, `arc-commit`, `arc-handoff` — takes over.
<!-- arc:endif -->

<!-- arc:if pm.mode == external -->
Proceed to [03_configure-external-integration.md][configure-external] to connect ARC
workflows to your tracker.
<!-- arc:endif -->

---

[init-arc]: 01_verify-and-configure.md
<!-- arc:if pm.mode == external -->
[configure-external]: 03_configure-external-integration.md
<!-- arc:endif -->
[meta-prd]: ../../../../reference/META-PRD.md
[tech-overview]: ../../../../reference/TECHNICAL-OVERVIEW.md
[agents-project]: ../../../briefs/AGENT-BRIEF.PROJECT.md
[quick-ref]: ../../../../reference/QUICK-REFERENCE.md
[dev-rules]: ../../../../reference/constitution/DEV-RULES.PROJECT.md
[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
<!-- arc:if pm.mode == arc-in-git -->
[roadmap]: ../../../../backlog/ROADMAP.md
[project-status]: ../../../../reference/PROJECT-STATUS.md
<!-- arc:endif -->
<!-- arc:if pm.mode == none -->
[create-prd]: ../1_create-prd.md
[generate-tasks]: ../2_generate-tasks.md
<!-- arc:endif -->
