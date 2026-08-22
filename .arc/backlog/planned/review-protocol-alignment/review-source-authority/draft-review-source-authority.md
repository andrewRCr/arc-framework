# Draft: review-source-authority

- **Origin:** [internal]
- **Cohort:** `review-protocol-alignment`
- **Purpose:** Make operator selection and provider capabilities authoritative at their owning boundaries, with
  unsupported scope removed rather than advertised.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Make Owner-accepted termini settle hosted review blockers**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-source-authority`), housekeep drain (2026-08-22).
- _Concern:_ ARC can record an exact-target Owner-accepted terminus while the hosted provider's native review state
  still blocks the host, forcing another metered pass or a second authority request after the Owner has already
  accepted the residual review risk.
- _Fold-in:_ make hosted authority universally moot after a valid Owner-accepted terminus, without binding the
  behavior to one provider. Authorize and record the host's standard override or dismissal for the exact target,
  preserve Owner acceptance as distinct from provider clean, and avoid another authority stop before the existing
  exact-head integration approval.

### `[ ]` **Remove the pre-PR ordered-reservation item now owned by the shipped integration design**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-source-authority`), housekeep drain (2026-08-20).
- _Concern:_ this draft's pending ordered-reservation item duplicated the fix owned by
  `integration-boundary-accuracy`. Drop it or reduce it to a landed-contract revalidation pointer instead of
  re-deriving the behavior beside this WU's one-run source-override design.

### `[ ]` **Census the hosted record family against native authorities and standards**

- _Routed from:_ three `USER-INBOX § Work Unit` captures, housekeep drain (2026-08-20).
- _Concern:_ fix tokens, applicability proofs, lifecycle-tail digests, forward receipts, and a composed PR-body
  review ledger may duplicate Git, host review, or interlock evidence. The hosted settlement composer also exposes
  a dead executable channel with no production caller.
- _Precedent input:_ use SARIF/code-scanning disposition vocabulary instead of inventing another hosted finding
  standard; treat gittuf's signed reference-state log as the long-horizon precedent for portable local-review
  evidence; account for PR-body collisions with bots that regenerate summaries on every push.
- _Fold-in:_ test every record and composer against the failure it uniquely witnesses, retain the local lane's only
  evidence chain, and retire hosted records or dead capabilities that merely shadow another authority.

### `[ ]` **Preserve hosted-source priority while PR coordinates are pending**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-source-authority`), housekeep drain
  (2026-07-27); captured during `decompose-roadmap-supersession` Errand integration.
- _Concern:_ pre-PR standard-review resolution with configured order `coderabbit-pr`, `codex-pr`,
  `delegated-agent` marked both hosted sources ineligible for lacking PR coordinates, then selected the later
  local source. Source order currently means "first usable now", not "first preferred source whose
  prerequisites should be satisfied" — starting local preparation before PR creation despite hosted providers
  configured ahead.
- _Fold-in:_ distinguish a preferred source awaiting its carrier coordinates from an unavailable or failed
  source. Pre-PR resolution should request the change-request prerequisite when the leading unattempted source
  requires it; only an authoritative safe failure should advance to the next configured source. Cover the mixed
  hosted-plus-local pre-PR case, not only hosted-only configurations.

---

## Operator Selection Override

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

## Capability Re-cut

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

## Provider-owned Capabilities

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

---
