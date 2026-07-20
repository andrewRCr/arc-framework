# Metadata: cli-session-envelope

| **State**     | **Owner** | **Branch**                  | **Class** | **Priority** |
| ------------- | --------- | --------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/cli-session-envelope` | `Heavy`   | `P2`         |

- **Cohort:** `cli-substrate-adoption`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-cli-session-envelope.md`
- **Task List:** `tasks-cli-session-envelope.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Open the PR

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

Session initialization and recovery now validate their complete agent-facing envelope contracts at production
boundaries while preserving the exact JSON representation. Schema-backed records catch malformed routing data
where it is produced, invalid persisted seeds stop recovery cleanly, and internal probe composition uses typed
results without changing established wire errors.

### Added

- Registered runtime schemas for the session-init, lean-recovery, recovery-audit, and compaction-seed contracts,
  plus their shared load-set, task-cursor, probe, and contained-advisory records.
- A normalized compatibility-golden matrix covering the session-init assembly arms and recovery verdicts, alongside
  a reproducible warm/cold validation benchmark.

### Changed

- Session status probes compose independently through the kernel `Result` / `ResultAsync` seam while preserving
  eager concurrency, optional-slot absence, and the existing `{ kind, message }` wire errors.
- Shared and deeply nested slot values validate the routing fields agents consume through pass-through views, while
  unowned evidence remains unchanged for later schema-authority migration.

### Fixed

- Invalid internal envelopes now fail deterministically before emitting partial JSON, while compaction-seed producer
  defects retain their non-fatal session-init behavior and invalid persisted seeds yield structured recovery stops.
- Malformed materialization and shipped-branch identities are isolated from valid advisory results, and base-sync
  schema defects propagate instead of being misreported as remote failures.

### Infrastructure

- Boundary, schema, compatibility, and performance coverage now exercises full producers, malformed payloads,
  conditional slot presence, persisted-seed handling, and the byte-stable CLI output path.

## Completion Notes

This work gives the session-init, recovery, and compaction-seed family one runtime-validated contract without
changing the protocol consumed by agent workflows. Exact-byte goldens were established before production changes,
then retained across the full migration: top-level key order, conditional-slot absence, array order, and the
per-slot success/error algebra remain unchanged.

Validation depth follows ownership. Complete family records and contained advisories now derive their TypeScript
types from strict registered Zod schemas. Shared Git, command-owned, and deeply nested values use deliberately thin
pass-through views that validate only workflow-routing fields and preserve all other evidence. That keeps this
change bounded while leaving an explicit inventory for the cohort's final schema-authority migration and generated
schema-bundle publication.

The internal status pipeline now uses independent kernel `Result` / `ResultAsync` values behind one boundary
adapter. Eager probes still run concurrently, one failed slot does not erase sibling outcomes, optional absence
stays outside the result algebra, and established identity/runtime wire errors retain their messages. Producer
assertions validate for effect and serialize the original objects, while persisted seed reads fail closed through a
structured `seed-invalid` audit result.

Implementation stayed within the declared lifecycle, transport, and public-introspection boundaries. The benchmark
measured a 0.0419 ms paired validation p50 and 0.1076 ms p95 against a 254.8607 ms cold-command p50, keeping
always-on validation well below every materiality threshold. Hosted review further hardened branch routing,
malformed candidate isolation, orphan cleanup, and base-sync schema failures. Final verification passed the build,
Markdown, TypeScript, and shell linting, source and test typechecks, the compatibility and portability matrices,
and the full suite with 6,957 tests passing and one expected skip; the exact-head hosted matrix completed with all
unit, integration, E2E, portability, `ci-ok`, `merge-ok`, and CodeRabbit checks green and no unresolved threads.

---
