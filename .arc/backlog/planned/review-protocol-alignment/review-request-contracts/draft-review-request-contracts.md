# Draft: review-request-contracts

- **Origin:** [internal]
- **Cohort:** `review-protocol-alignment`
- **Purpose:** Make every review request shape discoverable and derivable from caller-held facts, eliminating
  hand-authored projections and opaque target identities.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Narrow public review schema discovery to the requested command**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: review-request-contracts`

- _Interim extraction:_ `USER-INBOX § Errand` **Return only the requested review schema closure** narrows output for
  the three already-discoverable commands. This entry retains the generalized command-registration and caller-input
  redesign, including deriving `standardReview` and `targetId` rather than documenting fabricable inputs.

- _Observation:_ `arc review chunking resolve --schema` emitted roughly 2.8 MB containing the entire registered
  schema bundle when the executing session needed only the small root request contract. The volume was too large for
  the harness result boundary and still forced a source-code search for the actual input shape, turning a routine
  typed invocation into both wall-clock and context overhead.

- _Approach:_ make command-level schema discovery return the selected root schema plus only its reachable
  definitions, or provide a concise request-only projection alongside the full registry bundle. Keep the result
  machine-readable and sufficient to compose the command without source inspection.

- _Additional evidence:_ PR #575 re-entry found `arc review chunking resolve --schema` usable, while both
  `arc review resolve --schema` and `arc review hosted request --schema` rejected the flag. Composing those two
  routine requests therefore required source searches during an already overlong correction cycle.

- _Composition gap:_ the policy driver accepted an explicit Owner-forced `codex-pr` source for an Errand, but the
  hosted-request boundary rejected that same invocation field as delivery-member-only. Naming `provider: codex-pr`
  still produced the correct request, but the submit-ready policy action does not round-trip unchanged across the
  next public boundary. Derive or project the hosted input so one command's typed continuation cannot require the
  caller to remove a field the next command declares invalid.

- _Captured during:_ `hosted-review-ci-failure-surfacing` PR #567 review routing, 2026-09-07.

- _Additional evidence captured during:_ `serialize-subprocess-heavy-local-test-tiers` review correction, PR #575,
  2026-09-08.

### `[ ]` **Consolidate public review command registration metadata**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: review-request-contracts`

- _Observation:_ adding one schema-discoverable review command required synchronized edits across the CLI tree,
  discoverable-command list, interaction declarations, shared raw-Git command family, request-schema registration,
  envelope registration, three hard-coded schema inventories, and two command-input matrices. Focused command,
  handler, workflow, and schema tests passed while the broad unit suite alone found one omitted family mapping.
  The scattered authority creates source-navigation overhead and makes a locally complete command easy to leave
  globally incomplete.

- _Approach:_ during request-contract design, evaluate one command registration record that composes the public
  path, input/discovery contract, schema IDs, result mode/envelope, and declared infrastructure capabilities, then
  derives the relevant inventories and test matrices. Retain independent generated/audited checks where they prove
  a distinct boundary; remove only duplicate hand-maintained enumerations, not fail-closed coverage.

- _Boundary:_ this is evidence for the generalized request-contract design, not another interim command Errand.
  Preserve the command-input interaction audit and schema-artifact completeness guarantees while reducing manual
  registration fan-out.

- _Captured during:_ `planning-grooming-review-exemption` implementation, 2026-09-07.

### `[ ]` **Distinguish a wrong review-status entry point from an evidence failure**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-09-16).

- _Observation:_ `arc review status --work-unit <slug>` on a work unit with no self-contained delivery status
  action returns `status-unavailable` carrying the remedy "Review status could not read its repository or host
  evidence. Resolve the operational failure, then re-run ...". No operational failure occurred. `--work-unit`
  resolves the live stacked-delivery review continuation, and the applicable entry point for an Active
  pre-publication work unit is `arc review pre-publication <name>`. The remedy sends the reader to debug evidence
  reading instead of switching commands.

- _Approach:_ separate "this work unit has no delivery status action" from "evidence could not be read", and point
  the first at the applicable entry point rather than at an operational remedy.

- _Note:_ infra smell — this sits on the review-gate status composition surface and may carry a design fork
  between correcting the message and routing a wrong-door invocation to the applicable command. Re-triage at drain.

- _Scope:_ review-status entry-point classification and its remedy text; no change to delivery status authority or
  to the pre-publication procedure.

- _Captured during:_ `candidate-reroot-recovery-frame` planning, 2026-09-11.

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

### `[ ]` **Make review request shapes discoverable and their projections derivable**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: review-request-contracts`

