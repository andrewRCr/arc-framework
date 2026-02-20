# Strategy Document Index

**Purpose:** Quick reference to codified strategy guidance. Consult relevant strategies before implementing
work in their domains.

**Location:** `.arc/reference/strategies/` — `arc/` for framework methodology (ships with ARC),
`project/` for your project-specific patterns (you create these).

## ARC Framework Strategies

These ship with the framework and cover development methodology applicable to any project.

- `arc/strategy-adr-methodology.md` - When/how to write Architecture Decision Records
- `arc/strategy-backlog-organization.md` - Backlog structure, processing flow, atomic task conventions
- `arc/strategy-development-methodology.md` - Commit standards, verification, session/task management
- `arc/strategy-quality-gates.md` - Tiered quality gate system, integration checkpoints
- `arc/strategy-task-list-formatting.md` - Task list structure, formatting conventions
- `arc/strategy-work-organization.md` - Feature vs incidental work, branch coupling, archival

## Project Strategies

Create project-specific strategies in `project/` as your project's patterns emerge.
See `project/README.md` for guidance on when to create one.

**Example strategies adopters might create** (illustrations — these files don't exist until you
create them):

- `project/strategy-authentication.md` - Auth flow, session management
- `project/strategy-testing-methodology.md` - Testing patterns, coverage expectations
- `project/strategy-service-layer.md` - Business logic organization, DI patterns
- `project/strategy-type-safety.md` - Type checking approach, policy decisions
- `project/style/strategy-component-styling.md` - Component patterns, design system
- `project/style/strategy-color-tokens.md` - Color token reference, naming conventions

## Usage Protocol

**Before implementing:**

1. Identify domain (theming, auth, testing, etc.)
2. Check this index for relevant strategy documents
3. Read relevant section(s) of the strategy
4. Implement following guidance

**When uncertain if strategy applies:** Ask. "Does this work touch [domain] where we have strategy guidance?"

**For broad, multi-topic strategies:** Search for the specific topic rather than reading the entire
doc upfront.

---

**Maintenance:** Update this index when adding new strategy documents. Keep descriptions to one line.
