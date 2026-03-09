# Analysis Documents

Internally-produced reference material derived from investigation and synthesis of your project's
own codebase, architecture, or methodology. These are stable reference documents — not strategies
(which are prescriptive) and not research (which synthesizes external sources).

## Purpose

Analysis documents capture structured findings about your project that have lasting reference
value beyond the work unit that produced them. They describe *what exists* and *how it connects*
rather than *what to do*.

**Examples of analysis documents:**

- Cross-cutting dependency maps (which concepts span which files)
- Architecture topology diagrams and connection inventories
- Configuration surface area audits
- Migration impact assessments
- Performance baseline measurements with methodology notes

## When to Create an Analysis Document

Create an analysis document when:

- Investigation produces reference material that future work units will consult
- The findings describe project structure or relationships, not external systems
- The material is stable enough to maintain (not session-specific or rapidly changing)
- A strategy document would be wrong — the content maps rather than prescribes

**Don't create one when:**

- Findings are session-specific → SESSION-NOTES.md or notes file
- Findings inform a single decision → ADR (captures context + decision)
- Findings are about external systems → `reference/research/`
- Findings prescribe patterns to follow → `reference/strategies/`

## Naming Convention

Files are named: `analysis-topic-description.md`

**Examples:**

- `analysis-cross-cutting-dependencies.md`
- `analysis-api-surface-inventory.md`
- `analysis-migration-impact-assessment.md`

## Relationship to Other Reference Types

| Type         | Source                 | Purpose                  | Example             |
|--------------|------------------------|--------------------------|---------------------|
| **Analysis** | Internal investigation | Maps what exists         | Dependency map      |
| **Research** | External sources       | Synthesizes outside info | API comparison      |
| **Strategy** | Experience + decisions | Prescribes patterns      | Testing methodology |
| **ADR**      | Decision point         | Records a choice         | "Why we chose X"    |
