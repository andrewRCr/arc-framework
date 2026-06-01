# Draft: Versioned Config-Key Migration Registry for `arc update`

- **Origin:** [internal] — routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass
  (2026-06-01). Cohorted with `configuration` (config-storage-architecture, customization-arch-realign,
  configurable-lifecycle-artifacts) as the config family; distinct mechanism from each — this is config-key
  *evolution over time* during update, not where config is stored or the config/method boundary.
- **Purpose:** Give `arc update` chained, version-gated migration of adopter `arc-config.yml` files when ARC's
  config schema changes (key renames, value-enum shifts).

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
