# Spec (`detailed` · `RFC`): review-protocol-alignment

- **Origin:** [internal]

- **Purpose:** Reconcile the review protocol's surfaces with the lean hosted-review protocol `review-gate-right-sizing`
  shipped — so provider selection is authoritative in-band, provider capability is declared only where it is proven,
  and the rules that already govern review are reachable from the point where the decision is made.

---

## Introduction / Context

`review-gate-right-sizing` removed the resident controller, the GitHub App path, provider qualification, and the
guidance-evidence admission machinery. It did not reconcile every surface the removed machinery used to own. On PR #354
the residue produced a misdiagnosis that bypassed configured policy, and the diagnosis run surfaced three further gaps.

Four failures from that one integration:

1. **A skip was read as an attempt.** `.coderabbit.yaml` gated automatic review on a label that no longer existed, so
   every PR emitted a successful `review skipped` status. That was misread as a failed CodeRabbit attempt and led to a
   direct `@codex review`, bypassing the configured `coderabbit-pr, codex-pr, delegated-agent` preference. Nothing
   mechanical reads that status as review evidence — `main`'s required checks are `merge-ok` and `arc-cleared`, so a
   green skip cannot satisfy branch protection. The failure was entirely reader-side. The configuration half shipped
   separately as errand `coderabbit-manual-only`.
2. **Capability is advertised without being established.** The policy driver advertises `coderabbit-cli` for `chunked`
   frontline scope, but the frontline run request carries only target, resolution, and timeout, and the execution
   adapter always emits a whole-target `--base-commit` command. No partition, closure chunk, seam scope, or aggregation
   contract ever reaches the provider.
3. **Failure destroys its own evidence.** Two CodeRabbit CLI attempts on a 10,867-line target returned typed
   `execution-timeout` with no findings and no partial result; the saved provider prompts lived only inside the
   ephemeral detached worktree that cleanup removed. _(The fix belongs to `review-checkout-lifecycle`; the failure is
   recorded here as a third of the evidence establishing the root shape.)_
4. **The operator has no typed way to choose.** After the CLI timeouts, hosted Codex was chosen deliberately because it
   handles large diffs better. The driver still selects `coderabbit-pr` first and exposes no one-run source override, so
   a legitimate preference had to be expressed by going around the driver.

Underneath all four is one shape, and it is this work unit's design constraint: **the protocol's authority claims outrun
its evidence.** A configured preference that can be bypassed by going around the driver is not authoritative; a
capability declared in policy but absent from the request contract is not a capability; a typed failure outcome with no
retained diagnostic is not actionable.

### The second pattern — correct rules, unreachable at the decision point

A distinct shape recurs often enough to name separately, because it changes what a fix has to accomplish. In each case
the governing rule is present, correct, and well designed; what fails is that it cannot be reached from where the
decision is made.

| Rule                 | Its state                                   | Why it does not bite                                |
| -------------------- | ------------------------------------------- | --------------------------------------------------- |
| Review pass ceilings | implemented, wired to an approval interlock | the request that reaches them cannot be composed    |
| Triage severity      | contracted to be verified against source    | the verdict lands where the driver cannot read it   |
| Review obligation    | typed and routed                            | no verb exposes the router's output                 |
| Stop discipline      | stated precisely, with worked principles    | stated only in a shipped work unit's archived spec  |

None of these is a missing rule, so none is fixed by writing a better one. Each is fixed by making an existing rule
reachable — a producing verb, a field in the typed record, a statement carried into the workflow the agent loads. That
distinction decides the size of every design unit below: where the rule already exists, the work is plumbing, and
proposals that add governing machinery answer a question that was already answered.

## Goals

- **Selection is authoritative in-band.** A legitimate one-run operator preference is expressible through the driver, so
  leaving the in-band path is never necessary.
- **Provenance separates by construction.** What was observed and what was intended never share a field, so no override
  path can manufacture an attempt outcome nobody observed.
- **Capability is declared only where it is backed.** Every lane / scope pair a source advertises is reachable through
  the request contract that source actually receives.
- **Provider facts live beside the provider.** A fact about a third-party product is declared with the adapter that
  implements it, not in a closed core constant.
- **Request shapes are reachable from the CLI.** A caller composes any review request from facts it legitimately holds,
  without reading schema modules — and never has to fabricate a field it cannot derive.
- **Load-bearing vocabulary is used exactly.** A term doing technical work carries one sense, so a magnitude scale
  reads as magnitudes and no defined term drifts locally.
- **An advisory signal states what it licenses.** A reported absence of findings carries a stated meaning and cannot be
  read as clearance.
- **Convergence is keyed to ARC's own verified severity**, uniformly across every lane.
- **The stop discipline is stated where the decision is made**, and review spend is opt-in per activity.

## Non-Goals

- **Serving a frontline run from the local carrier.** Granting `delegated-agent` the `frontline` lane requires
  authoring a frontline requirement type, or widening a literal that participates in a registered record's canonical
  identity. That is unsettled design and belongs with the work unit that needs the capability — see `D2`.
- **Building chunk partition transport.** Automated construction and transport of chunk scopes, per-chunk scope
  identities, and receipts were explicitly deferred to `chunk-scope-binding` and stay there.
- **Designing how a project supplies a review adapter.** The loading mechanism, its trust boundary, and
  registration-contract versioning are `review-adapter-extensibility`'s.
- **Settling the authority model.** Which rules yield to demonstrated judgment, who may override, and how an override is
  disclosed belong to `judgment-authority-model`. This work unit asks only whether the shipped workflow carries the
  discipline its own spec defined.
- **Bounding spawn context.** Bounding what a spawned worker receives belongs to `execution-delegation-doctrine`.
- **Preserving ephemeral-checkout diagnostics.** `review-checkout-lifecycle` owns that.
- **Rebuilding a review-budget ledger.** Rejected with reasoning under Alternatives.
- **Codifying "hosted providers are selected only by the driver."** Not a code-enforceable property; asserting it would
  create the unbacked authority claim this work unit exists to remove.

## Proposed Design

Eight design units. `D6` sequences first (widest mechanical sweep), `D8` before `D2` (so the capability table is edited
once, in its new home), `D7`'s evaluator domain after `D8` (it queries the relocated declarations), and `D4` last (see
§ Sequencing and rollout). All source paths are under `packages/arc-framework/`.

**Every methodology, workflow, and config edit below is a two-copy edit.** This repository carries ARC content twice —
the package source at `packages/arc-framework/arc/**` and the project instance at `.arc/**` — and a Framework file
changed in one without the other fails the framework-sync integration test and trips a pre-commit warning. Where a
design unit names `adversarial-review.md`, `integrate-work-unit.md`, `session-init.md`, `generate-tasks.md`,
`drain-inbox.md`, or `arc-config.yml`, it means both copies. Stated once here rather than repeated per unit, because a
task list sized against one copy is sized at half its true surface.

### D1 — Operator selection override

Mirror the existing ceiling override rather than inventing a shape. `src/scripts/review-gate/policy/review-policy-driver.ts`
already carries a typed, target-bound, validated override with enumerated rejection reasons and a dedicated
`invalid-override` resolution state.

**D1.1 — The override shape.** Add an optional `selectionOverride` to `ReviewPolicyRequestBaseShape`, alongside
`ceilingOverride`:

- `target` — the exact policy target, matched by `sameTarget`.
- `lane` — `frontline | standard`, matched against `request.lane`.
- `selections` — a non-empty array of `{ sourceId, disposition, basis }`:
    - `disposition` — `prefer | skip`.
    - `basis` — `operator-preference | operator-observed-unavailable`.

`basis` is load-bearing, not descriptive. A **preference** merely reorders, leaving the deselected source eligible on
later passes. An **operator-observed-unavailable** claim is an assertion about the world and is recorded as
operator-attested.

**D1.2 — Provenance separation.** The override never reads or writes `attempts`. `basis` lives on the override record
only and never becomes a `ReviewAttemptOutcome`. The failure mode designed against is not a malformed override but a
**laundered** one — an operator assertion entering the attempt history indistinguishably, after which no audit can
separate "the provider was rate-limited" from "someone asserted it was." Keeping the two structurally disjoint is the
whole mechanism.

**D1.3 — Effective source order.** The override yields the pass's **effective** source order: `request.sources`
filtered of `skip` selections, with `prefer` selections hoisted to the front in the order given, remaining sources
retaining configured order. Three consumers change from the configured order to the effective one — the third is easy
to miss and drops the diagnostic if it is:

