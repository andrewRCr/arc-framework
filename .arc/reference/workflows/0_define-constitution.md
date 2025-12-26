# Workflow: Define Constitution

**Purpose**: Establish and maintain foundational project documents that guide all development decisions
and provide persistent project context.

**When to use**:

- **Initial Setup**: New project initialization
- **Maintenance Updates**: Quarterly reviews, major feature planning, architecture evolution

---

## Initial Setup (New Projects)

Use this section when setting up constitutional documents for the first time.

### Step 1: Create META-PRD

**Objective**: Define overall project vision, success criteria, and high-level direction

**Process**:

1. Build on template at `.arc/reference/constitution/META-PRD.md`
2. Define core project purpose and value proposition
3. Establish success metrics and key performance indicators
4. Outline major user flows and primary use cases
5. Set project timeline and milestone targets

**Key Questions**:

- What problem does this project solve?
- Who are the primary users and what are their goals?
- What does success look like in 6-12 months?
- What are the core features that deliver the most value?

### Step 2: Establish Technical Architecture

**Objective**: Document technical decisions, constraints, and implementation patterns

**Process**:

1. Build on template at `.arc/reference/constitution/TECHNICAL-OVERVIEW.md`
2. Define technology stack and key dependencies
3. Establish architectural patterns and design principles
4. Document deployment and infrastructure decisions
5. Set performance and scalability targets

**Key Questions**:

- What technologies best serve the project goals?
- How will the system scale with user growth?
- What are the critical performance requirements?
- What security and reliability standards must be met?

### Step 3: Define Development Rules

**Objective**: Establish code standards, quality gates, and development protocols

**Process**:

1. Build on template at `.arc/reference/constitution/DEVELOPMENT-RULES.md`
2. Set code style and formatting standards
3. Define testing requirements and coverage targets
4. Establish review and approval processes
5. Configure quality gates and automated checks

**Key Questions**:

- What coding standards will ensure maintainability?
- How will code quality be measured and enforced?
- What testing strategies will provide confidence?
- How will team coordination and reviews work?

### Step 4: Initialize Project Status

**Objective**: Create progress tracking framework for initiatives and milestones

**Process**:

1. Build on template at `.arc/reference/constitution/PROJECT-STATUS.md`
2. Establish milestone tracking structure
3. Define progress reporting cadence
4. Set up initiative and epic organization
5. Initialize current status baseline

**Key Questions**:

- How will progress toward project goals be tracked?
- What milestones mark significant progress?
- How often should status be reviewed and updated?
- What format best communicates progress to stakeholders?

---

## Maintenance Updates (Ongoing)

Use this section to evolve constitutional documents as the project matures.

### Quarterly Constitutional Review

**When**: Every 3 months or before major feature development

**Process**:

1. **Review META-PRD**:
   - Validate project direction against current market/user needs
   - Update success metrics based on actual progress
   - Refine user flows based on usage data and feedback
   - Adjust timeline based on development velocity

2. **Update Technical Architecture**:
   - Incorporate lessons learned from recent development
   - Document new patterns and architectural decisions
   - Update performance targets based on real usage
   - Evolve security and scalability approaches

3. **Refine Development Rules**:
   - Improve standards based on team experience
   - Update quality gates based on defect patterns
   - Adjust testing strategies based on effectiveness
   - Evolve review processes for better efficiency

4. **Progress Project Status**:
   - Update milestone completion status
   - Adjust future milestone targets based on velocity
   - Document completed initiatives and outcomes
   - Plan next quarter's focus areas

### Triggered Updates

**When major changes occur**:

- **Technology changes**: Update TECHNICAL-OVERVIEW.md
- **Team changes**: Review and update DEVELOPMENT-RULES.md
- **Market changes**: Revise META-PRD.md direction and success criteria
- **Performance issues**: Update architecture and development standards

### Constitutional Evolution Process

1. **Identify Need**: Development friction or changing requirements
2. **Draft Changes**: Update relevant constitutional document(s)
3. **Team Review**: Ensure changes align with project goals
4. **Implementation**: Update processes and communicate changes
5. **Monitor Impact**: Track effectiveness of constitutional changes

---

## Integration with Feature Development

### Constitutional Context in PRDs

When creating feature-level PRDs using [1_create-prd.md](1_create-prd.md):

- **Reference META-PRD**: Ensure feature aligns with project vision
- **Check Technical Architecture**: Verify implementation approach fits established patterns
- **Follow Development Rules**: Apply quality standards and testing requirements
- **Update Project Status**: Track feature progress against milestones

### Constitutional Compliance

All feature development should:

- **Align with META-PRD vision** and success criteria
- **Follow TECHNICAL-OVERVIEW** patterns and constraints
- **Adhere to DEVELOPMENT-RULES** standards and processes
- **Contribute to PROJECT-STATUS** milestone progress

---

## Templates and Examples

**Constitutional Document Templates**:

- `.arc/reference/constitution/META-PRD.md`
- `.arc/reference/constitution/TECHNICAL-OVERVIEW.md`
- `.arc/reference/constitution/DEVELOPMENT-RULES.md`
- `.arc/reference/constitution/PROJECT-STATUS.md`

**Working Documents Location**:

- `.arc/reference/constitution/` (project constitutional documents)

---

## Success Criteria

**Initial Setup Complete When**:

- All four constitutional documents created and populated
- Project vision, technical approach, and standards clearly defined
- Development team aligned on processes and quality standards
- Progress tracking framework established

**Maintenance Effective When**:

- Constitutional documents evolve with project learnings
- Team regularly references and updates foundational decisions
- New features consistently align with established direction
- Project maintains coherent vision despite ongoing changes

---

**Remember**: Constitutional documents provide project memory and consistency.
They should evolve with the project but maintain stability to guide decision-making across development cycles.
