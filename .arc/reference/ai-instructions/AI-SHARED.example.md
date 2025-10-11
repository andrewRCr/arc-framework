# [Your Project Name] - Shared AI Context

<!-- 
ARC Framework Template: Copy this file and customize for your project
- Replace [Your Project Name] with your actual project name  
- Update project overview with your specific context
- Customize technology stack section for your tools
- Keep ARC framework workflow references and structure
-->

## Project Overview

<!-- 
Customize this section for your project:
- Brief description of what your application does
- Target users and main use cases  
- Project type (solo, team, client work, etc.)
- Key business objectives or showcase goals
-->

[Your Project Name] is a [brief description of your application and its purpose].

**Project Type**: [Solo project, team project, client work, etc.]
**Primary Goal**: [Main objective - showcase skills, solve business problem, etc.]

## ARC Framework Integration

### 📋 Key Reference Documents

**Constitutional Documents** (Core project foundation):

- [META-PRD](../constitution/META-PRD.md) - Product vision, core features, user flows, and success metrics
- [PROJECT-STATUS](../constitution/PROJECT-STATUS.md) - Current progress, completed work, and upcoming priorities  
- [TECHNICAL-ARCHITECTURE](../constitution/TECHNICAL-ARCHITECTURE.md) - Technical architecture, patterns, and
  implementation details
- [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) - Development standards, quality gates, and
  AI collaboration protocols

### 🔄 Development Workflow

**ARC Framework Core Workflows** (Systematic approach for feature development):

1. [Define Constitution](../workflows/0-define-constitution.md) - Project setup and constitutional document creation
2. [Create PRD](../workflows/1-create-prd.md) - Generate feature-level PRDs for new features
3. [Generate Tasks](../workflows/2-generate-tasks.md) - Create implementation task lists from PRDs
4. [Process Task Loop](../workflows/3-process-task-loop.md) - Task execution and completion protocols

**Supplemental Workflows** (Supporting processes):

- [Session Handoff](../workflows/supplemental/session-handoff.md) - Context preservation across sessions
- [Atomic Commit](../workflows/supplemental/atomic-commit.md) - Structured commit protocols
- [Manage Incidental Work](../workflows/supplemental/manage-incidental-work.md) - Handle reactive maintenance tasks
- [Archive Completed](../workflows/supplemental/archive-completed.md) - Clean up finished work

### 📄 Generated Deliverables

**Feature Development**:

- [PRDs](../../upcoming/prds/) - Feature-level specifications generated from workflow
- [Tasks](../../active/) and [Upcoming Tasks](../../upcoming/tasks/) - Implementation task lists generated from PRDs
- [Active Work](../../active/) - Current feature development and incidental work

**Knowledge Management**:

- [Strategies](../strategies/) - Evolved patterns and architectural decisions
- [Archive](../archive/) - Completed work and historical context

## Project-Specific Context

### Technology Stack

<!-- 
Customize this section for your specific technology choices:
- Replace examples with your actual stack
- Include versions where relevant
- Add any special tools or services you use
-->

- **Backend**: [Your backend technology]
  - Example: Django + DRF, Node.js + Express, Spring Boot, etc.
- **Frontend**: [Your frontend technology]
  - Example: React + TypeScript, Vue.js, Angular, etc.
- **Database**: [Your database choice]
  - Example: PostgreSQL, MongoDB, MySQL, etc.
- **Infrastructure**: [Your deployment/development setup]
  - Example: Docker + Docker Compose, Kubernetes, Vercel, etc.
- **External Services**: [Third-party integrations]
  - Example: APIs, authentication services, payment processors, etc.

### Development Environment

<!-- 
Describe your development setup:
- How the application runs locally
- Key development tools and practices
- Testing approach and tools
-->

- **Local Development**: [How to run the project locally]
- **Testing Framework**: [Your testing tools and approach]
- **Code Quality**: [Linting, formatting, type checking tools]
- **Development Workflow**: [Key practices - containerized, monorepo, etc.]

### Key Architectural Patterns

<!-- 
Document your main architectural decisions:
- Authentication/authorization approach
- Data flow patterns
- State management (if frontend)
- API design patterns
- Error handling strategies
-->

- **Authentication**: [Your auth approach]
- **Error Handling**: [Your error management strategy]
- **State Management**: [If applicable - Redux, Context API, etc.]
- **API Design**: [REST, GraphQL, RPC patterns]
- **[Additional Pattern]**: [Other key architectural decisions]

### Development Standards

**ARC Framework Standards** (Applied to your project):

- **Code Quality**: [Your linting/formatting tools] - configured per DEVELOPMENT-RULES.md
- **Testing**: Required before commits, [your specific testing requirements]
- **Feature Branches**: All feature work on dedicated branches (`feature/[name]`)
- **Commits**: Conventional commit format, never without explicit user approval
- **Documentation**: [Your documentation priorities and standards]
- **AI Collaboration**: Follow protocols in DEVELOPMENT-RULES.md

