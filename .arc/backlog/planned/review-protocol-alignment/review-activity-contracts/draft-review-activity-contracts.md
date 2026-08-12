# Draft: review-activity-contracts

- **Origin:** [internal]
- **Cohort:** `review-protocol-alignment`
- **Purpose:** Keep hosted-review guidance at its contract floor and make planning and verification audit dispatch
  explicit, typed, and bounded.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Consider per-WU scope-boundary awareness for hosted reviewers**

- _Routed from:_ `USER-INBOX § Work Unit` (resolved `WU_Target: review-activity-contracts`), housekeep drain
  (2026-08-10).
- _Concern:_ hosted reviewers cannot see a WU's Non-Goals through the current static guidance surface. During the
  guidance redesign, evaluate supplying the governing spec's scope boundary and requiring scope-crossing findings
  to ground why adequacy requires the crossing; primary triage remains the backstop.

### `[ ]` **Right-size review activity around disclosed agent judgment**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain
  (2026-07-27); captured during `decompose-roadmap-supersession` Errand closeout and
  `review-protocol-alignment` decomposition (2026-07-26).
- _Concern:_ Integrating a tiny Errand took ~40 minutes of protocol over implementation — pre-PR source
  selection error, unused local operation, disproportionate hosted-finding disposition construction,
  undocumented settlement identity representation, blindness to CodeRabbit's edited incremental-clean
  signal, unnecessary repeat-review after a non-interacting test-only delta, and confusion between posting
  a request artifact and a provider actually running a review. Machinery intended to streamline review
  created additional failure modes.
- _Governing constraint:_ ARC must not prevent an agent from applying ordinary, disclosed common-sense
  judgment. Mechanization should enforce genuine authority and bias boundaries, automate deterministic
  work, and make evidence dependable — not elevate procedural state over clear source evidence.
- _Fold-in:_ re-audit every review activity, stop, re-trigger, and adapter wait by concrete risk guarded;
  prefer typed automation; admit disclosed judgment where evidence already serves a default's purpose;
  retain hard stops for bias-guarding independence, mutation approval, and exact-head merge authority.
  Coordinate rule-yield / override with `judgment-authority-model`. Use the tiny-Errand path as a friction
  regression scenario.

### `[ ]` **Enforce visible adversarial-review pass caps in automatic audit dispatch**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain
  (2026-07-27); captured during `review-signal-convergence` draft closeout.
- _Concern:_ automatic planning/verification audit can dispatch `adversarial-review` without making the
  current pass count and exhaustion state visible — agents continue past the cap without noticing authority
  ended. `review-signal-convergence` D6.2 settles the rule: every result reports `Pass N of M`, `N == M`
  stops before another evaluator invocation, a recommendation never authorizes continuation.
- _Fold-in:_ apply that rule to every configured automatic planning and verification audit fire-point;
  make `cap-exhausted` terminal; require explicit approval naming activity and next pass for exactly one
  additional invocation; keep the cap out of evaluator context while making it explicit in primary control
  flow and the operator-facing report.

### `[ ]` **Bound and disclose read-only scouts inside review activities**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain
  (2026-07-27); captured during `review-signal-convergence` adversarial spec review Pass 2.
- _Concern:_ a standard non-partitioned adversarial pass spawned two read-only helper scouts without the
  invocation contract stating whether scouts were permitted or bounded — so `Pass N of M` conceals actual
  evaluator-call cost.
- _Fold-in:_ let an activity contract authorize a small bounded scout set without counting each scout as
  another logical pass. Default: at most two low-effort, fresh-context, read-only scouts with distinct
  source loci; scouts return facts not findings/verdicts; report `Pass N of M` with actual reviewer/scout
  call count. Fan-out beyond the declared bound requires explicit approval.

### `[ ]` **Recognize CodeRabbit's edited incremental-clean signal**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain
  (2026-07-27); captured during `decompose-roadmap-supersession` Errand integration.
- _Concern:_ after an incremental CodeRabbit review found no new issues, CodeRabbit edited its pre-existing
  walkthrough comment (`No actionable comments were generated…`, `updatedAt` past the request) rather than
  creating a new PR review — so `arc review hosted await` stayed `pending` forever.
