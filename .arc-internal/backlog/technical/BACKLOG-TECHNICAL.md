# Technical Backlog - ARC Framework

**Purpose:** Organized collection of technical work ideas - infrastructure, tooling, and quality improvements.

**Processing:** Items move here from `TASK-INBOX.md` during weekly review.

---

## High Priority

### Documentation Quality

- **README.md refresh**
    - Problem: README is outdated - still has emojis, references old structure
    - Approach: Remove emojis, align with current framework structure and workflows
    - Context: Post-December 2025 sync cleanup

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
