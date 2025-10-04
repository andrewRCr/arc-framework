# Atomic Commit Workflow

**Note**: This workflow is for AI execution when explicitly instructed by the user. AI should NEVER
initiate this workflow without user approval. See DEVELOPMENT-RULES.md for complete protocols.

Break changes into logical, atomic commits with clear messages.

## Steps

### 1. Check Status

```bash
git status
```

Review all pending changes and verify current branch

### 2. Review Changes

```bash
git --no-pager diff --stat
```

Get overview of changed files and line counts

### 3. Comprehensive Task Context Analysis

**MANDATORY**: Before committing, perform comprehensive analysis of ALL uncommitted changes in the
context of current task documentation:

**Step 1: Identify All Changes**

- Run `git status` and `git --no-pager diff --name-only` to see all modified files
- Examine changes that might not be immediately obvious (config files, documentation, etc.)
- Look for task documentation files that may have been updated

**Step 2: Find Relevant Task Documentation**

- Check `_docs/tasks/` for active task lists related to current work
- Look for task files that reference modified files or related functionality
- Use `find _docs/tasks -name "*.md" -exec grep -l "{{FEATURE_NAME}}" {} \;` to find related tasks

**Step 3: Analyze Task Progress Context**

- Compare actual work completed against task documentation
- Identify which specific subtasks were completed by your changes
- Check if completing subtasks makes any parent tasks complete
- Verify that task status in documentation matches actual implementation

**Step 4: Update Task Documentation**

- Mark completed subtasks as [x] in task files
- Mark parent tasks as [x] ONLY if ALL subtasks are complete
- Update any progress notes or status indicators

### 4. Plan Commits

Organize changes into logical groups:

1. Core functionality (new features, major logic)
2. Configuration/Infrastructure (settings, configs)
3. Documentation (README, docs, task updates)
4. Code formatting (linting fixes, style)
5. Dependencies and cleanup

### 5. Create Atomic Commits

For each logical group:

```bash
git add [specific files for this group]
git commit -m "[type]({{FEATURE_SCOPE}}): Brief description

- Detailed change 1
- Detailed change 2
- Impact or rationale"
```

**Commit types:**

- `feat`: new features
- `fix`: bug fixes
- `docs`: documentation (including task status updates)
- `style`: code formatting
- `refactor`: code restructuring
- `config`: configuration changes
- `chore`: maintenance tasks

**Task Documentation Guidelines:**

- **Always examine task context BEFORE writing commit messages**
- Reference specific task numbers with feature context
- Include parent feature name when completing sub-tasks
- Commit messages should match actual task progress, not aspirational goals
- **Review multiple task files** - work often spans multiple task lists

### 6. Verify Commits

```bash
git log --oneline -10
```

Review recent commit messages for clarity

### 7. Final Check

```bash
git status
```

Ensure all changes are committed and verify branch state

## Key Principles

- Each commit should be a single logical change
- Commits should be independently buildable/testable
- Use descriptive commit messages with context
- Group related changes together
- Separate formatting from functional changes
- Commit messages should accurately reflect WHERE the project stands after the commit
