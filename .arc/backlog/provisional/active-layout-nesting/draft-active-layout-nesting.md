# Draft: Nest Active Work-Unit Artifacts by Slug

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-30); captured during
  `judgment-authority-model` handoff.
- **Purpose:** Make `active/` use the same per-work-unit containment shape as backlog and completed storage, so
  multiplicity and relocation are structural rather than inferred from interleaved filenames and branches.

---

## Problem / Motivation

`active/` is the only lifecycle location with a flat artifact layout. Two active work units interleave their meta,
spec, task, and companion files in one directory, while backlog and completed states wrap each group by slug.

An `active/<slug>/` shape would:

- make lifecycle movement directory-to-directory
- let resolvers answer multiplicity by directory without branch coupling
- keep concurrent artifact groups legible
- align tracked storage with the shape a later materialized projection would need

It does not by itself prevent a foreign active group from appearing in a checkout; exclusion and base-emptiness
guards remain separate concerns.

## Coordination

Reconcile the existing `quality-gate-hooks` concern that assumes a flat reader/writer layout. Ground the cascade in
the meta reader, worktree scaffold, archive relocation, session-init scan, manifest, and any local-mode or backend
projection boundaries before choosing a migration shape.

## Unknowns and Assumptions

- Is the tracked active layout worth changing before operational state materializes elsewhere?
- Which APIs expose flat paths as compatibility contracts?
- Can forward-only relocation cover every development checkout under the pre-release posture?

## Scope Estimate

Large — storage layout, resolver and lifecycle mutation cascade, documentation, migration, and cross-platform
tests.
