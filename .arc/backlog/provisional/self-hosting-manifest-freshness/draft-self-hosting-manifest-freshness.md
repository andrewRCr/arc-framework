# Draft: Self-Hosting Manifest / Install-State Freshness

- **Origin:** [internal] — routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass
  (2026-06-01), consolidating three captures of the same issue (a verification manifest-orphan finding, a
  content-sweep pristine-staleness finding, and a manifest-sweep reconciliation finding).
- **Purpose:** Stop manifest/pristine drift in the self-hosting repo from requiring error-prone hand-maintenance,
  by giving framework moves a reconciliation path that doesn't run the full adopter `arc update`.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Backstop self-host manifest omissions when a shippable file is added, renamed, or removed**

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: self-hosting-manifest-freshness`), housekeep drain
  (2026-06-08); captured at `scalable-authoring-pipeline` PR #67 review cycle. Split 2026-10-23: its recipe-omission
  half and the derive-the-list direction went to `adopter-install-authority`, whose scope is the install inventory.
- _Concern:_ PR #67's verification caught a stale retired-template entry in the recipe / manifest path. A shippable
  file added, renamed, or removed in package source can leave `.arc/system/.internal/manifest.json` with a missing,
  stale, or orphaned entry, and nothing reports it before someone hand-edits the keys.
- _Proposed:_ a project-level guard (not adopter-shipped) comparing package-source shippable files with the self-host
  manifest, or the reconciliation command in § Scope, which would turn the guard's finding into a one-command repair.
- _Scope:_ repo development-time validation and tests/scripts only; do not ship the guard to adopters.
- _Shapes:_ § Scope, direction 1 (the reconciliation command).

### `[ ]` **Decide whether the self-host manifest's stored hashes earn their upkeep, and automate whichever survives**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ § Scope's open fork (a reconcile command versus content equality as the authority), with fresh evidence for
  its second arm.

- _Observation:_ 92 of the 148 entries in `.arc/system/.internal/manifest.json` carry a `pristine_hash` that no longer
  matches package source (66 Framework, 26 Configurable), and 11 entries name files package source no longer has. Only
  three entries are kept current, each by a `framework-sync.test.ts` case that pins the hash of a method a work unit
  added (`pull-request-format`, `route-discovered-work`, `assess-evidence-applicability`). Every later edit to one of
  those three needs a hand-recomputed hash, while the rest drift silently.

- _Observation:_ the first question is whether this repository needs stored hashes at all. Nothing runs `arc health` or
  `arc diff` against it, and the byte-equality checks between the two copies already prove content. If the hashes stay,
  they are derived state and want a generator or a check, not a per-method test pinning one value.

- _Approach:_ settle the draft's fork with this in view, then either drop the three per-method hash assertions in favor
  of one whole-manifest freshness check backed by a reconcile command, or stop storing hashes in the self-host copy.
  Check first whether the storage cohort's register already places `.internal/manifest.json`.

- _Captured during:_ the `applicability-movement-check-choice` Errand, 2026-10-20, whose method edit needed a
  hand-updated hash while two other stale hashes in the same diff went unnoticed.

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
