# Workflow: Define Constitution

**Audience:** Collaborative — developer and agent work through this together.

**Purpose**: Establish and maintain the foundational project documents that guide all development
decisions and provide persistent project context.

**When to use**:

- **Initial setup**: New project initialization
- **Maintenance**: Quarterly reviews, major feature planning, architecture evolution

---

## Initial Setup

Work through these steps when setting up a new project. Each constitutional document has a template
with inline guidance — the questions below help you think through what matters before filling it in.

### Step 1: Define META-PRD

Your project's vision, scope, and success criteria — the "why" and "what" that guides all other
decisions.

**Template**: [META-PRD.example.md](../constitution/META-PRD.example.md)

**Think through**:

- What problem does this project solve?
- Who are the primary users and what are their goals?
- What does success look like in 6-12 months?
- What are the core features that deliver the most value?

### Step 2: Define TECHNICAL-OVERVIEW

Your technology stack, architectural patterns, and technical constraints — the "how" behind the
project.

**Template**: [TECHNICAL-OVERVIEW.example.md](../constitution/TECHNICAL-OVERVIEW.example.md)

**Think through**:

- What technologies best serve the project goals?
- How will the system handle growth?
- What are the critical performance requirements?
- What security and reliability standards must be met?

### Step 3: Define DEVELOPMENT-RULES

Code standards, quality gates, and development protocols — the rules that keep the codebase healthy.

**Template**: [DEVELOPMENT-RULES.example.md](../constitution/DEVELOPMENT-RULES.example.md)

**Think through**:

- What coding standards will ensure maintainability?
- How will code quality be measured and enforced?
- What testing strategies will provide confidence?
- How will collaboration and code review work?

### Step 4: Define PROJECT-STATUS

Progress tracking for initiatives and milestones — a snapshot of where the project stands.

**Template**: [PROJECT-STATUS.example.md](../constitution/PROJECT-STATUS.example.md)

**Think through**:

- How will progress toward project goals be tracked?
- What milestones mark significant progress?
- How often should status be reviewed and updated?

During project setup, these templates become your constitutional documents (dropping the `.example`
suffix).

---

## Maintaining Constitutional Documents

### Triggered Updates

**Update the relevant document when circumstances change:**

- **Technology changes**: Update TECHNICAL-OVERVIEW.md
- **Contributor or process changes**: Review and update DEVELOPMENT-RULES.md
- **Direction changes**: Revise META-PRD.md direction and success criteria
- **Performance issues**: Update architecture and development standards

### Periodic Review

**Every ~3 months** (or before major feature development), review each constitutional document:

- **META-PRD**: Does the stated direction still match reality? Are success metrics still relevant?
- **TECHNICAL-OVERVIEW**: Do documented patterns reflect current practice? Any new constraints?
- **DEVELOPMENT-RULES**: Are quality gates catching real issues? Any standards that aren't working?
- **PROJECT-STATUS**: Are milestones current? Does it accurately reflect project state?
