# ARC Agentic Development Framework Meta PRD

## Purpose

Develop and refine the ARC (Agentic Recursive Coordination) Framework - a comprehensive documentation-only,
reusable framework for AI-augmented software development. The framework provides structured workflows,
template-first documents, and battle-tested processes that enable developers to effectively collaborate with
AI agents while maintaining high code quality and project organization.

### Philosophy: Directed, Not Autonomous

The ARC system is explicitly designed as an **antithesis to "vibe coding"** and unstructured AI interactions. It emphasizes:

- **Constant human oversight** - AI agents operate only under direct developer
  supervision
- **Task-level autonomy limits** - AI autonomous action is strictly limited to individual sub-tasks
  within approved task lists
- **Explicit authorization required** - Any batching or multi-task operations require explicit human approval
- **Structured, hands-on collaboration** - Every AI action is contextualized within a clear task hierarchy
  and approval workflow
- **Preventive against AI drift** - System structure prevents uncontrolled or tangential AI behavior

This approach has been successfully validated in real-world usage (CineXplorer project) and represents a
disciplined alternative to more permissive AI development approaches.

## Core Features

### 1. **Template-First Document System**

- Complete set of template-first documents (META-PRD, PROJECT-STATUS, DEVELOPMENT-RULES, etc.)
- Rich, copy-ready documents with embedded framework defaults and inline guidance
- Battle-tested rules extracted from CineXplorer project integration
- Simple copy-adapt workflow eliminating token replacement complexity
- Stack-specific profile overlays for common tech stacks

### 2. **Comprehensive Workflow Documentation**

- 4-step core workflow (constitution → PRD → tasks → execution)
- Structured supplemental workflows (atomic commits, session handoff, incidental work management)
- AI agent instruction templates (WARP.md, AGENTS.md) with comprehensive protocols
- Session handoff and context preservation processes

### 3. **Constitutional Project Organization**

- Hierarchical task management (META-PRD → PRDs → tasks)
- Constitutional document foundation (META-PRD, PROJECT-STATUS, DEVELOPMENT-RULES, TECHNICAL-OVERVIEW)
- Progress tracking with task-commit synchronization
- Archive system for completed work with completion metadata

### 4. **Zero-Tolerance Quality Gates**

- Development rules enforcement with comprehensive AI collaboration protocols
- Documentation quality standards (markdown linting with zero violations)
- Commit control with comprehensive task context analysis
- Template-first document validation and framework defaults integration

### 5. **Directed AI Collaboration Framework**

- Agent-friendly documentation formats for precise task execution
- Context preservation across sessions to maintain continuity
- Structured task breakdown limiting AI autonomy to individual sub-tasks
- Strict human oversight and approval workflows
- Session management protocols (AI never modifies CURRENT-SESSION.md)
- Multi-line commit handling for terminal environments

## Out of Scope

- **Code generation** - This is a documentation/process system only
- **Tool implementations** - No actual software tools, just processes
- **Platform-specific features** - Remains platform and stack agnostic
- **Autonomous AI operation** - System requires constant human direction and oversight

## User Flows

### Primary Flow: Framework Adoption

1. Developer copies `.arc/` folder into their project
2. Copies and customizes template-first documents (no token replacement needed)
3. Optionally applies stack profile overlay
4. Uses constitutional documents to establish project foundation
5. Follows 4-step workflow for feature development
6. Begins directed, hands-on development with structured AI collaboration

### Secondary Flow: Framework Development (This Repo)

1. Use `.arc-internal/` workspace for framework improvements
2. Follow ARC methodology for framework development (self-hosting)
3. Update template-first documents in `.arc/reference/`
4. Test changes against real development scenarios
5. Integrate battle-tested patterns from CineXplorer usage

### Tertiary Flow: Version Management

1. Track framework evolution via SYSTEM-VERSION.md
2. Maintain backward compatibility in template-first documents
3. Provide migration guides for structural changes
4. Coordinate template consolidation and legacy cleanup

## Success Metrics

### Adoption Metrics

- System copied and used in multiple projects
- Positive feedback from developers using the system
- Community contributions and improvements

### Quality Metrics

- Comprehensive documentation coverage
- Clear, actionable workflows
- Consistent template structure and token usage

### Developer Experience Metrics

- Improved precision and control in AI-assisted development
- Reduced "vibe coding" and unstructured AI interactions
- Better task completion rates through directed AI collaboration
- Enhanced project organization and documentation maintenance
- Faster AI agent onboarding with clear, structured instructions

## Technical Requirements

### Documentation Standards

- Markdown format for all documents with zero-tolerance linting policy
- Template-first documents with comprehensive inline guidance
- Framework defaults embedded in constitutional documents
- Copy-ready documents eliminating token replacement complexity
- Comprehensive README files for each directory

### Version Control

- Clean git history with atomic commits following conventional format
- Semantic versioning (1.0.0 when ready for public release)
- Changelog maintenance with unreleased section
- Feature branch workflow for all development
- Comprehensive task context analysis before all commits

### File Organization

- `.arc/` contains the deployable template system (permanent, versioned)
- `.arc-internal/` for framework development workspace (internal use only)
- Clear naming conventions (`.example.md` for template-first documents, `.profile.md` for overlays)
- Legacy `templates/` directory being consolidated into `.arc/` structure

### Compatibility

- Works with any git-based project
- Agent-agnostic (Claude, Gemini, GPT, etc.)
- Platform agnostic (Windows, macOS, Linux)
- No external dependencies required