### User-Focused Features

<!-- 
Describe your application's main features from user perspective:
- Core functionality users interact with
- Key user workflows
- Planned features (if relevant)
-->

- **[Core Feature 1]**: [Brief description]
- **[Core Feature 2]**: [Brief description]  
- **[Core Feature 3]**: [Brief description]
- **[Planned Features]**: [Future functionality if relevant]

## ARC Framework Development Workflow Integration

### Standard Development Process

When working on new features:

1. **Start with context**: Review META-PRD for product alignment
2. **Use systematic approach**: Follow the 4-step ARC workflow:
   - Define/update constitutional documents as needed
   - Create feature-level PRD → generate tasks → process task loop
3. **Work on feature branches**: All feature development happens on dedicated branches
4. **Maintain quality**: Full testing and quality gates before any commits
5. **Follow AI protocols**: Session management, commit approval, task synchronization
6. **Seek explicit approval**: Never commit without user review and permission

### AI Collaboration Protocols

**Session Management**:

- Review CURRENT-SESSION.md at start of work
- Follow session handoff protocols for context preservation  
- NEVER update CURRENT-SESSION.md without explicit user instruction

**Task Execution**:

- Complete ONE sub-task at a time
- Wait for explicit approval between sub-tasks
- Update task documentation immediately after each sub-task
- Perform comprehensive task context analysis before commits

**Quality Standards**:

- All quality gates must pass before commits (see DEVELOPMENT-RULES.md)
- Leave code cleaner than found (pre-existing issue protocol)
- Report issues immediately with full context

## Document Dependencies

### When Constitutional Documents Change

**META-PRD.md changes** → Update:

- `ai-instructions/AI-SHARED.md` (this file) - project overview and features
- Potentially `PROJECT-STATUS.md` - if scope or priorities change

**DEVELOPMENT-RULES.md changes** → Update:

- Version number in DEVELOPMENT-RULES.md
- All `ai-instructions/*.md` files - if protocols change
- Team communication about rule changes

**TECHNICAL-ARCHITECTURE.md changes** → Update:

- `ai-instructions/AI-SHARED.md` (this file) - technology stack and patterns
- Consider PROJECT-STATUS.md if architectural decisions affect roadmap

**PROJECT-STATUS.md changes** → Update:

- Consider if major status changes affect ongoing work priorities

## Quick Information Lookup

### "How do I...?"

**ARC Framework Processes**:

- **Set up project foundation** → `workflows/0-define-constitution.md`
- **Start a new feature** → `workflows/1-create-prd.md`
- **Break down tasks** → `workflows/2-generate-tasks.md`  
- **Implement tasks** → `workflows/3-process-task-loop.md`
- **Handle maintenance work** → `workflows/supplemental/manage-incidental-work.md`
- **Hand off session** → `workflows/supplemental/session-handoff.md`

**Project Information**:

- **Run tests/linting** → `DEVELOPMENT-RULES.md` (Essential Commands)
- **Understand the product** → `META-PRD.md`
- **See current progress** → `PROJECT-STATUS.md`
- **Learn the architecture** → `TECHNICAL-ARCHITECTURE.md`

### "What are the rules for...?"

- **Development standards** → `DEVELOPMENT-RULES.md`
- **AI collaboration protocols** → `DEVELOPMENT-RULES.md` (AI Session sections)
- **Code quality requirements** → `TECHNICAL-ARCHITECTURE.md` + `DEVELOPMENT-RULES.md`
- **Commit format and process** → `workflows/supplemental/atomic-commit.md`
- **Task management** → `workflows/3-process-task-loop.md`

## Project Goals and Context

<!-- 
This section provides a high-level summary only.
Refer to META-PRD.md for complete project vision, objectives, and success metrics.
Keep this section as strict bullet points - brief summaries of META-PRD content.
-->

**Primary Objectives** (See META-PRD.md for details):

- [Brief summary of main objective 1]
- [Brief summary of main objective 2]  
- [Brief summary of main objective 3]

**Key Principles** (See META-PRD.md for rationale):

- [Core principle 1 - e.g., Clean, maintainable code]
- [Core principle 2 - e.g., Comprehensive testing]
- [Core principle 3 - e.g., Professional documentation]
- [Core principle 4 - e.g., Modern development practices]

**Success Metrics Summary** (See META-PRD.md for complete metrics):

- [Key metric 1 summary]
- [Key metric 2 summary]

**For complete project vision, user flows, detailed objectives, and success criteria, refer to [META-PRD.md](../constitution/META-PRD.md).**

---

*This document is maintained as part of the ARC (Agentic, Recursive, Coordination) development framework.
It provides essential context for both human developers and AI assistants working on this project.*
