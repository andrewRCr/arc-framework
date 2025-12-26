---
name: commit-format
description: Apply project commit message standards when creating git commits. Use when staging changes, writing commit messages, or when the user asks for help committing code. Ensures conventional commit format, proper Context footer, and length requirements.
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git status:*), Bash(git show:*), Bash(git add:*), Bash(git commit:*)
---

# Commit Message Format Standards

Apply these standards when creating any git commit in this project.

## Message Structure

```
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

`feat` `fix` `docs` `style` `refactor` `test` `chore` `perf` `config`

### Scopes

`auth` `movie` `api` `tests` `types` `config` `docs` `arc` `deps` `email` `theme`

### Body

- 10-15 lines max (20-25 for milestones)
- 1-2 lines per bullet
- Focus on WHY and IMPACT, not implementation details

### Context Footer (REQUIRED)

**With task list:**

```
Context: tasks-[filename].md (Task X.Y)
Context: tasks-[filename].md (Tasks X.Y-X.Z)
Context: tasks-[filename].md (incidental - discovered during Task X.Y)
```

**Atomic/one-off work:**

```
Context: maintenance (atomic / no associated task list)
Context: refactor (atomic / no associated task list)
Context: documentation (atomic / no associated task list)
```

## Githook Validation

Pre-commit hook checks:

- No debug statements (`console.log`, `print()`, `debugger`)
- Subject line length (warns >50, fails >72)
- Conventional commit format

## Prohibited

- PRD references (use task list filename)
- Generic descriptions ("theme system" → "tasks-theme-system.md")
- Checkbox lists in body
- Implementation details (code shows what, commit shows why)
- "Phase X.Y" terminology (use "Task X.Y")

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

## Examples

### Single Task

```
fix(movie): resolve buffer pagination duplicate issue

- Smart buffer now tracks consumed TMDB pages via metadata
- Prevents duplicate movies appearing across pagination

Context: tasks-pagination-buffer-tracking.md (Task 2.1)
```

### Atomic Work

```
chore(deps): update Django to 5.2.8 security patch

- Updated Django from 5.2.7 to 5.2.8
- Addresses CVE-2024-XXXXX

Context: maintenance (atomic / no associated task list)
```
