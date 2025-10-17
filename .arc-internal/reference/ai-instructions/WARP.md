# WARP.md - Terminal AI Agent Instructions

This file provides specific guidance for WARP (warp.dev) when working with the ARC Agentic Development
Framework in the terminal environment.

## Project Overview

**See `AGENTS.md` for complete project context and key reference documents.**

The ARC Agentic Development Framework is a pure documentation framework designed for coordinating AI agents
and human developers on spec-driven software work. It provides structured methodology with templates,
workflows, and organizational patterns.

**Key Principle**: Documentation-only framework with minimal dependencies—works with any tech stack and
requires only git, Node.js (NPX), and a markdown editor.

## Common Development Commands

### Markdown Linting (Primary Quality Gate)

```bash
# Lint all markdown files (current simplified approach)
npx --yes markdownlint-cli *.md .arc/**/*.md .arc-internal/**/*.md

# Lint specific file
npx --yes markdownlint-cli path/to/file.md

# Alternative: Use markdownlint-cli2 with patterns (if needed)
npx --yes markdownlint-cli2 "**/*.md"
```

### Pre-commit Quality Check

```bash
# 1. Lint documentation
npx --yes markdownlint-cli *.md .arc/**/*.md .arc-internal/**/*.md

# 2. Check git status
git status

# 3. Review changes for commit planning
git --no-pager diff --stat
```

### System Structure Validation

```bash
# Verify core system structure
for dir in ".arc" ".arc-internal" "templates" "profiles"; do
  if [ -d "$dir" ]; then
    echo "✅ $dir exists"
  else
    echo "❌ Missing $dir"
  fi
done

# Check key workflow files
for file in ".arc/reference/workflows/0-define-constitution.md" ".arc/reference/workflows/1-create-prd.md" ".arc/reference/workflows/2-generate-tasks.md" ".arc/reference/workflows/3-process-task-loop.md"; do
  if [ -f "$file" ]; then
    echo "✅ $file exists"
  else
    echo "❌ Missing $file"
  fi
done
```

### NPX Cache Management (Troubleshooting)

```bash
# Clear npx cache if needed
npx --clear-cache

# Check npx cache location
npm config get cache
```

## Architecture and Structure

### High-Level System Design

```
ARC Framework (Documentation-Only System)
├── .arc/                     # The deployable template system
│   ├── reference/           # Framework reference documentation
│   │   ├── constitution/    # Core project templates (META-PRD, PROJECT-STATUS, etc.)
│   │   ├── ai-instructions/ # AI agent collaboration templates
│   │   ├── workflows/       # Process documentation (core + supplemental)
│   │   └── strategies/      # Pattern documentation
│   ├── active/              # Current work templates
│   └── upcoming/            # Future work templates
├── .arc-internal/           # Framework development workspace
│   ├── active/              # Current framework development
│   ├── reference/           # Framework internal documentation
│   └── upcoming/            # Future framework work
├── templates/               # Legacy template directory (being consolidated)
└── profiles/                # Stack-specific overlays
```

### Core Workflows (Process Architecture)

**See `AGENTS.md` for the complete workflow reference.** Key workflows include:

**Core 4-Step Foundation** (ARC Framework methodology):

1. **`workflows/0-define-constitution.md`** — Project setup and constitutional document creation
2. **`workflows/1-create-prd.md`** — Generate focused PRDs from product direction  
3. **`workflows/2-generate-tasks.md`** — Turn approved PRDs into agent-ready task lists
4. **`workflows/3-process-task-loop.md`** — Execute work loop with human oversight checkpoints

**Supplemental Workflows** (Supporting processes):

- **`workflows/supplemental/session-handoff.md`** — Package context for session transfers
- **`workflows/supplemental/atomic-commit.md`** — Enforce minimal, well-scoped commits
- **`workflows/supplemental/manage-incidental-work.md`** — Handle reactive maintenance tasks
- **`workflows/supplemental/archive-completed.md`** — Move finished work to long-term storage