- `ReviewPolicyRequestSchema`'s `superRefine` validates the attempt chain as an ordered unique subsequence of the
  **effective** order.
- Source selection (`request.sources.find(...)`, currently line 557) walks the effective order.
- The eligibility block that builds `sourceDiagnostics`, `ineligibleSources`, the all-ineligible test
  (`ineligibleSources.length === request.sources.length`), and `waitingSources` — currently lines 512–524 — reads the
  effective order, so an operator-skipped source is not counted as an ineligible one.

The invariant's meaning survives unchanged — the chain walks the preference order forward with no repeats — and only
the definition of "the preference order" becomes override-aware. It adds no statefulness: the driver is stateless, the
caller re-sends the whole request on every call, and the attempt chain is per-pass, so the override's one-pass lifetime
and the chain's lifetime already coincide.

Two consequences are adopted deliberately:

- A promoted source that falls through is **not** re-eligible later in the same chain. Subsequence semantics admit no
  repeats — the same discipline the configured order already enforces.
- **Skip is unfloored.** An operator may deselect every configured source. An empty effective order is checked
  **before** the eligibility block and returns `unavailable` / `stop` carrying a `selection-override-excluded-all`
  diagnostic and an `exclusion: "operator"` discriminator on the payload. A stop cannot manufacture approval, and
  requiring some provider to run regardless would be ceremony.

  The discriminator is load-bearing rather than cosmetic. Without the dedicated check, an empty effective order falls
  through to the existing arm and reports `safe-fallback-exhausted` — "every eligible review source was safely
  unavailable" — attributing an operator's decision to provider unavailability. That is the provenance conflation
  `D1.2` exists to prevent, arriving through the diagnostic channel instead of the attempt history.

**Partial exclusion carries the same conflation, so the discriminator is not scoped to the empty case.** Configured
`[A, B, C]` with `A` attempted `rate-limited` and the operator skipping `B` and `C` leaves a non-empty effective order
`[A]`; selection finds no candidate and the existing arm again reports `safe-fallback-exhausted`. Any `unavailable`
outcome the override contributed to therefore carries `exclusion: "operator"`, not only the all-excluded one.

**And an applied override is echoed on the success path.** The ceiling override this design mirrors already surfaces
as `ceilingOverrideApplied: z.boolean()` on the `ready` payload; the selection override gets the analogous
`selectionOverrideApplied` plus the effective order it produced. Without it, an operator reordering or partially
deselecting sources is invisible to every downstream reader of the envelope — which fails the same legibility standard
`D1` is chartered to meet, on the path where nothing went wrong.

**D1.4 — Validation and rejection.** `resolveInvalidOverrideReason` gains a selection sibling. The `invalid-override`
payload gains `override: "ceiling" | "selection"` so the diagnostic code composes correctly (the current template is
`ceiling-override-${reason}`), and the reason field becomes a union of the existing `InvalidOverrideReasonSchema` and a
new `InvalidSelectionOverrideReasonSchema`: `target-mismatch`, `lane-mismatch`, `unknown-source`,
`ineligible-source`. No new resolution state is added.

**Ordering against parse.** The selection override is consumed at parse time — `superRefine` runs inside
`ReviewPolicyRequestSchema.parse` — while its validity is decided after parse, where the ceiling override is also
resolved. The ceiling override has no parse-time interaction, so this is the one respect in which the selection
override does not mirror it, and the order must be stated rather than left to the implementation:

**An override that fails validation contributes nothing to the effective order.** At parse, compute the effective
order only from a structurally valid override; otherwise fall back to the configured order for the subsequence check.
Post-parse validation then emits the typed `invalid-override` / `stop` envelope with its exact reason. The alternative —
applying an override the driver is about to reject — would validate the attempt history against an order derived from
rejected input, and a `ZodError` would replace the designed envelope for precisely the case `D1.5` warns about.

**D1.5 — Lifetime.** One pass, bound to exact target and lane, never sticky. Selection does not consume a pass — the
resulting attempt's outcome does — matching every existing selection-time state's `consumedPass: false`. **One pass means
the whole fallback chain, not one call:** the override must ride every call in that pass, since dropping it mid-chain
re-validates an effective-order history against the configured order and turns a legal attempt list into a parse error.
The workflow states this obligation at the callsite.

An already-attempted source remaining in that repeated override is valid: the override declares the pass's stable
effective order, not the next candidate. The ordered-unique attempt-history refinement and the resolver's
already-attempted exclusion still prevent a second execution. Override validation therefore checks membership,
eligibility, target, and lane, while attempt history decides which eligible member may run next.

### D2 — Capability re-cut: remove `chunked` from `coderabbit-cli`

Remove an advertisement nothing backs, and make its absence legible rather than fatal. Two code edits — `D2.1` and
`D2.2` — plus a recorded hand-off; `D2.2` is what lets the removal stand alone.

**D2.1 — The table edit** (in the relocated declarations from `D8`): `coderabbit-cli`'s `scopes` becomes
`["whole-target"]`.

The rationale is not that the carrier failed — `review-chunking` measured three usable carrier shadows that each
completed their exact scope — but that it is the only candidate requiring a purpose-built git projection to be scoped
at all, while being slower per invocation and blind to untracked files. It is the most expensive capability to back
and the least valuable once backed. Whole-target frontline review through `coderabbit-cli` is untouched; only the
chunked variant goes.

**D2.2 — Scope-ineligibility skips on the frontline lane.** This is what makes the removal survivable, so it ships
with `D2.1` rather than independently. A lane whose every configured source is ineligible for the selected **scope**
currently resolves `unavailable` / `stop`, which the integration workflow dispatches as a halt. For the
obligation-bearing standard lane that stays correct. For the advisory frontline lane, `resolveReviewPolicy` routes to
the lane's existing `skipped` arm — its `reason` enum gains `source-scope-ineligible` — carrying the typed diagnostic.
This branch precedes the existing all-ineligible `unavailable` return.

`coderabbit-cli` is the only source declaring the `frontline` lane at all, so after `D2.1` a chunked frontline request
has no eligible source. `D2.2` is what turns that from a halt into a declared decline: chunked frontline review
reports as skipped with a typed scope-ineligibility diagnostic, which is an accurate statement of the configured
reality. The capability was never delivered — that unbacked advertisement is the defect this unit removes — so
nothing real is lost by ceasing to claim it.

**Trigger precision.** The new `skipped` branch requires that every configured source be ineligible, that at least one
diagnostic be `source-scope-ineligible`, **and that none be `unknown-source`**. A frontline lane configured
`[coderabbit-cli, codex-pr]` at chunked scope produces one `source-scope-ineligible` and one
`source-lane-ineligible`; that mix skips. A scope-ineligible source mixed with an unknown source does not skip, nor
does an all-`unknown-source` lane — an unregistered source is a configuration error, not a scope decline, and the
presence of one must never be masked by an otherwise accurate skip.

**D2.3 — Restoration condition.** This is a capability removal, not a judgment that the carrier is unfit.
`chunk-scope-binding` restores it on demonstrating three things: projection construction and transport through the
request contract, chunked latency acceptable across a full partition, and defined handling for untracked files. This
work unit leaves that hand-off recorded, together with the frontline-obligation question below, which restoration
must settle if it routes chunked frontline review through a local carrier.

**Why `delegated-agent` does not receive the `frontline` lane here.** Granting it would give chunked frontline review
a home, and an earlier reading of this unit treated the grant as forced. It is not, and it is not bounded.
`delegated-agent` dispatches to `local-prepare`, which builds a **requirement** record whose `kind` is the literal
`"standard-review"` (`src/scripts/review-gate/core/gate-contract-v2-schema.ts`) — and that literal is inside two
canonical digests, the requirement's own id and the policy version (`policyVersionFor`,
`src/scripts/review-gate/core/gate-contract-v2.ts`). The record also requires an `obligation` of
`recommended | required`, disjoint from the frontline lane's `skip | offer | attempt`, plus a rubric identity, a
`retrigger`, and a `count` that exist only for standard review. Serving a frontline run from the local path therefore
requires authoring a frontline requirement type — or widening a literal that participates in a registered record's
identity — neither of which is settled anywhere. That is a design question, not plumbing, and it belongs with the
work unit that needs the capability.

### D3 — Trim the guidance surface to the contract floor

