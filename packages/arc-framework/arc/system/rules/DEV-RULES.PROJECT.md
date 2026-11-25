# Development Rules (Project)

**Domain-scoped rules:** Teams can split domain-specific rules into separate files — e.g.,
`DEV-RULES.FRONTEND.md`, `DEV-RULES.AUTH.md`. Domain rule files live alongside this file in
`system/rules/` and are loaded on-demand when work touches the relevant domain, not every session.
Use this when a domain's rules are substantial enough to warrant separation.

---

## Quality Gates

**Zero Tolerance Policy:** Every check in a quality gate must pass before its event, no exceptions · `[invariant]`.

## Testing Requirements

**Test framework:** [framework name]

**Coverage expectations:** [your coverage philosophy — percentage targets, meaningful assertions,
or focus areas]

**Markdown linting** remains the primary quality gate for `.arc/` documentation alongside code quality.

## Code Quality Principles

Separate concerns, prefer composition over duplication, favor readability when principles conflict.

## Documentation Standards

### Markdown quality

- **Line length**: 120 characters (enforced by markdownlint) — wrap at natural phrase boundaries near the target
  width. Linting catches overflow but not underfill — consistently short lines (60-90 chars) are the more common
  failure. Bullet continuations, multi-line field values, and bulleted-list entries follow the same target.

### Documentation style

- **Collaborative voice**: Commits, task lists, and project docs read as the work's author would write them — an
  author or team perspective, never a transcript of human-AI interaction. "Approved after review", "Pending
  review", "Decided to defer this" — not "The user approved the approach", "Pending user review".

- **Reference-style links**: Prefer reference-style links for cross-file references, with the definitions collected
  after one trailing `---` per file — the separator doubles as the EOF indicator, since link definitions render
  invisibly. Names are lowercase, descriptive, hyphenated (`[dev-rules]`); short links (same directory or one level
  up) may stay inline; movable ARC WU artifacts use filename-only references per [DEV-RULES.ARC][dev-rules-arc].

## File Organization

- `.arc/` - Development documentation (rules, strategies, workflows, active tasks)
- `[src_dir]/` - [description]
- `[test_dir]/` - [description]

## Capture Routing

[Project-specific routing rules]

## Architecture Documentation

### Architecture Decision Records (ADRs)

Document significant architectural decisions as ADRs in `.arc/reference/adr/`. See [ADR Methodology
Strategy][adr-methodology] for decision criteria, the three-tier stability model, and amendment vs. supersession.

---

[dev-rules-arc]: DEV-RULES.ARC.md
[adr-methodology]: ../../reference/strategies/arc/strategy-adr-methodology.md
