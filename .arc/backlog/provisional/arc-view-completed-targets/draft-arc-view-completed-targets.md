# Draft: Completed Work-Unit Artifact Viewing

- **Origin:** [internal] — captured during `arc-view-refinements` final design review.
- **Purpose:** Decide whether semantic artifact viewing should cover completed work units, then define archive-aware
  resolution without coupling the view command to the current git-backed archive layout.

## Problem / Motivation

Explicit work-unit viewing currently resolves only planning and live locations. A completed slug remains a meaningful
semantic target, but its artifact group has moved into completed storage and its cohort document may have moved into a
separate closeout sidecar. Treating that as ordinary path scanning would hide distinct archive semantics and bake the
current storage layout into the command.

## Approach / Scope

- Decide whether `arc view --for <slug>` should be lifecycle-complete.
- Extend the shared semantic target resolver rather than scanning archive paths inside the command.
- Define completed meta, draft, spec, and task-list behavior; archived cohort lookup and ambiguity handling; and exact
  errors for incomplete archive materialization.
- Keep the contract compatible with future non-git backing-store materialization.

---