Established against source: the hosted adapters inject **no** guidance — `CodeRabbitHostedAdapter.request` posts exactly
`@coderabbitai full review` (or `@coderabbitai review`), the Codex adapter posts `@codex review`, and the CodeRabbit CLI
provider injects none. The live typed generator has one consumer, the local carrier's guidance projection. **The two
static `arc:review-guidance` blocks are therefore the sole channel by which any ARC rubric reaches a hosted reviewer**,
which is why they cannot simply be deleted. They are byte-identical (31 lines each, modulo indentation), nothing
validates them, and they have already drifted: both carry **six** rubric dimensions while
`STANDARD_REVIEW_BASELINE_CONTRACT` carries **five** — the sixth, "Repository contract coherence", exists in no typed
source. The published `sha256:cea850…` digest recomputes correctly from the typed contract and proves nothing: it does
not cover the rendered dimension prose, so it is structurally incapable of detecting that drift and did not.

**D3.1 — The trim.** Criterion: _keep only what a provider cannot know_. Cut the finding requirements and five of the
six rubric dimensions — instructing a specialized code reviewer to check correctness, boundary cases, or to cite a
stable locus is its product, not information, and at `path: "**/*"` that cost is paid on every file. Cut the
`Rubric:` / `sha256:` line, which has no live consumer and is demonstrably not a drift check. Four items survive in both
`.coderabbit.yaml` and `AGENTS.md`:

1. **Exact-scope binding** — the complete requested change set, not a sample or only the latest fix; bind to the exact
   requested target.
2. **The clean-result floor** — unavailable, partial, ambiguous, or failed review is never clean.
3. **The evaluator boundary** — the review is not given author conclusions, preferred fixes, self-verification
   claims, or suspected weak spots. Stated as the exclusion it is, matching the typed `excludedContext`; an earlier
   phrasing ("do not accept author conclusions") named a different actor and a different obligation, and would not
   have been derivable from the field it is checked against.
4. **Repository contract coherence** — rewritten out of dimension register into the same register as the other three,
   naming the actual contracts: the two-copy package-source / project-instance sync discipline, the self-hosting
   `npx arc` invocation rule, and the adopter-facing versus internal-dev audience boundary.

Item 4 survives **by** the criterion rather than as an exception to it: a generic reviewer cannot know these. It stays
untyped, deliberately — no method declares the `review-augmentation` frontmatter that would route a project dimension
into the projection, and minting one to maintain a single line would re-instate the generator this trim deletes. Both
files are this repository's own configuration rather than shipped artifacts, so repository-specific content is exactly
what belongs in a repo-local static block.

**D3.2 — The parity check.** At four items, parity resolves without restoring a generator. A new
`lint:arc:review-guidance` root script backed by `src/scripts/audit-review-guidance.ts` — the dev-only home the existing
`lint:arc:*` family already uses, since `src/` is excluded from the package's published `files` — asserts:

- string equality (modulo indentation) between the two carriers' block bodies;
- items 1, 2, and 3 against `STANDARD_REVIEW_BASELINE_CONTRACT.coverage`, `.cleanRule.nonCleanResults`, and
  `.evaluatorBoundary.excludedContext` respectively. Item 2's backing is `nonCleanResults` alone, not the whole
  `cleanRule` object: `requiredDimensionTreatment` ("all rubric dimensions considered") refers to the five dimensions
  `D3.1` cuts, so it is deliberately no longer carried to hosted reviewers and there is nothing left to check it
  against.

`evaluatorBoundary` is typed and is checkable exactly as `coverage` and `cleanRule` are; leaving it unchecked would
reopen the untyped drift channel this unit exists to close. Only item 4 has no typed source — deliberately, per the
paragraph below.

**Its coverage is partial by construction and the check states so in its own output:** string equality covers all four
items across the two copies, the typed fields back items 1 through 3, and item 4 is unbacked. A check that reads as
total when it is not is the defect this design unit exists to remove, so the check reporting its own reach is part of
the deliverable rather than a nicety.

### D4 — Request-body legibility

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

### D5 — `adversarial-review`'s `withstood` field

The defect is in consumption, not production. Demonstrated 2026-07-24: three false claims rode through two independent
fresh-context passes under `withstood` and were relayed on the strength of that label, then refuted in full against
source. The reviewer reported honestly — each cited fact was true while each inference drawn from it was false. What
went wrong is that the primary read _"no findings here"_ as _"this is cleared."_ Nothing licensed that reading, and
nothing forbade it, because **the field's meaning is stated nowhere**: the schema gives it one freeform line while
`findings` carries five structured sub-fields, the prompt template never mentions it, and it participates in no
severity, disposition, or convergence machinery.

The field is kept. Absence of findings is ambiguous three ways — examined and held up, not examined, or examined the
wrong thing — and only the reviewer can collapse that ambiguity. It is also structurally un-fakeable in the way that
matters: over-claiming coverage buys the reviewer nothing, unlike findings. And adversarial review deliberately leaves
the reviewer's attention unconstrained so it finds what the primary did not think to ask about, so coverage cannot be
specified up front and must be reported back. `withstood` is the return channel for the unwritten part of the
assignment.

Three edits to `adversarial-review.md` and its prompt template — no new mechanism:

1. **State the semantic.** Attention reported, not correctness asserted — "I examined this and have nothing to report,"
   never "there is nothing wrong here." Advisory signal, never authority.
2. **Bound it to decision-relevant coverage.** Report where absence-of-finding is itself informative; exhaustive
   enumeration of every region touched reads as diligence while conveying nothing.
3. **One primary-side line on the risk gradient.** Entries asserting **externally verifiable** facts (a claim about
   code, behavior, or a diff) are worth spot-checking before relaying; entries of internal judgment about the artifact
   are unverifiable in principle and need no check. The gradient runs by claim type, not by fire-point — which means
   `verify-work-unit` carries more risk than the planning stages, since its passes re-validate success criteria against
   a diff.

### D6 — Convergence semantics and severity provenance

**D6.1 — Rename `blocker` → `critical`.** `ReviewSeveritySchema` (`src/scripts/review-gate/core/review-primitives.ts`)
becomes `["critical", "major", "minor"]`.

**The justification is vocabulary correctness, and that is sufficient on its own.** The enum is a magnitude scale —
`critical > major > minor` orders by how material a finding is. `blocker` names an _outcome_ instead, so it is the
wrong kind of word for the slot, and the scale reads in two registers at once. Compounding it, `blocker` carries four
distinct senses across this corpus: this severity, the work-unit impediment field, the gate's merge-readiness
impediments, and a spec-template "settle-before-starting" sense.

That is a direct violation of `strategy-procedure-evolution.md` Principle 7 — a term doing technical work is defined
once and used exactly, and never locally drifted. Correcting a controlled vocabulary is its own warrant; it does not
need an efficacy trace to a separate goal, which is why § Goals now names it. The rename belongs to this work unit
because `D6.3` edits the same schema and `D6` owns the severity model — splitting it would mean two passes over
`review-primitives.ts` and a rename coordinated across a live branch.

**The sweep is sense-discriminating, not a replace.** The code half is bounded by the type checker: the work-unit
impediment field (`src/lib/active/meta-schema.ts`, `meta-reader.ts`, `src/lib/work-unit/lifecycle-transitions.ts`,
`lifecycle-executor.ts`) and the gate's merge-readiness impediments (`GateBlocker`, `GateVerdict.blockers`) are
separate types, so a rename of `ReviewSeveritySchema` cannot silently reach them.

The prose half has no type checker and is where the real risk sits, so the non-severity occurrences are enumerated
rather than characterized. **Every one of these means something other than review severity and must survive
untouched:**

- **Workflows** — `session-init.md`, `session-init.contributor.md`, `session-handoff.md`, `generate-tasks.md`,
  `drain-inbox.md` (the work-unit impediment sense).
- **Reference** — `AGENT-BRIEF.ARC.md`, `strategy-session-operations.md`.
- **Templates** — `template-spec-detailed-rfc.md`, `template-spec-outline.md` (a fourth sense: a
  "settle-before-starting" blocker).
- **Adopter-facing `docs/`** — `getting-started.md`, `the-framework.md`, `work-planning.md`,
  `reference/work-organization.md`. This surface is outside the two-copy preamble's reach and outside anything the
  package-sync test sees, so it is the likeliest omission.

