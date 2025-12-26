# Architecture Decision Records (ADRs) - Framework Development

Records of significant architectural decisions made during ARC framework development.

## Purpose

ADRs document the context, decision, and consequences of important framework design choices. They serve as:

- **Historical record** of why framework decisions were made
- **Reference** for understanding framework constraints and design rationale
- **Learning tool** for contributors
- **Input material** for strategy documents (see `../strategies/`)

## Format

Each ADR follows this structure:

- **Title**: Present-tense imperative (e.g., "Separate template and internal directories")
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

- `adr-001-separate-template-internal-directories.md`
- `adr-002-example-suffix-for-templates.md`
- `adr-003-workflow-file-naming-convention.md`

## When to Write an ADR

Write an ADR when:

- Decision affects framework structure or user-facing contracts
- Multiple alternatives were considered
- Decision driven by usability constraints or adoption concerns
- Future contributors will ask "why did we do it this way?"
- Decision could be reversed later (context needed for reversal)

Don't write an ADR for:

- Tactical content choices (wording, examples)
- Decisions obvious from structure (standard directory organization)
- Temporary or experimental changes

## Finding ADRs

ADRs are numbered sequentially and filenames contain titles.
Browse via filesystem - no separate index is maintained.

```bash
ls .arc-internal/reference/adr/adr-*.md     # List all ADRs
grep -l "Superseded" adr-*.md               # Find superseded ADRs
```

## Detailed Guidance

For complete methodology, writing tips, and examples, see:
**[ADR Methodology Strategy](../../.arc/reference/strategies/arc/strategy-adr-methodology.md)**
