# Technical Backlog - ARC Framework

**Purpose:** Organized collection of technical work ideas - infrastructure, tooling, and quality improvements.

**Processing:** Items move here from `TASK-INBOX.md` during weekly review.

---

## High Priority

### General Refinement Pass — ✅ Complete

- **Status:** Completed February 2026 — merged via PR #3
- **Archive:** `.arc-internal/reference/archive/2026-q1/technical/01_content-refinement-pass/`

### Structural Analysis Pass

- **Problem:** Current `.arc/` files mix framework-stable and project-configurable content at the
  paragraph level, which would cause unnecessary merge conflicts during package manager updates
- **Approach:** Audit all files, classify as framework/configurable/scaffolded/project-owned,
  identify mixed-concern sections, map cross-cutting concept dependencies, propose restructuring
- **Context:** Prerequisite for distribution system; results become a focused work unit
- **Sequencing:** After general refinement pass
- **Related:** `feature/plan-distribution-and-update-system.md`

### README.md Refresh

- **Problem:** README is outdated — still has emojis, references old structure, developer-focused
  rather than adoption-focused
- **Approach:** Remove emojis, align with current framework structure, reframe for public audience
- **Starting point:** `arc-portfolio` repo has substantial framework description in `projects.ts`
  data — written from a portfolio angle but provides good content foundation. Needs reframing
  toward user-facing installation/usage focus.
- **Context:** Can proceed independently of distribution work

---

## Medium Priority

### CI/CD Improvements

- **Enhanced link validation**
    - Problem: Current CI doesn't catch all broken internal links
    - Approach: Add sophisticated link checking to GitHub Actions

- **Automated template instantiation testing**
    - Problem: No CI verification that templates work when instantiated
    - Approach: CI that creates and validates instantiated templates
    - Note: May evolve into CLI integration tests once distribution tooling exists

---

## Lower Priority / Ideas

- **Reconsider `.example.md` naming convention** — as templates shift from "filled-in examples"
  (old CineXplorer content) to "structure + guidance + tokens" (current approach), `.template.md`
  may be more accurate. Also consider providing actual filled-in examples separately (in the npm
  package or docs site, not the install directory) so adopters can see what a mature document
  looks like. Related: `plan-distribution-and-update-system.md`
- Documentation site (GitHub Pages for browseable docs)
- Community contribution pipeline (PR templates, issue forms)
- Compatibility testing across agent platforms

---

## Archived / Superseded

- ~~Migration tools for template updates~~ → Superseded by distribution CLI
  (`plan-distribution-and-update-system.md`)
- ~~Profile system enhancements~~ → Superseded by selective agent install during interactive init

---

## Related Documents

- Distribution plan: `../feature/plan-distribution-and-update-system.md`
- Public release plan: `plan-public-release-repository-strategy.md`

---

**Last reviewed:** 2026-02-17