**Two files carry both senses and cannot be swept per-file** — `task-audit.md` (generic at one locus, the severity
enum at three) and `review-response.md` (generic at one, severity at another). These require per-occurrence
discrimination, and the verification method is a post-sweep grep asserting the enumerated loci above are unchanged.

The review resolution state spelled `blocked` is a distinct token and is untouched. **Sequence this first**, because
`D6.3` edits the same schema.

**Version treatment is a pre-public-release baseline rewrite.** This project has no public release, external users, or
retained production records to migrate. The rename therefore changes the active strict-current contract in place:
registered versions, wire `schemaVersion` fields, semantics versions, and canonical-digest domains do not advance; no
`blocker` compatibility alias or migration reader is added. Existing development-only review records containing the
old token are disposable and are cleared or regenerated.

The sweep still follows the complete acceptance graph rather than the four most obvious durable records. It covers
every registered root that reaches `ReviewSeveritySchema`, the hosted-await finding schema's independent severity
enum, fixtures, generated schema artifacts, adapters, and methodology prose. Tests prove `critical` is accepted,
severity-position `blocker` is rejected, and the non-severity senses enumerated above remain unchanged.

**D6.2 — Separate the exit gate from convergence.** `adversarial-review.md` § Exit gate currently collapses two rules
into one sentence, and because disposition empties the backlog, fixing everything converges immediately — so the change
most likely to introduce a defect, a fix to a material finding, is the one a fresh pass never examines. State them
separately; both must hold:

- **Exit gate — completeness.** No confirmed finding above `minor` may remain undisposed when the loop closes. A
  property of the disposition backlog.
- **Convergence — signal.** A pass converges when it surfaced no triage-confirmed finding above `minor`. A property of
  what the pass _produced_, independent of what was then done about it.

They disagree productively: a fixed material finding satisfies the gate while withholding convergence, and an undisposed
minor converges while holding the gate open.

**The cap-exit path is not a third rule.** Reaching the pass cap with live material findings stops the loop and surfaces
them at the stage interlock. That is an **exit the gate admits**, not a disposition — `disposition` is a closed
three-value vocabulary (fix, carry forward, drop) that the method holds orthogonal to severity, and surfacing is none of
the three. The method is explicit that capped findings remain unresolved; the gate governs loop closure, and a capped
exit closes the loop with the findings live and handed to the user. Stating this matters because the two rules are now
written separately, and a reader applying both to a capped exit would otherwise find them in conflict. Cost tracks
risk — a clean artifact still converges in one pass, while a material finding buys exactly one verification pass,
bounded by the same cap. **The cap bounds the effect and at `Light`
erases it** (a cap of 1 exits after pass one whatever convergence says); at every `Class` the last fix inside the cap
also stays unexamined, which is the final-fold residual the method already names and the post-settle coherence re-read
already answers. One definition governs both the adversarial-review loop and the review gate's lanes.

**Judgment admitted at exactly one point.** The default is deterministic — did the last pass surface a triage-confirmed
finding above `minor`? Layered on top, the agent may judge that a `minor` carries strong enough signal to warrant
another look and **recommends** it, citing the signal. At the cap with live material findings, the agent states whether
the evidence warrants continuing rather than stopping silently. **The agent may recommend past the cap; it may never
proceed past it.**

**D6.3 — Route verified severity to the driver.** Every hosted finding already carries two severities: the adapter
normalizes the provider's label into `NormalizedReviewFindingSchema`, and the primary's verified severity is recorded
separately on `DispositionReportItemSchema` alongside `sourceVerification` and mandatory `verificationRefs`, with a
refinement forcing rejection of anything source does not support. Both are already typed. What is missing is that **the
driver cannot see it**: `ReviewAttemptSchema` records a source and an outcome with no severity, so continue-or-stop is
decided against "findings happened."

The external command does **not** accept a caller-computed severity scalar. That value is duplicated,
control-bearing derived state: a stale, mistyped, or provider-sourced value is schema-valid but can falsely converge
after a material finding or buy an unnecessary pass after a minor one. The caller is not treated as hostile; the
boundary simply refuses to make it restate a fact already present in a stronger typed record.

`ReviewAttemptSchema` instead gains conditionally required, ordered-unique `reviewOperationIds`. A findings-bearing
attempt echoes a non-empty list of the exact operation ids returned by the producing review verbs; other outcomes omit
the field. The command boundary loads those operations' durable `ApprovedDispositionRecordSchema` records through
`ApprovedDispositionRecordStore`. The caller names observed operations but neither supplies their approved records nor
restates any derived severity.

The approved set inside that record is necessary but not sufficient on its own. It binds target, policy, rubric, and
approval, but not the review result it dispositions; a same-target set from another pass or an incomplete subset could
otherwise drive false convergence. Reuse the existing record layer rather than minting a parallel proof:

- Local and frontline records retain `respond-command.ts`'s exact comparison against their durable receipt or outcome
  before append.
- `ApprovedDispositionSourceSchema` gains a hosted variant. The hosted await path derives a canonical
  `hostedResultId` over the exact request handle and complete normalized finding result; hosted triage compares the
  approved set one-for-one with that result before appending an approved disposition record whose `operationId` is the
  result id and whose source carries the hosted result binding.
- Every lane therefore hands the driver the same source-bound record type. No new approval vocabulary or detached
  finding-summary record is introduced.

When present, the command boundary derives the current v2 target id from repository state rather than asking the caller
for a digest, loads every named disposition record plus its producing durable receipt, outcome, or hosted-result
binding, and requires:

- every operation id to resolve to exactly one durable approved disposition record;
- every record's `operationId` and source reference to resolve back to that same producing result;
- every producing result to be a findings result for the attempt's source and current exact target;
- the producing boundary's exact-source comparison to cover every finding in that result; and
- the records combined for one logical pass to agree on policy and rubric identity.

For a referenced attempt, `outcome: "findings"` is therefore checked against durable result state rather than trusted
as an independent caller assertion. A disposition record cannot be detached from its own producing result or attached
to an attempt whose declared source, target, or outcome disagrees with that result.

It then derives:

```text
confirmedFindingCount
maxConfirmedSeverity: ReviewSeverity | null
```

The policy reducer receives that normalized summary internally; neither field is accepted from external JSON. The
confirmed subset is the items with `sourceVerification: "verified"` whose disposition is not `reject`, and the maximum
is computed only across that subset.

The qualifier is not pedantry. `DispositionReportItemSchema` carries a mandatory `severity` on **every** item
regardless of verification outcome, and its refinement forces `disposition: "reject"` when source does not support a
finding without zeroing that severity. A maximum over the whole set would therefore report `major` for a pass whose
findings were all refuted at triage, forcing another pass for a pass that confirmed nothing — the exact inversion of
`D6.2`'s rule and of this unit's stated saving.

**All-refuted is an explicit case, not a default.** Referencing a source-bound record whose non-empty approved set has
an empty confirmed subset derives `confirmedFindingCount: 0` and `maxConfirmedSeverity: null`, which resolves
`pass-complete`. The non-empty operation binding distinguishes a pass where triage positively established that nothing
survived from an invalid unbound findings assertion, without overloading `minor` to mean "none."

For a chunked scope the summary spans the whole series, since the series is one logical pass. The terminal resolve call
— the one whose last attempt has `chunkSeriesComplete: true` — carries the review operation ids for every chunk in the
series. **Intermediate chunk calls carry the current chunk's operation id, not the accumulated series**, because they
resolve `chunk-pending` and never make a convergence decision; the current binding still proves the findings assertion
and feeds the response rule in `D6.4`. The distinction is mechanical from the attempt's series flag rather than caller
intent. The derived summary is lane-agnostic — under `D6.4` every lane references its durable approved records when a
findings-bearing pass closes.

`resolveReviewPolicy`'s findings arm consults the derived summary: when `lastAttempt.outcome === "findings"` and
`maxConfirmedSeverity` is `null` or `minor`, resolve `pass-complete` / `none` instead of `findings` / `respond`. Today
any finding forces another pass; afterwards an all-refuted or minors-only pass converges. A confirmed `major` or
`critical` finding withholds convergence and buys the bounded verification pass.

Keying convergence off the provider's label would put control flow under an unaudited external opinion; accepting a
detached caller scalar would discard the exact-target and approval bindings the disposition records already provide;
keying it off nothing at all is what happens today.

