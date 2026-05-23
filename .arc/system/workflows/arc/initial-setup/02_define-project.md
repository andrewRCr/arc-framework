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

### Step 1: Define PROJECT-PRD

Your project's problem statement, scope, and guiding principles — the "what" and "why" that
guide all other decisions. This is the canonical source for project direction; subsequent
documents distill from it.

**Template**: [PROJECT-PRD.md][project-prd] → goes in `reference/`

**Think through**:

- What problem does this project solve? What makes the status quo insufficient?
- What's in scope? What's explicitly out of scope?
- What principles will guide decisions on this project? (3-5 named; scaffold-time TBD is acceptable.)
- Which optional sections (Mission, Design Tradeoffs, Success Criteria, References) have content worth capturing now?

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
PROJECT-PRD (what the project is) and TECHNICAL-OVERVIEW (how it's built) into a concise
briefing: project type, primary goal, technology stack, repository layout, and common
friction points.

**Template**: [AGENT-BRIEF.PROJECT.md][agents-project] → stays in `reference/briefs/`

**Think through**:

- What does the agent need to know every session to make good decisions?
- What are the gotchas that waste agent time — things not obvious from the code?
- What's the one-paragraph summary of what this project is?

Keep it concise — this is loaded every session, not a comprehensive reference.
PROJECT-PRD and TECHNICAL-OVERVIEW carry the detail.

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

**Template**: [DEV-RULES.PROJECT.md][dev-rules] → goes in `system/rules/`

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

- **PROJECT-PRD** — when the project's documented problem, scope, or principles shift. A
  pivot, a scope boundary redrawn, or a new constraint changes what work gets planned.
- **ROADMAP** — when sequencing shifts, phases complete, or new work emerges. Stale
  roadmaps misguide next-work-unit discovery.

TECHNICAL-OVERVIEW evolves naturally alongside the code — update it when architectural
decisions are made, not on a schedule.

---

## Next Step

Project definition is complete. Three of these documents — AGENT-BRIEF.PROJECT,
QUICK-REFERENCE, and DEV-RULES.PROJECT — are loaded by the agent at the start of every
session.
The rest (PROJECT-PRD, TECHNICAL-OVERVIEW, ROADMAP) are reference
material for consulting during planning and architecture decisions.

Clear your context and start a fresh session by invoking the `arc-resume` skill (invocation
syntax is agent-specific). With no active work unit yet, session initialization enters
discovery mode: the agent checks your ROADMAP for the next queued item and helps you create
a PRD and task list for your first work unit. From there, the normal session rhythm —
`arc-resume`, task execution, `arc-commit`, `arc-handoff` — takes over.

---

[init-arc]: 01_verify-and-configure.md
[project-prd]: ../../../../reference/PROJECT-PRD.md
[tech-overview]: ../../../../reference/TECHNICAL-OVERVIEW.md
[agents-project]: ../../../../reference/briefs/AGENT-BRIEF.PROJECT.md
[quick-ref]: ../../../../reference/QUICK-REFERENCE.md
[dev-rules]: ../../../../system/rules/DEV-RULES.PROJECT.md
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
[roadmap]: ../../../../backlog/ROADMAP.md
