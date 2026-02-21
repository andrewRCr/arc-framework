# Workflow: Define Project

**Audience:** Collaborative — developer and agent work through this together.

**Purpose**: Establish the foundational project documents that guide all development decisions
and provide persistent project context. Covers constitutional documents (project identity and
standards) and planning artifacts (execution strategy and status tracking).

**When to use**:

- **Initial setup**: After ARC initialization ([01_initialize-arc.md][init-arc])
- **Maintenance**: See [Maintaining Project Documents](#maintaining-project-documents) below

**Prerequisite**: ARC framework initialized — run [01_initialize-arc.md][init-arc] first.

---

## Project Definition

Work through these steps when setting up a new project. Each document has a template with
inline guidance — the questions below help you think through what matters before filling it in.

### Step 1: Define META-PRD

Your project's vision, scope, and success criteria — the "why" and "what" that guides all other
decisions.

**Template**: [META-PRD.template.md][meta-prd-template]

**Think through**:

- What problem does this project solve?
- Who are the primary users and what are their goals?
- What does success look like in 6-12 months?
- What are the core features that deliver the most value?

### Step 2: Define TECHNICAL-OVERVIEW

Your technology stack, architectural patterns, and technical constraints — the "how" behind the
project.

**Template**: [TECHNICAL-OVERVIEW.template.md][tech-overview-template]

**Think through**:

- What technologies best serve the project goals?
- How will the system handle growth?
- What are the critical performance requirements?
- What security and reliability standards must be met?

### Step 3: Define DEVELOPMENT-RULES

Your project's quality standards and development protocols — the rules specific to your
codebase, tech stack, and team.

**Template**: [DEVELOPMENT-RULES.template.md][dev-rules-template]

**Note on scope:** ARC already provides framework-level development methodology — commit
standards, session management, verification protocols, task execution rules — via
[strategy-development-methodology.md][dev-methodology]. This is loaded automatically each
session and applies universally across ARC projects. Your DEVELOPMENT-RULES complements
this with project-specific content: quality gate commands for your tech stack, testing
requirements, architecture rules, and any project-specific protocols.

**Think through**:

- What quality gate commands enforce standards for your stack?
- What testing strategies will provide confidence?
- What architecture rules are specific to this project?
- How will collaboration and code review work?

### Step 4: Plan ROADMAP

Your execution strategy — what gets built in what order, and why. The ROADMAP captures
sequencing decisions and dependency chains so you can plan work deliberately rather than
reactively.

**Template**: [ROADMAP.template.md][roadmap-template]

**Think through**:

- What work must happen first to unblock everything else?
- What are the major phases or milestones?
- What dependencies exist between work items?
- What's explicitly deferred and why?

### Step 5: Establish PROJECT-STATUS

Progress tracking for initiatives and milestones — a snapshot of where the project stands
against the roadmap.

**Template**: [PROJECT-STATUS.template.md][project-status-template]

**Think through**:

- How will progress toward project goals be tracked?
- What milestones mark significant progress?
- How often should status be reviewed and updated?

During project setup, these templates become your project documents (dropping the `.template`
suffix). Constitutional documents (META-PRD, TECHNICAL-OVERVIEW, DEVELOPMENT-RULES) go in
`reference/constitution/`. ROADMAP goes in `backlog/`. PROJECT-STATUS goes in
`reference/constitution/` alongside the other constitutional documents.

---

## Maintaining Project Documents

### Triggered Updates

**Update the relevant document when circumstances change:**

- **Technology changes**: Update TECHNICAL-OVERVIEW.md
- **Contributor or process changes**: Review and update DEVELOPMENT-RULES.md
- **Direction changes**: Revise META-PRD.md direction and success criteria
- **Sequencing shifts**: Update ROADMAP.md phases and dependencies
- **Performance issues**: Update architecture and development standards

### Periodic Review

**Every ~3 months** (or before major feature development), review each document:

- **META-PRD**: Does the stated direction still match reality? Are success metrics still relevant?
- **TECHNICAL-OVERVIEW**: Do documented patterns reflect current practice? Any new constraints?
- **DEVELOPMENT-RULES**: Are quality gates catching real issues? Any standards that aren't working?
- **ROADMAP**: Is the sequencing still correct? Any completed phases to archive?
- **PROJECT-STATUS**: Are milestones current? Does it accurately reflect project state?

---

[init-arc]: 01_initialize-arc.md
[meta-prd-template]: ../../../../reference/constitution/META-PRD.template.md
[tech-overview-template]: ../../../../reference/constitution/TECHNICAL-OVERVIEW.template.md
[dev-rules-template]: ../../../../reference/constitution/DEVELOPMENT-RULES.template.md
[dev-methodology]: ../../../../reference/strategies/arc/strategy-development-methodology.md
[roadmap-template]: ../../../../backlog/ROADMAP.template.md
[project-status-template]: ../../../../reference/constitution/PROJECT-STATUS.template.md