**D6.4 — Uniform lane order: triage and source-bind, then the driver call, then response.** The lanes currently order
triage and the driver call oppositely. In `integrate-work-unit.md`, the hosted findings arm settles _before_ feeding a
`findings` attempt to the driver, while the Step 3 lane dispatch (`findings / respond`) feeds the attempt first and is
dispatched into triage by the driver's own state. As currently ordered the new disposition input delivers nothing on
either lane: where approved dispositions exist (hosted), the response cycle has already run by the time the driver sees
the attempt; where the saving would land (frontline and local), triage has not yet produced the source-bound record.
The behavior and the data sit on opposite lanes.

The seam that fixes it already exists: `review-triage` and `review-response` are separate methods with a stated
handoff. Triage verifies each finding against source, classifies severity, and obtains approval _before any
finding-driven mutation_. Its terminal binding step validates the complete approved set against the durable or hosted
result and appends the approved disposition record from `D6.3`; this is evidence persistence, not performance of the
disposition. The driver consumes that record, then response performs the approved set.

For local and frontline lanes, refactor the exact-source validation and record append currently nested in
`respond-command.ts` into that pre-driver binding step while retaining its existing schemas and store. Record
preparation may project the response far enough to derive any `fixAuthorization`; the authorization is stored on the
prepared record, while the workflow holds the projected next action and performs it only after the driver result. The
hosted lane adds the equivalent record preparation between triage and thread settlement. No lane fabricates a record
from the approved set alone.

The reorder edits `integrate-work-unit.md`'s Step 3 lane dispatch and its Step 4 hosted findings arm, and settles two
things the reorder itself creates. The hosted lane moves too: settlement is response, so it follows the driver call
rather than preceding it.

**What triggers triage, once the driver no longer does.** Today the driver's `findings` / `respond` state is the only
signal that findings exist on the frontline and local lanes — moving triage ahead of the driver call removes that
trigger. The producing verb becomes the trigger instead: a non-empty finding set returned by `arc review frontline
run -`, `arc review local attest -`, or `arc review reduce -` enters triage directly. The workflow dispatch states
this, because nothing else would.

**What `respond` means afterwards.** `nextAction: "respond"` currently means "triage then respond." After the reorder,
triage and source binding have already run, so it means response-only. That is a semantic narrowing of a typed envelope
state rather than a prose change, and the dispatch line says so explicitly.

**What happens to approved dispositions on every arm reachable after triage.** Moving triage ahead of the driver means
an approved disposition set can be outstanding when _any_ driver state returns, so the rule is stated over the arms
rather than for the one that motivated it: **no arm completes or suspends a lane while an approved disposition set is
unperformed.** The four reachable arms, each enumerated because asserting "the rest are fine" is the failure this spec
has already made:

- `findings / respond` — response runs, as before; `respond` now means response-only per above.
- `pass-complete / none` — the case `D6.3` creates. The Step 3 dispatch currently maps it to "the lane is complete at
  this boundary," which would discard the approved set, including `fix` dispositions on minor findings. The dispatch
  distinguishes `pass-complete` with an outstanding set (run response, then complete) from `pass-complete` with none
  (complete directly).
- `chunk-pending / continue-chunks` — **live for the standard lane's chunked scope**, which survives `D2.1` because
  `delegated-agent` carries both scopes and this repository configures it. The dispatch currently continues the series
  with no response step, so each chunk's approved dispositions would accumulate unperformed. Response runs per chunk
  before the series continues.
- `approval-required / obtain-ceiling-override` — rarer, and it suspends rather than completes; the outstanding set is
  performed before the ceiling question is put to the user, so approval is never sought over unapplied work.

Convergence, suspension, and ceiling exhaustion all end the _review_ loop; none of them discards approved work.

Every findings-bearing pass-closing driver call then derives its confirmed-finding summary from the approved records,
one convergence semantic is mechanically enforced rather than agentically honored on two lanes out of three, and the
all-refuted and minors-only arms deliver their saving everywhere instead of nowhere.

### D7 — Stop discipline and spend opt-in

**D7.1 — Carry the stop discipline into the workflow.** The choreography already matches its design intent: human stops
track authority rather than every judgment, final dispositions and release coincide in one structured gate when nothing
earlier needs approval, exceeding a pass ceiling is a third stop by exception, and ordinary agent judgments do not
create permission turns. Counting `integrate-work-unit.md`'s own stop-class callouts confirms the shape. But that
statement lives only in a completed work unit's archived spec, which the agent running integration never loads. State it
in `integrate-work-unit.md`, where the decision is made.

**D7.2 — Gate the activity, not the mechanism.** Both review lanes ship with empty source lists, so no automatic review
spend is incurred until a source is named. The adversarial method has **no configuration surface at all**, across four
standalone offer fire-points — the three planning stages and verification. An adopter who does not want subagent spend
can only decline, at every fire point, indefinitely: four permission turns that return nothing.

A key gating `adversarial-review` itself is rejected — it contradicts the method's own identity contract, which states
that the caller owns launch policy and that the mechanism never weakens the caller's obligation. The method is a
carrier, not an activity, and its context-provisioning table already lists frontline and standard review as fire-points,
so the lanes are among its callers. Instead, each review **activity** carries its own evaluator key, the way the lanes
already carry source lists. Two new keys in `arc-config.yml`, beside `review.frontline_sources` and
`review.standard_sources`:

```yaml
# Evaluator for planning-stage design audits (draft-design, create-spec, generate-tasks).
# Subagent carriers only: hosted and CLI providers review diffs and cannot audit a design
# document. `none` disables the audit; the stage-completion check is unaffected.
review.planning_audit: none        # none (default) | delegated-agent
review.verification_audit: none    # same domain
```

Four review activities, one uniform place to look. The value is singular where the lane keys are plural, so "one
evaluator, no fallback" reads off the shape rather than a comment. `adversarial-review` gets no configuration surface.

**A config key is not a YAML line.** `review.frontline_sources` and `review.standard_sources` are each declared in
`src/lib/config/schema.ts`, validated in `src/commands/config/validate.ts`, and one is referenced in
`src/commands/update.ts`. The two new keys follow the same path — schema declaration, validation with a typed
diagnostic for an out-of-domain value, and both copies of `arc-config.yml`. The package-source copy ships the `none`
default; whether this repository's own instance overrides it is a project decision recorded against the sanctioned
divergences the framework-sync test already admits.

**One key per activity family, not per stage.** The adopter decision is a single posture question. If granularity is
ever wanted, the natural cut is _early versus finalization_, not per-stage, and it arrives additively as a scope
qualifier beside the evaluator key — evaluator and scope are orthogonal, so splitting later is cheaper than
un-splitting.

**Disabled by default for consent, not because the practice is marginal.** It matches the empty source lists. Recorded
explicitly because a reader meeting a disabled default could otherwise infer the practice earns little: adopting these
passes moved issue-catching from _during or after code review_ to _before implementation_.

**Configuration is inert until a declared fire-point.** A non-`none` evaluator key is not ambient permission to spawn
and does not authorize the evaluator outside its activity. Each invocation is explicit through the conjunction of:

1. the executing workflow reaching its declared adversarial-review fire-point;
2. that activity's config key naming a registered evaluator; and
3. the dispatch binding the exact artifacts, rubric, orientation, pass cap, and prior findings, with a read-only
   no-edit contract.

That conjunction is the per-invocation activation carrier: the config selects the activity posture, while the current
workflow fire-point authorizes this run now. It needs no second conversational permission turn, and it creates no
standing "subagents allowed" state. The invocation and evaluator are surfaced with the resulting pass so an automatic
launch remains legible. This is a read-only derivation activity under DEV-RULES.ARC § Sub-agent scope; it does not
relax execution delegation.

**D7.3 — The evaluator domain is derived from an explicit audit capability.** `nextAction: "local-prepare"` proves
only that a source implements the local code-review operation; that operation derives a Git target and standard-review
requirement and does not establish arbitrary document-and-rubric audit support. The registration capability therefore
gains `auditActivities: ("planning" | "verification")[]`. `delegated-agent` declares both activities; providers that
only review diffs declare neither.

Each audit config key derives its valid evaluator domain by selecting registrations that name its activity. Naming a
hosted provider is then a validation error with a typed diagnostic rather than a runtime surprise, and the domain stays
correct as adapters change without treating an unrelated dispatch tag as proof. The constraint remains structural: at
draft-design time there is no diff and no pull request, only a document, so only a carrier explicitly declaring that
audit contract can serve. `delegated-agent` names the **carrier**, not the gate lane.

