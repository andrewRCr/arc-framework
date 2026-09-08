# Draft: review-request-contracts

- **Origin:** [internal]
- **Cohort:** `review-protocol-alignment`
- **Purpose:** Make every review request shape discoverable and derivable from caller-held facts, eliminating
  hand-authored projections and opaque target identities.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Bind local review targets to the current protected-base identity**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-request-contracts`), housekeep drain (2026-08-20).
- _Concern:_ local review accepted a stale local `main` as authoritative and prepared a 178-commit target for a
  one-commit Errand. Derive or verify the base against the current protected-base identity, while retaining an
  explicit provenance-bearing historical-SHA arm and returning the established base identity in the envelope.

### `[ ]` **Make local dispositions round-trip through public response re-entry**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-request-contracts`), housekeep drain (2026-08-20).
- _Concern:_ the emitted local source reference contains a runtime-only field rejected by `review respond`, and the
  clean-tree/attestation ordering can destroy the reviewed Candidate lineage before response settlement.
- _Fold-in:_ make emitted references directly acceptable at the public boundary and expose one typed next action
  that preserves the reviewed Candidate while composing response, cleanliness, and re-attestation safely.

### `[ ]` **Make review-verb judgment inputs durable and status inputs derivable**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-request-contracts`), housekeep drain (2026-08-20).
- _Concern:_ prepublication routing/self-review facts disappear across reinvocation, while `review status` requires
  an opaque target reference derivable from the same head flags its caller already holds.
- _Fold-in:_ persist judgment inputs by Candidate/subject identity, invalidate them on exact movement, move rejected
  fact diagnostics into JSON, and add a head-flag derivation arm for status.

### `[ ]` **Expose a review-owned per-requirement qualification projection**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-request-contracts`), housekeep drain (2026-07-28);
  captured during `chunked-delivery` draft-design forward-compatibility pass.
- _Concern:_ Terminal delivery assurance must know whether each review requirement is merge-admissible without
  reconstructing the target → requirement → request → receipt chain. `ForwardGateProjection` exposes one complete
  singleton chain; deferred assurance groups may project several requirements from one receipt. Coupling delivery
  to raw receipt cardinality would force a rewrite when groups land.
- _Fold-in:_ public `RequirementQualificationProjection` over caller-held target/requirement facts — closed
  `qualified | nonblocking | blocked | stale` outcomes preserving required-vs-recommended policy, plus exact
  reasoned routing for the exempt case. Group planning stays in `chunked-delivery`.

### `[ ]` **Bind delivery assurance subjects into exact-target review requirements**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-request-contracts`), housekeep drain (2026-07-28);
  captured during `chunked-delivery` draft-design assurance-record pass.
- _Concern:_ Cross-deliverable seam coverage without assurance groups needs the ordinary review requirement to
  name what it covered. Scheduling a seam on its latest incident deliverable is not evidence.
- _Fold-in:_ public `ReviewCoverageBinding` derivation binding exact target, plan revision, member/seam subjects,
  incident generations, and reviewer-guidance digest into requirement identity. Named seams are required assurance
  dimensions (cannot route exempt). Not `chunk-scope-binding` partial-scope algebra or multi-target assurance
  groups.

### `[ ]` **Bound hosted-review result transport and retain concluded outcomes**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-request-contracts`), housekeep drain (2026-09-07);
  captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ large hosted results can exceed the command transport boundary, while a concluded provider outcome
  can become unreachable after the transient response channel closes.
- _Fold-in:_ expose a bounded durable result reference and retrieval contract tied to the exact request and target.
  Continuation-input readiness is extracted as an immediate Errand; this item owns the durable transport design.

## Reachable Request Contracts

Fourteen review verbs take `<file | ->` with help text reading only "Versioned JSON request file" — no schema, no
example, no schema-emitting flag. `run-errand` and `integrate-work-unit.md` instruct the agent to invoke these verbs
with no way to learn what `-` should contain short of reading Zod definitions. Confirmed live during this work unit's
own grooming: composing an `unlock` request required reading the request schema plus two supporting schema modules
across three files. That asymmetry has a cause: the light target schema `unlock` needs shares its name with the
heavier one the chunking and frontline verbs need — see `D4.5`.

The concern splits into a discoverability half and a derivability half, and they ship together.

**D4.1 — Discoverability: register the missing thirteen request schemas.** The build's `onSuccess` hook
(`tsup.config.ts`) composes the review domain over a fresh kernel registry and writes `dist/schemas/kernel.json`, and
`dist` is a published package file — so a review-domain JSON Schema bundle already ships. Of the fourteen verbs, exactly
one request shape is registered (`review-chunking-resolve-request`); the other thirteen exist, are exported, and are
simply never registered. Register them through `registerReviewDomainSchemas`
(`src/scripts/review-gate/core/register-review-schemas.ts`).

**Identity convention: command path, hyphen-joined, plus `-request`** — exactly what the one registered shape already
follows (`review chunking resolve` → `review-chunking-resolve-request`). Derivable from the verb with no lookup table,
which is the point; the one awkward consequence, `review-hosted-request-request`, is accepted in exchange for a rule
that never needs a table.

**D4.2 — The `--schema` flag.** Each of the fourteen verbs accepts `--schema`: derive the id from the command path,
look it up in the composed registry, print the JSON Schema, exit.

