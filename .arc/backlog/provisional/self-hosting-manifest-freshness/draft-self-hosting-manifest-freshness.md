# Draft: Self-Hosting Manifest / Install-State Freshness

- **Origin:** [internal] — routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass
  (2026-06-01), consolidating three captures of the same issue (a verification manifest-orphan finding, a
  content-sweep pristine-staleness finding, and a manifest-sweep reconciliation finding).
- **Purpose:** Stop manifest/pristine drift in the self-hosting repo from requiring error-prone hand-maintenance,
  by giving framework moves a reconciliation path that doesn't run the full adopter `arc update`.

---

## Problem / Motivation

The self-hosting repo never runs `arc update` against itself (per DEV-RULES.PROJECT § Package-Project Sync), so
`.arc/system/.internal/manifest.json` (tracked) and `pristine.json` (gitignored) drift from package source as
shipped content evolves. Consequences:

- Every framework directory move or file rename requires error-prone hand-editing of manifest keys + recomputed
  hashes — confirmed repeatedly (a renamed method entry; a dropped legacy PRD entry; defunct keys for
  directories that no longer exist; cached README bodies referencing retired `feature/`/`technical/` subdirs and
  the old status-file shape).
- `arc health` / `arc diff` against this repo would mis-report many files as "modified," since stored hashes no
  longer match on-disk content. Inert today only because nothing runs those against self, and the
  content-equality sync test validates content (not hashes).

## Scope (candidate directions — not yet chosen)

1. **A reconciliation command** — `arc manifest reconcile` (or `arc update --self`) that recomputes
   `pristine_hash` from current package source and adds / renames / removes entries to match the recipe, without
   touching any user-owned `.arc/` output — so framework moves stop needing manual manifest surgery. Document a
   recurrence cadence (per-release, or post-content-sweep).
2. **Reduce the hash-maintenance surface** — make the content-equality check the authority for Framework files
   and derive or de-emphasize stored `pristine_hash`, leaving less mutable manifest state to keep fresh.

## Boundaries

Distinct from `config-migration-registry` (config values, not install-state hashes) and from the link-validation
work. The `config-storage-architecture` work explicitly leaves the system `.internal/` manifest out of its
scope.

## Scope Estimate

Small–Medium (command + tests; or a content-authority refactor of the sync check). Design-question resolution
may take longer than the implementation — hence provisional.
