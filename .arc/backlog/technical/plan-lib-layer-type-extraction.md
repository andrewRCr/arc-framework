# Plan: Lib-Layer Type Extraction

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

| Type | Proposed neutral home (PRD-time confirmable) |
| ---- | -------------------------------------------- |
| `IOContext`, `UserIOContext` | `lib/io/types.ts` |
| `UserSessionInitStatusResult` | `lib/session-init/types.ts` |
| `ActiveLayout`, `StatusFileCandidate` | `lib/active/types.ts` |
| `ConfigSettings` | `lib/config/types.ts` |

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
