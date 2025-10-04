# Development Rules - ARC Agentic System

Version: 0.1.0-dev
Rules Hash: `2078ecf7`

- Manual commit control
- Feature branch workflow (prefix: `feature/`)
- Quality gates (use profile commands)
  - Backend tests: N/A (documentation-only system)
  - Frontend tests: N/A (documentation-only system)
  - Backend lint: N/A (documentation-only system)
  - Frontend lint: N/A (documentation-only system)
  - TypeScript check: N/A (documentation-only system)
  - Markdown lint: `npx markdownlint-cli2 "**/*.md" "!__docs_internal/notes/**" "!__docs_internal/CURRENT-SESSION.md" "!_docs/notes/**"` (or add `--fix` for auto-fix)
  - CI validation: GitHub Actions automatically runs on push/PR
- Comprehensive Task Context Analysis before commits

## System-Specific Rules

### Documentation Standards

- All `.md` files must be well-formed Markdown
- Templates use `{{TOKEN_NAME}}` format consistently
- Examples clearly marked as `.example.md`
- READMEs required for each directory

### Version Management

- No versioned releases until 1.0.0 (public readiness)
- CHANGELOG.md tracks unreleased changes
- SYSTEM-VERSION.md shows current development version
- Clean git history with meaningful commit messages

### File Organization

- `_docs/` = the copyable system (permanent)
- `__docs_internal/` = development workspace (temporary, will be gitignored before public release)
- Templates in `_docs/templates/`
- Workflows in `_docs/workflows/`
- Examples in root `_docs/` level

### Quality Assurance

- **Markdown linting**: Run `npx markdownlint-cli2 "**/*.md" "!__docs_internal/notes/**" "!__docs_internal/CURRENT-SESSION.md" "!_docs/notes/**"` before commits
- **Template validation**: Test template instantiation manually
- **Token verification**: Verify token replacement works correctly
- **Workflow validation**: Validate workflows against real usage
- **CI checks**: GitHub Actions runs automatically on push/PR
  - Markdown linting
  - Template structure validation
  - Internal link checking
  - ARC system structure validation
- **Backward compatibility**: Maintain compatibility in templates

### Commit Standards

- **Pre-commit checks**: Run markdown linting before committing
- **Reference META-PRD context** in commit messages
- **Use conventional commit format** when applicable (feat:, docs:, fix:, etc.)
- **Atomic commits** for logical changes
- **Never commit if**:
  - Documentation is inconsistent
  - Markdown linting fails
  - CI checks would fail

## AI Collaboration Rules

- Preserve context in CURRENT-SESSION.md
- Document rationale for system changes
- Maintain clear task breakdown
- Use structured approach for complex changes

## Development Commands

### Markdown Linting

```bash
# Lint all markdown files (excluding temporal files)
npx markdownlint-cli2 "**/*.md" "!__docs_internal/notes/**" "!__docs_internal/CURRENT-SESSION.md" "!_docs/notes/**"

# Auto-fix formatting issues
npx markdownlint-cli2 --fix "**/*.md" "!__docs_internal/notes/**" "!__docs_internal/CURRENT-SESSION.md" "!_docs/notes/**"

# Lint specific file
npx markdownlint-cli2 path/to/file.md
```

### Pre-commit Workflow

```bash
# 1. Fix formatting
npx markdownlint-cli2 --fix "**/*.md" "!__docs_internal/notes/**" "!__docs_internal/CURRENT-SESSION.md" "!_docs/notes/**"

# 2. Check status
git status

# 3. Add and commit
git add .
git commit -m "docs: [description following META-PRD context]"
```
