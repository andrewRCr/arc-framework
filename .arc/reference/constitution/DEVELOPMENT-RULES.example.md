# Development Rules - [Your Project Name]

<!--
ARC Framework Template: Copy this file and customize for your project
- Replace [Your Project Name] with your actual project name
- Update version and hash as your rules evolve
- Customize quality gate commands for your technology stack
- Framework defaults below are battle-tested from real projects
-->

**Version**: 1.0
**Last Updated**: [Date]
**Rules Hash**: `[Generate unique hash]`

This document consolidates the core development rules and quality standards for [Your Project Name].
These rules are **non-negotiable** and must be followed by all contributors, including AI assistants.

## ARC Framework Default Rules

### AI Session Initialization Required

Before starting ANY work, AI assistants must:

1. **Confirm rules version**: "Acknowledging DEVELOPMENT-RULES v[X.X], hash [hash]"
2. **State understanding**: Briefly confirm understanding of commit protocols, task context analysis, quality gates,
   session management, and feature branch workflow
3. **Verify context access**: Confirm access to required documents (AI-SHARED, META-PRD, etc.)
4. **Check branch status**: Verify current git branch and ensure alignment with intended work

### Session Documentation Control

**CURRENT-SESSION.md Update Protocol**:

- **AI NEVER updates CURRENT-SESSION.md** without explicit user instruction
- CURRENT-SESSION.md is a handoff document controlled by the user
- AI should report changes and progress but NOT modify this file during active work
- User decides when and how session documentation is updated
- Violating this rule breaks session continuity and coordination

### Git & Commit Control

**Manual Commit Control**:

- **AI NEVER initiates commits** without explicit user approval or instruction
- **AI CAN execute commits** when user explicitly approves/instructs it to do so
- **User approval required** to begin any git operations
- **MANDATORY**: AI must perform comprehensive task context analysis before any commit consideration
- AI reports completion with standardized readiness report, then awaits commit instructions

**Feature Branch Workflow**:

- **All feature work** must happen on dedicated feature branches
- **Branch naming convention**: `feature/[feature-name]` (e.g., `feature/user-authentication`)
- **Branch creation**: Create new branch during task generation phase
- **Branch verification**: Always verify correct branch before committing
- **Merge strategy**: Preserve commit history when merging to main (no squash merge)
- **Branch cleanup**: Delete feature branches after successful merge

### Quality Gates (Zero Tolerance)

Before any commit consideration, ALL of the following must pass with **zero exceptions**:

<!--
Customize these commands for your technology stack:
- Replace example commands with your actual testing/linting setup
- Add or remove quality gates based on your project needs
- Keep the zero-tolerance principle for quality
-->

1. **Backend Tests**: 100% pass rate
   - Command: `[Your backend test command]`
   - Example: `npm run test:backend` or `python -m pytest`
   - Zero failures acceptable

2. **Frontend Tests**: 100% pass rate
   - Command: `[Your frontend test command]`
   - Example: `npm test` or `npm run test:frontend`
   - Zero failures acceptable

3. **Backend Linting**: Zero violations
   - Command: `[Your backend linting command]`
   - Example: `npm run lint:backend` or `flake8 .`
   - Auto-fix: `[Your auto-fix command if available]`
   - Every violation must be fixed

4. **Frontend Linting**: Zero violations
   - Command: `[Your frontend linting command]`
   - Example: `npm run lint` or `npm run lint:frontend`
   - Every violation must be fixed

5. **Type Checking**: Zero errors
   - Command: `[Your type checking command]`
   - Example: `npm run type-check` or `mypy .`
   - Every type error must be resolved

6. **Documentation Linting**: Zero violations
   - **ALWAYS run after updating any documentation files**
   - Command: `npx markdownlint-cli2 "README.md" ".arc/**/*.md"`
   - Auto-fix: `npx markdownlint-cli2 --fix "README.md" ".arc/**/*.md"`
   - Every violation must be fixed

### Quality Gate Failure Protocol

If quality gates fail after sub-task completion:

1. **Report the failure** with specific details
2. **Identify suspected causes** and investigation areas
3. **Ask for guidance** on whether to fix immediately or defer
4. **Never proceed** to next sub-task until resolved or user approves

### Leave It Cleaner: Pre-existing Issue Protocol

**Principle:** When touching any file, leave it cleaner than you found it.
Quality issues discovered during work should be addressed, not ignored.

**When quality checks reveal pre-existing issues in files you're modifying:**

1. **Assess severity and scope:**
   - **Minor issues** (< 5 minutes): Fix immediately without asking
   - **Moderate issues** (5-15 minutes): Fix immediately, document in commit
   - **Major issues** (> 15 minutes): Ask for direction before proceeding

2. **Required actions (choose one):**
   - ✅ **Fix immediately** - Preferred for all issues < 15 minutes
   - ✅ **Document and defer** - Create incidental task list with:
     - Clear description of issue found
     - Why it's being deferred (time/scope constraints)
     - Estimated effort to fix
     - Link to relevant files/line numbers
   - ❌ **Ignore silently** - NEVER acceptable