**D7.4 — Which stops survive streamlining.** The verification fire-point stops at every `Class` — the adversarial
fire-point scales its _posture_ by `Class` but the offer awaits a call regardless, so at `Light` it is a permission turn
about a pass the posture already declines to recommend. Removing it uniformly would reach every fire-point including the
three planning stages, which is wrong. The rule that decides:

> **A stop is required wherever the completion signal is not fully observable in the artifact.**

- **The verification trigger is artifact-observable.** The task list's phases are complete and the verification phase is
  the literal next item. An agent reading the artifact holds exactly what the developer holds, so the stop adds no
  information. Reaching this declared fire-point with a configured evaluator is therefore the explicit invocation;
  no additional authorization turn is required. Declining costs little either way: the adversarial pass **augments**
  the self-verify and never replaces it, so the floor beneath an automatically fired pass is the full criteria
  validation that runs regardless.
- **Planning-stage boundaries are not.** Whether a draft is done depends on intent the developer has not yet uttered,
  which no artifact carries and no readiness read can reach. Here the stop **is** the input channel, so it holds even
  when a project has opted in. Live evidence from this work unit's own grooming: the concern that became
  `integration-boundary-accuracy` existed only in the developer's head at the moment the draft otherwise read as
  complete; an autofired pass would have attacked a draft about to grow by roughly a third.
- **Integration is out of scope** for the rule, now that the spend gate sits on the activity: it has no standalone offer
  fire-point, reaching the mechanism only as the carrier behind the lanes, whose spend the source lists already gate.

**D7.5 — The planning-stage surface is a convergence check, not a spawn authorization form.** What is approved is that
_the stage is complete_; that agreement supplies the intent the artifact cannot show. Once supplied, the now-current
fire-point plus the configured evaluator explicitly activates the individual pass — not as standing consent and not as
a second decision. So the surface is one conversational question — this stage looks done, is there anything to raise
before it is attacked — never an enumeration of pass counts, rubrics, and evaluator conditions.

**What each surface owns after the change:** the `*_sources` and `*_audit` keys select whether an activity is enabled
and which evaluator serves it; the current declared workflow fire-point activates each individual invocation; `Class`
keeps only recommendation posture and pass cap, no longer doubling as an on/off switch; and the stage-completion stop
is untouched, being an input channel rather than a spend decision.

### D8 — Relocate provider capabilities onto their adapters

The source id schema is an open slug pattern, and the policy machinery is genuinely provider-neutral: lanes, scopes,
pull-request dependence, and dispatch action are abstract axes, the source lists are ordered configuration, and the
diagnostics name no provider. The hosted execution layer is already adapter-array-driven, and each adapter already
carries a self-description constant beside its implementation (`CODERABBIT_HOSTED_REGISTRATION`,
`CODEX_HOSTED_REGISTRATION`). **What is closed is the wrong thing, and it is closed by four independent
authorities:**
`REVIEW_SOURCE_CAPABILITIES` is a module-private constant in `review-policy-driver.ts` carrying four hardcoded entries,
unexported, with no registration surface; the config schema and compatibility validator each restate provider domains;
and `hosted/request.ts` closes `HostedProviderIdSchema` over `coderabbit-pr | codex-pr`. Those are the places where a
fact about someone else's product becomes a second authority rather than a reference to the adapter that implements
it.

**The boundary that decides what is a leak.** `delegated-agent` is ARC's own subagent carrier, so its lanes and scopes
are ARC's business and belong in core. `coderabbit-cli`, `coderabbit-pr`, and `codex-pr` are third-party providers;
their capabilities are observations about external products and belong with their adapters. Both kinds currently sit in
the same closed constant.

**D8.1 — Relocate and declare once.** Each source's canonical id plus `lanes`, `scopes`, `requiresPullRequest`,
`nextAction`, and `auditActivities` live in exactly one owning registration: the third-party sources on their existing
adapter registrations, and `delegated-agent` in one core registration beside the local carrier. Other code may carry
an id as a configuration value, lookup key, diagnostic, or test fixture; none may independently declare the provider
domain or assign capabilities to it.

**Three shapes, not one.** The two hosted registrations (`CODERABBIT_HOSTED_REGISTRATION`,
`CODEX_HOSTED_REGISTRATION`) share `{ id, commands, identities }`. The third — `coderabbit-cli`, the one source `D2.1`
actually edits — is `CODERABBIT_FRONTLINE_REGISTRATION` in
`src/scripts/review-gate/providers/coderabbit/frontline-execution.ts`, typed `FrontlineSourceRegistration` as
`{ sourceId, descriptor }`, living under `providers/` rather than `hosted/`. Capability declaration attaches to it as a
sibling field rather than by conforming it to the hosted shape: the two registration types describe different execution
contracts and merging them would be a refactor this unit has no reason to run. So the composition seam in `D8.2`
composes over three declaration shapes plus `delegated-agent`'s core declaration, and `D8.3`'s registration contract
validates the capability fields alone — the part all four share — rather than a whole-registration schema.

**D8.2 — Compose and inject.** A named composition seam assembles the run's capability set from the registered
adapters, and `resolveReviewPolicy` consumes an injected set rather than importing a constant.

**Injection must reach the request schema, not only the resolver.** `ReviewPolicyRequestSchema`'s `superRefine` calls
`sourceDiagnostic` on every attempt, and that runs inside `.parse()` before any injected value could be consulted —
so injecting into `resolveReviewPolicy` alone leaves the module importing the closed constant and creates a divergence
hazard: an injected set disagreeing with the compiled-in one fails as a `ZodError` before the injected set is read.
The request schema therefore becomes a factory over the capability set. This is the same seam `D1.4` reasons about for
override ordering; the factory takes the capability set, and the parse-time fallback `D1.4` specifies is unaffected by
it.

**D8.3 — Derive every consumer domain too.** `REVIEW_SOURCE_CAPABILITIES` is not the single place a third-party fact
lives in core. `src/lib/config/schema.ts` hardcodes the standard source ids as a literal alternation and derives the
frontline domain as its _negation_; `src/commands/config/validate.ts` hardcodes the same list twice more for its
compatibility diagnostics; and `src/scripts/review-gate/hosted/request.ts` declares
`HostedProviderIdSchema = z.enum(["coderabbit-pr", "codex-pr"])`, which closes every hosted request and result shape
over a second provider list. `src/scripts/review-gate/hosted/fallback.ts` then uses that schema as its provider-membership
test, so making the schema lexical without replacing the check would dispatch a well-formed but unregistered id instead
of returning `invalid-source-list`. Relocating only the driver's copy would leave config or hosted validation reading
an old literal after the owning registration changed — and would land `D7.3`'s derived evaluator domains beside
hardcoded siblings.

The layers split the fix, because `src/lib/` never imports from `src/scripts/review-gate/` and cannot without
inverting the dependency direction:

- **`lib/config/schema.ts` accepts any well-formed registry id.** The provider alternation and the negation trick go.
  Pure subtraction, and no provider name remains in `lib`.
- **`hosted/request.ts` validates identifier shape, not provider membership.** Replace the static enum with the same
  lexical source-id contract used by the registry. The hosted command boundary validates caller-supplied providers
  against the injected hosted-adapter registrations before dispatch; emitted handles and attempted-provider lists
  originate from those registrations. A static JSON Schema can therefore describe the wire shape without becoming a
  second provider registry.
- **`hosted/fallback.ts` receives the same injected hosted-registration set.** Its resolver validates configured
  provider membership before calling `attempt`, preserves duplicate detection, and continues to return
  `invalid-source-list` with the exact unknown ids. Lexical validity alone never authorizes dispatch.
- **`commands/config/validate.ts` derives lane compatibility from the composed capability set.** Commands may depend on
  the review domain — `src/handlers/review.ts` already does — so the compatibility diagnostics are computed rather than
  restated, and config-time typo-catching is preserved.

After this, each provider id has one production declaration and every finite domain or capability decision derives
from the composed registrations. Literal references remain legal where they are values rather than authorities.

**D8.4 — Five forward-compatibility measures**, each of which must pass one test:

> **It would be right even if `review-adapter-extensibility` never ships.**

1. A validated registration contract published through the shipped schema bundle — schema validation is hygiene.
2. The driver consuming an injected capability set — improves testability.
3. One named composition seam that assembles the run's set — clarity.
4. The dispatch action's runtime enum exposed alongside its derived type — a missing validator for a contract that is
   currently only compile-time.
