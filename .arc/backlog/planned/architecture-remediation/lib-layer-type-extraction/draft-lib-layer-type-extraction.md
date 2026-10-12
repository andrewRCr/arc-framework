# Draft: Lib-Layer Type Extraction

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Reconcile the viewer inventory with its local correction**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-20); captured during
  `arc-view-refinements` design review.
- _Concern:_ the shipped viewer added command-owned view and active contracts below the lib layer, but
  `arc-view-refinements` owns the viewer-local correction while it changes the resolver and rendering pipeline.
  This inventory predates that surface and must not rediscover or duplicate the landed extraction.
- _Approach:_ at grooming, remove viewer inversions already corrected locally, retain residual non-schema inversions,
  preserve the `cli-schema-kernel` carve-out, and treat command-specific active envelopes as adapter inputs rather than
  re-homing them speculatively.

### `[ ]` **Re-scope `lib-layer-type-extraction` to the inversions that survive the storage cutover**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: lib-layer-type-extraction`), housekeep drain (2026-10-11).

- _Shapes:_ `draft-lib-layer-type-extraction.md` § Scope and § Sibling Work Units; the storage-coupling register in
  `cohort-state-storage.md`, where row 159 already re-scopes this stub's siblings, `user-sync-module-split` and
  `sync-handler-decomposition`, to "split only what survives".

- _Observation:_ the stub's inventory is stale both ways. Of its six named sites, three no longer invert:
  `lib/active/status-reader.ts` is gone, and `lib/config/status-reader.ts`, `lib/config/resolved-settings.ts`, and
  `lib/release/wu-resolution.ts` import nothing from `commands/`. Meanwhile 19 `lib/` files carry 28 imports from
  `commands/` (counted 2026-10-10). About half sit in code the storage program removes or rewrites: the user-notes and
  workspace types — `UserIOContext`, `runUserOpen` and `runUserClose`, `notesRef`, `NotesPushOutcome`,
  `UserSessionInitStatusResult`, two of them in `lib/store/in-repo/` (register rows 139, 146, 153) — and the
  active-layout reads, `ActiveLayout`, `MetaFileCandidate`, and `resolveTaskListPath` (row 169). The rest are outside
  storage: the session-envelope registry importing command result schemas (`lib/session-envelope/registry.ts`),
  recover's `Probe` types, and `IOContext` from `commands/init.ts`. Re-homing the first half before the cutover is
  thrown away. The stub also records `Heavy` beside a "Small, 1–2 sessions" estimate, and its sequencing note predates
  the parallelism work it waits on.

- _Approach:_ give the stub a register row like 159, re-deriving its inventory from what survives the cutover. Offer
  `storage-seam` the stub's principle as a standing convention while it reroutes consumers — the domain types it
  rewrites land in `lib/`, never `commands/` — so the rewrite does not recreate the inversions at the cheapest moment
  to avoid them. `lib/store/`'s core already imports only the kernel, and the ref backend keeps that.
  `seam-record-kinds` adopted the convention for its kind modules under `lib/store/kinds/`, which import nothing from
  `commands/` (its draft, § This member's design, 2026-10-10); the offer stands for the other seam members. Consider
  making the re-scoped stub a lint ratchet rather than a one-time sweep: a `lib/`-to-`commands/` ban beside the
  `store-raw-state` and `surface-names` predicates (`eslint/architecture-imports.ts`), its survivors recorded as a
  floor in `eslint-suppressions.json`. The inventory grew while the stub waited — the copied pattern its draft warned
  of — and a floor stops that growth without waiting on the re-scope.

- _Captured during:_ `storage-ref-backend` draft-design, 2026-10-10; enriched during `seam-record-kinds` draft-design,
  2026-10-10.

---

## Problem / Motivation

Several `lib/` modules import type contracts from `commands/`, inverting the intended
`lib → commands → handlers → cli` dependency direction. Documented in
`analysis-cli-architecture-solid-dry-audit.md` § P1 (lib-layer dependency inversion).

Sites that currently invert:

- `lib/io-context.ts` — imports `IOContext` from `commands/init.ts`, `UserIOContext` from
  `commands/user.ts`.
- `lib/session-init/recommended-action.ts` — imports `UserSessionInitStatusResult` from
  `commands/user/types.ts`.
- `lib/active/status-reader.ts` — imports `ActiveLayout` and `StatusFileCandidate` from
  `commands/active/types.ts`.
- `lib/config/status-reader.ts` and `lib/config/resolved-settings.ts` — import
  `ConfigSettings` from `commands/config/types.ts`.
- `lib/release/wu-resolution.ts` — imports `ActiveLayout` from `commands/active/types.ts`
  (added in Interlock Release Wrappers WU1 Phase 1, propagating the existing pattern).

**Why this matters.** Imports are type-only so runtime risk is nil; the cost is
conceptual and structural. Lower-level modules become accidentally coupled to
command-surface result shapes, which:

- Raises the cost of reusing `lib/` modules from future CLI wrappers, background tooling,
  or contributor-flat layouts.
- Encourages new lower-level helpers to copy the pattern.
- Makes the command layer the accidental owner of domain types.

Plans B (`plan-sync-handler-decomposition.md`) and C (`plan-user-sync-module-split.md`)
benefit from neutral lib types being the convention before they restructure.

## Approach

Mechanical, type-only re-homing. Move the named types from `commands/*/types.ts` to
neutral `lib/*/types.ts` modules; have command-layer result envelopes compose those types
where they need command-shaped surfaces.

No runtime behavior changes. No test logic changes (only import-path updates).

## Scope

### In scope

| Type                                  | Proposed neutral home (PRD-time confirmable) |
| ------------------------------------- | -------------------------------------------- |
| `IOContext`, `UserIOContext`          | `lib/io/types.ts`                            |
| `UserSessionInitStatusResult`         | `lib/session-init/types.ts`                  |
| `ActiveLayout`, `StatusFileCandidate` | `lib/active/types.ts`                        |
| `ConfigSettings`                      | `lib/config/types.ts`                        |

Per type: define in the new neutral module; update consumer imports across `lib/`,
`commands/`, `handlers/`, and tests; remove or transitionally re-export the old
definition (PRD-time decision: clean break vs. shim).

### Out of scope

- Behavioral changes to any module.
- Module splits — Plan B (`plan-sync-handler-decomposition.md`),
  Plan C (`plan-user-sync-module-split.md`).
- P2 DRY consolidations from the audit (fold into Plan B / Plan C as relevant modules
  are touched).
- Test restructuring (follows production module changes; not driven by this plan).

## Sibling Work Units

Independent of Plans B and C. Benefits both as a precondition (cleaner type substrate to
restructure against) but does not block either.

## Scope Estimate

**Small.** ~1-2 sessions. Mechanical re-homing across the codebase.

- Type relocations + import-site updates: ~1 session.
- Verification (full quality gate suite, type-checking, test runs) and buffer: ~0.5-1
  session.

**Sequencing.** Defer past the parallelism trio (Worktree Foundation + Agile WU
Lifecycle + Concurrent Work Conventions) and Coord Probe per
`analysis-cli-architecture-solid-dry-audit.md` § Sequencing Considerations. Parallel
candidate with Plans B and C once worktree infrastructure unlocks parallel WUs.

---

## Coordination — ADR-022

Per ADR-022, managed-doc types at I/O boundaries are canonical as `z.infer` from the schema (via
`cli-substrate-adoption`) — they are **not** hand-re-homed types. Carve those out of the re-homing scope;
re-home only the residual non-schema types. See `adr-022-managed-operational-state-documents.md` § Coordination.
