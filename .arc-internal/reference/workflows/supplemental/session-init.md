# Workflow: Session Initialization (Framework Development)

**Purpose**: Establish complete AI context at session start for ARC framework development work.

**When to use**: Every framework development session (documentation improvements, CineXplorer syncs, workflow
enhancements, etc.)

## Steps

### 1. Verify Environment

**Check working directory:**

```bash
pwd
# Expected: /home/andrew/dev/arc-agentic-dev-framework
```

**Verify runtime environment status:**

```bash
# This is a documentation-only framework (no runtime containers)
# Verification: N/A
```

**Confirm tool availability:**

```bash
# Markdown linting is the primary quality gate tool
npx --yes markdownlint-cli --version
# Expected: markdownlint-cli available
```

### 2. Load AI Context (read in order)

**Read these documents to establish complete context:**

1. `.arc-internal/reference/ai-instructions/AGENTS.md`
   - Framework overview (documentation-only, template system)
   - Quick lookup guide (workflows, constitution docs)
   - AI collaboration principles

2. `.arc-internal/active/CURRENT-SESSION.md`
   - Current branch and feature context
   - Last completed work and next action
   - Blockers and outstanding questions

3. `.arc-internal/reference/constitution/DEVELOPMENT-RULES.md`
   - Quality gate requirements (markdown linting zero-tolerance)
   - Commit standards and protocols
   - Template-first approach and framework-specific rules

4. `.arc-internal/reference/QUICK-REFERENCE.md`
   - Framework-specific command patterns
   - Path context (template vs. internal directories)
   - Quality gate commands and anti-patterns

### 3. Acknowledge Orientation

State your understanding to confirm successful initialization:

- **Working directory**: Repository root (`/home/andrew/dev/arc-agentic-dev-framework/`)
- **Runtime status**: Documentation-only framework (no runtime)
- **Tool availability**: Markdown linting available via npx
- **Quality policy**: Zero-tolerance quality policy for documentation
- **Reference versions**: DEVELOPMENT-RULES v0.2.0-dev (hash: 4b3d89f2), QUICK-REFERENCE v0.2.0-dev

### 4. Ready to Proceed

With context loaded:

1. Review next action from CURRENT-SESSION.md
2. Check for blockers that need resolution
3. Await user instruction - do not start work until user provides direction

---

**Version**: 2025-10-17 (Framework-internal version)