### Documentation Flow Architecture

```
System Development:
__docs_internal/ → _docs/ → User Projects

Token Replacement Flow:
Templates + Profile + User Values → Instantiated Documentation

Version Management:
SYSTEM-VERSION.md → Templates → User Documentation → Project Evolution
```

### Quality Gates and Testing Strategy

Since this is documentation-only, testing focuses on:

- **Template validation** — Ensure token replacement works correctly
- **Workflow verification** — Test each process end-to-end with real projects
- **AI agent compatibility** — Verify agents can follow the structured instructions
- **Context preservation** — Ensure session handoffs maintain continuity

## Key Development Rules

### Commit Standards (Critical)

- **Manual commit control** — Never commit without explicit user approval
- **Comprehensive Task Context Analysis** — Before committing, analyze ALL changes against task documentation
- **Task-commit synchronization** — When subtasks are [x] complete, parent tasks should be [x] complete  
- **Atomic commits** — Each commit represents a single logical change
- **Feature branch workflow** — Use `feature/` prefix for all development branches
- **Multi-line commit messages** — If `git commit -m` causes interactive editor issues, use file approach:

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

### Quality Requirements

- **All markdown must pass linting** — No commits with markdown lint failures
- **Template-first consistency** — Rich, copy-ready documents with inline guidance
- **CI validation** — GitHub Actions automatically validates structure and links

### File Organization Rules

- **`.arc/`** = The deployable template system (permanent, versioned)
- **`.arc-internal/`** = Framework development workspace (internal use)
- **Templates** as template-first `.example.md` files in `.arc/reference/`
- **Workflows** centralized in `.arc/reference/workflows/`
- **Legacy** `templates/` directory being consolidated into `.arc/` structure

## NPX-Based Tooling Approach

The system deliberately avoids `package.json` and `node_modules` to maintain:

- **Universal compatibility** — Works with any existing project setup
- **Minimal dependencies** — Only requires NPX for on-demand tool execution  
- **Clean repositories** — No dependency management overhead
- **Latest tooling** — Always uses current stable versions

## Integration with User Projects

### Adoption Process

1. Copy `_docs/` folder to target repository
2. Optionally bring `templates/` for document generation
3. Customize via profile overlays (future feature)
4. Use workflows to establish structured development process

### Session Management

**See `__docs_internal/CURRENT-SESSION.md` for active session tracking.**

- **`_docs/CURRENT-SESSION.md`** tracks active work and context in user projects
- Session handoffs preserve decisions, progress, and next steps
- Context rehydration allows AI agents to resume without massive prompts

## AI Agent Coordination

### Structured Context

**Reference `AGENTS.md` for key document locations and workflow overview.**

- **Dual-audience documentation** — Written for both humans and AI agents
- **Process workflows** provide step-by-step agent instructions
- **Task decomposition** from PRDs enables focused agent execution
- **Session persistence** maintains context across agent handoffs

### Agent Boundaries

- **Human oversight checkpoints** built into all workflows
- **Explicit approval required** for commits and destructive operations
- **Quality gates** prevent agents from bypassing validation
- **Context preservation** ensures decisions and rationale are documented

## WARP-Specific Guidance

### Terminal Commands Preference

- Use **bash syntax** for all command examples (Linux/WSL environment)
- Prefer **non-interactive commands** with explicit flags (`--no-pager`, `--yes`)
- Avoid commands that require pagers or interactive input
- Use absolute paths when referencing files outside current directory

### Development Context Integration

- **Always check** `.arc-internal/active/CURRENT-SESSION.md` for active work context
- **Reference task documentation** in `.arc-internal/active/` before making changes
- **Validate against project rules** in `.arc-internal/reference/constitution/DEVELOPMENT-RULES.md`
- **Maintain consistency** with established patterns in `.arc/reference/`