3. **Documentation requirements:**
   - Fixed issues: Note in commit message ("Also fixed X pre-existing issues")
   - Deferred issues: Create task list in `.arc/active/incidental/tasks-incidental-*.md`
   - Never: Leave issues undocumented or unaddressed

## Task Management Protocol

### One Sub-Task Rule

- **Complete ONE sub-task at a time** - never bundle multiple deliverables
- **Mandatory stop** after each sub-task completion
- **Wait for explicit user approval** before starting next sub-task

### Sub-Task Granularity Guidelines

Break down a sub-task if it requires:

- More than 3 files to be modified
- More than 50 lines of core logic changes
- Multiple interdependent changes
- Complex debugging/investigation

### Documentation Synchronization

- **Immediate task list updates**: Mark `[x]` in task files after each sub-task
- **Update "Relevant Files"** section when files are created/modified
- **Never batch documentation updates** - do immediately after work
- **Task lists and commit messages must align** - comprehensive task context analysis required

### Parent Task Completion

After completing all sub-tasks under a parent task:

1. **Run full quality gate checks**
2. **Check PROJECT-STATUS** for necessary updates
3. **Report completion** with standardized readiness report
4. **Wait for user approval** before proceeding

## Testing Requirements

### Test Coverage Standards

<!--
Customize these testing approaches for your project:
- Adjust based on your application type and requirements
- Set specific coverage targets if desired
-->

- **Test-first approach**: Required for new models, API endpoints, complex business logic
- **Test-after acceptable**: For simple CRUD operations, UI components, configuration
- **Always required**: All features must have appropriate test coverage
- **Integration focus**: Test workflows, not just individual components

### Test Execution Standards

- **Before commits**: Full test suite must pass completely
- **During development**: Use appropriate test modes as needed for efficiency
- **Coverage reporting**: `[Your coverage command if used]`

## Commit Standards

### Comprehensive Task Context Analysis Protocol

**MANDATORY** before every commit consideration:

1. **Examine ALL uncommitted changes**
2. **Locate relevant task documentation** in active tasks
   (`.arc/active/feature/` or `.arc/active/incidental/`)
   or upcoming tasks (`.arc/upcoming/tasks/`)
3. **Analyze task completion status** vs documented tasks
4. **Update task documentation** - mark subtasks complete
5. **Write accurate commit messages** reflecting project status

**Key Principle**: Commit messages must communicate WHERE the project stands after the commit.

### Conventional Commit Format

<!--
Customize commit format for your project:
- Adjust types, scopes, and format as needed
- Consider tools like Commitizen for consistency
-->

- **Types**: feat, fix, docs, style, refactor, test, config, chore
- **Scope**: Use feature/system name for context
- **Reference tasks**: Include task numbers with feature context
- **Format**: `[type](scope): Brief description`

### Atomic Commit Guidelines

- Each commit should be a single logical change
- Commits should be independently buildable/testable
- Use descriptive messages that reflect project milestone status, not just changes made
- Reference correct task numbers with full phase/milestone context
- Distinguish clearly between partial progress and milestone completion

## Error Handling

### When Things Go Wrong

- **Report immediately** with full context
- **Provide diagnostic information** (error messages, stack traces)
- **Suggest investigation areas** based on the changes made
- **Wait for guidance** rather than attempting fixes without approval

### Never Proceed If

- Quality gates are failing
- Tests are broken
- Linting violations exist
- Type errors are present (if applicable)
- User has not approved the next step

## Project-Specific Customizations

<!--
Add your project-specific rules below:
- Technology stack requirements
- Domain-specific standards
- Team conventions
- External integrations
-->

### Technology Stack Requirements

[Add your specific technology requirements here]

### Domain-Specific Standards

[Add your business domain requirements here]

### Team Conventions

[Add your team-specific conventions here]

## Essential Commands

<!--
Customize these commands for your development environment:
- Replace placeholders with your actual commands
- Add or remove sections based on your stack
-->

### Application Startup

```bash
# Start your application
[Your startup command here]
# Example: npm run dev, docker-compose up, etc.
```

### Development Environment

```bash
# Setup/install dependencies
[Your setup commands here]

# Environment validation
[Your validation commands here]
```

### Feature Branch Management

```bash
# Create and switch to new feature branch
git checkout -b feature/[feature-name]

# Check current branch
git status
git branch --show-current

# Switch back to main and merge (preserves commit history)
git checkout main
git merge feature/[feature-name]

# Delete feature branch after merge
git branch -d feature/[feature-name]
```

## Reference Documentation

This document provides core rules. See detailed protocols in:

- [AI Shared Context](../ai-instructions/AI-SHARED.md) - Common project context for AI
- [Technical Architecture](TECHNICAL-ARCHITECTURE.md) - Additional methodology details
- [Task Processing Workflow](../workflows/3-process-task-loop.md) - Detailed task execution workflow
- [Atomic Commit Workflow](../workflows/supplemental/atomic-commit.md) - Enhanced commit workflow
  with comprehensive task context analysis
- [Session Handoff Workflow](../workflows/supplemental/session-handoff.md) - Detailed context handoff workflow
