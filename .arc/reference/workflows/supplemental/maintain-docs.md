# Workflow: Documentation Maintenance

**Purpose**: Keep .arc framework documentation accurate, consistent, and free of contradictions as the project evolves.

**When to use**: When making changes to constitutional documents or discovering documentation issues during active work.

## Document Update Dependencies

When constitutional documents change, update related files to keep documentation in sync:

### META-PRD.md Changes

**Update these files:**

- `agent/AGENTS.md` - Project overview and features section
- `PROJECT-STATUS.md` - If scope or priorities change

**Why**: META-PRD is the source of truth for project vision. Changes here ripple to reference docs that summarize that vision.

### DEVELOPMENT-RULES.md Changes

**Update these files:**

- Version number in DEVELOPMENT-RULES.md header (increment minor version, update hash)
- All `agent/*.md` files - If protocols or quality standards change
- Team communication about rule changes (if applicable)

**Why**: Development rules govern AI behavior. Version tracking helps identify when behavioral issues stem from rule
changes versus AI interpretation.

### TECHNICAL-OVERVIEW.md Changes

**Update these files:**

- `agent/AGENTS.md` - Technology stack and patterns section
- `PROJECT-STATUS.md` - If architectural decisions affect roadmap

**Why**: Technical architecture decisions cascade to implementation patterns and project timelines.

### PROJECT-STATUS.md Changes

**Consider:**

- If major status changes affect ongoing work priorities
- Update active task lists if completion status changes priorities

**Why**: Status changes may require reprioritization of current work.

## Maintenance Best Practices

### Single Source of Truth

- **Each concept should have ONE authoritative location**
- Other documents can reference it, but shouldn't duplicate it
- Contradictions emerge when same instruction exists in multiple places with slight variations

**Example**: Task completion protocol belongs in `3_process-task-loop.md`.
Other documents should reference it, not duplicate it.

### Cross-References Over Duplication

When tempted to duplicate content:

1. Ask: "Is this the best place for this information?"
2. If no: Remove it and add cross-reference to authoritative location
3. If yes: Make this the authoritative location and remove duplicates elsewhere

**Format**: `See [Document Name](path/to/doc.md) for details.`

### Keep AI Instructions Lean

When updating `agent/` docs:

- **Do**: Reference other docs for details
- **Do**: Provide quick lookup/navigation guides
- **Don't**: Duplicate detailed workflows
- **Don't**: Include meta-content about maintaining the docs themselves

**Rationale**: AI instructions are read every session. Keep them focused on active work context.

### Version Control for Behavioral Rules

**DEVELOPMENT-RULES.md versioning:**

- Increment version number for any substantive change
- Update hash (use simple format: `h{random_chars}`)
- AI confirms version during session initialization

**Why**: If AI behavior regresses, version tracking helps identify whether rules changed or interpretation failed.

## Common Maintenance Tasks

### Resolving Contradictions

**When you find conflicting instructions:**

1. Identify which location should be authoritative (usually the most detailed/specific doc)
2. Update that location to be clear and complete
3. Remove or replace conflicting content in other locations with cross-reference
4. Test: Have AI read both sections and confirm no ambiguity

### Pruning Redundancy

**Regular audit questions:**

- Does this appear elsewhere in identical or nearly identical form?
- Is this foundational knowledge the AI already has? (e.g., DRY principle explanations)
- Is this meta-content about the docs themselves? (consider moving to this file)
- Could this be a cross-reference instead of duplication?

### Adding New Content

**Before adding to session-init reading list:**

- Is this needed for EVERY session, or just specific work types?
- Does similar content already exist that could be expanded?
- Could this live in a separate reference doc and be read on-demand?

**Remember**: Every line added to session-init docs is read every session. Optimize for signal-to-noise ratio.

## Document Hierarchy

### Always Read (Session Init)

- `AGENTS.md` - Project context and lookup guide
- `CURRENT-SESSION.md` - Active work state
- `DEVELOPMENT-RULES.md` - Quality standards and protocols
- `3_process-task-loop.md` - Task execution workflow
- `QUICK-REFERENCE.md` - Commands and environment

### Read On-Demand

- `atomic-commit.md` - When creating commits
- `manage-incidental-work.md` - When handling discovered issues
- `session-handoff.md` - When ending sessions
- `maintain-docs.md` (this file) - When updating documentation

### Meta-Documentation (Not for AI Session Init)

- This file (`maintain-docs.md`)
- Any future documentation about documentation

---

**Version**: 2025-10-24.1 (Initial extraction from AGENTS.md)
