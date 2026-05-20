---
purpose: Keep project documentation accurate, consistent, and free of contradictions as the project evolves.
audience: agent
---

# Workflow: Maintain Project Docs

**When to use**: When making changes to constitutional documents or discovering documentation issues during active work.

## Document Update Dependencies

When constitutional documents change, update related files to keep documentation in sync:

### META-PRD.md Changes

**Update these files:**

- `briefs/AGENT-BRIEF.PROJECT.md` - Project overview and features section

**Why**: META-PRD is the source of truth for project vision. Changes here ripple to reference docs that summarize that vision.

### DEV-RULES.PROJECT.md Changes

**Update these files:**

- Version number in DEV-RULES.PROJECT.md header (increment version, update hash)
- All `briefs/*.md` files - If protocols or quality standards change
- Team communication about rule changes (if applicable)

**Why**: Development rules govern AI behavior. Version tracking helps identify when behavioral issues stem from rule
changes versus AI interpretation.

### TECHNICAL-OVERVIEW.md Changes

**Update these files:**

- `briefs/AGENT-BRIEF.PROJECT.md` - Technology stack and patterns section

**Why**: Technical architecture decisions cascade to implementation patterns and project timelines.

## Maintenance Best Practices

### Single Source of Truth

- **Each concept should have ONE authoritative location**
- Other documents can reference it, but shouldn't duplicate it
- Contradictions emerge when same instruction exists in multiple places with slight variations

### Cross-References Over Duplication

When tempted to duplicate content:

1. Ask: "Is this the best place for this information?"
2. If no: Remove it and add cross-reference to authoritative location
3. If yes: Make this the authoritative location and remove duplicates elsewhere

**Format**: `See [Document Name](path/to/doc.md) for details.`

### Keep AI Instructions Lean

When updating `briefs/` docs:

- **Do**: Reference other docs for details
- **Do**: Provide quick lookup/navigation guides
- **Don't**: Duplicate detailed workflows
- **Don't**: Include meta-content about maintaining the docs themselves

**Rationale**: AI instructions are read every session. Keep them focused on active work context.

### Version Tracking for Project Rules

**DEV-RULES.PROJECT.md version header:**

- Increment version when project rules change substantively
- Update hash (short hex string for quick identity check)
- AI notes version during session initialization

**Why**: Tracking your project's rule evolution helps identify when behavioral changes stem from
rule updates versus interpretation drift. This version tracks your project's rules, not the ARC
framework version — use any versioning scheme that works for your team.

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

---
