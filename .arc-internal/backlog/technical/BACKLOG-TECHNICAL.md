# Technical Backlog - ARC Framework

**Purpose:** Organized collection of technical work ideas — infrastructure, tooling, and
quality improvements.

**Processing:** Items added from planning discussions, discovery during active work, or backlog review.

---

## Completed

### General Refinement Pass — ✅ Complete

- **Status:** Completed February 2026 — merged via PR #3
- **Archive:** `.arc-internal/reference/archive/2026-q1/technical/01_content-refinement-pass/`

### Structural Readiness Pass — ✅ Complete

- **Status:** Completed February 2026 — merged via PR #4
- **Archive:** `.arc-internal/reference/archive/2026-q1/technical/02_structural-readiness-pass/`

---

## Unscheduled (Not Captured in 1.0 Work Units)

### CI/CD Improvements

- **Enhanced link validation**
    - Problem: Current CI doesn't catch all broken internal links
    - Approach: Add sophisticated link checking to GitHub Actions

- **Automated template instantiation testing**
    - Problem: No CI verification that templates work when instantiated
    - Approach: CI that creates and validates instantiated templates
    - Note: May evolve into CLI integration tests during WU3

### Compatibility Testing Across Agent Platforms

- Problem: ARC claims agent-agnosticism but isn't tested across platforms
- Context: WU1 ADR 3 assesses agent-agnosticism; this would be the validation layer
- Priority: Post-1.0

---

## Superseded by 1.0 Work Units

- ~~Structural analysis pass~~ → WU2 Cluster M (`plan-wu2-methodology-completion.md`)
- ~~README.md refresh~~ → WU4 (`plan-wu4-public-release.md`)
- ~~Migration tools for template updates~~ → WU3 (`prd-cli-implementation.md`)
- ~~Profile system enhancements~~ → WU3 interactive init
- ~~Documentation site~~ → WU4 docs site
- ~~Community contribution pipeline~~ → WU4 community infrastructure

---

**Last reviewed:** 2026-02-22
