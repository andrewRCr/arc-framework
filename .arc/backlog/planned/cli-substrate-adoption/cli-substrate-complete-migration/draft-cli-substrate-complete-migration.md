# Draft: cli-substrate-complete-migration

- **Origin:** [internal]
- **Cohort:** `cli-substrate-adoption`
- **Purpose:** Close the typed-substrate adoption cohort by migrating its remaining first-party consumers,
  retiring transitional compatibility paths, and converging reusable test support on the landed contracts.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Migrate residual raw-Git bindings to the execa executor**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-20); captured during `cli-git-executor` planning.
- _Concern:_ standalone roadmap/decomposition scripts and review-gate runtime surfaces retain direct `child_process`
  Git bindings outside the cohort's execa-backed `GitExec` seam.
- _Approach:_ add those paths to the post-cohort audit; migrate Git-bearing operations onto the landed executor and
  structured error taxonomy, while preserving the qualification runner's non-Git subprocess responsibility behind
  its general process-runner contract.

### `[ ]` **Adopt the session-envelope routed type inventory**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-20); captured during `cli-session-envelope`
  planning close.
- _Concern:_ that member leaves 13 shared/deep value types plus the `BaseDriftResult` web on handwritten authorities
  with thin routing schemas, and records their homes and migration sizes in `notes-cli-session-envelope.md`.
- _Approach:_ consume the landed inventory rather than rediscovering it; migrate each listed authority to its owning
  full schema, retire the handwritten type, and tighten thin views while preserving the member's contained/full roots.

### `[ ]` **Adopt the command-input regime for the session-locus mutation verbs**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ `session-locus-model` merged the mainline command-input regime in, and its own mutation verbs
  are only half-adopted. `locus attach` / `release` / `resolve`, `housekeep open` / `close` / `abandon` /
  `mark-execute`, and `plan open` / `close` / `abandon` now carry input registrations (the registry conformance
  test forces one per value-bearing command), but they are not routed through `withInteractionContext` and their
  `--json` options are not declared `machine-mode`. Their handlers take no `InteractionContext`, so the
  subprocess stdin policy the regime binds end to end does not reach them. The errand family was brought to
  uniform adoption during the merge because mainline had already wrapped four of its verbs; these were never
  wrapped, so nothing regressed — the inventory is simply silent about them rather than truthful, since an
  undeclared `--json` reads as acquisition `optional`.

- _Approach:_ thread `context?: InteractionContext` through the ten handlers, bind `createUserIOContext` /
  `createGitExec` to `context?.subprocess`, wrap the CLI action sites in `withInteractionContext` with
  `{ machineReadable: (opts) => opts.json === true }`, and add the matching `machine-mode` `declareCliOptionSite`
  policies. The errand family in `handlers/errand.ts` is the worked pattern.

- _Scope:_ mechanical against a landed contract — no new policy or domain contract, so it clears the target's
  "not disguised as mechanical migration" cutline test. Its repository-wide audit would surface these as
  same-domain stragglers regardless; this capture just names them up front.

- _Captured during:_ `session-locus-model`'s base reconcile onto post-`cli-command-inputs` mainline (2026-07-24).
  Routed out rather than into Phase 7.E, whose scope is the chunked-review findings pinned at `0c5dd045a` —
  this surfaced from work that merged after that pin.

---

## Problem / Motivation

The six contract-owning cohort members deliberately keep their review surfaces bounded. That makes each member
shippable, but it leaves the final repository-wide conversion vulnerable to becoming an unnamed follow-up:
old-path imports can keep transitional re-export shims alive, tests can continue to encode superseded helpers, and
newly discovered mechanical stragglers can fall between sibling scopes.

This member is the cohort's tail. It starts only after all six contract owners have landed, audits the resulting
tree against their actual public seams, and completes the remaining cohort-scoped migration. The word “complete”
means complete adoption of the contracts this cohort introduced—not a mandate to convert every TypeScript type,
validator, or fallible API to Zod or Result without a boundary need.

## Goals

- Build a fresh post-cohort inventory of remaining first-party imports, local substitutes, compatibility shims,
  and reusable test helpers in the six members' declared substrate domains.
- Migrate every remaining cohort-scoped production and test consumer to the landed owning modules.
- Remove transitional old-path re-exports and their compatibility-only tests once no first-party consumer needs
  them.
- Converge shared fixtures, schema assertions, canonical-data helpers, and Result test support on the landed
  substrate instead of retaining parallel test-only implementations.
- Finish with every audit finding either migrated here or shown to belong to an already-named owner outside this
  cohort; no finding may survive as an unnamed follow-up.