5. `unknown-source` retained as the fail-safe for an unregistered source — already exists.

Anything that only makes sense _because_ a loader might arrive belongs to the loader. The test is recorded because
"forward compatible with a design that does not exist yet" is otherwise an invitation to speculative scaffolding.

**D8.5 — The dispatch action stays closed.** It is not a free-form verb but the tag for which execution contract an
adapter satisfies — pull-request-comment provider, local CLI carrier, or ARC's own subagent carrier — and it is already
derived from the resolve envelope's own type rather than duplicated, so core cannot drift a fourth without changing the
envelope contract. A supplied adapter implements one of the three interfaces and inherits its action.

**A second consumer.** `D7.3`'s evaluator domains draw from the registrations' explicit `auditActivities`, which makes
"a hosted provider cannot audit a design document" a validation result rather than an inference from dispatch.
Neither design unit needs machinery the other does not already land.

## Alternatives & Rationale

- **Codify "hosted providers are selected only by the driver" as a requirement** (`D1`). Rejected — the provider
  interface is a pull-request comment anyone can write, so no schema or check can enforce it. Asserting it would create
  exactly the unbacked authority claim this work unit exists to remove. The achievable form is completeness of the
  in-band path, which is why the missing override _is_ the cause of the PR #354 bypass rather than a separate concern.
- **Express an operator preference by recording a safe-unavailable attempt** (`D1`). Rejected — this is the laundering
  failure the design exists to prevent: an operator assertion entering the observed-attempt history destroys the
  provenance distinction permanently.
- **Express promotion as a skip** (`D1`). Rejected — skipping `coderabbit-pr` to reach `codex-pr` leaves a rate-limited
  `codex-pr` with nothing to fall back to within the pass, strictly less capable than the status quo the override exists
  to improve on.
- **Infer the chunking answer from the PR #354 timeouts** (`D2`). Rejected by the originating capture and still correct:
  two timeouts on one oversized target with confounded guidance cost establish nothing about capability.
- **Run a fresh three-arm A/B to settle the chunk carrier contract** (`D2`). Rejected as redundant — `review-chunking`
  already measured it under controlled conditions; re-running would spend costly reviews to reproduce a recorded result.
- **Keep `chunked` advertised for `coderabbit-cli` and build its projection transport here** (`D2`). Rejected — the
  transport is `chunk-scope-binding`'s by explicit prior deferral, and absorbing it would widen a work unit already
  flagged for sizing risk.
- **Pair the removal with a `frontline` grant to `delegated-agent`** (`D2`). An earlier reading treated this as forced,
  on the ground that removal alone deletes chunked frontline review with no configuration restoring it and leaves a
  chunked frontline request resolving `unavailable` / `stop`. **Rejected on both halves.** The stop is answered by
  `D2.2`'s skip arm, which converts it into a typed decline — so the objection's consequence no longer follows. And the
  grant is not bounded: the local path builds a requirement record whose `kind` is a literal inside two canonical
  digests, and whose obligation vocabulary is disjoint from the frontline lane's, so the grant requires authoring a
  record type nobody has designed. Taking it would have absorbed unsettled design into a work unit already flagged for
  sizing, to restore a capability that was never delivered.
- **Delete the guidance blocks outright** (`D3`). Rejected — they are the only channel carrying ARC's exact-scope and
  clean-result contract to a hosted reviewer, which is the half a provider genuinely cannot infer.
- **Regenerate both static copies from the typed projection** (`D3`). Rejected — that restores the generator
  right-sizing deliberately deleted, to maintain roughly four lines of content.
- **Restore the deleted admission machinery** to re-establish carrier authority. Rejected — right-sizing removed it
  deliberately as disproportionate, and the local carrier now injects a runtime-owned rubric binding rather than asking
  an evaluator to transcribe evidence-grade identities. Scoped precisely: this holds on the local path only, which is
  what makes the static carriers load-bearing rather than redundant.
- **Document the request shapes in prose** where the workflows already reference the verbs (`D4`). Cheaper and lands
  where the reader already is — rejected: prose drifts from the schemas by construction, and the drift is what
  reproduces the defect rather than fixing it.
- **Point the workflows at the shipped schema bundle instead of adding a flag** (`D4`). Rejected as an alternative and
  adopted as the substrate: the bundle already ships but is keyed by schema identity inside the installed package, so
  using it directly means a workflow naming an install path that varies by package manager and a caller mapping its verb
  onto an id.
- **Ship the flag over a hand-maintained verb-to-schema table** (`D4`). Rejected — it re-describes an association the
  schema registry exists to hold, which is `D8`'s defect at smaller scale.
- **A new emitting verb for the obligation projection, or for the composed review target** (`D4.4`). Rejected — an
  emitting verb leaves the hand-authored path open beside it, so a fabricated projection or `targetId` stays as easy
  as today; deriving from caller-held facts removes the path instead of documenting around it. **Extending the
  `frontline resolve` envelope** was likewise rejected: it would have a standard-lane caller invoking a
  frontline-named verb, coupling the lanes at the CLI surface.
- **Requiring the primary to verify every `withstood` entry** (`D5`). Rejected — defeats delegation; `withstood` is by
  design the larger list. **Splitting the schema into citation-checked versus inference-checked**, or **requiring the
  reviewer to declare which check it performed**: both ask an untrusted evaluator to attest its own rigor.
  **Scoping the obligation to entries the primary will relay**: the observed failure _was_ relaying on the strength of
  the label, so the trigger is unreliable. **Deleting the field**: discards real coverage signal to fix a wording gap.
- **A second driver call after triage** (`D6.4`). Rejected — it works only if the caller knows not to advance its own
  pass count between the two calls, an ordering rule the driver cannot enforce, added to fix an ordering problem.
- **Shipping a caller-computed confirmed-severity scalar on the hosted lane only** (`D6.4`). The smallest change, and
  rejected twice over: the detached scalar discards the approved set's bindings, and it reproduces this work unit's
  own thesis — a correct convergence rule reachable at one decision point and not at the other two.
- **Feed bare approved disposition sets to the driver** (`D6.3`). Rejected — approval and current-target validation
  do not establish which review result the set covers or that every result finding is present. Reuse the existing
  source-bound approved disposition record so an earlier same-target set or an omitted chunk cannot produce false
  convergence.
- **A `Class`-threshold key on `adversarial-review`** (`D7.2`). Rejected — it contradicts the method's identity contract
  (the caller owns launch policy), gates unrelated activities through one knob, and constrains a mechanism built to be
  reused.
- **Split the adjacent surfaces (`D4`, `D5`) into their own work units.** Rejected — both are small once settled;
  `D5` carries an independent-ship escape hatch, and `D4`'s discoverability and derivability halves must ship together.
  Distinct from the decomposition that did fire, which cut on subject orthogonality rather than size.
- **A durable multidimensional review-budget ledger** — logical passes, evaluator invocations, and token budget
  accumulated across a work unit's whole integration lineage. Proposed from a sibling work unit's integration, where
  four review waves and eighteen evaluator invocations ran without an effective bound. **Rejected as disproportionate to
  its own evidence:** roughly three quarters of the measured raw cost came from implementation workers inheriting full
  conversation history — a spawn default, not an accounting failure — and the caps that should have bounded the rest
  already exist and are already wired to an approval interlock; they went unenforced because the request that reaches
  them cannot be composed. Building an accounting mechanism first would elaborately measure a cost that mostly
  evaporates once the spawn default and the composability gap are fixed. The proportionate response is `D4.4`, `D6.2`,
  and a bounded spawn context — none of which is new machinery.

## Cross-cutting Considerations

**Trust boundaries.** `D1`'s provenance separation is the design's central safety property: the override never touches
`attempts`, so no operator input can manufacture an observed outcome. `D6.3` likewise derives its control-bearing
summary from source-bound approved disposition records whose producing boundary compared the complete result
one-for-one, instead of accepting either a detached scalar or an unbound approved set. `D8` moves third-party facts out
of core but adds no code-loading surface — adapters remain first-party, and the trust boundary around supplying one is
`review-adapter-extensibility`'s explicitly. `D4.4` narrows a trust boundary by removing a fabricable input rather than
widening one.

**Contract evolution.** The pre-public-release posture applies uniformly:

