# Architecture Decision Records (ADRs)

Records of significant architectural decisions made during development.

## Purpose

ADRs document the context, decision, and consequences of important architectural choices. They serve as:

- **Historical record** of why decisions were made
- **Reference** for understanding system constraints
- **Learning tool** for new developers
- **Input material** for strategy documents (see `../strategies/`)

## Format

Each ADR follows this structure:

- **Title**: Present-tense imperative (e.g., "Use discover endpoint for filtering")
- **Status**: Proposed | Accepted | Deprecated | Superseded by ADR-XXX
- **Context**: Forces that led to this decision
- **Decision**: What we chose to do
- **Consequences**: What becomes easier/harder as a result

## Naming Convention

Files are named: `adr-NNN-short-title.md`

- `NNN`: Three-digit sequential number (001, 002, 003, ...)
- Numbers are never reused, even if ADR is deprecated
- Titles use lowercase with dashes
- `adr-` prefix enables fuzzy finding and explicit type marking

**Examples:**

- `adr-001-use-external-api-endpoint.md`
- `adr-002-jwt-cookie-authentication.md`
- `adr-003-client-side-filtering.md`

## When to Write an ADR

Write an ADR when:

- Decision affects system structure or external contracts
- Multiple alternatives were considered
- Decision driven by external constraint (API limitations, etc.)
- Future developers will ask "why did we do it this way?"
- Decision could be reversed later (context needed for reversal)

Don't write an ADR for:

- Tactical implementation choices (variable names, loop constructs)
- Decisions obvious from code (standard CRUD, framework conventions)
- Temporary or experimental choices

**Rule of thumb:** If someone might want to change this decision in 6 months, they'll need context
for why it was made.

## Finding ADRs

ADRs are numbered sequentially and filenames contain titles.
Browse via filesystem - no separate index is maintained to avoid duplication overhead.

```bash
ls .arc/reference/adr/adr-*.md     # List all ADRs
grep -l "Superseded" adr-*.md      # Find superseded ADRs
```

## Detailed Guidance

For complete methodology, writing tips, and examples, see:
**[ADR Methodology Strategy](../strategies/arc/strategy-adr-methodology.md)**