## Non-Goals

- Add new substrate contracts or redesign semantics settled by the six delivering members.
- Convert every CLI type, validator, Promise-returning API, or domain discriminant merely to maximize use of Zod
  or Result.
- Migrate managed operational-state documents; `operational-state-docs` owns that conversion and its policy.
- Change storage layout, lifecycle policy, command behavior, wire formats, canonical bytes, or package API
  compatibility beyond the mechanical adoption needed to remove transitional paths.
- Re-run work already completed and proven by a sibling's closed implementation inventory.

## Design Decisions

### Tail sequencing and source of truth

- Depend directly on all six contract-owning members so the audit runs against landed contracts rather than draft
  APIs or speculative paths.
- Treat the post-merge source tree as the inventory source of truth. Earlier cohort audits seed the search, but
  their counts do not define completion after six branches have changed the surface.
- Record each residual by owning contract, old path or helper, destination, compatibility posture, and verification
  evidence. Reconcile that matrix before closeout.

### Completion cutline

The member owns residual adoption work that is mechanical once the six contracts exist:

- imports of primitives, schemas, layout resolution, canonical utilities, Result adapters, Git execution seams,
  and command-input helpers from superseded locations;
- duplicate first-party types, validators, serializers, and test helpers whose landed owner is already settled;
- temporary re-export modules or aliases introduced to let cohort members land independently;
- stale mocks, fixtures, snapshots, and architecture assertions that keep the superseded path alive; and
- same-domain stragglers discovered by the final repository-wide audit.

A finding that requires a new domain contract or policy decision is not disguised as mechanical migration. It must
point to an existing named owner outside the cohort or be raised as a planning gap before this member can close.
That routing does not permit residual work inside the cohort's declared cutline.

### Compatibility posture

- First-party source and tests move fully to the new owner; internal old-path imports are not preserved as a
  compatibility requirement.
- Delete transitional re-exports after import, mock, fixture, generated-artifact, and package-export searches prove
  they have no required consumer.
- Preserve a path only when it is an independently warranted public or persisted compatibility boundary, not
  because migration was incomplete. Any such boundary needs an explicit owner and characterization coverage and
  does not count as transitional shim debt.
- Preserve wire shapes, canonical bytes, error kinds, and user-observable behavior established by the delivering
  members.

### Test-support convergence

- Prefer shared builders and assertions beside the contract they exercise; avoid a new global test-utility
  grab bag.
- Validate fixtures through the same registered schemas and canonical utilities used by production where that
  strengthens contract fidelity.
- Keep test doubles at stable injection seams such as `GitExec`; do not couple tests to the process library or
  schema-library internals.

## Delivery and Verification

- Capture the residual inventory before editing, then update it as each migration slice lands.
- Use focused characterization tests where removing a shim or helper could change runtime or serialized behavior.
- Run repository-wide searches for every retired symbol and path, including dynamic imports, mocks, fixtures,
  generated outputs, and package export maps.
- Run the full TypeScript, test, build, and Markdown gates after the final sweep.
- Reconcile the completed inventory with all six member scopes and the cohort closeout criteria; zero unresolved
  cohort-scoped findings is required.

## Alternatives

- **Leave migration to opportunistic cleanup:** rejected because it gives transitional paths no owner or deadline.
- **Expand each delivering member until the tree is globally clean:** rejected because it couples otherwise
  independent branches and makes the cohort difficult to review and sequence.
- **Keep old-path re-exports indefinitely:** rejected because internal compatibility aliases would preserve two
  ownership vocabularies and conceal incomplete adoption.
- **Treat every pre-existing validator as cohort scope:** rejected because contract invention and subsystem policy
  need their own design owner; this tail completes settled adoption rather than manufacturing new substrate.

## Risks

- A repository-wide sweep can become a grab bag unless every finding maps to one of the six landed contracts.
- Removing a path that is exported outside the package can create an accidental public API break.
- Tests may use string paths, mocks, or fixtures that ordinary TypeScript import searches miss.
- Parallel post-cohort changes can reintroduce old imports after the inventory baseline.

## Unknowns and Assumptions

- Confirm the package export surface and any external consumers before classifying a re-export as transitional.
- Re-run the inventory immediately before implementation and again at verification to catch source drift.
- Assume managed operational-document conversion remains wholly owned by `operational-state-docs`; only shared
  schema/helper adoption inside CLI code and tests belongs here.

## Scope Estimate

Large (week+). Class `Heavy`: the design is determinate, but the final audit and migration cross production,
tests, package exports, and six independently landed contract surfaces. Depends on all six prior cohort members.
