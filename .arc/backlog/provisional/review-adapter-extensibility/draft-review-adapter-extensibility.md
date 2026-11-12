# Draft: review-adapter-extensibility

- **Origin:** [internal] — fell out of `review-protocol-alignment`'s grooming, where a capability edit to the
  review policy driver surfaced that the source registry advertises an extensibility it does not deliver.
- **Purpose:** Let a project supply its own review adapter — a provider ARC ships no knowledge of — so the review
  protocol's provider set is genuinely open rather than open only in its identifier schema.

- **State:** provisional stub. Concern recorded, design not started.
- **Class:** `[TBD]`

---

## Problem / Motivation

The review policy machinery is provider-neutral by design: lanes, scopes, pull-request dependence, and dispatch
action are abstract axes; the source lists are ordered configuration; the diagnostics name no provider; and the
source identifier schema is an open slug pattern accepting any well-formed name. The hosted execution layer is
already adapter-array-driven, dispatching by adapter id against an injected set.

What is missing is the supply route. A project can name a source ARC has never heard of, the request parses, and
the lane then resolves the typed `unknown-source` diagnostic and becomes ineligible. The schema advertises a
capability the runtime does not back — the same shape `review-protocol-alignment` exists to remove, arriving at
the source registry rather than at a provider.

## Scope

Three concerns, none started.

### 1. The loading mechanism

How a project supplies an adapter module: a module path in configuration, a plugin convention, an npm package
convention, or a contribution route rather than a load-time one. Adapters are necessarily code — a hosted adapter
parses its provider's natural-language output into ARC's typed finding records, including severity mapping, clean
detection bound to the exact head, and provider-specific failure recognition. None of that is declarable
configuration, so this cannot be answered by a config surface alone.

### 2. The trust boundary

Loading project-specified code into the review-gate execution path is an authority question, not only a wiring
one: the gate is what produces review evidence, and an adapter is what decides whether a provider returned clean.
This may constrain the mechanism more than ergonomics do, so it is recorded as a first-class concern rather than
left to surface during implementation.

### 3. Registration-contract versioning

How a project-supplied registration survives ARC upgrades that extend the contract, and what a version mismatch
does — refuse the adapter, degrade the lane, or fail the run.

## Inherited substrate

`review-protocol-alignment` lands the following, each justified on its own merits rather than as scaffolding for
this work unit. The intent is that this work unit is additive rather than a rewrite.

- Source capabilities — lanes, scopes, pull-request dependence, dispatch action — relocated out of a private core
  constant and onto each adapter's own registration, so a provider fact lives beside the adapter that implements it.
- A validated registration contract, published through the shipped JSON Schema bundle, so an adapter author has a
  machine-readable contract rather than prose. Runtime validation is the load-bearing part here: a
  project-supplied module is never type-checked by ARC's build.
- The driver consuming an injected capability set rather than importing a module constant, so a loader contributes
  entries without a driver change.
- A single named composition seam that assembles the run's capability set, so a loader has one insertion point.
- The dispatch action's runtime enum exposed alongside its derived type, so a registration carrying an unknown
  action is rejected at validation.
- The `unknown-source` diagnostic retained as the fail-safe, so a partial or failed load degrades legibly rather
  than silently.

**The dispatch action stays a closed set, deliberately.** It is not a free-form verb but the tag for which
execution contract an adapter satisfies — a pull-request-comment provider, a local CLI carrier, or ARC's own
subagent carrier. A supplied adapter implements one of those interfaces and inherits its action. A fourth would
mean a fourth execution contract, which is a framework change rather than a project extension, and it is what
keeps workflows from dispatching actions unknown at authoring time. This work unit should not reopen it.

## Unknowns and Assumptions

- **Open — everything in § Scope.** No design has been done.
- **Assumption — the inherited substrate holds.** If `review-protocol-alignment` ships the relocation differently
  from what § Inherited substrate records, re-read it before designing against this description.

## Composition / Coordination

- **`review-protocol-alignment` — the origin, and the substrate provider.** Its concern 8 lands the relocation and
  the forward-compatibility measures above. No hard dependency in the other direction: that work unit is complete
  without this one, and delivers most of the value on its own, since the relocation already lets a project correct
  a provider fact ARC got wrong by editing the adapter beside it.

---
