# Draft: Recurring Errand PR Resolution

- **Origin:** [internal] — captured from a live housekeep drain collision with historical PRs.
- **Purpose:** Make PR resolution topology-correct when a recurring errand reuses a branch slug across runs.

## Problem / Motivation

Fixed-slug errands can reuse one branch name across multiple runs. PR lookup by owner and branch then returns every
historical PR for that name, and the multiple-match arm stops even when all prior matches are merged at old heads and
the current head is new. The 2026-07-19 housekeep drain hit this with historical PRs #82 and #105 before PR #302.

## Approach / Scope

- Teach the shared PR-resolution contract to distinguish benign historical name reuse from a current open or same-head
  match.
- Prefer the general topology rule: all matches merged at heads different from the current unmerged head permits a new
  PR; any live, ambiguous, or same-head match retains the existing stop.
- Preserve pagination and fail-closed behavior, and cover recurring errands plus ordinary branch reuse.
- Keep unique branch suffixes as a fallback only if topology-based classification cannot be made reliable.

---
