# Workflow: Define Project

**Audience:** Collaborative — developer and agent work through this together.

**Purpose**: Establish the foundational project documents that guide all development decisions
and provide persistent project context. Covers constitutional documents (project identity and
standards) and planning artifacts (execution strategy and status tracking).

**When to use**:

- **Initial setup**: After ARC initialization ([01_verify-and-configure.md][init-arc])
- **Maintenance**: See [Maintaining Project Documents](#maintaining-project-documents) below

**Prerequisite**: ARC framework initialized — run [01_verify-and-configure.md][init-arc] first.

---

## Project Definition

Work through these steps when setting up a new project. Each document has a template with
inline guidance — the questions below help you think through what matters before filling it in.

### Step 1: Define META-PRD

Your project's vision, scope, and success criteria — the "why" and "what" that guides all other
decisions.

**Template**: [META-PRD.md][meta-prd-template]

**Think through**:

- What problem does this project solve?
- Who are the primary users and what are their goals?
- What does success look like in 6-12 months?
- What are the core features that deliver the most value?

### Step 2: Define TECHNICAL-OVERVIEW

Your technology stack, architectural patterns, and technical constraints — the "how" behind the
project.

**Template**: [TECHNICAL-OVERVIEW.md][tech-overview-template]

**Think through**:

- What technologies best serve the project goals?
- How will the system handle growth?
- What are the critical performance requirements?
- What security and reliability standards must be met?

### Step 3: Define DEV-RULES.PROJECT

Your project's quality standards and development protocols — the rules specific to your
codebase, tech stack, and team.

**Template**: [DEV-RULES.PROJECT.md][dev-rules-template]

**Note on scope:** ARC already provides framework-level development methodology — commit
standards, session management, verification protocols, task execution rules — via
[DEV-RULES.ARC.md][dev-rules-arc]. This is loaded automatically each session and applies
universally across ARC projects. Your DEV-RULES.PROJECT complements this with
project-specific content: quality gate commands for your tech stack, testing requirements,
architecture rules, and any project-specific protocols.

**Think through**:

- What quality gate commands enforce standards for your stack?
- What testing strategies will provide confidence?
- What architecture rules are specific to this project?
- How will collaboration and code review work?

During project setup, these templates become your project documents (dropping the `.template`
suffix). META-PRD and TECHNICAL-OVERVIEW go in `reference/`; DEV-RULES.PROJECT goes in
`reference/constitution/`.

### With arc-in-git PM (`pm.mode: arc-in-git`)

If your project uses arc-in-git Project Management mode, create these additional documents
during setup. Check `pm.mode` in [`arc-config.yml`][arc-config] — skip this section if
set to `none`.

#### Step 4: Plan ROADMAP

Your execution strategy — what gets built in what order, and why. The ROADMAP captures
sequencing decisions and dependency chains so you can plan work deliberately rather than
reactively.

**Template**: [ROADMAP.md][roadmap-template]

**Think through**:

- What work must happen first to unblock everything else?
- What are the major phases or milestones?
- What dependencies exist between work items?
- What's explicitly deferred and why?

ROADMAP goes in `backlog/`.

#### Step 5: Establish PROJECT-STATUS

Progress tracking for initiatives and milestones — a snapshot of where the project stands
against the roadmap.

**Template**: [PROJECT-STATUS.md][project-status-template]

**Think through**:

- How will progress toward project goals be tracked?
- What milestones mark significant progress?
- How often should status be reviewed and updated?

PROJECT-STATUS goes in `reference/`.

---

## Maintaining Project Documents

### Triggered Updates

**Update the relevant document when circumstances change:**

- **Technology changes**: Update TECHNICAL-OVERVIEW.md
- **Contributor or process changes**: Review and update DEV-RULES.PROJECT.md
- **Direction changes**: Revise META-PRD.md direction and success criteria
- **Performance issues**: Update architecture and development standards

### Periodic Review

**Every ~3 months** (or before major feature development), review each document:

- **META-PRD**: Does the stated direction still match reality? Are success metrics still relevant?
- **TECHNICAL-OVERVIEW**: Do documented patterns reflect current practice? Any new constraints?
- **DEV-RULES.PROJECT**: Are quality gates catching real issues? Any standards that aren't working?

### With arc-in-git PM

If your project uses arc-in-git PM mode, also maintain:

- **Sequencing shifts**: Update ROADMAP.md phases and dependencies
- **ROADMAP** (periodic): Is the sequencing still correct? Any completed phases to archive?
- **PROJECT-STATUS** (periodic): Are milestones current? Does it accurately reflect project state?

---

[arc-config]: ../../../system/arc-config.yml
[init-arc]: 01_verify-and-configure.md
[meta-prd-template]: ../../../../reference/META-PRD.md
[tech-overview-template]: ../../../../reference/TECHNICAL-OVERVIEW.md
[dev-rules-template]: ../../../../reference/constitution/DEV-RULES.PROJECT.md
[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
[roadmap-template]: ../../../../backlog/ROADMAP.md
[project-status-template]: ../../../../reference/PROJECT-STATUS.md