**Its surface is wider than the flag.** All fourteen verbs declare the request file as a _required_ operand, and
`ReviewCommandInputSchema` enforces a non-empty value, so `--schema` cannot be invoked without making the operand
optional across the family — a contract change, not a mechanical edit. This repository also validates its own CLI
surface: `reviewCommandInputRegistrations` and the `declareInteractionSite` automation blocks in
`src/handlers/review.ts` are consumed by the command-input inventory renderer and a projection-fidelity test, so both
declarations move with the operand. Enumerated because a task list sized on "add a flag" would miss all of it. A
lookup-and-print over the registry — not a second place where request shapes are described. A hand-maintained
verb-to-schema table is rejected: it re-describes an
association the registry exists to hold, which is `D8`'s defect at smaller scale.

**D4.3 — Completeness anchor.** A test iterates `REVIEW_JSON_COMMAND_PATHS` (`src/handlers/review.ts`) — the canonical
fourteen-verb list — and fails when a verb has no registered request schema at its derived id. A verb shipping without a
reachable schema becomes a build failure rather than a silent gap.

**D4.4 — Derivability: no request may require a field the caller cannot produce.** A schema flag alone makes a
derivability failure _easier_ to get wrong, because it documents the shape of a value the caller then invents.
Confirmed in use during this work unit's planning: the shipped bundle resolves `review-chunking-resolve-request`
instantly — `D4.1`/`D4.2` working exactly as intended — and the schema still does not let a caller compose the
request, because it reports `targetId` as required without conveying that it is underivable. **Shape is not
obtainability**, which is why this half cannot ship separately from `D4.1`–`D4.3`.

The rule: **a request may not require a field the caller cannot legitimately produce; where an exported producer
already exists, the verb runs it over caller-held inputs rather than demanding its output.** Two instances exist
today, and stating the rule rather than patching each is what keeps a third from landing.

- **The routed obligation projection** — `arc review resolve`. Its request carries obligation, reasons, rubric
  identity, retrigger, and count, and the only producer is internal runtime code reached through a different verb.
  The project's own CLI-surface test hand-authors the block with a fabricated digest; if the test cannot route it, no
  caller can. `ReviewPolicyCommandRequestSchema` replaces `standardReview` with `routingFacts`.

  **The accepted shape is `LocalReviewRoutingInput`, not `ReviewRoutingFacts`** — and the distinction is the whole
  point of this unit. `ReviewRoutingFactsSchema` carries eight fields, three of which no caller can produce:
  `changeSetState`, `assurance` (work context and class), and `activity` (which review methods are effectively
  active). `arc review local prepare` demonstrates the correct boundary — it accepts the five judgment facts
  (`LocalReviewRoutingInputSchema`: content kind, review risk, change determinacy, ownership, surface authority) and
  supplies the other three itself, deriving them from the work-unit meta and the installed method files via
  `composeAssurance`. Accepting the full eight-field shape would require the caller to assert its own project's method
  activation — a runtime read of disk — which is the fabrication path this unit exists to close, reappearing one field
  deeper.

  **Evaluator identity is not an assurance input.** Work context, `Class`, method activity, and rubric binding are
  properties of the current repository state; selecting an evaluator is a later execution concern. The resolve
  handler therefore does **not** acquire or fabricate an evaluator identity. Extract the live-context assurance
  composition currently nested behind `LocalPrepareDependencies.composeAssurance(authority)` into an
  evaluator-independent seam over the active meta, installed method files, and rubric binding. Local prepare keeps
  its separate authority resolution and calls the shared seam for routing context; resolve calls the same seam
  directly before the reducer.

  **Reach, enumerated rather than asserted.** This reaches the live-context read, method-file and rubric-binding
  ports, the local-prepare composition adapter and tests, and the resolve handler and tests. It is more than wiring
  two existing calls together, and it is this unit's largest remaining sizing risk — flagged here so task generation
  grounds it rather than inheriting the estimate. `routingFacts` is required; the command derives the projection and
  every resolve envelope echoes the projection actually used, so routing is exposed as output as well as consumed as
  input.
- **The v2 review target's `targetId`** — `arc review chunking resolve`, `arc review frontline run`. It is a
  canonical digest over the target's own fields, computed by the exported `createReviewTarget`
  (`src/scripts/review-gate/core/gate-contract-v2.ts`), which internal callers reach and no verb exposes. Every
  other field on that target is a caller-held git fact. These verbs accept the caller-held fields and compute
  `targetId` themselves through that same function. Their strict request shapes no longer accept caller-supplied
  `targetId`.

A fabricated identity or verdict is indistinguishable in the record from a produced one — the same provenance
collapse `D1` designs against, arriving through the CLI surface. Deriving from caller-held facts is chosen over an
emitting verb because it removes the fabrication path rather than documenting beside it: a caller that supplies only
what it legitimately holds cannot fabricate at all. In neither instance was the gap "no producer exists" — both
producers are written, exported, and already exercised. What is added is an input path that makes the honest route
the only route.

**D4.5 — Disambiguate the duplicated `ReviewTargetSchema`.** Two different schemas carry that name: the light
`{repository, pullRequest, headSha}` in `src/scripts/review-gate/readiness.ts`, used by `unlock` and `readiness`,
and the ten-field v2 target in `src/scripts/review-gate/core/gate-contract-v2-schema.ts`, used by the gate contract,
`chunking resolve`, and `frontline run`. That collision is the direct cause of the asymmetry observed in use —
`unlock` composes first try while `chunking resolve` does not — because a caller who finds one definition gets no
signal the other exists. `D4.2`'s flag separates them at the CLI by schema id; the shared symbol still defeats the
same reader one layer down. Rename the light one to its role. Separable from the rest of `D4` if scope demands it,
and recorded here because it serves the same reader and the same goal.

---
