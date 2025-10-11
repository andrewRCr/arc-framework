# Technical Architecture - ARC Agentic System

## Stack Overview (Documentation-Only System)

The ARC system is intentionally **not** a software application - it's a pure documentation and process
framework. This architectural decision ensures:

- **Universal compatibility** - Works with any tech stack
- **Minimal dependencies** - Only requires git, Node.js (for NPX), and a markdown editor
- **Easy adoption** - Simple copy-paste integration
- **No maintenance burden** - No code to update or security patches

### Core Components

```
_docs/                          # The copyable system
├── ai-instructions/           # Agent configuration templates
├── archive/                   # Completed work organization
├── notes/                     # Working notes and scratch
├── reference/                 # Stable patterns and decisions
├── prds/                      # Feature PRDs
├── tasks/                     # Task breakdowns
├── workflows/                 # Process documentation
├── CURRENT-SESSION.example.md # Session template (example)
├── DEVELOPMENT-RULES.example.md
├── META-PRD.example.md
├── PROJECT-STATUS.example.md
├── README.example.md
└── TECHNICAL-ARCHITECTURE.example.md

__docs_internal/               # Development workspace (temporary)
├── META-PRD.md               # System development PRD
├── DEVELOPMENT-RULES.md      # System development rules
├── PROJECT-STATUS.md         # Current progress tracking
├── TECHNICAL-ARCHITECTURE.md # This file
└── CURRENT-SESSION.md        # Session management

templates/                     # Instantiable .template.md files
profiles/                      # Stack-specific overlays
```

## Testing Strategy

Since this is a documentation system, testing focuses on:

### Template Validation

- **Manual instantiation testing** - Verify token replacement works
- **Profile overlay testing** - Ensure profiles merge correctly
- **Real-world usage validation** - Test with actual projects (CineXplorer)

### Documentation Quality

- **Markdown linting** - Ensure all files are well-formed
- **Link validation** - Verify internal references work
- **Consistency checking** - Validate token naming conventions

### Workflow Verification

- **Process walkthroughs** - Test each workflow end-to-end
- **AI agent compatibility** - Ensure agents can follow instructions
- **Context preservation** - Verify session handoffs work

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

## Type Safety

Not applicable - pure markdown documentation system.

However, we maintain "semantic type safety" through:

- **Consistent token naming** - `{{UPPER_SNAKE_CASE}}` format
- **Template structure validation** - Required sections and formats
- **Profile compatibility checking** - Ensure overlays don't conflict

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

- **Local workspace** - `__docs_internal/` for system development
- **Version control** - Git with feature branch workflow
- **Testing ground** - Use system on itself for validation

### Production Environment  

- **User projects** - Copied `_docs/` folders in end-user repositories
- **Public repository** - Clean, versioned system for community adoption
- **Documentation hosting** - GitHub README and potentially GitHub Pages

## Data Flow Architecture

```
System Development:
__docs_internal/ → _docs/ → User Projects

Token Flow:
Templates + Profile + User Values → Instantiated Documentation

Version Flow:
SYSTEM-VERSION.md → Templates → User Documentation → Project Evolution
```

## Security Considerations

- **No executable code** - Pure documentation reduces attack surface
- **Minimal external dependencies** - Only NPX for tooling, no persistent node_modules
- **User data isolation** - System doesn't collect or transmit data
- **Git-based distribution** - Standard, auditable version control
- **NPX security model** - Tools downloaded on-demand, no persistent installations
- **Temporal workspace isolation** - `__docs_internal/` excluded from public releases

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

### Template Testing

```bash
# Validate templates contain tokens
find templates -name "*.template.md" -exec grep -L "{{.*}}" {} \;

# Check file naming conventions
find _docs -name "*.example.md"
find templates -name "*.template.md"
find profiles -name "*.profile.md"
```

### System Structure Validation

```bash
# Verify core directories exist
test -d "templates" && echo "✅ Templates directory exists"
test -d "_docs/workflows" && echo "✅ Workflows directory exists" 
test -d "profiles" && echo "✅ Profiles directory exists"
test -d "_docs/ai-instructions" && echo "✅ AI instructions directory exists"

# Verify core templates exist
test -f "templates/META-PRD.template.md" && echo "✅ META-PRD template exists"
test -f "templates/DEVELOPMENT-RULES.template.md" && echo "✅ DEVELOPMENT-RULES template exists"
test -f "templates/PROJECT-STATUS.template.md" && echo "✅ PROJECT-STATUS template exists"
```

### NPX Cache Management

```bash
# Clear npx cache if needed (for troubleshooting)
npx --clear-cache

# Check npx cache location
npm config get cache
```
