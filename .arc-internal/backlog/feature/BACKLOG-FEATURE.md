# Feature Backlog - ARC Framework

**Purpose:** Organized collection of feature work ideas for the framework.

**Processing:** Items move here from `TASK-INBOX.md` during weekly review.

---

## High Priority

### Distribution & Update System

- **Problem:** No clean mechanism for users to install ARC or receive updates without manual
  copy/sync and risk of losing customizations
- **Approach:** npm package with CLI (`arc init` / `arc update`), pristine copy + three-way merge
- **Status:** Initial planning complete
- **Plan:** `plan-distribution-and-update-system.md`
- **Next step:** Structural analysis pass (technical backlog) is prerequisite

---

## Medium Priority

### Interactive Init Experience

- **Problem:** Setting up ARC for a new project requires manual template editing and placeholder
  replacement
- **Approach:** CLI-driven interactive setup with token replacement, conditional content inclusion,
  selective agent tooling install
- **Note:** This is part of the distribution system but called out separately as a significant
  feature in its own right
- **Related:** `plan-distribution-and-update-system.md` (Interactive Init section)

---

## Lower Priority / Ideas

- Integration examples for common tech stacks (React, Django, etc.)
- Tutorial content and walkthrough materials
- Example project showcasing ARC adoption from scratch

---

**Last reviewed:** 2026-02-17