- `D6.1` changes every registered root, wire record, command envelope, digest preimage, fixture, generated schema, and
  methodology occurrence in the severity acceptance graph together, while existing version and domain identifiers
  remain the current baseline. There is no compatibility alias or migration path; development-only old records are
  cleared or regenerated.
- `D6.3` requires `reviewOperationIds` on findings attempts and resolves the referenced records from the existing
  durable store; the caller supplies neither record bodies nor derived severity. The derived count and maximum are
  internal normalized state, not new caller-controlled wire fields. The existing approved disposition source union
  gains the hosted-result variant in place.
- `D4.4` replaces `standardReview` with required `routingFacts` and removes caller-supplied `targetId` from the two
  target-taking request shapes. All repository-owned callers and fixtures move in the same change; no transitional
  reader or dual-input contract remains.
- `D4.5`'s rename touches a type name rather than a wire shape and changes repository references in place.
- `D2.1`'s capability narrowing means a project configuring `coderabbit-cli` with chunked frontline scope now skips
  rather than runs. That is the intended effect and is legible through the typed `source-scope-ineligible` diagnostic.
  No project loses a working capability, because the chunked path never reached the provider.

**Testing.** Existing coverage in `__tests__/unit/scripts/review-gate/policy/review-policy-driver.test.ts` already
exercises the safe-fallback rule (rate-limited attempts, `safe-fallback-exhausted`), so no characterization test is owed
before `D1` starts; the effective-order change needs its own cases, including the motivating one — configured order
`coderabbit-pr, codex-pr, delegated-agent`, `codex-pr` promoted, then falling through to `coderabbit-pr`, which must
validate under the effective order and would have failed under the configured one. A second-call case repeats that
same override with the first source already in attempt history and proves it remains valid without reselecting the
source. `D6.1` needs acceptance and rejection cases for `critical` and severity-position `blocker`, plus a generated
schema and non-severity-occurrence preservation check. `D6.3` needs command-boundary cases for an all-refuted record,
minors only, material findings, stale target/policy/rubric bindings, a missing or duplicate operation id, wrong source
or operation, an incomplete result binding, and a chunked terminal pass whose maximum spans multiple approved records.
Hosted coverage proves its result digest and exact finding comparison reject an unrelated or incomplete set; reducer
tests receive only the derived summary. `D7.3` proves audit config domains follow `auditActivities`, not `nextAction`.
`D8.3` preserves the fallback resolver's `unknown-pr` → `invalid-source-list` case after hosted ids become lexical.
`D4.3`'s completeness test is the anchor that keeps the registration set honest as verbs are added. `D3.2`'s parity
check runs in the `lint:arc:*` family and is required in CI alongside the rest of that family.

**Performance.** One narrow observation is worth taking after `D3.1` lands: whether a trimmed-guidance whole-target
hosted review still times out at the ~10.8k-line scale that failed on PR #354. A single observation, not an experiment,
and on no design unit's critical path.

**Sequencing and rollout.** `D6.1` rewrites the unpublished baseline and clears or regenerates development-only old
records. It sequences first so no later diff carries the rename. `D8` precedes `D2` so the capability table is edited
once, in its relocated home, and `D7.3` follows `D8` because it queries those declarations. `D2.1` and `D2.2` land
together — the removal without the skip arm turns a chunked frontline request into a halt. `D4.1`, `D4.2`, and `D4.4`
ship together, and **`D4` sequences last**: it is the unit most exposed if the review gate's request contracts are later
reduced, nothing else depends on it, so ordering it last costs nothing and preserves the option. `D4.5` may follow
separately. `D3` and `D5` are independent and may land at any point, and `D5` retains an independent-ship escape hatch
as an errand if the provider-protocol work runs long.

**Coordination.** `integrate-work-unit.md` is edited in three places by this work unit — `D6.4`'s reorder at the lane
dispatch and the hosted findings arm, and `D7.1`'s statement at the review-applicability step — while
`integration-boundary-accuracy` rewrites the final merge step. Different regions, so neither blocks the other; if both
run concurrently, sequence the edits rather than merging blind. `chunk-scope-binding` receives `D2.3`'s handoff, now
including the frontline-obligation question.
`judgment-authority-model`, `execution-delegation-doctrine`, `review-checkout-lifecycle`, and
`review-adapter-extensibility` are coordination-only, with no dependency edge recorded.

## Success Criteria

1. An operator expresses a one-run source preference through `arc review resolve` and it is honored, including the
   promote-then-fall-through case that the configured-order invariant would have rejected; no override path can add an
   entry to the observed attempt history, repeating the pass-level override after a fallback remains valid without
   reselecting an attempted source, and deselecting every source yields a typed stop that names the operator as the
   cause rather than reporting provider unavailability.
2. `coderabbit-cli` no longer advertises `chunked`, and a chunked frontline request — which consequently has no
   eligible source — resolves `skipped` carrying a `source-scope-ineligible` diagnostic rather than halting
   integration. A mixed diagnostic set containing `unknown-source` never takes that skip. Whole-target frontline
   review through `coderabbit-cli` still runs, and the restoration condition plus the frontline-obligation question
   are recorded for `chunk-scope-binding`.
3. Both static guidance blocks carry the same four items and no `Rubric:` line; `lint:arc:review-guidance` fails when
   they diverge or when the typed coverage, clean-rule, or evaluator-boundary fields stop matching, and states in its
   own output that item 4 alone is unbacked.
4. `arc review <verb> --schema` prints a registered JSON Schema for each of the fourteen request-file verbs, and a verb
   added without a registered schema at its derived id fails the build. No review request requires a field its caller
   cannot produce: `arc review resolve` accepts the five judgment facts and derives, echoes, and never _requires_ a
   hand-authored obligation projection without acquiring an evaluator identity, and the target-taking verbs compute
   `targetId` from caller-held fields rather than demanding the digest. No workflow or test composes a projection or a
   `targetId` by hand. The old `standardReview` and caller-supplied `targetId` inputs are not retained as compatibility
   paths. The two `ReviewTargetSchema` definitions no longer share a name.
5. `adversarial-review.md` states what reporting a `withstood` entry means and what it does not license, bounds the
   field to decision-relevant coverage, and states the primary-side risk gradient by claim type.
6. `critical` names the review severity across the review-gate source and the methodology corpus, with the meta
   impediment field, `GateBlocker` / `GateVerdict.blockers`, the work-unit impediment sense in workflow prose, and the
   `blocked` resolution state provably untouched. The unpublished strict-current baseline changes in place without
   compatibility aliases or version advancement. The exit gate and convergence are stated as two rules; and a pass
   whose triage-confirmed findings top out at `minor` resolves `pass-complete` on every lane, with each lane's driver
   call sited between triage and response. The findings-bearing pass-closing attempt references exact source-bound
   review operation ids, and the command derives confirmed count and maximum severity from the validated,
   current-target records — including `null` for an all-refuted pass — while accepting no caller-computed severity
   scalar or unbound disposition set.
7. A project that has not set `review.planning_audit` / `review.verification_audit` is never offered a planning or
   verification pass; valid evaluator domains derive from the registrations' explicit audit activities, and naming a
   provider that declares no matching activity is a typed validation error. The verification fire-point fires without
   another permission turn when its configured evaluator and declared workflow fire-point coincide, while the planning
   fire-points still converge with the developer first. Configuration alone authorizes no spawn, every dispatch is
   bounded and read-only, and `integrate-work-unit.md` states the stop discipline the shipped spec defined.
8. Each third-party provider's lanes, scopes, pull-request dependence, and dispatch action live beside its adapter, and
   every source id has exactly one production declaration in its owning registration. Every finite provider domain and
   capability decision derives from the composed registrations: the config and hosted-request schemas accept a
   well-formed registry id, and their command boundaries validate membership and lane compatibility from the injected
   sets rather than restating provider lists. Hosted fallback validates membership against that same set before
   dispatch and preserves its typed unknown-provider result. The driver _and its request schema_ resolve against an
   injected capability set assembled at a named seam; the registration contract validates through the shipped schema
   bundle; and an unregistered source still fails safe as `unknown-source`.

## Open Questions

No design or migration question is open — every decision the draft reopened is settled above, including the two the
draft carried into this stage (the obligation projection's producing surface, resolved to `arc review resolve`
accepting routing facts; and the registered request shapes' identity convention, resolved to command-path-derived ids,
which the one already-registered shape turns out to follow, so nothing needs renaming).

---
