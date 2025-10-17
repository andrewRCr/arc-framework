# Workflow: Session Initialization

**Purpose**: Establish complete AI context at session start, ensuring the AI has all necessary environment information,
project context, and behavioral guidance before beginning work.

**When to use**: Every session start (resuming features, starting new work, handling incidental tasks, etc.)

## Steps

### 1. Verify Environment

**Check working directory:**

```bash
pwd
# Confirm you're at the expected location (repo root or appropriate subdirectory)
```

**Verify runtime environment status** (if applicable):

```bash
# For Docker-based projects:
docker ps | grep <project-prefix>

# For projects without Docker, verify virtual environments or language runtimes
```

**Confirm tool availability:**

```bash
# Verify quality gate tools are accessible
# Examples:
#   Python: ls .venv/bin/ | grep -E "pytest|ruff|mypy"
#   Node.js: npm list --depth=0 | grep eslint
#   Documentation-only: npx --yes markdownlint-cli --version
```

### 2. Load AI Context (read in order)

**Read these documents to establish complete context:**

1. `.arc/reference/ai-instructions/AGENTS.md`
   - Project overview and technology stack
   - Quick lookup guide for finding information
   - AI collaboration principles

2. `.arc/active/CURRENT-SESSION.md`
   - Current branch and feature context
   - Last completed work and next action
   - Blockers and outstanding questions

3. `.arc/reference/constitution/DEVELOPMENT-RULES.md`
   - Quality gate requirements
   - Commit standards and protocols
   - AI collaboration rules

4. `.arc/reference/QUICK-REFERENCE.md`
   - Environment-specific command patterns
   - Quality gate commands
   - Path context and common workflows

### 3. Acknowledge Orientation

State your understanding to confirm successful initialization:

- **Working directory**: Current location (e.g., "Working from repository root")
- **Runtime status**: Environment state (e.g., "5 containers running", "no runtime - documentation-only")
- **Tool availability**: Quality gate tools (e.g., "pytest and ruff available")
- **Quality policy**: Acknowledge standards (e.g., "zero-tolerance for linting violations")
- **Reference versions**: Note versions if specified (e.g., "DEVELOPMENT-RULES v1.2.0, hash: abc123")

### 4. Ready to Proceed

With context loaded:

1. Review next action from CURRENT-SESSION.md
2. Check for blockers that need resolution
3. Await user instruction - do not start work until user provides direction

---

**Version**: 2025-10-17
