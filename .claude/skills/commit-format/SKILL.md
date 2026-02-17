---
name: commit-format
description: Apply project commit message standards when creating git commits. Use when staging changes, writing commit messages, or when the user asks for help committing code. Ensures conventional commit format, proper Context footer, and length requirements.
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git status:*), Bash(git show:*), Bash(git add:*)
---

# Commit Message Format Standards

Apply these standards when creating any git commit in this project.

**Full workflow and examples:** See `.arc/reference/workflows/supplemental/atomic-commit.md`

## Message Structure

```text
<type>(scope): Brief description (50-72 chars)

- Key change (1-2 lines)
- Rationale (1-2 lines)
- Impact if significant (1-2 lines)

Context: [task-reference or category]
```

## Required Elements

### Subject Line

- **Format:** `<type>(scope): description`
- **Length:** 50-72 characters (hard limit 72, warns >50)
- **Mood:** Imperative ("add" not "added")

### Types

`feat` `fix` `docs` `style` `refactor` `test` `chore` `perf` `build` `ci` `revert` `config`

### Scopes

`auth` `movie` `api` `tests` `types` `config` `docs` `arc` `deps` `email` `theme` `ui`

### Body

- 10-15 lines max (20-25 for milestones)
- 1-2 lines per bullet
- Focus on WHY and IMPACT, not implementation details

## Context Footer (REQUIRED)

Every commit requires a `Context:` footer with a parenthetical.

### With Task List (most common)

**Single task:**

```text
Context: tasks-[filename].md (Task X.Y)
Context: tasks-[filename].md (Task X.Y.a)        # Level 3 uses letters
Context: tasks-[filename].md (Task X.Y.a.1)      # Level 4 if needed
Context: tasks-[filename].md (Task X.Y.R)        # R = revised/remedial work
```

**Multiple tasks:**

```text
Context: tasks-[filename].md (Tasks X.Y-X.Z)     # Sequential range
Context: tasks-[filename].md (Tasks X.Y.a-X.Y.d) # Subtask range
Context: tasks-[filename].md (Tasks X.Y.c-e)     # Abbreviated range
Context: tasks-[filename].md (Tasks X.Y, A.B)    # Non-contiguous
```

**Task completion with extra task list work:**

```text
Context: tasks-[filename].md (Task X.Y; planning)       # + added new subtasks
Context: tasks-[filename].md (Tasks X.Y-Z; maintenance) # + restructured content
```

**Incidental work:**

```text
Context: tasks-[filename].md (incidental - discovered during Task X.Y)
Context: tasks-[filename].md (incidental - discovered during code review)
```

**Task list metadata only (no code):**

```text
Context: tasks-[filename].md (planning)      # Adding/updating tasks
Context: tasks-[filename].md (maintenance)   # Restructuring task list
```

### Without Task List (boundary scenarios)

**Standard pattern (emergent work):**

```text
Context: planning (no associated task list)        # PRD, new task list creation
Context: documentation (no associated task list)   # PROJECT-STATUS, README, ARC updates
Context: maintenance (no associated task list)     # Dependencies, tooling, config
Context: refactor (no associated task list)        # Quality improvements, cleanup
```

**Atomic pattern (from ATOMIC-TASKS.md or small emergent work):**

```text
Context: planning (atomic / no associated task list)
Context: documentation (atomic / no associated task list)
Context: maintenance (atomic / no associated task list)
Context: refactor (atomic / no associated task list)
```

## Githook Validation

Pre-commit hook (`commit-msg`) checks:

- Conventional Commits format
- Subject line length (warns >50, fails >72)
- Context: footer present with valid format
- Task list file exists (warning only)

## Prohibited

- PRD references (use task list filename)
- Generic descriptions ("theme system" -> "tasks-theme-system.md")
- Checkbox lists in body
- Implementation details (code shows what, commit shows why)
- "Phase X.Y" terminology (use "Task X.Y")
- `--no-verify` to bypass hooks

## Commit Command

Always use HEREDOC for proper formatting:

```bash
git commit -m "$(cat <<'EOF'
type(scope): subject line

- Key change bullet
- Rationale bullet

Context: [appropriate context footer]
EOF
)"
```

## Quick Examples

```text
# Single task
Context: tasks-pagination-buffer.md (Task 2.1)

# Task range
Context: tasks-api-modernization.md (Tasks 3.1-3.4)

# Subtask with letters
Context: tasks-theme-system.md (Task 6.1.h)

# Task + planning work
Context: tasks-theme-system.md (Tasks 6.1.h, 6.2.a-d; maintenance)

# Incidental during code review
Context: tasks-design-system.md (incidental - discovered during code review)

# Atomic maintenance
Context: maintenance (atomic / no associated task list)
```
