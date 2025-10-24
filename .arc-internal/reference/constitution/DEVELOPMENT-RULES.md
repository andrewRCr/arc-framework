# Development Rules - ARC Agentic Development Framework

Version: 0.2.0-dev
Rules Hash: `4b3d89f2`

**Read with**: QUICK-REFERENCE.md (environment context and command patterns)

- Manual commit control (AI NEVER commits without explicit user approval)
- Work categorization: `feature/` (user-facing), `technical/` (infrastructure), `incidental/` (reactive) - see
  [Work Categorization Strategy](../strategies/strategy-work-categorization.md) for decision rules
- Quality gates (zero tolerance policy):
    - Backend tests: N/A (documentation-only framework)
    - Frontend tests: N/A (documentation-only framework)
    - Backend lint: N/A (documentation-only framework)
    - Frontend lint: N/A (documentation-only framework)
    - TypeScript check: N/A (documentation-only framework)
    - Markdown lint: `npx --yes markdownlint-cli2 "**/*.md"` (zero violations)
    - CI validation: GitHub Actions automatically runs on push/PR
- Comprehensive Task Context Analysis before commits
- Template-first approach with framework defaults integration

## Framework-Specific Rules

### Documentation Standards

- All `.md` files must be well-formed Markdown (zero tolerance for linting failures)
- Template-first documents with comprehensive inline guidance and framework defaults
- Examples clearly marked as `.example.md` and copy-ready
- READMEs required for each directory
- ALWAYS run markdown linting after updating any documentation files

### Version Management

- No versioned releases until 1.0.0 (public readiness)
- CHANGELOG.md tracks unreleased changes
- SYSTEM-VERSION.md shows current development version
- Clean git history with meaningful commit messages following conventional format

### File Organization

- `.arc/` = the deployable template system (permanent, versioned)
- `.arc-internal/` = framework development workspace (internal use only)
- Template-first documents in `.arc/reference/constitution/`, `.arc/reference/ai-instructions/`
- Core workflows in `.arc/reference/workflows/`
- Legacy `templates/` directory being consolidated into `.arc/` structure

### Quality Assurance

- **Documentation linting**: ALWAYS run markdown linting after updating any documentation files
- **Markdown linting**: Run `npx --yes markdownlint-cli2 "**/*.md"` before commits
- **Template-first validation**: Verify template-first documents are comprehensive and copy-ready
- **Framework defaults integration**: Ensure battle-tested defaults are properly embedded
- **Workflow validation**: Validate workflows against real framework development usage
- **CI checks**: GitHub Actions runs automatically on push/PR
    - Markdown linting (zero violations policy)
    - Template structure validation
    - Internal link checking
    - Framework system structure validation
- **Backward compatibility**: Maintain compatibility in template-first documents

### Commit Standards

- **Pre-commit checks**: Run markdown linting before committing (zero tolerance)
- **Reference META-PRD context** and task documentation in commit messages
- **Use conventional commit format**: Required (feat:, docs:, fix:, refactor:, etc.)
- **Atomic commits** for single logical changes
- **Multi-line commits**: If `git commit -m` causes interactive editor issues, use file approach:

  ```bash
  # Create commit message file
  cat > /tmp/commit_msg.txt << 'EOF'
  type(scope): Brief description
  
  - Detailed change 1
  - Detailed change 2
  - Impact/rationale
  EOF
  
  # Commit using file
  git commit -F /tmp/commit_msg.txt
  rm /tmp/commit_msg.txt
  ```

- **Never commit if**:
    - Documentation is inconsistent
    - Markdown linting fails
    - CI checks would fail
    - Task documentation doesn't align with changes

## AI Collaboration Rules

### Session Management

- **AI NEVER updates CURRENT-SESSION.md** without explicit user instruction
- Session handoff document controlled exclusively by user
- Preserve context across sessions but don't modify session files
- Follow session handoff protocols for context preservation

### Task Execution

- **Complete ONE sub-task at a time** - mandatory stop after each sub-task
- Wait for explicit user approval before next sub-task
- Update task documentation immediately after each sub-task completion
- Perform comprehensive task context analysis before commits

### Commit Control

- **AI NEVER initiates commits** without explicit user approval/instruction
- User approval required to begin any git operations
- MANDATORY: Comprehensive task context analysis before any commit
- All quality gates must pass before commits

### Quality Standards

- Leave documentation cleaner than found (pre-existing issue protocol)
- Report issues immediately with full context
- Never proceed until quality gate failures are resolved or approved

## Development Commands

### Markdown Linting

```bash
# Lint all markdown files
npx --yes markdownlint-cli2 "**/*.md"

# Lint specific file (use --no-globs to avoid processing config globs)
npx --yes markdownlint-cli2 --no-globs "path/to/file.md"

# Lint specific directory
npx --yes markdownlint-cli2 ".arc/reference/**/*.md"
```

### Pre-commit Workflow

```bash
# 1. Lint documentation (zero tolerance)
npx --yes markdownlint-cli2 "**/*.md"

# 2. Check git status
git status

# 3. Review changes for commit planning
git --no-pager diff --stat

# 4. Add changes
git add [specific files]

# 5. Commit with conventional format
# For simple commits:
git commit -m "type(scope): brief description"

# For multi-line commits (if editor issues occur):
cat > /tmp/commit_msg.txt << 'EOF'
type(scope): Brief description

- Detailed change 1
- Detailed change 2
- Impact/rationale
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```
