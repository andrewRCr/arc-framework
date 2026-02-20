# Technical Architecture - ARC Agentic Development Framework

## Stack Overview (Documentation-Only System)

The ARC Framework is intentionally **not** a software application - it's a pure documentation and process
framework. This architectural decision ensures:

- **Universal compatibility** - Works with any tech stack
- **Minimal dependencies** - Only requires git, Node.js (NPX), and a markdown editor
- **Easy adoption** - Simple copy-adapt integration
- **No maintenance burden** - No code to update or security patches
- **Template-first approach** - Rich, copy-ready documents with inline guidance

### Core Components

```
.arc/                           # The deployable template system
├── reference/                 # Framework reference documentation
│   ├── constitution/          # Core project templates
│   │   ├── META-PRD.template.md
│   │   ├── PROJECT-STATUS.template.md
│   │   ├── DEVELOPMENT-RULES.template.md
│   │   └── TECHNICAL-OVERVIEW.template.md
│   ├── adr/                   # Architecture decision records
│   ├── research/              # Technical research documents
│   └── strategies/            # Pattern documentation
├── system/                    # Agent-facing operational files
│   ├── agent/                 # AI agent collaboration templates
│   │   ├── AGENTS.template.md
│   │   ├── CLAUDE.template.md
│   │   ├── GEMINI.template.md
│   │   ├── WARP.template.md
│   │   └── copilot-instructions.template.md
│   ├── githooks/              # Git hook scripts
│   └── workflows/             # Process documentation
│       ├── arc/               # ARC framework workflows
│       │   ├── setup/01_initialize-arc.md
│       │   ├── setup/02_define-project.md
│       │   ├── 1_create-prd.md
│       │   ├── 2_generate-tasks.md
│       │   ├── 3_process-task-loop.md
│       │   └── supplemental/
│       └── project/           # Project-specific workflows
├── active/                    # Current work templates
│   ├── feature/               # Feature work templates
│   ├── technical/             # Technical work templates
│   ├── incidental/            # Incidental work templates
│   ├── ATOMIC-TASKS.template.md  # Small one-off tasks
│   └── CURRENT-SESSION.template.md
└── backlog/                   # Future work pipeline
    ├── ROADMAP.template.md     # Sequencing strategy
    ├── TASK-INBOX.template.md  # Zero-friction capture
    ├── feature/               # Feature backlog
    │   └── BACKLOG-FEATURE.template.md
    └── technical/             # Technical backlog
        └── BACKLOG-TECHNICAL.template.md

.arc-internal/                 # Framework development workspace
├── active/                    # Current framework development
│   ├── feature/               # Feature work
│   ├── technical/             # Technical infrastructure work
│   ├── incidental/            # Incidental work
│   └── ATOMIC-TASKS.md        # Small one-off framework tasks
├── backlog/                   # Future framework work pipeline
│   ├── ROADMAP.md             # Framework development sequencing
│   ├── TASK-INBOX.md          # Idea capture
│   ├── feature/               # Framework feature backlog
│   └── technical/             # Framework technical backlog
└── reference/                 # Framework internal documentation
    ├── constitution/          # Internal constitutional documents
    │   ├── META-PRD.md           # Framework development PRD
    │   ├── PROJECT-STATUS.md     # Current progress tracking
    │   ├── DEVELOPMENT-RULES.md  # Framework development rules
    │   └── TECHNICAL-OVERVIEW.md # This file
    ├── agent/                 # Internal AI instructions
    ├── adr/                   # Framework architecture decision records
    ├── research/              # Framework technical research
    └── archive/               # Framework archives (quarterly, by work type)

profiles/                      # Stack-specific overlays
```

## Testing Strategy

Since this is a documentation system, testing focuses on:

### Template-First Document Validation

- **Copy-adapt testing** - Verify template-first documents can be easily copied and customized
- **Framework defaults integration** - Ensure battle-tested defaults are properly embedded
- **Profile overlay testing** - Ensure profiles enhance template-first documents correctly
- **Real-world usage validation** - Test with actual projects (CineXplorer methodology validation)

### Documentation Quality

- **Markdown linting** - Ensure all files are well-formed with zero tolerance policy
- **Link validation** - Verify internal references work across `.arc/` structure
- **Template completeness** - Validate all sections are comprehensive and actionable
- **Inline guidance quality** - Ensure template comments and guidance are clear

### Workflow Verification

- **Process walkthroughs** - Test each workflow end-to-end on real development work
- **AI agent compatibility** - Ensure agents can follow structured instructions effectively
- **Context preservation** - Verify session handoffs maintain continuity across AI/human transitions
- **Constitutional integration** - Validate workflows integrate properly with constitutional documents

### Automated Quality Gates

- **Pre-commit validation** - NPX-based markdown linting
- **CI pipeline validation** - Multi-stage GitHub Actions workflow
- **Template structure checks** - Automated token and naming convention validation
- **System integrity checks** - Core directory and file existence validation

## Tooling Architecture

### NPX-Based Approach

The system uses NPX for all external tooling to maintain a clean repository:

- **On-demand execution** - Tools downloaded and cached by NPX as needed
- **No package.json** - Avoids dependency management overhead
- **No node_modules** - Keeps repository lightweight and focused
- **Version flexibility** - Always uses latest stable versions of tools
- **Clean CI** - No dependency installation or caching steps required

### Configuration Files

- **`.markdownlint.json`** - Markdown linting rules optimized for documentation
- **`.gitignore`** - Excludes temporal workspace files and NPX cache
- **`.github/workflows/ci.yml`** - Automated quality gates and validation

## Documentation Structure Safety

Pure markdown documentation system with structural consistency through:

### Template-First Structure Validation

- **Template completeness** - All template-first documents have comprehensive sections
- **Framework defaults integration** - Battle-tested rules properly embedded
- **Inline guidance consistency** - Clear customization instructions throughout
- **Copy-ready validation** - Templates can be immediately used without external dependencies

### Semantic Consistency

- **Constitutional document alignment** - All documents reference and support each other
- **Workflow integration** - Process documentation aligns with constitutional requirements
- **Profile compatibility** - Stack-specific overlays enhance without conflicting

## CI/CD

### Current State

- **Automated CI/CD** - GitHub Actions workflow (`.github/workflows/ci.yml`)
- **NPX-based tooling** - No package.json or node_modules clutter
- **Multi-stage validation**:
    - Markdown linting via `markdownlint-cli2`
    - Template structure validation
    - Internal link checking
    - ARC system structure validation
- **Git-based version management** - Clean history with atomic commits

### Future Considerations (1.0.0+)

- **Enhanced link validation** - More sophisticated broken link detection
- **Automated template instantiation testing** - CI that actually creates and validates instantiated templates
- **Profile compatibility matrix** - Automated testing of profile overlays against base templates
- **Documentation site generation** - GitHub Pages or similar for browseable system docs
- **Community contribution pipeline** - PR templates, issue forms, and contribution guidelines
- **System usage analytics** - Anonymous metrics on template adoption patterns