- _Fold-in:_ model CodeRabbit's authenticated summary-edit completion shape as a provider-specific clean
  observation. Correlate bot/app identity, request time, exact head, summary comment identity and
  `updatedAt`, and the provider's stable clean marker. Cover both new-review completion and edited-summary
  incremental completion.

### `[ ]` **Derive hosted settlement actor identity inside the adapter**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain
  (2026-07-27); captured during `decompose-roadmap-supersession` Errand integration.
- _Concern:_ `review hosted settle` exposes freeform `actorIdentity`, but the GitHub adapter compares it to
  the authenticated account's numeric database ID rather than login — supplying `andrewRCr` produced
  `actor-mismatch` until the numeric ID was discovered by source inspection.
- _Fold-in:_ derive the settlement actor inside the trusted adapter rather than requiring the caller to echo
  an undocumented provider-specific identity representation. Preserve exact actor and current-target
  validation.

---

## Hosted Guidance Contract

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

## Audit Activity Control

**D7.1 — Carry the stop discipline into the workflow.** The choreography already matches its design intent: human stops
track authority rather than every judgment, final dispositions and release coincide in one structured gate when nothing
earlier needs approval, exceeding a pass ceiling is a third stop by exception, and ordinary agent judgments do not
create permission turns. Counting `integrate-work-unit.md`'s own stop-class callouts confirms the shape. But that
statement lives only in a completed work unit's archived spec, which the agent running integration never loads. State it
in `integrate-work-unit.md`, where the decision is made. State the dual explicitly too: protocol state may bind or
invalidate evidence, but it does not replace the workflow's disclosed review-applicability judgment with mandatory
activity.

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
- **Integration has no standalone offer fire-point, but it remains in scope for proportional activity control.** Source
  lists opt the lanes into review spend; they do not decide whether a moved target needs a repeated complete pass, a
  focused supplemental pass, or only targeted verification. That remains the workflow's review-applicability judgment.
  Exact-head movement invalidates SHA-bound evidence and merge authority; it does not by itself invalidate the
  applicability of prior complete coverage. A request artifact proves delivery only, not that a provider accepted,
  started, or completed work, so no wait may be justified from delivery state alone.

**D7.5 — The planning-stage surface is a convergence check, not a spawn authorization form.** What is approved is that
_the stage is complete_; that agreement supplies the intent the artifact cannot show. Once supplied, the now-current
fire-point plus the configured evaluator explicitly activates the individual pass — not as standing consent and not as
a second decision. So the surface is one conversational question — this stage looks done, is there anything to raise
before it is attacked — never an enumeration of pass counts, rubrics, and evaluator conditions.

**What each surface owns after the change:** the `*_sources` and `*_audit` keys select whether an activity is enabled
and which evaluator serves it; the current declared workflow fire-point activates each individual invocation; `Class`
keeps only recommendation posture and pass cap, no longer doubling as an on/off switch; and the stage-completion stop
is untouched, being an input channel rather than a spend decision.

**D7.6 — Keep a tiny-Errand proportionality regression.** The `decompose-roadmap-supersession` integration is the
counterexample this design must make impossible: a small change with complete hosted coverage, one approved fix, clean
focused verification, and a later non-interacting test-only adjustment spent roughly forty minutes in review protocol
before merge. The path created an unused local operation, required caller-side internal record construction, waited on
an edited-summary signal the adapter could not observe, requested an unnecessary repeat review, and then treated the
posted request as work in progress.

The regression is behavioral, not a wall-clock threshold:

1. the preferred hosted source remains pending until pull-request coordinates exist instead of falling through to an
   unused local operation;
2. public verbs own any record construction needed for hosted response and settlement;
3. provider observation distinguishes delivery from accepted, running, and terminal activity, including an edited
   incremental-clean signal;
4. a narrow, demonstrably non-interacting target delta carries prior complete coverage through targeted verification
   without another provider request; and
5. the integration surface expands only unclean or decision-bearing facts while exact-head merge authority remains
   fail-closed.

The general rule-yield and runtime-override model remains `judgment-authority-model`'s. This unit consumes its governing
constraint — disclosed common-sense judgment stays available unless a genuine authority or bias boundary forbids it —
and owns the review-activity mechanics that must not obstruct that judgment.

---
