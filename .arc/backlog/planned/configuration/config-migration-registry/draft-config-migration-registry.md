# Draft: Versioned Config-Key Migration Registry for `arc update`

- **Origin:** [internal] — routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass
  (2026-06-01). Cohorted with `configuration` (config-storage-architecture, customization-arch-realign,
  configurable-lifecycle-artifacts) as the config family; distinct mechanism from each — this is config-key
  _evolution over time_ during update, not where config is stored or the config/method boundary.
- **Purpose:** Give `arc update` chained, version-gated migration of adopter `arc-config.yml` files when ARC's
  config schema changes (key renames, value-enum shifts).

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's next planning iteration._

### `[ ]` **The trigger has fired: plan the registry before CineXplorer's first update**

- _Routed from:_ `adopter-install-authority` draft-design, the `arc update` audit against scaffold-tool practice,
  2026-10-23.

- _Shapes:_ § Deferral rationale + trigger (the second migration exists); § Scope (whether non-config install
  migrations join the registry).

- _Observation:_ `src/commands/update.ts` now carries two inline `arc-config.yml` migrators:
  `migrateUserSyncPush`, which renames `user.sync_push` to `user.notes_push`, and
  `ensureChangesetAdvisoryThresholds`, which rewrites the stored baseline of `arc-config.yml` before the merge so the
  changeset thresholds land. Beside them, `bootstrapRetiredChecks` (`lib/checks/bootstrap.ts`) migrates retiring
  check surfaces into a proposed declaration. Each dispatches and version-gates itself.

- _Needed by:_ CineXplorer's first `arc update` onto a prerelease, right after `storage-cutover`. Priority raised to
  `P1` with this routing.

- _Approach:_ build the registry and register the live migrators, deciding whether install migrations such as
  `bootstrapRetiredChecks` share it. `migrateUserSyncPush` handles notes-keyed configuration the cutover retires, so
  confirm at planning which migrators remain live after the flip.

### `[ ]` **Count a deliberate takeover of a project-edited file as an install migration**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ its inbound entry "The trigger has fired: plan the registry before CineXplorer's first update", whose
  approach leaves open "whether install migrations such as `bootstrapRetiredChecks` share it".

- _Observation:_ `adopter-install-authority` makes `buildChangePlan` (`lib/manifest/plan.ts`) hold a file at its
  recorded class when a new claim gives ARC more ownership of it — Scaffolded to Configurable or Framework, Configurable
  to Framework — unless the file still matches its recorded `pristine_hash`, and report that taking it over needs a
  migration (`draft-adopter-install-authority.md` D8). That migration must decide what happens to the project's edits: a
  second install-migration case beside `bootstrapRetiredChecks`.

- _Approach:_ weigh the takeover case when deciding whether install migrations share the registry; the likeliest first
  one is a method `composable-workflows` makes fixed.

- _Captured during:_ `adopter-install-authority` draft-design close, 2026-10-23.

---

## Problem / Motivation

As ARC evolves, config-schema changes need to migrate adopter `arc-config.yml` files during `arc update`. There
is no infrastructure for chained or version-gated migrations — each rename inlines its own one-shot migrator in
`update.ts`. With a single migration on the books (the `user-sync-ux` work delivered `user.sync_push` →
`user.notes_push` plus `session.push_interlock: on-handoff` → `on-sync`), inline is fine; a second concurrent
migration starts duplicating dispatch + version-gating logic.

## Scope (iterate into a plan)

A versioned migrator registry in `update.ts` — each migration `{ fromFrameworkVersion, migrate(yaml): yaml }`;
`update` runs applicable migrations (selected by stored `manifest.framework_version` vs. current) before
three-way merging the template against the migrated yaml. Old migrations stay registered indefinitely
(idempotent).

## Deferral rationale + trigger

Deliberately deferred from the user-sync-ux work in favor of the inline one-shot pattern — a pre-1.0 framework
with no shipped adopters can't validate the registry interface against real demand until a second migration
exists.

- **Trigger:** a second config-key rename surfaces (likely candidates: interlock/release-wrapper config keys,
  future planning-module keys, the rebrand's surface-wide renames). Scope the WU as "build the registry AND
  register both existing migrations" so two concrete cases inform the interface.

## Scope Estimate

Small–Medium (registry + dispatch + version-gating tests + author doc). Trigger-gated as above.
