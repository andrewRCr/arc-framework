# Quick Reference - ARC Agentic Development Framework

**Version**: 0.2.0-dev | **Updated**: 2025-10-24 | **Location**: `.arc-internal/reference/`

## About This Reference Directory

**Read every session:**

- `DEVELOPMENT-RULES.md` (constitution/) - Rules and quality standards
- `QUICK-REFERENCE.md` (this file) - Environment and commands
- `CURRENT-SESSION.md` (active/) - Work status and next actions

**Key documentation:**

- `constitution/` - Framework principles (META-PRD, TECHNICAL-ARCHITECTURE, PROJECT-STATUS)
- `workflows/` - Core process guides
- `workflows/supplemental/` - Supporting workflows (atomic-commit.md, session-handoff.md, maintain-docs.md,
  sync-cinexplorer-refinements.md)
- `strategies/` - Technical approaches and patterns
- `ai-instructions/` - AI-specific guidance (AGENTS.md, CLAUDE.md, GEMINI.md, WARP.md)

---

## Environment & Path Context

**Repository Root**: `/home/andrew/dev/arc-agentic-dev-framework/`
**All commands in this document assume you are at repository root.**

### Critical Path Reference

| Resource | Location from Repo Root | Why It Matters |
|----------|-------------------------|----------------|
| Template documents | `.arc/reference/` | Template/example content for adopters |
| Internal docs | `.arc-internal/reference/` | Framework-specific documentation |
| Active work | `.arc-internal/active/` | Current feature work |
| Quality gate | `npx --yes markdownlint-cli2` | Zero-tolerance linting |

**Working Directory Note**: This is a documentation-only framework. All work happens at repository root.

### Runtime Environment

**No Runtime Containers**: This framework is documentation-only (no backend, frontend, database, or services).

**Quality Tools**:

- Markdown linting via `npx --yes markdownlint-cli` (primary quality gate)
- Git for version control

---

## Command Patterns

All commands from **repository root**.

### Markdown Linting

```bash
# Lint all documentation
npx --yes markdownlint-cli2 "**/*.md"

# Lint specific file (bypass config globs to avoid processing entire workspace)
npx --yes markdownlint-cli2 --no-globs "path/to/file.md"

# Lint specific directory
npx --yes markdownlint-cli2 ".arc/reference/**/*.md"
```

**Important:**

- Without `--no-globs`, markdownlint-cli2 processes config globs **in addition to** specified files
- Use `--no-globs` when checking/fixing individual files to avoid processing entire workspace

### Git Operations

```bash
# Check status
git status

# Review changes
git --no-pager diff --stat
git --no-pager diff

# Stage changes
git add [specific files]

# Commit (for multi-line, use file approach if needed)
git commit -m "type(scope): description"

# View recent commits
git log --oneline -10

# Check branch
git branch --show-current
```

---

## Quality Gate Commands

Reference for DEVELOPMENT-RULES quality gates. Run before any commit.

```bash
# 1. Markdown Linting (zero violations required)
npx --yes markdownlint-cli2 "**/*.md"

# 2. Git Status Check
git status

# 3. Review Changes
git --no-pager diff --stat
```

---

## Tool Decision Tree

```
Need to run a command?
│
├─ Linting markdown?
│  └─ npx --yes markdownlint-cli2 "**/*.md"
│
├─ Checking file changes?
│  └─ git status && git --no-pager diff --stat
│
├─ Creating commits?
│  └─ Follow atomic-commit.md workflow
│     (File-based approach if interactive editor issues)
│
└─ Reading documentation?
   └─ Check .arc-internal/reference/ for framework docs
      Check .arc/reference/ for template examples
```

---

## Common Patterns

### Incremental Quality Checks (After Document Edit)

```bash
# Lint specific file (use --no-globs to avoid processing entire workspace)
npx --yes markdownlint-cli2 --no-globs ".arc/reference/workflows/some-workflow.md"

# Lint specific directory
npx --yes markdownlint-cli2 ".arc/reference/workflows/**/*.md"

# Quick status check
git status
```

### Syncing from CineXplorer

```bash
# Follow sync-cinexplorer-refinements.md workflow
# Create dated task list
# Compare repositories
# De-instance and migrate improvements
```

---

## Anti-Patterns

### Path Confusion

❌ Forgetting this is documentation-only (no Docker, no services)
❌ Assuming complex build/test infrastructure exists
❌ Using commands meant for application projects

✅ Remember: Markdown linting is the primary quality gate
✅ All work is documentation editing
✅ Git is the only runtime "service" needed

### Command Construction

❌ Running backend/frontend commands (no code to run)
❌ Looking for test suites (documentation doesn't have unit tests)
❌ Assuming venv or Docker are needed

✅ Use npx for markdown linting (always available)
✅ Focus on documentation quality
✅ Follow framework-specific workflows

### Sync Confusion

❌ Syncing active work or temporal content from CineXplorer
❌ Forgetting to de-instance project-specific details
❌ Skipping validation steps

✅ Only sync stable `.arc/reference/` improvements
✅ Only sync format/structure changes from CURRENT-SESSION
✅ Always de-instance before committing
✅ Follow sync-cinexplorer-refinements.md workflow

---

## Key Reminders

1. **Documentation-only framework**: No runtime, no containers, no services
2. **Markdown linting is the quality gate**: Zero tolerance for violations
3. **Git is the workflow**: All changes tracked via git
4. **Template-first approach**: `.arc/` contains examples for adopters
5. **Sync from CineXplorer**: Real-world improvements flow back to framework

---

## Additional Resources

- **DEVELOPMENT-RULES.md** - Quality standards and protocols (what/why)
- **CURRENT-SESSION.md** - Current work context
- **3-process-task-loop.md** - Workflow for task execution
- **supplemental/atomic-commit.md** - Commit creation and review process
- **supplemental/session-handoff.md** - Session handoff protocol
- **supplemental/maintain-docs.md** - Documentation maintenance workflow
- **supplemental/sync-cinexplorer-refinements.md** - CineXplorer sync workflow

---

**Version Note**: Commands assume repo root. This is a documentation-only framework with markdown linting
as the primary quality gate.