- _Observation:_ the WU's stated purpose — "make every review request shape discoverable and derivable from
  caller-held facts, eliminating hand-authored projections" — has two concrete field instances from the
  `delivery-request-identity` errand:

    - **Discoverability.** Only `review-chunking-resolve`, `review-planning-grooming-resolve`, and
      `review-frontline-run` are registered in `ReviewPublicRequestSchemaId`, so only those three expose
      `--schema`. `review resolve`, `hosted request`, `hosted await`, `respond`, `reduce`, and `errand merge` are
      recoverable only by reading Zod sources or mining validator errors — and error-mining cannot reveal an
      optional field.

    - **Derivation.** `run-errand.md` § Ship instructs the agent to supply "the routed `standardReview`
      projection", but `resolveReviewRouting` and `projectStandardReviewObligation` are library-only; there is no
      CLI. Composing it honestly here meant running both through `tsx` against source. The alternative an agent
      under pressure takes is hand-authoring `{obligation, reasons, rubricVersion, rubricDigest, retrigger}` and
      handing fabricated routing evidence to a verb that treats it as derived. Compounding it, of the nine
      `ReviewRoutingFacts` only five are caller judgments; `changeSetState`, `assurance.*`, and `activity.*` are
      repo and config state the caller must nonetheless supply. `activity` was guessed in this errand and
      happened to match.

- _Approach:_ an `arc review routing resolve -` taking only the five caller-owned judgments and deriving the rest
  from repo and config state would close the derivation hole; registering the remaining request schemas closes the
  discoverability hole. Both are this WU's stated purpose rather than additions to it.

- _Interim:_ an Errand (§ Errand, "Publish the `errandMergeRequest` skeleton agents must hand-compose") documents
  the one envelope still lacking a machine-readable source; it is superseded wholesale by the typed work here. It
  covered three envelopes when written and was reduced on 2026-09-19, once `--schema` reached the other two.

- _Update (2026-09-18):_ the discoverability half above is now discharged for five of its six verbs — `review
  resolve`, `hosted request`, `hosted await`, `respond`, and `reduce` each expose `--schema` against a registered
  strict-current root, per `D4.1`'s identity convention. `errand merge` is untouched: it is an integration-domain
  schema with no counterpart to `handleReviewRequestSchema`, left to its owner. The derivation half is unaffected,
  and a sibling entry records that a registered schema can still be looser than the validator it stands for.

- _Captured during:_ the `delivery-request-identity` errand, 2026-09-18.

### `[ ]` **Let hosted await re-derive its action instead of requiring verbatim round-trip**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: review-request-contracts`

- _Observation:_ `arc review hosted request -` returns an `action` that `arc review hosted await -` requires
  **unchanged**. In a terminal session that means transcribing a deeply nested object — handle, target, artifact
  IDs, full vehicle including the whole `standardReview` projection — out of command output and back into a file,
  once per await, and again on every `pending / await` continuation. This is the WU's "opaque target identities"
  concern in its sharpest form.

- _Severity:_ this is correctness-shaped, not ergonomic. A transcription slip does not fail loudly — it produces a
  well-formed await bound to slightly wrong coordinates. Nothing in the envelope is human-checkable at a glance,
  and the round-trip repeats under exactly the condition that invites haste, a long pending wait.

- _Approach:_ let `hosted await` re-derive the action from `{repository, pullRequest, headSha}` plus the operation
  the request already persists, or accept that operation's ID. The verbatim-action contract can remain the
  fallback rather than the only path.

- _Captured during:_ the `delivery-request-identity` errand, 2026-09-18.

### `[ ]` **Make a hosted review request idempotent for its exact target**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: review-request-contracts`

- _Observation:_ invoking `arc review hosted request` twice for the same provider, repository, pull request, and
  head posted two `@coderabbitai full review` comments six seconds apart on PR #652. The command carries every
  fact needed to recognize the repeat — it already returns a `handle` naming the exact artifact it created — and
  the policy driver still reported `pass: 1` with `consumedPass: false`, so the second provider run was spent
  outside the accounting entirely.

- _Why the accounting gap is the real cost:_ the duplicate produced a **second, distinct review** with its own
  Major finding that the first review did not report. Two reviews existed against one head while the lane
  believed no pass had been spent, and the second was nearly missed because nothing in the typed state named it.
  Unmetered spend is the visible symptom; an un-enumerated review artifact is the one that loses findings.

- _Why it belongs here:_ the cohort's stated purpose is making every review request derivable from caller-held
  facts. Whether a request is the _same_ request is exactly such a fact, and today it is nowhere expressed: the
  verb has no notion of an outstanding request for a target, so an interrupted or retried workflow arm cannot
  tell resume from re-request.

- _Design question this WU owns:_ what identity closes a request. Provider plus target plus head is the obvious
  floor, but it needs a stated answer for a stale outstanding request, for a re-request the Owner genuinely
  intends after a provider failure, and for whether the second call reuses the first handle or refuses.

