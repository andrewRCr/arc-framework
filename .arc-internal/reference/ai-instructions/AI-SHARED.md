# ARC Agentic Development Framework - Shared AI Context

## Project Overview

The ARC Agentic Development Framework is a structured documentation framework designed to facilitate collaboration
between human developers and AI agents. By emphasizing spec-driven development and clear task breakdowns, it creates
a shared understanding and efficient workflows for software development projects.

**Project Type**: Solo framework development with public release goals  
**Primary Goal**: Create a comprehensive, battle-tested methodology for AI-human development collaboration

## ARC Framework Integration

### 📋 Key Reference Documents

**Constitutional Documents** (Core project foundation):

- [META-PRD](../constitution/META-PRD.md) - Framework vision, core features, and success metrics
- [PROJECT-STATUS](../constitution/PROJECT-STATUS.md) - Current development progress, completed work, and priorities  
- [TECHNICAL-ARCHITECTURE](../constitution/TECHNICAL-ARCHITECTURE.md) - Framework architecture, patterns, and design decisions
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

- [PRDs](../../active/feature/) and [Upcoming PRDs](../../upcoming/prds/) - Feature specifications
- [Tasks](../../active/feature/) - Implementation task lists
- [Active Work](../../active/) - Current feature development and incidental work

**Knowledge Management**:

- [Archive](../archive/) - Completed work and historical context
- [Reference](../reference/) - Stable patterns and architectural decisions

## Project-Specific Context

### Technology Stack

- **Framework Type**: Pure documentation system
- **Dependencies**: Git, Node.js (NPX for markdown linting)
- **Quality Gates**: Automated markdown linting, GitHub Actions CI
- **Distribution**: GitHub repository with template-first documents
- **Development Environment**: Cross-platform (Windows/WSL/Linux/Mac)

### Development Environment

- **Local Development**: Git repository with markdown files and NPX tooling
- **Testing Framework**: Template validation, workflow verification, real-project testing
- **Code Quality**: Comprehensive markdown linting with zero-tolerance policy
- **Development Workflow**: Self-hosted ARC methodology (framework develops itself)

### Key Architectural Patterns

- **Template-First Approach**: Rich, copy-ready documents with inline guidance
- **Framework Defaults**: Battle-tested rules extracted from CineXplorer project
- **Constitutional Structure**: Core documents provide project foundation
- **Workflow Integration**: Systematic processes for feature development
- **Session Management**: Context preservation across AI/human handoffs

### Development Standards

**ARC Framework Standards** (Applied to framework development):

- **Code Quality**: NPX markdown linting - zero violations before commits
- **Testing**: Template validation, workflow testing on real projects
- **Feature Branches**: All feature work on dedicated branches (`feature/[name]`)
- **Commits**: Conventional commit format, never without explicit user approval
- **Documentation**: Self-hosting methodology, comprehensive inline guidance
- **AI Collaboration**: Follow protocols in DEVELOPMENT-RULES.md

### Framework Features

- **Constitutional Documents**: META-PRD, PROJECT-STATUS, TECHNICAL-ARCHITECTURE, DEVELOPMENT-RULES templates
- **Core Workflows**: 4-step development process (constitution → PRD → tasks → execution)
- **Supplemental Workflows**: Session handoff, atomic commits, incidental work management
- **Template System**: Copy-ready documents with framework defaults and customization guidance
- **AI Instructions**: Comprehensive guidance for AI agent collaboration

## ARC Framework Development Workflow Integration

### Standard Development Process

When working on framework features:

1. **Start with context**: Review META-PRD for framework alignment and current PROJECT-STATUS
2. **Use systematic approach**: Follow the 4-step ARC workflow for all feature development
3. **Work on feature branches**: All feature development happens on dedicated branches
4. **Maintain quality**: Full markdown linting and validation before any commits
5. **Follow AI protocols**: Session management, commit approval, task synchronization
6. **Self-host methodology**: Framework development follows its own processes

### AI Collaboration Protocols

**Session Management**:

- Review CURRENT-SESSION.md at start of work
- Follow session handoff protocols for context preservation  
- NEVER update CURRENT-SESSION.md without explicit user instruction
- Session handoff document controlled exclusively by user

**Task Execution**:

- Complete ONE sub-task at a time
- Wait for explicit approval between sub-tasks
- Update task documentation immediately after each sub-task
- Perform comprehensive task context analysis before commits

**Quality Standards**:

- All quality gates must pass before commits (see DEVELOPMENT-RULES.md)
- Zero tolerance: Backend/frontend tests, linting, type checking, documentation linting
- Leave documentation cleaner than found
- Report issues immediately with full context

**Commit Control**:

- AI NEVER initiates commits without explicit user approval/instruction
- User approval required to begin any git operations
- MANDATORY: Comprehensive task context analysis before any commit
- **Multi-line commits**: Use file-based approach (`git commit -F /tmp/commit_msg.txt`) if interactive editor issues occur

## Document Dependencies

### When Constitutional Documents Change

**META-PRD.md changes** → Update:

- `ai-instructions/AI-SHARED.md` (this file) - framework overview and features
- Potentially `PROJECT-STATUS.md` - if scope or priorities change

**DEVELOPMENT-RULES.md changes** → Update:

- All `ai-instructions/*.md` files - if protocols change
- Framework templates - if rule changes affect template defaults

**TECHNICAL-ARCHITECTURE.md changes** → Update:

- `ai-instructions/AI-SHARED.md` (this file) - architecture patterns
- Consider PROJECT-STATUS.md if architectural decisions affect roadmap
