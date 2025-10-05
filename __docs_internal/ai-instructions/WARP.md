# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**See `AI-SHARED.md` for complete project context and key reference documents.**

The ARC Agentic Development Framework is a documentation-only system designed for coordinating AI agents
and human developers on spec-driven software work. It's not a software application but a structured
methodology with templates, workflows, and organizational patterns.

**Key Principle**: This is a pure documentation framework with minimal dependencies—works with any tech
stack and requires only git, Node.js (for NPX), and a markdown editor.

## Common Development Commands

### Markdown Linting (Primary Quality Gate)

```powershell
# Lint all markdown files (excluding temporal files)
npx markdownlint-cli2 "**/*.md" "!__docs_internal/notes/**" "!__docs_internal/CURRENT-SESSION.md" "!_docs/notes/**"

# Auto-fix formatting issues
npx markdownlint-cli2 --fix "**/*.md" "!__docs_internal/notes/**" "!__docs_internal/CURRENT-SESSION.md" "!_docs/notes/**"

# Lint specific file
npx markdownlint-cli2 path/to/file.md
```

### Pre-commit Quality Check

```powershell
# 1. Fix formatting
npx markdownlint-cli2 --fix "**/*.md" "!__docs_internal/notes/**" "!__docs_internal/CURRENT-SESSION.md" "!_docs/notes/**"

# 2. Check status
git status

# 3. Review changes for commit planning
git --no-pager diff --stat
```

### Template and System Validation

```powershell
# Validate templates contain expected tokens
Get-ChildItem templates -Filter "*.template.md" | ForEach-Object { if (!(Select-String "{{.*}}" $_.FullName)) { Write-Host "WARNING: Template $($_.Name) may be missing tokens" } }

# Verify core system structure
@('templates', '_docs/workflows', 'profiles', '_docs/ai-instructions') | ForEach-Object { if (Test-Path $_) { Write-Host "✅ $_ exists" } else { Write-Host "❌ Missing $_" } }
```

### NPX Cache Management (Troubleshooting)

```powershell
# Clear npx cache if needed
npx --clear-cache

# Check npx cache location
npm config get cache
```

## Architecture and Structure

### High-Level System Design

```
ARC Framework (Documentation-Only System)
├── _docs/                    # The deployable documentation system
│   ├── workflows/           # Process documentation (7 core workflows)
│   ├── ai-instructions/     # Agent configuration templates
│   ├── sub-prds/           # Feature specifications
│   ├── tasks/              # Task breakdowns from sub-PRDs
│   ├── notes/              # Working notes and scratch
│   ├── reference/          # Stable patterns and decisions  
│   ├── archive/            # Completed work organization
│   └── *.example.md        # Base templates for user projects
├── templates/              # Instantiable .template.md files
├── profiles/              # Stack-specific overlays (future)
└── __docs_internal/       # Development workspace (excluded from releases)
```

### Core Workflows (Process Architecture)

**See `AI-SHARED.md` for the complete workflow reference.** Key workflows include:

**Core 3-Step Foundation** (derived from [ai-dev-tasks](https://github.com/snarktank/ai-dev-tasks), Apache 2.0):

1. **`workflows/1-create-prd.md`** — Generate focused sub-PRDs from product direction
2. **`workflows/2-generate-tasks.md`** — Turn approved sub-PRDs into agent-ready task lists  
3. **`workflows/3-process-tasks.md`** — Execute work loop with human oversight checkpoints

**ARC Framework Extensions** (original work):
4. **`workflows/session-handoff.md`** — Package context for session transfers
5. **`workflows/agent-pr-review.md`** — Guide AI-assisted pull request reviews
6. **`workflows/atomic-commit.md`** — Enforce minimal, well-scoped commits
7. **`workflows/archive-completed.md`** — Move finished work to long-term storage

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
- **Comprehensive Task Context Analysis** — Before committing, analyze ALL changes against task documentation in `_docs/tasks/`
- **Task-commit synchronization** — When subtasks are [x] complete, parent tasks should be [x] complete
- **Atomic commits** — Each commit represents a single logical change
- **Feature branch workflow** — Use `feature/` prefix for all development branches

### Quality Requirements

- **All markdown must pass linting** — No commits with markdown lint failures
- **Template consistency** — All templates use `{{UPPER_SNAKE_CASE}}` token format
- **CI validation** — GitHub Actions automatically validates structure and links

### File Organization Rules

- **`_docs/`** = The copyable system (permanent, versioned)
- **`__docs_internal/`** = Development workspace (temporary, gitignored before release)
- **Examples** clearly marked as `.example.md` in `_docs/`
- **Templates** as `.template.md` in `templates/`
- **Workflows** centralized in `_docs/workflows/`

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

**Reference `AI-SHARED.md` for key document locations and workflow overview.**

- **Dual-audience documentation** — Written for both humans and AI agents
- **Process workflows** provide step-by-step agent instructions
- **Task decomposition** from sub-PRDs enables focused agent execution
- **Session persistence** maintains context across agent handoffs

### Agent Boundaries

- **Human oversight checkpoints** built into all workflows
- **Explicit approval required** for commits and destructive operations
- **Quality gates** prevent agents from bypassing validation
- **Context preservation** ensures decisions and rationale are documented

## WARP-Specific Guidance

### Terminal Commands Preference

- Use **PowerShell syntax** for all command examples (Windows environment)
- Prefer **non-interactive commands** with explicit flags
- Avoid commands that require pagers or interactive input
- Use absolute paths when referencing files outside current directory

### Development Context Integration

- **Always check** `__docs_internal/CURRENT-SESSION.md` for active work context
- **Reference task documentation** in `_docs/tasks/` before making changes
- **Validate against project rules** in `__docs_internal/DEVELOPMENT-RULES.md`
- **Maintain consistency** with established patterns in `_docs/reference/`
