# Technical Backlog - ARC Framework

**Purpose:** Organized collection of technical work ideas - infrastructure, tooling, and quality improvements.

**Processing:** Items move here from `TASK-INBOX.md` during weekly review.

---

## High Priority

### Documentation Quality

- **Template content enhancement**
    - Problem: Templates need richer examples and battle-tested patterns
    - Approach: Extract patterns from CineXplorer usage
    - Blocked by: CineXplorer sync completion

---

## Medium Priority

### CI/CD Improvements

- **Enhanced link validation**
    - Problem: Current CI doesn't catch all broken internal links
    - Approach: Add sophisticated link checking to GitHub Actions

- **Automated template instantiation testing**
    - Problem: No CI verification that templates work when instantiated
    - Approach: CI that creates and validates instantiated templates

### Documentation Site

- **GitHub Pages documentation**
    - Problem: No browseable documentation site
    - Approach: Generate static site from markdown

---

## Lower Priority / Ideas

- Migration tools for template updates
- Profile compatibility matrix testing
- Community contribution pipeline (PR templates, issue forms)

---

## Related Documents

- Plan: `plan-public-release-repository-strategy.md`

---

**Last reviewed:** 2025-12-26
