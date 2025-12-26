# Strategy Document Index

**Purpose:** Quick reference to codified strategy guidance in this project. Consult relevant strategies before implementing
work in these domains.

**Location:** All strategies in `.arc/reference/strategies/` subdirectories

## Project Strategies

*Create project-specific strategies in `project/` directory. Examples:*

**Style & Design:**

- `project/style/strategy-component-styling.md` - Component building patterns, recipes, wrappers
- `project/style/strategy-color-tokens.md` - Color token reference, naming conventions
- `project/style/strategy-layout-tokens.md` - Layout system, spacing, breakpoints

**Engineering:**

- `project/strategy-service-layer.md` - Service patterns, DI, repository pattern
- `project/strategy-authentication.md` - Authentication patterns, session management
- `project/strategy-type-safety.md` - Type checking approach, policy decisions
- `project/strategy-testing-methodology.md` - Testing philosophy, patterns, coverage

## ARC Framework Strategies

**Process:**

- `arc/strategy-adr-methodology.md` - When/how to write Architecture Decision Records
- `arc/strategy-task-list-formatting.md` - Task list structure, formatting conventions
- `arc/strategy-work-organization.md` - Feature vs incidental work, branch coupling, archival

## Usage Protocol

**Before implementing:**

1. Identify domain (theming, auth, testing, etc.)
2. Grep strategy doc for specific topic: `grep -i "your-topic" path/to/strategy.md`
3. Read relevant section(s)
4. Implement following guidance

**When uncertain if strategy applies:** Ask. "Does this work touch [domain] where we have strategy guidance?"

**For broad, multi-topic strategies** (e.g., semantic-tokens): Search for specific component/pattern,
 rather than reading entire doc upfront.

---

**Maintenance:** Update this index when adding new strategy documents. Keep descriptions to one line.
