# Draft: cli-layout-resolver

- **Origin:** [internal]
- **Cohort:** `cli-substrate-adoption`
- **Purpose:** Replace scattered ARC path construction with a typed resolver that preserves today's layout and
  creates a storage-evolution seam.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Align layout-token ownership with the cohort contract**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: cli-layout-resolver`), housekeep drain (2026-07-19); captured
  during `cli-schema-kernel` task-generation grounding audit, Phase 2.
- _Observation:_ the draft's two-layer contract says `cli-schema-kernel` owns placements, prefixes, and stable record
  identities. The settled kernel boundary and cohort contract instead give the kernel only neutral shared vocabulary,
  assign placement/prefix/suffix/path-token schemas to `cli-layout-resolver`, and keep subsystem record identities
  with their semantic owners. Leaving the broader sentence in place would make the layout spec depend on kernel
  exports that will not exist.
- _Approach:_ during `cli-layout-resolver` spec formalization, make the resolver own its validated layout tokens and
  compose only neutral kernel primitives such as the branded `Slug`; remove the expectation that the kernel exports
  placements, prefixes, or subsystem record identities.
- _Touches:_ `draft-cli-layout-resolver.md` § Two-layer contract, `cohort-cli-substrate-adoption.md` § Shared
  contracts, and `spec-cli-schema-kernel.md` § Shared primitives.

## Problem / Motivation

ARC layout knowledge is repeated across hundreds of code and test references. Callers concatenate directory
names, artifact prefixes, and filenames directly, so a layout change has a large blast radius and path-policy
bugs are hard to detect. The current coupling also bakes tracked planning storage into command behavior that will
need to lift into a materialized backing-store model later.

The immediate goal is not to change layout. It is to establish one typed interpretation boundary for the exact
path classes the CLI already uses.

## Goals

- Define the complete current path vocabulary as validated kernel tokens plus a resolver service.
- Migrate production code and tests away from direct construction for the enumerated path classes.
- Preserve byte-for-byte path behavior across supported operating systems.
- Place tracked-planning Git operations behind an explicit audit packet rather than leaking repository mechanics
  into path consumers.
- Leave a credible seam for future storage implementations without adding a new configuration axis now.

## Non-Goals

- Move any artifact, change naming conventions, or introduce a new storage backend.
- Rewrite workflow or strategy prose to call the resolver; documentation follows through later verb adoption.
- Generalize every filesystem path in the CLI. Only the audited ARC-layout classes are in scope.
- Change canonical slug, branch, or lifecycle semantics owned elsewhere.

## Design Decisions

### Complete path-class inventory

The resolver covers exactly these 15 classes:

1. ARC root.
2. Active placement.
3. Meta prefix.
4. Planned placement.
5. Completed placement.
6. Draft prefix.
7. Spec prefix.
8. Tasks prefix.
9. Notes prefix.
10. Method root.
11. Workflow root.
12. ROADMAP name.
13. Session-notes name.
14. Working-memory name.
15. Template suffix.

Each class gets explicit accepted and rejected inputs. The implementation must not silently normalize an invalid
slug, placement, prefix, or suffix into a plausible path.

### Two-layer contract

- `cli-schema-kernel` owns validated tokens such as slugs, placements, prefixes, and stable record identities.
- This member owns the resolver that combines those tokens with a checkout/workspace context to produce paths.
- Callers request a semantic path class rather than joining known strings themselves.
- The resolver returns platform-correct filesystem paths while any persisted identity stays platform-neutral.

The exact function names and grouping remain a spec-time API choice. The required property is a small semantic
surface, not one convenience method per historical call site.

### Migration boundary

- Migrate code and tests for all audited direct references in one member so the architectural boundary is real at
  completion.
- Preserve test readability with fixture/build helpers backed by the same resolver contract.
- Do not edit adopter-facing workflow prose merely to eliminate string literals; those call sites migrate when a
  deterministic CLI verb owns the operation.
- Keep a digest-pinned source inventory in the implementation record so scope drift from the original coupling
  audit is detectable and newly discovered path classes receive an explicit ownership decision.

### Tracked-planning Git audit packet

Operations that cross from layout resolution into tracked planning state carry a four-file packet:

- the path resolver implementation;
- the resolver's contract tests;
- the tracked-planning Git adapter;
- the adapter's integration tests.

No direct Git operation crosses this boundary outside the adapter. The packet is an audit unit, not a new runtime
file format.

### Storage evolution

The resolver models semantic locations independently from the current repository-root materialization. Today's
implementation resolves to the current tracked tree. Future backing-store work may supply another context or
materializer without changing every caller or introducing per-artifact storage booleans here.

## Delivery and Verification

- Start from the digest-pinned inventory produced by the coupling blast-radius audit and reconcile every hit as
  migrated, false positive, documentation-only, or explicitly out of scope.
- Add golden behavior across POSIX and Windows path semantics without asserting host-specific separators blindly.
- Add rejection tests for traversal, malformed slugs, unsupported placements, and ambiguous artifact names.
- Run the full CLI suite because resolver errors can surface in session, planning, lifecycle, and user-state flows.

## Alternatives

- **Leave constants scattered but centralize names:** rejected because callers would still own composition policy.
- **Introduce a virtual filesystem:** rejected as disproportionate; this work needs semantic resolution, not I/O
  virtualization.
- **Change storage during extraction:** rejected because it combines a large compatibility migration with an
  unsettled backing-store transition.
- **Migrate prose and code together:** rejected because agent-authored procedure needs verb evolution, not string
  substitution.

## Risks

- The audited surface is large: roughly 388 production and 243 test references can conceal semantic exceptions.
- A convenience-heavy API can reproduce the same coupling behind a new module.
- Over-scoping generic filesystem utilities would weaken ownership and delay the core migration.
- Encoding the current checkout root too deeply would block the intended storage evolution seam.

## Unknowns and Assumptions

- Settle the resolver API shape during spec formalization after grouping call sites by semantic operation.
- Verify the source inventory digest immediately before implementation and classify drift rather than silently
  appending it.
- Assume the 15 classes are complete for the targeted boundary; newly discovered classes require an explicit
  include/defer decision.

## Scope Estimate

Large (week+). Class `Heavy`: the design is compositional but the migration and verification surface is broad.
Depends on `coupling-blast-radius-audit`, `work-organization-reform`, and `cli-schema-kernel`.
