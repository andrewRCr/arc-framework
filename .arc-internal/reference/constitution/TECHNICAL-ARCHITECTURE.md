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
│   │   ├── META-PRD.example.md
│   │   ├── PROJECT-STATUS.example.md
│   │   ├── DEVELOPMENT-RULES.example.md
│   │   └── TECHNICAL-ARCHITECTURE.example.md
│   ├── ai-instructions/       # AI agent collaboration templates
│   │   ├── AGENTS.example.md
│   │   ├── CLAUDE.example.md
│   │   ├── GEMINI.example.md
│   │   ├── WARP.example.md
│   │   └── copilot-instructions.example.md
│   ├── workflows/             # Process documentation
│   │   ├── 0-define-constitution.md
│   │   ├── 1-create-prd.md
│   │   ├── 2-generate-tasks.md
│   │   ├── 3-process-task-loop.md
│   │   └── supplemental/
│   └── strategies/            # Pattern documentation
├── active/                    # Current work templates
│   └── CURRENT-SESSION.example.md
└── upcoming/                  # Future work templates
    ├── prds/
    └── tasks/

.arc-internal/                 # Framework development workspace
├── active/                    # Current framework development
│   ├── feature/               # Feature work
│   └── incidental/            # Incidental work
├── reference/                 # Framework internal documentation
│   ├── constitution/          # Internal constitutional documents
│   │   ├── META-PRD.md           # Framework development PRD
│   │   ├── PROJECT-STATUS.md     # Current progress tracking
│   │   ├── DEVELOPMENT-RULES.md  # Framework development rules
│   │   └── TECHNICAL-ARCHITECTURE.md # This file
│   └── ai-instructions/       # Internal AI instructions
└── upcoming/                  # Future framework work

templates/                     # Legacy template directory (being consolidated)
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
- **Force-push capability** - For history cleanup during development

### Future Considerations (1.0.0+)

- **Enhanced link validation** - More sophisticated broken link detection
- **Automated template instantiation testing** - CI that actually creates and validates instantiated templates
- **Profile compatibility matrix** - Automated testing of profile overlays against base templates
- **Documentation site generation** - GitHub Pages or similar for browseable system docs
- **Community contribution pipeline** - PR templates, issue forms, and contribution guidelines
- **System usage analytics** - Anonymous metrics on template adoption patterns

### Release Process

1. Update SYSTEM-VERSION.md to target version
2. Move CHANGELOG.md items from Unreleased to versioned section
3. Tag release in git
4. Create GitHub release with adoption guide

## Environments

### Development Environment

- **Local workspace** - `.arc-internal/` for framework development
- **Version control** - Git with feature branch workflow following ARC methodology
- **Testing ground** - Framework self-hosts its own development methodology
- **Template development** - Rich template-first documents in `.arc/reference/`

### Production Environment  

- **User projects** - Copied `.arc/` folders in end-user repositories
- **Public repository** - Clean, versioned framework for community adoption
- **Documentation hosting** - GitHub README and potentially GitHub Pages
- **Template distribution** - Template-first documents ready for immediate use

## Data Flow Architecture

```
Framework Development:
.arc-internal/ → .arc/ → User Projects

Template-First Flow:
Framework Defaults + Template Structure + Inline Guidance → Copy-Ready Documents

Adoption Flow:
.arc/ Directory Copy → Project Customization → Immediate Usage

Version Flow:
SYSTEM-VERSION.md → Template Updates → User Documentation → Project Evolution
```

## Security Considerations

- **No executable code** - Pure documentation reduces attack surface
- **Minimal external dependencies** - Only NPX for tooling, no persistent node_modules
- **User data isolation** - System doesn't collect or transmit data
- **Git-based distribution** - Standard, auditable version control
- **NPX security model** - Tools downloaded on-demand, no persistent installations
- **Temporal workspace isolation** - `.arc-internal/` excluded from public releases

## Scalability Considerations

### System Growth

- **Template additions** - Easy to add new templates without breaking changes
- **Workflow expansion** - New workflows can be added independently  
- **Profile scaling** - Additional tech stack profiles don't affect core system

### User Adoption

- **Copy-paste model** - Each adoption is independent, no central load
- **Versioning strategy** - Users can stay on compatible versions
- **Migration support** - Clear upgrade paths between versions

## Monitoring and Observability

### System Health

- **Usage validation** - Test system against real projects periodically
- **Documentation freshness** - Ensure examples stay current
- **Community feedback** - GitHub issues and discussions (future)

### Development Metrics

- **Template usage patterns** - Which templates are most/least used
- **Profile adoption** - Which tech stacks need better support
- **Workflow effectiveness** - Which processes need refinement

## System Validation Commands

### Template-First Document Testing

```bash
# Validate template-first documents are comprehensive
find .arc/reference -name "*.example.md" -exec echo "Checking {}" \;

# Check file naming conventions
find .arc -name "*.example.md"
find profiles -name "*.profile.md"
find templates -name "*.template.md"  # Legacy templates being consolidated
```

### System Structure Validation

```bash
# Verify core directories exist
test -d ".arc" && echo "✅ .arc directory exists"
test -d ".arc/reference/workflows" && echo "✅ Workflows directory exists" 
test -d "profiles" && echo "✅ Profiles directory exists"
test -d ".arc/reference/ai-instructions" && echo "✅ AI instructions directory exists"

# Verify core template-first documents exist
test -f ".arc/reference/constitution/META-PRD.example.md" && echo "✅ META-PRD template exists"
test -f ".arc/reference/constitution/DEVELOPMENT-RULES.example.md" && echo "✅ DEVELOPMENT-RULES template exists"
test -f ".arc/reference/constitution/PROJECT-STATUS.example.md" && echo "✅ PROJECT-STATUS template exists"
test -f ".arc/reference/constitution/TECHNICAL-ARCHITECTURE.example.md" && echo "✅ TECHNICAL-ARCHITECTURE template exists"
```

### NPX Cache Management

```bash
# Clear npx cache if needed (for troubleshooting)
npx --clear-cache

# Check npx cache location
npm config get cache
```