- _Captured during:_ the `noop-json-flag-retirement` errand, PR #652, 2026-09-18.

### `[ ]` **A registered request schema is looser than the validator it stands for**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: review-request-contracts`

- _Observation:_ `D4.4` records that shape is not obtainability — the schema can demand a field whose value the
  caller cannot produce. The converse is also live and is not yet recorded: the schema can omit a constraint the
  command enforces, so a request that validates against the published shape is still refused at parse time.
  `RespondRequestSchema` is the worked case. It is a `z.union`, so it emits as `anyOf`, and its approved arm
  carries a `superRefine` — a settlement replay cannot also submit a verified fix. JSON Schema cannot express
  that, so `--schema` presents `verifiedFix` and `settledFixTarget` as independently optional, and a caller
  composing from the bundle can produce a request the verb rejects.

- _Observation:_ this is systemic rather than one schema's quirk. Refinements occur in five of the seven modules
  owning the currently registered request roots, including `frontline-run-command-schema.ts`, which was
  discoverable before this errand — so the gap already shipped and is not introduced by widening registration.

- _Approach:_ decide what the published bundle owes a caller, given that `D4.2` is deliberately a
  lookup-and-print over the registry and must not become a second place shapes are described. Options worth
  weighing: emit the expressible part and state the residue in the verb's help rather than dropping it silently;
  move genuinely structural exclusivity into the type so it survives generation (a discriminated union in place
  of a refinement); or accept parse-time-only enforcement and say so, on the ground that the schema is a
  composition aid and the verb remains the authority. Pairs with `D4.4` — same family, opposite direction.

- _Sharpening (2026-09-19), and it splits the approach in two:_ the refinements divide into two classes that want
  different fixes, and conflating them is why the approach above reads as one undifferentiated menu.
    - **Redundancy checks** — the request carries a field fully computable from other fields it also carries, and
      the refinement exists only to verify the caller computed it correctly. `errandMergeRequest` is entirely this
      class: `identity.generation` must equal `errand-v1/<slug>/<claimId>`, and `identity.branch` must equal
      `approvedTarget.headRef`, with both siblings already supplied. The durable fix is **not requiring the
      field** — derive it. The refinement then does not exist, and the emitted schema is faithful because there is
      nothing left to be unfaithful about. This is `D4.4`'s principle one step over: `D4.4` says do not demand a
      field the caller cannot produce; this says do not demand one the request already determines.
    - **Semantic constraints** — a genuine rule over two independently valid shapes, which removing a field cannot
      fix. `RespondRequestSchema`'s "a settlement replay cannot also submit a verified fix" is this class. Only
      here do the original options apply: express it structurally as a discriminated union, or state the residue
      in help and accept parse-time enforcement.
  Classify each refinement before choosing a remedy; the redundancy class closes by simplifying the request, not
  by improving generation.

- _Sequencing consequence:_ do not wire a `--schema` equivalent for `arc errand merge` before this decision. Both
  its refinements are redundancy-class, so the derivability fix changes the envelope's field set — a discovery
  surface built now would be built against a known-provisional shape, in a domain that needs a new handler path
  rather than a replication of the review pattern. The interim `errandMergeRequest` skeleton (§ Errand) is
  deliberately the cheap, supersedable option in the meantime.

- _Observation (`D4.3`'s premise moved):_ the completeness anchor iterates `REVIEW_JSON_COMMAND_PATHS` as "the
  canonical fourteen-verb list". That list is now the residue rather than the census: a path registered for
  `--schema` must leave it, because appearing in both it and `REVIEW_PUBLIC_REQUEST_SCHEMA_PATHS` registers the
  verb twice and fails the projection tests. Three verbs had already moved before this errand and five more moved
  during it, so the anchor has to iterate the union of the two lists to mean what `D4.3` intends.

- _Observation (`D4.1`'s count is stale):_ it reads "of the fourteen verbs, exactly one request shape is
  registered". Eight are now: `chunking resolve`, `planning-grooming resolve`, and `frontline run` predate this
  errand, and `resolve`, `hosted await`, `reduce`, `respond`, and `hosted request` were added by it. The seven
  still unregistered are `readiness`, `frontline resolve`, `hosted settle`, `local prepare`, `local attest`,
  `local resume`, and `terminus accept`; none has a capture of its own, so `D4.1` remains their sole owner. The
  cost is still live — composing this errand's own frontline pass meant hand-reading
  `FrontlineCommandRequestSchema`, exactly the failure `D4.1` exists to end.

- _Captured during:_ the `register-review-request-schemas` errand, 2026-09-18.

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
