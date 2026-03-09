# Project-Specific Strategies

Project-specific strategy documents for codified technical patterns and decisions.

## Purpose

This directory contains strategies that are specific to your project's domain, technology stack, and
implementation choices. Unlike `../arc/` strategies (which are framework methodology), these strategies
document how YOUR project handles specific technical concerns.

## Subdirectories

- `style/` - UI/UX styling patterns (color tokens, layout tokens, component styling)

## Examples of Project Strategies

- `strategy-authentication.md` - Auth flow, session management, OAuth patterns
- `strategy-pagination.md` - Pagination approach, infinite scroll, cursor vs offset
- `strategy-testing-methodology.md` - Testing patterns, fixture conventions, coverage expectations
- `strategy-service-layer.md` - Business logic organization, service patterns
- `strategy-data-quality.md` - Data validation, normalization, quality gates
- `strategy-type-safety.md` - Type checking approach, strict mode configurations

## When to Create a Project Strategy

Create a strategy document when:

- Multiple files or components need to follow the same pattern
- A technical decision has been made that should be consistently applied
- AI agents need guidance to implement features correctly
- Future developers (or you in 6 months) would benefit from documented rationale

## External and Community Content

This directory is also the natural home for externally-sourced strategies — community-shared
patterns, strategies adapted from other projects, or content found in ARC community resources.
Drop them here alongside your self-authored strategies; they follow the same conventions.

If external content needs deeper integration (replacing an ARC method default, adding to an
extension hook), determine the right mechanism:

- **Replaces an ARC default** → Method override (populate `.override` in `arc-methods.md`)
- **Adds ceremony at an existing hook** → Extension (populate `.steps` in `arc-extensions.md`)
- **Standalone domain guidance** → Strategy (place here, add to STRATEGY-INDEX)

## See Also

- [STRATEGY-INDEX](../STRATEGY-INDEX.md) - Master index of all strategies
- [ADR Methodology](../arc/strategy-adr-methodology.md) - For architectural decisions vs patterns
